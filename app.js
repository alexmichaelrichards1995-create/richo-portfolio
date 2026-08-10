const products = {
  governance: {
    title: 'AI Governance Starter Kit — Readiness Check',
    fields: [
      ['useCase','AI use case is documented'],
      ['owner','A named human decision owner exists'],
      ['risk','Risk tier and prohibited uses are defined'],
      ['evidence','Evidence and decision records are retained'],
      ['incident','Incident and escalation path is defined'],
      ['vendor','AI/vendor due diligence has been completed']
    ]
  },
  pilot: {
    title: 'Paid Pilot Readiness Kit — Pilot Gate',
    fields: [
      ['problem','The business problem is specific and bounded'],
      ['sponsor','A named sponsor/decision maker exists'],
      ['metric','Success metrics are measurable'],
      ['baseline','A baseline or comparison method exists'],
      ['scope','Scope, exclusions and dependencies are written'],
      ['acceptance','Acceptance and close-out criteria are defined']
    ]
  },
  diligence: {
    title: 'Buyer-Ready IP & Due-Diligence Kit — Evidence Gate',
    fields: [
      ['assets','Material IP/assets are inventoried'],
      ['title','Ownership / chain-of-title evidence exists'],
      ['contributors','Contributor rights are documented'],
      ['thirdparty','Third-party dependencies and licences are recorded'],
      ['access','Data-room access and disclosure are controlled'],
      ['gaps','Known evidence gaps have owners and target dates']
    ]
  }
};

function scoreProduct(key) {
  const config = products[key];
  const checked = config.fields.filter(([id]) => document.getElementById(`${key}-${id}`)?.checked).length;
  const score = Math.round((checked / config.fields.length) * 100);
  let state = 'BLOCKED';
  let message = 'Critical readiness gaps remain. Do not treat this workflow as approved for consequential use.';
  if (score >= 85) {
    state = 'READY FOR HUMAN REVIEW';
    message = 'Readiness evidence is substantially complete. A named human must still review and approve activation.';
  } else if (score >= 60) {
    state = 'CONDITIONAL';
    message = 'Core controls exist, but material gaps should be closed before activation.';
  }

  const missing = config.fields
    .filter(([id]) => !document.getElementById(`${key}-${id}`)?.checked)
    .map(([,label]) => label);

  const output = document.getElementById(`${key}-output`);
  output.innerHTML = `
    <div class="score-line"><strong>${score}%</strong><span class="status-pill">${state}</span></div>
    <p>${message}</p>
    ${missing.length ? `<p><strong>Evidence gaps:</strong> ${missing.join('; ')}.</p>` : '<p><strong>Evidence gaps:</strong> none declared in this check.</p>'}
    <p class="fine-print">This is a structured readiness aid, not legal, financial, security, compliance or certification advice.</p>`;
}

function copyResult(key) {
  const output = document.getElementById(`${key}-output`);
  if (!output) return;
  navigator.clipboard?.writeText(output.innerText).then(() => {
    const button = document.querySelector(`[data-copy="${key}"]`);
    if (button) {
      const old = button.textContent;
      button.textContent = 'Copied';
      setTimeout(() => button.textContent = old, 1200);
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-score]').forEach(button => {
    button.addEventListener('click', () => scoreProduct(button.dataset.score));
  });
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', () => copyResult(button.dataset.copy));
  });
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
