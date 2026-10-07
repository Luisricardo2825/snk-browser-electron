import type { ReactElement, ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type Option = {
  name: string;
  icon?: ReactNode;
  handler: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
};

type TabContextMenuProps = {
  children: ReactElement;
  options: Option[];
};

export function TitleBarContextMenu({
  options,
  children,
}: TabContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent>
        {options.map((option) => (
          <ContextMenuItem
            key={option.name}
            disabled={option.disabled}
            variant={option.variant}
            onClick={option.handler}
          >
            {option.icon}
            {option.name}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
