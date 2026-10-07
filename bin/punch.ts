#!/usr/bin/env node
// punch: a simple todo list in the terminal, grouped by the day each todo was added.

import { parseArgs } from "node:util";
import { App } from "../src/app.ts";
import { configFile, tildify, todosFile } from "../src/config.ts";
import { runSetup } from "../src/setup.ts";
import { fail } from "../src/term.ts";
import { THEME_NAMES, useTheme } from "../src/theme.ts";

const USAGE = `Usage: punch [--setup] [-t THEME]

Your punch list in the terminal. Type a todo and press enter to add it; press ↓
to go through the list, space to mark one as done.

  --setup        choose again where todos are saved (they are copied over)
  -t, --theme    night (default, dark), day (light terminals) or classic (16 colours);
                 or set $PUNCH_THEME
  -h, --help     show this

Environment:
  PUNCH_FILE     save todos in this file, instead of where setup put them
  PUNCH_THEME    night, day or classic`;

let values;
try {
  ({ values } = parseArgs({
    options: { setup: { type: "boolean" }, theme: { type: "string", short: "t" }, help: { type: "boolean", short: "h" } },
  }));
} catch (err) {
  console.error(`punch: ${(err as Error).message}\n\n${USAGE}`);
  process.exit(2);
}

const file = todosFile();
if (values.help) {
  const where = file ? tildify(file) : "not chosen yet: punch asks the first time it starts";
  console.log(`${USAGE}\n\nTodos are saved in ${where}\nSettings are in ${tildify(configFile())}`);
  process.exit(0);
}

const themeName = values.theme ?? process.env.PUNCH_THEME ?? "night";
if (!useTheme(themeName)) {
  console.error(`punch: unknown theme "${themeName}", choose from: ${THEME_NAMES.join(", ")}`);
  process.exit(2);
}

if (values.setup && process.env.PUNCH_FILE) {
  console.error("punch: PUNCH_FILE is set, so it decides where todos are saved; unset it to use --setup");
  process.exit(2);
}

const { file: chosen, msg } = values.setup || !file ? await runSetup(file) : { file, msg: "" };
let app: App;
try {
  app = new App(chosen, msg);
} catch (err) {
  fail((err as Error).message);
}
app.run();
