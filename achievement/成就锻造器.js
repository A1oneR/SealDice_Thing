// ==UserScript==
// @name         TRPG成就锻造炉-全能版
// @author       Air
// @version      1.3.7
// ==/UserScript==

let ext = seal.ext.find('achievement_forge');
if (!ext) {
  ext = seal.ext.new('achievement_forge', 'Air', '1.3.7');
  seal.ext.register(ext);
}

// 敏感词检测
async function checkSensitive(text) {
    try {
        const response = await fetch('https://uapis.cn/api/v1/text/profanitycheck', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "text": text })
        });
        const data = await response.json();
        return data.status === 'forbidden';
    } catch (e) { return false; }
}

const cmdForge = seal.ext.newCmdItemInfo();
cmdForge.name = '成就';
cmdForge.help = `TRPG成就锻造炉
用法：.成就 [风格] [标题] [名字/分数] [描述] [主题/颜色]
风格：xbox, ps, 横版, 竖版
主题：暗黑, 羊皮纸, 赛博, 星空, 极简
颜色：支持 #722ed1 格式
示例：.成就 xbox 欧皇 100 连续三个大成功 #ff4d4f
示例：.成就 横版 绝密调查 调查员A 发现了真相 羊皮纸`;

cmdForge.solve = async (ctx, msg, cmdArgs) => {
    let args = cmdArgs.args;
    if (args.length === 0) {
        seal.replyToSender(ctx, msg, cmdForge.help);
        return seal.ext.newCmdExecuteResult(true);
    }

    const backend = "http://127.0.0.1:10000";
    const styles = ["xbox", "ps", "横版", "竖版"];
    
    // 判断查询或新建
    const isQuery = args.length === 1 && !styles.includes(args[0].toLowerCase());
    let title = isQuery ? args[0] : args[1];

    if (!isQuery && args.length >= 2) {
        let style = args[0].toLowerCase();
        let val3 = args[2] || "100";
        let desc = args[3] || "解锁了成就";
        let themeParam = args[4] || "暗黑";

        // 敏感词拦截
        if (await checkSensitive(`${title} ${desc}`)) {
            seal.replyToSender(ctx, msg, "❌ 包含违规内容，拒绝生成。");
            return seal.ext.newCmdExecuteResult(true);
        }

        seal.replyToSender(ctx, msg, `正在锻造成就【${title}】...`);

        // 构建 URL
        let url = `${backend}/create?style=${encodeURIComponent(style)}&title=${encodeURIComponent(title)}&desc=${encodeURIComponent(desc)}`;
        
        // 智能分配名字或分数
        if (style === 'xbox' && !isNaN(parseInt(val3))) {
            url += `&score=${val3}`;
        } else {
            url += `&name=${encodeURIComponent(val3)}`;
        }

        // 自定义颜色判断
        if (themeParam.startsWith('#')) {
            url += `&bg_color=${encodeURIComponent(themeParam)}`;
        } else {
            url += `&theme=${encodeURIComponent(themeParam)}`;
        }

        try {
            const res = await (await fetch(url)).json();
            if (res.status !== "ok") {
                seal.replyToSender(ctx, msg, "❌ 生成失败: " + res.msg);
                return seal.ext.newCmdExecuteResult(true);
            }
        } catch (e) {
            seal.replyToSender(ctx, msg, "❌ 无法连接到后端服务器。");
            return seal.ext.newCmdExecuteResult(true);
        }
    }

    // 最终输出图片
    const imgUrl = `${backend}/get_img?title=${encodeURIComponent(title)}&t=${new Date().getTime()}`;
    seal.replyToSender(ctx, msg, `[CQ:image,file=${imgUrl},cache=0]`);
    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['成就'] = cmdForge;