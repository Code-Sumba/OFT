import { randomUUID } from "node:crypto";
import { type Response, Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { STAGES, type StageName } from "../chain/types.js";
import type { AppDeps } from "../app.js";
import { BATCH_CODE_PATTERN, newBatchCode } from "../lib/batchCode.js";
import { badRequest, conflict, forbidden, notFound, ok } from "../lib/http.js";
import type { Role } from "../lib/roles.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import {
  type BatchRow,
  deleteUnregisteredBatch,
  findBatch,
  insertBatch,
  listBatchesFor,
  listCertificates,
  listEvents,
  setRegisterTx,
} from "../repositories/batches.js";
import { findUserById, type PublicUser } from "../repositories/users.js";
import { sendAndApply } from "../services/chainTx.js";
import { loadParties, presentBatch, presentCertificate, presentEvent, txUrl } from "../services/presenter.js";

export const UNITS = ["kg", "quintal", "tonne", "litre", "dozen", "piece"] as const;
const CID_PATTERN = /^[a-zA-Z0-9]{46,100}$/;
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const registerSchema = z.object({
  product: z.string().trim().min(2).max(100),
  quantity: z.coerce.number().positive().max(1_000_000),
  unit: z.enum(UNITS),
  origin: z.string().trim().min(2).max(100),
  harvestDate: dateString,
  certificateCid: z.string().trim().regex(CID_PATTERN, "invalid IPFS CID").optional(),
});

const certifySchema = z.discriminatedUnion("approved", [
  z.object({
    approved: z.literal(true),
    expiry: dateString,
    certificateCid: z.string().trim().regex(CID_PATTERN, "invalid IPFS CID").optional(),
  }),
  z.object({ approved: z.literal(false) }),
]);

const transferSchema = z.object({
  toUserId: z.string().uuid(),
  location: z.string().trim().min(2).max(100),
});

const soldSchema = z.object({ location: z.string().trim().min(2).max(100) });

const listQuery = z.object({
  q: z.string().trim().max(50).optional(),
  status: z.enum(["registered", "certified", "rejected"]).optional(),
  stage: z.enum(STAGES).optional(),
});

const codeParams = z.object({ code: z.string().regex(BATCH_CODE_PATTERN, "invalid batch code") });

/** Which role holds a batch at each stage. */
const STAGE_ROLE: Partial<Record<StageName, Role>> = {
  farmer: "farmer",
  processor: "processor",
  distributor: "distributor",
  retailer: "retailer",
};

const nextStage = (s: StageName): StageName | null => {
  const i = STAGES.indexOf(s);
  return i >= 0 && i < STAGES.indexOf("retailer") ? STAGES[i + 1] : null;
};

const endOfDayUtc = (d: string) => new Date(`${d}T23:59:59Z`);

export function batchesRouter({ db, config, chain, trust }: AppDeps): Router {
  const router = Router();
  router.use(requireAuth(db, config.JWT_SECRET));

  async function loadBatch(code: string): Promise<BatchRow> {
    const batch = await findBatch(db, code);
    if (!batch) throw notFound("Batch not found");
    return batch;
  }

  async function respond(res: Response, code: string, tx: { txHash: string; confirmed: boolean }, status = 200) {
    const batch = await loadBatch(code);
    const parties = await loadParties(db, [batch.farmer_id, batch.current_owner_id]);
    ok(
      res,
      {
        batch: presentBatch(config, batch, parties),
        tx: { hash: tx.txHash, url: txUrl(config, tx.txHash), confirmed: tx.confirmed },
        ...(tx.confirmed ? {} : { message: "Transaction sent; it will appear once the network confirms it." }),
      },
      tx.confirmed ? status : 202,
    );
  }

  // ------------------------------------------------------------- register

  router.post("/", requireRole("farmer"), async (req, res) => {
    const body = parse(registerSchema, req.body);
    const harvest = new Date(`${body.harvestDate}T00:00:00Z`);
    if (Number.isNaN(harvest.getTime())) throw badRequest("Invalid harvest date");
    if (harvest.getTime() > Date.now()) throw badRequest("Harvest date cannot be in the future");

    const farmer = req.user!;
    // Insert first so the code is reserved; removed again if the chain rejects it.
    let code = "";
    for (let attempt = 0; ; attempt++) {
      code = newBatchCode();
      try {
        await insertBatch(db, {
          id: randomUUID(),
          batchCode: code,
          product: body.product,
          quantity: body.quantity,
          unit: body.unit,
          origin: body.origin,
          harvestDate: body.harvestDate,
          farmerId: farmer.id,
          certificateCid: body.certificateCid ?? null,
        });
        break;
      } catch (err) {
        if (attempt >= 4 || !/unique|duplicate/i.test((err as Error).message)) throw err;
      }
    }

    let tx;
    try {
      tx = await sendAndApply(db, trust, async () => {
        const result = await chain.registerBatch({
          batchCode: code,
          product: body.product,
          origin: body.origin,
          harvestDate: harvest,
          farmerId: farmer.chain_actor_id,
          certCID: body.certificateCid ?? "",
        });
        await setRegisterTx(db, code, result.txHash);
        return result;
      });
    } catch (err) {
      await deleteUnregisteredBatch(db, code);
      throw err;
    }
    await respond(res, code, tx, 201);
  });

  // ----------------------------------------------------------------- read

  router.get("/", async (req, res) => {
    const filter = parse(listQuery, req.query);
    const rows = await listBatchesFor(db, req.user!, filter);
    const parties = await loadParties(db, rows.flatMap((b) => [b.farmer_id, b.current_owner_id]));
    ok(res, { batches: rows.map((b) => presentBatch(config, b, parties)) });
  });

  router.get("/:code", async (req, res) => {
    const { code } = parse(codeParams, req.params);
    const batch = await loadBatch(code);
    const [events, certificates] = await Promise.all([listEvents(db, code), listCertificates(db, code)]);
    const parties = await loadParties(db, [
      batch.farmer_id,
      batch.current_owner_id,
      ...events.flatMap((e) => [e.from_user_id, e.to_user_id]),
      ...certificates.map((c) => c.certifier_id),
    ]);
    const next = nextStage(batch.stage);
    ok(res, {
      batch: presentBatch(config, batch, parties),
      events: events.map((e) => presentEvent(config, e, parties)),
      certificates: certificates.map((c) => presentCertificate(config, c, parties)),
      nextStage: next,
      canTransfer: canTransfer(req.user!, batch) === null,
    });
  });

  // -------------------------------------------------------------- certify

  router.post("/:code/certify", requireRole("certifier"), async (req, res) => {
    const { code } = parse(codeParams, req.params);
    const body = parse(certifySchema, req.body);
    const batch = await loadBatch(code);
    if (!isOnChain(batch)) throw conflict("Batch registration is still pending on the blockchain");
    if (batch.stage === "sold") throw conflict("Batch has already been sold");

    let expiry: Date | null = null;
    let cid = batch.certificate_cid ?? "";
    if (body.approved) {
      expiry = endOfDayUtc(body.expiry);
      if (Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
        throw badRequest("Certificate expiry must be a future date");
      }
      cid = body.certificateCid ?? cid;
      if (!cid) throw badRequest("A certificate file is required to approve this batch");
    }

    const tx = await sendAndApply(db, trust, () =>
      chain.certifyBatch({ batchCode: code, certCID: cid, expiry, approved: body.approved, certifierId: req.user!.chain_actor_id }),
    );
    await respond(res, code, tx);
  });

  // ------------------------------------------------------------- transfer

  router.post("/:code/transfer", async (req, res) => {
    const { code } = parse(codeParams, req.params);
    const body = parse(transferSchema, req.body);
    const batch = await loadBatch(code);

    const denied = canTransfer(req.user!, batch);
    if (denied) throw denied;
    const toStage = nextStage(batch.stage)!;

    const recipient = await findUserById(db, body.toUserId);
    if (!recipient || recipient.status !== "approved") throw badRequest("Recipient not found or not approved");
    if (recipient.role !== STAGE_ROLE[toStage]) throw badRequest(`Recipient must be a ${STAGE_ROLE[toStage]}`);

    const tx = await sendAndApply(db, trust, () =>
      chain.transferBatch({ batchCode: code, toActor: recipient.chain_actor_id, toStage, location: body.location }),
    );
    await respond(res, code, tx);
  });

  // ----------------------------------------------------------------- sold

  router.post("/:code/sold", requireRole("retailer"), async (req, res) => {
    const { code } = parse(codeParams, req.params);
    const body = parse(soldSchema, req.body);
    const batch = await loadBatch(code);
    if (batch.current_owner_id !== req.user!.id) throw forbidden("Only the retailer holding this batch can mark it sold");
    if (batch.stage !== "retailer") throw conflict("Only a batch at the retailer can be marked as sold");

    const tx = await sendAndApply(db, trust, () => chain.markSold({ batchCode: code, location: body.location }));
    await respond(res, code, tx);
  });

  // ------------------------------------------------------------------- QR

  router.get("/:code/qr", requireRole("retailer", "admin"), async (req, res) => {
    const { code } = parse(codeParams, req.params);
    const batch = await loadBatch(code);
    if (req.user!.role === "retailer" && batch.current_owner_id !== req.user!.id) {
      throw forbidden("Only the retailer holding this batch can print its label");
    }
    const url = traceUrl(config.NEXT_PUBLIC_SITE_URL, code);
    const opts = { errorCorrectionLevel: "M" as const, margin: 2, width: 512 };

    if (req.query.format === "svg") {
      res.type("image/svg+xml").send(await QRCode.toString(url, { ...opts, type: "svg" }));
      return;
    }
    res.type("image/png").send(await QRCode.toBuffer(url, opts));
  });

  return router;
}

export const traceUrl = (siteUrl: string, code: string) => `${siteUrl.replace(/\/$/, "")}/trace/${encodeURIComponent(code)}`;

/** True once the registration event has been applied (not just sent). */
const isOnChain = (b: BatchRow) => Number(b.last_block) > 0;

/** Returns null if the user may transfer the batch now, otherwise the error to throw. */
function canTransfer(user: PublicUser, batch: BatchRow) {
  if (batch.current_owner_id !== user.id || STAGE_ROLE[batch.stage] !== user.role) {
    return forbidden("Only the current holder of this batch can transfer it");
  }
  if (!isOnChain(batch)) return conflict("Batch registration is still pending on the blockchain");
  if (batch.status !== "certified") return conflict("Batch must be certified before it can be transferred");
  if (batch.cert_expiry && new Date(batch.cert_expiry).getTime() < Date.now()) {
    return conflict("The organic certificate has expired; a certifier must renew it before transfer");
  }
  if (!nextStage(batch.stage)) return conflict("A batch at the retailer is sold, not transferred");
  return null;
}
