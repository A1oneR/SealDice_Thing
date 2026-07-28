// ==UserScript==
// @name         人工智障Log分析器
// @author       Air, Gemini
// @version      2.2.8
// @description  分析跑团Log日志或进行前文回顾。支持日志链接以及本地群文件上传分析！
// @timestamp    1766873593
// @license      Apache-2.0
// ==/UserScript==

let ext = seal.ext.find('log-analyzer');
if (!ext) {
  ext = seal.ext.new('log-analyzer', 'Air', '2.2.8');
  seal.ext.register(ext);
}

// === 新增：骰娘人设系统配置 ===
seal.ext.registerBoolConfig(ext, "启用骰娘人设", false, "开启后，AI分析将带入下方设定的骰娘语气。关闭则使用原版专业AI语气。");
seal.ext.registerStringConfig(ext, "常规模式_骰娘设定", "你是一个严厉老练的骰娘，说话犀利，对逻辑存在硬伤的模组绝不留情，像个严肃的调查员前辈。", "普通分析模式下的AI扮演提示词");
seal.ext.registerStringConfig(ext, "温柔模式_骰娘设定", "你是一个温柔可爱的骰娘，总是鼓励模组作者，指出缺点时也会非常委婉，语气软萌。", "使用'温柔'参数时的AI扮演提示词");

seal.ext.registerStringConfig(ext, "OneBot_API_地址", "http://127.0.0.1:34567", "Bot客户端的HTTP监听地址");
seal.ext.registerStringConfig(ext, "支持的文件后缀", ".doc,.docx,.txt,.pdf,.md,.json,.yaml,.log", "用逗号分隔");

// === 新增：钱包保护 - Pro 模式限额配置 ===
seal.ext.registerIntConfig(ext, "每日Pro全局限额", 30, "每天所有群合计最多能使用多少次Pro模式（0为禁用，-1为无限）");
seal.ext.registerIntConfig(ext, "每日单人Pro限额", 3, "每天每个普通用户最多能使用多少次Pro模式（-1为无限，管理员不受限）");

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
    } catch (e) { return { label: '备用模型', model: '', proModel: '', active: '备用模型', models: {} }; }
}
function isDiceMaster(ctx) { return !!ctx && Number(ctx.privilegeLevel || 0) >= 100; }
function selectBackupModel(cfg, args) {
    let requested = args.find(a => cfg.models && cfg.models[a]);
    if (requested) {
        let item = cfg.models[requested] || {};
        return { label: item.label || requested, model: item.model || '', proModel: item.proModel || '', selected: requested };
    }
    return { label: cfg.label, model: cfg.model, proModel: cfg.proModel, selected: cfg.active };
}

// 与已验证可用的 FUT 角色卡、人物卡评分插件保持同一套文件捕获写法。
function saveLastLogFile(groupId, file) {
    if (!groupId || !file) return;
    let filename = file.name || "";
    if (!filename) return;

    let allowedExts = seal.ext.getStringConfig(ext, "支持的文件后缀").split(',');
    let isAllowed = allowedExts.some(suffix => filename.toLowerCase().endsWith(suffix.trim().toLowerCase()));
    if (!isAllowed) return;

    let fileInfo = {
        name: filename,
        file_id: file.id || file.file_id || "",
        busid: file.busid || 0,
        size: file.size || file.file_size || 0,
        timestamp: new Date().getTime()
    };
    if (!fileInfo.file_id) return;
    ext.storageSet(`log_last_file_${groupId}`, JSON.stringify(fileInfo));
}

// 路径1：标准群文件上传回调
ext.onGroupUpload = (ctx, msg, file) => {
    saveLastLogFile(msg.groupId, file);
};

// 路径2：新版常见情况，文件作为普通群消息里的 CQ:file 上报
ext.onNotCommandReceived = (ctx, msg) => {
    if (!msg || !msg.groupId || !msg.message) return;
    if (!msg.message.includes("[CQ:file,")) return;

    let m = msg.message.match(/\[CQ:file,([^\]]+)\]/);
    if (!m || !m[1]) return;

    let params = {};
    m[1].split(",").forEach(seg => {
        let p = seg.indexOf("=");
        if (p <= 0) return;
        let k = seg.slice(0, p).trim();
        let v = seg.slice(p + 1).trim();
        params[k] = v;
    });

    let file = {
        id: params.file_id || "",
        name: params.file || "",
        size: parseInt(params.file_size || "0", 10) || 0,
        busid: params.busid || 0
    };
    saveLastLogFile(msg.groupId, file);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 辅助函数：稳健读取 JSON，避免服务端偶发返回纯文本导致直接崩溃
async function safeFetchJson(url, options, tag) {
    const resp = await fetch(url, options);
    const text = await resp.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        const preview = text.length > 160 ? (text.slice(0, 160) + "...") : text;
        throw new Error(`${tag} 返回非JSON: ${preview}`);
    }
}

async function resolveLogFileDownloadUrl(onebotApiUrl, onebotGroupId, fileData) {
    const du = (fileData && fileData.direct_url) ? String(fileData.direct_url).trim() : "";
    if (du && /^https?:\/\//i.test(du)) return du;
    try {
        const urlJson = await safeFetchJson(
            `${onebotApiUrl}/get_group_file_url`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ group_id: onebotGroupId, file_id: fileData.file_id, busid: fileData.busid || 0 })
            },
            "获取群文件链接"
        );
        if (urlJson && urlJson.data && urlJson.data.url) return String(urlJson.data.url);
    } catch (e) {
        console.error("[logai] get_group_file_url:", e);
    }
    return "";
}

// --- 核心调度函数 ---
// --- 核心调度函数 ---
async function processLogTask(ctx, msg, cmdArgs, modeName, pythonMode) {
    let args = (cmdArgs.args || []).filter(a => typeof a === 'string' && a.trim() !== '');

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

    let backupCfg = getBackupModelConfig();
    backupCfg = selectBackupModel(backupCfg, args);
    let fallbackToDSPro = false;
    let isPro = args.some(a => a.toLowerCase() === 'pro');
    let isKind = args.some(a => a.includes('温柔') || a.toLowerCase() === 'kind');
    let isAI = args.some(a => a.toLowerCase() === 'ai' || a === '原版' || a === '专业');
    let isDS = args.some(a => ['ds', 'deepseek', 'backup', '备用', '备用模型'].includes(a.toLowerCase()));
    if (backupCfg.selected && args.some(a => a === backupCfg.selected)) isDS = true;

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

    // ================= 核心：钱包保护逻辑 =================
    // 获取东八区今天的日期字符串 (例如 "2026-3-19")
    let dateStr = (function() {
        let d = new Date(new Date().getTime() + 8 * 3600 * 1000);
        return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
    })();
    let globalKey = `logai_pro_usage_${dateStr}_global`;
    let userKey = `logai_pro_usage_${dateStr}_${ctx.player.userId}`;

    if (isPro) {
        let globalLimit = seal.ext.getIntConfig(ext, "每日Pro全局限额");
        let userLimit = seal.ext.getIntConfig(ext, "每日单人Pro限额");
        let isAdmin = ctx.privilegeLevel >= 100; // 大于等于 40 为群管/群主/骰主

        if (globalLimit === 0) {
            seal.replyToSender(ctx, msg, '❌ 抱歉，Pro 模式目前已被骰主禁用，请去除 pro 参数使用普通模式。');
            return seal.ext.newCmdExecuteResult(true);
        }

        let globalUsage = parseInt(ext.storageGet(globalKey) || '0');
        let userUsage = parseInt(ext.storageGet(userKey) || '0');

        if (globalLimit > 0 && globalUsage >= globalLimit && !isAdmin) {
            seal.replyToSender(ctx, msg, `❌ 抱歉，今日机器人的 Pro 模式全局额度（${globalLimit}次）已耗尽，请明日再试或使用普通模式。`);
            return seal.ext.newCmdExecuteResult(true);
        }
        if (userLimit > 0 && userUsage >= userLimit && !isAdmin) {
            seal.replyToSender(ctx, msg, `❌ 抱歉，您今日的 Pro 模式额度（${userLimit}次）已达上限，请明日再试或使用普通模式。`);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 预扣除额度
        ext.storageSet(globalKey, (globalUsage + 1).toString());
        ext.storageSet(userKey, (userUsage + 1).toString());
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
    let excludeList =['pro', 'kind', '温柔', '本地', '文件', 'ai', '原版', '专业', '赛博风', '赛博', '历史风', '历史', '古风', '简约风', '简约', '白底', '克苏鲁', '克苏鲁风', '深潜', '废土', '废土风', '末日', '末日风', '二次元', '二次元风', '萌系', '终端', '终端风', '黑客', '经典', '经典风', 'ds', 'deepseek', 'backup', '备用', '备用模型'];
    Object.keys(getBackupModelConfig().models || {}).forEach(name => excludeList.push(name));
    if (customName) excludeList.push(customName); 
    
    // 找出那个唯一剩下的包含链接的内容
    let targetStr = args.find(a => !excludeList.includes(a) && !excludeList.includes(a.toLowerCase()));
    let useLocalFile = !targetStr;

    let apiUrl = "";
    let logKeyForMsg = "";

    // 组装 POST 数据载荷，加入自定义提示词
    let payload = {
        mode: pythonMode,
        pro: isPro,
        kind: isKind,
        persona: personaStr,
        custom_prompt: customPromptContent,
        theme: theme   // 新增传给后端的风格
    };

    if (useLocalFile) {
        let groupId = ctx.group.groupId;
        if (!groupId.includes('Group')) {
            seal.replyToSender(ctx, msg, '❌ 本地文件分析功能只能在群聊中使用。');
            return seal.ext.newCmdExecuteResult(true);
        }
        let fileDataStr = ext.storageGet(`log_last_file_${groupId}`);
        if (!fileDataStr) {
            seal.replyToSender(ctx, msg, '❌ 当前群没有检测到新上传的文件。请先往群里发送 Log 文件！');
            return seal.ext.newCmdExecuteResult(true);
        }
        let fileData = JSON.parse(fileDataStr);
        logKeyForMsg = fileData.name;

        let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
        if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);
        let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));

        let downloadUrl = await resolveLogFileDownloadUrl(onebotApiUrl, onebotGroupId, fileData);
        if (!downloadUrl) {
            seal.replyToSender(ctx, msg, `❌ 获取群文件下载链接失败（NapCat 等可依赖消息内 CQ:file 的 url，请确认已发带直链的文件消息）。`);
            return seal.ext.newCmdExecuteResult(true);
        }

        apiUrl = `http://127.0.0.1:8000/api/submit_file`;
        payload.url = downloadUrl;
        payload.filename = fileData.name;
        payload.mode = pythonMode === 'analyze' ? 'log_analyze' : 'log_recap';

    } else {
        let val = targetStr;
        let logKey = '';
        const urlMatch = val.match(/https?:\/\/[^\s\]"']+/);
        if (urlMatch) val = urlMatch[0];

        if (val.includes('s3=')) {
            const m = val.match(/[?&]s3=([^&#]+)/);
            if (m) { logKey = m[1]; payload.source = 'kokona'; }
        } else if (val.includes('key=')) {
            const k = val.match(/[?&]key=([^&#]+)/);
            if (k) { logKey = k[1]; payload.source = 'weizaima'; }
            const p = val.match(/#([^?&\s]+)/);
            if (p) payload.password = p[1];
        } else if (val.includes('#')) {
            const parts = val.split('#');
            if (parts.length > 1) {
                logKey = parts[parts.length - 1].replace(/[^a-zA-Z0-9-_]/g, '');
                if (logKey.includes('-')) payload.source = 'trpgbot';
            }
        } else {
            logKey = val;
        }

        if (!logKey) {
            seal.replyToSender(ctx, msg, '❌ 无法解析 Log 链接。');
            return seal.ext.newCmdExecuteResult(true);
        }
        
        logKeyForMsg = logKey;
        apiUrl = `http://127.0.0.1:8000/api/submit`;
        payload.key = logKey;
    }

    if (customName) {
        modeName = `自定义配置[${customName}]`;
    }

    let modeMsg = usePersona ? " [骰娘人设]" : (isAI ? " [纯净AI]" : "");
    if (useLocalFile) modeMsg += "[本地文件]";
    if (fallbackToDSPro) modeMsg += `\n[⚠️ 高级Pro额度耗尽，已自动切换至${backupCfg.label}模型继续服务！]`;
    else if (isDS) modeMsg += (isPro ? ` [${backupCfg.label} Pro]` : ` [${backupCfg.label}]`);
    else if (isPro) modeMsg += " [Pro模式]";

    payload.ds = isDS;
    payload.backup_label = backupCfg.label;
    payload.backup_model = isPro && backupCfg.proModel ? backupCfg.proModel : backupCfg.model;

    seal.replyToSender(ctx, msg, `已提交请求，正在阅读【${logKeyForMsg}】并执行【${modeName}】${modeMsg} (请稍候)...`);

    try {
        let data = await safeFetchJson(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }, "提交分析任务");
        
        if (data.status !== 'ok') {
            // 【新增】：如果提交给 Python 后端失败了（没扣费），把刚才预扣的额度退回给用户
            if (isPro) {
                let g = parseInt(ext.storageGet(globalKey) || '1');
                let u = parseInt(ext.storageGet(userKey) || '1');
                ext.storageSet(globalKey, Math.max(0, g - 1).toString());
                ext.storageSet(userKey, Math.max(0, u - 1).toString());
            }
            seal.replyToSender(ctx, msg, `❌ 提交失败：${JSON.stringify(data)}`);
            return seal.ext.newCmdExecuteResult(true);
        }

        let jobId = data.id;
        let checkUrl = `http://127.0.0.1:8000/api/status?id=${jobId}`;
        let resultUrl = `http://127.0.0.1:8000/api/result?id=${jobId}`;

        let maxRetries = 90;
        while (maxRetries > 0) {
            await sleep(2000);
            let sData = await safeFetchJson(checkUrl, undefined, "查询任务状态");
            
            if (sData.status === 'done' || sData.status === 'error') {
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
                
                if (useLocalFile) ext.storageSet(`log_last_file_${ctx.group.groupId}`, "");
                return seal.ext.newCmdExecuteResult(true);
            }
            maxRetries--;
        }
        seal.replyToSender(ctx, msg, `⚠️ 分析超时，后台可能仍在处理。`);
    } catch (e) {
        console.error(e);
        seal.replyToSender(ctx, msg, `❌ 脚本错误：${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
}

// --- 注册核心指令： .logai ---
const cmdLogAi = seal.ext.newCmdItemInfo();
cmdLogAi.name = 'logai';
cmdLogAi.help = '对跑团Log进行整体评分。\n用法: .logai [模型显示名] [配置名] <链接/发文件>\n已注册模型可用 .logai 备用模型 列表 查看；旧别名 ds/deepseek 仍兼容。\n配置管理请使用 .logai 配置 示例';
cmdLogAi.solve = async (ctx, msg, cmdArgs) => { 
    // 【拦截 .logai 配置 子指令】
    let val1 = cmdArgs.getArgN(1);
    if (val1 === '文件状态' || val1 === '文件检测') {
        let groupId = ctx.group.groupId;
        if (!groupId || !groupId.includes('Group')) {
            seal.replyToSender(ctx, msg, '❌ 文件状态只能在群聊中查看。');
            return seal.ext.newCmdExecuteResult(true);
        }
        let fileDataStr = ext.storageGet(`log_last_file_${groupId}`);
        if (!fileDataStr) {
            seal.replyToSender(ctx, msg, '❌ 当前群尚未捕获到支持的文件。');
            return seal.ext.newCmdExecuteResult(true);
        }
        try {
            let fileData = JSON.parse(fileDataStr);
            seal.replyToSender(ctx, msg, `✅ 已捕获文件\n名称：${fileData.name}\nfile_id：${fileData.file_id ? '存在' : '缺失'}\nbusid：${fileData.busid || 0}\n大小：${fileData.size || 0}`);
        } catch (e) {
            seal.replyToSender(ctx, msg, '❌ 已捕获的文件信息无法解析，请重新上传文件。');
        }
        return seal.ext.newCmdExecuteResult(true);
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
        let userId = ctx.player.userId;
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
.logai 配置 查看 吐槽机器
(注：每个人只能修改/删除自己创建的配置，管理员拥有所有权限)`);
            return seal.ext.newCmdExecuteResult(true);

        } else if (op === '添加') {
            let name = cmdArgs.getArgN(3);
            let contentArgs =[];
            for(let i=3; i < cmdArgs.args.length; i++) { contentArgs.push(cmdArgs.args[i]); }
            let content = contentArgs.join(' ').trim();
            
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

const cmdRecap = seal.ext.newCmdItemInfo();
cmdRecap.name = '前文回顾';
cmdRecap.help = '梳理跑团Log的剧情进度与线索，帮助快速找回记忆。\n用法1: .前文回顾 <Log链接>\n用法2: 先在群里发个Log文件，然后输入 .前文回顾\n选项：pro, ai(关闭骰娘语气)';
cmdRecap.solve = async (ctx, msg, cmdArgs) => { return await processLogTask(ctx, msg, cmdArgs, '跑团剧情与线索梳理', 'recap'); };
ext.cmdMap['前文回顾'] = cmdRecap;
ext.cmdMap['回顾'] = cmdRecap;
