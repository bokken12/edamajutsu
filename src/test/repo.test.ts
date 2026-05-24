import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect, test } from 'vitest';

import { findJjRepo, resolveJjRepoStore } from '../jj/repo';

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('finds repo at root', () => {
  const root = mkTmp('eda-repo-root-');
  fs.mkdirSync(path.join(root, '.jj'));

  const found = findJjRepo(root);
  expect(found).toBeDefined();
  expect(fs.realpathSync(found!.root)).toBe(fs.realpathSync(root));
});

test('finds repo from a nested subdirectory', () => {
  const root = mkTmp('eda-repo-sub-');
  fs.mkdirSync(path.join(root, '.jj'));
  const sub = path.join(root, 'a', 'b', 'c');
  fs.mkdirSync(sub, { recursive: true });

  const found = findJjRepo(sub);
  expect(found).toBeDefined();
  expect(fs.realpathSync(found!.root)).toBe(fs.realpathSync(root));
});

test('returns undefined when no .jj exists upwards', () => {
  const root = mkTmp('eda-repo-none-');
  expect(findJjRepo(root)).toBeUndefined();
});

test('ignores a `.jj` that is a file, not a directory', () => {
  const root = mkTmp('eda-repo-file-');
  fs.writeFileSync(path.join(root, '.jj'), 'this is a file, not a dir');
  expect(findJjRepo(root)).toBeUndefined();
});

test('resolveJjRepoStore returns .jj/repo when it is a directory', () => {
  const root = mkTmp('eda-store-dir-');
  const repoDir = path.join(root, '.jj', 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  expect(fs.realpathSync(resolveJjRepoStore(root))).toBe(fs.realpathSync(repoDir));
});

test('resolveJjRepoStore follows a workspace pointer file', () => {
  const root = mkTmp('eda-store-ptr-');
  // Primary repo at <root>/primary/.jj/repo, workspace at <root>/ws/.jj/repo
  // whose content is the relative path back to primary's repo store.
  const primaryStore = path.join(root, 'primary', '.jj', 'repo');
  fs.mkdirSync(primaryStore, { recursive: true });
  const wsJj = path.join(root, 'ws', '.jj');
  fs.mkdirSync(wsJj, { recursive: true });
  fs.writeFileSync(path.join(wsJj, 'repo'), '../../primary/.jj/repo');
  expect(fs.realpathSync(resolveJjRepoStore(path.join(root, 'ws')))).toBe(
    fs.realpathSync(primaryStore)
  );
});
