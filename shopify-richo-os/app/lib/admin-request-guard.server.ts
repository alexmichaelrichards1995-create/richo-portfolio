export function assertTrustedAdminPost(request: Request) {
  if (request.method.toUpperCase() !== "POST") throw new Response("Method not allowed", { status: 405 });

  const configured = process.env.SHOPIFY_APP_URL;
  if (!configured) return;
  const expected = new URL(configured).origin;
  const origin = request.headers.get("origin");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (origin && origin !== expected) throw new Response("Untrusted admin action origin", { status: 403 });
  if (secFetchSite && !["same-origin", "same-site", "none"].includes(secFetchSite)) {
    throw new Response("Cross-site admin action blocked", { status: 403 });
  }
}
