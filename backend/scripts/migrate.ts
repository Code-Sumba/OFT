import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../src/db.js";

// Applies db/schema.sql (idempotent: every statement uses IF NOT EXISTS).
// Runs from backend/scripts (tsx) or backend/dist/scripts (compiled, e.g. in Docker).
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [process.env.SCHEMA_PATH, path.resolve(here, "../../db/schema.sql"), path.resolve(here, "../../../db/schema.sql")];
const schemaPath = candidates.find((p): p is string => !!p && fs.existsSync(p));
if (!schemaPath) throw new Error("db/schema.sql not found; set SCHEMA_PATH");

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const pool = createPool(url);
try {
  await pool.query(fs.readFileSync(schemaPath, "utf8"));
  console.log("Schema applied.");
} finally {
  await pool.end();
}
