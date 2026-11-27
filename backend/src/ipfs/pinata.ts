import { HttpError } from "../lib/http.js";

export interface IpfsClient {
  /** Pins a file publicly and returns its CID. */
  upload(file: { buffer: Buffer; filename: string; mimeType: string }): Promise<string>;
}

const PINATA_UPLOAD_URL = "https://uploads.pinata.cloud/v3/files";

export class PinataClient implements IpfsClient {
  constructor(private readonly jwt: string) {}

  async upload(file: { buffer: Buffer; filename: string; mimeType: string }): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.filename);
    form.append("network", "public");
    form.append("name", file.filename);

    let res: Response;
    try {
      res = await fetch(PINATA_UPLOAD_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.jwt}` },
        body: form,
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      console.error("Pinata request failed:", (err as Error).message);
      throw new HttpError(502, "File storage is unavailable, please try again");
    }

    if (!res.ok) {
      console.error(`Pinata upload failed: ${res.status} ${await res.text().catch(() => "")}`);
      throw new HttpError(502, "File upload to IPFS failed");
    }
    const body = (await res.json()) as { data?: { cid?: string } };
    if (!body.data?.cid) throw new HttpError(502, "File upload to IPFS returned no CID");
    return body.data.cid;
  }
}

/** Used when PINATA_JWT is not configured. */
export class DisabledIpfsClient implements IpfsClient {
  async upload(): Promise<string> {
    throw new HttpError(503, "File uploads are not configured on this server");
  }
}

export function gatewayUrl(gateway: string, cid: string | null | undefined): string | null {
  return cid ? `${gateway.replace(/\/$/, "")}/${cid}` : null;
}
