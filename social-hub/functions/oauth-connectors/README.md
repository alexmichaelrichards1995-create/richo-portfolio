# OAuth connector templates

This folder contains placeholder files and instructions for implementing OAuth connectors for platforms like YouTube, Twitter/X, LinkedIn, Instagram, and Facebook.

For each provider create a subfolder named after the provider and include:

- README.md with OAuth endpoints and scopes
- auth/callback handler to exchange code for tokens
- a refresh token job
- a small example that lists the user's recent posts

Security: store client IDs and secrets in environment variables and use a proper secrets manager for production.
