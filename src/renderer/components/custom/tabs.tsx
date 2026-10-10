import { useEffect, useRef, useState } from "react";
import { Globe2, LoaderCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrowserTab } from "../../../shared/browser";

function TabIcon({ url, loading }: { url: string; loading: boolean }) {
  const [failed, setFailed] = useState(false);
  if (loading) return <LoaderCircle className="size-3.5 animate-spin" />;
  if (!/^https?:/.test(url) || failed) return <Globe2 className="size-3.5" />;
  return (
    <img
      className="size-3.5 rounded-sm"
      src={`${new URL(url).origin}/favicon.ico`}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

export function BrowserTabs({
  tabs,
  activeTabId,
  onAdd,
  onClose,
  onMenu,
  onSelect,
}: {
  tabs: BrowserTab[];
  activeTabId: string;
  onAdd: () => void;
  onClose: (id: string) => void;
  onMenu: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    strip.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  return (
    <div className="flex min-w-0 items-center">
      <div
        ref={strip}
        className="flex h-8 min-w-0 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden"
        onWheel={(event) =>
          strip.current?.scrollBy({
            left: Math.sign(event.deltaY) * 160,
            behavior: "smooth",
          })
        }
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-active={tab.id === activeTabId}
            className="group flex h-8 min-w-28 max-w-52 shrink-0 items-center rounded-t-lg border-x border-t border-transparent text-xs text-muted-foreground data-[active=true]:border-border data-[active=true]:bg-muted/70 data-[active=true]:text-foreground"
            onContextMenu={(event) => {
              event.preventDefault();
              onMenu(tab.id);
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-full min-w-0 flex-1 justify-start gap-1.5 rounded-none px-2 text-inherit hover:text-inherit"
              title={tab.savedTitle || tab.title}
              onClick={() => onSelect(tab.id)}
            >
              <TabIcon key={tab.url} url={tab.url} loading={tab.loading} />
              <span className="truncate">{tab.savedTitle || tab.title}</span>
              <Button
                role="link"
                variant="secondary"
                size="icon-xs"
                className="mr-1 size-5 shrink-0 opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100"
                aria-label={`Fechar ${tab.savedTitle || tab.title}`}
                onClick={() => onClose(tab.id)}
                title={`Fechar ${tab.savedTitle || tab.title}`}
              >
                <X className="size-3" />
              </Button>
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="ml-1 shrink-0"
        aria-label="Nova aba"
        title="Nova aba"
        onClick={onAdd}
      >
        <Plus />
      </Button>
    </div>
  );
}
