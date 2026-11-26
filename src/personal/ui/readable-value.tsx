import type { JsonValue } from "type-fest"
import type { Cells } from "../notes/model"
import { useMemo } from "react"
import { isJsonArray, readCell, readingPair } from "../notes/reading"

function Value({ value }: { value: JsonValue }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  if (typeof value !== "object") return <p className="whitespace-pre-wrap">{String(value)}</p>
  if (isJsonArray(value)) {
    if (!value.length) return <span className="text-muted-foreground">—</span>
    return (
      <ul className="list-disc space-y-3 pl-5 marker:text-muted-foreground/65">
        {value.map((item, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- read-only items have no persistent IDs.
          <li key={index} className="pl-1">
            <Value value={item} />
          </li>
        ))}
      </ul>
    )
  }
  const pair = readingPair(value)
  const entries = Object.entries(value).filter(
    ([key]) => key !== pair?.headingKey && key !== pair?.bodyKey,
  )
  return (
    <div className="space-y-2">
      {pair && (
        <div>
          <strong className="font-semibold whitespace-pre-wrap">{pair.heading}</strong>
          <p className="whitespace-pre-wrap">{pair.body}</p>
        </div>
      )}
      {entries.length > 0 && (
        <dl className="space-y-2 border-l-2 pl-4">
          {entries.map(([label, child]) => (
            <div key={label}>
              <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
              <dd>
                <Value value={child} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {!pair && !entries.length && <span className="text-muted-foreground">—</span>}
    </div>
  )
}

export function ReadableValue({ value }: { value: Cells[string] | undefined }) {
  const parsed = useMemo(() => readCell(value), [value])
  return (
    <div className="min-w-0 leading-7 wrap-anywhere">
      <Value value={parsed} />
    </div>
  )
}
