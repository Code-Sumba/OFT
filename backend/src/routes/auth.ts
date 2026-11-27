import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Config } from "../config.js";
import type { Db } from "../db.js";
import { conflict, forbidden, ok, unauthorized } from "../lib/http.js";
import { SELF_REGISTER_ROLES } from "../lib/roles.js";
import { AUTH_COOKIE, requireAuth, signToken } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { createUser, findUserByEmail, toPublicUser } from "../repositories/users.js";

const BCRYPT_ROUNDS = 10;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72), // bcrypt ignores bytes past 72
  role: z.enum(SELF_REGISTER_ROLES),
  organisation: z.string().trim().max(150).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(72),
});

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync("timing-safe-placeholder", BCRYPT_ROUNDS);

export function authRouter(db: Db, config: Config): Router {
  const router = Router();
  const limitOptions = {
    standardHeaders: "draft-7" as const,
    legacyHeaders: false,
    message: { success: false, error: "Too many attempts, please try again later" },
  };
  // Only failed logins count, so many people signing in from one office network are not locked out.
  const loginLimiter = rateLimit({
    ...limitOptions,
    windowMs: 15 * 60 * 1000,
    limit: config.LOGIN_RATE_LIMIT,
    skipSuccessfulRequests: true,
  });
  const registerLimiter = rateLimit({ ...limitOptions, windowMs: 60 * 60 * 1000, limit: config.REGISTER_RATE_LIMIT });

  router.post("/register", registerLimiter, async (req, res) => {
    const body = parse(registerSchema, req.body);
    if (await findUserByEmail(db, body.email)) throw conflict("An account with this email already exists");

    const user = await createUser(db, {
      name: body.name,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, BCRYPT_ROUNDS),
      role: body.role,
      organisation: body.organisation,
    });
    ok(res, { user, message: "Registration received. An admin must approve your account before you can log in." }, 201);
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const body = parse(loginSchema, req.body);
    const row = await findUserByEmail(db, body.email);
    const valid = await bcrypt.compare(body.password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !valid) throw unauthorized("Invalid email or password");
    if (row.status === "pending") throw forbidden("Your account is awaiting admin approval");
    if (row.status === "blocked") throw forbidden("Your account has been blocked");

    const token = signToken(row, config.JWT_SECRET, config.JWT_EXPIRES_IN_SECONDS);
    res.cookie(AUTH_COOKIE, token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: config.JWT_EXPIRES_IN_SECONDS * 1000,
    });
    ok(res, { token, user: toPublicUser(row) });
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(AUTH_COOKIE, { httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax" });
    ok(res, { loggedOut: true });
  });

  router.get("/me", requireAuth(db, config.JWT_SECRET), (req, res) => {
    ok(res, { user: req.user });
  });

  return router;
}
