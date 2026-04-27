---
name: txtbox
description: Use ONLY when the user explicitly requests sending an SMS to a specific Philippine phone number with intent to deliver right now. Do NOT trigger on discussing, documenting, planning, drafting, or explaining SMS. Do NOT trigger for non-PH numbers unless the user has set TXTBOX_ALLOW_NON_PH=1. Confirm the recipient number and message body with the user before sending.
allowed-tools: mcp__txtbox__send_sms, Bash(curl:*)
---

# Txtbox SMS skill

Send a single SMS to a Philippine mobile number via the Txtbox platform.

This skill is **MCP-preferred with a documented `curl` fallback**. It works whether or not the `txtbox` MCP server is registered.

## When to use

Use this skill ONLY when the user is asking you to actually deliver an SMS *now* to a specific PH mobile number. Do not use it when:

- The user is drafting, editing, or reviewing SMS *content* without sending it.
- The user is documenting, planning, or explaining SMS features.
- The user mentions a non-PH number and `TXTBOX_ALLOW_NON_PH=1` is not set.

When in doubt, ask before sending. Texts cost money and are visible to a real person.

## Confirmation pattern (always)

Before any send:

1. Echo back the **recipient number** and the **exact message body** you are about to send.
2. Wait for explicit user confirmation ("yes", "send it", "go").
3. Only then call the tool / curl.

For multi-recipient requests, list every recipient and ask for one bulk confirmation.

## Path A — MCP tool over HTTP (preferred)

If Claude Code is configured with the hosted txtbox MCP server (a Railway URL plus an `X-TXTBOX-Auth` header), the tool `mcp__txtbox__send_sms` will be available. Call it. The hosted server normalizes the phone, redacts secrets in error output, retries 429s automatically, and returns a structured summary.

To register the server, add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "txtbox": {
      "type": "http",
      "url": "https://<your-railway-deployment>.up.railway.app/api/mcp",
      "headers": { "X-TXTBOX-Auth": "tbx_live_..." }
    }
  }
}
```

The header value is your personal Txtbox API key — the server forwards it per-request and stores nothing.

Input schema:

```json
{
  "to": "09171234567",
  "message": "meeting at 3pm",
  "allowNonPh": false
}
```

- `to`: PH mobile, any of `09XXXXXXXXX`, `+639XXXXXXXXX`, `639XXXXXXXXX`. Whitespace, dashes, parens are stripped.
- `message`: plain text. The platform splits messages over 160 chars into multiple billed segments (max 10 segments / 1600 chars).
- `allowNonPh`: optional. Bypasses PH shape validation. Requires `TXTBOX_ALLOW_NON_PH=1` in the **hosted server's** env; ignored otherwise.

Successful response (primary text content):

```
SMS queued: to=+639XX***1234, segments=1, txn_id=abc123
```

The recipient is masked. The unmasked number never appears in tool output.

## Path B — curl fallback

If the MCP tool is **not available** (not registered, or returns "tool not found"), fall back to a single `Bash` call against the documented endpoint. Requires `TXTBOX_API_KEY` exported in the user's shell.

Detection: try Path A first. If the tool is missing, switch to Path B in the same turn. Never run both.

**Use this exact curl shape** (and no other):

```bash
TO="09171234567" MESSAGE="meeting at 3pm" curl --fail-with-body -sS -X POST \
  "https://ws-v2.txtbox.com/messaging/v1/sms/push" \
  -H "X-TXTBOX-Auth: $TXTBOX_API_KEY" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "number=$TO" \
  --data-urlencode "message=$MESSAGE"
```

Notes for the model executing Path B:

- Set `TO` and `MESSAGE` as inline env vars on the command (as shown above) so they don't pollute the shell session.
- Normalize the PH number to canonical `09XXXXXXXXX` form yourself before substitution. Strip spaces, dashes, parens. Convert `+639XXX...` and `639XXX...` to `09XXX...`.
- Use `--data-urlencode` (not raw `-d`) so spaces and special characters in the message are encoded correctly.
- Suggest the user run `set +o history` (zsh/bash) for the duration if they're on a shared machine — the expanded `$TXTBOX_API_KEY` value can otherwise be captured in shell history.
- Parse the response: HTTP non-2xx OR body `{"success":false,...}` ⇒ failure. Use `body.message` or `body.error` as the user-facing reason.

After a successful Path B send, recommend wiring up the hosted MCP server for cleaner ergonomics — add this to `~/.claude.json` and restart Claude Code:

```json
{
  "mcpServers": {
    "txtbox": {
      "type": "http",
      "url": "https://<your-railway-deployment>.up.railway.app/api/mcp",
      "headers": { "X-TXTBOX-Auth": "tbx_live_..." }
    }
  }
}
```

## Multi-recipient

The Txtbox public endpoint accepts one recipient per request. For multi-recipient sends:

- Loop sequentially with **continue-on-error** semantics.
- Hard cap: **20 recipients per request**. If the user asks for more, send the first 20 and ask if they want to continue.
- Return a per-recipient summary: `[{ to, status: "sent" | "failed", error?: string }, ...]`.
- **Never auto-retry** failed recipients. Surface failures and let the user decide.

## Non-PH numbers

If the user wants to send to a non-PH number:

1. Verify `TXTBOX_ALLOW_NON_PH=1` is set in the server env (Path A) or just attempt with the international number (Path B). Ask the user if you're unsure.
2. Path A: pass `allowNonPh: true`.
3. Path B: pass the international number directly; Txtbox will validate server-side.
4. After the send, suggest unsetting `TXTBOX_ALLOW_NON_PH` to re-enable PH shape protection by default.

## Failure modes

| Symptom | User-facing message |
|---|---|
| `Auth failed` / `Invalid Token` | "API key is missing or invalid. For MCP, check the `X-TXTBOX-Auth` value in your `mcpServers.txtbox.headers` block in `~/.claude.json` and restart Claude Code. For curl fallback, `export TXTBOX_API_KEY=...` in the shell." |
| `Insufficient Credits` | "The Txtbox account is out of SMS credits. Top up at https://txtbox.com." |
| `Unprocessable Entity` / invalid `to` | "Recipient format rejected. Double-check the number." |
| `Rate limited` | "Txtbox is throttling requests. Wait a few seconds and retry." |
| `unexpected non-JSON 2xx response` | "Txtbox returned a non-JSON page (likely a CDN error). Try again, then contact Txtbox support if it persists." |
| network error / timeout | "Couldn't reach Txtbox. Check connectivity and retry." |

## Out of scope (v1)

This skill does **not** support:

- Custom sender / mask name (the public field name is unconfirmed; the account default sender is used).
- Bulk / blast endpoint.
- Templates and contact groups.
- Delivery receipts, status polling, webhooks.
- Credit balance lookup.

If the user asks for any of these, say so plainly and point them at the Txtbox webapp.

## Account precondition

The Txtbox project must have a **default sender configured** in the dashboard. Without one, every send fails with an upstream error. If the user hits this, point them at the Txtbox dashboard.
