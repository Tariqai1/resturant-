import crypto from "crypto";

/**
 * Computes a deterministic, human-friendly 4-digit code (1000 - 9999)
 * from a table's QR token. Because it is deterministic, it stays 100% constant
 * as long as the QR token does not change, meaning restaurant standees never expire daily.
 */
export function getTableAccessCode(qrToken: string): string {
  if (!qrToken) return "0000";
  const hash = crypto.createHash("sha256").update(qrToken).digest("hex");
  const num = (parseInt(hash.substring(0, 6), 16) % 9000) + 1000;
  return num.toString();
}
