import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('GitHub App image is a deterministic non-root Node 22 runtime', async () => {
  const dockerfile = await source('github-app/Dockerfile')

  assert.match(dockerfile, /^FROM node:22-alpine$/m)
  assert.match(dockerfile, /COPY package\.json package-lock\.json/)
  assert.match(dockerfile, /npm ci --omit=dev/)
  assert.match(dockerfile, /^USER node$/m)
  assert.match(dockerfile, /^HEALTHCHECK /m)
  assert.match(dockerfile, /\/health\/live/)
  assert.match(dockerfile, /CMD \["npm", "start"\]/)
  assert.doesNotMatch(dockerfile, /scripts\/migrate\.js/)
})

test('Marketplace migration is an explicit release command, not runtime startup', async () => {
  const packageJson = JSON.parse(await source('github-app/package.json'))

  assert.equal(packageJson.engines.node, '>=22 <23')
  assert.equal(packageJson.scripts.start, 'node src/server.js')
  assert.equal(packageJson.scripts.migrate, 'node scripts/migrate.js')
  assert.doesNotMatch(packageJson.scripts.start, /migrate/)
})

test('current Marketplace architecture requires process lifetime continuity', async () => {
  const server = await source('github-app/src/server.js')

  assert.match(server, /setInterval\(workerTick, 3000\)/)
  assert.match(server, /setInterval\(expirePendingCancellations, 60000\)/)
  assert.match(server, /FOR UPDATE SKIP LOCKED/)
})

test('hosting contract keeps OCI runtime canonical and stale Vercel runtime noncanonical', async () => {
  const contract = await source('github-app/HOSTING_CONTRACT.md')

  assert.match(contract, /Canonical runtime: \*\*OCI container service\*\*/)
  assert.match(contract, /at least one application instance continuously running/)
  assert.match(contract, /Scale-to-zero is not permitted/)
  assert.match(contract, /migrations executed as a separate release job using `npm run migrate`/)
  assert.match(contract, /existing Vercel project named `richo-github-app` is considered \*\*stale\/noncanonical infrastructure\*\*/)
  assert.match(contract, /Do not promote that Vercel project/)
  assert.match(contract, /production container provider/)
  assert.match(contract, /production status remains \*\*NO-GO\*\*/)
})

test('provider selection remains staging-only and owner-gated', async () => {
  const selection = await source('github-app/PROVIDER_SELECTION.md')

  assert.match(selection, /PRE-PRODUCTION \/ RECOMMENDATION ONLY \/ NO PROVISIONING/)
  assert.match(selection, /Preferred staging candidate: Render/)
  assert.match(selection, /Production provider approval remains a separate later gate/)
  assert.match(selection, /Customer-commerce Supabase is \*\*not\*\* in this topology/)
  assert.match(selection, /No spend is authorised by this document/)
  assert.match(selection, /RECOMMENDED \/ NOT PROVISIONED \/ NO-GO FOR PRODUCTION/)
})

test('Render staging blueprint example is fail-closed and commercially isolated', async () => {
  const blueprint = await source('github-app/deploy/render/staging.render.yaml.example')

  assert.match(blueprint, /REFERENCE ONLY/)
  assert.match(blueprint, /autoDeployTrigger: off/)
  assert.match(blueprint, /numInstances: 1/)
  assert.match(blueprint, /region: singapore/)
  assert.match(blueprint, /healthCheckPath: \/health\/live/)
  assert.match(blueprint, /preDeployCommand: npm run migrate/)
  assert.match(blueprint, /plan: starter/)
  assert.match(blueprint, /plan: basic-256mb/)
  assert.match(blueprint, /diskSizeGB: 5/)
  assert.match(blueprint, /storageAutoscalingEnabled: false/)
  assert.match(blueprint, /connectionPool: none/)
  assert.match(blueprint, /ipAllowList: \[\]/)
  assert.match(blueprint, /property: connectionString/)
  assert.match(blueprint, /DATABASE_SSL[\s\S]*value: "true"/)
  assert.match(blueprint, /DATABASE_POOL_MAX[\s\S]*value: "5"/)

  for (const secretName of [
    'PUBLIC_BASE_URL',
    'GITHUB_APP_ID',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_WEBHOOK_SECRET',
    'GITHUB_PRIVATE_KEY_B64',
    'SESSION_SECRET',
    'ADMIN_TOKEN',
  ]) {
    assert.match(blueprint, new RegExp(`key: ${secretName}\\n\\s+sync: false`))
  }

  assert.doesNotMatch(blueprint, /STRIPE_/)
  assert.doesNotMatch(blueprint, /SUPABASE_/)
  assert.doesNotMatch(blueprint, /LEGACY_MARKETPLACE_DATABASE_URL/)
  assert.doesNotMatch(blueprint, /sk_live_|rk_live_|whsec_[A-Za-z0-9]/)
  assert.doesNotMatch(blueprint, /^\s+scaling:/m)
  assert.doesNotMatch(blueprint, /highAvailability:/)
  assert.doesNotMatch(blueprint, /readReplicas:/)
  assert.doesNotMatch(blueprint, /^\s+domains:/m)
})
