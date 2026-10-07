import { ElectronHandler } from "../main/preload/preload";

declare global {
  interface Window {
    electron: ElectronHandler;
  }
}

export {};
