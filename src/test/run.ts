import { runRepoTests } from './repo.test';

const suites: Array<{ name: string; run: () => void }> = [
  { name: 'repo', run: runRepoTests }
];

let failed = 0;
for (const suite of suites) {
  try {
    suite.run();
    console.log(`ok   ${suite.name}`);
  } catch (err) {
    failed += 1;
    console.error(`fail ${suite.name}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  }
}

if (failed > 0) {
  process.exit(1);
}
