// Prints each documentation HTML file to PDF via the Chrome DevTools protocol, with a page-number footer.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Usage: node docs/pdf-source/print.mjs [prefix]   (needs Google Chrome; set CHROME_PATH if it is elsewhere)
const SRC = path.dirname(fileURLToPath(import.meta.url)).split(path.sep).join("/");
const OUT = path.resolve(SRC, "../pdf").split(path.sep).join("/");
fs.mkdirSync(OUT, { recursive: true });

const DOCS = [
  ["01-installation", "01_Installation_Guide.pdf", "Installation Guide"],
  ["02-setup", "02_Setup_and_Deployment_Guide.pdf", "Setup and Deployment Guide"],
  ["03-user-guide", "03_Website_User_Guide.pdf", "Website User Guide"],
  ["04-faq", "04_FAQ_Questions_and_Answers.pdf", "Questions and Answers"],
  ["05-viva", "05_Viva_Preparation.pdf", "Viva Preparation"],
  ["06-architecture", "06_Architecture_and_Design.pdf", "Architecture and Design"],
  ["07-api", "07_API_Documentation.pdf", "API Documentation"],
  ["08-database", "08_Database_Schema_and_Queries.pdf", "Database Schema and Queries"],
  ["09-coding-standards", "09_Coding_and_Style_Standards.pdf", "Coding and Style Standards"],
  ["10-test-plan", "10_Test_Plan_and_Test_Cases.pdf", "Test Plan and Test Cases"],
  ["11-quality-metrics", "11_Quality_Metrics_Report.pdf", "Quality Metrics Report"],
  ["12-release-notes", "12_Release_Notes_and_Changelog.pdf", "Release Notes and Changelog"],
  ["13-tracking", "13_Project_Tracking_Pack.pdf", "Project Tracking Pack"],
];
const only = process.argv[2];

const chrome = spawn(process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--disable-gpu", "--remote-debugging-port=9335", `--user-data-dir=${path.join(process.env.TEMP ?? "/tmp", "ot-print-profile")}`, "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  try { target = (await (await fetch("http://127.0.0.1:9335/json")).json()).find((t) => t.type === "page"); } catch {}
  if (!target) await sleep(250);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send("Page.enable");

for (const [src, out, title] of DOCS) {
  if (only && !src.startsWith(only)) continue;
  await send("Page.navigate", { url: `file:///${SRC}/${src}.html` });
  await sleep(1500);
  // Wait for fonts and images
  await send("Runtime.evaluate", {
    expression: "Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))])",
    awaitPromise: true,
  });
  const footer = `<div style="width:100%;font-family:'IBM Plex Mono',monospace;font-size:7px;color:#6b6a5c;padding:0 17mm;display:flex;justify-content:space-between;letter-spacing:.08em;text-transform:uppercase"><span>Organic Trace · ${title}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  const { result, error } = await send("Page.printToPDF", {
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate: footer,
  });
  if (error) { console.error(src, error.message); continue; }
  fs.writeFileSync(`${OUT}/${out}`, Buffer.from(result.data, "base64"));
  console.log("saved", out, Math.round(Buffer.from(result.data, "base64").length / 1024) + " KB");
}
ws.close(); chrome.kill();
