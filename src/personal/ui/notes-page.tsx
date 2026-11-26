import type { Library, Note } from "../notes/model"
import { IconBook2, IconChevronRight, IconPlus, IconSearch } from "@tabler/icons-react"
import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { PageLayout } from "@/components/page-layout"
import { Button } from "@/components/ui/base-ui/button"
import { Input } from "@/components/ui/base-ui/input"
import { i18n } from "@/utils/i18n"
import { filterNotes } from "../notes/browse"
import { personalNotes } from "../notes/store"
import { BackupTools } from "./backup-tools"
import { Confirm, LibraryDialog, NoteDialog } from "./dialogs"
import { Choice, ErrorText, useNotesQuery } from "./shared"

const PAGE_SIZE = 30
function NoteList({ notes, library }: { notes: Note[]; library: Library }) {
  const [query, setQuery] = useState("")
  const [order, setOrder] = useState("new")
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<Note>()
  const filtered = useMemo(() => filterNotes(notes, query, order === "old"), [notes, query, order])
  const pages = Math.ceil(filtered.length / PAGE_SIZE)
  const current = Math.min(page, Math.max(0, pages - 1))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-44 flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={i18n.t("personal.search")}
            placeholder={i18n.t("personal.search")}
            className="pl-8"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
          />
        </div>
        <Choice
          label={i18n.t("personal.sort")}
          value={order}
          options={[
            { value: "new", label: i18n.t("personal.newest") },
            { value: "old", label: i18n.t("personal.oldest") },
          ]}
          onChange={(v) => {
            setOrder(v)
            setPage(0)
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length === 1
          ? i18n.t("personal.oneNote")
          : i18n.t("personal.count", [filtered.length])}
      </p>
      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {i18n.t(notes.length ? "personal.noMatches" : "personal.emptyNotes")}
        </p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((n) => {
            const values = library.fields
              .map((f) => n.cells[f.id])
              .filter((v) => v !== null && v !== undefined && v !== "")
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:bg-muted"
                  onClick={() => setDetail(n)}
                >
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="truncate text-sm font-medium">
                      {values[0] ?? (n.selection || i18n.t("personal.details"))}
                    </span>
                    {values.length > 1 && (
                      <span className="truncate text-sm text-muted-foreground">
                        {values.slice(1).join(" · ")}
                      </span>
                    )}
                    <span className="truncate text-xs text-muted-foreground">
                      {[
                        n.actionName,
                        n.pageTitle || (n.origin && "title" in n.origin ? n.origin.title : ""),
                        new Date(n.createdAt).toLocaleString(),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            {i18n.t("personal.previous")}
          </Button>
          <span>
            {current + 1} / {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            {i18n.t("personal.next")}
          </Button>
        </div>
      )}
      {detail && (
        <NoteDialog note={detail} library={library} onClose={() => setDetail(undefined)} />
      )}
    </div>
  )
}

export default function LocalNotesPage() {
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState<"create" | "rename" | "delete">()
  const libraries = useNotesQuery(useCallback(() => personalNotes().listLibraries(), []))
  const lib = libraries.data?.find((l) => l.id === params.get("library")) ?? libraries.data?.[0]
  const libraryId = lib?.id
  const notes = useNotesQuery(
    useCallback(async () => (libraryId ? personalNotes().listNotes(libraryId) : []), [libraryId]),
  )
  function select(id: string) {
    setParams({ library: id }, { replace: true })
  }
  return (
    <PageLayout
      title={i18n.t("personal.title")}
      description={i18n.t("personal.description")}
      innerClassName="space-y-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <IconBook2 className="size-5 text-muted-foreground" />
        {lib && (
          <Choice
            label={i18n.t("personal.library")}
            value={lib.id}
            options={(libraries.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
            onChange={select}
          />
        )}
        <Button size="sm" onClick={() => setDialog("create")}>
          <IconPlus />
          {i18n.t("personal.create")}
        </Button>
        {lib && (
          <>
            <Button size="sm" variant="outline" onClick={() => setDialog("rename")}>
              {i18n.t("personal.rename")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setDialog("delete")}
            >
              {i18n.t("personal.deleteLibrary")}
            </Button>
          </>
        )}
      </div>
      <ErrorText message={libraries.error ?? notes.error} />
      {!libraries.data && !libraries.error && <p role="status">{i18n.t("personal.loading")}</p>}
      {libraries.data && !lib && (
        <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          {i18n.t("personal.emptyLibraries")}
        </p>
      )}
      {lib && notes.data && <NoteList key={lib.id} library={lib} notes={notes.data} />}
      <BackupTools library={lib} notes={notes.data} onSelect={select} />
      {dialog === "create" && (
        <LibraryDialog onClose={() => setDialog(undefined)} onSelect={select} />
      )}
      {lib && dialog === "rename" && (
        <LibraryDialog library={lib} onClose={() => setDialog(undefined)} onSelect={select} />
      )}
      {lib && dialog === "delete" && (
        <Confirm
          title={i18n.t("personal.deleteLibrary")}
          description={i18n.t("personal.deleteLibraryHelp", [lib.name])}
          confirm={i18n.t("personal.deleteLibrary")}
          destructive
          onClose={() => setDialog(undefined)}
          onConfirm={async () => {
            await personalNotes().deleteLibrary(lib.id)
            setParams({}, { replace: true })
          }}
        />
      )}
    </PageLayout>
  )
}
