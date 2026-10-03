// Verify the compiled Pages artifact and every downloadable file, including ZIP CRCs.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist/roundselect/browser');
const html = readFileSync(resolve(output, 'index.html'), 'utf8');
assert.match(html, /<base href="\/RoundSelect\/">/, 'Pages must use /RoundSelect/.');
const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(match => match[1]);
const compiled = assets.filter(asset => !/^(https?:|data:|\/)/.test(asset));
assert.ok(compiled.some(asset => /main-.*\.js$/.test(asset)), 'Compiled Angular bundle missing.');
for (const asset of compiled) assert.ok(existsSync(resolve(output, asset)), `Missing built asset: ${asset}`);
for (const family of ['dm-sans-latin', 'dm-mono-latin']) {
  const font = readdirSync(resolve(output, 'media')).find(name => name.startsWith(family) && name.endsWith('.woff2'));
  assert.ok(font, `${family} is missing from the built fonts.`);
  const contents = readFileSync(resolve(output, 'media', font));
  assert.equal(contents.subarray(0, 4).toString(), 'wOF2', `${font} is not a valid WOFF2 file.`);
  assert.deepEqual(contents, readFileSync(resolve(root, 'public/fonts', `${family}.woff2`)));
}

const sources = new Map([
  ['rounded-selection.directive.ts', 'src/app/directives/rounded-selection.directive.ts'],
  ['rounded-selection.css', 'src/roundselect.css'],
  ['app.example.ts', 'examples/app.example.ts'],
  ['README.md', 'distribution/README.md'],
]);
for (const [name, source] of sources) {
  assert.deepEqual(readFileSync(resolve(output, 'downloads', name)), readFileSync(resolve(root, source)), `${name} differs from its source.`);
}

const zip = readFileSync(resolve(output, 'downloads/roundselect.zip'));
assert.deepEqual(zip, readFileSync(resolve(root, 'public/downloads/roundselect.zip')));
const end = zip.length - 22;
assert.equal(zip.readUInt32LE(end), 0x06054b50);
assert.equal(zip.readUInt16LE(end + 10), 4);
let position = zip.readUInt32LE(end + 16);
const names = [];
for (let index = 0; index < 4; index++) {
  assert.equal(zip.readUInt32LE(position), 0x02014b50);
  const nameLength = zip.readUInt16LE(position + 28);
  const name = zip.subarray(position + 46, position + 46 + nameLength).toString('utf8');
  const local = zip.readUInt32LE(position + 42);
  assert.equal(zip.readUInt32LE(local), 0x04034b50);
  const size = zip.readUInt32LE(position + 20);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  assert.equal(zip.readUInt16LE(position + 10), 8);
  const contents = inflateRawSync(zip.subarray(start, start + size));
  const source = sources.get(name.replace(/^roundselect\//, ''));
  assert.ok(source, `Unexpected ZIP entry: ${name}`);
  assert.deepEqual(contents, readFileSync(resolve(root, source)));
  let crc = 0xffffffff;
  for (const byte of contents) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  }
  assert.equal((crc ^ 0xffffffff) >>> 0, zip.readUInt32LE(position + 16), `Invalid CRC: ${name}`);
  names.push(name);
  position += 46 + nameLength + zip.readUInt16LE(position + 30) + zip.readUInt16LE(position + 32);
}
assert.deepEqual(names, [...sources.keys()].map(name => `roundselect/${name}`));
console.log('Pages artifact verified: /RoundSelect/, compiled assets, four exact source downloads, and four ZIP entries with valid CRCs.');
