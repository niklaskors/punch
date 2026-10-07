// The app: an input on top for new todos, and under it every todo grouped by the day it was added.

import { randomUUID } from "node:crypto";
import { dayKey, groupByDay } from "./days.ts";
import { load, save, type Todo } from "./store.ts";
import { contentWidth, footer, LineInput, openScreen, paint, screenHeight, type Key } from "./term.ts";
import { fill, lineLen, shorten, theme, type Line, type Segment } from "./theme.ts";

/** Rows above the list: the header, a blank line, the input's label and the input, and a blank line. */
const LIST_TOP = 5;
/** The input's row. */
const INPUT_ROW = 3;
/** Rows below the list: a blank line and the key hints. */
const FOOTER = 2;
const BAR_W = 20;

const FIELD_KEYS: [string, string][] = [["⏎", "new todo"], ["↓", "todos"], ["u", "undo"], ["q", "quit"]];
const INPUT_KEYS: [string, string][] = [["⏎", "add"], ["esc", "stop typing"], ["↓", "todos"], ["^C", "quit"]];
const EDIT_KEYS: [string, string][] = [["⏎", "save"], ["esc", "cancel"], ["^C", "quit"]];
const LIST_KEYS: [string, string][] = [
  ["␣", "done"], ["↑↓", "move"], ["e", "edit"], ["d", "delete"], ["u", "undo"], ["q", "quit"],
];

type Row =
  | { kind: "day"; label: string; done: number; total: number }
  | { kind: "rule" }
  | { kind: "todo"; todo: Todo; index: number }
  | { kind: "gap" };

export class App {
  todos: Todo[];
  /**
   * The new-todo field (selected, but keys don't type in it until enter is pressed), typing in it, the list,
   * or the selected todo being edited in its row.
   */
  focus: "field" | "input" | "list" | "edit" = "field";
  input = new LineInput();
  /** The selected todo's text while it is edited. */
  edit = new LineInput();
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
    if (this.focus === "field") this.fieldKey(key);
    else if (this.focus === "input") this.inputKey(str, key);
    else if (this.focus === "edit") this.editKey(str, key);
    else this.listKey(key);
  }

  fieldKey(key: Key) {
    switch (key.name) {
      case "return":
      case "enter":
        this.focus = "input";
        return;
      case "down":
      case "j":
      case "tab":
        if (this.todos.length) this.focus = "list";
        return;
      case "u":
        return this.undo();
      case "q":
        process.exit(0);
    }
  }

  inputKey(str: string | undefined, key: Key) {
    if (this.input.key(str, key)) return;
    switch (key.ctrl ? `^${key.name}` : key.name) {
      case "return":
      case "enter":
        return this.submit();
      case "escape":
        this.focus = "field";
        return;
      case "down":
      case "tab":
        if (this.todos.length) this.focus = "list";
        return;
      case "^d":
        if (!this.input.text) process.exit(0);
    }
  }

  /** Editing in the todo's own row: enter saves, escape leaves it as it was. */
  editKey(str: string | undefined, key: Key) {
    if (this.edit.key(str, key)) return;
    if (key.name === "return" || key.name === "enter") {
      const text = this.edit.text.trim();
      const todo = this.shown[this.sel];
      if (text && todo && text !== todo.text) {
        todo.text = text;
        this.persist();
      }
      this.focus = "list";
    } else if (key.name === "escape") this.focus = "list";
  }

  submit() {
    const text = this.input.text.trim();
    if (!text) {
      this.focus = "field";
      return;
    }
    const todo: Todo = { id: randomUUID(), text, created: new Date().toISOString(), done: null };
    this.todos.push(todo);
    this.persist();
    this.input.set("");
    this.sel = this.shown.indexOf(todo);
    this.scroll = 0;
  }

  listKey(key: Key) {
    const shown = this.shown;
    const todo = shown[this.sel];
    switch (key.name) {
      case "up":
      case "k":
        if (this.sel === 0) this.focus = "field";
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
        this.edit.set(todo.text);
        this.focus = "edit";
        return;
      case "d":
      case "delete":
      case "backspace":
        if (!todo) return;
        this.removed = { todo, at: this.todos.indexOf(todo) };
        this.todos.splice(this.removed.at, 1);
        this.persist();
        this.msg = `Deleted “${shorten(todo.text, 30)}” · u to undo`;
        if (!this.todos.length) this.focus = "field";
        this.sel = Math.max(0, Math.min(this.sel, this.todos.length - 1));
        return;
      case "u":
        return this.undo();
      case "q":
        process.exit(0);
      case "escape":
      case "tab":
        this.focus = "field";
    }
  }

  /** Brings back the todo deleted last, selected in the list. */
  undo() {
    if (!this.removed) return;
    this.todos.splice(this.removed.at, 0, this.removed.todo);
    this.persist();
    this.sel = this.shown.indexOf(this.removed.todo);
    this.removed = null;
    this.focus = "list";
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

  /** The new-todo field as a card, its bar lit while it is selected; it shows a cursor once enter is pressed. */
  inputLine(width: number): { line: Line; col: number } {
    const focused = this.focus === "field" || this.focus === "input";
    const base = focused ? "cardsel" : "card";
    const lead: Line = [[focused ? theme.icons.barSel : theme.icons.bar, `${base}+${focused ? "info" : "track"}`], [" ", base],
      [theme.icons.add, `${base}+${focused ? "accent" : "dim"}`], [" ", base]];
    const view = this.input.view(width - 4);
    const hint = this.focus === "input" ? "What needs doing?" : "Press enter to add a todo";
    const body: Line = this.input.chars.length ? [[view.text, base]] : [[hint, `${base}+dim`]];
    return { line: fill([...lead, ...body], width, base), col: 4 + view.col };
  }

  /** A todo as a card; the one being edited holds the edit input, with the cursor at `col`. */
  todoLine(todo: Todo, selected: boolean, width: number): { line: Line; col: number } {
    const base = selected ? "cardsel" : "card";
    const editing = selected && this.focus === "edit";
    const bar = editing ? "info" : todo.done ? "done" : selected ? "info" : "track";
    const mark: Segment = editing ? [theme.icons.edit, `${base}+accent`]
      : todo.done ? [theme.icons.done, `${base}+done`] : [theme.icons.open, `${base}+dim`];
    const lead: Line = [[selected ? theme.icons.barSel : theme.icons.bar, `${base}+${bar}`], [" ", base], mark, [" ", base]];
    const room = width - lineLen(lead);
    if (editing) {
      const view = this.edit.view(room);
      return { line: fill([...lead, [view.text, base]], width, base), col: lineLen(lead) + view.col };
    }
    const look = todo.done ? `${base}+dim+strike` : selected ? `${base}+title` : base;
    return { line: fill([...lead, [shorten(todo.text, room), look]], width, base), col: 0 };
  }

  draw() {
    const width = contentWidth();
    const height = screenHeight();
    const input = this.inputLine(width);
    const out: Line[] = [this.header(), [], this.label("NEW TODO", this.focus === "field" || this.focus === "input"), input.line, []];
    let cursor: [number, number] | null = this.focus === "input" ? [INPUT_ROW, input.col] : null;

    // The list, scrolled so the selected todo (and if possible its day) is on screen.
    const rows = this.rows();
    const room = Math.max(1, height - LIST_TOP - FOOTER);
    const selRow = rows.findIndex((r) => r.kind === "todo" && r.index === this.sel);
    if ((this.focus === "list" || this.focus === "edit") && selRow >= 0) {
      const want = rows[selRow - 1]?.kind === "rule" ? selRow - 2 : selRow;
      if (want < this.scroll) this.scroll = want;
      if (selRow >= this.scroll + room) this.scroll = selRow - room + 1;
    }
    this.scroll = Math.max(0, Math.min(this.scroll, rows.length - room));
    if (!rows.length) out.push([["Nothing here yet. Press enter to add your first todo.", "empty"]]);
    for (const row of rows.slice(this.scroll, this.scroll + room)) {
      if (row.kind === "gap") out.push([]);
      else if (row.kind === "rule") out.push([["─".repeat(width), "rule"]]);
      else if (row.kind === "day") out.push(this.label(row.label.toUpperCase(), false, `${row.done}/${row.total} done`, row.done === row.total));
      else {
        const selected = (this.focus === "list" || this.focus === "edit") && row.index === this.sel;
        const todo = this.todoLine(row.todo, selected, width);
        if (selected && this.focus === "edit") cursor = [out.length, todo.col];
        out.push(todo.line);
      }
    }

    while (out.length < height - 1) out.push([]);
    const keys = { field: FIELD_KEYS, input: INPUT_KEYS, list: LIST_KEYS, edit: EDIT_KEYS }[this.focus];
    out[height - 1] = footer(keys, width, this.msg);

    // The terminal's own cursor shows where text is typed, and is hidden otherwise.
    paint(out, cursor);
  }
}
