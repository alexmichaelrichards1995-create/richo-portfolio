import crypto from 'node:crypto';

type Store = {
  has: (key: string) => Promise<boolean>;
  put: (key: string, payload: unknown) => Promise<void>;
};

export function eventKey(topic: string, shop: string, webhookId: string) {
  return crypto.createHash('sha256').update(`${topic}:${shop}:${webhookId}`).digest('hex');
}

export async function runOnce<T>(store: Store, key: string, fn: () => Promise<T>): Promise<{ duplicate: boolean; result?: T }> {
  if (await store.has(key)) return { duplicate: true };
  const result = await fn();
  await store.put(key, { processedAt: new Date().toISOString() });
  return { duplicate: false, result };
}
