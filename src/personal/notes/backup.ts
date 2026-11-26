import type { Library, Note } from "./model"
import {
  accepts,
  backupSchema,
  cleanOrigin,
  fail,
  unique,
  validateCells,
  validFields,
} from "./model"

export function parseBackup(raw: unknown) {
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) fail("invalidBackup")
  const data = parsed.data
  if (
    !unique(data.libraries.map((l) => l.id)) ||
    !unique(data.notes.map((n) => n.id)) ||
    !unique(data.bindings.map((b) => b.actionId))
  )
    fail("invalidBackup")
  const libraries = new Map(data.libraries.map((l) => [l.id, l]))
  for (const l of data.libraries) {
    if (!validFields(l.fields) || l.updatedAt < l.createdAt) fail("invalidBackup")
  }
  for (const b of data.bindings) {
    const library = libraries.get(b.libraryId)
    const targetIds = b.mappings.map((m) => m.columnId)
    if (
      !library ||
      !targetIds.length ||
      !unique(targetIds) ||
      !unique(b.mappings.map((m) => m.fieldId)) ||
      targetIds.some((id) => !library.fields.some((f) => f.id === id))
    )
      fail("invalidBackup")
  }
  for (const n of data.notes) {
    const library = libraries.get(n.libraryId)
    if (
      !library ||
      n.updatedAt < n.createdAt ||
      !unique(n.output.map((f) => f.id)) ||
      n.output.some((f) => !accepts(f, f.value))
    )
      fail("invalidBackup")
    validateCells(n.cells, library)
    if (n.origin && n.origin.kind !== "ebook" && cleanOrigin(n.origin)?.kind !== n.origin.kind)
      fail("invalidBackup")
    n.origin = cleanOrigin(n.origin)
  }
  return data
}

export function csvCell(value: string | number | null | undefined) {
  let s = String(value ?? "")
  if (typeof value === "string" && /^(?:\s*[=+@-]|[\t\r\n])/.test(s)) s = "'" + s
  return '"' + s.replaceAll('"', '""') + '"'
}

export function notesCsv(library: Library, notes: Note[]) {
  const headers = [
    ...library.fields.map((f) => f.name),
    "selection",
    "action",
    "source_url",
    "page_title",
    "origin",
    "created_at",
    "updated_at",
  ]
  const rows = notes
    .filter((n) => n.libraryId === library.id)
    .map((n) => [
      ...library.fields.map((f) => n.cells[f.id]),
      n.selection,
      n.actionName,
      n.origin && "url" in n.origin ? n.origin.url : "",
      n.pageTitle,
      n.origin ? JSON.stringify(n.origin) : "",
      new Date(n.createdAt).toISOString(),
      new Date(n.updatedAt).toISOString(),
    ])
  return "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
}
