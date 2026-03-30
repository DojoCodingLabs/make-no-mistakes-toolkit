import { addPluginToConfig } from "./merge-opencode-config.js";
import { syncManagedAssets } from "./copy-assets.js";
import { ensureDir } from "./fs-utils.js";
import { readInstallManifest, writeInstallManifest } from "./manifest.js";
import { PACKAGE_NAME, readPackageMetadata, resolveConfigDir, resolveManifestPath } from "./paths.js";

export interface InstallOptions { configDir?: string; dryRun?: boolean; force?: boolean; packageRoot: string; }
export interface InstallResult {
  command: "install" | "update"; configDir: string; configFilePath: string;
  manifestPath: string; packageVersion: string; dryRun: boolean; pluginChanged: boolean;
  copied: string[]; updated: string[]; skipped: string[]; removed: string[];
}
export class InstallConflictError extends Error {
  readonly conflicts: string[];
  constructor(conflicts: string[]) {
    super(`Conflicting unmanaged files detected:\n${conflicts.map((c) => `- ${c}`).join("\n")}\nRe-run with --force to replace them.`);
    this.conflicts = conflicts;
  }
}

async function applyInstall(command: InstallResult["command"], options: InstallOptions): Promise<InstallResult> {
  const configDir = resolveConfigDir(options.configDir);
  const packageMetadata = await readPackageMetadata(options.packageRoot);
  if (!options.dryRun) await ensureDir(configDir);
  const manifest = await readInstallManifest(configDir);
  const assetSync = await syncManagedAssets({ configDir, dryRun: options.dryRun, force: options.force, manifest, packageRoot: options.packageRoot });
  if (assetSync.conflicts.length > 0) throw new InstallConflictError(assetSync.conflicts);
  const configMutation = await addPluginToConfig(configDir, PACKAGE_NAME, options.dryRun);
  if (!options.dryRun) {
    await writeInstallManifest(configDir, {
      packageName: PACKAGE_NAME, installedVersion: packageMetadata.version,
      installedAt: new Date().toISOString(), configDir, managedFiles: assetSync.managedFiles,
    });
  }
  return { command, configDir, configFilePath: configMutation.configFilePath, manifestPath: resolveManifestPath(configDir),
    packageVersion: packageMetadata.version, dryRun: Boolean(options.dryRun), pluginChanged: configMutation.changed,
    copied: assetSync.copied, updated: assetSync.updated, skipped: assetSync.skipped, removed: assetSync.removed };
}

export async function installPlugin(options: InstallOptions): Promise<InstallResult> {
  return applyInstall("install", options);
}
