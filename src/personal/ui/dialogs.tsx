import type { Cells, Field as NoteField, Library, Note } from "../notes/model"
import { IconPlus, IconX } from "@tabler/icons-react"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/base-ui/alert-dialog"
import { Button } from "@/components/ui/base-ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/base-ui/dialog"
import { Input } from "@/components/ui/base-ui/input"
import { Textarea } from "@/components/ui/base-ui/textarea"
import { i18n } from "@/utils/i18n"
import { fail } from "../notes/model"
import { personalNotes } from "../notes/store"
import { Choice, ErrorText, useOperation } from "./shared"

export function Confirm({
  title,
  description,
  confirm,
  destructive,
  onClose,
  onConfirm,
}: {
  title: string
  description: string
  confirm: string
  destructive?: boolean
  onClose: () => void
  onConfirm: () => Promise<unknown>
}) {
  const op = useOperation()
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !op.busy) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorText message={op.error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={op.busy}>{i18n.t("personal.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={op.busy}
            onClick={() =>
              void op.run(async () => {
                await onConfirm()
                onClose()
              })
            }
          >
            {confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function LibraryDialog({
  library,
  onClose,
  onSelect,
}: {
  library?: Library
  onClose: () => void
  onSelect: (id: string) => void
}) {
  const [name, setName] = useState(library?.name ?? "")
  const [fields, setFields] = useState<NoteField[]>(() => [
    { id: crypto.randomUUID(), name: i18n.t("personal.content"), type: "string" },
  ])
  const op = useOperation()
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{i18n.t(library ? "personal.rename" : "personal.create")}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void op.run(async () => {
              if (library) await personalNotes().renameLibrary(library.id, name)
              else onSelect((await personalNotes().createLibrary(name, fields)).id)
              onClose()
            })
          }}
        >
          <label className="grid gap-1.5 text-sm">
            {i18n.t("personal.libraryName")}
            <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {!library && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">{i18n.t("personal.fields")}</legend>
              {fields.map((f, index) => (
                <div className="flex items-center gap-2" key={f.id}>
                  <Input
                    required
                    aria-label={i18n.t("personal.fieldName", [index + 1])}
                    value={f.name}
                    onChange={(e) =>
                      setFields(
                        fields.map((item) =>
                          item.id === f.id ? { ...item, name: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <Choice
                    label={i18n.t("personal.fieldType")}
                    value={f.type}
                    options={["string", "number"].map((v) => ({
                      value: v,
                      label: i18n.t(v === "number" ? "personal.number" : "personal.text"),
                    }))}
                    onChange={(v) =>
                      setFields(
                        fields.map((item) =>
                          item.id === f.id
                            ? { ...item, type: v === "number" ? "number" : "string" }
                            : item,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={fields.length === 1}
                    aria-label={i18n.t("personal.removeField")}
                    onClick={() => setFields(fields.filter((item) => item.id !== f.id))}
                  >
                    <IconX />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setFields([...fields, { id: crypto.randomUUID(), name: "", type: "string" }])
                }
              >
                <IconPlus />
                {i18n.t("personal.addField")}
              </Button>
            </fieldset>
          )}
          <ErrorText message={op.error} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {i18n.t("personal.cancel")}
            </Button>
            <Button type="submit" disabled={op.busy}>
              {i18n.t("personal.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function NoteDialog({
  note,
  library,
  onClose,
}: {
  note: Note
  library: Library
  onClose: () => void
}) {
  const [cells, setCells] = useState<Cells>(note.cells)
  const [deleting, setDeleting] = useState(false)
  const op = useOperation()
  const origin = note.origin
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{i18n.t("personal.details")}</DialogTitle>
          </DialogHeader>
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
            <dl className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
              <dt className="font-medium">{i18n.t("personal.source")}</dt>
              <dd className="wrap-anywhere">
                {origin && "url" in origin ? (
                  <a
                    className="text-primary underline"
                    href={origin.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {origin.title || note.pageTitle || origin.url}
                  </a>
                ) : (
                  note.pageTitle ||
                  (origin?.kind === "ebook" ? origin.ebookId : i18n.t("personal.unknown"))
                )}
                {origin && "url" in origin && (
                  <div className="text-xs text-muted-foreground">{origin.url}</div>
                )}
                {origin?.kind === "video" && origin.seconds !== undefined && (
                  <div>{i18n.t("personal.videoTime", [origin.seconds])}</div>
                )}
                {origin?.kind === "ebook" && (
                  <div>{[origin.ebookId, origin.cfi].filter(Boolean).join(" · ")}</div>
                )}
              </dd>
              {note.selection && (
                <>
                  <dt className="font-medium">{i18n.t("personal.selection")}</dt>
                  <dd className="wrap-anywhere whitespace-pre-wrap">{note.selection}</dd>
                </>
              )}
              <dt className="font-medium">
                {i18n.t("personal.library")} / {i18n.t("personal.action")}
              </dt>
              <dd>
                {library.name} · {note.actionName || i18n.t("personal.unknown")}
              </dd>
              <dt className="font-medium">
                {i18n.t("personal.created")} / {i18n.t("personal.updated")}
              </dt>
              <dd>
                {new Date(note.createdAt).toLocaleString()} ·{" "}
                {new Date(note.updatedAt).toLocaleString()}
              </dd>
            </dl>
            {note.output.length > 0 && (
              <details className="rounded-lg border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {i18n.t("personal.original")}
                </summary>
                <dl className="mt-3 space-y-1">
                  {note.output.map((f) => (
                    <div key={f.id}>
                      <dt className="text-muted-foreground">{f.name}</dt>
                      <dd className="wrap-anywhere whitespace-pre-wrap">{f.value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            <ErrorText message={op.error} />
            <DialogFooter>
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                onClick={() => setDeleting(true)}
              >
                {i18n.t("personal.deleteNote")}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                {i18n.t("personal.close")}
              </Button>
              <Button type="submit" disabled={op.busy}>
                {i18n.t("personal.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {deleting && (
        <Confirm
          title={i18n.t("personal.deleteNote")}
          description={i18n.t("personal.deleteNoteHelp")}
          confirm={i18n.t("personal.deleteNote")}
          destructive
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await personalNotes().deleteNote(note.id, note.updatedAt)
            onClose()
          }}
        />
      )}
    </>
  )
}
