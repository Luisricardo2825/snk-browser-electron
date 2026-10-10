import { FolderOpen, Pause, Play, Trash2, X } from "lucide-react";
import { Fragment, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress, ProgressTrack } from "@/components/ui/progress";
import { RouteProps } from "@/@types/popup";
import { ScrollArea } from "@/components/ui/scroll-area";

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value < 1024 * 1024 * 1024 * 1024)
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function DownloadsPopup({ state, error, run }: RouteProps) {
  const action = (id: string, value: "pause" | "resume" | "cancel" | "show") =>
    run({ type: "download-action", id, action: value });
  const finished = state.downloads.some(
    (download) =>
      download.status === "completed" ||
      download.status === "cancelled" ||
      download.status === "interrupted",
  );

  const handleStatus: (
    status: string,
  ) =>
    "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" = (
    status: string,
  ) => {
    switch (status) {
      case "progressing":
        return "outline";
      case "paused":
        return "secondary";
      case "completed":
        return "default";
      case "cancelled":
        return "destructive";
      case "interrupted":
        return "destructive";
      default:
        return "default";
    }
  };

  useEffect(() => {
    if (error) {
      alert(error);
    }
  }, [error]);
  return (
    <div
      className="flex h-screen flex-col bg-popover text-popover-foreground"
      onBlur={() => {
        window.close();
      }}
    >
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <h1 className="text-sm font-medium">Downloads</h1>
        {finished && (
          <Button
            variant="ghost"
            size="icon-xs"
            title="Limpar histórico"
            aria-label="Limpar histórico"
            onClick={() => void run({ type: "clear-downloads" })}
          >
            <Trash2 />
          </Button>
        )}
      </header>
      <Separator />
      <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
        {state.downloads.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nenhum download.
          </p>
        ) : (
          state.downloads.map((download, index) => {
            const percent = download.totalBytes
              ? Math.min(
                  100,
                  Math.round(
                    (download.receivedBytes / download.totalBytes) * 100,
                  ),
                )
              : null;
            const active =
              download.status === "progressing" || download.status === "paused";
            const status = {
              progressing: percent === null ? "Baixando" : `${percent}%`,
              paused: "Pausado",
              completed: "Concluído",
              cancelled: "Cancelado",
              interrupted: "Interrompido",
            }[download.status];

            return (
              <Fragment key={download.id}>
                {index > 0 && <Separator />}
                <div className="group px-3 py-2 hover:bg-accent/50">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-medium"
                        title={download.name}
                      >
                        {download.name}
                      </p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant={handleStatus(download.status)}>
                          {status}
                        </Badge>
                        <span>{bytes(download.receivedBytes)}</span>
                      </div>
                    </div>
                    {download.status === "progressing" && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Pausar"
                        aria-label={`Pausar ${download.name}`}
                        onClick={() => action(download.id, "pause")}
                      >
                        <Pause />
                      </Button>
                    )}
                    {download.status === "paused" && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Retomar"
                        aria-label={`Retomar ${download.name}`}
                        onClick={() => action(download.id, "resume")}
                      >
                        <Play />
                      </Button>
                    )}
                    {active && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Cancelar"
                        aria-label={`Cancelar ${download.name}`}
                        onClick={() => action(download.id, "cancel")}
                      >
                        <X />
                      </Button>
                    )}
                    {download.status === "completed" && (
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        title="Mostrar na pasta"
                        aria-label={`Mostrar ${download.name} na pasta`}
                        className="opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                        onClick={() => action(download.id, "show")}
                      >
                        <FolderOpen />
                      </Button>
                    )}
                  </div>
                  {active && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                      <Progress
                        value={download.status === "paused" ? 0 : 100}
                        className="w-full animate-indeterminate"
                      >
                        <ProgressTrack
                          className={`w-full bg-red-400 ${download.status === "paused" ? "bg-gray-500/70" : "bg-green-500/50"}`}
                        />
                      </Progress>
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })
        )}
      </ScrollArea>
      <footer className="shrink-0 border-t px-3 py-2 text-xs">
        <p
          className="truncate text-muted-foreground"
          title={state.downloadDirectory}
        >
          {state.downloadDirectory}
        </p>
        {state.downloadDirectoryManaged ? (
          <p className="text-muted-foreground">
            Definida por SNK_BROWSER_DOWNLOAD_DIR
          </p>
        ) : (
          <div className="mt-1 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void run({ type: "select-download-directory" })}
            >
              Escolher pasta
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void run({ type: "reset-download-directory" })}
            >
              Usar padrão
            </Button>
          </div>
        )}
      </footer>
    </div>
  );
}
