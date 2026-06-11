# Security Policy

## Reporting a vulnerability

Email **security@elnora.ai** with details, or use
[GitHub Security Advisories](https://github.com/Elnora-AI/elnora-merit-aktiva/security/advisories/new).
Do not open a public issue for a security vulnerability. We aim to acknowledge
within 3 business days.

## Credential handling

This CLI authenticates to the Merit Aktiva API with an **API ID** and **API
Key**. The API Key is an HMAC shared secret — treat it like a password.

- Credentials are read from environment variables (`MERIT_API_ID`,
  `MERIT_API_KEY`) or an env file at `~/.config/elnora-merit/.env` (written with
  mode `0600`) or a local `./.env`. Base-URL overrides (`MERIT_BASE_URL`,
  `MERIT_PALK_BASE_URL`) are honored only from the real environment or the home
  env file — never from a `./.env` in the working directory, so a cloned
  repository cannot redirect signed requests to another host.
- **Never commit a populated `.env`.** The shipped `.gitignore` excludes it; the
  committed `.env.template` contains only placeholders.
- The CLI redacts credentials and request signatures from error output.
- Every request is signed with HMAC-SHA256 over `apiId + timestamp + body`; the
  timestamp is regenerated on each retry so stale-timestamp rejections cannot be
  replayed.

## Supported versions

The latest published version receives security fixes.
