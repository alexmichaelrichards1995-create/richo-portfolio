export type CommerceSnapshot = {
  sessions: number;
  addToCarts: number;
  checkouts: number;
  purchases: number;
  activeProducts: number;
  draftProducts: number;
  collections: number;
  customers: number;
  orders: number;
  revenue: number;
};

export type FindingSeverity = "info" | "watch" | "action" | "critical";

export type RichoFinding = {
  id: string;
  domain: "conversion" | "catalog" | "sales" | "customer" | "governance";
  severity: FindingSeverity;
  title: string;
  evidence: string;
  recommendation: string;
  scoreImpact: number;
};

export type RichoDecision = {
  operatingScore: number;
  conversionRate: number;
  addToCartRate: number;
  checkoutRate: number;
  findings: RichoFinding[];
  nextBestAction: RichoFinding | null;
};

const pct = (numerator: number, denominator: number) =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;

function severityWeight(severity: FindingSeverity) {
  return { info: 1, watch: 2, action: 4, critical: 7 }[severity];
}

export function evaluateCommerce(snapshot: CommerceSnapshot): RichoDecision {
  const findings: RichoFinding[] = [];
  const addToCartRate = pct(snapshot.addToCarts, snapshot.sessions);
  const checkoutRate = pct(snapshot.checkouts, snapshot.sessions);
  const conversionRate = pct(snapshot.purchases, snapshot.sessions);

  if (snapshot.sessions >= 25 && snapshot.addToCarts === 0) {
    findings.push({
      id: "conversion-zero-atc",
      domain: "conversion",
      severity: snapshot.sessions >= 100 ? "critical" : "action",
      title: "Traffic is not entering the buying funnel",
      evidence: `${snapshot.sessions} sessions produced 0 add-to-cart events.`,
      recommendation:
        "Prioritise offer clarity, product-page CTA hierarchy, proof, pricing context and checkout friction before increasing acquisition spend.",
      scoreImpact: -22,
    });
  }

  if (snapshot.addToCarts > 0 && snapshot.checkouts === 0) {
    findings.push({
      id: "checkout-dropoff",
      domain: "conversion",
      severity: "action",
      title: "Cart intent is not reaching checkout",
      evidence: `${snapshot.addToCarts} cart additions produced 0 checkout starts.`,
      recommendation:
        "Inspect cart UX, shipping/digital-delivery messaging, payment confidence, discount expectations and checkout eligibility.",
      scoreImpact: -18,
    });
  }

  if (snapshot.checkouts > 0 && snapshot.purchases === 0) {
    findings.push({
      id: "payment-dropoff",
      domain: "sales",
      severity: "critical",
      title: "Checkout is not converting to paid orders",
      evidence: `${snapshot.checkouts} checkout starts produced 0 purchases.`,
      recommendation:
        "Audit payment methods, checkout errors, trust signals, taxes, discount validity and post-checkout digital-delivery configuration.",
      scoreImpact: -25,
    });
  }

  if (snapshot.activeProducts === 0) {
    findings.push({
      id: "catalog-empty",
      domain: "catalog",
      severity: "critical",
      title: "No active products",
      evidence: "The connected store has no active sellable products.",
      recommendation: "Publish at least one validated offer before running traffic.",
      scoreImpact: -30,
    });
  } else if (snapshot.activeProducts < 3) {
    findings.push({
      id: "catalog-thin",
      domain: "catalog",
      severity: "watch",
      title: "Thin offer ladder",
      evidence: `${snapshot.activeProducts} active product(s) limits buyer segmentation and progression.`,
      recommendation:
        "Create a deliberate entry, core and premium offer ladder rather than adding unrelated products.",
      scoreImpact: -7,
    });
  }

  if (snapshot.sessions > 0 && snapshot.customers === 0) {
    findings.push({
      id: "no-customer-capture",
      domain: "customer",
      severity: "watch",
      title: "Traffic is not creating customer records",
      evidence: `${snapshot.sessions} sessions with no customer capture.`,
      recommendation:
        "Add a value-led lead capture path and measure visitor-to-lead rate separately from purchase conversion.",
      scoreImpact: -8,
    });
  }

  if (snapshot.orders > 0 && snapshot.revenue <= 0) {
    findings.push({
      id: "revenue-integrity",
      domain: "governance",
      severity: "critical",
      title: "Order and revenue data disagree",
      evidence: `${snapshot.orders} orders with ${snapshot.revenue} recorded revenue.`,
      recommendation:
        "Reconcile financial status, test orders, refunds and reporting scope before using revenue metrics for decisions.",
      scoreImpact: -20,
    });
  }

  const penalty = findings.reduce((sum, finding) => sum + Math.abs(finding.scoreImpact), 0);
  const operatingScore = Math.max(0, Math.min(100, 100 - penalty));
  const nextBestAction =
    [...findings].sort(
      (a, b) => severityWeight(b.severity) - severityWeight(a.severity) || a.scoreImpact - b.scoreImpact,
    )[0] ?? null;

  return {
    operatingScore,
    conversionRate,
    addToCartRate,
    checkoutRate,
    findings,
    nextBestAction,
  };
}
