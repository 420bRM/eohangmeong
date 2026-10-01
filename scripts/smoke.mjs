// 어항멍 스모크 테스트: 로컬 서버를 띄운 뒤 `node scripts/smoke.mjs [url] [outdir]`
// 확인 항목: 콘솔 오류 없음, 시작 → 어항 그려짐, 패널·먹이·이름 저장, 서비스워커 등록과 오프라인 재실행
import { chromium, devices } from 'playwright';
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || 'test-results';
import fs from 'fs'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const reveal = async () => { await page.mouse.click(40, 140); await page.waitForTimeout(150); };
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };

await page.goto(url, { waitUntil: 'load' });
await page.screenshot({ path: `${out}/01-start.png` });
await page.click('#go');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/02-tank.png` });
const px = await page.evaluate(() => {
  const c = document.getElementById('c'), g = c.getContext('2d');
  const d = g.getImageData(c.width / 2, c.height * 0.8, 1, 1).data; return [...d];
});
ok(px[3] === 255 && px[0] + px[1] + px[2] > 30, `캔버스에 물이 그려짐 rgba(${px})`);

// 프레임 속도 (헤드리스 기준 참고값)
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); (function f(){ n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); })(); }));
console.log('INFO rAF fps ≈', fps.toFixed(1));

await reveal();
await page.click('#feed');
await page.click('#mood');
await page.waitForTimeout(400);
ok(await page.isVisible('#panel'), '분위기 패널 열림');
await page.click('#panel .pseg[data-k="rain"] button[data-v="1"]');
await page.click('#panel .pseg[data-k="tod"] button[data-v="4"]');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/03-panel-night-rain.png` });
await reveal(); await page.click('#mood');
await page.click('#panel .pseg[data-k="smooth"] button[data-v="0"]');
await page.mouse.click(195, 700);
await reveal();

await page.click('#fname');
await page.keyboard.press('Meta+A').catch(() => {});
await page.evaluate(() => { const f = document.getElementById('fname'); f.textContent = ''; });
await page.keyboard.type('금동이');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('eohangmeong.v1')));
ok(saved.name === '금동이', `이름 저장 (${saved.name})`);
ok(saved.rain === 1 && saved.tod === 4 && saved.smooth === 0, '분위기 설정 저장');
ok(saved.born > 0 && saved.days === 1, `함께한 날 계산 (days=${saved.days})`);

const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok(sw, '서비스워커 활성화');

await page.reload({ waitUntil: 'load' });
const msg = await page.textContent('#startMsg');
ok(msg.includes('금동이가 기다리고'), `재방문 인사: ${msg.trim()}`);

await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
ok(await page.isVisible('#go'), '오프라인에서 다시 열림');
await page.click('#go');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/04-offline.png` });
await ctx.setOffline(false);

const font = await page.evaluate(() => document.fonts.check('16px "Gowun Dodum"', '어항멍'));
ok(font, '번들 글꼴 로드');
ok(errors.length === 0, '콘솔 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
