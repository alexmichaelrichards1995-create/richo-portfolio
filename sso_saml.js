/* sso_saml.js
 * Minimal SSO/SAML scaffold for Enterprise plan onboarding.
 * - Exposes metadata endpoint and ACS (Assertion Consumer Service) handler stub
 * - Integrate with your SAML library (passport-saml, samlify, or custom)
 */

const express = require('express');
const router = express.Router();

// GET /sso/saml/metadata
router.get('/saml/metadata', (req, res) => {
  // Return SP metadata XML (stub)
  const sampleMetadata = `<?xml version="1.0"?>\n<EntityDescriptor entityID="https://example.com/sp">...</EntityDescriptor>`;
  res.type('application/xml').send(sampleMetadata);
});

// POST /sso/saml/acs - Assertion Consumer Service endpoint
router.post('/saml/acs', express.urlencoded({ extended: false }), (req, res) => {
  // In production: validate SAML response, create user session, link to org account
  const samlResponse = req.body.SAMLResponse || req.body.saml_response;
  if (!samlResponse) return res.status(400).send('Missing SAMLResponse');

  console.log('Received SAMLResponse (stub)');
  // TODO: validate, extract attributes, map to user/org, create session
  res.redirect('/');
});

module.exports = { router };
