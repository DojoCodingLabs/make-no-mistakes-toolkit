import { readFile, writeFile } from "node:fs/promises";
import { applyEdits, modify, parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { ensureDir, fileExists } from "./fs-utils.js";
import { CONFIG_SCHEMA_URL, resolveConfigFilePath } from "./paths.js";

export interface ConfigMutationResult {
  changed: boolean;
  configFilePath: string;
  created: boolean;
  plugins: string[];
}

function parseConfigOrThrow(content: string, filePath: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0) {
    const firstError = errors[0];
    throw new Error(
      `Unable to parse ${filePath}: ${printParseErrorCode(firstError.error)} at offset ${firstError.offset}. Fix the file and rerun the command.`,
    );
  }

  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`Expected ${filePath} to contain a top-level object.`);
  }

  return parsed as Record<string, unknown>;
}

function dedupePlugins(plugins: string[]): string[] {
  return [...new Set(plugins)];
}

export async function readRegisteredPlugins(configDir: string): Promise<string[]> {
  const configFilePath = resolveConfigFilePath(configDir);

  if (!(await fileExists(configFilePath))) {
    return [];
  }

  const parsed = parseConfigOrThrow(await readFile(configFilePath, "utf8"), configFilePath);
  const plugins = parsed.plugin;

  if (plugins === undefined) {
    return [];
  }

  if (!Array.isArray(plugins) || plugins.some((value) => typeof value !== "string")) {
    throw new Error(`Expected "plugin" in ${configFilePath} to be an array of strings.`);
  }

  return dedupePlugins(plugins as string[]);
}

export async function addPluginToConfig(
  configDir: string,
  pluginName: string,
  dryRun = false,
): Promise<ConfigMutationResult> {
  const configFilePath = resolveConfigFilePath(configDir);
  const configExists = await fileExists(configFilePath);

  if (!configExists) {
    const nextContent = `${JSON.stringify(
      {
        $schema: CONFIG_SCHEMA_URL,
        plugin: [pluginName],
      },
      null,
      2,
    )}\n`;

    if (!dryRun) {
      await ensureDir(configDir);
      await writeFile(configFilePath, nextContent, "utf8");
    }

    return {
      changed: true,
      configFilePath,
      created: true,
      plugins: [pluginName],
    };
  }

  const currentContent = await readFile(configFilePath, "utf8");
  const parsed = parseConfigOrThrow(currentContent, configFilePath);
  const existingPlugins = parsed.plugin;

  if (
    existingPlugins !== undefined &&
    (!Array.isArray(existingPlugins) || existingPlugins.some((value) => typeof value !== "string"))
  ) {
    throw new Error(`Expected "plugin" in ${configFilePath} to be an array of strings.`);
  }

  const nextPlugins = dedupePlugins([...(existingPlugins as string[] | undefined) ?? [], pluginName]);

  if (
    Array.isArray(existingPlugins) &&
    existingPlugins.length === nextPlugins.length &&
    existingPlugins.every((plugin, index) => plugin === nextPlugins[index])
  ) {
    return {
      changed: false,
      configFilePath,
      created: false,
      plugins: nextPlugins,
    };
  }

  const edits = modify(currentContent, ["plugin"], nextPlugins, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
    },
  });
  const nextContent = applyEdits(currentContent, edits);

  if (!dryRun) {
    await writeFile(configFilePath, nextContent, "utf8");
  }

  return {
    changed: true,
    configFilePath,
    created: false,
    plugins: nextPlugins,
  };
}

export async function removePluginFromConfig(
  configDir: string,
  pluginName: string,
  dryRun = false,
): Promise<ConfigMutationResult> {
  const configFilePath = resolveConfigFilePath(configDir);

  if (!(await fileExists(configFilePath))) {
    return {
      changed: false,
      configFilePath,
      created: false,
      plugins: [],
    };
  }

  const currentContent = await readFile(configFilePath, "utf8");
  const parsed = parseConfigOrThrow(currentContent, configFilePath);
  const existingPlugins = parsed.plugin;

  if (existingPlugins === undefined) {
    return {
      changed: false,
      configFilePath,
      created: false,
      plugins: [],
    };
  }

  if (!Array.isArray(existingPlugins) || existingPlugins.some((value) => typeof value !== "string")) {
    throw new Error(`Expected "plugin" in ${configFilePath} to be an array of strings.`);
  }

  const nextPlugins = dedupePlugins(existingPlugins.filter((plugin) => plugin !== pluginName));

  if (nextPlugins.length === existingPlugins.length) {
    return {
      changed: false,
      configFilePath,
      created: false,
      plugins: nextPlugins,
    };
  }

  const edits = modify(currentContent, ["plugin"], nextPlugins.length > 0 ? nextPlugins : undefined, {
    formattingOptions: {
      insertSpaces: true,
      tabSize: 2,
    },
  });
  const nextContent = applyEdits(currentContent, edits);

  if (!dryRun) {
    await writeFile(configFilePath, nextContent, "utf8");
  }

  return {
    changed: true,
    configFilePath,
    created: false,
    plugins: nextPlugins,
  };
}
