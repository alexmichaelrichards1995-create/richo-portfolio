# R.I.C.H.O. Passive Task Store Room

The Passive Task Store Room lets a large TaskGrid registry be serviced by one bounded dispatcher instead of consuming one platform automation slot per stored task.

## Execution model

- Human-facing control plane: Notion `R.I.C.H.O. TaskGrid Registry`.
- Durable execution state: PostgreSQL via `PostgresStore`.
- Dispatcher priority: `P0`, `P1`, `P2`, `P3`.
- Hard execution ceiling: **20 due tasks per cycle**.
- Excess due work remains queued for later cycles.
- Supported cadence grammar: `HOURLY`, `EVERY N HOURS`, `DAILY`, `DAILY HH:MM`, `WEEKLY`, `WEEKLY MON,WED HH:MM`, and `ONCE <timestamp>`.
- Scheduling timezone: `Australia/Brisbane`.
- `ONCE` tasks without a populated `NextDue` are not executable before their cadence timestamp.

## Safety and durability

- Per-task leases suppress concurrent duplicate execution.
- Run IDs are unique per execution attempt, including attempts started at the same task timestamp.
- Lease release is protected by `finally`, including failures while creating the run receipt.
- The in-memory store accepts the engine's simulated time for deterministic lease tests.
- Bounded exponential retry and dead-letter handling are supported.
- Condition-watch `No Change` results remain silent at the adapter/notification layer.
- Tasks can self-disable after a terminal condition is satisfied.
- `Owner Action` and `ApprovalRequired` tasks fail closed into `Waiting Approval` unless explicitly approved.
- The A$48,000 payment lane remains owner-reviewed and is never an automatic debit path.
- Internal `/sync` and `/cycle` endpoints require `TASKGRID_INTERNAL_TOKEN` and fail closed when it is absent.
- No provider credentials or API secrets are stored in source.

## Components

- `cadence.js` — deterministic Brisbane scheduling.
- `engine.js` — selection, leases, unique attempt IDs, timeouts, retries, owner gate, receipts.
- `memory_store.js` — deterministic test store.
- `postgres_store.js` — durable tasks, leases, runs, dead letters and queue metrics.
- `notion_adapter.js` — paginated Notion TaskGrid reader/writer contract.
- `sync.js` — control-plane synchronizer.
- `control_plane_store.js` — durable-store/Notion bridge.
- `http.js` — health, readiness, metrics and authenticated internal control endpoints.
- `../migrations/003_taskgrid_store_room.sql` — PostgreSQL schema.

## Environment contract

Production wiring is environment-driven. Do not commit values.

```text
DATABASE_URL=<postgres connection string>
NOTION_TOKEN=<Notion integration secret>
TASKGRID_NOTION_DATA_SOURCE_ID=<TaskGrid data source id>
TASKGRID_INTERNAL_TOKEN=<high-entropy internal control token>
PORT=<optional service port>
```

Deployment must install those values in the target platform's encrypted secret store. They should not be pasted into source files, issue comments, pull-request bodies, logs, or chat.

## CI gates

`.github/workflows/taskgrid-ci.yml` verifies:

- PostgreSQL 16 service readiness;
- schema application twice for migration idempotency;
- deterministic dispatcher/regression tests;
- future `ONCE` suppression;
- unique same-timestamp run IDs;
- lease release when `recordRun` fails;
- deterministic memory-store lease expiry;
- Notion adapter contract tests;
- PostgreSQL durability/lease integration tests;
- internal-token fail-closed behavior;
- TaskGrid committed-secret scanning.

CI does **not** prove a production Notion connection, production database connectivity, provider credentials, or external live actions.

## Production release gate

Do not label the Store Room `VERIFIED_LIVE` until all of the following are evidenced in the target deployment:

1. encrypted `DATABASE_URL`, `NOTION_TOKEN`, `TASKGRID_NOTION_DATA_SOURCE_ID`, and `TASKGRID_INTERNAL_TOKEN` are installed;
2. migration is applied to the intended production database;
3. `/health` responds successfully;
4. `/ready` proves durable storage reachable;
5. authenticated `/internal/sync` completes against the intended Notion registry;
6. authenticated `/internal/cycle` processes a controlled non-consequential test task;
7. a durable run receipt is present;
8. duplicate/concurrent replay is suppressed;
9. no owner-gated consequential task executes without approval;
10. logs contain no credentials or sensitive task payloads.

Until those gates are demonstrated, the correct state is `CODED_AND_CI_VERIFIED_NOT_DEPLOYED` once CI is green.
