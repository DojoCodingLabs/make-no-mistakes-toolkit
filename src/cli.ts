#!/usr/bin/env node

import { basename } from "node:path";
import process from "node:process";
import { doctorPlugin } from "./lib/doctor.js";
import { installPlugin, InstallConflictError } from "./lib/install.js";
import { resolvePackageRoot, readPackageMetadata } from "./lib/paths.js";
import { uninstallPlugin } from "./lib/uninstall.js";
import { updatePlugin } from "./lib/update.js";

type CommandName = "install" | "update" | "uninstall" | "doctor";

interface ParsedArgs {
  command?: CommandName;
  configDir?: string;
  dryRun: boolean;
  force: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

function formatList(items: string[]): string[] {
  return items.map((item) => `- ${item}`);
}

function usage(binaryName: string): string {
  return [
    `${binaryName} <install|update|uninstall|doctor> [options]`,
    "",
    "Options:",
    "  --config-dir <path>  Override the OpenCode config directory",
    "  --dry-run            Preview changes without writing files",
    "  --force              Replace conflicting unmanaged files",
    "  --json               Emit JSON output for doctor",
    "  --help               Show this help text",
    "  --version            Show the package version",
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    dryRun: false,
    force: false,
    json: false,
    help: false,
    version: false,
  };

  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }

    if (value === "--version" || value === "-v") {
      parsed.version = true;
      continue;
    }

    if (value === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (value === "--force") {
      parsed.force = true;
      continue;
    }

    if (value === "--json") {
      parsed.json = true;
      continue;
    }

    if (value === "--config-dir") {
      parsed.configDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (value.startsWith("--config-dir=")) {
      parsed.configDir = value.slice("--config-dir=".length);
      continue;
    }

    if (value.startsWith("-")) {
      throw new Error(`Unknown option: ${value}`);
    }

    positional.push(value);
  }

  if (positional[0]) {
    parsed.command = positional[0] as CommandName;
  }

  return parsed;
}

function printHumanResult(result: Record<string, unknown>): void {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(result)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }

      lines.push(`${key}:`);
      lines.push(...formatList(value.map((item) => String(item))));
      continue;
    }

    lines.push(`${key}: ${String(value)}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main(): Promise<void> {
  const packageRoot = resolvePackageRoot(import.meta.url);
  const metadata = await readPackageMetadata(packageRoot);
  const binaryName = basename(process.argv[1] || "make-no-mistakes");
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    process.stdout.write(`${metadata.version}\n`);
    return;
  }

  if (args.help || !args.command) {
    process.stdout.write(`${usage(binaryName)}\n`);
    return;
  }

  if (args.json && args.command !== "doctor") {
    throw new Error("The --json flag is only supported for the doctor command.");
  }

  const sharedOptions = {
    configDir: args.configDir,
    dryRun: args.dryRun,
    force: args.force,
    packageRoot,
  };

  switch (args.command) {
    case "install": {
      const result = await installPlugin(sharedOptions);
      printHumanResult(result);
      return;
    }
    case "update": {
      const result = await updatePlugin(sharedOptions);
      printHumanResult(result);
      return;
    }
    case "uninstall": {
      const result = await uninstallPlugin(sharedOptions);
      printHumanResult(result);
      return;
    }
    case "doctor": {
      const result = await doctorPlugin({
        configDir: args.configDir,
        packageRoot,
      });

      if (args.json) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        printHumanResult(result as unknown as Record<string, unknown>);
      }

      if (!result.healthy) {
        process.exitCode = 1;
      }

      return;
    }
    default:
      throw new Error(`Unsupported command: ${String(args.command)}`);
  }
}

main().catch((error) => {
  if (error instanceof InstallConflictError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
