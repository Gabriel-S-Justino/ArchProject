/** A string as a valid, readable id fragment: "Launch vehicles & LSP" → "launch-vehicles-lsp". */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
