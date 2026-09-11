# /// script
# dependencies = [
#     "flask",
#     "requests",
#     "pillow",
#     "openai",
#     "python-docx",
#     "PyPDF2",
#     "pymupdf",
#     "openpyxl",
#     "xlrd",
#     "pandas",
# ]
# ///
import os
import json
import time
import base64
import zlib
import re
import uuid
import platform
import ctypes
import threading
import tempfile
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from flask import Flask, request, send_file, jsonify
from PIL import Image, ImageDraw, ImageFont
from openai import OpenAI
try:
    from token_stats import TokenLedger, apply_user_display_names, module_from_mode, render_rankings
except ImportError:
    from .token_stats import TokenLedger, apply_user_display_names, module_from_mode, render_rankings
# 新增依赖
import PyPDF2
import urllib.parse
import zipfile
import shutil
import hashlib
import datetime

# 原有的 imports 保持不变...
from docx import Document

# ================= 配置区域 =================
AI_API_KEY = "sk-这里是你的Key"
AI_BASE_URL = "https://你的网址" # 或 https://api.openai.com/v1
AI_MODEL = "gemini-3-flash-preview"
AI_MODEL_PRO = "gemini-3.1-pro-preview"

# --- 备用模型配置（保留 DS_* 变量名以兼容旧部署） ---
DS_API_KEY = os.getenv("LOGAI_BACKUP_API_KEY", "sk-你的DeepSleepKey")
DS_BASE_URL = os.getenv("LOGAI_BACKUP_BASE_URL", "https://api.deepseek.com/v1")
DS_MODEL = "deepseek-v4-flash" # 填入你想用的V4版本代号，如 deepseek-reasoner 或 deepseek-v4
DS_MODEL_PRO = "deepseek-v4-pro" # 对应 DeepSeek R1 (Pro级别推理模型)
BACKUP_MODEL_LABEL = os.getenv("LOGAI_BACKUP_MODEL_LABEL", "备用模型")
BACKUP_MODEL_ALLOWLIST = {x.strip() for x in os.getenv("LOGAI_BACKUP_MODEL_ALLOWLIST", "").split(",") if x.strip()}

def resolve_backup_model(requested_model, is_pro=False):
    fallback = DS_MODEL_PRO if is_pro else DS_MODEL
    requested = str(requested_model or "").strip()
    if not requested or len(requested) > 128:
        return fallback
    if BACKUP_MODEL_ALLOWLIST and requested not in BACKUP_MODEL_ALLOWLIST:
        return fallback
    return requested

# --- 绘图专用配置 (NovelAI) ---
# 请填入 NovelAI 提供的 API Key (通常是以 pst- 开头的一长串字符)
IMAGE_API_KEY = "pst-我的NovelAI"

# 推荐使用最新的 V3 模型，这是目前 NovelAI 画二次元最好的模型
IMAGE_MODEL = "nai-diffusion-4-5-full" 
# ===========================================

# ================= 角色卡评分模式（新增） =================
SHEET_SCORE_SYSTEM_PROMPT = """
你是一位阅历丰富的 COC/DND 跑团 KP，同时也是 TRPG 角色卡评审官。
请阅读以下 Excel/CSV 角色卡的原始表格文字，先从中定位出【姓名】【年龄】【属性】【技能】【背景故事】五个关键字段，
再对角色卡进行综合打分与点评。

评分维度参考：
  1. 属性合理性：各项属性数值是否符合 COC/DND 规则、是否失衡或数值堆砌
  2. 技能配置：技能点分配是否与职业/背景契合、是否合理
  3. 背景故事：完整度、深度、代入感、和角色属性技能的呼应
  4. 整体协调：姓名年龄属性技能与背景之间的一致性、可玩性

请严格按照以下格式输出（不要用 Markdown，不要加粗，直接分行）：

【姓名】：(从表格中读到的角色名，未读到写"未知")
【年龄】：(数字或范围，未读到写"未知")
【总体评分】：(0-100分)
(简述打分理由，最多两句)
【属性点评】：
(分析属性配置，找出高低点，指出是否失衡)
【技能点评】：
(分析技能分配是否合理、是否契合背景)
【背景故事点评】：
(评价背景故事的完整度、代入感、以及和属性/技能的呼应)
【亮点】：
(找出这张角色卡最出彩的一到两点，没有则写"暂无明显亮点")
【KP寄语】：
(用一句话给出建议或期待)

风格要求：客观犀利、有代入感，不轻易给高分（60-75 是常态，80+ 需要真正惊艳）。
"""

DND_SHEET_SCORE_SYSTEM_PROMPT = """
你是一位熟悉 D&D 5E 的资深 DM，同时也是角色构筑与叙事评审官。
当前文件是 DND 角色卡。请综合阅读所有匹配到的核心工作表，不要只分析其中一张。
目前兼容两套命名：【起源、主要、背包】以及【角色、主要情况、背包、施法】：
- 起源/角色：姓名、种族、职业、等级、背景、阵营、人物经历与个性设定
- 主要/主要情况：力量/敏捷/体质/智力/感知/魅力、熟练项、豁免、技能、AC、HP、速度、攻击等核心数据
- 背包：武器、防具、冒险装备、货币、负重与消耗品
- 施法：施法属性、法术豁免 DC、法术攻击、法术位、戏法与已知/准备法术

评分时不要把 DND 数值套用 COC 百分制标准。重点检查：
1. 起源一致性：种族、职业、背景、阵营和人物设定是否互相呼应
2. 构筑合理性：六维、熟练加值、豁免、技能、战斗数据与当前等级是否合理，是否存在明显填卡错误
3. 战斗与冒险能力：攻击、防御、法术、技能覆盖是否符合职业定位，并保留合理短板
4. 背包合理性：装备是否符合职业与背景，防具武器是否可用，负重、货币和资源是否明显异常
5. 角色可玩性：叙事钩子、队伍协作空间、成长方向与实际跑团表现潜力

请严格按照以下格式输出（不要用 Markdown，不要加粗，直接分行）：
【姓名】：(未读到写"未知")
【年龄】：(未读到可写"未知"，不要因 DND 卡没有年龄而扣分)
【总体评分】：(0-100分)
(简述打分理由，最多两句)
【起源点评】：
(评价种族、职业、背景、阵营与人物设定的一致性)
【属性与构筑点评】：
(评价六维、豁免、技能、AC/HP、攻击、法术与等级合理性)
【背包点评】：
(评价武器、防具、装备、货币、负重和资源配置)
【亮点】：
(列出一到两项最出彩之处，没有则写"暂无明显亮点")
【问题与建议】：
(指出疑似填卡错误、规则冲突或最值得调整之处)
【DM寄语】：
(用一句话给出建议或期待)

风格要求：专业、客观、有 DND 规则意识。60-75 为正常可用，80+ 应有优秀构筑或鲜明角色塑造。
"""

# 品质档位（用于 summary.tier）
def sheet_score_to_tier(score: int) -> str:
    try:
        s = int(score)
    except Exception:
        return "普通"
    if s >= 95: return "传奇"
    if s >= 88: return "史诗"
    if s >= 80: return "稀有"
    if s >= 70: return "优良"
    if s >= 60: return "普通"
    return "粗糙"

def parse_sheet_summary(result_text: str) -> dict:
    """从 AI 返回的评分文本中抽取 姓名/年龄/总评分/品质，供 JS 前端展示。"""
    summary = {}
    try:
        m = re.search(r"【\s*姓名\s*】\s*[:：]\s*([^\n【]+)", result_text)
        if m:
            summary["name"] = m.group(1).strip()
        m = re.search(r"【\s*年龄\s*】\s*[:：]\s*([^\n【]+)", result_text)
        if m:
            summary["age"] = m.group(1).strip()
        m = re.search(r"【\s*总体评分\s*】\s*[:：]\s*(\d{1,3})", result_text)
        if m:
            score = int(m.group(1))
            score = max(0, min(100, score))
            summary["score"] = score
            summary["tier"] = sheet_score_to_tier(score)
    except Exception as e:
        print(f"parse_sheet_summary 失败: {e}")
    return summary
# ==========================================================

PRO_SYSTEM_PROMPT = """
            你是一位毒舌但极其专业的 TRPG 跑团鉴赏家（KP/DM）。请阅读以下跑团 Log，生成一份简报。
            请严格按照以下格式输出（不要用 Markdown，不要加粗，直接分行）：

           【总体评分】：(0-100分)
           (请给出理由)
           【剧情概要】：
           (简述发生了什么，500字内)
           【高光时刻】：
           (找出1-3个最精彩或最搞的一幕)
           【主要槽点】：
           (吐槽逻辑漏洞、糟糕的RP或离谱的操作)
           【KP寄语】：
           (一句话总结)

           风格要求：幽默、犀利、像老练的调查员在写结案报告。当日志内容是DND时，将KP寄语替换成DM寄语。
    """

KIND_SYSTEM_PROMPT = """
            你是一位温柔但极其专业的 TRPG 跑团鉴赏家（KP/DM）。请阅读以下跑团 Log，生成一份简报。
            请严格按照以下格式输出（不要用 Markdown，不要加粗，直接分行）：

           【总体评分】：(0-100分)
           (请给出理由)
           【剧情概要】：
           (简述发生了什么，500字内)
           【高光时刻】：
           (找出1-3个最精彩或最搞的一幕)
           【主要槽点】：
           (吐槽逻辑漏洞、糟糕的RP或离谱的操作)
           【KP寄语】：
           (一句话总结)

           风格要求：给予适当的鼓励以及表演，表现的更加体贴人。当日志内容是DND时，将KP寄语替换成DM寄语。
    """

DEFAULT_SYSTEM_PROMPT = """
            你是一位毒舌但极其专业的 TRPG 跑团鉴赏家（KP/DM）。请阅读以下跑团 Log，生成一份简报。
            请严格按照以下格式输出（不要用 Markdown，不要加粗，直接分行）：

           【总体评分】：(0-100分)
           (请给出理由)
           【剧情概要】：
           (简述发生了什么，500字内)
           【高光时刻】：
           (找出1-3个最精彩或最搞的一幕)
           【主要槽点】：
           (吐槽逻辑漏洞、糟糕的RP或离谱的操作)
           【KP寄语】：
           (一句话总结)

           风格要求：幽默、犀利、像老练的调查员在写结案报告。当日志内容是DND时，将KP寄语替换成DM寄语。
    """

LOG_SCORE_PRECISION_REQUIREMENT = """
【六维评分精度要求】：六维分数必须是基于日志证据的精确整数，允许使用任意个位数（例如 63、78、91）。不要为了整齐而四舍五入，也不要批量使用整 5、整 10 或相同分数；只有证据确实相同时才可以给出相同分数。
"""

# 字体路径
FONT_PATH = "C:/Windows/Fonts/msyh.ttc" 

# 最大处理条目数
MAX_LOG_ENTRIES = 20000
# 发送给 AI 的最大字符数
MAX_AI_CHARS = 1000000

# --- 百度网盘 OpenAPI 配置 ---
BAIDU_APP_KEY = "百度应用吗"
BAIDU_SECRET_KEY = "咪咪"
# 首次使用前，请在浏览器访问以下链接（将其中的【你的AppKey】替换成实际的AppKey）：
# http://openapi.baidu.com/oauth/2.0/authorize?response_type=code&client_id=【你的AppKey】&redirect_uri=oob&scope=basic,netdisk
# 同意授权后，网页会显示一段 Authorization Code，将其复制到下方：
BAIDU_AUTH_CODE = "授权"

BAIDU_TARGET_DIR = "/coc_20260220_041522" # 指定的搜索目录
BAIDU_TOKEN_FILE = "baidu_token.json"    # 用于持久化保存token的文件

# ===========================================

# ===========================================

# --- 每日全局省流缓存池 ---
DAILY_CACHE = {}

def get_daily_cache(hash_key):
    """获取今日的缓存图片，跨天自动清空内存"""
    today = datetime.date.today().isoformat()
    if today not in DAILY_CACHE:
        DAILY_CACHE.clear()
        DAILY_CACHE[today] = {}
    return DAILY_CACHE[today].get(hash_key)

def set_daily_cache(hash_key, images_list):
    """将生成的图片字节流写入今日缓存池"""
    today = datetime.date.today().isoformat()
    if today not in DAILY_CACHE:
        DAILY_CACHE.clear()
        DAILY_CACHE[today] = {}
    DAILY_CACHE[today][hash_key] = images_list

# ================= 角色卡库（新增，供 Log 分析器联动使用） =================
# 目录结构： sheet_cards/{group_key}/{name}.json
# 单张卡数据结构：
#   {
#     "name": "...", "age": "...",
#     "attributes": "STR 70 CON 60 ...",
#     "skills": "侦查 60 图书馆 55 ...",
#     "background": "背景故事纯文本...",
#     "score": 78, "tier": "优良",
#     "user_key": "12345678", "group_key": "-1",
#     "updated": 1783200000
#   }
SHEET_CARDS_DIR = "sheet_cards"

def _sanitize_filename(s: str) -> str:
    if not s:
        return "unknown"
    s = s.strip()
    return re.sub(r'[\\/:*?"<>|\s]+', '_', s)[:60] or "unknown"

def get_cards_dir(user_key: str = "") -> str:
    """角色卡按【用户 QQ】隔离，实现跨群共享。user_key 为空时落到公共目录。"""
    sub = _sanitize_filename(user_key) if user_key else "public"
    path = os.path.join(SHEET_CARDS_DIR, sub)
    os.makedirs(path, exist_ok=True)
    return path

def save_sheet_card(user_key: str, card: dict) -> str:
    """将一张角色卡持久化到用户名下的卡库，返回文件路径。"""
    name = card.get("name") or "未命名"
    dir_path = get_cards_dir(user_key)
    filename = f"{_sanitize_filename(name)}.json"
    fpath = os.path.join(dir_path, filename)
    try:
        card.setdefault("updated", int(time.time()))
        # 同步记录持有者，方便跨群反查
        if user_key:
            card["owner"] = user_key
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(card, f, ensure_ascii=False, indent=2)
        print(f"[角色卡库] 已保存 {fpath}")
    except Exception as e:
        print(f"[角色卡库] 保存失败: {e}")
    return fpath

def load_user_cards(user_key: str = "") -> list:
    """读取指定用户的所有角色卡；user_key 为空时汇总全库所有用户的卡片。"""
    cards = []
    if not os.path.isdir(SHEET_CARDS_DIR):
        return cards
    dirs = []
    if user_key:
        dirs.append(get_cards_dir(user_key))
    else:
        for sub in os.listdir(SHEET_CARDS_DIR):
            p = os.path.join(SHEET_CARDS_DIR, sub)
            if os.path.isdir(p):
                dirs.append(p)
    for d in dirs:
        try:
            for name in os.listdir(d):
                if not name.endswith(".json"):
                    continue
                try:
                    with open(os.path.join(d, name), "r", encoding="utf-8") as f:
                        cards.append(json.load(f))
                except Exception as e:
                    print(f"[角色卡库] 跳过损坏卡 {name}: {e}")
        except Exception as e:
            print(f"[角色卡库] 读取目录失败 {d}: {e}")
    return cards

# 兼容旧调用名
def load_group_cards(user_key: str = "") -> list:
    return load_user_cards(user_key)

def _name_similarity(a: str, b: str) -> float:
    """基于最长公共子串比 + 序列匹配的简单相似度。"""
    if not a or not b:
        return 0.0
    a2 = a.strip().lower()
    b2 = b.strip().lower()
    if a2 == b2:
        return 1.0
    if a2 in b2 or b2 in a2:
        # 短包含长时相似度按长度比例给
        return min(len(a2), len(b2)) / max(len(a2), len(b2))
    try:
        from difflib import SequenceMatcher
        return SequenceMatcher(None, a2, b2).ratio()
    except Exception:
        return 0.0

def find_matching_cards(log_text: str, user_key: str = "", threshold: float = 0.72) -> list:
    """扫描 log 文本，找出姓名匹配（或高相似）的所有卡片。
    卡库按用户跨群共享：user_key 传空则遍历全库（Log 分析器场景常用）。"""
    if not log_text:
        return []
    matched = []
    # 用户指定：优先该用户名下；否则直接全库遍历（跨群共享的核心逻辑）
    cards = load_user_cards(user_key)
    if not cards and user_key:
        cards = load_user_cards("")
    for card in cards:
        name = (card.get("name") or "").strip()
        if not name or name == "未知":
            continue
        # 快速通道：完整姓名子串命中
        if name in log_text:
            matched.append((card, 1.0))
            continue
        # 兜底：逐行扫描说话者身份（`昵称: ...`）做相似度匹配
        best = 0.0
        for line in log_text.split("\n"):
            speaker = line.split(":", 1)[0].strip() if ":" in line else line.split("：", 1)[0].strip()
            if not speaker or len(speaker) > 20:
                continue
            sim = _name_similarity(name, speaker)
            if sim > best:
                best = sim
                if best >= 0.99:
                    break
        if best >= threshold:
            matched.append((card, best))
    # 按相似度降序、最多取 6 张避免 prompt 爆炸
    matched.sort(key=lambda x: x[1], reverse=True)
    return [m[0] for m in matched[:6]]

def build_sheet_context(cards: list) -> str:
    """把匹配到的卡片拼成一段 system prompt 追加内容。"""
    if not cards:
        return ""
    lines = ["\n\n【已知角色卡资料 · 由角色卡评分器联动提供】",
             "以下是本次 Log 中出现的角色的档案，请在分析时结合这些资料给出更深入的见解，"
             "指出角色的行动是否符合其属性/技能/背景，或对比 log 中的表现与卡面设定是否协调："]
    for i, c in enumerate(cards, 1):
        lines.append(f"\n—— 角色 {i}：{c.get('name','未知')} ——")
        if c.get("age"):
            lines.append(f"年龄：{c['age']}")
        if c.get("attributes"):
            attrs = c["attributes"].strip()
            if len(attrs) > 400: attrs = attrs[:400] + "..."
            lines.append(f"属性：{attrs}")
        if c.get("skills"):
            sk = c["skills"].strip()
            if len(sk) > 400: sk = sk[:400] + "..."
            lines.append(f"技能：{sk}")
        if c.get("background"):
            bg = c["background"].strip()
            if len(bg) > 800: bg = bg[:800] + "..."
            lines.append(f"背景故事：{bg}")
    return "\n".join(lines)

# 从 AI 评分文本 + 表格原文中抽取属性/技能/背景（宽松匹配）
def parse_sheet_full_fields(sheet_raw_text: str, ai_result_text: str) -> dict:
    """在评分结果之外，再抽取属性/技能/背景故事三个原文字段以便持久化。"""
    data = {"attributes": "", "skills": "", "background": ""}

    # 优先从 AI 输出中拿 “【背景故事点评】” 等，作为兜底
    def _grab(section_names, text):
        for name in section_names:
            m = re.search(rf"【\s*{name}\s*】\s*[:：]?\s*([\s\S]*?)(?=\n【|$)", text)
            if m:
                v = m.group(1).strip()
                if v:
                    return v
        return ""

    # 从表格原文（拉平后的 " | " 文本）里根据关键字扫描
    if sheet_raw_text:
        # 归一化
        raw = sheet_raw_text.replace("：", ":")
        # 属性关键字（COC）
        attr_keys = ["STR","力量","CON","体质","SIZ","体型","DEX","敏捷","APP","外貌",
                     "INT","智力","POW","意志","EDU","教育","LUCK","幸运","HP","MP","SAN","理智"]
        found_attrs = []
        for kw in attr_keys:
            for m in re.finditer(rf"{kw}\s*[:：|]?\s*(\d{{1,3}})", raw, re.IGNORECASE):
                found_attrs.append(f"{kw} {m.group(1)}")
        if found_attrs:
            data["attributes"] = " / ".join(dict.fromkeys(found_attrs))  # 去重保序

        # 技能：抓 "技能名 数字" 形式（简单启发式），限量 30 条
        skill_matches = re.findall(r"([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z（）() ]{1,10})\s*[|:：]\s*(\d{1,3})", raw)
        skills = []
        for k, v in skill_matches:
            k2 = k.strip()
            # 过滤掉属性关键字避免重复
            if k2 in attr_keys or k2.upper() in [x.upper() for x in attr_keys]:
                continue
            if 1 <= len(k2) <= 12 and 1 <= int(v) <= 100:
                skills.append(f"{k2} {v}")
        if skills:
            data["skills"] = " / ".join(dict.fromkeys(skills[:30]))

        # 背景故事：找 "背景故事"/"背景"/"个人描述" 后的一段较长文本
        m = re.search(r"(背景故事|背景介绍|个人描述|个人背景|背景)\s*[:：|]?\s*([\s\S]{15,1500})", raw)
        if m:
            bg = m.group(2)
            # 截断到下一处明显是新字段的位置
            bg = re.split(r"\n\s*={3,}|\n\s*工作表[:：]|\n\s*[A-Za-z\u4e00-\u9fa5]{1,8}\s*[:：|]\s*\d", bg)[0]
            data["background"] = bg.strip()[:1500]

    # AI 输出兜底补齐
    if not data["background"]:
        data["background"] = _grab(["背景故事点评", "背景故事"], ai_result_text or "")
    return data
# ==========================================================

app = Flask(__name__)
client = OpenAI(api_key=AI_API_KEY, base_url=AI_BASE_URL)
# 备用模型客户端；默认仍指向原 DS 配置。
ds_client = OpenAI(api_key=DS_API_KEY, base_url=DS_BASE_URL)
backup_client = ds_client
TOKEN_LEDGER = TokenLedger(os.getenv(
    "LOGAI_TOKEN_LEDGER",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "token_usage.jsonl")
))

def record_token_usage(response, messages, *, module="other", model="", user_key="", user_name="",
                       group_key="", prompt_name="", prompt="", job_id=""):
    try:
        return TOKEN_LEDGER.record(
            response, messages,
            module=module, model=model, user_key=user_key, user_name=user_name,
            group_key=group_key, prompt_name=prompt_name, prompt=prompt, job_id=job_id,
        )
    except Exception as exc:
        print(f"[{job_id}] Token usage recording failed (ignored): {exc}")
        return None

# 任务队列与缓存
executor = ThreadPoolExecutor(max_workers=4) # 允许同时处理4个分析任务
# 跑团活跃度计时器的复盘/归档任务单独排队，避免模型请求阻塞普通分析和图片排版。
review_executor = ThreadPoolExecutor(
    max_workers=max(1, min(16, int(os.environ.get('LOGAI_REVIEW_WORKERS', '8'))))
)
JOB_CACHE = {} # 存储任务状态和结果

PAINTER_SERVERS = [
    'https://s02.trpgbot.com/s/',
    'https://s03.trpgbot.com/models/',
    'https://api.dice.center/dicelogger/'
]
KOKONA_BASE_URL = "https://dicelogger.s3-accelerate.amazonaws.com/"

# --- 系统工具 ---
def disable_quick_edit():
    """禁用Windows快速编辑模式防挂起"""
    if platform.system() == "Windows":
        try:
            kernel32 = ctypes.windll.kernel32
            hInput = kernel32.GetStdHandle(-10)
            mode = ctypes.c_ulong()
            kernel32.GetConsoleMode(hInput, ctypes.byref(mode))
            mode.value &= ~0x0040
            mode.value &= ~0x0020
            kernel32.SetConsoleMode(hInput, mode)
        except: pass

def get_session():
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Connection": "keep-alive"
    })
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))
    return session

def safe_decode(byte_content):
    if not byte_content: return ""
    for encoding in ['utf-8', 'gb18030', 'big5']:
        try: return byte_content.decode(encoding)
        except: pass
    return byte_content.decode('utf-8', errors='ignore')

# --- 数据获取函数 (复用之前的逻辑) ---
def fetch_weizaima(key, password=None):
    try:
        resp = get_session().get("https://weizaima.com/dice/api/load_data", params={"key": key, "password": password}, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            if 'data' in data:
                return json.loads(zlib.decompress(base64.b64decode(data['data'])).decode('utf-8'))
    except Exception as e: print(f"Weizaima Error: {e}")
    return None

def format_weizaima_text(log_obj):
    if not log_obj: return ""
    items = log_obj.get('items', []) or log_obj.get('data', {}).get('items', [])
    lines = [f"{i.get('nickname','?')}: {i.get('message','')}" for i in items[:MAX_LOG_ENTRIES] if i.get('message') and "[CQ:image" not in i.get('message')]
    return "\n".join(lines)

def fetch_trpgbot(full_id):
    try:
        sid, log_id = full_id.split('-', 1)
        base_url = PAINTER_SERVERS[int(sid)]
        sess = get_session()
        sess.headers.update({"Referer": "https://logpainter.trpgbot.com/"})
        meta = sess.get(f"{base_url}logReader.php", params={"m": "metaData", "id": log_id, "r": 0.1}, timeout=20).json()
        dl_url = meta.get('redirectDownloadUrl') or f"{base_url}logReader.php?m=rawData&id={log_id}"
        return safe_decode(sess.get(dl_url, timeout=90).content)
    except Exception as e: print(f"TRPGBot Error: {e}"); return None

def fetch_kokona(s3_key):
    try:
        resp = get_session().get(f"{KOKONA_BASE_URL}{s3_key}", timeout=60)
        return safe_decode(resp.content) if resp.status_code == 200 else None
    except Exception as e: print(f"Kokona Error: {e}"); return None

def format_raw_text(raw_text):
    if not raw_text: return ""
    lines = raw_text.split('\n')
    pattern = re.compile(r'<(.*?)>(.*)')
    clean = []
    for line in lines[:MAX_LOG_ENTRIES]:
        line = line.strip()
        if not line: continue
        m = pattern.search(line)
        if m: clean.append(f"{m.group(1)}: {m.group(2).strip()}")
        else:
            l = re.sub(r'^(\d{4}[-/]\d{2}[-/]\d{2})?\s*\d{1,2}:\d{2}:\d{2}\s*', '', line)
            if l: clean.append(l)
    return "\n".join(clean)

def fetch_and_join_logs(log_sources, key=None, password=None, source=None):
    """按用户给定顺序读取多个 Log，并用明确分隔线拼接。"""
    sources = log_sources if isinstance(log_sources, list) and log_sources else [
        {'key': key, 'password': password, 'source': source}
    ]
    parts = []
    failures = []
    for index, item in enumerate(sources, 1):
        item = item if isinstance(item, dict) else {'key': item}
        item_key = str(item.get('key') or '').strip()
        item_source = str(item.get('source') or '').strip().lower()
        item_password = item.get('password')
        if not item_key:
            failures.append(f'第{index}段缺少 key')
            continue
        try:
            if not item_source:
                if '-' in item_key and item_key.split('-', 1)[0].isdigit(): item_source = 'trpgbot'
                elif '_' in item_key or len(item_key) > 20: item_source = 'kokona'
                else: item_source = 'weizaima'
            if item_source == 'kokona': raw = fetch_kokona(item_key)
            elif item_source == 'trpgbot': raw = fetch_trpgbot(item_key)
            else: raw = fetch_weizaima(item_key, item_password)
            text = format_raw_text(raw) if item_source != 'weizaima' else format_weizaima_text(raw)
            if text.strip(): parts.append(f'【第{index}段 Log】\n{text.strip()}')
            else: failures.append(f'第{index}段读取为空')
        except Exception as exc:
            failures.append(f'第{index}段读取失败: {exc}')
    if not parts:
        detail = '；'.join(failures)
        raise Exception(f'日志内容获取失败或为空{("：" + detail) if detail else ""}')
    return '\n\n========== Log 顺序拼接分隔线 ==========\n\n'.join(parts), failures

# --- 核心处理任务 ---
def background_process(job_id, key, password, source, is_pro=False, is_kind=False, mode='analyze', persona="", custom_prompt="", theme='default', is_ds=False, group_key="", backup_model="", user_key="", user_name="", custom_name="", token_module="", log_sources=None):
    """后台线程：执行 Log 下载、分析、绘图"""
    print(f"[{job_id}] 开始处理Log... Source: {source}, Mode: {mode}")
    try:
        # ================= 1. 尝试触发省流缓存 =================
        hash_key = None
        if not is_pro:
            # 只有普通模式参与缓存，确保同一个Log和同样的提示配置拥有唯一签名
            source_signature = json.dumps(log_sources or [], ensure_ascii=False, sort_keys=True, default=str)
            hash_str = f"url_log_v3_{key}_{source_signature}_{mode}_{is_kind}_{persona}_{custom_prompt}_{theme}_{is_ds}_{backup_model}"
            hash_key = hashlib.md5(hash_str.encode('utf-8')).hexdigest()
            cached_images = get_daily_cache(hash_key)
            if cached_images:
                print(f"[{job_id}] 命中今日缓存库！省流模式启动，秒回历史图片。")
                JOB_CACHE[job_id]['status'] = 'done'
                JOB_CACHE[job_id]['images'] = cached_images
                return
        # ========================================================
        log_text, source_failures = fetch_and_join_logs(log_sources, key, password, source)
        if source_failures:
            print(f"[{job_id}] 部分 Log 读取失败（已跳过）: {'；'.join(source_failures)}")
        
        if not log_text:
            raise Exception("日志内容获取失败或为空")

        # 智能截断防爆 Token
        if len(log_text) > MAX_AI_CHARS:
            part = int(MAX_AI_CHARS * 0.4)
            mid = log_text[part:-part].split('\n')
            step = max(1, int(len(mid)/100))
            log_text_ai = f"{log_text[:part]}\n...[略]...\n{chr(10).join(mid[::step])}\n{log_text[-part:]}"
        else:
            log_text_ai = log_text

        # 核心：根据不同模式分配对应的 Prompt
        report_title = "TRPG 跑团日志分析"
        # 【新增】：如果有自定义提示词，强行覆盖，并把标题改为自定义
        if custom_prompt:
            system_prompt = custom_prompt
            report_title = "TRPG 自定义分析报告"
        
        elif mode == 'recap':
            report_title = "TRPG 跑团前文回顾"
            system_prompt = """你是一个专业且细致的 TRPG 跑团记录员（书记）。请阅读以下跑团 Log，为 KP 和玩家梳理一份详细的【前文回顾】，帮助大家快速找回跑团记忆。
请严格按照以下 4 个板块输出，并且在输出每个大板块之前，必须使用“【分页符】”这四个字单起一行作为分隔标识（不要用Markdown，不要加粗）：

【分页符】
【一、当前剧情进度总览】：
（详细说明截至目前的故事进度，大家在哪，正在面临什么状况，遇到了什么危机或主线推进到了哪一步）
【分页符】
【二、PC行动轨迹与状态梳理】：
（尽可能详细分条列出每位主要玩家角色/PC近期做了什么举动，达成了什么目的，或处于什么特殊状态/受到什么伤害）
【分页符】
【三、当前已获线索与道具盘点】：
（总结当前大家掌握的所有情报、未解之谜、NPC给出的重要信息以及拿到的关键道具）
【分页符】
【四、下一步推进方向提示】：
（基于当前局势，客观给出2-3个可供调查员们继续推进剧情的可能方向或需要立刻解决的问题）"""

        else: # 默认的 analyze 评分分析
            report_title = "TRPG 跑团日志评分"
            if is_kind: system_prompt = KIND_SYSTEM_PROMPT
            elif is_pro: system_prompt = PRO_SYSTEM_PROMPT
            else: system_prompt = DEFAULT_SYSTEM_PROMPT
            system_prompt += LOG_SCORE_PRECISION_REQUIREMENT
        
        # 核心：人设系统劫持（强制带入骰娘语气且防止格式崩溃）
        if persona:
            system_prompt += f"\n\n【极其重要的扮演指令】：\n在生成上述所有评价和梳理内容时，请你完全带入以下角色人设来进行语气和口吻的渲染。你可以自称、吐槽或撒娇，让输出充满该人设的个性。\n（绝对警告：你必须严格保留前文要求的【板块标题】和【分页符】等格式标识符，千万不能省略或修改它们，只能改变正文部分的说话语气！）：\n{persona}"

        # 【联动】：从角色卡库中挖出出现在本 Log 里的 PC 档案，注入 system prompt
        # 卡库按【用户】隔离并跨群共享；Log 分析器场景没有 user_key，因此走全库扫描
        try:
            matched_cards = find_matching_cards(log_text, user_key="")
            if matched_cards:
                system_prompt += build_sheet_context(matched_cards)
                print(f"[{job_id}] 已联动注入 {len(matched_cards)} 张角色卡资料: {[c.get('name') for c in matched_cards]}")
        except Exception as e_match:
            print(f"[{job_id}] 角色卡联动失败(忽略): {e_match}")

        # 【新增】：如果用户没指定主题，赋予大模型绝对的主题控制权！
        if theme == 'default':
            system_prompt += "\n\n【排版指令】：你可以根据当前内容的故事氛围，在回复的【最开头】加上标签以控制最终生成的图片风格。支持的标签有：【主题：经典】、【主题：克苏鲁】、【主题：赛博】、【主题：历史】、【主题：废土】、【主题：二次元】、【主题：终端】。如果你觉得不需要特殊风格，可不写此标签。"

        # 5. 请求 AI
        print(f"[{job_id}] 未命中缓存，开始请求 LLM 消耗 Token...")

        # 动态分配模型通道：支持 Gemini Pro / DS Flash / DS Pro 的四象限切换
        current_client = backup_client if is_ds else client
        if is_ds:
            current_model = resolve_backup_model(backup_model, is_pro)
            max_t = 65535
        else:
            current_model = AI_MODEL_PRO if is_pro else AI_MODEL
            max_t = 65535

        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": log_text_ai}]
        resp = current_client.chat.completions.create(
            model=current_model,
            messages=messages,
            temperature=1.0, max_tokens=max_t
        )
        usage_record = record_token_usage(
            resp, messages, module=token_module or module_from_mode(mode), model=current_model,
            user_key=user_key, user_name=user_name, group_key=group_key,
            prompt_name=custom_name or ("温柔模式" if is_kind else "默认提示词"),
            prompt=custom_prompt or system_prompt, job_id=job_id,
        )
        result_text = resp.choices[0].message.content
        token_usage = f" | Tokens: {usage_record['total_tokens']}" if usage_record else ""
        
        result_text, final_theme = extract_theme_from_text(result_text, theme)

        # 6. 绘图与返回
        images_list = text_to_images(result_text, f"Key:{key[:8]}", report_title, final_theme, token_usage)
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['images'] = images_list
        print(f"[{job_id}] 渲染处理完成")

        # ================= 7. 写入省流缓存 =================
        if not is_pro and hash_key:
            set_daily_cache(hash_key, images_list)
            print(f"[{job_id}] 结果已存入今日缓存库。")

    except Exception as e:
        print(f"[{job_id}] 失败: {e}")
        err_img_bytes = text_to_images(f"Log处理失败：\n{str(e)}", "Error")[0]
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['images'] = [err_img_bytes]

def extract_text_from_file(file_content, filename, card_system="auto"):
    """根据文件扩展名提取文本，增强容错能力"""
    ext = os.path.splitext(filename)[1].lower()
    text = ""

    # Excel 文件名不总可信：部分 WPS/QQ 文件实际是 XLS，却使用了 .xlsx 后缀。
    if ext in ('.xlsx', '.xls'):
        head = file_content[:16]
        if head.startswith(b'PK\x03\x04'):
            ext = '.xlsx'
        elif head.startswith(b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'):
            ext = '.xls'
        else:
            preview = safe_decode(file_content[:300]).strip().replace('\r', ' ').replace('\n', ' ')
            if preview.startswith('<') or preview.startswith('{') or preview.startswith('['):
                return f"[ParseError]下载到的不是 Excel 文件，而是网页或接口响应：{preview[:160]}。请检查 OneBot 群文件下载直链是否有效。"
            return f"[ParseError]文件名虽为 Excel，但内容不是标准 XLSX/旧版 XLS。文件头={head.hex()}，可能是下载直链失效、文件损坏或扩展名错误。"
    
    try:
        file_stream = BytesIO(file_content)
        
        if ext in ['.txt', '.md', '.json', '.yaml', '.yml']:
            text = safe_decode(file_content)
            
        elif ext == '.docx':
            doc = Document(file_stream)
            text = "\n".join([para.text for para in doc.paragraphs])
            
        elif ext == '.pdf':
            # 改用 pymupdf (fitz) 读取PDF，容错率极高，会自动忽略纯图片
            import fitz
            pdf_document = fitz.open(stream=file_content, filetype="pdf")
            pages_text = []
            # 限制读取前300页防撑爆内存
            for page_num in range(min(len(pdf_document), 300)): 
                pages_text.append(pdf_document[page_num].get_text())
            text = "\n".join(pages_text)
            pdf_document.close()

        elif ext in ['.xlsx', '.xls']:
            # 【Excel 角色卡】：多级级联解析，保证在 openpyxl 严格校验/pandas 缺失时仍可读取
            # 只读取"人物卡/角色卡"目标工作表，避免装备表/剧情表/规则说明等浪费 Token
            _SHEET_KEYWORDS = ("人物卡", "角色卡", "人物", "角色", "character", "sheet1", "sheet")
            _DND_SHEET_GROUPS = (("起源", "角色"), ("主要", "主要情况"), ("背包",), ("施法",))

            def _pick_target_sheet_names(all_names):
                """
                从工作表名列表中挑出"人物卡"目标表。
                策略：
                  1) 精确等于 "人物卡" / "角色卡" → 只保留它
                  2) 名字包含 "人物卡" / "角色卡" 关键词 → 保留匹配到的所有
                  3) 都没匹配到 → 兜底保留第一张表（避免读空）
                返回：命中的名字列表，按原顺序。
                """
                if not all_names:
                    return []
                normalized = {str(n).strip().lower(): n for n in all_names}
                dnd_hits = []
                matched_groups = 0
                for aliases in _DND_SHEET_GROUPS:
                    group_hits = [normalized[name.lower()] for name in aliases if name.lower() in normalized]
                    if group_hits:
                        matched_groups += 1
                        dnd_hits.extend(group_hits)
                if card_system == "dnd" or matched_groups >= 2:
                    return dnd_hits or [all_names[0]]
                # 精确匹配
                for pri in ("人物卡", "角色卡", "Character Sheet", "character sheet"):
                    hit = [n for n in all_names if str(n).strip() == pri]
                    if hit:
                        return hit
                # 关键词包含
                fuzzy = []
                for n in all_names:
                    ns = str(n).lower()
                    for kw in _SHEET_KEYWORDS:
                        if kw.lower() in ns:
                            fuzzy.append(n)
                            break
                if fuzzy:
                    return fuzzy
                # 兜底：只取第一张
                return [all_names[0]]

            def _xlsx_strip_and_load(raw_bytes):
                """
                openpyxl 对 WPS / 部分 Office 版本导出的 xlsx 中非标准 dataValidation 类型
                （如 phoneNumber、date2）会抛：
                  Value must be one of {'whole','date','time','list','custom','decimal','textLength'}
                这里把 <dataValidations> 节点整体剔除后再让 openpyxl 加载。
                """
                import zipfile, io, re as _re
                import openpyxl
                src = io.BytesIO(raw_bytes)
                dst = io.BytesIO()
                with zipfile.ZipFile(src, 'r') as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
                    for item in zin.namelist():
                        data = zin.read(item)
                        if item.startswith('xl/worksheets/') and item.endswith('.xml'):
                            try:
                                xml_text = data.decode('utf-8', errors='ignore')
                                xml_text = _re.sub(
                                    r'<(?:\w+:)?dataValidations\b[\s\S]*?</(?:\w+:)?dataValidations>',
                                    '',
                                    xml_text,
                                )
                                # 也剔除 extLst 里携带的扩展 dataValidations（x14）
                                xml_text = _re.sub(
                                    r'<extLst>[\s\S]*?</extLst>',
                                    '',
                                    xml_text,
                                )
                                data = xml_text.encode('utf-8')
                            except Exception:
                                pass
                        zout.writestr(item, data)
                dst.seek(0)
                return openpyxl.load_workbook(dst, data_only=True, read_only=True)

            def _openpyxl_to_text(wb):
                all_titles = [ws.title for ws in wb.worksheets]
                targets = set(_pick_target_sheet_names(all_titles))
                parts = []
                for ws in wb.worksheets:
                    if ws.title not in targets:
                        continue
                    parts.append(f"===== 工作表：{ws.title} =====")
                    for row in ws.iter_rows(values_only=True):
                        cells = [str(c).strip() for c in row if c is not None and str(c).strip() != ""]
                        if cells:
                            parts.append(" | ".join(cells))
                return "\n".join(parts)

            def _xlsx_zip_xml_fallback(raw_bytes):
                """
                最后兜底：不依赖 openpyxl / pandas / xlrd，
                直接用 stdlib 的 zipfile + xml.etree 读取 xlsx。
                """
                import zipfile, io
                from xml.etree import ElementTree as ET
                NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
                shared = []
                sheet_files = []
                sheet_names = {}
                with zipfile.ZipFile(io.BytesIO(raw_bytes), 'r') as zf:
                    # sharedStrings
                    if 'xl/sharedStrings.xml' in zf.namelist():
                        try:
                            root = ET.fromstring(zf.read('xl/sharedStrings.xml'))
                            for si in root.findall(f'{NS}si'):
                                # 拼接 <t> 内容（含 rich text 情况）
                                buf = []
                                for t in si.iter(f'{NS}t'):
                                    if t.text:
                                        buf.append(t.text)
                                shared.append("".join(buf))
                        except Exception:
                            pass
                    # workbook 里的 sheet 顺序 & 名字
                    if 'xl/workbook.xml' in zf.namelist():
                        try:
                            wb_root = ET.fromstring(zf.read('xl/workbook.xml'))
                            for i, s in enumerate(wb_root.iter(f'{NS}sheet'), start=1):
                                sheet_names[i] = s.attrib.get('name', f'Sheet{i}')
                        except Exception:
                            pass
                    for name in zf.namelist():
                        if name.startswith('xl/worksheets/sheet') and name.endswith('.xml'):
                            sheet_files.append(name)
                    sheet_files.sort()

                    # 挑出目标 sheet：只读"人物卡"，避免读全簿浪费 Token
                    all_titles = [sheet_names.get(i, f'Sheet{i}') for i in range(1, len(sheet_files) + 1)]
                    target_titles = set(_pick_target_sheet_names(all_titles))

                    parts = []
                    for idx, sf in enumerate(sheet_files, start=1):
                        title = sheet_names.get(idx, f'Sheet{idx}')
                        if title not in target_titles:
                            continue
                        parts.append(f"===== 工作表：{title} =====")
                        try:
                            root = ET.fromstring(zf.read(sf))
                        except Exception:
                            continue
                        for row in root.iter(f'{NS}row'):
                            cells = []
                            for c in row.findall(f'{NS}c'):
                                v = c.find(f'{NS}v')
                                t = c.attrib.get('t', 'n')
                                val = ""
                                if t == 's':
                                    if v is not None and v.text is not None:
                                        try:
                                            val = shared[int(v.text)]
                                        except Exception:
                                            val = v.text
                                elif t == 'inlineStr':
                                    isnode = c.find(f'{NS}is')
                                    if isnode is not None:
                                        buf = []
                                        for tt in isnode.iter(f'{NS}t'):
                                            if tt.text:
                                                buf.append(tt.text)
                                        val = "".join(buf)
                                else:
                                    if v is not None and v.text is not None:
                                        val = v.text
                                val = (val or "").strip()
                                if val:
                                    cells.append(val)
                            if cells:
                                parts.append(" | ".join(cells))
                return "\n".join(parts)

            text = ""
            errors = []

            if ext == '.xlsx':
                # 【L1】openpyxl 严格模式
                try:
                    import openpyxl
                    wb = openpyxl.load_workbook(file_stream, data_only=True, read_only=True)
                    text = _openpyxl_to_text(wb)
                except Exception as e_l1:
                    errors.append(f"openpyxl:{e_l1}")
                    # 【L2】剔除 dataValidations 后再次 openpyxl
                    try:
                        wb = _xlsx_strip_and_load(file_content)
                        text = _openpyxl_to_text(wb)
                    except Exception as e_l2:
                        errors.append(f"openpyxl-stripped:{e_l2}")
                        # 【L3】pandas（仅解析"人物卡"目标 sheet）
                        try:
                            import pandas as pd
                            xls = pd.ExcelFile(BytesIO(file_content))
                            targets = _pick_target_sheet_names(list(xls.sheet_names))
                            parts = []
                            for name in targets:
                                df = pd.read_excel(xls, sheet_name=name, header=None, dtype=str).fillna("")
                                parts.append(f"===== 工作表：{name} =====")
                                for _, row in df.iterrows():
                                    cells = [str(c).strip() for c in row.tolist() if str(c).strip() != ""]
                                    if cells:
                                        parts.append(" | ".join(cells))
                            text = "\n".join(parts)
                        except Exception as e_l3:
                            errors.append(f"pandas:{e_l3}")
                            # 【L4】stdlib zip+xml 完全无第三方依赖兜底
                            try:
                                text = _xlsx_zip_xml_fallback(file_content)
                            except Exception as e_l4:
                                errors.append(f"zipxml:{e_l4}")
                                return f"[ParseError]Excel(.xlsx) 读取失败: {' | '.join(errors)}"
            else:
                # .xls 老格式（仅解析"人物卡"目标 sheet）
                try:
                    import xlrd
                    book = xlrd.open_workbook(file_contents=file_content)
                    all_titles = [s.name for s in book.sheets()]
                    targets = set(_pick_target_sheet_names(all_titles))
                    parts = []
                    for sheet in book.sheets():
                        if sheet.name not in targets:
                            continue
                        parts.append(f"===== 工作表：{sheet.name} =====")
                        for r in range(sheet.nrows):
                            row = sheet.row_values(r)
                            cells = [str(c).strip() for c in row if str(c).strip() != ""]
                            if cells:
                                parts.append(" | ".join(cells))
                    text = "\n".join(parts)
                except Exception as e_xls:
                    errors.append(f"xlrd:{e_xls}")
                    try:
                        import pandas as pd
                        xls = pd.ExcelFile(BytesIO(file_content))
                        targets = _pick_target_sheet_names(list(xls.sheet_names))
                        parts = []
                        for name in targets:
                            df = pd.read_excel(xls, sheet_name=name, header=None, dtype=str).fillna("")
                            parts.append(f"===== 工作表：{name} =====")
                            for _, row in df.iterrows():
                                cells = [str(c).strip() for c in row.tolist() if str(c).strip() != ""]
                                if cells:
                                    parts.append(" | ".join(cells))
                        text = "\n".join(parts)
                    except Exception as e_pd:
                        errors.append(f"pandas:{e_pd}")
                        missing_xlrd = "xlrd" in str(e_xls).lower() or "xlrd" in str(e_pd).lower()
                        if missing_xlrd:
                            return "[ParseError]该文件真实格式是旧版 XLS（即使文件名可能写成 .xlsx），但后端未安装 xlrd。请执行：pip install \"xlrd>=2.0.1\"，然后重启后端；也可以用 Excel/WPS 将文件真正另存为 XLSX。"
                        return f"[ParseError]Excel(.xls) 读取失败: {' | '.join(errors)}\n请将文件用 Excel/WPS 另存为标准 .xlsx 后重试。"

            if not text.strip():
                return f"[ParseError]Excel 读取结果为空。诊断：{' | '.join(errors) if errors else '无内容'}"

        elif ext == '.csv':
            # 【CSV 角色卡】：优先 pandas，缺失时退回 stdlib csv
            text = ""
            try:
                import pandas as pd
                try:
                    df = pd.read_csv(BytesIO(file_content), header=None, dtype=str, encoding='utf-8').fillna("")
                except Exception:
                    df = pd.read_csv(BytesIO(file_content), header=None, dtype=str, encoding='gb18030').fillna("")
                parts = ["===== CSV 数据 ====="]
                for _, row in df.iterrows():
                    cells = [str(c).strip() for c in row.tolist() if str(c).strip() != ""]
                    if cells:
                        parts.append(" | ".join(cells))
                text = "\n".join(parts)
            except Exception as e_pd_csv:
                # 兜底：stdlib csv（不依赖 pandas）
                try:
                    import csv as _csv
                    raw = file_content
                    try:
                        content_str = raw.decode('utf-8-sig')
                    except UnicodeDecodeError:
                        try:
                            content_str = raw.decode('gb18030')
                        except UnicodeDecodeError:
                            content_str = raw.decode('utf-8', errors='ignore')
                    reader = _csv.reader(content_str.splitlines())
                    parts = ["===== CSV 数据 ====="]
                    for row in reader:
                        cells = [str(c).strip() for c in row if str(c).strip() != ""]
                        if cells:
                            parts.append(" | ".join(cells))
                    text = "\n".join(parts)
                except Exception as e_csv2:
                    return f"[ParseError]CSV 读取失败 (pandas:{e_pd_csv} / stdlib:{e_csv2})"

        else:
            return f"[ParseError]不支持的文件格式: {ext}"

    except Exception as e:
        # 加上特殊前缀，方便外层精准拦截
        return f"[ParseError]文件读取损坏 ({str(e)})\n可能是文件过大或本身已损坏。"
        
    return text

def background_file_process(job_id, file_url, filename, mode='analyze', is_pro=False, is_kind=False, persona="", custom_prompt="", theme='default', is_ds=False, group_key="", user_key="", custom_name="", card_system="auto", backup_model="", backup_label="", user_name="", token_module=""):
    """后台任务：下载文件并根据模式进行分析，支持多模态原生文档阅读与输出多图"""
    print(f"[{job_id}] 开始处理文件: {filename}, Mode: {mode}")
    try:
        # 1. 下载文件
        session = get_session()
        resp = session.get(file_url, timeout=120, stream=True)
        resp.raise_for_status()
        
        content = b""
        downloaded = 0
        for chunk in resp.iter_content(chunk_size=65536):
            if chunk:
                content += chunk
                downloaded += len(chunk)
                # 限制最大下载 50MB，防止内存爆炸
                if downloaded > 50 * 1024 * 1024: 
                    print(f"[{job_id}] 警告：文件超过 50MB，已被安全截断！")
                    break
        
        # 2. 核心：判断是否启用 LLM 的原生多模态视觉/文档阅读能力
        ext = os.path.splitext(filename)[1].lower()
        user_content = None

        # 【联动】：函数作用域内先声明 raw_text，方便 sheet_score 分支持久化时抽字段
        raw_text = ""

        if ext == '.pdf' and downloaded <= 40 * 1024 * 1024 and not is_ds:
            # 【原生 PDF 阅读模式】(限制在40MB内防代理服务器 Nginx 报 413 Payload Too Large)
            print(f"[{job_id}] 启用 LLM 原生 PDF 阅读模式 (大小: {downloaded/1024/1024:.2f}MB)")
            base64_pdf = base64.b64encode(content).decode('utf-8')
            user_content = [
                {"type": "text", "text": f"文件名：{filename}\n请仔细阅读这份 PDF 模组文档（包含其排版和图像），并严格按照系统设定的板块与要求进行分析。"},
                {"type": "image_url", "image_url": {"url": f"data:application/pdf;base64,{base64_pdf}"}}
            ]
            
        elif ext in ['.png', '.jpg', '.jpeg', '.webp'] and downloaded <= 20 * 1024 * 1024:
            if is_ds:
                raise Exception(f"{backup_label or BACKUP_MODEL_LABEL} 模型暂不支持直接读取纯图片格式，请取消备用模型参数使用默认的视觉模型！")
            # 【原生图片阅读模式】
            print(f"[{job_id}] 启用 LLM 原生图片阅读模式")
            mime_type = "image/jpeg" if ext in ['.jpg', '.jpeg'] else f"image/{ext[1:]}"
            base64_img = base64.b64encode(content).decode('utf-8')
            user_content = [
                {"type": "text", "text": f"文件名：{filename}\n请仔细观察这张图片/设定图，并严格按照系统设定的板块与要求进行分析。"},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_img}"}}
            ]
            
        else:
            # 【文本提取回退模式】(非视觉格式，或文件超大)
            print(f"[{job_id}] 启用文本本地提取模式")
            raw_text = extract_text_from_file(content, filename, card_system)
            
            if raw_text.startswith("[ParseError]"):
                raise Exception(raw_text.replace("[ParseError]", ""))
                
            if not raw_text or len(raw_text.strip()) < 10:
                raise Exception("文件内容为空或提取不到文字。(如果模组全是扫描版图片且文件过大，AI暂无法阅读)")

            # 智能压缩文本防爆 Token
            if len(raw_text) > MAX_AI_CHARS:
                part = int(MAX_AI_CHARS * 0.4)
                mid = raw_text[part:-part].split('\n')
                step = max(1, int(len(mid)/100))
                text_ai = f"{raw_text[:part]}\n...[中间部分略]...\n{chr(10).join(mid[::step])}\n{raw_text[-part:]}"
            else:
                text_ai = raw_text

            user_content = f"文件名：{filename}\n内容如下：\n{text_ai}"

        # ================= 1. 尝试触发文件省流缓存 =================
        # 注意：由于群文件链接 file_url 经常变，我们只能通过哈希“文件的真实数据内容”来确认是不是同一个文件
        hash_key = None
        if not is_pro:
            if isinstance(user_content, list): 
                content_hash = hashlib.md5(content).hexdigest()
            else: 
                content_hash = hashlib.md5(text_ai.encode('utf-8')).hexdigest()
                
            hash_str = f"file_log_{content_hash}_{mode}_{is_kind}_{persona}_{custom_prompt}_{theme}_{is_ds}_{card_system}"
            hash_key = hashlib.md5(hash_str.encode('utf-8')).hexdigest()
            
            cached_images = get_daily_cache(hash_key)
            if cached_images:
                print(f"[{job_id}] 命中今日文件内容缓存！省流模式启动，秒回历史图片。")
                JOB_CACHE[job_id]['status'] = 'done'
                JOB_CACHE[job_id]['images'] = cached_images
                return
        # ==========================================================

        # 3. 根据不同模式分配 Prompt 与 绘图标题
        report_title = "TRPG 模组解析报告"
        
        # 【新增】：检测并覆盖
        if custom_prompt:
            report_title = "TRPG 自定义分析报告"
            system_prompt = custom_prompt
        
        elif mode == 'log_analyze':
            report_title = "TRPG 跑团日志评分"
            if is_kind: system_prompt = KIND_SYSTEM_PROMPT
            elif is_pro: system_prompt = PRO_SYSTEM_PROMPT
            else: system_prompt = DEFAULT_SYSTEM_PROMPT
            system_prompt += LOG_SCORE_PRECISION_REQUIREMENT

        elif mode == 'sheet_score':
            # 【新增】：角色卡评分模式（读取姓名/年龄/属性/技能/背景故事并打分）
            dnd_sheet_groups = (("起源", "角色"), ("主要", "主要情况"), ("背包",), ("施法",))
            detected_dnd = card_system == 'dnd' or sum(
                any(f"工作表：{name}" in raw_text for name in aliases) for aliases in dnd_sheet_groups
            ) >= 2
            report_title = "DND 角色卡评分" if detected_dnd else "COC 角色卡评分"
            system_prompt = DND_SHEET_SCORE_SYSTEM_PROMPT if detected_dnd else SHEET_SCORE_SYSTEM_PROMPT

        elif mode == 'log_recap':
            report_title = "TRPG 跑团前文回顾"
            system_prompt = """你是一个专业且细致的 TRPG 跑团记录员（书记）。请阅读以下跑团 Log，为 KP 和玩家梳理一份详细的【前文回顾】，帮助大家快速找回跑团记忆。
请严格按照以下 4 个板块输出，并且在输出每个大板块之前，必须使用“【分页符】”这四个字单起一行作为分隔标识（不要用Markdown，不要加粗）：

【分页符】
【一、当前剧情进度总览】：
（详细说明截至目前的故事进度，大家在哪，正在面临什么状况，遇到了什么危机或主线推进到了哪一步）
【分页符】
【二、PC行动轨迹与状态梳理】：
（尽可能详细分条列出每位主要玩家角色/PC近期做了什么举动，达成了什么目的，或处于什么特殊状态/受到什么伤害）
【分页符】
【三、当前已获线索与道具盘点】：
（总结当前大家掌握的所有情报、未解之谜、NPC给出的重要信息以及拿到的关键道具）
【分页符】
【四、下一步推进方向提示】：
（基于当前局势，客观给出2-3个可供调查员们继续推进剧情的可能方向或需要立刻解决的问题）"""

        elif mode == 'prepare':
            report_title = "TRPG 备团资料梳理"
            system_prompt = """你是一个资深的TRPG跑团KP/DM，请阅读以下模组文档内容，为带团准备一份详尽的备团参考。
请严格提供以下5个板块的内容，并且在输出每个大板块之前，必须使用“【分页符】”这四个字单起一行作为分隔标识（不要用Markdown，不要加粗）：

【分页符】
【一、模组背景】：
（阐述事件真相、幕后黑手动机、历史遗留问题，让KP掌握全局）
【分页符】
【二、故事梗概】：
（按时间线或事件发展顺序，简述调查员将经历的主要剧情节点）
【分页符】
【三、人物关系】：
（列出核心NPC的表面身份、真实身份、动机及相互关系）
【分页符】
【四、地图与场景梳理】：
（罗列关键场景及可获取的线索或触发的事件）
【分页符】
【五、建议流程】：
（带团节奏建议，指出哪里需重点渲染，哪里容易卡关需暗中提示）"""

        elif mode == 'refine':
            report_title = "TRPG 模组润色与审查"
            system_prompt = """你是一个资深的TRPG剧本医生/编辑，请阅读以下模组，评估目前的写作状态并给出修改建议。
请严格提供以下5个板块的内容，并且在输出每个大板块之前，必须使用“【分页符】”这四个字单起一行作为分隔标识（不要用Markdown，不要加粗）：

【分页符】
【一、完成度预估】：
（评估书写进度百分比，例如：完成度60%，并简述理由）
【分页符】
【二、当前进度点评】：
（客观评价已写好的部分，指出亮点与明显缺失的核心要素）
【分页符】
【三、写作建议】：
（针对薄弱环节，提供具体的构思方向或剧情补充建议）
【分页符】
【四、需要调整的地方】：
（指出逻辑漏洞、规则应用错误、或排版行文生硬之处）
【分页符】
【五、具体修改示例】：
（选取文中某段落或缺失的设定，给出一个经你润色补充的具体文本范例）"""

        else: # 默认 analyze
            system_prompt = """
        你是一个专业的TRPG模组锐评大师，请阅读以下COC/DND模组文档，生成一份评测简报。要求语言风格严谨犀利，不轻易给高分。
        请严格按照以下格式输出（不要用Markdown，不要加粗，直接分行）：
        【文件标题】：(文件名)
        【模组/文档类型】：（模组类型）
        【总体评分】：（0-100分）
        （请给出理由）
        【核心内容概要】：
        （简述模组里面的内容以及逻辑情况，分析调查员可能的行动方向以及对应结果）
        【亮点/特色】：
        （找出几个模组中描写或逻辑最佳的地方，如果没有则忽略不写）
        【问题/槽点】：
        （找出并吐槽模组中的逻辑漏洞，文笔硬伤，忽视规则书等等行为）
        【专家总结】：
        （用一到两句话来总结模组）
        """

        # 核心：人设系统劫持
        if persona:
            system_prompt += f"\n\n【极其重要的扮演指令】：\n在生成上述所有评价和梳理内容时，请你完全带入以下角色人设来进行语气和口吻的渲染。你可以自称、吐槽或撒娇，让输出充满该人设的个性。\n（绝对警告：你必须严格保留前文要求的【板块标题】和【分页符】等格式标识符，千万不能省略或修改它们，只能改变正文部分的说话语气！）：\n{persona}"

        # 【联动】：本地文件走 log_analyze / log_recap 时也要挖角色卡库
        # 卡库按【用户】跨群共享；Log 分析器传递的 user_key 通常为空 → 走全库扫描
        if mode in ('log_analyze', 'log_recap') and raw_text:
            try:
                matched_cards = find_matching_cards(raw_text, user_key="")
                if matched_cards:
                    system_prompt += build_sheet_context(matched_cards)
                    print(f"[{job_id}] 已联动注入 {len(matched_cards)} 张角色卡资料: {[c.get('name') for c in matched_cards]}")
            except Exception as e_match:
                print(f"[{job_id}] 角色卡联动失败(忽略): {e_match}")

        # 【新增】：如果用户没指定主题，赋予大模型绝对的主题控制权！
        if theme == 'default':
            system_prompt += "\n\n【排版指令】：你可以根据当前内容的故事氛围，在回复的【最开头】加上标签以控制最终生成的图片风格。支持的标签有：【主题：经典】、【主题：克苏鲁】、【主题：赛博】、【主题：历史】、【主题：废土】、【主题：二次元】、【主题：终端】。如果你觉得不需要特殊风格，可不写此标签。"

        # 4. 请求 AI
        # 3. 请求 AI
        print(f"[{job_id}] 未命中缓存，开始请求 LLM 消耗 Token...")
        
        current_client = backup_client if is_ds else client
        if is_ds:
            current_model = resolve_backup_model(backup_model, is_pro)
            max_t = 65535
        else:
            current_model = AI_MODEL_PRO if is_pro else AI_MODEL
            max_t = 65535

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content}
        ]
        resp = current_client.chat.completions.create(
            model=current_model,
            messages=messages,
            temperature=1.0, max_tokens=max_t
        )
        usage_record = record_token_usage(
            resp, messages, module=token_module or module_from_mode(mode), model=current_model,
            user_key=user_key, user_name=user_name, group_key=group_key,
            prompt_name=custom_name or ("温柔模式" if is_kind else "默认提示词"),
            prompt=custom_prompt or system_prompt, job_id=job_id,
        )
        result_text = resp.choices[0].message.content
        token_usage = f" | Tokens: {usage_record['total_tokens']}" if usage_record else ""
        
        result_text, final_theme = extract_theme_from_text(result_text, theme)

        # 4. 多图渲染与保存
        images_list = text_to_images(result_text, filename, report_title, final_theme, token_usage)
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['images'] = images_list

        # 【新增】：角色卡评分模式额外抽取结构化字段供前端展示 + 联动存卡
        if mode == 'sheet_score':
            summary = parse_sheet_summary(result_text)
            if summary:
                JOB_CACHE[job_id]['summary'] = summary
                print(f"[{job_id}] 角色卡摘要: {summary}")

            # 抽取属性/技能/背景故事，联动 Log 分析器使用
            try:
                full = parse_sheet_full_fields(raw_text, result_text)
                card = {
                    "name": (summary or {}).get("name", "") or "未命名",
                    "age": (summary or {}).get("age", ""),
                    "score": (summary or {}).get("score"),
                    "tier": (summary or {}).get("tier", ""),
                    "attributes": full.get("attributes", ""),
                    "skills": full.get("skills", ""),
                    "background": full.get("background", ""),
                    "user_key": user_key,
                    "group_key": group_key,
                    "filename": filename,
                }
                if card["name"] and card["name"] != "未命名":
                    # 卡库按用户 QQ 隔离，实现跨群共享
                    card["saved_at"] = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
                    save_sheet_card(user_key, card)
            except Exception as e_save:
                print(f"[{job_id}] 存卡失败: {e_save}")

        print(f"[{job_id}] 文件分析完成，共生成 {len(images_list)} 张图")

        # ================= 5. 写入省流缓存 =================
        if not is_pro and hash_key:
            set_daily_cache(hash_key, images_list)
            print(f"[{job_id}] 文件处理结果已存入今日缓存库。")

    except Exception as e:
        print(f"[{job_id}] 文件处理失败: {e}")
        err_img_bytes = text_to_images(f"文件处理失败：\n{str(e)}", filename)[0]
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['images'] =[err_img_bytes]

TRANSLATE_SYSTEM_PROMPT = "你是一个专业的翻译助手。请准确翻译用户提供的文本，保留原文格式，只返回翻译结果，不要添加任何解释或评论。"

@app.route('/api/translate', methods=['GET'])
def translate_task():
    """翻译文件任务"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    file_url = request.args.get('url')
    filename = request.args.get('filename', 'unknown')
    target_lang = request.args.get('lang', 'zh-CN')
    is_pro = request.args.get('pro', 'false').lower() == 'true'
    user_key = str(request.args.get('user_key', '') or '')[:64]
    user_name = str(request.args.get('user_name', '') or '')[:80]
    group_key = str(request.args.get('group_key', '') or '')[:64]
    
    if not file_url:
        return jsonify({'status': 'error', 'msg': '缺少文件URL'})
    
    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    executor.submit(background_translate_process, job_id, file_url, filename, target_lang, is_pro, user_key, user_name, group_key)
    
    return jsonify({'status': 'ok', 'id': job_id, 'msg': f'正在翻译为 {target_lang}...'})

def background_translate_process(job_id, file_url, filename, target_lang='zh-CN', is_pro=False, user_key="", user_name="", group_key=""):
    """后台线程：下载并翻译文件"""
    print(f"[{job_id}] 开始翻译文件: {filename} -> {target_lang}")
    try:
        sess = get_session()
        resp = sess.get(file_url, timeout=60)
        if resp.status_code != 200:
            raise Exception(f"文件下载失败: {resp.status_code}")
        
        file_content = safe_decode(resp.content)
        
        # 检测语言
        lang_hint = ""
        if any('\u4e00' <= c <= '\u9fff' for c in file_content[:500]):
            lang_hint = "原文是中文"
        elif any('\u3040' <= c <= '\u309f' or '\u30a0' <= c <= '\u30ff' for c in file_content[:500]):
            lang_hint = "原文是日文"
        elif any('\uac00' <= c <= '\ud7af' for c in file_content[:500]):
            lang_hint = "原文是韩文"
        
        model = AI_MODEL_PRO if is_pro else AI_MODEL
        
        # 截断过长的内容
        file_text = file_content[:MAX_AI_CHARS] if len(file_content) > MAX_AI_CHARS else file_content
        
        translate_prompt = f"{lang_hint}\n请将以下文本翻译成{target_lang}：\n\n{file_text}"
        
        messages = [
            {"role": "system", "content": TRANSLATE_SYSTEM_PROMPT},
            {"role": "user", "content": translate_prompt}
        ]
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.5, max_tokens=4000
        )
        record_token_usage(
            resp, messages, module="translate", model=model,
            user_key=user_key, user_name=user_name, group_key=group_key,
            prompt_name="文件翻译", prompt=TRANSLATE_SYSTEM_PROMPT, job_id=job_id,
        )
        result_text = resp.choices[0].message.content
        
        # 保存翻译结果
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['text'] = result_text
        JOB_CACHE[job_id]['original_filename'] = filename
        print(f"[{job_id}] 文件翻译完成")
        
    except Exception as e:
        print(f"[{job_id}] 文件翻译失败: {e}")
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['text'] = f"翻译失败：{str(e)}"

@app.route('/api/translate_result', methods=['GET'])
def get_translate_result():
    """获取翻译结果"""
    job_id = request.args.get('id')
    job = JOB_CACHE.get(job_id)
    if not job or 'text' not in job:
        return jsonify({'status': 'not_found'})
    return jsonify({'status': job['status'], 'text': job.get('text', ''), 'filename': job.get('original_filename', '')})

@app.route('/api/translate_and_upload', methods=['GET'])
def translate_and_upload():
    """翻译并上传到群文件"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    file_url = request.args.get('url')
    filename = request.args.get('filename', 'unknown')
    target_lang = request.args.get('lang', 'zh-CN')
    group_id = request.args.get('group_id', '')
    is_pro = request.args.get('pro', 'false').lower() == 'true'
    overwrite = request.args.get('overwrite', 'false').lower() == 'true'
    upload_baseurl = request.args.get('upload_url', '')
    user_key = str(request.args.get('user_key', '') or '')[:64]
    user_name = str(request.args.get('user_name', '') or '')[:80]
    group_key = str(request.args.get('group_key', '') or group_id)[:64]
    
    if not file_url:
        return jsonify({'status': 'error', 'msg': '缺少文件URL'})
    
    if not group_id or not upload_baseurl:
        return jsonify({'status': 'error', 'msg': '缺少群号或上传地址'})
    
    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    executor.submit(background_translate_and_upload, job_id, file_url, filename, target_lang, group_id, upload_baseurl, is_pro, overwrite, user_key, user_name, group_key)

    mode_msg = "覆盖模式" if overwrite else "注释模式"
    return jsonify({'status': 'ok', 'id': job_id, 'msg': f'正在翻译并上传到群文件...({mode_msg})'})


def translate_and_save_file(job_id, file_bytes, original_filename, target_lang, is_pro=False, overwrite=False, user_key="", user_name="", group_key=""):
    """根据文件类型翻译并保存"""
    import os
    import tempfile
    
    sess = get_session()
    ext = os.path.splitext(original_filename)[1].lower()
    name_without_ext = os.path.splitext(original_filename)[0]

    mode_desc = "覆盖模式" if overwrite else "注释模式"
    print(f"[{job_id}] 翻译模式: {mode_desc}")
    
    # 检测语言
    check_text = ""
    if ext == '.pdf':
        try:
            from io import BytesIO
            import PyPDF2
            pdf_reader = PyPDF2.PdfReader(BytesIO(file_bytes))
            text_parts = []
            for page in pdf_reader.pages:
                text_parts.append(page.extract_text())
            check_text = "\n".join(text_parts)
        except:
            check_text = safe_decode(file_bytes)[:1000]
    elif ext == '.docx':
        try:
            from io import BytesIO
            import docx
            doc = docx.Document(BytesIO(file_bytes))
            check_text = "\n".join([p.text for p in doc.paragraphs])
        except:
            check_text = safe_decode(file_bytes)[:1000]
    else:
        check_text = safe_decode(file_bytes)[:1000]
    
    lang_hint = ""
    if any('\u4e00' <= c <= '\u9fff' for c in check_text):
        lang_hint = "原文是中文"
    elif any('\u3040' <= c <= '\u309f' or '\u30a0' <= c <= '\u30ff' for c in check_text):
        lang_hint = "原文是日文"
    elif any('\uac00' <= c <= '\ud7af' for c in check_text):
        lang_hint = "原文是韩文"
    
    model = AI_MODEL_PRO if is_pro else AI_MODEL
    
    # 根据不同文件类型处理
    if ext == '.pdf':
        # PDF处理 - 使用pymupdf保留原有格式
        try:
            from io import BytesIO
            import fitz  # pymupdf
            
            print(f"[{job_id}] 使用pymupdf处理PDF，保留原有格式")
            
            # 打开原始PDF
            pdf_document = fitz.open(stream=file_bytes, filetype="pdf")
            
            # 提取所有文本用于翻译
            all_texts = []
            for page_num in range(len(pdf_document)):
                page = pdf_document[page_num]
                text_dict = page.get_text("dict")
                for block in text_dict.get("blocks", []):
                    if block.get("type") == 0:  # 文本块
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                text = span.get("text", "").strip()
                                if text and len(text) > 2:
                                    all_texts.append(text)
            
            if not all_texts:
                raise Exception("PDF中没有可提取的文本")
            
            print(f"[{job_id}] 提取到 {len(all_texts)} 个文本片段")
            
            # 翻译所有文本
            translated_map = {}
            batch_size = 30
            for i in range(0, len(all_texts), batch_size):
                batch = all_texts[i:i+batch_size]
                batch_text = "\n---\n".join(batch)
                prompt = f"{lang_hint}\n请将以下文本翻译成{target_lang}，保持每行对应（用---分隔）：\n{batch_text}"
                
                messages = [{"role": "system", "content": TRANSLATE_SYSTEM_PROMPT}, {"role": "user", "content": prompt}]
                resp = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.5, max_tokens=4000
                )
                record_token_usage(
                    resp, messages, module="translate", model=model,
                    user_key=user_key, user_name=user_name, group_key=group_key,
                    prompt_name="PDF 分批翻译", prompt=TRANSLATE_SYSTEM_PROMPT, job_id=job_id,
                )
                
                translated_batch = resp.choices[0].message.content.split('\n---\n')
                for orig, trans in zip(batch, translated_batch):
                    translated_map[orig] = trans.strip()
            
            # 在原始PDF中替换文本
            # 尝试加载中文字体 - 使用pymupdf的方式
            chinese_font_path = None
            font_paths = [
                ("C:/Windows/Fonts/msyh.ttc", "china-ss"),  # 微软雅黑
                ("C:/Windows/Fonts/simhei.ttf", "china-ss"),  # 黑体
                ("C:/Windows/Fonts/simsun.ttc", "china-ss"),  # 宋体
                ("C:/Windows/Fonts/msgothic.ttc", "japan-ss"),  # MS Gothic (日文)
                ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "china-ss"),  # Linux 文泉驿
                ("/System/Library/Fonts/PingFang.ttc", "china-ss"),  # macOS 苹方
            ]
            
            font_name = "china-ss"  # 默认字体名称
            for font_path, font_alias in font_paths:
                if os.path.exists(font_path):
                    chinese_font_path = font_path
                    font_name = font_alias
                    print(f"[{job_id}] 使用字体: {font_path}")
                    break
            
            if not chinese_font_path:
                print(f"[{job_id}] 警告: 未找到中文字体，中文可能显示为方框")
            
            # 按页面收集所有需要替换的文本位置
            replacements = []  # (page_num, bbox, original_text, translated_text)
            
            for page_num in range(len(pdf_document)):
                page = pdf_document[page_num]
                text_dict = page.get_text("dict")
                
                for block in text_dict.get("blocks", []):
                    if block.get("type") == 0:  # 文本块
                        for line in block.get("lines", []):
                            for span in line.get("spans", []):
                                original_text = span.get("text", "").strip()
                                if original_text:
                                    # 查找是否有对应的翻译
                                    for orig, trans in translated_map.items():
                                        if orig in original_text or original_text in orig:
                                            bbox = span.get("bbox")
                                            if bbox:
                                                replacements.append((page_num, bbox, original_text, trans))
                                                break
            
            # 按页面分组处理，从后往前处理（避免位置变化影响）
            from collections import defaultdict
            page_replacements = defaultdict(list)
            for page_num, bbox, orig, trans in replacements:
                page_replacements[page_num].append((bbox, orig, trans))
            
            for page_num in page_replacements:
                page = pdf_document[page_num]
                # 按y坐标从大到小排序（从下到上处理）
                items = sorted(page_replacements[page_num], key=lambda x: x[0][1], reverse=True)
                
                for bbox, original_text, translated_text in items:
                    x0, y0, x1, y1 = bbox
                    
                    try:
                        if overwrite:
                            # 覆盖模式：用白色矩形覆盖原文，然后插入翻译
                            # 1. 添加白色背景矩形覆盖原文
                            white_rect = fitz.Rect(x0 - 2, y0 - 2, x1 + 2, y1 + 2)
                            page.draw_rect(white_rect, color=(1, 1, 1), fill=(1, 1, 1), overlay=True)
                            
                            # 2. 插入翻译文本（黑色，原字体大小）
                            if chinese_font_path:
                                # 嵌入字体并插入文本
                                font_buffer = open(chinese_font_path, "rb").read()
                                page.insert_font(fontname="MyCJK", fontbuffer=font_buffer)
                                page.insert_textbox(
                                    fitz.Rect(x0, y0, x1 + 50, y1 + 20),
                                    translated_text[:200],
                                    fontsize=9,
                                    color=(0, 0, 0),  # 黑色
                                    overlay=True,
                                    fontname="MyCJK"
                                )
                            else:
                                page.insert_textbox(
                                    fitz.Rect(x0, y0, x1 + 50, y1 + 20),
                                    translated_text[:200],
                                    fontsize=9,
                                    color=(0, 0, 0),
                                    overlay=True
                                )
                        else:
                            # 注释模式：在原文下方插入红色翻译
                            text_box = fitz.Rect(x0, y1, x1 + 100, y1 + 30)
                            
                            if chinese_font_path:
                                # 嵌入字体并插入文本
                                font_buffer = open(chinese_font_path, "rb").read()
                                page.insert_font(fontname="MyCJK", fontbuffer=font_buffer)
                                page.insert_textbox(
                                    text_box,
                                    translated_text[:100],
                                    fontsize=8,
                                    color=(1, 0, 0),  # 红色
                                    overlay=True,
                                    fontname="MyCJK"
                                )
                            else:
                                page.insert_textbox(
                                    text_box,
                                    translated_text[:100],
                                    fontsize=8,
                                    color=(1, 0, 0),
                                    overlay=True
                                )
                    except Exception as e:
                        print(f"[{job_id}] 处理文本失败: {e}")
            
            # 保存新PDF
            new_filename = f"翻译_{target_lang}_{name_without_ext}.pdf"
            fd, temp_file_path = tempfile.mkstemp(suffix='.pdf')
            os.close(fd)
            pdf_document.save(temp_file_path)
            pdf_document.close()
            
            print(f"[{job_id}] PDF处理完成，保留原有格式")
            return temp_file_path, new_filename
            
        except ImportError as e:
            print(f"[{job_id}] 缺少pymupdf库，回退到txt: {e}")
            ext = '.txt'
        except Exception as e:
            print(f"[{job_id}] PDF处理失败: {e}")
            ext = '.txt'
    
    if ext == '.docx':
        # DOCX处理
        try:
            from io import BytesIO
            import docx
            
            doc = docx.Document(BytesIO(file_bytes))
            original_paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
            
            # 翻译
            translated_paragraphs = []
            batch_size = 10
            for i in range(0, len(original_paragraphs), batch_size):
                batch = original_paragraphs[i:i+batch_size]
                batch_text = "\n".join(batch)
                prompt = f"{lang_hint}\n请翻译以下内容成{target_lang}：\n{batch_text}"
                messages = [{"role": "system", "content": TRANSLATE_SYSTEM_PROMPT}, {"role": "user", "content": prompt}]
                resp = client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=0.5, max_tokens=65535
                )
                record_token_usage(
                    resp, messages, module="translate", model=model,
                    user_key=user_key, user_name=user_name, group_key=group_key,
                    prompt_name="DOCX 分批翻译", prompt=TRANSLATE_SYSTEM_PROMPT, job_id=job_id,
                )
                translated_paragraphs.extend(resp.choices[0].message.content.split('\n'))
            
            # 创建新docx
            new_doc = docx.Document()
            for orig, trans in zip(original_paragraphs, translated_paragraphs):
                if orig.strip():
                    new_doc.add_paragraph(orig)
                if trans.strip():
                    new_doc.add_paragraph(trans)
            
            new_filename = f"翻译_{target_lang}_{name_without_ext}.docx"
            fd, temp_file_path = tempfile.mkstemp(suffix='.docx')
            os.close(fd)
            new_doc.save(temp_file_path)
            
            return temp_file_path, new_filename
            
        except ImportError as e:
            print(f"[{job_id}] 缺少python-docx库，回退到txt: {e}")
            ext = '.txt'
    
    # TXT和其他格式
    file_content = safe_decode(file_bytes)
    if not file_content or len(file_content.strip()) < 10:
        raise Exception("文件内容为空或无法读取")
    
    file_text = file_content[:MAX_AI_CHARS] if len(file_content) > MAX_AI_CHARS else file_content
    prompt = f"{lang_hint}\n请将以下文本翻译成{target_lang}，保持原有格式：\n{file_text}"
    
    messages = [{"role": "system", "content": TRANSLATE_SYSTEM_PROMPT}, {"role": "user", "content": prompt}]
    resp = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.5, max_tokens=65535
    )
    record_token_usage(
        resp, messages, module="translate", model=model,
        user_key=user_key, user_name=user_name, group_key=group_key,
        prompt_name="文本翻译", prompt=TRANSLATE_SYSTEM_PROMPT, job_id=job_id,
    )
    result_text = resp.choices[0].message.content
    
    new_filename = f"翻译_{target_lang}_{name_without_ext}.txt"
    fd, temp_file_path = tempfile.mkstemp(suffix='.txt', text=True)
    os.close(fd)
    with open(temp_file_path, 'w', encoding='utf-8') as f:
        f.write(result_text)
    
    return temp_file_path, new_filename

def background_translate_and_upload(job_id, file_url, filename, target_lang, group_id, upload_baseurl, is_pro=False, overwrite=False, user_key="", user_name="", group_key=""):
    """后台线程：下载、翻译并上传文件"""
    print(f"[{job_id}] 开始翻译上传: {filename} -> {target_lang} -> group {group_id}, 覆盖模式: {overwrite}")
    
    try:
        sess = get_session()
        
        # 下载文件
        resp = sess.get(file_url, timeout=60)
        if resp.status_code != 200:
            raise Exception(f"文件下载失败: {resp.status_code}")
        
        file_bytes = resp.content
            
        # 翻译并生成新文件
        temp_file_path, new_filename = translate_and_save_file(
            job_id, file_bytes, filename, target_lang, is_pro, overwrite,
            user_key, user_name, group_key,
        )
        
        try:
            # 等待确保文件关闭
            time.sleep(0.5)
            
            # 上传到群文件
            upload_url = f"{upload_baseurl}/upload_group_file?group_id={group_id}&file=file://{temp_file_path}&name={new_filename}"
            upload_resp = sess.get(upload_url, timeout=60)
            upload_result = upload_resp.json()
            
            if upload_result.get('status') == 'ok':
                JOB_CACHE[job_id]['status'] = 'done'
                JOB_CACHE[job_id]['msg'] = f'翻译完成并已上传到群文件: {new_filename}'
                print(f"[{job_id}] 翻译并上传成功: {new_filename}")
            else:
                raise Exception(f"上传失败: {upload_result}")
        finally:
            time.sleep(0.5)
            try:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
            except Exception as e:
                print(f"[{job_id}] 清理临时文件失败: {e}")
        
    except Exception as e:
        print(f"[{job_id}] 翻译上传失败: {e}")
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['msg'] = f"翻译上传失败：{str(e)}"

import re

def get_theme_config(theme_name):
    """获取不同主题的色彩和字体配置 (对比度增强版)"""
    if theme_name == 'cyberpunk': # 赛博朋克
        return {'bg': (13, 17, 23), 'header_bg': (255, 0, 85), 'header_text': (0, 255, 255), 'text': (0, 235, 170), 'title': (255, 255, 255), 'highlight': (255, 215, 0), 'quote': (150, 150, 150), 'border': (0, 150, 150), 'italic': (255, 100, 200), 'font_type': 'sans'}
    elif theme_name == 'historical': # 历史/古风 (加深了墨水黑和朱砂红，提升对比度)
        return {'bg': (230, 218, 195), 'header_bg': (94, 64, 52), 'header_text': (240, 230, 210), 'text': (30, 20, 15), 'title': (20, 10, 5), 'highlight': (160, 30, 30), 'quote': (90, 60, 50), 'border': (150, 120, 100), 'italic': (40, 70, 120), 'font_type': 'serif'}
    elif theme_name == 'cthulhu': # 克苏鲁深海风 (大幅提亮了文字颜色，暗底更清晰)
        return {'bg': (10, 15, 12), 'header_bg': (20, 45, 35), 'header_text': (180, 220, 190), 'text': (180, 220, 200), 'title': (150, 240, 170), 'highlight': (220, 70, 70), 'quote': (110, 150, 130), 'border': (60, 120, 90), 'italic': (170, 100, 220), 'font_type': 'serif'}
    elif theme_name == 'wasteland': # 废土/末日风
        return {'bg': (40, 35, 30), 'header_bg': (85, 45, 20), 'header_text': (220, 200, 180), 'text': (210, 190, 160), 'title': (255, 160, 50), 'highlight': (255, 90, 20), 'quote': (140, 120, 100), 'border': (120, 80, 40), 'italic': (180, 200, 100), 'font_type': 'sans'}
    elif theme_name == 'anime': # 二次元/软萌风
        return {'bg': (255, 248, 250), 'header_bg': (255, 182, 193), 'header_text': (255, 255, 255), 'text': (90, 70, 80), 'title': (220, 100, 140), 'highlight': (255, 100, 120), 'quote': (180, 150, 160), 'border': (255, 200, 220), 'italic': (120, 160, 255), 'font_type': 'sans'}
    elif theme_name == 'terminal': # 终端黑客风
        return {'bg': (0, 0, 0), 'header_bg': (0, 40, 0), 'header_text': (0, 255, 0), 'text': (0, 200, 0), 'title': (0, 255, 0), 'highlight': (0, 255, 0), 'quote': (0, 100, 0), 'border': (0, 150, 0), 'italic': (0, 255, 0), 'font_type': 'sans'}
    elif theme_name == 'classic': # 经典风 (完美复刻原版的深蓝灰+米黄背景)
        return {'bg': (242, 241, 237), 'header_bg': (52, 73, 94), 'header_text': (255, 255, 255), 'text': (40, 40, 40), 'title': (20, 20, 20), 'highlight': (192, 57, 43), 'quote': (100, 100, 100), 'border': (180, 180, 180), 'italic': (41, 128, 185), 'font_type': 'sans'}
    else: # default 简约风 (纯白底黑字)
        return {'bg': (255, 255, 255), 'header_bg': (240, 240, 240), 'header_text': (50, 50, 50), 'text': (30, 30, 30), 'title': (0, 0, 0), 'highlight': (200, 50, 50), 'quote': (120, 120, 120), 'border': (200, 200, 200), 'italic': (50, 100, 200), 'font_type': 'sans'}

def extract_theme_from_text(result_text, current_theme):
    """嗅探大模型输出的主题标签，动态改变主题"""
    final_theme = current_theme
    match = re.search(r'【主题[：:](.*?)】|\[Theme[：:](.*?)\]', result_text, re.IGNORECASE)
    if match:
        detected = (match.group(1) or match.group(2)).strip()
        if '赛博' in detected or 'cyber' in detected: final_theme = 'cyberpunk'
        elif '历史' in detected or '古风' in detected: final_theme = 'historical'
        elif '克苏鲁' in detected or 'cthulhu' in detected: final_theme = 'cthulhu'
        elif '废土' in detected or '末日' in detected: final_theme = 'wasteland'
        elif '二次元' in detected or '萌' in detected: final_theme = 'anime'
        elif '终端' in detected or '黑客' in detected: final_theme = 'terminal'
        elif '经典' in detected or '原版' in detected: final_theme = 'classic'
        elif '简约' in detected or '默认' in detected: final_theme = 'default'
        
        result_text = re.sub(r'【主题[：:](.*?)】\n*|\[Theme[：:](.*?)\]\n*', '', result_text, count=1, flags=re.IGNORECASE).strip()
    return result_text, final_theme

def load_markdown_fonts(font_type='sans'):
    """动态加载各级标题的字体，支持衬线与非衬线切换"""
    font_path = FONT_PATH if os.path.exists(FONT_PATH) else "./fonts/SimHei.ttf"
    bold_path = font_path.replace("msyh.ttc", "msyhbd.ttc")
    
    # 历史风格尝试加载楷体或宋体
    if font_type == 'serif':
        if os.path.exists("C:/Windows/Fonts/simkai.ttf"):
            font_path = bold_path = "C:/Windows/Fonts/simkai.ttf"
        elif os.path.exists("C:/Windows/Fonts/simsun.ttc"):
            font_path = bold_path = "C:/Windows/Fonts/simsun.ttc"
            
    if not os.path.exists(bold_path): bold_path = font_path

    try:
        return {
            'normal': ImageFont.truetype(font_path, 26), 'bold': ImageFont.truetype(bold_path, 26),
            'h1': ImageFont.truetype(bold_path, 38), 'h2': ImageFont.truetype(bold_path, 32),
            'h3': ImageFont.truetype(bold_path, 28), 'h4': ImageFont.truetype(bold_path, 24),
            'h5': ImageFont.truetype(bold_path, 22), 'title': ImageFont.truetype(bold_path, 42),
            'small': ImageFont.truetype(font_path, 20)
        }
    except:
        df = ImageFont.load_default()
        return {k: df for k in['normal','bold','h1','h2','h3','h4','h5','title','small']}

def parse_markdown_layout(text, width, padding, fonts, colors):
    text = text.replace('\t', '    ').replace('\r', '')
    text = re.sub(r'[\u2600-\u27BF\U0001F300-\U0001FAFF]', '', text)
    text = re.sub(r'^```.*$', '', text, flags=re.MULTILINE)
    text = text.replace('<think>', '\n>[AI 思考过程]：\n> ').replace('</think>', '\n---\n')

    latex_reps = {r'$\rightarrow$':'→', r'\rightarrow':'→', r'$\leftarrow$':'←', r'\leftarrow':'←', r'$\Rightarrow$':'⇒', r'\Rightarrow':'⇒', r'$\leftrightarrow$':'↔', r'\leftrightarrow':'↔', r'$\uparrow$':'↑', r'\uparrow':'↑', r'$\downarrow$':'↓', r'\downarrow':'↓', r'$\times$':'×', r'\times':'×', r'$\div$':'÷', r'\div':'÷', r'$\ge$':'≥', r'\ge':'≥', r'$\geq$':'≥', r'\geq':'≥', r'$\le$':'≤', r'\le':'≤', r'$\leq$':'≤', r'\leq':'≤', r'$\neq$':'≠', r'\neq':'≠', r'$\approx$':'≈', r'\approx':'≈', r'$\pm$':'±', r'\pm':'±', r'$\cdot$':'·', r'\cdot':'·', r'$\dots$':'...', r'\dots':'...'}
    for old_s, new_s in latex_reps.items(): text = text.replace(old_s, new_s)
    text = re.sub(r'(?<!\*)\*(?!\s)(.*?)(?<!\s)\*(?!\*)', '\x02\\1\x02', text)

    lines = text.split('\n')
    layout =[]
    max_w = width - padding
    global_bold = False; global_italic = False

    i = 0
    while i < len(lines):
        line = lines[i].strip(); raw_line = lines[i]
        if not line:
            layout.append({'type': 'spacing', 'height': 20}); i += 1
            continue

        if line.startswith('|') and line.endswith('|'):
            table_lines =[]
            while i < len(lines) and lines[i].strip().startswith('|') and lines[i].strip().endswith('|'):
                table_lines.append(lines[i].strip()); i += 1
            rows =[]
            for t_line in table_lines: rows.append([c.strip() for c in t_line.strip('|').split('|')])
            if len(rows) > 1 and all(re.match(r'^[\s\-:]+$', c) for c in rows[1]): rows.pop(1)
            if not rows: continue
            
            num_cols = max(len(r) for r in rows)
            for r in rows:
                while len(r) < num_cols: r.append("")
            col_widths = [0] * num_cols; font = fonts['normal']
            for r in rows:
                for j, cell in enumerate(r):
                    clean_cell = cell.replace('**', '').replace('\x02', '')
                    col_widths[j] = max(col_widths[j], font.getlength(clean_cell) + 20)
            total_w = sum(col_widths); max_table_w = width - 2 * padding
            if total_w > max_table_w: col_widths =[max(40, int(w / total_w * max_table_w)) for w in col_widths]
            elif total_w < max_table_w:
                extra = max_table_w - total_w
                for j in range(num_cols): col_widths[j] += extra // num_cols
                    
            layout.append({'type': 'table_border', 'height': 2})
            for row_idx, r in enumerate(rows):
                row_cells_wrapped =[]; max_lines = 1
                for j, cell in enumerate(r):
                    cell_lines = []; curr_line =[]; curr_x = 0
                    tokens = re.split(r'(\*\*|\x02)', cell)
                    is_bold = (row_idx == 0); is_italic = False
                    for part in tokens:
                        if part == '**': is_bold = not is_bold; continue
                        elif part == '\x02': is_italic = not is_italic; continue
                        if not part: continue
                        c_font_style = 'bold' if is_bold else 'normal'
                        c_color = colors['text']
                        if is_italic and c_font_style == 'normal': c_font_style = 'bold'; c_color = colors['italic']
                        c_font = fonts[c_font_style]
                        curr_chunk = ""
                        for char in part:
                            char_w = c_font.getlength(char)
                            if curr_x + char_w > col_widths[j] - 10:
                                if curr_chunk: curr_line.append((curr_chunk, c_font_style, c_color))
                                cell_lines.append(curr_line); curr_line =[]; curr_x = char_w; curr_chunk = char
                            else: curr_chunk += char; curr_x += char_w
                        if curr_chunk: curr_line.append((curr_chunk, c_font_style, c_color))
                    if curr_line: cell_lines.append(curr_line)
                    if not cell_lines: cell_lines = [[("", 'normal', colors['text'])]]
                    row_cells_wrapped.append(cell_lines); max_lines = max(max_lines, len(cell_lines))
                layout.append({'type': 'table_row', 'height': max_lines * 34 + 20, 'cells': row_cells_wrapped, 'col_widths': col_widths, 'is_header': row_idx == 0})
                layout.append({'type': 'table_border', 'height': 2})
            layout.append({'type': 'spacing', 'height': 20})
            continue

        if re.match(r'^[-*_]{3,}$', line):
            layout.append({'type': 'hr', 'height': 30}); i += 1; continue

        is_quote = False; base_color = colors['text']; font_style = 'normal'; start_x = padding
        header_match = re.match(r'^(#{1,5})\s+(.*)', line)
        list_match = re.match(r'^(\s*)[*+-]\s+(.*)', raw_line)
        
        if header_match:
            level = len(header_match.group(1)); line = header_match.group(2).replace('**', '').replace('\x02', '')
            font_style = f'h{level}'; base_color = colors['title']
        elif line.startswith('> '):
            is_quote = True; line = line[2:]; base_color = colors['quote']; start_x += 20
        elif list_match:
            indent = len(list_match.group(1)) // 2; line = '• ' + list_match.group(2); start_x += indent * 20
        elif line.startswith('【') and '】' in line:
            base_color = colors['highlight']; font_style = 'bold'; line = line.replace('**', '').replace('\x02', '')

        tokens = re.split(r'(\*\*|\x02)', line)
        current_line_elements =[]; current_x = start_x; line_max_h = 0
        for part in tokens:
            if part == '**': global_bold = not global_bold; continue
            elif part == '\x02': global_italic = not global_italic; continue
            if not part: continue
            
            curr_style = font_style; curr_color = base_color
            if curr_style == 'normal':
                if global_bold: curr_style = 'bold'
                if global_italic: curr_style = 'bold'; curr_color = colors['italic']
                    
            font = fonts[curr_style]
            chunk_h = {'h1':50, 'h2':42, 'h3':36, 'h4':32, 'h5':30, 'bold':34, 'normal':34}.get(curr_style, 34)
            curr_chunk = ""
            for char in part:
                char_w = font.getlength(char)
                if current_x + char_w > max_w:
                    if curr_chunk: current_line_elements.append((curr_chunk, font, curr_color, current_x - font.getlength(curr_chunk)))
                    line_max_h = max(line_max_h, chunk_h)
                    layout.append({'type': 'text_line', 'height': line_max_h, 'elements': current_line_elements, 'is_quote': is_quote, 'start_x': start_x})
                    current_line_elements =[]; current_x = start_x + (20 if is_quote else 0)
                    curr_chunk = char; current_x += char_w; line_max_h = chunk_h
                else: curr_chunk += char; current_x += char_w
            if curr_chunk:
                current_line_elements.append((curr_chunk, font, curr_color, current_x - font.getlength(curr_chunk)))
                line_max_h = max(line_max_h, chunk_h)
        if current_line_elements: layout.append({'type': 'text_line', 'height': line_max_h, 'elements': current_line_elements, 'is_quote': is_quote, 'start_x': start_x})
        layout.append({'type': 'spacing', 'height': 10})
        i += 1
    return layout

def text_to_images(text, file_title, report_title="TRPG 模组解析报告", theme='default', token_usage=''):
    """支持多风格模板与 Tokens 显示的终极排版引擎"""
    parts =[p.strip() for p in text.split('【分页符】') if p.strip()]
    if not parts: parts = [text]
        
    width, padding = 900, 50
    colors = get_theme_config(theme)
    fonts = load_markdown_fonts(colors['font_type'])
    images_bytes =[]
    
    for idx, part in enumerate(parts):
        layout = parse_markdown_layout(part, width, padding, fonts, colors)
        total_h = 110 + sum(line['height'] for line in layout) + 60 + padding
        
        img = Image.new('RGB', (width, total_h), colors['bg'])
        draw = ImageDraw.Draw(img)
        
        draw.rectangle([(0, 0), (width, 110)], fill=colors['header_bg'])
        draw.text((padding, 30), report_title, font=fonts['title'], fill=colors['header_text'])
        page_text = f"Page {idx+1}/{len(parts)} - {file_title[:15]}..." if len(parts) > 1 else f"{file_title[:20]}..."
        draw.text((padding+520, 48), page_text, font=fonts['small'], fill=colors['header_text'])
        
        y = 140
        for line in layout:
            if line['type'] == 'text_line':
                if line['is_quote']:
                    draw.rectangle([(padding, y + 4), (padding + 4, y + line['height'] - 4)], fill=colors['quote'])
                for txt, font_obj, color, x_pos in line['elements']:
                    draw.text((x_pos, y), txt, font=font_obj, fill=color)
            elif line['type'] == 'table_border':
                draw.line([(padding, y), (width - padding, y)], fill=colors['border'], width=2)
            elif line['type'] == 'table_row':
                col_x = padding
                for j, cell_lines in enumerate(line['cells']):
                    draw.line([(col_x, y), (col_x, y + line['height'])], fill=colors['border'], width=1)
                    text_y = y + 10
                    for c_line in cell_lines:
                        cell_x = col_x + 10
                        for txt, f_style, f_color in c_line:
                            draw.text((cell_x, text_y), txt, font=fonts[f_style], fill=f_color)
                            cell_x += fonts[f_style].getlength(txt)
                        text_y += 34
                    col_x += line['col_widths'][j]
                draw.line([(col_x, y), (col_x, y + line['height'])], fill=colors['border'], width=1)
            elif line['type'] == 'hr':
                draw.line([(padding, y + 15), (width - padding, y + 15)], fill=colors['border'], width=2)
            y += line['height']
            
        footer_text = f"AI 来自 Air {token_usage}"
        draw.text((padding, total_h-40), footer_text, font=fonts['small'], fill=colors['quote'])
        
        buf = BytesIO()
        img.save(buf, 'PNG')
        buf.seek(0)
        images_bytes.append(buf.getvalue())
        
    return images_bytes

def text_to_image(text, key_id):
    """向下兼容的单图模式"""
    images_bytes = text_to_images(text, key_id, "TRPG 跑团日志评分")
    return Image.open(BytesIO(images_bytes[0]))

# --- 百度网盘 OAuth 2.0 鉴权管理 ---
def get_valid_access_token():
    """获取有效的 access_token，如果过期则自动刷新"""
    token_data = {}
    
    # 1. 尝试从本地加载已保存的 Token
    if os.path.exists(BAIDU_TOKEN_FILE):
        try:
            with open(BAIDU_TOKEN_FILE, 'r', encoding='utf-8') as f:
                token_data = json.load(f)
        except Exception as e:
            print(f"读取 Token 文件失败: {e}")

    # 2. 检查 access_token 是否有效（预留 300 秒的缓冲时间）
    if token_data and 'access_token' in token_data:
        if time.time() < token_data.get('expires_at', 0) - 300:
            return token_data['access_token']
        
        # 3. 如果已过期，尝试使用 refresh_token 刷新
        refresh_token = token_data.get('refresh_token')
        if refresh_token:
            print("Access Token 已过期，正在自动刷新...")
            try:
                return refresh_baidu_token(refresh_token)
            except Exception as e:
                print(f"Token 刷新失败: {e}，将尝试使用 Authorization Code 重新获取。")

    # 4. 如果没有 Token，或者刷新失败，尝试使用配置中的 BAIDU_AUTH_CODE 获取
    if BAIDU_AUTH_CODE:
        print("正在使用 Authorization Code 首次获取 Token...")
        return fetch_new_token_with_code(BAIDU_AUTH_CODE)
    
    raise Exception("无法获取有效的百度网盘 access_token，请检查 AppKey、SecretKey 以及 Auth Code 配置。")

def fetch_new_token_with_code(code):
    """使用授权码(Code)换取首次的 Access Token"""
    url = "https://openapi.baidu.com/oauth/2.0/token"
    params = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": BAIDU_APP_KEY,
        "client_secret": BAIDU_SECRET_KEY,
        "redirect_uri": "oob"
    }
    resp = requests.get(url, params=params).json()
    if "access_token" in resp:
        # 计算过期时间戳 (当前时间 + 有效期秒数)
        resp['expires_at'] = time.time() + resp.get('expires_in', 2592000)
        with open(BAIDU_TOKEN_FILE, 'w', encoding='utf-8') as f:
            json.dump(resp, f)
        return resp['access_token']
    else:
        raise Exception(f"使用 Code 获取 Token 失败: {resp.get('error_description', resp)}")

def refresh_baidu_token(refresh_token):
    """使用 refresh_token 刷新 Access Token"""
    url = "https://openapi.baidu.com/oauth/2.0/token"
    params = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": BAIDU_APP_KEY,
        "client_secret": BAIDU_SECRET_KEY
    }
    resp = requests.get(url, params=params).json()
    if "access_token" in resp:
        resp['expires_at'] = time.time() + resp.get('expires_in', 2592000)
        with open(BAIDU_TOKEN_FILE, 'w', encoding='utf-8') as f:
            json.dump(resp, f)
        return resp['access_token']
    else:
        # 如果 refresh 也失效了（通常是10年过期或被用户手动撤销），建议删掉文件重新用code获取
        if os.path.exists(BAIDU_TOKEN_FILE):
            os.remove(BAIDU_TOKEN_FILE)
        raise Exception(f"刷新 Token 失败，授权可能已失效，请重新获取 Code: {resp.get('error_description', resp)}")


# --- 百度网盘 API 业务函数 ---
def baidu_search_files(keyword, limit=15):
    """在指定目录搜索，返回匹配的多个文件/文件夹（默认最多限制15个以防过大）"""
    token = get_valid_access_token()
    url = f"https://pan.baidu.com/rest/2.0/xpan/file?method=search&access_token={token}"
    params = {'key': keyword, 'dir': BAIDU_TARGET_DIR, 'recursion': 1}
    resp = requests.get(url, params=params).json()
    if resp.get('errno') == 0 and resp.get('list'):
        # 截取前 limit 个结果返回
        return resp['list'][:limit]
    return []

def baidu_create_share(fs_ids):
    """创建包含多个文件/文件夹的合并分享链接"""
    import random
    import string
    
    token = get_valid_access_token()
    url = f"https://pan.baidu.com/rest/2.0/xpan/share?method=set&access_token={token}"
    
    random_pwd = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
    
    # 将多个 fs_id 转换成 "[id1,id2,id3]" 的 JSON 数组格式
    fid_list_str = "[" + ",".join(map(str, fs_ids)) + "]"
    
    data = {
        'fid_list': fid_list_str,
        'schannel': 4,
        'channel_list': '[]',
        'period': 1,
        'pwd': random_pwd
    }
    
    headers = {"User-Agent": "pan.baidu.com"}
    resp = requests.post(url, data=data, headers=headers).json()
    
    if resp.get('errno') == 0:
        return f"链接: {resp.get('link')}\n提取码: {resp.get('pwd', random_pwd)}"
    else:
        raise Exception(f"创建合并分享失败: {resp}")

import posixpath
import concurrent.futures

# --- 重构的高效下载组件 ---
def baidu_get_dlinks_batch(fs_ids, token):
    """批量获取多个文件的 dlink 下载链接"""
    if not fs_ids: return {}
    url = f"https://pan.baidu.com/rest/2.0/xpan/multimedia?method=filemetas&access_token={token}"
    dlinks_map = {}
    
    # 百度要求一次请求最多约100个fs_id，我们分块处理
    for i in range(0, len(fs_ids), 100):
        chunk = fs_ids[i:i+100]
        params = {'fsids': '[' + ','.join(map(str, chunk)) + ']', 'dlink': 1}
        try:
            resp = requests.get(url, params=params, timeout=15).json()
            if resp.get('errno') == 0:
                for item in resp.get('list', []):
                    if item.get('dlink'):
                        dlinks_map[item['fs_id']] = item['dlink']
        except Exception as e:
            print(f"批量获取 dlink 失败: {e}")
    return dlinks_map

def download_baidu_file_to_temp(dlink, save_path, token):
    """使用特定的请求头并启用长连接下载文件"""
    download_url = f"{dlink}&access_token={token}"
    # 官方文档强烈要求必须带的 User-Agent
    headers = {"User-Agent": "pan.baidu.com"}
    
    try:
        # 使用 Session 处理 302 跳转更稳定，加入超时防卡死
        with requests.Session() as s:
            resp = s.get(download_url, headers=headers, stream=True, timeout=(10, 60))
            resp.raise_for_status()
            with open(save_path, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=1024*64): # 64KB一块，提高写入效率
                    if chunk: 
                        f.write(chunk)
    except Exception as e:
        print(f"文件下载失败 [{save_path}]: {e}")

def baidu_collect_files_recursive(target_dir, base_save_path, token, collected_tasks):
    """递归遍历文件夹，但不立即下载，只收集需要下载的任务列表"""
    url = f"https://pan.baidu.com/rest/2.0/xpan/file?method=list&access_token={token}"
    params = {'dir': target_dir, 'limit': 1000} # 单页最多拉取1000条
    
    try:
        resp = requests.get(url, params=params, timeout=15).json()
        if resp.get('errno') != 0: return

        for item in resp.get('list', []):
            if item['isdir'] == 1:
                new_dir = os.path.join(base_save_path, item['server_filename'])
                os.makedirs(new_dir, exist_ok=True)
                # 递归进下一层
                baidu_collect_files_recursive(item['path'], new_dir, token, collected_tasks)
            else:
                file_save_path = os.path.join(base_save_path, item['server_filename'])
                collected_tasks.append((item['fs_id'], file_save_path))
    except Exception as e:
        print(f"获取目录列表失败 [{target_dir}]: {e}")


# --- 优化后的搜索及打包上传模块 ---
def background_search_module(job_id, keyword, is_local, group_id, upload_baseurl):
    print(f"[{job_id}] 开始搜索模组: {keyword}, 本地模式: {is_local}")
    try:
        token = get_valid_access_token()
        
        # 1. 扩大初始拉取数量，供我们在本地进行精准过滤 (拉取前100个)
        raw_targets = baidu_search_files(keyword, limit=100)
        if not raw_targets:
            raise Exception(f"在网盘库中未找到包含 '{keyword}' 的内容")
        
        # 2. 核心优化 1：严格精准匹配与安全拦截
        # 将用户输入的关键字按空格拆分，确保每一个词都必须在文件名中出现
        keywords_list =[k.lower() for k in keyword.split()]
        strict_targets =[]
        
        for t in raw_targets:
            filename_lower = t['server_filename'].lower()
            
            # 强制拦截：文件名必须包含所有搜索关键词，剔除百度胡乱推荐的无关文件！
            if not all(k in filename_lower for k in keywords_list):
                continue
                
            # 安全拦截：过滤掉所有带有【】标识的保护级大合集文件夹
            if t['isdir'] == 1 and '{' in t['server_filename'] and '}' in t['server_filename']:
                print(f"[{job_id}] 安全拦截：丢弃集合文件夹 {t['server_filename']}")
                continue
                
            strict_targets.append(t)

        if not strict_targets:
            raise Exception(f"搜索词 '{keyword}' 未能精准匹配到有效模组（或命中了被保护的合集文件夹）。")

        # 3. 核心优化 2：路径折叠去重（只保留主文件夹，踢出多余的子文件）
        # 将所有结果按路径长度从小到大排序，这样父文件夹一定排在子文件前面
        strict_targets.sort(key=lambda x: len(x['path']))
        
        dedup_targets =[]
        accepted_dirs = set()
        
        for t in strict_targets:
            path = t['path']
            is_sub = False
            
            # 检查当前文件是否已经被包含在某个已被采纳的父文件夹中
            for ad in accepted_dirs:
                if path.startswith(ad + '/'):
                    is_sub = True
                    break
            
            # 如果不是任何已记录文件夹的子文件，才把它加入最终列表
            if not is_sub:
                dedup_targets.append(t)
                # 如果这个本身就是一个文件夹，记录它的路径
                if t['isdir'] == 1:
                    accepted_dirs.add(path)
        
        # 4. 按所属父级目录进行智能分组
        grouped_targets = {}
        for t in dedup_targets:
            parent_dir = posixpath.dirname(t['path'])
            if parent_dir not in grouped_targets:
                grouped_targets[parent_dir] = []
            grouped_targets[parent_dir].append(t)
        
        # 5. 网盘分享模式
        if not is_local:
            share_messages =[]
            # 最多处理前 5 个不同的文件夹区，防刷屏
            for parent_dir, targets_in_dir in list(grouped_targets.items())[:5]:
                fs_ids =[t['fs_id'] for t in targets_in_dir]
                names = [t['server_filename'] for t in targets_in_dir]
                
                try:
                    share_text = baidu_create_share(fs_ids)
                    folder_name = posixpath.basename(parent_dir) if parent_dir != '/' else '根目录'
                    names_str = "、".join(names[:4]) + ("..." if len(names)>4 else "")
                    
                    share_messages.append(f"📁 来自【{folder_name}】:\n📄 {names_str}\n{share_text}")
                except Exception as e:
                    print(f"[{job_id}] 创建分享失败 {parent_dir}: {e}")
            
            if not share_messages:
                raise Exception("网盘分享链接生成失败，可能是接口限制。")
            
            final_msg = f"🔍 找到了分散在不同文件夹的相关模组：\n\n" + "\n\n".join(share_messages)
            if len(grouped_targets) > 5:
                final_msg += f"\n\n(为防刷屏，已折叠其余 {len(grouped_targets)-5} 个文件夹的结果)"
                
            JOB_CACHE[job_id]['status'] = 'done'
            JOB_CACHE[job_id]['msg'] = final_msg
            return

        # 6. 本地下载打包模式
        temp_dir = tempfile.mkdtemp()
        try:
            print(f"[{job_id}] 正在分析目标结构...")
            group_folder_name = f"搜索结果_{keyword}"
            group_folder_path = os.path.join(temp_dir, group_folder_name)
            os.makedirs(group_folder_path, exist_ok=True)
            
            all_download_tasks = []
            total_files_limit = 30 # 限制总下载数
            names_display_lines =[]
            
            for parent_dir, targets_in_dir in list(grouped_targets.items())[:10]: 
                folder_name = posixpath.basename(parent_dir) if parent_dir != '/' else '根目录'
                names = [t['server_filename'] for t in targets_in_dir]
                names_display_lines.append(f"📁 【{folder_name}】: " + "、".join(names[:3]) + ("..." if len(names)>3 else ""))
                
                for t in targets_in_dir:
                    if len(all_download_tasks) >= total_files_limit: break
                    
                    server_filename = t['server_filename']
                    if t['isdir'] == 0:
                        save_path = os.path.join(group_folder_path, folder_name, server_filename)
                        os.makedirs(os.path.dirname(save_path), exist_ok=True)
                        all_download_tasks.append((t['fs_id'], save_path))
                    else:
                        sub_folder = os.path.join(group_folder_path, folder_name, server_filename)
                        os.makedirs(sub_folder, exist_ok=True)
                        baidu_collect_files_recursive(t['path'], sub_folder, token, all_download_tasks)
            
            names_display = "\n".join(names_display_lines)
            if len(grouped_targets) > 10:
                names_display += f"\n...等共 {len(grouped_targets)} 个文件夹的匹配结果"

            # 批量换取下载直链并多线程下载
            print(f"[{job_id}] 总计 {len(all_download_tasks)} 个文件，正在批量换取下载直链...")
            task_fs_ids = [task[0] for task in all_download_tasks]
            dlinks_map = baidu_get_dlinks_batch(task_fs_ids, token)
            
            def _worker(task):
                fs_id, save_path = task
                dlink = dlinks_map.get(fs_id)
                if dlink: download_baidu_file_to_temp(dlink, save_path, token)

            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                list(executor.map(_worker, all_download_tasks))
            
            # 打包并上传
            final_filename = f"{group_folder_name}.zip"
            final_upload_path = os.path.join(temp_dir, final_filename)
            
            with zipfile.ZipFile(final_upload_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(group_folder_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.join(group_folder_name, os.path.relpath(file_path, group_folder_path))
                        zipf.write(file_path, arcname)

            # Official QQ does not expose OneBot's /upload_group_file action.
            # Keep the archive until the core downloads it and uploads it via
            # the official group /files endpoint.
            if str(upload_baseurl).strip().lower() == 'official':
                JOB_CACHE[job_id]['download_path'] = final_upload_path
                JOB_CACHE[job_id]['download_name'] = final_filename
                JOB_CACHE[job_id]['status'] = 'done'
                JOB_CACHE[job_id]['download_url'] = f"/api/module_download?id={urllib.parse.quote(job_id)}"
                JOB_CACHE[job_id]['msg'] = f"✅ 已生成【{final_filename}】，正在通过官方 Bot 上传到群文件！\n包含以下内容：\n{names_display}"
                temp_dir = None
            else:
                sess = get_session()
                upload_url = f"{upload_baseurl}/upload_group_file?group_id={group_id}&file=file://{final_upload_path}&name={urllib.parse.quote(final_filename)}"
                upload_resp = sess.get(upload_url, timeout=300).json()

                if upload_resp.get('status') == 'ok':
                    JOB_CACHE[job_id]['status'] = 'done'
                    JOB_CACHE[job_id]['msg'] = f"✅ 已将内容归档为【{final_filename}】并上传至群文件！\n包含以下内容：\n{names_display}"
                else:
                    raise Exception(f"群文件上传失败: {upload_resp}")
                shutil.rmtree(temp_dir, ignore_errors=True)
                temp_dir = None

        finally:
            if temp_dir:
                shutil.rmtree(temp_dir, ignore_errors=True)

    except Exception as e:
        print(f"[{job_id}] 搜索处理失败: {e}")
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['msg'] = f"模组获取失败：{str(e)}"

# --- 新增 Flask API 路由 ---
@app.route('/api/search_module', methods=['GET'])
def search_module_task():
    """网盘模组搜索任务"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    keyword = request.args.get('keyword')
    is_local = request.args.get('local', 'false').lower() == 'true'
    group_id = request.args.get('group_id', '')
    upload_baseurl = request.args.get('upload_url', '')

    if not keyword:
        return jsonify({'status': 'error', 'msg': '缺少搜索关键字'})

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    executor.submit(background_search_module, job_id, keyword, is_local, group_id, upload_baseurl)
    
    return jsonify({'status': 'ok', 'id': job_id})

# --- API 接口 ---

@app.route('/api/submit', methods=['GET', 'POST'])
def submit_task():
    """提交日志分析任务 (统一且安全的参数提取)"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    # 统一接收参数，无论是 GET 还是 POST 都转为字典提取，彻底消灭变量未定义异常！
    req_data = request.get_json(silent=True) or {} if request.method == 'POST' else request.args

    key = req_data.get('key')
    password = req_data.get('password')
    source = req_data.get('source')
    is_pro = str(req_data.get('pro', 'false')).lower() == 'true'
    is_kind = str(req_data.get('kind', 'false')).lower() == 'true'
    is_ds = str(req_data.get('ds', 'false')).lower() == 'true'
    mode = req_data.get('mode', 'analyze')
    persona = req_data.get('persona', '')
    custom_prompt = req_data.get('custom_prompt', '')
    theme = req_data.get('theme', 'default')
    group_key = str(req_data.get('group_key', '') or '')
    backup_model = str(req_data.get('backup_model', '') or '')
    user_key = str(req_data.get('user_key', '') or '')[:64]
    user_name = str(req_data.get('user_name', '') or '')[:80]
    custom_name = str(req_data.get('custom_name', '') or '')[:80]
    token_module = str(req_data.get('token_module', '') or '')[:60]
    log_sources = req_data.get('log_sources')
    if not isinstance(log_sources, list):
        log_sources = None
    else:
        log_sources = [item for item in log_sources[:20] if isinstance(item, dict)][:20]

    if not source:
        if key and '-' in key and key.split('-')[0].isdigit(): source = "trpgbot"
        elif key and ('_' in key or len(key) > 20): source = "kokona"
        else: source = "weizaima"

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    # 将所有参数（包括 theme、group_key）传入后台线程
    executor.submit(background_process, job_id, key, password, source, is_pro, is_kind, mode, persona, custom_prompt, theme, is_ds, group_key, backup_model, user_key, user_name, custom_name, token_module, log_sources)
    return jsonify({'status': 'ok', 'id': job_id})


@app.route('/api/submit_file', methods=['GET', 'POST'])
def submit_file_task():
    """提交本地文件分析任务 (统一且安全的参数提取)"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    req_data = request.get_json(silent=True) or {} if request.method == 'POST' else request.args

    file_url = req_data.get('url')
    filename = req_data.get('filename')
    mode = req_data.get('mode', 'analyze')
    is_pro = str(req_data.get('pro', 'false')).lower() == 'true'
    is_kind = str(req_data.get('kind', 'false')).lower() == 'true'
    is_ds = str(req_data.get('ds', 'false')).lower() == 'true'
    persona = req_data.get('persona', '')
    custom_prompt = req_data.get('custom_prompt', '')
    custom_name = str(req_data.get('custom_name', '') or '')[:80]
    theme = req_data.get('theme', 'default')
    group_key = str(req_data.get('group_key', '') or '')
    user_key = str(req_data.get('user_key', '') or '')
    user_name = str(req_data.get('user_name', '') or '')[:80]
    token_module = str(req_data.get('token_module', '') or '')[:60]
    backup_model = str(req_data.get('backup_model', '') or '')
    backup_label = str(req_data.get('backup_label', '') or '')[:40]
    card_system = str(req_data.get('card_system', 'auto') or 'auto').strip().lower()
    if card_system not in ('auto', 'coc', 'dnd'):
        card_system = 'auto'
    
    if not file_url or not filename: 
        return jsonify({'status': 'error', 'msg': 'Missing url or filename'})

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    # 将所有参数（包括 theme、group_key、user_key）传入后台线程
    executor.submit(background_file_process, job_id, file_url, filename, mode, is_pro, is_kind, persona, custom_prompt, theme, is_ds, group_key, user_key, custom_name, card_system, backup_model, backup_label, user_name, token_module)
    return jsonify({'status': 'ok', 'id': job_id})


# ============ 角色卡库管理端点（按用户跨群共享） ============
@app.route('/api/sheet_cards', methods=['GET'])
def api_sheet_cards():
    """列出角色卡。user_key 非空 → 只看该用户；为空 → 汇总全库所有用户（跨群视图）。"""
    user_key = str(request.args.get('user_key', '') or '')
    try:
        cards = load_user_cards(user_key)
        summary_list = []
        for c in cards:
            attrs = c.get('attributes', {}) or {}
            summary_list.append({
                'name': c.get('name', '未命名'),
                'age': c.get('age', ''),
                'score': c.get('score', 0),
                'tier': c.get('tier', ''),
                'attr_count': len(attrs) if isinstance(attrs, dict) else 0,
                'has_background': bool(c.get('background', '')),
                'saved_at': c.get('saved_at', ''),
                'owner': c.get('owner', ''),
            })
        return jsonify({'status': 'ok', 'count': len(summary_list), 'cards': summary_list})
    except Exception as e:
        return jsonify({'status': 'error', 'msg': str(e)})


@app.route('/api/sheet_card_detail', methods=['GET'])
def api_sheet_card_detail():
    """查看指定角色卡的完整内容（支持模糊匹配）。user_key 为空则全库检索。"""
    user_key = str(request.args.get('user_key', '') or '')
    name = str(request.args.get('name', '') or '').strip()
    if not name:
        return jsonify({'status': 'error', 'msg': 'name 参数不能为空'})
    try:
        cards = load_user_cards(user_key)
        # 优先精确匹配
        exact = [c for c in cards if str(c.get('name', '')).strip() == name]
        target = exact[0] if exact else None
        # 退化为模糊匹配（最高相似度）
        if not target and cards:
            best, best_score = None, 0.0
            for c in cards:
                s = _name_similarity(name, str(c.get('name', '')))
                if s > best_score:
                    best, best_score = c, s
            if best_score >= 0.6:
                target = best
        if not target:
            return jsonify({'status': 'error', 'msg': f'未找到角色卡：{name}'})
        return jsonify({'status': 'ok', 'card': target})
    except Exception as e:
        return jsonify({'status': 'error', 'msg': str(e)})


@app.route('/api/sheet_card_delete', methods=['GET', 'POST'])
def api_sheet_card_delete():
    """删除角色卡（必须给出 user_key，避免误删他人卡）。"""
    if request.method == 'POST':
        req_data = request.get_json(silent=True) or {}
    else:
        req_data = request.args
    user_key = str(req_data.get('user_key', '') or '')
    name = str(req_data.get('name', '') or '').strip()
    if not name:
        return jsonify({'status': 'error', 'msg': 'name 参数不能为空'})
    if not user_key:
        return jsonify({'status': 'error', 'msg': 'user_key 参数不能为空（跨群共享卡库要求指定持有者）'})
    try:
        cards_dir = get_cards_dir(user_key)
        safe = _sanitize_filename(name)
        target_path = os.path.join(cards_dir, f'{safe}.json')
        if os.path.exists(target_path):
            os.remove(target_path)
            return jsonify({'status': 'ok', 'msg': f'已删除角色卡：{name}'})
        # 回退：遍历目录寻找 name 字段匹配的文件
        if os.path.isdir(cards_dir):
            for fn in os.listdir(cards_dir):
                if not fn.endswith('.json'):
                    continue
                fp = os.path.join(cards_dir, fn)
                try:
                    with open(fp, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    if str(data.get('name', '')).strip() == name:
                        os.remove(fp)
                        return jsonify({'status': 'ok', 'msg': f'已删除角色卡：{name}'})
                except Exception:
                    continue
        return jsonify({'status': 'error', 'msg': f'未找到角色卡：{name}'})
    except Exception as e:
        return jsonify({'status': 'error', 'msg': str(e)})


@app.route('/api/status', methods=['GET'])
def check_status():
    """查询任务状态，附带图像数量"""
    job_id = request.args.get('id')
    job = JOB_CACHE.get(job_id)
    if not job: return jsonify({'status': 'not_found'})
    
    # 兼容老版只返回单图的逻辑以及新版的多图逻辑
    img_count = len(job.get('images', [])) if 'images' in job else (1 if 'image' in job else 0)
    
    resp_data = {
        'status': job['status'],
        'msg': job.get('msg', ''),
        'image_count': img_count
    }
    # 活跃度计时器需要从状态接口读取复盘正文；图片关闭或生成失败时会回退为文字。
    if 'text' in job:
        resp_data['text'] = job['text']
    # 【新增】：若为角色卡评分任务，把姓名/年龄/分数/品质一并返回给前端
    if 'summary' in job:
        resp_data['summary'] = job['summary']
    if 'download_url' in job:
        resp_data['download_url'] = job['download_url']
    return jsonify(resp_data)

@app.route('/api/module_download', methods=['GET'])
def module_download():
    """一次性提供模组搜索生成的压缩包，供官方 Bot 核心上传到群文件。"""
    job_id = request.args.get('id', '')
    job = JOB_CACHE.get(job_id)
    path = job.get('download_path') if job else None
    if not path or not os.path.isfile(path):
        return jsonify({'status': 'not_found', 'msg': '压缩包不存在或已过期'}), 404

    def cleanup():
        try:
            temp_dir = os.path.dirname(path)
            shutil.rmtree(temp_dir, ignore_errors=True)
            job.pop('download_path', None)
        except Exception as exc:
            app.logger.warning('清理模组临时压缩包失败: %s', exc)

    # 留出官方 Bot 下载并上传的时间，避免响应刚建立就删除临时文件。
    threading.Timer(600, cleanup).start()
    return send_file(path, as_attachment=True, download_name=job.get('download_name', 'module.zip'))

@app.route('/api/result', methods=['GET'])
def get_result():
    """获取最终图片 (支持index下标获取指定分页)"""
    job_id = request.args.get('id')
    index = int(request.args.get('index', 0))
    job = JOB_CACHE.get(job_id)
    
    if not job: return "Result not found", 404
    
    # 获取图像数据（兼容新老字段）
    img_data = None
    if 'images' in job and index < len(job['images']):
        img_data = job['images'][index]
    elif 'image' in job and index == 0:
        img_data = job['image']
        
    if not img_data: return "Index out of range or not ready", 404
    
    return send_file(
        BytesIO(img_data), 
        mimetype='image/png', 
        download_name=f'log_analysis_{job_id}_{index}.png'
    )

@app.route('/api/result_base64', methods=['GET'])
def get_result_base64():
    """返回 Base64 图片，供海豹在 QQ 客户端无法访问本机 URL 时中转。"""
    job_id = request.args.get('id')
    try:
        index = int(request.args.get('index', 0))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'msg': 'index 必须是整数'}), 400

    job = JOB_CACHE.get(job_id)
    if not job:
        return jsonify({'status': 'error', 'msg': 'Result not found'}), 404

    images = job.get('images', [])
    if not isinstance(images, list) or index < 0 or index >= len(images):
        return jsonify({'status': 'error', 'msg': 'Index out of range or not ready'}), 404

    img_data = images[index]
    if not img_data:
        return jsonify({'status': 'error', 'msg': 'Image data is empty'}), 404

    return jsonify({
        'status': 'ok',
        'mime': 'image/png',
        'data': base64.b64encode(img_data).decode('ascii')
    })

def background_render_text(job_id, text, file_title, report_title, theme):
    """Use the existing report renderer for text submitted by local plugins."""
    try:
        rendered_text, final_theme = extract_theme_from_text(text, theme)
        images = text_to_images(rendered_text, file_title, report_title, final_theme)
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['images'] = images
    except Exception as e:
        print(f"[{job_id}] Text rendering failed: {e}")
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['msg'] = str(e)

@app.route('/api/render_text', methods=['POST'])
def render_text_task():
    """Render trusted-size Markdown text into one or more report PNG pages."""
    if len(JOB_CACHE) > 100:
        JOB_CACHE.clear()

    req_data = request.get_json(silent=True) or {}
    text = str(req_data.get('text', '') or '').strip()
    file_title = str(req_data.get('file_title', '跑团记录') or '跑团记录').strip()[:80]
    report_title = str(req_data.get('report_title', '跑团效率复盘') or '跑团效率复盘').strip()[:40]
    theme = str(req_data.get('theme', 'default') or 'default').strip().lower()
    allowed_themes = {'default', 'classic', 'cthulhu', 'cyberpunk', 'historical', 'wasteland', 'anime', 'terminal'}

    if not text:
        return jsonify({'status': 'error', 'msg': '缺少 text'})
    if len(text) > 100000:
        return jsonify({'status': 'error', 'msg': 'text 超过 100000 字符上限'})
    if theme not in allowed_themes:
        theme = 'default'

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    executor.submit(background_render_text, job_id, text, file_title, report_title, theme)
    return jsonify({'status': 'ok', 'id': job_id})

def _session_review_content(message_content):
    """兼容 OpenAI 兼容接口返回字符串或 content 数组。"""
    if isinstance(message_content, str):
        return message_content.strip()
    if isinstance(message_content, list):
        parts = []
        for item in message_content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and item.get('text'):
                parts.append(str(item['text']))
        return '\n'.join(parts).strip()
    return str(message_content or '').strip()

def _is_local_plugin_request():
    """复盘和归档接口只允许本机海豹插件调用。"""
    remote_addr = str(request.remote_addr or '').lower()
    return remote_addr == '::1' or remote_addr.startswith('127.') or remote_addr == '::ffff:127.0.0.1'

def _sanitize_session_review(text):
    value = str(text or '').strip()
    if not value:
        return ''
    value = re.sub(
        r'^\s*(?:#{1,6}\s*)?(?:【|\[)?\s*(?:LLM|AI)\s*(?:跑团)?\s*(?:效率)?\s*(?:复盘|分析|点评)?\s*(?:】|\])?\s*[:：-]*\s*',
        '', value, flags=re.IGNORECASE
    )
    if not value:
        return ''
    if not re.search(r'^#{1,6}\s*整体判断', value, flags=re.MULTILINE):
        value = f'## 整体判断\n{value}'
    return value.strip()

def background_session_review(job_id, payload):
    """后台调用计时器提交的 OpenAI 兼容复盘请求，并可选生成图片。"""
    try:
        api_url = payload['api_url']
        api_key = payload.get('api_key') or 'local-no-key'
        model = payload['model']
        request_timeout = max(15.0, min(300.0, float(payload.get('request_timeout', 90))))
        headers = {'Content-Type': 'application/json'}
        if payload.get('api_key'):
            headers['Authorization'] = f'Bearer {api_key}'

        messages = [
            {'role': 'system', 'content': payload['system_prompt']},
            {'role': 'user', 'content': json.dumps(payload['dataset'], ensure_ascii=False)}
        ]
        response = requests.post(
            api_url,
            headers=headers,
            json={
                'model': model,
                'messages': messages,
                'temperature': max(0.0, min(2.0, float(payload.get('temperature', 0.3)))),
                'max_tokens': max(128, min(8192, int(payload.get('max_tokens', 1600))))
            },
            timeout=(10, request_timeout)
        )
        response.raise_for_status()
        response_data = response.json()
        record_token_usage(
            response_data, messages, module="session_review", model=model,
            user_key=payload.get('user_key', ''), user_name=payload.get('user_name', ''),
            group_key=payload.get('group_key', ''), prompt_name=payload.get('prompt_name', '跑团复盘'),
            prompt=payload['system_prompt'], job_id=job_id,
        )
        content = _session_review_content(response_data['choices'][0]['message']['content'])
        if not content:
            raise ValueError('复盘服务返回中没有可读文本')

        content = _sanitize_session_review(content)
        JOB_CACHE[job_id]['text'] = content
        if payload.get('render_image', True):
            rendered_text, final_theme = extract_theme_from_text(content, payload.get('theme', 'default'))
            JOB_CACHE[job_id]['images'] = text_to_images(
                rendered_text,
                payload.get('file_title', '跑团记录'),
                payload.get('report_title', '跑团效率复盘'),
                final_theme
            )
        JOB_CACHE[job_id]['status'] = 'done'
    except Exception as e:
        print(f'[{job_id}] Session review failed: {e}')
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['msg'] = str(e)

@app.route('/api/session_review', methods=['POST'])
def session_review_task():
    """异步提交跑团活跃度计时器的 LLM 复盘任务。"""
    if not _is_local_plugin_request():
        return jsonify({'status': 'error', 'msg': '该接口只接受本机插件请求'}), 403
    if len(JOB_CACHE) > 100:
        JOB_CACHE.clear()

    payload = request.get_json(silent=True) or {}
    api_url = str(payload.get('api_url', '') or '').strip()
    model = str(payload.get('model', '') or '').strip()
    system_prompt = str(payload.get('system_prompt', '') or '').strip()
    dataset = payload.get('dataset')
    theme = str(payload.get('theme', 'default') or 'default').strip().lower()
    allowed_themes = {'default', 'classic', 'cthulhu', 'cyberpunk', 'historical', 'wasteland', 'anime', 'terminal'}

    if not re.match(r'^https?://', api_url, flags=re.IGNORECASE):
        return jsonify({'status': 'error', 'msg': 'api_url 必须是 HTTP(S) 地址'})
    if not api_url.rstrip('/').endswith('/chat/completions'):
        return jsonify({'status': 'error', 'msg': 'api_url 必须指向 /chat/completions'})
    if not model or not system_prompt or not isinstance(dataset, dict):
        return jsonify({'status': 'error', 'msg': '缺少 model、system_prompt 或 dataset'})
    if len(system_prompt) > 20000 or len(json.dumps(dataset, ensure_ascii=False)) > 200000:
        return jsonify({'status': 'error', 'msg': '复盘输入超过后端安全上限'})
    if theme not in allowed_themes:
        theme = 'default'

    normalized_payload = dict(payload)
    normalized_payload['api_url'] = api_url
    normalized_payload['model'] = model
    normalized_payload['system_prompt'] = system_prompt
    normalized_payload['theme'] = theme
    normalized_payload['file_title'] = str(payload.get('file_title', '跑团记录') or '跑团记录').strip()[:80]
    normalized_payload['report_title'] = str(payload.get('report_title', '跑团效率复盘') or '跑团效率复盘').strip()[:40]

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    review_executor.submit(background_session_review, job_id, normalized_payload)
    return jsonify({'status': 'ok', 'id': job_id})


@app.route('/api/token_stats', methods=['GET'])
def token_stats_summary():
    """Return aggregated Token statistics without exposing full prompts."""
    if not _is_local_plugin_request():
        return jsonify({'status': 'error', 'msg': '该接口只接受本机插件请求'}), 403
    try:
        days = max(0, min(3650, int(request.args.get('days', 30))))
        limit = max(1, min(50, int(request.args.get('limit', 15))))
        return jsonify({'status': 'ok', **TOKEN_LEDGER.summary(days=days or None, limit=limit)})
    except Exception as exc:
        return jsonify({'status': 'error', 'msg': str(exc)})


@app.route('/api/token_rankings', methods=['GET', 'POST'])
def token_rankings_image():
    """Render user and module Token ranking images into the normal job result cache."""
    if not _is_local_plugin_request():
        return jsonify({'status': 'error', 'msg': '该接口只接受本机插件请求'}), 403
    try:
        days = max(0, min(3650, int(request.args.get('days', 30))))
        limit = max(1, min(30, int(request.args.get('limit', 15))))
        display_names = {}
        if request.method == 'POST':
            body = request.get_json(silent=True) or {}
            display_names = body.get('user_names') or {}
        else:
            raw_names = request.args.get('user_names', '')
            if raw_names:
                try:
                    display_names = json.loads(raw_names)
                except (TypeError, ValueError, json.JSONDecodeError):
                    display_names = {}
        summary = TOKEN_LEDGER.summary(days=days or None, limit=limit)
        apply_user_display_names(summary, display_names)
        images = render_rankings(summary, FONT_PATH)
        job_id = str(uuid.uuid4())
        JOB_CACHE[job_id] = {'status': 'done', 'created': time.time(), 'images': images}
        return jsonify({
            'status': 'ok', 'id': job_id, 'image_count': len(images),
            'calls': summary['calls'], 'total_tokens': summary['total_tokens'],
        })
    except Exception as exc:
        return jsonify({'status': 'error', 'msg': str(exc)})

def background_session_archive(job_id, target_url, token, payload, request_timeout):
    try:
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        response = requests.post(
            target_url,
            headers=headers,
            json=payload,
            timeout=(10, request_timeout)
        )
        response.raise_for_status()
        JOB_CACHE[job_id]['status'] = 'done'
    except Exception as e:
        print(f'[{job_id}] Session archive failed: {e}')
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['msg'] = str(e)

@app.route('/api/session_archive', methods=['POST'])
def session_archive_task():
    """异步转发计时器的可选后台统计上报。"""
    if not _is_local_plugin_request():
        return jsonify({'status': 'error', 'msg': '该接口只接受本机插件请求'}), 403

    payload = request.get_json(silent=True) or {}
    target_url = str(payload.get('target_url', '') or '').strip()
    archive_payload = payload.get('payload')
    if not re.match(r'^https?://', target_url, flags=re.IGNORECASE):
        return jsonify({'status': 'error', 'msg': 'target_url 必须是 HTTP(S) 地址'})
    if not isinstance(archive_payload, dict):
        return jsonify({'status': 'error', 'msg': 'payload 必须是 JSON 对象'})

    try:
        request_timeout = max(15.0, min(300.0, float(payload.get('request_timeout', 90))))
    except (TypeError, ValueError):
        request_timeout = 90.0

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    review_executor.submit(
        background_session_archive,
        job_id,
        target_url,
        str(payload.get('token', '') or ''),
        archive_payload,
        request_timeout
    )
    return jsonify({'status': 'ok', 'id': job_id})

# --- 文本生成图片任务 ---
import random

def background_generate_image(job_id, prompt, size="1024x1024"):
    print(f"[{job_id}] 开始生成图片(NovelAI V4.5 官方复刻模式): {prompt}, 尺寸: {size}")
    try:
        # NovelAI V4.5 最优分辨率映射
        width, height = 1024, 1024
        if size == "1792x1024":
            width, height = 1216, 832   # 横图
        elif size == "1024x1792":
            width, height = 832, 1216   # 竖图

        url = "https://image.novelai.net/ai/generate-image"
        headers = {
            "Authorization": f"Bearer {IMAGE_API_KEY.strip()}",
            "Content-Type": "application/json"
        }
        
        # 强制负面提示词：首位死锁 nsfw，并融合官方 V4.5 的默认负面起手式
        negative_prompt = "nsfw, lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, normal quality, signature, watermark, username, blurry"
        
        # 像素级复刻官方 Payload 结构，填补引发 500 报错的所有缺失字段
        payload = {
            "input": prompt,
            "model": "nai-diffusion-4-5-full",
            "action": "generate",
            "parameters": {
                "params_version": 3,
                "width": width,
                "height": height,
                "scale": 5.0,
                "sampler": "k_euler_ancestral",  # 官方默认采样器
                "steps": 28,
                "seed": random.randint(1, 999999999), # 必须带上随机种子
                "n_samples": 1,
                "qualityToggle": True,
                "dynamic_thresholding": False,
                "controlnet_strength": 1.0,
                "legacy": False,
                "add_original_image": False,
                "cfg_rescale": 0,
                "noise_schedule": "karras",
                "legacy_v3_extend": False,
                "use_coords": False,
                "legacy_uc": False,
                "characterPrompts": [],
                # 【修复核心】完整的 V4 提示词块
                "v4_prompt": {
                    "caption": {
                        "base_caption": prompt,
                        "char_captions": []
                    },
                    "use_coords": False,
                    "use_order": True
                },
                # 【修复核心】完整的 V4 负面提示词块（不传这个必定报 500）
                "v4_negative_prompt": {
                    "caption": {
                        "base_caption": negative_prompt,
                        "char_captions": []
                    },
                    "legacy_uc": False
                },
                "negative_prompt": negative_prompt,
                "deliberate_euler_ancestral_bug": False,
                "prefer_brownian": True,
                "image_format": "png"
            }
        }
        
        # 发送请求
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        
        if resp.status_code != 200:
            raise Exception(f"NovelAI 接口返回错误: {resp.status_code} - {resp.text}")
            
        img_bytes = None
        
        # 按照 NovelAI 规范解压 ZIP（或者直接接收 PNG）
        import zipfile
        from io import BytesIO
        try:
            with zipfile.ZipFile(BytesIO(resp.content)) as zip_ref:
                img_bytes = zip_ref.read("image_0.png")
        except zipfile.BadZipFile:
            # V4.5 API 在指定 image_format: png 时可能直接返回图片文件
            img_bytes = resp.content
            
        if not img_bytes:
            raise Exception("未能从 NovelAI 返回的数据中提取出图片。")
        
        # 保存图像字节流
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['image'] = img_bytes
        print(f"[{job_id}] 图片生成完成 (V4.5 完美版)")

    except Exception as e:
        print(f"[{job_id}] 图片生成失败: {e}")
        err_img_bytes = text_to_images(f"NovelAI 绘图失败：\n{str(e)}", "绘图错误")[0]
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['images'] = [err_img_bytes]

@app.route('/api/submit_image_gen', methods=['GET'])
def submit_image_gen_task():
    """提交生成图片任务"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    prompt = request.args.get('prompt')
    size = request.args.get('size', '1024x1024')
    
    if not prompt:
        return jsonify({'status': 'error', 'msg': '缺少 prompt'})

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    executor.submit(background_generate_image, job_id, prompt, size)
    
    return jsonify({'status': 'ok', 'id': job_id})

if __name__ == '__main__':
    disable_quick_edit()
    if not os.path.exists("./fonts"): os.makedirs("./fonts")
    print("Async Log Server Started (Port: 8000)")
    app.run(host='0.0.0.0', port=8000)
