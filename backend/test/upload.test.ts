import { describe, expect, it } from "vitest";
import { sniffType } from "../src/routes/upload.js";
import { seedAllRoles, setup } from "./helpers.js";

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(100, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50)]);

describe("POST /api/upload", () => {
  it("uploads a certificate PDF for a farmer and returns the CID and gateway URL", async () => {
    const w = setup();
    const users = await seedAllRoles(w.db, w.api);
    const res = await w.api.post("/api/upload").set(users.farmer.auth).attach("file", PDF, "organic cert (2026).pdf");

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ mimeType: "application/pdf", size: PDF.length });
    expect(res.body.data.url).toBe(`https://gateway.example/ipfs/${res.body.data.cid}`);
    expect(w.ipfs.uploads).toEqual([{ filename: "organic_cert_2026_.pdf", mimeType: "application/pdf", size: PDF.length }]);
  });

  it("allows certifiers, refuses other roles and anonymous users", async () => {
    const w = setup();
    const users = await seedAllRoles(w.db, w.api);
    expect((await w.api.post("/api/upload").set(users.certifier.auth).attach("file", PNG, "c.png")).status).toBe(201);
    expect((await w.api.post("/api/upload").set(users.retailer.auth).attach("file", PNG, "c.png")).status).toBe(403);
    expect((await w.api.post("/api/upload").attach("file", PNG, "c.png")).status).toBe(401);
  });

  it("rejects disguised files, missing files and files over 5 MB", async () => {
    const w = setup();
    const users = await seedAllRoles(w.db, w.api);
    const exe = await w.api.post("/api/upload").set(users.farmer.auth).attach("file", Buffer.from("MZ\x90\x00 evil"), {
      filename: "cert.pdf",
      contentType: "application/pdf",
    });
    expect(exe.status).toBe(400);

    expect((await w.api.post("/api/upload").set(users.farmer.auth)).status).toBe(400);

    const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
    const tooBig = await w.api.post("/api/upload").set(users.farmer.auth).attach("file", big, "big.pdf");
    expect(tooBig.status).toBe(413);
    expect(w.ipfs.uploads).toHaveLength(0);
  });
});

describe("sniffType", () => {
  it("recognises PDF, PNG, JPEG and WebP by content", () => {
    expect(sniffType(PDF)?.mime).toBe("application/pdf");
    expect(sniffType(PNG)?.mime).toBe("image/png");
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.mime).toBe("image/jpeg");
    expect(sniffType(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))?.mime).toBe("image/webp");
    expect(sniffType(Buffer.from("GIF89a"))).toBeNull();
  });
});
