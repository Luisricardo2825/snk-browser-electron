import { BrowserWindow, Menu, WebContentsView } from "electron";
import type { BrowserState, BrowserTab, SavedUrl } from "@shared/browser";
import { CHROME_HEIGHT } from "@shared/browser";
import BrowserDownloads from "./BrowserDownloads";
import BrowserSettings from "./BrowserSettings";
import type { TabSession } from "./BrowserSettings";
import BrowserViewFactory from "./BrowserViewFactory";

export default class BrowserTabs {
  private readonly tabs: BrowserTab[] = [];
  private readonly views = new Map<string, WebContentsView>();
  private activeTabId = "";
  private activeView: WebContentsView | null = null;
  private nextTabId = 0;
  private readonly viewFactory: BrowserViewFactory;

  constructor(
    private readonly window: BrowserWindow,
    private readonly settings: BrowserSettings,
    private readonly downloads: BrowserDownloads,
    private readonly onChange: () => void,
  ) {
    this.viewFactory = new BrowserViewFactory(
      window,
      settings,
      downloads,
      this.views,
      (id) => Boolean(this.tab(id)),
      (url) => this.newTab(url),
      onChange,
    );
  }

  snapshot(): Pick<
    BrowserState,
    "tabs" | "activeTabId" | "canGoBack" | "canGoForward"
  > {
    const active = this.views.get(this.activeTabId);
    return {
      tabs: this.tabs.map((tab) => ({ ...tab })),
      activeTabId: this.activeTabId,
      canGoBack: active?.webContents.navigationHistory.canGoBack() ?? false,
      canGoForward:
        active?.webContents.navigationHistory.canGoForward() ?? false,
    };
  }

  session(): TabSession {
    return {
      urls: this.tabs.map((tab) => tab.url),
      activeIndex: this.tabs.findIndex((tab) => tab.id === this.activeTabId),
    };
  }

  restore(session?: TabSession): void {
    if (!session) {
      this.newTab();
      return;
    }
    session.urls.forEach((url) => this.newTab(url || undefined));
    this.selectTab(this.tabs[session.activeIndex].id);
  }

  selectTab(id: string): void {
    if (!this.tab(id)) return;
    this.activeTabId = id;
    this.showActiveTab();
  }

  setActiveSavedTitle(title: string): void {
    const active = this.tab(this.activeTabId);
    if (active) active.savedTitle = title;
  }

  navigateHistory(direction: "back" | "forward"): void {
    const history = this.views.get(this.activeTabId)?.webContents
      .navigationHistory;
    if (direction === "back" && history?.canGoBack()) history.goBack();
    if (direction === "forward" && history?.canGoForward()) history.goForward();
  }

  reload(): void {
    this.views.get(this.activeTabId)?.webContents.reload();
  }

  refreshSavedTitles(savedUrls: SavedUrl[]): void {
    this.tabs.forEach((tab) => {
      tab.savedTitle = this.settings.savedTitleForUrl(
        tab.url,
        savedUrls,
        tab.savedTitle,
      );
    });
  }

  private tab(id: string): BrowserTab | undefined {
    return this.tabs.find((tab) => tab.id === id);
  }

  layout(): void {
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
    this.onChange();
  }

  newTab(url?: string): void {
    const tab: BrowserTab = {
      id: String(++this.nextTabId),
      title: "Nova aba",
      url: "",
      loading: false,
      error: "",
      savedTitle: "",
    };
    this.tabs.push(tab);
    this.activeTabId = tab.id;
    this.showActiveTab();
    if (url) this.navigate(url);
  }

  navigate(input: string, saved?: SavedUrl): void {
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
        url: "",
        title: "Nova aba",
        savedTitle: "",
        loading: false,
        error: "",
      });
      this.onChange();
      return;
    }
    const url = this.settings.addressUrl(input);
    const tab = this.tab(this.activeTabId);
    if (!tab) return;
    const view = this.views.get(tab.id) ?? this.viewFactory.createView(tab);
    tab.url = url;
    tab.title = new URL(url).hostname;
    tab.savedTitle = saved
      ? `${saved.folder} / ${saved.name}`
      : this.settings.savedTitleForUrl(
          url,
          this.settings.savedUrls,
          tab.savedTitle,
        );
    tab.loading = true;
    tab.error = "";
    this.showActiveTab();
    void view.webContents.loadURL(url).catch((error: unknown) => {
      if (!this.tab(tab.id) || String(error).includes("ERR_ABORTED")) return;
      tab.loading = false;
      tab.error = String(error);
      this.onChange();
    });
  }

  closeTab(id: string): void {
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
      this.onChange();
    }
  }

  closeTabs(ids: string[], fallbackId: string): void {
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

  showTabMenu(id: string): void {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    Menu.buildFromTemplate([
      {
        label: "Abrir DevTools",
        enabled: this.views.has(id),
        click: () => {
          this.activeTabId = id;
          this.showActiveTab();
          this.views.get(id)?.webContents.openDevTools({ mode: "detach" });
        },
      },
      { type: "separator" },
      { label: "Fechar", click: () => this.closeTab(id) },
      {
        label: "Fechar outras",
        enabled: this.tabs.length > 1,
        click: () =>
          this.closeTabs(
            this.tabs.filter((tab) => tab.id !== id).map((tab) => tab.id),
            id,
          ),
      },
      {
        label: "Fechar guias à esquerda",
        enabled: index > 0,
        click: () =>
          this.closeTabs(
            this.tabs.slice(0, index).map((tab) => tab.id),
            id,
          ),
      },
      {
        label: "Fechar guias à direita",
        enabled: index < this.tabs.length - 1,
        click: () =>
          this.closeTabs(
            this.tabs.slice(index + 1).map((tab) => tab.id),
            id,
          ),
      },
    ]).popup({ window: this.window });
  }
}
