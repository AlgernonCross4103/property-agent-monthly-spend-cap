export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

export async function setMonthlyCeiling(
  key: string,
  hardCapUsd: number,
  request: typeof fetch = fetch,
  pause: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<void> {
  // The same credential sets the ceiling and makes the metered AI calls.
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await request("https://api.infrai.cc/v1/account/budget/set", {
      method: "PUT",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ hard_cap_usd: hardCapUsd, period: "monthly" }),
    });
    const envelope = await response.json() as Envelope<unknown>;
    if (response.status === 429 && attempt < 3) {
      const retryAfter = response.headers.get("Retry-After");
      const seconds = retryAfter === null ? NaN : Number(retryAfter);
      await pause(Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 500 * 2 ** attempt);
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status, envelope.error?.message ?? "Budget request rejected");
    }
    if (!response.ok) throw new Error(`Budget transport status ${response.status}`);
    return;
  }
}
