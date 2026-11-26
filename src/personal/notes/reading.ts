import type { JsonArray, JsonObject, JsonValue } from "type-fest"
import type { Cells } from "./model"

export function isJsonArray(value: JsonValue): value is JsonArray {
  return Array.isArray(value)
}

function fitsReadingView(value: JsonValue, depth: number): boolean {
  if (value === null || typeof value !== "object") return true
  return depth < 12 && Object.values(value).every((child) => fitsReadingView(child, depth + 1))
}

// Interpret only a complete JSON object or array. Literal prose, including its
// original newlines, survives a failed parse. Very large trees stay as text.
export function readCell(value: Cells[string] | undefined): JsonValue {
  if (typeof value !== "string") return value ?? null
  const trimmed = value.trim()
  if (trimmed.length > 100_000) return value
  const candidate = /^```(?:json)?\s*\n([\s\S]*)\n\s*```$/i.exec(trimmed)?.[1]?.trim() ?? trimmed
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) return value
  try {
    const parsed: JsonValue = JSON.parse(
      candidate,
      (_key, child: JsonValue, context?: { source?: string }) => {
        // Keep the digits the author saved when JavaScript rounds an ID or normalizes a decimal.
        if (typeof child === "number" && context?.source && String(child) !== context.source)
          return context.source
        return child
      },
    )
    return fitsReadingView(parsed, 0) ? parsed : value
  } catch {
    return value
  }
}

const entryPairs = [
  ["text", "meaning"],
  ["move", "text"],
  ["title", "angle"],
] as const

export function readingPair(value: JsonObject) {
  for (const [headingKey, bodyKey] of entryPairs) {
    const heading = value[headingKey]
    const body = value[bodyKey]
    if (typeof heading === "string" && typeof body === "string")
      return { headingKey, bodyKey, heading, body }
  }
  return null
}

function summary(value: JsonValue): string {
  if (value === null) return ""
  if (typeof value !== "object") return String(value).trim()
  if (isJsonArray(value)) {
    return value.slice(0, 2).map(summary).filter(Boolean).join(" · ")
  }
  const pair = readingPair(value)
  const values = pair ? [pair.heading, pair.body] : Object.values(value).slice(0, 2)
  return values.map(summary).filter(Boolean).join(" · ")
}

export function cellPreview(value: Cells[string] | undefined) {
  return summary(readCell(value))
}

export function hasCellContent(value: Cells[string] | undefined) {
  return (
    value !== null && value !== undefined && (typeof value !== "string" || value.trim().length > 0)
  )
}
