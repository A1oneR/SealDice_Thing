// ==UserScript==
// @name         人工智障模组分析器(修复版)
// @author       Air, Cursor
// @version      1.2.3
// @description  识别上传的模组文件，使用 .模组分析 指令进行解读。
// @timestamp    1700000010
// @license      MIT
// ==/UserScript==

let ext = seal.ext.find('file-analyzer');
if (!ext) {
  ext = seal.ext.new('file-analyzer', 'Air', '1.2.3');
  seal.ext.register(ext);
}

// --- 配置项 ---
// === 新增：骰娘人设系统配置 ===
seal.ext.registerBoolConfig(ext, "启用骰娘人设", false, "开启后，模组分析将带入下方设定的骰娘语气。");
seal.ext.registerStringConfig(ext, "常规模式_骰娘设定", "你是一个严厉老练的骰娘，说话犀利，对逻辑存在硬伤的模组绝不留情，像个严肃的调查员前辈。", "普通分析模式下的AI扮演提示词");
seal.ext.registerStringConfig(ext, "温柔模式_骰娘设定", "你是一个温柔可爱的骰娘，总是鼓励模组作者，指出缺点时也会非常委婉，语气软萌。", "使用'温柔'参数时的AI扮演提示词");
seal.ext.registerStringConfig(ext, "支持的文件后缀", ".doc,.docx,.txt,.pdf,.md,.json,.yaml", "用逗号分隔");
// 关键修复：添加 OneBot HTTP API 地址配置
seal.ext.registerStringConfig(ext, "OneBot_API_地址", "http://127.0.0.1:34567", "Bot客户端(Lagrange/LLOneBot/GOCQ)的HTTP监听地址，末尾不要带斜杠");
// 上传群文件用的HTTP客户端地址
seal.ext.registerStringConfig(ext, "HTTP客户端地址", "http://127.0.0.1:34567", "用于上传群文件，填写LLOneBot/GOCQ等客户端的HTTP监听地址");

// === 新增：钱包保护 - Pro 模式限额配置 ===
seal.ext.registerIntConfig(ext, "每日Pro全局限额", 30, "每天所有群合计最多能使用多少次Pro模式（0为禁用，-1为无限）");
seal.ext.registerIntConfig(ext, "每日单人Pro限额", 3, "每天每个普通用户最多能使用多少次Pro模式（-1为无限，管理员不受限）");

// 辅助函数：等待
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
function requireOfficialQQBinding(ctx, msg, featureName) {
    const userId = String(ctx && ctx.player && ctx.player.userId || '');
    if (!/^OpenQQ(?::|CH:)/.test(userId)) return true;
    const api = globalThis.SealOfficialQQIdentityBridge;
    if (api && typeof api.requireUserBinding === 'function') return api.requireUserBinding(ctx, msg, featureName);
    seal.replyToSender(ctx, msg, `${featureName || '该功能'}需要先绑定原QQ号。\n请先加载QQ官方Bot昵称桥接插件，再发送：.QQ绑定 <原QQ号>`);
    return false;
}

// NapCat 等会在 CQ:file 末尾带 url=直链（URL 内可能有逗号），不能用简单 split
function parseCQFileInner(inner) {
    const params = {};
    if (!inner) return params;
    let s = inner.trim();
    const mUrl = s.match(/\burl=(.+)$/);
    if (mUrl) {
        params.url = mUrl[1].trim();
        s = s.slice(0, mUrl.index).replace(/,\s*$/, "");
    }
    s.split(",").forEach((seg) => {
        const p = seg.indexOf("=");
        if (p <= 0) return;
        const k = seg.slice(0, p).trim();
        const v = seg.slice(p + 1).trim();
        if (k && k !== "url") params[k] = v;
    });
    return params;
}

async function safeFetchJson(url, options, tag) {
    const resp = await fetch(url, options);
    const text = await resp.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        const preview = text.length > 160 ? text.slice(0, 160) + "..." : text;
        throw new Error(`${tag} 返回非JSON: ${preview}`);
    }
}

async function resolveRealUserNickname(ctx, userId) {
    const resolvedUserId = compatUserId(userId);
    const id = String(resolvedUserId || '').replace(/^QQ:/, '');
    if (!id) return '';
    if (!/^\d+$/.test(id)) {
        const currentId = compatUserId(ctx && ctx.player && ctx.player.userId);
        return currentId === resolvedUserId && ctx && ctx.player ? String(ctx.player.name || '').trim() : '';
    }
    try {
        let api = seal.ext.getStringConfig(ext, "OneBot_API_地址") || '';
        api = api.replace(/\/$/, '');
        const result = await safeFetchJson(`${api}/get_stranger_info`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: /^\d+$/.test(id) ? parseInt(id, 10) : id, no_cache: true })
        }, '获取用户真实昵称');
        return String((result && result.data && (result.data.nickname || result.data.nick)) || '').trim();
    } catch (e) {
        console.warn('[模组分析] 获取真实昵称失败:', e);
        return '';
    }
}

async function resolveModuleFileDownloadUrl(onebotApiUrl, onebotGroupId, fileData) {
    const du = fileData && fileData.direct_url ? String(fileData.direct_url).trim() : "";
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
        console.error("[模组分析] get_group_file_url:", e);
    }
    return "";
}

// --- 统一的文件处理底层函数 ---
async function processModuleFile(ctx, msg, cmdArgs, modeName, pythonMode) {
    let groupId = compatGroupId(ctx.group.groupId);
    let userId = compatUserId(ctx.player.userId);
    if (!groupId.includes('Group')) {
        seal.replyToSender(ctx, msg, '❌ 请在群聊中使用此功能。');
        return true;
    }

    let args = cmdArgs.args;

    // 1. 获取并解析存储中的自定义配置库
    let stored = ext.storageGet('module_custom_prompts') || '{}';
    let customPrompts = {};
    try { customPrompts = JSON.parse(stored); } catch (e) {}

    let customPromptContent = "";
    let customName = "";

    // 扫描群友的参数中，是否包含已保存的自定义配置名
    for (let i = 0; i < args.length; i++) {
        if (customPrompts[args[i]]) {
            customName = args[i];
            let p = customPrompts[args[i]];
            customPromptContent = typeof p === 'string' ? p : p.content;
            break;
        }
    }

    let isPro = args.some(a => a.toLowerCase() === 'pro');
    let isKind = args.some(a => a.includes('温柔') || a.toLowerCase() === 'kind');
    let isAI = args.some(a => a.toLowerCase() === 'ai' || a === '原版' || a === '专业');

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
    let userKey = `logai_pro_usage_${dateStr}_${userId}`;

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

    // 获取骰娘设定
    let usePersona = seal.ext.getBoolConfig(ext, "启用骰娘人设");
    if (isAI) usePersona = false;

    let personaStr = "";
    if (usePersona) {
        personaStr = isKind ? seal.ext.getStringConfig(ext, "温柔模式_骰娘设定") : seal.ext.getStringConfig(ext, "常规模式_骰娘设定");
    }

    let storageKey = `last_file_${groupId}`;
    let fileDataStr = ext.storageGet(storageKey);
    
    if (!fileDataStr) {
        seal.replyToSender(ctx, msg, '❌ 当前群没有检测到新上传的模组文件，或记录已过期。');
        return true;
    }

    let fileData = JSON.parse(fileDataStr);
    let filename = fileData.name;
    
    if (customName) modeName = `自定义处理[${customName}]`;

    let modeMsg = usePersona ? " [骰娘人设]" : (isAI ? " [纯净AI]" : "");
    if (isPro) modeMsg += "[Pro模式]";
    if (isKind && pythonMode === 'analyze' && usePersona) modeMsg += "[温柔模式]";
    
    seal.replyToSender(ctx, msg, `🤖 正在请求【${filename}】的下载链接并开始${modeName}...${modeMsg}`);

    try {
        let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
        if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);
        if (!fileData.direct_url && !/^QQ-Group:\d+$/.test(groupId)) {
            seal.replyToSender(ctx, msg, '❌ 官Bot群文件没有可用直链。请先使用 .QQ群绑定 <原QQ群号> 绑定后再试。');
            return true;
        }
        let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
        
        const downloadUrl = await resolveModuleFileDownloadUrl(onebotApiUrl, onebotGroupId, fileData);
        if (!downloadUrl) {
            seal.replyToSender(ctx, msg, `❌ 获取文件链接失败（NapCat 等请依赖消息内 CQ:file 的 url 直链，或检查 OneBot_API_地址）。`);
            return true;
        }

        // 构建 POST Payload，加入自定义提示词
        let realUserName = await resolveRealUserNickname(ctx, userId);
        let payload = {
            url: downloadUrl,
            filename: filename,
            mode: pythonMode,
            pro: isPro,
            kind: isKind,
            persona: personaStr,
            custom_prompt: customPromptContent,
            custom_name: customName,
            user_key: String(userId || '').replace(/^QQ:/, ''),
            user_name: realUserName || String(ctx.player.name || '').trim() || '匿名用户',
            group_key: String(groupId || '').replace(/^QQ-Group:/, ''),
            token_module: pythonMode === 'prepare' ? 'module_prepare' : (pythonMode === 'refine' ? 'module_refine' : 'module_analyze')
        };

        let pythonApiUrl = `http://127.0.0.1:8000/api/submit_file`;
        let pyData = await safeFetchJson(
            pythonApiUrl,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
            "提交分析任务"
        );

        if (pyData.status !== 'ok') {
            // 【新增】：如果提交给 Python 后端失败了（没扣费），把刚才预扣的额度退回给用户
            if (isPro) {
                let g = parseInt(ext.storageGet(globalKey) || '1');
                let u = parseInt(ext.storageGet(userKey) || '1');
                ext.storageSet(globalKey, Math.max(0, g - 1).toString());
                ext.storageSet(userKey, Math.max(0, u - 1).toString());
            }
            seal.replyToSender(ctx, msg, `❌ 后端提交失败: ${JSON.stringify(pyData)}`);
            return true;
        }

        let jobId = pyData.id;
        let maxRetries = 120; // 分析过程最多等待4分钟
        
        while (maxRetries > 0) {
            await sleep(2000);
            let sData = await safeFetchJson(`http://127.0.0.1:8000/api/status?id=${jobId}`, undefined, "查询任务状态");

            if (sData.status === 'done' || sData.status === 'error') {
                if (sData.image_count > 0) {
                    let msgStr = "";
                    for (let i = 0; i < sData.image_count; i++) {
                        let finalUrl = `http://127.0.0.1:8000/api/result?id=${jobId}&index=${i}&t=${new Date().getTime()}`;
                        msgStr += `[CQ:image,file=${finalUrl},cache=0]`;
                    }
                    seal.replyToSender(ctx, msg, msgStr);
                } else {
                    seal.replyToSender(ctx, msg, `❌ 发生未知错误，未能生成图片。`);
                }
                ext.storageSet(storageKey, ""); 
                return true;
            }
            maxRetries--;
        }
        seal.replyToSender(ctx, msg, `⚠️ 分析超时，后台可能仍在处理。`);

    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 发生错误: ${e.message}`);
    }
    return true;
}

// --- 1. 注册核心指令： .模组分析 ---
const cmdFile = seal.ext.newCmdItemInfo();
cmdFile.name = '模组分析';
cmdFile.help = '分析最近上传的群文件。\n用法: .模组分析 [配置名] [选项]\n选项：pro, 温柔, ai\n配置管理请使用 .模组分析 配置 示例';
cmdFile.solve = async (ctx, msg, cmdArgs) => {
    if (!requireOfficialQQBinding(ctx, msg, '模组分析')) return seal.ext.newCmdExecuteResult(true);
    // 【拦截 .模组分析 配置 子指令】
    let val1 = cmdArgs.getArgN(1);
    if (val1 === '配置') {
        let op = cmdArgs.getArgN(2);
        let stored = ext.storageGet('module_custom_prompts') || '{}';
        let prompts = {};
        try { prompts = JSON.parse(stored); } catch (e) {}

        let userId = compatUserId(ctx.player.userId);
        let userName = ctx.player.name;
        let isAdmin = ctx.privilegeLevel >= 100;

        if (!op || op === '示例') {
            seal.replyToSender(ctx, msg, `【自定义模组分析配置说明】
你可以自由编写AI阅读模组时的要求，存为配置名随时调用。
(当使用自定义配置时，系统会自动关闭骰娘语气，确保排版专业)

1. 添加配置：.模组分析 配置 添加 <名称> <提示词...>
2. 删除配置：.模组分析 配置 删除 <名称>
3. 查看列表：.模组分析 配置 列表 [页码]
4. 使用配置：上传群文件后，发送 .模组分析 <名称>
5. 查看详情：.模组分析 配置 查看 <名称>

💡 示例用法：
.模组分析 配置 添加 提取NPC 请帮我把模组里所有出现过的NPC名字、真实身份和目的整理成一张表格。
（进阶：如果字数太多需要长图连发，可以在提示词里要求 AI 在每段开头加上“【分页符】”这四个字）
(注：每个人只能修改/删除自己创建的配置，管理员拥有所有权限)`);
            return seal.ext.newCmdExecuteResult(true);

        } else if (op === '添加') {
            let name = cmdArgs.getArgN(3);
            let contentArgs =[];
            for(let i=3; i < cmdArgs.args.length; i++) { contentArgs.push(cmdArgs.args[i]); }
            let content = contentArgs.join(' ').trim();
            
            if (!name || !content) {
                seal.replyToSender(ctx, msg, `❌ 缺少名称或内容！\n示例：.模组分析 配置 添加 考据狂 请深挖...`);
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
                    let createLimitKey = `module_config_create_${dateStr}_${userId}`;
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
            ext.storageSet('module_custom_prompts', JSON.stringify(prompts));
            seal.replyToSender(ctx, msg, `✅ 已成功保存模组配置：【${name}】\n现在发完文件后可以直接使用：.模组分析 ${name}`);
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
                ext.storageSet('module_custom_prompts', JSON.stringify(prompts));
                seal.replyToSender(ctx, msg, `✅ 已删除配置：【${name}】`);
            } else {
                seal.replyToSender(ctx, msg, `❌ 未找到名为【${name}】的配置。`);
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

            let replyMsg = `📄 当前模组分析配置列表 (第 ${page}/${totalPages} 页)：\n- ` + currentKeys.join('\n- ');
            
            if (totalPages > 1) {
                let nextPage = page < totalPages ? page + 1 : 1;
                replyMsg += `\n\n💡 翻页提示：发送 .模组分析 配置 列表 ${nextPage} 查看其它页`;
            }

            seal.replyToSender(ctx, msg, replyMsg);
            return seal.ext.newCmdExecuteResult(true);

        } else if (op === '查看') {
            let name = cmdArgs.getArgN(3);
            if (!name) {
                seal.replyToSender(ctx, msg, `❌ 请输入要查看的配置名称！\n示例：.模组分析 配置 查看 提取NPC`);
            } else if (prompts[name]) {
                let p = prompts[name];
                let content = typeof p === 'string' ? p : p.content;
                let creator = typeof p === 'string' ? '未知(旧版)' : p.creatorName;
                seal.replyToSender(ctx, msg, `📄 配置【${name}】 (创建者: ${creator})\n--------------------\n${content}`);
            } else {
                seal.replyToSender(ctx, msg, `❌ 未找到名为【${name}】的配置。`);
            }
            return seal.ext.newCmdExecuteResult(true);
        }
    }
    
    return await processModuleFile(ctx, msg, cmdArgs, '模组解析与评价', 'analyze');
};
ext.cmdMap['模组分析'] = cmdFile;
ext.cmdMap['分析文件'] = cmdFile;

// --- 2. 注册指令 .模组备团 ---
const cmdPrepare = seal.ext.newCmdItemInfo();
cmdPrepare.name = '模组备团';
cmdPrepare.help = '对新上传的模组进行分图梳理：背景、梗概、NPC关系、场景、带团建议。\n选项：pro, ai';
cmdPrepare.solve = async (ctx, msg, cmdArgs) => {
    if (!requireOfficialQQBinding(ctx, msg, '模组备团')) return seal.ext.newCmdExecuteResult(true);
    return await processModuleFile(ctx, msg, cmdArgs, '备团资料梳理', 'prepare');
};
ext.cmdMap['模组备团'] = cmdPrepare;
ext.cmdMap['备团'] = cmdPrepare;

// --- 3. 注册指令 .模组完善 ---
const cmdRefine = seal.ext.newCmdItemInfo();
cmdRefine.name = '模组完善';
cmdRefine.help = '对未写完的模组进行审查：进度预估、写作建议、具体示例润色。\n选项：pro, ai';
cmdRefine.solve = async (ctx, msg, cmdArgs) => {
    if (!requireOfficialQQBinding(ctx, msg, '模组完善')) return seal.ext.newCmdExecuteResult(true);
    return await processModuleFile(ctx, msg, cmdArgs, '写作进度审查与润色', 'refine');
};
ext.cmdMap['模组完善'] = cmdRefine;
ext.cmdMap['完善模组'] = cmdRefine;

// --- 3. 注册指令 .模组翻译 ---
const cmdTranslate = seal.ext.newCmdItemInfo();
cmdTranslate.name = '模组翻译';
cmdTranslate.help = '翻译最近上传的群文件。\n使用方法：上传文件后，发送 .模组翻译 <目标语言> [覆盖]\n示例：\n.模组翻译 en (译为英文，保留原文)\n.模组翻译 ja 覆盖 (译为日文，直接替换原文)\n.模组翻译 (默认为中文)';

cmdTranslate.solve = async (ctx, msg, cmdArgs) => {
    if (!requireOfficialQQBinding(ctx, msg, '模组翻译')) return seal.ext.newCmdExecuteResult(true);
    // 1. 获取群号
    let groupId = compatGroupId(ctx.group.groupId);
    let userId = compatUserId(ctx.player.userId);
    if (!groupId.includes('Group')) {
        seal.replyToSender(ctx, msg, '❌ 请在群聊中使用此功能。');
        return seal.ext.newCmdExecuteResult(true);
    }

    // 2. 读取最近上传的文件记录
    let storageKey = `last_file_${groupId}`;
    let fileDataStr = ext.storageGet(storageKey);
    
    if (!fileDataStr) {
        seal.replyToSender(ctx, msg, '❌ 当前群没有检测到新上传的模组文件，或记录已过期。');
        return seal.ext.newCmdExecuteResult(true);
    }

    let fileData = JSON.parse(fileDataStr);
    let filename = fileData.name;
    
    // 解析目标语言
    let targetLang = 'zh-CN';
    let langArg = cmdArgs.getArgN(1);
    if (langArg && langArg !== 'help') {
        targetLang = langArg.toLowerCase();
        // 常见语言代码映射
        const langMap = {
            'en': 'en', 'english': 'en',
            'zh': 'zh-CN', 'cn': 'zh-CN', '中文': 'zh-CN',
            'ja': 'ja', 'jp': 'ja', '日文': 'ja',
            'ko': 'ko', 'kr': 'ko', '韩文': 'ko',
            'fr': 'fr', '法语': 'fr',
            'de': 'de', '德语': 'de',
            'es': 'es', '西班牙语': 'es',
            'ru': 'ru', '俄语': 'ru'
        };
        if (langMap[targetLang]) targetLang = langMap[targetLang];
    }
    
    let isPro = false;
    let isOverwrite = false;
    const args = cmdArgs.args;
    if (args.includes('pro') || args.includes('PRO')) isPro = true;
    if (args.includes('覆盖') || args.includes('replace') || args.includes('overwrite')) isOverwrite = true;

    let modeMsg = "";
    if (isPro) modeMsg += " [Pro模式]";
    if (isOverwrite) modeMsg += " [覆盖模式]";
    seal.replyToSender(ctx, msg, `🤖 正在翻译【${filename}】为 ${targetLang}...${modeMsg}`);

    try {
        // --- 3. 获取文件下载链接 ---
        let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
        if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);

        if (!fileData.direct_url && !/^QQ-Group:\d+$/.test(groupId)) {
            seal.replyToSender(ctx, msg, '❌ 官Bot群文件没有可用直链。请先使用 .QQ群绑定 <原QQ群号> 绑定后再试。');
            return seal.ext.newCmdExecuteResult(true);
        }
        let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
        
        const downloadUrl = await resolveModuleFileDownloadUrl(onebotApiUrl, onebotGroupId, fileData);
        if (!downloadUrl) {
            seal.replyToSender(ctx, msg, `❌ 获取文件链接失败（NapCat 等请依赖 CQ:file 内 url 直链）。`);
            return seal.ext.newCmdExecuteResult(true);
        }

        // --- 4. 获取上传用的HTTP客户端地址 ---
        let uploadBaseUrl = seal.ext.getStringConfig(ext, "HTTP客户端地址");
        if (uploadBaseUrl.endsWith('/')) uploadBaseUrl = uploadBaseUrl.slice(0, -1);

        // --- 5. 提交给 Python 后端翻译并上传 ---
        let pythonApiUrl = `http://127.0.0.1:8000/api/translate_and_upload?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}&lang=${encodeURIComponent(targetLang)}&group_id=${onebotGroupId}&upload_url=${encodeURIComponent(uploadBaseUrl)}`;
        pythonApiUrl += `&user_key=${encodeURIComponent(String(userId || '').replace(/^QQ:/, ''))}`;
        let realUserName = await resolveRealUserNickname(ctx, userId);
        pythonApiUrl += `&user_name=${encodeURIComponent(realUserName || String(ctx.player.name || '').trim() || '匿名用户')}`;
        pythonApiUrl += `&group_key=${encodeURIComponent(String(groupId || '').replace(/^QQ-Group:/, ''))}`;
        if (isPro) pythonApiUrl += `&pro=true`;
        if (isOverwrite) pythonApiUrl += `&overwrite=true`;
        
        let pyData = await safeFetchJson(pythonApiUrl, undefined, "提交翻译任务");

        if (pyData.status !== 'ok') {
            seal.replyToSender(ctx, msg, `❌ 翻译提交失败: ${JSON.stringify(pyData)}`);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 6. 轮询翻译上传结果
        let jobId = pyData.id;
        let checkUrl = `http://127.0.0.1:8000/api/status?id=${jobId}`;

        let maxRetries = 300; 
        while (maxRetries > 0) {
            await sleep(2000);
            let sData = await safeFetchJson(checkUrl, undefined, "查询翻译状态");

            if (sData.status === 'done' || sData.status === 'error') {
                if (sData.status === 'error') {
                    seal.replyToSender(ctx, msg, `❌ 翻译上传失败`);
                    return seal.ext.newCmdExecuteResult(true);
                }
                
                // 翻译并上传成功
                seal.replyToSender(ctx, msg, `✅ 翻译完成并已上传到群文件！`);
                
                // 清除记录
                ext.storageSet(storageKey, ""); 
                return seal.ext.newCmdExecuteResult(true);
            }
            maxRetries--;
        }
        seal.replyToSender(ctx, msg, `⚠️ 翻译超时，后台可能仍在处理。`);

    } catch (e) {
        console.error(e);
        seal.replyToSender(ctx, msg, `❌ 发生错误: ${e.message}`);
    }

    return seal.ext.newCmdExecuteResult(true);
};

// 注册翻译指令别名
ext.cmdMap['模组翻译'] = cmdTranslate;
ext.cmdMap['翻译文件'] = cmdTranslate;
ext.cmdMap['translate'] = cmdTranslate;

// --- 2. 监听文件上传 (只记录，不分析) ---
function saveUploadedFile(groupId, file) {
    if (!groupId || !file) return;
    groupId = compatGroupId(groupId);
    let filename = file.name || "";
    if (!filename) return;

    // 检查后缀
    let allowedExts = seal.ext.getStringConfig(ext, "支持的文件后缀").split(',');
    let isAllowed = allowedExts.some(suffix => filename.toLowerCase().endsWith(suffix.trim().toLowerCase()));
    if (!isAllowed) return;

    let fileInfo = {
        name: filename,
        file_id: file.id || file.file_id || "",
        busid: file.busid || 0,
        size: file.size || file.file_size || 0,
        timestamp: new Date().getTime(),
        direct_url: file.direct_url || file.url || ""
    };

    if (!fileInfo.file_id && !(fileInfo.direct_url && /^https?:\/\//i.test(fileInfo.direct_url))) return;
    let storageKey = `last_file_${groupId}`;
    ext.storageSet(storageKey, JSON.stringify(fileInfo));
}

// 路径1：标准群文件上传回调（旧版/部分适配器）
ext.onGroupUpload = (ctx, msg, file) => {
    saveUploadedFile(msg.groupId, file);
};

// 路径2：新版常见情况，文件作为普通群消息里的 CQ:file 上报
ext.onNotCommandReceived = (ctx, msg) => {
    if (!msg || !msg.groupId || !msg.message) return;
    if (!msg.message.includes("[CQ:file,")) return;

    let m = msg.message.match(/\[CQ:file,([^\]]+)\]/);
    if (!m || !m[1]) return;

    let params = parseCQFileInner(m[1]);

    let file = {
        id: params.file_id || "",
        name: params.file || "",
        size: parseInt(params.file_size || "0", 10) || 0,
        busid: 0,
        direct_url: params.url || ""
    };
    saveUploadedFile(msg.groupId, file);
};

// --- 4. 注册指令 .搜索模组 ---
const cmdSearchModule = seal.ext.newCmdItemInfo();
cmdSearchModule.name = '搜索模组';
cmdSearchModule.help = '在百度网盘库中搜索指定的模组文件/文件夹。\n使用方法：.搜索模组 <关键字> [本地]\n示例：\n.搜索模组 毒汤 (生成网盘分享链接)\n.搜索模组 毒汤 本地 (将模组下载并上传到群文件)';

cmdSearchModule.solve = async (ctx, msg, cmdArgs) => {
    if (!requireOfficialQQBinding(ctx, msg, '模组搜索')) return seal.ext.newCmdExecuteResult(true);
    // 1. 获取群号 (如果使用本地上传，必须在群里使用)
    let groupId = compatGroupId(ctx.group.groupId);
    let onebotGroupId = 0;
    
    // 获取所有的参数列表
    let args = cmdArgs.args;
    
    // 如果没有任何参数，或者第一个参数是 help
    if (args.length === 0 || args[0] === 'help') {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    // 智能解析包含空格的关键字与 "本地" 参数
    let isLocal = false;
    let keywordParts = [...args];
    
    // 检查最后一个参数是不是 "本地" 或 "local"
    let lastArg = keywordParts[keywordParts.length - 1].toLowerCase();
    if (lastArg === '本地' || lastArg === 'local') {
        isLocal = true;
        keywordParts.pop(); // 把 "本地" 从关键字数组中剔除
    }

    // 把剩余的所有参数用空格重新拼接起来，形成完整的关键字
    let keyword = keywordParts.join(' ').trim();
    
    if (!keyword) {
        seal.replyToSender(ctx, msg, '❌ 请提供要搜索的关键字！');
        return seal.ext.newCmdExecuteResult(true);
    }

    if (isLocal) {
        if (!groupId.includes('Group')) {
            seal.replyToSender(ctx, msg, '❌ [本地] 模式需要将文件发到群文件，请在群聊中使用。');
            return seal.ext.newCmdExecuteResult(true);
        }
        if (!/^QQ-Group:\d+$/.test(groupId)) {
            seal.replyToSender(ctx, msg, '❌ 官Bot群使用本地上传前，请先用 .QQ群绑定 <原QQ群号> 建立群映射。');
            return seal.ext.newCmdExecuteResult(true);
        }
        onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
    }

    let modeMsg = isLocal ? "【本地下载并上传至群文件】\n(网盘下载及上传需要时间，请耐心等待~)" : "【获取网盘分享链接】";
    seal.replyToSender(ctx, msg, `🤖 正在网盘资料库搜索 "${keyword}"...\n模式: ${modeMsg}`);

    try {
        // 获取上传用的HTTP客户端地址
        let uploadBaseUrl = seal.ext.getStringConfig(ext, "HTTP客户端地址");
        if (uploadBaseUrl.endsWith('/')) uploadBaseUrl = uploadBaseUrl.slice(0, -1);
        const isOfficialQQ = /^OpenQQ/.test(String(msg.platform || '')) || /^OpenQQ/.test(String(ctx.platform || ''));
        // 官方 Bot 没有 OneBot /upload_group_file；让核心收到下载 URL 后
        // 走官方群聊 /files + msg_type=7 的原生富媒体流程。
        const moduleUploadTarget = isOfficialQQ ? 'official' : uploadBaseUrl;

        // 发送请求给Python后端
        let pythonApiUrl = `http://127.0.0.1:8000/api/search_module?keyword=${encodeURIComponent(keyword)}&local=${isLocal}&group_id=${onebotGroupId}&upload_url=${encodeURIComponent(moduleUploadTarget)}`;
        
        let pyResp = await fetch(pythonApiUrl);
        let pyData = await pyResp.json();

        if (pyData.status !== 'ok') {
            seal.replyToSender(ctx, msg, `❌ 搜索请求提交失败: ${pyData.msg}`);
            return seal.ext.newCmdExecuteResult(true);
        }

        let jobId = pyData.id;
        let maxRetries = isLocal ? 300 : 30; // 本地上传给10分钟，分享链接给1分钟
        
        while (maxRetries > 0) {
            await sleep(2000);
            
            let sResp = await fetch(`http://127.0.0.1:8000/api/status?id=${jobId}`);
            let sData = await sResp.json();

            if (sData.status === 'done' || sData.status === 'error') {
                if (sData.status === 'done' && isOfficialQQ && sData.download_url) {
                    const downloadURL = `http://127.0.0.1:8000${sData.download_url}`;
                    seal.replyToSender(ctx, msg, `${sData.msg || '✅ 模组压缩完成'}\n[CQ:file,file=${downloadURL}]`);
                } else {
                    seal.replyToSender(ctx, msg, sData.msg || "处理完毕！");
                }
                return seal.ext.newCmdExecuteResult(true);
            }
            maxRetries--;
        }
        
        seal.replyToSender(ctx, msg, `⚠️ 搜索超时，可能文件过大还在下载中。`);

    } catch (e) {
        console.error(e);
        seal.replyToSender(ctx, msg, `❌ 发生错误: ${e.message}`);
    }

    return seal.ext.newCmdExecuteResult(true);
};

// 注册指令
ext.cmdMap['搜索模组'] = cmdSearchModule;
ext.cmdMap['模组搜索'] = cmdSearchModule;
