import type { BrowserCommand } from "@shared/browser";
import { useEffect, useState } from "react";
import type { browserLoader } from "@/routes/browser-loader";
import { useBrowserStore } from "@/store/browser-store";

export function useBrowser(initial: Awaited<ReturnType<typeof browserLoader>>) {
  const state =
    useBrowserStore((store) => store.snapshot?.state) ?? initial.state;
  const [error, setError] = useState(initial.error);
  const run = (command: BrowserCommand): Promise<void> => {
    setError("");
    return window.electron.browser
      .command(command)
      .catch((cause) => setError(String(cause)));
  };
  const theme = state?.theme;
  useEffect(() => {
    if (theme)
      document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return { state, error, run };
}
