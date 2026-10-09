import type { RouteProps } from "@/@types/popup";
import SiteIcon from "@/components/browser/SiteIcon";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { SavedUrl } from "@shared/browser";
import { defaultFilter } from "cmdk";
import { ChevronDownIcon, Trash } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useOutletContext } from "react-router";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const SitesPopup = ({ state, error, run }: RouteProps) => {
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const searching = search.trim().length > 0;

  const groups = state.savedUrls.reduce<Record<string, SavedUrl[]>>(
    (result, entry) => {
      (result[entry.folder] ??= []).push(entry);
      return result;
    },
    {},
  );
  const choose = (entry: SavedUrl) => {
    void run({ type: "navigate", url: entry.url, saved: entry });
  };

  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  return (
    <SiteContextMenu>
      <Command className="h-screen rounded-none border bg-popover text-popover-foreground">
        <CommandInput
          ref={searchRef}
          placeholder="Buscar base..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList className="min-h-0 max-h-fit flex-1 overflow-y-auto gap-5 mt-5 rounded-2xl">
          {Object.entries(groups).map(([group, entries]) => (
            <Collapsible
              key={group}
              render={CommandGroup}
              className="bg-secondary/40 border border-secondary/50 shadow "
              open={
                searching
                  ? entries.some(
                      (entry) => defaultFilter(entryValue(entry), search) > 0,
                    )
                  : (openGroups[group] ?? false)
              }
              onOpenChange={(open) =>
                setOpenGroups((current) => ({ ...current, [group]: open }))
              }
            >
              <CollapsibleTrigger
                disabled={searching}
                className="group/collapsible-trigger flex min-h-9 w-full items-center justify-between rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-sm">{group}</span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-4 transition-transform duration-200 group-aria-expanded/collapsible-trigger:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsibleContent
                className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-starting-style:h-0 data-ending-style:h-0 motion-reduce:transition-none"
                keepMounted
              >
                {entries?.map((entry) => (
                  <CommandItem
                    key={`${entry.folder}/${entry.name}`}
                    value={entryValue(entry)}
                    onSelect={() => choose(entry)}
                  >
                    <SiteIcon key={entry?.url ?? ""} url={entry?.url ?? ""} />
                    <span className="min-w-0 flex-1 truncate">
                      {entry.name}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 hover:text-destructive"
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
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CommandList>
        {error && (
          <p className="border-t px-3 py-2 text-xs text-destructive">{error}</p>
        )}
      </Command>
    </SiteContextMenu>
  );
};

const entryValue = (entry: SavedUrl) =>
  `${entry.folder} ${entry.name} ${entry.url}`;

const SiteContextMenu = ({ children }: { children: React.ReactNode }) => {
  const { run } = useOutletContext<RouteProps>();

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuGroup>
          <ContextMenuItem
            onClick={() => void run({ type: "import-environments" })}
          >
            Importar ambientes
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => void run({ type: "export-environments" })}
          >
            Exportar ambientes
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default SitesPopup;
