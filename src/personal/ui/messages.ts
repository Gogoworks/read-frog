import { i18n } from "@/utils/i18n"
import { errorKeys } from "../notes/model"

export function noteError(error: unknown) {
  const key = errorKeys.find((candidate) => error instanceof Error && error.message === candidate)
  return key ? i18n.t(`personal.errors.${key}`) : i18n.t("personal.errors.operation")
}
