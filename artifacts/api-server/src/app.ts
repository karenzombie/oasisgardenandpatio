import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { buildSessionMiddleware } from "./lib/session";

const app: Express = express();

app.set("trust proxy", 1);

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

app.use("/api", router);

export default app;
