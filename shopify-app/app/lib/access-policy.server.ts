import { highestMembership, isUsable, type EntitlementRecord } from './entitlements.server';

export type MembershipTier = 'starter' | 'pro' | 'operator';
const tierRank: Record<MembershipTier, number> = { starter: 1, pro: 2, operator: 3 };

export function hasMembership(records: EntitlementRecord[], minimum: MembershipTier) {
  const membership = highestMembership(records);
  if (!membership) return false;
  return (tierRank[membership.resourceKey as MembershipTier] || 0) >= tierRank[minimum];
}

export function canAccessResource(records: EntitlementRecord[], resourceKey: string, minimumTier?: MembershipTier) {
  const direct = records.some((r) => r.resourceKey === resourceKey && isUsable(r));
  if (direct) return true;
  return minimumTier ? hasMembership(records, minimumTier) : false;
}

export function accessSnapshot(records: EntitlementRecord[]) {
  const membership = highestMembership(records);
  return {
    tier: membership?.resourceKey || null,
    downloads: records.filter((r) => r.kind === 'download' && isUsable(r)).map((r) => r.resourceKey),
    services: records.filter((r) => r.kind === 'service' && isUsable(r)).map((r) => r.resourceKey),
  };
}
