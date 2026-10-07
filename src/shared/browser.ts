export const CHROME_HEIGHT = 76;

export type Theme = 'light' | 'dark';
export type PopupKind = 'sites' | 'theme' | 'save' | 'downloads';
export interface BrowserDownload {
  id: string;
  name: string;
  path: string;
  receivedBytes: number;
  totalBytes: number;
  status: 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';
}
export interface SavedUrl {
  folder: string;
  name: string;
  url: string;
}
export interface PopupAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  error: string;
  savedTitle: string;
}

export interface BrowserState {
  downloads: BrowserDownload[];
  tabs: BrowserTab[];
  activeTabId: string;
  canGoBack: boolean;
  canGoForward: boolean;
  maximized: boolean;
  savedUrls: SavedUrl[];
  theme: Theme;
  popup: PopupKind | null;
}

export type BrowserCommand =
  | {
      type: 'download-action';
      id: string;
      action: 'pause' | 'resume' | 'cancel' | 'show';
    }
  | { type: 'clear-downloads' }
  | { type: 'new-tab'; url?: string }
  | { type: 'navigate'; url: string; saved?: SavedUrl }
  | { type: 'select-tab'; id: string }
  | { type: 'close-tab'; id: string }
  | { type: 'close-tabs'; ids: string[]; fallbackId: string }
  | { type: 'show-tab-menu'; id: string }
  | { type: 'save-environment'; entry: SavedUrl }
  | { type: 'remove-environment'; entry: SavedUrl }
  | { type: 'import-environments' }
  | { type: 'set-theme'; theme: Theme }
  | { type: 'toggle-popup'; popup: PopupKind; anchor?: PopupAnchor }
  | { type: 'close-popup' }
  | { type: 'back' | 'forward' | 'reload' }
  | { type: 'minimize' | 'toggle-maximize' | 'close-window' };
