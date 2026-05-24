import * as vscode from 'vscode';

import { DecoratedDocBuilder, DecorationRanges, LineBuilder } from '../render/decoratedText';
import { Menu } from '../ui/menu';
import { SUBMENUS } from '../ui/menus';

export const HELP_URI = vscode.Uri.from({ scheme: 'edamajutsu', path: 'help.edamajutsu' });

// Subset of the package.json manifest that the help renderer cares about.
// We accept anything that satisfies this shape so the help view doesn't depend
// on import-time access to the actual file (which would fight tsconfig's
// rootDir). `extension.ts` passes `context.extension.packageJSON` in.
export type PackageManifest = {
  readonly contributes?: {
    readonly keybindings?: ReadonlyArray<{
      readonly command: string;
      readonly key: string;
      readonly when?: string;
    }>;
    readonly commands?: ReadonlyArray<{
      readonly command: string;
      readonly title: string;
    }>;
  };
};

// Groups command IDs into the categories the help view renders, in order.
// Anything not listed here is collected into a trailing "Other" section so a
// newly-added keybinding can never go missing from `?`.
const CATEGORIES: ReadonlyArray<{ title: string; commands: ReadonlyArray<string> }> = [
  {
    title: 'Views',
    commands: [
      'edamajutsu.refresh',
      'edamajutsu.openLog',
      'edamajutsu.openOpLog',
      'edamajutsu.visitAtPoint',
      'editor.toggleFold',
      'edamajutsu.help',
      'edamajutsu.closeView'
    ]
  },
  {
    title: 'Changes',
    commands: [
      'edamajutsu.new',
      'edamajutsu.describe',
      'edamajutsu.edit',
      'edamajutsu.abandon',
      'edamajutsu.squash',
      'edamajutsu.absorb',
      'edamajutsu.duplicate',
      'edamajutsu.rebase',
      'edamajutsu.revert',
      'edamajutsu.undo',
      'edamajutsu.redo'
    ]
  },
  {
    title: 'Menus',
    commands: ['edamajutsu.bookmark.menu', 'edamajutsu.git.menu']
  }
];

type Rendered = {
  readonly text: string;
  readonly decorations: DecorationRanges;
};

// Static read-only help buffer. Content is computed once at construction from
// the extension's own package.json, so adding a keybinding or command there
// reflects on next extension load without any code change here.
export class HelpView implements vscode.TextDocumentContentProvider {
  private readonly rendered: Rendered;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.onDidChangeEmitter.event;
  readonly uri = HELP_URI;

  constructor(packageJson: PackageManifest) {
    this.rendered = renderHelp(packageJson);
  }

  provideTextDocumentContent(_uri: vscode.Uri): string {
    return this.rendered.text;
  }

  getDecorations(): DecorationRanges {
    return this.rendered.decorations;
  }
}

export async function openHelp(view: HelpView): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(view.uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

function renderHelp(pkg: PackageManifest): Rendered {
  const bindingsByCommand = new Map<string, string>();
  for (const kb of pkg.contributes?.keybindings ?? []) {
    bindingsByCommand.set(kb.command, kb.key);
  }
  const titleByCommand = new Map<string, string>();
  for (const cmd of pkg.contributes?.commands ?? []) {
    titleByCommand.set(cmd.command, cmd.title);
  }

  const doc = new DecoratedDocBuilder();
  doc.pushPlain('edamajutsu: help');
  doc.pushPlain('');
  doc.pushPlain('Press q to close this view.');
  doc.pushPlain('');

  const seen = new Set<string>();
  for (const cat of CATEGORIES) {
    const rows = cat.commands
      .filter((cmd) => bindingsByCommand.has(cmd))
      .map((cmd) => ({
        key: displayKey(bindingsByCommand.get(cmd)!),
        command: cmd,
        title: prettyTitle(titleByCommand.get(cmd), cmd)
      }));
    if (rows.length === 0) {
      continue;
    }
    doc.push(new LineBuilder().dec('sectionHeader', cat.title).build());
    for (const row of rows) {
      seen.add(row.command);
      doc.push(new LineBuilder().plain(`  ${row.key.padEnd(5)} ${row.title}`).build());
      const sub = SUBMENUS.get(row.command);
      if (sub) {
        pushSubmenu(doc, sub);
      }
    }
    doc.pushPlain('');
  }

  // Catch-all so a newly-added keybinding still shows up even before someone
  // sorts it into a category above.
  const orphans = (pkg.contributes?.keybindings ?? []).filter((kb) => !seen.has(kb.command));
  if (orphans.length > 0) {
    doc.push(new LineBuilder().dec('sectionHeader', 'Other').build());
    for (const kb of orphans) {
      const title = prettyTitle(titleByCommand.get(kb.command), kb.command);
      doc.push(new LineBuilder().plain(`  ${displayKey(kb.key).padEnd(5)} ${title}`).build());
    }
    doc.pushPlain('');
  }

  return { text: doc.text(), decorations: doc.decorations() };
}

function pushSubmenu(doc: DecoratedDocBuilder, menu: Menu): void {
  for (const item of menu.items) {
    const suffix = item.description ? ` — ${item.description}` : '';
    doc.push(new LineBuilder().plain(`         ${item.key}  ${item.label}${suffix}`).build());
  }
}

// Render a VSCode keybinding string the way the user would press it. Matches
// the conventions in `docs/keybindings/` (RET, ?, capital letter for shift+x).
function displayKey(key: string): string {
  if (key === 'enter') {
    return 'RET';
  }
  if (key === 'tab') {
    return 'TAB';
  }
  if (key === 'shift+/') {
    return '?';
  }
  const shiftLetter = /^shift\+([a-z])$/.exec(key);
  if (shiftLetter) {
    return shiftLetter[1].toUpperCase();
  }
  return key;
}

// Friendly titles for non-edamajutsu commands we bind (built-in VSCode
// commands like `editor.toggleFold` don't appear in our `contributes.commands`
// list, so the help buffer needs an explicit label for them).
const BUILTIN_TITLES = new Map<string, string>([['editor.toggleFold', 'Toggle Fold at Cursor']]);

// Command titles in package.json are namespaced ("Edamajutsu: Refresh") for
// the command palette; that prefix is redundant inside the help buffer.
function prettyTitle(title: string | undefined, command: string): string {
  if (!title) {
    return BUILTIN_TITLES.get(command) ?? command.replace(/^edamajutsu\./, '');
  }
  return title.replace(/^Edamajutsu:\s*/, '');
}
