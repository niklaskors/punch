// Todos are kept in one JSON file, written in full after every change.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface Todo {
  id: string;
  text: string;
  /** When it was added (ISO), which also decides the day it is listed under. */
  created: string;
  /** When it was marked as done (ISO), or null while it is open. */
  done: string | null;
}

/** How long to wait for iCloud to download a file that is only in the cloud. */
const DOWNLOAD_WAIT_MS = 15_000;

/**
 * iCloud Drive can keep a file only in the cloud (with "Optimise Mac Storage"), leaving a hidden
 * .name.icloud placeholder. Starting with an empty list then would overwrite the real one on the first save,
 * so the file is downloaded first.
 */
function downloadFromICloud(file: string): boolean {
  if (!existsSync(join(dirname(file), `.${basename(file)}.icloud`))) return false;
  try {
    execFileSync("brctl", ["download", file], { stdio: "ignore" });
  } catch {
    // Not every macOS has brctl; opening the folder in Finder downloads it too.
  }
  const until = Date.now() + DOWNLOAD_WAIT_MS;
  while (!existsSync(file) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
  if (!existsSync(file)) throw new Error(`${file} is still downloading from iCloud; try again in a moment`);
  return true;
}

export function load(file: string): Todo[] {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Todo[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return downloadFromICloud(file) ? load(file) : [];
  }
}

/** Writes to a temporary file first, so a crash halfway never leaves a broken list behind. */
export function save(file: string, todos: Todo[]) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(todos, null, 2) + "\n");
  renameSync(tmp, file);
}
