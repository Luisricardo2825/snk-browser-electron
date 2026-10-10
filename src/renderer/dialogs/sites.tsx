import type { RouteProps } from "@/@types/popup";
import SiteIcon from "@/components/browser/SiteIcon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandEmpty,
} from "@/components/ui/command";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { SavedUrl } from "@shared/browser";
import { Check, Download, Trash, Upload } from "lucide-react";
import { useEffect, useRef } from "react";
import { useOutletContext } from "react-router";

const SitesPopup = ({ state, error, run }: RouteProps) => {
  const searchRef = useRef<HTMLInputElement>(null);

  const groups = state.savedUrls.reduce<Record<string, SavedUrl[]>>(
    (result, entry) => {
      (result[entry.folder] ??= []).push(entry);
      return result;
    },
    {},
  );
  const choose = (entry?: SavedUrl) => {
    void run({ type: "navigate", url: entry?.url ?? "", saved: entry });
  };
  const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
  const activeSavedTitle = activeTab?.savedTitle;

  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  return (
    <div className="fixed inset-0 flex h-screen w-screen overflow-hidden bg-transparent">
      <SiteContextMenu>
        <Command className="h-full min-h-0 min-w-0 flex-1 rounded-lg border border-[#dedede] bg-[#fafafa] p-0 text-[#171717] shadow-lg dark:border-[#353535] dark:bg-[#171717] dark:text-[#f5f5f5]">
          <CommandInput
            ref={searchRef}
            wrapperClassName="shrink-0 border-b border-[#dedede] p-0 dark:border-[#333333]"
            inputGroupClassName="h-11 rounded-none border-0 bg-transparent shadow-none dark:bg-transparent"
            className="h-11 rounded-none bg-transparent px-1 text-sm shadow-none placeholder:text-[#8b8b8b] focus-visible:ring-0 dark:bg-transparent"
            placeholder="Buscar base..."
          />
          <CommandList className="min-h-0 max-h-none flex-1 overflow-y-auto p-1.5">
            <CommandEmpty className="text-muted-foreground">
              Nenhuma base encontrada.
            </CommandEmpty>
            {Object.entries(groups || {}).map(([group, entries]) => (
              <CommandGroup key={group} heading={group}>
                {entries?.map((entry) => (
                  <CommandItem
                    key={`${entry.folder}/${entry.name}`}
                    value={`${entry.folder} ${entry.name} ${entry.url}`}
                    className={`h-9 rounded-md [&>svg:last-child]:hidden ${
                      activeSavedTitle === `${entry.folder} / ${entry.name}`
                        ? "bg-[#e8e8e8] text-[#171717] dark:bg-[#2a2a2d] dark:text-[#f5f5f5]"
                        : ""
                    }`}
                    onSelect={() => choose(entry)}
                  >
                    <SiteIcon key={entry?.url ?? ""} url={entry?.url ?? ""} />
                    <span className="min-w-0 flex-1 truncate">
                      {entry.name}
                    </span>
                    {activeSavedTitle === `${entry.folder} / ${entry.name}` && (
                      <Check
                        className="size-4 text-primary"
                        aria-label="Ativa"
                      />
                    )}
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 opacity-0 hover:text-destructive group-hover/command-item:opacity-100 focus-visible:opacity-100"
                      aria-label={`Remover ambiente ${entry.name}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void run({ type: "remove-environment", entry });
                      }}
                    >
                      <Trash />
                    </Button>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div className="flex flex-row min-w-screen justify-center items-center shrink-0 border-t p-1.5 ">
            {error && (
              <p className="px-3 pb-2 text-xs text-destructive">{error}</p>
            )}
          </div>
        </Command>
      </SiteContextMenu>
    </div>
  );
};

const SiteContextMenu = ({ children }: { children: React.ReactNode }) => {
  const { run } = useOutletContext<RouteProps>();

  return (
    <ContextMenu>
      <ContextMenuTrigger className="block h-full w-full">
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuItem
            onClick={() => void run({ type: "import-environments" })}
          >
            <Upload /> Importar ambientes
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => void run({ type: "export-environments" })}
          >
            <Download /> Exportar ambientes
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default SitesPopup;
