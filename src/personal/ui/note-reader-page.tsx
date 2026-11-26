import type { Library, Note } from "../notes/model"
import { IconArrowLeft, IconPencil, IconTrash } from "@tabler/icons-react"
import { useCallback, useState } from "react"
import { Link, useLocation, useNavigate, useParams } from "react-router"
import Container from "@/components/container"
import { Button, buttonVariants } from "@/components/ui/base-ui/button"
import { useDrillInBack } from "@/entrypoints/options/navigation/drill-in"
import { i18n } from "@/utils/i18n"
import { hasCellContent, readCell } from "../notes/reading"
import { personalNotes } from "../notes/store"
import { Confirm } from "./dialogs"
import { NoteEditor } from "./note-editor"
import { ReadableValue } from "./readable-value"
import { ErrorText, useNotesQuery } from "./shared"

function Provenance({ note, library }: { note: Note; library: Library }) {
  const origin = note.origin
  return (
    <footer className="space-y-6 border-t pt-6">
      {note.selection && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            {i18n.t("personal.selection")}
          </h2>
          <blockquote className="border-l-2 pl-4 leading-7 whitespace-pre-wrap">
            {note.selection}
          </blockquote>
        </section>
      )}
      <dl className="grid gap-x-8 gap-y-4 rounded-xl border bg-muted/25 p-4 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-muted-foreground">{i18n.t("personal.source")}</dt>
          <dd>
            {origin && "url" in origin ? (
              <a
                href={origin.url}
                target="_blank"
                rel="noreferrer"
                className="text-link underline underline-offset-2"
              >
                {origin.title || note.pageTitle || origin.url}
              </a>
            ) : (
              note.pageTitle ||
              (origin?.kind === "ebook" ? origin.ebookId : i18n.t("personal.unknown"))
            )}
            {origin && "url" in origin && (origin.title || note.pageTitle) && (
              <div className="text-xs text-muted-foreground">{origin.url}</div>
            )}
            {origin?.kind === "video" && origin.seconds !== undefined && (
              <div>{i18n.t("personal.videoTime", [origin.seconds])}</div>
            )}
            {origin?.kind === "ebook" && (
              <div className="text-xs text-muted-foreground">
                {[note.pageTitle ? origin.ebookId : "", origin.cfi].filter(Boolean).join(" · ")}
              </div>
            )}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">
            {i18n.t("personal.library")} / {i18n.t("personal.action")}
          </dt>
          <dd>
            {library.name} · {note.actionName || i18n.t("personal.unknown")}
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">{i18n.t("personal.created")}</dt>
          <dd>{new Date(note.createdAt).toLocaleString()}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground">{i18n.t("personal.updated")}</dt>
          <dd>{new Date(note.updatedAt).toLocaleString()}</dd>
        </div>
      </dl>
    </footer>
  )
}

function NoteArticle({
  library,
  note,
  onDeleted,
}: {
  library: Library
  note: Note
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState<Note>()
  const [deleting, setDeleting] = useState<Note>()
  const fields = library.fields.filter((f) => hasCellContent(note.cells[f.id]))
  const first = fields[0]
  const firstValue = first && readCell(note.cells[first.id])
  const lead =
    typeof firstValue === "string" && firstValue.trim().length <= 120 && !/[\r\n]/.test(firstValue)
      ? firstValue.trim()
      : undefined

  if (editing) {
    return (
      <section className="space-y-6">
        <h1 className="text-2xl font-semibold">{i18n.t("personal.editNote")}</h1>
        <NoteEditor note={editing} library={library} onClose={() => setEditing(undefined)} />
      </section>
    )
  }

  return (
    <article aria-label={i18n.t("personal.details")} className="min-w-0 space-y-8 wrap-anywhere">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6 sm:flex-nowrap">
        <div className="min-w-0 space-y-2">
          {lead && <p className="text-sm font-medium text-muted-foreground">{first?.name}</p>}
          <h1 className="text-2xl leading-snug font-semibold tracking-tight sm:text-3xl">
            {lead || i18n.t("personal.details")}
          </h1>
        </div>
        <Button variant="outline" onClick={() => setEditing(note)}>
          <IconPencil />
          {i18n.t("personal.editNote")}
        </Button>
      </header>
      {(lead ? fields.slice(1) : fields).map((field) => (
        <section key={field.id} aria-label={field.name} className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{field.name}</h2>
          <ReadableValue value={note.cells[field.id]} />
        </section>
      ))}
      {!fields.length && <p className="text-muted-foreground">{i18n.t("personal.emptyFields")}</p>}
      <Provenance note={note} library={library} />
      {note.output.length > 0 && (
        <details className="rounded-xl border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">
            {i18n.t("personal.original")}
          </summary>
          <dl className="mt-4 space-y-4">
            {note.output.map((f) => (
              <div key={f.id}>
                <dt className="text-sm font-medium text-muted-foreground">{f.name}</dt>
                <dd className="leading-7 whitespace-pre-wrap">{f.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => setDeleting(note)}
      >
        <IconTrash />
        {i18n.t("personal.deleteNote")}
      </Button>
      {deleting && (
        <Confirm
          title={i18n.t("personal.deleteNote")}
          description={i18n.t("personal.deleteNoteHelp")}
          confirm={i18n.t("personal.deleteNote")}
          destructive
          onClose={() => setDeleting(undefined)}
          onConfirm={async () => {
            await personalNotes().deleteNote(deleting.id, deleting.updatedAt)
            onDeleted()
          }}
        />
      )}
    </article>
  )
}

export default function NoteReaderPage() {
  const { noteId } = useParams()
  const { data, error } = useNotesQuery(
    useCallback(async () => (noteId ? personalNotes().getNoteWithLibrary(noteId) : null), [noteId]),
  )
  const navigate = useNavigate()
  const { state } = useLocation()
  const goBack = useDrillInBack()
  const backTo = data ? "/local-notes?library=" + data.library.id : "/local-notes"
  return (
    <Container className="max-w-4xl space-y-6 pt-8 pb-16 md:pt-12">
      <Link
        to={backTo}
        onClick={goBack}
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "-ml-2 text-muted-foreground",
        })}
      >
        <IconArrowLeft />
        {i18n.t("personal.backToNotebook")}
      </Link>
      {error && <ErrorText message={error} />}
      {data === undefined && !error && <p role="status">{i18n.t("personal.loading")}</p>}
      {data === null && <p role="status">{i18n.t("personal.errors.missing")}</p>}
      {data && (
        <NoteArticle
          key={data.note.id}
          {...data}
          onDeleted={() => {
            if (state?.drillIn) void navigate(-1)
            else void navigate(backTo, { replace: true })
          }}
        />
      )}
    </Container>
  )
}
