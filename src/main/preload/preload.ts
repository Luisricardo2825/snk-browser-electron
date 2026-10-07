import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { BrowserCommand, BrowserSnapshot } from "../../shared/browser";

const electronHandler = {
  browser: {
    getState: (): Promise<BrowserSnapshot> =>
      ipcRenderer.invoke("browser:get-state"),
    command: (command: BrowserCommand): Promise<void> =>
      ipcRenderer.invoke("browser:command", command),
    onState: (listener: (snapshot: BrowserSnapshot) => void): (() => void) => {
      const subscription = (
        _event: IpcRendererEvent,
        snapshot: BrowserSnapshot,
      ) => listener(snapshot);
      ipcRenderer.on("browser:state", subscription);
      return () => ipcRenderer.removeListener("browser:state", subscription);
    },
  },
};

contextBridge.exposeInMainWorld("electron", electronHandler);

export type ElectronHandler = typeof electronHandler;
