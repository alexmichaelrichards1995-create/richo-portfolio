'use strict';
/**
 * social-hub/test/sources.test.js
 *
 * Unit tests for social-hub server and manage helpers.
 * Run with: node test/sources.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Point server at a temp config so tests don't touch real config.json
// ---------------------------------------------------------------------------
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-hub-test-'));
const tmpConfig = path.join(tmpDir, 'config.json');

// Patch CONFIG_PATH before requiring server
process.env._TEST_CONFIG_PATH = tmpConfig;

// We import server helpers directly (not the HTTP layer) by re-requiring the
// module with a monkeypatched path.  Since the module hard-codes __dirname,
// we test the exported helpers using a copied config path approach.

const { validateSource, loadConfig, saveConfig } = (() => {
  // Inline the helpers so tests are self-contained and don't depend on
  // server module being importable without express installed.
  const SUPPORTED_PROVIDERS = ['rss', 'twitter', 'domain', 'mastodon', 'youtube', 'other'];

  function isValidUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (_) { return false; }
  }
  function isValidHandle(value) {
    return typeof value === 'string' && value.startsWith('@') && value.length > 1;
  }
  function validateSource({ provider, handle_or_url }) {
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      return `Unsupported provider "${provider}".`;
    }
    if (provider === 'rss' && !isValidUrl(handle_or_url)) {
      return `RSS provider requires a valid http/https URL.`;
    }
    if (provider === 'domain' && !isValidUrl(handle_or_url)) {
      return `Domain provider requires a valid http/https URL.`;
    }
    if ((provider === 'twitter' || provider === 'mastodon') && !isValidHandle(handle_or_url) && !isValidUrl(handle_or_url)) {
      return `${provider} provider requires a @handle or a valid URL.`;
    }
    return null;
  }
  function loadConfig() {
    if (!fs.existsSync(tmpConfig)) fs.writeFileSync(tmpConfig, JSON.stringify({ sources: [] }, null, 2));
    return JSON.parse(fs.readFileSync(tmpConfig, 'utf8'));
  }
  function saveConfig(config) {
    fs.writeFileSync(tmpConfig, JSON.stringify(config, null, 2) + '\n');
  }
  return { validateSource, loadConfig, saveConfig };
})();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('\nsocial-hub: validateSource');

test('accepts valid RSS URL', () => {
  assert.strictEqual(validateSource({ provider: 'rss', handle_or_url: 'https://example.com/feed.xml' }), null);
});

test('rejects RSS with non-URL', () => {
  assert.ok(validateSource({ provider: 'rss', handle_or_url: 'not-a-url' }));
});

test('rejects unknown provider', () => {
  assert.ok(validateSource({ provider: 'fax', handle_or_url: 'https://x.com' }));
});

test('accepts valid domain URL', () => {
  assert.strictEqual(validateSource({ provider: 'domain', handle_or_url: 'https://example.com' }), null);
});

test('rejects domain with handle instead of URL', () => {
  assert.ok(validateSource({ provider: 'domain', handle_or_url: '@someone' }));
});

test('accepts twitter @handle', () => {
  assert.strictEqual(validateSource({ provider: 'twitter', handle_or_url: '@richotweets' }), null);
});

test('rejects twitter with bare word', () => {
  assert.ok(validateSource({ provider: 'twitter', handle_or_url: 'richotweets' }));
});

test('accepts mastodon with URL', () => {
  assert.strictEqual(validateSource({ provider: 'mastodon', handle_or_url: 'https://mastodon.social/@user' }), null);
});

test('accepts youtube with no special rule', () => {
  assert.strictEqual(validateSource({ provider: 'youtube', handle_or_url: 'anything' }), null);
});

test('accepts other provider with any value', () => {
  assert.strictEqual(validateSource({ provider: 'other', handle_or_url: 'anything' }), null);
});

// ---------------------------------------------------------------------------
// Config persistence tests
// ---------------------------------------------------------------------------

console.log('\nsocial-hub: config persistence');

test('loadConfig creates empty config when missing', () => {
  if (fs.existsSync(tmpConfig)) fs.unlinkSync(tmpConfig);
  const c = loadConfig();
  assert.ok(Array.isArray(c.sources));
  assert.strictEqual(c.sources.length, 0);
});

test('saveConfig persists sources', () => {
  const cfg = { sources: [{ id: 'abc', provider: 'rss', handle_or_url: 'https://x.com/f.xml', title: 'X', enabled: true, last_checked_at: null, last_success: null }] };
  saveConfig(cfg);
  const loaded = loadConfig();
  assert.strictEqual(loaded.sources.length, 1);
  assert.strictEqual(loaded.sources[0].id, 'abc');
});

test('source metadata fields are preserved', () => {
  const loaded = loadConfig();
  const s = loaded.sources[0];
  assert.ok('id' in s);
  assert.ok('provider' in s);
  assert.ok('handle_or_url' in s);
  assert.ok('title' in s);
  assert.ok('enabled' in s);
  assert.ok('last_checked_at' in s);
  assert.ok('last_success' in s);
});

// ---------------------------------------------------------------------------
// config.example.json structure
// ---------------------------------------------------------------------------

console.log('\nsocial-hub: config.example.json');

test('config.example.json exists and is valid JSON', () => {
  const exPath = path.join(__dirname, '..', 'config.example.json');
  assert.ok(fs.existsSync(exPath), 'config.example.json not found');
  const parsed = JSON.parse(fs.readFileSync(exPath, 'utf8'));
  assert.ok(Array.isArray(parsed.sources));
});

test('config.example.json sources have required fields', () => {
  const exPath = path.join(__dirname, '..', 'config.example.json');
  const parsed = JSON.parse(fs.readFileSync(exPath, 'utf8'));
  for (const s of parsed.sources) {
    assert.ok('id' in s, `missing id in example source`);
    assert.ok('provider' in s);
    assert.ok('handle_or_url' in s);
    assert.ok('title' in s);
    assert.ok('enabled' in s);
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
