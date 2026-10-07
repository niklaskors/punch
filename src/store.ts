// Todos are kept in one JSON file, written in full after every change.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface Todo {
  id: string;
  text: string;
  /** When it was added (ISO), which also decides the day it is listed under. */
  created: string;
  /** When it was marked as done (ISO), or null while it is open. */
  done: string | null;
}

/** $PUNCH_FILE, or todos.json in the XDG data directory. */
export const dataFile = () =>
  process.env.PUNCH_FILE || join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "punch", "todos.json");

export function load(file: string): Todo[] {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Todo[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

/** Writes to a temporary file first, so a crash halfway never leaves a broken list behind. */
export function save(file: string, todos: Todo[]) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(todos, null, 2) + "\n");
  renameSync(tmp, file);
}
