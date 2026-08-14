/* posthog_server.js
 * Minimal server-side PostHog capture client using the public ingestion API.
 * No personal API key is used. Project token is read from environment.
 */

const DEFAULT_HOST = 'https://us.i.posthog.com';

async function capturePostHogEvent(message, options = {}) {
  const token = options.token || process.env.POSTHOG_PROJECT_TOKEN;
  const host = (options.host || process.env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || global.fetch;

  if (!token) throw new Error('POSTHOG_PROJECT_TOKEN is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  if (!message || !message.event || !message.distinctId) throw new Error('PostHog event and distinctId are required');

  const payload = {
    api_key: token,
    event: String(message.event),
    distinct_id: String(message.distinctId).slice(0, 200),
    properties: message.properties || {},
  };

  if (message.timestamp) payload.timestamp = message.timestamp;
  if (message.uuid) payload.uuid = message.uuid;

  const response = await fetchImpl(`${host}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response || !response.ok) {
    const status = response && response.status ? response.status : 'network';
    throw new Error(`PostHog capture failed (${status})`);
  }

  return { accepted: true };
}

module.exports = { capturePostHogEvent };
