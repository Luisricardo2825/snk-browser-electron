import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import BrowserSettings from "./BrowserSettings";
import type { WebConnectionState } from "@shared/browser";

export default class WebConnection {
  private process: ChildProcess | null = null;
  private stopRequested = false;
  private status: WebConnectionState["status"] = "checking";
  private error = "";

  constructor(
    private readonly settings: BrowserSettings,
    private readonly onChange: () => void,
  ) {}

  initialize(): void {
    if (this.settings.webConnectionAutoStart)
      void this.start().catch((error: unknown) => this.fail(error));
    else void this.check().catch((error: unknown) => this.fail(error));
  }

  snapshot(): WebConnectionState {
    return {
      autoStart: this.settings.webConnectionAutoStart,
      controlExternal: this.settings.webConnectionControlExternal,
      executablePath: this.settings.webConnectionExecutablePath,
      port: this.settings.webConnectionPort,
      status: this.status,
      error: this.error,
    };
  }

  async configure(
    autoStart: boolean,
    controlExternal: boolean,
    executablePath: string,
    port: number,
  ) {
    if (
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !executablePath ||
      !existsSync(executablePath)
    ) {
      throw new Error("Informe um executável existente e uma porta válida.");
    }

    const portChanged = port !== this.settings.webConnectionPort;
    const wasRunning =
      this.status === "running" || (await this.isReachable()) === "running";
    if (portChanged && wasRunning) {
      await this.stop();
      if (this.status !== "stopped") {
        throw new Error(
          this.error || "O serviço não parou; a porta não foi alterada.",
        );
      }
    }

    this.writeLauncherPort(executablePath, port);
    this.settings.setWebConnection({
      autoStart,
      controlExternal,
      executablePath,
      port,
    });
    if (portChanged && wasRunning) await this.start();
    else await this.check();
  }

  async check(): Promise<void> {
    const configuredPort = this.readLauncherPort(
      this.settings.webConnectionExecutablePath,
    );
    if (configuredPort && configuredPort !== this.settings.webConnectionPort) {
      this.settings.setWebConnection({
        autoStart: this.settings.webConnectionAutoStart,
        controlExternal: this.settings.webConnectionControlExternal,
        executablePath: this.settings.webConnectionExecutablePath,
        port: configuredPort,
      });
    }
    this.status = "checking";
    this.error = "";
    this.onChange();
    try {
      const response = await new Promise<number>((resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port: this.settings.webConnectionPort,
            path: "/.info",
            method: "GET",
            timeout: 1500,
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("timeout", () => req.destroy(new Error("Tempo esgotado.")));
        req.on("error", reject);
        req.end();
      });
      this.status = response >= 200 && response < 400 ? "running" : "error";
      if (this.status === "error")
        this.error = `Web Connection respondeu com HTTP ${response}.`;
    } catch {
      this.status = "stopped";
    }
    this.onChange();
  }

  private launcherConfigPath(executablePath: string): string {
    return executablePath.replace(/\.exe$/i, ".l4j.ini");
  }

  private readLauncherPort(executablePath: string): number | undefined {
    if (!executablePath) return undefined;
    try {
      const content = readFileSync(
        this.launcherConfigPath(executablePath),
        "utf8",
      );
      const match = content.match(/(?:^|\s)-Dporta=(\d+)(?=\s|$)/m);
      const port = Number(match?.[1]);
      return Number.isInteger(port) && port > 0 && port <= 65535
        ? port
        : undefined;
    } catch {
      return undefined;
    }
  }

  private writeLauncherPort(executablePath: string, port: number): void {
    const configPath = this.launcherConfigPath(executablePath);
    if (!existsSync(configPath)) {
      throw new Error(`Arquivo de configuração não encontrado: ${configPath}`);
    }
    const contents = readFileSync(configPath, "utf8");
    const parameter = `-Dporta=${port}`;
    const updated = /(^|\s)-Dporta=\d+(?=\s|$)/m.test(contents)
      ? contents.replace(/(^|\s)-Dporta=\d+(?=\s|$)/m, `$1${parameter}`)
      : `${contents.trimEnd()} ${parameter}${contents.endsWith("\n") ? "\n" : ""}`;
    if (updated !== contents) writeFileSync(configPath, updated, "utf8");
  }

  private fail(error: unknown): void {
    this.status = "error";
    this.error = String(error);
    this.onChange();
  }

  async start(): Promise<void> {
    this.stopRequested = false;
    await this.check();
    if (this.stopRequested) return;
    if (this.status === "running") return;
    const executablePath = this.settings.webConnectionExecutablePath;
    if (!executablePath || !existsSync(executablePath)) {
      this.status = "error";
      this.error = "Selecione o executável do Web Connection.";
      this.onChange();
      return;
    }
    try {
      const child = spawn(executablePath, [], {
        cwd: executablePath.replace(/[\\/][^\\/]+$/, ""),
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", (cause) => {
        this.status = "error";
        this.error = cause.message;
        this.onChange();
      });
      child.unref();
      this.process = child;
      if (this.stopRequested) {
        await this.stop();
        return;
      }
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.check();
        if ((await this.isReachable()) === "running") return;
      }
      if ((await this.isReachable()) !== "running") {
        this.status = "error";
        this.error = "O serviço não respondeu na porta configurada.";
        this.onChange();
      }
    } catch (cause) {
      this.status = "error";
      this.error = String(cause);
      this.onChange();
    }
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    try {
      const pids = new Set<number>();
      if (this.process?.pid) pids.add(this.process.pid);
      if (!this.process?.pid && this.settings.webConnectionControlExternal) {
        for (const pid of await this.listenerProcessIds()) pids.add(pid);
      }
      if (pids.size === 0) {
        this.status = "stopped";
        this.error = "Nenhum processo Web Connection foi encontrado.";
        this.onChange();
        return;
      }
      if (process.platform === "win32") {
        const { execFile } = await import("node:child_process");
        for (const pid of pids)
          await new Promise<void>((resolve, reject) => {
            execFile("taskkill", ["/pid", String(pid), "/t", "/f"], (error) =>
              error ? reject(error) : resolve(),
            );
          });
      } else {
        for (const pid of pids) {
          try {
            process.kill(this.process?.pid === pid ? -pid : pid, "SIGTERM");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        }
      }
      this.process = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        if ((await this.isReachable()) === "stopped") {
          this.status = "stopped";
          this.error = "";
          this.onChange();
          return;
        }
      }
      this.status = "error";
      this.error =
        "O processo recebeu o pedido para parar, mas a porta continua ativa.";
      this.onChange();
    } catch (cause) {
      this.status = "error";
      this.error = `Não foi possível parar o serviço: ${String(cause)}`;
      this.onChange();
    }
  }

  private async listenerProcessIds(): Promise<number[]> {
    const { execFile } = await import("node:child_process");
    const execute = (command: string, args: string[]) =>
      new Promise<string>((resolve, reject) => {
        execFile(command, args, { timeout: 5000 }, (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout.trim());
        });
      });
    let output = "";
    if (process.platform === "win32") {
      try {
        output = await execute("powershell.exe", [
          "-NoProfile",
          "-Command",
          `(Get-NetTCPConnection -State Listen -LocalPort ${this.settings.webConnectionPort} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ','`,
        ]);
      } catch {
        output = "";
      }
    } else {
      try {
        output = await execute("lsof", [
          `-tiTCP:${this.settings.webConnectionPort}`,
          "-sTCP:LISTEN",
        ]);
      } catch {
        if (process.platform === "linux") {
          try {
            output = await execute("fuser", [
              "-n",
              "tcp",
              String(this.settings.webConnectionPort),
            ]);
          } catch {
            output = "";
          }
        }
      }
    }
    return output
      .split(/[\s,]+/)
      .map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  }

  private async isReachable(): Promise<WebConnectionState["status"]> {
    try {
      const response = await new Promise<number>((resolve, reject) => {
        const req = request(
          {
            hostname: "127.0.0.1",
            port: this.settings.webConnectionPort,
            path: "/.info",
            method: "GET",
            timeout: 1500,
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.on("timeout", () => req.destroy(new Error("Tempo esgotado.")));
        req.on("error", reject);
        req.end();
      });
      return response >= 200 && response < 400 ? "running" : "error";
    } catch {
      return "stopped";
    }
  }
}
