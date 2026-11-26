import type { DexieOptions, Table } from "dexie"
import type {
  Backup,
  Binding,
  Cells,
  Field,
  Library,
  Note,
  NoteAction,
  SaveNotesInput,
} from "./model"
import { dequal } from "dequal"
import { Dexie } from "dexie"
import { parseBackup } from "./backup"
import {
  accepts,
  bindingSchema,
  cleanOrigin,
  fail,
  librarySchema,
  matchFields,
  noteSchema,
  unique,
  validateBinding,
  validateCells,
  validFields,
} from "./model"

export class PersonalNotesDB extends Dexie {
  libraries!: Table<Library, string>
  bindings!: Table<Binding, string>
  notes!: Table<Note, string>

  constructor(name = "read-frog-personal-notes", options?: DexieOptions) {
    super(name, options)
    // Append future versions with .upgrade(); preserve all previously shipped stores.
    this.version(1).stores({
      libraries: "id",
      bindings: "actionId,libraryId",
      notes: "id,[libraryId+createdAt],libraryId",
    })
  }

  listLibraries() {
    return this.libraries.toArray()
  }

  listNotes(libraryId: string) {
    return this.notes.where("libraryId").equals(libraryId).toArray()
  }

  getNoteWithLibrary(id: string) {
    return this.transaction("r", this.notes, this.libraries, async () => {
      const note = await this.notes.get(id)
      if (!note) return null
      const library = await this.libraries.get(note.libraryId)
      return library ? { note, library } : null
    })
  }

  connectionOptions(actionId: string) {
    return this.transaction("r", this.libraries, this.bindings, async () => ({
      libraries: await this.listLibraries(),
      binding: await this.bindings.get(actionId),
    }))
  }

  disconnect(actionId: string) {
    return this.bindings.delete(actionId)
  }

  async createLibrary(name: string, fields: Field[]) {
    if (!validFields(fields)) fail("invalidFields")
    const now = Date.now()
    const parsed = librarySchema.safeParse({
      id: crypto.randomUUID(),
      name,
      fields,
      createdAt: now,
      updatedAt: now,
    })
    if (!parsed.success) fail("invalidFields")
    await this.libraries.add(parsed.data)
    return parsed.data
  }

  async renameLibrary(id: string, name: string) {
    if (!name.trim()) fail("invalidFields")
    if (!(await this.libraries.update(id, { name: name.trim(), updatedAt: Date.now() })))
      fail("missing")
  }

  async deleteLibrary(id: string) {
    await this.transaction("rw", this.libraries, this.bindings, this.notes, async () => {
      await this.notes.where("libraryId").equals(id).delete()
      await this.bindings.where("libraryId").equals(id).delete()
      await this.libraries.delete(id)
    })
  }

  async connect(action: NoteAction, libraryId: string, mappings?: Binding["mappings"]) {
    return this.transaction("rw", this.libraries, this.bindings, async () => {
      const library = await this.libraries.get(libraryId)
      if (!library) fail("missing")
      const binding = mappings
        ? { actionId: action.id, libraryId, mappings }
        : matchFields(action, library)
      validateBinding(binding, library, action)
      await this.bindings.put(bindingSchema.parse(binding))
      return binding
    })
  }

  async save(input: SaveNotesInput) {
    const { action, rows } = input
    if (!rows.length || !unique(rows.map((r) => r.id)) || !validFields(action.fields))
      fail("invalidFields")
    return this.transaction("rw", this.libraries, this.bindings, this.notes, async () => {
      const current = await this.bindings.get(action.id)
      const library = current
        ? await this.libraries.get(current.libraryId)
        : await this.createLibrary(
            action.name,
            action.fields.map((f) => ({ ...f, id: crypto.randomUUID() })),
          )
      if (!library) fail("missing")
      const binding = current ?? (await this.connect(action, library.id))
      validateBinding(binding, library, action)
      const now = Date.now()
      const notes = rows.map(({ id, values }) => {
        const output = action.fields.map((f) => {
          const value = values[f.id] ?? null
          if (!accepts(f, value)) fail("invalidValue")
          return { ...f, value }
        })
        const cells = Object.fromEntries(
          binding.mappings.map((m) => [m.columnId, values[m.fieldId] ?? null]),
        )
        validateCells(cells, library)
        return noteSchema.parse({
          id,
          libraryId: library.id,
          actionId: action.id,
          actionName: action.name,
          cells,
          output,
          selection: input.selection,
          origin: cleanOrigin(input.origin),
          pageTitle: input.pageTitle,
          createdAt: now,
          updatedAt: now,
        })
      })
      const existing = await this.notes.bulkGet(notes.map((n) => n.id))
      const fresh = notes.filter((note, i) => {
        const prior = existing[i]
        if (!prior) return true
        // A retry may arrive after an edit. Keep the edited cells.
        if (
          prior.libraryId !== note.libraryId ||
          prior.actionId !== note.actionId ||
          !dequal(prior.output, note.output) ||
          prior.selection !== note.selection
        )
          fail("changed")
        return false
      })
      await this.notes.bulkAdd(fresh)
      return { libraryId: library.id, libraryName: library.name, count: notes.length }
    })
  }

  async updateNote(id: string, expectedUpdatedAt: number, cells: Cells) {
    await this.transaction("rw", this.notes, this.libraries, async () => {
      const note = await this.notes.get(id)
      if (!note) fail("missing")
      if (note.updatedAt !== expectedUpdatedAt) fail("changed")
      const library = await this.libraries.get(note.libraryId)
      if (!library) fail("missing")
      validateCells(cells, library)
      await this.notes.update(id, { cells, updatedAt: Math.max(Date.now(), expectedUpdatedAt + 1) })
    })
  }

  async deleteNote(id: string, expectedUpdatedAt: number) {
    await this.transaction("rw", this.notes, async () => {
      const note = await this.notes.get(id)
      if (!note) return
      if (note.updatedAt !== expectedUpdatedAt) fail("changed")
      await this.notes.delete(id)
    })
  }

  async backup(): Promise<Backup> {
    return this.transaction("r", this.libraries, this.bindings, this.notes, async () => ({
      format: "read-frog-personal-notes",
      version: 1,
      libraries: await this.libraries.toArray(),
      bindings: await this.bindings.toArray(),
      notes: await this.notes.toArray(),
    }))
  }

  async restore(raw: unknown) {
    const backup = parseBackup(raw)
    return this.transaction("rw", this.libraries, this.bindings, this.notes, async () => {
      async function merge<T>(table: Table<T, string>, rows: T[], key: (row: T) => string) {
        const existing = await table.bulkGet(rows.map(key))
        const additions = rows.filter((row, i) => {
          if (existing[i] === undefined) return true
          if (!dequal(existing[i], row)) fail("importConflict")
          return false
        })
        await table.bulkAdd(additions)
        return additions.length
      }
      const libraries = await merge(this.libraries, backup.libraries, (l) => l.id)
      const bindings = await merge(this.bindings, backup.bindings, (b) => b.actionId)
      const notes = await merge(this.notes, backup.notes, (n) => n.id)
      return {
        libraries,
        bindings,
        notes,
        skipped:
          backup.libraries.length +
          backup.bindings.length +
          backup.notes.length -
          libraries -
          bindings -
          notes,
      }
    })
  }
}

let store: PersonalNotesDB | undefined
export function personalNotes() {
  if (!["chrome-extension:", "moz-extension:"].includes(globalThis.location?.protocol))
    throw new Error("Extension context required")
  return (store ??= new PersonalNotesDB())
}
