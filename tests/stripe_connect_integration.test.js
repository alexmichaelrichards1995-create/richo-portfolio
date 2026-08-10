// Integration-style test for stripe_connect and db mapping (file-store fallback)
const stripeConnect = require('../stripe_connect');
const db = require('../db/db_client');

(async () => {
  try {
    const org = { accountId: 99999, login: 'org-test', email: 'test@org.com' };
    const res = await stripeConnect.createConnectAccount(org);
    if (!res || !res.accountId) throw new Error('createConnectAccount did not return accountId');

    const mapped = await db.getConnectedAccount(org.accountId);
    if (!mapped || !mapped.stripe_account_id) throw new Error('Connected account not recorded in DB');

    console.log('OK: stripe_connect createConnectAccount persisted mapping (file-store)');
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err && err.message);
    process.exit(1);
  }
})();
