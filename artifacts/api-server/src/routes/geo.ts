import { Router } from "express";
import type { Request, Response } from "express";
import { getRequestCountry, US_ONLY_MESSAGE } from "../lib/geo";

const router: Router = Router();

router.get("/geo/check", (req: Request, res: Response): void => {
  const country = getRequestCountry(req);
  const isUS = country === "US" || country === null;
  res.json({
    country,
    isUS,
    message: isUS ? null : US_ONLY_MESSAGE,
  });
});

export default router;
