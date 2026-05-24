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

// Resolves the directory that backs jj's repo store (the one containing
// `op_heads/`, `store/`, etc.). For a primary repo this is `<root>/.jj/repo`;
// for an added workspace, `<root>/.jj/repo` is a text file holding a relative
// path to the primary's store. We follow that pointer so a single watcher
// rooted at the shared store fires for operations in *any* workspace.
export function resolveJjRepoStore(repoRoot: string): string {
  const repoPath = path.join(repoRoot, '.jj', 'repo');
  const stat = fs.statSync(repoPath);
  if (stat.isDirectory()) {
    return repoPath;
  }
  if (stat.isFile()) {
    const pointer = fs.readFileSync(repoPath, 'utf8').trim();
    return path.resolve(path.dirname(repoPath), pointer);
  }
  throw new Error(`.jj/repo at ${repoPath} is neither a directory nor a file`);
}
