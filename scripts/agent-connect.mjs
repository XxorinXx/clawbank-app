#!/usr/bin/env node
// scripts/agent-connect.mjs
// Terminal command to connect an agent to a ClawBank workspace.
// Usage: node scripts/agent-connect.mjs [CONNECT_CODE]

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createInterface } from "readline";
import { resolve } from "path";

// ── Helpers ──────────────────────────────────────────────────────────

const LABEL = "ClawBank Agent Connect";
const CODE_RE = /^[A-Z0-9]{6}$/;
const MAX_ATTEMPTS = 2;

function log(msg = "") {
  console.log(`  ${msg}`);
}

function success(msg) {
  log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function fail(msg) {
  log(`\x1b[31m✗\x1b[0m ${msg}`);
}

function blank() {
  console.log();
}

/** Prompt the user for input via readline. */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`  ? ${question}`, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Resolve Convex URL ──────────────────────────────────────────────

function resolveConvexUrl() {
  // 1. Environment variables
  if (process.env.CONVEX_URL) return process.env.CONVEX_URL;
  if (process.env.VITE_CONVEX_URL) return process.env.VITE_CONVEX_URL;

  // 2. Dotfiles in CWD
  for (const name of [".env.local", ".env"]) {
    const fp = resolve(process.cwd(), name);
    if (!existsSync(fp)) continue;
    const match = readFileSync(fp, "utf-8").match(
      /^(?:VITE_)?CONVEX_URL\s*=\s*(.+)$/m,
    );
    if (match) return match[1].trim();
  }

  return null;
}

// ── Credentials writer ──────────────────────────────────────────────
// Write to .clawbank (not .env) so Vite's dev server doesn't trigger
// a full page reload.  Agents read credentials from this file.

const CREDS_FILE = ".clawbank";

function writeEnvVars(vars) {
  const credsPath = resolve(process.cwd(), CREDS_FILE);
  let lines = [];

  if (existsSync(credsPath)) {
    lines = readFileSync(credsPath, "utf-8").split("\n");
  }

  for (const [key, value] of Object.entries(vars)) {
    const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
    const entry = `${key}=${value}`;
    if (idx !== -1) {
      lines[idx] = entry;
    } else {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      lines.push(entry);
    }
  }

  writeFileSync(credsPath, lines.join("\n") + "\n", "utf-8");
}

// ── Exchange code via Convex HTTP action API ────────────────────────

async function exchangeCode(convexUrl, code) {
  const url = `${convexUrl.replace(/\/$/, "")}/api/action`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "actions/agentAuth:exchangeConnectCode",
      args: { connectCode: code },
    }),
  });

  const body = await res.json();

  if (!res.ok) {
    const msg =
      body?.message || body?.error || body?.errorMessage || res.statusText;
    throw new Error(msg);
  }

  // Convex wraps action results in { status, value } for HTTP API
  const data = body.value ?? body;
  if (!data.sessionToken) {
    throw new Error("Unexpected response — no session token received");
  }
  return data;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  blank();
  log(LABEL);
  blank();

  // 1. Resolve Convex URL
  const convexUrl = resolveConvexUrl();
  if (!convexUrl) {
    fail(
      "Error: Cannot find Convex URL. Set CONVEX_URL or VITE_CONVEX_URL in your environment or .env / .env.local",
    );
    process.exit(1);
  }

  // 2. Get connect code (argv or interactive prompt)
  let code = process.argv[2]?.trim() ?? "";
  if (!code) {
    code = await prompt("Paste your connect code: ");
  }

  code = code.toUpperCase();

  if (!CODE_RE.test(code)) {
    fail(
      "Error: Invalid code format. Expected 6 alphanumeric characters (e.g. A3F9K2)",
    );
    process.exit(1);
  }

  // 3. Exchange code (retry once on failure)
  let result;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      result = await exchangeCode(convexUrl, code);
      break;
    } catch (err) {
      if (attempt < MAX_ATTEMPTS) {
        fail(`${err.message} — retrying…`);
        // Brief pause before retry
        await new Promise((r) => setTimeout(r, 1000));
      } else {
        fail(`Error: ${err.message}`);
        blank();
        log("Could not connect. Check that:");
        log("  - The code hasn't expired (codes last 5 minutes)");
        log("  - The code hasn't already been used");
        log("  - Your network can reach the ClawBank backend");
        blank();
        process.exit(1);
      }
    }
  }

  // 4. Show success
  success("Code verified");

  // 5. Write credentials to .env
  writeEnvVars({
    CLAWBANK_API_URL: convexUrl,
    CLAWBANK_AGENT_TOKEN: result.sessionToken,
  });

  success(`Connected to workspace`);
  success(`Saved to ${CREDS_FILE}`);
  blank();
  log("You're all set! Your agent is connected.");
  blank();
  log("Run your agent:");
  log("  npx openclaw start       # if using OpenClaw");
  log("  node my-agent.js         # if using a custom bot");
  blank();
}

main();
