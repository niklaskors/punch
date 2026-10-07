// The app: an input on top for new todos, and under it every todo grouped by the day it was added.

import { randomUUID } from "node:crypto";
import { emitKeypressEvents } from "node:readline";
import { groupByDay } from "./days.ts";
import { load, save, type Todo } from "./store.ts";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const STRIKE = "\x1b[9m";
const ACCENT = "\x1b[36m";
const GREEN = "\x1b[32m";

/** Left margin of everything on screen. */
const MARGIN = 2;
/** Rows above the list: a blank line, the three rows of the input box and a blank line. */
const LIST_TOP = 5;
/** Rows below the list: a blank line and the key hints. */
const FOOTER = 2;
const MAX_WIDTH = 100;

interface Key {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  sequence?: string;
}

type Row =
  | { kind: "day"; label: string; done: number; total: number }
  | { kind: "todo"; todo: Todo; index: number }
  | { kind: "gap" };

const chars = (s: string) => Array.from(s);

/** Cuts text to w characters, ending in … when it doesn't fit. */
const fit = (s: string, w: number) => {
  const cs = chars(s);
  return cs.length <= w ? s : cs.slice(0, Math.max(0, w - 1)).join("") + "…";
};

export class App {
  todos: Todo[];
  focus: "input" | "list" = "input";
  /** The input's text as characters, so the cursor never ends up inside an emoji. */
  input: string[] = [];
  cursor = 0;
  /** The todo the input edits; null when it adds a new one. */
  editing: string | null = null;
  /** Index of the selected todo, in the order they are shown. */
  sel = 0;
  /** The first list row on screen. */
  scroll = 0;
  removed: { todo: Todo; at: number } | null = null;
  msg = "";
  readonly file: string;

  constructor(file: string) {
    this.file = file;
    this.todos = load(file);
  }

  run() {
    const { stdin, stdout } = process;
    if (!stdin.isTTY || !stdout.isTTY) {
      console.error("punch needs an interactive terminal");
      process.exit(1);
    }
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdout.write("\x1b[?1049h");
    process.on("exit", () => stdout.write("\x1b[?25h\x1b[?1049l"));
    stdin.on("keypress", (str: string | undefined, key: Key | undefined) => {
      this.key(str, key ?? { sequence: str });
      this.draw();
    });
    stdout.on("resize", () => this.draw());
    // Redraw now and then, so "Today" becomes "Yesterday" after midnight.
    setInterval(() => this.draw(), 60_000);
    this.draw();
  }

  /** The todos in the order they are listed. */
  get shown(): Todo[] {
    return groupByDay(this.todos).flatMap((day) => day.todos);
  }

  rows(): Row[] {
    const rows: Row[] = [];
    let index = 0;
    for (const day of groupByDay(this.todos)) {
      if (rows.length) rows.push({ kind: "gap" });
      rows.push({ kind: "day", label: day.label, done: day.todos.filter((t) => t.done).length, total: day.todos.length });
      for (const todo of day.todos) rows.push({ kind: "todo", todo, index: index++ });
    }
    return rows;
  }

  persist() {
    save(this.file, this.todos);
  }

  key(str: string | undefined, key: Key) {
    this.msg = "";
    if (key.ctrl && key.name === "c") process.exit(0);
    if (this.focus === "input") this.inputKey(str, key);
    else this.listKey(key);
  }

  inputKey(str: string | undefined, key: Key) {
    const { input } = this;
    switch (key.ctrl ? `^${key.name}` : key.name) {
      case "return":
      case "enter":
        return this.submit();
      case "escape":
        if (this.editing) return this.stopEditing();
        this.input = [];
        this.cursor = 0;
        return;
      case "down":
      case "tab":
        if (this.editing) this.stopEditing();
        else if (this.todos.length) this.focus = "list";
        return;
      case "backspace":
        if (this.cursor > 0) input.splice(--this.cursor, 1);
        return;
      case "delete":
        input.splice(this.cursor, 1);
        return;
      case "left":
        this.cursor = Math.max(0, this.cursor - 1);
        return;
      case "right":
        this.cursor = Math.min(input.length, this.cursor + 1);
        return;
      case "home":
      case "^a":
        this.cursor = 0;
        return;
      case "end":
      case "^e":
        this.cursor = input.length;
        return;
      case "^u":
        input.splice(0, this.cursor);
        this.cursor = 0;
        return;
      case "^k":
        input.splice(this.cursor);
        return;
      case "^w": {
        let start = this.cursor;
        while (start > 0 && input[start - 1] === " ") start--;
        while (start > 0 && input[start - 1] !== " ") start--;
        input.splice(start, this.cursor - start);
        this.cursor = start;
        return;
      }
      case "^d":
        if (!input.length && !this.editing) process.exit(0);
        return;
    }
    if (str && !key.ctrl && !key.meta) {
      // Pasted text arrives a key at a time; anything that isn't printable (newlines, escapes) is left out.
      const text = chars(str).filter((c) => c >= " " && c !== "\x7f");
      input.splice(this.cursor, 0, ...text);
      this.cursor += text.length;
    }
  }

  submit() {
    const text = this.input.join("").trim();
    if (!text) return;
    if (this.editing) {
      const todo = this.todos.find((t) => t.id === this.editing);
      if (todo) todo.text = text;
      this.persist();
      this.stopEditing();
      return;
    }
    const todo: Todo = { id: randomUUID(), text, created: new Date().toISOString(), done: null };
    this.todos.push(todo);
    this.persist();
    this.input = [];
    this.cursor = 0;
    this.sel = this.shown.indexOf(todo);
    this.scroll = 0;
  }

  stopEditing() {
    this.sel = Math.max(0, this.shown.findIndex((t) => t.id === this.editing));
    this.editing = null;
    this.input = [];
    this.cursor = 0;
    this.focus = "list";
  }

  listKey(key: Key) {
    const shown = this.shown;
    const todo = shown[this.sel];
    switch (key.name) {
      case "up":
      case "k":
        if (this.sel === 0) this.focus = "input";
        else this.sel--;
        return;
      case "down":
      case "j":
        this.sel = Math.min(shown.length - 1, this.sel + 1);
        return;
      case "home":
      case "g":
        this.sel = key.sequence === "G" ? shown.length - 1 : 0;
        return;
      case "end":
        this.sel = shown.length - 1;
        return;
      case "space":
      case "x":
      case "return":
      case "enter":
        if (!todo) return;
        todo.done = todo.done ? null : new Date().toISOString();
        this.persist();
        return;
      case "e":
        if (!todo) return;
        this.editing = todo.id;
        this.input = chars(todo.text);
        this.cursor = this.input.length;
        this.focus = "input";
        return;
      case "d":
      case "delete":
      case "backspace":
        if (!todo) return;
        this.removed = { todo, at: this.todos.indexOf(todo) };
        this.todos.splice(this.removed.at, 1);
        this.persist();
        this.msg = `Deleted “${fit(todo.text, 30)}” · u to undo`;
        if (!this.todos.length) this.focus = "input";
        this.sel = Math.max(0, Math.min(this.sel, this.todos.length - 1));
        return;
      case "u":
        if (!this.removed) return;
        this.todos.splice(this.removed.at, 0, this.removed.todo);
        this.persist();
        this.sel = this.shown.indexOf(this.removed.todo);
        this.removed = null;
        return;
      case "q":
        process.exit(0);
      case "escape":
      case "tab":
      case "i":
      case "a":
      case "n":
      case "/":
        this.focus = "input";
        return;
    }
  }

  draw() {
    const { stdout } = process;
    const cols = stdout.columns || 80;
    const height = stdout.rows || 24;
    const width = Math.max(20, Math.min(MAX_WIDTH, cols - MARGIN * 2));
    const left = " ".repeat(MARGIN);
    const out: string[] = [""];

    // The input box. Its text scrolls sideways when it is wider than the box.
    const inputFocused = this.focus === "input";
    const border = inputFocused ? ACCENT : DIM;
    const title = this.editing ? " Edit todo " : " New todo ";
    const textW = width - 6;
    const start = Math.max(0, this.cursor - textW + 1);
    const text = this.input.slice(start, start + textW).join("");
    const shownLen = Math.min(textW, this.input.length - start);
    const body = this.input.length ? text : `${DIM}${this.editing ? "" : "What needs doing?"}${RESET}`;
    const bodyLen = this.input.length ? shownLen : this.editing ? 0 : "What needs doing?".length;
    out.push(`${left}${border}╭─${BOLD}${title}${RESET}${border}${"─".repeat(width - 3 - title.length)}╮${RESET}`);
    out.push(`${left}${border}│${RESET} ${inputFocused ? ACCENT : DIM}${this.editing ? "✎" : "+"}${RESET} ${body}${" ".repeat(Math.max(0, textW - bodyLen))} ${border}│${RESET}`);
    out.push(`${left}${border}╰${"─".repeat(width - 2)}╯${RESET}`);
    out.push("");

    // The list, scrolled so the selected todo (and if possible its day) is on screen.
    const rows = this.rows();
    const room = Math.max(1, height - LIST_TOP - FOOTER);
    const selRow = rows.findIndex((r) => r.kind === "todo" && r.index === this.sel);
    if (this.focus === "list" && selRow >= 0) {
      const want = rows[selRow - 1]?.kind === "day" ? selRow - 1 : selRow;
      if (want < this.scroll) this.scroll = want;
      if (selRow >= this.scroll + room) this.scroll = selRow - room + 1;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, rows.length - room));
    if (!rows.length) out.push(`${left}${DIM}Nothing here yet. Type a todo above and press enter.${RESET}`);
    for (const row of rows.slice(this.scroll, this.scroll + room)) {
      if (row.kind === "gap") out.push("");
      else if (row.kind === "day") {
        const allDone = row.done === row.total;
        out.push(`${left}${BOLD}${row.label}${RESET}  ${allDone ? GREEN : DIM}${row.done}/${row.total} done${RESET}`);
      } else {
        const selected = this.focus === "list" && row.index === this.sel;
        const mark = row.todo.done ? `${GREEN}✓${RESET}` : `${DIM}○${RESET}`;
        const pointer = selected ? `${ACCENT}›${RESET}` : " ";
        const look = row.todo.done ? DIM + STRIKE : selected ? BOLD : "";
        out.push(`${left}${pointer} ${mark} ${look}${fit(row.todo.text, width - 4)}${RESET}`);
      }
    }

    while (out.length < height - 1) out.push("");
    const hints = this.editing
      ? "⏎ save  esc cancel  ^C quit"
      : inputFocused
        ? "⏎ add  ↓ todos  esc clear  ^C quit"
        : "␣ done  e edit  d delete  u undo  ↑↓ move  i new  q quit";
    out[height - 1] = `${left}${DIM}${this.msg || hints}${RESET}`;

    // Show the terminal's own cursor in the input, and hide it while moving through the list.
    const cursor = inputFocused ? `\x1b[3;${MARGIN + 5 + this.cursor - start}H\x1b[?25h` : "\x1b[?25l";
    stdout.write(`\x1b[?25l\x1b[H${out.slice(0, height).join("\x1b[K\r\n")}\x1b[K\x1b[J${cursor}`);
  }
}
