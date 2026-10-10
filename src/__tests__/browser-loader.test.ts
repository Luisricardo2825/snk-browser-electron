import type { BrowserSnapshot, BrowserState } from "../shared/browser";
import { browserLoader } from "../renderer/routes/browser-loader";
import { useBrowserStore } from "../renderer/store/browser-store";

const state: BrowserState = {
  downloads: [],
  downloadDirectory: "",
  downloadDirectoryManaged: false,
  hasUnseenDownload: false,
  tabs: [],
  activeTabId: "",
  canGoBack: false,
  canGoForward: false,
  maximized: false,
  savedUrls: [],
  theme: "light",
  popup: null,
  webConnection: {
    autoStart: false,
    controlExternal: true,
    executablePath: "",
    port: 9098,
    status: "stopped",
    error: "",
  },
};

test("evento novo prevalece sobre resposta antiga de getState", async () => {
  let emit!: (snapshot: BrowserSnapshot) => void;
  let resolveState!: (snapshot: BrowserSnapshot) => void;
  window.electron = {
    browser: {
      getState: jest.fn().mockImplementation(
        () =>
          new Promise<BrowserSnapshot>((resolve) => {
            resolveState = resolve;
          }),
      ),
      command: jest.fn().mockResolvedValue(undefined),
      resizePopup: jest.fn().mockResolvedValue(undefined),
      onState: jest.fn().mockImplementation((listener) => {
        emit = listener;
        return () => {};
      }),
    },
  };

  const pending = browserLoader();
  const newer = { revision: 2, state: { ...state, theme: "dark" as const } };
  emit(newer);
  resolveState({ revision: 1, state });

  expect(await pending).toEqual({ state: newer.state, error: "" });
  expect(useBrowserStore.getState().snapshot).toBe(newer);
});
