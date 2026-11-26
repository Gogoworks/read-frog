import type { Cells, Library, Note } from "../notes/model"
import { useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { Input } from "@/components/ui/base-ui/input"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { i18n } from "@/utils/i18n"
import { fail } from "../notes/model"
import { personalNotes } from "../notes/store"
import { ErrorText, useOperation } from "./shared"

export function NoteEditor({
  note,
  library,
  onClose,
}: {
  note: Note
  library: Library
  onClose: () => void
}) {
  const [cells, setCells] = useState<Cells>(note.cells)
  const op = useOperation()
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void op.run(async () => {
          const converted = Object.fromEntries(
            library.fields.map((f) => {
              const raw = cells[f.id] ?? null
              if (f.type !== "number" || typeof raw !== "string") return [f.id, raw]
              const n = raw.trim() ? Number(raw) : null
              if (n !== null && !Number.isFinite(n)) fail("invalidValue")
              return [f.id, n]
            }),
          )
          await personalNotes().updateNote(note.id, note.updatedAt, converted)
          onClose()
        })
      }}
    >
      {library.fields.map((f) => (
        <label key={f.id} className="grid gap-1.5 text-sm font-medium">
          {f.name}
          {f.type === "number" ? (
            <Input
              type="number"
              step="any"
              value={cells[f.id] ?? ""}
              onChange={(e) => setCells({ ...cells, [f.id]: e.target.value })}
            />
          ) : (
            <Textarea
              value={cells[f.id] ?? ""}
              onChange={(e) => setCells({ ...cells, [f.id]: e.target.value })}
            />
          )}
        </label>
      ))}
      <ErrorText message={op.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={op.busy}>
          {i18n.t("personal.cancel")}
        </Button>
        <Button type="submit" disabled={op.busy}>
          {i18n.t("personal.saveChanges")}
        </Button>
      </div>
    </form>
  )
}
