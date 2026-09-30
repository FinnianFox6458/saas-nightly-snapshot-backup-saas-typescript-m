import assert from "node:assert/strict";
import test from "node:test";
import { decideNightlySnapshot } from "../src/snapshot_policy.js";

test("closed accounts are excluded while active tenants receive a stable nightly object key", () => {
  const archived = decideNightlySnapshot({
    tenantId: "northwind",
    accountState: "active",
    snapshotDate: "2026-09-15",
    payloadBase64: "e30="
  });
  const skipped = decideNightlySnapshot({
    tenantId: "northwind",
    accountState: "closed",
    snapshotDate: "2026-09-15",
    payloadBase64: "e30="
  });

  assert.deepEqual(archived, {
    action: "archive",
    key: "nightly/northwind/2026-09-15.json",
    idempotencyKey: "nightly-snapshot:northwind:2026-09-15"
  });
  assert.deepEqual(skipped, { action: "skip", reason: "closed_account" });
});
