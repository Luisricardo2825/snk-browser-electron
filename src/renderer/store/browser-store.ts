import { create } from "zustand";
import type { BrowserSnapshot } from "@shared/browser";

type BrowserStore = {
  snapshot: BrowserSnapshot | null;
  accept: (next: BrowserSnapshot) => void;
};

export const useBrowserStore = create<BrowserStore>((set, get) => ({
  snapshot: null,
  accept(next) {
    if (next.revision <= (get().snapshot?.revision ?? -1)) return;
    set({ snapshot: next });
  },
}));

let stopListening: (() => void) | undefined;

export function startBrowserEvents(): void {
  stopListening ??= window.electron.browser.onState((snapshot) => {
    useBrowserStore.getState().accept(snapshot);
  });
}
