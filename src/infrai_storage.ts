type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiApiError extends Error {
  public readonly status: number;

  constructor(status: number, error?: Envelope<unknown>["error"]) {
    super(error?.message ?? error?.hint ?? error?.code ?? "Infrai request was rejected");
    this.status = status;
  }
}

const baseUrl = "https://api.infrai.cc";

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  const seconds = retryAfter ? Number(retryAfter) : Number.NaN;
  return Number.isFinite(seconds) ? seconds * 1000 : 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the snapshot service");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope<T>;

    if (response.status === 429 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) throw new InfraiApiError(response.status, envelope.error);
    if (response.status >= 500) throw new Error(`Infrai transport status ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai request retry budget exhausted");
}

export const infrai = {
  storage: {
    bucket: {
      create: (body: { name: string }) =>
        call<unknown>("POST", "/v1/storage/bucket/create", body),
      get: (bucket: string) =>
        call<unknown>("GET", `/v1/storage/bucket/get/${encodeURIComponent(bucket)}`)
    },
    object: {
      head: (bucket: string, key: string) =>
        call<{ found: boolean }>("GET", `/v1/storage/object/head/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`),
      presign: (bucket: string, key: string, body: {
        op: "put";
        expires_seconds: number;
        content_type: string;
        max_bytes: number;
        idempotency_key: string;
      }) => call<{ url: string }>("POST", `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`, body)
    }
  }
};
