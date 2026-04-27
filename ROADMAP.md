# Roadmap

v1 wraps only the publicly documented endpoint `POST /messaging/v1/sms/push`. Everything below is deferred until the listed prerequisite is satisfied.

## v2 candidates

### Custom sender / mask name
- **Prereq**: confirm the public field name. Run `scripts/probe-sender.mjs` against an account that has an *approved* custom sender, and identify which of `sender`, `mask_name`, `from`, `sender_id`, `sender_name` is honored.
- **Surface**: add an optional `sender` parameter to `send_sms`. Document the approval process required by Multisys.

### Native batch / blast
- **Prereq**: confirm `/messaging/v1/blast` (and friends) accept the project API key, not session/cookie auth. The webapp gates blasting through OTP (`/auth/v1/otp/initiate/blasting`), which strongly suggests session auth — verify before shipping.
- **Surface**: a new `send_blast` tool with `to: string[]` and per-recipient result. Replaces the skill's sequential loop.

### Delivery receipts / status
- **Prereq**: confirm whether Txtbox supports webhook callbacks or a status polling endpoint, and what the body shape is.
- **Surface**: a `get_message_status` tool, optionally a webhook receiver pattern documented in README.

### Templates
- **Prereq**: confirm `/messaging/v1/template` accepts the project API key.
- **Surface**: `list_templates`, `get_template`, optionally a `send_template_sms` that combines template lookup with send.

### Contact groups
- **Prereq**: confirm `/contacts/v1/contact_group` accepts the project API key.
- **Surface**: `list_contact_groups`, `add_contact`, `remove_contact`. Possibly an MCP `Resource` (read-only) for browsability.

### Credit balance lookup
- **Prereq**: identify the public endpoint (none was visible in the developers JS bundle).
- **Surface**: a `get_balance` tool. Useful to surface in error messages ("you have N credits left").

## Open questions tracked from v1

1. Real success-response body shape — captured during first live integration call; refine `interpretResponse.txnId` extraction paths.
2. Rate-limit signaling specifics — does Txtbox return `Retry-After`? Per-second or per-minute window?
3. Per-message and per-day rate limits per project.
4. Sandbox / staging environment — does one exist?
5. Multisys legal preferences — license, npm registry, Multisys vs `@txtbox` scope.
6. `claude mcp` tool-name format — currently shipped as `mcp__txtbox__send_sms`; verifier in `scripts/install-skill.mjs` catches drift.
