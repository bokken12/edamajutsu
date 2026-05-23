import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { beforeEach, expect, test } from 'vitest';

import { JjDriver } from '../jj/driver';

// Pin jj's author identity, the working-copy + operation timestamps, and the
// op-log username/hostname so change_id / commit_id / op_id / op.user are
// byte-identical across machines and CI runs. process.env is inherited by
// every jj process we spawn (both the in-test execFileSync helpers and the
// JjDriver subprocess).
//
// JJ_RANDOMNESS_SEED is set *per jj invocation* below — see `nextSeed`. The
// seed re-seeds jj's RNG on every process start, so if two invocations share
// a seed they both allocate the *same* "first" change_id, producing
// divergent change_ids. Bumping a counter per spawn keeps reproducibility
// (the counter sequence is deterministic) AND uniqueness.
//
// operation.username/hostname have to come from a config file rather than
// env vars; we drop one in a tmp location and point JJ_CONFIG at it.
const TEST_JJ_CONFIG = path.join(os.tmpdir(), `eda-test-jj-${process.pid}.toml`);
fs.writeFileSync(
  TEST_JJ_CONFIG,
  ['[operation]', 'username = "test-user"', 'hostname = "test-host"'].join('\n')
);
process.env.JJ_USER = 'Test User';
process.env.JJ_EMAIL = 'test@example.com';
process.env.JJ_TIMESTAMP = '2024-01-01T00:00:00+00:00';
process.env.JJ_OP_TIMESTAMP = '2024-01-01T00:00:00+00:00';
process.env.JJ_CONFIG = TEST_JJ_CONFIG;

// Per-invocation seed counter. Reset before each test so identical sequences
// of jj calls in different tests produce the same change_ids.
let seedCounter = 0;
function nextSeed(): void {
  process.env.JJ_RANDOMNESS_SEED = String(++seedCounter);
}

beforeEach(() => {
  seedCounter = 0;
});

function mkTmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function jjSync(cwd: string, args: ReadonlyArray<string>): void {
  nextSeed();
  execFileSync('jj', ['--no-pager', ...args], { cwd, stdio: 'pipe' });
}

// Wraps a JjDriver so every method call bumps the seed before spawning jj.
// Without this, two driver methods (or a driver method after a jjSync) would
// reuse the previous seed and produce the same change_id.
function makeDriver(repoRoot: string): JjDriver {
  const driver = new JjDriver({ repoRoot });
  return new Proxy(driver, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function' && prop !== 'constructor') {
        return (...args: unknown[]) => {
          nextSeed();
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      }
      return value;
    }
  });
}

function buildFixtureRepo(): string {
  const root = mkTmp('eda-driver-');
  jjSync(root, ['git', 'init']);

  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  jjSync(root, ['describe', '-m', 'first change']);

  jjSync(root, ['new', '-m', 'second change\nwith body']);
  fs.writeFileSync(path.join(root, 'b.txt'), 'two\n');

  jjSync(root, ['bookmark', 'create', 'feature', '-r', '@-']);
  return root;
}

test('log returns typed records against a real repo', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  const changes = await driver.log({ revset: 'all()' });

  const byDescription = new Map(changes.map((c) => [c.descriptionFirstLine, c]));
  expect({
    first: byDescription.get('first change'),
    second: byDescription.get('second change')
  }).toMatchInlineSnapshot(`
    {
      "first": {
        "authorEmail": "test@example.com",
        "authorName": "Test User",
        "bookmarks": [
          "feature",
        ],
        "changeId": "qpvuntsmwlqtpsluzzsnyyzlmlwvmlnu",
        "commitId": "9dc885b70303e4c2f7c3ce44183ceaf659c77aca",
        "description": "first change
    ",
        "descriptionFirstLine": "first change",
        "isConflicted": false,
        "isEmpty": false,
        "isWorkingCopy": false,
        "parents": [
          "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
        ],
      },
      "second": {
        "authorEmail": "test@example.com",
        "authorName": "Test User",
        "bookmarks": [],
        "changeId": "kkmpptxzrspxrzommnulwmwkkqwworpl",
        "commitId": "6311fbb1d04e0f14bd03e6e46fa988673c48a3c7",
        "description": "second change
    with body
    ",
        "descriptionFirstLine": "second change",
        "isConflicted": false,
        "isEmpty": false,
        "isWorkingCopy": true,
        "parents": [
          "qpvuntsmwlqtpsluzzsnyyzlmlwvmlnu",
        ],
      },
    }
  `);
});

test('log honours the -n limit', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  const changes = await driver.log({ revset: 'all()', limit: 1 });
  expect(changes).toHaveLength(1);
});

test('log respects an explicit revset', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  const changes = await driver.log({ revset: '@' });
  expect(changes).toHaveLength(1);
  expect(changes[0]!.isWorkingCopy).toBe(true);
});

// Regression: a description containing the control bytes we use as
// separators (RS, FS, US) must round-trip cleanly via escape_json / JSON.
test('log preserves control bytes in description', async () => {
  const root = buildFixtureRepo();
  const dangerous = 'has \x1eRS\x1cFS\x1fUS\nbytes';
  jjSync(root, ['describe', '-m', dangerous]);

  const driver = makeDriver(root);
  const [head] = await driver.log({ revset: '@', limit: 1 });
  expect(head!.description).toBe(`${dangerous}\n`);
});

test('log rejects invalid limit values', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  await expect(() => driver.log({ limit: -1 })).rejects.toThrow(/non-negative integer/);
  await expect(() => driver.log({ limit: 1.5 })).rejects.toThrow(/non-negative integer/);
});

test('logGraph parses graph rows and continuation rows', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  const lines = await driver.logGraph({ revset: 'all()' });

  // Snapshot only the structure (kind + whether prefix exists + descriptions),
  // not the verbatim glyphs or volatile ids.
  const summary = lines.map((line) =>
    line.kind === 'change'
      ? {
          kind: 'change' as const,
          hasGraphPrefix: line.graphPrefix.length > 0,
          description: line.change.descriptionFirstLine
        }
      : { kind: 'graphOnly' as const, isElision: line.text.includes('~') || line.text === '' }
  );
  expect(summary).toMatchInlineSnapshot(`
    [
      {
        "description": "second change",
        "hasGraphPrefix": true,
        "kind": "change",
      },
      {
        "description": "first change",
        "hasGraphPrefix": true,
        "kind": "change",
      },
      {
        "description": "",
        "hasGraphPrefix": true,
        "kind": "change",
      },
    ]
  `);
});

test('diffText returns unified git-format output for a revset', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  // The fixture leaves b.txt added on top of @.
  const diff = await driver.diffText({ revset: '@', snapshot: true });
  expect(diff).toMatch(/^diff --git a\/b\.txt b\/b\.txt$/m);
  expect(diff).toMatch(/\+two$/m);
});

test('diffSummary reports working-copy changes by path', async () => {
  const root = buildFixtureRepo();
  // The fixture leaves b.txt added; modify a.txt for a mix.
  fs.writeFileSync(path.join(root, 'a.txt'), 'one updated\n');

  const driver = makeDriver(root);
  const files = await driver.diffSummary({ snapshot: true });
  // Sort by path so order is stable across fixture runs.
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  expect(sorted).toMatchInlineSnapshot(`
    [
      {
        "kind": "modified",
        "path": "a.txt",
      },
      {
        "kind": "added",
        "path": "b.txt",
      },
    ]
  `);
});

test('opLog returns the meaningful operations from the fixture', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  const ops = await driver.opLog({ limit: 20 });
  // `snapshot working copy` ops are inserted by jj implicitly before most
  // commands; jj has no config knob to disable this (it's load-bearing for
  // the "working copy is a commit" model). Filter them out so the snapshot
  // captures only the operations our fixture explicitly requested.
  const meaningful = ops.filter(
    (op) => !op.descriptionFirstLine.startsWith('snapshot working copy')
  );
  expect(meaningful).toMatchInlineSnapshot(`
    [
      {
        "description": "create bookmark feature pointing to commit 9dc885b70303e4c2f7c3ce44183ceaf659c77aca",
        "descriptionFirstLine": "create bookmark feature pointing to commit 9dc885b70303e4c2f7c3ce44183ceaf659c77aca",
        "id": "ad501e87144cbe5c94fd909c5402c931973cd199da96e4329f47735e1888924512326a8ca395bc419ddd4e85e31ed4caf55f3865f7570fd9811c8ffbbd0f01b4",
        "time": "2024-01-01 00:00:00.000 +00:00",
        "user": "test-user@test-host",
      },
      {
        "description": "new empty commit",
        "descriptionFirstLine": "new empty commit",
        "id": "bb46886f1e13ab7f6cbadece9e9fe1e332a52f6f385688cbd26d9fa9fb7aa45edb9804244e8e1e45ed415fdffdf5bfaaa87b90c01afd73eba68ad5314669a5d5",
        "time": "2024-01-01 00:00:00.000 +00:00",
        "user": "test-user@test-host",
      },
      {
        "description": "describe commit bfc2b162e4227c9ab3d4e2c70b62d74cfed64b15",
        "descriptionFirstLine": "describe commit bfc2b162e4227c9ab3d4e2c70b62d74cfed64b15",
        "id": "8e0e900db74d29d663323f7fb6488d7a9d478b498e6cdd43da731541b0201913aa2f927ff602f5befda7479c5edbb600be537a3f087630faa7694664d5a821ed",
        "time": "2024-01-01 00:00:00.000 +00:00",
        "user": "test-user@test-host",
      },
      {
        "description": "add workspace 'default'",
        "descriptionFirstLine": "add workspace 'default'",
        "id": "c86dd28a23635d93c290fd3f02344a3606fbe705e19b5b3bd55235672f3c5af718a363ff9006dd9ab1b7c3d5c3c21bbc45b2aec6ede0fbfdece7607424afd3c9",
        "time": "2024-01-01 00:00:00.000 +00:00",
        "user": "test-user@test-host",
      },
      {
        "description": "",
        "descriptionFirstLine": "",
        "id": "00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "time": "1970-01-01 00:00:00.000 +00:00",
        "user": "@",
      },
    ]
  `);
});

test('undo rolls back the most recent operation', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);

  // Make the rollback visible: rename the working copy's description.
  jjSync(root, ['describe', '-m', 'about to be undone']);
  const beforeUndo = (await driver.log({ revset: '@', limit: 1 }))[0]!;
  expect(beforeUndo.descriptionFirstLine).toBe('about to be undone');

  await driver.undo();

  const afterUndo = (await driver.log({ revset: '@', limit: 1 }))[0]!;
  // The most recent describe is gone; @ should be back to the fixture's
  // "second change" description.
  expect(afterUndo.descriptionFirstLine).toBe('second change');
});

test('newChange creates a child of @ and switches to it', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);

  const [oldHead] = await driver.log({ revset: '@', limit: 1 });
  expect(oldHead!.descriptionFirstLine).toBe('second change');

  await driver.newChange('a brand new change');

  const [newHead] = await driver.log({ revset: '@', limit: 1 });
  expect(newHead!.descriptionFirstLine).toBe('a brand new change');
  // The previous @ should now be the parent.
  expect([...newHead!.parents]).toEqual([oldHead!.changeId]);
});

test('newChange with no message creates an empty undescribed change', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  await driver.newChange();
  const [head] = await driver.log({ revset: '@', limit: 1 });
  expect(head!.descriptionFirstLine).toBe('');
});

test('describe overwrites the description of @', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);
  await driver.describe('rewritten description');
  const [head] = await driver.log({ revset: '@', limit: 1 });
  expect(head!.descriptionFirstLine).toBe('rewritten description');
});

test('abandon drops the specified change', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);

  // Abandon the parent of @ by its change_id (the production path — RET on
  // a row in the log view gives us the Change record's change_id).
  const [parent] = await driver.log({ revset: '@-', limit: 1 });
  expect(parent!.descriptionFirstLine).toBe('first change');

  await driver.abandon(parent!.changeId);

  const summaries = (await driver.log({ revset: 'all()' })).map(
    (c) => c.descriptionFirstLine
  );
  expect(summaries).not.toContain('first change');
});

test('edit switches @ to the specified change', async () => {
  const root = buildFixtureRepo();
  const driver = makeDriver(root);

  // Fixture leaves @ at "second change"; switch back to "first change".
  const [parent] = await driver.log({ revset: '@-', limit: 1 });
  expect(parent!.descriptionFirstLine).toBe('first change');

  await driver.edit(parent!.changeId);

  const [head] = await driver.log({ revset: '@', limit: 1 });
  expect(head!.descriptionFirstLine).toBe('first change');
  expect(head!.changeId).toBe(parent!.changeId);
});
