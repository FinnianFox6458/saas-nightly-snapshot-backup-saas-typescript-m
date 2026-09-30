export type SnapshotRequest = {
  tenantId: string;
  accountState: "onboarding" | "active" | "closed";
  snapshotDate: string;
  payloadBase64: string;
};

export type SnapshotDecision =
  | { action: "archive"; key: string; idempotencyKey: string }
  | { action: "skip"; reason: "closed_account" };

export function decideNightlySnapshot(input: SnapshotRequest): SnapshotDecision {
  if (input.accountState === "closed") return { action: "skip", reason: "closed_account" };

  const key = `nightly/${input.tenantId}/${input.snapshotDate}.json`;
  return {
    action: "archive",
    key,
    idempotencyKey: `nightly-snapshot:${input.tenantId}:${input.snapshotDate}`
  };
}
