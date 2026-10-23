// Automatischer Test der App mit Chromium (iPad- und iPhone-Maße, Touch).
// Start: node tests/app.test.mjs   (startet selbst einen lokalen Webserver)
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/opt/node22/lib/node_modules/playwright'); }
const { chromium } = playwright;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tests', 'output');
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(ROOT, 'tests', 'fixtures');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(8765, r));
const BASE = 'http://localhost:8765/';

let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  ✓ ' + msg); } else { failures++; console.log('  ✗ ' + msg); } };

const IPAD_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, userAgent: IPAD_UA, acceptDownloads: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
const page = await context.newPage();
const errors = [], external = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
context.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
const shot = async (name, pg = page) => { await pg.waitForTimeout(450); return pg.screenshot({ path: path.join(OUT, name + '.png') }); };
const center = (pg = page) => pg.textContent('#tbCenter');
const topicIs = (n, pg = page) => pg.waitForFunction((n) => (document.querySelector('#tbCenter') || {}).textContent?.includes('Thema ' + n + ' '), n, { timeout: 4000 }).then(() => true, () => false);
const data = (pg = page) => pg.evaluate(() => window.__app.data);
async function swipe(dx, { ms = 60, pg = page } = {}) {
  // Wisch-Geste mit Pointer-Events (Touch) auf dem Vorschlag eines Themas
  await pg.evaluate(async ({ dx, ms }) => {
    const box = document.querySelector('#v-detail .proposal .txt').getBoundingClientRect();
    const x0 = box.left + box.width / 2, y = box.top + box.height / 2;
    const el = document.elementFromPoint(x0, y);
    const opt = (x) => ({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 });
    el.dispatchEvent(new PointerEvent('pointerdown', opt(x0)));
    for (let i = 1; i <= 6; i++) { await new Promise((r) => setTimeout(r, ms / 6)); el.dispatchEvent(new PointerEvent('pointermove', opt(x0 + (dx * i) / 6))); }
    el.dispatchEvent(new PointerEvent('pointerup', opt(x0 + dx)));
  }, { dx, ms });
}
async function addPersonVia(pg, trigger, name, email) {
  await pg.click(trigger);
  await pg.fill('#pName', name);
  if (email) await pg.fill('#pMail', email);
  await pg.click('#dcFoot >> text=Sichern');
  await pg.waitForTimeout(250);
}

console.log('\n1) Parser');
await page.goto(BASE);
const parse = (t) => page.evaluate((t) => window.__app.parseList(t, { autoKat: true, herkunft: 'Werkstatt' }), t);
let r = await parse(fs.readFileSync(path.join(FIX, 'liste-varianten.txt'), 'utf8'));
ok(r.items.length === 6, `Varianten-Liste: 6 Themen erkannt (ist ${r.items.length})`);
ok(r.items[0].offen === 'Wer vertritt im Urlaub?' && r.items[0].loesung.startsWith('Feste Zuständigkeit'), 'Inline „Offen:“ wird abgetrennt');
ok(r.items[1].kritik.includes('zweite Zeile'), 'Mehrzeilige Kritik bleibt zusammen');
ok(r.items[2].urspNr === 3 && r.items[2].kritik.startsWith('Nummer auf eigener Zeile'), 'Nummer auf eigener Zeile');
ok(r.items[3].loesung.includes('1. Schritt') && r.items[3].loesung.includes('2. Schritt'), 'Nummerierte Unterpunkte in der Lösung bleiben in der Lösung');
ok(r.items[4].kategorie === 'Personal und Ausbildung' && r.items[4].herkunft === 'Geschäftsführung' && r.items[4].prioritaet === 'hoch', 'Optionale Zeilen Kategorie/Herkunft/Priorität');
ok(r.items[5].kritik.startsWith('Fett formatiert') && r.items[5].loesung === 'Markdown-Sternchen werden entfernt.', 'Markdown-Fettdruck & „Loesung“ ohne Umlaut');
r = await parse('Einleitung zur Liste\n\n1. Kritik: A\nLösung: B\n3. Kritik: C\nLösung: D');
ok(r.items.length === 2 && r.warnings.some((w) => w.includes('2 fehlt')) && r.warnings.some((w) => w.includes('ignoriert')), 'Warnung bei fehlender Nummer und Einleitungstext');

console.log('\n2) Liste importieren (1180×820)');
await shot('01-leer');
await page.click('#v-list [data-action="open-import"]');
await page.fill('#importText', fs.readFileSync(path.join(FIX, 'beispiel-liste.txt'), 'utf8'));
await page.waitForTimeout(300);
ok(await page.locator('.imp-row').count() === 14, 'Vorschau zeigt 14 Themen');
await page.selectOption('[data-imp="13"][data-key="kategorie"]', 'Sonstiges');
await shot('02-import-vorschau');
await page.click('#impApply');
await page.waitForTimeout(300);
ok(await page.locator('.pt-row').count() === 14, '14 Themen in der Liste');
ok((await data()).punkte[13].kategorie === 'Sonstiges', 'Geänderte Kategorie übernommen');

console.log('\n3) Besprechung & Personen');
await page.click('.title-btn');
await page.waitForTimeout(400);
await page.fill('[data-mfield="titel"]', 'Test-Runde Werkstatt');
await page.fill('[data-mfield="datum"]', '2026-10-26');
await page.fill('[data-mfield="absender"]', 'Daniel Demo');
await addPersonVia(page, '#dlg-meeting [data-action="new-person"]', 'Anna Beispiel', 'anna@example.com');
await addPersonVia(page, '#dlg-meeting [data-action="new-person"]', 'Ben Muster', 'ben@example.com');
await addPersonVia(page, '#dlg-meeting [data-action="new-person"]', 'Carla Probe', 'carla@example.com');
ok((await data()).meeting.personen.length === 3, '3 Personen mit E-Mail angelegt');
await shot('03-personen');
await page.click('#dlg-meeting [data-action="close-dialog"]');
await page.waitForTimeout(300);

console.log('\n4) Ein Thema bearbeiten');
await page.locator('.pt-main').first().click();
ok((await center()).includes('Thema 1 von 14'), 'Thema öffnet sich („Thema 1 von 14“)');
ok(await page.locator('#v-detail .proposal .offen-box').isVisible(), 'Vorschlag mit hervorgehobenem „Offen“');
await page.click('#v-detail .disc');
ok((await data()).punkte[0].besprochen, '„Als besprochen markieren“');
await page.click('#ownerChips >> text=Carla Probe');
ok((await data()).punkte[0].verantwortlich === 'Carla Probe' && (await data()).punkte[0].status === 'arbeit', 'Verantwortliche gesetzt → Status springt auf „In Bearbeitung“');
await page.click('#fristChips >> text=+2 Wochen');
ok(!!(await data()).punkte[0].frist, 'Frist per Schnellwahl');
await page.click('#subs [data-action="add-sub"]');
await page.keyboard.type('Liste offener Anträge erstellen');
await page.keyboard.press('Enter');
await page.keyboard.type('Vertretung im Urlaub klären');
await page.keyboard.press('Enter');
await page.keyboard.type('- Montags an GF melden; "wöchentlich"');
await page.keyboard.press('Enter');
await page.keyboard.press('Backspace');
let subs = (await data()).punkte[0].unterpunkte;
ok(subs.length === 3 && subs[1].text === 'Vertretung im Urlaub klären', 'Unterpunkte mit „+“ und Enter, leere Zeile per Rücktaste entfernt');
await page.locator('#subs .sub-row .tick').first().click();
ok((await data()).punkte[0].unterpunkte[0].erledigt && (await page.textContent('#subLabel')).includes('1 von 3'), 'Unterpunkt abgehakt („1 von 3 erledigt“)');
const h1 = await page.$eval('[data-field="notizen"]', (e) => e.offsetHeight);
await page.fill('[data-field="notizen"]', Array(12).fill('Notiz äöü ß').join('\n'));
const h2 = await page.$eval('[data-field="notizen"]', (e) => e.offsetHeight);
ok(h2 > h1 + 100, `Notizfeld wächst mit (${h1}px → ${h2}px)`);
await page.fill('[data-field="notizen"]', 'Rückstau ca. 15 Anträge – äöü ß');
await page.waitForTimeout(500);
ok((await page.textContent('#saveState')).includes('Gespeichert'), 'Anzeige „Gespeichert“');
await shot('04-thema');

console.log('\n5) Blättern, Wischen, Zurück');
await page.click('[data-action="step"][data-dir="1"]');
ok(await topicIs(2), 'Pfeil → Thema 2');
await page.waitForTimeout(500);
await swipe(-260);
ok(await topicIs(3), 'Wischen nach links → Thema 3');
await page.waitForTimeout(600);
await swipe(40, { ms: 400 });
await page.waitForTimeout(700);
ok(await topicIs(3), 'Kurzes Ziehen federt zurück');
await swipe(260);
ok(await topicIs(2), 'Wischen nach rechts → Thema 2');
await page.waitForTimeout(500);
await page.click('#v-detail [data-action="set-status"][data-value="erledigt"]');
await page.click('[data-action="back"]');
await page.waitForTimeout(400);
ok(await page.locator('#v-list').isVisible(), '„‹ Themen“ führt zur Liste');
const row1 = await page.locator('.pt-row').first().textContent();
ok(row1.includes('In Bearbeitung') && row1.includes('Carla Probe') && row1.includes('1/3 erledigt'), 'Liste zeigt Status, Verantwortliche und Fortschritt');
await page.locator('.pt-row').nth(3).locator('.tick').click();
ok((await page.textContent('#progressText')).startsWith('3 von 14 besprochen'), 'Kreis in der Liste markiert „besprochen“ (3 von 14)');

console.log('\n6) Filter & Sortieren');
await page.click('[data-action="filter-status"][data-value="arbeit"]');
ok(await page.locator('.pt-row').count() === 1, 'Filter „In Bearbeitung“ → 1 Thema');
await page.click('[data-action="filter-status"][data-value="alle"]');
await page.selectOption('#fPerson', 'Carla Probe');
ok(await page.locator('.pt-row').count() === 1, 'Filter „Carla Probe“ → 1 Thema');
await page.selectOption('#fPerson', '__niemand');
ok(await page.locator('.pt-row').count() === 13, 'Filter „Ohne Verantwortlichen“ → 13 Themen');
await page.selectOption('#fPerson', 'alle');
await page.click('[data-action="toggle-reorder"]');
const id2 = (await data()).punkte[1].id;
await page.locator('.pt-row').nth(1).locator('[data-dir="-1"]').click();
await page.waitForTimeout(500);
ok((await data()).punkte[0].id === id2, 'Sortieren: Thema 2 nach oben');
await page.locator('.pt-row').nth(0).locator('[data-dir="1"]').click();
await page.waitForTimeout(500);
await page.click('[data-action="toggle-reorder"]');
ok((await data()).punkte[1].id === id2, '… und wieder zurück');
await shot('05-liste');

console.log('\n7) Gespeichert nach Neuladen');
await page.reload();
await page.waitForTimeout(300);
let d = await data();
ok(d.punkte.length === 14 && d.punkte[0].notizen.includes('äöü') && d.punkte[0].verantwortlich === 'Carla Probe' && d.punkte[0].unterpunkte.length === 3 && d.meeting.personen.length === 3, 'Alle Eingaben nach Neuladen vorhanden');

console.log('\n8) Export: Auswahl, E-Mail, Excel, PDF');
await page.evaluate(() => { const d = window.__app.data; d.punkte[2].verantwortlich = 'Carla Probe'; d.punkte[2].status = 'arbeit'; d.punkte[3].verantwortlich = 'Ben Muster'; d.punkte[3].status = 'arbeit'; });
await page.click('[data-action="open-share"]');
await page.waitForTimeout(500);
await page.click('#dlg-share [data-action="ex-status"][data-value="offen"]');
await page.selectOption('#dlg-share select[data-pref="exPerson"]', 'Carla Probe');
ok((await page.textContent('#exCount')).startsWith('2 Themen'), 'Auswahl „Nicht erledigt · Carla Probe“ → 2 Themen');
await shot('06-export');
await page.evaluate(() => { window.__mails = []; window.__mailHook = (m) => window.__mails.push(m); });
await page.click('#dlg-share [data-action="mail-selection"]');
let mail = (await page.evaluate(() => window.__mails))[0];
ok(mail.to === 'carla@example.com' && mail.body.startsWith('Hallo Carla,') && mail.body.includes('[x] Liste offener Anträge erstellen') && mail.body.includes('[ ] Vertretung im Urlaub klären'), 'E-Mail an Carla: richtige Adresse, Unterpunkte zum Abhaken');
ok(!mail.body.includes('Rückstau'), 'Gesprächsnotizen standardmäßig nicht in der Mail');
ok(mail.url.startsWith('mailto:carla@example.com?subject=') && mail.body.includes('Daniel Demo'), 'mailto-Link mit Betreff und Grußzeile');
await page.selectOption('#dlg-share select[data-pref="exPerson"]', 'alle');
ok(await page.locator('#dlg-share .mail-row').count() === 2, '„E-Mail an jeden Verantwortlichen“: Carla und Ben');
await page.click('#dlg-share .mail-row >> text=Ben Muster');
mail = (await page.evaluate(() => window.__mails))[1];
ok(mail.to === 'ben@example.com' && mail.subject.includes('Dein Thema'), 'E-Mail an Ben nur mit seinem Thema');
let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-share [data-action="csv"]')]);
const csv = fs.readFileSync(await dl.path());
fs.writeFileSync(path.join(OUT, dl.suggestedFilename()), csv);
const csvText = csv.toString('utf8');
ok(csv[0] === 0xef && csv[1] === 0xbb && csv[2] === 0xbf && csvText.split('\r\n')[0].includes(';Verantwortlich;Frist;Status;'), 'CSV: UTF-8-BOM, Semikolon, Spalten');
ok(csvText.includes('"✓ Liste offener Anträge erstellen') && !csvText.includes('Bestellte Ersatzteile'), 'CSV enthält nur die Auswahl (nicht erledigte) samt Unterpunkten');
[dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-share [data-action="backup-save"]')]);
const backupPath = path.join(OUT, 'backup-test.json');
fs.copyFileSync(await dl.path(), backupPath);
ok(JSON.parse(fs.readFileSync(backupPath, 'utf8')).punkte.length === 14, 'JSON-Backup vollständig');
await page.evaluate(() => { window.print = () => {}; document.querySelector('#dlg-share [data-action="print"]').click(); });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: path.join(OUT, 'druck-nach-person.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
await page.emulateMedia({ media: 'screen' });
const printed = await page.textContent('#print');
ok(printed.includes('Carla Probe (2)') && printed.includes('Ben Muster (1)') && printed.includes('☑'), 'PDF: nach Person gegliedert, Unterpunkte mit Kästchen');

console.log('\n9) Alles löschen & Backup laden');
await page.click('[data-action="open-more"]');
await page.click('#dlg-more [data-action="reset-all"]');
await page.click('#dcFoot >> text=Alles löschen');
await page.waitForTimeout(300);
ok((await data()).punkte.length === 0, 'Daten gelöscht');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#v-list [data-action="backup-load"]')]);
await chooser.setFiles(backupPath);
await page.click('#dcFoot >> text=Daten ersetzen');
await page.waitForTimeout(300);
ok((await data()).punkte.length === 14 && (await data()).meeting.personen.length === 3, 'Backup wiederhergestellt');

console.log('\n10) Alte Daten (Version 1) werden übernommen');
await page.evaluate(() => localStorage.setItem('bprot.v1.data', JSON.stringify({ app: 'besprechungsprotokoll', version: 1, meeting: { titel: 'Alt', teilnehmer: 'Anna Beispiel, Ben Muster', protokoll: 'Daniel Demo' },
  punkte: [{ id: 'a1', kritik: 'Altes Thema', beschluss: '- Schritt eins\n- Schritt zwei', kriterium: 'Kein Rückstau', verantwortlich: 'Ben Muster', status: 'besprochen', prioritaet: 'hoch' }, { id: 'a2', kritik: 'Vertagtes', status: 'vertagt' }] })));
await page.reload();
d = await data();
const a1 = d.punkte[0];
ok(a1.titel === 'Altes Thema' && a1.unterpunkte.map((u) => u.text).join('|') === 'Schritt eins|Schritt zwei' && a1.status === 'arbeit' && a1.besprochen && a1.wichtig && a1.notizen.includes('Kein Rückstau'), 'Beschluss → Unterpunkte, Status und Priorität übertragen');
ok(d.meeting.personen.map((x) => x.name).join(',') === 'Anna Beispiel,Ben Muster' && d.meeting.absender === 'Daniel Demo' && d.punkte[1].status === 'offen', 'Teilnehmer → Personen, vertagt → offen');
await page.click('[data-action="open-more"]');
await page.click('#dlg-more [data-action="load-sample"]');
await page.click('#dcFoot >> text=Ersetzen');
await page.waitForTimeout(400);

console.log('\n11) Darstellung (iPad hoch/quer, dunkel)');
for (const [w, h] of [[820, 1180], [1180, 820]]) {
  await page.setViewportSize({ width: w, height: h });
  if (await page.locator('[data-action="back"]').count()) await page.click('[data-action="back"]');
  await page.waitForTimeout(200);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${w}×${h} Liste: kein seitliches Scrollen`);
  if (w === 820) await shot('07-hoch-liste');
  await page.locator('.pt-main').first().click();
  await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${w}×${h} Thema: kein seitliches Scrollen`);
  if (w === 820) await shot('08-hoch-thema');
}
await page.emulateMedia({ colorScheme: 'dark' });
await shot('09-thema-dunkel');
await page.click('[data-action="back"]');
await shot('10-liste-dunkel');
await page.emulateMedia({ colorScheme: 'light' });

console.log('\n12) Fenster & Bewegung');
await page.click('[data-action="open-share"]');
ok(/px/.test(await page.$eval('#dlg-share', (x) => x.style.transformOrigin)), 'Export-Popover wächst aus dem Teilen-Symbol');
await page.mouse.click(40, 700);
await page.waitForTimeout(500);
ok(await page.$eval('#dlg-share', (x) => !x.open), 'Tippen daneben schließt das Popover');
await page.click('.title-btn');
await page.waitForTimeout(600);
const hb = await (await page.$('#dlg-meeting .dlg-head h2')).boundingBox();
await page.evaluate(async ({ x, y }) => {
  const el = document.querySelector('#dlg-meeting .dlg-head');
  const o = (yy) => ({ bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: 0 });
  el.dispatchEvent(new PointerEvent('pointerdown', o(y)));
  for (let i = 1; i <= 5; i++) { await new Promise((r) => setTimeout(r, 12)); el.dispatchEvent(new PointerEvent('pointermove', o(y + i * 40))); }
  el.dispatchEvent(new PointerEvent('pointerup', o(y + 200)));
}, { x: hb.x + 5, y: hb.y + 5 });
await page.waitForTimeout(700);
ok(await page.$eval('#dlg-meeting', (x) => !x.open), 'Fenster lässt sich nach unten wegziehen');
await page.click('[data-action="open-more"]');
await page.click('#dlg-more [data-action="open-help"]');
await shot('11-leitfaden');
await page.keyboard.press('Escape');

console.log('\n13) Bewegung reduzieren');
const rm = await browser.newContext({ viewport: { width: 1180, height: 820 }, reducedMotion: 'reduce', hasTouch: true, userAgent: IPAD_UA, locale: 'de-DE' });
const p2 = await rm.newPage(); const err2 = []; p2.on('pageerror', (e) => err2.push(e.message));
await p2.goto(BASE);
await p2.click('[data-action="load-sample"]');
await p2.click('.pt-main >> nth=0');
await p2.click('[data-action="step"][data-dir="1"]');
ok((await p2.textContent('#tbCenter')).includes('Thema 2'), 'Ohne Animation: Wechsel sofort');
ok(err2.length === 0, 'Keine Fehler bei reduzierter Bewegung');
await rm.close();

console.log('\n14) Offline (Service Worker)');
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 }).catch(() => {});
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'Service Worker aktiv');
await context.setOffline(true);
await page.reload();
ok(await page.locator('.pt-row').count() === 14, 'App lädt offline inkl. Daten');
await context.setOffline(false);

console.log('\n15) Abgleich iPad ↔ iPhone (OneDrive simuliert)');
const cloud = { file: null, etag: 0, archive: [] };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS' };
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function fakeMicrosoft(ctx, who) {
  await ctx.route('https://login.microsoftonline.com/**', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (url.pathname.endsWith('/authorize')) return route.fulfill({ status: 302, headers: { Location: `${BASE}?code=CODE-${who}&state=${url.searchParams.get('state')}` } });
    const body = new URLSearchParams(req.postData() || '');
    const okGrant = body.get('grant_type') === 'refresh_token' || (body.get('code') === 'CODE-' + who && body.get('code_verifier'));
    if (!okGrant) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: 'invalid_grant' }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ access_token: 'AT-' + who, refresh_token: 'RT-' + who, expires_in: 3600, id_token: b64u({ alg: 'none' }) + '.' + b64u({ name: 'Test Nutzer', preferred_username: 'test@example.com' }) + '.x' }) });
  });
  await ctx.route('https://graph.microsoft.com/**', async (route) => {
    const req = route.request(), url = decodeURIComponent(new URL(req.url()).pathname);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (!(req.headers().authorization || '').startsWith('Bearer AT-')) return route.fulfill({ status: 401, headers: CORS });
    if (url.endsWith('/Apps/Besprechungsprotokoll/aktuell.json') && req.method() === 'GET') {
      if (!cloud.file) return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{}' });
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ eTag: '"e' + cloud.etag + '"', '@microsoft.graph.downloadUrl': 'https://example-my.sharepoint.com/dl/aktuell' }) });
    }
    if (req.method() === 'PUT' && url.includes('/Archiv/')) { cloud.archive.push(url); return route.fulfill({ status: 201, headers: CORS, contentType: 'application/json', body: '{}' }); }
    if (req.method() === 'PUT' && url.endsWith('aktuell.json:/content')) {
      const im = req.headers()['if-match'];
      if (im && cloud.file && im !== '"e' + cloud.etag + '"') return route.fulfill({ status: 412, headers: CORS, contentType: 'application/json', body: '{}' });
      cloud.file = req.postData(); cloud.etag++;
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ eTag: '"e' + cloud.etag + '"' }) });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' });
  });
  await ctx.route('https://example-my.sharepoint.com/**', (route) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: cloud.file || '{}' }));
}
async function device(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, userAgent: IPAD_UA, locale: 'de-DE', serviceWorkers: 'block' });
  await fakeMicrosoft(ctx, name);
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message));
  await pg.goto(BASE);
  return { ctx, pg, errs };
}
async function connect(pg) {
  await pg.click('[data-action="open-more"]');
  await pg.click('#dlg-more [data-action="open-sync"]');
  await pg.fill('#msClient', '11111111-2222-3333-4444-555555555555');
  await pg.fill('#msTenant', 'example.onmicrosoft.com');
  await Promise.all([pg.waitForURL((u) => !u.search, { timeout: 8000 }).catch(() => {}), pg.click('[data-action="sync-save-config"]')]);
  return pg.waitForFunction(() => window.__app && window.__app.syncState.s === 'ok', null, { timeout: 8000 }).then(() => true, () => false);
}
const pts = (pg) => pg.evaluate(() => window.__app.data.punkte.map((p) => ({ id: p.id, n: p.notizen, t: p.titel, s: p.unterpunkte.map((u) => u.text) })));
const syncNow = (pg) => pg.evaluate(() => window.__app.syncNow()).then(() => pg.waitForFunction(() => window.__app.syncState.s === 'ok', null, { timeout: 5000 }));
const openTopic = async (pg, i) => { if (await pg.locator('[data-action="back"]').count()) await pg.click('[data-action="back"]'); await pg.locator('.pt-main').nth(i).click(); await pg.waitForTimeout(150); };

const A = await device('ipad', { width: 1180, height: 820 });
await A.pg.click('[data-action="load-sample"]');
ok(await connect(A.pg), 'iPad: mit Microsoft angemeldet und abgeglichen');
ok(!!cloud.file && JSON.parse(cloud.file).punkte.length === 14, 'iPad hat die Themen in OneDrive abgelegt');
ok((await A.pg.textContent('#saveState')).includes('Synchronisiert'), 'Anzeige „Synchronisiert“');
const B = await device('iphone', { width: 390, height: 844 });
ok(await connect(B.pg), 'iPhone: angemeldet');
ok((await pts(B.pg)).length === 14, 'iPhone zeigt dieselben 14 Themen');
await openTopic(B.pg, 1);
await B.pg.fill('[data-field="notizen"]', 'Notiz vom iPhone');
await B.pg.waitForTimeout(400); await syncNow(B.pg); await syncNow(A.pg);
ok((await pts(A.pg))[1].n === 'Notiz vom iPhone', 'Notiz vom iPhone erscheint auf dem iPad');
await openTopic(A.pg, 2);
await A.pg.click('#subs [data-action="add-sub"]'); await A.pg.keyboard.type('Unterpunkt vom iPad');
await openTopic(B.pg, 3);
await B.pg.fill('[data-field="notizen"]', 'Gleichzeitig vom iPhone');
await A.pg.waitForTimeout(400); await B.pg.waitForTimeout(400);
await syncNow(A.pg); await syncNow(B.pg); await syncNow(A.pg);
const pa = await pts(A.pg), pb = await pts(B.pg);
ok(pa[2].s.includes('Unterpunkt vom iPad') && pb[2].s.includes('Unterpunkt vom iPad') && pa[3].n === 'Gleichzeitig vom iPhone' && pb[3].n === 'Gleichzeitig vom iPhone', 'Gleichzeitige Änderungen an verschiedenen Themen werden zusammengeführt');
const delId = pa[4].id;
await openTopic(A.pg, 4);
await A.pg.click('#v-detail [data-action="delete-point"]');
await A.pg.waitForTimeout(400); await syncNow(A.pg); await syncNow(B.pg); await syncNow(A.pg);
ok(!(await pts(B.pg)).some((p) => p.id === delId) && !(await pts(A.pg)).some((p) => p.id === delId), 'Gelöschtes Thema verschwindet auf beiden Geräten');
await B.ctx.setOffline(true);
await B.pg.evaluate(() => window.dispatchEvent(new Event('offline')));
await openTopic(B.pg, 0);
await B.pg.fill('[data-field="notizen"]', 'Offline im Restaurant geschrieben');
await B.pg.waitForTimeout(500);
ok((await B.pg.textContent('#saveState')).includes('Offline'), 'iPhone zeigt „Offline“ und speichert lokal');
await B.ctx.setOffline(false);
await B.pg.evaluate(() => window.dispatchEvent(new Event('online')));
await B.pg.waitForFunction(() => window.__app.syncState.s === 'ok', null, { timeout: 6000 }).catch(() => {});
await syncNow(A.pg);
ok((await pts(A.pg))[0].n === 'Offline im Restaurant geschrieben', 'Offline-Notiz kommt nach Verbindung aufs iPad');
if (await A.pg.locator('[data-action="back"]').count()) await A.pg.click('[data-action="back"]');
await A.pg.click('[data-action="open-more"]'); await A.pg.click('#dlg-more [data-action="load-sample"]');
await A.pg.click('#dcFoot >> text=Ersetzen'); await A.pg.waitForTimeout(400);
await syncNow(A.pg); await syncNow(B.pg);
ok(cloud.archive.length === 1 && (await pts(B.pg)).length === 14, 'Neu begonnen auf dem iPad: iPhone übernimmt, alte Fassung liegt im Archiv');
for (const v of ['list', 'detail']) {
  if (v === 'list') { if (await B.pg.locator('[data-action="back"]').count()) await B.pg.click('[data-action="back"]'); } else await B.pg.locator('.pt-main').first().click();
  await B.pg.waitForTimeout(300);
  ok(!(await B.pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `iPhone „${v === 'list' ? 'Liste' : 'Thema'}“: kein seitliches Scrollen`);
  await B.pg.screenshot({ path: path.join(OUT, `20-iphone-${v}.png`) });
}
await B.pg.click('[data-action="back"]');
await B.pg.click('[data-action="open-share"]'); await B.pg.waitForTimeout(600);
await B.pg.screenshot({ path: path.join(OUT, '21-iphone-export.png') });
ok(await B.pg.$eval('#dlg-share', (x) => x.getBoundingClientRect().bottom >= window.innerHeight - 2), 'iPhone: Export öffnet als Blatt von unten');
ok(A.errs.length === 0 && B.errs.length === 0, 'Keine Fehler beim Abgleich' + (A.errs.concat(B.errs).length ? ': ' + A.errs.concat(B.errs).join(' | ') : ''));
await A.ctx.close(); await B.ctx.close();

console.log('\n16) Sauberkeit');
ok(external.length === 0, 'Ohne Anmeldung keine Anfragen an fremde Server' + (external.length ? ': ' + external.join(', ') : ''));
ok(errors.length === 0, 'Keine JavaScript-Fehler' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(!/https?:\/\/(?!www\.w3\.org|login\.microsoftonline\.com|graph\.microsoft\.com|\*\.sharepoint\.com)/.test(html), 'index.html spricht nur mit Microsoft 365 (Anmeldung/OneDrive)');

await browser.close();
server.close();
console.log(`\n${passes} bestanden, ${failures} fehlgeschlagen`);
process.exit(failures ? 1 : 0);
