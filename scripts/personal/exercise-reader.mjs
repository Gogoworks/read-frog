import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { mkdir } from "node:fs/promises"
import path from "node:path"

// Model a v1 backup made before the reader existed. No matching live AI action is installed.
function legacyBackup() {
  const time = Date.UTC(2026, 6, 12, 0, 30)
  const fields = [
    ["lead", "一句话"],
    ["points", "重点"],
    ["empty", "解释"],
    ["insight", "门道"],
    ["replies", "回复"],
    ["topics", "选题"],
  ].map(([id, name]) => ({ id, name, type: "string" }))
  const library = {
    id: randomUUID(),
    name: "自然观察笔记",
    fields,
    createdAt: time,
    updatedAt: time,
  }
  const cells = {
    lead: "同一棵树，早晚能听到不同的鸟鸣。",
    points: JSON.stringify([
      { text: "晨鸣", meaning: "日出前后，先用耳朵发现枝头的鸟。" },
      { text: "观察点", meaning: "选定一扇窗，每次从同一个位置记录。" },
    ]),
    empty: null,
    insight: "记下时间，再写听到的声音。\n隔天翻看记录，就能比较同一地点的变化。",
    replies: JSON.stringify([
      { move: "举个例子", text: "今天最先听见三声短鸣，过了一会儿才看见鸟影。" },
    ]),
    topics: JSON.stringify([
      { title: "窗边的七天", angle: "用一周的晨间记录，比较阴天与晴天的鸟鸣。" },
    ]),
  }
  const note = {
    id: randomUUID(),
    libraryId: library.id,
    actionId: "archived-observation",
    actionName: "观察手记",
    cells,
    output: fields.map((f) => ({ ...f, value: cells[f.id] })),
    selection: "天刚亮，窗边的树上就热闹起来了。",
    pageTitle: "公园观察日记",
    origin: { kind: "webpage", url: "https://example.org/field-journal", title: "公园观察日记" },
    createdAt: time,
    updatedAt: time,
  }
  return {
    format: "read-frog-personal-notes",
    version: 1,
    libraries: [library],
    bindings: [],
    notes: [note],
  }
}

export async function exerciseReader({ options, context, jsonBackup, screenshots }) {
  const backup = legacyBackup()
  const [library] = backup.libraries
  const [note] = backup.notes
  await options.locator('input[type=file][accept=".json"]').setInputFiles({
    name: "legacy-notes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  await options.getByRole("alertdialog").getByRole("button", { name: "导入", exact: true }).click()
  await options.getByRole("alertdialog").waitFor({ state: "hidden" })
  await options.getByRole("combobox", { name: "笔记库", exact: true }).click()
  await options.getByRole("option", { name: library.name, exact: true }).click()
  const row = options.getByRole("link", { name: new RegExp(note.cells.lead) })
  assert.ok(!(await row.innerText()).includes("[{"))
  const listUrl = options.url()
  await context.setOffline(true)
  await row.click()
  await options.waitForURL(new RegExp("#/local-notes/" + note.id + "$"))
  const url = options.url()
  const reader = options.getByRole("article", { name: "笔记详情" })
  await reader.getByRole("heading", { level: 1, name: note.cells.lead }).waitFor()
  for (const [name, heading, body, count] of [
    ["重点", "晨鸣", "日出前后，先用耳朵发现枝头的鸟。", 2],
    ["回复", "举个例子", "今天最先听见三声短鸣，过了一会儿才看见鸟影。", 1],
    ["选题", "窗边的七天", "用一周的晨间记录，比较阴天与晴天的鸟鸣。", 1],
  ]) {
    const section = reader.getByRole("region", { name, exact: true })
    assert.equal(await section.getByRole("listitem").count(), count)
    await section.getByText(heading, { exact: true }).waitFor()
    await section.getByText(body, { exact: true }).waitFor()
  }
  assert.equal(await reader.getByRole("textbox").count(), 0)
  assert.equal(await reader.getByRole("heading", { name: "解释", exact: true }).count(), 0)
  await reader.getByText(note.selection, { exact: true }).waitFor()
  assert.equal(
    await reader.getByRole("link", { name: note.pageTitle }).getAttribute("href"),
    note.origin.url,
  )
  const colors = []
  for (const scheme of ["light", "dark"]) {
    await options.emulateMedia({ colorScheme: scheme })
    await options.waitForFunction((s) => document.documentElement.classList.contains(s), scheme)
    await options.evaluate(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await Promise.allSettled(
        document
          .getAnimations()
          .filter((a) => a instanceof CSSTransition)
          .map((a) => a.finished),
      )
    })
    colors.push(await reader.evaluate((el) => getComputedStyle(el).color))
    if (screenshots) {
      await mkdir(screenshots, { recursive: true })
      await options.screenshot({
        path: path.join(screenshots, "note-reader-" + scheme + ".png"),
        animations: "disabled",
      })
    }
  }
  assert.notEqual(colors[0], colors[1])
  const size = options.viewportSize()
  await options.setViewportSize({ width: 430, height: 820 })
  await reader.getByRole("heading", { level: 1 }).waitFor()
  assert.ok(await options.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  assert.ok(await reader.evaluate((el) => el.scrollWidth <= el.clientWidth))
  await options.setViewportSize(size)

  await options.reload()
  await reader.getByRole("heading", { name: note.cells.lead }).waitFor()
  assert.equal(options.url(), url)
  await reader.getByText("原始 AI 输出", { exact: true }).click()
  await reader.locator("details[open]").getByText(note.cells.topics, { exact: true }).waitFor()
  await reader.getByRole("button", { name: "编辑笔记" }).click()
  assert.equal(await options.getByRole("textbox", { name: "解释", exact: true }).inputValue(), "")
  const points = options.getByRole("textbox", { name: "重点", exact: true })
  assert.equal(await points.inputValue(), note.cells.points)
  await points.fill("临时改动")
  await options.getByRole("button", { name: "取消", exact: true }).click()
  await reader.getByText("晨鸣", { exact: true }).first().waitFor()
  await options.getByRole("link", { name: "返回笔记库" }).click()
  await row.waitFor()
  assert.equal(options.url(), listUrl)
  const roundTrip = await jsonBackup()
  assert.deepEqual(
    roundTrip.notes.find((n) => n.id === note.id),
    note,
  )

  const direct = await context.newPage()
  await direct.goto(url)
  await direct.getByRole("heading", { name: note.cells.lead }).waitFor()
  await direct.getByRole("link", { name: "返回笔记库" }).click()
  await direct.getByRole("link", { name: new RegExp(note.cells.lead) }).waitFor()
  assert.equal(direct.url(), listUrl)
  await direct.goto(url.replace(note.id, randomUUID()))
  await direct.getByText("找不到这条笔记或它所属的笔记库。", { exact: true }).waitFor()
  await direct.close()
  await context.setOffline(false)
  console.log(
    "Legacy JSON note read offline in Chinese: three structured sections, themes, narrow layout, refresh, direct link, return, cancel edit and unchanged backup",
  )
}
