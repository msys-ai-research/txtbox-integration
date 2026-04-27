# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install
npm run build              # esbuild bundle → dist/server.js
npm start                  # PORT=3000 node dist/server.js
npm test                   # full vitest run (unit + http)
npm run test:http          # only HTTP transport tests
npm run lint:skill         # validate .claude/skills/txtbox/SKILL.md frontmatter + body invariants

# Run a single test file or test name:
npx vitest run test/phone.test.ts
npx vitest run -t "normalizes +639 prefix"

# Live integration (sends real SMS, costs credits — opt-in only):
RUN_LIVE_INTEGRATION=1 \
TXTBOX_API_KEY=tbx_xxx \
TXTBOX_TEST_RECIPIENT=09171234567 \
  npm run test:integration
```

CI runs build + unit tests + `npm audit --omit=dev`. The integration suite is `workflow_dispatch` only.

## Architecture

This repo ships **two coupled artifacts** — both must stay coherent:

1. **A remote HTTP MCP server** (deployed to Railway) at `src/`.
2. **A Claude Code skill** at `.claude/skills/txtbox/SKILL.md` that calls the server's tool, with a documented `curl` fallback when the server isn't reachable.

Changes to the tool's input schema, error shapes, or naming must be reflected in both. `npm run lint:skill` enforces SKILL.md invariants.

### Stateless multi-tenant relay

The server holds **no Txtbox API keys at rest**. Each MCP request carries the caller's key in the `X-TXTBOX-Auth` header. The server forwards it once to Txtbox upstream and forgets it. Multiple users share one deployment safely.

This shapes the code:

- `src/http/server.ts` builds a **fresh `McpServer` + transport per request** (`StreamableHTTPServerTransport` in stateless mode, `sessionIdGenerator: undefined`). Both are torn down on response close. Do not introduce session affinity or module-scoped server state.
- `src/util/requestContext.ts` exposes a request-scoped `AsyncLocalStorage` carrying the active API key. `runWithApiKey()` wraps each MCP request handler. `getRequestApiKey()` is consumed by `src/util/redact.ts` so that **error/log/MCP-content redaction uses the per-request key**, not a global env var. If you add new code paths that emit user-facing strings (logs, errors, tool content), route them through `redact()` so the active caller's key is masked even when it appears in upstream error bodies.
- `src/http/auth.ts` extracts and validates the header into `res.locals["apiKey"]` before the handler runs.

### Tool registration

`src/server.ts` is the MCP surface: it registers a single tool (`send_sms`) using `SEND_SMS_NAME`, `SEND_SMS_DESCRIPTION`, and `SendSmsInputShape` exported from `src/tools/sendSms.ts`. New tools should follow the same export pattern (NAME, DESCRIPTION, InputShape, `createXxxHandler({ apiKey })`) so they can be wired in `buildServer()` with the per-request key.

### Upstream client

`src/txtbox/` holds the Txtbox HTTP client. `interpretResponse.ts` maps upstream HTTP/body shapes to user-facing error categories — Txtbox returns 2xx with `{success:false}` in some cases, and CDN error pages can slip through as non-JSON. New error categories belong here, not scattered through handlers.

### Phone normalization

`src/util/phone.ts` is the single normalization point — accepts `09XXXXXXXXX`, `+639XXXXXXXXX`, `639XXXXXXXXX`, strips spaces/dashes/parens, and is bypassed only when `allowNonPh: true` is passed AND `TXTBOX_ALLOW_NON_PH=1` is set on the server. Both conditions are required; do not relax this.

### Build

`esbuild.config.mjs` bundles `src/server.ts` → `dist/server.js` as ESM, externalizing `node:*` and pinned to Node 20. The `npm start` script runs the bundle directly — there is no separate `tsc` typecheck step in the build. Vitest provides type coverage at test time via `tsx`.

## The skill is part of the product

`.claude/skills/txtbox/SKILL.md` ships in the repo and is auto-discovered when Claude Code is opened here. `scripts/install-skill.mjs` symlinks it into `~/.claude/skills/txtbox/` for global use. The skill's `description` field is **deliberately narrow** ("user explicitly wants to send a real SMS to a PH number") to avoid triggering on drafting/explaining/documenting SMS — preserve that gating when editing.

The skill has two paths: **Path A** (MCP tool, preferred) and **Path B** (curl fallback reading `$TXTBOX_API_KEY`). Both must stay aligned with the server's accepted input shape and the upstream Txtbox endpoint shape.

## Configuration surface

Server env: `PORT`, `TXTBOX_LOG_LEVEL`, `TXTBOX_ALLOW_NON_PH`. **Never** set `TXTBOX_API_KEY` on the server — keys belong to callers and arrive per-request. `TXTBOX_API_KEY` in shell env is only for the skill's Path B curl fallback.
