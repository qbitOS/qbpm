#!/usr/bin/env node
/** Capture qbpm UI screenshots for README — run with server on BASE_URL */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8796";

const RIGHT_TABS = [
  ["panel-viz", "viz"],
  ["panel-inspector", "inspector"],
  ["panel-kbatch", "kbatch"],
  ["panel-tools", "tools"],
  ["panel-grok", "terminal"],
];

const DOCK_PANELS = [
  ["dock-video", "video"],
  ["dock-chat", "chat"],
  ["dock-music", "music"],
  ["dock-proc", "proc"],
];

async function waitReady(page) {
  await page.waitForSelector("#canvas", { timeout: 20000 });
  await page.waitForSelector("#float-dock-rail", { timeout: 20000 });
  await page.waitForTimeout(800);
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${name}.png`);
}

async function setRightTab(page, tab) {
  await page.click(`#right-tabs button[data-tab="${tab}"]`);
  await page.waitForTimeout(500);
}

async function toggleDock(page, key, open = true) {
  const btn = page.locator(`#float-dock-rail button[data-dock="${key}"]`);
  const active = await btn.evaluate((el) => el.classList.contains("active"));
  if (open !== active) await btn.click();
  await page.waitForTimeout(400);
}

async function collapseAllDock(page) {
  await page.click('#float-dock-rail button[data-dock="focus"]');
  await page.waitForTimeout(300);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/?static=1`, { waitUntil: "networkidle" });
  await waitReady(page);

  console.log(`Capturing → ${OUT}`);
  await collapseAllDock(page);
  await shot(page, "workspace-graph");

  for (const [name, tab] of RIGHT_TABS) {
    await setRightTab(page, tab);
    await shot(page, name);
  }

  await setRightTab(page, "viz");
  await collapseAllDock(page);
  for (const [name, key] of DOCK_PANELS) {
    await collapseAllDock(page);
    await toggleDock(page, key, true);
    await shot(page, name);
  }

  for (const [, key] of DOCK_PANELS) await toggleDock(page, key, true);
  await shot(page, "workspace-dock-all");

  await browser.close();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});