import { BrowserWindow, ipcMain } from "electron";

import type { BrowserCommand } from "@shared/browser";

import BrowserController from "@main/browser/BrowserController";
import BrowserSettings from "@main/browser/BrowserSettings";

let controller: BrowserController | null = null;

function authorized(sender: Electron.WebContents): BrowserController {
  if (!controller || !controller.owns(sender)) {
    throw new Error("Acesso negado ao navegador.");
  }
  return controller;
}

ipcMain.handle("browser:get-state", (event) =>
  authorized(event.sender).snapshot(),
);
ipcMain.handle("browser:command", (event, command: BrowserCommand) =>
  authorized(event.sender).command(command),
);

export function attachBrowserWindow(
  window: BrowserWindow,
  settings: BrowserSettings,
): void {
  controller = new BrowserController(window, settings);
  window.once("closed", () => {
    controller = null;
  });
}
