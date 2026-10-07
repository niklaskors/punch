# punch

Your punch list in the terminal: a simple todo list. The input for a new todo sits on top; under it, every todo is
grouped by the day it was added, newest first.

![punch showing todos grouped by day in the terminal](docs/screenshot.png)

## Install

Needs Node 22.18 or newer, which runs the TypeScript directly. There are no runtime dependencies.

```sh
git clone git@github.com:niklaskors/punch.git
ln -s "$PWD/punch/bin/punch.ts" ~/.local/bin/punch
punch
```

The first time it starts, punch asks where to save your todos:

- **iCloud Drive** (on a Mac): synced across your Macs. Pick it on each Mac and they share one list.
- **This Mac only**: `~/.local/share/punch/todos.json`.
- **Somewhere else**: any folder or `.json` file, e.g. in Dropbox or a git repo.

Run `punch --setup` to choose again; your todos are copied to the new place.

## Themes

`-t night` (default, dark), `-t day` (light terminals) or `-t classic` (16 colours), or set `PUNCH_THEME`.
24-bit colour is used when `$COLORTERM` says so.

## Keys

punch starts on the new todo field. Keys there are commands, until you press `enter` to start typing.

On the new todo field:

| Key | |
| --- | --- |
| `enter` | start typing a new todo |
| `↓` / `tab` | go to the list |
| `u` | undo a delete |
| `q` | quit |

While typing a new todo:

| Key | |
| --- | --- |
| `enter` | add the todo, and keep typing the next one |
| `esc` | stop typing (what you typed stays) |
| `↓` / `tab` | go to the list |
| `^A` `^E` `^U` `^K` `^W` | the usual line editing |
| `^C` | quit |

In the list:

| Key | |
| --- | --- |
| `↑` `↓` / `k` `j` | move (up from the first todo goes back to the new todo field) |
| `space` / `x` / `enter` | mark as done, or open again |
| `e` | edit the todo in place: `enter` saves, `esc` cancels |
| `d` | delete, `u` to undo |
| `esc` / `tab` | back to the new todo field |
| `q` | quit |

## Data

Todos are one JSON file, in the place chosen at setup. That choice is kept in `~/.config/punch/config.json`
(or under `$XDG_CONFIG_HOME`). Set `PUNCH_FILE` to use another file regardless.

When iCloud keeps the file only in the cloud ("Optimise Mac Storage"), punch downloads it before starting, so
it never starts from an empty list and overwrites the real one.

## Development

```sh
npm install      # tools for checking and testing; punch itself has no dependencies
npm run check    # type-check
npm test         # Vitest
```

The integration tests in `test/punch.test.ts` run the real `punch` command in a pseudo-terminal
([node-pty](https://github.com/microsoft/node-pty)), read its screen with a headless
[xterm.js](https://xtermjs.org), and press keys like you would. Each test gets its own temporary home folder,
so your own todos and settings are never touched.

## License

MIT
