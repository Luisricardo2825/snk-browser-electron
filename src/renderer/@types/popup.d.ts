import { BrowserCommand, BrowserState } from '@shared/browser';

export type PopupProps = {
  state: BrowserState;
  error: string;
  run: (command: BrowserCommand) => Promise<void>;
};
