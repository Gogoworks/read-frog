// Run against a production build, exclusively in a disposable Chrome for Testing profile.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { cp, mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright-core"
import { exerciseManagement } from "./exercise-management.mjs"
import { exerciseReader } from "./exercise-reader.mjs"

const extension = fileURLToPath(new URL("../../.output/chrome-mv3/", import.meta.url))
const manifest = JSON.parse(await readFile(path.join(extension, "manifest.json"), "utf8"))
assert.equal(manifest.name, "Read Frog Personal")
const id = [
  ...createHash("sha256").update(Buffer.from(manifest.key, "base64")).digest("hex").slice(0, 32),
]
  .map((c) => String.fromCharCode(97 + Number.parseInt(c, 16)))
  .join("")
assert.equal(id, "ihfgmajgigafdpkfldmikhmgkifhneff", "Released Personal ID must remain stable")
assert.notEqual(id, "modkelfkcfjpgbfmnbnllalkiogfofhb")
const profile = await mkdtemp(path.join(tmpdir(), "read-frog-personal-chrome-"))
const token = "offline-fixture-only"
const calls = []
const server = createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Headers", "*")
  if (req.method === "OPTIONS" || req.url === "/favicon.ico") {
    res.writeHead(204).end()
    return
  }
  if (req.url === "/article") {
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.end(
      '<title>Field notebook fixture</title><main style="margin:120px;font:24px sans-serif"><p>Amphibian habitats.</p><p>Second specimen.</p></main>',
    )
    return
  }
  if (req.method === "POST") console.log("Fixture received", req.url)
  if (req.method !== "POST") {
    res.writeHead(404).end()
    return
  }
  let raw = ""
  for await (const chunk of req) raw += chunk
  const payload = JSON.parse(raw)
  const isGoogle = req.url.includes(":streamGenerateContent")
  if (!isGoogle && req.url !== "/v1/responses") {
    res.writeHead(404).end()
    return
  }
  const provider = isGoogle ? "Gemini" : "OpenAI"
  assert.equal(
    isGoogle ? req.headers["x-goog-api-key"] : req.headers.authorization,
    isGoogle ? token : "Bearer " + token,
  )
  calls.push({ provider, path: req.url, payload })
  const schema = payload.text?.format?.schema
  let answer = JSON.stringify({ Meaning: provider + " fixture result", Score: 42 })
  if (schema?.properties?.summaryFieldName) {
    answer = JSON.stringify({
      summaryFieldName: "Meaning",
      notes: ["land", "water"].map((habitat, i) => ({
        fields: [
          { name: "Meaning", value: habitat },
          { name: "Score", value: i + 1 },
        ],
      })),
    })
  } else if (!isGoogle && !schema) {
    answer = "两栖动物。"
  }
  const msg = { type: "message", id: "msg_local", role: "assistant", content: [] }
  const events = isGoogle
    ? [
        {
          candidates: [
            {
              content: { role: "model", parts: [{ text: answer }] },
              finishReason: "STOP",
              index: 0,
            },
          ],
        },
      ]
    : [
        {
          type: "response.created",
          response: {
            id: "resp_local",
            created_at: 1700000000,
            model: "local-openai",
            service_tier: "default",
          },
        },
        { type: "response.output_item.added", output_index: 0, item: msg },
        {
          type: "response.output_text.delta",
          item_id: msg.id,
          output_index: 0,
          content_index: 0,
          delta: answer,
        },
        {
          type: "response.output_item.done",
          output_index: 0,
          item: { ...msg, content: [{ type: "output_text", text: answer, annotations: [] }] },
        },
        {
          type: "response.completed",
          response: { status: "completed", usage: { input_tokens: 4, output_tokens: 10 } },
        },
      ]
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" })
  res.end(events.map((v) => "data: " + JSON.stringify(v) + "\n\n").join(""))
})
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
const serverUrl = "http://127.0.0.1:" + server.address().port
const articleUrl = "http://reading.personal.test:" + server.address().port + "/article"
const optionsUrl = `chrome-extension://${id}/options.html#`
const errors = []
const consoleErrors = new Set()
let context, options, article
async function launch(paths = extension) {
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.CHROME_FOR_TESTING_EXECUTABLE || chromium.executablePath(),
    headless: true,
    locale: "en-US",
    viewport: { width: 1350, height: 950 },
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--load-extension=${paths}`,
      `--disable-extensions-except=${paths}`,
      "--no-proxy-server",
      "--disable-background-networking",
      "--host-resolver-rules=MAP reading.personal.test 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    ],
  })
  context.setDefaultTimeout(10000)
  context.on("console", (message) => {
    if (message.type() === "error") {
      const url = message.location().url.split(/[?#]/)[0]
      consoleErrors.add(message.text().slice(0, 220) + " " + url)
    }
  })
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)))
  const isPersonalWorker = (worker) => worker.url().startsWith(`chrome-extension://${id}/`)
  const worker =
    context.serviceWorkers().find(isPersonalWorker) ??
    (await context.waitForEvent("serviceworker", isPersonalWorker))
  options = await context.newPage()
  await options.goto(optionsUrl + "/local-notes")
  await options.getByRole("heading", { name: /^(Local notes|本地笔记)$/ }).waitFor()
  return worker
}
async function jsonBackup() {
  const download = options.waitForEvent("download")
  await options
    .getByRole("button", { name: /^(?:Back up all notebooks \(JSON\)|备份全部笔记库（JSON）)$/ })
    .click()
  return JSON.parse(await readFile(await (await download).path(), "utf8"))
}

try {
  await launch()
  context.on("requestfailed", (req) => {
    if (req.url().includes("127.0.0.1") || req.url().includes("personal.test"))
      console.error("Local request failed", req.url(), req.failure()?.errorText)
  })
  const session = await context.newCDPSession(options)
  console.log("Chrome", (await session.send("Browser.getVersion")).product, "extension", id)
  await options.goto(optionsUrl + "/preference")
  const config = await options.evaluate(
    async () => (await chrome.storage.local.get("config")).config,
  )
  assert.ok(config?.selectionToolbar)
  config.uiLanguage = "en"
  const bodies = [
    ["openai", "OpenAI"],
    ["google", "Gemini"],
  ]
  const fixtureAction = (provider, label) => {
    return {
      id: "personal-test-" + provider,
      name: "Study " + label,
      enabled: true,
      icon: "tabler:book",
      providerId: provider + "-default",
      prompt: "Use the selected word {{selection}}.",
      systemPrompt: "Return the requested fields.",
      outputSchema: [
        { id: "word", name: "Word", type: "string", description: "", source: "selection" },
        { id: "sense", name: "Meaning", type: "string", description: "meaning" },
        { id: "score", name: "Score", type: "number", description: "score" },
      ],
    }
  }
  for (const [provider, label] of bodies) {
    let cfg = config.providersConfig.find((p) => p.id === provider + "-default")
    if (!cfg) {
      cfg = {
        id: provider + "-default",
        provider,
        name: label,
        model: { model: provider === "google" ? "gemini-3.5-flash-lite" : "gpt-6-luna" },
      }
      config.providersConfig.push(cfg)
    }
    Object.assign(cfg, {
      enabled: true,
      apiKey: "",
      baseURL: "",
      model: { ...cfg.model, isCustomModel: true, customModel: "local-" + provider },
    })
    const action = fixtureAction(provider, label)
    config.selectionToolbar.customActions.push(action)
    config.selectionToolbar.order.unshift(action.id)
  }
  config.selectionToolbar.features.translate.providerId = "openai-default"
  config.selectionToolbar.noteSuggestion = {
    enabled: true,
    actionId: "personal-test-openai",
    providerId: "openai-default",
  }
  const meta = await options.evaluate(
    async () => (await chrome.storage.local.get("configMeta")).configMeta,
  )
  const version =
    meta?.schemaVersion ??
    Number(
      (
        await readFile(new URL("../../src/utils/constants/config.ts", import.meta.url), "utf8")
      ).match(/CONFIG_SCHEMA_VERSION = (\d+)/)[1],
    )
  await options.locator("#import-config-file").setInputFiles({
    name: "official-config.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: version, config })),
  })
  await options.waitForFunction(async () =>
    (await chrome.storage.local.get("config")).config?.selectionToolbar.customActions.some(
      (a) => a.name === "Study OpenAI",
    ),
  )
  console.log("Imported settings through the upstream configuration screen")
  for (const [provider] of bodies) {
    const providerId = provider + "-default"
    const baseURL = serverUrl + (provider === "google" ? "/v1beta" : "/v1")
    await options.goto(optionsUrl + "/api-providers?provider=" + providerId)
    await options.locator("input[type=password]").fill(token)
    const urlInput = options.getByRole("textbox", { name: /Base URL/i })
    await urlInput.fill(baseURL)
    await urlInput.press("Tab")
    await options.waitForFunction(
      async ({ id: target, key, url }) => {
        const p = (await chrome.storage.local.get("config")).config.providersConfig.find(
          (v) => v.id === target,
        )
        return p?.apiKey === key && p?.baseURL === url
      },
      { id: providerId, key: token, url: baseURL },
    )
  }
  console.log("Configured OpenAI and Gemini through their provider editors")

  for (const [, label] of bodies) {
    article = await context.newPage()
    await article.goto(articleUrl)
    // First load injects the content UI asynchronously. Wait for its host before selecting.
    await article.waitForFunction(() =>
      [...document.querySelectorAll("*")].some(
        (el) => el.tagName.toLowerCase().includes("read-frog") || el.id.includes("read-frog"),
      ),
    )
    const paragraph = article.getByText("Amphibian habitats.", { exact: true })
    await paragraph.dblclick({ position: { x: 24, y: 9 } })
    await article.getByRole("button", { name: "Study " + label, exact: true }).click()
    await article
      .getByText(label + " fixture result", { exact: true })
      .first()
      .waitFor()
    const save = article.getByRole("button", { name: "Save to local notes", exact: true })
    await context.setOffline(true)
    await save.click()
    await article.getByText(`Saved 1 note to “Study ${label}”.`, { exact: true }).first().waitFor()
    const webSession = await context.newCDPSession(article)
    const { databaseNames } = await webSession.send("IndexedDB.requestDatabaseNames", {
      securityOrigin: new URL(articleUrl).origin,
    })
    assert.ok(!databaseNames.includes("read-frog-personal-notes"))
    await webSession.detach()
    const targetTab = context.waitForEvent("page")
    await article.getByRole("button", { name: "Open Notebase", exact: true }).click()
    const notebook = await targetTab
    await notebook
      .getByRole("combobox", { name: "Notebook", exact: true })
      .getByText("Study " + label)
      .waitFor()
    assert.match(notebook.url(), /#\/local-notes\?library=/)
    await notebook.close()
    await context.setOffline(false)
    await article.close()
    article = undefined
    console.log(label, "structured response rendered and saved with network offline")
  }
  assert.deepEqual(
    calls.map((c) => c.provider),
    ["OpenAI", "Gemini"],
  )
  assert.ok(
    calls.every(
      (c) =>
        JSON.stringify(c.payload).includes("Amphibian") &&
        JSON.stringify(c.payload).includes("Meaning"),
    ),
  )
  await options.goto(optionsUrl + "/local-notes")
  const data = await jsonBackup()
  assert.equal(data.notes.length, 2)
  assert.equal(data.libraries.length, 2)
  for (const note of data.notes) {
    assert.equal(note.selection, "Amphibian")
    assert.equal(note.origin.url, articleUrl)
    assert.equal(note.pageTitle, "Field notebook fixture")
    assert.equal(note.output.find((f) => f.name === "Score").value, 42)
  }
  assert.ok(!JSON.stringify(data).includes(token))
  console.log("Source, selection, original typed fields and credential-free JSON verified")
  article = await context.newPage()
  await article.goto(articleUrl)
  await article.waitForFunction(() =>
    [...document.querySelectorAll("*")].some(
      (el) => el.tagName.toLowerCase().includes("read-frog") || el.id.includes("read-frog"),
    ),
  )
  await article
    .getByText("Amphibian habitats.", { exact: true })
    .dblclick({ position: { x: 24, y: 9 } })
  await article.getByRole("button", { name: "Translation", exact: true }).click()
  await article.getByText("两栖动物。", { exact: true }).first().waitFor()
  const suggestions = article.locator('[data-slot="note-suggestion-card"]')
  await suggestions.getByText("You might want to save").waitFor()
  assert.equal(await suggestions.getByRole("checkbox").count(), 2)
  const second = suggestions.getByRole("checkbox").nth(1)
  await second.click()
  assert.equal(await second.isChecked(), false)
  await second.click()
  await context.setOffline(true)
  await suggestions.getByRole("button", { name: "Save", exact: true }).click()
  await suggestions.getByRole("button", { name: "Saved", exact: true }).waitFor()
  const withSuggestions = await jsonBackup()
  assert.equal(withSuggestions.notes.length, 4)
  const suggestionRows = withSuggestions.notes.filter((n) =>
    ["water", "land"].includes(n.output.find((f) => f.name === "Meaning")?.value),
  )
  assert.equal(suggestionRows.length, 2)
  assert.ok(
    suggestionRows.every(
      (n) =>
        n.actionId === "personal-test-openai" &&
        n.selection === "Amphibian" &&
        n.origin.url === articleUrl,
    ),
  )
  await context.setOffline(false)
  await article.close()
  article = undefined
  console.log(
    "Selection translation and two checked note suggestions saved offline through the page UI",
  )
  const finalData = await exerciseManagement({ options, optionsUrl, context, jsonBackup, token })
  assert.equal(finalData.notes.length, 105)
  await context.close()
  await launch()
  assert.deepEqual(await jsonBackup(), finalData)
  console.log("Notes and mappings survived a complete browser process restart")
  await options.evaluate(async () => {
    const { config: settings } = await chrome.storage.local.get("config")
    await chrome.storage.local.set({ config: { ...settings, uiLanguage: "zh-CN" } })
  })
  await options.reload()
  await options.getByRole("heading", { name: "本地笔记", exact: true }).waitFor()
  await options.getByRole("button", { name: "新建笔记库" }).waitFor()
  console.log("Simplified Chinese notes UI verified")
  await exerciseReader({
    options,
    context,
    jsonBackup,
    screenshots: process.env.PERSONAL_SMOKE_SCREENSHOTS,
  })
  assert.deepEqual(errors, [])
  if (process.env.READ_FROG_OFFICIAL_PACKAGE) {
    await context.close()
    const official = path.join(profile, "official-package")
    // Only public extension files are copied. Chrome's signed-store transport
    // metadata is reserved in an unpacked extension.
    await cp(process.env.READ_FROG_OFFICIAL_PACKAGE, official, {
      recursive: true,
      filter: (p) => path.basename(p) !== "_metadata",
    })
    await launch([extension, official].join(","))
    await options.evaluate(() => chrome.storage.local.set({ personalCoexistenceFixture: true }))
    const officialOptions = await context.newPage()
    const officialId = "modkelfkcfjpgbfmnbnllalkiogfofhb"
    await officialOptions.goto(`chrome-extension://${officialId}/options.html`)
    await officialOptions.getByRole("main").waitFor()
    const actual = await officialOptions.evaluate(async () => ({
      id: chrome.runtime.id,
      version: chrome.runtime.getManifest().version,
      marker: await chrome.storage.local.get("personalCoexistenceFixture"),
      databases: (await indexedDB.databases()).map((db) => db.name),
    }))
    assert.equal(actual.id, officialId)
    assert.deepEqual(actual.marker, {})
    assert.ok(!actual.databases.includes("read-frog-personal-notes"))
    assert.equal(await options.evaluate(() => chrome.runtime.id), id)
    await options.getByRole("button", { name: "备份全部笔记库（JSON）" }).waitFor()
    console.log("Official", actual.version, "and Personal loaded together with separate storage")
  }
  for (const message of consoleErrors) console.log("Browser console:", message)
  console.log("PASS")
} catch (error) {
  if (context) {
    for (const p of [article, options].filter(Boolean)) {
      if (!p.isClosed())
        console.error(
          p.url(),
          (
            await p
              .locator("body")
              .ariaSnapshot({ timeout: 1500 })
              .catch(() => "")
          ).slice(-5000),
        )
    }
    console.error(
      "Mock calls:",
      calls.map((c) => c.path),
      "Page errors:",
      errors,
    )
  }
  throw error
} finally {
  await context?.close()
  await new Promise((resolve) => server.close(resolve))
  await rm(profile, { recursive: true, force: true })
}
