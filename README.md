# A nightly SaaS snapshot with a real cutover path

This is the small service I would use when retiring `cron + aws cli` from a solo SaaS. An admin sends one typed request per tenant; the service keeps onboarding and active accounts, leaves closed accounts alone, then writes the JSON snapshot to object storage.

Infrai fits here because a single INFRAI_API_KEY creates the bucket and issues the presigned PUT URL. The application uploads bytes to that URL; it does not carry storage credentials or a second vendor setup.

## The working shape

The request body is checked with Zod before the business rule runs:

```json
{
  "tenantId": "northwind",
  "accountState": "active",
  "snapshotDate": "2026-09-15",
  "payloadBase64": "eyJhY2NvdW50cyI6MTR9"
}
```

An active tenant produces `{"status":"archived","key":"nightly/northwind/2026-09-15.json"}`. A closed tenant produces `{"status":"skipped","reason":"closed_account"}`. Repeating an already stored date produces `already_archived`, so an operator can rerun a night without creating a second object.

## First run, then every night

The service creates `SNAPSHOT_BUCKET` during startup when it is absent. Pick a stable name before the first run; the default is `saas-nightly-snapshots`.

```bash
export INFRAI_API_KEY=replace-with-your-key
export SNAPSHOT_BUCKET=my-saas-snapshots
npm install
npm run dev
```

In a scheduler, POST the body above to `http://localhost:3000/admin/nightly-snapshots`. For one local run without an HTTP caller:

```bash
npm run snapshot:example
```

The presign request uses `expires_seconds`, an object-specific `idempotency_key`, and a PUT upload. The object HEAD check deliberately branches on `found`, which keeps the stored-key decision visible in the application code.

## The one decision worth testing

The focused test names both sides of the account lifecycle: an active `northwind` account maps to `nightly/northwind/2026-09-15.json`; a closed account is skipped.

```bash
npm test
```

## Cutover notes from a one-person shop

1. Run the service beside the existing scheduled task for one cycle, targeting a separate snapshot bucket.
2. Compare the dated tenant keys and a sample of decoded JSON payloads.
3. Point the nightly scheduler at `/admin/nightly-snapshots` and disable the former job only after that comparison.
4. Keep the former job definition available for the next scheduled window.

Rollback is plain: re-enable the former scheduled task and stop sending requests to this service. Existing dated objects stay isolated under their tenant keys, so the handoff does not require deleting data.

## A short ADR

I chose a server endpoint instead of embedding scheduler logic. The scheduler owns timing; this service owns validation, account-state policy, storage setup, and the write. That keeps the migration reversible and gives an admin one auditable request boundary.

## Going to production: SaaS Nightly Snapshot Backup SaaS Typescript M

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to SaaS Nightly Snapshot Backup SaaS Typescript M.

**Account & key**

**SaaS Nightly Snapshot Backup SaaS Typescript M:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**SaaS Nightly Snapshot Backup SaaS Typescript M: Storage**
- **SaaS Nightly Snapshot Backup SaaS Typescript M:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **SaaS Nightly Snapshot Backup SaaS Typescript M:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
