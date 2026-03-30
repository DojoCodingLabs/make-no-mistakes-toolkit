import { existsSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_NAME = "@lapc506/make-no-mistakes";
export const CLI_NAME = "make-no-mistakes";
export const CONFIG_SCHEMA_URL = "https://opencode.ai/config.json";
export const MANIFEST_FILE_NAME = ".lapc506-make-no-mistakes.manifest.json";

export interface PackageMetadata {
  name: string;
  version: string;
}

export function defaultConfigDir(homeDir = os.homedir()): string {
  return join(homeDir, ".config", "opencode");
}

export function resolveConfigDir(configDir?: string): string {
  return resolve(configDir ?? defaultConfigDir());
}

export function resolvePackageRoot(moduleUrl: string): string {
  let currentDirectory = dirname(fileURLToPath(moduleUrl));
  while (true) {
    const packageJsonPath = join(currentDirectory, "package.json");
    const commandsPath = join(currentDirectory, "commands");
    if (existsSync(packageJsonPath) && existsSync(commandsPath)) {
      return currentDirectory;
    }
    const parentDirectory = dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      throw new Error("Unable to locate the package root from the current module.");
    }
    currentDirectory = parentDirectory;
  }
}

export async function readPackageMetadata(packageRoot: string): Promise<PackageMetadata> {
  const { readFile } = await import("node:fs/promises");
  const packageJson = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf8"),
  ) as Partial<PackageMetadata>;
  if (!packageJson.name || !packageJson.version) {
    throw new Error(`Invalid package metadata in ${join(packageRoot, "package.json")}.`);
  }
  return { name: packageJson.name, version: packageJson.version };
}

export function resolveManifestPath(configDir: string): string {
  return join(configDir, MANIFEST_FILE_NAME);
}

export function resolveConfigFilePath(configDir: string): string {
  const jsonPath = join(configDir, "opencode.json");
  const jsoncPath = join(configDir, "opencode.jsonc");
  if (existsSync(jsonPath)) return jsonPath;
  if (existsSync(jsoncPath)) return jsoncPath;
  return jsonPath;
}
