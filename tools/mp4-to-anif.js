#!/usr/bin/env node
// Конвертер MP4 (Wan 2.2 512×384 @ 16fps) → игровой экранчик S.W.I.N.E. HD reportanim/*.anif (120×90 @ 25fps, ANI2).
// Для death / death2 добавляет фирменные CRT-помехи и «потерю сигнала» в концовке, как в оригинале!
//
//   node tools/mp4-to-anif.js <in.mp4> <out.anif> [--frames 75] [--death 0|1|2]
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ANIF = require('./swine-anif');

const FFMPEG = fs.existsSync('C:/Users/dengo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe')
  ? 'C:/Users/dengo/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe'
  : 'ffmpeg';

function convertMp4ToAnif(inMp4, outAnif, targetFrames = 75, deathMode = 0) {
  const W = 120, H = 90;
  // Декодируем все кадры в raw RGBA 120x90 с плавным 25 FPS ресемплингом
  const raw = execFileSync(FFMPEG, [
    '-loglevel', 'error',
    '-i', inMp4,
    '-vf', `fps=25,scale=${W}:${H}:flags=lanczos`,
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-',
  ], { maxBuffer: 64 * 1024 * 1024 });

  const frameSize = W * H * 4;
  const srcCount = Math.max(1, Math.floor(raw.length / frameSize));
  const frames = [];
  let seed = 1337 + deathMode * 997;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  for (let f = 0; f < targetFrames; f++) {
    const si = Math.min(srcCount - 1, Math.round(f * (srcCount - 1) / Math.max(1, targetFrames - 1)));
    const buf = Buffer.from(raw.subarray(si * frameSize, (si + 1) * frameSize));

    // Программные ТВ-помехи и срыв сигнала на концовке death / death2
    if (deathMode > 0) {
      const t = f / Math.max(1, targetFrames - 1);
      if (t > 0.42) {
        const noiseAmt = Math.min(1, (t - 0.42) / 0.36);
        const shiftX = t > 0.55 ? Math.round((rnd() - 0.5) * 18 * noiseAmt) : 0;
        const copy = Buffer.from(buf);
        for (let y = 0; y < H; y++) {
          const scanDark = (y % 2 === 0) ? (1 - 0.25 * noiseAmt) : 1.0;
          const rowShift = (rnd() < noiseAmt * 0.35) ? Math.round((rnd() - 0.5) * 28) : shiftX;
          for (let x = 0; x < W; x++) {
            const sx = (x + rowShift + W) % W;
            const s = (y * W + sx) * 4, d = (y * W + x) * 4;
            if (t > 0.80) {
              // Полный ТВ-снег + красная вспышка / помехи
              const v = Math.round(rnd() * (t > 0.90 ? 110 : 210) * scanDark);
              buf[d] = Math.min(255, v + (deathMode === 2 ? 24 : 0));
              buf[d + 1] = v;
              buf[d + 2] = v;
              buf[d + 3] = 255;
            } else {
              const snow = rnd() * 255;
              const mix = noiseAmt * 0.72;
              buf[d]     = Math.round((copy[s]     * (1 - mix) + snow * mix) * scanDark);
              buf[d + 1] = Math.round((copy[s + 1] * (1 - mix) + snow * mix) * scanDark);
              buf[d + 2] = Math.round((copy[s + 2] * (1 - mix) + snow * mix) * scanDark);
              buf[d + 3] = 255;
            }
          }
        }
      }
    }
    frames.push(buf);
  }

  fs.mkdirSync(path.dirname(outAnif), { recursive: true });
  ANIF.write(outAnif, W, H, frames);
  return { w: W, h: H, frames: frames.length, size: fs.statSync(outAnif).size };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const inMp4 = args[0], outAnif = args[1];
  const fIdx = args.indexOf('--frames'), dIdx = args.indexOf('--death');
  const targetFrames = fIdx >= 0 ? Number(args[fIdx + 1]) : 75;
  const deathMode = dIdx >= 0 ? Number(args[dIdx + 1]) : 0;
  const info = convertMp4ToAnif(inMp4, outAnif, targetFrames, deathMode);
  console.log(`ANIF ${info.w}x${info.h}x${info.frames} (${(info.size / 1024).toFixed(1)} KB) → ${outAnif}`);
}

module.exports = { convertMp4ToAnif };
