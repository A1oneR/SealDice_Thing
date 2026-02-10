// ==UserScript==
// @name         人工智障模组分析器(修复版)
// @author       SealdiceCommunity
// @version      1.2.0
// @description  识别上传的模组文件，使用 .模组分析 指令进行解读。
// @timestamp    1700000010
// @license      MIT
// ==/UserScript==

let ext = seal.ext.find('file-analyzer');
if (!ext) {
  ext = seal.ext.new('file-analyzer', 'SealdiceCommunity', '1.2.0');
  seal.ext.register(ext);
}

// --- 配置项 ---
seal.ext.registerStringConfig(ext, "支持的文件后缀", ".doc,.docx,.txt,.pdf,.md,.json,.yaml", "用逗号分隔");
// 关键修复：添加 OneBot HTTP API 地址配置
seal.ext.registerStringConfig(ext, "OneBot_API_地址", "http://127.0.0.1:34567", "Bot客户端(Lagrange/LLOneBot/GOCQ)的HTTP监听地址，末尾不要带斜杠");

// 辅助函数：等待
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- 1. 注册指令 .模组分析 ---
const cmdFile = seal.ext.newCmdItemInfo();
cmdFile.name = '模组分析';
cmdFile.help = '分析最近上传的群文件。\n使用方法：上传文件后，发送 .模组分析';

cmdFile.solve = async (ctx, msg, cmdArgs) => {
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
    
    seal.replyToSender(ctx, msg, `🤖 正在请求【${filename}】的下载链接并分析...`);

    try {
        // --- 3. 关键修复：使用 fetch 调用 OneBot HTTP API ---
        let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
        // 去除末尾可能多余的斜杠
        if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);

        let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
        
        // 构造请求：get_group_file_url
        // 不同客户端对 busid 的要求不同，最好带上
        let payload = {
            group_id: onebotGroupId,
            file_id: fileData.file_id,
            busid: fileData.busid
        };

        console.log(`[FileAnalyzer] Requesting URL from: ${onebotApiUrl}/get_group_file_url`);
        
        let urlResp = await fetch(`${onebotApiUrl}/get_group_file_url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        let urlJson = await urlResp.json();
        
        // 检查返回值
        // 通常成功是 retcode: 0 且 data.url 存在
        if (!urlJson || (urlJson.retcode !== 0 && urlJson.status !== 'ok') || !urlJson.data || !urlJson.data.url) {
            console.log(`[FileAnalyzer] API Error: ${JSON.stringify(urlJson)}`);
            seal.replyToSender(ctx, msg, `❌ 获取文件链接失败。可能原因：\n1. Bot API地址配置错误\n2. Bot非管理员无法获取链接\n3. 文件已过期`);
            return seal.ext.newCmdExecuteResult(true);
        }

        let downloadUrl = urlJson.data.url;
        console.log(`[FileAnalyzer] Get URL success: ${downloadUrl.slice(0, 50)}...`);

        // --- 4. 提交给 Python 后端 ---
        // 注意：Python后端地址假定为 127.0.0.1:8000
        let pythonApiUrl = `http://127.0.0.1:8000/api/submit_file?url=${encodeURIComponent(downloadUrl)}&filename=${encodeURIComponent(filename)}`;
        
        let pyResp = await fetch(pythonApiUrl);
        let pyData = await pyResp.json();

        if (pyData.status !== 'ok') {
            seal.replyToSender(ctx, msg, `❌ 后端提交失败: ${JSON.stringify(pyData)}`);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 5. 轮询结果
        let jobId = pyData.id;
        let checkUrl = `http://127.0.0.1:8000/api/status?id=${jobId}`;
        let resultUrl = `http://127.0.0.1:8000/api/result?id=${jobId}`;

        let maxRetries = 90; 
        while (maxRetries > 0) {
            await sleep(2000);
            let sResp = await fetch(checkUrl);
            let sData = await sResp.json();

            if (sData.status === 'done' || sData.status === 'error') {
                let finalUrl = `${resultUrl}&t=${new Date().getTime()}`;
                seal.replyToSender(ctx, msg, `[CQ:image,file=${finalUrl},cache=0]`);
                // 清除记录
                ext.storageSet(storageKey, ""); 
                return seal.ext.newCmdExecuteResult(true);
            }
            maxRetries--;
        }
        seal.replyToSender(ctx, msg, `⚠️ 分析超时，后台可能仍在处理。`);

    } catch (e) {
        console.error(e);
        seal.replyToSender(ctx, msg, `❌ 发生错误: ${e.message}`);
    }

    return seal.ext.newCmdExecuteResult(true);
};

// 注册指令别名
ext.cmdMap['模组分析'] = cmdFile;
ext.cmdMap['分析文件'] = cmdFile;
ext.cmdMap['file'] = cmdFile; // .file analyze

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