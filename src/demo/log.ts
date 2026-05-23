// Prints the parsed log records for the current working directory's jj repo.
// Usage (after `npm run compile`): node out/demo/log.js [limit]

import { JjDriver } from '../jj/driver';
import { findJjRepo } from '../jj/repo';

async function main(): Promise<void> {
  const repo = findJjRepo(process.cwd());
  if (!repo) {
    console.error('no jj repository found from', process.cwd());
    process.exit(1);
  }

  const limitArg = process.argv[2];
  const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;

  const driver = new JjDriver({ repoRoot: repo.root });
  const opts: { limit?: number } = {};
  if (limit !== undefined) {
    opts.limit = limit;
  }
  const changes = await driver.log(opts);

  for (const change of changes) {
    const flags = [
      change.isWorkingCopy ? '@' : '.',
      change.isEmpty ? 'e' : '-',
      change.isConflicted ? 'c' : '-'
    ].join('');
    const bookmarks = change.bookmarks.length > 0 ? ` [${change.bookmarks.join(', ')}]` : '';
    console.log(
      `${flags} ${change.changeId.slice(0, 8)} ${change.commitId.slice(0, 8)} ` +
        `${change.authorName} <${change.authorEmail}>${bookmarks}`
    );
    console.log(`        ${change.descriptionFirstLine || '(no description)'}`);
  }
}

void main();
