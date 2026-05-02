import rateLimit, { ipKeyGenerator } from "express-rate-limit";

function jsonErrorHandler(_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  res.status(429).json({
    error: "Too many requests. Please wait a few minutes and try again.",
  });
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: jsonErrorHandler,
});

export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = (req.body as { email?: unknown })?.email;
    const emailKey =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    return `${ipKeyGenerator(req.ip ?? "")}:${emailKey}`;
  },
  handler: jsonErrorHandler,
});

export const twoFactorRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const pending = req.session?.pendingStaffUserId;
    return pending ? `pending:${pending}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  handler: jsonErrorHandler,
});

export const resendVerificationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = req.session?.userId;
    return userId ? `user:${userId}` : `ip:${ipKeyGenerator(req.ip ?? "")}`;
  },
  handler: jsonErrorHandler,
});
