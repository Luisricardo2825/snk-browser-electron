const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve: resolvePath } = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, ipcMain } = require("electron");
process.on("uncaughtException", (error) => {
  console.error(error);
  app.exit(1);
});

// Runs the real popup manager and built renderer, without starting any service.
app.setPath("userData", mkdtempSync(join(tmpdir(), "snk-popup-size-")));
const source = readFileSync("release/app/dist/main/main.js", "utf8").match(
  /class BrowserPopups \{[\s\S]*?\n\}/,
)[0];
const BrowserPopups = new Function(
  "electron",
  "path",
  "resolveHtmlPath",
  "__dirname",
  `return ${source}`,
)(
  require("electron"),
  require("node:path"),
  () => pathToFileURL(resolvePath("release/app/dist/renderer/index.html")).href,
  resolvePath("release/app/dist/main"),
);
setTimeout(() => {
  console.error("Popup test timed out");
  app.exit(1);
}, 15000);

app
  .whenReady()
  .then(async () => {
    const parent = new BrowserWindow({ width: 900, height: 800, show: false });
    const popups = new BrowserPopups(parent, { theme: "light" }, () => {});
    ipcMain.handle("browser:get-state", () => ({
      revision: 1,
      state: {
        theme: "light",
        webConnection: {
          autoStart: false,
          controlExternal: true,
          executablePath: "",
          port: 9098,
          status: "stopped",
          error: "",
        },
      },
    }));
    ipcMain.handle("browser:resize-popup", (event, height) => {
      assert.equal(event.sender, popups.webContents);
      popups.resizeWebConnection(height);
    });
    try {
      parent.show();
      popups.togglePopup("web-connection", {
        x: 20,
        y: 40,
        width: 30,
        height: 30,
      });
      const contents = popups.webContents;
      await new Promise((resolve) => contents.once("did-finish-load", resolve));
      await delay(500);
      const popup = BrowserWindow.fromWebContents(contents);
      const initial = popup.getSize()[1];
      for (let cycle = 0; cycle < 3; cycle += 1) {
        await contents.executeJavaScript(
          'document.querySelector("[data-slot=accordion-trigger]").click()',
        );
        await delay(500);
        const expanded = popup.getSize()[1];
        assert.ok(expanded > initial + 100, `Did not expand: ${expanded}`);
        await contents.executeJavaScript(
          'document.querySelector("[data-slot=accordion-trigger]").click()',
        );
        await delay(500);
        const collapsed = popup.getSize()[1];
        assert.equal(
          collapsed,
          initial,
          "Popup must return to its initial height",
        );
        assert.equal(popup.isResizable(), false);
        console.log(JSON.stringify({ cycle, initial, expanded, collapsed }));
      }
      return app.exit(0);
    } catch (error) {
      console.error(error);
      return app.exit(1);
    }
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
