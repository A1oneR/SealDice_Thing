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
import textwrap
import datetime
import base64
import zlib
import requests
from flask import Flask, request, send_file, abort
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont
from openai import OpenAI

# ================= 配置区域 =================
# 替换你的 API Key
AI_API_KEY = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
AI_BASE_URL = "https://api.deepseek.com" # 或 https://api.openai.com/v1
AI_MODEL = "deepseek-chat"

# 字体路径 (必须存在，否则中文乱码)
FONT_PATH = "C:/Windows/Fonts/msyh.ttc"
# ===========================================

app = Flask(__name__)
client = OpenAI(api_key=AI_API_KEY, base_url=AI_BASE_URL)

def fetch_log_data(key, password=None):
    """
    从 weizaima 获取加密/压缩的 Log 数据
    """
    url = "https://weizaima.com/dice/api/load_data"
    params = {"key": key}
    if password:
        params["password"] = password
    
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (SealDice Log Analyzer)"
        }
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        
        if resp.status_code == 200:
            return resp.json()
        else:
            print(f"API 请求失败: {resp.status_code}")
            return None
    except Exception as e:
        print(f"网络请求异常: {e}")
        return None

def decode_log_content(encoded_str):
    """
    核心解密函数：Base64解码 -> Zlib解压 -> JSON解析
    """
    if not encoded_str:
        return None
    
    try:
        # 1. Base64 解码
        compressed_data = base64.b64decode(encoded_str)
        # 2. Zlib 解压
        json_bytes = zlib.decompress(compressed_data)
        # 3. JSON 解析
        log_obj = json.loads(json_bytes.decode('utf-8'))
        return log_obj
    except Exception as e:
        print(f"解压数据失败: {e}")
        return None

def format_log_for_ai(log_data):
    """
    将结构化的 Log 对象转换为文本剧本
    """
    if not log_data:
        return "数据解析失败，内容为空。"

    # 兼容不同的字段结构，通常 items 是在顶层或者 data 层
    items = log_data.get('items', [])
    if not items and 'data' in log_data and isinstance(log_data['data'], dict):
         items = log_data['data'].get('items', [])

    if not items:
        return "无法提取 Log 条目，文件结构可能已变更。"

    text_lines = []
    # 限制条数，防止 Token 溢出
    # 这里取前 1000 条，或者你可以写逻辑只取中间的高潮部分
    limit_items = items[:10000] 

    for item in limit_items:
        # 尝试获取昵称和消息内容
        nickname = item.get('nickname', '')
        # 有时候 nickname 为空但有 name
        if not nickname:
            nickname = item.get('name', '未知')
            
        message = item.get('message', '')
        
        # 过滤掉非文本消息（如空消息、图片占位符等，视需求而定）
        if message:
            # 简单的清洗，比如去除CQ码
            # message = re.sub(r'\[CQ:.*?\]', '', message) 
            text_lines.append(f"{nickname}: {message}")

    full_text = "\n".join(text_lines)
    
    if len(items) > 10000:
        full_text += "\n\n(......篇幅过长，AI仅分析了前10000条......)"
        
    return full_text

def analyze_log_with_ai(log_text):
    """请求 AI 分析"""
    system_prompt = """
    你是一位毒舌但极其专业的 TRPG 跑团鉴赏家（KP）。请阅读以下跑团 Log，生成一份简报。
    请严格按照以下格式输出（不要用 Markdown，直接分行）：

    【总体评分】：(0-100分，请给出理由)
    【剧情概要】：(简述发生了什么，500字内)
    【高光时刻】：(找出1-3个最精彩或最搞的一幕)
    【主要槽点】：(吐槽逻辑漏洞、糟糕的RP或离谱的操作)
    【KP寄语】：(一句话总结)

    风格要求：幽默、犀利、像老练的调查员在写结案报告。
    """

    try:
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Log内容如下：\n{log_text}"}
            ],
            temperature=0.9,
            max_tokens=65535
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"AI 分析出错: {str(e)}"

def text_to_image(text, key_id):
    """绘制图片 (最终版：支持中文自动像素级换行，防止文字截断)"""
    # 1. 画布基础配置
    width = 900
    padding = 50
    line_spacing = 15
    bg_color = (242, 241, 237) # 米色背景
    text_color = (40, 40, 40)
    
    # 2. 字体加载 (优先读取系统雅黑)
    font_path_to_use = "C:/Windows/Fonts/msyh.ttc" 
    
    # 容错：如果找不到系统字体，尝试当前目录
    if not os.path.exists(font_path_to_use):
        if os.path.exists("./fonts/SimHei.ttf"):
            font_path_to_use = "./fonts/SimHei.ttf"
        else:
            font_path_to_use = None 

    try:
        if font_path_to_use:
            font_size = 26
            font = ImageFont.truetype(font_path_to_use, font_size)
            title_font = ImageFont.truetype(font_path_to_use, 42)
            small_font = ImageFont.truetype(font_path_to_use, 20)
        else:
            raise IOError("Font not found")
    except Exception as e:
        print(f"字体加载失败，回退默认字体: {e}")
        font = ImageFont.load_default()
        title_font = ImageFont.load_default()
        small_font = ImageFont.load_default()
        font_size = 20

    # 3. 核心修复：按像素宽度自动换行 (解决文字截断问题)
    lines = []
    max_text_width = width - (padding * 2) # 文字可用的最大像素宽度
    
    # 遍历每一段文本
    for paragraph in text.split('\n'):
        if not paragraph:
            lines.append("") # 保留空行
            continue
            
        current_line = ""
        for char in paragraph:
            # 预测加入这个字符后，宽度是否超标
            if font.getlength(current_line + char) <= max_text_width:
                current_line += char
            else:
                # 如果超标，把当前行加入列表，开启新的一行
                lines.append(current_line)
                current_line = char
        # 把最后剩下的也加进去
        lines.append(current_line)

    # 4. 动态计算图片高度
    header_height = 110
    content_height = len(lines) * (font_size + line_spacing)
    footer_height = 60
    total_height = header_height + content_height + footer_height + padding

    # 5. 开始绘制
    img = Image.new('RGB', (width, total_height), bg_color)
    draw = ImageDraw.Draw(img)

    # 标题栏背景
    draw.rectangle([(0, 0), (width, header_height)], fill=(52, 73, 94))
    
    # 标题文字
    draw.text((padding, 30), "TRPG 跑团日志分析报告", font=title_font, fill=(255, 255, 255))
    draw.text((padding + 580, 48), f"KEY: {key_id}", font=small_font, fill=(200, 200, 200))

    # 正文内容
    y = header_height + padding
    for line in lines:
        # 简单的红色高亮逻辑
        curr_fill = text_color
        if line.strip().startswith("【"):
            curr_fill = (192, 57, 43) # 深红
        
        draw.text((padding, y), line, font=font, fill=curr_fill)
        y += font_size + line_spacing

    # 底部水印
    draw.line([(padding, total_height - 50), (width - padding, total_height - 50)], fill=(180, 180, 180), width=2)
    draw.text((width - 320, total_height - 40), f"AI 来自 Air", font=small_font, fill=(150, 150, 150))

    return img

@app.route('/analyze', methods=['GET'])
def handler():
    key = request.args.get('key')
    password = request.args.get('password') # 获取密码
    
    if not key:
        abort(400, "Missing key")

    # 1. 获取原始响应
    api_resp = fetch_log_data(key, password)
    
    if not api_resp or 'data' not in api_resp:
        result_text = f"❌ 获取失败 (Key: {key})\n请检查链接是否正确，或者该日志是否设置了特定的访问权限。"
    else:
        # 2. 解压 Data 字段
        encoded_blob = api_resp['data']
        log_json = decode_log_content(encoded_blob)
        
        if not log_json:
            result_text = "⚠️ 数据解压失败。\n无法解析服务器返回的压缩数据，可能协议已更新。"
        else:
            # 3. 格式化并分析
            log_text = format_log_for_ai(log_json)
            result_text = analyze_log_with_ai(log_text)

    # 4. 输出图片
    img = text_to_image(result_text, key)
    img_io = BytesIO()
    img.save(img_io, 'PNG')
    img_io.seek(0)
    
    return send_file(img_io, mimetype='image/png')

if __name__ == '__main__':
    if not os.path.exists("./fonts"):
        os.makedirs("./fonts")
        print("警告：请在 ./fonts 目录下放入中文字体文件 (如 SimHei.ttf)，否则图片文字将无法显示！")
    
    app.run(host='0.0.0.0', port=8000)
