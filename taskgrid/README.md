# R.I.C.H.O. Passive Task Store Room

This module turns the existing TaskGrid model into a bounded dispatcher over a large task registry. It does **not** claim unlimited compute. The registry may hold many rows, while each dispatcher cycle processes at most 20 due tasks and carries the remainder forward.

## Core controls

- Priority ordering: P0 → P1 → P2 → P3.
- Due-state gate: only `Enabled=true`, `Status=Ready` tasks are eligible.
- Deterministic Australia/Brisbane cadence handling for `HOURLY`, `EVERY N HOURS`, `DAILY`, `DAILY HH:MM`, `WEEKLY`, `WEEKLY <day list> HH:MM`, and `ONCE <timestamp>`.
- Per-task leases prevent concurrent duplicate execution.
- Durable run IDs and run records support evidence/audit adapters.
- Bounded exponential retry with terminal dead-letter behavior.
- Consequential `Owner Action` tasks and rows marked `Approval Required` stop in `Waiting Approval` unless owner approval is explicitly present in the execution record.
- Condition-watch adapters may return `No Change`; notification policy belongs to the adapter/dispatcher and should remain silent for no-change outcomes.
- `selfDisable=true` supports one-shot watches such as “Stripe verification approved”.
- No credentials or provider secrets are stored in this source tree.

## Production components

- `engine.js` — bounded priority dispatcher.
- `cadence.js` — deterministic Brisbane-time scheduler.
- `memory_store.js` — deterministic local/test store.
- `postgres_store.js` — transactional task, lease, run, dead-letter and metrics store.
- `notion_adapter.js` — paginated reader/writer for the Notion TaskGrid Registry.
- `sync.js` — Notion → durable-store synchronization.
- `control_plane_store.js` — durable state first, Notion mirror second; control-plane mirror failure never rolls back durable state.
- `http.js` — `/health`, `/ready`, `/metrics`, plus token-protected internal sync/cycle endpoints.
- `migrations/003_taskgrid_store_room.sql` — PostgreSQL schema and indexes.

## Environment contract

- `DATABASE_URL` — PostgreSQL connection string.
- `NOTION_TOKEN` — server-side Notion integration token. Never commit it.
- `NOTION_TASKGRID_DATA_SOURCE_ID` — TaskGrid data-source ID.
- `TASKGRID_INTERNAL_TOKEN` — random secret for internal sync/cycle endpoints.

## Safety boundary

The engine does not automatically send mail, publish, deploy, charge cards, issue refunds, alter account/security settings, accept legal terms, or perform other consequential external actions. Those capabilities must be supplied by explicit adapters and remain owner-gated.

The A$48,000 R.I.C.H.O. offer remains owner-reviewed and must never be auto-debited by a TaskGrid adapter.

## Deployment truth

The code now includes the Notion and PostgreSQL production adapter layers, but they are not live until environment secrets are installed, migration 003 is applied, the service is deployed, and live readiness/sync tests pass. Do not label this VERIFIED_LIVE before those gates are evidenced.

## Tests

Run:

```bash
node tests/taskgrid_store_room.test.js
```

The regression test covers cadence parsing, unsupported cadence rejection, priority ordering, the 20-task batch ceiling, backlog carry-over, owner approval waiting, self-disable, and duplicate lease suppression.
