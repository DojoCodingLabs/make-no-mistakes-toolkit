import { dirname, join } from "node:path";
import { removePluginFromConfig } from "./merge-opencode-config.js";
import { fileExists, removeEmptyParentDirectories, removePathIfExists } from "./fs-utils.js";
import { readInstallManifest } from "./manifest.js";
import {
  PACKAGE_NAME,
  resolveConfigDir,
  resolveManifestPath,
} from "./paths.js";

export interface UninstallOptions {
  configDir?: string;
  dryRun?: boolean;
  packageRoot?: string;
}

export interface UninstallResult {
  command: "uninstall";
  configDir: string;
  configFilePath: string;
  manifestPath: string;
  dryRun: boolean;
  pluginChanged: boolean;
  manifestRemoved: boolean;
  removed: string[];
  missing: string[];
}

export async function uninstallPlugin(
  options: UninstallOptions,
): Promise<UninstallResult> {
  const configDir = resolveConfigDir(options.configDir);
  const manifestPath = resolveManifestPath(configDir);
  const manifest = await readInstallManifest(configDir);
  const removed: string[] = [];
  const missing: string[] = [];

  for (const managedFile of manifest?.managedFiles ?? []) {
    const absolutePath = join(configDir, managedFile.relativePath);

    if (!(await fileExists(absolutePath))) {
      missing.push(managedFile.relativePath);
      continue;
    }

    if (!options.dryRun) {
      await removePathIfExists(absolutePath);
      await removeEmptyParentDirectories(dirname(absolutePath), configDir);
    }

    removed.push(managedFile.relativePath);
  }

  const configMutation = await removePluginFromConfig(configDir, PACKAGE_NAME, options.dryRun);
  let manifestRemoved = false;

  if (await fileExists(manifestPath)) {
    manifestRemoved = true;

    if (!options.dryRun) {
      await removePathIfExists(manifestPath);
    }
  }

  return {
    command: "uninstall",
    configDir,
    configFilePath: configMutation.configFilePath,
    manifestPath,
    dryRun: Boolean(options.dryRun),
    pluginChanged: configMutation.changed,
    manifestRemoved,
    removed,
    missing,
  };
}
