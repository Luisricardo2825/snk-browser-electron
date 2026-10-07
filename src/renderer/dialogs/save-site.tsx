import { ComboboxPopup, ComboboxPopupItem } from '@/components/custom/combobox';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SavedUrl } from '@shared/browser';
import { BaseUIEvent } from '@base-ui/react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RouteProps } from '@/@types/popup';
const SaveSitePopup = ({ state, run }: RouteProps) => {
  const tab = state.tabs.find((item) => item.id === state.activeTabId);

  const [name, setName] = useState(() => {
    try {
      return new URL(tab?.url ?? '').hostname;
    } catch {
      return '';
    }
  });
  const groups =
    state.savedUrls.reduce<Record<string, SavedUrl[]>>((result, entry) => {
      (result[entry.folder] ??= []).push(entry);
      return result;
    }, {}) || {};

  const [selectedFolder, setSelectFolder] = useState<ComboboxPopupItem | null>({
    code: `${state.savedUrls[0]?.folder}-0`,
    label: state.savedUrls[0]?.folder || '',
  });

  const folder = selectedFolder?.label ?? '';

  const save = (
    event: BaseUIEvent<React.MouseEvent<HTMLButtonElement, MouseEvent>>,
  ) => {
    event.preventDefault();
    if (tab?.url)
      void run({
        type: 'save-environment',
        entry: { folder, name, url: tab.url },
      });
  };
  return (
    <Card className="min-w-screen min-h-screen max-w-sm">
      <CardHeader>
        <CardTitle>Salvar ambiente</CardTitle>
        <CardDescription className="mt-1">
          Use pasta e apelido para diferenciar bases do mesmo cliente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4">
          <ComboboxPopup
            items={Object.entries(groups).map(([, url]) => ({
              code: url[0].folder,
              label: url[0].folder,
            }))}
            onValueChange={(value) => setSelectFolder(value)}
            value={selectedFolder}
          />
          <label className="grid gap-1 text-sm" htmlFor={'apelido'}>
            Apelido
            <Input
              id={'apelido'}
              value={name}
              required
              placeholder="Base produção"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2"></div>
        </form>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>
          Cancelar
        </Button>
        <Button type="submit" onClick={save}>
          Salvar
        </Button>
      </CardFooter>
    </Card>
  );
};

export default SaveSitePopup;
