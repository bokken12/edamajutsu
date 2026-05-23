import { runDriverTests } from './driver.test';
import { runParseTests } from './parse.test';
import { runRepoTests } from './repo.test';

type Suite = { name: string; run: () => void | Promise<void> };

const suites: ReadonlyArray<Suite> = [
  { name: 'repo', run: runRepoTests },
  { name: 'parse', run: runParseTests },
  { name: 'driver', run: runDriverTests }
];

async function main(): Promise<void> {
  let failed = 0;
  for (const suite of suites) {
    try {
      await suite.run();
      console.log(`ok   ${suite.name}`);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.stack ?? err.message : String(err);
      console.error(`fail ${suite.name}: ${msg}`);
    }
  }
  if (failed > 0) {
    process.exit(1);
  }
}

void main();
