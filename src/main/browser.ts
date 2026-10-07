import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  WebContentsView,
} from 'electron';
import contextMenu from 'electron-context-menu';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import type {
  BrowserCommand,
  BrowserDownload,
  BrowserState,
  BrowserTab,
  PopupAnchor,
  PopupKind,
  SavedUrl,
  Theme,
} from '@shared/browser';
import { CHROME_HEIGHT } from '@shared/browser';
import { importedSavedUrls } from '@shared/saved-urls';
import { resolveHtmlPath } from '@main/util';

const settingsPath = () =>
  path.join(app.getPath('userData'), 'browser-settings.json');
const downloadsPath = () =>
  path.join(app.getPath('userData'), 'browser-downloads.json');

function readDownloads(): BrowserDownload[] {
  try {
    const data: unknown = JSON.parse(readFileSync(downloadsPath(), 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.filter(
      (entry): entry is BrowserDownload =>
        entry &&
        typeof entry.id === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.path === 'string' &&
        typeof entry.receivedBytes === 'number' &&
        typeof entry.totalBytes === 'number' &&
        ['completed', 'cancelled', 'interrupted'].includes(entry.status),
    );
  } catch {
    return [];
  }
}

function readSettings(): { savedUrls: SavedUrl[]; theme: Theme } {
  if (!existsSync(settingsPath())) return { savedUrls: [], theme: 'light' };
  const settings: unknown = JSON.parse(readFileSync(settingsPath(), 'utf8'));
  if (!settings || typeof settings !== 'object')
    throw new Error('Configurações inválidas.');
  const value = settings as { savedUrls?: unknown; theme?: unknown };
  if (
    !Array.isArray(value.savedUrls) ||
    !value.savedUrls.every(
      (entry) =>
        entry &&
        typeof entry.folder === 'string' &&
        typeof entry.name === 'string' &&
        typeof entry.url === 'string',
    )
  ) {
    throw new Error('Bases salvas inválidas.');
  }
  if (value.theme !== 'light' && value.theme !== 'dark')
    throw new Error('Tema salvo inválido.');
  return { savedUrls: value.savedUrls, theme: value.theme };
}

function writeSettings(savedUrls: SavedUrl[], theme: Theme): void {
  mkdirSync(path.dirname(settingsPath()), { recursive: true });
  const temporary = `${settingsPath()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ savedUrls, theme }, null, 2));
  renameSync(temporary, settingsPath());
}

function savedTitleForUrl(
  url: string,
  savedUrls: SavedUrl[],
  current = '',
): string {
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return '';
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
  return selected ? `${selected.folder} / ${selected.name}` : '';
}

function getUrl(input: string) {
  let value = input.trim();
  if (!value) throw new Error('Informe uma URL.');
  if (!URL.canParse(value)) {
    const googleSearchUrl = new URL(
      `https://www.google.com/search?q=${encodeURIComponent(value)}`,
    );
    return googleSearchUrl;
  }
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
  return new URL(hasScheme ? value : `${local ? 'http' : 'https'}://${value}`);
}

function addressUrl(input: string): string {
  const url = getUrl(input);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Use uma URL HTTP ou HTTPS.');
  }
  return url.href;
}

class BrowserController {
  private readonly window: BrowserWindow;

  private readonly tabs: BrowserTab[] = [];

  private readonly views = new Map<string, WebContentsView>();

  private readonly downloads = readDownloads();

  private readonly downloadItems = new Map<string, Electron.DownloadItem>();

  private readonly saveAsPaths = new Map<string, string>();

  private activeTabId = '';

  private activeView: WebContentsView | null = null;

  private nextTabId = 0;

  private savedUrls: SavedUrl[];

  private theme: Theme;

  private popupWindow: BrowserWindow | null = null;

  private popupKind: PopupKind | null = null;

  private popupAnchor: PopupAnchor | undefined;

  private popupSize: [number, number] = [0, 0];

  private popupBlurTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(window: BrowserWindow) {
    this.window = window;
    const settings = readSettings();
    this.savedUrls = settings.savedUrls;
    this.theme = settings.theme;
    nativeTheme.themeSource = this.theme;
    this.newTab();
    const downloadSession = window.webContents.session;
    downloadSession.on('will-download', this.onDownload);
    window.on('resize', () => {
      this.layout();
      this.positionPopup();
    });
    window.on('move', () => this.positionPopup());
    window.on('maximize', () => this.publish());
    window.on('unmaximize', () => this.publish());
    window.on('closed', () => {
      downloadSession.removeListener('will-download', this.onDownload);
      this.closePopup();
    });
  }

  owns(sender: Electron.WebContents): boolean {
    return (
      sender === this.window.webContents ||
      sender === this.popupWindow?.webContents
    );
  }

  state(): BrowserState {
    const active = this.views.get(this.activeTabId);
    return {
      downloads: this.downloads.map((download) => ({ ...download })),
      tabs: this.tabs.map((tab) => ({ ...tab })),
      activeTabId: this.activeTabId,
      canGoBack: active?.webContents.navigationHistory.canGoBack() ?? false,
      canGoForward:
        active?.webContents.navigationHistory.canGoForward() ?? false,
      maximized: this.window.isMaximized(),
      savedUrls: this.savedUrls.map((entry) => ({ ...entry })),
      theme: this.theme,
      popup: this.popupKind,
    };
  }

  private publish(): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send('browser:state', this.state());
      if (this.popupWindow && !this.popupWindow.isDestroyed()) {
        this.popupWindow.webContents.send('browser:state', this.state());
      }
    }
  }

  private readonly onDownload = (
    _event: Electron.Event,
    item: Electron.DownloadItem,
  ): void => {
    const directory =
      process.env.SNK_BROWSER_DOWNLOAD_DIR || app.getPath('downloads');
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
      status: 'progressing',
    };
    this.downloads.unshift(download);
    this.downloadItems.set(download.id, item);
    const update = () => {
      download.path = item.getSavePath() || destination;
      download.name = path.basename(download.path);
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      this.publish();
    };
    item.on('updated', (_updatedEvent, state) => {
      download.status =
        state === 'interrupted'
          ? 'interrupted'
          : item.isPaused()
            ? 'paused'
            : 'progressing';
      update();
    });
    item.once('done', (_doneEvent, state) => {
      download.status = state;
      this.downloadItems.delete(download.id);
      update();
      this.saveDownloads();
    });
    this.publish();
  };

  private saveDownloads(): void {
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

  private tab(id: string): BrowserTab | undefined {
    return this.tabs.find((tab) => tab.id === id);
  }

  private layout(): void {
    if (!this.activeView) return;
    const [width, height] = this.window.getContentSize();
    this.activeView.setBounds({
      x: 0,
      y: CHROME_HEIGHT,
      width: Math.max(1, width),
      height: Math.max(1, height - CHROME_HEIGHT),
    });
  }

  private showActiveTab(): void {
    const next = this.views.get(this.activeTabId) ?? null;
    if (this.activeView !== next) {
      if (this.activeView)
        this.window.contentView.removeChildView(this.activeView);
      this.activeView = next;
      if (next) this.window.contentView.addChildView(next);
    }
    this.layout();
    next?.webContents.focus();
    this.publish();
  }

  private positionPopup(): void {
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
    if (anchor && this.popupKind !== 'save') {
      x = parent.x + anchor.x;
      y = parent.y + anchor.y + anchor.height;
      if (x + width > right) x = right - width;
      if (y + height > bottom) y = parent.y + anchor.y - height;
    }
    x = Math.max(left, Math.min(x, right - width));
    y = Math.max(top, Math.min(y, bottom - height));
    popup.setPosition(Math.round(x), Math.round(y));
  }

  private closePopup(): void {
    if (this.popupBlurTimer) clearTimeout(this.popupBlurTimer);
    this.popupBlurTimer = undefined;
    const popup = this.popupWindow;
    this.popupWindow = null;
    this.popupKind = null;
    this.popupAnchor = undefined;
    this.popupSize = [0, 0];
    if (popup && !popup.isDestroyed()) popup.close();
    if (!this.window.isDestroyed()) this.publish();
  }

  private togglePopup(kind: PopupKind, anchor?: PopupAnchor): void {
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
      backgroundColor: this.theme === 'dark' ? '#1b1b1b' : '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, '../preload/preload.js'),
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
    popup.on('blur', () => {
      this.popupBlurTimer = setTimeout(() => {
        if (this.popupWindow === popup && !popup.isFocused()) this.closePopup();
      }, 120);
    });
    popup.on('closed', () => {
      if (this.popupWindow === popup) this.closePopup();
    });
    popup.once('ready-to-show', () => {
      if (this.popupWindow !== popup) return;
      this.positionPopup();
      popup.show();
      popup.focus();
    });
    const url = new URL(resolveHtmlPath('index.html'));
    url.hash = `/popup/${kind}`;
    void popup.loadURL(url.href).catch((error: unknown) => {
      if (this.popupWindow === popup) {
        console.error(error);
        this.closePopup();
      }
    });
    this.publish();

    function getPopupDimensions(): [number, number] {
      switch (kind) {
        case 'sites':
          return [340, 420];
        case 'theme':
          return [190, 144];
        case 'downloads':
          return [300, 250];
        case 'save':
          return [480, 330];
      }
    }
  }

  private createView(tab: BrowserTab): WebContentsView {
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
      contents.getUserAgent().replace(/\sElectron\/[^\s]+/i, ''),
    );
    const saveAs = async (url: string) => {
      const directory =
        process.env.SNK_BROWSER_DOWNLOAD_DIR || app.getPath('downloads');
      const filename = path.basename(new URL(url).pathname) || 'download';
      const result = await dialog.showSaveDialog(this.window, {
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
    };
    contextMenu({
      window: view,
      showInspectElement: true,
      showCopyImageAddress: true,
      showCopyVideoAddress: true,
      labels: {
        cut: 'Recortar',
        copy: 'Copiar',
        paste: 'Colar',
        selectAll: 'Selecionar tudo',
        copyLink: 'Copiar endereço do link',
        copyImage: 'Copiar imagem',
        copyImageAddress: 'Copiar endereço da imagem',
        copyVideoAddress: 'Copiar endereço do vídeo',
        searchWithGoogle: 'Pesquisar no Google',
        inspect: 'Inspecionar',
      },
      prepend: (_actions, params) => {
        const menu: Electron.MenuItemConstructorOptions[] = [];
        if (/^https?:\/\//i.test(params.linkURL)) {
          menu.push(
            {
              label: 'Abrir link em nova guia',
              click: () => this.newTab(params.linkURL),
            },
            {
              label: 'Salvar link como…',
              click: () => void saveAs(params.linkURL).catch(console.error),
            },
          );
        }
        if (
          (params.mediaType === 'image' || params.mediaType === 'video') &&
          /^https?:\/\//i.test(params.srcURL)
        ) {
          menu.push({
            label: `Salvar ${params.mediaType === 'image' ? 'imagem' : 'vídeo'} como…`,
            click: () => void saveAs(params.srcURL).catch(console.error),
          });
        }
        if (params.selectionText.trim()) {
          menu.push({
            id: 'searchWithGoogle',
            label: 'Pesquisar seleção no Google',
            click: () =>
              this.newTab(
                `https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`,
              ),
          });
        }
        if (menu.length) menu.push({ type: 'separator' });
        if (
          !params.linkURL &&
          params.mediaType === 'none' &&
          !params.isEditable &&
          !params.selectionText
        ) {
          menu.push(
            {
              label: 'Voltar',
              enabled: contents.navigationHistory.canGoBack(),
              click: () => contents.navigationHistory.goBack(),
            },
            {
              label: 'Avançar',
              enabled: contents.navigationHistory.canGoForward(),
              click: () => contents.navigationHistory.goForward(),
            },
            { label: 'Recarregar', click: () => contents.reload() },
            { type: 'separator' },
          );
        }
        return menu;
      },
    });
    contents.setWindowOpenHandler(({ url, features }) => {
      try {
        const target = addressUrl(url);
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
            action: 'allow',
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
        this.newTab(target);
      } catch {
        // Unsupported schemes cannot create browser tabs.
      }
      return { action: 'deny' };
    });
    const updateUrl = (_event: Electron.Event, url: string) => {
      if (!this.tab(tab.id)) return;
      tab.url = url;
      tab.savedTitle = savedTitleForUrl(url, this.savedUrls, tab.savedTitle);
      tab.error = '';
      this.publish();
    };
    contents.on('did-navigate', updateUrl);
    contents.on('did-navigate-in-page', updateUrl);
    contents.on('page-title-updated', (_event, title) => {
      if (!this.tab(tab.id)) return;
      tab.title = title || new URL(tab.url).hostname;
      this.publish();
    });
    contents.on('did-start-loading', () => {
      if (!this.tab(tab.id)) return;
      tab.loading = true;
      this.publish();
    });
    contents.on('did-stop-loading', () => {
      if (!this.tab(tab.id)) return;
      tab.loading = false;
      this.publish();
    });
    contents.on(
      'did-fail-load',
      (_event, code, description, _url, mainFrame) => {
        if (!mainFrame || code === -3 || !this.tab(tab.id)) return;
        tab.loading = false;
        tab.error = description;
        this.publish();
      },
    );
    this.views.set(tab.id, view);
    return view;
  }

  private newTab(url?: string): void {
    const tab: BrowserTab = {
      id: String(++this.nextTabId),
      title: 'Nova aba',
      url: '',
      loading: false,
      error: '',
      savedTitle: '',
    };
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.showActiveTab();
    if (url) this.navigate(url);
  }

  private navigate(input: string, saved?: SavedUrl): void {
    if (!input.trim()) {
      const tab = this.tab(this.activeTabId);
      if (!tab) return;
      const view = this.views.get(tab.id);
      if (view) {
        if (view === this.activeView) {
          this.window.contentView.removeChildView(view);
          this.activeView = null;
        }
        this.views.delete(tab.id);
        view.webContents.close();
      }
      Object.assign(tab, {
        url: '',
        title: 'Nova aba',
        savedTitle: '',
        loading: false,
        error: '',
      });
      this.publish();
      return;
    }
    const url = addressUrl(input);
    const tab = this.tab(this.activeTabId);
    if (!tab) return;
    const view = this.views.get(tab.id) ?? this.createView(tab);
    tab.url = url;
    tab.title = new URL(url).hostname;
    tab.savedTitle = saved
      ? `${saved.folder} / ${saved.name}`
      : savedTitleForUrl(url, this.savedUrls, tab.savedTitle);
    tab.loading = true;
    tab.error = '';
    this.showActiveTab();
    void view.webContents.loadURL(url).catch((error: unknown) => {
      if (!this.tab(tab.id) || String(error).includes('ERR_ABORTED')) return;
      tab.loading = false;
      tab.error = String(error);
      this.publish();
    });
  }

  private closeTab(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const view = this.views.get(id);
    if (view) {
      if (view === this.activeView) {
        this.window.contentView.removeChildView(view);
        this.activeView = null;
      }
      this.views.delete(id);
      view.webContents.close();
    }
    this.tabs.splice(index, 1);
    if (!this.tabs.length) {
      this.newTab();
    } else if (this.activeTabId === id) {
      this.activeTabId = this.tabs[Math.min(index, this.tabs.length - 1)].id;
      this.showActiveTab();
    } else {
      this.publish();
    }
  }

  private closeTabs(ids: string[], fallbackId: string): void {
    const closing = new Set(ids);
    if (!this.tabs.some((tab) => closing.has(tab.id))) return;
    const first = this.tabs.findIndex((tab) => closing.has(tab.id));
    for (const id of closing) {
      const view = this.views.get(id);
      if (!view) continue;
      if (view === this.activeView) {
        this.window.contentView.removeChildView(view);
        this.activeView = null;
      }
      this.views.delete(id);
      view.webContents.close();
    }
    const remaining = this.tabs.filter((tab) => !closing.has(tab.id));
    this.tabs.splice(0, this.tabs.length, ...remaining);
    if (!this.tabs.length) {
      this.newTab();
    } else {
      this.activeTabId =
        this.tab(fallbackId)?.id ??
        this.tabs[Math.min(first, this.tabs.length - 1)].id;
      this.showActiveTab();
    }
  }

  private showTabMenu(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    Menu.buildFromTemplate([
      {
        label: 'Abrir DevTools',
        enabled: this.views.has(id),
        click: () => {
          this.activeTabId = id;
          this.showActiveTab();
          this.views.get(id)?.webContents.openDevTools({ mode: 'detach' });
        },
      },
      { type: 'separator' },
      { label: 'Fechar', click: () => this.closeTab(id) },
      {
        label: 'Fechar outras',
        enabled: this.tabs.length > 1,
        click: () =>
          this.closeTabs(
            this.tabs.filter((tab) => tab.id !== id).map((tab) => tab.id),
            id,
          ),
      },
      {
        label: 'Fechar guias à esquerda',
        enabled: index > 0,
        click: () =>
          this.closeTabs(
            this.tabs.slice(0, index).map((tab) => tab.id),
            id,
          ),
      },
      {
        label: 'Fechar guias à direita',
        enabled: index < this.tabs.length - 1,
        click: () =>
          this.closeTabs(
            this.tabs.slice(index + 1).map((tab) => tab.id),
            id,
          ),
      },
    ]).popup({ window: this.window });
  }

  async command(command: BrowserCommand): Promise<void> {
    switch (command?.type) {
      case 'download-action': {
        const download = this.downloads.find(
          (entry) => entry.id === command.id,
        );
        if (!download) throw new Error('Download não encontrado.');
        const item = this.downloadItems.get(download.id);
        if (command.action === 'show') {
          if (!download.path || !existsSync(download.path))
            throw new Error('Arquivo ainda não está disponível.');
          shell.showItemInFolder(download.path);
        } else if (command.action === 'cancel' && item) {
          item.cancel();
        } else if (command.action === 'pause' && item) {
          item.pause();
          download.status = 'paused';
          this.publish();
        } else if (command.action === 'resume' && item && item.canResume()) {
          item.resume();
          download.status = 'progressing';
          this.publish();
        }
        break;
      }
      case 'clear-downloads':
        this.downloads.splice(
          0,
          this.downloads.length,
          ...this.downloads.filter((entry) => this.downloadItems.has(entry.id)),
        );
        this.saveDownloads();
        this.publish();
        break;
      case 'new-tab':
        this.newTab(command.url);
        break;
      case 'navigate':
        this.navigate(command.url, command.saved);
        this.closePopup();
        break;
      case 'select-tab':
        if (this.tab(command.id)) {
          this.activeTabId = command.id;
          this.showActiveTab();
        }
        break;
      case 'close-tab':
        this.closeTab(command.id);
        break;
      case 'close-tabs':
        this.closeTabs(command.ids, command.fallbackId);
        break;
      case 'show-tab-menu':
        this.showTabMenu(command.id);
        break;
      case 'save-environment': {
        const entry = {
          folder: command.entry.folder.trim(),
          name: command.entry.name.trim(),
          url: addressUrl(command.entry.url),
        };
        if (!entry.folder || !entry.name)
          throw new Error('Informe pasta e apelido.');
        const next = this.savedUrls.filter(
          (item) => item.folder !== entry.folder || item.name !== entry.name,
        );
        next.push(entry);
        writeSettings(next, this.theme);
        this.savedUrls = next;
        const active = this.tab(this.activeTabId);
        if (active) active.savedTitle = `${entry.folder} / ${entry.name}`;
        this.publish();
        this.closePopup();
        break;
      }
      case 'remove-environment': {
        const next = this.savedUrls.filter(
          (item) =>
            item.folder !== command.entry.folder ||
            item.name !== command.entry.name,
        );
        writeSettings(next, this.theme);
        this.savedUrls = next;
        this.tabs.forEach((tab) => {
          tab.savedTitle = savedTitleForUrl(tab.url, next, tab.savedTitle);
        });
        this.publish();
        break;
      }
      case 'import-environments': {
        const result = await dialog.showOpenDialog(this.window, {
          title: 'Importar bases salvas',
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePaths[0]) break;
        const input: unknown = JSON.parse(
          readFileSync(result.filePaths[0], 'utf8'),
        );
        const imported = importedSavedUrls(input);
        const next = [...this.savedUrls];
        for (const item of imported) {
          const entry = {
            folder: item.folder.trim(),
            name: item.name.trim(),
            url: addressUrl(item.url),
          };
          if (!entry.folder || !entry.name)
            throw new Error('Base sem pasta ou apelido.');
          if (
            !next.some(
              (saved) =>
                saved.folder === entry.folder && saved.name === entry.name,
            )
          )
            next.push(entry);
        }
        writeSettings(next, this.theme);
        this.savedUrls = next;
        this.tabs.forEach((tab) => {
          tab.savedTitle = savedTitleForUrl(tab.url, next, tab.savedTitle);
        });
        this.publish();
        break;
      }
      case 'set-theme':
        if (command.theme !== 'light' && command.theme !== 'dark')
          throw new Error('Tema inválido.');
        writeSettings(this.savedUrls, command.theme);
        this.theme = command.theme;
        nativeTheme.themeSource = command.theme;
        this.publish();
        this.closePopup();
        break;
      case 'toggle-popup':
        if (!['sites', 'theme', 'save', 'downloads'].includes(command.popup))
          throw new Error('Popup inválido.');
        this.togglePopup(command.popup, command.anchor);
        break;
      case 'close-popup':
        this.closePopup();
        break;
      case 'back':
      case 'forward': {
        const history = this.views.get(this.activeTabId)?.webContents
          .navigationHistory;
        if (command.type === 'back' && history?.canGoBack()) history.goBack();
        if (command.type === 'forward' && history?.canGoForward())
          history.goForward();
        break;
      }
      case 'reload':
        this.views.get(this.activeTabId)?.webContents.reload();
        break;
      case 'minimize':
        this.window.minimize();
        break;
      case 'toggle-maximize':
        if (this.window.isMaximized()) this.window.unmaximize();
        else this.window.maximize();
        break;
      case 'close-window':
        this.window.close();
        break;
      default:
        throw new Error('Comando de navegador inválido.');
    }
  }
}

let controller: BrowserController | null = null;

function authorized(sender: Electron.WebContents): BrowserController {
  if (!controller || !controller.owns(sender)) {
    throw new Error('Acesso negado ao navegador.');
  }
  return controller;
}

ipcMain.handle('browser:get-state', (event) =>
  authorized(event.sender).state(),
);
ipcMain.handle('browser:command', (event, command: BrowserCommand) =>
  authorized(event.sender).command(command),
);

export function attachBrowserWindow(window: BrowserWindow): void {
  controller = new BrowserController(window);
  window.once('closed', () => {
    controller = null;
  });
}
