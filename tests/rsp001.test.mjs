import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const engine = require('../rsp001-engine.js');

const complete = Object.fromEntries(engine.CONTROLS.map(c => [c.id, true]));
const base = { assessmentId: 'A-001', assessor: 'Human Owner', useCaseName: 'Bounded AI use case', evidenceRefs: ['EV-1'], controls: complete };

assert.equal(engine.CONTROLS.reduce((n,c) => n + c.weight, 0), 100, 'weights must total 100');
assert.equal(engine.validate({}).valid, false, 'metadata validation must reject empty assessments');

const ready = engine.assess(base, { checkedAt: '2026-08-11T00:00:00Z' });
assert.equal(ready.valid, true);
assert.equal(ready.score, 100);
assert.equal(ready.status, 'READY_FOR_HUMAN_REVIEW');
assert.equal(ready.humanApprovalRequired, true);
assert.equal(ready.checkedAt, '2026-08-11T00:00:00.000Z');

const missingCriticalControls = { ...complete, owner: false };
const blocked = engine.assess({ ...base, controls: missingCriticalControls }, { checkedAt: '2026-08-11T00:00:00Z' });
assert.equal(blocked.status, 'BLOCKED', 'missing critical control must block regardless of score');
assert.ok(blocked.criticalMissing.some(c => c.id === 'owner'));

const missingNonCriticalControls = { ...complete, vendor: false };
const stillReviewable = engine.assess({ ...base, controls: missingNonCriticalControls }, { checkedAt: '2026-08-11T00:00:00Z' });
assert.equal(stillReviewable.score, 85);
assert.equal(stillReviewable.status, 'READY_FOR_HUMAN_REVIEW');

const invalid = engine.assess({ ...base, assessmentId: '' }, { checkedAt: '2026-08-11T00:00:00Z' });
assert.equal(invalid.status, 'INVALID');
assert.equal(invalid.score, 0);

assert.throws(() => engine.assess(base, { checkedAt: 'not-a-date' }), /valid date/);
assert.match(engine.stableExport(ready), /READY_FOR_HUMAN_REVIEW/);

console.log('RSP-001 V2 qualification tests PASSED');
