// Runs the real punch command in a pseudo-terminal (node-pty) and reads its screen through a headless terminal
// emulator (xterm.js), so tests see exactly what you would.

import { spawn, type IPty } from "@lydell/node-pty";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import xterm from "@xterm/headless";
import type { Todo } from "../src/store.ts";

const BIN = resolve(import.meta.dirname, "../bin/punch.ts");
const COLS = 80;
const ROWS = 24;

export const KEYS = { enter: "\r", esc: "\x1b", up: "\x1b[A", down: "\x1b[B", left: "\x1b[D", backspace: "\x7f", ctrlU: "\x15" };

/** A home folder of its own per test, so tests never touch your real config or todos. */
export class Home {
  readonly dir = mkdtempSync(join(tmpdir(), "punch-test-"));

  path(...parts: string[]) {
    return join(this.dir, ...parts);
  }

  get icloudDrive() {
    return this.path("Library", "Mobile Documents", "com~apple~CloudDocs");
  }

  /** Makes the folder iCloud Drive has when it is turned on. */
  enableICloud() {
    mkdirSync(this.icloudDrive, { recursive: true });
  }

  /** Skips setup by saving the todos file in the config, like setup does. */
  configure(file = this.path("todos.json"), todos?: Todo[]) {
    mkdirSync(this.path(".config", "punch"), { recursive: true });
    writeFileSync(this.path(".config", "punch", "config.json"), JSON.stringify({ file }));
    if (todos) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(todos));
    }
    return file;
  }

  config(): { file?: string } {
    return JSON.parse(readFileSync(this.path(".config", "punch", "config.json"), "utf8"));
  }

  todos(file = this.config().file!): Todo[] {
    return JSON.parse(readFileSync(file, "utf8"));
  }

  remove() {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

export class Punch {
  readonly term = new xterm.Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
  readonly pty: IPty;
  exited: Promise<number>;

  constructor(home: Home, args: string[] = [], env: Record<string, string> = {}) {
    this.pty = spawn(process.execPath, [BIN, ...args], {
      cols: COLS,
      rows: ROWS,
      env: { PATH: process.env.PATH ?? "", HOME: home.dir, TERM: "xterm-256color", COLORTERM: "truecolor", ...env },
    });
    this.pty.onData((data) => this.term.write(data));
    this.exited = new Promise((done) => this.pty.onExit(({ exitCode }) => done(exitCode)));
  }

  /** The screen as text, one string per row, trailing spaces trimmed. */
  screen(): string[] {
    const buffer = this.term.buffer.active;
    return Array.from({ length: ROWS }, (_, y) => buffer.getLine(y)?.translateToString(true) ?? "");
  }

  text() {
    return this.screen().join("\n");
  }

  /** The cursor's position on screen, 0-based. */
  cursor() {
    const buffer = this.term.buffer.active;
    return { row: buffer.cursorY, col: buffer.cursorX };
  }

  /** Waits until the screen shows `what` (text, or a check of the whole screen). */
  async waitFor(what: string | ((text: string) => boolean), timeout = 5000) {
    const test = typeof what === "string" ? (text: string) => text.includes(what) : what;
    const until = Date.now() + timeout;
    while (!test(this.text())) {
      if (Date.now() > until) throw new Error(`Timed out waiting for ${what}; the screen shows:\n${this.text()}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  /** Waits until the screen hasn't changed for a moment, e.g. after a key that shows nothing new. */
  async settle(quiet = 150) {
    let last = this.text();
    let since = Date.now();
    while (Date.now() - since < quiet) {
      await new Promise((r) => setTimeout(r, 20));
      const now = this.text();
      if (now !== last) [last, since] = [now, Date.now()];
    }
  }

  /** Types keys one at a time, the way they arrive from a keyboard, and lets the screen catch up. */
  async type(...keys: string[]) {
    for (const key of keys) {
      this.pty.write(key);
      await new Promise((r) => setTimeout(r, 30));
    }
    await this.settle();
  }

  /** The row showing `text`, or -1. */
  row(text: string) {
    return this.screen().findIndex((line) => line.includes(text));
  }

  async quit() {
    this.pty.write("\x03");
    await this.exited;
  }
}

/** A todo for seeding a file. */
export const todo = (text: string, created: Date, done: Date | null = null): Todo =>
  ({ id: text, text, created: created.toISOString(), done: done?.toISOString() ?? null });
