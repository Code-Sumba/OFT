import type { Response } from "express";

/** Error with an HTTP status, turned into a JSON response by the error handler. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const unauthorized = (message = "Not logged in") => new HttpError(401, message);
export const forbidden = (message = "You do not have permission for this action") => new HttpError(403, message);
export const notFound = (message = "Not found") => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

export function ok<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}
