import type { BrowserCommand, BrowserState } from '@shared/browser';
import { useEffect, useState } from 'react';

export function useBrowser() {
  const [state, setState] = useState<BrowserState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const stop = window.electron.browser.onState(setState);
    void window.electron.browser
      .getState()
      .then(setState)
      .catch((cause) => setError(String(cause)));
    return stop;
  }, []);
  const run = (command: BrowserCommand): Promise<void> => {
    setError('');
    return window.electron.browser
      .command(command)
      .catch((cause) => setError(String(cause)));
  };
  const theme = state?.theme;
  useEffect(() => {
    if (theme)
      document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  return { state, error, run };
}
