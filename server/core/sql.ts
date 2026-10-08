/** `LIKE ? ESCAPE '\'` parameter for a literal substring match (`%`, `_`, `\` are not wildcards). */
export function likeContains(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
