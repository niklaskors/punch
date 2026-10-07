// Where todos are kept: $PUNCH_FILE, else the place picked in the first-time setup, saved in the config file.

import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface Config {
  /** The todos file. */
  file?: string;
}

const home = homedir();

export const configFile = () => join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "punch", "config.json");
/** On this computer only, in the XDG data directory. */
export const localFile = () => join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "punch", "todos.json");

export const isMac = process.platform === "darwin";
/** iCloud Drive's folder; it only exists on a Mac with iCloud Drive turned on. */
export const ICLOUD_DRIVE = join(home, "Library", "Mobile Documents", "com~apple~CloudDocs");
export const icloudFile = () => join(ICLOUD_DRIVE, "punch", "todos.json");
export const hasICloudDrive = () => isMac && existsSync(ICLOUD_DRIVE);

export function readConfig(): Config | null {
  try {
    return JSON.parse(readFileSync(configFile(), "utf8")) as Config;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export function writeConfig(config: Config) {
  mkdirSync(dirname(configFile()), { recursive: true });
  writeFileSync(configFile(), JSON.stringify(config, null, 2) + "\n");
}

/**
 * The todos file, or null when setup hasn't run yet. Todos saved before setup existed (in the local file)
 * count as set up, so they stay where they are.
 */
export function todosFile(): string | null {
  if (process.env.PUNCH_FILE) return resolvePath(process.env.PUNCH_FILE);
  const config = readConfig();
  if (config?.file) return config.file;
  if (!config && existsSync(localFile())) {
    writeConfig({ file: localFile() });
    return localFile();
  }
  return null;
}

/** ~ for the home directory, so paths fit on screen. */
export const tildify = (path: string) => (path === home || path.startsWith(home + "/") ? "~" + path.slice(home.length) : path);

/** An absolute path from what was typed: ~ expands, and a folder (anything not ending in .json) gets todos.json in it. */
export function resolvePath(input: string): string {
  const path = resolve(input.trim().replace(/^~(?=$|\/)/, home));
  return path.endsWith(".json") ? path : join(path, "todos.json");
}

/** Makes the file's folder if needed; returns why todos can't be saved there, or null when they can. */
export function checkWritable(file: string): string | null {
  try {
    mkdirSync(dirname(file), { recursive: true });
    accessSync(dirname(file), constants.W_OK);
    if (existsSync(file)) accessSync(file, constants.R_OK | constants.W_OK);
    return null;
  } catch (err) {
    const { code } = err as NodeJS.ErrnoException;
    if (code === "EACCES" || code === "EPERM") return `No permission to write in ${tildify(dirname(file))}`;
    if (code === "ENOTDIR" || code === "EEXIST") return `${tildify(dirname(file))} isn't a folder`;
    return (err as Error).message;
  }
}
