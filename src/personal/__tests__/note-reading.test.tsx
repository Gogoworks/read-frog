// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { cellPreview, hasCellContent, readCell } from "../notes/reading"
import { ReadableValue } from "../ui/readable-value"

afterEach(cleanup)

describe("saved note reading view", () => {
  it.each([
    { entry: { text: "晨鸣", meaning: "清晨的鸟鸣" }, heading: "晨鸣", body: "清晨的鸟鸣" },
    { entry: { move: "举例", text: "可以先听声音。" }, heading: "举例", body: "可以先听声音。" },
    {
      entry: { title: "观察日记", angle: "记录声音变化" },
      heading: "观察日记",
      body: "记录声音变化",
    },
  ])("formats $heading as a titled item in either field order", ({ entry, heading, body }) => {
    const reversed = Object.fromEntries(Object.entries(entry).reverse())
    const value = JSON.stringify([reversed])
    render(<ReadableValue value={value} />)
    const item = within(screen.getByRole("listitem"))
    expect(item.getByText(heading).tagName).toBe("STRONG")
    expect(item.getByText(body).tagName).toBe("P")
    expect(cellPreview(value)).toBe([heading, body].join(" · "))
  })

  it("retains extra and unfamiliar fields, array order and scalar values", () => {
    render(
      <ReadableValue
        value={JSON.stringify([
          { text: "石子", meaning: "一块小石头", 补充: { 数量: 0, 已确认: false } },
          { 自拟字段: ["先", "后", null] },
        ])}
      />,
    )
    expect(screen.getByText("补充").tagName).toBe("DT")
    expect(screen.getByText("0")).toBeTruthy()
    expect(screen.getByText("false")).toBeTruthy()
    expect(screen.getByText("自拟字段").tagName).toBe("DT")
    const leaves = screen.getAllByRole("listitem").filter((item) => !item.querySelector("dl"))
    expect(leaves.map((li) => li.textContent)).toEqual(["先", "后", "—"])
  })

  it("reads complete fenced JSON and leaves incomplete or ordinary text verbatim", () => {
    const fence = String.fromCharCode(96).repeat(3)
    expect(readCell([fence + "json", '["水","土"]', fence].join("\n"))).toEqual(["水", "土"])
    for (const literal of ['[{"word":', "  第一段\n第二段  ", "[1] is one list", '"0123"']) {
      expect(readCell(literal)).toBe(literal)
    }
  })

  it("displays markup as literal text even in a structured entry", () => {
    const literal = "<em>原文</em>"
    const { container } = render(
      <ReadableValue value={JSON.stringify([{ text: literal, meaning: "引用" }])} />,
    )
    expect(screen.getByText(literal)).toBeTruthy()
    expect(container.querySelector("em")).toBeNull()
  })

  it("keeps the original digits in large numeric identifiers and measured values", () => {
    render(<ReadableValue value='{"序号":12345678901234567890,"读数":1.2300}' />)
    expect(screen.getByText("12345678901234567890")).toBeTruthy()
    expect(screen.getByText("1.2300")).toBeTruthy()
  })

  it("preserves long and deeply nested JSON verbatim", () => {
    for (const text of [
      "[".repeat(20) + "0" + "]".repeat(20),
      JSON.stringify(["x".repeat(100_000)]),
    ]) {
      expect(readCell(text)).toBe(text)
    }
  })

  it("treats zero as content and preserves empty cells for editing", () => {
    expect([null, undefined, " \n "].map(hasCellContent)).toEqual([false, false, false])
    expect([0, "0", "正文"].map(hasCellContent)).toEqual([true, true, true])
    expect(cellPreview(0)).toBe("0")
  })
})
