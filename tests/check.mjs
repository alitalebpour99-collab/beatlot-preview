// Full check of the Beatlot preview: Chromium + WebKit, 390 / 768 / 1440, EN + DE + FA.
// Screenshots, console errors, failed requests, horizontal overflow, the sound tap, the controls.
import http from 'http'; import fs from 'fs'; import path from 'path';
import { chromium, webkit } from 'playwright';
const ROOT = process.cwd(), OUT = path.join(ROOT, 'out'), PORT = 8080;
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'picks'), { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  const size = fs.statSync(f).size, type = TYPES[path.extname(f)] || 'application/octet-stream', range = req.headers.range;
  if (range) { const m = /bytes=(\d*)-(\d*)/.exec(range); const a = m[1] ? +m[1] : 0, b = m[2] ? +m[2] : size - 1; res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1 }); return fs.createReadStream(f, { start: a, end: b }).pipe(res); }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(f).pipe(res);
}).listen(PORT);
const BASE = `http://localhost:${PORT}/index.html`;
const VPS = [{ n: 390, w: 390, h: 844, mobile: true }, { n: 768, w: 768, h: 1024, mobile: true }, { n: 1440, w: 1440, h: 900 }];
const SECS = ['how', 'ba-sec', 'brand', 'pricing', 'guide', 'owner', 'start'];
const PICK = /^(chromium-390-(en|fa|de)-(hero|how|ba-sec|brand|pricing|owner|start|footer)|chromium-1440-(en|fa)-(hero|how|ba-sec|brand|pricing|owner|start)|webkit-390-(en|fa)-(hero|pricing|brand)|chromium-768-de-(hero|pricing)|chromium-390-en-reduced|chromium-390-en-hero-reel|chromium-390-en-hero-end|chromium-1440-en-hero-drop)$/;
const report = { errors: [], overflow: [], sound: [], video: [], controls: [], fps: [], shots: 0, info: [] };
const FILTER = process.env.FILTER ? new RegExp(process.env.FILTER) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function track(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push({ tag, kind: 'console', text: m.text().slice(0, 300) }); });
  page.on('pageerror', (e) => report.errors.push({ tag, kind: 'pageerror', text: String(e).slice(0, 300) }));
  page.on('requestfailed', (r) => { const u = r.url(); if (/\.(mp4|webm|wav)$|^blob:/.test(u)) return; report.errors.push({ tag, kind: 'requestfailed', text: u + ' ' + (r.failure()?.errorText || '') }); });
  page.on('response', (r) => { if (r.status() >= 400) report.errors.push({ tag, kind: 'http' + r.status(), text: r.url() }); });
}
async function shot(page, name) {
  const f = path.join(OUT, 'shots', name + '.jpg');
  await page.screenshot({ path: f, type: 'jpeg', quality: 60 });
  report.shots++;
  if (PICK.test(name)) fs.copyFileSync(f, path.join(OUT, 'picks', name + '.jpg'));
}
async function overflow(page, tag) {
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      if (el.closest('.sr,.chat,.ba,.oc,.od')) continue;
      const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
      if (b.right > W + 1.5 || b.left < -1.5) bad.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} [${Math.round(b.left)},${Math.round(b.right)}]`);
    }
    return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 10) };
  });
  if (r.sw > r.W + 1 || r.bad.length) report.overflow.push({ tag, ...r });
}
async function to(page, id) { await page.evaluate((s) => { const e = document.getElementById(s); window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - 60, behavior: 'instant' }); }, id); }
async function fps(page, tag) { const n = await page.evaluate(() => new Promise((res) => { let c = 0; const t0 = performance.now(); const f = () => { c++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(c / 2); }; requestAnimationFrame(f); })); report.fps.push({ tag, fps: n }); }

for (const [bn, bt] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await bt.launch();
  for (const vp of VPS) for (const lang of ['en', 'de', 'fa']) {
    const tag = `${bn}-${vp.n}-${lang}`;
    if (FILTER && !FILTER.test(tag)) continue;
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: bn === 'chromium' && !!vp.mobile, hasTouch: !!vp.mobile, locale: { en: 'en-US', de: 'de-DE', fa: 'fa-IR' }[lang] });
    await ctx.addInitScript((l) => { try { localStorage.setItem('bl-lang', l); } catch (e) {} }, lang);
    const page = await ctx.newPage(); track(page, tag);
    try {
      await page.goto(BASE, { waitUntil: 'load' });
      await sleep(3200); await shot(page, `${tag}-hero`); await overflow(page, tag + '-hero');
      if (lang === 'en' && vp.n !== 768) { await sleep(5600); await shot(page, `${tag}-hero-reel`); if (vp.n === 1440) { await sleep(1000); await shot(page, `${tag}-hero-drop`); } await sleep(5000); await shot(page, `${tag}-hero-end`); }
      if (bn === 'chromium' && vp.n === 390 && lang === 'en') await fps(page, tag + '-hero');
      // the sound tap: the context must run and the demo must make sounds
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(300);
      await page.click('#snd'); await sleep(2600);
      const s = await page.evaluate(() => window.BL.state());
      const sok = s.sound && s.ac === 'running' && s.played > 2;
      report.sound.push({ tag, ok: sok, ...s }); if (!sok) report.errors.push({ tag, kind: 'sound', text: JSON.stringify(s) });
      await page.click('#snd'); await sleep(200);
      for (const id of SECS) { await to(page, id); await sleep(id === 'brand' ? 3200 : 1600); await shot(page, `${tag}-${id}`); }
      await overflow(page, tag + '-sections');
      // the loop video
      await to(page, 'start'); await sleep(2800);
      const v = await page.evaluate(() => { const v = document.getElementById('loopv'); return { src: v.currentSrc, t: Math.round(v.currentTime * 100) / 100, paused: v.paused, ready: v.readyState, err: v.error && v.error.code }; });
      report.video.push({ tag, ...v }); if (!v.src) report.errors.push({ tag, kind: 'video', text: JSON.stringify(v) });
      await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })); await sleep(800); await shot(page, `${tag}-footer`);
      if (vp.n !== 768) {
        // controls: before/after drag, brand pick, calculator
        await to(page, 'ba-sec'); await sleep(500);
        await page.evaluate(() => { window.__ev = []; const b = document.getElementById('ba'); ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'dragstart'].forEach((n) => b.addEventListener(n, (e) => window.__ev.push(n + ':' + Math.round(e.clientX)), true)); });
        const box = await page.locator('#ba').boundingBox();
        const hit = await page.evaluate((p) => { const e = document.elementFromPoint(p.x, p.y); return e ? e.tagName + '.' + e.className : null; }, { x: box.x + box.width * .5, y: box.y + box.height * .5 });
        await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5); await page.mouse.down(); await page.mouse.move(box.x + box.width * .2, box.y + box.height * .5, { steps: 6 }); await page.mouse.up();
        const bx = await page.evaluate(() => +document.getElementById('baH').getAttribute('aria-valuenow'));
        const ev = await page.evaluate(() => window.__ev.slice(0, 12).join(' '));
        report.info.push({ tag, hit, ev, box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)] });
        await to(page, 'brand'); await sleep(3200); await page.click('.opt[data-k="lindner"]'); await sleep(3000);
        const brand = await page.evaluate(() => ({ name: document.querySelector('[data-dname]').textContent, acc: getComputedStyle(document.documentElement).getPropertyValue('--d-acc').trim(), status: document.getElementById('brStatus').textContent }));
        await to(page, 'pricing'); await sleep(600);
        await page.locator('#rng').fill('30'); await sleep(900);
        const rec = await page.evaluate(() => [...document.querySelectorAll('.plan')].findIndex((p) => p.classList.contains('rec')));
        const ok = bx < 35 && brand.name === 'Autohaus Lindner' && rec === 2;
        report.controls.push({ tag, ok, bx, brand, rec }); if (!ok) report.errors.push({ tag, kind: 'controls', text: JSON.stringify({ bx, brand, rec }) });
        await shot(page, `${tag}-pricing-30`);
      }
      // switch the language at runtime
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await sleep(400);
      const other = lang === 'fa' ? 'en' : 'fa';
      await page.click(`.lang button[data-l="${other}"]`); await sleep(1200); await shot(page, `${tag}-to-${other}`); await overflow(page, tag + '-to-' + other);
    } catch (e) { report.errors.push({ tag, kind: 'test', text: String(e).slice(0, 400) }); }
    await ctx.close();
  }
  if (bn === 'chromium') {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); track(page, 'chromium-390-reduced');
    await page.goto(BASE); await sleep(1500); await shot(page, 'chromium-390-en-reduced'); await overflow(page, 'reduced');
    await ctx.close();
  }
  await browser.close();
}
server.close();
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(`shots ${report.shots}, errors ${report.errors.length}, overflow ${report.overflow.length}, sound ok ${report.sound.filter((p) => p.ok).length}/${report.sound.length}, controls ok ${report.controls.filter((p) => p.ok).length}/${report.controls.length}`);
console.log(JSON.stringify({ info: report.info, errors: report.errors.slice(0, 40), overflow: report.overflow.slice(0, 20), sound: report.sound, video: report.video, controls: report.controls, fps: report.fps }, null, 1));
process.exit(report.errors.length || report.overflow.length ? 1 : 0);
