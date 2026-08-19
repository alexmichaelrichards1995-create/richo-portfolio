import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8')
const checkout = await readFile(new URL('../app/api/checkout/route.ts', import.meta.url), 'utf8')
const download = await readFile(new URL('../app/api/entitlements/[id]/download/route.ts', import.meta.url), 'utf8')
const onboarding = await readFile(
  new URL('../supabase/richo-digital-deliveries/richo-pilot-199/RICHO_AI_Operations_Pilot_Onboarding.md', import.meta.url),
  'utf8',
)

test('digital delivery bucket is explicitly private and seeded from repository assets', () => {
  assert.match(config, /\[storage\.buckets\.richo-digital-deliveries\]/)
  assert.match(config, /\[storage\.buckets\.richo-digital-deliveries\][\s\S]*?public = false/)
  assert.doesNotMatch(config, /\[storage\.buckets\.richo-digital-deliveries\][\s\S]*?public = true/)
  assert.match(config, /objects_path = "\.\/richo-digital-deliveries"/)
})

test('private delivery MIME allowlist accepts charset-qualified text while staying document-scoped', () => {
  assert.match(config, /allowed_mime_types = \[/)
  assert.match(config, /"text\/\*"/)
  assert.match(config, /"application\/pdf"/)
  assert.match(config, /"application\/zip"/)
  assert.match(config, /"application\/octet-stream"/)
  assert.doesNotMatch(config, /"image\/\*"/)
  assert.doesNotMatch(config, /"video\/\*"/)
})

test('canonical database seed is enabled and contains the Pilot service record', () => {
  assert.match(config, /\[db\.seed\]/)
  assert.match(config, /enabled = true/)
  assert.match(config, /sql_paths = \["\.\/seed\.sql"\]/)
  assert.match(seed, /RICHO-PILOT-199/)
  assert.match(seed, /service_delivery/)
  assert.match(seed, /richo-pilot-199\/RICHO_AI_Operations_Pilot_Onboarding\.md/)
})

test('delivery requires snapshotted private asset metadata and fixed bucket', () => {
  assert.match(checkout, /storage_bucket: storageBucket/)
  assert.match(checkout, /storage_path: storagePath/)
  assert.match(checkout, /delivery_asset_kind: deliveryAssetKind/)
  assert.match(download, /metadataString\(item\.metadata, 'storage_bucket'\)/)
  assert.match(download, /metadataString\(item\.metadata, 'storage_path'\)/)
  assert.match(download, /bucket !== DELIVERY_BUCKET/)
  assert.match(download, /DELIVERY_BUCKET = 'richo-digital-deliveries'/)
  assert.match(download, /safeStoragePath\(path\)/)
  assert.doesNotMatch(download, /getPublicUrl/)
})

test('Pilot onboarding asset is substantive and contains no credential placeholders', () => {
  assert.match(onboarding, /Workflow to assess/)
  assert.match(onboarding, /Current evidence/)
  assert.match(onboarding, /Success criteria/)
  assert.match(onboarding, /Human-review requirements/)
  assert.match(onboarding, /Submission checklist/)
  assert.doesNotMatch(onboarding, /sk_(?:test|live)_/)
  assert.doesNotMatch(onboarding, /sb_secret_/)
  assert.doesNotMatch(onboarding, /whsec_/)
})
