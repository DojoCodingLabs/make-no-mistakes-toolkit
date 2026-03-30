import { join } from "node:path";
import { getInstallableAssets } from "./copy-assets.js";
import { fileExists, sha256File } from "./fs-utils.js";
import { readInstallManifest } from "./manifest.js";
import { readRegisteredPlugins } from "./merge-opencode-config.js";
import {
  PACKAGE_NAME,
  readPackageMetadata,
  resolveConfigDir,
  resolveConfigFilePath,
  resolveManifestPath,
} from "./paths.js";

export interface DoctorOptions {
  configDir?: string;
  packageRoot: string;
}

export interface DoctorResult {
  healthy: boolean;
  configDir: string;
  configFilePath: string;
  manifestPath: string;
  packageVersion: string;
  manifestPresent: boolean;
  pluginRegistered: boolean;
  missingFiles: string[];
  driftedFiles: string[];
  conflicts: string[];
  issues: string[];
  warnings: string[];
}

export async function doctorPlugin(options: DoctorOptions): Promise<DoctorResult> {
  const configDir = resolveConfigDir(options.configDir);
  const configFilePath = resolveConfigFilePath(configDir);
  const manifestPath = resolveManifestPath(configDir);
  const packageMetadata = await readPackageMetadata(options.packageRoot);
  const assets = await getInstallableAssets(options.packageRoot);
  const manifest = await readInstallManifest(configDir);
  const issues: string[] = [];
  const warnings: string[] = [];
  const missingFiles: string[] = [];
  const driftedFiles: string[] = [];
  const conflicts: string[] = [];
  let pluginRegistered = false;

  try {
    pluginRegistered = (await readRegisteredPlugins(configDir)).includes(PACKAGE_NAME);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  if (!pluginRegistered) {
    issues.push(`Plugin entry ${PACKAGE_NAME} is missing from ${configFilePath}.`);
  }

  if (!manifest) {
    issues.push(`Install manifest is missing: ${manifestPath}.`);
  }

  const managedFiles = new Set(manifest?.managedFiles.map((file) => file.relativePath) ?? []);

  for (const asset of assets) {
    const absolutePath = join(configDir, asset.relativePath);
    const exists = await fileExists(absolutePath);

    if (!managedFiles.has(asset.relativePath) && exists) {
      conflicts.push(asset.relativePath);
      continue;
    }

    if (!exists) {
      missingFiles.push(asset.relativePath);
      continue;
    }

    if ((await sha256File(absolutePath)) !== asset.checksum) {
      driftedFiles.push(asset.relativePath);
    }
  }

  if (manifest && manifest.installedVersion !== packageMetadata.version) {
    warnings.push(
      `Manifest version ${manifest.installedVersion} does not match package version ${packageMetadata.version}. Run update to refresh assets.`,
    );
  }

  for (const missingFile of missingFiles) {
    issues.push(`Missing managed asset: ${missingFile}.`);
  }

  for (const driftedFile of driftedFiles) {
    issues.push(`Managed asset differs from packaged version: ${driftedFile}.`);
  }

  for (const conflict of conflicts) {
    issues.push(`Expected asset path is occupied by an unmanaged file: ${conflict}.`);
  }

  return {
    healthy: issues.length === 0,
    configDir,
    configFilePath,
    manifestPath,
    packageVersion: packageMetadata.version,
    manifestPresent: Boolean(manifest),
    pluginRegistered,
    missingFiles,
    driftedFiles,
    conflicts,
    issues,
    warnings,
  };
}
