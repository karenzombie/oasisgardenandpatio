import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId))
    .limit(1);

  if (!user || !user.isActive) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = user;
  next();
};

// Populates req.user when a valid, active session exists, but never rejects.
// Used by endpoints that serve both guests and signed-in users (e.g. the
// wishlist, where guests are identified by a device token instead).
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  if (!req.session.userId) {
    next();
    return;
  }
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId))
    .limit(1);
  if (user && user.isActive) {
    req.user = user;
  }
  next();
};

export function requireRole(...roles: Array<"customer" | "agent" | "admin">): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(req.user.role as "customer" | "agent" | "admin")) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
