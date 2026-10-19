import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage();
const cdp = await page.context().newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 400,
  downloadThroughput: 50 * 1024,
  uploadThroughput: 20 * 1024,
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

await page.addInitScript(() => {
  const shifts = [];
  globalThis.__shifts = shifts;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      shifts.push({
        value: e.value,
        hadRecentInput: e.hadRecentInput,
        time: e.startTime,
        sources: (e.sources ?? []).map((s) => s.node?.tagName ?? "?"),
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
});

await page.goto("http://127.0.0.1:3000/");
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const img = document.querySelector("img[alt='Ilustrasi hero']");
  return {
    shifts: globalThis.__shifts,
    img: img
      ? {
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          rect: img.getBoundingClientRect().toJSON(),
          w: img.getAttribute("width"),
          h: img.getAttribute("height"),
          loading: img.getAttribute("loading"),
        }
      : null,
    viewport: { w: innerWidth, h: innerHeight },
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
