const API = '/api/mission-control';

const els = {
  metrics: document.getElementById('metrics'),
  sections: document.getElementById('sections'),
  jobs: document.getElementById('jobs'),
  generatedAt: document.getElementById('generated-at'),
  drawer: document.getElementById('drawer'),
  detail: document.getElementById('detail')
};

document.getElementById('refresh')?.addEventListener('click', load);
document.getElementById('close-drawer')?.addEventListener('click', closeDrawer);

async function load() {
  setBusy(true);
  try {
    const data = await json(`${API}/status`);
    renderMetrics(data);
    renderSections(data.sections || []);
    renderJobs(data.recentJobs || []);
    els.generatedAt.textContent = data.generatedAt ? `Updated ${new Date(data.generatedAt).toLocaleString()}` : '';
  } catch (error) {
    els.sections.innerHTML = `<div class="error">Mission Control unavailable: ${escapeHtml(error.message)}</div>`;
  } finally {
    setBusy(false);
  }
}

function renderMetrics(data) {
  const jobs = data.summary?.jobs || {};
  const agents = data.summary?.agents || {};
  const metrics = [
    ['Active AI', (agents.running || 0) + (agents.idle || 0)],
    ['Running Jobs', jobs.running || 0],
    ['Queued Jobs', jobs.queued || 0],
    ['Approvals', data.approvals || jobs.awaiting_approval || 0],
    ['Failed Jobs', jobs.failed || 0]
  ];
  els.metrics.innerHTML = metrics.map(([label, value]) => `
    <article class="metric"><span>${escapeHtml(label)}</span><strong>${value}</strong></article>
  `).join('');
}

function renderSections(sections) {
  els.sections.innerHTML = sections.map(section => `
    <article class="card" data-section="${escapeHtml(section.id)}">
      <div class="card-head">
        <div><small>${escapeHtml(section.id.toUpperCase())}</small><h3>${escapeHtml(section.name)}</h3></div>
        <span class="status ${escapeHtml(section.health)}">${escapeHtml(section.health)}</span>
      </div>
      <p class="agent">${escapeHtml(section.agentId)}</p>
      <div class="mini-grid">
        <span>State <b>${escapeHtml(section.effectiveState)}</b></span>
        <span>Queued <b>${section.queuedJobs || 0}</b></span>
        <span>Running <b>${section.runningJobs || 0}</b></span>
        <span>Approval <b>${section.awaitingApproval || 0}</b></span>
      </div>
      ${section.pauseReason ? `<p class="warning">${escapeHtml(section.pauseReason)}</p>` : ''}
      <div class="actions">
        <button data-open="${escapeHtml(section.id)}">Inspect</button>
        <button data-state="${section.desiredState === 'paused' ? 'running' : 'paused'}" data-id="${escapeHtml(section.id)}">
          ${section.desiredState === 'paused' ? 'Resume' : 'Pause'}
        </button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-open]').forEach(btn => btn.addEventListener('click', () => openSection(btn.dataset.open)));
  document.querySelectorAll('[data-state]').forEach(btn => btn.addEventListener('click', () => changeState(btn.dataset.id, btn.dataset.state)));
}

function renderJobs(jobs) {
  els.jobs.innerHTML = jobs.map(job => `
    <tr>
      <td><span class="status ${escapeHtml(job.status)}">${escapeHtml(job.status)}</span></td>
      <td>${escapeHtml(job.sectionId || '')}</td>
      <td>${escapeHtml(job.agentId || '')}</td>
      <td>${escapeHtml(job.operation || '')}</td>
      <td>${job.createdAt ? new Date(job.createdAt).toLocaleString() : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="5">No jobs recorded.</td></tr>';
}

async function openSection(sectionId) {
  const detail = await json(`${API}/sections/${encodeURIComponent(sectionId)}`);
  els.detail.innerHTML = `
    <p class="eyebrow">${escapeHtml(detail.id.toUpperCase())}</p>
    <h2>${escapeHtml(detail.name)}</h2>
    <p>${escapeHtml(detail.agentId)}</p>
    <h3>Operating State</h3>
    <p>${escapeHtml(detail.effectiveState)} · ${escapeHtml(detail.health)}</p>
    <h3>Recent Memory</h3>
    <div class="memory-list">${(detail.memories || []).map(memory => `
      <article class="memory"><b>${escapeHtml(memory.title || memory.memoryType)}</b><small>${escapeHtml(memory.memoryType)}</small><pre>${escapeHtml(JSON.stringify(memory.content, null, 2))}</pre></article>
    `).join('') || '<p>No durable memory yet.</p>'}</div>
    <h3>Recent Jobs</h3>
    <div class="memory-list">${(detail.recentJobs || []).map(job => `<article class="memory"><b>${escapeHtml(job.operation)}</b><small>${escapeHtml(job.status)}</small></article>`).join('') || '<p>No jobs yet.</p>'}</div>
  `;
  els.drawer.classList.add('open');
  els.drawer.setAttribute('aria-hidden', 'false');
}

async function changeState(sectionId, desiredState) {
  const reason = desiredState === 'paused' ? prompt('Reason for pausing this AI section?') || 'Paused by owner' : 'Resumed by owner';
  await json(`${API}/sections/${encodeURIComponent(sectionId)}/state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-richo-actor-type': 'human', 'x-richo-actor-id': 'owner' },
    body: JSON.stringify({ desiredState, reason })
  });
  await load();
}

function closeDrawer() {
  els.drawer.classList.remove('open');
  els.drawer.setAttribute('aria-hidden', 'true');
}

function setBusy(busy) {
  document.body.classList.toggle('busy', busy);
}

async function json(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

load();
