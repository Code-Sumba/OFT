import type { TxResponse } from "@/lib/types";
import { Notice, TxLinkView } from "./ui";

/** Feedback after a blockchain write: confirmed with a link, or still pending. */
export function TxNotice({ result, action }: { result: TxResponse; action: string }) {
  return result.tx.confirmed ? (
    <Notice kind="success">
      {action} for <span className="font-mono">{result.batch.code}</span> recorded on the blockchain.{" "}
      <TxLinkView hash={result.tx.hash} url={result.tx.url} />
    </Notice>
  ) : (
    <Notice kind="warn">
      {action} sent; the network has not confirmed it yet. It will appear automatically. <TxLinkView hash={result.tx.hash} url={result.tx.url} />
    </Notice>
  );
}
