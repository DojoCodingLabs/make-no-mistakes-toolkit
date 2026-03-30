export { installPlugin, InstallConflictError } from "./lib/install.js";
export type { InstallOptions, InstallResult } from "./lib/install.js";
export { updatePlugin } from "./lib/update.js";
export { uninstallPlugin } from "./lib/uninstall.js";
export type { UninstallOptions, UninstallResult } from "./lib/uninstall.js";
export { doctorPlugin } from "./lib/doctor.js";
export type { DoctorOptions, DoctorResult } from "./lib/doctor.js";
export { CLI_NAME, CONFIG_SCHEMA_URL, MANIFEST_FILE_NAME, PACKAGE_NAME, defaultConfigDir, resolveConfigDir } from "./lib/paths.js";
