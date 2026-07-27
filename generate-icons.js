// Pure Node.js script to create PWA PNG icons (icon-192.png and icon-512.png)
import fs from 'node:fs';
import zlib from 'node:zlib';

function createPng(width, height, drawFn) {
  const buffer = Buffer.alloc(width * height * 4);
  drawFn(buffer, width, height);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // Raw Image Data with filter byte 0 at start of each scanline
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    scanlines[y * (width * 4 + 1)] = 0; // Filter type 0
    buffer.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idatData = zlib.deflateSync(scanlines);
  const idatChunk = createChunk('IDAT', idatData);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// CRC32 implementation
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    for (let j = 0; j < 8; j++) {
      let bit = (crc ^ byte) & 1;
      crc = (crc >>> 1) ^ (bit ? 0xedb88320 : 0);
      byte >>>= 1;
    }
  }
  return (crc ^ -1) >>> 0;
}

function drawIslamicIcon(buffer, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.42;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Deep emerald green gradient
        const t = (y / height);
        const rVal = Math.round(15 + t * 20);
        const gVal = Math.round(100 + t * 30);
        const bVal = Math.round(60 + t * 20);

        // Crescent moon drawing logic
        const c1x = cx - width * 0.05;
        const c1y = cy - height * 0.05;
        const c1Dist = Math.sqrt((x - c1x) ** 2 + (y - c1y) ** 2);
        
        const c2x = cx + width * 0.08;
        const c2y = cy - height * 0.12;
        const c2Dist = Math.sqrt((x - c2x) ** 2 + (y - c2y) ** 2);

        const isMoon = (c1Dist <= r * 0.5) && !(c2Dist <= r * 0.42);

        // Star drawing logic
        const sx = cx + width * 0.18;
        const sy = cy - height * 0.18;
        const sDist = Math.sqrt((x - sx) ** 2 + (y - sy) ** 2);
        const isStar = sDist <= r * 0.12;

        if (isMoon || isStar) {
          // Soft gold color for crescent and star
          buffer[idx] = 255;
          buffer[idx + 1] = 215;
          buffer[idx + 2] = 0;
          buffer[idx + 3] = 255;
        } else {
          // Emerald background
          buffer[idx] = rVal;
          buffer[idx + 1] = gVal;
          buffer[idx + 2] = bVal;
          buffer[idx + 3] = 255;
        }
      } else {
        // Transparent outside
        buffer[idx] = 0;
        buffer[idx + 1] = 0;
        buffer[idx + 2] = 0;
        buffer[idx + 3] = 0;
      }
    }
  }
}

fs.writeFileSync('icon-192.png', createPng(192, 192, drawIslamicIcon));
fs.writeFileSync('icon-512.png', createPng(512, 512, drawIslamicIcon));
console.log('PWA Icons generated successfully!');
