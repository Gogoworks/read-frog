import type { Binding, Library, NoteAction } from "../notes/model"
import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { IconArrowRight, IconBook2 } from "@tabler/icons-react"
import { useCallback, useState } from "react"
import { Button } from "@/components/ui/base-ui/button"
import { i18n } from "@/utils/i18n"
import { describeAction, matchFields } from "../notes/model"
import { personalNotes } from "../notes/store"
import { Choice, ErrorText, useNotesQuery, useOperation } from "./shared"

export function LocalConnection({ action }: { action: SelectionToolbarCustomAction }) {
  const [savedAction, setSavedAction] = useState<string>()
  const { data, error } = useNotesQuery(
    useCallback(() => personalNotes().connectionOptions(action.id), [action.id]),
  )
  if (!data) return <ErrorText message={error} />
  return (
    <ConnectionForm
      key={JSON.stringify([action.id, action.outputSchema, data.binding])}
      action={describeAction(action)}
      saved={savedAction === action.id}
      onSaved={(saved) => setSavedAction(saved ? action.id : undefined)}
      {...data}
    />
  )
}

function ConnectionForm({
  action,
  libraries,
  binding,
  saved,
  onSaved,
}: {
  action: NoteAction
  libraries: Library[]
  binding?: Binding
  saved: boolean
  onSaved: (saved: boolean) => void
}) {
  const [libraryId, setLibraryId] = useState(binding?.libraryId ?? "")
  const [mappings, setMappings] = useState(() =>
    (binding?.mappings ?? []).filter((m) => {
      const target = libraries
        .find((l) => l.id === binding?.libraryId)
        ?.fields.find((f) => f.id === m.columnId)
      return target && action.fields.some((f) => f.id === m.fieldId && f.type === target.type)
    }),
  )
  const op = useOperation()
  const selected = libraries.find((l) => l.id === libraryId)
  const libraryOptions = [
    { value: "", label: i18n.t("personal.automatic") },
    ...libraries.map((l) => ({ value: l.id, label: l.name })),
  ]
  const dirty =
    libraryId !== (binding?.libraryId ?? "") ||
    JSON.stringify(mappings) !== JSON.stringify(binding?.mappings ?? [])
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 font-medium">
        <IconBook2 className="size-4" />
        {i18n.t("personal.title")}
      </div>
      <p className="text-sm text-muted-foreground">{i18n.t("personal.connectionHelp")}</p>
      <Choice
        label={i18n.t("personal.library")}
        value={libraryId}
        options={libraryOptions}
        onChange={(id) => {
          setLibraryId(id)
          onSaved(false)
          const next = libraries.find((l) => l.id === id)
          setMappings(next ? matchFields(action, next).mappings : [])
        }}
      />
      {selected && (
        <div className="space-y-2">
          {action.fields.map((f) => {
            const mapped = mappings.find((m) => m.fieldId === f.id)?.columnId ?? ""
            const options = [
              { value: "", label: i18n.t("personal.originalOnly") },
              ...selected.fields
                .filter((c) => c.type === f.type)
                .map((c) => ({
                  value: c.id,
                  label: c.name,
                  disabled: mappings.some((m) => m.columnId === c.id && m.fieldId !== f.id),
                })),
            ]
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span>{f.name}</span>
                <IconArrowRight className="size-4 text-muted-foreground" />
                <Choice
                  label={i18n.t("personal.mapField", [f.name])}
                  value={options.some((o) => o.value === mapped) ? mapped : ""}
                  options={options}
                  onChange={(id) => {
                    onSaved(false)
                    setMappings([
                      ...mappings.filter(
                        (m) =>
                          m.fieldId !== f.id &&
                          action.fields.some((field) => field.id === m.fieldId),
                      ),
                      ...(id ? [{ fieldId: f.id, columnId: id }] : []),
                    ])
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={op.busy || !dirty || (!!selected && !mappings.length)}
          onClick={() =>
            void op.run(async () => {
              if (selected) await personalNotes().connect(action, selected.id, mappings)
              else await personalNotes().disconnect(action.id)
              onSaved(true)
            })
          }
        >
          {i18n.t("personal.saveMapping")}
        </Button>
        <a className="text-sm text-primary underline" href="#/local-notes">
          {i18n.t("personal.manage")}
        </a>
        {saved && (
          <span role="status" className="text-sm text-muted-foreground">
            {i18n.t("personal.mappingSaved")}
          </span>
        )}
      </div>
      {selected && !mappings.length && (
        <p className="text-sm text-muted-foreground">{i18n.t("personal.errors.invalidMapping")}</p>
      )}
      <ErrorText message={op.error} />
    </section>
  )
}
