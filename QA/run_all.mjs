#!/usr/bin/env node
// QA gate runner — mirror of the worker repo's QA/run_all.py.
// Runs every check that CI runs, in the same order, with the same exit
// semantics. Used both locally (npm run qa) and in .github/workflows/qa.yml.
//
//   Usage:
//     node QA/run_all.mjs           # run everything
//     node QA/run_all.mjs types     # run a single stage by name
//     node QA/run_all.mjs types lint
//
// Exit 0 if every stage passed, 1 if anything failed.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const STAGES = [
  {
    name: "types",
    label: "TypeScript",
    cmd: "node",
    args: ["./node_modules/typescript/bin/tsc", "--noEmit"],
  },
  {
    name: "lint",
    label: "ESLint",
    cmd: "node",
    args: ["./node_modules/eslint/bin/eslint.js", "."],
  },
  {
    name: "test",
    label: "Vitest (QA/**)",
    cmd: "node",
    args: ["./node_modules/vitest/vitest.mjs", "run"],
  },
  {
    name: "build",
    label: "Next build",
    cmd: "node",
    args: ["./node_modules/next/dist/bin/next", "build"],
    // `next build` reads .env.local when present; in CI, env vars come
    // from GH Actions step env so neither path needs special handling here.
  },
];

function runStage(stage) {
  return new Promise((resolve) => {
    const started = Date.now();
    const proc = spawn(stage.cmd, stage.args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    proc.on("close", (code) => {
      resolve({ stage, code: code ?? 1, elapsed: Date.now() - started });
    });
    proc.on("error", (err) => {
      console.error(`\n[QA] failed to start "${stage.label}": ${err.message}\n`);
      resolve({ stage, code: 1, elapsed: Date.now() - started });
    });
  });
}

async function main() {
  const requested = process.argv.slice(2);
  const toRun = requested.length
    ? STAGES.filter((s) => requested.includes(s.name))
    : STAGES;

  if (!toRun.length) {
    console.error(`[QA] no matching stages. Known: ${STAGES.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  const results = [];
  const totalStart = Date.now();

  for (const stage of toRun) {
    console.log(`\n${"=".repeat(60)}\n[QA] ${stage.label}\n${"=".repeat(60)}`);
    const result = await runStage(stage);
    results.push(result);
    if (result.code !== 0) break; // fail-fast, same as worker repo
  }

  const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1);
  const passed = results.filter((r) => r.code === 0);
  const failed = results.filter((r) => r.code !== 0);

  console.log(`\n${"=".repeat(60)}\n[QA] Summary (${totalElapsed}s)`);
  for (const r of results) {
    const mark = r.code === 0 ? "OK  " : "FAIL";
    const secs = (r.elapsed / 1000).toFixed(1);
    console.log(`  ${mark}  ${r.stage.label.padEnd(20)} ${secs}s`);
  }
  console.log(
    `\n${passed.length}/${toRun.length} stages passed` +
      (failed.length ? `, ${failed.length} failed.` : "."),
  );

  process.exit(failed.length ? 1 : 0);
}

main();
