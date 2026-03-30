import { createHash } from "node:crypto";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

export async function fileExists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
export async function readTextIfExists(path: string): Promise<string | undefined> {
  if (!(await fileExists(path))) return undefined;
  return readFile(path, "utf8");
}
export async function writeTextFile(path: string, contents: string): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, contents, "utf8");
}
export function sha256(contents: Buffer | string): string {
  return createHash("sha256").update(contents).digest("hex");
}
export async function sha256File(path: string): Promise<string> {
  return sha256(await readFile(path));
}
export function toPosixPath(path: string): string {
  return path.replace(/\\/g, "/");
}
export async function listFilesRecursive(rootDirectory: string): Promise<string[]> {
  const entries = await readdir(rootDirectory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(rootDirectory, entry.name);
    if (entry.isDirectory()) { files.push(...(await listFilesRecursive(entryPath))); continue; }
    files.push(entryPath);
  }
  return files.sort();
}
export function relativePosixPath(from: string, to: string): string {
  return toPosixPath(relative(from, to));
}
export async function removePathIfExists(path: string): Promise<boolean> {
  if (!(await fileExists(path))) return false;
  await rm(path, { recursive: true, force: true });
  return true;
}
export async function removeEmptyParentDirectories(startDirectory: string, stopDirectory: string): Promise<void> {
  let currentDirectory = startDirectory;
  while (currentDirectory.startsWith(stopDirectory) && currentDirectory !== stopDirectory) {
    const entries = await readdir(currentDirectory);
    if (entries.length > 0) return;
    const { rmdir } = await import("node:fs/promises");
    await rmdir(currentDirectory);
    currentDirectory = dirname(currentDirectory);
  }
}
