from flask import Flask, request, send_file, jsonify
from playwright.sync_api import sync_playwright
import openpyxl
import requests
import re
import os
import math
import datetime
import base64
import shutil
import subprocess
import tempfile
import random
import json
import html
CARDS_DIR = "achievements/cards"
SQUADS_DIR = "achievements/squads"
os.makedirs(CARDS_DIR, exist_ok=True)
os.makedirs(SQUADS_DIR, exist_ok=True)

app = Flask(__name__)
SAVE_DIR = "achievements"
if not os.path.exists(SAVE_DIR):
    os.makedirs(SAVE_DIR)

# --- 8 种 FUT 卡牌风格配置 ---
CARD_THEMES = {
    "Bronze":      {"bg": "linear-gradient(135deg, #a3734b 0%, #684221 100%)", "border": "#c89b70", "text": "#fff2dc", "line": "rgba(255,242,220,0.35)"},
    "Bronze Rare": {"bg": "linear-gradient(135deg, #b8865b 0%, #522d10 100%)", "border": "#ffdfb5", "text": "#fff2dc", "line": "rgba(255,242,220,0.4)"},
    "Silver":      {"bg": "linear-gradient(135deg, #c0c3c7 0%, #83868a 100%)", "border": "#e8e9eb", "text": "#1a1f26", "line": "rgba(26,31,38,0.35)"},
    "Silver Rare": {"bg": "linear-gradient(135deg, #d3d7dc 0%, #5d6166 100%)", "border": "#ffffff", "text": "#0f1319", "line": "rgba(15,19,25,0.4)"},
    "Gold":        {"bg": "linear-gradient(135deg, #d6b25c 0%, #9e7522 100%)", "border": "#f3dc9e", "text": "#3a2708", "line": "rgba(58,39,8,0.35)"},
    "Gold Rare":   {"bg": "linear-gradient(135deg, #e3bd64 0%, #876218 100%)", "border": "#ffe599", "text": "#3a2708", "line": "rgba(58,39,8,0.4)"},
    "Icon":        {"bg": "linear-gradient(135deg, #f0e6d2 0%, #b8a670 100%)", "border": "#d4af37", "text": "#2b1e00", "line": "rgba(43,30,0,0.4)"},
    "TOTW": {
        "bg": "linear-gradient(135deg, #1e40af 0%, #0c1e5c 55%, #172554 100%)",
        "border": "#7dd3fc",
        "text": "#e0f2fe",
        "line": "rgba(224,242,254,0.45)"
    },
    "HERO": {
    "bg": "linear-gradient(135deg, #ff7a1a 0%, #d63700 45%, #7a0e0e 100%)",
    "border": "#ff9166",
    "text": "#fff8dc",
    "line": "rgba(255,248,220,0.45)"
    },
        "RISING": {  # 天蓝白（赛季新星）
        "bg": "linear-gradient(135deg, #7dd3fc 0%, #f0f9ff 45%, #38bdf8 100%)",
        "border": "#0284c7", "text": "#0c4a6e",
        "line": "rgba(12,74,110,0.4)"
    },
    "NOVA": {  # 黑橙（超新星）
        "bg": "linear-gradient(135deg, #f97316 0%, #1c1917 50%, #ea580c 100%)",
        "border": "#fdba74", "text": "#fff7ed",
        "line": "rgba(255,247,237,0.45)"
    },
    "FOCUS": {  # 紫罗兰（转会焦点）
        "bg": "linear-gradient(135deg, #a855f7 0%, #4c1d95 55%, #6d28d9 100%)",
        "border": "#c4b5fd", "text": "#faf5ff",
        "line": "rgba(250,245,255,0.45)"
    },
    "TALENT": {  # 墨绿（怪异天赋）
        "bg": "linear-gradient(135deg, #14532d 0%, #052e16 50%, #166534 100%)",
        "border": "#4ade80", "text": "#dcfce7",
        "line": "rgba(220,252,231,0.4)"
    },
    "UTIL": {  # 红白条纹（客串大师）
        "bg": "repeating-linear-gradient(135deg, #dc2626 0 40px, #f8fafc 40px 55px, #dc2626 55px 95px)",
        "border": "#fca5a5", "text": "#7f1d1d",
        "line": "rgba(127,29,29,0.4)"
    },
    "Icon Rare":   {"bg": "linear-gradient(135deg, #1c1c1c 0%, #050505 100%)", "border": "#d4af37", "text": "#f5d76e", "line": "rgba(245,215,110,0.4)"}
}

FORMATIONS = {
    "4-3-3": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LCM": (240, 680), "CM":  (450, 720), "RCM": (660, 680),
        "LW":  (140, 380), "ST":  (450, 280), "RW":  (760, 380)
    },
    "4-4-2": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LM":  (140, 620), "LCM": (350, 670), "RCM": (550, 670), "RM": (760, 620),
        "LS":  (340, 300), "RS":  (560, 300)
    },
    "4-2-3-1": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LCDM": (330, 780), "RCDM": (570, 780),
        "LAM": (180, 510), "CAM":  (450, 490), "RAM":  (720, 510),
        "ST":  (450, 260)
    },
    "3-5-2": {
        "GK":  (450, 1120),
        "LCB": (220, 940), "CB":  (450, 970), "RCB": (680, 940),
        "LWB": (90, 700), "LCM": (290, 720), "CM": (450, 690), "RCM": (610, 720), "RWB": (810, 700),
        "LS":  (340, 300), "RS": (560, 300)
    },
    "3-4-3": {
        "GK":  (450, 1120),
        "LCB": (220, 940), "CB":  (450, 970), "RCB": (680, 940),
        "LM":  (140, 680), "LCM": (350, 710), "RCM": (550, 710), "RM": (760, 680),
        "LW":  (150, 350), "ST":  (450, 280), "RW":  (750, 350)
    },
    "5-3-2": {
        "GK":  (450, 1120),
        "LWB": (90, 800), "LCB": (250, 940), "CB": (450, 980), "RCB": (650, 940), "RWB": (810, 800),
        "LCM": (280, 640), "CM": (450, 680), "RCM": (620, 640),
        "LS":  (340, 300), "RS": (560, 300)
    }
}

FORMATIONS.update({
    # 钻石中场：CDM + CAM 双核，古典阵型
    "4-1-2-1-2": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "CDM": (450, 810),
        "LCM": (250, 640), "RCM": (650, 640),
        "CAM": (450, 470),
        "LS":  (340, 280), "RS":  (560, 280)
    },
    # 单前腰双前锋
    "4-3-1-2": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LCM": (240, 680), "CM":  (450, 720), "RCM": (660, 680),
        "CAM": (450, 470),
        "LS":  (340, 280), "RS":  (560, 280)
    },
    # 圣诞树：双影锋 LF/RF
    "4-3-2-1": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LCM": (240, 680), "CM":  (450, 720), "RCM": (660, 680),
        "LF":  (310, 440), "RF":  (590, 440),
        "ST":  (450, 260)
    },
    # 双影锋 + 双 CDM
    "4-2-2-2": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LCDM": (330, 780), "RCDM": (570, 780),
        "LF":  (250, 500), "RF":  (650, 500),
        "LS":  (340, 280), "RS":  (560, 280)
    },
    # 三中卫 + 翼卫 + 前腰
    "3-4-1-2": {
        "GK":  (450, 1120),
        "LCB": (220, 940), "CB":  (450, 970), "RCB": (680, 940),
        "LWB": (90, 700), "LCM": (330, 720), "RCM": (570, 720), "RWB": (810, 700),
        "CAM": (450, 450),
        "LS":  (340, 280), "RS":  (560, 280)
    },
    # 铁桶阵：五后卫双翼卫
    "5-4-1": {
        "GK":  (450, 1120),
        "LWB": (90, 830), "LCB": (240, 940), "CB": (450, 970), "RCB": (660, 940), "RWB": (810, 830),
        "LM":  (150, 620), "LCM": (350, 650), "RCM": (550, 650), "RM": (750, 620),
        "ST":  (450, 300)
    },
    # 伪 9 号：中锋回撤打 CF
    "4-3-3 F9": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LCM": (240, 680), "CM":  (450, 720), "RCM": (660, 680),
        "LW":  (140, 380), "CF":  (450, 340), "RW":  (760, 380)
    },
    # 单前锋防守型
    "4-1-4-1": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "CDM": (450, 800),
        "LM":  (140, 620), "LCM": (340, 640), "RCM": (560, 640), "RM": (760, 620),
        "ST":  (450, 300)
    },
    # W-M (3-2-2-3) — Herbert Chapman 1920s 阿森纳成名阵型
    # 一线三后卫 + 双后腰 + 双内锋 + 三前锋，字母 W 和 M
    "W-M (3-2-2-3)": {
        "GK":  (450, 1120),
        "LCB": (250, 940), "CB":  (450, 970), "RCB": (650, 940),
        "LCDM": (330, 780), "RCDM": (570, 780),
        "LAM": (330, 500), "RAM": (570, 500),
        "LW":  (140, 300), "ST":  (450, 260), "RW":  (760, 300)
    },
    # Metodo 条理 (2-3-2-3) — 波佐 1934/38 意大利卫冕世界杯
    # 双后卫 + 三中场 + 两影锋 + 三前锋，攻守平衡的鼻祖
    "Metodo (2-3-2-3)": {
        "GK":  (450, 1120),
        "LB":  (300, 940), "RB":  (600, 940),
        "LCM": (240, 780), "CM":  (450, 800), "RCM": (660, 780),
        "LF":  (330, 500), "RF":  (570, 500),
        "LW":  (150, 300), "CF":  (450, 260), "RW":  (750, 300)
    },
    # 3-3-3-1 — 三线三三三 + 单前锋，罕见的层叠式阵型
    # 每条线都能上前或回撤，弹性极大
    "3-3-3-1": {
        "GK":  (450, 1120),
        "LCB": (220, 940), "CB":  (450, 970), "RCB": (680, 940),
        "LM":  (150, 780), "CDM": (450, 800), "RM":  (750, 780),
        "LAM": (200, 500), "CAM": (450, 500), "RAM": (700, 500),
        "ST":  (450, 270)
    },
    # 3-1-4-2 — 三中卫 + 单后腰锚 + 平行四中场 + 双前锋
    # 中场四人横排铺开，边路和肋部都吃，古典欧陆味
    "3-1-4-2": {
        "GK":  (450, 1120),
        "LCB": (220, 940), "CB":  (450, 970), "RCB": (680, 940),
        "CDM": (450, 810),
        "LM":  (140, 620), "LCM": (330, 660), "RCM": (570, 660), "RM": (760, 620),
        "LS":  (340, 290), "RS":  (560, 290)
    },
    "3-4-2-1": {
        "GK":  (450, 1120),
        "LCB": (220, 940), "CB":  (450, 970), "RCB": (680, 940),
        "LM":  (140, 700), "LCM": (350, 730), "RCM": (550, 730), "RM": (760, 700),
        "LAM": (330, 460), "RAM": (570, 460),
        "ST":  (450, 260)
    },
    "5-2-3": {
        "GK":  (450, 1120),
        "LWB": (90, 830), "LCB": (240, 940), "CB": (450, 970), "RCB": (660, 940), "RWB": (810, 830),
        "LCM": (330, 680), "RCM": (570, 680),
        "LW":  (160, 340), "ST":  (450, 280), "RW":  (740, 340)
    },
    "4-2-4": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LCM": (330, 700), "RCM": (570, 700),
        "LW":  (150, 380), "LS":  (350, 290), "RS": (550, 290), "RW": (750, 380)
    },
    # === 新增 6 个 ===
    # 3-3-4：极端进攻，双翼卫 + 4 前锋，1950s 巴西风格
    "3-3-4": {
        "GK":  (450, 1120),
        "LCB": (220, 940), "CB":  (450, 970), "RCB": (680, 940),
        "LM":  (170, 720), "CM":  (450, 720), "RM":  (730, 720),
        "LW":  (140, 380), "LS":  (350, 290), "RS":  (550, 290), "RW":  (760, 380)
    },
    # 4-4-1-1：4-4-2 变种，影锋回撤连接，AC 米兰 90s 经典
    "4-4-1-1": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LM":  (140, 670), "LCM": (330, 700), "RCM": (570, 700), "RM": (760, 670),
        "CF":  (450, 460),
        "ST":  (450, 280)
    },
    # 4-5-1：五中场铺开，希腊 2004 欧洲杯冠军阵
    "4-5-1": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LM":  (130, 640), "LCM": (300, 680), "CM": (450, 700), "RCM": (600, 680), "RM": (770, 640),
        "ST":  (450, 300)
    },
    # 2-4-4：2 后卫极端阵，只用于狂追比分或纯娱乐
    "2-4-4": {
        "GK":  (450, 1120),
        "LB":  (280, 950), "RB":  (620, 950),
        "LM":  (140, 720), "LCM": (340, 730), "RCM": (560, 730), "RM": (760, 720),
        "LW":  (140, 380), "LS":  (350, 290), "RS":  (550, 290), "RW":  (760, 380)
    },
    # 3-4-3 钻石：中场菱形 + 三前锋，切尔西 Sarri 变体
    "3-4-3 钻石": {
        "GK":  (450, 1120),
        "LCB": (220, 940), "CB":  (450, 970), "RCB": (680, 940),
        "CDM": (450, 810),
        "LCM": (250, 640), "RCM": (650, 640),
        "CAM": (450, 470),
        "LW":  (150, 320), "ST":  (450, 280), "RW":  (750, 320)
    },
    # 4-2-1-3：双 CDM + 单 10 号 + 三前锋，德国 2014 世界杯变体
    "4-2-1-3": {
        "GK":  (450, 1120),
        "LB":  (110, 890), "LCB": (330, 940), "RCB": (570, 940), "RB": (790, 890),
        "LCDM": (330, 780), "RCDM": (570, 780),
        "CAM": (450, 500),
        "LW":  (140, 320), "ST":  (450, 280), "RW":  (760, 320)
    },
    # 5-2-2-1：极端防守铁桶，双影锋支援单前锋
    "5-2-2-1": {
        "GK":  (450, 1120),
        "LWB": (90, 830), "LCB": (240, 940), "CB": (450, 970), "RCB": (660, 940), "RWB": (810, 830),
        "LCM": (330, 680), "RCM": (570, 680),
        "LF":  (300, 460), "RF":  (600, 460),
        "ST":  (450, 280)
    },
})

MATCHES_DIR = "achievements/matches"
os.makedirs(MATCHES_DIR, exist_ok=True)

PROFILES_DIR = "achievements/profiles"
os.makedirs(PROFILES_DIR, exist_ok=True)

def default_profile(user_key):
    now = datetime.datetime.now().isoformat()
    return {
        "user_key": user_key, "team_name": "", "elo": 1200,
        "peak_elo": 1200, "matches": 0,
        "wins": 0, "draws": 0, "losses": 0,
        "goals_for": 0, "goals_against": 0,
        "formations": {}, "styles": {}, "tactics": {},
        "players": {}, "mvp_count": 0,
        "current_streak": 0, "win_streak": 0,
        "history": [],
        "created_at": now, "updated_at": now,
        "current_league_tier": None,
        "league_season_num": 0,
        "cup_season_num": 0,
        "media_relation": 0,
        "media_history": [],
        "press_bland_streak": 0,
        "press_tone_history": [],
        "honors": {"league":[], "cup":[], "best_league_rank":None, "best_cup":None},
    }

def load_profile(user_key):
    p = os.path.join(PROFILES_DIR, f"{user_key}.json")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            prof = json.load(f)
        # 兼容老字段
        for k, v in default_profile(user_key).items():
            prof.setdefault(k, v)
        return prof
    return default_profile(user_key)

def save_profile(prof):
    prof["updated_at"] = datetime.datetime.now().isoformat()
    with open(os.path.join(PROFILES_DIR, f"{prof['user_key']}.json"), "w", encoding="utf-8") as f:
        json.dump(prof, f, ensure_ascii=False, indent=2)

def get_team_display_name(user_key, fallback):
    prof = load_profile(user_key)
    return prof.get("team_name") or fallback

def elo_delta(my, opp, result):
    """result: 1 胜 / 0.5 平 / 0 负；含以弱胜强奖励"""
    expected = 1.0 / (1 + 10 ** ((opp - my) / 400))
    K = 32
    delta = K * (result - expected)
    if result > expected and opp > my:
        gap = min(opp - my, 400) / 400
        delta *= (1 + 0.4 * gap)   # 以弱胜强最多 +40%
    return int(round(delta))

def elo_to_tier(elo):
    if elo >= 2000: return ("t-diamond", "钻石")
    if elo >= 1700: return ("t-platinum", "铂金")
    if elo >= 1450: return ("t-gold", "黄金")
    if elo >= 1200: return ("t-silver", "白银")
    return ("t-bronze", "青铜")

def _settle_match_stats(m, winner_side, ratings, mvp_name):
    """比赛结束后同步双方战绩"""
    hp = load_profile(m["home_key"]); ap = load_profile(m["away_key"])
    if not hp["team_name"]: hp["team_name"] = m["home_name"]
    if not ap["team_name"]: ap["team_name"] = m["away_name"]

    # ELO
    if winner_side == "home":
        d_h = elo_delta(hp["elo"], ap["elo"], 1)
        d_a = elo_delta(ap["elo"], hp["elo"], 0)
    elif winner_side == "away":
        d_h = elo_delta(hp["elo"], ap["elo"], 0)
        d_a = elo_delta(ap["elo"], hp["elo"], 1)
    else:
        d_h = elo_delta(hp["elo"], ap["elo"], 0.5)
        d_a = elo_delta(ap["elo"], hp["elo"], 0.5)
    hp["elo"] += d_h; ap["elo"] += d_a
    hp["peak_elo"] = max(hp["peak_elo"], hp["elo"])
    ap["peak_elo"] = max(ap["peak_elo"], ap["elo"])

    # 场次 / 进失球
    hp["matches"] += 1; ap["matches"] += 1
    hp["goals_for"] += m["home"]["goals"]; hp["goals_against"] += m["away"]["goals"]
    ap["goals_for"] += m["away"]["goals"]; ap["goals_against"] += m["home"]["goals"]

    # 胜平负 + 连胜
    if winner_side == "home":
        hp["wins"] += 1; ap["losses"] += 1
        hp["current_streak"] = hp["current_streak"] + 1 if hp["current_streak"] > 0 else 1
        ap["current_streak"] = ap["current_streak"] - 1 if ap["current_streak"] < 0 else -1
    elif winner_side == "away":
        ap["wins"] += 1; hp["losses"] += 1
        ap["current_streak"] = ap["current_streak"] + 1 if ap["current_streak"] > 0 else 1
        hp["current_streak"] = hp["current_streak"] - 1 if hp["current_streak"] < 0 else -1
    else:
        hp["draws"] += 1; ap["draws"] += 1
        hp["current_streak"] = 0; ap["current_streak"] = 0
    hp["win_streak"] = max(hp["win_streak"], hp["current_streak"])
    ap["win_streak"] = max(ap["win_streak"], ap["current_streak"])

    # 阵型/风格
    for prof, side in [(hp, m["home"]), (ap, m["away"])]:
        fm = side.get("formation", "")
        if fm: prof["formations"][fm] = prof["formations"].get(fm, 0) + 1
        st = side.get("style", "")
        if st: prof["styles"][st] = prof["styles"].get(st, 0) + 1

    # 战术（每回合都记）
    for h in m.get("history", []):
        r = h.get("result") or h
        ht_k = r.get("h_tactic"); at_k = r.get("a_tactic")
        if ht_k: hp["tactics"][ht_k] = hp["tactics"].get(ht_k, 0) + 1
        if at_k: ap["tactics"][at_k] = ap["tactics"].get(at_k, 0) + 1

    # 球员统计
    for prof, side in [(hp, m["home"]), (ap, m["away"])]:
        appeared = set(side.get("starters", {}).values()) | set(side.get("sent_off", []))
        for cid in appeared:
            c = side["cards_snapshot"].get(cid)
            if not c: continue
            ps = side.get("player_stats", {}).get(cid, {})
            entry = prof["players"].setdefault(cid, {
                "name": c["name"], "goals": 0, "assists": 0,
                "saves": 0, "appearances": 0, "mvp": 0
            })
            entry["name"] = c["name"]
            entry["appearances"] += 1
            entry["goals"] += ps.get("goals", 0)
            entry["assists"] += ps.get("assists", 0)
            entry["saves"] += ps.get("saves", 0)

    # MVP 归属
    if mvp_name:
        for prof, side in [(hp, m["home"]), (ap, m["away"])]:
            for cid, c in side["cards_snapshot"].items():
                if c["name"] == mvp_name and cid in prof["players"]:
                    prof["players"][cid]["mvp"] += 1
                    prof["mvp_count"] += 1
                    break

    # 最近战绩
    now = datetime.datetime.now().isoformat()
    hp["history"].insert(0, {"opp": m["away_name"], "score": f"{m['home']['goals']}:{m['away']['goals']}",
        "result": "W" if winner_side=="home" else ("L" if winner_side=="away" else "D"),
        "elo_delta": d_h, "at": now})
    ap["history"].insert(0, {"opp": m["home_name"], "score": f"{m['away']['goals']}:{m['home']['goals']}",
        "result": "W" if winner_side=="away" else ("L" if winner_side=="home" else "D"),
        "elo_delta": d_a, "at": now})
    hp["history"] = hp["history"][:10]
    ap["history"] = ap["history"][:10]

    save_profile(hp); save_profile(ap)
    return d_h, d_a

TACTIC_MODIFIERS = {
    "all_attack": {"PAC":1.25,"SHO":1.35,"PAS":1.05,"DRI":1.15,"DEF":0.60,"PHY":0.88, "cost":(16,22)},
    "attack":     {"PAC":1.15,"SHO":1.20,"PAS":1.05,"DRI":1.10,"DEF":0.80,"PHY":0.95, "cost":(11,16)},
    "balance":    {"PAC":1.00,"SHO":1.00,"PAS":1.05,"DRI":1.00,"DEF":1.05,"PHY":1.00, "cost":(8,12)},
    "defend":     {"PAC":0.90,"SHO":0.80,"PAS":1.00,"DRI":0.90,"DEF":1.25,"PHY":1.15, "cost":(6,10)},
    "all_defend": {"PAC":0.70,"SHO":0.55,"PAS":0.90,"DRI":0.82,"DEF":1.45,"PHY":1.28, "cost":(7,11)},
}

TEAM_STYLES = {
    "high_press": {
        "cn": "高位逼抢",
        "desc": "全线压上前场逼抢，快速夺回球权",
        "formations": ["4-3-3", "3-4-3", "4-3-3 F9", "4-2-3-1", "W-M (3-2-2-3)"],
        "modifiers": {"PAC":1.08,"SHO":1.05,"PAS":1.03,"DRI":1.05,"DEF":0.92,"PHY":1.05},
        "stamina_extra": 3,
        "counter_vs": {"long_ball":+0.05,"park_bus":-0.08,"counter_attack":-0.10,
                       "possession":+0.03,"wing_play":+0.02,"central":+0.03,
                       "total_football":-0.02,"catenaccio":-0.05},   # ← 追加两条
        "underdog_bonus": 0.08,
    },
    "counter_attack": {
        "cn": "防守反击",
        "desc": "深度防守后快速反击，主打转换",
        "formations": ["4-4-2","4-2-3-1","4-1-4-1","5-3-2","4-3-1-2", "3-3-3-1"],
        "modifiers": {"PAC":1.12,"SHO":1.05,"PAS":1.00,"DRI":1.03,"DEF":1.10,"PHY":1.02},
        "stamina_extra": -1,
        "counter_vs": {"high_press":+0.10,"possession":+0.06,"long_ball":-0.05,
                       "park_bus":-0.05,"wing_play":+0.02,"central":+0.02},
        "underdog_bonus": 0.13,
    },
    "park_bus": {
        "cn": "摆大巴",
        "desc": "全线回收铸铜墙，只求一分",
        "formations": ["5-4-1","5-3-2","4-1-4-1","3-5-2","4-2-3-1"],
        "modifiers": {"PAC":0.90,"SHO":0.85,"PAS":0.95,"DRI":0.92,"DEF":1.22,"PHY":1.10},
        "stamina_extra": -2,
        "counter_vs": {"high_press":+0.10,"possession":+0.06,"wing_play":+0.05,
                       "long_ball":-0.03,"counter_attack":+0.04,"central":+0.03},
        "underdog_bonus": 0.15,
    },
    "possession": {
        "cn": "传控渗透",
        "desc": "耐心倒脚控制节奏，寻找致命一击",
        "formations": ["4-1-2-1-2","4-3-1-2","4-3-3","4-3-2-1","3-4-1-2", "W-M (3-2-2-3)", "Metodo (2-3-2-3)", "3-1-4-2"],
        "modifiers": {"PAC":0.98,"SHO":1.00,"PAS":1.16,"DRI":1.12,"DEF":1.00,"PHY":0.94},
        "stamina_extra": 1,
        "counter_vs": {"park_bus":-0.08,"counter_attack":-0.06,"long_ball":+0.08,
                       "high_press":-0.04,"wing_play":+0.02,"central":+0.03,
                       "catenaccio":-0.10,"gegenpressing":-0.08,"kick_and_rush":+0.05},
        "underdog_bonus": 0.03,
    },
    "long_ball": {
        "cn": "长传冲吊",
        "desc": "简化中场直接找锋线，快速通过",
        "formations": ["4-4-2","3-4-3","5-4-1","3-5-2"],
        "modifiers": {"PAC":1.10,"SHO":1.08,"PAS":0.88,"DRI":0.90,"DEF":1.05,"PHY":1.18},
        "stamina_extra": 0,
        "counter_vs": {"possession":-0.05,"park_bus":+0.04,"high_press":-0.06,
                       "counter_attack":+0.05,"wing_play":-0.02,"central":+0.02},
        "underdog_bonus": 0.10,
    },
    "wing_play": {
        "cn": "边路走廊",
        "desc": "两翼齐飞，边路突破加传中",
        "formations": ["4-3-3","3-4-3","5-3-2","4-4-2","4-3-2-1","3-4-1-2", "Metodo (2-3-2-3)"],
        "modifiers": {"PAC":1.10,"SHO":1.03,"PAS":1.05,"DRI":1.10,"DEF":0.98,"PHY":1.02},
        "stamina_extra": 1,
        "counter_vs": {"possession":+0.04,"park_bus":-0.03,"counter_attack":+0.03,
                       "high_press":-0.02,"long_ball":+0.03,"central":-0.02},
        "underdog_bonus": 0.07,
    },
    "central": {
        "cn": "中路渗透",
        "desc": "中场核心组织，短传打穿肋部",
        "formations": ["4-3-2-1","4-2-2-2","4-3-1-2","3-4-1-2","4-1-2-1-2", "W-M (3-2-2-3)", "3-3-3-1", "3-1-4-2"],
        "modifiers": {"PAC":1.00,"SHO":1.05,"PAS":1.12,"DRI":1.10,"DEF":0.98,"PHY":0.98},
        "stamina_extra": 1,
        "counter_vs": {"wing_play":+0.05,"park_bus":-0.05,"counter_attack":-0.03,
                       "high_press":-0.02,"long_ball":+0.02,"possession":+0.02},
        "underdog_bonus": 0.06,
    },
    "total_football": {
        "cn": "全攻全守",
        "desc": "米歇尔斯的荷兰革命：位置流动+高压压缩，全员参与",
        "formations": ["3-4-3","4-3-3","4-2-1-3","3-4-2-1","W-M (3-2-2-3)","4-3-3 F9"],
        "modifiers": {"PAC":1.10,"SHO":1.06,"PAS":1.10,"DRI":1.10,"DEF":1.02,"PHY":1.02},
        "stamina_extra": 4,                       # 全员满场跑，超级耗体力
        "counter_vs": {"park_bus":+0.05,"long_ball":+0.04,"counter_attack":+0.06,
                       "possession":-0.02,"high_press":+0.02},
        "underdog_bonus": 0.10,
    },
    "catenaccio": {
        "cn": "链式防守",
        "desc": "埃雷拉的国米铁闸：清道夫 + 极端防守 + 精准反击",
        "formations": ["5-3-2","5-4-1","4-1-4-1","3-5-2","4-4-1-1","5-2-3"],
        "modifiers": {"PAC":0.92,"SHO":0.88,"PAS":0.94,"DRI":0.92,"DEF":1.30,"PHY":1.18},
        "stamina_extra": -3,                      # 蹲坑省力
        "counter_vs": {"high_press":+0.08,"possession":+0.10,"wing_play":+0.05,
                       "long_ball":-0.02,"counter_attack":+0.03,"total_football":+0.03},
        "underdog_bonus": 0.18,                   # 弱队打强队最猛
    },
    "gegenpressing": {
        "cn": "反抢转换",
        "desc": "克洛普招牌：8 秒内就地夺回+闪电反击，比高位逼抢更狠",
        "formations": ["4-3-3","4-2-3-1","3-4-3","4-2-1-3","4-3-3 F9"],
        "modifiers": {"PAC":1.15,"SHO":1.10,"PAS":1.04,"DRI":1.06,"DEF":0.90,"PHY":1.08},
        "stamina_extra": 5,                       # 消耗巨大
        "counter_vs": {"possession":+0.12,"tiki_taka":+0.10,"long_ball":+0.03,
                       "park_bus":-0.10,"counter_attack":-0.05,"total_football":-0.02},
        "underdog_bonus": 0.05,
    },
    "false_nine": {
        "cn": "无锋伪9",
        "desc": "梅西式假 9 号回撤，中卫拉出即崩",
        "formations": ["4-3-3 F9","4-1-2-1-2","4-3-2-1","3-4-3","4-2-1-3"],
        "modifiers": {"PAC":1.02,"SHO":0.95,"PAS":1.18,"DRI":1.15,"DEF":0.98,"PHY":0.92},
        "stamina_extra": 2,
        "counter_vs": {"park_bus":-0.06,"catenaccio":-0.05,"long_ball":+0.05,
                       "possession":+0.03,"high_press":-0.02,"total_football":+0.02},
        "underdog_bonus": 0.05,
    },
    "kick_and_rush": {
        "cn": "踢了就跑",
        "desc": "英式古典：中场省略，长传直塞 + 前锋冲刺",
        "formations": ["4-4-2","4-4-1-1","3-3-4","4-2-4"],
        "modifiers": {"PAC":1.20,"SHO":1.10,"PAS":0.80,"DRI":0.85,"DEF":1.00,"PHY":1.15},
        "stamina_extra": 1,
        "counter_vs": {"possession":-0.03,"tiki_taka":-0.05,"park_bus":+0.02,
                       "catenaccio":-0.04,"total_football":-0.03,"counter_attack":+0.04},
        "underdog_bonus": 0.12,
    },
}
STYLE_CN_TO_KEY = {v["cn"]: k for k,v in TEAM_STYLES.items()}
STYLE_KEY_TO_CN = {k: v["cn"] for k,v in TEAM_STYLES.items()}

def suggest_styles_for_formation(fm):
    """返回适配该阵型的风格 key 列表"""
    return [k for k,v in TEAM_STYLES.items() if fm in v["formations"]]

EVENT_CONFIG = {
    # base=基础概率, tactic=按战术追加, style=按风格追加
    "yellow": {
        "base": 0.30,
        "tactic": {"all_attack":0.10,"all_defend":0.15,"attack":0.05,"defend":0.08},
        "style":  {"high_press":0.10,"long_ball":0.05,"park_bus":0.08,"counter_attack":0.03,"possession":-0.05},
    },
    "red": {
        "base": 0.02,
        "tactic": {"all_attack":0.03,"all_defend":0.04,"attack":0.01,"defend":0.02},
        "style":  {"high_press":0.02,"park_bus":0.03,"long_ball":0.02,"possession":-0.01},
    },
    "injury": {
        "base": 0.05,
        "tactic": {"all_attack":0.04,"all_defend":0.02,"attack":0.02,"defend":0.01},
        "style":  {"high_press":0.04,"long_ball":0.03,"counter_attack":0.02,"possession":-0.02},
    },
    "own_goal": {
        "base": 0.012,
        "tactic": {"all_defend":0.02,"defend":0.01},
        "style":  {"park_bus":0.02,"long_ball":0.01},
    },
    "gk_blunder": {
        "base": 0.02,
        "style":  {"long_ball":0.02,"park_bus":0.02},
    },
    "penalty": {
        "base": 0.04,
        "tactic": {"all_attack":0.04,"attack":0.02},
        "style":  {"wing_play":0.03,"high_press":0.02,"central":0.02},
    },
    "crossbar": {
        "base": 0.06,
        "tactic": {"all_attack":0.03,"attack":0.02},
        "style":  {"long_ball":0.02,"wing_play":0.02},
    },
    "morale": {"base": 0.05},   # 下回合己方 +5% 攻击
}

def event_rate(name, tactic, style):
    cfg = EVENT_CONFIG[name]
    return max(0, cfg["base"] 
               + cfg.get("tactic",{}).get(tactic, 0) 
               + cfg.get("style",{}).get(style, 0))

# 战术克制矩阵（5×5）：正数=行方进攻加成
COUNTER = {
    ("all_attack","all_attack"): -0.02, ("all_attack","attack"): +0.02,
    ("all_attack","balance"): +0.08, ("all_attack","defend"): -0.06,
    ("all_attack","all_defend"): -0.16,
    ("attack","all_attack"): -0.02, ("attack","attack"): +0.02,
    ("attack","balance"): +0.05, ("attack","defend"): -0.10,
    ("attack","all_defend"): -0.14,
    ("balance","all_attack"): -0.06, ("balance","attack"): -0.03,
    ("balance","balance"): 0, ("balance","defend"): +0.04,
    ("balance","all_defend"): +0.02,
    ("defend","all_attack"): +0.14, ("defend","attack"): +0.10,
    ("defend","balance"): -0.04, ("defend","defend"): -0.02,
    ("defend","all_defend"): -0.08,
    ("all_defend","all_attack"): +0.18, ("all_defend","attack"): +0.13,
    ("all_defend","balance"): +0.00, ("all_defend","defend"): -0.06,
    ("all_defend","all_defend"): -0.20,
}

TACTIC_CN = {"all_attack":"全力进攻","attack":"进攻","balance":"平衡",
             "defend":"防守","all_defend":"全力防守"}
CN_TACTIC = {"全力进攻":"all_attack","全力防守":"all_defend",
             "进攻":"attack","防守":"defend","平衡":"balance",
             "attack":"attack","defend":"defend","balance":"balance",
             "all_attack":"all_attack","all_defend":"all_defend",
             "allattack":"all_attack","alldefend":"all_defend"}

SHOUT_COMMANDS = {
    "鼓励": {
        "success":0.82, "morale":1.07, "fail_morale":0.97,
        "coach":["抬起头来，我们完全有能力把比赛拿回来！", "相信身边的队友，下一次机会就是我们的！",
                 "别怕犯错，勇敢去做你们最擅长的事！"],
        "success_text":["掌声很快传遍场上，全队跑动明显积极起来", "队员们互相击掌，低落的气氛被重新点燃"],
        "fail_text":["队员们只是沉默点头，紧张感并没有真正散去", "这番鼓励显得有些空泛，球员仍在怀疑自己"],
        "success_reply":["教练，看我们的！", "下一球一定是我们的！", "兄弟们，再拼一次！"],
        "fail_reply":["我们会试试……但现在真的很难。", "说起来容易，场上的压力太大了。", "先让我们稳住吧。"],
    },
    "冷静": {
        "success":0.88, "morale":1.03, "fail_morale":0.98, "card_reduce":0.30,
        "coach":["别跟着对方的节奏走，把球控制在脚下。", "忘掉刚才的判罚，保持头脑清醒。",
                 "慢下来观察空间，我们不需要急着一脚解决。"],
        "success_text":["球员开始主动降速控球，动作变得更加克制", "场上争执迅速平息，全队重新专注比赛"],
        "fail_text":["焦躁情绪仍在蔓延，几名球员对判罚喋喋不休", "球队试图降速，却因犹豫而显得畏手畏脚"],
        "success_reply":["明白，先把球留住。", "都别上头，按计划来！", "听教练的，稳住这一段。"],
        "fail_reply":["他都那样踢了，怎么冷静？", "我们已经被压得喘不过气了。", "再退就没有机会了！"],
    },
    "批评": {
        "success":0.58, "morale":1.11, "fail_morale":0.91,
        "coach":["这不是训练赛！谁还想赢，就拿出配得上球衣的表现！", "你们让对手踢得太舒服了，立刻给我醒过来！",
                 "跑动、对抗、专注——三样都没有，我还能指望什么？"],
        "success_text":["严厉的话语刺中了球员，全队像被骤然点燃", "几名核心球员怒吼着召集队友，比赛强度瞬间提升"],
        "fail_text":["批评彻底击穿了脆弱的信心，场上开始互相埋怨", "球员对教练的指责明显不满，跑动和配合进一步松散"],
        "success_reply":["够了，用表现说话！", "都听见了吗？别再让人看笑话！", "这口气我们必须挣回来！"],
        "fail_reply":["所有责任都算在我们头上，是吗？", "如果战术没问题，那当然只能怪球员。", "再怎么跑也改变不了现在的局面。"],
    },
    "施压": {
        "success":0.70, "morale":1.02, "fail_morale":0.94,
        "focus":{"sho":1.10,"pac":1.06,"pas":0.96,"def":0.96},
        "coach":["对手已经慌了，再压一步就会崩！", "把他们锁在半场，不要给任何喘息机会！",
                 "比赛只剩这点时间，必须把风险全部押上！"],
        "success_text":["球员接受了赌上一切的要求，阵线整体前压", "全队的侵略性陡然上升，开始疯狂冲击禁区"],
        "fail_text":["高压要求让疲惫的球员更加慌乱，阵型出现脱节", "队员担心身后空间，执行时明显犹豫不决"],
        "success_reply":["压上去！别让他们抬头！", "这一波就把他们打垮！", "所有人跟我往前！"],
        "fail_reply":["我们的体能已经跟不上了！", "再压出去，身后全是空当！", "这样只会先把自己拖垮。"],
    },
}
FOCUS_COMMANDS = {
    "注重传球": {"focus":{"pas":1.14,"dri":1.05,"sho":0.96},
                 "coach":["减少无谓长传，连续传递把他们调动开。", "多给持球队员一个接应点，耐心寻找空档。"],
                 "reply":["收到，先把节奏掌握在我们手里。", "大家靠近一点，别让持球人孤立。"],
                 "result":["球队开始以短传三角不断撕扯对手阵型", "中场接应层次变得清晰，球权运转明显顺畅"]},
    "注重远射": {"focus":{"sho":1.15,"pas":0.97,"def":0.97},
                 "coach":["他们禁区收得太深，有空间就直接起脚！", "门将站位靠前，第二点拿到就尝试远射。"],
                 "reply":["明白，我会盯住禁区外的机会。", "把第二落点交给我！"],
                 "result":["中前场球员频繁观察门将站位，远射欲望显著增强", "球队开始主动争抢禁区弧顶的第二落点"]},
    "注重突破": {"focus":{"pac":1.10,"dri":1.12,"phy":0.96},
                 "coach":["边后卫转身很慢，拿球就正面冲他！", "不要总是回传，用个人能力制造人数优势。"],
                 "reply":["给我一对一，我能过去。", "把球送到空当，我来冲击他们。"],
                 "result":["边路球员开始大胆持球推进，不断寻找一对一", "前场跑动更直接，突破频率明显提升"]},
    "注重防守": {"focus":{"def":1.13,"phy":1.08,"sho":0.94},
                 "coach":["先封住中路，任何人都不能轻易失位。", "丢球后立刻回到防区，不要冒险上抢。"],
                 "reply":["防线听我指挥，保持距离！", "先守住这一段，机会会再来的。"],
                 "result":["球队迅速压缩防守间距，禁区前沿变得拥挤", "球员减少冒险前插，防线保护明显加强"]},
}
ROUND_COMMAND_ALIASES = {
    "传球":"注重传球", "远射":"注重远射", "突破":"注重突破",
    "防守":"注重防守", "防守站位":"注重防守",
}

def normalize_round_command(kind, value):
    value = ROUND_COMMAND_ALIASES.get(value.strip(), value.strip())
    if kind == "shout" and value in SHOUT_COMMANDS:
        return value, SHOUT_COMMANDS[value]
    if kind == "focus" and value in FOCUS_COMMANDS:
        return value, FOCUS_COMMANDS[value]
    return None, None

def apply_round_command(side, kind, value):
    name, cfg = normalize_round_command(kind, value)
    if not cfg:
        return None
    applied = dict(cfg)
    speaker = "队长"
    starters = list(side.get("starters", {}).values())
    if starters:
        cid = random.choice(starters)
        speaker = side.get("cards_snapshot", {}).get(cid, {}).get("name", speaker)
    success = True
    if kind == "shout":
        success = random.random() <= applied.get("success", 0.75)
        if not success:
            applied["morale"] = applied.get("fail_morale", 0.96)
            applied["focus"] = {}
            applied["card_reduce"] = 0.0
        coach_line = random.choice(applied.get("coach", [name]))
        result_line = random.choice(applied.get("success_text" if success else "fail_text", ["球队作出了回应"]))
        reply_line = random.choice(applied.get("success_reply" if success else "fail_reply", ["明白。"]));
        text = (f"📣 教练喊话：“{coach_line}”\n"
                f"{'✅' if success else '❌'} {result_line}\n"
                f"🗣️ {speaker} 回应：“{reply_line}”")
    else:
        coach_line = random.choice(applied.get("coach", [name]))
        result_line = random.choice(applied.get("result", ["球队开始执行专项要求"]))
        reply_line = random.choice(applied.get("reply", ["收到。"]));
        text = f"🧠 场边指令：“{coach_line}”\n⚙️ {result_line}\n🗣️ {speaker}：“{reply_line}”"
    side["round_command"] = {"kind":kind,"name":name,"text":text,
                             "success":success,"speaker":speaker,
                             "morale":applied.get("morale",1.0),
                             "focus":applied.get("focus",{}),
                             "card_reduce":applied.get("card_reduce",0.0)}
    return side["round_command"]

def stamina_factor(s):
    if s >= 70: return 1.00
    if s >= 50: return 0.95
    if s >= 30: return 0.85
    if s >= 15: return 0.72
    return 0.55

def _list_matches_sorted():
    """按 mtime 倒序（新→旧）返回所有 mid"""
    files = []
    for fn in os.listdir(MATCHES_DIR):
        if not fn.endswith(".json"): continue
        p = os.path.join(MATCHES_DIR, fn)
        try:
            files.append((os.path.getmtime(p), fn[:-5]))
        except OSError:
            continue
    files.sort(reverse=True)
    return [mid for _, mid in files]

def _abort_stale_matches(uk):
    """把该用户所有未结束比赛标为 abandoned"""
    aborted = 0
    for mid in _list_matches_sorted():
        m = load_match(mid)
        if not m: continue
        if m["status"] in ("pending","active","await_tiebreak","shootout") \
           and uk in (m["home_key"], m["away_key"]):
            m["status"] = "abandoned"
            save_match(m)
            aborted += 1
    return aborted

def match_path(mid): return os.path.join(MATCHES_DIR, f"{mid}.json")
def _strip_for_save(m):
    """save 前脱水：去掉大字段"""
    import copy
    m2 = copy.deepcopy(m)
    # 1. 去掉 cards_snapshot 里的 avatar
    for side_key in ("home", "away"):
        side = m2.get(side_key)
        if not side: continue
        for c in side.get("cards_snapshot", {}).values():
            if isinstance(c, dict):
                c.pop("avatar", None)
    # 2. 精简 history：只保留必要字段，去掉完整 result 和 commentary 文本
    slim_history = []
    for h in m2.get("history", []):
        r = h.get("result") or {}
        slim_history.append({
            "round": h.get("round"),
            "img": h.get("img"),
            "home_goals": r.get("home_goals"),
            "away_goals": r.get("away_goals"),
            "h_tactic": r.get("h_tactic"),
            "a_tactic": r.get("a_tactic"),
        })
    m2["history"] = slim_history
    return m2
def _rehydrate(m):
    """load 后补水：从 cards 目录补回 avatar"""
    if not m: return m
    for side_key in ("home", "away"):
        side = m.get(side_key)
        if not side: continue
        uk = side.get("user_key")
        if not uk: continue
        snap = side.get("cards_snapshot", {})
        # 有任何缺 avatar 的卡才去加载
        if any(isinstance(c, dict) and not c.get("avatar") for c in snap.values()):
            card_meta = load_cards(uk)
            for cid, c in snap.items():
                if isinstance(c, dict) and not c.get("avatar"):
                    orig = card_meta.get(cid)
                    if orig and orig.get("avatar"):
                        c["avatar"] = orig["avatar"]
    return m
def save_match(m):
    m2 = _strip_for_save(m)
    with open(match_path(m["id"]), "w", encoding="utf-8") as f:
        json.dump(m2, f, ensure_ascii=False, separators=(',', ':'))
def load_match(mid):
    if not os.path.exists(match_path(mid)): return None
    with open(match_path(mid), "r", encoding="utf-8") as f:
        m = json.load(f)
    return _rehydrate(m)

# ==================== 生涯模块 ====================
CAREER_DIR = "achievements/career"
os.makedirs(CAREER_DIR, exist_ok=True)
IMMERSIVE_DIR = "achievements/immersive_career"
os.makedirs(IMMERSIVE_DIR, exist_ok=True)

AI_TEAM_POOL = [
    # ================= 新星/业余级（OVR 55-64） =================
    {"key":"sprout",  "name":"青空新星",   "ovr":55, "style":"wing_play",      "formation":"4-4-2"},
    {"key":"rusty",   "name":"铁锈联队",   "ovr":58, "style":"long_ball",      "formation":"5-3-2"},
    {"key":"nomad",   "name":"流浪者游击", "ovr":62, "style":"counter_attack", "formation":"4-2-3-1"},
    {"key":"comet",   "name":"彗星探路者", "ovr":60, "style":"central",        "formation":"4-3-1-2"},
    {"key":"rebel",   "name":"叛逆者阵线", "ovr":64, "style":"high_press",     "formation":"3-4-3"},

    # ================= 联赛级（OVR 65-78） =================
    # 原有球队
    {"key":"blaze",   "name":"炎魂骑士团", "ovr":72, "style":"high_press",     "formation":"4-3-3"},
    {"key":"steel",   "name":"钢铁堡垒",   "ovr":70, "style":"park_bus",       "formation":"5-4-1"},
    {"key":"tide",    "name":"深海怒潮",   "ovr":74, "style":"possession",     "formation":"4-1-2-1-2"},
    {"key":"wind",    "name":"疾风驰骋",   "ovr":73, "style":"wing_play",      "formation":"3-4-3"},
    {"key":"shadow",  "name":"暗影狼群",   "ovr":75, "style":"counter_attack", "formation":"4-4-2"},
    {"key":"nova",    "name":"新星联队",   "ovr":68, "style":"central",        "formation":"4-3-2-1"},
    {"key":"golem",   "name":"巨石卫队",   "ovr":76, "style":"long_ball",      "formation":"4-4-2"},
    {"key":"phoenix", "name":"不朽凤凰",   "ovr":78, "style":"high_press",     "formation":"4-2-3-1"},
    # 新增球队
    {"key":"venom",   "name":"毒蛇之牙",   "ovr":77, "style":"counter_attack", "formation":"5-2-3"},
    {"key":"frost",   "name":"极地冰川",   "ovr":69, "style":"park_bus",       "formation":"5-4-1"},
    {"key":"thunder", "name":"雷鸣风暴",   "ovr":71, "style":"wing_play",      "formation":"4-2-4"},
    {"key":"forest",  "name":"翠绿游侠",   "ovr":75, "style":"possession",     "formation":"3-5-2"},
    {"key":"mirage",  "name":"幻影幽灵",   "ovr":67, "style":"central",        "formation":"4-3-2-1"},
    {"key":"iron",    "name":"黑铁兵团",   "ovr":76, "style":"long_ball",      "formation":"4-4-2"},

    # ================= 杯赛级（OVR 78-88） =================
    # 原有球队
    {"key":"titan",   "name":"提坦军团",   "ovr":80, "style":"possession",     "formation":"4-3-3"},
    {"key":"emperor", "name":"帝国近卫",   "ovr":83, "style":"central",        "formation":"4-2-2-2"},
    {"key":"galaxy",  "name":"银河舰队",   "ovr":86, "style":"possession",     "formation":"4-3-3 F9"},
    {"key":"legion",  "name":"永恒军团",   "ovr":81, "style":"counter_attack", "formation":"4-2-3-1"},
    {"key":"reaper",  "name":"寂灭收割者", "ovr":84, "style":"high_press",     "formation":"4-3-3"},
    {"key":"crown",   "name":"王冠十字军", "ovr":82, "style":"wing_play",      "formation":"3-4-3"},
    {"key":"eclipse", "name":"月蚀骑士",   "ovr":79, "style":"park_bus",       "formation":"4-1-4-1"},
    # 新增球队
    {"key":"dragon",  "name":"巨龙之怒",   "ovr":87, "style":"high_press",     "formation":"4-3-3"},
    {"key":"kraken",  "name":"深渊海妖",   "ovr":85, "style":"park_bus",       "formation":"5-3-2"},
    {"key":"griffin", "name":"狮鹫先锋",   "ovr":83, "style":"wing_play",      "formation":"3-4-3"},
    {"key":"valkyrie","name":"女武神之矛", "ovr":88, "style":"counter_attack", "formation":"4-2-1-3"},
    {"key":"paladin", "name":"圣殿骑士团", "ovr":84, "style":"possession",     "formation":"4-1-4-1"},
    {"key":"phantom", "name":"幻影刺客",   "ovr":81, "style":"central",        "formation":"4-3-2-1"},

    # ================= 冠军/传说级（OVR 89-93） =================
    {"key":"olympus", "name":"奥林匹斯",   "ovr":89, "style":"possession",     "formation":"4-3-3 F9"},
    {"key":"genesis", "name":"创世纪主宰", "ovr":91, "style":"high_press",     "formation":"3-4-2-1"},
    {"key":"leviathan","name":"利维坦巨兽","ovr":92, "style":"park_bus",       "formation":"5-2-2-1"},
    {"key":"apex",    "name":"顶点极光",   "ovr":91, "style":"central",        "formation":"4-3-1-2"},
    {"key":"nemesis", "name":"复仇女神",   "ovr":92, "style":"counter_attack", "formation":"4-2-3-1"},
    {"key":"cosmos",  "name":"宇宙星神",   "ovr":93, "style":"possession",     "formation":"4-2-4"},
    {"key":"chaos",   "name":"混沌魔神",   "ovr":90, "style":"high_press",     "formation":"3-3-4"},

    # ================= 特殊类 =================
    {"key":"chapman","name":"查普曼军团",   "ovr":76, "style":"central",        "formation":"W-M (3-2-2-3)"},
    {"key":"metodo", "name":"波佐条理队",   "ovr":81, "style":"possession",     "formation":"Metodo (2-3-2-3)"},
    {"key":"trident","name":"三叉戟",       "ovr":74, "style":"counter_attack", "formation":"3-3-3-1"},
    {"key":"anchor", "name":"锚点堡垒",     "ovr":78, "style":"central",        "formation":"3-1-4-2"},
     # 补齐 Gemini 那三个阵型
    {"key":"cattelanti","name":"卡特兰蒂骑士",  "ovr":77, "style":"catenaccio",     "formation":"5-2-3"},
    {"key":"canaria",   "name":"金丝雀桑巴",    "ovr":79, "style":"kick_and_rush",  "formation":"4-2-4"},
    {"key":"trinity",   "name":"暗夜三叉戟",    "ovr":80, "style":"counter_attack", "formation":"3-4-2-1"},
    # 新阵型对应
    {"key":"apollo",    "name":"阿波罗之光",    "ovr":76, "style":"total_football", "formation":"3-4-3 钻石"},
    {"key":"spartan",   "name":"斯巴达 300",   "ovr":74, "style":"catenaccio",     "formation":"4-5-1"},
    {"key":"tempest",   "name":"风暴前哨",      "ovr":75, "style":"gegenpressing",  "formation":"4-2-1-3"},
    {"key":"maestro",   "name":"梅西托大师",    "ovr":83, "style":"false_nine",     "formation":"4-3-3 F9"},
    {"key":"kickers",   "name":"皇家踢冲队",    "ovr":71, "style":"kick_and_rush",  "formation":"3-3-4"},
    {"key":"rossoneri", "name":"红黑军团",      "ovr":81, "style":"catenaccio",     "formation":"4-4-1-1"},
    {"key":"orange",    "name":"橙衣飓风",      "ovr":85, "style":"total_football", "formation":"3-4-3"},

]

_AI_NAMES = {
    "gk": [
        "巴斯蒂安", "康拉德", "威廉·勒鲁", "伊塔洛", "洛克·维", "塔米尔", "诺亚·冯", 
        "亚历山大", "迪特尔", "莱诺", "奥利弗", "埃米尔", "朱利叶斯", "库尔特", 
        "弗朗西斯科", "伊戈尔", "马克西姆", "雅辛", "布莱恩", "雨果", "卡里姆",
        "多纳鲁马", "切赫", "卡西利亚", "戈登", "弗拉基米尔", "雷纳", "斯特凡",
        "奥古斯特", "塞巴斯蒂安", "曼努埃尔", "雨果·洛"
    ],
    "def": [
        "托尔比昂", "格罗斯", "克尔特斯", "海因茨", "博林", "阿方索", "塞尔吉奥", 
        "比利·穆", "维罗", "多明戈", "阿德里安", "乌尔里希", "雷金", "斯特凡", 
        "布鲁诺", "菲利普", "加雷斯", "卢卡斯", "蒂亚戈", "克里斯蒂安", "大卫", 
        "马尔科", "尼科", "安东尼奥", "弗拉多", "本杰明", "丹尼尔", "加布里埃尔", 
        "文森特", "阿尔贝托", "迭戈", "伊万", "约西普", "戈登", "内曼亚", "弗兰克", 
        "卡洛斯", "齐格飞", "瓦尔特", "马尔蒂尼", "普约尔", "坎贝尔", "胡梅尔",
        "佩佩", "瓦拉内", "赞布罗塔", "基耶利尼", "迪亚斯", "坎塞洛"
    ],
    "mid": [
        "洛伦佐", "希尔顿", "伊万·科洛", "西格玛", "德米特里", "路易吉", "巴罗斯", 
        "约翰·卡", "罗宾", "尼古拉", "杰罗姆", "佩德罗", "米卡", "克莱恩", "西蒙", 
        "法尔克", "阿贝尔", "凯文", "卢卡", "恩戈洛", "保罗", "托尼", "安德烈斯", 
        "哈维", "泽马", "马里奥", "桑德罗", "伊利亚", "奥斯卡", "费尔南多", 
        "弗兰基", "莱昂", "马特乌斯", "亚历桑德罗", "贝纳多", "恩里克", "弗洛伦齐", 
        "达尼埃尔", "里卡多", "德布劳", "莫德里", "齐达内", "皮尔洛", "杰拉德",
        "兰帕德", "巴拉克", "坎特", "卡塞米罗", "布斯克茨", "伊涅斯塔", "罗伊斯"
    ],
    "fwd": [
        "埃里克·冯", "亚瑟·罗恩", "维克多", "菲尼克斯", "达米安", "凯撒·雷", 
        "奥列格", "拉斐尔", "塞德里克", "恩佐", "布莱克", "伊格纳", "罗基", "斯诺", 
        "巴顿", "雷诺", "泽维尔", "基利安", "埃尔林", "罗伯特", "莱昂内尔", 
        "瓦伦丁", "卢克", "泽恩", "贾斯汀", "克鲁兹", "狄奥多", "阿波罗", 
        "达雷尔", "杰克逊", "兰斯", "弗拉霍", "朱利安", "赫苏斯", "马丁内斯", 
        "冈萨洛", "阿玛德", "桑乔", "蒂埃里", "舍甫琴", "德罗巴", "阿奎罗",
        "克里斯蒂亚", "内马尔", "苏亚雷斯", "本泽马", "萨拉赫", "马内", "斯特林",
        "哈兰德", "劳塔罗", "奥斯梅恩", "克洛泽", "范佩西", "鲁尼"
    ]
}

# ==== 联赛分级体系 ====
LEAGUE_TIERS = {
    "克超": {"full":"克苏鲁超级联赛","short":"克超","ovr_range":(82,93),"color":"#d4af37"},
    "冠":   {"full":"克苏鲁冠军联赛","short":"克冠","ovr_range":(74,85),"color":"#7dd3fc"},
    "甲":   {"full":"克苏鲁甲级联赛","short":"克甲","ovr_range":(66,77),"color":"#22c55e"},
    "乙":   {"full":"克苏鲁乙级联赛","short":"克乙","ovr_range":(60,70),"color":"#94a3b8"},
    "全国": {"full":"克苏鲁全国联赛","short":"全国","ovr_range":(55,65),"color":"#a3734b"},
}
LEAGUE_TIER_ORDER = ["全国","乙","甲","冠","克超"]

def determine_initial_league_tier(team_avg):
    """首次开联赛：按球队均分定，最高只到甲级"""
    if team_avg >= 72: return "甲"
    if team_avg >= 65: return "乙"
    return "全国"

LEAGUE_TEAM_COUNT = 16
LEAGUE_RELEGATION_COUNT = 2

def _pick_league_ais(tier, n=15):
    """按 tier 从弱到强分档抽取 AI，形成'弱鸡→王者'的分布"""
    lo, hi = LEAGUE_TIERS[tier]["ovr_range"]
    pool = [t for t in AI_TEAM_POOL if lo <= t["ovr"] <= hi]
    if len(pool) < n:
        mid = (lo + hi) / 2
        pool = sorted(AI_TEAM_POOL, key=lambda t:(abs(t["ovr"]-mid), random.random()))[:max(n, 24)]
    pool.sort(key=lambda t: t["ovr"])
    # 分 3 档：弱 40%，中 40%，强 20%
    if len(pool) <= n: return random.sample(pool, min(n,len(pool)))
    weak = pool[:len(pool)//3]
    mid = pool[len(pool)//3:2*len(pool)//3]
    strong = pool[2*len(pool)//3:]
    n_w = int(n * 0.4); n_s = max(2, int(n * 0.2)); n_m = n - n_w - n_s
    picks = (random.sample(weak, min(n_w,len(weak))) +
             random.sample(mid, min(n_m,len(mid))) +
             random.sample(strong, min(n_s,len(strong))))
    while len(picks) < n:
        extra = random.choice(pool)
        if extra not in picks: picks.append(extra)
    return picks

def _synth_ai_card(team_key, slot, base_ovr):
    role = POSITION_ROLE.get(slot, "mid")
    is_gk = (slot == "GK")
    key = "gk" if is_gk else ("fwd" if role=="fwd" else ("def" if role=="def" else "mid"))
    seed = hash(f"{team_key}_{slot}") & 0xffffffff
    rng = random.Random(seed)
    name = rng.choice(_AI_NAMES[key])
    def gen(bias=0):
        return max(30, min(99, int(base_ovr + bias + rng.gauss(0, 4))))
    if is_gk:
        stats = {"div":gen(2),"han":gen(),"kic":gen(-3),"ref":gen(2),"spd":gen(-5),"pos":gen(3)}
    else:
        w = POSITION_WEIGHTS.get(slot, {})
        stats = {}
        for k in ("pac","sho","pas","dri","def","phy"):
            wv = w.get(k, 0.15)
            bias = int((wv - 0.15) * 40)
            stats[k] = gen(bias)
    ovr = int(sum(stats.values()) / len(stats))
    tier = "Icon" if ovr>=85 else ("Gold" if ovr>=75 else ("Silver" if ovr>=65 else "Bronze"))
    return {"card_id":f"ai_{team_key}_{slot}","name":name,"position":slot,
            "stats":stats,"ovr":ovr,"tier_name":tier,"is_rare":False,
            "is_gk":is_gk,"avatar":None}

def _synth_ai_full_roster(ai_team):
    """生成完整 AI 阵容（首发 + 6 替补），一次生成，赛季共用"""
    layout = FORMATIONS[ai_team["formation"]]
    cards = {}
    starters = {}
    for slot in layout:
        c = _synth_ai_card(ai_team["key"], slot, ai_team["ovr"])
        cards[c["card_id"]] = c
        starters[slot] = c["card_id"]
    # 生成 6 位替补：1 GK + 2 DEF + 2 MID + 1 FWD
    bench_specs = [("GK", "sub_gk"), ("CB", "sub_cb1"), ("LB", "sub_lb"),
                    ("CM", "sub_cm1"), ("CAM", "sub_cam"), ("ST", "sub_st")]
    bench = []
    for slot, key_suffix in bench_specs:
        c = _synth_ai_card(f"{ai_team['key']}_{key_suffix}", slot, ai_team["ovr"]-4)
        cards[c["card_id"]] = c
        bench.append(c["card_id"])
    return {"formation":ai_team["formation"],"style":ai_team.get("style",""),
            "starters":starters,"bench":bench,"cards":cards}

def _get_or_create_ai_roster(career, ai_team):
    """从 career.ai_rosters 拿或首次生成"""
    career.setdefault("ai_rosters", {})
    key = ai_team["key"]
    if key not in career["ai_rosters"]:
        career["ai_rosters"][key] = _synth_ai_full_roster(ai_team)
    return career["ai_rosters"][key]

def build_ai_side(ai_team, career=None):
    if career is not None:
        roster = _get_or_create_ai_roster(career, ai_team)
    else:
        roster = _synth_ai_full_roster(ai_team)
    cards = {cid: dict(c) for cid, c in roster["cards"].items()}  # 深拷贝
    starters = dict(roster["starters"])
    bench = list(roster["bench"])
    ovrs = [cards[cid]["ovr"] for cid in starters.values()]
    return {
        "user_key": f"ai_{ai_team['key']}", "formation": roster["formation"],
        "starters": starters, "bench": bench, "cards_snapshot": cards,
        "stamina": {cid:100 for cid in cards}, "form": {cid:0 for cid in cards},
        "goals":0, "shots":0, "subs_left":5, "pending_tactic":None,
        "style": roster["style"], "team_ovr": sum(ovrs)/len(ovrs),
        "red_cards":0, "yellow_cards":{}, "morale_boost":1.0,
        "player_stats":{cid:default_pstat() for cid in cards},
        "sent_off":[], "all_participants":list(starters.values()),
    }

def ai_pick_tactic(ai_team, user_ovr):
    """AI 战术：根据实力差 + 风格倾向"""
    delta = ai_team["ovr"] - user_ovr
    if delta > 5: pool = ["attack","balance","attack"]
    elif delta < -5: pool = ["defend","balance","defend","all_defend"]
    else: pool = ["balance","attack","defend"]
    # 风格偏移
    style = ai_team.get("style","")
    if style == "high_press": pool += ["attack","all_attack"]
    if style == "park_bus": pool += ["all_defend","defend"]
    if style == "counter_attack": pool += ["defend","balance"]
    return random.choice(pool)

def load_career(uk):
    p = os.path.join(CAREER_DIR, f"{uk}.json")
    if os.path.exists(p):
        with open(p,"r",encoding="utf-8") as f:
            c = json.load(f)
        # 兼容老存档
        if c.get("mode") == "cup" and "season_num" not in c:
            prof = load_profile(uk)
            c["season_num"] = prof.get("cup_season_num", 1)
        prof = load_profile(uk)
        c.setdefault("media_relation", prof.get("media_relation", 0))
        c.setdefault("media_history", [])
        c.setdefault("press_conference", None)
        c.setdefault("career_streak", 0)
        c.setdefault("best_win_streak", 0)
        c.setdefault("worst_loss_streak", 0)
        c.setdefault("press_bland_streak", 0)
        c.setdefault("press_tone_history", [])
        pending = c.get("press_conference")
        if pending and pending.get("available") and not pending.get("question_id"):
            fallback = PRESS_QUESTIONS["tactics_doubt"]
            pending["question_id"] = "tactics_doubt"
            pending["question"] = random.choice(fallback["question"])
            pending["options"] = list(fallback["options"].keys())
        return c
    return None

def save_career(c):
    with open(os.path.join(CAREER_DIR, f"{c['user_key']}.json"),"w",encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False, separators=(',', ':'))

def _round_robin(keys, double=True):
    n = len(keys); ks = list(keys)
    if n % 2: ks.append(None); n += 1
    fixtures, idx = [], 0
    home_offset = random.randint(0, 1)
    for rnd in range(n-1):
        for i in range(n//2):
            left, right = ks[i], ks[n-1-i]
            # 圆桌法中的固定首位需要按轮次翻转，否则会连续全主场。
            # 其余对阵也交错主客，使前半程每队尽量保持 7/8 场平衡。
            if (rnd + i + home_offset) % 2 == 0:
                h, a = left, right
            else:
                h, a = right, left
            if h and a:
                fixtures.append({"idx":idx,"round":rnd+1,"home":h,"away":a,"played":False,"score":None})
                idx += 1
        ks = [ks[0]] + [ks[-1]] + ks[1:-1]
    if double:
        first_leg = list(fixtures)
        base = len(first_leg)
        for f in first_leg:
            fixtures.append({"idx":base+f["idx"],"round":f["round"]+n-1,
                             "home":f["away"],"away":f["home"],"played":False,"score":None})
    return fixtures

def start_league(uk, team_name):
    prof = load_profile(uk)
    # 首次开赛按球队均分决定级别
    if not prof.get("current_league_tier"):
        cards = load_cards(uk)
        squad = load_squad(uk, context="pve")
        sc = [cards[cid] for cid in squad["starters"].values() if cid in cards]
        avg = sum(c["ovr"] for c in sc)/max(1,len(sc))
        prof["current_league_tier"] = determine_initial_league_tier(avg)
    tier = prof["current_league_tier"]
    prof["league_season_num"] += 1
    save_profile(prof)
    season = prof["league_season_num"]

    ais = _pick_league_ais(tier, LEAGUE_TEAM_COUNT - 1)
    teams = [{"key":"user","name":team_name,"is_user":True}] + \
            [{"key":t["key"],"name":t["name"],"ai":t,"is_user":False} for t in ais]
    fixtures = _round_robin([t["key"] for t in teams], double=True)
    table = {t["key"]:{"team":t["name"],"P":0,"W":0,"D":0,"L":0,"GF":0,"GA":0,"Pts":0} for t in teams}
    return {"user_key":uk,"mode":"league","status":"active","teams":teams,
            "fixtures":fixtures,"current_match":0,"table":table,
            "league_tier":tier, "season_num":season,
            "suspensions":{},"yellow_accum":{},"injuries":{},
            "recruit_left":8,
            "stats":{"scorers":{},"assists":{},"saves":{}},
            "extra_cards":{},"recruit_candidates":None,"active_effects":[],"active_match":None,
            "history_log":[],"press_conference":None,
            "media_relation":prof.get("media_relation",0),"media_history":[],
            "career_streak":0,"best_win_streak":0,"worst_loss_streak":0,
            "press_bland_streak":prof.get("press_bland_streak",0),
            "press_tone_history":list(prof.get("press_tone_history",[]))[:12],
            "created_at":datetime.datetime.now().isoformat()}

def start_cup(uk, team_name):
    prof = load_profile(uk)
    prof["cup_season_num"] += 1
    save_profile(prof)
    season = prof["cup_season_num"]

    ai_pool = [t for t in AI_TEAM_POOL if t["ovr"] >= 68]
    if len(ai_pool) < 31:
        extra = [t for t in AI_TEAM_POOL if t["ovr"] >= 60 and t not in ai_pool]
        ai_pool = ai_pool + extra
    if len(ai_pool) < 31:
        raise RuntimeError(f"AI 池不足 31 队（当前 {len(ai_pool)}），无法开杯赛")
    ais = random.sample(ai_pool, 31)

    # teams[0] 永远是用户，AI 按顺序跟在后面
    teams = [{"key":"user","name":team_name,"is_user":True}] + \
            [{"key":t["key"],"name":t["name"],"ai":t,"is_user":False} for t in ais]

    # 分组位置随机化：32 个坑，用户占一个随机坑，AI 填其余
    positions = [None] * 32
    user_slot = random.randint(0, 31)
    positions[user_slot] = teams[0]
    ai_shuffled = list(teams[1:])
    random.shuffle(ai_shuffled)
    idx = 0
    for pos in range(32):
        if positions[pos] is None:
            positions[pos] = ai_shuffled[idx]
            idx += 1

    groups = {}
    user_group = None
    for i, gname in enumerate("ABCDEFGH"):
        gteams = positions[i*4:(i+1)*4]
        gmatches = []
        for a in range(4):
            for b in range(a+1, 4):
                gmatches.append({"home":gteams[a]["key"],"away":gteams[b]["key"],
                                 "played":False,"score":None,"group":gname})
        random.shuffle(gmatches)
        groups[gname] = {
            "teams":[t["key"] for t in gteams],
            "matches":gmatches,
            "table":{t["key"]:{"team":t["name"],"P":0,"W":0,"D":0,"L":0,
                               "GF":0,"GA":0,"Pts":0} for t in gteams},
        }
        if any(t["key"] == "user" for t in gteams):
            user_group = gname

    if user_group is None:
        raise RuntimeError("start_cup 未能给 user 分配小组")

    return {"user_key":uk,"mode":"cup","status":"active","teams":teams,
            "bracket":{"phase":"group","groups":groups,"user_group":user_group,
                       "stages":[],"current_stage":0},
            "current_match":0,
            "season_num": season,
            "suspensions":{},"yellow_accum":{},"injuries":{},
            "recruit_left":0,
            "stats":{"scorers":{},"assists":{},"saves":{}},
            "extra_cards":{},"recruit_candidates":None,"active_effects":[],"active_match":None,
            "history_log":[],"press_conference":None,
            "media_relation":prof.get("media_relation",0),"media_history":[],
            "career_streak":0,"best_win_streak":0,"worst_loss_streak":0,
            "press_bland_streak":prof.get("press_bland_streak",0),
            "press_tone_history":list(prof.get("press_tone_history",[]))[:12],
            "created_at":datetime.datetime.now().isoformat()}

def _get_ai_team(career, key):
    for t in career["teams"]:
        if t["key"] == key: return t
    return None

def _next_fixture(career):
    if career["mode"] == "league":
        for f in career["fixtures"]:
            if not f["played"] and (f["home"]=="user" or f["away"]=="user"):
                return f
        # 常规赛打完 → 检查附加赛
        po = career.get("playoff")
        if po and not po["played"] and po.get("user_involved"):
            return {"home":po["home"], "away":po["away"],
                    "played":False, "score":None, "is_playoff":True}
        return None
    # 杯赛
    br = career["bracket"]
    if br["phase"] == "group":
        ug = br["user_group"]
        for m in br["groups"][ug]["matches"]:
            if not m["played"] and (m["home"]=="user" or m["away"]=="user"):
                return m
        return None
    # 淘汰赛
    if br["current_stage"] < len(br["stages"]):
        stage = br["stages"][br["current_stage"]]
        for m in stage["matches"]:
            if not m["played"] and (m["home"]=="user" or m["away"]=="user"):
                return m
    return None

def _find_fixture_ref(career, ref):
    """按 home+away 匹配到实际 fixture"""
    if career["mode"] == "league":
        # 附加赛优先匹配
        po = career.get("playoff")
        if po and not po["played"] and po["home"]==ref["home"] and po["away"]==ref["away"]:
            return po
        # 常规 fixture
        for f in career["fixtures"]:
            if f["home"]==ref["home"] and f["away"]==ref["away"] and not f.get("played"):
                return f
    else:
        br = career["bracket"]
        if br["phase"] == "group":
            for m in br["groups"][br["user_group"]]["matches"]:
                if m["home"]==ref["home"] and m["away"]==ref["away"] and not m.get("played"):
                    return m
        else:
            stage = br["stages"][br["current_stage"]]
            for m in stage["matches"]:
                if m["home"]==ref["home"] and m["away"]==ref["away"] and not m.get("played"):
                    return m
    return None

def _sim_other_group_matches(career, played_ref):
    """用户比赛后，推进其他 AI 比赛。用户组内非用户场也推进 1 场，其他组每次推 2 场；
    当用户小组赛全打完时，强制完成所有剩余 AI 比赛"""
    br = career["bracket"]
    if br["phase"] != "group": return
    # 用户本组：非用户参与的场次推进 1 场
    user_g = br["groups"][br["user_group"]]
    for m in user_g["matches"]:
        if not m["played"] and m["home"] != "user" and m["away"] != "user":
            res = _sim_ai_vs_ai(career, m["home"], m["away"])
            if res:
                hg, ag = res
                m["played"] = True
                m["score"] = f"{hg}:{ag}"
                _update_group_table(user_g["table"], m, hg, ag)
            break
    # 其他组：每组推进 2 场（补上没有用户占位的差距）
    for gname, g in br["groups"].items():
        if gname == br["user_group"]: continue
        count = 0
        for m in g["matches"]:
            if not m["played"]:
                res = _sim_ai_vs_ai(career, m["home"], m["away"])
                if res:
                    hg, ag = res
                    m["played"] = True
                    m["score"] = f"{hg}:{ag}"
                    _update_group_table(g["table"], m, hg, ag)
                count += 1
                if count >= 2: break
    # 用户已打完所有小组赛 → 强制补完所有 AI 比赛
    user_left = sum(1 for m in user_g["matches"]
                    if not m["played"] and (m["home"]=="user" or m["away"]=="user"))
    if user_left == 0:
        for g in br["groups"].values():
            for m in g["matches"]:
                if not m["played"]:
                    res = _sim_ai_vs_ai(career, m["home"], m["away"])
                    if res:
                        hg, ag = res
                        m["played"] = True
                        m["score"] = f"{hg}:{ag}"
                        _update_group_table(g["table"], m, hg, ag)

def _update_group_table(table, fixture, hg, ag):
    for tk, gf, ga in [(fixture["home"], hg, ag), (fixture["away"], ag, hg)]:
        row = table[tk]
        row["P"] += 1; row["GF"] += gf; row["GA"] += ga
        if gf > ga: row["W"] += 1; row["Pts"] += 3
        elif gf == ga: row["D"] += 1; row["Pts"] += 1
        else: row["L"] += 1

def _check_group_stage_complete(career):
    """所有小组打完 → 生成淘汰赛 16 强"""
    br = career["bracket"]
    if br["phase"] != "group": return False
    all_done = all(m["played"] for g in br["groups"].values() for m in g["matches"])
    if not all_done: return False
    # 每组前 2 出线
    qualified = []
    for gname in "ABCDEFGH":
        g = br["groups"][gname]
        ranked = sorted(g["table"].items(),
                        key=lambda x: (-x[1]["Pts"], -(x[1]["GF"]-x[1]["GA"]), -x[1]["GF"]))
        qualified.append(ranked[0][0])  # 头名
        qualified.append(ranked[1][0])  # 次名
    # 16 强对阵：A1-B2, B1-A2, C1-D2, ...
    r16 = []
    order = [(0,3),(2,1),(4,7),(6,5),(8,11),(10,9),(12,15),(14,13)]
    for i, j in order:
        r16.append({"home":qualified[i],"away":qualified[j],"played":False,"score":None})
    br["stages"].append({"name":"1/8 决赛","matches":r16})
    br["phase"] = "knockout"
    br["current_stage"] = 0
    return True

def _advance_cup_new(career, is_home, user_won, is_draw, hg, ag):
    """淘汰赛推进"""
    br = career["bracket"]
    if br["phase"] == "group":
        # 小组赛结束检查
        if _check_group_stage_complete(career):
            # 检查用户是否出线
            ug = br["user_group"]
            ranked = sorted(br["groups"][ug]["table"].items(),
                            key=lambda x: (-x[1]["Pts"], -(x[1]["GF"]-x[1]["GA"]), -x[1]["GF"]))
            top2 = [k for k,_ in ranked[:2]]
            if "user" not in top2:
                career["status"] = "done"
                career["cup_winner"] = "eliminated_group"
        return
    # 淘汰赛
    stage = br["stages"][br["current_stage"]]
    for m in stage["matches"]:
        is_user_match = (m["home"]=="user" or m["away"]=="user")
        if is_user_match:
            # finalize_career_match 会先把当前 fixture 标成 played，
            # 因此这里必须按 winner 是否存在判断，而不能直接跳过 played。
            if m.get("winner"): continue
            m["played"] = True
            m["score"] = f"{hg}:{ag}"
            user_adv = user_won or (is_draw and random.random() < 0.5)
            m["winner"] = "user" if user_adv else (m["away"] if m["home"]=="user" else m["home"])
        else:
            if m.get("played") and m.get("winner"): continue
            # 兼容旧存档：played=true 且已有比分，但缺少 winner。
            old_score = str(m.get("score") or "")
            if m.get("played") and ":" in old_score:
                try:
                    old_hg, old_ag = [int(x) for x in old_score.split(":",1)]
                    m["winner"] = (random.choice([m["home"],m["away"]]) if old_hg == old_ag
                                   else (m["home"] if old_hg > old_ag else m["away"]))
                    continue
                except (TypeError, ValueError):
                    pass
            res = _sim_ai_vs_ai(career, m["home"], m["away"])
            if res:
                hg2, ag2 = res
                if hg2 == ag2:
                    m["winner"] = random.choice([m["home"], m["away"]])
                else:
                    m["winner"] = m["home"] if hg2>ag2 else m["away"]
                m["score"] = f"{hg2}:{ag2}"
                m["played"] = True
    if all(m.get("played") and m.get("winner") for m in stage["matches"]):
        winners = [m["winner"] for m in stage["matches"]]
        if len(winners) == 1:
            career["status"] = "done"
            career["cup_winner"] = winners[0]
            return
        next_matches = []
        for i in range(0, len(winners), 2):
            next_matches.append({"home":winners[i],"away":winners[i+1],
                                 "score":None,"played":False})
        stage_names = {8:"1/8 决赛",4:"1/4 决赛",2:"半决赛",1:"决赛"}
        next_name = stage_names.get(len(next_matches), f"1/{len(next_matches)}决赛")
        br["stages"].append({"name":next_name,"matches":next_matches})
        br["current_stage"] += 1
        # 用户被淘汰？
        if "user" not in winners:
            career["status"] = "done"
            career["cup_winner"] = "eliminated_ko"

def _sim_ai_vs_ai(career, home_key, away_key):
    """AI 之间对阵：算比分 + 分配球员数据（简化版）"""
    h = _get_ai_team(career, home_key); a = _get_ai_team(career, away_key)
    if not h.get("ai") or not a.get("ai"): return None
    if career.get("mode") == "league":
        # 只有联赛存在主客场，杯赛统一按中立场。
        diff = h["ai"]["ovr"] * random.uniform(1.02, 1.06) - \
               a["ai"]["ovr"] * random.uniform(0.95, 1.00)
    else:
        diff = h["ai"]["ovr"] - a["ai"]["ovr"]
    hg = max(0, int(round(random.gauss(1.4 + diff*0.06, 1.1))))
    ag = max(0, int(round(random.gauss(1.4 - diff*0.06, 1.1))))
    # 分配数据到球员（用完整阵容）
    _distribute_ai_stats(career, h["ai"], hg, ag)
    _distribute_ai_stats(career, a["ai"], ag, hg)
    return hg, ag

def _distribute_ai_stats(career, ai_team, goals_for, goals_against):
    """把 AI 队伍的进球、助攻、扑救分配到具体球员，写入 season stats"""
    roster = _get_or_create_ai_roster(career, ai_team)
    cards = roster["cards"]
    starters = roster["starters"]
    ai_uk = f"ai_{ai_team['key']}"
    st = career["stats"]
    st.setdefault("saves", {})

    # 收集前场球员用于分配进球
    fwd_pool = []
    for slot, cid in starters.items():
        if POSITION_ROLE.get(slot) in ("fwd","atk_mid","mid"):
            c = cards[cid]
            fwd_pool.append((cid, c, c["stats"].get("sho", 40)))
    fwd_pool.sort(key=lambda x: -x[2])

    def _pick_scorer(exclude=None):
        pool = [x for x in fwd_pool if x[0] != exclude]
        if not pool: return None
        weights = [max(1, x[2]**2) for x in pool]
        return random.choices(pool, weights=weights, k=1)[0]

    prev_scorer = None
    for _ in range(goals_for):
        pick = _pick_scorer()
        if not pick: break
        cid, c, _s = pick
        entry = st["scorers"].setdefault(cid, {"name":c["name"],"team_key":ai_uk,"goals":0})
        entry["goals"] += 1
        entry["name"] = c["name"]
        # 70% 概率有助攻
        if random.random() < 0.7:
            assister = _pick_scorer(exclude=cid)
            if assister:
                acid, ac, _ = assister
                ae = st["assists"].setdefault(acid, {"name":ac["name"],"team_key":ai_uk,"assists":0})
                ae["assists"] += 1
                ae["name"] = ac["name"]
        prev_scorer = cid

    # 门将扑救 = 对方进球 × 0.6~1.2 场随机
    gk_cid = starters.get("GK")
    if gk_cid:
        c = cards[gk_cid]
        saves = max(0, int(round(random.uniform(0.5, 2.5) + goals_against * 0.3)))
        entry = st["saves"].setdefault(gk_cid, {"name":c["name"],"team_key":ai_uk,"saves":0})
        entry["saves"] += saves
        entry["name"] = c["name"]

def ai_pick_tactic_round(ai_team, user_ovr, ai_goals, opp_goals, round_no):
    """AI 每回合根据比分调整战术"""
    style = ai_team.get("style","")
    diff = ai_goals - opp_goals
    if diff >= 2:   pool = ["defend","balance","defend","all_defend"]
    elif diff == 1: pool = ["balance","defend","balance"]
    elif diff == 0:
        delta = ai_team["ovr"] - user_ovr
        pool = ["balance","attack"] if delta >= 0 else ["balance","defend"]
    elif diff == -1: pool = ["attack","balance","attack"]
    else:            pool = ["attack","all_attack","attack"]
    # 风格微调
    if style in ("high_press","gegenpressing"): pool += ["attack"]
    if style in ("park_bus","catenaccio"):
        pool = [t for t in pool if t != "all_attack"]
        if diff >= 0: pool += ["defend"]
    if style == "counter_attack" and diff <= 0: pool += ["defend","balance"]
    if round_no >= 5 and diff < 0: pool += ["all_attack"]   # 落后 + 末段死冲
    return random.choice(pool)

def _name_of(career, key):
    for t in career["teams"]:
        if t["key"] == key: return t["name"]
    return key

def _season_ending_reminder(career):
    """赛季末尾生成提示（联赛：末 3 轮；杯赛：淘汰赛阶段）"""
    if career["mode"] == "league":
        played = sum(1 for f in career["fixtures"] if f["played"]
                     and (f["home"]=="user" or f["away"]=="user"))
        total = sum(1 for f in career["fixtures"]
                    if f["home"]=="user" or f["away"]=="user")
        remaining = total - played
        if remaining < 1 or remaining > 3: return None

        rows = sorted(career["table"].values(),
                      key=lambda r:(-r["Pts"],-(r["GF"]-r["GA"]),-r["GF"]))
        user_name = career["teams"][0]["name"]
        rank = next((i+1 for i,r in enumerate(rows) if r["team"]==user_name), len(rows))
        row = rows[rank-1]
        tier = career.get("league_tier","全国")
        idx = LEAGUE_TIER_ORDER.index(tier)
        is_top = (idx == len(LEAGUE_TIER_ORDER)-1)
        is_bottom = (idx == 0)
        n_teams = len(rows)

        lines = [f"⏰ 赛季倒数 {remaining} 场 · 你当前排名 {rank}/{n_teams}"]

        # 末位威胁（前 3 场就开始警告降级）
        if rank >= n_teams - 1 and not is_bottom:
            below = LEAGUE_TIER_ORDER[idx-1]
            safe_pts = rows[n_teams-3]["Pts"] if n_teams >= 3 else 0
            gap = max(0, safe_pts - row["Pts"])
            lines.append(f"💔 危险！保级区第 {rank} 名")
            lines.append(f"   距离安全区还差 {gap} 分 → 若继续摆烂将降入【{LEAGUE_TIERS[below]['full']}】")
            lines.append(f"   💡 建议：加练 · 招募 · 全力进攻拿分")

        # 中游平淡
        elif 4 <= rank <= n_teams - 2:
            lines.append(f"📊 中游位置，冲击附加赛 (2-3 名) 还需追分")
            if rank <= 6:
                top3_pts = rows[2]["Pts"]
                gap = max(0, top3_pts - row["Pts"])
                if gap <= 6:
                    lines.append(f"🎯 距离附加赛（第 3 名）仅差 {gap} 分，冲一把！")

        # 冠军竞争
        elif rank <= 3 and not is_top:
            up = LEAGUE_TIER_ORDER[idx+1]
            if rank == 1:
                lines.append(f"👑 榜首领跑！保住 → 直升【{LEAGUE_TIERS[up]['full']}】")
            else:
                first_pts = rows[0]["Pts"]
                gap = max(0, first_pts - row["Pts"])
                if gap <= 4:
                    lines.append(f"🔥 距榜首仅差 {gap} 分！有望翻盘直升")
                else:
                    lines.append(f"🎯 稳住 2-3 名进升级附加赛")

        # 顶级联赛
        elif rank == 1 and is_top:
            lines.append(f"👑 卫冕【{LEAGUE_TIERS[tier]['full']}】冠军近在咫尺！")

        return "\n".join(lines) if len(lines) > 1 else None

    # 杯赛分支：修同样 bug
    else:
        br = career["bracket"]
        if br["phase"] == "group":
            g = br["groups"][br["user_group"]]
            played = sum(1 for m in g["matches"] if m["played"]
                         and (m["home"]=="user" or m["away"]=="user"))
            total_user = sum(1 for m in g["matches"]
                             if m["home"]=="user" or m["away"]=="user")
            remaining = total_user - played
            if remaining < 1 or remaining > 2: return None

            ranked = sorted(g["table"].items(),
                            key=lambda x:(-x[1]["Pts"],-(x[1]["GF"]-x[1]["GA"]),-x[1]["GF"]))
            user_pos = next(i+1 for i,(k,_) in enumerate(ranked) if k=="user")
            row = ranked[user_pos-1][1]
            lines = [f"⏰ 小组赛倒数 {remaining} 场 · 你在 {br['user_group']} 组第 {user_pos} 名"]

            if user_pos == 1:
                lines.append("✅ 头名出线在望，稳住即可晋级 16 强")
            elif user_pos == 2:
                # 第 2 名要防被追
                gap_below = row["Pts"] - ranked[2][1]["Pts"]
                if gap_below <= 0:
                    lines.append("⚠️ 出线区被追平，需继续拿分保住第 2")
                else:
                    lines.append(f"✅ 目前出线区，领先第 3 名 {gap_below} 分，稳住！")
            else:
                # 第 3+ 名，看跟第 2 名差距
                second = ranked[1][1]
                gap = second["Pts"] - row["Pts"]
                max_addable = remaining * 3
                if gap == 0:
                    gd_gap = (second["GF"]-second["GA"]) - (row["GF"]-row["GA"])
                    gf_gap = second["GF"] - row["GF"]
                    if gd_gap > 0:
                        lines.append(f"⚠️ 与第 2 名同分，净胜球差 {gd_gap}，必须多进球拉净胜球")
                    elif gf_gap > 0:
                        lines.append(f"⚠️ 与第 2 名同分同净胜球，进球少 {gf_gap}，全力进攻")
                    else:
                        lines.append("⚠️ 与第 2 名各项持平，剩余比赛必须比对手多拿分")
                elif gap > max_addable:
                    lines.append(f"💔 落后第 2 名 {gap} 分，剩 {remaining} 场最多拿 {max_addable} 分，出线概率极小")
                else:
                    need_wins = (gap + 2) // 3   # 向上取整每 3 分算 1 胜
                    lines.append(f"⚠️ 落后第 2 名 {gap} 分，剩 {remaining} 场至少赢 {need_wins} 场")

            return "\n".join(lines)

        elif br["phase"] == "knockout":
            stage = br["stages"][br["current_stage"]]
            for m in stage["matches"]:
                if not m.get("played") and (m["home"]=="user" or m["away"]=="user"):
                    return f"⏰ {stage['name']} · 一场定生死！赢下即晋级，输就出局！"
    return None

def _finalize_league_season(career, prof):
    rows = sorted(career["table"].values(),
                  key=lambda r:(-r["Pts"], -(r["GF"]-r["GA"]), -r["GF"]))
    user_name = career["teams"][0]["name"]
    user_rank = next((i+1 for i,r in enumerate(rows) if r["team"]==user_name), len(rows))
    tier = career.get("league_tier","全国")
    season = career.get("season_num",1)

    po = career.get("playoff") or {}
    po_winner_key = po.get("winner")
    user_won_playoff = (po_winner_key == "user")

    prof["honors"]["league"].append({
        "tier":tier, "season":season, "rank":user_rank,
        "P":rows[user_rank-1]["P"] if user_rank<=len(rows) else 0,
        "Pts":rows[user_rank-1]["Pts"] if user_rank<=len(rows) else 0,
        "playoff_win": user_won_playoff,
    })

    # 最佳战绩权重（附加赛升级 = 2.5 名相当）
    tier_score = LEAGUE_TIER_ORDER.index(tier) * 20
    effective_rank = user_rank
    if user_rank in (2,3) and user_won_playoff:
        effective_rank = 1.5   # 附加赛胜者比第 2 名更好
    cur_score = tier_score + (len(rows) + 1 - effective_rank)
    best = prof["honors"].get("best_league_rank")
    if not best or (LEAGUE_TIER_ORDER.index(best["tier"])*20 + 20-best["rank"]) < cur_score:
        prof["honors"]["best_league_rank"] = {"tier":tier,"rank":user_rank,"season":season,
                                               "playoff_win":user_won_playoff}

    # 升降级
    idx = LEAGUE_TIER_ORDER.index(tier)
    is_top = (idx == len(LEAGUE_TIER_ORDER)-1)
    is_bottom = (idx == 0)

    if user_rank == 1 and not is_top:
        new_tier = LEAGUE_TIER_ORDER[idx+1]
        msg = f"🎊 冠军！{LEAGUE_TIERS[tier]['full']} → 直升 {LEAGUE_TIERS[new_tier]['full']}！"
    elif user_rank == 1 and is_top:
        new_tier = tier
        msg = f"👑 卫冕 {LEAGUE_TIERS[tier]['full']} 冠军！已站在巅峰之上！"
    elif user_rank in (2, 3) and user_won_playoff and not is_top:
        new_tier = LEAGUE_TIER_ORDER[idx+1]
        msg = f"🎯 升级附加赛胜出！{LEAGUE_TIERS[tier]['full']} → 晋级至 {LEAGUE_TIERS[new_tier]['full']}！"
    elif user_rank in (2, 3) and not user_won_playoff:
        new_tier = tier
        msg = f"💧 附加赛失利，排名第 {user_rank}，留在 {LEAGUE_TIERS[tier]['full']}"
    elif user_rank > len(rows) - LEAGUE_RELEGATION_COUNT and not is_bottom:
        new_tier = LEAGUE_TIER_ORDER[idx-1]
        msg = f"💔 保级失败：{LEAGUE_TIERS[tier]['full']} → 降入 {LEAGUE_TIERS[new_tier]['full']}"
    elif user_rank > len(rows) - LEAGUE_RELEGATION_COUNT and is_bottom:
        new_tier = tier
        msg = f"🛡️ 惨居末位但受全国联赛保底庇护，继续留在 {LEAGUE_TIERS[tier]['full']}"
    else:
        new_tier = tier
        msg = f"📊 排名第 {user_rank} 名，留在 {LEAGUE_TIERS[tier]['full']}"

    prof["current_league_tier"] = new_tier

    # 招募卡解约
    freed = _clear_recruits_and_effects(career)
    if freed > 0:
        msg += f"\n📤 本届赛季招募的 {freed} 位球员已解约离队"

    prof["current_league_tier"] = new_tier
    save_profile(prof)
    return tier, user_rank, new_tier, msg

def _finalize_abandoned_league(career, prof):
    """中止联赛赛季：只结算降级（末位），忽略升级"""
    if career["mode"] != "league":
        return None
    rows = sorted(career["table"].values(),
                  key=lambda r:(-r["Pts"], -(r["GF"]-r["GA"]), -r["GF"]))
    user_name = career["teams"][0]["name"]
    user_rank = next((i+1 for i,r in enumerate(rows) if r["team"]==user_name), len(rows))
    tier = career.get("league_tier","全国")
    season = career.get("season_num",1)
    idx = LEAGUE_TIER_ORDER.index(tier)
    is_bottom = (idx == 0)

    # 已打场数（门槛：至少 3 场才结算降级，防止刚开赛就中止）
    played = sum(1 for f in career.get("fixtures",[])
                 if f.get("played") and (f["home"]=="user" or f["away"]=="user"))

    # 记录一条"中止"荣誉
    prof["honors"]["league"].append({
        "tier": tier, "season": season, "rank": user_rank,
        "P": played, "Pts": rows[user_rank-1]["Pts"] if user_rank<=len(rows) else 0,
        "abandoned": True,
    })

    if played < 3:
        save_profile(prof)
        return f"⚠️ 仅打了 {played} 场就中止，未达降级门槛，留在 {LEAGUE_TIERS[tier]['full']}"

    if user_rank > len(rows) - LEAGUE_RELEGATION_COUNT and not is_bottom:
        new_tier = LEAGUE_TIER_ORDER[idx-1]
        prof["current_league_tier"] = new_tier
        save_profile(prof)
        return (f"💔 中止时排名第 {user_rank} 名（末位），"
                f"{LEAGUE_TIERS[tier]['full']} → 降入 {LEAGUE_TIERS[new_tier]['full']}")
    elif user_rank > len(rows) - LEAGUE_RELEGATION_COUNT and is_bottom:
        save_profile(prof)
        return (f"🛡️ 中止时排名第 {user_rank} 名，"
                f"受 {LEAGUE_TIERS[tier]['full']} 保底庇护，不降级")
    else:
        save_profile(prof)
        return (f"📊 中止时排名第 {user_rank} 名，"
                f"未触发降级，留在 {LEAGUE_TIERS[tier]['full']}"
                f"（升级奖励不结算）")
    
def _check_and_setup_playoff(career):
    """常规赛结束后设置 2v3 附加赛"""
    if career["mode"] != "league": return False
    if career.get("playoff") is not None: return False
    if any(not f["played"] for f in career["fixtures"]): return False
    tier = career.get("league_tier","全国")
    if tier == "克超": return False   # 顶级联赛无升级

    rows = sorted(career["table"].items(),
                  key=lambda x:(-x[1]["Pts"], -(x[1]["GF"]-x[1]["GA"]), -x[1]["GF"]))
    if len(rows) < 3: return False
    second_key, third_key = rows[1][0], rows[2][0]
    career["playoff"] = {
        "home": second_key, "away": third_key,
        "played": False, "winner": None, "score": None,
        "user_involved": ("user" in (second_key, third_key)),
    }
    return True

def _auto_sim_playoff(career):
    po = career["playoff"]
    res = _sim_ai_vs_ai(career, po["home"], po["away"])
    if res:
        hg, ag = res
        # 附加赛不能平：模拟点球
        while hg == ag:
            hg += 1 if random.random() < 0.5 else 0
            ag += 1 if random.random() < 0.5 else 0
        po["played"] = True
        po["score"] = f"{hg}:{ag}"
        po["winner"] = po["home"] if hg > ag else po["away"]

def _record_playoff_news(career, r):
    po = career["playoff"]
    hn = _name_of(career, po["home"])
    an = _name_of(career, po["away"])
    wn = _name_of(career, po["winner"])
    msg = (f"\n\n🎯 升级附加赛（未涉及你的球队）：\n"
           f"   {hn} vs {an} → {po['score']}\n"
           f"🏆 附加赛胜者：{wn}（升级）")
    r["news"] = (r.get("news") or "") + msg

def _is_season_truly_ended(career):
    """联赛：所有常规赛 + 附加赛都完成才算终结"""
    if career["mode"] == "cup":
        return career["status"] == "done"
    if not all(f["played"] for f in career["fixtures"]):
        return False
    if career.get("league_tier") == "克超":
        return True   # 顶级无附加赛
    po = career.get("playoff")
    if po is None:
        return False   # 还没 setup
    return po["played"]

def _clear_recruits_and_effects(career):
    """赛季收尾：招募卡解约 + 清空事件效果"""
    n = len(career.get("extra_cards", {}))
    career["extra_cards"] = {}
    career["recruit_candidates"] = None
    career["active_effects"] = []
    # 从伤停/累积名单里清掉招募卡引用（不然显示会挂着）
    for cid in list(career.get("injuries", {})):
        if cid.startswith("rec_"): del career["injuries"][cid]
    for cid in list(career.get("suspensions", {})):
        if cid.startswith("rec_"): del career["suspensions"][cid]
    for cid in list(career.get("yellow_accum", {})):
        if cid.startswith("rec_"): del career["yellow_accum"][cid]
    return n

# ===== 生涯点球大战 =====
DIR_CN_MAP = {"左":"L","中":"C","右":"R","左路":"L","中路":"C","右路":"R",
              "left":"L","center":"C","right":"R","middle":"C","centre":"C",
              "l":"L","c":"C","r":"R","L":"L","C":"C","R":"R"}
DIR_CN = {"L":"左路","C":"中路","R":"右路"}
DIRS = ("L","C","R")

def _is_knockout_or_playoff(career, m):
    if m.get("is_playoff"): return True
    if career["mode"] == "cup" and career["bracket"].get("phase") == "knockout":
        return True
    return False

def _get_side_gk_val(side):
    gk_cid = side["starters"].get("GK")
    if not gk_cid: return 50
    c = side["cards_snapshot"].get(gk_cid)
    if not c: return 50
    if c.get("is_gk"):
        s = c["stats"]
        return (s.get("div",60)+s.get("ref",60)+s.get("han",60)+s.get("pos",60))/4
    return (c["stats"].get("def",50)+c["stats"].get("phy",50))/2 * 0.75

def _get_side_gk_name(side):
    gk_cid = side["starters"].get("GK")
    if not gk_cid: return "门将"
    c = side["cards_snapshot"].get(gk_cid)
    return c["name"] if c else "门将"

def init_career_shootout(m):
    def kickers_of(side):
        cards = side["cards_snapshot"]
        cand = []
        for slot, cid in side["starters"].items():
            if slot == "GK": continue
            c = cards.get(cid)
            if not c: continue
            cand.append((c["stats"].get("sho", 40), cid, c["name"]))
        cand.sort(key=lambda x: -x[0])
        return [{"cid":cid,"name":name,"sho":s} for s,cid,name in cand[:5]]
    m["shootout"] = {
        "round": 1, "max_regular": 5,
        "home_kickers": kickers_of(m["home"]),
        "away_kickers": kickers_of(m["away"]),
        "home_goals": 0, "away_goals": 0,
        "home_shots": 0, "away_shots": 0,
        "history": [],
    }

def _ai_gk_dir(shooter_dir, gk_val):
    """AI 门将猜方向：GK 越强越可能识破"""
    read_rate = max(0.0, min(0.55, (gk_val - 60) * 0.016))
    if random.random() < read_rate:
        return shooter_dir
    return random.choice(DIRS)

def _ai_shooter_dir(gk_dir, sho):
    """AI 射手：SHO 越高越可能避开玩家扑救方向"""
    read_rate = max(0.0, min(0.42, (sho - 60) * 0.013))
    if random.random() < read_rate:
        avoid = [d for d in DIRS if d != gk_dir]
        return random.choice(avoid)
    return random.choice(DIRS)

def _resolve_pk_shot(shooter_dir, gk_dir, sho, gk_val):
    """单个点球结算。SHO/GK 只做小幅调整，方向猜测才是决定性因素"""
    sho_bonus = (sho - 70) * 0.004
    gk_bonus = (gk_val - 70) * 0.004
    if gk_dir == shooter_dir:
        if shooter_dir == "C":
            base = 0.45 + sho_bonus - gk_bonus   # 双方都选中间，门将站桩
        else:
            base = 0.25 + sho_bonus - gk_bonus   # 同侧扑救
    else:
        if shooter_dir == "C":
            base = 0.90 + sho_bonus              # 打中路，门将扑边
        elif gk_dir == "C":
            base = 0.83 + sho_bonus              # 打边路，门将保守中间
        else:
            base = 0.88 + sho_bonus              # 打边路，门将扑反侧
    conv = max(0.10, min(0.97, base))
    if random.random() < conv:
        return {"goal": True, "type": "goal"}
    if gk_dir == shooter_dir:
        return {"goal": False, "type": "save"}
    if random.random() < 0.35:
        return {"goal": False, "type": "save"}
    return {"goal": False, "type": "miss"}

def _check_career_shootout_end(so):
    hg, ag = so["home_goals"], so["away_goals"]
    hs, as_ = so["home_shots"], so["away_shots"]
    remain_h = so["max_regular"] - hs
    remain_a = so["max_regular"] - as_
    if hs <= so["max_regular"] and hg > ag + remain_a: return True, "home"
    if as_ <= so["max_regular"] and ag > hg + remain_h: return True, "away"
    if hs >= so["max_regular"] and as_ >= so["max_regular"]:
        if hg != ag: return True, ("home" if hg > ag else "away")
    if hs > so["max_regular"] and hs == as_ and hg != ag:
        return True, ("home" if hg > ag else "away")
    return False, None

def _build_career_pk_text(u_res, a_res, so):
    lines = [f"⚽ 【点球大战 第 {so['round']} 轮】"]
    def line_for(res, tag):
        if not res: return None
        ds = DIR_CN[res["shot_dir"]]
        dg = DIR_CN[res["gk_dir"]]
        if res["goal"]:
            emoji = "⚽ 破门！"
            if res["shot_dir"] != res["gk_dir"]:
                emoji += "（猜错方向）" if random.random() < 0.5 else "（判断失误）"
        elif res["type"] == "save":
            emoji = "🧤 神扑！" if res["shot_dir"] == res["gk_dir"] else "🧤 侧扑！"
        else:
            emoji = "❌ 打偏！"
        return f"{tag} {res['kicker']} 射【{ds}】｜{res['gk']} 扑【{dg}】｜{emoji}"
    l1 = line_for(u_res, "🟢 我方")
    if l1: lines.append(l1)
    l2 = line_for(a_res, "🔴 对方")
    if l2: lines.append(l2)
    lines.append(f"⏱ 当前比分：{so['home_goals']} : {so['away_goals']}")
    return "\n".join(lines)

def career_penalty_step(career, shot_input, save_input):
    m = career.get("active_match")
    if not m or m.get("phase") != "shootout":
        return {"error":"当前不在点球大战阶段"}
    shot_dir = DIR_CN_MAP.get(shot_input)
    save_dir = DIR_CN_MAP.get(save_input)
    if not shot_dir or not save_dir:
        return {"error":"方向需为 左 / 中 / 右"}

    so = m["shootout"]
    is_home = m["is_home"]
    user_side = m["home"] if is_home else m["away"]
    ai_side = m["away"] if is_home else m["home"]

    r = so["round"]
    u_kickers_key = "home_kickers" if is_home else "away_kickers"
    a_kickers_key = "away_kickers" if is_home else "home_kickers"
    u_kicker = so[u_kickers_key][(r-1) % len(so[u_kickers_key])]
    a_kicker = so[a_kickers_key][(r-1) % len(so[a_kickers_key])]

    ai_gk_val = _get_side_gk_val(ai_side)
    user_gk_val = _get_side_gk_val(user_side)

    # 我方射 vs AI 守
    ai_gk_dir = _ai_gk_dir(shot_dir, ai_gk_val)
    u_res = _resolve_pk_shot(shot_dir, ai_gk_dir, u_kicker["sho"], ai_gk_val)
    u_res.update({"kicker":u_kicker["name"], "gk":_get_side_gk_name(ai_side),
                  "shot_dir":shot_dir, "gk_dir":ai_gk_dir})
    u_shots_key = "home_shots" if is_home else "away_shots"
    u_goals_key = "home_goals" if is_home else "away_goals"
    so[u_shots_key] += 1
    if u_res["goal"]:
        so[u_goals_key] += 1

    ended, winner = _check_career_shootout_end(so)

    a_res = None
    if not ended:
        ai_shot_dir = _ai_shooter_dir(save_dir, a_kicker["sho"])
        a_res = _resolve_pk_shot(ai_shot_dir, save_dir, a_kicker["sho"], user_gk_val)
        a_res.update({"kicker":a_kicker["name"], "gk":_get_side_gk_name(user_side),
                      "shot_dir":ai_shot_dir, "gk_dir":save_dir})
        a_shots_key = "away_shots" if is_home else "home_shots"
        a_goals_key = "away_goals" if is_home else "home_goals"
        so[a_shots_key] += 1
        if a_res["goal"]:
            so[a_goals_key] += 1
        ended, winner = _check_career_shootout_end(so)

    if is_home:
        so["history"].append({"round":r, "home":u_res, "away":a_res,
                               "home_goals":so["home_goals"], "away_goals":so["away_goals"]})
    else:
        so["history"].append({"round":r, "home":a_res, "away":u_res,
                               "home_goals":so["home_goals"], "away_goals":so["away_goals"]})
    so["round"] += 1

    text = _build_career_pk_text(u_res, a_res, so)
    img = render_penalty_board(m)

    if ended:
        return {"phase":"shootout_final","commentary":text,"img":img,
                "winner_side":winner,
                "score":f"{so['home_goals']}:{so['away_goals']}"}
    return {"phase":"shootout_round","commentary":text,"img":img,
            "score":f"{so['home_goals']}:{so['away_goals']}",
            "next_round":so["round"]}

def _post_finalize_check(career, r_dict):
    """联赛/杯赛的赛后处理，供 career_play 和 career_pen 共用"""
    if r_dict is None: r_dict = {}
    if career["mode"] == "league":
        if all(f["played"] for f in career["fixtures"]) and career.get("playoff") is None:
            if _check_and_setup_playoff(career):
                po = career["playoff"]
                if not po["user_involved"]:
                    _auto_sim_playoff(career)
                    _record_playoff_news(career, r_dict)
                else:
                    hn = _name_of(career, po["home"])
                    an = _name_of(career, po["away"])
                    r_dict["news"] = (r_dict.get("news") or "") + \
                        f"\n\n🎯 常规赛结束！你进入 2v3 升级附加赛！\n对阵：{hn} vs {an}"
    ended = _is_season_truly_ended(career)
    if ended:
        career["status"] = "done"
        prof = load_profile(career["user_key"])
        if career["mode"] == "league":
            _, urank, _, promo = _finalize_league_season(career, prof)
            r_dict["news"] = (r_dict.get("news") or "") + f"\n\n📢 联赛全部结束！\n{promo}"
        else:
            cup_news = _finalize_cup_season(career, prof)
            if cup_news:
                r_dict["news"] = (r_dict.get("news") or "") + "\n\n" + cup_news
    return ended

def _career_progress_summary(career):
    """生成每场赛后的赛季位置播报，供赛后简报图片使用。"""
    if career.get("mode") == "league":
        rows = sorted(career.get("table", {}).values(),
                      key=lambda r:(-r["Pts"],-(r["GF"]-r["GA"]),-r["GF"]))
        if not rows: return None
        user_name = career.get("teams", [{}])[0].get("name")
        rank = next((i+1 for i,r in enumerate(rows) if r.get("team")==user_name), None)
        if rank is None: return None
        row = rows[rank-1]
        total_user = sum(1 for f in career.get("fixtures",[])
                         if "user" in (f.get("home"),f.get("away")))
        remaining = max(0, total_user-row.get("P",0))
        leader_gap = max(0, rows[0]["Pts"]-row["Pts"])
        lines = [f"📊 联赛位置：第 {rank}/{len(rows)} 名 · {row['Pts']} 分 · "
                 f"{row['W']}胜 {row['D']}平 {row['L']}负 · 剩余 {remaining} 场"]
        if rank == 1:
            lead = row["Pts"]-rows[1]["Pts"] if len(rows)>1 else row["Pts"]
            lines.append(f"👑 当前领跑积分榜，领先第 2 名 {max(0,lead)} 分")
        elif rank <= 3:
            lines.append(f"🎯 位于升级竞争区，距离榜首 {leader_gap} 分")
        elif rank > len(rows)-LEAGUE_RELEGATION_COUNT:
            safe = rows[max(0,len(rows)-LEAGUE_RELEGATION_COUNT-1)]["Pts"]
            lines.append(f"⚠️ 当前处于降级区，距离安全位置 {max(0,safe-row['Pts'])} 分")
        else:
            lines.append(f"📈 当前距离榜首 {leader_gap} 分")
        po = career.get("playoff")
        if po and not po.get("played") and po.get("user_involved"):
            lines.append(f"🎯 常规赛结束，下一场为升级附加赛：{_name_of(career,po['home'])} vs {_name_of(career,po['away'])}")
        return "\n".join(lines)

    br = career.get("bracket") or {}
    ug = br.get("user_group")
    if ug and ug in br.get("groups",{}):
        group = br["groups"][ug]
        ranked = sorted(group["table"].items(),
                        key=lambda x:(-x[1]["Pts"],-(x[1]["GF"]-x[1]["GA"]),-x[1]["GF"]))
        pos = next((i+1 for i,(key,_) in enumerate(ranked) if key=="user"), None)
        user_row = next((row for key,row in ranked if key=="user"), None)
    else:
        pos = None; user_row = None

    winner = career.get("cup_winner")
    if winner == "eliminated_group":
        return (f"🚫 杯赛结果：{ug} 组第 {pos} 名，小组赛出局\n"
                f"📋 小组战绩：{user_row['W']}胜 {user_row['D']}平 {user_row['L']}负 · {user_row['Pts']} 分")
    if winner == "eliminated_ko":
        last_stage = "淘汰赛"
        for stage in br.get("stages",[]):
            if any(m.get("played") and "user" in (m.get("home"),m.get("away")) for m in stage.get("matches",[])):
                last_stage = stage.get("name",last_stage)
        return f"🚫 杯赛结果：止步 {last_stage}，本届杯赛征程结束"
    if winner == "user":
        return "🏆 杯赛结果：夺得哈斯塔杯冠军！"
    if winner:
        return f"🏆 哈斯塔杯已经结束，冠军：{_name_of(career,winner)}"
    if br.get("phase") == "group" and user_row:
        user_played = sum(1 for m in group["matches"] if m.get("played") and "user" in (m.get("home"),m.get("away")))
        total_user = sum(1 for m in group["matches"] if "user" in (m.get("home"),m.get("away")))
        zone = "目前位于出线区" if pos and pos <= 2 else "目前位于小组出线区外"
        return (f"📊 小组位置：{ug} 组第 {pos}/4 名 · {user_row['Pts']} 分 · {zone}\n"
                f"📋 小组赛已完成 {user_played}/{total_user} 场")
    if br.get("phase") == "knockout":
        stages = br.get("stages",[]); idx = br.get("current_stage",0)
        stage_name = stages[idx].get("name","淘汰赛") if 0 <= idx < len(stages) else "淘汰赛"
        return f"✅ 杯赛进程：成功晋级，下一阶段为 {stage_name}"
    return None

def _refresh_post_match_image(career, r_dict):
    context = r_dict.get("_post_context") or {}
    if not context: return
    progress = _career_progress_summary(career)
    if progress:
        r_dict["news"] = "\n\n".join(x for x in [r_dict.get("news"),progress] if x)
    r_dict["post_img"] = render_post_match_image(
        context["match_id"],context["home_name"],context["away_name"],
        context["score"],r_dict.get("events"),r_dict.get("news"))

def _finalize_cup_season(career, prof):
    """杯赛结束：记录 4 强、冠军、用户战绩"""
    br = career["bracket"]
    season = career.get("season_num",1)

    # 找半决赛的 4 支球队
    four_strong = []
    for stage in br.get("stages", []):
        if stage["name"] == "半决赛":
            for m in stage["matches"]:
                four_strong.append(_name_of(career, m["home"]))
                four_strong.append(_name_of(career, m["away"]))
            break

    # 冠军
    champion = None
    wk = career.get("cup_winner")
    if wk and wk not in ("eliminated_group","eliminated_ko"):
        champion = _name_of(career, wk)

    # 用户走到哪
    user_reached = "小组赛"
    if wk == "eliminated_group":
        user_reached = "小组赛出局"
    elif wk == "eliminated_ko":
        # 找用户最后一场淘汰赛
        for stage in br.get("stages", []):
            for m in stage["matches"]:
                if m.get("played") and (m["home"]=="user" or m["away"]=="user"):
                    user_reached = f"{stage['name']}出局"
    else:
        for stage in br.get("stages", []):
            for m in stage["matches"]:
                if m.get("played") and (m["home"]=="user" or m["away"]=="user"):
                    user_reached = stage["name"]

    entry = {"season":season, "four_strong":four_strong,
             "champion":champion, "user_reached":user_reached,
             "user_result":"冠军" if wk=="user" else user_reached}
    prof["honors"]["cup"].append(entry)

    # 最佳杯赛战绩（冠军 > 亚军 > 4 强 > ...）
    stage_score = {"冠军":100,"决赛":80,"半决赛":60,"1/4 决赛":40,"1/8 决赛":20,"小组赛":10,"小组赛出局":10}
    cur = stage_score.get(entry["user_result"], 0)
    best = prof["honors"].get("best_cup")
    if not best or stage_score.get(best["user_result"], 0) < cur:
        prof["honors"]["best_cup"] = entry.copy()
    save_profile(prof)

    # 播报文本
    lines = []
    lines.append(f"🏆 【哈斯塔第 {season} 届杯赛】收官")
    if four_strong:
        lines.append(f"🥉 四强：{' · '.join(four_strong)}")
    if champion:
        lines.append(f"👑 冠军：{champion}")
    if wk == "user":
        lines.append("🎊🎊🎊 恭喜你举起哈斯塔奖杯！")
    else:
        lines.append(f"📍 你的战绩：{entry['user_result']}")
    
    # 招募卡解约
    freed = _clear_recruits_and_effects(career)
    if freed > 0:
        lines.append(f"📤 本届杯赛招募的 {freed} 位球员已解约离队")

    return "\n".join(lines)

def build_user_side_for_career(uk, career):
    """
    生涯阵容构建：
    - PVE slot 里的 starters 是"主力"，非伤停必上（无论 OVR）
    - 空位补充顺序：PVE 替补 → 其他正式卡 → 招募卡
    - 保证 GK 位只用 GK 卡
    """
    squad = load_squad(uk, context="pve")
    official_cards = load_cards(uk)
    extra_cards = career.get("extra_cards", {})
    all_cards = {**official_cards, **extra_cards}
    formation = squad["formation"]
    if formation not in FORMATIONS:
        formation = "4-3-3"
    layout = FORMATIONS[formation]
    # 伤停名单
    unavail = set()
    for cid, sus in career.get("suspensions", {}).items():
        if sus.get("matches_out", 0) > 0: unavail.add(cid)
    for cid, inj in career.get("injuries", {}).items():
        if inj.get("matches_out", 0) > 0: unavail.add(cid)
    # === 第一步：主力就位（跳过伤停/被删除）===
    starters = {}
    used = set()
    for slot, cid in squad["starters"].items():
        if slot not in layout: continue
        if cid in unavail: continue
        if cid not in all_cards: continue
        starters[slot] = cid
        used.add(cid)
    # === 第二步：按优先级补空位 ===
    empty_slots = [s for s in layout if s not in starters]
    if empty_slots:
        # 候选池按优先级排序
        pve_bench = [cid for cid in squad["bench"]
                     if cid not in used and cid not in unavail and cid in all_cards]
        pool_seen = set(pve_bench) | used
        other_official = [cid for cid in official_cards
                          if cid not in pool_seen and cid not in unavail]
        pool_seen |= set(other_official)
        recruit_pool = [cid for cid in extra_cards
                        if cid not in pool_seen and cid not in unavail]
        # 主力回归优先：伤愈/停赛期满的会自然回到 official_cards 里被选
        candidates = pve_bench + other_official + recruit_pool
        for slot in empty_slots:
            need_gk = (slot == "GK")
            best, best_score = None, -1
            for cid in candidates:
                if cid in used: continue
                c = all_cards[cid]
                if c.get("is_gk", False) != need_gk: continue
                pv = position_ovr(c, slot)
                if pv > best_score:
                    best, best_score = cid, pv
            if best:
                starters[slot] = best
                used.add(best)
    # === 第三步：替补席（PVE 替补优先，招募卡最后）===
    bench_ordered = []
    for cid in squad["bench"]:
        if cid not in used and cid not in unavail and cid in all_cards:
            bench_ordered.append(cid)
    for cid in official_cards:
        if cid not in used and cid not in unavail and cid not in bench_ordered:
            bench_ordered.append(cid)
    for cid in extra_cards:
        if cid not in used and cid not in unavail and cid not in bench_ordered:
            bench_ordered.append(cid)
    # 组内按 OVR 降序，但保留三档优先级
    def _sort_key(cid):
        # 组号越小优先级越高
        if cid in squad["bench"]: g = 0
        elif cid in official_cards: g = 1
        else: g = 2
        return (g, -all_cards[cid]["ovr"])
    bench_ordered.sort(key=_sort_key)
    bench = bench_ordered[:6]
    # === 组装 side ===
    all_cids = list(starters.values()) + bench
    cards_snapshot = {cid: all_cards[cid] for cid in all_cids if cid in all_cards}
    stamina = {cid: 100 for cid in all_cids}
    form = {cid: random.randint(-5, 8) for cid in all_cids}
    ovrs = [cards_snapshot[cid]["ovr"] for cid in starters.values() if cid in cards_snapshot]
    team_ovr = sum(ovrs) / len(ovrs) if ovrs else 60
    return {
        "user_key": uk, "formation": formation,
        "starters": starters, "bench": bench,
        "cards_snapshot": cards_snapshot,
        "stamina": stamina, "form": form,
        "goals": 0, "shots": 0, "subs_left": 5, "pending_tactic": None,
        "style": squad.get("style", ""),
        "team_ovr": team_ovr,
        "red_cards": 0, "yellow_cards": {}, "morale_boost": 1.0,
        "player_stats": {cid: default_pstat() for cid in all_cids},
        "sent_off": [],
        "all_participants": list(starters.values()),
    }, list(unavail)

def _build_full_ratings(m, winner_side=None):
    """双方球员评分（含 AI），供评分图使用"""
    hg, ag = m["home"]["goals"], m["away"]["goals"]
    is_draw = (hg == ag)
    def slot_of(side, cid):
        for s, v in side["starters"].items():
            if v == cid: return s
        return None
    ratings = []
    for side, side_name, is_winner in [
        (m["home"], m["home_name"], hg > ag),
        (m["away"], m["away_name"], ag > hg)
    ]:
        cids = list(side.get("all_participants", list(side["starters"].values()))) + side.get("sent_off", [])
        seen = set()
        cids = [c for c in cids if not (c in seen or seen.add(c))]
        for cid in cids:
            c = side["cards_snapshot"].get(cid)
            if not c: continue
            slot = slot_of(side, cid) or (c.get("position","?") + "↓")
            role = POSITION_ROLE.get(slot, "mid")
            ps = side.get("player_stats", {}).get(cid, default_pstat())
            r = 6.5
            r += 0.4 if is_winner else (-0.3 if not is_draw else 0)
            if role in ("def","def_mid"): r += ps["goals"] * 1.8
            elif role == "mid": r += ps["goals"] * 1.4
            else: r += ps["goals"] * 1.1
            r += ps["assists"] * 0.7
            # 中场维度
            r += ps.get("key_passes", 0) * 0.18
            r += ps.get("interceptions", 0) * 0.12
            r += ps.get("chances_created", 0) * 0.10
            r -= ps.get("turnovers", 0) * 0.15
            if c.get("is_gk"):
                r += ps["saves"] * 0.35
                if ps["conceded"] == 0: r += 0.7
                r -= ps["conceded"] * 0.35
            r -= ps["yellow"] * 0.4
            r -= ps["red"] * 2.0
            r -= ps["own_goal"] * 1.5
            r -= ps["blunder"] * 1.5
            r += random.uniform(-0.3, 0.4)
            r = max(4.0, min(10.0, round(r, 1)))
            ratings.append({"name":c["name"],"team":side_name,"position":slot,
                            "rating":r,"goals":ps["goals"],"assists":ps["assists"],
                            "saves":ps["saves"],"yellow":ps["yellow"],"red":ps["red"],
                            "own_goal":ps.get("own_goal",0),"blunder":ps.get("blunder",0)})
    ratings.sort(key=lambda x: -x["rating"])
    mvp = ratings[0]["name"] if ratings else "?"
    return ratings, mvp


def _update_season_stats_both(career, user_side, ai_side):
    """双方球员数据都进射手/助攻/扑救榜"""
    st = career["stats"]
    st.setdefault("saves", {})
    for side in (user_side, ai_side):
        team_name = side.get("_team_name")  # 可选
        for cid, ps in side.get("player_stats", {}).items():
            c = side["cards_snapshot"].get(cid)
            if not c: continue
            base = {"name":c["name"],"team_key":side.get("user_key","?")}
            if ps.get("goals",0):
                st["scorers"].setdefault(cid, {**base,"goals":0})["goals"] += ps["goals"]
                st["scorers"][cid]["name"] = c["name"]
            if ps.get("assists",0):
                st["assists"].setdefault(cid, {**base,"assists":0})["assists"] += ps["assists"]
                st["assists"][cid]["name"] = c["name"]
            if ps.get("saves",0):
                st["saves"].setdefault(cid, {**base,"saves":0})["saves"] += ps["saves"]
                st["saves"][cid]["name"] = c["name"]


NEWS_TEMPLATES = {
    "big_win": ["🗞️ 头版：《{team} {score} 大胜 {opp}！{mvp} 状态如虹》",
                "📰 权威解读：《{team} 血洗 {opp}，{mvp} 一战封神》",
                "⚡ 比赛焦点：《火力全开！{team} 用一场大胜震动联赛》",
                "📊 数据观察：《从控球到射门全面压制，{team} 赢得毫无悬念》",
                "🎙️ 赛后热议：《{opp} 防线崩溃，{team} 展现冠军级攻击力》"],
    "big_loss": ["📉 媒体质疑：《{team} {score} 惨败 {opp}，主帅位置岌岌可危》",
                 "🗞️ 舆论压力：《{team} 遭遇滑铁卢，输给 {opp} 令人失望》",
                 "🚨 危机警报：《防线全面失守，{team} 必须立即寻找答案》",
                 "📺 评论席：《这不只是输球，{team} 的比赛方式同样令人担忧》",
                 "🧩 战术复盘：《{opp} 击中每一个弱点，{team} 全场被动》"],
    "upset_win": ["✨ 冷门连连：《以弱胜强！{team} 爆冷击败 {opp}！》",
                  "💥 惊天爆冷：《{team} 击败 {opp}，赛前无人看好》",
                  "🌠 黑马之夜：《总评落后仍敢于对攻，{team} 创造本轮最大惊喜》",
                  "🔥 逆势而上：《纸面实力不是答案，{team} 用执行力推翻预测》",
                  "📣 全场沸腾：《弱者不弱！{team} 让强大的 {opp} 无功而返》"],
    "favorite_win": ["✅ 实力兑现：《{team} 击败 {opp}，没有给冷门留下空间》",
                     "📈 强队节奏：《总评优势转化为胜势，{team} 稳稳拿下比赛》",
                     "🏆 拒绝意外：《{team} 完成强队应有的任务》",
                     "🎯 预期之内：《{team} 控制局面，顺利战胜 {opp}》"],
    "favorite_failure": ["😱 超级冷门：《纸面占优的 {team} 竟然输给 {opp}》",
                         "📉 强队翻车：《总评优势毫无体现，{team} 遭遇沉重打击》",
                         "🧨 本轮震荡：《{opp} 击倒热门，{team} 的傲慢付出代价》",
                         "🔍 赛后追问：《阵容明显更强，为何 {team} 仍然输球？》",
                         "🚫 优势浪费：《{team} 手握更强阵容，却交出失望答卷》"],
    "underdog_draw": ["🛡️ 顽强守分：《实力处于下风的 {team} 逼平 {opp}》",
                      "👏 赢得尊重：《{team} 用纪律性抵消明显的总评差距》",
                      "🧱 黑马韧性：《{opp} 久攻不下，{team} 带走宝贵一分》",
                      "✨ 超额完成：《面对强敌，{team} 的平局含金量十足》"],
    "favorite_draw": ["⚠️ 意外失分：《实力占优的 {team} 被 {opp} 顽强逼平》",
                      "📉 两分溜走：《{team} 未能兑现阵容优势》",
                      "🤔 强队疑问：《面对较弱对手，{team} 为何迟迟打不开局面？》",
                      "🧤 久攻无果：《{team} 占据优势，却只能接受平局》"],
    "narrow_win": ["🎯 惊险取胜：《{team} {score} 小胜 {opp}，{mvp} 关键先生》",
                   "⌛ 最后一刻：《{team} 艰难守住优势，三分来之不易》",
                   "🔒 一球定局：《{team} 在拉锯战中笑到最后》",
                   "💪 苦战过关：《{opp} 制造巨大麻烦，{team} 仍拿下胜利》"],
    "draw": ["🤝 分享积分：《{team} {score} 战平 {opp}，双方难分高下》",
             "⚖️ 势均力敌：《{team} 与 {opp} 各自展现优势》",
             "🧩 拉锯九十分钟：《两队互有攻守，平局符合场面》",
             "📊 数据平衡：《{team} 与 {opp} 谁也没能完成最后一击》"],
    "close_loss": ["💔 惜败：《{team} 与 {opp} 缠斗到底，最终只差一步》",
                   "📉 细节定胜负：《{team} 为一次失误付出代价》",
                   "⏱️ 遗憾终场：《{team} 创造过机会，却没能追回比分》"],
    "hat_trick": ["⚽ 帽子戏法：《{scorer} 单场三球，成为绝对主角》",
                   "🎩 三球之夜：《{scorer} 独自摧毁对手防线》",
                   "🔥 射手爆发：《{scorer} 用帽子戏法接管比赛》"],
    "clean_sheet": ["🧤 铁闸守护：《门将 {gk} 零封对手，球队获胜关键》",
                    "🔒 城门不失：《{gk} 带领防线完成零封》",
                    "🧱 防守标杆：《{gk} 拒绝对手所有威胁》"],
    "mvp_special": ["🌟 MVP 时刻：《{mvp} 全场最佳，评分 {rating}》",
                    "⭐ 聚光灯：《{mvp} 用 {rating} 分表现定义比赛》",
                    "🏅 官方最佳：《{mvp} 成为决定结果的人》"],
    "ovr_analysis": ["📐 实力对照：《双方总评 {user_ovr:.1f} 比 {opp_ovr:.1f}，结果再次证明比赛不只看纸面》",
                     "📊 阵容观察：《总评差距 {gap:.1f}，临场执行成为真正分水岭》",
                     "🔬 赛后数据：《纸面评分与最终比分之间出现值得研究的偏差》"],
}

def get_strength_result_context(m):
    is_home = m.get("is_home", True)
    user_side = m["home"] if is_home else m["away"]
    opp_side = m["away"] if is_home else m["home"]
    user_ovr = float(user_side.get("team_ovr",70))
    opp_ovr = float(opp_side.get("team_ovr",70))
    gap = user_ovr - opp_ovr
    user_goals = m["home"]["goals"] if is_home else m["away"]["goals"]
    opp_goals = m["away"]["goals"] if is_home else m["home"]["goals"]
    result = "win" if user_goals > opp_goals else ("draw" if user_goals == opp_goals else "loss")
    if gap >= 8:
        key = {"win":"favorite_win","draw":"favorite_draw","loss":"favorite_failure"}[result]
    elif gap <= -8:
        key = {"win":"upset_win","draw":"underdog_draw","loss":"expected_loss"}[result]
    elif abs(gap) <= 3:
        key = "even_match"
    else:
        key = "moderate_gap"
    return {"key":key,"result":result,"user_ovr":user_ovr,"opp_ovr":opp_ovr,
            "gap":gap,"abs_gap":abs(gap)}

def _generate_news(m, user_won, is_draw, ratings, mvp, career, ai_side):
    lines = []
    hg, ag = m["home"]["goals"], m["away"]["goals"]
    is_home = m["is_home"]
    user_goals = hg if is_home else ag
    opp_goals = ag if is_home else hg
    team_name = career["teams"][0]["name"]
    opp_name = m["opp_name"]
    score = f"{user_goals}:{opp_goals}"
    diff = user_goals - opp_goals
    strength = get_strength_result_context(m)

    # 主标题
    if strength["key"] in NEWS_TEMPLATES and strength["key"] not in ("even_match","moderate_gap"):
        lines.append(random.choice(NEWS_TEMPLATES[strength["key"]])
                     .format(team=team_name, opp=opp_name, score=score, mvp=mvp))
    elif user_won and diff >= 3:
        lines.append(random.choice(NEWS_TEMPLATES["big_win"])
                     .format(team=team_name, opp=opp_name, score=score, mvp=mvp))
    elif user_won:
        lines.append(random.choice(NEWS_TEMPLATES["narrow_win"])
                     .format(team=team_name, opp=opp_name, score=score, mvp=mvp))
    elif is_draw:
        lines.append(random.choice(NEWS_TEMPLATES["draw"])
                     .format(team=team_name, opp=opp_name, score=score))
    elif diff <= -3:
        lines.append(random.choice(NEWS_TEMPLATES["big_loss"])
                     .format(team=team_name, opp=opp_name, score=score))
    else:
        lines.append(random.choice(NEWS_TEMPLATES["close_loss"])
                     .format(team=team_name, opp=opp_name, score=score))

    if strength["abs_gap"] >= 6 and random.random() < 0.65:
        lines.append(random.choice(NEWS_TEMPLATES["ovr_analysis"]).format(
            user_ovr=strength["user_ovr"],opp_ovr=strength["opp_ovr"],gap=strength["abs_gap"]))

    # 帽子戏法
    scorers = {}
    us = m["home"] if is_home else m["away"]
    for cid, ps in us.get("player_stats", {}).items():
        if ps.get("goals", 0) >= 3:
            c = us["cards_snapshot"].get(cid)
            if c: lines.append(random.choice(NEWS_TEMPLATES["hat_trick"])
                                .format(scorer=c["name"]))

    # 零封
    if opp_goals == 0:
        gk_cid = us["starters"].get("GK")
        if gk_cid:
            gk = us["cards_snapshot"].get(gk_cid)
            if gk: lines.append(random.choice(NEWS_TEMPLATES["clean_sheet"])
                                 .format(gk=gk["name"]))

    # MVP 高光
    top_rating = max((r["rating"] for r in ratings if r["team"]==team_name), default=0)
    if top_rating >= 9.0:
        lines.append(random.choice(NEWS_TEMPLATES["mvp_special"])
                     .format(mvp=mvp, rating=top_rating))

    return "\n".join(lines) if lines else None

def start_career_match(career):
    """初始化生涯比赛"""
    if career.get("active_match"):
        return {"error":"当前已有比赛进行中"}
    pending_press = career.get("press_conference") or {}
    if pending_press.get("available"):
        pending_press["available"] = False
        pending_press["expired"] = True
    fixture = _next_fixture(career)
    if not fixture: return {"error":"没有下一场比赛"}
    is_home = (fixture["home"] == "user")
    opp_key = fixture["away"] if is_home else fixture["home"]
    opp = _get_ai_team(career, opp_key)
    ai_team = opp["ai"]
    user_side, unavail = build_user_side_for_career(career["user_key"], career)
    if len(user_side["starters"]) < 8:
        return {"error":f"可用球员不足（{len(user_side['starters'])}/11）"}
    ai_side = build_ai_side(ai_team, career)
    effect_msg = apply_active_effects_pre_match(user_side, ai_side, career)
    media_msg = apply_media_environment(user_side, career)
    home_side, away_side = (user_side, ai_side) if is_home else (ai_side, user_side)
    streak = career.get("career_streak",0)
    user_form = max(-5, min(5, streak))
    press_shift = career.pop("venue_press_shift",0.0)
    if career.get("mode") == "league":
        if is_home:
            venue_msg = prepare_venue_atmosphere(home_side, away_side,
                                                 home_form=user_form, home_press=press_shift)
        else:
            venue_msg = prepare_venue_atmosphere(home_side, away_side,
                                                 away_form=user_form, away_press=press_shift)
    else:
        home_side["venue_mult"] = away_side["venue_mult"] = 1.0
        home_side.pop("venue_text", None); away_side.pop("venue_text", None)
        venue_msg = ""
    home_name = career["teams"][0]["name"] if is_home else opp["name"]
    away_name = opp["name"] if is_home else career["teams"][0]["name"]
    m = {"id":f"career_{career['user_key']}_{int(datetime.datetime.now().timestamp())}",
         "home":home_side,"away":away_side,
         "home_name":home_name,"away_name":away_name,
         "home_key":home_side["user_key"],"away_key":away_side["user_key"],
         "history":[],"round":1,"max_round":6,"status":"active",
         "is_home":is_home,"opp_name":opp["name"],"opp_key":opp_key,
         "ai_team_key":ai_team["key"],
         "fixture_ref":{"home":fixture["home"],"away":fixture["away"]},
         "is_playoff": fixture.get("is_playoff", False),
         "effect_msg":"\n".join(x for x in [effect_msg, media_msg] if x),
         "venue_msg":venue_msg,"unavail":list(unavail),"all_text":[],
         "last_user_tactic":"balance"}
    career["active_match"] = m
    return {"match":m,"phase":"started"}


def advance_career_round(career, user_tactic):
    """推进一回合"""
    m = career.get("active_match")
    if not m: return {"error":"没有进行中的比赛"}
    if m.get("phase") == "shootout":
        return {"error":"当前是点球大战，请用 .生涯 点球 <左|中|右> <左|中|右>"}
    ai_team = None
    for t in career["teams"]:
        if t.get("ai") and t["ai"]["key"] == m["ai_team_key"]:
            ai_team = t["ai"]; break
    if not ai_team: return {"error":"AI 数据丢失"}
    is_home = m["is_home"]
    user_side = m["home"] if is_home else m["away"]
    ai_side = m["away"] if is_home else m["home"]
    ai_tactic = ai_pick_tactic_round(ai_team, user_side["team_ovr"],
                                      ai_side["goals"], user_side["goals"], m["round"])
    ht, at = (user_tactic, ai_tactic) if is_home else (ai_tactic, user_tactic)
    m["last_user_tactic"] = user_tactic
    r = m["round"]
    res = simulate_round(m["home"], m["away"], ht, at, r)
    m["home"]["goals"] += res["home_goals"]; m["away"]["goals"] += res["away_goals"]
    m["home"]["shots"] += res["home_shots"]; m["away"]["shots"] += res["away_shots"]
    text = build_commentary(m["home"], m["away"], m["home_name"], m["away_name"],
                             res, show_style_intro=(r==1))
    if r == 1 and m.get("effect_msg"):
        text = m["effect_msg"] + "\n" + text
    m["all_text"].append(text)
    m["history"].append({"round":r,"result":res,"text":text})
    img = render_match_pitch(m, res)
    m["last_img"] = img
    m["round"] += 1
    if r >= m.get("max_round", 6):
        hg, ag = m["home"]["goals"], m["away"]["goals"]
        need_extend = (hg == ag) and _is_knockout_or_playoff(career, m)
        if not need_extend:
            return finalize_career_match(career)
        phase = m.get("phase", "regular")
        if phase == "regular":
            m["phase"] = "extra"
            m["max_round"] = 8
            for side in (m["home"], m["away"]):
                for cid in side["stamina"]:
                    side["stamina"][cid] = min(100, side["stamina"][cid] + 15)
            return {"phase":"extra_start","round":r,"next_round":m["round"],
                    "score":f"{hg}:{ag}",
                    "commentary":text,"img":img,
                    "ai_tactic":TACTIC_CN.get(ai_tactic, ai_tactic),
                    "msg":"⏰ 常规时间战平！进入加时赛（2 回合）\n继续用 .生涯 出战 <战术>"}
        # phase == "extra"
        m["phase"] = "shootout"
        init_career_shootout(m)
        return {"phase":"shootout_start","round":r,
                "score":f"{hg}:{ag}",
                "commentary":text,"img":img,
                "ai_tactic":TACTIC_CN.get(ai_tactic, ai_tactic),
                "msg":"⏰ 加时仍平！进入点球大战！\n用 .生涯 点球 <射方向> <扑救方向>\n方向：左 / 中 / 右"}
    return {"phase":"round_end","round":r,"next_round":m["round"],
            "score":f"{m['home']['goals']}:{m['away']['goals']}",
            "commentary":text,"img":img,"ai_tactic":TACTIC_CN.get(ai_tactic, ai_tactic)}

def advance_career_command(career, kind, value):
    m = career.get("active_match")
    if not m:
        init = start_career_match(career)
        if init.get("error"):
            return init
        m = career["active_match"]
    if m.get("phase") == "shootout":
        return {"error":"点球大战阶段不能使用场边指令"}
    user_side = m["home"] if m["is_home"] else m["away"]
    command = apply_round_command(user_side, kind, value)
    if not command:
        return {"error":"未知场边指令"}
    tactic = m.get("last_user_tactic") or "balance"
    result = advance_career_round(career, tactic)
    if not result.get("error"):
        result["command_text"] = command["text"]
        result["continued_tactic"] = TACTIC_CN.get(tactic, tactic)
    return result

def career_manual_sub(career, on_name, off_name):
    """生涯比赛中的手动换人"""
    m = career.get("active_match")
    if not m: return {"error":"没有进行中的比赛"}
    is_home = m["is_home"]
    user_side = m["home"] if is_home else m["away"]

    if user_side["subs_left"] <= 0:
        return {"error":"换人名额已用完"}

    # 找 off（首发中）
    off_slot, off_cid = None, None
    for slot, cid in user_side["starters"].items():
        c = user_side["cards_snapshot"].get(cid)
        if c and off_name in c["name"]:
            off_slot, off_cid = slot, cid; break
    if not off_cid:
        return {"error":f"首发中没有 {off_name}"}

    # 找 on（替补席）
    on_cid = None
    for cid in user_side["bench"]:
        c = user_side["cards_snapshot"].get(cid)
        if c and on_name in c["name"]:
            on_cid = cid; break
    if not on_cid:
        return {"error":f"替补席没有 {on_name}"}

    # GK 位置只能换 GK
    on_card = user_side["cards_snapshot"][on_cid]
    if (off_slot == "GK") != on_card.get("is_gk", False):
        return {"error":"GK 位只能换 GK，反之亦然"}

    user_side["starters"][off_slot] = on_cid
    user_side["bench"].remove(on_cid)
    user_side["bench"].append(off_cid)
    user_side["subs_left"] -= 1
    user_side.setdefault("all_participants", [])
    if on_cid not in user_side["all_participants"]:
        user_side["all_participants"].append(on_cid)

    off_c = user_side["cards_snapshot"][off_cid]
    return {"ok":True, "off":off_c["name"], "on":on_card["name"],
            "slot":off_slot, "left":user_side["subs_left"]}


def finalize_career_match(career):
    m = career["active_match"]
    is_home = m["is_home"]
    user_side = m["home"] if is_home else m["away"]
    ai_side = m["away"] if is_home else m["home"]
    home_side, away_side = m["home"], m["away"]
    hg, ag = home_side["goals"], away_side["goals"]
    orig_hg, orig_ag = hg, ag

    # 淘汰赛平局点球（小组赛不点球）
    is_playoff_match = m.get("is_playoff", False)
    shootout_msg = None
    so = m.get("shootout")
    if so and (so["home_goals"] != so["away_goals"]):
        winner_side = "home" if so["home_goals"] > so["away_goals"] else "away"
        shootout_msg = f"⚽ 点球大战：{so['home_goals']} - {so['away_goals']}（常规 {orig_hg}:{orig_ag}）"
    else:
        winner_side = "home" if hg > ag else ("away" if ag > hg else None)
    user_won = (is_home and winner_side=="home") or (not is_home and winner_side=="away")
    is_draw = (winner_side is None)
    old_streak = career.get("career_streak", 0)
    if user_won:
        career["career_streak"] = old_streak + 1 if old_streak > 0 else 1
        career["best_win_streak"] = max(career.get("best_win_streak",0), career["career_streak"])
    elif is_draw:
        career["career_streak"] = 0
    else:
        career["career_streak"] = old_streak - 1 if old_streak < 0 else -1
        career["worst_loss_streak"] = min(career.get("worst_loss_streak",0), career["career_streak"])

    fixture = _find_fixture_ref(career, m["fixture_ref"])
    if fixture:
        fixture["played"] = True
        fixture["score"] = f"{orig_hg}:{orig_ag}"
        if is_playoff_match:
            po = career["playoff"]
            po["played"] = True
            po["score"] = f"{orig_hg}:{orig_ag}"
            po["winner"] = ("user" if user_won else
                            (po["away"] if is_home else po["home"]))

    # 计算完整评分（含 AI）
    full_ratings, mvp_name = _build_full_ratings(m, winner_side)

    events_txt = update_suspensions_injuries(career, user_side,
                                              ratings_from_side(user_side, m))
    if career["mode"] == "league":
        if not is_playoff_match:
            _update_table(career, fixture, orig_hg, orig_ag)
            _sim_other_league_matches(career, fixture["round"])
    else:
        # 杯赛：先更新组表，再判断阶段
        if career["bracket"]["phase"] == "group":
            g = career["bracket"]["groups"][career["bracket"]["user_group"]]
            _update_group_table(g["table"], fixture, orig_hg, orig_ag)
            _sim_other_group_matches(career, m["fixture_ref"])
            _advance_cup_new(career, is_home, user_won, is_draw, orig_hg, orig_ag)
        else:
            _advance_cup_new(career, is_home, user_won, is_draw, orig_hg, orig_ag)

    _update_season_stats_both(career, user_side, ai_side)

    winner_name = m["home_name"] if winner_side=="home" \
                  else (m["away_name"] if winner_side=="away" else "平局")
    news_txt = _generate_news(m, user_won, is_draw, full_ratings, mvp_name, career, ai_side)

    referee = calculate_referee_rating(m)
    m["referee"] = referee
    ratings_img = render_ratings_image(m["id"], m["home_name"], m["away_name"],
                                        f"{orig_hg}:{orig_ag}", winner_name,
                                        mvp_name, full_ratings, referee)
    mvp_row = next((r for r in full_ratings if r.get("name") == mvp_name), {})
    mvp_is_gk = str(mvp_row.get("position","")).startswith("GK")
    mvp_saves = mvp_row.get("saves",0)
    rank_context = get_career_rank_context(career)
    competition = get_competition_context(career)
    career["press_conference"] = build_press_conference(
        m, user_won, is_draw, mvp_name, referee, career.get("career_streak",0),
        rank_context, mvp_is_gk, mvp_saves, competition)

    event_msg = trigger_random_event(career, user_side)
    combined_events = "\n".join(x for x in [m.get("effect_msg"), events_txt, event_msg] if x)
    post_img = render_post_match_image(m["id"], m["home_name"], m["away_name"],
                                       f"{orig_hg}:{orig_ag}", combined_events, news_txt)

    full_text = "\n\n".join(m["all_text"])
    if shootout_msg: full_text += "\n\n" + shootout_msg

    career["active_match"] = None
    career["current_match"] = career.get("current_match", 0) + 1

    # 【新增】赛季末尾提示
    ending_reminder = None
    if career["status"] == "active":   # 尚未终结才提示
        ending_reminder = _season_ending_reminder(career)
    career["active_match"] = None
    career["current_match"] = career.get("current_match", 0) + 1
    return {"phase":"final","score":f"{orig_hg}:{orig_ag}",
            "commentary":m["all_text"][-1] if m["all_text"] else "",
            "img":m["last_img"],"ratings_img":ratings_img,"post_img":post_img,
            "events":combined_events,"news":news_txt,
            "_post_context":{"match_id":m["id"],"home_name":m["home_name"],
                             "away_name":m["away_name"],"score":f"{orig_hg}:{orig_ag}"},
            "opp_name":m["opp_name"],"is_home":is_home,
            "user_won":user_won,"is_draw":is_draw,"mvp":mvp_name,
            "shootout":shootout_msg,
            "ending_reminder": ending_reminder,
            "press_available": True,
            "press_prompt":format_press_prompt(career["press_conference"]),
            "press_options":career["press_conference"]["options"],
            "referee":referee,
            "career_streak":career.get("career_streak",0),
            }   # ← 新增

def ratings_from_side(side, match):
    """从 player_stats 推导出赛后评分表，简化版"""
    out = []
    for cid, ps in side.get("player_stats", {}).items():
        c = side["cards_snapshot"].get(cid)
        if not c: continue
        out.append({"cid":cid,"name":c["name"],
                    "goals":ps.get("goals",0),"assists":ps.get("assists",0),
                    "saves":ps.get("saves",0),"yellow":ps.get("yellow",0),
                    "red":ps.get("red",0)})
    return out

def update_suspensions_injuries(career, user_side, ratings):
    lines = []
    # 减少所有停赛/伤病剩余场次
    for cid in list(career["suspensions"].keys()):
        s = career["suspensions"][cid]
        s["matches_out"] = max(0, s["matches_out"] - 1)
        if s["matches_out"] == 0:
            lines.append(f"✅ {_cn(user_side, cid)} 停赛期满，可重新出战")
            del career["suspensions"][cid]
    for cid in list(career["injuries"].keys()):
        inj = career["injuries"][cid]
        inj["matches_out"] = max(0, inj["matches_out"] - 1)
        if inj["matches_out"] == 0:
            lines.append(f"💚 {_cn(user_side, cid)} 伤愈复出")
            del career["injuries"][cid]
    # 本场红黄牌
    red_cids = set()
    for r in ratings:
        cid = r["cid"]
        if r["red"] > 0:
            red_cids.add(cid)
            n = random.choice([1,1,2,3])
            career["suspensions"][cid] = {"matches_out": n, "reason":"红牌"}
            lines.append(f"🟥 {r['name']} 红牌停赛 {n} 场")
            career["yellow_accum"][cid] = 0
        elif r["yellow"] > 0:
            career["yellow_accum"][cid] = career["yellow_accum"].get(cid, 0) + r["yellow"]
            if career["yellow_accum"][cid] >= 4:
                career["suspensions"][cid] = {"matches_out": 1, "reason":"累积黄牌"}
                career["yellow_accum"][cid] = 0
                lines.append(f"🟨🟨 {r['name']} 累积 4 张黄牌，停赛 1 场")
    # 伤病：只取真正因伤下场的球员（injury_sub / injury_out）
    hurt_pool = [cid for cid in user_side.get("injured_out", [])
                 if cid not in red_cids]
    # 【新增】随机的场后小伤：25% 概率从首发挑一位（排除本场红牌者）
    if random.random() < 0.25:
        starters = list(user_side["starters"].values())
        candidates = [c for c in starters
                      if c not in career["injuries"]
                      and c not in career["suspensions"]
                      and c not in red_cids
                      and c not in hurt_pool]
        if candidates:
            hurt_pool.append(random.choice(candidates))
    for cid in hurt_pool:
        if cid in career["injuries"]: continue
        if cid in career["suspensions"]: continue   # 红牌了就不再上伤病
        roll = random.random()
        if roll < 0.55:
            wks = random.randint(1, 2)
            severity = "轻伤"
        elif roll < 0.90:
            wks = random.randint(3, 6)
            severity = "重伤"
        else:
            wks = 99
            severity = "赛季报销"
        career["injuries"][cid] = {"matches_out": wks, "severity": severity}
        name = _cn(user_side, cid)
        lines.append(f"🚑 {name} {severity}，缺席 {'整个赛季' if wks==99 else str(wks)+' 场'}")
    return "\n".join(lines)

def calculate_referee_rating(m):
    """按给牌量、牌面争议和比赛强度评估裁判，范围 1.0~10.0。"""
    yellow = red = second_yellow = penalties = controversial = 0
    for item in m.get("history", []):
        res = item.get("result") or {}
        for events in (res.get("home_events", []), res.get("away_events", [])):
            for event in events:
                kind = event.get("type")
                if kind == "yellow": yellow += 1
                elif kind == "red": red += 1
                elif kind == "second_yellow": second_yellow += 1
                elif kind in ("penalty_goal", "penalty_miss"): penalties += 1
                if kind in ("red", "second_yellow", "penalty_goal", "penalty_miss"):
                    controversial += 1
    total_cards = yellow + red + second_yellow
    # 一场约 2~5 黄、0~1 红通常合理；过少或过多都会扣分。
    rating = 8.4
    if yellow == 0 and red == 0:
        rating -= 0.8
    elif yellow > 5:
        rating -= (yellow - 5) * 0.48
    if red + second_yellow > 1:
        rating -= (red + second_yellow - 1) * 0.85
    rating -= max(0, penalties - 1) * 0.45
    rating -= controversial * 0.16
    rating += random.uniform(-0.55, 0.45)
    rating = max(1.0, min(10.0, round(rating, 1)))
    if rating >= 8.5: label = "执法优秀"
    elif rating >= 7.0: label = "表现稳健"
    elif rating >= 5.5: label = "存在争议"
    elif rating >= 4.0: label = "执法糟糕"
    else: label = "严重失准"
    summary = f"黄牌 {yellow} · 红牌 {red + second_yellow} · 点球判罚 {penalties}"
    return {"rating":rating,"label":label,"yellow":yellow,
            "red":red+second_yellow,"penalties":penalties,
            "total_cards":total_cards,"summary":summary}

def _cn(side, cid):
    c = side["cards_snapshot"].get(cid)
    return c["name"] if c else cid

def _update_table(career, fixture, hg, ag):
    tbl = career["table"]
    for team_key, gf, ga in [(fixture["home"], hg, ag), (fixture["away"], ag, hg)]:
        row = tbl[team_key]
        row["P"] += 1; row["GF"] += gf; row["GA"] += ga
        if gf > ga: row["W"] += 1; row["Pts"] += 3
        elif gf == ga: row["D"] += 1; row["Pts"] += 1
        else: row["L"] += 1

def _sim_other_league_matches(career, round_num):
    """本轮除用户外的其他 AI vs AI 比赛"""
    for f in career["fixtures"]:
        if f["played"] or f["round"] != round_num: continue
        if f["home"] == "user" or f["away"] == "user": continue
        res = _sim_ai_vs_ai(career, f["home"], f["away"])
        if res:
            hg, ag = res
            f["played"] = True
            f["score"] = f"{hg}:{ag}"
            _update_table(career, f, hg, ag)

def _advance_cup(career, is_home, user_won, is_draw):
    stage = career["bracket"]["stages"][career["current_stage"]]
    for m in stage["matches"]:
        if m["played"]: continue
        is_user_match = (m["home"]=="user" or m["away"]=="user")
        if is_user_match:
            m["played"] = True
            user_advances = user_won or (is_draw and random.random() < 0.5)
            m["winner"] = "user" if user_advances else (m["away"] if m["home"]=="user" else m["home"])
        else:
            res = _sim_ai_vs_ai(career, m["home"], m["away"])
            if res:
                hg, ag = res
                if hg == ag:
                    m["winner"] = random.choice([m["home"], m["away"]])
                else:
                    m["winner"] = m["home"] if hg>ag else m["away"]
                m["score"] = f"{hg}:{ag}"
                m["played"] = True
    # 所有本轮完毕 → 生成下一轮
    if all(m["played"] for m in stage["matches"]):
        winners = [m["winner"] for m in stage["matches"]]
        if len(winners) == 1:
            career["status"] = "done"
            career["cup_winner"] = winners[0]
            return
        next_matches = []
        for i in range(0, len(winners), 2):
            next_matches.append({"home":winners[i],"away":winners[i+1],
                                  "score":None,"played":False})
        next_name = {2:"决赛",4:"半决赛",8:"1/4 决赛"}.get(len(next_matches)*2, f"1/{len(next_matches)}决赛")
        career["bracket"]["stages"].append({"name":next_name,"matches":next_matches})
        career["current_stage"] += 1

CAREER_EVENTS = [
    # (key, name, weight, type, desc)
    ("legend_scout",  "🌟 星探来访",     0.03, "instant",  "海外星探慧眼识珠，送来一位传奇球员"),
    ("free_recruit",  "📇 经纪人上门",   0.09, "instant",  "老友帮你要来一个招募名额"),
    ("free_gold",     "🎁 潜力自由球员", 0.11, "instant",  "偶遇一位天赋新星，主动加入"),
    ("medical",       "🩺 医疗突破",     0.07, "instant",  "队医新疗法立竿见影"),
    ("star_form",     "🔥 状态爆棚",     0.13, "buff_p",   "训练场上大放异彩，下场超常发挥"),
    ("team_bonding",  "🍻 团建成功",     0.08, "buff_t",   "全队火锅局，默契飙升"),
    ("home_carnival", "🎉 主场狂欢",     0.06, "buff_atk", "球迷灯光秀，气氛燃爆"),
    ("bribe_ref",     "💰 神秘捐款",     0.05, "no_cards", "某人给裁判协会送去了一箱啤酒"),
    ("heavy_rain",    "🌧️ 大暴雨",       0.09, "rain",     "天公不作美，场地湿滑"),
    ("opp_scandal",   "📰 对手内讧",     0.06, "debuff_o", "对手更衣室起火，士气受挫"),
    ("opp_bus",       "🚌 对手大巴抛锚", 0.04, "opp_tired","对手赶到时已疲惫不堪"),
    ("feud",          "💥 更衣室不合",   0.06, "debuff_t", "两位主力互看不顺眼"),
    ("hangover",      "🍺 球员宿醉",     0.03, "debuff_p", "队员被拍到深夜派对"),
]

def trigger_random_event(career, user_side):
    """40% 概率触发一个事件"""
    if random.random() > 0.40: return None
    total = sum(e[2] for e in CAREER_EVENTS)
    r = random.random() * total; cum = 0
    for key, name, w, etype, desc in CAREER_EVENTS:
        cum += w
        if r < cum:
            return _handle_event(career, user_side, key, name, etype, desc)
    return None

def _handle_event(career, user_side, key, name, etype, desc):
    if etype == "instant":
        if key == "legend_scout":
            meta = _spawn_recruit_card(career["user_key"], base_ovr=88)
            _add_recruit_to_career(career, meta)
            return f"{name}｜{desc}\n📇 【{meta['name']}】{meta['position']} · OVR {meta['ovr']} · {meta['tier_name']} 立即加入"
        if key == "free_recruit":
            if career["mode"] == "cup":
                # 杯赛也不给招募次数，改送一张卡
                meta = _spawn_recruit_card(career["user_key"], base_ovr=random.randint(70,76))
                _add_recruit_to_career(career, meta)
                return f"{name}｜杯赛期间直送一张卡\n👤 【{meta['name']}】OVR {meta['ovr']}"
            career["recruit_left"] = career.get("recruit_left", 0) + 1
            return f"{name}｜{desc}\n招募机会 +1（当前 {career['recruit_left']}）"
        if key == "free_gold":
            meta = _spawn_recruit_card(career["user_key"], base_ovr=random.randint(72,78))
            _add_recruit_to_career(career, meta)
            return f"{name}｜{desc}\n👤 【{meta['name']}】{meta['position']} · OVR {meta['ovr']}"
        if key == "medical":
            if career.get("injuries"):
                cid = max(career["injuries"].keys(),
                          key=lambda k: career["injuries"][k]["matches_out"])
                nm = user_side["cards_snapshot"].get(cid, {}).get("name", cid) \
                    if user_side else cid
                del career["injuries"][cid]
                return f"{name}｜{desc}\n💚 {nm} 立即康复！"
            return f"{name}｜{desc}\n（暂无伤员，进入医疗数据库）"

    # 效果类：写入 active_effects，duration=1
    eff = {"key": key, "duration": 1}
    if etype in ("buff_p", "debuff_p") and user_side:
        starters = list(user_side["starters"].values())
        if starters:
            eff["target_cid"] = random.choice(starters)
    career.setdefault("active_effects", []).append(eff)
    tag_map = {"buff_p":"🎯 幸运儿", "debuff_p":"😵 倒霉蛋"}
    tag = ""
    if etype in tag_map and eff.get("target_cid"):
        tag = f"\n{tag_map[etype]}: {_cn(user_side, eff['target_cid'])}"
    return f"{name}｜{desc}{tag}\n⏳ 效果将在下一场生效"

def apply_active_effects_pre_match(user_side, ai_side, career):
    """比赛开始前应用效果，消费掉 duration<=0 的"""
    effects = career.get("active_effects", [])
    remaining = []
    lines = []
    career["venue_press_shift"] = 0.0
    for eff in effects:
        k = eff["key"]
        if k == "star_form":
            cid = eff.get("target_cid")
            if cid and cid in user_side["cards_snapshot"]:
                user_side["form"][cid] = user_side["form"].get(cid, 0) + 10
                lines.append(f"🔥 {_cn(user_side, cid)} 状态爆棚 (+10)")
        elif k == "team_bonding":
            for cid in list(user_side["form"]):
                user_side["form"][cid] += 4
            lines.append("🍻 团建默契：全队 form +4")
        elif k == "home_carnival":
            user_side["stat_mult"] = user_side.get("stat_mult",1.0) * 1.06
            lines.append("🎉 主场狂欢：全队属性 +6%")
        elif k == "bribe_ref":
            user_side["card_reduce"] = 0.5
            lines.append("💰 主裁今天笑眯眯：吃牌概率 -50%")
        elif k == "heavy_rain":
            user_side["stat_mult"] = user_side.get("stat_mult",1.0) * 0.92
            ai_side["stat_mult"] = ai_side.get("stat_mult",1.0) * 0.92
            lines.append("🌧️ 大暴雨：双方射门效率 -8%")
        elif k == "opp_scandal":
            ai_side["stat_mult"] = ai_side.get("stat_mult",1.0) * 0.94
            lines.append("📰 对手陷入丑闻：属性 -6%")
        elif k == "opp_bus":
            for cid in ai_side["stamina"]:
                ai_side["stamina"][cid] = 80
            lines.append("🚌 对手大巴抛锚：起始体能 80")
        elif k == "feud":
            for cid in list(user_side["form"])[:3]:
                user_side["form"][cid] -= 6
            lines.append("💥 更衣室不合：3 人 form -6")
        elif k == "hangover":
            cid = eff.get("target_cid")
            if cid and cid in user_side["stamina"]:
                user_side["stamina"][cid] = max(20, user_side["stamina"][cid] - 30)
                lines.append(f"🍺 {_cn(user_side, cid)} 宿醉：体能 -30")
        elif k == "press_praise":
            user_side["stat_mult"] = user_side.get("stat_mult",1.0) * 1.05
            lines.append("🎙️ 发布会称赞球员：全队属性 +5%")
            career["venue_press_shift"] += 0.06
        elif k == "press_protect":
            user_side["stat_mult"] = user_side.get("stat_mult",1.0) * 1.03
            user_side["card_reduce"] = max(user_side.get("card_reduce",0.0), 0.25)
            lines.append("🛡️ 发布会保护球员：属性 +3%、吃牌概率 -25%")
            career["venue_press_shift"] += 0.05
        elif k == "press_referee":
            user_side["stat_mult"] = user_side.get("stat_mult",1.0) * 1.04
            user_side["card_risk"] = user_side.get("card_risk",0.0) + 0.35
            lines.append("⚖️ 批评裁判余波：属性 +4%、吃牌概率 +35%")
            career["venue_press_shift"] -= 0.05
        elif k == "press_rival":
            ai_side["stat_mult"] = ai_side.get("stat_mult",1.0) * 0.95
            user_side["card_risk"] = user_side.get("card_risk",0.0) + 0.15
            lines.append("🔥 挑衅对手续篇：对手属性 -5%、己方吃牌概率 +15%")
            career["venue_press_shift"] += 0.03
        elif k == "press_calm":
            for cid in user_side["form"]:
                user_side["form"][cid] = max(-2, min(5, user_side["form"][cid] + 2))
            lines.append("🎙️ 低调回应：全队状态趋于稳定")
            career["venue_press_shift"] += 0.01
        elif k == "press_criticize_players":
            for cid in list(user_side["form"]):
                user_side["form"][cid] -= random.randint(3, 7)
            lines.append("💢 公开批评余波：更衣室不满，全队状态 -3~-7")
            career["venue_press_shift"] -= 0.08
        elif k == "press_praise_star":
            cid = next((cid for cid,c in user_side["cards_snapshot"].items()
                        if c.get("name") == eff.get("target_name")), None)
            if cid:
                user_side["form"][cid] = user_side["form"].get(cid,0) + 12
                lines.append(f"🌟 媒体聚光灯：{_cn(user_side,cid)} 状态 +12")
        elif k == "press_star_pressure":
            cid = next((cid for cid,c in user_side["cards_snapshot"].items()
                        if c.get("name") == eff.get("target_name")), None)
            if cid:
                swing = random.choice([15, 13, -12, -15])
                user_side["form"][cid] = user_side["form"].get(cid,0) + swing
                lines.append(f"🎭 核心承压：{_cn(user_side,cid)} {'证明自己' if swing>0 else '心态失衡'}，状态 {swing:+d}")
        elif k == "press_defiant":
            user_side["stat_mult"] = user_side.get("stat_mult",1.0) * random.choice([1.08,0.94])
            lines.append("🧩 战术争议持续：球队执行可能更坚决，也可能陷入自我怀疑")
        elif k == "press_media_war":
            user_side["card_risk"] = user_side.get("card_risk",0.0) + 0.20
            lines.append("📸 媒体战争升级：赛前围堵不断，吃牌概率 +20%")
            career["venue_press_shift"] -= 0.07
        elif k == "press_referee_soft":
            user_side["card_risk"] = user_side.get("card_risk",0.0) + 0.10
            lines.append("⚖️ 含蓄质疑判罚：裁判尺度略趋严格")
        eff["duration"] -= 1
        if eff["duration"] > 0: remaining.append(eff)
    career["active_effects"] = remaining
    return "\n".join(lines)

def apply_media_environment(user_side, career):
    relation = career.get("media_relation", 0)
    lines = []
    starters = list(user_side.get("starters", {}).values())
    if not starters:
        return "\n".join(lines)
    if relation >= 25:
        shield = min(0.60, 0.18 + relation / 180.0)
        user_side["card_reduce"] = max(user_side.get("card_reduce",0.0), shield)
        for cid in user_side["form"]:
            user_side["form"][cid] += random.randint(1, 3)
        lines.append(random.choice([
            "🤝 友好媒体主动压低流言热度，球员得以专心备战",
            "📰 多家媒体采用克制报道，训练场周围难得保持安静",
            "🎤 赛前采访以正面问题为主，队员没有受到额外纠缠",
            "🛡️ 俱乐部与记者沟通顺畅，流言在扩散前就被澄清",
            "📸 镜头更多聚焦训练亮点，球队情绪显得轻松稳定",
        ]))
        if relation >= 60 and random.random() < 0.35:
            cid = random.choice(starters)
            user_side["form"][cid] += 6
            lines.append(f"✨ 正面专访鼓舞了 {_cn(user_side,cid)}，额外状态 +6")
    elif relation <= -25:
        harassment = min(0.90, 0.30 + abs(relation) / 120.0)
        affected = random.sample(starters, min(len(starters), 2 if relation > -60 else 3))
        lines.append(random.choice([
            "📸 记者围堵训练场，旧闻和更衣室流言被反复追问",
            "🎙️ 球员通道挤满话筒，几名队员被尖锐问题激怒",
            "🗞️ 训练尚未开始，负面标题已经在社交媒体滚动传播",
            "🚧 俱乐部不得不加强安保，采访区的气氛格外紧绷",
            "📺 评论节目连续重播争议片段，球员明显受到干扰",
        ]))
        for cid in affected:
            if random.random() < harassment:
                # 负面环境让表现两极分化：证明自己或摆烂失控。
                if random.random() < 0.42:
                    swing = random.randint(10, 17)
                    mood = random.choice(["憋着一口气要证明自己", "公开表示会用表现回应质疑", "把嘘声当成额外动力"])
                else:
                    swing = -random.randint(9, 18)
                    mood = random.choice(["被负面报道击垮信心", "在采访中失言后心态崩坏", "厌倦骚扰而消极训练"])
                user_side["form"][cid] = user_side["form"].get(cid,0) + swing
                lines.append(f"🎭 {_cn(user_side,cid)} {mood}，状态 {swing:+d}")
        user_side["card_risk"] = user_side.get("card_risk",0.0) + min(0.30, abs(relation)/250.0)
    else:
        lines.append(random.choice([
            "🗞️ 媒体保持常规关注，本场没有形成明显额外影响",
            "📰 赛前报道较为平稳，记者没有制造新的争议话题",
            "🎤 常规采访按计划结束，球队得以正常完成备战",
            "📸 镜头聚焦比赛本身，场外舆论暂时没有升温",
            "🗞️ 舆论风向保持中性，球员情绪没有明显波动",
            "📺 评论员观点各有不同，但没有形成集中的舆论压力",
        ]))
    return "\n".join(lines)

PRESS_QUESTIONS = {
    "upset_result": {
        "question":["记者：你们总评只有 {user_ovr}，却击败了总评 {opp_ovr} 的强敌，这是战术胜利吗？",
                    "记者：纸面实力相差 {ovr_gap} 点，球队为何仍能完成这场爆冷？",
                    "记者：赛前几乎没人看好你们，这场胜利是否证明外界长期低估了球队？",
                    "记者：击倒明显更强的对手后，你是否会重新提高本赛季目标？"],
        "options": {
            "赞美执行力":{"media":9,"effect":"press_praise","tone":"warm","reply":"总评不会替任何人跑动，球员把计划执行到了最后一秒。","result":"媒体认可球队纪律性，更衣室也因公开表扬而振奋。"},
            "强调勇气":{"media":7,"effect":"press_rival","tone":"passionate","reply":"如果只看纸面就决定胜负，我们根本没有必要走上球场。","result":"回答成为励志标题，球队信心得到提升。"},
            "淡化冷门":{"media":1,"effect":"press_calm","tone":"bland","reply":"这只是一场普通胜利，不值得过度解读。","result":"记者对你拒绝享受故事性略感失望。"},
            "嘲讽评级":{"media":3,"effect":"press_media_war","tone":"aggressive","reply":"也许该重新检查一下那些所谓的总评是怎么计算出来的。","result":"言论引发关于球员评级体系的激烈争论。"},
        },
    },
    "favorite_collapse": {
        "question":["记者：你们总评 {user_ovr}，明显高于对手的 {opp_ovr}，为何仍然输掉比赛？",
                    "记者：拥有更强阵容却被弱队击败，这是否是教练组最难解释的失败？",
                    "记者：纸面优势达到 {ovr_gap} 点，球队是不是过于轻敌？",
                    "记者：这样的强队翻车会不会动摇更衣室对战术的信任？"],
        "options": {
            "承认轻敌":{"media":8,"effect":"press_calm","tone":"responsible","reply":"我们没有给予对手足够尊重，这种态度必须立刻纠正。","result":"坦率承认问题缓和了批评，但球队态度将被持续观察。"},
            "承担责任":{"media":9,"effect":"press_protect","tone":"responsible","reply":"更强的阵容没有转化成结果，责任首先在我的准备和选择。","result":"球员得到保护，媒体认可你的担当。"},
            "批评执行":{"media":-9,"effect":"press_criticize_players","tone":"aggressive","reply":"实力优势客观存在，但有人没有拿出应有的专注和强度。","result":"媒体开始追问具体球员，更衣室气氛迅速恶化。"},
            "否认差距":{"media":-5,"effect":"press_media_war","tone":"deflective","reply":"所谓总评差距只是数字，不能拿来定义这场比赛。","result":"回答被认为在回避强队翻车的核心问题。"},
        },
    },
    "underdog_draw_press": {
        "question":["记者：面对总评高出 {ovr_gap} 点的对手，你们拿到平局是否像一场胜利？",
                    "记者：球队顶住了明显更强的阵容，你最满意的是勇气还是防守纪律？",
                    "记者：弱势局面下抢到一分，会不会成为赛季的重要转折？",
                    "记者：你是否遗憾球队没能把这场含金量十足的平局变成胜利？"],
        "options": {
            "肯定一分":{"media":7,"effect":"press_praise","tone":"warm","reply":"面对这种强度，每一名球员都为这一分付出了巨大努力。","result":"球队的韧性获得广泛赞誉。"},
            "追求更多":{"media":5,"effect":"press_star_pressure","tone":"passionate","reply":"尊重对手，但我们创造了机会，不应该只满足于平局。","result":"进取态度受到好评，球员也承受更高期待。"},
            "强调战术":{"media":6,"effect":"press_defiant","tone":"balanced","reply":"实力有差距，但正确的距离、跑动和协作能够抵消很多东西。","result":"媒体开始认真讨论你的临场布置。"},
            "保持低调":{"media":0,"effect":"press_calm","tone":"bland","reply":"平局就是平局，没有必要赋予更多意义。","result":"平淡回应让记者席缺少反应。"},
        },
    },
    "favorite_draw_press": {
        "question":["记者：你们总评领先 {ovr_gap} 点，却只能战平较弱对手，这两分丢在哪里？",
                    "记者：阵容优势没有转化成胜利，你是否对进攻效率感到失望？",
                    "记者：面对实力较弱的球队仍然无法取胜，会不会影响争冠或升级计划？",
                    "记者：这是对手表现出色，还是你们自己缺少赢球欲望？"],
        "options": {
            "承认低效":{"media":7,"effect":"press_calm","tone":"responsible","reply":"机会数量足够，但处理质量不够，这部分必须由我们改进。","result":"具体分析获得认可，锋线压力有所上升。"},
            "称赞对手":{"media":5,"effect":"press_praise","tone":"warm","reply":"对手的组织和纪律值得尊重，实力差距不会自动变成进球。","result":"成熟回答缓和了失分带来的情绪。"},
            "要求反弹":{"media":4,"effect":"press_star_pressure","tone":"passionate","reply":"这样的比赛必须赢，下场我需要看到更强烈的回应。","result":"强硬要求制造动力，也提高了更衣室压力。"},
            "归咎运气":{"media":-7,"effect":"press_media_war","tone":"deflective","reply":"除了运气，我们几乎做对了一切。","result":"媒体用数据反驳了你的判断，批评继续升温。"},
        },
    },
    "winning_streak": {
        "question":["记者：球队已经取得 {streak} 连胜，你是否认为冠军已经进入视野？",
                    "记者：{streak} 连胜让外界开始谈论纪录，你担心球队因此膨胀吗？",
                    "记者：连续胜利之后，每个对手都会更重视你们，球队准备好成为被追赶者了吗？",
                    "记者：有人认为这波连胜主要来自赛程有利，你如何回应？",
                    "记者：球迷已经开始畅想冠军，你会要求他们保持冷静还是一起享受势头？",
                    "记者：{streak} 连胜期间球队多次逆转，这究竟是韧性还是开局准备不足？"],
        "options": {
            "剑指冠军":{"media":6,"effect":"press_rival","tone":"passionate",
                     "reply":"既然已经走到这里，我们就不会假装没有野心，目标就是冠军。",
                     "result":"强势宣言引爆舆论，球队斗志和外界期待同时升高。"},
            "保持饥饿":{"media":9,"effect":"press_praise","tone":"balanced",
                     "reply":"连胜只代表过去做对了一些事，下一场仍要像没有赢过一样准备。",
                     "result":"克制但坚定的回答受到好评，球员保持专注。"},
            "赞美球员":{"media":8,"effect":"press_praise","tone":"warm",
                     "reply":"这段纪录属于每一名球员，他们在困难时刻从未停止相信彼此。",
                     "result":"更衣室受到鼓舞，媒体也获得了积极标题。"},
            "轻视纪录":{"media":-3,"effect":"press_calm","tone":"bland",
                     "reply":"纪录没有意义，我们只是完成了几场普通比赛。",
                     "result":"过度淡化让媒体觉得你刻意回避故事性，发布厅气氛迅速降温。"},
            "嘲讽质疑者":{"media":-8,"effect":"press_media_war","tone":"aggressive",
                     "reply":"连胜之前他们说我们不行，现在又说赛程容易，或许他们永远不会满意。",
                     "result":"发言取悦部分球迷，却与评论员公开交火。"},
        },
    },
    "losing_streak": {
        "question":["记者：球队已经遭遇 {streak} 连败，你认为自己还能掌控更衣室吗？",
                    "记者：{streak} 连败之后，俱乐部是否向你下达了最后通牒？",
                    "记者：球员看起来已经失去信心，你准备如何终止这场危机？",
                    "记者：连续失败的模式几乎相同，为什么同样的问题一直没有解决？",
                    "记者：看台要求你下课的声音越来越大，你还认为自己是合适的人选吗？",
                    "记者：{streak} 连败期间有人匿名批评训练质量，更衣室是否已经分裂？"],
        "options": {
            "承担压力":{"media":9,"effect":"press_protect","tone":"responsible",
                     "reply":"压力应该落在我身上，不该让球员独自面对这段困难。",
                     "result":"担当获得媒体认可，球员也愿意继续支持你。"},
            "宣布变革":{"media":6,"effect":"press_defiant","tone":"passionate",
                     "reply":"现状不能继续，训练、阵容和比赛方式都会发生改变。",
                     "result":"强烈表态制造期待，下一场将成为舆论审判。"},
            "相信反弹":{"media":4,"effect":"press_star_pressure","tone":"balanced",
                     "reply":"球队没有放弃，我们只需要一个结果就能重新站起来。",
                     "result":"回答保留希望，但球员承受必须立即反弹的压力。"},
            "归咎运气":{"media":-9,"effect":"press_media_war","tone":"deflective",
                     "reply":"如果几个门柱和判罚换个方向，现在根本不会有人讨论危机。",
                     "result":"媒体认为你拒绝正视问题，开始逐场列举战术失误。"},
            "沉默回避":{"media":-7,"effect":"press_calm","tone":"bland",
                     "reply":"我没有更多可以补充的，我们会继续工作。",
                     "result":"简短回答被描述为束手无策，发布厅的不满明显加重。"},
        },
    },
    "league_leader": {
        "question":["记者：联赛已经进行 {progress}% ，你们目前排名第 {rank}，是否已经成为冠军最大热门？",
                    "记者：球队坐在榜首，但身后对手只差 {gap} 分，你担心压力改变球员心态吗？",
                    "记者：从赛季目标到现在排名第 {rank}，你是否应该公开喊出夺冠口号？",
                    "记者：积分榜位置非常理想，接下来会主动扩大优势还是优先控制风险？"],
        "options": {
            "公开争冠":{"media":7,"effect":"press_rival","tone":"passionate","reply":"排名不会替我们赢得奖杯，但既然站在这里，目标当然是冠军。","result":"争冠宣言成为头条，球队期待与压力同时上升。"},
            "专注下一场":{"media":5,"effect":"press_praise","tone":"balanced","reply":"积分榜每天都会变化，我们只准备下一个对手。","result":"回答稳健，记者仍在等待更明确的野心。"},
            "赞美阵容":{"media":8,"effect":"press_praise","tone":"warm","reply":"这个排名证明所有球员都在贡献，没有谁是旁观者。","result":"更衣室对公开认可反响积极。"},
            "拒谈排名":{"media":-2,"effect":"press_calm","tone":"bland","reply":"我没有关注排名，现在讨论这些没有意义。","result":"记者对你回避最显眼的话题略感失望。"},
            "向对手施压":{"media":2,"effect":"press_rival","tone":"passionate","reply":"压力应该属于追赶者，他们必须先证明自己能跟上我们。","result":"言论刺激了争冠对手，也点燃了球迷情绪。"},
        },
    },
    "promotion_race": {
        "question":["记者：赛程已经过半，球队排名第 {rank}，距离升级区只有 {gap} 分，你如何评估机会？",
                    "记者：积分榜竞争非常拥挤，现在每一次丢分是否都可能决定赛季命运？",
                    "记者：球队仍在升级集团中，你会为了排名采用更冒险的打法吗？",
                    "记者：目前的位置符合赛季预算吗，还是你认为球队本可以更高？"],
        "options": {
            "冲击升级":{"media":7,"effect":"press_rival","tone":"passionate","reply":"机会就在眼前，我们不会因为害怕失败而放弃向上冲击。","result":"明确目标获得球迷支持，比赛压力同步提升。"},
            "稳扎稳打":{"media":5,"effect":"press_praise","tone":"balanced","reply":"升级需要稳定积累，不会因为一张积分榜改变所有计划。","result":"理性回答获得认可，但没有制造太多新闻。"},
            "要求补强":{"media":1,"effect":"press_defiant","tone":"balanced","reply":"现有球员已经付出很多，如果想更进一步，阵容深度必须得到支持。","result":"媒体开始讨论管理层投入，俱乐部内部压力增加。"},
            "降低预期":{"media":-4,"effect":"press_calm","tone":"bland","reply":"我们的首要目标仍然只是完成赛季，升级并不现实。","result":"保守表态让部分球员和球迷感到泄气。"},
        },
    },
    "midtable_rank": {
        "question":["记者：赛程已经进行 {progress}% ，球队排名第 {rank}，这种不上不下的位置令人满意吗？",
                    "记者：球队与升级区相差 {gap} 分，你认为赛季正在失去方向吗？",
                    "记者：排名看似安全却缺少突破，接下来要追求成绩还是培养阵容？",
                    "记者：积分榜显示球队表现非常普通，你如何说服球迷继续期待？"],
        "options": {
            "拒绝平庸":{"media":6,"effect":"press_defiant","tone":"passionate","reply":"安全从来不是目标，这个排名不能让任何人满意。","result":"强硬态度唤起期待，也让下一阶段成绩受到审视。"},
            "强调进步":{"media":7,"effect":"press_praise","tone":"warm","reply":"积分只是结果，我们在比赛内容和阵容深度上都在持续进步。","result":"媒体愿意观察长期变化，球队气氛保持稳定。"},
            "调整目标":{"media":3,"effect":"press_calm","tone":"balanced","reply":"我们会根据现实调整优先级，但不会放弃竞争每一场比赛。","result":"务实回答没有引发明显争议。"},
            "满足现状":{"media":-5,"effect":"press_calm","tone":"bland","reply":"目前的位置可以接受，没必要制造额外压力。","result":"记者席反应冷淡，球迷开始质疑球队是否缺少野心。"},
        },
    },
    "relegation_battle": {
        "question":["记者：赛程已进行 {progress}% ，球队排名第 {rank}，距离降级区只差 {gap} 分，你承认保级危机吗？",
                    "记者：积分榜已经拉响警报，你是否仍得到管理层支持？",
                    "记者：球队目前处在危险位置，球员是否意识到接下来每场都是决赛？",
                    "记者：如果最终降级，谁应该承担最主要的责任？"],
        "options": {
            "正视危机":{"media":8,"effect":"press_protect","tone":"responsible","reply":"我们不会欺骗自己，危险真实存在，但责任和解决办法也在我们手中。","result":"坦率回答获得认可，球队开始形成保级共识。"},
            "发出战斗宣言":{"media":6,"effect":"press_rival","tone":"passionate","reply":"从现在开始每一分钟都必须像决赛，我们不会安静地掉下去。","result":"激烈表态点燃球迷，也让球员承受巨大压力。"},
            "保护球员":{"media":7,"effect":"press_protect","tone":"warm","reply":"不要把所有恐惧压在球员身上，我负责让他们重新相信自己。","result":"更衣室受到保护，媒体态度有所缓和。"},
            "否认危机":{"media":-9,"effect":"press_media_war","tone":"deflective","reply":"所谓保级危机只是媒体制造的话题，排名没有你们说得那么严重。","result":"积分榜数据反驳了你的说法，媒体开始质疑你是否失去判断。"},
            "责怪阵容":{"media":-11,"effect":"press_criticize_players","tone":"aggressive","reply":"有些位置的表现不够好，这就是我们身处这里的原因。","result":"公开指责在更衣室制造新的裂痕。"},
        },
    },
    "gk_mvp": {
        "question":["记者：门将 {mvp} 获得全场 MVP，并完成 {mvp_saves} 次扑救，这是否掩盖了球队防守的问题？",
                    "记者：如果没有 {mvp} 的连续扑救，结果可能完全不同，你如何评价他的表现？",
                    "记者：门将成为 MVP 通常意味着球队承受了太多射门，你对此感到骄傲还是担忧？",
                    "记者：{mvp} 本赛季多次拯救球队，他是否已经是更衣室最重要的人？",
                    "记者：你会如何奖励这位完成 {mvp_saves} 次扑救的门将？"],
        "options": {
            "盛赞门神":{"media":9,"effect":"press_praise_star","tone":"warm","reply":"{mvp} 今天不可思议，他用扑救给了所有人继续战斗的机会。","result":"门将获得巨大信心，媒体也给出整版赞誉。"},
            "强调职责":{"media":3,"effect":"press_praise","tone":"balanced","reply":"门将就是球队的一部分，他完成了职责，其他人也在保护球门。","result":"回答保持团队平衡，但略微淡化了个人英雄表现。"},
            "承认防线问题":{"media":7,"effect":"press_calm","tone":"responsible","reply":"他的伟大表现也提醒我们，不能让对手获得这么多机会。","result":"坦率分析受到认可，防线压力有所增加。"},
            "继续施压":{"media":-4,"effect":"press_star_pressure","tone":"aggressive","reply":"顶级门将就应该做到这些，我还期待他保持同样标准。","result":"媒体认为你对英雄过于苛刻，门将下一场表现可能走向极端。"},
            "回避个人":{"media":-3,"effect":"press_calm","tone":"bland","reply":"我不想谈论个人，比赛已经结束了。","result":"记者对你拒绝讨论全场焦点明显失望。"},
        },
    },
    "defeat_blame": {
        "question":["记者：球队今天全面处于下风，你认为谁应该为失利负责？",
                    "记者：球迷对这场失利非常愤怒，责任究竟在教练还是球员？",
                    "记者：这是本赛季最令人失望的表现之一，你是否正在失去更衣室？",
                    "记者：球队在关键时刻再次崩盘，你还能保证球员信任你的安排吗？",
                    "记者：看台终场响起嘘声，你想对远道而来的球迷说什么？"],
        "options": {
            "承担责任":{"media":8,"effect":"press_protect",
                     "reply":"失败首先属于我。球员执行了要求，我会保护他们并承担后果。",
                     "result":"多数记者认可你的担当，球员也公开表示愿意为你而战。"},
            "批评球员":{"media":-12,"effect":"press_criticize_players",
                     "reply":"有些球员没有达到职业标准，位置从来不是理所当然的。",
                     "result":"尖锐发言成为头条，更衣室被曝气氛紧张。"},
            "拒绝甩锅":{"media":3,"effect":"press_calm",
                     "reply":"这不是寻找替罪羊的时候，我们会一起复盘、一起回应。",
                     "result":"回答没有制造爆点，但避免了球队内部继续失血。"},
            "向球迷道歉":{"media":10,"effect":"press_protect",
                     "reply":"球迷付出时间和感情支持我们，今天的表现配不上他们，我向他们道歉。",
                     "result":"诚恳道歉迅速传播，球迷与媒体的怒火有所缓和。"},
            "承诺调整":{"media":5,"effect":"press_defiant",
                     "reply":"我不会给空洞借口。阵容和战术都会重新评估，下一场必须看到回应。",
                     "result":"媒体认可你的行动态度，但所有人都会盯着下一场变化。"},
        },
    },
    "star_pressure": {
        "question":["记者：{mvp} 再次成为焦点，你是否担心球队过度依赖他？",
                    "记者：外界称 {mvp} 一个人扛着球队前进，你同意这种说法吗？",
                    "记者：{mvp} 的身价和关注度都在上涨，球队能留住他吗？",
                    "记者：如果没有 {mvp} 的发挥，球队今天是否根本无法拿到结果？",
                    "记者：你会围绕 {mvp} 重新设计更多战术，还是避免给他额外压力？"],
        "options": {
            "称赞核心":{"media":6,"effect":"press_praise_star",
                     "reply":"伟大的球员就该享受聚光灯，{mvp} 配得上所有掌声。",
                     "result":"核心球员信心暴涨，但其他队员感受到了一些比较压力。"},
            "强调团队":{"media":9,"effect":"press_praise",
                     "reply":"{mvp} 很出色，但每一次跑动和掩护都来自整个团队。",
                     "result":"媒体赞赏你的平衡表态，更衣室对此反响积极。"},
            "给核心施压":{"media":-7,"effect":"press_star_pressure",
                     "reply":"真正的顶级球员不能满足于一场好球，我期待他做得更多。",
                     "result":"媒体炒作你与核心球员的关系，下一场他的表现可能走向极端。"},
            "保护核心":{"media":7,"effect":"press_protect",
                     "reply":"他不需要承担整个俱乐部的重量，我们会控制期待并保护他的空间。",
                     "result":"核心球员感受到支持，媒体也减少了部分围堵式采访。"},
            "淡化个人":{"media":1,"effect":"press_calm",
                     "reply":"任何个人都不能凌驾于团队，今天的结果属于所有上场的人。",
                     "result":"回答降低了个人热度，但核心球员的团队地位也被重新讨论。"},
        },
    },
    "tactics_doubt": {
        "question":["记者：你的战术安排今天受到质疑，你是否承认判断出现了问题？",
                    "记者：连续调整仍没控制住局面，你会重新考虑目前的打法吗？",
                    "记者：球队在领先后明显保守，这是你的要求还是球员自行退守？",
                    "记者：你在场边连续改变指令，是否反而让球员变得困惑？",
                    "记者：数据表明球队创造机会很少，你是否高估了当前战术体系？"],
        "options": {
            "承认失误":{"media":8,"effect":"press_calm",
                     "reply":"有些决定确实不够好，我会修正，而不是让球员替我承担。",
                     "result":"坦率态度缓和了舆论，球队压力有所下降。"},
            "坚持战术":{"media":-3,"effect":"press_defiant",
                     "reply":"方向没有问题，我们需要的是更坚决、更准确地执行。",
                     "result":"支持者认为你坚定，批评者则开始追踪每一个战术细节。"},
            "嘲讽记者":{"media":-15,"effect":"press_media_war",
                     "reply":"如果坐在这里提问就能赢球，也许你应该来带队。",
                     "result":"发布厅一片哗然，多家媒体宣布将持续审视球队。"},
            "解释思路":{"media":5,"effect":"press_praise",
                     "reply":"我们的目标是先制造局部人数优势，只是最后一传和跑位没有衔接好。",
                     "result":"具体解释让舆论更愿意讨论比赛，而不是单纯质疑能力。"},
            "归因执行":{"media":-8,"effect":"press_criticize_players",
                     "reply":"方案已经足够清晰，问题在于场上没有按照要求完成细节。",
                     "result":"媒体开始追问具体是谁没有执行，更衣室压力迅速增加。"},
        },
    },
    "referee": {
        "question":["记者：本场几次争议判罚影响了走势，裁判评分仅有 {ref_rating}，你如何评价主裁判？",
                    "记者：慢镜头显示关键判罚可能有误，赛后评分为 {ref_rating}，你是否会公开抗议？",
                    "记者：全场共出现 {cards} 张牌，裁判是否失去了对比赛尺度的控制？",
                    "记者：裁判组给自己留下了很多争议，你会向联盟提交正式报告吗？",
                    "记者：球员多次围住主裁，这是否说明今天的判罚缺乏说服力？"],
        "options": {
            "尊重裁判":{"media":5,"effect":"press_calm",
                     "reply":"裁判也要在瞬间决定，我们尊重判罚并专注自己的表现。",
                     "result":"回答稳妥，裁判委员会和媒体都没有继续放大争议。"},
            "含蓄质疑":{"media":1,"effect":"press_referee_soft",
                     "reply":"我只希望所有球队都能获得同样清晰、稳定的判罚尺度。",
                     "result":"媒体读懂了你的暗示，裁判压力小幅上升。"},
            "猛烈批评":{"media":-10,"effect":"press_referee",
                     "reply":"这样的判罚不该出现在职业比赛，它改变了所有人的努力。",
                     "result":"言论迅速登上热搜，裁判委员会表达强烈不满。"},
            "要求解释":{"media":2,"effect":"press_referee_soft",
                     "reply":"我们不要求特殊照顾，但联盟必须解释几个决定所依据的尺度。",
                     "result":"措辞克制而有针对性，媒体开始复盘关键判罚。"},
            "提交报告":{"media":0,"effect":"press_referee_soft",
                     "reply":"俱乐部会通过正式渠道提交材料，而不是在这里进行情绪化审判。",
                     "result":"你的程序化回应获得部分认可，联盟承诺审查录像。"},
        },
    },
    "transfer_rumor": {
        "question":["记者：有报道称更衣室内有人希望离队，你能否确认？",
                    "记者：转会流言正在影响备战，球队内部是否已经出现裂痕？",
                    "记者：多家媒体称核心球员拒绝续约，你是否被蒙在鼓里？",
                    "记者：经纪人频繁向外界放话，俱乐部是否已经失去谈判主动？",
                    "记者：有球员被拍到与其他俱乐部代表会面，你准备处罚他吗？"],
        "options": {
            "保护隐私":{"media":7,"effect":"press_protect",
                     "reply":"内部谈话不会变成公开审判，我会保护每一名球员。",
                     "result":"媒体虽然没得到爆料，但球员对你的保护非常满意。"},
            "公开否认":{"media":2,"effect":"press_calm",
                     "reply":"报道与事实不符，球队正在专心准备下一场比赛。",
                     "result":"舆论暂时降温，但记者仍在寻找消息来源。"},
            "点名警告":{"media":-13,"effect":"press_criticize_players",
                     "reply":"任何把个人利益放在球队之前的人，都不会获得出场保证。",
                     "result":"强硬回答制造巨大话题，更衣室开始猜测你在针对谁。"},
            "表达信任":{"media":8,"effect":"press_praise",
                     "reply":"我每天都和球员交流，他们对球队有承诺，我信任自己的更衣室。",
                     "result":"正面表态稳定了队内情绪，媒体暂时降低猜测强度。"},
            "交给管理层":{"media":-1,"effect":"press_calm",
                     "reply":"合同由管理层处理，我只关注训练和比赛中的职业态度。",
                     "result":"回答回避了核心问题，但也没有继续刺激转会传闻。"},
        },
    },
    "rivalry": {
        "question":["记者：下一轮对手声称你们只是运气好，你准备如何回应？",
                    "记者：对方主帅公开轻视你的球队，这会成为额外动力吗？",
                    "记者：对手球员在社交媒体上嘲讽了你的防线，你看到了吗？",
                    "记者：双方球迷已经开始互相攻击，你是否担心比赛失去控制？",
                    "记者：历史交锋对你们不利，你真的相信球队能改变局面吗？"],
        "options": {
            "尊重对手":{"media":7,"effect":"press_praise",
                     "reply":"口水不会决定比分，我们尊重对手，也相信自己的准备。",
                     "result":"成熟回应赢得好评，球队专注度保持稳定。"},
            "自信回应":{"media":3,"effect":"press_rival",
                     "reply":"如果他们真这么有把握，希望比赛结束后还能重复这句话。",
                     "result":"火药味迅速升温，球员斗志和比赛风险同时提高。"},
            "羞辱对手":{"media":-11,"effect":"press_media_war",
                     "reply":"他们最好先学会怎么踢球，再来讨论我们的运气。",
                     "result":"对手与媒体同时反击，球队被推上舆论风口。"},
            "转移焦点":{"media":6,"effect":"press_calm",
                     "reply":"真正值得讨论的是两支球队的足球，而不是谁的嘴更响。",
                     "result":"媒体接受了降温信号，赛前冲突风险有所下降。"},
            "激励球迷":{"media":4,"effect":"press_rival",
                     "reply":"我们需要球迷把能量留在看台，用支持帮助球队而不是制造冲突。",
                     "result":"球迷团体积极响应，球队斗志得到提升。"},
        },
    },
    "young_player": {
        "question":["记者：年轻球员最近失误频繁，你会继续给他机会吗？",
                    "记者：外界认为新人还没准备好承受这种级别的比赛，你怎么看？",
                    "记者：年轻球员在社交媒体遭到攻击，俱乐部会提供保护吗？",
                    "记者：你是否担心过早重用新人会毁掉他的信心？"],
        "options": {
            "公开保护":{"media":9,"effect":"press_protect","reply":"年轻人需要机会和保护，错误应该由教练帮助他消化。","result":"球员和媒体普遍赞赏你的保护态度。"},
            "继续信任":{"media":6,"effect":"press_praise_star","reply":"能力不会因为一次失误消失，他会继续得到证明自己的机会。","result":"年轻球员信心上涨，训练表现更加积极。"},
            "暂时轮换":{"media":2,"effect":"press_calm","reply":"我们会管理他的负荷，这不是惩罚，而是长期培养的一部分。","result":"务实回答降低了短期压力。"},
            "要求成长":{"media":-4,"effect":"press_star_pressure","reply":"职业足球不会等待任何人，他必须更快适应并承担责任。","result":"严厉要求引发讨论，球员下一场可能爆发或崩溃。"},
            "公开批评":{"media":-12,"effect":"press_criticize_players","reply":"同样的错误不能一直发生，年轻不是逃避责任的理由。","result":"媒体放大了批评，新人承受巨大心理压力。"},
        },
    },
    "fixture_fatigue": {
        "question":["记者：密集赛程导致球员疲惫，你是否会轮换主力？",
                    "记者：多名球员体能见底，继续使用他们是否过于冒险？",
                    "记者：球队伤病增加，你认为赛程安排需要承担责任吗？",
                    "记者：球员协会质疑休息时间不足，你支持他们吗？"],
        "options": {
            "保护球员":{"media":8,"effect":"press_protect","reply":"健康永远优先，我们会轮换，也希望赛程制定者听见球员的声音。","result":"球员感受到支持，媒体关系改善。"},
            "接受挑战":{"media":3,"effect":"press_praise","reply":"赛程对所有人一样，强队必须学会在疲劳中保持竞争力。","result":"回答展现自信，但主力仍承受额外期待。"},
            "批评赛程":{"media":1,"effect":"press_defiant","reply":"这样的安排忽视了比赛质量和球员健康，必须有人提出问题。","result":"部分媒体支持你，联盟则对公开批评表示不满。"},
            "责怪球员":{"media":-10,"effect":"press_criticize_players","reply":"职业球员应该管理好身体，疲劳不能成为表现不佳的借口。","result":"更衣室对这番话非常不满。"},
        },
    },
    "fan_pressure": {
        "question":["记者：主场球迷最近频繁嘘球队，你理解他们的情绪吗？",
                    "记者：有球迷要求你下课，你想如何回应？",
                    "记者：赛后球迷拒绝离场并要求球员解释，球队会与他们沟通吗？",
                    "记者：票价上涨但成绩没有改善，你是否欠球迷一个答案？"],
        "options": {
            "理解球迷":{"media":9,"effect":"press_protect","reply":"他们投入金钱、时间和感情，有权表达失望，我们必须用表现回应。","result":"诚恳态度缓和了看台敌意。"},
            "请求支持":{"media":6,"effect":"press_praise","reply":"困难时期更需要彼此站在一起，球迷的声音能真正推动球员。","result":"球迷组织发出联合支持声明。"},
            "承诺沟通":{"media":7,"effect":"press_calm","reply":"俱乐部会安排沟通渠道，球迷不该只能通过嘘声表达诉求。","result":"媒体称赞你愿意建立长期沟通。"},
            "反击球迷":{"media":-15,"effect":"press_media_war","reply":"如果他们只在顺境支持球队，那就不能称为真正的支持者。","result":"言论引发巨大争议，主场压力进一步恶化。"},
        },
    },
}

def media_relation_label(value):
    if value >= 60: return "亲密合作"
    if value >= 25: return "关系友好"
    if value > -25: return "正常关注"
    if value > -60: return "关系紧张"
    return "媒体围剿"

def format_career_streak(streak):
    if streak >= 2: return f"🔥 当前 {streak} 连胜"
    if streak <= -2: return f"📉 当前 {abs(streak)} 连败"
    if streak == 1: return "✅ 刚刚取得一场胜利"
    if streak == -1: return "⚠️ 刚刚遭遇一场失利"
    return "➖ 连续战绩已被平局中断"

def get_career_rank_context(career):
    if not career or career.get("mode") != "league": return None
    rows = sorted(career.get("table", {}).values(),
                  key=lambda r:(-r["Pts"],-(r["GF"]-r["GA"]),-r["GF"]))
    if not rows: return None
    user_name = career.get("teams", [{}])[0].get("name")
    idx = next((i for i,r in enumerate(rows) if r.get("team") == user_name), None)
    if idx is None: return None
    played = rows[idx].get("P",0)
    total = max(1, (len(rows)-1)*2)
    if played < max(5, total//4): return None
    rank = idx + 1
    if rank == 1:
        gap = rows[0]["Pts"] - rows[1]["Pts"] if len(rows)>1 else rows[0]["Pts"]
        key = "league_leader"
    elif rank <= 3:
        gap = max(0, rows[0]["Pts"] - rows[idx]["Pts"])
        key = "promotion_race"
    elif rank > len(rows)-2:
        safe_idx = max(0, len(rows)-3)
        gap = max(0, rows[safe_idx]["Pts"] - rows[idx]["Pts"])
        key = "relegation_battle"
    else:
        target_idx = min(2, len(rows)-1)
        gap = max(0, rows[target_idx]["Pts"] - rows[idx]["Pts"])
        key = "midtable_rank"
    return {"key":key,"rank":rank,"teams":len(rows),"played":played,
            "progress":min(100, int(round(played/total*100))),"gap":gap}

def get_competition_context(career):
    if career.get("mode") == "league":
        tier = career.get("league_tier","全国")
        names = {"克超":"克苏鲁超级联赛","冠":"克苏鲁冠军联赛",
                 "甲":"克苏鲁甲级联赛","乙":"克苏鲁乙级联赛","全国":"克苏鲁全国联赛"}
        tones = {"克超":"顶级豪门与冠军压力","冠":"升级竞争与高强度曝光",
                 "甲":"职业竞争与阵容稳定","乙":"生存、成长与有限资源",
                 "全国":"草根关注、地域荣誉与基础建设"}
        return {"mode":"league","tier":tier,"name":names.get(tier,tier),"tone":tones.get(tier,"")}
    bracket = career.get("bracket") or {}
    phase = bracket.get("phase","group")
    stage = "小组赛" if phase == "group" else "淘汰赛"
    if phase == "knockout":
        stages = bracket.get("stages",[])
        idx = bracket.get("current_stage",0)
        if 0 <= idx < len(stages): stage = stages[idx].get("name",stage)
    return {"mode":"cup","tier":"杯赛","name":"哈斯塔杯","tone":"一场定生死与杯赛荣誉","stage":stage}

def build_press_conference(m, user_won, is_draw, mvp_name, referee=None, streak=0,
                           rank_context=None, mvp_is_gk=False, mvp_saves=0,
                           competition=None):
    referee = referee or {"rating":7.0,"total_cards":0}
    strength = get_strength_result_context(m)
    common = ["young_player","fixture_fatigue","fan_pressure","transfer_rumor"]
    if referee["rating"] < 6.2:
        common += ["referee","referee"]
    if strength["key"] == "upset_win":
        pool = ["upset_result","upset_result","star_pressure"] + common
    elif strength["key"] == "favorite_failure":
        pool = ["favorite_collapse","favorite_collapse","defeat_blame","tactics_doubt"] + common
    elif strength["key"] == "underdog_draw":
        pool = ["underdog_draw_press","underdog_draw_press","tactics_doubt"] + common
    elif strength["key"] == "favorite_draw":
        pool = ["favorite_draw_press","favorite_draw_press","tactics_doubt"] + common
    elif mvp_is_gk:
        pool = ["gk_mvp","gk_mvp","star_pressure"] + common
    elif rank_context and random.random() < 0.48:
        pool = [rank_context["key"],rank_context["key"],"tactics_doubt"] + common
    elif streak >= 3:
        pool = ["winning_streak","winning_streak","star_pressure","rivalry"] + common
    elif streak <= -3:
        pool = ["losing_streak","losing_streak","defeat_blame","tactics_doubt","fan_pressure"] + common
    elif not user_won and not is_draw:
        pool = ["defeat_blame","tactics_doubt","defeat_blame"] + common
    elif user_won:
        pool = ["star_pressure","rivalry","star_pressure","tactics_doubt"] + common
    else:
        pool = ["referee","tactics_doubt","transfer_rumor"] + common
    key = random.choice(pool)
    data = PRESS_QUESTIONS[key]
    question = random.choice(data["question"]).format(
        mvp=mvp_name, opp=m["opp_name"], ref_rating=referee["rating"],
        cards=referee.get("total_cards",0), streak=abs(streak),
        rank=(rank_context or {}).get("rank","-"), gap=(rank_context or {}).get("gap",0),
        progress=(rank_context or {}).get("progress",0), mvp_saves=mvp_saves,
        user_ovr=f"{strength['user_ovr']:.1f}",opp_ovr=f"{strength['opp_ovr']:.1f}",
        ovr_gap=f"{strength['abs_gap']:.1f}")
    competition = competition or {"name":"本项赛事","tone":"","stage":""}
    prefixes = []
    if competition.get("mode") == "cup":
        prefixes = [f"在{competition.get('stage','杯赛')}的背景下，",
                    f"这是一场关系到{competition.get('name','杯赛')}去留的比赛，"]
    else:
        prefixes = [f"考虑到这里是{competition.get('name','联赛')}，",
                    f"在{competition.get('tone','当前竞争环境')}下，"]
    if prefixes and random.random() < 0.75:
        question = question.replace("记者：", "记者：" + random.choice(prefixes), 1)
    return {"available":True,"match_id":m["id"],"opp":m["opp_name"],
            "result":"胜" if user_won else ("平" if is_draw else "负"),
            "question_id":key,"question":question,"options":list(data["options"].keys()),
            "mvp":mvp_name,"referee":referee,
            "streak":streak,
            "rank_context":rank_context,"mvp_is_gk":mvp_is_gk,"mvp_saves":mvp_saves,
            "competition":competition,
            "strength":strength,
            "created_at":datetime.datetime.now().isoformat()}

def format_press_prompt(pending):
    opts = pending.get("options", [])
    option_text = "\n".join(f"{i+1}. {v}" for i, v in enumerate(opts))
    return f"🎙️ 【赛后新闻发布会】\n{pending.get('question','记者正在等待你的回答。')}\n\n{option_text}"

BLAND_PRESS_CHOICES = {
    "拒绝甩锅","保持低调","尊重裁判","公开否认","交给管理层","转移焦点",
    "暂时轮换","承诺沟通","沉默回避","轻视纪录","接受挑战","公开保护",
}
PASSIONATE_PRESS_CHOICES = {
    "剑指冠军","宣布变革","自信回应","猛烈批评","羞辱对手","反击球迷",
    "嘲讽记者","嘲讽质疑者","给核心施压","要求成长","批评赛程",
}

def press_answer_tone(choice, cfg):
    if cfg.get("tone"): return cfg["tone"]
    if choice in BLAND_PRESS_CHOICES or cfg.get("effect") == "press_calm": return "bland"
    if choice in PASSIONATE_PRESS_CHOICES or cfg.get("effect") in ("press_rival","press_media_war"):
        return "passionate"
    if cfg.get("effect") in ("press_protect","press_praise","press_praise_star"): return "warm"
    return "balanced"

def maybe_distort_press_answer(career, choice, cfg, media_delta, result_text):
    relation = career.get("media_relation", 0)
    bland = career.get("press_bland_streak", 0)
    tone = press_answer_tone(choice, cfg)
    if tone == "bland":
        bland += 1
    else:
        bland = max(0, bland - (2 if tone == "passionate" else 1))
    career["press_bland_streak"] = bland

    bland_penalty = 0
    if bland >= 3:
        # 连续安全回答会反噬：扣除量至少是本次原始正向收益的两倍。
        positive_gain = max(1, cfg.get("media", 0))
        bland_penalty = max(4, positive_gain * 2, bland + 1)
        media_delta -= bland_penalty
        attitudes = [
            "后排记者交换了一下眼神，几个人连追问的手都放了下来。",
            "发布厅短暂冷场，只剩下键盘敲击声，有人低声说“又是差不多的答案”。",
            "一名记者礼貌地点头，却提前合上电脑离席，现场明显缺少反应。",
            "记者席传来克制的叹气声，下一位提问者临时换成了更尖锐的问题。",
            "摄影灯还亮着，但不少记者已经开始整理设备，似乎没有等到真正的态度。",
        ]
        result_text += " " + random.choice(attitudes)

    # 关系越差、回答越安全，越可能被截取成带有攻击性的标题。
    distort_chance = 0.05 + max(0, -relation) / 240.0 + min(0.20, bland * 0.035)
    if tone == "bland": distort_chance += 0.08
    elif tone == "passionate": distort_chance += 0.04
    distorted = random.random() < min(0.62, distort_chance)
    headline = None
    if distorted:
        loss = random.randint(3, 9) + (2 if relation < -50 else 0)
        media_delta -= loss
        headlines = [
            f"“{choice}”被剪成短视频标题，媒体称你在逃避真正的问题",
            "采访中的半句话被单独截取，评论员将其解读为对球员失去耐心",
            "记者省略上下文发布报道，你的正常回答被包装成更衣室冲突",
            "社交媒体只传播最尖锐的一句，俱乐部被迫面对新一轮舆论",
            "媒体把克制回应描述为冷漠，把坚定回应描述为傲慢",
        ]
        headline = random.choice(headlines)
        result_text += f" 📺 {headline}（媒体 {-loss:+d}）。"
    return media_delta, result_text, tone, distorted, headline

def apply_press_conference(career, choice):
    pending = career.get("press_conference")
    if not pending or not pending.get("available"):
        return {"error":"当前没有可参加的赛后新闻发布会"}
    question = PRESS_QUESTIONS.get(pending.get("question_id"), {})
    options = question.get("options", {})
    if choice.isdigit():
        idx = int(choice) - 1
        labels = pending.get("options", [])
        choice = labels[idx] if 0 <= idx < len(labels) else choice
    cfg = options.get(choice)
    if not cfg:
        return {"error":f"该问题不能选择【{choice}】\n可选：{' / '.join(pending.get('options',[]))}"}
    media_delta = cfg.get("media", 0)
    effect_key = cfg["effect"]
    result_text = cfg["result"]
    referee = pending.get("referee") or {}
    if pending.get("question_id") == "referee" and choice in ("猛烈批评","要求解释","提交报告"):
        ref_rating = referee.get("rating", 7.0)
        if ref_rating < 4.5:
            media_delta = max(media_delta, 4 if choice == "猛烈批评" else 6)
            if choice == "猛烈批评": effect_key = "press_referee_soft"
            result_text = "裁判评分过低且争议证据充分，多数媒体认为你的批评有理，联盟也难以强硬反击。"
        elif ref_rating < 6.0:
            media_delta = max(media_delta, 0)
            if choice == "猛烈批评": effect_key = "press_referee_soft"
            result_text = "裁判表现确有明显问题，你的质疑获得不少支持，负面影响被大幅削弱。"
        elif ref_rating >= 8.0 and choice == "猛烈批评":
            media_delta -= 5
            result_text = "裁判评分很高，你的猛烈指责被视为转移责任，舆论反弹更加激烈。"
    media_delta, result_text, tone, distorted, headline = maybe_distort_press_answer(
        career, choice, cfg, media_delta, result_text)
    if pending.get("question_id") == "referee" and choice in ("猛烈批评","要求解释","提交报告"):
        ref_rating = referee.get("rating", 7.0)
        if ref_rating < 4.5:
            media_delta = max(0, media_delta)
        elif ref_rating < 6.0:
            media_delta = max(-2, media_delta)
    effect = {"key":effect_key,"duration":1,"source":"press"}
    if "mvp" in pending: effect["target_name"] = pending["mvp"]
    career.setdefault("active_effects", []).append(effect)
    old_media = career.get("media_relation", 0)
    new_media = max(-100, min(100, old_media + media_delta))
    career["media_relation"] = new_media
    prof = load_profile(career["user_key"])
    prof["media_relation"] = new_media
    prof["press_bland_streak"] = career.get("press_bland_streak",0)
    prof.setdefault("media_history", []).insert(0, {"question":pending.get("question"),
        "choice":choice,"delta":media_delta,"at":datetime.datetime.now().isoformat()})
    prof["media_history"] = prof["media_history"][:20]
    save_profile(prof)
    pending["available"] = False
    pending["choice"] = choice
    pending["answered_at"] = datetime.datetime.now().isoformat()
    pending["media_delta"] = media_delta
    pending["tone"] = tone
    pending["distorted"] = distorted
    pending["headline"] = headline
    career.setdefault("media_history", []).insert(0, {"choice":choice,"delta":media_delta})
    career["media_history"] = career["media_history"][:20]
    career.setdefault("press_tone_history", []).insert(0, tone)
    career["press_tone_history"] = career["press_tone_history"][:12]
    prof["press_tone_history"] = list(career["press_tone_history"])
    save_profile(prof)
    career.setdefault("history_log", []).append(f"🎙️ 新闻发布会：{choice}（媒体 {media_delta:+d}）")
    msg = (f"🎤 你的回答：“{cfg['reply'].format(mvp=pending.get('mvp','核心球员'))}”\n"
           f"📰 {result_text}")
    return {"ok":True,"msg":msg}

def _update_season_stats(career, user_side):
    for cid, ps in user_side.get("player_stats", {}).items():
        c = user_side["cards_snapshot"].get(cid)
        if not c: continue
        if ps.get("goals",0):
            career["stats"]["scorers"][cid] = career["stats"]["scorers"].get(cid, {"name":c["name"],"goals":0})
            career["stats"]["scorers"][cid]["goals"] += ps["goals"]
        if ps.get("assists",0):
            career["stats"]["assists"][cid] = career["stats"]["assists"].get(cid, {"name":c["name"],"assists":0})
            career["stats"]["assists"][cid]["assists"] += ps["assists"]

FUT_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap');
:root {{ --bg: {bg}; --border: {border}; --text: {text}; --line: {line}; }}
* {{ box-sizing: border-box; }}
body {{
    margin: 0; background: transparent;
    font-family: "Bebas Neue", "Noto Sans SC", "Arial Narrow", sans-serif;
    display: inline-block; padding: 10px;
}}
.fut-card {{
    width: 380px; height: 560px;
    background: var(--bg);
    color: var(--text);
    position: relative;
    padding: 22px 28px 30px;
    clip-path: path('M 14,0 L 155,0 Q 190,26 225,0 L 366,0 Q 380,0 380,14 L 380,400 C 380,470 320,525 190,548 C 60,525 0,470 0,400 L 0,14 Q 0,0 14,0 Z');
    box-shadow: 0 15px 40px rgba(0,0,0,0.6);
    overflow: hidden;
}}
/* 金属拉丝质感 */
.fut-card::before {{
    content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
        radial-gradient(ellipse at 50% 20%, rgba(255,255,255,0.20), transparent 55%),
        radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.35), transparent 60%),
        repeating-linear-gradient(90deg, transparent 0 3px, rgba(255,255,255,0.025) 3px 4px);
}}
/* 稀有卡：经典 FUT 琉璃全息光泽 */
.rare-foil::after {{
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background:
        /* 金属反射亮点 */
        radial-gradient(ellipse 220px 150px at 25% 20%, rgba(255,255,255,0.35), transparent 60%),
        radial-gradient(ellipse 200px 130px at 78% 55%, rgba(255,255,255,0.28), transparent 65%),
        radial-gradient(ellipse 150px 100px at 45% 88%, rgba(255,255,255,0.22), transparent 65%),
        /* 主斜纹 - 双条白光带 */
        linear-gradient(112deg,
            transparent 30%,
            rgba(255,255,255,0.18) 38%,
            rgba(255,255,255,0.48) 42%,
            rgba(255,255,255,0.18) 46%,
            transparent 54%,
            transparent 62%,
            rgba(255,255,255,0.12) 66%,
            rgba(255,255,255,0.32) 70%,
            rgba(255,255,255,0.12) 74%,
            transparent 82%),
        /* 反向副纹 */
        linear-gradient(-68deg,
            transparent 40%,
            rgba(255,255,255,0.10) 48%,
            rgba(255,255,255,0.25) 52%,
            rgba(255,255,255,0.10) 56%,
            transparent 64%),
        /* 顶部塑封膜反光 */
        radial-gradient(ellipse 320px 90px at 50% -8%,
            rgba(255,255,255,0.45),
            transparent 70%),
        /* 彩虹色偏 */
        linear-gradient(105deg,
            rgba(180,220,255,0.14) 0%,
            rgba(255,220,240,0.12) 25%,
            rgba(255,245,200,0.14) 50%,
            rgba(210,255,220,0.12) 75%,
            rgba(200,220,255,0.14) 100%);
    mix-blend-mode: screen;
    opacity: 1;
}}
/* HERO 火卡烈焰光泽 */
.hero-foil::after {{
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background:
        radial-gradient(ellipse 240px 160px at 30% 20%, rgba(255,220,120,0.55), transparent 60%),
        radial-gradient(ellipse 200px 140px at 75% 65%, rgba(255,140,50,0.42), transparent 65%),
        radial-gradient(ellipse 180px 220px at 50% 100%, rgba(255,60,10,0.55), transparent 60%),
        linear-gradient(112deg,
            transparent 30%,
            rgba(255,220,140,0.30) 38%,
            rgba(255,255,220,0.65) 42%,
            rgba(255,220,140,0.30) 46%,
            transparent 54%,
            transparent 62%,
            rgba(255,150,70,0.22) 66%,
            rgba(255,200,100,0.42) 70%,
            rgba(255,150,70,0.22) 74%,
            transparent 82%),
        radial-gradient(ellipse 320px 90px at 50% -8%,
            rgba(255,235,150,0.55),
            transparent 70%);
    mix-blend-mode: screen;
    opacity: 1;
}}
/* 赛季新星：天蓝白冰晶波纹 */
.rising-foil::after {{
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background:
        radial-gradient(ellipse 240px 160px at 30% 20%, rgba(200,240,255,0.65), transparent 60%),
        radial-gradient(ellipse 200px 140px at 75% 65%, rgba(125,211,252,0.45), transparent 65%),
        linear-gradient(112deg,
            transparent 30%,
            rgba(224,242,254,0.35) 40%,
            rgba(255,255,255,0.72) 44%,
            rgba(224,242,254,0.35) 48%,
            transparent 58%);
    mix-blend-mode: screen; opacity: 1;
}}

/* 超新星：黑橙爆炸放射线 */
.nova-foil::after {{
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background:
        radial-gradient(circle at 50% 30%, rgba(255,180,80,0.55), transparent 55%),
        radial-gradient(ellipse 260px 90px at 50% 85%, rgba(255,110,30,0.50), transparent 65%),
        conic-gradient(from 45deg at 50% 40%,
            transparent 0deg,
            rgba(255,150,50,0.30) 20deg,
            transparent 40deg,
            rgba(255,220,150,0.25) 60deg,
            transparent 80deg);
    mix-blend-mode: screen; opacity: 1;
}}

/* 转会焦点：紫罗兰神秘辉光 */
.focus-foil::after {{
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background:
        radial-gradient(ellipse 220px 140px at 25% 25%, rgba(196,181,253,0.55), transparent 62%),
        radial-gradient(ellipse 200px 130px at 78% 60%, rgba(168,85,247,0.40), transparent 65%),
        radial-gradient(ellipse 180px 220px at 50% 100%, rgba(76,29,149,0.55), transparent 60%),
        linear-gradient(105deg,
            rgba(216,180,254,0.22) 20%,
            rgba(196,181,253,0.35) 45%,
            rgba(216,180,254,0.22) 70%);
    mix-blend-mode: screen; opacity: 1;
}}

/* 怪异天赋：墨绿藤蔓斑驳 */
.talent-foil::after {{
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background:
        radial-gradient(ellipse 180px 120px at 20% 25%, rgba(74,222,128,0.45), transparent 60%),
        radial-gradient(ellipse 200px 140px at 78% 70%, rgba(34,197,94,0.35), transparent 65%),
        repeating-linear-gradient(38deg,
            transparent 0 15px,
            rgba(134,239,172,0.10) 15px 17px);
    mix-blend-mode: screen; opacity: 1;
}}

/* 客串大师：红白国旗条纹 */
.util-foil::after {{
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background:
        radial-gradient(ellipse 220px 150px at 30% 25%, rgba(255,255,255,0.45), transparent 62%),
        linear-gradient(112deg,
            transparent 30%,
            rgba(255,255,255,0.50) 44%,
            transparent 58%);
    mix-blend-mode: screen; opacity: 1;
}}
/* FUT 水印 */
.fut-watermark {{
    font-family: "Bebas Neue", sans-serif;
    position: absolute;
    top: 38%; left: 50%;
    transform: translate(-50%, -50%) rotate(-8deg);
    font-size: 180px; font-weight: 400; font-style: italic;
    color: var(--text); opacity: 0.11;
    letter-spacing: 12px; z-index: 2; pointer-events: none;
    white-space: nowrap;
}}
.fut-inner {{ position: relative; z-index: 10; height: 100%; }}
/* 顶部：左侧信息 + 右侧立绘 */
/* 顶部：左侧信息 + 右侧立绘 */
.fut-top {{
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 0;
    height: 230px;
    position: relative;
}}
.fut-meta {{
    display: flex; flex-direction: column;
    align-items: center; justify-content: flex-start;
    padding-top: 8px;
    z-index: 3;
    position: relative;
}}
.fut-ovr {{
    font-family: "Bebas Neue", sans-serif;
    font-size: 68px; font-weight: 400;
    line-height: 0.9;
    letter-spacing: 1px;
    text-indent: 1px;
    text-shadow:
        0 2px 3px rgba(0,0,0,0.25),
        0 -1px 0 rgba(255,255,255,0.25);
}}
.fut-divider {{
    width: 36px; height: 2px;
    background: var(--text);
    opacity: 0.55; margin: 6px 0 4px;
}}
.fut-pos {{
    font-family: "Bebas Neue", sans-serif;
    font-size: 26px; font-weight: 400;
    letter-spacing: 3px;
    text-indent: 3px;
    text-shadow:
        0 2px 2px rgba(0,0,0,0.2),
        0 -1px 0 rgba(255,255,255,0.2);
}}
.fut-portrait {{
    display: flex; align-items: flex-end; justify-content: center;
    overflow: visible;
    margin-left: -20px;
    padding-top: 5px;
}}
.fut-portrait svg {{
    width: 130px; height: 130px;
    fill: var(--text); opacity: 0.9;
    margin-bottom: 15px;
}}
.fut-avatar {{
    width: 240px; height: 240px;
    object-fit: cover; object-position: top center;
    -webkit-mask-image:
        linear-gradient(to bottom, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%),
        linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 10%, rgba(0,0,0,1) 90%, rgba(0,0,0,0) 100%),
        linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 8%);
    mask-image:
        linear-gradient(to bottom, rgba(0,0,0,1) 55%, rgba(0,0,0,0) 100%),
        linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 10%, rgba(0,0,0,1) 90%, rgba(0,0,0,0) 100%),
        linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 8%);
    -webkit-mask-composite: source-in;
    mask-composite: intersect;
    filter: drop-shadow(0 0 12px rgba(0,0,0,0.15));
}}
/* 姓名区 */
.fut-name-box {{
    text-align: center;
    margin: 4px 0 0;
    padding: 0 10px;
}}
.fut-name {{
    font-family: "Noto Sans SC", "Bebas Neue", sans-serif;
    font-size: 30px; font-weight: 700;
    letter-spacing: 3px;
    line-height: 1.05;
    text-shadow:
        0 2px 3px rgba(0,0,0,0.25),
        0 -1px 0 rgba(255,255,255,0.2);
}}
.fut-prof {{
    font-family: "Noto Sans SC", "Bebas Neue", sans-serif;
    font-size: 14px; font-weight: 500;
    opacity: 0.85; margin-top: 4px;
    letter-spacing: 1.5px;
}}
.fut-hr {{
    width: 46px; height: 2px;
    margin: 12px auto 14px;
    background: var(--text);
    opacity: 0.55;
    border-radius: 2px;
}}
/* stat 网格 */
.fut-stats {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    row-gap: 10px;
    column-gap: 24px;
    padding: 0 42px;
    margin-top: 0;
}}
.fut-stat {{
    display: flex; align-items: baseline; gap: 10px;
    padding: 5px 2px 7px;
    border-bottom: 1px solid var(--line);
}}
.fut-stat-num {{
    font-family: "Bebas Neue", sans-serif;
    font-size: 36px; font-weight: 400;
    line-height: 1; min-width: 50px;
    letter-spacing: 1px;
    text-align: right;
    text-shadow:
        0 2px 2px rgba(0,0,0,0.2),
        0 -1px 0 rgba(255,255,255,0.25);
}}
.fut-stat-label {{
    font-family: "Bebas Neue", sans-serif;
    font-size: 22px; font-weight: 400;
    opacity: 0.85; letter-spacing: 2.5px;
}}
"""

SILHOUETTE_SVG = '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'

SHARDS_SVG = '''<svg class="fut-shards" viewBox="0 0 380 560" preserveAspectRatio="none">
    <polygon points="200,190 30,15 140,10" class="s-b"/>
    <polygon points="200,190 140,10 220,20" class="s-m"/>
    <polygon points="200,190 220,20 300,15" class="s-d"/>
    <polygon points="200,190 300,15 370,70" class="s-b"/>
    <polygon points="200,190 370,70 355,190" class="s-m"/>
    <polygon points="200,190 355,190 345,320" class="s-d"/>
    <polygon points="200,190 345,320 240,360" class="s-b"/>
    <polygon points="200,190 240,360 130,345" class="s-m"/>
    <polygon points="200,190 130,345 30,300" class="s-b"/>
    <polygon points="200,190 30,300 15,180" class="s-d"/>
    <polygon points="200,190 15,180 25,80" class="s-m"/>
    <polygon points="200,190 25,80 30,15" class="s-b"/>
</svg>'''

SKILL_MAP = {
    "PAC": ["攀爬", "跳跃", "游泳", "潜水", "汽车驾驶", "驾驶", "骑术", "导航", "追踪"],
    "SHO": ["格斗", "射击", "投掷", "爆破", "炮术"],
    "PAS": ["取悦", "恐吓", "话术", "说服", "外语", "急救", "精神分析", "催眠", "信用"],
    "DRI": ["侦查", "潜行", "妙手", "锁匠", "电气", "机械", "电子", "计算", "技艺", "乔装"],  # 图书馆移除
    "DEF": ["闪避", "聆听", "读唇", "估价", "会计", "法律", "克苏鲁", "医学", "图书馆"],  # 新增图书馆
    "PHY": ["生存", "重型机械", "驯兽", "人类学", "历史", "考古学", "博物学", "神秘学", "科学"]
}

GK_SKILL_MAP = {
    # 扑救：身体飞扑、爆发和延展性
    "DIV": ["闪避", "跳跃", "潜水", "游泳", "攀爬"],
    # 手型：手部精细操作与稳定抓握
    "HAN": ["妙手", "锁匠", "技艺", "电子", "电气", "格斗", "投掷"],
    # 开球：远距离力量输出与机械操控
    "KIC": ["射击", "炮术", "爆破", "机械", "重型"],
    # 反应：察觉、预判、快速处置
    "REF": ["侦查", "聆听", "读唇", "追踪", "潜行", "急救", "催眠", "精神分析", "乔装"],
    # 速度：移动、位移、野外活动
    "SPD": ["汽车驾驶", "驾驶", "骑术", "导航", "生存", "驯兽"],
    # 站位：知识、心理战、指挥判断（门将的大脑）
    "POS": ["说服", "话术", "恐吓", "取悦", "外语", "信用",
            "图书馆", "历史", "法律", "会计", "估价",
            "克苏鲁", "医学", "人类学", "考古", "博物", "神秘", "科学",
            "计算"]
}

# COC 7e 技能默认值。未列出的按 1 处理。
SKILL_DEFAULTS = {
    # PAC 类
    "攀爬": 20, "跳跃": 20, "游泳": 20, "潜水": 1,
    "汽车驾驶": 20, "驾驶": 1, "骑术": 5, "导航": 10, "追踪": 10,
    # SHO 类
    "格斗": 25, "斗殴": 25, "射击": 20, "手枪": 20, "步枪": 25,
    "投掷": 20, "爆破": 1, "炮术": 1,
    # PAS 类
    "取悦": 15, "恐吓": 15, "话术": 5, "说服": 10,
    "外语": 1, "急救": 30, "医学": 1, "精神分析": 1, "催眠": 1, "信用": 0,
    # DRI 类
    "侦查": 25, "潜行": 20, "妙手": 10, "锁匠": 1,
    "电气": 10, "机械": 10, "电子": 1, "计算": 5,
    "技艺": 5, "乔装": 5, "图书馆": 20,
    # DEF 类
    "聆听": 20, "读唇": 1, "估价": 5, "会计": 5, "法律": 5, "克苏鲁": 0,
    # PHY 类
    "生存": 10, "重型": 1, "驯兽": 5,
    "人类学": 1, "历史": 5, "考古": 1, "博物": 10, "神秘": 5, "科学": 1,
}

PEN_GOAL_LINES = {
    "aggressive": [
        "🚀 {kicker} 势大力沉，皮球呼啸入网！{gk} 扑救鞭长莫及！",
        "💥 {kicker} 一记炮弹！门柱都在颤抖！",
        "⚡ {kicker} 大力抽射死角，无解！",
    ],
    "balanced": [
        "⚽ {kicker} 沉稳推射，滚地球擦柱入网！",
        "🎯 {kicker} 常规射门，皮球贴着立柱进！",
        "✅ {kicker} 冷静打远角，教科书点球！",
    ],
    "steady": [
        "📐 {kicker} 精准送入死角，{gk} 判对方向也够不着！",
        "🎯 {kicker} 稳稳推入网底，滴水不漏！",
        "🧊 {kicker} 心态起飞，冷静罚进！",
    ],
    "fancy": [
        "🎩 {kicker} 勺子挑射！{gk} 大字型倒地一脸懵！",
        "🎭 {kicker} 助跑一停，晃开 {gk} 后轻推入网！",
        "🌈 {kicker} 花式假动作骗过 {gk}，破门瞬间掌声雷动！",
    ],
}
PEN_SAVE_LINES = {
    "aggressive": [
        "🧤 {gk} 预判神准，把 {kicker} 的爆射双拳击出！",
        "🛡️ {gk} 提前起跳，把 {kicker} 的大力射门神奇挡出！",
    ],
    "balanced": [
        "🧤 {gk} 稳稳没收 {kicker} 的推射！",
        "✋ {gk} 反应迅速，把 {kicker} 的射门扑出底线！",
    ],
    "steady": [
        "🧤 {gk} 站位极佳，把 {kicker} 的射门抱入怀中！",
        "🔒 {gk} 一动不动等到 {kicker} 出脚，稳稳抓住！",
    ],
    "fancy": [
        "🎪 {gk} 不为所动，把 {kicker} 的勺子挑射轻松没收！",
        "😏 {gk} 站着不动，看 {kicker} 花活失败！",
    ],
}
PEN_MISS_LINES = {
    "aggressive": [
        "❌ {kicker} 力量过猛，皮球飞向看台！",
        "💦 {kicker} 大力射高了，观众席一片惋惜！",
    ],
    "balanced": [
        "😩 {kicker} 击中门柱！与进球擦肩而过！",
        "🎯 {kicker} 常规射门却打偏了，可惜！",
    ],
    "steady": [
        "😖 {kicker} 想稳反而软了，皮球被门将轻松没收！",
        "🌫 {kicker} 求稳过头，射门缺乏威胁！",
    ],
    "fancy": [
        "🤡 {kicker} 花哨过头，勺子挑到看台！",
        "😂 {kicker} 玩脱了！皮球擦门柱飞出，全场哗然！",
    ],
}

def build_penalty_commentary(m, round_no, h_res, a_res):
    lines = [f"⚽ 【点球大战 第 {round_no} 轮】"]
    def one(res, team):
        if res is None: return None
        if res["goal"]:
            tmpl = random.choice(PEN_GOAL_LINES[res["k_strat"]])
        elif res["type"] == "save":
            tmpl = random.choice(PEN_SAVE_LINES[res["g_strat"]])
        else:
            tmpl = random.choice(PEN_MISS_LINES[res["k_strat"]])
        line = tmpl.format(kicker=res["kicker"], gk=res["gk"])

        # 随机策略彩蛋标注
        tags = []
        if res.get("k_input") == "random":
            tags.append(f"🎲射{STRAT_CN_KEY[res['k_strat']]}")
        if res.get("g_input") == "random":
            tags.append(f"🎲守{STRAT_CN_KEY[res['g_strat']]}")
        tag_str = f"（{' '.join(tags)}）" if tags else ""

        return f"【{team}】 " + line + tag_str
    l1 = one(h_res, m["home_name"])
    if l1: lines.append(l1)
    l2 = one(a_res, m["away_name"])
    if l2: lines.append(l2)
    so = m["shootout"]
    lines.append(f"⏱ 比分：{so['home_goals']} : {so['away_goals']}")
    return "\n".join(lines)

PEN_STRAT_CN = {
    "激进":"aggressive","平衡":"balanced","稳重":"steady","花哨":"fancy","随机":"random",
    "aggressive":"aggressive","balanced":"balanced","steady":"steady",
    "fancy":"fancy","random":"random","随":"random"
}
STRAT_CN_KEY = {"aggressive":"激进","balanced":"平衡","steady":"稳重","fancy":"花哨"}

def init_shootout(m):
    def kickers_of(side):
        # SHO 从高到低排 5 位主罚（含替补席可选未罚下的球员，简化为首发）
        cards = side["cards_snapshot"]
        cand = []
        for slot, cid in side["starters"].items():
            if slot == "GK": continue
            c = cards.get(cid)
            if not c: continue
            cand.append((c["stats"].get("sho", 40), cid, c["name"]))
        cand.sort(key=lambda x: -x[0])
        return [{"cid": cid, "name": name, "sho": s} for s, cid, name in cand[:5]]
    return {
        "round": 1, "max_regular": 5,
        "home_kickers": kickers_of(m["home"]),
        "away_kickers": kickers_of(m["away"]),
        "home_goals": 0, "away_goals": 0,
        "home_shots": 0, "away_shots": 0,
        "history": [],
        "pending": {},   # side_key -> {"kicker": strat, "gk": strat}
    }

PENALTY_MOD = {
    "kicker": {
        "aggressive": {"acc":0.90, "power":1.15},
        "balanced":   {"acc":1.00, "power":1.00},
        "steady":     {"acc":1.12, "power":0.92},
        "fancy":      {"acc":0.80, "power":0.95, "trick":1.0},
    },
    "gk": {
        "aggressive": {"save":1.20},
        "balanced":   {"save":1.00},
        "steady":     {"save":1.06},
        "fancy":      {"save":0.85, "distract":1.0},
    }
}

def simulate_penalty(kicker_side, kicker, def_side, k_strat, g_strat, k_input=None, g_input=None):
    ck = kicker_side["cards_snapshot"].get(kicker["cid"])
    sho = ck["stats"].get("sho", 60) if ck else 60
    gk_cid = def_side["starters"].get("GK")
    gc = def_side["cards_snapshot"].get(gk_cid)
    if gc and gc.get("is_gk"):
        gk_val = (gc["stats"].get("div",60)+gc["stats"].get("ref",60)+gc["stats"].get("han",60))/3
        gk_name = gc["name"]
    elif gc:
        gk_val = (gc["stats"].get("def",50)+gc["stats"].get("phy",50))/2 * 0.75
        gk_name = gc["name"]
    else:
        gk_val, gk_name = 40, "门将"

    km = PENALTY_MOD["kicker"][k_strat]
    gm = PENALTY_MOD["gk"][g_strat]

    # 基础转化率：0.72 底盘 + SHO/GK 差值
    base = 0.72 + (sho - gk_val) / 220
    conv = max(0.25, min(0.92, base * km["acc"]))
    # 心理博弈：策略克制关系
    if k_strat == "fancy" and g_strat == "aggressive": conv *= 0.75
    if k_strat == "fancy" and g_strat == "steady":     conv *= 1.15
    if k_strat == "aggressive" and g_strat == "steady":conv *= 1.05
    if k_strat == "aggressive" and g_strat == "aggressive": conv *= 0.90
    if k_strat == "steady" and g_strat == "fancy":     conv *= 1.10
    if k_strat == "balanced" and g_strat == "aggressive": conv *= 0.92

    conv *= (2 - gm["save"])   # gm.save 越高 conv 越低

    r = random.random()

    if r < conv:
        return {"goal": True, "type": "goal",
                "kicker": kicker["name"], "gk": gk_name,
                "k_strat": k_strat, "g_strat": g_strat,
                "k_input": k_input, "g_input": g_input}
    # 未进：50% 扑救 50% 射失
    if random.random() < 0.5:
        return {"goal": False, "type": "save",
                "kicker": kicker["name"], "gk": gk_name,
                "k_strat": k_strat, "g_strat": g_strat,
                "k_input": k_input, "g_input": g_input}
    return {"goal": False, "type": "miss",
            "kicker": kicker["name"], "gk": gk_name,
            "k_strat": k_strat, "g_strat": g_strat,
            "k_input": k_input, "g_input": g_input}

def check_shootout_end(so):
    hg, ag = so["home_goals"], so["away_goals"]
    hs, as_ = so["home_shots"], so["away_shots"]
    remain_h = so["max_regular"] - hs
    remain_a = so["max_regular"] - as_
    # 常规 5 轮内提前锁定
    if hs <= so["max_regular"] and hg > ag + remain_a: return True, "home"
    if as_ <= so["max_regular"] and ag > hg + remain_h: return True, "away"
    # 5 轮打完
    if hs >= so["max_regular"] and as_ >= so["max_regular"]:
        if hg != ag: return True, ("home" if hg > ag else "away")
    # 加罚（双方射次相同后比分不等即结束）
    if hs > so["max_regular"] and hs == as_ and hg != ag:
        return True, ("home" if hg > ag else "away")
    return False, None

def resolve_penalty_round(m):
    so = m["shootout"]
    r = so["round"]
    kh = so["home_kickers"][(r-1) % len(so["home_kickers"])]
    ka = so["away_kickers"][(r-1) % len(so["away_kickers"])]

    h_res = simulate_penalty(m["home"], kh, m["away"],
        so["pending"]["home"]["kicker"], so["pending"]["away"]["gk"],
        so["pending"]["home"].get("kicker_input"), so["pending"]["away"].get("gk_input"))
    so["home_shots"] += 1
    if h_res["goal"]: so["home_goals"] += 1

    # 中场检查
    ended, winner = check_shootout_end(so)

    a_res = None
    if not ended:
        a_res = simulate_penalty(m["away"], ka, m["home"],
        so["pending"]["away"]["kicker"], so["pending"]["home"]["gk"],
        so["pending"]["away"].get("kicker_input"), so["pending"]["home"].get("gk_input"))
        so["away_shots"] += 1
        if a_res["goal"]: so["away_goals"] += 1
        ended, winner = check_shootout_end(so)

    so["history"].append({"round": r, "home": h_res, "away": a_res,
                           "home_goals": so["home_goals"], "away_goals": so["away_goals"]})
    so["pending"] = {}
    so["round"] += 1

    text = build_penalty_commentary(m, r, h_res, a_res)
    img = render_penalty_board(m)

    if ended:
        m["home"]["goals"] = m["home"]["goals"]   # 常规比分不变
        m["away"]["goals"] = m["away"]["goals"]
        m["status"] = "done"
        winner_name = m["home_name"] if winner == "home" else m["away_name"]
        # 复用现有 finalize，但覆盖 winner
        # 简化：单独构建最终返回
        final = finalize_match(m)
        final["winner"] = winner_name   # 强制覆盖，点球胜方
        final["shootout_score"] = f"{so['home_goals']}({m['home']['goals']}):{so['away_goals']}({m['away']['goals']})"
        save_match(m)
        return jsonify({"status":"ok","phase":"shootout_final",
            "commentary": text, "img": img,
            "final": final,
            "score": final["shootout_score"]})
    save_match(m)
    return jsonify({"status":"ok","phase":"shootout_round",
        "commentary": text, "img": img,
        "score": f"{so['home_goals']}:{so['away_goals']}（第 {r} 轮）",
        "next_round": so["round"]})

PENALTY_BOARD_CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0e1a; font-family: 'Bebas Neue','Noto Sans SC',sans-serif; color: #fff; }
.pb { width: 900px; padding: 30px; }
.pb-title {
    text-align: center; font-size: 32px; letter-spacing: 10px; color: #d4af37;
    padding-bottom: 16px; border-bottom: 2px solid #d4af37; margin-bottom: 24px;
}
.pb-score {
    text-align: center; font-size: 72px; color: #d4af37;
    letter-spacing: 8px; margin: 10px 0 24px;
}
.pb-teams { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.pb-side {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(212,175,55,0.3);
    border-radius: 10px; padding: 18px 16px;
}
.pb-name { text-align: center; font-size: 22px; letter-spacing: 4px;
           color: #d4af37; margin-bottom: 14px; font-family: 'Noto Sans SC'; font-weight: 700; }
.pb-shots { display: flex; gap: 10px; justify-content: center; margin-bottom: 14px; flex-wrap: wrap;}
.dot { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center;
       justify-content: center; font-size: 22px; font-weight: 700; }
.dot-goal { background: linear-gradient(135deg,#22c55e,#158a3f); color: #fff; }
.dot-save { background: linear-gradient(135deg,#ef4444,#8a1c1c); color: #fff; }
.dot-miss { background: rgba(180,180,180,0.4); color: #fff; }
.dot-pending { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.3);
               border: 2px dashed rgba(255,255,255,0.25); }
.pb-kickers { border-top: 1px solid rgba(255,255,255,0.1); padding-top: 12px; }
.pb-kickers-title { font-size: 12px; letter-spacing: 3px; color: rgba(255,255,255,0.5); margin-bottom: 8px;}
.kick-row { display: flex; justify-content: space-between; padding: 5px 6px;
            font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.05);}
.kick-row.done { opacity: 0.4; }
.kick-name { font-family: 'Noto Sans SC'; font-weight: 700; }
.kick-sho { color: #fbbf24; font-family: 'Bebas Neue'; letter-spacing: 1px; }
"""

def render_penalty_board(m):
    so = m["shootout"]
    def dots(history_key, kickers, total_shots, max_regular):
        out = []
        for i, ev in enumerate(so["history"]):
            r = ev.get(history_key)
            if r is None:
                out.append('<div class="dot dot-pending">—</div>')
            elif r["goal"]:
                out.append('<div class="dot dot-goal">✓</div>')
            elif r["type"] == "save":
                out.append('<div class="dot dot-save">🧤</div>')
            else:
                out.append('<div class="dot dot-miss">✗</div>')
        # 未进行的轮次
        n_max = max(len(so["history"]), max_regular)
        while len(out) < n_max:
            out.append('<div class="dot dot-pending">·</div>')
        return "".join(out)

    def kicker_list(kickers, shots_done):
        rows = []
        for i, k in enumerate(kickers):
            done_class = " done" if i < shots_done else ""
            rows.append(
                f'<div class="kick-row{done_class}"><span class="kick-name">{i+1}. {k["name"]}</span>'
                f'<span class="kick-sho">SHO {k["sho"]}</span></div>')
        return "".join(rows)

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@700&display=swap" rel="stylesheet">
    <style>{PENALTY_BOARD_CSS}</style></head><body>
    <div class="pb">
        <div class="pb-title">PENALTY SHOOTOUT · 点球大战</div>
        <div class="pb-score">{so['home_goals']} : {so['away_goals']}</div>
        <div class="pb-teams">
            <div class="pb-side">
                <div class="pb-name">{m['home_name']}</div>
                <div class="pb-shots">{dots("home", so["home_kickers"], so["home_shots"], so["max_regular"])}</div>
                <div class="pb-kickers">
                    <div class="pb-kickers-title">主罚顺序（按 SHO 降序）</div>
                    {kicker_list(so["home_kickers"], so["home_shots"])}
                </div>
            </div>
            <div class="pb-side">
                <div class="pb-name">{m['away_name']}</div>
                <div class="pb-shots">{dots("away", so["away_kickers"], so["away_shots"], so["max_regular"])}</div>
                <div class="pb-kickers">
                    <div class="pb-kickers-title">主罚顺序（按 SHO 降序）</div>
                    {kicker_list(so["away_kickers"], so["away_shots"])}
                </div>
            </div>
        </div>
    </div></body></html>"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':960,'height':900}, device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector(".pb").screenshot(type='png')
        browser.close()
    fname = f"pen_{m['id']}_r{so['round']-1}.png"
    with open(os.path.join(SAVE_DIR, fname), "wb") as f: f.write(img)
    return fname.replace(".png","")

def get_skill_investment(skill_key, skill_val, bases):
    """返回玩家在这项技能上的加点量（相对默认值）"""
    # 特殊：默认值绑定基础属性的两项
    if "闪避" in skill_key:
        return max(0, skill_val - bases.get("dex", 50) // 2)
    if "母语" in skill_key:
        return max(0, skill_val - bases.get("edu", 50))
    # 常规查表
    for baseline_key, default in SKILL_DEFAULTS.items():
        if baseline_key in skill_key:
            return max(0, skill_val - default)
    return max(0, skill_val - 1)

ALL_RELEVANT_SKILLS = [skill for cat in SKILL_MAP.values() for skill in cat]

def clean_key(val): return re.sub(r'[^\u4e00-\u9fa5a-zA-Z]', '', str(val)).lower()

def parse_num(val):
    try:
        if isinstance(val, (int, float)): return float(val)
        num_str = re.search(r'\d+', str(val))
        if num_str: return float(num_str.group())
    except: pass
    return None

def get_next_val(sheet, r_idx, c_idx, max_col, max_offset=4, expect_num=False):
    for offset in range(1, max_offset + 1):
        if c_idx + offset > max_col: break
        cell = sheet.cell(row=r_idx, column=c_idx + offset)
        if cell.value is None: continue
        value = str(cell.value).strip()
        if not value: continue
        if expect_num:
            num = parse_num(value)
            if num is not None:
                return num
            continue
        return value
    return None

def get_max_num_for_base(sheet, r_idx, c_idx, max_col):
    """基础属性提取：限制只读取 15~120 的数字，剔除掉下方折半的困难数值"""
    nums = []
    for offset in range(1, 4):
        if c_idx + offset > max_col: break
        v = parse_num(sheet.cell(row=r_idx, column=c_idx + offset).value)
        if v is not None and 15 <= v <= 120: nums.append(int(v))
    v_below = parse_num(sheet.cell(row=r_idx+1, column=c_idx).value)
    if v_below is not None and 15 <= v_below <= 120: nums.append(int(v_below))
    return max(nums) if nums else None

def get_skill_total(sheet, r_idx, c_idx, max_col):
    """
    技能行布局: [初始] ... [加点后] ... [成功率=总值] _ [困难=总值//2] _ [极难=总值//5]
    列间存在空白间隔，极难列可能整列为空。策略：
      1) 优先找同时出现 X, X//2, X//5 的三元组，返回最大的 X
      2) 退化为找 X 与 X//2 的配对（X >= 2 避免 0/1 类噪声）
      3) 只有单值时返回最大值
    """
    values = []
    for offset in range(1, max_col - c_idx + 1):
        v = parse_num(sheet.cell(row=r_idx, column=c_idx + offset).value)
        values.append(v)

    nums = [int(v) for v in values if v is not None]
    if not nums:
        return None

    num_set = set(nums)

    # 策略1: 三元组 (X, X//2, X//5)，从大到小取第一个命中
    for a in sorted(num_set, reverse=True):
        if 5 <= a <= 99 and (a // 2) in num_set and (a // 5) in num_set:
            return a

    # 策略2: 二元组 (X, X//2)
    for a in sorted(num_set, reverse=True):
        if 2 <= a <= 99 and (a // 2) in num_set:
            return a

    # 策略3: 只有一个值（未加点技能，如"会计:5"仅初始列有值）
    single = max(nums)
    return single if 0 <= single <= 99 else None

def _find_libreoffice_binary():
    """
    跨平台定位 soffice 可执行文件。
    Windows 下 LibreOffice 安装后默认不加入 PATH，需要枚举常见路径。
    """
    # 1) PATH 上直接找（Linux/Mac，或用户手动配了 PATH 的 Windows）
    for name in ("soffice", "libreoffice", "soffice.exe", "soffice.com"):
        found = shutil.which(name)
        if found:
            return found

    # 2) Windows 常见安装位置
    if os.name == "nt":
        candidates = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
            r"C:\Program Files\LibreOffice\program\soffice.com",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.com",
        ]
        # 加上 LOCALAPPDATA 下的用户级安装
        local = os.environ.get("LOCALAPPDATA")
        if local:
            candidates.append(os.path.join(local, r"Programs\LibreOffice\program\soffice.exe"))
        for p in candidates:
            if os.path.exists(p):
                return p

    # 3) macOS 常见位置
    if os.name == "posix":
        for p in ("/Applications/LibreOffice.app/Contents/MacOS/soffice",):
            if os.path.exists(p):
                return p

    return None

def user_dir(user_key):
    d = os.path.join(CARDS_DIR, user_key)
    os.makedirs(d, exist_ok=True)
    return d
def save_card_meta(user_key, attrs, stats, is_gk):
    """卡片生成后落一份 JSON，供球队渲染复用"""
    card_id = sanitize_filename(attrs["name"])
    stat_keys = ('div','han','kic','ref','spd','pos') if is_gk else ('pac','sho','pas','dri','def','phy')
    meta = {
        "card_id": card_id,
        "name": attrs["name"], "profession": attrs["profession"], "age": attrs["age"],
        "avatar": attrs.get("avatar"),
        "stats": {k: stats[k] for k in stat_keys},
        "ovr": stats["ovr"], "position": stats["position"],
        "tier_name": stats["tier_name"], "is_rare": stats["is_rare"],
        "is_gk": is_gk,
        "utility": stats.get("utility", False),
        "created_at": datetime.datetime.now().isoformat()
    }
    with open(os.path.join(user_dir(user_key), f"{card_id}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    return card_id
def load_cards(user_key):
    d = user_dir(user_key)
    cards = {}
    if not os.path.exists(d): return cards
    for fn in os.listdir(d):
        if fn.endswith(".json"):
            with open(os.path.join(d, fn), "r", encoding="utf-8") as f:
                m = json.load(f); cards[m["card_id"]] = m
    return cards
def load_squad_raw(user_key):
    """返回完整多阵容结构，负责迁移旧格式"""
    p = os.path.join(SQUADS_DIR, f"{user_key}.json")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            sq = json.load(f)
        if "slots" not in sq:
            old_slot = {
                "formation": sq.get("formation","4-3-3"),
                "starters": sq.get("starters",{}),
                "bench": sq.get("bench",[]),
                "style": sq.get("style",""),
            }
            sq = {"active": {"pvp":"default","pve":"default"},
                  "slots": {"default": old_slot}}
        sq.setdefault("active", {"pvp":"default","pve":"default"})
        sq.setdefault("slots", {"default":{"formation":"4-3-3","starters":{},"bench":[],"style":""}})
        return sq
    return {"active":{"pvp":"default","pve":"default"},
            "slots":{"default":{"formation":"4-3-3","starters":{},"bench":[],"style":""}}}
def save_squad_raw(user_key, raw):
    with open(os.path.join(SQUADS_DIR, f"{user_key}.json"), "w", encoding="utf-8") as f:
        json.dump(raw, f, ensure_ascii=False, indent=2)
def load_squad(user_key, context="pvp"):
    """按上下文返回展平结构，跟旧代码 100% 兼容"""
    raw = load_squad_raw(user_key)
    slot_name = raw["active"].get(context, "default")
    if slot_name not in raw["slots"]:
        slot_name = "default"
    slot = raw["slots"][slot_name]
    return {
        "formation": slot.get("formation","4-3-3"),
        "starters": dict(slot.get("starters", {})),
        "bench": list(slot.get("bench", [])),
        "style": slot.get("style",""),
        "_slot_name": slot_name,
        "_context": context,
    }
def save_squad(user_key, squad, context=None):
    """写回对应 slot；context 优先，否则用 squad 自带的"""
    raw = load_squad_raw(user_key)
    ctx = context or squad.get("_context", "pvp")
    slot_name = squad.get("_slot_name") or raw["active"].get(ctx, "default")
    raw["slots"][slot_name] = {
        "formation": squad["formation"],
        "starters": squad["starters"],
        "bench": squad["bench"],
        "style": squad.get("style",""),
    }
    save_squad_raw(user_key, raw)
def find_card(user_key, query):
    cards = load_cards(user_key)
    if query in cards: return cards[query]
    matches = [c for c in cards.values() if query in c["name"]]
    if len(matches) == 1: return matches[0]
    if len(matches) > 1: return {"__ambiguous__": [c["name"] for c in matches]}
    return None

def recalculate_with_libreoffice(file_path):
    """
    openpyxl 无法执行公式，data_only 模式下未被真正打开保存过的 xlsx
    会返回大量 None。用无头 LibreOffice 打开重算再另存，刷新缓存。
    """
    binary = _find_libreoffice_binary()
    if not binary:
        print("[FUT DEBUG] LibreOffice 未找到，跳过公式重算")
        return file_path

    out_dir = tempfile.mkdtemp(prefix="fut_recalc_")
    try:
        # Windows 下用 CREATE_NO_WINDOW 避免弹黑框
        creationflags = 0
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)

        # 为每次调用指定独立的 user profile，避免"另一个 soffice 实例已在运行"错误
        profile_dir = tempfile.mkdtemp(prefix="fut_lo_profile_")
        user_profile = "-env:UserInstallation=file:///" + profile_dir.replace("\\", "/")

        result = subprocess.run(
            [binary, user_profile, "--headless", "--calc",
             "--convert-to", "xlsx", "--outdir", out_dir, file_path],
            capture_output=True, timeout=60, creationflags=creationflags
        )
        base = os.path.splitext(os.path.basename(file_path))[0]
        recalc_path = os.path.join(out_dir, f"{base}.xlsx")
        if os.path.exists(recalc_path):
            print(f"[FUT DEBUG] LibreOffice 已重算 -> {recalc_path}")
            return recalc_path
        err = (result.stderr or b"").decode(errors="ignore")[:300]
        out = (result.stdout or b"").decode(errors="ignore")[:300]
        print(f"[FUT DEBUG] LibreOffice 重算失败\nSTDOUT: {out}\nSTDERR: {err}")
    except subprocess.TimeoutExpired:
        print("[FUT DEBUG] LibreOffice 重算超时")
    except Exception as e:
        print(f"[FUT DEBUG] LibreOffice 重算异常: {e}")
    return file_path

def parse_coc_excel(file_path):
    file_path = recalculate_with_libreoffice(file_path)
    wb = openpyxl.load_workbook(file_path, data_only=True)
    
    target_sheet = None
    for sheet_name in wb.sheetnames:
        if any(kw in sheet_name for kw in ["人物", "角色", "调查员", "核心"]):
            target_sheet = wb[sheet_name]
            break
            
    if not target_sheet:
        for sheet_name in wb.sheetnames:
            sheet = wb[sheet_name]
            found = False
            for row in sheet.iter_rows(min_row=1, max_row=15, values_only=True):
                if any(clean_key(cell) == "力量" for cell in row):
                    target_sheet = sheet
                    found = True
                    break
            if found: break
            
    if not target_sheet: target_sheet = wb.active
    print(f"\n{'='*50}\n[FUT DEBUG] 开始解析角色卡...")
    print(f"[FUT DEBUG] 锁定工作表: {target_sheet.title}")

    attrs = {
        "name": "调查员", "profession": "探索者", "age": "25",
        "bases": {"str": 0, "dex": 0, "pow": 0, "int": 0, "con": 0, "app": 0, "siz": 0, "edu": 0},
        "skills": {}, "avatar": None, "has_portrait": False   # 新增
    }
    try:
        sheets_to_check = [target_sheet, wb.worksheets[0]]
        for sheet in sheets_to_check:
            if hasattr(sheet, '_images') and sheet._images:
                img = sheet._images[0]
                img_data = img._data() if callable(img._data) else img._data
                if img_data:
                    mime = "image/jpeg" if img_data.startswith(b'\xff\xd8') else "image/png"
                    attrs["avatar"] = f"data:{mime};base64,{base64.b64encode(img_data).decode('utf-8')}"
                    attrs["has_portrait"] = True   # 新增
                    print("[FUT DEBUG] 成功提取到立绘图！")
                    break
    except Exception:
        pass

    base_keys = {
        "str": ["力量", "str"],
        "dex": ["敏捷", "dex"],
        "pow": ["意志", "pow"],
        "int": ["智力", "灵感", "int"],
        "con": ["体质", "con"],
        "app": ["外貌", "app"],
        "siz": ["体型", "siz"],
        "edu": ["教育", "知识", "edu"]
    }
    
    max_col = target_sheet.max_column
    found_name, found_prof, found_age = False, False, False

    for r_idx, row in enumerate(target_sheet.iter_rows(values_only=False), 1):
        for c_idx, cell in enumerate(row, 1):
            raw_val = str(cell.value or "").strip()
            if not raw_val: continue
            c_key = clean_key(raw_val)
            if not c_key: continue

            # 【物理分区】：1~10 行提取个人信息和基础属性
            if r_idx <= 10:
                if not found_name and c_key in ["姓名", "角色名", "玩家", "调查员"]:
                    v = get_next_val(target_sheet, r_idx, c_idx, max_col, 4)
                    if v and not isinstance(v, (int, float)): attrs["name"] = str(v).strip(); found_name = True
                elif not found_prof and c_key in ["职业", "本职", "职业名称"]:
                    v = get_next_val(target_sheet, r_idx, c_idx, max_col, 4)
                    if v and not isinstance(v, (int, float)): attrs["profession"] = str(v).strip(); found_prof = True
                elif not found_age and c_key in ["年龄", "age"]:
                    v = get_next_val(target_sheet, r_idx, c_idx, max_col, 4, expect_num=True)
                    if v: attrs["age"] = str(int(v)); found_age = True

                for en_k, kws in base_keys.items():
                    if any(kw in c_key for kw in kws) and len(c_key) <= 10:
                        max_base = get_max_num_for_base(target_sheet, r_idx, c_idx, max_col)
                        if max_base:
                            attrs["bases"][en_k] = max(attrs["bases"][en_k], max_base)

            # 【物理分区】：10 行以后（包括信用评级）提取技能值
            else:
                if 2 <= len(c_key) <= 15:
                    if any(sk in c_key for sk in ALL_RELEVANT_SKILLS):
                        # 归一化：把"闪避dodge / 闪避dodges"这类去掉尾部英文别名
                        norm_key = re.sub(r'[a-z]+$', '', c_key) or c_key
                        skill_total = get_skill_total(target_sheet, r_idx, c_idx, max_col)
                        if skill_total is not None:
                            existing = attrs["skills"].get(norm_key)
                            if existing is None or skill_total > existing:
                                attrs["skills"][norm_key] = skill_total

    wb.close()
    for k, v in attrs["bases"].items():
        if v == 0: attrs["bases"][k] = 50
    attrs["name"] = truncate_name(attrs["name"])   # 新增
    return attrs

def truncate_name(name, max_len=9):
    """长度 > max_len 时在 ·/-/・ 处截断，贪心保留尽量多的段"""
    if not name:
        return name
    name = str(name).strip()
    if len(name) <= max_len:
        return name
    for sep in ("·", "・", "•", "-", "‐", "—"):
        if sep in name:
            parts = [p for p in name.split(sep) if p]
            if not parts:
                continue
            result = parts[0]
            for p in parts[1:]:
                if len(result) + 1 + len(p) <= max_len:
                    result = f"{result}{sep}{p}"
                else:
                    break
            return result
    # 没有分隔符时硬截断
    return name[:max_len - 1] + "…"

def determine_position(pac, sho, pas, dri, def_val, phy, name=""):
    """
    16 个外场位置的加权评分。每套权重之和 = 1.0，输出范围与输入一致，可直接比较。
    L/R 侧位用姓名哈希锁定：同一角色永远出同一侧。
    """
    scores = {
        # 前锋线
        "ST":  sho*0.40 + phy*0.25 + pac*0.20 + dri*0.15,          # 传统中锋，力量+射术
        "CF":  sho*0.30 + dri*0.30 + pas*0.25 + pac*0.15,          # 影锋，技术+串联
        "_W":  pac*0.35 + dri*0.35 + sho*0.15 + pas*0.15,          # 边锋，速度+盘带
        "_F":  dri*0.30 + sho*0.30 + pas*0.20 + pac*0.20,          # 内切前锋
        # 中场线
        "CAM": pas*0.35 + dri*0.30 + sho*0.20 + pac*0.15,          # 前腰
        "CM":  pas*0.30 + dri*0.22 + phy*0.20 + def_val*0.15 + pac*0.13,  # 中前卫
        "CDM": def_val*0.35 + phy*0.30 + pas*0.20 + dri*0.15,      # 后腰
        "_M":  pac*0.30 + dri*0.25 + pas*0.25 + phy*0.20,          # 边前卫
        # 后卫线
        "_WB": pac*0.30 + def_val*0.25 + phy*0.20 + dri*0.15 + pas*0.10,  # 翼卫
        "_B":  def_val*0.35 + pac*0.25 + phy*0.25 + pas*0.15,      # 边后卫
        "CB":  def_val*0.50 + phy*0.35 + sho*0.05 + pas*0.10,      # 中卫
    }
    best = max(scores, key=scores.get)
    # 侧位用姓名哈希决定 L / R，保证同一角色永远同一侧
    if best.startswith("_"):
        side = "L" if (sum(ord(c) for c in name) % 2 == 0) else "R"
        best = side + best[1:]
    return best

# 每个位置对六维的权重（外场用），用于按位置重算 OVR
POSITION_WEIGHTS = {
    "ST":   {"sho":0.40,"phy":0.25,"pac":0.20,"dri":0.15},
    "LS":   {"sho":0.40,"phy":0.25,"pac":0.20,"dri":0.15},
    "RS":   {"sho":0.40,"phy":0.25,"pac":0.20,"dri":0.15},
    "CF":   {"sho":0.30,"dri":0.30,"pas":0.25,"pac":0.15},
    "LF":   {"dri":0.30,"sho":0.30,"pas":0.20,"pac":0.20},
    "RF":   {"dri":0.30,"sho":0.30,"pas":0.20,"pac":0.20},
    "LW":   {"pac":0.35,"dri":0.35,"sho":0.15,"pas":0.15},
    "RW":   {"pac":0.35,"dri":0.35,"sho":0.15,"pas":0.15},
    "CAM":  {"pas":0.35,"dri":0.30,"sho":0.20,"pac":0.15},
    "LAM":  {"pac":0.30,"dri":0.25,"pas":0.25,"phy":0.20},
    "RAM":  {"pac":0.30,"dri":0.25,"pas":0.25,"phy":0.20},
    "CM":   {"pas":0.30,"dri":0.22,"phy":0.20,"def":0.15,"pac":0.13},
    "LCM":  {"pas":0.30,"dri":0.22,"phy":0.20,"def":0.15,"pac":0.13},
    "RCM":  {"pas":0.30,"dri":0.22,"phy":0.20,"def":0.15,"pac":0.13},
    "LM":   {"pac":0.30,"dri":0.25,"pas":0.25,"phy":0.20},
    "RM":   {"pac":0.30,"dri":0.25,"pas":0.25,"phy":0.20},
    "CDM":  {"def":0.35,"phy":0.30,"pas":0.20,"dri":0.15},
    "LCDM": {"def":0.35,"phy":0.30,"pas":0.20,"dri":0.15},
    "RCDM": {"def":0.35,"phy":0.30,"pas":0.20,"dri":0.15},
    "LWB":  {"pac":0.30,"def":0.25,"phy":0.20,"dri":0.15,"pas":0.10},
    "RWB":  {"pac":0.30,"def":0.25,"phy":0.20,"dri":0.15,"pas":0.10},
    "LB":   {"def":0.35,"pac":0.25,"phy":0.25,"pas":0.15},
    "RB":   {"def":0.35,"pac":0.25,"phy":0.25,"pas":0.15},
    "CB":   {"def":0.50,"phy":0.35,"sho":0.05,"pas":0.10},
    "LCB":  {"def":0.50,"phy":0.35,"sho":0.05,"pas":0.10},
    "RCB":  {"def":0.50,"phy":0.35,"sho":0.05,"pas":0.10},
}

# 位置 → 角色分组
POSITION_ROLE = {
    "GK":"gk",
    "CB":"def", "LCB":"def", "RCB":"def",
    "LB":"def", "RB":"def", "LWB":"def", "RWB":"def",
    "CDM":"def_mid", "LCDM":"def_mid", "RCDM":"def_mid",
    "CM":"mid", "LCM":"mid", "RCM":"mid", "LM":"mid", "RM":"mid",
    "CAM":"atk_mid", "LAM":"atk_mid", "RAM":"atk_mid",
    "CF":"fwd", "LF":"fwd", "RF":"fwd",
    "LW":"fwd", "RW":"fwd",
    "ST":"fwd", "LS":"fwd", "RS":"fwd",
}

# 每个维度对不同角色的权重（角色权重越大，该角色球员在该维度的贡献越大）
DIM_ROLE_WEIGHTS = {
    "pac": {"fwd":1.4, "atk_mid":1.2, "mid":1.0, "def_mid":0.8, "def":0.9},
    "sho": {"fwd":1.9, "atk_mid":1.3, "mid":0.6, "def_mid":0.25,"def":0.10},
    "pas": {"fwd":0.6, "atk_mid":1.5, "mid":1.5, "def_mid":1.2, "def":0.7},
    "dri": {"fwd":1.4, "atk_mid":1.5, "mid":1.1, "def_mid":0.7, "def":0.5},
    "def": {"fwd":0.10,"atk_mid":0.25,"mid":0.7, "def_mid":1.6, "def":1.9},
    "phy": {"fwd":0.9, "atk_mid":0.7, "mid":1.0, "def_mid":1.3, "def":1.4},
}

def position_ovr(card, slot):
    """按位置对六维加权后的位置适配评分"""
    # 客串大师：无视位置，直接返回原 OVR
    if card.get("utility", False):
        return card["ovr"]
    stats = card.get("stats", {})
    is_gk_card = card.get("is_gk", False)
    is_gk_slot = (slot == "GK")

    # GK 卡在 GK 位：直接用原 OVR
    if is_gk_slot and is_gk_card:
        return card["ovr"]
    # 外场卡客串门将：def+phy 均值 × 0.82
    if is_gk_slot and not is_gk_card:
        v = (stats.get("def",50) + stats.get("phy",50)) / 2 * 0.82
        return max(30, min(99, int(round(v))))
    # GK 卡踢外场：只有 GK 六维，用 spd/kic/han 均值 × 0.62
    if not is_gk_slot and is_gk_card:
        v = (stats.get("spd",50) + stats.get("kic",50) + stats.get("han",50)) / 3 * 0.62
        return max(30, min(99, int(round(v))))

    # 外场卡踢外场位：按权重加权
    weights = POSITION_WEIGHTS.get(slot)
    if not weights:
        return card["ovr"]
    v = sum(stats.get(k, 50) * w for k, w in weights.items())
    return max(30, min(99, int(round(v))))

def compress_stat(v, pivot=72, k_high=0.95, k_low=0.75, floor=40, ceil=99):
    """
    非对称压缩：
      - 高于 pivot 的值几乎无损（k_high=0.95），保留强项锋芒
      - 低于 pivot 的值适度压缩（k_low=0.75），避免弱项拖垮太多
    效果：480 购点均值仍在 75 附近，但卡与卡的 OVR 差距拉大到 ±6~8。
    """
    delta = v - pivot
    k = k_high if delta > 0 else k_low
    out = pivot + delta * k
    return max(floor, min(ceil, int(round(out))))

def stretch_stat(v, pivot=63, k_high=1.10, k_low=1.55, floor=20, ceil=99):
    """低段激进下探，高段维持不变"""
    delta = v - pivot
    k = k_high if delta > 0 else k_low
    out = pivot + delta * k
    return max(floor, min(ceil, int(round(out))))

def totw_boost(v):
    """TOTW 加成：越低加得越多，最终六维趋于均衡，弱项也不再拉胯"""
    if v >= 90: return min(99, v + 1)
    if v >= 80: return min(99, v + 2)
    if v >= 70: return min(99, v + 3)
    if v >= 60: return min(99, v + 4)
    return min(99, v + 5)

def hero_boost_main(v):
    """PAC/SHO 大幅加成（比 TOTW 猛）"""
    if v >= 90: return min(99, v + 4)
    if v >= 80: return min(99, v + 8)
    if v >= 70: return min(99, v + 12)
    if v >= 60: return min(99, v + 16)
    return min(99, v + 20)

def hero_boost_sub(v):
    """DRI/PAS 小幅加成"""
    if v >= 85: return min(99, v + 1)
    if v >= 70: return min(99, v + 3)
    return min(99, v + 4)

def _roll_special_card():
    """摇一次特殊卡；未命中返回 None"""
    r = random.random()
    cum = 0
    for key, w in SPECIAL_CARD_POOL:
        cum += w
        if r < cum: return key
    return None

def rising_boost(pac, sho, pas, dri, def_v, phy, age):
    """赛季新星：多项中幅加成，年轻额外堆 PHY"""
    pac = min(99, pac + random.randint(5, 8))
    sho = min(99, sho + random.randint(3, 5))
    dri = min(99, dri + random.randint(5, 8))
    pas = min(99, pas + random.randint(3, 5))
    def_v = min(99, def_v + random.randint(2, 4))
    try: young = int(age) < 25
    except: young = False
    if young:
        phy = min(99, phy + random.randint(8, 12))
    else:
        phy = min(99, phy + random.randint(3, 5))
    return pac, sho, pas, dri, def_v, phy

def nova_boost(pac, sho, pas, dri, def_v, phy):
    """超新星：PAS/DEF/PAC 大幅加，PHY 削弱"""
    pas = min(99, pas + random.randint(10, 14))
    def_v = min(99, def_v + random.randint(10, 14))
    pac = min(99, pac + random.randint(8, 12))
    sho = min(99, sho + random.randint(2, 5))
    dri = min(99, dri + random.randint(2, 5))
    phy = max(30, phy - random.randint(3, 5))
    return pac, sho, pas, dri, def_v, phy

def focus_boost(pac, sho, pas, dri, def_v, phy):
    """转会焦点：DRI/PAC 中幅，其他轻微"""
    dri = min(99, dri + random.randint(8, 10))
    pac = min(99, pac + random.randint(8, 10))
    sho = min(99, sho + random.randint(2, 4))
    pas = min(99, pas + random.randint(2, 4))
    def_v = min(99, def_v + random.randint(1, 3))
    phy = min(99, phy + random.randint(1, 3))
    return pac, sho, pas, dri, def_v, phy

def talent_recalc(attrs):
    """怪异天赋：属性权重 1.5x，技能权重 0.4x，本能踢球"""
    bases = attrs["bases"]
    def scale(v):
        if v <= 50: return 22.0 + v * 0.38
        elif v <= 80: return 41.0 + (v - 50) * 0.667
        else: return 61.0 + (v - 80) * 0.28
    # 属性大幅堆，技能忽略
    pac = stretch_stat(min(99, int(scale((bases["dex"]*2+bases["str"])/3) * 1.5)))
    sho = stretch_stat(min(99, int(scale((bases["str"]+bases["dex"])/2) * 1.5)))
    pas = stretch_stat(min(99, int(scale((bases["app"]*2+bases["pow"]+bases["edu"])/4) * 1.35)))
    dri = stretch_stat(min(99, int(scale((bases["dex"]*2+bases["int"])/3) * 1.5)))
    def_v = stretch_stat(min(99, int(scale((bases["pow"]+bases["edu"]+bases["con"])/3) * 1.45)))
    phy = stretch_stat(min(99, int(scale((bases["str"]*2+bases["con"]*2+bases["siz"])/5) * 1.55)))
    return pac, sho, pas, dri, def_v, phy

def gk_rising_boost(div, han, kic, ref, spd, pos, age):
    div = min(99, div + random.randint(5, 8))
    han = min(99, han + random.randint(3, 5))
    ref = min(99, ref + random.randint(5, 8))
    pos = min(99, pos + random.randint(2, 4))
    try: young = int(age) < 25
    except: young = False
    if young:
        spd = min(99, spd + random.randint(8, 12))
    else:
        spd = min(99, spd + random.randint(3, 5))
    kic = min(99, kic + random.randint(3, 5))
    return div, han, kic, ref, spd, pos

def gk_nova_boost(div, han, kic, ref, spd, pos):
    pos = min(99, pos + random.randint(10, 14))
    han = min(99, han + random.randint(10, 14))
    ref = min(99, ref + random.randint(8, 12))
    div = min(99, div + random.randint(3, 5))
    kic = min(99, kic + random.randint(2, 4))
    spd = max(30, spd - random.randint(3, 5))
    return div, han, kic, ref, spd, pos

def gk_focus_boost(div, han, kic, ref, spd, pos):
    ref = min(99, ref + random.randint(8, 10))
    div = min(99, div + random.randint(8, 10))
    han = min(99, han + random.randint(2, 4))
    kic = min(99, kic + random.randint(2, 4))
    spd = min(99, spd + random.randint(1, 3))
    pos = min(99, pos + random.randint(1, 3))
    return div, han, kic, ref, spd, pos

def gk_talent_recalc(attrs):
    bases = attrs["bases"]
    def scale(v):
        if v <= 50: return 22.0 + v * 0.38
        elif v <= 80: return 41.0 + (v - 50) * 0.667
        else: return 61.0 + (v - 80) * 0.28
    div = stretch_stat(min(99, int(scale((bases["dex"]*2+bases["con"])/3) * 1.5)))
    han = stretch_stat(min(99, int(scale((bases["dex"]+bases["str"])/2) * 1.5)))
    kic = stretch_stat(min(99, int(scale((bases["str"]*2+bases["pow"])/3) * 1.55)))
    ref = stretch_stat(min(99, int(scale((bases["dex"]*2+bases["pow"])/3) * 1.5)))
    spd = stretch_stat(min(99, int(scale((bases["dex"]*2+bases["str"])/3) * 1.5)))
    pos = stretch_stat(min(99, int(scale((bases["int"]+bases["edu"]+bases["pow"])/3) * 1.3)))
    return div, han, kic, ref, spd, pos

TIER_ORDER = ["Bronze", "Silver", "Gold", "Gold Rare",
              "TOTW", "RISING", "NOVA", "FOCUS", "TALENT", "UTIL", "HERO", "Icon"]
# 特殊闪卡池：合计 10%
SPECIAL_CARD_POOL = [
    ("TOTW",   0.025),  # 蓝卡 高频
    ("HERO",   0.020),  # 火卡 高频
    ("UTIL",   0.020),  # 红白 高频
    ("TALENT", 0.015),  # 墨绿 高频
    ("RISING", 0.007),  # 天蓝 低频
    ("NOVA",   0.007),  # 黑橙 低频
    ("FOCUS",  0.006),  # 紫罗兰 低频
]
GOLD_MAX_OVR = 99  # Gold 上限，按你现有阈值改
def clamp_tier_without_portrait(ovr, tier, has_portrait):
    if has_portrait:
        return ovr, tier
    # 无立绘：tier 不得高于 Gold，OVR 也顶到 Gold 上限
    if TIER_ORDER.index(tier) > TIER_ORDER.index("Gold"):
        tier = "Gold"
        ovr = min(ovr, GOLD_MAX_OVR)
    return ovr, tier

def sanitize_filename(name):
    """替换 Windows/POSIX 都不安全的文件名字符"""
    return re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(name)).strip().rstrip('.')

def calculate_fut(attrs):
    bases = attrs["bases"]
    skills = attrs["skills"]
    has_portrait = attrs.get("has_portrait", False)   # 新增

    def scale_base(val):
        """
        分段线性 + 整体上抬 9 分，让 480 购点均值锁在 75。
        - val ≤ 50:      22 + val*0.40        (0→22, 50→42)
        - 50 < val ≤ 80: 42 + (val-50)*0.667  (50→42, 80→62)  ← 车卡热区
        - val > 80:      62 + (val-80)*0.25   (80→62, 100→67)
        """
        if val <= 50:
            return 22.0 + val * 0.38
        elif val <= 80:
            return 41.0 + (val - 50) * 0.667
        else:
            return 61.0 + (val - 80) * 0.28

    def get_skill_bonus(category):
        invested = []
        for s_key, s_val in skills.items():
            for mapped_skill in SKILL_MAP[category]:
                if mapped_skill in s_key:
                    inv = get_skill_investment(s_key, s_val, bases)
                    if inv > 0:
                        invested.append(inv)
                    break
        if not invested:
            return 0.0
        max_v = max(invested)
        rest = sum(invested) - max_v
        # 上限 24，主项线性 + 副项开方
        return min(36.0, max_v * 0.32 + math.sqrt(max(0, rest)) * 1.3)

    pac_raw = min(99, int(scale_base((bases["dex"] * 2 + bases["str"]) / 3) + get_skill_bonus("PAC")))
    sho_raw = min(99, int(scale_base((bases["str"] + bases["dex"]) / 2) + get_skill_bonus("SHO")))
    pas_raw = min(99, int(scale_base((bases["app"] * 2 + bases["pow"] + bases["edu"]) / 4) + get_skill_bonus("PAS")))
    dri_raw = min(99, int(scale_base((bases["dex"] * 2 + bases["int"]) / 3) + get_skill_bonus("DRI")))
    def_val_raw = min(99, int(scale_base((bases["pow"] + bases["edu"] + bases["con"]) / 3) + get_skill_bonus("DEF")))
    phy_raw = min(99, int(scale_base((bases["str"] * 2 + bases["con"] * 2 + bases["siz"]) / 5) + get_skill_bonus("PHY")))

    pac = stretch_stat(pac_raw)
    sho = stretch_stat(sho_raw)
    pas = stretch_stat(pas_raw)
    dri = stretch_stat(dri_raw)
    def_val = stretch_stat(def_val_raw)
    phy = stretch_stat(phy_raw)

    stats_list = [pac, sho, pas, dri, def_val, phy]
    stats_list.sort()
    
    avg_all = sum(stats_list) / 6.0
    avg_top3 = sum(stats_list[-3:]) / 3.0
    ovr = math.floor((avg_all * 0.35) + (avg_top3 * 0.65))

    pos = determine_position(pac, sho, pas, dri, def_val, phy, attrs.get("name", ""))

    tier = "Bronze"
    if ovr >= 85: tier = "Icon"
    elif ovr >= 75: tier = "Gold"
    elif ovr >= 65: tier = "Silver"

    # 【先做立绘门控，再判断 rare、再拼 final_tier】
    if not has_portrait and TIER_ORDER.index(tier) > TIER_ORDER.index("Gold"):
        tier = "Gold"
        ovr = min(ovr, GOLD_MAX_OVR)
    is_rare = False
    if stats_list[-1] >= 85: is_rare = True
    else:
        for s_key, s_val in skills.items():
            if "信用" in s_key and s_val >= 80: is_rare = True
            if "克苏鲁" in s_key and s_val >= 10: is_rare = True
    if tier == "Icon" and ovr >= 89: is_rare = True
    final_tier = f"{tier} Rare" if is_rare else tier
    # --- 特殊闪卡触发（金卡区间 + 有立绘）---
    utility = False   # UTIL 卡标记
    if 75 <= ovr <= 84 and has_portrait:
        special = _roll_special_card()
        if special == "TOTW":
            pac, sho, pas = totw_boost(pac), totw_boost(sho), totw_boost(pas)
            dri, def_val, phy = totw_boost(dri), totw_boost(def_val), totw_boost(phy)
            final_tier = "TOTW"; is_rare = True
            print(f"[FUT DEBUG] 🎉 TOTW 蓝卡触发!")
        elif special == "HERO":
            pac = hero_boost_main(pac); sho = hero_boost_main(sho)
            dri = hero_boost_sub(dri); pas = hero_boost_sub(pas)
            final_tier = "HERO"; is_rare = True
            fwd_positions = ("ST","CF","LW","RW","LF","RF","LS","RS")
            if pos not in fwd_positions:
                new_pos = determine_position(pac, sho, pas, dri, def_val, phy,
                                              attrs.get("name",""))
                pos = new_pos if new_pos in fwd_positions else "ST"
            print(f"[FUT DEBUG] 🔥 HERO 火卡触发!")
        elif special == "RISING":
            pac,sho,pas,dri,def_val,phy = rising_boost(
                pac,sho,pas,dri,def_val,phy, attrs.get("age","25"))
            final_tier = "RISING"; is_rare = True
            print(f"[FUT DEBUG] 🌠 赛季新星触发!")
        elif special == "NOVA":
            pac,sho,pas,dri,def_val,phy = nova_boost(pac,sho,pas,dri,def_val,phy)
            final_tier = "NOVA"; is_rare = True
            print(f"[FUT DEBUG] 💥 超新星触发!")
        elif special == "FOCUS":
            pac,sho,pas,dri,def_val,phy = focus_boost(pac,sho,pas,dri,def_val,phy)
            final_tier = "FOCUS"; is_rare = True
            print(f"[FUT DEBUG] 💜 转会焦点触发!")
        elif special == "TALENT":
            pac,sho,pas,dri,def_val,phy = talent_recalc(attrs)
            final_tier = "TALENT"; is_rare = True
            print(f"[FUT DEBUG] 🌿 怪异天赋触发!")
        elif special == "UTIL":
            # UTIL 不改属性，只标记
            final_tier = "UTIL"; is_rare = True; utility = True
            print(f"[FUT DEBUG] 🎭 客串大师触发!")
        # 重算 OVR
        if special:
            stats_list = sorted([pac, sho, pas, dri, def_val, phy])
            avg_all = sum(stats_list) / 6.0
            avg_top3 = sum(stats_list[-3:]) / 3.0
            ovr = math.floor((avg_all * 0.35) + (avg_top3 * 0.65))
    print(f"[FUT DEBUG] 战力核算: PAC:{pac} SHO:{sho} PAS:{pas} DRI:{dri} DEF:{def_val} PHY:{phy}")
    print(f"[FUT DEBUG] 综合评估 OVR: {ovr} | Tier: {final_tier} | Portrait: {has_portrait}")
    print(f"{'='*50}\n")
    return {
        "pac": pac, "sho": sho, "pas": pas, "dri": dri, "def": def_val, "phy": phy,
        "ovr": ovr, "position": pos, "tier_name": final_tier, "is_rare": is_rare,
        "utility": utility,
    }


def calculate_gk(attrs):
    bases = attrs["bases"]
    skills = attrs["skills"]
    has_portrait = attrs.get("has_portrait", False)
    def scale_base(val):
        if val <= 50: return 22.0 + val * 0.38
        elif val <= 80: return 41.0 + (val - 50) * 0.667
        else: return 61.0 + (val - 80) * 0.28
    def get_gk_bonus(category):
        invested = []
        for s_key, s_val in skills.items():
            for mapped in GK_SKILL_MAP[category]:
                if mapped in s_key:
                    inv = get_skill_investment(s_key, s_val, bases)
                    if inv > 0: invested.append(inv)
                    break
        if not invested: return 0.0
        max_v = max(invested)
        rest = sum(invested) - max_v
        return min(36.0, max_v * 0.32 + math.sqrt(max(0, rest)) * 1.3)
    # 属性配比参考真实 GK：DEX/POW 主导反应类，STR/CON 主导手型/开球
    div_raw = min(99, int(scale_base((bases["dex"] * 2 + bases["con"]) / 3)     + get_gk_bonus("DIV")))
    han_raw = min(99, int(scale_base((bases["dex"] + bases["str"]) / 2)         + get_gk_bonus("HAN")))
    kic_raw = min(99, int(scale_base((bases["str"] * 2 + bases["pow"]) / 3)     + get_gk_bonus("KIC")))
    ref_raw = min(99, int(scale_base((bases["dex"] * 2 + bases["pow"]) / 3)     + get_gk_bonus("REF")))
    spd_raw = min(99, int(scale_base((bases["dex"] * 2 + bases["str"]) / 3)     + get_gk_bonus("SPD")))
    pos_raw = min(99, int(scale_base((bases["int"] + bases["edu"] + bases["pow"]) / 3) + get_gk_bonus("POS")))
    div = stretch_stat(div_raw); han = stretch_stat(han_raw); kic = stretch_stat(kic_raw)
    ref = stretch_stat(ref_raw); spd = stretch_stat(spd_raw); pos_v = stretch_stat(pos_raw)
    stats_list = sorted([div, han, kic, ref, spd, pos_v])
    avg_all = sum(stats_list) / 6.0
    avg_top3 = sum(stats_list[-3:]) / 3.0
    # GK OVR：整体权重稍高，因为守门员讲究均衡不能有短板
    ovr = math.floor((avg_all * 0.45) + (avg_top3 * 0.55))
    tier = "Bronze"
    if ovr >= 85: tier = "Icon"
    elif ovr >= 75: tier = "Gold"
    elif ovr >= 65: tier = "Silver"
    if not has_portrait and TIER_ORDER.index(tier) > TIER_ORDER.index("Gold"):
        tier = "Gold"; ovr = min(ovr, GOLD_MAX_OVR)
    is_rare = False
    if stats_list[-1] >= 85: is_rare = True
    for s_key, s_val in skills.items():
        if "信用" in s_key and s_val >= 80: is_rare = True
        if "克苏鲁" in s_key and s_val >= 10: is_rare = True
    if tier == "Icon" and ovr >= 89: is_rare = True
    final_tier = f"{tier} Rare" if is_rare else tier
    # 特殊闪卡触发（GK）
    utility = False
    if 75 <= ovr <= 84 and has_portrait:
        special = _roll_special_card()
        if special == "TOTW":
            div, han, kic = totw_boost(div), totw_boost(han), totw_boost(kic)
            ref, spd, pos_v = totw_boost(ref), totw_boost(spd), totw_boost(pos_v)
            final_tier = "TOTW"; is_rare = True
        elif special == "HERO":
            # 火卡没有GK的位置，这里换成TOTW
            div, han, kic = totw_boost(div), totw_boost(han), totw_boost(kic)
            ref, spd, pos_v = totw_boost(ref), totw_boost(spd), totw_boost(pos_v)
            final_tier = "TOTW"; is_rare = True
        elif special == "RISING":
            div,han,kic,ref,spd,pos_v = gk_rising_boost(
                div,han,kic,ref,spd,pos_v, attrs.get("age","25"))
            final_tier = "RISING"; is_rare = True
        elif special == "NOVA":
            div,han,kic,ref,spd,pos_v = gk_nova_boost(div,han,kic,ref,spd,pos_v)
            final_tier = "NOVA"; is_rare = True
        elif special == "FOCUS":
            div,han,kic,ref,spd,pos_v = gk_focus_boost(div,han,kic,ref,spd,pos_v)
            final_tier = "FOCUS"; is_rare = True
        elif special == "TALENT":
            div,han,kic,ref,spd,pos_v = gk_talent_recalc(attrs)
            final_tier = "TALENT"; is_rare = True
        elif special == "UTIL":
            final_tier = "UTIL"; is_rare = True; utility = True
        if special:
            stats_list = sorted([div, han, kic, ref, spd, pos_v])
            avg_all = sum(stats_list) / 6.0
            avg_top3 = sum(stats_list[-3:]) / 3.0
            ovr = math.floor((avg_all * 0.45) + (avg_top3 * 0.55))
            print(f"[FUT DEBUG] 🎉 GK {special} 触发!")
    return {
        "div": div, "han": han, "kic": kic, "ref": ref, "spd": spd, "pos": pos_v,
        "ovr": ovr, "position": "GK", "tier_name": final_tier, "is_rare": is_rare,
        "utility": utility,
    }

def build_side(user_key):
    squad = load_squad(user_key)
    cards = load_cards(user_key)
    starters = {}
    for slot, cid in squad["starters"].items():
        if cid in cards: starters[slot] = cards[cid]
    bench = [cards[c] for c in squad["bench"] if c in cards]
    form = {c["card_id"]: random.randint(-5, 8) for c in list(starters.values())+bench}
    stamina = {c["card_id"]: 100 for c in list(starters.values())+bench}

    # 计算球队 OVR 用于 underdog 判定
    ovrs = [c["ovr"] for c in starters.values()] or [70]
    team_ovr = sum(ovrs) / len(ovrs)

    return {
        "user_key": user_key, "formation": squad["formation"],
        "starters": {s: c["card_id"] for s, c in starters.items()},
        "bench": [c["card_id"] for c in bench],
        "cards_snapshot": {c["card_id"]: c for c in list(starters.values())+bench},
        "stamina": stamina, "form": form,
        "goals": 0, "shots": 0, "subs_left": 5, "pending_tactic": None,
        "style": squad.get("style",""),
        "team_ovr": team_ovr,
        "red_cards": 0,
        "yellow_cards": {},
        "morale_boost": 1.0,
        "player_stats": {cid: default_pstat() for cid in {c["card_id"] for c in list(starters.values())+bench}},
        "sent_off": [],           # ← 新增：所有被罚下的 cid，用于评分
        "all_participants": [c["card_id"] for c in starters.values()],  # ← 首发登记
    }

def build_side_from_slot(user_key, context="pvp"):
    """按 slot 上下文构建 side（用于 PvE）"""
    squad = load_squad(user_key, context=context)
    cards = load_cards(user_key)
    starters = {}
    for slot, cid in squad["starters"].items():
        if cid in cards: starters[slot] = cards[cid]
    bench = [cards[c] for c in squad["bench"] if c in cards]
    form = {c["card_id"]: random.randint(-5, 8) for c in list(starters.values())+bench}
    stamina = {c["card_id"]: 100 for c in list(starters.values())+bench}
    ovrs = [c["ovr"] for c in starters.values()] or [70]
    team_ovr = sum(ovrs) / len(ovrs)
    return {
        "user_key": user_key, "formation": squad["formation"],
        "starters": {s: c["card_id"] for s, c in starters.items()},
        "bench": [c["card_id"] for c in bench],
        "cards_snapshot": {c["card_id"]: c for c in list(starters.values())+bench},
        "stamina": stamina, "form": form,
        "goals": 0, "shots": 0, "subs_left": 5, "pending_tactic": None,
        "style": squad.get("style",""),
        "team_ovr": team_ovr,
        "red_cards": 0, "yellow_cards": {}, "morale_boost": 1.0,
        "player_stats": {cid: default_pstat() for cid in {c["card_id"] for c in list(starters.values())+bench}},
        "sent_off": [],
        "all_participants": [c["card_id"] for c in starters.values()],
    }

def effective_stats(side, tactic):
    cards = side["cards_snapshot"]
    dims = ["pac","sho","pas","dri","def","phy"]
    weighted = {d:0.0 for d in dims}
    total_w = {d:0.0 for d in dims}

    for slot, cid in side["starters"].items():
        c = cards.get(cid)
        if not c or c.get("is_gk"): continue
        role = POSITION_ROLE.get(slot, "mid")
        if role == "gk": continue
        stam = side["stamina"].get(cid, 100)
        form = side["form"].get(cid, 0)
        factor = stamina_factor(stam)
        for d in dims:
            base = c["stats"].get(d, c["stats"].get("div", 60))
            w = DIM_ROLE_WEIGHTS[d].get(role, 1.0)
            weighted[d] += (base + form) * factor * w
            total_w[d] += w

    avg = {d: (weighted[d]/total_w[d] if total_w[d]>0 else 60) for d in dims}

    # 战术
    mod = TACTIC_MODIFIERS[tactic]
    for d in dims:
        avg[d] *= mod.get(d.upper(), 1.0)

    # 风格 + 阵型契合
    style = side.get("style", "")
    if style in TEAM_STYLES:
        smod = TEAM_STYLES[style]["modifiers"]
        fit = 1.05 if side["formation"] in TEAM_STYLES[style]["formations"] else 0.94
        for d in dims:
            avg[d] *= smod.get(d.upper(), 1.0) * fit

    # 【新增】人数劣势：每少 1 人攻击 -9%，防守 -7%
    starter_count = len([1 for slot in side["starters"] if POSITION_ROLE.get(slot) != "gk"])
    missing = max(0, 10 - starter_count)   # 外场应有 10 人（+1 GK）
    if missing > 0:
        atk_pen = max(0.55, 1 - missing * 0.09)
        def_pen = max(0.55, 1 - missing * 0.07)
        for d in ("sho","pas","dri","pac"):
            avg[d] *= atk_pen
        for d in ("def","phy"):
            avg[d] *= def_pen
    
    # 【新增】事件属性乘数
    mult = side.get("stat_mult", 1.0)
    if mult != 1.0:
        for d in dims:
            avg[d] *= mult

    # 主客场氛围与本回合场边指令。
    venue_mult = side.get("venue_mult", 1.0)
    round_cmd = side.get("round_command") or {}
    morale_mult = round_cmd.get("morale", 1.0)
    focus = round_cmd.get("focus", {})
    for d in dims:
        avg[d] *= venue_mult * morale_mult * focus.get(d, 1.0)
    return avg

def prepare_venue_atmosphere(home, away, home_form=0.0, away_form=0.0,
                             home_press=0.0, away_press=0.0):
    # 近期表现和发布会余波会移动抽签结果：状态越好越容易得到正面氛围。
    home_roll = random.random() - max(-0.22, min(0.22, home_form*0.045 + home_press))
    if home_roll < 0.20:
        home_mult, home_text = 1.09, "🏟️ 主场山呼海啸，主队全属性 +9%"
    elif home_roll < 0.75:
        home_mult, home_text = 1.05, "🏟️ 主场助威不断，主队全属性 +5%"
    else:
        home_mult, home_text = 1.02, "🏟️ 主场气氛平稳，主队全属性 +2%"

    away_roll = random.random() + max(-0.20, min(0.20, -away_form*0.04 - away_press))
    if away_roll < 0.20:
        away_mult, away_text = 0.91, "📣 客队遭遇震耳嘘声，全属性 -9%"
    elif away_roll < 0.68:
        away_mult, away_text = 0.96, "📣 客场嘘声干扰，客队全属性 -4%"
    else:
        away_mult, away_text = 1.00, "🧘 客队顶住压力，未受嘘声影响"
    home["venue_mult"] = home_mult
    away["venue_mult"] = away_mult
    home["venue_text"] = home_text
    away["venue_text"] = away_text
    return f"{home_text}\n{away_text}"

def simulate_round(home, away, ht, at, round_no):
    h_command = (home.get("round_command") or {}).get("text")
    a_command = (away.get("round_command") or {}).get("text")
    hs, as_ = effective_stats(home, ht), effective_stats(away, at)
    h_atk = hs["sho"]*0.40 + hs["pac"]*0.20 + hs["dri"]*0.20 + hs["pas"]*0.20
    h_def = hs["def"]*0.60 + hs["phy"]*0.40
    a_atk = as_["sho"]*0.40 + as_["pac"]*0.20 + as_["dri"]*0.20 + as_["pas"]*0.20
    a_def = as_["def"]*0.60 + as_["phy"]*0.40

    h_atk *= 1 + COUNTER.get((ht, at), 0)
    a_atk *= 1 + COUNTER.get((at, ht), 0)

    hs_style = home.get("style",""); as_style = away.get("style","")
    if hs_style in TEAM_STYLES:
        h_atk *= 1 + TEAM_STYLES[hs_style]["counter_vs"].get(as_style, 0)
    if as_style in TEAM_STYLES:
        a_atk *= 1 + TEAM_STYLES[as_style]["counter_vs"].get(hs_style, 0)

    h_ovr, a_ovr = home.get("team_ovr", 75), away.get("team_ovr", 75)
    if h_ovr < a_ovr and hs_style in TEAM_STYLES:
        gap = min(a_ovr - h_ovr, 15) / 15.0
        h_atk *= 1 + gap * TEAM_STYLES[hs_style]["underdog_bonus"]
    if a_ovr < h_ovr and as_style in TEAM_STYLES:
        gap = min(h_ovr - a_ovr, 15) / 15.0
        a_atk *= 1 + gap * TEAM_STYLES[as_style]["underdog_bonus"]

    # 消费上一回合的士气加成
    if home.get("morale_boost", 1.0) > 1.0:
        h_atk *= home["morale_boost"]; home["morale_boost"] = 1.0
    if away.get("morale_boost", 1.0) > 1.0:
        a_atk *= away["morale_boost"]; away["morale_boost"] = 1.0

    h_pos = hs["pas"] + hs["dri"]; a_pos = as_["pas"] + as_["dri"]
    possession = h_pos / (h_pos + a_pos) if (h_pos+a_pos) > 0 else 0.5

    hgk = gk_effective(home, ht); agk = gk_effective(away, at)
    # 【新的射门产出：曲线压缩 + 上限 5】
    def diminish(diff):
        """差距在 20 以上呈饱和"""
        if diff > 20: return 20 + (diff - 20) * 0.5
        if diff < -10: return -10 + (diff + 10) * 0.35
        return diff
    h_pos_factor = 0.55 + possession * 0.9
    a_pos_factor = 0.55 + (1-possession) * 0.9
    h_shot_mean = (0.9 + diminish(h_atk - a_def * 0.90) / 18) * h_pos_factor
    a_shot_mean = (0.9 + diminish(a_atk - h_def * 0.90) / 18) * a_pos_factor
    h_shots = max(0, min(5, int(round(random.gauss(h_shot_mean, 0.7)))))
    a_shots = max(0, min(5, int(round(random.gauss(a_shot_mean, 0.7)))))
    # 【新的射门结果：goal / save / miss 三分裂，GK 参与每球】
    def resolve_shots(shots, atk, gk):
        goals, saves, misses = 0, 0, 0
        for _ in range(shots):
            conv = max(0.05, min(0.28, 0.17 + (atk - gk) / 320))
            save_r = max(0.22, min(0.55, 0.36 + (gk - atk) / 320))
            r = random.random()
            if r < conv:
                goals += 1
            elif r < conv + save_r:
                saves += 1
            else:
                misses += 1
        return goals, saves, misses
    h_goals, h_saves_by_away, h_misses = resolve_shots(h_shots, h_atk, agk)
    a_goals, a_saves_by_home, a_misses = resolve_shots(a_shots, a_atk, hgk)

        # === 归属进球 & 助攻 ===
    def attribute_goals(side, goals):
        events = []
        penal = {}
        for _ in range(goals):
            cid, name = pick_weighted(side, "sho", prefer_role="fwd", penalize=penal)
            if cid:
                ensure_pstat(side, cid)["goals"] += 1
                ensure_pstat(side, cid)["shots"] += 1
                penal[cid] = penal.get(cid, 1.0) * 0.35
            assist = None
            assist_cid = None
            if cid and random.random() < 0.7:
                a_cid, a_name = pick_weighted(
                    side, "pas",
                    prefer_role=random.choice(["atk_mid","mid"]),
                    penalize={cid: 0.0}
                )
                if a_cid:
                    ensure_pstat(side, a_cid)["assists"] += 1
                    assist = a_name
                    assist_cid = a_cid
            events.append({"scorer": name, "assist": assist, "cid": cid, "assist_cid": assist_cid})
        return events, penal

    home_goals_ev, penal_h = attribute_goals(home, h_goals)
    away_goals_ev, penal_a = attribute_goals(away, a_goals)

    

    # === 未进球射门 ===
    def attribute_misses(side, misses, penal):
        events = []
        for _ in range(misses):
            cid, name = pick_weighted(side, "sho", prefer_role="fwd", penalize=penal)
            if cid: ensure_pstat(side, cid)["shots"] += 1
            events.append({"shooter": name, "cid": cid})
        return events

    home_miss_ev = attribute_misses(home, max(0, h_shots - h_goals), penal_h)
    away_miss_ev = attribute_misses(away, max(0, a_shots - a_goals), penal_a)

    # 门将扑救归属
    if h_saves_by_away > 0:
        gk_cid = away["starters"].get("GK")
        if gk_cid: ensure_pstat(away, gk_cid)["saves"] += h_saves_by_away
    if a_saves_by_home > 0:
        gk_cid = home["starters"].get("GK")
        if gk_cid: ensure_pstat(home, gk_cid)["saves"] += a_saves_by_home

    # === 失球计入门将 ===
    h_gk = home["starters"].get("GK")
    a_gk = away["starters"].get("GK")
    if h_gk: ensure_pstat(home, h_gk)["conceded"] += a_goals
    if a_gk: ensure_pstat(away, a_gk)["conceded"] += h_goals

    # 收集本回合活跃球员（进球、助攻、射门、扑救）
    active_home = set()
    active_away = set()
    for ge in home_goals_ev:
        if ge.get("cid"): active_home.add(ge["cid"])
        if ge.get("assist_cid"): active_home.add(ge["assist_cid"])   # ← 新增
    for ge in away_goals_ev:
        if ge.get("cid"): active_away.add(ge["cid"])
        if ge.get("assist_cid"): active_away.add(ge["assist_cid"])   # ← 新增
    for ev in home_miss_ev:
        if ev.get("cid"): active_home.add(ev["cid"])
    for ev in away_miss_ev:
        if ev.get("cid"): active_away.add(ev["cid"])
    # 门将参与扑救就算活跃
    if a_saves_by_home > 0:
        gk_cid = home["starters"].get("GK")
        if gk_cid: active_home.add(gk_cid)
    if h_saves_by_away > 0:
        gk_cid = away["starters"].get("GK")
        if gk_cid: active_away.add(gk_cid)
    apply_stamina(home, ht, round_no, active_home)
    apply_stamina(away, at, round_no, active_away)
    auto_subs = auto_sub_if_needed(home) + auto_sub_if_needed(away)

    # 中场事件
    home_mid_evs = midfield_events(home, away, possession, True)
    away_mid_evs = midfield_events(away, home, 1-possession, True)

    # === 突发事件（红牌罚下会立即从 starters 移除，下回合自然减员）===
    home_events = check_events(home, ht, away)
    away_events = check_events(away, at, home)

    # 事件直接改比分
    for e in home_events:
        if e.get("gift"): a_goals += e["gift"]
        if e.get("score"): h_goals += e["score"]; h_shots += 1
    for e in away_events:
        if e.get("gift"): h_goals += e["gift"]
        if e.get("score"): a_goals += e["score"]; a_shots += 1

    result = {
        "round": round_no, "home_goals": h_goals, "away_goals": a_goals,
        "home_shots": h_shots, "away_shots": a_shots,
        "possession": possession, "auto_subs": auto_subs,
        "h_atk": h_atk, "a_atk": a_atk, "h_def": h_def, "a_def": a_def,
        "h_tactic": ht, "a_tactic": at,
        "h_style": hs_style, "a_style": as_style,
        "home_mid_evs": home_mid_evs, "away_mid_evs": away_mid_evs,
        "home_events": home_events, "away_events": away_events,
        "h_red": home.get("red_cards", 0), "a_red": away.get("red_cards", 0),
        "home_goals_ev": home_goals_ev, "away_goals_ev": away_goals_ev,
        "home_miss_ev": home_miss_ev, "away_miss_ev": away_miss_ev,
        "h_saves": a_saves_by_home,  # 主队门将本回合扑救数
        "a_saves": h_saves_by_away,
        "h_command": h_command, "a_command": a_command,
    }
    home["round_command"] = None
    away["round_command"] = None
    return result

def gk_effective(side, tactic):
    """守门员单独算，只受体能/状态影响"""
    cards = side["cards_snapshot"]
    gk_id = side["starters"].get("GK")
    if not gk_id or gk_id not in cards: return 55  # 无 GK 惩罚
    c = cards[gk_id]
    stam = side["stamina"].get(gk_id, 100)
    form = side["form"].get(gk_id, 0)
    if c.get("is_gk"):
        s = c["stats"]
        base = (s["div"]+s["han"]+s["ref"]+s["pos"])/4 * 1.0 + (s["kic"]+s["spd"])/2 * 0.2
    else:
        base = (c["stats"].get("def", 60) + c["stats"].get("phy", 60))/2 * 0.75  # 外场客串门将
    round_cmd = side.get("round_command") or {}
    focus = round_cmd.get("focus", {})
    return ((base + form) * stamina_factor(stam) * side.get("venue_mult", 1.0) *
            round_cmd.get("morale", 1.0) * focus.get("def", 1.0))

STYLE_STAMINA_CURVE = {
    "high_press":     {"early": +4, "late": +2},   # 早期爆发消耗，后期已经喘不过
    "counter_attack": {"early": -2, "late":  0},   # 蹲坑省力，后半也不激烈
    "park_bus":       {"early": -3, "late": -1},   # 全程省力
    "possession":     {"early": +1, "late": +1},   # 稳定中等消耗
    "long_ball":      {"early":  0, "late": +1},
    "wing_play":      {"early": +2, "late": +1},   # 边路跑动多
    "central":        {"early": +1, "late": +1},
}

ROLE_STAMINA_MULT = {
    "gk": 0.28,          # 门将只有约 1/3 消耗
    "def": 0.85, "def_mid": 0.95,
    "mid": 1.05,
    "atk_mid": 1.15, "fwd": 1.20,
}

def phy_stamina_mult(phy):
    """PHY 越高消耗越少。基线 75，PHY 60→+12%，PHY 90→-12%，最多 ±25%"""
    return max(0.75, min(1.25, 1.0 - (phy - 75) * 0.008))

def apply_stamina(side, tactic, round_no=1, active_cids=None):
    lo, hi = TACTIC_MODIFIERS[tactic]["cost"]
    style = side.get("style", "")
    curve = STYLE_STAMINA_CURVE.get(style, {"early": 0, "late": 0})
    half_extra = curve["early"] if round_no <= 3 else curve["late"]
    fatigue_mult = 1.0 if round_no <= 3 else 1.08 + (round_no - 4) * 0.05
    active_cids = active_cids or set()
    cards = side["cards_snapshot"]

    # 【新增】中场休息：进入第 4 回合前恢复体力，PHY 高的恢复更多
    if round_no == 4 and not side.get("halftime_done"):
        recovered = []
        for slot, cid in side["starters"].items():
            c = cards.get(cid)
            base = random.randint(12, 18)
            if c and c.get("is_gk"):
                base += 3
            elif c:
                phy = c["stats"].get("phy", 60)
                base += int((phy - 60) * 0.15)   # PHY 90 多恢复 4，PHY 40 少 3
            base = max(6, base)
            side["stamina"][cid] = min(100, side["stamina"].get(cid, 100) + base)
            recovered.append(base)
        for cid in side["bench"]:
            side["stamina"][cid] = min(100, side["stamina"].get(cid, 100) + 8)
        side["halftime_done"] = True
        side["halftime_recover_avg"] = sum(recovered) // max(1, len(recovered))

    for slot, cid in list(side["starters"].items()):
        role = POSITION_ROLE.get(slot, "mid")
        role_mult = ROLE_STAMINA_MULT.get(role, 1.0)
        c = cards.get(cid)

        # 【新增】PHY 系数：外场用 PHY，门将用 kic/han 均值折算
        if c and c.get("is_gk"):
            gk_phy = (c["stats"].get("kic", 60) + c["stats"].get("han", 60)) / 2
            phy_mult = phy_stamina_mult(gk_phy)
        elif c:
            phy_mult = phy_stamina_mult(c["stats"].get("phy", 60))
        else:
            phy_mult = 1.0

        if role == "gk":
            base_cost = random.randint(2, 4)
        else:
            base_cost = random.randint(lo, hi) + half_extra

        active_mult = random.uniform(1.30, 1.45) if cid in active_cids else 1.0

        cost = max(1, int(round(base_cost * role_mult * fatigue_mult
                                * active_mult * phy_mult)))
        side["stamina"][cid] = max(0, side["stamina"].get(cid, 100) - cost)

    for cid in side["bench"]:
        side["stamina"][cid] = min(100, side["stamina"].get(cid, 100) + 2)

def auto_sub_if_needed(side):
    """任何首发体能 < 15 → 尝试用最合适替补换下"""
    subs = []
    if side["subs_left"] <= 0: return subs
    cards = side["cards_snapshot"]
    for slot, cid in list(side["starters"].items()):
        if side["stamina"].get(cid, 100) >= 15: continue
        need_gk = (slot == "GK")
        best = None
        for bcid in side["bench"]:
            b = cards.get(bcid)
            if not b: continue
            if b.get("is_gk") != need_gk: continue
            if side["stamina"].get(bcid, 100) < 40: continue
            if best is None or b["ovr"] > cards[best]["ovr"]: best = bcid
        if best:
            side["starters"][slot] = best
            side["bench"].remove(best)
            side["bench"].append(cid)
            side["subs_left"] -= 1
            # 【新增】记录参赛
            side.setdefault("all_participants", [])
            if best not in side["all_participants"]:
                side["all_participants"].append(best)
            subs.append({"slot":slot, "off":cards[cid]["name"], "on":cards[best]["name"]})
    return subs

# ===== 战术组合开场（每种 7 条）=====
INTRO_TEMPLATES = {
    ("all_attack","all_attack"): [
        "疯狂对攻！门前险象环生，看台山呼海啸。",
        "教科书对攻大战，中场几乎无人驻守。",
        "两队都杀红了眼，这不是足球，是拳击。",
        "{h_top} 与 {a_top} 你来我往，节奏快得眼花缭乱。",
        "开场就是攻势足球，一秒都不带停的。",
        "双方门将怕是全场最忙碌的人。",
        "解说员声嘶力竭，皮球一分钟没在中场停过。",
    ],
    ("all_attack","all_defend"): [
        "{h_name} 全线压上狂攻，{a_name} 龟缩半场铸铁壁。",
        "极端对撞：{h_top} 的攻势拍打 {a_top} 的人墙。",
        "{h_name} 恨不得连门将都推上去，{a_name} 摆出十字架防守。",
        "禁区堆满防守队员，{h_top} 想传都传不出去。",
        "{h_name} 三线压上，{a_name} 全员回缩禁区。",
        "极限攻防：矛与盾的较量。",
        "{a_top} 领衔的人墙密不透风，{h_top} 一头撞上去。",
    ],
    ("all_attack","attack"): [
        "{h_name} 火力全开，{a_name} 也不甘示弱。",
        "{h_top} 三前锋齐上，把 {a_top} 钉死在门前。",
        "{h_name} 打得凶猛，{a_name} 见缝插针反击。",
        "两队都不设防，中场沦为快速通道。",
        "{h_top} 疯狂输出，但 {a_name} 时刻威胁着回敬。",
        "整场比赛的节奏被 {h_name} 拉满。",
        "{h_top} 与 {a_top} 分别领衔前场，谁先破门？",
    ],
    ("all_attack","defend"): [
        "{h_name} 雪崩式进攻，{a_top} 领衔防线苦苦支撑。",
        "{h_top} 一波强攻直逼禁区，{a_name} 门将连续救险。",
        "{h_name} 三线压上，{a_name} 全员回撤铁桶。",
        "{h_top} 眼看就要撕开缺口，{a_top} 拼死封堵。",
        "{h_name} 攻势如潮，{a_name} 只能防守反击。",
        "{h_top} 面对多层防线，突破难度极大。",
        "{a_name} 深度防守，把希望寄托在门将身上。",
    ],
    ("all_attack","balance"): [
        "{h_name} 孤注一掷压上，{a_name} 稳如老狗。",
        "{h_top} 冲得凶猛，{a_top} 冷静应对。",
        "{h_name} 打得急躁，{a_name} 按节奏推进。",
        "{h_top} 一次次冲击，{a_top} 见招拆招。",
        "{h_name} 摆明了赌一把，{a_name} 保持阵型完整。",
        "极限压迫遇上稳健布阵，考验心态。",
        "{h_name} 的疯狂 vs {a_name} 的冷静。",
    ],
    ("attack","all_attack"): [
        "两队都选择进攻，{h_top} 与 {a_top} 场上飙速。",
        "开场就是攻势足球，谁也不留守。",
        "{a_name} 打得更疯，{h_name} 也不落下风。",
        "皮球在两个禁区之间来回飞舞。",
        "{h_top} 与 {a_top} 隔空对话，各显神通。",
        "中场几乎不存在，直接短兵相接。",
        "对攻烈度拉满，好戏刚开始。",
    ],
    ("attack","attack"): [
        "双方开启对攻！{h_top} 与 {a_top} 相互试探。",
        "谁也不服谁，两队都压上进攻。",
        "针锋相对的进攻战，比拼谁的锋线更锋利。",
        "{h_top} 和 {a_top} 各带一队，正面硬刚。",
        "开局就是硬碰硬，无人退让。",
        "两支球队都想抢占先机。",
        "{h_top} 的锋芒对上 {a_top} 的意志。",
    ],
    ("attack","defend"): [
        "{h_name} 高位压迫，{a_name} 全线回收铁桶。",
        "{h_top} 冲击 {a_top} 领衔的防线，试图撕开缺口。",
        "{h_name} 传控猛攻，{a_name} 层层阻截。",
        "{h_top} 三十米区域内长时间控球。",
        "{a_name} 深度防守，等待反击时机。",
        "{h_top} 屡屡制造威胁，{a_top} 屡屡化解。",
        "阵地战开始，{h_name} 需要一记灵光。",
    ],
    ("attack","all_defend"): [
        "{h_name} 猛攻不止，{a_name} 干脆全员回禁区死守。",
        "{h_top} 一个人杀进 {a_top} 的人墙。",
        "{h_name} 阵地攻坚，{a_name} 十人蹲坑。",
        "{a_top} 领衔的铁桶阵让 {h_top} 头疼不已。",
        "{h_name} 传倒了几十脚，就是找不到突破口。",
        "{a_name} 摆明了要保平，{h_name} 只能耐心磨。",
        "{h_top} 面对的是几乎所有 {a_name} 球员。",
    ],
    ("attack","balance"): [
        "{h_name} 主导进攻，{a_name} 稳字当头。",
        "{h_top} 前场施压，{a_top} 冷静回应。",
        "{h_name} 掌控节奏，{a_name} 见招拆招。",
        "{h_top} 组织攻势，{a_top} 谨慎防守。",
        "{h_name} 试图打破僵局。",
        "{a_name} 阵型齐整，等待反击机会。",
        "{h_top} 全场活跃，{a_top} 领衔的中场稳如磐石。",
    ],
    ("balance","all_attack"): [
        "{a_name} 疯狂进攻，{h_name} 稳住阵脚。",
        "{a_top} 追风逐电，{h_top} 稳坐钓鱼台。",
        "{a_name} 打得急，{h_name} 慢慢消耗。",
        "{a_top} 三线压上，{h_top} 冷静指挥防守。",
        "{h_name} 摆出坚固阵型迎接暴风雨。",
        "{a_name} 火力全开，{h_name} 见招拆招。",
        "极端 vs 均衡，谁能笑到最后？",
    ],
    ("balance","attack"): [
        "{a_name} 抢先发难，{h_name} 从容不迫。",
        "{a_top} 前压，{h_top} 见招拆招。",
        "{a_name} 掌控节奏，{h_name} 保持阵型。",
        "{a_top} 屡次组织进攻，{h_top} 稳步应对。",
        "{h_name} 冷静应变，等待反击时机。",
        "{a_top} 领衔攻势，气势逼人。",
        "比赛节奏由 {a_name} 主导。",
    ],
    ("balance","balance"): [
        "两队稳扎稳打，比赛陷入中场缠斗。",
        "节奏均衡，双方都在耐心寻找破绽。",
        "中场铁血对抗，{h_top} 和 {a_top} 互不相让。",
        "教科书式对阵，谁先犯错谁就输。",
        "看似平静，实则暗流涌动。",
        "皮球在中场反复易手，考验耐心。",
        "两支球队都不愿意先撕破面纱。",
    ],
    ("balance","defend"): [
        "{h_name} 试图掌控节奏，{a_name} 深度防守。",
        "比赛节奏被压慢，{a_top} 领衔防线固若金汤。",
        "{h_name} 耐心倒脚，{a_name} 严阵以待。",
        "{a_top} 挡在 {h_top} 的进攻路线上。",
        "沉闷的阵地战，观众有点坐不住了。",
        "{h_name} 找不到突破口，只能循规蹈矩。",
        "{a_name} 打得极其保守。",
    ],
    ("balance","all_defend"): [
        "{a_name} 龟缩防守，{h_name} 只能耐心找机会。",
        "{a_top} 摆出的铁桶让人窒息。",
        "{h_top} 找不到空档，被 {a_name} 的人墙劝退。",
        "{a_name} 全员回撤，摆明了保平。",
        "{h_name} 传中战术都难以奏效。",
        "闷战氛围浓厚，比分难有变化。",
        "{a_top} 领衔的防线堪比城墙。",
    ],
    ("defend","all_attack"): [
        "{a_top} 疯狂输出，{h_top} 屡屡化解。",
        "{a_name} 单方面猛攻，{h_name} 等一次快反。",
        "{a_top} 十次进攻九次被 {h_top} 拦下。",
        "{h_name} 全员回防，防守反击战术就位。",
        "{a_name} 攻得急，反而给了 {h_name} 反击机会。",
        "{h_top} 领衔的后防线纹丝不动。",
        "{a_top} 面对的是密不透风的防线。",
    ],
    ("defend","attack"): [
        "{a_name} 主导控球权，{h_name} 摆大巴等反击。",
        "{a_top} 组织进攻，{h_top} 领衔后防纹丝不动。",
        "{a_name} 传倒之间，{h_name} 静观其变。",
        "{h_top} 领衔的防线井然有序。",
        "{a_top} 屡次尝试撕开缺口。",
        "{h_name} 深度防守，等一次转换机会。",
        "阵地战考验双方的耐心。",
    ],
    ("defend","balance"): [
        "{h_name} 深度防守，{a_name} 谨慎推进。",
        "比赛沉闷，双方都不愿意先撕破防线。",
        "{h_top} 领衔的防线严阵以待。",
        "{a_name} 保持阵型，不冒任何险。",
        "皮球在中场大部分区域反复易手。",
        "{h_name} 打得极其保守。",
        "看台上响起零星的嘘声。",
    ],
    ("defend","defend"): [
        "双方都不敢压上，中场无人问津。",
        "看台开始起哄，两队都在等对手犯错。",
        "极其沉闷的比赛，双方都保守。",
        "{h_top} 和 {a_top} 隔着中场对视。",
        "皮球更像烫手山芋，谁也不想主动。",
        "解说员开始聊起了昨晚的球赛。",
        "两队教练都在赌对手先冲。",
    ],
    ("defend","all_defend"): [
        "双方都摆铁桶，比赛几乎停摆。",
        "解说员都尴尬地笑了，这什么比赛？",
        "两支球队都全员回撤，简直迷惑。",
        "皮球在中场无人区打转。",
        "看台观众开始离场，比赛毫无观赏性。",
        "这场比赛看着看着都想睡觉。",
        "{h_top} 和 {a_top} 都在对方半场散步。",
    ],
    ("all_defend","all_attack"): [
        "极限对抗！{a_name} 倾巢而出，{h_name} 死守禁区。",
        "{a_top} 领衔狂攻，{h_top} 用血肉筑起城墙。",
        "{h_name} 全员回禁区，等一次绝杀反击。",
        "{a_name} 十人压上，{h_name} 十人守禁区。",
        "{h_top} 变成清道夫，一次次化解危机。",
        "{a_top} 恨不得亲自去顶皮球。",
        "极端矛盾对撞，好戏还在后头。",
    ],
    ("all_defend","attack"): [
        "{h_name} 全员回防死守，{a_name} 各种手段找突破。",
        "{a_top} 领衔攻势，{h_top} 用意志顶住。",
        "{h_name} 深度防守，一心保平。",
        "{a_name} 攻势不断，{h_name} 门将连续救险。",
        "{h_top} 领衔的人墙密不透风。",
        "{a_top} 传中角球试个遍。",
        "{h_name} 铁了心要抢一个平局。",
    ],
    ("all_defend","balance"): [
        "{h_name} 主动摆大巴，{a_name} 却不急于压上。",
        "{h_top} 带头回防，{a_top} 有些疑惑。",
        "{h_name} 谨慎至极，{a_name} 谨慎更甚。",
        "皮球在中场无所适从。",
        "{h_name} 摆铁桶但对手不进攻，两个尴尬的教练。",
        "看似防守其实等对方冲上来。",
        "{h_top} 领衔的后防线严阵以待。",
    ],
    ("all_defend","defend"): [
        "闷战开始，两支球队都在守株待兔。",
        "双方都想着零封对手，进攻欲望极低。",
        "{h_top} 和 {a_top} 双双龟缩后场。",
        "皮球被踢向天空，观众也无奈。",
        "解说员开始复盘上周比赛。",
        "这场比赛适合当催眠曲。",
        "两队都在等对方犯错。",
    ],
    ("all_defend","all_defend"): [
        "双方都不进攻，观众开始拿出手机刷微博。",
        "两支球队都在等对方绷不住冲上来。",
        "闷战之王，比赛毫无节奏可言。",
        "这场比赛的最佳球员或许是主裁判。",
        "皮球在中圈原地画圈。",
        "教练席上两人相视苦笑。",
        "现场变成了瑜伽课。",
    ],
    "default": [
        "场上局势瞬息万变，{h_top} 与 {a_top} 各显身手。",
        "回合胶着，谁能率先抓住机会？",
        "两队都在寻找对方防线的漏洞。",
        "{h_top} 和 {a_top} 交相辉映，好戏连连。",
        "比赛陷入胶着状态。",
        "看台山呼海啸，气氛热烈。",
        "谁能笑到最后？",
    ]
}

# ===== 风格首回合披露 =====
STYLE_INTRO_LINES = {
    "high_press": [
        "{name} 摆出高位逼抢阵势，全线压至中圈上方！",
        "{name} 一开场就疯狂逼抢，寸土必争！",
        "{name} 上来就压迫，明显要打闪电战！",
    ],
    "counter_attack": [
        "{name} 摆明了打防守反击，屯兵后场伺机而动。",
        "{name} 深度防守，一心等反击机会。",
        "{name} 主动交出控球权，暗藏杀机。",
    ],
    "park_bus": [
        "{name} 一开场就摆大巴，明显要保平。",
        "{name} 十人齐齐回半场，铁桶阵登场！",
        "{name} 摆明了要打消耗，绝不冒险。",
    ],
    "possession": [
        "{name} 摆出传控体系，耐心倒脚。",
        "{name} 从后场开始短传渗透，教科书传控。",
        "{name} 皮球在脚下永不停息，压迫式控球。",
    ],
    "long_ball": [
        "{name} 简化中场，长传直接找前锋。",
        "{name} 后卫直接大脚开长传，简单粗暴。",
        "{name} 前场肌肉线待命，玩长传冲吊。",
    ],
    "wing_play": [
        "{name} 两个边路都拉得很宽，要走边路！",
        "{name} 两翼齐飞，边锋速度惊人！",
        "{name} 场地被拉到极致宽度，边路走廊战术。",
    ],
    "central": [
        "{name} 集中兵力于中路，前场蓄势待发。",
        "{name} 中路三叉戟联动，打肋部渗透。",
        "{name} 中路小组配合精妙，边路只做辅助。",
    ],
}

STYLE_INTRO_LINES.update({
    "total_football": [
        "{name} 打起 70s 荷兰全攻全守！位置流动，边后卫都能杀到禁区！",
        "{name} 全员参与攻防，克鲁伊夫式的位置换血！",
        "{name} 十人一体像水一样流动，米歇尔斯的复活！",
    ],
    "catenaccio": [
        "{name} 摆出经典意式链式防守，清道夫铸铁闸！",
        "{name} 摆出十字防线，1-0 的胜利就是最完美的比赛！",
        "{name} 极端防守就位，冷血反击等在门口！",
    ],
    "gegenpressing": [
        "{name} 克洛普式反抢！丢球 8 秒内一定要抢回来！",
        "{name} 高压闸门开启，全员疯狗式反抢！",
        "{name} 就地扑抢，转换即杀招！",
    ],
    "false_nine": [
        "{name} 打无锋阵，中锋位置全是伪 9 号回撤组织！",
        "{name} 排出 11 名技术型中场，就是不派中锋！",
        "{name} 梅西式回撤，中卫跟不跟都是错！",
    ],
    "kick_and_rush": [
        "{name} 后卫直接大脚，前锋满场狂奔！",
        "{name} 古典英式踢法，中场？不存在的！",
        "{name} 简单粗暴：抢下球，长传找锋线，一脚射！",
    ],
})

# ===== 进球模板（每种类型 7 条）=====
GOAL_TEMPLATES = {
    "counter": [
        "🚀 {scorer} 长途奔袭一脚推射远角！",
        "⚡ 教科书反击！{scorer} 甩开防守冷静破门！",
        "🎯 {scorer} 抓住空档单刀直入！",
        "💨 {scorer} 一条龙从中圈杀入禁区！",
        "🏃 {scorer} 反击奔袭 40 米轻松破门！",
        "⚔️ {scorer} 快速反击一击致命！",
        "🌪️ {scorer} 反击闪电战，门将措手不及！",
        "🌩️ 反抢即刀锋！{scorer} 3 秒内完成从抢断到破门！",
    ],
    "cross": [
        "🎯 {scorer} 高高跃起头槌破门！",
        "✨ 精准传中找到 {scorer}，头槌砸入网窝！",
        "🔥 {scorer} 后点包抄一蹴而就！",
        "🎈 {scorer} 力压中卫头槌划出漂亮弧线！",
        "🦅 {scorer} 制空权无解，头槌破门！",
        "📐 传中精准，{scorer} 头槌摆渡入网！",
        "🎭 {scorer} 侧空翻头槌，视觉盛宴！",
    ],
    "long_range": [
        "⚡ {scorer} 一记远射直挂死角！",
        "🚀 30 米开外世界波！{scorer} 名场面！",
        "🔥 {scorer} 弧线球绕过人墙上角！",
        "💫 {scorer} 凌空抽射爆网入门！",
        "💥 {scorer} 势大力沉的远射，门将无能为力！",
        "🎯 {scorer} 禁区外冷射死角！",
        "☄️ {scorer} 一记炮弹，网都被打破了！",
    ],
    "solo": [
        "🌟 {scorer} 连过三人后冷静推射！",
        "⚔️ {scorer} 内切爆射直挂近角！",
        "🎩 {scorer} 假动作晃开门将轻松推射！",
        "🎨 {scorer} 花式盘带过掉两名后卫！",
        "🕺 {scorer} 一个牛尾巴晃开防守，冷静破门！",
        "🎪 {scorer} 秀翻全场，禁区舞蹈后破门！",
        "💃 {scorer} 步频闪电，连过防线破门！",
        "🌀 {scorer} 边后卫杀入禁区破门！全攻全守的教科书！",
    ],
    "tap_in": [
        "🎯 {scorer} 门前捡漏破门！最简单的进球！",
        "✨ 混战中 {scorer} 反应最快！",
        "🔥 门将脱手，{scorer} 补射得分！",
        "💥 {scorer} 门线前一米将球捅入！",
        "🎁 白送的进球！{scorer} 门前捅射！",
        "🍰 简单到不能再简单，{scorer} 面对空门推射！",
        "🎈 {scorer} 门前埋伏成功，轻松破门！",
    ],
    "set_piece": [
        "🎯 定位球！{scorer} 头槌破门！",
        "⚽ 任意球机会，{scorer} 直接打门得分！",
        "✨ 角球助攻，{scorer} 后点垫射入网！",
        "🔥 战术角球配合，{scorer} 冷射建功！",
        "🎪 教科书式任意球，{scorer} 绕过人墙！",
        "📐 角球战术奏效，{scorer} 抢到落点破门！",
        "⚡ {scorer} 电梯球任意球！门将扑不到！",
    ],
    "penalty": [
        "💯 点球！{scorer} 冷静罚进！",
        "🎯 {scorer} 十二码勺子破门，帅气！",
        "🔥 {scorer} 大力抽射死角，点球王者！",
        "😎 {scorer} 一挑破门，玩心情！",
        "⚡ 点球！{scorer} 骗过门将轻松推射！",
        "💥 {scorer} 十二码狠狠砸入球门！",
        "🎩 {scorer} 优雅点球，直挂上角！",
    ],
    "default": [
        "🎯 {scorer} 门前混战中破门！",
        "⚡ {scorer} 抽射建功！",
        "🔥 {scorer} 破门得分！",
        "✨ {scorer} 抓住机会破门！",
        "💥 {scorer} 一记劲射入网！",
        "🎯 {scorer} 门前冷静一击！",
        "⚽ {scorer} 完成破门！",
    ],
}

SAVE_TEMPLATES = [
    "🧤 {gk} 神勇扑救，把 {shooter} 的必进球挡出！",
    "🛡️ {gk} 单掌托出横梁，全场惊呼！",
    "🚧 {gk} 出击果断，化险为夷。",
    "🔒 {gk} 反应神速，用脚尖将球扑出底线！",
    "✋ {gk} 飞身鱼跃，把 {shooter} 的射门没收！",
    "🥅 {gk} 侧扑将球托出立柱！",
    "🎯 {gk} 站位精准，{shooter} 的射门径直砸怀里。",
]

MISS_TEMPLATES = [
    "😩 {shooter} 打偏了，捶胸顿足。",
    "❌ {shooter} 射门被后卫封堵。",
    "⚠️ {shooter} 击中门柱，与进球失之交臂！",
    "🎯 {shooter} 抬脚过高，皮球飞入看台。",
    "💦 {shooter} 打了高射炮。",
    "🚫 {shooter} 的推射被后卫飞身挡出！",
    "🌫 {shooter} 面对空门竟然踢飞了！",
]

FILLER_EVENTS = [
    "👀 {name} 送出直塞球，可惜越位。",
    "⚠️ {p1} 一次凶狠铲球放倒了 {p2}，裁判口头警告。",
    "🚩 {name} 主罚角球，没造成威胁。",
    "🎯 {p1} 与 {p2} 中场肉搏抢下球权。",
    "😤 {name} 高速反击，最后一传打偏。",
    "🎩 {p1} 一记马赛回旋晃开 {p2}！",
    "📸 {name} 一脚精妙分球，全场喝彩！",
]

EVENT_TEMPLATES = {
    "yellow": [
        "⚠️ {p} 铲球过大，主裁掏出黄牌！",
        "🟨 {p} 累积犯规，吃到黄牌。",
        "🟨 {p} 一记飞铲被主裁鸣哨警告。",
        "⚠️ {p} 拖延时间被出示黄牌。",
        "🟨 {p} 抗议判罚，主裁毫不留情。",
        "⚠️ {p} 战术犯规不得已吃到黄牌。",
        "🟨 {p} 拉拽对方球员被判黄牌！",
    ],
    "second_yellow": [
        "🟨🟥 {p} 两黄变一红，提前离场！【{team}】剩 {n} 人！",
        "🟨🟥 {p} 累积两黄被罚下！【{team}】少一人应战！",
    ],
    "red": [
        "🟥 恶意犯规！{p} 红牌罚下！【{team}】只剩 {n} 人！",
        "🟥 严重犯规！{p} 被直接罚下！【{team}】少一人！",
        "🟥 {p} 手球阻挡单刀，红牌是必然的！【{team}】{n} 人！",
        "🟥 争议判罚！{p} 被红牌罚下，全场哗然！",
        "🟥 {p} 情绪失控推搡对方，直接红牌！",
        "🟥 {p} 抽射脚部动作过大，主裁给了红牌！",
        "🟥 {p} 阻挡门将出击，红牌无疑！【{team}】{n} 人！",
    ],
    "injury_sub": [
        "🚑 {p} 拉伤下场，{sub} 紧急替补（{slot}）。",
        "🚑 {p} 与对方相撞倒地，{sub} 顶上（{slot}）。",
        "🚑 {p} 脚踝扭伤，换上 {sub}（{slot}）。",
        "🚑 {p} 抽筋无法坚持，{sub} 替换出场（{slot}）。",
        "🚑 {p} 头部相撞需检查，{sub} 替补上场（{slot}）。",
    ],
    "injury_out": [
        "🚑 {p} 倒地不起被担架抬走！【{team}】没有替补，十人应战！",
        "🚑 {p} 无法坚持，{team} 换人耗尽只能少一人！",
    ],
    "own_goal": [
        "😱 乌龙球！{p} 解围把球踢进自家球门！",
        "🤦 {p} 头球解围顶入自家网窝！",
        "😭 大乌龙！{p} 回传力度过大滚入自家球门！",
        "🎭 {p} 上演乌龙好戏！",
        "😖 {p} 想解围却成了送礼！",
    ],
    "gk_blunder": [
        "🥅 门将 {gk} 脱手，皮球滚入网窝！",
        "🥅 {gk} 出击失误，对方轻松破门！",
        "🥅 {gk} 判断失误看着皮球飞入自家球门！",
        "🥅 {gk} 大脚开球失误直接送礼！",
        "🥅 {gk} 手抛球被抢断，直接失球！",
    ],
    "penalty_miss": [
        "🎯 点球！{p} 主罚被 {gk} 扑出！",
        "🎯 {p} 点球打飞了，全场惊呼！",
        "🎯 {p} 十二码击中门柱！可惜！",
        "🎯 {p} 主罚软绵绵，被 {gk} 轻松没收。",
        "🎯 {p} 助跑过猛，把点球踢飞看台！",
    ],
    "penalty_goal": [
        "💯 点球！{p} 冷静罚进！",
        "🎯 {p} 大力抽射死角，点球王者！",
        "😎 {p} 一挑破门，玩心情！",
        "⚡ {p} 十二码骗过 {gk} 破门！",
    ],
    "crossbar": [
        "🎯 {p} 一记劲射砰的一声打在门柱！",
        "🎯 {p} 头槌击中横梁，可惜！",
        "🎯 {p} 弧线球擦柱而出！",
        "🎯 {p} 抽射打在立柱上弹出，命运不济！",
        "🎯 {p} 单刀吊射砸横梁！",
    ],
    "morale": [
        "🔥 {p} 一次精彩救险点燃全队士气！",
        "💪 {p} 带头呐喊，全队斗志高昂！",
        "🎉 主教练指挥有方，球员士气回升！",
        "⚡ {p} 一次拼抢激发全队斗志！",
    ],
}

MID_EVENT_TEMPLATES = {
    "key_pass": [
        "🎯 {p} 送出致命直塞，穿透整条防线！",
        "✨ {p} 一记外脚背长传找到前锋！",
        "🎨 {p} 华丽的挑传打穿肋部！",
        "📐 {p} 45 度精准弧线球，教科书级传球！",
        "💫 {p} No-Look Pass 让对方后卫愣在原地！",
    ],
    "turnover": [
        "🌫️ {p} 中场传球失误被对方抢断！",
        "⚠️ {p} 停球失误被逼抢没收！",
        "❌ {p} 一脚长传直接送给对方门将！",
        "🤦 {p} 想秀技术却被断球！",
    ],
    "interception": [
        "🛡️ {p} 精准预判抢断！化解对方攻势！",
        "⚡ {p} 中场断球后立即发动反击！",
        "🎯 {p} 一次教科书式的拦截！",
        "🧠 {p} 早已看穿对方传球路线！",
    ],
    "chance_created": [
        "🔥 {p} 大力任意球擦柱而过，惊出一身冷汗！",
        "🎬 {p} 抢点头球被门将神扑！",
        "⚔️ {p} 30 米长途奔袭到禁区被断！",
    ],
}
EVENT_TEMPLATES.update(MID_EVENT_TEMPLATES)

def pick_goal_type(tactic, style):
    """按战术+风格加权抽取进球类型"""
    weights = {"default": 1.0, "tap_in": 0.7, "solo": 0.8, "long_range": 0.6,
               "cross": 0.6, "counter": 0.5, "set_piece": 0.5}
    if tactic in ("attack","all_attack"):
        weights["long_range"] += 0.8; weights["solo"] += 0.8; weights["tap_in"] += 0.5
    if tactic in ("defend","all_defend"):
        weights["counter"] += 1.5; weights["set_piece"] += 0.8; weights["long_range"] += 0.3
    if style == "counter_attack":
        weights["counter"] += 2.0; weights["long_range"] += 0.5
    elif style == "wing_play":
        weights["cross"] += 2.5
    elif style == "long_ball":
        weights["long_range"] += 1.2; weights["cross"] += 1.5
    elif style == "possession":
        weights["solo"] += 1.5; weights["tap_in"] += 1.0
    elif style == "high_press":
        weights["tap_in"] += 1.8; weights["counter"] += 0.8
    elif style == "central":
        weights["solo"] += 1.0; weights["tap_in"] += 0.8; weights["cross"] += 0.3
    elif style == "park_bus":
        weights["counter"] += 1.5; weights["set_piece"] += 1.0
    if random.random() < 0.05:  # 5% 点球彩蛋
        return "penalty"
    types = list(weights.keys())
    return random.choices(types, weights=[weights[t] for t in types], k=1)[0]


def pick_top(side, dim_key, prefer_role=None):
    """选出该维度最强首发。prefer_role 指定角色范围（fwd/atk_mid/mid/def_mid/def）"""
    cards = side["cards_snapshot"]
    best_name, best_val = "队长", -1
    for slot, cid in side["starters"].items():
        c = cards.get(cid)
        if not c: continue
        role = POSITION_ROLE.get(slot, "mid")
        if role == "gk": continue
        # 角色加权：优先角色 ×1.3，其他 ×0.7
        boost = 1.3 if (prefer_role and role == prefer_role) else (0.7 if prefer_role else 1.0)
        v = c["stats"].get(dim_key, 0) * boost
        if v > best_val: best_val, best_name = v, c["name"]
    return best_name

def default_pstat():
    return {"goals":0, "assists":0, "shots":0,
            "saves":0, "conceded":0,
            "yellow":0, "red":0, "own_goal":0, "blunder":0,
            "key_passes":0, "turnovers":0, "interceptions":0, "chances_created":0}

def ensure_pstat(side, cid):
    ps = side.setdefault("player_stats", {})
    if cid not in ps: ps[cid] = default_pstat()
    return ps[cid]

def pick_weighted(side, dim_key, prefer_role=None, penalize=None):
    """加权随机选人。强者概率更大但不垄断。penalize={cid:mul} 用来降低刚点名者的权重"""
    penalize = penalize or {}
    candidates, weights = [], []
    for slot, cid in side["starters"].items():
        c = side["cards_snapshot"].get(cid)
        if not c: continue
        role = POSITION_ROLE.get(slot, "mid")
        if role == "gk": continue
        role_mult = 1.5 if (prefer_role and role == prefer_role) else (0.55 if prefer_role else 1.0)
        stat = c["stats"].get(dim_key, 40)
        w = max(1.0, (stat * role_mult) ** 1.5)
        w *= penalize.get(cid, 1.0)
        candidates.append((cid, c["name"]))
        weights.append(w)
    if not candidates or sum(weights) <= 0:
        return None, "队长"
    r = random.random() * sum(weights)
    cum = 0
    for item, w in zip(candidates, weights):
        cum += w
        if r <= cum: return item
    return candidates[-1]

def pick_offender(side, offense_bias):
    """选一个'倒霉的'球员。offense_bias=True 前场倾向；False 后场倾向"""
    starters_by_role = {"fwd":[],"atk_mid":[],"mid":[],"def_mid":[],"def":[]}
    for slot, cid in side["starters"].items():
        role = POSITION_ROLE.get(slot, "mid")
        if role == "gk": continue
        c = side["cards_snapshot"].get(cid)
        if not c: continue
        starters_by_role[role].append((slot, cid, c["name"]))
    if offense_bias:
        w = {"fwd":3,"atk_mid":2,"mid":2,"def_mid":1,"def":1}
    else:
        w = {"fwd":1,"atk_mid":1,"mid":2,"def_mid":3,"def":3}
    pool = []
    for role, plist in starters_by_role.items():
        for _ in range(w.get(role, 1)):
            pool.extend(plist)
    return random.choice(pool) if pool else None


def check_events(side, tactic, opp_side):
    """一回合内该队的突发事件序列。返回事件字典列表"""
    evs = []
    style = side.get("style", "")
    reds = side.get("red_cards", 0)
    card_mult = max(0.25, 1.0 - side.get("card_reduce", 0.0) + side.get("card_risk", 0.0))
    round_cmd = side.get("round_command") or {}
    if round_cmd.get("card_reduce"):
        card_mult *= max(0.25, 1.0 - round_cmd["card_reduce"])

    # 黄牌
    if random.random() < event_rate("yellow", tactic, style) * card_mult:   # ← 改
        off = pick_offender(side, offense_bias=(tactic in ("all_defend","defend")))
        if off:
            evs.append({"type":"yellow", "player":off[2]})
            ensure_pstat(side, off[1])["yellow"] += 1
            side.setdefault("yellow_cards", {})
            side["yellow_cards"][off[1]] = side["yellow_cards"].get(off[1], 0) + 1
            # 两黄变红
            if side["yellow_cards"][off[1]] >= 2 and reds < 2 and off[0] in side["starters"]:
                ensure_pstat(side, off[1])["red"] += 1
                side["sent_off"].append(off[1])          # ← 新增
                evs.append({"type":"second_yellow", "player":off[2]})   # ← 新增这一行
                side["starters"].pop(off[0], None)
                reds += 1
                side["red_cards"] = reds

    # 直接红牌
    if reds < 2 and random.random() < event_rate("red", tactic, style) * card_mult:   # ← 改
        off = pick_offender(side, offense_bias=(tactic in ("all_defend","defend")))
        if off and off[0] in side["starters"]:
            evs.append({"type":"red","player":off[2],"slot":off[0]})
            ensure_pstat(side, off[1])["red"] += 1
            side["sent_off"].append(off[1])      # ← 新增
            side["starters"].pop(off[0], None)
            reds += 1
            side["red_cards"] = reds

    # 伤病
    if reds < 2 and random.random() < event_rate("injury", tactic, style):
        off = pick_offender(side, offense_bias=random.choice([True, False]))
        if off and off[0] in side["starters"]:
            best_bench = None
            for bcid in side["bench"]:
                b = side["cards_snapshot"].get(bcid)
                if not b or b.get("is_gk"): continue
                if best_bench is None or b["ovr"] > side["cards_snapshot"][best_bench]["ovr"]:
                    best_bench = bcid
            if best_bench and side["subs_left"] > 0:
                side["starters"][off[0]] = best_bench
                side["bench"].remove(best_bench)
                side["subs_left"] -= 1
                side.setdefault("all_participants", [])
                if best_bench not in side["all_participants"]:
                    side["all_participants"].append(best_bench)
                # 【新增】标记因伤下场
                side.setdefault("injured_out", [])
                if off[1] not in side["injured_out"]:
                    side["injured_out"].append(off[1])
                evs.append({"type":"injury_sub","player":off[2],
                            "sub":side["cards_snapshot"][best_bench]["name"], "slot":off[0]})
            else:
                side["sent_off"].append(off[1])
                # 【新增】伤退无替补也算因伤
                side.setdefault("injured_out", [])
                if off[1] not in side["injured_out"]:
                    side["injured_out"].append(off[1])
                side["starters"].pop(off[0], None)
                reds += 1
                side["red_cards"] = reds
                evs.append({"type":"injury_out","player":off[2],"slot":off[0]})

    # 乌龙球
    if random.random() < event_rate("own_goal", tactic, style):
        off = pick_offender(side, offense_bias=False)
        if off:
            ensure_pstat(side, off[1])["own_goal"] += 1
            evs.append({"type":"own_goal","player":off[2],"gift":1})

    # 门将失误
    if random.random() < event_rate("gk_blunder", tactic, style):
        gk_cid = side["starters"].get("GK")
        if gk_cid: ensure_pstat(side, gk_cid)["blunder"] += 1
        evs.append({"type":"gk_blunder","gk":pick_gk_name(side),"gift":1})

    # 点球
    if random.random() < event_rate("penalty", tactic, style):
        scid, sname = pick_weighted(side, "sho", prefer_role="fwd")
        if random.random() < 0.3:
            evs.append({"type":"penalty_miss","player":sname,"gk":pick_gk_name(opp_side)})
        else:
            if scid: ensure_pstat(side, scid)["goals"] += 1
            evs.append({"type":"penalty_goal","player":sname,"score":1})

    # 击中门柱
    if random.random() < event_rate("crossbar", tactic, style):
        evs.append({"type":"crossbar","player":pick_top(side,"sho",prefer_role="fwd")})

    # 士气爆棚（下回合 +5% 攻击）
    if random.random() < event_rate("morale", tactic, style):
        evs.append({"type":"morale","player":pick_top(side,"phy",prefer_role="mid")})
        side["morale_boost"] = 1.05

    return evs

def midfield_events(side, opp_side, possession, is_own_possession=True):
    """中场专属事件。possession 是本队控球率"""
    evs = []
    # 关键传球：控球高 + 前场 mid/atk_mid 强 → 高频
    if random.random() < 0.32 + possession * 0.35:
        cid, name = pick_weighted(side, "pas",
                                    prefer_role=random.choice(["mid","atk_mid"]))
        if cid:
            ensure_pstat(side, cid)["key_passes"] += 1
            evs.append({"type":"key_pass","player":name})
            if random.random() < 0.35:  # 35% 关键传球转化为射门机会
                ensure_pstat(side, cid)["chances_created"] += 1

    # 拦截：控球低 → 高频（我方在防守）
    if random.random() < 0.22 + (1-possession) * 0.30:
        cid, name = pick_weighted(side, "def",
                                    prefer_role=random.choice(["mid","def_mid","def"]))
        if cid:
            ensure_pstat(side, cid)["interceptions"] += 1
            evs.append({"type":"interception","player":name})

    # 传球失误：控球低 + PAS 低 → 高频
    if random.random() < 0.15 + (1-possession) * 0.20:
        cid, name = pick_weighted(side, "pas",
                                    prefer_role=random.choice(["mid","def_mid"]))
        if cid:
            ensure_pstat(side, cid)["turnovers"] += 1
            evs.append({"type":"turnover","player":name})

    # 制造机会（未进球的威胁攻势）
    if random.random() < 0.25:
        cid, name = pick_weighted(side, "dri",
                                    prefer_role=random.choice(["atk_mid","fwd"]))
        if cid:
            ensure_pstat(side, cid)["chances_created"] += 1
            evs.append({"type":"chance_created","player":name})
    return evs


def render_events(evs, team_name, remaining):
    lines = []
    for e in evs:
        t = e["type"]
        tmpl = random.choice(EVENT_TEMPLATES.get(t, ["🎬 突发事件"]))
        lines.append(tmpl.format(
            p=e.get("player","？"), team=team_name, n=remaining,
            sub=e.get("sub","？"), slot=e.get("slot",""), gk=e.get("gk","门将"),
        ))
    return lines

def build_commentary(home, away, home_name, away_name, res, show_style_intro):
    ht, at = res["h_tactic"], res["a_tactic"]
    hs_style, as_style = res.get("h_style",""), res.get("a_style","")

    # 本回合时间窗：(round-1)*15 → round*15
    t_start = (res["round"] - 1) * 15
    t_end = res["round"] * 15

    def rand_min():
        return random.randint(t_start + 1, t_end - 1)

    # 头部：风格披露 + 开场（不进时间轴）
    header = []
    # 【新增】中场休息提示
    if res["round"] == 4:
        h_avg = home.get("halftime_recover_avg", 0)
        a_avg = away.get("halftime_recover_avg", 0)
        if h_avg or a_avg:
            header.append(
                f"🍵 中场休息哨响！{home_name} 平均补充 +{h_avg} 体力，"
                f"{away_name} 补充 +{a_avg}，下半场即将开始！"
            )
    if show_style_intro:
        if home.get("venue_text"):
            header.append(home["venue_text"])
        if away.get("venue_text"):
            header.append(away["venue_text"])
        if hs_style in STYLE_INTRO_LINES:
            header.append(random.choice(STYLE_INTRO_LINES[hs_style]).format(name=home_name))
        if as_style in STYLE_INTRO_LINES:
            header.append(random.choice(STYLE_INTRO_LINES[as_style]).format(name=away_name))
    if res.get("h_command"):
        header.append(f"{home_name}｜{res['h_command']}")
    if res.get("a_command"):
        header.append(f"{away_name}｜{res['a_command']}")

    key = (ht, at) if (ht, at) in INTRO_TEMPLATES else "default"
    h_top_role = "fwd" if ht in ("attack","all_attack") else "def"
    a_top_role = "fwd" if at in ("attack","all_attack") else "def"
    h_dim = "sho" if h_top_role=="fwd" else "def"
    a_dim = "sho" if a_top_role=="fwd" else "def"
    header.append(random.choice(INTRO_TEMPLATES[key]).format(
        h_name=home_name, a_name=away_name,
        h_top=pick_top(home, h_dim, prefer_role=h_top_role),
        a_top=pick_top(away, a_dim, prefer_role=a_top_role),
    ))

    # 时间轴事件：(minute, text)
    timeline = []

    # 进球（使用预分配的射手和助攻）
    for ge in res.get("home_goals_ev", []):
        gt = pick_goal_type(ht, hs_style)
        line = random.choice(GOAL_TEMPLATES[gt]).format(scorer=ge["scorer"])
        if ge.get("assist"):
            line += f"（助攻: {ge['assist']}）"
        line += f" 【{home_name}】"
        timeline.append((rand_min(), line))
    for ge in res.get("away_goals_ev", []):
        gt = pick_goal_type(at, as_style)
        line = random.choice(GOAL_TEMPLATES[gt]).format(scorer=ge["scorer"])
        if ge.get("assist"):
            line += f"（助攻: {ge['assist']}）"
        line += f" 【{away_name}】"
        timeline.append((rand_min(), line))

    # 扑救 / 射失：从预分配的 miss_ev 中抽最多 2 位不同球员
    def add_shot_narratives(miss_ev, saves_count, opp_side_obj, team_tag):
        if not miss_ev: return
        picks = random.sample(miss_ev, min(2, len(miss_ev)))
        for i, ev in enumerate(picks):
            if i < saves_count:
                tmpl = random.choice(SAVE_TEMPLATES)
                line = tmpl.format(gk=pick_gk_name(opp_side_obj), shooter=ev["shooter"])
            else:
                tmpl = random.choice(MISS_TEMPLATES)
                line = tmpl.format(shooter=ev["shooter"])
            timeline.append((rand_min(), line))

    add_shot_narratives(res.get("home_miss_ev", []), res.get("a_saves", 0), away, home_name)
    add_shot_narratives(res.get("away_miss_ev", []), res.get("h_saves", 0), home, away_name)

    # 场面填充（0-0 或纯净回合）
    if res["home_goals"] + res["away_goals"] == 0 and random.random() < 0.7:
        p1 = pick_top(random.choice([home,away]), "phy", prefer_role="def")
        p2 = pick_top(random.choice([home,away]), "dri", prefer_role="atk_mid")
        line = random.choice(FILLER_EVENTS).format(
            name=random.choice([home_name, away_name]), p1=p1, p2=p2)
        timeline.append((rand_min(), line))

    # 突发事件
    h_remain = 11 - home.get("red_cards", 0)
    a_remain = 11 - away.get("red_cards", 0)
    # 中场事件（时间轴）
    for line in render_events(res.get("home_mid_evs", []), home_name, h_remain):
        timeline.append((rand_min(), line))
    for line in render_events(res.get("away_mid_evs", []), away_name, a_remain):
        timeline.append((rand_min(), line))
    for line in render_events(res.get("home_events", []), home_name, h_remain):
        timeline.append((rand_min(), line))
    for line in render_events(res.get("away_events", []), away_name, a_remain):
        timeline.append((rand_min(), line))

    # 换人（体能透支）：一般发生在回合末段
    for s in res["auto_subs"]:
        line = f"🔄 {s['off']} 体力透支下场，{s['on']} 登场（{s['slot']}）。"
        timeline.append((random.randint(t_end - 4, t_end - 1), line))

    # 按分钟排序，去重相邻分钟（避免"31′ 31′ 31′"堆叠）
    timeline.sort(key=lambda x: x[0])
    resolved = []
    last_min = -1
    for m, text in timeline:
        if m <= last_min:
            m = last_min + 1
        last_min = m
        resolved.append(f"{m}′  {text}")

    # 汇总
    events = list(header) + resolved

    tail = f"⏱ {t_end}′ · 控球 {int(res['possession']*100)}%/{100-int(res['possession']*100)}%"
    if res.get("h_red") or res.get("a_red"):
        tail += f" · 人数 {11-res.get('h_red',0)}vs{11-res.get('a_red',0)}"
    events.append(tail)
    return "\n".join(events)

def pick_gk_name(side):
    cards = side["cards_snapshot"]
    gid = side["starters"].get("GK")
    return cards[gid]["name"] if gid in cards else "门将"

def render_match_pitch(match, round_res):
    home, away = match["home"], match["away"]
    hn, an = match["home_name"], match["away_name"]
    layout_h = FORMATIONS[home["formation"]]
    layout_a = FORMATIONS[away["formation"]]

    # 布局参数：拉高球场，缩小卡片，扩大缩放
    PITCH_H = 1700          # 1400 → 1500
    Y_SCALE = 0.66
    Y_PAD = 180             # 75 → 180，把双方各推开 105px 留出比分牌区
    HALF_W, HALF_H = 50, 65   # 卡片 100×130

    slots_html = []
    # 主队：GK 在顶部（原 y=1120 最大 → 屏幕 yy 最小）
    for slot, (x, y) in layout_h.items():
        cid = home["starters"].get(slot)
        if not cid: continue
        c = home["cards_snapshot"][cid]
        yy = Y_PAD + int((1120 - y) * Y_SCALE)   # 翻转：GK→顶，锋线→中线
        stam = home["stamina"].get(cid, 100)
        slots_html.append(render_pitch_mini(c, slot, x-HALF_W, yy-HALF_H, stam, "home"))
    # 客队：GK 在底部
    for slot, (x, y) in layout_a.items():
        cid = away["starters"].get(slot)
        if not cid: continue
        c = away["cards_snapshot"][cid]
        yy = PITCH_H - Y_PAD - int((1120 - y) * Y_SCALE)
        xx = 900 - x    # 水平镜像
        stam = away["stamina"].get(cid, 100)
        slots_html.append(render_pitch_mini(c, slot, xx-HALF_W, yy-HALF_H, stam, "away"))

    ht_cn = TACTIC_CN[round_res["h_tactic"]]
    at_cn = TACTIC_CN[round_res["a_tactic"]]

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@700&display=swap" rel="stylesheet">
    <style>{MATCH_PITCH_CSS}</style></head><body>
    <div style="width:900px;background:#000;position:relative;">
        <div class="pitch match">
            <div class="center-line"></div><div class="center-circle"></div>
            <div class="penalty-top"></div><div class="penalty-bot"></div>
            <div class="scoreboard">
                <span class="team">{hn}</span>
                <span class="score">{home['goals']}</span>
                <span style="opacity:0.5;">:</span>
                <span class="score">{away['goals']}</span>
                <span class="team">{an}</span>
            </div>
            <div class="round-badge">R{round_res['round']} / 6 · {round_res['round']*15}′</div>
            <div class="tactic-tag" style="top:80px;left:30px;">{hn} · {ht_cn}</div>
            <div class="tactic-tag" style="bottom:30px;right:30px;">{an} · {at_cn}</div>
            {''.join(slots_html)}
        </div>
    </div></body></html>"""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':960,'height':1750}, device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector("body > div").screenshot(type='png')
        browser.close()
    fname = f"match_{match['id']}_r{round_res['round']}.png"
    with open(os.path.join(SAVE_DIR, fname), "wb") as f: f.write(img)
    return fname.replace(".png","")

RATINGS_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    background: linear-gradient(180deg, #0a0e1a 0%, #050810 100%);
    font-family: 'Bebas Neue', 'Noto Sans SC', sans-serif;
    color: #fff; padding: 0;
}
.wrap {
    width: 1000px; padding: 32px 28px;
    background: linear-gradient(180deg, #0d1424 0%, #05080f 100%);
    position: relative;
}
.wrap::before {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background:
        radial-gradient(ellipse at top, rgba(212,175,55,0.08), transparent 60%),
        repeating-linear-gradient(90deg, transparent 0 40px, rgba(255,255,255,0.02) 40px 41px);
}
.header {
    text-align: center; padding: 8px 0 20px;
    border-bottom: 2px solid #d4af37; margin-bottom: 24px;
    position: relative; z-index: 2;
}
.title {
    font-size: 34px; letter-spacing: 12px; color: #d4af37;
    text-shadow: 0 2px 8px rgba(212,175,55,0.3);
}
.score-row {
    display: flex; justify-content: center; align-items: center;
    gap: 32px; margin-top: 14px;
}
.score-row .team-name {
    font-size: 26px; letter-spacing: 3px; font-weight: 700;
    font-family: 'Noto Sans SC', sans-serif;
    color: #f0f0f0;
    max-width: 260px; overflow: hidden; text-overflow: ellipsis;
    white-space: nowrap;
}
.score-row .final-score {
    font-size: 56px; color: #d4af37; letter-spacing: 6px;
    text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}
.mvp-tag {
    display: inline-block; margin-top: 10px;
    background: linear-gradient(90deg, #d4af37, #b8912f);
    color: #1a1200; padding: 6px 24px; border-radius: 4px;
    font-size: 20px; letter-spacing: 4px; font-weight: 700;
    box-shadow: 0 4px 12px rgba(212,175,55,0.4);
}
.teams {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 20px; position: relative; z-index: 2;
}
.team-col {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 12px 10px;
}
.team-header {
    text-align: center; font-family: 'Noto Sans SC', sans-serif;
    font-size: 20px; font-weight: 700; letter-spacing: 4px;
    padding-bottom: 10px; margin-bottom: 10px;
    border-bottom: 1px solid rgba(212,175,55,0.4);
    color: #d4af37;
}
.rating-row {
    display: grid;
    grid-template-columns: 60px 34px 1fr auto;
    align-items: center;
    gap: 8px; padding: 8px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    transition: none;
}
.rating-row:last-child { border-bottom: none; }
.rating-num {
    font-size: 28px; font-family: 'Bebas Neue', sans-serif;
    text-align: center; letter-spacing: 1px;
    padding: 4px 0; border-radius: 4px;
    line-height: 1;
    text-shadow: 0 2px 3px rgba(0,0,0,0.4);
}
.r-elite { background: linear-gradient(135deg,#d4af37,#8a6d1c); color: #fff; }
.r-good  { background: linear-gradient(135deg,#22c55e,#158a3f); color: #fff; }
.r-ok    { background: linear-gradient(135deg,#3b82f6,#1e4b9a); color: #fff; }
.r-mid   { background: rgba(120,120,120,0.4); color: #eee; }
.r-poor  { background: linear-gradient(135deg,#ef4444,#8a1c1c); color: #fff; }
.pos-chip {
    text-align: center; font-size: 13px; letter-spacing: 1px;
    padding: 3px 0; background: rgba(255,255,255,0.08);
    border-radius: 3px; color: #cbd5e1;
    font-family: 'Bebas Neue', sans-serif;
}
.player-name {
    font-family: 'Noto Sans SC', sans-serif;
    font-size: 15px; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    color: #f5f5f5;
    letter-spacing: 0.5px;
}
.badges { font-size: 13px; color: #d4d4d8; white-space: nowrap; }
.badges span { margin-left: 3px; }
.b-goal { color: #fbbf24; }
.b-assist { color: #60a5fa; }
.b-save { color: #34d399; }
.b-yellow { color: #eab308; }
.b-red { color: #ef4444; }
.b-og { color: #f87171; }
"""

def rating_class(r):
    if r >= 9.0: return "r-elite"
    if r >= 8.0: return "r-good"
    if r >= 7.0: return "r-ok"
    if r >= 6.0: return "r-mid"
    return "r-poor"

def player_badges_html(p):
    parts = []
    if p["goals"]:   parts.append(f'<span class="b-goal">⚽×{p["goals"]}</span>')
    if p["assists"]: parts.append(f'<span class="b-assist">🎯×{p["assists"]}</span>')
    if p["saves"]:   parts.append(f'<span class="b-save">🧤×{p["saves"]}</span>')
    if p.get("own_goal"): parts.append(f'<span class="b-og">😱</span>')
    if p.get("blunder"):  parts.append(f'<span class="b-og">🥴</span>')
    if p["yellow"]: parts.append(f'<span class="b-yellow">🟨×{p["yellow"]}</span>')   # 独立判断
    if p["red"]:    parts.append(f'<span class="b-red">🟥</span>')                    # 独立判断
    return "".join(parts)

def render_ratings_image(match_id, home_name, away_name, score, winner, mvp, ratings,
                         referee=None):
    home_players = [p for p in ratings if p["team"] == home_name]
    away_players = [p for p in ratings if p["team"] == away_name]

    def render_col(players):
        rows = []
        for p in players:
            rows.append(f"""
            <div class="rating-row">
                <div class="rating-num {rating_class(p['rating'])}">{p['rating']:.1f}</div>
                <div class="pos-chip">{p['position']}</div>
                <div class="player-name">{p['name']}</div>
                <div class="badges">{player_badges_html(p)}</div>
            </div>""")
        return "".join(rows)

    winner_line = f"🏆 {winner} 获胜" if winner != "平局" else "🤝 战成平局"
    referee_line = ""
    if referee:
        referee_line = (f'<div style="margin-top:10px;padding:8px 14px;border-radius:6px;'
                        f'background:rgba(125,211,252,0.08);color:#bae6fd;font-size:13px;'
                        f'letter-spacing:2px;">⚖️ 裁判评分 {referee["rating"]}/10 · '
                        f'{referee["label"]} · {referee["summary"]}</div>')

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap" rel="stylesheet">
    <style>{RATINGS_CSS}</style></head><body>
    <div class="wrap">
        <div class="header">
            <div class="title">FULL TIME · 球员评分</div>
            <div class="score-row">
                <div class="team-name" style="text-align:right;">{home_name}</div>
                <div class="final-score">{score}</div>
                <div class="team-name" style="text-align:left;">{away_name}</div>
            </div>
            <div style="margin-top:12px;font-size:15px;letter-spacing:3px;color:#cbd5e1;">
                {winner_line}
            </div>
            <div class="mvp-tag">⭐ MVP · {mvp}</div>
            {referee_line}
        </div>
        <div class="teams">
            <div class="team-col">
                <div class="team-header">{home_name}</div>
                {render_col(home_players)}
            </div>
            <div class="team-col">
                <div class="team-header">{away_name}</div>
                {render_col(away_players)}
            </div>
        </div>
    </div>
    </body></html>"""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':1050,'height':1400}, device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector(".wrap").screenshot(type='png')
        browser.close()
    fname = f"ratings_{match_id}.png"
    with open(os.path.join(SAVE_DIR, fname), "wb") as f: f.write(img)
    return fname.replace(".png","")

def render_post_match_image(match_id, home_name, away_name, score, events, news):
    def lines_html(text, empty):
        values = [line.strip() for line in (text or "").splitlines() if line.strip()]
        if not values: values = [empty]
        return "".join(f"<div class='line'>{line}</div>" for line in values)
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    *{{box-sizing:border-box}} body{{margin:0;background:#070b14;color:#eef2ff;
    font-family:'Microsoft YaHei','Noto Sans SC',sans-serif}} .post{{width:900px;padding:30px;
    background:linear-gradient(160deg,#10192b,#050810);border:2px solid #334155}}
    .title{{font-size:30px;text-align:center;color:#d4af37;letter-spacing:5px}}
    .score{{text-align:center;font-size:22px;margin:10px 0 24px;color:#f8fafc}}
    .box{{margin-top:16px;padding:18px;border-radius:10px;background:rgba(255,255,255,.045);
    border:1px solid rgba(255,255,255,.10)}} .head{{font-size:18px;color:#7dd3fc;
    font-weight:bold;letter-spacing:3px;margin-bottom:10px}} .line{{font-size:15px;
    line-height:1.75;padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.07)}}
    .line:last-child{{border-bottom:0}}</style></head><body><div class="post">
    <div class="title">POST MATCH · 赛后简报</div>
    <div class="score">{home_name}　{score}　{away_name}</div>
    <div class="box"><div class="head">📋 赛后动态</div>{lines_html(events,'本场没有额外动态')}</div>
    <div class="box"><div class="head">📰 新闻头条</div>{lines_html(news,'媒体暂未发布特别报道')}</div>
    </div></body></html>"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':960,'height':1200}, device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector(".post").screenshot(type='png')
        browser.close()
    fname = f"post_{match_id}.png"
    with open(os.path.join(SAVE_DIR, fname), "wb") as f: f.write(img)
    return fname.replace(".png","")

LEADERBOARD_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: linear-gradient(180deg, #0a0e1a 0%, #050810 100%);
    font-family: 'Bebas Neue','Noto Sans SC',sans-serif; color: #fff; }
.lb { width: 900px; padding: 32px 28px;
    background: linear-gradient(180deg, #0d1424 0%, #05080f 100%); }
.lb-header { text-align: center; padding: 10px 0 22px;
    border-bottom: 2px solid #d4af37; margin-bottom: 24px; }
.lb-title { font-size: 38px; letter-spacing: 14px; color: #d4af37;
    text-shadow: 0 2px 12px rgba(212,175,55,0.4); }
.lb-subtitle { font-size: 14px; letter-spacing: 4px;
    color: rgba(255,255,255,0.5); margin-top: 10px; }
.lb-headrow, .lb-row {
    display: grid; grid-template-columns: 60px 80px 1fr 100px 80px 80px 110px;
    align-items: center; gap: 10px; padding: 10px 14px;
}
.lb-headrow { font-size: 11px; letter-spacing: 3px;
    color: rgba(255,255,255,0.4); text-align: center; margin-bottom: 6px; }
.lb-headrow .h-name { text-align: left; }
.lb-row { border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.02); margin-bottom: 5px; border-radius: 6px; }
.lb-row.top1 { background: linear-gradient(90deg,rgba(212,175,55,0.20),rgba(212,175,55,0.02));
    border: 1px solid rgba(212,175,55,0.5); }
.lb-row.top2 { background: linear-gradient(90deg,rgba(200,200,200,0.15),rgba(200,200,200,0.02)); }
.lb-row.top3 { background: linear-gradient(90deg,rgba(205,127,50,0.18),rgba(205,127,50,0.02)); }
.lb-rank { font-size: 30px; text-align: center; letter-spacing: 1px;
    line-height: 1; color: #f5f5f5; }
.top1 .lb-rank { color: #d4af37; }
.top2 .lb-rank { color: #d0d0d0; } .top3 .lb-rank { color: #cd7f32; }
.lb-tier { padding: 5px 4px; border-radius: 4px; text-align: center;
    font-size: 11px; letter-spacing: 2px; font-weight: 700; }
.t-diamond { background: linear-gradient(135deg,#67e8f9,#0891b2); color: #fff; }
.t-platinum { background: linear-gradient(135deg,#e5e7eb,#94a3b8); color: #1f2937; }
.t-gold { background: linear-gradient(135deg,#fbbf24,#b45309); color: #fff; }
.t-silver { background: linear-gradient(135deg,#d1d5db,#71717a); color: #fff; }
.t-bronze { background: linear-gradient(135deg,#a3734b,#684221); color: #fff; }
.lb-name { font-family: 'Noto Sans SC',sans-serif; font-size: 19px; font-weight: 700;
    color: #f5f5f5; letter-spacing: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-elo { font-size: 26px; text-align: center; color: #d4af37;
    font-weight: 700; letter-spacing: 1px; }
.lb-cell { text-align: center; font-family: 'Bebas Neue',sans-serif;
    font-size: 20px; color: #f5f5f5; letter-spacing: 1px; }
.lb-wdl { text-align: center; font-size: 16px; letter-spacing: 1px; }
.lb-wdl .w { color: #22c55e; } .lb-wdl .d { color: #a1a1aa; } .lb-wdl .l { color: #ef4444; }
"""

def render_leaderboard_image(profs):
    rows = []
    for i, p in enumerate(profs):
        tier_cls, tier_cn = elo_to_tier(p["elo"])
        rank_cls = f"top{i+1}" if i < 3 else ""
        m = p["matches"]
        wr = (p["wins"] / m * 100) if m > 0 else 0
        display = p.get("team_name") or f"玩家{p['user_key'][-4:]}"
        rows.append(f"""
        <div class="lb-row {rank_cls}">
            <div class="lb-rank">{i+1}</div>
            <div class="lb-tier {tier_cls}">{tier_cn}</div>
            <div class="lb-name">{display}</div>
            <div class="lb-elo">{p["elo"]}</div>
            <div class="lb-cell">{m}</div>
            <div class="lb-cell">{wr:.0f}%</div>
            <div class="lb-wdl"><span class="w">{p["wins"]}</span>-<span class="d">{p["draws"]}</span>-<span class="l">{p["losses"]}</span></div>
        </div>""")
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap" rel="stylesheet">
    <style>{LEADERBOARD_CSS}</style></head><body>
    <div class="lb">
        <div class="lb-header">
            <div class="lb-title">LEADERBOARD</div>
            <div class="lb-subtitle">FUT · 全服 ELO 排行榜</div>
        </div>
        <div class="lb-headrow">
            <div>#</div><div>段位</div><div class="h-name">队伍</div>
            <div>ELO</div><div>场次</div><div>胜率</div><div>W-D-L</div>
        </div>
        {''.join(rows)}
    </div></body></html>"""
    height = max(400, 220 + len(profs) * 66)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':960,'height':height}, device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector(".lb").screenshot(type='png')
        browser.close()
    fname = f"leaderboard_{int(datetime.datetime.now().timestamp())}"
    with open(os.path.join(SAVE_DIR, f"{fname}.png"), "wb") as f: f.write(img)
    return fname


PROFILE_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: linear-gradient(180deg, #0a0e1a 0%, #050810 100%);
    font-family: 'Bebas Neue','Noto Sans SC',sans-serif; color: #fff; }
.pr { width: 900px; padding: 30px 28px;
    background: linear-gradient(180deg, #0d1424 0%, #05080f 100%); }
.pr-top { display: grid; grid-template-columns: 1fr 300px;
    gap: 24px; padding-bottom: 22px;
    border-bottom: 2px solid #d4af37; margin-bottom: 22px; }
.team-name { font-family: 'Noto Sans SC',sans-serif; font-size: 42px;
    font-weight: 900; color: #f5f5f5; letter-spacing: 4px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.6); line-height: 1.1; }
.team-sub { font-size: 14px; letter-spacing: 6px;
    color: rgba(255,255,255,0.5); margin-top: 8px; }
.pr-rank-row { margin-top: 14px; display: flex; align-items: center; gap: 12px; }
.pr-rank-badge { padding: 6px 14px; border-radius: 5px;
    font-size: 19px; letter-spacing: 4px; font-weight: 700; }
.t-diamond{background:linear-gradient(135deg,#67e8f9,#0891b2);color:#fff;}
.t-platinum{background:linear-gradient(135deg,#e5e7eb,#94a3b8);color:#1f2937;}
.t-gold{background:linear-gradient(135deg,#fbbf24,#b45309);color:#fff;}
.t-silver{background:linear-gradient(135deg,#d1d5db,#71717a);color:#fff;}
.t-bronze{background:linear-gradient(135deg,#a3734b,#684221);color:#fff;}
.pr-rank-num { font-size: 13px; letter-spacing: 2px; color: rgba(255,255,255,0.55); }
.pr-elo-block { text-align: center;
    background: rgba(212,175,55,0.08);
    border: 2px solid rgba(212,175,55,0.4);
    border-radius: 10px; padding: 18px; }
.pr-elo-num { font-size: 72px; letter-spacing: 2px;
    color: #d4af37; line-height: 1;
    text-shadow: 0 3px 12px rgba(212,175,55,0.4); }
.pr-elo-lbl { font-size: 13px; letter-spacing: 5px;
    color: rgba(255,255,255,0.6); margin-top: 4px; }
.pr-elo-peak { font-size: 11px; letter-spacing: 2px;
    color: rgba(255,255,255,0.4); margin-top: 8px; }
.pr-stats { display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 10px; margin-bottom: 20px; }
.pr-stat { background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 14px 8px; text-align: center; }
.pr-stat-num { font-size: 30px; color: #f5f5f5;
    line-height: 1; letter-spacing: 1px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5); }
.pr-stat-lbl { font-size: 10px; letter-spacing: 3px;
    color: rgba(255,255,255,0.5); margin-top: 8px; }
.pr-stat.big-w .pr-stat-num { color: #22c55e; }
.pr-stat.big-l .pr-stat-num { color: #ef4444; }
.pr-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.pr-sec { background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px; padding: 14px 16px; }
.pr-sec-title { font-family: 'Noto Sans SC',sans-serif;
    font-size: 14px; font-weight: 700; letter-spacing: 4px;
    color: #d4af37; padding-bottom: 8px; margin-bottom: 10px;
    border-bottom: 1px solid rgba(212,175,55,0.3); }
.pr-p-row { display: grid; grid-template-columns: 32px 1fr auto;
    align-items: center; gap: 8px; padding: 6px 2px;
    border-bottom: 1px dashed rgba(255,255,255,0.05); font-size: 13px; }
.pr-p-row:last-child { border: none; }
.pr-p-rank { text-align: center; font-family: 'Bebas Neue',sans-serif;
    font-size: 20px; color: #d4af37; }
.pr-p-name { font-family: 'Noto Sans SC',sans-serif;
    color: #f5f5f5; font-weight: 700;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pr-p-val { font-family: 'Bebas Neue',sans-serif;
    font-size: 18px; color: #fbbf24; letter-spacing: 1px; }
.pr-fav-row { display: flex; justify-content: space-between;
    align-items: center; padding: 6px 2px;
    border-bottom: 1px dashed rgba(255,255,255,0.05); font-size: 13px; }
.pr-fav-row:last-child { border: none; }
.pr-fav-name { font-family: 'Noto Sans SC',sans-serif; color: #f5f5f5; font-weight: 700; }
.pr-fav-count { color: #7dd3fc; font-family: 'Bebas Neue',sans-serif; font-size: 17px; }
.pr-history { display: flex; gap: 6px; flex-wrap: wrap; }
.pr-h-cell { width: 30px; height: 30px; border-radius: 4px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 900; color: #fff; }
.pr-h-w { background: #22c55e; } .pr-h-d { background: #71717a; } .pr-h-l { background: #ef4444; }
.pr-empty { color: rgba(255,255,255,0.3); text-align: center;
    padding: 16px; font-size: 12px; letter-spacing: 3px; }
.pr-honor-row { display:flex; justify-content:space-between;
    padding:6px 4px; border-bottom:1px dashed rgba(255,255,255,0.05);
    font-size:13px; }
.pr-honor-row:last-child { border:none; }
.pr-honor-tag { color:#d4af37; font-weight:700; font-family:'Noto Sans SC'; }
.pr-honor-item { color:#f5f5f5; font-family:'Noto Sans SC'; }
.pr-honor-empty { color:rgba(255,255,255,0.3); text-align:center;
    padding:10px; font-size:12px; letter-spacing:3px; }
.pr-tier-badge { display:inline-block; padding:2px 8px; border-radius:3px;
    font-size:11px; letter-spacing:1px; margin-right:6px; }
"""

def render_profile_image(prof, rank, total):
    tier_cls, tier_cn = elo_to_tier(prof["elo"])
    m = prof["matches"]
    wr = (prof["wins"] / m * 100) if m > 0 else 0

    players = list(prof.get("players", {}).values())
    top_scorers = sorted([p for p in players if p.get("goals",0)>0],
                         key=lambda x: -x["goals"])[:5]
    top_mvp = sorted([p for p in players if p.get("mvp",0)>0],
                     key=lambda x: -x["mvp"])[:5]
    top_saves = sorted([p for p in players if p.get("saves",0)>0],
                       key=lambda x: -x["saves"])[:5]
    top_assists = sorted([p for p in players if p.get("assists",0)>0],
                         key=lambda x: -x["assists"])[:5]

    formations = sorted(prof.get("formations", {}).items(), key=lambda x:-x[1])[:5]
    styles = sorted(prof.get("styles", {}).items(), key=lambda x:-x[1])[:5]
    tactics = sorted(prof.get("tactics", {}).items(), key=lambda x:-x[1])[:5]

    def pl_list(items, k, icon):
        if not items: return '<div class="pr-empty">— 无数据 —</div>'
        rows = []
        for i, p in enumerate(items):
            rows.append(f'<div class="pr-p-row"><div class="pr-p-rank">{i+1}</div>'
                        f'<div class="pr-p-name">{p["name"]}</div>'
                        f'<div class="pr-p-val">{icon}{p[k]}</div></div>')
        return "".join(rows)

    def fav_list(items, cn_map=None):
        if not items: return '<div class="pr-empty">— 无数据 —</div>'
        rows = []
        for name, cnt in items:
            display = cn_map.get(name, name) if cn_map else name
            rows.append(f'<div class="pr-fav-row"><div class="pr-fav-name">{display}</div>'
                        f'<div class="pr-fav-count">×{cnt}</div></div>')
        return "".join(rows)

    hist_cells = []
    for h in prof.get("history", [])[:10]:
        r = h.get("result", "?")
        cls = "pr-h-w" if r=="W" else ("pr-h-l" if r=="L" else "pr-h-d")
        hist_cells.append(f'<div class="pr-h-cell {cls}">{r}</div>')
    hist_html = "".join(hist_cells) or '<div class="pr-empty">— 无数据 —</div>'

    team_name = prof.get("team_name") or f"玩家{prof['user_key'][-4:]}"

        # 荣誉室
    honors = prof.get("honors", {"league":[], "cup":[], "best_league_rank":None, "best_cup":None})
    lg_champs = [h for h in honors.get("league",[]) if h["rank"]==1]
    cup_champs = [h for h in honors.get("cup",[]) if h.get("user_result")=="冠军"]
    cup_semis = [h for h in honors.get("cup",[]) if h.get("user_result") in ("半决赛","决赛","冠军")]

    def _lg_champ_row():
        if not lg_champs: return '<div class="pr-honor-empty">— 尚未获得联赛冠军 —</div>'
        return "".join(
            f'<div class="pr-honor-row">'
            f'<span class="pr-honor-tag">'
            f'<span class="pr-tier-badge" style="background:{LEAGUE_TIERS[h["tier"]]["color"]};color:#000;">{LEAGUE_TIERS[h["tier"]]["short"]}</span>'
            f'第 {h["season"]} 届</span>'
            f'<span class="pr-honor-item">🏆 冠军</span></div>' for h in lg_champs)

    def _cup_champ_row():
        if not cup_champs: return '<div class="pr-honor-empty">— 尚未获得杯赛冠军 —</div>'
        return "".join(
            f'<div class="pr-honor-row">'
            f'<span class="pr-honor-tag">哈斯塔第 {h["season"]} 届</span>'
            f'<span class="pr-honor-item">👑 冠军</span></div>' for h in cup_champs)

    best_lg = honors.get("best_league_rank")
    best_cup = honors.get("best_cup")
    best_lg_txt = (f'{LEAGUE_TIERS[best_lg["tier"]]["full"]} 第 {best_lg["rank"]} 名 (第 {best_lg["season"]} 届)'
                    if best_lg else "— 无 —")
    best_cup_txt = (f'{best_cup["user_result"]} (第 {best_cup["season"]} 届)'
                     if best_cup else "— 无 —")

    tier_cur = prof.get("current_league_tier")
    cur_league_txt = LEAGUE_TIERS[tier_cur]["full"] if tier_cur else "尚未参加"

    honor_html = f'''
    <div class="pr-sec">
        <div class="pr-sec-title">🏆 荣誉室</div>
        <div class="pr-honor-row">
            <span class="pr-honor-tag">当前联赛级别</span>
            <span class="pr-honor-item">{cur_league_txt}</span>
        </div>
        <div class="pr-honor-row">
            <span class="pr-honor-tag">最佳联赛战绩</span>
            <span class="pr-honor-item">{best_lg_txt}</span>
        </div>
        <div class="pr-honor-row">
            <span class="pr-honor-tag">最佳杯赛战绩</span>
            <span class="pr-honor-item">{best_cup_txt}</span>
        </div>
        <div class="pr-honor-row">
            <span class="pr-honor-tag">联赛冠军 · {len(lg_champs)} 座</span>
            <span class="pr-honor-item">{len(honors.get("league",[]))} 届参赛</span>
        </div>
        <div class="pr-honor-row">
            <span class="pr-honor-tag">杯赛冠军 · {len(cup_champs)} 座</span>
            <span class="pr-honor-item">{len(honors.get("cup",[]))} 届参赛</span>
        </div>
    </div>
    <div class="pr-cols">
        <div class="pr-sec"><div class="pr-sec-title">🏅 历届联赛冠军</div>{_lg_champ_row()}</div>
        <div class="pr-sec"><div class="pr-sec-title">🥇 历届杯赛冠军</div>{_cup_champ_row()}</div>
    </div>
    '''

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap" rel="stylesheet">
    <style>{PROFILE_CSS}</style></head><body>
    <div class="pr">
        <div class="pr-top">
            <div>
                <div class="team-name">{team_name}</div>
                <div class="team-sub">TEAM PROFILE · 战队档案</div>
                <div class="pr-rank-row">
                    <div class="pr-rank-badge {tier_cls}">{tier_cn}</div>
                    <div class="pr-rank-num">全服 #{rank or '-'} / {total}</div>
                </div>
            </div>
            <div class="pr-elo-block">
                <div class="pr-elo-num">{prof["elo"]}</div>
                <div class="pr-elo-lbl">ELO</div>
                <div class="pr-elo-peak">🏆 最高 {prof.get("peak_elo", prof["elo"])}</div>
            </div>
        </div>

        <div class="pr-stats">
            <div class="pr-stat"><div class="pr-stat-num">{m}</div><div class="pr-stat-lbl">总场次</div></div>
            <div class="pr-stat big-w"><div class="pr-stat-num">{prof["wins"]}</div><div class="pr-stat-lbl">胜</div></div>
            <div class="pr-stat"><div class="pr-stat-num">{prof["draws"]}</div><div class="pr-stat-lbl">平</div></div>
            <div class="pr-stat big-l"><div class="pr-stat-num">{prof["losses"]}</div><div class="pr-stat-lbl">负</div></div>
            <div class="pr-stat"><div class="pr-stat-num">{wr:.1f}%</div><div class="pr-stat-lbl">胜率</div></div>
            <div class="pr-stat"><div class="pr-stat-num">{prof["goals_for"]}</div><div class="pr-stat-lbl">进球</div></div>
            <div class="pr-stat"><div class="pr-stat-num">{prof["goals_against"]}</div><div class="pr-stat-lbl">失球</div></div>
            <div class="pr-stat"><div class="pr-stat-num">{prof.get("win_streak",0)}</div><div class="pr-stat-lbl">最长连胜</div></div>
        </div>

        <div class="pr-sec">
            <div class="pr-sec-title">📈 最近 10 场</div>
            <div class="pr-history">{hist_html}</div>
        </div>

        <div class="pr-cols">
            <div class="pr-sec"><div class="pr-sec-title">⚽ 最佳射手</div>{pl_list(top_scorers,"goals","⚽")}</div>
            <div class="pr-sec"><div class="pr-sec-title">⭐ MVP 榜</div>{pl_list(top_mvp,"mvp","⭐")}</div>
        </div>
        <div class="pr-cols">
            <div class="pr-sec"><div class="pr-sec-title">🎯 最佳助攻</div>{pl_list(top_assists,"assists","🎯")}</div>
            <div class="pr-sec"><div class="pr-sec-title">🧤 最佳门将</div>{pl_list(top_saves,"saves","🧤")}</div>
        </div>
        <div class="pr-cols">
            <div class="pr-sec"><div class="pr-sec-title">🎨 最爱阵型</div>{fav_list(formations)}</div>
            <div class="pr-sec"><div class="pr-sec-title">⚙️ 最爱风格</div>{fav_list(styles, STYLE_KEY_TO_CN)}</div>
        </div>
        {honor_html}
        <div class="pr-sec">
            <div class="pr-sec-title">🎯 最爱战术</div>
            {fav_list(tactics, TACTIC_CN)}
        </div>
    </div></body></html>"""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':960,'height':2200}, device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector(".pr").screenshot(type='png')
        browser.close()
    fname = f"profile_{prof['user_key']}_{int(datetime.datetime.now().timestamp())}"
    with open(os.path.join(SAVE_DIR, f"{fname}.png"), "wb") as f: f.write(img)
    return fname

def render_pitch_mini(c, slot, x, y, stamina, side_class):
    theme = CARD_THEMES[c["tier_name"]]
    avatar = f'<img src="{c["avatar"]}" />' if c.get("avatar") else SILHOUETTE_SVG

    # 位置适配 OVR × 体能系数 = 实时表现
    # 注意：初始随机 form 不进入显示，只有体能衰减会拉低
    base_ovr = position_ovr(c, slot)
    factor = stamina_factor(stamina)
    display_ovr = max(30, int(round(base_ovr * factor)))

    extra_class = ""
    tn = c["tier_name"]
    if tn == "TOTW": extra_class = " rare totw"
    elif tn == "HERO": extra_class = " rare hero"
    elif tn == "RISING": extra_class = " rare rising"
    elif tn == "NOVA": extra_class = " rare nova"
    elif tn == "FOCUS": extra_class = " rare focus"
    elif tn == "TALENT": extra_class = " rare talent"
    elif tn == "UTIL": extra_class = " rare util"
    elif c.get("is_rare"): extra_class = " rare"

    # 体能预警配色
    ovr_class = ""
    if stamina < 30: ovr_class = " ovr-critical"
    elif stamina < 50: ovr_class = " ovr-warning"

    # 血条颜色：绿/黄/红
    bar_color = "#22c55e" if stamina >= 60 else "#eab308" if stamina >= 30 else "#ef4444"

    return f"""
    <div class="slot-match" style="left:{x}px;top:{y}px;">
        <div class="mini{extra_class}" style="background:{theme['bg']};color:{theme['text']};">
            <div class="mini-ovr{ovr_class}">{display_ovr}</div>
            <div class="mini-pos">{slot}</div>
            <div class="mini-avatar">{avatar}</div>
            <div class="mini-name">{c['name']}</div>
            <div class="stamina-bar"><div style="width:{stamina}%;background:{bar_color};"></div></div>
        </div>
    </div>"""

@app.route('/generate_fut')
def generate_fut():
    url = request.args.get('url')
    user_key = request.args.get('user_key', '')
    role = request.args.get('role', 'player')   # 新增：player | gk
    if not url: return jsonify({"status": "error", "msg": "Missing url"})
    temp_file = f"temp_{datetime.datetime.now().timestamp()}.xlsx"
    try:
        resp = requests.get(url, timeout=15)
        with open(temp_file, "wb") as f: f.write(resp.content)
        attrs = parse_coc_excel(temp_file)
        is_gk = (role == "gk")
        # 先算 stats
        if is_gk:
            stats = calculate_gk(attrs)
        else:
            stats = calculate_fut(attrs)
        # 再落盘
        if user_key:
            save_card_meta(user_key, attrs, stats, is_gk)
        t_cfg = CARD_THEMES[stats["tier_name"]]
        foil_class = ""
        if stats["is_rare"]:
            foil_class = " rare-foil"
        tn = stats["tier_name"]
        if tn == "HERO": foil_class += " hero-foil"
        elif tn == "RISING": foil_class += " rising-foil"
        elif tn == "NOVA": foil_class += " nova-foil"
        elif tn == "FOCUS": foil_class += " focus-foil"
        elif tn == "TALENT": foil_class += " talent-foil"
        elif tn == "UTIL": foil_class += " util-foil"
        if attrs.get("avatar"):
            portrait_html = f'<img src="{attrs["avatar"]}" class="fut-avatar" />'
        else:
            portrait_html = SILHOUETTE_SVG
        # 六维网格按 role 切换
        if role == "gk":
            stat_pairs = [(stats['div'], 'DIV'), (stats['ref'], 'REF'),
                          (stats['han'], 'HAN'), (stats['spd'], 'SPD'),
                          (stats['kic'], 'KIC'), (stats['pos'], 'POS')]
        else:
            stat_pairs = [(stats['pac'], 'PAC'), (stats['dri'], 'DRI'),
                          (stats['sho'], 'SHO'), (stats['def'], 'DEF'),
                          (stats['pas'], 'PAS'), (stats['phy'], 'PHY')]
        stats_html = "".join(
            f'<div class="fut-stat"><span class="fut-stat-num">{v}</span>'
            f'<span class="fut-stat-label">{lbl}</span></div>'
            for v, lbl in stat_pairs
        )
        html_content = f"""
        <div class="fut-card{foil_class}">
            <div class="fut-watermark">FUT</div>
            <div class="fut-inner">
                <div class="fut-top">
                    <div class="fut-meta">
                        <div class="fut-ovr">{stats['ovr']}</div>
                        <div class="fut-divider"></div>
                        <div class="fut-pos">{stats['position']}</div>
                    </div>
                    <div class="fut-portrait">{portrait_html}</div>
                </div>
                <div class="fut-name-box">
                    <div class="fut-name">{attrs['name']}</div>
                    <div class="fut-prof">{attrs['profession']} · AGE {attrs['age']}</div>
                </div>
                <div class="fut-hr"></div>
                <div class="fut-stats">{stats_html}</div>
            </div>
        </div>
        """
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
            page = browser.new_page(viewport={'width': 800, 'height': 800}, device_scale_factor=2)
            css = FUT_CSS.format(**t_cfg)
            page.set_content(f"<html><head><style>{css}</style></head><body>{html_content}</body></html>", wait_until="networkidle")
            img_bytes = page.query_selector(".fut-card").screenshot(type='png', omit_background=True)
            browser.close()
        if os.path.exists(temp_file): os.remove(temp_file)
        safe_name = sanitize_filename(attrs['name'])
        suffix = "_GK" if role == "gk" else "_FUT"
        title = f"{safe_name}{suffix}"
        with open(os.path.join(SAVE_DIR, f"{title}.png"), "wb") as f: f.write(img_bytes)
        tier_map = {
            "Bronze":"青铜", "Silver":"白银", "Gold":"黄金", "Icon":"传奇",
            "TOTW":"周最佳", "HERO":"赛季热度", "RISING":"赛季新星",
            "NOVA":"超新星", "FOCUS":"转会焦点", "TALENT":"怪异天赋",
            "UTIL":"客串大师",
        }
        tier_base = stats['tier_name'].replace("Rare","").strip()
        tier_cn = tier_map.get(tier_base, tier_base)
        if "Rare" in stats['tier_name']:
            tier_cn += "闪卡"
        return jsonify({"status": "ok", "name": title, "ovr": stats['ovr'], "tier": tier_cn})
    except Exception as e:
        if os.path.exists(temp_file): os.remove(temp_file)
        return jsonify({"status": "error", "msg": str(e)})

_RECRUIT_NAMES = _AI_NAMES["fwd"] + _AI_NAMES["mid"] + _AI_NAMES["def"] + _AI_NAMES["gk"]
_RECRUIT_PROFESSIONS = ["自由球员","青训学徒","流浪球星","街头球王","侦探","私家侦探","考古学者","记者"]

def _spawn_recruit_card(user_key, base_ovr=70, force_gk=None):
    """生成招募卡 meta（不写主卡池）"""
    is_gk = force_gk if force_gk is not None else (random.random() < 0.15)
    role_pool = "gk" if is_gk else random.choice(["fwd","mid","def"])
    name = truncate_name(random.choice(_AI_NAMES[role_pool]) +
                          random.choice(["·II","","·III","·小","·二世","",""]))
    if is_gk:
        stats = {k: max(30,min(99, base_ovr + random.randint(-5,5)))
                 for k in ("div","han","kic","ref","spd","pos")}
    else:
        arch = random.choice(["speed","power","tech","balanced"])
        biases = {"speed":{"pac":8,"dri":4,"phy":-4},"power":{"phy":8,"def":4,"pac":-4},
                  "tech":{"pas":6,"dri":8,"phy":-4},"balanced":{}}
        stats = {k: max(30,min(99, base_ovr + biases[arch].get(k,0) + random.randint(-5,5)))
                 for k in ("pac","sho","pas","dri","def","phy")}
    ovr = int(sum(stats.values())/6)
    tier = "Icon" if ovr>=85 else ("Gold" if ovr>=75 else ("Silver" if ovr>=65 else "Bronze"))
    if random.random() < 0.15 and tier in ("Silver","Gold"):
        tier += " Rare"
    pos = "GK" if is_gk else determine_position(
        stats["pac"],stats["sho"],stats["pas"],stats["dri"],stats["def"],stats["phy"],name)
    return {"card_id": f"rec_{sanitize_filename(name)}_{random.randint(1000,9999)}",
            "name":name,"profession":random.choice(_RECRUIT_PROFESSIONS),
            "age":str(random.randint(19,32)),"avatar":None,
            "stats":stats,"ovr":ovr,"position":pos,
            "tier_name":tier,"is_rare":"Rare" in tier,
            "is_gk":is_gk,"career_only":True,
            "created_at":datetime.datetime.now().isoformat()}

def _add_recruit_to_career(career, meta):
    career.setdefault("extra_cards", {})[meta["card_id"]] = meta

def recruit_random_player(user_key, career, tier_boost=0):
    base = random.randint(60, 72 + tier_boost)
    meta = _spawn_recruit_card(user_key, base_ovr=base)
    _add_recruit_to_career(career, meta)
    return meta

def _fut_card_html(card):
    tier_name = card.get("tier_name", "Gold")
    foil_class = " rare-foil" if card.get("is_rare") else ""
    special_foils = {
        "HERO": " hero-foil", "RISING": " rising-foil", "NOVA": " nova-foil",
        "FOCUS": " focus-foil", "TALENT": " talent-foil", "UTIL": " util-foil",
    }
    foil_class += special_foils.get(tier_name, "")
    portrait_html = (f'<img src="{card["avatar"]}" class="fut-avatar" />'
                     if card.get("avatar") else SILHOUETTE_SVG)
    stats = card.get("stats", {})
    if card.get("is_gk") or card.get("position") == "GK":
        stat_pairs = [(stats.get("div", 0), "DIV"), (stats.get("ref", 0), "REF"),
                      (stats.get("han", 0), "HAN"), (stats.get("spd", 0), "SPD"),
                      (stats.get("kic", 0), "KIC"), (stats.get("pos", 0), "POS")]
    else:
        stat_pairs = [(stats.get("pac", 0), "PAC"), (stats.get("dri", 0), "DRI"),
                      (stats.get("sho", 0), "SHO"), (stats.get("def", 0), "DEF"),
                      (stats.get("pas", 0), "PAS"), (stats.get("phy", 0), "PHY")]
    stats_html = "".join(
        f'<div class="fut-stat"><span class="fut-stat-num">{value}</span>'
        f'<span class="fut-stat-label">{label}</span></div>'
        for value, label in stat_pairs
    )
    return f"""
    <div class="fut-card{foil_class}">
        <div class="fut-watermark">FUT</div>
        <div class="fut-inner">
            <div class="fut-top">
                <div class="fut-meta">
                    <div class="fut-ovr">{card.get('ovr', 0)}</div>
                    <div class="fut-divider"></div>
                    <div class="fut-pos">{card.get('position', '?')}</div>
                </div>
                <div class="fut-portrait">{portrait_html}</div>
            </div>
            <div class="fut-name-box">
                <div class="fut-name">{card.get('name', '未知球员')}</div>
                <div class="fut-prof">{card.get('profession', '球员')} · AGE {card.get('age', '?')}</div>
            </div>
            <div class="fut-hr"></div>
            <div class="fut-stats">{stats_html}</div>
        </div>
    </div>
    """

def render_recruit_candidate_cards(candidates):
    """根据其他玩家的卡片元数据重绘候选卡面，返回可供 /get_img 读取的图片名。"""
    render_items = []
    for index, candidate in enumerate(candidates, 1):
        source = load_cards(candidate["owner"]).get(candidate["card_id"])
        if not source:
            return None, "候选卡池在生成卡面时发生变化，请重新发起定向招募"
        render_items.append((index, candidate, source))

    stamp = int(datetime.datetime.now().timestamp() * 1000)
    image_names = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-dev-shm-usage'])
        try:
            for index, candidate, source in render_items:
                theme = CARD_THEMES.get(source.get("tier_name"), CARD_THEMES["Gold"])
                page = browser.new_page(viewport={'width': 800, 'height': 800}, device_scale_factor=2)
                try:
                    page.set_content(
                        f"<html><head><style>{FUT_CSS.format(**theme)}</style></head>"
                        f"<body>{_fut_card_html(source)}</body></html>",
                        wait_until="networkidle"
                    )
                    img_bytes = page.query_selector(".fut-card").screenshot(
                        type='png', omit_background=True)
                finally:
                    page.close()
                image_name = (f"recruit_{stamp}_{index}_"
                              f"{sanitize_filename(candidate.get('name', 'player'))}")
                with open(os.path.join(SAVE_DIR, f"{image_name}.png"), "wb") as f:
                    f.write(img_bytes)
                candidate["image"] = image_name
                image_names.append(image_name)
        finally:
            browser.close()
    return image_names, None

_TARGET_RECRUIT_POSITIONS = {
    "fwd": {"ST", "CF", "LF", "RF", "LW", "RW", "LS", "RS"},
    "mid": {"CAM", "LAM", "RAM", "CM", "LCM", "RCM", "LM", "RM",
            "CDM", "LCDM", "RCDM"},
    "def": {"CB", "LCB", "RCB", "LB", "RB", "LWB", "RWB"},
    "gk": {"GK"},
}
_TARGET_RECRUIT_LABELS = {"fwd": "前场", "mid": "中场", "def": "后场", "gk": "守门员"}

def _normalize_recruit_target(value):
    value = str(value or "").strip().lower()
    aliases = {
        "前场": "fwd", "前锋": "fwd", "锋线": "fwd", "fwd": "fwd",
        "中场": "mid", "mid": "mid",
        "后场": "def", "后卫": "def", "防线": "def", "def": "def",
        "守门员": "gk", "门将": "gk", "gk": "gk",
    }
    return aliases.get(value)

def _target_recruit_pool(user_key, target, career):
    """收集其他玩家的指定位置卡；同赛季已借入的来源卡不会重复出现。"""
    positions = _TARGET_RECRUIT_POSITIONS[target]
    used_sources = {
        (str(card.get("source_user", "")), str(card.get("source_card_id", "")))
        for card in career.get("extra_cards", {}).values()
        if card.get("source_user") and card.get("source_card_id")
    }
    pool = []
    if not os.path.isdir(CARDS_DIR):
        return pool
    for owner in os.listdir(CARDS_DIR):
        owner_dir = os.path.join(CARDS_DIR, owner)
        if owner == user_key or not os.path.isdir(owner_dir):
            continue
        try:
            cards = load_cards(owner)
        except (OSError, ValueError, KeyError, json.JSONDecodeError):
            continue
        for card_id, card in cards.items():
            if str(card.get("position", "")).upper() not in positions:
                continue
            if (owner, card_id) in used_sources:
                continue
            pool.append({
                "owner": owner,
                "card_id": card_id,
                "name": card.get("name", "未知球员"),
                "position": card.get("position", "?"),
                "ovr": int(card.get("ovr", 0)),
                "tier_name": card.get("tier_name", "未知品质"),
                "has_portrait": bool(card.get("avatar")),
            })
    return pool

def create_target_recruit_candidates(user_key, career, target):
    pool = _target_recruit_pool(user_key, target, career)
    if len(pool) < 3:
        return None, (f"其他玩家的{_TARGET_RECRUIT_LABELS[target]}卡池目前只有 {len(pool)} 张可用卡，"
                      "不足以组成三人候选名单")
    portrait_pool = [card for card in pool if card["has_portrait"]]
    plain_pool = [card for card in pool if not card["has_portrait"]]
    random.shuffle(portrait_pool)
    random.shuffle(plain_pool)
    candidates = (portrait_pool + plain_pool)[:3]
    try:
        images, error = render_recruit_candidate_cards(candidates)
    except Exception as exc:
        print(f"[FUT ERROR] 定向招募卡面生成失败: {exc}")
        return None, "候选卡面生成失败，请稍后重新尝试定向招募"
    if error:
        return None, error
    career["recruit_candidates"] = {
        "target": target,
        "cards": candidates,
        "images": images,
        "created_at": datetime.datetime.now().isoformat(),
    }
    return candidates, None

def _format_target_recruit_candidates(pending):
    label = _TARGET_RECRUIT_LABELS.get(pending.get("target"), "定向")
    lines = [f"🎯 {label}定向招募候选名单"]
    for idx, card in enumerate(pending.get("cards", []), 1):
        portrait = " · 有立绘" if card.get("has_portrait") else ""
        lines.append(f"{idx}. 【{card['name']}】{card['position']} · OVR {card['ovr']} · "
                     f"{card['tier_name']}{portrait}")
    lines.append("输入 .生涯 招募 选择 <1/2/3> 完成签约")
    return "\n".join(lines)

def select_target_recruit_candidate(career, choice):
    pending = career.get("recruit_candidates") or {}
    candidates = pending.get("cards") or []
    try:
        index = int(choice) - 1
    except (TypeError, ValueError):
        return None, "请选择候选编号 1、2 或 3"
    if index < 0 or index >= len(candidates):
        return None, "候选编号无效，请输入 1、2 或 3"
    selected = candidates[index]
    source = load_cards(selected["owner"]).get(selected["card_id"])
    if not source:
        career["recruit_candidates"] = None
        career["recruit_left"] = career.get("recruit_left", 0) + 3
        return None, "该候选卡已被原持有者删除，本次消耗已退还，请重新进行定向招募"
    meta = dict(source)
    meta["stats"] = dict(source.get("stats", {}))
    meta["card_id"] = (f"rec_pool_{sanitize_filename(meta.get('name', 'player'))}_"
                       f"{random.randint(1000, 9999)}")
    while meta["card_id"] in career.get("extra_cards", {}):
        meta["card_id"] = (f"rec_pool_{sanitize_filename(meta.get('name', 'player'))}_"
                           f"{random.randint(1000, 9999)}")
    meta["career_only"] = True
    meta["source_user"] = selected["owner"]
    meta["source_card_id"] = selected["card_id"]
    meta["recruited_at"] = datetime.datetime.now().isoformat()
    _add_recruit_to_career(career, meta)
    career["recruit_candidates"] = None
    return meta, None

SEASON_CSS = """
* {box-sizing:border-box;margin:0;padding:0;}
body {background:linear-gradient(180deg,#0a0e1a,#050810);font-family:'Bebas Neue','Noto Sans SC',sans-serif;color:#fff;}
.ss {width:900px;padding:28px;background:linear-gradient(180deg,#0d1424,#05080f);}
.ss-title {text-align:center;font-size:32px;letter-spacing:10px;color:#d4af37;
    padding-bottom:14px;border-bottom:2px solid #d4af37;margin-bottom:18px;}
.ss-sub {text-align:center;font-size:14px;letter-spacing:4px;color:#94a3b8;margin-bottom:20px;}
.ss-tbl {width:100%;border-collapse:collapse;margin-bottom:22px;}
.ss-tbl th, .ss-tbl td {padding:9px 8px;text-align:center;font-family:'Bebas Neue',sans-serif;
    font-size:16px;border-bottom:1px solid rgba(255,255,255,0.08);}
.ss-tbl th {color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:3px;}
.ss-tbl .team {text-align:left;font-family:'Noto Sans SC';font-weight:700;font-size:15px;}
.ss-tbl .user-row {background:rgba(212,175,55,0.13);}
.ss-tbl .user-row .team {color:#d4af37;}
.ss-fix, .ss-info {background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
    border-radius:8px;padding:14px 16px;margin-bottom:14px;}
.ss-sec {font-family:'Noto Sans SC';font-size:14px;font-weight:700;letter-spacing:3px;
    color:#d4af37;padding-bottom:6px;margin-bottom:8px;border-bottom:1px solid rgba(212,175,55,0.3);}
.ss-fix-row {display:grid;grid-template-columns:1fr auto 1fr;gap:12px;padding:6px 4px;font-size:14px;}
.ss-fix-row .home {text-align:right;} .ss-fix-row .away {text-align:left;}
.ss-fix-row .score {color:#fbbf24;font-family:'Bebas Neue';letter-spacing:1px;}
.ss-fix-row.upcoming {opacity:0.5;}
.ss-fix-row .user-team {color:#d4af37;font-weight:700;}
.ss-list {padding:4px 0;font-size:13px;}
.ss-list .row {display:flex;justify-content:space-between;padding:4px 4px;
    border-bottom:1px dashed rgba(255,255,255,0.05);}
.ss-list .row:last-child {border:none;}
.ss-list .n {color:#94a3b8;font-family:'Noto Sans SC';font-weight:700;}
.ss-list .v {color:#fbbf24;font-family:'Bebas Neue';font-size:16px;}
.ss-cols {display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.ss-bracket {display:flex;justify-content:space-around;padding:16px 0;}
.ss-stage {flex:1;padding:0 6px;}
.ss-stage-title {text-align:center;font-size:13px;letter-spacing:3px;color:#d4af37;margin-bottom:12px;}
.ss-bm {background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);
    border-radius:5px;padding:8px;margin-bottom:14px;font-size:12px;}
.ss-bm-row {display:flex;justify-content:space-between;padding:3px 0;}
.ss-bm .winner {color:#d4af37;font-weight:700;}
.ss-bm .user {color:#fbbf24;font-weight:700;}
.ss-tbl .qual-row td:first-child { color: #22c55e; font-weight: 700; }
"""

HELP_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap');
* {box-sizing:border-box;margin:0;padding:0;}
body {background:linear-gradient(180deg,#0a0e1a,#050810);
    font-family:'Bebas Neue','Noto Sans SC',sans-serif;color:#fff;}
.help {width:900px;padding:30px 26px;
    background:linear-gradient(180deg,#0d1424,#05080f);}
.help-title {text-align:center;font-size:34px;letter-spacing:12px;color:#d4af37;
    padding-bottom:12px;border-bottom:2px solid #d4af37;margin-bottom:4px;
    text-shadow:0 2px 10px rgba(212,175,55,0.35);}
.help-subtitle {text-align:center;font-size:13px;letter-spacing:5px;
    color:rgba(255,255,255,0.5);margin-bottom:20px;}
.help-sec {background:rgba(255,255,255,0.03);
    border:1px solid rgba(255,255,255,0.08);
    border-radius:10px;padding:12px 18px;margin-bottom:12px;}
.help-sec-title {font-family:'Noto Sans SC';font-size:16px;font-weight:700;
    letter-spacing:3px;color:#d4af37;padding-bottom:8px;margin-bottom:8px;
    border-bottom:1px solid rgba(212,175,55,0.3);}
.cmd-row {display:grid;grid-template-columns:340px 1fr;
    gap:14px;padding:5px 2px;
    border-bottom:1px dashed rgba(255,255,255,0.05);
    align-items:center;}
.cmd-row:last-child {border:none;}
.cmd-code {font-family:'Consolas','Courier New',monospace;font-size:12px;
    color:#7dd3fc;background:rgba(30,64,175,0.18);
    padding:5px 9px;border-radius:4px;letter-spacing:0.3px;}
.cmd-desc {font-size:13px;color:#e5e7eb;
    font-family:'Noto Sans SC';line-height:1.5;}
.chip-list {display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}
.chip {display:inline-flex;align-items:center;
    padding:4px 10px;border-radius:14px;font-size:12px;
    background:rgba(212,175,55,0.15);color:#fbbf24;
    border:1px solid rgba(212,175,55,0.35);
    font-family:'Consolas',monospace;letter-spacing:0.5px;}
.chip.style {background:rgba(125,211,252,0.14);color:#7dd3fc;
    border-color:rgba(125,211,252,0.35);
    font-family:'Noto Sans SC';font-weight:700;}
.chip.pos {background:rgba(34,197,94,0.14);color:#22c55e;
    border-color:rgba(34,197,94,0.35);font-weight:700;}
.chip.tactic {background:rgba(251,146,60,0.14);color:#fdba74;
    border-color:rgba(251,146,60,0.35);
    font-family:'Noto Sans SC';font-weight:700;}
.tip {background:rgba(212,175,55,0.08);border-left:3px solid #d4af37;
    padding:8px 12px;font-size:11px;color:#fef3c7;
    font-family:'Noto Sans SC';margin-top:6px;border-radius:3px;
    letter-spacing:0.5px;line-height:1.5;}
.help-foot {text-align:center;font-size:10px;letter-spacing:3px;
    color:rgba(255,255,255,0.3);margin-top:14px;padding-top:10px;
    border-top:1px solid rgba(255,255,255,0.08);}
.chips-title {font-size:11px;letter-spacing:3px;
    color:rgba(255,255,255,0.5);margin:8px 0 4px;
    font-family:'Noto Sans SC';font-weight:700;}
"""
HELP_DATA = {
    "squad": {
        "title": "球队管理 · SQUAD",
        "subtitle": "TEAM & LINEUP COMMANDS",
        "sections": [
            {"name": "🎯 阵容布置", "cmds": [
                (".球队 上场 张三@ST 李四@LW", "批量首发（@位置）"),
                (".球队 上场 张三@ST context=pve", "编辑 PVE 阵容"),
                (".球队 替补 张三 李四 王五", "批量进替补席"),
                (".球队 移除 张三", "移出球队"),
                (".球队 自动布阵", "按 OVR 和位置自动填充"),
                (".球队 阵型 <阵型名>", "切换阵型，见下方列表"),
                (".球队 战术 <风格>", "设置战术风格"),
                (".球队 战术", "查看当前 + 阵型推荐战术"),
            ]},
            {"name": "📚 多阵容管理", "cmds": [
                (".球队 阵容 列表", "查看所有阵容"),
                (".球队 阵容 新建 青训 从 default", "从已有阵容复制"),
                (".球队 阵容 切换 pvp/pve 名字", "指定 PVP 或 PVE 使用哪套"),
                (".球队 阵容 删除 名字", "删除阵容（default 不能删）"),
                (".球队 阵容 改名 旧名 新名", "重命名"),
            ]},
            {"name": "🎨 显示 · 卡池", "cmds": [
                (".球队 列表", "查看当前阵容"),
                (".球队 出征", "生成球队阵容图"),
                (".球队 战绩", "个人战绩卡"),
                (".球队 改名 新队名", "修改队伍名（12 字内）"),
                (".球队 删卡 张三,李四", "彻底删除球员卡（不可恢复）"),
            ]},
            {"name": "🎴 特殊闪卡（金卡区间 10% 概率）", "cmds": [
                ("🔵 周最佳 TOTW", "六维均匀增强，本周之星"),
                ("🔥 赛季热度 HERO", "PAC/SHO 爆表，锋线杀神"),
                ("🎭 客串大师 UTIL", "任意位置都用纸面 OVR，万金油"),
                ("🌿 怪异天赋 TALENT", "属性权重拉满，无视技能"),
                ("🌠 赛季新星 RISING", "多项加强，年轻球员 PHY 爆表"),
                ("💥 超新星 NOVA", "PAS/DEF/PAC 大幅，PHY 削弱"),
                ("💜 转会焦点 FOCUS", "DRI/PAC 中幅，媒体宠儿"),
            ]},
        ],
        "extras": ["formations", "styles"],
        "tip": "💡 在任何编辑指令末尾加 context=pve 就能改 PVE 生涯阵容",
    },
    "match": {
        "title": "球队对战 · MATCH",
        "subtitle": "PVP BATTLE COMMANDS",
        "sections": [
            {"name": "⚔️ 挑战流程", "cmds": [
                (".对战 挑战 @对方", "发起挑战（@对方 QQ）"),
                (".对战 应战", "接受挑战"),
                (".对战 中止", "放弃当前对战"),
                (".对战 换人 <替补> <首发>", "换人（每场 5 次）"),
            ]},
            {"name": "🎯 每回合战术", "cmds": [
                (".对战 <战术>", "每回合选战术，见下方"),
                (".对战 喊话 <鼓励|冷静|批评|施压>", "沿用上一回合战术并改变士气"),
                (".对战 指令 <传球|远射|突破|防守>", "沿用上一回合战术并强化专项属性"),
            ]},
            {"name": "⚖️ 平局处理", "cmds": [
                (".对战 加时", "常规平局后选择加时"),
                (".对战 点球", "常规平局后选择点球大战"),
                (".对战 接受", "接受平局"),
                (".对战 指挥 射门 守门", "点球大战每轮指挥"),
            ]},
        ],
        "extras": ["tactics", "penalty_strats"],
        "tip": "💡 点球策略：激进 / 平衡 / 稳重 / 花哨 / 随机（每轮独立摇）",
    },
    "career": {
        "title": "生涯模式 · CAREER",
        "subtitle": "LEAGUE & CUP CAMPAIGN",
        "sections": [
            {"name": "🏆 开赛", "cmds": [
                (".生涯 联赛 开始", "开启克苏鲁联赛（16 队主客场双循环）"),
                (".生涯 杯赛 开始", "开启哈斯塔杯赛（32 队小组 + 淘汰）"),
                (".生涯 结束", "放弃当前赛季"),
            ]},
            {"name": "⚽ 比赛进行", "cmds": [
                (".生涯 出战 <战术>", "打下一场（每次推 1 回合）"),
                (".生涯 喊话 <鼓励|冷静|批评|施压>", "沿用上回合战术并影响士气"),
                (".生涯 指令 <传球|远射|突破|防守>", "沿用上回合战术并调整专项属性"),
                (".生涯 换人 <替补> <首发>", "手动换人（每场 5 次）"),
                (".生涯 状态", "查看积分榜/对阵/伤停"),
                (".生涯 招募", "消耗 1 次机会，随机招募生涯球员"),
                (".生涯 招募 前场/中场/后场/守门员", "消耗 3 次，从其他玩家卡池挑选三名候选"),
                (".生涯 招募 选择 <1/2/3>", "从定向招募候选中签下一名球员"),
                (".生涯 发布会", "查看本场记者提问与专属选项"),
                (".生涯 发布会 <选项/序号>", "回答记者，改变长期媒体关系"),
            ]},
            {"name": "📊 联赛体系", "cmds": [
                ("克超 → 冠 → 甲 → 乙 → 全国", "五级联赛，冠军直升"),
                ("2v3 附加赛", "第 2/3 名争夺第二个升级名额"),
                ("哈斯塔杯", "8 组 × 4 队 → 16 强 → 决赛"),
            ]},
            {"name": "⚖️ 加时 & 点球", "cmds": [
                ("淘汰赛/附加赛平局", "自动进入加时 2 回合"),
                (".生涯 出战 <战术>", "加时用普通战术继续"),
                ("加时仍平", "自动进入方向猜测点球"),
                (".生涯 点球 <射> <守>", "方向：左 / 中 / 右"),
                ("SHO 高的射手", "更能识破门将扑救倾向"),
                ("GK 高的门将", "更能猜中射手方向"),
            ]},
        ],
        "extras": ["tactics", "leagues"],
        "tip": "💡 媒体关系会长期影响球员受骚扰程度；恶劣舆论可能令表现大幅上升或下降",
    },
    "immersive": {
        "title": "沉浸生涯 · MANAGER",
        "subtitle": "INDEPENDENT FOOTBALL MANAGEMENT",
        "sections": [
            {"name": "🏢 经理开档", "cmds": [
                (".沉浸 开始 [俱乐部名]", "建立独立经理存档并领取低总评初始阵容"),
                (".沉浸 状态", "查看经理工作台、财政、积分榜与一线队"),
                (".沉浸 下一天 [1-7]", "推进日期并结算工资、训练、球探和赛事"),
            ]},
            {"name": "🧪 训练中心", "cmds": [
                (".沉浸 训练 体能/进攻/传球/防守/门将/恢复", "设置持续执行的全队训练重点"),
                (".沉浸 训练 位置 <球员> <位置>", "安排球员学习新位置并增强对应属性"),
                ("可训练位置", "GK/ST/LW/RW/CAM/CM/CDM/LB/RB/CB"),
                (".沉浸 战术 均衡/控球/高压/反击/防守", "设置自动比赛采用的战术风格"),
            ]},
            {"name": "🔎 招募与事务", "cmds": [
                (".沉浸 球探 前场/中场/后场/守门员/青年", "支付费用并派出数日球探任务"),
                (".沉浸 签约 <1/2/3>", "签下球探报告中的对应候选"),
                (".沉浸 事件 <1/2/3>", "处理经理收件箱中的俱乐部事务"),
                (".沉浸 升级 训练/球探", "投资设施，提高成长效率或球探质量"),
            ]},
            {"name": "📋 董事会规则", "cmds": [
                ("阶段检查", "每 30 天检查竞技、培养或财政目标"),
                ("三次正式警告", "连续未达预期可能直接被解雇"),
                ("完成赛季目标", "提高信心并获得下一阶段预算奖励"),
            ]},
        ],
        "extras": [],
        "tip": "💡 沉浸生涯拥有独立阵容、财政和存档，不会改变普通生涯或 PVP 卡池",
    },
}
def render_help_image(category="squad"):
    data = HELP_DATA.get(category, HELP_DATA["squad"])
    # 命令区块
    sec_html = []
    for sec in data["sections"]:
        rows = []
        for code, desc in sec["cmds"]:
            rows.append(f'<div class="cmd-row">'
                        f'<div class="cmd-code">{code}</div>'
                        f'<div class="cmd-desc">{desc}</div></div>')
        sec_html.append(f'<div class="help-sec">'
                        f'<div class="help-sec-title">{sec["name"]}</div>'
                        f'{"".join(rows)}</div>')
    # 额外区块：阵型 / 战术 / 位置
    extras_html = []
    for ex in data.get("extras", []):
        if ex == "formations":
            chips = "".join(f'<span class="chip">{fm}</span>'
                            for fm in FORMATIONS.keys())
            extras_html.append(f'<div class="help-sec">'
                f'<div class="help-sec-title">🎨 可用阵型（{len(FORMATIONS)} 种）</div>'
                f'<div class="chip-list">{chips}</div></div>')
        elif ex == "styles":
            chips = "".join(f'<span class="chip style">{v["cn"]}</span>'
                            for v in TEAM_STYLES.values())
            extras_html.append(f'<div class="help-sec">'
                f'<div class="help-sec-title">⚙️ 战术风格（{len(TEAM_STYLES)} 种）</div>'
                f'<div class="chip-list">{chips}</div>'
                f'<div class="tip">💡 用 .球队 战术 查看当前阵型的推荐风格</div></div>')
        elif ex == "tactics":
            tacs = ["全力进攻","进攻","平衡","防守","全力防守"]
            chips = "".join(f'<span class="chip tactic">{t}</span>' for t in tacs)
            extras_html.append(f'<div class="help-sec">'
                f'<div class="help-sec-title">🎯 回合战术</div>'
                f'<div class="chip-list">{chips}</div>'
                f'<div class="tip">💡 战术存在克制关系，全力进攻会被全力防守吃死</div></div>')
        elif ex == "penalty_strats":
            strats = ["激进","平衡","稳重","花哨","随机"]
            chips = "".join(f'<span class="chip style">{s}</span>' for s in strats)
            extras_html.append(f'<div class="help-sec">'
                f'<div class="help-sec-title">🎯 点球策略</div>'
                f'<div class="chip-list">{chips}</div></div>')
        elif ex == "leagues":
            rows = []
            for k in reversed(LEAGUE_TIER_ORDER):
                info = LEAGUE_TIERS[k]
                rows.append(f'<span class="chip" style="background:{info["color"]}22;'
                            f'color:{info["color"]};border-color:{info["color"]}88;">'
                            f'{info["full"]}</span>')
            extras_html.append(f'<div class="help-sec">'
                f'<div class="help-sec-title">🏆 联赛级别（从高到低）</div>'
                f'<div class="chip-list">{"".join(rows)}</div></div>')
    tip_html = f'<div class="tip">{data["tip"]}</div>' if data.get("tip") else ""
    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap" rel="stylesheet">
    <style>{HELP_CSS}</style></head><body>
    <div class="help">
        <div class="help-title">{data["title"]}</div>
        <div class="help-subtitle">{data["subtitle"]}</div>
        {"".join(sec_html)}
        {"".join(extras_html)}
        {tip_html}
        <div class="help-foot">FUT · CLI HELP · v3.0.0</div>
    </div></body></html>"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True,
            args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':960,'height':1600},
            device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector(".help").screenshot(type='png')
        browser.close()
    fname = f"help_{category}_{int(datetime.datetime.now().timestamp())}"
    with open(os.path.join(SAVE_DIR, f"{fname}.png"), "wb") as f: f.write(img)
    return fname

ROSTER_CSS = """
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap');
* {box-sizing:border-box;margin:0;padding:0;}
body {background:linear-gradient(180deg,#0a0e1a,#050810);
    font-family:'Bebas Neue','Noto Sans SC',sans-serif;color:#fff;}
.rst {width:1000px;padding:28px 24px;
    background:linear-gradient(180deg,#0d1424,#05080f);}
.rst-title {text-align:center;font-size:30px;letter-spacing:10px;color:#d4af37;
    padding-bottom:10px;border-bottom:2px solid #d4af37;margin-bottom:6px;
    text-shadow:0 2px 8px rgba(212,175,55,0.3);}
.rst-sub {text-align:center;font-size:13px;letter-spacing:4px;
    color:#94a3b8;margin-bottom:14px;}
.rst-meta {display:flex;justify-content:center;gap:20px;margin-bottom:20px;
    font-size:14px;letter-spacing:2px;}
.rst-tag {padding:5px 12px;border-radius:4px;
    background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);
    color:#e5e7eb;}
.rst-tag .k {color:rgba(255,255,255,0.5);margin-right:6px;font-size:11px;letter-spacing:2px;}
.rst-group {margin-bottom:18px;}
.rst-group-title {font-family:'Noto Sans SC';font-size:15px;font-weight:700;
    letter-spacing:4px;padding-bottom:6px;margin-bottom:8px;
    border-bottom:1px solid rgba(212,175,55,0.3);}
.gr-starter {color:#d4af37;}
.gr-bench {color:#7dd3fc;}
.gr-reserve {color:#94a3b8;}

.row {display:grid;grid-template-columns:44px 60px 60px 42px 1fr 340px;
    align-items:center;gap:10px;padding:7px 10px;margin-bottom:4px;
    border-radius:6px;font-size:13px;}
.row.starter {background:linear-gradient(90deg,rgba(212,175,55,0.15),rgba(212,175,55,0.02));
    border:1px solid rgba(212,175,55,0.35);}
.row.bench {background:linear-gradient(90deg,rgba(125,211,252,0.10),rgba(125,211,252,0.02));
    border:1px solid rgba(125,211,252,0.25);}
.row.reserve {background:rgba(255,255,255,0.02);
    border:1px solid rgba(255,255,255,0.06);opacity:0.85;}

.cell-ovr {font-size:26px;text-align:center;
    font-family:'Bebas Neue';line-height:1;letter-spacing:1px;
    text-shadow:0 2px 3px rgba(0,0,0,0.4);}
.row.starter .cell-ovr {color:#d4af37;}
.row.bench .cell-ovr {color:#7dd3fc;}
.row.reserve .cell-ovr {color:#e5e7eb;}

.cell-tier {padding:3px 6px;border-radius:3px;text-align:center;
    font-size:10px;letter-spacing:1px;font-weight:700;}
.tier-icon {background:linear-gradient(135deg,#f0e6d2,#b8a670);color:#2b1e00;}
.tier-icon-rare {background:linear-gradient(135deg,#1c1c1c,#050505);color:#f5d76e;}
.tier-gold {background:linear-gradient(135deg,#d6b25c,#9e7522);color:#3a2708;}
.tier-gold-rare {background:linear-gradient(135deg,#e3bd64,#876218);color:#fff;}
.tier-silver {background:linear-gradient(135deg,#c0c3c7,#83868a);color:#1a1f26;}
.tier-silver-rare {background:linear-gradient(135deg,#d3d7dc,#5d6166);color:#0f1319;}
.tier-bronze {background:linear-gradient(135deg,#a3734b,#684221);color:#fff2dc;}
.tier-bronze-rare {background:linear-gradient(135deg,#b8865b,#522d10);color:#fff2dc;}
.tier-totw {background:linear-gradient(135deg,#1e40af,#172554);color:#e0f2fe;}
.tier-hero {background:linear-gradient(135deg,#ff7a1a,#7a0e0e);color:#fff8dc;}
.tier-rising {background:linear-gradient(135deg,#7dd3fc,#38bdf8);color:#0c4a6e;}
.tier-nova {background:linear-gradient(135deg,#f97316,#1c1917);color:#fff7ed;}
.tier-focus {background:linear-gradient(135deg,#a855f7,#4c1d95);color:#faf5ff;}
.tier-talent {background:linear-gradient(135deg,#14532d,#166534);color:#dcfce7;}
.tier-util {background:linear-gradient(135deg,#dc2626,#f8fafc);color:#7f1d1d;}

.cell-pos {text-align:center;font-family:'Bebas Neue';font-size:14px;
    padding:3px 4px;background:rgba(255,255,255,0.08);border-radius:3px;
    letter-spacing:1px;color:#cbd5e1;}
.cell-slot {text-align:center;font-family:'Bebas Neue';font-size:15px;
    color:#fbbf24;font-weight:700;letter-spacing:1px;}
.cell-name {font-family:'Noto Sans SC';font-weight:700;font-size:15px;
    color:#f5f5f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    letter-spacing:0.5px;}
.cell-stats {display:grid;grid-template-columns:repeat(6,1fr);gap:4px;
    font-size:11px;}
.st {display:flex;flex-direction:column;align-items:center;
    padding:2px 4px;background:rgba(255,255,255,0.04);border-radius:3px;}
.st-v {font-family:'Bebas Neue';font-size:15px;font-weight:700;
    color:#f5f5f5;line-height:1;}
.st-k {font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.55);margin-top:1px;}
.st.hi .st-v {color:#22c55e;} /* ≥80 */
.st.mid .st-v {color:#fbbf24;} /* 65-79 */
.st.lo .st-v {color:#94a3b8;} /* <65 */

.rst-head {display:grid;grid-template-columns:44px 60px 60px 42px 1fr 340px;
    gap:10px;padding:0 12px 6px;font-size:10px;letter-spacing:2px;
    color:rgba(255,255,255,0.4);}
.rst-head span {text-align:center;}
.rst-head .h-name {text-align:left;}
.rst-empty {text-align:center;color:rgba(255,255,255,0.35);
    padding:16px;font-size:13px;letter-spacing:3px;}
.rst-foot {text-align:center;font-size:10px;letter-spacing:3px;
    color:rgba(255,255,255,0.3);margin-top:12px;padding-top:10px;
    border-top:1px solid rgba(255,255,255,0.08);}
"""

def _stat_class(v):
    if v >= 80: return "hi"
    if v >= 65: return "mid"
    return "lo"

def _tier_class(tier_name):
    return "tier-" + tier_name.lower().replace(" ", "-")

def _stat_pairs(card):
    if card.get("is_gk"):
        s = card["stats"]
        return [("DIV",s.get("div",0)),("HAN",s.get("han",0)),
                ("KIC",s.get("kic",0)),("REF",s.get("ref",0)),
                ("SPD",s.get("spd",0)),("POS",s.get("pos",0))]
    s = card["stats"]
    return [("PAC",s.get("pac",0)),("SHO",s.get("sho",0)),
            ("PAS",s.get("pas",0)),("DRI",s.get("dri",0)),
            ("DEF",s.get("def",0)),("PHY",s.get("phy",0))]

def _card_row_html(card, tier_group, slot_label=""):
    stats_html = "".join(
        f'<div class="st {_stat_class(v)}"><div class="st-v">{v}</div>'
        f'<div class="st-k">{k}</div></div>'
        for k, v in _stat_pairs(card)
    )
    tier_cls = _tier_class(card["tier_name"])
    tier_short = card["tier_name"].replace("Rare","R").replace(" ","")[:6]
    return f'''<div class="row {tier_group}">
        <div class="cell-ovr">{card["ovr"]}</div>
        <div class="cell-tier {tier_cls}">{tier_short}</div>
        <div class="cell-pos">{card["position"]}</div>
        <div class="cell-slot">{slot_label}</div>
        <div class="cell-name">{card["name"]}</div>
        <div class="cell-stats">{stats_html}</div>
    </div>'''

def render_roster_image(user_key, context="pvp"):
    raw = load_squad_raw(user_key)
    squad = load_squad(user_key, context=context)
    cards = load_cards(user_key)
    prof = load_profile(user_key)

    team_name = prof.get("team_name") or f"玩家{user_key[-4:]}"
    slot_name = squad.get("_slot_name","default")
    ctx_cn = "PVP 对战" if context=="pvp" else "PVE 生涯"
    fm = squad["formation"]
    style_cn = STYLE_KEY_TO_CN.get(squad.get("style",""), "未设置")

    # 三组分类
    starters_data = []  # (slot, card)
    for slot, cid in squad["starters"].items():
        if cid in cards:
            starters_data.append((slot, cards[cid]))
    starters_data.sort(key=lambda x: -x[1]["ovr"])

    bench_ids = set(squad["bench"])
    bench_data = [cards[cid] for cid in squad["bench"] if cid in cards]
    bench_data.sort(key=lambda c: -c["ovr"])

    used_ids = set(squad["starters"].values()) | bench_ids
    reserve_data = [c for cid,c in cards.items() if cid not in used_ids]
    reserve_data.sort(key=lambda c: -c["ovr"])

    # 首发行
    starter_rows = "".join(
        _card_row_html(c, "starter", slot) for slot, c in starters_data
    ) or '<div class="rst-empty">— 无首发 —</div>'

    bench_rows = "".join(
        _card_row_html(c, "bench") for c in bench_data
    ) or '<div class="rst-empty">— 替补席空缺 —</div>'

    reserve_rows = "".join(
        _card_row_html(c, "reserve") for c in reserve_data
    ) or '<div class="rst-empty">— 无预备 —</div>'

    head_html = '''<div class="rst-head">
        <span>OVR</span><span>TIER</span><span>POS</span>
        <span>SLOT</span><span class="h-name">姓名</span>
        <span>六维数值</span>
    </div>'''

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap" rel="stylesheet">
    <style>{ROSTER_CSS}</style></head><body>
    <div class="rst">
        <div class="rst-title">{team_name} · 阵容详情</div>
        <div class="rst-sub">SQUAD ROSTER</div>
        <div class="rst-meta">
            <div class="rst-tag"><span class="k">阵容</span>{slot_name}</div>
            <div class="rst-tag"><span class="k">模式</span>{ctx_cn}</div>
            <div class="rst-tag"><span class="k">阵型</span>{fm}</div>
            <div class="rst-tag"><span class="k">战术</span>{style_cn}</div>
            <div class="rst-tag"><span class="k">卡池</span>{len(cards)} 张</div>
        </div>
        {head_html}
        <div class="rst-group">
            <div class="rst-group-title gr-starter">⭐ 首发 · STARTING XI ({len(starters_data)})</div>
            {starter_rows}
        </div>
        <div class="rst-group">
            <div class="rst-group-title gr-bench">🔵 替补 · BENCH ({len(bench_data)}/6)</div>
            {bench_rows}
        </div>
        <div class="rst-group">
            <div class="rst-group-title gr-reserve">⚪ 预备 · RESERVE ({len(reserve_data)})</div>
            {reserve_rows}
        </div>
        <div class="rst-foot">用 .球队 上场 张三@ST 编辑 · 用 .球队 阵容 切换 切换阵容</div>
    </div></body></html>"""

    # 高度自适应
    total_rows = len(starters_data) + len(bench_data) + len(reserve_data)
    height = max(600, 340 + total_rows * 52)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True,
            args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':1060,'height':height},
            device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector(".rst").screenshot(type='png')
        browser.close()
    fname = f"roster_{user_key}_{context}_{int(datetime.datetime.now().timestamp())}"
    with open(os.path.join(SAVE_DIR, f"{fname}.png"), "wb") as f: f.write(img)
    return fname

@app.route('/help')
def help_endpoint():
    category = request.args.get('category', 'squad')
    if category not in HELP_DATA:
        return jsonify({"status":"error","msg":"未知分类"})
    img = render_help_image(category)
    return jsonify({"status":"ok","name":img})

def render_season_image(career):
    mode = career["mode"]
    if mode == "league":
        tier = career.get("league_tier","甲")
        season = career.get("season_num",1)
        title = f"克苏鲁第 {season} 届 · {LEAGUE_TIERS[tier]['full']}"
    else:
        season = career.get("season_num",1)
        title = f"哈斯塔第 {season} 届杯赛"
    played = sum(1 for f in career.get("fixtures",[]) if f.get("played")) if mode=="league" else career.get("current_stage",0)
    total = len(career.get("fixtures",[])) if mode=="league" else sum(len(s["matches"]) for s in career.get("bracket",{}).get("stages",[]))

    user_team = career["teams"][0]

    # 积分榜 / 淘汰赛树
    if mode == "league":
        rows = sorted(career["table"].values(), key=lambda r:(-r["Pts"],-(r["GF"]-r["GA"]),-r["GF"]))
        table_html = ["<table class='ss-tbl'><tr><th>#</th><th class='team' style='text-align:left'>队伍</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>"]
        for i, r in enumerate(rows):
            gd = r["GF"] - r["GA"]
            cls = "user-row" if r["team"] == user_team["name"] else ""
            table_html.append(f"<tr class='{cls}'><td>{i+1}</td><td class='team'>{r['team']}</td>"
                              f"<td>{r['P']}</td><td>{r['W']}</td><td>{r['D']}</td><td>{r['L']}</td>"
                              f"<td>{r['GF']}</td><td>{r['GA']}</td><td>{gd:+}</td><td><b>{r['Pts']}</b></td></tr>")
        table_html.append("</table>")
        table_block = f"<div class='ss-sec'>🏆 积分榜</div>" + "".join(table_html)
        # 最近 5 场
        recent = [f for f in career["fixtures"] if f["played"]][-5:]
        upcoming = [f for f in career["fixtures"] if not f["played"]][:3]
        fix_rows = []
        for f in recent + upcoming:
            hn = next((t["name"] for t in career["teams"] if t["key"]==f["home"]), f["home"])
            an = next((t["name"] for t in career["teams"] if t["key"]==f["away"]), f["away"])
            cls = "" if f["played"] else "upcoming"
            hcls = "user-team" if f["home"]=="user" else ""
            acls = "user-team" if f["away"]=="user" else ""
            score = f.get("score") or "vs"
            fix_rows.append(f"<div class='ss-fix-row {cls}'><span class='home {hcls}'>{hn}</span>"
                           f"<span class='score'>{score}</span><span class='away {acls}'>{an}</span></div>")
        fix_block = f"<div class='ss-fix'><div class='ss-sec'>📋 近期赛程</div>{''.join(fix_rows)}</div>"
    else:
        br = career["bracket"]
        stages_html = []
        # 用户小组赛出局 → 强制显示小组积分
        show_group = (br["phase"] == "group" or
                      career.get("cup_winner") == "eliminated_group")
        if show_group:
            groups_html = ["<div class='ss-sec'>🏆 小组赛积分榜</div>"]
            ug = br.get("user_group")
            for gname in "ABCDEFGH":
                g = br["groups"][gname]
                rows = sorted(g["table"].values(),
                              key=lambda r:(-r["Pts"],-(r["GF"]-r["GA"]),-r["GF"]))
                is_user_grp = (gname == ug)
                title_extra = "（你）" if is_user_grp else ""
                tbl = [f"<div style='margin:10px 0;'>"
                       f"<b style='color:#d4af37;'>{gname} 组{title_extra}</b></div>",
                       "<table class='ss-tbl' style='margin-bottom:8px;'>"
                       "<tr><th>#</th><th>队伍</th><th>P</th><th>W</th><th>D</th>"
                       "<th>L</th><th>GD</th><th>Pts</th></tr>"]
                for i, r in enumerate(rows):
                    cls_parts = []
                    if r["team"] == career["teams"][0]["name"]: cls_parts.append("user-row")
                    if is_user_grp and i < 2: cls_parts.append("qual-row")
                    cls = " ".join(cls_parts)
                    marker = "✅" if (is_user_grp and i < 2) else ("❌" if is_user_grp and i >= 2 else "")
                    tbl.append(f"<tr class='{cls}'><td>{i+1}{marker}</td>"
                               f"<td class='team'>{r['team']}</td>"
                               f"<td>{r['P']}</td><td>{r['W']}</td><td>{r['D']}</td><td>{r['L']}</td>"
                               f"<td>{r['GF']-r['GA']:+}</td><td><b>{r['Pts']}</b></td></tr>")
                tbl.append("</table>")
                groups_html.append("".join(tbl))
            # 出局分析
            if career.get("cup_winner") == "eliminated_group" and ug:
                g = br["groups"][ug]
                rows = sorted(g["table"].values(),
                              key=lambda r:(-r["Pts"],-(r["GF"]-r["GA"]),-r["GF"]))
                user_row = next((r for r in rows if r["team"] == career["teams"][0]["name"]), None)
                if user_row:
                    user_rank = next(i+1 for i,r in enumerate(rows) if r is user_row)
                    second = rows[1]
                    pts_gap = second["Pts"] - user_row["Pts"]
                    gd_user = user_row["GF"] - user_row["GA"]
                    gd_2nd = second["GF"] - second["GA"]
                    reasons = []
                    if pts_gap > 0:
                        reasons.append(f"积分少 {pts_gap} 分")
                    elif pts_gap == 0:
                        if gd_2nd > gd_user:
                            reasons.append(f"同分但净胜球少 {gd_2nd - gd_user}")
                        elif user_row["GF"] < second["GF"]:
                            reasons.append(f"同分同净胜球，进球少 {second['GF'] - user_row['GF']}")
                    reason_txt = "、".join(reasons) or "细分规则劣势"
                    groups_html.append(
                        f"<div style='margin-top:14px;padding:14px 16px;"
                        f"background:linear-gradient(90deg,rgba(239,68,68,0.18),rgba(239,68,68,0.05));"
                        f"border:1px solid rgba(239,68,68,0.45);border-radius:8px;'>"
                        f"<div style='font-family:\"Noto Sans SC\";font-size:16px;font-weight:700;"
                        f"color:#fca5a5;letter-spacing:2px;margin-bottom:6px;'>"
                        f"🚫 小组赛出局</div>"
                        f"<div style='font-size:13px;color:#e5e7eb;line-height:1.7;'>"
                        f"你排名 <b style='color:#fbbf24;'>{ug} 组第 {user_rank} 名</b>，"
                        f"未进入前二出线名额<br>"
                        f"具体原因：{reason_txt}<br>"
                        f"最终战绩：{user_row['W']} 胜 {user_row['D']} 平 {user_row['L']} 负 · "
                        f"进 {user_row['GF']} 失 {user_row['GA']}"
                        f"</div></div>"
                    )
            table_block = "".join(groups_html)
        else:
            # 淘汰赛渲染
            for st in br["stages"]:
                matches_html = []
                for m2 in st["matches"]:
                    hn = next((t["name"] for t in career["teams"] if t["key"]==m2["home"]), m2["home"])
                    an = next((t["name"] for t in career["teams"] if t["key"]==m2["away"]), m2["away"])
                    score = m2.get("score") or "-"
                    w = m2.get("winner")
                    def _cls(k):
                        parts = []
                        if k=="user": parts.append("user")
                        if k==w: parts.append("winner")
                        return " ".join(parts)
                    matches_html.append(f"<div class='ss-bm'>"
                        f"<div class='ss-bm-row'><span class='{_cls(m2['home'])}'>{hn}</span><span>{score.split(':')[0] if ':' in score else ''}</span></div>"
                        f"<div class='ss-bm-row'><span class='{_cls(m2['away'])}'>{an}</span><span>{score.split(':')[1] if ':' in score else ''}</span></div>"
                        f"</div>")
                stages_html.append(f"<div class='ss-stage'><div class='ss-stage-title'>{st['name']}</div>{''.join(matches_html)}</div>")
            table_block = f"<div class='ss-sec'>🏆 淘汰赛对阵</div><div class='ss-bracket'>{''.join(stages_html)}</div>"
            # 附加赛显示
            po = career.get("playoff")
            if po:
                hn = _name_of(career, po["home"])
                an = _name_of(career, po["away"])
                hcls = "user-team" if po["home"]=="user" else ""
                acls = "user-team" if po["away"]=="user" else ""
                if po.get("played"):
                    wn = _name_of(career, po["winner"])
                    po_html = (f"<div class='ss-fix'><div class='ss-sec'>🎯 升级附加赛（2 vs 3）</div>"
                            f"<div class='ss-fix-row'><span class='home {hcls}'>{hn}</span>"
                            f"<span class='score'>{po['score']}</span>"
                            f"<span class='away {acls}'>{an}</span></div>"
                            f"<div style='text-align:center;margin-top:8px;color:#d4af37;"
                            f"font-size:14px;letter-spacing:2px;'>🏆 {wn} 升级</div></div>")
                else:
                    po_html = (f"<div class='ss-fix'><div class='ss-sec'>🎯 升级附加赛（2 vs 3 · 待战）</div>"
                            f"<div class='ss-fix-row upcoming'>"
                            f"<span class='home {hcls}'>{hn}</span>"
                            f"<span class='score'>vs</span>"
                            f"<span class='away {acls}'>{an}</span></div></div>")
                table_block += po_html
        fix_block = ""

    # 射手榜 / 停赛伤病
        # 射手榜 / 助攻榜 / 门将（现在含 AI）
    scorers = sorted(career["stats"]["scorers"].values(), key=lambda x:-x.get("goals",0))[:8]
    assists = sorted(career["stats"]["assists"].values(), key=lambda x:-x.get("assists",0))[:8]
    saves = sorted(career["stats"].get("saves", {}).values(), key=lambda x:-x.get("saves",0))[:5]
    top_keeper = saves[0] if saves else None

    def _stat_list_with_team(items, k):
        if not items: return "<div class='row'><span style='color:rgba(255,255,255,0.3);letter-spacing:2px'>— 无 —</span></div>"
        rows = []
        for p in items:
            # 显示球员所在队名（AI 是 team_key，需要映射）
            tk = p.get("team_key", "?")
            team_display = ""
            if tk == career["user_key"]:
                team_display = career["teams"][0]["name"]
            else:
                for t in career["teams"]:
                    ai_uk = f"ai_{t.get('ai',{}).get('key')}" if t.get("ai") else None
                    if ai_uk == tk:
                        team_display = t["name"]; break
            tag = f" <span style='color:#94a3b8;font-size:11px;'>[{team_display}]</span>" if team_display else ""
            rows.append(f"<div class='row'><span class='n'>{p['name']}{tag}</span><span class='v'>{p.get(k,0)}</span></div>")
        return "".join(rows)

    # 伤停名单
    cards = load_cards(career["user_key"])
    inj_rows = []
    for cid, inj in career["injuries"].items():
        n = cards.get(cid, {}).get("name", cid)
        left = "赛季报销" if inj["matches_out"]>=99 else f"{inj['matches_out']} 场"
        inj_rows.append(f"<div class='row'><span class='n'>🚑 {n}</span><span class='v'>{left}</span></div>")
    sus_rows = []
    for cid, sus in career["suspensions"].items():
        n = cards.get(cid, {}).get("name", cid)
        sus_rows.append(f"<div class='row'><span class='n'>{'🟥' if sus['reason']=='红牌' else '🟨🟨'} {n}</span><span class='v'>{sus['matches_out']} 场</span></div>")

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@500;700;900&display=swap" rel="stylesheet">
    <style>{SEASON_CSS}</style></head><body>
    <div class="ss">
        <div class="ss-title">{title}</div>
        <div class="ss-sub">{user_team['name']}  ·  已打 {played} / {total}  ·  招募剩余 {career.get('recruit_left',0)}</div>
        {table_block}
        {fix_block}
        <div class="ss-cols">
            <div class="ss-info"><div class="ss-sec">⚽ 赛季射手榜</div><div class="ss-list">{_stat_list_with_team(scorers,'goals')}</div></div>
            <div class="ss-info"><div class="ss-sec">🎯 赛季助攻榜</div><div class="ss-list">{_stat_list_with_team(assists,'assists')}</div></div>
        </div>
        <div class="ss-info" style="margin-bottom:12px;">
            <div class="ss-sec">🧤 赛季扑救榜 · 当前扑救王</div>
            <div class="ss-list">{_stat_list_with_team(saves,'saves')}</div>
            {f"<div style='margin-top:8px;color:#7dd3fc;font-size:13px;letter-spacing:2px;'>👑 {top_keeper['name']} · {top_keeper.get('saves',0)} 次扑救</div>" if top_keeper else ""}
        </div>
        <div class="ss-cols">
            <div class="ss-info"><div class="ss-sec">🚑 伤病名单</div><div class="ss-list">{''.join(inj_rows) or "<div class='row'><span style='color:rgba(255,255,255,0.3);letter-spacing:2px'>— 全员健康 —</span></div>"}</div></div>
            <div class="ss-info"><div class="ss-sec">🟨 停赛名单</div><div class="ss-list">{''.join(sus_rows) or "<div class='row'><span style='color:rgba(255,255,255,0.3);letter-spacing:2px'>— 无 —</span></div>"}</div></div>
        </div>
    </div></body></html>"""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':960,'height':1600}, device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector(".ss").screenshot(type='png')
        browser.close()
    fname = f"season_{career['user_key']}_{int(datetime.datetime.now().timestamp())}"
    with open(os.path.join(SAVE_DIR, f"{fname}.png"), "wb") as f: f.write(img)
    return fname


# ==================== 沉浸生涯（独立游戏模块） ====================
IMMERSIVE_POSITIONS = {
    "GK": ("div", "han", "kic", "ref", "spd", "pos"),
    "ST": ("pac", "sho", "pas", "dri", "def", "phy"),
    "LW": ("pac", "sho", "pas", "dri", "def", "phy"),
    "RW": ("pac", "sho", "pas", "dri", "def", "phy"),
    "CAM": ("pac", "sho", "pas", "dri", "def", "phy"),
    "CM": ("pac", "sho", "pas", "dri", "def", "phy"),
    "CDM": ("pac", "sho", "pas", "dri", "def", "phy"),
    "LB": ("pac", "sho", "pas", "dri", "def", "phy"),
    "RB": ("pac", "sho", "pas", "dri", "def", "phy"),
    "CB": ("pac", "sho", "pas", "dri", "def", "phy"),
}
IMMERSIVE_TRAINING = {
    "体能": {"stats": ("pac", "phy", "spd"), "cost": 3500, "fatigue": 3},
    "进攻": {"stats": ("sho", "dri", "pac"), "cost": 5000, "fatigue": 5},
    "传球": {"stats": ("pas", "dri", "kic"), "cost": 4500, "fatigue": 4},
    "防守": {"stats": ("def", "phy", "pos"), "cost": 4500, "fatigue": 4},
    "门将": {"stats": ("div", "han", "ref", "pos"), "cost": 5000, "fatigue": 5},
    "恢复": {"stats": (), "cost": 2000, "fatigue": -10},
}
IMMERSIVE_SCOUT_TARGETS = {
    "前场": {"positions": ("ST", "LW", "RW"), "cost": 90000},
    "中场": {"positions": ("CAM", "CM", "CDM"), "cost": 80000},
    "后场": {"positions": ("LB", "RB", "CB"), "cost": 75000},
    "守门员": {"positions": ("GK",), "cost": 70000},
    "青年": {"positions": tuple(IMMERSIVE_POSITIONS), "cost": 60000},
}
IMMERSIVE_TACTICS = {"均衡": 0.0, "控球": 0.7, "高压": 1.1, "反击": 0.8, "防守": 0.4}

def immersive_path(user_key):
    return os.path.join(IMMERSIVE_DIR, f"{sanitize_filename(str(user_key))}.json")

def load_immersive(user_key):
    path = immersive_path(user_key)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        game = json.load(f)
    game.setdefault("pending_event", None)
    game.setdefault("scout", None)
    game.setdefault("scout_candidates", [])
    game.setdefault("training", {"type": "恢复"})
    game.setdefault("logs", [])
    game.setdefault("transactions", [])
    game.setdefault("position_training", {})
    game.setdefault("board_failures", 0)
    game.setdefault("tactic", "均衡")
    if not isinstance(game.get("facilities"), dict):
        game["facilities"] = {"training": 1, "scouting": 1}
    game["facilities"].setdefault("training", 1)
    game["facilities"].setdefault("scouting", 1)
    return game

def save_immersive(game):
    game["updated_at"] = datetime.datetime.now().isoformat()
    with open(immersive_path(game["user_key"]), "w", encoding="utf-8") as f:
        json.dump(game, f, ensure_ascii=False, separators=(",", ":"))

def _immersive_sources():
    result = []
    if not os.path.isdir(CARDS_DIR):
        return result
    for owner in os.listdir(CARDS_DIR):
        owner_dir = os.path.join(CARDS_DIR, owner)
        if not os.path.isdir(owner_dir):
            continue
        try:
            cards = load_cards(owner)
        except Exception:
            continue
        for card_id, card in cards.items():
            name = str(card.get("name", "")).strip()
            if name and card.get("avatar"):
                result.append({"source_owner": owner, "source_card": card_id,
                               "name": name, "avatar": card["avatar"],
                               "profession": card.get("profession", "球员")})
    return result

def _immersive_stats(position, base=None, cap=65):
    base = base if base is not None else random.randint(49, 61)
    all_keys = ("pac", "sho", "pas", "dri", "def", "phy",
                "div", "han", "kic", "ref", "spd", "pos")
    stats = {key: max(30, min(cap, base + random.randint(-7, 7))) for key in all_keys}
    biases = {
        "ST": {"sho": 7, "pac": 4}, "LW": {"pac": 7, "dri": 6},
        "RW": {"pac": 7, "dri": 6}, "CAM": {"pas": 7, "dri": 5},
        "CM": {"pas": 6, "phy": 3}, "CDM": {"def": 7, "phy": 5},
        "LB": {"pac": 5, "def": 6}, "RB": {"pac": 5, "def": 6},
        "CB": {"def": 8, "phy": 6},
        "GK": {"div": 6, "han": 5, "ref": 7, "pos": 6},
    }
    for key, bonus in biases.get(position, {}).items():
        stats[key] = min(cap, stats[key] + bonus)
    return stats

def _immersive_ovr(player):
    keys = IMMERSIVE_POSITIONS.get(player.get("position"), IMMERSIVE_POSITIONS["CM"])
    return int(round(sum(player.get("stats", {}).get(k, 30) for k in keys) / len(keys)))

def _immersive_player(source, position, index, base=None, age=None, ovr_cap=65):
    stats = _immersive_stats(position, base, cap=ovr_cap)
    player = {
        "id": f"im_{index}_{random.randint(1000,9999)}",
        "name": truncate_name(source["name"]), "avatar": source["avatar"],
        "source_owner": source["source_owner"], "source_card": source["source_card"],
        "position": position, "stats": stats,
        "age": age if age is not None else random.randint(18, 31),
        "morale": random.randint(58, 76), "fitness": random.randint(78, 96),
        "potential": random.randint(67, 88), "growth": 0,
        "wage": random.randrange(3500, 10500, 500), "contract_days": random.randint(240, 720),
        "injured_days": 0, "position_progress": {},
    }
    player["ovr"] = min(ovr_cap, _immersive_ovr(player))
    player["potential"] = min(94, max(player["potential"], player["ovr"] + random.randint(4, 12)))
    return player

def _immersive_initial_roster(sources):
    positions = ["GK", "GK", "LB", "CB", "CB", "RB", "CDM", "CM",
                 "CM", "CAM", "LW", "RW", "ST", "ST", "CB", "CM"]
    chosen = random.sample(sources, len(positions))
    roster = [_immersive_player(src, pos, idx) for idx, (src, pos) in enumerate(zip(chosen, positions), 1)]
    return roster

def _immersive_team_ovr(game):
    available = [p for p in game["roster"] if p.get("injured_days", 0) <= 0]
    picked = sorted(available, key=lambda p: (p.get("fitness", 0) + p.get("morale", 0), p["ovr"]), reverse=True)[:11]
    return sum(p["ovr"] for p in picked) / max(1, len(picked))

def _immersive_table_row(name):
    return {"team": name, "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "Pts": 0}

def _immersive_board_goal():
    return random.choice([
        {"type": "rank", "label": "赛季结束时进入联赛前八", "target": 8, "reward": 650000},
        {"type": "rank", "label": "赛季结束时进入联赛前六", "target": 6, "reward": 900000},
        {"type": "development", "label": "让全队累计获得 18 点成长", "target": 18, "reward": 750000},
        {"type": "finance", "label": "赛季结束时保持至少 100 万现金", "target": 1000000, "reward": 700000},
    ])

def start_immersive(user_key, club_name):
    sources = _immersive_sources()
    if len(sources) < 16:
        return None, f"全服目前只有 {len(sources)} 张带姓名和立绘的球员卡，至少需要 16 张才能开档"
    ai_templates = random.sample(AI_TEAM_POOL[:19], 15)
    teams = [{"key": "user", "name": club_name, "ovr": 60, "roster": []}]
    for team in ai_templates:
        # 身份卡允许跨队重复出现，但属性由球队强度重新生成。
        identities = random.sample(sources, min(11, len(sources)))
        teams.append({"key": f"im_{team['key']}", "name": team["name"],
                      "ovr": max(55, min(76, team["ovr"] + random.randint(-3, 2))),
                      "roster": [s["name"] for s in identities]})
    fixtures = _round_robin([t["key"] for t in teams], double=True)
    table = {t["key"]: _immersive_table_row(t["name"]) for t in teams}
    game = {
        "user_key": user_key, "status": "active", "club_name": club_name,
        "created_at": datetime.datetime.now().isoformat(), "season": 1,
        "date": "2026-08-01", "day": 1, "played_round": 0,
        "balance": 1800000, "weekly_wages": 0, "reputation": 1,
        "board_confidence": 68, "board_failures": 0, "board_goal": _immersive_board_goal(),
        "roster": _immersive_initial_roster(sources), "teams": teams,
        "fixtures": fixtures, "table": table, "training": {"type": "恢复"},
        "position_training": {}, "scout": None, "scout_candidates": [],
        "pending_event": None, "next_event_day": random.randint(3, 6),
        "transactions": [], "logs": ["董事会正式任命你为一线队经理。"],
        "last_match": None, "total_growth": 0, "tactic": "均衡",
        "facilities": {"training": 1, "scouting": 1},
    }
    game["weekly_wages"] = sum(p["wage"] for p in game["roster"])
    return game, None

def _immersive_log(game, text):
    game.setdefault("logs", []).append(text)
    game["logs"] = game["logs"][-12:]

def _immersive_transaction(game, amount, reason):
    game["balance"] += amount
    game.setdefault("transactions", []).append({"day": game["day"], "amount": amount, "reason": reason})
    game["transactions"] = game["transactions"][-20:]

def _immersive_find_player(game, query):
    query = str(query or "").strip()
    exact = [p for p in game["roster"] if p["id"] == query or p["name"] == query]
    if len(exact) == 1:
        return exact[0], None
    matches = [p for p in game["roster"] if query and query in p["name"]]
    if len(matches) == 1:
        return matches[0], None
    if len(matches) > 1:
        return None, "球员名字不唯一，请输入更完整的姓名"
    return None, "没有找到该球员"

def set_immersive_training(game, training_type, player_name="", target_position=""):
    if training_type == "位置":
        player, error = _immersive_find_player(game, player_name)
        target_position = str(target_position or "").upper()
        if error:
            return error
        if target_position not in IMMERSIVE_POSITIONS:
            return "位置训练目标支持：GK/ST/LW/RW/CAM/CM/CDM/LB/RB/CB"
        if player["position"] == target_position:
            return "该球员已经在这个位置上"
        game["training"] = {"type": "位置", "player_id": player["id"],
                            "player_name": player["name"], "target": target_position}
        _immersive_log(game, f"教练组开始帮助 {player['name']} 适应 {target_position}。")
        return None
    if training_type not in IMMERSIVE_TRAINING:
        return "训练项目支持：体能、进攻、传球、防守、门将、恢复、位置"
    game["training"] = {"type": training_type}
    _immersive_log(game, f"本周训练重点调整为{training_type}。")
    return None

def set_immersive_tactic(game, tactic):
    tactic = str(tactic or "").strip()
    if tactic not in IMMERSIVE_TACTICS:
        return "战术风格支持：均衡、控球、高压、反击、防守"
    game["tactic"] = tactic
    _immersive_log(game, f"比赛计划切换为{tactic}体系。")
    return None

def upgrade_immersive_facility(game, facility):
    aliases = {"训练": "training", "训练设施": "training",
               "球探": "scouting", "球探网络": "scouting"}
    key = aliases.get(str(facility or "").strip())
    if not key:
        return "可以升级：训练设施、球探网络"
    level = game["facilities"].get(key, 1)
    if level >= 5:
        return "这项设施已经达到最高等级"
    cost = 350000 * level if key == "training" else 300000 * level
    if game["balance"] < cost:
        return f"升级需要 {cost//10000} 万，当前现金不足"
    label = "训练设施" if key == "training" else "球探网络"
    _immersive_transaction(game, -cost, f"升级{label}")
    game["facilities"][key] = level + 1
    game["board_confidence"] = min(100, game["board_confidence"] + 2)
    _immersive_log(game, f"{label}完成升级，目前为 {level + 1} 级。")
    return None

def _immersive_apply_training(game):
    plan = game.get("training") or {"type": "恢复"}
    kind = plan.get("type", "恢复")
    if kind == "位置":
        player = next((p for p in game["roster"] if p["id"] == plan.get("player_id")), None)
        if not player:
            game["training"] = {"type": "恢复"}
            return
        target = plan["target"]
        progress = player.setdefault("position_progress", {}).get(target, 0) + random.randint(5, 9)
        player["position_progress"][target] = progress
        player["fitness"] = max(25, player["fitness"] - 4)
        _immersive_transaction(game, -4000, "位置专项训练")
        if progress >= 100:
            player["position"] = target
            for stat in IMMERSIVE_POSITIONS[target]:
                player["stats"][stat] = min(99, player["stats"].get(stat, 30) + random.randint(2, 4))
            player["ovr"] = _immersive_ovr(player)
            game["total_growth"] += 2
            game["training"] = {"type": "恢复"}
            _immersive_log(game, f"{player['name']} 已完成转型，现在可以胜任 {target}。")
        return
    cfg = IMMERSIVE_TRAINING.get(kind, IMMERSIVE_TRAINING["恢复"])
    _immersive_transaction(game, -cfg["cost"], f"{kind}训练")
    for player in game["roster"]:
        if player.get("injured_days", 0) > 0:
            player["fitness"] = min(100, player["fitness"] + 6)
            continue
        if kind == "恢复":
            player["fitness"] = min(100, player["fitness"] + random.randint(7, 12))
            player["morale"] = min(100, player["morale"] + 1)
            continue
        player["fitness"] = max(20, player["fitness"] - cfg["fatigue"])
        growth_chance = 0.10 + game["facilities"].get("training", 1) * 0.025
        if random.random() < growth_chance and player["ovr"] < player["potential"]:
            available = [s for s in cfg["stats"] if s in player["stats"]]
            if available:
                stat = random.choice(available)
                player["stats"][stat] = min(99, player["stats"][stat] + 1)
                old_ovr = player["ovr"]
                player["ovr"] = _immersive_ovr(player)
                if player["ovr"] > old_ovr:
                    player["growth"] += player["ovr"] - old_ovr
                    game["total_growth"] += player["ovr"] - old_ovr
        if player["fitness"] < 38 and random.random() < 0.035:
            player["injured_days"] = random.randint(4, 14)
            _immersive_log(game, f"训练过量导致 {player['name']} 肌肉受伤。")

def start_immersive_scout(game, target):
    target = str(target or "").strip()
    if target not in IMMERSIVE_SCOUT_TARGETS:
        return "球探目标支持：前场、中场、后场、守门员、青年"
    if game.get("scout"):
        return "球探组已经在执行任务"
    if game.get("scout_candidates"):
        return "请先处理当前球探报告中的候选人"
    cfg = IMMERSIVE_SCOUT_TARGETS[target]
    if game["balance"] < cfg["cost"]:
        return "当前现金不足以支付这次考察费用"
    _immersive_transaction(game, -cfg["cost"], f"{target}球探任务")
    network = game["facilities"].get("scouting", 1)
    game["scout"] = {"target": target, "days_left": max(2, random.randint(6, 9) - network)}
    _immersive_log(game, f"球探团队启程考察{target}球员。")
    return None

def _immersive_complete_scout(game):
    sources = _immersive_sources()
    if len(sources) < 3:
        game["scout"] = None
        _immersive_log(game, "球探没有找到足够的可用身份卡，任务被取消。")
        return
    cfg = IMMERSIVE_SCOUT_TARGETS[game["scout"]["target"]]
    selected = random.sample(sources, 3)
    candidates = []
    for idx, source in enumerate(selected, 1):
        position = random.choice(cfg["positions"])
        network = game["facilities"].get("scouting", 1)
        base = (random.randint(55, 66) + network if game["scout"]["target"] != "青年"
                else random.randint(50, 59) + network)
        player = _immersive_player(source, position, 100 + idx, base=base,
                                   age=random.randint(16, 21) if game["scout"]["target"] == "青年" else None,
                                   ovr_cap=82)
        player["value"] = max(120000, (player["ovr"] - 45) * 65000 + random.randint(-40000, 80000))
        candidates.append(player)
    game["scout_candidates"] = candidates
    game["scout"] = None
    _immersive_log(game, "球探提交了三名候选球员的完整报告。")

def sign_immersive_candidate(game, choice):
    try:
        index = int(choice) - 1
    except (TypeError, ValueError):
        return "请选择球探报告中的 1、2 或 3 号球员"
    candidates = game.get("scout_candidates") or []
    if index < 0 or index >= len(candidates):
        return "当前没有这个编号的球探候选"
    player = candidates[index]
    if game["balance"] < player["value"]:
        return "俱乐部现金不足以完成这笔签约"
    _immersive_transaction(game, -player["value"], f"签下 {player['name']}")
    player.pop("value", None)
    player["id"] = f"im_{len(game['roster'])+1}_{random.randint(1000,9999)}"
    game["roster"].append(player)
    game["weekly_wages"] = sum(p["wage"] for p in game["roster"])
    game["scout_candidates"] = []
    _immersive_log(game, f"{player['name']} 完成体检并正式加入球队。")
    return None

IMMERSIVE_EVENTS = [
    {"title": "更衣室里的音乐之争", "body": "两名主力对赛前播放列表争执不休，气氛正在影响训练。",
     "choices": [("支持队长维护秩序", {"morale": 3, "confidence": 1}),
                 ("让全队投票决定", {"morale": 5, "balance": -8000}),
                 ("把音响搬出更衣室", {"morale": -5, "confidence": -1})]},
    {"title": "赞助商临时拍摄", "body": "商业部门要求主力球员牺牲半天恢复时间参加广告拍摄。",
     "choices": [("接受拍摄安排", {"balance": 120000, "fitness": -5}),
                 ("只派替补出席", {"balance": 45000, "morale": -2}),
                 ("拒绝商业干扰", {"confidence": 2, "balance": -20000})]},
    {"title": "青训球员深夜求助", "body": "一名年轻球员因适应问题失眠，希望与你单独谈谈。",
     "choices": [("亲自陪他长谈", {"morale": 6, "growth": 1}),
                 ("安排心理顾问", {"morale": 4, "balance": -35000}),
                 ("要求他学会职业化", {"morale": -7, "confidence": 1})]},
    {"title": "训练基地漏水", "body": "暴雨让训练场更衣区进水，设施主管等待你的决定。",
     "choices": [("立即全面维修", {"balance": -140000, "confidence": 4}),
                 ("进行临时修补", {"balance": -45000, "fitness": -3}),
                 ("暂时借用社区球场", {"morale": 2, "balance": -20000})]},
    {"title": "队内核心公开抱怨", "body": "一名球员向记者表示训练内容重复，报道正在迅速传播。",
     "choices": [("私下沟通并调整计划", {"morale": 4, "confidence": 1}),
                 ("公开维护教练组", {"morale": -5, "confidence": 3}),
                 ("对球员罚款", {"balance": 12000, "morale": -8})]},
    {"title": "社区邀请", "body": "当地学校邀请球队参加公益训练课，行程会占用恢复时间。",
     "choices": [("全队参加", {"reputation": 2, "fitness": -3, "morale": 3}),
                 ("派青年球员代表", {"reputation": 1, "morale": 1}),
                 ("婉拒邀请", {"reputation": -2, "confidence": -1})]},
    {"title": "经纪人的加薪暗示", "body": "经纪人声称已有其他俱乐部关注你的主力，要求改善待遇。",
     "choices": [("提前追加奖金", {"balance": -90000, "morale": 5}),
                 ("承诺赛季末再谈", {"morale": 1}),
                 ("拒绝被经纪人施压", {"morale": -6, "confidence": 2})]},
    {"title": "数据分析师的异议", "body": "分析部门认为现有训练方向与最近比赛暴露的问题相反。",
     "choices": [("采纳数据建议", {"growth": 2, "confidence": 1}),
                 ("组织教练组辩论", {"morale": 2, "balance": -12000}),
                 ("坚持自己的判断", {"confidence": -2, "morale": -2})]},
]

def _immersive_create_event(game):
    template = random.choice(IMMERSIVE_EVENTS)
    game["pending_event"] = {"title": template["title"], "body": template["body"],
                             "choices": [{"text": text, "effects": effects}
                                         for text, effects in template["choices"]]}
    game["next_event_day"] = game["day"] + random.randint(4, 9)
    _immersive_log(game, f"经理收件箱出现新事务：{template['title']}。")

def resolve_immersive_event(game, choice):
    event = game.get("pending_event")
    if not event:
        return "当前没有需要处理的俱乐部事务"
    try:
        index = int(choice) - 1
    except (TypeError, ValueError):
        return "请选择事务选项 1、2 或 3"
    if index < 0 or index >= len(event["choices"]):
        return "事务选项应为 1、2 或 3"
    selected = event["choices"][index]
    effects = selected["effects"]
    if effects.get("balance"):
        _immersive_transaction(game, effects["balance"], event["title"])
    game["board_confidence"] = max(0, min(100, game["board_confidence"] + effects.get("confidence", 0)))
    game["reputation"] = max(0, game["reputation"] + effects.get("reputation", 0))
    for player in game["roster"]:
        player["morale"] = max(0, min(100, player["morale"] + effects.get("morale", 0)))
        player["fitness"] = max(0, min(100, player["fitness"] + effects.get("fitness", 0)))
    if effects.get("growth"):
        prospects = sorted(game["roster"], key=lambda p: p["age"])[:4]
        for player in random.sample(prospects, min(effects["growth"], len(prospects))):
            key = random.choice(IMMERSIVE_POSITIONS[player["position"]])
            player["stats"][key] = min(99, player["stats"].get(key, 30) + 1)
            old = player["ovr"]; player["ovr"] = _immersive_ovr(player)
            game["total_growth"] += max(0, player["ovr"] - old)
    _immersive_log(game, f"你对“{event['title']}”作出决定：{selected['text']}。")
    game["pending_event"] = None
    return None

def _immersive_rank(game):
    rows = sorted(game["table"].items(), key=lambda kv: (-kv[1]["Pts"], -(kv[1]["GF"]-kv[1]["GA"]), -kv[1]["GF"]))
    return next((idx for idx, (key, _) in enumerate(rows, 1) if key == "user"), 16)

def _immersive_goal_progress(game):
    goal = game["board_goal"]
    if goal["type"] == "rank":
        return _immersive_rank(game) <= goal["target"]
    if goal["type"] == "development":
        return game.get("total_growth", 0) >= goal["target"]
    return game["balance"] >= goal["target"]

def _immersive_score(strength_a, strength_b):
    advantage = max(-1.8, min(1.8, (strength_a - strength_b) / 7.5))
    goals_a = max(0, int(round(random.gauss(1.25 + advantage * 0.45, 1.05))))
    goals_b = max(0, int(round(random.gauss(1.25 - advantage * 0.45, 1.05))))
    return min(goals_a, 6), min(goals_b, 6)

def _immersive_apply_result(row, gf, ga):
    row["P"] += 1; row["GF"] += gf; row["GA"] += ga
    if gf > ga: row["W"] += 1; row["Pts"] += 3
    elif gf == ga: row["D"] += 1; row["Pts"] += 1
    else: row["L"] += 1

def _immersive_play_round(game):
    next_round = game["played_round"] + 1
    round_fixtures = [f for f in game["fixtures"] if f["round"] == next_round]
    team_map = {t["key"]: t for t in game["teams"]}
    for fixture in round_fixtures:
        h, a = fixture["home"], fixture["away"]
        hs = _immersive_team_ovr(game) if h == "user" else team_map[h]["ovr"]
        ass = _immersive_team_ovr(game) if a == "user" else team_map[a]["ovr"]
        if h == "user" or a == "user":
            morale = sum(p["morale"] for p in game["roster"]) / len(game["roster"])
            fitness = sum(p["fitness"] for p in game["roster"]) / len(game["roster"])
            modifier = (morale - 60) / 18 + (fitness - 70) / 22
            modifier += IMMERSIVE_TACTICS.get(game.get("tactic", "均衡"), 0)
            if h == "user": hs += modifier
            else: ass += modifier
        hg, ag = _immersive_score(hs + 1.2, ass)
        if h == "user" or a == "user":
            tactic = game.get("tactic", "均衡")
            if tactic == "防守":
                hg = max(0, hg - (0 if h == "user" else 1))
                ag = max(0, ag - (0 if a == "user" else 1))
            elif tactic == "高压":
                # 高压提升上限，也会让比赛更开放并额外消耗体能。
                if random.random() < 0.35:
                    if h == "user": hg += 1
                    else: ag += 1
        hg = min(6, hg); ag = min(6, ag)
        fixture["played"] = True; fixture["score"] = f"{hg}:{ag}"
        _immersive_apply_result(game["table"][h], hg, ag)
        _immersive_apply_result(game["table"][a], ag, hg)
        if h == "user" or a == "user":
            opp = team_map[a]["name"] if h == "user" else team_map[h]["name"]
            ug, og = (hg, ag) if h == "user" else (ag, hg)
            gate = 75000 + random.randint(0, 45000) + game["reputation"] * 3000
            _immersive_transaction(game, gate, "比赛日收入")
            game["last_match"] = {"opp": opp, "score": f"{ug}:{og}",
                                  "result": "胜" if ug > og else ("平" if ug == og else "负")}
            morale_delta = 5 if ug > og else (1 if ug == og else -5)
            for player in game["roster"]:
                player["morale"] = max(0, min(100, player["morale"] + morale_delta))
                player["fitness"] = max(15, player["fitness"] - random.randint(5, 11))
                if game.get("tactic") == "高压":
                    player["fitness"] = max(10, player["fitness"] - 3)
            _immersive_log(game, f"联赛第 {next_round} 轮：球队 {ug}:{og} {game['last_match']['result']}于 {opp}。")
    game["played_round"] = next_round

def _immersive_board_review(game):
    on_course = _immersive_goal_progress(game)
    rank = _immersive_rank(game)
    if on_course:
        game["board_confidence"] = min(100, game["board_confidence"] + 5)
        game["board_failures"] = max(0, game["board_failures"] - 1)
        _immersive_log(game, f"董事会阶段评估：当前第 {rank} 名，工作方向得到认可。")
    else:
        game["board_confidence"] = max(0, game["board_confidence"] - 11)
        game["board_failures"] += 1
        _immersive_log(game, f"董事会阶段评估未达预期，这是第 {game['board_failures']} 次正式警告。")
    if game["balance"] < 0:
        game["board_confidence"] = max(0, game["board_confidence"] - 8)
    if game["board_failures"] >= 3 or game["board_confidence"] <= 15:
        game["status"] = "fired"
        _immersive_log(game, "董事会终止了你的经理合同，你已被俱乐部解雇。")

def advance_immersive_days(game, days):
    days = max(1, min(7, int(days)))
    if game.get("pending_event"):
        return "经理收件箱中还有必须处理的事务，无法继续推进日期"
    for _ in range(days):
        if game["status"] != "active":
            break
        current = datetime.date.fromisoformat(game["date"]) + datetime.timedelta(days=1)
        game["date"] = current.isoformat(); game["day"] += 1
        for player in game["roster"]:
            if player.get("injured_days", 0) > 0:
                player["injured_days"] -= 1
            player["contract_days"] = max(0, player.get("contract_days", 0) - 1)
        _immersive_apply_training(game)
        if game.get("scout"):
            game["scout"]["days_left"] -= 1
            if game["scout"]["days_left"] <= 0:
                _immersive_complete_scout(game)
        if game["day"] % 7 == 0:
            _immersive_transaction(game, -game["weekly_wages"], "一线队周薪")
            if game["played_round"] < 30:
                _immersive_play_round(game)
        if game["day"] % 30 == 0:
            _immersive_board_review(game)
        if game["played_round"] >= 30 and game["status"] == "active":
            if _immersive_goal_progress(game):
                reward = game["board_goal"]["reward"]
                _immersive_transaction(game, reward, "完成董事会赛季目标")
                game["board_confidence"] = min(100, game["board_confidence"] + 15)
                game["status"] = "completed"
                _immersive_log(game, f"赛季目标完成，董事会追加 {reward//10000} 万预算。")
            else:
                game["board_failures"] += 1
                game["status"] = "fired" if game["board_failures"] >= 3 else "failed"
                _immersive_log(game, "赛季目标未能完成，董事会决定重新评估你的职位。")
        if game["status"] == "active" and game["day"] >= game.get("next_event_day", 9999):
            _immersive_create_event(game)
            break
    return None

IMMERSIVE_CSS = """
*{box-sizing:border-box} body{margin:0;background:#111318;color:#e8edf2;font-family:'Noto Sans SC',Arial,sans-serif}
.im{width:1040px;padding:24px;background:#15191f}.top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #57b87b;padding-bottom:16px}
.club{font-size:32px;font-weight:900}.date{color:#94a3b8;font-size:14px}.badge{padding:7px 12px;background:#263238;border-left:4px solid #57b87b;font-weight:700}
.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:16px 0}.metric{background:#20262e;padding:12px;border-top:2px solid #455464}.metric .k{font-size:11px;color:#9eabb8}.metric .v{font-size:22px;font-weight:900;margin-top:4px}
.grid{display:grid;grid-template-columns:1.08fr .92fr;gap:12px}.panel{background:#1c2229;border:1px solid #303a44;padding:14px;margin-bottom:12px}.title{font-size:14px;font-weight:900;color:#7bd89d;border-bottom:1px solid #34414b;padding-bottom:8px;margin-bottom:8px}
.row{display:flex;justify-content:space-between;align-items:center;padding:6px 4px;border-bottom:1px solid #29313a;font-size:12px}.row:last-child{border:0}.muted{color:#94a3b8}.warn{color:#f3b562}.bad{color:#ef8f8f}.good{color:#7bd89d}
.players{display:grid;grid-template-columns:1fr 1fr;gap:5px}.player{display:grid;grid-template-columns:38px 1fr auto;gap:8px;align-items:center;background:#222a32;padding:6px}.avatar{width:38px;height:38px;object-fit:cover;object-position:top;border-radius:2px;background:#333}.pname{font-weight:700;font-size:12px}.psub{font-size:10px;color:#98a6b5}.ovr{font-size:20px;font-weight:900;color:#f4d35e}
.event{border-left:5px solid #e5a84b;background:#29251f;padding:14px}.event h3{margin:0 0 7px;color:#ffd17a}.choice{margin-top:7px;background:#35302a;padding:7px;font-size:12px}.logs{font-size:11px;line-height:1.7;color:#bbc5ce}.foot{text-align:center;color:#697784;font-size:10px;margin-top:12px;letter-spacing:2px}
table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:5px;text-align:center;border-bottom:1px solid #2d3740}th{color:#8d9aa7}.me{background:#264233;color:#fff}.team{text-align:left}
"""

def render_immersive_image(game):
    esc = lambda value: html.escape(str(value))
    rows = sorted(game["table"].items(), key=lambda kv: (-kv[1]["Pts"], -(kv[1]["GF"]-kv[1]["GA"]), -kv[1]["GF"]))
    rank = _immersive_rank(game)
    table_html = "".join(
        f"<tr class='{'me' if key=='user' else ''}'><td>{idx}</td><td class='team'>{esc(row['team'])}</td>"
        f"<td>{row['P']}</td><td>{row['W']}</td><td>{row['D']}</td><td>{row['L']}</td><td>{row['Pts']}</td></tr>"
        for idx, (key, row) in enumerate(rows[:10], 1)
    )
    players_html = "".join(
        f"<div class='player'><img class='avatar' src='{p['avatar']}'><div><div class='pname'>{esc(p['name'])}</div>"
        f"<div class='psub'>{p['position']} · {p['age']}岁 · 士气{p['morale']} · 体能{p['fitness']}"
        f"{' · 伤'+str(p['injured_days'])+'天' if p.get('injured_days',0)>0 else ''}</div></div><div class='ovr'>{p['ovr']}</div></div>"
        for p in sorted(game["roster"], key=lambda x: (-x["ovr"], x["position"]))
    )
    training = game.get("training") or {"type": "恢复"}
    training_text = training.get("type", "恢复")
    if training_text == "位置":
        player = next((p for p in game["roster"] if p["id"] == training.get("player_id")), None)
        progress = player.get("position_progress", {}).get(training.get("target"), 0) if player else 0
        training_text = f"{training.get('player_name')} → {training.get('target')}（{progress}%）"
    scout = game.get("scout")
    scout_text = f"考察{scout['target']} · 剩余 {scout['days_left']} 天" if scout else ("报告待处理" if game.get("scout_candidates") else "空闲")
    event = game.get("pending_event")
    if event:
        event_html = (f"<div class='event'><h3>{esc(event['title'])}</h3><div>{esc(event['body'])}</div>" +
                      "".join(f"<div class='choice'>{i}. {esc(c['text'])}</div>" for i,c in enumerate(event["choices"],1)) +
                      "<div class='muted' style='margin-top:8px'>使用 .沉浸 事件 &lt;序号&gt; 处理</div></div>")
    else:
        event_html = "<div class='muted'>经理收件箱当前没有必须处理的事务。</div>"
    candidates = game.get("scout_candidates") or []
    cand_html = "".join(
        f"<div class='row'><span>{i}. {esc(p['name'])} · {p['position']} · OVR {p['ovr']}</span><b>{p.get('value',0)//10000}万</b></div>"
        for i,p in enumerate(candidates,1)
    ) or "<div class='muted'>暂无待签约候选</div>"
    last = game.get("last_match")
    last_text = f"{last['result']} {last['score']} vs {esc(last['opp'])}" if last else "尚未比赛"
    goal = game["board_goal"]
    transaction_html = "".join(
        f"<div class='row'><span>{esc(tx['reason'])}</span><b class='{'good' if tx['amount'] >= 0 else 'bad'}'>"
        f"{tx['amount']//10000:+}万</b></div>" for tx in reversed(game.get("transactions", [])[-5:])
    ) or "<div class='muted'>暂无财务流水</div>"
    html_doc = f"""<!doctype html><html><head><meta charset='utf-8'><style>{IMMERSIVE_CSS}</style></head><body>
    <div class='im'><div class='top'><div><div class='club'>{esc(game['club_name'])}</div><div class='date'>{game['date']} · 第 {game['day']} 天 · 联赛第 {game['played_round']} 轮后</div></div><div class='badge'>{esc(game['status'].upper())}</div></div>
    <div class='metrics'><div class='metric'><div class='k'>现金余额</div><div class='v'>{game['balance']//10000}万</div></div><div class='metric'><div class='k'>每周工资</div><div class='v'>{game['weekly_wages']//10000}万</div></div><div class='metric'><div class='k'>董事会信心</div><div class='v'>{game['board_confidence']}</div></div><div class='metric'><div class='k'>联赛排名</div><div class='v'>#{rank}</div></div><div class='metric'><div class='k'>球队总评</div><div class='v'>{_immersive_team_ovr(game):.1f}</div></div></div>
    <div class='grid'><div><div class='panel'><div class='title'>董事会目标</div><div>{esc(goal['label'])}</div><div class='row'><span>目标状态</span><b class='{'good' if _immersive_goal_progress(game) else 'warn'}'>{'达到要求' if _immersive_goal_progress(game) else '尚未达标'}</b></div><div class='row'><span>正式警告</span><b>{game['board_failures']} / 3</b></div></div>
    <div class='panel'><div class='title'>经理收件箱</div>{event_html}</div><div class='panel'><div class='title'>一线队 · 身份取自全服立绘卡，能力独立生成</div><div class='players'>{players_html}</div></div></div>
    <div><div class='panel'><div class='title'>联赛积分榜 · 前十</div><table><tr><th>#</th><th class='team'>球队</th><th>P</th><th>W</th><th>D</th><th>L</th><th>Pts</th></tr>{table_html}</table></div>
    <div class='panel'><div class='title'>足球事务</div><div class='row'><span>比赛战术</span><b>{esc(game.get('tactic','均衡'))}</b></div><div class='row'><span>当前训练</span><b>{esc(training_text)}</b></div><div class='row'><span>球探状态</span><b>{esc(scout_text)}</b></div><div class='row'><span>设施等级</span><b>训练 {game['facilities']['training']} · 球探 {game['facilities']['scouting']}</b></div><div class='row'><span>上一场</span><b>{last_text}</b></div><div class='row'><span>累计成长</span><b>{game.get('total_growth',0)}</b></div></div>
    <div class='panel'><div class='title'>球探候选</div>{cand_html}</div><div class='panel'><div class='title'>近期财务流水</div>{transaction_html}</div><div class='panel'><div class='title'>近期动态</div><div class='logs'>{'<br>'.join(esc(x) for x in reversed(game.get('logs',[])[-8:]))}</div></div></div></div>
    <div class='foot'>IMMERSIVE CAREER · 独立经理模拟模块</div></div></body></html>"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':1080,'height':1800}, device_scale_factor=2)
        page.set_content(html_doc, wait_until="networkidle")
        image_bytes = page.query_selector(".im").screenshot(type="png")
        browser.close()
    name = f"immersive_{sanitize_filename(str(game['user_key']))}_{int(datetime.datetime.now().timestamp()*1000)}"
    with open(os.path.join(SAVE_DIR, f"{name}.png"), "wb") as f:
        f.write(image_bytes)
    return name

def _immersive_json(game, message):
    return jsonify({"status": "ok", "msg": message, "img": render_immersive_image(game),
                    "game_status": game["status"], "pending_event": bool(game.get("pending_event"))})

@app.route('/immersive/start')
def immersive_start_endpoint():
    user_key = request.args.get("user_key", "").strip()
    club_name = truncate_name(request.args.get("club", "").strip() or f"{user_key[-4:]}竞技", 14)
    if not user_key:
        return jsonify({"status": "error", "msg": "缺少玩家标识"})
    existing = load_immersive(user_key)
    if existing and existing.get("status") == "active":
        return jsonify({"status": "error", "msg": "已有进行中的沉浸生涯，请使用 .沉浸 状态"})
    game, error = start_immersive(user_key, club_name)
    if error:
        return jsonify({"status": "error", "msg": error})
    save_immersive(game)
    return _immersive_json(game, "董事会已完成任命，初始阵容、财政预算与赛季目标已经下发。")

@app.route('/immersive/status')
def immersive_status_endpoint():
    game = load_immersive(request.args.get("user_key", ""))
    if not game:
        return jsonify({"status": "error", "msg": "尚未建立沉浸生涯存档"})
    return _immersive_json(game, "经理工作台已更新。")

@app.route('/immersive/day')
def immersive_day_endpoint():
    game = load_immersive(request.args.get("user_key", ""))
    if not game or game.get("status") != "active":
        return jsonify({"status": "error", "msg": "没有可以继续推进的沉浸生涯"})
    try:
        days = int(request.args.get("days", "1"))
    except ValueError:
        days = 1
    error = advance_immersive_days(game, days)
    save_immersive(game)
    if error:
        return jsonify({"status": "error", "msg": error, "img": render_immersive_image(game)})
    return _immersive_json(game, "日期推进完成；训练、财政、球探与赛事均已结算。")

@app.route('/immersive/training')
def immersive_training_endpoint():
    game = load_immersive(request.args.get("user_key", ""))
    if not game or game.get("status") != "active":
        return jsonify({"status": "error", "msg": "没有进行中的沉浸生涯"})
    error = set_immersive_training(game, request.args.get("type", ""),
                                   request.args.get("player", ""), request.args.get("position", ""))
    if error:
        return jsonify({"status": "error", "msg": error})
    save_immersive(game)
    return _immersive_json(game, "训练计划已提交给教练组，从下一天开始执行。")

@app.route('/immersive/tactic')
def immersive_tactic_endpoint():
    game = load_immersive(request.args.get("user_key", ""))
    if not game or game.get("status") != "active":
        return jsonify({"status": "error", "msg": "没有进行中的沉浸生涯"})
    error = set_immersive_tactic(game, request.args.get("type", ""))
    if error:
        return jsonify({"status": "error", "msg": error})
    save_immersive(game)
    return _immersive_json(game, "战术风格已经写入下一场比赛计划。")

@app.route('/immersive/upgrade')
def immersive_upgrade_endpoint():
    game = load_immersive(request.args.get("user_key", ""))
    if not game or game.get("status") != "active":
        return jsonify({"status": "error", "msg": "没有进行中的沉浸生涯"})
    error = upgrade_immersive_facility(game, request.args.get("facility", ""))
    if error:
        return jsonify({"status": "error", "msg": error})
    save_immersive(game)
    return _immersive_json(game, "俱乐部基础设施升级已经完成。")

@app.route('/immersive/scout')
def immersive_scout_endpoint():
    game = load_immersive(request.args.get("user_key", ""))
    if not game or game.get("status") != "active":
        return jsonify({"status": "error", "msg": "没有进行中的沉浸生涯"})
    error = start_immersive_scout(game, request.args.get("target", ""))
    if error:
        return jsonify({"status": "error", "msg": error})
    save_immersive(game)
    return _immersive_json(game, "球探任务已经启动，报告将在数日后送达。")

@app.route('/immersive/sign')
def immersive_sign_endpoint():
    game = load_immersive(request.args.get("user_key", ""))
    if not game or game.get("status") != "active":
        return jsonify({"status": "error", "msg": "没有进行中的沉浸生涯"})
    error = sign_immersive_candidate(game, request.args.get("choice", ""))
    if error:
        return jsonify({"status": "error", "msg": error})
    save_immersive(game)
    return _immersive_json(game, "转会与合同手续已经完成，新援正式加入一线队。")

@app.route('/immersive/event')
def immersive_event_endpoint():
    game = load_immersive(request.args.get("user_key", ""))
    if not game or game.get("status") != "active":
        return jsonify({"status": "error", "msg": "没有进行中的沉浸生涯"})
    error = resolve_immersive_event(game, request.args.get("choice", ""))
    if error:
        return jsonify({"status": "error", "msg": error})
    save_immersive(game)
    return _immersive_json(game, "你的决定已经执行，相关影响已进入俱乐部状态。")


@app.route('/career/start')
def career_start():
    uk = request.args.get('user_key')
    mode = request.args.get('mode','league')
    if not uk: return jsonify({"status":"error","msg":"missing user_key"})
    existing = load_career(uk)
    if existing and existing["status"] == "active":
        return jsonify({"status":"error","msg":"已有进行中的赛季，先 .生涯 结束"})
    sq = load_squad(uk)
    if len(sq["starters"]) < 8:
        return jsonify({"status":"error","msg":f"首发不足 8 人（当前 {len(sq['starters'])}）"})
    prof = load_profile(uk)
    name = prof.get("team_name") or f"玩家{uk[-4:]}"
    career = start_league(uk, name) if mode == "league" else start_cup(uk, name)
    save_career(career)
    if mode == "league":
        tier = career["league_tier"]
        n_teams = len(career["teams"])
        user_matches = sum(1 for f in career["fixtures"] if f["home"]=="user" or f["away"]=="user")
        opp_names = "、".join(t["name"] for t in career["teams"][1:])
        msg = (f"🏆 克苏鲁第 {career['season_num']} 届 · {LEAGUE_TIERS[tier]['full']} 开赛！\n"
               f"级别：【{LEAGUE_TIERS[tier]['short']}】{n_teams} 支球队争夺冠军\n"
               f"你的对手：{opp_names}\n"
               f"赛制：主客场双循环，共 {user_matches} 场你的比赛\n"
               f"招募机会：{career['recruit_left']} 次\n"
               f"💡 冠军直升，2v3 附加赛决定第 2 个升级名额\n"
               f"💡 末 2 名降级（全国联赛保底不降）\n"
               f"输入 .生涯 出战 <战术> 打下一场")
    else:
        ug = career["bracket"].get("user_group")
        if not ug or ug not in career["bracket"]["groups"]:
            # 老存档兼容或异常兜底
            for gname, g in career["bracket"]["groups"].items():
                if "user" in g["teams"]:
                    ug = gname
                    career["bracket"]["user_group"] = ug
                    save_career(career)
                    break
        if not ug:
            return jsonify({"status":"error",
                "msg":"杯赛数据异常：未能定位你的小组，请 .生涯 结束 后重开"})
        group_team_keys = career["bracket"]["groups"][ug]["teams"]
        group_opps = [t for t in career["teams"]
                      if t["key"] in group_team_keys and t["key"] != "user"]
        msg = (f"🏆 哈斯塔第 {career['season_num']} 届杯赛开赛！32 强争霸\n"
               f"你被分在 【{ug} 组】\n"
               f"小组对手：{', '.join(t['name'] for t in group_opps)}\n"
               f"格式：小组循环 → 16 强 → 8 强 → 半决赛 → 决赛\n"
               f"（杯赛不能主动招募，只能通过事件获取球员）\n"
               f"输入 .生涯 出战 <战术> 打下一场")
    return jsonify({"status":"ok","msg":msg})


@app.route('/career/play')
def career_play():
    uk = request.args.get('user_key')
    tac_raw = request.args.get('tactic','').strip()
    if not tac_raw:
        return jsonify({"status":"error",
            "msg":"⚠️ 未指定战术\n可用：全力进攻 / 进攻 / 平衡 / 防守 / 全力防守"})
    tactic = CN_TACTIC.get(tac_raw)
    if not tactic:
        return jsonify({"status":"error",
            "msg":f"⚠️ 未知战术【{tac_raw}】\n可用：全力进攻 / 进攻 / 平衡 / 防守 / 全力防守"})
    career = load_career(uk)
    if not career or career["status"] != "active":
        return jsonify({"status":"error","msg":"没有进行中的赛季"})
    # 无活跃比赛 → 开新一场
    if not career.get("active_match"):
        init = start_career_match(career)
        if init.get("error"):
            return jsonify({"status":"error","msg":init["error"]})
    # 推进一回合
    r = advance_career_round(career, tactic)
    if r.get("error"):
        return jsonify({"status":"error","msg":r["error"]})
    save_career(career)
    ended = False
    if r["phase"] == "final":
        ended = _post_finalize_check(career, r)
        _refresh_post_match_image(career, r)
        save_career(career)

    if r["phase"] == "round_end":
        m = career["active_match"]
        return jsonify({"status":"ok","phase":"round_end",
            "score":r["score"],"commentary":r["commentary"],
            "img":r["img"],"round":r["round"],"next_round":r["next_round"],
            "ai_tactic":r["ai_tactic"],"opp":m["opp_name"]})
    if r["phase"] == "extra_start":
        m = career["active_match"]
        return jsonify({"status":"ok","phase":"extra_start",
            "score":r["score"],"commentary":r["commentary"],"img":r["img"],
            "round":r["round"],"next_round":r["next_round"],
            "ai_tactic":r["ai_tactic"],"opp":m["opp_name"],"msg":r["msg"]})
    if r["phase"] == "shootout_start":
        m = career["active_match"]
        return jsonify({"status":"ok","phase":"shootout_start",
            "score":r["score"],"commentary":r["commentary"],"img":r["img"],
            "round":r["round"],"ai_tactic":r["ai_tactic"],
            "opp":m["opp_name"],"msg":r["msg"]})
    # phase = final
    return jsonify({"status":"ok","phase":"final",
        "score":r["score"],"commentary":r["commentary"],
        "img":r["img"],"ratings_img":r["ratings_img"],
        "opp":r["opp_name"],"won":r["user_won"],"draw":r["is_draw"],
        "mvp":r["mvp"],"shootout":r.get("shootout"),
        "ending_reminder": r.get("ending_reminder"),
        "press_available": r.get("press_available", False),
        "press_prompt":r.get("press_prompt"),"press_options":r.get("press_options",[]),
        "post_img":r.get("post_img"),
        "ended":ended,"cup_winner":career.get("cup_winner")})

@app.route('/career/command')
def career_command():
    uk = request.args.get('user_key')
    kind = request.args.get('kind','').strip().lower()
    value = request.args.get('value','').strip()
    if kind not in ("shout", "focus"):
        return jsonify({"status":"error","msg":"指令类型应为 shout/focus"})
    career = load_career(uk)
    if not career or career["status"] != "active":
        return jsonify({"status":"error","msg":"没有进行中的赛季"})
    r = advance_career_command(career, kind, value)
    if r.get("error"):
        return jsonify({"status":"error","msg":r["error"]})
    save_career(career)
    ended = False
    if r["phase"] == "final":
        ended = _post_finalize_check(career, r)
        _refresh_post_match_image(career, r)
        save_career(career)
    payload = {"status":"ok","phase":r["phase"],"score":r["score"],
               "commentary":r["commentary"],"img":r["img"],
               "command_text":r.get("command_text"),
               "continued_tactic":r.get("continued_tactic")}
    if r["phase"] in ("round_end","extra_start"):
        m = career["active_match"]
        payload.update({"round":r["round"],"next_round":r["next_round"],
                        "ai_tactic":r["ai_tactic"],"opp":m["opp_name"]})
        if r.get("msg"): payload["msg"] = r["msg"]
    elif r["phase"] == "shootout_start":
        m = career["active_match"]
        payload.update({"round":r["round"],"ai_tactic":r["ai_tactic"],
                        "opp":m["opp_name"],"msg":r["msg"]})
    else:
        payload.update({"ratings_img":r["ratings_img"],
                        "opp":r["opp_name"],"won":r["user_won"],"draw":r["is_draw"],
                        "mvp":r["mvp"],"shootout":r.get("shootout"),
                        "ending_reminder":r.get("ending_reminder"),"press_available":True,
                        "press_prompt":r.get("press_prompt"),"press_options":r.get("press_options",[]),
                        "post_img":r.get("post_img"),
                        "ended":ended,"cup_winner":career.get("cup_winner")})
    return jsonify(payload)

@app.route('/career/press')
def career_press():
    uk = request.args.get('user_key')
    choice = request.args.get('choice','').strip()
    career = load_career(uk)
    if not career:
        return jsonify({"status":"error","msg":"没有赛季数据"})
    if not choice or choice in ("status","查看","问题"):
        pending = career.get("press_conference")
        if not pending or not pending.get("available"):
            return jsonify({"status":"error","msg":"当前没有待回答的记者提问"})
        return jsonify({"status":"ok","phase":"question",
            "prompt":format_press_prompt(pending),"options":pending.get("options",[])})
    r = apply_press_conference(career, choice)
    if r.get("error"):
        return jsonify({"status":"error","msg":r["error"]})
    save_career(career)
    return jsonify({"status":"ok","msg":r["msg"]})

@app.route('/career/status')
def career_status():
    uk = request.args.get('user_key')
    career = load_career(uk)
    if not career: return jsonify({"status":"error","msg":"没有赛季数据"})
    img = render_season_image(career)
    return jsonify({"status":"ok","name":img,"mode":career["mode"],
                    "left": career.get("recruit_left",0)})

@app.route('/career/recruit')
def career_recruit():
    uk = request.args.get('user_key')
    target_raw = request.args.get('target','').strip()
    choice = request.args.get('choice','').strip()
    career = load_career(uk)
    if not career or career["status"] != "active":
        return jsonify({"status":"error","msg":"没有进行中的赛季"})
    if career["mode"] == "cup":
        return jsonify({"status":"error","msg":"🏆 杯赛开赛即锁定名单，无法主动招募（可能通过随机事件获得球员）"})
    if choice:
        if not career.get("recruit_candidates"):
            return jsonify({"status":"error","msg":"当前没有待选择的定向招募候选"})
        meta, error = select_target_recruit_candidate(career, choice)
        if error:
            save_career(career)
            return jsonify({"status":"error","msg":error})
        save_career(career)
        return jsonify({"status":"ok",
            "msg": f"签下【{meta['name']}】{meta['position']} · OVR {meta['ovr']} · {meta['tier_name']}\n"
                   f"（来自其他玩家卡池的生涯专属副本，仅在本赛季出战）\n"
                   f"剩余招募次数: {career['recruit_left']}"})

    target = _normalize_recruit_target(target_raw)
    if target_raw and not target:
        return jsonify({"status":"error","msg":"定向位置仅支持：前场、中场、后场、守门员"})
    if target:
        pending = career.get("recruit_candidates") or {}
        if pending.get("cards"):
            if not pending.get("images"):
                try:
                    images, image_error = render_recruit_candidate_cards(pending["cards"])
                except Exception as exc:
                    print(f"[FUT ERROR] 旧招募名单卡面补绘失败: {exc}")
                    images, image_error = None, "候选卡面生成失败，请稍后重试"
                if image_error:
                    if "卡池" in image_error:
                        career["recruit_candidates"] = None
                        career["recruit_left"] = career.get("recruit_left", 0) + 3
                        save_career(career)
                        return jsonify({"status":"error",
                                        "msg":image_error + "，本次消耗的 3 次招募机会已退还"})
                    return jsonify({"status":"error","msg":image_error})
                pending["images"] = images
                career["recruit_candidates"] = pending
                save_career(career)
            return jsonify({"status":"ok","phase":"choose",
                            "msg":_format_target_recruit_candidates(pending),
                            "images":pending.get("images", [])})
        if career.get("recruit_left", 0) < 3:
            return jsonify({"status":"error","msg":"定向招募需要消耗 3 次招募机会"})
        candidates, error = create_target_recruit_candidates(uk, career, target)
        if error:
            return jsonify({"status":"error","msg":error})
        career["recruit_left"] -= 3
        save_career(career)
        return jsonify({"status":"ok","phase":"choose",
                        "msg":_format_target_recruit_candidates(career["recruit_candidates"]) +
                              f"\n剩余招募次数: {career['recruit_left']}",
                        "images":career["recruit_candidates"].get("images", [])})

    if career.get("recruit_candidates"):
        return jsonify({"status":"error",
                        "msg":"你还有一份定向招募名单待确认，请先使用 .生涯 招募 选择 <1/2/3>"})
    if career.get("recruit_left", 0) <= 0:
        return jsonify({"status":"error","msg":"本赛季招募次数已用完"})
    played = sum(1 for f in career.get("fixtures",[]) if f.get("played"))
    boost = min(8, played // 3)
    meta = recruit_random_player(uk, career, tier_boost=boost)
    career["recruit_left"] -= 1
    save_career(career)
    return jsonify({"status":"ok",
        "msg": f"招募到【{meta['name']}】{meta['position']} · OVR {meta['ovr']} · {meta['tier_name']}\n"
               f"（生涯专属，仅在赛季比赛出战）\n剩余招募次数: {career['recruit_left']}"})

@app.route('/career/end')
def career_end():
    uk = request.args.get('user_key')
    career = load_career(uk)
    if not career: return jsonify({"status":"error","msg":"没有赛季数据"})

    lines = ["🚫 当前赛季已中止"]
    # 联赛：结算降级
    if career.get("status") == "active" and career["mode"] == "league":
        prof = load_profile(uk)
        settle_msg = _finalize_abandoned_league(career, prof)
        if settle_msg:
            lines.append(settle_msg)
    elif career.get("status") == "active" and career["mode"] == "cup":
        lines.append("📍 杯赛中止，不结算升降级")

    freed = _clear_recruits_and_effects(career)
    if freed > 0:
        lines.append(f"📤 招募的 {freed} 位球员已解约离队")

    career["status"] = "abandoned"
    save_career(career)
    return jsonify({"status":"ok","msg":"\n".join(lines)})

@app.route('/career/pen')
def career_pen():
    uk = request.args.get('user_key')
    shot = request.args.get('shot','').strip()
    save = request.args.get('save','').strip()
    career = load_career(uk)
    if not career or career["status"] != "active":
        return jsonify({"status":"error","msg":"没有进行中的赛季"})
    r = career_penalty_step(career, shot, save)
    if r.get("error"):
        return jsonify({"status":"error","msg":r["error"]})
    save_career(career)

    if r["phase"] == "shootout_final":
        final = finalize_career_match(career)
        save_career(career)
        ended = _post_finalize_check(career, final)
        _refresh_post_match_image(career, final)
        save_career(career)
        return jsonify({"status":"ok","phase":"shootout_final",
            "commentary": r["commentary"], "img": r["img"],
            "score": r["score"],
            "ratings_img": final["ratings_img"],
            "opp": final["opp_name"],
            "won": final["user_won"], "draw": final["is_draw"],
            "mvp": final["mvp"], "shootout": final["shootout"],
            "ending_reminder": final.get("ending_reminder"),
            "press_available": final.get("press_available", True),
            "press_prompt":final.get("press_prompt"),"press_options":final.get("press_options",[]),
            "post_img":final.get("post_img"),
            "ended": ended, "cup_winner": career.get("cup_winner")})
    return jsonify({"status":"ok","phase":"shootout_round",
        "commentary": r["commentary"], "img": r["img"],
        "score": r["score"], "next_round": r["next_round"]})

@app.route('/team/add')
def team_add():
    context = request.args.get('context', 'pvp')
    user_key = request.args.get('user_key')
    name = request.args.get('name')
    slot = request.args.get('slot', '').upper()  # 空则进替补
    if not user_key or not name:
        return jsonify({"status":"error","msg":"missing params"})
    c = find_card(user_key, name)
    if c is None: return jsonify({"status":"error","msg":"未找到该卡"})
    if isinstance(c, dict) and "__ambiguous__" in c:
        return jsonify({"status":"error","msg":f"多个匹配: {', '.join(c['__ambiguous__'])}"})
    squad = load_squad(user_key, context=context)
    cid = c["card_id"]
    # 先从任何位置移除，避免重复
    squad["starters"] = {k:v for k,v in squad["starters"].items() if v != cid}
    squad["bench"] = [x for x in squad["bench"] if x != cid]
    if slot:
        layout = FORMATIONS.get(squad["formation"], FORMATIONS["4-3-3"])
        if slot not in layout:
            return jsonify({"status":"error","msg":f"阵型 {squad['formation']} 无 {slot} 位"})
        # 若该位有人，把原来那位挤到替补
        if slot in squad["starters"]:
            squad["bench"].append(squad["starters"][slot])
        squad["starters"][slot] = cid
        msg = f"{c['name']} 上场 {slot}"
    else:
        # GK 卡自动占 GK 位（若空）
        if c.get("is_gk") and "GK" not in squad["starters"]:
            squad["starters"]["GK"] = cid; msg = f"{c['name']} 就位 GK"
        elif len(squad["bench"]) < 6:
            squad["bench"].append(cid); msg = f"{c['name']} 进入替补席"
        else:
            return jsonify({"status":"error","msg":"替补席已满 6 人"})
    save_squad(user_key, squad, context=context)
    return jsonify({"status":"ok","msg":msg})
def migrate_starters(old_starters, old_formation, new_formation, max_dist=350):
    """
    基于坐标距离迁移。GK 强制保留；其他球员按全局距离最小配对。
    返回 (新首发字典, 被挤下的球员 id 列表)
    """
    old_layout = FORMATIONS[old_formation]
    new_layout = FORMATIONS[new_formation]

    new_starters = {}
    # GK 直通
    if old_starters.get("GK"):
        new_starters["GK"] = old_starters["GK"]

    # 收集所有 (旧位, 新位, 距离²) 对，按距离升序全局贪心
    old_items = [(s, p) for s, p in old_starters.items() if s != "GK" and p]
    new_slots = [s for s in new_layout if s != "GK"]

    pairs = []
    for old_slot, pid in old_items:
        ox, oy = old_layout[old_slot]
        for new_slot in new_slots:
            nx, ny = new_layout[new_slot]
            pairs.append(((ox-nx)**2 + (oy-ny)**2, old_slot, new_slot, pid))
    pairs.sort()

    used_slot, used_pid = set(), set()
    for d2, old_slot, new_slot, pid in pairs:
        if pid in used_pid or new_slot in used_slot: continue
        if d2 > max_dist * max_dist: continue
        new_starters[new_slot] = pid
        used_pid.add(pid); used_slot.add(new_slot)

    displaced = [pid for _, pid in old_items if pid not in used_pid]
    return new_starters, displaced


@app.route('/team/formation')
def team_formation():
    context = request.args.get('context', 'pvp')
    user_key = request.args.get('user_key')
    fm = request.args.get('name')
    if not fm:
        return jsonify({"status":"ok",
            "msg":"可用阵型：\n" + "、".join(FORMATIONS.keys()) + "\n\n💡 用 .球队 帮助 查看阵型示意图"})
    if fm not in FORMATIONS:
        return jsonify({"status":"error","msg":f"可选: {', '.join(FORMATIONS.keys())}"})

    squad = load_squad(user_key, context=context)
    old_fm = squad["formation"]
    new_starters, displaced = migrate_starters(squad["starters"], old_fm, fm)

    squad["formation"] = fm
    squad["starters"] = new_starters
    # 被挤下的加到替补席前面（避免溢出丢失）
    for pid in displaced:
        if pid not in squad["bench"]:
            squad["bench"].insert(0, pid)
    squad["bench"] = squad["bench"][:6]

    save_squad(user_key, squad, context=context)
    kept = len(new_starters)
    return jsonify({"status":"ok",
        "msg":f"阵型 {old_fm} → {fm}，保留 {kept}/{len(new_starters)+len(displaced)} 位首发"
                + (f"，{len(displaced)} 位下替补" if displaced else "")})
@app.route('/team/remove')
def team_remove():
    context = request.args.get('context', 'pvp')
    user_key = request.args.get('user_key')
    name = request.args.get('name')
    c = find_card(user_key, name)
    if not c or "__ambiguous__" in c:
        return jsonify({"status":"error","msg":"未找到或有歧义"})
    squad = load_squad(user_key, context=context)
    cid = c["card_id"]
    squad["starters"] = {k:v for k,v in squad["starters"].items() if v != cid}
    squad["bench"] = [x for x in squad["bench"] if x != cid]
    save_squad(user_key, squad, context=context)
    return jsonify({"status":"ok","msg":f"{c['name']} 已移出球队"})
@app.route('/team/list')
def team_list():
    user_key = request.args.get('user_key')
    context = request.args.get('context', 'pvp')
    if not user_key: return jsonify({"status":"error","msg":"missing user_key"})
    cards = load_cards(user_key)
    if not cards:
        return jsonify({"status":"error","msg":"卡池为空，先用 .球员卡 生成球员"})
    img = render_roster_image(user_key, context=context)
    raw = load_squad_raw(user_key)
    return jsonify({"status":"ok","name":img,
                    "slot_name": raw["active"].get(context,"default"),
                    "context": context})
@app.route('/team/lineup')
def team_lineup():
    context = request.args.get('context', 'pvp')
    """
    批量首发：assignments = "张三@ST,李四@LW,王五@LCB"
    整体成功/整体失败，不做部分提交。
    """
    user_key = request.args.get('user_key')
    raw = request.args.get('assignments', '')
    if not user_key or not raw:
        return jsonify({"status":"error","msg":"缺少参数"})

    squad = load_squad(user_key, context=context)
    cards = load_cards(user_key)
    layout = FORMATIONS.get(squad["formation"], FORMATIONS["4-3-3"])

    tasks = []
    for token in raw.split(","):
        token = token.strip()
        if "@" not in token: continue
        name, slot = token.rsplit("@", 1)
        name, slot = name.strip(), slot.strip().upper()
        if slot not in layout:
            return jsonify({"status":"error","msg":f"阵型 {squad['formation']} 无 {slot} 位"})
        c = find_card(user_key, name)
        if not c:
            return jsonify({"status":"error","msg":f"未找到卡片: {name}"})
        if isinstance(c, dict) and "__ambiguous__" in c:
            return jsonify({"status":"error","msg":f"「{name}」歧义: {', '.join(c['__ambiguous__'])}"})
        tasks.append((c, slot))

    # 冲突检测：同一 slot 或同一 pid 出现两次
    slots_seen, pids_seen = set(), set()
    for c, slot in tasks:
        if slot in slots_seen:
            return jsonify({"status":"error","msg":f"{slot} 位重复分配"})
        if c["card_id"] in pids_seen:
            return jsonify({"status":"error","msg":f"「{c['name']}」重复"})
        slots_seen.add(slot); pids_seen.add(c["card_id"])

    # 执行：先把这些 pid 从任何位置清除，再落位
    all_new_pids = {c["card_id"] for c, _ in tasks}
    squad["starters"] = {k:v for k,v in squad["starters"].items() if v not in all_new_pids}
    squad["bench"] = [x for x in squad["bench"] if x not in all_new_pids]

    displaced = []
    for c, slot in tasks:
        if slot in squad["starters"]:
            displaced.append(squad["starters"][slot])
        squad["starters"][slot] = c["card_id"]

    for pid in displaced:
        if pid not in squad["bench"]:
            squad["bench"].insert(0, pid)
    squad["bench"] = squad["bench"][:6]

    save_squad(user_key, squad, context=context)
    return jsonify({"status":"ok",
        "msg":f"批量上场 {len(tasks)} 位球员"
              + (f"，{len(displaced)} 位挤下替补" if displaced else "")})


@app.route('/team/bench_batch')
def team_bench_batch():
    context = request.args.get('context', 'pvp')
    """批量替补：names = "张三,李四,王五" """
    user_key = request.args.get('user_key')
    raw = request.args.get('names', '')
    squad = load_squad(user_key, context=context)

    added = []
    for name in [n.strip() for n in raw.split(",") if n.strip()]:
        c = find_card(user_key, name)
        if not c or "__ambiguous__" in (c or {}): continue
        cid = c["card_id"]
        squad["starters"] = {k:v for k,v in squad["starters"].items() if v != cid}
        if cid in squad["bench"]: continue
        if len(squad["bench"]) >= 6: break
        squad["bench"].append(cid); added.append(c["name"])

    save_squad(user_key, squad, context=context)
    return jsonify({"status":"ok","msg":f"进入替补: {', '.join(added) or '(无)'}"})


@app.route('/team/auto')
def team_auto():
    context = request.args.get('context', 'pvp')
    """自动布阵：按卡牌 position 就位，就近降级，剩余按 OVR 补齐"""
    user_key = request.args.get('user_key')
    squad = load_squad(user_key, context=context)
    cards = load_cards(user_key)
    layout = FORMATIONS.get(squad["formation"], FORMATIONS["4-3-3"])

    # 位置就近降级表（每个 slot 可接受的 card.position，按优先级）
    ADJ = {
        "GK":["GK"],
        "LB":["LB","LWB"], "RB":["RB","RWB"],
        "LWB":["LWB","LB","LM"], "RWB":["RWB","RB","RM"],
        "CB":["CB"], "LCB":["CB"], "RCB":["CB"],
        "CDM":["CDM","CM"], "LCDM":["CDM","CM"], "RCDM":["CDM","CM"],
        "CM":["CM","CDM","CAM"], "LCM":["CM","LM","CDM"], "RCM":["CM","RM","CDM"],
        "LM":["LM","LW","LCM"], "RM":["RM","RW","RCM"],
        "CAM":["CAM","CM","CF"], "LAM":["LM","LW","CAM"], "RAM":["RM","RW","CAM"],
        "LW":["LW","LM","LF"], "RW":["RW","RM","RF"],
        "LF":["LF","LW","LS"], "RF":["RF","RW","RS"], "CF":["CF","ST","CAM"],
        "ST":["ST","CF","LS","RS"], "LS":["ST","LF","CF"], "RS":["ST","RF","CF"],
    }

    result, used = {}, set()
    pool = list(cards.values())
    # 三轮：精确匹配 → 近邻匹配 → OVR 兜底
    for priority in range(3):
        for slot in layout:
            if slot in result: continue
            prefs = ADJ.get(slot, [slot])
            if priority == 0:
                acc = prefs[:1]
            elif priority == 1:
                acc = prefs[1:]
            else:
                # 兜底：GK 位只放 GK，其他位不放 GK
                acc = None
            cands = []
            for c in pool:
                if c["card_id"] in used: continue
                if acc is None:
                    if (slot=="GK") != c.get("is_gk", False): continue
                elif c["position"] not in acc:
                    continue
                cands.append(c)
            cands.sort(key=lambda c: -c["ovr"])
            if cands:
                result[slot] = cands[0]["card_id"]
                used.add(cands[0]["card_id"])

    # 剩下 6 张最高 OVR 进替补（GK 类只允许一个）
    remaining = [c for c in pool if c["card_id"] not in used]
    remaining.sort(key=lambda c: -c["ovr"])
    bench = []
    gk_added = False
    for c in remaining:
        if c.get("is_gk"):
            if gk_added: continue
            gk_added = True
        bench.append(c["card_id"])
        if len(bench) >= 6: break

    squad["starters"] = result
    squad["bench"] = bench
    save_squad(user_key, squad, context=context)
    filled = sum(1 for v in result.values())
    return jsonify({"status":"ok","msg":f"自动布阵完成: {filled}/{len(layout)} 首发, {len(bench)} 替补"})
PITCH_CSS = """
body { margin:0; background:#0a3d1e; font-family:'Bebas Neue','Noto Sans SC',sans-serif; }
.pitch {
    position: relative; width: 900px; height: 1250px;
    background:
        linear-gradient(180deg,
            #1a6b34 0%, #145c2a 50%, #1a6b34 100%),
        repeating-linear-gradient(90deg,
            rgba(255,255,255,0.04) 0 60px, transparent 60px 120px);
    background-blend-mode: overlay;
    overflow: hidden;
}
/* 场地线 */
.pitch::before {
    content:""; position:absolute; inset:20px;
    border:3px solid rgba(255,255,255,0.55);
}
.center-circle {
    position:absolute; left:50%; top:50%; width:200px; height:200px;
    border:3px solid rgba(255,255,255,0.55); border-radius:50%;
    transform:translate(-50%,-50%);
}
.center-line {
    position:absolute; left:20px; right:20px; top:50%; height:3px;
    background:rgba(255,255,255,0.55);
}
.penalty-top, .penalty-bot {
    position:absolute; left:225px; width:450px; height:170px;
    border:3px solid rgba(255,255,255,0.55);
}
.penalty-top { top:20px; border-top:none; }
.penalty-bot { bottom:20px; border-bottom:none; }

/* 迷你卡 - 尺寸从 140×190 → 115×155 */
.slot { position:absolute; width:115px; height:155px; }
.mini {
    width:115px; height:155px; border-radius:9px;
    padding:7px 6px; text-align:center;
    box-shadow:0 5px 12px rgba(0,0,0,0.55);
    position:relative; overflow:hidden;
}
.mini-ovr { font-size:26px; line-height:1; font-weight:400; }
.mini-pos { font-size:11px; letter-spacing:1.8px; margin-top:1px; opacity:0.9;}
.mini-avatar { width:62px; height:62px; margin:4px auto 3px;
    border-radius:50%; overflow:hidden; background:rgba(255,255,255,0.15); }
.mini-avatar img { width:100%; height:100%; object-fit:cover; object-position:top; }
.mini-avatar svg { width:70%; height:70%; margin:15% auto; display:block; }
.mini-name { font-size:13px; font-weight:700; letter-spacing:0.5px;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.empty-slot {
    width:115px; height:155px; border:2px dashed rgba(255,255,255,0.4);
    border-radius:9px; display:flex; align-items:center; justify-content:center;
    font-size:20px; color:rgba(255,255,255,0.5); letter-spacing:2px;
}
/* --- Mini 稀有卡光泽 --- */
.mini.rare {
    position: relative;
    overflow: hidden;
}
.mini.rare::before {
    content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background:
        radial-gradient(ellipse at 50% 15%, rgba(255,255,255,0.22), transparent 60%),
        radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.30), transparent 65%),
        repeating-linear-gradient(90deg, transparent 0 2px, rgba(255,255,255,0.03) 2px 3px);
    border-radius: inherit;
}
.mini.rare::after {
    content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
    background:
        /* 高光斑点：位置对应大卡的 1/2.7 缩放 */
        radial-gradient(ellipse 80px 55px at 25% 20%, rgba(255,255,255,0.40), transparent 62%),
        radial-gradient(ellipse 70px 45px at 78% 55%, rgba(255,255,255,0.30), transparent 65%),
        radial-gradient(ellipse 55px 35px at 45% 88%, rgba(255,255,255,0.24), transparent 65%),
        /* 主斜纹：双条白光带（角度和大卡保持一致 112deg） */
        linear-gradient(112deg,
            transparent 30%,
            rgba(255,255,255,0.20) 38%,
            rgba(255,255,255,0.52) 42%,
            rgba(255,255,255,0.20) 46%,
            transparent 54%,
            transparent 62%,
            rgba(255,255,255,0.14) 66%,
            rgba(255,255,255,0.36) 70%,
            rgba(255,255,255,0.14) 74%,
            transparent 82%),
        /* 反向副纹 */
        linear-gradient(-68deg,
            transparent 40%,
            rgba(255,255,255,0.11) 48%,
            rgba(255,255,255,0.27) 52%,
            rgba(255,255,255,0.11) 56%,
            transparent 64%),
        /* 顶部塑封反光 */
        radial-gradient(ellipse 120px 34px at 50% -5%,
            rgba(255,255,255,0.50),
            transparent 70%),
        /* 彩虹色偏 */
        linear-gradient(105deg,
            rgba(180,220,255,0.16) 0%,
            rgba(255,220,240,0.14) 25%,
            rgba(255,245,200,0.16) 50%,
            rgba(210,255,220,0.14) 75%,
            rgba(200,220,255,0.16) 100%);
    mix-blend-mode: screen;
    border-radius: inherit;
    opacity: 1;
}

/* TOTW 蓝卡专属冰晶光泽（覆盖上面通用效果） */
.mini.totw::after {
    background:
        radial-gradient(ellipse 90px 60px at 30% 20%, rgba(180,230,255,0.55), transparent 65%),
        radial-gradient(ellipse 70px 50px at 75% 65%, rgba(120,200,255,0.40), transparent 65%),
        linear-gradient(120deg,
            transparent 30%,
            rgba(200,240,255,0.30) 40%,
            rgba(255,255,255,0.60) 44%,
            rgba(200,240,255,0.30) 48%,
            transparent 58%,
            transparent 68%,
            rgba(150,220,255,0.25) 72%,
            transparent 82%),
        radial-gradient(ellipse 120px 30px at 50% -5%,
            rgba(220,240,255,0.55),
            transparent 70%);
    mix-blend-mode: screen;
    border-radius: inherit;
}

/* HERO 火卡专属烈焰光泽 */
.mini.hero::after {
    background:
        radial-gradient(ellipse 90px 60px at 30% 20%, rgba(255,220,120,0.65), transparent 65%),
        radial-gradient(ellipse 70px 50px at 75% 65%, rgba(255,140,50,0.50), transparent 65%),
        radial-gradient(ellipse 60px 90px at 50% 100%, rgba(255,60,10,0.55), transparent 60%),
        linear-gradient(120deg,
            transparent 30%,
            rgba(255,200,100,0.32) 40%,
            rgba(255,255,220,0.55) 44%,
            rgba(255,200,100,0.32) 48%,
            transparent 58%,
            transparent 68%,
            rgba(255,120,50,0.28) 72%,
            transparent 82%),
        radial-gradient(ellipse 120px 30px at 50% -5%,
            rgba(255,235,150,0.55),
            transparent 70%);
    mix-blend-mode: screen;
    border-radius: inherit;
}

.mini.rising::after {
    background:
        radial-gradient(ellipse 90px 60px at 30% 20%, rgba(224,242,254,0.60), transparent 65%),
        radial-gradient(ellipse 70px 50px at 75% 65%, rgba(125,211,252,0.45), transparent 65%);
    mix-blend-mode: screen; border-radius: inherit;
}
.mini.nova::after {
    background:
        radial-gradient(circle at 50% 30%, rgba(255,180,80,0.55), transparent 60%),
        radial-gradient(ellipse 90px 40px at 50% 95%, rgba(255,110,30,0.50), transparent 65%);
    mix-blend-mode: screen; border-radius: inherit;
}
.mini.focus::after {
    background:
        radial-gradient(ellipse 90px 60px at 30% 20%, rgba(196,181,253,0.55), transparent 65%),
        radial-gradient(ellipse 70px 50px at 75% 65%, rgba(168,85,247,0.42), transparent 65%);
    mix-blend-mode: screen; border-radius: inherit;
}
.mini.talent::after {
    background:
        radial-gradient(ellipse 90px 60px at 30% 20%, rgba(74,222,128,0.48), transparent 65%),
        repeating-linear-gradient(38deg,
            transparent 0 8px, rgba(134,239,172,0.08) 8px 10px);
    mix-blend-mode: screen; border-radius: inherit;
}
.mini.util::after {
    background:
        radial-gradient(ellipse 90px 60px at 30% 20%, rgba(255,255,255,0.48), transparent 65%),
        linear-gradient(112deg,
            transparent 32%, rgba(255,255,255,0.42) 46%, transparent 60%);
    mix-blend-mode: screen; border-radius: inherit;
}

/* 让 mini 内部内容在光泽层之上 */
.mini > * { position: relative; z-index: 3; }

/* 教练区重设计 */
.footer {
    position:relative; width:900px; padding:20px 24px;
    background: linear-gradient(180deg, #0f2f18 0%, #061a0d 100%);
    display:flex; align-items:center; gap:16px;
    min-height:180px;
}
.bench { display:flex; gap:6px; flex:1; align-items:center; flex-wrap:nowrap; overflow:hidden;}
.bench .mini { transform:scale(0.78); transform-origin:top left;
    margin-right:-25px; margin-bottom:-32px;}
.coach-wrap {
    display:flex; flex-direction:column; align-items:center;
    gap:8px; flex-shrink:0;
}
.coach {
    width:120px; height:120px; border-radius:50%;
    background-size:cover; background-position:center;
    border:4px solid gold; 
    background-color: rgba(0,0,0,0.4);
}
.coach-badge {
    display:flex; align-items:center; gap:10px;
    background: rgba(0,0,0,0.9);
    padding:6px 16px; border-radius:4px;
    font-family:'Bebas Neue', 'Noto Sans SC', sans-serif;
    white-space:nowrap;
    box-shadow:0 3px 10px rgba(0,0,0,0.6);
}
.coach-badge-label {
    font-size:11px; letter-spacing:3px;
    color:rgba(255,255,255,0.55);
    padding-right:10px; border-right:1px solid rgba(255,255,255,0.2);
}
.coach-badge-tier {
    font-size:20px; letter-spacing:4px;
    font-weight:400;
}
.style-badge {
    background: linear-gradient(90deg, #1e40af, #172554);
    color:#e0f2fe; padding:5px 12px; border-radius:4px;
    font-size:14px; letter-spacing:3px; font-weight:700;
    border:1px solid #7dd3fc;
    box-shadow:0 3px 8px rgba(30,64,175,0.5);
    white-space:nowrap;
}
.title {
    color:#fff; font-size:32px; letter-spacing:8px;
    text-align:center; padding:16px 0 6px;
    background:#000; border-bottom:2px solid gold;
}
"""


MATCH_PITCH_CSS = PITCH_CSS + """
.scoreboard {
    position:absolute; top:20px; left:50%; transform:translateX(-50%);
    background:rgba(0,0,0,0.85); padding:14px 28px; border-radius:10px;
    color:#fff; font-family:'Bebas Neue',sans-serif;
    display:flex; gap:22px; align-items:center; z-index:20;
    border:2px solid #d4af37;
}
.scoreboard .team { font-size:22px; letter-spacing:2px;}
.scoreboard .score { font-size:44px; color:#d4af37;}
.round-badge {
    position:absolute; top:20px; right:20px;
    background:#d4af37; color:#000; padding:6px 12px; border-radius:6px;
    font-size:20px; letter-spacing:2px; z-index:20;
}
.tactic-tag {
    position:absolute; padding:4px 10px; background:rgba(0,0,0,0.7);
    color:#fff; font-size:14px; border-radius:4px; z-index:15;
}

/* === 比赛专用球场（更高）与小卡尺寸 === */
.pitch.match { height: 1700px; }

.slot-match { position:absolute; width:100px; height:130px; }
.slot-match .mini {
    width:100px !important; height:130px !important;
    padding:5px 4px 8px; border-radius:8px;
    box-shadow:0 4px 10px rgba(0,0,0,0.55);
    position:relative; overflow:hidden;
}
.slot-match .mini-ovr { font-size:22px; line-height:1; }
.slot-match .mini-pos { font-size:9px; letter-spacing:1.5px; margin-top:1px; }
.slot-match .mini-avatar { width:50px; height:50px; margin:3px auto 2px; }
.slot-match .mini-name { font-size:11px; letter-spacing:0.3px; }

/* 体能条：放在卡片内部下方（避免 overflow:hidden 裁掉） */
.slot-match .stamina-bar {
    position:absolute; bottom:3px; left:6px; right:6px; height:3px;
    background:rgba(0,0,0,0.55); border-radius:2px; overflow:hidden;
    z-index:5;
}
.slot-match .stamina-bar > div { height:100%; transition:none; }

/* 体能预警配色（OVR 变黄/变红） */
.mini-ovr.ovr-warning {
    color:#fbbf24 !important;
    text-shadow:0 0 6px rgba(251,191,36,0.7);
}
.mini-ovr.ovr-critical {
    color:#ef4444 !important;
    text-shadow:0 0 8px rgba(239,68,68,0.8);
    animation:pulseRed 1.5s ease-in-out infinite;
}
@keyframes pulseRed {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}
"""

def mini_card_html(card, display_pos, display_ovr=None):
    theme = CARD_THEMES[card["tier_name"]]
    avatar = f'<img src="{card["avatar"]}" />' if card.get("avatar") else SILHOUETTE_SVG
    ovr_show = display_ovr if display_ovr is not None else card["ovr"]
    extra_class = ""
    tn = card["tier_name"]
    if tn == "TOTW": extra_class = " rare totw"
    elif tn == "HERO": extra_class = " rare hero"
    elif tn == "RISING": extra_class = " rare rising"
    elif tn == "NOVA": extra_class = " rare nova"
    elif tn == "FOCUS": extra_class = " rare focus"
    elif tn == "TALENT": extra_class = " rare talent"
    elif tn == "UTIL": extra_class = " rare util"
    elif card.get("is_rare"): extra_class = " rare"
    return f"""
    <div class="mini{extra_class}" style="background:{theme['bg']};color:{theme['text']};">
        <div class="mini-ovr">{ovr_show}</div>
        <div class="mini-pos">{display_pos}</div>
        <div class="mini-avatar">{avatar}</div>
        <div class="mini-name">{card['name']}</div>
    </div>"""

def empty_slot_html(slot):
    return f'<div class="empty-slot">{slot}</div>'

COACH_TIER_COLORS = {
    "Bronze": "#a3734b", "Silver": "#c0c3c7",
    "Gold":   "#d6b25c", "Icon":   "#d4af37"
}

@app.route('/team/render')
def team_render():
    context = request.args.get('context', 'pvp')
    user_key = request.args.get('user_key')
    coach_qq = request.args.get('coach_qq', '')
    if not user_key: return "missing user_key", 400

    squad = load_squad(user_key, context=context)
    cards = load_cards(user_key)
    layout = FORMATIONS.get(squad["formation"], FORMATIONS["4-3-3"])

    # 首发：位置适配评分（不是卡片原 OVR）
    slots_html = []
    ovr_list = []
    for slot, (x, y) in layout.items():
        cid = squad["starters"].get(slot)
        style = f"left:{x-57}px;top:{y-77}px;"   # 115/2, 155/2
        if cid and cid in cards:
            c = cards[cid]
            pos_ovr = position_ovr(c, slot)
            ovr_list.append(pos_ovr)
            slots_html.append(f'<div class="slot" style="{style}">{mini_card_html(c, slot, pos_ovr)}</div>')
        else:
            slots_html.append(f'<div class="slot" style="{style}">{empty_slot_html(slot)}</div>')

    # 替补显示原 OVR
    bench_html = []
    for cid in squad["bench"][:6]:
        if cid in cards:
            c = cards[cid]; ovr_list.append(c["ovr"])
            bench_html.append(mini_card_html(c, c["position"]))

    team_avg = sum(ovr_list) // len(ovr_list) if ovr_list else 0
    if team_avg >= 85: coach_tier = "Icon"
    elif team_avg >= 75: coach_tier = "Gold"
    elif team_avg >= 65: coach_tier = "Silver"
    else: coach_tier = "Bronze"
    coach_color = COACH_TIER_COLORS[coach_tier]
    coach_url = f"https://q1.qlogo.cn/g?b=qq&nk={coach_qq}&s=640" if coach_qq else ""
    coach_tier_cn = {"Bronze":"青铜","Silver":"白银","Gold":"黄金","Icon":"传奇"}[coach_tier]
    style_key = squad.get("style","")
    style_cn = STYLE_KEY_TO_CN.get(style_key, "")
    style_badge = f'<div class="style-badge">{style_cn}</div>' if style_cn else ""

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Noto+Sans+SC:wght@700&display=swap" rel="stylesheet">
    <style>{PITCH_CSS}</style></head><body>
    <div style="width:900px;background:#000;">
        <div class="title">MY SQUAD · {squad['formation']} · AVG {team_avg}</div>
        <div class="pitch">
            <div class="center-line"></div><div class="center-circle"></div>
            <div class="penalty-top"></div><div class="penalty-bot"></div>
            {''.join(slots_html)}
        </div>
        <div class="footer">
            <div class="bench">{''.join(bench_html) or '<div style="color:rgba(255,255,255,0.35);font-size:16px;letter-spacing:4px;padding-left:20px;">— 替补席空缺 —</div>'}</div>
            <div class="coach-wrap">
                <div class="coach" style="background-image:url('{coach_url}');border-color:{coach_color};box-shadow:0 0 24px {coach_color}88;"></div>
                <div class="coach-badge">
                    <span class="coach-badge-label">COACH</span>
                    <span class="coach-badge-tier" style="color:{coach_color};">{coach_tier_cn}</span>
                </div>
                {style_badge}
            </div>
        </div>
    </div></body></html>"""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width':960,'height':1500}, device_scale_factor=2)
        page.set_content(html, wait_until="networkidle")
        img = page.query_selector("body > div").screenshot(type='png')
        browser.close()

    fname = f"squad_{user_key}.png"
    with open(os.path.join(SAVE_DIR, fname), "wb") as f: f.write(img)
    return jsonify({"status":"ok","name":fname.replace(".png",""),"avg":team_avg,"tier":coach_tier_cn})

@app.route('/match/challenge')
def match_challenge():
    fu = request.args.get('from_key'); tu = request.args.get('to_key')
    fn = request.args.get('from_name','玩家A'); tn = request.args.get('to_name','玩家B')
    if not fu or not tu: return jsonify({"status":"error","msg":"缺少参数"})
    # 优先使用已设置的队名
    fn = get_team_display_name(fu, fn)
    tn = get_team_display_name(tu, tn)
    if not fu or not tu: return jsonify({"status":"error","msg":"缺少参数"})
    # 双方都需要有 11 首发
    for uk, name in [(fu, fn), (tu, tn)]:
        sq = load_squad(uk)
        if len(sq["starters"]) < 11:
            return jsonify({"status":"error","msg":f"{name} 首发不满 11 人（当前 {len(sq['starters'])}）"})
    # ← 新增：清理双方的历史遗留
    _abort_stale_matches(fu)
    _abort_stale_matches(tu)
    mid = f"{fu}_vs_{tu}_{int(datetime.datetime.now().timestamp())}"
    match = {
        "id": mid, "round": 0, "max_round": 6,
        "home_key": fu, "away_key": tu,
        "home_name": fn, "away_name": tn,
        "home": build_side(fu), "away": build_side(tu),
        "status": "pending",   # pending | active | done
        "history": [], "last_tactic":{"home":"balance","away":"balance"}
    }
    # PvP 为中立场，不应用联赛主客场氛围。
    match["home"]["venue_mult"] = 1.0
    match["away"]["venue_mult"] = 1.0
    save_match(match)
    return jsonify({"status":"ok","msg":f"{fn} 挑战 {tn}！等待应战","match_id":mid})

@app.route('/match/abort')
def match_abort():
    uk = request.args.get('user_key')
    if not uk: return jsonify({"status":"error","msg":"missing user_key"})
    n = _abort_stale_matches(uk)
    return jsonify({"status":"ok","msg": f"已中止 {n} 场未完成比赛" if n else "没有需要中止的比赛"})

@app.route('/match/accept')
def match_accept():
    uk = request.args.get('user_key')
    my_name = (request.args.get('name', '') or '').strip()
    for mid in _list_matches_sorted():                 # ← 改
        m = load_match(mid)
        if m and m["away_key"] == uk and m["status"] == "pending":
            if my_name and (m["away_name"].startswith("玩家") or m["away_name"] == uk):
                m["away_name"] = my_name
            m["status"] = "active"; m["round"] = 1
            save_match(m)
            return jsonify({"status":"ok","msg":f"{m['away_name']} 应战！比赛开始，第 1 回合请选战术","match_id":m["id"]})
    return jsonify({"status":"error","msg":"没有待应战的挑战"})

def find_active_match(uk):
    for mid in _list_matches_sorted():
        m = load_match(mid)
        if m and m["status"]=="active" and uk in (m["home_key"], m["away_key"]):
            return m
    return None

@app.route('/match/tactic')
def match_tactic():
    uk = request.args.get('user_key')
    tac_raw = request.args.get('tactic','').strip()
    my_name = (request.args.get('name','') or '').strip()
    tactic = CN_TACTIC.get(tac_raw)
    if not tactic:
        return jsonify({"status":"error",
            "msg":f"⚠️ 未知战术【{tac_raw}】\n可用：全力进攻 / 进攻 / 平衡 / 防守 / 全力防守"})
    m = find_active_match(uk)
    if not m: return jsonify({"status":"error","msg":"没有进行中的比赛"})
    # 名字兜底
    if my_name:
        if m["home_key"] == uk and (m["home_name"].startswith("玩家") or m["home_name"] == uk):
            m["home_name"] = my_name
        elif m["away_key"] == uk and (m["away_name"].startswith("玩家") or m["away_name"] == uk):
            m["away_name"] = my_name

    side_key = "home" if m["home_key"] == uk else "away"
    other_key = "away" if side_key == "home" else "home"
    if m[side_key].get("pending_tactic"):
        return jsonify({"status":"error","msg":"本回合已经下达过指令，请等待对手"})
    m[side_key]["pending_tactic"] = tactic
    m.setdefault("last_tactic", {})[side_key] = tactic
    
    # 若双方都定了 → 结算这一回合
    if m["home"]["pending_tactic"] and m["away"]["pending_tactic"]:
        ht = m["home"]["pending_tactic"]; at = m["away"]["pending_tactic"]
        res = simulate_round(m["home"], m["away"], ht, at, m["round"])
        m["home"]["goals"] += res["home_goals"]; m["away"]["goals"] += res["away_goals"]
        m["home"]["shots"] += res["home_shots"]; m["away"]["shots"] += res["away_shots"]
        commentary = build_commentary(m["home"], m["away"], m["home_name"], m["away_name"], res, show_style_intro=(m["round"] == 1))
        pitch_img = render_match_pitch(m, res)
        m["history"].append({"round":m["round"],"result":res,"text":commentary,"img":pitch_img})
        m["home"]["pending_tactic"] = None; m["away"]["pending_tactic"] = None
        
        if m["round"] >= m["max_round"]:
            # 平局 → 进入选择阶段
            if m["home"]["goals"] == m["away"]["goals"] and not m.get("tiebreak_done"):
                m["status"] = "await_tiebreak"
                m["tiebreak_choice"] = {}   # {"home": "extra"/"penalty", ...}
                save_match(m)
                return jsonify({"status":"ok","phase":"draw_choice",
                    "commentary": commentary, "img": pitch_img,
                    "score": f"{m['home']['goals']}:{m['away']['goals']}",
                    "msg": "常规时间战平！双方各自输入：.对战 加时  或  .对战 点球"})
            m["status"] = "done"
            final = finalize_match(m)
            save_match(m)
            return jsonify({"status":"ok","phase":"final",
                "commentary":commentary,"img":pitch_img,
                "final":final,"score":f"{m['home']['goals']}:{m['away']['goals']}"})
        else:
            m["round"] += 1
            save_match(m)
            return jsonify({"status":"ok","phase":"round_end",
                "commentary":commentary,"img":pitch_img,
                "score":f"{m['home']['goals']}:{m['away']['goals']}",
                "next_round":m["round"]})
    else:
        save_match(m)
        return jsonify({"status":"ok","phase":"waiting",
            "msg":f"已选定【{TACTIC_CN[tactic]}】，等待对手选择战术"})

@app.route('/match/command')
def match_command():
    uk = request.args.get('user_key')
    kind = request.args.get('kind','').strip().lower()
    value = request.args.get('value','').strip()
    if kind not in ("shout", "focus"):
        return jsonify({"status":"error","msg":"指令类型应为 shout/focus"})
    m = find_active_match(uk)
    if not m: return jsonify({"status":"error","msg":"没有进行中的比赛"})
    side_key = "home" if m["home_key"] == uk else "away"
    if m[side_key].get("pending_tactic"):
        return jsonify({"status":"error","msg":"本回合已经下达过指令，请等待对手"})
    tactic = m.setdefault("last_tactic", {}).get(side_key, "balance")
    command = apply_round_command(m[side_key], kind, value)
    if not command:
        options = "鼓励 / 冷静 / 批评 / 施压" if kind == "shout" else "传球 / 远射 / 突破 / 防守"
        return jsonify({"status":"error","msg":f"未知场边指令【{value}】\n可用：{options}"})
    m[side_key]["pending_tactic"] = tactic

    if m["home"]["pending_tactic"] and m["away"]["pending_tactic"]:
        ht = m["home"]["pending_tactic"]; at = m["away"]["pending_tactic"]
        res = simulate_round(m["home"], m["away"], ht, at, m["round"])
        m["home"]["goals"] += res["home_goals"]; m["away"]["goals"] += res["away_goals"]
        m["home"]["shots"] += res["home_shots"]; m["away"]["shots"] += res["away_shots"]
        commentary = build_commentary(m["home"], m["away"], m["home_name"], m["away_name"], res,
                                      show_style_intro=(m["round"] == 1))
        pitch_img = render_match_pitch(m, res)
        m["history"].append({"round":m["round"],"result":res,"text":commentary,"img":pitch_img})
        m["home"]["pending_tactic"] = None; m["away"]["pending_tactic"] = None
        if m["round"] >= m["max_round"]:
            if m["home"]["goals"] == m["away"]["goals"] and not m.get("tiebreak_done"):
                m["status"] = "await_tiebreak"; m["tiebreak_choice"] = {}
                save_match(m)
                return jsonify({"status":"ok","phase":"draw_choice","commentary":commentary,
                    "img":pitch_img,"score":f"{m['home']['goals']}:{m['away']['goals']}",
                    "msg":"常规时间战平！双方各自输入：.对战 加时 或 .对战 点球",
                    "continued_tactic":TACTIC_CN.get(tactic,tactic)})
            m["status"] = "done"; final = finalize_match(m); save_match(m)
            return jsonify({"status":"ok","phase":"final","commentary":commentary,"img":pitch_img,
                "final":final,"score":f"{m['home']['goals']}:{m['away']['goals']}",
                "continued_tactic":TACTIC_CN.get(tactic,tactic)})
        m["round"] += 1; save_match(m)
        return jsonify({"status":"ok","phase":"round_end","commentary":commentary,"img":pitch_img,
            "score":f"{m['home']['goals']}:{m['away']['goals']}","next_round":m["round"],
            "continued_tactic":TACTIC_CN.get(tactic,tactic)})
    save_match(m)
    return jsonify({"status":"ok","phase":"waiting",
        "msg":f"已执行【{command['name']}】，本回合沿用【{TACTIC_CN.get(tactic,tactic)}】，等待对手"})

def finalize_match(m):
    hg, ag = m["home"]["goals"], m["away"]["goals"]
    # 判定真正胜方（含点球）
    winner_side = None
    if m.get("shootout"):
        so = m["shootout"]
        if so["home_goals"] > so["away_goals"]: winner_side = "home"
        elif so["away_goals"] > so["home_goals"]: winner_side = "away"
    else:
        if hg > ag: winner_side = "home"
        elif ag > hg: winner_side = "away"
    winner = m["home_name"] if winner_side == "home" \
             else (m["away_name"] if winner_side == "away" else "平局")

    def slot_of(side, cid):
        for s, v in side["starters"].items():
            if v == cid: return s
        return None
    ratings = []
    for side, side_name, is_winner, is_draw in [
        (m["home"], m["home_name"], hg > ag, hg == ag),
        (m["away"], m["away_name"], ag > hg, hg == ag)
    ]:
        # 首发 + 已被罚下的球员，去重
        cids_to_rate = list(side.get("all_participants", list(side["starters"].values()))) + side.get("sent_off", [])
        seen = set()
        cids_to_rate = [c for c in cids_to_rate if not (c in seen or seen.add(c))]
        for cid in cids_to_rate:
            c = side["cards_snapshot"].get(cid)
            if not c: continue
            slot = slot_of(side, cid) or (c.get("position", "?") + "↓")  # ↓ 表示已下场
            role = POSITION_ROLE.get(slot, "mid")
            ps = side.get("player_stats", {}).get(cid, default_pstat())

            r = 6.5
            # 团队结果
            r += 0.4 if is_winner else (-0.3 if not is_draw else 0)

            # 进球（防守球员进球奖励更高）
            if role in ("def","def_mid"): r += ps["goals"] * 1.8
            elif role == "mid":            r += ps["goals"] * 1.4
            else:                          r += ps["goals"] * 1.1
            r += ps["assists"] * 0.7

            # GK 加分：扑救 + 零封
            if c.get("is_gk"):
                r += ps["saves"] * 0.35
                if ps["conceded"] == 0: r += 0.7
                r -= ps["conceded"] * 0.35

            # 后卫零封小额加成
            if role in ("def","def_mid"):
                own_gk_conceded = 0
                gk_cid = side["starters"].get("GK")
                if gk_cid:
                    own_gk_conceded = side.get("player_stats",{}).get(gk_cid, default_pstat()).get("conceded", 0)
                if own_gk_conceded == 0: r += 0.35
            
            # 中场维度
            r += ps.get("key_passes", 0) * 0.18
            r += ps.get("interceptions", 0) * 0.12
            r += ps.get("chances_created", 0) * 0.10
            r -= ps.get("turnovers", 0) * 0.15

            # 惩罚
            r -= ps["yellow"] * 0.4
            r -= ps["red"] * 2.0
            r -= ps["own_goal"] * 1.5
            r -= ps["blunder"] * 1.5

            # 随机扰动（模拟基础表现）
            r += random.uniform(-0.3, 0.4)

            r = max(4.0, min(10.0, round(r, 1)))

            ratings.append({
                "name": c["name"], "team": side_name, "position": slot,
                "rating": r, "goals": ps["goals"], "assists": ps["assists"],
                "saves": ps["saves"], "yellow": ps["yellow"], "red": ps["red"],
                "own_goal": ps["own_goal"], "blunder": ps["blunder"],
            })

    ratings.sort(key=lambda x: -x["rating"])
    mvp = ratings[0]["name"] if ratings else "?"

    # 组装文本：主客各自分组显示
    def fmt_line(p):
        badges = ""
        if p["goals"]:   badges += f" ⚽×{p['goals']}"
        if p["assists"]: badges += f" 🎯×{p['assists']}"
        if p["saves"]:   badges += f" 🧤×{p['saves']}"
        if p["own_goal"]: badges += " 😱"
        if p["blunder"]: badges += " 🥴"
        if p["yellow"]: badges += f" 🟨×{p['yellow']}"
        if p["red"]:    badges += " 🟥"
        emoji = "🌟" if p["rating"] >= 8.5 else ("⭐" if p["rating"] >= 7.5 else ("✨" if p["rating"] >= 6.5 else "📉"))
        return f"  {emoji} {p['rating']}  {p['name']} [{p['position']}]{badges}"

    home_lines = [fmt_line(p) for p in ratings if p["team"] == m["home_name"]]
    away_lines = [fmt_line(p) for p in ratings if p["team"] == m["away_name"]]

    referee = calculate_referee_rating(m)
    ratings_img = render_ratings_image(
        m["id"], m["home_name"], m["away_name"],
        f"{hg}:{ag}", winner, mvp, ratings, referee
    )

    # 幂等结算
    d_home, d_away = 0, 0
    if not m.get("profile_updated"):
        d_home, d_away = _settle_match_stats(m, winner_side, ratings, mvp)
        m["profile_updated"] = True
    return {"winner": winner, "mvp": mvp, "score": f"{hg}:{ag}",
            "ratings": ratings, "ratings_img": ratings_img,
            "referee":referee,
            "elo_delta": {"home": d_home, "away": d_away}}

@app.route('/match/sub')
def match_sub():
    uk = request.args.get('user_key')
    on = request.args.get('on'); off = request.args.get('off')
    m = find_active_match(uk)
    if not m: return jsonify({"status":"error","msg":"没有进行中的比赛"})
    side = m["home"] if m["home_key"]==uk else m["away"]
    if side["subs_left"] <= 0: return jsonify({"status":"error","msg":"换人名额已用完"})
    # 找 off（首发中）
    off_slot, off_cid = None, None
    for slot, cid in side["starters"].items():
        c = side["cards_snapshot"].get(cid)
        if c and off in c["name"]:
            off_slot, off_cid = slot, cid; break
    if not off_cid: return jsonify({"status":"error","msg":f"首发中没有 {off}"})
    on_cid = None
    for cid in side["bench"]:
        c = side["cards_snapshot"].get(cid)
        if c and on in c["name"]: on_cid = cid; break
    if not on_cid: return jsonify({"status":"error","msg":f"替补席没有 {on}"})
    side["starters"][off_slot] = on_cid
    side["bench"].remove(on_cid); side["bench"].append(off_cid)
    side["subs_left"] -= 1
    # 【新增】
    side.setdefault("all_participants", [])
    if on_cid not in side["all_participants"]:
        side["all_participants"].append(on_cid)
    save_match(m)
    return jsonify({"status":"ok","msg":f"换人成功: {off} → {on}（{off_slot}），剩余名额 {side['subs_left']}"})

@app.route('/team/style')
def team_style_set():
    context = request.args.get('context', 'pvp')
    user_key = request.args.get('user_key')
    style = request.args.get('style', '').strip()
    if not user_key:
        return jsonify({"status":"error","msg":"missing user_key"})

    squad = load_squad(user_key, context=context)
    fm = squad["formation"]
    suggested = suggest_styles_for_formation(fm)
    sug_cn = "、".join(TEAM_STYLES[k]["cn"] for k in suggested)

    if not style or style in ("列表","list","?","？"):
        cur = STYLE_KEY_TO_CN.get(squad.get("style",""), "未设置")
        return jsonify({"status":"ok",
            "msg": f"当前战术风格: {cur}\n"
                   f"阵型 {fm} 推荐: {sug_cn}\n"
                   f"全部战术: {', '.join(v['cn'] for v in TEAM_STYLES.values())}"})

    key = STYLE_CN_TO_KEY.get(style) or (style if style in TEAM_STYLES else None)
    if not key:
        return jsonify({"status":"error","msg":f"未知战术，可选: {', '.join(v['cn'] for v in TEAM_STYLES.values())}"})

    squad["style"] = key
    save_squad(user_key, squad, context=context)
    hint = "契合" if fm in TEAM_STYLES[key]["formations"] else "不契合（属性会 −6%）"
    return jsonify({"status":"ok",
        "msg": f"战术风格设为【{TEAM_STYLES[key]['cn']}】\n"
               f"{TEAM_STYLES[key]['desc']}\n"
               f"当前阵型 {fm} · {hint}"})

def find_pending_tiebreak(uk):
    for mid in _list_matches_sorted():
        m = load_match(mid)
        if m and m["status"]=="await_tiebreak" and uk in (m["home_key"], m["away_key"]):
            return m
    return None

@app.route('/team/slots')
def team_slots():
    """列出所有阵容"""
    uk = request.args.get('user_key')
    raw = load_squad_raw(uk)
    return jsonify({"status":"ok",
        "slots": list(raw["slots"].keys()),
        "active": raw["active"]})

@app.route('/team/slot_new')
def team_slot_new():
    uk = request.args.get('user_key')
    name = (request.args.get('name','') or '').strip()
    copy_from = (request.args.get('copy_from','') or '').strip()
    if not uk or not name: return jsonify({"status":"error","msg":"缺少参数"})
    if not re.match(r'^[\u4e00-\u9fa5A-Za-z0-9_-]{1,12}$', name):
        return jsonify({"status":"error","msg":"名称需 1-12 字符，中英文数字或 -_"})
    raw = load_squad_raw(uk)
    if name in raw["slots"]:
        return jsonify({"status":"error","msg":f"阵容 【{name}】 已存在"})
    if len(raw["slots"]) >= 6:
        return jsonify({"status":"error","msg":"最多 6 套阵容"})
    if copy_from and copy_from in raw["slots"]:
        raw["slots"][name] = json.loads(json.dumps(raw["slots"][copy_from]))
        msg = f"已复制 【{copy_from}】 → 【{name}】"
    else:
        raw["slots"][name] = {"formation":"4-3-3","starters":{},"bench":[],"style":""}
        msg = f"已新建空阵容 【{name}】"
    save_squad_raw(uk, raw)
    return jsonify({"status":"ok","msg":msg})

@app.route('/team/slot_delete')
def team_slot_delete():
    uk = request.args.get('user_key')
    name = (request.args.get('name','') or '').strip()
    raw = load_squad_raw(uk)
    if name not in raw["slots"]:
        return jsonify({"status":"error","msg":f"阵容 【{name}】 不存在"})
    if name == "default":
        return jsonify({"status":"error","msg":"默认阵容不能删除"})
    if len(raw["slots"]) <= 1:
        return jsonify({"status":"error","msg":"至少保留 1 套阵容"})
    del raw["slots"][name]
    for ctx in ("pvp","pve"):
        if raw["active"].get(ctx) == name:
            raw["active"][ctx] = "default"
    save_squad_raw(uk, raw)
    return jsonify({"status":"ok","msg":f"已删除阵容 【{name}】"})

@app.route('/team/slot_switch')
def team_slot_switch():
    uk = request.args.get('user_key')
    ctx = request.args.get('context','pvp')
    name = (request.args.get('name','') or '').strip()
    if ctx not in ("pvp","pve"):
        return jsonify({"status":"error","msg":"context 需为 pvp / pve"})
    raw = load_squad_raw(uk)
    if name not in raw["slots"]:
        return jsonify({"status":"error","msg":f"阵容 【{name}】 不存在"})
    raw["active"][ctx] = name
    save_squad_raw(uk, raw)
    ctx_cn = "PVP 对战" if ctx == "pvp" else "PVE 生涯"
    return jsonify({"status":"ok","msg":f"{ctx_cn} 已切换到 【{name}】"})

@app.route('/team/slot_rename')
def team_slot_rename():
    uk = request.args.get('user_key')
    old = (request.args.get('old','') or '').strip()
    new = (request.args.get('new','') or '').strip()
    if not re.match(r'^[\u4e00-\u9fa5A-Za-z0-9_-]{1,12}$', new):
        return jsonify({"status":"error","msg":"名称需 1-12 字符"})
    raw = load_squad_raw(uk)
    if old not in raw["slots"]:
        return jsonify({"status":"error","msg":f"阵容 【{old}】 不存在"})
    if new in raw["slots"]:
        return jsonify({"status":"error","msg":f"名称 【{new}】 已被占用"})
    raw["slots"][new] = raw["slots"].pop(old)
    for ctx in ("pvp","pve"):
        if raw["active"].get(ctx) == old:
            raw["active"][ctx] = new
    save_squad_raw(uk, raw)
    return jsonify({"status":"ok","msg":f"阵容重命名: 【{old}】 → 【{new}】"})

@app.route('/card/delete')
def card_delete():
    uk = request.args.get('user_key')
    name = (request.args.get('name','') or '').strip()
    if not uk or not name: return jsonify({"status":"error","msg":"缺少参数"})
    c = find_card(uk, name)
    if c is None: return jsonify({"status":"error","msg":"未找到该卡"})
    if isinstance(c, dict) and "__ambiguous__" in c:
        return jsonify({"status":"error","msg":f"歧义: {', '.join(c['__ambiguous__'])}"})
    cid = c["card_id"]
    # 从所有阵容里清理
    raw = load_squad_raw(uk)
    for slot in raw["slots"].values():
        slot["starters"] = {k:v for k,v in slot.get("starters",{}).items() if v != cid}
        slot["bench"] = [x for x in slot.get("bench",[]) if x != cid]
    save_squad_raw(uk, raw)
    # 删卡文件
    p = os.path.join(user_dir(uk), f"{cid}.json")
    if os.path.exists(p):
        os.remove(p)
    # 删掉预览 PNG
    for suffix in ("_FUT.png","_GK.png"):
        img_p = os.path.join(SAVE_DIR, f"{sanitize_filename(c['name'])}{suffix}")
        if os.path.exists(img_p):
            try: os.remove(img_p)
            except OSError: pass
    return jsonify({"status":"ok","msg":f"已彻底删除【{c['name']}】"})

@app.route('/card/batch_delete')
def card_batch_delete():
    """批量删除：names=张三,李四,王五"""
    uk = request.args.get('user_key')
    raw_names = request.args.get('names','')
    if not uk or not raw_names: return jsonify({"status":"error","msg":"缺少参数"})
    names = [n.strip() for n in raw_names.split(",") if n.strip()]
    deleted, failed = [], []
    for name in names:
        c = find_card(uk, name)
        if not c or "__ambiguous__" in (c or {}):
            failed.append(name); continue
        cid = c["card_id"]
        raw = load_squad_raw(uk)
        for slot in raw["slots"].values():
            slot["starters"] = {k:v for k,v in slot.get("starters",{}).items() if v != cid}
            slot["bench"] = [x for x in slot.get("bench",[]) if x != cid]
        save_squad_raw(uk, raw)
        p = os.path.join(user_dir(uk), f"{cid}.json")
        if os.path.exists(p):
            os.remove(p)
        deleted.append(c["name"])
    msg_parts = []
    if deleted: msg_parts.append(f"已删除 {len(deleted)} 张: {', '.join(deleted)}")
    if failed: msg_parts.append(f"未找到/歧义 {len(failed)} 张: {', '.join(failed)}")
    return jsonify({"status":"ok","msg":"\n".join(msg_parts) or "什么都没做"})

@app.route('/career/sub')
def career_sub():
    uk = request.args.get('user_key')
    on = request.args.get('on','').strip()
    off = request.args.get('off','').strip()
    if not on or not off:
        return jsonify({"status":"error","msg":"用法: .生涯 换人 <替补名> <首发名>"})
    career = load_career(uk)
    if not career or career["status"] != "active":
        return jsonify({"status":"error","msg":"没有进行中的赛季"})
    r = career_manual_sub(career, on, off)
    if r.get("error"):
        return jsonify({"status":"error","msg":r["error"]})
    save_career(career)
    return jsonify({"status":"ok",
        "msg": f"🔄 换人成功：{r['off']} → {r['on']}（{r['slot']}）\n"
               f"剩余换人名额：{r['left']}"})

@app.route('/match/tiebreak')
def match_tiebreak():
    uk = request.args.get('user_key')
    choice = request.args.get('choice','').lower()   # extra | penalty | accept
    if choice not in ("extra","penalty","accept"):
        return jsonify({"status":"error","msg":"选项应为 加时 / 点球 / 接受"})
    m = find_pending_tiebreak(uk)
    if not m: return jsonify({"status":"error","msg":"没有等待中的选择"})

    side_key = "home" if m["home_key"] == uk else "away"
    m.setdefault("tiebreak_choice", {})[side_key] = choice

    if len(m["tiebreak_choice"]) < 2:
        save_match(m)
        label = {"extra":"加时赛","penalty":"点球大战","accept":"接受平局"}[choice]
        return jsonify({"status":"ok","phase":"await_partner",
            "msg": f"已选择【{label}】，等待对手确认"})

    both = list(m["tiebreak_choice"].values())
    # 决策优先级：任一方要点球 > 任一方要加时 > 双方都接受平局才算平
    if "penalty" in both:
        final_choice = "penalty"
    elif "extra" in both:
        final_choice = "extra"
    else:
        final_choice = "accept"

    m["tiebreak_done"] = True

    if final_choice == "accept":
        # 双方都接受 → 直接终场
        m["status"] = "done"
        final = finalize_match(m)
        save_match(m)
        return jsonify({"status":"ok","phase":"final_draw",
            "final": final,
            "score": f"{m['home']['goals']}:{m['away']['goals']}",
            "msg": "双方接受平局，比赛结束！"})

    if final_choice == "extra":
        m["status"] = "active"
        m["max_round"] += 2
        m["round"] += 1
        for side in (m["home"], m["away"]):
            for cid in side["stamina"]:
                side["stamina"][cid] = min(100, side["stamina"][cid] + 15)
        save_match(m)
        return jsonify({"status":"ok","phase":"extra_start",
            "msg": f"进入加时赛（{m['round']}/{m['max_round']} 回合），下达战术继续"})

    # penalty
    m["status"] = "shootout"
    m["shootout"] = init_shootout(m)
    save_match(m)
    return jsonify({"status":"ok","phase":"shootout_start",
        "msg": "进入点球大战！双方各输入：.对战 指挥 <射门> <守门>\n策略：激进 / 平衡 / 稳重 / 花哨 / 随机"})

def find_active_shootout(uk):
    for mid in _list_matches_sorted():
        m = load_match(mid)
        if m and m["status"]=="shootout" and uk in (m["home_key"], m["away_key"]):
            return m
    return None

@app.route('/match/penalty')
def match_penalty():
    uk = request.args.get('user_key')
    k_raw = request.args.get('kicker','').strip()
    g_raw = request.args.get('gk','').strip()
    k = PEN_STRAT_CN.get(k_raw); g = PEN_STRAT_CN.get(g_raw)
    if not k or not g:
        return jsonify({"status":"error","msg":"策略需为：激进 / 平衡 / 稳重 / 花哨 / 随机"})

    m = find_active_shootout(uk)
    if not m: return jsonify({"status":"error","msg":"没有进行中的点球大战"})

    # 展开随机（每轮独立摇）
    choices = ["aggressive","balanced","steady","fancy"]
    k_effective = random.choice(choices) if k == "random" else k
    g_effective = random.choice(choices) if g == "random" else g

    side_key = "home" if m["home_key"] == uk else "away"
    so = m["shootout"]
    so["pending"][side_key] = {
        "kicker": k_effective, "gk": g_effective,
        "kicker_input": k, "gk_input": g,   # 记录原始输入用于文案
    }

    if len(so["pending"]) < 2:
        save_match(m)
        k_show = f"随机→{STRAT_CN_KEY[k_effective]}" if k == "random" else STRAT_CN_KEY[k_effective]
        g_show = f"随机→{STRAT_CN_KEY[g_effective]}" if g == "random" else STRAT_CN_KEY[g_effective]
        return jsonify({"status":"ok","phase":"waiting_pen",
            "msg": f"策略已锁定（射{k_show} / 守{g_show}），等待对手"})

    return resolve_penalty_round(m)

@app.route('/team/rename')
def team_rename():
    uk = request.args.get('user_key')
    name = (request.args.get('name','') or '').strip()
    if not uk: return jsonify({"status":"error","msg":"missing user_key"})
    if not name: return jsonify({"status":"error","msg":"名字不能为空"})
    if len(name) > 12: return jsonify({"status":"error","msg":"最多 12 个字符"})
    if not re.match(r'^[\u4e00-\u9fa5A-Za-z0-9\s\-·_.]+$', name):
        return jsonify({"status":"error","msg":"仅允许中英文数字和 - · _ ."})
    prof = load_profile(uk)
    old = prof.get("team_name") or "(未设置)"
    prof["team_name"] = name
    save_profile(prof)
    return jsonify({"status":"ok","msg": f"队名: {old} → {name}"})

@app.route('/leaderboard')
def leaderboard_ep():
    top_n = int(request.args.get('n', 20))
    profs = []
    for fn in os.listdir(PROFILES_DIR):
        if not fn.endswith(".json"): continue
        with open(os.path.join(PROFILES_DIR, fn), "r", encoding="utf-8") as f:
            profs.append(json.load(f))
    profs = [p for p in profs if p.get("matches", 0) > 0]
    profs.sort(key=lambda p: -p.get("elo", 1200))
    profs = profs[:top_n]
    if not profs:
        return jsonify({"status":"error","msg":"暂无战绩，先打一场吧"})
    img = render_leaderboard_image(profs)
    return jsonify({"status":"ok","name": img, "count": len(profs)})

@app.route('/profile')
def profile_ep():
    uk = request.args.get('user_key')
    if not uk: return jsonify({"status":"error","msg":"missing user_key"})
    prof = load_profile(uk)
    if prof.get("matches", 0) == 0:
        return jsonify({"status":"error","msg":"还没有比赛记录，去挑战对手吧"})
    all_profs = []
    for fn in os.listdir(PROFILES_DIR):
        if not fn.endswith(".json"): continue
        with open(os.path.join(PROFILES_DIR, fn), "r", encoding="utf-8") as f:
            all_profs.append(json.load(f))
    all_profs = [p for p in all_profs if p.get("matches",0)>0]
    all_profs.sort(key=lambda p: -p.get("elo",1200))
    rank = next((i+1 for i,p in enumerate(all_profs) if p["user_key"]==uk), None)
    img = render_profile_image(prof, rank, len(all_profs))
    return jsonify({"status":"ok","name": img, "rank": rank, "total": len(all_profs)})

@app.route('/get_img')
def get_img():
    title = request.args.get('title')
    p = os.path.join(SAVE_DIR, f"{title}.png")
    return send_file(p, mimetype='image/png') if os.path.exists(p) else ("Not Found", 404)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=22000, threaded=True)
