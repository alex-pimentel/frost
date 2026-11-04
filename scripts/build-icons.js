#!/usr/bin/env node
/**
 * Regenerates the app icons from src/assets/mascot.png.
 *
 * Two rendering strategies, because one artwork cannot do both jobs:
 *  - large sizes (>=64px) use the full square artwork;
 *  - small sizes (<=48px) use a tighter crop around the face, otherwise the fox
 *    turns into an unreadable white blob in the taskbar.
 *
 * The Windows target needs a real multi-resolution .ico (electron-builder embeds it
 * into the exe). sharp cannot write ICO, so the container format is assembled by
 * hand: ICO allows PNG-compressed entries, which is what modern Windows expects.
 *
 * Usage: node scripts/build-icons.js
 * Output: src/assets/icon.png (1024), src/assets/icon.ico (16…256),
 *         src/assets/mascot-face.png (512, cropped for in-app use)
 *
 * macOS (`icon.icns`) is left untouched: regenerating it needs Apple tooling.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "src/assets/mascot.png");
const PNG_OUT = path.join(ROOT, "src/assets/icon.png");
const ICO_OUT = path.join(ROOT, "src/assets/icon.ico");
const FACE_OUT = path.join(ROOT, "src/assets/mascot-face.png");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
/** Face crop, as a fraction of the source: trims the ears' outer edge and chin. */
const FACE_CROP = { left: 0.16, top: 0.14, width: 0.68, height: 0.68 };

function faceRegion(width, height) {
  return {
    left: Math.round(width * FACE_CROP.left),
    top: Math.round(height * FACE_CROP.top),
    width: Math.round(width * FACE_CROP.width),
    height: Math.round(height * FACE_CROP.height),
  };
}

async function render(source, size, { cropped }) {
  let pipeline = sharp(source);
  if (cropped) {
    const meta = await sharp(source).metadata();
    pipeline = pipeline.extract(faceRegion(meta.width, meta.height));
  }
  return pipeline.resize(size, size, { fit: "cover" }).png().toBuffer();
}

function packIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(entries.length, 4);

  let offset = 6 + 16 * entries.length;
  const directory = [];
  for (const { size, data } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    directory.push(entry);
  }

  return Buffer.concat([header, ...directory, ...entries.map((entry) => entry.data)]);
}

async function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`missing ${SOURCE}`);

  await sharp(SOURCE)
    .resize(1024, 1024, { fit: "cover" })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(PNG_OUT);
  console.log(`icon.png        1024x1024  ${(fs.statSync(PNG_OUT).size / 1024).toFixed(1)} KB`);

  const meta = await sharp(SOURCE).metadata();
  await sharp(SOURCE)
    .extract(faceRegion(meta.width, meta.height))
    .resize(256, 256, { fit: "cover" })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(FACE_OUT);
  console.log(`mascot-face.png 256x256    ${(fs.statSync(FACE_OUT).size / 1024).toFixed(1)} KB`);

  const entries = [];
  for (const size of ICO_SIZES) {
    entries.push({ size, data: await render(SOURCE, size, { cropped: size <= 48 }) });
  }
  fs.writeFileSync(ICO_OUT, packIco(entries));
  console.log(
    `icon.ico        ${ICO_SIZES.join("/")}  ${(fs.statSync(ICO_OUT).size / 1024).toFixed(1)} KB`
  );

  const written = fs.readFileSync(ICO_OUT);
  const count = written.readUInt16LE(4);
  if (count !== ICO_SIZES.length) {
    throw new Error(`ico header mismatch: ${count} != ${ICO_SIZES.length}`);
  }
  console.log(`verificado: ${count} entradas`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
