(function (root) {
  'use strict';

  const VERSION = '2.0.0';
  const CONTROLS = Object.freeze([
    { id: 'useCase', label: 'AI use case is documented', weight: 15, critical: true },
    { id: 'owner', label: 'A named human decision owner exists', weight: 20, critical: true },
    { id: 'risk', label: 'Risk tier and prohibited uses are defined', weight: 20, critical: true },
    { id: 'evidence', label: 'Evidence and decision records are retained', weight: 15, critical: true },
    { id: 'incident', label: 'Incident and escalation path is defined', weight: 15, critical: true },
    { id: 'vendor', label: 'AI/vendor due diligence has been completed', weight: 15, critical: false }
  ]);

  function normalize(input) {
    const source = input && typeof input === 'object' ? input : {};
    const controls = source.controls && typeof source.controls === 'object' ? source.controls : {};
    return {
      assessmentId: String(source.assessmentId || '').trim(),
      assessor: String(source.assessor || '').trim(),
      useCaseName: String(source.useCaseName || '').trim(),
      evidenceRefs: Array.isArray(source.evidenceRefs) ? source.evidenceRefs.map(v => String(v).trim()).filter(Boolean) : [],
      controls: Object.fromEntries(CONTROLS.map(c => [c.id, controls[c.id] === true]))
    };
  }

  function validate(input) {
    const value = normalize(input);
    const errors = [];
    if (!value.assessmentId) errors.push('assessmentId is required');
    if (!value.assessor) errors.push('assessor is required');
    if (!value.useCaseName) errors.push('useCaseName is required');
    return { valid: errors.length === 0, errors, value };
  }

  function scoreControls(controls) {
    return CONTROLS.reduce((score, control) => score + (controls[control.id] ? control.weight : 0), 0);
  }

  function assess(input, options) {
    const checkedAt = options && options.checkedAt ? new Date(options.checkedAt) : new Date();
    if (Number.isNaN(checkedAt.getTime())) throw new TypeError('checkedAt must be a valid date');
    const validation = validate(input);
    if (!validation.valid) {
      return Object.freeze({ version: VERSION, valid: false, errors: validation.errors.slice(), status: 'INVALID', score: 0 });
    }

    const value = validation.value;
    const score = scoreControls(value.controls);
    const missing = CONTROLS.filter(c => !value.controls[c.id]).map(c => ({ id: c.id, label: c.label, critical: c.critical, weight: c.weight }));
    const criticalMissing = missing.filter(c => c.critical);
    let status = 'BLOCKED';
    let reason = 'Material governance controls remain incomplete.';

    if (criticalMissing.length === 0 && score >= 85) {
      status = 'READY_FOR_HUMAN_REVIEW';
      reason = 'Weighted readiness threshold met and all critical controls are declared complete. Human approval is still required.';
    } else if (criticalMissing.length === 0 && score >= 60) {
      status = 'CONDITIONAL';
      reason = 'Critical controls are complete, but additional governance evidence should be closed before activation.';
    } else if (criticalMissing.length) {
      reason = 'One or more mandatory critical controls are incomplete.';
    }

    return Object.freeze({
      version: VERSION,
      valid: true,
      productId: 'RSP-001',
      assessmentId: value.assessmentId,
      assessor: value.assessor,
      useCaseName: value.useCaseName,
      checkedAt: checkedAt.toISOString(),
      score,
      status,
      reason,
      humanApprovalRequired: true,
      evidenceRefs: value.evidenceRefs.slice(),
      controls: CONTROLS.map(c => ({ ...c, complete: value.controls[c.id] })),
      missing,
      criticalMissing
    });
  }

  function stableExport(result) {
    if (!result || typeof result !== 'object') throw new TypeError('assessment result is required');
    return JSON.stringify(result, Object.keys(result).sort(), 2);
  }

  const api = Object.freeze({ VERSION, CONTROLS, normalize, validate, scoreControls, assess, stableExport });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RICHO_RSP001 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
