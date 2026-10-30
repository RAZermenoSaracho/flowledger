/** Fixed field set of an audit line; no free-form payload so bodies and secrets cannot leak in. */
export interface AuditEntry {
  userId: string;
  credentialKind: string;
  credentialId: string;
  op: string;
  resourceId: string | null;
  status: number | string;
}

/** Writes one JSON audit line to stdout for a write operation. */
export function auditLog(entry: AuditEntry) {
  const { userId, credentialKind, credentialId, op, resourceId, status } = entry;
  process.stdout.write(
    `${JSON.stringify({
      audit: true,
      ts: new Date().toISOString(),
      userId,
      credentialKind,
      credentialId,
      op,
      resourceId,
      status
    })}\n`
  );
}
