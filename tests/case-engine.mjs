import assert from 'node:assert/strict';
import { DEEP_RUNTIME_IDS, getDeepProductSpec } from '../runtime/deep-registry.mjs';
import {
  createProductCase,
  addEvidence,
  setGate,
  addBlocker,
  closeBlocker,
  decideApproval,
  setOperating,
  setReassessmentDue,
  assessCase,
  exportCaseJson
} from '../runtime/case-engine.mjs';

const now = new Date('2026-08-10T11:30:00Z');
const future = new Date('2027-08-10T11:30:00Z');

for (const productId of DEEP_RUNTIME_IDS) {
  const spec = getDeepProductSpec(productId);
  let record = createProductCase({productId, caseId: `test-${productId}`, owner: 'Test Owner', now});
  let assessment = assessCase(record, now);
  assert.ok(['EVIDENCE_REQUIRED','CONDITIONAL'].includes(assessment.state), `${productId} must start incomplete`);

  for (const artefactId of spec.artefacts) {
    record = addEvidence(record, {
      artefactId,
      state: 'VERIFIED',
      source: 'test-fixture',
      integrity: 'fixture-verified',
      owner: 'Evidence Owner',
      collectedAt: now,
      expiresAt: future,
      id: `ev-${productId}-${artefactId}`
    }, now);
  }
  for (const gateId of spec.hardGates) {
    record = setGate(record, gateId, 'PASSED', {reviewer: 'Gate Reviewer'}, now);
  }

  assessment = assessCase(record, now);
  assert.equal(assessment.state, 'READY_FOR_HUMAN_REVIEW', `${productId} complete machine evidence must stop at human review`);
  assert.equal(assessment.weightedScore, 100, `${productId} complete evidence should score 100`);

  record = decideApproval(record, {decision: 'APPROVED', approver: 'Named Human', note: 'fixture approval'}, now);
  assessment = assessCase(record, now);
  assert.equal(assessment.state, 'APPROVED', `${productId} should approve after named-human decision`);

  record = setOperating(record, true, now);
  assessment = assessCase(record, now);
  assert.equal(assessment.state, 'OPERATING', `${productId} should enter operating only after approval`);

  record = addBlocker(record, {severity: 'P0', code: `P0-${productId}`, description: 'fixture critical blocker', owner: 'Blocker Owner'}, now);
  assessment = assessCase(record, now);
  assert.equal(assessment.state, 'SUSPENDED', `${productId} P0 blocker must suspend reliance`);
  assert.equal(assessment.openP0Blockers.length, 1);

  record = closeBlocker(record, `P0-${productId}`, 'fixture closure evidence', now);
  assessment = assessCase(record, now);
  assert.equal(assessment.state, 'OPERATING', `${productId} can resume prior operating state once P0 blocker is closed`);

  record = setReassessmentDue(record, true, now);
  assessment = assessCase(record, now);
  assert.equal(assessment.state, 'REASSESSMENT_DUE', `${productId} reassessment must interrupt normal operating state`);

  const exported = JSON.parse(exportCaseJson(record, now));
  assert.equal(exported.productId, productId);
  assert.equal(exported.caseId, `test-${productId}`);
  assert.ok(Array.isArray(exported.history) && exported.history.length > 1);
}

const rsp001 = getDeepProductSpec('RSP-001');
let expiryCase = createProductCase({productId: 'RSP-001', caseId: 'expiry-test', owner: 'Test Owner', now});
expiryCase = addEvidence(expiryCase, {
  artefactId: rsp001.artefacts[0],
  state: 'VERIFIED',
  source: 'expiry-fixture',
  integrity: 'verified',
  owner: 'Evidence Owner',
  collectedAt: new Date('2025-01-01T00:00:00Z'),
  expiresAt: new Date('2025-02-01T00:00:00Z'),
  id: 'expired-evidence'
}, now);
const expiryAssessment = assessCase(expiryCase, now);
assert.ok(expiryAssessment.missingArtefacts.includes(rsp001.artefacts[0]), 'Expired evidence must not satisfy an artefact requirement');

assert.throws(
  () => setGate(expiryCase, rsp001.hardGates[0], 'WAIVED', {}, now),
  /named reviewer/,
  'Gate waiver must require named reviewer'
);

assert.throws(
  () => setOperating(createProductCase({productId: 'RSP-001', now}), true, now),
  /named-human approval/,
  'Operating state must reject unapproved cases'
);

console.log(`Case engine validation PASSED for ${DEEP_RUNTIME_IDS.length} products`);
