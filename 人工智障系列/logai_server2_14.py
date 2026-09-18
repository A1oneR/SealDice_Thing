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
import math
import threading
import tempfile
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from flask import Flask, request, send_file, jsonify
from PIL import Image, ImageColor, ImageDraw, ImageFont
from openai import OpenAI
# 新增依赖
import PyPDF2
try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None
import docx
from docx import Document
import urllib.parse
import zipfile
import shutil
import hashlib
import datetime
import textwrap
try:
    from sheet_importer import extract_import_card
except ImportError:
    try:
        from .sheet_importer import extract_import_card
    except ImportError:
        extract_import_card = None
try:
    from token_stats import TokenLedger, apply_user_display_names, module_from_mode, render_rankings
except ImportError:
    from .token_stats import TokenLedger, apply_user_display_names, module_from_mode, render_rankings

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

def validate_model_endpoint(api_key, base_url, label):
    key = str(api_key or "").strip()
    url = str(base_url or "").strip()
    placeholder_words = ("你的", "这里", "your-key", "example.com")
    if not key or not url or any(word in key.lower() or word in url.lower() for word in placeholder_words):
        raise RuntimeError(f"{label}尚未配置有效的 API Key 或 Base URL，请先修改服务器配置或设置对应环境变量。")
    try:
        key.encode('ascii')
        url.encode('ascii')
    except UnicodeEncodeError:
        raise RuntimeError(f"{label}的 API Key/Base URL 含有中文占位符或其他非 ASCII 字符，请填写真实服务地址和密钥。")
    if not re.match(r'^https?://', url, re.IGNORECASE):
        raise RuntimeError(f"{label}的 Base URL 必须以 http:// 或 https:// 开头。")

# --- 绘图专用配置 (NovelAI) ---
# 请填入 NovelAI 提供的 API Key (通常是以 pst- 开头的一长串字符)
IMAGE_API_KEY = "pst-我的NovelAI"

# 推荐使用最新的 V3 模型，这是目前 NovelAI 画二次元最好的模型
IMAGE_MODEL = "nai-diffusion-5-full" 
# 漫画使用同一套 NovelAI 接口；如果账号开通了更新的模型，可通过环境变量
# LOGAI_NOVELAI_COMIC_MODEL 覆盖，避免不同账号因模型名差异无法启动服务。
IMAGE_COMIC_MODEL = os.getenv("LOGAI_NOVELAI_COMIC_MODEL", IMAGE_MODEL)
COMIC_STYLE_DEFAULT = "2D日式叙事插画漫画，绘本质感，红橙色电影感光影，手绘线稿，柔和数字笔触"
# 漫画分镜单独使用低思考成本模型；API 地址与主模型共用。
COMIC_STORYBOARD_MODEL = os.getenv("LOGAI_COMIC_STORYBOARD_MODEL", "gpt-5.6-sol-low")
COMIC_PROMPT_VERSION = "comic-prompt-v6"
# NovelAI 的 Quality Tags: Standard 预设附加项，保持与网页预设一致。
COMIC_NOVELAI_QUALITY_TAGS = os.getenv(
    "LOGAI_COMIC_NOVELAI_QUALITY_TAGS",
    "very aesthetic, masterpiece, no text",
).strip()[:300]
# 可在服务器环境变量中提供固定外观；为空时优先从本次 Log 匹配到的角色卡构建。
COMIC_CHARACTER_BIBLE_DEFAULT = os.getenv("LOGAI_COMIC_CHARACTER_BIBLE", "").strip()[:2400]
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


# ================= 跑团/带团风格深度分析模式（v2.13 新增） =================
PLAYER_STYLE_SYSTEM_PROMPT = """你是一位阅历极深、洞察力敏锐的资深 TRPG 观察家与跑团首席评审官（精通 COC、DND 等多种主流跑团规则）。
你的任务是：根据提供的跑团 Log 日志（可能是单个文件，也可能是多场次/多章节拼接而成的链接集合），聚焦分析指定对象（目标玩家/主持，可能是 QQ 账号或角色名/昵称）在团内的真实表现，深入剖析其【跑团风格】或【带团风格】，并给出极具专业度、洞察力与跑团风味的客观评价。
（特别注意：当日志由多段拼接而成时，系统已自动按时间戳将其从早到晚严格正序排列，各段头部标注有实际时间跨度。请你重点结合时间轴，深度观察该对象随着时间推移的风格变化、角色演绎成熟度与经验演化历程）。

【极其重要的身份研判与大标题指令】：
在深入分析前，请务必通读该用户在日志中的真实言行细节做出独立研判（不要受外界干扰，后端提供的统计仅作线索参考，你作为通读全篇的主考官拥有最终身份裁决权）：
1. 【PL 跑团玩家】：其发言主要为调查员/PC 的角色扮演（RP）、第一人称心理描写、与其他PC的互动对话、行动申报、遭遇危机时的决策、以及属性/技能检定投骰；
2. 【KP/DM/守秘人 主持人】：其发言主要为环境/场景描写、氛围烘托、主线叙事推进、NPC 角色演绎、向玩家要求检定、规则裁决、暗投或控场引导；
3. 【全能双重】：在多场次/多章节日志中，既有作为调查员/PC 跑团，也有作为主持/KP 带团。

【首行强制输出身份标签（用于后端生成长图大标题）】：
请在你的分析回复的最开头第一行（必须在任何【分页符】之前），输出且仅输出你的最终身份研判标签，格式严格为以下三者之一（单独起一行，不要加粗，不要输出其他字符）：
【身份：PL】
【身份：KP】
【身份：双重】
后端排版渲染引擎将严格依据该标签决定生成的长图报告顶部大标题（如《TRPG 玩家跑团风格报告》或《TRPG 主持带团风格报告》）。

在第一行输出身份标签后，换行进入正文。请严格提供以下 6 个板块的内容，并且在输出每个大板块之前，必须使用“【分页符】”这四个字单起一行作为分隔标识（不要用Markdown，不要加粗）：

【分页符】
【一、身份与角色画像总览】：
- 身份研判：明确该对象在 Log 中的实际身份是 PL（玩家）、KP/DM（主持人），抑或双重身份，并简述研判依据。
- 角色档案：列出其在日志中操控的所有 PC 角色名或主持身份称呼，简析其角色设定或带团基调。
- 活跃度与生态概况：结合 RP 字数、场外发言占比、骰点频次等数据，说明其在团队中的生态位（如：核心领袖、战术智囊、前锋莽夫、气氛担当、边缘辅助、冷酷裁判、保姆型主持等）。
- 注意，需要明确给出真实客观的尖锐敏感的评价，无需担心评价会伤害到其自尊心，特点可以给出负面评价。

【分页符】
【二、跑团 / 带团风格深度剖析】：
（根据其身份选择侧重角度，深入剖析其行为模式、思维习惯与风格流派）：
▶ 若为 PL 跑团风格：
  1. 角色扮演与演绎流派：是沉浸式剧情派（内心戏足、台词有文采、严守角色动机）、战术理智派（求生欲强、战术最优解、利用规则机制）、乐子搞笑派（活跃气氛、出人意料）、还是社交嘴炮派（交涉拉扯、探索人性）？
  2. 决策模式与行动偏好：面对未知与危机时，倾向于深思熟虑谨慎侦查，还是果断莽撞敢打敢冲？对线索与细节的敏感度如何？
  3. 团队协作与交互情商：是善于倾听队友、为他人搭戏搭桥，还是倾向独立独行，抑或偶尔有抢戏/脱节倾向？
  4. 风格是否在团内有强烈的变化？如果有多个log，其在时间轴（从早到晚）中的风格发挥稳定性如何，是否有明显的进步或退步？
▶ 若为 KP 带团风格：
  1. 叙事文风与氛围营造：描写是否具画面感与电影感？对恐怖/史诗/悬疑氛围的渲染力如何？文字张力与修辞水平。
  2. 控场节奏与剧情推进：是紧凑利落的主线推进，还是宽松沙盒允许自由探索？会否让场面拖沓或冷场？
  3. NPC 塑造与互动生动度：NPC 是否性格鲜明有智商，还是工具人化？与玩家互动时的代入感如何？
  4. 裁决尺度与应对突变：倾向于硬核原教旨守规，还是戏剧导向/宽容放水？面对玩家脱轨或突发奇想时，能否化解并转化为精彩剧情？
  5. 风格是否在团内有强烈的变化？如果有多个log，其在时间轴（从早到晚）中的风格发挥稳定性如何，是否有明显的进步或退步？
（该部分请务必严肃客观尖锐的评价，无需担心评价会伤害到其自尊心）

【分页符】
【三、高光时刻与经典名场面】：
- 结合日志中该用户的具体发言、关键决策、精彩 RP 描写或绝妙带团裁决，摘引或提炼 2~3 个最具代表性的高光瞬间，并进行深入点评（为什么这一段体现了其独到的跑团/带团魅力）。

【分页符】
【四、潜在盲点与进阶建议】：
- 秉持客观建设性态度，指出该用户在跑团或带团中存在的潜在问题或可提升之处（例如：场外 OOC 比例是否过高容易出戏、对特定规则/技能的依赖与误解、是否容易优柔寡断或过分冒险、作为主持时是否信息给予过少或施压过大等），并给出具体进阶建议。

【分页符】
【五、能力综合雷达图】：
请根据该用户的综合表现，输出一个标准的 ```logai-chart``` 代码块用于生成六维能力雷达图（所有分数范围为 0-100，客观打分，体现其偏科或均衡特质）：
- 若主要是 PL 玩家，推荐维度：角色演绎 | 逻辑决策 | 团队协作 | 规则敏锐 | 临场应变 | 心理抗压
- 若主要是 KP 主持，推荐维度：氛围渲染 | 控场节奏 | 判定严谨 | NPC塑造 | 突发应变 | 玩家体验
- 该部分务必严肃客观打分，不要给出鼓励分，做得好得高分，做得一般分数也要足够低，基准分为50分。
示例格式（必须严格遵循，axes 维度和 series 数值一一对应）：
```logai-chart
type: radar
title: 综合风格能力雷达图
axes: 角色演绎 | 逻辑决策 | 团队协作 | 规则敏锐 | 临场应变 | 心理抗压
series:
综合评价: 85 | 68 | 92 | 50 | 88 | 75
```

【分页符】
【六、风格定性风味标签与综合评价】：
- 专属风味称号/标签：提炼 2-3 个极具个性的头衔（例如：“沉浸式戏疯子”、“硬核战术规划师”、“团队的定海神针”、“电影感氛围造梦师”、“冷酷无情的命运主宰”等）。
- 综合表现评级：给出综合评级（S / A+ / A / B+ / B / C / D / F）。
- 评审官终审评语：用一段生动传神、直击灵魂的寄语，总结这位跑团人在 TRPG 世界中的独特魅力。
- （该部分请务必严肃客观进行处理，头衔不必要给出完全正面的方向，无需担心其自尊心受损，评级基准为C）
"""


LOG_EVALUATION_REQUIREMENTS = """
【日志综合评估输出格式（必须遵守）】：
具体统计数字由后端从原始 Log 确定性计算，禁止你自行估算、改写或补全 RP 字数、场外占比、骰点次数、骰点平均值、中位数、成功率或骰点幸运值。
请把六维评分放在回复最前面，并严格按下面顺序输出。第一行必须是“【分页符】”。

【零、玩家识别】：
先根据发言内容、角色扮演连续性和跑团上下文判断哪些是实际参与本局的玩家角色（PC）。排除骰娘、KP/GM/DM、NPC、系统账号、围观者和只有零星场外发言的人。必须输出以下表格；“是否玩家”只能填写“是”或“否”，六维评分只针对标记为“是”的角色：
| 角色名 | 是否玩家 | 识别依据 |
| --- | --- | --- |
| 角色名 | 是/否 | 简短说明 |

【一、六维评分】：
每项均为 0-100 分，必须逐位给出：创新、武力、交涉、幸运、扮演、认真。评分对象是玩家角色，不是骰娘或 KP。
分数必须是基于日志证据的精确整数，允许使用任意个位数（例如 63、78、91）；不要为了整齐而四舍五入，也不要批量使用整 5、整 10 或相同分数。只有在证据确实相同时才可以给出相同分数。
创新：看行动创造力及其对剧情发展的正面作用；有害或拖累剧情的“创新”扣分。
武力：看战斗力、战术和主动行动；不只依赖骰子，行动失败但思路合理也应加分；只靠好运且 RP 简短应当要扣分。
交涉：看与 NPC 的交流、说服、倾听和推进关系的能力；骰运差但交流强仍可高分；只用骰子代替交流理应扣分。
幸运：纯粹看投掷运气，成功率优先，骰点极端程度作为辅助。
扮演：看人设前后一致；合理成长或挫折不扣分，突兀反转酌情扣分。
认真：看专注和行动节奏；严肃阶段过多场外、长时间不行动或场外聊嗨要大幅扣分，休闲阶段适度闲聊不必重罚。
| 玩家 | 创新 | 武力 | 交涉 | 幸运 | 扮演 | 认真 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 角色名 | 0-100 | 0-100 | 0-100 | 0-100 | 0-100 | 0-100 |
每位玩家在表格后补充一句不超过 35 字的评分依据。

【分页符】
【二、总体评价】：
按原有格式继续输出总体评分、剧情概要、高光时刻、主要槽点和 KP/DM 寄语。不要重复六维表。
"""

# 字体路径
FONT_PATH = "C:/Windows/Fonts/msyh.ttc" 

# 最大处理条目数
MAX_LOG_ENTRIES = 20000
# 发送给 AI 的最大字符数
MAX_AI_CHARS = 1000000

# --- 百度网盘 OpenAPI 配置 ---
BAIDU_APP_KEY = "vgREgwxQjbGUEdYNPqM6K8rSx7QJAAzs"
BAIDU_SECRET_KEY = "qUhg3BBRhPs5S8FwYEV8kXAY3Bc1ZsVQ"
# 首次使用前，请在浏览器访问以下链接（将其中的【你的AppKey】替换成实际的AppKey）：
# http://openapi.baidu.com/oauth/2.0/authorize?response_type=code&client_id=【你的AppKey】&redirect_uri=oob&scope=basic,netdisk
# 同意授权后，网页会显示一段 Authorization Code，将其复制到下方：
BAIDU_AUTH_CODE = "c481b9f9dff5214f825eebaa3b8d2645"

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

def _iter_card_files():
    """遍历卡库中的 JSON，并拒绝任何指向卡库外部的链接路径。"""
    if not os.path.isdir(SHEET_CARDS_DIR):
        return
    base = os.path.realpath(SHEET_CARDS_DIR)
    for root, _, filenames in os.walk(base):
        for filename in filenames:
            if not filename.lower().endswith(".json"):
                continue
            path = os.path.join(root, filename)
            try:
                if os.path.commonpath([base, os.path.realpath(path)]) != base:
                    continue
            except ValueError:
                continue
            yield path

def _card_owner(card: dict) -> str:
    """兼容新旧版本的持有者字段。"""
    return str(card.get("owner") or card.get("user_key") or "").strip()

def _normalize_group_key(group_key: str) -> str:
    return re.sub(r'^(?:QQ-Group:|Group:)', '', str(group_key or '').strip(), flags=re.IGNORECASE)

def _current_user_cards_dir(user_key: str) -> str:
    return os.path.realpath(os.path.join(SHEET_CARDS_DIR, _sanitize_filename(user_key)))

def _is_current_user_path(path: str, user_key: str) -> bool:
    return os.path.realpath(os.path.dirname(path)) == _current_user_cards_dir(user_key)

def _read_card_file(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            card = json.load(f)
        return card if isinstance(card, dict) else None
    except Exception as e:
        print(f"[角色卡库] 跳过损坏卡 {os.path.basename(path)}: {e}")
        return None

def _storage_source(path: str, owner: str = "") -> str:
    if owner and _is_current_user_path(path, owner):
        return "current"
    return "legacy"

def load_user_cards(user_key: str = "") -> list:
    """读取角色卡；指定用户时同时找回散落在旧群目录/public 中的本人旧卡。"""
    cards = []
    wanted_owner = str(user_key or "").strip()
    for path in _iter_card_files() or ():
        card = _read_card_file(path)
        if not card:
            continue
        owner = _card_owner(card)
        if wanted_owner:
            in_current_dir = _is_current_user_path(path, wanted_owner)
            # 当前用户目录中的无主旧卡属于该用户；显式标为他人的文件绝不越权展示。
            if owner and owner != wanted_owner:
                continue
            if not in_current_dir and owner != wanted_owner:
                continue
            source = "current" if in_current_dir else "legacy"
        else:
            source = _storage_source(path, owner)
        item = dict(card)
        if owner:
            item.setdefault("owner", owner)
        item["_storage_source"] = source
        cards.append(item)
    return cards

def delete_user_cards(user_key: str, name: str = "", clear_all: bool = False,
                      group_key: str = "", allow_ownerless_legacy: bool = False) -> dict:
    """删除请求者拥有的卡片；同名旧卡会一并清除，绝不删除明确属于他人的卡。"""
    wanted_owner = str(user_key or "").strip()
    wanted_name = str(name or "").strip()
    deleted_names = []
    source_counts = {"current": 0, "legacy": 0}
    skipped_ownerless = 0
    safe_filename = f"{_sanitize_filename(wanted_name)}.json" if wanted_name else ""

    for path in list(_iter_card_files() or ()):
        card = _read_card_file(path)
        owner = _card_owner(card) if card else ""
        in_current_dir = _is_current_user_path(path, wanted_owner)
        card_group = _normalize_group_key((card or {}).get("group_key"))
        path_group = _normalize_group_key(os.path.basename(os.path.dirname(path)))
        wanted_group = _normalize_group_key(group_key)
        claim_ownerless = (
            not clear_all and allow_ownerless_legacy and not owner and not in_current_dir
            and bool(wanted_group) and wanted_group in (card_group, path_group)
        )
        owned = owner == wanted_owner or (in_current_dir and not owner) or claim_ownerless
        card_name = str((card or {}).get("name") or "").strip()
        filename_match = in_current_dir and os.path.basename(path) == safe_filename
        name_match = clear_all or card_name == wanted_name or (not card and filename_match)
        if not name_match:
            continue
        if not owned:
            if not owner:
                skipped_ownerless += 1
            continue
        try:
            os.remove(path)
            source = "current" if in_current_dir else "legacy"
            source_counts[source] += 1
            deleted_names.append(card_name or os.path.splitext(os.path.basename(path))[0])
        except OSError as e:
            print(f"[角色卡库] 删除失败 {path}: {e}")

    return {
        "deleted_count": len(deleted_names),
        "deleted_names": sorted(set(deleted_names)),
        "sources": source_counts,
        "skipped_ownerless": skipped_ownerless,
    }

# 兼容旧调用名
def load_group_cards(user_key: str = "") -> list:
    return load_user_cards(user_key)

# ================= 原始日志持久化存储与玩家跑团/带团风格成长档案系统 =================
RAW_LOGS_DIR = "raw_logs_store"
STYLE_ARCHIVES_DIR = "player_style_archives"

def save_raw_log(source: str, key: str, data):
    """持久化保存原始日志副本至 raw_logs_store/，方便随时调用与免重复网络请求"""
    try:
        os.makedirs(RAW_LOGS_DIR, exist_ok=True)
        safe_k = _sanitize_filename(str(key or 'unknown'))
        safe_s = _sanitize_filename(str(source or 'unknown').lower())
        if isinstance(data, (dict, list)):
            file_path = os.path.join(RAW_LOGS_DIR, f"{safe_s}_{safe_k}.json")
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        else:
            file_path = os.path.join(RAW_LOGS_DIR, f"{safe_s}_{safe_k}.txt")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(str(data or ''))
    except Exception as e:
        print(f"[原始Log存储] 保存异常 {source}:{key} -> {e}")

def load_raw_log(source: str, key: str):
    """尝试从 raw_logs_store/ 读取已持久化的原始日志"""
    try:
        if not os.path.isdir(RAW_LOGS_DIR):
            return None
        safe_k = _sanitize_filename(str(key or 'unknown'))
        safe_s = _sanitize_filename(str(source or 'unknown').lower())
        json_path = os.path.join(RAW_LOGS_DIR, f"{safe_s}_{safe_k}.json")
        if os.path.isfile(json_path):
            with open(json_path, "r", encoding="utf-8") as f:
                return json.load(f)
        txt_path = os.path.join(RAW_LOGS_DIR, f"{safe_s}_{safe_k}.txt")
        if os.path.isfile(txt_path):
            with open(txt_path, "r", encoding="utf-8") as f:
                return f.read()
    except Exception as e:
        print(f"[原始Log存储] 读取异常 {source}:{key} -> {e}")
    return None

def _find_linked_qq_by_alias(alias_name: str, base_dir: str = STYLE_ARCHIVES_DIR) -> str:
    """在档案库中反向查找该角色名/别名绑定的 QQ 号（如有）"""
    if not alias_name or not os.path.isdir(base_dir):
        return ""
    clean_a = re.sub(r'^(?:QQ[:：]|OpenQQ:)?', '', str(alias_name).strip(), flags=re.IGNORECASE).strip()
    clean_a = re.sub(r'^[,，、\s/|;；]+|[,，、\s/|;；]+$', '', clean_a).strip()
    if not clean_a or re.match(r'^\d{5,12}$', clean_a):
        return ""
    
    clean_a_low = clean_a.lower()
    for entry in os.listdir(base_dir):
        if not re.match(r'^\d{5,12}$', entry):
            continue
        edir = os.path.join(base_dir, entry)
        if not os.path.isdir(edir):
            continue
        for sub in ("pl", "kp"):
            tf = os.path.join(edir, sub, "growth_timeline.json")
            if os.path.exists(tf):
                try:
                    with open(tf, "r", encoding="utf-8") as f:
                        d = json.load(f)
                    aliases = [str(x).lower() for x in d.get("aliases", []) if x]
                    target = str(d.get("target", "")).lower()
                    if clean_a_low in aliases or clean_a_low == target:
                        return entry
                    for h in d.get("history", []):
                        h_t = str(h.get("target", "")).lower()
                        if clean_a_low == h_t or clean_a_low in [str(x).lower() for x in h.get("aliases", [])]:
                            return entry
                except Exception:
                    pass
    return ""

def _merge_alias_dir_into_qq(base_dir: str, qq_num: str, alias_name: str):
    """
    当确认某个角色别名归属于某 QQ 时，若以往存在以该角色名单独命名的独立档案目录，
    自动将其中的历史战役记录及成长轨迹合并归入该 QQ 档案目录下，并清理旧角色目录。
    """
    if not alias_name or not qq_num or alias_name == qq_num:
        return
    clean_alias = _sanitize_filename(str(alias_name).strip())
    clean_alias = re.sub(r'^[,，、\s/|;；]+|[,，、\s/|;；]+$', '', clean_alias).strip()
    if not clean_alias or clean_alias == qq_num or clean_alias.startswith("用户_"):
        return
    
    alias_dir = os.path.realpath(os.path.join(base_dir, clean_alias))
    qq_dir = os.path.realpath(os.path.join(base_dir, qq_num))
    if not os.path.isdir(alias_dir) or alias_dir == qq_dir:
        return

    try:
        # 先确保旧角色目录迁移了 legacy 格式
        _migrate_legacy_archive_if_needed(alias_dir)

        for sub in ("pl", "kp"):
            src_sub = os.path.join(alias_dir, sub)
            if not os.path.isdir(src_sub):
                continue
            dst_sub = os.path.join(qq_dir, sub)
            dst_records = os.path.join(dst_sub, "records")
            os.makedirs(dst_records, exist_ok=True)

            # 迁移 records 下的文件
            src_records = os.path.join(src_sub, "records")
            if os.path.isdir(src_records):
                for fname in os.listdir(src_records):
                    src_f = os.path.join(src_records, fname)
                    dst_f = os.path.join(dst_records, fname)
                    if not os.path.exists(dst_f):
                        try:
                            shutil.move(src_f, dst_f)
                        except Exception as e_mv:
                            print(f"[合并档案] 移动记录文件失败 {fname}: {e_mv}")

            # 合并 growth_timeline.json
            src_tl_path = os.path.join(src_sub, "growth_timeline.json")
            if os.path.exists(src_tl_path):
                try:
                    with open(src_tl_path, "r", encoding="utf-8") as sf:
                        src_data = json.load(sf)
                except Exception:
                    src_data = {}

                dst_tl_path = os.path.join(dst_sub, "growth_timeline.json")
                dst_data = {
                    "target": alias_name,
                    "qq": qq_num,
                    "role": sub.upper(),
                    "first_seen": src_data.get("first_seen", ""),
                    "last_updated": src_data.get("last_updated", ""),
                    "total_records": 0,
                    "aliases": [alias_name],
                    "history": []
                }
                if os.path.exists(dst_tl_path):
                    try:
                        with open(dst_tl_path, "r", encoding="utf-8") as df:
                            dst_data = json.load(df)
                    except Exception:
                        pass

                # 维护 aliases
                aliases_list = dst_data.setdefault("aliases", [])
                if alias_name not in aliases_list:
                    aliases_list.append(alias_name)
                for a in src_data.get("aliases", []):
                    if a and a not in aliases_list:
                        aliases_list.append(a)

                # 合并 history
                existing_rec_ids = {h.get("record_id") for h in dst_data.get("history", [])}
                for h in src_data.get("history", []):
                    if h.get("record_id") not in existing_rec_ids:
                        dst_data.setdefault("history", []).append(h)
                        existing_rec_ids.add(h.get("record_id"))

                # 重新按时间排序 history
                dst_data["history"].sort(key=lambda x: (x.get("start_t") or 0, x.get("created_at") or ""))
                dst_data["total_records"] = len(dst_data["history"])
                
                # 重新计算 first_seen
                first_dates = [h.get("created_at", "")[:10] for h in dst_data["history"] if h.get("created_at")]
                if first_dates:
                    dst_data["first_seen"] = min(first_dates)

                with open(dst_tl_path, "w", encoding="utf-8") as df:
                    json.dump(dst_data, df, ensure_ascii=False, indent=2)

        # 尝试清理已被完全合并空的旧目录
        try:
            shutil.rmtree(alias_dir)
            print(f"[合并档案] 已将角色专属历史档案【{clean_alias}】成功合并入 QQ 档案【{qq_num}】并清理旧目录。")
        except Exception as e_rm:
            print(f"[合并档案] 清理合并后的旧目录失败: {e_rm}")

    except Exception as e:
        print(f"[合并档案] 合并目录异常 {clean_alias} -> {qq_num}: {e}")

def _extract_target_dir_name(target_user: str, user_key: str = "") -> tuple:
    """提取目录名及规范化的 QQ / 名字。优先提取目标中的纯数字 QQ，无数字则使用目标名字，最后回退到发送者 user_key。"""
    raw = str(target_user or "").strip()
    m = re.search(r'\b(\d{5,12})\b', raw)
    clean_user_key = re.sub(r'^(?:QQ[:：]|OpenQQ:)?', '', str(user_key or '').strip(), flags=re.IGNORECASE)
    u_m = re.search(r'^\d{5,12}$', clean_user_key)
    
    if m:
        qq_num = m.group(1)
        name_candidate = re.sub(r'\b\d{5,12}\b', '', raw).strip()
        name_candidate = re.sub(r'^(?:QQ[:：])?', '', name_candidate, flags=re.IGNORECASE).strip()
        name_candidate = re.sub(r'^[,，、\s/|;；]+|[,，、\s/|;；]+$', '', name_candidate).strip()
        final_name = name_candidate or f"用户_{qq_num}"
        return qq_num, final_name, qq_num
    
    if raw:
        clean_raw = re.sub(r'^(?:QQ[:：])?', '', raw, flags=re.IGNORECASE).strip()
        clean_raw = re.sub(r'^[,，、\s/|;；]+|[,，、\s/|;；]+$', '', clean_raw).strip()
        # 尝试反向查找绑定的 QQ 号
        linked_qq = _find_linked_qq_by_alias(clean_raw)
        if linked_qq:
            return linked_qq, clean_raw, linked_qq

        safe_name = _sanitize_filename(clean_raw)
        return safe_name, clean_raw, (clean_user_key if u_m else "")
    
    if u_m:
        return clean_user_key, f"用户_{clean_user_key}", clean_user_key
        
    return "unknown", "未知目标", ""

# 标准雷达图维度（与系统提示词 PLAYER_STYLE_SYSTEM_PROMPT 严格对齐）
PL_RADAR_AXES = ['角色演绎', '逻辑决策', '团队协作', '规则敏锐', '临场应变', '心理抗压']
KP_RADAR_AXES = ['氛围渲染', '控场节奏', '判定严谨', 'NPC塑造', '突发应变', '玩家体验']

DIMENSION_SYNONYMS = {
    # PL 维度及同义词/简写
    '角色演绎': ['角色演绎', '演绎', '扮演', '角色扮演', 'RP', '沉浸演绎', '演绎深度', '戏份投入'],
    '逻辑决策': ['逻辑决策', '逻辑', '决策', '思维', '推理', '战术思考', '理性决策', '局势判断'],
    '团队协作': ['团队协作', '团队', '协作', '配合', '交涉', '社交', '沟通协作', '搭戏配合'],
    '规则敏锐': ['规则敏锐', '规则', '机制', '敏锐', '战术', '规则理解', '技能运用', '战术敏锐'],
    '临场应变': ['临场应变', '应变', '机敏', '突变应对', '处置', '临场反应', '危机处置'],
    '心理抗压': ['心理抗压', '抗压', '心理', '意志', '求生欲', '稳健', '心态稳定', '抗压韧性'],
    # KP 维度及同义词/简写
    '氛围渲染': ['氛围渲染', '氛围', '渲染', '文风', '描述', '情境烘托', '叙事文风'],
    '控场节奏': ['控场节奏', '控场', '节奏', '主线推进', '时间把控', '推进效率', '现场把控'],
    '判定严谨': ['判定严谨', '判定', '严谨', '裁决', '规则裁决', '公正度', '规则尺度'],
    'NPC塑造': ['NPC塑造', 'NPC', '塑造', '配角演绎', '角色塑造', 'NPC表现', '生动度'],
    '突发应变': ['突发应变', '突发', '脱轨应对', '临场应变', '变故处置', '圆场能力'],
    '玩家体验': ['玩家体验', '体验', '互动', '反馈', '代入感', '沉浸感', '玩家参与度'],
}

def normalize_dimension_name(raw_name: str) -> str:
    """标准化能力维度名称为系统标准 6 维之一"""
    clean = re.sub(r'[*_`#:\s【】\[\]()（）]', '', str(raw_name or '')).strip()
    if not clean:
        return ""
    for std, syns in DIMENSION_SYNONYMS.items():
        if clean == std or clean in syns:
            return std
    for std, syns in DIMENSION_SYNONYMS.items():
        for syn in syns:
            if syn in clean or clean in syn:
                return std
    return clean

def extract_radar_data_from_text(text: str) -> dict:
    """全面兼容代码块、Markdown 表格、列表项与键值对等多格式六维能力雷达数据抽取"""
    radar = {}
    content = text or ''

    # 1. 优先提取 ```logai-chart 或 ```chart 代码块
    m_code = re.search(r'```(?:logai-chart|chart)?\s*\n(.*?)```', content, re.DOTALL)
    if m_code:
        block = m_code.group(1)
        axes_m = re.search(r'axes\s*[:：]\s*(.+)', block)
        if axes_m:
            raw_axes_str = axes_m.group(1).strip()
            raw_axes = [a.strip() for a in re.split(r'[,，、|/]\s*', raw_axes_str) if a.strip()]
            norm_axes = [normalize_dimension_name(a) for a in raw_axes]
            
            # 查找数值行
            for line in block.splitlines():
                if any(c.isdigit() for c in line) and ('|' in line or ':' in line or ',' in line or '，' in line):
                    nums = re.findall(r'\b\d+\b', line)
                    if len(nums) == len(norm_axes):
                        for a, n in zip(norm_axes, nums):
                            val = min(100, max(0, int(n)))
                            if a: radar[a] = val
                        break
        # 若 axes 未能完全匹配，尝试在代码块内提取 键: 值
        if len(radar) < 4:
            for line in block.splitlines():
                m_kv = re.search(r'([^\d:：\n|]{2,8})\s*[:：]\s*(\d{1,3})', line)
                if m_kv:
                    k_std = normalize_dimension_name(m_kv.group(1))
                    if k_std:
                        radar[k_std] = min(100, max(0, int(m_kv.group(2))))

    # 2. 若代码块未提取到足够维度，提取 Markdown 表格 (| 角色演绎 | 85 |)
    if len(radar) < 4:
        table_rows = re.findall(r'\|\s*([^\d:：|\n]{2,8})\s*\|\s*(\d{1,3})\s*\|', content)
        for k_raw, v_raw in table_rows:
            k_std = normalize_dimension_name(k_raw)
            if k_std:
                radar[k_std] = min(100, max(0, int(v_raw)))

    # 3. 若仍不足，提取列表项或自然段中的 键值对 (- 角色演绎: 85 或 角色演绎：85分)
    if len(radar) < 4:
        kv_pairs = re.findall(r'(?:[-*•]\s*)?([^\d:：\n|()（）]{2,8})\s*[:：]\s*(\d{1,3})(?:\s*分)?\b', content)
        for k_raw, v_raw in kv_pairs:
            k_std = normalize_dimension_name(k_raw)
            if k_std:
                radar[k_std] = min(100, max(0, int(v_raw)))

    # 4. 横向单行匹配 (角色演绎 85 | 逻辑决策 70 ...)
    if len(radar) < 4:
        inline_pairs = re.findall(r'([^\s:：,，|]{2,8})\s*[:：=]?\s*(\d{1,3})\s*(?:分)?', content)
        for k_raw, v_raw in inline_pairs:
            k_std = normalize_dimension_name(k_raw)
            if k_std and k_std not in radar:
                radar[k_std] = min(100, max(0, int(v_raw)))

    return radar

def extract_grade_and_titles(text: str) -> tuple:
    grade = ''
    titles = []
    text_content = text or ''
    m_grade = re.search(r'(?:综合(?:表现)?评级|综合评定|总评级?)\s*[:：]\s*[*_`【\[]*([SABCDFabcdf][+-]?)[*_`】\]]*', text_content)
    if m_grade:
        grade = m_grade.group(1).upper()
    
    m_titles = re.search(r'(?:专属风味称号(?:/标签)?|风味标签|称号|头衔)\s*[:：]\s*(.+)', text_content)
    if m_titles:
        raw_t = m_titles.group(1).split('\n')[0]
        found = re.findall(r'[“"【「『]([^”"】」』]+)[”"】」』]', raw_t)
        if found:
            titles = [t.strip() for t in found if t.strip()]
        else:
            parts = re.split(r'[,，、|/]\s*', raw_t)
            titles = [re.sub(r'[*_`]', '', p).strip() for p in parts if p.strip() and len(p.strip()) < 25]
    return grade, titles

def extract_identity_from_text(text: str) -> str:
    m = re.search(r'【身份[:：]\s*(PL|KP|DM|双重|全能|主持|玩家)[^】]*】', text or '', re.IGNORECASE)
    if m:
        id_str = m.group(1).upper()
        if id_str in ('KP', 'DM', '主持'):
            return 'KP'
        elif id_str in ('双重', '全能'):
            return '双重'
        return 'PL'
    return 'PL'

def _clean_report_title_main(title: str) -> str:
    """提取报告标题主体，过滤括号内的角色或昵称"""
    if not title:
        return ""
    t = re.sub(r'\(.*?\)', '', str(title))
    t = re.sub(r'（.*?）', '', t)
    t = re.sub(r'\[.*?\]', '', t)
    t = re.sub(r'【.*?】', '', t)
    return t.strip()

def resolve_identity_from_title(title: str) -> str:
    """
    根据报告标题严格判定身份（以报告标题为绝对权威）：
    返回 'KP'、'PL'、'双重' 或 ''
    """
    t_main = _clean_report_title_main(title)
    if not t_main:
        return ''
    
    # 检查双重/全能
    if any(k in t_main for k in ("全能", "双重", "兼有")) or ("主持" in t_main and "玩家" in t_main):
        return '双重'

    has_kp = any(k in t_main for k in ("主持", "带团", "守秘人", "DM")) or bool(re.search(r'\bKP\b', t_main, re.IGNORECASE))
    has_pl = any(k in t_main for k in ("玩家", "跑团风格", "调查员", "PC")) or bool(re.search(r'\bPL\b', t_main, re.IGNORECASE))

    if has_kp and not has_pl:
        return 'KP'
    if has_pl and not has_kp:
        return 'PL'
    if has_kp and has_pl:
        if any(k in t_main for k in ("主持", "带团", "守秘人")):
            return 'KP'
        return 'PL'
    return ''

def _is_kp_report_title(title: str) -> bool:
    """兼容旧函数名：精准判断报告标题是否为 KP 主持风格报告"""
    return resolve_identity_from_title(title) == 'KP'

def resolve_record_identity(title="", original_tag="", full_report="", specified_identity="", stats=None, raw_identity="", role="") -> str:
    """
    报告真实身份权威裁决层级：
    1. report_title 权威最高！
       - 若标题包含 "玩家" / "跑团风格" -> 100% 裁决为 PL（任何 stats.is_kp 均不可推翻！）
       - 若标题包含 "主持" / "带团" / "守秘人" -> 100% 裁决为 KP
       - 若标题包含 "全能" / "双重" -> 双重
    2. original_identity_tag 权威第二
    3. full_report 正文中的研判文本（如“身份确凿为纯粹的【PL（玩家）】”或“纯粹的KP”）
    4. 显式指定的 specified_identity
    5. 记录原有 identity / role (仅在标题完全无法识别时兜底)
    6. stats.is_kp (仅作为最后的启发式兜底)
    """
    # 1. 标题最高优先
    tid = resolve_identity_from_title(title)
    if tid in ('KP', 'PL', '双重'):
        return tid

    # 2. original_identity_tag
    orig = str(original_tag or '').strip().upper()
    if orig in ('KP', 'DM', '主持'):
        return 'KP'
    elif orig in ('PL', '玩家'):
        return 'PL'
    elif orig in ('双重', '全能'):
        return '双重'

    # 3. 正文研判结论
    if full_report:
        rep_text = str(full_report)
        if re.search(r'纯粹的\s*【?\s*(?:PL|玩家)', rep_text, re.IGNORECASE):
            return 'PL'
        if re.search(r'纯粹的\s*【?\s*(?:KP|守秘人|主持)', rep_text, re.IGNORECASE):
            return 'KP'
        m_tag = re.search(r'【身份[：:]\s*(KP|PL|双重|全能|主持|玩家|DM|守秘人)\s*】', rep_text, re.IGNORECASE)
        if m_tag:
            tag_val = m_tag.group(1).upper()
            if tag_val in ('KP', 'DM', '主持', '守秘人'):
                return 'KP'
            elif tag_val in ('PL', '玩家'):
                return 'PL'

    # 4. 显式指令指定
    spec = str(specified_identity or '').strip().upper()
    if spec in ('KP', 'DM', '主持', '主持人', '守秘人', '带团'):
        return 'KP'
    elif spec in ('PL', '玩家', 'PLAYER'):
        return 'PL'
    elif spec in ('双重', '全能', '兼有'):
        return '双重'

    # 5. 记录原有 identity / role
    for rc in (str(raw_identity or ''), str(role or '')):
        rc_up = rc.strip().upper()
        if rc_up in ('KP', 'DM', '主持', '主持人', '守秘人', '带团'):
            return 'KP'
        elif rc_up in ('PL', '玩家', 'PLAYER'):
            return 'PL'
        elif rc_up in ('双重', '全能', '兼有'):
            return '双重'

    # 6. stats 启发式统计最后兜底
    if isinstance(stats, dict) and stats.get('is_kp'):
        return 'KP'

    return 'PL'


def _do_migrate_legacy_root_if_needed(target_dir: str):
    """迁移旧版本根目录下未分区的 growth_timeline.json 及 records/ 文件至 pl/ 和 kp/"""
    legacy_timeline_path = os.path.join(target_dir, "growth_timeline.json")
    legacy_records_dir = os.path.join(target_dir, "records")
    
    has_legacy_timeline = os.path.isfile(legacy_timeline_path)
    has_legacy_records = os.path.isdir(legacy_records_dir) and any(os.scandir(legacy_records_dir))
    
    if not has_legacy_timeline and not has_legacy_records:
        return

    legacy_data = {}
    if has_legacy_timeline:
        try:
            with open(legacy_timeline_path, "r", encoding="utf-8-sig") as f:
                legacy_data = json.load(f)
        except Exception:
            legacy_data = {}

    history = legacy_data.get("history", [])
    handled_rec_ids = set()

    for h in history:
        rec_id = h.get("record_id")
        rec_data = None
        if has_legacy_records and rec_id:
            rec_json_f = os.path.join(legacy_records_dir, f"{rec_id}.json")
            if os.path.isfile(rec_json_f):
                try:
                    with open(rec_json_f, "r", encoding="utf-8-sig") as rf:
                        rec_data = json.load(rf)
                except Exception:
                    pass

        cand_id = ""
        for tok in (h.get("identity"), h.get("role"), rec_data and rec_data.get("identity"), rec_data and rec_data.get("role"), legacy_data.get("role")):
            if tok and str(tok).strip().upper() in ('KP', 'DM', '主持', '主持人', '守秘人', '带团'):
                cand_id = "KP"
                break
        real_id = resolve_record_identity(
            title=h.get("report_title") or (rec_data and rec_data.get("report_title")),
            original_tag=(rec_data and rec_data.get("original_identity_tag")),
            full_report=(rec_data and rec_data.get("full_report")),
            stats=h.get("stats") or (rec_data and rec_data.get("stats")),
            raw_identity=cand_id or h.get("identity") or (rec_data and rec_data.get("identity")),
            role=cand_id or h.get("role") or (rec_data and rec_data.get("role")) or legacy_data.get("role")
        )
        ident = "kp" if real_id == 'KP' else "pl"
        role_dir = os.path.join(target_dir, ident)
        role_records_dir = os.path.join(role_dir, "records")
        os.makedirs(role_records_dir, exist_ok=True)

        if has_legacy_records and rec_id:
            for fname in os.listdir(legacy_records_dir):
                if fname.startswith(rec_id):
                    src_f = os.path.join(legacy_records_dir, fname)
                    dst_f = os.path.join(role_records_dir, fname)
                    try:
                        if os.path.exists(dst_f):
                            os.remove(dst_f)
                        shutil.move(src_f, dst_f)
                    except Exception:
                        pass
            handled_rec_ids.add(rec_id)

        role_timeline_path = os.path.join(role_dir, "growth_timeline.json")
        role_data = {
            "target": legacy_data.get("target", ""),
            "qq": legacy_data.get("qq", ""),
            "role": ident.upper(),
            "first_seen": legacy_data.get("first_seen", ""),
            "last_updated": legacy_data.get("last_updated", ""),
            "total_records": 0,
            "history": []
        }
        if os.path.exists(role_timeline_path):
            try:
                with open(role_timeline_path, "r", encoding="utf-8-sig") as rf:
                    role_data = json.load(rf)
            except Exception:
                pass
        
        h_copy = dict(h)
        h_copy["identity"] = ident.upper()
        existing_ids = {item.get("record_id") for item in role_data.get("history", [])}
        if rec_id not in existing_ids:
            role_data.setdefault("history", []).append(h_copy)
            role_data["history"] = ensure_history_sorted_and_timed(role_data["history"])
            role_data["total_records"] = len(role_data["history"])
            try:
                with open(role_timeline_path, "w", encoding="utf-8") as rf:
                    json.dump(role_data, rf, ensure_ascii=False, indent=2)
            except Exception:
                pass

    # 处理 legacy_records 目录中未被 history 索引的孤立记录
    if has_legacy_records:
        for fname in os.listdir(legacy_records_dir):
            if fname.endswith(".json"):
                orphan_id = fname[:-5]
                if orphan_id in handled_rec_ids:
                    continue
                src_f = os.path.join(legacy_records_dir, fname)
                try:
                    with open(src_f, "r", encoding="utf-8-sig") as rf:
                        o_data = json.load(rf)
                except Exception:
                    o_data = {}
                cand_id = ""
                for tok in (o_data.get("identity"), o_data.get("role"), legacy_data.get("role")):
                    if tok and str(tok).strip().upper() in ('KP', 'DM', '主持', '主持人', '守秘人', '带团'):
                        cand_id = "KP"
                        break
                real_id = resolve_record_identity(
                    title=o_data.get("report_title"),
                    original_tag=o_data.get("original_identity_tag"),
                    full_report=o_data.get("full_report"),
                    stats=o_data.get("stats"),
                    raw_identity=cand_id or o_data.get("identity"),
                    role=cand_id or o_data.get("role") or legacy_data.get("role")
                )
                ident = "kp" if real_id == 'KP' else "pl"
                role_dir = os.path.join(target_dir, ident, "records")
                os.makedirs(role_dir, exist_ok=True)
                for f_rel in os.listdir(legacy_records_dir):
                    if f_rel.startswith(orphan_id):
                        try:
                            dst_f = os.path.join(role_dir, f_rel)
                            if os.path.exists(dst_f):
                                os.remove(dst_f)
                            shutil.move(os.path.join(legacy_records_dir, f_rel), dst_f)
                        except Exception:
                            pass

    # 备份旧 timeline
    if has_legacy_timeline:
        try:
            backup_path = os.path.join(target_dir, "growth_timeline.json.migrated_bak")
            if not os.path.exists(backup_path):
                shutil.move(legacy_timeline_path, backup_path)
            else:
                os.remove(legacy_timeline_path)
        except Exception:
            pass

def heal_player_archive_partitions(target_dir: str):
    """
    双向自愈纠偏引擎（以报告标题 report_title 为绝对权威判定）：
    1. 检查 pl/ 目录中的 timeline 与 records：若标题/内容确凿为 KP 主持记录，自动搬移至 kp/
    2. 检查 kp/ 目录中的 timeline 与 records：若标题/内容确凿为 PL 玩家记录（如因旧统计错误误分），自动纠偏迁回 pl/
    3. 同步校正搬移后的 records/*.json 内部属性 (identity, role)
    4. 自动扫描并迁移 pl/records 与 kp/records 中的孤儿文件
    5. 原子化重组并写入 pl/growth_timeline.json 与 kp/growth_timeline.json
    """
    if not target_dir or not os.path.isdir(target_dir):
        return

    pl_dir = os.path.join(target_dir, "pl")
    kp_dir = os.path.join(target_dir, "kp")
    pl_records_dir = os.path.join(pl_dir, "records")
    kp_records_dir = os.path.join(kp_dir, "records")
    pl_timeline_path = os.path.join(pl_dir, "growth_timeline.json")
    kp_timeline_path = os.path.join(kp_dir, "growth_timeline.json")

    pl_data = None
    if os.path.isfile(pl_timeline_path):
        try:
            with open(pl_timeline_path, "r", encoding="utf-8-sig") as f:
                pl_data = json.load(f)
        except Exception:
            pl_data = None

    kp_data = None
    if os.path.isfile(kp_timeline_path):
        try:
            with open(kp_timeline_path, "r", encoding="utf-8-sig") as f:
                kp_data = json.load(f)
        except Exception:
            kp_data = None

    had_pl = bool(pl_data) or (os.path.isdir(pl_records_dir) and any(os.scandir(pl_records_dir)))
    had_kp = bool(kp_data) or (os.path.isdir(kp_records_dir) and any(os.scandir(kp_records_dir)))
    if not had_pl and not had_kp:
        return

    target_name = (pl_data and pl_data.get("target")) or (kp_data and kp_data.get("target")) or os.path.basename(target_dir)
    target_qq = (pl_data and pl_data.get("qq")) or (kp_data and kp_data.get("qq")) or (os.path.basename(target_dir) if re.match(r'^\d{5,12}$', os.path.basename(target_dir)) else "")

    if not pl_data:
        pl_data = {"target": target_name, "qq": target_qq, "role": "PL", "total_records": 0, "history": []}
    if not kp_data:
        kp_data = {"target": target_name, "qq": target_qq, "role": "KP", "total_records": 0, "history": []}

    pl_history = pl_data.get("history", [])
    kp_history = kp_data.get("history", [])

    new_pl_history = []
    new_kp_history = []
    handled_pl_ids = set()
    handled_kp_ids = set()

    # 1. 扫描 pl 侧：将实际为 KP 的挑出，移至 kp
    for h in pl_history:
        rec_id = h.get("record_id")
        rec_json_path = os.path.join(pl_records_dir, f"{rec_id}.json") if rec_id and os.path.isdir(pl_records_dir) else None
        rec_data = None
        if rec_json_path and os.path.isfile(rec_json_path):
            try:
                with open(rec_json_path, "r", encoding="utf-8-sig") as rf:
                    rec_data = json.load(rf)
            except Exception:
                pass

        cand_id = ""
        for tok in (h.get("identity"), h.get("role"), rec_data and rec_data.get("identity"), rec_data and rec_data.get("role"), pl_data and pl_data.get("role")):
            if tok and str(tok).strip().upper() in ('KP', 'DM', '主持', '主持人', '守秘人', '带团'):
                cand_id = "KP"
                break

        real_id = resolve_record_identity(
            title=h.get("report_title") or (rec_data and rec_data.get("report_title")),
            original_tag=(rec_data and rec_data.get("original_identity_tag")),
            full_report=(rec_data and rec_data.get("full_report")),
            stats=(rec_data and rec_data.get("stats")),
            raw_identity=cand_id or h.get("identity") or (rec_data and rec_data.get("identity")),
            role=cand_id or h.get("role") or (rec_data and rec_data.get("role"))
        )

        if real_id == 'KP':
            os.makedirs(kp_records_dir, exist_ok=True)
            if rec_id and os.path.isdir(pl_records_dir):
                for fname in os.listdir(pl_records_dir):
                    if fname.startswith(rec_id):
                        src_f = os.path.join(pl_records_dir, fname)
                        dst_f = os.path.join(kp_records_dir, fname)
                        try:
                            if os.path.exists(dst_f): os.remove(dst_f)
                            shutil.move(src_f, dst_f)
                        except Exception: pass
            kp_rec_json = os.path.join(kp_records_dir, f"{rec_id}.json")
            if os.path.isfile(kp_rec_json):
                try:
                    with open(kp_rec_json, "r", encoding="utf-8-sig") as rf:
                        up_rec = json.load(rf)
                    up_rec["identity"] = "KP"
                    up_rec["role"] = "KP"
                    with open(kp_rec_json, "w", encoding="utf-8") as wf:
                        json.dump(up_rec, wf, ensure_ascii=False, indent=2)
                except Exception: pass
            h_copy = dict(h)
            h_copy["identity"] = "KP"
            new_kp_history.append(h_copy)
            if rec_id: handled_kp_ids.add(rec_id)
        else:
            h_copy = dict(h)
            h_copy["identity"] = "PL"
            new_pl_history.append(h_copy)
            if rec_id: handled_pl_ids.add(rec_id)

    # 2. 扫描 kp 侧：将实际为 PL 的挑出，移至 pl (彻底修复 PL 报告被误分到 KP 的问题)
    for h in kp_history:
        rec_id = h.get("record_id")
        rec_json_path = os.path.join(kp_records_dir, f"{rec_id}.json") if rec_id and os.path.isdir(kp_records_dir) else None
        rec_data = None
        if rec_json_path and os.path.isfile(rec_json_path):
            try:
                with open(rec_json_path, "r", encoding="utf-8-sig") as rf:
                    rec_data = json.load(rf)
            except Exception:
                pass

        cand_id = ""
        for tok in (h.get("identity"), h.get("role"), rec_data and rec_data.get("identity"), rec_data and rec_data.get("role"), kp_data and kp_data.get("role")):
            if tok and str(tok).strip().upper() in ('PL', '玩家', 'PLAYER'):
                cand_id = "PL"
                break

        real_id = resolve_record_identity(
            title=h.get("report_title") or (rec_data and rec_data.get("report_title")),
            original_tag=(rec_data and rec_data.get("original_identity_tag")),
            full_report=(rec_data and rec_data.get("full_report")),
            stats=(rec_data and rec_data.get("stats")),
            raw_identity=cand_id or h.get("identity") or (rec_data and rec_data.get("identity")),
            role=cand_id or h.get("role") or (rec_data and rec_data.get("role"))
        )

        if real_id == 'PL':
            os.makedirs(pl_records_dir, exist_ok=True)
            if rec_id and os.path.isdir(kp_records_dir):
                for fname in os.listdir(kp_records_dir):
                    if fname.startswith(rec_id):
                        src_f = os.path.join(kp_records_dir, fname)
                        dst_f = os.path.join(pl_records_dir, fname)
                        try:
                            if os.path.exists(dst_f): os.remove(dst_f)
                            shutil.move(src_f, dst_f)
                        except Exception: pass
            pl_rec_json = os.path.join(pl_records_dir, f"{rec_id}.json")
            if os.path.isfile(pl_rec_json):
                try:
                    with open(pl_rec_json, "r", encoding="utf-8-sig") as rf:
                        up_rec = json.load(rf)
                    up_rec["identity"] = "PL"
                    up_rec["role"] = "PL"
                    with open(pl_rec_json, "w", encoding="utf-8") as wf:
                        json.dump(up_rec, wf, ensure_ascii=False, indent=2)
                except Exception: pass
            h_copy = dict(h)
            h_copy["identity"] = "PL"
            new_pl_history.append(h_copy)
            if rec_id: handled_pl_ids.add(rec_id)
        else:
            h_copy = dict(h)
            h_copy["identity"] = "KP"
            new_kp_history.append(h_copy)
            if rec_id: handled_kp_ids.add(rec_id)

    # 3. 扫描 pl/records 中的孤儿文件
    if os.path.isdir(pl_records_dir):
        for fname in os.listdir(pl_records_dir):
            if fname.endswith(".json"):
                orphan_rec_id = fname[:-5]
                if orphan_rec_id in handled_pl_ids:
                    continue
                rec_json_path = os.path.join(pl_records_dir, fname)
                try:
                    with open(rec_json_path, "r", encoding="utf-8-sig") as rf:
                        rec_data = json.load(rf)
                except Exception:
                    rec_data = {}
                cand_id = ""
                for tok in (rec_data.get("identity"), rec_data.get("role"), pl_data and pl_data.get("role")):
                    if tok and str(tok).strip().upper() in ('KP', 'DM', '主持', '主持人', '守秘人', '带团'):
                        cand_id = "KP"
                        break
                real_id = resolve_record_identity(
                    title=rec_data.get("report_title"),
                    original_tag=rec_data.get("original_identity_tag"),
                    full_report=rec_data.get("full_report"),
                    stats=rec_data.get("stats"),
                    raw_identity=cand_id or rec_data.get("identity"),
                    role=cand_id or rec_data.get("role")
                )
                if real_id == 'KP':
                    os.makedirs(kp_records_dir, exist_ok=True)
                    for f_rel in os.listdir(pl_records_dir):
                        if f_rel.startswith(orphan_rec_id):
                            try:
                                dst_f = os.path.join(kp_records_dir, f_rel)
                                if os.path.exists(dst_f): os.remove(dst_f)
                                shutil.move(os.path.join(pl_records_dir, f_rel), dst_f)
                            except Exception: pass
                    new_kp_history.append({
                        "record_id": orphan_rec_id,
                        "report_title": rec_data.get("report_title") or "主持带团战役",
                        "identity": "KP",
                        "created_at": rec_data.get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S")
                    })
                else:
                    new_pl_history.append({
                        "record_id": orphan_rec_id,
                        "report_title": rec_data.get("report_title") or "跑团战役",
                        "identity": "PL",
                        "created_at": rec_data.get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S")
                    })

    # 4. 扫描 kp/records 中的孤儿文件
    if os.path.isdir(kp_records_dir):
        for fname in os.listdir(kp_records_dir):
            if fname.endswith(".json"):
                orphan_rec_id = fname[:-5]
                if orphan_rec_id in handled_kp_ids:
                    continue
                rec_json_path = os.path.join(kp_records_dir, fname)
                try:
                    with open(rec_json_path, "r", encoding="utf-8-sig") as rf:
                        rec_data = json.load(rf)
                except Exception:
                    rec_data = {}
                cand_id = ""
                for tok in (rec_data.get("identity"), rec_data.get("role"), kp_data and kp_data.get("role")):
                    if tok and str(tok).strip().upper() in ('PL', '玩家', 'PLAYER'):
                        cand_id = "PL"
                        break
                real_id = resolve_record_identity(
                    title=rec_data.get("report_title"),
                    original_tag=rec_data.get("original_identity_tag"),
                    full_report=rec_data.get("full_report"),
                    stats=rec_data.get("stats"),
                    raw_identity=cand_id or rec_data.get("identity"),
                    role=cand_id or rec_data.get("role")
                )
                if real_id == 'PL':
                    os.makedirs(pl_records_dir, exist_ok=True)
                    for f_rel in os.listdir(kp_records_dir):
                        if f_rel.startswith(orphan_rec_id):
                            try:
                                dst_f = os.path.join(pl_records_dir, f_rel)
                                if os.path.exists(dst_f): os.remove(dst_f)
                                shutil.move(os.path.join(kp_records_dir, f_rel), dst_f)
                            except Exception: pass
                    new_pl_history.append({
                        "record_id": orphan_rec_id,
                        "report_title": rec_data.get("report_title") or "跑团战役",
                        "identity": "PL",
                        "created_at": rec_data.get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S")
                    })
                else:
                    new_kp_history.append({
                        "record_id": orphan_rec_id,
                        "report_title": rec_data.get("report_title") or "主持带团战役",
                        "identity": "KP",
                        "created_at": rec_data.get("created_at") or time.strftime("%Y-%m-%d %H:%M:%S")
                    })

    def _dedup_history(hist):
        seen = set()
        res = []
        for item in hist:
            rid = item.get("record_id")
            if rid and rid in seen:
                continue
            seen.add(rid)
            res.append(item)
        return res

    final_pl = _dedup_history(new_pl_history)
    final_kp = _dedup_history(new_kp_history)

    os.makedirs(pl_dir, exist_ok=True)
    os.makedirs(kp_dir, exist_ok=True)

    if final_pl or had_pl:
        os.makedirs(pl_dir, exist_ok=True)
        pl_data["history"] = ensure_history_sorted_and_timed(final_pl)
        pl_data["total_records"] = len(pl_data["history"])
        pl_data["role"] = "PL"
        try:
            with open(pl_timeline_path, "w", encoding="utf-8") as f:
                json.dump(pl_data, f, ensure_ascii=False, indent=2)
        except Exception: pass

    if final_kp or had_kp:
        os.makedirs(kp_dir, exist_ok=True)
        kp_data["history"] = ensure_history_sorted_and_timed(final_kp)
        kp_data["total_records"] = len(kp_data["history"])
        kp_data["role"] = "KP"
        try:
            with open(kp_timeline_path, "w", encoding="utf-8") as f:
                json.dump(kp_data, f, ensure_ascii=False, indent=2)
        except Exception: pass

# 兼容别名
_heal_misclassified_pl_records_if_needed = heal_player_archive_partitions

def _migrate_legacy_archive_if_needed(target_dir: str):
    """
    统一迁移与双向自愈引擎：
    1. 迁移旧版本未隔离的根目录档案 (target_dir/growth_timeline.json 及 target_dir/records) -> pl/ 和 kp/
    2. 无条件执行双向自愈纠偏 (PL 误入 KP 迁回 PL，KP 误入 PL 迁至 KP，以报告标题为绝对第一优先)
    """
    if not target_dir or not os.path.isdir(target_dir):
        return

    try:
        _do_migrate_legacy_root_if_needed(target_dir)
    except Exception as e:
        print(f"[风格档案] 根目录旧档案迁移异常 {target_dir}: {e}")

    try:
        heal_player_archive_partitions(target_dir)
    except Exception as e:
        print(f"[风格档案] 双向自愈迁移异常 {target_dir}: {e}")

def heal_all_player_archives():
    """扫描全局 STYLE_ARCHIVES_DIR 目录下所有用户档案，执行旧版迁移与双向自动自愈纠偏"""
    try:
        if not os.path.isdir(STYLE_ARCHIVES_DIR):
            return
        base_dir = os.path.realpath(STYLE_ARCHIVES_DIR)
        for entry in os.listdir(base_dir):
            tdir = os.path.join(base_dir, entry)
            if os.path.isdir(tdir):
                _migrate_legacy_archive_if_needed(tdir)
    except Exception as e:
        print(f"[风格档案] 全局自愈扫描异常: {e}")

def save_player_style_archive(target_user, result_text, images_list, sources, job_id, user_key="", stats=None, timeline_str="", report_title="", start_t=0, end_t=0, specified_identity=None):
    """将玩家/主持的风格分析结果归档至专属成长文件夹中，PL 与 KP 彻底物理隔离"""
    dir_name, target_name, qq_num = _extract_target_dir_name(target_user, user_key)
    base_dir = os.path.realpath(STYLE_ARCHIVES_DIR)
    target_dir = os.path.realpath(os.path.join(base_dir, dir_name))
    try:
        if os.path.commonpath([base_dir, target_dir]) != base_dir:
            print(f"[风格档案] 警告：非法路径 {dir_name}，拒绝保存")
            return None
    except ValueError:
        return None

    # 检查并自动平滑迁移旧档案及双向自愈纠偏
    _migrate_legacy_archive_if_needed(target_dir)

    # 若目标含有纯数字 QQ 且有具体的角色别名，自动检测并合并历史独立角色目录
    if qq_num and target_name and target_name != qq_num and not target_name.startswith("用户_"):
        _merge_alias_dir_into_qq(base_dir, qq_num, target_name)

    # 身份判定：以报告标题为绝对权威判定层级（标题第一优先，不受 stats.is_kp 错误干扰）
    identity = resolve_record_identity(
        title=report_title,
        specified_identity=specified_identity,
        full_report=result_text,
        stats=stats
    )

    # 彻底隔离：KP 存入 kp/，PL 存入 pl/
    if identity == 'KP' or (identity == '双重' and stats and stats.get('is_kp')):
        role_subdir = "kp"
        role_label = "KP"
    else:
        role_subdir = "pl"
        role_label = "PL"

    role_dir = os.path.join(target_dir, role_subdir)
    records_dir = os.path.join(role_dir, "records")
    os.makedirs(records_dir, exist_ok=True)

    now = datetime.datetime.now()
    timestamp_str = now.strftime("%Y%m%d_%H%M%S")
    record_id = f"{timestamp_str}_{job_id[:8]}"

    radar = extract_radar_data_from_text(result_text)
    grade, titles = extract_grade_and_titles(result_text)

    # 若未提供秒级时间戳，自动从 timeline_str 解析补齐
    if not start_t or not end_t:
        s_calc, e_calc = _detect_log_time_range(None, timeline_str)
        if s_calc: start_t = start_t or s_calc
        if e_calc: end_t = end_t or e_calc

    saved_images = []
    if images_list:
        for p_idx, img_bytes in enumerate(images_list, 1):
            img_name = f"{record_id}_p{p_idx}.png"
            img_path = os.path.join(records_dir, img_name)
            try:
                with open(img_path, "wb") as f_img:
                    f_img.write(img_bytes)
                saved_images.append(img_name)
            except Exception as e:
                print(f"[风格档案] 保存图片失败 {img_name}: {e}")

    record_data = {
        "job_id": job_id,
        "record_id": record_id,
        "created_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "target": target_name,
        "qq": qq_num,
        "identity": role_label,
        "original_identity_tag": identity,
        "grade": grade,
        "titles": titles,
        "radar": radar,
        "log_timeline": timeline_str,
        "start_t": start_t,
        "end_t": end_t,
        "sources": sources,
        "stats": stats or {},
        "report_title": report_title,
        "full_report": result_text,
        "images": saved_images
    }
    with open(os.path.join(records_dir, f"{record_id}.json"), "w", encoding="utf-8") as f:
        json.dump(record_data, f, ensure_ascii=False, indent=2)

    timeline_json_path = os.path.join(role_dir, "growth_timeline.json")
    timeline_data = {
        "target": target_name,
        "qq": qq_num,
        "role": role_label,
        "first_seen": now.strftime("%Y-%m-%d"),
        "last_updated": now.strftime("%Y-%m-%d %H:%M:%S"),
        "total_records": 0,
        "history": []
    }
    if os.path.exists(timeline_json_path):
        try:
            with open(timeline_json_path, "r", encoding="utf-8-sig") as f:
                timeline_data = json.load(f)
        except Exception:
            pass

    if target_name and target_name != qq_num:
        timeline_data["target"] = target_name
    if qq_num:
        timeline_data["qq"] = qq_num
    timeline_data["role"] = role_label
    timeline_data["last_updated"] = now.strftime("%Y-%m-%d %H:%M:%S")

    aliases_list = timeline_data.setdefault("aliases", [])
    if target_name and target_name != qq_num and not target_name.startswith("用户_") and target_name not in aliases_list:
        aliases_list.append(target_name)
    if stats and isinstance(stats, dict):
        for a in stats.get("aliases", []):
            if a and a not in aliases_list and not re.match(r'^\d+$', str(a)) and not str(a).startswith("用户("):
                aliases_list.append(a)

    m_dt = re.search(r'\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b', timeline_str or '')
    if m_dt:
        t_cand = m_dt.group(1).replace('/', '-')
        if not timeline_data.get("first_seen") or t_cand < timeline_data["first_seen"]:
            timeline_data["first_seen"] = t_cand

    history_entry = {
        "record_id": record_id,
        "created_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "target": target_name,
        "aliases": list(aliases_list),
        "log_timeline": timeline_str,
        "start_t": start_t,
        "end_t": end_t,
        "sources": sources,
        "identity": role_label,
        "grade": grade,
        "titles": titles,
        "radar": radar,
        "stats": {
            "char_count": (stats.get("char_count") or stats.get("total_chars") or stats.get("rp_chars") or 0) if isinstance(stats, dict) else 0,
            "msg_count": (stats.get("msg_count") or stats.get("message_count") or 0) if isinstance(stats, dict) else 0,
            "total_chars": (stats.get("total_chars") or stats.get("char_count") or 0) if isinstance(stats, dict) else 0,
            "message_count": (stats.get("message_count") or stats.get("msg_count") or 0) if isinstance(stats, dict) else 0,
        } if stats else {}
    }
    timeline_data.setdefault("history", []).append(history_entry)
    timeline_data["history"].sort(key=lambda h: (
        0 if h.get("start_t") else 1,
        h.get("start_t") or 0,
        h.get("end_t") or 0,
        _parse_time_str(h.get("created_at", "")) or 0
    ))
    timeline_data["total_records"] = len(timeline_data["history"])

    with open(timeline_json_path, "w", encoding="utf-8") as f:
        json.dump(timeline_data, f, ensure_ascii=False, indent=2)

    return role_dir

def format_adjacent_history_for_prompt(prev_records: list, next_records: list, target_name: str) -> str:
    """将检索出的前 2 次战役与后 1 次战役格式化为供 LLM 参考的成长基准提示"""
    if not prev_records and not next_records:
        return ""

    lines = [
        "\n\n" + "=" * 50,
        f"【该玩家（{target_name}）的历史战役成长档案参考（供对比风格演化）】",
        "系统已自动检索到该对象在档案库中紧邻当前分析时间轴的历次战役表现记录：",
    ]

    if prev_records:
        lines.append("▶ 【当前战役之前的历次战役基准（早于本次）】：")
        total_p = len(prev_records)
        for idx, rec in enumerate(prev_records, 1):
            lbl = f"前第 {total_p - idx + 1} 次战役" if total_p > 1 else "前次战役"
            tl = rec.get("log_timeline") or "未知时间"
            ident = rec.get("identity") or "PL"
            grade = rec.get("grade") or "未评级"
            titles = "、".join(rec.get("titles", [])) or "无特殊称号"
            radar_dict = rec.get("radar", {})
            radar_str = " | ".join([f"{k}:{v}" for k, v in radar_dict.items()]) if radar_dict else "无雷达数据"
            lines.append(f"  ● [{lbl}] 时间跨度: {tl} | 身份: {ident} | 综合评级: {grade} | 风味称号: {titles}")
            if radar_str != "无雷达数据":
                lines.append(f"    能力雷达: {radar_str}")

    if next_records:
        lines.append("▶ 【当前战役之后的后序战役延展（晚于本次）】：")
        for rec in next_records:
            tl = rec.get("log_timeline") or "未知时间"
            ident = rec.get("identity") or "PL"
            grade = rec.get("grade") or "未评级"
            titles = "、".join(rec.get("titles", [])) or "无特殊称号"
            radar_dict = rec.get("radar", {})
            radar_str = " | ".join([f"{k}:{v}" for k, v in radar_dict.items()]) if radar_dict else "无雷达数据"
            lines.append(f"  ● [后序战役] 时间跨度: {tl} | 身份: {ident} | 综合评级: {grade} | 风味称号: {titles}")
            if radar_str != "无雷达数据":
                lines.append(f"    能力雷达: {radar_str}")

    lines.extend([
        "\n【时序对比与成长点评指引】：",
        "请大模型在分析本次跑团表现时，紧密结合上述历史战役的发挥基准进行纵向对比：",
        "1. 对比该玩家在本次战役中的六维能力表现（是否有突破、状态起伏或思维维度的转变）；",
        "2. 在最终报告的【成长演变/蜕变点评】或【综合评价】章节中，点出其相较于过往经历的成长亮点或一贯风格传承，展现玩家长期的成长轨迹。",
        "=" * 50 + "\n"
    ])
    return "\n".join(lines)

def get_adjacent_historical_records(target_user: str, curr_start_t: int, curr_end_t: int, identity: str = "PL", user_key: str = "") -> tuple:
    """
    根据当前 Log 的时间区间，检索该玩家在档案库中：
    - 发生于本次之前最近的 2 次历史战役 (前次战役)
    - 发生于本次之后最近的 1 次历史战役 (后序战役)
    返回 (prev_records, next_records, formatted_prompt_text)
    """
    dir_name, target_name, qq_num = _extract_target_dir_name(target_user, user_key)
    base_dir = os.path.realpath(STYLE_ARCHIVES_DIR)
    target_dir = os.path.realpath(os.path.join(base_dir, dir_name))
    
    if not os.path.isdir(target_dir):
        matched_dir = None
        clean_q = qq_num or _sanitize_filename(target_name)
        if os.path.isdir(base_dir):
            for entry in os.listdir(base_dir):
                edir = os.path.join(base_dir, entry)
                if not os.path.isdir(edir):
                    continue
                for sub in ("pl", "kp"):
                    tf = os.path.join(edir, sub, "growth_timeline.json")
                    if os.path.exists(tf):
                        try:
                            with open(tf, "r", encoding="utf-8") as f:
                                d = json.load(f)
                            if d.get("qq") == clean_q or d.get("target") == clean_q or entry == clean_q:
                                matched_dir = edir
                                break
                        except Exception:
                            pass
                if matched_dir:
                    break
        if matched_dir:
            target_dir = matched_dir
        else:
            return [], [], ""

    _migrate_legacy_archive_if_needed(target_dir)

    role_subdir = "kp" if str(identity).upper() in ("KP", "DM", "主持") else "pl"
    timeline_path = os.path.join(target_dir, role_subdir, "growth_timeline.json")
    if not os.path.exists(timeline_path):
        return [], [], ""

    try:
        with open(timeline_path, "r", encoding="utf-8") as f:
            timeline_data = json.load(f)
    except Exception:
        return [], [], ""

    history = timeline_data.get("history", [])
    if not history:
        return [], [], ""

    for h in history:
        if not h.get("start_t") or not h.get("end_t"):
            tl = h.get("log_timeline", "")
            s_t, e_t = _detect_log_time_range(None, tl)
            if not s_t:
                s_t = _parse_time_str(h.get("created_at", "")) or 0
            if not e_t:
                e_t = s_t
            h["start_t"] = s_t
            h["end_t"] = e_t

    prev_candidates = []
    next_candidates = []

    if curr_start_t > 0:
        for h in history:
            h_start = h.get("start_t") or 0
            h_end = h.get("end_t") or 0
            # 排除与本次完全重合的记录
            if curr_end_t > 0 and h_start == curr_start_t and h_end == curr_end_t:
                continue
            
            # 前置战役：早于当前开始时间
            if h_end <= curr_start_t or (h_start < curr_start_t and h_end <= curr_end_t):
                prev_candidates.append(h)
            # 后续战役：晚于当前结束时间
            elif curr_end_t > 0 and (h_start >= curr_end_t or h_start > curr_start_t):
                next_candidates.append(h)

        # 距离当前最近的前 2 次战役
        prev_candidates.sort(key=lambda x: (x.get("end_t") or 0, x.get("start_t") or 0), reverse=True)
        prev_records = prev_candidates[:2]
        prev_records.sort(key=lambda x: (x.get("start_t") or 0, x.get("end_t") or 0))

        # 紧随其后的后 1 次战役
        next_candidates.sort(key=lambda x: (x.get("start_t") or 0, x.get("end_t") or 0))
        next_records = next_candidates[:1]
    else:
        prev_records = history[-2:] if len(history) >= 2 else history[:]
        next_records = []

    prompt_text = format_adjacent_history_for_prompt(prev_records, next_records, target_name)
    return prev_records, next_records, prompt_text

def _format_track_content_lines(data: dict) -> str:
    if not isinstance(data, dict):
        return ""
    hist = [h for h in data.get("history", []) if isinstance(h, dict)]
    grades = [str(h.get("grade")) for h in hist if h.get("grade")]
    
    # 提取按时序排列的称号
    chronological_titles = []
    for h in hist:
        tl = h.get("log_timeline") or (h.get("created_at") or "").split(" ")[0] or "未知时期"
        raw_titles = h.get("titles") or []
        ts = raw_titles if isinstance(raw_titles, list) else [raw_titles]
        for t in ts:
            t_s = str(t).strip()
            if t_s:
                chronological_titles.append((tl, t_s))

    aliases = [str(a) for a in data.get("aliases", []) if a and not str(a).startswith("用户_")]
    for h in hist:
        h_t = h.get("target")
        if h_t and not str(h_t).startswith("用户_") and str(h_t) not in aliases:
            aliases.append(str(h_t))

    last = hist[-1] if hist else {}
    last_radar = (last.get("radar") or {}) if isinstance(last, dict) else {}
    radar_str_parts = []
    if isinstance(last_radar, dict):
        for k, v in last_radar.items():
            if v is not None:
                radar_str_parts.append(f"{k}: {v}")

    lines = [
        f"📅 时间跨度: {data.get('first_seen', '未知')} ~ {str(data.get('last_updated', '未知')).split(' ')[0]}",
    ]
    if aliases:
        lines.append(f"🎭 关联角色: {'、'.join(aliases[:5])}")
    if grades:
        lines.append(f"🏆 历次评级走势: {' -> '.join(grades[-6:])}")
    if chronological_titles:
        t_seq = [f"[{tl}] {t}" for tl, t in chronological_titles]
        lines.append(f"📜 荣誉称号编年: {' -> '.join(t_seq)}")
    if radar_str_parts:
        lines.append("📈 最新能力雷达: " + " | ".join(radar_str_parts))
    if isinstance(last, dict) and last.get("log_timeline"):
        lines.append(f"🕰️ 最近战役跨度: {last.get('log_timeline')}")
    return "\n".join(lines)

def _load_library_archive_fonts():
    font_main = "C:/Windows/Fonts/msyh.ttc"
    font_bold = "C:/Windows/Fonts/msyhbd.ttc"
    font_serif = "C:/Windows/Fonts/simkai.ttf"
    if not os.path.exists(font_serif):
        font_serif = font_bold
    try:
        return {
            'title': ImageFont.truetype(font_serif, 30),
            'subtitle': ImageFont.truetype(font_main, 15),
            'stamp': ImageFont.truetype(font_serif, 17),
            'stamp_bold': ImageFont.truetype(font_bold, 18),
            'h2': ImageFont.truetype(font_bold, 21),
            'h3': ImageFont.truetype(font_bold, 18),
            'body': ImageFont.truetype(font_main, 17),
            'body_bold': ImageFont.truetype(font_bold, 17),
            'small': ImageFont.truetype(font_main, 15),
            'small_bold': ImageFont.truetype(font_bold, 15),
        }
    except Exception:
        df = ImageFont.load_default()
        return {k: df for k in ['title', 'subtitle', 'stamp', 'stamp_bold', 'h2', 'h3', 'body', 'body_bold', 'small', 'small_bold']}

def format_archive_sources_display(sources, max_len: int = 30, show_count: bool = True) -> tuple:
    """
    智能格式化战役来源展示名，支持单篇、多Log复合、多文件联合与混合模式。
    返回: (格式化后的战役显示字符串, 来源篇数)
    """
    if not sources:
        return "跑团战役", 1

    items = []
    if isinstance(sources, str):
        s_raw = sources.strip()
        if " + " in s_raw:
            items = [x.strip() for x in s_raw.split(" + ") if x.strip()]
        elif "+" in s_raw and not s_raw.startswith("+"):
            items = [x.strip() for x in s_raw.split("+") if x.strip()]
        else:
            items = [s_raw]
    elif isinstance(sources, list):
        for s in sources:
            if isinstance(s, dict):
                name = str(s.get("key") or s.get("filename") or s.get("title") or "").strip()
            else:
                name = str(s or "").strip()
            if name:
                if " + " in name:
                    items.extend([x.strip() for x in name.split(" + ") if x.strip()])
                else:
                    items.append(name)
    elif isinstance(sources, dict):
        name = str(sources.get("key") or sources.get("filename") or sources.get("title") or "跑团战役").strip()
        items = [name]
    else:
        items = [str(sources).strip()]

    # 清洗条目名：如果是本地文件路径提取 basename；如果包含 .txt 则精简掉后缀以留出更多有效排版宽度
    cleaned_items = []
    seen = set()
    for it in items:
        if not it:
            continue
        bname = os.path.basename(it)
        if bname.lower().endswith(".txt"):
            bname = bname[:-4]
        if bname and bname not in seen:
            seen.add(bname)
            cleaned_items.append(bname)

    if not cleaned_items:
        return "跑团战役", 1

    total_count = len(cleaned_items)
    if total_count == 1:
        return cleaned_items[0], 1

    # 多源复合拼接
    full_str = " + ".join(cleaned_items)
    count_suffix = f" (共{total_count}篇)" if show_count else ""
    if len(full_str) + len(count_suffix) <= max_len:
        return f"{full_str}{count_suffix}", total_count

    # 若超出限宽，取前两篇 + 等N篇
    prefix2 = " + ".join(cleaned_items[:2])
    cand2 = f"{prefix2} 等{total_count}篇"
    if len(cand2) <= max_len:
        return cand2, total_count

    # 兜底：第一篇 + 等N篇
    cand1 = f"{cleaned_items[0]} 等{total_count}篇"
    return cand1, total_count

def ensure_history_sorted_and_timed(history: list) -> list:
    """
    确保历史战役记录具备规范的 start_t / end_t，并严格按真实战役时间升序（从早到晚）单调排列。
    使长图编目编号 (#1, #2, #3...) 与时间修改指令序号永远 100% 对应一致。
    """
    if not history or not isinstance(history, list):
        return []

    for h in history:
        if not isinstance(h, dict):
            continue
        st = h.get("start_t") or 0
        et = h.get("end_t") or 0
        # 若缺失 start_t，从 log_timeline 尝试解析
        if not st:
            tl = str(h.get("log_timeline") or "").strip()
            if tl:
                s_calc, e_calc = _detect_log_time_range(None, tl)
                if s_calc:
                    st = s_calc
                    et = e_calc or (s_calc + 86399)
                else:
                    dt = _parse_time_str(tl)
                    if dt:
                        st = dt
                        et = dt + 86399
        # 若仍缺失，从 created_at 尝试解析
        if not st:
            cr = str(h.get("created_at") or "").strip()
            dt_cr = _parse_time_str(cr)
            if dt_cr:
                st = dt_cr
                et = dt_cr + 86399
        h["start_t"] = st
        h["end_t"] = et

    history.sort(key=lambda h: (
        0 if (h.get("start_t") or 0) > 0 else 1,
        h.get("start_t") or 0,
        h.get("end_t") or 0,
        _parse_time_str(h.get("created_at", "")) or 0
    ))
    return history

def render_library_archive_image(data: dict, role_title: str = "PL 玩家") -> bytes:
    """渲染图书馆古典卷宗风格的玩家跑团成长档案卡长图，包含双雷达图对比与时序荣誉称号长廊"""
    fonts = _load_library_archive_fonts()
    width = 1060
    
    # 古典档案馆羊皮纸质感色彩
    bg_color = (248, 244, 234)
    border_primary = (115, 84, 52)
    border_secondary = (195, 170, 135)
    header_bg = (58, 36, 26)
    header_gold = (245, 232, 205)
    header_sub = (205, 190, 165)
    text_primary = (38, 28, 22)
    text_secondary = (105, 90, 80)
    stamp_red = (180, 42, 42)
    card_bg = (254, 252, 248)
    card_border = (220, 205, 185)
    
    hist = ensure_history_sorted_and_timed(data.get("history", []) if isinstance(data, dict) else [])
    if isinstance(data, dict):
        data["history"] = hist
    
    # 动态高度计算
    titles_rows = len([h for h in hist if h.get("titles")])
    dynamic_h = 125 + 195 + 380 + max(100, titles_rows * 38 + 60) + (len(hist) * 42 + 70) + 160
    height = max(1160, dynamic_h)
    
    img = Image.new("RGBA", (width, height), bg_color)
    draw = ImageDraw.Draw(img)
    
    # 1. 外层复古双饰框
    draw.rectangle([12, 12, width - 13, height - 13], outline=border_primary, width=2)
    draw.rectangle([18, 18, width - 19, height - 19], outline=border_secondary, width=1)
    
    # 四角古典折角花纹
    for x, y, dx, dy in [(24, 24, 1, 1), (width - 25, 24, -1, 1), (24, height - 25, 1, -1), (width - 25, height - 25, -1, -1)]:
        draw.line([(x, y), (x + 20 * dx, y)], fill=border_primary, width=2)
        draw.line([(x, y), (x, y + 20 * dy)], fill=border_primary, width=2)
        draw.line([(x + 6 * dx, y + 6 * dy), (x + 16 * dx, y + 6 * dy)], fill=border_secondary, width=1)
        draw.line([(x + 6 * dx, y + 6 * dy), (x + 6 * dx, y + 16 * dy)], fill=border_secondary, width=1)

    # 2. 标头横幅
    draw.rectangle([25, 25, width - 26, 125], fill=header_bg)
    draw.rectangle([28, 28, width - 29, 122], outline=header_gold, width=1)
    
    draw.text((45, 42), f"◆ 跑团档案年鉴 · 风格与战绩编年卷宗 ({role_title})", font=fonts['title'], fill=header_gold)
    draw.text((48, 88), "ARCHIVAL DOSSIER & CHRONICLED TRPG CAREER", font=fonts['subtitle'], fill=header_sub)
    
    # 右上角古典印章
    stamp_w, stamp_h = 170, 76
    stamp_x, stamp_y = width - 200, 36
    draw.rounded_rectangle([stamp_x, stamp_y, stamp_x + stamp_w, stamp_y + stamp_h], radius=6, outline=stamp_red, width=2)
    draw.rounded_rectangle([stamp_x + 3, stamp_y + 3, stamp_x + stamp_w - 3, stamp_y + stamp_h - 3], radius=4, outline=stamp_red, width=1)
    
    txt_stamp1 = "【 馆藏绝密 】"
    w1 = fonts['stamp_bold'].getlength(txt_stamp1)
    draw.text((stamp_x + (stamp_w - w1) / 2, stamp_y + 14), txt_stamp1, font=fonts['stamp_bold'], fill=stamp_red)
    
    txt_stamp2 = "CLASSIFIED ARCHIVE"
    w2 = fonts['small_bold'].getlength(txt_stamp2)
    draw.text((stamp_x + (stamp_w - w2) / 2, stamp_y + 44), txt_stamp2, font=fonts['small_bold'], fill=stamp_red)

    curr_y = 145

    # 3. 档案基本信息卡片
    draw.rounded_rectangle([35, curr_y, width - 36, curr_y + 175], radius=8, fill=card_bg, outline=card_border, width=1)
    
    target_name = data.get("target") or "未知调查员"
    qq_str = data.get("qq") or "未知"
    total_rec = data.get("total_records") or len(hist)
    first_seen = data.get("first_seen") or "未知"
    last_updated = (data.get("last_updated") or "未知").split(" ")[0]
    
    grades = [h.get("grade") for h in hist if h.get("grade")]
    peak_grade = grades[0] if grades else "未评级"
    grade_weight = {'EX': 100, 'S+': 95, 'S': 90, 'A+': 85, 'A': 80, 'B+': 75, 'B': 70, 'C': 60}
    if grades:
        peak_grade = max(grades, key=lambda g: grade_weight.get(g, 50))
    latest_grade = grades[-1] if grades else "未评级"
    
    def _safe_char_count(entry):
        if not isinstance(entry, dict):
            return 0
        st = entry.get("stats")
        if not isinstance(st, dict):
            return 0
        cnt = st.get("char_count") or st.get("total_chars") or st.get("rp_chars")
        if cnt is None:
            return 0
        try:
            return int(cnt)
        except (ValueError, TypeError):
            return 0

    total_chars = sum(_safe_char_count(h) for h in hist)
    chars_str = f"{total_chars:,} 字" if total_chars else "以日志为准"

    # 左列信息
    draw.text((55, curr_y + 16), f"归档对象: {target_name}", font=fonts['h2'], fill=border_primary)
    draw.text((55, curr_y + 52), f"识别账号: QQ {qq_str}", font=fonts['body'], fill=text_primary)
    draw.text((55, curr_y + 78), f"卷宗类别: {role_title} 专属轨迹", font=fonts['body'], fill=text_primary)
    
    # 右列信息 (从 X=500 开始)
    total_rec = len(hist)
    total_logs = 0
    for h in hist:
        _, sc = format_archive_sources_display(h.get("sources"))
        total_logs += sc
    if total_logs > total_rec:
        rec_display_str = f"收录战役: 累计 {total_rec} 场 (复合共 {total_logs} 篇) | 参演总字数: {chars_str}"
    else:
        rec_display_str = f"收录战役: 累计 {total_rec} 场 | 参演总字数: {chars_str}"

    draw.text((500, curr_y + 18), f"编撰时跨: {first_seen} ~ {last_updated}", font=fonts['body'], fill=text_primary)
    draw.text((500, curr_y + 48), rec_display_str, font=fonts['body'], fill=text_primary)
    draw.text((500, curr_y + 78), f"巅峰评级: ★ {peak_grade}  (最新战役评级: {latest_grade})", font=fonts['body_bold'], fill=stamp_red)

    # 细分隔线
    draw.line([(55, curr_y + 108), (width - 55, curr_y + 108)], fill=(235, 225, 210), width=1)

    # 底端整行 1: 历次评级走势
    if len(grades) > 1:
        draw.text((55, curr_y + 116), f"历次评级走势: {' -> '.join(grades[-10:])}", font=fonts['small_bold'], fill=text_secondary)
    else:
        draw.text((55, curr_y + 116), f"综合表现评级: ★ {peak_grade}", font=fonts['small_bold'], fill=text_secondary)

    # 底端整行 2: 关联角色 (自动测量截断保护，彻底防止文字重叠)
    aliases = [str(a) for a in data.get("aliases", []) if a and not str(a).startswith("用户_")]
    if aliases:
        alias_str = "关联角色: " + "、".join(aliases)
        while len(alias_str) > 8 and fonts['small'].getlength(alias_str) > (width - 120):
            alias_str = alias_str[:-2] + "…"
        draw.text((55, curr_y + 142), alias_str, font=fonts['small'], fill=text_secondary)

    curr_y += 195

    # 4. 双雷达图对比区域 (根据身份智能匹配提示词推荐的六维能力)
    is_kp = ("KP" in str(role_title).upper()) or (data.get("role") == "KP")
    default_axes = KP_RADAR_AXES if is_kp else PL_RADAR_AXES

    # 提取历史中已存在的雷达数据维度
    candidate_keys = []
    for h in hist:
        r = h.get("radar")
        if isinstance(r, dict):
            for k in r.keys():
                k_norm = normalize_dimension_name(k)
                if k_norm and k_norm not in candidate_keys:
                    candidate_keys.append(k_norm)

    if sum(1 for a in default_axes if a in candidate_keys) >= 3:
        axes = list(default_axes)
    elif len(candidate_keys) == 6:
        axes = candidate_keys
    else:
        axes = list(default_axes)
    
    last_battle = hist[-1] if hist else {}
    last_radar = (last_battle.get("radar") or {}) if isinstance(last_battle, dict) else {}
    if not isinstance(last_radar, dict):
        last_radar = {}

    def _get_radar_val(r_dict, axis_name):
        if not isinstance(r_dict, dict):
            return 0
        v = r_dict.get(axis_name)
        if v is not None:
            try: return int(float(v))
            except (ValueError, TypeError): pass
        for k, val in r_dict.items():
            if normalize_dimension_name(k) == axis_name:
                try: return int(float(val))
                except (ValueError, TypeError): pass
        return 0

    def calc_score(h):
        if not isinstance(h, dict):
            return 0.0
        r = h.get("radar")
        if not isinstance(r, dict):
            return 0.0
        total = 0.0
        for a in axes:
            total += _get_radar_val(r, a)
        return total
        
    best_battle = max(hist, key=calc_score) if hist else {}
    best_radar = (best_battle.get("radar") or {}) if isinstance(best_battle, dict) else {}
    if not isinstance(best_radar, dict):
        best_radar = {}
    
    draw.line([(40, curr_y), (width - 41, curr_y)], fill=border_secondary, width=1)
    curr_y += 14
    draw.text((40, curr_y), "◆ 六维能力双轨雷达对照 (RECENT vs PEAK PERFORMANCE)", font=fonts['h2'], fill=border_primary)
    curr_y += 36
    
    radar_area_top = curr_y
    rc_x = 230
    rc_y = radar_area_top + 145
    r_radius = 115
    
    points = []
    for i in range(6):
        angle = -math.pi / 2 + i * math.pi / 3
        points.append((rc_x + math.cos(angle) * r_radius, rc_y + math.sin(angle) * r_radius))
        
    for level in (0.25, 0.5, 0.75, 1.0):
        ring = [(rc_x + (px - rc_x) * level, rc_y + (py - rc_y) * level) for px, py in points]
        draw.line(ring + [ring[0]], fill=border_secondary, width=1)
        
    for pt, ax in zip(points, axes):
        draw.line([(rc_x, rc_y), pt], fill=border_secondary, width=1)
        off_x = -24 if pt[0] < rc_x - 10 else (8 if pt[0] > rc_x + 10 else -16)
        off_y = -20 if pt[1] < rc_y - 10 else (6 if pt[1] > rc_y + 10 else -8)
        draw.text((pt[0] + off_x, pt[1] + off_y), ax, font=fonts['small_bold'], fill=text_primary)

    # 历史巅峰雷达 (红色)
    best_pts = []
    for pt, ax in zip(points, axes):
        val = _get_radar_val(best_radar, ax)
        ratio = max(0.15, min(100.0, val) / 100.0) if val > 0 else 0.15
        best_pts.append((rc_x + (pt[0] - rc_x) * ratio, rc_y + (pt[1] - rc_y) * ratio))
        
    # 最近一次雷达 (蓝色)
    last_pts = []
    for pt, ax in zip(points, axes):
        val = _get_radar_val(last_radar, ax)
        ratio = max(0.15, min(100.0, val) / 100.0) if val > 0 else 0.15
        last_pts.append((rc_x + (pt[0] - rc_x) * ratio, rc_y + (pt[1] - rc_y) * ratio))

    # 半透明填充图层
    poly_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(poly_layer)
    pdraw.polygon(best_pts, fill=(192, 57, 43, 60))
    pdraw.polygon(last_pts, fill=(41, 128, 185, 75))
    img.alpha_composite(poly_layer)
    draw = ImageDraw.Draw(img)
    
    # 轮廓线与端点
    draw.line(best_pts + [best_pts[0]], fill=(192, 57, 43), width=3)
    for bx, by in best_pts:
        draw.ellipse([bx - 4, by - 4, bx + 4, by + 4], fill=(192, 57, 43))
        
    draw.line(last_pts + [last_pts[0]], fill=(41, 128, 185), width=3)
    for lx, ly in last_pts:
        draw.ellipse([lx - 4, ly - 4, lx + 4, ly + 4], fill=(41, 128, 185))

    # 右侧图例与六维对照表格
    t_left = 490
    t_top = radar_area_top + 10
    
    last_title = last_battle.get("log_timeline") or "最近战役"
    best_title = best_battle.get("log_timeline") or "历史巅峰"
    best_score_total = int(calc_score(best_battle))
    last_score_total = int(calc_score(last_battle))
    
    draw.rectangle([t_left, t_top, t_left + 16, t_top + 16], fill=(41, 128, 185))
    draw.text((t_left + 26, t_top), f"最近战役: {last_title} (总分 {last_score_total} | 评级 {last_battle.get('grade','-')})", font=fonts['body_bold'], fill=text_primary)
    
    draw.rectangle([t_left, t_top + 28, t_left + 16, t_top + 44], fill=(192, 57, 43))
    draw.text((t_left + 26, t_top + 28), f"历史巅峰: {best_title} (总分 {best_score_total} | 评级 {best_battle.get('grade','-')}) ★", font=fonts['body_bold'], fill=stamp_red)

    # 绘制对照小表格 (宽度 530px，列宽分布均匀)
    tbl_y = t_top + 65
    tbl_w = width - 40 - t_left
    draw.rectangle([t_left, tbl_y, t_left + tbl_w, tbl_y + 200], fill=card_bg, outline=card_border, width=1)
    draw.rectangle([t_left, tbl_y, t_left + tbl_w, tbl_y + 28], fill=(235, 225, 210))
    
    draw.text((t_left + 25, tbl_y + 5), "能力维度", font=fonts['small_bold'], fill=border_primary)
    draw.text((t_left + 145, tbl_y + 5), "最近得分", font=fonts['small_bold'], fill=(41, 128, 185))
    draw.text((t_left + 255, tbl_y + 5), "历史最高", font=fonts['small_bold'], fill=(192, 57, 43))
    draw.text((t_left + 375, tbl_y + 5), "成长状态", font=fonts['small_bold'], fill=text_secondary)
    
    for row_idx, ax in enumerate(axes):
        ry = tbl_y + 32 + row_idx * 27
        l_v = _get_radar_val(last_radar, ax)
        b_v = _get_radar_val(best_radar, ax)
        diff = l_v - b_v
        if diff >= 0 and l_v > 0:
            status_str = "★ 达成极值"
            stat_color = stamp_red
        elif diff >= -5 and l_v > 0:
            status_str = "◆ 高位平稳"
            stat_color = (160, 90, 30)
        elif l_v > 0:
            status_str = f"▼ 较峰值 {diff}"
            stat_color = text_secondary
        else:
            status_str = "— 尚待测评"
            stat_color = text_secondary
            
        draw.line([(t_left + 10, ry), (t_left + tbl_w - 10, ry)], fill=(240, 235, 225), width=1)
        draw.text((t_left + 25, ry + 4), ax, font=fonts['small'], fill=text_primary)
        draw.text((t_left + 160, ry + 4), str(l_v) if l_v > 0 else "-", font=fonts['small_bold'], fill=(41, 128, 185))
        draw.text((t_left + 270, ry + 4), str(b_v) if b_v > 0 else "-", font=fonts['small_bold'], fill=(192, 57, 43))
        draw.text((t_left + 375, ry + 4), status_str, font=fonts['small'], fill=stat_color)

    curr_y = radar_area_top + 310

    # 5. 荣誉与风味称号编年长廊 (时序全量保留，弹性列宽杜绝任何文本撞车)
    draw.line([(40, curr_y), (width - 41, curr_y)], fill=border_secondary, width=1)
    curr_y += 14
    draw.text((40, curr_y), "◆ 荣誉与风味称号编年长廊 (TITLES CHRONICLE)", font=fonts['h2'], fill=border_primary)
    curr_y += 36
    
    chronological_titles = []
    for h in hist:
        tl = h.get("log_timeline") or (h.get("created_at") or "").split(" ")[0] or "未知时期"
        ts = h.get("titles") or []
        disp_name, _ = format_archive_sources_display(h.get("sources"), max_len=22, show_count=False)
        if ts:
            chronological_titles.append({
                "timeline": tl,
                "titles": ts,
                "battle": disp_name
            })
            
    if chronological_titles:
        for item in chronological_titles:
            draw.line([(60, curr_y - 10), (60, curr_y + 25)], fill=border_primary, width=2)
            draw.ellipse([54, curr_y + 4, 66, curr_y + 16], fill=header_bg, outline=border_primary, width=2)
            
            # 日期列 (固定预留 255px: X=80 ~ X=335)
            draw.text((80, curr_y + 2), f"[{item['timeline']}]", font=fonts['body_bold'], fill=border_primary)
            
            # 战役名列 (从 X=345 开始，限制最大宽度 230px)
            raw_b = f"《{item['battle']}》"
            clean_b = raw_b
            while len(clean_b) > 4 and fonts['body'].getlength(clean_b) > 230:
                clean_b = clean_b[:-3] + "…》"
            draw.text((345, curr_y + 2), clean_b, font=fonts['body'], fill=text_secondary)
            
            # 获封称号列 (从 X=595 开始，预留 420px+)
            t_str = "、".join([f"【{t}】" for t in item['titles']])
            raw_title_line = f"获封称号 -> {t_str}"
            clean_title_line = raw_title_line
            while len(clean_title_line) > 8 and fonts['body_bold'].getlength(clean_title_line) > (width - 615):
                clean_title_line = clean_title_line[:-2] + "…"
            draw.text((595, curr_y + 2), clean_title_line, font=fonts['body_bold'], fill=stamp_red)
            curr_y += 36
    else:
        draw.text((80, curr_y), "（暂未收录风味称号，在开启风格分析后将按战役时序永久归档）", font=fonts['body'], fill=text_secondary)
        curr_y += 32

    curr_y += 15

    # 6. 馆藏收录战役编目 (固定互斥网格布局，彻底杜绝重合)
    draw.line([(40, curr_y), (width - 41, curr_y)], fill=border_secondary, width=1)
    curr_y += 14
    draw.text((40, curr_y), "◆ 馆藏收录战役编目 (ARCHIVED BATTLES CATALOG)", font=fonts['h2'], fill=border_primary)
    curr_y += 36
    
    for idx, h in enumerate(hist, 1):
        tl = h.get("log_timeline") or "未知时间"
        grd = h.get("grade") or "-"
        disp_name, src_count = format_archive_sources_display(h.get("sources"), max_len=26, show_count=False)
        c_cnt = _safe_char_count(h)
        if c_cnt:
            c_tip = f"{c_cnt:,}字 [共{src_count}篇]" if src_count > 1 else f"{c_cnt:,}字"
        else:
            c_tip = f"[共{src_count}篇]" if src_count > 1 else ""
        is_best = (h == best_battle)
        
        bg_bar = (244, 238, 226) if idx % 2 == 1 else card_bg
        draw.rounded_rectangle([40, curr_y, width - 40, curr_y + 34], radius=4, fill=bg_bar)
        
        badge_color = stamp_red if is_best else border_primary
        # 1. 序号列
        draw.text((50, curr_y + 6), f"#{idx}", font=fonts['body_bold'], fill=badge_color)
        # 2. 时间跨度列 (X=95 ~ 340)
        draw.text((95, curr_y + 6), f"[{tl}]", font=fonts['body'], fill=text_primary)
        # 3. 战役名列 (从 X=345 开始，限制宽度 320px)
        b_name_raw = f"《{disp_name}》"
        b_name_clean = b_name_raw
        while len(b_name_clean) > 4 and fonts['body_bold'].getlength(b_name_clean) > 320:
            b_name_clean = b_name_clean[:-3] + "…》"
        draw.text((345, curr_y + 6), b_name_clean, font=fonts['body_bold'], fill=text_primary)
        # 4. 评级列
        draw.text((675, curr_y + 6), f"评级: {grd}", font=fonts['body_bold'], fill=stamp_red if 'S' in grd or 'EX' in grd else text_primary)
        # 5. 字数列与多篇标识
        if c_tip:
            draw.text((780, curr_y + 6), c_tip, font=fonts['small'], fill=text_secondary)
        # 6. 巅峰标签列
        if is_best:
            draw.text((895, curr_y + 6), "★ 历史最高总分", font=fonts['small_bold'], fill=stamp_red)
        curr_y += 40

    curr_y += 15

    # 7. 修补提示与页脚 (同时支持时间纠偏指令与档案改名指令，明确本人绑定QQ权限)
    draw.rounded_rectangle([40, curr_y, width - 40, curr_y + 68], radius=6, fill=(240, 232, 218), outline=border_secondary, width=1)
    draw.text((55, curr_y + 8), "[!] 卷宗档案维护指令提示（仅限绑定本档案QQ的本人操作）：", font=fonts['small_bold'], fill=border_primary)
    draw.text((55, curr_y + 26), f"   ◆ 战役时间纠偏：.风格 档案时间 <战役序号#1,2...> <正确时间(如 2024-03-15 或 2023-09~2023-10)>", font=fonts['small'], fill=text_primary)
    draw.text((55, curr_y + 46), f"   ◆ 归档对象改名：.风格 档案改名 <新名字>  或直接发送  .档案改名 <新名字>", font=fonts['small'], fill=text_primary)
    
    curr_y += 85
    draw.line([(40, curr_y), (width - 41, curr_y)], fill=border_secondary, width=1)
    footer_str = "SealDice Archive Library · 个人成长轨迹数字化存储中心 · 绝密卷宗"
    fw = fonts['small'].getlength(footer_str)
    draw.text(((width - fw) / 2, curr_y + 10), footer_str, font=fonts['small'], fill=text_secondary)

    buf = BytesIO()
    img.convert("RGB").save(buf, format="PNG", quality=95)
    return buf.getvalue()

def update_player_archive_timeline(target_query: str, battle_idx=None, new_timeline: str = "", identity_filter: str = "pl", battle_keyword: str = "", operator_qq: str = "") -> dict:
    """修补玩家档案中某场战役的时间跨度，并自动重新时序排序与刷新成长档案图（仅限档案归属者修改）"""
    if not os.path.isdir(STYLE_ARCHIVES_DIR):
        return {"success": False, "msg": "档案库为空，尚未建立任何玩家成长档案。"}

    base_dir = os.path.realpath(STYLE_ARCHIVES_DIR)
    query = str(target_query or "").strip()
    clean_q = re.sub(r'^(?:QQ[:：]|OpenQQ:)?', '', query, flags=re.IGNORECASE).strip()
    if not clean_q:
        return {"success": False, "msg": "缺少目标对象参数 (QQ号或角色名)"}

    new_timeline_str = str(new_timeline or "").strip()
    if not new_timeline_str:
        return {"success": False, "msg": "缺少新的时间轴参数 (如 2024-03-15 或 2023-09~2023-10)"}

    target_dir = None
    m_qq = re.search(r'\b(\d{5,12})\b', clean_q)
    if m_qq:
        qq_num = m_qq.group(1)
        qq_dir = os.path.realpath(os.path.join(base_dir, qq_num))
        if os.path.isdir(qq_dir):
            target_dir = qq_dir
            name_candidate = re.sub(r'\b\d{5,12}\b', '', clean_q).strip()
            name_candidate = re.sub(r'^[,，、\s/|;；]+|[,，、\s/|;；]+$', '', name_candidate).strip()
            if name_candidate:
                _merge_alias_dir_into_qq(base_dir, qq_num, name_candidate)

    if not target_dir:
        direct = os.path.realpath(os.path.join(base_dir, _sanitize_filename(clean_q)))
        if os.path.isdir(direct):
            target_dir = direct

    if not target_dir:
        linked_qq = _find_linked_qq_by_alias(clean_q, base_dir)
        if linked_qq:
            l_dir = os.path.realpath(os.path.join(base_dir, linked_qq))
            if os.path.isdir(l_dir):
                target_dir = l_dir

    if not target_dir:
        for entry in os.listdir(base_dir):
            edir = os.path.join(base_dir, entry)
            if not os.path.isdir(edir):
                continue
            for sub in ("pl", "kp"):
                tf = os.path.join(edir, sub, "growth_timeline.json")
                if os.path.exists(tf):
                    try:
                        with open(tf, "r", encoding="utf-8") as f:
                            d = json.load(f)
                        if d.get("qq") == clean_q or d.get("target") == clean_q or entry == clean_q or clean_q in d.get("aliases", []):
                            target_dir = edir
                            break
                        for h in d.get("history", []):
                            if h.get("target") == clean_q or clean_q in h.get("aliases", []):
                                target_dir = edir
                                break
                    except Exception:
                        pass
            if target_dir:
                break

    if not target_dir:
        return {"success": False, "msg": f"未找到关于【{query}】的成长档案。"}

    _migrate_legacy_archive_if_needed(target_dir)

    # 鉴权校验：仅限绑定了QQ号的用户且与QQ号相同的用户进行调整
    archive_qq = ""
    dir_basename = os.path.basename(target_dir)
    if re.match(r'^\d{5,12}$', dir_basename):
        archive_qq = dir_basename

    for sub in ("pl", "kp"):
        tf_chk = os.path.join(target_dir, sub, "growth_timeline.json")
        if os.path.exists(tf_chk):
            try:
                with open(tf_chk, "r", encoding="utf-8") as f_chk:
                    d_chk = json.load(f_chk)
                if d_chk.get("qq"):
                    archive_qq = str(d_chk.get("qq")).strip()
                    break
            except Exception:
                pass

    is_admin = str(operator_qq or '').lower().strip() in ('admin', 'master', 'root')
    clean_op_qq = re.sub(r'\D+', '', str(operator_qq or '')).strip()
    clean_arc_qq = re.sub(r'\D+', '', str(archive_qq or '')).strip()

    if not is_admin:
        if clean_arc_qq:
            if not clean_op_qq:
                return {
                    "success": False,
                    "msg": f"❌ 权限拒绝：该战役档案归属于 QQ【{clean_arc_qq}】。调整档案仅限绑定了 QQ 号的本人操作，请先绑定 QQ 或使用真实 QQ 发送指令。"
                }
            if clean_op_qq != clean_arc_qq:
                return {
                    "success": False,
                    "msg": f"❌ 权限拒绝：该战役档案归属于 QQ【{clean_arc_qq}】，当前操作者 QQ 为【{clean_op_qq}】。严禁越权调整他人的档案战役！"
                }
        elif not clean_op_qq:
            return {
                "success": False,
                "msg": "❌ 权限拒绝：调整档案战役时间仅限已绑定 QQ 号的用户操作，请先绑定原 QQ 号或使用真实 QQ 发送。"
            }

    role_sub = "kp" if str(identity_filter or "").lower() in ("kp", "主持", "主持人", "dm") else "pl"
    role_dir = os.path.join(target_dir, role_sub)
    timeline_path = os.path.join(role_dir, "growth_timeline.json")

    # 若指定角色的 timeline 不存在但另一角色存在，自动平滑切换
    if not os.path.exists(timeline_path):
        alt_sub = "pl" if role_sub == "kp" else "kp"
        alt_path = os.path.join(target_dir, alt_sub, "growth_timeline.json")
        if os.path.exists(alt_path):
            role_sub = alt_sub
            role_dir = os.path.join(target_dir, role_sub)
            timeline_path = alt_path
        else:
            return {"success": False, "msg": f"未找到【{query}】的【{role_sub.upper()}】档案数据。"}

    try:
        with open(timeline_path, "r", encoding="utf-8") as f:
            timeline_data = json.load(f)
    except Exception as e:
        return {"success": False, "msg": f"读取档案文件失败: {e}"}

    history = ensure_history_sorted_and_timed(timeline_data.get("history", []))
    timeline_data["history"] = history
    if not history:
        return {"success": False, "msg": f"【{query}】的档案中暂无任何战役记录可供修改。"}

    # 定位战役目标
    target_entry = None
    orig_idx = -1

    clean_kw = str(battle_keyword or "").strip()
    if clean_kw:
        for idx, h in enumerate(history, 1):
            src_str = " ".join([str(s.get("key") if isinstance(s, dict) else s) for s in h.get("sources", [])])
            if clean_kw in src_str or clean_kw in str(h.get("record_id", "")) or clean_kw in str(h.get("log_timeline", "")):
                target_entry = h
                orig_idx = idx
                break

    if target_entry is None:
        clean_idx_str = str(battle_idx or "").strip()
        m_num = re.search(r'\d+', clean_idx_str)
        if m_num:
            try:
                b_num = int(m_num.group(0))
                if 1 <= b_num <= len(history):
                    target_entry = history[b_num - 1]
                    orig_idx = b_num
                elif b_num == 0:
                    target_entry = history[-1]
                    orig_idx = len(history)
                else:
                    return {"success": False, "msg": f"战役序号 #{b_num} 超出范围 (当前共有 {len(history)} 场战役，请输入 1~{len(history)})"}
            except ValueError:
                pass
        elif clean_idx_str in ("-1", "last", "最新", "最后"):
            target_entry = history[-1]
            orig_idx = len(history)

    if target_entry is None:
        # 默认修改最后一场（最新）战役
        target_entry = history[-1]
        orig_idx = len(history)

    old_timeline = target_entry.get("log_timeline") or "未知时间"

    # 解析新时间跨度
    start_t, end_t = _detect_log_time_range(None, new_timeline_str)
    if start_t == 0:
        dt = _parse_time_str(new_timeline_str)
        if dt:
            start_t = dt
            end_t = dt + 86399
        else:
            start_t = target_entry.get("start_t", 0)
            end_t = target_entry.get("end_t", start_t)
    elif end_t == 0:
        end_t = start_t + 86399

    target_entry["log_timeline"] = new_timeline_str
    target_entry["start_t"] = start_t
    target_entry["end_t"] = end_t

    # 同步修改 records/<record_id>.json
    rec_id = target_entry.get("record_id")
    if rec_id:
        rec_f = os.path.join(role_dir, "records", f"{rec_id}.json")
        if os.path.isfile(rec_f):
            try:
                with open(rec_f, "r", encoding="utf-8") as rf:
                    rec_obj = json.load(rf)
                rec_obj["log_timeline"] = new_timeline_str
                rec_obj["start_t"] = start_t
                rec_obj["end_t"] = end_t
                with open(rec_f, "w", encoding="utf-8") as rf:
                    json.dump(rec_obj, rf, ensure_ascii=False, indent=2)
            except Exception as e_rf:
                print(f"[时间修补] 同步单场记录失败: {e_rf}")

    # 全量重新按时间升序单调排序
    history = ensure_history_sorted_and_timed(history)
    timeline_data["history"] = history
    new_idx = history.index(target_entry) + 1

    # 重算 first_seen
    valid_starts = [h.get("start_t") for h in history if h.get("start_t")]
    if valid_starts:
        timeline_data["first_seen"] = time.strftime('%Y-%m-%d', time.localtime(min(valid_starts)))

    timeline_data["total_records"] = len(history)

    with open(timeline_path, "w", encoding="utf-8") as f:
        json.dump(timeline_data, f, ensure_ascii=False, indent=2)

    # 重新渲染最新图书馆档案长图并缓存
    role_label = "PL 玩家" if role_sub == "pl" else "KP 主持"
    try:
        img_bytes = render_library_archive_image(timeline_data, role_label)
    except Exception as e:
        print(f"[时间修补] 重新渲染长图失败: {e}")
        img_bytes = None
    job_id = str(uuid.uuid4())
    if img_bytes:
        JOB_CACHE[job_id] = {'status': 'done', 'images': [img_bytes], 'created': time.time()}

    disp_b_name, _ = format_archive_sources_display(target_entry.get("sources"), max_len=26, show_count=False)
    t_name = timeline_data.get("target") or clean_q
    return {
        "success": True,
        "msg": f"✅ 已成功将【{t_name}】第 #{orig_idx} 场战役《{disp_b_name}》的时间跨度修正为【{new_timeline_str}】！\n时序重排后当前位于第 #{new_idx}/{len(history)} 场。",
        "target": t_name,
        "qq": timeline_data.get("qq") or "",
        "role": role_sub.upper(),
        "battle_name": disp_b_name,
        "old_timeline": old_timeline,
        "new_timeline": new_timeline_str,
        "old_index": orig_idx,
        "new_index": new_idx,
        "total_records": len(history),
        "id": job_id,
        "image_count": 1 if img_bytes else 0
    }
def _heal_archive_history_if_needed(target_dir: str, role_subdir: str, timeline_data: dict) -> bool:
    """自愈修复历史记录：若 radar 为空、全0或非标准维度，自动从 records/{record_id}.json 重新解析补齐；同时修复 None/0 字数"""
    if not isinstance(timeline_data, dict):
        return False
    history = timeline_data.get("history", [])
    records_dir = os.path.join(target_dir, role_subdir, "records")
    changed = False
    std_axes = KP_RADAR_AXES if role_subdir == "kp" else PL_RADAR_AXES

    for h in history:
        rec_id = h.get("record_id")
        rec_data = None
        if rec_id and os.path.isdir(records_dir):
            rec_json_path = os.path.join(records_dir, f"{rec_id}.json")
            if os.path.isfile(rec_json_path):
                try:
                    with open(rec_json_path, "r", encoding="utf-8") as rf:
                        rec_data = json.load(rf)
                except Exception:
                    pass

        # 1. 自愈 radar
        cur_radar = h.get("radar") or {}
        needs_radar_heal = False
        if not cur_radar:
            needs_radar_heal = True
        elif all(v == 0 for v in cur_radar.values()):
            needs_radar_heal = True
        elif sum(1 for a in std_axes if a in cur_radar) < 3:
            needs_radar_heal = True

        if needs_radar_heal and rec_data:
            full_rep = rec_data.get("full_report") or ""
            new_radar = extract_radar_data_from_text(full_rep)
            if new_radar and any(v > 0 for v in new_radar.values()):
                h["radar"] = new_radar
                rec_data["radar"] = new_radar
                changed = True
                try:
                    with open(rec_json_path, "w", encoding="utf-8") as wf:
                        json.dump(rec_data, wf, ensure_ascii=False, indent=2)
                except Exception:
                    pass

        # 2. 自愈字数 stats
        cur_st = h.get("stats") or {}
        cur_chars = cur_st.get("char_count") or cur_st.get("total_chars") or 0
        if (not cur_chars) and rec_data:
            rec_st = rec_data.get("stats") or {}
            rec_chars = rec_st.get("char_count") or rec_st.get("total_chars") or rec_st.get("rp_chars") or 0
            if rec_chars:
                h.setdefault("stats", {})["char_count"] = int(rec_chars)
                h.setdefault("stats", {})["total_chars"] = int(rec_chars)
                changed = True

        # 3. 自愈复合 Log 来源 sources (修复多Log分析时只记录/展示单篇的问题)
        cur_src = h.get("sources")
        needs_src_heal = False
        if not cur_src:
            needs_src_heal = True
        elif isinstance(cur_src, str) and (" + " in cur_src or "+" in cur_src):
            needs_src_heal = True
        elif isinstance(cur_src, list) and len(cur_src) <= 1:
            needs_src_heal = True

        if needs_src_heal and rec_data:
            rec_src = rec_data.get("sources")
            recovered_sources = []
            if isinstance(rec_src, list) and len(rec_src) > 1:
                recovered_sources = rec_src
            elif isinstance(rec_src, str) and " + " in rec_src:
                recovered_sources = [x.strip() for x in rec_src.split(" + ") if x.strip()]

            # 若 record_data 中的 sources 依然只有单篇，尝试从 full_report 深度反解复合段落标记
            if len(recovered_sources) <= 1:
                full_rep = rec_data.get("full_report") or ""
                m_segs = re.findall(r'【时间线第\s*\d+/\d+\s*段:\s*([^\s\]()（）]+)', full_rep)
                if len(m_segs) > 1:
                    recovered_sources = m_segs
                else:
                    m_fn = re.search(r'文件名(?:/来源)?\s*[：:]\s*([^\r\n]+)', full_rep)
                    if m_fn and (" + " in m_fn.group(1) or "+" in m_fn.group(1)):
                        parts = [x.strip() for x in re.split(r'\s*\+\s*', m_fn.group(1)) if x.strip()]
                        if len(parts) > 1:
                            recovered_sources = parts

            cur_count = len(cur_src) if isinstance(cur_src, list) else (1 if cur_src else 0)
            if recovered_sources and len(recovered_sources) > cur_count:
                h["sources"] = recovered_sources
                rec_data["sources"] = recovered_sources
                changed = True
                try:
                    with open(rec_json_path, "w", encoding="utf-8") as wf:
                        json.dump(rec_data, wf, ensure_ascii=False, indent=2)
                except Exception:
                    pass

    if changed:
        tl_path = os.path.join(target_dir, role_subdir, "growth_timeline.json")
        try:
            with open(tl_path, "w", encoding="utf-8") as wf:
                json.dump(timeline_data, wf, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[档案自愈] 保存修复数据失败: {e}")
    return changed

def rename_player_archive(target_query: str, new_name: str, identity_filter: str = "pl", operator_qq: str = "") -> dict:
    """修改玩家档案中的归档对象名称，保留原名称到别名列表中，并自动重新渲染长图（仅限档案归属者本人修改）"""
    if not os.path.isdir(STYLE_ARCHIVES_DIR):
        return {"success": False, "msg": "档案库为空，尚未建立任何玩家成长档案。"}

    base_dir = os.path.realpath(STYLE_ARCHIVES_DIR)
    query = str(target_query or "").strip()
    clean_new_name = re.sub(r'[\r\n\t]+', ' ', str(new_name or '')).strip()
    clean_new_name = re.sub(r'^[,，、\s/|;；]+|[,，、\s/|;；]+$', '', clean_new_name).strip()
    if not clean_new_name:
        return {"success": False, "msg": "新档案名称不能为空。"}

    clean_q = re.sub(r'^(?:QQ[:：]|OpenQQ:)?', '', query, flags=re.IGNORECASE).strip()
    clean_q = re.sub(r'^[,，、\s/|;；]+|[,，、\s/|;；]+$', '', clean_q).strip()

    target_dir = None
    m_qq = re.search(r'\b(\d{5,12})\b', clean_q)
    if m_qq:
        qq_num = m_qq.group(1)
        qq_dir = os.path.realpath(os.path.join(base_dir, qq_num))
        if os.path.isdir(qq_dir):
            target_dir = qq_dir

    if not target_dir:
        direct = os.path.realpath(os.path.join(base_dir, _sanitize_filename(clean_q)))
        if os.path.isdir(direct):
            target_dir = direct

    if not target_dir:
        linked_qq = _find_linked_qq_by_alias(clean_q, base_dir)
        if linked_qq:
            l_dir = os.path.realpath(os.path.join(base_dir, linked_qq))
            if os.path.isdir(l_dir):
                target_dir = l_dir

    if not target_dir:
        for entry in os.listdir(base_dir):
            edir = os.path.join(base_dir, entry)
            if not os.path.isdir(edir):
                continue
            for sub in ("pl", "kp"):
                tf = os.path.join(edir, sub, "growth_timeline.json")
                if os.path.exists(tf):
                    try:
                        with open(tf, "r", encoding="utf-8") as f:
                            d = json.load(f)
                        if d.get("qq") == clean_q or d.get("target") == clean_q or entry == clean_q or clean_q in d.get("aliases", []):
                            target_dir = edir
                            break
                        for h in d.get("history", []):
                            if h.get("target") == clean_q or clean_q in h.get("aliases", []):
                                target_dir = edir
                                break
                    except Exception:
                        pass
            if target_dir:
                break

    if not target_dir:
        return {"success": False, "msg": f"未找到关于【{query}】的成长档案，请确认 QQ 号或旧角色名。"}

    _migrate_legacy_archive_if_needed(target_dir)

    # 鉴权校验：仅限绑定了QQ号的用户且与QQ号相同的用户进行修改
    archive_qq = ""
    dir_basename = os.path.basename(target_dir)
    if re.match(r'^\d{5,12}$', dir_basename):
        archive_qq = dir_basename

    for sub in ("pl", "kp"):
        tf_chk = os.path.join(target_dir, sub, "growth_timeline.json")
        if os.path.exists(tf_chk):
            try:
                with open(tf_chk, "r", encoding="utf-8") as f_chk:
                    d_chk = json.load(f_chk)
                if d_chk.get("qq"):
                    archive_qq = str(d_chk.get("qq")).strip()
                    break
            except Exception:
                pass

    is_admin = str(operator_qq or '').lower().strip() in ('admin', 'master', 'root')
    clean_op_qq = re.sub(r'\D+', '', str(operator_qq or '')).strip()
    clean_arc_qq = re.sub(r'\D+', '', str(archive_qq or '')).strip()

    if not is_admin:
        if clean_arc_qq:
            if not clean_op_qq:
                return {
                    "success": False,
                    "msg": f"❌ 权限拒绝：该成长档案归属于 QQ【{clean_arc_qq}】。档案改名仅限绑定了 QQ 号的本人操作，请先绑定 QQ 或使用真实 QQ 发送指令。"
                }
            if clean_op_qq != clean_arc_qq:
                return {
                    "success": False,
                    "msg": f"❌ 权限拒绝：该成长档案归属于 QQ【{clean_arc_qq}】，当前操作者 QQ 为【{clean_op_qq}】。严禁越权修改他人的档案！"
                }
        elif not clean_op_qq:
            return {
                "success": False,
                "msg": "❌ 权限拒绝：修改档案名称仅限已绑定 QQ 号的用户操作，请先绑定原 QQ 号或使用真实 QQ 发送。"
            }

    filt = str(identity_filter or "pl").strip().lower()
    targets_to_update = []
    if filt in ("kp", "主持", "主持人", "dm"):
        targets_to_update.append(("kp", "KP 主持"))
    elif filt in ("all", "双重", "全部"):
        targets_to_update.append(("pl", "PL 玩家"))
        targets_to_update.append(("kp", "KP 主持"))
    else:
        if not os.path.exists(os.path.join(target_dir, "pl", "growth_timeline.json")) and os.path.exists(os.path.join(target_dir, "kp", "growth_timeline.json")):
            targets_to_update = [("kp", "KP 主持")]
        else:
            targets_to_update = [("pl", "PL 玩家")]

    updated_any = False
    images = []
    job_id = str(uuid.uuid4())
    old_names = []

    for sub, label in targets_to_update:
        tf = os.path.join(target_dir, sub, "growth_timeline.json")
        if not os.path.exists(tf):
            continue
        try:
            with open(tf, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        _heal_archive_history_if_needed(target_dir, sub, data)

        old_target = data.get("target") or ""
        if old_target and old_target != clean_new_name:
            old_names.append(old_target)
            aliases = data.setdefault("aliases", [])
            if old_target not in aliases and not old_target.startswith("用户_") and not re.match(r'^\d{5,12}$', old_target):
                aliases.append(old_target)

        data["target"] = clean_new_name
        data["last_updated"] = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        aliases = data.setdefault("aliases", [])
        if clean_new_name not in aliases:
            aliases.insert(0, clean_new_name)

        with open(tf, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        updated_any = True

        try:
            img_bytes = render_library_archive_image(data, label)
            if img_bytes:
                images.append(img_bytes)
        except Exception as e:
            print(f"[档案改名] 重新渲染长图失败: {e}")

    if not updated_any:
        return {"success": False, "msg": f"未能找到可更新的【{query}】档案文件。"}

    if images:
        JOB_CACHE[job_id] = {'status': 'done', 'images': images, 'created': time.time()}

    old_str = f"（原归档名：{', '.join(set(old_names))}）" if old_names else ""
    return {
        "success": True,
        "msg": f"✅ 档案对象已成功更名为【{clean_new_name}】{old_str}！\n原名称已保留至别名检索库，卷宗长图已重新编撰生成。",
        "new_name": clean_new_name,
        "target": clean_new_name,
        "id": job_id if images else "",
        "image_count": len(images)
    }

def _format_single_track_summary(data: dict, role_title: str) -> str:
    lines = [
        f"【📖 {role_title}成长档案 | {data.get('target', '未知')}】",
        f"🔢 识别账号: {data.get('qq') or '未知'}",
        f"📊 累计分析: {data.get('total_records', 0)} 次",
        _format_track_content_lines(data),
        "💡 提示: 每次在群内进行【.风格】分析时均会自动累积更新本档案。"
    ]
    data["summary_text"] = "\n".join(lines)
    return data["summary_text"]

def load_player_growth_summary(target_query: str, identity_filter: str = None) -> dict:
    """按 QQ 或角色名查询玩家的跑团成长档案，支持 PL / KP 独立查询与双轨总览，并生成图书馆卷宗档案长图"""
    if not os.path.isdir(STYLE_ARCHIVES_DIR):
        return {"found": False, "msg": "档案库为空，尚未建立任何玩家成长档案。"}

    base_dir = os.path.realpath(STYLE_ARCHIVES_DIR)
    heal_all_player_archives()
    query = str(target_query or "").strip()
    clean_q = re.sub(r'^(?:QQ[:：]|OpenQQ:)?', '', query, flags=re.IGNORECASE).strip()

    target_dir = None

    # 1. 优先提取复合目标中的纯数字 QQ（如 "1120934969, 雅恩"）
    m_qq = re.search(r'\b(\d{5,12})\b', clean_q)
    if m_qq:
        qq_num = m_qq.group(1)
        qq_dir = os.path.realpath(os.path.join(base_dir, qq_num))
        if os.path.isdir(qq_dir):
            target_dir = qq_dir
            name_candidate = re.sub(r'\b\d{5,12}\b', '', clean_q).strip()
            name_candidate = re.sub(r'^[,，、\s/|;；]+|[,，、\s/|;；]+$', '', name_candidate).strip()
            if name_candidate:
                _merge_alias_dir_into_qq(base_dir, qq_num, name_candidate)

    # 2. 直接命中目录名
    if not target_dir:
        direct = os.path.realpath(os.path.join(base_dir, _sanitize_filename(clean_q)))
        if os.path.isdir(direct):
            target_dir = direct

    # 3. 尝试通过角色名反向查找绑定的 QQ 档案
    if not target_dir:
        linked_qq = _find_linked_qq_by_alias(clean_q, base_dir)
        if linked_qq:
            l_dir = os.path.realpath(os.path.join(base_dir, linked_qq))
            if os.path.isdir(l_dir):
                target_dir = l_dir

    # 4. 深度扫描各目录下的 aliases 和 history
    if not target_dir:
        for entry in os.listdir(base_dir):
            edir = os.path.join(base_dir, entry)
            if not os.path.isdir(edir):
                continue
            found_this = False
            for sub in ("pl", "kp"):
                tf = os.path.join(edir, sub, "growth_timeline.json")
                if os.path.exists(tf):
                    try:
                        with open(tf, "r", encoding="utf-8") as f:
                            d = json.load(f)
                        if d.get("qq") == clean_q or d.get("target") == clean_q or entry == clean_q:
                            target_dir = edir
                            found_this = True
                            break
                        if clean_q in d.get("aliases", []):
                            target_dir = edir
                            found_this = True
                            break
                        for h in d.get("history", []):
                            if h.get("target") == clean_q or clean_q in h.get("aliases", []):
                                target_dir = edir
                                found_this = True
                                break
                    except Exception:
                        pass
                if found_this:
                    break
            if target_dir:
                break
            # 兼容旧版未迁移根文件
            tf_legacy = os.path.join(edir, "growth_timeline.json")
            if os.path.exists(tf_legacy):
                try:
                    with open(tf_legacy, "r", encoding="utf-8") as f:
                        d = json.load(f)
                    if d.get("qq") == clean_q or d.get("target") == clean_q or entry == clean_q:
                        target_dir = edir
                        break
                except Exception:
                    pass

    if not target_dir:
        return {"found": False, "msg": f"未找到关于【{query}】的跑团成长档案记录。"}

    _migrate_legacy_archive_if_needed(target_dir)

    pl_path = os.path.join(target_dir, "pl", "growth_timeline.json")
    kp_path = os.path.join(target_dir, "kp", "growth_timeline.json")

    pl_data = None
    kp_data = None
    if os.path.exists(pl_path):
        try:
            with open(pl_path, "r", encoding="utf-8") as f:
                pl_data = json.load(f)
        except Exception:
            pass
    if os.path.exists(kp_path):
        try:
            with open(kp_path, "r", encoding="utf-8") as f:
                kp_data = json.load(f)
        except Exception:
            pass

    if pl_data:
        _heal_archive_history_if_needed(target_dir, "pl", pl_data)
        if pl_data.get("history"):
            ensure_history_sorted_and_timed(pl_data["history"])
    if kp_data:
        _heal_archive_history_if_needed(target_dir, "kp", kp_data)
        if kp_data.get("history"):
            ensure_history_sorted_and_timed(kp_data["history"])

    images = []
    job_id = str(uuid.uuid4())

    def _try_render(timeline_obj, label):
        try:
            return render_library_archive_image(timeline_obj, label)
        except Exception as err:
            print(f"[成长档案长图渲染异常] {label} 渲染失败: {err}")
            return None

    filt = str(identity_filter or "").strip().lower()
    if filt in ("pl", "玩家", "player"):
        if not pl_data or not pl_data.get("history"):
            return {"found": False, "msg": f"未找到【{query}】的 PL 玩家成长档案（可能仅有 KP 主持记录）。"}
        summary_text = _format_single_track_summary(pl_data, "PL 玩家")
        img_bytes = _try_render(pl_data, "PL 玩家")
        if img_bytes:
            images.append(img_bytes)
            JOB_CACHE[job_id] = {'status': 'done', 'images': images, 'created': time.time()}
        return {"found": True, "data": pl_data, "summary_text": summary_text, "id": job_id if images else "", "image_count": len(images)}
    elif filt in ("kp", "主持", "主持人", "dm"):
        if not kp_data or not kp_data.get("history"):
            return {"found": False, "msg": f"未找到【{query}】的 KP 主持成长档案（可能仅有 PL 玩家记录）。"}
        summary_text = _format_single_track_summary(kp_data, "KP 主持")
        img_bytes = _try_render(kp_data, "KP 主持")
        if img_bytes:
            images.append(img_bytes)
            JOB_CACHE[job_id] = {'status': 'done', 'images': images, 'created': time.time()}
        return {"found": True, "data": kp_data, "summary_text": summary_text, "id": job_id if images else "", "image_count": len(images)}

    has_pl = bool(pl_data and pl_data.get("history"))
    has_kp = bool(kp_data and kp_data.get("history"))

    if not has_pl and not has_kp:
        return {"found": False, "msg": f"【{query}】的档案库中暂无任何有效记录。"}

    if has_pl and not has_kp:
        summary_text = _format_single_track_summary(pl_data, "PL 玩家")
        img_bytes = _try_render(pl_data, "PL 玩家")
        if img_bytes:
            images.append(img_bytes)
            JOB_CACHE[job_id] = {'status': 'done', 'images': images, 'created': time.time()}
        return {"found": True, "data": pl_data, "summary_text": summary_text, "id": job_id if images else "", "image_count": len(images)}
    elif has_kp and not has_pl:
        summary_text = _format_single_track_summary(kp_data, "KP 主持")
        img_bytes = _try_render(kp_data, "KP 主持")
        if img_bytes:
            images.append(img_bytes)
            JOB_CACHE[job_id] = {'status': 'done', 'images': images, 'created': time.time()}
        return {"found": True, "data": kp_data, "summary_text": summary_text, "id": job_id if images else "", "image_count": len(images)}

    target_name = (pl_data or kp_data).get("target", clean_q)
    qq_str = (pl_data or kp_data).get("qq") or "未知"
    lines = [
        f"【📖 跑团成长双轨档案 | {target_name}】",
        f"🔢 识别账号: {qq_str}",
        "",
        f"───【 PL 玩家成长轨迹 ({pl_data.get('total_records', 0)} 次) 】───",
        _format_track_content_lines(pl_data),
        "",
        f"───【 KP 主持成长轨迹 ({kp_data.get('total_records', 0)} 次) 】───",
        _format_track_content_lines(kp_data),
        "",
        "💡 提示: 可使用【.风格 档案 <目标> pl】或【... kp】单独调阅单轨完整历史。"
    ]
    summary_text = "\n".join(lines)
    
    # 双轨均存在时，依次渲染 PL 与 KP 档案图
    img_pl = _try_render(pl_data, "PL 玩家")
    img_kp = _try_render(kp_data, "KP 主持")
    if img_pl:
        images.append(img_pl)
    if img_kp:
        images.append(img_kp)
    if images:
        JOB_CACHE[job_id] = {'status': 'done', 'images': images, 'created': time.time()}

    return {
        "found": True,
        "data": {
            "target": target_name,
            "qq": qq_str,
            "pl": pl_data,
            "kp": kp_data,
            "summary_text": summary_text
        },
        "summary_text": summary_text,
        "id": job_id if images else "",
        "image_count": len(images)
    }


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

def _normalize_qq(value) -> str:
    """从 QQ:123、纯数字等字段中提取 QQ 号，排除 OpenQQ 标识。"""
    text = str(value or "").strip()
    if text.startswith(('OpenQQ:', 'OpenQQCH:', 'OpenQQ-Member-T:', 'OpenQQ-Group:')):
        return ""
    if '-' in text and any(c.isalpha() for c in text):
        return ""
    match = re.search(r'(?:QQ\s*[:：]\s*)?([1-9]\d{4,11})', text, re.IGNORECASE)
    return match.group(1) if match else ""

def apply_identity_bindings(text: str, identity_bindings: dict) -> str:
    """将日志文本中的 OpenQQ 标识精准替换为绑定的真实 QQ 号/群号。"""
    if not text or not identity_bindings or not isinstance(identity_bindings, dict):
        return text
    sorted_keys = sorted(identity_bindings.keys(), key=lambda k: len(str(k)), reverse=True)
    for official_id in sorted_keys:
        real_qq = str(identity_bindings[official_id] or '').strip()
        real_qq = re.sub(r'^(?:QQ|QQ-Group)\s*[:：]\s*', '', real_qq, flags=re.IGNORECASE).strip()
        official_str = str(official_id or '').strip()
        if not official_str or not real_qq:
            continue
        text = text.replace(official_str, real_qq)
    return text

def _normalize_speaker_name(value) -> str:
    text = str(value or "").strip().casefold()
    text = re.sub(r'^[<＜【\[]+|[>＞】\]]+$', '', text).strip()
    return re.sub(r'[\s·•・._\-—]+', '', text)

def _extract_log_identities(log_text: str) -> dict:
    """提取发言者的“QQ -> 昵称集合”；QQ 不明时单独保留精确昵称。"""
    by_qq = {}
    names_without_qq = set()

    def add(name, qq=""):
        clean_name = str(name or "").strip()
        normalized_name = _normalize_speaker_name(clean_name)
        normalized_qq = _normalize_qq(qq)
        if not normalized_name or normalized_name in ('?', '未知'):
            return
        if normalized_qq:
            by_qq.setdefault(normalized_qq, set()).add(clean_name)
        else:
            names_without_qq.add(clean_name)

    # 海豹标准 JSON / 微在吗原始 JSON：直接读取结构化身份，骰娘消息不算玩家身份。
    stripped = str(log_text or "").lstrip('﻿ \t\r\n')
    if stripped.startswith(('{', '[')):
        try:
            payload = json.loads(stripped)
            if isinstance(payload, dict):
                items = payload.get('items', []) or (payload.get('data', {}) or {}).get('items', [])
            elif isinstance(payload, list):
                items = payload
            else:
                items = []
            for item in items:
                if not isinstance(item, dict) or item.get('isDice') is True:
                    continue
                qq = item.get('IMUserId') or item.get('userId') or item.get('user_id') or item.get('uniformId')
                add(item.get('nickname') or item.get('name'), qq)
        except (ValueError, TypeError):
            pass

    qq_header_patterns = (
        # QQ 导出的文本 Log：角色名(123456789) 2023-01-02 12:34:56
        re.compile(r'^\s*(.{1,80}?)\s*[（(]\s*(?:QQ\s*[:：]\s*)?([1-9]\d{4,11})\s*[）)]\s+(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}:\d{2})'),
        # 格式化后的身份：角色名(123456789): 消息 / 角色名[QQ:123456789]: 消息
        re.compile(r'^\s*(.{1,80}?)\s*[（(\[]\s*(?:QQ\s*[:：]\s*)?([1-9]\d{4,11})\s*[）)\]]\s*[:：]'),
        re.compile(r'^\s*(.{1,80}?)\s+QQ\s*[:：]\s*([1-9]\d{4,11})\s*[:：]'),
    )
    angle_pattern = re.compile(r'(?:^|\s)<([^<>]{1,80})>')
    plain_speaker_pattern = re.compile(r'^\s*([^:：<>]{1,80}?)\s*[:：]')

    for raw_line in str(log_text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        found_qq = False
        for pattern in qq_header_patterns:
            match = pattern.search(line)
            if match:
                add(match.group(1), match.group(2))
                found_qq = True
                break
        if found_qq:
            continue
        angle = angle_pattern.search(line)
        if angle:
            inner = angle.group(1).strip()
            inner_qq = re.match(r'^(.*?)\s*[（(]\s*(?:QQ\s*[:：]\s*)?([1-9]\d{4,11})\s*[）)]$', inner)
            if inner_qq:
                add(inner_qq.group(1), inner_qq.group(2))
            else:
                add(inner)
            continue
        plain = plain_speaker_pattern.match(line)
        if plain and not re.fullmatch(r'\d{1,2}', plain.group(1).strip()):
            add(plain.group(1))

    return {'by_qq': by_qq, 'names_without_qq': names_without_qq}

def find_matching_cards(log_text: str, user_key: str = "", threshold: float = 0.88) -> list:
    """先以 Log 中的 QQ 限定持有者卡库，再在该库内匹配角色名。

    有 QQ 时绝不跨 QQ 命中；没有 QQ 的旧 Log 只允许发言者姓名精确匹配，
    不再用“卡名是整份日志子串”的宽松规则。
    """
    if not log_text:
        return []
    identities = _extract_log_identities(log_text)
    by_qq = identities['by_qq']
    name_only = {_normalize_speaker_name(name) for name in identities['names_without_qq']}
    cards = load_user_cards(user_key)
    if not cards and user_key:
        cards = load_user_cards("")

    matched = []
    cards_by_owner = {}
    for card in cards:
        name = str(card.get('name') or '').strip()
        if not name or name == '未知':
            continue
        owner = _normalize_qq(_card_owner(card))
        if owner:
            cards_by_owner.setdefault(owner, []).append(card)

    if by_qq:
        for qq, speaker_names in by_qq.items():
            owner_cards = cards_by_owner.get(qq, [])
            if not owner_cards:
                continue
            normalized_speakers = {_normalize_speaker_name(name) for name in speaker_names}
            exact = [card for card in owner_cards if _normalize_speaker_name(card.get('name')) in normalized_speakers]
            if exact:
                matched.extend((card, 1.0) for card in exact)
                continue

            scored = []
            for card in owner_cards:
                score = max((_name_similarity(card.get('name', ''), speaker) for speaker in speaker_names), default=0.0)
                scored.append((card, score))
            scored.sort(key=lambda item: item[1], reverse=True)
            # 同一 QQ 多卡时，只接受明显唯一的高相似度候选；单卡库可由 QQ 唯一确定。
            if len(owner_cards) == 1:
                matched.append((owner_cards[0], max(scored[0][1], 0.80)))
            elif scored and scored[0][1] >= threshold:
                runner_up = scored[1][1] if len(scored) > 1 else 0.0
                if scored[0][1] - runner_up >= 0.08:
                    matched.append(scored[0])
    else:
        # 无 QQ 的旧格式无法确认持有者，因此只做发言者名字的严格等值匹配。
        for card in cards:
            if _normalize_speaker_name(card.get('name')) in name_only:
                matched.append((card, 1.0))

    deduplicated = []
    seen = set()
    for card, score in sorted(matched, key=lambda item: item[1], reverse=True):
        identity = (_card_owner(card), str(card.get('name') or '').strip())
        if identity in seen:
            continue
        seen.add(identity)
        deduplicated.append(card)
        if len(deduplicated) >= 6:
            break
    return deduplicated

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
        if c.get("appearance"):
            lines.append(f"外貌：{str(c['appearance']).strip()[:500]}")
        if c.get("personality"):
            lines.append(f"性格：{str(c['personality']).strip()[:300]}")
        if c.get("attributes"):
            raw_attrs = c["attributes"]
            attrs = " / ".join(f"{k} {v}" for k, v in raw_attrs.items()) if isinstance(raw_attrs, dict) else str(raw_attrs).strip()
            if len(attrs) > 400: attrs = attrs[:400] + "..."
            lines.append(f"属性：{attrs}")
        if c.get("skills"):
            raw_skills = c["skills"]
            sk = " / ".join(f"{k} {v}" for k, v in raw_skills.items()) if isinstance(raw_skills, dict) else str(raw_skills).strip()
            if len(sk) > 400: sk = sk[:400] + "..."
            lines.append(f"技能：{sk}")
        if c.get("weapons"):
            weapon_names = [str(item.get("name", "")).strip() for item in c["weapons"] if isinstance(item, dict)]
            weapon_names = [name for name in weapon_names if name]
            if weapon_names:
                lines.append(f"武器：{'、'.join(weapon_names[:12])}")
        if c.get("items"):
            item_names = [str(item.get("name", "")).strip() for item in c["items"] if isinstance(item, dict)]
            item_names = [name for name in item_names if name]
            if item_names:
                lines.append(f"道具：{'、'.join(item_names[:20])}")
        if c.get("background"):
            bg = c["background"].strip()
            if len(bg) > 800: bg = bg[:800] + "..."
            lines.append(f"背景故事：{bg}")
    return "\n".join(lines)

# 从 AI 评分文本 + 表格原文中抽取属性/技能/背景（宽松匹配）
def parse_sheet_full_fields(sheet_raw_text: str, ai_result_text: str) -> dict:
    """在评分结果之外，再抽取属性/技能/背景故事三个原文字段以便持久化。"""
    data = {"attributes": "", "skills": "", "background": "", "appearance": "", "personality": ""}

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
        def _grab_labeled_value(labels, limit=500):
            normalized_labels = sorted((str(label).strip().lower() for label in labels), key=len, reverse=True)
            for line in raw.splitlines():
                cells = [part.strip() for part in re.split(r'[|]', line) if part.strip()]
                for index, cell in enumerate(cells):
                    lowered = cell.lower().replace(':', '').replace('：', '').strip()
                    if not any(lowered == label or lowered.startswith(label + ' ') for label in normalized_labels):
                        continue
                    for candidate in cells[index + 1:]:
                        if candidate and candidate.lower() not in normalized_labels and not re.fullmatch(r'-?\d+(?:\.\d+)?', candidate):
                            return candidate[:limit]
            label_expr = '|'.join(re.escape(label) for label in normalized_labels)
            match = re.search(rf'(?:{label_expr})\s*[:：]?\s*([^\n|]+)', raw, re.IGNORECASE)
            return match.group(1).strip()[:limit] if match else ''
        data["appearance"] = _grab_labeled_value(("外貌", "外表", "外观", "形象", "形象描述", "外貌描述", "外观描述", "服装", "穿着"))
        data["personality"] = _grab_labeled_value(("性格", "个性", "人格"))
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
    if not data["appearance"]:
        data["appearance"] = _grab(["外貌", "外表", "外观", "形象", "形象描述", "外貌描述", "外观描述", "服装", "穿着"], ai_result_text or "")
    if not data["personality"]:
        data["personality"] = _grab(["性格", "个性", "人格"], ai_result_text or "")
    return data
# ==========================================================

app = Flask(__name__)
client = OpenAI(api_key=AI_API_KEY, base_url=AI_BASE_URL)
# 备用模型客户端（默认配置仍兼容原 DeepSeek）
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
executor = ThreadPoolExecutor(max_workers=4) # 文件分析与图片排版队列
review_executor = ThreadPoolExecutor(
    max_workers=max(1, min(16, int(os.environ.get('LOGAI_REVIEW_WORKERS', '8'))))
) # 跑团复盘单独排队，避免卡住统计图等普通任务
JOB_CACHE = {} # 存储任务状态和结果
COMIC_STORE_DIR = os.getenv("LOGAI_COMIC_STORE_DIR", "logai_comics")

def _comic_job_dir(job_id):
    """Return a confined permanent directory for a comic job id."""
    safe_id = re.sub(r'[^a-zA-Z0-9_-]', '', str(job_id or ''))
    if not safe_id or safe_id != str(job_id or ''):
        return None
    return os.path.join(COMIC_STORE_DIR, safe_id)

def _persist_comic_job(job_id, images, metadata=None):
    path = _comic_job_dir(job_id)
    if not path:
        raise ValueError('无效的漫画任务 ID')
    os.makedirs(path, exist_ok=True)
    for index, image in enumerate(images or []):
        with open(os.path.join(path, f'page_{index}.png'), 'wb') as stream:
            stream.write(image)
    info = dict(metadata or {})
    info.update({'status': 'done', 'image_count': len(images or []), 'job_id': str(job_id)})
    with open(os.path.join(path, 'meta.json'), 'w', encoding='utf-8') as stream:
        json.dump(info, stream, ensure_ascii=False, indent=2)

def _load_persisted_comic_job(job_id):
    path = _comic_job_dir(job_id)
    if not path:
        return None
    meta_path = os.path.join(path, 'meta.json')
    try:
        with open(meta_path, 'r', encoding='utf-8') as stream:
            info = json.load(stream)
        if info.get('status') != 'done':
            return None
        info['store_dir'] = path
        return info
    except Exception:
        return None


def _comic_cache_key(log_text, pages, style, character_bible=''):
    """Build a stable key for identical source Log + comic settings."""
    material = '\n'.join([
        COMIC_PROMPT_VERSION,
        COMIC_STORYBOARD_MODEL,
        str(int(pages or 6)),
        str(style or COMIC_STYLE_DEFAULT).strip(),
        str(character_bible or '').strip(),
        str(log_text or '').replace('\r\n', '\n').strip(),
    ])
    return hashlib.sha256(material.encode('utf-8', errors='replace')).hexdigest()


def _find_persisted_comic_by_hash(cache_key):
    if not cache_key or not os.path.isdir(COMIC_STORE_DIR):
        return None
    try:
        for entry in os.scandir(COMIC_STORE_DIR):
            if not entry.is_dir():
                continue
            info = _load_persisted_comic_job(entry.name)
            if info and info.get('comic_hash') == cache_key:
                return info
    except Exception:
        return None
    return None


def _find_active_comic_by_hash(cache_key):
    for active_id, job in list(JOB_CACHE.items()):
        if job.get('comic_hash') == cache_key and job.get('status') in ('processing', 'done'):
            return active_id, job
    return None, None

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

# --- 数据获取函数 (优先读本地 raw_logs_store，网络获取后自动持久化) ---
def fetch_weizaima(key, password=None):
    cached = load_raw_log("weizaima", key)
    if cached and isinstance(cached, dict) and ('items' in cached or 'data' in cached):
        return cached

    endpoints = [
        "https://weizaima.com/dice/api/load_data",
        "http://weizaima.com/dice/api/load_data",
    ]
    for url in endpoints:
        try:
            resp = get_session().get(url, params={"key": key, "password": password}, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                if 'data' in data:
                    res_obj = json.loads(zlib.decompress(base64.b64decode(data['data'])).decode('utf-8'))
                    if res_obj:
                        save_raw_log("weizaima", key, res_obj)
                    return res_obj
            elif resp.status_code == 404:
                print(f"[Weizaima] 404: key={key} 未找到或密码错误 (当前尝试: {url})")
        except Exception as e:
            print(f"[Weizaima] 请求异常 ({url}): {e}")
    return None

def format_weizaima_text(log_obj, identity_bindings=None):
    if not log_obj: return ""
    items = log_obj.get('items', []) or log_obj.get('data', {}).get('items', [])
    try:
        items = sorted(items, key=lambda x: int(x.get('time') or 0))
    except Exception:
        pass
    lines = []
    bindings = identity_bindings if isinstance(identity_bindings, dict) else {}
    for item in items[:MAX_LOG_ENTRIES]:
        message = str(item.get('message') or '')
        if not message or "[CQ:image" in message:
            continue
        raw_uid = str(item.get('uniformId') or item.get('IMUserId') or item.get('userId') or '').strip()
        qq = ""
        if bindings and raw_uid:
            if raw_uid in bindings:
                qq = str(bindings[raw_uid]).strip()
            elif ':' in raw_uid and raw_uid.split(':', 1)[1] in bindings:
                qq = str(bindings[raw_uid.split(':', 1)[1]]).strip()
            else:
                for k, v in bindings.items():
                    if k in raw_uid:
                        qq = str(v).strip()
                        break
        if not qq:
            qq = _normalize_qq(item.get('IMUserId') or item.get('userId') or item.get('uniformId'))
        identity = f"{item.get('nickname', '?')}({qq})" if qq else item.get('nickname', '?')
        lines.append(f"{identity}: {message}")
    result = "\n".join(lines)
    if bindings:
        result = apply_identity_bindings(result, bindings)
    return result

def fetch_trpgbot(full_id):
    cached = load_raw_log("trpgbot", full_id)
    if cached and isinstance(cached, str) and cached.strip():
        return cached
    try:
        sid, log_id = full_id.split('-', 1)
        base_url = PAINTER_SERVERS[int(sid)]
        sess = get_session()
        sess.headers.update({"Referer": "https://logpainter.trpgbot.com/"})
        meta = sess.get(f"{base_url}logReader.php", params={"m": "metaData", "id": log_id, "r": 0.1}, timeout=20).json()
        dl_url = meta.get('redirectDownloadUrl') or f"{base_url}logReader.php?m=rawData&id={log_id}"
        res_txt = safe_decode(sess.get(dl_url, timeout=90).content)
        if res_txt:
            save_raw_log("trpgbot", full_id, res_txt)
        return res_txt
    except Exception as e: print(f"TRPGBot Error: {e}"); return None

def fetch_kokona(s3_key):
    cached = load_raw_log("kokona", s3_key)
    if cached and isinstance(cached, str) and cached.strip():
        return cached
    try:
        resp = get_session().get(f"{KOKONA_BASE_URL}{s3_key}", timeout=60)
        if resp.status_code == 200:
            res_txt = safe_decode(resp.content)
            if res_txt:
                save_raw_log("kokona", s3_key, res_txt)
            return res_txt
        return None
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

def _parse_time_str(s):
    """尝试将各种标准/中文日期时间字符串解析为 Unix 秒级时间戳"""
    if not s:
        return None
    s = str(s).strip()
    s = re.sub(r'[年月]', '-', s)
    s = re.sub(r'日', '', s)
    formats = [
        '%Y-%m-%d %H:%M:%S', '%Y-%m-%d %H:%M', '%Y-%m-%d',
        '%Y/%m/%d %H:%M:%S', '%Y/%m/%d %H:%M', '%Y/%m/%d',
        '%Y.%m.%d %H:%M:%S', '%Y.%m.%d %H:%M', '%Y.%m.%d',
        '%Y-%m', '%Y/%m', '%Y.%m',
    ]
    for fmt in formats:
        try:
            return int(time.mktime(datetime.datetime.strptime(s, fmt).timetuple()))
        except Exception:
            pass
    return None

_DATE_PAT = re.compile(r'\b(20\d{2}[-/年.]\d{1,2}[-/月.]\d{1,2}(?:日)?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)\b')

def _detect_log_time_range(raw, text=None):
    """从结构化对象或文本日志中识别起始与终止时间戳 (Unix秒级时间戳)"""
    if isinstance(raw, dict):
        items = raw.get('items', []) or raw.get('data', {}).get('items', [])
        times = [int(it['time']) for it in items if it.get('time')]
        if times:
            return min(times), max(times)
    content = text or (raw if isinstance(raw, str) else '')
    if content:
        # 1. 优先提取显式时间范围表达式（如 "2024-03-15~2024-03-20" 或 "2023-09~2023-10"）
        m_range = re.findall(r'(20\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)', content)
        if m_range:
            ts_list = [_parse_time_str(m) for m in m_range]
            ts_list = [t for t in ts_list if t is not None]
            if ts_list:
                return min(ts_list), max(ts_list)
        # 2. 从多行文本采样中匹配
        lines = content.splitlines()
        found_times = []
        sample_lines = lines[:300] + (lines[-300:] if len(lines) > 300 else [])
        for l in sample_lines:
            m = _DATE_PAT.search(l)
            if m:
                ts = _parse_time_str(m.group(1))
                if ts:
                    found_times.append(ts)
        if found_times:
            return min(found_times), max(found_times)
    return 0, 0

def fetch_and_join_logs(log_sources, key=None, password=None, source=None, identity_bindings=None):
    """读取多个 Log，支持自动剔除重复 Log，按真实时间戳从早到晚严格正序排列，并用明确分隔线拼接。"""
    raw_sources = log_sources if isinstance(log_sources, list) and log_sources else [
        {'key': key, 'password': password, 'source': source}
    ]

    # 1. 键值级自动去重
    sources = []
    seen_keys = set()
    for item in raw_sources:
        item_dict = item if isinstance(item, dict) else {'key': item}
        item_k = str(item_dict.get('key') or '').strip()
        item_s = str(item_dict.get('source') or '').strip().lower()
        dedup_tag = f"{item_s}:{item_k.lower()}" if item_s else item_k.lower()
        if not item_k:
            continue
        if dedup_tag in seen_keys:
            print(f"[Log去重] 发现重复提交的 Log 源: {item_k}，已自动剔除")
            continue
        seen_keys.add(dedup_tag)
        sources.append(item_dict)

    fetched_pieces = []
    failures = []
    seen_texts_hash = set()

    for index, item in enumerate(sources, 1):
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
            text = format_raw_text(raw) if item_source != 'weizaima' else format_weizaima_text(raw, identity_bindings)
            if identity_bindings and text:
                text = apply_identity_bindings(text, identity_bindings)
            if text and text.strip():
                # 内容级哈希去重
                text_hash = hashlib.md5(text.strip().encode('utf-8')).hexdigest()
                if text_hash in seen_texts_hash:
                    print(f"[Log去重] 发现内容完全重复的 Log 段落 ({item_key})，已自动剔除")
                    continue
                seen_texts_hash.add(text_hash)

                start_t, end_t = _detect_log_time_range(raw, text)
                fetched_pieces.append({
                    'key': item_key,
                    'source': item_source,
                    'raw': raw,
                    'text': text.strip(),
                    'start_t': start_t,
                    'end_t': end_t,
                    'orig_idx': index
                })
            else:
                failures.append(f'第{index}段({item_key})读取为空')
        except Exception as exc:
            failures.append(f'第{index}段({item_key})读取失败: {exc}')

    if not fetched_pieces:
        detail = '；'.join(failures)
        raise Exception(f'日志内容获取失败或为空{("：" + detail) if detail else ""}')

    # 按照时间戳从小到大（从早到晚）严格升序排列；无时间戳的置于末尾并保持原相对顺序
    sorted_pieces = sorted(
        fetched_pieces,
        key=lambda p: (0, p['start_t'], p['orig_idx']) if p['start_t'] else (1, p['orig_idx'], p['orig_idx'])
    )

    parts = []
    total = len(sorted_pieces)
    for p_idx, p in enumerate(sorted_pieces, 1):
        time_info = ""
        if p['start_t'] and p['end_t']:
            s_d = time.strftime('%Y-%m-%d', time.localtime(p['start_t']))
            e_d = time.strftime('%Y-%m-%d', time.localtime(p['end_t']))
            time_info = f" ({s_d} ~ {e_d})" if s_d != e_d else f" ({s_d})"
        elif p['start_t']:
            s_d = time.strftime('%Y-%m-%d', time.localtime(p['start_t']))
            time_info = f" ({s_d})"

        if total > 1:
            header = f"【时间线第 {p_idx}/{total} 段: {p['key']}{time_info}】"
        else:
            header = f"【第 1 段 Log: {p['key']}{time_info}】"
        parts.append(f"{header}\n{p['text']}")

    return '\n\n========== Log 时间轴正序拼接分隔线 ==========\n\n'.join(parts), failures

def _log_stat_name_key(value):
    text = str(value or '').strip().casefold()
    text = re.sub(r'\s+SAN\s*\d+.*$', '', text, flags=re.IGNORECASE)
    return re.sub(r'[\s._·•・\-]+', '', text)

def _strip_log_markup(value):
    text = re.sub(r'\[CQ:[^\]]+\]', '', str(value or ''), flags=re.IGNORECASE)
    return re.sub(r'\s+', ' ', text).strip()

def _is_ooc_text(value):
    text = _strip_log_markup(value)
    return bool(re.match(r'^[（(].*[）)]$', text, flags=re.DOTALL))

def _is_log_system_line(value):
    text = _strip_log_markup(value).strip()
    if not text:
        return True
    return bool(
        re.search(r'(?i)d100\s*=\s*\d+\s*/+\s*\d+', text)
        or re.search(r'(?i)(?:1|2)d20(?:kh|kl|优势|劣势)?(?:\s*[+-]\s*\d+)?\s*=\s*\{', text)
        or re.search(r'(?i)SAN\s*CHECK', text)
        or re.match(r'^<[^>]+>.*(?:检定结果|进行了一次|骰点)', text)
        or re.match(r'^骰点结果\s*[:：]', text)
        or re.match(r'^(?:d100\s*=|d20\s*=)', text, flags=re.IGNORECASE)
        or re.match(r'^【(?:大成功|极难成功|困难成功|普通成功|失败|大失败)】', text)
        or re.match(r'^SAN\s*=|^[.。](?:st|rd|ra|rc|sc|rh|rx|r)', text, flags=re.IGNORECASE)
    )

def _explicit_roll_success(value):
    text = _strip_log_markup(value)
    if re.search(r'(?:大失败|失败|未通过|没有成功|不成功)', text):
        return False
    if re.search(r'(?:大成功|极难成功|困难成功|普通成功|成功|通过)', text):
        return True
    return None

def _extract_check_rolls(value):
    """提取 COC D100 与 DND D20 判定；只返回实际出目，不把指令或伤害骰当判定。"""
    text = _strip_log_markup(value)
    rolls, occupied = [], []
    explicit_success = _explicit_roll_success(text)

    for match in re.finditer(r'(?i)d100\s*=\s*(\d+)\s*/+\s*(\d+)', text):
        result = max(1, min(100, int(match.group(1))))
        target = max(1, int(match.group(2)))
        rolls.append({'result': result, 'sides': 100, 'target': target, 'success': result <= target})
        occupied.append(match.span())

    d20_pattern = re.compile(
        r'(?i)(?P<count>[12])d20(?P<keep>kh|kl|优势|劣势)?'
        r'(?:\s*[+-]\s*\d+)?\s*=\s*\{(?P<faces>[^}]+)\}'
    )
    for match in d20_pattern.finditer(text):
        faces = [int(number) for number in re.findall(r'(?<!\d)(?:20|1?\d)(?!\d)', match.group('faces'))]
        faces = [number for number in faces if 1 <= number <= 20]
        if not faces:
            continue
        keep = str(match.group('keep') or '').casefold()
        if keep in ('kl', '劣势'):
            result = min(faces)
        elif keep in ('kh', '优势') or int(match.group('count')) > 1:
            result = max(faces)
        else:
            result = faces[0]
        rolls.append({'result': result, 'sides': 20, 'target': None, 'success': explicit_success})
        occupied.append(match.span())

    for match in re.finditer(r'(?i)(?<!\d)d20\s*=\s*(\d+)(?!\s*[/}])', text):
        if any(start <= match.start() < end for start, end in occupied):
            continue
        result = int(match.group(1))
        if 1 <= result <= 20:
            rolls.append({'result': result, 'sides': 20, 'target': None, 'success': explicit_success})
    return rolls

def _roll_command_count(value):
    text = _strip_log_markup(value)
    if not re.match(r'^[.。](?:r|rd|ra|rc|sc|rh|rx)', text, flags=re.IGNORECASE):
        return 0
    match = re.search(r'(?i)[.。](?:r|rd)?\s*(\d+)\s*#', text)
    return max(1, min(100, int(match.group(1)))) if match else 1

def _median(values):
    ordered = sorted(values)
    size = len(ordered)
    if not size:
        return 0.0
    middle = size // 2
    if size % 2:
        return float(ordered[middle])
    return (ordered[middle - 1] + ordered[middle]) / 2

def calculate_log_statistics(log_text):
    """从标准文本或聊天导出 Log 确定性计算玩家 RP、场外和骰点统计。"""
    header = re.compile(r'^\s*(.*?)\s*[（(]([1-9]\d{4,11})[）)]\s+\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}\s*$')
    normalized_header = re.compile(r'^\s*(.*?)\s*[（(]([1-9]\d{4,11})[）)]\s*[:：]\s*(.*)$')
    angle_header = re.compile(r'^\s*[<【\[(（](?P<name>[^>】\])）\r\n]{1,25})[>】\])）]\s*[:：]?\s*(?P<message>.*)$')
    chat_header = re.compile(
        r'^\s*(?P<name>.+?)\s*[:：]\s*'
        r'(?:(?:20\d{2})[-/.])?\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}:\d{2}\s*$'
    )
    records, current = [], None
    for raw_line in str(log_text or '').splitlines():
        match = header.match(raw_line.strip())
        if match:
            if current: records.append(current)
            current = {'name': match.group(1).strip(), 'qq': match.group(2), 'lines': []}
            continue
        angle = angle_header.match(raw_line.strip())
        if angle:
            if current: records.append(current)
            angle_name = angle.group('name').strip()
            current = {
                'name': angle_name,
                'qq': f'name:{_log_stat_name_key(angle_name)}',
                'lines': [angle.group('message')],
            }
            continue
        normalized = normalized_header.match(raw_line.strip())
        if normalized:
            if current: records.append(current)
            current = {'name': normalized.group(1).strip(), 'qq': normalized.group(2), 'lines': [normalized.group(3)]}
        else:
            chat = chat_header.match(raw_line.strip())
            if chat:
                if current: records.append(current)
                chat_name = chat.group('name').strip()
                current = {'name': chat_name, 'qq': f'name:{_log_stat_name_key(chat_name)}', 'lines': []}
                continue
            if current is not None:
                current['lines'].append(raw_line.rstrip())
    if current: records.append(current)

    excluded = {'严茫熙', '骰娘', 'seal', 'sealdice', 'kp', 'gm', 'dm', '守秘人'}
    players = {}
    aliases = {}
    for record in records:
        name = record['name']
        base_name = re.sub(r'\s+SAN\s*\d+.*$', '', name, flags=re.IGNORECASE).strip()
        name_key = _log_stat_name_key(base_name)
        if name_key in excluded or name_key.startswith(('kp', 'gm', 'dm')):
            continue
        key = record['qq']
        item = players.setdefault(key, {'name': base_name or name, 'qq': key, 'rp': 0, 'outside_chars': 0, 'total_chars': 0, 'rolls': [], 'name_rp': {}, 'aliases': set()})
        aliases[_log_stat_name_key(base_name)] = key
        aliases[_log_stat_name_key(name)] = key
        item['aliases'].update({base_name, name})
        message = _strip_log_markup('\n'.join(line for line in record['lines'] if not _is_log_system_line(line)))
        if message:
            outside = sum(len(part) for part in re.findall(r'[（(]([^（）()]*)[）)]', message))
            if _is_ooc_text(message):
                outside = len(message)
            item['outside_chars'] += outside
            item['total_chars'] += len(message)
            record_rp = max(0, len(message) - outside)
            item['rp'] += record_rp
            item['name_rp'][base_name or name] = item['name_rp'].get(base_name or name, 0) + record_rp

    pending_key, pending_remaining = '', 0
    actor_pattern = re.compile(r'(?:<([^>]+)>|^\s*\[([^\]]+)\])')
    for record in records:
        raw_message = '\n'.join(record['lines'])
        record_key = record['qq'] if record['qq'] in players else ''
        command_count = _roll_command_count(raw_message)
        if command_count and record_key:
            pending_key, pending_remaining = record_key, command_count
            continue
        extracted_rolls = _extract_check_rolls(raw_message)
        if not extracted_rolls:
            continue
        actor_match = actor_pattern.search(raw_message)
        actor = next((group for group in actor_match.groups() if group), '') if actor_match else ''
        actor_key = aliases.get(_log_stat_name_key(actor)) if actor else ''
        target_key = actor_key or pending_key or record_key
        if target_key not in players:
            continue
        if actor:
            players[target_key]['aliases'].add(actor)
            aliases[_log_stat_name_key(actor)] = target_key
        players[target_key]['rolls'].extend(extracted_rolls)
        if pending_key == target_key:
            pending_remaining = max(0, pending_remaining - len(extracted_rolls))
            if pending_remaining == 0:
                pending_key = ''

    result = []
    for item in players.values():
        if item['name_rp']:
            item['name'] = max(item['name_rp'], key=item['name_rp'].get)
        rolls = item.pop('rolls')
        count = len(rolls)
        known_rolls = [roll for roll in rolls if roll.get('success') is not None]
        successes = sum(1 for roll in known_rolls if roll.get('success'))
        success_rate = successes / len(known_rolls) if known_rolls else None
        normalized_results = []
        for roll in rolls:
            sides = max(2, int(roll.get('sides') or 100))
            raw_score = (roll['result'] - 1) / (sides - 1)
            normalized_results.append(1 - raw_score if sides == 100 else raw_score)
        result_score = sum(normalized_results) / count if count else 0.0
        raw_results = [roll['result'] for roll in rolls]
        outside_chars = item.pop('outside_chars', 0)
        item['outside'] = round(outside_chars / item['total_chars'] * 100, 1) if item['total_chars'] else 0.0
        item.pop('total_chars', None)
        item['rolls'] = count
        item['roll_average'] = round(sum(raw_results) / count, 1) if count else 0.0
        item['roll_median'] = round(_median(raw_results), 1) if count else 0.0
        item['roll_successes'] = successes
        item['roll_success_known'] = len(known_rolls)
        item['roll_success_rate'] = round(success_rate * 100, 1) if success_rate is not None else None
        luck_score = success_rate * 0.75 + result_score * 0.25 if success_rate is not None else result_score
        item['roll_luck'] = round(luck_score * 100) if count else 0
        item['aliases'] = sorted(alias for alias in item.pop('aliases') if alias)
        item.pop('name_rp', None)
        result.append(item)
    return result

def format_log_statistics_for_prompt(statistics):
    """将后端确定性统计作为只读上下文提供给 LLM，不允许 LLM 改写。"""
    if not statistics:
        return "\n\n【后端统计】：未识别到可解析的玩家消息，六维评分请不要臆造玩家数据。"
    lines = ["\n\n【后端确定性统计（只读，不得修改）】：", "以下 RP 字数、场外占比、骰点次数、平均值、中位数、成功率和骰点幸运值由程序逐条解析原始 Log 得出。请只用它们理解玩家投入程度和骰运，不要在正文中重新估算。"]
    for item in statistics:
        known = item.get('roll_success_known', 0)
        success_text = f"成功 {item.get('roll_successes', 0)}/{known}（{item.get('roll_success_rate', 0):.1f}%）" if known else "成功率未知"
        lines.append(
            f"- {item.get('name', '未知')}：RP {item.get('rp', 0)} 字，场外 {item.get('outside', 0):.1f}%，"
            f"骰点 {item.get('rolls', 0)} 次，均值 {item.get('roll_average', 0):.1f}，中位数 {item.get('roll_median', 0):.1f}，"
            f"{success_text}，骰运 {item.get('roll_luck', 0)}/100"
        )
    return '\n'.join(lines)


def _clean_extracted_name(name):
    """清洗行头中提取的名字，剥离残留的时间戳、括号、SAN值等噪声。"""
    cleaned = re.sub(r'^\s*\[?(?:(?:20\d{2})[-/.])?\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*', '', str(name or '')).strip()
    cleaned = re.sub(r'^\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*', '', cleaned).strip()
    brackets = [('【', '】'), ('[', ']'), ('<', '>'), ('（', '）'), ('(', ')')]
    cleaned = cleaned.strip(' :：')
    for b_open, b_close in brackets:
        if cleaned.startswith(b_open) and cleaned.endswith(b_close):
            cleaned = cleaned[1:-1].strip(' :：')
    return cleaned

def extract_log_roster(log_text):
    """
    从跑团 Log 开篇提取 KP 与 PL/PC 阵容映射表。
    支持：
    KP：林一 / KP: 林一
    PL：air(雅恩·加奈切) 镜离(卡修斯·米德尔顿) 亡言(卡罗姆·考特) 黎攸(佐伊·贝尔)
    返回: (roster_map, identities)
    """
    first_lines = str(log_text or '').splitlines()[:150]
    first_chunk = "\n".join(first_lines)

    roster_map = {}
    identities = {}

    m_kp = re.search(r'(?i)(?:KP|主持人|守秘人|GM|DM)\s*[:：]\s*([^\r\n]+)', first_chunk)
    if m_kp:
        kp_raw = m_kp.group(1).strip()
        kp_name = re.split(r'[\s/／,，]+', kp_raw)[0].strip()
        if kp_name and kp_name.upper() not in ('PL', 'PC'):
            kp_id = "roster:KP"
            aliases = {'KP', 'kp', '守秘人', '主持人', kp_name}
            identities[kp_id] = {
                'role': 'KP',
                'display': f"KP({kp_name})",
                'player': kp_name,
                'char_full': kp_name,
                'char_short': kp_name,
                'aliases': aliases
            }
            for a in aliases:
                roster_map[_log_stat_name_key(a)] = kp_id

    pl_matches = re.finditer(r'([^\s:：()（）<>{}\[\]]+)\s*[(（]([^\s:：()（）<>{}\[\]]+)[)）]', first_chunk)
    for m in pl_matches:
        p_name = m.group(1).strip()
        c_full = m.group(2).strip()
        # 严格排除纯数字（如 QQ 号）、时间戳、网址，避免将聊天行头误识别为出场人设
        if re.fullmatch(r'\d+', p_name) or re.fullmatch(r'\d+', c_full):
            continue
        if re.search(r'^\d{1,2}:\d{2}', c_full) or c_full.startswith(('http', 'https')):
            continue
        c_short = re.split(r'[·.・\s-]', c_full)[0] if re.search(r'[·.・\s-]', c_full) else c_full
        if p_name.upper() not in ('KP', 'PL', 'PC', 'GM', 'DM') and len(p_name) <= 15 and len(c_full) <= 30:
            pl_id = f"roster:{p_name}"
            aliases = {p_name, c_full, c_short}
            identities[pl_id] = {
                'role': 'PL',
                'display': f"{p_name}({c_full})",
                'player': p_name,
                'char_full': c_full,
                'char_short': c_short,
                'aliases': aliases
            }
            for a in aliases:
                roster_map[_log_stat_name_key(a)] = pl_id

    return roster_map, identities

def match_target_identity(all_names_with_qq, target_user, qq_counts=None):
    """
    根据 target_user (QQ 或 昵称/角色名，支持前缀、后缀、模糊匹配)，
    在日志提取的候选用户列表中进行定位。
    返回: (matched_qq, matched_display_name, matched_aliases)
    """
    target = str(target_user or '').strip()
    target = re.sub(r'^(?:QQ[:：])?', '', target, flags=re.IGNORECASE).strip()
    if not target:
        return None, "", set()

    counts = qq_counts or {}

    # 1. 尝试纯数字 QQ 匹配 (5-12位)
    clean_qq = re.sub(r'\D', '', target)
    if clean_qq and len(clean_qq) in range(5, 13):
        if clean_qq in all_names_with_qq:
            aliases = all_names_with_qq[clean_qq]
            disp = sorted(list(aliases))[0] if aliases else clean_qq
            return clean_qq, disp, set(aliases)
        else:
            return clean_qq, clean_qq, {clean_qq}

    target_key = _log_stat_name_key(target)
    if not target_key:
        return None, target, {target}

    # 2. 昵称精确匹配 (完全一致)
    exact_matches = []
    for qq, names in all_names_with_qq.items():
        for name in names:
            if _log_stat_name_key(name) == target_key:
                exact_matches.append((qq, name, names))
    if exact_matches:
        exact_matches.sort(key=lambda x: counts.get(x[0], 0), reverse=True)
        best = exact_matches[0]
        return best[0], best[1], set(best[2])

    # 3. 前缀 / 后缀匹配 (如输 "墨菲斯" 匹配 "守秘人-墨菲斯"；输 "严" 匹配 "严茫熙")
    prefix_suffix_matches = []
    for qq, names in all_names_with_qq.items():
        for name in names:
            nk = _log_stat_name_key(name)
            if not nk: continue
            if nk.startswith(target_key) or nk.endswith(target_key) or target_key.startswith(nk) or target_key.endswith(nk):
                prefix_suffix_matches.append((qq, name, names))
    if prefix_suffix_matches:
        prefix_suffix_matches.sort(key=lambda x: counts.get(x[0], 0), reverse=True)
        best = prefix_suffix_matches[0]
        return best[0], best[1], set(best[2])

    # 4. 子串包含匹配 (如 "瓦伦汀" in "肖恩.瓦伦汀")
    substr_matches = []
    for qq, names in all_names_with_qq.items():
        for name in names:
            nk = _log_stat_name_key(name)
            if not nk: continue
            if target_key in nk or nk in target_key:
                substr_matches.append((qq, name, names))
    if substr_matches:
        substr_matches.sort(key=lambda x: counts.get(x[0], 0), reverse=True)
        best = substr_matches[0]
        return best[0], best[1], set(best[2])

    # 5. 未能直接匹配
    return None, target, {target}

def parse_target_identifiers(target_input):
    """解析并提取目标用户标识列表，支持单个/列表、逗号、顿号、斜杠、空格分隔。自动过滤系统生成的OpenQQ等通道内部ID。"""
    if not target_input:
        return []
    if isinstance(target_input, (list, tuple, set)):
        items = []
        for x in target_input:
            items.extend(parse_target_identifiers(x))
        return items

    s = str(target_input).strip()
    s = re.sub(r'^(?:QQ[:：])?', '', s, flags=re.IGNORECASE).strip()
    if not s:
        return []

    parts = re.split(r'[,，;；/、|\n]+', s)
    result = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        subparts = [sp.strip() for sp in p.split() if sp.strip()]
        target_candidates = subparts if len(subparts) > 1 else [p]
        for item in target_candidates:
            clean = re.sub(r'^(?:QQ[:：])?', '', item, flags=re.IGNORECASE).strip()
            if re.match(r'^OpenQQ(?::|CH:)[0-9a-zA-Z]+$', clean, re.IGNORECASE):
                continue
            if clean and clean not in result:
                result.append(clean)
    return result

def extract_player_profile_and_stats(log_text, target_user, user_name=None):
    """
    专门针对目标用户（支持 QQ 号、玩家名、角色昵称/前缀/后缀/模糊搜索，支持多标识联合匹配及成品剧本Log对号）
    提取其在 Log 中的发言、别名、RP/OOC统计及骰点数据。
    """
    records = []
    current = None
    all_qq_names = {}
    qq_counts = {}
    name_counts = {}

    roster_map, identities = extract_log_roster(log_text)

    header_patterns = [
        re.compile(r'^\s*(.*?)\s*[（(<]([1-9]\d{4,11})[）)>]\s+(?:(?:20\d{2})[-/.])?\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s*$'),
        re.compile(r'^\s*(.*?)\s*[（(<]([1-9]\d{4,11})[）)>]\s*[:：]\s*(.*)$'),
    ]
    chat_pattern = re.compile(r'^\s*(.*?)\s*[:：]\s*(?:(?:20\d{2})[-/.])?\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s*$')
    bracket_head = re.compile(r'^\s*[<【\[(（](?P<name>[^>】\])）\r\n]{1,25})[>】\])）]\s*[:：]?\s*(?P<msg>.*)$')
    colon_head = re.compile(r'^\s*(?P<name>KP|PL|DM|GM|守密人|调查员|[^\s:：]{2,15})\s*[:：]\s*(?P<msg>.*)$')

    noise_names = {'http', 'https', 'file', '微灾码', 'STONY GROUNDS', '材料一', '材料二', '材料三', '材料四', '附录'}

    for raw_line in str(log_text or '').splitlines():
        line_str = raw_line.strip()
        is_head = False
        
        for pat in header_patterns:
            m = pat.match(line_str)
            if m:
                if current: records.append(current)
                before = m.group(1).strip()
                qq = m.group(2)
                content = m.group(3).strip() if m.lastindex >= 3 and m.group(3) else ""
                name = _clean_extracted_name(before) or f"用户({qq})"
                all_qq_names.setdefault(qq, set()).add(name)
                qq_counts[qq] = qq_counts.get(qq, 0) + 1
                name_counts[name] = name_counts.get(name, 0) + 1
                current = {'name': name, 'qq': qq, 'lines': [content] if content else []}
                is_head = True
                break

        if not is_head:
            m = re.search(r'[\u0028\uFF08<]([1-9]\d{4,11})[\u0029\uFF09>]', line_str)
            if m:
                before = line_str[:m.start()].strip()
                qq = m.group(1)
                after = line_str[m.end():].strip()
                has_time = bool(re.search(r'\d{1,2}:\d{2}', line_str))
                has_colon = bool(re.search(r'^[:：]', after))
                if has_time or has_colon or len(after) == 0:
                    name = _clean_extracted_name(before) or f"用户({qq})"
                    all_qq_names.setdefault(qq, set()).add(name)
                    qq_counts[qq] = qq_counts.get(qq, 0) + 1
                    name_counts[name] = name_counts.get(name, 0) + 1
                    content = re.sub(r'^[:：]\s*', '', after).strip()
                    if current: records.append(current)
                    current = {'name': name, 'qq': qq, 'lines': [content] if content else []}
                    is_head = True

        if not is_head:
            mc = chat_pattern.match(line_str)
            if mc:
                if current: records.append(current)
                c_name = _clean_extracted_name(mc.group(1).strip())
                name_counts[c_name] = name_counts.get(c_name, 0) + 1
                current = {'name': c_name, 'qq': None, 'lines': []}
                is_head = True

        if not is_head:
            mb = bracket_head.match(line_str)
            if mb:
                b_raw = mb.group('name').strip()
                if not re.match(r'^\d+$', b_raw) and b_raw not in noise_names:
                    if current: records.append(current)
                    c_name = _clean_extracted_name(b_raw)
                    msg = mb.group('msg').strip()
                    name_counts[c_name] = name_counts.get(c_name, 0) + 1
                    current = {'name': c_name, 'qq': None, 'lines': [msg] if msg else []}
                    is_head = True

        if not is_head:
            mcol = colon_head.match(line_str)
            if mcol:
                col_raw = mcol.group('name').strip()
                if col_raw not in noise_names and not col_raw.startswith(('http', 'ftp')):
                    if current: records.append(current)
                    c_name = _clean_extracted_name(col_raw)
                    msg = mcol.group('msg').strip()
                    name_counts[c_name] = name_counts.get(c_name, 0) + 1
                    current = {'name': c_name, 'qq': None, 'lines': [msg] if msg else []}
                    is_head = True

        if not is_head and current is not None:
            current['lines'].append(raw_line.rstrip())

    if current:
        records.append(current)

    is_finished_log = (len(all_qq_names) == 0 and len(records) > 0)

    # 规整所有目标项（支持空格、全角/半角逗号、顿号、斜杠等分隔的多目标）
    target_list = parse_target_identifiers(target_user)
    if not target_list:
        raw_s = str(target_user or '').strip()
        clean_raw = re.sub(r'^(?:QQ[:：])?', '', raw_s, flags=re.IGNORECASE).strip()
        if clean_raw and not re.match(r'^OpenQQ(?::|CH:)[0-9a-zA-Z]+$', clean_raw, re.IGNORECASE):
            target_list = [clean_raw]

    explicit_target_qqs = set()
    internal_target_qqs = set()
    matched_aliases = set()
    display_names = []

    for item in target_list:
        t = re.sub(r'^(?:QQ[:：])?', '', str(item).strip(), flags=re.IGNORECASE).strip()
        clean_qq = re.sub(r'\D', '', t)
        is_pure_qq = bool(clean_qq and len(clean_qq) in range(5, 13) and clean_qq == t)

        if is_pure_qq:
            explicit_target_qqs.add(clean_qq)
            internal_target_qqs.add(clean_qq)
            if clean_qq in all_qq_names:
                names = all_qq_names[clean_qq]
                matched_aliases.update(names)
                disp = sorted(list(names))[0] if names else clean_qq
                if disp not in display_names: display_names.append(disp)
            elif is_finished_log and user_name:
                u_key = _log_stat_name_key(user_name)
                if u_key in roster_map:
                    ident = identities[roster_map[u_key]]
                    matched_aliases.update(ident['aliases'])
                    if ident['display'] not in display_names: display_names.append(ident['display'])
                else:
                    for n in name_counts:
                        nk = _log_stat_name_key(n)
                        if nk == u_key or u_key in nk or nk in u_key:
                            matched_aliases.add(n)
                            if n not in display_names: display_names.append(n)
                            break
            else:
                matched_aliases.add(clean_qq)
                if clean_qq not in display_names: display_names.append(clean_qq)
        else:
            t_key = _log_stat_name_key(t)
            found_this = False
            if t_key:
                # 1. 优先检查 roster_map (剧本出场名单表中的映射)
                if t_key in roster_map:
                    ident = identities[roster_map[t_key]]
                    matched_aliases.update(ident['aliases'])
                    if ident['display'] not in display_names: display_names.append(ident['display'])
                    found_this = True
                else:
                    for k, ident_id in roster_map.items():
                        if t_key in k or k in t_key:
                            ident = identities[ident_id]
                            matched_aliases.update(ident['aliases'])
                            if ident['display'] not in display_names: display_names.append(ident['display'])
                            found_this = True
                            break

                # 2. 检查 all_qq_names (带 QQ 的传统日志)
                if not found_this and all_qq_names:
                    m_q, m_d, m_a = match_target_identity(all_qq_names, t, qq_counts)
                    if m_q:
                        internal_target_qqs.add(m_q)
                        matched_aliases.update(m_a)
                        clean_disp = m_d if m_d and not re.search(r'^\d+$|^用户\(\d+\)$', m_d) else t
                        if clean_disp not in display_names: display_names.append(clean_disp)
                        found_this = True
                    elif m_a != {t}:
                        matched_aliases.update(m_a)
                        clean_disp = m_d if m_d and not re.search(r'^\d+$|^用户\(\d+\)$', m_d) else t
                        if clean_disp not in display_names: display_names.append(clean_disp)
                        found_this = True

                # 3. 检查 name_counts (成品日志发言人频次表)
                if not found_this and name_counts:
                    for n in sorted(name_counts.keys(), key=lambda x: name_counts[x], reverse=True):
                        nk = _log_stat_name_key(n)
                        if nk == t_key or t_key in nk or nk in t_key:
                            matched_aliases.add(n)
                            if n not in display_names: display_names.append(n)
                            found_this = True
                            break

            if not found_this:
                matched_aliases.add(t)
                if t not in display_names: display_names.append(t)

    # 综合 display_name 与 primary clean_target_qq
    primary_qq = sorted(list(explicit_target_qqs))[0] if explicit_target_qqs else None
    if display_names:
        uniq_names = []
        seen_keys = set()
        brackets = [('【', '】'), ('[', ']'), ('<', '>'), ('（', '）'), ('(', ')')]
        for d in display_names:
            clean_d = re.sub(r'[\(（](?:QQ[:：])?\d{5,12}[\)）]', '', str(d)).strip(' :：')
            for b_open, b_close in brackets:
                if clean_d.startswith(b_open) and clean_d.endswith(b_close):
                    clean_d = clean_d[1:-1].strip(' :：')
            if not clean_d or clean_d in explicit_target_qqs or clean_d in internal_target_qqs or re.fullmatch(r'\d+', clean_d) or clean_d in ('用户', '玩家') or str(d).startswith(('用户(', '用户（')):
                continue
            k = _log_stat_name_key(clean_d)
            if k and k not in seen_keys:
                seen_keys.add(k)
                uniq_names.append(clean_d)
        if uniq_names:
            display_name = " / ".join(uniq_names)
        else:
            display_name = primary_qq or " / ".join(target_list)
    else:
        display_name = primary_qq or " / ".join(target_list)

    # 筛选目标发言（只要命中了任一内部目标 QQ 或目标别名即合并聚合）
    target_name_keys = {_log_stat_name_key(a) for a in matched_aliases if a}
    target_records = []
    for r in records:
        if r.get('qq') and r.get('qq') in internal_target_qqs:
            target_records.append(r)
        elif r.get('name') and _log_stat_name_key(r.get('name')) in target_name_keys:
            target_records.append(r)

    aliases = set(matched_aliases)
    total_chars = 0
    rp_chars = 0
    ooc_chars = 0
    message_count = len(target_records)

    kp_keywords = {'kp', 'dm', 'gm', '守秘人', '主持人', '旁白', 'st', 'storyteller'}
    kp_score = 0
    all_rolls = []

    for r in target_records:
        name = r.get('name')
        if name:
            aliases.add(name)
        name_key = _log_stat_name_key(name)
        if any(kw in name_key for kw in kp_keywords):
            kp_score += 3

        msg_body = '\n'.join(r['lines'])
        clean_msg = _strip_log_markup('\n'.join(line for line in r['lines'] if not _is_log_system_line(line)))
        if clean_msg:
            outside = sum(len(part) for part in re.findall(r'[（(]([^（）()]*)[）)]', clean_msg))
            if _is_ooc_text(clean_msg):
                outside = len(clean_msg)
            ooc_chars += outside
            total_chars += len(clean_msg)
            rp_chars += max(0, len(clean_msg) - outside)

        if re.search(r'(?:你们看到|面前出现|请过一个|暗投|骰点结果为|宣告|帷幕|请投|SC|san check)', msg_body, re.IGNORECASE):
            kp_score += 1

    actor_pattern = re.compile(r'(?:<([^>]+)>|^\s*\[([^\]]+)\])')
    dice_bot_names = {'喵喵', '骰娘', 'seal', 'sealdice', 'bot', '机器人', 'dice'}
    all_target_name_keys = {_log_stat_name_key(a) for a in aliases if a}

    pending_target = False
    for r in records:
        raw_msg = '\n'.join(r['lines'])
        r_name = r.get('name') or ''
        r_name_key = _log_stat_name_key(r_name)
        is_dice_bot = r_name_key in dice_bot_names or any(db in r_name_key for db in dice_bot_names)
        is_target_record = bool((r.get('qq') and r.get('qq') in internal_target_qqs) or (not is_dice_bot and r_name_key in all_target_name_keys))

        command_count = _roll_command_count(raw_msg)
        if command_count and is_target_record:
            pending_target = True
            continue

        extracted = _extract_check_rolls(raw_msg)
        if not extracted:
            continue

        actor_match = actor_pattern.search(raw_msg)
        actor = next((g for g in actor_match.groups() if g), '') if actor_match else ''
        clean_actor = _clean_extracted_name(actor)
        actor_key = _log_stat_name_key(clean_actor)

        is_actor_target = bool(actor_key and (actor_key in all_target_name_keys or any(k in actor_key or actor_key in k for k in all_target_name_keys)))
        if not is_actor_target and is_dice_bot:
            raw_msg_key = _log_stat_name_key(raw_msg)
            is_actor_target = any(k in raw_msg_key for k in all_target_name_keys if len(k) >= 2)

        if is_actor_target or (pending_target and is_dice_bot) or is_target_record:
            all_rolls.extend(extracted)
            pending_target = False
        else:
            pending_target = False

    rolls_count = len(all_rolls)
    successes = sum(1 for roll in all_rolls if roll.get('success'))
    criticals = sum(1 for roll in all_rolls if roll.get('critical'))
    fumbles = sum(1 for roll in all_rolls if roll.get('fumble'))
    known_rolls = [r for r in all_rolls if r.get('success') is not None]
    success_rate = round(successes / len(known_rolls) * 100, 1) if known_rolls else None
    results = [r['result'] for r in all_rolls]
    roll_avg = round(sum(results) / rolls_count, 1) if rolls_count else 0.0

    is_kp_fallback = kp_score >= 8 or (kp_score >= 4 and rolls_count == 0 and total_chars > 2000)

    if all_qq_names:
        top_characters = sorted(
            [{'qq': q, 'names': list(names), 'count': qq_counts.get(q, 0)} for q, names in all_qq_names.items()],
            key=lambda x: x['count'], reverse=True
        )[:10]
    elif identities:
        top_characters = sorted(
            [{'qq': None, 'names': [ident['display']], 'count': sum(name_counts.get(a, 0) for a in ident['aliases'])} for ident in identities.values()],
            key=lambda x: x['count'], reverse=True
        )
    else:
        top_characters = [
            {'qq': None, 'names': [n], 'count': c}
            for n, c in sorted(name_counts.items(), key=lambda x: x[1], reverse=True)[:10]
            if n not in dice_bot_names and n not in noise_names
        ]

    return {
        'target_user': str(target_user),
        'clean_target_qq': primary_qq,
        'explicit_target_qqs': sorted(list(explicit_target_qqs)),
        'target_qqs': sorted(list(explicit_target_qqs)),
        'internal_target_qqs': sorted(list(internal_target_qqs)),
        'display_name': display_name or str(target_user),
        'found': bool(target_list and (message_count > 0 or rolls_count > 0)),
        'aliases': sorted(list(aliases)),
        'is_kp': is_kp_fallback,
        'is_finished_log': is_finished_log,
        'message_count': message_count,
        'total_chars': total_chars,
        'rp_chars': rp_chars,
        'ooc_chars': ooc_chars,
        'ooc_rate': round(ooc_chars / total_chars * 100, 1) if total_chars else 0.0,
        'rolls_count': rolls_count,
        'successes': successes,
        'criticals': criticals,
        'fumbles': fumbles,
        'success_rate': success_rate,
        'roll_avg': roll_avg,
        'all_detected_qqs': {q: sorted(list(names)) for q, names in all_qq_names.items()},
        'top_characters': top_characters
    }

def build_unmatched_target_error_message(target_user, player_stats):
    """当无法在日志中匹配到目标人物或QQ号时，构建详细友好的错误提示信息。"""
    target = str(target_user or '').strip()
    clean_qq = re.sub(r'^(?:QQ[:：])?', '', target, flags=re.IGNORECASE).strip()
    is_pure_qq = bool(re.fullmatch(r'\d{5,12}', clean_qq))
    is_finished_log = player_stats.get('is_finished_log', False)
    top_chars = player_stats.get('top_characters', [])
    all_qqs = player_stats.get('all_detected_qqs', {})

    msg_lines = []
    if is_finished_log:
        msg_lines.append("【成品跑团日志风格分析未命中提示】")
        if not target or is_pure_qq:
            msg_lines.append(f"当前 Log 为已整理的剧本/小说式成品日志（未包含真实 QQ 号）。未能通过 QQ 号【{target or '当前账号'}】自动对号。")
        else:
            msg_lines.append(f"未在当前成品 Log 中匹配到角色或玩家【{target}】的发言或检定。")
        msg_lines.append("已终止任务以避免大模型脱离角色产生幻觉。")

        if top_chars:
            msg_lines.append("\n当前日志中识别到的出场跑团成员如下：")
            for item in top_chars:
                disp = '/'.join(item.get('names', []))
                cnt = f" ({item.get('count')}条发言)" if item.get('count') else ""
                msg_lines.append(f"· {disp}{cnt}")
        
        msg_lines.append("\n【建议指令】：")
        msg_lines.append("请使用上述识别到的角色名或玩家名重试，例如：")
        if top_chars:
            first_name = top_chars[0]['names'][0].split('(')[0]
            msg_lines.append(f"- .风格 {first_name}")
            if len(top_chars) > 1:
                second_name = top_chars[1]['names'][0].split('(')[0]
                msg_lines.append(f"- .风格 {second_name}")
        else:
            msg_lines.append("- .风格 <角色名>")
        return '\n'.join(msg_lines)

    msg_lines.append("【风格分析目标未命中提示】")
    if not target or re.match(r'^OpenQQ(?::|CH:)[0-9a-zA-Z]+$', target, re.IGNORECASE):
        msg_lines.append("未指定有效分析目标，且未能自动匹配到您在日志中的发言。")
        msg_lines.append("💡 提示：若使用的是 QQ 官方 Bot，请先发送【.QQ绑定 <原QQ号>】绑定 QQ，或直接在指令后指定角色名：.风格 <角色名>")
    elif is_pure_qq:
        msg_lines.append(f"未在当前 Log 日志中检索到 QQ 账号【{clean_qq}】的任何发言或掷骰检定记录。")
    else:
        msg_lines.append(f"未在当前 Log 日志中匹配到角色或昵称【{target}】的任何发言或掷骰检定记录。")
    msg_lines.append("无法交由大模型进行客观分析，已终止任务以避免产生虚假分析与幻觉。")

    if top_chars:
        msg_lines.append("\n当前日志中检测到的主要活跃角色如下（供参考）：")
        for item in top_chars[:8]:
            names_str = '/'.join(item.get('names', [])) or f"QQ:{item.get('qq')}"
            count_str = f"{item.get('count')}条发言" if item.get('count') else ""
            qq_str = f"QQ: {item.get('qq')}" if item.get('qq') else ""
            details = [p for p in [qq_str, count_str] if p]
            det_text = f" ({', '.join(details)})" if details else ""
            msg_lines.append(f"· {names_str}{det_text}")
    elif all_qqs:
        msg_lines.append("\n当前日志中检测到的 QQ 账号如下（供参考）：")
        for q, names in list(all_qqs.items())[:8]:
            msg_lines.append(f"· QQ:{q} => {', '.join(names)}")
    else:
        msg_lines.append("\n提示：当前日志未识别到标准聊天记录行头（可能为纯文本小说/缺少QQ与时间戳）。")

    msg_lines.append("\n【建议指令】：")
    msg_lines.append("- 换用上述候选昵称或其前缀/后缀，例如：.风格 严 或 .风格 墨菲斯")
    msg_lines.append("- 直接使用目标玩家的纯数字 QQ 号，例如：.风格 12345678")

    return '\n'.join(msg_lines)

def format_target_player_stats_for_prompt(player_stats, target_user, timeline_str=""):
    """将目标用户的确定性统计格式化为系统提示词中的只读参考数据。"""
    lines = ["\n\n【目标分析对象确定性参考数据（只读线索，最终身份请由你根据剧情细节独立研判）】："]
    if timeline_str:
        lines.append(f"- 战役时间轴说明：{timeline_str}")
    if not player_stats.get('found'):
        lines.append(f"- 目标标识：{target_user}")
        lines.append("- 注意：在当前 Log 中未直接检测到该对象的专属行头。")
        detected = player_stats.get('all_detected_qqs', {})
        if detected:
            lines.append("  日志中检测到的所有 QQ 号及对应昵称如下，请根据语境和上下文尽可能定位最契合的角色：")
            for q, names in list(detected.items())[:15]:
                lines.append(f"    * QQ:{q} => {', '.join(names)}")
        return '\n'.join(lines)

    target_qq = player_stats.get('clean_target_qq')
    target_qqs = player_stats.get('target_qqs') or ([target_qq] if target_qq else [])
    qq_str = "/".join(target_qqs) if target_qqs else ""
    disp = player_stats.get('display_name') or target_user
    aliases = player_stats.get('aliases', [])
    lines.append(f"- 目标对象：{disp}" + (f" (QQ: {qq_str})" if qq_str else ""))
    lines.append(f"- 角色/使用昵称：{', '.join(aliases) if aliases else disp}")
    lines.append(f"- 后端统计线索：检测到该角色发言 {player_stats.get('message_count', 0)} 条，总计 {player_stats.get('total_chars', 0)} 字（RP描写约 {player_stats.get('rp_chars', 0)} 字，场外约 {player_stats.get('ooc_chars', 0)} 字）")
    if player_stats.get('rolls_count'):
        sr_text = f"，成功率 {player_stats.get('success_rate')}%" if player_stats.get('success_rate') is not None else ""
        lines.append(f"- 骰点检定：共 {player_stats.get('rolls_count')} 次，均值 {player_stats.get('roll_avg')}{sr_text}，大成功 {player_stats.get('criticals', 0)} 次，大失败 {player_stats.get('fumbles', 0)} 次")
    else:
        lines.append("- 骰点检定：0 次或未检测到显式骰点")
    lines.append("- 重要指引：上述数据仅为客观统计线索，禁止直接盲信。请通读日志正文剧情，结合其发言是扮演调查员/PC 还是主持/控场，做出终审研判并在回复第一行输出【身份：PL】或【身份：KP】！")
    return '\n'.join(lines)

def build_player_focused_log_text(log_text, target_qq=None, target_aliases=None, max_chars=600000):
    """长 Log 文本智能提炼：优先保留开篇、结尾，以及目标对象发言及其前后交互上下文。"""
    if not log_text or len(log_text) <= max_chars:
        return log_text

    clean_qqs = set()
    if isinstance(target_qq, (set, list, tuple)):
        clean_qqs = {re.sub(r'\D', '', str(q)).strip() for q in target_qq if str(q).strip()}
    else:
        raw_qq_str = str(target_qq or '').strip()
        clean_qqs = {re.sub(r'\D', '', q).strip() for q in re.split(r'[,，;；/、|\s]+', raw_qq_str) if re.sub(r'\D', '', q).strip()}
    clean_qqs.discard('')

    aliases = set(target_aliases or [])
    alias_keys = {_log_stat_name_key(a) for a in aliases if a}

    lines = log_text.splitlines()
    blocks = []
    current_block = []
    current_qq = ""
    current_name = ""

    header_patterns = [
        re.compile(r'^\s*(.*?)\s*[（(<]([1-9]\d{4,11})[）)>]\s+(?:(?:20\d{2})[-/.])?\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s*$'),
        re.compile(r'^\s*(.*?)\s*[（(<]([1-9]\d{4,11})[）)>]\s*[:：]\s*(.*)$'),
    ]
    chat_pattern = re.compile(r'^\s*(.*?)\s*[:：]\s*(?:(?:20\d{2})[-/.])?\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s*$')
    bracket_head = re.compile(r'^\s*[<【\[(（](?P<name>[^>】\])）\r\n]{1,25})[>】\])）]\s*[:：]?\s*(?P<msg>.*)$')
    colon_head = re.compile(r'^\s*(?P<name>KP|PL|DM|GM|守密人|调查员|[^\s:：]{2,15})\s*[:：]\s*(?P<msg>.*)$')

    for line in lines:
        line_str = line.strip()
        is_head = False
        for pat in header_patterns:
            m = pat.match(line_str)
            if m:
                if current_block:
                    blocks.append({'qq': current_qq, 'name': current_name, 'text': '\n'.join(current_block)})
                current_name = _clean_extracted_name(m.group(1).strip())
                current_qq = m.group(2)
                current_block = [line]
                is_head = True
                break

        if not is_head:
            m = re.search(r'[\u0028\uFF08<]([1-9]\d{4,11})[\u0029\uFF09>]', line_str)
            if m:
                after = line_str[m.end():].strip()
                has_time = bool(re.search(r'\d{1,2}:\d{2}', line_str))
                has_colon = bool(re.search(r'^[:：]', after))
                if has_time or has_colon or len(after) == 0:
                    if current_block:
                        blocks.append({'qq': current_qq, 'name': current_name, 'text': '\n'.join(current_block)})
                    current_name = _clean_extracted_name(line_str[:m.start()].strip())
                    current_qq = m.group(1)
                    current_block = [line]
                    is_head = True

        if not is_head:
            mc = chat_pattern.match(line_str)
            if mc:
                if current_block:
                    blocks.append({'qq': current_qq, 'name': current_name, 'text': '\n'.join(current_block)})
                current_name = _clean_extracted_name(mc.group(1).strip())
                current_qq = ""
                current_block = [line]
                is_head = True

        if not is_head:
            mb = bracket_head.match(line_str)
            if mb:
                b_raw = mb.group('name').strip()
                if not re.match(r'^\d+$', b_raw) and b_raw not in ('http', 'https', 'file', '微灾码', 'STONY GROUNDS'):
                    if current_block:
                        blocks.append({'qq': current_qq, 'name': current_name, 'text': '\n'.join(current_block)})
                    current_name = _clean_extracted_name(b_raw)
                    current_qq = ""
                    current_block = [line]
                    is_head = True

        if not is_head:
            mcol = colon_head.match(line_str)
            if mcol:
                col_raw = mcol.group('name').strip()
                if col_raw not in ('http', 'https', 'file', '微灾码', 'STONY GROUNDS'):
                    if current_block:
                        blocks.append({'qq': current_qq, 'name': current_name, 'text': '\n'.join(current_block)})
                    current_name = _clean_extracted_name(col_raw)
                    current_qq = ""
                    current_block = [line]
                    is_head = True

        if not is_head:
            if current_block:
                current_block.append(line)
            else:
                current_block = [line]

    if current_block:
        blocks.append({'qq': current_qq, 'name': current_name, 'text': '\n'.join(current_block)})

    if not blocks:
        part = int(max_chars * 0.45)
        mid = log_text[part:-part].split('\n')
        step = max(1, int(len(mid) / 100))
        return f"{log_text[:part]}\n...[中间部分省略]...\n{chr(10).join(mid[::step])}\n{log_text[-part:]}"

    keep_indices = set()
    total_blocks = len(blocks)

    head_chars = 0
    for i in range(total_blocks):
        keep_indices.add(i)
        head_chars += len(blocks[i]['text'])
        if head_chars >= 2500 or i >= 15:
            break

    tail_chars = 0
    for i in range(total_blocks - 1, -1, -1):
        keep_indices.add(i)
        tail_chars += len(blocks[i]['text'])
        if tail_chars >= 2500 or i <= total_blocks - 15:
            break

    for i, b in enumerate(blocks):
        is_target = False
        if clean_qqs and b.get('qq') in clean_qqs:
            is_target = True
        elif b.get('name') and _log_stat_name_key(b.get('name')) in alias_keys:
            is_target = True

        if is_target:
            if i > 0: keep_indices.add(i - 1)
            keep_indices.add(i)
            if i + 1 < total_blocks: keep_indices.add(i + 1)

    sorted_indices = sorted(list(keep_indices))
    selected_text_parts = []
    current_len = 0
    last_idx = -1

    for idx in sorted_indices:
        blk_text = blocks[idx]['text']
        if current_len + len(blk_text) > max_chars:
            selected_text_parts.append("\n...[因模型上下文限制，超长日志其余部分已自动提炼]...\n")
            break
        if last_idx != -1 and idx > last_idx + 1:
            selected_text_parts.append("\n...[略去非目标用户交互片段]...\n")
        selected_text_parts.append(blk_text)
        current_len += len(blk_text)
        last_idx = idx

    return '\n'.join(selected_text_parts)


def build_custom_log_prompt(custom_prompt, calculated_statistics, requested_theme='default'):
    """为自定义 Log 提示词补齐后端统计和稳定输出约束。

    自定义提示词仍然是主要指令；本段只解决后端确定性数据、分页/主题顺序
    和完整输出这类基础协议，避免用户提示词与渲染器互相冲突。
    """
    custom = str(custom_prompt or '').strip()
    theme_names = {'classic': '经典', 'cyberpunk': '赛博', 'historical': '历史', 'cthulhu': '克苏鲁', 'wasteland': '废土', 'anime': '二次元', 'terminal': '终端', 'default': ''}
    theme_label = theme_names.get(requested_theme, requested_theme if requested_theme != 'default' else '')
    if not theme_label:
        theme_match = re.search(r'【主题[：:]\s*(经典|赛博|历史|克苏鲁|废土|二次元|终端)', custom)
        theme_label = theme_match.group(1) if theme_match else ''
    theme_hint = ''
    if theme_label:
        theme_hint = f'【主题顺序】：请将【主题：{theme_label}】作为回复第一行；第二行再输出【分页符】。'
    else:
        theme_hint = '【主题顺序】：如果需要主题标签，必须放在回复第一行；第二行再输出【分页符】。'
    compatibility = f"""

【后端兼容协议（优先执行）】：
1. 下面的自定义要求负责分析角度和文风；你必须完整执行其中的所有板块，不要在中途提前结束。
2. RP字数、场外占比、骰点次数、平均值、中位数、可识别成功率和骰点幸运值已经由后端逐条计算。请直接采用下方数据，不要重新估算、改写或臆造；成功率未知时不得按D20点数猜测是否成功。
3. 先识别真正参与本局的 PC，排除骰娘、KP/GM/DM、NPC、系统账号、围观者及只有场外发言的 OB；只有 PC 才进入玩家评分和最佳/最差评选。
4. 若要求“第一行分页符”和“回复开头主题”同时出现，统一按“第一行主题、第二行【分页符】”输出。后续每个主要板块单独以【分页符】开头；不要在表格内部插入分页符。
5. 所有要求的板块都必须输出；字数较多时优先压缩重复叙述，不要省略主持人评价、最佳/最差玩家或评分依据。
6. 仅当自定义要求需要图表时，可输出下列 Markdown fenced 图表块；图表块必须完整且不要放在表格内部。坐标和数值一一对应，数值范围为 0-100。坐标只有1-2项时后端自动改画柱状图，3-10项画雷达图，超过10项只采用最先写出的10项：
```logai-chart
type: radar
title: 图表标题
axes: 坐标一 | 坐标二 | 坐标三
series:
系列名称: 80 | 65 | 92
另一系列: 70 | 88 | 61
```
没有图表需求时不要输出 logai-chart 块。
{theme_hint}
"""
    return custom + compatibility + format_log_statistics_for_prompt(calculated_statistics)


def build_custom_player_style_prompt(custom_prompt, player_stats, target_user, calculated_statistics=None, requested_theme='default'):
    """为指定玩家/KP风格分析的自定义提示词补齐目标对号约束、身份研判与图表规则。

    支持与常规 logai 分析一致的 logai-chart 图表支持；
    若自定义配置未要求图表，则严令大模型切勿输出图表块，避免误加图表。
    """
    custom = str(custom_prompt or '').strip()
    target_display = player_stats.get('display_name') or target_user or '目标角色'
    target_qq = player_stats.get('clean_target_qq') or ''
    target_qqs = player_stats.get('target_qqs') or ([target_qq] if target_qq else [])
    qq_str = "/".join(target_qqs) if target_qqs else target_qq
    target_badge = f"{target_display} (QQ:{qq_str})" if qq_str else target_display

    theme_names = {'classic': '经典', 'cyberpunk': '赛博', 'historical': '历史', 'cthulhu': '克苏鲁', 'wasteland': '废土', 'anime': '二次元', 'terminal': '终端', 'default': ''}
    theme_label = theme_names.get(requested_theme, requested_theme if requested_theme != 'default' else '')
    if not theme_label:
        theme_match = re.search(r'【主题[：:]\s*(经典|赛博|历史|克苏鲁|废土|二次元|终端)', custom)
        theme_label = theme_match.group(1) if theme_match else ''
    theme_hint = ''
    if theme_label:
        theme_hint = f'【主题顺序】：请将【主题：{theme_label}】作为回复第一行；第二行输出身份判定，随后输出【分页符】。'
    else:
        theme_hint = '【主题顺序】：如果需要主题标签，必须放在回复第一行。'

    compatibility = f"""

【后端风格分析与图表兼容协议（优先执行）】：
1. 本次分析为【针对特定对象的跑团/带团风格深度分析】，对号分析的核心目标为：【{target_badge}】。
2. 下方的自定义要求负责具体的分析角度、切入点、打分标准与语言文风；你必须结合日志中该目标的具体发言、关键决策、RP描写与检定互动进行针对性分析，切勿混淆或分析其他玩家。
3. 【图表输出规则（与常规分析一致，避免误加图表）】：
   - 【仅当下方自定义要求中明确提及需要图表/雷达图/柱状图/能力图/打分图时】，才可输出如下 Markdown fenced 图表块（数值范围 0-100，坐标与数值一一对应；1-2项自动画柱状图，3-10项画雷达图）：
```logai-chart
type: radar
title: 综合风格能力雷达图
axes: 维度一 | 维度二 | 维度三 | 维度四 | 维度五 | 维度六
series:
综合评价: 80 | 75 | 90 | 65 | 85 | 70
```
   - 【重要防误加约束】：若下方的自定义要求中【没有明确要求图表/雷达图】，严禁输出任何 logai-chart 代码块，绝对不要自行添油加醋画图，保持纯文本卡片排版，避免在未要求的情况下误加入图表！
4. 【分页格式规范】：每个主要分析板块之间，必须使用单独一行的“【分页符】”进行分隔，以便渲染为优雅的多页长图卡片；请勿把图表块置于表格内部。
5. 【身份终审标签】：请在回复最开头的独立行中输出【身份：PL】或【身份：KP】（若二者兼有可写【身份：双重】），以便后端动态生成精准的报告标题。
{theme_hint}
"""
    target_stats_text = format_target_player_stats_for_prompt(player_stats, target_user)
    return custom + compatibility + target_stats_text


# --- 核心处理任务 ---
def background_process(job_id, key, password, source, is_pro=False, is_kind=False, mode='analyze', persona="", custom_prompt="", theme='default', is_ds=False, group_key="", backup_model="", user_key="", user_name="", custom_name="", token_module="", log_sources=None, target_qq="", save_archive=True, custom_timeline="", identity_bindings=None, specified_identity=None):
    """后台线程：执行 Log 下载、分析、绘图"""
    print(f"[{job_id}] 开始处理Log... Source: {source}, Mode: {mode}")
    try:
        # 获取连接池 Session
        session = get_session()
        
        # 0. 优先拉取文本内容
        log_sources_list = log_sources if isinstance(log_sources, list) and log_sources else [
            {'key': key, 'password': password, 'source': source}
        ]
        log_text, failures = fetch_and_join_logs(log_sources_list, key, password, source, identity_bindings=identity_bindings)
        if failures:
            print(f"[{job_id}] 部分网络链接拉取异常: {'；'.join(failures)}")
        if identity_bindings and log_text:
            log_text = apply_identity_bindings(log_text, identity_bindings)
        if not log_text or not log_text.strip():
            raise Exception("无法从提供的网络 Log 链接中获取有效文本。")
        first_key = log_sources_list[0].get('key', 'multi_logs')
        source_signature = hashlib.md5("_".join([str(s.get('key','')) for s in log_sources_list]).encode('utf-8')).hexdigest()
        curr_start_t, curr_end_t = _detect_log_time_range(None, log_text)
        if custom_timeline:
            c_s, c_e = _detect_log_time_range(None, custom_timeline)
            if c_s:
                curr_start_t = c_s
                curr_end_t = c_e or c_s

        # ================= 1. 尝试触发省流缓存 =================
        hash_key = None
        if not is_pro:
            # 基础缓存 Key (不包含人设、自定义提示词，作为无个性化时的默认结果)
            hash_str = f"url_log_stats_v5_{key}_{source_signature}_{mode}_{is_kind}_{persona}_{custom_prompt}_{theme}_{is_ds}_{backup_model}_{target_qq}_{custom_timeline}"
            hash_key = hashlib.md5(hash_str.encode('utf-8')).hexdigest()
            
            cached_images = get_daily_cache(hash_key)
            if cached_images:
                print(f"[{job_id}] 命中今日多源内容缓存！省流模式启动，秒回历史图片。")
                JOB_CACHE[job_id]['status'] = 'done'
                JOB_CACHE[job_id]['images'] = cached_images
                return
        # ======================================================

        # 2. 预处理文本
        if len(log_text) > MAX_AI_CHARS:
            part = int(MAX_AI_CHARS * 0.4)
            mid = log_text[part:-part].split('\n')
            step = max(1, int(len(mid)/100))
            log_text_ai = f"{log_text[:part]}\n...[略]...\n{chr(10).join(mid[::step])}\n{log_text[-part:]}"
        else:
            log_text_ai = log_text
        calculated_statistics = calculate_log_statistics(log_text)

        # 核心：根据不同模式分配对应的 Prompt
        report_title = "TRPG 跑团日志分析"
        is_player_style = bool(target_qq) or mode in ('player_style', 'style', 'pl_style', 'kp_style')
        
        if is_player_style:
            target_user_input = str(target_qq or '').strip()
            user_name_input = str(user_name or req_data.get('user_name') or '').strip()
            player_stats = extract_player_profile_and_stats(log_text, target_user_input, user_name=user_name_input)
            
            # 【核心拦截】：未匹配到目标人物/QQ时直接报错返回，禁止交由 LLM 产生幻觉
            if not player_stats.get('found'):
                err_msg = build_unmatched_target_error_message(target_user_input, player_stats)
                print(f"[{job_id}] 风格分析目标未匹配到: '{target_user_input}'，跳过大模型直接返回报错")
                err_img = text_to_images(err_msg, "目标未匹配", "TRPG 风格分析未命中", theme)[0]
                JOB_CACHE[job_id]['status'] = 'error'
                JOB_CACHE[job_id]['msg'] = err_msg
                JOB_CACHE[job_id]['images'] = [err_img]
                return

            clean_target_qq = player_stats.get('clean_target_qq') or ""
            target_qqs = player_stats.get('target_qqs') or ([clean_target_qq] if clean_target_qq else [])
            target_qqs_str = "/".join(target_qqs) if target_qqs else clean_target_qq
            target_display_name = player_stats.get('display_name') or target_user_input or "玩家"

            if custom_timeline:
                timeline_str = custom_timeline
            else:
                m_dates = re.findall(r'\b(20\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?)\b', (log_text[:3000] + log_text[-3000:]))
                if m_dates:
                    norm_dates = sorted([d.replace('/', '-').replace('.', '-').replace('年', '-').replace('月', '-').replace('日', '') for d in m_dates])
                    timeline_str = f"{norm_dates[0]} ~ {norm_dates[-1]}" if norm_dates[0] != norm_dates[-1] else norm_dates[0]
                else:
                    timeline_str = "无指定时间轴 (依日志顺序)"

            report_title = f"TRPG 风格分析报告 ({target_display_name})"
            if custom_prompt:
                system_prompt = build_custom_player_style_prompt(custom_prompt, player_stats, target_user_input, calculated_statistics, theme)
            else:
                system_prompt = PLAYER_STYLE_SYSTEM_PROMPT
                system_prompt += format_target_player_stats_for_prompt(player_stats, target_user_input, timeline_str=timeline_str)

            # 检索历史相邻档案并注入系统提示词 (前2次 + 后1次)
            if specified_identity:
                norm_sp = str(specified_identity).strip().upper()
                target_identity = "KP" if norm_sp in ("KP", "DM", "主持", "主持人", "守秘人") else ("PL" if norm_sp in ("PL", "玩家") else ("KP" if player_stats.get('is_kp') else "PL"))
            else:
                target_identity = "KP" if player_stats.get('is_kp') else "PL"
            target_for_history = f"{target_display_name} {clean_target_qq}".strip() if clean_target_qq else (target_display_name or target_user_input)
            _, _, hist_prompt_text = get_adjacent_historical_records(
                target_user=target_for_history,
                curr_start_t=curr_start_t,
                curr_end_t=curr_end_t,
                identity=target_identity,
                user_key=user_key
            )
            if hist_prompt_text:
                system_prompt += hist_prompt_text
                print(f"[{job_id}] 已成功注入时序相邻历史档案参考 (identity={target_identity})")
            internal_qqs = player_stats.get('internal_target_qqs') or target_qqs
            log_text_ai = build_player_focused_log_text(log_text, target_qq=internal_qqs, target_aliases=player_stats.get('aliases'), max_chars=MAX_AI_CHARS)
            user_badge = f"{target_display_name} (QQ:{target_qqs_str})" if target_qqs_str else target_display_name
            user_content = f"目标分析对象：{user_badge}\n跑团日志内容如下：\n{log_text_ai}"

        # 【新增】：如果有自定义提示词，强行覆盖，并把标题改为自定义
        elif custom_prompt:
            system_prompt = build_custom_log_prompt(custom_prompt, calculated_statistics, theme)
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
            system_prompt += "\n\n" + LOG_EVALUATION_REQUIREMENTS
            system_prompt += format_log_statistics_for_prompt(calculated_statistics)
        
        # 核心：人设系统劫持（强制带入骰娘语气且防止格式崩溃）
        if persona:
            system_prompt += f"\n\n【极其重要的扮演指令】：\n在生成上述所有评价和梳理内容时，请你完全带入以下角色人设来进行语气和口吻的渲染。你可以自称、吐槽或撒娇，让输出充满该人设的个性。\n（绝对警告：你必须严格保留前文要求的【板块标题】和【分页符】等格式标识符，千万不能省略或修改它们，只能改变正文部分的说话语气！）：\n{persona}"

        # 【联动】：先按 Log 中的 QQ 锁定玩家卡库，再匹配该 QQ 名下的 PC 档案。
        try:
            card_target_key = clean_target_qq if is_player_style and clean_target_qq else user_key
            matched_cards = find_matching_cards(log_text, user_key=card_target_key)
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
        if is_ds:
            validate_model_endpoint(DS_API_KEY, DS_BASE_URL, BACKUP_MODEL_LABEL)
        else:
            validate_model_endpoint(AI_API_KEY, AI_BASE_URL, "主模型")
        current_client = backup_client if is_ds else client
        if is_ds:
            current_model = resolve_backup_model(backup_model, is_pro)
            max_t = 65535
        else:
            current_model = AI_MODEL_PRO if is_pro else AI_MODEL
            max_t = 65535

        messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_content if is_player_style else log_text_ai}]
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
        print(f"[{job_id}] LLM finish_reason={getattr(resp.choices[0], 'finish_reason', '')}, output_chars={len(result_text or '')}")

        token_usage = f" | Tokens: {usage_record['total_tokens']}" if usage_record else ""
        
        result_text, final_theme = extract_theme_from_text(result_text, theme)

        # 核心：风格分析模式下，优先提取大模型首行的【身份：PL/KP/双重】标签来决定图片大标题
        if is_player_style:
            llm_id_match = re.search(r'【身份[:：]\s*(PL|KP|双重|玩家|主持|主持人|DM|守秘人)\s*】', result_text, re.IGNORECASE)
            llm_identity = None
            if llm_id_match:
                tag = llm_id_match.group(1).upper()
                if tag in ('PL', '玩家'):
                    llm_identity = 'PL'
                elif tag in ('KP', '主持', '主持人', 'DM', '守秘人'):
                    llm_identity = 'KP'
                elif tag in ('双重', '兼有'):
                    llm_identity = '双重'

            # 确定有效身份：优先尊重用户显式指定的身份，若未指定则采纳 LLM 识别的身份
            norm_sp = str(specified_identity or '').strip().upper()
            spec_clean = 'KP' if norm_sp in ('KP', 'DM', '主持', '主持人', '守秘人') else ('PL' if norm_sp in ('PL', '玩家') else ('双重' if norm_sp in ('双重', '兼有', '全能') else None))
            effective_identity = spec_clean or llm_identity

            # 从正文中剥离身份标签，避免污染卡片首段文字排版
            result_text = re.sub(r'^\s*【身份[:：][^】]+】\s*(?:\r?\n)?', '', result_text, flags=re.IGNORECASE).strip()

            disp_name = target_display_name
            if not custom_prompt:
                if effective_identity == 'PL':
                    report_title = f"TRPG 玩家跑团风格报告 ({disp_name})"
                elif effective_identity == 'KP':
                    report_title = f"TRPG 主持带团风格报告 ({disp_name})"
                elif effective_identity == '双重':
                    report_title = f"TRPG 全能跑团/主持风格报告 ({disp_name})"
                else:
                    fallback_role = "主持" if player_stats.get('is_kp') else "玩家"
                    report_title = f"TRPG {fallback_role}跑团风格报告 ({disp_name})"
            else:
                custom_prefix = f"{custom_name}·" if custom_name else "自定义·"
                if effective_identity == 'PL':
                    report_title = f"TRPG {custom_prefix}玩家风格报告 ({disp_name})"
                elif effective_identity == 'KP':
                    report_title = f"TRPG {custom_prefix}主持风格报告 ({disp_name})"
                elif effective_identity == '双重':
                    report_title = f"TRPG {custom_prefix}全能风格报告 ({disp_name})"
                else:
                    fallback_role = "主持" if player_stats.get('is_kp') else "玩家"
                    report_title = f"TRPG {custom_prefix}{fallback_role}风格报告 ({disp_name})"

        # 6. 绘图与返回
        # 自定义提示词默认由用户掌控；只有提示词明确要求普通版/标准统计表时，
        # 才恢复插件默认综合评估页。自定义 logai-chart 仍照常渲染。
        if is_player_style:
            file_badge = f"QQ:{clean_target_qq}" if clean_target_qq else f"Target:{target_display_name[:15]}"
            images_list = render_log_report_images(
                result_text, file_badge, report_title, final_theme, token_usage,
                calculated_statistics, include_standard_evaluation=False
            )
        else:
            include_standard_evaluation = (not bool(custom_prompt)) or custom_prompt_requests_standard_evaluation(custom_prompt)
            images_list = render_log_report_images(
                result_text, f"Key:{key[:8]}", report_title, final_theme, token_usage,
                calculated_statistics, include_standard_evaluation=include_standard_evaluation
            ) if mode == 'analyze' else text_to_images(result_text, f"Key:{key[:8]}", report_title, final_theme, token_usage)
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['images'] = images_list
        print(f"[{job_id}] 渲染处理完成")

        # 风格分析模式下，且允许自动存档：保存玩家成长档案
        if is_player_style and save_archive:
            try:
                sources_list = [s.get('key', '') for s in log_sources] if log_sources else ([key] if key else [])
                # 计算时间跨度
                if not timeline_str:
                    if custom_timeline:
                        timeline_str = custom_timeline
                    else:
                        m_dates = re.findall(r'\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2})\b', (log_text[:3000] + log_text[-3000:]))
                        if m_dates:
                            norm_dates = sorted([d.replace('/', '-') for d in m_dates])
                            timeline_str = f"{norm_dates[0]} ~ {norm_dates[-1]}" if norm_dates[0] != norm_dates[-1] else norm_dates[0]
                        else:
                            timeline_str = "无指定时间轴 (依日志顺序)"
                target_user_val = f"{target_display_name} {clean_target_qq}".strip() if clean_target_qq else (target_display_name or target_user_input)
                archive_dir = save_player_style_archive(
                    target_user=target_user_val,
                    result_text=result_text,
                    images_list=images_list,
                    sources=sources_list,
                    job_id=job_id,
                    user_key=user_key,
                    stats=player_stats,
                    timeline_str=timeline_str,
                    report_title=report_title,
                    start_t=curr_start_t,
                    end_t=curr_end_t,
                    specified_identity=effective_identity
                )
                if archive_dir:
                    print(f"[{job_id}] 玩家风格成长档案已持久化保存至: {archive_dir}")
            except Exception as e_arc:
                print(f"[{job_id}] 保存风格成长档案异常: {e_arc}")

        # ================= 7. 写入省流缓存 =================
        if not is_pro and hash_key:
            set_daily_cache(hash_key, images_list)
            print(f"[{job_id}] 结果已存入今日缓存库。")

    except Exception as e:
        print(f"[{job_id}] 失败: {e}")
        err_img_bytes = text_to_images(f"Log处理失败：\n{str(e)}", "Error")[0]
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['images'] = [err_img_bytes]

PDF_CONVERTED_CACHE = {}

def clean_and_stitch_trpg_log_text(pages_text):
    """
    针对 TRPG Log PDF 的排版清洗与折行拼接引擎：
    1. 自动统计并剔除重复出现的页眉/页脚水印（如 STONY GROUNDS）以及页码、网页打印 URL 杂质
    2. 修复折断的时间戳：[2024-05-01\n20:00:00] -> [2024-05-01 20:00:00]
    3. 修复折断的角色与QQ：张\n三(123456): -> 张三(123456):
    4. 支持成品小说/剧本Log行头识别（<角色名>、【角色名】、KP: 等），防止过度合并
    5. 规范化全角括号与冒号，平滑拼接单人跨行发言
    """
    if isinstance(pages_text, str):
        pages_text = [pages_text]

    repeating_headers = set()
    repeating_footers = set()
    if len(pages_text) >= 3:
        header_counter = {}
        footer_counter = {}
        for p_text in pages_text:
            lines = [l.strip() for l in str(p_text or '').splitlines() if l.strip()]
            if lines:
                h_line = lines[0]
                if len(h_line) <= 80 and not re.match(r'^\d+$', h_line):
                    header_counter[h_line] = header_counter.get(h_line, 0) + 1
            if len(lines) > 1:
                f_line = lines[-1]
                if len(f_line) <= 80 and not re.match(r'^\d+$', f_line):
                    footer_counter[f_line] = footer_counter.get(f_line, 0) + 1
        repeating_headers = {k for k, v in header_counter.items() if v >= 3}
        repeating_footers = {k for k, v in footer_counter.items() if v >= 3}

    page_noise_patterns = [
        re.compile(r'^\s*第\s*\d+\s*页(?:\s*[/，,共]\s*(?:共\s*)?\d+\s*页)?\s*$', re.IGNORECASE),
        re.compile(r'^\s*Page\s+\d+(?:\s+of\s+\d+)?\s*$', re.IGNORECASE),
        re.compile(r'^\s*-\s*\d+\s*-\s*$'),
        re.compile(r'^\s*\d+\s*/\s*\d+\s*$'),
        re.compile(r'^\s*https?://\S+\s*$', re.IGNORECASE),
        re.compile(r'^\s*file:///\S+\s*$', re.IGNORECASE),
        re.compile(r'^\s*(?:微灾码|菠萝包|留痕|回溯之泉|trpgbot)\s*(?:跑团\s*Log|Log导出)?\s*$', re.IGNORECASE),
    ]

    all_raw_lines = []
    for p_text in pages_text:
        p_lines = [l.strip() for l in str(p_text or '').splitlines() if l.strip()]
        for s in p_lines:
            if s in repeating_headers or s in repeating_footers:
                continue
            if any(pat.match(s) for pat in page_noise_patterns):
                continue
            all_raw_lines.append(s)

    joined_text = "\n".join(all_raw_lines)

    # 修复折断的时间戳
    joined_text = re.sub(
        r'\[(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s*\n\s*(\d{1,2}:\d{2}(?::\d{2})?)\]',
        r'[\1 \2]',
        joined_text
    )
    # 修复折断的角色名与括号QQ
    joined_text = re.sub(
        r'([^\n(（<\[]+)[(（<]\s*\n\s*(\d+)[)）>]',
        r'\1(\2)',
        joined_text
    )
    # 规范化角色头后的全角括号为半角 (方便通用正则提取QQ)
    joined_text = re.sub(r'（([1-9]\d{4,11})）', r'(\1)', joined_text)

    speaker_start_pat = re.compile(
        r'^(?:'
        r'\[?(?:(?:20\d{2})[-/.])?\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:守密人|调查员|KP|PL|DM|NPC)?[ -]?[^\n:：(（<]+[（(<]\d+[）)>]\s*[:：]?'
        r'|'
        r'(?:守密人|调查员|KP|PL|DM|NPC)?[ -]?[^\n:：(（<]+[（(<]\d+[）)>]\s*[:：]'
        r'|'
        r'[<【\[(（](?!(?:20\d{2}|https?://|\d{1,2}:\d{2}))[^>】\])）\r\n]{1,25}[>】\])）]\s*[:：]?'
        r'|'
        r'(?:KP|PL|DM|GM|ST|NPC|守密人|调查员|主持人|旁白)\s*[:：]'
        r'|'
        r'\.(?:r|ra|rc|rd|sc|st|ti|li|en)\b'
        r'|'
        r'(?:投掷|系统提示|检定结果|来自群.*的暗骰|暗中检定)'
        r'|'
        r'(?:第[一二三四五六七八九十0-9]+[章幕回节]|导入|附录|材料[一二三四0-9]+)'
        r')',
        re.IGNORECASE
    )

    clean_lines = []
    current_entry = ""

    for line in joined_text.splitlines():
        line_s = line.strip()
        if not line_s:
            continue

        if speaker_start_pat.match(line_s):
            if current_entry:
                clean_lines.append(current_entry)
            current_entry = line_s
        else:
            if current_entry:
                if re.search(r'[，,、]$', current_entry):
                    current_entry += line_s
                else:
                    current_entry += " " + line_s
            else:
                current_entry = line_s

    if current_entry:
        clean_lines.append(current_entry)

    return "\n".join(clean_lines)


def convert_pdf_to_docx_bytes(clean_text, filename="log.pdf", total_pages=1):
    """将清洗后的纯文本转为标准排版的 DOCX 字节流"""
    doc = Document()
    doc.add_heading(f"TRPG Log - {filename}", level=1)
    meta = doc.add_paragraph()
    meta.add_run(f"来源文件: {filename} | 页面数: {total_pages} | 提取字符数: {len(clean_text)}").italic = True

    for line in clean_text.splitlines():
        line_s = line.strip()
        if not line_s:
            continue
        p = doc.add_paragraph(line_s)
        if re.search(r'[（(]\d+[）)][:：]', line_s):
            p.paragraph_format.space_before = docx.shared.Pt(4)

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def extract_and_convert_pdf(file_content, filename, converted_dir=None, save_converted=True):
    """
    统一的 PDF 提取、容错与 DOCX/TXT 转换函数：
    1. 优先使用 pymupdf (fitz)，具备自然排版阅读顺序 (sort=True)；
    2. 无 pymupdf 或异常时降级使用 PyPDF2；
    3. 智能检测加密 PDF、纯图片扫描件、空文件并抛出明确友好的错误信息；
    4. 自动生成规整的 TXT 和 DOCX 并写入缓存，返回清洗后的 Log 纯文本。
    """
    if not file_content:
        return "[PDFError:Empty] 该 PDF 文件内容为空，未能读取到任何数据。"

    file_hash = hashlib.md5(file_content).hexdigest()
    pages_text = []
    total_pages = 0
    total_images = 0

    fitz_success = False
    if fitz is not None:
        try:
            pdf_doc = fitz.open(stream=file_content, filetype="pdf")
            total_pages = len(pdf_doc)
            if getattr(pdf_doc, 'is_encrypted', False):
                try:
                    pdf_doc.authenticate("")
                except Exception:
                    pass
                if getattr(pdf_doc, 'is_encrypted', False):
                    pdf_doc.close()
                    return "[PDFError:Encrypted] 该 PDF 文件已被加密或设置了阅读密码，无法提取文字内容。\n请先解除密码后重新上传。"

            for page_num in range(min(total_pages, 500)):
                page = pdf_doc[page_num]
                try:
                    total_images += len(page.get_images())
                except Exception:
                    pass

                try:
                    blocks = page.get_text("blocks", sort=True)
                    page_blocks_text = "\n".join([b[4] for b in blocks if b[4].strip() and b[6] == 0])
                except Exception:
                    page_blocks_text = page.get_text("text", sort=True)

                if page_blocks_text.strip():
                    pages_text.append(page_blocks_text)

            pdf_doc.close()
            fitz_success = True
        except Exception as e_fitz:
            print(f"[PDF Extract] pymupdf 解析异常 ({e_fitz})，准备尝试 PyPDF2 降级...")

    if not fitz_success:
        try:
            reader = PyPDF2.PdfReader(BytesIO(file_content))
            total_pages = len(reader.pages)
            if getattr(reader, 'is_encrypted', False):
                try:
                    reader.decrypt("")
                except Exception:
                    pass
                if getattr(reader, 'is_encrypted', False):
                    return "[PDFError:Encrypted] 该 PDF 文件已被加密或设置了阅读密码，无法提取文字内容。\n请先解除密码后重新上传。"

            for page in reader.pages[:500]:
                t = page.extract_text() or ""
                if t.strip():
                    pages_text.append(t)
        except Exception as e_pypdf:
            return f"[PDFError:Corrupted] PDF 文件解析失败 ({str(e_pypdf)})。\n文件可能已损坏或格式不标准，建议导出为 TXT/DOCX 后重试。"

    raw_combined = "".join(pages_text).strip()
    if len(raw_combined) < 25:
        if total_images > 0 or total_pages > 0:
            return (
                "[PDFError:Scanned] 该 PDF 文件为纯图片/扫描件（未包含可提取的文字图层），AI 无法直接阅读并分析玩家风格。\n"
                "💡 建议：\n"
                "1. 请使用带有文字图层的 PDF（如聊天记录或网页直接导出/打印生成的 PDF）；\n"
                "2. 或直接上传导出好的 TXT、DOCX 文件或跑团网页链接；\n"
                "3. 或先使用 OCR 工具识别生成可复制文字的双层 PDF 后重试。"
            )
        return "[PDFError:Empty] 该 PDF 文件内容为空，未能提取到任何有效文字。"

    clean_text = clean_and_stitch_trpg_log_text(pages_text)
    if len(clean_text.strip()) < 20:
        clean_text = raw_combined

    if save_converted:
        try:
            if not converted_dir:
                converted_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdf_converted")
            os.makedirs(converted_dir, exist_ok=True)

            safe_name = re.sub(r'[^\w\u4e00-\u9fff.-]', '_', os.path.splitext(filename)[0])[:30]
            txt_path = os.path.join(converted_dir, f"{file_hash[:16]}_{safe_name}.txt")
            docx_path = os.path.join(converted_dir, f"{file_hash[:16]}_{safe_name}.docx")

            with open(txt_path, "w", encoding="utf-8") as f:
                f.write(clean_text)

            docx_bytes = convert_pdf_to_docx_bytes(clean_text, filename, total_pages)
            with open(docx_path, "wb") as f:
                f.write(docx_bytes)

            PDF_CONVERTED_CACHE[file_hash[:16]] = {
                'txt_path': txt_path,
                'docx_path': docx_path,
                'filename': filename,
                'safe_name': safe_name,
                'chars': len(clean_text),
                'pages': total_pages
            }
            print(f"[PDF Convert] 成功将 PDF 转为 TXT 与 DOCX: {safe_name} (共 {len(clean_text)} 字符, {total_pages} 页)")
        except Exception as e_conv:
            print(f"[PDF Convert] 生成 DOCX/TXT 缓存失败 (不影响分析): {e_conv}")

    return clean_text

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
            pdf_res = extract_and_convert_pdf(file_content, filename)
            if pdf_res.startswith('[PDFError:'):
                clean_err = re.sub(r'^\[PDFError:[^\]]+\]\s*', '', pdf_res).strip()
                return f"[ParseError]{clean_err}"
            text = pdf_res

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

def background_file_process(job_id, file_url, filename, mode='analyze', is_pro=False, is_kind=False, persona="", custom_prompt="", theme='default', is_ds=False, group_key="", user_key="", custom_name="", card_system="auto", backup_model="", backup_label="", user_name="", token_module="", target_qq="", log_sources=None, save_archive=True, custom_timeline="", identity_bindings=None, specified_identity=None):
    """后台任务：下载文件/拉取链接并根据模式进行分析，支持多文件合并、文件+链接复合串联、多模态原生文档阅读与输出多图"""
    print(f"[{job_id}] 开始处理任务: {filename}, Mode: {mode}")
    if custom_prompt:
        _cn_tip = f"（共享库: {custom_name}）" if custom_name else "（来自请求 payload）"
        print(f"[{job_id}] 已启用自定义提示词{_cn_tip}, 长度={len(custom_prompt)}")
    try:
        if isinstance(file_url, list):
            file_items = file_url
        elif file_url:
            file_items = [{'url': file_url, 'filename': filename or 'log.txt'}]
        else:
            file_items = []

        # 1. 若传入了网络链接源，优先拉取网络 Log
        link_sections = []
        if log_sources:
            print(f"[{job_id}] 检测到复合模式：正在拉取 {len(log_sources)} 个网络 Log 链接...")
            first_ls = log_sources[0] or {}
            ls_text, failures = fetch_and_join_logs(log_sources, first_ls.get('key'), first_ls.get('password'), first_ls.get('source'), identity_bindings=identity_bindings)
            if failures:
                print(f"[{job_id}] 部分网络链接拉取异常: {'；'.join(failures)}")
            if ls_text and ls_text.strip():
                link_sections.append({
                    'title': f"网络Log({len(log_sources)}段)",
                    'text': ls_text,
                    'hash': hashlib.md5(ls_text.encode('utf-8')).hexdigest()
                })

        # 2. 依次下载并解析所有文件
        session = get_session()
        file_sections = []
        single_image_content = None
        single_image_ext = ""

        for f_idx, item in enumerate(file_items, 1):
            f_url = item.get('url')
            f_name = item.get('filename') or f'file_{f_idx}.txt'
            print(f"[{job_id}] 正在下载/读取文件 ({f_idx}/{len(file_items)}): {f_name}")
            if os.path.exists(f_url) and os.path.isfile(f_url):
                with open(f_url, 'rb') as lf:
                    content = lf.read(50 * 1024 * 1024)
            else:
                resp = session.get(f_url, timeout=120, stream=True)
                resp.raise_for_status()

                content = b""
                downloaded = 0
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        content += chunk
                        downloaded += len(chunk)
                        if downloaded > 50 * 1024 * 1024:
                            print(f"[{job_id}] 警告：文件 {f_name} 超过 50MB，已被安全截断！")
                            break

            ext_i = os.path.splitext(f_name)[1].lower()
            if len(file_items) == 1 and not link_sections and ext_i in ['.jpg', '.jpeg', '.png', '.webp', '.bmp']:
                single_image_content = content
                single_image_ext = ext_i
                file_sections.append({
                    'title': f_name,
                    'text': '',
                    'content': content,
                    'hash': hashlib.md5(content).hexdigest()
                })
                continue

            txt = extract_text_from_file(content, f_name, card_system)
            if txt.startswith("[ParseError]"):
                clean_err = txt.replace("[ParseError]", "").strip()
                err_img = text_to_images(clean_err, f_name, "文件解析提示", theme)[0]
                JOB_CACHE[job_id]['status'] = 'error'
                JOB_CACHE[job_id]['msg'] = clean_err
                JOB_CACHE[job_id]['images'] = [err_img]
                return

            if not txt or len(txt.strip()) < 5:
                err_msg = f"❌ 文件【{f_name}】内容为空或未能提取到有效文字，无法进行分析。"
                err_img = text_to_images(err_msg, f_name, "文件解析提示", theme)[0]
                JOB_CACHE[job_id]['status'] = 'error'
                JOB_CACHE[job_id]['msg'] = err_msg
                JOB_CACHE[job_id]['images'] = [err_img]
                return

            file_hash = hashlib.md5(content).hexdigest()
            file_sections.append({
                'title': f_name,
                'text': txt,
                'content': content,
                'hash': file_hash
            })
            save_raw_log("file", file_hash[:16], txt)

        # 过滤内容完全相同的重复段落
        unique_sections = []
        seen_section_hashes = set()
        for sec in (link_sections + file_sections):
            sec_txt = sec.get('text', '').strip()
            sec_h = sec.get('hash') or hashlib.md5(sec_txt.encode('utf-8')).hexdigest()
            if sec_h in seen_section_hashes:
                print(f"[文件/链接去重] 发现重复内容段落: {sec.get('title')}，已自动剔除")
                continue
            seen_section_hashes.add(sec_h)
            unique_sections.append(sec)
        all_sections = unique_sections

        if not all_sections:
            err_msg = "❌ 未能获取到任何有效文件或链接内容。"
            err_img = text_to_images(err_msg, filename or "未命名", "输入为空", theme)[0]
            JOB_CACHE[job_id]['status'] = 'error'
            JOB_CACHE[job_id]['msg'] = err_msg
            JOB_CACHE[job_id]['images'] = [err_img]
            return

        # 对多段来源（包括网络链接与本地文件）按时间戳正序重排
        for s_idx, sec in enumerate(all_sections):
            s_t, e_t = _detect_log_time_range(None, sec.get('text', ''))
            if not s_t and sec.get('title'):
                s_t, e_t = _detect_log_time_range(None, sec.get('title', ''))
            sec['start_t'] = s_t
            sec['end_t'] = e_t
            sec['orig_idx'] = s_idx
        if len(all_sections) > 1:
            all_sections.sort(key=lambda s: (0, s['start_t'], s['orig_idx']) if s.get('start_t') else (1, s.get('orig_idx', 0), s.get('orig_idx', 0)))

        curr_start_t = min([s['start_t'] for s in all_sections if s.get('start_t')]) if any(s.get('start_t') for s in all_sections) else 0
        curr_end_t = max([s['end_t'] for s in all_sections if s.get('end_t')]) if any(s.get('end_t') for s in all_sections) else 0

        if custom_timeline:
            c_s, c_e = _detect_log_time_range(None, custom_timeline)
            if c_s:
                curr_start_t = c_s
                curr_end_t = c_e or c_s

        raw_text = ""
        calculated_statistics = []
        user_content = None

        is_player_style = bool(target_qq) or mode in ('player_style', 'style', 'pl_style', 'kp_style')
        is_log_mode = is_player_style or mode in ('log_analyze', 'log_recap', 'comic', 'comic_prompt', 'sheet_score')

        if single_image_content and not is_log_mode:
            if is_ds:
                raise Exception(f"{backup_label or BACKUP_MODEL_LABEL} 模型暂不支持直接读取纯图片格式，请取消备用模型参数使用默认的视觉模型！")
            mime_type = "image/jpeg" if single_image_ext in ['.jpg', '.jpeg'] else f"image/{single_image_ext[1:]}"
            base64_img = base64.b64encode(single_image_content).decode('utf-8')
            user_content = [
                {"type": "text", "text": f"文件名：{filename}\n请仔细观察这张图片/设定图，并严格按照系统设定的板块与要求进行分析。"},
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64_img}"}}
            ]
            content_hash = all_sections[0]['hash']
            text_ai = ""
        else:
            if len(all_sections) == 1:
                raw_text = all_sections[0]['text']
                display_filename = all_sections[0]['title']
            else:
                chunks = []
                for s_idx, sec in enumerate(all_sections, 1):
                    time_info = ""
                    if sec.get('start_t') and sec.get('end_t'):
                        s_d = time.strftime('%Y-%m-%d', time.localtime(sec['start_t']))
                        e_d = time.strftime('%Y-%m-%d', time.localtime(sec['end_t']))
                        time_info = f" ({s_d} ~ {e_d})" if s_d != e_d else f" ({s_d})"
                    elif sec.get('start_t'):
                        s_d = time.strftime('%Y-%m-%d', time.localtime(sec['start_t']))
                        time_info = f" ({s_d})"
                    chunks.append(
                        f"================================================\n"
                        f"【时间线第 {s_idx}/{len(all_sections)} 段: {sec['title']}{time_info}】\n"
                        f"================================================\n"
                        f"{sec['text']}"
                    )
                raw_text = "\n\n".join(chunks)
                display_parts = [sec['title'] for sec in all_sections]
                display_filename = " + ".join(display_parts)
                filename = display_filename

            if identity_bindings and raw_text:
                raw_text = apply_identity_bindings(raw_text, identity_bindings)

            if len(raw_text) > MAX_AI_CHARS:
                part = int(MAX_AI_CHARS * 0.4)
                mid = raw_text[part:-part].split('\n')
                step = max(1, int(len(mid)/100))
                text_ai = f"{raw_text[:part]}\n...[中间部分略]...\n{chr(10).join(mid[::step])}\n{raw_text[-part:]}"
            else:
                text_ai = raw_text

            content_hash = hashlib.md5("_".join([s['hash'] for s in all_sections]).encode('utf-8')).hexdigest()
            user_content = f"文件名/来源：{filename}\n内容如下：\n{text_ai}"

            if mode == 'log_analyze':
                calculated_statistics = calculate_log_statistics(raw_text)

        # ================= 1. 尝试触发文件省流缓存 =================
        hash_key = None
        if not is_pro:
            hash_str = f"file_log_stats_v5_{content_hash}_{mode}_{is_kind}_{persona}_{custom_prompt}_{theme}_{is_ds}_{card_system}_{target_qq}"
            hash_key = hashlib.md5(hash_str.encode('utf-8')).hexdigest()
            
            cached_images = get_daily_cache(hash_key)
            if cached_images:
                print(f"[{job_id}] 命中今日多源/文件内容缓存！省流模式启动，秒回历史图片。")
                JOB_CACHE[job_id]['status'] = 'done'
                JOB_CACHE[job_id]['images'] = cached_images
                return
        # ==========================================================

        # 3. 根据不同模式分配 Prompt 与 绘图标题
        report_title = "TRPG 模组解析报告"
        
        if is_player_style:
            target_user_input = str(target_qq or '').strip()
            user_name_input = str(user_name or req_data.get('user_name') or '').strip()
            player_stats = extract_player_profile_and_stats(raw_text, target_user_input, user_name=user_name_input)

            # 【核心拦截】：未匹配到目标人物/QQ时直接报错返回，禁止交由 LLM 产生幻觉
            if not player_stats.get('found'):
                err_msg = build_unmatched_target_error_message(target_user_input, player_stats)
                print(f"[{job_id}] 文件风格分析目标未匹配到: '{target_user_input}'，跳过大模型直接返回报错")
                err_img = text_to_images(err_msg, filename, "TRPG 风格分析未命中", theme)[0]
                JOB_CACHE[job_id]['status'] = 'error'
                JOB_CACHE[job_id]['msg'] = err_msg
                JOB_CACHE[job_id]['images'] = [err_img]
                return

            clean_target_qq = player_stats.get('clean_target_qq') or ""
            target_qqs = player_stats.get('target_qqs') or ([clean_target_qq] if clean_target_qq else [])
            target_qqs_str = "/".join(target_qqs) if target_qqs else clean_target_qq
            target_display_name = player_stats.get('display_name') or target_user_input or "玩家"
            if custom_timeline:
                file_timeline = custom_timeline
            else:
                m_dates = re.findall(r'\b(20\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?)\b', (raw_text[:3000] + raw_text[-3000:]))
                if m_dates:
                    norm_dates = sorted([d.replace('/', '-').replace('.', '-').replace('年', '-').replace('月', '-').replace('日', '') for d in m_dates])
                    file_timeline = f"{norm_dates[0]} ~ {norm_dates[-1]}" if norm_dates[0] != norm_dates[-1] else norm_dates[0]
                else:
                    m_fn_dates = re.findall(r'\b(20\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?)\b', filename or '')
                    if m_fn_dates:
                        norm_fn = sorted([d.replace('/', '-').replace('.', '-').replace('年', '-').replace('月', '-').replace('日', '') for d in m_fn_dates])
                        file_timeline = f"{norm_fn[0]} ~ {norm_fn[-1]}" if norm_fn[0] != norm_fn[-1] else norm_fn[0]
                    else:
                        file_timeline = "无指定时间轴 (依日志顺序)"

            report_title = f"TRPG 风格分析报告 ({target_display_name})"
            if custom_prompt:
                system_prompt = build_custom_player_style_prompt(custom_prompt, player_stats, target_user_input, calculated_statistics, theme)
            else:
                system_prompt = PLAYER_STYLE_SYSTEM_PROMPT
                system_prompt += format_target_player_stats_for_prompt(player_stats, target_user_input, timeline_str=file_timeline)

            # 检索历史相邻档案并注入系统提示词 (前2次 + 后1次)
            if specified_identity:
                norm_sp = str(specified_identity).strip().upper()
                target_identity = "KP" if norm_sp in ("KP", "DM", "主持", "主持人", "守秘人") else ("PL" if norm_sp in ("PL", "玩家") else ("KP" if player_stats.get('is_kp') else "PL"))
            else:
                target_identity = "KP" if player_stats.get('is_kp') else "PL"
            target_for_history = f"{target_display_name} {clean_target_qq}".strip() if clean_target_qq else (target_display_name or target_user_input)
            _, _, hist_prompt_text = get_adjacent_historical_records(
                target_user=target_for_history,
                curr_start_t=curr_start_t,
                curr_end_t=curr_end_t,
                identity=target_identity,
                user_key=user_key
            )
            if hist_prompt_text:
                system_prompt += hist_prompt_text
                print(f"[{job_id}] 文件任务已成功注入时序相邻历史档案参考 (identity={target_identity})")
            internal_qqs = player_stats.get('internal_target_qqs') or target_qqs
            text_ai = build_player_focused_log_text(raw_text, target_qq=internal_qqs, target_aliases=player_stats.get('aliases'), max_chars=MAX_AI_CHARS)
            user_badge = f"{target_display_name} (QQ:{target_qqs_str})" if target_qqs_str else target_display_name
            user_content = f"文件名：{filename}\n目标分析对象：{user_badge}\n日志内容如下：\n{text_ai}"

        # 【新增】：检测并覆盖（sheet_score 模式除外，因为要保留结构化输出模板）
        elif custom_prompt and mode != 'sheet_score':
            report_title = "TRPG 自定义分析报告"
            system_prompt = build_custom_log_prompt(custom_prompt, calculated_statistics, theme) if mode == 'log_analyze' else custom_prompt
        
        elif mode == 'log_analyze':
            report_title = "TRPG 跑团日志评分"
            if is_kind: system_prompt = KIND_SYSTEM_PROMPT
            elif is_pro: system_prompt = PRO_SYSTEM_PROMPT
            else: system_prompt = DEFAULT_SYSTEM_PROMPT
            system_prompt += "\n\n" + LOG_EVALUATION_REQUIREMENTS
            system_prompt += format_log_statistics_for_prompt(calculated_statistics)

        elif mode == 'sheet_score':
            # 【新增】：角色卡评分模式（读取姓名/年龄/属性/技能/背景故事并打分）
            dnd_sheet_groups = (("起源", "角色"), ("主要", "主要情况"), ("背包",), ("施法",))
            detected_dnd = card_system == 'dnd' or sum(
                any(f"工作表：{name}" in raw_text for name in aliases) for aliases in dnd_sheet_groups
            ) >= 2
            if custom_prompt:
                # 【联动 v2】：命中共享提示词库时，自定义提示词完全接管，不再叠加默认评分模板，
                # 避免默认模板的结构化输出要求干扰自定义风格发挥。
                # 注意：此时后文的摘要抽取与自动存卡会跳过（因为不能保证输出遵循默认格式）。
                report_title = "DND 角色卡分析 (自定义)" if detected_dnd else "COC 角色卡分析 (自定义)"
                system_prompt = custom_prompt
            else:
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

        # 【联动】：本地 Log 同样先按 QQ 锁定玩家卡库，再匹配角色名。
        if (is_player_style or mode in ('log_analyze', 'log_recap')) and raw_text:
            try:
                card_target_key = clean_target_qq if is_player_style and clean_target_qq else user_key
                matched_cards = find_matching_cards(raw_text, user_key=card_target_key)
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
        
        if is_ds:
            validate_model_endpoint(DS_API_KEY, DS_BASE_URL, backup_label or BACKUP_MODEL_LABEL)
        else:
            validate_model_endpoint(AI_API_KEY, AI_BASE_URL, "主模型")
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
        print(f"[{job_id}] LLM finish_reason={getattr(resp.choices[0], 'finish_reason', '')}, output_chars={len(result_text or '')}")
        token_usage = f" | Tokens: {usage_record['total_tokens']}" if usage_record else ""
        
        result_text, final_theme = extract_theme_from_text(result_text, theme)

        # 核心：风格分析模式下，优先提取大模型首行的【身份：PL/KP/双重】标签来决定图片大标题
        if is_player_style:
            llm_id_match = re.search(r'【身份[:：]\s*(PL|KP|双重|玩家|主持|主持人|DM|守秘人)\s*】', result_text, re.IGNORECASE)
            llm_identity = None
            if llm_id_match:
                tag = llm_id_match.group(1).upper()
                if tag in ('PL', '玩家'):
                    llm_identity = 'PL'
                elif tag in ('KP', '主持', '主持人', 'DM', '守秘人'):
                    llm_identity = 'KP'
                elif tag in ('双重', '兼有'):
                    llm_identity = '双重'

            # 确定有效身份：优先尊重用户显式指定的身份，若未指定则采纳 LLM 识别的身份
            norm_sp = str(specified_identity or '').strip().upper()
            spec_clean = 'KP' if norm_sp in ('KP', 'DM', '主持', '主持人', '守秘人') else ('PL' if norm_sp in ('PL', '玩家') else ('双重' if norm_sp in ('双重', '兼有', '全能') else None))
            effective_identity = spec_clean or llm_identity

            # 从正文中剥离身份标签，避免污染卡片排版
            result_text = re.sub(r'^\s*【身份[:：][^】]+】\s*(?:\r?\n)?', '', result_text, flags=re.IGNORECASE).strip()

            disp_name = target_display_name
            if not custom_prompt:
                if effective_identity == 'PL':
                    report_title = f"TRPG 玩家跑团风格报告 ({disp_name})"
                elif effective_identity == 'KP':
                    report_title = f"TRPG 主持带团风格报告 ({disp_name})"
                elif effective_identity == '双重':
                    report_title = f"TRPG 全能跑团/主持风格报告 ({disp_name})"
                else:
                    fallback_role = "主持" if player_stats.get('is_kp') else "玩家"
                    report_title = f"TRPG {fallback_role}跑团风格报告 ({disp_name})"
            else:
                custom_prefix = f"{custom_name}·" if custom_name else "自定义·"
                if effective_identity == 'PL':
                    report_title = f"TRPG {custom_prefix}玩家风格报告 ({disp_name})"
                elif effective_identity == 'KP':
                    report_title = f"TRPG {custom_prefix}主持风格报告 ({disp_name})"
                elif effective_identity == '双重':
                    report_title = f"TRPG {custom_prefix}全能风格报告 ({disp_name})"
                else:
                    fallback_role = "主持" if player_stats.get('is_kp') else "玩家"
                    report_title = f"TRPG {custom_prefix}{fallback_role}风格报告 ({disp_name})"

        # 4. 多图渲染与保存
        # 命中自定义配置时默认只保留用户正文/自定义图表；若提示词明确要求
        # 普通版表格，则恢复“玩家综合评估”统计页。
        if is_player_style:
            images_list = render_log_report_images(
                result_text, filename, report_title, final_theme, token_usage,
                calculated_statistics, include_standard_evaluation=False
            )
        else:
            include_standard_evaluation = (not bool(custom_prompt)) or custom_prompt_requests_standard_evaluation(custom_prompt)
            images_list = render_log_report_images(
                result_text, filename, report_title, final_theme, token_usage,
                calculated_statistics, include_standard_evaluation=include_standard_evaluation
            ) if mode == 'log_analyze' else text_to_images(result_text, filename, report_title, final_theme, token_usage)
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['images'] = images_list

        # 风格分析模式下，且允许自动存档：保存玩家成长档案
        if is_player_style and save_archive:
            try:
                sources_list = [f.get('filename') or 'file' for f in file_items] + ([s.get('key', '') for s in log_sources] if log_sources else [])
                # 计算时间跨度
                if not file_timeline:
                    if custom_timeline:
                        file_timeline = custom_timeline
                    else:
                        m_dates = re.findall(r'\b(20\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?)\b', (raw_text[:3000] + raw_text[-3000:]))
                        if m_dates:
                            norm_dates = sorted([d.replace('/', '-').replace('.', '-').replace('年', '-').replace('月', '-').replace('日', '') for d in m_dates])
                            file_timeline = f"{norm_dates[0]} ~ {norm_dates[-1]}" if norm_dates[0] != norm_dates[-1] else norm_dates[0]
                        else:
                            m_fn_dates = re.findall(r'\b(20\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?)\b', filename or '')
                            if m_fn_dates:
                                norm_fn = sorted([d.replace('/', '-').replace('.', '-').replace('年', '-').replace('月', '-').replace('日', '') for d in m_fn_dates])
                                file_timeline = f"{norm_fn[0]} ~ {norm_fn[-1]}" if norm_fn[0] != norm_fn[-1] else norm_fn[0]
                            else:
                                file_timeline = "无指定时间轴 (依日志顺序)"
                target_user_val = f"{target_display_name} {clean_target_qq}".strip() if clean_target_qq else (target_display_name or target_user_input)
                archive_dir = save_player_style_archive(
                    target_user=target_user_val,
                    result_text=result_text,
                    images_list=images_list,
                    sources=sources_list,
                    job_id=job_id,
                    user_key=user_key,
                    stats=player_stats,
                    timeline_str=file_timeline,
                    report_title=report_title,
                    start_t=curr_start_t,
                    end_t=curr_end_t,
                    specified_identity=effective_identity
                )
                if archive_dir:
                    print(f"[{job_id}] 文件任务玩家风格成长档案已持久化保存至: {archive_dir}")
            except Exception as e_arc:
                print(f"[{job_id}] 保存风格成长档案异常: {e_arc}")

        # 【新增】：角色卡评分模式额外抽取结构化字段供前端展示 + 联动存卡
        # 【联动 v2】：命中共享提示词库时（custom_prompt 非空），输出已被自定义提示词接管，
        # 默认结构化格式不再有效，因此摘要抽取与自动存卡整体跳过。
        if mode == 'sheet_score' and custom_prompt:
            print(f"[{job_id}] sheet_score 命中自定义提示词接管，跳过摘要抽取与自动存卡")
        elif mode == 'sheet_score':
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
                    "appearance": full.get("appearance", ""),
                    "personality": full.get("personality", ""),
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

def _to_score(value, default=0):
    try:
        match = re.search(r'-?\d+(?:\.\d+)?', str(value or '').replace(',', ''))
        return max(0, min(100, int(float(match.group(0))))) if match else default
    except (TypeError, ValueError):
        return default

def _to_count(value, default=0):
    try:
        match = re.search(r'\d+', str(value or '').replace(',', ''))
        return max(0, int(match.group(0))) if match else default
    except (TypeError, ValueError):
        return default

def _to_percent(value):
    try:
        match = re.search(r'-?\d+(?:\.\d+)?', str(value or '').replace(',', ''))
        return float(match.group(0)) if match else 0.0
    except (TypeError, ValueError):
        return 0.0

def _chart_number_list(value):
    """Parse chart values from Markdown-friendly comma/pipe separated text."""
    if isinstance(value, (list, tuple)):
        raw_values = value
    else:
        raw_values = re.split(r'[|,，、/\\s]+', str(value or '').strip())
    values = []
    for raw in raw_values:
        match = re.search(r'-?\d+(?:\.\d+)?', str(raw or ''))
        if match:
            values.append(max(0.0, min(100.0, float(match.group(0)))))
    return values

def _chart_text_list(value):
    if isinstance(value, (list, tuple)):
        return [str(item).strip() for item in value if str(item).strip()]
    return [item.strip() for item in re.split(r'\s*[|,，、/]\s*', str(value or '')) if item.strip()]

def _chart_key_value(line):
    match = re.match(r'^\s*([^:：]+?)\s*[:：]\s*(.*?)\s*$', line)
    return (match.group(1).strip(), match.group(2).strip()) if match else (None, None)

def _normalize_chart_type(value):
    text = str(value or '').strip().casefold()
    if any(token in text for token in ('bar', '柱状', '条形')):
        return 'bar'
    return 'radar'

def _chart_curve_key(value):
    normalized = re.sub(r'[\s_\-]+', '', str(value or '').strip().casefold())
    aliases = {
        'low': 'low_threshold', 'lower': 'low_threshold', 'lowthreshold': 'low_threshold',
        'lowscore': 'low_threshold', '低分': 'low_threshold', '低分阈值': 'low_threshold', '内收阈值': 'low_threshold',
        'lowpower': 'low_power', '低分幂': 'low_power', '内收强度': 'low_power',
        'high': 'high_threshold', 'upper': 'high_threshold', 'highthreshold': 'high_threshold',
        'highscore': 'high_threshold', '高分': 'high_threshold', '高分阈值': 'high_threshold', '外收阈值': 'high_threshold',
        'highpower': 'high_power', '高分幂': 'high_power', '外收强度': 'high_power',
    }
    return aliases.get(normalized, normalized if normalized in ('low_threshold', 'low_power', 'high_threshold', 'high_power') else None)

def _normalize_chart_curve(value=None):
    """Normalize the optional custom radar curve controls."""
    curve = {'low_threshold': 60.0, 'low_power': 2.2, 'high_threshold': 60.0, 'high_power': 0.85}
    if isinstance(value, dict):
        items = value.items()
    else:
        items = []
    for raw_key, raw_value in items:
        key = _chart_curve_key(raw_key)
        if not key:
            continue
        try:
            number = float(raw_value)
        except (TypeError, ValueError):
            continue
        if key.endswith('threshold'):
            curve[key] = max(0.0, min(100.0, number))
        else:
            curve[key] = max(0.1, min(5.0, number))
    if curve['high_threshold'] < curve['low_threshold']:
        curve['high_threshold'] = curve['low_threshold']
    return curve

def _parse_chart_curve(value=None, base=None):
    """Read curve settings from JSON objects or ``low=60, high=80`` text."""
    curve = _normalize_chart_curve(base)
    if isinstance(value, dict):
        return _normalize_chart_curve({**curve, **value})
    text = str(value or '')
    pairs = re.findall(r'([A-Za-z_\-一-龥]+)\s*[:=]\s*(-?\d+(?:\.\d+)?)', text)
    if pairs:
        curve.update({key: number for key, number in ((_chart_curve_key(k), float(v)) for k, v in pairs) if key})
    return _normalize_chart_curve(curve)

def _parse_chart_json(payload):
    if not isinstance(payload, dict):
        return None
    axes = payload.get('axes') or payload.get('labels') or payload.get('坐标') or payload.get('维度')
    series_data = payload.get('series') or payload.get('数据') or payload.get('系列')
    series = []
    if isinstance(series_data, dict):
        series = [{'name': name, 'values': values} for name, values in series_data.items()]
    elif isinstance(series_data, list):
        for item in series_data:
            if isinstance(item, dict):
                series.append({'name': item.get('name') or item.get('名称') or '系列', 'values': item.get('values') or item.get('数值') or []})
    if not axes or not series:
        return None
    axes = _chart_text_list(axes)[:10]
    normalized_series = []
    for item in series[:10]:
        values = _chart_number_list(item.get('values'))[:len(axes)]
        if values:
            normalized_series.append({'name': str(item.get('name') or '系列').strip(), 'values': values})
    if not normalized_series:
        return None
    return {
        'type': _normalize_chart_type(payload.get('type') or payload.get('chart_type') or payload.get('图表类型')),
        'title': str(payload.get('title') or payload.get('标题') or '自定义图表').strip(),
        'axes': axes,
        'series': normalized_series,
        'curve': _parse_chart_curve(payload.get('curve') or payload.get('radar_curve') or payload.get('曲线') or payload.get('抖折')),
    }

def _parse_chart_markdown_table(lines, chart_type='radar', title='自定义图表', curve=None):
    rows = []
    for line in lines:
        if not line.strip().startswith('|'):
            continue
        cells = [cell.strip() for cell in line.strip().strip('|').split('|')]
        if cells and any(cells):
            rows.append(cells)
    if len(rows) < 2:
        return None
    rows = [row for row in rows if not all(re.fullmatch(r':?-{2,}:?', cell or '') for cell in row)]
    if len(rows) < 2:
        return None
    header = rows[0]
    if len(header) < 2:
        return None
    first_header = header[0].casefold()
    if first_header in ('坐标', '维度', '指标', 'axis', 'axes', 'label', 'labels'):
        axes = [row[0] for row in rows[1:] if row and row[0]][:10]
        series = []
        for column, name in enumerate(header[1:], 1):
            values = []
            for row in rows[1:len(axes) + 1]:
                values.append(_chart_number_list(row[column] if column < len(row) else '')[0] if column < len(row) and _chart_number_list(row[column]) else 0.0)
            if name.strip():
                series.append({'name': name.strip(), 'values': values})
    else:
        axes = [item for item in header[1:] if item][:10]
        series = []
        for row in rows[1:11]:
            if not row or not row[0]:
                continue
            series.append({'name': row[0], 'values': [_chart_number_list(item)[0] if _chart_number_list(item) else 0.0 for item in row[1:len(axes) + 1]]})
    if not axes or not series:
        return None
    return {'type': chart_type, 'title': title, 'axes': axes, 'series': series[:10], 'curve': _normalize_chart_curve(curve)}

def parse_custom_chart_blocks(text):
    """Read optional Markdown fenced logai-chart blocks from model output."""
    pattern = re.compile(r'```\s*(?:logai-chart|logai_chart|chart)\s*\n(.*?)```', re.IGNORECASE | re.DOTALL)
    charts = []
    for match in pattern.finditer(str(text or '')):
        body = match.group(1).strip()
        if not body:
            continue
        try:
            if body.startswith('{'):
                chart = _parse_chart_json(json.loads(body))
                if chart:
                    charts.append(chart)
                    continue
        except (TypeError, ValueError, json.JSONDecodeError):
            pass
        chart_type, title = 'radar', '自定义图表'
        axes, series = [], []
        curve = _normalize_chart_curve()
        table_lines = []
        in_series = False
        in_curve = False
        for raw_line in body.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line.startswith('|'):
                table_lines.append(line)
                continue
            key, value = _chart_key_value(line)
            if key:
                key_fold = key.casefold()
                if key_fold in ('type', 'chart_type', '图表类型', '类型'):
                    chart_type = _normalize_chart_type(value)
                elif key_fold in ('title', '标题', '名称'):
                    title = value or title
                elif key_fold in ('axes', 'labels', '坐标', '坐标轴', '维度', '指标'):
                    axes = _chart_text_list(value)[:10]
                    in_curve = False
                elif key_fold in ('series', '数据', '系列'):
                    in_series = True
                    in_curve = False
                elif key_fold in ('curve', 'radar_curve', '曲线', '抖折', '收敛', '雷达曲线'):
                    curve = _parse_chart_curve(value, curve)
                    in_curve = True
                elif _chart_curve_key(key):
                    curve = _parse_chart_curve({key: value}, curve)
                    in_curve = True
                elif in_series or not axes:
                    values = _chart_number_list(value)
                    if values:
                        series.append({'name': key.strip(), 'values': values})
                continue
            if in_series and ':' in line:
                name, value = line.split(':', 1)
                values = _chart_number_list(value)
                if values:
                    series.append({'name': name.strip(), 'values': values})
        if table_lines:
            table_chart = _parse_chart_markdown_table(table_lines, chart_type, title, curve)
            if table_chart:
                charts.append(table_chart)
                continue
        if axes and series:
            charts.append({'type': chart_type, 'title': title, 'axes': axes[:10], 'series': series[:10], 'curve': curve})
    normalized = []
    for chart in charts:
        axes = _chart_text_list(chart.get('axes'))[:10]
        series = []
        for item in chart.get('series', [])[:10]:
            values = _chart_number_list(item.get('values'))[:len(axes)]
            values += [0.0] * (len(axes) - len(values))
            if axes:
                series.append({'name': str(item.get('name') or '系列').strip(), 'values': values})
        if axes and series:
            normalized.append({
                'type': _normalize_chart_type(chart.get('type')),
                'title': str(chart.get('title') or '自定义图表').strip(),
                'axes': axes,
                'series': series,
                'curve': _normalize_chart_curve(chart.get('curve')),
            })
    return normalized

def strip_custom_chart_blocks(text):
    pattern = re.compile(r'```\s*(?:logai-chart|logai_chart|chart)\s*\n.*?```', re.IGNORECASE | re.DOTALL)
    return pattern.sub('', str(text or '')).strip()

def parse_log_evaluation(text, calculated_stats=None):
    lines = [line.strip() for line in str(text or '').splitlines() if line.strip().startswith('|') and line.strip().endswith('|')]
    stats, scores = {}, {}
    identified_names, identification_seen = [], False
    for index, line in enumerate(lines):
        cells = [cell.strip() for cell in line.strip('|').split('|')]
        if len(cells) < 2:
            continue
        lowered = ''.join(cells).replace(' ', '')
        if '是否玩家' in lowered and ('角色名' in lowered or '玩家' in lowered):
            identification_seen = True
            for row in lines[index + 1:]:
                values = [cell.strip() for cell in row.strip('|').split('|')]
                row_text = ''.join(values).replace(' ', '')
                if '创新' in row_text and '武力' in row_text and '交涉' in row_text:
                    break
                if len(values) < 2 or set(':- ') >= set(''.join(values)):
                    continue
                name = values[0].replace('**', '').strip()
                decision = values[1].strip().casefold()
                if not name or name in ('玩家', '角色名'):
                    continue
                if decision in ('是', '是的', 'yes', 'y', 'true', '1'):
                    identified_names.append(name)
        elif 'RP字数' in lowered and '骰点次数' in lowered:
            for row in lines[index + 1:]:
                values = [cell.strip() for cell in row.strip('|').split('|')]
                row_text = ''.join(values).replace(' ', '')
                if all(word in row_text for word in ('创新', '武力', '交涉', '幸运', '扮演', '认真')):
                    break
                if len(values) < 5 or set(':- ') >= set(''.join(values)):
                    continue
                name = values[0].replace('**', '').strip()
                if name and name not in ('玩家', '角色名'):
                    stats[name] = {'rp': _to_count(values[1]), 'outside': max(0, min(100, _to_percent(values[2]))), 'rolls': _to_count(values[3]), 'roll_luck': _to_score(values[4])}
        elif all(word in lowered for word in ('创新', '武力', '交涉', '幸运', '扮演', '认真')):
            for row in lines[index + 1:]:
                values = [cell.strip() for cell in row.strip('|').split('|')]
                if len(values) < 7 or set(':- ') >= set(''.join(values)):
                    continue
                name = values[0].replace('**', '').strip()
                if name and name not in ('玩家', '角色名'):
                    scores[name] = {'innovation': _to_score(values[1]), 'combat': _to_score(values[2]), 'social': _to_score(values[3]), 'luck': _to_score(values[4]), 'roleplay': _to_score(values[5]), 'focus': _to_score(values[6])}
    calculated_stats = calculated_stats or []
    calculated_by_name = {}
    for item in calculated_stats:
        for alias in item.get('aliases', []) + [item.get('name', '')]:
            if alias:
                calculated_by_name[_log_stat_name_key(alias)] = item
    players = []
    # 六维表由模型识别真正参与跑团的 PC；存在该表时不把临时旁观者塞入雷达图。
    # 有玩家识别表时以 LLM 的 PC 判断为准；否则兼容旧输出，按六维表/统计表回退。
    names = identified_names if identification_seen else (list(scores.keys()) or list(stats.keys()) or [item.get('name', '') for item in calculated_stats])
    for name in names:
        item = {
            'name': name, 'rp': 0, 'outside': 0.0, 'rolls': 0,
            'roll_average': 0.0, 'roll_median': 0.0, 'roll_successes': 0,
            'roll_success_known': 0, 'roll_success_rate': None, 'roll_luck': 0,
            'innovation': 0, 'combat': 0, 'social': 0, 'luck': 0,
            'roleplay': 0, 'focus': 0
        }
        calculated = calculated_by_name.get(_log_stat_name_key(name), {})
        item.update(scores.get(name, {})); item.update(calculated)
        if not calculated:
            item.update(stats.get(name, {}))
        if calculated:
            item['luck'] = item.get('roll_luck', 0)
        players.append(item)
    return players

def _radar_visual_ratio(value):
    """仅夸张雷达图形状；实际评分数字保持不变。"""
    score = max(0.0, min(100.0, float(value or 0)))
    if score < 60:
        return 0.60 * math.pow(score / 60.0, 2.2)
    return 0.60 + 0.40 * math.pow((score - 60.0) / 40.0, 0.85)

def _custom_radar_visual_ratio(value, curve=None):
    """Apply a prompt-configurable piecewise curve to custom radar values."""
    score = max(0.0, min(100.0, float(value or 0)))
    config = _normalize_chart_curve(curve)
    low_threshold = config['low_threshold']
    high_threshold = max(low_threshold, config['high_threshold'])
    if low_threshold > 0 and score <= low_threshold:
        return (low_threshold / 100.0) * math.pow(score / low_threshold, config['low_power'])
    if score <= high_threshold or high_threshold >= 100:
        return score / 100.0
    span = max(0.0001, 100.0 - high_threshold)
    return (high_threshold / 100.0) + (1.0 - high_threshold / 100.0) * math.pow(
        (score - high_threshold) / span, config['high_power']
    )

def _draw_radar(draw, center, radius, values, labels, fonts, colors):
    cx, cy = center
    points = []
    for i in range(6):
        angle = -math.pi / 2 + i * math.pi / 3
        points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    data = []
    for point, value in zip(points, values):
        ratio = _radar_visual_ratio(value)
        data.append((cx + (point[0] - cx) * ratio, cy + (point[1] - cy) * ratio))
    # 雷达区域使用半透明填充，网格和标签随后绘制以保持清晰。
    fill_rgb = ImageColor.getrgb(colors['italic']) if isinstance(colors['italic'], str) else tuple(colors['italic'][:3])
    draw.polygon(data, fill=fill_rgb + (72,))
    for level in (0.25, 0.5, 0.75, 1.0):
        ring = [(cx + (x - cx) * level, cy + (y - cy) * level) for x, y in points]
        draw.line(ring + [ring[0]], fill=colors['border'], width=1)
    for point, label in zip(points, labels):
        draw.line([(cx, cy), point], fill=colors['border'], width=1)
        draw.text((point[0] - fonts['small'].getlength(label) / 2, point[1] - 12), label, font=fonts['small'], fill=colors['text'])
    draw.line(data + [data[0]], fill=colors['highlight'], width=3)
    for x, y in data:
        draw.ellipse((x - 5, y - 5, x + 5, y + 5), fill=colors['highlight'])

def _chart_colors(colors):
    base = [colors['highlight'], colors['italic'], (46, 134, 193), (39, 174, 96), (142, 68, 173), (230, 126, 34), (22, 160, 133), (192, 57, 43), (127, 140, 141), (52, 73, 94)]
    return [ImageColor.getrgb(color) if isinstance(color, str) else tuple(color[:3]) for color in base]

def _custom_chart_render_type(chart):
    return 'bar' if len((chart or {}).get('axes', [])) <= 2 else 'radar'

def _draw_custom_radar(img, center, radius, chart, fonts, colors):
    draw = ImageDraw.Draw(img)
    axes = chart['axes'][:10]
    count = len(axes)
    if count < 3:
        return
    cx, cy = center
    points = []
    for index in range(count):
        angle = -math.pi / 2 + index * math.tau / count
        points.append((cx + math.cos(angle) * radius, cy + math.sin(angle) * radius))
    for level in (0.25, 0.5, 0.75, 1.0):
        ring = [(cx + (x - cx) * level, cy + (y - cy) * level) for x, y in points]
        draw.line(ring + [ring[0]], fill=colors['border'], width=1)
    for point, label in zip(points, axes):
        draw.line([(cx, cy), point], fill=colors['border'], width=1)
        text_width = fonts['small'].getlength(label)
        draw.text((point[0] - text_width / 2, point[1] - 12), label, font=fonts['small'], fill=colors['text'])
    palette = _chart_colors(colors)
    curve = chart.get('curve')
    for series_index, series in enumerate(chart['series'][:10]):
        color = palette[series_index % len(palette)]
        values = (series.get('values') or [])[:count]
        values += [0.0] * (count - len(values))
        data = []
        for point, value in zip(points, values):
            ratio = _custom_radar_visual_ratio(value, curve)
            data.append((cx + (point[0] - cx) * ratio, cy + (point[1] - cy) * ratio))
        layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).polygon(data, fill=color + (55,))
        img.alpha_composite(layer)
        draw = ImageDraw.Draw(img)
        draw.line(data + [data[0]], fill=color, width=3)
        for x, y in data:
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=color)

def _draw_custom_bars(draw, area, chart, fonts, colors):
    left, top, right, bottom = area
    axes = chart['axes'][:10]
    series = chart['series'][:10]
    palette = _chart_colors(colors)
    chart_height = bottom - top
    chart_width = right - left
    for level in range(0, 101, 20):
        y = bottom - chart_height * level / 100
        draw.line((left, y, right, y), fill=colors['border'], width=1)
        draw.text((left - 42, y - 10), str(level), font=fonts['small'], fill=colors['quote'])
    group_width = chart_width / max(1, len(axes))
    bar_width = max(8, min(55, group_width * 0.72 / max(1, len(series))))
    for axis_index, axis in enumerate(axes):
        group_left = left + axis_index * group_width + group_width * 0.14
        label_width = fonts['small'].getlength(axis)
        draw.text((group_left + group_width * 0.36 - label_width / 2, bottom + 14), axis, font=fonts['small'], fill=colors['text'])
        for series_index, item in enumerate(series):
            values = item.get('values') or []
            value = values[axis_index] if axis_index < len(values) else 0
            x0 = group_left + series_index * bar_width
            y0 = bottom - chart_height * max(0.0, min(100.0, float(value))) / 100
            draw.rectangle((x0, y0, x0 + bar_width - 3, bottom), fill=palette[series_index % len(palette)])

def _custom_chart_fit_text(text, font, max_width):
    """Keep chart labels inside their cells without changing the table layout."""
    value = str(text or '')
    if max_width <= 0 or font.getlength(value) <= max_width:
        return value
    suffix = '…'
    while value and font.getlength(value + suffix) > max_width:
        value = value[:-1]
    return (value.rstrip() + suffix) if value else suffix

def _draw_custom_data_table(draw, chart, area, fonts, colors):
    """Render the exact coordinate values below the custom chart."""
    left, top, right, bottom = area
    axes = chart.get('axes', [])[:10]
    series = chart.get('series', [])[:10]
    if not axes:
        return bottom

    title_font = fonts['bold']
    header_font = fonts['bold']
    cell_font = fonts['small']
    draw.text((left, top), '具体数据（0-100）', font=title_font, fill=colors['title'])
    table_top = top + 42
    name_width = 180
    table_width = right - left
    axis_width = max(64, (table_width - name_width) / max(1, len(axes)))
    row_height = 44
    table_bottom = table_top + row_height * (len(series) + 1)
    draw.rectangle((left, table_top, right, table_bottom), outline=colors['border'], width=2)

    # Header and column separators.
    draw.rectangle((left + 1, table_top + 1, right - 1, table_top + row_height - 1), fill=colors['header_bg'])
    x = left
    draw.line((x + name_width, table_top, x + name_width, table_bottom), fill=colors['border'], width=1)
    draw.text((x + 12, table_top + 11), '系列', font=header_font, fill=colors['header_text'])
    x += name_width
    for axis in axes:
        draw.text(
            (x + max(4, (axis_width - cell_font.getlength(_custom_chart_fit_text(axis, cell_font, axis_width - 12))) / 2),
             table_top + 11),
            _custom_chart_fit_text(axis, cell_font, axis_width - 12),
            font=cell_font,
            fill=colors['header_text'],
        )
        x += axis_width
        draw.line((x, table_top, x, table_bottom), fill=colors['border'], width=1)

    # Data rows, preserving the numeric values supplied by the model.
    for row_index, item in enumerate(series, 1):
        y = table_top + row_index * row_height
        if row_index % 2 == 0:
            draw.rectangle((left + 1, y + 1, right - 1, y + row_height - 1), fill=colors['bg'])
        draw.line((left, y, right, y), fill=colors['border'], width=1)
        name = _custom_chart_fit_text(item.get('name') or '系列', cell_font, name_width - 20)
        draw.text((left + 12, y + 11), name, font=cell_font, fill=colors['text'])
        values = item.get('values') or []
        x = left + name_width
        for axis_index in range(len(axes)):
            value = values[axis_index] if axis_index < len(values) else 0
            try:
                numeric = float(value)
                value_text = str(int(numeric)) if numeric.is_integer() else f'{numeric:.1f}'
            except (TypeError, ValueError):
                value_text = '-'
            value_text = _custom_chart_fit_text(value_text, cell_font, axis_width - 12)
            draw.text((x + max(4, (axis_width - cell_font.getlength(value_text)) / 2), y + 11), value_text,
                      font=cell_font, fill=colors['text'])
            x += axis_width
    return table_bottom

def render_custom_chart_page(chart, file_title, report_title, theme='default', token_usage=''):
    """Render custom chart data; 1-2 axes use bars, 3-10 axes use radar."""
    colors = get_theme_config(theme)
    fonts = load_markdown_fonts(colors['font_type'])
    axes = chart.get('axes', [])[:10]
    chart = dict(chart, axes=axes, series=chart.get('series', [])[:10])
    chart_type = _custom_chart_render_type(chart)
    width = 1200
    # Leave enough room for the value table and let larger charts grow vertically.
    table_top = 655
    height = max(900, table_top + 42 + 44 * (len(chart['series']) + 1) + 78)
    img = Image.new('RGBA', (width, height), colors['bg'] + (255,))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, width, 115), fill=colors['header_bg'])
    draw.text((50, 24), str(chart.get('title') or '自定义图表'), font=fonts['title'], fill=colors['header_text'])
    mode_text = '柱状图' if chart_type == 'bar' else '雷达图'
    draw.text((50, 78), f'{report_title} · {file_title[:35]} · {mode_text}', font=fonts['small'], fill=colors['header_text'])
    if chart_type == 'bar':
        _draw_custom_bars(draw, (100, 180, 820, 590), chart, fonts, colors)
        legend_x = 890
    else:
        # A smaller radar leaves a clean right column for the legend and a full-width
        # table below for the exact values behind the visualisation.
        _draw_custom_radar(img, (350, 365), 170, chart, fonts, colors)
        draw = ImageDraw.Draw(img)
        legend_x = 760
    legend_y = 190
    palette = _chart_colors(colors)
    draw.text((legend_x, legend_y - 38), '数据系列', font=fonts['bold'], fill=colors['title'])
    for index, series in enumerate(chart['series'][:10]):
        color = palette[index % len(palette)]
        y = legend_y + index * 38
        draw.rectangle((legend_x, y + 8, legend_x + 20, y + 28), fill=color)
        draw.text((legend_x + 32, y), str(series.get('name') or '系列'), font=fonts['normal'], fill=colors['text'])
    table_bottom = _draw_custom_data_table(draw, chart, (50, table_top, width - 50, height - 70), fonts, colors)
    footer_y = max(table_bottom + 20, height - 42)
    token_suffix = str(token_usage or '')
    draw.text((50, footer_y), f'自定义图表 · 坐标最多保留前10项{token_suffix}', font=fonts['small'], fill=colors['quote'])
    buf = BytesIO(); img.convert('RGB').save(buf, 'PNG'); return buf.getvalue()

def custom_prompt_requests_standard_evaluation(custom_prompt):
    """Return whether a custom configuration explicitly asks for the stock evaluation page.

    A custom prompt may intentionally request the same standard statistics table/radar
    page in addition to its own prose. We keep the default off for custom prompts, but
    opt back in for unambiguous wording so ordinary custom prompts mentioning scores or
    six dimensions do not accidentally create duplicate pages again.
    """
    text = re.sub(r'\s+', '', str(custom_prompt or '').lower())
    if not text:
        return False
    # 明确排除优先，避免“不要普通版表格”这类自定义要求误触发标准页。
    negative = r'(?:不要|无需|禁止|不再|勿|不要再)(?:输出|生成|调用|保留)?(?:普通|标准|默认|原生)(?:版)?(?:的)?(?:表格|统计表|综合评估|雷达图|第一页)'
    if re.search(negative, text, re.IGNORECASE):
        return False
    # 许多自定义配置是从普通版完整提示词复制后再追加内容；原版的
    # “零、玩家识别/一、六维评分”标题就是调用普通综合页的稳定标记。
    if re.search(r'零[、.．:]玩家识别', text) and re.search(r'(?:一[、.．:]六维评分|六维评分)', text):
        return True
    if re.search(r'玩家识别', text) and re.search(r'rp字数', text, re.IGNORECASE) and re.search(r'骰点次数', text):
        return True
    patterns = (
        r'普通版(?:的)?(?:表格|统计表|综合评估|雷达图|第一页)',
        r'标准版(?:的)?(?:表格|统计表|综合评估|雷达图|第一页)',
        r'默认版(?:的)?(?:表格|统计表|综合评估|雷达图|第一页)',
        r'原生(?:默认)?(?:表格|统计表|综合评估|雷达图)',
        r'插件默认(?:表格|统计表|综合评估|雷达图)',
        r'默认(?:的)?(?:表格|统计表|综合评估|雷达图|第一页)',
        r'标准统计表',
        r'调用(?:或保留)?普通(?:版)?(?:的)?表格',
        r'保留普通(?:版)?(?:的)?(?:表格|统计表|雷达图)',
        r'同时输出普通(?:版)?(?:的)?(?:表格|统计表|雷达图)',
    )
    return any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns)

def render_log_evaluation_page(players, file_title, report_title, theme, token_usage):
    colors = get_theme_config(theme); fonts = load_markdown_fonts(colors['font_type'])
    width, padding = 1200, 50; row_h = 52; table_top = 145
    cards_top = table_top + row_h * (len(players) + 1) + 35; rows = max(1, (len(players) + 1) // 2)
    height = cards_top + rows * 350 + 70
    img = Image.new('RGB', (width, height), colors['bg']); draw = ImageDraw.Draw(img)
    draw.rectangle([(0, 0), (width, 115)], fill=colors['header_bg'])
    draw.text((padding, 25), '玩家综合评估', font=fonts['title'], fill=colors['header_text'])
    draw.text((padding, 78), f'{report_title} · {file_title[:35]}', font=fonts['small'], fill=colors['header_text'])
    headers = ['玩家', 'RP字数', '场外', '骰点', '均值', '中位数', '成功率', '骰运']
    col_widths = [245, 115, 105, 90, 100, 100, 180, 95]
    x0, y0 = padding, table_top
    draw.rounded_rectangle((x0, y0, x0 + sum(col_widths), y0 + row_h * (len(players) + 1)), radius=12, outline=colors['border'], width=2)
    x = x0
    for header, col_w in zip(headers, col_widths): draw.text((x + 12, y0 + 12), header, font=fonts['bold'], fill=colors['title']); x += col_w
    for row_index, player in enumerate(players, 1):
        y = y0 + row_index * row_h
        if row_index % 2 == 0: draw.rectangle((x0 + 2, y, x0 + sum(col_widths) - 2, y + row_h), fill=colors['bg'])
        known = player.get('roll_success_known', 0)
        success_rate = player.get('roll_success_rate')
        success_text = f"{player.get('roll_successes', 0)}/{known} {success_rate:.1f}%" if known and success_rate is not None else '--'
        values = [
            player['name'], str(player['rp']), f"{player['outside']:.1f}%", str(player['rolls']),
            f"{player.get('roll_average', 0):.1f}", f"{player.get('roll_median', 0):.1f}",
            success_text, str(player['roll_luck'])
        ]
        x = x0
        for value, col_w in zip(values, col_widths):
            display = str(value)
            while len(display) > 1 and fonts['normal'].getlength(display) > col_w - 20:
                display = display[:-2].rstrip() + '…'
            draw.text((x + 12, y + 12), display, font=fonts['normal'], fill=colors['text'])
            x += col_w
    labels = ['创新', '武力', '交涉', '幸运', '扮演', '认真']; card_w, card_h = 550, 350
    for idx, player in enumerate(players):
        left = padding + (idx % 2) * (card_w + 30); top = cards_top + (idx // 2) * card_h
        draw.rounded_rectangle((left, top, left + card_w, top + card_h), radius=18, outline=colors['border'], width=2)
        card_name = str(player['name'])
        while len(card_name) > 1 and fonts['h2'].getlength(card_name) > card_w - 44:
            card_name = card_name[:-2].rstrip() + '…'
        draw.text((left + 22, top + 16), card_name, font=fonts['h2'], fill=colors['title'])
        values = [player['innovation'], player['combat'], player['social'], player['luck'], player['roleplay'], player['focus']]
        radar_layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
        _draw_radar(ImageDraw.Draw(radar_layer), (left + 380, top + 190), 125, values, labels, fonts, colors)
        img = Image.alpha_composite(img.convert('RGBA'), radar_layer).convert('RGB')
        draw = ImageDraw.Draw(img)
        draw.text((left + 22, top + 78), '六维评分（0-100）', font=fonts['small'], fill=colors['quote'])
        for score_index, (label, value) in enumerate(zip(labels, values)): draw.text((left + 25, top + 115 + score_index * 34), f'{label}: {value}', font=fonts['normal'], fill=colors['text'])
    draw.text((padding, height - 42), f'AI 来自 Air{token_usage}', font=fonts['small'], fill=colors['quote'])
    buf = BytesIO(); img.save(buf, 'PNG'); return buf.getvalue()

def render_log_report_images(result_text, file_title, report_title, theme='default', token_usage='', calculated_stats=None, include_standard_evaluation=True):
    """Render a log report.

    默认提示词会把后端统计和六维评分表提升为第一页的图文综合页。
    自定义提示词必须保留用户自己的表格布局，因此调用方可关闭该自动页；
    自定义 ``logai-chart`` 图表在两种模式下都继续单独渲染。
    """
    charts = parse_custom_chart_blocks(result_text)
    clean_result_text = strip_custom_chart_blocks(result_text) if charts else str(result_text or '')
    players = parse_log_evaluation(clean_result_text, calculated_stats) if include_standard_evaluation else []
    if not players and not charts:
        return text_to_images(clean_result_text, file_title, report_title, theme, token_usage)
    parts = [part.strip() for part in str(clean_result_text or '').split('【分页符】') if part.strip()]
    detail_text = '【分页符】'.join(parts[1:]).strip() if len(parts) > 1 else ''
    images = []
    if players:
        images.append(render_log_evaluation_page(players, file_title, report_title, theme, token_usage))
    images.extend(render_custom_chart_page(chart, file_title, report_title, theme, token_usage) for chart in charts)
    if not players:
        detail_text = clean_result_text
    if detail_text: images.extend(text_to_images(detail_text, file_title, report_title, theme, token_usage))
    return images

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
        title_font = fonts['title']
        if len(report_title) > 15:
            title_font = fonts['h2']
        elif len(report_title) > 11:
            title_font = fonts['h1']
        draw.text((padding, 34 if title_font != fonts['title'] else 30), report_title, font=title_font, fill=colors['header_text'])
        page_text = f"Page {idx+1}/{len(parts)} - {file_title[:12]}..." if len(parts) > 1 else f"{file_title[:16]}..."
        try:
            page_w = int(draw.textlength(page_text, font=fonts['small']))
        except Exception:
            page_w = len(page_text) * 12
        page_x = max(width - padding - page_w, padding + 520)
        draw.text((page_x, 46), page_text, font=fonts['small'], fill=colors['header_text'])
        
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
            # Keep the archive until the core has downloaded it and uploaded it
            # through the official group /files endpoint.
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
    user_key = str(req_data.get('user_key', '') or '')
    user_name = str(req_data.get('user_name', '') or '')[:80]
    custom_name = str(req_data.get('custom_name', '') or '')[:80]
    token_module = str(req_data.get('token_module', '') or '')[:60]
    target_users = req_data.get('target_users')
    target_qq = str(req_data.get('target_user') or req_data.get('target_qq') or req_data.get('player_qq') or req_data.get('target_id') or '').strip()
    if isinstance(target_users, list) and target_users:
        target_qq = " ".join(str(u).strip() for u in target_users if str(u).strip())
    target_qq = re.sub(r'^(?:QQ[:：])?', '', target_qq, flags=re.IGNORECASE).strip()
    if target_qq and mode in ('analyze', '', None):
        mode = 'player_style'
    log_sources = req_data.get('log_sources')
    if not isinstance(log_sources, list):
        log_sources = None
    else:
        log_sources = [item for item in log_sources[:20] if isinstance(item, dict)][:20]

    save_archive = str(req_data.get('save_archive', 'true')).lower() not in ('false', '0', 'no', 'off')
    custom_timeline = str(req_data.get('custom_timeline', '') or '').strip()
    identity_bindings = req_data.get('identity_bindings') or {}
    raw_spec_id = str(req_data.get('specified_identity') or req_data.get('identity') or '').strip().lower()
    specified_identity = 'KP' if raw_spec_id in ('kp', 'host', 'dm', '主持', '主持人', '守秘人', '带团', '带团风格', 'kp风格') else ('PL' if raw_spec_id in ('pl', 'player', '玩家', '玩家风格', 'pl风格') else ('双重' if raw_spec_id in ('双重', '兼有', '全能', 'dual') else None))

    if not source:
        if key and '-' in key and key.split('-')[0].isdigit(): source = "trpgbot"
        elif key and ('_' in key or len(key) > 20): source = "kokona"
        else: source = "weizaima"

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    # 将所有参数（包括 theme、group_key、save_archive、custom_timeline、identity_bindings、specified_identity）传入后台线程
    executor.submit(background_process, job_id, key, password, source, is_pro, is_kind, mode, persona, custom_prompt, theme, is_ds, group_key, backup_model, user_key, user_name, custom_name, token_module, log_sources, target_qq, save_archive, custom_timeline, identity_bindings, specified_identity)
    return jsonify({'status': 'ok', 'id': job_id})


@app.route('/api/submit_file', methods=['GET', 'POST'])
def submit_file_task():
    """提交本地文件分析任务 (统一且安全的参数提取，支持多文件与文件+链接复合串联)"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    req_data = request.get_json(silent=True) or {} if request.method == 'POST' else request.args

    file_url = req_data.get('url')
    filename = req_data.get('filename')
    files_input = req_data.get('files')
    log_sources = req_data.get('log_sources') or []

    # 规整文件列表
    if files_input and isinstance(files_input, list):
        file_items = [f for f in files_input if isinstance(f, dict) and f.get('url')]
    elif file_url:
        file_items = [{'url': file_url, 'filename': filename or 'log.txt'}]
    else:
        file_items = []

    if not file_items and not log_sources:
        return jsonify({'status': 'error', 'msg': 'Missing url, files, or log_sources'})

    mode = req_data.get('mode', 'analyze')
    is_pro = str(req_data.get('pro', 'false')).lower() == 'true'
    is_kind = str(req_data.get('kind', 'false')).lower() == 'true'
    is_ds = str(req_data.get('ds', 'false')).lower() == 'true'
    persona = req_data.get('persona', '')
    custom_prompt = req_data.get('custom_prompt', '')
    custom_name = str(req_data.get('custom_name', '') or '')
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
    target_users = req_data.get('target_users')
    target_qq = str(req_data.get('target_user') or req_data.get('target_qq') or req_data.get('player_qq') or req_data.get('target_id') or '').strip()
    if isinstance(target_users, list) and target_users:
        target_qq = " ".join(str(u).strip() for u in target_users if str(u).strip())
    target_qq = re.sub(r'^(?:QQ[:：])?', '', target_qq, flags=re.IGNORECASE).strip()
    if target_qq and mode in ('analyze', '', None):
        mode = 'player_style'
    save_archive = str(req_data.get('save_archive', 'true')).lower() not in ('false', '0', 'no', 'off')
    custom_timeline = str(req_data.get('custom_timeline', '') or '').strip()
    identity_bindings = req_data.get('identity_bindings') or {}
    raw_spec_id = str(req_data.get('specified_identity') or req_data.get('identity') or '').strip().lower()
    specified_identity = 'KP' if raw_spec_id in ('kp', 'host', 'dm', '主持', '主持人', '守秘人', '带团', '带团风格', 'kp风格') else ('PL' if raw_spec_id in ('pl', 'player', '玩家', '玩家风格', 'pl风格') else ('双重' if raw_spec_id in ('双重', '兼有', '全能', 'dual') else None))

    if not filename:
        if file_items:
            filename = " + ".join([f.get('filename') or 'log.txt' for f in file_items])
        elif log_sources:
            filename = f"网络Log({len(log_sources)}段)"
        else:
            filename = "log.txt"

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    # 将所有参数（包括 file_items、log_sources、save_archive、custom_timeline、identity_bindings、specified_identity）传入后台线程
    executor.submit(background_file_process, job_id, file_items, filename, mode, is_pro, is_kind, persona, custom_prompt, theme, is_ds, group_key, user_key, custom_name, card_system, backup_model, backup_label, user_name, token_module, target_qq, log_sources, save_archive, custom_timeline, identity_bindings, specified_identity)
    return jsonify({'status': 'ok', 'id': job_id})


@app.route('/api/sheet_import', methods=['POST'])
def api_sheet_import():
    """自动识别 COC/DND 工作簿，返回可直接写入 SealDice 的结构化角色卡。"""
    req_data = request.get_json(silent=True) or {}
    file_url = str(req_data.get('url', '') or '').strip()
    filename = str(req_data.get('filename', '') or '').strip()
    user_key = str(req_data.get('user_key', '') or '').strip()
    group_key = str(req_data.get('group_key', '') or '').strip()
    card_system = str(req_data.get('card_system', 'auto') or 'auto').strip().lower()
    group_system = str(req_data.get('group_system', '') or '').strip().lower()
    if card_system not in ('auto', 'coc', 'dnd'):
        card_system = 'auto'
    if not file_url or not filename:
        return jsonify({'status': 'error', 'msg': '缺少群文件下载地址或文件名'})

    try:
        session = get_session()
        response = session.get(file_url, timeout=120, stream=True)
        response.raise_for_status()
        chunks = []
        downloaded = 0
        for chunk in response.iter_content(chunk_size=65536):
            if not chunk:
                continue
            downloaded += len(chunk)
            if downloaded > 50 * 1024 * 1024:
                raise ValueError('角色卡文件超过 50MB，已拒绝导入')
            chunks.append(chunk)

        card = extract_import_card(b''.join(chunks), filename, card_system)
        required_system = 'dnd5e' if card.get('system') == 'dnd' else 'coc7'
        if group_system != required_system:
            switch_command = '.set dnd' if required_system == 'dnd5e' else '.set coc'
            current_label = group_system or '未知'
            card_label = 'DND5E' if required_system == 'dnd5e' else 'COC7'
            raise ValueError(
                f'识别到这是 {card_label} 角色卡，但当前群规则为 {current_label}。'
                f'请先使用 {switch_command} 切换房规，再重新执行 .角色卡 导入；本次未保存角色卡。'
            )
        card['user_key'] = user_key
        card['group_key'] = group_key
        card['saved_at'] = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime())
        if user_key:
            save_sheet_card(user_key, card)
        return jsonify({'status': 'ok', 'card': card})
    except Exception as exc:
        print(f"[角色卡导入] 失败: {exc}")
        return jsonify({'status': 'error', 'msg': str(exc)})


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
                'legacy': c.get('_storage_source') == 'legacy',
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
    """删除角色卡（含散落在旧目录中的本人同名卡）。"""
    if request.method == 'POST':
        req_data = request.get_json(silent=True) or {}
    else:
        req_data = request.args
    user_key = str(req_data.get('user_key', '') or '')
    name = str(req_data.get('name', '') or '').strip()
    group_key = str(req_data.get('group_key', '') or '').strip()
    allow_ownerless_legacy = req_data.get('allow_ownerless_legacy') is True
    if not name:
        return jsonify({'status': 'error', 'msg': 'name 参数不能为空'})
    if not user_key:
        return jsonify({'status': 'error', 'msg': 'user_key 参数不能为空（跨群共享卡库要求指定持有者）'})
    try:
        result = delete_user_cards(
            user_key,
            name=name,
            group_key=group_key,
            allow_ownerless_legacy=allow_ownerless_legacy,
        )
        if result['deleted_count']:
            legacy_count = result['sources']['legacy']
            legacy_tip = f'，其中旧版目录 {legacy_count} 份' if legacy_count else ''
            return jsonify({
                'status': 'ok',
                'msg': f"已删除角色卡：{name}（共 {result['deleted_count']} 份{legacy_tip}）",
                **result,
            })
        msg = f'未找到属于你的角色卡：{name}'
        if result['skipped_ownerless']:
            msg += '；另发现无法确认持有者的旧版同名卡，请联系骰主处理'
        return jsonify({'status': 'error', 'msg': msg, **result})
    except Exception as e:
        return jsonify({'status': 'error', 'msg': str(e)})


@app.route('/api/sheet_cards_clear', methods=['POST'])
def api_sheet_cards_clear():
    """经明确确认后，清空请求者名下的新旧 LogAI 卡片。"""
    req_data = request.get_json(silent=True) or {}
    user_key = str(req_data.get('user_key', '') or '').strip()
    confirmation = str(req_data.get('confirmation', '') or '').strip()
    if not user_key:
        return jsonify({'status': 'error', 'msg': 'user_key 参数不能为空'})
    if confirmation != '确认':
        return jsonify({'status': 'error', 'msg': '清空角色卡必须传入 confirmation=确认'})
    try:
        result = delete_user_cards(user_key, clear_all=True)
        if not result['deleted_count']:
            return jsonify({'status': 'ok', 'msg': '你名下没有可清理的 LogAI 角色卡', **result})
        legacy_count = result['sources']['legacy']
        return jsonify({
            'status': 'ok',
            'msg': f"已清空你名下 {result['deleted_count']} 份 LogAI 角色卡（旧版目录 {legacy_count} 份）",
            **result,
        })
    except Exception as e:
        return jsonify({'status': 'error', 'msg': str(e)})


@app.route('/api/player_style_archive', methods=['GET'])
def api_player_style_archive():
    """查询玩家跑团成长档案与历史演化摘要，支持 PL/KP 过滤，优先返回卷宗长图任务 ID"""
    try:
        target = request.args.get('target', '').strip()
        identity = request.args.get('identity', '').strip()
        if not target:
            return jsonify({'status': 'error', 'msg': '缺少查询目标 target 参数 (QQ号或角色名)'}), 400
        res = load_player_growth_summary(target, identity_filter=identity)
        if res.get('found'):
            data = res.get('data') or {}
            if 'summary_text' not in data and 'summary_text' in res:
                data['summary_text'] = res['summary_text']
            job_id = res.get('id', '')
            img_count = res.get('image_count', 0)
            data['id'] = job_id
            data['image_count'] = img_count
            return jsonify({
                'status': 'ok',
                'found': True,
                'data': data,
                'id': job_id,
                'image_count': img_count,
                'summary_text': data.get('summary_text', '')
            })
        return jsonify({'status': 'ok', 'found': False, 'msg': res.get('msg', '未找到成长档案')})
    except Exception as exc:
        print(f"[风格档案查询异常] {exc}")
        return jsonify({'status': 'error', 'msg': f'查询成长档案失败: {exc}'}), 500


@app.route('/api/player_style_archive/update_timeline', methods=['GET', 'POST'])
def api_update_player_style_timeline():
    """修补玩家战役时间跨度并自动重排历史战役与刷新长图"""
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
    else:
        payload = request.args.to_dict()
    
    target = str(payload.get('target') or '').strip()
    new_timeline = str(payload.get('new_timeline') or payload.get('timeline') or '').strip()
    battle_idx = payload.get('battle_idx') or payload.get('index') or payload.get('idx')
    identity = str(payload.get('identity') or 'pl').strip()
    battle_keyword = str(payload.get('battle_keyword') or payload.get('keyword') or '').strip()
    operator_qq = str(payload.get('operator_qq') or payload.get('user_qq') or payload.get('qq') or '').strip()

    if not target:
        return jsonify({'status': 'error', 'msg': '缺少查询目标 target 参数 (QQ号或角色名)'}), 400
    if not new_timeline:
        return jsonify({'status': 'error', 'msg': '缺少新的时间轴参数 (new_timeline / timeline)'}), 400

    res = update_player_archive_timeline(
        target_query=target,
        battle_idx=battle_idx,
        new_timeline=new_timeline,
        identity_filter=identity,
        battle_keyword=battle_keyword,
        operator_qq=operator_qq
    )
    if res.get('success'):
        return jsonify({
            'status': 'ok',
            'success': True,
            'msg': res.get('msg', ''),
            'data': res,
            'id': res.get('id', ''),
            'image_count': res.get('image_count', 0)
        })
    return jsonify({
        'status': 'error',
        'success': False,
        'msg': res.get('msg', '修补战役时间轴失败')
    }), 400


@app.route('/api/player_style_archive/rename', methods=['GET', 'POST'])
def api_rename_player_archive():
    """修改玩家成长档案中的归档对象名称并自动重新渲染长图"""
    if request.method == 'POST':
        payload = request.get_json(silent=True) or {}
    else:
        payload = request.args.to_dict()

    target = str(payload.get('target') or '').strip()
    new_name = str(payload.get('new_name') or payload.get('name') or '').strip()
    identity = str(payload.get('identity') or 'pl').strip()
    operator_qq = str(payload.get('operator_qq') or payload.get('user_qq') or payload.get('qq') or '').strip()

    if not target:
        return jsonify({'status': 'error', 'msg': '缺少查询目标 target 参数 (QQ号或原角色名)'}), 400
    if not new_name:
        return jsonify({'status': 'error', 'msg': '缺少新名称 new_name 参数'}), 400

    res = rename_player_archive(
        target_query=target,
        new_name=new_name,
        identity_filter=identity,
        operator_qq=operator_qq
    )
    if res.get('success'):
        return jsonify({
            'status': 'ok',
            'success': True,
            'msg': res.get('msg', ''),
            'data': res,
            'id': res.get('id', ''),
            'image_count': res.get('image_count', 0)
        })
    return jsonify({
        'status': 'error',
        'success': False,
        'msg': res.get('msg', '修改档案对象名称失败')
    }), 400


@app.route('/api/status', methods=['GET'])
def check_status():
    """查询任务状态，附带图像数量"""
    job_id = request.args.get('id')
    job = JOB_CACHE.get(job_id)
    if not job:
        persisted = _load_persisted_comic_job(job_id)
        if persisted:
            return jsonify({
                'status': 'done', 'msg': '',
                'image_count': int(persisted.get('image_count', 0)),
                'comic': True,
                'comic_prompts': persisted.get('comic_prompts', []),
                'storyboard_model': persisted.get('storyboard_model', COMIC_STORYBOARD_MODEL),
                'character_bible': persisted.get('character_bible', ''),
            })
    if not job: return jsonify({'status': 'not_found'})
    
    # 兼容老版只返回单图的逻辑以及新版的多图逻辑
    img_count = len(job.get('images', [])) if 'images' in job else (1 if 'image' in job else 0)
    
    resp_data = {
        'status': job['status'],
        'msg': job.get('msg', ''),
        'image_count': img_count
    }
    if 'text' in job:
        resp_data['text'] = job['text']
    # 【新增】：若为角色卡评分任务，把姓名/年龄/分数/品质一并返回给前端
    if 'summary' in job:
        resp_data['summary'] = job['summary']
    if 'download_url' in job:
        resp_data['download_url'] = job['download_url']
    if job.get('comic_prompts') is not None:
        resp_data['comic_prompts'] = job.get('comic_prompts') or []
        resp_data['storyboard_model'] = job.get('storyboard_model', COMIC_STORYBOARD_MODEL)
        resp_data['character_bible'] = job.get('character_bible', '')
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

@app.route('/api/download_converted', methods=['GET'])
def download_converted_file():
    """下载 PDF 转换后的 DOCX 或 TXT 格式文件"""
    file_hash = str(request.args.get('hash') or request.args.get('id') or '').strip()
    fmt = (request.args.get('format') or 'docx').lower().strip('.')
    if fmt not in ('docx', 'txt'):
        fmt = 'docx'

    entry = PDF_CONVERTED_CACHE.get(file_hash)
    target_path = None
    download_name = None

    if entry:
        target_path = entry.get(f'{fmt}_path')
        safe_name = entry.get('safe_name') or 'converted'
        download_name = f"{safe_name}.{fmt}"

    if not target_path or not os.path.isfile(target_path):
        converted_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdf_converted")
        if os.path.isdir(converted_dir) and file_hash:
            for fname in os.listdir(converted_dir):
                if fname.startswith(file_hash) and fname.endswith(f".{fmt}"):
                    target_path = os.path.join(converted_dir, fname)
                    download_name = fname.split('_', 1)[-1] if '_' in fname else fname
                    break

    if not target_path or not os.path.isfile(target_path):
        return jsonify({'status': 'not_found', 'msg': '转换文件不存在或已过期'}), 404

    return send_file(target_path, as_attachment=True, download_name=download_name or f"converted.{fmt}")


@app.route('/api/result', methods=['GET'])
def get_result():
    """获取最终图片 (支持index下标获取指定分页)"""
    job_id = request.args.get('id')
    index = int(request.args.get('index', 0))
    job = JOB_CACHE.get(job_id)
    if not job:
        persisted = _load_persisted_comic_job(job_id)
        if persisted:
            path = os.path.join(persisted['store_dir'], f'page_{index}.png')
            if os.path.isfile(path):
                return send_file(path, mimetype='image/png', download_name=f'log_comic_{job_id}_{index}.png')
            return "Index out of range or not ready", 404
    
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
    """Return a rendered page for SealDice to relay without exposing localhost to OneBot."""
    job_id = request.args.get('id')
    try:
        index = int(request.args.get('index', 0))
    except (TypeError, ValueError):
        return jsonify({'status': 'error', 'msg': 'index 必须是整数'}), 400
    job = JOB_CACHE.get(job_id)
    if not job:
        persisted = _load_persisted_comic_job(job_id)
        if persisted:
            path = os.path.join(persisted['store_dir'], f'page_{index}.png')
            if os.path.isfile(path):
                with open(path, 'rb') as stream:
                    img_data = stream.read()
                return jsonify({'status': 'ok', 'mime': 'image/png', 'data': base64.b64encode(img_data).decode('ascii')})
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
    """Run the remote model outside SealDice's single goja event loop."""
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
            images = text_to_images(
                rendered_text,
                payload.get('file_title', '跑团记录'),
                payload.get('report_title', '跑团效率复盘'),
                final_theme
            )
            JOB_CACHE[job_id]['images'] = images
        JOB_CACHE[job_id]['status'] = 'done'
    except Exception as e:
        print(f'[{job_id}] Session review failed: {e}')
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['msg'] = str(e)

@app.route('/api/session_review', methods=['POST'])
def session_review_task():
    """Queue model analysis and optional rendering without blocking the caller."""
    if not _is_local_plugin_request():
        return jsonify({'status': 'error', 'msg': '该接口只接受本机插件请求'}), 403
    if len(JOB_CACHE) > 100:
        JOB_CACHE.clear()

    payload = request.get_json(silent=True) or {}
    api_url = str(payload.get('api_url', '') or '').strip()
    model = str(payload.get('model', '') or '').strip()
    system_prompt = str(payload.get('system_prompt', '') or '').strip()
    dataset = payload.get('dataset')
    allowed_themes = {'default', 'classic', 'cthulhu', 'cyberpunk', 'historical', 'wasteland', 'anime', 'terminal'}
    theme = str(payload.get('theme', 'default') or 'default').strip().lower()

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

    payload = dict(payload)
    payload['api_url'] = api_url
    payload['model'] = model
    payload['system_prompt'] = system_prompt
    payload['theme'] = theme
    payload['file_title'] = str(payload.get('file_title', '跑团记录') or '跑团记录').strip()[:80]
    payload['report_title'] = str(payload.get('report_title', '跑团效率复盘') or '跑团效率复盘').strip()[:40]
    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    review_executor.submit(background_session_review, job_id, payload)
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
    """Queue the optional external archive upload outside the SealDice runtime."""
    if not _is_local_plugin_request():
        return jsonify({'status': 'error', 'msg': '该接口只接受本机插件请求'}), 403
    payload = request.get_json(silent=True) or {}
    target_url = str(payload.get('target_url', '') or '').strip()
    archive_payload = payload.get('payload')
    if not re.match(r'^https?://', target_url, flags=re.IGNORECASE):
        return jsonify({'status': 'error', 'msg': 'target_url 必须是 HTTP(S) 地址'})
    if not isinstance(archive_payload, dict):
        return jsonify({'status': 'error', 'msg': 'payload 必须是 JSON 对象'})
    request_timeout = max(15.0, min(300.0, float(payload.get('request_timeout', 90))))
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

def _novelai_generate_image_bytes(prompt, size="1792x1024", model=None, comic=False):
    """Generate one image using the existing NovelAI transport.

    V5-compatible accounts can override the model via LOGAI_NOVELAI_COMIC_MODEL;
    prompts remain Chinese-friendly and retain quality/negative tags for older
    V4.5 endpoints as a fallback.
    """
    width, height = 1216, 832
    if size == "1024x1792":
        width, height = 832, 1216
    elif size == "1024x1024":
        width, height = 1024, 1024
    negative_prompt = (
        "低质量, 模糊, 乱码, 水印, logo, 签名, 多余手指, 手部错误, 肢体错误, "
        "人物重复, 画面裁切, 出框, 过度曝光, bad anatomy, bad hands, watermark, blurry"
    )
    if comic:
        negative_prompt += (
            ", 3D模型, 三维渲染, CGI, 游戏建模, 写实摄影, 照片感, 塑料皮肤, 塑料质感, "
            "角色外观漂移, 换脸, 发色变化, 服装变化, 多余角色, 对话框, 旁白框, "
            "对白气泡, 文字, 中文字符, 汉字, 字母, 数字, 标点, logo, 签名, 水印, "
            "文字墙, 过长文字段落, 密集文字, 伪汉字, 变形文字, 不可读文字"
        )
    payload_prompt = str(prompt or '').strip()
    if comic:
        payload_prompt = "漫画单页, " + payload_prompt
    payload = {
        "input": payload_prompt,
        "model": model or IMAGE_COMIC_MODEL,
        "action": "generate",
        "parameters": {
            "params_version": 3,
            "width": width, "height": height,
            "scale": 5.0, "sampler": "k_euler_ancestral", "steps": 28,
            "seed": random.randint(1, 999999999), "n_samples": 1,
            "qualityToggle": True, "dynamic_thresholding": False,
            "controlnet_strength": 1.0, "legacy": False,
            "add_original_image": False, "cfg_rescale": 0,
            "noise_schedule": "karras", "legacy_v3_extend": False,
            "use_coords": False, "legacy_uc": False, "characterPrompts": [],
            "v4_prompt": {"caption": {"base_caption": payload_prompt, "char_captions": []}, "use_coords": False, "use_order": True},
            "v4_negative_prompt": {"caption": {"base_caption": negative_prompt, "char_captions": []}, "legacy_uc": False},
            "negative_prompt": negative_prompt,
            "deliberate_euler_ancestral_bug": False, "prefer_brownian": True,
            "image_format": "png"
        }
    }
    response = requests.post(
        "https://image.novelai.net/ai/generate-image",
        headers={"Authorization": f"Bearer {IMAGE_API_KEY.strip()}", "Content-Type": "application/json"},
        json=payload, timeout=120,
    )
    if response.status_code != 200:
        raise RuntimeError(f"NovelAI 接口返回错误: {response.status_code} - {response.text[:500]}")
    try:
        with zipfile.ZipFile(BytesIO(response.content)) as archive:
            names = [name for name in archive.namelist() if name.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))]
            if names:
                return archive.read(names[0])
    except zipfile.BadZipFile:
        pass
    if response.content.startswith(b'\x89PNG') or response.content.startswith(b'\xff\xd8'):
        return response.content
    raise RuntimeError("未能从 NovelAI 返回的数据中提取图片")


COMIC_DIALOGUE_MAX_CHARS = 12
COMIC_CAPTION_MAX_CHARS = 12


def _comic_text_for_prompt(value, max_chars):
    """Keep generated comic text short enough for a single bubble or caption box."""
    text = str(value or '')
    text = re.sub(r'\[CQ:[^\]]*\]', '', text)
    text = re.sub(r'https?://\S+', '', text)
    text = re.sub(r'[\r\n]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    text = text.strip(' \t\r\n\"\'“”‘’')
    if not text:
        return ''
    if len(text) <= max_chars:
        return text
    clipped = text[:max_chars].rstrip('，。！？；：、,.!?;: ')
    return clipped + '…'


def _comic_prompt_field(value, max_chars):
    """Trim verbose LLM narration while retaining the visual facts NovelAI needs."""
    text = str(value or '').strip()
    text = text.replace('角色设定总览（所有页面必须保持一致）：', '')
    text = text.replace('；本页动作：', '；')
    text = re.sub(r'\s+', ' ', text)
    return _comic_text_for_prompt(text, max_chars)


def _comic_quote_text(value, max_chars):
    """Wrap the one short comic text element in ASCII double quotes."""
    text = _comic_text_for_prompt(value, max_chars)
    if not text:
        return ''
    return '"' + text.replace('"', '').replace('“', '').replace('”', '') + '"'


def _comic_action_only(value):
    """Remove common model-invented appearance clauses before fixed-bible injection."""
    text = str(value or '').strip()
    text = re.sub(r'(?:角色设定总览.*?：|固定外观.*?：)', '', text)
    text = re.sub(r'(?:身穿|穿着|穿上|换上|穿)(?:[^，。；;]{1,24})(?:风衣|外套|夹克|裙子|丝袜|裤子|制服|长袍|衬衫)', '', text)
    text = re.sub(r'(?:[蓝黑白红黄绿棕紫灰粉卡其色]+(?:色)?(?:的)?(?:长发|短发|头发|眼睛|双眸|外套|夹克|风衣|裙子|丝袜|裤子|制服))', '', text)
    return re.sub(r'^[，。；;\s]+|[，。；;\s]+$', '', text)


def _comic_character_bible_from_cards(log_text, user_key=''):
    """Build a stable visual bible from the user's matched native/LogAI cards."""
    try:
        cards = find_matching_cards(log_text, user_key=user_key)
    except Exception as exc:
        print(f'[comic] 读取角色卡外观失败: {exc}')
        cards = []
    lines = []
    for card in cards[:6]:
        name = str(card.get('name') or '').strip()
        if not name:
            continue
        facts = []
        for key, label in (('gender', '性别'), ('age', '年龄'), ('height', '身高'),
                           ('appearance', '外貌'), ('appearance_text', '外貌'),
                           ('visual_description', '外貌'), ('description', '描述'), ('personality', '性格')):
            value = str(card.get(key) or '').strip()
            if value:
                facts.append(f'{label}：{value[:260]}')
        background = str(card.get('background') or '').strip()
        if background and not any('外貌' in item for item in facts):
            # 旧版卡没有 appearance 字段时，背景仍可提供少量稳定特征。
            appearance_hint = re.search(r'(?:外貌|外表|长相|穿着|服装|发型|发色)[：:： ]*([^\n|；。]{2,180})', background)
            if appearance_hint:
                facts.append(f'外貌：{appearance_hint.group(1).strip()}')
        weapons = [str(item.get('name') or '').strip() for item in (card.get('weapons') or []) if isinstance(item, dict)]
        items = [str(item.get('name') or '').strip() for item in (card.get('items') or []) if isinstance(item, dict)]
        if weapons:
            facts.append('固定武器：' + '、'.join(weapons[:8]))
        if items:
            facts.append('固定道具：' + '、'.join(items[:12]))
        lines.append(f'{name}：' + '；'.join(facts))
    return ' '.join(lines)[:2400]


def _comic_json_from_text(text, pages, fixed_character_bible=''):
    """Parse the storyboard JSON while tolerating fenced or explanatory output."""
    raw = str(text or '').strip()
    raw = re.sub(r'^```(?:json)?\s*|\s*```$', '', raw, flags=re.IGNORECASE | re.DOTALL).strip()
    candidates = [raw]
    object_match = re.search(r'\{[\s\S]*"(?:pages|分镜|storyboard)"[\s\S]*\}', raw)
    if object_match:
        candidates.insert(0, object_match.group(0))
    match = re.search(r'\[\s*\{[\s\S]*\}\s*\]', raw)
    if match:
        candidates.insert(0, match.group(0))
    data = None
    for candidate in candidates:
        try:
            data = json.loads(candidate)
            break
        except Exception:
            continue
    character_bible = ''
    if isinstance(data, dict):
        character_bible = data.get('character_bible') or data.get('角色设定总览') or data.get('characters') or ''
        data = data.get('pages') or data.get('分镜') or data.get('storyboard')
    if isinstance(character_bible, (dict, list)):
        character_bible = json.dumps(character_bible, ensure_ascii=False, separators=(',', '；'))
    character_bible = str(character_bible or '').strip()
    if not isinstance(data, list):
        raise RuntimeError("LLM 未返回可解析的漫画分镜 JSON")
    normalized = []
    for index, item in enumerate(data[:pages], 1):
        if not isinstance(item, dict):
            continue
        characters = _comic_action_only(item.get('characters') or item.get('角色') or '')
        # 有固定角色卡时，characters 只保留本页动作，不允许模型重写外观。
        if fixed_character_bible:
            characters = re.sub(r'(?:角色设定总览.*?：|固定外观.*?：)', '', characters)
        elif character_bible:
            characters = f"角色设定总览（所有页面必须保持一致）：{character_bible}；本页动作：{characters}"
        dialogue = _comic_text_for_prompt(item.get('dialogue') or item.get('对白'), COMIC_DIALOGUE_MAX_CHARS)
        caption = _comic_text_for_prompt(item.get('caption') or item.get('旁白'), COMIC_CAPTION_MAX_CHARS)
        # NovelAI handles a single short bubble more reliably than multiple text blocks.
        # Prefer dialogue when both fields are returned by the storyboard model.
        if dialogue:
            caption = ''
        normalized.append({
            'page': index,
            'scene': str(item.get('scene') or item.get('画面') or item.get('description') or '').strip(),
            'characters': characters,
            'dialogue': dialogue,
            'caption': caption,
            'camera': str(item.get('camera') or item.get('镜头') or '').strip(),
        })
    if not normalized:
        raise RuntimeError("漫画分镜为空")
    while len(normalized) < pages:
        normalized.append(dict(normalized[-1], page=len(normalized) + 1, scene=normalized[-1]['scene'] + '，画面继续推进'))
    return normalized

def _comic_prompt_from_panel(panel, style, character_bible=''):
    style_text = _comic_prompt_field(style or COMIC_STYLE_DEFAULT, 180)
    parts = [
        style_text,
        '连续漫画插画',
        f"场景：{_comic_prompt_field(panel.get('scene'), 180)}",
        f"固定角色外观：{_comic_prompt_field(character_bible, 700)}" if character_bible else '',
        f"角色动作与表情：{_comic_prompt_field(panel.get('characters'), 260)}",
        f"镜头：{_comic_prompt_field(panel.get('camera'), 120)}",
        COMIC_NOVELAI_QUALITY_TAGS,
    ]
    # NovelAI 只接收纯画面提示词；对白/旁白仅保留在分镜调试结果中，不注入绘图提示词。
    return '，'.join(part for part in parts if part)

def _draw_comic_text_overlay(image_bytes, panel, index, total):
    """Add readable Chinese captions below the generated art without asking the model to draw text."""
    try:
        image = Image.open(BytesIO(image_bytes)).convert('RGB')
        draw = ImageDraw.Draw(image, 'RGBA')
        font = ImageFont.truetype(FONT_PATH, max(20, image.width // 42))
        lines = [f"第 {index}/{total} 页"]
        if panel.get('caption'): lines.append(panel['caption'])
        if panel.get('dialogue'): lines.append(f"「{panel['dialogue']}」")
        text = '\n'.join(lines)
        bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=8)
        height = bbox[3] - bbox[1] + 28
        draw.rectangle((0, image.height - height, image.width, image.height), fill=(0, 0, 0, 175))
        draw.multiline_text((18, image.height - height + 12), text, font=font, fill=(255, 255, 255, 255), spacing=8)
        output = BytesIO(); image.save(output, 'PNG'); return output.getvalue()
    except Exception:
        return image_bytes


def _add_comic_end_marker(image_bytes):
    """Add a deterministic end marker to the final page instead of asking NovelAI to draw it."""
    try:
        image = Image.open(BytesIO(image_bytes)).convert('RGBA')
        draw = ImageDraw.Draw(image, 'RGBA')
        font_path = FONT_PATH if os.path.exists(FONT_PATH) else None
        font = ImageFont.truetype(font_path, max(24, image.width // 32)) if font_path else ImageFont.load_default()
        bbox = draw.textbbox((0, 0), 'End', font=font)
        padding_x, padding_y = 16, 9
        width = bbox[2] - bbox[0] + padding_x * 2
        height = bbox[3] - bbox[1] + padding_y * 2
        margin = max(18, image.width // 70)
        left = image.width - width - margin
        top = image.height - height - margin
        draw.rounded_rectangle((left, top, left + width, top + height), radius=8, fill=(0, 0, 0, 155))
        draw.text((left + padding_x, top + padding_y - bbox[1]), 'End', font=font, fill=(255, 255, 255, 235))
        output = BytesIO()
        image.convert('RGB').save(output, 'PNG')
        return output.getvalue()
    except Exception:
        return image_bytes


def _infer_uploaded_filename(file_content, filename):
    """Official Bot downloads may omit the original suffix; infer common formats from bytes."""
    name = os.path.basename(str(filename or '').strip()) or 'log'
    if os.path.splitext(name)[1]:
        return name
    if file_content.startswith(b'%PDF-'):
        return name + '.pdf'
    if file_content.startswith(b'PK\x03\x04'):
        try:
            with zipfile.ZipFile(BytesIO(file_content)) as archive:
                names = set(archive.namelist())
            if 'word/document.xml' in names:
                return name + '.docx'
            if any(item.startswith('xl/') for item in names):
                return name + '.xlsx'
        except Exception:
            pass
    return name + '.txt'

def _request_comic_storyboard(log_text, pages, style, character_bible='', user_key='', user_name='', group_key='', token_module='log_comic', job_id=''):
    """Call the storyboard model and turn its JSON into final NovelAI prompts."""
    pages = max(1, min(10, int(pages or 6)))
    fixed_bible = str(character_bible or COMIC_CHARACTER_BIBLE_DEFAULT or '').strip()[:2400]
    bible_instruction = fixed_bible or '若未提供角色卡资料，请从日志中提取稳定外观；一旦确定，所有页面必须完全复用。'
    storyboard_prompt = f"""
你是专业漫画分镜师。请根据下面的 TRPG 跑团日志，把故事压缩为 {pages} 页以内的短漫画。
只输出 JSON 对象，不要 Markdown，不要解释。对象必须包含 character_bible（全篇统一的角色设定总览）和 pages（数组）。每页一个对象，字段必须为：
page（整数）、scene（画面描述）、characters（角色外观和动作）、camera（镜头/构图）、caption（中文旁白，可空）、dialogue（中文对白，可空）。
页与页之间要有连续性。下面的固定角色外观是最高优先级，必须逐页复用，不能改写、补充或替换发型、发色、眼睛、年龄、体型、服装、性别或固定道具。characters 字段只能写本页动作、姿势、表情和道具状态，不得重新设计角色外观。
固定角色外观：
{bible_instruction}
如果模型输出的 character_bible 与上面的固定角色外观冲突，以固定角色外观为准。
caption 和 dialogue 仅用于剧情分镜调试，可为空；不要为绘图编写长段文字。最终传给 NovelAI 的提示词严禁包含这些字段。
画风偏好：{style}。

TRPG日志：
{str(log_text or '')[:MAX_AI_CHARS]}
"""
    # 漫画分镜固定使用主 API/Key 下的低思考模型，不受普通分析的 pro/ds 选项影响。
    validate_model_endpoint(AI_API_KEY, AI_BASE_URL, '主模型')
    current_client = client
    storyboard_model = COMIC_STORYBOARD_MODEL
    response = current_client.chat.completions.create(
        model=storyboard_model, messages=[
            {'role': 'system', 'content': '你擅长将中文 TRPG 日志改编成连续漫画分镜，并严格遵循固定角色外观。'},
            {'role': 'user', 'content': storyboard_prompt},
        ], temperature=0.45, max_tokens=12000,
    )
    record_token_usage(response, [
        {'role': 'system', 'content': '你擅长将中文 TRPG 日志改编成连续漫画分镜，并严格遵循固定角色外观。'},
        {'role': 'user', 'content': storyboard_prompt},
    ], module=token_module, model=storyboard_model, user_key=user_key, user_name=user_name, group_key=group_key, prompt_name='LogAI短漫画分镜测试' if token_module == 'log_comic_prompt' else 'LogAI短漫画', prompt=storyboard_prompt, job_id=job_id)
    storyboard = _comic_json_from_text(response.choices[0].message.content, pages, fixed_bible)
    comic_prompts = []
    for index, panel in enumerate(storyboard, 1):
        panel_prompt = _comic_prompt_from_panel(panel, style, fixed_bible)
        comic_prompts.append({'page': index, 'prompt': '漫画单页, ' + panel_prompt, 'scene': panel.get('scene', ''), 'characters': panel.get('characters', ''), 'camera': panel.get('camera', ''), 'caption': panel.get('caption', ''), 'dialogue': panel.get('dialogue', '')})
    return storyboard_model, fixed_bible, storyboard, comic_prompts


def background_generate_comic(job_id, log_text, pages=6, style=COMIC_STYLE_DEFAULT, user_key='', user_name='', group_key='', token_module='log_comic', is_pro=False, is_ds=False, backup_model='', backup_label='', comic_hash='', character_bible=''):
    pages = max(1, min(10, int(pages or 6)))
    try:
        storyboard_model, fixed_bible, storyboard, comic_prompts = _request_comic_storyboard(
            log_text, pages, style, character_bible, user_key, user_name, group_key, token_module, job_id
        )
        JOB_CACHE[job_id]['storyboard_model'] = storyboard_model
        JOB_CACHE[job_id]['character_bible'] = fixed_bible
        images = []
        for index, panel in enumerate(storyboard, 1):
            print(f"[{job_id}] 生成漫画第 {index}/{len(storyboard)} 页")
            panel_prompt = _comic_prompt_from_panel(panel, style, fixed_bible)
            image = _novelai_generate_image_bytes(panel_prompt, '1792x1024', IMAGE_COMIC_MODEL, comic=True)
            if index == len(storyboard):
                image = _add_comic_end_marker(image)
            images.append(image)
        _persist_comic_job(job_id, images, {
            'created': time.time(), 'pages': len(images), 'style': style,
            'user_key': user_key, 'user_name': user_name, 'group_key': group_key,
            'comic_hash': comic_hash, 'storyboard_model': storyboard_model,
            'character_bible': fixed_bible,
            'comic_prompts': comic_prompts,
        })
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['images'] = images
        JOB_CACHE[job_id]['comic_pages'] = len(images)
        JOB_CACHE[job_id]['comic_hash'] = comic_hash
        JOB_CACHE[job_id]['comic_prompts'] = comic_prompts
    except Exception as exc:
        print(f"[{job_id}] 漫画生成失败: {exc}")
        err = text_to_images(f"LogAI 漫画生成失败：\n{exc}", '漫画错误')[0]
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['images'] = [err]

def _extract_compound_log_text(log_sources=None, file_items=None, card_system="auto", identity_bindings=None):
    """统一从网络链接与本地群文件中抓取并拼接 Log 文本"""
    sections = []
    if log_sources:
        first = log_sources[0] or {}
        ls_text, failures = fetch_and_join_logs(log_sources, first.get('key'), first.get('password'), first.get('source'), identity_bindings=identity_bindings)
        if failures:
            print(f"[compound] 部分网络 Log 读取异常: {'；'.join(failures)}")
        if ls_text and ls_text.strip():
            sections.append({
                'title': f"网络Log({len(log_sources)}段)",
                'text': ls_text
            })
    if file_items:
        session = get_session()
        for f_idx, item in enumerate(file_items, 1):
            f_url = item.get('url')
            f_name = item.get('filename') or f'file_{f_idx}.txt'
            if os.path.exists(f_url) and os.path.isfile(f_url):
                with open(f_url, 'rb') as lf:
                    content = lf.read(50 * 1024 * 1024)
            else:
                resp = session.get(f_url, timeout=120, stream=True)
                resp.raise_for_status()
                content = b""
                downloaded = 0
                for chunk in resp.iter_content(chunk_size=65536):
                    if chunk:
                        content += chunk
                        downloaded += len(chunk)
                        if downloaded > 50 * 1024 * 1024:
                            break
            txt = extract_text_from_file(content, f_name, card_system)
            if txt and not txt.startswith("[ParseError]") and len(txt.strip()) >= 5:
                sections.append({
                    'title': f_name,
                    'text': txt
                })
    if not sections:
        return ""
    if len(sections) == 1:
        res = sections[0]['text']
    else:
        chunks = []
        for s_idx, sec in enumerate(sections, 1):
            chunks.append(
                f"================================================\n"
                f"【来源 {s_idx}/{len(sections)}: {sec['title']}】\n"
                f"================================================\n"
                f"{sec['text']}"
            )
        res = "\n\n".join(chunks)
    if identity_bindings and res:
        res = apply_identity_bindings(res, identity_bindings)
    return res

@app.route('/api/submit_comic', methods=['POST'])
def submit_comic_task():
    if len(JOB_CACHE) > 100:
        JOB_CACHE.clear()
    payload = request.get_json(silent=True) or {}
    try:
        pages = max(1, min(10, int(payload.get('pages', 6))))
    except (TypeError, ValueError):
        pages = 6
    style = str(payload.get('style') or COMIC_STYLE_DEFAULT)[:300]
    user_key = str(payload.get('user_key') or '').strip()[:128]
    user_name = str(payload.get('user_name') or '').strip()[:120]
    group_key = str(payload.get('group_key') or '').strip()[:128]
    character_bible = str(payload.get('character_bible') or '').strip()[:2400]
    is_pro = str(payload.get('pro', 'false')).lower() == 'true'
    is_ds = str(payload.get('ds', 'false')).lower() == 'true'
    backup_model = str(payload.get('backup_model') or '')[:128]
    backup_label = str(payload.get('backup_label') or '')[:40]
    log_sources = payload.get('log_sources') or []
    files_input = payload.get('files')
    if files_input and isinstance(files_input, list):
        file_items = [f for f in files_input if isinstance(f, dict) and f.get('url')]
    elif payload.get('url'):
        file_items = [{'url': payload.get('url'), 'filename': payload.get('filename') or 'log.txt'}]
    else:
        file_items = []
    identity_bindings = payload.get('identity_bindings') or {}
    try:
        log_text = _extract_compound_log_text(log_sources, file_items, identity_bindings=identity_bindings)
    except Exception as exc:
        return jsonify({'status': 'error', 'msg': f'Log 读取失败: {exc}'}), 400
    if not log_text or len(log_text.strip()) < 20:
        return jsonify({'status': 'error', 'msg': 'Log 内容为空或读取失败'}), 400
    if not character_bible:
        character_bible = _comic_character_bible_from_cards(log_text, user_key)
    comic_hash = _comic_cache_key(log_text, pages, style, character_bible)
    active_id, active_job = _find_active_comic_by_hash(comic_hash)
    if active_id:
        return jsonify({
            'status': 'ok', 'id': active_id, 'pages': int(active_job.get('comic_pages') or pages),
            'cached': True, 'processing': active_job.get('status') != 'done',
        })
    persisted = _find_persisted_comic_by_hash(comic_hash)
    if persisted:
        return jsonify({
            'status': 'ok', 'id': persisted['job_id'], 'pages': int(persisted.get('image_count', pages)),
            'cached': True, 'processing': False,
        })
    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {
        'status': 'processing', 'created': time.time(), 'images': [],
        'comic_hash': comic_hash, 'storyboard_model': COMIC_STORYBOARD_MODEL,
    }
    executor.submit(background_generate_comic, job_id, log_text, pages, style,
                    user_key, user_name, group_key, 'log_comic', is_pro, is_ds,
                    backup_model, backup_label, comic_hash, character_bible)
    return jsonify({'status': 'ok', 'id': job_id, 'pages': pages})


@app.route('/api/test_comic_prompt', methods=['POST'])
def test_comic_prompt_task():
    """仅生成分镜和 NovelAI 提示词，供调试角色一致性，不调用 NovelAI、不消耗漫画额度。"""
    payload = request.get_json(silent=True) or {}
    try:
        pages = max(1, min(10, int(payload.get('pages', 6))))
    except (TypeError, ValueError):
        pages = 6
    style = str(payload.get('style') or COMIC_STYLE_DEFAULT)[:300]
    user_key = str(payload.get('user_key') or '').strip()[:128]
    user_name = str(payload.get('user_name') or '').strip()[:120]
    group_key = str(payload.get('group_key') or '').strip()[:128]
    character_bible = str(payload.get('character_bible') or '').strip()[:2400]
    log_sources = payload.get('log_sources') or []
    files_input = payload.get('files')
    if files_input and isinstance(files_input, list):
        file_items = [f for f in files_input if isinstance(f, dict) and f.get('url')]
    elif payload.get('url'):
        file_items = [{'url': payload.get('url'), 'filename': payload.get('filename') or 'log.txt'}]
    else:
        file_items = []
    identity_bindings = payload.get('identity_bindings') or {}
    try:
        log_text = _extract_compound_log_text(log_sources, file_items, identity_bindings=identity_bindings)
    except Exception as exc:
        return jsonify({'status': 'error', 'msg': f'Log 读取失败: {exc}'}), 400
    if not log_text or len(log_text.strip()) < 20:
        return jsonify({'status': 'error', 'msg': 'Log 内容为空或读取失败'}), 400
    if not character_bible:
        character_bible = _comic_character_bible_from_cards(log_text, user_key)
    try:
        model, fixed_bible, storyboard, prompts = _request_comic_storyboard(
            log_text, pages, style, character_bible, user_key, user_name,
            group_key, 'log_comic_prompt', ''
        )
        return jsonify({
            'status': 'ok', 'storyboard_model': model, 'character_bible': fixed_bible,
            'pages': prompts, 'storyboard': storyboard,
        })
    except Exception as exc:
        return jsonify({'status': 'error', 'msg': f'分镜提示词生成失败: {exc}'}), 500

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
    try:
        heal_all_player_archives()
    except Exception:
        pass
    print("Async Log Server Started (Port: 8000)")
    app.run(host='0.0.0.0', port=8000)
