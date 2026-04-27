# txtbox-mcp

Send SMS via the [Txtbox](https://www.txtbox.com) Philippine SMS platform from any Model Context Protocol (MCP) client — Claude Code, Claude Desktop, Cursor, etc. **Hosted as a remote HTTP MCP server** (deploy once on Railway, share the URL with your team) plus a Claude Code Skill that gates invocation tightly and works with **or without** the MCP server reachable.

## Architecture

```
┌────────────┐    HTTP + JSON-RPC      ┌──────────────────────┐    HTTPS      ┌────────────┐
│ Claude     │ ──────────────────────► │ txtbox-mcp           │ ────────────► │ Txtbox     │
│ Code (or   │   X-TXTBOX-Auth: tbx_…  │ (Railway)            │  X-TXTBOX-Auth│ ws-v2 API  │
│ any MCP    │                         │ Stateless relay,     │               │            │
│ client)    │ ◄────────────────────── │ no keys at rest.     │ ◄──────────── │            │
└────────────┘                         └──────────────────────┘               └────────────┘
```

The server is a **stateless relay**. Each request carries the caller's Txtbox API key in the `X-TXTBOX-Auth` header. The server forwards it once to Txtbox and forgets it — no keys are persisted, logged, or shared across requests. Multiple users can share one deployment without exposing each other's accounts.

## Self-host on Railway

1. Push this repo to GitHub.
2. Create a Railway service from the repo. Railway will pick up `Dockerfile` automatically. The healthcheck path (`/healthz`) and start command are pinned in `railway.json`.
3. No env vars are required. Optionally set `TXTBOX_LOG_LEVEL=debug` while testing. **Do not** set `TXTBOX_API_KEY` on the server — keys belong to callers, not the server.
4. After deploy, register the service URL in your MCP client.

### Register in Claude Code

Add to `~/.claude.json`:

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

The `X-TXTBOX-Auth` value is your personal Txtbox API key. Each teammate gets their own — same URL, different key.

### Install the Skill

The skill lives at [`.claude/skills/txtbox/SKILL.md`](./.claude/skills/txtbox/SKILL.md). It's auto-discovered when Claude Code is opened in this repo. To make it global on your machine:

```sh
node scripts/install-skill.mjs
```

This symlinks (or copies, on Windows without Developer Mode) the skill into `~/.claude/skills/txtbox/`.

## Configuration

| Var | Where | Default | Effect |
|---|---|---|---|
| `X-TXTBOX-Auth` (header) | per-request | — | Caller's Txtbox API key. Required. Server forwards as upstream `X-TXTBOX-Auth`. |
| `PORT` | server env | `3000` | HTTP listen port. Railway sets this automatically. |
| `TXTBOX_LOG_LEVEL` | server env | `info` | `error\|warn\|info\|debug`. |
| `TXTBOX_ALLOW_NON_PH` | server env | unset | Set to `1` to honor per-call `allowNonPh:true` and skip PH-shape validation. |
| `TXTBOX_API_KEY` | shell env (Path B only) | — | Used by the Skill's curl-fallback path when the MCP server isn't reachable. |

### Account precondition

The Txtbox project (whose key the caller supplies) must have a **default sender configured** in the Txtbox dashboard. Without one, every send fails with an upstream error.

## Skill behavior

The skill is **MCP-preferred with a documented `curl` fallback**:

- **Path A — MCP over HTTP** (preferred): if `mcp__txtbox__send_sms` is available (i.e. Claude Code has the hosted server registered), the skill calls it. Phone normalization, redaction, 429 retry, structured output.
- **Path B — curl** (fallback): if the MCP tool isn't reachable, the skill falls back to a `curl` against `https://ws-v2.txtbox.com/messaging/v1/sms/push` reading `$TXTBOX_API_KEY` from the shell.

You can use the skill with or without the server. The server is the better default for ergonomics; the curl path is a no-network-server escape hatch.

## Security

- **No API keys at rest on the server.** Each user's Txtbox key lives in *their* Claude Code config. If the Railway box is compromised, no Txtbox accounts are compromised — the attacker only sees keys for in-flight requests.
- **HTTPS-only in production.** Railway terminates TLS at the edge; the server trusts `X-Forwarded-Proto`.
- **Body size limit** at 1 MB per request as a DoS guard.
- **No request logging of bodies or headers.** The structured access log records only method, path, status, and duration. The `X-TXTBOX-Auth` header value is never logged or returned in error responses.
- `redact()` strips the active per-request API key and masks PH phone numbers (`+639XX***NNNN`) on every error/log/MCP-content path. The active key for redaction is read from an `AsyncLocalStorage` request scope, not a global env var.
- **Curl-fallback caveat (Path B only)**: the API key is exported as a shell variable and substituted into the curl command at execution time. Although the skill never echoes the literal key, `set -x` or shell history with timestamps could capture the expanded value. Recommend `set +o history` (zsh/bash) for the duration of a Path B send. Path A is the more secure default.
- The Skill description is gated tightly to "user explicitly wants to send a real SMS to a PH number"; it does not trigger on drafting/discussing/explaining SMS.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/mcp` | `X-TXTBOX-Auth` header | JSON-RPC over Streamable HTTP transport (stateless mode). |
| `GET` | `/healthz` | none | Railway healthcheck. Returns `{"ok": true}`. |
| `GET` | `/` | none | Banner with the MCP path. |

## Troubleshooting

| Symptom | Action |
|---|---|
| `missing_auth` (HTTP 401) | Add `X-TXTBOX-Auth` to your `mcpServers.txtbox.headers` block in `~/.claude.json` and restart Claude Code. |
| `Auth failed (HTTP 401)` from upstream | Key is wrong or revoked. Regenerate in the Txtbox dashboard. |
| `Insufficient Credits` | Top up at [txtbox.com](https://www.txtbox.com). |
| `Unprocessable Entity` / invalid `to` | Check the recipient format. v0.2 accepts `09XXXXXXXXX`, `+639XXXXXXXXX`, `639XXXXXXXXX`. |
| `Rate limited` | Wait a few seconds; the server retries 429 once automatically. |
| `unexpected non-JSON 2xx response` | A CDN error page slipped through. Try again, contact Txtbox support if it persists. |
| Skill not triggering on "send SMS" | Ensure the skill is installed (`/skills` in Claude Code shows `txtbox`) and your prompt includes a Philippine number. |
| Skill triggers but tool fails with "tool not registered" | The skill will fall back to curl. To use the MCP path, register the hosted server in `~/.claude.json` (see "Register in Claude Code") and restart Claude Code. |

## Develop

```sh
npm install
npm run build         # esbuild → dist/server.js
npm start             # PORT=3000 node dist/server.js
npm test              # unit tests + http tests
npm run lint:skill    # SKILL.md frontmatter + body invariants

# Local smoke:
curl -s http://localhost:3000/healthz
curl -s -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-TXTBOX-Auth: tbx_xxx" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}'

# Live integration (sends a real SMS — costs credits):
RUN_LIVE_INTEGRATION=1 \
TXTBOX_API_KEY=tbx_xxx \
TXTBOX_TEST_RECIPIENT=09171234567 \
  npm run test:integration

# Container:
docker build -t txtbox-mcp .
docker run --rm -p 3000:3000 txtbox-mcp
```

CI runs build + unit tests + `npm audit --omit=dev` on every PR. Live integration is `workflow_dispatch` only — never auto-runs.

## License

MIT — pending Multisys legal sign-off for external publication. See [`LICENSE`](./LICENSE).
