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
import { Globe2, Import, Trash } from "lucide-react";
import { useEffect, useRef } from "react";

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

  useEffect(() => {
    searchRef.current?.focus();
  }, []);
  return (
    <Command className="h-screen rounded-none border bg-popover text-popover-foreground">
      <CommandInput ref={searchRef} placeholder="Buscar base..." />
      <CommandList className="max-h-92.5 overflow-y-auto">
        <CommandGroup heading="Navegação">
          <CommandItem onSelect={() => choose()}>
            <Globe2 />
            Tela inicial
          </CommandItem>
        </CommandGroup>
        {Object.entries(groups || {}).map(([group, entries]) => (
          <CommandGroup key={group} heading={group}>
            {entries?.map((entry) => (
              <CommandItem
                key={`${entry.folder}/${entry.name}`}
                value={`${entry.folder} ${entry.name} ${entry.url}`}
                onSelect={() => choose(entry)}
              >
                <SiteIcon key={entry?.url ?? ""} url={entry?.url ?? ""} />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
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
          </CommandGroup>
        ))}
      </CommandList>
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => void run({ type: "import-environments" })}
        >
          <Import /> Importar bases em JSON
        </Button>
      </div>
      {error && <p className="px-3 text-xs text-destructive">{error}</p>}
    </Command>
  );
};

export default SitesPopup;
