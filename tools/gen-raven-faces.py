#!/usr/bin/env python3
"""
Extracts clean 512x512 transparent RGBA menu corner faces (raven_face_01..15.png)
from the 15 Raven pilot portraits using local briaai/RMBG-1.4 cached in A:\AI\hf_cache.
"""
import json
import os
from pathlib import Path

os.environ["HF_HOME"] = r"A:\AI\hf_cache"
os.environ["HF_HUB_OFFLINE"] = "1"

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from transformers import AutoModelForImageSegmentation

ROOT = Path(r"A:\Agent\SWINE")
SCRIPTS = json.loads((ROOT / "modpack" / "raven" / "raven_voice_scripts.json").read_text(encoding="utf-8"))
PORTRAITS = ROOT / "modpack" / "raven" / "portraits"
OUT_FACES = ROOT / "modpack" / "raven" / "menu" / "faces"
OUT_FACES.mkdir(parents=True, exist_ok=True)

device = "cuda:0" if torch.cuda.is_available() else "cpu"
print(f"Loading local briaai/RMBG-1.4 on {device}...", flush=True)
model = AutoModelForImageSegmentation.from_pretrained("briaai/RMBG-1.4", trust_remote_code=True, local_files_only=True)
model.to(device).eval()

for idx, u in enumerate(SCRIPTS["units"], 1):
    src = PORTRAITS / f"{u['id']}_base4x3.png"
    dst = OUT_FACES / f"raven_face_{idx:02d}.png"
    if not src.exists():
        print(f"  SKIP missing portrait: {src}", flush=True)
        continue
    im = Image.open(src).convert("RGB")
    orig_w, orig_h = im.size
    # Resize to 1024x1024 for RMBG-1.4
    inp = im.resize((1024, 1024), Image.BILINEAR)
    arr = np.array(inp, dtype=np.float32) / 255.0
    arr = (arr - 0.5) / 1.0
    ten = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).to(device)
    with torch.no_grad():
        res = model(ten)[0][0]
    mask = F.interpolate(res, size=(orig_h, orig_w), mode="bilinear", align_corners=False)
    ma, mi = mask.max(), mask.min()
    mask = ((mask - mi) / (ma - mi + 1e-6)).squeeze().cpu().numpy()
    alpha = np.clip((mask - 0.15) / 0.70, 0.0, 1.0)
    rgba = np.dstack([np.array(im), (alpha * 255).astype(np.uint8)])
    cut = Image.fromarray(rgba, mode="RGBA")
    # Place neatly at bottom-center of 512x512 transparent canvas (exact S.W.I.N.E. menu/faces style!)
    canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    # Crop tight around non-transparent pixels
    bbox = cut.getbbox()
    if bbox:
        cut = cut.crop(bbox)
    scale = min(470 / max(1, cut.width), 460 / max(1, cut.height))
    nw, nh = max(1, int(cut.width * scale)), max(1, int(cut.height * scale))
    cut = cut.resize((nw, nh), Image.LANCZOS)
    canvas.paste(cut, ((512 - nw) // 2, 512 - nh), cut)
    canvas.save(dst)
    print(f"  [{idx:02d}] {u['id']} -> {dst.name} ({nw}x{nh})", flush=True)

print("Done generating transparent Raven menu faces!", flush=True)
