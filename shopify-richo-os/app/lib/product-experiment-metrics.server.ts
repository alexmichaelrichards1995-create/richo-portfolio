import type { ExperimentMetrics } from "./experiment-ledger.server";

type AdminGraphql = (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;

function numberCell(row: unknown[], index: number) {
  const value = Number(row[index] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function q(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }

export async function fetchProductExperimentMetrics(args: {
  adminGraphql: AdminGraphql;
  productTitle: string;
  productHandle: string;
  from: Date;
  to: Date;
}): Promise<ExperimentMetrics> {
  const since = isoDate(args.from);
  const until = isoDate(args.to);
  const landingPath = `/products/${args.productHandle}`;
  const title = q(args.productTitle);
  const path = q(landingPath);

  const response = await args.adminGraphql(`#graphql
    query RichoProductExperimentMetrics {
      funnel: shopifyqlQuery(query: "FROM sessions SHOW sessions, sessions_with_cart_additions, sessions_that_reached_checkout, sessions_that_completed_checkout WHERE landing_page_path = '${path}' SINCE ${since} UNTIL ${until}") {
        tableData { rows }
        parseErrors
      }
      sales: shopifyqlQuery(query: "FROM sales SHOW orders, total_sales WHERE product_title = '${title}' SINCE ${since} UNTIL ${until}") {
        tableData { rows }
        parseErrors
      }
    }
  `);
  const json = await response.json();
  const parseErrors = [...(json?.data?.funnel?.parseErrors ?? []), ...(json?.data?.sales?.parseErrors ?? [])];
  if (parseErrors.length) throw new Error(`RICHO_PRODUCT_ATTRIBUTION_QUERY_FAILED:${parseErrors.map((e: { message?: string }) => e.message ?? String(e)).join(";")}`);

  const funnelRows: unknown[][] = json?.data?.funnel?.tableData?.rows ?? [];
  const salesRows: unknown[][] = json?.data?.sales?.tableData?.rows ?? [];
  return {
    sessions: funnelRows.reduce((n, r) => n + numberCell(r, 0), 0),
    addToCarts: funnelRows.reduce((n, r) => n + numberCell(r, 1), 0),
    checkouts: funnelRows.reduce((n, r) => n + numberCell(r, 2), 0),
    purchases: funnelRows.reduce((n, r) => n + numberCell(r, 3), 0),
    orders: salesRows.reduce((n, r) => n + numberCell(r, 0), 0),
    revenue: salesRows.reduce((n, r) => n + numberCell(r, 1), 0),
  };
}
