export type ProductSignal = {
  id: string;
  title: string;
  status: string;
  descriptionLength: number;
  mediaCount: number;
  price: number;
  sessions?: number;
  addToCarts?: number;
  purchases?: number;
  revenue?: number;
};

export type ProductIntelligence = ProductSignal & {
  score: number;
  conversionRate: number;
  addToCartRate: number;
  issues: string[];
  recommendation: string;
};

const pct = (n = 0, d = 0) => d > 0 ? (n / d) * 100 : 0;

export function scoreProduct(product: ProductSignal): ProductIntelligence {
  const issues: string[] = [];
  let score = 100;

  if (product.status !== "ACTIVE") { score -= 30; issues.push("Product is not active."); }
  if (product.descriptionLength < 250) { score -= 15; issues.push("Description is too thin for a confident buying decision."); }
  if (product.mediaCount === 0) { score -= 20; issues.push("No product media is attached."); }
  if (product.price <= 0) { score -= 25; issues.push("Price is missing or non-positive."); }

  const sessions = product.sessions ?? 0;
  const carts = product.addToCarts ?? 0;
  const purchases = product.purchases ?? 0;
  const addToCartRate = pct(carts, sessions);
  const conversionRate = pct(purchases, sessions);

  if (sessions >= 25 && carts === 0) { score -= 20; issues.push("Traffic is not producing add-to-cart intent."); }
  if (carts >= 3 && purchases === 0) { score -= 15; issues.push("Cart intent is not converting to purchases."); }

  const recommendation = issues.length === 0
    ? "Maintain the offer and gather more evidence before changing it."
    : issues[0].includes("Traffic")
      ? "Test offer clarity, proof, CTA hierarchy and pricing context before acquiring more traffic."
      : "Repair the highest-impact catalog issue first, then re-measure product funnel performance.";

  return {
    ...product,
    score: Math.max(0, Math.min(100, score)),
    addToCartRate,
    conversionRate,
    issues,
    recommendation,
  };
}

export function rankProducts(products: ProductSignal[]) {
  return products.map(scoreProduct).sort((a, b) => a.score - b.score || (b.sessions ?? 0) - (a.sessions ?? 0));
}
