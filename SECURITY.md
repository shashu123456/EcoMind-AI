# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting instead: go to the
[Security tab](https://github.com/shashu123456/EcoMind-AI/security) of this
repository and choose **Report a vulnerability**. That opens a private advisory
visible only to you and the maintainer.

If private reporting is unavailable to you, contact the maintainer through the
[GitHub profile](https://github.com/shashu123456) and say only that you have a
security report — details belong in the private channel, not in a direct message
or a public thread.

Please include:

- what the issue is and where it lives (route, file, or screen),
- the steps to reproduce it,
- what an attacker gains,
- the version or commit you tested.

You can expect an acknowledgement within a few days. This is a single-maintainer
project, so a fix may take longer than the acknowledgement; you will be told
which it is rather than left guessing.

## Supported versions

The `main` branch is the supported version. There are no maintained release
branches — fixes land on `main` and are deployed from there.

## Scope

In scope:

- authentication and session handling (`backend/app/core/security.py`,
  `backend/app/routes/auth.py`),
- the SSE stream-token flow,
- dataset upload and file handling,
- injection, path traversal, or authorisation gaps in any API route,
- secrets leaking into logs, the built frontend bundle, or the repository.

Out of scope:

- the demo account shipped for local evaluation (`admin@ecomind.ai` /
  `admin123`) being guessable. It is documented, it is intentional, and it must
  be changed or disabled before any public deployment. A report that this
  account exists is not a vulnerability report.
- findings that require an already-compromised host, or a modified local build.
- missing hardening headers on a purely local development server.

## Deploying this yourself

If you run EcoMind somewhere other than your own machine:

1. Replace the demo admin account, or delete it.
2. Set a fresh `ECOMIND_SECRET_KEY` — the launcher generates one on first start;
   never reuse a committed or shared value.
3. Serve over HTTPS. The session cookie and the bearer token both assume TLS in
   transit.
4. Treat `backend/data/` as sensitive: it holds uploaded datasets and the
   SQLite database.
