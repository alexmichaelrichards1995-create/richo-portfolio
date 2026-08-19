class ProductBehaviorAnalytics {
  constructor({ store, executionEngine, eventFabric } = {}) {
    if (!store) throw new Error('ProductBehaviorAnalytics requires store');
    Object.assign(this, { store, executionEngine, eventFabric });
  }

  async track(event) {
    validateEvent(event);
    const saved = await this.store.recordProductEvent({ ...event, occurredAt: event.occurredAt || new Date().toISOString() });
    await this.#emit('analytics.product_event.recorded', { eventId: saved.id, eventName: event.eventName, customerId: event.customerId, productId: event.productId });
    return saved;
  }

  funnel({ events, steps }) {
    const byActor = groupBy(events, e => e.customerId || e.sessionId);
    const counts = steps.map(() => 0);
    for (const actorEvents of byActor.values()) {
      const sorted = [...actorEvents].sort((a,b) => new Date(a.occurredAt) - new Date(b.occurredAt));
      let cursor = 0;
      for (const evt of sorted) {
        if (cursor < steps.length && evt.eventName === steps[cursor]) { counts[cursor]++; cursor++; }
      }
    }
    return steps.map((step, i) => ({ step, users: counts[i], conversionFromStart: counts[0] ? counts[i]/counts[0] : 0, conversionFromPrevious: i === 0 ? 1 : counts[i-1] ? counts[i]/counts[i-1] : 0 }));
  }

  featureAdoption({ events, activeCustomers, featureEventNames = [] }) {
    const adopters = new Set(events.filter(e => featureEventNames.includes(e.eventName)).map(e => e.customerId).filter(Boolean));
    return { adopters: adopters.size, activeCustomers: Number(activeCustomers || 0), adoptionRate: activeCustomers ? adopters.size / activeCustomers : 0 };
  }

  entitlementUtilisation({ entitlements = [], events = [] }) {
    const used = new Set(events.filter(e => e.entitlementId).map(e => e.entitlementId));
    const active = entitlements.filter(e => e.status === 'active');
    const utilised = active.filter(e => used.has(e.id));
    return { activeEntitlements: active.length, utilisedEntitlements: utilised.length, utilisationRate: active.length ? utilised.length / active.length : 0 };
  }

  cohortRetention({ customers = [], events = [], activationEvent = 'product.activated', periodDays = 30, periods = 6 }) {
    const cohorts = new Map();
    for (const customer of customers) {
      const cohortKey = monthKey(customer.createdAt);
      if (!cohorts.has(cohortKey)) cohorts.set(cohortKey, []);
      cohorts.get(cohortKey).push(customer);
    }
    const result = [];
    for (const [cohort, members] of cohorts) {
      const rows = [];
      for (let p = 0; p < periods; p++) {
        let retained = 0;
        for (const m of members) {
          const start = new Date(m.createdAt).getTime() + p * periodDays * 86400000;
          const end = start + periodDays * 86400000;
          if (events.some(e => e.customerId === m.id && e.eventName === activationEvent && new Date(e.occurredAt).getTime() >= start && new Date(e.occurredAt).getTime() < end)) retained++;
        }
        rows.push({ period: p, retained, retentionRate: members.length ? retained/members.length : 0 });
      }
      result.push({ cohort, size: members.length, periods: rows });
    }
    return result;
  }

  churnSignals({ recentEvents = [], supportTickets = [], paymentFailures = 0, daysSinceLastActivity = 0, entitlementUtilisationRate = 1 }) {
    let score = 0;
    const signals = [];
    if (daysSinceLastActivity >= 30) { score += 30; signals.push('inactivity_30d'); }
    else if (daysSinceLastActivity >= 14) { score += 15; signals.push('inactivity_14d'); }
    if (paymentFailures > 0) { score += Math.min(30, paymentFailures * 15); signals.push('payment_failure'); }
    const unresolved = supportTickets.filter(t => !['resolved','closed'].includes(t.status));
    if (unresolved.length >= 2) { score += 20; signals.push('support_friction'); }
    if (entitlementUtilisationRate < .25) { score += 20; signals.push('low_entitlement_utilisation'); }
    if (!recentEvents.length) { score += 10; signals.push('no_recent_events'); }
    return { score: Math.min(100, score), risk: score >= 70 ? 'critical' : score >= 45 ? 'high' : score >= 20 ? 'medium' : 'low', signals };
  }

  async recommend({ productId, analysis, context = {} }) {
    if (!this.executionEngine) return { recommendations: [] };
    const result = await this.executionEngine.execute({ sectionId: 'product', agentId: 'product-analytics-ai', task: { objective: 'Turn product behaviour evidence into specific recommendations for Product, Marketing, Sales, and Customer Success. Do not infer causation where only correlation exists.', productId, analysis, requiredOutput: ['product','marketing','sales','customerSuccess','evidenceGaps'] }, context });
    return result.output || result.result || {};
  }

  async #emit(type, payload) { if (this.eventFabric?.publish) await this.eventFabric.publish({ type, source: 'richo.product-behavior-analytics', payload }); }
}

function validateEvent(e = {}) { if (!e.eventName) throw new Error('eventName required'); if (!e.customerId && !e.sessionId) throw new Error('customerId or sessionId required'); }
function groupBy(items, fn) { const m = new Map(); for (const item of items) { const k = fn(item); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(item); } return m; }
function monthKey(v) { const d = new Date(v); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; }

module.exports = { ProductBehaviorAnalytics };
