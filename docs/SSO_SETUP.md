Enterprise SSO / SAML Setup (scaffold)

This doc explains the minimal steps to enable SSO for Enterprise customers:

1. Choose a SAML library: passport-saml (Node), samlify (Node), or your language equivalent.
2. Configure Service Provider (SP) settings: entityID, ACS URL (/sso/saml/acs), certificate/private key.
3. Provide SP metadata at /sso/saml/metadata for IdP onboarding.
4. Map SAML attributes to your user and org model (e.g., email, org_id, role).
5. Implement user provisioning and SCIM if you need automated user management.
6. Test with IdP test tenants (Okta, OneLogin, Azure AD) and require KYC for Enterprise payouts.

Security notes:
- Validate signatures and timestamps on SAML assertions.
- Enforce audience and destination checks.
- Log SSO events for audit and troubleshooting.
