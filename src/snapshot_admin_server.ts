import { createServer } from "node:http";
import { z } from "zod";
import { InfraiApiError, infrai } from "./infrai_storage.js";
import { decideNightlySnapshot } from "./snapshot_policy.js";

const bucket = process.env.SNAPSHOT_BUCKET ?? "saas-nightly-snapshots";
const snapshotBody = z.object({
  tenantId: z.string().min(1),
  accountState: z.enum(["onboarding", "active", "closed"]),
  snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payloadBase64: z.string().min(1)
});

async function ensureSnapshotBucket(): Promise<void> {
  try {
    await infrai.storage.bucket.get(bucket);
  } catch (error) {
    if (!(error instanceof InfraiApiError) || error.status !== 404) throw error;
    await infrai.storage.bucket.create({ name: bucket });
  }
}

const bucketReady = ensureSnapshotBucket();

export async function recordNightlySnapshot(input: z.infer<typeof snapshotBody>) {
  const decision = decideNightlySnapshot(input);
  if (decision.action === "skip") return { status: "skipped" as const, reason: decision.reason };

  await bucketReady;
  const existing = await infrai.storage.object.head(bucket, decision.key);
  if (existing.found) return { status: "already_archived" as const, key: decision.key };

  const signed = await infrai.storage.object.presign(bucket, decision.key, {
    op: "put",
    expires_seconds: 300,
    content_type: "application/json",
    max_bytes: Math.ceil((input.payloadBase64.length * 3) / 4),
    idempotency_key: decision.idempotencyKey
  });
  const uploaded = await fetch(signed.url, { method: "PUT", body: Buffer.from(input.payloadBase64, "base64") });
  if (!uploaded.ok) throw new Error(`Snapshot upload returned ${uploaded.status}`);
  return { status: "archived" as const, key: decision.key };
}

export function startSnapshotAdminServer() {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/admin/nightly-snapshots") {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Request body must be JSON" }));
      return;
    }
    const parsed = snapshotBody.safeParse(body);
    if (!parsed.success) {
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: parsed.error.flatten() }));
      return;
    }
    try {
      const result = await recordNightlySnapshot(parsed.data);
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (error) {
      const status = error instanceof InfraiApiError && error.status < 500 ? error.status : 502;
      response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error: (error as Error).message }));
    }
  });

  server.listen(Number(process.env.PORT ?? 3000));
}

if (process.argv[1]?.endsWith("snapshot_admin_server.ts")) startSnapshotAdminServer();
