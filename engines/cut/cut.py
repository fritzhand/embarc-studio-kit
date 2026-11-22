#!/usr/bin/env python3
"""cut.py: the editor. One cut.json in, one finished video out.

    python3 engines/cut/cut.py projects/<name>/cut.json                 render in the cut's own format
    python3 engines/cut/cut.py projects/<name>/cut.json --format 16x9   the same cut, the other shape
    python3 engines/cut/cut.py projects/<name>/cut.json --proof         also write a contact sheet to check by eye

It splices founder soundbites (picked by sentence from the transcript, so no one types a timecode), product
walkthroughs, screenshots, and cards for titles, figures, quotes and the close. A walkthrough or a picture can sit
over the founder's voice (a cutaway), so the story keeps talking while the product is on screen. Captions come
from the transcript's word timings. The audio is assembled sample-exact: the voice is cleaned and leveled, the
music bed ducks under every spoken line, and the whole mix lands at -14 LUFS for social platforms.

The schema is in engines/cut/README.md. Needs ffmpeg (with libx264), numpy, Node and Chrome (for the cards).
This is the editor behind the Embarc Collective Studio's own highlight reels, made general.
"""
import hashlib, json, os, re, subprocess, sys, tempfile

import numpy as np

sys.stdout.reconfigure(line_buffering=True)   # progress lines in order with the engines' own output

SR, FPS = 48000, 30
SIZES = {"9x16": (1080, 1920), "16x9": (1920, 1080)}
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
RENDER = os.path.join(ROOT, "engines", "cards", "render.mjs")
PAD_IN, PAD_OUT = 0.12, 0.28          # air kept around a soundbite picked by sentence
INNER, GAP = 0.12, 0.7                # inside a soundbite: a gap longer than GAP is cut, keeping INNER of air each side
VOICE = ("highpass=f=90,lowpass=f=12000,afftdn=nr=10:nf=-34:tn=1,"
         "equalizer=f=220:t=q:w=1:g=-2,equalizer=f=3200:t=q:w=1.2:g=3,"
         "acompressor=threshold=-24dB:ratio=3:attack=8:release=160:makeup=4,loudnorm=I=-16:TP=-1.5:LRA=7")
ROOM = "highpass=f=80,lowpass=f=2500,loudnorm=I=-26:TP=-6,volume=0.3"   # a murmur under b-roll, no words
KEEP = "loudnorm=I=-20:TP=-2"
VO = "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=7"
WARN = []


def die(msg):
    print(f"✗ {msg}", file=sys.stderr)
    sys.exit(1)


def run(args, **kw):
    r = subprocess.run(args, capture_output=True, **kw)
    if r.returncode:
        die(f"{os.path.basename(args[0])} failed:\n{r.stderr.decode(errors='ignore')[-2500:]}")
    return r


def probe(path, entry):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", entry, "-of", "csv=p=0", path], capture_output=True, text=True)
    return r.stdout.strip()


def duration(path):
    try:
        return float(probe(path, "format=duration"))
    except ValueError:
        die(f"cannot read {path}")


def has_audio(path):
    return bool(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                                "-of", "csv=p=0", path], capture_output=True, text=True).stdout.strip())


# ---------------------------------------------------------------- brand colors, for padding and backgrounds
def brand_vars(brand):
    css = re.sub(r"/\*.*?\*/", "", open(os.path.join(brand, "brand.css"), encoding="utf-8").read(), flags=re.S)
    vals = {}
    for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
        if ":root" in sel:
            for k, v in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", body):
                vals[k] = v.strip()

    def res(v, depth=0):
        m = re.fullmatch(r"var\((--[\w-]+)(?:\s*,\s*(.+))?\)", v.strip())
        return res(vals.get(m.group(1), m.group(2) or ""), depth + 1) if m and depth < 10 else v
    return {k: res(v) for k, v in vals.items()}


def ffcolor(c, fallback="0x111111"):
    c = (c or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", c):
        return "0x" + c[1:]
    if re.fullmatch(r"#[0-9a-fA-F]{3}", c):
        return "0x" + "".join(ch * 2 for ch in c[1:])
    m = re.match(r"rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)", c)
    return "0x%02x%02x%02x" % tuple(int(x) for x in m.groups()) if m else fallback


# ---------------------------------------------------------------- the spec
args = sys.argv[1:]
if not args or args[0].startswith("-"):
    die(__doc__.strip().split("\n\n")[1])
SPEC = os.path.abspath(args[0])
BASE = os.path.dirname(SPEC)
spec = json.load(open(SPEC, encoding="utf-8"))
opt = lambda name, d=None: args[args.index(name) + 1] if name in args else d
P = lambda p: p if os.path.isabs(p) else os.path.normpath(os.path.join(BASE, p))
FMT = opt("--format", spec.get("format", "9x16"))
if FMT not in SIZES:
    die(f'format must be "9x16" or "16x9", not "{FMT}"')
W, H = SIZES[FMT]
STEM = os.path.splitext(os.path.basename(SPEC))[0]
NAME = spec.get("name", os.path.basename(BASE) if STEM == "cut" else STEM)
BRAND = P(spec["brand"]) if spec.get("brand") else os.path.join(ROOT, "brands", "example-co")
if not os.path.exists(os.path.join(BRAND, "brand.css")):
    die(f"no brand.css in {BRAND}")
BV = brand_vars(BRAND)
PAPER = ffcolor(BV.get("--paper"), "0xffffff")
OUT = P(opt("--out") or spec.get("out", f"out/{NAME}-{{format}}.mp4").replace("{format}", FMT))
BUILD = os.path.join(BASE, "build", f"{NAME}-{FMT}")
CARDS = os.path.join(BASE, "build", "cards")
os.makedirs(BUILD, exist_ok=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)

TR = json.load(open(P(spec["transcript"]), encoding="utf-8")) if spec.get("transcript") else None
SENT = {s["id"]: s for s in TR["sentences"]} if TR else {}
WORDS = TR["words"] if TR else []
CAP = spec.get("captions", bool(TR))
CAPTIONS = bool(CAP)
CAPOPT = CAP if isinstance(CAP, dict) else {}
CAP_STYLE = CAPOPT.get("style", "highlight")       # highlight: the word being spoken lights up; plain: the group only
CAP_WORDS = int(CAPOPT.get("words") or (3 if FMT == "9x16" else 6))
# Motion: cards drawn as animated video by the motion engine (HyperFrames), the lower third as a transparent overlay.
# Off by default; on for the whole cut ("motion": true) or one segment at a time. Without HyperFrames, still cards.
MOTION = bool(spec.get("motion", False))
MOTION_TEMPLATES = ("title", "stat", "quote", "end", "site", "step", "lower")
MOTION_JS = os.path.join(ROOT, "engines", "motion", "motion.mjs")
letters = lambda t: re.sub(r"[^a-z0-9]+", "", t.lower())
TR_LETTERS = letters(" ".join(w["w"] for w in WORDS)) if TR else ""

# ---------------------------------------------------------------- resolve every segment's length and audio
segs = spec.get("segments") or die("the cut has no segments")
for i, s in enumerate(segs):
    t = s.get("type")
    if t == "clip":
        s["_src"] = P(s["src"])
        if not os.path.exists(s["_src"]):
            die(f"segment {i + 1}: no file {s['src']}")
        if "from" in s:
            if not TR:
                die(f'segment {i + 1} picks sentences ("from") but the cut names no transcript')
            a_id, b_id = s["from"], s.get("to", s["from"])
            if a_id not in SENT or b_id not in SENT:
                die(f"segment {i + 1}: no sentence {a_id if a_id not in SENT else b_id} in the transcript")
            order = [x["id"] for x in TR["sentences"]]
            ia, ib = order.index(a_id), order.index(b_id)
            if ib < ia:
                die(f"segment {i + 1}: {b_id} comes before {a_id}")
            # tighten: a gap between picked sentences (a pause, or the host's next question) is cut out
            runs = []
            for x in TR["sentences"][ia:ib + 1]:
                if runs and (x["start"] - runs[-1][1] <= GAP or not s.get("tighten", True)):
                    runs[-1][1] = x["end"]
                else:
                    runs.append([x["start"], x["end"]])
            ranges = [[r0 - (PAD_IN if k == 0 else INNER), r1 + (PAD_OUT if k == len(runs) - 1 else INNER)] for k, (r0, r1) in enumerate(runs)]
            ranges[0][0] += s.get("trim_in", 0)
            ranges[-1][1] += s.get("trim_out", 0)
        else:
            ranges = [[float(s.get("in", 0)), float(s["out"]) if "out" in s else duration(s["_src"])]]
        end = duration(s["_src"])
        ranges = [(max(0.0, r0), min(r1, end)) for r0, r1 in ranges]
        if sum(r1 - r0 for r0, r1 in ranges) < 0.3:
            die(f"segment {i + 1}: too short")
        s["_ranges"] = ranges
        s["_in"], s["_dur"] = ranges[0][0], sum(r1 - r0 for r0, r1 in ranges)
        s["_audio"] = s.get("audio", "voice" if ("from" in s or s.get("speech")) else "room")
    elif t in ("card", "image"):
        s["_dur"] = float(s.get("dur", 3.0))
        if t == "image":
            s["_src"] = P(s["src"])
            if not os.path.exists(s["_src"]):
                die(f"segment {i + 1}: no file {s['src']}")
        s["_audio"] = "none"
    else:
        die(f'segment {i + 1}: type must be clip, card or image, not "{t}"')
    if s.get("vo"):
        s["_vo"] = P(s["vo"])
        if not os.path.exists(s["_vo"]):
            die(f"segment {i + 1}: no voiceover file {s['vo']}")
        vo_len = duration(s["_vo"]) + s.get("vo_at", 0.25)
        if t != "clip" and "dur" not in s:
            s["_dur"] = max(s["_dur"], vo_len + 0.4)     # a card with a voiceover lasts as long as its line
    # the checks a person would make before posting
    if t == "card" and s.get("template") == "stat" and not (s.get("data") or {}).get("source"):
        WARN.append(f"segment {i + 1}: a figure with no source. Put one in data.source, or cut the card")
    if t == "card" and s.get("template") == "quote" and TR and letters((s.get("data") or {}).get("text", "")) not in TR_LETTERS:
        WARN.append(f"segment {i + 1}: the quote is not the speaker's exact words in the transcript")

speaking = lambda s: s["type"] == "clip" and s["_audio"] == "voice"
durs = [s["_dur"] for s in segs]
xf = [0.0]
for i in range(1, len(segs)):
    tr = segs[i].get("transition", "fade")
    d = 1 / FPS if tr == "cut" else float(segs[i].get("xf", 0.08 if speaking(segs[i - 1]) and speaking(segs[i]) else 0.35))
    xf.append(min(d, durs[i - 1] / 2, durs[i] / 2))
# On the beat: with the music's tempo given (music.bpm), a card or picture is held a little longer, at most one beat,
# so the next scene comes in on a beat of the music. Soundbites keep their length: they are the founder's words.
MUS = spec.get("music") or {}
BEAT = 60.0 / float(MUS["bpm"]) if MUS.get("bpm") and MUS.get("snap", True) else None
DOWNBEAT = float(MUS.get("downbeat", 0)) - float(MUS.get("start", 0))


def on_beat(start, i):
    if not BEAT or segs[i]["type"] not in ("card", "image") or i == len(segs) - 1:
        return durs[i]
    cut_at = start + durs[i] - xf[i + 1]                       # where the next scene begins to come in
    k = -(-(cut_at - DOWNBEAT - 1e-6) // BEAT)                  # the next beat at or after it
    return durs[i] + (DOWNBEAT + k * BEAT - cut_at)


durs[0] = segs[0]["_dur"] = on_beat(0.0, 0)
starts, t = [0.0], durs[0]
for i in range(1, len(segs)):
    starts.append(t - xf[i])
    durs[i] = segs[i]["_dur"] = on_beat(starts[i], i)
    t = starts[i] + durs[i]
TOTAL = t

# Holds: a line the viewer must read stays up about 0.5 s plus 0.3 s a word, and the last line at least 2 s
# (measured from HyperFrames' motion doctrine, github.com/heygen-com/hyperframes, Apache-2.0).
READ_FIELDS = {"title": ("title", "sub"), "stat": ("n", "label"), "quote": ("text", "name"), "end": ("line", "url"),
               "site": ("title", "body"), "step": ("title", "body"), "image": ("caption",)}
for i, s in enumerate(segs):
    t = s.get("template") if s["type"] == "card" else ("image" if s["type"] == "image" else None)
    if t in READ_FIELDS:
        d = s.get("data") or {}
        txt = " ".join(str(d.get(k) or "") for k in READ_FIELDS[t]) if s["type"] == "card" else str(s.get("caption") or "")
        n = len(re.findall(r"[\w$%'’.-]+", txt))
        need = max(0.5 + 0.3 * n, 2.0 if i == len(segs) - 1 else 0)
        if n and s["_dur"] + 0.2 < need:
            WARN.append(f"segment {i + 1}: on screen {s['_dur']:.1f} s, but its {n} words need about {need:.1f} s to read (0.5 s plus 0.3 s a word)")


# ---------------------------------------------------------------- every card, caption and lower third, rendered once
jobs, cache = [], {}
CARDS_SIG = hashlib.sha1(open(RENDER, "rb").read()).hexdigest()[:8]


def card(template, data, theme="light"):
    # pictures named in a card (a screenshot, a step's photo) are found from the cut file's folder
    data = {k: (P(v) if k in ("photo", "shot", "src") and isinstance(v, str) and not v.startswith(("http:", "https:", "data:")) else v) for k, v in data.items()}
    key = json.dumps([CARDS_SIG, template, data, FMT, theme, BRAND], sort_keys=True)
    out = os.path.join(CARDS, hashlib.sha1(key.encode()).hexdigest()[:16] + ".png")
    if out not in cache:
        cache[out] = True
        if not os.path.exists(out):
            jobs.append({"template": template, "data": data, "format": FMT, "brand": BRAND, "out": out, "theme": theme})
    return out


def caption_chunks(ranges):
    """Caption groups for a soundbite, timed on the soundbite's own clock (its ranges laid end to end). A group is a few
    words that read at a glance: it ends at a sentence end, at a pause of 150 ms or more, or at the word or width limit
    (the caption rules HyperFrames measured: github.com/heygen-com/hyperframes, Apache-2.0). Each comes back with its
    words, so the word being spoken can be lit."""
    ws, off = [], 0.0
    for a, b in ranges:
        ws += [{**w, "start": w["start"] - a + off, "end": w["end"] - a + off} for w in WORDS if w["start"] >= a - 0.05 and w["end"] <= b + 0.05]
        off += b - a
    maxc = 18 if FMT == "9x16" else 42
    groups, cur = [], []
    for w in ws:
        if cur:
            prev, text = cur[-1], " ".join(x["w"] for x in cur + [w])
            pause = w["start"] - prev["end"]
            if (len(cur) >= CAP_WORDS or len(text) > maxc or re.search(r"[.?!]$", prev["w"]) or pause >= 0.6
                    or (len(cur) >= 2 and pause >= 0.15) or (re.search(r"[,;:]$", prev["w"]) and len(text) > maxc * .55)):
                groups.append(cur)
                cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    for k in range(1, len(groups)):
        prev, g = groups[k - 1], groups[k]
        if len(g) == 1 and len(prev) >= 3 and not re.search(r"[.?!]$", prev[-1]["w"]) and g[0]["start"] - prev[-1]["end"] < 0.3:
            groups[k] = [prev.pop()] + g
    res = []
    for k, g in enumerate(groups):
        # up until the next group starts, but not through a long silence: at most 0.7 s after the last word
        e0 = min(groups[k + 1][0]["start"], g[-1]["end"] + 0.7) if k + 1 < len(groups) else g[-1]["end"] + 0.35
        res.append((max(0.0, g[0]["start"]), min(off, e0), g))
    return res


def frame_box(device):
    """Where the screen sits in a browser or phone frame: x, y, width, height in pixels. The card draws the frame
    around exactly this box, and the recording is laid into it."""
    if FMT == "16x9":
        if device == "phone":
            bh = 860
            bw = round(bh * 390 / 844) // 2 * 2
            return [1255 - bw // 2, (H - bh) // 2, bw, bh], [96, 0, 520, H]
        return [680, (H - 726) // 2 + 24, 1160, 726], [96, 0, 520, H]
    if device == "phone":
        bh = 1240
        bw = round(bh * 390 / 844) // 2 * 2
        return [(W - bw) // 2, 600, bw, bh], [80, 130, W - 160, 420]
    return [40, 690, 1000, 626], [80, 150, W - 160, 460]


def frame_card(fr, theme):
    box, text = frame_box(fr.get("device", "browser"))
    data = {k: fr.get(k) for k in ("device", "url", "eyebrow", "title", "caption")}
    data.update(box=box, text=text)
    return card("screen", data, fr.get("theme", theme)), box


mjobs, mcache = [], {}
MOTIONS = os.path.join(BASE, "build", "motion")
MOTION_SIG = hashlib.sha1(open(MOTION_JS, "rb").read()).hexdigest()[:8] if os.path.exists(MOTION_JS) else "none"


def motion(template, data, dur, theme="light"):
    """An animated card (MP4), or a lower third as a transparent overlay (WebM), drawn by the motion engine for exactly
    dur seconds, so its exit lands at the end. Rendered once, then reused."""
    data = {k: (P(v) if k in ("photo", "shot", "src") and isinstance(v, str) and not v.startswith(("http:", "https:", "data:")) else v) for k, v in data.items()}
    ext = "webm" if template == "lower" else "mp4"
    key = json.dumps([MOTION_SIG, CARDS_SIG, template, data, FMT, theme, BRAND, round(dur, 3)], sort_keys=True)
    out = os.path.join(MOTIONS, hashlib.sha1(key.encode()).hexdigest()[:16] + "." + ext)
    if out not in mcache:
        mcache[out] = True
        if not os.path.exists(out):
            mjobs.append({"template": template, "data": data, "format": FMT, "brand": BRAND, "theme": theme, "dur": round(dur, 3), "out": out})
    return out


plan = []          # per segment: base input, overlays
for i, s in enumerate(segs):
    p = {"over": [], "pngs": []}
    if s.get("frame") and s["type"] in ("clip", "image"):
        p["frame_png"], p["box"] = frame_card(s["frame"], s.get("theme", "light"))
    if s["type"] == "card":
        p["base"] = card(s.get("template", "title"), s.get("data", {}), s.get("theme", "light"))
        if s.get("motion", MOTION) and s.get("template", "title") in MOTION_TEMPLATES:
            p["base_motion"] = motion(s.get("template", "title"), s.get("data", {}), s["_dur"], s.get("theme", "light"))
    elif s["type"] == "image" and s.get("caption"):
        # the caption lies over the picture, so the picture can move under it and the words stay still
        p["pngs"].append((card("caption", {"text": s["caption"]}), 0.25, s["_dur"]))
    for o in s.get("over", []):
        o = dict(o)
        if o.get("card"):
            o["_png"] = card(o["card"].get("template", "stat"), o["card"].get("data", {}), o["card"].get("theme", "light"))
            if o["card"].get("template") == "stat" and not o["card"].get("data", {}).get("source"):
                WARN.append(f"segment {i + 1}: a figure over the voice with no source")
        elif o.get("src"):
            o["_src"] = P(o["src"])
            if not os.path.exists(o["_src"]):
                die(f"segment {i + 1}: no file {o['src']}")
            if o.get("frame"):
                o["_frame_png"], o["_box"] = frame_card(o["frame"], o.get("theme", "light"))
        else:
            die(f"segment {i + 1}: a cutaway needs src (a video or picture) or card")
        o["at"], o["dur"] = float(o.get("at", 0)), float(o.get("dur", 3))
        o["dur"] = min(o["dur"], s["_dur"] - o["at"])
        if o["dur"] < 0.5:
            WARN.append(f"segment {i + 1}: a cutaway at {o['at']} s starts after the segment ends ({s['_dur']:.1f} s); left out")
            continue
        p["over"].append(o)
    if s.get("lower"):
        lw = s["lower"]
        la, ld = float(lw.get("at", 0.6)), min(float(lw.get("dur", 4.0)), s["_dur"] - float(lw.get("at", 0.6)))
        lpng = card("lower", {"name": lw.get("name"), "role": lw.get("role")})
        if lw.get("motion", s.get("motion", MOTION)):
            p["lower_motion"] = (motion("lower", {"name": lw.get("name"), "role": lw.get("role")}, ld), la, la + ld, lpng)
        else:
            p["pngs"].append((lpng, la, la + ld))
    if s["type"] == "clip" and s["_audio"] == "voice" and CAPTIONS and s.get("captions", True) and TR:
        for c0, c1, g in caption_chunks(s["_ranges"]):
            words = [x["w"] for x in g]
            if CAP_STYLE == "plain":
                p["pngs"].append((card("caption", {"text": " ".join(words)}), c0, c1))
                continue
            for k, w in enumerate(g):      # one picture per word, lit while it is spoken
                a0 = c0 if k == 0 else max(c0, w["start"])
                a1 = c1 if k == len(g) - 1 else max(a0 + 0.04, g[k + 1]["start"])
                p["pngs"].append((card("caption", {"words": words, "active": k}), a0, min(a1, c1)))
    plan.append(p)

if jobs:
    jf = os.path.join(BUILD, "card-jobs.json")
    json.dump(jobs, open(jf, "w"))
    print(f"cards: {len(jobs)} to draw")
    run(["node", RENDER, jf])
if mjobs:
    jf = os.path.join(BUILD, "motion-jobs.json")
    json.dump(mjobs, open(jf, "w"))
    print(f"motion: {len(mjobs)} to animate (HyperFrames)")
    if subprocess.run(["node", MOTION_JS, jf]).returncode:
        WARN.append("motion: some cards could not be animated, so they stay still (the messages above say why)")

# ---------------------------------------------------------------- picture, one segment at a time
def fit(inp, out, mode, cx=0.5, cy=0.5, margin=0.9, bg="paper", tw=None, th=None):
    """A picture or video fitted to tw x th (the frame, or a browser or phone screen): cover, or contain on paper or blur."""
    tw, th = tw or W, th or H
    tail = f"setsar=1,fps={FPS},format=yuv420p"
    cover = f"scale={tw}:{th}:force_original_aspect_ratio=increase:flags=lanczos,crop={tw}:{th}:(iw-{tw})*{cx}:(ih-{th})*{cy}"
    inner = f"scale={int(tw * margin) // 2 * 2}:{int(th * margin) // 2 * 2}:force_original_aspect_ratio=decrease:flags=lanczos"
    if mode == "cover":
        return f"[{inp}]{cover},{tail}[{out}]"
    if bg == "blur":
        return (f"[{inp}]split[{out}a][{out}b];[{out}a]{cover},boxblur=30:3,eq=brightness=-0.14[{out}bg];[{out}b]{inner}[{out}fg];"
                f"[{out}bg][{out}fg]overlay=(W-w)/2:(H-h)/2,{tail}[{out}]")
    return f"[{inp}]{inner},pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2:color={PAPER},{tail}[{out}]"


def still(inp, out, mode, d, zoom="in", amount=0.06, cx=0.5, cy=0.5, margin=0.88, bg="paper", tw=None, th=None):
    """A picture held for d seconds. With zoom ("in" or "out"), it moves slowly toward or away from its center so a
    photograph or screenshot does not sit dead on screen. The frame is rescaled every frame (not zoompan, which steps
    in whole pixels and shimmers), then cropped back to size."""
    tw, th = tw or W, th or H
    g = fit(inp, f"{out}f", mode, cx, cy, margin, bg, tw, th)
    if not zoom:
        return g.replace(f"[{out}f]", f"[{out}]")
    z0, z1 = (1.0, 1.0 + amount) if zoom != "out" else (1.0 + amount, 1.0)
    ease = f"(0.5-0.5*cos(PI*min(t/{d:.3f},1)))"            # starts and ends gently
    z = f"({z0}+({z1 - z0:.4f})*{ease})"
    return g + (f";[{out}f]scale=w='trunc({tw}*{z}/2)*2':h='trunc({th}*{z}/2)*2':eval=frame:flags=lanczos,"
                f"crop={tw}:{th},setsar=1,fps={FPS},format=yuv420p[{out}]")


IMG_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif")
seg_files = []
for i, (s, p) in enumerate(zip(segs, plan)):
    d = s["_dur"]
    inputs, fc, n = [], [], [0]

    def add(*a):
        inputs.extend(a)
        n[0] += 1
        return n[0] - 1

    def framed(media_label, png, box, dur, out):
        """lay a recording or picture into the screen of a browser or phone frame card"""
        j = add("-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.3f}", "-i", png)
        fc.append(f"[{j}:v]scale={W}:{H},setsar=1,fps={FPS},format=yuv420p[fr{j}];[fr{j}][{media_label}]overlay={box[0]}:{box[1]}[{out}]")

    box = p.get("box")
    tw, th = (box[2], box[3]) if box else (W, H)
    if "base" in p and p.get("base_motion") and os.path.exists(p["base_motion"]):
        j = add("-i", p["base_motion"])
        fc.append(f"[{j}:v]scale={W}:{H},setsar=1,fps={FPS},format=yuv420p,tpad=stop_mode=clone:stop_duration=2[b0]")
    elif "base" in p:
        j = add("-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", p["base"])
        fc.append(f"[{j}:v]scale={W}:{H},setsar=1,fps={FPS},format=yuv420p[b0]")
    else:
        if s["type"] == "image":
            j = add("-loop", "1", "-framerate", str(FPS), "-t", f"{d:.3f}", "-i", s["_src"])
            fc.append(still(f"{j}:v", "m0", s.get("fit", "cover" if box else "contain"), d, s.get("zoom", "in"), float(s.get("zoom_amount", 0.06)),
                            s.get("crop_x", 0.5), s.get("crop_y", 0 if box else 0.5), s.get("margin", 0.88), s.get("bg", "paper"), tw, th))
        else:
            js = [add("-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", s["_src"]) for a, b in s["_ranges"]]
            src = f"{js[0]}:v"
            if len(js) > 1:   # a tightened soundbite: its pieces joined on jump cuts
                fc.append("".join(f"[{j}:v]setpts=PTS-STARTPTS,fps={FPS}[r{j}];" for j in js) + "".join(f"[r{j}]" for j in js) + f"concat=n={len(js)}:v=1:a=0[cat]")
                src = "cat"
            fc.append(fit(src, "m0", s.get("fit", "cover"), s.get("crop_x", 0.5), s.get("crop_y", 0 if box else 0.5), s.get("margin", 0.9), s.get("bg", "paper"), tw, th))
        if box:
            framed("m0", p["frame_png"], box, d, "b0")
        else:
            fc.append("[m0]null[b0]")
    last = "b0"
    for o in p["over"]:
        a, od = o["at"], o["dur"]
        obox = o.get("_box")
        otw, oth = (obox[2], obox[3]) if obox else (W, H)
        if o.get("_png"):
            j = add("-i", o["_png"])
            fc.append(f"[{j}:v]scale={W}:{H},format=yuv420p,setpts=PTS-STARTPTS+{a:.3f}/TB[o{j}]")
        else:
            if o["_src"].lower().endswith(IMG_EXT):
                j = add("-loop", "1", "-framerate", str(FPS), "-t", f"{od:.3f}", "-i", o["_src"])
                fc.append(still(f"{j}:v", f"m{j}", o.get("fit", "cover" if obox else "contain"), od, o.get("zoom", "in"), float(o.get("zoom_amount", 0.06)),
                                0.5, o.get("crop_y", 0 if obox else 0.5), o.get("margin", 0.88), o.get("bg", "paper"), otw, oth))
            elif o.get("overlay"):
                alpha = ["-c:v", "libvpx-vp9"] if o["_src"].lower().endswith(".webm") else []
                j = add(*alpha, "-ss", f"{float(o.get('in', 0)):.3f}", "-t", f"{od:.3f}", "-i", o["_src"])
                fc.append(f"[{j}:v]scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black@0,"
                          f"format=rgba,setpts=PTS-STARTPTS+{a:.3f}/TB[o{j}]")
                fc.append(f"[{last}][o{j}]overlay=0:0:format=auto:eof_action=pass:enable='between(t,{a:.3f},{a + od:.3f})'[v{j}]")
                last = f"v{j}"
                continue
            else:
                j = add("-ss", f"{float(o.get('in', 0)):.3f}", "-t", f"{od:.3f}", "-i", o["_src"])
                fc.append(fit(f"{j}:v", f"m{j}", o.get("fit", "cover" if obox else "contain"), 0.5, o.get("crop_y", 0 if obox else 0.5),
                              o.get("margin", 0.9), o.get("bg", "paper" if obox else "blur"), otw, oth))
            src = f"m{j}"
            if obox:
                framed(src, o["_frame_png"], obox, od, f"c{j}")
                src = f"c{j}"
            fc.append(f"[{src}]setpts=PTS-STARTPTS+{a:.3f}/TB[o{j}]")
        fc.append(f"[{last}][o{j}]overlay=0:0:enable='between(t,{a:.3f},{a + od:.3f})'[v{j}]")
        last = f"v{j}"
    if p.get("lower_motion"):
        webm, a, b, lpng = p["lower_motion"]
        if os.path.exists(webm):
            j = add("-c:v", "libvpx-vp9", "-i", webm)
            fc.append(f"[{j}:v]format=rgba,setpts=PTS-STARTPTS+{a:.3f}/TB[o{j}]")
            fc.append(f"[{last}][o{j}]overlay=0:0:format=auto:eof_action=pass:enable='between(t,{a:.3f},{b:.3f})'[v{j}]")
            last = f"v{j}"
        else:
            p["pngs"].insert(0, (lpng, a, b))
    for png, a, b in p["pngs"]:
        j = add("-i", png)
        fc.append(f"[{j}:v]format=rgba,setpts=PTS-STARTPTS+{a:.3f}/TB[o{j}]")
        fc.append(f"[{last}][o{j}]overlay=0:0:format=auto:enable='between(t,{a:.3f},{b:.3f})'[v{j}]")
        last = f"v{j}"
    fc.append(f"[{last}]format=yuv420p[vout]")
    out = os.path.join(BUILD, f"seg-{i + 1:02d}.mp4")
    run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(fc), "-map", "[vout]", "-t", f"{d:.3f}",
         "-r", str(FPS), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "15", "-pix_fmt", "yuv420p", out])
    seg_files.append(out)
    label = s.get("label") or (s.get("from") and f"{s['from']}" + (f"-{s['to']}" if s.get("to") else "")) or s.get("template") or os.path.basename(s.get("src", ""))
    print(f"  {i + 1:2d}  {s['type']:5s} {d:5.2f} s  {label}")

# ---------------------------------------------------------------- the segments joined with their transitions
video = os.path.join(BUILD, "picture.mp4")
inp, fc = [], []
for i, f in enumerate(seg_files):
    inp += ["-i", f]
    fc.append(f"[{i}:v]settb=AVTB,fps={FPS},format=yuv420p,setsar=1[s{i}]")
prev = "s0"
for i in range(1, len(seg_files)):
    tr = segs[i].get("transition", "fade")
    fc.append(f"[{prev}][s{i}]xfade=transition={'fadeblack' if tr == 'fadeblack' else 'fade'}:duration={xf[i]:.3f}:offset={starts[i]:.3f}[x{i}]")
    prev = f"x{i}"
fc.append(f"[{prev}]fade=t=in:st=0:d=0.3,fade=t=out:st={max(0, TOTAL - 0.5):.3f}:d=0.5[vout]")
run(["ffmpeg", "-y", "-v", "error", *inp, "-filter_complex", ";".join(fc), "-map", "[vout]", "-c:v", "libx264", "-preset", "medium",
     "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(FPS), video])

# ---------------------------------------------------------------- sound, placed sample-exact
N = int(round(TOTAL * SR))


def ff_audio(inputs, af):
    raw = run(["ffmpeg", "-v", "error", *inputs, "-af", f"aresample={SR},{af},aresample={SR}", "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"]).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def fade(x, fin, fout):
    n_in, n_out = min(len(x), int(fin * SR)), min(len(x), int(fout * SR))
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    if n_out:
        x[-n_out:] *= np.linspace(1, 0, n_out)[:, None]
    return x


def place(buf, x, at):
    s0 = int(round(at * SR))
    if s0 >= N:
        return
    n = min(len(x), N - s0)
    buf[s0:s0 + n] += x[:n]


def lufs(x):
    path = os.path.join(BUILD, "measure.wav")
    run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", path], input=x.astype(np.float32).tobytes())
    err = subprocess.run(["ffmpeg", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    return float(m[-1]) if m else -70.0


speech = np.zeros((N, 2), np.float32)
windows = []
for i, s in enumerate(segs):
    mode = s["_audio"]
    if s["type"] == "clip" and mode in ("voice", "room", "keep"):
        if not has_audio(s["_src"]):
            if mode != "room":
                WARN.append(f"segment {i + 1}: {s['src']} has no sound")
        else:
            off = 0.0
            for k, (a, b) in enumerate(s["_ranges"]):
                x = ff_audio(["-ss", f"{a:.3f}", "-t", f"{b - a:.3f}", "-i", s["_src"]], {"voice": VOICE, "room": ROOM, "keep": KEEP}[mode])
                x = x[: int((b - a) * SR)]
                first, last_ = k == 0, k == len(s["_ranges"]) - 1
                x = fade(x, 0.03 if first else 0.012, 0.12 if last_ else 0.012) if mode == "voice" else fade(x, 0.3 if first else 0.02, 0.3 if last_ else 0.02)
                place(speech, x, starts[i] + off)
                off += b - a
            if mode == "voice":
                windows.append((starts[i], starts[i] + s["_dur"]))
    if s.get("_vo"):
        at = starts[i] + s.get("vo_at", 0.25)
        x = fade(ff_audio(["-i", s["_vo"]], VO), 0.01, 0.05)
        place(speech, x, at)
        windows.append((at, at + len(x) / SR))

mix = speech
music_note = "no music"
if spec.get("music"):
    m = spec["music"]
    mf = P(m["file"])
    if not os.path.exists(mf):
        WARN.append(f"no music file {m['file']}: rendered without music (see music/README.md)")
    else:
        mus = ff_audio(["-ss", str(m.get("start", 0)), "-i", mf], "anull")
        XF = int(1.5 * SR)
        while len(mus) < N + SR:                        # loop a short track, crossfading each join
            ramp = np.linspace(0, 1, XF)[:, None]
            mus = np.concatenate([mus[:-XF], mus[-XF:] * (1 - ramp) + mus[:XF] * ramp, mus[XF:]])
        mus = mus[:N]
        mus *= 10 ** ((float(m.get("level", -21)) - lufs(mus)) / 20)
        tt = np.arange(N) / SR
        env, R = np.zeros(N), 0.3
        for a, b in windows:
            env = np.maximum(env, np.clip((tt - (a - R)) / R, 0, 1) * np.clip(((b + R) - tt) / R, 0, 1))
        gain = (1 - float(m.get("duck", 0.88)) * env) * np.clip(tt / 0.8, 0, 1) * np.clip((TOTAL - tt) / 1.5, 0, 1)
        mix = speech + mus * gain[:, None].astype(np.float32)
        music_note = f"music {os.path.basename(mf)} at {m.get('level', -21)} LUFS, ducked under {len(windows)} line(s)"
        if not m.get("credit"):
            WARN.append("the music has no credit: record its license and credit in the cut (music.credit) and in your post")

target = float(spec.get("loudness", -14))
now = lufs(mix)
if now > -60:
    mix *= 10 ** ((target - now) / 20)
apath = os.path.join(BUILD, "mix.wav")
run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "alimiter=limit=0.89:level=false", apath],
    input=mix.astype(np.float32).tobytes())
run(["ffmpeg", "-v", "error", "-y", "-i", video, "-i", apath, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
     "-movflags", "+faststart", "-shortest", OUT])

timeline = [{"n": i + 1, "type": s["type"], "start": round(starts[i], 3), "end": round(starts[i] + durs[i], 3),
             "label": s.get("label") or s.get("from") or s.get("template") or s.get("src")} for i, s in enumerate(segs)]
json.dump({"format": FMT, "duration": round(TOTAL, 3), "segments": timeline}, open(os.path.join(BUILD, "timeline.json"), "w"), indent=1)

# ---------------------------------------------------------------- a contact sheet, to check by eye before anyone posts
if "--proof" in args:
    pts = []
    for i, s in enumerate(segs):
        pts.append(starts[i] + durs[i] * 0.55)
        pts += [starts[i] + o["at"] + o["dur"] / 2 for o in plan[i]["over"]]
    tw = 270 if FMT == "9x16" else 480
    frames = []
    for f in os.listdir(BUILD):
        if f.startswith("proof-"):
            os.remove(os.path.join(BUILD, f))
    for k, ts in enumerate(pts):
        f = os.path.join(BUILD, f"proof-{k:02d}.png")
        run(["ffmpeg", "-y", "-v", "error", "-ss", f"{ts:.3f}", "-i", OUT, "-frames:v", "1", "-vf", f"scale={tw}:-2", f])
        frames.append(f)
    cols = min(len(frames), 6 if FMT == "9x16" else 4)
    rows = -(-len(frames) // cols)
    sheet = os.path.splitext(OUT)[0] + "-proof.jpg"
    run(["ffmpeg", "-y", "-v", "error", "-framerate", "1", "-i", os.path.join(BUILD, "proof-%02d.png"), "-vf",
         f"tile={cols}x{rows}:padding=8:margin=8:color=white", "-frames:v", "1", "-update", "1", "-q:v", "3", sheet])
    print(f"proof: {os.path.relpath(sheet)}")

print(f"✓ {os.path.relpath(OUT)}  {W}x{H}, {TOTAL:.1f} s, {target:g} LUFS; {music_note}")
for w in WARN:
    print(f"! {w}")
