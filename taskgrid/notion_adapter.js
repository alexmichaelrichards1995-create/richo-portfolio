'use strict';

function titleText(prop) {
  return (prop?.title || []).map(x => x.plain_text || '').join('');
}
function richText(prop) {
  return (prop?.rich_text || []).map(x => x.plain_text || '').join('');
}
function selectName(prop) { return prop?.select?.name || null; }
function checkbox(prop) { return Boolean(prop?.checkbox); }
function dateStart(prop) { return prop?.date?.start || null; }

function normalizeNotionTask(page) {
  const p = page.properties || {};
  return {
    TaskID: p['Task ID']?.unique_id ? `${p['Task ID'].unique_id.prefix || 'TG'}-${p['Task ID'].unique_id.number}` : page.id,
    NotionPageID: page.id,
    Task: titleText(p.Task),
    Priority: selectName(p.Priority) || 'P3',
    Enabled: checkbox(p.Enabled),
    Status: selectName(p.Status) || 'Paused',
    TaskType: selectName(p['Task Type']) || 'Local',
    Cadence: richText(p.Cadence),
    Source: selectName(p.Source) || 'ChatGPT Dispatcher',
    ApprovalRequired: checkbox(p['Approval Required']),
    OwnerApproved: checkbox(p['Owner Approved']),
    Instruction: richText(p.Instruction),
    NextDue: dateStart(p['Next Due']),
    LastRun: dateStart(p['Last Run']),
    LastResult: richText(p['Last Result']),
    Owner: richText(p.Owner)
  };
}

class NotionAdapter {
  constructor({ token, dataSourceId, apiVersion = '2025-09-03', fetchImpl = global.fetch } = {}) {
    this.token = token || process.env.NOTION_TOKEN;
    this.dataSourceId = dataSourceId || process.env.TASKGRID_NOTION_DATA_SOURCE_ID || process.env.NOTION_TASKGRID_DATA_SOURCE_ID;
    this.apiVersion = apiVersion;
    this.fetch = fetchImpl;
    if (!this.fetch) throw new Error('fetch_unavailable');
  }

  headers() {
    if (!this.token) throw new Error('notion_token_missing');
    return {
      Authorization: `Bearer ${this.token}`,
      'Notion-Version': this.apiVersion,
      'Content-Type': 'application/json'
    };
  }

  async request(path, init = {}) {
    const res = await this.fetch(`https://api.notion.com${path}`, {
      ...init,
      headers: { ...this.headers(), ...(init.headers || {}) }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`notion_${res.status}_${body.code || 'error'}`);
      err.classification = res.status === 429 ? 'RATE_LIMIT' : 'CONNECTOR';
      err.retryAfter = res.headers?.get?.('retry-after') || null;
      throw err;
    }
    return body;
  }

  async listDispatcherTasks({ pageSize = 100 } = {}) {
    if (!this.dataSourceId) throw new Error('notion_data_source_missing');
    const tasks = [];
    let cursor;
    do {
      const body = {
        page_size: Math.min(100, Math.max(1, pageSize)),
        // Fetch enabled and disabled dispatcher rows so a pause/disable made in
        // Notion propagates into durable execution state on the next sync.
        filter: { property: 'Source', select: { equals: 'ChatGPT Dispatcher' } },
        sorts: [
          { property: 'Priority', direction: 'ascending' },
          { property: 'Next Due', direction: 'ascending' }
        ]
      };
      if (cursor) body.start_cursor = cursor;
      const out = await this.request(`/v1/data_sources/${this.dataSourceId}/query`, {
        method: 'POST', body: JSON.stringify(body)
      });
      tasks.push(...(out.results || []).map(normalizeNotionTask));
      cursor = out.has_more ? out.next_cursor : null;
    } while (cursor);
    return tasks;
  }

  async updateTaskPage(pageId, patch) {
    const properties = {};
    if ('Status' in patch) properties.Status = { select: { name: patch.Status } };
    if ('Enabled' in patch) properties.Enabled = { checkbox: Boolean(patch.Enabled) };
    if ('OwnerApproved' in patch) properties['Owner Approved'] = { checkbox: Boolean(patch.OwnerApproved) };
    if ('LastResult' in patch) properties['Last Result'] = { rich_text: [{ type: 'text', text: { content: String(patch.LastResult || '').slice(0, 1900) } }] };
    if ('LastRun' in patch) properties['Last Run'] = { date: patch.LastRun ? { start: patch.LastRun } : null };
    if ('NextDue' in patch) properties['Next Due'] = { date: patch.NextDue ? { start: patch.NextDue } : null };
    if (!Object.keys(properties).length) return;
    await this.request(`/v1/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
  }
}

module.exports = { NotionAdapter, normalizeNotionTask };
