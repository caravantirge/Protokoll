// Automatischer Test der App mit Chromium (iPad-Maße, Touch).
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
const shot = async (name) => { await page.waitForTimeout(450); return page.screenshot({ path: path.join(OUT, name + '.png') }); };
const focusIs = (n) => page.waitForFunction((n) => { const e = document.querySelector('.fp-main'); return e && e.textContent.includes('Punkt ' + n + ' '); }, n, { timeout: 4000 }).then(() => true, () => false);
async function swipe(dx, { steps = 6, ms = 60, y = 520, x0 = 420 } = {}) {
  // Wisch-Geste mit Pointer-Events (Touch) auf der linken Fokus-Spalte
  await page.evaluate(async ({ dx, steps, ms, y, x0 }) => {
    const el = document.elementFromPoint(x0, y);
    const opt = (x) => ({ bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0 });
    el.dispatchEvent(new PointerEvent('pointerdown', opt(x0)));
    for (let i = 1; i <= steps; i++) { await new Promise((r) => setTimeout(r, ms / steps)); el.dispatchEvent(new PointerEvent('pointermove', opt(x0 + (dx * i) / steps))); }
    el.dispatchEvent(new PointerEvent('pointerup', opt(x0 + dx)));
  }, { dx, steps, ms, y, x0 });
}

console.log('\n1) Parser');
await page.goto(BASE);
const parse = (t) => page.evaluate((t) => window.__app.parseList(t, { autoKat: true, herkunft: 'Werkstatt' }), t);
let r = await parse(fs.readFileSync(path.join(FIX, 'liste-varianten.txt'), 'utf8'));
ok(r.items.length === 6, `Varianten-Liste: 6 Punkte erkannt (ist ${r.items.length})`);
ok(r.items[0].offen === 'Wer vertritt im Urlaub?' && r.items[0].loesung.startsWith('Feste Zuständigkeit'), 'Inline „Offen:“ wird abgetrennt');
ok(r.items[1].kritik.includes('zweite Zeile'), 'Mehrzeilige Kritik bleibt zusammen');
ok(r.items[2].urspNr === 3 && r.items[2].kritik.startsWith('Nummer auf eigener Zeile'), 'Nummer auf eigener Zeile');
ok(r.items[3].loesung.includes('1. Schritt') && r.items[3].loesung.includes('2. Schritt'), 'Nummerierte Unterpunkte in der Lösung bleiben in der Lösung');
ok(r.items[4].kategorie === 'Personal und Ausbildung' && r.items[4].herkunft === 'Geschäftsführung' && r.items[4].prioritaet === 'hoch', 'Optionale Zeilen Kategorie/Herkunft/Priorität');
ok(r.items[5].kritik.startsWith('Fett formatiert') && r.items[5].loesung === 'Markdown-Sternchen werden entfernt.', 'Markdown-Fettdruck & „Loesung“ ohne Umlaut');
ok(r.items[3].offen === '', 'Kleingeschriebenes „offen:“ im Fließtext wird nicht abgetrennt');
r = await parse('Einleitung zur Liste\n\n1. Kritik: A\nLösung: B\n3. Kritik: C\nLösung: D');
ok(r.items.length === 2 && r.warnings.some((w) => w.includes('2 fehlt')) && r.warnings.some((w) => w.includes('ignoriert')), 'Warnung bei fehlender Nummer und Einleitungstext');
r = await parse('1. Teile kommen zu spät\nLösung: Früher bestellen\n2. Keine Doku\nLösung: Fotos');
ok(r.items.length === 2 && r.items[0].kritik === 'Teile kommen zu spät', 'Liste ohne „Kritik:“-Label');

console.log('\n2) Startbildschirm & Import über die Oberfläche (1180×820)');
await shot('01-leer-quer');
await page.click('[data-action="open-more"]');
await page.click('#dlg-more [data-action="open-import"]');
await page.fill('#importText', fs.readFileSync(path.join(FIX, 'beispiel-liste.txt'), 'utf8'));
await page.waitForTimeout(400);
const n = await page.locator('.imp-row').count();
ok(n === 14, `Vorschau zeigt 14 Punkte (ist ${n})`);
ok(await page.locator('#impPreview .offen-box').count() === 4, 'Vorschau hebt 4 „Offen“-Texte hervor');
await page.selectOption('[data-imp="13"][data-key="kategorie"]', 'Sonstiges');
await shot('02-import-vorschau');
await page.click('#impApply');
await page.waitForTimeout(300);
ok(await page.locator('.point-card').count() === 14, '14 Zeilen in der Übersicht');
const kats = await page.evaluate(() => window.__app.data.punkte.map((p) => p.kategorie));
console.log('    Kategorien:', kats.join(' | '));
ok(kats[13] === 'Sonstiges', 'Manuell geänderte Kategorie übernommen');
ok(kats[0] === 'Teile und Garantie' && kats[10] === 'Neuwagenannahme' && kats[6] === 'Personal und Ausbildung', 'Automatische Kategorien plausibel');

console.log('\n3) Kopfdaten, Timer, Fokus-Modus');
await page.click('[data-action="open-meeting"]');
await page.fill('[data-mfield="titel"]', 'Test-Runde Werkstatt');
await page.fill('[data-mfield="datum"]', '2026-10-26');
await page.fill('[data-mfield="ort"]', 'Testlokal');
await page.fill('[data-mfield="teilnehmer"]', 'Anna Beispiel, Ben Muster, Carla Probe');
await page.fill('[data-mfield="protokoll"]', 'Daniel Demo');
await page.fill('[data-mfield="dauerGeplant"]', '120');
await page.click('#dlg-meeting [data-action="close-dialog"]');
await page.click('#timerChip');
await page.waitForTimeout(200);
ok(await page.evaluate(() => !!window.__app.data.meeting.laeuftSeit), 'Timer gestartet');
await page.locator('.pt-main').first().click();
ok(await page.locator('#v-focus .kritik-text').isVisible(), 'Fokus-Modus zeigt Punkt groß');
ok(await page.locator('#v-focus .offen-box').isVisible(), '„Offen“ im Fokus hervorgehoben');
await page.fill('[data-field="notizen"]', 'Notiz eins\nZweite Zeile mit Umlauten äöü ß');
await page.fill('[data-field="beschluss"]', '- Teiledienst übernimmt Garantieanträge; "wöchentlich" prüfen');
ok(await page.locator('#gapHints .hint').count() >= 2, 'Hinweise: Verantwortlich & Frist fehlen');
await page.click('#ownerChips >> text=Carla Probe');
await page.click('#fristChips >> text=+2 Wochen');
await page.click('.seg-status [data-value="besprochen"]');
await page.click('.seg-prio [data-value="hoch"]');
ok(await page.locator('#gapHints .hint').count() === 0, 'Hinweise verschwinden nach Eingabe');
const h1 = await page.$eval('[data-field="notizen"]', (e) => e.offsetHeight);
await page.fill('[data-field="notizen"]', Array(14).fill('Lange Notiz Zeile').join('\n'));
const h2 = await page.$eval('[data-field="notizen"]', (e) => e.offsetHeight);
ok(h2 > h1 + 100, `Textfeld wächst mit (${h1}px → ${h2}px)`);
await page.fill('[data-field="notizen"]', 'Notiz eins\nZweite Zeile mit Umlauten äöü ß');
await page.waitForTimeout(500);
ok((await page.textContent('#saveState')).includes('Gespeichert'), 'Anzeige „Gespeichert“');
await shot('03-fokus-quer');
await page.click('#btnNext');
ok(await focusIs(2), '„Weiter“ wechselt (animiert) zu Punkt 2');
await page.click('[data-action="step"][data-dir="-1"]');
ok(await focusIs(1), '„Zurück“ wechselt zu Punkt 1');
await page.waitForTimeout(500);
await swipe(-260);
ok(await focusIs(2), 'Wischen nach links → nächster Punkt');
await page.waitForTimeout(600);
await swipe(30, { ms: 400 });
await page.waitForTimeout(700);
ok(await focusIs(2) && await page.evaluate(() => !document.querySelector('.focus-grid').style.transform), 'Kurzes, langsames Ziehen federt zurück');
await swipe(240);
ok(await focusIs(1), 'Wischen nach rechts → vorheriger Punkt');
await page.waitForTimeout(600);
await swipe(200, { ms: 300 });
await page.waitForTimeout(800);
ok(await focusIs(1), 'Am ersten Punkt: Gummiband statt Wechsel');
// Neuer Punkt mitten im Gespräch
await page.click('[data-action="add-point"]');
ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'f-kritik'), 'Neuer Punkt: Cursor direkt im Feld „Kritik“');
await page.keyboard.type('Spontan: Kaffeemaschine in der Werkstatt defekt');
await page.click('[data-action="toggle-edit"]');
ok((await page.textContent('#v-focus .eyebrow')).includes('Im Gespräch ergänzt'), 'Neuer Punkt als „im Gespräch ergänzt“ markiert');
ok(await page.locator('.back-chip').isVisible(), '„Zurück zu Punkt 1“ angeboten');
await page.click('.back-chip');
ok(await focusIs(1), 'Rücksprung zu Punkt 1');

console.log('\n4) Reihenfolge, Filter');
await page.click('[data-view="overview"]');
await page.click('[data-action="toggle-reorder"]');
const firstBefore = await page.evaluate(() => window.__app.data.punkte[1].id);
await page.locator('.point-card').nth(1).locator('[data-dir="-1"]').click();
await page.waitForTimeout(500);
const firstAfter = await page.evaluate(() => window.__app.data.punkte[0].id);
ok(firstBefore === firstAfter, 'Punkt 2 per „Hoch“ an Position 1 verschoben');
await page.locator('.point-card').nth(0).locator('[data-dir="1"]').click();
ok(await page.evaluate((id) => window.__app.data.punkte[1].id === id, firstBefore), 'und per „Runter“ zurück');
await page.click('[data-action="toggle-reorder"]');
await page.click('[data-action="filter-status"][data-value="besprochen"]');
ok(await page.locator('.point-card').count() === 1, 'Statusfilter „Besprochen“ zeigt 1 Karte');
await page.click('[data-action="filter-status"][data-value="alle"]');
await page.selectOption('#fKat', 'Neuwagenannahme');
ok(await page.locator('.point-card').count() === 2, 'Kategoriefilter „Neuwagenannahme“ zeigt 2 Karten');
await page.selectOption('#fKat', 'alle');
const prog = await page.textContent('#progressText');
ok(prog.startsWith('1 von 15 besprochen'), `Fortschritt „${prog.trim()}“`);
await shot('04-uebersicht-quer');

console.log('\n5) Autosave nach Neuladen');
await page.waitForTimeout(500);
await page.reload();
await page.waitForTimeout(300);
const after = await page.evaluate(() => window.__app.data);
ok(after.punkte.length === 15 && after.punkte[0].notizen.includes('äöü') && after.punkte[0].verantwortlich === 'Carla Probe' && after.punkte[0].frist === '2026-11-09', 'Alle Eingaben nach Neuladen vorhanden');
ok(after.meeting.titel === 'Test-Runde Werkstatt', 'Kopfdaten nach Neuladen vorhanden');

console.log('\n6) Abschluss');
await page.click('[data-view="summary"]');
ok(await page.locator('.gap-row').count() >= 2, 'Lücken-Check listet offene Punkte / fehlenden Folgetermin');
await page.click('[data-action="set-next"] >> nth=1');
await page.click('[data-action="readback"]');
await page.click('[data-action="rb-confirm"] >> nth=0');
ok((await page.textContent('#rbCount')).startsWith('1 von'), 'Vorlese-Modus: Bestätigung zählt');
await shot('05-vorlesen');
await page.click('#dlg-readback [data-action="close-dialog"]');
await shot('06-abschluss-quer');

console.log('\n7) Exporte');
const text = await page.evaluate(() => window.__app.buildText());
await page.click('[data-action="open-share"]');
ok(text.indexOf('MASSNAHMEN') < text.indexOf('DETAILS'), 'E-Mail-Text: Maßnahmen stehen vor den Details');
ok(text.includes('Carla Probe: - Teiledienst übernimmt'), 'E-Mail-Text enthält Wer/Was');
await shot('07-teilen-quer');
let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-share [data-action="csv"]')]);
const csv = fs.readFileSync(await dl.path());
fs.writeFileSync(path.join(OUT, dl.suggestedFilename()), csv);
ok(csv[0] === 0xef && csv[1] === 0xbb && csv[2] === 0xbf, 'CSV beginnt mit UTF-8-BOM');
const csvText = csv.toString('utf8');
ok(csvText.includes('\r\n') && csvText.split('\r\n')[0].includes(';Verantwortlich;'), 'CSV: Semikolon + CRLF');
ok(csvText.includes(`"'- Teiledienst übernimmt Garantieanträge; ""wöchentlich"" prüfen"`), 'CSV: Anführungszeichen/Semikolon maskiert, Formel-Schutz für „-“');
ok(csvText.includes('09.11.2026'), 'CSV: deutsches Datumsformat');
[dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlg-share [data-action="backup-save"]')]);
const backupPath = path.join(OUT, 'backup-test.json');
fs.copyFileSync(await dl.path(), backupPath);
const bj = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
ok(bj.punkte.length === 15 && bj.meeting.titel === 'Test-Runde Werkstatt' && bj.app === 'besprechungsprotokoll', 'JSON-Backup vollständig');
ok(await page.evaluate(() => !!window.__app.data.meta.letztesBackup), 'Zeitpunkt des letzten Backups vermerkt');

console.log('\n8) Druck (A4-PDF)');
for (const kind of ['protokoll', 'massnahmen', 'aushang']) {
  await page.evaluate((k) => { window.print = () => {}; document.querySelector(`[data-action="print"][data-kind="${k}"]`).click(); }, kind);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(OUT, `druck-${kind}.pdf`), format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  ok(fs.statSync(path.join(OUT, `druck-${kind}.pdf`)).size > 5000, `PDF ${kind} erzeugt`);
}

console.log('\n9) Alles löschen & JSON-Import');
await page.click('[data-action="open-more"]');
await shot('08-mehr-quer');
await page.click('#dlg-more [data-action="reset-all"]');
await page.click('#dcFoot >> text=Alles löschen');
await page.waitForTimeout(200);
ok(await page.evaluate(() => window.__app.data.punkte.length === 0), 'Daten gelöscht');
await page.click('[data-action="open-share"]');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#dlg-share [data-action="backup-load"]')]);
await chooser.setFiles(backupPath);
await page.click('#dcFoot >> text=Daten ersetzen');
await page.waitForTimeout(300);
const restored = await page.evaluate(() => window.__app.data);
ok(restored.punkte.length === 15 && restored.punkte[0].verantwortlich === 'Carla Probe', 'Backup wiederhergestellt');
await page.reload();
ok(await page.evaluate(() => window.__app.data.punkte.length === 15), 'Wiederhergestellte Daten überstehen Neuladen');
await page.click('[data-action="open-more"]');
ok(await page.locator('#dlg-more .snap-row').count() >= 1, 'Wiederherstellungspunkte vorhanden');
await page.keyboard.press('Escape');

console.log('\n10) Hochformat 820×1180 & Dunkelmodus');
await page.setViewportSize({ width: 820, height: 1180 });
for (const v of ['overview', 'focus', 'summary']) {
  await page.click(`[data-view="${v}"]`);
  await page.waitForTimeout(150);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, `Hochformat „${v}“: kein seitliches Scrollen`);
  await shot(`10-hoch-${v}`);
}
await page.emulateMedia({ colorScheme: 'dark' });
await page.click('[data-view="focus"]');
await shot('11-hoch-fokus-dunkel');
await page.setViewportSize({ width: 1180, height: 820 });
for (const v of ['overview', 'focus', 'summary']) {
  await page.click(`[data-view="${v}"]`);
  await page.waitForTimeout(100);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, `Querformat „${v}“: kein seitliches Scrollen`);
}
await page.click('[data-view="overview"]');
await shot('12-quer-uebersicht-dunkel');
await page.emulateMedia({ colorScheme: 'light' });
await page.click('[data-action="open-more"]');
await page.click('#dlg-more [data-action="open-help"]');
await shot('13-leitfaden');
await page.keyboard.press('Escape');

console.log('\n11) Offline (Service Worker)');
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 }).catch(() => {});
ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'Service Worker aktiv');
await context.setOffline(true);
await page.reload();
ok(await page.locator('.point-card').count() === 15, 'App lädt offline inkl. Daten');
await context.setOffline(false);

console.log('\n12) Bewegung & Fenster');
await page.click('[data-view="overview"]');
await page.click('[data-action="open-share"]');
const origin = await page.$eval('#dlg-share', (d) => d.style.transformOrigin);
ok(/px/.test(origin), 'Teilen-Popover wächst aus dem Teilen-Symbol (' + origin + ')');
await page.mouse.click(40, 700);
await page.waitForTimeout(500);
ok(await page.$eval('#dlg-share', (d) => !d.open), 'Tippen daneben schließt das Popover');
await page.click('[data-action="open-meeting"]');
await page.waitForTimeout(600);
const head = await page.$('#dlg-meeting .dlg-head h2'); const hb = await head.boundingBox();
await page.evaluate(async ({ x, y }) => {
  const el = document.querySelector('#dlg-meeting .dlg-head');
  const o = (yy) => ({ bubbles: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: x, clientY: yy, button: 0 });
  el.dispatchEvent(new PointerEvent('pointerdown', o(y)));
  for (let i = 1; i <= 5; i++) { await new Promise((r) => setTimeout(r, 12)); el.dispatchEvent(new PointerEvent('pointermove', o(y + i * 40))); }
  el.dispatchEvent(new PointerEvent('pointerup', o(y + 200)));
}, { x: hb.x + 5, y: hb.y + 5 });
await page.waitForTimeout(700);
ok(await page.$eval('#dlg-meeting', (d) => !d.open), 'Kopfdaten-Blatt lässt sich nach unten wegziehen');
const thumb = await page.$eval('#topbar .seg-thumb', (t) => t.getBoundingClientRect().width);
ok(thumb > 50, 'Segment-Markierung vorhanden');

console.log('\n13) Bewegung reduzieren');
const rm = await browser.newContext({ viewport: { width: 1180, height: 820 }, reducedMotion: 'reduce', hasTouch: true, userAgent: IPAD_UA, locale: 'de-DE' });
const p2 = await rm.newPage();
const err2 = []; p2.on('pageerror', (e) => err2.push(e.message));
await p2.goto(BASE);
await p2.click('[data-action="load-sample"]');
await p2.click('.pt-main >> nth=0');
await p2.click('#btnNext');
ok((await p2.textContent('.fp-main')).includes('Punkt 2'), 'Ohne Animation: Wechsel sofort');
await p2.click('[data-action="open-more"]');
await p2.click('#dlg-more [data-action="open-help"]');
await p2.click('#dlg-help [data-action="close-dialog"]');
await p2.waitForTimeout(400);
ok(await p2.$eval('#dlg-help', (d) => !d.open) && err2.length === 0, 'Fenster öffnen/schließen ohne Fehler');
await rm.close();

console.log('\n14) Abgleich iPad ↔ iPhone (OneDrive simuliert)');
const cloud = { file: null, etag: 0, archive: [], puts: 0 };
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
      cloud.file = req.postData(); cloud.etag++; cloud.puts++;
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
const pts = (pg) => pg.evaluate(() => window.__app.data.punkte.map((p) => ({ id: p.id, n: p.notizen, b: p.beschluss })));
const syncNow = (pg) => pg.evaluate(() => window.__app.syncNow()).then(() => pg.waitForFunction(() => window.__app.syncState.s === 'ok', null, { timeout: 5000 }));

const A = await device('ipad', { width: 1180, height: 820 });
await A.pg.click('[data-action="load-sample"]');
ok(await connect(A.pg), 'iPad: mit Microsoft angemeldet und abgeglichen');
ok(!!cloud.file && JSON.parse(cloud.file).punkte.length === 15, 'iPad hat die Besprechung in OneDrive abgelegt');
ok((await A.pg.textContent('#saveState')).includes('Synchronisiert'), 'Anzeige „Synchronisiert“');

const B = await device('iphone', { width: 390, height: 844 });
ok(await connect(B.pg), 'iPhone: angemeldet');
ok((await pts(B.pg)).length === 15, 'iPhone zeigt dieselben 15 Punkte');
await B.pg.screenshot({ path: path.join(OUT, '31-iphone-uebersicht-sync.png') });

// Änderung auf dem iPhone → erscheint auf dem iPad
await B.pg.click('.pt-main >> nth=1');
await B.pg.fill('[data-field="notizen"]', 'Notiz vom iPhone');
await B.pg.waitForTimeout(400);
await syncNow(B.pg);
await syncNow(A.pg);
ok((await pts(A.pg))[1].n === 'Notiz vom iPhone', 'Notiz vom iPhone erscheint auf dem iPad');

// Gleichzeitig an verschiedenen Punkten → beides bleibt erhalten
await A.pg.locator('[data-view="overview"]:visible').click();
await A.pg.click('.pt-main >> nth=2');
await A.pg.fill('[data-field="beschluss"]', 'Beschluss vom iPad');
await B.pg.locator('[data-view="overview"]:visible').click();
await B.pg.click('.pt-main >> nth=3');
await B.pg.fill('[data-field="notizen"]', 'Gleichzeitig vom iPhone');
await A.pg.waitForTimeout(400); await B.pg.waitForTimeout(400);
await syncNow(A.pg); await syncNow(B.pg); await syncNow(A.pg);
const pa = await pts(A.pg), pb = await pts(B.pg);
ok(pa[2].b === 'Beschluss vom iPad' && pa[3].n === 'Gleichzeitig vom iPhone' && pb[2].b === 'Beschluss vom iPad' && pb[3].n === 'Gleichzeitig vom iPhone', 'Gleichzeitige Änderungen an verschiedenen Punkten werden zusammengeführt');

// Löschen auf dem iPad → auch auf dem iPhone weg (und kommt nicht wieder)
const delId = pa[4].id;
await A.pg.locator('[data-view="overview"]:visible').click(); await A.pg.click('.pt-main >> nth=4');
await A.pg.click('[data-action="toggle-edit"]'); await A.pg.click('[data-action="delete-point"]');
await A.pg.waitForTimeout(400); await syncNow(A.pg); await syncNow(B.pg); await syncNow(A.pg);
ok(!(await pts(B.pg)).some((p) => p.id === delId) && !(await pts(A.pg)).some((p) => p.id === delId), 'Gelöschter Punkt verschwindet auf beiden Geräten');

// Offline auf dem iPhone weiterschreiben → später abgleichen
await B.ctx.setOffline(true);
await B.pg.evaluate(() => window.dispatchEvent(new Event('offline')));
await B.pg.locator('[data-view="overview"]:visible').click(); await B.pg.click('.pt-main >> nth=0');
await B.pg.fill('[data-field="notizen"]', 'Offline im Restaurant geschrieben');
await B.pg.waitForTimeout(500);
ok((await B.pg.textContent('#saveState')).includes('Offline'), 'iPhone zeigt „Offline“ und speichert lokal');
await B.ctx.setOffline(false);
await B.pg.evaluate(() => window.dispatchEvent(new Event('online')));
await B.pg.waitForFunction(() => window.__app.syncState.s === 'ok', null, { timeout: 6000 }).catch(() => {});
await syncNow(A.pg);
ok((await pts(A.pg))[0].n === 'Offline im Restaurant geschrieben', 'Offline-Notiz kommt nach Verbindung aufs iPad');

// Neue Besprechung auf dem iPad → iPhone übernimmt, alte Fassung wird archiviert
await A.pg.click('[data-action="open-more"]'); await A.pg.click('#dlg-more [data-action="new-meeting"]');
await A.pg.click('#dcFoot >> text=Anlegen'); await A.pg.waitForTimeout(400);
await syncNow(A.pg); await syncNow(B.pg);
ok(cloud.archive.length === 1 && (await B.pg.evaluate(() => window.__app.data.meeting.titel)).includes('Nachverfolgung'), 'Folgebesprechung: iPhone übernimmt, alte Fassung liegt im Archiv');

// iPhone-Darstellung
for (const v of ['overview', 'focus', 'summary']) {
  await B.pg.click(`.tabbar [data-view="${v}"]`); await B.pg.waitForTimeout(250);
  ok(!(await B.pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `iPhone „${v}“: kein seitliches Scrollen`);
  await B.pg.screenshot({ path: path.join(OUT, `32-iphone-${v}.png`) });
}
await B.pg.click('[data-action="open-share"]'); await B.pg.waitForTimeout(600);
await B.pg.screenshot({ path: path.join(OUT, '33-iphone-teilen.png') });
ok(await B.pg.$eval('#dlg-share', (d) => d.getBoundingClientRect().bottom >= window.innerHeight - 2), 'iPhone: „Teilen“ öffnet als Blatt von unten');
ok(A.errs.length === 0 && B.errs.length === 0, 'Keine Fehler beim Abgleich' + (A.errs.concat(B.errs).length ? ': ' + A.errs.concat(B.errs).join(' | ') : ''));
await A.ctx.close(); await B.ctx.close();

console.log('\n15) Sauberkeit');
ok(external.length === 0, 'Keine Anfragen an fremde Server' + (external.length ? ': ' + external.join(', ') : ''));
ok(errors.length === 0, 'Keine JavaScript-Fehler' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(!/https?:\/\/(?!www\.w3\.org|login\.microsoftonline\.com|graph\.microsoft\.com|\*\.sharepoint\.com)/.test(html), 'index.html spricht nur mit Microsoft 365 (Anmeldung/OneDrive)');

await browser.close();
server.close();
console.log(`\n${passes} bestanden, ${failures} fehlgeschlagen`);
process.exit(failures ? 1 : 0);
