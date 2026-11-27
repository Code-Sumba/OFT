import type { ErrorRequestHandler, RequestHandler } from "express";
import { HttpError } from "../lib/http.js";

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, error: err.message, details: err.details });
    return;
  }
  // Malformed JSON body from express.json()
  if ((err as { type?: string }).type === "entity.parse.failed") {
    res.status(400).json({ success: false, error: "Malformed JSON body" });
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, error: "Internal server error" });
};
