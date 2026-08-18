import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8')
const checkout = await readFile(new URL('../app/api/checkout/route.ts', import.meta.url), 'utf8')
const download = await readFile(new URL('../app/api/entitlements/[id]/download/route.ts', import.meta.url), 'utf8')

test('digital delivery bucket is explicitly private', () => {
  assert.match(config, /\[storage\.buckets\.richo-digital-deliveries\]/)
  assert.match(config, /\[storage\.buckets\.richo-digital-deliveries\][\s\S]*?public = false/)
  assert.doesNotMatch(config, /\[storage\.buckets\.richo-digital-deliveries\][\s\S]*?public = true/)
})

test('download delivery requires snapshotted private asset metadata', () => {
  assert.match(checkout, /storage_bucket: storageBucket/)
  assert.match(checkout, /storage_path: storagePath/)
  assert.match(download, /metadataString\(item\.metadata, 'storage_bucket'\)/)
  assert.match(download, /metadataString\(item\.metadata, 'storage_path'\)/)
  assert.doesNotMatch(download, /getPublicUrl/)
})
