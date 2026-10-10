import { BrowserWindow, dialog, nativeTheme } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import type {
  BrowserCommand,
  BrowserSnapshot,
  BrowserState,
} from "@shared/browser";
import { importedSavedUrls } from "@shared/saved-urls";
import BrowserDownloads from "./BrowserDownloads";
import BrowserPopups from "./BrowserPopups";
import BrowserSettings from "./BrowserSettings";
import BrowserTabs from "./BrowserTabs";
import WebConnection from "./WebConnection";

export default class BrowserController {
  private readonly downloads: BrowserDownloads;
  private readonly tabs: BrowserTabs;
  private readonly popups: BrowserPopups;
  private readonly webConnection: WebConnection;
  private revision = 0;
  private restoring = true;

  constructor(
    private readonly window: BrowserWindow,
    private readonly settings: BrowserSettings,
  ) {
    nativeTheme.themeSource = this.settings.theme;
    this.downloads = new BrowserDownloads(
      window.webContents.session,
      this.settings,
      () => this.publish(),
    );
    this.popups = new BrowserPopups(window, this.settings, () =>
      this.publish(),
    );
    this.tabs = new BrowserTabs(
      window,
      this.settings,
      this.downloads,
      () => {
        if (!this.restoring) this.settings.setSession(this.tabs.session());
        this.publish();
      },
      () => this.popups.closeOnParentMouseUp(),
    );
    this.webConnection = new WebConnection(this.settings, () => this.publish());
    this.webConnection.initialize();
    window.webContents.on("before-mouse-event", (_event, mouse) => {
      if (mouse.type === "mouseUp") this.popups.closeOnParentMouseUp();
    });
    this.tabs.restore(this.settings.session);
    this.restoring = false;
    window.on("resize", () => {
      this.tabs.layout();
      this.popups.positionPopup();
    });
    window.on("move", () => this.popups.positionPopup());
    window.on("maximize", () => this.publish());
    window.on("unmaximize", () => this.publish());
    window.on("closed", () => {
      this.downloads.dispose();
      this.popups.closePopup(false);
      void this.webConnection.stop().catch((error: unknown) => {
        console.error("Falha ao encerrar o Web Connection:", error);
      });
    });
  }

  owns(sender: Electron.WebContents): boolean {
    return (
      sender === this.window.webContents || sender === this.popups.webContents
    );
  }

  resizePopup(sender: Electron.WebContents, height: number): void {
    if (sender === this.popups.webContents)
      this.popups.resizeWebConnection(height);
  }

  state(): BrowserState {
    return {
      downloads: this.downloads.snapshot(),
      downloadDirectory: this.settings.downloadDirectory,
      downloadDirectoryManaged: this.settings.downloadDirectoryManaged,
      hasUnseenDownload: this.downloads.hasUnseenCompleted(),
      ...this.tabs.snapshot(),
      maximized: this.window.isMaximized(),
      savedUrls: this.settings.savedUrls.map((entry) => ({ ...entry })),
      theme: this.settings.theme,
      popup: this.popups.kind,
      webConnection: this.webConnection.snapshot(),
    };
  }

  snapshot(): BrowserSnapshot {
    return { revision: this.revision, state: this.state() };
  }

  private publish(): void {
    if (this.window.isDestroyed() || this.window.webContents.isDestroyed())
      return;
    this.revision += 1;
    const next = this.snapshot();
    this.window.webContents.send("browser:state", next);
    if (this.popups.webContents && !this.popups.webContents.isDestroyed()) {
      this.popups.webContents.send("browser:state", next);
    }
  }

  async command(command: BrowserCommand): Promise<void> {
    switch (command?.type) {
      case "download-action":
        this.downloads.action(command.id, command.action);
        break;
      case "clear-downloads":
        this.downloads.clear();
        break;
      case "set-web-connection":
        await this.webConnection.configure(
          command.autoStart,
          command.controlExternal,
          command.executablePath,
          command.port,
        );
        break;
      case "start-web-connection":
        await this.webConnection.start();
        break;
      case "stop-web-connection":
        await this.webConnection.stop();
        break;
      case "check-web-connection":
        await this.webConnection.check();
        break;
      case "select-web-connection-executable": {
        this.popups.suspendBlurClose(true);
        try {
          const result = await dialog.showOpenDialog(this.window, {
            title: "Selecionar Web Connection",
            properties: ["openFile"],
            filters: [{ name: "Aplicativo", extensions: ["exe"] }],
          });
          if (!result.canceled && result.filePaths[0]) {
            const executablePath = result.filePaths[0];
            const launcherConfigPath = executablePath.replace(
              /\.exe$/i,
              ".l4j.ini",
            );
            let port = this.settings.webConnectionPort;
            try {
              const launcherConfig = readFileSync(launcherConfigPath, "utf8");
              const configuredPort = launcherConfig.match(
                /(?:^|\s)-Dporta=(\d+)(?=\s|$)/m,
              );
              if (configuredPort) port = Number(configuredPort[1]);
            } catch {
              // The launcher sidecar is optional; retain the saved port if missing.
            }
            await this.webConnection.configure(
              this.settings.webConnectionAutoStart,
              this.settings.webConnectionControlExternal,
              executablePath,
              port,
            );
          }
        } finally {
          this.popups.suspendBlurClose(false);
        }
        break;
      }
      case "select-download-directory": {
        if (this.settings.downloadDirectoryManaged) break;
        const result = await dialog.showOpenDialog(this.window, {
          title: "Pasta de downloads",
          defaultPath: this.settings.downloadDirectory,
          properties: ["openDirectory"],
        });
        if (!result.canceled && result.filePaths[0]) {
          this.settings.setDownloadDirectory(result.filePaths[0]);
          this.publish();
        }
        break;
      }
      case "reset-download-directory":
        if (!this.settings.downloadDirectoryManaged) {
          this.settings.setDownloadDirectory();
          this.publish();
        }
        break;
      case "new-tab":
        this.tabs.newTab(command.url);
        break;
      case "navigate":
        this.tabs.navigate(command.url, command.saved);
        this.popups.closePopup();
        break;
      case "select-tab":
        this.tabs.selectTab(command.id);
        this.popups.closePopup();
        break;
      case "close-tab":
        this.tabs.closeTab(command.id);
        break;
      case "close-tabs":
        this.tabs.closeTabs(command.ids, command.fallbackId);
        break;
      case "show-tab-menu":
        this.tabs.showTabMenu(command.id);
        break;
      case "save-environment": {
        const entry = {
          folder: command.entry.folder.trim(),
          name: command.entry.name.trim(),
          url: this.settings.addressUrl(command.entry.url),
        };
        if (!entry.folder || !entry.name)
          throw new Error("Informe pasta e apelido.");
        const next = this.settings.savedUrls.filter(
          (item) => item.folder !== entry.folder || item.name !== entry.name,
        );
        next.push(entry);
        this.settings.saveUrls(next);
        this.tabs.setActiveSavedTitle(`${entry.folder} / ${entry.name}`);
        this.publish();
        this.popups.closePopup();
        break;
      }
      case "remove-environment": {
        const next = this.settings.savedUrls.filter(
          (item) =>
            item.folder !== command.entry.folder ||
            item.name !== command.entry.name,
        );
        this.settings.saveUrls(next);
        this.tabs.refreshSavedTitles(next);
        this.publish();
        break;
      }
      case "import-environments": {
        this.popups.suspendBlurClose(true);
        try {
          const result = await dialog.showOpenDialog(this.window, {
            title: "Importar bases salvas",
            properties: ["openFile"],
            filters: [{ name: "JSON", extensions: ["json"] }],
          });
          if (result.canceled || !result.filePaths[0]) break;
          const input: unknown = JSON.parse(
            readFileSync(result.filePaths[0], "utf8"),
          );
          const imported = importedSavedUrls(input);
          const next = [...this.settings.savedUrls];
          for (const item of imported) {
            const entry = {
              folder: item.folder.trim(),
              name: item.name.trim(),
              url: this.settings.addressUrl(item.url),
            };
            if (!entry.folder || !entry.name)
              throw new Error("Base sem pasta ou apelido.");
            if (
              !next.some(
                (saved) =>
                  saved.folder === entry.folder && saved.name === entry.name,
              )
            )
              next.push(entry);
          }
          this.settings.saveUrls(next);
          this.tabs.refreshSavedTitles(next);
          this.publish();
        } finally {
          this.popups.suspendBlurClose(false);
        }
        break;
      }
      case "export-environments": {
        this.popups.suspendBlurClose(true);
        try {
          const result = await dialog.showSaveDialog(this.window, {
            title: "Exportar bases salvas",
            defaultPath: "ambientes-snk-browser.json",
            filters: [{ name: "JSON", extensions: ["json"] }],
          });
          if (!result.canceled && result.filePath) {
            writeFileSync(
              result.filePath,
              `${JSON.stringify(this.settings.savedUrls, null, 2)}\n`,
              "utf8",
            );
          }
        } finally {
          this.popups.suspendBlurClose(false);
        }
        break;
      }
      case "set-theme":
        if (command.theme !== "light" && command.theme !== "dark")
          throw new Error("Tema inválido.");
        this.settings.setTheme(command.theme);
        nativeTheme.themeSource = command.theme;
        this.publish();
        this.popups.closePopup();
        break;
      case "toggle-popup":
        if (
          !["sites", "theme", "save", "downloads", "web-connection"].includes(
            command.popup,
          )
        )
          throw new Error("Popup inválido.");
        this.popups.togglePopup(command.popup, command.anchor);
        if (command.popup === "downloads" && this.popups.kind === "downloads")
          this.downloads.markCompletedSeen();
        break;
      case "close-popup":
        this.popups.closePopup();
        break;
      case "back":
      case "forward": {
        this.tabs.navigateHistory(command.type);
        break;
      }
      case "reload":
        this.tabs.reload();
        break;
      case "minimize":
        this.window.minimize();
        break;
      case "toggle-maximize":
        if (this.window.isMaximized()) this.window.unmaximize();
        else this.window.maximize();
        break;
      case "close-window":
        this.window.close();
        break;
      default:
        throw new Error("Comando de navegador inválido.");
    }
  }
}
