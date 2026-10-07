// Integration tests: the real punch command in a terminal, driven by key presses, checked on screen and on disk.

import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Home, KEYS, Punch, todo } from "./harness.ts";

const isMac = process.platform === "darwin";

let home: Home;
let punch: Punch | null;

beforeEach(() => {
  home = new Home();
  punch = null;
});

afterEach(async () => {
  await punch?.quit();
  home.remove();
});

async function start(args: string[] = [], env: Record<string, string> = {}) {
  punch = new Punch(home, args, env);
  await punch.waitFor((text) => text.includes("Where should your todos be saved?") || text.includes("NEW TODO"));
  return punch;
}

describe("first-time setup", () => {
  it.runIf(isMac)("offers iCloud Drive first on a Mac with iCloud Drive, and saves todos there", async () => {
    home.enableICloud();
    const app = await start();
    expect(app.text()).toContain("Welcome to punch");
    expect(app.screen()[app.row("iCloud Drive")]).toContain("›");

    await app.type(KEYS.enter);
    await app.waitFor("NEW TODO");
    const file = `${home.icloudDrive}/punch/todos.json`;
    expect(home.config().file).toBe(file);

    await app.type(KEYS.enter, "Synced todo", KEYS.enter);
    expect(home.todos(file).map((t) => t.text)).toEqual(["Synced todo"]);
  });

  it.runIf(isMac)("can't pick iCloud Drive while it is turned off", async () => {
    const app = await start();
    expect(app.text()).toContain("Turn on iCloud Drive in System Settings first");
    expect(app.screen()[app.row("This Mac only")]).toContain("›");

    await app.type(KEYS.up); // nothing above to move to
    expect(app.screen()[app.row("This Mac only")]).toContain("›");
    await app.type(KEYS.enter);
    await app.waitFor("NEW TODO");
    expect(home.config().file).toBe(home.path(".local", "share", "punch", "todos.json"));
  });

  it("saves todos in a folder of your choice", async () => {
    const app = await start();
    await app.type(KEYS.down, KEYS.down, KEYS.enter);
    await app.waitFor("A folder or .json file for your todos:");

    await app.type("~/Sync/punch");
    expect(app.text()).toContain("Saved as ~/Sync/punch/todos.json");
    await app.type(KEYS.enter);
    await app.waitFor("NEW TODO");
    expect(home.config().file).toBe(home.path("Sync", "punch", "todos.json"));
  });

  it("says so when a folder can't be written to, and lets you fix it", async () => {
    const app = await start();
    await app.type(KEYS.down, KEYS.down, KEYS.enter, "/dev/null/punch", KEYS.enter);
    await app.waitFor("isn't a folder");
    expect(existsSync(home.path(".config", "punch", "config.json"))).toBe(false);

    await app.type(KEYS.ctrlU, "~/notes", KEYS.enter);
    await app.waitFor("NEW TODO");
    expect(home.config().file).toBe(home.path("notes", "todos.json"));
  });

  it("goes back to the choices with escape", async () => {
    const app = await start();
    await app.type(KEYS.down, KEYS.down, KEYS.enter);
    await app.waitFor("A folder or .json file");
    await app.type(KEYS.esc);
    await app.waitFor("Where should your todos be saved?");
  });

  it("copies your todos when you choose another place with --setup", async () => {
    const old = home.configure(home.path("old", "todos.json"), [todo("Keep me", new Date())]);
    const app = await start(["--setup"]);
    expect(app.text()).toContain("Where todos are saved");
    expect(app.screen()[app.row("Somewhere else")]).toContain("›"); // the current, custom place

    await app.type(KEYS.enter, KEYS.ctrlU, "~/new", KEYS.enter);
    await app.waitFor("Copied your todos to ~/new/todos.json");
    expect(app.text()).toContain("Keep me");
    expect(home.todos().map((t) => t.text)).toEqual(["Keep me"]);
    expect(existsSync(old)).toBe(true);
  });

  it("is skipped when PUNCH_FILE says where todos go", async () => {
    const file = home.path("elsewhere.json");
    const app = await start([], { PUNCH_FILE: file });
    await app.type(KEYS.enter, "Via env", KEYS.enter);
    expect(home.todos(file).map((t) => t.text)).toEqual(["Via env"]);
  });
});

describe("the todo list", () => {
  it("stops typing as soon as escape is pressed", async () => {
    home.configure();
    const app = await start();
    await app.type(KEYS.enter, "draft");
    const pressed = Date.now();
    app.pty.write(KEYS.esc);
    // The key hints change from typing ("esc stop typing") back to the field's ("⏎ new todo").
    await app.waitFor((text) => text.includes("new todo") && !text.includes("stop typing"));
    expect(Date.now() - pressed).toBeLessThan(250);
  });

  it("starts on the new todo field, but only types in it after enter", async () => {
    home.configure();
    const app = await start();
    expect(app.text()).toContain("Nothing here yet");
    expect(app.text()).toContain("Press enter to add a todo");

    await app.type("q"); // keys are commands until enter: q quits
    expect(await app.exited).toBe(0);
    punch = null;
  });

  it("adds todos under today, newest first, and keeps typing until escape", async () => {
    home.configure();
    const app = await start();
    await app.type(KEYS.enter);
    expect(app.cursor().row).toBe(app.row("What needs doing?"));

    await app.type("Buy milk", KEYS.enter, "Call mum", KEYS.enter);
    const today = app.row("TODAY");
    expect(app.screen()[today]).toContain("0/2 done");
    expect(app.row("Call mum")).toBeLessThan(app.row("Buy milk"));
    expect(app.row("Call mum")).toBeGreaterThan(today);
    expect(home.todos().map((t) => t.text)).toEqual(["Buy milk", "Call mum"]);

    await app.type("half", KEYS.esc, "xyz"); // after escape, keys don't type any more
    expect(app.screen()[app.row("NEW TODO") + 1]).toContain("half");
    expect(app.text()).not.toContain("xyz");
  });

  it("groups todos by the day they were added", async () => {
    const now = new Date();
    const daysAgo = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, 12);
    home.configure(undefined, [todo("Long ago", daysAgo(5)), todo("Yesterday's", daysAgo(1)), todo("Today's", daysAgo(0))]);
    const app = await start();

    const fifth = daysAgo(5);
    const label = `${fifth.toLocaleDateString("en-GB", { weekday: "long" })} ${fifth.getDate()} ${fifth.toLocaleDateString("en-GB", { month: "long" })}`.toUpperCase();
    const rows = ["TODAY", "Today's", "YESTERDAY", "Yesterday's", label, "Long ago"].map((t) => app.row(t));
    expect(rows.every((r) => r >= 0)).toBe(true);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
  });

  it("marks todos as done and open again", async () => {
    home.configure();
    const app = await start();
    await app.type(KEYS.enter, "First", KEYS.enter, "Second", KEYS.enter);

    await app.type(KEYS.down, KEYS.down, " "); // the list starts at the newest: Second, then First
    expect(app.screen()[app.row("First")]).toContain("✓");
    expect(app.screen()[app.row("TODAY")]).toContain("1/2 done");
    expect(app.text()).toContain("1/2 done today");
    expect(home.todos().find((t) => t.text === "First")?.done).toBeTruthy();

    await app.type(" ");
    expect(app.screen()[app.row("First")]).toContain("○");
    expect(home.todos().find((t) => t.text === "First")?.done).toBeNull();
  });

  it("edits a todo in its own row, keeping a half-typed new todo", async () => {
    home.configure(undefined, [todo("Call mum", new Date())]);
    const app = await start();
    await app.type(KEYS.enter, "draft", KEYS.down, "e");

    const row = app.row("Call mum");
    expect(app.screen()[row]).toContain("✎");
    expect(app.cursor().row).toBe(row);
    await app.type(" and dad", KEYS.enter);
    expect(app.text()).toContain("Call mum and dad");
    expect(app.text()).toContain("draft");
    expect(home.todos().map((t) => t.text)).toEqual(["Call mum and dad"]);
  });

  it("leaves a todo as it was when editing is cancelled", async () => {
    home.configure(undefined, [todo("Call mum", new Date())]);
    const app = await start();
    await app.type(KEYS.down, "e", KEYS.ctrlU, "Something else", KEYS.esc);
    expect(app.text()).toContain("Call mum");
    expect(app.text()).not.toContain("Something else");
    expect(home.todos().map((t) => t.text)).toEqual(["Call mum"]);
  });

  it("deletes a todo, and brings it back with u, also when it was the last one", async () => {
    home.configure(undefined, [todo("Oops", new Date())]);
    const app = await start();
    await app.type(KEYS.down, "d");
    expect(app.text()).toContain("Deleted “Oops” · u to undo");
    expect(home.todos()).toEqual([]);

    await app.type("u");
    expect(app.text()).toContain("Oops");
    expect(home.todos().map((t) => t.text)).toEqual(["Oops"]);
  });

  it("goes back to the input from the top of the list", async () => {
    home.configure(undefined, [todo("Only one", new Date())]);
    const app = await start();
    await app.type(KEYS.down);
    expect(app.text()).toContain("done");
    await app.type(KEYS.up, KEYS.enter, "typed");
    expect(app.screen()[app.row("NEW TODO") + 1]).toContain("typed");
  });

  it("quits with q from the list", async () => {
    home.configure();
    const app = await start();
    await app.type(KEYS.enter, "x", KEYS.enter, KEYS.down, "q");
    expect(await app.exited).toBe(0);
  });
});
