#!/usr/bin/env bun
/**
 * Cross-platform build script for kemono-scraper
 * Creates standalone executables for Linux, Windows, and macOS
 */

import { $ } from "bun";
import fs from "fs-extra";
import path from "path";

const DIST_DIR = "dist";
const ENTRY_POINT = "index.ts";
const APP_NAME = "kemono-scraper";

interface Target {
  name: string;
  bunTarget: string;
  outputName: string;
}

const TARGETS: Target[] = [
  // Linux
  { name: "linux-x64", bunTarget: "bun-linux-x64", outputName: `${APP_NAME}-linux-x64` },
  { name: "linux-arm64", bunTarget: "bun-linux-arm64", outputName: `${APP_NAME}-linux-arm64` },
  // Windows
  { name: "windows-x64", bunTarget: "bun-windows-x64", outputName: `${APP_NAME}-windows-x64.exe` },
  // macOS
  { name: "darwin-x64", bunTarget: "bun-darwin-x64", outputName: `${APP_NAME}-darwin-x64` },
  { name: "darwin-arm64", bunTarget: "bun-darwin-arm64", outputName: `${APP_NAME}-darwin-arm64` },
];

async function getGitInfo(): Promise<{ version: string; commit: string; branch: string }> {
  let version = "dev";
  let commit = "unknown";
  let branch = "unknown";

  try {
    // Try to get tag/describe
    const describeResult = await $`git describe --tags --always 2>/dev/null`.quiet().text();
    version = describeResult.trim() || "dev";
  } catch {
    // No git tags available
  }

  try {
    const commitResult = await $`git rev-parse --short HEAD 2>/dev/null`.quiet().text();
    commit = commitResult.trim() || "unknown";
  } catch {
    // Not in a git repo
  }

  try {
    const branchResult = await $`git rev-parse --abbrev-ref HEAD 2>/dev/null`.quiet().text();
    branch = branchResult.trim() || "unknown";
  } catch {
    // Not in a git repo
  }

  return { version, commit, branch };
}

async function build(targetFilter?: string): Promise<void> {
  const startTime = Date.now();

  // Ensure dist directory exists
  await fs.ensureDir(DIST_DIR);

  // Get git info for build metadata
  const gitInfo = await getGitInfo();
  const buildTime = new Date().toISOString();

  console.log("🚀 Building kemono-scraper executables");
  console.log(`   Version: ${gitInfo.version}`);
  console.log(`   Commit: ${gitInfo.commit}`);
  console.log(`   Branch: ${gitInfo.branch}`);
  console.log(`   Build time: ${buildTime}`);
  console.log("");

  // Filter targets if specified
  const targets = targetFilter
    ? TARGETS.filter((t) => t.name === targetFilter || t.bunTarget === targetFilter)
    : TARGETS;

  if (targets.length === 0) {
    console.error(`❌ No targets found matching: ${targetFilter}`);
    console.log("Available targets:");
    for (const t of TARGETS) {
      console.log(`  - ${t.name} (${t.bunTarget})`);
    }
    process.exit(1);
  }

  const results: { target: string; success: boolean; error?: string; time: number }[] = [];

  for (const target of targets) {
    const targetStart = Date.now();
    console.log(`📦 Building for ${target.name}...`);

    const outfile = path.join(DIST_DIR, target.outputName);

    try {
      // Build with Bun compile
      const buildArgs = [
        "bun",
        "build",
        ENTRY_POINT,
        "--compile",
        `--target=${target.bunTarget}`,
        `--outfile=${outfile}`,
        "--minify",
        // Embed build metadata as compile-time constants
        `--define=BUILD_VERSION='"${gitInfo.version}"'`,
        `--define=BUILD_COMMIT='"${gitInfo.commit}"'`,
        `--define=BUILD_TIME='"${buildTime}"'`,
        `--define=BUILD_TARGET='"${target.name}"'`,
      ];

      const result = Bun.spawnSync(buildArgs, {
        stdout: "pipe",
        stderr: "pipe",
      });

      if (result.exitCode !== 0) {
        const stderr = result.stderr.toString();
        throw new Error(stderr || `Build failed with exit code ${result.exitCode}`);
      }

      // Get file size
      const stats = await fs.stat(outfile);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      const elapsed = Date.now() - targetStart;
      console.log(`   ✅ ${target.outputName} (${sizeMB} MB) in ${elapsed}ms`);

      results.push({ target: target.name, success: true, time: elapsed });
    } catch (error) {
      const elapsed = Date.now() - targetStart;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ Failed: ${errorMsg}`);
      results.push({ target: target.name, success: false, error: errorMsg, time: elapsed });
    }
  }

  // Summary
  console.log("");
  console.log("📊 Build Summary:");
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalTime = Date.now() - startTime;

  console.log(`   Total: ${results.length} targets`);
  console.log(`   ✅ Successful: ${successful}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}`);
  }
  console.log(`   ⏱️  Total time: ${(totalTime / 1000).toFixed(2)}s`);

  if (failed > 0) {
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const targetArg = args.find((arg) => !arg.startsWith("-"));

// Handle help flag
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: bun run scripts/build.ts [target]

Build kemono-scraper as standalone executables.

Targets:
${TARGETS.map((t) => `  ${t.name.padEnd(15)} -> ${t.outputName}`).join("\n")}

Examples:
  bun run scripts/build.ts              # Build all targets
  bun run scripts/build.ts linux-x64    # Build only Linux x64
  bun run scripts/build.ts darwin-arm64 # Build only macOS ARM64
`);
  process.exit(0);
}

build(targetArg);

