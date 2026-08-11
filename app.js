const products = {
  governance: {
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

const familyChecks = {
  'Foundation': [
    'Objective and buyer/use-case trigger are bounded',
    'A named owner or sponsor is accountable',
    'Required evidence and inputs are available',
    'Scope, exclusions and dependencies are explicit',
    'Acceptance / decision criteria are defined',
    'Licence, disclosure and human-approval boundaries are understood'
  ],
  'Governance, Risk & Assurance': [
    'In-scope use cases, assets, vendors or obligations are inventoried',
    'Human authority and accountable owners are assigned',
    'Risk, obligation or control requirements are mapped',
    'Current evidence exists for material controls',
    'Exceptions, incidents and escalation routes are defined',
    'Review, testing and reassessment cadence is defined'
  ],
  'Commercial & Revenue': [
    'Buyer, segment, trigger or opportunity is defined',
    'Offer/value/pricing evidence is documented',
    'Named commercial owner and decision stage are clear',
    'Scope, terms, entitlements or commercial boundaries are explicit',
    'Baseline and measurable outcome metrics exist',
    'Acceptance, renewal, experiment or next-decision gate is defined'
  ],
  'Product & Delivery': [
    'Requirements, service or delivery scope is defined',
    'Owners, roles and acceptance authority are assigned',
    'Dependencies and readiness blockers are recorded',
    'Test, quality or operational evidence is defined',
    'Changes, defects, incidents or exceptions are controlled',
    'Acceptance, rollback, recovery or close-out gate is defined'
  ],
  'Procurement, Market Access & Transactions': [
    'Counterparty, market, transaction or submission scope is defined',
    'Required evidence and response obligations are inventoried',
    'Owners and approval authority are assigned',
    'Rights, obligations, restrictions and dependencies are mapped',
    'Access, confidentiality and disclosure controls are defined',
    'Submission, transaction, transfer or market-entry gate is defined'
  ],
  'Leadership, Workforce & Operating System': [
    'Objective, decision or workforce scope is defined',
    'Authority, roles and accountabilities are explicit',
    'Metrics, evidence and reporting requirements are defined',
    'Risks, exceptions and escalation routes are controlled',
    'Review, learning or governance cadence is defined',
    'Actions, competency, remediation or closure are verified'
  ]
};

const SALES_EMAIL = 'sales@richosystems.technology';
const featuredOffers = {
  'RSP-001': { label: 'A$2,950 + GST', billing: 'one-off' },
  'RSP-002': { label: 'A$4,950 + GST', billing: 'one-off' },
  'RSP-003': { label: 'A$7,500 + GST', billing: 'one-off' },
  'BUNDLE-TRILOGY': { label: 'A$12,500 + GST', billing: 'one-off' }
};

function readinessState(score) {
  if (score >= 85) return ['READY FOR HUMAN REVIEW','Readiness evidence is substantially complete. A named human must still review and approve activation.'];
  if (score >= 60) return ['CONDITIONAL','Core controls exist, but material gaps should be closed before activation.'];
  return ['BLOCKED','Critical readiness gaps remain. Do not treat this workflow as approved for consequential use.'];
}

function scoreProduct(key) {
  const config = products[key];
  const checked = config.fields.filter(([id]) => document.getElementById(`${key}-${id}`)?.checked).length;
  const score = Math.round((checked / config.fields.length) * 100);
  const [state,message] = readinessState(score);
  const missing = config.fields.filter(([id]) => !document.getElementById(`${key}-${id}`)?.checked).map(([,label]) => label);
  renderOutput(`${key}-output`, score, state, message, missing);
}

function renderOutput(outputId, score, state, message, missing) {
  const output = document.getElementById(outputId);
  if (!output) return;
  output.innerHTML = `
    <div class="score-line"><strong>${score}%</strong><span class="status-pill">${state}</span></div>
    <p>${message}</p>
    ${missing.length ? `<p><strong>Evidence gaps:</strong> ${missing.join('; ')}.</p>` : '<p><strong>Evidence gaps:</strong> none declared in this check.</p>'}
    <p class="fine-print">Structured readiness aid only. It does not provide professional advice, certification or autonomous approval.</p>`;
}

function copyResult(key) {
  const output = document.getElementById(`${key}-output`);
  if (!output) return;
  navigator.clipboard?.writeText(output.innerText).then(() => {
    const button = document.querySelector(`[data-copy="${key}"]`);
    if (!button) return;
    const old = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => button.textContent = old, 1200);
  });
}

function renderCatalog(query = '') {
  const mount = document.getElementById('catalog-grid');
  const select = document.getElementById('catalog-product');
  const catalog = window.RICHO_CATALOG || [];
  const q = query.trim().toLowerCase();
  const matches = catalog.filter(p => `${p.id} ${p.name} ${p.family}`.toLowerCase().includes(q));

  if (mount) {
    mount.innerHTML = matches.map(p => `
      <button type="button" class="catalog-item" data-product-id="${p.id}">
        <span class="badge">${p.id}</span>
        <strong>${p.name}</strong>
        <small>${p.family}</small>
      </button>`).join('');
    document.getElementById('catalog-count').textContent = `${matches.length} / ${catalog.length} products`;
    mount.querySelectorAll('[data-product-id]').forEach(button => {
      button.addEventListener('click', () => selectCatalogProduct(button.dataset.productId));
    });
  }

  if (select && !select.dataset.loaded) {
    select.innerHTML = catalog.map(p => `<option value="${p.id}">${p.id} — ${p.name}</option>`).join('');
    select.dataset.loaded = 'true';
  }
}

function selectCatalogProduct(id) {
  const product = (window.RICHO_CATALOG || []).find(p => p.id === id);
  if (!product) return;
  const select = document.getElementById('catalog-product');
  if (select) select.value = id;
  renderFamilyAssessment(product);
  document.getElementById('catalog-assessment')?.scrollIntoView({behavior:'smooth',block:'center'});
}

function renderFamilyAssessment(product) {
  const checks = familyChecks[product.family] || familyChecks.Foundation;
  const title = document.getElementById('catalog-assessment-title');
  const family = document.getElementById('catalog-assessment-family');
  const list = document.getElementById('catalog-checklist');
  const output = document.getElementById('catalog-output');
  if (title) title.textContent = `${product.id} — ${product.name}`;
  if (family) family.textContent = product.family;
  if (list) list.innerHTML = checks.map((label,index) => `<label><input type="checkbox" data-catalog-check="${index}" />${label}</label>`).join('');
  if (output) output.textContent = 'Select only controls supported by evidence, then run the product readiness gate.';
}

function scoreCatalogProduct() {
  const id = document.getElementById('catalog-product')?.value;
  const product = (window.RICHO_CATALOG || []).find(p => p.id === id);
  if (!product) return;
  const checks = familyChecks[product.family] || familyChecks.Foundation;
  const inputs = [...document.querySelectorAll('[data-catalog-check]')];
  const checked = inputs.filter(input => input.checked).length;
  const score = Math.round((checked / checks.length) * 100);
  const [state,message] = readinessState(score);
  const missing = checks.filter((_,index) => !inputs[index]?.checked);
  renderOutput('catalog-output', score, state, message, missing);
}

function populatePurchaseProducts() {
  const select = document.getElementById('purchase-product');
  if (!select) return;
  const catalog = window.RICHO_CATALOG || [];
  const options = [];
  options.push('<option value="">Select product</option>');
  options.push(`<option value="BUNDLE-TRILOGY" data-price="${featuredOffers['BUNDLE-TRILOGY'].label}" data-billing="${featuredOffers['BUNDLE-TRILOGY'].billing}">Commercial Readiness Trilogy — ${featuredOffers['BUNDLE-TRILOGY'].label}</option>`);
  for (const product of catalog) {
    const offer = featuredOffers[product.id] || { label: 'Price on request', billing: 'custom' };
    options.push(`<option value="${product.id}" data-price="${offer.label}" data-billing="${offer.billing}">${product.id} — ${product.name} (${offer.label})</option>`);
  }
  select.innerHTML = options.join('');
}

function getSelectedPurchaseProduct() {
  const select = document.getElementById('purchase-product');
  const value = select?.value || '';
  if (!value || !select) return null;
  const selected = select.options[select.selectedIndex];
  const label = selected?.textContent || value;
  return {
    id: value,
    label,
    price: selected?.dataset.price || 'Price on request',
    billing: selected?.dataset.billing || 'custom'
  };
}

function buildPurchaseRequest() {
  const name = document.getElementById('purchase-name')?.value?.trim() || '';
  const email = document.getElementById('purchase-email')?.value?.trim() || '';
  const company = document.getElementById('purchase-company')?.value?.trim() || '';
  const budget = document.getElementById('purchase-budget')?.value?.trim() || '';
  const notes = document.getElementById('purchase-notes')?.value?.trim() || '';
  const product = getSelectedPurchaseProduct();
  if (!product || !name || !email) return null;

  const lines = [
    'R.I.C.H.O. PURCHASE REQUEST',
    `Product: ${product.id}`,
    `Offer: ${product.label}`,
    `Price: ${product.price}`,
    `Billing type: ${product.billing}`,
    `Buyer name: ${name}`,
    `Buyer email: ${email}`,
    `Company: ${company || 'Not provided'}`,
    `Budget (AUD): ${budget || 'Not provided'}`,
    `Notes: ${notes || 'None provided'}`,
    `Requested at: ${new Date().toISOString()}`
  ];

  return {
    subject: `Purchase request - ${product.id}`,
    body: lines.join('\n')
  };
}

function updatePurchaseOutput(message) {
  const output = document.getElementById('purchase-output');
  if (output) output.textContent = message;
}

function getCheckoutLink(productId) {
  const links = window.RICHO_STRIPE_LINKS || {};
  const value = links[productId];
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed.startsWith('https://buy.stripe.com/')) return '';
  return trimmed;
}

function appendCheckoutEmail(checkoutUrl, email) {
  if (!checkoutUrl || !email) return checkoutUrl;
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set('prefilled_email', email);
    return url.toString();
  } catch (error) {
    return checkoutUrl;
  }
}

function sendPurchaseRequest() {
  const request = buildPurchaseRequest();
  if (!request) {
    updatePurchaseOutput('Please select a product and complete full name + work email before sending.');
    return;
  }
  const product = getSelectedPurchaseProduct();
  const checkoutUrl = product ? getCheckoutLink(product.id) : '';
  if (checkoutUrl) {
    updatePurchaseOutput(`Redirecting to secure Stripe Checkout for ${product.id}...`);
    window.location.href = appendCheckoutEmail(checkoutUrl, document.getElementById('purchase-email')?.value?.trim() || '');
    return;
  }

  const mailto = `mailto:${SALES_EMAIL}?subject=${encodeURIComponent(request.subject)}&body=${encodeURIComponent(request.body)}`;
  updatePurchaseOutput(`${request.body}\n\nStripe checkout is not configured for this product yet, so we prepared an email request.`);
  window.location.href = mailto;
}

function copyPurchaseRequest() {
  const request = buildPurchaseRequest();
  if (!request) {
    updatePurchaseOutput('Please select a product and complete full name + work email before copying.');
    return;
  }
  navigator.clipboard?.writeText(request.body).then(() => {
    updatePurchaseOutput(`${request.body}\n\nCopied to clipboard.`);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-score]').forEach(button => button.addEventListener('click', () => scoreProduct(button.dataset.score)));
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copyResult(button.dataset.copy)));

  renderCatalog();
  const search = document.getElementById('catalog-search');
  if (search) search.addEventListener('input', () => renderCatalog(search.value));
  const selector = document.getElementById('catalog-product');
  if (selector) {
    selector.addEventListener('change', () => selectCatalogProduct(selector.value));
    if ((window.RICHO_CATALOG || []).length) selectCatalogProduct(window.RICHO_CATALOG[0].id);
  }
  document.getElementById('catalog-score')?.addEventListener('click', scoreCatalogProduct);
  populatePurchaseProducts();
  selector?.addEventListener('change', () => {
    const purchase = document.getElementById('purchase-product');
    if (purchase && [...purchase.options].some(option => option.value === selector.value)) {
      purchase.value = selector.value;
    }
  });
  document.getElementById('purchase-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    sendPurchaseRequest();
  });
  document.getElementById('purchase-copy')?.addEventListener('click', copyPurchaseRequest);

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
});
