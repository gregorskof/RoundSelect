// Optional browser regression checks. No test libraries ship in the application.
// See README.md for installing the two development-only verification tools.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, createReadStream, writeFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/roundselect/browser');
const artifacts = resolve(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const { chromium } = await import(process.env['ROUNDSELECT_PLAYWRIGHT_MODULE'] || 'playwright');
const require = createRequire(import.meta.url);
const axePath = process.env['ROUNDSELECT_AXE_PATH'] || require.resolve('axe-core/axe.min.js');
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.zip': 'application/zip', '.ts': 'text/plain', '.md': 'text/plain', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/RoundSelect/')) { res.writeHead(404).end(); return; }
  const path = resolve(output, decodeURIComponent(url.pathname.slice('/RoundSelect/'.length)) || 'index.html');
  if (!path.startsWith(`${output}/`) || !existsSync(path)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', contentTypes[extname(path)] || 'application/octet-stream');
  createReadStream(path).pipe(res);
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = `${origin}/RoundSelect/`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env['ROUNDSELECT_BROWSER_PATH'] ? { executablePath: process.env['ROUNDSELECT_BROWSER_PATH'] } : {}),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const checks = [];
const pageErrors = [];
const consoleErrors = [];
const requestFailures = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('requestfailed', request => requestFailures.push({ url: request.url(), reason: request.failure()?.errorText }));
page.setDefaultTimeout(6000);

async function check(name, callback) {
  await callback();
  checks.push(name);
  console.log(`PASS ${name}`);
}
async function select(selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  return page.evaluate(async selector => {
    document.activeElement?.blur();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(selector));
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
    return selection.toString();
  }, selector);
}
async function overlayReady() {
  await page.waitForFunction(() => document.documentElement.classList.contains('rounded-selection-enabled') && !!document.querySelector('.rounded-selection-shape'));
}
async function noOverlay() {
  await page.waitForFunction(() => !document.documentElement.classList.contains('rounded-selection-enabled') && !document.querySelector('.rounded-selection-shape'));
}
async function audit(target, name) {
  await target.addScriptTag({ path: axePath });
  const result = await target.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } }));
  writeFileSync(resolve(artifacts, `${name}-accessibility.json`), JSON.stringify(result.violations, null, 2));
  assert.deepEqual(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), []);
}
function luminance(rgb) {
  const linear = rgb.map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; });
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function ratio(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
function rgb(css) { return css.match(/[\d.]+/g).slice(0, 3).map(Number); }
function mix(color, base) { return color.map((value, index) => .4 * value + .6 * base[index]); }

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  await check('Compiled Angular page, four sections, seven architecture stages', async () => {
    await page.getByRole('heading', { name: 'Native selection. Better geometry.' }).waitFor();
    assert.equal(await page.locator('main > section').count(), 4);
    assert.equal(await page.locator('.stage-flow > li').count(), 7);
    assert.ok(await page.evaluate(() => document.fonts.check('16px "DM Sans"') && document.fonts.check('12px "DM Mono"')));
  });
  await check('All rendered ZIP and individual download URLs return exact files under /RoundSelect/', async () => {
    const links = await page.locator('a[download]').evaluateAll(links => links.map(link => ({ url: link.href, name: link.getAttribute('download') })));
    for (const link of links) {
      assert.ok(link.url.startsWith(`${url}downloads/`));
      const response = await context.request.get(link.url);
      assert.equal(response.status(), 200);
      const name = link.name || new URL(link.url).pathname.split('/').pop();
      assert.deepEqual(await response.body(), readFileSync(resolve(root, 'public/downloads', name)));
    }
    const downloading = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download RoundSelect (.zip)', exact: false }).click();
    const download = await downloading;
    assert.equal(download.suggestedFilename(), 'roundselect.zip');
    await download.saveAs(resolve(artifacts, 'downloaded-roundselect.zip'));
    assert.deepEqual(readFileSync(resolve(artifacts, 'downloaded-roundselect.zip')), readFileSync(resolve(root, 'public/downloads/roundselect.zip')));
  });
  await check('Real mouse drag creates rounded SVG paths while preserving native selection', async () => {
    const paragraph = page.locator('#demo-paragraph');
    await paragraph.scrollIntoViewIfNeeded();
    const box = await paragraph.boundingBox();
    await page.mouse.move(box.x + 3, box.y + 8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .62, box.y + 43, { steps: 20 });
    await page.mouse.up();
    await overlayReady();
    const selection = await page.evaluate(() => document.getSelection().toString());
    assert.ok(selection.length > 35);
    assert.match(await page.locator('.rounded-selection-shape').getAttribute('d'), /Q/);
  });
  await check('Multi-line selection retains original text and DOM structure', async () => {
    const before = await page.locator('#sample-content').innerHTML();
    const text = await select('#sample-content');
    await overlayReady();
    assert.ok(text.length > 300);
    assert.equal(await page.locator('#sample-content').innerHTML(), before);
    assert.equal(await page.evaluate(() => document.getSelection().toString()), text);
    const path = await page.locator('.rounded-selection-shape').getAttribute('d');
    assert.ok((path.match(/Q /g) || []).length >= 12);
  });
  await check('Four colors on both surfaces update an active selection; selected text stays readable', async () => {
    const tones = [['Violet', '#9272ff'], ['Blue', '#5aabff'], ['Mint', '#4ad7ae'], ['Rose', '#f28ca9']];
    for (const mode of ['Light', 'Dark']) {
      await page.getByRole('button', { name: `${mode} preview`, exact: true }).click();
      const selected = await select('#sample-content');
      await overlayReady();
      for (const [name, value] of tones) {
        await page.getByRole('button', { name: `${name} highlight`, exact: true }).click();
        await page.waitForFunction(value => document.querySelector('.rounded-selection-shape')?.style.getPropertyValue('--highlight-color') === value, value);
        assert.equal(await page.evaluate(() => document.getSelection().toString()), selected);
        assert.equal(await page.getByRole('button', { name: `${name} highlight`, exact: true }).getAttribute('aria-pressed'), 'true');
        const colors = await page.locator('#demo-paragraph').evaluate(element => ({ fore: getComputedStyle(element).color, back: getComputedStyle(element.closest('.preview-surface')).backgroundColor }));
        const highlight = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
        assert.ok(ratio(mix(highlight, rgb(colors.fore)), mix(highlight, rgb(colors.back))) >= 4.5, `${mode} ${name} selected text contrast`);
      }
    }
  });
  await check('Nested strong, emphasis, spans, and inline code use the real selection engine', async () => {
    await page.getByRole('button', { name: 'Rich text', exact: true }).click();
    await page.locator('.sample-content code').waitFor();
    const before = await page.locator('#sample-content').innerHTML();
    await select('#sample-content');
    await overlayReady();
    assert.equal(await page.locator('#sample-content').innerHTML(), before);
    assert.equal(await page.locator('#sample-content strong em').count(), 1);
    assert.match(await page.evaluate(() => document.getSelection().toString()), /layer of emphasis/);
  });
  await check('Selected inline code stays readable in all eight color/surface combinations', async () => {
    for (const mode of ['Light', 'Dark']) {
      await page.getByRole('button', { name: `${mode} preview`, exact: true }).click();
      await page.waitForFunction(mode => document.querySelector('.preview-surface').classList.contains('preview-dark') === (mode === 'Dark'), mode);
      await select('#sample-content');
      await overlayReady();
      for (const [name, value] of [['Violet', '#9272ff'], ['Blue', '#5aabff'], ['Mint', '#4ad7ae'], ['Rose', '#f28ca9']]) {
        await page.getByRole('button', { name: `${name} highlight`, exact: true }).click();
        await page.waitForFunction(value => document.querySelector('.rounded-selection-shape')?.style.getPropertyValue('--highlight-color') === value, value);
        const colors = await page.locator('.sample-content code').evaluate(element => ({ fore: getComputedStyle(element).color, back: getComputedStyle(element).backgroundColor }));
        const highlight = [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16));
        assert.ok(ratio(mix(highlight, rgb(colors.fore)), mix(highlight, rgb(colors.back))) >= 4.5, `${mode} ${name} inline code contrast`);
      }
    }
  });
  await check('Shift + arrow extends a native selection and redraws the overlay', async () => {
    await select('#demo-paragraph');
    await overlayReady();
    const before = await page.evaluate(() => document.getSelection().toString());
    await page.keyboard.press('Shift+ArrowRight');
    await overlayReady();
    assert.notEqual(await page.evaluate(() => document.getSelection().toString()), before);
  });
  await check('Native Ctrl+C preserves selected text on the clipboard', async () => {
    const text = await select('#demo-paragraph');
    await page.keyboard.press('Control+c');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), text);
  });
  await check('Angular insertion and removal keep active selections valid', async () => {
    const text = await select('#sample-content');
    await overlayReady();
    await page.getByRole('button', { name: 'Insert dynamic text', exact: false }).click();
    await page.locator('#dynamic-text').waitFor();
    assert.equal(await page.evaluate(() => document.getSelection().toString()), text);
    await select('#dynamic-text');
    await overlayReady();
    assert.match(await page.evaluate(() => document.getSelection().toString()), /inserted by Angular/);
    await page.getByRole('button', { name: 'Remove dynamic text', exact: false }).click();
    await noOverlay();
  });
  await check('Scroll and resize remeasure native text geometry', async () => {
    await select('#sample-content');
    await overlayReady();
    const before = await page.locator('.rounded-selection-shape').getAttribute('d');
    await page.evaluate(() => window.scrollBy(0, 60));
    await page.waitForFunction(before => document.querySelector('.rounded-selection-shape')?.getAttribute('d') !== before, before);
    const afterScroll = await page.locator('.rounded-selection-shape').getAttribute('d');
    await page.setViewportSize({ width: 1000, height: 1000 });
    await page.waitForFunction(previous => document.querySelector('.rounded-selection-shape')?.getAttribute('d') !== previous, afterScroll);
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('Inputs, textarea, and nested contenteditable retain native highlighting', async () => {
    await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.id = 'fallback-fixture';
      fixture.innerHTML = '<input aria-label="Test input" value="Native input selection"><textarea aria-label="Test textarea">Native textarea selection</textarea><div contenteditable="true" aria-label="Test editor">Native <strong>editable text</strong></div>';
      document.querySelector('app-root').append(fixture);
    });
    for (const name of ['Test input', 'Test textarea']) {
      const control = page.getByRole(name === 'Test input' ? 'textbox' : 'textbox', { name, exact: true });
      await control.focus();
      await page.keyboard.press('Control+a');
      await noOverlay();
    }
    const editor = page.locator('[contenteditable="true"]');
    await editor.focus();
    await page.keyboard.press('Control+a');
    await noOverlay();
    await page.evaluate(() => document.querySelector('#fallback-fixture').remove());
  });
  await check('Oversized selections fall back without hiding the native selection', async () => {
    await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.id = 'large-fixture';
      fixture.style.cssText = 'font-size:12px;line-height:14px';
      for (let index = 0; index < 300; index++) {
        const line = document.createElement('div');
        line.textContent = `Selected fragment ${index}`;
        fixture.append(line);
      }
      document.querySelector('app-root').append(fixture);
    });
    const text = await select('#large-fixture');
    await noOverlay();
    assert.ok(text.length > 5000);
    assert.equal(await page.evaluate(() => document.getSelection().toString()), text);
    await page.evaluate(() => document.querySelector('#large-fixture').remove());
  });
  await check('Forced-colors mode restores native highlighting; returning restores SVG', async () => {
    await select('#demo-paragraph');
    await overlayReady();
    await page.emulateMedia({ forcedColors: 'active' });
    await noOverlay();
    assert.ok(await page.evaluate(() => document.getSelection().toString().length > 0));
    await page.emulateMedia({ forcedColors: 'none' });
    await overlayReady();
  });
  await check('Copy buttons copy the exact installation examples', async () => {
    await page.getByRole('button', { name: 'Copy stylesheet example', exact: true }).click();
    await page.getByRole('button', { name: 'Stylesheet example copied', exact: true }).waitFor();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /@import '\.\/rounded-selection.css';/);
    await page.getByRole('button', { name: 'Copy component example', exact: true }).click();
    await page.getByRole('button', { name: 'Component example copied', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), readFileSync(resolve(root, 'examples/app.example.ts'), 'utf8'));
  });
  await check('Desktop and rich dark preview pass axe WCAG checks', async () => {
    await page.evaluate(() => document.getSelection().removeAllRanges());
    await noOverlay();
    await audit(page, 'desktop-dark');
    await page.getByRole('button', { name: 'Light preview', exact: true }).click();
    await audit(page, 'desktop-light');
  });
  await check('Reduced motion disables entrances, transitions, and smooth scrolling', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const motion = await page.evaluate(() => ({ scroll: getComputedStyle(document.documentElement).scrollBehavior, animation: getComputedStyle(document.querySelector('.hero-copy')).animationName, transition: getComputedStyle(document.querySelector('.button')).transitionDuration }));
    assert.deepEqual(motion, { scroll: 'auto', animation: 'none', transition: '0s' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await check('Keyboard skip link, navigation, preview, palette, and copy controls are reachable', async () => {
    await page.goto(url);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Skip to content');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
    const reached = [];
    for (let index = 0; index < 40; index++) {
      await page.keyboard.press('Tab');
      reached.push(await page.evaluate(() => document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim()));
    }
    assert.ok(reached.includes('Violet highlight'));
    assert.ok(reached.includes('Dark preview'));
    assert.ok(reached.includes('Selectable live demo'));
    assert.ok(reached.includes('Copy component example'));
    await page.getByRole('button', { name: 'Dark preview', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('[aria-label="Dark preview"]').getAttribute('aria-pressed') === 'true');
    assert.equal(await page.getByRole('button', { name: 'Dark preview', exact: true }).getAttribute('aria-pressed'), 'true');
  });
  await check('No page-level horizontal overflow at desktop, tablet, phone, and zoom-equivalent widths', async () => {
    for (const width of [1440, 1280, 1024, 768, 720, 600, 390, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const result = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
      assert.ok(result.page <= result.viewport && result.body <= result.viewport, `${width}px: ${JSON.stringify(result)}`);
    }
  });
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const mobilePage = await mobile.newPage();
  await check('Touch emulation uses native selection and exposes the native touch instructions', async () => {
    await mobilePage.goto(url, { waitUntil: 'networkidle' });
    assert.ok(await mobilePage.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches));
    assert.ok(await mobilePage.locator('.touch-help').isVisible());
    await mobilePage.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(document.querySelector('#demo-paragraph'));
      document.getSelection().removeAllRanges();
      document.getSelection().addRange(range);
    });
    await mobilePage.waitForFunction(() => !document.documentElement.classList.contains('rounded-selection-enabled') && !document.querySelector('.rounded-selection-shape'));
    assert.ok(await mobilePage.evaluate(() => document.getSelection().toString().length > 100));
    await mobilePage.evaluate(() => document.getSelection().removeAllRanges());
    for (const width of [320, 360, 390, 600, 768]) {
      await mobilePage.setViewportSize({ width, height: 844 });
      const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `Touch layout overflows at ${width}px.`);
    }
    await mobilePage.setViewportSize({ width: 390, height: 844 });
    await audit(mobilePage, 'mobile');
    await mobilePage.screenshot({ path: resolve(artifacts, 'mobile-preview.png') });
    await mobilePage.screenshot({ path: resolve(artifacts, 'mobile.png'), fullPage: true });
  });
  await check('No uncaught Angular/browser errors or failed local assets', async () => {
    assert.deepEqual(pageErrors, []);
    const localFailures = requestFailures.filter(item => item.url.startsWith(origin));
    assert.deepEqual(localFailures, []);
    assert.deepEqual(consoleErrors, []);
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.screenshot({ path: resolve(artifacts, 'preview.png') });
  await page.screenshot({ path: resolve(artifacts, 'desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'Rich text', exact: true }).click();
  await page.locator('.sample-content code').waitFor();
  await page.getByRole('button', { name: 'Dark preview', exact: true }).click();
  await select('#sample-content');
  await overlayReady();
  await page.locator('.playground').screenshot({ path: resolve(artifacts, 'dark-selection.png') });
  writeFileSync(resolve(artifacts, 'browser-report.json'), JSON.stringify({ passed: checks, pageErrors, consoleErrors, requestFailures, limitations: ['Chromium touch emulation does not verify physical iOS/Android selection handles.', 'Production deployment and live download checks require publishing the changes to main.'] }, null, 2));
  console.log(`Completed ${checks.length} browser checks.`);
} finally {
  await browser.close();
  await new Promise(done => server.close(done));
}
