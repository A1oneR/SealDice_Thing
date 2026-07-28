// ==UserScript==
// @name         AI生成图片
// @author       Air
// @version      1.1.0
// @description  调用后端大模型生成图片。支持尺寸调整。
// @timestamp    1772087820
// @license      Apache-2.0
// ==/UserScript==

let ext = seal.ext.find('ai-image-gen');
if (!ext) {
  ext = seal.ext.new('ai-image-gen', 'Air', '1.1.0');
  seal.ext.register(ext);
}

// === 权限配置项 ===
seal.ext.registerStringConfig(ext, "允许使用的用户ID", "QQ:12345678,QQ:87654321", "用逗号分隔，必须带上平台前缀(如QQ:)");

const cmdDraw = seal.ext.newCmdItemInfo();
cmdDraw.name = '生成图片';
cmdDraw.help = '根据文本生成图片（仅限授权用户）。\n用法：.生成图片 <描述词> [尺寸]\n尺寸支持：竖图(长图/9:16)、横图(宽图/16:9)、方图(默认)\n示例：.生成图片 一座废弃的医院 阴森 横图';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

cmdDraw.solve = async (ctx, msg, cmdArgs) => {
    // 1. 判断是否为空或求助
    if (cmdArgs.args.length === 0 || cmdArgs.args[0] === 'help') {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    // 2. 权限校验
    let allowedUsersStr = seal.ext.getStringConfig(ext, "允许使用的用户ID");
    let allowedUsers = allowedUsersStr.split(',').map(u => u.trim());
    if (!allowedUsers.includes(ctx.player.userId)) {
        seal.replyToSender(ctx, msg, '❌ 抱歉，您目前没有使用画图指令的权限。');
        return seal.ext.newCmdExecuteResult(true);
    }

    // 3. 解析尺寸参数与实际描述词
    let args = cmdArgs.args;
    let size = "1024x1024";
    let sizeName = "正方形(1:1)";
    let promptParts = [];

    for (let i = 0; i < args.length; i++) {
        let arg = args[i].toLowerCase();
        if (['横图', '宽图', '横向', '16:9'].includes(arg)) {
            size = "1792x1024";
            sizeName = "宽长方形(16:9)";
        } else if (['竖图', '长图', '纵向', '9:16'].includes(arg)) {
            size = "1024x1792";
            sizeName = "竖长方形(9:16)";
        } else if (['方图', '正方形', '1:1'].includes(arg)) {
            size = "1024x1024";
            sizeName = "正方形(1:1)";
        } else {
            promptParts.push(args[i]);
        }
    }

    let prompt = promptParts.join(' ').trim();
    if (!prompt) {
        seal.replyToSender(ctx, msg, '❌ 缺少有效的画面描述词！\n示例：.生成图片 一个克苏鲁风格的侦探 竖图');
        return seal.ext.newCmdExecuteResult(true);
    }
    
    seal.replyToSender(ctx, msg, `🎨 正在绘制：“${prompt}”\n📐 尺寸设定：${sizeName}\n(生成高画质图片需要 10~30 秒，请稍候)...`);

    try {
        // 4. 提交给 Python 后端，附加 size 参数
        let apiUrl = `http://127.0.0.1:8000/api/submit_image_gen?prompt=${encodeURIComponent(prompt)}&size=${encodeURIComponent(size)}`;
        let resp = await fetch(apiUrl);
        let data = await resp.json();

        if (data.status !== 'ok') {
            seal.replyToSender(ctx, msg, `❌ 提交画图失败：${data.msg}`);
            return seal.ext.newCmdExecuteResult(true);
        }

        let jobId = data.id;
        let checkUrl = `http://127.0.0.1:8000/api/status?id=${jobId}`;
        let resultUrl = `http://127.0.0.1:8000/api/result?id=${jobId}`;

        // 5. 轮询等待图片生成完成
        let maxRetries = 60; // 120秒
        while (maxRetries > 0) {
            await sleep(2000);
            
            let sResp = await fetch(checkUrl);
            let sData = await sResp.json();
            
            if (sData.status === 'done' || sData.status === 'error') {
                // 如果后端使用 images 数组（如遇到报错时），我们通过 index=0 拉取；
                // 正常生成则是走通用 result 通道返回。为兼容两种情况，加上 index=0 不影响单图。
                let finalUrl = `${resultUrl}&index=0&t=${new Date().getTime()}`;
                seal.replyToSender(ctx, msg, `[CQ:image,file=${finalUrl},cache=0]`);
                return seal.ext.newCmdExecuteResult(true);
            }
            maxRetries--;
        }
        
        seal.replyToSender(ctx, msg, `⚠️ 画图超时，服务器可能繁忙。`);

    } catch (e) {
        console.error(e);
        seal.replyToSender(ctx, msg, `❌ 发生错误: ${e.message}`);
    }

    return seal.ext.newCmdExecuteResult(true);
};

// 注册指令与别名
ext.cmdMap['生成图片'] = cmdDraw;
ext.cmdMap['画图'] = cmdDraw;
ext.cmdMap['draw'] = cmdDraw;