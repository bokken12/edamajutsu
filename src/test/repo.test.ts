import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { expect, test } from 'vitest';

import { findJjRepo } from '../jj/repo';

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
