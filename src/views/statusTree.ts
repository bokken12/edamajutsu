import { Change } from '../model/change';
import { FileDiff } from '../jj/parse';
import { FileChangeKind } from '../model/fileChange';
import { DecoratedLine, LineBuilder } from '../render/decoratedText';
import { DecorationKey } from '../render/decorations';
import { fileKindGlyph } from '../render/fileKind';
import { JjRepo } from '../jj/repo';
import { Node } from './viewTree';

// Tree construction from a status snapshot.

export type StatusData = {
  readonly workingCopy: Change;
  readonly parent: Change | undefined;
  readonly files: ReadonlyArray<FileDiff>;
};

// Top-level helper: builds the full status tree (header + change sections +
// files section). Fold ids are stable strings so user overrides survive a
// refresh. File folds key on path; the working-copy-changes section uses a
// fixed id.
export function buildTree(repo: JjRepo, data: StatusData): ReadonlyArray<Node> {
  const out: Node[] = [];
  const plain = (text: string): Node => ({
    kind: 'line',
    line: new LineBuilder().plain(text).build()
  });

  out.push(plain('edamajutsu: status'));
  out.push(plain(''));
  out.push(plain(`Repository: ${repo.root}`));
  out.push(plain(''));

  for (const line of renderChangeSection('Working copy:', data.workingCopy)) {
    out.push({ kind: 'line', line, change: data.workingCopy });
  }
  out.push(plain(''));

  if (data.parent && !isRootChange(data.parent)) {
    for (const line of renderChangeSection('Parent commit:', data.parent)) {
      out.push({ kind: 'line', line, change: data.parent });
    }
    out.push(plain(''));
  }

  if (data.files.length > 0) {
    out.push(buildFilesSection(data.workingCopy, data.files));
    out.push(plain(''));
  }

  return out;
}

const FILES_SECTION_ID = 'files';

function buildFilesSection(workingCopy: Change, files: ReadonlyArray<FileDiff>): Node {
  const body: Node[] = files.map((file) => buildFileNode(workingCopy, file));
  const header = new LineBuilder()
    .dec('sectionHeader', `Working copy changes (${files.length}):`)
    .build();
  return {
    kind: 'fold',
    id: FILES_SECTION_ID,
    foldedByDefault: false,
    header,
    body,
    change: workingCopy
  };
}

function buildFileNode(workingCopy: Change, file: FileDiff): Node {
  const header = new LineBuilder()
    .plain('  ')
    .dec(fileKindDecoration(file.kind), fileKindGlyph(file.kind))
    .plain(` ${file.path}`)
    .build();
  const body: Node[] = file.body.map((text) => ({
    kind: 'line',
    line: new LineBuilder().plain(text).build(),
    change: workingCopy
  }));
  return {
    kind: 'fold',
    id: `file:${file.path}`,
    foldedByDefault: true,
    header,
    body,
    change: workingCopy
  };
}

function renderChangeSection(header: string, change: Change): DecoratedLine[] {
  const headerLine = new LineBuilder()
    .dec('sectionHeader', header)
    .plain(' ')
    .dec('changeId', change.changeId.slice(0, 8))
    .plain(' ')
    .dec('commitId', change.commitId.slice(0, 8));

  if (change.bookmarks.length > 0) {
    headerLine.plain(' ').dec('bookmark', `[${change.bookmarks.join(', ')}]`);
  }
  if (change.isConflicted) {
    headerLine.dec('conflict', ' (conflict)');
  }
  if (change.isEmpty) {
    headerLine.dec('empty', ' (empty)');
  }

  return [
    headerLine.build(),
    new LineBuilder()
      .plain('  ')
      .plain(change.descriptionFirstLine || '(no description set)')
      .build(),
    new LineBuilder().plain(`  ${change.authorName} <${change.authorEmail}>`).build()
  ];
}

function fileKindDecoration(kind: FileChangeKind): DecorationKey {
  switch (kind) {
    case 'added':
      return 'fileAdded';
    case 'modified':
      return 'fileModified';
    case 'deleted':
      return 'fileDeleted';
    case 'renamed':
      return 'fileRenamed';
    case 'copied':
      return 'fileCopied';
  }
}

function isRootChange(change: Change): boolean {
  return /^z+$/.test(change.changeId);
}
