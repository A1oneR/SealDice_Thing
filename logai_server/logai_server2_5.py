# /// script
# dependencies = [
#     "flask",
#     "requests",
#     "pillow",
#     "openai",
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

# ================= 配置区域 =================
AI_API_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
AI_BASE_URL = "https://api.deepseek.com" 
AI_MODEL = "deepseek-chat"
FONT_PATH = "C:/Windows/Fonts/msyh.ttc" 
MAX_LOG_ENTRIES = 20000
MAX_AI_CHARS = 100000 
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
def background_process(job_id, key, password, source):
    """后台线程：执行下载、分析、绘图"""
    print(f"[{job_id}] 开始处理... Source: {source}")
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

        # AI 分析
        if len(log_text) > MAX_AI_CHARS:
            part = int(MAX_AI_CHARS * 0.4)
            mid = log_text[part:-part].split('\n')
            step = max(1, int(len(mid)/100))
            log_text_ai = f"{log_text[:part]}\n...[略]...\n{chr(10).join(mid[::step])}\n{log_text[-part:]}"
        else:
            log_text_ai = log_text

        resp = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "system", "content": "你是跑团Log鉴赏家。请对Log进行毒舌但专业的点评，格式：【总体评分】(0-100+理由)\\n【剧情概要】\\n【高光时刻】\\n【主要槽点】\\n【KP寄语】。不要Markdown。"}, {"role": "user", "content": log_text_ai}],
            temperature=0.7, max_tokens=1000
        )
        result_text = resp.choices[0].message.content

        # 绘图
        img = text_to_image(result_text, key)
        buf = BytesIO()
        img.save(buf, 'PNG')
        buf.seek(0)
        
        # 存入缓存
        JOB_CACHE[job_id]['status'] = 'done'
        JOB_CACHE[job_id]['image'] = buf.getvalue()
        print(f"[{job_id}] 处理完成")

    except Exception as e:
        print(f"[{job_id}] 失败: {e}")
        # 生成错误图片
        err_img = text_to_image(f"分析失败：{str(e)}", key)
        buf = BytesIO()
        err_img.save(buf, 'PNG')
        buf.seek(0)
        JOB_CACHE[job_id]['status'] = 'error'
        JOB_CACHE[job_id]['image'] = buf.getvalue()

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
    draw.text((padding, 30), "TRPG Log Analysis Report", font=title_font, fill='white')
    draw.text((padding+580, 48), f"KEY: {key_id[:8]}...", font=small_font, fill=(200,200,200))
    y = 160
    for line in lines:
        c = (192, 57, 43) if line.strip().startswith("【") else (40, 40, 40)
        draw.text((padding, y), line, font=font, fill=c)
        y += 41
    draw.text((width-320, h-40), "Generated by Sealdice AI", font=small_font, fill=(150,150,150))
    return img

# --- API 接口 ---

@app.route('/api/submit', methods=['GET'])
def submit_task():
    """提交任务，立即返回ID"""
    # 清理过期缓存(简单清理)
    if len(JOB_CACHE) > 100: JOB_CACHE.clear()
    
    key = request.args.get('key')
    password = request.args.get('password')
    source = request.args.get('source')
    
    if not source:
        if '-' in key and key.split('-')[0].isdigit(): source = "trpgbot"
        elif '_' in key or len(key) > 20: source = "kokona"
        else: source = "weizaima"

    job_id = str(uuid.uuid4())
    JOB_CACHE[job_id] = {'status': 'processing', 'created': time.time()}
    
    # 提交到线程池
    executor.submit(background_process, job_id, key, password, source)
    
    return jsonify({'status': 'ok', 'id': job_id, 'msg': '已加入队列，正在后台处理...'})

@app.route('/api/status', methods=['GET'])
def check_status():
    """查询任务状态"""
    job_id = request.args.get('id')
    job = JOB_CACHE.get(job_id)
    if not job: return jsonify({'status': 'not_found'})
    return jsonify({'status': job['status']})

@app.route('/api/result', methods=['GET'])
def get_result():
    """获取最终图片"""
    job_id = request.args.get('id')
    job = JOB_CACHE.get(job_id)
    if not job or 'image' not in job: return "Result not ready or expired", 404
    
    return send_file(
        BytesIO(job['image']), 
        mimetype='image/png',
        download_name=f'log_analysis_{job_id}.png'
    )

if __name__ == '__main__':
    disable_quick_edit()
    if not os.path.exists("./fonts"): os.makedirs("./fonts")
    print("Async Log Server Started (Port: 8000)")
    app.run(host='0.0.0.0', port=8000)