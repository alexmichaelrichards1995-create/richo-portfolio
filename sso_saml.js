/* sso_saml.js
 * Enterprise SAML entrypoints are intentionally disabled until full implementation.
 */

const express = require('express');
const router = express.Router();

function notImplemented(res) {
  return res.status(501).json({
    error: 'SAML SSO is not implemented in this runtime build',
    required: [
      'signed metadata generation',
      'assertion validation',
      'attribute mapping',
      'session issuance',
      'audit logging',
    ],
  });
}

router.get('/saml/metadata', (req, res) => notImplemented(res));
router.post('/saml/acs', express.urlencoded({ extended: false }), (req, res) => notImplemented(res));

module.exports = { router };
