import { readFile } from "node:fs/promises";
import { fileExists, writeTextFile } from "./fs-utils.js";
import { resolveManifestPath } from "./paths.js";

export interface ManagedFile {
  relativePath: string;
  checksum: string;
  kind: "command" | "agent" | "skill";
}
export interface InstallManifest {
  packageName: string;
  installedVersion: string;
  installedAt: string;
  configDir: string;
  managedFiles: ManagedFile[];
}
export async function readInstallManifest(configDir: string): Promise<InstallManifest | undefined> {
  const manifestPath = resolveManifestPath(configDir);
  if (!(await fileExists(manifestPath))) return undefined;
  return JSON.parse(await readFile(manifestPath, "utf8")) as InstallManifest;
}
export async function writeInstallManifest(configDir: string, manifest: InstallManifest): Promise<void> {
  await writeTextFile(resolveManifestPath(configDir), `${JSON.stringify(manifest, null, 2)}\n`);
}
