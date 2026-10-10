import { app, protocol, session } from "electron";
import { readFileSync } from "node:fs";
import path from "node:path";

const resourcePath = () =>
  path.join(
    app.isPackaged ? process.resourcesPath : app.getAppPath(),
    "assets",
    "ruffle",
  );

export function registerRuffleScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "snk-ruffle",
      privileges: {
        standard: true,
        secure: true,
        corsEnabled: true,
        supportFetchAPI: true,
        bypassCSP: true,
      },
    },
  ]);
}

export async function serveRuffleResources(): Promise<void> {
  protocol.handle("snk-ruffle", (request) => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    if (url.hostname !== "assets" || !/^(?:ruffle\/)?[\w.-]+$/.test(name))
      return new Response("Not found", { status: 404 });
    try {
      const bytes = readFileSync(path.join(resourcePath(), name));
      const mime = name.endsWith(".wasm")
        ? "application/wasm"
        : "application/javascript; charset=utf-8";
      return new Response(new Uint8Array(bytes), {
        headers: {
          "Content-Type": mime,
          "Access-Control-Allow-Origin": "*",
          "Cross-Origin-Resource-Policy": "cross-origin",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });

  await session.defaultSession.extensions.loadExtension(resourcePath());
}
