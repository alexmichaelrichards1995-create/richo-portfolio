export type SqlClient = {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>;
};

export function createPostgresWebhookStore(db: SqlClient) {
  return {
    async begin(shopDomain: string, topic: string, webhookId: string) {
      const res = await db.query<{ status: string }>(
        `INSERT INTO shopify_webhook_receipts (shop_domain, topic, webhook_id, status)
         VALUES ($1,$2,$3,'processing')
         ON CONFLICT (shop_domain, webhook_id) DO NOTHING
         RETURNING status`,
        [shopDomain, topic, webhookId],
      );
      return { acquired: (res.rowCount ?? res.rows.length) > 0 };
    },

    async complete(shopDomain: string, webhookId: string) {
      await db.query(
        `UPDATE shopify_webhook_receipts
         SET status='complete', completed_at=now(), last_error=NULL
         WHERE shop_domain=$1 AND webhook_id=$2`,
        [shopDomain, webhookId],
      );
    },

    async fail(shopDomain: string, webhookId: string, error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await db.query(
        `UPDATE shopify_webhook_receipts
         SET status='failed', last_error=$3
         WHERE shop_domain=$1 AND webhook_id=$2`,
        [shopDomain, webhookId, message.slice(0, 4000)],
      );
    },
  };
}
