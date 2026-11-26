import type { Field as NoteField, Library } from "../notes/model"
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
import { i18n } from "@/utils/i18n"
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
