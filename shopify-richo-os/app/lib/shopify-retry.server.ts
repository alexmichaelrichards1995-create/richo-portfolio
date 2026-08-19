type AdminGraphql = (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function resilientAdminGraphql(adminGraphql: AdminGraphql, options: { maxAttempts?: number; baseDelayMs?: number } = {}): AdminGraphql {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 250;

  return async (query, requestOptions) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await adminGraphql(query, requestOptions);
        if (response.status !== 429 && response.status < 500) return response;
        lastError = new Error(`RICHO_SHOPIFY_HTTP_${response.status}`);
      } catch (error) {
        lastError = error;
      }

      if (attempt < maxAttempts) {
        const jitter = Math.floor(Math.random() * baseDelayMs);
        await sleep(baseDelayMs * 2 ** (attempt - 1) + jitter);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("RICHO_SHOPIFY_RETRY_EXHAUSTED");
  };
}
