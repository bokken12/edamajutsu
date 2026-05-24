import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test, vi } from 'vitest';

// HelpView and its transitive deps (decoratedText, ui/menus) import `vscode`,
// which only exists inside the extension host. Stub the handful of APIs they
// touch so the renderer can run in plain Node.
vi.mock('vscode', () => ({
  Uri: {
    from: (parts: { scheme: string; path: string }) => ({
      ...parts,
      toString: () => `${parts.scheme}:${parts.path}`
    })
  },
  EventEmitter: class {
    event = (): { dispose: () => void } => ({ dispose: () => {} });
    fire(): void {}
  },
  Range: class {},
  commands: { executeCommand: () => Promise.resolve() }
}));

import { HelpView } from '../views/help';

const PACKAGE_JSON = JSON.parse(
  readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')
);

// Snapshots the buffer the user sees after pressing `?`. Updating
// keybindings or command titles in package.json will fail this test
// until you run `npm run test:update` and eyeball the diff — that's
// intentional: the help text is a user-facing contract, so any change
// to it should be a conscious one.
test('? help view renders the current keybindings', () => {
  const view = new HelpView(PACKAGE_JSON);
  expect(view.provideTextDocumentContent(undefined as never)).toMatchInlineSnapshot(`
    "edamajutsu: help

    Press q to close this view.

    Views
      g     Refresh
      l     Open Log
      o     Open Op Log
      RET   Visit at Point
      ?     Help
      q     Close View

    Changes
      n     New Change
      c     Describe Working Copy
      e     Edit Change at Point
      k     Abandon Change at Point
      s     Squash Working Copy Into Parent
      a     Absorb Working Copy Into Ancestors
      y     Duplicate Change at Point
      r     Rebase Change at Point + Descendants
      V     Revert Change at Point (apply its reverse)
      u     Undo Last Operation
      U     Redo Last Undone Operation

    Menus
      b     Bookmark Menu
             c  create — Create a new bookmark at the change at point
             s  set — Move an existing bookmark to the change at point
             d  delete — Delete a bookmark
             r  rename — Rename a bookmark
             f  forget — Forget a bookmark locally (don't propagate to remotes)
      G     Git Menu
             p  push — jj git push --allow-new
             f  fetch — jj git fetch
    "
  `);
});
