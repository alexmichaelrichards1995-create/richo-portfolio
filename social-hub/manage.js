#!/usr/bin/env node
/**
 * social-hub/manage.js
 *
 * CLI tool for managing social-hub sources in config.json.
 *
 * Usage:
 *   node manage.js list
 *   node manage.js add --provider rss --url https://example.com/feed.xml --title "My Feed"
 *   node manage.js remove --id <id>
 *   node manage.js enable --id <id>
 *   node manage.js disable --id <id>
 *   node manage.js export [--out path/to/backup.json]
 *   node manage.js import --in path/to/backup.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const SUPPORTED_PROVIDERS = ['rss', 'twitter', 'domain', 'mastodon', 'youtube', 'other'];

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    const example = path.join(__dirname, 'config.example.json');
    if (fs.existsSync(example)) {
      fs.copyFileSync(example, CONFIG_PATH);
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
    return `RSS provider requires a valid http/https URL. Got: "${handle_or_url}"`;
  }
  if (provider === 'domain' && !isValidUrl(handle_or_url)) {
    return `Domain provider requires a valid http/https URL. Got: "${handle_or_url}"`;
  }
  if ((provider === 'twitter' || provider === 'mastodon') && !isValidHandle(handle_or_url) && !isValidUrl(handle_or_url)) {
    return `${provider} provider requires a @handle or a valid URL. Got: "${handle_or_url}"`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Arg parsing (minimal, no external deps)
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdList() {
  const config = loadConfig();
  const sources = config.sources || [];
  if (sources.length === 0) {
    console.log('No sources configured.');
    return;
  }
  console.log(`${'ID'.padEnd(24)} ${'PROVIDER'.padEnd(12)} ${'ENABLED'.padEnd(8)} ${'TITLE'.padEnd(30)} HANDLE/URL`);
  console.log('-'.repeat(100));
  for (const s of sources) {
    const enabled = s.enabled ? 'yes' : 'no';
    console.log(
      `${String(s.id).padEnd(24)} ${String(s.provider).padEnd(12)} ${enabled.padEnd(8)} ${String(s.title).padEnd(30)} ${s.handle_or_url}`
    );
    if (s.last_checked_at) {
      console.log(`  last_checked_at: ${s.last_checked_at}  last_success: ${s.last_success || 'never'}`);
    }
  }
}

function cmdAdd(args) {
  const provider = args.provider;
  const handle_or_url = args.url || args.handle || args['handle-or-url'];
  const title = args.title || handle_or_url;
  const enabled = args.disabled ? false : true;

  if (!provider || !handle_or_url) {
    console.error('Usage: node manage.js add --provider <provider> --url <url_or_handle> [--title "..."] [--disabled]');
    process.exit(1);
  }

  const error = validateSource({ provider, handle_or_url });
  if (error) {
    console.error('Validation error:', error);
    process.exit(1);
  }

  const config = loadConfig();
  const id = crypto.randomBytes(6).toString('hex');
  const source = {
    id,
    provider,
    handle_or_url,
    title,
    enabled,
    last_checked_at: null,
    last_success: null,
  };
  config.sources.push(source);
  saveConfig(config);
  console.log(`Added source: ${id} (${provider}) ${handle_or_url}`);
}

function cmdRemove(args) {
  const id = args.id;
  if (!id) {
    console.error('Usage: node manage.js remove --id <id>');
    process.exit(1);
  }
  const config = loadConfig();
  const before = config.sources.length;
  config.sources = config.sources.filter((s) => s.id !== id);
  if (config.sources.length === before) {
    console.error(`No source found with id "${id}"`);
    process.exit(1);
  }
  saveConfig(config);
  console.log(`Removed source: ${id}`);
}

function cmdEnable(args, enabled) {
  const id = args.id;
  if (!id) {
    console.error(`Usage: node manage.js ${enabled ? 'enable' : 'disable'} --id <id>`);
    process.exit(1);
  }
  const config = loadConfig();
  const source = config.sources.find((s) => s.id === id);
  if (!source) {
    console.error(`No source found with id "${id}"`);
    process.exit(1);
  }
  source.enabled = enabled;
  saveConfig(config);
  console.log(`Source ${id} ${enabled ? 'enabled' : 'disabled'}.`);
}

function cmdExport(args) {
  const outPath = args.out || path.join(__dirname, `config-backup-${Date.now()}.json`);
  const config = loadConfig();
  fs.writeFileSync(outPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Config exported to: ${outPath}`);
}

function cmdImport(args) {
  const inPath = args.in;
  if (!inPath) {
    console.error('Usage: node manage.js import --in path/to/backup.json');
    process.exit(1);
  }
  if (!fs.existsSync(inPath)) {
    console.error(`File not found: ${inPath}`);
    process.exit(1);
  }
  let imported;
  try {
    imported = JSON.parse(fs.readFileSync(inPath, 'utf8'));
  } catch (e) {
    console.error('Failed to parse JSON:', e.message);
    process.exit(1);
  }
  if (!Array.isArray(imported.sources)) {
    console.error('Invalid config: missing "sources" array');
    process.exit(1);
  }
  saveConfig(imported);
  console.log(`Imported ${imported.sources.length} source(s) from ${inPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const [, , command, ...rest] = process.argv;
const args = parseArgs(rest);

switch (command) {
  case 'list':
    cmdList();
    break;
  case 'add':
    cmdAdd(args);
    break;
  case 'remove':
  case 'rm':
    cmdRemove(args);
    break;
  case 'enable':
    cmdEnable(args, true);
    break;
  case 'disable':
    cmdEnable(args, false);
    break;
  case 'export':
    cmdExport(args);
    break;
  case 'import':
    cmdImport(args);
    break;
  default:
    console.log(`social-hub manage.js — available commands:
  list                          List all sources
  add   --provider <p> --url <u> [--title "..."] [--disabled]
                                Add a new source
  remove --id <id>              Remove a source by id
  enable  --id <id>             Enable a source
  disable --id <id>             Disable a source
  export [--out path]           Export config.json to a backup file
  import --in path              Import/overwrite config.json from a file

Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}
`);
}
