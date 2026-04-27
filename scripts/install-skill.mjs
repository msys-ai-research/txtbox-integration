#!/usr/bin/env node
// Cross-platform installer for the txtbox Claude Code Skill.
// - Symlinks .claude/skills/txtbox from this repo into ~/.claude/skills/txtbox
// - Falls back to recursive copy when symlinks aren't supported (Windows w/o
//   Developer Mode, FAT/exFAT, etc.).
// - --non-interactive aborts (instead of prompting) on conflicts.
//
// In v0.2 the MCP server is hosted (Railway), so we no longer probe
// `claude mcp list` here — the skill is the only thing the installer manages.

import { promises as fs, existsSync, lstatSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const sourceDir = join(repoRoot, ".claude", "skills", "txtbox");
const targetParent = join(homedir(), ".claude", "skills");
const targetDir = join(targetParent, "txtbox");

const args = new Set(process.argv.slice(2));
const nonInteractive = args.has("--non-interactive");

async function ask(question) {
  if (nonInteractive) return false;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(question, (a) => {
      rl.close();
      res(a.trim().toLowerCase().startsWith("y"));
    });
  });
}

async function copyRecursive(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dst, name);
    const st = lstatSync(s);
    if (st.isDirectory()) {
      await copyRecursive(s, d);
    } else {
      await fs.copyFile(s, d);
    }
  }
}

async function install() {
  if (!existsSync(sourceDir)) {
    console.error(`error: source skill not found at ${sourceDir}`);
    process.exit(1);
  }

  await fs.mkdir(targetParent, { recursive: true });

  if (existsSync(targetDir)) {
    const st = lstatSync(targetDir);
    const isOurSymlink =
      st.isSymbolicLink() &&
      (await fs.readlink(targetDir).catch(() => "")) === sourceDir;
    if (isOurSymlink) {
      console.error(`ok: skill already linked → ${targetDir}`);
      return;
    }
    const ok = await ask(`${targetDir} already exists. Replace it? [y/N] `);
    if (!ok) {
      console.error("aborted: target exists and was not replaced.");
      process.exit(1);
    }
    await fs.rm(targetDir, { recursive: true, force: true });
  }

  await link();
}

async function link() {
  try {
    await fs.symlink(sourceDir, targetDir, "dir");
    console.error(`ok: symlinked ${targetDir} → ${sourceDir}`);
  } catch (e) {
    if (platform() === "win32" || ["EPERM", "EEXIST"].includes(e?.code)) {
      console.error(
        `note: symlink failed (${e?.code ?? e?.message}); copying instead.`,
      );
      await copyRecursive(sourceDir, targetDir);
      console.error(`ok: copied skill to ${targetDir}`);
    } else {
      throw e;
    }
  }
}

install().catch((e) => {
  console.error("install failed:", e?.message ?? e);
  process.exit(1);
});
