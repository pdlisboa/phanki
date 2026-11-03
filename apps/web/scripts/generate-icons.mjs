// Renders the app icon (public/icon.svg artwork) into the source PNGs that
// @capacitor/assets turns into Android launcher icons and splash screens,
// plus PNG icons for the web manifest. Run with: npm run icons -w @phanki/web
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const BG = '#09090b'
const svg = fs.readFileSync(path.join(root, 'public/icon.svg'), 'utf8')
// Everything except the rounded background square.
const artwork = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect width="512" height="512"[^>]*\/>/, '')
// Center of the artwork in the 512 viewBox
const CX = 242
const CY = 278

function centered(size, scale, background) {
  const tx = size / 2 - CX * scale
  const ty = size / 2 - CY * scale
  const bg = background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : ''
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${bg}<g transform="translate(${tx} ${ty}) scale(${scale})">${artwork}</g></svg>`)
}

const out = (name) => path.join(root, name)
await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(out('assets/icon-only.png'))
// Adaptive icon: @capacitor/assets insets the foreground into the 66/108 safe zone, so fill the canvas.
await sharp(centered(1024, 1.9)).png().toFile(out('assets/icon-foreground.png'))
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } }).png().toFile(out('assets/icon-background.png'))
for (const name of ['splash.png', 'splash-dark.png']) await sharp(centered(2732, 3, BG)).png().toFile(out(`assets/${name}`))
for (const size of [192, 512]) await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out(`public/icon-${size}.png`))
await sharp(centered(512, 0.62, BG)).png().toFile(out('public/icon-maskable-512.png'))
await sharp(Buffer.from(svg)).resize(180, 180).flatten({ background: BG }).png().toFile(out('public/apple-touch-icon.png'))
console.log('Icon sources written to assets/ and public/')
