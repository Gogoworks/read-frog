import type { Backup, Library, Note } from "../notes/model"
import { IconDownload, IconUpload } from "@tabler/icons-react"
import { saveAs } from "file-saver"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import { notesCsv, parseBackup } from "../notes/backup"
import { personalNotes } from "../notes/store"
import { Confirm } from "./dialogs"
import { ErrorText, useOperation } from "./shared"

type Csv = Awaited<ReturnType<typeof import("../notes/cloud-csv").readCloudCsv>>
type Pending = { type: "json"; data: Backup } | { type: "csv"; data: Csv; name: string }

export function BackupTools({
  library,
  notes,
  onSelect,
}: {
  library?: Library
  notes?: Note[]
  onSelect: (id: string) => void
}) {
  const jsonFile = useRef<HTMLInputElement>(null)
  const csvFile = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending>()
  const [summary, setSummary] = useState("")
  const op = useOperation()
  async function read(file: File, csv: boolean) {
    setSummary("")
    const raw = await file.text()
    if (csv) {
      const { readCloudCsv } = await import("../notes/cloud-csv")
      setPending({
        type: "csv",
        data: await readCloudCsv(raw),
        name: file.name.replace(/\.csv$/i, "").trim() || i18n.t("personal.library"),
      })
    } else {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        throw new Error("invalidBackup")
      }
      setPending({ type: "json", data: parseBackup(parsed) })
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={op.busy}
          onClick={() =>
            void op.run(async () => {
              const data = await personalNotes().backup()
              saveAs(
                new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
                `read-frog-personal-${new Date().toISOString().slice(0, 10)}.json`,
              )
            })
          }
        >
          <IconDownload />
          {i18n.t("personal.backup")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={op.busy}
          onClick={() => jsonFile.current?.click()}
        >
          <IconUpload />
          {i18n.t("personal.restore")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!library || !notes}
          onClick={() => {
            if (library && notes)
              saveAs(
                new Blob([notesCsv(library, notes)], { type: "text/csv;charset=utf-8" }),
                library.name.replace(/[/\\:*?"<>|]/g, "_") + ".csv",
              )
          }}
        >
          {i18n.t("personal.exportCsv")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={op.busy}
          onClick={() => csvFile.current?.click()}
        >
          {i18n.t("personal.importCsv")}
        </Button>
        {(
          [
            ["json", jsonFile],
            ["csv", csvFile],
          ] as const
        ).map(([type, ref]) => (
          <input
            key={type}
            ref={ref}
            type="file"
            className="hidden"
            aria-label={i18n.t(type === "csv" ? "personal.importCsv" : "personal.restore")}
            accept={"." + type}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) void op.run(() => read(file, type === "csv"))
            }}
          />
        ))}
      </div>
      <ErrorText message={op.error} />
      {summary && (
        <p role="status" className="text-sm text-muted-foreground">
          {summary}
        </p>
      )}
      {pending && (
        <Confirm
          title={i18n.t(pending.type === "json" ? "personal.restore" : "personal.importCsv")}
          description={
            pending.type === "json"
              ? i18n.t("personal.restoreHelp", [
                  pending.data.libraries.length,
                  pending.data.notes.length,
                ])
              : i18n.t("personal.csvHelp", [pending.name, pending.data.rows.length])
          }
          confirm={i18n.t("personal.import")}
          onClose={() => setPending(undefined)}
          onConfirm={async () => {
            const db = personalNotes()
            const result =
              pending.type === "json"
                ? await db.restore(pending.data)
                : await (
                    await import("../notes/cloud-csv")
                  ).importCloudCsv(db, pending.name, pending.data)
            setSummary(
              i18n.t("personal.imported", [result.libraries, result.notes, result.skipped]),
            )
            if (pending.type === "csv") onSelect(pending.data.id)
          }}
        />
      )}
    </div>
  )
}
