// Generate the website's downloadable files from the authoritative project source.
// ZIP (uncompressed) is generated with built-in Node.js APIs: no extra dependencies.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const output = join(process.cwd(), 'public', 'downloads');
mkdirSync(output, { recursive: true });
const entries = [
  ['rounded-selection.directive.ts', 'src/app/directives/rounded-selection.directive.ts'],
  ['rounded-selection.css', 'src/roundselect.css'],
  ['app.example.ts', 'examples/app.example.ts'],
  ['README.md', 'distribution/README.md'],
].map(([name, source]) => ({ name, data: readFileSync(join(process.cwd(), source)) }));
for (const { name, data } of entries) writeFileSync(join(output, name), data);

const crcTable = Array.from({length:256}, (_,n) => {
  let c=n;
  for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
  return c>>>0;
});
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes) crc=crcTable[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function makeZip(files) {
  const body=[];const directory=[];let offset=0;
  for(const {name,data} of files) {
    const nameBytes=Buffer.from(name,'utf8'); const checksum=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);
    local.writeUInt32LE(checksum,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);
    local.writeUInt16LE(nameBytes.length,26);
    body.push(local,nameBytes,data);
    const central=Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
    central.writeUInt16LE(0x800,8);central.writeUInt32LE(checksum,16);
    central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);
    central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(offset,42);
    directory.push(central,nameBytes);
    offset+=local.length+nameBytes.length+data.length;
  }
  const directoryBuffer=Buffer.concat(directory);
  const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(directoryBuffer.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...body,directoryBuffer,end]);
}
writeFileSync(join(output,'roundselect.zip'),makeZip(entries));
console.log(`Prepared RoundSelect download: ${entries.map(f=>f.name).join(', ')} + roundselect.zip`);
