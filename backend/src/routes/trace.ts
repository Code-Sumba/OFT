import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { AppDeps } from "../app.js";
import { BATCH_CODE_PATTERN } from "../lib/batchCode.js";
import { notFound, ok } from "../lib/http.js";
import { findBatch, listCertificates, listEvents } from "../repositories/batches.js";
import { addressUrl, loadParties, presentBatch, presentCertificate, presentEvent } from "../services/presenter.js";

const codeParams = z.object({ code: z.string().trim().toUpperCase().pipe(z.string().regex(BATCH_CODE_PATTERN)) });

/** Public consumer verification: no login, no emails, everything needed for the QR page. */
export function traceRouter({ db, config, trust }: AppDeps): Router {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: config.TRACE_RATE_LIMIT_PER_MIN,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { success: false, error: "Too many requests, please slow down" },
    }),
  );

  router.get("/:code", async (req, res) => {
    const parsed = codeParams.safeParse(req.params);
    if (!parsed.success) throw notFound("No batch with this code");
    const { code } = parsed.data;

    const report = await trust.recompute(code);
    const batch = await findBatch(db, code);
    if (!report || !batch) throw notFound("No batch with this code");

    const [events, certificates] = await Promise.all([listEvents(db, code), listCertificates(db, code)]);
    const parties = await loadParties(db, [
      batch.farmer_id,
      batch.current_owner_id,
      ...events.flatMap((e) => [e.from_user_id, e.to_user_id]),
      ...certificates.map((c) => c.certifier_id),
    ]);

    const presented = presentBatch(config, batch, parties);
    const verified =
      report.band === "verified" && batch.status === "certified" && !presented.certificate.expired && report.chain?.matches === true;

    ok(res, {
      batch: presented,
      timeline: events.map((e) => presentEvent(config, e, parties)),
      certificates: certificates.map((c) => presentCertificate(config, c, parties)),
      trust: { score: report.score, band: report.band, rules: report.rules },
      verification: {
        badge: verified ? "verified" : "warning",
        chainChecked: report.chain !== null,
        matchesChain: report.chain?.matches ?? null,
        differences: report.chain?.differences ?? [],
        contract: { address: config.CONTRACT_ADDRESS, url: addressUrl(config, config.CONTRACT_ADDRESS) },
      },
    });
  });

  return router;
}
