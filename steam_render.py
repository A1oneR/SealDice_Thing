"""
Steam 状态渲染后端
配合 SealDice 的 steam查询.js 插件使用
提供多种卡片风格：状态查询卡、最近游玩卡、开始游玩播报卡、结束游玩播报卡

依赖:
    pip install flask playwright httpx
    playwright install chromium

启动:
    python steam_render.py
    默认监听 http://127.0.0.1:10001
"""
from flask import Flask, request, send_file, jsonify
from playwright.sync_api import sync_playwright
import os
import time
import hashlib
import threading
import base64
import httpx
from urllib.parse import quote

app = Flask(__name__)
SAVE_DIR = "steam_cache"
AVATAR_DIR = os.path.join(SAVE_DIR, "avatars")
os.makedirs(SAVE_DIR, exist_ok=True)
os.makedirs(AVATAR_DIR, exist_ok=True)

# Playwright 单例（线程安全启动）
_pw_lock = threading.Lock()
_pw_ctx = {"pw": None, "browser": None}


def _get_browser():
    """惰性启动 Playwright + Chromium，复用同一个 browser 实例，避免每次请求都重启。"""
    with _pw_lock:
        if _pw_ctx["browser"] is None:
            _pw_ctx["pw"] = sync_playwright().start()
            _pw_ctx["browser"] = _pw_ctx["pw"].chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ],
            )
        return _pw_ctx["browser"]


def download_avatar(steamid, url):
    """下载头像到本地，返回本地路径（供页面通过 file:// 访问）"""
    if not url:
        return None
    path = os.path.join(AVATAR_DIR, f"{steamid}.jpg")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < 86400:
        return os.path.abspath(path)
    try:
        r = httpx.get(url, timeout=8, follow_redirects=True)
        if r.status_code == 200 and r.content:
            with open(path, 'wb') as f:
                f.write(r.content)
            return os.path.abspath(path)
    except Exception as e:
        print(f"[avatar] 下载失败 {steamid}: {e}")
    return os.path.abspath(path) if os.path.exists(path) else None


def file_to_data_url(path):
    """把本地图片转成 data URL 嵌入 HTML，绕开 about:blank 无法加载 file:// 的限制。"""
    if not path or not os.path.exists(path):
        return ""
    try:
        with open(path, 'rb') as f:
            raw = f.read()
        ext = os.path.splitext(path)[1].lower().lstrip('.')
        mime = 'image/jpeg' if ext in ('jpg', 'jpeg', '') else f'image/{ext}'
        return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"
    except Exception as e:
        print(f"[file_to_data_url] {e}")
        return ""


def resolve_avatar(steamid, avatar_url):
    """统一头像获取入口：优先下载到本地缓存，再转 data URL。失败则回退到远程 URL。"""
    if not avatar_url:
        return ""
    local = download_avatar(steamid, avatar_url)
    data_url = file_to_data_url(local) if local else ""
    return data_url or avatar_url


# ============= HTML 模板 =============
BASE_CSS = """
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: transparent; font-family: "Microsoft YaHei","Source Han Sans CN",sans-serif;
       display: inline-block; padding: 12px; }
.card {
    width: 640px; border-radius: 14px; overflow: hidden; color: #fff;
    background: linear-gradient(135deg,#1b2838 0%,#2a475e 100%);
    box-shadow: 0 6px 24px rgba(0,0,0,0.45);
    border: 1px solid rgba(255,255,255,0.08);
}
.header {
    display: flex; align-items: center; padding: 18px 22px;
    background: rgba(0,0,0,0.25);
    border-bottom: 1px solid rgba(255,255,255,0.06);
}
.avatar-wrap { position: relative; width: 72px; height: 72px; flex-shrink: 0; }
.avatar {
    width: 72px; height: 72px; border-radius: 10px; object-fit: cover;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.15);
    background: #24313f;
}
.status-dot {
    position: absolute; right: -2px; bottom: -2px; width: 18px; height: 18px;
    border-radius: 50%; border: 3px solid #1b2838;
}
.dot-online  { background: #57cbde; }
.dot-ingame  { background: #90ba3c; box-shadow: 0 0 8px #90ba3c; }
.dot-offline { background: #6a7480; }
.dot-away    { background: #f0c419; }
.dot-busy    { background: #d94f43; }
.user-info { margin-left: 18px; flex: 1; overflow: hidden; }
.user-name { font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
.user-state { font-size: 15px; opacity: 0.85; margin-top: 4px; }
.state-ingame { color: #beee11; }
.body { padding: 18px 22px; }
.line { display: flex; justify-content: space-between; font-size: 14px; padding: 6px 0; }
.line span:first-child { opacity: 0.6; }
.game-block {
    margin-top: 8px; padding: 14px 16px; border-radius: 8px;
    background: rgba(144,186,60,0.14); border-left: 3px solid #90ba3c;
}
.game-label { font-size: 12px; opacity: 0.75; letter-spacing: 1px; }
.game-name  { font-size: 20px; font-weight: 600; color: #beee11; margin-top: 3px; }
.footer {
    padding: 10px 22px; font-size: 12px; opacity: 0.5;
    border-top: 1px solid rgba(255,255,255,0.06); text-align: right;
}

/* 最近游玩卡 */
.recent-card { width: 680px; }
.recent-list { padding: 12px 22px 18px 22px; }
.recent-row {
    display: flex; align-items: center; padding: 10px 0;
    border-bottom: 1px dashed rgba(255,255,255,0.08);
}
.recent-row:last-child { border-bottom: none; }
.recent-idx {
    width: 30px; height: 30px; border-radius: 50%;
    background: rgba(144,186,60,0.2); color: #beee11;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; flex-shrink: 0;
}
.recent-info { margin-left: 14px; flex: 1; }
.recent-name { font-size: 16px; font-weight: 600; }
.recent-meta { font-size: 12px; opacity: 0.7; margin-top: 3px; }

/* 播报卡（横向） */
.notice {
    width: 620px; padding: 16px 20px; border-radius: 12px;
    background: linear-gradient(135deg,#1b2838,#2a475e);
    display: flex; align-items: center; color: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    border: 1px solid rgba(255,255,255,0.08);
}
.notice-avatar { width: 60px; height: 60px; border-radius: 8px; margin-right: 16px; object-fit: cover; }
.notice-text { flex: 1; overflow: hidden; }
.notice-title { font-size: 14px; opacity: 0.7; }
.notice-body {
    font-size: 20px; font-weight: 600; margin-top: 4px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.notice-time { font-size: 12px; opacity: 0.5; margin-top: 4px; }
.notice-body.start { color: #beee11; }
.notice-body.end   { color: #f0c419; }
.notice-body.on    { color: #57cbde; }
.notice-body.off   { color: #a0a0a0; }
"""


def html_shell(inner):
    return f"""<!doctype html><html><head><meta charset="utf-8">
<style>{BASE_CSS}</style></head><body>{inner}</body></html>"""


def state_dot_class(persona_state, in_game):
    if in_game:
        return 'dot-ingame'
    if persona_state == 0:
        return 'dot-offline'
    if persona_state in (2,):
        return 'dot-busy'
    if persona_state in (3, 4):
        return 'dot-away'
    return 'dot-online'


PERSONA_TEXT = {
    0: '离线', 1: '在线', 2: '忙碌',
    3: '离开', 4: '打盹', 5: '想交易', 6: '想游戏'
}


def fmt_time(ts):
    if not ts:
        return '—'
    try:
        return time.strftime('%Y-%m-%d %H:%M', time.localtime(int(ts)))
    except Exception:
        return '—'


def fmt_minutes(minutes):
    if minutes is None:
        return '—'
    minutes = int(minutes)
    if minutes < 60:
        return f'{minutes} 分钟'
    h, m = minutes // 60, minutes % 60
    return f'{h} 小时' if m == 0 else f'{h} 小时 {m} 分钟'


def screenshot(html, selector):
    """把 html 渲染到 chromium 中，返回截图字节。"""
    browser = _get_browser()
    context = browser.new_context(viewport={'width': 900, 'height': 800},
                                  device_scale_factor=2)
    try:
        page = context.new_page()
        page.set_content(html, wait_until='load')
        el = page.query_selector(selector)
        if not el:
            raise Exception(f"selector not found: {selector}")
        return el.screenshot(type='png', omit_background=True)
    finally:
        context.close()


def save_png(prefix, data):
    """保存截图到 SAVE_DIR，用哈希命名避免同名覆盖冲突"""
    h = hashlib.md5(data[:1024] + str(time.time()).encode()).hexdigest()[:16]
    fname = f"{prefix}_{h}.png"
    fpath = os.path.join(SAVE_DIR, fname)
    with open(fpath, 'wb') as f:
        f.write(data)
    return fname


# ============= 接口 1：状态查询卡 =============
@app.route('/status', methods=['GET'])
def render_status():
    try:
        steamid = request.args.get('steamid', '')
        name = request.args.get('name', 'Unknown')
        avatar_url = request.args.get('avatar', '')
        persona_state = int(request.args.get('persona_state', '0') or 0)
        game = request.args.get('game', '')
        gameid = request.args.get('gameid', '')
        last_logoff = request.args.get('last_logoff', '')
        profile_url = request.args.get('profile', '')
        display_name = request.args.get('display_name', '')

        avatar_src = resolve_avatar(steamid, avatar_url)

        in_game = bool(game)
        dot_cls = state_dot_class(persona_state, in_game)
        state_text = f"正在游玩" if in_game else PERSONA_TEXT.get(persona_state, '未知')
        state_cls = 'state-ingame' if in_game else ''

        game_html = ''
        if in_game:
            game_html = f"""
            <div class="game-block">
                <div class="game-label">CURRENTLY PLAYING</div>
                <div class="game-name">🎮 {game}</div>
            </div>"""

        display_line = ''
        if display_name:
            display_line = f'<div class="line"><span>群昵称</span><span>{display_name}</span></div>'

        body = f"""
        <div class="card">
            <div class="header">
                <div class="avatar-wrap">
                    <img class="avatar" src="{avatar_src}" onerror="this.style.background='#24313f'"/>
                    <div class="status-dot {dot_cls}"></div>
                </div>
                <div class="user-info">
                    <div class="user-name">{name}</div>
                    <div class="user-state {state_cls}">{state_text}</div>
                </div>
            </div>
            <div class="body">
                {game_html}
                {display_line}
                <div class="line"><span>SteamID</span><span>{steamid}</span></div>
                <div class="line"><span>AppID</span><span>{gameid or '—'}</span></div>
                <div class="line"><span>最后在线</span><span>{fmt_time(last_logoff)}</span></div>
            </div>
            <div class="footer">Steam Status · {time.strftime('%H:%M')}</div>
        </div>"""

        img = screenshot(html_shell(body), '.card')
        fname = save_png('status', img)
        return jsonify({'status': 'ok', 'file': fname,
                        'url': request.host_url.rstrip('/') + '/img/' + fname})
    except Exception as e:
        print(f"[/status] {e}")
        return jsonify({'status': 'error', 'msg': str(e)}), 500


# ============= 接口 2：最近游玩卡 =============
@app.route('/recent', methods=['POST'])
def render_recent():
    try:
        data = request.get_json(force=True)
        steamid = data.get('steamid', '')
        name = data.get('name', 'Unknown')
        avatar_url = data.get('avatar', '')
        games = data.get('games', [])[:5]

        avatar_src = resolve_avatar(steamid, avatar_url)

        rows = ''
        for i, g in enumerate(games, 1):
            rows += f"""
            <div class="recent-row">
                <div class="recent-idx">{i}</div>
                <div class="recent-info">
                    <div class="recent-name">{g.get('name','?')}</div>
                    <div class="recent-meta">近两周 {fmt_minutes(g.get('playtime_2weeks',0))} · 总计 {fmt_minutes(g.get('playtime_forever',0))}</div>
                </div>
            </div>"""

        if not games:
            rows = '<div class="recent-row"><div class="recent-info"><div class="recent-name">近两周没有游玩记录</div></div></div>'

        body = f"""
        <div class="card recent-card">
            <div class="header">
                <div class="avatar-wrap">
                    <img class="avatar" src="{avatar_src}"/>
                </div>
                <div class="user-info">
                    <div class="user-name">{name}</div>
                    <div class="user-state">📅 近两周游玩记录</div>
                </div>
            </div>
            <div class="recent-list">{rows}</div>
            <div class="footer">Steam Recent · {time.strftime('%Y-%m-%d %H:%M')}</div>
        </div>"""

        img = screenshot(html_shell(body), '.card')
        fname = save_png('recent', img)
        return jsonify({'status': 'ok', 'file': fname,
                        'url': request.host_url.rstrip('/') + '/img/' + fname})
    except Exception as e:
        print(f"[/recent] {e}")
        return jsonify({'status': 'error', 'msg': str(e)}), 500


# ============= 接口 3：播报卡（开始/结束/上线/下线） =============
@app.route('/notice', methods=['GET'])
def render_notice():
    try:
        kind = request.args.get('kind', 'start')  # start / end / on / off
        steamid = request.args.get('steamid', '')
        name = request.args.get('name', 'Unknown')
        avatar_url = request.args.get('avatar', '')
        game = request.args.get('game', '')
        duration_min = int(request.args.get('duration', '0') or 0)

        avatar_src = resolve_avatar(steamid, avatar_url)

        title_map = {
            'start': '🎮 开始游玩',
            'end':   '🛑 结束游玩',
            'on':    '🟢 上线了',
            'off':   '⚪ 下线了',
        }
        title = title_map.get(kind, '状态变化')

        if kind == 'start':
            body_text = f"{name} 开始游玩 {game}"
            cls = 'start'
        elif kind == 'end':
            dur = fmt_minutes(duration_min) if duration_min > 0 else ''
            body_text = f"{name} 结束了 {game}"
            if dur:
                body_text += f"，本次游玩 {dur}"
            cls = 'end'
        elif kind == 'on':
            body_text = f"{name} 上线了"
            cls = 'on'
        else:
            body_text = f"{name} 下线了"
            cls = 'off'

        body = f"""
        <div class="notice">
            <img class="notice-avatar" src="{avatar_src}"/>
            <div class="notice-text">
                <div class="notice-title">{title}</div>
                <div class="notice-body {cls}">{body_text}</div>
                <div class="notice-time">{time.strftime('%Y-%m-%d %H:%M:%S')}</div>
            </div>
        </div>"""

        img = screenshot(html_shell(body), '.notice')
        fname = save_png(f'notice_{kind}', img)
        return jsonify({'status': 'ok', 'file': fname,
                        'url': request.host_url.rstrip('/') + '/img/' + fname})
    except Exception as e:
        print(f"[/notice] {e}")
        return jsonify({'status': 'error', 'msg': str(e)}), 500


# ============= 接口 4：静态图片 =============
@app.route('/img/<fname>')
def get_img(fname):
    # 简单防目录穿越
    if '/' in fname or '\\' in fname or '..' in fname:
        return 'bad name', 400
    p = os.path.join(SAVE_DIR, fname)
    if os.path.exists(p):
        return send_file(p, mimetype='image/png')
    return 'Not Found', 404


@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'time': int(time.time())})


if __name__ == '__main__':
    # 建议单线程，Playwright 稳定性更好
    app.run(host='0.0.0.0', port=10001, threaded=False)
