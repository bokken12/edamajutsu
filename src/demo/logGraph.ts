// Prints what the LogView would render for the current repo. Useful for
// eyeballing the graph + record output without opening VSCode.
// Usage: npm run demo:log:graph -- [limit]

import { JjDriver } from '../jj/driver';
import { findJjRepo } from '../jj/repo';
import { formatChangeOneLine } from '../render/formatChange';

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
  const lines = await driver.logGraph(opts);

  for (const line of lines) {
    if (line.kind === 'change') {
      console.log(line.graphPrefix + formatChangeOneLine(line.change));
    } else {
      console.log(line.text);
    }
  }
}

void main();
