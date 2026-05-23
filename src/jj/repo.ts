import * as fs from 'fs';
import * as path from 'path';

export type JjRepo = {
  readonly root: string;
};

export function findJjRepo(startDir: string): JjRepo | undefined {
  let current = path.resolve(startDir);

  while (true) {
    if (isJjRoot(current)) {
      return { root: current };
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function isJjRoot(dir: string): boolean {
  try {
    const stat = fs.statSync(path.join(dir, '.jj'));
    return stat.isDirectory();
  } catch {
    return false;
  }
}
