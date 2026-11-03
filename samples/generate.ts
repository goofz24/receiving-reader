// npm run samples
//
// Writes the fake test documents, their answer keys and purchase orders.
// Uses Playwright's Chromium to print HTML to PDF, and to fake phone photos
// (screenshot of the page, tilted on a "desk", blurred, saved as a JPEG).
//
// Needs Playwright with Chromium: `npm i -D playwright && npx playwright install chromium`.
// You only need this to CHANGE the samples. The generated files are already in the repo.

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { SAMPLES } from "./data";
import { answerKey, purchaseOrder, renderHtml } from "./build";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = (...p: string[]) => path.join(here, ...p);

async function main() {
  for (const dir of ["documents", "answers", "purchase-orders"]) {
    await rm(out(dir), { recursive: true, force: true });
    await mkdir(out(dir), { recursive: true });
  }

  const caveat = (await readFile(out("assets", "caveat.ttf"))).toString("base64");
  const fontCss = `@font-face { font-family: Caveat; src: url(data:font/ttf;base64,${caveat}) format("truetype"); }`;

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });

  const index: { id: string; file: string; title: string; tests: string; expected_flags: string[] }[] = [];

  for (const s of SAMPLES) {
    await page.setContent(renderHtml(s, fontCss), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    let file: string;

    if (s.output === "pdf") {
      file = `${s.id}.pdf`;
      await page.pdf({
        path: out("documents", file),
        format: "Letter",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate:
          '<div style="font-size:8px;width:100%;text-align:right;padding-right:0.55in;color:#666">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
        margin: { top: "0.55in", bottom: "0.7in", left: "0.55in", right: "0.55in" },
      });
    } else {
      // 1) Screenshot the document as if it were a flat scan.
      await page.addStyleTag({ content: "body{padding:40px 44px 56px;background:#fff}" });
      await page.setViewportSize({ width: 816, height: 400 }); // full-page shot then crops to the content
      const flat = await page.screenshot({ fullPage: true, type: "png" });
      // 2) Put that image on a desk, tilt it, add shadow and blur, and save as a JPEG.
      const p = s.photo!;
      const w = Math.round(816 * p.scale * 0.85);
      await page.setViewportSize({ width: Math.round(w * 1.18), height: Math.round(w * 1.18 * 1.3) });
      await page.setContent(`<html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
        background: radial-gradient(ellipse at 30% 20%, #9a8063, #5c4632 70%, #3e2f22);">
        <img src="data:image/png;base64,${flat.toString("base64")}" style="width:${w}px;transform:rotate(${p.rotate}deg) perspective(1600px) rotateX(3deg);
          box-shadow: 8px 14px 30px rgba(0,0,0,.55); filter: blur(${p.blur}px) brightness(.96) contrast(.94) sepia(.08);">
        <div style="position:fixed;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.10),rgba(0,0,0,.18));"></div>
        </body></html>`);
      await page.waitForTimeout(50);
      file = `${s.id}.jpg`;
      await page.screenshot({ path: out("documents", file), type: "jpeg", quality: p.quality, scale: "css" });
      await page.setViewportSize({ width: 816, height: 1056 });
    }

    await writeFile(
      out("answers", `${s.id}.json`),
      JSON.stringify(
        { id: s.id, file, title: s.title, tests: s.tests, expected_flags: s.expected_flags, answer: answerKey(s) },
        null,
        2,
      ) + "\n",
    );
    const po = purchaseOrder(s);
    if (po) await writeFile(out("purchase-orders", `${po.po_number}.json`), JSON.stringify(po, null, 2) + "\n");
    index.push({ id: s.id, file, title: s.title, tests: s.tests, expected_flags: s.expected_flags });
    console.log(`  ${file}`);
  }

  await writeFile(out("documents", "index.json"), JSON.stringify(index, null, 2) + "\n");
  await browser.close();
  console.log(`Wrote ${SAMPLES.length} documents, answer keys and purchase orders.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
