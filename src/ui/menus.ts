import * as vscode from 'vscode';

import { Menu } from './menu';

// Shared registry of sub-menus opened by chord keys (e.g. `b`, `shift+g`).
// Both `extension.ts` (to register the runtime handlers) and the help view (to
// surface the sub-keys to the user) read from here, so adding an item updates
// both places automatically.

export const bookmarkMenu: Menu = {
  title: 'Bookmark',
  items: [
    {
      key: 'c',
      label: 'create',
      description: 'Create a new bookmark at the change at point',
      action: () => vscode.commands.executeCommand('edamajutsu.bookmark.create')
    },
    {
      key: 's',
      label: 'set',
      description: 'Move an existing bookmark to the change at point',
      action: () => vscode.commands.executeCommand('edamajutsu.bookmark.set')
    },
    {
      key: 'd',
      label: 'delete',
      description: 'Delete a bookmark',
      action: () => vscode.commands.executeCommand('edamajutsu.bookmark.delete')
    },
    {
      key: 'r',
      label: 'rename',
      description: 'Rename a bookmark',
      action: () => vscode.commands.executeCommand('edamajutsu.bookmark.rename')
    },
    {
      key: 'f',
      label: 'forget',
      description: "Forget a bookmark locally (don't propagate to remotes)",
      action: () => vscode.commands.executeCommand('edamajutsu.bookmark.forget')
    }
  ]
};

export const gitMenu: Menu = {
  title: 'Git',
  items: [
    {
      key: 'p',
      label: 'push',
      description: 'jj git push --allow-new',
      action: () => vscode.commands.executeCommand('edamajutsu.git.push')
    },
    {
      key: 'f',
      label: 'fetch',
      description: 'jj git fetch',
      action: () => vscode.commands.executeCommand('edamajutsu.git.fetch')
    }
  ]
};

// Map of "menu command id" → the menu it opens. Used by the help view to
// expand sub-menu contents inline.
export const SUBMENUS: ReadonlyMap<string, Menu> = new Map([
  ['edamajutsu.bookmark.menu', bookmarkMenu],
  ['edamajutsu.git.menu', gitMenu]
]);
