// ==UserScript==
// @name         COC角色卡转FUT球员卡2
// @author       Claude, Air
// @version      3.0.0
// @description  FUT角色卡扩展版：双循环生涯、新闻发布会与独立沉浸经理模式
// @timestamp    1783166013
// @license      MIT
// ==/UserScript==

let ext = seal.ext.find('coc-fut-card2');
if (!ext) {
  ext = seal.ext.new('coc-fut-card2', 'Claude, Air', '3.0.0');
  seal.ext.register(ext);
}

// 需要保证有此项配置以获取 OneBot 的下载链接
seal.ext.registerStringConfig(ext, "OneBot_API_地址", "http://127.0.0.1:34567", "Bot客户端(Lagrange/LLOneBot/GOCQ)的HTTP监听地址");

async function sendHelpImage(ctx, msg, backend, category) {
    try {
        let r = await (await fetch(`${backend}/help?category=${category}`)).json();
        if (r.status === "ok") {
            let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.name)}&t=${Date.now()}`;
            seal.replyToSender(ctx, msg, `[CQ:image,file=${imgUrl},cache=0]`);
        } else {
            seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
        }
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 帮助图生成失败: ${e.message}`);
    }
}

function replyImmersiveResult(ctx, msg, backend, result) {
    let prefix = result.status === "ok" ? "🏢" : "❌";
    let image = "";
    if (result.img) {
        let imageUrl = `${backend}/get_img?title=${encodeURIComponent(result.img)}&t=${Date.now()}`;
        image = `\n[CQ:image,file=${imageUrl},cache=0]`;
    }
    seal.replyToSender(ctx, msg, `${prefix} ${result.msg}${image}`);
}

async function replyMatchCommandResult(ctx, msg, backend, r) {
    if (r.status !== "ok") {
        seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
        return;
    }
    if (r.phase === "waiting") {
        seal.replyToSender(ctx, msg, `✍️ ${r.msg}`);
        return;
    }
    let imgUrl = r.img ? `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}` : "";
    if (r.phase === "round_end") {
        seal.replyToSender(ctx, msg,
            `📢 【回合战报】 比分 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n➡️ 第 ${r.next_round} 回合继续下令`);
    } else if (r.phase === "final") {
        let ratingsUrl = `${backend}/get_img?title=${encodeURIComponent(r.final.ratings_img)}&t=${Date.now()}`;
        seal.replyToSender(ctx, msg,
            `🏆 【终场】 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n⭐ MVP: ${r.final.mvp}\n[CQ:image,file=${ratingsUrl},cache=0]`);
    } else if (r.phase === "draw_choice") {
        seal.replyToSender(ctx, msg,
            `⚖️ 【常规时间结束】 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n${r.msg}`);
    }
}

async function replyCareerCommandResult(ctx, msg, backend, r) {
    if (r.status !== "ok") {
        seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
        return;
    }
    let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}`;
    let carried = r.continued_tactic ? `\n↩️ 沿用战术【${r.continued_tactic}】` : "";
    if (r.phase === "round_end" || r.phase === "extra_start" || r.phase === "shootout_start") {
        let next = r.phase === "round_end" ? `\n➡️ 第 ${r.next_round} 回合继续下令` : `\n${r.msg || ""}`;
        seal.replyToSender(ctx, msg,
            `📢 vs ${r.opp} · 比分 ${r.score}${carried}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]${next}`);
        return;
    }
    let ratingsUrl = `${backend}/get_img?title=${encodeURIComponent(r.ratings_img)}&t=${Date.now()}`;
    let postUrl = r.post_img ? `${backend}/get_img?title=${encodeURIComponent(r.post_img)}&t=${Date.now()}` : "";
    let postImage = postUrl ? `\n[CQ:image,file=${postUrl},cache=0]` : "";
    let press = r.press_available ? `\n\n${r.press_prompt || "🎙️ 可参加发布会：.生涯 发布会 查看"}\n回复：.生涯 发布会 <选项或序号>` : "";
    seal.replyToSender(ctx, msg,
        `${r.won ? "🏆" : (r.draw ? "🤝" : "😞")} vs ${r.opp} ${r.score}${carried}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n⭐ MVP: ${r.mvp}\n[CQ:image,file=${ratingsUrl},cache=0]${postImage}${press}`);
}

// 统一提取：保存上传的表格文件信息
function saveCocExcelFile(ctx, msg, file) {
    if (!msg.groupId || !file) return;
    let filename = file.name || "";
    if (!filename) return;

    // 检测后缀是否为 xlsx 或 xls
    let lowerName = filename.toLowerCase();
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        let fileInfo = {
            name: filename,
            file_id: file.id || file.file_id || "",
            busid: file.busid || 0
        };

        if (!fileInfo.file_id) return;
        
        // 存储该群最后一份表格文件
        ext.storageSet(`coc_last_excel_${msg.groupId}`, JSON.stringify(fileInfo));
        //seal.replyToSender(ctx, msg, `📂 成功捕获COC角色卡【${filename}】\n输入【.球员卡】将其转化为 FUT 风格战力卡片！`);
    }
}

// --- 路径1：标准群文件上传回调（适用于旧版/部分适配器） ---
ext.onGroupUpload = (ctx, msg, file) => {
    saveCocExcelFile(ctx, msg, file);
};

// --- 路径2：CQ码文件上报回调（适用于大部分新版框架，如LLOneBot） ---
ext.onNotCommandReceived = (ctx, msg) => {
    if (!msg || !msg.groupId || !msg.message) return;
    // 如果消息里不含 CQ:file，直接放行
    if (!msg.message.includes("[CQ:file,")) return;

    // 提取 CQ:file 里的参数
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
        busid: params.busid || 0
    };
    
    saveCocExcelFile(ctx, msg, file);
};


// --- 主体功能指令 ---
const cmdFut = seal.ext.newCmdItemInfo();
cmdFut.name = '球员卡';
cmdFut.help = '用法：上传Excel格式的COC角色卡后，输入【.球员卡】生成FUT球员卡。';

cmdFut.solve = async (ctx, msg, cmdArgs) => {
    let groupId = ctx.group.groupId;
    if (!groupId.includes('Group')) {
        seal.replyToSender(ctx, msg, '❌ 该功能仅限在群聊中使用。');
        return seal.ext.newCmdExecuteResult(true);
    }

    // 【新增】判断是否守门员卡：命令名后缀 "守门员" 或首个参数为 "守门员"/"gk"
    let arg1 = (cmdArgs.getArgN(1) || "").toLowerCase();
    let role = "player";
    if (cmdArgs.command === "球员卡守门员" 
        || arg1 === "守门员" || arg1 === "gk" || arg1 === "守门") {
        role = "gk";
    }

    let fileDataStr = ext.storageGet(`coc_last_excel_${groupId}`);
    if (!fileDataStr) {
        seal.replyToSender(ctx, msg, '❌ 当前群没有检测到新上传的 Excel 角色卡。请先发送表格！');
        return seal.ext.newCmdExecuteResult(true);
    }

    let fileData = JSON.parse(fileDataStr);
    let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
    if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);
    let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));

    let roleLabel = role === "gk" ? "守门员" : "六维战力";
    seal.replyToSender(ctx, msg, `正在拉取【${fileData.name}】进行${roleLabel}转换，请稍候...`);

    try {
        let urlResp = await fetch(`${onebotApiUrl}/get_group_file_url`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ group_id: onebotGroupId, file_id: fileData.file_id, busid: fileData.busid })
        });
        let urlJson = await urlResp.json();
        if (!urlJson || !urlJson.data || !urlJson.data.url) {
            seal.replyToSender(ctx, msg, `❌ 获取文件下载直链失败。请检查 OneBot API 地址。`);
            return seal.ext.newCmdExecuteResult(true);
        }

        // 【改动】URL 加 role 参数
        let userId = ctx.player.userId.replace(/^QQ:/, '');
        let userKey = userId;
        let backendUrl = `http://127.0.0.1:22000/generate_fut?url=${encodeURIComponent(urlJson.data.url)}&role=${role}&user_key=${userKey}`;
        let resp = await fetch(backendUrl);
        let resJson = await resp.json();

        if (resJson.status === "ok") {
            const imgUrl = `http://127.0.0.1:22000/get_img?title=${encodeURIComponent(resJson.name)}&t=${new Date().getTime()}`;
            let prefix = role === "gk" ? "🧤 门将驻守！" : "🎉 锻造完成！";
            const specialPrefix = {
                "赛季热度":     "🔥🔥🔥 赛季热度爆表！锋线杀神现世！",
                "周最佳":       "❄️ 周最佳蓝卡触发！本周之星！",
                "赛季新星":     "🌠 彗星横空出世！赛季新星现身！",
                "超新星":       "💥 老将爆炸！经验点满的超新星降临！",
                "转会焦点":     "💜 媒体炸锅！紫罗兰转会焦点球员亮相！",
                "怪异天赋":     "🌿 无师自通！全靠本能踢球的怪异天才！",
                "客串大师":     "🎭 万金油！客串大师，走到哪都是自家人！",
            };
            // 剥掉 "闪卡" 后缀再匹配
            let tierBase = resJson.tier.replace("闪卡", "").trim();
            if (specialPrefix[tierBase]) {
                prefix = specialPrefix[tierBase];
            }
            seal.replyToSender(ctx, msg, `${prefix}\n总评：${resJson.ovr} | 品质：【${resJson.tier}】\n[CQ:image,file=${imgUrl},cache=0]`);
            ext.storageSet(`coc_last_excel_${groupId}`, "");
        } else {
            seal.replyToSender(ctx, msg, `❌ 卡片锻造失败：${resJson.msg}`);
        }
    } catch (e) {
        console.error("FUT 转换出错: ", e);
        seal.replyToSender(ctx, msg, `❌ 插件执行错误：${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['球员卡'] = cmdFut;
ext.cmdMap['coc球员卡'] = cmdFut;
ext.cmdMap['球员卡守门员'] = cmdFut;   // 【新增】独立命令

const cmdSquad = seal.ext.newCmdItemInfo();
cmdSquad.name = '球队';
cmdSquad.help = "球队管理指令。输入 .球队 帮助 查看完整用法图";


cmdSquad.solve = async (ctx, msg, cmdArgs) => {
    let groupId = ctx.group.groupId;
    if (!groupId.includes('Group')) {
        seal.replyToSender(ctx, msg, '❌ 该功能仅限在群聊中使用。');
        return seal.ext.newCmdExecuteResult(true);
    }
    let userId = ctx.player.userId.replace(/^QQ:/, '');
    let userKey = userId;
    let backend = "http://127.0.0.1:22000";

    let sub = (cmdArgs.getArgN(1) || "").toLowerCase();
    // 收集从第 2 个参数起的所有 token
    let rest = [];
    for (let i = 2; i <= cmdArgs.args.length; i++) {
        let a = cmdArgs.getArgN(i);
        if (a) rest.push(a);
    }

    try {
        // 统一提取 context（默认 pvp）
        let ctxToken = rest.find(t => t && t.toLowerCase().startsWith("context="));
        let context = "pvp";
        if (ctxToken) {
            context = ctxToken.split("=")[1] || "pvp";
            rest = rest.filter(t => t !== ctxToken);
        }
        // === 批量上场 ===
        if (sub === "上场" || sub === "布阵") {
            // 检测有 @ 的 token → 批量模式；否则老式两参数模式
            let hasAt = rest.some(t => t.includes("@"));
            if (hasAt) {
                // 提取 context 参数
                let ctxToken = rest.find(t => t.toLowerCase().startsWith("context="));
                let ctx0 = ctxToken ? ctxToken.split("=")[1] : "pvp";
                let assignments = rest.filter(t => t.includes("@") && !t.toLowerCase().startsWith("context=")).join(",");
                let url = `${backend}/team/lineup?user_key=${userKey}&assignments=${encodeURIComponent(assignments)}&context=${ctx0}`;
                let r = await (await fetch(url)).json();
                seal.replyToSender(ctx, msg, r.status==="ok"?`✅ [${ctx0}] ${r.msg}`:`❌ ${r.msg}`);
            } else if (rest.length >= 2) {
                // 兼容旧格式 .球队 上场 <名> <位置>
                let url = `${backend}/team/add?user_key=${userKey}&name=${encodeURIComponent(rest[0])}&slot=${encodeURIComponent(rest[1])}&context=${context}`;
                let r = await (await fetch(url)).json();
                seal.replyToSender(ctx, msg, r.status==="ok"?`✅ ${r.msg}`:`❌ ${r.msg}`);
            } else {
                seal.replyToSender(ctx, msg, "用法: .球队 上场 张三@ST 李四@LW 王五@LCB");
            }
        }
        // === 批量替补 ===
        else if (sub === "替补" || sub === "bench") {
            let names = rest.join(",");
            let url = `${backend}/team/bench_batch?user_key=${userKey}&names=${encodeURIComponent(names)}&context=${context}`;
            let r = await (await fetch(url)).json();
            seal.replyToSender(ctx, msg, r.status==="ok"?`✅ ${r.msg}`:`❌ ${r.msg}`);
        }
        // === 自动布阵 ===
        else if (sub === "自动布阵" || sub === "auto") {
            let r = await (await fetch(`${backend}/team/auto?user_key=${userKey}&context=${context}`)).json();
            seal.replyToSender(ctx, msg, r.status==="ok"?`✅ ${r.msg}`:`❌ ${r.msg}`);
        }
        // === 单个加入（保留） ===
        else if (sub === "加入" || sub === "add") {
            let url = `${backend}/team/add?user_key=${userKey}&name=${encodeURIComponent(rest[0]||'')}&slot=${encodeURIComponent(rest[1]||'')}&context=${context}`;
            let r = await (await fetch(url)).json();
            seal.replyToSender(ctx, msg, r.status==="ok"?`✅ ${r.msg}`:`❌ ${r.msg}`);
        }
        else if (sub === "移除") {
            let r = await (await fetch(`${backend}/team/remove?user_key=${userKey}&name=${encodeURIComponent(rest[0]||'')}&context=${context}`)).json();
            seal.replyToSender(ctx, msg, r.status==="ok"?`✅ ${r.msg}`:`❌ ${r.msg}`);
        }
        else if (sub === "阵型") {
            let r = await (await fetch(`${backend}/team/formation?user_key=${userKey}&name=${encodeURIComponent(rest[0]||'')}&context=${context}`)).json();
            seal.replyToSender(ctx, msg, r.status==="ok"?`✅ ${r.msg}`:`❌ ${r.msg}`);
        }
        else if (sub === "列表" || sub === "list") {
            seal.replyToSender(ctx, msg, "📋 生成阵容图中...");
            let r = await (await fetch(`${backend}/team/list?user_key=${userKey}&context=${context}`)).json();
            if (r.status === "ok") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.name)}&t=${Date.now()}`;
                seal.replyToSender(ctx, msg, `[CQ:image,file=${imgUrl},cache=0]`);
            } else {
                seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
            }
        }
        else if (sub === "出征" || sub === "render") {
            seal.replyToSender(ctx, msg, "⚽ 球队集结中，请稍候...");
            let r = await (await fetch(`${backend}/team/render?user_key=${userKey}&coach_qq=${userId}&context=${context}`)).json();
            if (r.status === "ok") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.name)}&t=${Date.now()}`;
                seal.replyToSender(ctx, msg, `🏆 集结完成！全队均值 ${r.avg}，教练：【${r.tier}】\n[CQ:image,file=${imgUrl},cache=0]`);
            } else {
                seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
            }
        }
        else if (sub === "战术" || sub === "风格" || sub === "style") {
            let styleArg = rest.join("") || "";
            let url = `${backend}/team/style?user_key=${userKey}&style=${encodeURIComponent(styleArg)}&context=${context}`;
            let r = await (await fetch(url)).json();
            seal.replyToSender(ctx, msg, r.status==="ok" ? `⚙️ ${r.msg}` : `❌ ${r.msg}`);
        }
        else if (sub === "改名" || sub === "rename") {
            if (!rest[0]) {
                seal.replyToSender(ctx, msg, "用法: .球队 改名 <新队名>（最长12字，允许中英文数字与 -·_.）");
                return seal.ext.newCmdExecuteResult(true);
            }
            let newName = rest.join(" ");
            let r = await (await fetch(`${backend}/team/rename?user_key=${userKey}&name=${encodeURIComponent(newName)}`)).json();
            seal.replyToSender(ctx, msg, r.status === "ok" ? `🏷️ ${r.msg}` : `❌ ${r.msg}`);
        }
        else if (sub === "战绩" || sub === "档案" || sub === "profile") {
            seal.replyToSender(ctx, msg, "📊 生成战绩卡中...");
            let r = await (await fetch(`${backend}/profile?user_key=${userKey}`)).json();
            if (r.status === "ok") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.name)}&t=${Date.now()}`;
                seal.replyToSender(ctx, msg, `[CQ:image,file=${imgUrl},cache=0]`);
            } else {
                seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
            }
        }
        else if (sub === "阵容" || sub === "slot") {
            let action = rest[0] || "";
            let acLow = action.toLowerCase();
            
            if (acLow === "" || acLow === "列表" || acLow === "list") {
                let r = await (await fetch(`${backend}/team/slots?user_key=${userKey}`)).json();
                if (r.status !== "ok") { seal.replyToSender(ctx,msg,`❌ ${r.msg}`); return seal.ext.newCmdExecuteResult(true); }
                let lines = ["📚 我的阵容列表:"];
                for (let s of r.slots) {
                    let tags = [];
                    if (r.active.pvp === s) tags.push("⚔️PVP");
                    if (r.active.pve === s) tags.push("🏆PVE");
                    lines.push(`  · ${s} ${tags.join(" ")}`);
                }
                lines.push("\n💡 用法:");
                lines.push(".球队 阵容 新建 <名> [从<名>复制]");
                lines.push(".球队 阵容 切换 pvp/pve <名>");
                lines.push(".球队 阵容 删除 <名>");
                lines.push(".球队 阵容 改名 <旧名> <新名>");
                lines.push("\n💡 编辑指定阵容: .球队 上场 xxx@ST context=<pvp|pve>");
                seal.replyToSender(ctx, msg, lines.join("\n"));
            }
            else if (acLow === "新建" || acLow === "new") {
                let name = rest[1] || "";
                let copyIdx = rest.indexOf("从"); 
                let copyFrom = (copyIdx >= 0) ? (rest[copyIdx+1]||"") : (rest[2]||"");
                let url = `${backend}/team/slot_new?user_key=${userKey}&name=${encodeURIComponent(name)}&copy_from=${encodeURIComponent(copyFrom)}`;
                let r = await (await fetch(url)).json();
                seal.replyToSender(ctx, msg, r.status === "ok" ? `✅ ${r.msg}` : `❌ ${r.msg}`);
            }
            else if (acLow === "删除" || acLow === "delete") {
                let r = await (await fetch(`${backend}/team/slot_delete?user_key=${userKey}&name=${encodeURIComponent(rest[1]||'')}`)).json();
                seal.replyToSender(ctx, msg, r.status === "ok" ? `🗑️ ${r.msg}` : `❌ ${r.msg}`);
            }
            else if (acLow === "切换" || acLow === "switch") {
                let ctxArg = (rest[1]||'').toLowerCase();
                let slotName = rest[2] || '';
                let r = await (await fetch(`${backend}/team/slot_switch?user_key=${userKey}&context=${ctxArg}&name=${encodeURIComponent(slotName)}`)).json();
                seal.replyToSender(ctx, msg, r.status === "ok" ? `🔀 ${r.msg}` : `❌ ${r.msg}`);
            }
            else if (acLow === "改名" || acLow === "rename") {
                let r = await (await fetch(`${backend}/team/slot_rename?user_key=${userKey}&old=${encodeURIComponent(rest[1]||'')}&new=${encodeURIComponent(rest[2]||'')}`)).json();
                seal.replyToSender(ctx, msg, r.status === "ok" ? `🏷️ ${r.msg}` : `❌ ${r.msg}`);
            }
            else {
                seal.replyToSender(ctx, msg, "用法: .球队 阵容 列表/新建/删除/切换/改名");
            }
        }
        else if (sub === "删卡" || sub === "delcard") {
            if (!rest[0]) {
                seal.replyToSender(ctx, msg, "用法: .球队 删卡 <卡名>[,<卡名>...]\n⚠️ 会同时从所有阵容中移除，且删除对应文件");
                return seal.ext.newCmdExecuteResult(true);
            }
            let names = rest.join(",");
            let r = await (await fetch(`${backend}/card/batch_delete?user_key=${userKey}&names=${encodeURIComponent(names)}`)).json();
            seal.replyToSender(ctx, msg, r.status === "ok" ? `🗑️ ${r.msg}` : `❌ ${r.msg}`);
        }
        else if (sub === "帮助" || sub === "help" || sub === "?" || sub === "？") {
            await sendHelpImage(ctx, msg, backend, "squad");
        }
        else {
            await sendHelpImage(ctx, msg, backend, "squad");
        }
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 网络错误: ${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['球队'] = cmdSquad;

const cmdMatch = seal.ext.newCmdItemInfo();
cmdMatch.name = '对战';
cmdMatch.allowDelegate = true;   // ← 关键：允许 @ 目标进入 solve
cmdMatch.help = "PVP 对战指令。输入 .对战 帮助 查看完整用法图";

cmdMatch.solve = async (ctx, msg, cmdArgs) => {
    console.log(`[对战] enter, sub=${cmdArgs.getArgN(1)}, at=${JSON.stringify(cmdArgs.at)}`);
    let groupId = ctx.group.groupId;
    if (!groupId.includes('Group')) { seal.replyToSender(ctx,msg,'❌ 仅限群聊'); return seal.ext.newCmdExecuteResult(true); }
    let backend = "http://127.0.0.1:22000";

    let userId = ctx.player.userId.replace(/^QQ:/,'');
    let userName = ctx.player.name || `玩家${userId}`;
    let userKey = userId;   // 挑战者自己
    if (!ctx.player.name || ctx.player.name === userId) {
        try {
            let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
            if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);
            let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
            let infoResp = await fetch(`${onebotApiUrl}/get_group_member_info`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ group_id: onebotGroupId, user_id: parseInt(userId), no_cache: false })
            });
            let infoJson = await infoResp.json();
            if (infoJson && infoJson.data) {
                let card = (infoJson.data.card || "").trim();
                let nickname = (infoJson.data.nickname || "").trim();
                userName = card || nickname || userName;
            }
        } catch (e) {}
    }

    let sub = (cmdArgs.getArgN(1)||"").toLowerCase();
    let rest = [];
    for (let i=2;i<=cmdArgs.args.length;i++){ let a=cmdArgs.getArgN(i); if(a) rest.push(a); }

    try {
        // 统一提取 context（默认 pvp）
        let ctxToken = rest.find(t => t && t.toLowerCase().startsWith("context="));
        let context = "pvp";
        if (ctxToken) {
            context = ctxToken.split("=")[1] || "pvp";
            rest = rest.filter(t => t !== ctxToken);
        }
        if (sub === "挑战") {
            // 找被 @ 的人
            let toId = null;
            let selfId = "";
            try {
                if (ctx.endPoint && ctx.endPoint.userId) {
                    selfId = String(ctx.endPoint.userId).replace(/^QQ:/, '');
                }
            } catch (e) {}

            if (cmdArgs.at && cmdArgs.at.length > 0) {
                for (let i = 0; i < cmdArgs.at.length; i++) {
                    let at = cmdArgs.at[i];
                    let atUid = String(at.userId || "").replace(/^QQ:/, '');
                    if (atUid && atUid !== userId && atUid !== selfId) {
                        toId = atUid;
                        break;
                    }
                }
            }
            if (!toId) {
                let atMatch = (msg.message || "").match(/\[CQ:at,qq=(\d+)\]/);
                if (atMatch) toId = atMatch[1];
            }
            if (!toId) {
                seal.replyToSender(ctx, msg, "请用 @ 指定对手，例：.对战 挑战 @玩家B");
                return seal.ext.newCmdExecuteResult(true);
            }

            // 拉取对方群名片
            let toName = `玩家${toId}`;
            try {
                let onebotApiUrl = seal.ext.getStringConfig(ext, "OneBot_API_地址");
                if (onebotApiUrl.endsWith('/')) onebotApiUrl = onebotApiUrl.slice(0, -1);
                let onebotGroupId = parseInt(groupId.replace('QQ-Group:', ''));
                let infoResp = await fetch(`${onebotApiUrl}/get_group_member_info`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ group_id: onebotGroupId, user_id: parseInt(toId), no_cache: false })
                });
                let infoJson = await infoResp.json();
                if (infoJson && infoJson.data) {
                    let card = (infoJson.data.card || "").trim();
                    let nickname = (infoJson.data.nickname || "").trim();
                    toName = card || nickname || toName;
                }
            } catch (e) {
                console.log(`[对战] 获取对手昵称失败: ${e.message}`);
            }

            let url = `${backend}/match/challenge?from_key=${userKey}&to_key=${toId}&from_name=${encodeURIComponent(userName)}&to_name=${encodeURIComponent(toName)}`;
            let r = await (await fetch(url)).json();
            seal.replyToSender(ctx, msg, r.status==="ok" ? `⚔️ ${r.msg}\n对手输入 .对战 应战 接受` : `❌ ${r.msg}`);
        }
        else if (sub === "应战") {
            let r = await (await fetch(`${backend}/match/accept?user_key=${userKey}&name=${encodeURIComponent(userName)}`)).json();
            seal.replyToSender(ctx,msg, r.status==="ok" ? `🏁 ${r.msg}` : `❌ ${r.msg}`);
        }
        else if (["进攻","防守","平衡","全力进攻","全力防守","attack","defend","balance","all_attack","all_defend"].includes(sub)) {
            let r = await (await fetch(`${backend}/match/tactic?user_key=${userKey}&tactic=${encodeURIComponent(sub)}&name=${encodeURIComponent(userName)}`)).json();
            if (r.status !== "ok") { seal.replyToSender(ctx,msg,`❌ ${r.msg}`); return seal.ext.newCmdExecuteResult(true); }
            if (r.phase === "waiting") { seal.replyToSender(ctx,msg, `✍️ ${r.msg}`); }
            else if (r.phase === "round_end") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}`;
                seal.replyToSender(ctx,msg,
                    `📢 【第 ${r.next_round-1} 回合战报】 比分 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n➡️ 第 ${r.next_round} 回合，双方请下达战术`);
            } else if (r.phase === "final") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}`;
                let ratingsImgUrl = `${backend}/get_img?title=${encodeURIComponent(r.final.ratings_img)}&t=${Date.now()}`;
                let elo = r.final.elo_delta || {home:0, away:0};
                let eloLine = `\n📈 ELO ${elo.home>=0?'+':''}${elo.home} / ${elo.away>=0?'+':''}${elo.away}`;
                seal.replyToSender(ctx, msg,
                    `🏆 【终场】 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n🥇 ${r.final.winner === '平局' ? '战成平局' : r.final.winner + ' 获胜'}  ⭐ MVP: ${r.final.mvp}${eloLine}\n[CQ:image,file=${ratingsImgUrl},cache=0]`);
            }
            else if (r.phase === "draw_choice") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}`;
                seal.replyToSender(ctx, msg,
                    `⚖️ 【常规时间结束】 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n${r.msg}`);
            }
            else if (r.phase === "extra_start") {
                seal.replyToSender(ctx, msg, `⏰ ${r.msg}`);
            }
        }
        else if (sub === "喊话" || sub === "shout" || sub === "指令" || sub === "focus") {
            if (rest.length < 1) {
                seal.replyToSender(ctx, msg,
                    sub === "喊话" || sub === "shout"
                        ? "用法: .对战 喊话 <鼓励|冷静|批评|施压>"
                        : "用法: .对战 指令 <传球|远射|突破|防守>");
                return seal.ext.newCmdExecuteResult(true);
            }
            let kind = (sub === "喊话" || sub === "shout") ? "shout" : "focus";
            let r = await (await fetch(`${backend}/match/command?user_key=${userKey}&kind=${kind}&value=${encodeURIComponent(rest[0])}`)).json();
            await replyMatchCommandResult(ctx, msg, backend, r);
        }
        else if (sub === "换人") {
            if (rest.length < 2) { seal.replyToSender(ctx,msg,"用法: .对战 换人 <替补名> <被换下者>"); return seal.ext.newCmdExecuteResult(true); }
            let r = await (await fetch(`${backend}/match/sub?user_key=${userKey}&on=${encodeURIComponent(rest[0])}&off=${encodeURIComponent(rest[1])}`)).json();
            seal.replyToSender(ctx,msg, r.status==="ok" ? `🔄 ${r.msg}` : `❌ ${r.msg}`);
        }
        else if (sub === "状态") {
            seal.replyToSender(ctx,msg,"（可用 .球队 列表 查看阵容，比赛进程通过战术指令推进）");
        }
        // 加时/点球二选一
        else if (sub === "加时" || sub === "点球" || sub === "接受" || sub === "接受平局") {
            let choiceMap = {"加时":"extra","点球":"penalty","接受":"accept","接受平局":"accept"};
            let choice = choiceMap[sub];
            let r = await (await fetch(`${backend}/match/tiebreak?user_key=${userKey}&choice=${choice}`)).json();
            if (r.status !== "ok") { seal.replyToSender(ctx,msg,`❌ ${r.msg}`); return seal.ext.newCmdExecuteResult(true); }

            if (r.phase === "final_draw") {
                let ratingsImgUrl = `${backend}/get_img?title=${encodeURIComponent(r.final.ratings_img)}&t=${Date.now()}`;
                let elo = r.final.elo_delta || {home:0, away:0};
                let eloLine = `\n📈 ELO ${elo.home>=0?'+':''}${elo.home} / ${elo.away>=0?'+':''}${elo.away}`;
                seal.replyToSender(ctx, msg,
                    `🤝 【平局收场】 ${r.score}\n${r.msg}\n\n⭐ MVP: ${r.final.mvp}${eloLine}\n[CQ:image,file=${ratingsImgUrl},cache=0]`);
            } else {
                seal.replyToSender(ctx, msg, `⚖️ ${r.msg}`);
            }
        }
        // 点球指挥：.对战 点球 <射> <守>
        // 上面已经吃掉 sub=="点球"，所以点球指挥要用另一个前缀
        else if (sub === "pk指挥" || sub === "指挥") {
            if (rest.length < 2) {
                seal.replyToSender(ctx, msg, "用法: .对战 指挥 <射门策略> <守门策略>\n策略：激进 / 平衡 / 稳重 / 花哨");
                return seal.ext.newCmdExecuteResult(true);
            }
            let r = await (await fetch(`${backend}/match/penalty?user_key=${userKey}&kicker=${encodeURIComponent(rest[0])}&gk=${encodeURIComponent(rest[1])}`)).json();
            if (r.status !== "ok") { seal.replyToSender(ctx,msg,`❌ ${r.msg}`); return seal.ext.newCmdExecuteResult(true); }
            if (r.phase === "waiting_pen") {
                seal.replyToSender(ctx, msg, `🎯 ${r.msg}`);
            } else if (r.phase === "shootout_round") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}`;
                seal.replyToSender(ctx, msg, `${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n➡️ 继续输入 .对战 指挥 <射> <守>`);
            } else if (r.phase === "shootout_final") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}`;
                let ratingsImgUrl = `${backend}/(get_img?title=${encodeURIComponent(r.final.ratings_img)}&t=${Date.now()}`;
                seal.replyToSender(ctx, msg,
                    `🏆 【点球大战终】 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n🥇 ${r.final.winner} 获胜  ⭐ MVP: ${r.final.mvp}${eloLine}\n[CQ:image,file=${ratingsImgUrl},cache=0]`);
            }
        }
        else if (sub === "中止" || sub === "放弃" || sub === "abort") {
            let r = await (await fetch(`${backend}/match/abort?user_key=${userKey}`)).json();
            seal.replyToSender(ctx, msg, `🚫 ${r.msg}`);
        }
        else if (sub === "帮助" || sub === "help" || sub === "?" || sub === "？") {
            await sendHelpImage(ctx, msg, backend, "match");
        }
        else {
            await sendHelpImage(ctx, msg, backend, "match");
        }
    } catch (e) {
        seal.replyToSender(ctx,msg, `❌ 错误: ${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['对战'] = cmdMatch;
ext.cmdMap['pk'] = cmdMatch;

const cmdLB = seal.ext.newCmdItemInfo();
cmdLB.name = '排行榜';
cmdLB.help = '.排行榜 - 查看全服 ELO 排行榜';
cmdLB.solve = async (ctx, msg, cmdArgs) => {
    let backend = "http://127.0.0.1:22000";
    seal.replyToSender(ctx, msg, "🏆 生成排行榜中...");
    try {
        let r = await (await fetch(`${backend}/leaderboard`)).json();
        if (r.status === "ok") {
            let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.name)}&t=${Date.now()}`;
            seal.replyToSender(ctx, msg, `[CQ:image,file=${imgUrl},cache=0]`);
        } else {
            seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
        }
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 网络错误: ${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['排行榜'] = cmdLB;
ext.cmdMap['榜单'] = cmdLB;
ext.cmdMap['leaderboard'] = cmdLB;

const cmdCareer = seal.ext.newCmdItemInfo();
cmdCareer.name = '生涯';
cmdCareer.help = "生涯模式指令。输入 .生涯 帮助 查看完整用法图";

cmdCareer.solve = async (ctx, msg, cmdArgs) => {
    let backend = "http://127.0.0.1:22000";
    let userId = ctx.player.userId.replace(/^QQ:/,'');
    let userKey = userId;
    let sub = (cmdArgs.getArgN(1)||"").toLowerCase();
    let arg2 = cmdArgs.getArgN(2) || "";
    let arg3 = cmdArgs.getArgN(3) || "";

    try {
        if (sub === "联赛") {
            if (arg2 === "开始" || arg2 === "start") {
                let r = await (await fetch(`${backend}/career/start?user_key=${userKey}&mode=league`)).json();
                seal.replyToSender(ctx, msg, r.status==="ok" ? `${r.msg}` : `❌ ${r.msg}`);
            } else seal.replyToSender(ctx, msg, "用法: .生涯 联赛 开始");
        }
        else if (sub === "杯赛") {
            if (arg2 === "开始" || arg2 === "start") {
                let r = await (await fetch(`${backend}/career/start?user_key=${userKey}&mode=cup`)).json();
                seal.replyToSender(ctx, msg, r.status==="ok" ? `${r.msg}` : `❌ ${r.msg}`);
            } else seal.replyToSender(ctx, msg, "用法: .生涯 杯赛 开始");
        }
        else if (sub === "出战" || sub === "play") {
            if (!arg2) {
                seal.replyToSender(ctx, msg,
                    "⚠️ 请指定战术\n用法：.生涯 出战 <战术>\n" +
                    "可用：全力进攻 / 进攻 / 平衡 / 防守 / 全力防守");
                return seal.ext.newCmdExecuteResult(true);
            }
            const validTactics = ["全力进攻","进攻","平衡","防守","全力防守",
                                   "attack","defend","balance","all_attack","all_defend",
                                   "allattack","alldefend"];
            if (!validTactics.includes(arg2.toLowerCase()) &&
                !validTactics.includes(arg2)) {
                seal.replyToSender(ctx, msg,
                    `⚠️ 未知战术【${arg2}】\n` +
                    "可用：全力进攻 / 进攻 / 平衡 / 防守 / 全力防守");
                return seal.ext.newCmdExecuteResult(true);
            }
            let tac = arg2;
            // 快速提示当前 PvE 阵容
            let listResp = await (await fetch(`${backend}/team/slots?user_key=${userKey}`)).json();
            let pveSlot = listResp.status==="ok" ? listResp.active.pve : "default";
            seal.replyToSender(ctx, msg, `⚽ 战术【${tac}】 · 使用 PvE 阵容【${pveSlot}】...`);
            let r = await (await fetch(`${backend}/career/play?user_key=${userKey}&tactic=${encodeURIComponent(tac)}`)).json();
            if (r.status !== "ok") { seal.replyToSender(ctx,msg,`❌ ${r.msg}`); return seal.ext.newCmdExecuteResult(true); }
            let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}`;
            
            if (r.phase === "round_end") {
                seal.replyToSender(ctx, msg,
                    `📢 vs ${r.opp} · 第 ${r.round} 回合结束  比分 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n🤖 AI 战术【${r.ai_tactic}】\n➡️ 第 ${r.next_round} 回合，输入 .生涯 出战 <战术>`); 
            } else if (r.phase === "extra_start") {
                seal.replyToSender(ctx, msg,
                    `📢 vs ${r.opp} · 第 ${r.round} 回合结束  比分 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n🤖 AI 战术【${r.ai_tactic}】\n\n${r.msg}`);
            } else if (r.phase === "shootout_start") {
                seal.replyToSender(ctx, msg,
                    `📢 vs ${r.opp} · 加时结束  比分 ${r.score}\n${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n${r.msg}`);
            } else if (r.phase === "final") {
                let icon = r.won ? "🏆" : (r.draw ? "🤝" : "😞");
                let head = `${icon} vs ${r.opp}  ${r.score}`;
                let ratingsUrl = `${backend}/get_img?title=${encodeURIComponent(r.ratings_img)}&t=${Date.now()}`;
                let so = r.shootout ? `\n\n${r.shootout}` : "";
                let postUrl = r.post_img ? `${backend}/get_img?title=${encodeURIComponent(r.post_img)}&t=${Date.now()}` : "";
                let postImage = postUrl ? `\n[CQ:image,file=${postUrl},cache=0]` : "";
                let reminder = r.ending_reminder ? `\n\n${r.ending_reminder}` : "";  // ← 新增
                let press = r.press_available ? `\n\n${r.press_prompt || "🎙️ 可参加发布会：.生涯 发布会 查看"}\n回复：.生涯 发布会 <选项或序号>` : "";
                let extra = "";
                if (r.ended) {
                    if (r.cup_winner === "user") extra = "\n\n🏆🏆🏆 恭喜！你举起了冠军奖杯！";
                    else if (r.cup_winner === "eliminated_group") extra = "\n\n🚫 小组赛出局，赛季结束";
                    else if (r.cup_winner === "eliminated_ko") extra = "\n\n🚫 淘汰赛失利，赛季结束";
                    else if (r.cup_winner) extra = `\n\n🏆 赛季结束，冠军：${r.cup_winner}`;
                    else extra = "\n\n🏁 联赛全部结束！用 .生涯 状态 看最终成绩";
                }
                seal.replyToSender(ctx, msg,
                    `${head}\n${r.commentary}${so}\n[CQ:image,file=${imgUrl},cache=0]\n\n⭐ MVP: ${r.mvp}\n[CQ:image,file=${ratingsUrl},cache=0]${postImage}${reminder}${extra}${press}`);
            }
        }
        else if (sub === "喊话" || sub === "shout" || sub === "指令" || sub === "focus") {
            if (!arg2) {
                seal.replyToSender(ctx, msg,
                    sub === "喊话" || sub === "shout"
                        ? "用法: .生涯 喊话 <鼓励|冷静|批评|施压>"
                        : "用法: .生涯 指令 <传球|远射|突破|防守>");
                return seal.ext.newCmdExecuteResult(true);
            }
            let kind = (sub === "喊话" || sub === "shout") ? "shout" : "focus";
            let r = await (await fetch(`${backend}/career/command?user_key=${userKey}&kind=${kind}&value=${encodeURIComponent(arg2)}`)).json();
            await replyCareerCommandResult(ctx, msg, backend, r);
        }
        else if (sub === "发布会" || sub === "新闻发布会" || sub === "press") {
            let choice = arg2 || "查看";
            let r = await (await fetch(`${backend}/career/press?user_key=${userKey}&choice=${encodeURIComponent(choice)}`)).json();
            if (r.status !== "ok") {
                seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
            } else if (r.phase === "question") {
                seal.replyToSender(ctx, msg,
                    `${r.prompt}\n\n回复：.生涯 发布会 <选项或序号>`);
            } else {
                seal.replyToSender(ctx, msg, `🎙️ ${r.msg}`);
            }
        }
        else if (sub === "点球" || sub === "pk" || sub === "penalty") {
            let arg3 = cmdArgs.getArgN(3) || "";
            if (!arg2 || !arg3) {
                seal.replyToSender(ctx, msg,
                    "用法: .生涯 点球 <射门方向> <扑救方向>\n" +
                    "方向：左 / 中 / 右\n" +
                    "例：.生涯 点球 左 中  ← 你射左路，门将扑中路");
                return seal.ext.newCmdExecuteResult(true);
            }
            const validDirs = ["左","中","右","左路","中路","右路",
                                "left","center","right","middle",
                                "l","c","r","L","C","R"];
            if (!validDirs.includes(arg2) || !validDirs.includes(arg3)) {
                seal.replyToSender(ctx, msg,
                    "⚠️ 方向需为：左 / 中 / 右");
                return seal.ext.newCmdExecuteResult(true);
            }
            let r = await (await fetch(`${backend}/career/pen?user_key=${userKey}&shot=${encodeURIComponent(arg2)}&save=${encodeURIComponent(arg3)}`)).json();
            if (r.status !== "ok") { seal.replyToSender(ctx,msg,`❌ ${r.msg}`); return seal.ext.newCmdExecuteResult(true); }
            let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.img)}&t=${Date.now()}`;
            if (r.phase === "shootout_round") {
                seal.replyToSender(ctx, msg,
                    `${r.commentary}\n[CQ:image,file=${imgUrl},cache=0]\n\n➡️ 继续 .生涯 点球 <射方向> <扑救方向>`);
            } else if (r.phase === "shootout_final") {
                let ratingsUrl = `${backend}/get_img?title=${encodeURIComponent(r.ratings_img)}&t=${Date.now()}`;
                let icon = r.won ? "🏆" : "😞";
                let head = `${icon} vs ${r.opp} · 点球胜负 ${r.score}`;
                let shootout = r.shootout ? `\n${r.shootout}` : "";
                let postUrl = r.post_img ? `${backend}/get_img?title=${encodeURIComponent(r.post_img)}&t=${Date.now()}` : "";
                let postImage = postUrl ? `\n[CQ:image,file=${postUrl},cache=0]` : "";
                let reminder = r.ending_reminder ? `\n\n${r.ending_reminder}` : "";
                let press = r.press_available ? `\n\n${r.press_prompt || "🎙️ 可参加发布会：.生涯 发布会 查看"}\n回复：.生涯 发布会 <选项或序号>` : "";
                let extra = "";
                if (r.ended) {
                    if (r.cup_winner === "user") extra = "\n\n🏆🏆🏆 恭喜你举起冠军奖杯！";
                    else if (r.cup_winner === "eliminated_group") extra = "\n\n🚫 小组赛出局";
                    else if (r.cup_winner === "eliminated_ko") extra = "\n\n🚫 淘汰赛失利";
                    else if (r.cup_winner) extra = `\n\n🏆 冠军：${r.cup_winner}`;
                    else extra = "\n\n🏁 联赛结束！";
                }
                seal.replyToSender(ctx, msg,
                    `${head}${shootout}\n[CQ:image,file=${imgUrl},cache=0]\n\n⭐ MVP: ${r.mvp}\n[CQ:image,file=${ratingsUrl},cache=0]${postImage}${reminder}${extra}${press}`);
            }
        }
        else if (sub === "状态" || sub === "status") {
            seal.replyToSender(ctx, msg, "📊 生成赛季状态中...");
            let r = await (await fetch(`${backend}/career/status?user_key=${userKey}`)).json();
            if (r.status === "ok") {
                let imgUrl = `${backend}/get_img?title=${encodeURIComponent(r.name)}&t=${Date.now()}`;
                seal.replyToSender(ctx, msg, `[CQ:image,file=${imgUrl},cache=0]`);
            } else seal.replyToSender(ctx, msg, `❌ ${r.msg}`);
        }
        else if (sub === "换人" || sub === "sub") {
            let arg3 = cmdArgs.getArgN(3) || "";
            if (!arg2 || !arg3) {
                seal.replyToSender(ctx, msg,
                    "用法: .生涯 换人 <替补名> <首发名>\n" +
                    "例：.生涯 换人 张三 李四  ← 张三替下李四");
                return seal.ext.newCmdExecuteResult(true);
            }
            let r = await (await fetch(
                `${backend}/career/sub?user_key=${userKey}&on=${encodeURIComponent(arg2)}&off=${encodeURIComponent(arg3)}`)).json();
            seal.replyToSender(ctx, msg, r.status==="ok" ? r.msg : `❌ ${r.msg}`);
        }
        else if (sub === "招募" || sub === "recruit") {
            let recruitUrl = `${backend}/career/recruit?user_key=${userKey}`;
            if (arg2 === "选择" || arg2.toLowerCase() === "select") {
                if (!arg3) {
                    seal.replyToSender(ctx, msg, "用法: .生涯 招募 选择 <1/2/3>");
                    return seal.ext.newCmdExecuteResult(true);
                }
                recruitUrl += `&choice=${encodeURIComponent(arg3)}`;
            } else if (arg2) {
                recruitUrl += `&target=${encodeURIComponent(arg2)}`;
            }
            let r = await (await fetch(recruitUrl)).json();
            if (r.status === "ok" && r.phase === "choose" && r.images && r.images.length) {
                let cardImages = r.images.map(name => {
                    let imageUrl = `${backend}/get_img?title=${encodeURIComponent(name)}&t=${Date.now()}`;
                    return `[CQ:image,file=${imageUrl},cache=0]`;
                }).join("\n");
                seal.replyToSender(ctx, msg, `📝 ${r.msg}\n${cardImages}`);
            } else {
                seal.replyToSender(ctx, msg, r.status === "ok" ? `📝 ${r.msg}` : `❌ ${r.msg}`);
            }
        }
        else if (sub === "结束" || sub === "end") {
            let r = await (await fetch(`${backend}/career/end?user_key=${userKey}`)).json();
            seal.replyToSender(ctx, msg, `🚫 ${r.msg}`);
        }
        else if (sub === "帮助" || sub === "help" || sub === "?" || sub === "？") {
            await sendHelpImage(ctx, msg, backend, "career");
        }
        else {
            await sendHelpImage(ctx, msg, backend, "career");
        }
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 错误: ${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};
ext.cmdMap['生涯'] = cmdCareer;
ext.cmdMap['career'] = cmdCareer;

const cmdImmersive = seal.ext.newCmdItemInfo();
cmdImmersive.name = '沉浸';
cmdImmersive.help = "独立沉浸生涯指令。输入 .沉浸 帮助 查看完整用法图";

cmdImmersive.solve = async (ctx, msg, cmdArgs) => {
    const backend = "http://127.0.0.1:22000";
    const userKey = ctx.player.userId.replace(/^QQ:/, '');
    const sub = (cmdArgs.getArgN(1) || "状态").toLowerCase();
    const arg2 = cmdArgs.getArgN(2) || "";
    const arg3 = cmdArgs.getArgN(3) || "";
    const arg4 = cmdArgs.getArgN(4) || "";
    try {
        let url = "";
        if (sub === "开始" || sub === "start") {
            url = `${backend}/immersive/start?user_key=${userKey}&club=${encodeURIComponent(arg2)}`;
        } else if (sub === "状态" || sub === "status" || sub === "面板") {
            url = `${backend}/immersive/status?user_key=${userKey}`;
        } else if (sub === "下一天" || sub === "推进" || sub === "day" || sub === "next") {
            let days = arg2 || "1";
            url = `${backend}/immersive/day?user_key=${userKey}&days=${encodeURIComponent(days)}`;
        } else if (sub === "训练" || sub === "training") {
            if (!arg2) {
                seal.replyToSender(ctx, msg, "用法：.沉浸 训练 <体能|进攻|传球|防守|门将|恢复>\n位置训练：.沉浸 训练 位置 <球员> <位置>");
                return seal.ext.newCmdExecuteResult(true);
            }
            url = `${backend}/immersive/training?user_key=${userKey}&type=${encodeURIComponent(arg2)}` +
                  `&player=${encodeURIComponent(arg3)}&position=${encodeURIComponent(arg4)}`;
        } else if (sub === "战术" || sub === "tactic") {
            if (!arg2) {
                seal.replyToSender(ctx, msg, "用法：.沉浸 战术 <均衡|控球|高压|反击|防守>");
                return seal.ext.newCmdExecuteResult(true);
            }
            url = `${backend}/immersive/tactic?user_key=${userKey}&type=${encodeURIComponent(arg2)}`;
        } else if (sub === "球探" || sub === "scout") {
            if (!arg2) {
                seal.replyToSender(ctx, msg, "用法：.沉浸 球探 <前场|中场|后场|守门员|青年>");
                return seal.ext.newCmdExecuteResult(true);
            }
            url = `${backend}/immersive/scout?user_key=${userKey}&target=${encodeURIComponent(arg2)}`;
        } else if (sub === "签约" || sub === "sign") {
            if (!arg2) {
                seal.replyToSender(ctx, msg, "用法：.沉浸 签约 <1|2|3>");
                return seal.ext.newCmdExecuteResult(true);
            }
            url = `${backend}/immersive/sign?user_key=${userKey}&choice=${encodeURIComponent(arg2)}`;
        } else if (sub === "事件" || sub === "事务" || sub === "event") {
            if (!arg2) {
                seal.replyToSender(ctx, msg, "用法：.沉浸 事件 <1|2|3>");
                return seal.ext.newCmdExecuteResult(true);
            }
            url = `${backend}/immersive/event?user_key=${userKey}&choice=${encodeURIComponent(arg2)}`;
        } else if (sub === "升级" || sub === "upgrade") {
            if (!arg2) {
                seal.replyToSender(ctx, msg, "用法：.沉浸 升级 <训练|球探>");
                return seal.ext.newCmdExecuteResult(true);
            }
            url = `${backend}/immersive/upgrade?user_key=${userKey}&facility=${encodeURIComponent(arg2)}`;
        } else if (sub === "帮助" || sub === "help" || sub === "?" || sub === "？") {
            await sendHelpImage(ctx, msg, backend, "immersive");
            return seal.ext.newCmdExecuteResult(true);
        } else {
            await sendHelpImage(ctx, msg, backend, "immersive");
            return seal.ext.newCmdExecuteResult(true);
        }
        let result = await (await fetch(url)).json();
        replyImmersiveResult(ctx, msg, backend, result);
    } catch (e) {
        seal.replyToSender(ctx, msg, `❌ 沉浸生涯连接失败：${e.message}`);
    }
    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['沉浸'] = cmdImmersive;
ext.cmdMap['沉浸生涯'] = cmdImmersive;
ext.cmdMap['fm'] = cmdImmersive;
