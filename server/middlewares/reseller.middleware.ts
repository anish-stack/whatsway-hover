/**
 * Reseller portal guard. Re-reads the reseller profile and user status
 * from the DB on every request, so suspension/archival takes effect
 * immediately even for already-logged-in sessions.
 */
import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { resellerProfiles, users } from "@shared/schema";

export async function requireReseller(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionUser = (req as any).session?.user;
    if (!sessionUser) return res.status(401).json({ error: "Authentication required" });
    if (sessionUser.role !== "reseller") return res.status(403).json({ error: "Reseller access only" });
    const [row] = await db
      .select({ profile: resellerProfiles, userStatus: users.status })
      .from(resellerProfiles)
      .innerJoin(users, eq(users.id, resellerProfiles.userId))
      .where(eq(resellerProfiles.userId, sessionUser.id));
    if (!row) return res.status(403).json({ error: "Reseller profile not found" });
    if (row.profile.status !== "active" || row.userStatus !== "active") {
      return res.status(403).json({ error: `Reseller account is ${row.profile.status}. Contact HoverChat.`, code: "RESELLER_INACTIVE" });
    }
    (req as any).user = sessionUser;
    (req as any).reseller = row.profile;
    next();
  } catch (e) {
    next(e);
  }
}
