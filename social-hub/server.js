'use strict';
/**
 * social-hub/server.js
 *
 * Lightweight Express admin server for managing social-hub sources.
 *
 * Endpoints:
 *   GET  /api/sources          – list all sources
 *   POST /api/sources          – add a new source
 *   PUT  /api/sources/:id      – update a source (enable/disable, change title)
 *   DELETE /api/sources/:id    – remove a source
 *   GET  /api/config/export    – download config.json
 *   POST /api/config/import    – upload / overwrite config.json
 *   GET  /                     – serve admin UI (index.html)
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const EXAMPLE_PATH = path.join(__dirname, 'config.example.json');
const PORT = process.env.PORT || 3400;

const SUPPORTED_PROVIDERS = ['rss', 'twitter', 'domain', 'mastodon', 'youtube', 'other'];

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    if (fs.existsSync(EXAMPLE_PATH)) {
      fs.copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
    } else {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify({ sources: [] }, null, 2));
    }
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isValidHandle(value) {
  return typeof value === 'string' && value.startsWith('@') && value.length > 1;
}

function validateSource({ provider, handle_or_url }) {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return `Unsupported provider "${provider}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}`;
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

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple in-memory rate limiter: max 60 requests per IP per minute for /api/* routes
const rateLimitMap = new Map();
function apiRateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const window = 60 * 1000;
  const maxRequests = 60;
  const entry = rateLimitMap.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > window) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }
  next();
}

// Serve static admin UI
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Apply rate limiting to all API routes
app.use('/api', apiRateLimit);

// ---------------------------------------------------------------------------
// GET /api/sources
// ---------------------------------------------------------------------------
app.get('/api/sources', (_req, res) => {
  const config = loadConfig();
  res.json({ sources: config.sources || [] });
});

// ---------------------------------------------------------------------------
// POST /api/sources
// ---------------------------------------------------------------------------
app.post('/api/sources', (req, res) => {
  const { provider, handle_or_url, title, enabled = true } = req.body;

  if (!provider || !handle_or_url) {
    return res.status(400).json({ error: 'provider and handle_or_url are required' });
  }

  const validationError = validateSource({ provider, handle_or_url });
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const config = loadConfig();
  const id = crypto.randomBytes(6).toString('hex');
  const source = {
    id,
    provider,
    handle_or_url,
    title: title || handle_or_url,
    enabled: Boolean(enabled),
    last_checked_at: null,
    last_success: null,
  };
  config.sources.push(source);
  saveConfig(config);
  res.status(201).json({ source });
});

// ---------------------------------------------------------------------------
// PUT /api/sources/:id
// ---------------------------------------------------------------------------
app.put('/api/sources/:id', (req, res) => {
  const { id } = req.params;
  const config = loadConfig();
  const source = config.sources.find((s) => s.id === id);
  if (!source) {
    return res.status(404).json({ error: `Source not found: ${id}` });
  }

  const { title, enabled, handle_or_url, provider } = req.body;

  const updatedProvider = provider !== undefined ? provider : source.provider;
  const updatedUrl = handle_or_url !== undefined ? handle_or_url : source.handle_or_url;

  if (provider !== undefined || handle_or_url !== undefined) {
    const validationError = validateSource({ provider: updatedProvider, handle_or_url: updatedUrl });
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
  }

  if (title !== undefined) source.title = title;
  if (enabled !== undefined) source.enabled = Boolean(enabled);
  if (handle_or_url !== undefined) source.handle_or_url = updatedUrl;
  if (provider !== undefined) source.provider = updatedProvider;

  saveConfig(config);
  res.json({ source });
});

// ---------------------------------------------------------------------------
// DELETE /api/sources/:id
// ---------------------------------------------------------------------------
app.delete('/api/sources/:id', (req, res) => {
  const { id } = req.params;
  const config = loadConfig();
  const before = config.sources.length;
  config.sources = config.sources.filter((s) => s.id !== id);
  if (config.sources.length === before) {
    return res.status(404).json({ error: `Source not found: ${id}` });
  }
  saveConfig(config);
  res.json({ deleted: id });
});

// ---------------------------------------------------------------------------
// GET /api/config/export
// ---------------------------------------------------------------------------
app.get('/api/config/export', (_req, res) => {
  const config = loadConfig();
  res.setHeader('Content-Disposition', 'attachment; filename="social-hub-config.json"');
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(config, null, 2) + '\n');
});

// ---------------------------------------------------------------------------
// POST /api/config/import
// ---------------------------------------------------------------------------
app.post('/api/config/import', (req, res) => {
  const incoming = req.body;
  if (!incoming || !Array.isArray(incoming.sources)) {
    return res.status(400).json({ error: 'Request body must be a JSON object with a "sources" array' });
  }

  const REQUIRED_FIELDS = ['id', 'provider', 'handle_or_url', 'title', 'enabled'];
  const errors = [];
  for (let i = 0; i < incoming.sources.length; i++) {
    const s = incoming.sources[i];
    for (const field of REQUIRED_FIELDS) {
      if (!(field in s)) {
        errors.push(`sources[${i}] missing required field: ${field}`);
      }
    }
    if (!errors.length) {
      const validationError = validateSource({ provider: s.provider, handle_or_url: s.handle_or_url });
      if (validationError) {
        errors.push(`sources[${i}]: ${validationError}`);
      }
    }
  }
  if (errors.length) {
    return res.status(400).json({ error: 'Invalid sources in import', details: errors });
  }

  saveConfig(incoming);
  res.json({ imported: incoming.sources.length });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`social-hub admin server running at http://localhost:${PORT}`);
  });
}

module.exports = { app, loadConfig, saveConfig, validateSource };
