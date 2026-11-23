// Converte o SVG original em PNG e ICO com sete resoluções, sem imagens externas.
const fs = require('node:fs');
const path = require('node:path');
const { Resvg } = require('@resvg/resvg-js');
const root = path.join(__dirname, '..', 'assets');
const svg = fs.readFileSync(path.join(root, 'maestro.svg'), 'utf8');
const sizes = [16, 24, 32, 48, 64, 128, 256];
function render(size) { return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng(); }
fs.writeFileSync(path.join(root, 'maestro.png'), render(512));
const images = sizes.map(render);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (let i = 0; i < sizes.length; i++) {
  const at = 6 + i * 16, size = sizes[i];
  header.writeUInt8(size === 256 ? 0 : size, at); header.writeUInt8(size === 256 ? 0 : size, at + 1);
  header.writeUInt8(0, at + 2); header.writeUInt8(0, at + 3);
  header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(images[i].length, at + 8); header.writeUInt32LE(offset, at + 12);
  offset += images[i].length;
}
fs.writeFileSync(path.join(root, 'maestro.ico'), Buffer.concat([header, ...images]));
console.log('Ícones gerados:', sizes.join(', '), 'e PNG 512 px');
