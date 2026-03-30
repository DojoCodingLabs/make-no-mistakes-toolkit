import { copyFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { ensureDir, fileExists, listFilesRecursive, relativePosixPath, sha256, toPosixPath } from "./fs-utils.js";
import type { InstallManifest, ManagedFile } from "./manifest.js";

export interface AssetDescriptor {
  kind: ManagedFile["kind"];
  sourcePath: string;
  relativePath: string;
  checksum: string;
}
export interface SyncAssetsOptions {
  configDir: string; dryRun?: boolean; force?: boolean;
  manifest?: InstallManifest; packageRoot: string;
}
export interface SyncAssetsResult {
  copied: string[]; updated: string[]; skipped: string[];
  removed: string[]; conflicts: string[]; managedFiles: ManagedFile[];
}

const installRoots: Array<{ kind: ManagedFile["kind"]; source: string; target: string }> = [
  { kind: "command", source: "commands", target: "commands" },
  { kind: "agent", source: "agents", target: "agents" },
  { kind: "skill", source: "skills", target: "skills" },
];

export async function getInstallableAssets(packageRoot: string): Promise<AssetDescriptor[]> {
  const assets: AssetDescriptor[] = [];
  for (const installRoot of installRoots) {
    const sourceRoot = join(packageRoot, installRoot.source);
    let files: string[];
    try { files = await listFilesRecursive(sourceRoot); } catch { continue; }
    for (const file of files) {
      const sourceContents = await readFile(file);
      assets.push({
        kind: installRoot.kind, sourcePath: file,
        relativePath: toPosixPath(join(installRoot.target, relativePosixPath(sourceRoot, file))),
        checksum: sha256(sourceContents),
      });
    }
  }
  return assets.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function syncManagedAssets(options: SyncAssetsOptions): Promise<SyncAssetsResult> {
  const assets = await getInstallableAssets(options.packageRoot);
  const copied: string[] = []; const updated: string[] = []; const skipped: string[] = [];
  const removed: string[] = []; const conflicts: string[] = [];
  const currentManaged = new Set(options.manifest?.managedFiles.map((f) => f.relativePath) ?? []);
  const expectedPaths = new Set(assets.map((a) => a.relativePath));

  for (const asset of assets) {
    const targetPath = join(options.configDir, asset.relativePath);
    const targetExists = await fileExists(targetPath);
    const isManaged = currentManaged.has(asset.relativePath);
    if (targetExists && !isManaged && !options.force) { conflicts.push(asset.relativePath); continue; }
    if (targetExists) {
      const currentChecksum = sha256(await readFile(targetPath));
      if (currentChecksum === asset.checksum) { skipped.push(asset.relativePath); continue; }
    }
    if (!options.dryRun) { await ensureDir(dirname(targetPath)); await copyFile(asset.sourcePath, targetPath); }
    if (targetExists) { updated.push(asset.relativePath); } else { copied.push(asset.relativePath); }
  }

  const stalePaths = (options.manifest?.managedFiles ?? [])
    .map((f) => f.relativePath).filter((p) => !expectedPaths.has(p));
  for (const stalePath of stalePaths) {
    const abs = join(options.configDir, stalePath);
    if (!(await fileExists(abs))) continue;
    if (!options.dryRun) { const { rm } = await import("node:fs/promises"); await rm(abs, { force: true }); }
    removed.push(stalePath);
  }

  return { copied, updated, skipped, removed, conflicts,
    managedFiles: assets.map((a) => ({ relativePath: a.relativePath, checksum: a.checksum, kind: a.kind })),
  };
}
