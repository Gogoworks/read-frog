import assert from "node:assert/strict"
import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

export async function exerciseManagement({ options, optionsUrl, context, jsonBackup, token }) {
  const button = (text) => options.getByRole("button", { name: text, exact: true })
  const choose = async (label, item) => {
    await options.getByRole("combobox", { name: label, exact: true }).click()
    await options.getByRole("option", { name: item, exact: true }).click()
  }

  await options.goto(optionsUrl + "/custom-actions?addAction=1")
  await options.getByRole("dialog", { name: "Choose a template" }).waitFor()
  await options.getByRole("dialog").getByRole("button", { name: /Blank/ }).click()
  const name = options.getByRole("textbox", { name: "Name", exact: true })
  await name.fill("Field study template")
  await name.press("Tab")
  await options.waitForFunction(async () =>
    (await chrome.storage.local.get("config")).config.selectionToolbar.customActions.some(
      (a) => a.name === "Field study template",
    ),
  )
  console.log("Created an action from a template and persisted a name edit in the options editor")

  await options.goto(optionsUrl + "/preference")
  const configDownload = options.waitForEvent("download")
  await button("Export").click()
  const configFile = JSON.parse(await readFile(await (await configDownload).path(), "utf8"))
  assert.ok(!JSON.stringify(configFile).includes(token))
  assert.ok(
    configFile.config.selectionToolbar.customActions.some((a) => a.name === "Field study template"),
  )
  await options.goto(optionsUrl + "/local-notes")
  await button("New notebook").click()
  await options.getByRole("textbox", { name: "Notebook name" }).fill("Field Lab")
  await options.getByRole("textbox", { name: "Field 1" }).fill("Gloss")
  await button("Add field").click()
  await options.getByRole("textbox", { name: "Field 2" }).fill("Rank")
  await options.getByRole("combobox", { name: "Field type" }).last().click()
  await options.getByRole("option", { name: "Number", exact: true }).click()
  await button("Save").click()
  await button("Rename notebook").click()
  await options.getByRole("textbox", { name: "Notebook name" }).fill("Field Notes")
  await button("Save").click()
  await options
    .getByRole("combobox", { name: "Notebook", exact: true })
    .getByText("Field Notes")
    .waitFor()

  await options.goto(optionsUrl + "/custom-actions?actionId=personal-test-google&tab=notebase")
  await choose("Notebook", "Field Notes")
  await choose("Column for Meaning", "Gloss")
  await choose("Column for Score", "Rank")
  await button("Save mapping").click()
  await options.waitForFunction(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("read-frog-personal-notes")
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    try {
      const binding = await new Promise((resolve) => {
        const r = db.transaction("bindings").objectStore("bindings").get("personal-test-google")
        r.onsuccess = () => resolve(r.result)
      })
      return binding?.mappings?.length === 2
    } finally {
      db.close()
    }
  })
  await options.goto(optionsUrl + "/local-notes")
  await choose("Notebook", "Field Notes")

  // Same worker message used by the single-save button and the multi-select
  // suggestion card. Use explicit batch boundaries for the 11th and 100th notes.
  await context.setOffline(true)
  for (const [first, last] of [
    [1, 10],
    [11, 11],
    [12, 100],
  ]) {
    const result = await options.evaluate(
      async ({ first: start, last: end }) => {
        const rows = Array.from({ length: end - start + 1 }, (_, i) => ({
          id: crypto.randomUUID(),
          values: { word: "sample", sense: "Entry " + (start + i), score: start + i },
        }))
        const payload = {
          action: {
            id: "personal-test-google",
            name: "Study Gemini",
            fields: [
              { id: "word", name: "Word", type: "string" },
              { id: "sense", name: "Meaning", type: "string" },
              { id: "score", name: "Score", type: "number" },
            ],
          },
          rows,
          selection: "Batch selection",
          origin: {
            kind: "webpage",
            url: "https://example.org/collection",
            title: "Batch fixture",
          },
          pageTitle: "Batch fixture",
        }
        const reply = await chrome.runtime.sendMessage({
          id: start,
          type: "savePersonalNotes",
          data: payload,
          timestamp: Date.now(),
        })
        if (reply.err) throw new Error(reply.err.message)
        return reply.res
      },
      { first, last },
    )
    assert.equal(result.count, last - first + 1)
    assert.equal(result.libraryName, "Field Notes")
    await options.getByText(last + " notes", { exact: true }).waitFor()
  }
  console.log(
    "Real IndexedDB accepted notes 11 and 100 offline; the open settings tab updated from the worker",
  )
  await context.setOffline(false)

  const search = options.getByRole("textbox", { name: "Search notes" })
  await search.fill("Entry 100")
  await options.getByText("1 note", { exact: true }).waitFor()
  await options.getByRole("link", { name: /Entry 100/ }).click()
  await options.waitForURL(/#\/local-notes\/[\da-f-]{36}$/)
  const reader = options.getByRole("article", { name: "Note details" })
  await reader.getByText("Batch selection", { exact: true }).waitFor()
  assert.equal(await reader.getByRole("textbox").count(), 0)
  await options.getByText("Original AI output", { exact: true }).click()
  await button("Edit note").click()
  await options.getByRole("textbox", { name: "Gloss" }).fill("Edited specimen")
  await button("Save").click()
  await reader.getByRole("heading", { name: "Edited specimen" }).waitFor()
  await options.getByRole("link", { name: "Back to notebook" }).click()
  await search.waitFor()
  assert.equal(await search.inputValue(), "Entry 100")
  await search.fill("Edited specimen")
  await options.getByRole("link", { name: /Edited specimen/ }).waitFor()
  await search.fill("")
  await choose("Sort by creation time", "Oldest first")
  await button("Next").click()
  const laterRow = options.getByRole("main").locator('a[href*="#/local-notes/"]').nth(20)
  const laterHref = await laterRow.getAttribute("href")
  await laterRow.click()
  await reader.waitFor()
  await options.goBack()
  await options.getByText("2 / 4", { exact: true }).waitFor()
  assert.equal(await laterRow.getAttribute("href"), laterHref)
  await button("Previous").click()
  const csvEvent = options.waitForEvent("download")
  await button("Export notebook CSV").click()
  const csv = await readFile(await (await csvEvent).path(), "utf8")
  assert.ok(csv.startsWith('\uFEFF"Gloss","Rank"'))
  assert.ok(csv.includes('"Edited specimen","100"'))
  const backup = await jsonBackup()
  assert.equal(backup.notes.length, 104)
  const target = backup.libraries.find((l) => l.name === "Field Notes")
  assert.equal(backup.notes.filter((n) => n.libraryId === target.id).length, 100)

  // The verified JSON contains every synthetic row before exercising deletion.
  await search.fill("Edited specimen")
  await options.getByRole("link", { name: /Edited specimen/ }).click()
  await button("Delete note").click()
  await options.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click()
  await button("Delete note").click()
  await options.getByRole("alertdialog").getByRole("button", { name: "Delete note" }).click()
  await search.fill("")
  await options.getByText("99 notes", { exact: true }).waitFor()
  await button("Delete notebook").click()
  await options.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click()
  await button("Delete notebook").click()
  await options.getByRole("alertdialog").getByRole("button", { name: "Delete notebook" }).click()
  const chooseBackup = async (document) => {
    await options.locator('input[type=file][accept=".json"]').setInputFiles({
      name: "restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(document)),
    })
  }
  const restore = async () => {
    await chooseBackup(backup)
    await options
      .getByRole("alertdialog")
      .getByRole("button", { name: "Import", exact: true })
      .click()
    await options.getByRole("alertdialog").waitFor({ state: "hidden" })
  }
  await restore()
  await restore()
  assert.deepEqual(await jsonBackup(), backup)
  await chooseBackup({ ...backup, version: 999 })
  await options
    .getByRole("alert")
    .getByText("This file is not a supported Read Frog Personal notes backup.")
    .waitFor()
  const conflict = structuredClone(backup)
  conflict.notes[0].selection += " changed in another copy"
  await chooseBackup(conflict)
  const conflictDialog = options.getByRole("alertdialog")
  await conflictDialog.getByRole("button", { name: "Import", exact: true }).click()
  await conflictDialog.getByRole("alert").waitFor()
  await conflictDialog.getByRole("button", { name: "Cancel", exact: true }).click()
  assert.deepEqual(await jsonBackup(), backup)
  await options.locator('input[type=file][accept=".csv"]').setInputFiles({
    name: "Official.csv",
    mimeType: "text/csv",
    buffer: Buffer.from('\uFEFF"Word","Meaning"\r\n"蛙","amphibian"'),
  })
  await options
    .getByRole("alertdialog")
    .getByRole("button", { name: "Import", exact: true })
    .click()
  await options.getByRole("link", { name: /蛙/ }).waitFor()
  for (const scheme of ["dark", "light"]) {
    await options.emulateMedia({ colorScheme: scheme })
    await options.waitForFunction((s) => document.documentElement.classList.contains(s), scheme)
    await options.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const transitions = document.getAnimations().filter((a) => a instanceof CSSTransition)
      await Promise.allSettled(transitions.map((a) => a.finished))
    })
    const fg = await options
      .getByRole("heading", { name: "Local notes", exact: true })
      .evaluate((el) => getComputedStyle(el).color)
    assert.ok(fg)
    if (process.env.PERSONAL_SMOKE_SCREENSHOTS) {
      await mkdir(process.env.PERSONAL_SMOKE_SCREENSHOTS, { recursive: true })
      await options.screenshot({
        animations: "disabled",
        path: path.join(process.env.PERSONAL_SMOKE_SCREENSHOTS, "notes-" + scheme + ".png"),
      })
    }
    if (scheme === "dark")
      await options.evaluate((c) => (document.body.dataset.testDarkColor = c), fg)
    else assert.notEqual(fg, await options.evaluate(() => document.body.dataset.testDarkColor))
  }
  const popup = await context.newPage()
  await popup.goto(optionsUrl.split("/options.html")[0] + "/popup.html")
  await popup.getByRole("button").first().waitFor()
  await popup.close()
  console.log(
    "Mapped text/number columns; verified CRUD, search, sort, light/dark colors, popup, CSV, restore and duplicate import",
  )
  return await jsonBackup()
}
