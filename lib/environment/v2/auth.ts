import { createHash } from "node:crypto";

export interface AuthenticatedEnvironmentSourceV2 {
  id: string;
  auditRef: string;
}

export function bearerTokenDigest(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length);
  if (token.length < 32 || token.length > 256 || /\s/.test(token)) return null;
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function sourceAuditReference(sourceId: string): string {
  return createHash("sha256").update(sourceId, "utf8").digest("hex").slice(0, 12);
}
