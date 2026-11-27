import { Router } from "express";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { ok } from "../lib/http.js";
import { requireAuth } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";

const query = z.object({ role: z.enum(["farmer", "certifier", "processor", "distributor", "retailer"]) });

/** Approved participants of a role, e.g. to choose who receives a transfer. No emails exposed. */
export function usersRouter({ db, config }: AppDeps): Router {
  const router = Router();
  router.use(requireAuth(db, config.JWT_SECRET));

  router.get("/", async (req, res) => {
    const { role } = parse(query, req.query);
    const { rows } = await db.query(
      "SELECT id, name, organisation, role FROM users WHERE role = $1 AND status = 'approved' ORDER BY name",
      [role],
    );
    ok(res, { users: rows });
  });

  return router;
}
