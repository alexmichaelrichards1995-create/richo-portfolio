/* sso_passport_saml.js
 * Passport-SAML scaffold for SAML SSO as a Service Provider (SP).
 * - Exposes /sso/metadata (EntityDescriptor) and /sso/acs (assertion consumer service)
 * - Exports a factory to create a configured passport-saml Strategy
 * - NO runtime dependency on passport or passport-saml is required for the scaffold to exist
 *   (install passport and passport-saml in production/dev when enabling SSO)
 */

const express = require('express');
const router = express.Router();

// config is read from environment in runtime: SAML_CALLBACK_URL, SAML_ISSUER, SAML_CERT, SAML_PRIVATE_KEY
function buildSamlConfig() {
  return {
    callbackUrl: process.env.SAML_CALLBACK_URL || 'https://your-app.example.com/sso/acs',
    entryPoint: process.env.SAML_IDP_SSO_URL || '',
    issuer: process.env.SAML_ISSUER || 'urn:your-app',
    cert: process.env.SAML_IDP_CERT || process.env.SAML_CERT || null,
    decryptionPvk: process.env.SAML_PRIVATE_KEY || null,
    // additional options (forceAuthn, identifierFormat, acceptedClockSkewMs) can be added
  };
}

// metadata endpoint: when a real passport-saml Strategy is created, it exposes a generateServiceProviderMetadata function
router.get('/sso/metadata', (req, res) => {
  // If passport-saml is installed and a strategy instance is wired, prefer its metadata function.
  // Fallback: return a minimal static metadata placeholder so IdP admins can inspect endpoints.
  const issuer = process.env.SAML_ISSUER || 'urn:your-app';
  const acsUrl = process.env.SAML_CALLBACK_URL || (req.protocol + '://' + req.get('host') + '/sso/acs');

  const rudimentary = `<?xml version="1.0"?>\n<EntityDescriptor entityID="${issuer}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">\n  <SPSSODescriptor AuthnRequestsSigned="false" WantAssertionsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">\n    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="1"/>\n  </SPSSODescriptor>\n</EntityDescriptor>`;

  res.type('application/xml').send(rudimentary);
});

// ACS endpoint (POST) — in real usage, passport-saml will handle and call the verify callback.
router.post('/sso/acs', express.urlencoded({ extended: false }), (req, res) => {
  // For scaffold, acknowledge receipt. Real implementation delegates to passport.authenticate('saml')
  res.status(200).send('SAML ACS endpoint (scaffold) — wire passport-saml Strategy for real handling');
});

module.exports = {
  router,
  buildSamlConfig,
};
