import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as assert from 'assert';

import { findJjRepo } from '../jj/repo';

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function runRepoTests(): void {
  testFindsRepoAtRoot();
  testFindsRepoFromSubdirectory();
  testReturnsUndefinedWhenNoRepo();
  testIgnoresJjFile();
}

function testFindsRepoAtRoot(): void {
  const root = mkTmp('eda-repo-root-');
  fs.mkdirSync(path.join(root, '.jj'));

  const found = findJjRepo(root);
  assert.ok(found, 'expected to find a repo');
  assert.strictEqual(fs.realpathSync(found.root), fs.realpathSync(root));
}

function testFindsRepoFromSubdirectory(): void {
  const root = mkTmp('eda-repo-sub-');
  fs.mkdirSync(path.join(root, '.jj'));
  const sub = path.join(root, 'a', 'b', 'c');
  fs.mkdirSync(sub, { recursive: true });

  const found = findJjRepo(sub);
  assert.ok(found, 'expected to find a repo from a subdirectory');
  assert.strictEqual(fs.realpathSync(found.root), fs.realpathSync(root));
}

function testReturnsUndefinedWhenNoRepo(): void {
  const root = mkTmp('eda-repo-none-');
  const found = findJjRepo(root);
  assert.strictEqual(found, undefined);
}

function testIgnoresJjFile(): void {
  const root = mkTmp('eda-repo-file-');
  fs.writeFileSync(path.join(root, '.jj'), 'this is a file, not a dir');

  const found = findJjRepo(root);
  assert.strictEqual(found, undefined);
}
