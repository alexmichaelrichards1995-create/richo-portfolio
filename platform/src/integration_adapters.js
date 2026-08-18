class CircuitBreaker {
  constructor({ failureThreshold = 5, resetMs = 30000, clock = () => Date.now() } = {}) {
    this.failureThreshold = failureThreshold;
    this.resetMs = resetMs;
    this.clock = clock;
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = null;
  }

  canExecute() {
    if (this.state !== 'open') return true;
    if (this.clock() - this.openedAt >= this.resetMs) {
      this.state = 'half_open';
      return true;
    }
    return false;
  }

  success() {
    this.failures = 0;
    this.state = 'closed';
    this.openedAt = null;
  }

  failure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = this.clock();
    }
  }
}

class SecretProvider {
  constructor({ getSecret } = {}) {
    if (typeof getSecret !== 'function') throw new Error('SecretProvider requires getSecret');
    this.getSecretImpl = getSecret;
  }
  async get(name) {
    const value = await this.getSecretImpl(name);
    if (!value) throw new Error(`Missing secret: ${name}`);
    return value;
  }
}

class BaseIntegrationAdapter {
  constructor({ name, fetchImpl = globalThis.fetch, secretProvider, breaker = new CircuitBreaker(), maxAttempts = 4, baseDelayMs = 500, eventFabric } = {}) {
    if (!name || !fetchImpl || !secretProvider) throw new Error('Integration adapter missing dependency');
    Object.assign(this, { name, fetchImpl, secretProvider, breaker, maxAttempts, baseDelayMs, eventFabric });
  }

  async request({ url, method = 'GET', headers = {}, body, timeoutMs = 15000, idempotencyKey }) {
    if (!this.breaker.canExecute()) throw new Error(`${this.name} circuit_open`);
    let lastError;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: { 'content-type': 'application/json', ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}), ...headers },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (response.ok) {
          this.breaker.success();
          const text = await response.text();
          return { status: response.status, headers: response.headers, data: text ? JSON.parse(text) : null };
        }
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) throw new Error(`${this.name} http_${response.status}`);
        const retryAfter = Number(response.headers.get?.('retry-after'));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.baseDelayMs * (2 ** (attempt - 1));
        lastError = new Error(`${this.name} retryable_http_${response.status}`);
        if (attempt < this.maxAttempts) await sleep(delay);
      } catch (error) {
        clearTimeout(timer);
        lastError = error;
        if (attempt < this.maxAttempts) await sleep(this.baseDelayMs * (2 ** (attempt - 1)));
      }
    }
    this.breaker.failure();
    if (this.eventFabric?.publish) await this.eventFabric.publish({ type: 'integration.request.failed', source: `richo.${this.name}`, payload: { message: lastError?.message } });
    throw lastError || new Error(`${this.name} request_failed`);
  }
}

class ShopifyAdminAdapter extends BaseIntegrationAdapter {
  constructor({ shopDomain, apiVersion = '2026-07', ...rest } = {}) {
    super({ name: 'shopify-admin', ...rest });
    if (!shopDomain) throw new Error('ShopifyAdminAdapter requires shopDomain');
    this.shopDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    this.apiVersion = apiVersion;
  }
  async graphql(query, variables = {}) {
    const token = await this.secretProvider.get('SHOPIFY_ADMIN_ACCESS_TOKEN');
    return this.request({ url: `https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`, method: 'POST', headers: { 'x-shopify-access-token': token }, body: { query, variables } });
  }
  async getProduct(id) {
    return this.graphql('query($id: ID!){product(id:$id){id title status handle updatedAt variants(first:100){nodes{id sku price}}}}', { id });
  }
}

class AppstleAdapter extends BaseIntegrationAdapter {
  constructor({ baseUrl, ...rest } = {}) {
    super({ name: 'appstle', ...rest });
    if (!baseUrl) throw new Error('AppstleAdapter requires baseUrl');
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  async requestApi({ path, method = 'GET', body }) {
    const token = await this.secretProvider.get('APPSTLE_API_TOKEN');
    return this.request({ url: `${this.baseUrl}${path}`, method, headers: { authorization: `Bearer ${token}` }, body });
  }
  async getMembership(contractId) {
    return this.requestApi({ path: `/memberships/${encodeURIComponent(contractId)}` });
  }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = { CircuitBreaker, SecretProvider, BaseIntegrationAdapter, ShopifyAdminAdapter, AppstleAdapter };
