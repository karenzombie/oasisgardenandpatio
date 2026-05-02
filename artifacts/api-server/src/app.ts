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
app.use(buildSessionMiddleware());

app.use("/api", router);

export default app;
