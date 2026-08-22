import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

export interface BrowserStep {
  op: "goto" | "click" | "type" | "scroll" | "screenshot" | "snapshot";
  selector?: string;
  text?: string;
  path?: string;
}

export interface BrowserObservation {
  url: string;
  title: string;
  a11y: { role: string; name: string; disabled?: boolean }[];
  consoleErrors: string[];
  pageErrors: string[];
  requestUrls: string[];
  screenshotPath?: string;
  defects: string[];
  passed: boolean;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function serveStatic(root: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const rel = (req.url ?? "/").split("?")[0] === "/" ? "/index.html" : (req.url ?? "/").split("?")[0]!;
      const file = join(root, rel.replace(/^\/+/, ""));
      if (!file.startsWith(root) || !existsSync(file)) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      res.setHeader("content-type", MIME[extname(file)] ?? "application/octet-stream");
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("bind failed"));
        return;
      }
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

export async function runBrowserScript(opts: {
  root: string;
  steps?: BrowserStep[];
  screenshotDir?: string;
}): Promise<BrowserObservation> {
  const { server, url } = await serveStatic(opts.root);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestUrls: string[] = [];
  try {
    const playwright = await import("playwright");
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    page.on("request", (r) => requestUrls.push(r.url()));
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    for (const step of opts.steps ?? []) {
      if (step.op === "click" && step.selector) await page.locator(step.selector).first().click({ timeout: 4000 }).catch(() => undefined);
      if (step.op === "type" && step.selector && step.text) {
        await page.locator(step.selector).first().fill(step.text).catch(() => undefined);
      }
      if (step.op === "scroll") await page.mouse.wheel(0, 400);
    }
    const title = await page.title();
    const a11y = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("button, a, input, [role]")];
      return nodes.slice(0, 40).map((el) => ({
        role: el.getAttribute("role") || el.tagName.toLowerCase(),
        name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim(),
        disabled: "disabled" in el ? Boolean((el as HTMLButtonElement).disabled) : false,
      }));
    });
    let screenshotPath: string | undefined;
    if (opts.screenshotDir) {
      mkdirSync(opts.screenshotDir, { recursive: true });
      screenshotPath = join(opts.screenshotDir, `browser-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath });
    }
    await browser.close();

    const defects = findUiDefects(a11y, consoleErrors, pageErrors);

    return {
      url,
      title,
      a11y,
      consoleErrors,
      pageErrors,
      requestUrls: requestUrls.slice(0, 20),
      screenshotPath,
      defects,
      passed: defects.length === 0,
    };
  } catch (err) {
    return {
      url,
      title: "",
      a11y: [],
      consoleErrors,
      pageErrors: [err instanceof Error ? err.message : "browser failed"],
      requestUrls,
      defects: ["Browser runtime unavailable or crashed"],
      passed: false,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export function writeScreenshotMeta(path: string, note: string): void {
  writeFileSync(`${path}.txt`, note, "utf8");
}

export function findUiDefects(
  a11y: BrowserObservation["a11y"],
  consoleErrors: string[] = [],
  pageErrors: string[] = [],
): string[] {
  const defects: string[] = [];
  const named = a11y.find((n) => /sign in|log in/i.test(n.name));
  if (!named) defects.push("No accessible Sign in control");
  if (named?.disabled) defects.push("Sign in control is disabled");
  const buttons = a11y.filter((n) => n.role === "button");
  if (buttons.length && buttons.every((b) => b.disabled)) defects.push("All buttons are disabled");
  if (consoleErrors.length) defects.push(`Console errors: ${consoleErrors.length}`);
  if (pageErrors.length) defects.push(`Page errors: ${pageErrors.length}`);
  return defects;
}

export function runBrowserScriptSync(opts: {
  root: string;
  screenshotDir?: string;
}): BrowserObservation {
  const runner = join(process.cwd(), "services", "browser", "run.mjs");
  const args = [runner, opts.root];
  if (opts.screenshotDir) args.push(opts.screenshotDir);
  const res = spawnSync(process.execPath, args, {
    encoding: "utf8",
    timeout: 35_000,
    env: process.env,
  });
  const line = (res.stdout || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) {
    return {
      url: "",
      title: "",
      a11y: [],
      consoleErrors: [],
      pageErrors: [res.stderr?.slice(0, 400) || "browser runner produced no output"],
      requestUrls: [],
      defects: ["Browser runtime unavailable or crashed"],
      passed: false,
    };
  }
  try {
    return JSON.parse(line) as BrowserObservation;
  } catch {
    return {
      url: "",
      title: "",
      a11y: [],
      consoleErrors: [],
      pageErrors: ["invalid browser runner payload"],
      requestUrls: [],
      defects: ["Browser runtime unavailable or crashed"],
      passed: false,
    };
  }
}

