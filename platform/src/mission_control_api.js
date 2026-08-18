const express = require('express');
const { listSections } = require('./section_registry');

function createMissionControlRouter({ store, runtime, scheduler, service } = {}) {
  if (!store) throw new Error('Mission Control API requires store');
  const router = express.Router();

  router.get('/status', async (_req, res, next) => {
    try {
      if (service?.dashboard) return res.json(await service.dashboard());
      const [summary, agents, queued, approvals] = await Promise.all([
        store.getRuntimeSummary?.() || {},
        store.listAgents?.() || [],
        store.listJobs?.({ status: 'queued', limit: 50 }) || [],
        store.listJobs?.({ status: 'awaiting_approval', limit: 50 }) || []
      ]);
      res.json({
        generatedAt: new Date().toISOString(),
        runtime: summary,
        sections: listSections(),
        agents,
        queue: { queued: queued.length, awaitingApproval: approvals.length },
        controls: { runtimeAttached: Boolean(runtime), schedulerAttached: Boolean(scheduler), serviceAttached: Boolean(service) }
      });
    } catch (error) { next(error); }
  });

  router.get('/agents', async (_req, res, next) => {
    try { res.json({ agents: await store.listAgents() }); }
    catch (error) { next(error); }
  });

  router.get('/jobs', async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      res.json({ jobs: await store.listJobs({ status: req.query.status || undefined, limit }) });
    } catch (error) { next(error); }
  });

  router.get('/sections/:sectionId', async (req, res, next) => {
    try {
      if (!service?.sectionDetail) return res.status(503).json({ error: 'mission_control_service_not_attached' });
      const detail = await service.sectionDetail(req.params.sectionId);
      if (!detail) return res.status(404).json({ error: 'unknown_section' });
      res.json(detail);
    } catch (error) { next(error); }
  });

  router.post('/sections/:sectionId/state', async (req, res, next) => {
    try {
      if (!service?.setSectionState) return res.status(503).json({ error: 'mission_control_service_not_attached' });
      const actor = {
        type: req.get('x-richo-actor-type') || 'human',
        id: req.get('x-richo-actor-id') || 'owner'
      };
      const result = await service.setSectionState({
        sectionId: req.params.sectionId,
        desiredState: req.body?.desiredState,
        reason: req.body?.reason,
        actor
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  router.post('/health-sweep', async (_req, res, next) => {
    try {
      if (!runtime) return res.status(503).json({ error: 'runtime_not_attached' });
      res.json({ findings: await runtime.runHealthSweep() });
    } catch (error) { next(error); }
  });

  router.post('/scheduler/tick', async (_req, res, next) => {
    try {
      if (!scheduler) return res.status(503).json({ error: 'scheduler_not_attached' });
      res.json(await scheduler.tick());
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createMissionControlRouter };
