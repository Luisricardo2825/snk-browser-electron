import { BrowserCommand, BrowserState } from '@shared/browser';

export type RouteProps = {
  state: BrowserState;
  error: string;
  run: (command: BrowserCommand) => Promise<void>;
};
