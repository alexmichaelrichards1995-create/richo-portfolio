#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'
import process from 'node:process'

const envName = process.env.RICHO_ENVIRONMENT || ''
const baseUrl = process.env.PUBLIC_BASE_URL || ''

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (envName !== 'staging') fail('RICHO_ENVIRONMENT must equal staging')
if (!/^https:\/\//.test(baseUrl)) fail('PUBLIC_BASE_URL must be an https staging URL')
if (/prod|production/i.test(baseUrl)) fail('PUBLIC_BASE_URL appears production-like; refusing rehearsal')

const response = await fetch(new URL('/auth/github', baseUrl), { redirect: 'manual' })
const location = response.headers.get('location') || ''

let redirectHost = null
let clientIdPresent = false
let callbackMatches = false
let statePresent = false
if (location) {
  const redirect = new URL(location)
  redirectHost = redirect.host
  clientIdPresent = Boolean(redirect.searchParams.get('client_id'))
  statePresent = Boolean(redirect.searchParams.get('state'))
  callbackMatches = redirect.searchParams.get('redirect_uri') === `${baseUrl.replace(/\/$/, '')}/auth/github/callback`
}

const evidence = {
  generated_at: new Date().toISOString(),
  environment: 'staging',
  authorization_endpoint_status: response.status,
  redirect_host: redirectHost,
  redirects_to_github: redirectHost === 'github.com',
  client_id_parameter_present: clientIdPresent,
  signed_state_parameter_present: statePresent,
  callback_matches_staging_host: callbackMatches,
  session_cookie_contract: {
    http_only_required: true,
    secure_required_on_https: true,
    same_site_expected: 'Lax',
    max_age_seconds_expected: 604800,
  },
  interactive_login_completed: false,
  note: 'This collector validates the pre-login OAuth boundary only. It never follows the GitHub authorization redirect, never captures OAuth codes/tokens, and never records cookie values.'
}

const serialized = JSON.stringify(evidence)
for (const value of [
  process.env.GITHUB_CLIENT_SECRET,
  process.env.GITHUB_WEBHOOK_SECRET,
  process.env.SESSION_SECRET,
  process.env.ADMIN_TOKEN,
].filter(Boolean)) {
  if (serialized.includes(value)) fail('Evidence output contains a forbidden secret value')
}

const output = process.argv[2] || 'oauth-boundary-evidence.json'
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 })
console.log(`Wrote redacted OAuth boundary evidence to ${output}`)
