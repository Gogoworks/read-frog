import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { indexedDB, IDBKeyRange } from "fake-indexeddb"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { notesCsv, parseBackup } from "../notes/backup"
import { filterNotes } from "../notes/browse"
import { importCloudCsv, readCloudCsv } from "../notes/cloud-csv"
import { describeAction } from "../notes/model"
import { prepareSave } from "../notes/save"
import { PersonalNotesDB, personalNotes } from "../notes/store"

const dbOptions = { indexedDB, IDBKeyRange }

const action: SelectionToolbarCustomAction = {
  id: "dictionary",
  name: "Dictionary",
  providerId: "openai-default",
  icon: "tabler:book",
  prompt: "test prompt",
  systemPrompt: "private instructions",
  outputSchema: [
    { id: "term", name: "Word", type: "string", description: "" },
    { id: "score", name: "Score", type: "number", description: "" },
  ],
}
function request(n = 1, target = action) {
  return prepareSave({
    action: target,
    results: Array.from({ length: n }, (_, i) => ({
      Word: `word ${i + 1}`,
      Score: i + 1,
      apiKey: "UNDECLARED_FIXTURE",
    })),
    selection: "selected words",
    pageTitle: "Article",
    origin: {
      kind: "webpage",
      url: "https://example.org/post?api_key=PRIVATE&lang=en&key=PRIVATE#access_token=PRIVATE",
      title: "Article",
    },
  })
}

describe("Personal notes on extension IndexedDB", () => {
  let db: PersonalNotesDB
  beforeEach(() => {
    db = new PersonalNotesDB(crypto.randomUUID(), dbOptions)
  })
  afterEach(async () => {
    await db.delete()
    vi.unstubAllGlobals()
  })

  it("writes 11 and 100 without a network or account, then reopens the same DB", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() => {
      throw new Error("offline")
    })
    vi.stubGlobal("fetch", fetch)
    const first = await db.save(request(10))
    await db.save(request())
    expect(await db.notes.count()).toBe(11)
    await db.save(request(89))
    const dbName = db.name
    db.close()
    db = new PersonalNotesDB(dbName, dbOptions)
    expect(await db.notes.where("libraryId").equals(first.libraryId).count()).toBe(100)
    expect(fetch).not.toHaveBeenCalled()
    expect(() => personalNotes()).toThrow("Extension context required")
  })

  it("serializes concurrent first saves and accepts a retry without duplicating rows", async () => {
    const a = request(),
      b = request(2)
    await Promise.all([db.save(a), db.save(b)])
    await db.save(a)
    expect(await db.libraries.count()).toBe(1)
    expect(await db.bindings.count()).toBe(1)
    expect(await db.notes.count()).toBe(3)
  })

  it("isolates actions, maps unlike names by stable ID, keeps raw output and selection, and omits config", async () => {
    const library = await db.createLibrary("Study", [
      { id: "points", name: "Rating", type: "number" },
    ])
    const other = { ...action, id: "grammar", name: "Grammar" }
    await db.connect(describeAction(other), library.id, [{ fieldId: "score", columnId: "points" }])
    await db.save(request(1, other))
    const own = await db.save(request())
    expect(own.libraryId).not.toBe(library.id)
    const [note] = await db.notes.where("libraryId").equals(library.id).toArray()
    expect(note).toMatchObject({
      selection: "selected words",
      cells: { points: 1 },
      output: [
        { name: "Word", value: "word 1" },
        { name: "Score", value: 1 },
      ],
      actionId: "grammar",
    })
    const backup = JSON.stringify(await db.backup())
    for (const secret of [
      "UNDECLARED_FIXTURE",
      "PRIVATE",
      "apiKey",
      "private instructions",
      "openai-default",
    ])
      expect(backup).not.toContain(secret)
    expect(note?.origin).toMatchObject({ url: "https://example.org/post?lang=en" })
    await db.renameLibrary(library.id, "Renamed")
    expect((await db.libraries.get(library.id))?.name).toBe("Renamed")
    await db.deleteLibrary(library.id)
    expect(await db.notes.count()).toBe(1)
    expect(await db.bindings.get(other.id)).toBeUndefined()
  })

  it("rolls back a whole batch including first-use library creation on invalid values", async () => {
    const input = request(3)
    input.rows[2]!.values.score = "bad"
    await expect(db.save(input)).rejects.toThrow("invalidValue")
    expect((await db.backup()).libraries).toHaveLength(0)
    expect(await db.notes.count()).toBe(0)
  })

  it("rejects incompatible, duplicate or stale mappings before a write", async () => {
    const { libraryId } = await db.save(request())
    const library = (await db.libraries.get(libraryId))!
    await expect(db.connect(describeAction(action), libraryId, [])).rejects.toThrow(
      "invalidMapping",
    )
    await expect(
      db.connect(describeAction(action), libraryId, [
        { fieldId: "score", columnId: library.fields[0]!.id },
      ]),
    ).rejects.toThrow("invalidMapping")
    const original = (await db.bindings.get(action.id))!
    await expect(
      db.connect(describeAction(action), libraryId, [...original.mappings, original.mappings[0]!]),
    ).rejects.toThrow("invalidMapping")
    const input = request()
    input.action.fields = input.action.fields.filter((f) => f.id !== "term")
    await expect(db.save(input)).rejects.toThrow("invalidMapping")
    expect(await db.notes.count()).toBe(1)
  })

  it("edits mapped cells, detects competing edits, searches provenance and preserves original output", async () => {
    const input = request(2)
    await db.save(input)
    const [a, b] = await db.notes.bulkGet(input.rows.map((r) => r.id))
    const field = Object.keys(a!.cells)[0]!
    await db.updateNote(a!.id, a!.updatedAt, { ...a!.cells, [field]: "Edited" })
    await expect(db.updateNote(a!.id, a!.updatedAt, a!.cells)).rejects.toThrow("changed")
    const edited = (await db.notes.get(a!.id))!
    expect(edited.output).toEqual(a!.output)
    expect(filterNotes([edited, b!], "ediTED", false)).toEqual([edited])
    expect(filterNotes([edited, b!], "example.org", true)).toHaveLength(2)
    const older = { ...b!, createdAt: 1 }
    expect(filterNotes([edited, older], "", true)[0]).toBe(older)
    expect(filterNotes([edited, older], "", false)[0]).toBe(edited)
    await expect(db.deleteNote(a!.id, a!.updatedAt)).rejects.toThrow("changed")
    await db.deleteNote(a!.id, edited.updatedAt)
    expect(await db.notes.count()).toBe(1)
  })

  it("restores a complete JSON round trip and rolls back new rows on a late collision", async () => {
    await db.save(request(2))
    const backup = await db.backup()
    const other = new PersonalNotesDB(crypto.randomUUID(), dbOptions)
    try {
      expect((await other.restore(JSON.parse(JSON.stringify(backup)))).notes).toBe(2)
      expect(await other.backup()).toEqual(backup)
      expect((await other.restore(backup)).skipped).toBe(4)
      const conflict = structuredClone(backup)
      conflict.libraries.push({ ...backup.libraries[0]!, id: crypto.randomUUID() })
      conflict.notes[1]!.pageTitle = "different"
      await expect(other.restore(conflict)).rejects.toThrow("importConflict")
      expect(await other.backup()).toEqual(backup)
      expect(() => parseBackup({ ...backup, version: 2 })).toThrow("invalidBackup")
      expect(() => parseBackup({ ...backup, apiKey: "outer" })).toThrow("invalidBackup")
      expect(() =>
        parseBackup({ ...backup, notes: [{ ...backup.notes[0], libraryId: crypto.randomUUID() }] }),
      ).toThrow("invalidBackup")
      expect(() => parseBackup({ ...backup, notes: [backup.notes[0], backup.notes[0]] })).toThrow(
        "invalidBackup",
      )
      expect(() =>
        parseBackup({
          ...backup,
          notes: [{ ...backup.notes[0], origin: { kind: "webpage", url: "javascript:invalid" } }],
        }),
      ).toThrow("invalidBackup")
    } finally {
      await other.delete()
    }
  })

  it("exports BOM CSV with quoting and escaped spreadsheet formulas and imports an official table once", async () => {
    const csv = await readCloudCsv(
      '\uFEFF"Word","Meaning"\r\n"蛙","a ""frog"",\nexample"\r\n"=1+1","说明"',
    )
    expect(await importCloudCsv(db, "Official", csv)).toEqual({
      libraries: 1,
      notes: 2,
      skipped: 0,
    })
    expect((await importCloudCsv(db, "Renamed file", csv)).notes).toBe(0)
    const backup = await db.backup()
    const exported = notesCsv(backup.libraries[0]!, backup.notes)
    expect(exported.charCodeAt(0)).toBe(0xfeff)
    expect(exported).toContain('"a ""frog"",\nexample"')
    expect(exported).toContain('"\'=1+1"')
    expect(backup.notes.every((n) => n.origin === null && n.actionId === null)).toBe(true)
    await expect(readCloudCsv("A,A\nx,y")).rejects.toThrow("invalidCsv")
    await expect(readCloudCsv("A,B\nx")).rejects.toThrow("invalidCsv")
    await expect(readCloudCsv('"bad')).rejects.toThrow("invalidCsv")
  })
})
