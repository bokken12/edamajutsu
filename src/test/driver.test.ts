import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';

import { JjDriver } from '../jj/driver';

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function jjSync(cwd: string, args: ReadonlyArray<string>): void {
  execFileSync('jj', ['--no-pager', ...args], { cwd, stdio: 'pipe' });
}

function buildFixtureRepo(): string {
  const root = mkTmp('eda-driver-');
  jjSync(root, ['git', 'init']);
  jjSync(root, ['config', 'set', '--repo', 'user.name', 'Test User']);
  jjSync(root, ['config', 'set', '--repo', 'user.email', 'test@example.com']);

  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  jjSync(root, ['describe', '-m', 'first change']);

  jjSync(root, ['new', '-m', 'second change\nwith body']);
  fs.writeFileSync(path.join(root, 'b.txt'), 'two\n');

  jjSync(root, ['bookmark', 'create', 'feature', '-r', '@-']);
  return root;
}

export async function runDriverTests(): Promise<void> {
  await testLogReturnsTypedRecordsAgainstRealRepo();
  await testLogLimitFlag();
  await testLogRespectsRevset();
  await testLogSurvivesControlBytesInDescription();
  await testLogRejectsInvalidLimit();
  await testDiffSummaryReportsWorkingCopyChanges();
  await testLogGraphParsesGraphAndContinuationLines();
  await testDiffTextReturnsGitFormat();
  await testOpLogReturnsRecentOperations();
}

async function testLogReturnsTypedRecordsAgainstRealRepo(): Promise<void> {
  const root = buildFixtureRepo();
  const driver = new JjDriver({ repoRoot: root });
  const changes = await driver.log({ revset: 'all()' });

  // Expected: root (empty), first change, second change.
  assert.ok(changes.length >= 3, `expected >=3 changes, got ${changes.length}`);

  const byDescription = new Map(changes.map((c) => [c.descriptionFirstLine, c]));
  const first = byDescription.get('first change');
  const second = byDescription.get('second change');
  assert.ok(first, 'expected the "first change" record');
  assert.ok(second, 'expected the "second change" record');

  // jj normalises every description to end with a trailing newline.
  assert.strictEqual(second.description, 'second change\nwith body\n');
  assert.strictEqual(second.descriptionFirstLine, 'second change');
  assert.strictEqual(second.authorName, 'Test User');
  assert.strictEqual(second.authorEmail, 'test@example.com');
  assert.ok(second.isWorkingCopy, 'second change should be @');
  assert.ok(!first.isWorkingCopy, 'first change should not be @');
  assert.deepStrictEqual([...first.bookmarks], ['feature']);
  assert.deepStrictEqual([...second.parents], [first.changeId]);
}

async function testLogLimitFlag(): Promise<void> {
  const root = buildFixtureRepo();
  const driver = new JjDriver({ repoRoot: root });
  const changes = await driver.log({ revset: 'all()', limit: 1 });
  assert.strictEqual(changes.length, 1);
}

async function testLogRespectsRevset(): Promise<void> {
  const root = buildFixtureRepo();
  const driver = new JjDriver({ repoRoot: root });
  const changes = await driver.log({ revset: '@' });
  assert.strictEqual(changes.length, 1);
  assert.ok(changes[0]!.isWorkingCopy);
}

// Regression: a description's first line containing the same control bytes we
// use as separators (RS, FS) must round-trip cleanly through escape_json /
// JSON.
async function testLogSurvivesControlBytesInDescription(): Promise<void> {
  const root = buildFixtureRepo();
  const dangerous = 'has \x1eRS\x1cFS\x1fUS\nbytes';
  jjSync(root, ['describe', '-m', dangerous]);

  const driver = new JjDriver({ repoRoot: root });
  const [head] = await driver.log({ revset: '@', limit: 1 });
  assert.ok(head);
  assert.strictEqual(head.description, `${dangerous}\n`);
}

async function testDiffTextReturnsGitFormat(): Promise<void> {
  const root = buildFixtureRepo();
  const driver = new JjDriver({ repoRoot: root });
  // The fixture leaves b.txt added on top of @ (second change).
  const diff = await driver.diffText({ revset: '@', snapshot: true });
  assert.match(diff, /^diff --git a\/b\.txt b\/b\.txt$/m);
  assert.match(diff, /\+two$/m);
}

async function testLogRejectsInvalidLimit(): Promise<void> {
  const root = buildFixtureRepo();
  const driver = new JjDriver({ repoRoot: root });
  await assert.rejects(() => driver.log({ limit: -1 }), /non-negative integer/);
  await assert.rejects(() => driver.log({ limit: 1.5 }), /non-negative integer/);
}

async function testLogGraphParsesGraphAndContinuationLines(): Promise<void> {
  const root = buildFixtureRepo();
  const driver = new JjDriver({ repoRoot: root });
  const lines = await driver.logGraph({ revset: 'all()' });

  const changes = lines.flatMap((l) => (l.kind === 'change' ? [l.change] : []));
  assert.ok(changes.length >= 3, `expected >=3 changes, got ${changes.length}`);

  const summaries = changes.map((c) => c.descriptionFirstLine);
  assert.ok(summaries.includes('first change'));
  assert.ok(summaries.includes('second change'));

  // Every data row should have a non-empty graph prefix (the leading glyph)
  // — even at the root, jj draws something.
  for (const line of lines) {
    if (line.kind === 'change') {
      assert.ok(line.graphPrefix.length > 0, `expected non-empty graph prefix on ${line.change.changeId}`);
    }
  }
}

async function testDiffSummaryReportsWorkingCopyChanges(): Promise<void> {
  const root = buildFixtureRepo();
  // The fixture leaves b.txt added on top of @ (second change). Modify a.txt
  // as well so we have both kinds in the same diff.
  fs.writeFileSync(path.join(root, 'a.txt'), 'one updated\n');

  const driver = new JjDriver({ repoRoot: root });
  const files = await driver.diffSummary({ snapshot: true });
  const byPath = new Map(files.map((f) => [f.path, f]));
  assert.strictEqual(byPath.get('b.txt')?.kind, 'added');
  assert.strictEqual(byPath.get('a.txt')?.kind, 'modified');
}

async function testOpLogReturnsRecentOperations(): Promise<void> {
  const root = buildFixtureRepo();
  const driver = new JjDriver({ repoRoot: root });
  const ops = await driver.opLog({ limit: 10 });

  // Building the fixture runs several jj commands, so we should see ops here.
  assert.ok(ops.length > 0, `expected ops, got ${ops.length}`);
  // Most recent ops should include the bookmark creation we performed last.
  const descriptions = ops.map((o) => o.descriptionFirstLine);
  assert.ok(
    descriptions.some((d) => /create bookmark feature/.test(d)),
    `expected a "create bookmark feature" op; got ${descriptions.join(' | ')}`
  );
  // Sanity: every op has an id and a non-empty time string.
  for (const op of ops) {
    assert.ok(op.id.length > 0);
    assert.ok(op.time.length > 0);
  }
}
