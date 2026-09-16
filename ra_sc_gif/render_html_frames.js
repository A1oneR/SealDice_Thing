// Render the supplied Canvas animation in headless Chromium.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
let chromium = null;
try { chromium = require('playwright').chromium; } catch (_) { /* direct Chrome mode below */ }

function directChrome(input, html) {
  const chrome = process.env.RA_SC_GIF_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  if (!fs.existsSync(chrome)) throw new Error('Chrome/Playwright 不可用');
  fs.mkdirSync(input.outDir, { recursive: true });
  for (let i = 0; i < input.frameCount; i++) {
    const p = i / (input.frameCount - 1);
    const injected = html.replace(/<\/body>/i, `<script>(function(){visualStyle=${JSON.stringify(input.config.style || 'dice')};rollConfig=${JSON.stringify(input.config)};var c=document.getElementById('diceCanvas');document.body.innerHTML='';document.body.style.margin='0';document.body.style.width='800px';document.body.style.height='800px';document.body.style.overflow='hidden';document.body.appendChild(c);c.width=800;c.height=800;c.style.width='800px';c.style.height='800px';renderFrame(${p});}})();<\/script></body>`);
    const file = path.join(input.outDir, `frame_src_${i}.html`);
    fs.writeFileSync(file, injected, 'utf8');
    const out = path.join(input.outDir, `frame_${String(i).padStart(3, '0')}.png`);
    const result = cp.spawnSync(chrome, ['--headless', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', '--window-size=800,800', `--screenshot=${out}`, `file:///${file.replace(/\\/g, '/')}`], { encoding: 'utf8', timeout: 30000 });
    if (result.status !== 0 || !fs.existsSync(out)) throw new Error((result.stderr || result.stdout || 'Chrome screenshot failed').slice(-500));
    fs.unlinkSync(file);
  }
}

async function main() {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const htmlPath = input.htmlPath;
  let html = fs.readFileSync(htmlPath, 'utf8');
  // gifshot is only needed by the browser export button; removing the remote
  // script makes server rendering deterministic and offline-safe.
  html = html.replace(/<script[^>]+gifshot[^>]*><\/script>/gi, '');
  if (!chromium) { directChrome(input, html); return; }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.RA_SC_GIF_CHROME || undefined });
  } catch (_) {
    directChrome(input, html);
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.renderFrame === 'function' && document.getElementById('diceCanvas'));
    await page.evaluate((cfg) => {
      visualStyle = cfg.style || 'dice';
      rollConfig = cfg;
      // The HTML renderer reads these globals directly.
      canvas.width = 800; canvas.height = 800;
    }, input.config);
    fs.mkdirSync(input.outDir, { recursive: true });
    for (let i = 0; i < input.frameCount; i++) {
      const p = i / (input.frameCount - 1);
      await page.evaluate((x) => window.renderFrame(x), p);
      await page.locator('#diceCanvas').screenshot({ path: path.join(input.outDir, `frame_${String(i).padStart(3, '0')}.png`) });
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
