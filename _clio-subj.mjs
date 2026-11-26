import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("C:/Users/sanch/Documents/mes projets open code/kleo/app");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let f = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  if (f === "/") f = "/index.html";
  const p = path.join(root, f);
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": mime[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(4213, "127.0.0.1", r));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text()); });
await page.goto("http://127.0.0.1:4213/", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);

console.log("sections:", (await page.locator(".subject-block h2").allInnerTexts()).join(" | "));
console.log("dossiers par section:", await page.locator(".subject-block").nth(0).locator(".level-folder").count(), "/", await page.locator(".subject-block").nth(1).locator(".level-folder").count());
console.log("cartes:", await page.locator(".project-card").count());
await page.locator(".subject-block").nth(0).locator('[data-level="6e"]').click();
await page.waitForTimeout(400);
console.log("Histoire 6e:", (await page.locator(".subject-block").nth(0).locator(".project-card h3").allInnerTexts()).join(" | ") || "(vide)");
console.log("Géo 6e:", (await page.locator(".subject-block").nth(1).locator(".project-card").count()));
await page.screenshot({ path: "_clio-subjects.png" });

await page.click("#editTextsBtn");
await page.waitForTimeout(400);
console.log("éditable:", await page.locator(".project-card h3").first().getAttribute("contenteditable"));
await page.screenshot({ path: "_clio-edit.png" });
await page.click("#editTextsBtn");
await page.waitForTimeout(300);
console.log("éditable après:", await page.locator(".project-card h3").first().getAttribute("contenteditable"));
console.log("errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
server.close();
