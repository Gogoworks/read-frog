import { describe, expect, it } from "vitest"
import { portableConfig } from "../config-export"

describe("portable settings", () => {
  it.each(["list", "dictionary"])("removes credentials from the %s provider format", (format) => {
    const provider = {
      apiKey: "private",
      model: "example",
      headers: { custom: "private" },
      url: "https://host/private",
      baseURL: "https://private@host",
      providerOptions: { vendor: { body: "private" } },
    }
    const config = {
      providersConfig: format === "list" ? [provider] : { openai: provider },
      selectionToolbar: { customActions: [{ id: "a", prompt: "Study {{selection}}" }] },
    }
    const clean = portableConfig(config)
    expect(clean).toMatchObject({ selectionToolbar: config.selectionToolbar })
    expect(JSON.stringify(clean)).not.toContain("private")
    expect(JSON.stringify(clean)).toContain("example")
    expect(provider.apiKey).toBe("private")
  })
})
