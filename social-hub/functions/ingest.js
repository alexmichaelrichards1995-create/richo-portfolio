#!/usr/bin/env node
/*
 * Basic RSS ingest script (example). Requires:
 * npm install rss-parser node-fetch pg
 *
 * Usage:
 *   DATABASE_URL=postgres://... node social-hub/functions/ingest.js
 */

const fs = require('fs');
const path = require('path');
const Parser = require('rss-parser');
const crypto = require('crypto');
const { Client } = require('pg');

const parser = new Parser({ timeout: 10000 });

async function loadConfig() {
  const examplePath = path.join(__dirname, '..', 'config.example.json');
  const cfgPath = path.join(__dirname, '..', 'config.json');
  if (fs.existsSync(cfgPath)) {
    return JSON.parse(fs.readFileSync(cfgPath));
  }
  return JSON.parse(fs.readFileSync(examplePath));
}

function hashItem(item) {
  const s = (item.link || '') + '|' + (item.isoDate || item.pubDate || '') + '|' + (item.title || '') + '|' + (item.contentSnippet || '');
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function ensureSource(client, src) {
  const q = `INSERT INTO sources (id, provider, handle_or_url, title, config, enabled) VALUES ($1,$2,$3,$4,$5,$6)
  ON CONFLICT (id) DO UPDATE SET title = COALESCE(EXCLUDED.title, sources.title), handle_or_url = COALESCE(EXCLUDED.handle_or_url, sources.handle_or_url)`;
  await client.query(q, [src.id, src.provider, src.handle_or_url, src.title || null, src.config || null, src.enabled !== false]);
}

async function saveItem(client, srcId, item, chash) {
  const q = `INSERT INTO items (source_id, canonical_url, title, excerpt, content_html, published_at, fetched_at, content_hash, media_refs, platform_meta)
  VALUES ($1,$2,$3,$4,$5,$6,now(),$7,$8,$9)
  ON CONFLICT (content_hash) DO NOTHING RETURNING id`;

  const media = [];
  if (item.enclosure && item.enclosure.url) {
    media.push({ url: item.enclosure.url, type: item.enclosure.type || null });
  }

  const vals = [srcId, item.link || null, item.title || null, item.contentSnippet || null, item.content || null, item.isoDate ? new Date(item.isoDate) : null, chash, JSON.stringify(media), JSON.stringify(item)];
  const res = await client.query(q, vals);
  return res.rowCount ? res.rows[0].id : null;
}

async function run() {
  const cfg = await loadConfig();
  const sources = cfg.filter(s => s.enabled !== false);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL not set. Exiting.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  for (const src of sources) {
    try {
      await ensureSource(client, src);
      if (src.provider === 'rss') {
        console.log(`Fetching RSS for ${src.id} -> ${src.handle_or_url}`);
        const feed = await parser.parseURL(src.handle_or_url);
        for (const item of feed.items || []) {
          const chash = hashItem(item);
          const saved = await saveItem(client, src.id, item, chash);
          if (saved) console.log('Saved item', saved, item.title || item.link);
        }
        await client.query('UPDATE sources SET last_checked_at = now() WHERE id = $1', [src.id]);
      } else {
        console.log(`Skipping provider ${src.provider} for ${src.id} (not implemented in this example)`);
      }
    } catch (err) {
      console.error('Error processing source', src.id, err && err.message);
      await client.query('INSERT INTO sync_jobs (source_id, status, last_error, run_duration_seconds) VALUES ($1,$2,$3,$4)', [src.id, 'failed', String(err && err.message).slice(0,200), 0]);
    }
  }

  await client.end();
  console.log('Ingest run complete.');
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}
