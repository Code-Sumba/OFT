import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import type { AppDeps } from "../app.js";
import { HttpError, badRequest, ok } from "../lib/http.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { gatewayUrl } from "../ipfs/pinata.js";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Detects the real file type from its first bytes; the client-sent MIME type is not trusted. */
export function sniffType(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return { mime: "application/pdf", ext: "pdf" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export function uploadRouter({ db, config, ipfs }: AppDeps): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.NODE_ENV === "test" ? 1000 : 30,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, error: "Too many uploads, please try again later" },
  });

  router.post(
    "/",
    limiter,
    requireAuth(db, config.JWT_SECRET),
    requireRole("farmer", "certifier"),
    (req, res, next) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          next(err.code === "LIMIT_FILE_SIZE" ? new HttpError(413, "File is larger than 5 MB") : badRequest(err.message));
        } else next(err);
      });
    },
    async (req, res) => {
      if (!req.file) throw badRequest('Attach a file in the "file" field');
      const type = sniffType(req.file.buffer);
      if (!type) throw badRequest("Only PDF, PNG, JPEG or WebP files are allowed");

      const safeName = req.file.originalname.replace(/[^\w.-]+/g, "_").slice(0, 80) || `upload.${type.ext}`;
      const cid = await ipfs.upload({ buffer: req.file.buffer, filename: safeName, mimeType: type.mime });
      ok(res, { cid, url: gatewayUrl(config.IPFS_GATEWAY_URL, cid), mimeType: type.mime, size: req.file.size }, 201);
    },
  );

  return router;
}
