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
// (CHIPS) still allows the cookie to be stored and resent when the app is
// embedded in a cross-site iframe — notably the Replit workspace canvas
// preview, where the artifact is loaded inside an iframe whose top-level
// document is on a different origin. Without this, login succeeds but the
// session cookie is silently dropped by the browser on subsequent requests.
//
// This is ONLY needed in that dev/preview iframe scenario. On the published
// production site the app is visited directly (no cross-site iframe), so the
// cookie doesn't need to be partitioned at all. Partitioned cookies are
// subject to stricter, less predictable browser storage/eviction rules than
// regular first-party cookies — applying the attribute unnecessarily in
// production was causing staff sessions to be intermittently/randomly
// dropped (most noticeable after the tab or autoscale deployment had been
// idle), forcing an unexpected re-login. So we gate this patch to
// non-production only.
if (process.env["NODE_ENV"] !== "production") {
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
}

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
