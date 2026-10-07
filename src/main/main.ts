/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build`, this file is compiled to
 * `./release/app/dist/main/main.js` using electron-vite.
 */
import path from 'path';
import { app, BrowserWindow, Menu, screen } from 'electron';
import log from 'electron-log';
import { attachBrowserWindow } from './browser/browser';
import BrowserSettings from './browser/BrowserSettings';
import { registerRuffleScheme, serveRuffleResources } from './ruffle/ruffle';
import { resolveHtmlPath } from './lib/util';

let mainWindow: BrowserWindow | null = null;

app.setName('snk-browser');
registerRuffleScheme();
if (process.env.SNK_BROWSER_DATA_DIR) {
  app.setPath('userData', process.env.SNK_BROWSER_DATA_DIR);
}

if (process.env.NODE_ENV === 'production') {
  process.setSourceMapsEnabled(true);
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

const installExtensions = async () => {
  const { installExtension, REACT_DEVELOPER_TOOLS } =
    await import('electron-devtools-installer');
  return installExtension(REACT_DEVELOPER_TOOLS, {
    forceDownload: !!process.env.UPGRADE_EXTENSIONS,
  }).catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(app.getAppPath(), 'assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  const settings = new BrowserSettings();
  const saved = settings.windowState;
  const visible =
    saved &&
    screen
      .getAllDisplays()
      .some(
        ({ workArea }) =>
          saved.x + saved.width > workArea.x + 64 &&
          saved.x < workArea.x + workArea.width - 64 &&
          saved.y + saved.height > workArea.y + 64 &&
          saved.y < workArea.y + workArea.height - 64,
      );

  mainWindow = new BrowserWindow({
    show: false,
    ...(visible ? { x: saved.x, y: saved.y } : {}),
    width: visible ? saved.width : 1200,
    height: visible ? saved.height : 800,
    minWidth: 640,
    minHeight: 420,
    frame: false,
    title: 'SNK Browser',
    backgroundColor: '#111214',
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });

  const window = mainWindow;
  if (saved?.maximized) window.maximize();
  let maximized = window.isMaximized();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const saveWindowState = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;
    if (window.isDestroyed()) return;
    const bounds = window.getNormalBounds();
    settings.setWindowState({ ...bounds, maximized });
  };
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWindowState, 300);
  };
  window.on('move', scheduleSave);
  window.on('resize', scheduleSave);
  window.on('maximize', () => {
    maximized = true;
    scheduleSave();
  });
  window.on('unmaximize', () => {
    maximized = false;
    scheduleSave();
  });
  window.on('close', saveWindowState);
  attachBrowserWindow(window, settings);

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([
          { role: 'appMenu' },
          { role: 'editMenu' },
          { role: 'viewMenu' },
          { role: 'windowMenu' },
        ])
      : null,
  );
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  await mainWindow.loadURL(resolveHtmlPath('index.html'));
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function reportWindowError(error: unknown) {
  log.error('Failed to create the application window', error);
  mainWindow?.destroy();
  mainWindow = null;
}

function onActivate() {
  // Reopening a macOS window must not initialize another updater.
  if (mainWindow === null) {
    void createWindow().catch(reportWindowError);
  }
}

app
  .whenReady()
  .then(async () => {
    await serveRuffleResources();
    await createWindow();
    app.on('activate', onActivate);
  })
  .catch((error: unknown) => {
    reportWindowError(error);
    app.quit();
  });
