import assert from "node:assert/strict"
import { readdir } from "node:fs/promises"

// Run only in the disposable Chrome profile. Chrome can record a script-policy
// violation even if a library caught the exception and the page still renders.
export async function checkScriptPolicy(context, extensionId, extensionDir) {
  const origin = `chrome-extension://${extensionId}/`
  const manager = await context.newPage()
  const page = await context.newPage()
  const reports = new Set()
  try {
    await manager.goto("chrome://extensions/")
    await manager.evaluate(() =>
      chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }),
    )

    const checkErrorList = async () => {
      const errors = await manager.evaluate(async (id) => {
        const extensions = await chrome.developerPrivate.getExtensionsInfo()
        const info = extensions.find((entry) => entry.id === id)
        if (!info) throw new Error("Personal extension is missing from Chrome's extension manager")
        return info.runtimeErrors
          .filter((e) => /hash of blocked script|unsafe-eval|eval-sha256/i.test(e.message))
          .map((e) => e.source + " " + e.message)
      }, extensionId)
      for (const error of errors) reports.add(error)
    }

    const [worker] = await Promise.all([
      context.waitForEvent("serviceworker", (w) => w.url().startsWith(origin)),
      manager.evaluate((id) => chrome.developerPrivate.reload(id), extensionId),
    ])
    await worker.evaluate(() => chrome.runtime.getPlatformInfo())
    await checkErrorList()

    await page.exposeFunction("recordBlockedEvaluation", (where) => {
      reports.add(where)
    })
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (event) => {
        if (event.blockedURI === "eval" && event.effectiveDirective.startsWith("script-src"))
          void window.recordBlockedEvaluation(
            `${location.pathname} ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
          )
      })
    })
    const pages = (await readdir(extensionDir)).filter((name) => name.endsWith(".html"))
    assert.ok(pages.includes("options.html"))
    for (const name of pages) {
      await page.goto(origin + name)
      // SecurityPolicyViolationEvent is queued after the offending script.
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      )
      await checkErrorList()
    }
    assert.deepEqual([...reports], [], "Chrome blocked dynamic JavaScript evaluation")
    console.log(
      "No blocked JavaScript evaluation on worker reload or across",
      pages.length,
      "extension pages",
    )
  } finally {
    await page.close()
    await manager.close()
  }
}
