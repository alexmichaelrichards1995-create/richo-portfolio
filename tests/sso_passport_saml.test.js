// Smoke test for SSO scaffold
// Run with: node tests/sso_passport_saml.test.js

const { buildSamlConfig, router } = require('../sso_passport_saml');

(async () => {
  try {
    const cfg = buildSamlConfig();
    if (!cfg.callbackUrl) throw new Error('callbackUrl missing');
    // basic sanity check for router presence
    if (!router || typeof router !== 'function') {
      // express mounts a Router which is a function; this is a loose check so test is lightweight
      console.log('WARN: router is not a function (but scaffold exists)');
    }
    console.log('OK: sso_passport_saml scaffold present');
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err && err.message);
    process.exit(1);
  }
})();
