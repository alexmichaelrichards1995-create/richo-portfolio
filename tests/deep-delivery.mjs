import assert from 'node:assert/strict';
import { DELIVERY_RUNTIME_SPECS, DELIVERY_RUNTIME_IDS } from '../runtime/rsp-024-033.spec.mjs';
import { evaluateProduct } from '../runtime/product-evaluator.mjs';

const expectedIds = Array.from({length: 10}, (_, index) => `RSP-${String(index + 24).padStart(3, '0')}`);
assert.deepEqual(DELIVERY_RUNTIME_IDS, expectedIds);

for (const id of expectedIds) {
  const spec = DELIVERY_RUNTIME_SPECS[id];
  assert.ok(spec);
  assert.equal(spec.family, 'Product & Delivery');
  assert.ok(spec.stages.length >= 7, `${id} lifecycle too shallow`);
  assert.ok(spec.artefacts.length >= 10, `${id} artefact model too shallow`);
  assert.ok(spec.hardGates.length >= 4, `${id} mandatory gate model too shallow`);
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

  const operating = evaluateProduct(spec, {
    productId: id,
    completedArtefacts: spec.artefacts,
    satisfiedGates: spec.hardGates,
    humanApproval: true,
    operating: true
  });
  assert.equal(operating.state, 'OPERATING');

  const mandatoryFailure = evaluateProduct(spec, {
    productId: id,
    completedArtefacts: spec.artefacts,
    satisfiedGates: spec.hardGates.slice(1),
    humanApproval: true,
    operating: true
  });
  assert.notEqual(mandatoryFailure.state, 'OPERATING');
}

console.log(`Delivery runtime validation PASSED: ${expectedIds.length} products.`);
