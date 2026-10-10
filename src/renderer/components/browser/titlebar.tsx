import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type SubmitEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Download,
  List,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  Printer,
  RotateCw,
  Sun,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";

import { BrowserTabs } from "@/components/custom/tabs";
import type {
  BrowserCommand,
  BrowserState,
  PopupAnchor,
  PopupKind,
} from "@shared/browser";
import SiteIcon from "./SiteIcon";

function anchorOf(event: MouseEvent<HTMLElement>): PopupAnchor {
  const { x, y, width, height } = event.currentTarget.getBoundingClientRect();
  return { x, y, width, height };
}

function BrowserTitleBar({
  state,
  error,
  run,
}: {
  state: BrowserState | null;
  error: string;
  run: (command: BrowserCommand) => Promise<void>;
}) {
  const tab = state?.tabs.find((item) => item.id === state.activeTabId);
  const activeDownloads =
    state?.downloads.filter(
      (item) => item.status === "progressing" || item.status === "paused",
    ) ?? [];
  const totalBytes = activeDownloads.reduce(
    (total, item) => total + item.totalBytes,
    0,
  );
  const progress =
    totalBytes > 0 && activeDownloads.every((item) => item.totalBytes > 0)
      ? Math.min(
          100,
          Math.round(
            (activeDownloads.reduce(
              (total, item) => total + item.receivedBytes,
              0,
            ) /
              totalBytes) *
              100,
          ),
        )
      : null;
  const [draft, setDraft] = useState<{ id: string; value: string } | null>(
    null,
  );
  const address =
    draft && draft.id === state?.activeTabId ? draft.value : (tab?.url ?? "");
  const addressRef = useRef<HTMLInputElement>(null);
  const tabId = tab?.id;
  const tabUrl = tab?.url;

  useEffect(() => {
    if (tabId && !tabUrl) addressRef.current?.focus();
  }, [tabId, tabUrl]);

  const navigate = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run({ type: "navigate", url: address });
    setDraft(null);
  };

  const toggle = (popup: PopupKind, event: MouseEvent<HTMLElement>) => {
    void run({ type: "toggle-popup", popup, anchor: anchorOf(event) });
  };

  return (
    <header className="relative z-10 bg-background">
      <div className="flex h-8 select-none items-center border-b text-xs text-muted-foreground">
        <Button
          variant="ghost"
          size="icon-xs"
          className="h-8 w-10 shrink-0 rounded-none"
          aria-label="Selecionar base"
          title="Selecionar base"
          onClick={(event) => toggle("sites", event)}
        >
          <List />
        </Button>
        <BrowserTabs
          tabs={state?.tabs ?? []}
          activeTabId={state?.activeTabId ?? ""}
          onAdd={() => void run({ type: "new-tab" })}
          onClose={(id) => void run({ type: "close-tab", id })}
          onMenu={(id) => void run({ type: "show-tab-menu", id })}
          onSelect={(id) => void run({ type: "select-tab", id })}
        />
        <div
          className={`${state?.popup ? "" : "drag-region"} h-full min-w-12 flex-1`}
        />
        <div className="flex h-full shrink-0 items-stretch">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Web Connection"
            title={`Web Connection: ${state?.webConnection.status ?? "verificando"}`}
            className="relative rounded-sm"
            onClick={(event) => toggle("web-connection", event)}
          >
            <Printer />
            <span
              className={`absolute right-1 bottom-1 size-2 rounded-full ring-2 ring-background ${
                state?.webConnection.status === "running"
                  ? "bg-emerald-500"
                  : state?.webConnection.status === "error"
                    ? "bg-destructive"
                    : "bg-muted-foreground"
              }`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-11 rounded-none"
            aria-label="Minimizar"
            onClick={() => void run({ type: "minimize" })}
          >
            <Minus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-11 rounded-none"
            aria-label={state?.maximized ? "Restaurar" : "Maximizar"}
            onClick={() => void run({ type: "toggle-maximize" })}
          >
            {state?.maximized ? <Minimize2 /> : <Maximize2 />}
          </Button>
          <Button
            variant="ghost"
            size="icon-lg"
            className="h-8 w-11 rounded-none hover:bg-red-500! hover:text-white!"
            aria-label="Fechar janela"
            onClick={() => void run({ type: "close-window" })}
          >
            <X />
          </Button>
        </div>
      </div>
      <nav
        className="relative flex h-11 items-center gap-1 border-b px-2"
        aria-label="Navegação"
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Voltar"
          disabled={!state?.canGoBack}
          onClick={() => void run({ type: "back" })}
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Avançar"
          disabled={!state?.canGoForward}
          onClick={() => void run({ type: "forward" })}
        >
          <ArrowRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Recarregar"
          disabled={!tab?.url}
          onClick={() => void run({ type: "reload" })}
        >
          {tab?.loading ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <RotateCw />
          )}
        </Button>
        <form
          className={`flex min-w-32 flex-1 items-center rounded-full border bg-input/30 pl-2 focus-within:ring-2 focus-within:ring-ring ${tab?.error || error ? "border-destructive" : ""}`}
          onSubmit={navigate}
          title={tab?.error || error || undefined}
        >
          <SiteIcon key={tab?.url ?? ""} url={tab?.url ?? ""} />
          <Input
            ref={addressRef}
            className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-0"
            aria-label="URL do Sankhya"
            value={address}
            placeholder="https://empresa.sankhyacloud.com.br/mge/"
            spellCheck={false}
            onChange={(event) =>
              setDraft({
                id: state?.activeTabId ?? "",
                value: event.target.value,
              })
            }
            onFocus={(event) => event.currentTarget.select()}
          />
        </form>

        <ButtonGroup aria-label="Ações do navegador">
          <Button
            variant="outline"
            size="sm"
            className="relative"
            aria-label="Downloads"
            title={
              activeDownloads.length
                ? `Downloads: ${progress === null ? "em andamento" : `${progress}%`}`
                : "Downloads"
            }
            onClick={(event) => toggle("downloads", event)}
          >
            <Download />
            {activeDownloads.length > 0 && (
              <span
                className={`absolute inset-x-0 bottom-0 h-1 bg-primary ${progress === null ? "animate-pulse" : ""}`}
                style={
                  progress === null ? undefined : { width: `${progress}%` }
                }
              />
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Tema"
            title="Tema"
            onClick={(event) => toggle("theme", event)}
          >
            <Sun className="dark:hidden" />
            <Moon className="hidden dark:block" />
          </Button>
          <Button
            variant="default"
            size="sm"
            aria-label="Salvar URL"
            title="Salvar URL"
            disabled={!tab?.url}
            onClick={(event) => toggle("save", event)}
            className={"rounded-md border-primary/60"}
          >
            <BookmarkPlus />
          </Button>
        </ButtonGroup>
        {tab?.loading && (
          <span className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary" />
        )}
      </nav>
    </header>
  );
}

export default BrowserTitleBar;
