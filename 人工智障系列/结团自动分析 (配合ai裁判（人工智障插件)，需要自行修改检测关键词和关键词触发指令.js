// ==UserScript==
// @name         结团自动分析
// @author       定制版
// @version      1.0.3
// @description  监听结团日志链接，自动调用 .logai 若木点评
// @timestamp    2026-04-15T00:00:00.000Z
// @license      MIT
// ==/UserScript==

(function() {
    if (seal.ext.find('auto-logai')) {
        console.log('[自动分析] 插件已加载，跳过重复注册');
        return;
    }

    const ext = seal.ext.new('auto-logai', '定制版', '1.0.3');
    seal.ext.register(ext);

    const processedLinks = new Set();
    setInterval(() => processedLinks.clear(), 120000);

    ext.onMessageSend = (ctx, msg, flag) => {
        if (!msg.groupId) return;

        const messageText = msg.message || '';
        console.log('[自动分析] 机器人发送消息:', messageText.substring(0, 80));

        const successPhrases = ['跑团日志已上传服务器', '链接如下', '完结撒花', '{$t日志链接}'];
        const hasPhrase = successPhrases.some(phrase => messageText.includes(phrase));
        if (!hasPhrase) return;

        const urlPattern = /https?:\/\/log\.weizaima\.com\/\?key=[a-zA-Z0-9]+(?:#[0-9]+)?/i;
        const match = messageText.match(urlPattern);
        if (!match) return;

        const logUrl = match[0];
        if (processedLinks.has(logUrl)) {
            console.log(`[自动分析] 链接已处理过，跳过: ${logUrl}`);
            return;
        }
        processedLinks.add(logUrl);
        console.log(`[自动分析] 捕获结团链接，准备使用「若木点评」分析: ${logUrl}`);

        // 发送过渡语
        seal.replyToSender(ctx, msg, '让我看看大家这次旅途中的故事表现…');

        // 获取 logai 扩展中的 .logai 指令
        const logaiExt = seal.ext.find('log-analyzer');
        if (!logaiExt) {
            console.error('[自动分析] 未找到 log-analyzer 扩展，无法调用分析');
            seal.replyToSender(ctx, msg, '❌ 自动分析失败：logai 插件未加载');
            return;
        }

        const logaiCmd = logaiExt.cmdMap['logai'];
        if (!logaiCmd || typeof logaiCmd.solve !== 'function') {
            console.error('[自动分析] logai 指令不可用');
            seal.replyToSender(ctx, msg, '❌ 自动分析失败：logai 指令未注册');
            return;
        }

        // 构造参数：.logai 若木点评 <链接>
        const mockArgs = ['若木点评', logUrl];
        const mockCmdArgs = {
            args: mockArgs,
            getArgN: function(n) { return this.args[n - 1]; }
        };

        // 延迟一小段时间后直接调用 solve，避免与发送过渡语冲突
        setTimeout(() => {
            logaiCmd.solve(ctx, msg, mockCmdArgs);
        }, 800);
    };

    console.log('[自动分析] 结团自动分析插件已启动（直接调用模式）');
})();