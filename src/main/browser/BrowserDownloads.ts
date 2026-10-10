import { app, BrowserWindow, dialog, shell } from "electron";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { BrowserCommand, BrowserDownload } from "@shared/browser";
import BrowserSettings from "./BrowserSettings";

const downloadsPath = () =>
  path.join(app.getPath("userData"), "browser-downloads.json");

export default class BrowserDownloads {
  readonly downloads = this.readDownloads();
  private readonly downloadItems = new Map<string, Electron.DownloadItem>();
  private readonly saveAsPaths = new Map<string, string>();

  constructor(
    private readonly session: Electron.Session,
    private readonly settings: BrowserSettings,
    private readonly onChange: () => void,
  ) {
    session.on("will-download", this.onDownload);
  }

  dispose(): void {
    this.session.removeListener("will-download", this.onDownload);
  }

  snapshot(): BrowserDownload[] {
    return this.downloads.map((download) => ({ ...download }));
  }

  hasUnseenCompleted(): boolean {
    return this.downloads.some(
      (download) => download.status === "completed" && download.seen === false,
    );
  }

  markCompletedSeen(): void {
    let changed = false;
    for (const download of this.downloads) {
      if (download.status === "completed" && download.seen === false) {
        download.seen = true;
        changed = true;
      }
    }
    if (!changed) return;
    this.saveDownloads();
    this.onChange();
  }

  async saveAs(
    window: BrowserWindow,
    contents: Electron.WebContents,
    url: string,
  ): Promise<void> {
    const directory = this.settings.downloadDirectory;
    const filename = path.basename(new URL(url).pathname) || "download";
    const result = await dialog.showSaveDialog(window, {
      defaultPath: path.join(directory, filename),
    });
    if (result.canceled || !result.filePath) return;
    this.saveAsPaths.set(url, result.filePath);
    setTimeout(() => {
      if (this.saveAsPaths.get(url) === result.filePath)
        this.saveAsPaths.delete(url);
    }, 10 * 60_000);
    try {
      contents.downloadURL(url);
    } catch (error) {
      this.saveAsPaths.delete(url);
      throw error;
    }
  }

  action(
    id: string,
    action: Extract<BrowserCommand, { type: "download-action" }>["action"],
  ): void {
    const download = this.downloads.find((entry) => entry.id === id);
    if (!download) throw new Error("Download não encontrado.");
    const item = this.downloadItems.get(download.id);
    if (action === "show") {
      if (!download.path || !existsSync(download.path))
        throw new Error("Arquivo ainda não está disponível.");
      shell.showItemInFolder(download.path);
    }
    if (action === "cancel" && item) item.cancel();
    if (action === "pause" && item) {
      item.pause();
      download.status = "paused";
      this.onChange();
    }
    if (action === "resume" && item && item.canResume()) {
      item.resume();
      download.status = "progressing";
      this.onChange();
    }
  }

  clear(): void {
    this.downloads.splice(
      0,
      this.downloads.length,
      ...this.downloads.filter(
        (entry) =>
          this.downloadItems.has(entry.id) && entry.status !== "interrupted",
      ),
    );
    this.saveDownloads();
    this.onChange();
  }

  private readonly onDownload = (
    _event: Electron.Event,
    item: Electron.DownloadItem,
  ): void => {
    const directory = this.settings.downloadDirectory;
    mkdirSync(directory, { recursive: true });
    const filename = path.basename(item.getFilename());
    const { name, ext } = path.parse(filename);
    const chosenUrl = item
      .getURLChain()
      .find((url) => this.saveAsPaths.has(url));
    let destination =
      (chosenUrl && this.saveAsPaths.get(chosenUrl)) ||
      item.getSavePath() ||
      path.join(directory, filename);
    if (chosenUrl) this.saveAsPaths.delete(chosenUrl);
    else {
      for (
        let suffix = 1;
        existsSync(destination) ||
        this.downloads.some(
          (download) =>
            this.downloadItems.has(download.id) &&
            download.path === destination,
        );
        suffix += 1
      ) {
        destination = path.join(directory, `${name} (${suffix})${ext}`);
      }
    }
    item.setSavePath(destination);
    const download: BrowserDownload = {
      id: randomUUID(),
      name: path.basename(destination),
      path: destination,
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      status: "progressing",
    };
    this.downloads.unshift(download);
    this.downloadItems.set(download.id, item);
    const update = () => {
      download.path = item.getSavePath() || destination;
      download.name = path.basename(download.path);
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      this.onChange();
    };
    item.on("updated", (_updatedEvent, state) => {
      download.status = item.isPaused()
        ? "paused"
        : state === "interrupted" && !item.canResume()
          ? "interrupted"
          : "progressing";
      update();
    });
    item.once("done", (_doneEvent, state) => {
      download.status = state;
      download.seen = state !== "completed";
      this.downloadItems.delete(download.id);
      update();
      this.saveDownloads();
    });
    this.onChange();
  };

  saveDownloads(): void {
    mkdirSync(path.dirname(downloadsPath()), { recursive: true });
    const temporary = `${downloadsPath()}.tmp`;
    writeFileSync(
      temporary,
      JSON.stringify(
        this.downloads.filter(
          (download) => !this.downloadItems.has(download.id),
        ),
        null,
        2,
      ),
    );
    renameSync(temporary, downloadsPath());
  }

  private readDownloads(): BrowserDownload[] {
    try {
      const data: unknown = JSON.parse(readFileSync(downloadsPath(), "utf8"));
      if (!Array.isArray(data)) return [];
      return data.filter(
        (entry): entry is BrowserDownload =>
          entry &&
          typeof entry.id === "string" &&
          typeof entry.name === "string" &&
          typeof entry.path === "string" &&
          typeof entry.receivedBytes === "number" &&
          typeof entry.totalBytes === "number" &&
          ["completed", "cancelled", "interrupted"].includes(entry.status),
      );
    } catch {
      return [];
    }
  }
}
