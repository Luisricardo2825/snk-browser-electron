import { BrowserWindow, WebContentsView } from "electron";
import path from "node:path";
import type { PopupAnchor, PopupKind } from "@shared/browser";
import { resolveHtmlPath } from "@main/lib/util";

export default class BrowserPopups {
  private popupView: WebContentsView | null = null;
  private popupKind: PopupKind | null = null;
  private popupAnchor: PopupAnchor | undefined;
  private popupSize: [number, number] = [0, 0];
  private popupBlurTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly window: BrowserWindow,
    private readonly onChange: () => void,
  ) {}

  get kind(): PopupKind | null {
    return this.popupKind;
  }

  get webContents(): Electron.WebContents | undefined {
    return this.popupView?.webContents;
  }

  owns(sender: Electron.WebContents): boolean {
    return sender === this.popupView?.webContents;
  }

  positionPopup(): void {
    const view = this.popupView;
    if (!view || this.window.isDestroyed()) return;
    const [parentWidth, parentHeight] = this.window.getContentSize();
    const margin = 12;
    const width = Math.min(
      this.popupSize[0],
      Math.max(1, parentWidth - margin * 2),
    );
    let height = Math.min(
      this.popupSize[1],
      Math.max(1, parentHeight - margin * 2),
    );
    const right = parentWidth - margin;
    const bottom = parentHeight - margin;
    const anchor = this.popupAnchor;
    let x = (parentWidth - width) / 2;
    let y = (parentHeight - height) / 2;
    if (anchor && this.popupKind !== "save") {
      x = anchor.x;
      y = anchor.y + anchor.height;
      if (x + width > right) x = right - width;
      if (y + height > bottom) {
        const spaceAbove = anchor.y - margin;
        const spaceBelow = bottom - y;
        if (spaceAbove >= height || spaceAbove > spaceBelow) {
          height = Math.min(height, Math.max(1, spaceAbove));
          y = anchor.y - height;
        } else {
          height = Math.max(1, spaceBelow);
        }
      }
    }
    x = Math.max(margin, Math.min(x, right - width));
    y = Math.max(margin, Math.min(y, bottom - height));
    view.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width,
      height,
    });
  }

  raisePopup(): void {
    const view = this.popupView;
    if (
      view &&
      !this.window.isDestroyed() &&
      this.window.contentView.children.includes(view)
    ) {
      this.window.contentView.addChildView(view);
    }
  }

  closePopup(): void {
    if (this.popupBlurTimer) clearTimeout(this.popupBlurTimer);
    this.popupBlurTimer = undefined;
    const view = this.popupView;
    this.popupView = null;
    this.popupKind = null;
    this.popupAnchor = undefined;
    this.popupSize = [0, 0];
    if (view) {
      const remove = () => {
        if (
          !this.window.isDestroyed() &&
          this.window.contentView.children.includes(view)
        )
          this.window.contentView.removeChildView(view);
        if (!view.webContents.isDestroyed()) view.webContents.close();
      };
      if (
        !this.window.isDestroyed() &&
        this.window.contentView.children.includes(view)
      ) {
        void view.webContents
          .executeJavaScript(
            'document.querySelector("[data-popup-panel]")?.setAttribute("data-closing", "true")',
          )
          .catch(remove);
        setTimeout(remove, 120);
      } else {
        remove();
      }
    }
    if (!this.window.isDestroyed()) this.onChange();
  }

  closeOnParentMouseUp(): void {
    const view = this.popupView;
    if (!view) return;
    if (this.popupBlurTimer) clearTimeout(this.popupBlurTimer);
    this.popupBlurTimer = setTimeout(() => {
      if (this.popupView === view) this.closePopup();
    }, 120);
  }

  togglePopup(kind: PopupKind, anchor?: PopupAnchor): void {
    if (this.popupKind === kind) {
      this.closePopup();
      return;
    }
    this.closePopup();
    const dimensions: [number, number] = getPopupDimensions(kind);
    const view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "../preload/preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: false,
      },
    });
    view.setBackgroundColor("#00000000");
    this.popupView = view;
    this.popupKind = kind;
    this.popupAnchor = anchor;
    this.popupSize = dimensions;
    view.webContents.on("blur", () => {
      this.popupBlurTimer = setTimeout(() => {
        if (this.popupView === view && !view.webContents.isFocused()) {
          this.closePopup();
        }
      }, 120);
    });
    view.webContents.on("destroyed", () => {
      if (this.popupView === view) this.closePopup();
    });
    const url = new URL(resolveHtmlPath("index.html"));
    url.hash = `/popup/${kind}`;
    view.webContents.once("did-finish-load", () => {
      if (this.popupView !== view || this.window.isDestroyed()) return;
      this.positionPopup();
      this.window.contentView.addChildView(view);
      view.webContents.focus();
      void view.webContents
        .executeJavaScript(
          'requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector("[data-popup-panel]")?.setAttribute("data-visible", "true")))',
        )
        .catch(() => {});
    });
    void view.webContents.loadURL(url.href).catch((error: unknown) => {
      if (this.popupView !== view) return;
      console.error(error);
      this.closePopup();
    });
    this.onChange();
  }
}

function getPopupDimensions(kind: PopupKind): [number, number] {
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
