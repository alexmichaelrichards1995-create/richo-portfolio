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
