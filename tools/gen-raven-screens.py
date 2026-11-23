#!/usr/bin/env python3
"""
Local ComfyUI + Wan 2.2 Lightning (4-step FP8) HUD screen generator for Корпус Воронов.
1) Generates any missing 4:3 base portraits (v_aknarako, v_kondor) 100% locally via Wan 2.2 14B.
2) Animates all 15 Raven pilots × 7 emotions (3mp, 5mp, success, laugh, spec, death, death2) = 105 clips.
3) Converts every MP4 via tools/mp4-to-anif.js into modpack/raven/reportanim/<CharId>/<em >.anif (120x90 @ 25 FPS).
Fully resumable: skips already generated .anif files!
"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(r"A:\Agent\SWINE")
COMFY_DIR = Path(r"A:\AI\ComfyUI")
COMFY_PY = COMFY_DIR / ".venv" / "Scripts" / "python.exe"
COMFY_IN = COMFY_DIR / "input"
COMFY_OUT = COMFY_DIR / "output"
PORTRAITS_DIR = ROOT / "modpack" / "raven" / "portraits"
REPORTANIM_DIR = ROOT / "modpack" / "raven" / "reportanim"
SCRIPTS_JSON = ROOT / "modpack" / "raven" / "raven_voice_scripts.json"
FFMPEG = r"C:\Users\dengo\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-9.0.2-full_build\bin\ffmpeg.exe"
if not Path(FFMPEG).exists():
    FFMPEG = "ffmpeg"
NODE = r"C:\Users\dengo\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.20.0-win-x64\node.exe"
if not Path(NODE).exists():
    NODE = "node"

API = "http://127.0.0.1:8188"
PORTRAITS_DIR.mkdir(parents=True, exist_ok=True)
REPORTANIM_DIR.mkdir(parents=True, exist_ok=True)

# Character visual descriptions for consistent Wan 2.2 prompts
CHAR_VISUALS = {
    "v_dzsip":       "young black-and-blue feathered swift scout pilot in leather aviator helmet with raised brass goggles and cockpit headset mic inside steel cockpit",
    "v_pancelkocsi": "gruff scarred brown hawk AA gunner in dented steel flak helmet with brass ammo belt over shoulder inside gunmetal AA turret",
    "v_tank":        "noble golden eagle tank commander in dark navy peaked officer cap with gold winged badge and white silk aviator scarf inside riveted tank turret",
    "v_loveg":       "cynical bald-headed vulture artilleryman wearing brass rangefinder monocle and ear-defender headphones inside riveted artillery cab",
    "v_vadasz":      "confident female peregrine falcon interceptor pilot in sleek dark-slate fighter helmet with tinted blue visor inside cockpit",
    "v_raketas":     "boisterous soot-smudged dark-feathered kite rocket sergeant in yellow-black hazard blast helmet and smoky goggles inside armored rocket cab",
    "v_mozsar":      "huge round-faced brown eagle-owl mortar veteran with sleepy glowing amber eyes and steel bunker helmet inside riveted mortar turret",
    "v_aknarako":    "hyperactive wide-eyed black-and-white woodpecker sapper with bright red head crest poking under yellow-black striped hard hat and flip magnifier lenses inside armored cabin",
    "v_movingforce": "grand older white-and-slate albatross carrier admiral in gold-braided navy peaked cap and golden epaulettes on armored carrier bridge",
    "v_vontato":     "cheerful iridescent dark starling airfield mechanic with grease smudge, tilted blue mechanic cap and yellow-black marshaling headset inside tug cab",
    "v_sokolzrk":    "cold disciplined female grey peregrine falcon SAM radar operator wearing sleek tactical headset with glowing cyan holographic eyepiece inside radar console interior",
    "v_ekranoplan":  "reckless daredevil dark-slate storm petrel pilot in shiny red-and-black stunt fighter helmet, chrome goggles and white scarf inside fighter cockpit",
    "v_sova":        "clever nerdy pale-faced barn owl AWACS navigator wearing round brass glasses and double-antenna radio headphones with glowing blue radar scope behind",
    "v_korshunkam":  "unhinged retro-military riveted steel and crimson robotic crow AI drone head with one giant glowing yellow optical lens eye and hazard stripe brow in missile bay",
    "v_kondor":      "intimidating scarred black Andean condor sky-marshal general with fierce glowing gold-red eyes, black-and-gold marshal peaked cap and crimson uniform collar inside command flagship",
}

EMOTIONS = [
    ("3mp",     49, 75,  0, True,  "The bird pilot nods briskly and talks eagerly into the radio for 3 seconds, beak opening and closing naturally, eyes blinking and head bobbing with subtle engine vibration."),
    ("5mp",     81, 125, 0, True,  "The bird pilot delivers an animated 5-second military tactical report to camera, beak speaking expressively, eyebrows shifting, head turning slightly and returning calmly."),
    ("success", 49, 75,  0, True,  "The bird pilot beams proudly with a victorious smirk and gives a sharp confident salute/nod of triumph, feathers puffing slightly."),
    ("laugh",   49, 75,  0, True,  "The bird pilot bursts into a hearty cocky laugh, head tilting back and shoulders shaking joyfully with beak wide open."),
    ("spec",    49, 75,  0, True,  "The bird pilot narrows eyes with intense focus, leans slightly forward and hits a cockpit toggle switch as radar/instrument lights flash across their face."),
    ("death",   49, 75,  1, False, "Sudden violent explosion shakes the armored cabin! Sparks and orange firelight flash wildly as the alarmed bird pilot recoils backward in panic amid smoke."),
    ("death2",  57, 88,  2, False, "Heavy impact jolts the cockpit with smoke, glowing embers and red alarm light; the dazed bird pilot ducks down grabbing their helmet as the cabin fills with smoke."),
]

NEG = "blurry, distorted face, extra limbs, morphing face, changing helmet, changing outfit, camera pan, camera zoom, text, subtitles, watermark, HUD frame, UI overlay, anime, 2d drawing, frozen"


def api_json(path_str, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(f"{API}{path_str}", data=data, headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def wait_comfy_ready(timeout=120):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            api_json("/system_stats")
            return True
        except Exception:
            time.sleep(1.5)
    raise RuntimeError("ComfyUI did not start in time")


def queue_and_wait(workflow, out_prefix):
    resp = api_json("/prompt", {"prompt": workflow})
    pid = resp["prompt_id"]
    while True:
        hist = api_json(f"/history/{pid}")
        if pid in hist:
            entry = hist[pid]
            if entry.get("status", {}).get("status_str") == "error":
                raise RuntimeError(f"ComfyUI error for {out_prefix}: {entry.get('status')}")
            # Find output mp4
            for node_out in entry.get("outputs", {}).values():
                for key in ("images", "gifs", "videos"):
                    if key in node_out:
                        for item in node_out[key]:
                            fn = item.get("filename")
                            if fn and fn.endswith(".mp4"):
                                return COMFY_OUT / item.get("subfolder", "") / fn
            # Fallback glob
            matches = sorted(COMFY_OUT.glob(f"{out_prefix}*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
            if matches:
                return matches[0]
            raise RuntimeError(f"No MP4 found for {out_prefix}")
        time.sleep(1.0)


def build_wan_workflow(img_name, prompt_text, length, out_prefix, seed, loop_back=True):
    wf = {
        "37": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}},
        "38": {"class_type": "CLIPLoader", "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan"}},
        "39": {"class_type": "VAELoader", "inputs": {"vae_name": "wan_2.1_vae.safetensors"}},
        "56": {"class_type": "UNETLoader", "inputs": {"unet_name": "wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors", "weight_dtype": "default"}},
        "68": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["37", 0], "lora_name": r"Wan2.2-Lightning\Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1\high_noise_model.safetensors", "strength_model": 1.0}},
        "69": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["56", 0], "lora_name": r"Wan2.2-Lightning\Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1\low_noise_model.safetensors", "strength_model": 1.0}},
        "54": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["68", 0], "shift": 5.0}},
        "55": {"class_type": "ModelSamplingSD3", "inputs": {"model": ["69", 0], "shift": 5.0}},
        "6":  {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": prompt_text}},
        "7":  {"class_type": "CLIPTextEncode", "inputs": {"clip": ["38", 0], "text": NEG}},
        "71": {"class_type": "LoadImage", "inputs": {"image": img_name}},
        "57": {"class_type": "KSamplerAdvanced", "inputs": {"model": ["54", 0], "positive": ["63", 0], "negative": ["63", 1], "latent_image": ["63", 2], "add_noise": "enable", "noise_seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 0, "end_at_step": 2, "return_with_leftover_noise": "enable"}},
        "58": {"class_type": "KSamplerAdvanced", "inputs": {"model": ["55", 0], "positive": ["63", 0], "negative": ["63", 1], "latent_image": ["57", 0], "add_noise": "disable", "noise_seed": seed, "steps": 4, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple", "start_at_step": 2, "end_at_step": 4, "return_with_leftover_noise": "disable"}},
        "8":  {"class_type": "VAEDecode", "inputs": {"samples": ["58", 0], "vae": ["39", 0]}},
        "60": {"class_type": "CreateVideo", "inputs": {"images": ["8", 0], "fps": 16.0}},
        "61": {"class_type": "SaveVideo", "inputs": {"video": ["60", 0], "filename_prefix": out_prefix, "format": "mp4", "codec": "h264"}},
    }
    if loop_back:
        wf["63"] = {"class_type": "WanFirstLastFrameToVideo", "inputs": {"positive": ["6", 0], "negative": ["7", 0], "vae": ["39", 0], "width": 512, "height": 384, "length": length, "batch_size": 1, "start_image": ["71", 0], "end_image": ["71", 0]}}
    else:
        wf["63"] = {"class_type": "WanImageToVideo", "inputs": {"positive": ["6", 0], "negative": ["7", 0], "vae": ["39", 0], "width": 512, "height": 384, "length": length, "batch_size": 1, "start_image": ["71", 0]}}
    return wf


def make_backdrop_seed(dst_path: Path, accent_rgb):
    """Creates a clean dark riveted steel cockpit backdrop so Wan 2.2 materializes the bird pilot cleanly."""
    im = Image.new("RGB", (512, 384), (24, 30, 40))
    dr = ImageDraw.Draw(im)
    for y in range(384):
        c = int(18 + 18 * (y / 384))
        dr.line([(0, y), (512, y)], fill=(c, c + 5, c + 12))
    # Subtle armored cockpit frame silhouette at edges
    dr.rectangle([0, 0, 56, 384], fill=(16, 20, 26))
    dr.rectangle([456, 0, 512, 384], fill=(16, 20, 26))
    dr.ellipse([160, 88, 352, 330], fill=accent_rgb)
    im.save(dst_path)


def synthesize_missing_portrait(uid, desc, accent_rgb, seed):
    dst_p = PORTRAITS_DIR / f"{uid}_base4x3.png"
    dst_in = COMFY_IN / f"swine_{uid}_base4x3.png"
    if dst_p.exists():
        if not dst_in.exists():
            shutil.copyfile(dst_p, dst_in)
        return
    seed_img = COMFY_IN / f"_seed_{uid}.png"
    make_backdrop_seed(seed_img, accent_rgb)
    prompt = (
        f"Pixar-style expressive 3D cartoon military character portrait in S.W.I.N.E. HD Remaster game style: "
        f"{desc}, facing directly forward at camera, tight head-and-shoulders bust framing, crisp detailed feathers, "
        f"warm cinematic key light, cool dark riveted steel cockpit interior background. Character emerges clearly "
        f"into sharp focus centered in frame. No text, no watermark, no HUD."
    )
    print(f"[Portrait] Synthesizing missing {uid} locally via Wan 2.2...", flush=True)
    wf = build_wan_workflow(seed_img.name, prompt, length=17, out_prefix=f"swine_{uid}_portrait", seed=seed, loop_back=False)
    mp4 = queue_and_wait(wf, f"swine_{uid}_portrait")
    # Extract crisp final frame (frame 15) as 512x384 PNG
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-sseof", "-0.12", "-i", str(mp4), "-frames:v", "1", str(dst_p)], check=True)
    shutil.copyfile(dst_p, dst_in)
    print(f"  saved local portrait → {dst_p}", flush=True)


def main():
    scripts = json.loads(SCRIPTS_JSON.read_text(encoding="utf-8"))
    units = scripts["units"]
    only = set(a for a in sys.argv[1:] if not a.startswith("--"))
    portraits_only = "--portraits-only" in sys.argv[1:]
    if only:
        units = [u for u in units if u["id"] in only or u["char_id"] in only]

    # Check if ComfyUI already listening; if not, launch headless
    started_proc = None
    try:
        api_json("/system_stats")
        print("Connected to existing ComfyUI instance.", flush=True)
    except Exception:
        print("Starting headless ComfyUI on 127.0.0.1:8188...", flush=True)
        started_proc = subprocess.Popen(
            [str(COMFY_PY), str(COMFY_DIR / "main.py"), "--listen", "127.0.0.1", "--port", "8188", "--disable-auto-launch"],
            cwd=str(COMFY_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_comfy_ready(120)
        print("ComfyUI ready!", flush=True)

    try:
        # 1) Synthesize the 2 missing portraits locally on RTX 5080 if not present
        synthesize_missing_portrait("v_aknarako", CHAR_VISUALS["v_aknarako"], (48, 42, 36), 55001)
        synthesize_missing_portrait("v_kondor",   CHAR_VISUALS["v_kondor"],   (34, 28, 32), 55002)
        if portraits_only:
            print("Portraits-only pass done!", flush=True)
            return

        # 2) Animate all 15 pilots × 7 emotions = 105 .anif HUD screens
        total = len(units) * len(EMOTIONS)
        done = 0
        for ui, u in enumerate(units):
            uid, cid = u["id"], u["char_id"]
            img_name = f"swine_{uid}_base4x3.png"
            if not (COMFY_IN / img_name).exists():
                shutil.copyfile(PORTRAITS_DIR / f"{uid}_base4x3.png", COMFY_IN / img_name)

            for ei, (em, wan_len, anif_frames, death_mode, loop_back, action) in enumerate(EMOTIONS):
                out_anif = REPORTANIM_DIR / cid / f"{em}.anif"
                done += 1
                if out_anif.exists():
                    continue
                t0 = time.time()
                prefix = f"swine_{uid}_{em}"
                # Reuse existing MP4 if already rendered in ComfyUI/output
                existing_mp4s = sorted(COMFY_OUT.glob(f"{prefix}_*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
                if existing_mp4s:
                    mp4 = existing_mp4s[0]
                else:
                    prompt = (
                        f"{CHAR_VISUALS[uid]}. {action} "
                        f"Keep the character design, helmet, uniform, glasses/goggles, facial features, lighting, and background 100% consistent with the input image. "
                        f"Static locked-off portrait camera. Early-2000s expressive 3D cartoon game character animation style. "
                        + ("Smoothly return to the exact neutral pose and expression on the final frame. " if loop_back else "")
                        + "No HUD frames, no text, no subtitles, no UI overlays."
                    )
                    wf = build_wan_workflow(img_name, prompt, wan_len, prefix, seed=20000 + ui * 100 + ei, loop_back=loop_back)
                    mp4 = queue_and_wait(wf, prefix)

                subprocess.run(
                    [NODE, str(ROOT / "tools" / "mp4-to-anif.js"), str(mp4), str(out_anif), "--frames", str(anif_frames), "--death", str(death_mode)],
                    check=True, stdout=subprocess.DEVNULL,
                )
                print(f"  [{done:3d}/{total}] {cid}/{em}.anif ({out_anif.stat().st_size//1024} KB) in {time.time()-t0:.1f}s", flush=True)

        print(f"\nALL RAVEN HUD SCREENS COMPLETE! Total .anif in {REPORTANIM_DIR}: {sum(1 for _ in REPORTANIM_DIR.rglob('*.anif'))}", flush=True)
    finally:
        if started_proc is not None:
            print("Stopping headless ComfyUI...", flush=True)
            started_proc.terminate()
            try:
                started_proc.wait(timeout=15)
            except Exception:
                started_proc.kill()


if __name__ == "__main__":
    main()
