// Export the editable SVG sources into browser, home-screen and sharing assets.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const site = path.join(root, 'site');
const forest = '#203c32';

async function build() {
  const mark = await fs.readFile(path.join(site, 'favicon.svg'));
  for (const [name, size] of [
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ]) {
    await sharp(mark)
      .resize(size, size)
      .flatten({ background: forest })
      .png()
      .toFile(path.join(site, name));
  }

  // ICO supports embedded PNGs; include native 16, 32 and 48 pixel frames.
  const sizes = [16, 32, 48];
  const frames = await Promise.all(
    sizes.map((size) => sharp(mark).resize(size, size).png().toBuffer()),
  );
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index];
    header[entry + 1] = sizes[index];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await fs.writeFile(
    path.join(site, 'favicon.ico'),
    Buffer.concat([header, ...frames]),
  );

  // Embed PNG for SVG renderers that do not support WebP image elements.
  const illustration = await sharp(path.join(site, 'running-together.webp'))
    .png()
    .toBuffer();
  const template = await fs.readFile(
    path.join(root, 'artwork/social-card.svg'),
    'utf8',
  );
  const social = template
    .replace(
      '{{illustration}}',
      `data:image/png;base64,${illustration.toString('base64')}`,
    )
    .replace(
      '{{mark}}',
      `data:image/svg+xml;base64,${mark.toString('base64')}`,
    );
  await sharp(Buffer.from(social))
    .png()
    .toFile(path.join(site, 'og-image.png'));
  console.log(
    'Exported favicon, home-screen icons and 1200 × 630 social card.',
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
