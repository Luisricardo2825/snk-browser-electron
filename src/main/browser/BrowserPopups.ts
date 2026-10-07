import { BrowserWindow } from "electron";
import path from "node:path";
import type { PopupAnchor, PopupKind } from "@shared/browser";
import { resolveHtmlPath } from "@main/lib/util";
import BrowserSettings from "./BrowserSettings";

export default class BrowserPopups {
  private popupWindow: BrowserWindow | null = null;
  private popupKind: PopupKind | null = null;
  private popupAnchor: PopupAnchor | undefined;
  private popupSize: [number, number] = [0, 0];
  private popupBlurTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly window: BrowserWindow,
    private readonly settings: BrowserSettings,
    private readonly onChange: () => void,
  ) {}

  get kind(): PopupKind | null {
    return this.popupKind;
  }

  get webContents(): Electron.WebContents | undefined {
    return this.popupWindow?.webContents;
  }

  owns(sender: Electron.WebContents): boolean {
    return sender === this.popupWindow?.webContents;
  }

  positionPopup(): void {
    const popup = this.popupWindow;
    if (!popup || popup.isDestroyed()) return;
    const parent = this.window.getContentBounds();
    const margin = 12;
    const width = Math.min(
      this.popupSize[0],
      Math.max(1, parent.width - margin * 2),
    );
    const height = Math.min(
      this.popupSize[1],
      Math.max(1, parent.height - margin * 2),
    );
    const [currentWidth, currentHeight] = popup.getSize();
    if (currentWidth !== width || currentHeight !== height)
      popup.setSize(width, height);
    const left = parent.x + margin;
    const top = parent.y + margin;
    const right = parent.x + parent.width - margin;
    const bottom = parent.y + parent.height - margin;
    const anchor = this.popupAnchor;
    let x = parent.x + (parent.width - width) / 2;
    let y = parent.y + (parent.height - height) / 2;
    if (anchor && this.popupKind !== "save") {
      x = parent.x + anchor.x;
      y = parent.y + anchor.y + anchor.height;
      if (x + width > right) x = right - width;
      if (y + height > bottom) y = parent.y + anchor.y - height;
    }
    x = Math.max(left, Math.min(x, right - width));
    y = Math.max(top, Math.min(y, bottom - height));
    popup.setPosition(Math.round(x), Math.round(y));
  }

  closePopup(): void {
    if (this.popupBlurTimer) clearTimeout(this.popupBlurTimer);
    this.popupBlurTimer = undefined;
    const popup = this.popupWindow;
    this.popupWindow = null;
    this.popupKind = null;
    this.popupAnchor = undefined;
    this.popupSize = [0, 0];
    if (popup && !popup.isDestroyed()) popup.close();
    if (!this.window.isDestroyed()) this.onChange();
  }

  togglePopup(kind: PopupKind, anchor?: PopupAnchor): void {
    if (this.popupKind === kind) {
      this.closePopup();
      return;
    }
    this.closePopup();
    const dimensions: [number, number] = getPopupDimensions();
    this.popupSize = dimensions;
    const popup = new BrowserWindow({
      parent: this.window,
      width: dimensions[0],
      height: dimensions[1],
      frame: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: this.settings.theme === "dark" ? "#1b1b1b" : "#ffffff",
      webPreferences: {
        preload: path.join(__dirname, "../preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: false,
      },
      maximizable: false,
      minimizable: false,
    });
    this.popupWindow = popup;
    this.popupKind = kind;
    this.popupAnchor = anchor;
    popup.on("blur", () => {
      this.popupBlurTimer = setTimeout(() => {
        if (this.popupWindow === popup && !popup.isFocused()) this.closePopup();
      }, 120);
    });
    popup.on("closed", () => {
      if (this.popupWindow === popup) this.closePopup();
    });
    popup.once("ready-to-show", () => {
      if (this.popupWindow !== popup) return;
      this.positionPopup();
      popup.show();
      popup.focus();
    });
    const url = new URL(resolveHtmlPath("index.html"));
    url.hash = `/popup/${kind}`;
    void popup.loadURL(url.href).catch((error: unknown) => {
      if (this.popupWindow === popup) {
        console.error(error);
        this.closePopup();
      }
    });
    this.onChange();

    function getPopupDimensions(): [number, number] {
      switch (kind) {
        case "sites":
          return [340, 420];
        case "theme":
          return [190, 144];
        case "downloads":
          return [300, 300];
        case "save":
          return [480, 330];
      }
    }
  }
}
