import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildSessionMiddleware } from "./lib/session";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.set("trust proxy", 1);
app.disable("etag");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Clerk proxy must be mounted BEFORE body parsers — it streams raw bytes
// to Clerk's frontend API. The proxy path is /api/__clerk.
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ origin: true, credentials: true }));
// Use a generous JSON body limit. CSV product imports send the whole sheet as
// JSON (`{ csvText, mapping }`); real vendor exports can easily be a few MB.
// Auth-gated routes mean this is not a public DoS surface.
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Append the `Partitioned` attribute to any `SameSite=None; Secure` cookie
// (i.e. our session cookie) so that Chrome's third-party-cookie phase-out
// (CHIPS) still allows the cookie to be stored and resent. This is required
// both in the Replit workspace canvas preview (where the artifact loads
// inside a cross-site iframe) AND on the published production site: modern
// Chrome treats a `SameSite=None` cookie WITHOUT `Partitioned` as a legacy
// third-party cookie and refuses to store/resend it, so login succeeds
// server-side but the session cookie is silently dropped on the next request
// (the "log in, blink, back to the login page" symptom).
//
// This attribute MUST be applied in production too. A previous attempt gated
// it to non-production on the theory that Partitioned cookies were being
// evicted more aggressively in prod — but that gating took prod cookies back
// to plain `SameSite=None`, which Chrome then dropped entirely, breaking ALL
// staff and customer logins. Partitioned is the correct, browser-supported
// way to keep the cookie working across every context, so we apply it
// everywhere.
app.use((_req, res, next) => {
  const origWriteHead = res.writeHead.bind(res) as (
    ...args: unknown[]
  ) => typeof res;
  (res as unknown as { writeHead: (...args: unknown[]) => typeof res }).writeHead =
    function patchedWriteHead(...args: unknown[]): typeof res {
      const existing = res.getHeader("set-cookie");
      if (existing) {
        const cookies = Array.isArray(existing)
          ? existing
          : [String(existing)];
        const patched = cookies.map((c) =>
          typeof c === "string"
          && /;\s*samesite=none/i.test(c)
          && /;\s*secure/i.test(c)
          && !/;\s*partitioned/i.test(c)
            ? `${c}; Partitioned`
            : c,
        );
        res.setHeader("set-cookie", patched);
      }
      return origWriteHead(...args);
    };
  next();
});

app.use(buildSessionMiddleware());

// Attach Clerk auth context (Authorization header / __session cookie) to
// every request. Routes that opt in read it via getAuth(req).
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env["CLERK_PUBLISHABLE_KEY"],
    ),
  })),
);

app.use("/api", router);

export default app;
