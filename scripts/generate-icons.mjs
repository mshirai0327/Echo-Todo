import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = resolve(__dirname, '..')
const ICON_DIR = resolve(ROOT_DIR, 'public/icons')

const VIEWBOX_SIZE = 128
const SIZES = [16, 48, 128]
const SAMPLE_GRID = 6

const COLORS = {
  bg: hex('#65558f'),
  white: hex('#ffffff'),
  bubble: hex('#dbe6ff'),
  dot: hex('#4f4274'),
}

const CRC_TABLE = buildCrcTable()

mkdirSync(ICON_DIR, { recursive: true })

for (const size of SIZES) {
  const png = renderIcon(size)
  writeFileSync(resolve(ICON_DIR, `icon${size}.png`), png)
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4)

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      for (let sy = 0; sy < SAMPLE_GRID; sy += 1) {
        for (let sx = 0; sx < SAMPLE_GRID; sx += 1) {
          const x = ((px + (sx + 0.5) / SAMPLE_GRID) / size) * VIEWBOX_SIZE
          const y = ((py + (sy + 0.5) / SAMPLE_GRID) / size) * VIEWBOX_SIZE
          const color = sampleScene(x, y)
          r += color[0]
          g += color[1]
          b += color[2]
          a += color[3]
        }
      }

      const sampleCount = SAMPLE_GRID * SAMPLE_GRID
      const offset = (py * size + px) * 4
      pixels[offset] = Math.round(r / sampleCount)
      pixels[offset + 1] = Math.round(g / sampleCount)
      pixels[offset + 2] = Math.round(b / sampleCount)
      pixels[offset + 3] = Math.round(a / sampleCount)
    }
  }

  return encodePng(size, size, pixels)
}

function sampleScene(x, y) {
  if (!inCircle(x, y, 64, 64, 64)) {
    return [0, 0, 0, 0]
  }

  let color = COLORS.bg

  if (inPersonShape(x, y)) {
    color = COLORS.white
  }

  if (inBubbleShape(x, y)) {
    color = COLORS.bubble
  }

  if (
    inCircle(x, y, 82, 46, 4)
    || inCircle(x, y, 92, 46, 4)
    || inCircle(x, y, 102, 46, 4)
  ) {
    color = COLORS.dot
  }

  return [...color, 255]
}

function inPersonShape(x, y) {
  if (inCircle(x, y, 44, 44, 18)) {
    return true
  }

  if (inEllipse(x, y, 60, 102, 38, 30) && y >= 66 && y <= 104) {
    return true
  }

  if (inRoundedRect(x, y, 24, 84, 72, 20, 10)) {
    return true
  }

  return false
}

function inBubbleShape(x, y) {
  return (
    inRoundedRect(x, y, 70, 26, 36, 40, 12)
    || inTriangle(x, y, [84, 66], [75, 76], [76, 63.5])
  )
}
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx
  const dy = (y - cy) / ry
  return dx * dx + dy * dy <= 1
}

function inRoundedRect(x, y, left, top, width, height, radius) {
  const right = left + width
  const bottom = top + height

  if (x < left || x > right || y < top || y > bottom) {
    return false
  }

  if ((x >= left + radius && x <= right - radius) || (y >= top + radius && y <= bottom - radius)) {
    return true
  }

  return (
    inCircle(x, y, left + radius, top + radius, radius)
    || inCircle(x, y, right - radius, top + radius, radius)
    || inCircle(x, y, left + radius, bottom - radius, radius)
    || inCircle(x, y, right - radius, bottom - radius, radius)
  )
}

function inTriangle(x, y, a, b, c) {
  const area = triangleArea(a, b, c)
  const a1 = triangleArea([x, y], b, c)
  const a2 = triangleArea(a, [x, y], c)
  const a3 = triangleArea(a, b, [x, y])
  return Math.abs(area - (a1 + a2 + a3)) < 0.01
}

function triangleArea(a, b, c) {
  return Math.abs(
    (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])) / 2,
  )
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1)
    raw[rowOffset] = 0
    rgba.copy(raw, rowOffset + 1, y * stride, y * stride + stride)
  }

  const idat = deflateSync(raw)

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const chunkType = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([chunkType, data])), 0)
  return Buffer.concat([length, chunkType, data, crc])
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const value of buffer) {
    crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function buildCrcTable() {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[n] = c >>> 0
  }
  return table
}

function hex(value) {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ]
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
