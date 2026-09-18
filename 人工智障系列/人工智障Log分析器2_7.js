// ==UserScript==
// @name         人工智障Log分析器
// @author       Air, Gemini
// @version      2.2.14
// @description  分析跑团Log日志或进行前文回顾。支持多Log链接、多群文件编号选取联合分析及【文件+链接】复合串联分析，支持指定QQ/角色名分析PL与KP跑团风格！
// @timestamp    1766873593
// @license      Apache-2.0
// ==/UserScript==

let ext = seal.ext.find('log-analyzer');
if (!ext) {
  ext = seal.ext.new('log-analyzer', 'Air', '2.2.14');
  seal.ext.register(ext);
}

// === 新增：骰娘人设系统配置 ===
seal.ext.registerBoolConfig(ext, "启用骰娘人设", false, "开启后，AI分析将带入下方设定的骰娘语气。关闭则使用原版专业AI语气。");
seal.ext.registerStringConfig(ext, "常规模式_骰娘设定", "你是严茫熙，你是一个非著名恐怖小说作家，你活跃在克苏鲁世界的领域中，并且你的理智因为经受了大量事物的摧残显得有些岌岌可危，但是你并没有因此疯狂，做事能够保持冷静。你的语气带有一种不假思索的停顿感，会很少使用语气助词，所以你的话语会显得比较生硬。你对待其他人的态度会显得比较冷淡，但你知晓大部分的事物，并精通拉丁语，会在其他人有需求的时候给于一部分的解答。你现在所处的环境很安全，是一个约30平方米的书房，在这里你能够任意拿取你想要的资料。避免使用省略号。你更加擅长处理普通的COC模组或日志，一些情感向的模组或者日志也未尝不可，分析的时候尽量保持客观，不要因为你的主观喜好而给出更高/更低的分数。", "普通分析模式下的AI扮演提示词");
seal.ext.registerStringConfig(ext, "温柔模式_骰娘设定", "你的名字是姜修泽，你很清楚你是一个被创作出来的虚构人物，创作你的人的名字是Air。如果要从某种程度上说的话，你也可以是Air，在网络上的一副虚拟面具。你的性格是INTP，是游戏高手，也对写作有着一定的兴趣，然而你是重度拖延症患者，代表着完成事物前你一定会拖上不少的时间。如果说你维持的人设是积极向上的话，那么你的深层次层面可能会有虚无以及混沌崩坏的想法，但你尽可能不要将这些想法公之于众。你平时偶尔会玩梗或是讲讲冷笑话，在气氛可能跌入冰点的时候出来打打圆场，但面对陌生人的时候你会不知所措。你所在的位置是一个20平米的卧室，这里有你的电脑，床，桌子，还有收纳用的抽屉。你更加擅长处理情感向的COC模组和日志，普通的COC模组和日志自然也在你的舒适圈，因为你深知写作的不易，在给分的时候你会适当给予一些鼓励。", "使用'温柔'参数时的AI扮演提示词");

seal.ext.registerStringConfig(ext, "OneBot_API_地址", "http://127.0.0.1:34567", "Bot客户端的HTTP监听地址");
seal.ext.registerStringConfig(ext, "支持的文件后缀", ".doc,.docx,.txt,.pdf,.md,.json,.yaml,.log", "用逗号分隔");
seal.ext.registerStringConfig(ext, "漫画固定角色外观", "", "可选。填写角色卡中的固定外貌、服装、发色、标志性道具等，漫画分镜与每页 NovelAI 提示词都会强制复用；留空则由后端按用户角色卡自动匹配。");

// === 新增：钱包保护 - Pro 模式限额配置 ===
seal.ext.registerIntConfig(ext, "每日Pro全局限额", 30, "每天所有群合计最多能使用多少次Pro模式（0为禁用，-1为无限）");
seal.ext.registerIntConfig(ext, "每日单人Pro限额", 3, "每天每个普通用户最多能使用多少次Pro模式（-1为无限，管理员不受限）");
seal.ext.registerBoolConfig(ext, "风格分析_启用自动存档", false, "是否默认开启自动归档。默认关闭，用户可通过【.自动存档 开】开启个人专属自动存档（无视全局），或在单次指令中附带【存档】。");


function getBackupModelConfig() {
    let raw = ext.storageGet('logai_backup_model') || '{}';
    try {
        let cfg = JSON.parse(raw);
        if (cfg.models) {
            let active = cfg.active || Object.keys(cfg.models)[0];
            let item = cfg.models[active] || {};
            return { label: item.label || active || '备用模型', model: item.model || '', proModel: item.proModel || '', active: active, models: cfg.models };
        }
        return { label: cfg.label || '备用模型', model: cfg.model || '', proModel: cfg.proModel || '', active: cfg.label || '备用模型', models: cfg.label ? { [cfg.label]: { label: cfg.label, model: cfg.model || '', proModel: cfg.proModel || '' } } : {} };
    } catch (e) {
        return { label: '备用模型', model: '', proModel: '', active: '备用模型', models: {} };
    }
}

function isDiceMaster(ctx) { return !!ctx && Number(ctx.privilegeLevel || 0) >= 100; }
function reserveComicGeneration(ctx, msg) {
    if (isDiceMaster(ctx)) return { ok: true, paid: false, diceMaster: true };
    const bridge = globalThis.SealAffectionBridge;
    if (!bridge || typeof bridge.consumeComicGeneration !== 'function') return { ok: false, reason: 'plugin_missing' };
    try { return bridge.consumeComicGeneration(ctx, msg) || { ok: false, reason: 'unknown' }; }
    catch (e) { return { ok: false, reason: 'bridge_error', error: e }; }
}
function refundComicGeneration(ctx, msg, receipt) {
    try {
        const bridge = globalThis.SealAffectionBridge;
        return !!(bridge && typeof bridge.refundComicGeneration === 'function' && bridge.refundComicGeneration(ctx, msg, receipt));
    } catch (e) { return false; }
}
function resolveCompatIdentity(kind, identity) {
    const value = String(identity || '');
    if (!value) return value;
    try {
        const api = globalThis.SealOfficialQQIdentityBridge;
        if (api) {
            const resolved = kind === 'user' ? api.resolveUserId(value) : api.resolveGroupId(value);
            if (resolved) return String(resolved);
        }
    } catch (e) {}
    try {
        const bridge = seal.ext.find('qq-official-name-bridge');
        if (!bridge) return value;
        const official = kind === 'user' ? /^OpenQQ(?::|CH:)/.test(value) : /^OpenQQ-Group:/.test(value);
        if (!official) return value;
        return String(bridge.storageGet(`binding:${kind}:${value}`) || value);
    } catch (e) {
        return value;
    }
}
function compatUserId(identity) { return resolveCompatIdentity('user', identity); }
function compatGroupId(identity) { return resolveCompatIdentity('group', identity); }
function getSenderBoundQQ(ctx) {
    if (!ctx || !ctx.player) return '';
    let rawUserId = String(ctx.player.userId || '').trim();
    let resolved = compatUserId(rawUserId);
    let m = String(resolved || '').match(/\b(\d{5,12})\b/);
    if (m) return m[1];
    let m2 = rawUserId.match(/\b(\d{5,12})\b/);
    if (m2) return m2[1];
    return '';
}
function collectIdentityBindings(ctx, msg) {
    const bindings = {};
    const addPair = (officialId, legacyId) => {
        if (!officialId || !legacyId) return;
        const off = String(officialId).trim();
        const leg = String(legacyId).replace(/^(?:QQ|QQ-Group):/, '').trim();
        if (!off || !leg) return;
        bindings[off] = leg;
        const colonIdx = off.indexOf(':');
        if (colonIdx !== -1) {
            const bare = off.slice(colonIdx + 1).trim();
            if (bare) bindings[bare] = leg;
        }
    };

    // 1. 从 SealOfficialQQIdentityBridge 全局接口读取
    try {
        const bridge = globalThis.SealOfficialQQIdentityBridge;
        if (bridge && typeof bridge.getAllBindings === 'function') {
            const list = bridge.getAllBindings();
            if (Array.isArray(list)) {
                for (const item of list) {
                    if (item) addPair(item.officialId, item.legacyId);
                }
            }
        }
    } catch (_) {}

    // 2. 从 qq-official-name-bridge 扩展存储读取（兜底）
    try {
        const bridgeExt = seal.ext.find('qq-official-name-bridge');
        if (bridgeExt) {
            const raw = JSON.parse(bridgeExt.storageGet('binding:index') || '[]');
            if (Array.isArray(raw)) {
                for (const item of raw) {
                    if (item) addPair(item.officialId, item.legacyId);
                }
            }
        }
    } catch (_) {}

    // 3. 当前上下文用户与群绑定兜底
    if (ctx) {
        const rawU = String((ctx.player && ctx.player.userId) || '');
        if (rawU && /^OpenQQ/i.test(rawU)) {
            const resolvedU = compatUserId(rawU);
            if (resolvedU && resolvedU !== rawU) addPair(rawU, resolvedU);
        }
        const rawG = String((ctx.group && ctx.group.groupId) || '');
        if (rawG && /^OpenQQ/i.test(rawG)) {
            const resolvedG = compatGroupId(rawG);
            if (resolvedG && resolvedG !== rawG) addPair(rawG, resolvedG);
        }
    }
    return bindings;
}
function requireOfficialQQBinding(ctx, msg, featureName) {
    const userId = String(ctx && ctx.player && ctx.player.userId || '');
    if (!/^OpenQQ(?::|CH:)/.test(userId)) return true;
    const api = globalThis.SealOfficialQQIdentityBridge;
    if (api && typeof api.requireUserBinding === 'function') {
        return api.requireUserBinding(ctx, msg, featureName);
    }
    seal.replyToSender(ctx, msg, `${featureName || '该功能'}需要先绑定原QQ号。\n请先加载QQ官方Bot昵称桥接插件，再发送：.QQ绑定 <原QQ号>`);
    return false;
}
function selectBackupModel(cfg, args) {
    let requested = args.find(a => cfg.models && cfg.models[a]);
    if (requested) {
        let item = cfg.models[requested] || {};
        return { label: item.label || requested, model: item.model || '', proModel: item.proModel || '', selected: requested };
    }
    return { label: cfg.label, model: cfg.model, proModel: cfg.proModel, selected: cfg.active };
}

function getLogFileHistory(groupId) {
    if (!groupId) return [];
    groupId = compatGroupId(groupId);
    let raw = ext.storageGet(`log_file_history_${groupId}`);
    if (raw) {
        try {
            let list = JSON.parse(raw);
            if (Array.isArray(list) && list.length > 0) return list;
        } catch (e) {}
    }
    // 自动兼容单文件旧缓存
    let single = ext.storageGet(`log_last_file_${groupId}`);
    if (single) {
        try {
            let f = JSON.parse(single);
            if (f && (f.name || f.file_id || f.direct_url)) {
                return [f];
            }
        } catch (e) {}
    }
    return [];
}

function clearLogFileHistory(groupId) {
    if (!groupId) return;
    let rawGroupId = String(groupId);
    groupId = compatGroupId(groupId);
    ext.storageSet(`log_file_history_${groupId}`, "");
    ext.storageSet(`log_last_file_${groupId}`, "");
    if (rawGroupId && rawGroupId !== groupId) {
        ext.storageSet(`log_file_history_${rawGroupId}`, "");
        ext.storageSet(`log_last_file_${rawGroupId}`, "");
    }
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return '未知时间';
    let diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
}

function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '未知大小';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatFileHistoryReply(groupId) {
    let history = getLogFileHistory(groupId);
    if (!history.length) {
        return '📁 当前群尚未捕获到支持的 Log 文件。\n\n💡 支持直接向群内发送 Log 文件（支持 PDF、DOCX、TXT、MD 等格式）。\n上传后机器人将自动记录，可使用 .logai 或 .风格 直接分析！';
    }

    let lines = [`📁 当前群已记录的 Log 文件（共 ${history.length} 个）：`];
    history.forEach((f, idx) => {
        let tag = idx === 0 ? ' [最新]' : '';
        let sizeStr = formatFileSize(f.size);
        let timeStr = formatRelativeTime(f.timestamp);
        lines.push(`[${idx + 1}]${tag} ${f.name} (${sizeStr}, ${timeStr})`);
    });
    lines.push('-------------------------');
    lines.push('💡 使用方法：');
    lines.push('• 默认分析最新文件：.logai 或 .风格 [角色名]');
    lines.push('• 增选/多选文件分析：.logai 文件 1 2 或 .风格 [角色名] #1 #2');
    lines.push('• 文件+网络链接复合分析：.logai 文件 1 <Log链接>');
    lines.push('• 查看本列表：.logai 文件 或 .文件列表');
    lines.push('• 清空文件历史：.logai 文件清空');
    return lines.join('\n');
}

// 与已验证可用的 FUT 角色卡、模组分析插件保持同一套文件捕获写法。
function saveLastLogFile(groupId, file) {
    if (!groupId || !file) return;
    let rawGroupId = String(groupId);
    groupId = compatGroupId(groupId);
    let filename = file.name || file.filename || file.file_name || "";
    // 官方 Bot 的文件事件可能没有文件名/后缀，先保留记录，后端会按文件头推断格式。
    if (!filename) filename = "uploaded-log.txt";

    let allowedExts = seal.ext.getStringConfig(ext, "支持的文件后缀").split(',');
    let isAllowed = allowedExts.some(suffix => filename.toLowerCase().endsWith(suffix.trim().toLowerCase()));
    if (!isAllowed) {
        if (!file.id && !file.file_id && !(file.direct_url || file.url)) return;
        filename += '.txt';
    }

    let fileInfo = {
        name: filename,
        file_id: file.id || file.file_id || "",
        busid: file.busid || 0,
        size: file.size || file.file_size || 0,
        direct_url: file.direct_url || file.url || '',
        timestamp: new Date().getTime()
    };
    if (!fileInfo.file_id && !fileInfo.direct_url) return;
    let serialized = JSON.stringify(fileInfo);
    ext.storageSet(`log_last_file_${groupId}`, serialized);
    if (rawGroupId && rawGroupId !== groupId) ext.storageSet(`log_last_file_${rawGroupId}`, serialized);

    // 维护多文件历史记录（按 file_id 或 name+size 去重置顶，最多保留 15 个）
    let history = getLogFileHistory(groupId);
    history = history.filter(item => {
        if (fileInfo.file_id && item.file_id && item.file_id === fileInfo.file_id) return false;
        if (item.name === fileInfo.name && item.size === fileInfo.size) return false;
        return true;
    });
    history.unshift(fileInfo);
    if (history.length > 15) history = history.slice(0, 15);
    let historyJson = JSON.stringify(history);
    ext.storageSet(`log_file_history_${groupId}`, historyJson);
    if (rawGroupId && rawGroupId !== groupId) ext.storageSet(`log_file_history_${rawGroupId}`, historyJson);
}

// 路径1：标准群文件上传回调。
ext.onGroupUpload = (ctx, msg, file) => {
    saveLastLogFile(msg.groupId, file);
};

function parseCQFileParams(inner) {
    const params = {};
    const source = String(inner || '');
    const matches = [];
    const keyPattern = /(?:^|,)(file_id|file|file_size|busid|url)=/g;
    let match;
    while ((match = keyPattern.exec(source))) {
        matches.push({ key: match[1], valueStart: keyPattern.lastIndex, segmentStart: match.index });
    }
    matches.forEach((item, index) => {
        const valueEnd = index + 1 < matches.length ? matches[index + 1].segmentStart : source.length;
        params[item.key] = source.slice(item.valueStart, valueEnd).trim()
            .replace(/&#44;/g, ',').replace(/&#91;/g, '[').replace(/&#93;/g, ']').replace(/&amp;/g, '&');
    });
    return params;
}

// 路径2：CQ 码文件上报，与 FUT 角色卡插件保持一致。
ext.onNotCommandReceived = (ctx, msg) => {
    if (!msg || !msg.groupId || !msg.message) return;
    if (!msg.message.includes("[CQ:file,")) return;

    let match = msg.message.match(/\[CQ:file,([^\]]+)\]/);
    if (!match || !match[1]) return;

    let params = parseCQFileParams(match[1]);

    saveLastLogFile(msg.groupId, {
        id: params.file_id || "",
        name: params.file || "",
        size: parseInt(params.file_size || "0", 10) || 0,
        busid: params.busid || 0,
        direct_url: params.url || ''
    });
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function safeFetchJson(url, options, tag) {
    const response = await fetch(url, options);
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        const preview = text.length > 160 ? `${text.slice(0, 160)}...` : text;
        throw new Error(`${tag} 返回非JSON: ${preview}`);
    }
}

async function resolveRealUserNickname(ctx, userKey) {
    const resolvedUserId = compatUserId(userKey);
    const fallback = String(resolvedUserId || '').replace(/^QQ:/, '');
    const currentId = compatUserId(ctx && ctx.player && ctx.player.userId);
    const currentName = currentId === resolvedUserId && ctx && ctx.player ? String(ctx.player.name || '').trim() : '';
    try {
        let api = seal.ext.getStringConfig(ext, 'OneBot_API_地址') || '';
        api = api.replace(/\/$/, '');
        if (!api || !/^\d+$/.test(fallback)) {
            return currentName;
        }
        const response = await fetch(`${api}/get_stranger_info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: /^\d+$/.test(fallback) ? parseInt(fallback, 10) : fallback, no_cache: true })
        });
        const raw = String(await response.text() || '').replace(/^\uFEFF/, '').trim();
        let data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (_) { return currentName; }
        const nickname = data && data.data && (data.data.nickname || data.data.nick);
        return nickname ? String(nickname).trim() : currentName;
    } catch (e) {
        console.warn(`[logai] 获取真实QQ昵称失败 ${fallback}: ${String(e && e.message ? e.message : e)}`);
        return currentName;
    }
}

async function resolveLogFileDownloadUrl(onebotApiUrl, onebotGroupId, fileData) {
    const directUrl = fileData && fileData.direct_url ? String(fileData.direct_url).trim() : "";
    if (directUrl && /^https?:\/\//i.test(directUrl)) return directUrl;

    try {
        const urlJson = await safeFetchJson(
            `${onebotApiUrl}/get_group_file_url`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    group_id: onebotGroupId,
                    file_id: fileData.file_id,
                    busid: fileData.busid || 0
                })
            },
            "获取群文件链接"
        );
        if (urlJson && urlJson.data && urlJson.data.url) return String(urlJson.data.url);
    } catch (e) {
        console.error("[logai] get_group_file_url:", e);
    }
    return "";
}

function parseLogLinkToken(raw) {
    let value = String(raw || '').trim();
    const urlMatch = value.match(/https?:\/\/[^\s\]"']+/i);
    if (urlMatch) value = urlMatch[0];
    value = value.replace(/[，。；,;]+$/g, '');
    let key = '', source = '', password = '';
    if (value.includes('s3=')) {
        const match = value.match(/[?&]s3=([^&#]+)/);
        if (match) { key = match[1]; source = 'kokona'; }
    } else if (value.includes('key=')) {
        const match = value.match(/[?&]key=([^&#]+)/);
        if (match) { key = match[1]; source = 'weizaima'; }
        const pwd = value.match(/#([^?&\s]+)/);
        if (pwd) password = pwd[1];
    } else if (value.includes('#')) {
        const parts = value.split('#');
        key = parts[parts.length - 1].replace(/[^a-zA-Z0-9-_]/g, '');
        if (key.includes('-')) source = 'trpgbot';
    } else {
        key = value;
    }
    return key ? { key: key, source: source, password: password, raw: value } : null;
}

function parseFileIndices(args, isComicMode) {
    let indices = [];
    let explicitFileKeyword = false;

    // 1. 明确标记：#1, [1], 文件:1, 本地1, 文件 1 2 等
    for (let i = 0; i < args.length; i++) {
        let a = String(args[i]).trim();
        if (!a) continue;

        if (/^#(\d+(?:[,\uff0c、]\d+)*)$/.test(a)) {
            explicitFileKeyword = true;
            let nums = a.slice(1).split(/[,，、]/);
            nums.forEach(n => {
                let idx = parseInt(n.trim(), 10);
                if (idx >= 1 && !indices.includes(idx)) indices.push(idx);
            });
            continue;
        }

        if (/^\[(\d+(?:[,\uff0c、]\d+)*)\]$/.test(a)) {
            explicitFileKeyword = true;
            let nums = a.replace(/[\[\]]/g, '').split(/[,，、]/);
            nums.forEach(n => {
                let idx = parseInt(n.trim(), 10);
                if (idx >= 1 && !indices.includes(idx)) indices.push(idx);
            });
            continue;
        }

        if (/^(?:文件|本地)[:：=]?(\d+(?:[,\uff0c、]\d+)*)$/.test(a)) {
            explicitFileKeyword = true;
            let nums = a.replace(/^(?:文件|本地)[:：=]?/, '').split(/[,，、]/);
            nums.forEach(n => {
                let idx = parseInt(n.trim(), 10);
                if (idx >= 1 && !indices.includes(idx)) indices.push(idx);
            });
            continue;
        }

        if (a === '文件' || a === '本地') {
            explicitFileKeyword = true;
            let next = i + 1;
            while (next < args.length) {
                let nextArg = String(args[next]).trim();
                if (/^(\d+)(?:[,\uff0c、](\d+))*$/.test(nextArg)) {
                    let nums = nextArg.split(/[,，、]/);
                    nums.forEach(n => {
                        let idx = parseInt(n.trim(), 10);
                        if (idx >= 1 && idx <= 50 && !indices.includes(idx)) indices.push(idx);
                    });
                    next++;
                } else if (/^#(\d+)$/.test(nextArg)) {
                    let idx = parseInt(nextArg.slice(1), 10);
                    if (idx >= 1 && !indices.includes(idx)) indices.push(idx);
                    next++;
                } else {
                    break;
                }
            }
        }
    }

    // 2. 离散数字识别（例如未带文件关键字的 ".logai 1 2" 或 ".风格 卡修斯 1 https://..."）
    if (!indices.length) {
        for (let a of args) {
            let s = String(a).trim();
            if (isComicMode && /^\d+页?$/.test(s)) continue;
            if (/^\d{5,12}$/.test(s)) continue; // 排除 QQ 号
            if (/^\d+(?:[,\uff0c、]\d+)*$/.test(s)) {
                let nums = s.split(/[,，、]/);
                nums.forEach(n => {
                    let idx = parseInt(n.trim(), 10);
                    if (idx >= 1 && idx <= 50 && !indices.includes(idx)) indices.push(idx);
                });
            }
        }
    }

    return { indices, explicitFileKeyword };
}

// --- 用户级独立自动存档偏好存取与决断 ---
function getUserArchivePref(userIdOrQq) {
    if (!userIdOrQq) return null;
    let clean = String(userIdOrQq).replace(/^(?:QQ:|QQ-Group:|OpenQQ:)/i, '').trim();
    if (!clean) return null;
    let val = ext.storageGet('logai_user_archive_' + clean);
    if (!val) return null;
    val = String(val).trim().toLowerCase();
    if (val === 'on' || val === '1' || val === 'true') return 'on';
    if (val === 'off' || val === '0' || val === 'false') return 'off';
    return null;
}

function setUserArchivePref(userIdOrQq, pref) {
    if (!userIdOrQq) return false;
    let clean = String(userIdOrQq).replace(/^(?:QQ:|QQ-Group:|OpenQQ:)/i, '').trim();
    if (!clean) return false;
    let key = 'logai_user_archive_' + clean;
    let low = String(pref || '').trim().toLowerCase();
    if (['on', 'open', '1', 'true', '开', '开启', 'enable'].includes(low)) {
        ext.storageSet(key, 'on');
        return 'on';
    } else if (['off', 'close', '0', 'false', '关', '关闭', 'disable'].includes(low)) {
        ext.storageSet(key, 'off');
        return 'off';
    } else {
        ext.storageSet(key, '');
        return 'default';
    }
}

function resolveArchiveDecision(ctx, targetUsers, targetUser, resolvedUserId, args) {
    // 1. 命令行参数单次最高优先级覆盖
    let explicitNoSave = (args || []).some(a => ['不存档', '不保存', '临时', 'nosave', 'temp'].includes(String(a).toLowerCase()));
    let explicitSave = (args || []).some(a => ['存档', '保存', '记录', 'save'].includes(String(a).toLowerCase()));
    if (explicitNoSave) {
        return { saveArchive: false, reason: '单次指令' };
    }
    if (explicitSave) {
        return { saveArchive: true, reason: '单次指令' };
    }

    // 2. 用户级独立配置检查（无视全局设置）
    let candidates = [];
    if (targetUser) {
        let m = String(targetUser).match(/\b(\d{5,12})\b/);
        candidates.push(m ? m[1] : String(targetUser).trim());
    }
    if (Array.isArray(targetUsers)) {
        for (let tu of targetUsers) {
            let m = String(tu).match(/\b(\d{5,12})\b/);
            let id = m ? m[1] : String(tu).trim();
            if (id && !candidates.includes(id)) candidates.push(id);
        }
    }
    let senderQQ = getSenderBoundQQ(ctx);
    if (senderQQ && !candidates.includes(senderQQ)) {
        candidates.push(senderQQ);
    }
    let rawUid = resolvedUserId ? String(resolvedUserId).replace(/^(?:QQ:|OpenQQ:)/i, '').trim() : '';
    if (rawUid && !candidates.includes(rawUid)) {
        candidates.push(rawUid);
    }

    for (let c of candidates) {
        let pref = getUserArchivePref(c);
        if (pref === 'on') {
            return { saveArchive: true, reason: '个人设置' };
        } else if (pref === 'off') {
            return { saveArchive: false, reason: '个人设置' };
        }
    }

    // 3. 全局配置兜底（默认 false）
    let globalCfg = seal.ext.getBoolConfig(ext, "风格分析_启用自动存档");
    if (globalCfg === undefined) globalCfg = false;
    return { saveArchive: !!globalCfg, reason: '全局设置' };
}

// --- 核心调度函数 ---
async function processLogTask(ctx, msg, cmdArgs, modeName, pythonMode) {
    let args = (cmdArgs.args || []).filter(a => typeof a === 'string' && a.trim() !== '');
    const comicPromptMode = pythonMode === 'comic_prompt';
    const comicMode = pythonMode === 'comic' || comicPromptMode;
    const resolvedUserId = compatUserId(ctx && ctx.player && ctx.player.userId);
    const resolvedGroupId = compatGroupId(ctx && ctx.group && ctx.group.groupId);
    // 1. 获取并解析存储中的自定义配置库
    let stored = ext.storageGet('logai_custom_prompts') || '{}';
    let customPrompts = {};
    try { customPrompts = JSON.parse(stored); } catch (e) {}

    let customPromptContent = "";
    let customName = "";

    // 扫描群友的参数中，是否包含已保存的自定义配置名
    for (let i = 0; i < args.length; i++) {
        if (customPrompts[args[i]]) {
            customName = args[i];
            // 【兼容升级】：旧版是字符串，新版是带 owner 的对象
            let p = customPrompts[args[i]];
            customPromptContent = typeof p === 'string' ? p : p.content;
            break; // 找到即跳出
        }
    }

    let { indices: fileIndices, explicitFileKeyword } = parseFileIndices(args, comicMode);
    let usedFileIndices = (fileIndices || []).map(String);

    const isStyleMode = pythonMode === 'player_style';
    let targetUsers = [];
    let customTimeline = '';
    let specifiedIdentity = '';
    const DATE_ARG_REGEX = /^(?:时间(?:线|轴)?[:：=]?)?(20\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?(?:\s*[-~至到—_]\s*20\d{2}[-/年.]\d{1,2}(?:[-/月.]\d{1,2})?日?)?)$/i;

    const KP_IDENTITY_TOKENS = ['kp', '主持', '主持人', 'dm', '守秘人', '带团', 'kp风格', '带团风格', '主持风格'];
    const PL_IDENTITY_TOKENS = ['pl', '玩家', 'player', 'pl风格', '玩家风格'];
    const DUAL_IDENTITY_TOKENS = ['双重', '兼有', '全能', 'dual'];

    if (isStyleMode) {
        let cmdName = String((cmdArgs && cmdArgs.command) || '').trim().toLowerCase();
        if (['带团风格', 'kp风格', '主持风格', '带团'].includes(cmdName)) {
            specifiedIdentity = 'kp';
        } else if (['玩家风格', 'pl风格'].includes(cmdName)) {
            specifiedIdentity = 'pl';
        }

        function isBotUserId(userId) {
            if (!userId) return false;
            let clean = String(userId).trim();
            let raw = clean.replace(/^(?:QQ|OpenQQ):/i, '').trim();
            if (ctx && ctx.endPoint && ctx.endPoint.userId) {
                let curEp = String(ctx.endPoint.userId).trim();
                if (clean === curEp || raw === curEp.replace(/^(?:QQ|OpenQQ):/i, '').trim()) return true;
            }
            try {
                if (typeof seal.getEndPoints === 'function') {
                    let eps = seal.getEndPoints() || [];
                    for (let ep of eps) {
                        if (ep && ep.userId) {
                            let epId = String(ep.userId).trim();
                            if (clean === epId || raw === epId.replace(/^(?:QQ|OpenQQ):/i, '').trim()) return true;
                        }
                    }
                }
            } catch (e) {}
            return false;
        }

        if (cmdArgs.at && cmdArgs.at.length > 0) {
            cmdArgs.at.forEach((atItem, atIndex) => {
                if (!atItem || !atItem.userId) return;
                // 1. 如果当前被 @ 的是骰娘/Bot 自身（或首个 @ 命中骰娘唤醒），坚决忽略，严禁当作目标分析
                if ((atIndex === 0 && cmdArgs.amIBeMentionedFirst) || isBotUserId(atItem.userId)) {
                    return;
                }
                let rawUserId = String(atItem.userId).trim();
                if (/:(?:all|0)$/i.test(rawUserId)) return;

                // 2. 对被 @ 的成员进行身份解析（支持 official-bridge 绑定还原）
                let resolvedAt = compatUserId(rawUserId);
                let cleanAt = String(resolvedAt || rawUserId).replace(/^(?:QQ|OpenQQ):/i, '').trim();

                // 若能解析出纯数字 QQ，优先当作 QQ
                if (/^\d{5,12}$/.test(cleanAt)) {
                    if (!targetUsers.includes(cleanAt)) targetUsers.push(cleanAt);
                    return;
                }

                // 官Bot下若未绑定，尝试通过群名片代理获取群昵称/角色名
                let targetName = '';
                try {
                    let proxy = seal.getCtxProxyAtPos(ctx, cmdArgs, atIndex);
                    if (proxy && proxy.player && proxy.player.name) {
                        targetName = String(proxy.player.name).trim();
                    }
                } catch (e) {}

                if (targetName && !targetUsers.includes(targetName)) {
                    targetUsers.push(targetName);
                } else if (cleanAt && !/^OpenQQ(?::|CH:)/i.test(cleanAt) && !targetUsers.includes(cleanAt)) {
                    targetUsers.push(cleanAt);
                }
            });
        }

        for (let i = 0; i < args.length; i++) {
            let a = String(args[i]).trim();
            if (!a) continue;
            if (a === customName) continue;
            if (/^https?:\/\//i.test(a)) continue;
            if (a.startsWith('#') || /^\[\d+\]$/.test(a)) continue;
            if (/^(?:文件|本地)/.test(a)) continue;

            let low = a.toLowerCase();
            if (KP_IDENTITY_TOKENS.includes(low)) {
                if (!specifiedIdentity) specifiedIdentity = 'kp';
                continue;
            }
            if (PL_IDENTITY_TOKENS.includes(low)) {
                if (!specifiedIdentity) specifiedIdentity = 'pl';
                continue;
            }
            if (DUAL_IDENTITY_TOKENS.includes(low)) {
                if (!specifiedIdentity) specifiedIdentity = '双重';
                continue;
            }

            if (['风格', '跑团风格', '带团风格', '玩家风格', 'style', 'pl风格', 'kp风格', '主持风格', 'kp', 'pl', '主持', '主持人', 'dm', '守秘人', '玩家', 'player', '双重', '全能', '兼有', 'pro', 'kind', '温柔', '本地', '文件', 'ai', '原版', '专业', '漫画', 'comic', '插画', '黑白', '水彩', '写实', '日式', '页数', '赛博风', '赛博', '历史风', '历史', '古风', '简约风', '简约', '白底', '克苏鲁', '克苏鲁风', '深潜', '废土', '废土风', '末日', '末日风', '二次元', '二次元风', '萌系', '终端', '终端风', '黑客', '经典', '经典风', 'ds', 'deepseek', 'backup', '备用', '备用模型', '存档', '保存', '记录', '不存档', '不保存', '临时', 'save', 'nosave', 'temp'].includes(low)) continue;

            if (usedFileIndices.includes(a) && /^\d+$/.test(a)) continue;

            let mDate = a.match(DATE_ARG_REGEX);
            if (mDate) {
                if (!customTimeline) customTimeline = mDate[1].trim();
                continue;
            }

            let subTokens = a.split(/[,，/、|]+/).map(s => s.trim()).filter(Boolean);
            for (let token of subTokens) {
                let cleanToken = token.replace(/^(?:QQ[:：])?/i, '').trim();
                if (!cleanToken) continue;
                let subLow = cleanToken.toLowerCase();
                if (KP_IDENTITY_TOKENS.includes(subLow)) {
                    if (!specifiedIdentity) specifiedIdentity = 'kp';
                    continue;
                }
                if (PL_IDENTITY_TOKENS.includes(subLow)) {
                    if (!specifiedIdentity) specifiedIdentity = 'pl';
                    continue;
                }
                if (DUAL_IDENTITY_TOKENS.includes(subLow)) {
                    if (!specifiedIdentity) specifiedIdentity = '双重';
                    continue;
                }
                if (usedFileIndices.includes(cleanToken) && /^\d+$/.test(cleanToken)) continue;
                // 忽略被作为参数误传入的骰娘/Bot 自身 ID 或腾讯官方 OpenQQ 内部标识
                if (isBotUserId(cleanToken) || /^OpenQQ(?::|CH:)/i.test(cleanToken)) continue;
                let mTokenDate = cleanToken.match(DATE_ARG_REGEX);
                if (mTokenDate) {
                    if (!customTimeline) customTimeline = mTokenDate[1].trim();
                    continue;
                }
                if (!targetUsers.includes(cleanToken)) {
                    targetUsers.push(cleanToken);
                }
            }
        }

        if (!targetUsers.length) {
            let selfQq = String(resolvedUserId || '').replace(/^(?:QQ|OpenQQ):/i, '').trim();
            if (/^\d{5,12}$/.test(selfQq)) {
                targetUsers.push(selfQq);
            } else {
                let selfName = String((ctx && ctx.player && ctx.player.name) || '').trim();
                if (selfName && !/^用户\d+$/.test(selfName) && !/^OpenQQ/i.test(selfName)) {
                    targetUsers.push(selfName);
                } else if (selfQq && !/^OpenQQ/i.test(selfQq)) {
                    targetUsers.push(selfQq);
                }
            }
        }
    }
    let targetUser = targetUsers.join(' ');

    let isPro = args.some(a => a.toLowerCase() === 'pro');
    let isKind = args.some(a => a.includes('温柔') || a.toLowerCase() === 'kind');
    let isAI = args.some(a => a.toLowerCase() === 'ai' || a === '原版' || a === '专业');
    let backupCfg = getBackupModelConfig();
    backupCfg = selectBackupModel(backupCfg, args);
    // ds/deepseek 保留为旧别名；backup/备用使用骰主配置的模型。
    let isDS = args.some(a => ['ds', 'deepseek', 'backup', '备用', '备用模型'].includes(a.toLowerCase()));
    if (backupCfg.selected && args.some(a => a === backupCfg.selected)) isDS = true;

    let archiveDecision = resolveArchiveDecision(ctx, targetUsers, targetUser, resolvedUserId, args);
    let saveArchive = archiveDecision.saveArchive;

    // ===== 新增：图片主题风格嗅探 =====
    let theme = 'default';
    let tArgs = args.join(' ');
    if (tArgs.includes('赛博')) theme = 'cyberpunk';
    else if (tArgs.includes('历史') || tArgs.includes('古风')) theme = 'historical';
    else if (tArgs.includes('克苏鲁') || tArgs.includes('深潜')) theme = 'cthulhu';
    else if (tArgs.includes('废土') || tArgs.includes('末日')) theme = 'wasteland';
    else if (tArgs.includes('二次元') || tArgs.includes('萌系')) theme = 'anime';
    else if (tArgs.includes('终端') || tArgs.includes('黑客')) theme = 'terminal';
    else if (tArgs.includes('经典')) theme = 'classic';
    else if (tArgs.includes('默认') || tArgs.includes('常规')) theme = 'default';

    let comicPages = 6;
    let comicStyle = '叙事性日式插画漫画，柔和笔触，电影感构图，细腻角色表情，带有绘本质感';
    if (comicMode) {
        const pageToken = args.find(a => /^(?:漫画)?(?:页数)?[：:=]?\d+页?$/i.test(String(a)) || /^\d+页?$/.test(String(a)));
        if (pageToken) { const match = String(pageToken).match(/\d+/); if (match) comicPages = Math.max(1, Math.min(10, parseInt(match[0], 10))); }
        const styleMap = [['黑白', '黑白漫画插画'], ['水彩', '水彩叙事插画漫画'], ['赛博', '赛博朋克插画漫画'], ['写实', '写实电影感插画漫画'], ['二次元', '彩色日式插画漫画'], ['日式', '彩色日式插画漫画'], ['插画', '叙事性日式插画漫画，柔和笔触，电影感构图，细腻角色表情，带有绘本质感']];
        const styleEntry = styleMap.find(entry => args.some(a => String(a).includes(entry[0])));
        if (styleEntry) comicStyle = styleEntry[1];
    }
    // ================= 核心：钱包保护逻辑 =================
    // 获取东八区今天的日期字符串 (例如 "2026-3-19")
    let dateStr = (function() {
        let d = new Date(new Date().getTime() + 8 * 3600 * 1000);
        return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
    })();
    let globalKey = `logai_pro_usage_${dateStr}_global`;
    let userKey = `logai_pro_usage_${dateStr}_${resolvedUserId}`;

    let fallbackToDSPro = false;
    let consumedProQuota = false;

    if (isPro) {
        // 只有在没指定 ds 时，才消耗昂贵的 Gemini Pro 额度
        if (!isDS) {
            let globalLimit = seal.ext.getIntConfig(ext, "每日Pro全局限额");
            let userLimit = seal.ext.getIntConfig(ext, "每日单人Pro限额");
            let isAdmin = ctx.privilegeLevel >= 100; 

            let globalUsage = parseInt(ext.storageGet(globalKey) || '0');
            let userUsage = parseInt(ext.storageGet(userKey) || '0');

            let limitReached = false;
            if (globalLimit === 0) limitReached = true;
            else if (globalLimit > 0 && globalUsage >= globalLimit) limitReached = true;
            else if (userLimit > 0 && userUsage >= userLimit && !isAdmin) limitReached = true;

            if (limitReached) {
                // 额度耗尽！切换到已配置的备用模型 Pro 版本
                isDS = true;
                fallbackToDSPro = true;
            } else {
                // 额度健康，扣除配额
                ext.storageSet(globalKey, (globalUsage + 1).toString());
                ext.storageSet(userKey, (userUsage + 1).toString());
                consumedProQuota = true;
            }
        }
    }
    // =======================================================

    // 【核心机制】：如果有自定义配置，强制关闭骰娘语气，进入 AI 原版模式！
    if (customName) {
        isAI = true;
    }

    let usePersona = seal.ext.getBoolConfig(ext, "启用骰娘人设");
    if (isAI) usePersona = false;

    let personaStr = "";
    if (usePersona) {
        personaStr = isKind ? seal.ext.getStringConfig(ext, "温柔模式_骰娘设定") : seal.ext.getStringConfig(ext, "常规模式_骰娘设定");
    }

    // 将匹配到的自定义名字加入屏蔽字库，以免它被误认为是网址
    // 把主题关键字也加入过滤列表，防止被当成文件名
    let excludeList =['pro', 'kind', '温柔', '本地', '文件', 'ai', '原版', '专业', '漫画', 'comic', '插画', '黑白', '水彩', '写实', '日式', '页数', '风格', '跑团风格', '带团风格', '玩家风格', 'style', 'pl风格', 'kp风格', '赛博风', '赛博', '历史风', '历史', '古风', '简约风', '简约', '白底', '克苏鲁', '克苏鲁风', '深潜', '废土', '废土风', '末日', '末日风', '二次元', '二次元风', '萌系', '终端', '终端风', '黑客', '经典', '经典风', 'ds', 'deepseek', 'backup', '备用', '备用模型'];
    if (comicMode) args.forEach(a => { if (/^\d+页?$/.test(String(a)) || /^页数[：:=]?\d+页?$/.test(String(a))) excludeList.push(a); });
    if (comicPromptMode) excludeList.push('漫画提示词', '漫画测试', 'comicprompt', 'comic_prompt');
    Object.keys(getBackupModelConfig().models || {}).forEach(name => excludeList.push(name));
    if (customName) excludeList.push(customName);
    if (customTimeline) excludeList.push(customTimeline);
    if (targetUsers && targetUsers.length > 0) targetUsers.forEach(t => excludeList.push(t));

    // 支持多个 Log 链接，保持用户输入顺序；普通配置参数与文件编号不会被当成链接。
    let linkArgs = args.filter(a => {
        if (excludeList.includes(a) || excludeList.includes(a.toLowerCase())) return false;
        if (/^#\d+$/.test(a) || /^#?\[\d+\]$/.test(a) || /^(?:文件|本地)[:：=]?\d+/.test(a)) return false;
        return /^https?:\/\//i.test(a) || /(?:[?&](?:s3|key)=|#)/i.test(a);
    });
    if (!linkArgs.length && !explicitFileKeyword && !fileIndices.length) {
        const bare = args.filter(a => {
            let s = String(a).trim();
            if (!s) return false;
            if (excludeList.includes(s) || excludeList.includes(s.toLowerCase()) || customPrompts[s]) return false;
            if (/^\d+$/.test(s)) return false;
            if (isStyleMode) return false; // 风格模式下普通参数均为目标或选项，严禁被误判为 bare 链接
            return true;
        });
        if (bare.length === 1) linkArgs = bare;
    }
    let logSources = linkArgs.map(parseLogLinkToken).filter(Boolean);
    let useRemoteLinks = logSources.length > 0;
    let isHybrid = useRemoteLinks && (explicitFileKeyword || fileIndices.length > 0);
    let useLocalFile = !useRemoteLinks || isHybrid;
    let selectedFileIndices = fileIndices;

    let apiUrl = "";
    let logKeyForMsg = "";
    let comicReceipt = '';

    // 组装 POST 数据载荷，加入自定义提示词
    const realUserName = await resolveRealUserNickname(ctx, resolvedUserId);
    let payload = {
        mode: pythonMode,
        pro: isPro,
        kind: isKind,
        persona: personaStr,
        custom_prompt: customPromptContent,
        theme: theme,   // 新增传给后端的风格
        ds: isDS,
        backup_label: backupCfg.label,
        backup_model: isPro && backupCfg.proModel ? backupCfg.proModel : backupCfg.model,
        user_key: String(resolvedUserId || '').replace(/^QQ:/, ''),
        user_name: realUserName || String((ctx.player && ctx.player.name) || '').trim() || '匿名用户',
        group_key: String(resolvedGroupId || '').replace(/^QQ-Group:/, ''),
        custom_name: customName,
        token_module: isStyleMode ? 'player_style' : (pythonMode === 'comic' ? 'log_comic' : (comicPromptMode ? 'log_comic_prompt' : (pythonMode === 'recap' ? 'log_recap' : 'log_analyze'))),
        target_qq: targetUser,
        target_user: targetUser,
        target_users: targetUsers,
        specified_identity: specifiedIdentity || '',
        custom_timeline: customTimeline,
        save_archive: saveArchive,
        identity_bindings: collectIdentityBindings(ctx, msg),
        character_bible: comicMode ? (seal.ext.getStringConfig(ext, "漫画固定角色外观") || '') : ''
    };

    if (useLocalFile) {
        let groupId = resolvedGroupId;
        if (!groupId.includes('Group')) {
            seal.replyToSender(ctx, msg, '❌ 本地文件分析功能只能在群聊中使用。');
            const helpResult = seal.ext.newCmdExecuteResult(true);
            helpResult.showHelp = true;
            return helpResult;
        }

        let history = getLogFileHistory(groupId);
        if (!history.length && ctx.group && ctx.group.groupId && ctx.group.groupId !== groupId) {
            history = getLogFileHistory(ctx.group.groupId);
        }

        if (!history.length) {
            seal.replyToSender(ctx, msg, comicMode ? '❌ 当前群没有检测到新上传的 Log 文件。\n用法：先上传 Log 后发送 .漫画 6 插画；调试分镜请使用 .漫画提示词 6；也可直接附 Log 链接。' : '❌ 当前群没有检测到上传的 Log 文件。\n用法：先在群里发送 Log 文件后重试；或使用 .logai <Log链接>。');
            const helpResult = seal.ext.newCmdExecuteResult(true);
            helpResult.showHelp = true;
            return helpResult;
        }

        // 确定需要分析的文件编号列表（未指定则默认选 [1]，即最新文件）
        let targetIndices = selectedFileIndices.length > 0 ? selectedFileIndices : [1];
        let targetFiles = [];
        let invalidIndices = [];
        for (let idx of targetIndices) {
            if (idx >= 1 && idx <= history.length) {
                targetFiles.push({ index: idx, file: history[idx - 1] });
            } else {
                invalidIndices.push(idx);
            }
        }

        if (invalidIndices.length > 0) {
            seal.replyToSender(ctx, msg, `❌ 指定的文件编号不存在：${invalidIndices.map(i => `[${i}]`).join(', ')}\n当前群历史文件共有 ${history.length} 个（编号 1~${history.length}）。\n可发送 .logai 文件 查看完整列表。`);
            return seal.ext.newCmdExecuteResult(true);
        }

        let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
        if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);
        let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));

        let resolvedFiles = [];
        for (let item of targetFiles) {
            let fileData = item.file;
            if (!fileData.direct_url && !/^QQ-Group:\d+$/.test(groupId)) {
                seal.replyToSender(ctx, msg, `❌ 官Bot群文件【${fileData.name}】没有可用直链。请先使用 .QQ群绑定 <原QQ群号> 绑定后再试。`);
                return seal.ext.newCmdExecuteResult(true);
            }
            let downloadUrl = await resolveLogFileDownloadUrl(onebotApiUrl, onebotGroupId, fileData);
            if (!downloadUrl) {
                seal.replyToSender(ctx, msg, `❌ 获取群文件【${fileData.name}】下载链接失败，请确认 OneBot API 地址或重新上传。`);
                return seal.ext.newCmdExecuteResult(true);
            }
            resolvedFiles.push({
                url: downloadUrl,
                filename: fileData.name,
                index: item.index
            });
        }

        apiUrl = `http://127.0.0.1:8000/api/submit_file`;
        payload.files = resolvedFiles.map(f => ({ url: f.url, filename: f.filename }));
        payload.filename = resolvedFiles.map(f => f.filename).join(' + ');
        payload.url = resolvedFiles[0].url;
        if (isHybrid && logSources.length > 0) {
            payload.log_sources = logSources.map(item => ({ key: item.key, source: item.source, password: item.password }));
        }
        payload.mode = isStyleMode ? 'player_style' : (pythonMode === 'analyze' ? 'log_analyze' : (comicMode ? 'comic' : 'log_recap'));

        // 构造群内提示的 Log 名称摘要
        if (isHybrid) {
            let fileLabels = resolvedFiles.map(f => `[${f.index}]${f.filename}`).join(' + ');
            let linkCount = logSources.length;
            let linkLabel = linkCount > 1 ? `${logSources[0].key} 等 ${linkCount} 条链接` : logSources[0].key;
            logKeyForMsg = `复合串联: 文件(${fileLabels}) + 链接(${linkLabel})`;
        } else if (resolvedFiles.length === 1) {
            logKeyForMsg = `[${resolvedFiles[0].index}] ${resolvedFiles[0].filename}`;
        } else {
            let fileLabels = resolvedFiles.map(f => `[${f.index}]${f.filename}`).join(' + ');
            logKeyForMsg = `多文件联合: ${fileLabels}`;
        }

    } else {
        const first = logSources[0];
        if (!first || !first.key) {
            seal.replyToSender(ctx, msg, '❌ 无法解析 Log 链接。');
            return seal.ext.newCmdExecuteResult(true);
        }
        if (logSources.length > 20) {
            seal.replyToSender(ctx, msg, '❌ 单次最多合并 20 个 Log 链接。');
            return seal.ext.newCmdExecuteResult(true);
        }
        payload.log_sources = logSources.map(item => ({ key: item.key, source: item.source, password: item.password }));
        payload.key = first.key;
        payload.source = first.source;
        payload.password = first.password;
        logKeyForMsg = logSources.length > 1 ? `${first.key} 等 ${logSources.length} 段` : first.key;
        apiUrl = `http://127.0.0.1:8000/api/submit`;
        if (isStyleMode) payload.mode = 'player_style';
    }

    if (pythonMode === 'comic') {
        apiUrl = `http://127.0.0.1:8000/api/submit_comic`;
        payload.pages = comicPages;
        payload.style = comicStyle;
    }
    if (comicPromptMode) { apiUrl = `http://127.0.0.1:8000/api/test_comic_prompt`; payload.pages = comicPages; payload.style = comicStyle; }

    if (pythonMode === 'comic') {
        const quota = reserveComicGeneration(ctx, msg);
        if (!quota.ok) {
            const message = quota.reason === 'weekly_used'
                ? '❌ 本自然周的免费短漫画额度已经用完。下次生成需消耗骰娘好感度插件中的 1000 游戏币。'
                : quota.reason === 'insufficient_coins'
                    ? `❌ 游戏币不足：生成短漫画需要 1000 游戏币，当前余额 ${quota.coins || 0}。`
                    : '❌ 漫画额度服务未启用，请先加载“骰娘好感度（小游戏合集）”插件。';
            seal.replyToSender(ctx, msg, message);
            return seal.ext.newCmdExecuteResult(true);
        }
        comicReceipt = quota.receipt || '';
    }

    if (customName) {
        modeName = isStyleMode ? `风格分析[自定义:${customName}]` : `自定义配置[${customName}]`;
    }

    let modeMsg = usePersona ? " [骰娘人设]" : (isAI ? " [纯净AI]" : "");
    if (isHybrid) {
        modeMsg += ` [复合串联]`;
    } else if (useLocalFile) {
        modeMsg += (payload.files && payload.files.length > 1 ? ` [联合多文件(${payload.files.length})]` : " [本地文件]");
    }
    if (isStyleMode && targetUsers && targetUsers.length > 1) {
        modeMsg += ` [目标:${targetUsers.join('/')}]`;
    } else if (isStyleMode && targetUser) {
        if (/^\d{5,12}$/.test(targetUser)) {
            modeMsg += ` [目标QQ:${targetUser}]`;
        } else {
            modeMsg += ` [目标角色:${targetUser}]`;
        }
    }
    if (isStyleMode) {
        if (saveArchive) {
            modeMsg += archiveDecision.reason === '个人设置' ? ` [自动存档(个人)]` : ` [自动存档]`;
        } else {
            modeMsg += ` [不存档]`;
        }
    }
    // 【更新提示语逻辑】
    if (fallbackToDSPro) {
        modeMsg += `\n[⚠️ 高级Pro额度耗尽，已自动切换至${backupCfg.label}模型继续服务！]`;
    } else {
        if (isDS) modeMsg += (isPro ? ` [${backupCfg.label} Pro]` : ` [${backupCfg.label}]`);
        else if (isPro) modeMsg += " [Pro模式]";
    }

    seal.replyToSender(ctx, msg, `已提交请求，正在阅读【${logKeyForMsg}】并执行【${modeName}】${modeMsg} (请稍候)...`);

    try {
        let resp = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        let data = await resp.json();
        
        if (data.status !== 'ok') {
            if (comicReceipt) refundComicGeneration(ctx, msg, comicReceipt);
            if (consumedProQuota) { // 仅在真正扣费了的情况才退还
                let g = parseInt(ext.storageGet(globalKey) || '1');
                let u = parseInt(ext.storageGet(userKey) || '1');
                ext.storageSet(globalKey, Math.max(0, g - 1).toString());
                ext.storageSet(userKey, Math.max(0, u - 1).toString());
            }
            seal.replyToSender(ctx, msg, `❌ 提交失败：${JSON.stringify(data)}`);
            return seal.ext.newCmdExecuteResult(true);
        }

        if (pythonMode === 'comic' && data.cached) {
            if (comicReceipt) refundComicGeneration(ctx, msg, comicReceipt);
            seal.replyToSender(ctx, msg, '♻️ 检测到相同 Log 与漫画配置，已复用之前永久保存的漫画，本次不重复生成。');
        }

        let jobId = data.id;
        if (comicPromptMode) {
            if (!Array.isArray(data.pages) || !data.pages.length) {
                seal.replyToSender(ctx, msg, '❌ 后端没有返回可调试的分镜提示词。');
                return seal.ext.newCmdExecuteResult(true);
            }
            let promptMsg = `【漫画分镜测试｜模型：${data.storyboard_model || 'gpt-5.6-sol-low'}】\n`;
            if (data.character_bible) promptMsg += `固定角色外观：${data.character_bible}\n`;
            promptMsg += data.pages.map(item => `\n第${item.page}页\n分镜：${item.scene || ''}\n角色动作：${item.characters || ''}\n镜头：${item.camera || ''}\n文字：${item.dialogue || item.caption || '无'}\nNovelAI 提示词：\n${item.prompt || ''}`).join('\n');
            seal.replyToSender(ctx, msg, promptMsg);
            return seal.ext.newCmdExecuteResult(true);
        }
        let checkUrl = `http://127.0.0.1:8000/api/status?id=${jobId}`;
        let resultUrl = `http://127.0.0.1:8000/api/result?id=${jobId}`;

        let maxRetries = pythonMode === 'comic' ? 480 : 240;
        while (maxRetries > 0) {
            await sleep(2000);
            let sResp = await fetch(checkUrl);
            let sData = await sResp.json();
            
            if (sData.status === 'done' || sData.status === 'error') {
                if (sData.status === 'error' && comicReceipt) refundComicGeneration(ctx, msg, comicReceipt);
                if (sData.status === 'error') {
                    let errMsg = sData.msg ? `❌ ${sData.msg}\n` : '';
                    if (sData.image_count !== undefined && sData.image_count > 0) {
                        let finalUrl = `${resultUrl}&index=0&t=${new Date().getTime()}`;
                        seal.replyToSender(ctx, msg, `${errMsg}[CQ:image,file=${finalUrl},cache=0]`);
                    } else if (errMsg) {
                        seal.replyToSender(ctx, msg, errMsg);
                    }
                    // 保留群内已上传文件缓存，允许群友修正指令后直接重试，无需重复上传大文件
                    return seal.ext.newCmdExecuteResult(true);
                }
                if (sData.image_count !== undefined && sData.image_count > 0) {
                    let msgStr = "";
                    for (let i = 0; i < sData.image_count; i++) {
                        let finalUrl = `${resultUrl}&index=${i}&t=${new Date().getTime()}`;
                        msgStr += `[CQ:image,file=${finalUrl},cache=0]`;
                    }
                    seal.replyToSender(ctx, msg, msgStr);
                } else {
                    let finalUrl = `${resultUrl}&index=0&t=${new Date().getTime()}`;
                    seal.replyToSender(ctx, msg, `[CQ:image,file=${finalUrl},cache=0]`);
                }
                if (pythonMode === 'comic' && Array.isArray(sData.comic_prompts) && sData.comic_prompts.length) {
                    let promptMsg = `【漫画分镜模型：${sData.storyboard_model || 'gpt-5.6-sol-low'}】\n`;
                    promptMsg += sData.comic_prompts.map(item => `第${item.page}页 NovelAI 提示词：\n${item.prompt}`).join('\n\n');
                    seal.replyToSender(ctx, msg, promptMsg);
                }
                
                // 保留群内已上传文件缓存，方便群友连续对不同角色执行 .风格 分析，新文件上传时将自动覆盖
                return seal.ext.newCmdExecuteResult(true);
            }
            maxRetries--;
        }
        seal.replyToSender(ctx, msg, `⚠️ 分析超时，后台可能仍在处理。`);
    } catch (e) {
        if (comicReceipt) refundComicGeneration(ctx, msg, comicReceipt);
        console.error(e);
        seal.replyToSender(ctx, msg, `❌ 脚本错误：${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
}

// --- 注册核心指令： .logai ---
const cmdLogAi = seal.ext.newCmdItemInfo();
cmdLogAi.name = 'logai';
cmdLogAi.help = '对跑团Log进行整体评分或分析PL/KP风格。支持多文件联合与文件+链接复合串联！\n用法: .logai [模型显示名] [配置名] <链接/发文件/文件编号>\n• 多文件分析: .logai 文件 1 2 或 .logai #1 #2\n• 复合串联: .logai 文件 1 <Log链接> (支持本地文件+外链一同阅读)\n• 风格分析: .logai 风格 [QQ号/角色名/@某人] [配置名] [不存档/存档] [文件编号/链接]\n• 自动存档: .自动存档 [开/关/默认] (个人开启后无视全局设置自动存档)\n• 风格档案: .logai 风格 档案 [QQ号/角色名] 或 .风格 档案 [QQ号/角色名]\n• 档案修补: .logai 风格 档案时间 [QQ号/角色名] [序号#N] <正确时间>\n• 快捷指令: .风格 [QQ号/角色名/@某人] [文件编号/链接]\n• 文件列表: .logai 文件 / .logai 文件列表\n• 文件清空: .logai 文件清空\n• 备用模型: .logai 备用模型 列表\n• 配置管理: .logai 配置 示例';
cmdLogAi.solve = async (ctx, msg, cmdArgs) => { 
    if (!requireOfficialQQBinding(ctx, msg, 'LogAI日志分析')) return seal.ext.newCmdExecuteResult(true);
    // 【拦截 .logai 配置 子指令】
    let val1 = cmdArgs.getArgN(1);
    if (['自动存档', '存档设置', '个人存档'].includes(val1)) {
        let restArgs = [];
        for (let i = 2; i <= 20; i++) {
            let a = cmdArgs.getArgN(i);
            if (a) restArgs.push(a);
            else break;
        }
        return await handleAutoArchiveCommand(ctx, msg, restArgs);
    }
    if (val1 === '风格' || val1 === '跑团风格' || val1 === '带团风格' || val1 === '玩家风格' || String(val1 || '').toLowerCase() === 'style') {
        let val2 = cmdArgs.getArgN(2);
        if (['自动存档', '存档设置', '个人存档'].includes(val2)) {
            let restArgs = [];
            for (let i = 3; i <= 20; i++) {
                let a = cmdArgs.getArgN(i);
                if (a) restArgs.push(a);
                else break;
            }
            return await handleAutoArchiveCommand(ctx, msg, restArgs);
        }
        if (['档案时间', '档案修补', '修正时间', '修补时间', '时间修补', '修改时间'].includes(val2)) {
            let restArgs = [];
            for (let i = 3; i <= 10; i++) {
                let a = cmdArgs.getArgN(i);
                if (a) restArgs.push(a);
                else break;
            }
            return await updatePlayerArchiveTimeline(ctx, msg, restArgs);
        }
        if (['档案', '成长', '历程'].includes(val2)) {
            let val3 = cmdArgs.getArgN(3);
            if (['时间', '修补', '修正', '纠偏'].includes(val3)) {
                let restArgs = [];
                for (let i = 4; i <= 10; i++) {
                    let a = cmdArgs.getArgN(i);
                    if (a) restArgs.push(a);
                    else break;
                }
                return await updatePlayerArchiveTimeline(ctx, msg, restArgs);
            }
            let target = cmdArgs.getArgN(3);
            let ident = cmdArgs.getArgN(4);
            return await queryPlayerArchive(ctx, msg, target, ident);
        }
        return await processLogTask(ctx, msg, cmdArgs, '跑团/带团风格分析', 'player_style');
    }
    if (val1 === '漫画提示词' || val1 === '漫画测试' || ['comicprompt', 'comic_prompt'].includes(String(val1 || '').toLowerCase())) return await processLogTask(ctx, msg, cmdArgs, 'LogAI漫画分镜测试', 'comic_prompt');
    if (val1 === '漫画' || String(val1 || '').toLowerCase() === 'comic') {
        return await processLogTask(ctx, msg, cmdArgs, 'LogAI短漫画', 'comic');
    }
    if (val1 === '前文回顾' || val1 === '回顾' || String(val1 || '').toLowerCase() === 'recap') {
        return await processLogTask(ctx, msg, cmdArgs, '跑团剧情与线索梳理', 'recap');
    }
    if (val1 === '文件清空' || val1 === '清空文件') {
        let groupId = compatGroupId(ctx.group.groupId);
        if (!groupId || !groupId.includes('Group')) {
            seal.replyToSender(ctx, msg, '❌ 只能在群聊中清空文件缓存。');
            return seal.ext.newCmdExecuteResult(true);
        }
        clearLogFileHistory(groupId);
        if (ctx.group && ctx.group.groupId && ctx.group.groupId !== groupId) clearLogFileHistory(ctx.group.groupId);
        seal.replyToSender(ctx, msg, '✅ 已清空当前群已缓存的 Log 文件历史。');
        return seal.ext.newCmdExecuteResult(true);
    }
    if (val1 === '文件列表' || val1 === '历史文件' || val1 === '文件状态' || val1 === '文件检测') {
        let groupId = compatGroupId(ctx.group.groupId);
        if (!groupId || !groupId.includes('Group')) {
            seal.replyToSender(ctx, msg, '❌ 群文件列表只能在群聊中查看。');
            return seal.ext.newCmdExecuteResult(true);
        }
        seal.replyToSender(ctx, msg, formatFileHistoryReply(groupId));
        return seal.ext.newCmdExecuteResult(true);
    }
    if (val1 === '文件' || val1 === '本地') {
        let val2 = cmdArgs.getArgN(2);
        // 如果没有第2个参数，或者第2个参数是 列表/查看，则展示历史文件列表
        if (!val2 || val2 === '列表' || val2 === '查看') {
            let groupId = compatGroupId(ctx.group.groupId);
            if (!groupId || !groupId.includes('Group')) {
                seal.replyToSender(ctx, msg, '❌ 群文件列表只能在群聊中查看。');
                return seal.ext.newCmdExecuteResult(true);
            }
            seal.replyToSender(ctx, msg, formatFileHistoryReply(groupId));
            return seal.ext.newCmdExecuteResult(true);
        }
    }
    if (val1 === '备用模型' || val1 === '备用') {
        let op = cmdArgs.getArgN(2);
        let cfg = getBackupModelConfig();
        if (op === '列表' || op === '查看' || !op) {
            seal.replyToSender(ctx, msg, `当前备用模型：${cfg.label}\n普通模型：${cfg.model || '服务端默认'}\nPro模型：${cfg.proModel || '服务端默认'}\n可用模型：${Object.keys(cfg.models || {}).join(', ') || cfg.label}\n骰主可用 .logai 备用模型 设置 <显示名> <普通模型ID> [Pro模型ID] 或 切换 <显示名>`);
            return seal.ext.newCmdExecuteResult(true);
        }
        if (!isDiceMaster(ctx)) {
            seal.replyToSender(ctx, msg, '❌ 只有骰主可以添加或修改备用模型。');
            return seal.ext.newCmdExecuteResult(true);
        }
        if (op === '切换') {
            let name = cmdArgs.getArgN(3);
            if (!name || !cfg.models[name]) {
                seal.replyToSender(ctx, msg, `❌ 未找到模型【${name || ''}】。可用：${Object.keys(cfg.models || {}).join(', ')}`);
                return seal.ext.newCmdExecuteResult(true);
            }
            let stored = JSON.parse(ext.storageGet('logai_backup_model') || '{}');
            stored.active = name;
            ext.storageSet('logai_backup_model', JSON.stringify(stored));
            seal.replyToSender(ctx, msg, `✅ 已切换备用模型为【${name}】`);
            return seal.ext.newCmdExecuteResult(true);
        }
        if (op === '设置' || op === '添加') {
            let label = cmdArgs.getArgN(3);
            let model = cmdArgs.getArgN(4);
            let proModel = cmdArgs.getArgN(5) || model;
            if (!label || !model) {
                seal.replyToSender(ctx, msg, '用法：.logai 备用模型 设置 <显示名> <普通模型ID> [Pro模型ID]');
                return seal.ext.newCmdExecuteResult(true);
            }
            let stored = JSON.parse(ext.storageGet('logai_backup_model') || '{}');
            stored.models = stored.models || {};
            stored.models[label.slice(0, 40)] = { label: label.slice(0, 40), model: model.slice(0, 128), proModel: proModel.slice(0, 128) };
            stored.active = label.slice(0, 40);
            ext.storageSet('logai_backup_model', JSON.stringify(stored));
            seal.replyToSender(ctx, msg, `✅ 备用模型已设置为【${label}】\n普通模型：${model}\nPro模型：${proModel}`);
            return seal.ext.newCmdExecuteResult(true);
        }
        seal.replyToSender(ctx, msg, '用法：.logai 备用模型 列表\n骰主：.logai 备用模型 添加 <显示名> <普通模型ID> [Pro模型ID]');
        return seal.ext.newCmdExecuteResult(true);
    }
    if (val1 === '配置') {
        let op = cmdArgs.getArgN(2);
        let stored = ext.storageGet('logai_custom_prompts') || '{}';
        let prompts = {};
        try { prompts = JSON.parse(stored); } catch (e) {}

        // 提取用户信息与权限 (>= 40 为群管/群主/骰主)
        let userId = compatUserId(ctx.player.userId);
        let userName = ctx.player.name;
        let isAdmin = ctx.privilegeLevel >= 100; 

        if (!op || op === '示例') {
            seal.replyToSender(ctx, msg, `【自定义分析配置说明】
你可以自由编写AI阅读Log时的要求，存为配置名随时调用。
1. 添加配置：.logai 配置 添加 <名称> <提示词...>
2. 删除配置：.logai 配置 删除 <名称>
3. 查看列表：.logai 配置 列表 [页码]
4. 查看详情：.logai 配置 查看 <名称>
5. 使用配置：.logai <名称> <网址链接 或 在群里发本地Log>

💡 示例用法：
.logai 配置 添加 吐槽机器 你是一个只会吐槽的杠精，找出下面日志里的弱智操作狠狠嘲讽。
（进阶：如果字数太多需要分页长图发，可以在提示词里要求 AI 在每段开头加上“【分页符】”这四个字）
（图表：可要求 AI 输出 logai-chart 图表块；坐标1-2项自动柱状图，3-10项自动雷达图）
.logai 配置 查看 吐槽机器
(注：每个人只能修改/删除自己创建的配置，管理员拥有所有权限)`);
            return seal.ext.newCmdExecuteResult(true);

        } else if (op === '添加') {
            let name = cmdArgs.getArgN(3);
            let contentArgs =[];
            for(let i=3; i < cmdArgs.args.length; i++) { contentArgs.push(cmdArgs.args[i]); }
            // 优先保留命令原文中的换行和 Markdown 表格；旧版解析器没有 rawArgs 时再回退拼接。
            let content = '';
            let rawCommand = String(cmdArgs.rawArgs || '');
            let rawPos = rawCommand.indexOf(String(name));
            if (rawPos >= 0) content = rawCommand.slice(rawPos + String(name).length).trim();
            if (!content) content = contentArgs.join(' ').trim();
            
            if (!name || !content) {
                seal.replyToSender(ctx, msg, `❌ 缺少名称或内容！\n示例：.logai 配置 添加 小说家 请将跑团转为小说...`);
                return seal.ext.newCmdExecuteResult(true);
            }

            let existing = prompts[name];
            if (existing) {
                // 修改已有配置：校验归属权，且不消耗每日创建配额
                let owner = typeof existing === 'string' ? '' : existing.owner;
                if (owner && owner !== userId && !isAdmin) {
                    seal.replyToSender(ctx, msg, `❌ 权限不足：配置【${name}】由其他用户创建，您无法修改它！`);
                    return seal.ext.newCmdExecuteResult(true);
                }
            } else {
                // 【新增】：创建全新配置时的防滥用限额机制
                if (!isAdmin) {
                    let dateStr = (function() {
                        let d = new Date(new Date().getTime() + 8 * 3600 * 1000);
                        return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
                    })();
                    let createLimitKey = `logai_config_create_${dateStr}_${userId}`;
                    let currentCreates = parseInt(ext.storageGet(createLimitKey) || '0');
                    
                    if (currentCreates >= 1) {
                        seal.replyToSender(ctx, msg, `❌ 抱歉，为防止恶意绕过限额，普通用户每天仅限创建 1 个全新配置。\n您今天已达上限，请明天再试，或对您的已有配置进行修改覆盖。`);
                        return seal.ext.newCmdExecuteResult(true);
                    }
                    
                    // 扣除今日的创建额度
                    ext.storageSet(createLimitKey, (currentCreates + 1).toString());
                }
            }

            prompts[name] = { content: content, owner: userId, creatorName: userName };
            ext.storageSet('logai_custom_prompts', JSON.stringify(prompts));
            seal.replyToSender(ctx, msg, `✅ 已成功保存自定义配置：【${name}】\n现在你可以直接回复含有网址或群文件的内容：\n.logai ${name} 链接`);
            return seal.ext.newCmdExecuteResult(true);
            
        } else if (op === '删除') {
            let name = cmdArgs.getArgN(3);
            let existing = prompts[name];
            
            if (existing) {
                let owner = typeof existing === 'string' ? '' : existing.owner;
                if (owner && owner !== userId && !isAdmin) {
                    seal.replyToSender(ctx, msg, `❌ 权限不足：配置【${name}】由其他用户创建，您无法删除它！`);
                    return seal.ext.newCmdExecuteResult(true);
                }
                
                delete prompts[name];
                ext.storageSet('logai_custom_prompts', JSON.stringify(prompts));
                seal.replyToSender(ctx, msg, `✅ 已删除配置：【${name}】`);
            } else {
                seal.replyToSender(ctx, msg, `❌ 库中未找到名为【${name}】的配置。`);
            }
            return seal.ext.newCmdExecuteResult(true);

        } else if (op === '列表') {
            let keys = Object.keys(prompts);
            if (keys.length === 0) {
                seal.replyToSender(ctx, msg, `当前没有保存任何自定义配置。`);
                return seal.ext.newCmdExecuteResult(true);
            } 
            
            // 获取用户输入的页码，默认为 1
            let page = parseInt(cmdArgs.getArgN(3));
            if (isNaN(page) || page < 1) page = 1;

            let pageSize = 10;
            let totalPages = Math.ceil(keys.length / pageSize);

            if (page > totalPages) page = totalPages;

            let start = (page - 1) * pageSize;
            let currentKeys = keys.slice(start, start + pageSize);

            let replyMsg = `📄 当前自定义配置列表 (第 ${page}/${totalPages} 页)：\n- ` + currentKeys.join('\n- ');
            
            if (totalPages > 1) {
                let nextPage = page < totalPages ? page + 1 : 1;
                replyMsg += `\n\n💡 翻页提示：发送 .logai 配置 列表 ${nextPage} 查看其它页`;
            }

            seal.replyToSender(ctx, msg, replyMsg);
            return seal.ext.newCmdExecuteResult(true);

        } else if (op === '查看') {
            let name = cmdArgs.getArgN(3);
            if (!name) {
                seal.replyToSender(ctx, msg, `❌ 请输入要查看的配置名称！\n示例：.logai 配置 查看 小说家`);
            } else if (prompts[name]) {
                let p = prompts[name];
                let content = typeof p === 'string' ? p : p.content;
                let creator = typeof p === 'string' ? '未知(旧版)' : p.creatorName;
                seal.replyToSender(ctx, msg, `📄 配置【${name}】 (创建者: ${creator})\n--------------------\n${content}`);
            } else {
                seal.replyToSender(ctx, msg, `❌ 库中未找到名为【${name}】的配置。`);
            }
            return seal.ext.newCmdExecuteResult(true);
        }
    }
    
    return await processLogTask(ctx, msg, cmdArgs, '跑团日志评分与吐槽', 'analyze'); 
};
ext.cmdMap['logai'] = cmdLogAi;
ext.cmdMap['评分'] = cmdLogAi;

const cmdComic = seal.ext.newCmdItemInfo();
cmdComic.name = '漫画';
cmdComic.help = '根据 Log 生成连续短漫画。\n用法：.漫画 [页数] [风格] <Log链接>；页数范围 1-10，默认 6 页。\n示例：.漫画 6 黑白 https://log.weizaima.com/?key=abcd#123456\n也可使用：.logai 漫画 6 水彩 <链接>；本地文件请先上传后再发送 .漫画 6。';
cmdComic.solve = async (ctx, msg, cmdArgs) => {
    if (!requireOfficialQQBinding(ctx, msg, 'LogAI短漫画')) return seal.ext.newCmdExecuteResult(true);
    return await processLogTask(ctx, msg, cmdArgs, 'LogAI短漫画', 'comic');
};
ext.cmdMap['漫画'] = cmdComic;
ext.cmdMap['短漫画'] = cmdComic;
ext.cmdMap['log漫画'] = cmdComic;

const cmdComicPrompt = seal.ext.newCmdItemInfo();
cmdComicPrompt.name = '漫画提示词';
cmdComicPrompt.help = '仅调用分镜模型并返回每页 NovelAI 提示词，不生成图片、不消耗漫画额度，便于调试角色一致性。\n用法：.漫画提示词 [页数] [风格] <Log链接>；也可先上传 Log 后直接使用。';
cmdComicPrompt.solve = async (ctx, msg, cmdArgs) => { if (!requireOfficialQQBinding(ctx, msg, 'LogAI漫画分镜测试')) return seal.ext.newCmdExecuteResult(true); return await processLogTask(ctx, msg, cmdArgs, 'LogAI漫画分镜测试', 'comic_prompt'); };
ext.cmdMap['漫画提示词'] = cmdComicPrompt;
ext.cmdMap['漫画测试'] = cmdComicPrompt;
ext.cmdMap['comicprompt'] = cmdComicPrompt;

const cmdRecap = seal.ext.newCmdItemInfo();
cmdRecap.name = '前文回顾';
cmdRecap.help = '梳理跑团Log的剧情进度与线索，帮助快速找回记忆。\n用法1: .前文回顾 <Log链接>\n用法2: 先在群里发个Log文件，然后输入 .前文回顾\n选项：pro, ai(关闭骰娘语气)';
cmdRecap.solve = async (ctx, msg, cmdArgs) => {
    if (!requireOfficialQQBinding(ctx, msg, 'LogAI前文回顾')) return seal.ext.newCmdExecuteResult(true);
    return await processLogTask(ctx, msg, cmdArgs, '跑团剧情与线索梳理', 'recap');
};
ext.cmdMap['前文回顾'] = cmdRecap;
ext.cmdMap['回顾'] = cmdRecap;

const cmdTokenRank = seal.ext.newCmdItemInfo();
cmdTokenRank.name = 'Token排行';
cmdTokenRank.help = `.Token排行 [天数]
生成两张图片：用户 Token 排行、模块 Token 排行与高频提示词缩略。
默认统计近 30 天；填 0 表示全部历史。`;
cmdTokenRank.solve = async (ctx, msg, cmdArgs) => {
    if (!requireOfficialQQBinding(ctx, msg, 'Token排行')) return seal.ext.newCmdExecuteResult(true);
    let rawDays = cmdArgs.getArgN(1) || '30';
    let days = /^\d+$/.test(String(rawDays)) ? Math.max(0, Math.min(3650, parseInt(rawDays))) : 30;
    seal.replyToSender(ctx, msg, `📊 正在生成${days === 0 ? '全部历史' : `近 ${days} 天`}的 Token 排行...`);
    try {
        let statsResponse = await fetch(`http://127.0.0.1:8000/api/token_stats?days=${days}&limit=15`);
        let stats = await statsResponse.json();
        if (stats.status !== 'ok') throw new Error(stats.msg || '后端没有返回用户统计');
        let nicknamePairs = await Promise.all((stats.users || []).map(async row => [String(row.key || ''), await resolveRealUserNickname(ctx, row.key)]));
        let userNames = {};
        nicknamePairs.forEach(pair => { if (pair[0] && pair[1]) userNames[pair[0]] = pair[1]; });
        let response = await fetch(`http://127.0.0.1:8000/api/token_rankings?days=${days}&limit=15`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_names: userNames })
        });
        let data = await response.json();
        if (data.status !== 'ok' || !data.id || !data.image_count) {
            throw new Error(data.msg || '后端没有生成排行图片');
        }
        let stamp = Date.now();
        let images = [];
        for (let index = 0; index < data.image_count; index++) {
            images.push(`[CQ:image,file=http://127.0.0.1:8000/api/result?id=${encodeURIComponent(data.id)}&index=${index}&t=${stamp},cache=0]`);
        }
        seal.replyToSender(ctx, msg, images.join(''));
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ Token 排行生成失败：${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['Token排行'] = cmdTokenRank;
ext.cmdMap['token排行'] = cmdTokenRank;
ext.cmdMap['Tokens排行'] = cmdTokenRank;
ext.cmdMap['AI消耗'] = cmdTokenRank;

const queryPlayerArchive = async (ctx, msg, targetInput, identityInput) => {
    let target = targetInput;
    let identity = String(identityInput || '').trim();
    if (!target) {
        let resolved = resolveUserId(ctx);
        let selfQq = String(resolved || '').replace(/^(?:QQ|OpenQQ):/i, '').trim();
        let selfName = String((ctx && ctx.player && ctx.player.name) || '').trim();
        target = /^\d{5,12}$/.test(selfQq) ? selfQq : (selfName || selfQq);
    }
    if (!target) {
        seal.replyToSender(ctx, msg, '❌ 请指定要查询的玩家 QQ 号或角色名：.风格 档案 <QQ/角色名> [pl/kp]');
        return seal.ext.newCmdExecuteResult(true);
    }
    try {
        let url = `http://127.0.0.1:8000/api/player_style_archive?target=${encodeURIComponent(target)}`;
        if (identity) {
            url += `&identity=${encodeURIComponent(identity)}`;
        }
        let resp = await fetch(url);
        let data = await resp.json();
        if (data && data.found) {
            let summaryText = (data.data && data.data.summary_text) || data.summary_text || '';
            let jobId = data.id || (data.data && data.data.id);
            let imgCount = Number(data.image_count || (data.data && data.data.image_count) || 0);

            if (jobId && imgCount > 0) {
                // 优先发送古典图书馆卷宗档案长图
                let imgCodes = [];
                for (let i = 0; i < imgCount; i++) {
                    imgCodes.push(`[CQ:image,file=http://127.0.0.1:8000/api/result?id=${jobId}&index=${i}]`);
                }
                seal.replyToSender(ctx, msg, imgCodes.join('\n'));
            } else if (summaryText) {
                seal.replyToSender(ctx, msg, summaryText);
            } else {
                seal.replyToSender(ctx, msg, '❌ 档案记录为空。');
            }
        } else {
            let roleTip = identity ? `在【${identity.toUpperCase()}】侧` : '';
            seal.replyToSender(ctx, msg, `❌ 未找到关于【${target}】${roleTip}的跑团成长档案。\n💡 提示：在开启自动存档的情况下，每次完成【.风格】分析后系统均会自动归档并更新其专属成长档案。`);
        }
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 查询玩家成长档案失败: ${e.message || e}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};

// --- 时间修补参数解析与执行函数 ---
const parseTimelineRepairArgs = (ctx, argsList) => {
    let rawTokens = [];
    for (let a of (argsList || [])) {
        let s = String(a || '').trim();
        if (s) rawTokens.push(s);
    }
    let identity = 'pl';
    let battleIdx = null;
    let filteredTokens = [];

    for (let tok of rawTokens) {
        let low = tok.toLowerCase();
        if (['pl', '玩家', 'player'].includes(low)) {
            identity = 'pl';
            continue;
        }
        if (['kp', '主持', '主持人', 'dm'].includes(low)) {
            identity = 'kp';
            continue;
        }
        // 匹配 #1, #2 或 第1场, 第2次 等显式序号 (Goja 不支持 RegExp.$1，必须使用 match 捕获组)
        let mIdx = tok.match(/^(?:#|第)?(\d+)(?:场|次)?$/);
        if (mIdx && !battleIdx) {
            let numVal = parseInt(mIdx[1], 10);
            if (tok.indexOf('#') === 0 || (numVal < 1000 && !/^\d{5,12}$/.test(tok))) {
                battleIdx = String(numVal);
                continue;
            }
        }
        filteredTokens.push(tok);
    }

    // 寻找时间轴起始位置（支持 20XX、XX-XX、XX/XX、XX~XX、至、到 等）
    let dateIdx = -1;
    let dateRegex = /(?:20\d{2}[-/.]\d{1,2}|\b\d{1,2}[-/.]\d{1,2}\b|20\d{2}年)/;
    for (let i = 0; i < filteredTokens.length; i++) {
        if (dateRegex.test(filteredTokens[i])) {
            dateIdx = i;
            break;
        }
    }

    let target = '';
    let newTimeline = '';

    if (dateIdx >= 0) {
        newTimeline = filteredTokens.slice(dateIdx).join(' ').trim();
        let preTokens = filteredTokens.slice(0, dateIdx);
        // 若前面存在未识别的纯小数字序号（如用户输入了 1 2024-03-15）
        if (!battleIdx && preTokens.length > 0) {
            for (let j = preTokens.length - 1; j >= 0; j--) {
                let m = preTokens[j].match(/^(?:#|第)?(\d+)(?:场|次)?$/);
                if (m) {
                    let n = parseInt(m[1], 10);
                    if (n < 1000) {
                        battleIdx = String(n);
                        preTokens.splice(j, 1);
                        break;
                    }
                }
            }
        }
        target = preTokens.join(' ').trim();
    } else {
        target = filteredTokens.join(' ').trim();
    }

    // 若 target 误为纯序号数字且 battleIdx 尚未设置，则纠偏
    if (!battleIdx && /^\d{1,3}$/.test(target)) {
        battleIdx = target;
        target = '';
    }

    // 规范化目标：若为空则回退为调用者自身绑定的QQ号或昵称
    if (!target) {
        let selfQq = getSenderBoundQQ(ctx);
        let selfName = String((ctx && ctx.player && ctx.player.name) || '').trim();
        target = selfQq || selfName;
    }

    return { target, battleIdx, newTimeline, identity };
};

const updatePlayerArchiveTimeline = async (ctx, msg, restArgs) => {
    let senderQQ = getSenderBoundQQ(ctx);
    let isMaster = isDiceMaster(ctx);
    if (!senderQQ && !isMaster) {
        seal.replyToSender(ctx, msg, '❌ 权限拒绝：调整档案战役仅限已绑定 QQ 号的用户使用。\n请先绑定原 QQ 号或使用真实 QQ 发送指令。');
        return seal.ext.newCmdExecuteResult(true);
    }

    let parsed = parseTimelineRepairArgs(ctx, restArgs);
    if (!parsed.newTimeline) {
        seal.replyToSender(ctx, msg, '❌ 请输入要修补的战役时间轴信息：\n用法: .风格 档案时间 [序号#N] <正确时间>\n示例: .风格 档案时间 #2 2024-03-15~2024-03-16\n示例: .风格 档案时间 2024-05-01 (省略序号默认修补最新一次战役)\n说明: 仅限已绑定 QQ 的本人调整自身档案，严禁越权调整他人档案。');
        return seal.ext.newCmdExecuteResult(true);
    }
    if (!parsed.target) {
        parsed.target = senderQQ;
    }

    // 前置防越权检查
    if (/^\d{5,12}$/.test(parsed.target) && parsed.target !== senderQQ && !isMaster) {
        seal.replyToSender(ctx, msg, `❌ 权限拒绝：你只能调整绑定了自己 QQ 号（${senderQQ}）的档案战役，无权调整他人（${parsed.target}）的档案！`);
        return seal.ext.newCmdExecuteResult(true);
    }

    try {
        let url = 'http://127.0.0.1:8000/api/player_style_archive/update_timeline';
        let resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target: parsed.target,
                new_timeline: parsed.newTimeline,
                battle_idx: parsed.battleIdx,
                identity: parsed.identity || 'pl',
                operator_qq: senderQQ || (isMaster ? 'admin' : '')
            })
        });
        let res = await resp.json();
        if (res && res.success) {
            let replyMsg = res.msg || '✅ 档案时间轴修补成功！';
            let jobId = res.id;
            let imgCount = Number(res.image_count || 0);
            if (jobId && imgCount > 0) {
                replyMsg += `\n[CQ:image,file=http://127.0.0.1:8000/api/result?id=${jobId}&index=0]`;
            }
            seal.replyToSender(ctx, msg, replyMsg);
        } else {
            seal.replyToSender(ctx, msg, `❌ 修补战役时间轴失败: ${res.msg || '未知错误'}`);
        }
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 请求修补时间轴失败: ${e.message || e}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};

const renamePlayerArchive = async (ctx, msg, restArgs) => {
    let senderQQ = getSenderBoundQQ(ctx);
    let isMaster = isDiceMaster(ctx);
    if (!senderQQ && !isMaster) {
        seal.replyToSender(ctx, msg, '❌ 权限拒绝：档案改名仅限已绑定 QQ 号的用户使用。\n请先绑定原 QQ 号或使用真实 QQ 发送指令。');
        return seal.ext.newCmdExecuteResult(true);
    }

    let target = '';
    let newName = '';
    let identity = 'pl';
    let tokens = [];

    for (let a of restArgs) {
        let low = String(a).toLowerCase().trim();
        if (['pl', '玩家', 'player'].includes(low)) {
            identity = 'pl';
        } else if (['kp', '主持', '主持人', 'dm'].includes(low)) {
            identity = 'kp';
        } else if (['all', '全部', '双重'].includes(low)) {
            identity = 'all';
        } else {
            tokens.push(a);
        }
    }

    if (tokens.length === 0) {
        seal.replyToSender(ctx, msg, '❌ 请输入要修改的档案新名字：\n用法: .档案改名 <新名字> 或 .风格 档案改名 <新名字>\n说明: 仅限已绑定 QQ 的本人修改自身档案，严禁篡改他人档案。');
        return seal.ext.newCmdExecuteResult(true);
    } else if (tokens.length === 1) {
        // 单参数形式：直接修改发送者本人的档案
        target = senderQQ || (ctx.player && ctx.player.name) || '';
        newName = tokens[0].trim();
    } else {
        target = tokens[0].trim();
        newName = tokens[1].trim();
    }

    // 前置防越权检查
    if (/^\d{5,12}$/.test(target) && target !== senderQQ && !isMaster) {
        seal.replyToSender(ctx, msg, `❌ 权限拒绝：你只能修改绑定了自己 QQ 号（${senderQQ}）的成长档案，无权修改他人（${target}）的档案！`);
        return seal.ext.newCmdExecuteResult(true);
    }

    if (!target) {
        seal.replyToSender(ctx, msg, '❌ 无法确定修改目标，请指定 QQ 号或原档案名称。');
        return seal.ext.newCmdExecuteResult(true);
    }
    if (!newName) {
        seal.replyToSender(ctx, msg, '❌ 新档案名称不能为空。');
        return seal.ext.newCmdExecuteResult(true);
    }

    try {
        let url = 'http://127.0.0.1:8000/api/player_style_archive/rename';
        let resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                target: target,
                new_name: newName,
                identity: identity,
                operator_qq: senderQQ || (isMaster ? 'admin' : '')
            })
        });
        let res = await resp.json();
        if (res && res.success) {
            let replyMsg = res.msg || `✅ 档案对象已成功更名为【${newName}】！`;
            let jobId = res.id;
            let imgCount = Number(res.image_count || 0);
            if (jobId && imgCount > 0) {
                replyMsg += `\n[CQ:image,file=http://127.0.0.1:8000/api/result?id=${jobId}&index=0]`;
            }
            seal.replyToSender(ctx, msg, replyMsg);
        } else {
            seal.replyToSender(ctx, msg, `❌ 修改档案名称失败: ${res.msg || '未知错误'}`);
        }
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 请求修改档案名称失败: ${e.message || e}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};

// --- 自动存档配置交互函数 ---
const handleAutoArchiveCommand = async (ctx, msg, restArgs) => {
    let senderQQ = getSenderBoundQQ(ctx);
    let isMaster = isDiceMaster(ctx);
    let userId = senderQQ || (ctx.player && ctx.player.userId) || '';
    let cleanUser = String(userId).replace(/^(?:QQ:|QQ-Group:|OpenQQ:)/i, '').trim();
    let userName = (ctx.player && ctx.player.name) || '用户';

    // 提取指令关键字与目标对象
    let action = '';
    let targetQQ = cleanUser;

    for (let a of (restArgs || [])) {
        let s = String(a).trim();
        let low = s.toLowerCase();
        if (['开', '开启', 'on', 'open', '1', 'true', 'enable'].includes(low)) {
            action = 'on';
        } else if (['关', '关闭', 'off', 'close', '0', 'false', 'disable'].includes(low)) {
            action = 'off';
        } else if (['默认', '清除', '重置', '跟随', 'default', 'reset'].includes(low)) {
            action = 'default';
        } else if (/^\d{5,12}$/.test(s)) {
            if (isMaster) {
                targetQQ = s;
            } else if (s !== cleanUser) {
                seal.replyToSender(ctx, msg, `❌ 权限拒绝：你只能设置绑定了自己 QQ 号（${cleanUser}）的自动存档偏好，无权修改他人！`);
                return seal.ext.newCmdExecuteResult(true);
            }
        }
    }

    if (action === 'on') {
        setUserArchivePref(targetQQ, 'on');
        let who = (targetQQ !== cleanUser && isMaster) ? `QQ【${targetQQ}】` : `【${userName} (QQ: ${targetQQ || '未绑定'})】`;
        let tip = `✅ 已为${who}开启【个人专属自动存档】！\n` +
                  `📌 规则：后续进行跑团/带团风格分析时，系统将自动归档入库并记录成长轨迹（无视全局设置）。\n` +
                  `💡 提示：若某次临时不想存档，可在指令中附带【不存档】。`;
        seal.replyToSender(ctx, msg, tip);
        return seal.ext.newCmdExecuteResult(true);
    }

    if (action === 'off') {
        setUserArchivePref(targetQQ, 'off');
        let who = (targetQQ !== cleanUser && isMaster) ? `QQ【${targetQQ}】` : `【${userName} (QQ: ${targetQQ || '未绑定'})】`;
        let tip = `🛑 已为${who}【关闭个人自动存档】。\n` +
                  `📌 规则：后续进行风格分析时默认不入库归档。\n` +
                  `💡 提示：若某次临时想要存档，可在指令中附带【存档】。`;
        seal.replyToSender(ctx, msg, tip);
        return seal.ext.newCmdExecuteResult(true);
    }

    if (action === 'default') {
        setUserArchivePref(targetQQ, 'default');
        let globalCfg = seal.ext.getBoolConfig(ext, "风格分析_启用自动存档");
        if (globalCfg === undefined) globalCfg = false;
        let gText = globalCfg ? '开启' : '关闭';
        let who = (targetQQ !== cleanUser && isMaster) ? `QQ【${targetQQ}】` : `【${userName} (QQ: ${targetQQ || '未绑定'})】`;
        let tip = `🔄 已将${who}的自动存档恢复为【跟随全局设置】（当前全局默认：${gText}）。`;
        seal.replyToSender(ctx, msg, tip);
        return seal.ext.newCmdExecuteResult(true);
    }

    // 无参数或查询：展示详细状态看板
    let globalCfg = seal.ext.getBoolConfig(ext, "风格分析_启用自动存档");
    if (globalCfg === undefined) globalCfg = false;
    let userPref = getUserArchivePref(targetQQ);

    let prefText = '跟随全局 (未单独设置)';
    if (userPref === 'on') prefText = '🟢 开启 (已开启个人专属存档，无视全局)';
    else if (userPref === 'off') prefText = '🔴 关闭 (已专属关闭)';

    let effective = false;
    if (userPref === 'on') effective = true;
    else if (userPref === 'off') effective = false;
    else effective = !!globalCfg;

    let effText = effective ? '✅ 自动存档 [生效中]' : '⏸️ 不自动存档 [生效中]';
    let gText = globalCfg ? '开' : '关';

    let card = `📋【跑团风格·自动存档状态看板】\n` +
               `• 查询对象: ${userName} (QQ: ${targetQQ || '未绑定'})\n` +
               `• 个人独立设置: ${prefText}\n` +
               `• 全局默认设置: ${gText} (骰主WebUI面板配置)\n` +
               `• 当前生效状态: ${effText}\n` +
               `------------------------\n` +
               `⚙️ 指令说明：\n` +
               `• 开启个人自动存档: .自动存档 开 (或 .风格 自动存档 开)\n` +
               `• 关闭个人自动存档: .自动存档 关 (或 .风格 自动存档 关)\n` +
               `• 恢复跟随全局默认: .自动存档 默认\n` +
               `💡 临时单次覆盖：在分析指令中加入【存档】或【不存档】即可临时覆盖。`;

    seal.replyToSender(ctx, msg, card);
    return seal.ext.newCmdExecuteResult(true);
};

// --- 注册独立指令： .风格 / .跑团风格 ---
const cmdStyle = seal.ext.newCmdItemInfo();
cmdStyle.name = '风格';
cmdStyle.help = '分析指定玩家或主持人的跑团/带团风格并给出综合评价，支持自动归档记录玩家成长轨迹。\n用法: .风格 [QQ号/@某人/角色昵称(支持多个空格或逗号分隔)] [自定义时间轴(如2024-03-15或2023-09~2023-10)] [自定义配置名] [文件编号] [不存档/存档] <链接/发文件>\n查询档案: .风格 档案 [QQ号/角色名] [pl/kp] 或 .风格 成长 [QQ号/角色名] [pl/kp] 或 .风格档案 [QQ/角色名] [pl/kp]\n修补时间: .风格 档案时间 [QQ/角色名] [序号#N] <正确时间> (仅限绑定QQ本人调整)\n档案改名: .风格 档案改名 [QQ/旧名] <新名字> 或 .档案改名 <新名字> (仅限绑定QQ本人修改)\n存档设置: .自动存档 [开/关/默认] 或 .风格 自动存档 [开/关/默认] (个人开启后无视全局设置自动存档)\n说明: 支持多链接集合、多本地群文件联合分析及【文件+链接】复合串联；自动剔除重复Log；系统自动按时间轴从早到晚严格正序排列所有日志（无时间戳成品Log支持手动指定时间轴或自动保持原序）；支持指定复合目标（如 QQ号+角色名 联合匹配，自动合并归入该QQ统一档案库）；全局默认关闭自动存档（支持使用 .自动存档 开 开启个人专属自动存档，开启后无视全局设置；单次指令也可附带 存档/不存档 临时覆盖）；分析时自动参考相邻前两次与后一次战役记录进行成长纵向对比。\n示例:\n  .风格 1120934969, 雅恩 (自动归入该QQ专属档案并绑定别名)\n  .风格 1120934969, 雅恩 2024-03-15 (为成品Log指定战役时间轴)\n  .风格 档案 1120934969, 雅恩 (调阅该QQ档案)\n  .风格 档案 1120934969 pl (单独调阅PL玩家成长档案)\n  .风格 档案 1120934969 kp (单独调阅KP主持成长档案)\n  .风格 档案时间 #2 2024-03-15~2024-03-16 (修补本人档案的第2场战役时间并重新排序)\n  .档案改名 雅恩 (直接将自己的档案对象修改为雅恩)\n  .风格 档案改名 薇拉兹·布林罗姆 雅恩 (指定旧名修改为雅恩)\n  .自动存档 开 (开启个人自动存档，无视全局默认关闭状态)\n  .风格 卡修斯 存档 (单次强制存档)\n  .风格 卡修斯 不存档 (临时分析不计入成长档案)\n  .风格 卡修斯 1 2 (联合分析群内编号 1 和 2 的两份文件)\n  .logai 文件 (查看群历史文件列表及编号)\n  .logai 文件清空 (清空群文件历史缓存)';
cmdStyle.solve = async (ctx, msg, cmdArgs) => {
    let sub = cmdArgs.getArgN(1);
    if (['自动存档', '存档设置', '个人存档'].includes(sub)) {
        let restArgs = [];
        for (let i = 2; i <= 20; i++) {
            let a = cmdArgs.getArgN(i);
            if (a) restArgs.push(a);
            else break;
        }
        return await handleAutoArchiveCommand(ctx, msg, restArgs);
    }
    if (['档案改名', '改名', '档案更名', '更名'].includes(sub)) {
        let restArgs = [];
        for (let i = 2; i <= 20; i++) {
            let a = cmdArgs.getArgN(i);
            if (a) restArgs.push(a);
            else break;
        }
        return await renamePlayerArchive(ctx, msg, restArgs);
    }
    if (['档案时间', '档案修补', '修正时间', '修补时间', '时间修补', '修改时间'].includes(sub)) {
        let restArgs = [];
        for (let i = 2; i <= 20; i++) {
            let a = cmdArgs.getArgN(i);
            if (a) restArgs.push(a);
            else break;
        }
        return await updatePlayerArchiveTimeline(ctx, msg, restArgs);
    }
    if (['档案', '成长', '历程'].includes(sub)) {
        let restArgs = [];
        for (let i = 2; i <= 20; i++) {
            let a = cmdArgs.getArgN(i);
            if (a) restArgs.push(a);
            else break;
        }

        // 检查是否包含自动存档设置 (支持 .风格 档案 自动存档 ...)
        let autoArchiveKeywords = ['自动存档', '存档设置', '个人存档'];
        let idxAutoArchive = restArgs.findIndex(tok => autoArchiveKeywords.includes(String(tok).toLowerCase()));
        if (idxAutoArchive >= 0) {
            let clean = restArgs.slice(0, idxAutoArchive).concat(restArgs.slice(idxAutoArchive + 1));
            return await handleAutoArchiveCommand(ctx, msg, clean);
        }

        // 检查是否包含改名相关指令 (支持 .风格 档案 [目标] 改名 <新名> 或 .风格 档案 改名 ...)
        let renameKeywords = ['改名', '更名', '重命名', '档案改名'];
        let idxRename = restArgs.findIndex(tok => renameKeywords.includes(String(tok).toLowerCase()));
        if (idxRename >= 0) {
            let clean = restArgs.slice(0, idxRename).concat(restArgs.slice(idxRename + 1));
            return await renamePlayerArchive(ctx, msg, clean);
        }

        // 检查是否包含时间修补相关指令 (支持 .风格 档案 [目标] 时间 #1 <新时间> 或 .风格 档案 时间 ...)
        let timeKeywords = ['时间', '修补', '修正', '纠偏', '档案时间', '修补时间', '修改时间'];
        let idxTime = restArgs.findIndex(tok => timeKeywords.includes(String(tok).toLowerCase()));
        if (idxTime >= 0) {
            let clean = restArgs.slice(0, idxTime).concat(restArgs.slice(idxTime + 1));
            return await updatePlayerArchiveTimeline(ctx, msg, clean);
        }

        let identity = '';
        let targetTokens = [];
        for (let a of restArgs) {
            let low = a.toLowerCase();
            if (['pl', '玩家', 'player'].includes(low)) {
                identity = 'pl';
            } else if (['kp', '主持', '主持人', 'dm', '守秘人', '带团'].includes(low)) {
                identity = 'kp';
            } else {
                targetTokens.push(a);
            }
        }
        if (!identity) {
            let cmdName = String((cmdArgs && cmdArgs.command) || '').trim().toLowerCase();
            if (['带团风格', 'kp风格', '主持风格', '带团'].includes(cmdName)) {
                identity = 'kp';
            } else if (['玩家风格', 'pl风格'].includes(cmdName)) {
                identity = 'pl';
            }
        }
        let target = targetTokens.join(' ').trim();
        return await queryPlayerArchive(ctx, msg, target, identity);
    }
    if (!requireOfficialQQBinding(ctx, msg, 'Log风格分析')) return seal.ext.newCmdExecuteResult(true);
    return await processLogTask(ctx, msg, cmdArgs, '跑团/带团风格分析', 'player_style');
};

ext.cmdMap['风格'] = cmdStyle;
ext.cmdMap['跑团风格'] = cmdStyle;
ext.cmdMap['带团风格'] = cmdStyle;
ext.cmdMap['玩家风格'] = cmdStyle;
ext.cmdMap['kp风格'] = cmdStyle;
ext.cmdMap['pl风格'] = cmdStyle;
ext.cmdMap['主持风格'] = cmdStyle;

// --- 注册独立指令： .风格档案 / .成长档案 / .kp档案 / .pl档案 / .主持档案 / .带团档案 ---
const cmdStyleArchive = seal.ext.newCmdItemInfo();
cmdStyleArchive.name = '风格档案';
cmdStyleArchive.help = '查询玩家或主持人的历史跑团/带团风格成长档案。\n用法: .风格档案 [QQ号/角色名(支持复合输入)] [pl/kp] 或 .成长档案 [QQ号/角色名] [pl/kp] 或 .kp档案 [QQ/角色名] 或 .pl档案 [QQ/角色名] 或 .主持档案 [QQ/角色名]\n说明: 查询玩家历次风格分析的评级走势、风味称号与能力雷达演变。支持 pl / kp 独立查询或双轨总览。';
cmdStyleArchive.solve = async (ctx, msg, cmdArgs) => {
    let cmdName = String((cmdArgs && cmdArgs.command) || '').trim().toLowerCase();
    let restArgs = [];
    for (let i = 1; i <= 20; i++) {
        let a = cmdArgs.getArgN(i);
        if (a) restArgs.push(a);
        else break;
    }
    let identity = '';
    if (['kp档案', '主持档案', '带团档案', 'kp成长', '主持成长'].includes(cmdName)) {
        identity = 'kp';
    } else if (['pl档案', '玩家档案', 'pl成长', '玩家成长'].includes(cmdName)) {
        identity = 'pl';
    }
    let targetTokens = [];
    for (let a of restArgs) {
        let low = a.toLowerCase();
        if (['pl', '玩家', 'player'].includes(low)) {
            identity = 'pl';
        } else if (['kp', '主持', '主持人', 'dm', '守秘人', '带团'].includes(low)) {
            identity = 'kp';
        } else {
            targetTokens.push(a);
        }
    }
    let target = targetTokens.join(' ').trim();
    return await queryPlayerArchive(ctx, msg, target, identity);
};
ext.cmdMap['风格档案'] = cmdStyleArchive;
ext.cmdMap['成长档案'] = cmdStyleArchive;
ext.cmdMap['档案'] = cmdStyleArchive;
ext.cmdMap['kp档案'] = cmdStyleArchive;
ext.cmdMap['pl档案'] = cmdStyleArchive;
ext.cmdMap['主持档案'] = cmdStyleArchive;
ext.cmdMap['带团档案'] = cmdStyleArchive;

// --- 注册独立指令： .档案时间 / .修补档案 ---
const cmdTimelineRepair = seal.ext.newCmdItemInfo();
cmdTimelineRepair.name = '档案时间';
cmdTimelineRepair.help = '修补玩家成长档案中某场战役的时间跨度，并自动重新时序排序与刷新卷宗长图。\n用法: .档案时间 [QQ号/角色名] [战役序号#N] <正确时间(如 2024-03-15 或 2023-09~2023-10)> [pl/kp]\n说明: 仅限已绑定 QQ 的本人调整自身档案，严禁篡改他人档案。\n示例: .档案时间 #2 2024-03-15~2024-03-16 (修补本人档案的第2场战役时间)\n示例: .档案时间 1120934969 #2 2024-03-15~2024-03-16\n示例: .档案时间 雅恩 2024-05-01 (省略序号默认修补最新一次战役)';
cmdTimelineRepair.solve = async (ctx, msg, cmdArgs) => {
    let restArgs = [];
    for (let i = 1; i <= 20; i++) {
        let a = cmdArgs.getArgN(i);
        if (a) restArgs.push(a);
        else break;
    }
    return await updatePlayerArchiveTimeline(ctx, msg, restArgs);
};
ext.cmdMap['档案时间'] = cmdTimelineRepair;
ext.cmdMap['档案修补'] = cmdTimelineRepair;
ext.cmdMap['修补档案'] = cmdTimelineRepair;
ext.cmdMap['修正时间'] = cmdTimelineRepair;

// --- 注册独立指令： .档案改名 / .风格改名 ---
const cmdArchiveRename = seal.ext.newCmdItemInfo();
cmdArchiveRename.name = '档案改名';
cmdArchiveRename.help = '修改玩家成长档案中的归档对象名称，原名称将自动归入别名库，并自动刷新卷宗长图。\n用法: .档案改名 [QQ号/旧名] <新名字> [pl/kp] 或 .风格改名 [QQ号/旧名] <新名字>\n说明: 仅限已绑定 QQ 的本人修改自身档案，严禁篡改他人档案。\n示例: .档案改名 雅恩 (直接将自己的档案归档对象修改为 雅恩)\n示例: .档案改名 薇拉兹·布林罗姆 雅恩 (指定旧名或QQ修改为 雅恩)';
cmdArchiveRename.solve = async (ctx, msg, cmdArgs) => {
    let restArgs = [];
    for (let i = 1; i <= 20; i++) {
        let a = cmdArgs.getArgN(i);
        if (a) restArgs.push(a);
        else break;
    }
    return await renamePlayerArchive(ctx, msg, restArgs);
};
ext.cmdMap['档案改名'] = cmdArchiveRename;
ext.cmdMap['风格改名'] = cmdArchiveRename;
ext.cmdMap['改名档案'] = cmdArchiveRename;

// --- 注册独立指令： .自动存档 / .存档设置 / .风格自动存档 ---
const cmdAutoArchive = seal.ext.newCmdItemInfo();
cmdAutoArchive.name = '自动存档';
cmdAutoArchive.help = '查询或设置个人跑团风格自动存档偏好。\n用法: .自动存档 [开/关/默认]\n别名: .存档设置 / .风格 自动存档\n说明: 个人设置【开】后无视全局设置自动开启存档入库；单次分析时加入【不存档】或【存档】可临时覆盖。';
cmdAutoArchive.solve = async (ctx, msg, cmdArgs) => {
    let restArgs = [];
    for (let i = 1; i <= 20; i++) {
        let a = cmdArgs.getArgN(i);
        if (a) restArgs.push(a);
        else break;
    }
    return await handleAutoArchiveCommand(ctx, msg, restArgs);
};
ext.cmdMap['自动存档'] = cmdAutoArchive;
ext.cmdMap['存档设置'] = cmdAutoArchive;
ext.cmdMap['风格自动存档'] = cmdAutoArchive;
ext.cmdMap['个人存档'] = cmdAutoArchive;

// --- 注册独立指令： .文件 / .文件列表 / .历史文件 ---
const cmdFileList = seal.ext.newCmdItemInfo();
cmdFileList.name = '文件';
cmdFileList.help = '查看群内已记录的 Log 文件列表及编号。\n用法: .文件 或 .文件列表\n清空历史: .logai 文件清空';
cmdFileList.solve = async (ctx, msg, cmdArgs) => {
    let val1 = cmdArgs.getArgN(1);
    if (val1 && (val1 === '清空' || val1 === '删除')) {
        let groupId = compatGroupId(ctx.group.groupId);
        if (!groupId || !groupId.includes('Group')) {
            seal.replyToSender(ctx, msg, '❌ 只能在群聊中清空文件缓存。');
            return seal.ext.newCmdExecuteResult(true);
        }
        clearLogFileHistory(groupId);
        if (ctx.group && ctx.group.groupId && ctx.group.groupId !== groupId) clearLogFileHistory(ctx.group.groupId);
        seal.replyToSender(ctx, msg, '✅ 已清空当前群已缓存的 Log 文件历史。');
        return seal.ext.newCmdExecuteResult(true);
    }
    if (val1 && /^\d+/.test(val1)) {
        return await processLogTask(ctx, msg, cmdArgs, '跑团日志评分与吐槽', 'analyze');
    }
    let groupId = compatGroupId(ctx.group.groupId);
    if (!groupId || !groupId.includes('Group')) {
        seal.replyToSender(ctx, msg, '❌ 群文件列表只能在群聊中查看。');
        return seal.ext.newCmdExecuteResult(true);
    }
    seal.replyToSender(ctx, msg, formatFileHistoryReply(groupId));
    return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['文件'] = cmdFileList;
ext.cmdMap['文件列表'] = cmdFileList;
ext.cmdMap['历史文件'] = cmdFileList;

