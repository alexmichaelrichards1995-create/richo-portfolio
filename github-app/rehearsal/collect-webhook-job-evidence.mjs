#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import process from 'node:process'
import pg from 'pg'

const { Pool } = pg
const envName = process.env.RICHO_ENVIRONMENT || ''
const databaseUrl = process.env.DATABASE_URL || ''
const deliveryId = process.env.RCP_WEBHOOK_DELIVERY_ID || ''
const jobId = process.env.RCP_JOB_ID || ''

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (envName !== 'staging') fail('RICHO_ENVIRONMENT must equal staging')
if (!databaseUrl) fail('DATABASE_URL is required')
if (!deliveryId && !jobId) fail('Set RCP_WEBHOOK_DELIVERY_ID and/or RCP_JOB_ID')
if (/prod|production/i.test(databaseUrl)) fail('DATABASE_URL appears production-like; refusing rehearsal')

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  max: 1,
})

const evidence = {
  generated_at: new Date().toISOString(),
  environment: 'staging',
  webhook: null,
  job: null,
  note: 'Read-only collector. Connection strings, payload bodies, secrets, tokens and raw audit detail are not emitted.'
}

try {
  if (deliveryId) {
    const delivery = await pool.query(
      `SELECT delivery_id, event_name, action, status, processed_at
         FROM webhook_deliveries
        WHERE delivery_id = $1
        LIMIT 1`,
      [deliveryId],
    )
    const audit = await pool.query(
      `SELECT action, target_type, target_id
         FROM audit_log
        WHERE target_type = 'webhook_delivery' AND target_id = $1
        ORDER BY id DESC
        LIMIT 5`,
      [deliveryId],
    )
    evidence.webhook = {
      requested_delivery_id: deliveryId,
      found: delivery.rowCount === 1,
      receipt: delivery.rows[0] || null,
      audit_actions: audit.rows,
    }
  }

  if (jobId) {
    const job = await pool.query(
      `SELECT id, kind, status, attempts, max_attempts, available_at, locked_at, created_at, updated_at
         FROM jobs
        WHERE id = $1
        LIMIT 1`,
      [jobId],
    )
    const audit = await pool.query(
      `SELECT action, target_type, target_id
         FROM audit_log
        WHERE target_type = 'job' AND target_id = $1
        ORDER BY id DESC
        LIMIT 5`,
      [String(jobId)],
    )
    evidence.job = {
      requested_job_id: String(jobId),
      found: job.rowCount === 1,
      receipt: job.rows[0] || null,
      audit_actions: audit.rows,
    }
  }
} finally {
  await pool.end()
}

const serialized = JSON.stringify(evidence)
const forbiddenValues = [
  process.env.GITHUB_CLIENT_SECRET,
  process.env.GITHUB_WEBHOOK_SECRET,
  process.env.GITHUB_PRIVATE_KEY_B64,
  process.env.SESSION_SECRET,
  process.env.ADMIN_TOKEN,
].filter(Boolean)
for (const value of forbiddenValues) {
  if (serialized.includes(value)) fail('Evidence output contains a forbidden secret value')
}
if (serialized.includes(databaseUrl)) fail('Evidence output contains DATABASE_URL')

const output = process.argv[2] || 'webhook-job-evidence.json'
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
console.log(`Wrote redacted webhook/job evidence to ${output}`)
