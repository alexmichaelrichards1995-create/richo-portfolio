import { FOUNDATION_RUNTIME_SPECS } from './rsp-001-003.spec.mjs';
import { GOVERNANCE_RUNTIME_SPECS } from './rsp-004-013.spec.mjs';
import { COMMERCIAL_RUNTIME_SPECS } from './rsp-014-023.spec.mjs';
import { DELIVERY_RUNTIME_SPECS } from './rsp-024-033.spec.mjs';
import { TRANSACTION_RUNTIME_SPECS } from './rsp-034-043.spec.mjs';
import { LEADERSHIP_RUNTIME_SPECS } from './rsp-044-053.spec.mjs';

export const DEEP_RUNTIME_SPECS = Object.freeze({
  ...FOUNDATION_RUNTIME_SPECS,
  ...GOVERNANCE_RUNTIME_SPECS,
  ...COMMERCIAL_RUNTIME_SPECS,
  ...DELIVERY_RUNTIME_SPECS,
  ...TRANSACTION_RUNTIME_SPECS,
  ...LEADERSHIP_RUNTIME_SPECS
});

export const DEEP_RUNTIME_IDS = Object.freeze(Object.keys(DEEP_RUNTIME_SPECS));

export function getDeepProductSpec(productId) {
  return DEEP_RUNTIME_SPECS[productId] || null;
}

export function getDeepProductsByFamily(family) {
  return DEEP_RUNTIME_IDS
    .map(id => ({id, ...DEEP_RUNTIME_SPECS[id]}))
    .filter(product => product.family === family);
}

export function getDeepRuntimeStats() {
  const specs = Object.values(DEEP_RUNTIME_SPECS);
  return {
    products: specs.length,
    artefacts: specs.reduce((sum, spec) => sum + spec.artefacts.length, 0),
    hardGates: specs.reduce((sum, spec) => sum + spec.hardGates.length, 0),
    metrics: specs.reduce((sum, spec) => sum + spec.metrics.length, 0),
    lifecycleStages: specs.reduce((sum, spec) => sum + spec.stages.length, 0),
    families: [...new Set(specs.map(spec => spec.family))]
  };
}
