// ==UserScript==
// @name         人工智障Log分析器
// @author       Air, Gemini
// @version      2.2.0
// @description  分析跑团Log日志或进行前文回顾。支持日志链接以及本地群文件上传分析！
// @timestamp    1772087720
// @license      Apache-2.0
// ==/UserScript==

let ext = seal.ext.find('log-analyzer');
if (!ext) {
  ext = seal.ext.new('log-analyzer', 'Air', '2.2.0');
  seal.ext.register(ext);
}

// === 新增：骰娘人设系统配置 ===
seal.ext.registerBoolConfig(ext, "启用骰娘人设", false, "开启后，AI分析将带入下方设定的骰娘语气。关闭则使用原版专业AI语气。");
seal.ext.registerStringConfig(ext, "常规模式_骰娘设定", "你是一个严厉老练的骰娘，说话犀利，对逻辑存在硬伤的模组绝不留情，像个严肃的调查员前辈。", "普通分析模式下的AI扮演提示词");
seal.ext.registerStringConfig(ext, "温柔模式_骰娘设定", "你是一个温柔可爱的骰娘，总是鼓励模组作者，指出缺点时也会非常委婉，语气软萌。", "使用'温柔'参数时的AI扮演提示词");

seal.ext.registerStringConfig(ext, "OneBot_API_地址", "http://127.0.0.1:34567", "Bot客户端的HTTP监听地址");

// 监听文件上传，保存最近一份 Log 文件的数据
ext.onGroupUpload = (ctx, msg, file) => {
    if (!file) return;
    let fileInfo = {
        name: file.name || "未知文件",
        file_id: file.id,
        busid: file.busid || 0
    };
    ext.storageSet(`log_last_file_${msg.groupId}`, JSON.stringify(fileInfo));
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 核心调度函数 ---
async function processLogTask(ctx, msg, cmdArgs, modeName, pythonMode) {
    if (cmdArgs.getArgN(1) === 'help') {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    let args = cmdArgs.args;
    let isPro = args.some(a => a.toLowerCase() === 'pro');
    let isKind = args.some(a => a.includes('温柔') || a.toLowerCase() === 'kind');
    // 【新增】：检测是否包含强制 AI 原版的参数
    let isAI = args.some(a => a.toLowerCase() === 'ai' || a === '原版' || a === '专业'); 
    
    // 获取骰娘设定
    let usePersona = seal.ext.getBoolConfig(ext, "启用骰娘人设");
    
    // 【新增】：如果用户输入了 ai 参数，强制关闭本次的骰娘人设
    if (isAI) {
        usePersona = false;
    }

    let personaStr = "";
    if (usePersona) {
        personaStr = isKind ? seal.ext.getStringConfig(ext, "温柔模式_骰娘设定") : seal.ext.getStringConfig(ext, "常规模式_骰娘设定");
    }

    // 【修改】：把 ai, 原版, 专业 加入过滤列表，防止被误认为网址或文件名
    let targetStr = args.find(a => !['pro', 'kind', '温柔', '本地', '文件', 'ai', '原版', '专业'].includes(a.toLowerCase()));
    let useLocalFile = !targetStr;
    
    let apiUrl = "";
    let logKeyForMsg = "";

    // 组装 POST 数据载荷
    let payload = {
        mode: pythonMode,
        pro: isPro,
        kind: isKind,
        persona: personaStr
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

        let urlResp = await fetch(`${onebotApiUrl}/get_group_file_url`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: onebotGroupId, file_id: fileData.file_id, busid: fileData.busid })
        });
        let urlJson = await urlResp.json();

        if (!urlJson || !urlJson.data || !urlJson.data.url) {
            seal.replyToSender(ctx, msg, `❌ 获取群文件下载链接失败。`);
            return seal.ext.newCmdExecuteResult(true);
        }

        apiUrl = `http://127.0.0.1:8000/api/submit_file`;
        payload.url = urlJson.data.url;
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

    let modeMsg = usePersona ? " [骰娘人设]" : "";
    if (useLocalFile) modeMsg += " [本地文件]";
    if (isPro) modeMsg += " [Pro模式]";
    if (isKind && pythonMode === 'analyze') modeMsg += " [温柔模式]";

    seal.replyToSender(ctx, msg, `已提交请求，正在阅读【${logKeyForMsg}】并进行【${modeName}】${modeMsg} (请稍候)...`);

    try {
        // 使用 POST 请求，突破长度限制并安全传递人设！
        let resp = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        let data = await resp.json();
        
        if (data.status !== 'ok') {
            seal.replyToSender(ctx, msg, `❌ 提交失败：${JSON.stringify(data)}`);
            return seal.ext.newCmdExecuteResult(true);
        }

        let jobId = data.id;
        let checkUrl = `http://127.0.0.1:8000/api/status?id=${jobId}`;
        let resultUrl = `http://127.0.0.1:8000/api/result?id=${jobId}`;

        let maxRetries = 90; // 最多等待 3 分钟
        while (maxRetries > 0) {
            await sleep(2000);
            let sResp = await fetch(checkUrl);
            let sData = await sResp.json();
            
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
                
                // 清空群文件缓存，防止重复读取
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

// --- 注册指令 ---
const cmdLogAi = seal.ext.newCmdItemInfo();
cmdLogAi.name = 'logai';
cmdLogAi.help = '对跑团Log进行整体评分。\n用法1: 海豹: .logai https://log.weizaima.com/?key=abcd#123456\n赵/星骰: .logai https://logpainter.trpgbot.com/#1-abc123\n溯洄: .logai https://logpainter.kokona.tech/?s3=ABCD123_456789\n选项：pro 使用更强大的模型，温柔 使用鼓励模式\n用法2: 先在群里发个Log文件，然后输入 .logai\n选项：pro, 温柔';
cmdLogAi.solve = async (ctx, msg, cmdArgs) => { return await processLogTask(ctx, msg, cmdArgs, '跑团日志评分与吐槽', 'analyze'); };
ext.cmdMap['logai'] = cmdLogAi;
ext.cmdMap['评分'] = cmdLogAi;

const cmdRecap = seal.ext.newCmdItemInfo();
cmdRecap.name = '前文回顾';
cmdRecap.help = '梳理跑团Log的剧情进度与线索，帮助快速找回记忆。\n用法1: .前文回顾 <Log链接>\n用法2: 先在群里发个Log文件，然后输入 .前文回顾\n选项：pro';
cmdRecap.solve = async (ctx, msg, cmdArgs) => { return await processLogTask(ctx, msg, cmdArgs, '跑团剧情与线索梳理', 'recap'); };
ext.cmdMap['前文回顾'] = cmdRecap;
ext.cmdMap['回顾'] = cmdRecap;