import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { noteOriginInputSchema, toNoteOriginUrl } from "@read-frog/definitions"
import { z } from "zod"
import {
  createNameMatchedNotebaseMappings,
  isNotebaseMappingCompatible,
} from "@/utils/notebase/mapping"

const fieldIdSchema = z.string().min(1)
const nameSchema = z.string().trim().min(1)
const timestamp = z.number().int().nonnegative().max(8640000000000000)
export const fieldSchema = z.strictObject({
  id: fieldIdSchema,
  name: nameSchema,
  type: z.enum(["string", "number"]),
})
const valueSchema = z.union([z.string(), z.number(), z.null()])
const cellsSchema = z.record(z.string(), valueSchema)
export type Field = z.infer<typeof fieldSchema>
export type Cells = z.infer<typeof cellsSchema>

export const librarySchema = z.strictObject({
  id: z.uuid(),
  name: nameSchema,
  fields: z.array(fieldSchema).min(1),
  createdAt: timestamp,
  updatedAt: timestamp,
})
const mappingSchema = z.strictObject({ fieldId: fieldIdSchema, columnId: fieldIdSchema })
export const bindingSchema = z.strictObject({
  actionId: fieldIdSchema,
  libraryId: z.uuid(),
  mappings: z.array(mappingSchema),
})
export const noteSchema = z.strictObject({
  id: z.uuid(),
  libraryId: z.uuid(),
  actionId: fieldIdSchema.nullable(),
  actionName: z.string(),
  cells: cellsSchema,
  output: z.array(fieldSchema.extend({ value: valueSchema })),
  selection: z.string(),
  origin: noteOriginInputSchema.nullable(),
  pageTitle: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
})
export const backupSchema = z.strictObject({
  format: z.literal("read-frog-personal-notes"),
  version: z.literal(1),
  libraries: z.array(librarySchema),
  bindings: z.array(bindingSchema),
  notes: z.array(noteSchema),
})
export type Library = z.infer<typeof librarySchema>
export type Binding = z.infer<typeof bindingSchema>
export type Note = z.infer<typeof noteSchema>
export type Backup = z.infer<typeof backupSchema>
export type NoteOrigin = Note["origin"]
export type NoteAction = { id: string; name: string; fields: Field[] }
export interface SaveNotesInput {
  action: NoteAction
  rows: { id: string; values: Cells }[]
  selection: string
  origin: NoteOrigin
  pageTitle: string
}

export const errorKeys = [
  "invalidBackup",
  "importConflict",
  "invalidFields",
  "invalidMapping",
  "invalidValue",
  "changed",
  "missing",
  "invalidCsv",
] as const
export type NoteErrorKey = (typeof errorKeys)[number]
export function fail(key: NoteErrorKey): never {
  throw new Error(key)
}

export function describeAction(action: SelectionToolbarCustomAction): NoteAction {
  return {
    id: action.id,
    name: action.name,
    fields: action.outputSchema.map(({ id, name, type }) => ({ id, name, type })),
  }
}

export function unique(values: string[]) {
  return new Set(values).size === values.length
}

export function validFields(fields: Field[]) {
  return (
    fields.length > 0 && unique(fields.map((f) => f.id)) && unique(fields.map((f) => f.name.trim()))
  )
}

export function accepts(field: Field, value: unknown): value is Cells[string] {
  return (
    value === null ||
    (field.type === "number"
      ? typeof value === "number" && Number.isFinite(value)
      : typeof value === "string")
  )
}

export function cleanOrigin(origin: NoteOrigin): NoteOrigin {
  if (!origin || origin.kind === "ebook") return origin
  const url = toNoteOriginUrl(origin.url)
  if (!url) return null
  const safe = new URL(url)
  // API keys may also be carried as ?key=, or in an OAuth fragment.
  for (const key of Array.from(safe.searchParams.keys())) {
    if (/^(key|api-key|client_secret|authorization)$/i.test(key)) safe.searchParams.delete(key)
  }
  if (
    /(^|[?#&])(access_token|id_token|refresh_token|token|api[_-]?key|key|client_secret)=/i.test(
      safe.hash,
    )
  )
    safe.hash = ""
  return { ...origin, url: safe.href }
}

export function matchFields(action: NoteAction, library: Library): Binding {
  const columns = library.fields.map((f) => ({ id: f.id, name: f.name, config: { type: f.type } }))
  const mappings = createNameMatchedNotebaseMappings(action.fields, columns)
  return {
    actionId: action.id,
    libraryId: library.id,
    mappings: mappings.map((m) => ({ fieldId: m.localFieldId, columnId: m.notebaseColumnId })),
  }
}

export function validateBinding(binding: Binding, library: Library, action: NoteAction) {
  if (
    !binding.mappings.length ||
    !unique(binding.mappings.map((m) => m.fieldId)) ||
    !unique(binding.mappings.map((m) => m.columnId))
  )
    fail("invalidMapping")
  for (const { fieldId, columnId } of binding.mappings) {
    const field = action.fields.find((f) => f.id === fieldId)
    const column = library.fields.find((f) => f.id === columnId)
    if (!field || !column || !isNotebaseMappingCompatible(field.type, { type: column.type }))
      fail("invalidMapping")
  }
}

export function validateCells(cells: Cells, library: Library) {
  for (const [id, value] of Object.entries(cells)) {
    const field = library.fields.find((f) => f.id === id)
    if (!field || !accepts(field, value)) fail("invalidValue")
  }
}

// Project the completed result onto the declared fields before it leaves the page.
// Prompts, providers, credentials and the rest of the config never enter the request.
export function outputValues(fields: Field[], result: Record<string, unknown>): Cells {
  return Object.fromEntries(
    fields.map((f) => {
      const value = Object.hasOwn(result, f.name) ? (result[f.name] ?? null) : null
      if (!accepts(f, value)) fail("invalidValue")
      return [f.id, value]
    }),
  )
}
