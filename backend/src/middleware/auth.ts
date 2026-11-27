import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { Db } from "../db.js";
import { forbidden, unauthorized } from "../lib/http.js";
import type { Role } from "../lib/roles.js";
import { findUserById, type PublicUser } from "../repositories/users.js";

export const AUTH_COOKIE = "ot_token";

declare module "express-serve-static-core" {
  interface Request {
    user?: PublicUser;
  }
}

interface TokenPayload {
  sub: string;
  role: Role;
}

export function signToken(user: Pick<PublicUser, "id" | "role">, secret: string, expiresInSeconds: number): string {
  const payload: TokenPayload = { sub: user.id, role: user.role };
  return jwt.sign(payload, secret, { expiresIn: expiresInSeconds, algorithm: "HS256" });
}

function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE] ?? null;
}

/**
 * Verifies the JWT, then reloads the user so blocked accounts lose access
 * immediately instead of when their token expires.
 */
export function requireAuth(db: Db, secret: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = readToken(req);
    if (!token) throw unauthorized();

    let payload: TokenPayload;
    try {
      payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as TokenPayload;
    } catch {
      throw unauthorized("Session expired or invalid, please log in again");
    }

    const user = await findUserById(db, payload.sub);
    if (!user) throw unauthorized();
    if (user.status !== "approved") throw forbidden(`Account is ${user.status}`);

    req.user = user;
    next();
  };
}

/** Must run after requireAuth. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) throw forbidden();
    next();
  };
}
