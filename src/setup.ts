// The first-time setup: where todos are saved. On a Mac that can be iCloud Drive, so they sync across Macs.

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { checkWritable, hasICloudDrive, icloudFile, isMac, localFile, resolvePath, tildify, writeConfig } from "./config.ts";
import { box, contentWidth, LineInput, openScreen, paint, type BoxRow, type Key } from "./term.ts";
import { shorten, theme, type Line } from "./theme.ts";

interface Choice {
  icon: string;
  label: string;
  detail: string;
  /** Where todos go; null asks for a path. */
  file: string | null;
  /** Why it can't be picked. */
  unavailable?: string;
}

const BOX_MAX = 68;
/** Rows above the dialog: the header and a blank line. */
const BOX_TOP = 2;

/** "· 12 todos there" when the file already has todos, e.g. synced from another Mac. */
function existing(file: string): string {
  try {
    const count = (JSON.parse(readFileSync(file, "utf8")) as unknown[]).length;
    return count ? ` · ${count} todo${count === 1 ? "" : "s"} there` : "";
  } catch {
    return "";
  }
}

function choices(): Choice[] {
  const list: Choice[] = [];
  if (isMac) {
    list.push(hasICloudDrive()
      ? { icon: "☁", label: "iCloud Drive", detail: `Synced across your Macs${existing(icloudFile())}`, file: icloudFile() }
      : { icon: "☁", label: "iCloud Drive", detail: "", file: null, unavailable: "Turn on iCloud Drive in System Settings first" });
  }
  list.push(
    { icon: "⌂", label: isMac ? "This Mac only" : "This computer only", detail: `${tildify(localFile())}${existing(localFile())}`, file: localFile() },
    { icon: "…", label: "Somewhere else", detail: "A folder of your choice, e.g. in Dropbox or a git repo", file: null },
  );
  return list;
}

export interface SetupResult {
  file: string;
  /** What happened, for the app to show. */
  msg: string;
}

/** Asks where todos are saved and remembers it; `previous` is where they were until now, when setup runs again. */
export function runSetup(previous: string | null): Promise<SetupResult> {
  return new Promise((done) => {
    const options = choices();
    let sel = Math.max(0, options.findIndex((c) => (previous ? c.file === previous : c.file && !c.unavailable)));
    if (previous && !options.some((c) => c.file === previous)) sel = options.length - 1;
    let askPath = false;
    const path = new LineInput();
    if (previous && sel === options.length - 1) path.set(tildify(previous));
    let error = "";

    const finish = (file: string) => {
      error = checkWritable(file) ?? "";
      if (error) return;
      let msg = `Todos are saved in ${tildify(file)}`;
      if (previous && previous !== file && existsSync(previous) && !existsSync(file)) {
        copyFileSync(previous, file);
        msg = `Copied your todos to ${tildify(file)}`;
      }
      writeConfig({ file });
      done({ file, msg });
    };

    const move = (step: number) => {
      for (let i = sel + step; i >= 0 && i < options.length; i += step) {
        if (!options[i].unavailable) return void (sel = i);
      }
    };

    const onKey = (str: string | undefined, key: Key) => {
      if (askPath) {
        if (key.name === "return" || key.name === "enter") {
          if (path.text.trim()) finish(resolvePath(path.text));
        } else if (key.name === "escape") {
          askPath = false;
          error = "";
        } else if (path.key(str, key)) error = "";
        return;
      }
      if (key.name === "up" || key.name === "k") move(-1);
      else if (key.name === "down" || key.name === "j" || key.name === "tab") move(1);
      else if (key.name === "return" || key.name === "enter" || key.name === "space") {
        const choice = options[sel];
        if (choice.file) finish(choice.file);
        else askPath = true;
      } else if (key.name === "q" || key.name === "escape") process.exit(0);
    };

    const draw = () => {
      const boxW = Math.min(BOX_MAX, contentWidth());
      const inner = boxW - 4;
      const body: BoxRow[] = [];
      let cursorRow = -1;
      let cursorCol = 0;
      if (!askPath) {
        body.push({ line: [["Where should your todos be saved?", "title"]] }, { line: [] });
        options.forEach((c, i) => {
          const selected = i === sel;
          const style = c.unavailable ? "dim" : null;
          body.push({ line: [[selected ? "› " : "  ", "accent"], [`${c.icon}  `, c.unavailable ? "dim" : "info"], [c.label, style ?? "title"]], style: selected ? "rev" : null });
          body.push({ line: [["     ", null], [shorten(c.unavailable ?? c.detail, inner - 5), c.unavailable ? "warn" : "name"]] });
        });
        if (error) body.push({ line: [] }, { line: [[shorten(error, inner), "warn"]] });
      } else {
        body.push({ line: [["A folder or .json file for your todos:", "title"]] }, { line: [] });
        const view = path.view(inner - 2);
        cursorRow = body.length;
        cursorCol = 2 + view.col;
        body.push({ line: [["› ", "accent"], [view.text || "", null]], style: "rev" });
        const hint = path.text.trim() ? `Saved as ${tildify(resolvePath(path.text))}` : "e.g. ~/Dropbox/punch";
        body.push({ line: [[shorten(error || hint, inner), error ? "warn" : "name"]] });
      }
      const title = previous ? "Where todos are saved" : "Welcome to punch";
      const keys = askPath ? "⏎ save · esc back" : "⏎ choose · ↑↓ move · q quit";
      const offset = Math.max(0, Math.floor((contentWidth() - boxW) / 2));
      const pad: Line = offset ? [[" ".repeat(offset), null]] : [];
      const header: Line = [[`${theme.icons.logo} `, "accent"], ["punch", "title"], ["   a todo list, grouped by day", "name"]];
      const lines: Line[] = [header, [], ...box(title, body, keys, boxW).map((l) => [...pad, ...l])];
      // The box's top border and its blank first row come before the body.
      paint(lines, askPath ? [BOX_TOP + 2 + cursorRow, offset + 2 + cursorCol] : null);
    };

    openScreen(onKey, draw);
    draw();
  });
}
