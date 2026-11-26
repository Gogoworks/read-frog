import type { SaveNotesInput } from "../notes/model"
import type { ActionResult } from "../notes/save"
import { dequal } from "dequal"
import { useRef, useState } from "react"
import { toastManager } from "@/components/ui/base-ui/toast"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { buildCustomActionOptionsRoute } from "@/utils/navigation"
import { prepareSave } from "../notes/save"
import { noteError } from "./messages"

export function usePersonalSave() {
  const busy = useRef(false)
  const retry = useRef<SaveNotesInput | null>(null)
  const [isSaving, setSaving] = useState(false)

  async function save(request: ActionResult) {
    if (busy.current || !request.results.length) return "failed"
    busy.current = true
    setSaving(true)
    try {
      const input = prepareSave(request)
      const previous = retry.current
      if (
        previous &&
        dequal(
          { ...previous, rows: previous.rows.map((r) => r.values) },
          { ...input, rows: input.rows.map((r) => r.values) },
        )
      ) {
        input.rows = previous.rows
      }
      retry.current = input
      const result = await sendMessage("savePersonalNotes", input)
      retry.current = null
      const toast = toastManager.add({
        type: "success",
        title:
          result.count === 1
            ? i18n.t("personal.savedOne", [result.libraryName])
            : i18n.t("personal.saved", [result.count, result.libraryName]),
        actionProps: {
          children: i18n.t("action.openNotebase"),
          onClick: () => {
            toastManager.close(toast)
            void sendMessage("openOptionsPage", {
              route: `/local-notes?library=${result.libraryId}`,
            })
          },
        },
      })
      return "saved"
    } catch (error) {
      toastManager.add({
        type: "error",
        title: noteError(error),
        actionProps: {
          children: i18n.t("action.saveToNotebaseGoConfigure"),
          onClick: () => {
            void sendMessage("openOptionsPage", {
              route: buildCustomActionOptionsRoute(request.action.id, { tab: "notebase" }),
            })
          },
        },
      })
      return "failed"
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return { save, isSaving }
}
