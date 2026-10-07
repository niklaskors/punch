import assert from "node:assert/strict";
import { test } from "node:test";
import { dayLabel, groupByDay } from "../src/days.ts";
import type { Todo } from "../src/store.ts";

const now = new Date(2026, 9, 7, 12);
const todo = (text: string, created: Date): Todo => ({ id: text, text, created: created.toISOString(), done: null });

test("labels today, yesterday and older days", () => {
  assert.equal(dayLabel("2026-10-07", now), "Today");
  assert.equal(dayLabel("2026-10-06", now), "Yesterday");
  assert.equal(dayLabel("2026-10-05", now), "Monday 5 October");
  assert.equal(dayLabel("2025-12-31", now), "Wednesday 31 December 2025");
});

test("groups by local day, newest day and newest todo first", () => {
  const days = groupByDay([
    todo("old", new Date(2026, 9, 5, 9)),
    todo("morning", new Date(2026, 9, 7, 8)),
    todo("late yesterday", new Date(2026, 9, 6, 23, 59)),
    todo("noon", new Date(2026, 9, 7, 12)),
  ], now);
  assert.deepEqual(days.map((d) => [d.label, d.todos.map((t) => t.text)]), [
    ["Today", ["noon", "morning"]],
    ["Yesterday", ["late yesterday"]],
    ["Monday 5 October", ["old"]],
  ]);
});
