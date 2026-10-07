// Grouping todos by the (local) day they were added.

import type { Todo } from "./store.ts";

export interface Day {
  key: string;
  label: string;
  /** Newest first, so a todo that was just added shows right under the input. */
  todos: Todo[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The local date as YYYY-MM-DD. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "Today", "Yesterday", or e.g. "Monday 5 October" (with the year when it isn't this year). */
export function dayLabel(key: string, now = new Date()): string {
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === dayKey(now)) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const month = date.toLocaleDateString("en-GB", { month: "long" });
  return `${weekday} ${d} ${month}${y === now.getFullYear() ? "" : ` ${y}`}`;
}

/** Days newest first, each with its todos newest first. */
export function groupByDay(todos: Todo[], now = new Date()): Day[] {
  const days = new Map<string, Todo[]>();
  for (const todo of todos) {
    const key = dayKey(new Date(todo.created));
    days.set(key, [...(days.get(key) ?? []), todo]);
  }
  return [...days]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, list]) => ({ key, label: dayLabel(key, now), todos: list.sort((a, b) => b.created.localeCompare(a.created)) }));
}
