import { createLocalCiPostgresLedger } from '../../execution/local-ci-postgres-ledger.mjs'

const databaseUrl = process.env.DATABASE_URL
const verification = JSON.parse(process.env.LEDGER_VERIFICATION_JSON ?? '{}')
const ledger = createLocalCiPostgresLedger({ databaseUrl, nodeEnv: 'test' })

try {
  await ledger.claimAuthorization(verification)
  process.stdout.write('CLAIMED\n')
  process.exitCode = 0
} catch (error) {
  if (/replay|duplicate/i.test(error.message)) {
    process.stdout.write('REPLAY_REJECTED\n')
    process.exitCode = 2
  } else {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
} finally {
  await ledger.close()
}
