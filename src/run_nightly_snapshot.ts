import { recordNightlySnapshot } from "./snapshot_admin_server.js";

const payload = Buffer.from(JSON.stringify({ accounts: 14, generatedBy: "nightly-job" })).toString("base64");
const result = await recordNightlySnapshot({
  tenantId: "acme-demo",
  accountState: "active",
  snapshotDate: new Date().toISOString().slice(0, 10),
  payloadBase64: payload
});
console.log(result);
