// ==UserScript==
// @name         Steam状态查询
// @author       Claude
// @version      1.0.0
// @description  查询Steam玩家在线状态、正在游玩的游戏、最近游戏等，支持绑定SteamID到用户，支持群内播报状态变化
// @timestamp    2026-07-07
// @license      MIT
// @homepageURL  https://github.com/sealdice
// @sealVersion  1.4.5
// ==/UserScript==

// ============= 1. 创建 / 复用扩展 =============
let ext = seal.ext.find('steam_status');
if (!ext) {
    ext = seal.ext.new('steam_status', 'Claude', '1.0.0');
    seal.ext.register(ext);
}

// ============= 2. 配置项 =============
seal.ext.registerStringConfig(ext, 'steam_api_key', '',
    'Steam Web API Key，在 https://steamcommunity.com/dev/apikey 获取');
seal.ext.registerStringConfig(ext, 'render_backend', '',
    '图片渲染后端地址（留空则不出图），运行 steam_render.py 后填写，例如 http://127.0.0.1:10001');
seal.ext.registerOptionConfig(ext, 'output_mode', 'text',
    ['image', 'text', 'both'], '输出模式：image=纯图片 text=纯文本 both=图文都发（image/both 需先配置 render_backend）');
seal.ext.registerBoolConfig(ext, 'enable_broadcast', false,
    '是否启用群内状态变化播报（需在群里开启后生效）');
seal.ext.registerIntConfig(ext, 'poll_interval_minutes', 3,
    '状态轮询间隔（分钟），最小1');
seal.ext.registerIntConfig(ext, 'steam_api_timeout_seconds', 30,
    'Steam API 请求超时（秒），国内直连建议 20~60，配代理可 10~15');
seal.ext.registerIntConfig(ext, 'steam_api_retry', 3,
    'Steam API 请求失败自动重试次数（0=不重试），DNS 抽风时建议 3~5');
seal.ext.registerStringConfig(ext, 'steam_api_host_override', '',
    '自定义 Steam API 主机地址（多个用英文逗号分隔，会依次重试）。例如：https://api.steampowered.com,https://23.7.143.88 或反代地址；留空则使用官方');
seal.ext.registerBoolConfig(ext, 'notify_game_end', true,
    '是否播报游戏结束通知（含游玩时长）');
seal.ext.registerBoolConfig(ext, 'notify_online_offline', false,
    '是否播报纯上下线（不涉及游戏）状态变化');
seal.ext.registerOptionConfig(ext, 'permission_level', 'user',
    ['user', 'admin'], '播报开关权限：user=所有人可用 admin=需管理员');

// ============= 3. 常量与工具 =============
const STEAM_API_HOST_DEFAULT = 'https://api.steampowered.com';

// 返回一组备选 host（按顺序尝试，第一条失败时自动 fallback 到第二条）
function getSteamApiHosts() {
    const raw = (seal.ext.getStringConfig(ext, 'steam_api_host_override') || '').trim();
    if (!raw) return [STEAM_API_HOST_DEFAULT];
    const hosts = raw.split(',')
        .map(s => s.trim().replace(/\/+$/, ''))
        .filter(s => s.length > 0);
    return hosts.length > 0 ? hosts : [STEAM_API_HOST_DEFAULT];
}

// 保留旧函数便于回退：只返回首个 host
function getSteamApiHost() {
    return getSteamApiHosts()[0];
}

// 玩家在线状态映射
const PERSONA_STATE_MAP = {
    0: '离线',
    1: '在线',
    2: '忙碌',
    3: '离开',
    4: '打盹',
    5: '想交易',
    6: '想游戏'
};

// 存储键前缀
const KEY_USER_BIND = 'bind_';       // bind_{userId} -> steamId
const KEY_GROUP_CONF = 'group_';     // group_{groupId} -> {enabled:bool, members:[{userId, steamId}]}
const KEY_LAST_STATE = 'state_';     // state_{steamId} -> {gameName, gameStartTs, personaState, personaName}

// 群 -> 真实 ctx 缓存。用于绕过 createTempCtx（后者对 SenderBase 值类型反射不稳，会在 Go 侧 panic）
// 每次群里执行 .steam 相关指令时刷新，轮询发送时直接复用该 ctx
const ctxCache = {};  // groupId -> { ctx, msg, ts }

function log(...args) {
    console.log('[steam_status]', ...args);
}

function warn(...args) {
    console.warn('[steam_status]', ...args);
}

// SteamID64 判定（17位数字）
function isSteamId64(s) {
    return typeof s === 'string' && /^7656119\d{10}$/.test(s);
}

// 存储读写：对象 JSON 化
function storageGetJSON(key, defVal) {
    try {
        const raw = ext.storageGet(key);
        if (!raw) return defVal;
        return JSON.parse(raw);
    } catch (e) {
        warn('storageGetJSON 失败', key, e);
        return defVal;
    }
}

function storageSetJSON(key, obj) {
    try {
        ext.storageSet(key, JSON.stringify(obj));
    } catch (e) {
        warn('storageSetJSON 失败', key, e);
    }
}

// ============= 4. Steam API 封装 =============
// 给 fetch 套一层超时（goja 的 fetch 无 timeout 参数）
function fetchWithTimeout(url, options, timeoutMs) {
    return Promise.race([
        fetch(url, options || {}),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout ' + timeoutMs + 'ms')), timeoutMs || 10000))
    ]);
}

function getSteamApiTimeoutMs() {
    const sec = seal.ext.getIntConfig(ext, 'steam_api_timeout_seconds') || 30;
    return Math.max(5, sec) * 1000;
}

function getSteamApiRetry() {
    const r = seal.ext.getIntConfig(ext, 'steam_api_retry');
    return Math.max(0, Math.min(10, (typeof r === 'number' ? r : 3)));
}

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// 判断错误是否值得重试（网络层错误：DNS/TCP/超时/EOF/连接重置）
function isRetriableNetError(body, status) {
    if (status >= 500) return true;
    const s = String(body || '').toLowerCase();
    return s.includes('eof')
        || s.includes('timeout')
        || s.includes('dial tcp')
        || s.includes('connection reset')
        || s.includes('no such host')
        || s.includes('i/o timeout')
        || s.includes('connectex')
        || s.includes('read: connection');
}

async function steamFetchOnce(url) {
    try {
        const resp = await fetchWithTimeout(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        }, getSteamApiTimeoutMs());
        if (!resp.ok) {
            let body = '';
            try { body = await resp.text(); } catch (_) { }
            return { ok: false, status: resp.status, body: body };
        }
        const text = await resp.text();
        try {
            return { ok: true, data: JSON.parse(text) };
        } catch (e) {
            return { ok: false, status: 0, body: 'JSON parse error: ' + text.slice(0, 200) };
        }
    } catch (e) {
        return { ok: false, status: 0, body: String(e && e.message || e) };
    }
}

// 单个 host 上的重试（网络层错误才重试）
async function steamFetchHostAttempt(url) {
    const maxRetry = getSteamApiRetry();
    let lastStatus = 0, lastBody = '';
    for (let attempt = 0; attempt <= maxRetry; attempt++) {
        if (attempt > 0) {
            const wait = Math.min(5000, 600 * Math.pow(2, attempt - 1));
            log(`Steam API 第 ${attempt} 次重试（等待 ${wait}ms）url=${url}`);
            await sleep(wait);
        }
        const r = await steamFetchOnce(url);
        if (r.ok) return { ok: true, data: r.data };
        lastStatus = r.status;
        lastBody = r.body;
        if (!isRetriableNetError(r.body, r.status)) break;
    }
    return { ok: false, status: lastStatus, body: lastBody };
}

// path 需以 / 开头，例如 "/ISteamUser/GetPlayerSummaries/v0002/?key=xxx&..."
async function steamFetchPath(path) {
    const hosts = getSteamApiHosts();
    let lastStatus = 0, lastBody = '';
    for (let i = 0; i < hosts.length; i++) {
        const url = hosts[i] + path;
        if (hosts.length > 1) log(`Steam API 尝试第 ${i + 1}/${hosts.length} 个 host: ${hosts[i]}`);
        const r = await steamFetchHostAttempt(url);
        if (r.ok) return r.data;
        lastStatus = r.status;
        lastBody = r.body;
        // 非网络错误（业务错误如 401/403）无需切 host
        if (!isRetriableNetError(r.body, r.status)) break;
        if (i < hosts.length - 1) {
            log(`当前 host 失败（status=${r.status}），切换到下一个 host`);
        }
    }
    warn('Steam API 最终失败', 'status=', lastStatus, 'body=', (lastBody || '').slice(0, 500), 'path=', path);
    return null;
}

// 兼容旧调用：把完整 URL 拆成 path 后走新逻辑
async function steamFetch(url) {
    // 如果传入的是完整 URL，剥掉 host 部分
    const m = url.match(/^https?:\/\/[^/]+(\/.*)$/);
    const path = m ? m[1] : url;
    return await steamFetchPath(path);
}

// 通过 SteamID 拿玩家信息
async function getPlayerSummary(steamIds) {
    const key = seal.ext.getStringConfig(ext, 'steam_api_key');
    if (!key) return null;
    const ids = Array.isArray(steamIds) ? steamIds.join(',') : steamIds;
    const path = `/ISteamUser/GetPlayerSummaries/v0002/?key=${key}&steamids=${ids}`;
    const data = await steamFetchPath(path);
    if (!data || !data.response || !data.response.players) return null;
    return data.response.players;
}

// 自定义域名 -> SteamID64
async function resolveVanityUrl(vanityName) {
    const key = seal.ext.getStringConfig(ext, 'steam_api_key');
    if (!key) return null;
    const path = `/ISteamUser/ResolveVanityURL/v0001/?key=${key}&vanityurl=${encodeURIComponent(vanityName)}`;
    const data = await steamFetchPath(path);
    if (!data || !data.response) return null;
    if (data.response.success === 1) return data.response.steamid;
    return null;
}

// 最近两周游玩
async function getRecentlyPlayedGames(steamId) {
    const key = seal.ext.getStringConfig(ext, 'steam_api_key');
    if (!key) return null;
    const path = `/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${key}&steamid=${steamId}&count=5`;
    const data = await steamFetchPath(path);
    if (!data || !data.response) return null;
    return data.response.games || [];
}

// 将任意输入解析成 SteamID64（数字ID / vanity 都可）
async function resolveInputToSteamId(input) {
    if (!input) return null;
    input = String(input).trim();
    // 已是纯数字17位
    if (isSteamId64(input)) return input;
    // URL 形式：https://steamcommunity.com/id/xxx or /profiles/xxx
    const profilesMatch = input.match(/\/profiles\/(\d{17})/);
    if (profilesMatch) return profilesMatch[1];
    const idMatch = input.match(/\/id\/([^\/\?\s]+)/);
    if (idMatch) return await resolveVanityUrl(idMatch[1]);
    // 纯自定义域名
    return await resolveVanityUrl(input);
}

// 格式化玩家状态文本
function formatPlayerStatus(p) {
    if (!p) return '未查询到该玩家信息';
    const lines = [];
    lines.push(`玩家：${p.personaname}`);
    if (p.gameextrainfo) {
        lines.push(`状态：🎮 正在游戏`);
        lines.push(`游戏：${p.gameextrainfo}`);
        if (p.gameid) lines.push(`AppID：${p.gameid}`);
    } else {
        const state = PERSONA_STATE_MAP[p.personastate] || `未知(${p.personastate})`;
        lines.push(`状态：${state}`);
    }
    if (p.lastlogoff) {
        const dt = new Date(p.lastlogoff * 1000);
        lines.push(`最后在线：${dt.toLocaleString('zh-CN')}`);
    }
    if (p.profileurl) lines.push(`主页：${p.profileurl}`);
    return lines.join('\n');
}

function formatDurationMinutes(minutes) {
    if (minutes < 60) return `${minutes}分钟`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `${h}小时`;
    return `${h}小时${m}分钟`;
}

// ============= 4.5 渲染后端 =============
function getBackend() {
    const url = (seal.ext.getStringConfig(ext, 'render_backend') || '').trim();
    return url.replace(/\/+$/, ''); // 去掉尾部斜杠
}

function getOutputMode() {
    return seal.ext.getOptionConfig(ext, 'output_mode') || 'text';
}

// 构造 CQ 图片码
function buildImageMsg(url) {
    return `[CQ:image,file=${url},cache=0]`;
}

// 拼查询字符串
function buildQuery(params) {
    const parts = [];
    for (const k of Object.keys(params)) {
        const v = params[k];
        if (v === undefined || v === null || v === '') continue;
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.join('&');
}

// 请求后端，返回图片URL；失败返回null
async function requestRenderGet(path, params) {
    const backend = getBackend();
    if (!backend) return null;
    try {
        const url = `${backend}${path}?${buildQuery(params)}`;
        const resp = await fetchWithTimeout(url, { method: 'GET' }, 8000);
        if (!resp.ok) {
            warn('渲染后端HTTP错误', path, resp.status);
            return null;
        }
        const j = await resp.json();
        if (j.status !== 'ok') {
            warn('渲染后端返回错误', path, j.msg);
            return null;
        }
        return j.url || (backend + '/img/' + j.file);
    } catch (e) {
        warn('渲染后端请求失败', path, e);
        return null;
    }
}

async function requestRenderPost(path, body) {
    const backend = getBackend();
    if (!backend) return null;
    try {
        const resp = await fetchWithTimeout(`${backend}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, 8000);
        if (!resp.ok) {
            warn('渲染后端HTTP错误', path, resp.status);
            return null;
        }
        const j = await resp.json();
        if (j.status !== 'ok') return null;
        return j.url || (backend + '/img/' + j.file);
    } catch (e) {
        warn('渲染后端请求失败', path, e);
        return null;
    }
}

// 组合输出：根据配置发送 图 / 文 / 图文
function sendReply(ctx, msg, text, imgUrl) {
    const mode = getOutputMode();
    const pieces = [];
    if ((mode === 'image' || mode === 'both') && imgUrl) {
        pieces.push(buildImageMsg(imgUrl));
    }
    if ((mode === 'text' || mode === 'both') || !imgUrl) {
        // 若图片模式但拿不到图片，兜底走文本
        if (text) pieces.push(text);
    }
    const out = pieces.join('\n');
    if (out) seal.replyToSender(ctx, msg, out);
}

function sendGroupReply(groupId, epId, text, imgUrl) {
    const mode = getOutputMode();
    const pieces = [];
    if ((mode === 'image' || mode === 'both') && imgUrl) {
        pieces.push(buildImageMsg(imgUrl));
    }
    if ((mode === 'text' || mode === 'both') || !imgUrl) {
        if (text) pieces.push(text);
    }
    const out = pieces.join('\n');
    if (out) sendToGroup(groupId, epId, out);
}

// ============= 5. 指令：主指令 .steam =============
const cmdSteam = seal.ext.newCmdItemInfo();
cmdSteam.name = 'steam';
cmdSteam.help = `Steam状态查询插件
用法：
.steam bind <SteamID64/自定义URL>   绑定Steam账户到自己
.steam unbind                       解绑当前账户
.steam who                          查看自己绑定的Steam
.steam query [SteamID/自定义URL/@某人]  查询在线状态与正在游玩的游戏
.steam recent [SteamID/@某人]       查询最近游玩记录
.steam list                         查看本群已绑定的所有Steam
.steam broadcast on|off             开启/关闭本群状态变化播报
.steam poll                         立即手动触发一次状态轮询（测试播报用）
.steam ping                         检测图片渲染后端是否可用
.steam help                         查看帮助
备注：
1. 需在WebUI配置 Steam Web API Key
2. 图片输出需运行 steam_render.py 后端，并配置 render_backend 地址
3. output_mode 可选：image / text / both`;
cmdSteam.allowDelegate = true;

cmdSteam.solve = async (ctx, msg, cmdArgs) => {
    const sub = (cmdArgs.getArgN(1) || '').toLowerCase();

    // 缓存群内真实 ctx（含 msg），轮询发送时复用以绕过 createTempCtx 的 nil panic
    try {
        if (ctx && ctx.group && ctx.group.groupId && msg && msg.messageType === 'group') {
            ctxCache[ctx.group.groupId] = { ctx: ctx, msg: msg, ts: Date.now() };
            log(`已缓存群 ${ctx.group.groupId} 的 ctx（ep=${ctx.endPoint && ctx.endPoint.userId}）`);
        }
    } catch (ce) { warn('ctx 缓存失败', ce); }

    // 帮助（async solve 中 showHelp=true 不生效，改为手动发送）
    if (!sub || sub === 'help' || sub === '帮助') {
        seal.replyToSender(ctx, msg, cmdSteam.help);
        return seal.ext.newCmdExecuteResult(true);
    }

    // 检查 API Key
    const apiKey = seal.ext.getStringConfig(ext, 'steam_api_key');
    if (!apiKey) {
        seal.replyToSender(ctx, msg, '⚠️ Steam Web API Key 未配置，请先在 WebUI 该插件配置面板中填写。\n获取地址：https://steamcommunity.com/dev/apikey');
        return seal.ext.newCmdExecuteResult(true);
    }

    switch (sub) {
        case 'bind': return await handleBind(ctx, msg, cmdArgs);
        case 'unbind': return handleUnbind(ctx, msg);
        case 'who': return handleWho(ctx, msg);
        case 'query':
        case 'q':
        case '查询': return await handleQuery(ctx, msg, cmdArgs);
        case 'recent':
        case '最近': return await handleRecent(ctx, msg, cmdArgs);
        case 'list':
        case '列表': return handleList(ctx, msg);
        case 'broadcast':
        case '播报': return handleBroadcast(ctx, msg, cmdArgs);
        case 'poll':
        case '轮询': return await handlePoll(ctx, msg);
        case 'ping':
        case '测试': return await handlePing(ctx, msg);
        default: {
            seal.replyToSender(ctx, msg, `未知子指令：${sub}\n发送 .steam help 查看帮助`);
            return seal.ext.newCmdExecuteResult(true);
        }
    }
};

// —— 子指令实现 ——

async function handleBind(ctx, msg, cmdArgs) {
    const raw = cmdArgs.getArgN(2);
    if (!raw) {
        seal.replyToSender(ctx, msg, '用法：.steam bind <SteamID64/自定义域名/主页URL>\n示例：.steam bind 76561198000000000');
        return seal.ext.newCmdExecuteResult(true);
    }

    seal.replyToSender(ctx, msg, `🔎 正在解析 Steam 账户 [${raw}] ...`);

    const steamId = await resolveInputToSteamId(raw);
    if (!steamId) {
        seal.replyToSender(ctx, msg, `❌ 无法解析该输入，请确认 SteamID64（17位数字）或自定义URL是否正确。`);
        return seal.ext.newCmdExecuteResult(true);
    }

    const players = await getPlayerSummary(steamId);
    if (!players || players.length === 0) {
        seal.replyToSender(ctx, msg, `❌ 查无此人，请检查ID：${steamId}`);
        return seal.ext.newCmdExecuteResult(true);
    }

    const p = players[0];
    const userId = ctx.player.userId;
    storageSetJSON(KEY_USER_BIND + userId, {
        steamId: steamId,
        steamName: p.personaname,
        bindTs: Math.floor(Date.now() / 1000)
    });

    // 同时把用户加入群绑定表（若在群里）
    if (ctx.group && ctx.group.groupId) {
        addMemberToGroup(ctx.group.groupId, userId, steamId);
    }

    seal.replyToSender(ctx, msg,
        `✅ 绑定成功\nSteam名：${p.personaname}\nSteamID：${steamId}\n发送 .steam query 查询当前状态`);
    return seal.ext.newCmdExecuteResult(true);
}

function handleUnbind(ctx, msg) {
    const userId = ctx.player.userId;
    const bind = storageGetJSON(KEY_USER_BIND + userId, null);
    if (!bind) {
        seal.replyToSender(ctx, msg, '你还没有绑定 Steam 账户。');
        return seal.ext.newCmdExecuteResult(true);
    }
    ext.storageSet(KEY_USER_BIND + userId, '');
    // 从当前群的成员表中移除
    if (ctx.group && ctx.group.groupId) {
        removeMemberFromGroup(ctx.group.groupId, userId);
    }
    seal.replyToSender(ctx, msg, `✅ 已解绑 Steam：${bind.steamName || bind.steamId}`);
    return seal.ext.newCmdExecuteResult(true);
}

function handleWho(ctx, msg) {
    const userId = ctx.player.userId;
    const bind = storageGetJSON(KEY_USER_BIND + userId, null);
    if (!bind) {
        seal.replyToSender(ctx, msg, '你还没有绑定 Steam 账户，使用 .steam bind <SteamID> 绑定');
        return seal.ext.newCmdExecuteResult(true);
    }
    seal.replyToSender(ctx, msg,
        `你的Steam绑定：\nSteam名：${bind.steamName}\nSteamID：${bind.steamId}`);
    return seal.ext.newCmdExecuteResult(true);
}

// 统一解析目标 SteamID
// 返回 { steamId, displayName, errorMsg } —— 有 errorMsg 时表示失败已需回复
async function resolveTargetSteamId(ctx, cmdArgs) {
    // 1. @ 某人：走代骰上下文
    if (cmdArgs.at && cmdArgs.at.length > 0) {
        const targetCtx = seal.getCtxProxyFirst(ctx, cmdArgs);
        const bind = storageGetJSON(KEY_USER_BIND + targetCtx.player.userId, null);
        if (!bind) return { errorMsg: `❌ ${targetCtx.player.name} 还未绑定 Steam 账户` };
        return { steamId: bind.steamId, displayName: targetCtx.player.name };
    }

    // 2. 参数指定
    const raw = cmdArgs.getArgN(2);
    if (raw) {
        const steamId = await resolveInputToSteamId(raw);
        if (!steamId) return { errorMsg: `❌ 无法解析：${raw}` };
        return { steamId };
    }

    // 3. 自己
    const bind = storageGetJSON(KEY_USER_BIND + ctx.player.userId, null);
    if (!bind) return { errorMsg: '你还没有绑定 Steam 账户\n用法：.steam bind <SteamID>' };
    return { steamId: bind.steamId };
}

async function handleQuery(ctx, msg, cmdArgs) {
    const target = await resolveTargetSteamId(ctx, cmdArgs);
    if (target.errorMsg) {
        seal.replyToSender(ctx, msg, target.errorMsg);
        return seal.ext.newCmdExecuteResult(true);
    }

    const players = await getPlayerSummary(target.steamId);
    if (!players || players.length === 0) {
        seal.replyToSender(ctx, msg, `❌ 查询失败，未获取到玩家信息`);
        return seal.ext.newCmdExecuteResult(true);
    }
    const p = players[0];
    let text = formatPlayerStatus(p);
    if (target.displayName) text = `[${target.displayName}]\n` + text;

    // 请求后端渲染图片
    let imgUrl = null;
    if (getOutputMode() !== 'text' && getBackend()) {
        imgUrl = await requestRenderGet('/status', {
            steamid: p.steamid,
            name: p.personaname,
            avatar: p.avatarfull || p.avatarmedium || p.avatar || '',
            persona_state: p.personastate || 0,
            game: p.gameextrainfo || '',
            gameid: p.gameid || '',
            last_logoff: p.lastlogoff || '',
            profile: p.profileurl || '',
            display_name: target.displayName || ''
        });
    }

    sendReply(ctx, msg, text, imgUrl);
    return seal.ext.newCmdExecuteResult(true);
}

async function handleRecent(ctx, msg, cmdArgs) {
    const target = await resolveTargetSteamId(ctx, cmdArgs);
    if (target.errorMsg) {
        seal.replyToSender(ctx, msg, target.errorMsg);
        return seal.ext.newCmdExecuteResult(true);
    }

    const games = await getRecentlyPlayedGames(target.steamId);
    if (games === null) {
        seal.replyToSender(ctx, msg, '❌ 查询失败（该玩家可能设置了资料隐私）');
        return seal.ext.newCmdExecuteResult(true);
    }
    if (games.length === 0) {
        seal.replyToSender(ctx, msg, '近两周内没有游玩记录');
        return seal.ext.newCmdExecuteResult(true);
    }

    const lines = ['📅 近两周游玩：'];
    games.forEach((g, i) => {
        const recent = formatDurationMinutes(g.playtime_2weeks || 0);
        const total = formatDurationMinutes(g.playtime_forever || 0);
        lines.push(`${i + 1}. ${g.name}\n   近两周 ${recent} / 总计 ${total}`);
    });
    const text = lines.join('\n');

    // 图片渲染
    let imgUrl = null;
    if (getOutputMode() !== 'text' && getBackend()) {
        // 需要头像等信息，额外拉一次玩家资料
        const players = await getPlayerSummary(target.steamId);
        const p = players && players[0] ? players[0] : {};
        imgUrl = await requestRenderPost('/recent', {
            steamid: target.steamId,
            name: p.personaname || 'Unknown',
            avatar: p.avatarfull || p.avatarmedium || p.avatar || '',
            games: games
        });
    }

    sendReply(ctx, msg, text, imgUrl);
    return seal.ext.newCmdExecuteResult(true);
}

function handleList(ctx, msg) {
    if (!ctx.group || !ctx.group.groupId) {
        seal.replyToSender(ctx, msg, '该指令只能在群内使用');
        return seal.ext.newCmdExecuteResult(true);
    }
    const gid = ctx.group.groupId;
    const conf = storageGetJSON(KEY_GROUP_CONF + gid, { enabled: false, members: [] });
    if (!conf.members || conf.members.length === 0) {
        seal.replyToSender(ctx, msg, '本群暂无成员绑定 Steam');
        return seal.ext.newCmdExecuteResult(true);
    }
    const lines = [`📋 本群 Steam 绑定列表（${conf.members.length} 人）`,
        `播报状态：${conf.enabled ? '✅ 开启' : '⛔ 关闭'}`, ''];
    conf.members.forEach((m, i) => {
        const bind = storageGetJSON(KEY_USER_BIND + m.userId, null);
        const name = bind ? bind.steamName : '(未知)';
        lines.push(`${i + 1}. ${name} — ${m.steamId}`);
    });
    seal.replyToSender(ctx, msg, lines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
}

function handleBroadcast(ctx, msg, cmdArgs) {
    if (!ctx.group || !ctx.group.groupId) {
        seal.replyToSender(ctx, msg, '该指令只能在群内使用');
        return seal.ext.newCmdExecuteResult(true);
    }
    // 权限
    const permLevel = seal.ext.getOptionConfig(ext, 'permission_level');
    if (permLevel === 'admin' && ctx.privilegeLevel < 50) {
        seal.replyToSender(ctx, msg, '⚠️ 该操作需要管理员权限');
        return seal.ext.newCmdExecuteResult(true);
    }

    const opt = (cmdArgs.getArgN(2) || '').toLowerCase();
    if (opt !== 'on' && opt !== 'off' && opt !== '开' && opt !== '关') {
        seal.replyToSender(ctx, msg, '用法：.steam broadcast on|off');
        return seal.ext.newCmdExecuteResult(true);
    }

    const gid = ctx.group.groupId;
    const conf = storageGetJSON(KEY_GROUP_CONF + gid, { enabled: false, members: [] });
    conf.enabled = (opt === 'on' || opt === '开');
    // 记录端点，便于定时任务时能主动发消息
    conf.epId = ctx.endPoint ? ctx.endPoint.userId : '';

    // 开启时如果操作者本人已绑定但不在成员表里，自动纳入
    if (conf.enabled && ctx.player && ctx.player.userId) {
        const myBind = storageGetJSON(KEY_USER_BIND + ctx.player.userId, null);
        if (myBind && myBind.steamId) {
            if (!conf.members.find(m => m.userId === ctx.player.userId)) {
                conf.members.push({ userId: ctx.player.userId, steamId: myBind.steamId });
            }
        }
    }

    storageSetJSON(KEY_GROUP_CONF + gid, conf);
    addGroupToIndex(gid);

    if (!conf.enabled) {
        seal.replyToSender(ctx, msg, '📻 本群 Steam 播报已关闭');
        return seal.ext.newCmdExecuteResult(true);
    }

    const memCount = (conf.members || []).length;
    const interval = Math.max(1, seal.ext.getIntConfig(ext, 'poll_interval_minutes') || 3);
    let reply = `📻 本群 Steam 播报已开启\n当前跟踪：${memCount} 人\n轮询间隔：${interval} 分钟`;
    if (memCount === 0) {
        reply += '\n⚠️ 尚无成员被跟踪，请群成员在本群内发送 .steam bind <SteamID> 加入跟踪';
    } else {
        reply += '\n提示：首次开启只登记基线状态，需等下一轮询才会推送变化；可用 .steam poll 立即触发一次';
    }
    seal.replyToSender(ctx, msg, reply);
    return seal.ext.newCmdExecuteResult(true);
}

async function handlePoll(ctx, msg) {
    // 权限：与 broadcast 一致
    const permLevel = seal.ext.getOptionConfig(ext, 'permission_level');
    if (permLevel === 'admin' && ctx.privilegeLevel < 50) {
        seal.replyToSender(ctx, msg, '⚠️ 该操作需要管理员权限');
        return seal.ext.newCmdExecuteResult(true);
    }
    seal.replyToSender(ctx, msg, '⏳ 已手动触发一次 Steam 状态轮询，请留意后续播报');
    pollGroupStatuses().catch(e => warn('手动轮询异常', e));
    return seal.ext.newCmdExecuteResult(true);
}

async function handlePing(ctx, msg) {
    const backend = getBackend();
    if (!backend) {
        seal.replyToSender(ctx, msg, '⚠️ 图片渲染后端地址未配置');
        return seal.ext.newCmdExecuteResult(true);
    }
    try {
        const resp = await fetch(`${backend}/health`, { method: 'GET' });
        if (resp.ok) {
            const j = await resp.json();
            seal.replyToSender(ctx, msg, `✅ 后端在线：${backend}\n服务器时间：${j.time}`);
        } else {
            seal.replyToSender(ctx, msg, `❌ 后端返回状态码：${resp.status}`);
        }
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 无法连接后端 ${backend}\n错误：${e}`);
    }
    return seal.ext.newCmdExecuteResult(true);
}

// ============= 6. 群成员绑定表维护 =============
function addMemberToGroup(groupId, userId, steamId) {
    const conf = storageGetJSON(KEY_GROUP_CONF + groupId, { enabled: false, members: [] });
    const idx = conf.members.findIndex(m => m.userId === userId);
    if (idx >= 0) {
        conf.members[idx].steamId = steamId;
    } else {
        conf.members.push({ userId, steamId });
    }
    storageSetJSON(KEY_GROUP_CONF + groupId, conf);
}

function removeMemberFromGroup(groupId, userId) {
    const conf = storageGetJSON(KEY_GROUP_CONF + groupId, { enabled: false, members: [] });
    conf.members = conf.members.filter(m => m.userId !== userId);
    storageSetJSON(KEY_GROUP_CONF + groupId, conf);
}

// ============= 7. 群列表索引（供定时任务遍历） =============
const KEY_GROUP_INDEX = '_group_index';

function addGroupToIndex(groupId) {
    const list = storageGetJSON(KEY_GROUP_INDEX, []);
    if (!list.includes(groupId)) {
        list.push(groupId);
        storageSetJSON(KEY_GROUP_INDEX, list);
    }
}

function getAllGroups() {
    return storageGetJSON(KEY_GROUP_INDEX, []);
}

// ============= 8. 主动向群发消息 =============
// 判断端点是否可用；仅排除明确断开/失败/关闭的
function isEndpointUsable(e) {
    if (!e || !e.userId) return false;
    if (e.enable === false) return false;
    // state: 0 断开 1 已连接 2 连接中 3 连接失败；缺省时按可用处理
    if (e.state === 0 || e.state === 3) return false;
    return true;
}

// 从 groupId (如 "QQ-Group:1049196341") 提取平台标识 "QQ"
function extractPlatformFromGroupId(groupId) {
    if (!groupId || typeof groupId !== 'string') return '';
    const m = groupId.match(/^([A-Za-z]+)/);
    return m ? m[1] : '';
}

// 从端点取平台（优先 platform 字段，否则从 userId 前缀提取）
function endpointPlatform(e) {
    if (e && e.platform) return e.platform;
    if (e && e.userId) {
        const m = String(e.userId).match(/^([A-Za-z]+)/);
        return m ? m[1] : '';
    }
    return '';
}

function describeEp(e) {
    if (!e) return 'null';
    return `${e.platform || '?'}:${e.userId}(state=${e.state},enable=${e.enable})`;
}

function sendToGroup(groupId, epUserId, text) {
    // 首选路径：复用群内最近一次真实 ctx。
    // createTempCtx 内部对 SenderBase 值类型的反射处理会在 Go 侧触发 nil panic，
    // 而 JS 的 try/catch 抓不到 Go runtime panic，只能整体规避。
    const cached = ctxCache[groupId];
    if (cached && cached.ctx && cached.msg) {
        const ageMin = (Date.now() - cached.ts) / 60000;
        log(`使用缓存 ctx 发送 group=${groupId} 缓存时长=${ageMin.toFixed(1)}分钟`);
        try {
            seal.replyGroup(cached.ctx, cached.msg, text);
            log(`发送完成（缓存 ctx）group=${groupId}`);
            return;
        } catch (re) {
            warn('缓存 ctx 发送失败，回退到 createTempCtx 路径', groupId, re);
            // 清掉可能已失效的缓存
            delete ctxCache[groupId];
        }
    } else {
        log(`群 ${groupId} 无缓存 ctx，回退到 createTempCtx 路径。建议群内执行任一 .steam 命令以填充缓存`);
    }

    // 兜底路径：createTempCtx（不稳定，仅在没有缓存 ctx 时尝试）
    let ep = null;
    try {
        const eps = seal.getEndPoints() || [];
        if (eps.length === 0) {
            warn('sendToGroup: seal.getEndPoints() 返回空');
            return;
        }
        const usable = eps.filter(isEndpointUsable);
        const groupPlatform = extractPlatformFromGroupId(groupId);
        log(`sendToGroup(fallback) group=${groupId} 平台=${groupPlatform} 可用端点=${usable.length}`);
        if (usable.length === 0) {
            warn(`无可用端点（共 ${eps.length} 个）`);
            return;
        }
        const samePlatform = usable.filter(e => endpointPlatform(e) === groupPlatform);
        if (samePlatform.length === 0) {
            warn(`没有与群 ${groupId}（平台=${groupPlatform}）匹配的可用端点`);
            return;
        }
        if (epUserId) {
            const found = samePlatform.find(e => e.userId === epUserId);
            if (found) ep = found;
        }
        if (!ep) ep = samePlatform[0];
        log(`fallback 选定端点：${describeEp(ep)}`);

        const m = seal.newMessage();
        m.messageType = 'group';
        m.groupId = groupId;
        m.platform = endpointPlatform(ep) || groupPlatform || '';
        m.time = Math.floor(Date.now() / 1000);
        m.message = '';
        m.rawId = '';
        try {
            m.sender = { nickname: 'steam_status', userId: ep.userId };
        } catch (se) {
            if (m.sender) { m.sender.userId = ep.userId; m.sender.nickname = 'steam_status'; }
        }

        const tempCtx = seal.createTempCtx(ep, m);
        if (!tempCtx) {
            warn('createTempCtx 返回空', groupId, ep.userId);
            return;
        }
        seal.replyGroup(tempCtx, m, text);
        log(`fallback 发送完成 group=${groupId}`);
    } catch (e) {
        warn('sendToGroup fallback 失败', groupId, 'ep=', ep && ep.userId, 'err=', e);
    }
}

// ============= 9. 定时轮询 =============
async function pollGroupStatuses() {
    if (!seal.ext.getBoolConfig(ext, 'enable_broadcast')) {
        log('轮询跳过：enable_broadcast=false');
        return;
    }
    if (!seal.ext.getStringConfig(ext, 'steam_api_key')) {
        warn('轮询跳过：steam_api_key 未配置');
        return;
    }

    const notifyEnd = seal.ext.getBoolConfig(ext, 'notify_game_end');
    const notifyOnline = seal.ext.getBoolConfig(ext, 'notify_online_offline');
    const groups = getAllGroups();
    if (groups.length === 0) {
        log('轮询跳过：无已启用播报的群');
        return;
    }
    log(`轮询开始，涉及群数=${groups.length}`);

    // 汇总所有需要查询的 steamId 并按群关联
    const steamIdToGroups = {};  // steamId -> [{groupId, userId, epId}]
    for (const gid of groups) {
        const conf = storageGetJSON(KEY_GROUP_CONF + gid, null);
        if (!conf || !conf.enabled || !conf.members || conf.members.length === 0) continue;
        for (const m of conf.members) {
            if (!steamIdToGroups[m.steamId]) steamIdToGroups[m.steamId] = [];
            steamIdToGroups[m.steamId].push({ groupId: gid, userId: m.userId, epId: conf.epId || '' });
        }
    }

    const allIds = Object.keys(steamIdToGroups);
    if (allIds.length === 0) {
        log('轮询跳过：所有播报群成员表均为空');
        return;
    }
    log(`本次轮询 SteamID 数=${allIds.length}`);

    // Steam API 单次上限 100 个 ID
    const CHUNK = 100;
    for (let i = 0; i < allIds.length; i += CHUNK) {
        const chunk = allIds.slice(i, i + CHUNK);
        log(`Steam API 查询 ${chunk.length} 个 SteamID：${chunk.join(',')}`);
        const t0 = Date.now();
        const players = await getPlayerSummary(chunk);
        log(`Steam API 返回耗时 ${Date.now() - t0}ms，players=${players === null ? 'null(请求失败)' : players.length + ' 个'}`);
        if (!players) {
            warn('本 chunk 拿不到数据，跳过');
            continue;
        }
        if (players.length === 0) {
            warn('Steam API 返回空 players 数组（SteamID 可能无效或资料非公开）');
            continue;
        }

        for (const p of players) {
            const prev = storageGetJSON(KEY_LAST_STATE + p.steamid, null);
            const nowGame = p.gameextrainfo || '';
            const nowOnline = p.personastate !== 0;
            const nowTs = Math.floor(Date.now() / 1000);

            // 先记录新状态（无论是否触发通知）
            const newState = {
                gameName: nowGame,
                gameStartTs: prev && prev.gameName === nowGame && nowGame ? prev.gameStartTs : (nowGame ? nowTs : 0),
                personaState: p.personastate,
                personaName: p.personaname
            };
            storageSetJSON(KEY_LAST_STATE + p.steamid, newState);

            if (!prev) {
                log(`${p.personaname}(${p.steamid}) 首次采样，基线=${nowGame || '未在游戏中'}`);
                continue;
            }
            log(`${p.personaname}(${p.steamid}) 上一轮=${prev.gameName || '空'} 当前=${nowGame || '空'}`);

            const targets = steamIdToGroups[p.steamid] || [];

            // 状态变化判断
            const avatar = p.avatarfull || p.avatarmedium || p.avatar || '';
            log(`目标群数=${targets.length} 头像=${(avatar || '').slice(0, 60)}`);
            if (nowGame && prev.gameName !== nowGame) {
                // 开始新游戏
                log(`触发[开始/换玩]分支：${prev.gameName || '空'} -> ${nowGame}`);
                const verb = prev.gameName ? '换玩' : '开始游玩';
                const line = `🎮 ${p.personaname} ${verb} ${nowGame}`;
                const imgUrl = await requestRenderGet('/notice', {
                    kind: 'start', steamid: p.steamid, name: p.personaname,
                    avatar: avatar, game: nowGame
                });
                targets.forEach(t => {
                    try { sendGroupReply(t.groupId, t.epId, line, imgUrl); }
                    catch (e) { warn('播报开始异常', t.groupId, e); }
                });
            } else if (!nowGame && prev.gameName) {
                // 结束游戏
                log(`触发[结束]分支：${prev.gameName} -> 空 notifyEnd=${notifyEnd}`);
                if (notifyEnd) {
                    const duration = prev.gameStartTs ? Math.floor((nowTs - prev.gameStartTs) / 60) : 0;
                    const durText = duration > 0 ? `，本次游玩 ${formatDurationMinutes(duration)}` : '';
                    const line = `🛑 ${p.personaname} 结束了 ${prev.gameName}${durText}`;
                    const imgUrl = await requestRenderGet('/notice', {
                        kind: 'end', steamid: p.steamid, name: p.personaname,
                        avatar: avatar, game: prev.gameName, duration: duration
                    });
                    targets.forEach(t => {
                        try { sendGroupReply(t.groupId, t.epId, line, imgUrl); }
                        catch (e) { warn('播报结束异常', t.groupId, e); }
                    });
                }
            } else if (notifyOnline && !nowGame && !prev.gameName) {
                // 纯上下线切换
                log(`触发[上下线]分支：prevState=${prev.personaState} nowState=${p.personastate}`);
                const prevOnline = prev.personaState !== 0;
                if (prevOnline !== nowOnline) {
                    const line = nowOnline
                        ? `🟢 ${p.personaname} 上线了`
                        : `⚪ ${p.personaname} 下线了`;
                    const imgUrl = await requestRenderGet('/notice', {
                        kind: nowOnline ? 'on' : 'off', steamid: p.steamid,
                        name: p.personaname, avatar: avatar
                    });
                    targets.forEach(t => {
                        try { sendGroupReply(t.groupId, t.epId, line, imgUrl); }
                        catch (e) { warn('播报上下线异常', t.groupId, e); }
                    });
                } else {
                    log(`上下线无变化，跳过`);
                }
            } else {
                log(`无状态变化，跳过（nowGame=${nowGame || '空'} prev=${prev.gameName || '空'} notifyEnd=${notifyEnd} notifyOnline=${notifyOnline}）`);
            }
        }
    }
}

// ============= 10. 事件钩子 =============
ext.onLoad = () => {
    log(`加载完成 v${ext.version}`);
    const interval = Math.max(1, seal.ext.getIntConfig(ext, 'poll_interval_minutes') || 3);
    log(`轮询间隔：${interval} 分钟（如需修改请改配置项 poll_interval_minutes 后重启海豹）`);
};

// 被动 ctx 缓存：只要群里有任何消息经过，就刷新缓存。
// 这样即使用户没主动执行 .steam 命令，轮询也能拿到可用 ctx。
ext.onNotCommandReceived = (ctx, msg) => {
    try {
        if (ctx && ctx.group && ctx.group.groupId && msg && msg.messageType === 'group') {
            const gid = ctx.group.groupId;
            const prev = ctxCache[gid];
            // 每 5 分钟刷一次即可，避免过高频率
            if (!prev || Date.now() - prev.ts > 5 * 60 * 1000) {
                ctxCache[gid] = { ctx: ctx, msg: msg, ts: Date.now() };
            }
        }
    } catch (_) { /* 静默 */ }
};

// ============= 11. 定时任务（放在顶层，onLoad 里注册在部分海豹版本不生效）=============
// 注意：cron 表达式在插件加载时确定，之后再改配置 poll_interval_minutes 需重启海豹才生效
try {
    const _intervalInit = Math.max(1, seal.ext.getIntConfig(ext, 'poll_interval_minutes') || 3);
    seal.ext.registerTask(ext, 'cron', `*/${_intervalInit} * * * *`, (taskCtx) => {
        log(`[cron] 触发轮询 now=${taskCtx && taskCtx.now}`);
        pollGroupStatuses().catch(e => warn('轮询异常', e));
    }, 'steam_poll', 'Steam状态轮询');
    log(`定时任务注册完成，cron=*/${_intervalInit} * * * *`);
} catch (e) {
    warn('定时任务注册失败', e);
}

// ============= 12. 注册指令 =============
ext.cmdMap['steam'] = cmdSteam;
ext.cmdMap['Steam'] = cmdSteam;
ext.cmdMap['蒸汽'] = cmdSteam;
