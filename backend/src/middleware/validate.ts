import type { z } from "zod";
import { badRequest } from "../lib/http.js";

/** Parse a request part with a zod schema or throw a 400 listing each invalid field. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    throw badRequest("Validation failed", fields);
  }
  return result.data;
}
