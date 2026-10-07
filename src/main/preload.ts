import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { BrowserCommand, BrowserState } from '../shared/browser';

const electronHandler = {
  browser: {
    getState: (): Promise<BrowserState> =>
      ipcRenderer.invoke('browser:get-state'),
    command: (command: BrowserCommand): Promise<void> =>
      ipcRenderer.invoke('browser:command', command),
    onState: (listener: (state: BrowserState) => void): (() => void) => {
      const subscription = (_event: IpcRendererEvent, state: BrowserState) =>
        listener(state);
      ipcRenderer.on('browser:state', subscription);
      return () => ipcRenderer.removeListener('browser:state', subscription);
    },
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
