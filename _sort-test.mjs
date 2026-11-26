import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  let f = decodeURIComponent((req.url || "/").split("?")[0]);
  if (f === "/") f = "/index.html";
  const p = path.join(root, f);
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": mime[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(4210, "127.0.0.1", r));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text()); });
await page.goto("http://127.0.0.1:4210/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
await page.screenshot({ path: "_brief.png" });
const notesBox = await page.locator(".briefing-notes").boundingBox();
console.log("briefing-notes:", notesBox && { w: Math.round(notesBox.width), h: Math.round(notesBox.height) });

await page.click('.step-button[data-step-target="3"]');
await page.waitForTimeout(400);
const poolCount = await page.locator("#sortPool .sort-item").count();
const first = page.locator("#sortPool .sort-item").first();
const fb = await first.boundingBox();
const col = page.locator('.sort-column[data-column="urss"]');
const cb = await col.boundingBox();
console.log("pool:", poolCount, "| tuile:", fb && { w: Math.round(fb.width), h: Math.round(fb.height) });
await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
await page.mouse.down();
await page.mouse.move(fb.x + fb.width / 2 + 30, fb.y + fb.height / 2 + 30, { steps: 5 });
await page.mouse.move(cb.x + cb.width / 2, cb.y + 90, { steps: 12 });
await page.screenshot({ path: "_drag.png" });
await page.mouse.up();
await page.waitForTimeout(500);
console.log("après glisser : pool", await page.locator("#sortPool .sort-item").count(), "| colonne urss", await page.locator('.sort-column[data-column="urss"] .sort-item').count());
await page.screenshot({ path: "_sort-after.png" });
console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await browser.close();
server.close();
