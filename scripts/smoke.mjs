// 어항멍 스모크 테스트: 로컬 서버를 띄운 뒤 `node scripts/smoke.mjs [url] [outdir]`
// 확인 항목: 콘솔 오류 없음, 첫 실행 안내와 보상, 상점에서 사기, 이름 바꾸기, 설정 저장, 다시 열기, 서비스워커와 오프라인 실행
import { chromium, devices } from 'playwright';
import fs from 'fs';
const url = process.argv[2] || 'http://localhost:8765/';
const out = process.argv[3] || 'test-results';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
const reveal = async () => { await page.mouse.click(40, 140); await page.waitForTimeout(150); };
const claimAll = async () => { for (let i = 0; i < 8; i++){ await page.waitForTimeout(450); if (!(await page.isVisible('#modal'))) return; await page.click('#mBtns .solid'); } };
const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('eohangmeong.v2')));

await page.goto(url, { waitUntil: 'load' });
await page.screenshot({ path: `${out}/01-start.png` });
await page.click('#go');
await page.waitForTimeout(600);
ok(await page.isVisible('#modal'), '첫 실행 안내 카드');
await page.screenshot({ path: `${out}/02-intro.png` });
await claimAll();
let s = await save();
ok(s.pearls >= 330, `환영·출석 진주 (${s.pearls})`);
ok(s.tanks[0].creatures.length === 1 && s.tanks[0].creatures[0].name === '뽀글이', '첫 물고기 뽀글이');

const px = await page.evaluate(() => { const c = document.getElementById('c'); return [...c.getContext('2d').getImageData(c.width / 2, c.height * 0.8, 1, 1).data]; });
ok(px[3] === 255 && px[0] + px[1] + px[2] > 30, `캔버스에 물이 그려짐 rgba(${px})`);

// 상점에서 구피 사기
await reveal();
await page.click('#menuBtn'); await page.waitForTimeout(500);
await page.click('[data-act="buy"][data-k="guppy"]'); await page.waitForTimeout(600);
s = await save();
ok(s.tanks[0].creatures.some(c => c.sp === 'guppy'), '구피 들이기');
await claimAll();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/03-guppy.png` });

// 이름 바꾸기
await reveal();
await page.click('#chip'); await page.waitForTimeout(400);
await page.click('#sheetBody [data-act="rename"]'); await page.waitForTimeout(200);
await page.fill('#nameIn', '금동이'); await page.click('#mBtns .solid'); await page.waitForTimeout(300);

// 설정
await page.click('.tabs [data-tab="set"]'); await page.waitForTimeout(300);
await page.click('#sheetBody [data-k="rain"][data-v="1"]');
await page.click('#sheetBody [data-k="tod"][data-v="4"]');
await page.click('#sheetBody [data-k="smooth"][data-v="0"]');
await page.screenshot({ path: `${out}/04-settings.png` });
await page.click('#sheetClose'); await page.waitForTimeout(3500);
s = await save();
ok(s.tanks[0].creatures.some(c => c.name === '금동이'), '이름 저장');
ok(s.set.rain === 1 && s.set.tod === 4 && s.set.smooth === 0, '설정 저장');
await page.screenshot({ path: `${out}/05-night-rain.png` });

const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok(sw, '서비스워커 활성화');

await page.reload({ waitUntil: 'load' });
const msg = await page.textContent('#startMsg');
ok(/기다리고/.test(msg), `재방문 인사: ${msg.trim()}`);
await page.waitForTimeout(1500);

await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' });
ok(await page.isVisible('#go'), '오프라인에서 다시 열림');
await page.click('#go'); await page.waitForTimeout(1500);
await claimAll();
s = await save();
ok(s.tanks[0].creatures.length === 2, '오프라인에서도 기록 유지');
await page.screenshot({ path: `${out}/06-offline.png` });
await ctx.setOffline(false);

ok(await page.evaluate(() => document.fonts.check('16px "Gowun Dodum"', '어항멍')), '번들 글꼴 로드');
ok(errors.length === 0, '콘솔 오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
