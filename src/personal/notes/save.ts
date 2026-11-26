import type { NoteOrigin, SaveNotesInput } from "./model"
import type { SelectionToolbarCustomAction } from "@/types/config/selection-toolbar"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { describeAction, outputValues } from "./model"

export interface ActionResult {
  action: SelectionToolbarCustomAction
  results: Record<string, unknown>[]
  selection: string
  origin: NoteOrigin
  pageTitle: string
}

export function prepareSave(request: ActionResult): SaveNotesInput {
  const action = describeAction(request.action)
  return {
    action,
    selection: request.selection,
    origin: request.origin,
    pageTitle: request.pageTitle,
    rows: request.results.map((result) => ({
      id: getRandomUUID(),
      values: outputValues(action.fields, result),
    })),
  }
}
