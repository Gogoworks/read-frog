import type { NoteOriginInput } from "@read-frog/definitions"
import type { SurfaceByFeature } from "@/types/analytics"
import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { authClient } from "@/utils/auth/auth-client"
import { i18n } from "@/utils/i18n"
import { sanitizeCustomActionNotebaseConnection } from "@/utils/notebase/connection"
import { SaveButtonView } from "./save-button-view"
import { useSaveToNotebase } from "./use-save-to-notebase"

export function SaveToNotebaseButton({
  action,
  failed,
  isRunning,
  result,
  surface,
  getNoteOrigin,
}: {
  action: SelectionToolbarCustomAction
  /** The run ended in an error: `result` is only what streamed before it, so it is not saved. */
  failed: boolean
  isRunning: boolean
  result: Record<string, unknown> | null
  surface: SurfaceByFeature["note_save"]
  /** Where the note came from, read when the save starts. */
  getNoteOrigin?: () => NoteOriginInput | null
}) {
  const connection = sanitizeCustomActionNotebaseConnection(
    action.notebaseConnection,
    action.outputSchema,
  )
  const { isPending: isSessionPending } = authClient.useSession()
  const { save, isSaving, isAuthenticated, hasCurrentAccount } = useSaveToNotebase()

  const handleClick = () => {
    if (!result) {
      return
    }

    void save({ action, results: [result], surface, origin: getNoteOrigin?.() ?? null })
  }

  const isDisabled = connection
    ? isSessionPending ||
      isRunning ||
      failed ||
      !result ||
      (isAuthenticated && !hasCurrentAccount) ||
      isSaving
    : isSessionPending || isRunning || failed || !result
  const label =
    connection && isSaving ? i18n.t("action.saveToNotebaseSaving") : i18n.t("action.saveToNotebase")

  return <SaveButtonView disabled={isDisabled} label={label} onClick={handleClick} />
}
