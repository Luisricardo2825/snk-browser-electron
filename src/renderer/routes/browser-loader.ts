import type { BrowserState } from "@shared/browser";
import { startBrowserEvents, useBrowserStore } from "@/store/browser-store";

const emptyState: BrowserState = {
  canGoBack: false,
  canGoForward: false,
  theme: "light",
  activeTabId: "",
  downloads: [],
  downloadDirectory: "",
  downloadDirectoryManaged: false,
  hasUnseenDownload: false,
  maximized: false,
  popup: null,
  savedUrls: [],
  webConnection: {
    autoStart: false,
    controlExternal: true,
    executablePath: "",
    port: 9098,
    status: "checking",
    error: "",
  },
  tabs: [],
};

export async function browserLoader() {
  startBrowserEvents();
  try {
    useBrowserStore.getState().accept(await window.electron.browser.getState());
    return { state: useBrowserStore.getState().snapshot!.state, error: "" };
  } catch (cause) {
    return {
      state: useBrowserStore.getState().snapshot?.state ?? emptyState,
      error: String(cause),
    };
  }
}
