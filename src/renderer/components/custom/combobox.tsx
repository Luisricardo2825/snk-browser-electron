'use client';

import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { ComboboxRoot } from '@base-ui/react';
import { Plus } from 'lucide-react';
import { useState } from 'react';

export type ComboboxPopupItem = {
  code: string;
  label: string;
};
type ComboboxProps = {
  items: Array<ComboboxPopupItem>;
  onValueChange?:
    | ((
        value: ComboboxPopupItem | null,
        eventDetails: ComboboxRoot.ChangeEventDetails,
      ) => void)
    | undefined;
  value?: ComboboxPopupItem | null;
};
export function ComboboxPopup({
  items,
  onValueChange,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<ComboboxPopupItem | null>(
    props.value ?? null,
  );
  const [localItems, setLocalItems] = useState(items);
  const [inputValue, setInputValue] = useState<string>('');

  function createNewItem() {
    const newItem: ComboboxPopupItem = {
      code: inputValue,
      label: inputValue,
    };
    setLocalItems([...localItems, newItem]);
    setValue(newItem);
    setOpen(false);
    onValueChange?.(newItem, {} as any);
  }
  return (
    <>
      <Combobox
        items={localItems}
        defaultValue={localItems[0]}
        onValueChange={(...args) => {
          onValueChange?.(...args);
        }}
        value={value}
        onInputValueChange={setInputValue}
        open={open}
        onOpenChange={setOpen}
      >
        <ComboboxInput placeholder="Selecione uma pasta" showClear />
        <ComboboxContent>
          <ComboboxEmpty>
            <Button
              variant="default"
              size="icon-sm"
              aria-label="Criar novo grupo"
              title="Criar novo grupo"
              onClick={() => {
                createNewItem();
              }}
            >
              <Plus />
            </Button>
          </ComboboxEmpty>
          <ComboboxList>
            {(item: ComboboxPopupItem) => (
              <ComboboxItem key={item.code} value={item}>
                {item.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </>
  );
}
