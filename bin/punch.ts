#!/usr/bin/env node
// punch: a simple todo list in the terminal, grouped by the day each todo was added.

import { App } from "../src/app.ts";
import { dataFile } from "../src/store.ts";

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(`Usage: punch

A todo list in the terminal. Type a todo and press enter to add it; press ↓ to
go through the list, space to mark one as done.

Todos are saved in ${dataFile()}
(set PUNCH_FILE to use another file).`);
  process.exit(0);
}

new App(dataFile()).run();
