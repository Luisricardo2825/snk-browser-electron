const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { dirname, join, resolve: resolvePath, sep } = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const port = Number(process.env.SMOKE_PORT || 1213);
const debugPort = Number(process.env.SMOKE_DEBUG_PORT || 9335);
const windows = process.platform === 'win32';
const packagedApp = process.env.SMOKE_PACKAGED_APP;
const dataDir = mkdtempSync(join(tmpdir(), 'snk-browser-smoke-'));
const electronVite = resolvePath(
  dirname(require.resolve('electron-vite')),
  '../bin/electron-vite.js',
);
const child = spawn(
  packagedApp || process.execPath,
  packagedApp
    ? [`--remote-debugging-port=${debugPort}`]
    : [
        electronVite,
        'dev',
        '--remoteDebuggingPort',
        String(debugPort),
        ...(process.env.CI && process.platform === 'linux'
          ? ['--noSandbox']
          : []),
      ],
  {
    detached: !windows,
    env: {
      ...process.env,
      PORT: String(port),
      SNK_BROWSER_DATA_DIR: dataDir,
      SNK_BROWSER_DOWNLOAD_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
let exited = false;
let socket;
const site = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (request.url === '/download' || request.url === '/download-popup') {
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="smoke-${request.url === '/download' ? 'download' : 'popup-download'}.txt"`,
    );
    response.end('download de teste');
    return;
  }
  if (request.url === '/popup') {
    response.end('<!doctype html><title>Popup de teste</title>');
    return;
  }
  if (request.url === '/flash') {
    response.end(
      '<!doctype html><title>Flash de teste</title><script>window.ruffleAtStart=Boolean(window.__snkRuffleLoaded);window.flashAtStart=Boolean(navigator.plugins.namedItem("Shockwave Flash"))</script><object type="application/x-shockwave-flash" data="/missing.swf"></object><iframe src="/flash-frame"></iframe>',
    );
    return;
  }
  if (request.url === '/flash-frame') {
    response.end(
      '<!doctype html><script>window.ruffleAtStart=Boolean(window.__snkRuffleLoaded);window.flashAtStart=Boolean(navigator.plugins.namedItem("Shockwave Flash"))</script><object type="application/x-shockwave-flash" data="/missing.swf"></object>',
    );
    return;
  }
  response.end(
    "<!doctype html><title>Site de teste</title><h1>Site de teste</h1><button onclick=\"window.open('/popup','_blank','width=480,height=300')\">Abrir popup</button>",
  );
});
child.stdout.on('data', (data) => {
  output += data;
});
child.stderr.on('data', (data) => {
  output += data;
});
child.on('exit', () => {
  exited = true;
});
child.on('error', (error) => {
  output += error.stack;
  exited = true;
});

async function waitFor(check, description, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Electron exited before ${description}`);
    const value = await check();
    if (value) return value;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function evaluateTarget(target, expression) {
  const connection = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    connection.addEventListener('open', resolve, { once: true });
    connection.addEventListener('error', reject, { once: true });
  });
  try {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out: popup renderer')),
        10_000,
      );
      connection.addEventListener('message', ({ data }) => {
        const message = JSON.parse(data);
        if (message.id !== 1) return;
        clearTimeout(timeout);
        if (message.error || message.result?.exceptionDetails)
          reject(new Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      });
      connection.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }),
      );
    });
  } finally {
    connection.close();
  }
}

async function main() {
  const target = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const targets = await response.json();
      return targets.find(
        (entry) =>
          entry.type === 'page' &&
          (packagedApp
            ? entry.url.startsWith('file:') && entry.url.includes('index.html')
            : entry.url.startsWith(`http://localhost:${port}`)),
      );
    } catch {
      return null;
    }
  }, 'Electron renderer');

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const requests = new Map();
  const exceptions = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown')
      exceptions.push(message.params);
    if (requests.has(message.id)) {
      requests.get(message.id)(message);
      requests.delete(message.id);
    }
  });
  function send(method, params = {}) {
    id += 1;
    const requestId = id;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        requests.delete(requestId);
        reject(new Error(`Timed out: ${method}`));
      }, 15_000);
      requests.set(requestId, (message) => {
        clearTimeout(timeout);
        if (message.error || message.result?.exceptionDetails) {
          reject(new Error(JSON.stringify(message)));
        } else resolve(message.result);
      });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result.value;
  }
  await send('Runtime.enable');
  await waitFor(
    () =>
      evaluate(
        'document.querySelector("h1")?.textContent === "Sankhya Browser"',
      ),
    'browser interface',
  );
  assert.equal(
    await evaluate('Boolean(document.querySelector("vite-error-overlay"))'),
    false,
  );
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.tabs.length === 1)',
      ),
    'initial tab',
  );
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const siteUrl = `http://127.0.0.1:${site.address().port}/`;
  await evaluate(
    `window.electron.browser.command({type:'navigate',url:${JSON.stringify(siteUrl)}})`,
  );
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.tabs[0].title === "Site de teste" && !state.tabs[0].loading)',
      ),
    'site navigation',
  );
  const siteTarget = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((entry) => entry.url === siteUrl);
  }, 'site WebContentsView');
  const siteSocket = new WebSocket(siteTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    siteSocket.addEventListener('open', resolve, { once: true });
    siteSocket.addEventListener('error', reject, { once: true });
  });
  let siteRequestId = 0;
  const siteCommand = (method, params) =>
    new Promise((resolve, reject) => {
      const requestId = ++siteRequestId;
      const timeout = setTimeout(
        () => reject(new Error(`Timed out: ${method}`)),
        15_000,
      );
      const receive = ({ data }) => {
        const message = JSON.parse(data);
        if (message.id !== requestId) return;
        clearTimeout(timeout);
        siteSocket.removeEventListener('message', receive);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      };
      siteSocket.addEventListener('message', receive);
      siteSocket.send(JSON.stringify({ id: requestId, method, params }));
    });
  await siteCommand('Runtime.evaluate', {
    expression: 'document.querySelector("button").click()',
    userGesture: true,
  });
  const sitePopup = await waitFor(
    async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      return (await response.json()).find(
        (entry) => entry.url === `${siteUrl}popup`,
      );
    },
    'sized site popup',
    20_000,
  );
  assert.equal(await evaluateTarget(sitePopup, 'Boolean(window.opener)'), true);
  await siteCommand('Runtime.evaluate', {
    expression:
      "window.open('/mge/sessionUpload.mge?sessionkey=test', '_blank')",
    userGesture: true,
  });
  const uploadPopup = await waitFor(
    async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      return (await response.json()).find(
        (entry) =>
          entry.url === `${siteUrl}mge/sessionUpload.mge?sessionkey=test`,
      );
    },
    'upload popup without window features',
    20_000,
  );
  assert.equal(
    await evaluateTarget(uploadPopup, 'Boolean(window.opener)'),
    true,
  );
  await siteCommand('Runtime.evaluate', {
    expression: "location.href = '/download'",
    userGesture: true,
  });
  const downloaded = await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.downloads.find((item) => item.name === "smoke-download.txt" && item.status === "completed"))',
      ),
    'completed site download',
    20_000,
  );
  assert.equal(downloaded.path, join(dataDir, 'smoke-download.txt'));
  assert.equal(existsSync(downloaded.path), true);
  await siteCommand('Runtime.evaluate', {
    expression: "location.href = '/download'",
    userGesture: true,
  });
  const renamedDownload = await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.downloads.find((item) => item.name === "smoke-download (1).txt" && item.status === "completed"))',
      ),
    'download name after destination collision',
    20_000,
  );
  assert.equal(renamedDownload.path, join(dataDir, 'smoke-download (1).txt'));
  await evaluateTarget(uploadPopup, "location.href = '/download-popup'");
  const popupDownload = await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.downloads.find((item) => item.name === "smoke-popup-download.txt" && item.status === "completed"))',
      ),
    'completed popup download',
    20_000,
  );
  assert.equal(popupDownload.path, join(dataDir, 'smoke-popup-download.txt'));
  assert.equal(existsSync(popupDownload.path), true);
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"downloads",anchor:{x:window.innerWidth-28,y:window.innerHeight-28,width:20,height:20}})',
  );
  const downloadsTarget = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((entry) =>
      entry.url.includes('#/popup/downloads'),
    );
  }, 'downloads popup');
  await waitFor(
    () =>
      evaluateTarget(
        downloadsTarget,
        'document.body?.innerText.includes("smoke-download.txt")',
      ),
    'download in popup',
    10_000,
  );
  const mainBounds = await evaluate(
    '({x:window.screenX,y:window.screenY,width:window.outerWidth,height:window.outerHeight})',
  );
  const popupBounds = await evaluateTarget(
    downloadsTarget,
    '({x:window.screenX,y:window.screenY,width:window.outerWidth,height:window.outerHeight})',
  );
  assert.ok(popupBounds.x >= mainBounds.x + 12);
  assert.ok(popupBounds.y >= mainBounds.y + 12);
  assert.ok(
    popupBounds.x + popupBounds.width <= mainBounds.x + mainBounds.width - 12,
  );
  assert.ok(
    popupBounds.x + popupBounds.width >= mainBounds.x + mainBounds.width - 16,
  );
  assert.ok(
    popupBounds.y + popupBounds.height <= mainBounds.y + mainBounds.height - 12,
  );
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"downloads"})',
  );
  await evaluate(
    `window.electron.browser.command({type:'navigate',url:${JSON.stringify(`${siteUrl}flash`)}})`,
  );
  await waitFor(
    async () => {
      const result = await siteCommand('Runtime.evaluate', {
        expression: 'Boolean(window.__snkRuffleLoaded)',
        returnByValue: true,
      });
      return result.result.value;
    },
    'Flash-only Ruffle injection',
    15_000,
  ).catch(async (error) => {
    const diagnostic = await siteCommand('Runtime.evaluate', {
      expression:
        '({url:location.href, flash:Boolean(document.querySelector("object")), loaded:window.__snkRuffleLoaded})',
      returnByValue: true,
    });
    throw new Error(
      `${error.message}: ${JSON.stringify(diagnostic.result.value)}`,
    );
  });
  const earlyFlash = await siteCommand('Runtime.evaluate', {
    expression:
      '({atStart:window.flashAtStart,ruffleAtStart:window.ruffleAtStart,plugin:Boolean(navigator.plugins.namedItem("Shockwave Flash")),ruffle:Boolean(window.RufflePlayer?.newest?.())})',
    returnByValue: true,
  });
  assert.deepEqual(earlyFlash.result.value, {
    atStart: true,
    ruffleAtStart: true,
    plugin: true,
    ruffle: true,
  });
  const frameFlash = await siteCommand('Runtime.evaluate', {
    expression:
      '({atStart:document.querySelector("iframe").contentWindow.flashAtStart,ruffleAtStart:document.querySelector("iframe").contentWindow.ruffleAtStart,plugin:Boolean(document.querySelector("iframe").contentWindow.navigator.plugins.namedItem("Shockwave Flash")),loaded:Boolean(document.querySelector("iframe").contentWindow.__snkRuffleLoaded)})',
    returnByValue: true,
  });
  assert.deepEqual(frameFlash.result.value, {
    atStart: true,
    ruffleAtStart: true,
    plugin: true,
    loaded: true,
  });
  const resource = await siteCommand('Runtime.evaluate', {
    expression:
      'fetch("snk-ruffle://assets/ruffle.js").then((response) => response.ok)',
    awaitPromise: true,
    returnByValue: true,
  });
  assert.equal(resource.result.value, true);
  siteSocket.close();
  await evaluate(
    `window.electron.browser.command({type:'save-environment',entry:{folder:'Teste',name:'Base',url:${JSON.stringify(siteUrl)}}})`,
  );
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.savedUrls[0]?.name === "Base" && state.tabs[0].savedTitle === "Teste / Base")',
      ),
    'saved environment',
  );
  await evaluate(
    'window.electron.browser.command({type:"set-theme",theme:"dark"})',
  );
  assert.equal(
    await evaluate(
      'window.electron.browser.getState().then((state) => state.theme)',
    ),
    'dark',
  );
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"theme",anchor:{x:10,y:10,width:20,height:20}})',
  );
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.popup === "theme")',
      ),
    'native theme popup',
  );
  const themeTarget = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    const targets = await response.json();
    return targets.find((entry) => entry.url.includes('#/popup/theme'));
  }, 'theme popup renderer');
  await waitFor(
    () =>
      evaluateTarget(
        themeTarget,
        'Boolean(document.body?.innerText.includes("Claro") && document.body?.innerText.includes("Escuro"))',
      ),
    'shadcn theme picker',
    10_000,
  );
  await evaluate('window.electron.browser.command({type:"select-tab",id:"1"})');
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.popup === null)',
      ),
    'popup close on blur',
    5_000,
  );
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"theme",anchor:{x:10,y:10,width:20,height:20}})',
  );
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"theme"})',
  );
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.popup === null)',
      ),
    'popup toggle close',
  );
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"sites",anchor:{x:10,y:10,width:20,height:20}})',
  );
  const sitesTarget = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((entry) =>
      entry.url.includes('#/popup/sites'),
    );
  }, 'saved sites popup');
  await waitFor(
    () =>
      evaluateTarget(
        sitesTarget,
        'Boolean(document.body?.innerText.includes("Teste") && document.body?.innerText.includes("Base") && document.body?.innerText.includes("Importar bases"))',
      ),
    'shadcn saved sites picker',
    10_000,
  );
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"sites"})',
  );
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"save"})',
  );
  const saveTarget = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
    return (await response.json()).find((entry) =>
      entry.url.includes('#/popup/save'),
    );
  }, 'save popup');
  await waitFor(
    () =>
      evaluateTarget(
        saveTarget,
        'Boolean(document.body?.innerText.includes("Salvar ambiente"))',
      ),
    'save popup route',
  );
  await evaluate(
    'window.electron.browser.command({type:"toggle-popup",popup:"save"})',
  );
  await evaluate('window.electron.browser.command({type:"new-tab"})');
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.tabs.length === 2 && state.activeTabId === "2")',
      ),
    'new tab',
  );
  await evaluate('window.electron.browser.command({type:"select-tab",id:"1"})');
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.activeTabId === "1")',
      ),
    'tab switch',
  );
  await evaluate('window.electron.browser.command({type:"close-tab",id:"1"})');
  await waitFor(
    () =>
      evaluate(
        'window.electron.browser.getState().then((state) => state.tabs.length === 1 && state.activeTabId === "2")',
      ),
    'tab close',
  );
  assert.deepEqual(exceptions, []);
  console.log(
    'Electron smoke passed: tabs, popups, downloads, saved bases, theme, Ruffle, and no renderer exceptions.',
  );
}

main()
  .finally(async () => {
    socket?.close();
    site.close();
    if (windows) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    } else if (child.pid) {
      for (const signal of ['SIGTERM', 'SIGKILL']) {
        try {
          process.kill(-child.pid, signal);
        } catch (error) {
          if (error.code !== 'ESRCH') throw error;
        }
        if (signal === 'SIGTERM') await delay(1000);
      }
    }
    const resolvedDataDir = resolvePath(dataDir);
    if (resolvedDataDir.startsWith(`${resolvePath(tmpdir())}${sep}`)) {
      rmSync(resolvedDataDir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 500,
      });
    }
  })
  .catch((error) => {
    console.error(error);
    console.error(output);
    process.exitCode = 1;
  });
