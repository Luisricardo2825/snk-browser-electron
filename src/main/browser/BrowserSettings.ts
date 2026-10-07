import { app } from "electron";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { SavedUrl, Theme } from "@shared/browser";

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface TabSession {
  urls: string[];
  activeIndex: number;
}

interface SettingsFile {
  savedUrls: SavedUrl[];
  theme: Theme;
  window?: WindowState;
  session?: TabSession;
  downloadDirectory?: string;
}

const settingsPath = () =>
  path.join(app.getPath("userData"), "browser-settings.json");

export default class BrowserSettings {
  private data: SettingsFile;

  constructor() {
    this.data = this.readSettings();
  }

  get savedUrls(): SavedUrl[] {
    return this.data.savedUrls;
  }

  get theme(): Theme {
    return this.data.theme;
  }

  get windowState(): WindowState | undefined {
    return this.data.window;
  }

  get session(): TabSession | undefined {
    return this.data.session;
  }

  get downloadDirectory(): string {
    return (
      process.env.SNK_BROWSER_DOWNLOAD_DIR ||
      this.data.downloadDirectory ||
      app.getPath("downloads")
    );
  }

  get downloadDirectoryManaged(): boolean {
    return Boolean(process.env.SNK_BROWSER_DOWNLOAD_DIR);
  }

  setWindowState(window: WindowState): void {
    this.writeSettings({ ...this.data, window });
  }

  setSession(session: TabSession): void {
    if (JSON.stringify(session) !== JSON.stringify(this.data.session))
      this.writeSettings({ ...this.data, session });
  }

  setDownloadDirectory(downloadDirectory?: string): void {
    this.writeSettings({ ...this.data, downloadDirectory });
  }

  saveUrls(savedUrls: SavedUrl[]): void {
    this.writeSettings({ ...this.data, savedUrls });
  }

  setTheme(theme: Theme): void {
    this.writeSettings({ ...this.data, theme });
  }

  private readSettings(): SettingsFile {
    if (!existsSync(settingsPath())) return { savedUrls: [], theme: "light" };
    const settings: unknown = JSON.parse(readFileSync(settingsPath(), "utf8"));
    if (!settings || typeof settings !== "object")
      throw new Error("Configurações inválidas.");
    const value = settings as Record<string, unknown>;
    if (
      !Array.isArray(value.savedUrls) ||
      !value.savedUrls.every(
        (entry) =>
          entry &&
          typeof entry.folder === "string" &&
          typeof entry.name === "string" &&
          typeof entry.url === "string",
      )
    ) {
      throw new Error("Bases salvas inválidas.");
    }
    if (value.theme !== "light" && value.theme !== "dark")
      throw new Error("Tema salvo inválido.");
    const window = value.window as Partial<WindowState> | undefined;
    const session = value.session as Partial<TabSession> | undefined;
    const urls = Array.isArray(session?.urls)
      ? session.urls.map((url) =>
          typeof url === "string" &&
          (url === "" ||
            (URL.canParse(url) && /^https?:$/.test(new URL(url).protocol)))
            ? url
            : "",
        )
      : undefined;
    return {
      savedUrls: value.savedUrls,
      theme: value.theme,
      window:
        window &&
        Number.isInteger(window.x) &&
        Number.isInteger(window.y) &&
        Number.isInteger(window.width) &&
        window.width !== undefined &&
        window.width >= 640 &&
        Number.isInteger(window.height) &&
        window.height !== undefined &&
        window.height >= 420 &&
        typeof window.maximized === "boolean"
          ? (window as WindowState)
          : undefined,
      session:
        session &&
        urls &&
        urls.length > 0 &&
        Number.isInteger(session.activeIndex) &&
        session.activeIndex! >= 0 &&
        session.activeIndex! < urls.length
          ? { urls, activeIndex: session.activeIndex! }
          : undefined,
      downloadDirectory:
        typeof value.downloadDirectory === "string" &&
        path.isAbsolute(value.downloadDirectory)
          ? value.downloadDirectory
          : undefined,
    };
  }

  private writeSettings(settings: SettingsFile): void {
    mkdirSync(path.dirname(settingsPath()), { recursive: true });
    const temporary = `${settingsPath()}.tmp`;
    writeFileSync(temporary, JSON.stringify(settings, null, 2));
    renameSync(temporary, settingsPath());
    this.data = settings;
  }

  savedTitleForUrl(url: string, savedUrls: SavedUrl[], current = ""): string {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      return "";
    }
    const matching = savedUrls.filter((entry) => {
      try {
        return new URL(entry.url).origin === origin;
      } catch {
        return false;
      }
    });
    const selected =
      matching.find((entry) => `${entry.folder} / ${entry.name}` === current) ??
      matching[0];
    return selected ? `${selected.folder} / ${selected.name}` : "";
  }

  private getUrl(input: string) {
    let value = input.trim();
    if (!value) throw new Error("Informe uma URL.");
    if (!URL.canParse(value)) {
      const googleSearchUrl = new URL(
        `https://www.google.com/search?q=${encodeURIComponent(value)}`,
      );
      return googleSearchUrl;
    }
    const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
    const local = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
    return new URL(
      hasScheme ? value : `${local ? "http" : "https"}://${value}`,
    );
  }

  addressUrl(input: string): string {
    const url = this.getUrl(input);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Use uma URL HTTP ou HTTPS.");
    }
    return url.href;
  }
}
