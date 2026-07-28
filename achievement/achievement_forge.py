from flask import Flask, request, send_file, jsonify
from playwright.sync_api import sync_playwright
import datetime
import os
import time

app = Flask(__name__)
SAVE_DIR = "achievements"
if not os.path.exists(SAVE_DIR):
    os.makedirs(SAVE_DIR)

# --- 预设主题 (保持不变) ---
THEMES = {
    "暗黑": {"bg": "#1a1a1a", "accent": "#c9a063", "text": "#ffffff"},
    "羊皮纸": {"bg": "#5d4037", "accent": "#8b5a2b", "text": "#ffffff"},
    "赛博": {"bg": "#000b1a", "accent": "#00f3ff", "text": "#ffffff"},
    "星空": {"bg": "#161625", "accent": "#a29bfe", "text": "#ffffff"},
    "极简": {"bg": "#f4f4f4", "accent": "#333333", "text": "#333333"}
}

# --- 核心 CSS (保持不变) ---
BASE_CSS = """
:root {{ --bg: {bg}; --accent: {accent}; --text: {text}; }}
body {{ margin: 0; background: transparent; font-family: "Microsoft YaHei", "Source Han Sans CN", sans-serif; display: inline-block; padding: 10px; }}
.xbox-card {{ width: 620px; height: 120px; background: var(--bg); border-radius: 60px; display: flex; align-items: center; color: var(--text); overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }}
.xbox-icon {{ width: 100px; height: 100px; background: rgba(255,255,255,0.1); border-radius: 50%; margin-left: 10px; display: flex; justify-content: center; align-items: center; flex-shrink: 0; }}
.xbox-content {{ margin-left: 20px; }}
.xbox-title {{ font-size: 24px; font-weight: bold; margin-bottom: 2px; }}
.ps-card {{ width: 650px; height: 130px; background: {ps_bg}; border-radius: 12px; border: 2px solid #fff; display: flex; align-items: center; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }}
.ps-icon {{ font-size: 45px; margin: 0 30px; }}
.horiz-card {{ width: 850px; height: 180px; background: var(--bg); border: 1px solid var(--accent); box-shadow: 0 0 15px var(--accent); display: flex; color: var(--text); border-radius: 4px; }}
.horiz-left {{ width: 240px; border-right: 1px solid rgba(255,255,255,0.1); padding: 20px; }}
.horiz-mid {{ flex: 1; padding: 30px; font-size: 18px; display: flex; align-items: center; font-style: italic; }}
.vert-card {{ width: 380px; height: 520px; background: var(--bg); border: 2px solid var(--accent); display: flex; flex-direction: column; text-align: center; color: var(--text); border-radius: 8px; }}
.vert-icon {{ height: 220px; font-size: 100px; display: flex; align-items: center; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.1); }}
.label {{ color: var(--accent); font-size: 14px; margin-bottom: 5px; }}
"""

TROPHY_SVG = '<svg viewBox="0 0 24 24" width="55" height="55" fill="white"><path d="M18,2H6A2,2,0,0,0,4,4V7a4,4,0,0,0,4,4,4,4,0,0,0,3.5,3.93V19H9a1,1,0,0,0,0,2h6a1,1,0,0,0,0-2H12.5V14.93A4,4,0,0,0,16,11a4,4,0,0,0,4-4V4A2,2,0,0,0,18,2ZM6,9V4H8V9a2,2,0,0,1-4,0Zm14,0a2,2,0,0,1-4,0V4h2V9Z"></path></svg>'

@app.route('/create')
def create():
    # 每次请求独立管理 Playwright 声明周期
    with sync_playwright() as p:
        browser = None
        try:
            style = request.args.get('style', 'xbox').lower()
            title = request.args.get('title', '新成就')
            name = request.args.get('name', '调查员')
            desc = request.args.get('desc', '成就已解锁')
            score = request.args.get('score', '100')
            theme_name = request.args.get('theme', '暗黑')
            custom_bg = request.args.get('bg_color')

            # 颜色处理
            t_cfg = THEMES.get(theme_name, THEMES['暗黑']).copy()
            ps_bg_style = "linear-gradient(90deg, #003087, #0072ce)"
            if custom_bg:
                final_color = custom_bg if custom_bg.startswith('#') else f"#{custom_bg}"
                t_cfg['bg'] = final_color
                ps_bg_style = final_color

            # 风格 HTML 路由
            html_content = ""
            sel = ""
            if style == "ps":
                sel = ".ps-card"
                html_content = f'<div class="ps-card"><div class="ps-icon">🏆</div><div><div style="font-size:12px;opacity:0.8;text-transform:uppercase;">You earned a trophy!</div><div style="font-size:26px;font-weight:bold;margin:2px 0;">{title}</div><div style="font-size:14px;opacity:0.8;">{name} - {desc}</div></div></div>'
            elif style == "横版":
                sel = ".horiz-card"
                html_content = f'<div class="horiz-card"><div class="horiz-left"><div class="label">🏆 成就达成</div><div style="font-size:28px;font-weight:bold;">{title}</div><div style="margin-top:10px;">授予：{name}</div></div><div class="horiz-mid">「 {desc} 」</div><div style="width:80px;padding:20px;display:flex;align-items:flex-end;font-size:40px;">🎲</div></div>'
            elif style == "竖版":
                sel = ".vert-card"
                html_content = f'<div class="vert-card"><div class="vert-icon">🏆</div><div style="padding:30px;"><div class="label">ACHIEVEMENT</div><div style="font-size:32px;font-weight:bold;">{title}</div><div style="margin:15px 0;font-size:18px;color:var(--accent);">授予：{name}</div><div style="font-style:italic;opacity:0.8;">{desc}</div></div></div>'
            else:
                sel = ".xbox-card"
                html_content = f'<div class="xbox-card"><div class="xbox-icon">{TROPHY_SVG}</div><div class="xbox-content"><div class="xbox-title">Ⓖ {score} - {title}</div><div style="font-size:20px;opacity:0.85;font-style:italic;">「 {desc} 」</div></div></div>'

            # 启动浏览器，增加稳定性参数
            browser = p.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage', # 解决 Linux 内存共享问题
                    '--disable-gpu'
                ]
            )
            
            # 这里的页面尺寸设得稍微大一点，确保截图不被裁剪
            page = browser.new_page(viewport={'width': 1000, 'height': 800}, device_scale_factor=2)
            css = BASE_CSS.format(ps_bg=ps_bg_style, **t_cfg)
            
            # 使用 wait_until="networkidle" 确保 CSS 和图片资源加载完毕
            page.set_content(f"<html><head><style>{css}</style></head><body>{html_content}</body></html>", wait_until="networkidle")
            
            # 增加一个极短的缓冲时间
            time.sleep(0.1)

            element = page.query_selector(sel)
            if not element:
                raise Exception(f"无法找到元素: {sel}")
                
            img_bytes = element.screenshot(type='png', omit_background=True)
            
            # 保存文件
            save_path = os.path.join(SAVE_DIR, f"{title}.png")
            with open(save_path, "wb") as f:
                f.write(img_bytes)
            
            return jsonify({"status": "ok"})

        except Exception as e:
            print(f"渲染出错: {str(e)}")
            return jsonify({"status": "error", "msg": str(e)})
        finally:
            if browser:
                browser.close()

@app.route('/get_img')
def get_img():
    title = request.args.get('title')
    p = os.path.join(SAVE_DIR, f"{title}.png")
    if os.path.exists(p):
        return send_file(p, mimetype='image/png')
    return "Not Found", 404

if __name__ == '__main__':
    # 建议使用单线程模式运行 Flask 以提高 Playwright 的稳定性
    app.run(host='0.0.0.0', port=10000, threaded=False)