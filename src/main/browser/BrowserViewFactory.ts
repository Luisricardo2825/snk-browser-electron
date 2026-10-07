import { BrowserWindow, WebContentsView } from "electron";
import contextMenu from "electron-context-menu";
import type { BrowserTab } from "@shared/browser";
import BrowserDownloads from "./BrowserDownloads";
import BrowserSettings from "./BrowserSettings";

export default class BrowserViewFactory {
  constructor(
    private readonly window: BrowserWindow,
    private readonly settings: BrowserSettings,
    private readonly downloads: BrowserDownloads,
    private readonly views: Map<string, WebContentsView>,
    private readonly hasTab: (id: string) => boolean,
    private readonly onNewTab: (url?: string) => void,
    private readonly onChange: () => void,
  ) {}

  createView(tab: BrowserTab): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: true,
      },
    });
    const contents = view.webContents;
    contents.setUserAgent(
      contents.getUserAgent().replace(/\sElectron\/[^\s]+/i, ""),
    );
    const saveAs = (url: string) =>
      this.downloads.saveAs(this.window, contents, url);
    contextMenu({
      window: view,
      showInspectElement: true,
      showCopyImageAddress: true,
      showCopyVideoAddress: true,
      labels: {
        cut: "Recortar",
        copy: "Copiar",
        paste: "Colar",
        selectAll: "Selecionar tudo",
        copyLink: "Copiar endereço do link",
        copyImage: "Copiar imagem",
        copyImageAddress: "Copiar endereço da imagem",
        copyVideoAddress: "Copiar endereço do vídeo",
        searchWithGoogle: "Pesquisar no Google",
        inspect: "Inspecionar",
      },
      prepend: (_actions, params) => {
        const menu: Electron.MenuItemConstructorOptions[] = [];
        if (/^https?:\/\//i.test(params.linkURL)) {
          menu.push(
            {
              label: "Abrir link em nova guia",
              click: () => this.onNewTab(params.linkURL),
            },
            {
              label: "Salvar link como…",
              click: () => void saveAs(params.linkURL).catch(console.error),
            },
          );
        }
        if (
          (params.mediaType === "image" || params.mediaType === "video") &&
          /^https?:\/\//i.test(params.srcURL)
        ) {
          menu.push({
            label: `Salvar ${params.mediaType === "image" ? "imagem" : "vídeo"} como…`,
            click: () => void saveAs(params.srcURL).catch(console.error),
          });
        }
        if (params.selectionText.trim()) {
          menu.push({
            id: "searchWithGoogle",
            label: "Pesquisar seleção no Google",
            click: () =>
              this.onNewTab(
                `https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`,
              ),
          });
        }
        if (menu.length) menu.push({ type: "separator" });
        if (
          !params.linkURL &&
          params.mediaType === "none" &&
          !params.isEditable &&
          !params.selectionText
        ) {
          menu.push(
            {
              label: "Voltar",
              enabled: contents.navigationHistory.canGoBack(),
              click: () => contents.navigationHistory.goBack(),
            },
            {
              label: "Avançar",
              enabled: contents.navigationHistory.canGoForward(),
              click: () => contents.navigationHistory.goForward(),
            },
            { label: "Recarregar", click: () => contents.reload() },
            { type: "separator" },
          );
        }
        return menu;
      },
    });
    contents.setWindowOpenHandler(({ url, features }) => {
      try {
        const target = this.settings.addressUrl(url);
        if (
          /\b(?:width|height)\s*=/.test(features) ||
          /\/sessionUpload\.mge$/i.test(new URL(target).pathname)
        ) {
          const width = Number(
            features.match(/\bwidth\s*=\s*(\d+)/)?.[1] ?? 600,
          );
          const height = Number(
            features.match(/\bheight\s*=\s*(\d+)/)?.[1] ?? 450,
          );

          const parent = this.window;
          return {
            action: "allow",
            createWindow(options) {
              return new BrowserWindow({
                ...options,
                parent,
                width: Math.max(300, width),
                height: Math.max(250, height),
                autoHideMenuBar: true,
                webPreferences: {
                  ...options.webPreferences,
                  contextIsolation: true,
                  nodeIntegration: false,
                  sandbox: true,
                  devTools: false,
                },
              }).webContents;
            },
          };
        }
        this.onNewTab(target);
      } catch {
        // Unsupported schemes cannot create browser tabs.
      }
      return { action: "deny" };
    });
    const updateUrl = (_event: Electron.Event, url: string) => {
      if (!this.hasTab(tab.id)) return;
      tab.url = url;
      tab.savedTitle = this.settings.savedTitleForUrl(
        url,
        this.settings.savedUrls,
        tab.savedTitle,
      );
      tab.error = "";
      this.onChange();
    };
    contents.on("did-navigate", updateUrl);
    contents.on("did-navigate-in-page", updateUrl);
    contents.on("page-title-updated", (_event, title) => {
      if (!this.hasTab(tab.id)) return;
      tab.title = title || new URL(tab.url).hostname;
      this.onChange();
    });
    contents.on("did-start-loading", () => {
      if (!this.hasTab(tab.id)) return;
      tab.loading = true;
      this.onChange();
    });
    contents.on("did-stop-loading", () => {
      if (!this.hasTab(tab.id)) return;
      tab.loading = false;
      this.onChange();
    });
    contents.on(
      "did-fail-load",
      (_event, code, description, _url, mainFrame) => {
        if (!mainFrame || code === -3 || !this.hasTab(tab.id)) return;
        tab.loading = false;
        tab.error = description;
        this.onChange();
      },
    );
    this.views.set(tab.id, view);
    return view;
  }
}
