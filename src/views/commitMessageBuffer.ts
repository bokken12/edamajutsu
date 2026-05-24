// Pure helpers for the multi-line describe editor. Kept in their own
// module so unit tests can exercise them without importing vscode (which
// only resolves inside the extension host).

const COMMENT_HEADER = [
  '# Enter the new description for @. Lines starting with # will be ignored.',
  '# Save (Ctrl+S / Cmd+S) to submit, or close without saving to cancel.'
].join('\n');

// Magit convention: lines beginning with `#` are stripped. We trim the
// resulting text (trailing newlines from the editor are noise) but preserve
// internal blank lines — describe(`a\n\nb`) is a valid two-paragraph commit.
export function stripCommentsFromMessage(text: string): string {
  const kept = text
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n');
  return kept.trim();
}

// Build the initial buffer: current description (so this is an edit, not a
// rewrite), a blank separator, then the comment header.
export function buildInitialBuffer(currentDescription: string): string {
  return `${currentDescription}\n\n${COMMENT_HEADER}\n`;
}
