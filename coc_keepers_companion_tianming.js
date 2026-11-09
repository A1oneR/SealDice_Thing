// ==UserScript==
// @name         COC守秘人伴侣天命生成器 (Keeper's Companion Attributes)
// @author       Antigravity
// @version      1.1.0
// @description  按《克苏鲁的呼唤：守秘人伴侣》(Keeper's Companion)第1章规则生成调查员属性，支持统一掷骰法(2D6+5)*5与480点预设数组，自动计算初始HP/MP/MOV，指令 .cokc [N]
// @timestamp    2026-11-02
// @license      MIT
// ==/UserScript==

/**
 * 《克苏鲁的呼唤：守秘人伴侣》(Call of Cthulhu: Keeper's Companion)
 * 第1章 调查员属性生成扩展新规：
 * 
 * 1. 统一掷骰法 (Unified Rolling Method)：
 *    - 8项基础属性（力量STR、体质CON、体型SIZ、敏捷DEX、外貌APP、智力INT、意志POW、教育EDU）
 *      统一投掷 (2D6+5) * 5，结果范围 35~85，平均值 60 点。
 *    - 投出 8 个数值后，玩家可自由分配至 8 项属性中。
 *    - 幸运 (LUK)：投掷 3D6 * 5，结果范围 15~90。
 *    - 初始状态：HP = (CON + SIZ) / 10（向下取整），MP = POW / 5（向下取整）。
 *    - 移动力 (MOV) 伴侣新规：基准 MOV = 7；若 STR > SIZ 则 +1；若 DEX > SIZ 则 +1。
 * 
 * 2. 480点特征预设数组表 (Table 1: Characteristic Spreads)：
 *    - 投掷 1D10 抽取伴侣官方预设的 480 点数组，单项上限 90，推荐下限 30。
 */

// ============= 1. 注册 / 获取扩展 =============
let ext = seal.ext.find('coc_keepers_companion_tianming');
if (!ext) {
    ext = seal.ext.new('coc_keepers_companion_tianming', 'Antigravity', '1.1.0');
    seal.ext.register(ext);
}

// ============= 2. 配置项注册 =============
seal.ext.registerIntConfig(ext, 'maxTimes', 10, '单次天命最大允许生成的组数限制（1~20组）');
seal.ext.registerBoolConfig(ext, 'showPool', true, '是否在结果中展示便于自由分配的排序属性池');
seal.ext.registerBoolConfig(ext, 'showMov', true, '是否根据顺位预设计算展示伴侣版 MOV');

// ============= 3. 伴侣 480 点预设数组表 (Table 1) =============
const KC_SPREAD_TABLE = [
    [40, 50, 55, 60, 60, 70, 70, 75], // 1
    [35, 50, 50, 60, 60, 75, 75, 75], // 2
    [50, 50, 55, 55, 60, 60, 70, 80], // 3
    [40, 45, 50, 50, 70, 70, 75, 80], // 4
    [30, 50, 55, 60, 60, 70, 75, 80], // 5
    [45, 45, 50, 50, 60, 70, 80, 80], // 6
    [40, 40, 45, 60, 60, 70, 80, 85], // 7
    [40, 40, 50, 50, 50, 80, 85, 85], // 8
    [30, 40, 50, 50, 70, 70, 80, 90], // 9
    [30, 35, 45, 50, 70, 75, 85, 90]  // 10
];

// ============= 4. 辅助骰子与衍生属性函数 =============
function rollD(sides) {
    return Math.floor(Math.random() * sides) + 1;
}

function rollDice(count, sides) {
    let sum = 0;
    for (let i = 0; i < count; i++) {
        sum += rollD(sides);
    }
    return sum;
}

/**
 * 伴侣统一掷骰法：(2D6 + 5) * 5
 */
function rollKCAttr() {
    return (rollDice(2, 6) + 5) * 5;
}

/**
 * 幸运掷骰：3D6 * 5
 */
function rollKCLuck() {
    return rollDice(3, 6) * 5;
}

/**
 * 伴侣新规 MOV 计算：基准 7；STR > SIZ 则 +1；DEX > SIZ 则 +1
 */
function calcKCMov(str, dex, siz) {
    let mov = 7;
    if (str > siz) mov += 1;
    if (dex > siz) mov += 1;
    return mov;
}

/**
 * 生成单组伴侣天命数据
 */
function generateOneSet() {
    const str = rollKCAttr();
    const dex = rollKCAttr();
    const pow = rollKCAttr();
    const con = rollKCAttr();
    const app = rollKCAttr();
    const edu = rollKCAttr();
    const siz = rollKCAttr();
    const int = rollKCAttr();
    const luk = rollKCLuck();

    // 衍生属性
    const hp = Math.floor((con + siz) / 10);
    const mp = Math.floor(pow / 5);
    const mov = calcKCMov(str, dex, siz);

    const attrs = [str, dex, pow, con, app, edu, siz, int];
    const totalWithoutLuck = attrs.reduce((a, b) => a + b, 0);
    const totalWithLuck = totalWithoutLuck + luk;

    // 自由分配池（从大到小排序）
    const sortedPool = [...attrs].sort((a, b) => b - a);

    return {
        str, dex, pow, con, app, edu, siz, int, luk,
        hp, mp, mov,
        totalWithoutLuck,
        totalWithLuck,
        sortedPool
    };
}

// ============= 5. 创建指令 =============
const cmdCokc = seal.ext.newCmdItemInfo();
cmdCokc.name = 'cokc';
cmdCokc.help = `《克苏鲁的呼唤：守秘人伴侣》调查员天命生成指令：
.cokc [N]       生成 N 组伴侣统一掷骰天命（(2D6+5)*5，含初始HP/MP/MOV，输出不含运/含运合计）
.cokc 480       抽取伴侣表1官方 480 点预设数组（D10 随机预设）
.cokc help      查看本帮助信息
支持代骰，如：.cokc 3 @玩家`;

cmdCokc.allowDelegate = true;
cmdCokc.disabledInPrivate = false;

cmdCokc.solve = (ctx, msg, cmdArgs) => {
    const sub = cmdArgs.getArgN(1);

    // 1. 帮助指令
    if (sub === 'help' || sub === '帮助') {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    // 2. 目标代骰处理
    const targetCtx = seal.getCtxProxyFirst(ctx, cmdArgs);
    const playerName = targetCtx.player.name || '调查员';

    // 3. 480点预设数组分支 (.cokc 480 / .cokc array / .cokc 购点)
    if (sub === '480' || sub === 'array' || sub === '购点' || sub === '预设') {
        const d10 = rollD(10);
        const spread = KC_SPREAD_TABLE[d10 - 1];
        const luk = rollKCLuck();
        const totalWithLuck = 480 + luk;

        const replyLines = [
            `【守秘人伴侣】${playerName} 的 480 点预设特征生成 (1D10 = ${d10})：`,
            `• 预设数值池：${spread.join(', ')}`,
            `• 幸运 (3D6*5)：${luk}`,
            `• 合计：480/${totalWithLuck} (不含幸运/含幸运)`,
            `• 规则提示：将预设数组的8个数值自由分配至【力量/敏捷/意志/体质/外貌/教育/体型/智力】；HP=(CON+SIZ)/10，MP=POW/5。`
        ];

        seal.replyToSender(ctx, msg, replyLines.join('\n'));
        return seal.ext.newCmdExecuteResult(true);
    }

    // 4. 解析生成组数 N
    let count = 1;
    if (sub) {
        const parsed = parseInt(sub, 10);
        if (!isNaN(parsed) && parsed > 0) {
            count = parsed;
        }
    }

    // 读取配置项限制
    let maxLimit = seal.ext.getIntConfig(ext, 'maxTimes');
    if (!maxLimit || maxLimit <= 0) maxLimit = 10;
    if (maxLimit > 20) maxLimit = 20;

    if (count > maxLimit) {
        seal.replyToSender(ctx, msg, `[提示] 单次天命生成次数不能超过 ${maxLimit} 组（当前输入：${count}）`);
        count = maxLimit;
    }

    const showPool = seal.ext.getBoolConfig(ext, 'showPool');
    const showMov = seal.ext.getBoolConfig(ext, 'showMov');

    // 5. 单组生成 (精致卡片式输出)
    if (count === 1) {
        const data = generateOneSet();
        const lines = [
            `【守秘人伴侣】${playerName} 的调查员天命生成：`,
            `力量:${data.str}  敏捷:${data.dex}  意志:${data.pow}  体质:${data.con}`,
            `外貌:${data.app}  教育:${data.edu}  体型:${data.siz}  智力:${data.int}`,
            `幸运:${data.luk}  HP:${data.hp}  MP:${data.mp}${showMov ? `  MOV:${data.mov}` : ''}`,
            `合计: ${data.totalWithoutLuck}/${data.totalWithLuck} (不含幸运/含幸运)`
        ];

        if (showPool) {
            lines.push(`自由属性池: [${data.sortedPool.join(', ')}]`);
            lines.push(`(注：伴侣新规允许将8项(2D6+5)*5属性掷骰自由分配至任意属性)`);
        }

        seal.replyToSender(ctx, msg, lines.join('\n'));
        return seal.ext.newCmdExecuteResult(true);
    }

    // 6. 多组连续生成 (紧凑行式输出，防止刷屏)
    const summaryLines = [
        `【守秘人伴侣】${playerName} 的调查员天命生成 (共 ${count} 组)：`
    ];

    for (let i = 1; i <= count; i++) {
        const data = generateOneSet();
        let line = `/${i} 力:${data.str} 敏:${data.dex} 意:${data.pow} 体:${data.con} 貌:${data.app} 教:${data.edu} 型:${data.siz} 智:${data.int} 运:${data.luk}`;
        line += ` | HP:${data.hp} MP:${data.mp}`;
        if (showMov) line += ` M:${data.mov}`;
        line += ` | 计:${data.totalWithoutLuck}/${data.totalWithLuck}`;
        if (showPool) line += ` | 池:[${data.sortedPool.join(',')}]`;
        summaryLines.push(line);
    }

    summaryLines.push(`(提示：属性范围 35~85，均值 60；合计为【不含运/含运】；可任选一组或使用属性池自由分配)`);

    seal.replyToSender(ctx, msg, summaryLines.join('\n'));
    return seal.ext.newCmdExecuteResult(true);
};

// ============= 6. 注册指令别名 =============
ext.cmdMap['cokc'] = cmdCokc;
ext.cmdMap['伴侣天命'] = cmdCokc;
ext.cmdMap['coc伴侣'] = cmdCokc;

// ============= 7. 扩展生命周期日志 =============
ext.onLoad = () => {
    console.log(`[${ext.name}] 守秘人伴侣天命插件已成功加载 (v${ext.version})，指令: .cokc [N]`);
};
