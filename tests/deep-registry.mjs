import assert from 'node:assert/strict';
import { DEEP_RUNTIME_SPECS, DEEP_RUNTIME_IDS, getDeepRuntimeStats } from '../runtime/deep-registry.mjs';
import { evaluateProduct } from '../runtime/product-evaluator.mjs';

const expectedIds = Array.from({length: 53}, (_, index) => `RSP-${String(index + 1).padStart(3, '0')}`);
assert.deepEqual(DEEP_RUNTIME_IDS, expectedIds, 'Deep registry must cover RSP-001 through RSP-053 without gaps');
assert.equal(new Set(DEEP_RUNTIME_IDS).size, 53, 'Product IDs must be unique');

for (const id of expectedIds) {
  const spec = DEEP_RUNTIME_SPECS[id];
  assert.ok(spec?.name, `${id} missing name`);
  assert.ok(spec?.family, `${id} missing family`);
  assert.ok(spec?.cadence, `${id} missing cadence`);
  assert.ok(spec.stages.length >= 6, `${id} lifecycle too shallow`);
  assert.ok(spec.artefacts.length >= 10, `${id} artefact model too shallow`);
  assert.ok(spec.hardGates.length >= 4, `${id} hard-gate model too shallow`);
  assert.ok(spec.metrics.length >= 6, `${id} metrics model too shallow`);
  assert.equal(new Set(spec.artefacts).size, spec.artefacts.length, `${id} duplicate artefacts`);
  assert.equal(new Set(spec.hardGates).size, spec.hardGates.length, `${id} duplicate hard gates`);

  const fullEvidence = {
    productId: id,
    completedArtefacts: spec.artefacts,
    satisfiedGates: spec.hardGates,
    humanApproval: false
  };
  const review = evaluateProduct(spec, fullEvidence);
  assert.equal(review.state, 'READY_FOR_HUMAN_REVIEW', `${id} complete machine evidence must still stop for human review`);
  assert.equal(review.weightedScore, 100, `${id} full evidence should score 100`);

  const approved = evaluateProduct(spec, {...fullEvidence, humanApproval: true});
  assert.equal(approved.state, 'APPROVED', `${id} should approve only after human approval`);

  const blockedByOneGate = evaluateProduct(spec, {
    ...fullEvidence,
    satisfiedGates: spec.hardGates.slice(1),
    humanApproval: true,
    operating: true
  });
  assert.notEqual(blockedByOneGate.state, 'APPROVED', `${id} must not approve with any mandatory gate failed`);
  assert.notEqual(blockedByOneGate.state, 'OPERATING', `${id} must not operate with any mandatory gate failed`);
}

const stats = getDeepRuntimeStats();
assert.equal(stats.products, 53);
assert.ok(stats.artefacts >= 530, 'Portfolio should model at least 530 product artefacts');
assert.ok(stats.hardGates >= 265, 'Portfolio should model at least 265 mandatory gates');
assert.ok(stats.metrics >= 318, 'Portfolio should model at least 318 operating metrics');
assert.ok(stats.lifecycleStages >= 318, 'Portfolio should model at least 318 lifecycle stages');
assert.equal(stats.families.length, 6);
assert.ok(stats.families.includes('Foundation'));

console.log('Deep registry validation PASSED', stats);
