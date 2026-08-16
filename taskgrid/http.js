'use strict';

const crypto = require('crypto');
const express = require('express');

function internalAuthorized(req) {
  const expected = process.env.TASKGRID_INTERNAL_TOKEN;
  const supplied = req.get('x-richo-internal-token');
  if (!expected || !supplied) return false;
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(supplied));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function createTaskGridApp({ store, engine, sync }) {
  if (!store || !engine) throw new Error('taskgrid_dependencies_required');
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'richo-taskgrid-store-room' }));

  app.get('/ready', async (_req, res) => {
    try {
      const metrics = store.metrics ? await store.metrics() : null;
      res.json({ status: 'ready', storage: 'reachable', internalControlConfigured: Boolean(process.env.TASKGRID_INTERNAL_TOKEN), metrics });
    } catch (err) {
      res.status(503).json({ status: 'not_ready', storage: 'unreachable', error: String(err.message || err).slice(0, 300) });
    }
  });

  app.get('/metrics', async (_req, res) => {
    try {
      const metrics = store.metrics ? await store.metrics() : {};
      res.json({ service: 'richo-taskgrid-store-room', batchCeiling: 20, ...metrics });
    } catch (err) {
      res.status(503).json({ error: 'metrics_unavailable', detail: String(err.message || err).slice(0, 300) });
    }
  });

  app.post('/internal/sync', async (req, res) => {
    if (!internalAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
    if (!sync) return res.status(501).json({ error: 'sync_not_configured' });
    try { res.json(await sync()); }
    catch (err) { res.status(502).json({ error: 'sync_failed', detail: String(err.message || err).slice(0, 300) }); }
  });

  app.post('/internal/cycle', async (req, res) => {
    if (!internalAuthorized(req)) return res.status(401).json({ error: 'unauthorized' });
    try { res.json(await engine.cycle(new Date())); }
    catch (err) { res.status(500).json({ error: 'cycle_failed', detail: String(err.message || err).slice(0, 300) }); }
  });

  return app;
}

module.exports = { createTaskGridApp, internalAuthorized };
