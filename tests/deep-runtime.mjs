import assert from 'node:assert/strict';
import { GOVERNANCE_RUNTIME_SPECS, GOVERNANCE_RUNTIME_IDS } from '../runtime/rsp-004-013.spec.mjs';
import { evaluateProduct, createEmptyAssessment } from '../runtime/product-evaluator.mjs';

const expectedIds = Array.from({length: 10}, (_, index) => `RSP-${String(index + 4).padStart(3, '0')}`);
assert.deepEqual(GOVERNANCE_RUNTIME_IDS, expectedIds, 'RSP-004 through RSP-013 must all be present in order');

for (const id of expectedIds) {
  const spec = GOVERNANCE_RUNTIME_SPECS[id];
  assert.ok(spec, `${id} missing spec`);
  assert.ok(spec.name?.length > 5, `${id} missing name`);
  assert.equal(spec.family, 'Governance, Risk & Assurance', `${id} wrong family`);
  assert.ok(spec.stages.length >= 6, `${id} needs a real lifecycle`);
  assert.ok(spec.artefacts.length >= 10, `${id} needs deep artefact coverage`);
  assert.ok(spec.hardGates.length >= 5, `${id} needs mandatory gates`);
  assert.ok(spec.metrics.length >= 6, `${id} needs measurable operating metrics`);
  assert.equal(new Set(spec.artefacts).size, spec.artefacts.length, `${id} duplicate artefacts`);
  assert.equal(new Set(spec.hardGates).size, spec.hardGates.length, `${id} duplicate gates`);

  const empty = createEmptyAssessment(id, spec);
  const emptyResult = evaluateProduct(spec, empty);
  assert.equal(emptyResult.state, 'EVIDENCE_REQUIRED', `${id} empty assessment must not pass`);
  assert.ok(emptyResult.failedGates.length > 0, `${id} empty assessment must expose failed gates`);

  const evidenceComplete = {
    productId: id,
    completedArtefacts: spec.artefacts,
    satisfiedGates: spec.hardGates,
    humanApproval: false
  };
  const reviewResult = evaluateProduct(spec, evidenceComplete);
  assert.equal(reviewResult.state, 'READY_FOR_HUMAN_REVIEW', `${id} must require human approval after evidence completion`);
  assert.equal(reviewResult.weightedScore, 100, `${id} complete evidence must score 100`);

  const approvedResult = evaluateProduct(spec, {...evidenceComplete, humanApproval: true});
  assert.equal(approvedResult.state, 'APPROVED', `${id} should approve only after named human approval`);

  const operatingResult = evaluateProduct(spec, {...evidenceComplete, humanApproval: true, operating: true});
  assert.equal(operatingResult.state, 'OPERATING', `${id} should support an operating state`);

  const gateFailure = evaluateProduct(spec, {
    productId: id,
    completedArtefacts: spec.artefacts,
    satisfiedGates: spec.hardGates.slice(1),
    humanApproval: true
  });
  assert.notEqual(gateFailure.state, 'APPROVED', `${id} cannot approve with a failed mandatory gate`);
  assert.notEqual(gateFailure.state, 'OPERATING', `${id} cannot operate with a failed mandatory gate`);
}

console.log(`Deep runtime validation PASSED: ${expectedIds.length} products, ${expectedIds.reduce((n,id) => n + GOVERNANCE_RUNTIME_SPECS[id].artefacts.length, 0)} artefacts, ${expectedIds.reduce((n,id) => n + GOVERNANCE_RUNTIME_SPECS[id].hardGates.length, 0)} hard gates.`);
