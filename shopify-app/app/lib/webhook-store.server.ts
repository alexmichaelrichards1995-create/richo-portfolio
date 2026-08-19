export interface WebhookReceipt {
  id: string;
  topic: string;
  shop: string;
  processedAt: string;
}

const memory = new Map<string, WebhookReceipt>();

export async function hasWebhook(id: string): Promise<boolean> {
  return memory.has(id);
}

export async function recordWebhook(receipt: WebhookReceipt): Promise<void> {
  memory.set(receipt.id, receipt);
}

export async function once<T>(receipt: WebhookReceipt, work: () => Promise<T>): Promise<{ duplicate: boolean; result?: T }> {
  if (await hasWebhook(receipt.id)) return { duplicate: true };
  const result = await work();
  await recordWebhook(receipt);
  return { duplicate: false, result };
}
