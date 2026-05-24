import * as vscode from 'vscode';

import { AppContext } from './commands/appContext';
import { DecorationManager } from './render/decorationManager';
import { createDecorationTypes } from './render/decorations';
import { showMenu } from './ui/menu';
import { bookmarkMenu, gitMenu } from './ui/menus';
import { COMMIT_DETAIL_URI, CommitDetailView } from './views/commitDetail';
import { EdamajutsuContentProvider } from './views/contentProvider';
import { EdamajutsuFoldingProvider } from './views/folding';
import { HelpView } from './views/help';
import { LogView } from './views/log';
import { OpLogView } from './views/opLog';
import { STATUS_URI, StatusView } from './views/status';

export const EDAMAJUTSU_LANGUAGE = 'edamajutsu';
export const EDAMAJUTSU_SCHEME = 'edamajutsu';

export function activate(context: vscode.ExtensionContext): void {
  const statusView = new StatusView();
  const logView = new LogView();
  const commitView = new CommitDetailView();
  const opLogView = new OpLogView();
  const helpView = new HelpView(context.extension.packageJSON);
  const ctx = new AppContext(statusView, logView, commitView, opLogView, helpView);

  const contentProvider = new EdamajutsuContentProvider(
    statusView,
    logView,
    commitView,
    opLogView,
    helpView
  );
  const foldingSelector: vscode.DocumentSelector = [
    { scheme: EDAMAJUTSU_SCHEME, language: EDAMAJUTSU_LANGUAGE, pattern: STATUS_URI.path },
    { scheme: EDAMAJUTSU_SCHEME, language: EDAMAJUTSU_LANGUAGE, pattern: COMMIT_DETAIL_URI.path }
  ];

  const decorationTypes = createDecorationTypes();
  context.subscriptions.push(...Object.values(decorationTypes));
  new DecorationManager(decorationTypes, [
    statusView,
    logView,
    commitView,
    opLogView,
    helpView
  ]).register(context);

  const register = (id: string, handler: () => Promise<void> | void): vscode.Disposable =>
    vscode.commands.registerCommand(id, handler);

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(EDAMAJUTSU_SCHEME, contentProvider),
    vscode.languages.registerFoldingRangeProvider(
      foldingSelector,
      new EdamajutsuFoldingProvider(statusView, commitView)
    ),
    register('edamajutsu.openStatus', () => ctx.openStatus()),
    register('edamajutsu.openLog', () => ctx.openLog()),
    register('edamajutsu.openOpLog', () => ctx.openOpLog()),
    register('edamajutsu.closeView', () => ctx.closeView()),
    register('edamajutsu.help', () => ctx.help()),
    register('edamajutsu.refresh', () => ctx.refreshActive()),
    register('edamajutsu.visitAtPoint', () => ctx.visitAtPoint()),
    register('edamajutsu.undo', () => ctx.undo()),
    register('edamajutsu.redo', () => ctx.redo()),
    register('edamajutsu.new', () => ctx.newChange()),
    register('edamajutsu.describe', () => ctx.describe()),
    register('edamajutsu.abandon', () => ctx.abandon()),
    register('edamajutsu.edit', () => ctx.edit()),
    register('edamajutsu.duplicate', () => ctx.duplicate()),
    register('edamajutsu.revert', () => ctx.revert()),
    register('edamajutsu.squash', () => ctx.squash()),
    register('edamajutsu.rebase', () => ctx.rebase()),
    register('edamajutsu.absorb', () => ctx.absorb()),
    register('edamajutsu.bookmark.create', () => ctx.bookmarkCreate()),
    register('edamajutsu.bookmark.set', () => ctx.bookmarkSet()),
    register('edamajutsu.bookmark.delete', () => ctx.bookmarkDelete()),
    register('edamajutsu.bookmark.rename', () => ctx.bookmarkRename()),
    register('edamajutsu.bookmark.forget', () => ctx.bookmarkForget()),
    register('edamajutsu.git.push', () => ctx.gitPush()),
    register('edamajutsu.git.fetch', () => ctx.gitFetch()),
    register('edamajutsu.bookmark.menu', () => showMenu(bookmarkMenu)),
    register('edamajutsu.git.menu', () => showMenu(gitMenu))
  );
}

export function deactivate(): void {
  // nothing to clean up
}
