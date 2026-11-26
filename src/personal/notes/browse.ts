import type { Note } from "./model"

export function filterNotes(notes: Note[], query: string, oldest: boolean) {
  const term = query.trim().toLocaleLowerCase()
  const matches = term
    ? notes.filter((n) =>
        [
          n.selection,
          n.actionName,
          n.pageTitle,
          ...Object.values(n.cells),
          ...n.output.map((f) => f.value),
          ...(n.origin ? Object.values(n.origin) : []),
        ].some((v) =>
          String(v ?? "")
            .toLocaleLowerCase()
            .includes(term),
        ),
      )
    : [...notes]
  return matches.sort(
    (a, b) => (oldest ? 1 : -1) * (a.createdAt - b.createdAt || a.id.localeCompare(b.id)),
  )
}
