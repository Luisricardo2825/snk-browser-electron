import { app } from 'electron';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import BrowserSettings from '../main/browser/BrowserSettings';

jest.mock('electron', () => ({ app: { getPath: jest.fn() } }));

test('preserva configurações antigas ao salvar janela, sessão e downloads', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'snk-settings-'));
  const previousDownloadDirectory = process.env.SNK_BROWSER_DOWNLOAD_DIR;
  (app.getPath as jest.Mock).mockImplementation((name: string) =>
    name === 'userData' ? directory : path.join(directory, 'Downloads'),
  );
  writeFileSync(
    path.join(directory, 'browser-settings.json'),
    JSON.stringify({ savedUrls: [], theme: 'dark' }),
  );
  try {
    delete process.env.SNK_BROWSER_DOWNLOAD_DIR;
    const settings = new BrowserSettings();
    expect(settings.session).toBeUndefined();
    expect(settings.downloadDirectory).toBe(path.join(directory, 'Downloads'));
    settings.setSession({ urls: ['https://example.com/', ''], activeIndex: 0 });
    settings.setWindowState({
      x: 30,
      y: 40,
      width: 900,
      height: 700,
      maximized: true,
    });
    settings.setDownloadDirectory(path.join(directory, 'Custom'));
    expect(new BrowserSettings().session).toEqual(settings.session);
    expect(new BrowserSettings().windowState).toEqual(settings.windowState);
    expect(new BrowserSettings().downloadDirectory).toBe(
      path.join(directory, 'Custom'),
    );
    process.env.SNK_BROWSER_DOWNLOAD_DIR = path.join(directory, 'Managed');
    expect(settings.downloadDirectory).toBe(path.join(directory, 'Managed'));
    const saved = JSON.parse(
      readFileSync(path.join(directory, 'browser-settings.json'), 'utf8'),
    );
    expect(saved).toMatchObject({ savedUrls: [], theme: 'dark' });
  } finally {
    if (previousDownloadDirectory === undefined)
      delete process.env.SNK_BROWSER_DOWNLOAD_DIR;
    else process.env.SNK_BROWSER_DOWNLOAD_DIR = previousDownloadDirectory;
    rmSync(directory, { recursive: true, force: true });
  }
});
