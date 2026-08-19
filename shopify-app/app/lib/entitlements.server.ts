import crypto from 'node:crypto';

export type EntitlementKind = 'download' | 'membership' | 'service';
export type EntitlementStatus = 'active' | 'revoked' | 'expired';

export interface EntitlementInput {
  shop: string;
  customerId: string;
  orderId: string;
  sku: string;
  kind: EntitlementKind;
  resourceKey: string;
  expiresAt?: Date | null;
}

export interface EntitlementRecord extends EntitlementInput {
  id: string;
  status: EntitlementStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntitlementStore {
  upsert(input: EntitlementInput): Promise<EntitlementRecord>;
  listForCustomer(shop: string, customerId: string): Promise<EntitlementRecord[]>;
  revokeByOrder(shop: string, orderId: string, reason: string): Promise<number>;
}

export function entitlementId(input: Pick<EntitlementInput, 'shop'|'customerId'|'orderId'|'sku'|'resourceKey'>) {
  return crypto.createHash('sha256')
    .update([input.shop, input.customerId, input.orderId, input.sku, input.resourceKey].join('|'))
    .digest('hex');
}

export function isUsable(entitlement: EntitlementRecord, now = new Date()) {
  if (entitlement.status !== 'active') return false;
  return !entitlement.expiresAt || entitlement.expiresAt.getTime() > now.getTime();
}

export function highestMembership(records: EntitlementRecord[]) {
  const rank: Record<string, number> = { starter: 1, pro: 2, operator: 3 };
  return records
    .filter((r) => r.kind === 'membership' && isUsable(r))
    .sort((a, b) => (rank[b.resourceKey] || 0) - (rank[a.resourceKey] || 0))[0] || null;
}
