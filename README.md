# SNK Browser

Navegador de ambientes Sankhya feito com Electron, React, Tailwind CSS e shadcn.

## Desenvolvimento

Requer Node.js 24+ e pnpm 10+.

```sh
pnpm install
pnpm start
```

```sh
pnpm build
pnpm test
pnpm test:smoke
pnpm package
```

`pnpm package` gera o aplicativo em `release/build`. O smoke test abre o Electron com um perfil temporário e verifica navegação, abas, bases salvas, popups e Ruffle. Para testar o executável empacotado no Windows, defina `SMOKE_PACKAGED_APP` para o caminho de `SNK Browser.exe` antes de executar `pnpm test:smoke`.

## Recursos migrados

- Abas na mesma janela com `WebContentsView`, navegação, histórico, favicons e menu de contexto.
- `window.open` com tamanho abre janela filha; sem tamanho abre nova aba.
- Seletor de bases, tema e formulário de salvamento em janelas filhas acima do site. Clicar no botão novamente fecha o popup; perda de foco também fecha.
- Bases agrupadas por pasta e apelido, com título da aba associado à origem do site. Dados novos ficam em `browser-settings.json` no diretório de dados do Electron.
- Tema claro/escuro persistente e Ruffle local carregado somente em páginas com elementos Flash.

## Bases do aplicativo Tauri

O aplicativo antigo guarda `sankhya-urls` no `localStorage`. Ele permanece intacto. Para transferir as bases, salve o conteúdo dessa chave em um arquivo `.json` e, no Electron, abra **Selecionar base > Importar bases em JSON**. O importador aceita tanto a lista atual `{ "folder", "name", "url" }[]` quanto a lista antiga de URLs. Bases já existentes no Electron com a mesma pasta e apelido são preservadas.

Se o DevTools da interface antiga estiver disponível, o comando `copy(localStorage.getItem('sankhya-urls'))` copia o JSON para a área de transferência. Salve esse texto como arquivo `.json` antes de importar.
