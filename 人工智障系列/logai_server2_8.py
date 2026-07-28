# /// script
# dependencies = [
#     "flask",
#     "requests",
#     "pillow",
#     "openai",
#     "python-docx",
#     "PyPDF2",
#     "pymupdf",
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
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from flask import Flask, request, send_file, jsonify
from PIL import Image, ImageDraw, ImageFont
from openai import OpenAI
# 新增依赖
import PyPDF2
import urllib.parse
import zipfile
import shutil
# 原有的 imports 保持不变...
from docx import Document

# ================= 配置区域 =================
AI_API_KEY = "sk-xxxxxxxxxxxxxxxxxx"
AI_BASE_URL = "https://xxxxxxxx/v1" # 或 https://api.openai.com/v1
AI_MODEL = "gemini-3-flash-preview"
AI_MODEL_PRO = "gemini-3.1-pro-preview"

# --- 绘图专用配置 (NovelAI) ---
# 请填入 NovelAI 提供的 API Key (通常是以 pst- 开头的一长串字符)
IMAGE_API_KEY = "xxxxxxxxxxxxxx"

# 推荐使用最新的 V3 模型，这是目前 NovelAI 画二次元最好的模型
IMAGE_MODEL = "nai-diffusion-4-5-full" 
# ===========================================

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

# 字体路径
FONT_PATH = "C:/Windows/Fonts/msyh.ttc" 

# 最大处理条目数
MAX_LOG_ENTRIES = 20000
# 发送给 AI 的最大字符数
MAX_AI_CHARS = 1000000

# --- 百度网盘 OpenAPI 配置 ---
BAIDU_APP_KEY = "xxxxxxxxxxxxxxxxxxxxxx"
BAIDU_SECRET_KEY = "xxxxxxxxxxxxxxxxxxxxxxx"
# 首次使用前，请在浏览器访问以下链接（将其中的【你的AppKey】替换成实际的AppKey）：
# http://openapi.baidu.com/oauth/2.0/authorize?response_type=code&client_id=【你的AppKey】&redirect_uri=oob&scope=basic,netdisk
# 同意授权后，网页会显示一段 Authorization Code，将其复制到下方：
BAIDU_AUTH_CODE = "xxxxxxxxxxxxxxxxxxxxxxxxxxx"

BAIDU_TARGET_DIR = "/coc_20260220_041522" # 指定的搜索目录
BAIDU_TOKEN_FILE = "baidu_token.json"    # 用于持久化保存token的文件

# ===========================================

# ===========================================

app = Flask(__name__)
client = OpenAI(api_key=AI_API_KEY, base_url=AI_BASE_URL)

# 任务队列与缓存
executor = ThreadPoolExecutor(max_workers=4) # 允许同时处理4个分析任务
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

# --- 核心处理任务 ---
def background_process(job_id, key, password, source, is_pro=False, is_kind=False, mode='analyze', persona=""):
    """后台线程：执行 Log 下载、分析、绘图"""
    print(f"[{job_id}] 开始处理Log... Source: {source}, Mode: {mode}")
    try:
        log_text = ""
        if source == "kokona":
            log_text = format_raw_text(fetch_kokona(key))
        elif source == "trpgbot":
            log_text = format_raw_text(fetch_trpgbot(key))
        elif source == "weizaima":
            log_text = format_weizaima_text(fetch_weizaima(key, password))
        
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
        if mode == 'recap':
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
            if is_kind: system_prompt = KIND_SYSTEM_PROMPT
            elif is_pro: system_prompt = PRO_SYSTEM_PROMPT
            else: system_prompt = DEFAULT_SYSTEM_PROMPT
        
        # 核心：人设系统劫持（强制带入骰娘语气且防止格式崩溃）
        if persona:
            system_prompt += f"\n\n【极其重要的扮演指令】：\n在生成上述所有评价和梳理内容时，请你完全带入以下角色人设来进行语气和口吻的渲染。你可以自称、吐槽或撒娇，让输出充满该人设的个性。\n（绝对警告：你必须严格保留前文要求的【板块标题】和【分页符】等格式标识符，千万不能省略或修改它们，只能改变正文部分的说话语气！）：\n{persona}"

        model = AI_MODEL_PRO if is_pro else AI_MODEL
        resp = client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": log_text_ai}],
            temperature=0.9, max_tokens=65535
        )
        result_text = resp.choices[0].message.content

        # 绘图与返回
        if mode == 'recap':
            # 前文回顾：调用多图引擎，分页渲染
            images_list = text_to_images(result_text, f"Key:{key[:8]}", "TRPG 跑团前文回顾")
            JOB_CACHE[job_id]['status'] = 'done'
            JOB_CACHE[job_id]['images'] = images_list
        else:
            # 基础评分：保留单图引擎
            img = text_to_image(result_text, key)
            buf = BytesIO()
            img.save(buf, 'PNG')
            buf.seek(0)
            JOB_CACHE[job_id]['status'] = 'done'
            JOB_CACHE[job_id]['image'] = buf.getvalue()
            
        print(f"[{job_id}] 处理完成")

    except Exception as e:
        print(f"[{job_id}] 失败: {e}")
        err_img_bytes = text_to_images(f"Log处理失败：\n{str(e)}", "Error")[0]
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['images'] = [err_img_bytes]

def extract_text_from_file(file_content, filename):
    """根据文件扩展名提取文本，增强容错能力"""
    ext = os.path.splitext(filename)[1].lower()
    text = ""
    
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
            
        else:
            return f"[ParseError]不支持的文件格式: {ext}"
            
    except Exception as e:
        # 加上特殊前缀，方便外层精准拦截
        return f"[ParseError]文件读取损坏 ({str(e)})\n可能是文件过大或本身已损坏。"
        
    return text

def background_file_process(job_id, file_url, filename, mode='analyze', is_pro=False, is_kind=False, persona=""):
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

        if ext == '.pdf' and downloaded <= 40 * 1024 * 1024:
            # 【原生 PDF 阅读模式】(限制在40MB内防代理服务器 Nginx 报 413 Payload Too Large)
            print(f"[{job_id}] 启用 LLM 原生 PDF 阅读模式 (大小: {downloaded/1024/1024:.2f}MB)")
            base64_pdf = base64.b64encode(content).decode('utf-8')
            user_content = [
                {"type": "text", "text": f"文件名：{filename}\n请仔细阅读这份 PDF 模组文档（包含其排版和图像），并严格按照系统设定的板块与要求进行分析。"},
                {"type": "image_url", "image_url": {"url": f"data:application/pdf;base64,{base64_pdf}"}}
            ]
            
        elif ext in ['.png', '.jpg', '.jpeg', '.webp'] and downloaded <= 20 * 1024 * 1024:
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
            raw_text = extract_text_from_file(content, filename)
            
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

        # 3. 根据不同模式分配 Prompt 与 绘图标题
        report_title = "TRPG 模组解析报告"
        
        if mode == 'log_analyze':
            report_title = "TRPG 跑团日志评分"
            if is_kind: system_prompt = KIND_SYSTEM_PROMPT
            elif is_pro: system_prompt = PRO_SYSTEM_PROMPT
            else: system_prompt = DEFAULT_SYSTEM_PROMPT
        
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
        
        # 4. 请求 AI
        print(f"[{job_id}] 正在请求 AI 处理...")
        resp = client.chat.completions.create(
            model = AI_MODEL_PRO if is_pro else AI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt}, 
                {"role": "user", "content": user_content}
            ],
            temperature=1.0, max_tokens=65535
        )
        result_text = resp.choices[0].message.content

        # 5. 多图渲染与保存 (动态传入 report_title)
        images_list = text_to_images(result_text, filename, report_title)
        
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['images'] = images_list 
        print(f"[{job_id}] 文件分析完成，共生成 {len(images_list)} 张图")

    except Exception as e:
        print(f"[{job_id}] 文件处理失败: {e}")
        err_img_bytes = text_to_images(f"文件处理失败：\n{str(e)}", filename)[0]
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['images'] = [err_img_bytes]

TRANSLATE_SYSTEM_PROMPT = "你是一个专业的翻译助手。请准确翻译用户提供的文本，保留原文格式，只返回翻译结果，不要添加任何解释或评论。"

@app.route('/api/translate', methods=['GET'])
def translate_task():
    """翻译文件任务"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    file_url = request.args.get('url')
    filename = request.args.get('filename', 'unknown')
    target_lang = request.args.get('lang', 'zh-CN')
    is_pro = request.args.get('pro', 'false').lower() == 'true'
    
    if not file_url:
        return jsonify({'status': 'error', 'msg': '缺少文件URL'})
    
    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    executor.submit(background_translate_process, job_id, file_url, filename, target_lang, is_pro)
    
    return jsonify({'status': 'ok', 'id': job_id, 'msg': f'正在翻译为 {target_lang}...'})

def background_translate_process(job_id, file_url, filename, target_lang='zh-CN', is_pro=False):
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
        
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": TRANSLATE_SYSTEM_PROMPT},
                {"role": "user", "content": translate_prompt}
            ],
            temperature=0.5, max_tokens=4000
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
    
    if not file_url:
        return jsonify({'status': 'error', 'msg': '缺少文件URL'})
    
    if not group_id or not upload_baseurl:
        return jsonify({'status': 'error', 'msg': '缺少群号或上传地址'})
    
    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    executor.submit(background_translate_and_upload, job_id, file_url, filename, target_lang, group_id, upload_baseurl, is_pro, overwrite)

    mode_msg = "覆盖模式" if overwrite else "注释模式"
    return jsonify({'status': 'ok', 'id': job_id, 'msg': f'正在翻译并上传到群文件...({mode_msg})'})


def translate_and_save_file(job_id, file_bytes, original_filename, target_lang, is_pro=False, overwrite=False):
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
                
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "system", "content": TRANSLATE_SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                    temperature=0.5, max_tokens=4000
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
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "system", "content": TRANSLATE_SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
                    temperature=0.5, max_tokens=65535
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
    
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": TRANSLATE_SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
        temperature=0.5, max_tokens=65535
    )
    result_text = resp.choices[0].message.content
    
    new_filename = f"翻译_{target_lang}_{name_without_ext}.txt"
    fd, temp_file_path = tempfile.mkstemp(suffix='.txt', text=True)
    os.close(fd)
    with open(temp_file_path, 'w', encoding='utf-8') as f:
        f.write(result_text)
    
    return temp_file_path, new_filename

def background_translate_and_upload(job_id, file_url, filename, target_lang, group_id, upload_baseurl, is_pro=False, overwrite=False):
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
        temp_file_path, new_filename = translate_and_save_file(job_id, file_bytes, filename, target_lang, is_pro, overwrite)
        
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

def text_to_image(text, key_id):
    width, padding = 900, 50
    font_path = FONT_PATH if os.path.exists(FONT_PATH) else ("./fonts/SimHei.ttf" if os.path.exists("./fonts/SimHei.ttf") else None)
    try:
        font = ImageFont.truetype(font_path, 26)
        title_font = ImageFont.truetype(font_path, 42)
        small_font = ImageFont.truetype(font_path, 20)
    except:
        font = title_font = small_font = ImageFont.load_default()

    lines = []
    for para in text.split('\n'):
        if not para: lines.append(""); continue
        curr = ""
        for char in para:
            if font.getlength(curr + char) <= width - 2*padding: curr += char
            else: lines.append(curr); curr = char
        lines.append(curr)

    h = 110 + len(lines)*41 + 60 + padding
    img = Image.new('RGB', (width, h), (242, 241, 237))
    draw = ImageDraw.Draw(img)
    draw.rectangle([(0, 0), (width, 110)], fill=(52, 73, 94))
    draw.text((padding, 30), "TRPG 跑团日志分析报告", font=title_font, fill='white')
    draw.text((padding+580, 48), f"KEY: {key_id[:8]}...", font=small_font, fill=(200,200,200))
    y = 160
    for line in lines:
        c = (192, 57, 43) if line.strip().startswith("【") else (40, 40, 40)
        draw.text((padding, y), line, font=font, fill=c)
        y += 41
    draw.text((width-320, h-40), "AI 来自 Air", font=small_font, fill=(150,150,150))
    return img

def text_to_images(text, file_title, report_title="TRPG 模组解析报告"):
    """将带有【分页符】的长文本切片，渲染成多张图片字节流列表"""
    parts = [p.strip() for p in text.split('【分页符】') if p.strip()]
    if not parts:
        parts = [text]
        
    width, padding = 900, 50
    font_path = FONT_PATH if os.path.exists(FONT_PATH) else ("./fonts/SimHei.ttf" if os.path.exists("./fonts/SimHei.ttf") else None)
    try:
        font = ImageFont.truetype(font_path, 26)
        title_font = ImageFont.truetype(font_path, 42)
        small_font = ImageFont.truetype(font_path, 20)
    except:
        font = title_font = small_font = ImageFont.load_default()

    images_bytes = []
    
    for idx, part in enumerate(parts):
        lines = []
        for para in part.split('\n'):
            if not para: lines.append(""); continue
            curr = ""
            for char in para:
                if font.getlength(curr + char) <= width - 2*padding: curr += char
                else: lines.append(curr); curr = char
            lines.append(curr)

        h = 110 + len(lines)*41 + 60 + padding
        img = Image.new('RGB', (width, h), (242, 241, 237))
        draw = ImageDraw.Draw(img)
        draw.rectangle([(0, 0), (width, 110)], fill=(52, 73, 94))
        # 【修改点】动态渲染主标题
        draw.text((padding, 30), report_title, font=title_font, fill='white')
        
        page_text = f"Page {idx+1}/{len(parts)} - {file_title[:15]}..." if len(parts) > 1 else f"{file_title[:20]}..."
        draw.text((padding+520, 48), page_text, font=small_font, fill=(200,200,200))
        
        y = 160
        for line in lines:
            c = (192, 57, 43) if line.strip().startswith("【") else (40, 40, 40)
            draw.text((padding, y), line, font=font, fill=c)
            y += 41
        draw.text((width-320, h-40), "AI 来自 Air", font=small_font, fill=(150,150,150))
        
        buf = BytesIO()
        img.save(buf, 'PNG')
        buf.seek(0)
        images_bytes.append(buf.getvalue())
        
    return images_bytes

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
        
        # 1. 获取匹配的文件列表 (多拉取一点以备分组)
        raw_targets = baidu_search_files(keyword, limit=50)
        if not raw_targets:
            raise Exception(f"在 {BAIDU_TARGET_DIR} 中未找到包含 '{keyword}' 的文件或文件夹")
        
        # 2. 核心防护机制：过滤掉所有带有【】标识的文件夹
        filtered_targets = []
        for t in raw_targets:
            if t['isdir'] == 1 and '{' in t['server_filename'] and '}' in t['server_filename']:
                print(f"[{job_id}] 安全拦截：过滤掉集合文件夹 {t['server_filename']}")
                continue
            filtered_targets.append(t)
            
        if not filtered_targets:
            raise Exception(f"搜索词 '{keyword}' 命中的是被保护的合集文件夹，请尝试搜索更具体的模组名称！")
            
        # 3. 核心修复：按父文件夹分组，解决“同名模组在不同文件夹”被忽略的问题
        grouped_targets = {}
        for t in filtered_targets:
            parent_dir = posixpath.dirname(t['path'])
            if parent_dir not in grouped_targets:
                grouped_targets[parent_dir] = []
            grouped_targets[parent_dir].append(t)
        
        # 4. 网盘分享模式
        if not is_local:
            share_messages = []
            # 最多处理前 5 个不同的文件夹，防止频繁调用分享API被封
            for parent_dir, targets_in_dir in list(grouped_targets.items())[:5]:
                fs_ids = [t['fs_id'] for t in targets_in_dir]
                names = [t['server_filename'] for t in targets_in_dir]
                
                try:
                    share_text = baidu_create_share(fs_ids)
                    # 提取文件夹名字用于展示
                    folder_name = posixpath.basename(parent_dir) if parent_dir != '/' else '根目录'
                    names_str = "、".join(names[:4]) + ("..." if len(names)>4 else "")
                    
                    share_messages.append(f"📁 来自【{folder_name}】:\n📄 {names_str}\n{share_text}")
                except Exception as e:
                    print(f"[{job_id}] 创建分享失败 {parent_dir}: {e}")
            
            if not share_messages:
                raise Exception("网盘分享链接生成失败，可能是接口限制。")
            
            final_msg = f"🔍 找到了分散在不同文件夹的同名/相关模组：\n\n" + "\n\n".join(share_messages)
            if len(grouped_targets) > 5:
                final_msg += f"\n\n(为防刷屏，已折叠其余 {len(grouped_targets)-5} 个文件夹的结果)"
                
            JOB_CACHE[job_id]['status'] = 'done'
            JOB_CACHE[job_id]['msg'] = final_msg
            return

        # 5. 本地下载打包模式
        import tempfile
        import zipfile
        import shutil
        import urllib.parse
        import concurrent.futures
        
        temp_dir = tempfile.mkdtemp()
        try:
            print(f"[{job_id}] 正在分析目标结构...")
            group_folder_name = f"搜索结果_{keyword}"
            group_folder_path = os.path.join(temp_dir, group_folder_name)
            os.makedirs(group_folder_path, exist_ok=True)
            
            # 收集所有需要下载的单文件
            all_download_tasks = []
            total_files_limit = 30 # 限制总下载数防爆
            
            # 用于消息展示的统计
            names_display_lines = []
            
            # 本地下载最多允许收集10个不同文件夹的跨度
            for parent_dir, targets_in_dir in list(grouped_targets.items())[:10]: 
                folder_name = posixpath.basename(parent_dir) if parent_dir != '/' else '根目录'
                names = [t['server_filename'] for t in targets_in_dir]
                names_display_lines.append(f"📁 【{folder_name}】: " + "、".join(names[:3]) + ("..." if len(names)>3 else ""))
                
                for t in targets_in_dir:
                    if len(all_download_tasks) >= total_files_limit: break
                    
                    server_filename = t['server_filename']
                    if t['isdir'] == 0:
                        # 核心防覆盖：保存路径加上 folder_name 防止同名文件互相覆盖 
                        # 例如：/搜索结果_追书人/新手/追书人.pdf 
                        #       /搜索结果_追书人/美模/追书人.pdf
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

            # 5.2 批量换取下载直链
            print(f"[{job_id}] 总计 {len(all_download_tasks)} 个文件，正在批量换取下载直链...")
            task_fs_ids = [task[0] for task in all_download_tasks]
            dlinks_map = baidu_get_dlinks_batch(task_fs_ids, token)
            
            # 5.3 开启线程池多线程并发下载
            print(f"[{job_id}] 开始多线程极速下载...")
            def _worker(task):
                fs_id, save_path = task
                dlink = dlinks_map.get(fs_id)
                if dlink:
                    download_baidu_file_to_temp(dlink, save_path, token)

            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                list(executor.map(_worker, all_download_tasks))
            
            # 5.4 打包成 ZIP
            final_filename = f"{group_folder_name}.zip"
            final_upload_path = os.path.join(temp_dir, final_filename)
            
            print(f"[{job_id}] 拉取完成，正在打包 zip...")
            with zipfile.ZipFile(final_upload_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(group_folder_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.join(group_folder_name, os.path.relpath(file_path, group_folder_path))
                        zipf.write(file_path, arcname)

            # 5.5 上传到 QQ 群文件
            print(f"[{job_id}] 正在上传至群文件: {final_filename}")
            sess = get_session()
            upload_url = f"{upload_baseurl}/upload_group_file?group_id={group_id}&file=file://{final_upload_path}&name={urllib.parse.quote(final_filename)}"
            upload_resp = sess.get(upload_url, timeout=300).json() 

            if upload_resp.get('status') == 'ok':
                JOB_CACHE[job_id]['status'] = 'done'
                JOB_CACHE[job_id]['msg'] = f"✅ 已将内容归档为【{final_filename}】并上传至群文件！\n包含以下内容：\n{names_display}"
            else:
                raise Exception(f"群文件上传失败: {upload_resp}")
                
        finally:
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
    """提交日志分析任务 (支持 POST 传入人设)"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        key = data.get('key')
        password = data.get('password')
        source = data.get('source')
        is_pro = str(data.get('pro', 'false')).lower() == 'true'
        is_kind = str(data.get('kind', 'false')).lower() == 'true'
        mode = data.get('mode', 'analyze')
        persona = data.get('persona', '')
    else:
        key = request.args.get('key')
        password = request.args.get('password')
        source = request.args.get('source')
        is_pro = request.args.get('pro', 'false').lower() == 'true'
        is_kind = request.args.get('kind', 'false').lower() == 'true'
        mode = request.args.get('mode', 'analyze')
        persona = request.args.get('persona', '')

    if not source:
        if key and '-' in key and key.split('-')[0].isdigit(): source = "trpgbot"
        elif key and ('_' in key or len(key) > 20): source = "kokona"
        else: source = "weizaima"

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    executor.submit(background_process, job_id, key, password, source, is_pro, is_kind, mode, persona)
    return jsonify({'status': 'ok', 'id': job_id})

@app.route('/api/submit_file', methods=['GET', 'POST'])
def submit_file_task():
    """提交本地文件分析任务 (支持 POST 传入人设)"""
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        file_url = data.get('url')
        filename = data.get('filename')
        mode = data.get('mode', 'analyze')
        is_pro = str(data.get('pro', 'false')).lower() == 'true'
        is_kind = str(data.get('kind', 'false')).lower() == 'true'
        persona = data.get('persona', '')
    else:
        file_url = request.args.get('url')
        filename = request.args.get('filename')
        mode = request.args.get('mode', 'analyze')
        is_pro = request.args.get('pro', 'false').lower() == 'true'
        is_kind = request.args.get('kind', 'false').lower() == 'true'
        persona = request.args.get('persona', '')
    
    if not file_url or not filename: return "Missing params", 400

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    executor.submit(background_file_process, job_id, file_url, filename, mode, is_pro, is_kind, persona)
    return jsonify({'status': 'ok', 'id': job_id})

@app.route('/api/status', methods=['GET'])
def check_status():
    """查询任务状态，附带图像数量"""
    job_id = request.args.get('id')
    job = JOB_CACHE.get(job_id)
    if not job: return jsonify({'status': 'not_found'})
    
    # 兼容老版只返回单图的逻辑以及新版的多图逻辑
    img_count = len(job.get('images', [])) if 'images' in job else (1 if 'image' in job else 0)
    
    return jsonify({
        'status': job['status'],
        'msg': job.get('msg', ''),
        'image_count': img_count
    })

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
