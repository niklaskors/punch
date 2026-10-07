# todo-tui

A simple todo list in the terminal. The input for a new todo sits on top; under it, every todo is
grouped by the day it was added, newest first.

```
  ╭─ New todo ─────────────────────────────────────────────────────╮
  │ + What needs doing?                                            │
  ╰────────────────────────────────────────────────────────────────╯

  Today  1/2 done
    ○ Call mum
    ✓ Buy milk

  Yesterday  1/2 done
  › ○ Book dentist appointment
    ✓ Water the plants

  ␣ done  e edit  d delete  u undo  ↑↓ move  i new  q quit
```

## Install

Needs Node 22.18 or newer, which runs the TypeScript directly. There are no runtime dependencies.

```sh
git clone git@github.com:niklaskors/todo-tui.git
ln -s "$PWD/todo-tui/bin/todo.ts" ~/.local/bin/todo
todo
```

## Keys

In the input:

| Key | |
| --- | --- |
| `enter` | add the todo (or save the edit) |
| `↓` / `tab` | go to the list |
| `esc` | clear the input (or cancel the edit) |
| `^A` `^E` `^U` `^K` `^W` | the usual line editing |
| `^C` | quit |

In the list:

| Key | |
| --- | --- |
| `↑` `↓` / `k` `j` | move (up from the first todo goes back to the input) |
| `space` / `x` / `enter` | mark as done, or open again |
| `e` | edit |
| `d` | delete, `u` to undo |
| `i` / `esc` / `tab` | back to the input |
| `q` | quit |

## Data

Todos are saved as JSON in `~/.local/share/todo-tui/todos.json` (or under `$XDG_DATA_HOME`).
Set `TODO_FILE` to use another file.

## Development

```sh
npm install      # only TypeScript and Node's types, for checking
npm run check    # type-check
npm test
```

## License

MIT
