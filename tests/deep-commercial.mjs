import assert from 'node:assert/strict';
import { COMMERCIAL_RUNTIME_SPECS, COMMERCIAL_RUNTIME_IDS } from '../runtime/rsp-014-023.spec.mjs';
import { evaluateProduct } from '../runtime/product-evaluator.mjs';

const expectedIds = Array.from({length: 10}, (_, index) => `RSP-${String(index + 14).padStart(3, '0')}`);
assert.deepEqual(COMMERCIAL_RUNTIME_IDS, expectedIds);

for (const id of expectedIds) {
  const spec = COMMERCIAL_RUNTIME_SPECS[id];
  assert.ok(spec);
  assert.equal(spec.family, 'Commercial & Revenue');
  assert.ok(spec.stages.length >= 7, `${id} lifecycle too shallow`);
  assert.ok(spec.artefacts.length >= 10, `${id} artefact model too shallow`);
  assert.ok(spec.hardGates.length >= 6, `${id} mandatory gate model too shallow`);
  assert.ok(spec.metrics.length >= 6, `${id} metrics too shallow`);
  assert.equal(new Set(spec.artefacts).size, spec.artefacts.length, `${id} duplicate artefact`);
  assert.equal(new Set(spec.hardGates).size, spec.hardGates.length, `${id} duplicate hard gate`);

  const blocked = evaluateProduct(spec, {productId: id, completedArtefacts: [], satisfiedGates: [], humanApproval: false});
  assert.equal(blocked.state, 'EVIDENCE_REQUIRED');

  const review = evaluateProduct(spec, {
    productId: id,
    completedArtefacts: spec.artefacts,
    satisfiedGates: spec.hardGates,
    humanApproval: false
  });
  assert.equal(review.state, 'READY_FOR_HUMAN_REVIEW');
  assert.equal(review.weightedScore, 100);

  const approved = evaluateProduct(spec, {
    productId: id,
    completedArtefacts: spec.artefacts,
    satisfiedGates: spec.hardGates,
    humanApproval: true
  });
  assert.equal(approved.state, 'APPROVED');

  const missingMandatoryGate = evaluateProduct(spec, {
    productId: id,
    completedArtefacts: spec.artefacts,
    satisfiedGates: spec.hardGates.slice(0, -1),
    humanApproval: true,
    operating: true
  });
  assert.notEqual(missingMandatoryGate.state, 'OPERATING');
  assert.notEqual(missingMandatoryGate.state, 'APPROVED');
}

console.log(`Commercial runtime validation PASSED: ${expectedIds.length} products.`);
