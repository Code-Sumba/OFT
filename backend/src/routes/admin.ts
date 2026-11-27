import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { badRequest, notFound, ok } from "../lib/http.js";
import { ROLES, USER_STATUSES } from "../lib/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { listUsers, setUserStatus } from "../repositories/users.js";

const listQuery = z.object({
  status: z.enum(USER_STATUSES).optional(),
  role: z.enum(ROLES).optional(),
});

const idParams = z.object({ id: z.string().uuid() });
const statusBody = z.object({ status: z.enum(["approved", "blocked"]) });

const alertQuery = z.object({
  resolved: z.enum(["true", "false"]).optional(),
  severity: z.enum(["medium", "high"]).optional(),
});
const alertParams = z.object({ id: z.coerce.number().int().positive() });

export function adminRouter({ db, config }: AppDeps): Router {
  const router = Router();
  router.use(requireAuth(db, config.JWT_SECRET), requireRole("admin"));

  router.get("/users", async (req, res) => {
    const filter = parse(listQuery, req.query);
    ok(res, { users: await listUsers(db, filter) });
  });

  router.patch("/users/:id", async (req, res) => {
    const { id } = parse(idParams, req.params);
    const { status } = parse(statusBody, req.body);
    if (id === req.user!.id) throw badRequest("You cannot change your own account status");

    const user = await setUserStatus(db, id, status);
    if (!user) throw notFound("User not found");
    ok(res, { user });
  });

  router.get("/fraud-alerts", async (req, res) => {
    const q = parse(alertQuery, req.query);
    const where: string[] = [];
    const values: unknown[] = [];
    if (q.resolved) {
      values.push(q.resolved === "true");
      where.push(`a.resolved = $${values.length}`);
    }
    if (q.severity) {
      values.push(q.severity);
      where.push(`a.severity = $${values.length}`);
    }
    const { rows } = await db.query(
      `SELECT a.id, a.batch_code, a.rule, a.severity, a.details, a.resolved, a.created_at, b.product, b.trust_score
       FROM fraud_alerts a JOIN batches b ON b.batch_code = a.batch_code
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY a.created_at DESC LIMIT 200`,
      values,
    );
    ok(res, { alerts: rows });
  });

  router.get("/analytics", async (_req, res) => {
    const count = async (sql: string) => (await db.query<{ k: string; n: string | number }>(sql)).rows;
    const toMap = (rows: { k: string; n: string | number }[]) => Object.fromEntries(rows.map((r) => [r.k, Number(r.n)]));

    const [usersByRole, usersByStatus, batchesByStatus, batchesByStage, alertsBySeverity] = await Promise.all([
      count("SELECT role AS k, COUNT(*) AS n FROM users GROUP BY role"),
      count("SELECT status AS k, COUNT(*) AS n FROM users GROUP BY status"),
      count("SELECT status AS k, COUNT(*) AS n FROM batches GROUP BY status"),
      count("SELECT stage AS k, COUNT(*) AS n FROM batches GROUP BY stage"),
      count("SELECT severity AS k, COUNT(*) AS n FROM fraud_alerts WHERE resolved = false GROUP BY severity"),
    ]);
    const { rows: avg } = await db.query<{ avg: string | number | null; total: string | number }>(
      "SELECT AVG(trust_score) AS avg, COUNT(*) AS total FROM batches",
    );

    // Daily activity for the last 14 days, bucketed in JS so it works on any SQL engine
    const days = 14;
    const since = new Date(Date.now() - (days - 1) * 86_400_000);
    since.setUTCHours(0, 0, 0, 0);
    const { rows: recent } = await db.query<{ event_type: string; event_time: Date }>(
      "SELECT event_type, event_time FROM batch_events WHERE event_time >= $1",
      [since],
    );
    const daily = Array.from({ length: days }, (_, i) => ({
      date: new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10),
      registered: 0,
      certified: 0,
      transferred: 0,
      sold: 0,
    }));
    for (const e of recent) {
      const day = daily.find((d) => d.date === new Date(e.event_time).toISOString().slice(0, 10));
      const key = (e.event_type === "rejected" ? "certified" : e.event_type) as "registered" | "certified" | "transferred" | "sold";
      if (day) day[key] += 1;
    }

    ok(res, {
      users: { byRole: toMap(usersByRole), byStatus: toMap(usersByStatus) },
      batches: {
        total: Number(avg[0]?.total ?? 0),
        byStatus: toMap(batchesByStatus),
        byStage: toMap(batchesByStage),
        averageTrustScore: avg[0]?.avg === null || avg[0]?.avg === undefined ? null : Math.round(Number(avg[0].avg)),
      },
      openAlerts: toMap(alertsBySeverity),
      daily,
    });
  });

  /** Output of `npx hardhat run scripts/gas-report.ts` (repo root). */
  router.get("/gas-report", (_req, res) => {
    const file = process.env.GAS_REPORT_PATH ?? path.resolve(process.cwd(), "data", "gas-report.json");
    if (!fs.existsSync(file)) throw notFound("Gas report not generated yet: run `npx hardhat run scripts/gas-report.ts`");
    ok(res, { report: JSON.parse(fs.readFileSync(file, "utf8")) });
  });

  /** Manually dismiss an alert after review. It reopens if the rule still triggers on the next check. */
  router.patch("/fraud-alerts/:id", async (req, res) => {
    const { id } = parse(alertParams, req.params);
    const { rows } = await db.query("UPDATE fraud_alerts SET resolved = true WHERE id = $1 RETURNING *", [id]);
    if (!rows[0]) throw notFound("Alert not found");
    ok(res, { alert: rows[0] });
  });

  return router;
}
