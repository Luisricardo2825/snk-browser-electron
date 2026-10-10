import { useLayoutEffect, useRef, useState } from "react";
import { Check, Printer, RefreshCw, Square } from "lucide-react";
import type { RouteProps } from "@/@types/popup";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export default function WebConnectionPopup({ state, run }: RouteProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{
    executablePath: string;
    port: string;
  } | null>(null);
  const executablePath =
    draft?.executablePath ?? state.webConnection.executablePath;
  const port = draft?.port ?? String(state.webConnection.port);

  const configure = (autoStart = state.webConnection.autoStart) =>
    run({
      type: "set-web-connection",
      autoStart,
      controlExternal: state.webConnection.controlExternal,
      executablePath,
      port: Number(port),
    });

  const status = {
    checking: "Verificando serviço",
    running: "Em execução",
    stopped: "Parado",
    error: "Falha no serviço",
  }[state.webConnection.status];

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const resizePopup = () => {
      window.electron.browser.resizePopup(
        content.getBoundingClientRect().height,
      );
    };
    const observer = new ResizeObserver(resizePopup);
    observer.observe(content);
    resizePopup();
    return () => {
      observer.disconnect();
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  return (
    <div
      ref={contentRef}
      className="flex flex-col bg-popover text-popover-foreground"
    >
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Printer className="size-4 text-primary" />
        <h1 className="text-sm font-medium">Web Connection</h1>
        <span
          className={`ml-auto size-2 rounded-full ${
            state.webConnection.status === "running"
              ? "bg-emerald-500"
              : state.webConnection.status === "error"
                ? "bg-destructive"
                : state.webConnection.status === "checking"
                  ? "animate-pulse bg-amber-500"
                  : "bg-muted-foreground"
          }`}
        />
      </header>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2 rounded-lg border p-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">{status}</div>
            <div className="truncate text-xs text-muted-foreground">
              {state.webConnection.error ||
                `localhost:${state.webConnection.port}`}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Verificar serviço"
            title="Verificar serviço"
            onClick={() =>
              void run({ type: "check-web-connection" }).then(() =>
                setDraft(null),
              )
            }
          >
            <RefreshCw />
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
          <div>
            <div className="text-sm font-medium">Iniciar com o navegador</div>
            <div className="text-xs text-muted-foreground">
              Abre o serviço junto com o SNK Browser
            </div>
          </div>
          <Switch
            aria-label="Iniciar Web Connection com o navegador"
            checked={state.webConnection.autoStart}
            onCheckedChange={(checked) => void configure(checked)}
          />
        </div>

        <Accordion className="rounded-lg">
          <AccordionItem value="advanced" className="border-0">
            <AccordionTrigger className="items-center p-2.5 hover:no-underline">
              Configurações avançadas
            </AccordionTrigger>
            <AccordionContent className="px-2.5">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                  <div>
                    <div className="text-sm font-medium">
                      Controlar serviço independente
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Permite parar o processo que estiver usando a porta
                      configurada
                    </div>
                  </div>
                  <Switch
                    aria-label="Controlar Web Connection independente"
                    checked={state.webConnection.controlExternal}
                    onCheckedChange={(checked) =>
                      void run({
                        type: "set-web-connection",
                        autoStart: state.webConnection.autoStart,
                        controlExternal: checked,
                        executablePath,
                        port: Number(port),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium"
                    htmlFor="web-connection-executable"
                  >
                    Executável
                  </label>
                  <div className="flex gap-1.5">
                    <Input
                      id="web-connection-executable"
                      className="h-8 min-w-0 text-xs"
                      value={executablePath}
                      placeholder="Selecione web_connection.exe"
                      onChange={(event) =>
                        setDraft({ executablePath: event.target.value, port })
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      onClick={() =>
                        void run({
                          type: "select-web-connection-executable",
                        }).then(() => setDraft(null))
                      }
                    >
                      Procurar
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label
                    className="text-xs font-medium"
                    htmlFor="web-connection-port"
                  >
                    Porta local
                  </label>
                  <Input
                    id="web-connection-port"
                    type="number"
                    min={1}
                    max={65535}
                    className="h-8 text-xs"
                    value={port}
                    onChange={(event) =>
                      setDraft({ executablePath, port: event.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Deve corresponder à porta configurada no Sankhya Om.
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="mt-auto flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={
              state.webConnection.status === "running" ||
              state.webConnection.status === "checking"
            }
            onClick={() =>
              void configure().then(() => run({ type: "start-web-connection" }))
            }
          >
            <Printer /> Iniciar serviço
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={state.webConnection.status !== "running"}
            onClick={() => void run({ type: "stop-web-connection" })}
          >
            <Square /> Parar serviço
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Salvar configuração"
            title="Salvar configuração"
            onClick={() => void configure()}
          >
            <Check />
          </Button>
        </div>
      </div>
    </div>
  );
}
