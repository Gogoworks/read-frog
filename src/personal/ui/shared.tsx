import { liveQuery } from "dexie"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/base-ui/select"
import { noteError } from "./messages"

// Dexie broadcasts commits between the worker and options tabs. A new query
// never renders rows from the previously selected library.
export function useNotesQuery<T>(read: () => Promise<T>): { data?: T; error?: string } {
  const query = useMemo(() => liveQuery(read), [read])
  const [result, setResult] = useState<{ query: typeof query; data?: T; error?: string }>()
  useEffect(() => {
    const sub = query.subscribe({
      next: (data) => setResult({ query, data }),
      error: (error) => setResult({ query, error: noteError(error) }),
    })
    return () => sub.unsubscribe()
  }, [query])
  return result?.query === query ? result : {}
}

export function useOperation() {
  const active = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function run(operation: () => Promise<unknown>) {
    if (active.current) return
    active.current = true
    setBusy(true)
    setError("")
    try {
      await operation()
    } catch (cause) {
      setError(noteError(cause))
    } finally {
      active.current = false
      setBusy(false)
    }
  }
  return { busy, error, run }
}

export function Choice({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: { value: string; label: string; disabled?: boolean }[]
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Select
      items={options}
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        if (v !== null) onChange(v)
      }}
    >
      <SelectTrigger aria-label={label} className="max-w-full min-w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ErrorText({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null
}
