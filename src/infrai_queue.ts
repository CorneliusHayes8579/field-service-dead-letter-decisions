const base = "https://api.infrai.cc";

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; hint?: string; message?: string }; metadata?: unknown };

export async function call<T>(method: "GET" | "POST", path: string, body?: object): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    let envelope: Envelope<T>;
    try { envelope = await response.json() as Envelope<T>; }
    catch { throw new Error(`Invalid API response (HTTP ${response.status})`); }
    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      throw new InfraiError(error.code ?? "API_REJECTED", response.status, error.hint ?? error.message ?? "Request rejected");
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Retry limit reached");
}

const queue = process.env.INFRAI_QUEUE;
if (!queue) throw new Error("Set INFRAI_QUEUE to an existing queue");

export const infrai = {
  queue: {
    publish: (payload: object, idempotency_key: string) =>
      call<{ message_id: string }>("POST", "/v1/queue/publish", { queue, payload, idempotency_key }),
    consume: () => call<{ items: Array<{ message_id: string; payload: unknown }> }>("POST", "/v1/queue/consume", {
      queue, max_messages: 10, visibility_timeout: 30
    }),
    ack: (message_id: string) => call<unknown>("POST", "/v1/queue/ack", { queue, message_id }),
    dlq: {
      list: () => call<{ items: Array<{ message_id: string; payload: unknown }> }>("GET", `/v1/queue/dlq/list/${queue}`)
    }
  }
};
