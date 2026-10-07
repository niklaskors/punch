// The full screen, drawing helpers shared by the setup dialog and the app, and a one-line text input.

import { emitKeypressEvents } from "node:readline";
import { ansi, chars, lineLen, shorten, theme, type Line, type Segment, type Style } from "./theme.ts";

/** Left margin of everything on screen. */
export const MARGIN = 2;
export const MAX_WIDTH = 100;
const ESCAPE_MS = 50;

export interface Key {
  name?: string;
  ctrl?: boolean;
  meta?: boolean;
  sequence?: string;
}

export type KeyHandler = (str: string | undefined, key: Key) => void;

/** The width content gets: the terminal's, less the margins, up to MAX_WIDTH. */
export const contentWidth = () => Math.max(20, Math.min(MAX_WIDTH, (process.stdout.columns || 80) - MARGIN * 2));
export const screenHeight = () => process.stdout.rows || 24;

let opened = false;
let handler: KeyHandler | null = null;
let redraw: (() => void) | null = null;

/** Switches to the full screen (once); from now on keys go to onKey and resizes to draw, instead of the previous ones. */
export function openScreen(onKey: KeyHandler, draw: () => void) {
  handler = onKey;
  redraw = draw;
  if (opened) return;
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) {
    console.error("punch needs an interactive terminal");
    process.exit(1);
  }
  opened = true;
  // A lone escape is only told apart from the start of a key sequence after a wait, 500ms by default; readline
  // only reads that from its interface argument. 50ms makes escape react at once, as in jboard.
  emitKeypressEvents(stdin, { escapeCodeTimeout: ESCAPE_MS } as never);
  stdin.setRawMode(true);
  stdout.write("\x1b[?1049h");
  process.on("exit", closeScreen);
  stdin.on("keypress", (str: string | undefined, key: Key | undefined) => {
    const k = key ?? { sequence: str };
    if (k.ctrl && k.name === "c") process.exit(0);
    handler?.(str, k);
    redraw?.();
  });
  stdout.on("resize", () => redraw?.());
}

function closeScreen() {
  if (!opened) return;
  opened = false;
  process.stdout.write("\x1b[?25h\x1b[?1049l");
}

/** Leaves the full screen, so the message isn't wiped with it, and exits with it. */
export function fail(message: string): never {
  closeScreen();
  console.error(`punch: ${message}`);
  process.exit(1);
}

/**
 * Draws the lines from the top, each indented by the margin, clearing what was there. The cursor goes to
 * [row, col] (0-based, the column counted from the margin) or is hidden.
 */
export function paint(lines: Line[], cursor: [number, number] | null) {
  const height = screenHeight();
  const left = " ".repeat(MARGIN);
  const out = lines.slice(0, height).map((line) => (line.length ? left + ansi(line) : ""));
  const show = cursor ? `\x1b[${cursor[0] + 1};${MARGIN + cursor[1] + 1}H\x1b[?25h` : "\x1b[?25l";
  process.stdout.write(`\x1b[?25l\x1b[H${out.join("\x1b[K\r\n")}\x1b[K\x1b[J${show}`);
}

/** The keys as keycaps, as many whole ones as fit, most important first; or a message instead. */
export function footer(hints: [string, string][], width: number, msg = ""): Line {
  if (msg) return [[theme.icons.info ? `${theme.icons.info} ` : "", "accent"], [msg, "msg"]];
  const line: Line = [];
  for (const [key, label] of hints) {
    const hint: Line = [[` ${key} `, "key"], [` ${label}  `, "keylabel"]];
    if (lineLen(line) + lineLen(hint) > width) break;
    line.push(...hint);
  }
  return line;
}

/** A body row of a dialog: a line, a style laid over it (e.g. "rev" for the selected option), or a rule. */
export type BoxRow = { line: Line; style?: Style } | "rule";

/** A dialog box like jboard's: a titled border around a panel, with a footer in the bottom border. */
export function box(title: string, body: BoxRow[], footerText: string, boxW: number): Line[] {
  const [tl, tr, bl, br] = theme.corners;
  const border = (left: string, text: string, right: string, textStyle: Style): Line => {
    if (!text) return [[left + "─".repeat(boxW - 2) + right, "box"]];
    return [[`${left}─ `, "box"], [text, textStyle], [` ${"─".repeat(Math.max(0, boxW - 5 - chars(text).length))}${right}`, "box"]];
  };
  const inner = boxW - 4;
  const row = (line: Line, style: Style): Line => {
    const padded: Line = [...line, [" ".repeat(Math.max(0, inner - lineLen(line))), null]];
    return [["│ ", "box"], ...padded.map(([t, s]): Segment => [t, ["panel", s, style].filter(Boolean).join("+")]), [" │", "box"]];
  };
  const space: BoxRow = { line: [] };
  return [
    border(tl, shorten(title, boxW - 6), tr, "boxtitle"),
    ...[space, ...body, space].map((b) => (b === "rule" ? border("├", "", "┤", "box") : row(b.line, b.style ?? null))),
    border(bl, shorten(footerText, boxW - 6), br, "box"),
  ];
}

/** A one-line text input with the usual editing keys. */
export class LineInput {
  /** The text as characters, so the cursor never ends up inside an emoji. */
  chars: string[] = [];
  cursor = 0;

  get text() {
    return this.chars.join("");
  }

  set(text: string) {
    this.chars = chars(text);
    this.cursor = this.chars.length;
  }

  /** Handles an editing key or typed text; returns false for keys it leaves to the caller. */
  key(str: string | undefined, key: Key): boolean {
    const input = this.chars;
    switch (key.ctrl ? `^${key.name}` : key.name) {
      case "backspace":
        if (this.cursor > 0) input.splice(--this.cursor, 1);
        return true;
      case "delete":
        input.splice(this.cursor, 1);
        return true;
      case "left":
        this.cursor = Math.max(0, this.cursor - 1);
        return true;
      case "right":
        this.cursor = Math.min(input.length, this.cursor + 1);
        return true;
      case "home":
      case "^a":
        this.cursor = 0;
        return true;
      case "end":
      case "^e":
        this.cursor = input.length;
        return true;
      case "^u":
        input.splice(0, this.cursor);
        this.cursor = 0;
        return true;
      case "^k":
        input.splice(this.cursor);
        return true;
      case "^w": {
        let start = this.cursor;
        while (start > 0 && input[start - 1] === " ") start--;
        while (start > 0 && input[start - 1] !== " ") start--;
        input.splice(start, this.cursor - start);
        this.cursor = start;
        return true;
      }
    }
    if (!str || key.ctrl || key.meta || ["return", "enter", "escape", "tab", "up", "down"].includes(key.name ?? "")) return false;
    // Pasted text arrives a key at a time; anything that isn't printable (newlines, escapes) is left out.
    const text = chars(str).filter((c) => c >= " " && c !== "\x7f");
    input.splice(this.cursor, 0, ...text);
    this.cursor += text.length;
    return text.length > 0;
  }

  /** What fits in w columns, scrolled sideways to keep the cursor in view, with the cursor's column in it. */
  view(w: number): { text: string; col: number } {
    const start = Math.max(0, this.cursor - w + 1);
    return { text: this.chars.slice(start, start + w).join(""), col: this.cursor - start };
  }
}
