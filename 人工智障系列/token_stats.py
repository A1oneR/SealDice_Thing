"""Thread-safe Token usage ledger and ranking image renderer for LogAI."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import re
import threading
from collections import defaultdict
from io import BytesIO
from typing import Any

from PIL import Image, ImageDraw, ImageFont


MODULE_LABELS = {
    "log_analyze": "Log 分析",
    "log_recap": "前文回顾",
    "module_analyze": "模组分析",
    "module_prepare": "模组备团",
    "module_refine": "模组完善",
    "sheet_score": "角色卡分析",
    "translate": "模组翻译",
    "session_review": "跑团复盘",
    "other": "其他调用",
}


def module_from_mode(mode: str) -> str:
    value = str(mode or "").strip().lower()
    return {
        "analyze": "module_analyze",
        "prepare": "module_prepare",
        "refine": "module_refine",
        "log_analyze": "log_analyze",
        "log_recap": "log_recap",
        "recap": "log_recap",
        "sheet_score": "sheet_score",
    }.get(value, value if value in MODULE_LABELS else "other")


def _safe_text(value: Any, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def prompt_excerpt(prompt: Any, limit: int = 72) -> str:
    text = _safe_text(prompt, 4000)
    text = re.sub(r"【[^】]{1,30}】", "", text)
    text = re.sub(r"^(?:你是|请|当前|极其重要).{0,12}", "", text)
    text = re.sub(r"\s+", " ", text).strip(" ：:，,。")
    return text[:limit] or "默认提示词"


def _usage_value(usage: Any, *names: str) -> int | None:
    for name in names:
        value = usage.get(name) if isinstance(usage, dict) else getattr(usage, name, None)
        try:
            if value is not None:
                return max(0, int(value))
        except (TypeError, ValueError):
            continue
    return None


def extract_usage(response: Any, messages: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    usage = response.get("usage") if isinstance(response, dict) else getattr(response, "usage", None)
    prompt = _usage_value(usage, "prompt_tokens", "input_tokens") if usage is not None else None
    completion = _usage_value(usage, "completion_tokens", "output_tokens") if usage is not None else None
    total = _usage_value(usage, "total_tokens") if usage is not None else None
    estimated = prompt is None and completion is None and total is None
    if estimated:
        input_text = json.dumps(messages or [], ensure_ascii=False, default=str)
        if isinstance(response, dict):
            output_text = str((((response.get("choices") or [{}])[0].get("message") or {}).get("content") or ""))
        else:
            choices = getattr(response, "choices", None) or []
            output_text = str(getattr(getattr(choices[0], "message", None), "content", "") if choices else "")
        prompt = max(1, (len(input_text) + 2) // 3)
        completion = max(1, (len(output_text) + 2) // 3)
        total = prompt + completion
    else:
        prompt = prompt or max(0, (total or 0) - (completion or 0))
        completion = completion or max(0, (total or 0) - prompt)
        total = total or prompt + completion
    return {
        "prompt_tokens": int(prompt),
        "completion_tokens": int(completion),
        "total_tokens": int(total),
        "estimated": estimated,
    }


class TokenLedger:
    def __init__(self, path: str):
        self.path = os.path.realpath(path)
        self._lock = threading.RLock()
        os.makedirs(os.path.dirname(self.path), exist_ok=True)

    def record(
        self,
        response: Any,
        messages: list[dict[str, Any]] | None = None,
        *,
        user_key: str = "",
        user_name: str = "",
        group_key: str = "",
        module: str = "other",
        model: str = "",
        prompt_name: str = "",
        prompt: str = "",
        job_id: str = "",
    ) -> dict[str, Any]:
        usage = extract_usage(response, messages)
        excerpt = prompt_excerpt(prompt)
        normalized_prompt = re.sub(r"\s+", " ", str(prompt or "")).strip()
        record = {
            "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
            "user_key": _safe_text(user_key, 64),
            "user_name": _safe_text(user_name, 80),
            "group_key": _safe_text(group_key, 64),
            "module": module_from_mode(module),
            "model": _safe_text(model, 128),
            "prompt_name": _safe_text(prompt_name, 80) or "默认提示词",
            "prompt_excerpt": excerpt,
            "prompt_key": hashlib.sha256(normalized_prompt.encode("utf-8")).hexdigest()[:16],
            "job_id": _safe_text(job_id, 80),
            **usage,
        }
        with self._lock:
            with open(self.path, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
        return record

    def _records(self, days: int | None = 30) -> list[dict[str, Any]]:
        if not os.path.exists(self.path):
            return []
        cutoff = None
        if days and days > 0:
            cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
        records = []
        with self._lock:
            with open(self.path, "r", encoding="utf-8") as handle:
                for line in handle:
                    try:
                        item = json.loads(line)
                        timestamp = dt.datetime.fromisoformat(str(item.get("timestamp", "")).replace("Z", "+00:00"))
                        if cutoff and timestamp < cutoff:
                            continue
                        records.append(item)
                    except (ValueError, TypeError, json.JSONDecodeError):
                        continue
        return records

    def summary(self, days: int | None = 30, limit: int = 15) -> dict[str, Any]:
        records = self._records(days)
        users: dict[str, dict[str, Any]] = {}
        modules: dict[str, dict[str, Any]] = {}
        prompts: dict[str, dict[str, Any]] = {}
        estimated_tokens = 0
        for item in records:
            total = int(item.get("total_tokens", 0) or 0)
            prompt_tokens = int(item.get("prompt_tokens", 0) or 0)
            completion_tokens = int(item.get("completion_tokens", 0) or 0)
            if item.get("estimated"):
                estimated_tokens += total

            user_key = str(item.get("user_key") or "未归属")
            user = users.setdefault(user_key, {
                "key": user_key,
                "name": str(item.get("user_name") or ("未归属" if user_key == "未归属" else user_key)),
                "calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
            })
            if item.get("user_name"):
                user["name"] = str(item["user_name"])
            for key, value in (("calls", 1), ("prompt_tokens", prompt_tokens), ("completion_tokens", completion_tokens), ("total_tokens", total)):
                user[key] += value

            module_key = module_from_mode(item.get("module", "other"))
            module = modules.setdefault(module_key, {
                "key": module_key, "name": MODULE_LABELS.get(module_key, module_key),
                "calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0,
            })
            for key, value in (("calls", 1), ("prompt_tokens", prompt_tokens), ("completion_tokens", completion_tokens), ("total_tokens", total)):
                module[key] += value

            prompt_key = f"{module_key}:{item.get('prompt_key') or item.get('prompt_name')}"
            prompt_row = prompts.setdefault(prompt_key, {
                "module": MODULE_LABELS.get(module_key, module_key),
                "name": str(item.get("prompt_name") or "默认提示词"),
                "excerpt": str(item.get("prompt_excerpt") or "默认提示词"),
                "calls": 0, "total_tokens": 0,
            })
            prompt_row["calls"] += 1
            prompt_row["total_tokens"] += total

        sort_rows = lambda rows: sorted(rows, key=lambda row: (-row["total_tokens"], -row["calls"], row["name"]))[:limit]
        prompt_rows = sorted(prompts.values(), key=lambda row: (-row["calls"], -row["total_tokens"], row["name"]))[:limit]
        return {
            "days": days or 0,
            "calls": len(records),
            "total_tokens": sum(int(item.get("total_tokens", 0) or 0) for item in records),
            "estimated_tokens": estimated_tokens,
            "users": sort_rows(list(users.values())),
            "modules": sort_rows(list(modules.values())),
            "prompts": prompt_rows,
        }


def _load_fonts(font_path: str) -> dict[str, ImageFont.FreeTypeFont | ImageFont.ImageFont]:
    try:
        return {
            "title": ImageFont.truetype(font_path, 42),
            "head": ImageFont.truetype(font_path, 28),
            "body": ImageFont.truetype(font_path, 24),
            "small": ImageFont.truetype(font_path, 20),
        }
    except (OSError, IOError):
        fallback = ImageFont.load_default()
        return {"title": fallback, "head": fallback, "body": fallback, "small": fallback}


def _fmt_tokens(value: int) -> str:
    if value >= 1_000_000:
        return f"{value / 1_000_000:.2f}M"
    if value >= 1_000:
        return f"{value / 1_000:.1f}K"
    return str(value)


def _save_image(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def _ranking_image(summary: dict[str, Any], rows: list[dict[str, Any]], title: str, font_path: str) -> bytes:
    fonts = _load_fonts(font_path)
    height = max(720, 260 + max(1, len(rows)) * 66)
    image = Image.new("RGB", (1200, height), "#101722")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((35, 30, 1165, height - 30), radius=28, fill="#172231", outline="#30445c", width=2)
    draw.text((75, 65), title, font=fonts["title"], fill="#f4d58d")
    period = "全部记录" if not summary["days"] else f"近 {summary['days']} 天"
    subtitle = f"{period} · {summary['calls']} 次调用 · {_fmt_tokens(summary['total_tokens'])} Tokens"
    draw.text((77, 125), subtitle, font=fonts["small"], fill="#9fb3c8")
    if summary["estimated_tokens"]:
        draw.text((770, 125), f"含估算 {_fmt_tokens(summary['estimated_tokens'])}", font=fonts["small"], fill="#e9a66f")
    if not rows:
        draw.text((75, 235), "暂无 Token 使用记录", font=fonts["head"], fill="#b8c7d9")
        return _save_image(image)

    max_tokens = max(row["total_tokens"] for row in rows) or 1
    start_y = 195
    for index, row in enumerate(rows, 1):
        y = start_y + (index - 1) * 66
        draw.text((78, y + 8), f"{index:02d}", font=fonts["body"], fill="#6ea8d9")
        label = _safe_text(row.get("name"), 22) or "匿名用户"
        draw.text((135, y + 8), label, font=fonts["body"], fill="#eef4fa")
        bar_x, bar_y, bar_w = 500, y + 14, 390
        draw.rounded_rectangle((bar_x, bar_y, bar_x + bar_w, bar_y + 20), radius=10, fill="#26384d")
        fill_w = max(8, int(bar_w * row["total_tokens"] / max_tokens))
        draw.rounded_rectangle((bar_x, bar_y, bar_x + fill_w, bar_y + 20), radius=10, fill="#4f9dd8")
        draw.text((915, y + 6), _fmt_tokens(row["total_tokens"]), font=fonts["body"], fill="#f4d58d")
        draw.text((1035, y + 10), f"{row['calls']} 次", font=fonts["small"], fill="#9fb3c8")
    return _save_image(image)


def _module_image(summary: dict[str, Any], font_path: str) -> bytes:
    fonts = _load_fonts(font_path)
    modules = summary["modules"]
    prompts = summary["prompts"][:8]
    height = max(900, 310 + len(modules) * 62 + len(prompts) * 58)
    image = Image.new("RGB", (1200, height), "#101722")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((35, 30, 1165, height - 30), radius=28, fill="#172231", outline="#30445c", width=2)
    draw.text((75, 65), "LogAI 模块 Token 排行", font=fonts["title"], fill="#f4d58d")
    period = "全部记录" if not summary["days"] else f"近 {summary['days']} 天"
    draw.text((77, 125), f"{period} · 输入/输出 Token 均计入", font=fonts["small"], fill="#9fb3c8")
    y = 185
    max_tokens = max((row["total_tokens"] for row in modules), default=1) or 1
    for index, row in enumerate(modules, 1):
        draw.text((78, y + 5), f"{index:02d}  {row['name']}", font=fonts["body"], fill="#eef4fa")
        draw.rounded_rectangle((430, y + 12, 850, y + 31), radius=10, fill="#26384d")
        fill_w = max(8, int(420 * row["total_tokens"] / max_tokens))
        draw.rounded_rectangle((430, y + 12, 430 + fill_w, y + 31), radius=10, fill="#63b3a5")
        draw.text((875, y + 4), _fmt_tokens(row["total_tokens"]), font=fonts["body"], fill="#f4d58d")
        draw.text((1010, y + 8), f"{row['calls']} 次", font=fonts["small"], fill="#9fb3c8")
        y += 62
    y += 20
    draw.line((75, y, 1125, y), fill="#30445c", width=2)
    y += 24
    draw.text((75, y), "高频提示词（仅保存缩略与哈希，不保存全文）", font=fonts["head"], fill="#e8c47c")
    y += 56
    if not prompts:
        draw.text((75, y), "暂无提示词记录", font=fonts["body"], fill="#9fb3c8")
    for index, row in enumerate(prompts, 1):
        label = f"{index:02d}  [{row['module']}] {row['name']} · {row['calls']} 次 · {_fmt_tokens(row['total_tokens'])}"
        draw.text((78, y), _safe_text(label, 65), font=fonts["body"], fill="#eef4fa")
        draw.text((115, y + 30), _safe_text(row["excerpt"], 70), font=fonts["small"], fill="#9fb3c8")
        y += 58
    return _save_image(image)


def render_rankings(summary: dict[str, Any], font_path: str) -> list[bytes]:
    return [
        _ranking_image(summary, summary["users"], "LogAI 用户 Token 排行", font_path),
        _module_image(summary, font_path),
    ]


def apply_user_display_names(summary: dict[str, Any], display_names: dict[str, Any] | None = None) -> dict[str, Any]:
    """Apply externally resolved real account nicknames without exposing QQ IDs."""
    mapping = display_names if isinstance(display_names, dict) else {}
    for row in summary.get("users", []):
        key = str(row.get("key") or "")
        resolved = mapping.get(key)
        if resolved:
            row["name"] = _safe_text(resolved, 80)
        elif key == "未归属":
            row["name"] = "未归属"
        else:
            row["name"] = "匿名用户"
    return summary
