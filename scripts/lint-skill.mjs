#!/usr/bin/env node
// CI lint: validate SKILL.md frontmatter + body invariants.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillPath = join(here, "..", ".claude", "skills", "txtbox", "SKILL.md");
const raw = readFileSync(skillPath, "utf8");

const m = raw.match(/^---\n([\s\S]+?)\n---\n([\s\S]*)$/);
if (!m) {
  fail("SKILL.md is missing YAML frontmatter delimited by ---");
}
const frontmatter = m[1];
const body = m[2];

const desc = matchField(frontmatter, "description");
if (!desc) fail("frontmatter missing `description`");
if (desc.length > 500) {
  fail(`description is ${desc.length} chars; must be <= 500`);
}

const allowed = matchField(frontmatter, "allowed-tools");
if (!allowed) fail("frontmatter missing `allowed-tools`");
if (!/mcp__txtbox__send_sms/.test(allowed)) {
  fail("allowed-tools must include mcp__txtbox__send_sms");
}
if (!/Bash\(curl:\*\)/.test(allowed)) {
  fail("allowed-tools must include Bash(curl:*) for the curl-fallback path");
}

if (!body.includes("https://ws-v2.txtbox.com/messaging/v1/sms/push")) {
  fail("body must include the canonical Txtbox endpoint URL");
}
if (!body.includes("X-TXTBOX-Auth")) {
  fail("body must mention the X-TXTBOX-Auth header");
}
if (!/--data-urlencode/.test(body)) {
  fail("body must use --data-urlencode (not raw -d)");
}

console.log("ok: SKILL.md passes lint");
process.exit(0);

function matchField(text, key) {
  // Supports: "key: value" and "key: >\n  multi\n  line"
  const inline = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (inline) {
    const v = inline[1].trim();
    if (v === ">" || v === "|") return matchBlock(text, key);
    return v;
  }
  return null;
}

function matchBlock(text, key) {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (idx === -1) return null;
  const out = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break; // back to top-level key
    out.push(lines[i].trim());
  }
  return out.join(" ").trim();
}

function fail(msg) {
  console.error(`lint: ${msg}`);
  process.exit(1);
}
