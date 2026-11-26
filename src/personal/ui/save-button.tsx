import type { ActionResult } from "../notes/save"
import { SaveButtonView } from "@/components/custom-action/save-button-view"
import { getSourceDocumentTitle } from "@/utils/content/document-title"
import { i18n } from "@/utils/i18n"
import { usePersonalSave } from "./use-save"

export function PersonalSaveButton({
  action,
  result,
  failed,
  isRunning,
  selection,
  getNoteOrigin,
}: {
  action: ActionResult["action"]
  result: Record<string, unknown> | null
  failed: boolean
  isRunning: boolean
  selection: string
  getNoteOrigin: () => ActionResult["origin"]
}) {
  const { save, isSaving } = usePersonalSave()
  return (
    <SaveButtonView
      disabled={failed || isRunning || !result || isSaving}
      label={isSaving ? i18n.t("action.saveToNotebaseSaving") : i18n.t("personal.save")}
      onClick={() => {
        if (result)
          void save({
            action,
            results: [result],
            selection,
            origin: getNoteOrigin(),
            pageTitle: getSourceDocumentTitle(),
          })
      }}
    />
  )
}
