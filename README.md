# SNK Browser

Navegador desktop para acessar ambientes Sankhya. O aplicativo usa Electron para as janelas e páginas, React para a interface e Electron Vite para o desenvolvimento e a compilação.

## Funcionalidades

- Abas com navegação, histórico, favicons e menu de contexto. As URLs abertas e a aba ativa são restauradas ao iniciar o aplicativo.
- Ambientes salvos por pasta e apelido. É possível salvar, remover, importar e exportar ambientes em JSON pelo botão **Selecionar base**.
- Downloads com progresso, pausa, retomada, cancelamento e opção de mostrar o arquivo na pasta. A pasta de destino pode ser escolhida no painel **Downloads**.
- Tema claro ou escuro persistente. Os painéis de ambientes, tema, salvamento e downloads abrem em janelas nativas sobre o site.
- Emulação de conteúdo Flash com Ruffle local. A extensão injeta seus scripts em páginas HTTP e HTTPS, inclusive em iframes, antes dos scripts da página. O Ruffle procura conteúdo Flash para emular; a compatibilidade depende do arquivo SWF.

## Como funciona

O processo principal do Electron gerencia abas, janelas, downloads e persistência. Cada site aberto ocupa um `WebContentsView`; a interface React envia comandos ao processo principal por uma API restrita exposta pelo preload. Os painéis da interface usam janelas filhas do Electron.

As preferências, os ambientes salvos, o tamanho da janela e a sessão ficam em `browser-settings.json`. O histórico de downloads fica em `browser-downloads.json`. Ambos são gravados no diretório `userData` do Electron, que varia conforme o sistema operacional.

O Ruffle está incluído em `assets/ruffle`. Uma extensão Chromium Manifest V3 carrega `config.js` e `ruffle.js` em `document_start` e em todos os frames HTTP/HTTPS. Os arquivos JavaScript e WebAssembly usados pelo Ruffle são servidos localmente pelo protocolo `snk-ruffle://assets/`. Não é necessário instalar um plugin Flash.

## Desenvolvimento

Requisitos: Node.js **24 ou superior** e pnpm **12.9.1 ou superior**.

```sh
pnpm install
pnpm start
```

Comandos de verificação e empacotamento:

```sh
pnpm run lint
pnpm exec tsc --noEmit
pnpm test
pnpm run test:smoke
pnpm run build
pnpm run package
```

`pnpm run test:smoke` abre o Electron com um perfil temporário e verifica navegação, abas, ambientes salvos, popups, downloads e integração com Ruffle. `pnpm run package` compila e gera os instaladores em `release/build`, sem publicá-los. O destino depende do sistema: instalador `.exe` no Windows, `.dmg` e `.zip` no macOS, e `.AppImage` no Linux.

Para testar o executável empacotado no Windows, defina `SMOKE_PACKAGED_APP` com o caminho de `SNK Browser.exe` antes de executar `pnpm run test:smoke`.

## Configuração

- **Pasta de downloads:** escolha no painel **Downloads**. Sem escolha, o aplicativo usa a pasta padrão de downloads do sistema. `SNK_BROWSER_DOWNLOAD_DIR` define uma pasta administrada externamente e desabilita a alteração pela interface; use um caminho absoluto.
- **Diretório de dados:** `SNK_BROWSER_DATA_DIR` substitui o diretório `userData`. É útil para testes e perfis isolados; defina antes de iniciar o aplicativo.
- **Ambientes em JSON:** os botões **Selecionar base > Importar ambientes** e **Exportar ambientes** usam uma lista de objetos com `folder`, `name` e `url`. Na importação, ambientes existentes com a mesma pasta e o mesmo apelido são preservados.

Exemplo de arquivo para importar ambientes:

```json
[
  {
    "folder": "Cliente",
    "name": "Produção",
    "url": "https://empresa.sankhyacloud.com.br/mge/"
  }
]
```

## CI e releases

O workflow `test.yml` executa compilação, análise, testes e smoke test em Windows, macOS e Linux nos pushes para `main` e nas pull requests. O workflow `publish.yml` gera e anexa os pacotes quando uma **GitHub Release é publicada**. Enviar apenas uma tag Git não inicia a publicação. O pacote macOS pode sair sem assinatura se as credenciais de assinatura não estiverem configuradas nos secrets do repositório.
