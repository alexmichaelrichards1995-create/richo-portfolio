const { normalizeDatabaseUrl } = require('../db/db_client');

function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const remote = normalizeDatabaseUrl('postgres://user:pass@db.example.com:5432/app?sslmode=require');
expectEqual(new URL(remote).searchParams.get('sslmode'), 'verify-full', 'remote require mode');

const verifyCa = normalizeDatabaseUrl('postgres://user:pass@db.example.com/app?sslmode=verify-ca');
expectEqual(new URL(verifyCa).searchParams.get('sslmode'), 'verify-full', 'remote verify-ca mode');

const strict = normalizeDatabaseUrl('postgres://user:pass@db.example.com/app?sslmode=verify-full');
expectEqual(new URL(strict).searchParams.get('sslmode'), 'verify-full', 'existing strict mode');

const local = normalizeDatabaseUrl('postgres://postgres:postgres@127.0.0.1:5432/postgres?sslmode=require');
expectEqual(new URL(local).searchParams.get('sslmode'), 'require', 'local development mode');

const invalid = 'not-a-url';
expectEqual(normalizeDatabaseUrl(invalid), invalid, 'invalid value pass-through');

console.log('OK: PostgreSQL SSL mode normalization tests passed');
