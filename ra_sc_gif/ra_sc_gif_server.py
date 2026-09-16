"""Small HTTP service that renders the HTML dice animation as a GIF.

The browser version uses a canvas and gifshot.  This service keeps the same
visual timeline (3.4 s, reveal at 75%) but draws with Pillow, so it can run on
a headless SealDice host.  The final frame uses GIF's 16-bit centisecond delay
field (270 seconds by default); no hundreds of duplicate frames are needed.
"""
from __future__ import annotations

import base64
import io
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

HOST = os.getenv("RA_SC_GIF_HOST", "127.0.0.1")
PORT = int(os.getenv("RA_SC_GIF_PORT", "3892"))
PUBLIC_BASE = os.getenv("RA_SC_GIF_PUBLIC_BASE", "").rstrip("/")
TAIL_SECONDS = max(270, min(655, int(os.getenv("RA_SC_GIF_TAIL_SECONDS", "300"))))
DEBUG_EVENTS = os.getenv("RA_SC_GIF_DEBUG_EVENTS", "0").strip().lower() in {"1", "true", "yes", "on"}
FRAME_COUNT = 35
# The first FRAME_COUNT - 1 frames are the animated prelude.  The final frame
# carries the long tail, so callers can wait for this value before sending
# follow-up text.
PRELUDE_SECONDS = (FRAME_COUNT - 1) * 0.1
WIDTH = HEIGHT = 400
HTML_TEMPLATE = Path(__file__).resolve().parent / "assets" / "animation_template.html"
NODE_PATH = os.getenv("RA_SC_GIF_NODE_PATH", "")
RENDERER_NAME = "html-canvas" if HTML_TEMPLATE.exists() and (NODE_PATH or shutil.which("node") or Path(r"C:\Users\11209\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe").exists()) else "pillow-fallback"
STORE: dict[str, tuple[bytes, float]] = {}
LOCK = threading.Lock()
EVENTS: list[dict[str, Any]] = []


def _font(size: int, bold: bool = False):
    candidates = [
        os.getenv("RA_SC_GIF_FONT", ""),
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if path and Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


def _clamp_num(value: Any, default: float = 0) -> float:
    try:
        result = float(value)
        return result if result == result else default
    except (TypeError, ValueError):
        return default


def classify(result: int, target: int, mode: str = "coc") -> tuple[str, str, str]:
    if mode == "dnd":
        if result == 20:
            return "crit", "天然 20（大成功）", "#f59e0b"
        if result == 1:
            return "fumble", "天然 1（大失败）", "#ef4444"
        return ("success", "检定通过", "#10b981") if result >= target else ("fail", "检定失败", "#f43f5e")
    if result == 1:
        return "crit", "大成功", "#f59e0b"
    if result == 100 or (target < 50 and result >= 96):
        return "fumble", "大失败", "#ef4444"
    if result <= target // 5:
        return "extreme", "极难成功", "#a855f7"
    if result <= target // 2:
        return "hard", "困难成功", "#38bdf8"
    if result <= target:
        return "success", "普通成功", "#10b981"
    return "fail", "失败", "#f43f5e"


def normalize(payload: dict[str, Any]) -> dict[str, Any]:
    mode = str(payload.get("mode", "coc")).lower()
    mode = mode if mode in {"coc", "dnd", "sc", "multi", "single"} else "coc"
    requested_sides = int(_clamp_num(payload.get("sides"), 20 if mode == "dnd" else 100))
    # The renderer has finite sector labels; preserve ordinary dice faces and
    # deliberately fall back to D100 for unusual faces such as D121.
    display_sides = requested_sides if 2 <= requested_sides <= 100 else 100
    dice_count = max(1, min(20, int(_clamp_num(payload.get("dice_count"), 1))))
    result_limit = 100 if mode in {"coc", "sc"} else 20
    if mode == "multi":
        result_limit = 10000
    if mode == "single":
        result_limit = display_sides * dice_count
    result = int(max(1, min(result_limit, _clamp_num(payload.get("result"), 1))))
    target = int(max(1, min(result_limit, _clamp_num(payload.get("target"), display_sides))))
    rank, rank_text, color = classify(result, target, "dnd" if mode == "dnd" else "coc")
    supplied = str(payload.get("rank", "")).lower()
    if supplied in {"crit", "fumble", "extreme", "hard", "success", "fail"}:
        rank = supplied
    return {
        "mode": mode, "skill": str(payload.get("skill") or ("San 检定" if mode == "sc" else "检定"))[:40],
        "target": target, "result": result, "rank": rank,
        "rank_text": str(payload.get("rank_text") or rank_text)[:40], "color": color,
        "style": str(payload.get("style", "dice")).lower() if str(payload.get("style", "dice")).lower() in {"dice", "roulette", "slot"} else "dice",
        "bonus": int(_clamp_num(payload.get("bonus"), 0)),
        "bp": str(payload.get("bp") or payload.get("advantage") or ""),
        "expression": str(payload.get("expression") or ""),
        "sides": display_sides,
        "dice_count": dice_count,
    }


def _html_config(cfg: dict[str, Any]) -> dict[str, Any]:
    """Adapt the API's compact payload to the exact rollConfig used by HTML."""
    mode = cfg["mode"]
    result, target, sides = cfg["result"], cfg["target"], cfg["sides"]
    dice: list[dict[str, Any]] = []
    if mode in {"coc", "sc"}:
        tens = (result // 10) * 10 if result < 100 else 0
        units = result % 10 if result < 100 else 0
        bp = str(cfg.get("bp") or "").lower()
        count = 1 + (int(bp[1:] or 1) if bp[:1] in {"b", "p"} else 0)
        count = max(1, min(3, count))
        tens_values = [tens] + [((tens + (i + 1) * 30) % 100) for i in range(count - 1)]
        chosen = 0
        if bp[:1] == "b": chosen = min(range(count), key=lambda i: tens_values[i] + units)
        elif bp[:1] == "p": chosen = max(range(count), key=lambda i: tens_values[i] + units)
        dice = [{"type": "d10", "label": "十位" if count == 1 else f"十位#{i + 1}", "value": value,
                 "display": "00" if value == 0 else str(value),
                 "sectors": 10, "sectorItems": ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"],
                 "chosenIdx": (value // 10) % 10, "isTens": True, "isChosen": i == chosen,
                 "isDiscarded": i != chosen} for i, value in enumerate(tens_values)]
        dice.append({"type": "d10", "label": "个位", "value": units, "display": str(units), "sectors": 10,
                 "sectorItems": list(map(str, range(10))), "chosenIdx": units, "isTens": False,
                 "isChosen": True, "isDiscarded": False})
    elif mode == "dnd":
        v = max(1, min(20, result))
        dice = [{"type": "d20", "label": "D20", "value": v, "display": str(v), "sectors": 20,
                 "sectorItems": list(map(str, range(1, 21))), "chosenIdx": v - 1,
                 "isChosen": True, "isDiscarded": False}]
    elif mode == "multi":
        expr = str(cfg.get("expression") or "")
        vals = [int(x) for x in re.findall(r"[dD](\d+)", expr)] or [6] * cfg.get("dice_count", 1)
        remaining = result - int(cfg.get("bonus", 0))
        for idx, maxv in enumerate(vals[:8]):
            value = max(1, min(maxv, int(round(remaining / max(1, len(vals) - idx)))))
            remaining -= value
            dice.append({"type": f"d{maxv}" if maxv in {2, 3, 4, 6, 8, 10, 12, 20} else "d6",
                         "label": f"D{maxv}#{idx + 1}", "value": value, "display": str(value), "sectors": maxv,
                         "sectorItems": list(map(str, range(1, maxv + 1))), "chosenIdx": value - 1,
                         "isChosen": True, "isDiscarded": False})
    else:
        # Ordinary .r expressions may contain multiple dice.  Reconstruct a
        # stable per-die presentation from the reported total; the core's
        # result remains authoritative while HTML receives one wheel/crystal
        # for each die just like its multi mode.
        expr = str(cfg.get("expression") or "")
        m = re.match(r"(\d*)[dD](\d+)", expr)
        count = max(1, int(m.group(1) or 1)) if m else max(1, int(cfg.get("dice_count", 1)))
        face_count = int(m.group(2)) if m else sides
        face_count = face_count if 2 <= face_count <= 100 else 100
        total = max(count, min(count * face_count, int(result)))
        values = [1] * count
        rem = total - count
        for i in range(count):
            add = min(face_count - 1, rem)
            values[i] += add; rem -= add
        shape = f"d{face_count}" if face_count in {2, 3, 4, 6, 8, 10, 12, 20} else "d6"
        items = ["正", "反"] if face_count == 2 else list(map(str, range(1, face_count + 1)))
        for idx, value in enumerate(values):
            display = ("正" if value == 1 else "反") if face_count == 2 else str(value)
            dice.append({"type": shape, "label": shape.upper() + (f"#{idx + 1}" if count > 1 else ""),
                         "value": value, "display": display, "sectors": face_count,
                         "sectorItems": items, "chosenIdx": value - 1,
                         "isChosen": True, "isDiscarded": False})
    return {"mode": "coc" if mode == "sc" else mode, "title": cfg["skill"], "target": target,
            "diceList": dice, "modifier": int(cfg.get("bonus", 0)), "finalTotal": result,
            "rankType": cfg["rank"], "rankText": cfg["rank_text"], "targetColor": cfg["color"]}


def _hex(rgb: str) -> tuple[int, int, int]:
    rgb = rgb.lstrip("#")
    return tuple(int(rgb[i:i + 2], 16) for i in (0, 2, 4))


def _mix(a: str, b: str, p: float) -> tuple[int, int, int]:
    x, y = _hex(a), _hex(b)
    return tuple(round(x[i] + (y[i] - x[i]) * p) for i in range(3))


def draw_frame(cfg: dict[str, Any], p: float) -> Image.Image:
    im = Image.new("RGB", (WIDTH, HEIGHT), "#03060c")
    d = ImageDraw.Draw(im)
    color = cfg["color"] if p >= .85 else "#94a3b8" if p < .65 else "#" + "%02x%02x%02x" % _mix("#94a3b8", cfg["color"], (p - .65) / .2)
    accent = _hex(color)
    title = f"【海豹骰】{cfg['skill']}"
    d.rectangle((20, 16, 380, 52), fill="#070a12", outline="#1e293b", width=2)
    d.text((200, 34), title, fill="#cbd5e1", anchor="mm", font=_font(14, True))
    cx, cy = 200, 215
    if cfg["style"] == "roulette":
        r = 105
        d.ellipse((cx-r, cy-r, cx+r, cy+r), fill="#0f172a", outline=accent, width=5)
        n = 10 if cfg["mode"] in {"coc", "sc"} else 20
        for i in range(n):
            import math
            a = 2 * math.pi * i / n - math.pi / 2
            x, y = cx + int((r - 20) * math.cos(a)), cy + int((r - 20) * math.sin(a))
            d.text((x, y), str(i * (10 if n == 10 else 1)), fill="#94a3b8", anchor="mm", font=_font(10))
        d.ellipse((cx-38, cy-38, cx+38, cy+38), fill="#070a12", outline=accent, width=3)
        d.text((cx, cy), str(cfg["result"]), fill=accent, anchor="mm", font=_font(28, True))
        d.polygon((cx-8, cy-r-15, cx+8, cy-r-15, cx, cy-r+8), fill=accent)
    elif cfg["style"] == "slot":
        d.rectangle((50, 105, 350, 315), fill="#0b1120", outline=accent, width=4)
        vals = [str(cfg["result"])] + ([str(cfg["target"])] if cfg["bonus"] else [])
        for i, val in enumerate(vals):
            x0 = 65 + i * 140
            d.rectangle((x0, 140, x0 + 120, 280), fill="#070d1a", outline="#1e293b", width=2)
            d.text((x0 + 60, 210), val, fill=accent if p >= .75 else "#f8fafc", anchor="mm", font=_font(34, True))
        d.line((55, 210, 345, 210), fill=accent, width=3)
    else:
        r = 82
        d.polygon([(cx, cy-r-22), (cx+r, cy), (cx, cy+r+22), (cx-r, cy)], fill="#172554", outline=accent)
        d.polygon([(cx, cy-r-22), (cx+18, cy), (cx, cy+r+22), (cx-18, cy)], fill="#1e3a8a", outline="#38bdf8")
        d.text((cx, cy), str(cfg["result"]), fill=accent, anchor="mm", font=_font(32, True))
        d.text((cx, cy+r+42), "D" + str(cfg.get("sides", 100 if cfg["mode"] in {"coc", "sc"} else 20)), fill="#94a3b8", anchor="mm", font=_font(14, True))
    if p >= .75:
        d.rectangle((8, 8, 392, 392), outline=accent, width=5)
        d.rectangle((25, 335, 375, 380), fill="#070a12", outline=accent, width=2)
        summary = f"{cfg['result']} / {cfg['target']}  【{cfg['rank_text']}】"
        d.text((200, 358), summary, fill=accent, anchor="mm", font=_font(15, True))
        if cfg["rank"] in {"crit", "extreme"}:
            for i in range(8):
                import math
                a = i * math.pi / 4
                d.line((cx, cy, cx + int(180 * math.cos(a)), cy + int(180 * math.sin(a))), fill=accent, width=2)
        elif cfg["rank"] == "fumble":
            for i in range(6):
                d.line((cx, cy, 40 + i * 65, 80 + (i % 2) * 230), fill="#ef4444", width=2)
    return im


def _node_executable() -> str | None:
    # Prefer the bundled runtime because it ships Playwright; the system Node
    # installation often has no module path and would force the slow one-shot
    # Chrome fallback for every frame.
    candidates = [NODE_PATH,
                  r"C:\Users\11209\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
                  shutil.which("node")]
    return next((p for p in candidates if p and Path(p).exists()), None)


def render_html_gif(cfg: dict[str, Any]) -> bytes | None:
    """Render frames by executing the original HTML Canvas implementation."""
    node = _node_executable()
    if not node or not HTML_TEMPLATE.exists():
        return None
    temp_root = Path(tempfile.mkdtemp(prefix="ra_sc_gif_"))
    try:
        inp = {"htmlPath": str(HTML_TEMPLATE), "outDir": str(temp_root),
               "frameCount": FRAME_COUNT, "config": {**_html_config(cfg), "style": cfg["style"]}}
        node_modules = Path(os.getenv("RA_SC_GIF_NODE_MODULES", r"C:\Users\11209\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"))
        proc = subprocess.run([node, str(Path(__file__).with_name("render_html_frames.js"))],
                              input=__import__("json").dumps(inp), text=True,
                              capture_output=True, timeout=45,
                              env={**os.environ, "NODE_PATH": os.getenv("NODE_PATH", str(node_modules)),
                                   "RA_SC_GIF_CHROME": os.getenv("RA_SC_GIF_CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")})
        if proc.returncode != 0:
            _event("html-render-fallback", error=(proc.stderr or proc.stdout)[-1000:])
            return None
        frame_paths = sorted(temp_root.glob("frame_*.png"))
        if len(frame_paths) != FRAME_COUNT:
            _event("html-render-fallback", error=f"expected {FRAME_COUNT} frames, got {len(frame_paths)}")
            return None
        frames = [Image.open(p).convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS) for p in frame_paths]
        out = io.BytesIO()
        frames[0].save(out, format="GIF", save_all=True, append_images=frames[1:],
                       duration=[100] * (len(frames) - 1) + [TAIL_SECONDS * 1000],
                       loop=0, optimize=True, disposal=2)
        return out.getvalue()
    except Exception as exc:
        _event("html-render-fallback", error=str(exc)[:240])
        return None
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def render_gif(payload: dict[str, Any]) -> bytes:
    cfg = normalize(payload)
    html_result = render_html_gif(cfg)
    if html_result:
        return html_result
    frames = [draw_frame(cfg, i / (FRAME_COUNT - 1)) for i in range(FRAME_COUNT)]
    out = io.BytesIO()
    frames[0].save(out, format="GIF", save_all=True, append_images=frames[1:], duration=[100] * (len(frames) - 1) + [TAIL_SECONDS * 1000], loop=0, optimize=True, disposal=2)
    return out.getvalue()


def _prune() -> None:
    now = time.time()
    with LOCK:
        for key, (_, expiry) in list(STORE.items()):
            if expiry < now:
                STORE.pop(key, None)


def _event(stage: str, **values: Any) -> None:
    if not DEBUG_EVENTS:
        return
    item = {"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "stage": stage, **values}
    with LOCK:
        EVENTS.append(item)
        del EVENTS[:-100:]
    print("[ra-sc-gif] " + __import__("json").dumps(item, ensure_ascii=False), flush=True)


class Handler(BaseHTTPRequestHandler):
    def _json(self, status: int, body: dict[str, Any]) -> None:
        raw = __import__("json").dumps(body, ensure_ascii=False).encode()
        self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(raw))); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers(); self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204); self.send_header("Access-Control-Allow-Origin", "*"); self.send_header("Access-Control-Allow-Headers", "Content-Type"); self.end_headers()

    def do_GET(self):
        _prune()
        if self.path == "/health":
            with LOCK: count = len(EVENTS)
            return self._json(200, {"ok": True, "service": "ra-sc-gif", "tailSeconds": TAIL_SECONDS, "preludeSeconds": PRELUDE_SECONDS, "events": count,
                                    "renderer": RENDERER_NAME})
        if self.path == "/api/debug":
            with LOCK: recent = list(EVENTS[-20:])
            return self._json(200, {"ok": True, "service": "ra-sc-gif", "debugEvents": DEBUG_EVENTS, "tailSeconds": TAIL_SECONDS, "preludeSeconds": PRELUDE_SECONDS, "events": recent})
        match = re.match(r"^/api/gif/([a-f0-9]{24})$", self.path)
        if match:
            entry = STORE.get(match.group(1))
            if not entry: return self._json(404, {"ok": False, "error": "expired"})
            raw = entry[0]; self.send_response(200); self.send_header("Content-Type", "image/gif"); self.send_header("Content-Length", str(len(raw))); self.send_header("Cache-Control", "private, max-age=300"); self.end_headers(); self.wfile.write(raw); return
        self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path != "/api/roll-gif": return self._json(404, {"ok": False, "error": "not found"})
        try:
            import json
            length = int(self.headers.get("Content-Length", "0")); payload = json.loads(self.rfile.read(min(length, 256 * 1024)) or b"{}")
            request_id = secrets.token_hex(6)
            _event("request", requestId=request_id, mode=payload.get("mode"), skill=payload.get("skill"), result=payload.get("result"), target=payload.get("target"), style=payload.get("style", "dice"))
            started = time.time(); raw = render_gif(payload); key = secrets.token_hex(12)
            _event("rendered", requestId=request_id, bytes=len(raw), elapsedMs=round((time.time() - started) * 1000, 1))
            with LOCK: STORE[key] = (raw, time.time() + 600)
            url = f"{PUBLIC_BASE}/api/gif/{key}" if PUBLIC_BASE else f"http://{HOST}:{PORT}/api/gif/{key}"
            self._json(200, {"ok": True, "mime": "image/gif", "url": url, "data": base64.b64encode(raw).decode("ascii"), "tailSeconds": TAIL_SECONDS, "preludeSeconds": PRELUDE_SECONDS,
                             "renderer": RENDERER_NAME})
        except Exception as exc:
            _event("error", error=str(exc)[:240])
            self._json(400, {"ok": False, "error": str(exc)[:240]})


if __name__ == "__main__":
    print(f"ra/sc GIF server listening on http://{HOST}:{PORT} (tail={TAIL_SECONDS}s)")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
