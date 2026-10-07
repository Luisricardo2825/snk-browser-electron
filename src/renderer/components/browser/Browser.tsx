import { useEffect, useRef } from "react";
import { Globe2 } from "lucide-react";
import BrowserTitleBar from "./titlebar";
import { useOutletContext } from "react-router";
import type { RouteProps } from "@/@types/popup";

function BrowserApp() {
  const { state, error, run } = useOutletContext<RouteProps>();
  const tab = state?.tabs.find((item) => item.id === state.activeTabId);

  const addressRef = useRef<HTMLInputElement>(null);
  const tabId = tab?.id;
  const tabUrl = tab?.url;

  useEffect(() => {
    if (tabId && !tabUrl) addressRef.current?.focus();
  }, [tabId, tabUrl]);

  return (
    <div className="h-screen bg-background text-foreground">
      <BrowserTitleBar error={error} run={run} state={state} />
      <main className="grid h-[calc(100vh-76px)] place-items-center">
        <section className="mx-5 max-w-lg rounded-4xl border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Globe2 className="size-6" />
          </div>
          <h1 className="text-lg font-semibold">Sankhya Browser</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione uma base salva ou informe a URL de um ambiente Sankhya
            para começar.
          </p>
          {(error || tab?.error) && (
            <p className="mt-3 text-sm text-destructive">
              {error || tab?.error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

export default BrowserApp;
