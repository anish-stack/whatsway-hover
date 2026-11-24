/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * Original Author: BTPL Engineering Team
 * Website: https://hoverbusinessservices.com
 * Contact: info@hovermedia.in
 *
  
 *
  
 * ============================================================
 */

import { Request, Response, Router } from "express";
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import { db } from "../db";
import { users, userActivityLogs } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { validateRequest } from "../middlewares/validateRequest.middleware";
import { resolveUserPermissions } from "server/utils/role-permissions";
import country from "../config/country.json"
import { sendOTPEmail } from "../services/email.service"
import { otpVerifications } from "@shared/schema";
import { createUser } from "../controllers/user.controller";


const router = Router();

// Public self-signup. Delegates to the shared createUser controller, which
// forces role="admin" regardless of the request body. CSRF middleware
// already whitelists this path. Mirrors the previous (auth-protected)
// /api/users/create handler so an unauthenticated visitor can register.
router.post("/signup", createUser);

// Resend the verification email from the login / verify-email screens.
//  - normal sign-ups: new 6-digit OTP → /verify-email
//  - accounts created by a reseller or super admin (no password yet): new set-password link
// Same reply whether or not the account exists, so it can't be used to probe emails.
const resendHits = new Map<string, number[]>();
function resendAllowed(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const hits = (resendHits.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { resendHits.set(key, hits); return false; }
  hits.push(now); resendHits.set(key, hits);
  if (resendHits.size > 5000) for (const [k, v] of resendHits) if (!v.some((t) => now - t < windowMs)) resendHits.delete(k);
  return true;
}

router.post("/resend-verification", async (req, res) => {
  const id = String(req.body?.email || req.body?.username || "").trim().toLowerCase().slice(0, 200);
  if (!id) return res.status(400).json({ success: false, error: "Enter your email or username." });
  const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
  if (!resendAllowed(`id:${id}`, 3, 10 * 60_000) || !resendAllowed(`ip:${ip}`, 10, 10 * 60_000)) {
    return res.status(429).json({ success: false, error: "Too many requests. Please wait a few minutes and try again." });
  }
  const generic = { success: true, kind: "otp" as "otp" | "invite", message: "We've sent a new 6-digit code to your email." };
  try {
    const [user] = await db.select().from(users)
      .where(sql`lower(${users.username}) = ${id} OR lower(${users.email}) = ${id}`).limit(1);
    if (!user || user.isEmailVerified !== false || !user.email) return res.json({ ...generic, email: id.includes("@") ? id : undefined });

    if (String(user.password || "").startsWith("!invite:")) {
      // created for them (reseller customer / reseller): they verify by setting a password
      const { issueToken, sendInviteEmail } = await import("../services/reseller/invitations.service");
      const { resellerCustomers, resellerProfiles } = await import("@shared/schema");
      const [rp] = await db.select({ id: resellerProfiles.id }).from(resellerProfiles).where(eq(resellerProfiles.userId, user.id)).limit(1);
      const purpose = rp ? "reseller_invite" : "customer_invite";
      let resellerName: string | null = null;
      if (!rp) {
        const [m] = await db.select({ name: resellerProfiles.businessName }).from(resellerCustomers)
          .innerJoin(resellerProfiles, eq(resellerProfiles.id, resellerCustomers.resellerId))
          .where(eq(resellerCustomers.customerUserId, user.id)).limit(1);
        resellerName = m?.name ?? null;
      }
      const token = await issueToken(db, user.id, purpose, null);
      await sendInviteEmail({ to: user.email, name: user.firstName, token, purpose, resellerName });
      return res.json({ success: true, kind: "invite", email: user.email, message: "We've emailed you a link to set your password and activate your account." });
    }

    await db.delete(otpVerifications).where(eq(otpVerifications.userId, user.id));
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await db.insert(otpVerifications).values({ userId: user.id, otpCode, expiresAt: new Date(Date.now() + 10 * 60_000), isUsed: false } as any);
    const { sendOTPEmailVerify } = await import("../services/email.service");
    await sendOTPEmailVerify(user.email, otpCode, user.firstName || "");
    return res.json({ ...generic, email: user.email, message: "We've sent a new 6-digit code to your email." });
  } catch (e) {
    console.error("[auth] resend verification failed:", (e as Error).message);
    return res.status(500).json({ success: false, error: "Couldn't send the email right now. Please try again." });
  }
});

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),

});

// Login endpoint
router.post("/login", validateRequest(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;

    // console.log("Login request body:", req.body);

    // Find user by username
    const results = await db
      .select()
      .from(users)
      .where(eq(users.username, username));

    // Do not log the raw users[] result — rows contain password hashes,
    // fcmToken, and other secrets/PII.

    const user = results[0];

    if (!user) {
      // Do not echo the supplied username in logs — treat as sensitive.
      console.warn("[auth] login attempt failed: user not found");
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // console.log(user.status, "checkk users statuuuuuu")

    // Check if user is active
    if ((user.status || "").trim().toLowerCase() !== "active") {
      return res.status(403).json({ error: "Account is inactive. Please contact administrator." });
    }

    // Check if email is verified
    if (user.isEmailVerified === false) {
      return res.status(403).json({ error: "Email not verified. Please verify your email first.", code: "EMAIL_NOT_VERIFIED" });
    }

    // Ensure password field exists
    if (!user.password) {
      console.error("User has no password in DB:", user.id);
      return res.status(500).json({ error: "User record is invalid. Contact support." });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Update last login
    await db
      .update(users)
      .set({
        lastLogin: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Log activity
    try {
      await db.insert(userActivityLogs).values({
        userId: user.id,
        action: "login",
        entityType: "user",
        entityId: user.id,
        details: JSON.stringify({
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
        }),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
    } catch (logError) {
      console.error("Failed to log login activity:", logError);
    }

    // Store user in session
    if (!(req as any).session) {
      console.error("Session not initialized");
      return res.status(500).json({ error: "Session not initialized" });
    }

    (req as any).session.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      permissions: resolveUserPermissions(user.role, user.permissions as any),
      avatar: user.avatar,
      createdBy: user.createdBy || "",
    };

    // Remove password before sending back
    const { password: _, ...userData } = user;

    res.json({
      message: "Login successful",
      user: userData,
    });
  } catch (error) {
    console.log("Error during login:", error);
    res.status(500).json({ error: "Login failed", message: (error as Error).message });
  }
});





// Logout endpoint
router.post("/logout", (req, res) => {
  const userId = (req as any).session?.user?.id;

  if (userId) {
    // Log activity
    db.insert(userActivityLogs)
      .values({
        userId,
        action: "logout",
        entityType: "user",
        entityId: userId,
        details: {},
      })
      .catch(console.error);
  }

  // Destroy session
  (req as any).session.destroy((err: any) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ error: "Logout failed" });
    }

    res.clearCookie("connect.sid");
    res.json({ message: "Logout successful" });
  });
});

// Get current user
router.get("/me", async (req, res) => {
  // console.log("Fetching current user" , req.session);
  const user = (req as any).session?.user;
  // console.log("Session user:", user);
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  // Get fresh user data
  const [currentUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id));

  if (!currentUser) {
    return res.status(404).json({ error: "User not found" });
  }

  // Remove password from response
  const { password, ...userData } = currentUser;
  res.json(userData);
});

// Check if authenticated (for frontend)
router.get("/check", (req, res) => {
  const user = (req as any).session?.user;
  res.json({ authenticated: !!user, user });
});


router.get("/country-data", (req, res) => {
  res.json(country);
});




// forgot password

router.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Check if user exists
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (!existingUser.length) {
      return res.status(404).json({ error: "Email not registered" });
    }

    const userId = existingUser[0].id;
    const userName = existingUser[0].firstName; // Use DB value

    // Rate limiting: max 3 OTP per 5 min
    const recentOTPs = await db
      .select()
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.userId, userId),
          sql`${otpVerifications.createdAt} > NOW() - INTERVAL '5 minutes'`
        )
      );

    if (recentOTPs.length >= 3) {
      return res.status(429).json({
        error: "Too many requests. Try again in 5 minutes.",
      });
    }

    // Generate 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    // Store OTP in DB
    await db.insert(otpVerifications).values({
      userId,
      otpCode,
      expiresAt,
      isUsed: false,
    });

    // Send OTP via email
    try {
      await sendOTPEmail(email, otpCode, userName);
      console.log(`✉️ OTP sent to ${email} ${otpCode} `);
    } catch (emailError) {
      console.error("⚠️ Failed to send OTP email:", emailError);
    }

    res.json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: error.message || "Failed to process request" });
  }
});




router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword, otpCode } = req.body;

    if (!email || !newPassword || !otpCode) {
      return res.status(400).json({ error: "Email, verification code and new password are required" });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Find user
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!existingUser.length) {
      return res.status(404).json({ error: "Email not registered" });
    }

    const userId = existingUser[0].id;

    // SECURITY: the reset must be backed by an OTP that (a) matches the code
    // the user typed, (b) was verified via /verify-otp, and (c) is recent.
    // Previously any OTP row for the user was accepted without checking the
    // code, which allowed account takeover.
    const otpRecord = await db
      .select()
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.userId, userId),
          eq(otpVerifications.otpCode, String(otpCode)),
          eq(otpVerifications.isUsed, true),
          sql`${otpVerifications.createdAt} > NOW() - INTERVAL '15 minutes'`
        )
      )
      .limit(1);

    if (!otpRecord.length) {
      return res.status(400).json({ error: "Invalid or expired verification code. Request a new code." });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db
      .update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, userId));

    // Delete the OTP record after successful password reset
    await db
      .delete(otpVerifications)
      .where(eq(otpVerifications.id, otpRecord[0].id));

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error: any) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: error.message || "Failed to reset password" });
  }
});




router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otpCode } = req.body;
    // Do not log req.body — it carries the OTP code and email.

    if (!email || !otpCode) {
      return res.status(400).json({ error: "Email and OTP are required" });
    }

    // Find user
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Do not log the full user row — contains password hash and PII.

    if (!existingUser.length) {
      return res.status(404).json({ error: "Email not registered" });
    }

    const userId = existingUser[0].id;

    // Find valid OTP
    const otpRecord = await db
      .select()
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.userId, userId),
          eq(otpVerifications.otpCode, otpCode.toString()),
          eq(otpVerifications.isUsed, false),
          // sql`${otpVerifications.expiresAt} > timezone('UTC', now())`

        )
      )
      .limit(1);

    // Do not log OTP records — they contain the OTP code itself.

    if (!otpRecord.length) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // OTP valid => mark as used
    await db
      .update(otpVerifications)
      // keep the verified row alive long enough to complete /reset-password
      .set({ isUsed: true, expiresAt: new Date(Date.now() + 10 * 60 * 1000) })
      .where(eq(otpVerifications.id, otpRecord[0].id));

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (error: any) {
    console.error("OTP verification error:", error);
    res.status(500).json({ error: error.message || "Failed to verify OTP" });
  }
});


setInterval(async () => {
  try {
    await db.delete(otpVerifications).where(
      sql`${otpVerifications.expiresAt} < timezone('UTC', now())`
    );
  } catch (error) {
    console.error('[OTP Cleanup] Error:', error);
  }
}, 5 * 60 * 1000);



export default router;