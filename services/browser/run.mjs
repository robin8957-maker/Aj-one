#!/usr/bin/env node
/**
 * One-shot Computer Use runner. Serves a static root, drives Chromium, prints JSON.
 * argv: <rootDir> [screenshotDir]
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.argv[2];
const screenshotDir = process.argv[3] || "";

if (!root) {
  process.stderr.write("usage: run.mjs <rootDir> [screenshotDir]\n");
  process.exit(2);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function findUiDefects(a11y, consoleErrors, pageErrors) {
  const defects = [];
  const named = a11y.find((n) => /sign in|log in/i.test(n.name));
  if (!named) defects.push("No accessible Sign in control");
  if (named?.disabled) defects.push("Sign in control is disabled");
  const buttons = a11y.filter((n) => n.role === "button");
  if (buttons.length && buttons.every((b) => b.disabled)) defects.push("All buttons are disabled");
  if (consoleErrors.length) defects.push(`Console errors: ${consoleErrors.length}`);
  if (pageErrors.length) defects.push(`Page errors: ${pageErrors.length}`);
  return defects;
}

function serve() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const rel = (req.url ?? "/").split("?")[0] === "/" ? "/index.html" : (req.url ?? "/").split("?")[0];
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

const { server, url } = await serve();
const consoleErrors = [];
const pageErrors = [];
const requestUrls = [];

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
  const user = page.locator("#user");
  if ((await user.count()) > 0) await user.fill("u_ada").catch(() => undefined);
  const named = page.locator('[aria-label="Sign in"], button:has-text("Sign in")');
  if ((await named.count()) > 0) {
    await named.first().click({ timeout: 4000 }).catch(() => undefined);
  } else {
    await page.locator("#login-btn, button").first().click({ timeout: 2000 }).catch(() => undefined);
  }
  await page.mouse.wheel(0, 80);
  const title = await page.title();
  const a11y = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll("button, a, input, [role]")];
    return nodes.slice(0, 40).map((el) => ({
      role: el.getAttribute("role") || el.tagName.toLowerCase(),
      name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim(),
      disabled: "disabled" in el ? Boolean(el.disabled) : false,
    }));
  });
  let screenshotPath;
  if (screenshotDir) {
    mkdirSync(screenshotDir, { recursive: true });
    screenshotPath = join(screenshotDir, `browser-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath });
  }
  await browser.close();
  const defects = findUiDefects(a11y, consoleErrors, pageErrors);
  process.stdout.write(
    `${JSON.stringify({
      url,
      title,
      a11y,
      consoleErrors,
      pageErrors,
      requestUrls: requestUrls.slice(0, 20),
      screenshotPath,
      defects,
      passed: defects.length === 0,
    })}\n`,
  );
} catch (err) {
  process.stdout.write(
    `${JSON.stringify({
      url,
      title: "",
      a11y: [],
      consoleErrors,
      pageErrors: [err instanceof Error ? err.message : "browser failed"],
      requestUrls,
      defects: ["Browser runtime unavailable or crashed"],
      passed: false,
    })}\n`,
  );
} finally {
  await new Promise((resolve) => server.close(() => resolve()));
}
