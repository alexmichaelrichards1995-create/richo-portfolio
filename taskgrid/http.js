'use strict';

const express = require('express');

function createTaskGridApp({ store, engine, sync }) {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'richo-taskgrid-store-room' }));

  app.get('/ready', async (_req, res) => {
    try {
      const metrics = store.metrics ? await store.metrics() : null;
      res.json({ status: 'ready', storage: 'reachable', metrics });
    } catch (err) {
      res.status(503).json({ status: 'not_ready', storage: 'unreachable', error: err.message });
    }
  });

  app.get('/metrics', async (_req, res) => {
    try {
      const metrics = store.metrics ? await store.metrics() : {};
      res.json({ service: 'richo-taskgrid-store-room', batchCeiling: 20, ...metrics });
    } catch (err) {
      res.status(503).json({ error: 'metrics_unavailable', detail: err.message });
    }
  });

  app.post('/internal/sync', async (req, res) => {
    if (req.get('x-richo-internal-token') !== process.env.TASKGRID_INTERNAL_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (!sync) return res.status(501).json({ error: 'sync_not_configured' });
    try { res.json(await sync()); }
    catch (err) { res.status(502).json({ error: 'sync_failed', detail: err.message }); }
  });

  app.post('/internal/cycle', async (req, res) => {
    if (req.get('x-richo-internal-token') !== process.env.TASKGRID_INTERNAL_TOKEN) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    try { res.json(await engine.cycle(new Date())); }
    catch (err) { res.status(500).json({ error: 'cycle_failed', detail: err.message }); }
  });

  return app;
}

module.exports = { createTaskGridApp };
