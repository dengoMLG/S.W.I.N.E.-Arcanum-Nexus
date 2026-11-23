#!/usr/bin/env python3
"""
Local Qwen3-TTS voice generator for Корпус Воронов (15 pilots × 30 Russian lines = 450 MP3s).
Stage 1: Qwen3-TTS-12Hz-1.7B-VoiceDesign -> unique reference voice WAV per Raven pilot.
Stage 2: Qwen3-TTS-12Hz-1.7B-Base        -> consistent voice-cloned MP3s (22050 Hz, mono, 48 kbps).
Resumable: skips already generated WAVs/MP3s.
"""
import gc
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path(r"A:\Agent\SWINE")
SCRIPTS_JSON = ROOT / "modpack" / "raven" / "raven_voice_scripts.json"
OUT_LINES = ROOT / "modpack" / "raven" / "lines"
REFS_DIR = Path(r"A:\AI\Qwen3-TTS\refs\raven")
MODEL_VD = r"A:\AI\Qwen3-TTS\models\Qwen3-TTS-12Hz-1.7B-VoiceDesign"
MODEL_BASE = r"A:\AI\Qwen3-TTS\models\Qwen3-TTS-12Hz-1.7B-Base"
FFMPEG = r"C:\Users\dengo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
if not Path(FFMPEG).exists():
    FFMPEG = "ffmpeg"

REFS_DIR.mkdir(parents=True, exist_ok=True)
OUT_LINES.mkdir(parents=True, exist_ok=True)

data = json.loads(SCRIPTS_JSON.read_text(encoding="utf-8"))
units = data["units"]

# Optional filter via CLI args (e.g. python gen-raven-voices.py v_dzsip)
only = set(sys.argv[1:])
if only:
    units = [u for u in units if u["id"] in only or u["char_id"] in only]


def encode_mp3(wav_arr: np.ndarray, sr: int, dst_mp3: Path):
    dst_mp3.parent.mkdir(parents=True, exist_ok=True)
    tmp_wav = dst_mp3.with_suffix(".tmp.wav")
    sf.write(str(tmp_wav), wav_arr, sr)
    try:
        subprocess.run(
            [
                FFMPEG, "-y", "-loglevel", "error",
                "-i", str(tmp_wav),
                "-af", "highpass=f=75,loudnorm=I=-16:TP=-1.5:LRA=11",
                "-ac", "1", "-ar", "22050", "-b:a", "48k",
                str(dst_mp3),
            ],
            check=True,
        )
    finally:
        if tmp_wav.exists():
            tmp_wav.unlink()


# ── STAGE 1: VoiceDesign (generate 1 unique reference voice sample per pilot) ──
need_refs = [u for u in units if not (REFS_DIR / f"{u['id']}_ref.wav").exists()]
if need_refs:
    print(f"[Stage 1] Loading Qwen3-TTS VoiceDesign for {len(need_refs)} pilots...", flush=True)
    t0 = time.time()
    vd = Qwen3TTSModel.from_pretrained(MODEL_VD, device_map="cuda:0", dtype=torch.bfloat16)
    print(f"  loaded in {time.time() - t0:.1f}s", flush=True)
    for u in need_refs:
        ref_path = REFS_DIR / f"{u['id']}_ref.wav"
        ts = time.time()
        wavs, sr = vd.generate_voice_design(
            text=u["ref_sample_text"],
            language="Russian",
            instruct=u["voice_instruct"],
        )
        sf.write(str(ref_path), wavs[0], sr)
        print(f"  ref [{u['char_id']}] {u['character_name']} ({len(wavs[0])/sr:.1f}s audio) in {time.time()-ts:.1f}s", flush=True)
    del vd
    gc.collect()
    torch.cuda.empty_cache()
else:
    print("[Stage 1] All reference WAVs already exist, skipping VoiceDesign.", flush=True)

# ── STAGE 2: VoiceClone (synthesize all 30 lines per pilot consistently in GPU batches) ──
todo_units = []
for u in units:
    jobs = []
    for cat, texts in u["lines"].items():
        for idx, txt in enumerate(texts, 1):
            dst = OUT_LINES / u["char_id"] / cat / f"{cat}_{idx:02d}.mp3"
            if not dst.exists():
                jobs.append((cat, idx, txt, dst))
    if jobs:
        todo_units.append((u, jobs))

if todo_units:
    total_lines = sum(len(j) for _, j in todo_units)
    print(f"[Stage 2] Loading Qwen3-TTS Base for {total_lines} lines across {len(todo_units)} pilots...", flush=True)
    t0 = time.time()
    base = Qwen3TTSModel.from_pretrained(MODEL_BASE, device_map="cuda:0", dtype=torch.bfloat16)
    print(f"  loaded in {time.time() - t0:.1f}s", flush=True)
    has_prompt_fn = hasattr(base, "create_voice_clone_prompt")

    done = 0
    BATCH = 6
    for u, jobs in todo_units:
        ref_path = str(REFS_DIR / f"{u['id']}_ref.wav")
        tu = time.time()
        prompt = None
        if has_prompt_fn:
            prompt = base.create_voice_clone_prompt(ref_audio=ref_path, ref_text=u["ref_sample_text"])
        for i in range(0, len(jobs), BATCH):
            chunk = jobs[i : i + BATCH]
            texts = [c[2] for c in chunk]
            langs = ["Russian"] * len(chunk)
            if prompt is not None:
                wavs, sr = base.generate_voice_clone(
                    text=texts, language=langs, voice_clone_prompt=prompt,
                )
            else:
                wavs, sr = base.generate_voice_clone(
                    text=texts, language=langs,
                    ref_audio=[ref_path] * len(chunk),
                    ref_text=[u["ref_sample_text"]] * len(chunk),
                )
            for (_, _, _, dst), wav in zip(chunk, wavs):
                encode_mp3(wav, sr, dst)
                done += 1
        print(f"  [{u['char_id']}] {u['character_name']}: +{len(jobs)} MP3s in {time.time()-tu:.1f}s ({done}/{total_lines})", flush=True)

    del base
    gc.collect()
    torch.cuda.empty_cache()

# Summary check
total_mp3 = sum(1 for _ in OUT_LINES.rglob("*.mp3"))
print(f"\nDONE! Total Raven MP3 voice lines on disk: {total_mp3}", flush=True)
