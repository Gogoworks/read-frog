// Historical backups used a provider dictionary; current configs use an array.
// Both can have credentials in arbitrarily named headers, request options or an
// endpoint path. Blank required endpoint strings so the file stays importable.
function scrub(value: unknown, providerSettings: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => scrub(item, providerSettings))
  if (value === null || typeof value !== "object") return value
  const entries: [string, unknown][] = []
  for (const [key, item] of Object.entries(value)) {
    if (/^(api[_-]?keys?|accessToken|refreshToken|clientSecret|password)$/i.test(key)) continue
    if (providerSettings && ["headers", "providerOptions"].includes(key)) continue
    const endpoint = providerSettings && /^(baseUrl|url|endpoint)$/i.test(key)
    entries.push([key, endpoint ? "" : scrub(item, providerSettings || key === "providersConfig")])
  }
  return Object.fromEntries(entries)
}

export function portableConfig(config: unknown) {
  return scrub(config, false)
}
