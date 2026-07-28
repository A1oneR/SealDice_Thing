// ==UserScript==
// @name         人工智障模组分析器
// @author       Air, Gemini
// @version      1.2.0
// @description  识别上传的模组文件，使用 .模组分析 指令进行解读。
// @timestamp    1772087720
// @license      MIT
// ==/UserScript==

let ext = seal.ext.find('file-analyzer');
if (!ext) {
  ext = seal.ext.new('file-analyzer', 'Air, Gemini', '1.2.0');
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

// 辅助函数：等待
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 统一的文件处理底层函数 ---
async function processModuleFile(ctx, msg, cmdArgs, modeName, pythonMode) {
    let groupId = ctx.group.groupId;
    if (!groupId.includes('Group')) {
        seal.replyToSender(ctx, msg, '❌ 请在群聊中使用此功能。');
        return true;
    }

    let args = cmdArgs.args;
    let isPro = args.some(a => a.toLowerCase() === 'pro');
    let isKind = args.some(a => a.includes('温柔') || a.toLowerCase() === 'kind');
    // 【新增】：检测是否包含强制 AI 原版的参数
    let isAI = args.some(a => a.toLowerCase() === 'ai' || a === '原版' || a === '专业');

    // 获取骰娘设定
    let usePersona = seal.ext.getBoolConfig(ext, "启用骰娘人设");
    
    // 【新增】：如果用户要求，强制关闭
    if (isAI) {
        usePersona = false;
    }

    let personaStr = "";
    if (usePersona) {
        personaStr = isKind ? seal.ext.getStringConfig(ext, "温柔模式_骰娘设定") : seal.ext.getStringConfig(ext, "常规模式_骰娘设定");
    }

    let storageKey = `last_file_${groupId}`;
    let fileDataStr = ext.storageGet(storageKey);
    if (!fileDataStr) {
        seal.replyToSender(ctx, msg, '❌ 当前群没有检测到新上传的文件。');
        return true;
    }

    let fileData = JSON.parse(fileDataStr);
    let filename = fileData.name;
    
    let modeMsg = usePersona ? " [骰娘人设]" : (isAI ? " [纯净AI模式]" : "");
    if (isPro) modeMsg += " [Pro模式]";
    if (isKind && pythonMode === 'analyze' && usePersona) modeMsg += " [温柔模式]";
    
    seal.replyToSender(ctx, msg, `🤖 正在请求【${filename}】的下载链接并开始${modeName}...${modeMsg}`);

    try {
        let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
        if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);
        let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
        
        let urlResp = await fetch(`${onebotApiUrl}/get_group_file_url`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group_id: onebotGroupId, file_id: fileData.file_id, busid: fileData.busid })
        });
        let urlJson = await urlResp.json();
        
        if (!urlJson || !urlJson.data || !urlJson.data.url) {
            seal.replyToSender(ctx, msg, `❌ 获取文件链接失败。`);
            return true;
        }

        // 构建 POST Payload
        let payload = {
            url: urlJson.data.url,
            filename: filename,
            mode: pythonMode,
            pro: isPro,
            kind: isKind,
            persona: personaStr
        };

        let pythonApiUrl = `http://127.0.0.1:8000/api/submit_file`;
        
        let pyResp = await fetch(pythonApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        let pyData = await pyResp.json();

        if (pyData.status !== 'ok') {
            seal.replyToSender(ctx, msg, `❌ 后端提交失败: ${JSON.stringify(pyData)}`);
            return true;
        }

        let jobId = pyData.id;
        let maxRetries = 120; // 分析过程最多等待4分钟
        
        while (maxRetries > 0) {
            await sleep(2000);
            let sResp = await fetch(`http://127.0.0.1:8000/api/status?id=${jobId}`);
            let sData = await sResp.json();

            if (sData.status === 'done' || sData.status === 'error') {
                if (sData.image_count > 0) {
                    // 核心亮点：如果后端返回了多张图，我们将拼接所有的图片代码一并发出！
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

// --- 1. 注册指令 .模组分析 ---
const cmdFile = seal.ext.newCmdItemInfo();
cmdFile.name = '模组分析';
cmdFile.help = '分析最近上传的群文件。\n选项：pro 使用更强大的模型，温柔 使用鼓励模式';
cmdFile.solve = async (ctx, msg, cmdArgs) => {
    return await processModuleFile(ctx, msg, cmdArgs, '模组解析与评价', 'analyze');
};
ext.cmdMap['模组分析'] = cmdFile;
ext.cmdMap['分析文件'] = cmdFile;

// --- 2. 新增指令 .模组备团 ---
const cmdPrepare = seal.ext.newCmdItemInfo();
cmdPrepare.name = '模组备团';
cmdPrepare.help = '对新上传的模组进行分图梳理：背景、梗概、NPC关系、场景、带团建议。';
cmdPrepare.solve = async (ctx, msg, cmdArgs) => {
    return await processModuleFile(ctx, msg, cmdArgs, '备团资料梳理', 'prepare');
};
ext.cmdMap['模组备团'] = cmdPrepare;
ext.cmdMap['备团'] = cmdPrepare;

// --- 3. 新增指令 .模组完善 ---
const cmdRefine = seal.ext.newCmdItemInfo();
cmdRefine.name = '模组完善';
cmdRefine.help = '对未写完的模组进行审查：进度预估、写作建议、具体示例润色。';
cmdRefine.solve = async (ctx, msg, cmdArgs) => {
    return await processModuleFile(ctx, msg, cmdArgs, '写作进度审查与润色', 'refine');
};
ext.cmdMap['模组完善'] = cmdRefine;
ext.cmdMap['完善模组'] = cmdRefine;

// --- 3. 注册指令 .模组翻译 ---
const cmdTranslate = seal.ext.newCmdItemInfo();
cmdTranslate.name = '模组翻译';
cmdTranslate.help = '翻译最近上传的群文件。\n使用方法：上传文件后，发送 .模组翻译 <目标语言> [覆盖]\n示例：\n.模组翻译 en (译为英文，保留原文)\n.模组翻译 ja 覆盖 (译为日文，直接替换原文)\n.模组翻译 (默认为中文)';

cmdTranslate.solve = async (ctx, msg, cmdArgs) => {
    // 1. 获取群号
    let groupId = ctx.group.groupId;
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

        let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
        
        let payload = {
            group_id: onebotGroupId,
            file_id: fileData.file_id,
            busid: fileData.busid
        };
        
        let urlResp = await fetch(`${onebotApiUrl}/get_group_file_url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        let urlJson = await urlResp.json();
        
        if (!urlJson || (urlJson.retcode !== 0 && urlJson.status !== 'ok') || !urlJson.data || !urlJson.data.url) {
            seal.replyToSender(ctx, msg, `❌ 获取文件链接失败。`);
            return seal.ext.newCmdExecuteResult(true);
        }

        let downloadUrl = urlJson.data.url;

        // --- 4. 获取上传用的HTTP客户端地址 ---
        let uploadBaseUrl = seal.ext.getStringConfig(ext, "HTTP客户端地址");
        if (uploadBaseUrl.endsWith('/')) uploadBaseUrl = uploadBaseUrl.slice(0, -1);

        // --- 5. 提交给 Python 后端翻译并上传 ---
        let pythonApiUrl = `http://127.0.0.1:8000/api/translate_and_upload?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}&lang=${encodeURIComponent(targetLang)}&group_id=${onebotGroupId}&upload_url=${encodeURIComponent(uploadBaseUrl)}`;
        if (isPro) pythonApiUrl += `&pro=true`;
        if (isOverwrite) pythonApiUrl += `&overwrite=true`;
        
        let pyResp = await fetch(pythonApiUrl);
        let pyData = await pyResp.json();

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
            let sResp = await fetch(checkUrl);
            let sData = await sResp.json();

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
// 使用 onGroupUpload(ctx, msg, file)：sealdice 群文件上传回调，第三个参数为文件信息
ext.onGroupUpload = (ctx, msg, file) => {
    if (!file) return;
    let filename = file.name || "";
    
    // 检查后缀
    let allowedExts = seal.ext.getStringConfig(ext, "支持的文件后缀").split(',');
    let isAllowed = allowedExts.some(suffix => filename.toLowerCase().endsWith(suffix.trim().toLowerCase()));

    if (!isAllowed) return;

    // 保存文件信息到 Storage（关键信息：file.id -> file_id, file.busid, file.name）
    let fileInfo = {
        name: filename,
        file_id: file.id,
        busid: file.busid || 0,
        size: file.size,
        timestamp: new Date().getTime()
    };
    
    let storageKey = `last_file_${msg.groupId}`;
    ext.storageSet(storageKey, JSON.stringify(fileInfo));

    // 发送提示（可选）
    // seal.replyToSender(ctx, msg, `📂 收到模组文件：${filename}\n💡 发送【.模组分析】开始AI解读`);
};

// --- 4. 注册指令 .搜索模组 ---
const cmdSearchModule = seal.ext.newCmdItemInfo();
cmdSearchModule.name = '搜索模组';
cmdSearchModule.help = '在百度网盘库中搜索指定的模组文件/文件夹。\n使用方法：.搜索模组 <关键字> [本地]\n示例：\n.搜索模组 毒汤 (生成网盘分享链接)\n.搜索模组 毒汤 本地 (将模组下载并上传到群文件)';

cmdSearchModule.solve = async (ctx, msg, cmdArgs) => {
    // 1. 获取群号 (如果使用本地上传，必须在群里使用)
    let groupId = ctx.group.groupId;
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
        onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
    }

    let modeMsg = isLocal ? "【本地下载并上传至群文件】\n(网盘下载及上传需要时间，请耐心等待~)" : "【获取网盘分享链接】";
    seal.replyToSender(ctx, msg, `🤖 正在网盘资料库搜索 "${keyword}"...\n模式: ${modeMsg}`);

    try {
        // 获取上传用的HTTP客户端地址
        let uploadBaseUrl = seal.ext.getStringConfig(ext, "HTTP客户端地址");
        if (uploadBaseUrl.endsWith('/')) uploadBaseUrl = uploadBaseUrl.slice(0, -1);

        // 发送请求给Python后端
        let pythonApiUrl = `http://127.0.0.1:8000/api/search_module?keyword=${encodeURIComponent(keyword)}&local=${isLocal}&group_id=${onebotGroupId}&upload_url=${encodeURIComponent(uploadBaseUrl)}`;
        
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
                seal.replyToSender(ctx, msg, sData.msg || "处理完毕！");
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