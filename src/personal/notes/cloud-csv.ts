import type { Note } from "./model"
import type { PersonalNotesDB } from "./store"
import { parse } from "csv-parse/browser/esm/sync"
import { fail, validFields } from "./model"

// A public CSV has column labels and displayed values, no stable upstream IDs.
// Identify an entire imported table by its logical rows, independent of filename,
// quoting, BOM or the platform's record delimiter.
export async function readCloudCsv(text: string) {
  let records: string[][]
  try {
    records = parse(text, { bom: true, skip_empty_lines: true })
  } catch {
    fail("invalidCsv")
  }
  const [header, ...rows] = records
  if (!header?.length) fail("invalidCsv")
  const fields = header.map((name, i) => ({
    id: `csv-${i + 1}`,
    name: name.trim(),
    type: "string" as const,
  }))
  if (fields.some((f) => !f.name) || !validFields(fields)) fail("invalidCsv")
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(records))),
  )
  bytes[6] = (bytes[6]! & 15) | 128 // UUIDv8, content-derived
  bytes[8] = (bytes[8]! & 63) | 128
  const h = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")
  const id = [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join(
    "-",
  )
  return { id, fields, rows }
}

export async function importCloudCsv(
  db: PersonalNotesDB,
  name: string,
  csv: Awaited<ReturnType<typeof readCloudCsv>>,
) {
  return db.transaction("rw", db.libraries, db.notes, async () => {
    if (await db.libraries.get(csv.id))
      return { libraries: 0, notes: 0, skipped: csv.rows.length + 1 }
    const now = Date.now()
    await db.libraries.add({ id: csv.id, name, fields: csv.fields, createdAt: now, updatedAt: now })
    const notes = csv.rows.map((row): Note => ({
      id: crypto.randomUUID(),
      libraryId: csv.id,
      actionId: null,
      actionName: "",
      selection: "",
      origin: null,
      pageTitle: "",
      cells: Object.fromEntries(csv.fields.map((f, i) => [f.id, row[i]!])),
      output: [],
      createdAt: now,
      updatedAt: now,
    }))
    await db.notes.bulkAdd(notes)
    return { libraries: 1, notes: notes.length, skipped: 0 }
  })
}
