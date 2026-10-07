// The app: an input on top for new todos, and under it every todo grouped by the day it was added.

import { randomUUID } from "node:crypto";
import { dayKey, groupByDay } from "./days.ts";
import { load, save, type Todo } from "./store.ts";
import { contentWidth, footer, LineInput, openScreen, paint, screenHeight, type Key } from "./term.ts";
import { fill, shorten, theme, type Line } from "./theme.ts";

/** Rows above the list: the header, a blank line, the input's label and the input, and a blank line. */
const LIST_TOP = 5;
/** The input's row. */
const INPUT_ROW = 3;
/** Rows below the list: a blank line and the key hints. */
const FOOTER = 2;
const BAR_W = 20;

const INPUT_KEYS: [string, string][] = [["⏎", "add"], ["↓", "todos"], ["esc", "clear"], ["^C", "quit"]];
const EDIT_KEYS: [string, string][] = [["⏎", "save"], ["esc", "cancel"], ["^C", "quit"]];
const LIST_KEYS: [string, string][] = [
  ["␣", "done"], ["↑↓", "move"], ["i", "new"], ["e", "edit"], ["d", "delete"], ["u", "undo"], ["q", "quit"],
];

type Row =
  | { kind: "day"; label: string; done: number; total: number }
  | { kind: "rule" }
  | { kind: "todo"; todo: Todo; index: number }
  | { kind: "gap" };

export class App {
  todos: Todo[];
  focus: "input" | "list" = "input";
  input = new LineInput();
  /** The todo the input edits; null when it adds a new one. */
  editing: string | null = null;
  /** Index of the selected todo, in the order they are shown. */
  sel = 0;
  /** The first list row on screen. */
  scroll = 0;
  removed: { todo: Todo; at: number } | null = null;
  msg: string;
  readonly file: string;

  constructor(file: string, msg = "") {
    this.file = file;
    this.msg = msg;
    this.todos = load(file);
  }

  run() {
    openScreen((str, key) => this.key(str, key), () => this.draw());
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
      rows.push({ kind: "rule" });
      for (const todo of day.todos) rows.push({ kind: "todo", todo, index: index++ });
    }
    return rows;
  }

  persist() {
    save(this.file, this.todos);
  }

  key(str: string | undefined, key: Key) {
    this.msg = "";
    if (this.focus === "input") this.inputKey(str, key);
    else this.listKey(key);
  }

  inputKey(str: string | undefined, key: Key) {
    if (this.input.key(str, key)) return;
    switch (key.ctrl ? `^${key.name}` : key.name) {
      case "return":
      case "enter":
        return this.submit();
      case "escape":
        if (this.editing) return this.stopEditing();
        this.input.set("");
        return;
      case "down":
      case "tab":
        if (this.editing) this.stopEditing();
        else if (this.todos.length) this.focus = "list";
        return;
      case "^d":
        if (!this.input.text && !this.editing) process.exit(0);
    }
  }

  submit() {
    const text = this.input.text.trim();
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
    this.input.set("");
    this.sel = this.shown.indexOf(todo);
    this.scroll = 0;
  }

  stopEditing() {
    this.sel = Math.max(0, this.shown.findIndex((t) => t.id === this.editing));
    this.editing = null;
    this.input.set("");
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
        this.input.set(todo.text);
        this.focus = "input";
        return;
      case "d":
      case "delete":
      case "backspace":
        if (!todo) return;
        this.removed = { todo, at: this.todos.indexOf(todo) };
        this.todos.splice(this.removed.at, 1);
        this.persist();
        this.msg = `Deleted “${shorten(todo.text, 30)}” · u to undo`;
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
    }
  }

  // -- drawing

  /** ◆ punch, today's date and how much of today is done, like jboard's sprint line. */
  header(): Line {
    const now = new Date();
    const today = this.todos.filter((t) => dayKey(new Date(t.created)) === dayKey(now));
    const done = today.filter((t) => t.done).length;
    const open = this.todos.filter((t) => !t.done).length;
    const date = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
    const line: Line = [[`${theme.icons.logo} `, "accent"], ["punch", "title"], [`   ${date}`, "name"]];
    if (today.length) {
      const filled = Math.round((done / today.length) * BAR_W);
      line.push(["   ", null], [theme.icons.full.repeat(filled), "progress"], [theme.icons.empty.repeat(BAR_W - filled), "track"],
        [`  ${done}/${today.length} done today`, "name"]);
    }
    line.push([`   ${open} open`, "dim"]);
    return line;
  }

  /** A section label like jboard's column headers: a filled pill while it has focus. */
  label(text: string, focused: boolean, count = "", allDone = false): Line {
    const color = allDone ? "done" : "info";
    if (focused) return [[` ${theme.icons.dot ? `${theme.icons.dot} ` : ""}${text}${count ? `  ${count}` : ""} `, allDone ? "pilldone" : "pill"]];
    return [[theme.icons.dot ? `${theme.icons.dot} ` : "", color], [text, `title+${color}`], [count ? `  ${count}` : "", "name"]];
  }

  /** The input as a card, its bar lit while it has focus. */
  inputLine(width: number): { line: Line; col: number } {
    const focused = this.focus === "input";
    const base = focused ? "cardsel" : "card";
    const icon = this.editing ? theme.icons.edit : theme.icons.add;
    const lead: Line = [[focused ? theme.icons.barSel : theme.icons.bar, `${base}+${focused ? "info" : "track"}`], [" ", base],
      [icon, `${base}+${focused ? "accent" : "dim"}`], [" ", base]];
    const view = this.input.view(width - 4);
    const body: Line = this.input.chars.length || this.editing
      ? [[view.text, base]]
      : [["What needs doing?", `${base}+dim`]];
    return { line: fill([...lead, ...body], width, base), col: 4 + view.col };
  }

  todoLine(todo: Todo, selected: boolean, width: number): Line {
    const base = selected ? "cardsel" : "card";
    const bar = todo.done ? "done" : selected ? "info" : "track";
    const mark: Line = todo.done ? [[theme.icons.done, `${base}+done`]] : [[theme.icons.open, `${base}+dim`]];
    const text = shorten(todo.text, width - 3 - theme.icons.open.length);
    return fill([
      [selected ? theme.icons.barSel : theme.icons.bar, `${base}+${bar}`], [" ", base], ...mark, [" ", base],
      [text, todo.done ? `${base}+dim+strike` : selected ? `${base}+title` : base],
    ], width, base);
  }

  draw() {
    const width = contentWidth();
    const height = screenHeight();
    const inputFocused = this.focus === "input";
    const input = this.inputLine(width);
    const out: Line[] = [
      this.header(),
      [],
      this.label(this.editing ? "EDIT TODO" : "NEW TODO", inputFocused),
      input.line,
      [],
    ];

    // The list, scrolled so the selected todo (and if possible its day) is on screen.
    const rows = this.rows();
    const room = Math.max(1, height - LIST_TOP - FOOTER);
    const selRow = rows.findIndex((r) => r.kind === "todo" && r.index === this.sel);
    if (this.focus === "list" && selRow >= 0) {
      const want = rows[selRow - 1]?.kind === "rule" ? selRow - 2 : selRow;
      if (want < this.scroll) this.scroll = want;
      if (selRow >= this.scroll + room) this.scroll = selRow - room + 1;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, rows.length - room));
    if (!rows.length) out.push([["Nothing here yet. Type a todo above and press enter.", "empty"]]);
    for (const row of rows.slice(this.scroll, this.scroll + room)) {
      if (row.kind === "gap") out.push([]);
      else if (row.kind === "rule") out.push([["─".repeat(width), "rule"]]);
      else if (row.kind === "day") out.push(this.label(row.label.toUpperCase(), false, `${row.done}/${row.total} done`, row.done === row.total));
      else out.push(this.todoLine(row.todo, this.focus === "list" && row.index === this.sel, width));
    }

    while (out.length < height - 1) out.push([]);
    const keys = this.editing ? EDIT_KEYS : inputFocused ? INPUT_KEYS : LIST_KEYS;
    out[height - 1] = footer(keys, width, this.msg);

    // The terminal's own cursor shows in the input, and is hidden while moving through the list.
    paint(out, inputFocused ? [INPUT_ROW, input.col] : null);
  }
}
