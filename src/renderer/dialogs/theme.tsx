import type { RouteProps } from '@/@types/popup';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Moon, Sun } from 'lucide-react';
const ThemePopup = ({ run }: RouteProps) => {
  return (
    <Command className="h-screen rounded-none border bg-popover text-popover-foreground">
      <CommandList className="max-h-none">
        <CommandGroup heading="Tema">
          <CommandItem
            onSelect={() => void run({ type: 'set-theme', theme: 'light' })}
          >
            <Sun />
            Claro
          </CommandItem>
          <CommandItem
            onSelect={() => void run({ type: 'set-theme', theme: 'dark' })}
          >
            <Moon />
            Escuro
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

export default ThemePopup;
