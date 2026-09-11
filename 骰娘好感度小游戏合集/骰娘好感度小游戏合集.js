// ==UserScript==
// @name         骰娘好感度（小游戏合集）
// @author       Codex, Air
// @version      1.41.0
// @description  包含德州扑克、RE7二十一点、亡命神抽、Farkle、爱赢一切、古墓夺宝、视频扑克、钓鱼、竞拍之王、签到、投喂与排行榜的养成小游戏合集。
// @timestamp    1786204800
// @license      Apache-2.0
// @sealVersion  1.4.5
// ==/UserScript==

(function () {
  'use strict';

  const EXT_NAME = '骰娘好感度（小游戏合集）';
  const VERSION = '1.41.0';
  const BOT_PREFIX = 'AFF-BOT:';
  const ENTRY = { poker: 150, blackjack: 100, dmd: 100, farkle: 100, love: 100, tomb: 100, demon: 100, bounty: 0, landlord: 50, alchemy: 100, fishingCard: 100 };
  const GAME_NAMES = {
    poker: '德州扑克', blackjack: '生化危机21点', dmd: '亡命神抽',
    scratch: '刮刮乐', farkle: 'Farkle快艇骰', love: '爱赢一切', tomb: '古墓夺宝', bounty: '赏金对决', fishing: '钓鱼', fishingCard: '钓鱼牌', auction: '竞拍之王', work: '智力打工', expertSudoku: '专家数独', demon: '恶魔轮盘赌', landlord: '斗地主', alchemy: '魔幻牌炼金术师'
  };
  const PROFILE_PAGE_SIZE = 6;

  let ext = seal.ext.find(EXT_NAME);
  if (!ext) {
    ext = seal.ext.new(EXT_NAME, 'Codex, Air', VERSION);
    seal.ext.register(ext);
  } else ext.version = VERSION;

  // -------------------- 可配置项 --------------------
  // 海豹新版本会把同一 group 的配置显示在一个独立标签中；旧版本会忽略额外参数，仍可正常加载。
  const CONFIG_GROUPS = {
    profile: '01｜基础资料', affection: '02｜好感与竞技结算', economy: '03｜签到、彩票与借款',
    gameplay: '04｜游戏规则与房间', image: '05｜图片输出', conditions: '06｜文案判别阈值',
    relationText: '07｜文案·关系阶段', profileText: '08｜文案·档案与判别',
    interactionText: '09｜文案·日常互动', gameText: '10｜文案·游戏结算'
  };
  seal.ext.registerIntConfig(ext, '初始游戏币', 500, '首次建立档案时发放的游戏币。', CONFIG_GROUPS.profile);
  seal.ext.registerStringConfig(ext, '骰娘称呼', '骰娘', '插件文案中使用的骰娘称呼。', CONFIG_GROUPS.profile);

  seal.ext.registerIntConfig(ext, '对决胜利好感', 5, '竞技小游戏第一名或1v1获胜时增加的好感。', CONFIG_GROUPS.affection);
  seal.ext.registerIntConfig(ext, '对决失败好感', -10, '竞技小游戏落败时扣除的好感；实际扣除绝对值始终大于胜利收益。', CONFIG_GROUPS.affection);
  seal.ext.registerIntConfig(ext, '对决第二名好感', 2, '三人及以上对局第二名增加的好感，不会超过第一名。', CONFIG_GROUPS.affection);
  seal.ext.registerIntConfig(ext, '亡命神抽大满贯奖励', 60, '亡命神抽每次大满贯追加的好感；大满贯极难达成，因此默认奖励较高。', CONFIG_GROUPS.affection);
  seal.ext.registerIntConfig(ext, '投入失败好感损失_10币', 1, '10币项目未中奖或鱼获逃脱时扣除的好感。', CONFIG_GROUPS.affection);
  seal.ext.registerIntConfig(ext, '投入失败好感损失_50币', 2, '50币项目未中奖或鱼获逃脱时扣除的好感。', CONFIG_GROUPS.affection);
  seal.ext.registerIntConfig(ext, '投入失败好感损失_100币', 4, '100币项目未中奖或鱼获逃脱时扣除的好感。', CONFIG_GROUPS.affection);
  seal.ext.registerIntConfig(ext, '投入失败好感损失_500币', 8, '500币项目未中奖时扣除的好感。', CONFIG_GROUPS.affection);

  seal.ext.registerIntConfig(ext, '每日签到游戏币', 100, '每日签到最低一档发放的游戏币；较好与最好待遇使用各自的随机区间。', CONFIG_GROUPS.economy);
  seal.ext.registerIntConfig(ext, '每日签到好感', 5, '每日签到最低一档增加的好感度；较好与最好待遇使用各自的随机区间。', CONFIG_GROUPS.economy);
  seal.ext.registerIntConfig(ext, '双色球单注价格', 10, '双色球每注消耗的游戏币，建议保持为10。', CONFIG_GROUPS.economy);
  seal.ext.registerIntConfig(ext, '借款首次好感损失', 20, '没有未还借款时，新借一笔扣除的好感。', CONFIG_GROUPS.economy);
  seal.ext.registerIntConfig(ext, '借款叠加好感损失', 10, '每有一笔未还借款，再次借款额外扣除的好感。', CONFIG_GROUPS.economy);

  seal.ext.registerIntConfig(ext, '21点摸牌获得王牌概率', 25, '普通摸取数字牌后额外获得一张王牌的概率，范围0-100。', CONFIG_GROUPS.gameplay);
  seal.ext.registerIntConfig(ext, '房间过期分钟', 30, '等待或进行中的房间无操作多久后允许无损清理。', CONFIG_GROUPS.gameplay);
  seal.ext.registerIntConfig(ext, '竞拍游客预算', 500000, '竞拍多人房中游客可使用的虚拟竞拍币，只影响玩法且不会结算。', CONFIG_GROUPS.gameplay);
  seal.ext.registerIntConfig(ext, '赏金对决入场费', 0, '已停用：赏金对决不收取入场费，费用仅来自猎人装备、弹药和道具。', CONFIG_GROUPS.gameplay);
  seal.ext.registerIntConfig(ext, '赏金对决撤离奖励', 300, '携带赏金成功撤离的基础游戏币奖励。', CONFIG_GROUPS.economy);

  seal.ext.registerBoolConfig(ext, '启用图片输出', true, '开启后优先调用图片渲染服务。', CONFIG_GROUPS.image);
  seal.ext.registerStringConfig(ext, '图片服务地址', 'http://127.0.0.1:3891', '配套 renderer/server.js 的地址。', CONFIG_GROUPS.image);
  seal.ext.registerIntConfig(ext, '图片请求超时秒数', 15, '图片服务请求超时，范围3-60秒。', CONFIG_GROUPS.image);
  seal.ext.registerBoolConfig(ext, '图片失败回退文字', true, '渲染失败时是否发送纯文字结果。', CONFIG_GROUPS.image);
  seal.ext.registerBoolConfig(ext, '启用官方Bot按钮', true, '在支持原生键盘的QQ官方Bot上显示可点击操作；普通Bot自动保持原有文字/CQ输出。', CONFIG_GROUPS.image);
  seal.ext.registerStringConfig(ext, '官方Bot图片分页提示', '📖 图片已发送，请点击下方按钮翻页；也可发送“上一页/下一页”', '官方Bot图片消息后显示的分页引导文字，可自行修改。留空则使用核心默认提示。', CONFIG_GROUPS.image);

  seal.ext.registerIntConfig(ext, '判别式文案_低好感上限', 0, '好感低于此值时使用低好感文案。', CONFIG_GROUPS.conditions);
  seal.ext.registerIntConfig(ext, '判别式文案_高好感下限', 700, '好感达到此值时使用高好感文案。', CONFIG_GROUPS.conditions);
  seal.ext.registerIntConfig(ext, '判别式文案_低游戏币上限', 100, '游戏币低于此值时使用低游戏币文案。', CONFIG_GROUPS.conditions);
  seal.ext.registerIntConfig(ext, '判别式文案_高游戏币下限', 2000, '游戏币达到此值时使用高游戏币文案。', CONFIG_GROUPS.conditions);

  const TEMPLATE_DEFAULTS = {
    '文案_厌恶': ['{dice}冷淡地看了{name}一眼。'],
    '文案_疏离': ['{dice}与你保持着礼貌的距离。'],
    '文案_初见': ['{dice}记住了{name}的名字。'],
    '文案_熟悉': ['{dice}已经习惯和{name}一起消磨时间。'],
    '文案_亲近': ['{dice}的语气明显柔和了些。'],
    '文案_信赖': ['{dice}愿意把重要的事交给{name}。'],
    '文案_心动': ['每次见到{name}，{dice}都会多停留一会儿。'],
    '文案_钟情': ['{dice}最中意的人，答案似乎早已确定。'],
    '文案_注册': ['“记住了，从今天起就叫你{name}。” {dice}收好了新档案。'],
    '文案_改名': ['“好，从现在起就叫你{name}。” {dice}把旧名字认真划掉。'],
    '文案_判别_低好感_低金币': ['{dice}对{name}仍很戒备，看到空空的钱袋后，语气也更冷了。'],
    '文案_判别_低好感_普通金币': ['{name}还有些积蓄，但{dice}与你仍处在“{relation}”阶段。'],
    '文案_判别_低好感_高金币': ['金币堆得再高，也没能立刻拉近{name}与{dice}的距离。'],
    '文案_判别_普通好感_低金币': ['“先把日子过稳吧。” {dice}看着{name}的钱袋，小声提醒。'],
    '文案_判别_普通好感_普通金币': ['{dice}自然地叫出{name}的名字；你们目前是“{relation}”。'],
    '文案_判别_普通好感_高金币': ['{name}的钱袋很充裕，{dice}也期待你下一次稳妥的选择。'],
    '文案_判别_高好感_低金币': ['即使{name}手头拮据，{dice}依然愿意陪在你身边。'],
    '文案_判别_高好感_普通金币': ['{dice}看向{name}时十分放松；“{relation}”已经不是客套话。'],
    '文案_判别_高好感_高金币': ['信赖与积蓄都很充足，{dice}把最中意的位置留给了{name}。'],
    '文案_签到': ['“今天也来了呀。” {dice}递给{name}一份日常补给。'],
    '文案_余额不足': ['{dice}轻轻敲了敲空空的钱袋：“游戏币不够哦。”'],
    '文案_游客入场': ['{name}的游戏币不足，{dice}仍为你保留了游客席位；本场可以正常游玩，但不会结算奖励、好感或任何档案记录。'],
    '文案_游客结算': ['{name}本场以游客身份参与，排名已经确定，但奖励、好感与档案记录均不结算。'],
    '文案_胜利': ['“这局是你赢了。” {dice}认真记下了{name}的表现。'],
    '文案_失败': ['“胜负很正常，下次再来。” {dice}收起了计分牌。'],
    '文案_投喂': [
      '分类=甜食;好感=低::{dice}接过{name}递来的{item}，神情稍稍缓和了一点。',
      '分类=甜食;好感=普通::“甜的？”{dice}尝了一口{item}，忍不住对{name}笑了笑。',
      '分类=甜食;好感=高::{dice}把{item}分了一半给{name}：“一起吃才更甜。”',
      '分类=零食::{dice}拆开{name}送来的{item}，把它放进了随手就能拿到的零食篮。',
      '分类=饮品::{dice}捧着{item}向{name}道谢，杯沿后面的眼神柔和了些。',
      '分类=餐点::{dice}认真收下了{name}准备的{item}，决定慢慢享用这份心意。',
      '分类=生活用品;好感=高::{dice}把{item}放在最常用的位置，显然很珍惜{name}的心意。',
      '分类=生活用品::{dice}试了试{name}送来的{item}：“很实用，我会好好用的。”',
      '分类=家具;好感=低::{dice}收下了{item}，但仍认真提醒{name}不必用昂贵礼物勉强拉近距离。',
      '分类=家具;好感=高::{dice}和{name}一起为{item}挑好了位置，房间里又多了一处共同的痕迹。',
      '分类=家具::{dice}围着{name}送来的{item}看了好一会儿，开始重新布置自己的小房间。',
      '{dice}收下了{name}递来的{item}，心情看起来不错。'
    ],
    '文案_大满贯': ['“十种宝物，一件不少。” {dice}为{name}的神抽送上特别嘉奖。'],
    '文案_钓鱼收杆': ['{dice}帮{name}提起鱼篓，认真清点今天的收获。'],
    '文案_双色球中奖': ['“号码对上了。” {dice}为{name}核验了{tier}，奖金{prize}游戏币已经入账。'],
    '文案_双色球未中': ['{dice}替{name}核对完这张彩票：“这期没有奖金，下期再试试吧。”'],
    '文案_生死骰生还': ['骰子停在空白面，{dice}把{prize}游戏币推回{name}面前。'],
    '文案_生死骰死亡': ['骰子落在死亡面，{dice}收走了{name}押上的全部{entry}游戏币。'],
    '文案_借款': ['{dice}为{name}记下一笔账：到手150，应还195，好感{delta}。'],
    '文案_还款': ['账页合上了：{name}偿还{debt}游戏币，并恢复{delta}好感。']
  };
  function templateConfigGroup(key) {
    if (['文案_厌恶', '文案_疏离', '文案_初见', '文案_熟悉', '文案_亲近', '文案_信赖', '文案_心动', '文案_钟情'].indexOf(key) >= 0) return CONFIG_GROUPS.relationText;
    if (key === '文案_注册' || key === '文案_改名' || key.indexOf('文案_判别_') === 0) return CONFIG_GROUPS.profileText;
    if (['文案_签到', '文案_余额不足', '文案_游客入场', '文案_游客结算', '文案_投喂'].indexOf(key) >= 0) return CONFIG_GROUPS.interactionText;
    return CONFIG_GROUPS.gameText;
  }
  Object.keys(TEMPLATE_DEFAULTS).forEach((key) => {
    const conditionHelp = key === '文案_投喂' ? ' 投喂文案还支持“分类=甜食;好感=高::文案”的条件前缀；可用条件为分类、好感、礼物，多条件同时满足，越具体的候选越优先。' : '';
    seal.ext.registerTemplateConfig(ext, key, TEMPLATE_DEFAULTS[key], `点击“＋”可添加随机候选；每次调用会重新读取并抽取一条，等权多条时避免连续重复。支持 %权重%文案，以及 {name}、{dice}、{item}、{category}、{delta}、{entry}、{coins}、{tier}、{tierName}、{affection}、{relation} 占位符。${conditionHelp}`, templateConfigGroup(key));
  });

  // -------------------- 通用工具 --------------------
  function nowMs() { return Date.now(); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function int(n, fallback) {
    const v = parseInt(n, 10);
    return Number.isFinite(v) ? v : (fallback || 0);
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  const templateLastChoices = {};
  function templateCandidate(raw) {
    let text = String(raw == null ? '' : raw);
    if (!text.trim()) return null;
    let weight = 100;
    const match = text.match(/^%(\d+(?:\.\d+)?)%([\s\S]*)$/);
    if (match) { weight = Number(match[1]); text = match[2]; }
    if (!text.trim() || !Number.isFinite(weight) || weight <= 0) return null;
    const conditions = [];
    const divider = text.indexOf('::');
    if (divider > 0) {
      const prefix = text.slice(0, divider).trim();
      const parts = prefix.split(';').map((part) => part.trim()).filter((part) => !!part);
      const parsed = parts.map((part) => {
        const equal = part.indexOf('=');
        if (equal <= 0) return null;
        let key = part.slice(0, equal).trim(); const value = part.slice(equal + 1).trim();
        if (key === '礼物分类') key = '分类';
        if (['分类', '好感', '礼物'].indexOf(key) < 0 || !value) return null;
        return { key, value };
      });
      if (parsed.length === parts.length && parsed.length > 0) {
        parsed.forEach((condition) => conditions.push(condition));
        text = text.slice(divider + 2);
      }
    }
    if (!text.trim()) return null;
    return { text, weight, conditions };
  }
  function templateCandidates(key) {
    let configured = null;
    try { configured = seal.ext.getTemplateConfig(ext, key); } catch (e) { configured = null; }
    const raw = [];
    if (typeof configured === 'string') raw.push(configured);
    else if (configured && typeof configured.length === 'number') {
      for (let i = 0; i < configured.length; i++) raw.push(configured[i]);
    }
    let candidates = raw.map(templateCandidate).filter((item) => !!item);
    if (!candidates.length) candidates = (TEMPLATE_DEFAULTS[key] || ['']).map(templateCandidate).filter((item) => !!item);
    return candidates;
  }
  function normalizeAffectionBand(value) {
    const text = String(value == null ? '' : value).trim();
    if (['低', '低好感'].indexOf(text) >= 0) return '低';
    if (['高', '高好感'].indexOf(text) >= 0) return '高';
    if (['普通', '普通好感', '中', '中等'].indexOf(text) >= 0) return '普通';
    return text;
  }
  function templateConditionValue(condition, data) {
    const values = data || {};
    if (condition.key === '分类') return values.category != null ? values.category : (values['分类'] != null ? values['分类'] : values['礼物分类']);
    if (condition.key === '礼物') return values.item != null ? values.item : values['礼物'];
    if (condition.key === '好感') return normalizeAffectionBand(values.affectionBand != null ? values.affectionBand : values['好感']);
    return '';
  }
  function templateCandidateMatches(candidate, data) {
    return (candidate.conditions || []).every((condition) => {
      const actual = templateConditionValue(condition, data);
      const expected = condition.key === '好感' ? normalizeAffectionBand(condition.value) : condition.value;
      return String(actual == null ? '' : actual).trim() === String(expected).trim();
    });
  }
  function randomTemplateText(key, data) {
    let candidates = templateCandidates(key).filter((candidate) => templateCandidateMatches(candidate, data));
    if (candidates.length) {
      const specificity = Math.max.apply(null, candidates.map((candidate) => (candidate.conditions || []).length));
      candidates = candidates.filter((candidate) => (candidate.conditions || []).length === specificity);
    } else {
      candidates = (TEMPLATE_DEFAULTS[key] || ['']).map(templateCandidate).filter((candidate) => !!candidate && !(candidate.conditions || []).length);
    }
    if (!candidates.length) return '';
    const last = templateLastChoices[key];
    const equalWeights = candidates.every((item) => item.weight === candidates[0].weight);
    let pool = equalWeights && candidates.length > 1 ? candidates.filter((item) => item.text !== last) : candidates;
    if (!pool.length) pool = candidates;
    const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * totalWeight; let selected = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      if (roll < pool[i].weight) { selected = pool[i]; break; }
      roll -= pool[i].weight;
    }
    templateLastChoices[key] = selected.text;
    return selected.text;
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function isOfficialQQUserId(value) {
    const id = String(value || '');
    return /^OpenQQ:[^-]+-.+$/.test(id) || (id.indexOf('OpenQQCH:') === 0 && id.length > 9);
  }
  function isOfficialQQGroupId(value) { return /^OpenQQ-Group:[^-]+-.+$/.test(String(value || '')); }
  function rawUserId(ctx, msg) {
    const messageId = String((msg && msg.sender && msg.sender.userId) || '');
    const contextId = String((ctx && ctx.player && ctx.player.userId) || '');
    return isOfficialQQUserId(messageId) ? messageId : (contextId || messageId);
  }
  function rawGroupId(ctx, msg) {
    const messageId = String((msg && msg.groupId) || '');
    const contextId = String((ctx && ctx.group && ctx.group.groupId) || '');
    return isOfficialQQGroupId(messageId) ? messageId : (contextId || messageId);
  }
  function resolveCompatIdentity(kind, identity) {
    const value = String(identity || '');
    if (!value) return value;
    try {
      const api = globalThis.SealOfficialQQIdentityBridge;
      if (api) {
        const resolved = kind === 'user' && typeof api.resolveUserId === 'function'
          ? api.resolveUserId(value)
          : kind === 'group' && typeof api.resolveGroupId === 'function' ? api.resolveGroupId(value) : value;
        if (resolved) return String(resolved);
      }
    } catch (e) {}
    try {
      const bridge = seal.ext.find('qq-official-name-bridge');
      const official = kind === 'user' ? isOfficialQQUserId(value) : isOfficialQQGroupId(value);
      if (bridge && official) return String(bridge.storageGet(`binding:${kind}:${value}`) || value);
    } catch (e) {}
    return value;
  }
  function uid(ctx, msg) {
    const raw = rawUserId(ctx, msg); const resolved = resolveCompatIdentity('user', raw) || raw;
    if (raw && resolved !== raw) {
      migrateUserIdentity(raw, resolved);
      migrateGroupIdentity(`private:${raw}`, `private:${resolved}`);
      migrateRoomUserIdentity(`private:${resolved}`, raw, resolved);
      const rawGid = rawGroupId(ctx, msg); const resolvedGid = resolveCompatIdentity('group', rawGid) || rawGid;
      if (rawGid) {
        migrateGroupIdentity(rawGid, resolvedGid);
        migrateRoomUserIdentity(resolvedGid, raw, resolved);
      }
    }
    return resolved;
  }
  function platformName(ctx, msg) { return String((ctx.player && ctx.player.name) || msg.sender.nickname || '玩家'); }
  function uname(ctx, msg) {
    const stored = jsonGet(profileKey(uid(ctx, msg)), null);
    return stored && stored.registered && stored.name ? String(stored.name) : platformName(ctx, msg);
  }
  function groupId(ctx, msg) {
    if (ctx.isPrivate) return `private:${uid(ctx, msg)}`;
    const raw = rawGroupId(ctx, msg); const resolved = resolveCompatIdentity('group', raw) || raw;
    if (raw && resolved !== raw) migrateGroupIdentity(raw, resolved);
    return resolved;
  }
  function isBotId(id) { return String(id).indexOf(BOT_PREFIX) === 0; }
  function dateKeyAt(timestamp) {
    const d = new Date(timestamp == null ? nowMs() : timestamp);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function dateKey() { return dateKeyAt(nowMs()); }
  function dateFromKey(key, hour) {
    const parts = String(key || '').split('-').map((value) => int(value, 0));
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return new Date(0);
    return new Date(parts[0], parts[1] - 1, parts[2], hour == null ? 0 : hour, 0, 0, 0);
  }
  function shiftDateKey(key, days) {
    const d = dateFromKey(key, 12);
    d.setDate(d.getDate() + int(days, 0));
    return dateKeyAt(d.getTime());
  }
  function lotteryDrawAt(issue) { return dateFromKey(issue, 18).getTime(); }
  function nextLotteryIssue(timestamp) {
    const time = timestamp == null ? nowMs() : timestamp; const today = dateKeyAt(time);
    return time < lotteryDrawAt(today) ? today : shiftDateKey(today, 1);
  }
  function formatLocalTime(timestamp) {
    const d = new Date(timestamp); const pad = (value) => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function jsonGet(key, fallback) {
    const raw = ext.storageGet(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { console.warn(`${EXT_NAME}: storage parse failed: ${key}`, e); return fallback; }
  }
  function jsonSet(key, value) { ext.storageSet(key, JSON.stringify(value)); }
  function clearKey(key) { ext.storageSet(key, ''); }
  function profileKey(id) { return `aff.profile.v1:${encodeURIComponent(id)}`; }
  function profilePageKey(id) { return `aff.profile.page.v1:${encodeURIComponent(id)}`; }
  function roomKey(game, gid) { return `aff.room.v1:${game}:${encodeURIComponent(gid)}`; }
  function loveActiveRoomKey(id) { return `aff.love.active.v1:${encodeURIComponent(id)}`; }
  // 官方 Bot 的 type=2 按钮只负责把指令填入输入框。玩家随后在私聊发送
  // 时没有群上下文，因此为需要私聊的模块记录最近一次关联群房间；载荷中
  // 不包含群号、OpenID 或其他可泄露的内部标识。
  function privateActiveRoomKey(game, id) { return `aff.${game}.active.v1:${encodeURIComponent(id)}`; }
  function bindPrivateActiveRoom(game, id, gid) {
    if (game && id && gid && !isBotId(id)) jsonSet(privateActiveRoomKey(game, id), { gid: String(gid), updatedAt: nowMs() });
  }
  function resolvePrivateActiveRoom(game, id, fallback) {
    const active = jsonGet(privateActiveRoomKey(game, id), null);
    return active && active.gid ? String(active.gid) : fallback;
  }
  function clearPrivateActiveRoom(game, id) { if (game && id) clearKey(privateActiveRoomKey(game, id)); }
  // 官方 Bot 的敏感按钮会把当前牌面附在指令末尾，方便玩家在输入框中
  // 先核对再发送。发送后这段仅供阅读的说明不能影响原有指令解析。
  function stripPrivatePrefillNote(value) {
    // QQ 客户端可能按空格拆分预填文本，因此即使右括号落在后续参数中，
    // 只要操作名已经出现“（”就应按原始操作处理。
    return String(value || '').replace(/[（(][\s\S]*$/, '').trim();
  }
  function scratchTicketKey(id) { return `aff.scratch.ticket.v1:${encodeURIComponent(id)}`; }
  const IDENTITY_ROOM_GAMES = ['poker', 'blackjack', 'dmd', 'farkle', 'love', 'tomb', 'bounty', 'auction', 'landlord', 'alchemy', 'fishingCard'];
  function identityObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
  function identityAdjusted(value, sourceId, targetId) {
    if (typeof value === 'string') {
      if (value === sourceId) return targetId;
      if (value.indexOf(`${sourceId}-hunter-`) === 0) return `${targetId}${value.slice(sourceId.length)}`;
      if (value === `private:${sourceId}`) return `private:${targetId}`;
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => identityAdjusted(item, sourceId, targetId));
    if (!identityObject(value)) return value;
    const result = {};
    Object.keys(value).forEach((key) => {
      const adjustedKey = identityAdjusted(key, sourceId, targetId);
      result[adjustedKey] = identityAdjusted(value[key], sourceId, targetId);
    });
    return result;
  }
  function stateTimestamp(value) {
    if (!identityObject(value)) return 0;
    return Math.max(0, Number(value.updatedAt || value.startedAt || value.createdAt || value.resolvedAt || value.at || 0) || 0);
  }
  function mergeUniqueRows(first, second, keyOf, limit) {
    const rows = []; const seen = {};
    (Array.isArray(first) ? first : []).concat(Array.isArray(second) ? second : []).forEach((row, index) => {
      const key = String(keyOf(row, index) || '');
      if (!key || seen[key]) return;
      seen[key] = true; rows.push(row);
    });
    return limit ? rows.slice(-limit) : rows;
  }
  function mergeLotteryData(target, source) {
    const a = normalizeLotteryData(target); const b = normalizeLotteryData(source); const result = emptyLotteryData();
    result.tickets = mergeUniqueRows(a.tickets, b.tickets, (ticket) => `${ticket.id}|${ticket.issue}|${ticket.red.join(',')}|${ticket.blue}`, 40);
    result.history = mergeUniqueRows(a.history, b.history, (row, index) => `${row && row.id || index}|${row && row.issue || ''}|${row && (row.resolvedAt || row.claimedAt) || ''}`, 60);
    result.totalTickets = a.totalTickets + b.totalTickets; result.totalWins = a.totalWins + b.totalWins; result.totalPrize = a.totalPrize + b.totalPrize;
    result.lastResult = stateTimestamp(a.lastResult) >= stateTimestamp(b.lastResult) ? a.lastResult : b.lastResult;
    return result;
  }
  function mergeLoanData(target, source) {
    const a = normalizeLoanData(target); const b = normalizeLoanData(source); const result = emptyLoanData();
    result.loans = mergeUniqueRows(a.loans, b.loans, (loan, index) => `${loan && loan.id || index}|${loan && loan.borrowedAt || ''}`, 100);
    ['totalBorrowed', 'totalRepaid', 'totalAffectionLost', 'totalAffectionRestored'].forEach((key) => { result[key] = int(a[key], 0) + int(b[key], 0); });
    result.lastSettlement = stateTimestamp(a.lastSettlement) >= stateTimestamp(b.lastSettlement) ? a.lastSettlement : b.lastSettlement;
    return result;
  }
  function mergeDex(target, source, type) {
    const result = {}; const keys = {};
    Object.keys(identityObject(target) ? target : {}).concat(Object.keys(identityObject(source) ? source : {})).forEach((key) => { keys[key] = true; });
    Object.keys(keys).forEach((key) => {
      const a = identityObject(target && target[key]) ? target[key] : {}; const b = identityObject(source && source[key]) ? source[key] : {};
      const row = Object.assign({}, b, a); row.count = Math.max(0, int(a.count, 0)) + Math.max(0, int(b.count, 0));
      if (type === 'fish') {
        const largest = [Number(a.largestSize), Number(b.largestSize)].filter(Number.isFinite);
        const smallest = [Number(a.smallestSize), Number(b.smallestSize)].filter(Number.isFinite);
        row.largestSize = largest.length ? Math.max.apply(null, largest) : 0;
        row.smallestSize = smallest.length ? Math.min.apply(null, smallest) : 0;
      } else row.bestValue = Math.max(int(a.bestValue, 0), int(b.bestValue, 0));
      result[key] = row;
    });
    return result;
  }
  function mergeVenueStats(target, source) {
    const result = {}; const keys = {};
    Object.keys(identityObject(target) ? target : {}).concat(Object.keys(identityObject(source) ? source : {})).forEach((key) => { keys[key] = true; });
    Object.keys(keys).forEach((key) => {
      const a = identityObject(target && target[key]) ? target[key] : {}; const b = identityObject(source && source[key]) ? source[key] : {}; const row = {};
      Object.keys(a).concat(Object.keys(b)).forEach((field) => { row[field] = Number(a[field] || 0) + Number(b[field] || 0); }); result[key] = row;
    });
    return result;
  }
  function betterPokerHand(first, second) {
    if (!identityObject(first)) return identityObject(second) ? second : null;
    if (!identityObject(second)) return first;
    const aCategory = int(first.category, 0); const bCategory = int(second.category, 0);
    if (aCategory !== bCategory) return aCategory > bCategory ? first : second;
    const aTie = Array.isArray(first.tie) ? first.tie : []; const bTie = Array.isArray(second.tie) ? second.tie : [];
    for (let i = 0; i < Math.max(aTie.length, bTie.length); i++) {
      if (int(aTie[i], 0) !== int(bTie[i], 0)) return int(aTie[i], 0) > int(bTie[i], 0) ? first : second;
    }
    return first;
  }
  function mergeGameStats(target, source) {
    const a = Object.assign(emptyGameStats(), identityObject(target) ? target : {}); const b = Object.assign(emptyGameStats(), identityObject(source) ? source : {}); const result = {};
    const keys = {}; Object.keys(a).concat(Object.keys(b)).forEach((key) => { keys[key] = true; });
    Object.keys(keys).forEach((key) => {
      if (typeof a[key] === 'number' || typeof b[key] === 'number') result[key] = Number(a[key] || 0) + Number(b[key] || 0);
      else result[key] = a[key] != null && a[key] !== '' ? a[key] : b[key];
    });
    const maximums = ['best', 'highestBid', 'bestAuctionProfit', 'mostAuctionItems', 'lotteryBestPrize', 'deathDiceBestWin', 'videoPokerBestPayout', 'videoPokerBestHandRank', 'videoPokerBestStreak', 'loveBestChips', 'loveBestHandRank', 'tombBestEscape', 'bountyBestDamage', 'bountyBestLoot', 'bountyHighestWeaponPrice', 'workCurrentStreak', 'workBestStreak', 'workBestReward', 'workMaxDurationMs', 'expertBestReward', 'expertBestDifficulty', 'expertCurrentStreak', 'expertBestStreak', 'landlordMaxMultiplier'];
    maximums.forEach((key) => { result[key] = Math.max(Number(a[key] || 0), Number(b[key] || 0)); });
    const bestTimes = [Number(a.expertBestTimeMs), Number(b.expertBestTimeMs)].filter((value) => Number.isFinite(value) && value > 0);
    result.expertBestTimeMs = bestTimes.length ? Math.min.apply(null, bestTimes) : 0;
    result.bestPokerHand = betterPokerHand(a.bestPokerHand, b.bestPokerHand);
    result.biggestFish = Number(a.biggestFish && a.biggestFish.size || 0) >= Number(b.biggestFish && b.biggestFish.size || 0) ? a.biggestFish : b.biggestFish;
    const smallestFish = [a.smallestFish, b.smallestFish].filter((fish) => fish && Number.isFinite(Number(fish.size)));
    result.smallestFish = smallestFish.length ? smallestFish.sort((left, right) => Number(left.size) - Number(right.size))[0] : null;
    result.fishDex = mergeDex(a.fishDex, b.fishDex, 'fish'); result.auctionDex = mergeDex(a.auctionDex, b.auctionDex, 'auction');
    result.auctionVenueStats = mergeVenueStats(a.auctionVenueStats, b.auctionVenueStats);
    result.auctionTopItem = int(a.auctionTopItem && a.auctionTopItem.value, 0) >= int(b.auctionTopItem && b.auctionTopItem.value, 0) ? a.auctionTopItem : b.auctionTopItem;
    result.videoPokerBestHand = Number(a.videoPokerBestHandRank || 0) >= Number(b.videoPokerBestHandRank || 0) ? a.videoPokerBestHand : b.videoPokerBestHand;
    result.loveBestHand = Number(a.loveBestHandRank || 0) >= Number(b.loveBestHandRank || 0) ? a.loveBestHand : b.loveBestHand;
    result.workLastType = a.workLastType || b.workLastType || '';
    return result;
  }
  function mergeBountyData(target, source, sourceId, targetId) {
    const a = identityAdjusted(identityObject(target) ? target : {}, sourceId, targetId); const b = identityAdjusted(identityObject(source) ? source : {}, sourceId, targetId);
    const hunters = []; const hunterIds = {}; let sourceSelected = b.selected;
    function appendHunters(items, fromSource) {
      (Array.isArray(items) ? items : []).forEach((rawHunter, index) => {
        if (!rawHunter) return; const hunter = Object.assign({}, rawHunter); const originalId = String(hunter.id || `${targetId}-hunter-${index + 1}`); let id = originalId; let suffix = 2;
        while (hunterIds[id]) { id = `${originalId}-migrated-${suffix}`; suffix++; }
        hunter.id = id; hunter.ownerId = targetId; hunterIds[id] = true; hunters.push(hunter);
        if (fromSource && originalId === b.selected) sourceSelected = id;
      });
    }
    appendHunters(a.hunters, false); appendHunters(b.hunters, true);
    const templatesByName = {};
    (Array.isArray(a.templates) ? a.templates : []).concat(Array.isArray(b.templates) ? b.templates : []).forEach((item, index) => {
      if (!item) return; const key = String(item.name || `template-${index}`); const old = templatesByName[key];
      if (!old || Number(item.savedAt || 0) >= Number(old.savedAt || 0)) templatesByName[key] = item;
    });
    const selected = hunters.some((hunter) => hunter && hunter.id === a.selected) ? a.selected : hunters.some((hunter) => hunter && hunter.id === sourceSelected) ? sourceSelected : hunters[0] && hunters[0].id || '';
    return { hunters, templates: Object.keys(templatesByName).map((key) => templatesByName[key]).slice(-20), selected };
  }
  function profileRegistered(profile) { return !!(profile && (profile.registered === true || String(profile.name || '').trim())); }
  function mergeProfiles(target, source, sourceId, targetId) {
    if (!identityObject(target)) { const moved = identityAdjusted(source, sourceId, targetId); moved.id = targetId; return moved; }
    if (!identityObject(source)) { const kept = identityAdjusted(target, sourceId, targetId); kept.id = targetId; return kept; }
    const a = identityAdjusted(target, sourceId, targetId); const b = identityAdjusted(source, sourceId, targetId); const aRegistered = profileRegistered(a); const bRegistered = profileRegistered(b);
    const result = Object.assign({}, b, a); result.id = targetId; result.registered = aRegistered || bRegistered; result.name = aRegistered && a.name ? a.name : b.name || a.name || '';
    const initial = clamp(seal.ext.getIntConfig(ext, '初始游戏币'), 0, 100000000);
    if (aRegistered && bRegistered) result.coins = Math.max(0, int(a.coins, 0) + int(b.coins, 0) - initial);
    else result.coins = aRegistered ? int(a.coins, 0) : int(b.coins, 0);
    result.affection = aRegistered && bRegistered ? int(a.affection, 0) + int(b.affection, 0) : aRegistered ? int(a.affection, 0) : int(b.affection, 0);
    const created = [Number(a.createdAt), Number(b.createdAt)].filter((value) => Number.isFinite(value) && value > 0); result.createdAt = String(created.length ? Math.min.apply(null, created) : nowMs());
    result.lastSign = String(a.lastSign || '') >= String(b.lastSign || '') ? String(a.lastSign || '') : String(b.lastSign || '');
    result.lastSignReward = result.lastSign === String(a.lastSign || '') ? a.lastSignReward || b.lastSignReward : b.lastSignReward || a.lastSignReward;
    result.auctionAssistant = a.auctionAssistant || b.auctionAssistant || '';
    result.lottery = mergeLotteryData(a.lottery, b.lottery); result.loan = mergeLoanData(a.loan, b.loan); result.bounty = mergeBountyData(a.bounty, b.bounty, sourceId, targetId);
    result.stats = {}; const games = {};
    Object.keys(GAME_NAMES).concat(Object.keys(identityObject(a.stats) ? a.stats : {}), Object.keys(identityObject(b.stats) ? b.stats : {})).forEach((game) => { games[game] = true; });
    Object.keys(games).forEach((game) => { result.stats[game] = mergeGameStats(a.stats && a.stats[game], b.stats && b.stats[game]); });
    return result;
  }
  function migrateUserState(sourceKey, targetKey, sourceId, targetId) {
    const source = jsonGet(sourceKey, null); if (!source) return false;
    const target = jsonGet(targetKey, null); const chosen = !target || stateTimestamp(source) >= stateTimestamp(target) ? source : target;
    const adjusted = identityAdjusted(chosen, sourceId, targetId);
    if (adjusted && adjusted.gid) adjusted.gid = resolveCompatIdentity('group', adjusted.gid) || adjusted.gid;
    jsonSet(targetKey, adjusted); clearKey(sourceKey); return true;
  }
  function migrateRegistryIdentity(sourceId, targetId, profile) {
    const reg = jsonGet('aff.registry.v1', { ids: [], names: {} }); const ids = []; const seen = {};
    (Array.isArray(reg.ids) ? reg.ids : []).forEach((id) => {
      const mapped = id === sourceId ? targetId : id; if (!seen[mapped]) { seen[mapped] = true; ids.push(mapped); }
    });
    if (profileRegistered(profile) && !seen[targetId]) ids.push(targetId);
    const names = identityObject(reg.names) ? Object.assign({}, reg.names) : {};
    if (!names[targetId] && names[sourceId]) names[targetId] = names[sourceId]; delete names[sourceId];
    if (profileRegistered(profile) && profile.name) names[targetId] = profile.name;
    const next = { ids: ids.slice(-10000), names };
    if (JSON.stringify(next) !== JSON.stringify({ ids: Array.isArray(reg.ids) ? reg.ids : [], names: identityObject(reg.names) ? reg.names : {} })) jsonSet('aff.registry.v1', next);
  }
  function migrateUserIdentity(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId || isBotId(sourceId) || isBotId(targetId)) return false;
    const sourceProfile = jsonGet(profileKey(sourceId), null); const targetProfile = jsonGet(profileKey(targetId), null); let merged = targetProfile;
    if (sourceProfile) {
      merged = mergeProfiles(targetProfile, sourceProfile, sourceId, targetId); jsonSet(profileKey(targetId), merged); clearKey(profileKey(sourceId));
    }
    migrateUserState(videoPokerSessionKey(sourceId), videoPokerSessionKey(targetId), sourceId, targetId);
    migrateUserState(fishingKey(sourceId), fishingKey(targetId), sourceId, targetId);
    migrateUserState(workSessionKey(sourceId), workSessionKey(targetId), sourceId, targetId);
    migrateUserState(scratchTicketKey(sourceId), scratchTicketKey(targetId), sourceId, targetId);
    const sourceLoveActive = jsonGet(loveActiveRoomKey(sourceId), null);
    if (sourceLoveActive && sourceLoveActive.gid) {
      const sourceGid = String(sourceLoveActive.gid); const targetGid = resolveCompatIdentity('group', sourceGid) || sourceGid;
      migrateGroupIdentity(sourceGid, targetGid); migrateRoomUserIdentity(targetGid, sourceId, targetId);
    }
    migrateUserState(loveActiveRoomKey(sourceId), loveActiveRoomKey(targetId), sourceId, targetId);
    migrateRegistryIdentity(sourceId, targetId, merged);
    const markerKey = `aff.identity.migrated.v1:${encodeURIComponent(sourceId)}`;
    if (ext.storageGet(markerKey) !== targetId) ext.storageSet(markerKey, targetId);
    return !!sourceProfile;
  }
  function migrateGroupIdentity(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return false; let moved = false;
    IDENTITY_ROOM_GAMES.forEach((game) => {
      const sourceKey = roomKey(game, sourceId); const source = jsonGet(sourceKey, null); if (!source) return;
      const targetKey = roomKey(game, targetId); const target = jsonGet(targetKey, null); const chosen = !target || stateTimestamp(source) >= stateTimestamp(target) ? source : target;
      jsonSet(targetKey, identityAdjusted(chosen, sourceId, targetId)); clearKey(sourceKey); moved = true;
    });
    return moved;
  }
  function migrateRoomUserIdentity(gid, sourceId, targetId) {
    if (!gid || !sourceId || !targetId || sourceId === targetId) return;
    IDENTITY_ROOM_GAMES.forEach((game) => {
      const key = roomKey(game, gid); const raw = ext.storageGet(key); if (!raw || raw.indexOf(sourceId) < 0) return;
      const room = jsonGet(key, null); if (room) jsonSet(key, identityAdjusted(room, sourceId, targetId));
    });
  }
  function loveBindActiveRoom(id, gid) { if (id && gid && !isBotId(id)) jsonSet(loveActiveRoomKey(id), { gid: String(gid), updatedAt: nowMs() }); }
  function loveBindRoomPlayers(room, gid) { (room && room.players || []).forEach((player) => loveBindActiveRoom(player.id, gid)); }
  function loveUnbindRoomPlayers(room, gid) {
    (room && room.players || []).forEach((player) => {
      if (player.isBot) return;
      const active = jsonGet(loveActiveRoomKey(player.id), null);
      if (active && active.gid === String(gid)) clearKey(loveActiveRoomKey(player.id));
    });
  }
  function emptyGameStats() {
    return {
      plays: 0, wins: 0, losses: 0, draws: 0, score: 0, best: 0, profit: 0, grandSlams: 0,
      affection: 0, affectionGained: 0, affectionLost: 0,
      bestPokerHand: null, biggestFish: null, smallestFish: null, fishDex: {},
      highestBid: 0, bestAuctionProfit: 0, mostAuctionItems: 0, auctionDex: {},
      auctionSpend: 0, auctionRevenue: 0, auctionContainers: 0, auctionBidRounds: 0,
      auctionPasses: 0, auctionTopItem: null, auctionVenueStats: {},
      lotteryTickets: 0, lotteryWins: 0, lotterySpent: 0, lotteryPrize: 0, lotteryBestPrize: 0,
      deathDicePlays: 0, deathDiceWins: 0, deathDiceLosses: 0, deathDiceProfit: 0, deathDiceBestWin: 0,
      videoPokerPlays: 0, videoPokerHands: 0, videoPokerHandsWon: 0, videoPokerWagered: 0, videoPokerWon: 0,
      videoPokerBestPayout: 0, videoPokerBestHand: '', videoPokerBestHandRank: 0,
      videoPokerHighLowWins: 0, videoPokerBestStreak: 0, videoPokerRevives: 0,
      videoPokerJackpots: 0, videoPokerJackpotWon: 0,
      loveRoundsWon: 0, loveWinsAll: 0, loveCheatWins: 0, loveCheatLosses: 0, loveCheatPenalties: 0,
      loveBestChips: 0, loveBestHandRank: 0, loveBestHand: '',
      alchemyRounds: 0, alchemyElementCards: 0, alchemyMagicUsed: 0, alchemyConservationUsed: 0, alchemyBestScore: 0
      ,landlordMaxMultiplier: 0, landlordBombs: 0, landlordSprings: 0, landlordRounds: 0,
      landlordTournamentWins: 0, landlordTournamentRank: 0
      ,tombSurvivals: 0, tombEscapedValue: 0, tombBestEscape: 0, tombDurableWins: 0,
      tombTreasures: 0, tombWeightDeaths: 0, tombMagicDeaths: 0, tombScarabDeaths: 0
      ,bountyEscapes: 0, bountyBounties: 0, bountyKills: 0, bountyBossKills: 0, bountyClues: 0,
      bountyBestDamage: 0, bountyBestLoot: 0, bountyRounds: 0, bountyDowns: 0, bountyRevives: 0,
      bountyHighestWeaponPrice: 0, bountyTemplates: 0
      ,workQuestions: 0, workSolved: 0, workWrong: 0, workCurrentStreak: 0, workBestStreak: 0,
      workBestReward: 0, workCoinsEarned: 0, workGrossReward: 0, workTotalDurationMs: 0, workMaxDurationMs: 0,
      work24: 0, work24Decimal: 0, work24NoSolution: 0, workSudoku: 0, workKnights: 0, workCreek: 0, workCalculator: 0, workCalculatorSolved: 0,
      workFormalQuestions: 0, workWarmups: 0, workLastType: '', workLastReward: 0,
      expertAttempts: 0, expertSolved: 0, expertFailed: 0, expertRevealed: 0, expertWrongAnswers: 0,
      expertBestReward: 0, expertTotalReward: 0, expertBestDifficulty: 0, expertBestTimeMs: 0,
      expertTotalTimeMs: 0, expertCurrentStreak: 0, expertBestStreak: 0, expertFastSubmissions: 0
      ,fishingCardRounds: 0, fishingCardWins: 0, fishingCardScore: 0, fishingCardCardsEaten: 0, fishingCardBestCombo: 0, fishingCardHighestCard: 0
    };
  }
  function emptyLotteryData() {
    return { tickets: [], history: [], totalTickets: 0, totalWins: 0, totalPrize: 0, lastResult: null };
  }
  function emptyLoanData() {
    return { loans: [], totalBorrowed: 0, totalRepaid: 0, totalAffectionLost: 0, totalAffectionRestored: 0, lastSettlement: null };
  }
  function normalizeLotteryData(raw) {
    const data = Object.assign(emptyLotteryData(), raw && typeof raw === 'object' ? raw : {});
    data.tickets = (Array.isArray(data.tickets) ? data.tickets : []).slice(-40).map((ticket) => ({
      id: String(ticket.id || ''), issue: String(ticket.issue || ''), red: (Array.isArray(ticket.red) ? ticket.red : []).map((value) => int(value, 0)).slice(0, 5),
      blue: int(ticket.blue, 0), cost: Math.max(0, int(ticket.cost, 0)), count: clamp(int(ticket.count, 1), 1, 20), boughtAt: Math.max(0, Number(ticket.boughtAt) || 0)
    })).filter((ticket) => ticket.id && ticket.issue && ticket.red.length === 5 && ticket.blue);
    data.history = (Array.isArray(data.history) ? data.history : []).slice(-60);
    if (data.lastResult && typeof data.lastResult === 'object') {
      data.lastResult = {
        resolvedAt: Math.max(0, Number(data.lastResult.resolvedAt) || 0), totalPrize: Math.max(0, int(data.lastResult.totalPrize, 0)),
        status: String(data.lastResult.status || ''), tickets: (Array.isArray(data.lastResult.tickets) ? data.lastResult.tickets : []).slice(0, 20).map((ticket) => ({
          id: String(ticket.id || ''), issue: String(ticket.issue || ''), red: (Array.isArray(ticket.red) ? ticket.red : []).map((value) => int(value, 0)).slice(0, 5),
          blue: int(ticket.blue, 0), cost: Math.max(0, int(ticket.cost, 0)), count: clamp(int(ticket.count, 1), 1, 20), drawRed: (Array.isArray(ticket.drawRed) ? ticket.drawRed : []).map((value) => int(value, 0)).slice(0, 5),
          drawBlue: int(ticket.drawBlue, 0), redMatches: clamp(int(ticket.redMatches, 0), 0, 5), blueMatch: !!ticket.blueMatch,
          tier: String(ticket.tier || ''), prize: Math.max(0, int(ticket.prize, 0))
        })).filter((ticket) => ticket.id && ticket.issue && ticket.red.length === 5 && ticket.blue)
      };
    } else data.lastResult = null;
    data.totalTickets = Math.max(0, int(data.totalTickets, 0)); data.totalWins = Math.max(0, int(data.totalWins, 0)); data.totalPrize = Math.max(0, int(data.totalPrize, 0));
    return data;
  }
  function normalizeLoanData(raw) {
    const data = Object.assign(emptyLoanData(), raw && typeof raw === 'object' ? raw : {});
    data.loans = (Array.isArray(data.loans) ? data.loans : []).slice(0, 100).map((loan) => ({
      id: String(loan.id || ''), borrowedAt: Math.max(0, Number(loan.borrowedAt) || 0), principal: 150, due: 195,
      affectionLost: Math.max(0, int(loan.affectionLost, 0))
    }));
    ['totalBorrowed', 'totalRepaid', 'totalAffectionLost', 'totalAffectionRestored'].forEach((key) => { data[key] = Math.max(0, int(data[key], 0)); });
    if (!data.lastSettlement || typeof data.lastSettlement !== 'object') data.lastSettlement = null;
    return data;
  }
  function settleDueLoans(p) {
    p.loan = normalizeLoanData(p.loan); let repaid = 0; let restored = 0; let count = 0;
    while (p.loan.loans.length && p.coins >= 345) {
      const loan = p.loan.loans.shift(); p.coins -= 195; repaid += 195; count += 1;
      const recovery = Math.floor(Math.max(0, int(loan.affectionLost, 0)) * 0.5);
      p.affection += recovery; restored += recovery;
    }
    if (count) {
      p.loan.totalRepaid += repaid; p.loan.totalAffectionRestored += restored;
      p.loan.lastSettlement = { at: nowMs(), count, repaid, restored, balance: p.coins };
    }
    return { count, repaid, restored };
  }
  function newProfile(id) {
    const initial = clamp(seal.ext.getIntConfig(ext, '初始游戏币'), 0, 100000000);
    return {
      id, name: '', registered: false, coins: initial, affection: 0, createdAt: String(nowMs()), lastSign: '', auctionAssistant: '',
      lottery: emptyLotteryData(), loan: emptyLoanData(), bounty: { hunters: [], templates: [], selected: '' },
      stats: {
        poker: emptyGameStats(), blackjack: emptyGameStats(), dmd: emptyGameStats(), alchemy: emptyGameStats(),
        scratch: emptyGameStats(), farkle: emptyGameStats(), love: emptyGameStats(), tomb: emptyGameStats(), bounty: emptyGameStats(), fishing: emptyGameStats(), fishingCard: emptyGameStats(), auction: emptyGameStats(), work: emptyGameStats(), expertSudoku: emptyGameStats(), demon: emptyGameStats(), landlord: emptyGameStats()
      }
    };
  }
  function loadProfile(id, name) {
    const stored = jsonGet(profileKey(id), null);
    const p = stored || newProfile(id);
    p.id = id;
    if (typeof p.registered !== 'boolean') {
      p.registered = !!String(p.name || '').trim();
      jsonSet(profileKey(id), p);
    }
    if (!p.registered) p.name = '';
    p.coins = int(p.coins, 0);
    p.affection = int(p.affection, 0);
    if (!p.stats) p.stats = {};
    Object.keys(GAME_NAMES).forEach((g) => {
      if (!p.stats[g]) p.stats[g] = emptyGameStats();
      p.stats[g] = Object.assign(emptyGameStats(), p.stats[g]);
      if (!p.stats[g].fishDex || typeof p.stats[g].fishDex !== 'object' || Array.isArray(p.stats[g].fishDex)) p.stats[g].fishDex = {};
      if (!p.stats[g].biggestFish || typeof p.stats[g].biggestFish !== 'object') p.stats[g].biggestFish = null;
      if (!p.stats[g].smallestFish || typeof p.stats[g].smallestFish !== 'object') p.stats[g].smallestFish = null;
      if (!p.stats[g].auctionDex || typeof p.stats[g].auctionDex !== 'object' || Array.isArray(p.stats[g].auctionDex)) p.stats[g].auctionDex = {};
      if (!p.stats[g].auctionTopItem || typeof p.stats[g].auctionTopItem !== 'object') p.stats[g].auctionTopItem = null;
      if (!p.stats[g].auctionVenueStats || typeof p.stats[g].auctionVenueStats !== 'object' || Array.isArray(p.stats[g].auctionVenueStats)) p.stats[g].auctionVenueStats = {};
      if (g === 'poker') {
        const hand = p.stats[g].bestPokerHand;
        if (!hand || typeof hand !== 'object' || !Number.isFinite(hand.category) || !Array.isArray(hand.tie)) p.stats[g].bestPokerHand = null;
        else {
          hand.category = clamp(int(hand.category, 0), 0, 8);
          hand.tie = hand.tie.slice(0, 5).map((value) => clamp(int(value, 0), 0, 14));
          hand.name = String(hand.name || '');
        }
      }
    });
    if (typeof p.auctionAssistant !== 'string') p.auctionAssistant = '';
    p.lottery = normalizeLotteryData(p.lottery); p.loan = normalizeLoanData(p.loan);
    bountyProfileNormalize(p);
    const settlement = settleDueLoans(p);
    if (settlement.count) jsonSet(profileKey(id), p);
    return p;
  }
  function saveProfile(p) {
    const settlement = settleDueLoans(p);
    p.coins = clamp(int(p.coins, 0), 0, 2000000000);
    p.affection = clamp(int(p.affection, 0), -1000000000, 1000000000);
    jsonSet(profileKey(p.id), p);
    if (p.registered && p.name) {
      const reg = jsonGet('aff.registry.v1', { ids: [], names: {} });
      if (reg.ids.indexOf(p.id) === -1) reg.ids.push(p.id);
      reg.names[p.id] = p.name;
      if (reg.ids.length > 10000) reg.ids = reg.ids.slice(-10000);
      jsonSet('aff.registry.v1', reg);
    }
    return settlement;
  }
  function charge(p, amount) {
    amount = Math.max(0, int(amount, 0));
    if (p.coins < amount) return false;
    p.coins -= amount;
    saveProfile(p);
    return true;
  }
  // LogAI 漫画额度桥接：每个自然周一次免费，之后每次消耗1000游戏币。
  function comicWeekKey(timestamp) {
    const d = new Date(timestamp == null ? nowMs() : timestamp);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return dateKeyAt(d.getTime());
  }
  function consumeComicGeneration(ctx, msg) {
    const id = uid(ctx, msg);
    if (!id || isBotId(id)) return { ok: false, reason: 'invalid_user' };
    const diceMaster = Number(ctx && ctx.privilegeLevel || 0) >= 100;
    const week = comicWeekKey();
    const key = `aff.logai.comic.v1:${encodeURIComponent(id)}`;
    const state = jsonGet(key, {});
    const profile = loadProfile(id, uname(ctx, msg));
    const cost = diceMaster || state.freeWeek !== week ? 0 : 1000;
    if (cost && profile.coins < cost) return { ok: false, reason: 'insufficient_coins', week, coins: profile.coins, cost };
    if (cost) { profile.coins -= cost; saveProfile(profile); }
    const receipt = `${week}:${nowMs()}:${Math.floor(Math.random() * 1000000)}`;
    jsonSet(key, { freeWeek: state.freeWeek || (diceMaster ? '' : week), receipt, cost, chargedAt: nowMs() });
    return { ok: true, receipt, week, paid: !!cost, cost, coins: profile.coins };
  }
  function refundComicGeneration(ctx, msg, receipt) {
    const id = uid(ctx, msg);
    if (!id || !receipt) return false;
    const key = `aff.logai.comic.v1:${encodeURIComponent(id)}`;
    const state = jsonGet(key, null);
    if (!state || state.receipt !== String(receipt)) return false;
    if (int(state.cost, 0) > 0) {
      const profile = loadProfile(id, uname(ctx, msg));
      profile.coins += int(state.cost, 0);
      saveProfile(profile);
      jsonSet(key, { freeWeek: state.freeWeek || '', receipt: '', cost: 0, refundedAt: nowMs() });
    } else {
      clearKey(key);
    }
    return true;
  }
  globalThis.SealAffectionBridge = {
    consumeComicGeneration,
    refundComicGeneration,
    getComicGenerationStatus: (ctx, msg) => {
      const id = uid(ctx, msg); const state = jsonGet(`aff.logai.comic.v1:${encodeURIComponent(id)}`, {});
      const profile = loadProfile(id, uname(ctx, msg));
      return { week: comicWeekKey(), used: state.freeWeek === comicWeekKey(), coins: profile.coins };
    }
  };
  function relation(affection) {
    const n = int(affection, 0);
    if (n < -100) return { name: '厌恶', key: '文案_厌恶', min: -1000000000, next: -100 };
    if (n < 0) return { name: '疏离', key: '文案_疏离', min: -100, next: 0 };
    if (n < 100) return { name: '初见', key: '文案_初见', min: 0, next: 100 };
    if (n < 300) return { name: '熟悉', key: '文案_熟悉', min: 100, next: 300 };
    if (n < 700) return { name: '亲近', key: '文案_亲近', min: 300, next: 700 };
    if (n < 1500) return { name: '信赖', key: '文案_信赖', min: 700, next: 1500 };
    if (n < 3000) return { name: '心动', key: '文案_心动', min: 1500, next: 3000 };
    return { name: '钟情', key: '文案_钟情', min: 3000, next: null };
  }
  function template(ctx, key, data) {
    let text = randomTemplateText(key, data);
    const vars = Object.assign({ dice: seal.ext.getStringConfig(ext, '骰娘称呼') || '骰娘' }, data || {});
    Object.keys(vars).forEach((k) => { text = String(text).split(`{${k}}`).join(String(vars[k])); });
    if (!ctx) return text;
    try { return seal.format(ctx, text); } catch (e) { return text; }
  }
  function changeAffection(p, delta) {
    p.affection = clamp(p.affection + int(delta, 0), -1000000000, 1000000000);
    saveProfile(p);
    return relation(p.affection);
  }
  function signedValue(value) { const amount = int(value, 0); return `${amount >= 0 ? '+' : ''}${amount}`; }
  function stakeFailureAffection(cost) {
    const amount = int(cost, 0);
    const tier = amount >= 500 ? 500 : amount >= 100 ? 100 : amount >= 50 ? 50 : 10;
    return -Math.abs(clamp(seal.ext.getIntConfig(ext, `投入失败好感损失_${tier}币`), 0, 1000));
  }
  function affectionRules() {
    const win = clamp(seal.ext.getIntConfig(ext, '对决胜利好感'), 0, 1000);
    const configuredLoss = Math.abs(clamp(seal.ext.getIntConfig(ext, '对决失败好感'), -10000, 10000));
    const loss = -Math.max(win + 1, configuredLoss);
    const second = clamp(seal.ext.getIntConfig(ext, '对决第二名好感'), 0, Math.max(0, win - 1));
    const grandSlam = clamp(seal.ext.getIntConfig(ext, '亡命神抽大满贯奖励'), 0, 1000);
    return { win, loss, second, grandSlam };
  }
  function rankedAffection(index, playerCount) {
    const rules = affectionRules();
    if (playerCount <= 2) return index === 0 ? rules.win : rules.loss;
    if (index === 0) return rules.win;
    if (index === 1) return rules.second;
    if (index === 2) return 0;
    return rules.loss - Math.min(6, index - 3) * 2;
  }
  function recordGame(p, game, outcome, score, profit, extra) {
    const s = p.stats[game] || emptyGameStats();
    s.plays++;
    if (outcome === 'win') s.wins++;
    else if (outcome === 'loss') s.losses++;
    else s.draws++;
    s.score += int(score, 0);
    s.best = Math.max(s.best, int(score, 0));
    s.profit += int(profit, 0);
    if (extra && extra.grandSlams) s.grandSlams += int(extra.grandSlams, 0);
    if (game === 'love' && extra) {
      s.loveRoundsWon += Math.max(0, int(extra.roundsWon, 0));
      s.loveWinsAll += Math.max(0, int(extra.winsAll, 0));
      s.loveCheatWins += Math.max(0, int(extra.cheatWins, 0));
      s.loveCheatLosses += Math.max(0, int(extra.cheatLosses, 0));
      s.loveCheatPenalties += Math.max(0, int(extra.cheatPenalties, 0));
      s.loveBestChips = Math.max(s.loveBestChips, Math.max(0, int(extra.finalChips, 0)));
      const handRank = Math.max(0, int(extra.bestHandRank, 0));
      if (handRank > s.loveBestHandRank) { s.loveBestHandRank = handRank; s.loveBestHand = String(extra.bestHand || ''); }
    }
    if (game === 'tomb' && extra) {
      s.tombSurvivals += Math.max(0, int(extra.survivals, 0));
      s.tombEscapedValue += Math.max(0, int(extra.escapedValue, 0));
      s.tombBestEscape = Math.max(s.tombBestEscape, Math.max(0, int(extra.bestEscape, 0)));
      s.tombDurableWins += Math.max(0, int(extra.durableWin, 0));
      s.tombTreasures += Math.max(0, int(extra.treasures, 0));
      s.tombWeightDeaths += Math.max(0, int(extra.weightDeaths, 0));
      s.tombMagicDeaths += Math.max(0, int(extra.magicDeaths, 0));
      s.tombScarabDeaths += Math.max(0, int(extra.scarabDeaths, 0));
    }
    if (game === 'fishing' && extra && Array.isArray(extra.caughtFish)) recordFishingCatches(s, extra.caughtFish);
    if (game === 'bounty' && extra) {
      s.bountyEscapes += Math.max(0, int(extra.escapes, 0)); s.bountyBounties += Math.max(0, int(extra.bounties, 0));
      s.bountyKills += Math.max(0, int(extra.kills, 0)); s.bountyBossKills += Math.max(0, int(extra.bossKills, 0));
      s.bountyClues += Math.max(0, int(extra.clues, 0)); s.bountyBestDamage = Math.max(s.bountyBestDamage, Math.max(0, int(extra.bestDamage, 0)));
      s.bountyRounds += Math.max(0, int(extra.rounds, 0)); s.bountyDowns += Math.max(0, int(extra.downs, 0));
    }
    const affectionDelta = extra ? int(extra.affectionDelta, 0) : 0;
    s.affection += affectionDelta;
    if (affectionDelta > 0) s.affectionGained += affectionDelta;
    else if (affectionDelta < 0) s.affectionLost += Math.abs(affectionDelta);
    p.stats[game] = s;
    saveProfile(p);
  }
  function awardEntryReturn(p, game, won) {
    const reward = won ? int(ENTRY[game], 0) * 2 : 0;
    if (reward > 0) p.coins += reward;
    return reward;
  }
  function fallbackText(view) {
    const out = [view.title];
    if (view.subtitle) out.push(view.subtitle);
    (view.lines || []).forEach((line) => out.push(typeof line === 'string' ? line : `${line.label}: ${line.value}`));
    if (view.quote) out.push('', view.quote);
    return out.join('\n');
  }
  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('图片请求超时')), ms);
      Promise.resolve(promise).then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); }
      );
    });
  }
  async function replyView(ctx, msg, view, privateReply) {
    const plain = fallbackText(view);
    const send = privateReply ? seal.replyPerson : seal.replyToSender;
    const keyboard = seal.ext.getBoolConfig(ext, '启用官方Bot按钮') ? officialKeyboard(Object.assign({}, view, { privateView: !!privateReply, targetUserId: msg && msg.sender ? msg.sender.userId : '' })) : null;
    const sendWithKeyboard = privateReply ? seal.replyPersonWithKeyboard : seal.replyToSenderWithKeyboard;
    const reply = (text) => {
      if (keyboard && typeof sendWithKeyboard === 'function') {
        let keyboardText = text;
        const hint = String(seal.ext.getStringConfig(ext, '官方Bot图片分页提示') || '').trim();
        if (hint && /\[CQ:image(?:,|\])/i.test(String(text))) {
          // 仅传给支持键盘的新核心；核心会在图片后续控制消息中替换并移除该标记。
          keyboardText += `[[YAN_PAGINATION:${hint.replace(/\]\]/g, '】】')}]]`;
        }
        sendWithKeyboard(ctx, msg, keyboardText, keyboard);
      }
      else send(ctx, msg, text);
    };
    if (!seal.ext.getBoolConfig(ext, '启用图片输出')) {
      reply(plain);
      return;
    }
    const base = String(seal.ext.getStringConfig(ext, '图片服务地址') || '').trim().replace(/\/+$/, '');
    const seconds = clamp(seal.ext.getIntConfig(ext, '图片请求超时秒数'), 3, 60);
    try {
      const response = await withTimeout(fetch(`${base}/api/render`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(view)
      }), seconds * 1000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!data || !data.url) throw new Error('图片服务未返回短链接');
      let imageUrl = String(data.url).trim();
      if (imageUrl.indexOf('/') === 0) imageUrl = `${base}${imageUrl}`;
      if (!/^https?:\/\//i.test(imageUrl)) throw new Error('图片服务返回了无效链接');
      reply(`[CQ:image,file=${imageUrl},cache=0]`);
    } catch (e) {
      console.warn(`${EXT_NAME}: render failed`, e);
      if (seal.ext.getBoolConfig(ext, '图片失败回退文字')) reply(`${plain}\n\n[图片渲染失败：${e.message || e}]`);
    }
  }
  function profileQuote(ctx, p) {
    const lowAffection = seal.ext.getIntConfig(ext, '判别式文案_低好感上限');
    const highAffection = Math.max(lowAffection + 1, seal.ext.getIntConfig(ext, '判别式文案_高好感下限'));
    const lowCoins = seal.ext.getIntConfig(ext, '判别式文案_低游戏币上限');
    const highCoins = Math.max(lowCoins + 1, seal.ext.getIntConfig(ext, '判别式文案_高游戏币下限'));
    const affectionBand = p.affection < lowAffection ? '低好感' : p.affection >= highAffection ? '高好感' : '普通好感';
    const coinBand = p.coins < lowCoins ? '低金币' : p.coins >= highCoins ? '高金币' : '普通金币';
    return template(ctx, `文案_判别_${affectionBand}_${coinBand}`, {
      name: p.name, coins: p.coins, affection: p.affection, relation: relation(p.affection).name
    });
  }

  // QQ官方Bot原生键盘。按钮只携带普通 .yan 指令，不写入OpenID或其他身份信息；
  // 没有核心键盘能力时 replyView 会自动回退到原有文字/CQ发送路径。
  let keyboardButtonCounter = 0;
  function commandButton(label, command, style, autoSend, targetUserId) {
    const safeLabel = String(label || '').slice(0, 24);
    const safeCommand = String(command || '').trim().slice(0, 120);
    if (!safeLabel || !safeCommand) return null;
    keyboardButtonCounter = (keyboardButtonCounter + 1) % 1000000;
    // enter=true 会直接发送；敏感操作使用 enter=false，只将指令放入用户当前输入框，
    // 用户可切换到私聊或补充参数后再发送，避免把手牌、个人地图和助手情报发到群里。
    // QQ官方Bot要求这里填写裸 user/member openid，不能传 SealDice 的
    // OpenQQ:<AppID>-<openid> 包装身份；普通QQ上下文则使用全员权限。
    const officialMatch = /^OpenQQ:[^-]+-(.+)$/.exec(String(targetUserId || ''));
    const officialChannel = /^OpenQQCH:(.+)$/.exec(String(targetUserId || ''));
    const permissionId = officialMatch ? officialMatch[1] : officialChannel ? officialChannel[1] : String(targetUserId || '');
    const permission = permissionId ? { type: 0, specify_user_ids: [permissionId] } : { type: 2 };
    return { id: `yan-${keyboardButtonCounter}`, render_data: { label: safeLabel, visited_label: autoSend === false ? '已填入输入框' : '已发送', style: style == null ? 1 : style }, action: { type: 2, permission, data: `.yan ${safeCommand}`, enter: autoSend !== false } };
  }
  function keyboardRows(buttons) {
    // QQ客户端在群聊/手机端会压缩按钮宽度；三列一排比五列更易读，
    // 同时遵守官方最多5行、每行最多5个按钮的限制。
    const rows = []; let row = [];
    (buttons || []).forEach((button) => { if (!button) return; row.push(button); if (row.length === 3) { rows.push({ buttons: row }); row = []; } });
    if (row.length) rows.push({ buttons: row });
    return rows.slice(0, 5);
  }
  function officialKeyboard(view) {
    if (!view || !view.kind) return null;
    let buttons = [];
    const targetUserId = view.targetUserId || '';
    const add = (label, command, style) => buttons.push(commandButton(label, command, style));
    const addDraft = (label, command, style) => buttons.push(commandButton(label, command, style, false, targetUserId));
    const addHome = () => { add('📊 我的', '我的'); add('📅 签到', '签到'); add('🎁 投喂', '投喂'); add('🏆 排行', '排行'); };
    const privateView = !!view.privateView;
    switch (String(view.kind)) {
      case 'profile':
        addHome();
        if (view.profileTotalPages) {
          if (view.profilePage > 1) add('⬅️ 上一页', '我的 上一页');
          if (view.profilePage < view.profileTotalPages) add('➡️ 下一页', '我的 下一页');
          add('📊 总览', '我的 首页');
        }
        add('🎮 游戏菜单', '帮助');
        break;
      case 'stats': addHome(); add('🎮 游戏菜单', '帮助'); break;
      case 'daily': add('📅 再看签到', '签到'); add('📊 我的', '我的'); add('🎁 投喂', '投喂'); add('🏆 排行', '排行'); break;
      case 'gift': add('🎁 礼物架', '投喂'); add('📊 我的', '我的'); add('📅 签到', '签到'); break;
      case 'poker': {
        const room = view.pokerTable || view.pokerScene || {};
        if (room.status === 'waiting') { add('✅ 加入', '德州 加入'); add('▶️ 开始', '德州 开始'); add('🤖 加机器人', '德州 机器人'); add('🚪 退出', '德州 退出'); }
        else if (room.status === 'finished') add('🃏 下一手', '德州 下一手');
        else { addDraft('🔐 私聊看牌', view.privateHandCommand || '德州 看牌'); add('过牌/跟注', '德州 跟注'); add('⬆️ 加注', '德州 加注'); add('🔥 全押', '德州 全押'); add('🏳️ 弃牌', '德州 弃牌'); }
        break;
      }
      case 'landlord': {
        const table = view.landlordTable || {};
        if (table.status === 'menu' || !table.status) { add('🤖 三人人机', '斗地主 人机'); add('🤖 四人人机', '斗地主 人机 四人'); add('🏠 三人开房', '斗地主 开房'); add('🏠 四人开房', '斗地主 开房 四人'); add('⚡ 短时3局', '斗地主 开房 短时'); add('🕕 中时6局', '斗地主 开房 中时'); add('🌙 长时12局', '斗地主 开房 长时'); add('🏆 锦标赛', '斗地主 锦标赛'); }
        else if (table.status === 'waiting') { add('✅ 加入', '斗地主 加入'); add('▶️ 开始', '斗地主 开始'); add('🤖 加机器人', '斗地主 机器人'); add('🚪 退出', '斗地主 退出'); }
        else if (table.status === 'finished') add('🆕 再来一局', '斗地主 再来一局');
        else if (table.status === 'landlordReveal') { add('✨ 明牌/摊打', '斗地主 明牌'); add('🌙 不明牌', '斗地主 不明牌'); addDraft('🔐 私聊看牌', view.privateHandCommand || '斗地主 看牌'); }
        else if (table.status === 'reportChoice') { add('📣 报到', '斗地主 报到'); add('⏭️ 不报到', '斗地主 不报到'); }
        else if (table.status === 'reportPlayChoice') { add('🔥 报到打', '斗地主 报到打'); add('⏭️ 报到不打', '斗地主 报到不打'); }
        else { addDraft('🔐 私聊看牌', view.privateHandCommand || '斗地主 看牌'); add('📣 叫1倍', '斗地主 叫 1'); add('📣 叫2倍', '斗地主 叫 2'); add('📣 叫3倍', '斗地主 叫 3'); add('⏭️ 不叫', '斗地主 不叫'); add('🃏 出牌', '斗地主 出牌'); add('🚫 不出', '斗地主 不出'); }
        add('📖 教程', '斗地主 教程');
        break;
      }
      case 'demon': {
        const scene = view.demonScene || {};
        if (scene.mode === 'playing') {
          add('🔫 对手', '恶魔 开枪 对手', 2); add('🔫 吞枪', '恶魔 开枪 自己', 2); add('🃏 盘面', '恶魔 盘面');
          const me = (scene.players || []).find((p) => p.current);
          const items = scene.viewerCurrent && Array.isArray(scene.viewerItems) ? scene.viewerItems : (me && Array.isArray(me.items) ? me.items : []);
          items.slice(0, 12).forEach((item) => add(`使用·${item}`, `恶魔 使用 ${item}`));
          add('📖 道具/符文', '恶魔 百科'); add('🏳️ 认输', '恶魔 认输', 2);
        } else if (scene.mode === 'finished') {
          add('🎲 再开人机', '恶魔 人机'); add('🚪 新开房', '恶魔 开房'); add('📖 百科', '恶魔 百科'); add('🏆 排行', '恶魔 排行');
        } else if (scene.mode === 'waiting') {
          add('✅ 加入', '恶魔 加入'); add('▶️ 开始', '恶魔 开始'); add('🎲 人机', '恶魔 人机'); add('🚪 退出', '恶魔 退出'); add('📖 百科', '恶魔 百科');
        } else {
          add('🎲 人机', '恶魔 人机'); add('🚪 开房', '恶魔 开房'); add('📜 模式', '恶魔 模式'); add('📖 百科', '恶魔 百科'); add('🏆 排行', '恶魔 排行');
        }
        break;
      }
      case 'blackjack': { const table = view.blackjackTable || {}; if (table.phase === 'round_result') add('🃏 下一回合', '21点 抽牌'); else { add('🃏 抽牌', '21点 抽牌'); add('✋ 停牌', '21点 停牌'); add('🃏 王牌', '21点 王牌'); } add('📖 教程', '21点 教程'); break; }
      case 'dmd': { const table = view.dmdTable || {}; if (table.status === 'waiting') { add('✅ 加入', '神抽 加入'); add('▶️ 开始', '神抽 开始'); } else { add('🎴 抽牌', '神抽 抽牌'); add('🛑 收手', '神抽 收手'); } add('📖 教程', '神抽 教程'); break; }
      case 'farkle': { const table = view.farkleTable || {}; if (table.status === 'waiting') { add('✅ 加入', '快艇 加入'); add('▶️ 开始', '快艇 开始'); } else { add('🎲 投掷', '快艇 投掷'); add('💾 存分', '快艇 存分'); } add('📖 教程', '快艇 教程'); break; }
      case 'love':
        add('🃏 下注', '爱赢一切 下注'); add('✅ 跟注', '爱赢一切 跟注'); add('🏳️ 弃牌', '爱赢一切 弃牌');
        if (privateView) { addDraft('📝 公开（填入）', '爱赢一切 公开'); addDraft('🔐 刷新手牌', view.privateHandCommand || '爱赢一切 看牌'); }
        else { addDraft('🔐 私聊看牌', view.privateHandCommand || '爱赢一切 看牌'); addDraft('📝 私聊公开', '爱赢一切 公开'); }
        add('📖 教程', '爱赢一切 教程'); break;
      case 'alchemy': {
        const table = view.alchemyTable || {};
        if (table.status === 'menu') { add('🤖 人机', '炼金 人机'); add('🏠 开房', '炼金 开房'); add('📖 教程', '炼金 教程'); }
        else if (table.status === 'waiting') { add('✅ 加入', '炼金 加入'); add('▶️ 开始', '炼金 开始'); }
        else if (table.status === 'playing') { add('🃏 选牌', '炼金 选牌'); add('✨ 使用魔法', '炼金 使用'); add('⏭️ 结束回合', '炼金 结束'); add('📖 教程', '炼金 教程'); }
        else { add('🆕 再来一局', '炼金 人机'); add('📖 教程', '炼金 教程'); }
        break;
      }
      case 'tomb': {
        const scene = view.tombScene || {};
        if (scene.treasures && scene.treasures.length) scene.treasures.slice(0, 5).forEach((_, i) => add(`宝物${i + 1}`, `古墓 拿 ${i + 1}`));
        add('📖 教程', '古墓 教程'); add('📊 背包', '古墓 背包'); add('⏭️ 跳过', '古墓 跳过'); break;
      }
      case 'fishing': { const scene = view.fishingScene || {}; if (scene.status === 'playing') { add('▶️ 继续', '钓鱼 继续'); add('🛑 收杆', '钓鱼 收杆'); } else { add('🎣 小鱼塘', '钓鱼 小鱼塘'); add('🌊 江水', '钓鱼 江水'); add('🌊 大海', '钓鱼 大海'); } add('📖 图鉴', '钓鱼 图鉴'); break; }
      case 'fishingCard': { const table = view.fishingCardTable || {}; if (table.status === 'menu') { add('🤖 人机', '钓鱼牌 人机'); add('🏠 开房', '钓鱼牌 开房'); add('📖 教程', '钓鱼牌 教程'); } else if (table.status === 'waiting') { add('✅ 加入', '钓鱼牌 加入'); add('▶️ 开始', '钓鱼牌 开始'); } else if (table.status === 'dealing') { if (table.phase === 'dealer_draw') add('🎴 抽牌定分牌', '钓鱼牌 抽牌'); else add('🃏 完成分牌', '钓鱼牌 分牌 1,3,5,7 1,2,3,4,5,6'); } else if (table.status === 'round_result') add('🆕 下一局', '钓鱼牌 下一局'); else if (table.status === 'playing') { add('🃏 吃牌', '钓鱼牌 吃牌'); add('🗑️ 弃牌', '钓鱼牌 弃牌'); add('🎴 摸牌', '钓鱼牌 摸牌'); } add('📖 教程', '钓鱼牌 教程'); break; }
      case 'scratch': { const ticket = view.scratchTicket || {}; if (ticket.status === 'unrevealed' || ticket.status === 'ready') add('🪙 刮开', '刮刮 刮开'); else { add('🎰 买10', '刮刮 买 10'); add('🎰 买30', '刮刮 买 30'); add('🎰 买50', '刮刮 买 50'); } add('📊 我的', '我的'); break; }
      case 'videoPoker': add('🃏 抽牌', '视频扑克 抽牌'); add('⬆️ 大', '视频扑克 大'); add('⬇️ 小', '视频扑克 小'); add('♻️ 复活', '视频扑克 复活'); add('💰 收下', '视频扑克 收下'); break;
      case 'work': add('▶️ 开始', '打工 开始'); add('📖 教程', '打工 教程'); add('⏹️ 结束', '打工 结束'); add('📊 统计', '打工 统计'); add('🧮 计算器', '打工 开始 计算器'); break;
      case 'auction': addDraft('🔎 私聊探索', view.privateInfoCommand || '竞拍 探索'); addDraft('💰 出价（填入）', '竞拍 出价'); addDraft('🔐 私人情报', view.privateInfoCommand || '竞拍 私图'); add('🧰 助手', '竞拍 助手'); add('📖 教程', '竞拍 教程'); add('✅ 确认', '竞拍 确认'); break;
      case 'bounty': add('🗺️ 状态', '赏金 状态'); add('🏃 行动', '赏金 行动'); addDraft('🔐 私图（填入）', '赏金 私图'); add('🎒 仓库', '赏金 仓库'); add('🔫 武器', '赏金 武器'); add('🧰 道具', '赏金 道具'); break;
      case 'leaderboard': add('🏆 综合', '排行 综合'); add('💗 好感', '排行 好感'); add('🪙 金币', '排行 金币'); add('🎮 德州', '排行 德州'); add('🎣 钓鱼', '排行 钓鱼'); break;
      case 'lottery': add('🎟️ 机选', '双色球 机选 1'); add('📊 状态', '双色球 状态'); add('📜 历史', '双色球 历史'); add('🎁 兑奖', '双色球 兑奖结果'); break;
      case 'deathDice': add('☠️ 简单', '生死骰 简单'); add('☠️ 困难', '生死骰 困难'); add('📊 我的', '我的'); break;
      case 'loan': add('💸 申请借款', '借款 申请'); add('💰 查询还款', '借款 状态'); add('📊 我的', '我的'); break;
      default: addHome(); break;
    }
    const rows = keyboardRows(buttons);
    return rows.length ? { content: { rows } } : null;
  }
  function normalizeRoomPlayerEligibility(player) {
    if (!player) return;
    if (typeof player.paid !== 'boolean') player.paid = !player.isBot;
    player.guest = !player.isBot && !player.paid;
  }
  function normalizeRoomEligibility(room) {
    if (!room) return;
    (room.players || []).forEach(normalizeRoomPlayerEligibility);
  }
  function setRoomPlayerEligibility(player, paid) {
    if (!player || player.isBot) return player;
    player.paid = !!paid; player.guest = !player.paid;
    return player;
  }
  function isSettlementEligible(player) {
    normalizeRoomPlayerEligibility(player);
    return !!player && !player.isBot && player.paid;
  }
  function isGuestPlayer(player) {
    normalizeRoomPlayerEligibility(player);
    return !!player && !player.isBot && player.guest;
  }
  function roomPlayerName(player) { return `${player.name}${isGuestPlayer(player) ? '（游客）' : ''}`; }
  function guestAdmissionQuote(ctx, name, entry) { return template(ctx, '文案_游客入场', { name, entry }); }
  function guestSettlementQuote(ctx, name) { return template(ctx, '文案_游客结算', { name }); }
  function roomExpired(room) {
    if (!room) return false;
    const mins = clamp(seal.ext.getIntConfig(ext, '房间过期分钟'), 5, 1440);
    return nowMs() - int(room.updatedAt, 0) > mins * 60000;
  }
  function refundWaitingRoom(room) {
    if (!room || room.status !== 'waiting') return;
    (room.players || []).forEach((pl) => {
      if (!pl.isBot && pl.paid) {
        const p = loadProfile(pl.id, pl.name); p.coins += room.entry; saveProfile(p);
      }
    });
  }
  function ensureRoomAvailable(game, gid) {
    const key = roomKey(game, gid);
    const room = jsonGet(key, null);
    normalizeRoomEligibility(room);
    if (room && roomExpired(room)) {
      if (game === 'auction') refundAuctionEscrow(room);
      if (game === 'love') loveUnbindRoomPlayers(room, gid);
      refundWaitingRoom(room);
      clearKey(key);
      return null;
    }
    return room;
  }
  function syncRoomPlayerName(room, id, name) {
    if (!room) return false;
    let changed = false;
    if (room.player && room.player.id === id && room.player.name !== name) { room.player.name = name; changed = true; }
    (room.players || []).forEach((player) => {
      if (player.id === id && player.name !== name) { player.name = name; changed = true; }
    });
    (room.ranking || []).forEach((row) => {
      if (row.id === id && row.name !== name) { row.name = name; changed = true; }
    });
    if (changed) room.updatedAt = nowMs();
    return changed;
  }
  function syncCurrentContextNames(ctx, msg, id, name) {
    const gid = groupId(ctx, msg);
    ['poker', 'blackjack', 'dmd', 'farkle', 'love', 'tomb', 'bounty', 'auction', 'landlord', 'alchemy', 'fishingCard'].forEach((game) => {
      const key = roomKey(game, gid); const room = jsonGet(key, null);
      if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    });
    const session = jsonGet(fishingKey(id), null);
    if (session && session.name !== name) { session.name = name; session.updatedAt = nowMs(); jsonSet(fishingKey(id), session); }
  }

  // -------------------- 德州扑克 --------------------
  const POKER_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const POKER_SUITS = ['S', 'H', 'D', 'C'];
  const POKER_TYPE = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺'];
  function pokerDeck() {
    const deck = [];
    POKER_SUITS.forEach((suit) => POKER_RANKS.forEach((rank, index) => deck.push({ suit, rank, value: index + 2 })));
    return shuffle(deck);
  }
  function cardText(c) {
    if (!c) return '?';
    const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[c.suit] || c.suit;
    return `${suit}${c.rank}`;
  }
  function pokerPrivateHandCommand(room, viewerId) {
    const player = room && room.players ? room.players.find((item) => item.id === viewerId) : null;
    if (!player || !Array.isArray(player.hand) || !player.hand.length) return '德州 看牌';
    // 牌面作为按钮的本地输入预填内容；发送后仍由“看牌”分支走私聊回复。
    return `德州 看牌（当前手牌：${player.hand.map(cardText).join(' ')}）`;
  }
  function compareTie(a, b) {
    if (a.category !== b.category) return a.category - b.category;
    for (let i = 0; i < Math.max(a.tie.length, b.tie.length); i++) {
      const d = (a.tie[i] || 0) - (b.tie[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  function evaluateFive(cards) {
    const vals = cards.map((c) => c.value).sort((a, b) => b - a);
    const counts = {};
    vals.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
    const groups = Object.keys(counts).map((v) => ({ value: int(v), count: counts[v] }))
      .sort((a, b) => b.count - a.count || b.value - a.value);
    const flush = cards.every((c) => c.suit === cards[0].suit);
    const unique = Array.from(new Set(vals));
    if (unique[0] === 14) unique.push(1);
    let straightHigh = 0;
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i + 4] === 4) { straightHigh = unique[i]; break; }
    }
    let category = 0; let tie = vals;
    if (flush && straightHigh) { category = 8; tie = [straightHigh]; }
    else if (groups[0].count === 4) { category = 7; tie = [groups[0].value, groups[1].value]; }
    else if (groups[0].count === 3 && groups[1] && groups[1].count === 2) { category = 6; tie = [groups[0].value, groups[1].value]; }
    else if (flush) { category = 5; tie = vals; }
    else if (straightHigh) { category = 4; tie = [straightHigh]; }
    else if (groups[0].count === 3) {
      category = 3; tie = [groups[0].value].concat(groups.filter((g) => g.count === 1).map((g) => g.value).sort((a, b) => b - a));
    } else {
      const pairs = groups.filter((g) => g.count === 2).map((g) => g.value).sort((a, b) => b - a);
      const singles = groups.filter((g) => g.count === 1).map((g) => g.value).sort((a, b) => b - a);
      if (pairs.length >= 2) { category = 2; tie = [pairs[0], pairs[1], singles[0]]; }
      else if (pairs.length === 1) { category = 1; tie = [pairs[0]].concat(singles); }
    }
    return { category, tie, name: POKER_TYPE[category] };
  }
  function pokerEvaluate(cards) {
    let best = null;
    for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++)
      for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++)
        for (let e = d + 1; e < cards.length; e++) {
          const result = evaluateFive([cards[a], cards[b], cards[c], cards[d], cards[e]]);
          if (!best || compareTie(result, best) > 0) best = result;
        }
    return best;
  }
  function pokerBestHandText(stats) {
    const hand = stats && stats.bestPokerHand;
    return hand && Number.isFinite(hand.category) ? (POKER_TYPE[clamp(int(hand.category, 0), 0, 8)] || hand.name || '尚无摊牌记录') : '尚无摊牌记录';
  }
  function recordPokerHandAchievement(player) {
    if (!isSettlementEligible(player) || !player.eval) return;
    const profile = loadProfile(player.id, player.name); const stats = profile.stats.poker || emptyGameStats();
    const current = stats.bestPokerHand;
    if (!current || compareTie(player.eval, current) > 0) {
      stats.bestPokerHand = { category: player.eval.category, tie: player.eval.tie.slice(), name: player.eval.name };
      profile.stats.poker = stats; saveProfile(profile);
    }
  }
  function pokerPlayer(id, name, isBot, paid) {
    const bot = !!isBot; const entryPaid = bot ? false : paid !== false;
    return {
      id, name, isBot: bot, paid: entryPaid, guest: !bot && !entryPaid, stack: ENTRY.poker, hand: [], status: 'waiting',
      roundBet: 0, totalBet: 0, acted: false, eval: null, foldedThisHand: false,
      handStartStack: ENTRY.poker, eliminatedHand: 0, eliminationOrder: 0
    };
  }
  function nextPokerIndex(room, from, predicate) {
    for (let step = 1; step <= room.players.length; step++) {
      const i = (from + step) % room.players.length;
      if (!predicate || predicate(room.players[i])) return i;
    }
    return from;
  }
  function pokerBet(room, p, amount) {
    const paid = clamp(int(amount, 0), 0, p.stack);
    p.stack -= paid; p.roundBet += paid; p.totalBet += paid; room.pot += paid;
    if (p.stack === 0 && p.status === 'active') p.status = 'allin';
    return paid;
  }
  function createPokerRoom(ownerId, ownerName, ownerPaid, mode) {
    return {
      game: 'poker', mode: mode || 'pvp', status: 'waiting', entry: ENTRY.poker, ownerId,
      players: [pokerPlayer(ownerId, ownerName, false, ownerPaid)], deck: [], board: [], pot: 0,
      stage: 'waiting', dealer: 0, turn: 0, currentBet: 0, minRaise: 50,
      handNo: 0, eliminationSeq: 0, logs: ['牌桌已经准备好，等待玩家入座。'],
      createdAt: nowMs(), updatedAt: nowMs(), settled: false
    };
  }
  function pokerEnsureTournament(room) {
    if (!room) return;
    normalizeRoomEligibility(room);
    if (!room.mode) room.mode = room.players && room.players.filter((player) => !player.isBot).length === 1 && room.players.some((player) => player.isBot) ? 'pve' : 'pvp';
    if (!Number.isFinite(room.handNo)) room.handNo = room.status === 'waiting' ? 0 : 1;
    if (!Number.isFinite(room.eliminationSeq)) room.eliminationSeq = 0;
    room.players.forEach((p) => {
      if (!Number.isFinite(p.stack)) p.stack = ENTRY.poker;
      if (!Number.isFinite(p.handStartStack)) p.handStartStack = Math.max(0, p.stack + int(p.totalBet, 0));
      if (!Number.isFinite(p.eliminatedHand)) p.eliminatedHand = 0;
      if (!Number.isFinite(p.eliminationOrder)) p.eliminationOrder = 0;
      if (typeof p.foldedThisHand !== 'boolean') p.foldedThisHand = p.status === 'folded';
      room.eliminationSeq = Math.max(room.eliminationSeq, p.eliminationOrder);
    });
  }
  function pokerTournamentRanking(room) {
    const seats = room.players.map((p, seat) => ({ p, seat }));
    const remaining = seats.filter((item) => item.p.stack > 0)
      .sort((a, b) => b.p.stack - a.p.stack || a.seat - b.seat);
    const eliminated = seats.filter((item) => item.p.stack <= 0)
      .sort((a, b) => b.p.eliminationOrder - a.p.eliminationOrder || b.p.handStartStack - a.p.handStartStack || a.seat - b.seat);
    return remaining.concat(eliminated).map((item) => item.p);
  }
  function startPoker(room) {
    pokerEnsureTournament(room);
    if (room.status === 'waiting') {
      if (room.players.length < 2) return '至少需要两名玩家或机器人。';
      room.handNo = 0; room.eliminationSeq = 0; room.settled = false; room.ranking = null; room.winnerIds = [];
      room.players.forEach((p) => {
        p.stack = ENTRY.poker; p.eliminatedHand = 0; p.eliminationOrder = 0;
        p.affectionDelta = 0; p.coinReward = 0;
      });
    } else if (room.status !== 'between_hands') return '只有等待中的牌桌或已完成一手的牌桌可以发牌。';
    return startPokerHand(room);
  }
  function startPokerHand(room) {
    const contenders = room.players.filter((p) => p.stack > 0);
    if (contenders.length < 2) { finishPokerTournament(room); return ''; }
    room.handNo += 1;
    if (room.handNo === 1) room.dealer = room.players.findIndex((p) => p.stack > 0);
    else room.dealer = nextPokerIndex(room, room.dealer, (p) => p.stack > 0);
    room.deck = pokerDeck(); room.board = []; room.pot = 0; room.stage = 'preflop'; room.status = 'playing';
    room.currentBet = 0; room.minRaise = 50; room.handWinnerIds = []; room.logs = [`第 ${room.handNo} 手开始。`];
    room.players.forEach((p) => {
      p.handStartStack = p.stack; p.roundBet = 0; p.totalBet = 0; p.acted = p.stack <= 0; p.eval = null; p.foldedThisHand = false;
      if (p.stack > 0) { p.hand = [room.deck.pop(), room.deck.pop()]; p.status = 'active'; }
      else { p.hand = []; p.status = 'eliminated'; }
    });
    const headsUp = contenders.length === 2;
    const sb = headsUp ? room.dealer : nextPokerIndex(room, room.dealer, (p) => p.stack > 0);
    const bb = nextPokerIndex(room, sb, (p) => p.stack > 0);
    pokerBet(room, room.players[sb], 25);
    pokerBet(room, room.players[bb], 50);
    room.currentBet = Math.max(room.players[sb].roundBet, room.players[bb].roundBet);
    if (room.players.some((p) => p.status === 'active')) {
      room.turn = headsUp && room.players[sb].status === 'active' ? sb : nextPokerIndex(room, headsUp ? sb : bb, (p) => p.status === 'active');
    }
    room.logs.push(`${room.players[sb].name} 小盲25，${room.players[bb].name} 大盲50。`);
    room.updatedAt = nowMs();
    if (!room.players.some((p) => p.status === 'active')) pokerShowdown(room);
    return '';
  }
  function pokerAwardByFold(room, winner) {
    winner.stack += room.pot; room.logs.push(`${winner.name} 赢得底池 ${room.pot}。`); room.pot = 0;
    finishPokerHand(room, [winner.id]);
  }
  function pokerSidePots(room) {
    const levels = Array.from(new Set(room.players.map((p) => p.totalBet).filter((n) => n > 0))).sort((a, b) => a - b);
    let prev = 0; const winnerIds = [];
    levels.forEach((level) => {
      const contributors = room.players.filter((p) => p.totalBet >= level);
      const amount = (level - prev) * contributors.length; prev = level;
      const eligible = contributors.filter((p) => !p.foldedThisHand);
      if (!eligible.length || !amount) return;
      let best = eligible[0].eval; let winners = [eligible[0]];
      eligible.slice(1).forEach((p) => {
        const cmp = compareTie(p.eval, best);
        if (cmp > 0) { best = p.eval; winners = [p]; }
        else if (cmp === 0) winners.push(p);
      });
      const share = Math.floor(amount / winners.length); let rem = amount - share * winners.length;
      winners.forEach((p) => { p.stack += share + (rem-- > 0 ? 1 : 0); if (winnerIds.indexOf(p.id) === -1) winnerIds.push(p.id); });
      room.logs.push(`${winners.map((p) => p.name).join('、')} 以${best.name}分得 ${amount} 筹码。`);
    });
    room.pot = 0;
    return winnerIds;
  }
  function pokerShowdown(room) {
    while (room.board.length < 5) room.board.push(room.deck.pop());
    room.players.filter((p) => p.hand.length === 2 && !p.foldedThisHand).forEach((p) => { p.eval = pokerEvaluate(p.hand.concat(room.board)); });
    room.players.filter((p) => p.eval).forEach(recordPokerHandAchievement);
    const winners = pokerSidePots(room);
    finishPokerHand(room, winners);
  }
  function finishPokerHand(room, winnerIds) {
    room.handWinnerIds = winnerIds || []; room.stage = 'hand_end'; room.updatedAt = nowMs();
    const newlyBusted = room.players.map((p, seat) => ({ p, seat }))
      .filter((item) => item.p.handStartStack > 0 && item.p.stack <= 0 && !item.p.eliminationOrder)
      .sort((a, b) => a.p.handStartStack - b.p.handStartStack || a.seat - b.seat);
    newlyBusted.forEach((item) => {
      item.p.eliminatedHand = room.handNo; item.p.eliminationOrder = ++room.eliminationSeq; item.p.status = 'eliminated';
      room.logs.push(`${item.p.name} 在第 ${room.handNo} 手筹码归零，第 ${room.players.length - item.p.eliminationOrder + 1} 名退场。`);
    });
    room.players.filter((p) => p.stack > 0).forEach((p) => { p.status = 'survived'; });
    const remaining = room.players.filter((p) => p.stack > 0);
    room.logs.push(`第 ${room.handNo} 手结束，仍有 ${remaining.length} 人持有筹码。`);
    if (remaining.length <= 1) { finishPokerTournament(room); return; }
    room.status = 'between_hands';
  }
  function finishPokerTournament(room) {
    room.status = 'finished'; room.stage = 'tournament_end'; room.updatedAt = nowMs();
    if (room.settled) return;
    room.settled = true;
    const ranked = pokerTournamentRanking(room); const champion = ranked[0];
    room.winnerIds = champion ? [champion.id] : [];
    const humanCount = ranked.filter((p) => !p.isBot).length;
    const eligibleCount = ranked.filter(isSettlementEligible).length;
    ranked.forEach((pl, index) => {
      pl.affectionDelta = 0; pl.coinReward = 0;
      if (!isSettlementEligible(pl)) {
        if (isGuestPlayer(pl)) room.logs.push(`${pl.name} 以游客身份完成本场，排名保留但不结算奖励、好感与档案。`);
        return;
      }
      const p = loadProfile(pl.id, pl.name);
      const won = index === 0;
      const coinReward = awardEntryReturn(p, 'poker', won);
      const delta = rankedAffection(index, room.players.length);
      changeAffection(p, delta);
      recordGame(p, 'poker', won ? 'win' : 'loss', pl.stack, coinReward - ENTRY.poker, { affectionDelta: delta });
      pl.affectionDelta = delta; pl.coinReward = coinReward;
      if (coinReward) room.logs.push(`${pl.name} 成为最后一名仍有筹码的玩家，获得 ${coinReward} 游戏币（两倍入场费回报）。`);
    });
    if (champion) champion.status = 'champion';
    room.ranking = ranked.map((p, i) => ({
      rank: i + 1, id: p.id, name: p.name, stack: p.stack, eliminatedHand: p.eliminatedHand || 0,
      eliminationOrder: p.eliminationOrder || 0, affectionDelta: p.affectionDelta || 0, coinReward: p.coinReward || 0,
      guest: isGuestPlayer(p)
    }));
    if (!humanCount) room.logs.push('本桌没有真人玩家，不结算档案。');
    else if (!eligibleCount) room.logs.push('本桌真人均为游客，本场不写入任何玩家档案。');
  }
  function pokerNextHand(room, id) {
    if (!room || room.status !== 'between_hands') return '只有单手已经结束、但整场尚未结束时才能进入下一手。';
    if (!room.players.some((p) => !p.isBot && p.id === id)) return '只有本桌真人玩家可以开启下一手。';
    const err = startPoker(room); if (err) return err;
    pokerRunBots(room); return '';
  }
  function pokerRematch(room, id, name) {
    if (!room || room.status !== 'finished') return { error: '只有已经结算的牌桌可以进入下一局。' };
    if (room.ownerId !== id) return { error: '请由上一局房主发起下一局。' };
    const oldBots = room.players.filter((player) => player.isBot);
    const oldHumanCount = room.players.filter((player) => !player.isBot).length;
    const profile = loadProfile(id, name); const paid = charge(profile, ENTRY.poker);
    if (!paid && oldHumanCount === 1) return { error: `人机下一局仍需 ${ENTRY.poker} 游戏币，当前余额 ${profile.coins}。` };
    const nextRoom = createPokerRoom(id, name, paid, oldHumanCount === 1 ? 'pve' : 'pvp');
    oldBots.forEach((bot, index) => {
      nextRoom.players.push(pokerPlayer(`${BOT_PREFIX}poker:${nowMs()}:${index + 1}`, bot.name, true));
    });
    if (oldHumanCount === 1 && nextRoom.players.length >= 2) {
      startPoker(nextRoom); pokerRunBots(nextRoom);
      return { room: nextRoom, profile, started: true, message: '下一场淘汰赛已经开始。' };
    }
    nextRoom.logs = [`${name}${paid ? '' : '以游客身份'}发起下一场淘汰赛，等待其余 ${Math.max(1, oldHumanCount - 1)} 名真人重新加入。`];
    return {
      room: nextRoom, profile, paid, started: false,
      message: '新一场牌桌已建立，其他真人请发送“.德州 加入”，房主随后发送“.德州 开始”。'
    };
  }
  function pokerNextStage(room) {
    room.players.forEach((p) => { p.roundBet = 0; p.acted = p.status !== 'active'; });
    room.currentBet = 0;
    if (room.stage === 'preflop') { room.stage = 'flop'; room.board.push(room.deck.pop(), room.deck.pop(), room.deck.pop()); }
    else if (room.stage === 'flop') { room.stage = 'turn'; room.board.push(room.deck.pop()); }
    else if (room.stage === 'turn') { room.stage = 'river'; room.board.push(room.deck.pop()); }
    else { pokerShowdown(room); return; }
    room.logs.push(`进入 ${room.stage.toUpperCase()}。`);
    const active = room.players.filter((p) => p.status === 'active');
    if (active.length <= 1) { pokerShowdown(room); return; }
    room.turn = nextPokerIndex(room, room.dealer, (p) => p.status === 'active');
  }
  function pokerAdvance(room) {
    const alive = room.players.filter((p) => p.hand.length === 2 && !p.foldedThisHand);
    if (alive.length === 1) { pokerAwardByFold(room, alive[0]); return; }
    const active = room.players.filter((p) => p.status === 'active');
    if (active.length === 0) { pokerShowdown(room); return; }
    const allActed = active.every((p) => p.acted);
    const allMatched = active.every((p) => p.roundBet === room.currentBet);
    if (allActed && allMatched) { pokerNextStage(room); return; }
    room.turn = nextPokerIndex(room, room.turn, (p) => p.status === 'active');
  }
  function pokerAct(room, id, action, amount) {
    if (room.status !== 'playing') return '牌局尚未开始或已经结束。';
    const p = room.players[room.turn];
    if (!p || p.id !== id) return `还没轮到你，当前行动者是 ${p ? p.name : '未知'}。`;
    const toCall = Math.max(0, room.currentBet - p.roundBet);
    if (action === 'fold') { p.status = 'folded'; p.foldedThisHand = true; p.acted = true; room.logs.push(`${p.name} 弃牌。`); }
    else if (action === 'check') {
      if (toCall > 0) return `当前需要跟注 ${toCall}。`;
      p.acted = true; room.logs.push(`${p.name} 过牌。`);
    } else if (action === 'call') {
      const paid = pokerBet(room, p, toCall); p.acted = true; room.logs.push(`${p.name} 跟注 ${paid}${p.status === 'allin' ? '并全押' : ''}。`);
    } else if (action === 'allin') {
      const oldCurrent = room.currentBet; const paid = pokerBet(room, p, p.stack); p.acted = true;
      if (p.roundBet > room.currentBet) {
        room.currentBet = p.roundBet; room.minRaise = Math.max(room.minRaise, p.roundBet - oldCurrent);
        room.players.forEach((other) => { if (other.id !== p.id && other.status === 'active') other.acted = false; });
      }
      room.logs.push(`${p.name} 全押 ${paid}。`);
    } else if (action === 'raise') {
      const inc = int(amount, 0);
      if (inc < room.minRaise && p.stack > toCall + inc) return `最小加注额为 ${room.minRaise}。`;
      if (p.stack <= toCall) return '筹码不足以加注，只能跟注全押。';
      const oldCurrent = room.currentBet;
      const paid = pokerBet(room, p, Math.min(p.stack, toCall + Math.max(inc, room.minRaise)));
      p.acted = true;
      if (p.roundBet > oldCurrent) {
        room.currentBet = p.roundBet; room.minRaise = Math.max(room.minRaise, p.roundBet - oldCurrent);
        room.players.forEach((other) => { if (other.id !== p.id && other.status === 'active') other.acted = false; });
      }
      room.logs.push(`${p.name} 加注，投入 ${paid}${p.status === 'allin' ? '并全押' : ''}。`);
    } else return '未知操作。';
    room.updatedAt = nowMs();
    pokerAdvance(room);
    return '';
  }
  function pokerStrength(room, p) {
    if (room.board.length >= 3) return pokerEvaluate(p.hand.concat(room.board)).category * 20 + Math.max.apply(null, p.hand.map((c) => c.value));
    const pair = p.hand[0].value === p.hand[1].value;
    const suited = p.hand[0].suit === p.hand[1].suit;
    return (pair ? 45 + p.hand[0].value * 2 : p.hand[0].value + p.hand[1].value) + (suited ? 4 : 0);
  }
  function pokerRunBots(room) {
    let guard = 0;
    while (room.status === 'playing' && room.players[room.turn] && room.players[room.turn].isBot && guard++ < 100) {
      const p = room.players[room.turn]; const toCall = room.currentBet - p.roundBet; const strength = pokerStrength(room, p); const r = Math.random();
      let act = 'check'; let amount = 0;
      if (toCall > 0) {
        if (strength < 18 && r < 0.45) act = 'fold';
        else if (strength > 52 && p.stack > toCall + room.minRaise && r < 0.35) { act = 'raise'; amount = room.minRaise; }
        else act = 'call';
      } else if (strength > 48 && p.stack >= room.minRaise && r < 0.35) { act = 'raise'; amount = room.minRaise; }
      pokerAct(room, p.id, act, amount);
    }
  }
  function pokerView(room, viewerId, privateHand, quote) {
    pokerEnsureTournament(room);
    const stageNames = {
      waiting: '等待入座', preflop: '翻牌前', flop: '翻牌', turn: '转牌', river: '河牌',
      hand_end: '单手结算', tournament_end: '整场结算', showdown: '摊牌结算'
    };
    const statusNames = { waiting: '等待', active: '在局', allin: '全押', folded: '弃牌', survived: '晋级', eliminated: '已淘汰', champion: '冠军' };
    const stageLabel = room.handNo > 0 ? `第${room.handNo}手 · ${stageNames[room.stage] || room.stage}` : (stageNames[room.stage] || room.stage);
    const lines = [
      `阶段 ${stageLabel}  |  底池 ${room.pot}  |  当前注 ${room.currentBet}`,
      `公共牌 ${room.board.length ? room.board.map(cardText).join(' ') : '尚未发牌'}`
    ];
    room.players.forEach((p, index) => {
      const turn = room.status === 'playing' && index === room.turn ? '▶ ' : '';
      let hand = '';
      const pveFaceUp = room.mode === 'pve' && !p.isBot;
      if ((privateHand && p.id === viewerId) || pveFaceUp) hand = ` | 手牌 ${p.hand.map(cardText).join(' ')}`;
      else if ((room.status === 'between_hands' || room.status === 'finished') && !p.foldedThisHand && p.hand.length) hand = ` | ${p.hand.map(cardText).join(' ')} ${p.eval ? p.eval.name : ''}`;
      lines.push(`${turn}${roomPlayerName(p)} | 筹码 ${p.stack} | 本轮 ${p.roundBet} | ${statusNames[p.status] || p.status}${hand}`);
    });
    (room.logs || []).slice(-4).forEach((log) => lines.push(`· ${log}`));
    if (room.ranking) room.ranking.forEach((r) => lines.push(r.guest
      ? `#${r.rank} ${r.name}（游客） ${r.stack}筹码 · 不结算档案`
      : `#${r.rank} ${r.name} ${r.stack}筹码 ${r.affectionDelta >= 0 ? '+' : ''}${r.affectionDelta}好感${r.coinReward ? ` +${r.coinReward}币` : ''}`));
    else if (room.status === 'between_hands') pokerTournamentRanking(room).forEach((p, index) => {
      lines.push(`暂定#${index + 1} ${p.name} ${p.stack > 0 ? `${p.stack}筹码` : `第${p.eliminatedHand}手淘汰`}`);
    });
    const humanCount = room.players.filter((player) => !player.isBot).length;
    const nextAction = room.status === 'between_hands'
      ? '发送“.德州 下一手”继续发牌，不会再次扣除入场费。'
      : room.status === 'finished'
        ? humanCount === 1
        ? '发送“.德州 下一局”重新支付150并立即开始。'
        : room.ownerId === viewerId
          ? '整场已结束；房主发送“.德州 下一局”发起新一场，其他真人随后重新加入。'
          : '整场已结束；等待房主发起下一局，再用“.德州 加入”重新入座。'
        : '';
    if (nextAction) lines.push(`下一步：${nextAction}`);
    const stackMax = Math.max(ENTRY.poker, ...room.players.map((p) => p.stack));
    const meters = room.players.map((p) => ({ label: roomPlayerName(p), value: p.stack, min: 0, max: stackMax, text: `${p.stack}筹码 · ${p.status}` }));
    const pokerTable = {
      status: room.status, handNo: room.handNo, stage: stageLabel, pot: room.pot, currentBet: room.currentBet,
      board: [0, 1, 2, 3, 4].map((index) => room.board[index] ? { rank: room.board[index].rank, suit: room.board[index].suit, hidden: false } : null),
      seats: room.players.map((p, index) => {
        const reveal = (room.mode === 'pve' && !p.isBot) || (privateHand && p.id === viewerId) || ((room.status === 'between_hands' || room.status === 'finished') && !p.foldedThisHand);
        return {
          name: p.name, stack: p.stack, roundBet: p.roundBet, totalBet: p.totalBet,
          status: statusNames[p.status] || p.status, isTurn: room.status === 'playing' && index === room.turn,
          isDealer: index === room.dealer, isBot: p.isBot, isGuest: isGuestPlayer(p),
          cards: (p.hand || []).map((card) => ({ rank: card.rank, suit: card.suit, hidden: !reveal }))
        };
      }),
      lastAction: (room.logs || []).length ? room.logs[room.logs.length - 1] : '牌桌等待下一步操作。', nextAction
    };
    return { kind: 'poker', privateView: !!privateHand, privateHandCommand: pokerPrivateHandCommand(room, viewerId), title: '德州扑克淘汰赛', subtitle: '整场仅入场一次150 · 小盲25 · 大盲50', pokerTable, meters, lines, quote: quote || '' };
  }
  function pokerMenuView(quote) {
    return {
      kind: 'poker', title: '德州扑克淘汰赛', subtitle: '整场仅入场一次150 · 小盲25 · 大盲50',
      lines: ['.yan 德州 教程 [页码]', '.yan 德州 人机', '.yan 德州 开房 / 加入 / 机器人 [数量] / 开始', '.yan 德州 过牌 / 跟注 / 加注 [额度] / 全押 / 弃牌', '.yan 德州 看牌 / 状态 / 下一手 / 下一局 / 退出 / 清理', '多人房余额不足仍可作为游客入座，但不结算奖励、好感与档案。'],
      quote: quote || ''
    };
  }

// -------------------- 斗地主 --------------------
  const LANDLORD_RANKS = ['3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A', '2'];
  function landlordDeck(doubleDeck) {
    const deck = []; const suits = ['♠', '♥', '♦', '♣'];
    const copies = doubleDeck ? 2 : 1;
    for (let c = 0; c < copies; c++) LANDLORD_RANKS.forEach((rank) => suits.forEach((suit) => deck.push({ rank, suit, id: `${rank}${suit}${c}` })));
    deck.push({ rank: '小王', suit: '', id: `jokerS${copies}` }, { rank: '大王', suit: '', id: `jokerB${copies}` });
    if (doubleDeck) deck.push({ rank: '小王', suit: '', id: 'jokerS2' }, { rank: '大王', suit: '', id: 'jokerB2' });
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    return deck;
  }
  function landlordRank(card) { const rank = String(card && card.rank || ''); if (rank === '小王') return 16; if (rank === '大王') return 17; return LANDLORD_RANKS.indexOf(rank) + 3; }
  function landlordCardText(card) { return card ? `${card.rank}${card.suit || ''}` : ''; }
  function landlordHandCommand(room, id) { const p = room && room.players ? room.players.find((x) => x.id === id) : null; return p && p.hand && p.hand.length ? `斗地主 看牌（当前手牌：${p.hand.map(landlordCardText).join(' ')}）` : '斗地主 看牌'; }

  // -------------------- AI 名册与层级配置 --------------------
  const LANDLORD_BOT_LEVELS = {
    // 1级AI（入门）
    '米尔特': 1, '薇拉兹': 1, '扎吉': 1, '姜修泽': 1,
    // 2级AI（普通）
    '白绘松': 2, '裴闻讯': 2, '银石': 2, '葛明治': 2, '阿日': 2,
    // 3级AI（高手）
    '陈小刀': 3, '周润发': 3, '伊藤开司': 3, '严茫熙': 3,
    // 4级AI（大师）
    '皮尔特松': 4, '高进': 4, '柏枝止斗': 4, '赤木茂': 4, '秋山深一': 4, '卢本伟': 4, '掘开': 4, '亨德森': 4, '悠': 4, '煜': 4
  };
  const LANDLORD_ALL_BOT_NAMES = Object.keys(LANDLORD_BOT_LEVELS);

  function landlordBotLevel(name) { return LANDLORD_BOT_LEVELS[name] || (1 + Math.floor(Math.random() * 4)); }

  // 随机抽取对手（每个同名对手最多出现 1 次）
  function landlordBotName(existing) {
    const counts = {};
    (existing || []).forEach((x) => { counts[x] = (counts[x] || 0) + 1; });
    const available = LANDLORD_ALL_BOT_NAMES.filter((name) => (counts[name] || 0) < 1);
    if (available.length) return pick(available);
    return pick(LANDLORD_ALL_BOT_NAMES);
  }

  // 锦标赛全场对手抽取器（每个同名对手最多出现 1 次）
  function landlordGenerateTournamentEntrants(ownerId, ownerName, totalField) {
    const entrants = [{ id: ownerId, name: ownerName, isHuman: true, score: 0, wins: 0 }];
    const counts = { [ownerName]: 1 };
    const shuffled = shuffle(LANDLORD_ALL_BOT_NAMES.slice());
    
    for (let i = 0; i < shuffled.length && entrants.length < totalField; i++) {
      const name = shuffled[i];
      if ((counts[name] || 0) < 1) {
        counts[name] = (counts[name] || 0) + 1;
        entrants.push({
          id: `tour-ai-${entrants.length}`,
          name: name,
          isHuman: false,
          score: 0,
          wins: 0
        });
      }
    }
    while (entrants.length < totalField) {
      const name = pick(LANDLORD_ALL_BOT_NAMES);
      entrants.push({ id: `tour-ai-${entrants.length}`, name, isHuman: false, score: 0, wins: 0 });
    }
    return entrants;
  }

  function landlordPlayer(id, name, isBot, paid) { return { id, name, isBot: !!isBot, botLevel: isBot ? landlordBotLevel(name) : 0, paid: isBot ? false : paid !== false, guest: !isBot && paid === false, hand: [], role: 'unknown', chips: 0, bid: 0, passed: false, bidDone: false, bombsPlayed: 0, played: 0, roundWins: 0, matchPoints: 0, lastPlay: [], lastAction: '', status: 'waiting', isTurn: false }; }
  
  function createLandlordRoom(ownerId, ownerName, paid, mode, doubleDeck) {
    const m = mode || 'pvp';
    const isTournament = m === 'tournament';
    const maxRounds = isTournament ? 12 : m === 'short' ? 3 : m === 'medium' ? 6 : m === 'long' ? 12 : 1;
    const entry = isTournament ? 500 : (['short', 'medium', 'long'].indexOf(m) >= 0 ? 100 : 50);
    
    let tournamentEntrants = [];
    if (isTournament) {
      const totalField = doubleDeck ? 20 : 15;
      tournamentEntrants = landlordGenerateTournamentEntrants(ownerId, ownerName, totalField);
    }

    return {
      game: 'landlord', mode: m, status: 'waiting', ownerId, entry,
      doubleDeck: !!doubleDeck, fourPlayerBombRuleVersion: 1,
      players: [landlordPlayer(ownerId, ownerName, false, paid)],
      deck: [], bottom: [], revealCard: null, revealPlayerIndex: -1, revealPlayerName: '',
      current: 0, landlordIndex: -1, multiplier: 1, currentPlay: [], currentPlayOwnerIndex: -1,
      currentType: '', currentTypeData: null, passCount: 0, bidCount: 0, headLuo: false,
      openLandlord: false, reportGroups: [], reportCount: 0, reportActive: false, reportAutoWin: false,
      round: 1, maxRounds, roundHistory: [], tournamentEntrants, tournamentResult: null,
      logs: [isTournament ? '🏆 12副牌锦标赛已就绪，全场选手已就位。' : '斗地主牌桌已创建，等待玩家加入。'],
      settled: false, createdAt: nowMs(), updatedAt: nowMs()
    };
  }

  function landlordEnsure(room) {
    if (!room) return;
    room.players = Array.isArray(room.players) ? room.players : [];
    room.players.forEach((p) => {
      p.hand = Array.isArray(p.hand) ? p.hand : [];
      p.lastPlay = Array.isArray(p.lastPlay) ? p.lastPlay : [];
      p.lastAction = String(p.lastAction || '');
      p.role = p.role || 'unknown';
      p.bid = int(p.bid, 0);
      p.bombsPlayed = int(p.bombsPlayed, 0);
      p.played = int(p.played, 0);
      p.playActions = int(p.playActions, 0);
      p.roundWins = int(p.roundWins, 0);
      p.matchPoints = int(p.matchPoints, 0);
      if (p.isBot && !p.botLevel) p.botLevel = landlordBotLevel(p.name);
    });
    if (!room.maxRounds) room.maxRounds = room.mode === 'tournament' ? 12 : 1;
    if (!Array.isArray(room.bottom)) room.bottom = [];
    if (!Array.isArray(room.displayPlay)) room.displayPlay = [];
    if (!Array.isArray(room.reportGroups)) room.reportGroups = [];
    room.reportCount = int(room.reportCount, room.reportGroups.length);
    room.headLuo = !!room.headLuo;
    room.openLandlord = !!room.openLandlord;
    room.reportActive = !!room.reportActive;
    room.reportAutoWin = !!room.reportAutoWin;
    if (room.revealPlayerIndex == null) room.revealPlayerIndex = -1;
    room.revealPlayerName = String(room.revealPlayerName || '');
    if (room.currentPlayOwnerIndex == null) room.currentPlayOwnerIndex = room.displayPlayerName ? room.players.findIndex((p) => p.name === room.displayPlayerName) : -1;
  }

  function landlordSort(hand) { return hand.sort((a, b) => landlordRank(a) - landlordRank(b) || String(a.suit).localeCompare(String(b.suit))); }

  function landlordDeal(room) {
    const count = room.doubleDeck ? 4 : 3;
    room.deck = landlordDeck(room.doubleDeck);
    room.bottom = room.deck.splice(0, room.doubleDeck ? 8 : 3);
    room.openLandlord = false; room.headLuo = false;
    room.reportGroups = []; room.reportCount = 0;
    room.reportActive = false; room.reportAutoWin = false;
    room.players.forEach((p) => {
      p.hand = []; p.lastPlay = []; p.lastAction = ''; p.role = 'unknown';
      p.bid = 0; p.bidDone = false; p.passed = false;
      p.bombsPlayed = 0; p.played = 0; p.playActions = 0; p.status = 'playing';
    });
    room.displayPlay = []; room.displayPlayerName = ''; room.displayPassed = false; room.bombCount = 0;
    for (let i = 0; i < room.deck.length; i++) room.players[i % count].hand.push(room.deck[i]);
    room.players.forEach((p) => landlordSort(p.hand));
    
    room.revealPlayerIndex = Math.floor(Math.random() * count);
    const revealHand = room.players[room.revealPlayerIndex].hand;
    room.revealCard = revealHand.length ? revealHand[Math.floor(Math.random() * revealHand.length)] : null;
    room.revealPlayerName = room.players[room.revealPlayerIndex] ? room.players[room.revealPlayerIndex].name : '';
    
    room.status = 'bidding'; room.bidCount = 0; room.multiplier = 1;
    room.currentPlayOwnerIndex = -1; room.current = room.revealPlayerIndex;
    room.players.forEach((p, i) => { p.isTurn = i === room.current; });
    room.logs.push(`第${room.round}/${room.maxRounds}局发牌完成，亮牌${room.revealCard ? landlordCardText(room.revealCard) : '—'}归属${room.revealPlayerName || '—'}，由其先叫地主。`);
  }

  function landlordStart(room) {
    landlordEnsure(room);
    const need = room.doubleDeck ? 4 : 3;
    if (room.players.length < need) return `至少需要${need}名玩家。`;
    room.status = 'bidding'; room.settled = false; room.round = int(room.round, 1);
    landlordDeal(room);
    return '';
  }

  function landlordParseCards(args) {
    const text = (args || []).join('').replace(/[，,、\s]+/g, '').toUpperCase();
    const ranks = []; let invalid = false;
    for (let i = 0; i < text.length;) {
      if (text.slice(i, i + 2) === '大王') { ranks.push('大王'); i += 2; continue; }
      if (text.slice(i, i + 2) === '小王') { ranks.push('小王'); i += 2; continue; }
      if (text.slice(i, i + 2) === '10') { ranks.push('T'); i += 2; continue; }
      const ch = text[i];
      if (LANDLORD_RANKS.indexOf(ch) >= 0) ranks.push(ch);
      else if ('♠♥♦♣'.indexOf(ch) < 0) invalid = true;
      i += 1;
    }
    ranks.invalid = invalid;
    return ranks;
  }

  function landlordConsecutive(values) { return values.every((v, i) => i === 0 || v === values[i - 1] + 1); }
  function landlordStraightInfo(vals, doubleDeck) {
    if (vals.length < 5) return null;
    if (vals[vals.length - 1] <= 14 && landlordConsecutive(vals)) return { rank: vals[vals.length - 1], special: '' };
    if (!doubleDeck) return null;
    const mapped = vals.map((v) => v === 14 ? 1 : v === 15 ? 2 : v).sort((a, b) => a - b);
    if (mapped.some((v, i) => i > 0 && v === mapped[i - 1])) return null;
    const contiguous = landlordConsecutive(mapped);
    if (!contiguous || mapped[mapped.length - 1] > 14) return null;
    const startsWithAce = mapped[0] === 1;
    const startsWithTwo = mapped[0] === 2;
    if (!startsWithAce && !startsWithTwo) return null;
    return { rank: mapped[mapped.length - 1], special: startsWithAce ? `A${vals.filter((v) => v !== 14).sort((a, b) => a - b).map((v) => LANDLORD_RANKS[v - 3] || '').join('')}` : vals.map((v) => LANDLORD_RANKS[v - 3] || '').join('') };
  }

  function landlordType(cards, doubleDeck) {
    if (!cards || !cards.length) return { type: 'pass', len: 0, rank: 0, multi: false };
    const ranks = cards.map(landlordRank).sort((a, b) => a - b);
    const counts = {}; ranks.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
    const vals = Object.keys(counts).map(Number).sort((a, b) => a - b);
    const groups = vals.map((v) => counts[v]);
    const max = Math.max.apply(null, groups);
    const n = cards.length;
    const jokerCount = ranks.filter((r) => r >= 16).length;

    if ((!doubleDeck && n === 2 && jokerCount === 2 && vals.includes(16) && vals.includes(17)) || (doubleDeck && n === 4 && jokerCount === 4)) return { type: 'rocket', len: n, rank: 20, multi: true, bomb: true };
    if (vals.length === 1 && n >= 4 && (!doubleDeck ? n === 4 : n <= 8)) return { type: 'bomb', len: n, rank: vals[0], multi: true, bomb: true };
    if (max === 3 && n === 5 && groups.indexOf(2) >= 0) return { type: 'triplePair', len: 5, rank: vals[groups.indexOf(3)], multi: false };
    if (!doubleDeck && max === 3 && n === 4) return { type: 'tripleSingle', len: 4, rank: vals[groups.indexOf(3)], multi: false };
    if (max === 3 && n === 3) return { type: 'triple', len: 3, rank: vals[groups.indexOf(3)], multi: false };
    if (max === 2 && n === 2) return { type: 'pair', len: 2, rank: vals[groups.indexOf(2)], multi: false };
    if (n === 1) return { type: 'single', len: 1, rank: vals[0], multi: false };

    const straight = vals.length === n ? landlordStraightInfo(vals, !!doubleDeck) : null;
    if (straight) return { type: 'straight', len: n, rank: straight.rank, special: straight.special, multi: false };
    if (n >= 6 && n % 2 === 0 && vals.length === n / 2 && groups.every((x) => x === 2) && vals[vals.length - 1] <= 14 && landlordConsecutive(vals)) return { type: 'pairStraight', len: n, rank: vals[vals.length - 1], multi: false };

    const tripleRanks = vals.filter((v) => counts[v] >= 3 && v <= 14);
    for (let size = tripleRanks.length; size >= 2; size--) {
      for (let start = 0; start + size <= tripleRanks.length; start++) {
        const chain = tripleRanks.slice(start, start + size);
        if (!landlordConsecutive(chain)) continue;
        const remaining = {};
        vals.forEach((v) => { remaining[v] = counts[v] - (chain.indexOf(v) >= 0 ? 3 : 0); });
        if (chain.some((v) => remaining[v] > 0)) continue;
        const restCounts = Object.keys(remaining).map(Number).filter((v) => remaining[v] > 0).map((v) => remaining[v]);
        const restTotal = restCounts.reduce((sum, value) => sum + value, 0);
        if (restTotal === 0 && n === size * 3) return { type: 'airplane', len: n, rank: chain[chain.length - 1], chain: size, multi: false };
        if (!doubleDeck && restTotal === size && n === size * 4) return { type: 'airplaneSingle', len: n, rank: chain[chain.length - 1], chain: size, multi: false };
        if (restTotal === size * 2 && n === size * 5 && restCounts.length === size && restCounts.every((value) => value === 2)) return { type: 'airplanePair', len: n, rank: chain[chain.length - 1], chain: size, multi: false };
      }
    }
    return { type: 'invalid', len: n, rank: 0 };
  }

  function landlordCanBeat(next, prev) {
    if (!next || next.type === 'invalid') return false;
    if (!prev || !prev.type || prev.type === 'pass') return true;
    if (next.type === 'rocket') return prev.type !== 'rocket';
    if (prev.type === 'rocket') return false;
    if (next.type === 'bomb' && prev.type !== 'bomb') return true;
    if (next.type === 'bomb' && prev.type === 'bomb' && next.len !== prev.len) return next.len > prev.len;
    if (next.type !== prev.type || next.len !== prev.len) return false;
    return next.rank > prev.rank;
  }

  function landlordTakeCards(player, ranks) {
    const used = [];
    for (const rank of ranks) {
      const index = player.hand.findIndex((c) => c.rank === rank && used.indexOf(c) < 0);
      if (index < 0) return null;
      used.push(player.hand[index]);
    }
    player.hand = player.hand.filter((c) => used.indexOf(c) < 0);
    return used;
  }

  function landlordNextIndex(room, index) { return room.doubleDeck ? (index + 1) % room.players.length : (index - 1 + room.players.length) % room.players.length; }
  function landlordNextActiveIndex(room, index) {
    let next = index; let guard = 0;
    do { next = landlordNextIndex(room, next); if (++guard > room.players.length) break; }
    while (room.players[next] && room.players[next].status === 'out');
    return next;
  }
  function landlordNext(room) {
    room.current = landlordNextActiveIndex(room, room.current);
    room.players.forEach((p, i) => { p.isTurn = i === room.current; });
  }

  // -------------------- 大师级手牌手数与严谨估值引擎 --------------------
  function landlordAnalyzeHand(hand, doubleDeck) {
    if (!hand || !hand.length) return { steps: 0, bombs: 0, rocket: false, controls: 0, singlesCount: 0, pairsCount: 0, tripleCount: 0 };
    const groups = {};
    hand.forEach((c) => { const r = c.rank; groups[r] = (groups[r] || 0) + 1; });
    const ranks = Object.keys(groups).map((r) => ({ rank: r, value: landlordRank({ rank: r }), count: groups[r] })).sort((a, b) => a.value - b.value);
    
    const rocket = !doubleDeck ? (groups['小王'] >= 1 && groups['大王'] >= 1) : (groups['小王'] >= 2 && groups['大王'] >= 2);
    let bombCount = 0;
    ranks.forEach((g) => {
      if (g.value < 16 && (doubleDeck ? g.count >= 4 : g.count === 4)) bombCount++;
    });

    let controls = 0;
    ranks.forEach((g) => {
      if (g.value === 15) controls += g.count; // 2
      if (g.value >= 16) controls += g.count * 1.5; // 王
    });

    const rawTriples = ranks.filter((g) => g.count === 3 && g.value <= 15).length;
    const rawPairs = ranks.filter((g) => g.count === 2).length;
    const rawSingles = ranks.filter((g) => g.count === 1).length;
    const rawBombs = bombCount + (rocket ? 1 : 0);

    const availableWings = rawSingles + rawPairs;
    const effectiveTriples = rawTriples;
    const remainingWings = Math.max(0, availableWings - effectiveTriples);
    let estimatedSteps = rawBombs + effectiveTriples + Math.ceil(remainingWings * 0.7);
    if (estimatedSteps < 1 && hand.length > 0) estimatedSteps = 1;

    return {
      steps: estimatedSteps, bombs: bombCount, rocket: !!rocket,
      controls: Math.floor(controls), singlesCount: rawSingles,
      pairsCount: rawPairs, tripleCount: rawTriples
    };
  }

  // 叫地主精准估值：杜绝无大牌乱叫，有控制牌与整齐牌型时合理叫分
  function landlordEvaluateBidScore(hand, doubleDeck) {
    if (!hand || !hand.length) return 0;
    const groups = {};
    hand.forEach((c) => { const r = c.rank; groups[r] = (groups[r] || 0) + 1; });
    const ranks = Object.keys(groups).map((r) => ({ rank: r, value: landlordRank({ rank: r }), count: groups[r] })).sort((a, b) => a.value - b.value);

    let score = 0;

    // 统计控制牌
    const jokers = hand.filter((c) => landlordRank(c) >= 16);
    const bigJokerCount = jokers.filter((c) => c.rank === '大王').length;
    const smallJokerCount = jokers.filter((c) => c.rank === '小王').length;
    let twoCount = 0;
    let bombCount = 0;

    ranks.forEach((g) => {
      const isBomb = !doubleDeck ? (g.count === 4 && g.value < 16) : (g.count >= 4 && g.value < 16);
      if (isBomb) bombCount++;
      if (g.value === 15) twoCount += g.count;
    });

    // 铁律：无2、无王、无炸弹者，绝不叫地主（评分为0）
    if (jokers.length === 0 && twoCount === 0 && bombCount === 0) {
      return 0;
    }

    // 1. 底牌预期红利（仅当手里有大牌基础时才享受红利）
    score += doubleDeck ? 2.0 : 1.2;

    // 2. 王牌与火箭（王炸）估值
    if (!doubleDeck) {
      if (bigJokerCount >= 1 && smallJokerCount >= 1) score += 8.5; // 双王必抢
      else {
        score += bigJokerCount * 3.5;
        score += smallJokerCount * 2.2;
      }
    } else {
      if (jokers.length >= 4) score += 12.0;
      else if (jokers.length === 3) score += 7.0;
      else if (jokers.length === 2) score += 4.0;
      else score += jokers.length * 1.8;
    }

    // 3. 炸弹、2 与 A 级控制牌
    ranks.forEach((g) => {
      const isBomb = !doubleDeck ? (g.count === 4 && g.value < 16) : (g.count >= 4 && g.value < 16);
      if (isBomb) {
        score += 4.5 + (g.count - 4) * 1.5;
      } else if (g.value === 15) { // 2
        if (g.count === 1) score += 2.0;
        else if (g.count === 2) score += 4.5;
        else if (g.count === 3) score += 7.0;
      } else if (g.value === 14) { // A
        if (g.count === 1) score += 0.6;
        else if (g.count === 2) score += 1.5;
        else if (g.count === 3) score += 2.8;
      } else if (g.value >= 11 && g.value <= 13) { // J, Q, K
        score += g.count * 0.25;
      }
    });

    // 4. 成型三张与对子
    const triples = ranks.filter((g) => g.count === 3 && g.value <= 14).length;
    const pairs = ranks.filter((g) => g.count === 2 && g.value <= 14).length;
    score += triples * 1.2;
    score += pairs * 0.4;

    // 5. 顺子潜力检测
    let straightLen = 0;
    for (let i = 0; i < ranks.length; i++) {
      if (ranks[i].value <= 14 && (i === 0 || ranks[i].value === ranks[i - 1].value + 1)) {
        straightLen++;
        if (straightLen >= 5) score += 0.6;
      } else if (ranks[i].value <= 14) {
        straightLen = 1;
      } else {
        straightLen = 0;
      }
    }

    // 6. 对未成型的低单张扣分
    const deadSingles = ranks.filter((g) => g.count === 1 && g.value <= 8).length;
    score -= deadSingles * 0.5;

    return Math.max(0, score);
  }

  function landlordBotBid(room) {
    let guard = 0;
    while (room.status === 'bidding' && room.players[room.current] && room.players[room.current].isBot && guard++ < 8) {
      const p = room.players[room.current];
      const level = clamp(int(p.botLevel, 2), 1, 4);
      const score = landlordEvaluateBidScore(p.hand, room.doubleDeck);

      let bid = 0;
      if (level >= 3) { // 高手 / 大师
        if (score >= 11.5) bid = 3;
        else if (score >= 8.2) bid = 2;
        else if (score >= 5.5) bid = 1;
      } else if (level === 2) { // 普通
        if (score >= 10.8) bid = 3;
        else if (score >= 7.6) bid = 2;
        else if (score >= 5.0) bid = 1;
      } else { // 入门
        if (score >= 10.0) bid = 3;
        else if (score >= 7.0) bid = 2;
        else if (score >= 4.5) bid = 1;
      }

      // 抢地主加价逻辑
      if (bid <= room.multiplier && bid > 0) {
        if (room.multiplier === 1 && score >= 8.2) bid = 2;
        else if (room.multiplier === 2 && score >= 11.5) bid = 3;
        else if (room.multiplier === 1 && score >= 11.0) bid = 3;
        else bid = 0;
      }

      landlordBid(room, p.id, bid);
    }
  }

  function landlordRevealScore(lord) {
    if (!lord || !Array.isArray(lord.hand)) return { bombs: 0, rocket: false, singles: 0, estimatedTurns: 99, orderly: 0 };
    const groups = {}; lord.hand.forEach((c) => { groups[c.rank] = (groups[c.rank] || 0) + 1; });
    const ranks = Object.keys(groups).map((r) => landlordRank({ rank: r })).sort((a, b) => a - b);
    const bombs = Object.keys(groups).filter((r) => groups[r] >= 4 && landlordRank({ rank: r }) < 16).length;
    const rocket = groups['小王'] && groups['大王'];
    let singles = 0; Object.keys(groups).forEach((r) => { if (groups[r] === 1) singles += 1; });
    let runs = 0;
    for (let i = 0; i < ranks.length;) {
      let j = i;
      while (j + 1 < ranks.length && ranks[j + 1] === ranks[j] + 1 && ranks[j + 1] <= 14) j++;
      if (j - i + 1 >= 5) runs += 1;
      i = j + 1;
    }
    const estimatedTurns = bombs + (rocket ? 1 : 0) + Math.ceil(Math.max(0, lord.hand.length - bombs * 4 - (rocket ? 2 : 0)) / 4);
    const orderly = (runs ? 2 : 0) + (singles <= 2 ? 2 : 0) + (Object.keys(groups).filter((r) => groups[r] >= 2).length >= 3 ? 1 : 0);
    return { bombs, rocket: !!rocket, singles, estimatedTurns, orderly };
  }

  function landlordShouldBotReveal(lord, room) {
    if (!lord || !Array.isArray(lord.hand)) return false;
    const analysis = landlordAnalyzeHand(lord.hand, room.doubleDeck);
    const level = clamp(int(lord.botLevel, 2), 1, 4);
    const overwhelming = (analysis.bombs >= 2 || (analysis.rocket && analysis.bombs >= 1)) && analysis.controls >= 3;
    const directWin = analysis.steps <= 3 && analysis.controls >= 2;
    if (!(overwhelming || directWin)) return false;
    const chance = level >= 4 ? 0.85 : level >= 3 ? 0.60 : level >= 2 ? 0.30 : 0.10;
    return Math.random() < chance;
  }

  function landlordContinueAfterReveal(room, open, id) {
    if (room.status !== 'landlordReveal') return '当前没有明牌选择。';
    const lord = room.players[room.landlordIndex];
    if (!lord || lord.id !== id) return '只有地主可以选择是否明牌。';
    if (room.doubleDeck && !room.headLuo) return '四人局只有触发头撂后才能选择摊打。';
    room.openLandlord = !!open;
    if (open) room.multiplier *= 2;
    room.status = 'playing'; room.current = room.landlordIndex;
    room.players.forEach((x, i) => { x.isTurn = i === room.current; });
    room.logs.push(`${lord.name}${open ? (room.doubleDeck ? '选择摊打，倍率翻倍，手牌已公开。' : '选择明牌，倍率翻倍，手牌已公开。') : (room.doubleDeck ? '选择不摊打。' : '选择不明牌。')}`);
    landlordRunBots(room);
    return '';
  }

  function landlordBotReveal(room) {
    if (room.status !== 'landlordReveal') return;
    const lord = room.players[room.landlordIndex];
    if (!lord || !lord.isBot) return;
    if (room.doubleDeck && Array.isArray(room.reportGroups) && room.reportGroups.length && !room.reportActive) {
      landlordReportStart(room);
      return;
    }
    if (room.doubleDeck && !room.headLuo) {
      room.status = 'playing'; room.current = room.landlordIndex;
      room.players.forEach((x, i) => { x.isTurn = i === room.current; });
      landlordRunBots(room);
      return;
    }
    const open = landlordShouldBotReveal(lord, room);
    landlordContinueAfterReveal(room, open, lord.id);
  }

  function landlordReportGroups(lord) {
    const groups = {}; (lord && lord.hand || []).forEach((c) => { groups[c.rank] = (groups[c.rank] || 0) + 1; });
    return Object.keys(groups).filter((rank) => groups[rank] >= 7 || ((rank === '小王' || rank === '大王') && groups[rank] >= 2)).map((rank) => ({ rank, count: groups[rank] }));
  }
  function landlordReportStart(room) {
    const lord = room.players[room.landlordIndex];
    room.reportGroups = room.doubleDeck ? landlordReportGroups(lord) : [];
    room.reportCount = room.reportGroups.length;
    if (room.doubleDeck && room.reportCount > 0) {
      room.status = 'reportChoice'; room.current = room.landlordIndex;
      room.logs.push(`${lord.name}拥有${room.reportCount}组可报到牌（报到牌只能整组作为炸弹打出），请发送“报到”或“不报到”。`);
      landlordBotReport(room);
      return;
    }
    if (room.headLuo) {
      room.status = 'landlordReveal'; landlordBotReveal(room);
    } else {
      room.status = 'playing'; room.current = room.landlordIndex;
      room.players.forEach((x, i) => { x.isTurn = i === room.current; });
      landlordRunBots(room);
    }
  }

  function landlordBotReport(room) {
    if (room.status !== 'reportChoice') return;
    const lord = room.players[room.landlordIndex];
    if (!lord || !lord.isBot) return;
    const strong = room.reportCount >= 2 || (room.reportGroups.some((g) => g.rank === '小王') && room.reportGroups.some((g) => g.rank === '大王'));
    const chooseReport = strong && int(lord.botLevel, 2) >= 3;
    landlordReportDecision(room, chooseReport, lord.id, chooseReport ? 'play' : 'pass');
    if (chooseReport && room.status === 'reportPlayChoice') landlordReportDecision(room, true, lord.id, 'play');
  }

  function landlordReportDecision(room, open, id, mode) {
    if (room.status !== 'reportChoice' && room.status !== 'reportPlayChoice') return '当前没有报到流程。';
    const lord = room.players[room.landlordIndex];
    if (!lord || lord.id !== id) return '只有地主可以进行报到选择。';
    if (room.status === 'reportChoice') {
      if (mode === 'pass') {
        room.reportAutoWin = true; room.logs.push(`${lord.name}选择不报到，本轮按正常流程进行。`);
        room.status = room.headLuo ? 'landlordReveal' : 'playing';
        if (room.status === 'landlordReveal') landlordBotReveal(room);
        else {
          room.current = room.landlordIndex;
          room.players.forEach((x, i) => { x.isTurn = i === room.current; });
          landlordRunBots(room);
        }
        return '';
      }
      room.logs.push(`${lord.name}选择报到${room.reportCount}组牌，请继续选择“报到打”或“报到不打”。`);
      room.status = 'reportPlayChoice';
      return '';
    }
    if (room.status === 'reportPlayChoice' && mode === 'pass') {
      room.reportAutoWin = true; room.reportNoLoss = false;
      room.logs.push(`${lord.name}选择报到但不打，本轮按地主胜利结算。`);
      landlordSettle(room, lord);
      return '';
    }
    const play = mode === 'play';
    room.reportActive = play; room.reportAutoWin = !play; room.reportNoLoss = play;
    if (!play) {
      room.logs.push(`${lord.name}选择报到但不打，本轮按地主胜利结算（报到${room.reportCount}组）。`);
      landlordSettle(room, lord);
      return '';
    }
    room.multiplier *= 2;
    room.logs.push(`${lord.name}选择打报到牌，倍率翻倍；报到牌必须整组作为炸弹打出。`);
    if (room.headLuo) landlordBotReveal(room);
    else {
      room.status = 'playing'; room.current = room.landlordIndex;
      room.players.forEach((x, i) => { x.isTurn = i === room.current; });
      landlordRunBots(room);
    }
    return '';
  }

  function landlordBid(room, id, bid) {
    if (room.status !== 'bidding') return '当前不是叫地主阶段。';
    const p = room.players[room.current];
    if (!p || p.id !== id) return '还没轮到你叫地主。';
    if (p.bidDone) return '你已经完成叫牌。';
    const value = clamp(int(bid, 0), 0, 3);
    p.bid = value; p.passed = value === 0; p.bidDone = true;
    room.bidCount = int(room.bidCount, 0) + 1;
    room.logs.push(`${p.name}${value ? `叫${value}倍` : '不叫'}。`);
    if (value > room.multiplier) room.multiplier = value;
    if (value === 3 || room.bidCount >= room.players.length) {
      const top = Math.max.apply(null, room.players.map((y) => y.bid));
      if (top <= 0) {
        room.logs.push('所有玩家都不叫，本局重新洗牌。');
        landlordDeal(room);
        landlordBotBid(room);
        return '';
      }
      room.landlordIndex = room.players.findIndex((x) => x.bid === top);
      if (room.landlordIndex < 0) room.landlordIndex = room.current;
      const lord = room.players[room.landlordIndex];
      lord.role = 'landlord';
      lord.hand = landlordSort(lord.hand.concat(room.bottom));
      room.players.forEach((x, i) => { if (i !== room.landlordIndex) x.role = 'farmer'; });
      room.headLuo = !!(room.doubleDeck && value === 3 && room.revealCard && room.revealPlayerIndex === room.landlordIndex);
      if (room.doubleDeck && room.revealCard && (room.revealCard.rank === '大王' || room.revealCard.rank === '小王')) room.multiplier *= 2;
      room.status = 'landlordReveal';
      room.current = room.landlordIndex;
      room.currentPlay = []; room.currentPlayOwnerIndex = -1;
      room.currentType = ''; room.currentTypeData = null; room.passCount = 0;
      room.logs.push(`${lord.name}成为地主，底牌已加入手牌；${room.headLuo ? '触发头撂，' : ''}请发送“明牌${room.headLuo ? '（摊打）' : ''}”或“不明牌”。`);
      room.players.forEach((x, i) => { x.isTurn = i === room.current; });
      if (!room.headLuo && room.doubleDeck && landlordReportGroups(lord).length) landlordReportStart(room);
      else landlordBotReveal(room);
      return '';
    }
    landlordNext(room);
    landlordBotBid(room);
    return '';
  }

  function landlordTypeName(type) { return ({ single: '单牌', pair: '对子', triple: '三不带', tripleSingle: '三带一', triplePair: '三带一对', straight: '顺子', pairStraight: '连对', airplane: '飞机', airplaneSingle: '飞机带单翅', airplanePair: '飞机带对翅', bomb: '炸弹', rocket: '王炸' })[type] || type; }

  function landlordBombLimit(player, room) {
    if (!room.doubleDeck || !player || player.role === 'landlord') return Infinity;
    if (player.bid == null || player.bid === '') return Infinity;
    return int(player.bid, 0) === 2 ? 2 : 1;
  }

  function landlordPlay(room, id, ranks) {
    if (room.status !== 'playing') return '当前不是出牌阶段。';
    const p = room.players[room.current];
    if (!p || p.id !== id) return `还没轮到你，当前是${p ? p.name : '未知玩家'}。`;
    
    // 不出 (PASS)
    if (!ranks || !ranks.length) {
      if (!room.currentPlay.length) return '首手不能不出。';
      room.passCount++;
      p.lastAction = '不出';
      room.displayPassed = true;
      room.logs.push(`${p.name}选择不出。`);
      if (room.passCount >= room.players.length - 1) {
        room.currentPlay = []; room.currentPlayOwnerIndex = -1;
        room.currentType = ''; room.currentTypeData = null; room.passCount = 0;
      }
      landlordNext(room);
      landlordRunBots(room);
      return '';
    }

    if (room.doubleDeck && p.role === 'farmer') {
      const previewCards = []; const usedIdx = [];
      ranks.forEach((rank) => {
        const idx = p.hand.findIndex((c, i) => c.rank === rank && usedIdx.indexOf(i) < 0);
        if (idx >= 0) { usedIdx.push(idx); previewCards.push(p.hand[idx]); }
      });
      if (previewCards.length === ranks.length) {
        const previewType = landlordType(previewCards, true);
        if (previewType.bomb || previewType.type === 'rocket') {
          const limit = landlordBombLimit(p, room);
          if (int(p.bombsPlayed, 0) >= limit) return `你叫${p.bid || 1}分，四人局本局最多打${limit}次炸弹。`;
        }
      }
    }

    const cards = landlordTakeCards(p, ranks);
    if (!cards) return '手牌中没有这组牌，请重新输入（10可写T，也可连续输入333）。';
    const type = landlordType(cards, room.doubleDeck);
    if (!landlordCanBeat(type, room.currentType ? Object.assign({ type: room.currentType, len: room.currentPlay.length }, room.currentTypeData || {}) : null)) {
      p.hand = landlordSort(p.hand.concat(cards));
      return room.doubleDeck ? '这组牌型不合法或压不过上一手。四人局不允许三带一、飞机带单翅或仅两对。' : '这组牌型不合法或压不过上一手。三人局允许三带一、三带一对与飞机；仅两对不能出。';
    }

    room.currentPlay = cards;
    room.currentPlayOwnerIndex = room.current;
    room.currentType = type.type;
    room.currentTypeData = type;
    room.passCount = 0;
    room.displayPlay = cards.slice();
    room.displayPlayerName = p.name;
    room.displayPassed = false;
    p.lastPlay = cards.slice();
    p.lastAction = `出${landlordTypeName(type.type)}`;
    p.played += cards.length;
    p.playActions = int(p.playActions, 0) + 1;
    room.logs.push(`${p.name}出${landlordTypeName(type.type)}：${cards.map(landlordCardText).join(' ')}。`);

    if (type.bomb || type.type === 'rocket') {
      if (!room.doubleDeck) room.multiplier *= 2;
      room.bombCount = int(room.bombCount, 0) + 1;
      p.bombsPlayed = int(p.bombsPlayed, 0) + 1;
    }

    if (!p.hand.length) {
      p.status = 'out';
      room.logs.push(`${p.name}出完手牌，本局结束。`);
      landlordSettle(room, p);
      return '';
    }

    landlordNext(room);
    landlordRunBots(room);
    return '';
  }

  // -------------------- 大师级 出牌与跟牌决策引擎 --------------------
  function landlordBotPick(p, room) {
    const hand = landlordSort(p.hand.slice());
    const prev = room.currentPlay.length ? room.currentTypeData : null;
    const level = clamp(int(p.botLevel, 2), 1, 4);
    const isLead = !prev;

    const lord = room.players[room.landlordIndex] || null;
    const isLord = p.role === 'landlord';
    const owner = room.currentPlayOwnerIndex >= 0 ? room.players[room.currentPlayOwnerIndex] : null;
    const isTeammatePlay = !!(!isLead && owner && owner.role === p.role && owner.id !== p.id);

    const landlordPlayer = isLord ? p : lord;
    const landlordCardsCount = landlordPlayer ? landlordPlayer.hand.length : 20;
    
    const teammates = room.players.filter((x) => x.role === p.role && x.id !== p.id);
    const minTeammateCards = teammates.length ? Math.min.apply(null, teammates.map((x) => x.hand.length)) : 99;
    const criticalTeammate = teammates.find((x) => x.hand.length === minTeammateCards);

    const upseatIndex = landlordPlayer ? (room.players.indexOf(landlordPlayer) - 1 + room.players.length) % room.players.length : -1;
    const isUpseatFarmer = !isLord && room.players.indexOf(p) === upseatIndex;

    const groups = {};
    hand.forEach((c) => {
      const r = c.rank;
      if (!groups[r]) groups[r] = [];
      groups[r].push(c);
    });

    const ordered = Object.keys(groups).map((rank) => ({
      rank,
      value: landlordRank(groups[rank][0]),
      cards: groups[rank]
    })).sort((a, b) => a.value - b.value);

    const candidates = [];

    // 单张、对子、三张、炸弹
    ordered.forEach((g) => {
      for (let n = 1; n <= g.cards.length; n++) {
        candidates.push(g.cards.slice(0, n));
      }
    });

    // 王炸 / 四王
    const jokers = hand.filter((card) => landlordRank(card) >= 16);
    if ((!room.doubleDeck && jokers.length >= 2 && jokers.some((c) => c.rank === '小王') && jokers.some((c) => c.rank === '大王')) ||
        (room.doubleDeck && jokers.length >= 4)) {
      candidates.push(jokers.slice(0, room.doubleDeck ? 4 : 2));
    }

    // 顺子、连对、飞机
    for (let start = 0; start < ordered.length; start++) {
      const singles = [];
      const pairs = [];
      const triples = [];
      for (let end = start; end < ordered.length && ordered[end].value <= 14 && (end === start || ordered[end].value === ordered[end - 1].value + 1); end++) {
        singles.push(ordered[end].cards[0]);
        if (ordered[end].cards.length >= 2) pairs.push(...ordered[end].cards.slice(0, 2)); else pairs.length = 0;
        if (ordered[end].cards.length >= 3) triples.push(...ordered[end].cards.slice(0, 3)); else triples.length = 0;

        if (singles.length >= 5) candidates.push(singles.slice());
        if (pairs.length >= 6) candidates.push(pairs.slice());
        if (triples.length >= 6) candidates.push(triples.slice());
      }
    }

    // 四人双副牌低位顺子
    if (room.doubleDeck) {
      const lowOrdered = ordered.filter((g) => g.value <= 15).map((g) => ({ cards: g.cards, value: g.value === 14 ? 1 : g.value === 15 ? 2 : g.value })).sort((a, b) => a.value - b.value);
      for (let start = 0; start < lowOrdered.length; start++) {
        const run = [];
        for (let end = start; end < lowOrdered.length && (end === start || lowOrdered[end].value === lowOrdered[end - 1].value + 1); end++) {
          run.push(lowOrdered[end].cards[0]);
          if (run.length >= 5 && (lowOrdered[start].value === 1 || lowOrdered[start].value === 2)) candidates.push(run.slice());
        }
      }
    }

    // 三带一 / 三带一对
    const tripleGroups = ordered.filter((g) => g.cards.length >= 3 && g.value <= 14);
    tripleGroups.forEach((g) => {
      if (!room.doubleDeck) {
        ordered.filter((x) => x.rank !== g.rank && x.cards.length < 4).forEach((wing) => {
          candidates.push(g.cards.slice(0, 3).concat([wing.cards[0]]));
        });
      }
      ordered.filter((x) => x.rank !== g.rank && x.cards.length >= 2 && x.cards.length < 4).forEach((wing) => {
        candidates.push(g.cards.slice(0, 3).concat(wing.cards.slice(0, 2)));
      });
    });

    // 飞机带翅膀
    for (let start = 0; start < tripleGroups.length; start++) {
      const chain = [];
      for (let end = start; end < tripleGroups.length && (end === start || tripleGroups[end].value === tripleGroups[end - 1].value + 1); end++) {
        chain.push(tripleGroups[end]);
        if (chain.length < 2) continue;
        const chainRanks = chain.map((g) => g.rank);
        const base = [];
        chain.forEach((g) => base.push(...g.cards.slice(0, 3)));

        const singleWings = ordered.filter((g) => chainRanks.indexOf(g.rank) < 0 && g.cards.length < 4).reduce((all, g) => all.concat(g.cards.slice(0, Math.min(g.cards.length, chain.length - all.length))), []);
        if (!room.doubleDeck && singleWings.length >= chain.length) candidates.push(base.concat(singleWings.slice(0, chain.length)));

        const pairWings = ordered.filter((g) => chainRanks.indexOf(g.rank) < 0 && g.cards.length >= 2 && g.cards.length < 4).slice(0, chain.length);
        if (pairWings.length >= chain.length) candidates.push(base.concat(...pairWings.map((g) => g.cards.slice(0, 2))));
      }
    }

    // 筛选合法出牌组合
    const legal = candidates.filter((cards) => {
      const t = landlordType(cards, room.doubleDeck);
      return t.type !== 'invalid' && landlordCanBeat(t, prev);
    });

    if (!legal.length) return null;

    // ---------------------- 队友出牌策略（顺牌 vs 让牌） ----------------------
    if (isTeammatePlay && !isLead) {
      const winMove = legal.find((cards) => cards.length === hand.length);
      if (winMove) return winMove;

      const isTeammateControl = (prev.rank >= 15) || (prev.type === 'single' && prev.rank >= 14) || (prev.bomb || prev.type === 'rocket');
      const isTeammateUrgent = criticalTeammate && criticalTeammate.hand.length <= 2;
      if (isTeammateControl || isTeammateUrgent) {
        return null;
      }

      const safeFollows = legal.filter((cards) => {
        const t = landlordType(cards, room.doubleDeck);
        if (t.bomb || t.type === 'rocket') return false; // 绝不炸队友
        if (t.rank >= 15) return false; // 绝不拿 2 或王打队友
        
        // 避免拆自己的炸弹或三张
        const remain = hand.filter((c) => cards.indexOf(c) < 0);
        const curBombs = landlordAnalyzeHand(hand, room.doubleDeck).bombs;
        const newBombs = landlordAnalyzeHand(remain, room.doubleDeck).bombs;
        if (newBombs < curBombs) return false;
        return true;
      });

      if (!safeFollows.length) return null;

      safeFollows.sort((a, b) => {
        const ta = landlordType(a, room.doubleDeck);
        const tb = landlordType(b, room.doubleDeck);
        return ta.rank - tb.rank;
      });

      const bestSafe = safeFollows[0];
      const tBest = landlordType(bestSafe, room.doubleDeck);

      if (tBest.rank <= 14) return bestSafe;
      return null;
    }

    // ---------------------- 主动出牌与敌方跟牌综合评分 ----------------------
    const evaluateMove = (cards) => {
      const t = landlordType(cards, room.doubleDeck);
      const remain = hand.filter((c) => cards.indexOf(c) < 0);
      const isDirectFinish = remain.length === 0;

      if (isDirectFinish) return -99999;

      const newAnalysis = landlordAnalyzeHand(remain, room.doubleDeck);
      const curAnalysis = landlordAnalyzeHand(hand, room.doubleDeck);

      let penalty = 0;
      penalty += newAnalysis.steps * 20;

      // 严惩拆炸弹（炸弹必须整组保留）
      if (newAnalysis.bombs < curAnalysis.bombs && !t.bomb && t.type !== 'rocket') penalty += 600;
      if (curAnalysis.rocket && !newAnalysis.rocket && t.type !== 'rocket') penalty += 800;

      // 严惩把三张拆成单张出（如把 KKK 拆成三个单张 K）
      const playedRank = t.rank;
      const originalCountOfRank = groups[LANDLORD_RANKS[playedRank - 3] || ''] ? groups[LANDLORD_RANKS[playedRank - 3]].length : 0;
      if (t.type === 'single' && originalCountOfRank === 3 && isLead) {
        penalty += 450; // 严禁主动拆三条当单张
      }
      if (t.type === 'pair' && originalCountOfRank === 3 && isLead) {
        penalty += 200; // 尽量不把三条拆成对子
      }

      // 炸弹使用纪律（大幅提高非关键时刻的惩罚，禁止乱丢炸弹）
      if (t.bomb || t.type === 'rocket') {
        const isEnemyUrgent = !isLord && landlordCardsCount <= 2;
        const isLordFighting = isLord && (minTeammateCards <= 2);
        if (isDirectFinish) {
          penalty -= 5000;
        } else if (isEnemyUrgent || isLordFighting) {
          penalty -= 1000; // 敌方仅剩1~2张牌时必炸拦截
        } else if (prev && prev.rank >= 16) {
          penalty -= 200; // 压制大王
        } else {
          penalty += 600; // 平常绝不乱丢炸弹
        }
      }

      // 主动领牌策略
      if (isLead) {
        // 队友报单 -> 喂最小单牌
        if (!isLord && criticalTeammate && criticalTeammate.hand.length === 1) {
          if (t.type === 'single' && t.rank <= 9) return -8000 + t.rank;
        }
        // 队友报双 -> 喂最小对子
        if (!isLord && criticalTeammate && criticalTeammate.hand.length === 2) {
          if (t.type === 'pair' && t.rank <= 9) return -7000 + t.rank;
        }

        // 地主报单 -> 严禁出小单牌
        if (!isLord && landlordCardsCount === 1) {
          if (t.type === 'single') {
            if (t.rank <= 13) penalty += 5000; // 严禁出 A 及以下单张送地主
            else penalty -= 1500; // 拿大王/2 直接封死
          } else {
            penalty -= 800; // 优先打对子、顺子等套牌
          }
        }

        // 地主报双 -> 避免出小对子
        if (!isLord && landlordCardsCount === 2) {
          if (t.type === 'pair' && t.rank <= 10) penalty += 3500;
          else if (t.type === 'single') penalty -= 300;
        }

        // 优先出成型的大牌套（飞机、顺子、连对、三带）
        if (t.type === 'airplane' || t.type === 'pairStraight' || t.type === 'straight') penalty -= 300;
        if (t.type === 'triplePair' || t.type === 'tripleSingle') penalty -= 180;
        if (t.type === 'pair' && t.rank <= 10) penalty -= 60; // 优先打小对子

        // 如果要打单牌，必须优先打手中最小的散单牌（3~8），严禁主动单出大牌（K、A、2、王）
        if (t.type === 'single') {
          if (t.rank <= 8) {
            penalty -= 100; // 优先溜最小单张
          } else if (t.rank >= 13 && remain.length > 2) {
            penalty += 350; // 严禁把大单张（K/A/2/王）主动白白送掉
          }
        }

        // 地主上家（顶牌位）领牌：如果出单牌可尝试顶 10~J 挑战地主，但绝不拆成型牌
        if (isUpseatFarmer && t.type === 'single' && t.rank >= 10 && t.rank <= 13 && originalCountOfRank === 1) {
          penalty -= 80;
        }
      }

      // 跟敌方的牌
      if (!isLead && !isTeammatePlay) {
        // 地主上家顶单张
        if (isUpseatFarmer && prev && prev.type === 'single') {
          if (t.rank >= 10 && t.rank <= 15) penalty -= 120;
        }

        // 地主报单跟单张 -> 拿最大的牌封死
        if (!isLord && landlordCardsCount === 1 && prev && prev.type === 'single') {
          if (t.rank >= 14) penalty -= 500;
        }

        // 尽量用最小能压过的牌
        penalty += (t.rank - prev.rank) * 1.5;
      }

      return penalty;
    };

    legal.sort((a, b) => evaluateMove(a) - evaluateMove(b));

    if (level === 1 && legal.length > 2 && Math.random() < 0.2) {
      return legal[Math.floor(Math.random() * Math.min(legal.length, 3))];
    }

    return legal[0];
  }

  // -------------------- 具备防卡死（Fail-Safe）的 Bot 行动循环 --------------------
  function landlordRunBots(room) {
    let guard = 0;
    while (room.status === 'playing' && room.players[room.current] && room.players[room.current].isBot && guard++ < 80) {
      const p = room.players[room.current];
      if (!p || !p.hand || !p.hand.length) break;

      const pick = landlordBotPick(p, room);
      let res = '';
      
      if (!pick && room.currentPlay.length) {
        res = landlordPlay(room, p.id, []);
      } else if (!pick) {
        const first = landlordSort(p.hand.slice())[0];
        if (!first) break;
        res = landlordPlay(room, p.id, [first.rank]);
      } else {
        res = landlordPlay(room, p.id, pick.map((c) => c.rank));
      }

      // 核心熔断保护
      if (res) {
        if (room.currentPlay && room.currentPlay.length) {
          landlordPlay(room, p.id, []);
        } else {
          const first = landlordSort(p.hand.slice())[0];
          if (first) {
            landlordPlay(room, p.id, [first.rank]);
          } else {
            landlordNext(room);
          }
        }
      }
    }
  }

  // -------------------- 结算与锦标赛实时榜单追踪 --------------------
  function landlordSettle(room, winner) {
    if (room.settled && room.status === 'finished') return;
    const factor = Math.max(1, room.multiplier || 1);
    room.roundHistory = Array.isArray(room.roundHistory) ? room.roundHistory : [];
    const landlord = room.players.find((p) => p.role === 'landlord');
    const farmers = room.players.filter((p) => p.role === 'farmer');
    const spring = landlord && winner.id === landlord.id && farmers.every((p) => int(p.playActions, 0) === 0);
    const antiSpring = landlord && winner.id !== landlord.id && int(landlord.playActions, 0) === 1;
    const roundFactor = factor * ((spring || antiSpring) ? 2 : 1);
    const landlordWon = landlord && winner.id === landlord.id;

    room.players.forEach((player) => {
      const sideWon = landlordWon ? player.role === 'landlord' : player.role === 'farmer';
      if (sideWon) {
        player.roundWins = int(player.roundWins, 0) + 1;
        player.matchPoints = int(player.matchPoints, 0) + (player.role === 'landlord' ? 2 : 1) * roundFactor;
      } else {
        player.matchPoints = int(player.matchPoints, 0) - (player.role === 'landlord' ? 2 : 1) * roundFactor;
      }
    });

    room.roundHistory.push({ winner: winner.id, multiplier: roundFactor, spring: !!(spring || antiSpring), bombs: int(room.bombCount, 0) });
    room.logs.push(`${winner.name}赢下第${room.round}局${spring || antiSpring ? '，触发春天翻倍' : ''}。`);

    // 锦标赛后台分桌积分同步演进与实时名次刷新
    if (room.mode === 'tournament' && Array.isArray(room.tournamentEntrants)) {
      room.players.forEach((p) => {
        const ent = room.tournamentEntrants.find((e) => e.id === p.id);
        if (ent) {
          ent.score = p.matchPoints;
          ent.wins = p.roundWins;
        }
      });

      room.tournamentEntrants.forEach((ent) => {
        const isAtTable = room.players.some((p) => p.id === ent.id);
        if (!isAtTable) {
          const isWinner = Math.random() < (room.doubleDeck ? 0.25 : 0.33);
          const simMultiplier = Math.floor(Math.random() * 3 + 1) * (Math.random() < 0.2 ? 2 : 1);
          const simDelta = isWinner ? (simMultiplier * (room.doubleDeck ? 2 : 2) * 10) : -(simMultiplier * 10);
          ent.score = int(ent.score, 0) + simDelta;
          if (isWinner) ent.wins = int(ent.wins, 0) + 1;
        }
      });

      room.tournamentEntrants.sort((a, b) => int(b.score, 0) - int(a.score, 0) || int(b.wins, 0) - int(a.wins, 0));
      const human = room.players.find((p) => !p.isBot);
      const humanLiveRank = human ? room.tournamentEntrants.findIndex((e) => e.id === human.id) + 1 : 1;
      room.logs.push(`📊 锦标赛实时战报：${human ? human.name : '你'} 暂列全场【第 ${humanLiveRank}/${room.tournamentEntrants.length} 名】（积分：${human ? human.matchPoints : 0} · 胜场：${human ? human.roundWins : 0}）。`);
    }

    if (room.round < Math.max(1, int(room.maxRounds, 1))) {
      room.round += 1; room.settled = false; room.status = 'bidding';
      room.currentPlay = []; room.currentPlayOwnerIndex = -1;
      room.currentType = ''; room.currentTypeData = null; room.passCount = 0;
      landlordDeal(room); landlordBotBid(room); landlordRunBots(room);
      return;
    }

    // 12副牌打满，终局结算
    room.settled = true; room.status = 'finished';
    const ranking = room.players.slice().sort((a, b) => int(b.matchPoints, 0) - int(a.matchPoints, 0) || int(b.roundWins, 0) - int(a.roundWins, 0));
    const champion = ranking[0] || winner;
    const totalFactor = Math.max.apply(null, room.roundHistory.map((r) => r.multiplier).concat([1]));
    const isTournament = room.mode === 'tournament';
    const base = room.entry || 50;

    if (isTournament && Array.isArray(room.tournamentEntrants)) {
      const human = room.players.find((p) => !p.isBot);
      if (human) {
        const hEnt = room.tournamentEntrants.find((e) => e.id === human.id);
        if (hEnt) { hEnt.score = human.matchPoints; hEnt.wins = human.roundWins; }
      }
      room.tournamentEntrants.sort((a, b) => int(b.score, 0) - int(a.score, 0) || int(b.wins, 0) - int(a.wins, 0));
      const humanRank = human ? room.tournamentEntrants.findIndex((e) => e.id === human.id) + 1 : 99;
      const prize = humanRank === 1 ? 1000 : humanRank === 2 ? 750 : humanRank === 3 ? 500 : 0;
      const affDelta = humanRank === 1 ? seal.ext.getIntConfig(ext, '对决胜利好感') * 4 : humanRank === 2 ? seal.ext.getIntConfig(ext, '对决胜利好感') * 2 : humanRank === 3 ? seal.ext.getIntConfig(ext, '对决胜利好感') : seal.ext.getIntConfig(ext, '对决失败好感');

      if (human && isSettlementEligible(human)) {
        const p = loadProfile(human.id, human.name);
        if (prize) p.coins += prize;
        changeAffection(p, affDelta);
        const stats = p.stats.landlord || emptyGameStats();
        stats.landlordTournamentRank = humanRank;
        if (humanRank === 1) stats.landlordTournamentWins += 1;
        stats.landlordMaxMultiplier = Math.max(int(stats.landlordMaxMultiplier, 0), totalFactor);
        stats.landlordRounds += room.round;
        stats.landlordBombs += room.roundHistory.reduce((sum, r) => sum + int(r.bombs, 0), 0);
        stats.landlordSprings += room.roundHistory.filter((r) => r.spring).length;
        p.stats.landlord = stats;
        recordGame(p, 'landlord', humanRank <= 3 ? 'win' : 'loss', human.matchPoints, prize - 500, { affectionDelta: affDelta });
        human.coinReward = prize; human.affectionDelta = affDelta;
      }

      room.tournamentResult = { rank: humanRank, prize, score: human ? human.matchPoints : 0, fieldSize: room.tournamentEntrants.length };
      room.logs.push(`🏆 锦标赛12局全部完赛！${human ? human.name : '你'} 在全场${room.tournamentEntrants.length}名选手中斩获【第${humanRank}名】（终局积分：${human ? human.matchPoints : 0}），${prize ? `荣获奖金 ${prize} 游戏币，好感 ${signedValue(affDelta)}` : '未能进入前三强'}。`);
      return;
    }

    const longMode = int(room.maxRounds, 1) > 1;
    room.players.forEach((pl) => {
      if (!isSettlementEligible(pl)) return;
      const p = loadProfile(pl.id, pl.name); const isWin = pl.id === champion.id;
      let coin = 0;
      if (longMode) coin = isWin ? base * 2 : (room.doubleDeck && ranking.findIndex((ranked) => ranked.id === pl.id) === 1 ? base : 0);
      else {
        const roleAmount = pl.role === 'landlord' ? base * 2 * totalFactor : base * totalFactor;
        coin = isWin ? roleAmount : -roleAmount;
      }
      const protectedSecond = longMode && room.doubleDeck && ranking.findIndex((ranked) => ranked.id === pl.id) === 1;
      const delta = isWin ? seal.ext.getIntConfig(ext, '对决胜利好感') : protectedSecond ? 0 : seal.ext.getIntConfig(ext, '对决失败好感');
      p.coins += coin; changeAffection(p, delta);
      const stats = p.stats.landlord || emptyGameStats();
      stats.landlordMaxMultiplier = Math.max(int(stats.landlordMaxMultiplier, 0), totalFactor);
      stats.landlordRounds += room.round;
      stats.landlordBombs += room.roundHistory.reduce((sum, r) => sum + int(r.bombs, 0), 0);
      stats.landlordSprings += room.roundHistory.filter((r) => r.spring).length;
      p.stats.landlord = stats;
      recordGame(p, 'landlord', isWin ? 'win' : 'loss', pl.played, coin, { affectionDelta: delta });
      pl.coinReward = coin; pl.affectionDelta = delta;
    });
    room.logs.push(`${champion.name}获得最终胜利，${room.round}局累计最高倍率${totalFactor}，已完成结算。`);
  }

  function landlordView(room, viewerId, privateHand, quote) {
    landlordEnsure(room);
    const isTournament = room.mode === 'tournament';
    const status = room.status === 'waiting' ? '等待入座' : room.status === 'bidding' ? '叫地主' : room.status === 'landlordReveal' ? '明牌选择' : room.status === 'playing' ? '出牌中' : '比赛结算';
    const revealVisible = room.status !== 'waiting' && room.status !== 'bidding';
    const displayCards = room.displayPlay && room.displayPlay.length ? room.displayPlay : room.currentPlay;
    const bottomText = revealVisible ? (room.bottom && room.bottom.length ? room.bottom.map(landlordCardText).join(' ') : '—') : '地主确定后公开';
    
    let subTitlePrefix = isTournament ? `🏆 12副牌锦标赛 · 入场500` : `${room.doubleDeck ? '四人双副牌' : '三人单副牌'} · 入场${room.entry || 50}`;
    const lines = [
      `第${room.round || 1}/${room.maxRounds}局 · ${status} · ${room.players.length}人 · 倍率${room.multiplier || 1}`,
      `亮牌：${room.revealCard ? `${room.revealPlayerName} · ${landlordCardText(room.revealCard)}（首位叫地主）` : '—'}`,
      `底牌：${bottomText}`,
      `当前：${room.players[room.current] ? room.players[room.current].name : '—'} · 桌面：${displayCards && displayCards.length ? `${room.displayPlayerName || '玩家'}：${displayCards.map(landlordCardText).join(' ')}${room.displayPassed ? ' · 后续玩家不出' : ''}` : '空'}`
    ];

    if (isTournament && Array.isArray(room.tournamentEntrants)) {
      const human = room.players.find((p) => !p.isBot);
      const curScore = human ? human.matchPoints : 0;
      const sorted = room.tournamentEntrants.slice().sort((a, b) => int(b.score, 0) - int(a.score, 0) || int(b.wins, 0) - int(a.wins, 0));
      const liveRank = human ? sorted.findIndex((e) => e.id === human.id) + 1 : 1;
      lines.push(`🏆 锦标赛实时排名：第【 ${liveRank} / ${sorted.length} 】名（积分：${curScore} · 胜局：${human ? human.roundWins : 0}）`);
      const top3Str = sorted.slice(0, 3).map((e, idx) => `#${idx + 1} ${e.name} (${e.score}分)`).join('  ');
      lines.push(`🏅 榜首梯队：${top3Str}`);
    }

    room.players.forEach((p) => {
      const isOpenLandlord = room.openLandlord && p.id === (room.players[room.landlordIndex] && room.players[room.landlordIndex].id);
      const show = (privateHand && p.id === viewerId) || room.status === 'finished' || isOpenLandlord;
      lines.push(`${p.name} · ${p.role}${isOpenLandlord ? ' · 明牌' : ''} · ${p.hand.length}张${show ? ` · ${p.hand.map(landlordCardText).join(' ')}` : ''}`);
    });

    (room.logs || []).slice(-5).forEach((x) => lines.push(`· ${x}`));
    if (room.status === 'finished') lines.push('下一步：发送“.斗地主 再来一局”或发起新牌桌。');
    else if (room.players[room.current] && room.players[room.current].isBot) lines.push('提示：如遇到网络异常可发送“.斗地主 推进”促使Bot出牌。');

    const multiplierText = room.doubleDeck ? '普通炸弹不翻倍 · 规则倍率翻倍' : '叫分、炸弹与春天翻倍';
    return {
      kind: 'landlord', title: isTournament ? '斗地主 · 12副牌锦标赛' : '斗地主 · 经典牌桌',
      subtitle: `${subTitlePrefix} · ${multiplierText}`,
      privateView: !!privateHand,
      privateHandCommand: landlordHandCommand(room, viewerId),
      landlordTable: {
        status: room.status, mode: room.mode, round: room.round, maxRounds: room.maxRounds,
        multiplier: room.multiplier, current: room.current, openLandlord: !!room.openLandlord,
        revealPlayerName: room.revealPlayerName || '',
        revealPlayerIndex: room.revealPlayerIndex == null ? -1 : room.revealPlayerIndex,
        revealCard: room.revealCard ? { rank: room.revealCard.rank, suit: room.revealCard.suit } : null,
        bottom: revealVisible ? (room.bottom || []).map((c) => ({ rank: c.rank, suit: c.suit })) : [],
        displayPlayerName: room.displayPlayerName || '', displayPassed: !!room.displayPassed,
        currentPlay: (displayCards || []).map((c) => ({ rank: c.rank, suit: c.suit })),
        players: room.players.map((p) => ({
          name: p.name, role: p.role, handCount: p.hand.length, isBot: p.isBot, botLevel: p.botLevel || 0,
          isTurn: p.isTurn, lastAction: p.lastAction || '',
          hand: (privateHand && p.id === viewerId) || room.status === 'finished' || (room.openLandlord && p.id === (room.players[room.landlordIndex] && room.players[room.landlordIndex].id)) ? p.hand.map((c) => ({ rank: c.rank, suit: c.suit })) : []
        })),
        logs: (room.logs || []).slice(-6)
      },
      lines, quote: quote || ''
    };
  }

  function landlordMenuView(quote) {
    return {
      kind: 'landlord', title: '斗地主 · 牌桌大厅', subtitle: '三人经典 / 四人双副 · 单局、多局与12副牌锦标赛',
      landlordTable: { status: 'menu', mode: 'menu', round: 1, maxRounds: 1, multiplier: 1, current: 0, currentPlay: [], players: [], logs: [] },
      lines: [
        '三人桌：经典单副牌，支持三带一、三带一对、飞机及两种翅膀。',
        '四人桌：两副牌；禁止三带一和飞机带单翅，允许A2345、23456。',
        '锦标赛：.斗地主 锦标赛（500币实战打满12副牌，与全场选手角逐总排名）。',
        '快捷出牌：.斗地主 出牌 333、TTT9、34567；10与T均可识别。',
        '解卡辅助：若有异常卡住可发送“.斗地主 推进”或“.斗地主 清理”。'
      ],
      quote: quote || '请选择PvE、PvP时长或锦标赛；大厅按钮与牌局操作按钮已分开。'
    };
  }

  function landlordTutorialView() {
    return {
      kind: 'landlord', title: '斗地主 · 图片教程', subtitle: '三人经典与四人双副的牌型差异',
      tutorial: {
        layout: 'cards', page: 1, total: 1,
        entries: [
          { title: '三人牌型', description: '允许三不带、三带一、三带一对、飞机、飞机带单张或对子翅膀；两对不能直接打出，连对至少三对。', tag: '三人' },
          { title: '四人牌型', description: '允许三不带和三带一对；禁止三带一与飞机带单张翅膀，飞机可以不带或带对子翅膀。', tag: '四人' },
          { title: '顺子', description: '所有顺子至少5张。三人局为3至A；四人双副局额外允许A2345和23456，其他含2或王的顺子非法。', tag: '顺子' },
          { title: '锦标赛', description: '入场500游戏币，实战打满12副牌，实时追踪全场排名，冠军1000、亚军750、季军500。', tag: '赛事' },
          { title: '解卡与清理', description: '如遇到异常可随时发送“.斗地主 推进”强制驱动Bot，或发送“.斗地主 清理”重置房间。', tag: '辅助' }
        ]
      },
      quote: '桌面持续显示最近一手牌及出牌者，直到被新的出牌覆盖。'
    };
  }
  function tutorialPage(value, total) { return clamp(int(value, 1), 1, total); }
  function pokerTutorialView(pageValue) {
    const pages = [
      [
        ['入场与筹码', '付费玩家整场只支付一次150游戏币，并带着150桌面筹码开始淘汰赛。', '准备'],
        ['游客席位', '多人房余额不足仍可完整参赛，但不结算奖励、好感、战绩或最大牌型。', '多人'],
        ['盲注', '庄家位依规则确定小盲25与大盲50；盲注会直接进入底池。', '下注'],
        ['行动顺序', '轮到你时选择过牌、跟注、加注、全押或弃牌；当前行动座位会发光。', '行动'],
        ['公共牌', '翻牌发3张，转牌和河牌各发1张；中央始终保留5个公共牌位。', '牌面'],
        ['下注轮', '所有仍可行动者都完成操作且注额相等后，牌桌进入下一阶段。', '流程'],
        ['单手结束', '底池结算后保留每人的剩余筹码；无人归零也不会结算整场。', '续局'],
        ['淘汰与排名', '筹码归零才退场，按淘汰先后倒序排名；最后仍有筹码者获得冠军。', '结算']
      ],
      [
        ['同花顺', '五张同花色连续牌，牌型最高。', '牌型 9'], ['四条', '四张同点数牌。', '牌型 8'],
        ['葫芦', '一组三条加一组对子。', '牌型 7'], ['同花', '五张同花色但不连续。', '牌型 6'],
        ['顺子', '五张点数连续但花色不同。', '牌型 5'], ['三条', '三张同点数牌。', '牌型 4'],
        ['两对', '两组不同点数的对子。', '牌型 3'], ['一对', '两张同点数牌。', '牌型 2'],
        ['高牌', '没有组成以上牌型时比较最高牌，再逐张比较。', '牌型 1'],
        ['常用指令', '.德州 过牌/跟注/加注/全押/弃牌；单手结束后发送“.德州 下一手”。', '指令']
      ]
    ];
    const page = tutorialPage(pageValue, pages.length);
    const entries = pages[page - 1].map((item) => ({ title: item[0], description: item[1], tag: item[2] }));
    return {
      kind: 'poker', title: '德州扑克 · 完整教程', subtitle: `第 ${page}/${pages.length} 页 · 发送“.yan 德州 教程 ${page === pages.length ? 1 : page + 1}”继续`,
      tutorial: { page, total: pages.length, entries }, lines: entries.map((item) => `${item.title}：${item.description}`),
       quote: page === 1 ? '150筹码是整场容错率；下一手不会再次扣费。' : '牌型从上到下依次降低；同牌型继续比较关键点数。'
    };
  }

  // -------------------- 生化危机7二十一点 --------------------
  const TRUMPS = {
    '退回': ['instant', '将自己上一张面朝上的牌退回牌组'],
    '撤除': ['instant', '将对手上一张面朝上的牌退回牌组'],
    '交换': ['instant', '交换双方上一张面朝上的牌'],
    '护盾': ['continuous', '自己的赌注减少1'],
    '护盾+': ['continuous', '自己的赌注减少2'],
    '破坏': ['instant', '撤除对手上一张场上王牌'],
    '破坏+': ['instant', '撤除对手所有场上王牌'],
    '破坏++': ['continuous', '清除对手场上王牌并禁止对手使用王牌'],
    '欲望': ['continuous', '对手手中一半王牌加入其赌注'],
    '欲望+': ['continuous', '对手全部手牌王牌加入其赌注'],
    '幸福': ['instant', '双方各抽一张王牌'],
    '诅咒': ['instant', '随机放弃一张王牌并迫使对手抽最大数字牌'],
    '魔抽': ['continuous', '抽三张王牌，自己的赌注增加1'],
    '死寂': ['continuous', '对手无法以任何方式抽数字牌'],
    '遗忘': ['enemy', '取消当前回合并开始新回合'],
    '收割': ['continuous', '每次使用王牌后抽一张新王牌'],
    '逃脱': ['enemy', '本回合失败时免除伤害'],
    '增加一': ['continuous', '抽一张王牌，对手赌注增加1'],
    '增加二': ['continuous', '抽一张王牌，对手赌注增加2'],
    '增加二+': ['continuous', '退回对手上一张牌，对手赌注增加2'],
    '护盾攻击': ['continuous', '消耗己方三张护盾，对手赌注增加3'],
    '护盾攻击+': ['continuous', '消耗己方两张护盾，对手赌注增加5'],
    '死亡破坏': ['continuous', '弃一半王牌并完美抽牌，对手赌注增加10'],
    '强迫消耗': ['continuous', '回合结束时对手失去一半王牌；对手用两张可解除'],
    '强迫消耗+': ['continuous', '回合结束时对手失去全部王牌；对手用三张可解除'],
    '王牌变换': ['instant', '随机放弃两张王牌，再抽三张'],
    '王牌变换+': ['instant', '随机放弃一张王牌，再抽四张'],
    '完美抽牌': ['instant', '从牌组抽出最有利的牌'],
    '完美抽牌+': ['continuous', '完美抽牌，对手赌注增加5'],
    '终极抽牌': ['instant', '完美抽牌并抽两张王牌'],
    '挑战17点': ['rule', '本回合以最接近17点者胜'],
    '挑战24点': ['rule', '本回合以最接近24点者胜'],
    '挑战27点': ['rule', '本回合以最接近27点者胜'],
    '生死一搏': ['enemy', '双方赌注提高100，对手无法抽牌'],
    '增加二十一': ['continuous', '自己恰好达到21点时，对手赌注增加21'],
    '爱你的敌人': ['instant', '让对手抽出最有利的牌']
  };
  for (let n = 1; n <= 11; n++) {
    TRUMPS[`数字${n}`] = ['instant', `抽出数字${n}`];
    TRUMPS[`数字${n}+`] = ['instant', `抽出数字${n}并抽一张王牌`];
  }
  const TRUMP_COMMON = [];
  for (let n = 1; n <= 11; n++) TRUMP_COMMON.push(`数字${n}`, `数字${n}+`);
  TRUMP_COMMON.push('退回', '撤除', '交换', '护盾', '增加一', '幸福');
  const TRUMP_RARE = ['护盾+', '破坏', '欲望', '诅咒', '增加二', '增加二+', '王牌变换', '挑战24点', '挑战27点'];
  const TRUMP_EPIC = ['破坏+', '欲望+', '魔抽', '收割', '护盾攻击', '强迫消耗', '王牌变换+', '完美抽牌', '终极抽牌', '挑战17点'];
  const TRUMP_LEGEND = ['破坏++', '死寂', '护盾攻击+', '死亡破坏', '强迫消耗+', '完美抽牌+', '增加二十一', '爱你的敌人'];
  function bjTrump(isBot) {
    const roll = Math.random(); let pool;
    if (roll < 0.60) pool = TRUMP_COMMON;
    else if (roll < 0.86) pool = TRUMP_RARE;
    else if (roll < 0.97) pool = TRUMP_EPIC;
    else pool = TRUMP_LEGEND;
    if (isBot && Math.random() < 0.035) pool = ['遗忘', '逃脱', '生死一搏'];
    return pick(pool);
  }
  function bjTrumpSkipsTurn(trumpName) {
    const trump = TRUMPS[trumpName]; const description = trump ? trump[1] : '';
    return /跳过.{0,4}自己.{0,4}回合|结束.{0,4}自己.{0,4}回合/.test(description);
  }
  function bjGainedTrumpText(actor, trumpName) { return actor.isBot ? '一张王牌' : `王牌【${trumpName}】`; }
  function bjActor(id, name, isBot) {
    return { id, name, isBot: !!isBot, hp: 5, maxHp: 5, hand: [], trumps: [], stand: false, revealed: false, busted: false, lastDrawn: null, trumpsUsed: 0 };
  }
  function bjOther(room, actor) { return actor.id === room.player.id ? room.enemy : room.player; }
  function bjSum(actor) { return actor.hand.reduce((sum, n) => sum + n, 0); }
  function bjBuffs(room, ownerId) { return room.buffs.filter((b) => b.owner === ownerId); }
  function bjHasBuff(room, ownerId, id) { return room.buffs.some((b) => b.owner === ownerId && b.id === id); }
  function bjBestValue(room, actor) {
    const current = bjSum(actor); let best = null; let bestDiff = 1000;
    room.deck.forEach((v) => {
      const diff = room.target - (current + v);
      if (diff >= 0 && diff < bestDiff) { best = v; bestDiff = diff; }
    });
    if (best === null && room.deck.length) best = room.deck.slice().sort((a, b) => a - b)[0];
    return best;
  }
  function bjPositionAtTarget(target, mine, theirs) {
    const mineValue = mine > target ? -100 - (mine - target) * 10 : -(target - mine);
    const theirValue = theirs > target ? -100 - (theirs - target) * 10 : -(target - theirs);
    return mineValue - theirValue;
  }
  function bjTargetPlan(room, target, actor) {
    const sum = bjSum(actor); const gap = target - sum; const deck = room.deck.slice();
    const safeCards = deck.filter((value) => sum + value <= target);
    const result = {
      target, sum, gap, safeCards, safeChance: deck.length ? safeCards.length / deck.length : 0,
      singleExact: gap > 0 && deck.indexOf(gap) >= 0, reachable: gap === 0,
      minCards: gap === 0 ? 0 : -1, bestReach: 0
    };
    if (gap <= 0) return result;
    const impossible = 999; const minCards = [];
    for (let total = 0; total <= gap; total++) minCards[total] = impossible;
    minCards[0] = 0;
    deck.forEach((value) => {
      for (let total = gap; total >= value; total--) {
        if (minCards[total - value] !== impossible) minCards[total] = Math.min(minCards[total], minCards[total - value] + 1);
      }
    });
    for (let total = gap; total >= 0; total--) {
      if (minCards[total] !== impossible) { result.bestReach = total; break; }
    }
    result.reachable = minCards[gap] !== impossible;
    result.minCards = result.reachable ? minCards[gap] : -1;
    return result;
  }
  function bjShouldBotDraw(room) {
    const bot = room.enemy; const player = room.player; const botSum = bjSum(bot); const playerSum = bjSum(player);
    if (bot.busted || botSum >= room.target || !room.deck.length) return false;
    const plan = bjTargetPlan(room, room.target, bot);
    if (!plan.safeCards.length) return false;
    const position = bjPositionAtTarget(room.target, botSum, playerSum);
    const playerCommitted = player.stand || player.busted;
    if (playerCommitted) {
      if (position >= 0) return false;
      return true;
    }
    let threshold;
    if (plan.gap <= 2) threshold = 0.78;
    else if (plan.gap <= 4) threshold = 0.62;
    else if (plan.gap <= 7) threshold = 0.48;
    else threshold = 0.36;
    if (room.target === 17) threshold += 0.08;
    if (room.target === 27 && plan.gap >= 8) threshold -= 0.04;
    if (plan.singleExact) threshold -= 0.10;
    if (!plan.reachable) threshold += 0.12;
    if (position >= 0) threshold += 0.10;
    return plan.safeChance >= clamp(threshold, 0.20, 0.90);
  }
  function bjBotTrumpScore(room, trumpName) {
    const bot = room.enemy; const player = room.player; const target = room.target;
    const botSum = bjSum(bot); const playerSum = bjSum(player); const unusable = -1000000;
    if (!TRUMPS[trumpName] || bjHasBuff(room, player.id, '破坏++')) return unusable;
    const shields = bjBuffs(room, bot.id).filter((buff) => buff.id === '护盾' || buff.id === '护盾+').length;
    if (trumpName === '护盾攻击' && shields < 3) return unusable;
    if (trumpName === '护盾攻击+' && shields < 2) return unusable;
    if (trumpName === '王牌变换' && bot.trumps.length < 3) return unusable;
    if ((trumpName === '王牌变换+' || trumpName === '诅咒') && bot.trumps.length < 2) return unusable;

    const numberMatch = /^数字(\d+)(\+)?$/.exec(trumpName);
    if (numberMatch) {
      const value = int(numberMatch[1]);
      if (room.deck.indexOf(value) < 0 || bot.busted || botSum + value > target) return unusable;
      const diff = target - (botSum + value);
      return (diff === 0 ? 170 : 115 - diff * 9) + (numberMatch[2] ? 8 : 0);
    }
    if (trumpName === '退回') {
      if (bot.lastDrawn === null) return unusable;
      const next = botSum - bot.lastDrawn;
      return bot.busted && next <= target ? 220 - (target - next) * 3 : unusable;
    }
    if (trumpName === '撤除') {
      if (player.lastDrawn === null || player.busted) return unusable;
      const before = target - playerSum; const after = target - (playerSum - player.lastDrawn);
      return 52 + Math.max(0, after - before) * 4;
    }
    if (trumpName === '交换') {
      if (bot.lastDrawn === null || player.lastDrawn === null) return unusable;
      const nextBot = botSum - bot.lastDrawn + player.lastDrawn;
      const nextPlayer = playerSum - player.lastDrawn + bot.lastDrawn;
      if (nextBot > target) return unusable;
      const before = bjPositionAtTarget(target, botSum, playerSum);
      const after = bjPositionAtTarget(target, nextBot, nextPlayer);
      const rescue = bot.busted ? 170 : 0;
      return rescue + 55 + (after - before) * 7;
    }
    if (trumpName === '护盾') return 54 + (bot.hp <= 2 ? 30 : 0);
    if (trumpName === '护盾+') return 72 + (bot.hp <= 2 ? 35 : 0);
    if (trumpName === '破坏' || trumpName === '破坏+') {
      const count = bjBuffs(room, player.id).length;
      if (!count) return unusable;
      return trumpName === '破坏+' ? 85 + count * 12 : 62 + count * 8;
    }
    if (trumpName === '破坏++') return bjHasBuff(room, bot.id, trumpName) ? 20 : 120 + bjBuffs(room, player.id).length * 10;
    if (trumpName === '欲望') return 45 + player.trumps.length * 8;
    if (trumpName === '欲望+') return 58 + player.trumps.length * 12;
    if (trumpName === '幸福') return bot.trumps.length >= 6 ? 28 : 8;
    if (trumpName === '诅咒') {
      const max = room.deck.length ? Math.max.apply(null, room.deck) : null;
      if (max === null) return unusable;
      return playerSum + max > target ? 155 : 18;
    }
    if (trumpName === '魔抽') return bjHasBuff(room, bot.id, trumpName) ? 10 : bot.trumps.length <= 3 ? 58 : 24;
    if (trumpName === '遗忘') {
      const behind = bjPositionAtTarget(target, botSum, playerSum) < 0;
      return bot.busted ? 240 : behind ? 105 : unusable;
    }
    if (trumpName === '收割') return bjHasBuff(room, bot.id, trumpName) ? unusable : 110;
    if (trumpName === '逃脱') return bjHasBuff(room, bot.id, trumpName) ? unusable : bot.busted || botSum < playerSum ? 120 : 65;
    if (trumpName === '增加一') return 72;
    if (trumpName === '增加二') return 90;
    if (trumpName === '增加二+') return player.lastDrawn === null || player.busted ? 55 : 105;
    if (trumpName === '护盾攻击') return 105;
    if (trumpName === '护盾攻击+') return 145;
    if (trumpName === '死亡破坏') return bot.busted ? unusable : 155;
    if (trumpName === '强迫消耗') return player.trumps.length >= 2 ? 78 + player.trumps.length * 5 : 32;
    if (trumpName === '强迫消耗+') return player.trumps.length >= 2 ? 105 + player.trumps.length * 7 : 38;
    if (trumpName === '王牌变换') return bot.trumps.length >= 6 ? 42 : 18;
    if (trumpName === '王牌变换+') return bot.trumps.length >= 5 ? 55 : 24;
    if (trumpName === '完美抽牌' || trumpName === '完美抽牌+' || trumpName === '终极抽牌') {
      if (bot.busted) return unusable;
      const value = bjBestValue(room, bot);
      if (value === null || botSum + value > target) return unusable;
      const diff = target - (botSum + value);
      const bonus = trumpName === '完美抽牌+' ? 45 : trumpName === '终极抽牌' ? 22 : 0;
      return 130 - diff * 8 + bonus;
    }
    if (trumpName.indexOf('挑战') === 0) {
      const nextTarget = int(trumpName.replace(/\D/g, ''), target);
      if (nextTarget === target) return unusable;
      const before = bjPositionAtTarget(target, botSum, playerSum);
      const after = bjPositionAtTarget(nextTarget, botSum, playerSum);
      const rescuesBust = botSum > target && botSum <= nextTarget ? 190 : 0;
      if ((player.stand || player.busted) && before >= 0 && !rescuesBust) return unusable;
      const plan = bjTargetPlan(room, nextTarget, bot);
      let score = 35 + (after - before) * 8 + rescuesBust;
      if (botSum === nextTarget) score += 40;
      else if (botSum < nextTarget && !rescuesBust) {
        if (!plan.reachable) score -= 100;
        else score += plan.singleExact ? 28 : Math.max(-5, 22 - plan.minCards * 6);
        score += (plan.safeChance - 0.5) * 24;
      }
      return score >= 45 ? score : unusable;
    }
    if (trumpName === '死寂') return bjHasBuff(room, bot.id, trumpName) ? 15 : 115;
    if (trumpName === '生死一搏') return !bot.busted && bjPositionAtTarget(target, botSum, playerSum) >= 0 ? 210 : unusable;
    if (trumpName === '增加二十一') return bjSum(bot) === 21 ? 145 : 48;
    if (trumpName === '爱你的敌人') return unusable;
    return bjHasBuff(room, bot.id, trumpName) ? 20 : 48;
  }
  function bjChooseBotTrump(room) {
    const bot = room.enemy; let selected = null; let selectedScore = -1000000;
    bot.trumps.forEach((trumpName) => {
      const score = bjBotTrumpScore(room, trumpName);
      if (score > selectedScore) { selected = trumpName; selectedScore = score; }
    });
    const threshold = bot.busted ? 45 : bot.trumps.length >= 5 ? 25 : 45;
    return selectedScore >= threshold ? selected : null;
  }
  function bjDraw(room, actor, mode, value) {
    const opponent = bjOther(room, actor);
    if (bjHasBuff(room, opponent.id, '死寂') || bjHasBuff(room, opponent.id, '生死一搏')) return { ok: false, msg: '死寂般的压力封锁了抽牌。' };
    if (mode === 'normal' && actor.stand) return { ok: false, msg: '已经停牌，不能继续普通摸牌。' };
    if (mode === 'normal' && actor.busted) return { ok: false, msg: '已经爆牌，不能普通摸牌；你仍可使用王牌修正牌面，或选择停牌。' };
    let card = null;
    if (mode === 'specific') {
      const index = room.deck.indexOf(value);
      if (index >= 0) card = room.deck.splice(index, 1)[0];
    } else if (mode === 'best') {
      const best = bjBestValue(room, actor); const index = room.deck.indexOf(best);
      if (index >= 0) card = room.deck.splice(index, 1)[0];
    } else card = room.deck.shift();
    if (card === null || card === undefined) return { ok: false, msg: '牌组中没有符合条件的数字牌。' };
    actor.hand.push(card); actor.lastDrawn = card;
    if (bjSum(actor) > room.target) actor.busted = true;
    let gainedTrump = null;
    if (mode === 'normal') {
      const chance = clamp(seal.ext.getIntConfig(ext, '21点摸牌获得王牌概率'), 0, 100);
      if (Math.random() * 100 < chance) { gainedTrump = bjTrump(actor.isBot); actor.trumps.push(gainedTrump); }
    }
    const gainedText = gainedTrump ? `，并获得${bjGainedTrumpText(actor, gainedTrump)}` : '';
    return {
      ok: true, card, gainedTrump,
      msg: `${actor.name} 抽到 ${card}${actor.busted && !actor.isBot ? '，爆牌！但回合尚未结算' : ''}${gainedText}。`
    };
  }
  function bjReturnLast(room, actor) {
    if (actor.lastDrawn === null) return false;
    const index = actor.hand.lastIndexOf(actor.lastDrawn);
    if (index < 0) return false;
    room.deck.push(actor.hand.splice(index, 1)[0]); actor.lastDrawn = null; actor.busted = false; room.deck = shuffle(room.deck);
    return true;
  }
  function bjDiscardRandomTrumps(actor, count) {
    const removed = [];
    for (let i = 0; i < count && actor.trumps.length; i++) {
      const index = Math.floor(Math.random() * actor.trumps.length);
      removed.push(actor.trumps.splice(index, 1)[0]);
    }
    return removed;
  }
  function bjAddBuff(room, owner, id) {
    if (id.indexOf('挑战') === 0) room.buffs = room.buffs.filter((b) => b.id.indexOf('挑战') !== 0);
    room.buffs.push({ id, owner: owner.id });
  }
  function bjSyncTargetFromBuffs(room) {
    const challenge = room.buffs.slice().reverse().find((buff) => String(buff.id || '').indexOf('挑战') === 0);
    const target = challenge ? int(String(challenge.id).replace(/\D/g, ''), 21) : 21;
    const changed = room.target !== target; room.target = target;
    room.player.busted = bjSum(room.player) > target; room.enemy.busted = bjSum(room.enemy) > target;
    return changed;
  }
  function bjPlayTrump(room, actor, trumpName) {
    const opponent = bjOther(room, actor);
    const index = actor.trumps.indexOf(trumpName);
    if (index < 0) return { ok: false, msg: `手中没有王牌“${trumpName}”。` };
    if (!TRUMPS[trumpName]) return { ok: false, msg: '未知王牌。' };
    if (bjHasBuff(room, opponent.id, '破坏++')) return { ok: false, msg: '破坏++封锁了你的王牌。' };
    if (trumpName === '护盾攻击' || trumpName === '护盾攻击+') {
      const needed = trumpName === '护盾攻击' ? 3 : 2;
      const shields = room.buffs.filter((b) => b.owner === actor.id && (b.id === '护盾' || b.id === '护盾+'));
      if (shields.length < needed) return { ok: false, msg: `至少需要 ${needed} 张己方护盾牌。` };
    }
    if (trumpName === '王牌变换' && actor.trumps.length < 3) return { ok: false, msg: '除本牌外还需要至少两张王牌。' };
    if ((trumpName === '王牌变换+' || trumpName === '诅咒') && actor.trumps.length < 2) return { ok: false, msg: '除本牌外还需要至少一张王牌。' };
    actor.trumps.splice(index, 1);
    actor.trumpsUsed++;
    room.player.stand = false; room.enemy.stand = false;
    let message = `${actor.name} 使用【${trumpName}】。`;
    const numberMatch = /^数字(\d+)(\+)?$/.exec(trumpName);
    if (numberMatch) {
      const result = bjDraw(room, actor, 'specific', int(numberMatch[1]));
      message += ` ${result.msg}`;
      if (numberMatch[2]) { const t = bjTrump(actor.isBot); actor.trumps.push(t); message += ` 并抽到${bjGainedTrumpText(actor, t)}。`; }
    } else if (trumpName === '退回') message += bjReturnLast(room, actor) ? ' 上一张牌已退回。' : ' 没有可退回的牌。';
    else if (trumpName === '撤除') message += bjReturnLast(room, opponent) ? ' 对手上一张牌已退回。' : ' 对手没有可退回的牌。';
    else if (trumpName === '交换') {
      if (actor.lastDrawn === null || opponent.lastDrawn === null) message += ' 双方没有可交换的明牌。';
      else {
        const ai = actor.hand.lastIndexOf(actor.lastDrawn); const oi = opponent.hand.lastIndexOf(opponent.lastDrawn);
        const av = actor.hand[ai]; actor.hand[ai] = opponent.hand[oi]; opponent.hand[oi] = av;
        actor.lastDrawn = actor.hand[ai]; opponent.lastDrawn = opponent.hand[oi];
        actor.busted = bjSum(actor) > room.target; opponent.busted = bjSum(opponent) > room.target;
        message += ' 双方上一张明牌已经交换。';
      }
    } else if (trumpName === '破坏') {
      const owned = room.buffs.map((b, i) => ({ b, i })).filter((x) => x.b.owner === opponent.id);
      if (owned.length) {
        const target = owned[owned.length - 1]; room.buffs.splice(target.i, 1); message += ` 撤除了【${target.b.id}】。`;
        if (bjSyncTargetFromBuffs(room)) message += ' 挑战规则已解除，目标点数恢复为21。';
      }
      else message += ' 对手场上没有王牌。';
    } else if (trumpName === '破坏+' || trumpName === '破坏++') {
      const before = room.buffs.length; room.buffs = room.buffs.filter((b) => b.owner !== opponent.id);
      message += ` 清除了 ${before - room.buffs.length} 张对手场上王牌。`;
      if (trumpName === '破坏++') bjAddBuff(room, actor, trumpName);
      if (bjSyncTargetFromBuffs(room)) message += ' 挑战规则已解除，目标点数恢复为21。';
    } else if (trumpName === '幸福') {
      const a = bjTrump(actor.isBot); const b = bjTrump(opponent.isBot); actor.trumps.push(a); opponent.trumps.push(b);
      message += ` ${actor.name}获得${bjGainedTrumpText(actor, a)}，${opponent.name}获得${bjGainedTrumpText(opponent, b)}。`;
    } else if (trumpName === '诅咒') {
      const removed = bjDiscardRandomTrumps(actor, 1); const max = room.deck.length ? Math.max.apply(null, room.deck) : null;
      const result = max === null ? { msg: '牌组已空。' } : bjDraw(room, opponent, 'specific', max);
      message += ` 放弃【${removed.join('、')}】；${result.msg}`;
    } else if (trumpName === '魔抽') {
      for (let i = 0; i < 3; i++) actor.trumps.push(bjTrump(actor.isBot)); bjAddBuff(room, actor, trumpName); message += ' 抽取三张王牌。';
    } else if (trumpName === '遗忘') {
      message += ' 当前回合被抹去。'; room.logs.push(message);
      bjNewRound(room, room.roundStarter || room.turn || 'player'); return { ok: true, msg: message, reset: true };
    } else if (trumpName === '增加一' || trumpName === '增加二') {
      actor.trumps.push(bjTrump(actor.isBot)); bjAddBuff(room, actor, trumpName); message += ' 额外抽取一张王牌。';
    } else if (trumpName === '增加二+') {
      bjReturnLast(room, opponent); bjAddBuff(room, actor, trumpName); message += ' 对手上一张牌被退回。';
    } else if (trumpName === '护盾攻击' || trumpName === '护盾攻击+') {
      const needed = trumpName === '护盾攻击' ? 3 : 2; let removed = 0;
      room.buffs = room.buffs.filter((b) => {
        if (removed < needed && b.owner === actor.id && (b.id === '护盾' || b.id === '护盾+')) { removed++; return false; }
        return true;
      });
      bjAddBuff(room, actor, trumpName); message += ` 消耗了 ${removed} 张护盾。`;
    } else if (trumpName === '死亡破坏') {
      const removed = bjDiscardRandomTrumps(actor, Math.floor(actor.trumps.length / 2));
      const result = bjDraw(room, actor, 'best'); bjAddBuff(room, actor, trumpName);
      message += ` 放弃 ${removed.length} 张王牌；${result.msg}`;
    } else if (trumpName === '王牌变换' || trumpName === '王牌变换+') {
      const discard = trumpName === '王牌变换' ? 2 : 1; const draw = trumpName === '王牌变换' ? 3 : 4;
      const removed = bjDiscardRandomTrumps(actor, discard); for (let i = 0; i < draw; i++) actor.trumps.push(bjTrump(actor.isBot));
      message += ` 放弃【${removed.join('、')}】，重新抽取 ${draw} 张。`;
    } else if (trumpName === '完美抽牌' || trumpName === '完美抽牌+') {
      const result = bjDraw(room, actor, 'best'); message += ` ${result.msg}`; if (trumpName === '完美抽牌+') bjAddBuff(room, actor, trumpName);
    } else if (trumpName === '终极抽牌') {
      const result = bjDraw(room, actor, 'best'); actor.trumps.push(bjTrump(actor.isBot), bjTrump(actor.isBot)); message += ` ${result.msg} 并抽取两张王牌。`;
    } else if (trumpName.indexOf('挑战') === 0) {
      room.target = int(trumpName.replace(/\D/g, ''), 21); bjAddBuff(room, actor, trumpName); message += ` 目标点数变为 ${room.target}。`;
      room.player.busted = bjSum(room.player) > room.target; room.enemy.busted = bjSum(room.enemy) > room.target;
    } else if (trumpName === '爱你的敌人') {
      const result = bjDraw(room, opponent, 'best'); message += ` ${result.msg}`;
    } else {
      bjAddBuff(room, actor, trumpName);
    }
    if (bjHasBuff(room, actor.id, '收割') && trumpName !== '收割') {
      const harvested = bjTrump(actor.isBot); actor.trumps.push(harvested); message += ` 收割补充了${bjGainedTrumpText(actor, harvested)}。`;
    }
    room.logs.push(message); room.updatedAt = nowMs();
    return { ok: true, msg: message };
  }
  function bjDamage(room, loser, winner) {
    let damage = 1;
    bjBuffs(room, loser.id).forEach((b) => {
      if (b.id === '护盾') damage -= 1;
      else if (b.id === '护盾+') damage -= 2;
      else if (b.id === '魔抽') damage += 1;
    });
    bjBuffs(room, winner.id).forEach((b) => {
      if (b.id === '增加一') damage += 1;
      else if (b.id === '增加二' || b.id === '增加二+') damage += 2;
      else if (b.id === '护盾攻击') damage += 3;
      else if (b.id === '护盾攻击+' || b.id === '完美抽牌+') damage += 5;
      else if (b.id === '死亡破坏') damage += 10;
      else if (b.id === '欲望') damage += Math.floor(loser.trumps.length / 2);
      else if (b.id === '欲望+') damage += loser.trumps.length;
      else if (b.id === '增加二十一' && bjSum(winner) === 21) damage += 21;
      else if (b.id === '生死一搏') damage += 100;
    });
    if (bjHasBuff(room, loser.id, '逃脱')) damage = 0;
    return Math.max(0, damage);
  }
  function bjForcedDiscard(room) {
    room.buffs.slice().forEach((b) => {
      if (b.id !== '强迫消耗' && b.id !== '强迫消耗+') return;
      const owner = b.owner === room.player.id ? room.player : room.enemy;
      const target = bjOther(room, owner); const threshold = b.id === '强迫消耗' ? 2 : 3;
      if (target.trumpsUsed >= threshold) room.buffs = room.buffs.filter((x) => x !== b);
      else bjDiscardRandomTrumps(target, b.id === '强迫消耗' ? Math.ceil(target.trumps.length / 2) : target.trumps.length);
    });
  }
  function bjWinner(room) {
    const a = room.player; const b = room.enemy; const as = bjSum(a); const bs = bjSum(b);
    if (a.busted && b.busted) return null;
    if (a.busted) return b;
    if (b.busted) return a;
    const ad = room.target - as; const bd = room.target - bs;
    if (ad === bd) return null;
    return ad < bd ? a : b;
  }
  function bjFinishMatch(room, winner) {
    room.status = 'finished'; room.winnerId = winner.id; room.updatedAt = nowMs();
    if (room.roundResult) room.roundResult.matchFinished = true;
    if (room.settled) return;
    room.settled = true;
    const p = loadProfile(room.player.id, room.player.name); const won = winner.id === room.player.id;
    const coinReward = awardEntryReturn(p, 'blackjack', won);
    const rules = affectionRules(); const delta = won ? rules.win : rules.loss; changeAffection(p, delta);
    recordGame(p, 'blackjack', won ? 'win' : 'loss', Math.max(0, room.player.hp), coinReward - ENTRY.blackjack, { affectionDelta: delta });
    room.affectionDelta = delta; room.coinReward = coinReward;
    room.logs.push(`${winner.name} 赢得整场对决；${room.player.name} 好感 ${delta >= 0 ? '+' : ''}${delta}${coinReward ? `，获得 ${coinReward} 游戏币（两倍入场费回报）` : ''}。`);
  }
  function bjNewRound(room, forcedStarter) {
    const starter = forcedStarter === 'enemy' || forcedStarter === 'player'
      ? forcedStarter
      : room.nextStarter === 'enemy' ? 'enemy' : 'player';
    room.round++; room.target = 21; room.deck = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); room.buffs = [];
    room.phase = 'playing'; room.roundResult = null; room.lastBotActions = []; room.roundStarter = starter; room.nextStarter = null;
    [room.player, room.enemy].forEach((p) => {
      p.hand = []; p.trumps = Array.isArray(p.trumps) ? p.trumps : []; p.trumps.push(bjTrump(p.isBot));
      p.stand = false; p.revealed = false; p.busted = false; p.lastDrawn = null; p.trumpsUsed = 0;
    });
    room.player.hand.push(room.deck.shift(), room.deck.shift()); room.player.lastDrawn = room.player.hand[room.player.hand.length - 1];
    room.enemy.hand.push(room.deck.shift(), room.deck.shift()); room.enemy.lastDrawn = room.enemy.hand[room.enemy.hand.length - 1];
    room.turn = starter;
    const starterName = starter === 'enemy' ? room.enemy.name : room.player.name;
    room.logs.push(`第 ${room.round} 回合开始，目标21点，由 ${starterName} 先手；双方各获得一张王牌，未使用王牌继续保留。`); room.updatedAt = nowMs();
  }
  function createBlackjackRoom(id, name) {
    const room = { game: 'blackjack', status: 'playing', entry: ENTRY.blackjack, player: bjActor(id, name, false), enemy: bjActor(`${BOT_PREFIX}blackjack`, seal.ext.getStringConfig(ext, '骰娘称呼') || '骰娘', true), round: 0, target: 21, deck: [], buffs: [], turn: 'player', logs: [], createdAt: nowMs(), updatedAt: nowMs(), settled: false };
    bjNewRound(room, 'player'); return room;
  }
  function bjEnsureNextStarter(room) {
    if (!room || room.phase !== 'round_result' || !room.roundResult) return;
    let nextStarter = room.nextStarter;
    if (nextStarter !== 'player' && nextStarter !== 'enemy') {
      const currentStarter = room.roundStarter === 'enemy' ? 'enemy' : 'player';
      nextStarter = room.roundResult.tie
        ? currentStarter === 'player' ? 'enemy' : 'player'
        : room.roundResult.loserName === room.enemy.name ? 'enemy' : 'player';
    }
    room.nextStarter = nextStarter; room.roundResult.nextStarter = nextStarter;
    room.roundResult.nextStarterName = nextStarter === 'enemy' ? room.enemy.name : room.player.name;
  }
  function bjResolveRound(room) {
    const winner = bjWinner(room); bjForcedDiscard(room);
    let loser = null; let damage = 0;
    if (!winner) room.logs.push(`本回合平局：${bjSum(room.player)} 比 ${bjSum(room.enemy)}。`);
    else {
      loser = bjOther(room, winner); damage = bjDamage(room, loser, winner); loser.hp -= damage;
      room.logs.push(`${winner.name} 赢得回合，${loser.name} 承受 ${damage} 点赌注伤害。`);
    }
    const currentStarter = room.roundStarter === 'enemy' ? 'enemy' : 'player';
    const nextStarter = winner
      ? loser.id === room.enemy.id ? 'enemy' : 'player'
      : currentStarter === 'player' ? 'enemy' : 'player';
    const nextStarterName = nextStarter === 'enemy' ? room.enemy.name : room.player.name;
    room.nextStarter = nextStarter;
    room.phase = 'round_result'; room.turn = 'player'; room.player.revealed = true; room.enemy.revealed = true;
    room.roundResult = {
      round: room.round, target: room.target, playerSum: bjSum(room.player), enemySum: bjSum(room.enemy),
      tie: !winner, winnerName: winner ? winner.name : '', loserName: loser ? loser.name : '', damage,
      nextStarter, nextStarterName,
      matchFinished: room.player.hp <= 0 || room.enemy.hp <= 0
    };
    room.updatedAt = nowMs();
    if (room.roundResult.matchFinished) { bjFinishMatch(room, room.player.hp > room.enemy.hp ? room.player : room.enemy); return; }
    room.logs.push(`双方最终牌面已保留；下一回合由 ${nextStarterName} 先手，确认后发送“.yan 21点 抽牌”开局。`);
  }
  function bjAdvance(room, endAction) {
    if (room.status !== 'playing' || room.phase === 'round_result') return;
    const a = room.player; const b = room.enemy;
    const actor = room.turn === 'player' ? a : b;
    if (endAction === 'stand') actor.stand = true;
    else { a.stand = false; b.stand = false; }
    if (a.stand && b.stand) { bjResolveRound(room); return; }
    if (room.turn === 'player') room.turn = b.stand ? 'player' : 'enemy';
    else room.turn = a.stand ? 'enemy' : 'player';
  }
  function bjRunBot(room) {
    let guard = 0; let trumpPlays = 0; const bot = room.enemy; const logStart = room.logs.length;
    const maxTrumpPlays = Math.min(8, Math.max(3, Math.ceil(bot.trumps.length / 2)));
    while (room.status === 'playing' && room.phase !== 'round_result' && room.turn === 'enemy' && guard++ < 30) {
      if (bot.trumps.length && trumpPlays < maxTrumpPlays) {
        const card = bjChooseBotTrump(room);
        if (card) {
          const result = bjPlayTrump(room, bot, card);
          if (result.reset) {
            trumpPlays++;
            if (room.turn === 'enemy') continue;
            break;
          }
          if (result.ok) {
            trumpPlays++;
            if (bjTrumpSkipsTurn(card)) bjAdvance(room, 'skip');
            continue;
          }
        }
      }
      if (bjShouldBotDraw(room)) {
        const result = bjDraw(room, bot, 'normal');
        if (result.ok) { room.logs.push(result.msg); bjAdvance(room, 'draw'); }
        else { room.logs.push(result.msg); room.logs.push(`${bot.name} 停牌。`); bjAdvance(room, 'stand'); }
      } else { room.logs.push(`${bot.name} 停牌。`); bjAdvance(room, 'stand'); }
    }
    if (room.status === 'playing' && room.phase !== 'round_result' && room.turn === 'enemy') {
      room.logs.push(`${bot.name} 的连续行动达到安全上限，自动停牌并交出行动权。`); bjAdvance(room, 'stand');
    }
    const botActions = room.logs.slice(logStart).filter((line) => String(line).indexOf(`${bot.name} `) === 0);
    if (botActions.length) room.lastBotActions = botActions.slice(-8);
  }
  function bjPlayerMove(room, id, action, trumpName) {
    if (room.status !== 'playing') return '对局已经结束。';
    if (room.player.id !== id) return '这不是你的21点对局。';
    if (room.phase === 'round_result') {
      bjEnsureNextStarter(room);
      if (action !== 'draw') return '本回合已经结算，请先发送“.yan 21点 抽牌”开启下一回合。';
      bjNewRound(room);
      if (room.turn === 'enemy') bjRunBot(room);
      return '';
    }
    if (room.turn !== 'player') return '骰娘还在行动。';
    if (action === 'draw') {
      const result = bjDraw(room, room.player, 'normal'); if (!result.ok) return result.msg; room.logs.push(result.msg);
      bjAdvance(room, 'draw');
    } else if (action === 'stand') { room.logs.push(`${room.player.name} 停牌并交出行动权。`); bjAdvance(room, 'stand'); }
    else if (action === 'trump') {
      const result = bjPlayTrump(room, room.player, trumpName); if (!result.ok) return result.msg;
      if (result.reset) { if (room.turn === 'enemy') bjRunBot(room); room.updatedAt = nowMs(); return ''; }
      if (bjTrumpSkipsTurn(trumpName)) bjAdvance(room, 'skip');
      else { room.updatedAt = nowMs(); return ''; }
    } else return '未知操作。';
    if (room.turn === 'enemy') bjRunBot(room); room.updatedAt = nowMs(); return '';
  }
  function bjRecentActions(room) {
    const botActions = Array.isArray(room.lastBotActions) ? room.lastBotActions : [];
    const used = [];
    botActions.forEach((line) => {
      const matched = /使用【([^】]+)】/.exec(String(line));
      if (matched) used.push(matched[1]);
    });
    if (used.length) {
      const rows = [`${room.enemy.name} 使用王牌：${used.join('、')}`];
      const tail = botActions.length ? bjPublicBlackjackLog(room, botActions[botActions.length - 1]) : '';
      if (tail && !/使用【/.test(tail)) rows.push(tail);
      return rows;
    }
    if (botActions.length) return botActions.slice(-2).map((line) => bjPublicBlackjackLog(room, line));
    return room.logs.slice(-2).map((line) => bjPublicBlackjackLog(room, line));
  }
  function bjPublicBlackjackLog(room, line) {
    let text = String(line || '');
    if (room.enemy && text.indexOf(`${room.enemy.name} `) === 0) {
      text = text.replace(/，?爆牌[！!]?但回合尚未结算/g, '').replace(/\s*\(爆牌\)|\s*（爆牌）/g, '');
    }
    return text;
  }
  function blackjackView(room, quote) {
    const roundSettled = room.phase === 'round_result';
    const enemyReveal = roundSettled || room.status === 'finished';
    const enemyCards = enemyReveal ? room.enemy.hand.join(' ') : `? ${room.enemy.hand.slice(1).join(' ')}`;
    const actionLabel = room.status === 'finished' ? '整场已结算' : roundSettled ? '等待确认下一回合' : room.turn === 'player' ? room.player.name : room.enemy.name;
    const lines = [
      `第${room.round}回合  |  目标 ${room.target}  |  ${roundSettled || room.status === 'finished' ? '状态' : '当前行动'} ${actionLabel}`,
      `${room.player.name}  HP ${Math.max(0, room.player.hp)}  |  手牌 ${room.player.hand.join(' ')}  |  点数 ${bjSum(room.player)}${room.player.stand ? '  [停牌]' : ''}`,
      `${room.enemy.name}  HP ${Math.max(0, room.enemy.hp)}  |  手牌 ${enemyCards}${enemyReveal ? `  |  点数 ${bjSum(room.enemy)}` : ''}${room.enemy.stand ? '  [停牌]' : ''}`,
      `你的王牌：${room.player.trumps.length ? room.player.trumps.join('、') : '无'}`,
      `场上效果：${room.buffs.length ? room.buffs.map((b) => `${b.owner === room.player.id ? '你' : '敌'}:${b.id}`).join('、') : '无'}`
    ];
    if (room.roundResult) {
      const result = room.roundResult;
      lines.push(result.tie ? `回合结算：${result.playerSum} 比 ${result.enemySum}，平局。` : `回合结算：${result.playerSum} 比 ${result.enemySum}，${result.winnerName} 获胜，${result.loserName} 受到 ${result.damage} 点伤害。`);
      if (!result.matchFinished) lines.push(`下一回合由 ${result.nextStarterName} 先手；发送“.yan 21点 抽牌”开局。`);
    }
    room.logs.slice(-5).forEach((log) => lines.push(`· ${bjPublicBlackjackLog(room, log)}`));
    const meters = [
      { label: room.player.name, value: Math.max(0, room.player.hp), min: 0, max: room.player.maxHp || Math.max(5, room.player.hp), text: `${Math.max(0, room.player.hp)} HP` },
      { label: room.enemy.name, value: Math.max(0, room.enemy.hp), min: 0, max: room.enemy.maxHp || Math.max(5, room.enemy.hp), text: `${Math.max(0, room.enemy.hp)} HP` }
    ];
    function actorStatus(actor, isTurn, concealBust) {
      if (roundSettled) return '已停牌 · 回合结算';
      if (actor.stand) return '已停牌';
      if (concealBust && actor.busted) return isTurn ? '行动中' : '等待';
      if (actor.busted) return isTurn ? '爆牌 · 可出王牌或停牌' : '爆牌 · 等待行动';
      return isTurn ? '行动中' : '等待';
    }
    const blackjackTable = {
      round: room.round, target: room.target, turn: room.turn, phase: roundSettled ? 'round_result' : 'playing',
      player: {
        name: room.player.name, hp: Math.max(0, room.player.hp), maxHp: room.player.maxHp || Math.max(5, room.player.hp), sum: bjSum(room.player),
        hand: room.player.hand.map((value) => ({ value, hidden: false })), trumps: room.player.trumps.slice(), trumpCount: room.player.trumps.length,
        stand: room.player.stand, busted: room.player.busted, status: actorStatus(room.player, room.turn === 'player')
      },
      enemy: {
        name: room.enemy.name, hp: Math.max(0, room.enemy.hp), maxHp: room.enemy.maxHp || Math.max(5, room.enemy.hp), sum: enemyReveal ? bjSum(room.enemy) : null,
        hand: room.enemy.hand.map((value, index) => ({ value, hidden: !enemyReveal && index === 0 })), trumps: [], trumpCount: room.enemy.trumps.length,
        stand: room.enemy.stand, busted: enemyReveal ? room.enemy.busted : false, status: actorStatus(room.enemy, room.turn === 'enemy', !enemyReveal)
      },
      buffs: room.buffs.map((buff) => ({ name: buff.id, side: buff.owner === room.player.id ? 'player' : 'enemy' })),
      roundResult: room.roundResult ? {
        playerSum: room.roundResult.playerSum, enemySum: room.roundResult.enemySum, tie: room.roundResult.tie,
        winnerName: room.roundResult.winnerName, loserName: room.roundResult.loserName,
        damage: room.roundResult.damage, nextStarter: room.roundResult.nextStarter,
        nextStarterName: room.roundResult.nextStarterName, matchFinished: room.roundResult.matchFinished
      } : null,
      recentActions: bjRecentActions(room),
      lastAction: room.logs.length ? bjPublicBlackjackLog(room, room.logs[room.logs.length - 1]) : '等待行动。'
    };
    return { kind: 'blackjack', title: '生化危机7 · 21点', subtitle: '入场100 · 结算牌面保留 · 抽牌开启下一回合', blackjackTable, meters, lines, quote: quote || '' };
  }
  function blackjackMenuView(quote) {
    return {
      kind: 'blackjack', title: '生化危机7 · 21点', subtitle: '入场100 · 5 HP · 王牌可连续使用',
      lines: ['.yan 21点 教程 [页码]', '.yan 21点 开始', '.yan 21点 抽牌 / 停牌', '.yan 21点 出牌 [王牌名]', '.yan 21点 状态 / 放弃 / 清理'],
      quote: quote || ''
    };
  }

  function blackjackTutorialView(pageValue) {
    const typeNames = { instant: '即时', continuous: '持续', rule: '规则', enemy: '敌方专属' };
    const trumpEntries = [
      { title: '数字1-11', description: '抽出指定数字；该数字已不在牌组时不会生效。', tag: '即时 · 11种' },
      { title: '数字1-11+', description: '抽出指定数字，并额外获得一张王牌；数字不存在时仍会获得王牌。', tag: '即时 · 11种' }
    ];
    Object.keys(TRUMPS).forEach((name) => {
      if (/^数字\d+\+?$/.test(name)) return;
      trumpEntries.push({ title: name, description: TRUMPS[name][1], tag: typeNames[TRUMPS[name][0]] || '王牌' });
    });
    const perPage = 10; const total = 1 + Math.ceil(trumpEntries.length / perPage); const page = tutorialPage(pageValue, total);
    let entries;
    if (page === 1) {
      entries = [
        { title: '胜利目标', description: '数字牌只有1至11且每张唯一；点数最接近目标且不超过目标者赢得本回合。', tag: '基础规则' },
        { title: '生命与赌注', description: '双方初始5 HP。回合败者承受基础1点伤害，场上王牌会增减伤害。', tag: '对决' },
        { title: '行动阶段', description: '轮到自己时可以连续使用任意数量王牌；只有成功摸牌或停牌才交出行动权。', tag: '流程' },
        { title: '爆牌不结算', description: '超过目标后不能普通摸牌，但仍可用王牌修正或停牌；敌方不会仅因爆牌翻开暗牌。', tag: '关键规则' },
        { title: '敌方王牌信息', description: '敌方获得新王牌时只公开数量，不公开名称；实际使用后会在行动记录中明确显示牌名。', tag: '隐藏信息' },
        { title: '连续停牌', description: '双方连续停牌后比较点数并保留最终牌面；下一回合由本轮输家先手，平局则交换先手。', tag: '结算条件' },
        { title: '获得王牌', description: '每个新回合双方各获得1张；普通摸牌还会按配置概率额外获得1张。', tag: '牌源' },
        { title: '跨回合保留', description: '手中未使用的王牌会保留；已经打到桌面的持续效果在回合结束时清空。', tag: '保留规则' },
        { title: '使用指令', description: '.yan 21点 抽牌 / 停牌 / 出牌 [王牌名] / 状态；入场费100游戏币。', tag: '指令' }
      ];
    } else entries = trumpEntries.slice((page - 2) * perPage, (page - 1) * perPage);
    return {
      kind: 'blackjack', title: '生化危机7 · 21点教程', subtitle: `第 ${page}/${total} 页 · 发送“.yan 21点 教程 ${page === total ? 1 : page + 1}”继续`,
      tutorial: { page, total, entries }, lines: entries.map((item) => `${item.title}：${item.description}`),
      quote: page === 1 ? '王牌不会主动交换回合；用摸牌或停牌结束自己的行动阶段。' : '标记为“敌方专属”的王牌不会进入玩家卡池。'
    };
  }

  // -------------------- 亡命神抽 --------------------
  const DMD_SUITS = {
    M: '美人鱼', T: '藏宝图', D: '弯刀', G: '钩子', C: '船锚',
    Y: '钥匙', B: '宝箱', H: '海怪', P: '大炮', Z: '占卜球'
  };
  function dmdCardText(card) { return card ? `${DMD_SUITS[card.suit]}${card.value}` : '?'; }
  function dmdPlayer(id, name, isBot, paid) {
    const collected = {}; Object.keys(DMD_SUITS).forEach((s) => { collected[s] = []; });
    const bot = !!isBot; const entryPaid = bot ? false : paid !== false;
    return { id, name, isBot: bot, paid: entryPaid, guest: !bot && !entryPaid, collected, grandSlams: 0, affectionDelta: 0 };
  }
  function dmdDeck() {
    const cards = [];
    Object.keys(DMD_SUITS).forEach((suit) => { for (let value = 2; value <= 7; value++) cards.push({ suit, value }); });
    return shuffle(cards);
  }
  function dmdScore(p) {
    return Object.keys(DMD_SUITS).reduce((sum, suit) => sum + (p.collected[suit].length ? Math.max.apply(null, p.collected[suit]) : 0), 0);
  }
  function dmdCollect(p, card) { p.collected[card.suit].push(card.value); p.collected[card.suit].sort((a, b) => b - a); }
  function createDmdRoom(ownerId, ownerName, ownerPaid) {
    return {
      game: 'dmd', status: 'waiting', entry: ENTRY.dmd, ownerId, players: [dmdPlayer(ownerId, ownerName, false, ownerPaid)],
      deck: [], discard: [], board: [], current: 0, forcedDraws: 0, pending: null, logs: ['船已经靠岸，等待其他寻宝者。'],
      createdAt: nowMs(), updatedAt: nowMs(), settled: false
    };
  }
  function dmdStart(room) {
    if (room.players.length < 2) return '至少需要两名玩家或机器人。';
    room.deck = dmdDeck(); room.discard = []; room.board = []; room.current = 0; room.forcedDraws = 0; room.pending = null;
    room.status = 'playing'; room.logs = [`${room.players[0].name} 先手。`]; room.updatedAt = nowMs(); return '';
  }
  function dmdCardCode(card) { return card ? `${card.suit}${card.value}` : ''; }
  function dmdFindCard(cards, selector) {
    const text = String(selector || '').trim();
    if (!text) return null;
    const index = /^\d+$/.test(text) ? int(text, 0) - 1 : -1;
    if (index >= 0 && index < cards.length) return cards[index];
    const upper = text.toUpperCase();
    return cards.find((card) => dmdCardCode(card) === upper || dmdCardText(card) === text || `${DMD_SUITS[card.suit]}${card.suit}${card.value}` === text) || null;
  }
  function dmdPendingText(room) {
    const pending = room.pending;
    if (!pending) return '';
    const options = (pending.options || []).map((option, index) => {
      const card = option.card || option;
      return `${index + 1}.${option.playerName ? `${option.playerName}:` : ''}${dmdCardCode(card)}(${dmdCardText(card)})`;
    }).join('  ');
    const mandatory = pending.type === 'T' ? '藏宝图必须选择并获得其中一张，不能跳过。' : '存在合法目标，必须执行该效果，不能跳过。';
    return `待处理【${pending.name}】。${mandatory}${options ? `\n可选目标：${options}` : ''}`;
  }
  function dmdPrepareEffect(room, player, card, sourceType) {
    room.pending = null;
    let message = '';
    if (card.suit === 'M' && !(sourceType === 'M' && card.suit === 'M')) {
      const options = room.board.slice(0, -1).map((c) => ({ card: c }));
      if (options.length) { room.pending = { type: 'M', name: '美人鱼', required: true, options }; message = '美人鱼必须把甲板上一张较早的牌移动到末尾。'; }
      else message = '美人鱼出现，但没有可以移动的旧牌。';
    } else if (card.suit === 'T') {
      const options = room.discard.splice(0, Math.min(3, room.discard.length));
      if (options.length) { room.pending = { type: 'T', name: '藏宝图', required: true, options: options.map((c) => ({ card: c })) }; message = `藏宝图翻出 ${options.map(dmdCardCode).join('、')}，必须选择一张加入甲板。`; }
      else message = '藏宝图出现，但弃牌堆为空。';
    } else if (card.suit === 'D') {
      const options = [];
      room.players.forEach((other) => {
        if (other.id === player.id) return;
        Object.keys(DMD_SUITS).forEach((suit) => {
          if (!player.collected[suit].length && other.collected[suit].length) options.push({ playerId: other.id, playerName: other.name, card: { suit, value: other.collected[suit][0] } });
        });
      });
      if (options.length) { room.pending = { type: 'D', name: '弯刀', required: true, options }; message = '弯刀必须抢走一张你尚未拥有花色的对手顶牌。'; }
      else message = '弯刀出现，但没有合法的抢夺目标。';
    } else if (card.suit === 'G') {
      const options = [];
      Object.keys(DMD_SUITS).forEach((suit) => player.collected[suit].forEach((value) => options.push({ card: { suit, value } })));
      if (options.length) { room.pending = { type: 'G', name: '钩子', required: true, options }; message = '钩子必须把自己的一张战利品移回甲板。'; }
      else message = '钩子出现，但你还没有战利品。';
    } else if (card.suit === 'H') { room.forcedDraws += 2; message = `海怪要求再抽 ${room.forcedDraws} 张。`; }
    else if (card.suit === 'P') {
      const options = [];
      room.players.forEach((other) => {
        if (other.id === player.id) return;
        Object.keys(DMD_SUITS).forEach((suit) => { if (other.collected[suit].length) options.push({ playerId: other.id, playerName: other.name, card: { suit, value: other.collected[suit][0] } }); });
      });
      if (options.length) { room.pending = { type: 'P', name: '大炮', required: true, options }; message = '大炮必须摧毁一张对手的花色顶牌。'; }
      else message = '大炮出现，但其他玩家没有可炮击的战利品。';
    } else if (card.suit === 'Z') message = room.deck.length ? `占卜球看见下一张是【${dmdCardText(room.deck[0])}】。` : '占卜球看见空空的牌库。';
    else if (card.suit === 'C') message = '船锚会在爆炸时保护它之前的牌。';
    else if (card.suit === 'Y') message = '钥匙正在等待宝箱。';
    else if (card.suit === 'B') message = '宝箱正在等待钥匙。';
    if (message) room.logs.push(message);
  }
  function dmdAddEffectCard(room, player, card, sourceType) {
    const duplicate = room.board.some((c) => c.suit === card.suit);
    room.board.push(card);
    if (duplicate) { dmdBust(room, player); return true; }
    dmdPrepareEffect(room, player, card, sourceType);
    return false;
  }
  function dmdNext(room) {
    room.board = []; room.forcedDraws = 0; room.pending = null; room.current = (room.current + 1) % room.players.length; room.updatedAt = nowMs();
    if (!room.deck.length) { dmdFinish(room); return; }
    room.logs.push(`轮到 ${room.players[room.current].name}。`);
  }
  function dmdBust(room, player) {
    const anchor = room.board.findIndex((c) => c.suit === 'C'); let saved = 0;
    if (anchor > 0) { for (let i = 0; i < anchor; i++) { dmdCollect(player, room.board[i]); saved++; } }
    room.discard.push.apply(room.discard, room.board); room.pending = null;
    room.logs.push(`${player.name} 的甲板爆炸${saved ? `，船锚救下 ${saved} 张` : ''}。`); dmdNext(room);
  }
  function dmdDraw(room, id) {
    if (room.status !== 'playing') return '游戏尚未开始或已经结束。';
    const player = room.players[room.current]; if (player.id !== id) return `还没轮到你，当前是 ${player.name}。`;
    if (room.pending) return dmdPendingText(room);
    if (!room.deck.length) { dmdFinish(room); return ''; }
    const card = room.deck.shift(); const duplicate = room.board.some((c) => c.suit === card.suit); room.board.push(card);
    room.logs.push(`${player.name} 抽到【${dmdCardText(card)}】。`);
    if (duplicate) { dmdBust(room, player); return ''; }
    if (room.forcedDraws > 0 && card.suit !== 'H') room.forcedDraws--;
    dmdPrepareEffect(room, player, card, null);
    room.updatedAt = nowMs(); return '';
  }
  function dmdUseEffect(room, id, effectName, selector, targetRef) {
    if (room.status !== 'playing') return '游戏尚未开始或已经结束。';
    const player = room.players[room.current]; if (player.id !== id) return `还没轮到你，当前是 ${player.name}。`;
    const pending = room.pending; if (!pending) return '当前没有待使用的道具效果。';
    const typeMap = { '美人鱼': 'M', '移动': 'M', '藏宝图': 'T', '挖宝': 'T', '弯刀': 'D', '抢劫': 'D', '钩子': 'G', '钩取': 'G', '大炮': 'P', '炮击': 'P' };
    const requested = typeMap[effectName] || String(effectName || '').toUpperCase();
    if (requested !== pending.type) return `当前待处理的是【${pending.name}】，不能使用【${effectName}】。`;
    const options = pending.options || [];
    let chosen = null;
    if (pending.type === 'D' || pending.type === 'P') {
      const targetText = String(targetRef || '');
      chosen = options.find((option) => {
        const targetMatches = !targetText || option.playerId === targetText || option.playerName === targetText || option.playerName.indexOf(targetText) >= 0 || String(room.players.indexOf(room.players.find((p) => p.id === option.playerId)) + 1) === targetText;
        return targetMatches && dmdFindCard([option.card], selector);
      }) || null;
    } else {
      const card = dmdFindCard(options.map((option) => option.card || option), selector);
      if (card) chosen = options.find((option) => dmdCardCode(option.card || option) === dmdCardCode(card));
    }
    if (!chosen) return `目标无效。${dmdPendingText(room)}`;
    const card = chosen.card || chosen; room.pending = null;
    if (pending.type === 'M') {
      const index = room.board.findIndex((c) => dmdCardCode(c) === dmdCardCode(card));
      if (index < 0 || index === room.board.length - 1) return '这张牌不能移动到末尾。';
      const moved = room.board.splice(index, 1)[0]; room.board.push(moved); room.logs.push(`${player.name} 用美人鱼把【${dmdCardText(moved)}】移动到甲板末尾。`);
      dmdPrepareEffect(room, player, moved, 'M');
    } else if (pending.type === 'T') {
      options.forEach((option) => { const other = option.card || option; if (dmdCardCode(other) !== dmdCardCode(card)) room.discard.push(other); });
      room.logs.push(`${player.name} 必须从藏宝图中获得【${dmdCardText(card)}】并加入甲板。`);
      dmdAddEffectCard(room, player, card, 'T');
    } else if (pending.type === 'D') {
      const target = room.players.find((p) => p.id === chosen.playerId); const index = target ? target.collected[card.suit].indexOf(card.value) : -1;
      if (!target || index < 0 || player.collected[card.suit].length) return '抢夺目标已经失效。';
      target.collected[card.suit].splice(index, 1); room.logs.push(`${player.name} 用弯刀从${target.name}处抢走【${dmdCardText(card)}】并加入甲板。`);
      dmdAddEffectCard(room, player, card, 'D');
    } else if (pending.type === 'G') {
      const index = player.collected[card.suit].indexOf(card.value); if (index < 0) return '钩取目标已经不在你的战利品中。';
      player.collected[card.suit].splice(index, 1); room.logs.push(`${player.name} 用钩子把【${dmdCardText(card)}】移回甲板。`);
      dmdAddEffectCard(room, player, card, 'G');
    } else if (pending.type === 'P') {
      const target = room.players.find((p) => p.id === chosen.playerId); const index = target ? target.collected[card.suit].indexOf(card.value) : -1;
      if (!target || index !== 0) return '炮击目标已经失效，必须选择对手该花色的顶牌。';
      target.collected[card.suit].splice(index, 1); room.discard.push(card); room.logs.push(`${player.name} 用大炮摧毁${target.name}的【${dmdCardText(card)}】。`);
    }
    room.updatedAt = nowMs(); return '';
  }
  function dmdSkipEffect(room, id) {
    if (room.status !== 'playing') return '游戏尚未开始或已经结束。';
    const player = room.players[room.current]; if (player.id !== id) return `还没轮到你，当前是 ${player.name}。`;
    if (!room.pending) return '当前没有可放弃的道具效果。';
    return `【${room.pending.name}】存在合法目标，必须执行，不能放弃。`;
  }
  function dmdBank(room, id) {
    if (room.status !== 'playing') return '游戏尚未开始或已经结束。';
    const player = room.players[room.current]; if (player.id !== id) return `还没轮到你，当前是 ${player.name}。`;
    if (room.pending) return dmdPendingText(room);
    if (!room.board.length) return '甲板上没有牌，至少抽一张才能收手。';
    if (room.forcedDraws > 0) return `海怪要求你再抽 ${room.forcedDraws} 张。`;
    const suits = Array.from(new Set(room.board.map((c) => c.suit)));
    if (suits.length === Object.keys(DMD_SUITS).length) { player.grandSlams++; room.logs.push(`${player.name} 达成十花色大满贯！`); }
    const hasKey = room.board.some((c) => c.suit === 'Y'); const hasChest = room.board.some((c) => c.suit === 'B');
    room.board.forEach((c) => dmdCollect(player, c));
    if (hasKey && hasChest) {
      const bonus = room.discard.splice(0, Math.min(room.board.length, room.discard.length)); bonus.forEach((c) => dmdCollect(player, c));
      room.logs.push(`钥匙与宝箱额外带回 ${bonus.length} 张弃牌。`);
    }
    room.logs.push(`${player.name} 收下 ${room.board.length} 张牌，当前 ${dmdScore(player)} 分。`); dmdNext(room); return '';
  }
  function dmdFinish(room) {
    room.status = 'finished'; room.updatedAt = nowMs();
    const ranked = room.players.slice().sort((a, b) => dmdScore(b) - dmdScore(a)); room.ranking = [];
    const topScore = ranked.length ? dmdScore(ranked[0]) : 0; const topTied = ranked.filter((pl) => dmdScore(pl) === topScore).length > 1;
    if (!room.settled) {
      room.settled = true;
      ranked.forEach((pl, index) => {
        const isTop = dmdScore(pl) === topScore; const won = isTop && !topTied;
        let delta = topTied && isTop ? 0 : rankedAffection(index, room.players.length);
        delta += pl.grandSlams * affectionRules().grandSlam;
        pl.affectionDelta = 0; pl.coinReward = 0;
        if (isSettlementEligible(pl)) {
          const p = loadProfile(pl.id, pl.name); const coinReward = awardEntryReturn(p, 'dmd', won); changeAffection(p, delta);
          recordGame(p, 'dmd', isTop ? (topTied ? 'draw' : 'win') : 'loss', dmdScore(pl), coinReward - ENTRY.dmd, { grandSlams: pl.grandSlams, affectionDelta: delta });
          pl.coinReward = coinReward; pl.affectionDelta = delta;
          if (coinReward) room.logs.push(`${pl.name} 获胜，获得 ${coinReward} 游戏币（两倍入场费回报）。`);
        } else if (isGuestPlayer(pl)) room.logs.push(`${pl.name} 以游客身份完成本场，排名保留但不结算奖励、好感与档案。`);
        room.ranking.push({ rank: index + 1, id: pl.id, name: pl.name, score: dmdScore(pl), grandSlams: pl.grandSlams, affectionDelta: pl.affectionDelta, coinReward: pl.coinReward || 0, guest: isGuestPlayer(pl) });
      });
    }
    room.logs.push(`牌库耗尽，${ranked[0].name} 以 ${dmdScore(ranked[0])} 分领先。`);
  }
  function dmdRunBots(room) {
    let guard = 0;
    while (room.status === 'playing' && room.players[room.current].isBot && guard++ < 200) {
      const bot = room.players[room.current];
      if (room.pending) {
        const options = room.pending.options || [];
        if (!options.length) { room.pending = null; continue; }
        let chosen = options.slice().sort((a, b) => (b.card || b).value - (a.card || a).value)[0];
        if (room.pending.type === 'G') {
          const safe = options.filter((option) => !room.board.some((c) => c.suit === (option.card || option).suit));
          if (safe.length) chosen = safe.sort((a, b) => (a.card || a).value - (b.card || b).value)[0];
        }
        dmdUseEffect(room, bot.id, room.pending.name, dmdCardCode(chosen.card || chosen), chosen.playerId || '');
        continue;
      }
      if (!room.board.length || room.forcedDraws > 0 || (room.board.length < 4 && Math.random() < 0.78) || Math.random() < 0.32) dmdDraw(room, bot.id);
      else dmdBank(room, bot.id);
    }
  }
  function dmdView(room, quote) {
    const current = room.players[room.current] || null;
    const lines = [`牌库 ${room.deck.length}  |  弃牌 ${room.discard.length}  |  当前 ${room.status === 'playing' && current ? current.name : room.status === 'waiting' ? '等待开局' : '已结算'}`,
      `甲板：${room.board.length ? room.board.map(dmdCardText).join('、') : '空'}${room.forcedDraws ? `  |  海怪强制 ${room.forcedDraws}` : ''}`];
    if (room.pending) lines.push(dmdPendingText(room));
    room.players.forEach((p) => lines.push(`${roomPlayerName(p)}  ${dmdScore(p)}分  |  已收集 ${Object.keys(DMD_SUITS).filter((s) => p.collected[s].length).length}/10 类  |  大满贯 ${p.grandSlams}`));
    room.logs.slice(-5).forEach((log) => lines.push(`· ${log}`));
    if (room.ranking) room.ranking.forEach((r) => lines.push(r.guest
      ? `#${r.rank} ${r.name}（游客） ${r.score}分 · 不结算大满贯与档案`
      : `#${r.rank} ${r.name} ${r.score}分 ${r.grandSlams ? `大满贯x${r.grandSlams} ` : ''}${r.affectionDelta >= 0 ? '+' : ''}${r.affectionDelta}好感${r.coinReward ? ` +${r.coinReward}币` : ''}`));
    const scoreMax = Math.max(1, ...room.players.map((p) => dmdScore(p)));
    const meters = room.players.map((p) => ({
      label: roomPlayerName(p), value: dmdScore(p), min: 0, max: scoreMax,
      text: `${dmdScore(p)}分 · ${Object.keys(DMD_SUITS).filter((s) => p.collected[s].length).length}/10类`
    }));
    const dmdTable = {
      status: room.status, deckCount: room.deck.length, discardCount: room.discard.length, forcedDraws: room.forcedDraws,
      currentName: current ? current.name : '', board: room.board.map((card) => ({ suit: card.suit, name: DMD_SUITS[card.suit], value: card.value, code: dmdCardCode(card) })),
      lastAction: room.logs.length ? room.logs[room.logs.length - 1] : '船已经靠岸，等待其他寻宝者。',
      pending: room.pending ? {
        type: room.pending.type, name: room.pending.name, mandatory: true,
        options: (room.pending.options || []).map((option, index) => {
          const card = option.card || option;
          return { index: index + 1, playerName: option.playerName || '', suit: card.suit, name: DMD_SUITS[card.suit], value: card.value, code: dmdCardCode(card) };
        })
      } : null,
      players: room.players.map((p) => {
        const rankRow = room.ranking ? room.ranking.find((row) => row.id === p.id) : null;
        const collectedTypes = Object.keys(DMD_SUITS).filter((suit) => p.collected[suit].length).length;
        return {
          name: p.name, score: dmdScore(p), collectedTypes, grandSlams: p.grandSlams, isBot: p.isBot, isGuest: isGuestPlayer(p),
          isTurn: room.status === 'playing' && current && current.id === p.id,
          status: rankRow ? `第${rankRow.rank}名` : room.status === 'waiting' ? '等待开局' : current && current.id === p.id ? (room.pending ? `必须处理${room.pending.name}` : '决定抽牌或收手') : '等待对手',
          rank: rankRow ? rankRow.rank : 0, affectionDelta: p.affectionDelta || 0, coinReward: p.coinReward || 0,
          collection: Object.keys(DMD_SUITS).map((suit) => ({
            suit, name: DMD_SUITS[suit], value: p.collected[suit].length ? p.collected[suit][0] : 0, count: p.collected[suit].length
          }))
        };
      })
    };
    return { kind: 'dmd', title: '亡命神抽对决', subtitle: '入场100 · 十花色全收集可获大满贯', dmdTable, meters, lines, quote: quote || '' };
  }
  function dmdMenuView(quote) {
    const emptyCollection = Object.keys(DMD_SUITS).map((suit) => ({ suit, name: DMD_SUITS[suit], value: 0, count: 0 }));
    return {
      kind: 'dmd', title: '亡命神抽对决', subtitle: '十花色冒险 · 入场100 · 胜者返还200',
      dmdTable: {
        status: 'menu', deckCount: 60, discardCount: 0, forcedDraws: 0, currentName: '',
        board: [
          { suit: 'M', name: '美人鱼', value: 4, code: 'M4' }, { suit: 'C', name: '船锚', value: 5, code: 'C5' },
          { suit: 'H', name: '海怪', value: 3, code: 'H3' }, { suit: 'Y', name: '钥匙', value: 6, code: 'Y6' },
          { suit: 'B', name: '宝箱', value: 7, code: 'B7' }
        ],
        lastAction: '同一花色出现第二张会使甲板爆炸；十种花色全部收手可达成大满贯。', pending: null,
        players: [
          { name: '你的座位', score: 0, collectedTypes: 0, grandSlams: 0, isTurn: true, status: '等待入座', collection: emptyCollection },
          { name: '骰娘 / 玩家', score: 0, collectedTypes: 0, grandSlams: 0, isBot: true, status: '等待对手', collection: emptyCollection }
        ],
        help: ['.yan 神抽 教程 [页码]', '.yan 神抽 人机', '.yan 神抽 开房 / 加入 / 机器人 / 开始', '.yan 神抽 抽牌', '.yan 神抽 收手', '.yan 神抽 使用 [道具] [牌ID] [目标]']
      },
      lines: ['.yan 神抽 教程 [页码]', '.yan 神抽 人机', '.yan 神抽 开房 / 加入 / 机器人 [数量] / 开始', '.yan 神抽 抽牌 / 收手 / 状态 / 退出 / 清理', '.yan 神抽 使用 [美人鱼/藏宝图/弯刀/钩子/大炮] [牌ID] [目标]', '多人房可让余额不足者作为游客参赛；游客不结算奖励、好感、大满贯或档案。'],
      quote: quote || '抽得越多，分数越高；重复花色也会让本回合甲板爆炸。'
    };
  }
  function dmdTutorialView(pageValue) {
    const pages = [
      [
        ['牌库构成', '十种花色各有2至7点六张牌，共60张；所有玩家共用同一牌库。', '基础'],
        ['游客席位', '多人房余额不足仍可完整参赛，但不结算奖励、好感、大满贯或战绩。', '多人'],
        ['回合行动', '轮到你时选择抽牌继续冒险，或在至少抽到一张后收手保存甲板。', '流程'],
        ['重复爆炸', '同一花色第二次进入本回合甲板时立即爆炸，未被船锚保护的牌全部进入弃牌堆。', '风险'],
        ['安全收手', '收手后甲板牌进入个人战利品；每种花色可以累计多张，但最终只取该花色最高点数计分。', '得分'],
        ['船锚保护', '甲板爆炸时，第一张船锚之前的牌会安全收入战利品；船锚及之后的牌仍会丢弃。', '保护'],
        ['大满贯', '一次收手时甲板含齐十种花色即达成大满贯，默认额外获得60好感。', '大奖'],
        ['牌库结束', '牌库耗尽后按十种花色最高点数总和排名；唯一第一名返还两倍入场费。', '结算'],
        ['强制效果', '牌效存在合法目标时必须先执行，处理前不能继续抽牌或收手；无合法目标才自动失效。', '关键规则']
      ],
      [
        ['美人鱼 M', '必须把甲板上一张较早的牌移动到末尾，并执行被移动牌可能触发的效果。', '移动'],
        ['藏宝图 T', '从弃牌堆翻出至多三张，必须选择并获得一张加入甲板，其余返回弃牌堆。', '获取'],
        ['弯刀 D', '必须从对手处抢走一张你尚未拥有花色的顶牌，并把它加入当前甲板。', '抢夺'],
        ['钩子 G', '必须把自己已有的一张战利品移回当前甲板；加入后照常检查重复花色。', '回收'],
        ['船锚 C', '本身留在甲板中；若之后发生爆炸，会保护它之前排列的所有牌。', '保护'],
        ['钥匙 Y', '单独没有即时效果；与宝箱在同次安全收手中出现时触发弃牌奖励。', '组合'],
        ['宝箱 B', '与钥匙同时收手时，从弃牌堆额外带回不超过本次甲板牌数的牌。', '组合'],
        ['海怪 H', '强制追加两次抽牌；强制次数没有清零前不能收手。', '强制抽牌'],
        ['大炮 P', '必须摧毁一名对手某花色的顶牌，被摧毁的牌进入弃牌堆。', '破坏'],
        ['占卜球 Z', '公开预告牌库的下一张牌，让你判断继续抽牌还是及时收手。', '预知']
      ],
      [
        ['通用格式', '使用“.神抽 使用 [道具] [牌ID或序号] [目标]”；图片会列出当前全部合法选项。', '指令'],
        ['牌ID', '牌ID由花色字母与点数组成，例如M4、T6、P7；也可直接输入图片中的选项序号。', '定位'],
        ['美人鱼', '示例：“.神抽 使用 美人鱼 C5”，把指定的较早甲板牌移到末尾。', '示例'],
        ['藏宝图', '示例：“.神抽 使用 藏宝图 2”，必须从翻出的选项中取得第二张。', '示例'],
        ['弯刀与大炮', '需同时给出牌ID与目标名字、座位或@目标，例如“.神抽 使用 大炮 P7 姜修泽”。', '目标'],
        ['钩子', '示例：“.神抽 使用 钩子 M3”，把自己已有的M3战利品放回甲板。', '示例'],
        ['不能跳过', '存在合法目标时“.神抽 放弃效果”不会生效；先完成图片中央列出的强制选择。', '强制']
      ]
    ];
    const page = tutorialPage(pageValue, pages.length);
    const entries = pages[page - 1].map((item) => ({ title: item[0], description: item[1], tag: item[2] }));
    return {
      kind: 'dmd', title: '亡命神抽 · 完整教程', subtitle: `第 ${page}/${pages.length} 页 · 发送“.神抽 教程 ${page === pages.length ? 1 : page + 1}”继续`,
      tutorial: { page, total: pages.length, entries }, lines: entries.map((entry) => `${entry.title}：${entry.description}`),
      quote: page === 1 ? '先学会在重复花色前收手，再逐步利用十种牌效改变风险。' : page === 2 ? '所有存在合法目标的牌效都必须执行。' : '目标和牌ID会直接显示在强制效果图片中央。'
    };
  }

  // -------------------- Farkle快艇骰 --------------------
  function farklePlayer(id, name, isBot, paid) {
    const bot = !!isBot; const entryPaid = bot ? false : paid !== false;
    return { id, name, isBot: bot, paid: entryPaid, guest: !bot && !entryPaid, score: 0, turnScore: 0, bestTurn: 0, affectionDelta: 0 };
  }
  function createFarkleRoom(ownerId, ownerName, ownerPaid) {
    return { game: 'farkle', status: 'waiting', entry: ENTRY.farkle, ownerId, players: [farklePlayer(ownerId, ownerName, false, ownerPaid)], current: 0, target: 5000, ruleSet: 1, dice: [], remaining: 6, phase: 'turn', pendingRollReview: null, lastHumanTurn: null, lastBotTurn: null, logs: ['六枚骰子已经放上桌，当前为规则1。'], createdAt: nowMs(), updatedAt: nowMs(), settled: false };
  }
  function normalizeFarkleRule(value) { return int(value, 1) === 2 ? 2 : 1; }
  function hasFarkleStraight(counts, start) {
    for (let face = start; face < start + 5; face++) if (counts[face] < 1) return false;
    return true;
  }
  function isFarkleRule2SixNoScore(dice, counts) {
    if (dice.length !== 6) return false;
    if (counts[1] > 0 || counts[5] > 0) return false;
    for (let face = 1; face <= 6; face++) if (counts[face] >= 3) return false;
    if (counts.slice(1).every((count) => count === 1)) return false;
    if (counts.slice(1).filter((count) => count === 2).length === 3) return false;
    if (hasFarkleStraight(counts, 1) || hasFarkleStraight(counts, 2)) return false;
    return true;
  }
  function farkleScore(dice, ruleSet) {
    if (!dice || !dice.length) return 0;
    const rule = normalizeFarkleRule(ruleSet);
    const counts = [0, 0, 0, 0, 0, 0, 0]; dice.forEach((d) => { if (d >= 1 && d <= 6) counts[d]++; });
    if (rule === 2 && isFarkleRule2SixNoScore(dice, counts)) return 500;
    if (dice.length === 6 && counts.slice(1).every((n) => n === 1)) return 1500;
    if (dice.length === 6 && counts.slice(1).filter((n) => n === 2).length === 3) return 1500;
    let score = 0;
    if (rule === 2) {
      const smallStart = hasFarkleStraight(counts, 1) ? 1 : hasFarkleStraight(counts, 2) ? 2 : 0;
      if (smallStart) {
        score += 750;
        for (let face = smallStart; face < smallStart + 5; face++) counts[face]--;
      }
    }
    for (let face = 1; face <= 6; face++) {
      let count = counts[face];
      if (count >= 3) {
        const base = face === 1 ? 1000 : face * 100;
        const multiplier = count === 3 ? 1 : count === 4 ? 2 : count === 5 ? 4 : 8;
        score += base * multiplier; count = 0;
      }
      if (face === 1) score += count * 100;
      else if (face === 5) score += count * 50;
      else if (count > 0) return 0;
    }
    return score;
  }
  function farkleBestSelection(dice, ruleSet) {
    let best = { dice: [], score: 0 };
    const total = 1 << dice.length;
    for (let mask = 1; mask < total; mask++) {
      const selected = []; for (let i = 0; i < dice.length; i++) if (mask & (1 << i)) selected.push(dice[i]);
      const score = farkleScore(selected, ruleSet);
      if (score > best.score || (score === best.score && selected.length > best.dice.length)) best = { dice: selected, score };
    }
    return best;
  }
  function farkleStart(room) {
    if (room.players.length < 2) return '至少需要两名玩家或机器人。';
    room.players.forEach((p) => { p.score = 0; p.turnScore = 0; p.bestTurn = 0; });
    room.ruleSet = normalizeFarkleRule(room.ruleSet); room.current = 0; room.dice = []; room.remaining = 6; room.phase = 'turn'; room.status = 'playing'; room.pendingRollReview = null; room.lastHumanTurn = null; room.lastBotTurn = null; room.logs = [`${room.players[0].name} 先手，目标固定为5000分，使用规则${room.ruleSet}。`]; room.updatedAt = nowMs(); return '';
  }
  function farkleRememberTurn(room, player, data) {
    const summary = {
      playerId: player.id, name: player.name, isBot: !!player.isBot,
      dice: Array.isArray(data.dice) ? data.dice.slice(0, 6) : [], farkled: !!data.farkled,
      lostScore: Math.max(0, int(data.lostScore, 0)), gained: Math.max(0, int(data.gained, 0)), total: Math.max(0, int(player.score, 0))
    };
    if (player.isBot) room.lastBotTurn = summary;
    else room.lastHumanTurn = summary;
    return summary;
  }
  function farkleTurnSummary(summary, includeDice) {
    if (!summary) return '';
    if (summary.farkled) return `${summary.name} 上一轮 Farkle${includeDice && summary.dice.length ? ` [${summary.dice.join(', ')}]` : ''}，${summary.lostScore} 分暂存归零，总分 ${summary.total}。`;
    return `${summary.name} 上一轮入账 +${summary.gained} 分，总分 ${summary.total}。`;
  }
  function farkleNext(room) {
    room.current = (room.current + 1) % room.players.length; room.players[room.current].turnScore = 0;
    room.dice = []; room.remaining = 6; room.phase = 'turn'; room.logs.push(`轮到 ${room.players[room.current].name}。`); room.updatedAt = nowMs();
  }
  function farkleRoll(room, id) {
    if (room.status !== 'playing') return '游戏尚未开始或已经结束。';
    const p = room.players[room.current]; if (p.id !== id) return `还没轮到你，当前是 ${p.name}。`;
    if (room.phase === 'rolled') return '必须先选择本次投掷中的计分骰。';
    room.pendingRollReview = null;
    room.dice = []; for (let i = 0; i < room.remaining; i++) room.dice.push(1 + Math.floor(Math.random() * 6));
    room.phase = 'rolled'; room.logs.push(`${p.name} 投出 [${room.dice.join(', ')}]。`);
    if (!farkleBestSelection(room.dice, room.ruleSet).score) {
      const rolled = room.dice.slice(); const lostScore = p.turnScore;
      room.pendingRollReview = farkleRememberTurn(room, p, { dice: rolled, farkled: true, lostScore, gained: 0 });
      p.turnScore = 0; room.logs.push(`Farkle！${p.name} 本回合 ${lostScore} 分暂存归零。`); farkleNext(room);
    }
    room.updatedAt = nowMs(); return '';
  }
  function parseDiceSelection(text) {
    const raw = String(text || '').trim().replace(/，/g, ',');
    if (/^[1-6]+$/.test(raw)) return raw.split('').map((value) => int(value, 0));
    return raw.split(/[,\s]+/).map((value) => int(value.trim(), 0)).filter((value) => value >= 1 && value <= 6);
  }
  function farkleKeep(room, id, selection) {
    if (room.status !== 'playing') return '游戏尚未开始或已经结束。';
    const p = room.players[room.current]; if (p.id !== id) return `还没轮到你，当前是 ${p.name}。`;
    if (room.phase !== 'rolled') return '请先投掷。';
    const selected = Array.isArray(selection) ? selection : parseDiceSelection(selection); if (!selected.length) return '请选择至少一枚骰子，例如：1,1,5 或 115。';
    const copy = room.dice.slice();
    for (let i = 0; i < selected.length; i++) { const at = copy.indexOf(selected[i]); if (at < 0) return `投掷结果中没有足够的 ${selected[i]}。`; copy.splice(at, 1); }
    const score = farkleScore(selected, room.ruleSet); if (!score) return '选择中含有不计分骰，或不能构成有效组合。';
    p.turnScore += score; p.bestTurn = Math.max(p.bestTurn, p.turnScore); room.remaining = room.dice.length - selected.length;
    if (room.remaining === 0) { room.remaining = 6; room.logs.push(`${p.name} 获得热骰，可以重新投掷六枚。`); }
    room.dice = []; room.phase = 'kept'; room.logs.push(`${p.name} 选择 [${selected.join(', ')}]，暂存 +${score}，本回合 ${p.turnScore}。`); room.updatedAt = nowMs(); return '';
  }
  function farkleBank(room, id) {
    if (room.status !== 'playing') return '游戏尚未开始或已经结束。';
    const p = room.players[room.current]; if (p.id !== id) return `还没轮到你，当前是 ${p.name}。`;
    if (room.phase !== 'kept' || p.turnScore <= 0) return '请先投掷并选择至少一组计分骰。';
    const banked = p.turnScore; p.score += banked; farkleRememberTurn(room, p, { farkled: false, gained: banked, lostScore: 0 });
    room.logs.push(`${p.name} 存下 ${banked} 分，总分 ${p.score}。`); p.turnScore = 0;
    if (p.score >= room.target) { farkleFinish(room, p.id); return ''; }
    farkleNext(room); return '';
  }
  function farkleFinish(room, winnerId) {
    room.status = 'finished'; room.winnerId = winnerId; room.updatedAt = nowMs();
    const ranked = room.players.slice().sort((a, b) => b.score - a.score || b.bestTurn - a.bestTurn); room.ranking = [];
    if (!room.settled) {
      room.settled = true;
      ranked.forEach((pl, index) => {
        const delta = rankedAffection(index, room.players.length);
        pl.affectionDelta = 0; pl.coinReward = 0;
        if (isSettlementEligible(pl)) {
          const p = loadProfile(pl.id, pl.name); const coinReward = awardEntryReturn(p, 'farkle', index === 0); changeAffection(p, delta);
          recordGame(p, 'farkle', index === 0 ? 'win' : 'loss', pl.score, coinReward - ENTRY.farkle, { affectionDelta: delta });
          pl.coinReward = coinReward; pl.affectionDelta = delta;
          if (coinReward) room.logs.push(`${pl.name} 获胜，获得 ${coinReward} 游戏币（两倍入场费回报）。`);
        } else if (isGuestPlayer(pl)) room.logs.push(`${pl.name} 以游客身份完成本场，排名保留但不结算奖励、好感与档案。`);
        room.ranking.push({ rank: index + 1, id: pl.id, name: pl.name, score: pl.score, bestTurn: pl.bestTurn, affectionDelta: pl.affectionDelta, coinReward: pl.coinReward || 0, guest: isGuestPlayer(pl) });
      });
    }
    room.logs.push(`${ranked[0].name} 率先达到 ${room.target} 分。`);
  }
  function farkleRunBots(room) {
    let guard = 0;
    while (room.status === 'playing' && room.players[room.current].isBot && guard++ < 300) {
      const bot = room.players[room.current];
      if (room.phase !== 'rolled') farkleRoll(room, bot.id);
      if (room.status !== 'playing' || room.players[room.current].id !== bot.id) continue;
      if (room.phase === 'rolled') {
        const best = farkleBestSelection(room.dice, room.ruleSet); farkleKeep(room, bot.id, best.dice);
      }
      if (room.status !== 'playing' || room.players[room.current].id !== bot.id) continue;
      if (bot.turnScore >= 500 || bot.score + bot.turnScore >= room.target || Math.random() < 0.32) farkleBank(room, bot.id);
    }
  }
  function farkleView(room, quote) {
    const current = room.players[room.current] || null;
    const phaseLabels = { turn: '等待投掷', rolled: '选择计分骰', kept: '继续投掷或存分' };
    const phaseLabel = room.status === 'waiting' ? '等待房主开始' : room.status === 'finished' ? '比赛已结算' : (phaseLabels[room.phase] || '等待行动');
    const pendingReview = room.pendingRollReview && room.pendingRollReview.farkled && room.phase === 'turn' && !room.dice.length ? room.pendingRollReview : null;
    const ownReview = room.lastHumanTurn && room.lastHumanTurn.farkled && room.phase === 'turn' && !room.dice.length && current && current.id === room.lastHumanTurn.playerId ? room.lastHumanTurn : null;
    const reviewTurn = pendingReview || ownReview;
    const displayDice = room.dice.length ? room.dice.slice() : reviewTurn ? reviewTurn.dice.slice() : [];
    const lines = [`目标 ${room.target}  |  当前 ${room.status === 'playing' && current ? current.name : room.status === 'waiting' ? '等待开局' : '已结算'}  |  ${phaseLabel}`];
    if (room.dice.length) lines.push(`本次投掷：[${room.dice.join(', ')}]`);
    else if (reviewTurn) lines.push(farkleTurnSummary(reviewTurn, true));
    if (room.lastBotTurn) lines.push(farkleTurnSummary(room.lastBotTurn, false));
    room.players.forEach((p) => lines.push(`${roomPlayerName(p)}  ${p.score}分  |  本回合 ${p.turnScore}  |  最佳回合 ${p.bestTurn}`));
    room.logs.slice(-5).forEach((log) => lines.push(`· ${log}`));
    if (room.ranking) room.ranking.forEach((r) => lines.push(r.guest
      ? `#${r.rank} ${r.name}（游客） ${r.score}分 · 不结算档案`
      : `#${r.rank} ${r.name} ${r.score}分 ${r.affectionDelta >= 0 ? '+' : ''}${r.affectionDelta}好感${r.coinReward ? ` +${r.coinReward}币` : ''}`));
    const meters = room.players.map((p) => ({ label: roomPlayerName(p), value: p.score, min: 0, max: room.target, text: `${p.score}/${room.target}分` }));
    const best = room.phase === 'rolled' ? farkleBestSelection(room.dice, room.ruleSet) : { score: 0 };
    const farkleTable = {
      status: room.status, phase: room.phase, phaseLabel, target: room.target, ruleSet: normalizeFarkleRule(room.ruleSet), currentName: current ? current.name : '',
      remaining: room.remaining, dice: displayDice, diceReview: !!reviewTurn, reviewTurn, lastBotTurn: room.lastBotTurn || null, suggestedScore: best.score,
      lastAction: room.logs.length ? room.logs[room.logs.length - 1] : '六枚骰子已经放上桌。',
      players: room.players.map((p) => {
        const rankRow = room.ranking ? room.ranking.find((row) => row.id === p.id) : null;
        return {
          name: p.name, score: p.score, turnScore: p.turnScore, bestTurn: p.bestTurn, isBot: p.isBot, isGuest: isGuestPlayer(p),
          isTurn: room.status === 'playing' && current && current.id === p.id,
          status: rankRow ? `第${rankRow.rank}名` : room.status === 'waiting' ? '等待开局' : current && current.id === p.id ? phaseLabel : '等待对手',
          rank: rankRow ? rankRow.rank : 0, affectionDelta: p.affectionDelta || 0, coinReward: p.coinReward || 0
        };
      })
    };
    return { kind: 'farkle', title: 'Farkle · 快艇骰对决', subtitle: `入场100 · 1v1固定5000分获胜 · 规则${normalizeFarkleRule(room.ruleSet)}`, farkleTable, meters, lines, quote: quote || '' };
  }
  function farkleMenuView(quote) {
    return {
      kind: 'farkle', title: 'Farkle · 快艇骰对决', subtitle: '六骰计分 · 入场100 · 胜者返还200 · 默认规则1',
      farkleTable: {
        status: 'menu', phase: 'turn', phaseLabel: '选择开局方式', target: 5000, ruleSet: 1, currentName: '', remaining: 6,
        dice: [1, 2, 3, 4, 5, 6], diceReview: false, reviewTurn: null, lastBotTurn: null, suggestedScore: 1500, lastAction: '顺子、三对、三个及以上同点，以及单独的1和5都能计分。',
        players: [
          { name: '你的座位', score: 0, turnScore: 0, bestTurn: 0, isTurn: true, status: '等待入座' },
          { name: '骰娘 / 玩家', score: 0, turnScore: 0, bestTurn: 0, isBot: true, status: '等待对手' }
        ],
        help: ['.快艇 教程 [页码]', '.快艇 人机 [规则1/2]', '.快艇 开房 / 加入 / 机器人 / 开始', '.快艇 规则 [1/2]', '.快艇 投掷', '.快艇 选择 1,1,5 / 115']
      },
      lines: ['.快艇 教程 [页码]', '.快艇 人机 [1/2]  |  .yan 快艇 人机 2', '.快艇 开房 / 加入 / 机器人 [数量] / 开始', '.快艇 规则 [1/2]（等待阶段可切换）', '.快艇 投掷 / 选择 1,1,5（也可写115）/ 存分', '规则2新增五骰小顺子750、六不搭500；多人游客不结算奖励、好感或档案。'],
      quote: quote || '选择计分骰后，可以继续冒险投掷，也可以立即存分。'
    };
  }
  function farkleTutorialView(pageValue) {
    const pages = [
      [
        ['胜利目标', '1v1固定先达到5000分获胜；多人房同样按率先达到目标结束并排名。', '目标'],
        ['游客席位', '多人房余额不足仍可完整参赛，但不结算奖励、好感、项目分或战绩。', '多人'],
        ['开始回合', '每回合从六枚骰子开始投掷；投完后必须选择本次投掷中的有效计分骰。', '流程'],
        ['选择计分骰', '发送“.快艇 选择 1,1,5”保留计分骰，也可省略逗号写成“.快艇 选择 115”；不能夹带不参与计分的骰子。', '操作'],
        ['继续冒险', '选完计分骰后可用剩余骰子继续投掷，新的得分会累加到本回合暂存。', '博弈'],
        ['存分', '发送“.快艇 存分”把本回合暂存加入总分并换人；未选择计分骰前不能存分。', '止盈'],
        ['Farkle爆骰', '一次投掷完全没有计分组合时，本回合全部暂存归零并立即换人；PvP会保留爆骰骰面，直到下一位玩家投掷。', '风险'],
        ['热骰', '一次投掷的所有骰子都被选为计分骰时触发热骰，可重新投掷完整六枚。', '奖励'],
        ['经济结算', '入场100；唯一第一名返还200游戏币。失败扣除的好感默认多于胜利增加值。', '结算']
      ],
      [
        ['单个1', '每个单独的1计100分，可以和其他有效组合一起选择。', '100分'],
        ['单个5', '每个单独的5计50分，可以和其他有效组合一起选择。', '50分'],
        ['三个1', '三个1计1000分；多出的第4、第5、第6个1会依次将该组合分数翻倍。', '三条'],
        ['普通三条', '三个相同的2至6按点数×100计分，例如三个4计400分。', '三条'],
        ['规则选择', '默认规则1。发送“.快艇 规则 2”或“.快艇 人机 2”启用扩展规则2；等待房开始前可切换，开局后锁定。', '变体'],
        ['四五六条', '四条是对应三条的2倍，五条4倍，六条8倍；可再叠加单个1或5。', '高分组合'],
        ['六骰顺子', '1、2、3、4、5、6各一枚组成顺子，固定计1500分并触发热骰。', '1500分'],
        ['三对与规则2', '六枚骰子恰好组成三组对子固定1500分；规则2另有1-5或2-6五骰顺子750分，以及六枚骰子完全没有标准得分组合时的500分保底。', '扩展'],
        ['图片提示', '选择阶段会显示当前骰面的最高可计分值；爆骰后保留骰面回看，并显示Bot上一轮入账。', '界面']
      ]
    ];
    const page = tutorialPage(pageValue, pages.length);
    const entries = pages[page - 1].map((item) => ({ title: item[0], description: item[1], tag: item[2] }));
    return {
      kind: 'farkle', title: 'Farkle快艇骰 · 完整教程', subtitle: `第 ${page}/${pages.length} 页 · 发送“.快艇 教程 ${page === pages.length ? 1 : page + 1}”继续`,
      tutorial: { page, total: pages.length, entries }, lines: entries.map((entry) => `${entry.title}：${entry.description}`),
      quote: page === 1 ? '暂存分越高，继续投掷时一次Farkle造成的损失也越大。' : '先认单1、单5和三条，再寻找顺子、三对与高条数组合。'
    };
  }

  // -------------------- LOVE WINS ALL --------------------
  const LOVE_CARD_TYPES = {
    S: { name: '剪刀', count: 18, color: '#3f8ee8', emoji: '✂' },
    R: { name: '石头', count: 12, color: '#e0525b', emoji: '✊' },
    P: { name: '布', count: 12, color: '#e4bd42', emoji: '✋' },
    L: { name: '爱', count: 6, color: '#51b878', emoji: '🫰' },
    C: { name: '骗子', count: 1, color: '#e56aa6', emoji: '🤞' }
  };
  const LOVE_HANDS = {
    oneLove: { name: '1爱', rank: 1 }, pair: { name: '1对', rank: 2 }, trips: { name: '3条', rank: 3 },
    twoPair: { name: '2对', rank: 4 }, twoLove: { name: '2爱', rank: 5 }, mixed: { name: '混合', rank: 6 },
    four: { name: '4条', rank: 7 }, threeLove: { name: '3爱', rank: 8 }, winsAll: { name: '爱赢一切', rank: 9 }
  };
  const LOVE_HAND_ALIASES = {
    '1爱': 'oneLove', '一爱': 'oneLove', '1对': 'pair', '一对': 'pair', '对子': 'pair',
    '3条': 'trips', '三条': 'trips', '2对': 'twoPair', '两对': 'twoPair',
    '2爱': 'twoLove', '两爱': 'twoLove', '混合': 'mixed',
    '4条': 'four', '四条': 'four', '3爱': 'threeLove', '三爱': 'threeLove',
    '爱赢一切': 'winsAll', '全爱': 'winsAll'
  };
  const LOVE_RPS = ['R', 'S', 'P'];

  function loveCard(type, serial) {
    const info = LOVE_CARD_TYPES[type] || LOVE_CARD_TYPES.S;
    return { id: `${type}${serial}`, type, name: info.name, color: info.color, emoji: info.emoji };
  }
  function lovePrivateHandCommand(room, viewerId) {
    const player = room && room.players ? room.players.find((item) => item.id === viewerId) : null;
    if (!player || !Array.isArray(player.hand) || !player.hand.length) return '爱赢一切 看牌';
    return `爱赢一切 看牌（当前手牌：${player.hand.map((card) => `${card.emoji || (LOVE_CARD_TYPES[card.type] || {}).emoji || ''}${card.name || (LOVE_CARD_TYPES[card.type] || {}).name || ''}`).join(' ')}）`;
  }
  function loveDeck() {
    const deck = [];
    Object.keys(LOVE_CARD_TYPES).forEach((type) => {
      for (let i = 1; i <= LOVE_CARD_TYPES[type].count; i++) deck.push(loveCard(type, i));
    });
    return shuffle(deck);
  }
  function lovePlayer(id, name, isBot, paid) {
    const bot = !!isBot; const entryPaid = bot ? false : paid !== false;
    return {
      id, name, isBot: bot, paid: entryPaid, guest: !bot && !entryPaid, chips: 20, hand: [],
      streetBet: 0, roundCommitted: 0, acted: false, folded: false, revealedIndex: -1,
      declarationKey: '', declarationName: '', publicAs: '', evaluation: null, autoShowdown: false,
      roundsWon: 0, winsAll: 0, cheatWins: 0, cheatLosses: 0, cheatPenalties: 0,
      bestHandRank: 0, bestHand: '', affectionDelta: 0, coinReward: 0
    };
  }
  function createLoveRoom(ownerId, ownerName, ownerPaid, mode) {
    return {
      game: 'love', mode: mode || 'pvp', status: 'waiting', phase: 'waiting', entry: ENTRY.love,
      ownerId, players: [lovePlayer(ownerId, ownerName, false, ownerPaid)], deck: [], discard: [],
      round: 0, cycleRound: 0, shuffleCount: 0, maxRounds: 7, starter: 0, turn: 0, common: null, pot: 0, carryPot: 0,
      currentBet: 0, roundResult: null, ranking: null, logs: ['牌桌已经布置完毕。'],
      createdAt: nowMs(), updatedAt: nowMs(), settled: false
    };
  }
  function loveParseCardType(value) {
    const text = String(value || '').trim().toLowerCase();
    const aliases = { '剪刀': 'S', 'scissors': 'S', 's': 'S', '石头': 'R', 'rock': 'R', 'r': 'R', '布': 'P', 'paper': 'P', 'p': 'P', '爱': 'L', 'love': 'L', 'l': 'L' };
    return aliases[text] || '';
  }
  function loveParseHand(value) { return LOVE_HAND_ALIASES[String(value || '').trim()] || ''; }
  function loveCardCounts(types) {
    const counts = { S: 0, R: 0, P: 0, L: 0 };
    (types || []).forEach((type) => { if (Object.prototype.hasOwnProperty.call(counts, type)) counts[type]++; });
    return counts;
  }
  function loveEvaluateTypes(types) {
    const list = (types || []).slice(0, 4); if (list.length !== 4 || list.some((type) => !Object.prototype.hasOwnProperty.call(LOVE_CARD_TYPES, type) || type === 'C')) return null;
    const counts = loveCardCounts(list); const loveCount = counts.L;
    let key = 'oneLove';
    if (loveCount === 4) key = 'winsAll';
    else if (loveCount === 3) key = 'threeLove';
    else if (loveCount === 2) key = 'twoLove';
    else if (loveCount === 1 && counts.S === 1 && counts.R === 1 && counts.P === 1) key = 'mixed';
    else if (loveCount === 1) key = 'oneLove';
    else {
      const rpsCounts = LOVE_RPS.map((type) => ({ type, count: counts[type] }));
      const maxCount = Math.max.apply(null, rpsCounts.map((item) => item.count));
      const pairTypes = rpsCounts.filter((item) => item.count === 2).map((item) => item.type);
      if (maxCount === 4) key = 'four';
      else if (pairTypes.length === 2) key = 'twoPair';
      else if (maxCount === 3) key = 'trips';
      else key = 'pair';
    }
    const meta = LOVE_HANDS[key]; const nonLove = list.filter((type) => type !== 'L');
    let primary = '';
    if (key === 'pair') primary = LOVE_RPS.find((type) => counts[type] === 2) || '';
    else if (key === 'trips') primary = LOVE_RPS.find((type) => counts[type] === 3) || '';
    else if (key === 'four') primary = LOVE_RPS.find((type) => counts[type] === 4) || '';
    return {
      key, name: meta.name, rank: meta.rank, types: list, counts, primary,
      pairTypes: LOVE_RPS.filter((type) => counts[type] === 2),
      remaining: primary ? nonLove.filter((type) => type !== primary) : nonLove.slice()
    };
  }
  function loveTypeCompare(a, b) {
    if (!a || !b || a === b) return 0;
    if ((a === 'R' && b === 'S') || (a === 'S' && b === 'P') || (a === 'P' && b === 'R')) return 1;
    return -1;
  }
  function loveCompareTypeLists(a, b) {
    const left = loveCardCounts(a); const right = loveCardCounts(b);
    LOVE_RPS.forEach((type) => { const shared = Math.min(left[type], right[type]); left[type] -= shared; right[type] -= shared; });
    const leftList = []; const rightList = [];
    LOVE_RPS.forEach((type) => { for (let i = 0; i < left[type]; i++) leftList.push(type); for (let i = 0; i < right[type]; i++) rightList.push(type); });
    for (let i = 0; i < Math.min(leftList.length, rightList.length); i++) {
      const compared = loveTypeCompare(leftList[i], rightList[i]); if (compared) return compared;
    }
    return 0;
  }
  function loveCompareEvaluations(a, b) {
    if (!a || !b) return 0;
    if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1;
    if (a.key === 'oneLove' || a.key === 'mixed' || a.key === 'winsAll') return 0;
    if (a.key === 'pair' || a.key === 'trips' || a.key === 'four') {
      const primary = loveTypeCompare(a.primary, b.primary); return primary || loveCompareTypeLists(a.remaining, b.remaining);
    }
    if (a.key === 'twoPair') return loveCompareTypeLists(a.pairTypes, b.pairTypes);
    return loveCompareTypeLists(a.remaining, b.remaining);
  }
  function loveCompatibleEvaluation(visibleTypes, key) {
    const needed = loveCardCounts((visibleTypes || []).filter((type) => type !== 'C'));
    const values = ['S', 'R', 'P', 'L'];
    for (let code = 0; code < 256; code++) {
      let value = code; const types = [];
      for (let i = 0; i < 4; i++) { types.push(values[value % 4]); value = Math.floor(value / 4); }
      const evaluation = loveEvaluateTypes(types); if (!evaluation || evaluation.key !== key) continue;
      const counts = evaluation.counts;
      if (values.every((type) => counts[type] >= needed[type])) return evaluation;
    }
    return null;
  }
  function loveHashUnit(value) {
    const text = String(value == null ? '' : value); let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return (hash >>> 0) / 4294967295;
  }
  function loveBotMind(player) {
    if (!player.botMind || typeof player.botMind !== 'object') player.botMind = {};
    const mind = player.botMind; const seed = loveHashUnit(`${player.id}|${player.name}`);
    const numericDefaults = {
      seed, aggression: 0.42 + loveHashUnit(`${seed}|aggression`) * 0.38,
      deception: 0.34 + loveHashUnit(`${seed}|deception`) * 0.42,
      patience: 0.32 + loveHashUnit(`${seed}|patience`) * 0.46,
      decisions: 0, betDecisions: 0, opponentActions: 0, opponentRaises: 0, opponentCalls: 0,
      opponentChecks: 0, opponentFolds: 0, opponentFacedBets: 0, opponentBluffs: 0, opponentTruths: 0,
      ownBluffs: 0, ownTruths: 0, lastRevealIndex: -1
    };
    Object.keys(numericDefaults).forEach((key) => {
      if (!Number.isFinite(Number(mind[key]))) mind[key] = numericDefaults[key];
      else mind[key] = Number(mind[key]);
    });
    if (typeof mind.lastMode !== 'string') mind.lastMode = '';
    return mind;
  }
  function loveBotNoise(room, player, token, decision) {
    const mind = loveBotMind(player);
    return loveHashUnit(`${mind.seed}|${room.round}|${room.pot}|${decision}|${token}`);
  }
  function loveSubtractCardCount(counts, card) {
    if (card && Object.prototype.hasOwnProperty.call(counts, card.type)) counts[card.type] = Math.max(0, counts[card.type] - 1);
  }
  function lovePublicRemainingCounts(room, candidateCard) {
    const counts = { S: 18, R: 12, P: 12, L: 6 };
    (room.discard || []).forEach((card) => loveSubtractCardCount(counts, card));
    loveSubtractCardCount(counts, room.common);
    (room.players || []).forEach((player) => {
      if (player.revealedIndex >= 0) loveSubtractCardCount(counts, player.hand[player.revealedIndex]);
    });
    loveSubtractCardCount(counts, candidateCard);
    return counts;
  }
  function loveBotDrawCounts(room, player) {
    const counts = { S: 18, R: 12, P: 12, L: 6, C: 1 };
    (room.discard || []).forEach((card) => loveSubtractCardCount(counts, card));
    loveSubtractCardCount(counts, room.common);
    (player.hand || []).forEach((card) => loveSubtractCardCount(counts, card));
    (room.players || []).forEach((other) => {
      if (other !== player && other.revealedIndex >= 0) loveSubtractCardCount(counts, other.hand[other.revealedIndex]);
    });
    return counts;
  }
  function loveCompletionStats(visibleTypes, key, availableCounts) {
    const known = (visibleTypes || []).filter((type) => type !== 'C'); const slots = 4 - known.length;
    if (slots < 0) return { probability: 0, weight: 0, total: 0 };
    const values = ['S', 'R', 'P', 'L']; let matching = 0; let total = 0;
    function walk(types, counts, remaining, weight) {
      if (remaining <= 0) {
        const evaluation = loveEvaluateTypes(types); total += weight;
        if (evaluation && evaluation.key === key) matching += weight;
        return;
      }
      values.forEach((type) => {
        const count = Math.max(0, int(counts[type], 0)); if (!count) return;
        const next = Object.assign({}, counts); next[type] = count - 1;
        walk(types.concat(type), next, remaining - 1, weight * count);
      });
    }
    walk(known, Object.assign({}, availableCounts || {}), slots, 1);
    return { probability: total > 0 ? matching / total : 0, weight: matching, total };
  }
  function loveObserveOpponentAction(room, actorIndex, action, callCost) {
    (room.players || []).forEach((player, index) => {
      if (!player.isBot || index === actorIndex) return;
      const mind = loveBotMind(player); mind.opponentActions++;
      if (callCost > 0) mind.opponentFacedBets++;
      if (action === 'raise') mind.opponentRaises++;
      else if (action === 'call') mind.opponentCalls++;
      else if (action === 'fold') mind.opponentFolds++;
      else if (action === 'check') mind.opponentChecks++;
    });
  }
  function loveObserveShowdown(room, evaluations) {
    (room.players || []).forEach((player, index) => {
      if (!player.isBot) return;
      const opponent = room.players[1 - index]; const evaluation = evaluations[1 - index];
      if (!opponent || !evaluation || !opponent.declarationKey || opponent.autoShowdown || loveHasPrivateCheater(opponent)) return;
      const mind = loveBotMind(player);
      if (opponent.declarationKey === evaluation.key) mind.opponentTruths++;
      else mind.opponentBluffs++;
    });
  }
  function loveResolvedCommon(room, player) {
    if (!room.common) return '';
    return room.common.type === 'C' ? player.publicAs : room.common.type;
  }
  function loveHasPrivateCheater(player) { return !!player && player.hand.some((card) => card.type === 'C'); }
  function loveActualEvaluation(room, player) {
    const commonType = loveResolvedCommon(room, player); if (!commonType) return null;
    const types = [commonType].concat(player.hand.map((card) => card.type));
    if (types.indexOf('C') >= 0) return null;
    return loveEvaluateTypes(types);
  }
  function loveBestAllInEvaluation(room, player) {
    const hasCheater = loveHasPrivateCheater(player); const publicOptions = room.common.type === 'C' ? ['S', 'R', 'P', 'L'] : [''];
    let best = null;
    publicOptions.forEach((publicAs) => {
      const commonType = room.common.type === 'C' ? publicAs : room.common.type;
      if (!hasCheater) {
        const evaluation = loveEvaluateTypes([commonType].concat(player.hand.map((card) => card.type)));
        if (evaluation && (!best || evaluation.rank > best.evaluation.rank || (evaluation.rank === best.evaluation.rank && loveCompareEvaluations(evaluation, best.evaluation) > 0))) best = { publicAs, evaluation };
        return;
      }
      player.hand.forEach((card) => {
        const visible = [commonType, card.type];
        Object.keys(LOVE_HANDS).forEach((key) => {
          const evaluation = loveCompatibleEvaluation(visible, key); if (!evaluation) return;
          if (!best || evaluation.rank > best.evaluation.rank || (evaluation.rank === best.evaluation.rank && card.type !== 'C' && best.cardType === 'C')) best = { publicAs, evaluation, cardType: card.type };
        });
      });
    });
    return best;
  }
  function lovePrepareAllInShowdown(room) {
    room.players.forEach((player) => {
      const best = loveBestAllInEvaluation(room, player); if (!best) return;
      player.publicAs = best.publicAs; player.evaluation = best.evaluation;
      player.declarationKey = best.evaluation.key; player.declarationName = best.evaluation.name;
      player.revealedIndex = -1; player.autoShowdown = true; loveRecordBest(player, best.evaluation);
    });
  }
  function loveRecordBest(player, evaluation) {
    if (!player || !evaluation) return;
    if (evaluation.rank > player.bestHandRank) { player.bestHandRank = evaluation.rank; player.bestHand = evaluation.name; }
  }
  function loveDeal(room) { return room.deck.length ? room.deck.pop() : null; }
  function loveStart(room) {
    if (!room || room.status !== 'waiting') return '房间已经开始或失效。';
    if (room.players.length !== 2) return '爱赢一切固定为1v1，请凑齐两位玩家。';
    room.deck = loveDeck(); room.discard = []; room.status = 'playing'; room.round = 0; room.cycleRound = 0; room.shuffleCount = 0; room.pot = 0; room.carryPot = 0;
    room.starter = Math.random() < 0.5 ? 0 : 1; room.settled = false; room.ranking = null; room.roundResult = null;
    return loveStartRound(room);
  }
  function loveStartRound(room) {
    if (room.status !== 'playing') return '当前对局尚未开始。';
    if (room.players.some((player) => player.chips <= 0)) { loveFinishMatch(room, '一方筹码已经归零。'); return ''; }
    room.cycleRound = Math.max(0, int(room.cycleRound, Math.min(int(room.round, 0), 7)));
    room.shuffleCount = Math.max(0, int(room.shuffleCount, 0));
    if (room.cycleRound >= 7 || room.deck.length < 7) {
      room.players.forEach((player) => { player.chips = Math.ceil(Math.max(0, player.chips) / 2); });
      room.deck = loveDeck(); room.discard = []; room.cycleRound = 0; room.shuffleCount++;
      room.logs.push(`进入第${room.shuffleCount + 1}副牌：回收并重新洗牌，双方筹码向上取整减半。`);
    }
    room.round++; room.cycleRound++; room.phase = 'bet1'; room.pot = Math.max(0, int(room.carryPot, 0)); room.carryPot = 0; room.common = null; room.currentBet = 1; room.roundResult = null; room.allInShowdown = false;
    room.players.forEach((player) => {
      player.hand = [loveDeal(room), loveDeal(room)]; player.streetBet = 1; player.roundCommitted = 1;
      player.chips = Math.max(0, player.chips - 1); player.acted = false; player.folded = false;
      player.revealedIndex = -1; player.declarationKey = ''; player.declarationName = ''; player.publicAs = ''; player.evaluation = null; player.autoShowdown = false;
      player.revealLocked = false; player.pendingRevealIndex = -1; player.pendingDeclarationKey = ''; player.pendingDeclarationName = ''; player.pendingPublicAs = ''; player.pendingEvaluation = null;
      room.pot += 1;
    });
    room.common = loveDeal(room); room.turn = room.starter; room.logs.push(`第${room.round}轮开始，底注各1枚。`); room.logs = room.logs.slice(-8); room.updatedAt = nowMs();
    if (room.players.every((player) => player.chips <= 0)) {
      room.players.forEach((player) => { player.acted = true; }); loveFinishBetStreet(room);
    } else if (room.players[room.turn].chips <= 0) { room.players[room.turn].acted = true; room.turn = 1 - room.turn; }
    return '';
  }
  function loveFinishBetStreet(room) {
    if (room.phase === 'bet1') {
      const allInCalled = room.players.some((player) => player.chips <= 0);
      room.players.forEach((player) => {
        const card = loveDeal(room); if (card) player.hand.push(card);
        player.streetBet = 0; player.acted = false;
      });
      room.currentBet = 0;
      if (allInCalled) {
        lovePrepareAllInShowdown(room); room.logs.push('第一轮全押已经被跟注，跳过公开宣告与第二轮下注，直接摊牌。');
        room.allInShowdown = true; loveResolveRound(room, -1, '第一轮全押跟注，直接摊牌。'); return;
      }
      room.phase = 'reveal'; room.turn = room.starter; room.logs.push('第一轮下注结束，最终补牌已经发出。');
    } else loveResolveRound(room, -1, '双方下注一致，进入摊牌。');
  }
  function loveAdvanceBet(room, actorIndex) {
    const otherIndex = 1 - actorIndex; const actor = room.players[actorIndex]; const other = room.players[otherIndex];
    if (actor.streetBet === other.streetBet && (actor.acted || actor.chips <= 0) && (other.acted || other.chips <= 0)) { loveFinishBetStreet(room); return; }
    room.turn = otherIndex;
    if (other.chips <= 0) {
      other.acted = true;
      if (actor.streetBet === other.streetBet && (actor.acted || actor.chips <= 0)) loveFinishBetStreet(room);
      else room.turn = actorIndex;
    }
  }
  function loveBetAction(room, id, action, amount) {
    if (!room || room.status !== 'playing' || ['bet1', 'bet2'].indexOf(room.phase) < 0) return '当前不是下注阶段。';
    const index = room.players.findIndex((player) => player.id === id); if (index < 0) return '你不在这张牌桌上。';
    if (room.turn !== index) return `现在轮到${room.players[room.turn].name}行动。`;
    const player = room.players[index]; const other = room.players[1 - index]; if (player.chips <= 0) return '你已经全押，等待对方行动。';
    const callCost = Math.max(0, room.currentBet - player.streetBet); const op = String(action || '').toLowerCase();
    if (['弃牌', 'fold'].indexOf(op) >= 0) {
      loveObserveOpponentAction(room, index, 'fold', callCost);
      player.folded = true; loveResolveRound(room, 1 - index, `${player.name}弃牌。`); return '';
    }
    if (['过牌', 'check'].indexOf(op) >= 0) {
      if (callCost > 0) return `还差${callCost}枚筹码，请跟注、加注、全押或弃牌。`;
      loveObserveOpponentAction(room, index, 'check', callCost);
      player.acted = true; room.logs.push(`${player.name}过牌。`); loveAdvanceBet(room, index); room.updatedAt = nowMs(); return '';
    }
    if (['跟注', 'call'].indexOf(op) >= 0) {
      if (callCost > player.chips) return '筹码不足以跟注，请全押或弃牌。';
      loveObserveOpponentAction(room, index, 'call', callCost);
      player.chips -= callCost; player.streetBet += callCost; player.roundCommitted += callCost; room.pot += callCost; player.acted = true;
      room.logs.push(`${player.name}${callCost ? `跟注${callCost}枚` : '过牌'}。`); loveAdvanceBet(room, index); room.updatedAt = nowMs(); return '';
    }
    let target = 0;
    if (['全押', 'allin', 'all-in'].indexOf(op) >= 0) target = player.streetBet + player.chips;
    else if (['加注', 'raise'].indexOf(op) >= 0) target = int(amount, -1);
    else return '可用下注操作：过牌、跟注、加注 <本阶段总额>、全押、弃牌。';
    const callableCap = other.streetBet + other.chips; target = Math.min(target, player.streetBet + player.chips, callableCap);
    if (target <= room.currentBet) {
      if (callCost <= player.chips) return loveBetAction(room, id, '跟注');
      return '没有足够筹码完成这次加注。';
    }
    const cost = target - player.streetBet; player.chips -= cost; player.streetBet = target; player.roundCommitted += cost; room.pot += cost;
    loveObserveOpponentAction(room, index, 'raise', callCost);
    room.currentBet = target; player.acted = true; other.acted = false; room.logs.push(`${player.name}将本阶段总下注提高到${target}枚。`);
    loveAdvanceBet(room, index); room.updatedAt = nowMs(); return '';
  }
  function loveValidateReveal(room, id, cardNumber, declarationText, publicAsText) {
    if (!room || room.status !== 'playing' || room.phase !== 'reveal') return { error: '当前不是公开与宣告阶段。' };
    const index = room.players.findIndex((player) => player.id === id); if (index < 0) return { error: '你不在这张牌桌上。' };
    const player = room.players[index]; if (player.revealLocked) return { error: '你已经锁定本轮公开牌与宣告，不能再次修改。' };
    const revealIndex = int(cardNumber, 0) - 1; if (revealIndex < 0 || revealIndex >= player.hand.length) return { error: '公开位置必须是1、2或3。' };
    const declarationKey = loveParseHand(declarationText); if (!declarationKey) return { error: '未知牌型，请使用1爱、1对、3条、2对、2爱、混合、4条、3爱或爱赢一切。' };
    let publicAs = '';
    if (room.common && room.common.type === 'C') {
      publicAs = loveParseCardType(publicAsText); if (!publicAs) return { error: '公共牌是骗子牌，请在指令末尾指定剪刀、石头、布或爱。' };
    }
    const commonType = room.common.type === 'C' ? publicAs : room.common.type;
    const visibleTypes = [commonType, player.hand[revealIndex].type]; const hasCheater = loveHasPrivateCheater(player);
    const declaredEvaluation = loveCompatibleEvaluation(visibleTypes, declarationKey);
    if (!declaredEvaluation) return { error: '这两张公开牌无法支持所宣告的牌型。' };
    const actualTypes = [commonType].concat(player.hand.map((card) => card.type));
    const evaluation = hasCheater ? declaredEvaluation : actualTypes.indexOf('C') >= 0 ? null : loveEvaluateTypes(actualTypes);
    if (!evaluation) return { error: '当前手牌无法完成有效摊牌。' };
    return { index, revealIndex, declarationKey, declarationName: LOVE_HANDS[declarationKey].name, publicAs, evaluation };
  }
  function loveApplyLockedReveals(room) {
    if (!room || room.phase !== 'reveal' || !room.players.every((player) => player.revealLocked)) return '双方尚未全部锁定公开牌与宣告。';
    room.players.forEach((player) => {
      player.revealedIndex = player.pendingRevealIndex; player.declarationKey = player.pendingDeclarationKey;
      player.declarationName = player.pendingDeclarationName; player.publicAs = player.pendingPublicAs; player.evaluation = player.pendingEvaluation;
      loveRecordBest(player, player.evaluation);
    });
    room.logs.push(`双方同时公开手牌：${room.players.map((player) => `${player.name}宣告“${player.declarationName}”`).join('；')}。`);
    room.phase = 'bet2'; room.currentBet = 0; room.turn = room.starter;
    room.players.forEach((player) => { player.streetBet = 0; player.acted = player.chips <= 0; });
    if (room.players.every((player) => player.acted)) loveFinishBetStreet(room);
    else if (room.players[room.turn].acted) room.turn = 1 - room.turn;
    room.updatedAt = nowMs(); return '';
  }
  function loveLockReveal(room, id, cardNumber, declarationText, publicAsText) {
    const choice = loveValidateReveal(room, id, cardNumber, declarationText, publicAsText);
    if (choice.error) return choice.error;
    const player = room.players[choice.index]; player.revealLocked = true; player.pendingRevealIndex = choice.revealIndex;
    player.pendingDeclarationKey = choice.declarationKey; player.pendingDeclarationName = choice.declarationName;
    player.pendingPublicAs = choice.publicAs; player.pendingEvaluation = choice.evaluation;
    room.logs.push(`${player.name}已经锁定公开牌与宣告。`); room.updatedAt = nowMs();
    if (room.players.every((item) => item.revealLocked)) {
      if (room.mode === 'pve') return loveApplyLockedReveals(room);
      room.phase = 'reveal_confirm'; room.turn = room.starter; room.logs.push('双方均已锁定，等待群内确认后同时公开。');
    }
    return '';
  }
  function loveConfirmReveals(room, id) {
    if (!room || room.status !== 'playing' || room.phase !== 'reveal_confirm') return '当前没有等待确认的同步公开。';
    if (!room.players.some((player) => player.id === id)) return '你不在这张牌桌上。';
    room.phase = 'reveal';
    const error = loveApplyLockedReveals(room);
    if (error) room.phase = 'reveal_confirm';
    return error;
  }
  function loveCheaterPenalty(room, loserIndex) {
    const loser = room.players[loserIndex]; const winner = room.players[1 - loserIndex];
    if (!loveHasPrivateCheater(loser)) return 0;
    const penalty = Math.min(5, Math.max(0, loser.chips)); loser.chips -= penalty; winner.chips += penalty;
    loser.cheatLosses++; loser.cheatPenalties += penalty; if (penalty) room.logs.push(`${loser.name}持骗子牌落败，额外支付${penalty}枚筹码。`);
    return penalty;
  }
  function loveResolveRound(room, forcedWinnerIndex, reason) {
    if (!room || room.status !== 'playing') return;
    let winnerIndex = forcedWinnerIndex; let compared = 0; let cheatTieLoss = false;
    const evaluations = room.players.map((player) => player.evaluation || loveActualEvaluation(room, player));
    if (winnerIndex < 0) {
      loveObserveShowdown(room, evaluations);
      const cheaters = room.players.map(loveHasPrivateCheater);
      if (evaluations[0] && evaluations[1] && evaluations[0].key === evaluations[1].key && cheaters[0] !== cheaters[1]) {
        winnerIndex = cheaters[0] ? 1 : 0; cheatTieLoss = true;
      } else {
        compared = loveCompareEvaluations(evaluations[0], evaluations[1]); winnerIndex = compared > 0 ? 0 : compared < 0 ? 1 : -1;
      }
    }
    let penalty = 0; const potBefore = room.pot;
    if (winnerIndex >= 0) {
      const loserIndex = 1 - winnerIndex; room.players[winnerIndex].chips += room.pot; room.pot = 0; room.players[winnerIndex].roundsWon++;
      if (evaluations[winnerIndex] && evaluations[winnerIndex].key === 'winsAll') room.players[winnerIndex].winsAll++;
      if (loveHasPrivateCheater(room.players[winnerIndex])) room.players[winnerIndex].cheatWins++;
      penalty = loveCheaterPenalty(room, loserIndex); room.starter = loserIndex;
    } else {
      room.carryPot += room.pot; room.pot = 0; room.starter = 1 - room.starter;
    }
    const usedCards = [];
    if (room.common) usedCards.push(room.common); room.players.forEach((player) => player.hand.forEach((card) => usedCards.push(card))); room.discard = room.discard.concat(usedCards);
    room.phase = 'round_result'; room.turn = room.starter;
    room.roundResult = {
      round: room.round, winnerIndex, winnerName: winnerIndex >= 0 ? room.players[winnerIndex].name : '', tie: winnerIndex < 0,
      pot: potBefore, penalty, cheatTieLoss, allInShowdown: !!room.allInShowdown, reason: reason || '', evaluations: evaluations.map((evaluation) => evaluation ? { key: evaluation.key, name: evaluation.name, rank: evaluation.rank } : null),
      hands: room.players.map((player) => player.hand.slice()), common: room.common
    };
    room.logs.push(winnerIndex >= 0 ? `${room.players[winnerIndex].name}赢得本轮${potBefore}枚底池筹码。` : `本轮平局，${room.carryPot}枚筹码带入下一轮。`);
    room.updatedAt = nowMs();
    if (room.players.some((player) => player.chips <= 0)) loveFinishMatch(room, '一方筹码已经归零。');
  }
  function loveFinishMatch(room, reason) {
    if (!room || room.status === 'finished') return;
    if (room.carryPot > 0) {
      const first = Math.floor(room.carryPot / 2); room.players[0].chips += first; room.players[1].chips += room.carryPot - first; room.carryPot = 0;
    }
    room.status = 'finished'; room.phase = 'finished'; room.updatedAt = nowMs();
    const ranked = room.players.slice().sort((a, b) => b.chips - a.chips || b.roundsWon - a.roundsWon); const tied = ranked[0].chips === ranked[1].chips;
    room.winnerId = tied ? '' : ranked[0].id; room.ranking = ranked.map((player, index) => ({ rank: tied ? 1 : index + 1, id: player.id, name: player.name, chips: player.chips, roundsWon: player.roundsWon, guest: isGuestPlayer(player), affectionDelta: 0, coinReward: 0 }));
    if (!room.settled) {
      room.settled = true;
      ranked.forEach((player, index) => {
        if (!isSettlementEligible(player)) return;
        const profile = loadProfile(player.id, player.name); const outcome = tied ? 'draw' : index === 0 ? 'win' : 'loss'; const delta = tied ? 0 : rankedAffection(index, 2); const reward = awardEntryReturn(profile, 'love', outcome === 'win');
        if (delta) changeAffection(profile, delta);
        recordGame(profile, 'love', outcome, player.chips, reward - ENTRY.love, {
          affectionDelta: delta, roundsWon: player.roundsWon, winsAll: player.winsAll, cheatWins: player.cheatWins,
          cheatLosses: player.cheatLosses, cheatPenalties: player.cheatPenalties, finalChips: player.chips,
          bestHandRank: player.bestHandRank, bestHand: player.bestHand
        });
        player.affectionDelta = delta; player.coinReward = reward;
        const row = room.ranking.find((item) => item.id === player.id); if (row) { row.affectionDelta = delta; row.coinReward = reward; }
      });
    }
    room.logs.push(reason || '比赛结束。');
  }
  function loveNextRound(room) {
    if (!room || room.status === 'finished') return '整场已经结算，再输入“.爱赢一切”可回到菜单。';
    if (room.phase !== 'round_result') return '当前还没有等待确认的轮次结算。';
    return loveStartRound(room);
  }
  function loveBotRevealChoice(room, player) {
    const mind = loveBotMind(player); const decision = mind.decisions++; const hasCheater = loveHasPrivateCheater(player);
    const other = room.players[1 - room.players.indexOf(player)]; const publicOptions = room.common.type === 'C' ? ['S', 'R', 'P', 'L'] : [''];
    const keys = Object.keys(LOVE_HANDS); const candidates = [];
    for (let p = 0; p < publicOptions.length; p++) {
      const publicAs = publicOptions[p]; const commonType = room.common.type === 'C' ? publicAs : room.common.type;
      const actualTypes = [commonType].concat(player.hand.map((card) => card.type));
      const actual = actualTypes.indexOf('C') >= 0 ? null : loveEvaluateTypes(actualTypes);
      for (let index = 0; index < player.hand.length; index++) {
        const card = player.hand[index]; const visible = [commonType, card.type]; const remaining = lovePublicRemainingCounts(room, card);
        keys.forEach((key) => {
          const declared = loveCompatibleEvaluation(visible, key); if (!declared) return;
          const completion = loveCompletionStats(visible, key, remaining);
          candidates.push({ index, card, key, publicAs, declared, actual, effective: hasCheater ? declared : actual, completion });
        });
      }
    }
    if (!candidates.length) return { index: 0, key: 'oneLove', publicAs: publicOptions[0], evaluation: LOVE_HANDS.oneLove };

    const actionCount = Math.max(1, mind.opponentActions); const faced = Math.max(1, mind.opponentFacedBets);
    const opponentAggression = clamp((mind.opponentRaises * 1.7 + mind.opponentCalls * 0.45) / actionCount, 0, 1);
    const opponentFoldRate = clamp(mind.opponentFolds / faced, 0, 1);
    const opponentTruthRate = (mind.opponentTruths + 1.5) / (mind.opponentTruths + mind.opponentBluffs + 3);
    const ownBluffRate = (mind.ownBluffs + 1) / (mind.ownBluffs + mind.ownTruths + 2);
    const behind = other ? clamp((other.chips - player.chips) / 20, -1, 1) : 0;
    const late = clamp(int(room.cycleRound, room.round) / Math.max(1, room.maxRounds), 0, 1); const potPressure = clamp(room.pot / Math.max(1, player.chips + room.pot), 0, 1);
    const opponentAssessment = loveBotClaimAssessment(room, player);
    const opponentClaimRank = other && other.declarationKey && LOVE_HANDS[other.declarationKey] ? LOVE_HANDS[other.declarationKey].rank : 0;
    const opponentPressureRank = opponentClaimRank ? Math.round((opponentClaimRank + opponentAssessment.likely) / 2) : 0;
    const bestActualRank = Math.max.apply(null, candidates.map((candidate) => candidate.effective ? candidate.effective.rank : 1));
    let bluffChance = 0.08 + mind.deception * 0.5 + Math.max(0, behind) * 0.16 + late * 0.08 + opponentFoldRate * 0.2 - opponentAggression * 0.12;
    bluffChance += clamp(mind.deception - ownBluffRate, -0.25, 0.25) * 0.32;
    if (mind.lastMode === 'bluff') bluffChance -= 0.08;
    if (opponentClaimRank >= 7) bluffChance += (1 - opponentTruthRate) * 0.12 - opponentAssessment.credibility * 0.1;
    bluffChance = clamp(bluffChance, 0.08, 0.72);
    const trapChance = clamp(0.08 + mind.patience * 0.48 + opponentAggression * 0.22 - potPressure * 0.12, 0.08, 0.68);
    let mode = 'truth';
    if (hasCheater) mode = 'cheater';
    else if (bestActualRank <= 4 && loveBotNoise(room, player, 'bluff-mode', decision) < bluffChance) mode = 'bluff';
    else if (bestActualRank >= 6 && loveBotNoise(room, player, 'trap-mode', decision) < trapChance) mode = 'trap';

    let bluffTarget = Math.max(bestActualRank + 2, opponentPressureRank ? opponentPressureRank + (behind > 0 ? 1 : 0) : 4 + Math.round(late * 2));
    if (behind > 0.55 && late > 0.55) bluffTarget++; bluffTarget = clamp(bluffTarget, 3, 9);
    const trapTarget = clamp(bestActualRank - 1 - Math.round(mind.patience * 2), 1, 8);
    let cheaterTarget = 9;
    const lure = behind <= 0 && potPressure < 0.32 && loveBotNoise(room, player, 'cheater-lure', decision) < mind.patience * (0.45 + opponentAggression * 0.35);
    if (lure) cheaterTarget = 6 + Math.floor(loveBotNoise(room, player, 'cheater-target', decision) * 3);

    candidates.forEach((candidate) => {
      const declaredRank = candidate.declared.rank; const actualRank = candidate.actual ? candidate.actual.rank : 1;
      const probability = clamp(candidate.completion.probability, 0, 1); const credibility = Math.sqrt(clamp(probability * 3, 0, 1));
      let score = credibility * 2.35 + loveBotNoise(room, player, `${candidate.card.id}|${candidate.key}|${candidate.publicAs}`, decision) * 0.82;
      if (candidate.index === mind.lastRevealIndex) score -= 0.24;
      if (candidate.card.type === 'C') score -= 6.2;
      else if (candidate.card.type === 'L') score -= actualRank >= 5 ? 0.72 : 0.28;
      else score += 0.16;
      if (candidate.actual && candidate.actual.primary) {
        if (candidate.card.type === candidate.actual.primary) score -= 0.45 + mind.patience * 0.65;
        else score += 0.32;
      }
      if (mode === 'cheater') {
        score += declaredRank * 0.22 - Math.abs(declaredRank - cheaterTarget) * 1.08 + credibility * 0.8;
        if (candidate.card.type !== 'C') score += 0.55;
      } else if (mode === 'bluff') {
        if (declaredRank > actualRank) score += 4.9 - Math.abs(declaredRank - bluffTarget) * 0.48 + credibility * 0.9;
        else if (candidate.key === candidate.actual.key) score += 1.15;
        else score -= 1.8;
      } else if (mode === 'trap') {
        if (declaredRank < actualRank) score += 4.55 - Math.abs(declaredRank - trapTarget) * 0.52 + credibility * 0.75;
        else if (candidate.key === candidate.actual.key) score += 2.25;
        else score -= 1.6;
      } else {
        if (candidate.actual && candidate.key === candidate.actual.key) score += 5.4 + actualRank * 0.12;
        else score -= 2.4 + Math.abs(declaredRank - actualRank) * 0.22;
      }
      if (opponentClaimRank && mode === 'bluff' && declaredRank >= opponentClaimRank - 1) score += 0.55;
      candidate.score = score;
    });
    candidates.sort((a, b) => b.score - a.score || a.index - b.index || b.declared.rank - a.declared.rank);
    const selected = candidates[0]; mind.lastMode = mode; mind.lastRevealIndex = selected.index;
    if (!hasCheater && selected.actual && selected.key !== selected.actual.key) mind.ownBluffs++;
    else mind.ownTruths++;
    return { index: selected.index, key: selected.key, publicAs: selected.publicAs, evaluation: selected.effective, mode };
  }
  function loveBotExpectedStrength(room, player) {
    if (loveHasPrivateCheater(player)) return 7.8;
    const counts = loveBotDrawCounts(room, player); const values = ['S', 'R', 'P', 'L', 'C']; let total = 0; let weighted = 0;
    values.forEach((drawType) => {
      const count = Math.max(0, int(counts[drawType], 0)); if (!count) return;
      let rank = 1;
      if (drawType === 'C') rank = 7.8;
      else {
        const handTypes = player.hand.map((card) => card.type).concat(drawType);
        if (handTypes.indexOf('C') >= 0) rank = 7.8;
        else if (room.common && room.common.type === 'C') {
          rank = Math.max.apply(null, ['S', 'R', 'P', 'L'].map((commonType) => {
            const evaluation = loveEvaluateTypes([commonType].concat(handTypes)); return evaluation ? evaluation.rank : 1;
          }));
        } else {
          const evaluation = loveEvaluateTypes([room.common.type].concat(handTypes)); rank = evaluation ? evaluation.rank : 1;
        }
      }
      total += count; weighted += rank * count;
    });
    return total > 0 ? weighted / total : 3;
  }
  function loveBotClaimAssessment(room, player) {
    const index = room.players.indexOf(player); const opponent = room.players[1 - index];
    if (!opponent || opponent.revealedIndex < 0 || !opponent.declarationKey || !LOVE_HANDS[opponent.declarationKey]) return { rank: 0, likely: 3.2, credibility: 0 };
    const mind = loveBotMind(player); const commonType = room.common.type === 'C' ? opponent.publicAs : room.common.type;
    const revealed = opponent.hand[opponent.revealedIndex]; const visible = [commonType, revealed.type];
    const remaining = lovePublicRemainingCounts(room, null);
    player.hand.forEach((card, cardIndex) => { if (cardIndex !== player.revealedIndex) loveSubtractCardCount(remaining, card); });
    const completion = loveCompletionStats(visible, opponent.declarationKey, remaining);
    const truthRate = (mind.opponentTruths + 1.5) / (mind.opponentTruths + mind.opponentBluffs + 3);
    const probabilitySignal = Math.sqrt(clamp(completion.probability * 3, 0, 1));
    const credibility = revealed.type === 'C' ? 1 : clamp(0.22 + probabilitySignal * 0.43 + truthRate * 0.35, 0.2, 0.96);
    const rank = LOVE_HANDS[opponent.declarationKey].rank; const likely = rank * credibility + 3.2 * (1 - credibility);
    return { rank, likely, credibility };
  }
  function loveBotStrength(room, player) {
    if (room.phase === 'bet2' && player.evaluation) return player.evaluation.rank;
    return loveBotExpectedStrength(room, player);
  }
  function loveBotBet(room, player) {
    const index = room.players.indexOf(player); const other = room.players[1 - index]; const mind = loveBotMind(player); const decision = mind.betDecisions++;
    const callCost = Math.max(0, room.currentBet - player.streetBet); const strength = loveBotStrength(room, player); const claim = loveBotClaimAssessment(room, player);
    const behind = other ? clamp((other.chips - player.chips) / 20, -1, 1) : 0; const late = clamp(int(room.cycleRound, room.round) / Math.max(1, room.maxRounds), 0, 1);
    const callFraction = callCost / Math.max(1, room.pot + callCost); const confidence = room.phase === 'bet2' ? strength - claim.likely : strength - 3.4;
    const foldRate = clamp(mind.opponentFolds / Math.max(1, mind.opponentFacedBets), 0, 1);
    const ownClaimRank = player.declarationKey && LOVE_HANDS[player.declarationKey] ? LOVE_HANDS[player.declarationKey].rank : 0;
    const coveredBluff = room.phase === 'bet2' && ownClaimRank >= 6 && strength <= 4;
    const nerve = loveBotNoise(room, player, `bet|${room.phase}`, decision);
    const raiseSize = clamp(1 + Math.round((strength + Math.max(0, confidence)) / 3 + mind.aggression * 1.5), 2, 5);

    if (callCost > 0) {
      const danger = Math.max(0, -confidence) + callFraction * 4 - Math.max(0, behind) * late;
      if (strength < 8 && danger > 2.5 + mind.aggression * 1.3 && nerve > 0.2 + mind.patience * 0.28) return loveBetAction(room, player.id, '弃牌');
      const pressureBluff = coveredBluff && foldRate > 0.2 && nerve < clamp(mind.deception * 0.45 + foldRate * 0.35, 0.08, 0.62);
      const valueRaise = strength >= 6.5 && confidence > -0.8 && nerve < 0.3 + mind.aggression * 0.38;
      if ((pressureBluff || valueRaise) && player.chips > callCost + 1) return loveBetAction(room, player.id, '加注', room.currentBet + raiseSize);
      return loveBetAction(room, player.id, '跟注');
    }

    if (strength >= 7) {
      const slowPlay = room.phase === 'bet2' && mind.patience > 0.48 && nerve < mind.patience * (0.38 + clamp(mind.opponentRaises / Math.max(1, mind.opponentActions), 0, 1) * 0.35);
      if (!slowPlay && player.chips > 1) return loveBetAction(room, player.id, '加注', room.currentBet + raiseSize);
    } else if (strength >= 4.5 && confidence > -0.5 && nerve < 0.18 + mind.aggression * 0.32 && player.chips > 1) {
      return loveBetAction(room, player.id, '加注', room.currentBet + Math.max(2, raiseSize - 1));
    } else if (coveredBluff && nerve < clamp(0.1 + mind.deception * 0.38 + foldRate * 0.34 + Math.max(0, behind) * 0.12, 0.12, 0.68) && player.chips > 1) {
      return loveBetAction(room, player.id, '加注', room.currentBet + raiseSize);
    }
    return loveBetAction(room, player.id, '过牌');
  }
  function loveRunBots(room) {
    let guard = 0;
    while (room && room.status === 'playing' && guard++ < 80) {
      if (room.phase === 'reveal') {
        room.players.filter((player) => player.isBot && !player.revealLocked).forEach((bot) => {
          const choice = loveBotRevealChoice(room, bot);
          loveLockReveal(room, bot.id, choice.index + 1, LOVE_HANDS[choice.key].name, choice.publicAs ? LOVE_CARD_TYPES[choice.publicAs].name : '');
        });
        if (room.phase === 'reveal' || room.phase === 'reveal_confirm') break;
        continue;
      }
      const bot = room.players[room.turn];
      if (!bot || !bot.isBot || (room.phase !== 'bet1' && room.phase !== 'bet2')) break;
      loveBotBet(room, bot);
    }
  }
  function loveCardView(card, hidden) {
    if (!card || hidden) return { hidden: true };
    const info = LOVE_CARD_TYPES[card.type] || LOVE_CARD_TYPES.S; return { type: card.type, name: info.name, color: info.color, emoji: info.emoji, hidden: false };
  }
  function loveView(room, viewerId, showPrivate, quote) {
    const phaseLabels = { waiting: '等待第二位玩家', bet1: '第一轮下注', reveal: '锁定公开牌与宣告', reveal_confirm: '等待同步公开确认', bet2: '第二轮下注', round_result: '本轮摊牌', finished: '整场结算' };
    const resultVisible = room.status === 'finished' || room.phase === 'round_result';
    const players = room.players.map((player, index) => {
      const cards = player.hand.map((card, cardIndex) => {
        const pveFaceUp = room.mode === 'pve' && !player.isBot;
        const visible = resultVisible || cardIndex === player.revealedIndex || pveFaceUp || (showPrivate && player.id === viewerId);
        return loveCardView(card, !visible);
      });
      return {
        name: roomPlayerName(player), chips: player.chips, streetBet: player.streetBet, committed: player.roundCommitted,
        isBot: player.isBot, isGuest: isGuestPlayer(player), isTurn: room.status === 'playing' && ['reveal', 'reveal_confirm'].indexOf(room.phase) < 0 && room.turn === index,
        isStarter: room.starter === index, folded: player.folded, cards, revealedIndex: player.revealedIndex,
        declaration: player.declarationName, declarationLabel: player.autoShowdown ? '全押摊牌' : '', publicAs: player.publicAs ? LOVE_CARD_TYPES[player.publicAs].name : '', revealLocked: !!player.revealLocked,
        roundsWon: player.roundsWon, affectionDelta: player.affectionDelta, coinReward: player.coinReward
      };
    });
    const help = room.status === 'waiting' ? ['.爱赢一切 加入', '.爱赢一切 机器人', '.爱赢一切 开始']
      : room.phase === 'reveal' ? room.mode === 'pve'
        ? ['手牌常亮：.爱赢一切 公开 <1-3> <牌型>', '公共骗子牌时在末尾追加指定牌型']
        : ['请私聊骰娘：.爱赢一切 公开 <1-3> <牌型>', '双方锁定后回群发送“.爱赢一切 确认公开”']
        : room.phase === 'reveal_confirm' ? ['双方均已私聊锁定', '.爱赢一切 确认公开（群内）']
        : room.phase === 'round_result' ? ['牌面会停留在本轮结算', '.爱赢一切 下一轮']
          : room.status === 'finished' ? ['再输入 .爱赢一切 返回菜单', '.爱赢一切 状态 可复看结果']
            : [room.mode === 'pve' ? '你的手牌在群图中常亮' : '.爱赢一切 看牌（私聊）', '.爱赢一切 过牌/跟注/加注 <总额>/全押/弃牌'];
    const lines = [`总第${room.round}轮 · 本副牌${room.cycleRound || 0}/${room.maxRounds}轮 · ${phaseLabels[room.phase] || room.phase} · 底池${room.pot + room.carryPot}`];
    players.forEach((player) => lines.push(`${player.name} ${player.chips}筹码 · 本阶段${player.streetBet} · ${player.declaration || '尚未宣告'}`));
    return {
      kind: 'love', privateView: !!showPrivate, privateHandCommand: lovePrivateHandCommand(room, viewerId), title: '爱赢一切 · 1v1牌桌', subtitle: `${phaseLabels[room.phase] || '等待行动'} · 每7轮压力洗牌并减半筹码`,
      loveTable: {
        status: room.status, phase: room.phase, phaseLabel: phaseLabels[room.phase] || '', round: room.round, cycleRound: room.cycleRound || 0, shuffleCount: room.shuffleCount || 0, maxRounds: room.maxRounds,
        deckCount: room.deck.length, discardCount: room.discard.length, pot: room.pot, carryPot: room.carryPot,
        currentBet: room.currentBet, currentName: room.players[room.turn] ? room.players[room.turn].name : '',
        common: loveCardView(room.common, false), players, result: room.roundResult, ranking: room.ranking || [], help
      },
      lines, quote: quote || ''
    };
  }
  function loveMenuView(quote) {
    const cards = Object.keys(LOVE_CARD_TYPES).map((type) => ({ type, name: LOVE_CARD_TYPES[type].name, color: LOVE_CARD_TYPES[type].color, emoji: LOVE_CARD_TYPES[type].emoji, count: LOVE_CARD_TYPES[type].count }));
    return {
      kind: 'love', title: '爱赢一切', subtitle: '韩国综艺牌局 · 1v1 · 入场100游戏币',
      loveTable: { status: 'menu', phase: 'menu', phaseLabel: '选择模式', round: 0, maxRounds: 7, deckCount: 49, discardCount: 0, pot: 0, carryPot: 0, currentBet: 0, currentName: '', common: null, players: [], cards, ranking: [], help: ['.爱赢一切 人机', '.爱赢一切 开房 / 加入 / 开始', '.爱赢一切 教程 1'] },
      lines: ['人机模式：.爱赢一切 人机', '多人模式：.爱赢一切 开房 / 加入 / 开始', '完整规则：.爱赢一切 教程 1'], quote: quote || '骗子牌能兑现合法宣告，但同牌型相遇时会反噬持有者。'
    };
  }
  function loveTutorialView(pageValue) {
    const pages = [
      [
        ['49张牌库', '剪刀18、石头12、布12、爱6、骗子1；每轮使用过的牌全部废弃。', '牌库'],
        ['四张成型', '每人先拿2张暗牌，场中公开1张公共牌；首轮下注后再补1张暗牌。', '发牌'],
        ['两段下注', '通常在补牌与宣告后再下注；若第一轮全押被跟注，则补牌后直接摊牌。', '下注'],
        ['轮间停留', '摊牌图不会自动消失；确认双方完整牌面后发送“.爱赢一切 下一轮”。', '复盘']
      ],
      [
        ['1爱 < 1对', '含1张爱牌通常是最小牌；无爱且两张相同为1对。', '1-2'],
        ['3条 < 2对', '无爱时三张相同为3条，两组对子为2对。', '3-4'],
        ['2爱 < 混合', '两张爱为2爱；剪刀、石头、布、爱各一张为混合。', '5-6'],
        [`4条 < 3爱 < ${LOVE_HANDS.winsAll.name}`, '无爱四张相同为4条；三张爱为3爱，四张爱最高。', '7-9'],
        ['同牌型比较', '除1爱外按石头克剪刀、剪刀克布、布克石头比较；相同部分抵消后再比剩余牌。', '克制']
      ],
      [
        ['锁定后同步公开', '补牌后各自锁定1张手牌与宣告；可宣告任何能由两张公开牌补成的牌型，不必与暗牌相符。', '诈唬'],
        ['私人骗子牌', '持有骗子牌时，只要公共牌与公开手牌能够支持该牌型，宣告就会成为真实牌型。', '万能'],
        ['骗子反噬', '同牌型只有一方持私人骗子牌时，骗子方直接输；持骗子牌落败还要额外支付最多5筹码。', '代价'],
        ['公共骗子牌', '双方各自指定公共骗子牌为剪刀、石头、布或爱，并在公开手牌时一并声明。', '指定']
      ],
      [
        ['先手规则', '首轮随机先手；后续由上一轮败方先手，平局则交换先手。', '顺序'],
        ['压力洗牌', '每打满七轮或牌库不足时换一副完整牌库，双方筹码向上取整减半后继续。', '续局'],
        ['结算', '胜者返还200游戏币；胜利好感增加较少，失败扣除更多。游客正常游玩但不留档。', '奖励'],
        ['公开与终局', 'PvE手牌常亮并直接锁定；PvP双方私聊锁定，回群确认后同时公开。只有一方筹码归零才结算整场。', '终局']
      ]
    ];
    const page = tutorialPage(pageValue, pages.length); const entries = pages[page - 1].map((item) => ({ title: item[0], description: item[1], tag: item[2] }));
    return {
      kind: 'love', title: '爱赢一切 · 完整教程', subtitle: `第 ${page}/${pages.length} 页 · 发送“.爱赢一切 教程 ${page === pages.length ? 1 : page + 1}”继续`,
      tutorial: { page, total: pages.length, entries }, lines: entries.map((entry) => `${entry.title}：${entry.description}`),
      quote: page === 2 ? '牌型不是单纯的数字大小；同型还要按石头剪刀布逐项比较。' : page === 3 ? '骗子牌越自由，暴露后的风险也越高。' : '每轮结果会停留，确认后再进入下一轮。'
    };
  }

  // -------------------- 古墓夺宝 --------------------
  const TOMB_TREASURES = [
    { id: 'crown', name: '暮金法老冠', icon: 'crown', rarity: '传世', weight: 4, magic: 5, scarabs: 0, value: 25, copies: 2 },
    { id: 'diamond', name: '夜咒黑钻', icon: 'gem', rarity: '传世', weight: 1, magic: 0, scarabs: 4, value: 22, copies: 2 },
    { id: 'coffin', name: '太阳金棺残板', icon: 'coffin', rarity: '传世', weight: 8, magic: 0, scarabs: 0, value: 30, copies: 2 },
    { id: 'eye', name: '荷鲁斯秘眼', icon: 'eye', rarity: '传世', weight: 2, magic: 4, scarabs: 2, value: 21, copies: 2 },
    { id: 'scepter', name: '断裂王权杖', icon: 'scepter', rarity: '珍奇', weight: 5, magic: 3, scarabs: 0, value: 20, copies: 3 },
    { id: 'mask', name: '黄金葬仪面具', icon: 'mask', rarity: '珍奇', weight: 6, magic: 1, scarabs: 1, value: 22, copies: 3 },
    { id: 'idol', name: '碧玉猫神像', icon: 'idol', rarity: '珍奇', weight: 3, magic: 2, scarabs: 0, value: 16, copies: 3 },
    { id: 'beetle_gem', name: '虫珀宝石', icon: 'gem', rarity: '珍奇', weight: 1, magic: 0, scarabs: 3, value: 17, copies: 3 },
    { id: 'tablet_star', name: '星象石板', icon: 'tablet', rarity: '珍奇', weight: 4, magic: 4, scarabs: 0, value: 15, copies: 3 },
    { id: 'ankh', name: '生命之符', icon: 'ankh', rarity: '珍奇', weight: 2, magic: 3, scarabs: 1, value: 14, copies: 3 },
    { id: 'sun_half', name: '日轮半壁', icon: 'tablet', rarity: '稀有', weight: 3, magic: 1, scarabs: 0, value: 7, copies: 4 },
    { id: 'moon_half', name: '月轮半壁', icon: 'tablet', rarity: '稀有', weight: 2, magic: 2, scarabs: 0, value: 7, copies: 4 },
    { id: 'priest_scroll', name: '祭司封印卷', icon: 'scroll', rarity: '稀有', weight: 2, magic: 3, scarabs: 1, value: 9, copies: 5 },
    { id: 'moon_lamp', name: '月银祭灯', icon: 'lamp', rarity: '稀有', weight: 3, magic: 2, scarabs: 0, value: 10, copies: 5 },
    { id: 'perfume', name: '王妃香膏瓶', icon: 'jar', rarity: '稀有', weight: 1, magic: 1, scarabs: 0, value: 11, copies: 5 },
    { id: 'coin_roll', name: '古王钱币卷', icon: 'coin', rarity: '稀有', weight: 3, magic: 0, scarabs: 0, value: 12, copies: 5 },
    { id: 'blade', name: '青铜礼仪刃', icon: 'blade', rarity: '稀有', weight: 4, magic: 0, scarabs: 0, value: 11, copies: 5 },
    { id: 'scarab_heart', name: '圣甲虫之心', icon: 'scarab', rarity: '稀有', weight: 3, magic: 1, scarabs: 3, value: 13, copies: 4 },
    { id: 'incense', name: '驱虫圣香', icon: 'jar', rarity: '稀有', weight: 1, magic: 2, scarabs: 0, value: 8, copies: 4, effect: 'insectSafe', effectGroup: 'insectSafe', effectText: '不增加圣甲虫，提供稳定法力', nextRoundOnly: false },
    { id: 'spring', name: '净化泉水壶', icon: 'jar', rarity: '普通', weight: 2, magic: 4, scarabs: 0, value: 3, copies: 5 },
    { id: 'papyrus', name: '莎草航路图', icon: 'scroll', rarity: '普通', weight: 1, magic: 1, scarabs: 0, value: 7, copies: 7 },
    { id: 'necklace', name: '彩釉项链', icon: 'gem', rarity: '普通', weight: 2, magic: 0, scarabs: 0, value: 8, copies: 7 },
    { id: 'bronze_mirror', name: '蒙尘铜镜', icon: 'mirror', rarity: '普通', weight: 3, magic: 0, scarabs: 0, value: 8, copies: 7 },
    { id: 'blue_bowl', name: '蓝釉莲纹碗', icon: 'jar', rarity: '普通', weight: 2, magic: 0, scarabs: 0, value: 6, copies: 8 },
    { id: 'wood_shield', name: '朽木仪仗盾', icon: 'shield', rarity: '普通', weight: 1, magic: 0, scarabs: 0, value: 3, copies: 8 },
    { id: 'new_book', name: '抄写员新册', icon: 'book', rarity: '普通', weight: 3, magic: 0, scarabs: 0, value: 5, copies: 8 },
    { id: 'old_book', name: '风化旧册', icon: 'book', rarity: '残旧', weight: 0, magic: 0, scarabs: 0, value: 1, copies: 8 },
    { id: 'linen', name: '亚麻裹布', icon: 'cloth', rarity: '残旧', weight: 0, magic: 0, scarabs: 0, value: 2, copies: 8 },
    { id: 'pottery', name: '彩陶碎片', icon: 'jar', rarity: '残旧', weight: 1, magic: 0, scarabs: 0, value: 2, copies: 9 },
    { id: 'wood_charm', name: '无字木护符', icon: 'ankh', rarity: '残旧', weight: 1, magic: 0, scarabs: 0, value: 4, copies: 7 },
    { id: 'sandstone', name: '刻字砂岩', icon: 'tablet', rarity: '残旧', weight: 5, magic: 0, scarabs: 0, value: 4, copies: 6 },
    { id: 'cracked_jar', name: '蛛网裂口罐', icon: 'jar', rarity: '诅咒', weight: 4, magic: 0, scarabs: 1, value: 0, copies: 5 },
    { id: 'hive', name: '虫巢泥俑', icon: 'scarab', rarity: '诅咒', weight: 2, magic: 0, scarabs: 3, value: 6, copies: 4 },
    { id: 'whisper', name: '低语骨笛', icon: 'scepter', rarity: '诅咒', weight: 1, magic: 4, scarabs: 0, value: 8, copies: 4 },
    { id: 'chain', name: '墓门铜锁链', icon: 'chain', rarity: '诅咒', weight: 7, magic: 0, scarabs: 0, value: 9, copies: 4 },
    { id: 'ash', name: '祭坛余烬盒', icon: 'coffin', rarity: '诅咒', weight: 2, magic: 2, scarabs: 2, value: 5, copies: 5 },
    { id: 'royal_token', name: '王令玄铁牌', icon: 'scepter', rarity: '机关', weight: 6, magic: 2, scarabs: 1, value: 8, copies: 2, effect: 'nextFirst', effectGroup: 'initiative', effectText: '沉重代价·下一轮抢占首选', nextRoundOnly: true },
    { id: 'desert_compass', name: '逆沙铜罗盘', icon: 'compass', rarity: '机关', weight: 3, magic: 5, scarabs: 1, value: 8, copies: 2, effect: 'nextEarly', effectGroup: 'initiative', effectText: '高法代价·下轮最迟第二选', nextRoundOnly: true },
    { id: 'treasure_seeker', name: '星砂寻宝仪', icon: 'compass', rarity: '机关', weight: 5, magic: 4, scarabs: 2, value: 7, copies: 2, effect: 'treasureBiasHigh', effectGroup: 'treasureBias', effectText: '下一轮高价值宝物更易出现', nextRoundOnly: true },
    { id: 'false_avenue', name: '冥府歧途大道碑', icon: 'tablet', rarity: '机关', weight: 2, magic: 0, scarabs: 0, value: 18, copies: 2, effect: 'treasureBiasLow', effectGroup: 'treasureBias', effectText: '本轮高价值·下轮珍宝更难出现', nextRoundOnly: true },
    { id: 'weight_last_curse', name: '坍塌末席咒碑', icon: 'tablet', rarity: '诅咒', weight: 4, magic: 2, scarabs: 1, value: 9, copies: 2, effect: 'lastByStat', effectStat: 'weight', effectGroup: 'roundCurse', effectText: '下轮重量最高者最后选择', nextRoundOnly: true },
    { id: 'magic_last_curse', name: '失控末席咒碑', icon: 'tablet', rarity: '诅咒', weight: 3, magic: 4, scarabs: 1, value: 9, copies: 2, effect: 'lastByStat', effectStat: 'magic', effectGroup: 'roundCurse', effectText: '下轮法力最高者最后选择', nextRoundOnly: true },
    { id: 'scarab_last_curse', name: '虫潮末席咒碑', icon: 'scarab', rarity: '诅咒', weight: 3, magic: 1, scarabs: 3, value: 10, copies: 2, effect: 'lastByStat', effectStat: 'scarabs', effectGroup: 'roundCurse', effectText: '下轮圣甲虫最高者最后选择', nextRoundOnly: true },
    { id: 'value_last_curse', name: '贪欲末席咒碑', icon: 'gem', rarity: '诅咒', weight: 3, magic: 2, scarabs: 1, value: 13, copies: 2, effect: 'lastByStat', effectStat: 'value', effectGroup: 'roundCurse', effectText: '下轮价值最高者最后选择', nextRoundOnly: true },
    { id: 'echo_urn', name: '贪欲回声瓮', icon: 'jar', rarity: '机关', weight: 4, magic: 3, scarabs: 1, value: 7, copies: 2, effect: 'valueEcho', effectGroup: 'valueEcho', effectAmount: 5, effectText: '下一件取得宝物价值+5', nextRoundOnly: true },
    { id: 'four_seal_tablet', name: '四席封选碑', icon: 'tablet', rarity: '机关', weight: 4, magic: 2, scarabs: 0, value: 14, copies: 2, effect: 'poolShrink', effectGroup: 'poolSize', effectText: '下一轮待选宝物减少为4件', nextRoundOnly: true }
  ];
  const TOMB_BOT_STYLES = [
    { value: 1.18, weight: 1.15, magic: 1.05, deficit: 1.35, noise: 4 },
    { value: 0.94, weight: 1.65, magic: 1.5, deficit: 1.5, noise: 2 },
    { value: 1.32, weight: 0.82, magic: 0.92, deficit: 1.05, noise: 6 },
    { value: 1.03, weight: 1.22, magic: 1.75, deficit: 1.18, noise: 3 }
  ];
  function tombMode(value) { return ['耐久', '耐久局', 'durable', 'long'].indexOf(String(value || '').toLowerCase()) >= 0 ? 'durable' : 'normal'; }
  function tombModeName(mode) { return mode === 'durable' ? '耐久局' : '常规局'; }
  function tombPlayer(id, name, isBot, paid) {
    const bot = !!isBot; const entryPaid = bot ? false : paid !== false;
    return { id, name, isBot: bot, paid: entryPaid, guest: !bot && !entryPaid, bag: [], extractedValue: 0, survivals: 0, bestEscape: 0, gameResults: [], style: bot ? Math.floor(Math.random() * TOMB_BOT_STYLES.length) : -1, nextRoundPriority: 0, pendingValueEcho: 0, affectionDelta: 0, coinReward: 0 };
  }
  function createTombRoom(ownerId, ownerName, ownerPaid, mode) {
    return {
      game: 'tomb', mode: tombMode(mode), status: 'waiting', entry: ENTRY.tomb, ownerId,
      players: [tombPlayer(ownerId, ownerName, false, ownerPaid)], gameNo: 0, maxGames: tombMode(mode) === 'durable' ? 4 : 1,
      round: 0, maxRounds: 8, order: [], pickIndex: 0, treasures: [], swallowed: null, nextTreasureBias: '', nextRoundCurse: '', nextTreasureCount: 5, turnStartedAt: 0,
      lastAction: '古墓石门尚未开启。', settlement: null, ranking: null, createdAt: nowMs(), updatedAt: nowMs(), settled: false
    };
  }
  function tombTotals(player) {
    const bag = player && Array.isArray(player.bag) ? player.bag : [];
    let weight = 0; let magic = 0; let scarabs = 0; let value = 0;
    bag.forEach((item) => {
      weight += int(item.weight, 0); magic += int(item.magic, 0); scarabs += int(item.scarabs, 0); value += int(item.value, 0);
    });
    scarabs = Math.max(0, scarabs);
    const setBonus = bag.some((item) => item.id === 'sun_half') && bag.some((item) => item.id === 'moon_half') ? 12 : 0;
    return { weight, magic, scarabs, value: value + setBonus, baseValue: value, setBonus };
  }
  function tombTreasureWeight(item, bias) {
    let multiplier = 1;
    if (bias === 'high') {
      if (item.value >= 20) multiplier = 3.4; else if (item.value >= 15) multiplier = 2.4; else if (item.value >= 10) multiplier = 1.35; else if (item.value <= 4) multiplier = 0.42;
    } else if (bias === 'low') {
      if (item.value >= 20) multiplier = 0.2; else if (item.value >= 15) multiplier = 0.38; else if (item.value >= 10) multiplier = 0.72; else if (item.value <= 4) multiplier = 2.6; else if (item.value <= 8) multiplier = 1.55;
    }
    return item.copies * multiplier;
  }
  function tombDrawTreasure(slot, usedEffectGroups, room, bias) {
    const available = TOMB_TREASURES.filter((item) => (!item.effectGroup || !usedEffectGroups[item.effectGroup]) && !(item.nextRoundOnly && room.round >= room.maxRounds));
    const total = available.reduce((sum, item) => sum + tombTreasureWeight(item, bias), 0); let roll = Math.random() * total; let selected = available[available.length - 1];
    for (let index = 0; index < available.length; index++) { roll -= tombTreasureWeight(available[index], bias); if (roll < 0) { selected = available[index]; break; } }
    if (selected.effectGroup) usedEffectGroups[selected.effectGroup] = true;
    return Object.assign({ slot, claimedById: '', claimedByName: '', claimedOrder: 0 }, selected);
  }
  function tombCurrentPlayer(room) { const seat = room.order[room.pickIndex]; return Number.isFinite(seat) ? room.players[seat] : null; }
  function tombStartRound(room) {
    const swallowedText = room.swallowed ? `上一轮【${room.swallowed.name}】被古墓吞噬。` : '';
    room.round += 1; const offset = (room.round - 1) % room.players.length;
    room.order = Array.from({ length: room.players.length }, (_, index) => (offset + index) % room.players.length);
    let priorityText = '';
    const prioritySeat = room.players.findIndex((player) => int(player.nextRoundPriority, 0) > 0);
    if (prioritySeat >= 0) {
      const priority = int(room.players[prioritySeat].nextRoundPriority, 0); const currentIndex = room.order.indexOf(prioritySeat);
      if (priority === 1 && currentIndex > 0) { room.order.splice(currentIndex, 1); room.order.unshift(prioritySeat); }
      else if (priority === 2 && currentIndex > 1) { room.order.splice(currentIndex, 1); room.order.splice(1, 0, prioritySeat); }
      priorityText = `${room.players[prioritySeat].name}的机关宝物改变了本轮顺位。`;
    }
    room.players.forEach((player) => { player.nextRoundPriority = 0; });
    const curse = String(room.nextRoundCurse || ''); let curseText = '';
    if (['weight', 'magic', 'scarabs', 'value'].indexOf(curse) >= 0) {
      const values = room.players.map((player) => tombTotals(player)[curse]); const maximum = Math.max.apply(null, values);
      const cursedSeats = room.order.filter((seat) => values[seat] === maximum);
      room.order = room.order.filter((seat) => cursedSeats.indexOf(seat) < 0).concat(cursedSeats);
      const labels = { weight: '重量', magic: '法力', scarabs: '圣甲虫', value: '价值' };
      curseText = `${cursedSeats.map((seat) => room.players[seat].name).join('、')}的${labels[curse]}最高，被诅咒推至末位。`;
    }
    room.nextRoundCurse = '';
    const bias = String(room.nextTreasureBias || ''); const biasText = bias === 'high' ? '寻宝仪让高价值宝物更易现身。' : bias === 'low' ? '歧途大道令高价值宝物更难现身。' : '';
    room.nextTreasureBias = '';
    const treasureCount = clamp(int(room.nextTreasureCount, 5), 4, 5); room.nextTreasureCount = 5;
    const usedEffectGroups = {}; room.pickIndex = 0; room.treasures = Array.from({ length: treasureCount }, (_, index) => tombDrawTreasure(index + 1, usedEffectGroups, room, bias));
    room.turnStartedAt = nowMs(); const current = tombCurrentPlayer(room);
    const poolText = treasureCount < 5 ? `封选碑令本轮仅出现${treasureCount}件宝物。` : '';
    const effectText = [priorityText, curseText, biasText, poolText].filter(Boolean).join(' ');
    room.lastAction = `${swallowedText}${swallowedText ? ' ' : ''}${effectText}${effectText ? ' ' : ''}第${room.round}轮宝物落地，${current ? current.name : '摸金者'}获得首选。`; room.updatedAt = nowMs();
  }
  function tombStartExpedition(room) {
    room.gameNo += 1; room.round = 0; room.settlement = null; room.ranking = null; room.swallowed = null; room.nextTreasureBias = ''; room.nextRoundCurse = ''; room.nextTreasureCount = 5; room.status = 'playing';
    room.players.forEach((player) => { player.bag = []; player.death = ''; player.nextRoundPriority = 0; player.pendingValueEcho = 0; player.coinReward = 0; player.affectionDelta = 0; });
    tombStartRound(room);
  }
  function tombStart(room) {
    if (!room || room.status !== 'waiting') return '房间不在等待状态。';
    if (!room.players.length) return '房间里没有玩家。';
    while (room.players.length < 4) addRoomBot(room, 'tomb', 1);
    if (room.players.length !== 4) return '古墓固定需要四个席位。';
    room.gameNo = 0; room.players.forEach((player) => { player.extractedValue = 0; player.survivals = 0; player.bestEscape = 0; player.gameResults = []; });
    tombStartExpedition(room); return '';
  }
  function tombBotScore(room, player, treasure) {
    const style = TOMB_BOT_STYLES[clamp(int(player.style, 0), 0, TOMB_BOT_STYLES.length - 1)]; const before = tombTotals(player);
    const after = tombTotals({ bag: player.bag.concat([treasure]) }); const opponents = room.players.filter((other) => other.id !== player.id).map(tombTotals);
    const maxWeight = opponents.length ? Math.max.apply(null, opponents.map((total) => total.weight)) : 0;
    const maxMagic = opponents.length ? Math.max.apply(null, opponents.map((total) => total.magic)) : 0;
    const progress = room.round / room.maxRounds; let score = (after.value - before.value) * style.value;
    if (after.weight >= maxWeight && after.weight > 0) score -= (5 + progress * 16 + (after.weight - maxWeight) * 2.2) * style.weight;
    if (after.magic >= maxMagic && after.magic > 0) score -= (4 + progress * 13 + (after.magic - maxMagic) * 2) * style.magic;
    score -= Math.max(0, after.scarabs - after.magic) * (5 + progress * 8) * style.deficit;
    score += Math.max(0, before.scarabs - before.magic) - Math.max(0, after.scarabs - after.magic);
    if (treasure.id === 'sun_half' && player.bag.some((item) => item.id === 'moon_half')) score += 13;
    if (treasure.id === 'moon_half' && player.bag.some((item) => item.id === 'sun_half')) score += 13;
    if (treasure.effect === 'nextFirst' && room.round < room.maxRounds) score += 12 * (1 - progress * 0.45);
    else if (treasure.effect === 'nextEarly' && room.round < room.maxRounds) score += 7 * (1 - progress * 0.35);
    else if (treasure.effect === 'treasureBiasHigh' && room.round < room.maxRounds) score += 10 * style.value * (1 - progress * 0.35);
    else if (treasure.effect === 'treasureBiasLow' && room.round < room.maxRounds) score -= 8 * style.value * (1 - progress * 0.35);
    else if (treasure.effect === 'lastByStat' && room.round < room.maxRounds) {
      const stat = treasure.effectStat; const totals = room.players.map(tombTotals); const maximum = Math.max.apply(null, totals.map((total) => total[stat]));
      const targetsPlayer = after[stat] >= maximum; score += targetsPlayer ? -8 : 4;
    }
    else if (treasure.effect === 'valueEcho' && room.round < room.maxRounds) score += int(treasure.effectAmount, 0) * style.value;
    else if (treasure.effect === 'poolShrink' && room.round < room.maxRounds) score += 11 * style.value * (1 - progress * 0.25);
    return score + (Math.random() - 0.5) * style.noise;
  }
  function tombChooseBotTreasure(room, player) {
    return room.treasures.filter((item) => !item.claimedById).sort((left, right) => tombBotScore(room, player, right) - tombBotScore(room, player, left))[0];
  }
  function tombPick(room, id, selector, forcedBy) {
    if (!room || room.status !== 'playing') return '当前没有正在进行的轮转夺宝。';
    const player = tombCurrentPlayer(room); if (!player || player.id !== id) return `还没轮到你，当前是 ${player ? player.name : '未知席位'}。`;
    const slot = int(selector, 0); const treasure = room.treasures.find((item) => item.slot === slot && !item.claimedById);
    if (!treasure) return '请输入当前仍在地面的宝物序号，例如“.古墓 拿 2”。';
    const bagTreasure = Object.assign({}, treasure); delete bagTreasure.claimedById; delete bagTreasure.claimedByName; delete bagTreasure.claimedOrder;
    let echoText = '';
    if (int(player.pendingValueEcho, 0) > 0 && treasure.effect !== 'valueEcho') {
      bagTreasure.value += int(player.pendingValueEcho, 0); bagTreasure.valueBonus = int(player.pendingValueEcho, 0);
      echoText = ` 回声令其价值+${player.pendingValueEcho}。`; player.pendingValueEcho = 0;
    }
    if (treasure.effect === 'nextFirst') player.nextRoundPriority = 1;
    else if (treasure.effect === 'nextEarly') player.nextRoundPriority = 2;
    else if (treasure.effect === 'treasureBiasHigh') room.nextTreasureBias = 'high';
    else if (treasure.effect === 'treasureBiasLow') room.nextTreasureBias = 'low';
    else if (treasure.effect === 'lastByStat') room.nextRoundCurse = treasure.effectStat;
    else if (treasure.effect === 'valueEcho') player.pendingValueEcho = Math.max(int(player.pendingValueEcho, 0), int(treasure.effectAmount, 0));
    else if (treasure.effect === 'poolShrink') room.nextTreasureCount = 4;
    treasure.claimedById = player.id; treasure.claimedByName = player.name; treasure.claimedOrder = room.pickIndex + 1;
    player.bag.push(bagTreasure); room.pickIndex += 1;
    const triggerText = treasure.effectText ? ` 效果启动：${treasure.effectText}。` : '';
    room.lastAction = (forcedBy ? `${forcedBy}替超时的${player.name}触发随机摸金，获得【${treasure.name}】。` : `${player.name}拿走了【${treasure.name}】。`) + triggerText + echoText;
    room.updatedAt = nowMs();
    if (room.pickIndex >= room.players.length) {
      room.swallowed = room.treasures.length > room.players.length && int(room.nextTreasureCount, 5) >= 5 ? room.treasures.find((item) => !item.claimedById) || null : null;
      if (room.round >= room.maxRounds) tombSettleExpedition(room);
      else tombStartRound(room);
    } else room.turnStartedAt = nowMs();
    return '';
  }
  function tombSettleExpedition(room) {
    const active = room.players.slice(); const stages = []; const deaths = {};
    const maxWeight = Math.max.apply(null, active.map((player) => tombTotals(player).weight));
    const weightDeaths = active.filter((player) => tombTotals(player).weight === maxWeight); weightDeaths.forEach((player) => { deaths[player.id] = '塌方'; player.death = '塌方'; });
    stages.push({ name: '超重塌方', detail: `${weightDeaths.map((player) => player.name).join('、')}以${maxWeight}重量并列最高，被深渊吞没。`, victims: weightDeaths.map((player) => player.id) });
    const afterWeight = active.filter((player) => !deaths[player.id]); let magicDeaths = [];
    if (afterWeight.length) {
      const maxMagic = Math.max.apply(null, afterWeight.map((player) => tombTotals(player).magic)); magicDeaths = afterWeight.filter((player) => tombTotals(player).magic === maxMagic);
      magicDeaths.forEach((player) => { deaths[player.id] = '反噬'; player.death = '反噬'; });
      stages.push({ name: '法力反噬', detail: `${magicDeaths.map((player) => player.name).join('、')}以${maxMagic}法力冠绝余众，灵魂遭到反噬。`, victims: magicDeaths.map((player) => player.id) });
    } else stages.push({ name: '法力反噬', detail: '塌方后已无人能够接受审判。', victims: [] });
    const afterMagic = active.filter((player) => !deaths[player.id]); const scarabDeaths = afterMagic.filter((player) => { const total = tombTotals(player); return total.magic < total.scarabs; });
    scarabDeaths.forEach((player) => { deaths[player.id] = '虫灾'; player.death = '虫灾'; });
    stages.push({ name: '万虫噬心', detail: scarabDeaths.length ? `${scarabDeaths.map((player) => player.name).join('、')}的法力不足以压制圣甲虫。` : '剩余摸金者都压制住了圣甲虫。', victims: scarabDeaths.map((player) => player.id) });
    const survivors = active.filter((player) => !deaths[player.id]);
    active.forEach((player) => {
      const totals = tombTotals(player); const survived = !deaths[player.id]; const escaped = survived ? totals.value : 0;
      if (survived) { player.extractedValue += escaped; player.survivals += 1; player.bestEscape = Math.max(player.bestEscape, escaped); }
      player.gameResults.push({ gameNo: room.gameNo, survived, escapedValue: escaped, death: deaths[player.id] || '', totals, treasureCount: player.bag.length });
    });
    room.settlement = { gameNo: room.gameNo, stages, survivors: survivors.map((player) => player.id), allDead: !survivors.length };
    room.status = room.gameNo < room.maxGames ? 'between_games' : 'finished'; room.updatedAt = nowMs();
    room.lastAction = survivors.length ? `${survivors.map((player) => player.name).join('、')}成功带出宝物。` : '四位摸金者全部葬身古墓。';
    if (room.status === 'finished') tombFinish(room);
  }
  function tombFinish(room) {
    const ranked = room.players.slice().sort((left, right) => right.extractedValue - left.extractedValue || right.survivals - left.survivals || right.bestEscape - left.bestEscape || room.players.indexOf(left) - room.players.indexOf(right));
    room.ranking = []; const topValue = ranked.length ? ranked[0].extractedValue : 0; const topTied = ranked.filter((player) => player.extractedValue === topValue).length > 1;
    ranked.forEach((player, index) => {
      let reward = 0; let affectionDelta = 0; let outcome = 'loss';
      if (room.mode === 'normal') {
        const last = player.gameResults[player.gameResults.length - 1]; reward = last && last.survived ? Math.min(300, last.escapedValue * 2) : 0;
        const isTop = !!last && last.survived && player.extractedValue === topValue; outcome = isTop ? (topTied ? 'draw' : 'win') : last && last.survived ? 'draw' : 'loss'; affectionDelta = outcome === 'win' ? affectionRules().win : outcome === 'loss' ? affectionRules().loss : 0;
      } else {
        reward = index === 0 ? 300 : index === 1 ? 100 : 0; outcome = index === 0 ? 'win' : 'loss'; affectionDelta = rankedAffection(index, ranked.length);
      }
      player.coinReward = 0; player.affectionDelta = 0;
      if (isSettlementEligible(player)) {
        const profile = loadProfile(player.id, player.name); profile.coins += reward; changeAffection(profile, affectionDelta);
        const deathCounts = player.gameResults.reduce((counts, result) => { if (result.death === '塌方') counts.weight++; else if (result.death === '反噬') counts.magic++; else if (result.death === '虫灾') counts.scarab++; return counts; }, { weight: 0, magic: 0, scarab: 0 });
        recordGame(profile, 'tomb', outcome, player.extractedValue, reward - ENTRY.tomb, {
          affectionDelta, survivals: player.survivals, escapedValue: player.extractedValue, bestEscape: player.bestEscape,
          durableWin: room.mode === 'durable' && index === 0 ? 1 : 0,
          treasures: player.gameResults.reduce((sum, result) => sum + (result.survived ? result.treasureCount : 0), 0),
          weightDeaths: deathCounts.weight, magicDeaths: deathCounts.magic, scarabDeaths: deathCounts.scarab
        });
        player.coinReward = reward; player.affectionDelta = affectionDelta;
      }
      room.ranking.push({ rank: index + 1, id: player.id, name: player.name, value: player.extractedValue, survivals: player.survivals, bestEscape: player.bestEscape, coinReward: player.coinReward, affectionDelta: player.affectionDelta, guest: isGuestPlayer(player) });
    });
    room.settled = true;
  }
  function tombRunBots(room) {
    let guard = 0;
    while (room && room.status === 'playing' && guard++ < 100) {
      const bot = tombCurrentPlayer(room); if (!bot || !bot.isBot) break;
      const treasure = tombChooseBotTreasure(room, bot); if (!treasure) break;
      tombPick(room, bot.id, treasure.slot, '');
    }
  }
  function tombSkip(room, callerId, callerName) {
    if (!room || room.status !== 'playing') return '当前没有可跳过的摸金轮次。';
    const caller = room.players.find((player) => player.id === callerId && !player.isBot); if (!caller) return '只有本房间的真人玩家可以代为跳过。';
    const current = tombCurrentPlayer(room); if (!current || current.isBot) return '机器人会自动选择，不需要跳过。';
    if (current.id === callerId) return '不能替自己跳过，请直接发送“.古墓 拿 <序号>”。';
    const elapsed = nowMs() - Number(room.turnStartedAt || 0); if (elapsed < 60000) return `还需等待 ${Math.ceil((60000 - elapsed) / 1000)} 秒，其他玩家才能代为跳过。`;
    const treasure = pick(room.treasures.filter((item) => !item.claimedById)); return treasure ? tombPick(room, current.id, treasure.slot, callerName) : '地面已经没有宝物。';
  }
  function tombPlayerView(player, room) {
    const totals = tombTotals(player); const result = player.gameResults && player.gameResults.length ? player.gameResults[player.gameResults.length - 1] : null;
    const activeStatus = [`${player.bag.length}/${room.maxRounds}件`];
    if (int(player.nextRoundPriority, 0) === 1) activeStatus.push('首选待命'); else if (int(player.nextRoundPriority, 0) === 2) activeStatus.push('保二待命');
    if (int(player.pendingValueEcho, 0) > 0) activeStatus.push(`回声+${player.pendingValueEcho}`);
    return {
      name: roomPlayerName(player), isBot: player.isBot, isGuest: isGuestPlayer(player), isTurn: room.status === 'playing' && tombCurrentPlayer(room) && tombCurrentPlayer(room).id === player.id,
      weight: totals.weight, magic: totals.magic, scarabs: totals.scarabs, value: totals.value, setBonus: totals.setBonus,
      extractedValue: player.extractedValue, survivals: player.survivals, status: room.status === 'playing' ? activeStatus.join('·') : result ? result.survived ? `带出${result.escapedValue}价值` : `${result.death}淘汰` : '等待入墓',
      bag: player.bag.map((item) => ({ name: item.name, icon: item.icon, rarity: item.rarity }))
    };
  }
  function tombView(room, quote) {
    const current = room.status === 'playing' ? tombCurrentPlayer(room) : null; const remaining = current ? Math.max(0, 60 - Math.floor((nowMs() - Number(room.turnStartedAt || 0)) / 1000)) : 0;
    const ranking = (room.ranking || []).map((row) => ({ rank: row.rank, name: `${row.name}${row.guest ? '（游客）' : ''}`, value: row.value, survivals: row.survivals, reward: row.coinReward, affectionDelta: row.affectionDelta }));
    const scene = {
      mode: room.status, format: room.mode, formatName: tombModeName(room.mode), gameNo: room.gameNo, maxGames: room.maxGames, round: room.round, maxRounds: room.maxRounds,
      currentName: current ? current.name : '', secondsRemaining: remaining, order: room.order.map((seat) => room.players[seat] ? room.players[seat].name : ''),
      poolSize: room.treasures.length, nextPoolSize: clamp(int(room.nextTreasureCount, 5), 4, 5),
      treasures: room.treasures.map((item) => ({ slot: item.slot, name: item.name, icon: item.icon, rarity: item.rarity, weight: item.weight, magic: item.magic, scarabs: item.scarabs, value: item.value, effectText: item.effectText || '', claimedById: item.claimedById || '', claimedByName: item.claimedByName || '', claimedOrder: item.claimedOrder || 0 })),
      swallowed: room.swallowed ? { name: room.swallowed.name, icon: room.swallowed.icon } : null, players: room.players.map((player) => tombPlayerView(player, room)),
      lastAction: room.lastAction, settlement: room.settlement, ranking,
      help: room.status === 'waiting' ? ['.古墓 加入', '.古墓 开始', '.古墓 加机器人', '.古墓 取消'] : room.status === 'playing' ? ['.古墓 拿 <序号>', '.古墓 跳过（超时后由他人使用）', '.古墓 状态'] : room.status === 'between_games' ? ['.古墓 下一墓'] : ['再次发送“.古墓”返回玩法首页']
    };
    const lines = [`${tombModeName(room.mode)} · 第${room.gameNo}/${room.maxGames}墓 · 第${room.round}/${room.maxRounds}轮`, room.lastAction];
    if (current) lines.push(`当前：${current.name} · 发送“.古墓 拿 <序号>”`);
    room.players.forEach((player) => { const total = tombTotals(player); lines.push(`${roomPlayerName(player)} 重${total.weight} 法${total.magic} 虫${total.scarabs} 值${total.value} · 累计带出${player.extractedValue}`); });
    if (room.settlement) room.settlement.stages.forEach((stage) => lines.push(`${stage.name}：${stage.detail}`));
    ranking.forEach((row) => lines.push(`#${row.rank} ${row.name} · 带出${row.value} · 生还${row.survivals}墓${row.reward ? ` · +${row.reward}币` : ''}${row.affectionDelta ? ` · ${signedValue(row.affectionDelta)}好感` : ''}`));
    return { kind: 'tomb', title: `古墓夺宝 · ${tombModeName(room.mode)}`, subtitle: room.status === 'waiting' ? `等待入墓 · ${room.players.length}/4席` : room.status === 'playing' ? `第${room.gameNo}/${room.maxGames}墓 · 第${room.round}/${room.maxRounds}轮` : room.status === 'between_games' ? `第${room.gameNo}墓审判完成 · 等待开启下一墓` : '最终审判完成', tombScene: scene, lines, quote: quote || '' };
  }
  function tombMenuView(quote) {
    return {
      kind: 'tomb', title: '古墓夺宝', subtitle: '四席轮转摸金 · 三重诅咒审判',
      tombScene: { mode: 'menu', format: 'normal', formatName: '玩法选择', gameNo: 0, maxGames: 1, round: 0, maxRounds: 8, currentName: '', secondsRemaining: 0, order: [], poolSize: 5, nextPoolSize: 5, treasures: [], players: [], ranking: [], lastAction: '每轮五件宝物，四人各取一件，最后一件永沉古墓。', help: ['.古墓 人机 常规 / 耐久', '.古墓 开房 常规 / 耐久', '.古墓 教程 1'] },
      lines: ['常规局：100币 · 1墓8轮 · 通常每轮5件，封选碑会让下一轮变为4件 · 幸存者按价值×2回收，最高300币', '耐久局：100币 · 4墓各8轮 · 累计带出价值排名，第一300、第二100', '多人不足四席时，由风格各异的摸金机器人补齐。'], quote: quote || '重量、法力和圣甲虫都可能让最耀眼的宝物变成催命符。'
    };
  }
  function tombTutorialView(pageValue) {
    const pages = [
      [
        ['五宝四取', '通常每轮落下5件宝物，四个席位按顺序各拿1件；若上一轮取得四席封选碑，下一轮只落下4件，不再产生吞噬物。', '轮抽'],
        ['八轮轮转', '每墓进行8轮；首选席位逐轮后移，所有人各有两次首选机会。', '顺位'],
        ['四项属性', '重量和法力过高会遭淘汰；圣甲虫需要不低于其数量的法力压制；价值决定收益。', '属性'],
        ['限时跳过', '联机当前玩家超时1分钟后，其他在座真人可发送“.古墓 跳过”随机替选。', '超时']
      ],
      [
        ['超重塌方', '先淘汰总重量最高者；最高值并列时，并列者全部淘汰。', '第一审'],
        ['法力反噬', '只在剩余玩家中淘汰总法力最高者；并列最高同样全部淘汰。', '第二审'],
        ['万虫噬心', '继续检查剩余玩家；法力严格小于圣甲虫数量者全部淘汰。', '第三审'],
        ['组合与稳定属性', '日轮半壁与月轮半壁同时持有时价值+12；宝物属性均为非负，驱虫圣香改为法力型稳定宝物。', '特殊'],
        ['机关与诅咒', '机关可改变下轮顺位、价值倾向或候选池大小；四席封选碑令下一轮只出现4件，末席诅咒令下轮指定属性最高者最后选。', '功能']
      ],
      [
        ['常规回收', '100游戏币入场，完成1墓8轮；每位幸存者回收带出价值×2，单人最高300。', '常规'],
        ['耐久排名', '100游戏币入场，连续4墓；每墓只有幸存者的价值计入累计榜，第一得300、第二得100。', '耐久'],
        ['混合组局', '人机、真人联机以及真人与机器人混合均可；开房后不足四席会在开始时补机器人。', '模式'],
        ['游客席位', '多人房余额不足仍可入座并正常游玩，但不会获得金币、好感或任何统计记录。', '游客']
      ]
    ];
    const page = tutorialPage(pageValue, pages.length); const entries = pages[page - 1].map((item) => ({ title: item[0], description: item[1], tag: item[2] }));
    return { kind: 'tomb', title: '古墓夺宝 · 完整教程', subtitle: `第${page}/${pages.length}页 · 发送“.古墓 教程 ${page === pages.length ? 1 : page + 1}”继续`, tutorial: { page, total: pages.length, entries }, lines: entries.map((entry) => `${entry.title}：${entry.description}`), quote: '真正的目标不是拿走最贵的宝物，而是带着它活着离开。' };
  }

  // -------------------- 刮刮乐 --------------------
  const SCRATCH_TYPES = ['幸运数字', '三同符号', '金库钥匙', '倍率寻宝'];
  const SCRATCH_DENOMS = [10, 50, 100, 500];
  const SCRATCH_MULTIPLIERS = [
    { value: 0, weight: 5500 }, { value: 0.5, weight: 1500 }, { value: 1, weight: 1800 },
    { value: 2, weight: 800 }, { value: 5, weight: 300 }, { value: 10, weight: 75 },
    { value: 20, weight: 20 }, { value: 50, weight: 4 }, { value: 100, weight: 1 }
  ];
  function weighted(items) {
    const total = items.reduce((sum, x) => sum + x.weight, 0); let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) { r -= items[i].weight; if (r < 0) return items[i].value; }
    return items[items.length - 1].value;
  }
  function makeScratchTicket(ownerId, denom, type) {
    const multiplier = weighted(SCRATCH_MULTIPLIERS); const prize = clamp(Math.floor(denom * multiplier), 0, denom * 100);
    const ticket = { ownerId, denom, type, prize, multiplier, cells: [], createdAt: nowMs() };
    if (type === '幸运数字') {
      const lucky = 1 + Math.floor(Math.random() * 20); ticket.lucky = lucky;
      for (let i = 0; i < 9; i++) ticket.cells.push({ symbol: String(1 + Math.floor(Math.random() * 20)), value: 0 });
      if (prize > 0) { const at = Math.floor(Math.random() * ticket.cells.length); ticket.cells[at] = { symbol: String(lucky), value: prize }; }
    } else if (type === '三同符号') {
      const symbols = ['星', '月', '花', '铃', '冠', '骰'];
      for (let i = 0; i < 9; i++) ticket.cells.push({ symbol: pick(symbols), value: 0 });
      if (prize > 0) { const symbol = pick(symbols); const spots = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 3); spots.forEach((at) => { ticket.cells[at] = { symbol, value: prize }; }); }
    } else if (type === '金库钥匙') {
      const symbols = ['铜钥匙', '银钥匙', '金钥匙', '空箱'];
      for (let i = 0; i < 6; i++) ticket.cells.push({ symbol: pick(symbols), value: 0 });
      if (prize > 0) ticket.cells[Math.floor(Math.random() * ticket.cells.length)] = { symbol: '金钥匙', value: prize };
    } else {
      const base = prize > 0 ? Math.max(1, Math.floor(prize / Math.max(1, multiplier))) : 0;
      ticket.cells = [{ symbol: `奖${base}`, value: base }, { symbol: `倍${multiplier}`, value: multiplier }, { symbol: prize > 0 ? '宝藏' : '落空', value: prize }];
    }
    return ticket;
  }
  function scratchView(ticket, revealed, quote) {
    const lines = [`面额 ${ticket.denom}  |  类型 ${ticket.type}  |  最高奖金 ${ticket.denom * 100}`];
    if (!revealed) lines.push('涂层完整，发送“.yan 刮刮 刮开”揭晓结果。');
    else {
      if (ticket.type === '幸运数字') lines.push(`幸运数字：${ticket.lucky}`);
      lines.push(`票面：${ticket.cells.map((c) => c.symbol).join('  |  ')}`);
      lines.push(ticket.prize > 0 ? `中奖 ${ticket.prize} 游戏币（${ticket.multiplier}倍）` : `本票未中奖${ticket.affectionDelta ? `  |  好感 ${signedValue(ticket.affectionDelta)}` : ''}`);
    }
    const meters = revealed ? [{ label: '奖金倍率', value: ticket.multiplier, min: 0, max: 100, text: `${ticket.multiplier}倍 · ${ticket.prize}币` }] : [];
    const scratchTicket = {
      denom: ticket.denom, type: ticket.type, revealed: !!revealed, maxPrize: ticket.denom * 100,
      prize: revealed ? ticket.prize : 0, multiplier: revealed ? ticket.multiplier : 0, affectionDelta: revealed ? int(ticket.affectionDelta, 0) : 0,
      lucky: revealed && ticket.lucky ? ticket.lucky : null, serial: String(ticket.createdAt || nowMs()).slice(-8),
      cells: ticket.cells.map((cell) => revealed ? { symbol: cell.symbol, value: cell.value, winning: cell.value > 0 } : { symbol: '', value: 0, winning: false })
    };
    return { kind: 'scratch', title: '骰娘刮刮乐', subtitle: '四种票面 · 单票奖金硬上限100倍', scratchTicket, meters, lines, quote: quote || '' };
  }
  function scratchMenuView(quote) {
    return {
      kind: 'scratch', title: '骰娘彩票与风险游戏', subtitle: '即开票 · 视频扑克 · 每日双色球 · 生死骰 · 九出十三归',
      lines: [
        '.刮刮 买 [面额] [类型]  |  .刮刮 刮开',
        '.yan 刮刮 买 [面额] [类型]  |  完整写法同样有效',
        '.刮刮 扑克 10/30/50  |  .视频扑克 10/30/50',
        '.双色球 单注/单组xN/机选N/批量多组  |  每期最多20注，每页显示6组',
        '.双色球 状态/历史/兑奖结果 [页码]  |  .双色球 兑奖',
        '.生死骰 简单/困难  |  押上全部游戏币',
        '.借款 申请  |  余额低于150时可借150，应还195',
        `即开票类型：${SCRATCH_TYPES.join(' / ')}`
      ], quote: quote || '双色球与生死骰不改变好感；借款会扣除好感，并在还款时恢复该笔损失的一半。'
    };
  }

  const LOTTERY_DRAW_HISTORY_KEY = 'aff.lottery.draw.history.v1';
  const LOTTERY_PRIZES = [
    { red: 5, blue: true, tier: '一等奖', prize: 1000 },
    { red: 5, blue: false, tier: '二等奖', prize: 500 },
    { red: 4, blue: true, tier: '三等奖', prize: 200 },
    { red: 4, blue: false, tier: '四等奖', prize: 80 },
    { red: 3, blue: true, tier: '五等奖', prize: 50 },
    { red: 3, blue: false, tier: '六等奖', prize: 20 },
    { red: 2, blue: true, tier: '六等奖', prize: 20 },
    { red: -1, blue: true, tier: '蓝球奖', prize: 10 }
  ];
  function lotteryDrawKey(issue) { return `aff.lottery.draw.v1:${issue}`; }
  function makeLotteryDraw(issue) {
    const red = shuffle(Array.from({ length: 15 }, (_, index) => index + 1)).slice(0, 5).sort((a, b) => a - b);
    return { issue, red, blue: 1 + Math.floor(Math.random() * 4), drawnAt: nowMs() };
  }
  function ensureLotteryDraw(issue, timestamp) {
    if (!issue || lotteryDrawAt(issue) > (timestamp == null ? nowMs() : timestamp)) return null;
    const key = lotteryDrawKey(issue); let draw = jsonGet(key, null);
    if (!draw) {
      draw = makeLotteryDraw(issue); jsonSet(key, draw);
      const history = jsonGet(LOTTERY_DRAW_HISTORY_KEY, []); const rows = Array.isArray(history) ? history : [];
      if (!rows.some((row) => row.issue === issue)) rows.push(draw);
      rows.sort((a, b) => String(a.issue).localeCompare(String(b.issue)));
      jsonSet(LOTTERY_DRAW_HISTORY_KEY, rows.slice(-60));
    }
    return draw;
  }
  function lotteryResult(ticket, draw) {
    const drawRed = Array.isArray(draw.red) ? draw.red : []; const redMatches = ticket.red.filter((value) => drawRed.indexOf(value) >= 0).length;
    const blueMatch = int(ticket.blue, 0) === int(draw.blue, -1); let tier = '未中奖'; let prize = 0;
    for (let i = 0; i < LOTTERY_PRIZES.length; i++) {
      const rule = LOTTERY_PRIZES[i];
      if ((rule.red < 0 || rule.red === redMatches) && rule.blue === blueMatch) { tier = rule.tier; prize = rule.prize; break; }
    }
    return { redMatches, blueMatch, tier, prize };
  }
  function lotteryHistoryRow(ticket, draw, status, timestamp) {
    const result = lotteryResult(ticket, draw);
    return {
      id: ticket.id, ticketId: ticket.id, issue: ticket.issue, red: ticket.red.slice(), blue: ticket.blue, count: clamp(int(ticket.count, 1), 1, 20),
      drawRed: draw.red.slice(), drawBlue: draw.blue, redMatches: result.redMatches, blueMatch: result.blueMatch,
      tier: status === 'expired' ? '已过期' : result.tier, prize: status === 'expired' ? 0 : result.prize * clamp(int(ticket.count, 1), 1, 20),
      status, resolvedAt: timestamp
    };
  }
  function reconcileLotteryTickets(p, timestamp) {
    const time = timestamp == null ? nowMs() : timestamp; p.lottery = normalizeLotteryData(p.lottery);
    const kept = []; let expired = 0;
    p.lottery.tickets.forEach((ticket) => {
      const draw = ensureLotteryDraw(ticket.issue, time); const expiresAt = lotteryDrawAt(shiftDateKey(ticket.issue, 1));
      if (draw && time >= expiresAt) {
        p.lottery.history.push(lotteryHistoryRow(ticket, draw, 'expired', time)); expired += lotteryTicketCount(ticket);
      } else kept.push(ticket);
    });
    p.lottery.tickets = kept; p.lottery.history = p.lottery.history.slice(-60);
    return expired;
  }
  function lotteryTicketView(ticket, draw) {
    const result = draw ? lotteryResult(ticket, draw) : null;
    const count = clamp(int(ticket.count, 1), 1, 20);
    return {
      id: ticket.id, issue: ticket.issue, red: ticket.red.slice(), blue: ticket.blue, cost: ticket.cost, count,
      drawRed: draw ? draw.red.slice() : [], drawBlue: draw ? draw.blue : 0,
      redMatches: result ? result.redMatches : 0, blueMatch: result ? result.blueMatch : false,
      tier: result ? result.tier : '待开奖', prize: result ? result.prize * count : 0
    };
  }
  function lotteryTicketCount(ticket) { return clamp(int(ticket && ticket.count, 1), 1, 20); }
  const LOTTERY_PAGE_SIZE = 6;
  function lotteryPage(value, totalItems) {
    const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / LOTTERY_PAGE_SIZE));
    const page = clamp(int(value, 1), 1, totalPages);
    return { page, totalPages, offset: (page - 1) * LOTTERY_PAGE_SIZE };
  }
  function lotteryRandomSelection() {
    return {
      red: shuffle(Array.from({ length: 15 }, (_, index) => index + 1)).slice(0, 5).sort((a, b) => a - b),
      blue: 1 + Math.floor(Math.random() * 4)
    };
  }
  function parseLotterySelection(tokens) {
    const cleaned = (Array.isArray(tokens) ? tokens : []).filter((value) => ['+', '蓝', '蓝球'].indexOf(String(value)) < 0);
    if (cleaned.length !== 6 || cleaned.some((value) => !/^\d+$/.test(String(value)))) return { error: '每注需要依次输入5个红球和1个蓝球。' };
    const red = cleaned.slice(0, 5).map((value) => int(value, 0)).sort((a, b) => a - b); const blue = int(cleaned[5], 0);
    if (red.some((value) => value < 1 || value > 15) || new Set(red).size !== 5 || blue < 1 || blue > 4) return { error: '红球必须是1-15内的5个不重复号码，蓝球必须是1-4。' };
    return { red, blue };
  }
  function parseLotterySelections(args) {
    const op = String(args[0] || '').toLowerCase(); let tokens = args.slice(); let repeat = 1; let randomCount = 0;
    if (['买', '购买', 'buy'].indexOf(op) >= 0) tokens = args.slice(1);
    else if (['批量', '多注', 'batch'].indexOf(op) >= 0) tokens = args.slice(1);
    // 兼容“.双色球 买 批量 …”这类自然输入：去掉购买前缀后，仍允许再写一次批量标记。
    if (['批量', '多注', 'batch'].indexOf(String(tokens[0] || '').toLowerCase()) >= 0) tokens = tokens.slice(1);
    if (['随机', '机选', 'random'].indexOf(String(tokens[0] || '').toLowerCase()) >= 0) {
      randomCount = clamp(int(tokens[1], 1), 1, 20);
      if (tokens.length > 2 || !/^\d+$/.test(String(tokens[1] == null ? '1' : tokens[1]))) return { error: '机选数量请填写1-20，例如“.双色球 机选 10”。' };
      return { selections: Array.from({ length: randomCount }, () => lotteryRandomSelection()) };
    }
    const multipleIndex = tokens.findIndex((value) => /^x\d+$/i.test(String(value)) || /^\d+注$/.test(String(value)));
    if (multipleIndex >= 0) {
      const marker = String(tokens[multipleIndex]); repeat = clamp(int(marker.replace(/\D/g, ''), 1), 1, 20); tokens.splice(multipleIndex, 1);
    }
    const delimiters = ['/', '|', ';', '；']; const groups = []; let current = [];
    tokens.forEach((token) => {
      if (delimiters.indexOf(String(token)) >= 0) { if (current.length) groups.push(current); current = []; }
      else current.push(token);
    });
    if (current.length) groups.push(current);
    if (!groups.length) return { error: '请输入至少一注号码。' };
    const selections = [];
    for (let index = 0; index < groups.length; index++) {
      const parsed = parseLotterySelection(groups[index]); if (parsed.error) return parsed;
      selections.push({ red: parsed.red.slice(), blue: parsed.blue, count: repeat });
    }
    if (selections.reduce((sum, selection) => sum + lotteryTicketCount(selection), 0) > 20) return { error: '单次最多购买20注彩票。' };
    return { selections };
  }
  function lotterySceneView(mode, p, options) {
    const opts = options || {}; const time = nowMs(); const issue = opts.issue || nextLotteryIssue(time);
    const pending = p.lottery.tickets.map((ticket) => lotteryTicketView(ticket, ensureLotteryDraw(ticket.issue, time))).reverse();
    const globalHistory = jsonGet(LOTTERY_DRAW_HISTORY_KEY, []); const history = p.lottery.history.slice().reverse();
    const sourceTickets = Array.isArray(opts.tickets) ? opts.tickets : pending; const ticketPage = lotteryPage(opts.page, sourceTickets.length);
    const historyPage = lotteryPage(opts.page, history.length); const drawRows = (Array.isArray(globalHistory) ? globalHistory : []).slice().reverse();
    const drawPage = lotteryPage(opts.page, drawRows.length); const pageInfo = mode === 'history' ? historyPage : ticketPage;
    const scene = {
      mode, issue, price: clamp(seal.ext.getIntConfig(ext, '双色球单注价格'), 1, 10000),
      drawAt: lotteryDrawAt(issue), expiresAt: lotteryDrawAt(shiftDateKey(issue, 1)), status: opts.status || '',
      selectedRed: opts.ticket ? opts.ticket.red : [], selectedBlue: opts.ticket ? opts.ticket.blue : 0,
      drawnRed: opts.draw ? opts.draw.red : [], drawnBlue: opts.draw ? opts.draw.blue : 0,
      redMatches: opts.result ? opts.result.redMatches : 0, blueMatch: opts.result ? opts.result.blueMatch : false,
      tier: opts.result ? opts.result.tier : '', prize: opts.result ? opts.result.prize : 0,
      totalPrize: Math.max(0, int(opts.totalPrize, 0)), totalTickets: mode === 'history' ? history.reduce((sum, ticket) => sum + lotteryTicketCount(ticket), 0) : sourceTickets.reduce((sum, ticket) => sum + lotteryTicketCount(ticket), 0), totalRows: mode === 'history' ? history.length : sourceTickets.length,
      page: pageInfo.page, totalPages: pageInfo.totalPages, pageSize: LOTTERY_PAGE_SIZE,
      tickets: sourceTickets.slice(ticketPage.offset, ticketPage.offset + LOTTERY_PAGE_SIZE),
      history: history.slice(historyPage.offset, historyPage.offset + LOTTERY_PAGE_SIZE),
      draws: drawRows.slice(drawPage.offset, drawPage.offset + LOTTERY_PAGE_SIZE),
      prizeTable: LOTTERY_PRIZES.map((row) => ({ label: row.red < 0 ? '仅中蓝球' : `${row.red}红${row.blue ? '+蓝' : ''}`, tier: row.tier, prize: row.prize }))
    };
    const lines = [`第 ${issue} 期  |  开奖 ${formatLocalTime(scene.drawAt)}  |  单注 ${scene.price} 币`];
    if (mode === 'menu') lines.push('从1-15选择5个不重复红球，再从1-4选择1个蓝球。', '.双色球 1 2 3 4 5 1 x5  |  同组倍投只显示一行x5', '.双色球 机选 10  |  多组号码用 / 分隔');
    else if (mode === 'ticket') lines.push(`本次购买 ${Math.max(1, int(opts.purchaseCount, 1))} 注  |  本期共 ${scene.totalTickets} 注 / ${sourceTickets.length} 组`, `当前第 ${scene.page}/${scene.totalPages} 页 · .双色球 状态 ${scene.page + 1 > scene.totalPages ? 1 : scene.page + 1}`);
    else if (mode === 'result') lines.push(`本次兑奖 ${scene.totalTickets} 注 / ${sourceTickets.length} 组  |  奖金合计 ${scene.totalPrize}`, `当前第 ${scene.page}/${scene.totalPages} 页 · .双色球 兑奖结果 ${scene.page + 1 > scene.totalPages ? 1 : scene.page + 1}`);
    else if (mode === 'history') lines.push(`个人记录 ${p.lottery.history.length} 条  |  累计奖金 ${p.lottery.totalPrize}`, `当前第 ${scene.page}/${scene.totalPages} 页 · .双色球 历史 ${scene.page + 1 > scene.totalPages ? 1 : scene.page + 1}`);
    else lines.push(`待处理 ${scene.totalTickets} 注 / ${sourceTickets.length} 组`, `当前第 ${scene.page}/${scene.totalPages} 页 · .双色球 状态 ${scene.page + 1 > scene.totalPages ? 1 : scene.page + 1}`);
    return { kind: 'scratch', title: 'YAN 双色球', subtitle: '每日18:00静默开奖 · 5红1蓝 · 不计算好感', lotteryScene: scene, lines, quote: opts.quote || '' };
  }
  function deathDiceView(mode, difficulty, outcome, p, settlement) {
    const hard = difficulty === '困难'; const stake = outcome ? outcome.stake : p.coins; const multiplier = hard ? 3 : 1.2;
    const scene = {
      mode, difficulty: hard ? '困难' : '简单', stake, multiplier, roll: outcome ? outcome.roll : 0,
      survived: outcome ? outcome.survived : false, payout: outcome ? outcome.payout : 0, balance: p.coins,
      faces: hard ? ['空白', '死亡', '死亡', '死亡', '死亡', '死亡'] : ['空白', '空白', '空白', '空白', '空白', '死亡'],
      loanRepaid: settlement ? settlement.repaid : 0, affectionRestored: settlement ? settlement.restored : 0
    };
    const lines = mode === 'menu' ? [
      '.生死骰 简单  |  5面空白、1面死亡，生还返还全部押注的1.2倍',
      '.生死骰 困难  |  1面空白、5面死亡，生还返还全部押注的3倍',
      '每次必须押上当前全部游戏币；无论结果如何都不改变好感。'
    ] : [`${scene.difficulty}模式  |  全额押注 ${stake}`, scene.survived ? `空白面 · 返还 ${scene.payout} · 当前余额 ${p.coins}` : '死亡面 · 游戏币归零'];
    return { kind: 'scratch', title: '生死骰', subtitle: 'All In · 一掷定生死 · 不计算好感', deathDiceScene: scene, lines, quote: outcome ? outcome.quote : '选择难度后立即投掷，不提供撤回。' };
  }
  function loanView(mode, p, details) {
    const loan = normalizeLoanData(p.loan); const outstanding = loan.loans.length; const debt = outstanding * 195;
    const nextPenalty = Math.max(0, seal.ext.getIntConfig(ext, '借款首次好感损失')) + outstanding * Math.max(0, seal.ext.getIntConfig(ext, '借款叠加好感损失'));
    const scene = {
      mode, balance: p.coins, affection: p.affection, eligible: p.coins < 150, outstanding, debt,
      threshold: outstanding ? 345 : 0, nextPenalty, borrowed: details ? int(details.borrowed, 0) : 0,
      affectionDelta: details ? int(details.affectionDelta, 0) : 0, repaid: details ? int(details.repaid, 0) : 0,
      restored: details ? int(details.restored, 0) : 0, totalBorrowed: loan.totalBorrowed,
      totalRepaid: loan.totalRepaid, totalAffectionLost: loan.totalAffectionLost, totalAffectionRestored: loan.totalAffectionRestored,
      lastSettlement: loan.lastSettlement
    };
    const lines = [
      `余额 ${p.coins}  |  未还 ${outstanding} 笔（${debt}币）`,
      outstanding ? '余额达到345时自动收回一笔195，并恢复该笔好感损失的50%。' : '余额低于150时可发送“.借款 申请”领取150游戏币。',
      `下一笔将扣好感 ${nextPenalty}  |  累计借入 ${loan.totalBorrowed}  |  累计归还 ${loan.totalRepaid}`
    ];
    return { kind: 'scratch', title: '骰娘借款处', subtitle: '九出十三归 · 到手150 · 每笔应还195', loanScene: scene, lines, quote: details && details.quote ? details.quote : '' };
  }

  // -------------------- 视频扑克 --------------------
  const VIDEO_POKER_BETS = [10, 30, 50];
  const VIDEO_POKER_JACKPOT_KEY = 'aff.videoPoker.jackpot.v1';
  const VIDEO_POKER_JACKS_PAYTABLE = [
    { key: 'royal', label: '皇家同花顺', multiplier: 600, rank: 100 },
    { key: 'straight_flush', label: '同花顺', multiplier: 37.5, rank: 90 },
    { key: 'four_kind', label: '四条', multiplier: 18.75, rank: 80 },
    { key: 'full_house', label: '葫芦', multiplier: 6.75, rank: 70 },
    { key: 'flush', label: '同花', multiplier: 4.5, rank: 60 },
    { key: 'straight', label: '顺子', multiplier: 3, rank: 50 },
    { key: 'three_kind', label: '三条', multiplier: 2.25, rank: 40 },
    { key: 'two_pair', label: '两对', multiplier: 1.5, rank: 30 },
    { key: 'jacks_or_better', label: 'J或更好', multiplier: 0.75, rank: 20 }
  ];
  const VIDEO_POKER_DEUCES_PAYTABLE = [
    { key: 'natural_royal', label: '天然皇家同花顺', multiplier: 595, rank: 110 },
    { key: 'four_deuces', label: '四张2', multiplier: 149, rank: 105 },
    { key: 'wild_royal', label: '狂野皇家同花顺', multiplier: 18.5, rank: 100 },
    { key: 'five_kind', label: '五条', multiplier: 11.25, rank: 90 },
    { key: 'straight_flush', label: '同花顺', multiplier: 6.75, rank: 80 },
    { key: 'four_kind', label: '四条', multiplier: 3.75, rank: 70 },
    { key: 'full_house', label: '葫芦', multiplier: 2.25, rank: 60 },
    { key: 'flush', label: '同花', multiplier: 1.5, rank: 50 },
    { key: 'straight', label: '顺子', multiplier: 1.5, rank: 40 },
    { key: 'three_kind', label: '三条', multiplier: 0.75, rank: 30 }
  ];
  function videoPokerRound(value) { return Math.round(Math.max(0, Number(value) || 0) * 100) / 100; }
  function videoPokerSessionKey(id) { return `aff.videoPoker.session.v1:${encodeURIComponent(id)}`; }
  function videoPokerJackpot() {
    const stored = jsonGet(VIDEO_POKER_JACKPOT_KEY, null);
    if (stored === null || !Number.isFinite(Number(stored)) || Number(stored) < 0) {
      jsonSet(VIDEO_POKER_JACKPOT_KEY, 1000);
      return 1000;
    }
    return videoPokerRound(Number(stored));
  }
  function videoPokerSetJackpot(value) {
    const amount = videoPokerRound(value); jsonSet(VIDEO_POKER_JACKPOT_KEY, amount); return amount;
  }
  function videoPokerFundJackpot(wager) {
    return videoPokerSetJackpot(videoPokerJackpot() + Math.max(0, Number(wager) || 0) * 0.1);
  }
  function videoPokerVariant(stake) { return stake === 30 ? '狂野的2' : stake === 50 ? '五手扑克' : 'J或更好'; }
  function videoPokerPaytable(stake) { return stake === 30 ? VIDEO_POKER_DEUCES_PAYTABLE : VIDEO_POKER_JACKS_PAYTABLE; }
  function videoPokerPayRow(table, key) {
    for (let i = 0; i < table.length; i++) if (table[i].key === key) return table[i];
    return null;
  }
  function videoPokerCardValue(card) {
    if (card && Number.isFinite(Number(card.value))) return clamp(int(card.value, 0), 2, 14);
    const index = POKER_RANKS.indexOf(String(card && card.rank || ''));
    return index >= 0 ? index + 2 : 2;
  }
  function videoPokerCard(card) {
    if (!card) return { suit: 'S', rank: '2', value: 2 };
    const value = videoPokerCardValue(card); const suit = POKER_SUITS.indexOf(card.suit) >= 0 ? card.suit : 'S';
    return { suit, rank: POKER_RANKS[value - 2], value };
  }
  function videoPokerStraightPossible(cards, wilds, sameSuit) {
    const naturals = cards.filter((card) => card.value !== 2);
    if (sameSuit && naturals.some((card) => card.suit !== sameSuit)) return false;
    const values = naturals.map((card) => card.value); if (new Set(values).size !== values.length) return false;
    const sequences = [[14, 5, 4, 3, 2]];
    for (let high = 6; high <= 14; high++) sequences.push([high, high - 1, high - 2, high - 3, high - 4]);
    return sequences.some((sequence) => values.every((value) => sequence.indexOf(value) >= 0) && sequence.filter((value) => values.indexOf(value) < 0).length <= wilds);
  }
  function videoPokerDeucesResult(rawCards) {
    const cards = rawCards.map(videoPokerCard); const wilds = cards.filter((card) => card.value === 2).length;
    const naturals = cards.filter((card) => card.value !== 2); const table = VIDEO_POKER_DEUCES_PAYTABLE;
    const counts = {}; naturals.forEach((card) => { counts[card.value] = (counts[card.value] || 0) + 1; });
    const countValues = Object.keys(counts).map((key) => counts[key]); const maxCount = countValues.length ? Math.max.apply(null, countValues) : 0;
    const sameSuit = naturals.length ? naturals[0].suit : 'S'; const flushPossible = naturals.every((card) => card.suit === sameSuit);
    const royal = [10, 11, 12, 13, 14]; const royalValues = naturals.map((card) => card.value);
    const royalPossible = flushPossible && new Set(royalValues).size === royalValues.length && royalValues.every((value) => royal.indexOf(value) >= 0) && royal.filter((value) => royalValues.indexOf(value) < 0).length <= wilds;
    let key = '';
    if (!wilds && royalPossible) key = 'natural_royal';
    else if (wilds === 4) key = 'four_deuces';
    else if (wilds > 0 && royalPossible) key = 'wild_royal';
    else if (maxCount + wilds >= 5) key = 'five_kind';
    else if (flushPossible && videoPokerStraightPossible(cards, wilds, sameSuit)) key = 'straight_flush';
    else if (maxCount + wilds >= 4) key = 'four_kind';
    else {
      let fullHouse = false;
      for (let trip = 3; trip <= 14 && !fullHouse; trip++) for (let pair = 3; pair <= 14 && !fullHouse; pair++) {
        if (trip === pair) continue;
        const tripCount = counts[trip] || 0; const pairCount = counts[pair] || 0;
        const outside = naturals.length - tripCount - pairCount;
        if (!outside && tripCount <= 3 && pairCount <= 2 && (3 - tripCount) + (2 - pairCount) === wilds) fullHouse = true;
      }
      if (fullHouse) key = 'full_house';
      else if (flushPossible) key = 'flush';
      else if (videoPokerStraightPossible(cards, wilds, '')) key = 'straight';
      else if (maxCount + wilds >= 3) key = 'three_kind';
    }
    const row = videoPokerPayRow(table, key);
    return row ? { key, name: row.label, multiplier: row.multiplier, rank: row.rank } : { key: 'none', name: '未成牌', multiplier: 0, rank: 0 };
  }
  function videoPokerJacksResult(rawCards) {
    const cards = rawCards.map(videoPokerCard); const evaluated = evaluateFive(cards); let key = '';
    if (evaluated.category === 8) key = evaluated.tie[0] === 14 ? 'royal' : 'straight_flush';
    else if (evaluated.category === 7) key = 'four_kind';
    else if (evaluated.category === 6) key = 'full_house';
    else if (evaluated.category === 5) key = 'flush';
    else if (evaluated.category === 4) key = 'straight';
    else if (evaluated.category === 3) key = 'three_kind';
    else if (evaluated.category === 2) key = 'two_pair';
    else if (evaluated.category === 1 && evaluated.tie[0] >= 11) key = 'jacks_or_better';
    const row = videoPokerPayRow(VIDEO_POKER_JACKS_PAYTABLE, key);
    if (row) return { key, name: row.label, multiplier: row.multiplier, rank: row.rank };
    return { key: 'none', name: evaluated.category === 1 ? 'J以下对子' : evaluated.name, multiplier: 0, rank: 0 };
  }
  function videoPokerEvaluate(cards, stake) { return stake === 30 ? videoPokerDeucesResult(cards) : videoPokerJacksResult(cards); }
  function videoPokerReviveTier(streak) {
    const round = Math.max(1, Math.min(13, Math.floor(Number(streak) || 0) + 1));
    return { round, rate: round <= 4 ? 0.5 : round <= 8 ? 0.75 : 1 };
  }
  function videoPokerReviveCost(pendingPrize, streak) {
    const tier = videoPokerReviveTier(streak);
    return Math.max(1, Math.ceil(Math.max(0, Number(pendingPrize) || 0) * tier.rate));
  }
  function videoPokerParsePositions(tokens, keepMode) {
    const raw = (tokens || []).join(' ').trim();
    if (['全部', '全留', '全换', '全部换', 'all'].indexOf(raw.toLowerCase()) >= 0) return [1, 2, 3, 4, 5];
    if (['不留', 'none'].indexOf(raw.toLowerCase()) >= 0) return keepMode ? [] : [1, 2, 3, 4, 5];
    const numbers = raw.match(/\d+/g) || []; if (!numbers.length) return null;
    const positions = numbers.map((value) => int(value, 0)); if (positions.some((value) => value < 1 || value > 5)) return null;
    return Array.from(new Set(positions)).sort((a, b) => a - b);
  }
  function videoPokerCreateSession(id, stake) {
    const deck = pokerDeck(); const initialHand = [];
    for (let i = 0; i < 5; i++) initialHand.push(deck.pop());
    return {
      version: 1, ownerId: id, stake, variant: videoPokerVariant(stake), phase: 'deal',
      initialHand, hand: initialHand.slice(), held: [false, false, false, false, false], deck,
      hands: [], results: [], totalPayout: 0, pendingPrize: 0, streak: 0,
      anchorCard: null, previousCard: null, drawnCard: null, guess: '', correct: null,
      reviveCost: 0, reviveRound: 0, reviveRate: 0, cashoutLocked: false,
      handsRecorded: false, finalized: false, createdAt: nowMs(), updatedAt: nowMs()
    };
  }
  function videoPokerDrawHand(initialHand, held, deck) {
    const hand = initialHand.map(videoPokerCard);
    for (let index = 0; index < 5; index++) if (!held[index]) hand[index] = videoPokerCard(deck.pop());
    return hand;
  }
  function videoPokerCompleteDraw(session) {
    const hands = [];
    if (session.stake === 50) {
      for (let index = 0; index < 5; index++) hands.push(videoPokerDrawHand(session.initialHand, session.held, shuffle(session.deck.slice())));
    } else {
      hands.push(videoPokerDrawHand(session.initialHand, session.held, session.deck));
      session.deck = session.deck.map(videoPokerCard);
    }
    const baseStake = session.stake === 50 ? 10 : session.stake;
    const results = hands.map((hand) => videoPokerEvaluate(hand, session.stake));
    const payouts = results.map((result) => videoPokerRound(baseStake * result.multiplier));
    session.hands = hands; session.hand = hands[0]; session.results = results; session.handPayouts = payouts;
    session.totalPayout = videoPokerRound(payouts.reduce((sum, value) => sum + value, 0));
    session.pendingPrize = session.totalPayout; session.phase = session.stake === 10 && session.totalPayout > 0 ? 'offer' : 'complete';
    session.updatedAt = nowMs(); return session;
  }
  function videoPokerRecordHands(p, session) {
    if (session.handsRecorded) return;
    const stats = p.stats.scratch || emptyGameStats(); const results = session.results || [];
    stats.videoPokerHands += results.length; stats.videoPokerHandsWon += results.filter((result) => result.multiplier > 0).length;
    results.forEach((result) => {
      if (result.rank > stats.videoPokerBestHandRank) {
        stats.videoPokerBestHandRank = result.rank; stats.videoPokerBestHand = result.name;
      }
    });
    session.handsRecorded = true; p.stats.scratch = stats; saveProfile(p);
  }
  function videoPokerFinalize(p, session, payout) {
    if (session.finalized) return { payout: 0, settlement: null };
    const award = Math.max(0, Math.floor(Number(payout) || 0)); const stats = p.stats.scratch || emptyGameStats();
    p.coins += award; stats.score += award; stats.best = Math.max(stats.best, award); stats.profit += award;
    stats.videoPokerWon += award; stats.videoPokerBestPayout = Math.max(stats.videoPokerBestPayout, award);
    if (award > session.stake) stats.wins += 1; else if (award === session.stake) stats.draws += 1; else stats.losses += 1;
    session.finalized = true; session.finalPayout = award; session.phase = 'complete'; p.stats.scratch = stats;
    return { payout: award, settlement: saveProfile(p) };
  }
  function videoPokerStatsData(p) {
    const stats = Object.assign(emptyGameStats(), p.stats.scratch || {});
    return {
      plays: stats.videoPokerPlays, hands: stats.videoPokerHands, handsWon: stats.videoPokerHandsWon,
      wagered: stats.videoPokerWagered, won: stats.videoPokerWon, profit: stats.videoPokerWon - stats.videoPokerWagered,
      bestPayout: stats.videoPokerBestPayout, bestHand: stats.videoPokerBestHand || '尚无中奖牌型',
      highLowWins: stats.videoPokerHighLowWins, bestStreak: stats.videoPokerBestStreak, revives: stats.videoPokerRevives,
      jackpots: stats.videoPokerJackpots, jackpotWon: stats.videoPokerJackpotWon
    };
  }
  function videoPokerView(p, session, options) {
    const opts = options || {}; const stake = session ? session.stake : int(opts.stake, 10); const stats = videoPokerStatsData(p);
    const reviveTier = videoPokerReviveTier(session ? session.streak : 0);
    let mode = opts.mode || (session ? session.phase === 'deal' ? 'deal' : session.phase === 'offer' || session.phase === 'complete' ? 'result' : session.phase === 'revive' ? 'revive' : 'gamble' : 'menu');
    const help = mode === 'menu' ? ['.视频扑克 10 / 30 / 50', '.刮刮 扑克 10 / 30 / 50', '.视频扑克 统计']
      : mode === 'deal' ? ['.视频扑克 保留 1,3,5', '.视频扑克 换 2,4', '.视频扑克 换 全部']
        : mode === 'gamble' ? ['.视频扑克 比大 / 比小', session && session.cashoutLocked ? '.视频扑克 放弃' : '.视频扑克 收下']
          : mode === 'revive' ? ['.视频扑克 复活', '.视频扑克 放弃']
            : mode === 'result' && session && session.phase === 'offer' ? ['.视频扑克 收下', '.视频扑克 翻牌'] : ['.视频扑克 10 / 30 / 50', '.视频扑克 统计'];
    const scene = {
      mode, variant: session ? session.variant : videoPokerVariant(stake), stake, phase: session ? session.phase : mode,
      paytable: videoPokerPaytable(stake).map((row) => ({ label: row.label, multiplier: row.multiplier })),
      initialHand: session ? session.initialHand : [], hand: session ? session.hand : [],
      hands: session ? session.hands : [], held: session ? session.held : [],
      handNames: session ? (session.results || []).map((result) => result.name) : [],
      handPayouts: session ? session.handPayouts || [] : [], totalPayout: session ? session.totalPayout : 0,
      pendingPrize: session ? session.pendingPrize : 0, finalPayout: session ? session.finalPayout || 0 : 0,
      jackpot: videoPokerJackpot(), jackpotAward: session ? session.jackpotAward || 0 : 0,
      anchorCard: session ? session.anchorCard : null, previousCard: session ? session.previousCard : null,
      drawnCard: session ? session.drawnCard : null, guess: session ? session.guess : '', correct: session ? session.correct : null,
      streak: session ? session.streak : 0,
      reviveCost: session && session.phase === 'revive' ? videoPokerReviveCost(session.pendingPrize, session.streak) : 0,
      reviveRound: session ? int(session.reviveRound, session.phase === 'revive' ? reviveTier.round : 0) : 0,
      reviveRate: session ? Math.max(0, Number(session.reviveRate) || (session.phase === 'revive' ? reviveTier.rate : 0)) : 0,
      cashoutLocked: Boolean(session && session.cashoutLocked),
      balance: p.coins, help, stats
    };
    const lines = [`Jackpot ${scene.jackpot.toFixed(2)}  |  当前余额 ${p.coins}`];
    if (mode === 'menu') lines.push('10币：J或更好 + 翻牌比大小', '30币：所有2均为万能牌，三条起奖', '50币：五手扑克，每手按10币计算');
    else if (mode === 'deal') lines.push(`已下注 ${stake}  |  选择要保留或更换的牌位。`);
    else if (mode === 'stats') lines.push(`累计 ${stats.plays} 局 / ${stats.hands} 手  |  中奖手 ${stats.handsWon}`, `投入 ${stats.wagered}  |  实收 ${stats.won}  |  净值 ${signedValue(stats.profit)}`, `最高 ${stats.bestPayout}  |  最佳 ${stats.bestHand}  |  翻牌最长 ${stats.bestStreak}`);
    else if (mode === 'gamble') lines.push(`待领 ${scene.pendingPrize.toFixed(2)}  |  连中 ${scene.streak}/13`, scene.cashoutLocked ? '复活锁定中：必须再猜中一轮后才能收下奖金。' : '猜中后奖金×1.3；相同点数也算失败。');
    else if (mode === 'revive') lines.push(`第${scene.reviveRound}轮猜错  |  ${Math.round(scene.reviveRate * 100)}%复活费 ${scene.reviveCost} 游戏币`, `复活后必须再猜中一轮才能收下；待领奖金 ${scene.pendingPrize.toFixed(2)} 不变。`);
    else lines.push(`牌型：${scene.handNames.join(' / ') || '未成牌'}  |  牌面奖金 ${scene.totalPayout.toFixed(2)}`, session && session.phase === 'offer' ? '奖金尚未入账：收下，或进入翻牌比大小。' : `实际入账 ${scene.finalPayout} 游戏币。`);
    return { kind: 'videoPoker', title: 'YAN 视频扑克', subtitle: `${scene.variant} · ${stake}币机台`, videoPokerScene: scene, lines, quote: opts.quote || '' };
  }
  async function handleVideoPoker(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const key = videoPokerSessionKey(id); const p = loadProfile(id, name);
    let session = jsonGet(key, null); const op = String(args[0] || '帮助').toLowerCase();
    if (['统计', '记录', 'stats'].indexOf(op) >= 0) return replyView(ctx, msg, videoPokerView(p, null, { mode: 'stats' }));
    const requestedStake = int(op, 0);
    if (VIDEO_POKER_BETS.indexOf(requestedStake) >= 0) {
      if (session && !session.finalized) return replyView(ctx, msg, videoPokerView(p, session, { quote: '当前牌局尚未完成，请先处理手中的牌。' }));
      if (!charge(p, requestedStake)) return replyView(ctx, msg, videoPokerView(p, null, { stake: requestedStake, quote: template(ctx, '文案_余额不足', { name }) }));
      videoPokerFundJackpot(requestedStake); session = videoPokerCreateSession(id, requestedStake);
      const stats = p.stats.scratch || emptyGameStats(); stats.plays += 1; stats.profit -= requestedStake;
      stats.videoPokerPlays += 1; stats.videoPokerWagered += requestedStake; p.stats.scratch = stats; saveProfile(p);
      jsonSet(key, session); return replyView(ctx, msg, videoPokerView(p, session, { quote: '五张牌已经发出，请决定保留哪些牌。' }));
    }
    if (!session) {
      const quote = requestedStake ? '视频扑克只接受10、30或50游戏币下注。' : '';
      return replyView(ctx, msg, videoPokerView(p, null, { mode: 'menu', quote }));
    }
    if (session.phase === 'deal' && ['保留', '留', 'hold', '换', '更换', 'draw'].indexOf(op) >= 0) {
      const keepMode = ['保留', '留', 'hold'].indexOf(op) >= 0; const positions = videoPokerParsePositions(args.slice(1), keepMode);
      if (!args.slice(1).join('').trim()) return replyView(ctx, msg, videoPokerView(p, session, { quote: '请给出1至5号牌位，或输入“换 全部”。' }));
      if (!positions) return replyView(ctx, msg, videoPokerView(p, session, { quote: '牌位只能填写1至5，可用逗号或空格分隔。' }));
      session.held = [1, 2, 3, 4, 5].map((position) => keepMode ? positions.indexOf(position) >= 0 : positions.indexOf(position) < 0);
      videoPokerCompleteDraw(session); videoPokerRecordHands(p, session);
      if (session.phase === 'offer') {
        jsonSet(key, session); return replyView(ctx, msg, videoPokerView(p, session, { quote: '本手有奖：可以直接收下，也可以翻牌挑战。' }));
      }
      const finalized = videoPokerFinalize(p, session, session.totalPayout); clearKey(key);
      return replyView(ctx, msg, videoPokerView(p, session, { quote: finalized.payout > 0 ? `本局已入账 ${finalized.payout} 游戏币。` : '本局没有形成可返奖牌型。' }));
    }
    if (session.phase === 'offer' && ['翻牌', 'double', '比牌'].indexOf(op) >= 0) {
      session.anchorCard = videoPokerCard(session.deck.pop()); session.previousCard = null; session.drawnCard = null;
      session.guess = ''; session.correct = null; session.phase = 'gamble'; session.updatedAt = nowMs(); jsonSet(key, session);
      return replyView(ctx, msg, videoPokerView(p, session, { quote: '基准牌已经翻开，猜下一张更大还是更小。' }));
    }
    if ((session.phase === 'offer' || session.phase === 'gamble') && ['收下', '领取', 'cash', 'collect'].indexOf(op) >= 0) {
      if (session.phase === 'gamble' && session.cashoutLocked) {
        return replyView(ctx, msg, videoPokerView(p, session, { quote: '本轮刚刚复活，必须再猜中一轮后才能收下奖金；也可以放弃本局奖金。' }));
      }
      const finalized = videoPokerFinalize(p, session, session.pendingPrize); clearKey(key);
      return replyView(ctx, msg, videoPokerView(p, session, { quote: `已收下 ${finalized.payout} 游戏币。` }));
    }
    if (session.phase === 'gamble' && ['比大', '大', '高', 'higher', '比小', '小', '低', 'lower'].indexOf(op) >= 0) {
      const guessHigh = ['比大', '大', '高', 'higher'].indexOf(op) >= 0; const previous = videoPokerCard(session.anchorCard);
      const drawn = videoPokerCard(session.deck.pop()); const correct = guessHigh ? drawn.value > previous.value : drawn.value < previous.value;
      session.previousCard = previous; session.drawnCard = drawn; session.guess = guessHigh ? '比大' : '比小'; session.correct = correct;
      if (correct) {
        const unlockedAfterRevive = Boolean(session.cashoutLocked);
        session.pendingPrize = videoPokerRound(session.pendingPrize * 1.3); session.streak += 1; session.anchorCard = drawn;
        session.cashoutLocked = false; session.reviveRound = 0; session.reviveRate = 0;
        const stats = p.stats.scratch || emptyGameStats(); stats.videoPokerHighLowWins += 1; stats.videoPokerBestStreak = Math.max(stats.videoPokerBestStreak, session.streak); p.stats.scratch = stats;
        if (session.streak >= 13) {
          const pool = videoPokerJackpot(); const share = videoPokerRound(pool / 2); const bonus = Math.floor(share);
          videoPokerSetJackpot(pool - share); session.jackpotAward = bonus; session.jackpotShare = share;
          stats.videoPokerJackpots += 1; stats.videoPokerJackpotWon += bonus; p.stats.scratch = stats;
          const finalized = videoPokerFinalize(p, session, Math.floor(session.pendingPrize) + bonus); clearKey(key);
          return replyView(ctx, msg, videoPokerView(p, session, { quote: `连续命中13次，Jackpot追加 ${bonus} 游戏币！本局共入账 ${finalized.payout}。` }));
        }
        saveProfile(p); session.updatedAt = nowMs(); jsonSet(key, session);
        return replyView(ctx, msg, videoPokerView(p, session, { quote: unlockedAfterRevive ? `猜中！复活锁定已解除，现在可以收下 ${session.pendingPrize.toFixed(2)} 游戏币或继续挑战。` : `猜中！待领奖金提升到 ${session.pendingPrize.toFixed(2)}。` }));
      }
      const tier = videoPokerReviveTier(session.streak);
      session.phase = 'revive'; session.reviveRound = tier.round; session.reviveRate = tier.rate;
      session.reviveCost = videoPokerReviveCost(session.pendingPrize, session.streak); session.updatedAt = nowMs(); jsonSet(key, session);
      return replyView(ctx, msg, videoPokerView(p, session, { quote: drawn.value === previous.value ? `点数相同也算失败；第${tier.round}轮可按${Math.round(tier.rate * 100)}%支付 ${session.reviveCost} 游戏币复活。` : `猜错了；第${tier.round}轮可按${Math.round(tier.rate * 100)}%支付 ${session.reviveCost} 游戏币复活，或放弃本局。` }));
    }
    if (session.phase === 'revive' && ['复活', 'revive'].indexOf(op) >= 0) {
      const tier = videoPokerReviveTier(session.streak); const reviveCost = videoPokerReviveCost(session.pendingPrize, session.streak);
      session.reviveRound = tier.round; session.reviveRate = tier.rate; session.reviveCost = reviveCost;
      if (p.coins < reviveCost) {
        jsonSet(key, session);
        return replyView(ctx, msg, videoPokerView(p, session, { quote: `复活需要额外支付 ${reviveCost} 游戏币；当前余额 ${p.coins}，待领奖金不会被扣除。` }));
      }
      p.coins -= reviveCost; session.anchorCard = videoPokerCard(session.drawnCard);
      session.previousCard = null; session.drawnCard = null; session.guess = ''; session.correct = null;
      session.reviveCost = 0; session.cashoutLocked = true; session.phase = 'gamble'; session.updatedAt = nowMs();
      const stats = p.stats.scratch || emptyGameStats(); stats.videoPokerRevives += 1; stats.videoPokerWagered += reviveCost; stats.profit -= reviveCost; p.stats.scratch = stats; saveProfile(p); jsonSet(key, session);
      return replyView(ctx, msg, videoPokerView(p, session, { quote: `已按第${tier.round}轮${Math.round(tier.rate * 100)}%费率支付 ${reviveCost} 游戏币复活；必须再猜中一轮后才能收下奖金。` }));
    }
    if ((session.phase === 'offer' || session.phase === 'gamble' || session.phase === 'revive') && ['放弃', '结束', 'giveup'].indexOf(op) >= 0) {
      const finalized = videoPokerFinalize(p, session, 0); clearKey(key);
      return replyView(ctx, msg, videoPokerView(p, session, { quote: `本局奖金已放弃，实际入账 ${finalized.payout}。` }));
    }
    return replyView(ctx, msg, videoPokerView(p, session, { quote: session.phase === 'deal' ? '请选择保留或更换的牌位。' : session.phase === 'revive' ? '当前只能选择复活或放弃。' : '请按图片下方提示继续操作。' }));
  }

  // -------------------- 钓鱼 --------------------
  const PONDS = {
    '小鱼塘': {
      cost: 10, baseRisk: 0.08, values: [4, 8, 15, 30], sizes: [[0.04, 0.35], [0.25, 2.5], [1.2, 8], [4, 45]], fish: [
        ['麦穗鱼', '白条鱼', '鳑鲏', '泥鳅', '青鳉', '棒花鱼', '沙塘鳢', '子陵吻虾虎鱼'],
        ['鲫鱼', '鲤鱼', '黄颡鱼', '罗非鱼', '团头鲂', '鲮鱼', '黄尾鲴', '月鳢'],
        ['锦鲤', '乌鳢', '翘嘴鲌', '大口鲶', '鳡鱼', '鳤鱼', '赤鲈', '金线鲃'],
        ['老甲鱼', '金色锦鲤', '巨型鳄雀鳝', '镜鲤鱼王', '暹罗巨鲤', '湄公河巨鲶', '巨骨舌鱼', '匙吻鲟']
      ]
    },
    '江水': {
      cost: 50, baseRisk: 0.15, values: [20, 45, 100, 250], sizes: [[0.08, 0.9], [0.8, 7], [3, 28], [15, 180]], fish: [
        ['鳊鱼', '马口鱼', '赤眼鳟', '餐条', '宽鳍鱲', '光唇鱼', '中华倒刺鲃', '铜鱼'],
        ['鲈鱼', '青鱼', '草鱼', '鲢鱼', '鳙鱼', '黄河鲤', '江鳕', '黑龙江茴鱼'],
        ['鳜鱼', '长江鲟', '胭脂鱼', '鳗鲡', '松江鲈', '多鳞白甲鱼', '圆口铜鱼', '岩鲤'],
        ['江豚影子', '白鲟幻影', '巨型鲶鱼', '川陕哲罗鲑', '六须鲶', '坦克鸭嘴', '巨魾', '鳄鱼火箭']
      ]
    },
    '大海': {
      cost: 100, baseRisk: 0.22, values: [45, 120, 300, 800], sizes: [[0.1, 1.8], [1, 14], [8, 140], [35, 850]], fish: [
        ['鲭鱼', '沙丁鱼', '秋刀鱼', '竹荚鱼', '鳀鱼', '鲱鱼', '银鲳', '鲻鱼'],
        ['石斑鱼', '真鲷', '鲣鱼', '带鱼', '黄花鱼', '红甘', '马鲛鱼', '金鲳'],
        ['蓝鳍金枪鱼', '旗鱼', '剑鱼', '苏眉鱼', '鬼头刀', '大比目鱼', '龙趸', '隆头鹦哥鱼'],
        ['皇带鱼', '鲸鲨', '腔棘鱼', '皱鳃鲨', '翻车鱼', '姥鲨', '大白鲨', '格陵兰鲨']
      ]
    }
  };
  const FISH_RARITIES = ['普通', '少见', '稀有', '传说'];
  function fishCatalog() {
    const result = [];
    Object.keys(PONDS).forEach((pondName) => {
      PONDS[pondName].fish.forEach((group, rarity) => {
        group.forEach((name) => result.push({ name, pond: pondName, rarity, asset: `fish-${String(result.length + 1).padStart(3, '0')}` }));
      });
    });
    return result;
  }
  function fishDefinition(name) {
    const catalog = fishCatalog();
    for (let i = 0; i < catalog.length; i++) if (catalog[i].name === name) return catalog[i];
    return null;
  }
  function normalizedFishRecord(fish) {
    if (!fish || typeof fish !== 'object') return null;
    const definition = fishDefinition(String(fish.name || ''));
    if (!definition) return null;
    const numericSize = Number(fish.size);
    return {
      name: definition.name, pond: definition.pond, rarity: definition.rarity, asset: definition.asset,
      size: Number.isFinite(numericSize) ? Math.max(0, Math.round(numericSize * 100) / 100) : 0,
      value: Math.max(0, int(fish.value, 0))
    };
  }
  function recordFishingCatches(stats, catches) {
    if (!stats.fishDex || typeof stats.fishDex !== 'object' || Array.isArray(stats.fishDex)) stats.fishDex = {};
    catches.forEach((rawFish) => {
      const fish = normalizedFishRecord(rawFish); if (!fish) return;
      const previous = stats.fishDex[fish.name] && typeof stats.fishDex[fish.name] === 'object' ? stats.fishDex[fish.name] : {};
      const previousLargest = Number(previous.largestSize); const previousSmallest = Number(previous.smallestSize);
      stats.fishDex[fish.name] = {
        name: fish.name, pond: fish.pond, rarity: fish.rarity, asset: fish.asset, count: Math.max(0, int(previous.count, 0)) + 1,
        largestSize: Number.isFinite(previousLargest) ? Math.max(previousLargest, fish.size) : fish.size,
        smallestSize: Number.isFinite(previousSmallest) ? Math.min(previousSmallest, fish.size) : fish.size
      };
      if (!stats.biggestFish || fish.size > Number(stats.biggestFish.size || 0)) stats.biggestFish = fish;
      if (!stats.smallestFish || fish.size < Number(stats.smallestFish.size || 0)) stats.smallestFish = fish;
    });
  }
  function fishingRarity(stage) {
    const progress = clamp(int(stage, 0), 0, 4);
    const legendaryChance = 0.004 + progress * 0.002;
    const rareChance = 0.035 + progress * 0.007;
    const uncommonChance = 0.20 + progress * 0.015;
    const roll = Math.random();
    if (roll < legendaryChance) return 3;
    if (roll < legendaryChance + rareChance) return 2;
    if (roll < legendaryChance + rareChance + uncommonChance) return 1;
    return 0;
  }
  function fishingKey(id) { return `aff.fishing.v1:${encodeURIComponent(id)}`; }
  function fishingEvent(session) {
    if (!Array.isArray(session.haul)) session.haul = [];
    const pond = PONDS[session.pond]; const stage = session.stage; const rarity = fishingRarity(stage);
    const sizeRange = pond.sizes[rarity]; const size = Math.round((sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0])) * 100) / 100;
    const value = Math.max(1, Math.floor(pond.values[rarity] * (0.75 + Math.random() * 0.5)));
    const definition = fishDefinition(pick(pond.fish[rarity]));
    const catchItem = { name: definition.name, pond: session.pond, rarity, asset: definition.asset, size, value };
    session.haul.push(catchItem); session.value += value; session.stage++;
    session.risk = clamp(pond.baseRisk + session.stage * 0.08, 0.08, 0.70);
    session.event = `${FISH_RARITIES[rarity]}的${catchItem.name}咬钩，约${size}kg，估值${value}。`;
    session.updatedAt = nowMs(); return catchItem;
  }
  function startFishing(id, name, pondName) {
    const pond = PONDS[pondName];
    const session = { id, name, pond: pondName, cost: pond.cost, stage: 0, haul: [], value: 0, risk: pond.baseRisk, status: 'playing', event: '', createdAt: nowMs(), updatedAt: nowMs() };
    fishingEvent(session); jsonSet(fishingKey(id), session); return session;
  }
  function continueFishing(session) {
    if (session.status !== 'playing') return { ok: false, msg: '本次垂钓已经结束。' };
    if (!Array.isArray(session.haul)) session.haul = [];
    const roll = Math.random();
    if (roll < session.risk) {
      session.status = 'lost'; session.lostValue = session.value; session.lostCount = session.haul.length;
      session.event = `鱼线突然绷断，鱼篓也被水流卷走；${session.lostCount} 条鱼、${session.lostValue} 币估值全部归零。`;
      session.value = 0; session.haul = []; session.updatedAt = nowMs(); jsonSet(fishingKey(session.id), session);
      return { ok: true, lost: true };
    }
    fishingEvent(session);
    if (session.stage >= 5) { session.event += ' 天色变化，必须收杆。'; return { ok: true, forced: true }; }
    jsonSet(fishingKey(session.id), session); return { ok: true };
  }
  function bankFishing(session, ctx) {
    if (session.status === 'banked') return null;
    const lost = session.status === 'lost'; const outcomeEvent = session.event;
    const securedCatch = lost || !Array.isArray(session.haul) ? [] : session.haul.slice();
    const p = loadProfile(session.id, session.name); const reward = session.status === 'lost' ? 0 : session.value;
    p.coins += reward; const bestRarity = session.haul.reduce((m, x) => Math.max(m, x.rarity), 0); const delta = lost ? stakeFailureAffection(session.cost) : reward > 0 ? 1 + bestRarity * 2 : 0;
    if (delta) changeAffection(p, delta); else saveProfile(p);
    recordGame(p, 'fishing', reward > session.cost ? 'win' : reward === session.cost ? 'draw' : 'loss', reward, reward - session.cost, { affectionDelta: delta, caughtFish: securedCatch });
    session.status = 'banked'; session.outcome = lost ? 'lost' : 'banked'; session.reward = reward; session.affectionDelta = delta;
    session.event = lost ? outcomeEvent : template(ctx, '文案_钓鱼收杆', { name: p.name }); session.updatedAt = nowMs(); jsonSet(fishingKey(session.id), session);
    return p;
  }
  function fishingMenuView(quote) {
    const pondOptions = Object.keys(PONDS).map((name) => ({
      name, cost: PONDS[name].cost, risk: Math.round(PONDS[name].baseRisk * 100),
      fish: PONDS[name].fish.map((group) => group[0]), representatives: PONDS[name].fish.map((group) => fishDefinition(group[0])), speciesCount: PONDS[name].fish.reduce((sum, group) => sum + group.length, 0),
      maxValue: PONDS[name].values[PONDS[name].values.length - 1]
    }));
    return {
      kind: 'fishing', title: '钓鱼佬 · 选择水域', subtitle: '小鱼塘10 · 江水50 · 大海100',
      fishingScene: { status: 'menu', pond: '', stage: 0, maxStage: 5, risk: 0, value: 0, haul: [], pondOptions, event: '水面平静，选择今天准备挑战的水域。' },
      lines: pondOptions.map((option) => `${option.name}：${option.cost}币 · ${option.speciesCount}种鱼 · 初始风险${option.risk}% · 传说鱼${option.fish[3]}`), quote: quote || ''
    };
  }
  function fishingView(session, quote) {
    const lines = [`${session.pond}  |  入场 ${session.cost}  |  已进行 ${session.stage}/5 次判断`, `当前鱼篓估值 ${session.value}  |  下次风险 ${Math.round(session.risk * 100)}%`, session.event];
    session.haul.slice(-5).forEach((f) => lines.push(`${FISH_RARITIES[f.rarity]} · ${f.name} · ${f.size}kg · ${f.value}币`));
    if (session.status === 'banked') lines.push(`最终到账 ${session.reward} 游戏币  |  好感 ${signedValue(session.affectionDelta)}`);
    else if (session.status === 'lost') lines.push('本次收获归零，可以发送“收杆”完成统计。');
    else lines.push('选择：继续博弈 / 收杆止盈');
    const meters = [
      { label: '判断进度', value: session.stage, min: 0, max: 5, text: `${session.stage}/5` },
      { label: '下次断线风险', value: Math.round(session.risk * 100), min: 0, max: 100, text: `${Math.round(session.risk * 100)}%` }
    ];
    const fishingScene = {
      status: session.status, outcome: session.outcome || '', name: session.name, pond: session.pond, cost: session.cost,
      stage: session.stage, maxStage: 5, risk: Math.round(session.risk * 100), value: session.value,
      reward: session.reward || 0, affectionDelta: session.affectionDelta || 0, event: session.event,
      lostValue: session.lostValue || 0, lostCount: session.lostCount || 0,
      haul: session.haul.slice(-5).map((fish) => ({ name: fish.name, asset: (fishDefinition(fish.name) || {}).asset || fish.asset || '', rarity: fish.rarity, rarityName: FISH_RARITIES[fish.rarity], size: fish.size, value: fish.value }))
    };
    return { kind: 'fishing', title: '钓鱼佬 · 风险与收获', subtitle: '小鱼塘10 · 江水50 · 大海100', fishingScene, meters, lines, quote: quote || '' };
  }
  function fishingDexScene(p, page) {
    const catalog = fishCatalog(); const dex = p.stats.fishing.fishDex || {}; const pages = Math.ceil(catalog.length / 16); const currentPage = clamp(int(page, 1), 1, pages);
    const unlockedCount = catalog.filter((fish) => dex[fish.name] && int(dex[fish.name].count, 0) > 0).length;
    return {
      status: 'dex', name: p.name, page: currentPage, totalPages: pages, unlockedCount, totalSpecies: catalog.length,
      biggestFish: normalizedFishRecord(p.stats.fishing.biggestFish), smallestFish: normalizedFishRecord(p.stats.fishing.smallestFish),
      dexEntries: catalog.slice((currentPage - 1) * 16, currentPage * 16).map((fish) => {
        const record = dex[fish.name] && typeof dex[fish.name] === 'object' ? dex[fish.name] : null; const unlocked = !!record && int(record.count, 0) > 0;
        return { name: fish.name, pond: fish.pond, rarity: fish.rarity, rarityName: FISH_RARITIES[fish.rarity], asset: fish.asset, unlocked, count: unlocked ? int(record.count, 0) : 0, largestSize: unlocked ? Number(record.largestSize || 0) : 0, smallestSize: unlocked ? Number(record.smallestSize || 0) : 0 };
      })
    };
  }
  function fishingDexView(p, page, quote) {
    const scene = fishingDexScene(p, page);
    return { kind: 'fishing', title: '钓鱼佬 · 鱼类图鉴', subtitle: `${p.name} · 第${scene.page}/${scene.totalPages}页`, fishingScene: scene, lines: [`图鉴 ${scene.unlockedCount}/${scene.totalSpecies}`], quote: quote || '只有安全收入鱼篓并完成结算的鱼获，才会点亮图鉴。' };
  }

  // -------------------- 钓鱼牌（福建56张象棋牌） --------------------
  const FISH_CARD_RANKS = [
    { red: '帅', black: '将', point: 1 }, { red: '仕', black: '士', point: 2 },
    { red: '相', black: '象', point: 3 }, { red: '伡', black: '车', point: 4 },
    { red: '㐷', black: '马', point: 5 }, { red: '炮', black: '包', point: 6 },
    { red: '兵', black: '卒', point: 7 }
  ];
  const FISH_CARD_ALIAS = { '帅': '帅', '将': '将', '仕': '仕', '士': '士', '相': '相', '象': '象', '伡': '伡', '车': '车', '㐷': '㐷', '马': '马', '炮': '炮', '包': '包', '兵': '兵', '卒': '卒' };
  function fishCardCreateDeck() {
    const deck = []; let id = 1;
    FISH_CARD_RANKS.forEach((r) => ['red', 'black'].forEach((color) => { for (let i = 0; i < 4; i++) deck.push({ id: id++, color, rank: color === 'red' ? r.red : r.black, pair: r.red + '/' + r.black, point: r.point, text: color === 'red' ? `红${r.red}` : `黑${r.black}` }); }));
    // 黑卒点数按规则为8（红兵为7）
    deck.forEach((c) => { if (c.rank === '卒') c.point = 8; });
    return deck;
  }
  function fishCardShuffle(deck) { const a = Array.isArray(deck) ? deck.slice() : []; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function fishCardCompare(a, b) { if (!a || !b) return 0; if (a.point !== b.point) return a.point > b.point ? 1 : -1; if (a.color !== b.color) return a.color === 'red' ? 1 : -1; return Math.random() < 0.5 ? -1 : 1; }
  function fishCardOpposite(card) {
    if (!card) return null;
    const r = FISH_CARD_RANKS.find((x) => x.red === card.rank || x.black === card.rank); if (!r) return null;
    return r.red === card.rank ? r.black : r.red;
  }
  function fishCardCanEat(hand, pool) { return !!(hand && pool && hand.pair === pool.pair && hand.color !== pool.color); }
  function fishCardPlayer(id, name, isBot, paid) { return { id, name, isBot: !!isBot, paid: paid !== false, hand: [], scoreArea: [], score: 0, roundScore: 0, totalScore: 0, cardsEaten: 0, roundsWon: 0, lastAction: '', status: 'active' }; }
  function fishCardCreateRoom(id, name, paid, mode) { return { game: 'fishingCard', status: 'waiting', mode: mode || 'pvp', ownerId: id, players: [fishCardPlayer(id, name, false, paid)], entry: 100, round: 0, maxRounds: mode === 'short' ? 3 : mode === 'medium' ? 6 : mode === 'long' ? 12 : 1, current: 0, turn: 0, phase: 'action', logs: [], publicPool: [], drawPile: [], scent: null, rounds: [], deal: null, updatedAt: nowMs() }; }
  function fishCardEnsure(room) { if (!room) return room; room.players = Array.isArray(room.players) ? room.players : []; room.logs = Array.isArray(room.logs) ? room.logs : []; room.publicPool = Array.isArray(room.publicPool) ? room.publicPool : []; room.drawPile = Array.isArray(room.drawPile) ? room.drawPile : []; room.current = clamp(int(room.current, 0), 0, Math.max(0, room.players.length - 1)); room.turn = clamp(int(room.turn, 0), 0, Math.max(0, room.players.length - 1)); room.deal = room.deal && typeof room.deal === 'object' ? room.deal : null; return room; }

  // 按 TXT 的 10×5 + 1×6 分牌仪式构造一局。所有步骤写入 deal.logs，
  // 这样 PvE 的自动分牌也能在牌桌上完整回放，而不是悄悄跳过发牌过程。
  function fishCardPrepareDeal(room) {
    const shuffled = fishCardShuffle(fishCardCreateDeck()); const piles = [];
    for (let i = 0; i < 10; i++) piles.push(shuffled.splice(0, 5));
    const markerPile = shuffled.splice(0, 6);
    const previousLoser = room.loserIndex == null ? null : room.loserIndex;
    room.deal = { piles, markerPile, dealerDraws: [], distributor: null, selected: [], order: [], tail: 3, revealed: [], head: null, direction: '左→右', logs: [`第${room.round}局：56张牌洗匀，分成10份五张小牌堆与一份六张牌堆。`] };
    room.status = 'dealing'; room.phase = room.round === 0 ? 'dealer_draw' : 'dealer_draw';
    if (previousLoser != null) room.deal.logs.push(`上一局输家${room.players[previousLoser] ? room.players[previousLoser].name : ''}负责抽牌定分牌。`);
    else room.deal.logs.push('首局由四位玩家依次从六张牌堆抽牌比点数。');
  }
  function fishCardFinishDeal(room, distributorIndex, selected, order, tail, revealIndexes, direction) {
    const deal = room.deal; if (!deal) return '当前没有待完成的分牌流程。';
    const n = room.players.length || 4; const picks = (selected || [0, 1, 2, 3]).map((x) => int(x, -1));
    if (picks.length !== 4 || picks.some((x) => x < 0 || x > 9) || new Set(picks).size !== 4) return '请选择四个不同的小牌堆（例如：1,3,5,7）。';
    const rest = deal.piles.map((p, i) => ({ p, i })).filter((x) => picks.indexOf(x.i) < 0).map((x) => x.p);
    const arranged = (order && order.length === 6 ? order.map((x) => int(x, -1) - 1) : [0, 1, 2, 3, 4, 5]);
    if (arranged.length !== 6 || arranged.some((x) => x < 0 || x >= 6) || new Set(arranged).size !== 6) return '排列必须包含剩余六堆且不能重复（例如：1,2,3,4,5,6）。';
    const selectedPiles = picks.map((i) => deal.piles[i]); const drawPile = [];
    selectedPiles.forEach((pile) => pile.forEach((c) => drawPile.push(c)));
    const six = deal.markerPile.slice(); const leftovers = arranged.map((i) => rest[i]);
    const revealPool = leftovers[4].concat(leftovers[5]); const ri = Array.isArray(revealIndexes) && revealIndexes.length >= 4 ? revealIndexes.map((x) => int(x, -1)).filter((x) => x >= 0 && x < revealPool.length).slice(0, 4) : [0, 1, 2, 3];
    while (ri.length < 4) ri.push(ri.length);
    const revealed = ri.map((i) => revealPool[i]); const sum = revealed.reduce((v, c) => v + int(c && c.point, 0), 0);
    const distributor = clamp(int(distributorIndex, 0), 0, n - 1); const head = (distributor + sum - 1 + n * 100) % n;
    const handPiles = leftovers.slice(0, 4); const hands = Array.from({ length: n }, () => []); const next = (i) => (i + n - 1) % n;
    let who = head; for (let i = 0; i < Math.min(4, n); i++) { hands[who] = handPiles[i].slice(); who = next(who); }
    // 摸牌从数组末端取出；香牌放在数组首端，最后一张才会被摸到。
    room.drawPile = drawPile; room.scent = room.drawPile[0] || null;
    room.publicPool = six.concat(leftovers[4], leftovers[5]);
    room.players.forEach((p, i) => { p.hand = hands[i] || []; p.scoreArea = []; p.score = 0; p.roundScore = 0; p.cardsEaten = 0; p.lastAction = ''; p.status = 'active'; });
    // PvE 首局保留真人先手，头家计算结果仍记录在分牌仪式中；后续局按上一局输家/头家推进。
    const startTurn = (room.mode === 'pve' && room.round === 0) ? 0 : head;
    room.current = startTurn; room.turn = startTurn; room.phase = 'action'; room.status = 'playing';
    deal.distributor = distributor; deal.selected = picks; deal.order = arranged.map((x) => x + 1); deal.tail = clamp(int(tail, 3), 0, 3); deal.revealed = revealed; deal.head = head; deal.direction = direction || '左→右';
    deal.logs.push(`分牌玩家${room.players[distributor] ? room.players[distributor].name : '—'}选择第${picks.map((x) => x + 1).join('、')}堆组成摸牌堆。`);
    deal.logs.push(`剩余六堆按${deal.order.join('、')}排列，亮出${revealed.map((c) => c.text).join('、')}（点数${sum}），${room.players[head] ? room.players[head].name : '—'}成为头家。`);
    deal.logs.push(`手牌已按${deal.direction}分发；摸牌堆共20张，香牌为${room.scent ? room.scent.text : '—'}。`);
    room.logs.push.apply(room.logs, deal.logs.slice(-3)); room.round += 1; room.updatedAt = nowMs(); return '';
  }
  function fishCardAutoDeal(room) {
    if (!room.deal) fishCardPrepareDeal(room);
    const deal = room.deal; let distributor = deal.distributor;
    if (distributor == null) {
      if (room.round === 0 || room.loserIndex == null) {
        const draws = deal.markerPile.slice(0, 4); deal.dealerDraws = draws; let best = 0; for (let i = 1; i < draws.length; i++) if (fishCardCompare(draws[i], draws[best]) > 0) best = i; distributor = best % room.players.length;
        deal.logs.push(`四人从六张牌堆亮抽：${draws.map((c) => c.text).join('、')}；${room.players[distributor] ? room.players[distributor].name : '—'}抽到最大牌，负责分牌。`);
      } else { distributor = room.loserIndex % room.players.length; const card = deal.markerPile[0]; deal.dealerDraws = [card]; deal.logs.push(`${room.players[distributor] ? room.players[distributor].name : '—'}作为上一局输家抽到${card.text}，负责分牌。`); }
    }
    return fishCardFinishDeal(room, distributor, [0, 1, 2, 3], [1, 2, 3, 4, 5, 6], 3, [0, 1, 2, 3], '左→右');
  }
  function fishCardDealerDraw(room, id) {
    const deal = room.deal; if (!deal || room.status !== 'dealing' || room.phase !== 'dealer_draw') return '当前不在抽牌定分牌阶段。';
    const firstRound = room.round === 0;
    if (firstRound) {
      const expected = room.players[deal.dealerDraws.length]; if (!expected || expected.id !== id) return `请等待${expected ? expected.name : '下一位玩家'}抽牌。`;
      const card = deal.markerPile[deal.dealerDraws.length]; if (!card) return '六张定庄牌堆已无法继续抽牌。'; deal.dealerDraws.push(card);
      deal.logs.push(`${expected.name}抽出${card.text}（${card.point}点）。`);
      if (deal.dealerDraws.length < Math.min(4, room.players.length)) return '';
      let best = 0; for (let i = 1; i < deal.dealerDraws.length; i++) if (fishCardCompare(deal.dealerDraws[i], deal.dealerDraws[best]) > 0) best = i;
      deal.distributor = best; room.phase = 'choose_piles'; deal.logs.push(`${room.players[best] ? room.players[best].name : '—'}抽到最大牌，成为分牌玩家；请其选择四堆。`);
    } else {
      const loser = room.players[room.loserIndex == null ? 0 : room.loserIndex]; if (!loser || loser.id !== id) return `请等待上一局输家${loser ? loser.name : ''}抽牌。`;
      const card = deal.markerPile[0]; deal.dealerDraws = [card]; deal.distributor = room.loserIndex == null ? 0 : room.loserIndex; deal.logs.push(`${loser.name}抽出${card.text}（${card.point}点），继续担任分牌玩家。`); room.phase = 'choose_piles';
    }
    return '';
  }
  function fishCardStartRound(room) {
    fishCardPrepareDeal(room); const auto = room.mode === 'pve';
    if (auto) fishCardAutoDeal(room);
    else room.logs.push('分牌流程待操作：发送“分牌”完成抽牌、选堆、排列与定头家。');
  }
  function fishCardPairEat(room, player, cardIndex) { const card = player.hand[cardIndex]; if (!card) return '没有这张手牌。'; const idx = room.publicPool.findIndex((x) => fishCardCanEat(card, x)); if (idx < 0) return '这张牌无法与公共牌池配对吃牌。'; const eaten = room.publicPool.splice(idx, 1)[0]; player.hand.splice(cardIndex, 1); player.scoreArea.push(card, eaten); player.cardsEaten += 1; player.lastAction = `吃牌 ${card.text}×${eaten.text}`; return ''; }
  function fishCardPlay(room, id, index, forceDiscard) { const player = room.players[room.turn]; if (!player || player.id !== id) return '还没轮到你行动。'; const cardIndex = int(index, -1); if (cardIndex < 0 || cardIndex >= player.hand.length) return '手牌编号无效。'; if (!forceDiscard) { const err = fishCardPairEat(room, player, cardIndex); if (err) return err; } else { const card = player.hand.splice(cardIndex, 1)[0]; room.publicPool.push(card); player.lastAction = `弃牌 ${card.text}`; } room.phase = 'draw'; room.logs.push(`${player.name}${player.lastAction}`); room.updatedAt = nowMs(); return ''; }
  function fishCardDraw(room, id) { const player = room.players[room.turn]; if (!player || player.id !== id) return '还没轮到你摸牌。'; if (room.phase !== 'draw') return '请先出牌、吃牌或弃牌。'; if (!room.drawPile.length) return fishCardFinish(room); const card = room.drawPile.pop(); const idx = room.publicPool.findIndex((x) => fishCardCanEat(card, x)); if (idx >= 0) { const eaten = room.publicPool.splice(idx, 1)[0]; player.scoreArea.push(card, eaten); player.cardsEaten += 1; player.lastAction = `摸到${card.text}并吃${eaten.text}`; } else { room.publicPool.push(card); player.lastAction = `摸到${card.text}`; } room.logs.push(`${player.name}${player.lastAction}`); if (room.scent && card.id === room.scent.id) return fishCardFinish(room); room.turn = (room.turn + room.players.length - 1) % room.players.length; room.current = room.turn; room.phase = 'action'; room.updatedAt = nowMs(); return ''; }
  function fishCardScorePlayer(player) {
    const counts = {}; (player.scoreArea || []).forEach((c) => { if (c && c.pair) counts[c.pair] = (counts[c.pair] || 0) + 1; });
    // 同字红黑各一张构成一对；特殊组合按完整对子贪心计分，避免把三张将士相误判为普通散牌。
    const pairCount = {}; Object.keys(counts).forEach((pair) => { pairCount[pair] = Math.floor(counts[pair] / 2); });
    const keys = Object.keys(pairCount); let score = 0;
    keys.forEach((pair) => { if (pairCount[pair] >= 4) { score += 999; pairCount[pair] = 0; } });
    const consumeExact = (names, points) => { const groups = Math.min.apply(null, names.map((name) => pairCount[name] || 0)); if (groups > 0) { score += groups * points; names.forEach((name) => { pairCount[name] = Math.max(0, (pairCount[name] || 0) - groups); }); } };
    consumeExact(['帅/将', '仕/士', '相/象'], 200); consumeExact(['伡/车', '㐷/马', '炮/包'], 100); const soldierPairs = Math.floor((pairCount['兵/卒'] || 0) / 2); if (soldierPairs > 0) { score += soldierPairs * 100; pairCount['兵/卒'] -= soldierPairs * 2; }
    keys.forEach((pair) => { score += pairCount[pair] * 20; }); return score;
  }
  function fishCardFinish(room) { if (room.status === 'finished') return ''; room.players.forEach((p) => { p.roundScore = fishCardScorePlayer(p); p.score = p.roundScore; p.totalScore = Math.max(0, int(p.totalScore, 0)) + p.roundScore; }); const ranked = room.players.slice().sort((a, b) => (b.totalScore - a.totalScore) || (b.roundScore - a.roundScore)); const roundRanked = room.players.slice().sort((a, b) => b.roundScore - a.roundScore); room.loserIndex = room.players.findIndex((p) => p.id === (roundRanked[roundRanked.length - 1] || {}).id); room.rounds.push({ round: room.round, scores: room.players.map((p) => p.roundScore), totals: room.players.map((p) => p.totalScore), winnerId: roundRanked[0] && roundRanked[0].id }); if (room.round < room.maxRounds) { room.status = 'round_result'; room.phase = 'result'; room.logs.push(`第${room.round}局结束：${roundRanked.map((p, i) => `${i + 1}.${p.name} ${p.roundScore}分（累计${p.totalScore}）`).join(' · ')}`); } else { room.status = 'finished'; room.phase = 'finished'; room.logs.push(`比赛结束：${ranked.map((p, i) => `${i + 1}.${p.name} ${p.totalScore}分`).join(' · ')}`); fishCardSettle(room, ranked); } room.updatedAt = nowMs(); return ''; }
  function fishCardSettle(room, ranked) { ranked.forEach((player, index) => { if (player.isBot || !player.paid) return; const p = loadProfile(player.id, player.name); const won = index === 0; const delta = room.mode === 'pve' ? (won ? affectionRules().win : affectionRules().loss) : rankedAffection(index, ranked.length); const reward = won ? awardEntryReturn(p, 'fishingCard', true) : 0; recordGame(p, 'fishingCard', won ? 'win' : 'loss', player.totalScore, reward - room.entry, { affectionDelta: delta }); const s = p.stats.fishingCard; s.fishingCardRounds += room.round; s.fishingCardWins += won ? 1 : 0; s.fishingCardScore += player.totalScore; s.fishingCardCardsEaten += player.cardsEaten; s.fishingCardBestCombo = Math.max(s.fishingCardBestCombo, player.cardsEaten); const highest = (player.scoreArea || []).reduce((m, c) => Math.max(m, int(c && c.point, 0)), 0); s.fishingCardHighestCard = Math.max(s.fishingCardHighestCard || 0, highest); saveProfile(p); player.reward = reward; player.affectionDelta = delta; player.rank = index + 1; }); }
  function fishCardRunBots(room) { let guard = 0; while (room.status === 'playing' && room.players[room.turn] && room.players[room.turn].isBot && guard++ < 20) { const bot = room.players[room.turn]; const eat = bot.hand.findIndex((c) => room.publicPool.some((x) => fishCardCanEat(c, x))); fishCardPlay(room, bot.id, eat >= 0 ? eat : 0, eat < 0); fishCardDraw(room, bot.id); } }
  function fishCardView(room, viewerId, quote) { fishCardEnsure(room); const status = room.status === 'waiting' ? '等待入场' : room.status === 'dealing' ? '分牌仪式' : room.status === 'round_result' ? '本局结算' : room.status === 'finished' ? '最终结算' : '进行中'; const deal = room.deal || {}; const lines = [`${status} · ${room.mode === 'pve' ? 'PvE' : 'PvP'} · 第${room.round || 0}/${room.maxRounds || 1}局 · 逆时针行动`, `公共牌池：${room.publicPool.map((c) => c.text).join(' ') || '—'} · 牌堆剩余${room.drawPile.length}`]; if (room.status === 'dealing') lines.push(`分牌阶段：${room.phase === 'dealer_draw' ? '抽牌定分牌' : room.phase}；发送“分牌 [堆号]”完成（PvE会自动完成）。`); else lines.push(`当前：${room.players[room.turn] ? room.players[room.turn].name : '—'} · ${room.phase === 'draw' ? '请手动摸牌（第二次翻牌）' : '请选择吃牌/出牌/弃牌'}`); if (deal.logs) deal.logs.slice(-4).forEach((x) => lines.push(`· ${x}`)); room.players.forEach((p) => lines.push(`${p.name}${p.isBot ? '（AI）' : ''} · 本局${p.roundScore || 0}分 · 累计${p.totalScore || p.score || 0}分 · 得分牌${(p.scoreArea || []).length}张 · 手牌${p.hand.length}张${p.id === viewerId ? `：${p.hand.map((c, i) => `${i + 1}.${c.text}`).join(' ')}` : ''}`)); (room.logs || []).slice(-8).forEach((x) => lines.push(`· ${x}`)); if (room.status === 'finished') lines.push('发送“.钓鱼牌”可重新查看大厅。'); return { kind: 'fishingCard', title: '钓鱼牌 · 福建象棋牌桌', subtitle: '红黑56张 · 同字异色吃牌 · 入场100币', fishingCardTable: { status: room.status, round: room.round, maxRounds: room.maxRounds, current: room.turn, currentName: room.players[room.turn] ? room.players[room.turn].name : '', phase: room.phase, scent: room.scent || null, publicPool: room.publicPool, drawPileCount: room.drawPile.length, deal: { phase: room.phase, distributor: deal.distributor, dealerDraws: deal.dealerDraws || [], piles: (deal.piles || []).map((pile, i) => ({ index: i + 1, count: pile.length, cards: pile })), selected: deal.selected || [], order: deal.order || [], revealed: deal.revealed || [], head: deal.head, direction: deal.direction, logs: deal.logs || [] }, players: room.players.map((p) => ({ name: p.name, handCount: p.hand.length, score: p.totalScore || p.score, roundScore: p.roundScore, eatenCount: p.cardsEaten, isBot: p.isBot, isGuest: !p.paid, rank: p.rank || 0, hand: p.id === viewerId || room.status === 'finished' ? p.hand : [], eaten: p.scoreArea || [], lastAction: p.lastAction || '', reward: p.reward || 0, affectionDelta: p.affectionDelta || 0 })), logs: room.logs }, lines, quote: quote || '' }; }
  function fishCardMenuView(quote) { return { kind: 'fishingCard', title: '钓鱼牌 · 牌桌大厅', subtitle: '福建56张象棋牌 · 单局/短时3局/中时6局/长时12局', fishingCardTable: { status: 'menu', mode: 'single', maxRounds: 1, help: ['.钓鱼牌 人机 [模式] · .钓鱼牌 开房 → 加入 → 开始'] }, lines: ['PvE：.钓鱼牌 人机 [短时/中时/长时]；PvP：.钓鱼牌 开房 → 加入 → 开始。', '操作：吃牌 1、出牌 1、弃牌 1、摸牌；同字不同色才能吃牌，行动按逆时针。', '单局及多局入场费100币；PvE第一名返还200币并增加好感，PvP按最终排名结算。'], quote: quote || '发送“教程”查看玩法。' }; }
  function fishCardTutorialView() { return { kind: 'fishingCard', title: '钓鱼牌 · 图片教程', subtitle: '福建56张象棋牌规则', fishingCardTable: { status: 'menu', mode: 'tutorial', maxRounds: 1, help: ['教程：洗牌→抽牌定分牌→选堆→排列→亮点定头家→行动'] }, lines: ['牌库：红帅仕相伡㐷炮兵、黑将士象车马包卒，各4张；同字异色才能吃牌。', '正式开局会展示完整分牌仪式：56张洗混、10份五张堆与一份六张堆，抽牌决定分牌玩家；分牌玩家选择四堆组成摸牌堆并排列其余六堆。', '分牌完成后，先选择吃牌/弃牌，再发送“摸牌”；摸牌从牌堆底部抽取，香牌出现后本局结束。第二次翻牌（摸牌）必须由当前玩家手动确认，Bot会逐步执行并记录每一步。', 'PvP分牌指令：.钓鱼牌 分牌 1,3,5,7 1,2,3,4,5,6；PvE会自动完成分牌但牌桌保留抽牌、亮牌与选堆日志。', '行动按逆时针轮转；多局模式每局结算后发送“下一局”。操作示例：.钓鱼牌 吃牌 1、.钓鱼牌 弃牌 2、.钓鱼牌 摸牌、.钓鱼牌 手牌。'], quote: '最终按帅仕相、车马炮、兵卒组合及散牌对子计分。' }; }
  async function handleFishingCard(ctx, msg, args) {
    const gid = groupId(ctx, msg); const id = uid(ctx, msg); const name = uname(ctx, msg); const key = roomKey('fishingCard', gid); const op = String(args[0] || '').trim(); const lower = op.toLowerCase();
    let room = ensureRoomAvailable('fishingCard', gid);
    if (!args.length && room && room.status === 'finished') { clearKey(key); return replyView(ctx, msg, fishCardMenuView()); }
    if (['教程', '规则', 'help'].indexOf(lower) >= 0) return replyView(ctx, msg, fishCardTutorialView());
    if (['人机', '单人', 'pve', 'bot'].indexOf(lower) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, fishCardView(room, id, '当前群已有钓鱼牌房间。'));
      const mode = args.some((x) => /^(?:长时|long|12局)/i.test(String(x))) ? 'long' : args.some((x) => /^(?:中时|medium|6局)/i.test(String(x))) ? 'medium' : args.some((x) => /^(?:短时|short|3局)/i.test(String(x))) ? 'short' : 'single';
      const p = loadProfile(id, name); if (!charge(p, ENTRY.fishingCard)) return replyView(ctx, msg, { kind: 'profile', title: '钓鱼牌入场失败', lines: [`需要${ENTRY.fishingCard}游戏币`, `当前余额${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      room = fishCardCreateRoom(id, name, true, mode === 'single' ? 'pve' : 'pve'); room.maxRounds = mode === 'short' ? 3 : mode === 'medium' ? 6 : mode === 'long' ? 12 : 1;
      while (room.players.length < 4) addRoomBot(room, 'fishingCard', 1);
      fishCardStartRound(room); jsonSet(key, room); return replyView(ctx, msg, fishCardView(room, id, '人机牌局开始；轮到当前玩家后，Bot会逐步行动并记录日志。'));
    }
    if (['开房', '创建', 'pvp', 'create'].indexOf(lower) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, fishCardView(room, id, '当前群已有钓鱼牌房间。'));
      const mode = args.some((x) => /^(?:长时|long|12局)/i.test(String(x))) ? 'long' : args.some((x) => /^(?:中时|medium|6局)/i.test(String(x))) ? 'medium' : args.some((x) => /^(?:短时|short|3局)/i.test(String(x))) ? 'short' : 'pvp';
      const admission = multiplayerAdmission('fishingCard', id, name); room = fishCardCreateRoom(id, name, admission.paid, mode); jsonSet(key, room); return replyView(ctx, msg, fishCardView(room, id, admission.paid ? '房间创建成功，等待玩家加入。' : guestAdmissionQuote(ctx, name, ENTRY.fishingCard)));
    }
    if (!room) return replyView(ctx, msg, fishCardMenuView());
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    if (['加入', 'join'].indexOf(lower) >= 0) { const result = joinPaidRoom(room, 'fishingCard', id, name); if (!result.error) jsonSet(key, room); return replyView(ctx, msg, fishCardView(room, id, result.error || `${name}已加入。`)); }
    if (['机器人', 'bot'].indexOf(lower) >= 0) { if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, fishCardView(room, id, '只有房主可添加机器人。')); addRoomBot(room, 'fishingCard', args[1] || 1); jsonSet(key, room); return replyView(ctx, msg, fishCardView(room, id, '机器人已加入。')); }
    if (['开始', 'start'].indexOf(lower) >= 0 || (room.status === 'round_result' && ['下一局', '再来一局'].indexOf(lower) >= 0)) {
      if (room.status === 'round_result') fishCardStartRound(room); else { if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, fishCardView(room, id, '只有房主能开始等待中的房间。')); while (room.players.length < 4) addRoomBot(room, 'fishingCard', 1); fishCardStartRound(room); }
      fishCardRunBots(room); jsonSet(key, room); return replyView(ctx, msg, fishCardView(room, id, '本局开始。'));
    }
    if (['分牌', '发牌', 'deal'].indexOf(lower) >= 0 && room.status === 'dealing') {
      const deal = room.deal || {}; const nums = args.slice(1).join(' ').split(/[，,、\s]+/).filter(Boolean).map((x) => int(x, NaN));
      const selected = nums.length >= 4 ? nums.slice(0, 4).map((x) => x - 1) : [0, 1, 2, 3];
      const order = nums.length >= 10 ? nums.slice(4, 10) : [1, 2, 3, 4, 5, 6];
      const distributor = deal.distributor == null ? room.players.findIndex((p) => p.id === id) : deal.distributor;
      const err = fishCardFinishDeal(room, distributor < 0 ? 0 : distributor, selected, order, 3, [0, 1, 2, 3], '左→右');
      if (!err) fishCardRunBots(room); jsonSet(key, room); return replyView(ctx, msg, fishCardView(room, id, err || '分牌完成，牌局开始。'));
    }
    if (['抽牌', '定庄', 'drawdealer'].indexOf(lower) >= 0 && room.status === 'dealing') {
      const err = fishCardDealerDraw(room, id); if (!err && room.phase === 'choose_piles' && room.mode === 'pve') fishCardAutoDeal(room); jsonSet(key, room); return replyView(ctx, msg, fishCardView(room, id, err || '抽牌记录完成。'));
    }
    if (['看牌', '手牌', 'hand'].indexOf(lower) >= 0) return replyView(ctx, msg, fishCardView(room, id, '你的手牌已显示在本图中。'));
    let err = '';
    if (['吃牌', '吃', 'eat'].indexOf(lower) >= 0) err = fishCardPlay(room, id, int(args[1], 0) - 1, false);
    else if (['出牌', '打出', 'play'].indexOf(lower) >= 0) err = fishCardPlay(room, id, int(args[1], 0) - 1, true);
    else if (['弃牌', 'discard'].indexOf(lower) >= 0) err = fishCardPlay(room, id, int(args[1], 0) - 1, true);
    else if (['摸牌', '摸', 'draw'].indexOf(lower) >= 0) err = fishCardDraw(room, id);
    else if (!['状态', '查看', 'status'].includes(lower)) err = '可用操作：吃牌 1、弃牌 1、摸牌、状态。';
    if (!err) fishCardRunBots(room); jsonSet(key, room); return replyView(ctx, msg, fishCardView(room, id, err || '操作已记录。'));
  }

  // -------------------- 竞拍之王 --------------------
  const AUCTION_RATE = 10000;
  const AUCTION_MAX_PLAYERS = 8;
  const AUCTION_GRID_WIDTH = 12;
  const AUCTION_GRID_HEIGHT = 10;
  const AUCTION_FOG_VERSION = 2;
  const AUCTION_PUBLIC_CELLS_PER_ROUND = 4;
  const AUCTION_BOT_NAMES = ['姜修泽', '葛明治', '阿日', '严茫熙', '亨德森'];
  const AUCTION_RARITIES = ['常见', '少见', '稀有', '珍奇', '传说'];
  const AUCTION_CONDITIONS = [
    { name: '严重受损', multiplier: 0.38 }, { name: '明显磨损', multiplier: 0.68 },
    { name: '保存良好', multiplier: 1 }, { name: '近乎全新', multiplier: 1.28 }
  ];
  const AUCTION_ASSISTANTS = {
    '加布里埃拉': { kind: 'reveal', typeLabel: '轮廓探测', triggerLabel: '主动·逐轮', effect: 'reveal', skill: '循迹教学', description: '发动时随机探清2件货品，此后每轮再探清2件。', color: '#f3c969', startItems: 2, roundItems: 2, filter: 'any', revealCategory: true },
    '索菲': { kind: 'reveal', typeLabel: '品质探测', triggerLabel: '主动·逐轮', effect: 'reveal', skill: '潮流雷达', description: '发动时随机探清5件货品，此后每轮再探清2件。', color: '#82d5d0', startItems: 5, roundItems: 2, filter: 'any' },
    '玛丽亚': { kind: 'valuation', typeLabel: '排雷估价', triggerLabel: '开局被动', effect: 'lowMarket', autoStart: true, skill: '二手排雷', description: '开局统计常见、少见、稀有货品数量，并估算低档货回收价带。', color: '#9bb7d4' },
    '维克托': { kind: 'statistics', typeLabel: '高阶统计', triggerLabel: '开局被动·第3轮升级', effect: 'highMarket', autoStart: true, skill: '稀缺账本', description: '开局统计稀有、珍奇、传说货品数量；第3轮追加高阶货估价。', color: '#f2b5d4' },
    '伊莎贝拉': { kind: 'hybrid', typeLabel: '定向鉴宝', triggerLabel: '主动', effect: 'isabella', skill: '珠宝视界', description: '锁定全场最高品质货品，并探清至多4件奢侈品轮廓。', color: '#b4d58d' },
    '艾哈迈德': { kind: 'valuation', typeLabel: '宏观估价', triggerLabel: '开局被动·第3轮升级', effect: 'scaleMarket', autoStart: true, skill: '全局盘货', description: '开局统计货量、占格与大件数；第3轮把整箱估价收窄。', color: '#ef8d7f' },
    '伊森': { kind: 'reveal', typeLabel: '轮廓盲猜', triggerLabel: '主动·终局升级', effect: 'reveal', skill: '轮廓盲猜', description: '发动时随机探清5件货品；第5轮公开全部剩余轮廓。', color: '#d4a7ff', startItems: 5, finalAll: true, filter: 'any' },
    '陈美': { kind: 'hybrid', typeLabel: '品类鉴定', triggerLabel: '主动', effect: 'categoryAll', skill: '璀璨视界', description: '探清全部奢侈品轮廓并汇总其中的品质分布。', color: '#73d8ff', categories: ['奢侈品'], reportRarities: true },
    '娜奥米': { kind: 'hybrid', typeLabel: '品类统计', triggerLabel: '主动', effect: 'categoryAll', skill: '潮品扫货', description: '探清全部奢侈品与电器轮廓，并统计高品质货品数量。', color: '#ffb979', categories: ['奢侈品', '电器'], reportHigh: true },
    '卡洛斯': { kind: 'reveal', typeLabel: '品类探测', triggerLabel: '主动·逐轮', effect: 'categoryAll', skill: '仓储勘察', description: '探清全部家居与电器轮廓，此后每轮随机补探2件。', color: '#9ed18b', categories: ['家居', '电器'], roundItems: 2 },
    '拉文': { kind: 'reveal', typeLabel: '延迟爆发', triggerLabel: '主动·第5轮生效', effect: 'finalAll', skill: '终局洞察', description: '发动后前4轮保持潜伏，第5轮公开全部剩余货品轮廓。', color: '#c2b7f2', finalAll: true }
  };
  const AUCTION_ASSISTANT_ALIASES = {
    '鉴定师': '加布里埃拉', '财务顾问': '玛丽亚', '情报员': '伊森',
    '心理师': '索菲', '修复师': '卡洛斯', '搬运专家': '艾哈迈德'
  };
  const AUCTION_TOOLS = [
    { name: '强光手电', description: '沿目标格追加探索一个占格并判断外观状态。', mode: 'shapeCondition' },
    { name: '旧货目录', description: '辨认目标格所在货品的具体品类。', mode: 'category' },
    { name: '红外相机', description: '核验目标格的品质颜色。', mode: 'rarity' },
    { name: '防伪镜', description: '检查目标格所在货品的仿制嫌疑。', mode: 'authenticity' },
    { name: '纤维探针', description: '从战争迷雾中额外揭开两个格子。', mode: 'shapes' },
    { name: '标签刷', description: '追加探索并辨认目标货品的品类。', mode: 'categoryRarity' }
  ];
  const AUCTION_PERSONALITIES = [
    { aggression: 0.86, risk: 0.83, noise: 0.13, quit: 0.16, bluff: 0.08 },
    { aggression: 0.72, risk: 0.70, noise: 0.10, quit: 0.27, bluff: 0.03 },
    { aggression: 1.08, risk: 1.02, noise: 0.20, quit: 0.08, bluff: 0.18 },
    { aggression: 0.94, risk: 0.91, noise: 0.17, quit: 0.13, bluff: 0.24 },
    { aggression: 0.90, risk: 0.88, noise: 0.24, quit: 0.11, bluff: 0.15 }
  ];
  const AUCTION_ITEM_GROUPS = [
    { category: '废料', rarity: 0, min: 800, max: 6000, names: ['废铜线圈', '旧铝合金架', '拆机零件', '生锈工具箱'] },
    { category: '废料', rarity: 1, min: 7000, max: 24000, names: ['黄铜阀门组', '航空铝板', '稀有木料边角', '未拆封工业轴承'] },
    { category: '家居', rarity: 0, min: 3000, max: 18000, names: ['实木餐桌', '落地灯', '羊毛地毯', '藤编躺椅'] },
    { category: '家居', rarity: 1, min: 18000, max: 65000, names: ['手工胡桃木柜', '老式留声机柜', '真皮单人沙发', '进口瓷器餐具'] },
    { category: '家居', rarity: 2, min: 70000, max: 220000, names: ['名匠扶手椅', '古董立钟', '鎏金梳妆台', '手织波斯地毯'] },
    { category: '电器', rarity: 0, min: 5000, max: 26000, names: ['投影仪', '专业功放', '摄影灯组', '商用咖啡机'] },
    { category: '电器', rarity: 1, min: 28000, max: 90000, names: ['旗舰显卡主机', '黑胶播放系统', '电影摄影机', '小型服务器阵列'] },
    { category: '电器', rarity: 2, min: 95000, max: 280000, names: ['广播级摄像机', '复古街机原机', '录音棚调音台', '实验室光谱仪'] },
    { category: '收藏品', rarity: 0, min: 4000, max: 22000, names: ['成套纪念邮票', '旧版漫画套装', '模型火车组', '签名海报'] },
    { category: '收藏品', rarity: 1, min: 24000, max: 85000, names: ['停产机械玩具', '老电影胶片', '限量黑胶唱片', '绝版桌游初版'] },
    { category: '收藏品', rarity: 2, min: 90000, max: 320000, names: ['早期摄影银版', '名家亲笔手稿', '稀有球星卡册', '古董航海仪'] },
    { category: '收藏品', rarity: 3, min: 350000, max: 1200000, names: ['博物馆级化石', '失传钟表孤品', '历史名人信札', '古代星图原稿'] },
    { category: '奢侈品', rarity: 1, min: 30000, max: 110000, names: ['设计师旅行箱', '古董银餐具', '羊绒礼服套装', '限量香水礼盒'] },
    { category: '奢侈品', rarity: 2, min: 120000, max: 420000, names: ['机械腕表', '宝石胸针', '珍珠项链', '手工鳄鱼皮箱'] },
    { category: '奢侈品', rarity: 3, min: 450000, max: 1600000, names: ['祖母绿戒指', '高级复杂功能腕表', '古董钻石冠饰', '皇家工坊银器'] },
    { category: '工业设备', rarity: 0, min: 10000, max: 48000, names: ['电动叉车', '空气压缩机', '金属切割机', '小型发电机'] },
    { category: '工业设备', rarity: 1, min: 52000, max: 180000, names: ['五轴雕刻机', '工业机械臂', '便携式测绘站', '餐饮冷库机组'] },
    { category: '工业设备', rarity: 2, min: 190000, max: 620000, names: ['精密数控机床', '移动式医疗舱', '矿物分析设备', '舞台激光阵列'] },
    { category: '交通工具', rarity: 1, min: 25000, max: 100000, names: ['复古摩托车', '竞速卡丁车', '折叠电动艇', '山地越野车'] },
    { category: '交通工具', rarity: 2, min: 110000, max: 380000, names: ['经典轿跑残件', '双座水上摩托', '小型全地形车', '收藏级公路赛车'] },
    { category: '交通工具', rarity: 3, min: 420000, max: 1500000, names: ['修复级古董跑车', '退役特技飞机', '限量赛道摩托', '经典木壳快艇'] },
    { category: '神秘物件', rarity: 1, min: 12000, max: 70000, names: ['上锁的黄铜匣', '无标记磁带箱', '旧宅暗格木箱', '异国旅行笔记'] },
    { category: '神秘物件', rarity: 2, min: 75000, max: 300000, names: ['密码保险箱', '未署名油画', '封存实验样机', '古文字石板'] },
    { category: '神秘物件', rarity: 4, min: 1800000, max: 6000000, names: ['失落王冠残件', '传奇探险家藏宝册', '无名大师真迹', '陨石核心标本'] }
  ];
  const AUCTION_VENUES = {
    '新手仓': { tagline: '货多 · 线索清楚 · 精品偏少', minItems: 16, maxItems: 20, rarityWeights: [68, 25, 6, 1, 0], clarity: 0.56, clue: '货品摆放规整，外包装标签大多还清晰可读。', weights: { '家居': 4, '电器': 3, '收藏品': 2, '废料': 3, '奢侈品': 1 } },
    '跳蚤市场': { tagline: '货最多 · 鱼龙混杂 · 仿品偏多', minItems: 19, maxItems: 24, rarityWeights: [71, 22, 6, 1, 0], clarity: 0.43, fakeRate: 0.14, clue: '纸箱层层叠叠，旧标签和摊主手写价签混在一起。', weights: { '家居': 4, '电器': 2, '收藏品': 4, '废料': 3, '奢侈品': 1, '神秘物件': 1 } },
    '港口滞留仓': { tagline: '大件偏多 · 价值波动明显', minItems: 13, maxItems: 17, rarityWeights: [55, 28, 13, 4, 0], clarity: 0.34, largeBias: 0.58, clue: '货柜经历多次转运，能看到沉重支架和防震包装。', weights: { '交通工具': 3, '工业设备': 4, '家居': 2, '电器': 2, '废料': 2, '神秘物件': 1 } },
    '收藏家遗产': { tagline: '货少 · 精品率高 · 小件藏得深', minItems: 9, maxItems: 13, rarityWeights: [28, 34, 25, 11, 2], clarity: 0.30, smallBias: 0.42, clue: '防潮纸、独立木盒与手写编号说明主人相当讲究。', weights: { '收藏品': 6, '奢侈品': 3, '神秘物件': 2, '家居': 1 } },
    '工业清仓': { tagline: '重货很多 · 设备与废料混装', minItems: 13, maxItems: 18, rarityWeights: [64, 27, 8, 1, 0], clarity: 0.47, largeBias: 0.68, clue: '地面承重痕迹很深，机油味盖过了其他气味。', weights: { '工业设备': 6, '废料': 4, '电器': 2, '交通工具': 1 } },
    '高端会所': { tagline: '精品偏多 · 受损与仿品风险并存', minItems: 10, maxItems: 14, rarityWeights: [34, 34, 22, 8, 2], clarity: 0.38, fakeRate: 0.10, clue: '包装考究，但少数封条和证书像是后补上去的。', weights: { '奢侈品': 6, '收藏品': 3, '家居': 2, '电器': 2 } },
    '无主黑箱': { tagline: '货少 · 情报极少 · 价值极端', minItems: 7, maxItems: 11, rarityWeights: [48, 22, 16, 10, 4], clarity: 0.12, fakeRate: 0.08, clue: '货单被撕去，只剩下几组涂黑编号和一道新换的锁。', weights: { '神秘物件': 6, '收藏品': 3, '奢侈品': 2, '废料': 2, '电器': 1 } }
  };
  const AUCTION_VENUE_ALIASES = { '新手场': '新手仓', '港口': '港口滞留仓', '遗产': '收藏家遗产', '工业': '工业清仓', '会所': '高端会所', '黑箱': '无主黑箱' };
  const AUCTION_SIZE_PRESETS = {
    '废料': [[2, 1], [2, 1], [1, 1], [2, 2]],
    '家居': [[3, 2], [1, 2], [3, 1], [2, 2]],
    '电器': [[2, 1], [2, 2], [2, 1], [2, 2]],
    '收藏品': [[1, 1], [2, 1], [2, 1], [1, 1]],
    '奢侈品': [[2, 1], [1, 1], [1, 1], [2, 1]],
    '工业设备': [[3, 2], [2, 2], [3, 1], [2, 2]],
    '交通工具': [[3, 2], [3, 1], [3, 2], [2, 2]],
    '神秘物件': [[1, 1], [2, 1], [2, 2], [2, 1]]
  };

  let auctionCatalogCache = null;
  function auctionFixedSize(category, itemIndex) {
    const presets = AUCTION_SIZE_PRESETS[category] || [[1, 1]]; const size = presets[itemIndex % presets.length] || [1, 1];
    return { width: size[0], height: size[1], sizeLabel: `${size[0]}×${size[1]}` };
  }
  function auctionRectShape(width, height) {
    const shape = []; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) shape.push([x, y]); return shape;
  }
  function auctionCatalog() {
    if (auctionCatalogCache) return auctionCatalogCache;
    const result = [];
    AUCTION_ITEM_GROUPS.forEach((group, groupIndex) => group.names.forEach((name, itemIndex) => {
      const size = auctionFixedSize(group.category, itemIndex); result.push({
        id: `A${groupIndex + 1}-${itemIndex + 1}`, name, category: group.category, rarity: group.rarity,
        min: group.min, max: group.max, width: size.width, height: size.height, sizeLabel: size.sizeLabel
      });
    }));
    auctionCatalogCache = result;
    return result;
  }
  function auctionWeightedCategory(weights) {
    const entries = Object.keys(weights || {}); const total = entries.reduce((sum, key) => sum + Math.max(0, weights[key]), 0);
    let roll = Math.random() * Math.max(1, total);
    for (let i = 0; i < entries.length; i++) { if (roll < weights[entries[i]]) return entries[i]; roll -= weights[entries[i]]; }
    return entries[0] || '废料';
  }
  function auctionRarity(venue) {
    const weights = venue.rarityWeights || [60, 28, 9, 2.5, 0.5];
    const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0); let roll = Math.random() * Math.max(1, total);
    for (let i = 0; i < weights.length; i++) { if (roll < weights[i]) return i; roll -= weights[i]; }
    return 0;
  }
  function auctionPickDefinition(category, rarity, venue) {
    const catalog = auctionCatalog();
    let pool = catalog.filter((item) => item.category === category && item.rarity === rarity);
    if (!pool.length) pool = catalog.filter((item) => item.category === category && item.rarity <= rarity);
    if (!pool.length) pool = catalog.filter((item) => item.category === category);
    if (venue && venue.largeBias && Math.random() < venue.largeBias) {
      const maxArea = Math.max.apply(null, pool.map((item) => item.width * item.height)); pool = pool.filter((item) => item.width * item.height === maxArea);
    } else if (venue && venue.smallBias && Math.random() < venue.smallBias) {
      const minArea = Math.min.apply(null, pool.map((item) => item.width * item.height)); pool = pool.filter((item) => item.width * item.height === minArea);
    }
    return pick(pool.length ? pool : catalog);
  }
  function auctionSilhouette(category) {
    return ({ '废料': '杂乱金属', '家居': '家居轮廓', '电器': '电子设备', '收藏品': '封装藏品', '奢侈品': '精致小盒', '工业设备': '重型设备', '交通工具': '带轮重货', '神秘物件': '无标记物件' })[category] || '遮盖货物';
  }
  function auctionMakeItem(venue, forcedMaxRarity) {
    const category = auctionWeightedCategory(venue.weights);
    const rarity = forcedMaxRarity == null ? auctionRarity(venue) : Math.min(forcedMaxRarity, auctionRarity(venue));
    const definition = auctionPickDefinition(category, rarity, venue);
    let conditionIndex = Math.floor(Math.random() * AUCTION_CONDITIONS.length);
    if (definition.rarity >= 3 && Math.random() < 0.55) conditionIndex = Math.max(1, conditionIndex);
    const condition = AUCTION_CONDITIONS[conditionIndex];
    const raw = definition.min + Math.random() * (definition.max - definition.min);
    const authentic = Math.random() >= (venue.fakeRate || 0); const fakeMultiplier = authentic ? 1 : 0.16 + Math.random() * 0.29;
    const value = Math.max(1000, Math.round(raw * condition.multiplier * fakeMultiplier / 1000) * 1000);
    return {
      id: definition.id, uid: `${definition.id}-${String(nowMs()).slice(-5)}-${Math.floor(Math.random() * 100000)}`,
      name: definition.name, category: definition.category, silhouette: auctionSilhouette(definition.category), rarity: definition.rarity,
      rarityName: AUCTION_RARITIES[definition.rarity], condition: condition.name, conditionIndex, authentic,
      authenticity: authentic ? '真品' : '仿制品', value, width: definition.width, height: definition.height, sizeLabel: definition.sizeLabel,
      shape: auctionRectShape(definition.width, definition.height), gridX: 0, gridY: 0, slot: 0
    };
  }
  function auctionShapeFits(shape, x, y, occupied) {
    return shape.every((cell) => {
      const px = x + cell[0]; const py = y + cell[1];
      return px >= 0 && px < AUCTION_GRID_WIDTH && py >= 0 && py < AUCTION_GRID_HEIGHT && !occupied[`${px},${py}`];
    });
  }
  function auctionPackItems(items) {
    const occupied = {}; const sorted = items.slice().sort((a, b) => b.shape.length - a.shape.length); const placed = [];
    sorted.forEach((item) => {
      const shape = item.shape; const candidates = [];
      for (let y = 0; y < AUCTION_GRID_HEIGHT; y++) for (let x = 0; x < AUCTION_GRID_WIDTH; x++) if (auctionShapeFits(shape, x, y, occupied)) {
        let contact = 0; const own = {}; shape.forEach((cell) => { own[`${x + cell[0]},${y + cell[1]}`] = true; });
        shape.forEach((cell) => {
          const px = x + cell[0]; const py = y + cell[1]; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach((delta) => {
            const key = `${px + delta[0]},${py + delta[1]}`; if (!own[key] && occupied[key]) contact++;
          });
        });
        candidates.push({ x, y, contact });
      }
      let point = null;
      if (candidates.length) { const minContact = Math.min.apply(null, candidates.map((candidate) => candidate.contact)); point = pick(candidates.filter((candidate) => candidate.contact === minContact)); }
      if (!point) return;
      item.shape = shape; item.gridX = point.x; item.gridY = point.y;
      shape.forEach((cell) => { occupied[`${point.x + cell[0]},${point.y + cell[1]}`] = true; }); placed.push(item);
    });
    placed.sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX).forEach((item, index) => { item.slot = index + 1; });
    return placed;
  }
  function auctionVenueName(value) {
    const raw = String(value || '').trim(); const direct = AUCTION_VENUES[raw] ? raw : AUCTION_VENUE_ALIASES[raw]; return direct || '';
  }
  function auctionVenueList() {
    return Object.keys(AUCTION_VENUES).map((name) => ({ name, tagline: AUCTION_VENUES[name].tagline, minItems: AUCTION_VENUES[name].minItems, maxItems: AUCTION_VENUES[name].maxItems }));
  }
  function auctionCreateContainer(venueName) {
    const name = auctionVenueName(venueName) || '新手仓'; const venue = AUCTION_VENUES[name];
    const itemCount = venue.minItems + Math.floor(Math.random() * (venue.maxItems - venue.minItems + 1)); let items = [];
    for (let i = 0; i < itemCount; i++) {
      const item = auctionMakeItem(venue); item.uid = `${item.id}-${String(nowMs()).slice(-6)}-${i + 1}`; items.push(item);
    }
    items = auctionPackItems(items);
    const saleValue = items.reduce((sum, item) => sum + item.value, 0);
    return {
      code: `CT-${String(nowMs()).slice(-6)}-${Math.floor(Math.random() * 90 + 10)}`, theme: name, venue: name,
      clue: venue.clue, silhouette: `${items.length}件货占据${items.reduce((sum, item) => sum + item.shape.length, 0)}格；大小不代表价值。`,
      seal: pick(['封条完整', '封条有二次粘贴痕迹', '箱门边缘轻微变形', '外观保养良好']),
      items, saleValue, reserve: Math.max(1000, Math.floor(saleValue * (0.08 + Math.random() * 0.12) / 1000) * 1000),
      themeData: venue, gridWidth: AUCTION_GRID_WIDTH, gridHeight: AUCTION_GRID_HEIGHT, fogVersion: AUCTION_FOG_VERSION
    };
  }
  function auctionNormalizeAssistant(name) { return AUCTION_ASSISTANTS[name] ? name : AUCTION_ASSISTANT_ALIASES[name] || ''; }
  function auctionAssistantList() {
    return Object.keys(AUCTION_ASSISTANTS).map((name) => ({
      name, skill: AUCTION_ASSISTANTS[name].skill, description: AUCTION_ASSISTANTS[name].description, color: AUCTION_ASSISTANTS[name].color,
      kind: AUCTION_ASSISTANTS[name].kind, typeLabel: AUCTION_ASSISTANTS[name].typeLabel, triggerLabel: AUCTION_ASSISTANTS[name].triggerLabel
    }));
  }
  function auctionToolList() { return shuffle(AUCTION_TOOLS.map((tool) => tool.name)).slice(0, 2); }
  function auctionBotStyle(index) {
    const base = AUCTION_PERSONALITIES[index % AUCTION_PERSONALITIES.length];
    return {
      aggression: base.aggression * (0.92 + Math.random() * 0.16), bluff: base.bluff,
      risk: base.risk * (0.92 + Math.random() * 0.16), noise: base.noise, quit: base.quit,
      tilt: 0, allianceTarget: '', rivalryTarget: ''
    };
  }
  function auctionPlayer(id, name, isBot, paid, assistant, botIndex) {
    const bot = !!isBot; const eligible = bot ? false : paid !== false;
    return {
      id, name, isBot: bot, paid: eligible, guest: !bot && !eligible,
      assistant: auctionNormalizeAssistant(assistant) || (bot ? pick(Object.keys(AUCTION_ASSISTANTS)) : ''),
      active: true, passed: false, status: '等待', bid: 0, maxBid: 0, heldCoins: 0, submittedRound: 0, confirmedRound: 0,
      privateEstimate: 0, skillUsed: false, assistantActivated: false, assistantReport: null, assistantMilestones: {}, tools: bot ? [] : auctionToolList(), intel: '', itemIntel: {},
      exploredCells: {}, exploredRound: 0,
      style: bot ? auctionBotStyle(botIndex || 0) : null, rank: 0, rankRound: 0, rankHistory: [0, 0, 0, 0, 0], lastRank: 0, lastRaise: 0
    };
  }
  function auctionRankHistory(player) {
    if (!Array.isArray(player.rankHistory)) player.rankHistory = [];
    player.rankHistory = player.rankHistory.slice(0, 5).map((rank) => Math.max(0, int(rank, 0)));
    while (player.rankHistory.length < 5) player.rankHistory.push(0);
    if (!Number.isFinite(player.rankRound)) player.rankRound = 0;
    return player.rankHistory;
  }
  function auctionIntelFor(player, item) {
    if (!player.itemIntel || typeof player.itemIntel !== 'object' || Array.isArray(player.itemIntel)) player.itemIntel = {};
    if (!player.itemIntel[item.uid]) player.itemIntel[item.uid] = { shape: false, rarity: false, category: false, condition: false, authenticity: false };
    return player.itemIntel[item.uid];
  }
  function auctionReveal(player, item, fields) {
    const intel = auctionIntelFor(player, item); (fields || []).forEach((field) => { intel[field] = true; }); return intel;
  }
  function auctionCellKey(x, y) { return `${x},${y}`; }
  function auctionCellLabel(x, y) { return `${String.fromCharCode(65 + x)}${y + 1}`; }
  function auctionParseCell(value, rowValue) {
    const raw = String(value || '').trim().toUpperCase();
    const letter = raw.match(/^([A-L])(10|[1-9])$/);
    if (letter) return { x: letter[1].charCodeAt(0) - 65, y: int(letter[2], 1) - 1 };
    const pair = rowValue == null ? raw.match(/^(\d{1,2})[,，:X](\d{1,2})$/) : [null, raw, String(rowValue || '').trim()];
    if (pair) {
      const x = int(pair[1], 0) - 1; const y = int(pair[2], 0) - 1;
      if (x >= 0 && x < AUCTION_GRID_WIDTH && y >= 0 && y < AUCTION_GRID_HEIGHT) return { x, y };
    }
    return null;
  }
  function auctionItemCells(item) {
    return (item.shape || []).map((cell) => {
      const x = item.gridX + cell[0]; const y = item.gridY + cell[1]; return { x, y, key: auctionCellKey(x, y) };
    });
  }
  function auctionFindItemAt(room, x, y) {
    return room && room.container ? room.container.items.find((item) => auctionItemCells(item).some((cell) => cell.x === x && cell.y === y)) || null : null;
  }
  function auctionEnsureExplored(player) {
    if (!player.exploredCells || typeof player.exploredCells !== 'object' || Array.isArray(player.exploredCells)) player.exploredCells = {};
    if (!Number.isFinite(player.exploredRound)) player.exploredRound = 0;
    return player.exploredCells;
  }
  function auctionCellKnown(room, player, key) {
    const personal = player ? auctionEnsureExplored(player) : {};
    return !!(room.publicExploredCells && room.publicExploredCells[key]) || !!personal[key];
  }
  function auctionRevealPlayerCell(player, x, y) {
    const cells = auctionEnsureExplored(player); const key = auctionCellKey(x, y); const changed = !cells[key]; cells[key] = true; return changed;
  }
  function auctionItemFullyExplored(room, player, item) {
    return auctionItemCells(item).every((cell) => auctionCellKnown(room, player, cell.key));
  }
  function auctionRevealItemOutline(player, item) {
    const changed = []; auctionItemCells(item).forEach((cell) => { if (auctionRevealPlayerCell(player, cell.x, cell.y)) changed.push(auctionCellLabel(cell.x, cell.y)); }); return changed;
  }
  function auctionRevealItemPartial(room, player, item, count) {
    const pool = shuffle(auctionItemCells(item).filter((cell) => !auctionCellKnown(room, player, cell.key)));
    const changed = []; pool.slice(0, Math.max(0, count || 0)).forEach((cell) => { auctionRevealPlayerCell(player, cell.x, cell.y); changed.push(auctionCellLabel(cell.x, cell.y)); }); return changed;
  }
  function auctionRevealRandomCells(room, player, count, predicate) {
    const pool = [];
    for (let y = 0; y < AUCTION_GRID_HEIGHT; y++) for (let x = 0; x < AUCTION_GRID_WIDTH; x++) {
      const key = auctionCellKey(x, y); const item = auctionFindItemAt(room, x, y);
      if (!auctionCellKnown(room, player, key) && (!predicate || predicate(item, x, y))) pool.push({ x, y, key });
    }
    const changed = []; shuffle(pool).slice(0, Math.max(0, count || 0)).forEach((cell) => {
      auctionRevealPlayerCell(player, cell.x, cell.y); changed.push(auctionCellLabel(cell.x, cell.y));
    }); return changed;
  }
  function auctionRevealPublicCells(room, count) {
    if (!room.publicExploredCells || typeof room.publicExploredCells !== 'object' || Array.isArray(room.publicExploredCells)) room.publicExploredCells = {};
    const all = []; const occupied = [];
    for (let y = 0; y < AUCTION_GRID_HEIGHT; y++) for (let x = 0; x < AUCTION_GRID_WIDTH; x++) {
      const key = auctionCellKey(x, y); if (room.publicExploredCells[key]) continue;
      const cell = { x, y, key }; all.push(cell); if (auctionFindItemAt(room, x, y)) occupied.push(cell);
    }
    const selected = shuffle(occupied).slice(0, Math.min(Math.max(0, count - 1), occupied.length)); const picked = {};
    selected.forEach((cell) => { picked[cell.key] = true; });
    shuffle(all.filter((cell) => !picked[cell.key])).slice(0, Math.max(0, count - selected.length)).forEach((cell) => selected.push(cell));
    selected.forEach((cell) => { room.publicExploredCells[cell.key] = true; });
    const labels = selected.map((cell) => auctionCellLabel(cell.x, cell.y));
    room.publicIntel = labels.length ? `第${room.round}轮公共探照灯揭开：${labels.join('、')}` : '公共探照灯没有发现新的区域。';
    return labels;
  }
  function auctionAssistantRange(actualValue, spread, label, confidence) {
    const actual = Math.max(0, Math.round(Number(actualValue) || 0));
    if (!actual) return { label, low: 0, high: 0, confidence: confidence || '样本不足' };
    const width = Math.max(5000, actual * Math.max(0.08, spread || 0.2));
    const center = actual * (1 + (Math.random() * 2 - 1) * Math.max(0.02, spread || 0.2) * 0.24);
    let low = Math.max(0, Math.floor(Math.min(actual - 1000, center - width) / 1000) * 1000);
    let high = Math.ceil(Math.max(actual + 1000, center + width) / 1000) * 1000;
    if (low === high) high += 1000;
    return { label, low, high, confidence: confidence || '中等' };
  }
  function auctionSetAssistantReport(room, player, helper, summary, stats, valuation) {
    player.assistantReport = {
      kind: helper.kind || 'reveal', typeLabel: helper.typeLabel || '商品情报', triggerLabel: helper.triggerLabel || '主动',
      round: room.round, summary: summary || '', stats: Array.isArray(stats) ? stats.slice(0, 4) : [], valuation: valuation || null
    };
    player.intel = summary || '';
  }
  function auctionApplyAssistantIntel(room, player, phaseValue) {
    const helper = AUCTION_ASSISTANTS[player.assistant];
    const outcome = { applied: false, revealed: [], stats: [], valuation: null, summary: '' };
    if (!helper || !room || !room.container) return outcome;
    const phase = phaseValue === true ? 'start' : phaseValue === false ? 'round' : String(phaseValue || 'start');
    if (!player.assistantMilestones || typeof player.assistantMilestones !== 'object' || Array.isArray(player.assistantMilestones)) player.assistantMilestones = {};
    const revealedItems = [];
    function matches(item) {
      if (helper.filter === 'low') return item.rarity <= 1;
      if (helper.filter === 'high') return item.rarity >= 2;
      if (helper.filter === 'large') return item.width * item.height >= 4;
      if (helper.filter === 'category') return (helper.categories || []).indexOf(item.category) >= 0;
      return true;
    }
    function revealPool(pool, count) {
      const selected = shuffle((pool || []).filter((item) => !auctionItemFullyExplored(room, player, item))).slice(0, Math.max(0, count));
      selected.forEach((item) => {
        auctionRevealItemOutline(player, item);
        const fields = [];
        if (helper.revealCategory) fields.push('category');
        if (helper.revealCondition) fields.push('condition');
        if (helper.revealAuthenticity) fields.push('authenticity');
        if (fields.length) auctionReveal(player, item, fields);
        if (revealedItems.indexOf(item) < 0) revealedItems.push(item);
      });
      return selected;
    }
    function revealRandom(count, allowFallback) {
      let pool = room.container.items.filter((item) => matches(item));
      if (allowFallback !== false && !pool.some((item) => !auctionItemFullyExplored(room, player, item))) pool = room.container.items;
      return revealPool(pool, count);
    }
    function revealAll(pool) { return revealPool(pool, (pool || []).length); }
    function rarityCount(rarity) { return room.container.items.filter((item) => item.rarity === rarity).length; }

    if (helper.effect === 'lowMarket') {
      if (phase !== 'start' || player.assistantMilestones.opening) return outcome;
      const lowItems = room.container.items.filter((item) => item.rarity <= 2); const lowValue = lowItems.reduce((sum, item) => sum + item.value, 0);
      outcome.stats = [
        { label: '常见', value: rarityCount(0), tone: 'neutral' }, { label: '少见', value: rarityCount(1), tone: 'positive' },
        { label: '稀有', value: rarityCount(2), tone: 'accent' }, { label: '低阶合计', value: lowItems.length, tone: 'warning' }
      ];
      outcome.valuation = auctionAssistantRange(lowValue, 0.24, '低档货回收价带', '中等');
      outcome.summary = `玛丽亚完成开局排雷：低阶货共${lowItems.length}件，价带只覆盖常见至稀有货品。`;
      player.assistantMilestones.opening = true; outcome.applied = true;
    } else if (helper.effect === 'highMarket') {
      const upgraded = phase === 'round' && room.round >= 3 && !player.assistantMilestones.round3;
      if (phase !== 'start' && !upgraded) return outcome;
      if (phase === 'start' && player.assistantMilestones.opening) return outcome;
      const highItems = room.container.items.filter((item) => item.rarity >= 2); const highValue = highItems.reduce((sum, item) => sum + item.value, 0);
      outcome.stats = [
        { label: '稀有', value: rarityCount(2), tone: 'accent' }, { label: '珍奇', value: rarityCount(3), tone: 'positive' },
        { label: '传说', value: rarityCount(4), tone: 'warning' }, { label: '高阶合计', value: highItems.length, tone: 'neutral' }
      ];
      if (upgraded) outcome.valuation = auctionAssistantRange(highValue, 0.16, '高阶货成交价带', '较高');
      outcome.summary = upgraded
        ? `维克托完成第3轮复算：高阶货共${highItems.length}件，传说品质${rarityCount(4)}件。`
        : `维克托提交开局稀缺账本：高阶货共${highItems.length}件，传说品质${rarityCount(4)}件。`;
      player.assistantMilestones[upgraded ? 'round3' : 'opening'] = true; outcome.applied = true;
    } else if (helper.effect === 'scaleMarket') {
      const upgraded = phase === 'round' && room.round >= 3 && !player.assistantMilestones.round3;
      if (phase !== 'start' && !upgraded) return outcome;
      if (phase === 'start' && player.assistantMilestones.opening) return outcome;
      const items = room.container.items; const occupied = items.reduce((sum, item) => sum + item.shape.length, 0);
      const large = items.filter((item) => item.width * item.height >= 4).length; const high = items.filter((item) => item.rarity >= 2).length;
      outcome.stats = [
        { label: '货品', value: items.length, tone: 'neutral' }, { label: '占格', value: `${occupied}/120`, tone: 'accent' },
        { label: '大型', value: large, tone: 'warning' }, { label: '高阶', value: high, tone: 'positive' }
      ];
      outcome.valuation = auctionAssistantRange(room.container.saleValue, upgraded ? 0.14 : 0.34, upgraded ? '第3轮整箱估价' : '开局整箱估价', upgraded ? '较高' : '粗略');
      outcome.summary = upgraded
        ? `艾哈迈德结合前三轮情报，把${items.length}件货的整箱估价进一步收窄。`
        : `艾哈迈德完成开局盘货：${items.length}件货占${occupied}格，其中大型货${large}件。`;
      player.assistantMilestones[upgraded ? 'round3' : 'opening'] = true; outcome.applied = true;
    } else if (helper.effect === 'isabella') {
      if (phase !== 'start') return outcome;
      const ranked = room.container.items.slice().sort((a, b) => b.rarity - a.rarity || b.value - a.value);
      if (ranked.length) revealPool([ranked[0]], 1);
      revealPool(room.container.items.filter((item) => item.category === '奢侈品' && item !== ranked[0]), 4);
      if (!revealedItems.length) return outcome;
      outcome.stats = [{ label: '最高品质', value: ranked[0].rarityName, tone: 'warning' }, { label: '奢侈品轮廓', value: Math.max(0, revealedItems.length - 1), tone: 'accent' }];
      outcome.summary = `伊莎贝拉锁定了最高品质${ranked[0].rarityName}货品，并探清${Math.max(0, revealedItems.length - 1)}件奢侈品轮廓。`; outcome.applied = true;
    } else if (helper.effect === 'categoryAll') {
      if (phase === 'start') {
        const targets = room.container.items.filter((item) => (helper.categories || []).indexOf(item.category) >= 0); revealAll(targets);
        const categoryText = (helper.categories || []).join('、');
        outcome.stats = (helper.categories || []).map((category) => ({ label: category, value: targets.filter((item) => item.category === category).length, tone: 'accent' }));
        if (helper.reportHigh) outcome.stats.push({ label: '高阶货', value: targets.filter((item) => item.rarity >= 2).length, tone: 'warning' });
        if (helper.reportRarities) outcome.stats.push({ label: '最高品质', value: targets.length ? AUCTION_RARITIES[Math.max.apply(null, targets.map((item) => item.rarity))] : '无', tone: 'warning' });
        outcome.summary = targets.length ? `${player.assistant}探清了全部${categoryText}货品，共${targets.length}件。` : `${player.assistant}确认本箱没有${categoryText}货品。`;
        outcome.applied = true;
      } else if (helper.roundItems) {
        revealPool(room.container.items, helper.roundItems);
        if (!revealedItems.length) return outcome;
        outcome.summary = `${player.assistant}本轮随机补探${revealedItems.length}件货品的完整轮廓。`; outcome.applied = true;
      }
    } else if (helper.effect === 'finalAll') {
      if (phase === 'start' && room.round < 5) {
        outcome.summary = `${player.assistant}已经进入潜伏观察，第5轮将一次性公开全部剩余轮廓。`; outcome.applied = true;
      } else if (room.round >= 5 && !player.assistantMilestones.finalAll) {
        revealAll(room.container.items); player.assistantMilestones.finalAll = true;
        outcome.summary = `${player.assistant}发动终局洞察，公开了${revealedItems.length}件剩余货品。`; outcome.applied = true;
      }
    } else {
      if (phase === 'start') revealRandom(helper.startItems || 1, true);
      else {
        if (helper.finalAll && room.round >= 5 && !player.assistantMilestones.finalAll) {
          revealAll(room.container.items); player.assistantMilestones.finalAll = true;
        } else revealRandom(helper.roundItems || 0, true);
      }
      if (revealedItems.length) {
        outcome.summary = `${player.assistant}${room.round >= 5 && helper.finalAll ? '在终局' : '随机'}探清了${revealedItems.map((item) => `${item.name}（${item.sizeLabel}）`).join('、')}的完整轮廓。`;
        outcome.applied = true;
      }
    }
    outcome.revealed = revealedItems.map((item) => item.slot);
    if (outcome.applied) auctionSetAssistantReport(room, player, helper, outcome.summary, outcome.stats, outcome.valuation);
    return outcome;
  }
  function auctionEstimatePlayer(room, player) {
    const actual = room.container.saleValue; const styleNoise = player.isBot && player.style ? player.style.noise : 0.24;
    let known = 0; for (let y = 0; y < AUCTION_GRID_HEIGHT; y++) for (let x = 0; x < AUCTION_GRID_WIDTH; x++) if (auctionCellKnown(room, player, auctionCellKey(x, y))) known++;
    const knowledge = Math.min(1, known / (AUCTION_GRID_WIDTH * AUCTION_GRID_HEIGHT * 0.55));
    const bias = 1 + (Math.random() * 2 - 1) * styleNoise * (1 - knowledge * 0.48);
    player.privateEstimate = Math.max(1000, Math.round(actual * bias / 1000) * 1000);
  }
  function auctionMinimumEstimate(room, player) {
    if (!room || !room.container || !player) return 0;
    const catalog = auctionCatalog(); const worstCondition = Math.min.apply(null, AUCTION_CONDITIONS.map((row) => row.multiplier)); let total = 0;
    room.container.items.forEach((item) => {
      const shown = auctionItemCells(item).some((cell) => auctionCellKnown(room, player, cell.key)); if (!shown) return;
      const fullyKnown = auctionItemFullyExplored(room, player, item); const intel = auctionIntelFor(player, item);
      const definition = fullyKnown ? catalog.find((row) => row.id === item.id) : null;
      const rarityPool = catalog.filter((row) => row.rarity === item.rarity);
      const base = definition ? definition.min : rarityPool.length ? Math.min.apply(null, rarityPool.map((row) => row.min)) : 1000;
      const conditionMultiplier = intel.condition ? AUCTION_CONDITIONS[item.conditionIndex].multiplier : worstCondition;
      const authenticityMultiplier = intel.authenticity && item.authentic ? 1 : 0.16;
      total += Math.max(1000, Math.floor(base * conditionMultiplier * authenticityMultiplier / 1000) * 1000);
    });
    return Math.max(0, total);
  }
  function createAuctionRoom(ownerId, ownerName, ownerPaid, assistant, venueName, roomMode) {
    const venue = auctionVenueName(venueName) || '新手仓';
    return {
      game: 'auction', auctionRate: AUCTION_RATE, ownerId, entry: 0, status: 'waiting', round: 0, maxRounds: 5, venue, mode: roomMode === 'solo' ? 'solo' : 'multiplayer',
      players: [auctionPlayer(ownerId, ownerName, false, ownerPaid, assistant)], container: null,
      lastRanking: [], feedback: [], publicExploredCells: {}, publicIntel: '', logs: [`${ownerName}${ownerPaid ? '' : '以游客身份'}进入竞拍仓库。`],
      winnerId: '', winningBid: 0, result: null, settled: false, createdAt: nowMs(), updatedAt: nowMs()
    };
  }
  function auctionAddBots(room, count) {
    count = clamp(int(count, 1), 1, 5);
    for (let i = 0; i < count && room.players.length < AUCTION_MAX_PLAYERS; i++) {
      const botIndex = room.players.filter((player) => player.isBot).length;
      const name = AUCTION_BOT_NAMES[botIndex % AUCTION_BOT_NAMES.length];
      room.players.push(auctionPlayer(`${BOT_PREFIX}auction:${nowMs()}:${room.players.length}`, name, true, false, '', botIndex));
    }
    room.updatedAt = nowMs();
  }
  function auctionFindPlayer(room, value, excludeId) {
    const key = String(value || '').trim();
    if (!key) return null;
    return room.players.find((player) => player.id !== excludeId && (player.id === key || player.name === key)) || null;
  }
  function auctionBudget(player) {
    if (player.isBot) return Math.max(300000, int(player.botBudget, 0));
    if (isGuestPlayer(player)) return Math.max(AUCTION_RATE, seal.ext.getIntConfig(ext, '竞拍游客预算'));
    const profile = loadProfile(player.id, player.name);
    return Math.max(0, (profile.coins + int(player.heldCoins, 0)) * AUCTION_RATE);
  }
  function auctionRefundPlayer(player) {
    const held = Math.max(0, int(player && player.heldCoins, 0));
    if (!player || player.isBot || !isSettlementEligible(player) || !held) { if (player) player.heldCoins = 0; return; }
    const profile = loadProfile(player.id, player.name); profile.coins += held; saveProfile(profile); player.heldCoins = 0;
  }
  function refundAuctionEscrow(room) {
    if (!room || room.auctionEscrowRefunded) return;
    (room.players || []).forEach(auctionRefundPlayer); room.auctionEscrowRefunded = true;
  }
  function auctionBeginRoundIntel(room) {
    auctionRevealPublicCells(room, AUCTION_PUBLIC_CELLS_PER_ROUND);
    room.players.forEach((player) => {
      if (!player.active) return;
      player.exploredRound = 0;
      if (player.isBot) auctionRevealRandomCells(room, player, 1);
      if (player.assistantActivated) auctionApplyAssistantIntel(room, player, false);
    });
  }
  function auctionStart(room) {
    if (!room || room.status !== 'waiting') return '只有等待中的房间可以开始。';
    room.auctionRate = AUCTION_RATE;
    while (room.players.filter((player) => player.isBot).length < 3 && room.players.length < AUCTION_MAX_PLAYERS) auctionAddBots(room, 1);
    if (room.players.filter((player) => player.isBot).length < 3) return '至少需要三个机器人席位，请减少真人数量后重试。';
    room.venue = auctionVenueName(room.venue) || '新手仓'; room.container = auctionCreateContainer(room.venue);
    room.round = 1; room.status = 'playing'; room.publicExploredCells = {}; room.publicIntel = '';
    room.feedback = [room.mode === 'solo' ? '单机模式出价后自动确认并结算本轮。' : '多人模式可反复修改；确认前不会进入结算。'];
    room.players.forEach((player, index) => {
      player.active = true; player.passed = false; player.status = '观察中'; player.bid = 0; player.maxBid = 0;
      player.heldCoins = 0; player.submittedRound = 0; player.confirmedRound = 0; player.rank = 0; player.rankRound = 0; player.rankHistory = [0, 0, 0, 0, 0]; player.lastRank = 0;
      player.itemIntel = {}; player.exploredCells = {}; player.exploredRound = 0; player.skillUsed = false; player.assistantActivated = false;
      player.assistantReport = null; player.assistantMilestones = {}; player.intel = '';
      if (player.isBot) {
        player.botBudget = Math.max(300000, Math.round(room.container.saleValue * (0.7 + Math.random() * 1.15) / AUCTION_RATE) * AUCTION_RATE);
        const possibleTargets = room.players.filter((other) => other.id !== player.id);
        if (possibleTargets.length && Math.random() < 0.38) player.style.rivalryTarget = pick(possibleTargets).id;
        if (possibleTargets.length && Math.random() < 0.24) player.style.allianceTarget = pick(possibleTargets).id;
      }
    });
    auctionBeginRoundIntel(room);
    room.players.forEach((player) => {
      const helper = AUCTION_ASSISTANTS[player.assistant];
      if (helper && helper.autoStart) {
        player.assistantActivated = true; player.skillUsed = true; auctionApplyAssistantIntel(room, player, 'start');
      }
      auctionEstimatePlayer(room, player);
    });
    room.logs.push(`${room.container.theme}集装箱进场，五轮暗标开始。`); room.updatedAt = nowMs();
    auctionRunBots(room); return '';
  }
  function auctionRoundRatio(round) { return [0, 2, 1.6, 1.3, 1.1][round] || 1; }
  function auctionRoundFraction(round) { return [0, 0.38, 0.57, 0.73, 0.86, 0.97][Math.min(5, round)] || 1.03; }
  function auctionBotDecision(room, player) {
    if (!player.active || player.confirmedRound === room.round) return;
    const style = player.style; auctionEstimatePlayer(room, player);
    const estimate = player.privateEstimate * (1 + style.tilt * 0.07);
    const target = Math.min(player.botBudget, estimate * style.risk);
    const lastTop = room.lastRanking.length ? room.lastRanking[0].id : '';
    let fraction = auctionRoundFraction(room.round) * style.aggression;
    if (player.lastRank > 2) fraction += 0.05 + style.tilt * 0.025;
    if (style.rivalryTarget && lastTop === style.rivalryTarget) fraction += 0.07;
    if (style.allianceTarget && lastTop === style.allianceTarget) fraction -= 0.05;
    if (style.noise >= 0.22 && player.lastRank > 1) style.tilt = Math.min(5, style.tilt + 1);
    const bluffing = room.round <= 2 && Math.random() < style.bluff; if (bluffing) fraction *= 1.18 + Math.random() * 0.28;
    if (room.round >= 3 && player.lastRaise > estimate * 0.2 && Math.random() < 0.48) fraction *= 0.78 + Math.random() * 0.12;
    const noise = 0.90 + Math.random() * 0.19;
    let nextBid = Math.max(AUCTION_RATE, Math.round(estimate * fraction * noise / AUCTION_RATE) * AUCTION_RATE);
    nextBid = Math.min(player.botBudget, nextBid);
    const shouldPass = nextBid > target * (1.03 + style.tilt * 0.025) || (room.round >= 3 && Math.random() < style.quit && player.lastRank > 2);
    if (shouldPass) {
      player.active = false; player.passed = true; player.status = '已离场'; player.submittedRound = room.round; player.confirmedRound = room.round;
      room.logs.push(`${player.name}选择放弃本箱。`); return;
    }
    player.lastRaise = nextBid - player.bid; player.bid = nextBid; player.maxBid = Math.max(player.maxBid, nextBid);
    player.submittedRound = room.round; player.confirmedRound = room.round; player.status = '已确认';
  }
  function auctionRunBots(room) {
    room.players.filter((player) => player.isBot && player.active).forEach((player) => auctionBotDecision(room, player));
  }
  function auctionAllHumansSubmitted(room) {
    return room.players.filter((player) => !player.isBot && player.active).every((player) => player.confirmedRound === room.round);
  }
  function auctionPlaceBid(room, id, rawAmount) {
    if (!room || room.status !== 'playing') return '竞拍尚未开始或已经结束。';
    const player = room.players.find((item) => item.id === id); if (!player) return '你不在这个竞拍房间中。';
    if (!player.active) return '你已经放弃本箱，不能重新入场。';
    if (player.confirmedRound === room.round) return '本轮暗标已经确认；若尚未结算，请先发送“.竞拍 撤回”。';
    let amount = Math.floor(int(rawAmount, 0) / AUCTION_RATE) * AUCTION_RATE;
    if (amount < AUCTION_RATE) return `出价使用竞拍币且必须为${AUCTION_RATE}的整数倍，例如“.竞拍 出价 120000”。`;
    const budget = auctionBudget(player); if (amount > budget) return `可用预算不足；本场最多可锁定 ${budget} 竞拍币。`;
    if (isSettlementEligible(player)) {
      const required = amount / AUCTION_RATE; const delta = required - player.heldCoins;
      const profile = loadProfile(player.id, player.name); if (delta > profile.coins) return '游戏币余额已发生变化，无法锁定这笔暗标。';
      profile.coins -= delta; saveProfile(profile); player.heldCoins = required;
    }
    player.lastRaise = amount - player.bid; player.bid = amount; player.maxBid = Math.max(player.maxBid, amount);
    player.submittedRound = room.round; player.confirmedRound = room.mode === 'solo' ? room.round : 0;
    player.status = room.mode === 'solo' ? '已确认' : '调整中'; room.logs.push(`${player.name}更新了第${room.round}轮暗标。`); room.updatedAt = nowMs();
    return '';
  }
  function auctionConfirmBid(room, id) {
    if (!room || room.status !== 'playing') return '竞拍尚未开始或已经结束。';
    if (room.mode === 'solo') return '单机模式出价后会自动确认，无需再次确认。';
    const player = room.players.find((item) => item.id === id); if (!player || !player.active) return '你不在有效竞拍席位中。';
    if (player.bid < AUCTION_RATE) return '请先用“.竞拍 出价 金额”设置暗标。';
    if (player.submittedRound !== room.round) player.submittedRound = room.round;
    player.confirmedRound = room.round; player.status = '已确认'; room.logs.push(`${player.name}确认了第${room.round}轮暗标。`); room.updatedAt = nowMs(); return '';
  }
  function auctionWithdrawBid(room, id) {
    if (!room || room.status !== 'playing') return '竞拍尚未开始或已经结束。';
    const player = room.players.find((item) => item.id === id); if (!player || !player.active) return '你不在有效竞拍席位中。';
    if (player.confirmedRound !== room.round) return '本轮暗标尚未确认，可以直接继续修改。';
    player.confirmedRound = 0; player.status = '调整中'; room.updatedAt = nowMs(); return '';
  }
  function auctionPass(room, id) {
    if (!room || room.status !== 'playing') return '竞拍尚未开始或已经结束。';
    const player = room.players.find((item) => item.id === id); if (!player) return '你不在这个竞拍房间中。';
    if (!player.active) return '你已经放弃本箱。';
    if (player.confirmedRound === room.round) return '本轮暗标已确认；若尚未结算，请先发送“.竞拍 撤回”。';
    auctionRefundPlayer(player); player.active = false; player.passed = true; player.status = '主动放弃'; player.submittedRound = room.round;
    room.logs.push(`${player.name}果断放弃，没有继续接盘。`); room.updatedAt = nowMs(); return '';
  }
  function auctionCargoTarget(room, value, rowValue) {
    if (!room || !room.container) return null;
    const cell = auctionParseCell(value, rowValue);
    if (cell) return { cell, item: auctionFindItemAt(room, cell.x, cell.y) };
    return null;
  }
  function auctionExploreCell(room, id, value, rowValue) {
    if (!room || room.status !== 'playing') return '只有竞拍进行中可以探索货柜。';
    const player = room.players.find((item) => item.id === id); if (!player || !player.active) return '你不在有效竞拍席位中。';
    if (player.exploredRound === room.round) return `第${room.round}轮已经进行过个人探索；下一轮才能再次探索。`;
    const cell = auctionParseCell(value, rowValue); if (!cell) return '请指定12×10货柜坐标，例如“.竞拍 探索 A1”或“.竞拍 探索 3 4”。';
    const key = auctionCellKey(cell.x, cell.y); if (auctionCellKnown(room, player, key)) return `${auctionCellLabel(cell.x, cell.y)}已经揭开，本轮探索次数尚未消耗。`;
    auctionRevealPlayerCell(player, cell.x, cell.y); player.exploredRound = room.round;
    const item = auctionFindItemAt(room, cell.x, cell.y); const label = auctionCellLabel(cell.x, cell.y);
    if (!item) player.intel = `${label}是空置区域，没有发现货物。`;
    else if (auctionItemFullyExplored(room, player, item)) player.intel = `${label}补全了完整轮廓：${item.rarityName} · ${item.name}。`;
    else player.intel = `${label}显示${item.rarityName}品质色，但货物轮廓尚未完整。`;
    room.logs.push(`${player.name}探索了货柜坐标${label}。`); room.updatedAt = nowMs(); return '';
  }
  function auctionUseTool(room, id, toolName, targetName) {
    if (!room || room.status !== 'playing') return '只有竞拍进行中可以使用道具。';
    const player = room.players.find((item) => item.id === id); if (!player || !player.active) return '你不在有效竞拍席位中。';
    const index = player.tools.indexOf(toolName); if (index < 0) return `你没有“${toolName}”。`;
    const definition = AUCTION_TOOLS.find((tool) => tool.name === toolName); if (!definition) return '未知道具。';
    const targetInfo = definition.mode === 'shapes' ? null : auctionCargoTarget(room, targetName);
    if (definition.mode !== 'shapes' && !targetInfo) return `请指定货柜坐标，例如“.竞拍 道具 ${toolName} A1”。`;
    let labels = [];
    if (definition.mode === 'shapes') labels = auctionRevealRandomCells(room, player, 2);
    else {
      const target = targetInfo.item; const cell = targetInfo.cell; const label = auctionCellLabel(cell.x, cell.y);
      if (!auctionCellKnown(room, player, auctionCellKey(cell.x, cell.y))) { auctionRevealPlayerCell(player, cell.x, cell.y); labels.push(label); }
      if (target && definition.mode === 'shapeCondition') { labels = labels.concat(auctionRevealItemPartial(room, player, target, 1)); auctionReveal(player, target, ['condition']); }
      else if (target && definition.mode === 'category') auctionReveal(player, target, ['category']);
      else if (target && definition.mode === 'authenticity') auctionReveal(player, target, ['authenticity']);
      else if (target && definition.mode === 'categoryRarity') { labels = labels.concat(auctionRevealItemPartial(room, player, target, 1)); auctionReveal(player, target, ['category']); }
      player.intel = target && auctionItemFullyExplored(room, player, target)
        ? `${toolName}补全了${target.name}的完整轮廓。`
        : `${toolName}查验了${label}${target ? `，呈现${target.rarityName}品质色` : '，确认这里没有货物'}。`;
    }
    if (definition.mode === 'shapes') player.intel = `${toolName}揭开了格子 ${labels.join('、') || '无'}。`;
    player.tools.splice(index, 1); room.logs.push(`${player.name}使用了${toolName}查验货品。`); room.updatedAt = nowMs(); return '';
  }
  function auctionUseSkill(room, id) {
    if (!room || room.status !== 'playing') return '只有竞拍进行中可以使用助手技能。';
    const player = room.players.find((item) => item.id === id); if (!player || !player.active) return '你不在有效竞拍席位中。';
    const assistant = AUCTION_ASSISTANTS[player.assistant]; if (!assistant) return '当前助手资料无效。';
    if (player.skillUsed) return assistant.autoStart ? `${player.assistant}的开局被动已经自动生效，报告已显示在界面中。` : '本场助手技能已经使用过。';
    const outcome = auctionApplyAssistantIntel(room, player, 'start');
    if (!outcome.applied) return '货柜中已经没有可供当前助手处理的合法情报，技能尚未消耗。';
    player.assistantActivated = true; player.skillUsed = true;
    room.logs.push(`${player.name}发动${player.assistant}的${assistant.skill}${outcome.revealed.length ? `，探清了${outcome.revealed.length}件货品` : '，取得了专属报告'}。`); room.updatedAt = nowMs(); return '';
  }
  function auctionWinnerItems(room, winner) {
    return room.container.items.map((item) => Object.assign({}, item, { shape: item.shape.map((cell) => [cell[0], cell[1]]) }));
  }
  function recordAuctionDex(stats, items) {
    if (!stats.auctionDex || typeof stats.auctionDex !== 'object' || Array.isArray(stats.auctionDex)) stats.auctionDex = {};
    items.forEach((item) => {
      const previous = stats.auctionDex[item.id] && typeof stats.auctionDex[item.id] === 'object' ? stats.auctionDex[item.id] : {};
      stats.auctionDex[item.id] = {
        id: item.id, name: item.name, category: item.category, rarity: item.rarity, width: item.width, height: item.height, sizeLabel: item.sizeLabel,
        count: Math.max(0, int(previous.count, 0)) + 1,
        bestValue: Math.max(int(previous.bestValue, 0), int(item.value, 0))
      };
      if (!stats.auctionTopItem || item.value > int(stats.auctionTopItem.value, 0)) {
        stats.auctionTopItem = { id: item.id, name: item.name, category: item.category, rarity: item.rarity, value: item.value, sizeLabel: item.sizeLabel };
      }
    });
  }
  function auctionRecordParticipant(room, player, winner, items, saleValue) {
    if (!isSettlementEligible(player)) return;
    if (player !== winner) auctionRefundPlayer(player);
    const profile = loadProfile(player.id, player.name); const stats = profile.stats.auction || emptyGameStats();
    if (!stats.auctionVenueStats || typeof stats.auctionVenueStats !== 'object') stats.auctionVenueStats = {};
    const venueStats = stats.auctionVenueStats[room.venue] || { plays: 0, wins: 0, profit: 0, items: 0 };
    venueStats.plays++;
    stats.highestBid = Math.max(int(stats.highestBid, 0), int(player.maxBid, 0));
    stats.auctionBidRounds += Math.max(1, int(room.round, 1));
    if (player.passed) stats.auctionPasses++;
    let outcome = 'draw'; let score = 0; let profitCoins = 0; let affectionDelta = 0;
    if (player === winner) {
      const costCoins = Math.max(0, int(player.heldCoins, 0));
      const rebate = 0;
      const saleCoins = Math.max(0, Math.floor(saleValue / AUCTION_RATE));
      profile.coins += saleCoins + rebate; player.heldCoins = 0;
      profitCoins = saleCoins + rebate - costCoins; score = saleValue - room.winningBid + rebate * AUCTION_RATE;
      outcome = score > 0 ? 'win' : score < 0 ? 'loss' : 'draw';
      affectionDelta = score > 0 ? affectionRules().win : score < 0 ? affectionRules().loss : 0;
      if (affectionDelta) changeAffection(profile, affectionDelta);
      stats.auctionSpend += room.winningBid; stats.auctionRevenue += saleValue; stats.auctionContainers++;
      stats.bestAuctionProfit = Math.max(int(stats.bestAuctionProfit, 0), score);
      stats.mostAuctionItems = Math.max(int(stats.mostAuctionItems, 0), items.length);
      recordAuctionDex(stats, items);
      venueStats.wins++; venueStats.profit += profitCoins; venueStats.items += items.length;
      player.coinDelta = profitCoins; player.affectionDelta = affectionDelta; player.rebateCoins = rebate;
    } else { player.coinDelta = 0; player.affectionDelta = 0; }
    stats.auctionVenueStats[room.venue] = venueStats; profile.stats.auction = stats;
    recordGame(profile, 'auction', outcome, score, profitCoins, { affectionDelta });
  }
  function auctionFinish(room, winner) {
    if (!room || room.settled) return;
    room.settled = true; room.status = 'finished'; room.updatedAt = nowMs();
    if (!winner) {
      room.players.forEach((player) => {
        if (!player.isBot && isSettlementEligible(player)) {
          auctionRefundPlayer(player); const profile = loadProfile(player.id, player.name); const stats = profile.stats.auction || emptyGameStats();
          stats.highestBid = Math.max(int(stats.highestBid, 0), int(player.maxBid, 0)); stats.auctionBidRounds += Math.max(1, int(room.round, 1));
          if (player.passed) stats.auctionPasses++; profile.stats.auction = stats; recordGame(profile, 'auction', 'draw', 0, 0, { affectionDelta: 0 });
        }
      });
      room.result = { sold: false, winnerName: '', winningBid: 0, saleValue: 0, profit: 0, items: [] };
      room.logs.push('所有竞拍者都已放弃，集装箱流拍，锁定资金全部退回。'); return;
    }
    room.winnerId = winner.id; room.winningBid = winner.bid;
    const items = auctionWinnerItems(room, winner); const saleValue = items.reduce((sum, item) => sum + item.value, 0);
    room.players.forEach((player) => {
      if (!player.isBot) auctionRecordParticipant(room, player, winner, player === winner ? items : [], player === winner ? saleValue : 0);
    });
    const profit = saleValue - room.winningBid + int(winner.rebateCoins, 0) * AUCTION_RATE;
    room.result = {
      sold: true, winnerId: winner.id, winnerName: winner.name, winnerGuest: isGuestPlayer(winner),
      winningBid: room.winningBid, saleValue, profit, coinDelta: int(winner.coinDelta, 0),
      affectionDelta: int(winner.affectionDelta, 0), rebateCoins: int(winner.rebateCoins, 0),
      items: items.map((item) => Object.assign({}, item))
    };
    if (isGuestPlayer(winner)) room.logs.push(`${winner.name}以游客身份拍下集装箱；开箱正常展示，但钱包、好感与图鉴均不结算。`);
    else room.logs.push(`${winner.name}以${room.winningBid}竞拍币成交，货品出售${saleValue}竞拍币，利润${signedValue(profit)}竞拍币。`);
  }
  function auctionMarketSignals(room, viewer) {
    const bidders = room.players.filter((player) => player.active && player.bid > 0).sort((a, b) => a.bid - b.bid);
    const submittedCount = room.players.filter((player) => player.active && player.confirmedRound === room.round).length;
    const activeCount = room.players.filter((player) => player.active).length;
    if (!bidders.length) return { playerBand: '尚未形成', marketHeat: '冷清', spread: '暂无有效报价', submittedCount, activeCount };
    const average = bidders.reduce((sum, player) => sum + player.bid, 0) / bidders.length;
    const minBid = bidders[0].bid; const maxBid = bidders[bidders.length - 1].bid; const spreadRatio = average > 0 ? (maxBid - minBid) / average : 0;
    const heatRatio = average / Math.max(1000, room.container.saleValue);
    const marketHeat = heatRatio < 0.35 ? '冷清' : heatRatio < 0.55 ? '谨慎' : heatRatio < 0.78 ? '升温' : heatRatio < 1.02 ? '激烈' : '失控';
    const spread = spreadRatio < 0.18 ? '报价集中' : spreadRatio < 0.48 ? '分歧明显' : '差距极大';
    let playerBand = '尚未出价';
    if (viewer && viewer.bid > 0 && maxBid === minBid) playerBand = '中段';
    else if (viewer && viewer.bid > 0) {
      const below = bidders.filter((player) => player.bid < viewer.bid).length; const percentile = below / Math.max(1, bidders.length - 1);
      playerBand = percentile >= 0.82 ? '领跑区' : percentile >= 0.62 ? '偏高' : percentile >= 0.38 ? '中段' : percentile >= 0.18 ? '偏低' : '明显偏低';
    }
    return { playerBand, marketHeat, spread, submittedCount, activeCount };
  }
  function auctionResolveRound(room) {
    if (!room || room.status !== 'playing') return;
    const resolvedRound = room.round; const historyIndex = Math.min(4, Math.max(0, resolvedRound - 1));
    room.players.forEach((player) => { auctionRankHistory(player)[historyIndex] = 0; player.rank = 0; player.rankRound = resolvedRound; });
    const bidders = room.players.filter((player) => player.active && player.bid > 0).sort((a, b) => b.bid - a.bid || a.name.localeCompare(b.name));
    if (!bidders.length) { auctionFinish(room, null); return; }
    let rank = 0; let previousBid = null;
    room.lastRanking = bidders.map((player, index) => {
      if (previousBid !== player.bid) rank = index + 1; previousBid = player.bid;
      player.lastRank = rank; player.rank = rank; player.rankRound = resolvedRound; auctionRankHistory(player)[historyIndex] = rank;
      return { id: player.id, rank };
    });
    const signals = auctionMarketSignals(room, null);
    room.feedback = [`第${room.round}轮总体热度：${signals.marketHeat}`, `第${room.round}轮名次已写入各席位轨迹；具体金额继续保密。`];
    const highest = bidders[0]; const second = bidders[1] || null; const activeCount = room.players.filter((player) => player.active).length;
    if (activeCount === 1 || !second) { room.feedback.push('只剩一名有效竞拍者，集装箱直接成交。'); auctionFinish(room, highest); return; }
    if (room.round <= 4 && highest.bid > second.bid * auctionRoundRatio(room.round)) {
      room.feedback.push(`领先幅度超过本轮${Math.round(auctionRoundRatio(room.round) * 100)}%成交线，提前成交。`); auctionFinish(room, highest); return;
    }
    if (room.round >= 5) {
      const tied = bidders.filter((player) => player.bid === highest.bid);
      if (tied.length === 1) { room.feedback.push('最终轮最高暗标直接成交。'); auctionFinish(room, highest); return; }
      room.round++; room.feedback.push(`出现并列最高价，进入第${room.round}轮加赛。`);
      room.players.forEach((player) => { if (player.active) { player.submittedRound = 0; player.confirmedRound = 0; player.status = '观察中'; } });
      auctionBeginRoundIntel(room);
      auctionRunBots(room); room.updatedAt = nowMs(); return;
    }
    room.round++;
    room.players.forEach((player) => {
      if (!player.active) return;
      player.submittedRound = 0; player.confirmedRound = 0; player.status = '观察中';
      if (player.isBot && player.lastRank > 2) player.style.tilt = Math.min(5, player.style.tilt + (Math.random() < 0.5 ? 1 : 0));
    });
    auctionBeginRoundIntel(room);
    auctionRunBots(room); room.updatedAt = nowMs();
  }
  function auctionAdvance(room) {
    let guard = 0;
    while (room.status === 'playing' && auctionAllHumansSubmitted(room) && guard++ < 12) {
      auctionResolveRound(room);
      if (room.status !== 'playing') break;
      auctionRunBots(room);
      if (!auctionAllHumansSubmitted(room)) break;
    }
  }
  function auctionSelectionView(profile, quote) {
    return {
      kind: 'auction', title: '竞拍之王 · 选择助手', subtitle: '首次进入必须选择 · 赛前可更换 · 游戏中锁定',
      auctionScene: { mode: 'assistant', assistant: null, assistants: auctionAssistantList(), venues: [], players: [], tools: [], feedback: [], items: [] },
      lines: auctionAssistantList().map((assistant) => `${assistant.name} · ${assistant.typeLabel} · ${assistant.skill}：${assistant.description}`),
      quote: quote || '发送“.竞拍 助手 名称”，例如“.竞拍 助手 加布里埃拉”。'
    };
  }
  function auctionMenuView(profile, quote) {
    const assistant = AUCTION_ASSISTANTS[profile.auctionAssistant];
    return {
      kind: 'auction', title: '竞拍之王', subtitle: '默认新手仓 · 12×10战争迷雾 · 五轮暗标',
      auctionScene: {
        mode: 'menu', round: 0, maxRounds: 5, auctionRate: AUCTION_RATE, assistant: assistant ? Object.assign({ name: profile.auctionAssistant }, assistant) : null,
        assistants: [], venues: auctionVenueList(), selectedVenue: '新手仓', players: [], tools: [],
        feedback: ['不同场地的货量、精品率、大件率、仿品率和可见线索不同。'], items: []
      },
      lines: ['.竞拍 助手 [名称]（仅非游戏中）', '.竞拍 人机 [场地] / .竞拍 [场地]', '.竞拍 开房 [场地] / 加入 / 机器人 [数量] / 开始', '.竞拍 探索 [坐标]，例如A1', '.竞拍 出价 [竞拍币] / 放弃', '.竞拍 确认 / 撤回（仅多人房）', '.竞拍 技能（主动助手） / 开局被动会自动生效', '.竞拍 道具 [名称] [坐标] / 场地 / 教程 / 图鉴 / 清理'],
      quote: quote || `${profile.name}的助手：${profile.auctionAssistant} · ${assistant ? assistant.description : ''}`
    };
  }
  function auctionVisibleItem(room, player, item, revealAll) {
    const fullyRevealed = revealAll || (!!player && auctionItemFullyExplored(room, player, item));
    if (!fullyRevealed) return null;
    const intel = revealAll ? { condition: true, authenticity: true } : player ? auctionIntelFor(player, item) : {};
    return {
      id: item.id, slot: item.slot, name: item.name, category: item.category, rarity: item.rarity, rarityName: item.rarityName,
      condition: revealAll || intel.condition ? item.condition : '状态未知',
      authenticity: revealAll || intel.authenticity ? item.authenticity : '真伪未知',
      shapeKnown: true, rarityKnown: true, categoryKnown: true, fullyRevealed: true,
      conditionKnown: !!intel.condition, authenticityKnown: !!intel.authenticity,
      visualType: item.category, visualKnown: true,
      value: revealAll ? item.value : 0, width: item.width, height: item.height, sizeLabel: item.sizeLabel,
      shape: item.shape.map((cell) => [cell[0], cell[1]]), gridX: item.gridX, gridY: item.gridY
    };
  }
  function auctionFogCells(room, player, revealAll) {
    const cells = [];
    for (let y = 0; y < AUCTION_GRID_HEIGHT; y++) for (let x = 0; x < AUCTION_GRID_WIDTH; x++) {
      const key = auctionCellKey(x, y); const publicKnown = !!(room.publicExploredCells && room.publicExploredCells[key]);
      const personalKnown = !!(player && auctionEnsureExplored(player)[key]); const revealed = revealAll || publicKnown || personalKnown;
      const item = revealed ? auctionFindItemAt(room, x, y) : null;
      cells.push({
        x, y, label: auctionCellLabel(x, y), revealed, public: !revealAll && publicKnown, personal: !revealAll && !publicKnown && personalKnown,
        occupied: revealed && !!item, rarity: revealed && item ? item.rarity : -1, rarityName: revealed && item ? item.rarityName : ''
      });
    }
    return cells;
  }
  function auctionRoomView(room, viewerId, quote, privateView) {
    const viewer = room.players.find((player) => player.id === viewerId) || null; const result = room.result;
    const mode = room.status === 'waiting' ? 'waiting' : room.status === 'finished' ? 'result' : 'bidding';
    const assistantData = viewer && AUCTION_ASSISTANTS[viewer.assistant] ? Object.assign({ name: viewer.assistant, used: viewer.skillUsed }, AUCTION_ASSISTANTS[viewer.assistant]) : null;
    const players = room.players.map((player) => ({
      name: roomPlayerName(player), isBot: player.isBot, isGuest: isGuestPlayer(player), active: player.active,
      submitted: room.status === 'playing' && player.submittedRound === room.round,
      confirmed: room.status === 'playing' && player.confirmedRound === room.round,
      status: !player.active ? '已离场' : player.confirmedRound === room.round ? '已确认' : player.submittedRound === room.round ? '调整中' : '观察中',
      isViewer: !!viewer && player.id === viewer.id, ownBid: viewer && player.id === viewer.id ? player.bid : 0,
      rank: Math.max(0, int(player.rank, 0)), rankRound: Math.max(0, int(player.rankRound, 0)), rankHistory: auctionRankHistory(player).slice(0, 5)
    }));
    const signals = room.container ? auctionMarketSignals(room, viewer) : { playerBand: '尚未出价', marketHeat: '等待中', spread: '尚未开场', submittedCount: 0, activeCount: room.players.length };
    const visibleItems = room.container ? room.container.items.map((item) => auctionVisibleItem(room, viewer, item, mode === 'result')).filter((item) => !!item) : [];
    const fogCells = room.container ? auctionFogCells(room, viewer, mode === 'result') : [];
    const privateInfoCommand = viewer ? `竞拍 私图（已探索${fogCells.filter((cell) => cell.revealed).length}/${AUCTION_GRID_WIDTH * AUCTION_GRID_HEIGHT}${viewer.assistantReport ? `；${viewer.assistantReport.typeLabel || '助手情报'}${viewer.assistantReport.valuation ? ` ${viewer.assistantReport.valuation.low}-${viewer.assistantReport.valuation.high}` : ''}` : ''}）` : '竞拍 私图';
    const scene = {
      mode, round: room.round, maxRounds: room.maxRounds, autoConfirm: room.mode === 'solo', assistant: assistantData,
      assistantReport: viewer && viewer.assistantReport ? viewer.assistantReport : null, assistants: [], venues: [], selectedVenue: room.venue || '新手仓',
      container: room.container ? {
        code: room.container.code, theme: room.container.theme, venue: room.venue, clue: room.container.clue,
        silhouette: mode === 'result' ? room.container.silhouette : `${AUCTION_GRID_WIDTH}×${AUCTION_GRID_HEIGHT}货柜处于战争迷雾中；只按格显示已取得的品质情报。`,
        seal: room.container.seal, gridWidth: AUCTION_GRID_WIDTH, gridHeight: AUCTION_GRID_HEIGHT
      } : null,
      ownBid: viewer ? viewer.bid : 0, budget: viewer ? auctionBudget(viewer) : 0, privateInfoCommand,
      minimumEstimate: viewer ? auctionMinimumEstimate(room, viewer) : 0,
      playerBand: signals.playerBand, marketHeat: signals.marketHeat, spread: signals.spread,
      submittedCount: signals.submittedCount, activeCount: signals.activeCount,
      players, tools: viewer ? viewer.tools.map((name) => ({ name, description: (AUCTION_TOOLS.find((tool) => tool.name === name) || {}).description || '' })) : [],
      feedback: (room.feedback || []).slice(0, 5), intel: viewer ? viewer.intel : '', publicIntel: room.publicIntel || '',
      exploredCount: fogCells.filter((cell) => cell.revealed).length, totalCells: AUCTION_GRID_WIDTH * AUCTION_GRID_HEIGHT,
      personalExploreUsed: !!viewer && viewer.exploredRound === room.round, cells: fogCells,
      sold: result ? result.sold : false, winnerName: result ? result.winnerName : '', winningBid: result ? result.winningBid : 0,
      saleValue: result ? result.saleValue : 0, profit: result ? result.profit : 0, coinDelta: result ? result.coinDelta : 0,
      affectionDelta: result ? result.affectionDelta : 0, items: visibleItems
    };
    const lines = [];
    if (room.status === 'waiting') {
      lines.push(`${room.venue || '新手仓'} · 等待席位 ${room.players.length}/${AUCTION_MAX_PLAYERS} · 当前Bot ${room.players.filter((player) => player.isBot).length}/至少3`);
      players.forEach((player) => lines.push(`${player.name} · ${player.isBot ? '竞拍Bot' : '真人竞拍者'}`));
      lines.push('房主可发送“.竞拍 机器人 [数量]”和“.竞拍 开始”。');
    } else if (room.status === 'playing') {
      lines.push(`${room.venue} · 第${room.round}轮暗标 · ${room.round <= 4 ? `提前成交线 ${Math.round(auctionRoundRatio(room.round) * 100)}%` : room.round === 5 ? '最高价直接成交' : '同价加赛'}`);
      lines.push(`自己的报价位于${signals.playerBand} · 市场${signals.marketHeat} · ${signals.spread}`);
      lines.push(`根据当前已显示货品，保守最低估价 ${viewer ? auctionMinimumEstimate(room, viewer) : 0} 竞拍币。`);
      lines.push(`当前暗标 ${viewer ? viewer.bid : 0} · 可用预算 ${viewer ? auctionBudget(viewer) : 0} · ${room.mode === 'solo' ? '单机出价即结算' : `确认 ${signals.submittedCount}/${signals.activeCount}`}`);
      lines.push(`${room.publicIntel || '公共探照灯尚未启动'} · 个人探索${viewer && viewer.exploredRound === room.round ? '本轮已用' : '本轮可用'}`);
      if (viewer && viewer.assistantReport) {
        lines.push(`${viewer.assistantReport.typeLabel}：${viewer.assistantReport.summary}`);
        if (viewer.assistantReport.stats && viewer.assistantReport.stats.length) lines.push(viewer.assistantReport.stats.map((stat) => `${stat.label}${stat.value}`).join(' · '));
        if (viewer.assistantReport.valuation) lines.push(`${viewer.assistantReport.valuation.label} ${viewer.assistantReport.valuation.low}-${viewer.assistantReport.valuation.high} 竞拍币（${viewer.assistantReport.valuation.confidence}）`);
      }
      if (visibleItems.length) lines.push(`已完整识别：${visibleItems.slice(0, 8).map((item) => item.name).join('、')}${visibleItems.length > 8 ? '等' : ''}`);
      players.forEach((player) => lines.push(`${player.name} · 最近#${player.rank || '-'} · 五轮 ${player.rankHistory.map((rank) => rank || '-').join('/')}`));
      (room.feedback || []).forEach((line) => lines.push(line)); if (viewer && viewer.intel) lines.push(`情报：${viewer.intel}`);
    } else if (!result || !result.sold) lines.push('本箱流拍，所有锁定资金已经退回。');
    else {
      lines.push(`${result.winnerName}以${result.winningBid}竞拍币成交 · 出售${result.saleValue} · 利润${signedValue(result.profit)}`);
      result.items.forEach((item) => lines.push(`${item.rarityName} · ${item.name} · ${item.condition} · ${item.authenticity || '真伪未知'} · ${item.value}竞拍币`));
      if (result.winnerGuest) lines.push('成交者为游客，本场不结算钱包、好感、统计或图鉴。');
    }
    return { kind: 'auction', privateView: !!privateView, privateInfoCommand, title: mode === 'result' ? '竞拍之王 · 开箱结算' : '竞拍之王 · 货柜暗标', subtitle: `${room.venue || '新手仓'} · 金额保密 · 轮次名次公开 · 1游戏币=${AUCTION_RATE}竞拍币`, auctionScene: scene, lines, quote: quote || '' };
  }
  function auctionCollectionScene(profile) {
    const stats = profile.stats.auction || emptyGameStats(); const catalog = auctionCatalog(); const dex = stats.auctionDex || {};
    const unlocked = catalog.filter((item) => dex[item.id] && int(dex[item.id].count, 0) > 0);
    const byId = {}; catalog.forEach((item) => { byId[item.id] = item; });
    const topItems = Object.keys(dex).map((id) => Object.assign({}, dex[id], byId[id] ? { width: byId[id].width, height: byId[id].height, sizeLabel: byId[id].sizeLabel } : {})).sort((a, b) => int(b.bestValue, 0) - int(a.bestValue, 0)).slice(0, 10);
    const sizeMap = {}; catalog.forEach((item) => {
      if (!sizeMap[item.sizeLabel]) sizeMap[item.sizeLabel] = { sizeLabel: item.sizeLabel, width: item.width, height: item.height, count: 0, names: [] };
      const row = sizeMap[item.sizeLabel]; row.count++; if (row.names.indexOf(item.name) < 0) row.names.push(item.name);
    });
    const sizeHints = Object.keys(sizeMap).map((key) => sizeMap[key]).sort((a, b) => a.width * a.height - b.width * b.height || a.width - b.width);
    const top = stats.auctionTopItem;
    return {
      mode: 'collection', assistant: AUCTION_ASSISTANTS[profile.auctionAssistant] ? Object.assign({ name: profile.auctionAssistant }, AUCTION_ASSISTANTS[profile.auctionAssistant]) : null,
      assistants: [], venues: [], players: [], tools: [], feedback: [], items: topItems, sizeHints,
      dexUnlocked: unlocked.length, dexTotal: catalog.length, dexPercent: Math.round(unlocked.length * 100 / Math.max(1, catalog.length)),
      highestBid: stats.highestBid, bestProfit: stats.bestAuctionProfit, mostItems: stats.mostAuctionItems,
      totalSpend: stats.auctionSpend, totalRevenue: stats.auctionRevenue, containers: stats.auctionContainers,
      topItem: top ? `${top.name} · ${top.sizeLabel || (byId[top.id] ? byId[top.id].sizeLabel : '尺寸未知')} · ${top.value}竞拍币` : '尚无记录',
      venueStats: Object.keys(stats.auctionVenueStats || {}).map((name) => Object.assign({ name }, stats.auctionVenueStats[name]))
    };
  }
  function auctionTutorialView(pageValue) {
    const pages = [
      [
        ['选择助手', '首次进入选择一名助手；非游戏中可再次发送“.竞拍 助手 名称”更换。', '准备'],
        ['竞拍币', `1游戏币兑换${AUCTION_RATE}竞拍币。出价时锁定对应游戏币，落拍或放弃后退回。`, '经济'],
        ['至少三名Bot', '人机和多人房都会保证至少三名Bot同台，最多八个总席位。', '席位'],
        ['游客', '零余额玩家获得虚拟预算，可完整参与但不结算钱包、好感、统计和图鉴。', '多人'],
        ['默认场地', '无场地参数时使用新手仓；可发送“.竞拍 场地”查看全部淘货地点。', '场地'],
        ['快速开局', '“.竞拍 人机 收藏家遗产”或直接“.竞拍 收藏家遗产”都可开始。', '指令'],
        ['多人开房', '“.竞拍 开房 港口滞留仓”，其他玩家加入后由房主开始。', 'PvP'],
        ['场地差异', '货多不等于值钱，货少也可能出精品；仿品、大件与线索率各不相同。', '概率']
      ],
      [
        ['战争迷雾', '12×10货柜开场完全遮盖，不显示物品数量、位置、形状或类别。', '隐藏'],
        ['公共探索', `每轮探照灯固定公开${AUCTION_PUBLIC_CELLS_PER_ROUND}格，所有玩家获得相同情报。`, '公共'],
        ['个人探索', '每名玩家每轮可用“.竞拍 探索 A1”探寻一个坐标。', '探索'],
        ['品质颜色', '探开的货物格只显示品质色；空格也会明确标出。', '品质'],
        ['规则矩形', '所有货品都是固定宽高的长方形；同名货品在每局尺寸完全相同。', '尺寸'],
        ['完整识别', '同一物品全部占格探开后，才显示完整矩形、插画和名称。', '识别'],
        ['主动助手', '轮廓与品类助手使用“.竞拍 技能”发动，不需要指定目标坐标。', '技能'],
        ['开局报告', '玛丽亚、维克托、艾哈迈德会自动提供统计或估价，第3轮能力还会升级。', '被动'],
        ['两类估价', '最低估价只看已显示货物；助手价带带有误差且不会公开精确总价。', '估价'],
        ['自己判断', '结合品质色、固定尺寸、助手报告、场地倾向与图鉴提示决定可接受价格。', '博弈']
      ],
      [
        ['单机出价', '人机单机模式发送出价后自动确认并结算本轮，不需要二次确认。', '快速'],
        ['多人改价', '多人房确认前可反复发送出价，允许加价、降价或保持。', '暗标'],
        ['资金锁定', '加价补锁差额；降价立刻退回减少的游戏币，不会重复扣款。', '资金'],
        ['多人确认', '多人房发送“.竞拍 确认”才算完成本轮，全体确认后结算。', '确认'],
        ['撤回确认', '多人尚未全部确认时可发送“.竞拍 撤回”，再修改自己的报价。', '修改'],
        ['价位区间', '自己的报价仍会显示明显偏低、偏低、中段、偏高或领跑区。', '判断'],
        ['五轮名次', '每轮解析后，每个席位下方依次写入第1至第5轮价格名次。', '排名'],
        ['金额保密', '公开名次但不公开任何对手具体金额；并列报价使用相同名次。', '保密'],
        ['主动放弃', '确认前可放弃并退回锁定资金，本箱不能重新入场。', '止损']
      ],
      [
        ['第1轮', '最高价超过第二报价的200%时提前成交。', '200%'], ['第2轮', '提前成交线降为160%。', '160%'],
        ['第3轮', '提前成交线降为130%。', '130%'], ['第4轮', '提前成交线降为110%。', '110%'],
        ['第5轮', '唯一最高暗标成交；同价则进入加赛。', '决胜'],
        ['开箱出售', '成交后公开真实货品、状态、真伪和售价，并立即出售。', '结算'],
        ['盈利好感', '成交且盈利视为胜利；亏损视为失败，失去的好感多于盈利获得的好感。', '好感'],
        ['落拍不亏', '没有拍到箱子只退回锁定资金，不增加也不扣除好感。', '止损'],
        ['游客结算', '游客可以赢得并观看开箱，但钱包、好感、统计和图鉴都不落档。', '游客']
      ],
      [
        ['隐藏决策', 'Bot会根据场面调整报价，但性格、估值、情绪和关系永远不直接显示。', 'Bot'],
        ['真假动作', 'Bot可能抬价试探、突然降价、保守退出或短暂追价，不保证单向加价。', '博弈'],
        ['永久图鉴', '只有正式玩家成交结算的货品才写入图鉴，未成交与游客记录不保留。', '档案'],
        ['详细统计', '记录最高出价、最高利润、单箱最多货品、收支、最高价货品与各场地表现。', '统计'],
        ['结算后', '开箱结算完成后再次发送“.竞拍”，返回场地与指令菜单。', '返回'],
        ['常用指令', '.竞拍 出价 120000 / 放弃；多人房另可确认 / 撤回。', '指令'],
        ['查看货品', '.竞拍 技能 / 道具 强光手电 A1 / 图鉴。', '查验'],
        ['选择场地', '.竞拍 人机 新手仓 / 开房 收藏家遗产 / 场地。', '场地']
      ]
    ];
    const page = tutorialPage(pageValue, pages.length); const entries = pages[page - 1].map((item) => ({ title: item[0], description: item[1], tag: item[2] }));
    return {
      kind: 'auction', title: '竞拍之王 · 完整教程', subtitle: `第 ${page}/${pages.length} 页 · 发送“.竞拍 教程 ${page === pages.length ? 1 : page + 1}”继续`,
      tutorial: { page, total: pages.length, entries }, lines: entries.map((item) => `${item.title}：${item.description}`),
      quote: page === 1 ? '默认场地是新手仓；场地只改变出货倾向，不保证单局结果。' : '货品大小、形状和稀缺度都只是线索，最终价格由你自己判断。'
    };
  }

  // -------------------- 档案、排行榜、签到、投喂 --------------------
  const FEED_ITEMS = {
    '蛋糕': { cost: 120, affection: 10, category: '甜食' },
    '星光糖': { cost: 777, affection: 80, category: '甜食' },
    '巧克力': { cost: 80, affection: 6, category: '甜食' },
    '布丁': { cost: 90, affection: 7, category: '甜食' },
    '饼干': { cost: 50, affection: 4, category: '零食' },
    '薯片': { cost: 45, affection: 3, category: '零食' },
    '海苔脆片': { cost: 60, affection: 4, category: '零食' },
    '坚果礼盒': { cost: 100, affection: 7, category: '零食' },
    '牛奶': { cost: 30, affection: 2, category: '饮品' },
    '奶茶': { cost: 70, affection: 5, category: '饮品' },
    '热可可': { cost: 85, affection: 6, category: '饮品' },
    '果汁': { cost: 55, affection: 3, category: '饮品' },
    '豪华便当': { cost: 300, affection: 28, category: '餐点' },
    '三明治': { cost: 90, affection: 6, category: '餐点' },
    '拉面': { cost: 150, affection: 11, category: '餐点' },
    '寿司拼盘': { cost: 240, affection: 20, category: '餐点' },
    '保温杯': { cost: 180, affection: 13, category: '生活用品' },
    '毛巾': { cost: 80, affection: 5, category: '生活用品' },
    '香薰': { cost: 220, affection: 16, category: '生活用品' },
    '雨伞': { cost: 160, affection: 11, category: '生活用品' },
    '台灯': { cost: 400, affection: 32, category: '家具' },
    '书架': { cost: 650, affection: 52, category: '家具' },
    '懒人沙发': { cost: 900, affection: 72, category: '家具' },
    '床头柜': { cost: 1200, affection: 95, category: '家具' }
  };
  function affectionBand(p) {
    const low = seal.ext.getIntConfig(ext, '判别式文案_低好感上限');
    const high = Math.max(low + 1, seal.ext.getIntConfig(ext, '判别式文案_高好感下限'));
    return p.affection < low ? '低' : p.affection >= high ? '高' : '普通';
  }
  function relationProgress(p) {
    const meter = relationMeter(p);
    if (meter.max <= meter.min) return 1;
    return clamp((meter.value - meter.min) / (meter.max - meter.min), 0, 1);
  }
  function giftList() {
    return Object.keys(FEED_ITEMS).map((name) => ({
      name, category: FEED_ITEMS[name].category, cost: FEED_ITEMS[name].cost, affection: FEED_ITEMS[name].affection
    }));
  }
  function relationMeter(p) {
    const rel = relation(p.affection);
    if (rel.next === null) return { label: `关系 · ${rel.name}`, value: 1, min: 0, max: 1, text: `${p.affection}好感 · 最高阶段` };
    const start = rel.min < -1000000 ? Math.min(-200, p.affection) : rel.min;
    return { label: `关系 · ${rel.name}`, value: p.affection, min: start, max: rel.next, text: `${p.affection}好感 · 下级${rel.next}` };
  }
  function boardGameKey(board) {
    const gameMap = {
      '德州': 'poker', '德州扑克': 'poker', '21点': 'blackjack', '二十一点': 'blackjack',
      '神抽': 'dmd', '亡命神抽': 'dmd', '刮刮': 'scratch', '刮刮乐': 'scratch', '视频扑克': 'scratch',
      '快艇': 'farkle', '快艇骰': 'farkle', 'farkle': 'farkle', '钓鱼': 'fishing',
      '爱赢一切': 'love', '爱赢': 'love', 'love': 'love',
      '古墓': 'tomb', '古墓夺宝': 'tomb', '摸金': 'tomb', 'tomb': 'tomb',
      '赏金': 'bounty', '赏金对决': 'bounty', 'bounty': 'bounty',
      '恶魔': 'demon', '恶魔轮盘': 'demon', '恶魔轮盘赌': 'demon', '恶魔赌局': 'demon', 'demon': 'demon', 'roulette': 'demon',
      '竞拍': 'auction', '竞拍之王': 'auction', 'auction': 'auction', '打工': 'work', '智力打工': 'work', 'work': 'work', '专家数独': 'expertSudoku', '专家': 'expertSudoku', 'expert': 'expertSudoku',
      '斗地主': 'landlord', '地主': 'landlord', 'landlord': 'landlord'
      , '炼金': 'alchemy', '魔幻牌': 'alchemy', '魔幻牌炼金术师': 'alchemy', 'alchemy': 'alchemy', '钓鱼牌': 'fishingCard', '捕鱼牌': 'fishingCard', 'fishingcard': 'fishingCard'
    };
    return gameMap[String(board || '').toLowerCase()] || gameMap[String(board || '')] || '';
  }
  function moduleViewModel(game, stats) {
    const s = Object.assign(emptyGameStats(), stats || {});
    return {
      key: game, name: GAME_NAMES[game], plays: s.plays, wins: s.wins, losses: s.losses, draws: s.draws,
      score: s.score, best: s.best, profit: s.profit, grandSlams: s.grandSlams,
      affection: s.affection, affectionGained: s.affectionGained, affectionLost: s.affectionLost,
      bestPokerHand: game === 'poker' ? pokerBestHandText(s) : '', workSolved: game === 'work' ? s.workSolved : 0,
       workBestStreak: game === 'work' ? s.workBestStreak : 0, workBestReward: game === 'work' ? s.workBestReward : 0,
       expertSolved: game === 'expertSudoku' ? s.expertSolved : 0, expertBestReward: game === 'expertSudoku' ? s.expertBestReward : 0
       ,fishingCardRounds: game === 'fishingCard' ? s.fishingCardRounds : 0, fishingCardWins: game === 'fishingCard' ? s.fishingCardWins : 0, fishingCardScore: game === 'fishingCard' ? s.fishingCardScore : 0, fishingCardCardsEaten: game === 'fishingCard' ? s.fishingCardCardsEaten : 0
    };
  }
  // 给 AI Plugin 使用的纯文本只读快照；不暴露内部用户 ID，数值直接来自统一档案。
  function affectionStatusText(p) {
    const rel = relation(p.affection);
    const next = rel.next === null ? '已达到最高阶段' : `还差 ${Math.max(0, rel.next - p.affection)} 点进入下一阶段（${rel.next}）`;
    const lines = [
      '【骰娘好感度数据】',
      `角色名：${p.name || '未注册'}`,
      `关系阶段：${rel.name}`,
      `好感度：${p.affection}`,
      `关系进度：${next}`,
      `游戏币：${p.coins}`,
      `未还借款：${p.loan && Array.isArray(p.loan.loans) ? p.loan.loans.length : 0} 笔`
    ];
    Object.keys(GAME_NAMES).forEach((game) => {
      const s = Object.assign(emptyGameStats(), p.stats && p.stats[game] || {});
      const hasRecord = s.plays || s.expertAttempts || s.workQuestions || (game === 'poker' && s.bestPokerHand);
      if (!hasRecord) return;
      const rate = s.plays ? `${Math.round(s.wins * 100 / s.plays)}%` : '暂无对局';
      lines.push(`${GAME_NAMES[game]}：${s.plays || 0}局，${s.wins || 0}胜/${s.losses || 0}负/${s.draws || 0}平，胜率${rate}，金币净收益${signedValue(s.profit)}，好感净变化${signedValue(s.affection)}`);
    });
    return lines.join('\\n');
  }
  function profileView(p, quote, requestedPage) {
    const rel = relation(p.affection); const progress = rel.next === null ? '已达到最高关系阶段' : `距离下一级还需 ${rel.next - p.affection}`;
    const lines = [`${p.name}  |  关系 ${rel.name}`, `好感 ${p.affection}  |  ${progress}`, `游戏币 ${p.coins}`];
    if (p.loan && Array.isArray(p.loan.loans) && p.loan.loans.length) lines.push(`未还借款 ${p.loan.loans.length} 笔  |  应还 ${p.loan.loans.length * 195} 游戏币`);
    const allModuleLines = [];
    Object.keys(GAME_NAMES).forEach((g) => {
      const s = p.stats[g];
      allModuleLines.push(`${GAME_NAMES[g]}：${g === 'expertSudoku' ? `${s.expertAttempts}次挑战 ${s.expertSolved}正确/${s.expertFailed}失败 最高报酬${s.expertBestReward}` : `${s.plays}局 ${s.wins}胜/${s.losses}负/${s.draws}平 最高${s.best} 收益${s.profit} 好感+${s.affectionGained}/-${s.affectionLost}（净${s.affection >= 0 ? '+' : ''}${s.affection}` + `）`}${g === 'poker' ? ` 最大牌型${pokerBestHandText(s)}` : ''}`);
    });
    const workStats = p.stats.work || emptyGameStats();
    if (workStats.workQuestions) lines.push(`智力打工：${workStats.workQuestions}题 ${workStats.workSolved}正确 最高毛报酬${workStats.workBestReward} 连对${workStats.workBestStreak} 收益${workStats.workCoinsEarned}`);
    const expertStats = p.stats.expertSudoku || emptyGameStats();
    if (expertStats.expertAttempts) lines.push(`专家数独：${expertStats.expertAttempts}次挑战 ${expertStats.expertSolved}正确 ${expertStats.expertRevealed}次揭示 最高报酬${expertStats.expertBestReward} SE等效最高${Number(expertStats.expertBestDifficulty || 0).toFixed(2)}`);
    const coinGoal = Math.max(1, seal.ext.getIntConfig(ext, '判别式文案_高游戏币下限'));
    const meters = [relationMeter(p), { label: '游戏币储备', value: p.coins, min: 0, max: coinGoal, text: `${p.coins}币 · 富足线${coinGoal}` }];
    const allModules = Object.keys(GAME_NAMES).map((game) => moduleViewModel(game, p.stats[game]));
    const totalPages = Math.max(1, Math.ceil(allModules.length / PROFILE_PAGE_SIZE));
    const page = clamp(requestedPage == null ? 1 : int(requestedPage, 1), 1, totalPages);
    jsonSet(profilePageKey(p.id), page);
    const modules = allModules.slice((page - 1) * PROFILE_PAGE_SIZE, page * PROFILE_PAGE_SIZE);
    const moduleStart = (page - 1) * PROFILE_PAGE_SIZE;
    lines.push(`项目档案：第 ${page} / ${totalPages} 页`);
    allModuleLines.slice(moduleStart, moduleStart + PROFILE_PAGE_SIZE).forEach((line) => lines.push(line));
    return { kind: 'profile', title: '骰娘好感档案', subtitle: `${p.name} · ${rel.name} · 项目第 ${page}/${totalPages} 页 · 发送“.yan 我的 项目”查看详情`, meters, modules, lines, profilePage: page, profileTotalPages: totalPages, profilePageSize: PROFILE_PAGE_SIZE, quote: quote || profileQuote(null, p) };
  }
  function gameStatsView(ctx, p, board) {
    const game = boardGameKey(board);
    if (!game) return {
      kind: 'stats', title: '请选择统计项目', subtitle: p.name,
      lines: [`可查看：德州 / 21点 / 神抽 / 刮刮 / 快艇 / ${GAME_NAMES.love} / 古墓 / 赏金 / 钓鱼 / 竞拍 / 智力打工 / 恶魔轮盘赌 / 斗地主`, `示例：.yan 我的 斗地主`], quote: profileQuote(ctx, p)
    };
    const s = Object.assign(emptyGameStats(), p.stats[game] || {});
    const winRate = s.plays ? Math.round(s.wins * 100 / s.plays) : 0;
    const signedAffection = `${s.affection >= 0 ? '+' : ''}${s.affection}`;
    const signedProfit = `${s.profit >= 0 ? '+' : ''}${s.profit}`;
    const tiles = [
      { label: '总局数', value: s.plays, tone: 'accent' },
      { label: '胜 / 负 / 平', value: `${s.wins} / ${s.losses} / ${s.draws}`, tone: 'neutral' },
      { label: '胜率', value: `${winRate}%`, tone: winRate >= 50 ? 'positive' : 'neutral' },
      { label: '历史最高', value: s.best, tone: 'accent' },
      { label: '累计项目分', value: s.score, tone: 'neutral' },
      { label: '游戏币净收益', value: signedProfit, tone: s.profit >= 0 ? 'positive' : 'negative' },
      { label: '累计获得好感', value: `+${s.affectionGained}`, tone: 'positive' },
      { label: '累计失去好感', value: `-${s.affectionLost}`, tone: 'negative' },
      { label: '好感净变化', value: signedAffection, tone: s.affection >= 0 ? 'positive' : 'negative' }
    ];
    if (game === 'poker') tiles.push({ label: '历史最大牌型', value: pokerBestHandText(s), tone: 'accent' });
    if (game === 'dmd') tiles.push({ label: '大满贯', value: s.grandSlams, tone: 'accent' });
    if (game === 'love') tiles.push(
      { label: '赢下轮次', value: s.loveRoundsWon, tone: 'positive' },
      { label: '爱赢一切成型', value: s.loveWinsAll, tone: 'accent' },
      { label: '骗子牌 胜 / 负', value: `${s.loveCheatWins} / ${s.loveCheatLosses}`, tone: 'neutral' },
      { label: '骗子额外罚筹码', value: s.loveCheatPenalties, tone: 'negative' },
      { label: '终局最高筹码', value: s.loveBestChips, tone: 'accent' },
      { label: '历史最高牌型', value: s.loveBestHand || '尚无记录', tone: 'accent' }
    );
    if (game === 'tomb') tiles.push(
      { label: '成功生还墓数', value: s.tombSurvivals, tone: 'positive' },
      { label: '累计带出价值', value: s.tombEscapedValue, tone: 'accent' },
      { label: '单墓最高带出', value: s.tombBestEscape, tone: 'accent' },
      { label: '耐久局冠军', value: s.tombDurableWins, tone: 'positive' },
      { label: '成功带出宝物', value: s.tombTreasures, tone: 'neutral' },
      { label: '塌方 / 反噬 / 虫灾', value: `${s.tombWeightDeaths} / ${s.tombMagicDeaths} / ${s.tombScarabDeaths}`, tone: 'negative' }
    );
    if (game === 'bounty') tiles.push(
      { label: '赏金撤离', value: s.bountyBounties, tone: 'positive' },
      { label: '成功撤离', value: s.bountyEscapes, tone: 'accent' },
      { label: '击杀 / 击倒', value: `${s.bountyKills} / ${s.bountyDowns}`, tone: 'neutral' },
      { label: 'Boss参与击杀', value: s.bountyBossKills, tone: 'positive' },
      { label: '线索发现', value: s.bountyClues, tone: 'accent' },
      { label: 'Boss最高累计伤害', value: s.bountyBestDamage, tone: 'accent' },
      { label: '累计猎场回合', value: s.bountyRounds, tone: 'neutral' }
    );
    if (game === 'scratch') tiles.push(
      { label: '双色球 注 / 中', value: `${s.lotteryTickets} / ${s.lotteryWins}`, tone: 'positive' },
      { label: '双色球 奖金 / 最高', value: `${s.lotteryPrize} / ${s.lotteryBestPrize}`, tone: 'accent' },
      { label: '生死骰 局 / 胜 / 净收益', value: `${s.deathDicePlays} / ${s.deathDiceWins} / ${signedValue(s.deathDiceProfit)}`, tone: s.deathDiceProfit >= 0 ? 'positive' : 'negative' },
      { label: '视频扑克 局 / 中奖手', value: `${s.videoPokerPlays} / ${s.videoPokerHandsWon}`, tone: 'positive' },
      { label: '视频扑克 投入 / 实收', value: `${s.videoPokerWagered} / ${s.videoPokerWon}`, tone: s.videoPokerWon >= s.videoPokerWagered ? 'positive' : 'negative' },
      { label: '视频扑克 最高 / 最佳牌型', value: `${s.videoPokerBestPayout} / ${s.videoPokerBestHand || '暂无'}`, tone: 'accent' }
    );
    let auctionDetails = null;
    if (game === 'auction') {
      auctionDetails = auctionCollectionScene(p);
      tiles.push(
        { label: '单次最高竞拍价', value: s.highestBid, tone: 'accent' },
        { label: '单次最高利润', value: signedValue(s.bestAuctionProfit), tone: s.bestAuctionProfit >= 0 ? 'positive' : 'negative' },
        { label: '单箱最多货品', value: s.mostAuctionItems, tone: 'accent' },
        { label: '买箱次数', value: s.auctionContainers, tone: 'neutral' },
        { label: '累计竞拍支出', value: s.auctionSpend, tone: 'negative' },
        { label: '累计出售收入', value: s.auctionRevenue, tone: 'positive' },
        { label: '货品图鉴', value: `${auctionDetails.dexUnlocked}/${auctionDetails.dexTotal} · ${auctionDetails.dexPercent}%`, tone: auctionDetails.dexUnlocked === auctionDetails.dexTotal ? 'positive' : 'accent' },
        { label: '最高价货品', value: auctionDetails.topItem, tone: 'accent' }
      );
    }
    let fishingDetails = null;
    if (game === 'fishing') {
      const catalog = fishCatalog(); const dex = s.fishDex && typeof s.fishDex === 'object' ? s.fishDex : {};
      const unlocked = catalog.filter((fish) => dex[fish.name] && int(dex[fish.name].count, 0) > 0);
      const biggest = normalizedFishRecord(s.biggestFish); const smallest = normalizedFishRecord(s.smallestFish);
      const biggestText = biggest ? `${biggest.name} · ${biggest.size.toFixed(2)}kg` : '尚无记录';
      const smallestText = smallest ? `${smallest.name} · ${smallest.size.toFixed(2)}kg` : '尚无记录';
      const percent = Math.round(unlocked.length * 100 / Math.max(1, catalog.length));
      tiles.push(
        { label: '历史最大鱼', value: biggestText, tone: 'accent' },
        { label: '历史最小鱼', value: smallestText, tone: 'positive' },
        { label: '图鉴解锁进度', value: `${unlocked.length} / ${catalog.length} · ${percent}%`, tone: unlocked.length === catalog.length ? 'positive' : 'accent' }
      );
      fishingDetails = { biggestText, smallestText, unlocked, total: catalog.length, percent, scene: fishingDexScene(p, 1) };
    }
    if (game === 'fishingCard') tiles.push(
      { label: '钓鱼牌总局数', value: s.fishingCardRounds, tone: 'accent' },
      { label: '获胜局数', value: s.fishingCardWins, tone: 'positive' },
      { label: '累计牌分', value: s.fishingCardScore, tone: 'accent' },
      { label: '累计吃牌', value: s.fishingCardCardsEaten, tone: 'neutral' },
      { label: '单局最多吃牌', value: s.fishingCardBestCombo, tone: 'positive' },
      { label: '最高牌点', value: s.fishingCardHighestCard, tone: 'accent' }
    );
    if (game === 'work') tiles.push(
      { label: '做题 / 正确', value: `${s.workQuestions} / ${s.workSolved}`, tone: 'accent' },
      { label: '当前 / 最长连对', value: `${s.workCurrentStreak} / ${s.workBestStreak}`, tone: 'positive' },
      { label: '单题最高毛报酬', value: s.workBestReward, tone: 'accent' },
      { label: '实际入账游戏币', value: s.workCoinsEarned, tone: 'positive' },
      { label: '24点 / 数独 / 骑士 / Creek', value: `${s.work24} / ${s.workSudoku} / ${s.workKnights} / ${s.workCreek}`, tone: 'neutral' }
    );
    if (game === 'expertSudoku') tiles.push(
      { label: '挑战 / 正确 / 失败', value: `${s.expertAttempts} / ${s.expertSolved} / ${s.expertFailed}`, tone: 'accent' },
      { label: '揭示答案次数', value: s.expertRevealed, tone: 'negative' },
      { label: '最高报酬', value: s.expertBestReward, tone: 'positive' },
      { label: '最高SE等效难度', value: Number(s.expertBestDifficulty || 0).toFixed(2), tone: 'accent' },
      { label: '最长连对', value: s.expertBestStreak, tone: 'neutral' },
      { label: '异常过快提交', value: s.expertFastSubmissions, tone: 'negative' }
    );
    if (game === 'landlord') tiles.push(
      { label: '最高倍率', value: s.landlordMaxMultiplier || 0, tone: 'accent' },
      { label: '炸弹 / 春天', value: `${s.landlordBombs || 0} / ${s.landlordSprings || 0}`, tone: 'negative' },
      { label: '累计局数', value: s.landlordRounds || 0, tone: 'neutral' },
      { label: '锦标赛冠军', value: s.landlordTournamentWins || 0, tone: 'positive' },
      { label: '最近锦标赛名次', value: s.landlordTournamentRank || '暂无', tone: 'accent' }
    );
    if (game === 'fishingCard') tiles.push(
      { label: '对局 / 胜场', value: `${s.plays} / ${s.wins}`, tone: 'accent' },
      { label: '累计局数', value: s.fishingCardRounds || 0, tone: 'neutral' },
      { label: '累计得分', value: s.fishingCardScore || 0, tone: 'positive' },
      { label: '累计吃牌', value: s.fishingCardCardsEaten || 0, tone: 'accent' },
      { label: '最高吃牌数', value: s.fishingCardBestCombo || 0, tone: 'positive' }
    );
    const lines = [
      `总局数 ${s.plays}  |  ${s.wins}胜 ${s.losses}负 ${s.draws}平  |  胜率 ${winRate}%`,
      `历史最高 ${s.best}  |  累计项目分 ${s.score}  |  游戏币净收益 ${signedProfit}`,
      `累计获得好感 +${s.affectionGained}  |  累计失去好感 -${s.affectionLost}  |  净变化 ${signedAffection}`
    ];
    if (game === 'poker') lines.push(`历史最大牌型 ${pokerBestHandText(s)}`);
    if (game === 'work') lines.push(`智力打工：做题${s.workQuestions} · 正确${s.workSolved} · 连对${s.workBestStreak} · 最高毛报酬${s.workBestReward} · 实际入账${s.workCoinsEarned}`);
    if (game === 'expertSudoku') lines.push(`专家数独：挑战${s.expertAttempts} · 正确${s.expertSolved} · 失败${s.expertFailed} · 揭示答案${s.expertRevealed} · 最高报酬${s.expertBestReward} · 最高难度SE等效${Number(s.expertBestDifficulty || 0).toFixed(2)}`);
    if (game === 'landlord') lines.push(`斗地主：最高倍率${s.landlordMaxMultiplier || 0} · 炸弹${s.landlordBombs || 0} · 春天${s.landlordSprings || 0} · 累计局数${s.landlordRounds || 0} · 锦标赛冠军${s.landlordTournamentWins || 0} · 最近名次${s.landlordTournamentRank || '暂无'}`);
    if (game === 'fishingCard') lines.push(`钓鱼牌：累计${s.fishingCardRounds || 0}局 · 吃牌${s.fishingCardCardsEaten || 0} · 累计得分${s.fishingCardScore || 0} · 最高吃牌${s.fishingCardBestCombo || 0}`);
    if (game === 'dmd') lines.push(`大满贯 ${s.grandSlams} 次`);
    if (game === 'love') {
      lines.push(`赢下轮次 ${s.loveRoundsWon}  |  爱赢一切 ${s.loveWinsAll} 次  |  终局最高 ${s.loveBestChips} 筹码`);
      lines.push(`骗子牌 ${s.loveCheatWins}胜/${s.loveCheatLosses}负  |  额外罚筹码 ${s.loveCheatPenalties}  |  最高牌型 ${s.loveBestHand || '尚无记录'}`);
    }
    if (game === 'tomb') {
      lines.push(`生还 ${s.tombSurvivals} 墓  |  累计带出价值 ${s.tombEscapedValue}  |  单墓最高 ${s.tombBestEscape}`);
      lines.push(`耐久局冠军 ${s.tombDurableWins}  |  带出宝物 ${s.tombTreasures} 件  |  塌方/反噬/虫灾 ${s.tombWeightDeaths}/${s.tombMagicDeaths}/${s.tombScarabDeaths}`);
    }
    if (game === 'bounty') {
      lines.push(`赏金撤离 ${s.bountyBounties}  |  总撤离 ${s.bountyEscapes}  |  击杀/击倒 ${s.bountyKills}/${s.bountyDowns}`);
      lines.push(`Boss击杀参与 ${s.bountyBossKills}  |  线索 ${s.bountyClues}  |  Boss最高累计伤害 ${s.bountyBestDamage}  |  猎场回合 ${s.bountyRounds}`);
    }
    if (game === 'demon') {
      const d = p.demon || {}; lines.push(`恶魔评分 ${d.rating || 1000}  |  胜负 ${d.wins || 0}/${d.losses || 0}  |  伤害 ${d.damage || 0}  |  击杀 ${d.kills || 0}`);
      lines.push(`永久称号 ${d.title || '无'}  |  模式记录 ${Object.keys(d.modeStats || {}).map((k) => `${k}:${d.modeStats[k]}`).join('、') || '暂无'}`);
      lines.push(`项目游戏币净收益 ${s.profit || 0}  |  物品库存 ${Object.keys(d.inventory || {}).map((k) => `${k}×${d.inventory[k]}`).join('、') || '无'}`);
    }
    if (game === 'scratch') {
      lines.push(`双色球 ${s.lotteryTickets}注 / ${s.lotteryWins}次中奖  |  累计奖金 ${s.lotteryPrize}  |  最高 ${s.lotteryBestPrize}`);
      lines.push(`生死骰 ${s.deathDicePlays}局 ${s.deathDiceWins}胜/${s.deathDiceLosses}负  |  净收益 ${signedValue(s.deathDiceProfit)}  |  单次最高净赢 ${s.deathDiceBestWin}`);
      lines.push(`视频扑克 ${s.videoPokerPlays}局 / ${s.videoPokerHands}手 / ${s.videoPokerHandsWon}手中奖  |  投入 ${s.videoPokerWagered}  |  实收 ${s.videoPokerWon}`);
      lines.push(`视频扑克最高 ${s.videoPokerBestPayout}  |  最佳牌型 ${s.videoPokerBestHand || '尚无记录'}  |  翻牌连中 ${s.videoPokerBestStreak}  |  复活 ${s.videoPokerRevives}`);
      lines.push(`Jackpot命中 ${s.videoPokerJackpots} 次  |  累计奖池奖金 ${s.videoPokerJackpotWon}  |  当前奖池 ${videoPokerJackpot().toFixed(2)}`);
    }
    if (auctionDetails) {
      lines.push(`最高竞拍价 ${s.highestBid}  |  最高利润 ${signedValue(s.bestAuctionProfit)}  |  单箱最多 ${s.mostAuctionItems} 件`);
      lines.push(`累计支出 ${s.auctionSpend}  |  累计出售 ${s.auctionRevenue}  |  买箱 ${s.auctionContainers} 次`);
      lines.push(`图鉴 ${auctionDetails.dexUnlocked}/${auctionDetails.dexTotal}（${auctionDetails.dexPercent}%）  |  最高价货品 ${auctionDetails.topItem}`);
    }
    if (fishingDetails) {
      lines.push(`历史最大鱼 ${fishingDetails.biggestText}  |  历史最小鱼 ${fishingDetails.smallestText}`);
      lines.push(`图鉴解锁 ${fishingDetails.unlocked.length}/${fishingDetails.total}（${fishingDetails.percent}%）`);
      lines.push(`已解锁：${fishingDetails.unlocked.length ? fishingDetails.unlocked.map((fish) => fish.name).join('、') : '暂无'}`);
    }
    return { kind: 'stats', title: `${GAME_NAMES[game]} · 详细统计`, subtitle: `${p.name}的项目档案`, tiles, auctionScene: auctionDetails, fishingScene: fishingDetails ? fishingDetails.scene : null, lines, quote: profileQuote(ctx, p) };
  }
  function allProfiles() {
    let reg = jsonGet('aff.registry.v1', { ids: [], names: {} });
    (Array.isArray(reg.ids) ? reg.ids.slice() : []).forEach((id) => {
      const resolved = resolveCompatIdentity('user', id) || id;
      if (resolved !== id) migrateUserIdentity(id, resolved);
    });
    reg = jsonGet('aff.registry.v1', { ids: [], names: {} }); const list = []; const seen = {};
    reg.ids.forEach((id) => {
      if (seen[id]) return; seen[id] = true;
      const stored = jsonGet(profileKey(id), null);
      if (!stored) return;
      const p = loadProfile(id, stored.name || reg.names[id]);
      if (p.registered && p.name) list.push(p);
    });
    return list;
  }
  function leaderboardMetric(p, board) {
    if (board === '好感') return p.affection;
    if (board === '金币') return p.coins;
    const g = boardGameKey(board); if (!g) return p.affection;
    const s = p.stats[g];
    if (g === 'dmd') return s.best + s.grandSlams * 100 + s.wins * 20;
    if (g === 'love') return s.wins * 10000 + s.loveRoundsWon * 100 + s.loveBestHandRank * 10 + s.loveBestChips;
    if (g === 'tomb') return s.tombEscapedValue * 100 + s.tombSurvivals * 20 + s.tombDurableWins * 10000;
    if (g === 'bounty') return s.bountyBounties * 100000 + s.bountyEscapes * 10000 + s.bountyKills * 100 + s.bountyBossKills * 1000 + s.bountyClues;
    if (g === 'scratch' || g === 'fishing') return s.profit;
    if (g === 'work') return s.workSolved * 10000 + s.workBestStreak * 100 + s.workBestReward;
    if (g === 'auction') return s.bestAuctionProfit + s.wins * 100000;
    if (g === 'demon') return (p.demon ? p.demon.rating : 1000) + s.wins * 1000 + (p.demon ? p.demon.kills * 20 : 0);
    return s.wins * 10000 + s.best;
  }
  function leaderboardView(board) {
    const normalized = board || '综合'; const profiles = allProfiles();
    if (normalized === '综合') profiles.sort((a, b) => b.affection - a.affection || b.coins - a.coins);
    else profiles.sort((a, b) => leaderboardMetric(b, normalized) - leaderboardMetric(a, normalized));
    const lines = []; const top = profiles.slice(0, 10);
    const values = top.map((p) => normalized === '综合' ? p.affection : leaderboardMetric(p, normalized));
    const minValue = values.length ? Math.min(...values) : 0; const maxValue = values.length ? Math.max(...values) : 1;
    const rankings = top.map((p, i) => {
      const totalWins = Object.keys(GAME_NAMES).reduce((n, g) => n + p.stats[g].wins, 0);
      const value = normalized === '综合' ? p.affection : leaderboardMetric(p, normalized);
      let primary = `${value} 项目分`; let secondary = '';
      if (normalized === '综合') { primary = `${p.affection} 好感`; secondary = `${p.coins}币 · 总胜场${totalWins}`; }
      else if (normalized === '好感') { primary = `${p.affection} 好感`; secondary = relation(p.affection).name; }
      else if (normalized === '金币') { primary = `${p.coins} 游戏币`; secondary = `${p.affection}好感 · ${relation(p.affection).name}`; }
      else {
        const s = p.stats[boardGameKey(normalized)] || emptyGameStats();
        secondary = `最高${s.best} · 收益${s.profit} · 好感净${s.affection >= 0 ? '+' : ''}${s.affection}`;
        const details = [
          { label: '局', value: s.plays, tone: 'neutral' }, { label: '胜', value: s.wins, tone: 'positive' },
          { label: '负', value: s.losses, tone: 'negative' }, { label: '好感+', value: s.affectionGained, tone: 'positive' },
          { label: '好感-', value: s.affectionLost, tone: 'negative' }
        ];
        const ratio = maxValue === minValue ? 1 : (value - minValue) / (maxValue - minValue);
        return { rank: i + 1, name: p.name, primary, secondary, ratio, details };
      }
      const ratio = maxValue === minValue ? 1 : (value - minValue) / (maxValue - minValue);
      return { rank: i + 1, name: p.name, primary, secondary, ratio };
    });
    top.forEach((p, i) => {
      if (normalized === '综合') lines.push(`#${i + 1} ${p.name}  ${p.affection}好感  ${p.coins}币  总胜场${Object.keys(GAME_NAMES).reduce((n, g) => n + p.stats[g].wins, 0)}`);
      else if (normalized === '好感') lines.push(`#${i + 1} ${p.name}  ${p.affection}好感  [${relation(p.affection).name}]`);
      else if (normalized === '金币') lines.push(`#${i + 1} ${p.name}  ${p.coins}游戏币`);
      else {
        const s = p.stats[boardGameKey(normalized)] || emptyGameStats();
        lines.push(`#${i + 1} ${p.name}  项目分${leaderboardMetric(p, normalized)}  ${s.plays}局${s.wins}胜${s.losses}负  好感+${s.affectionGained}/-${s.affectionLost}`);
      }
    });
    if (!lines.length) lines.push('暂无玩家数据。');
    return { kind: 'leaderboard', title: `${normalized}排行榜`, subtitle: `可查看：综合 / 好感 / 金币 / 德州 / 21点 / 神抽 / 刮刮 / 快艇 / ${GAME_NAMES.love} / 古墓 / 钓鱼 / 竞拍 / ${GAME_NAMES.alchemy} / 智力打工`, rankings, lines, quote: '' };
  }

  // -------------------- 房间操作辅助 --------------------
  function addRoomBot(room, game, count) {
    count = clamp(int(count, 1), 1, 5);
    const names = ['姜修泽', '葛明治', '阿日', '严茫熙', '亨德森'];
    const maxPlayers = game === 'love' ? 2 : game === 'tomb' ? 4 : game === 'alchemy' ? 4 : game === 'fishingCard' ? 4 : game === 'landlord' ? (room.doubleDeck ? 4 : 3) : 6;
    for (let i = 0; i < count && room.players.length < maxPlayers; i++) {
      const id = `${BOT_PREFIX}${game}:${nowMs()}:${room.players.length}`; const name = names[(room.players.length - 1) % names.length];
      room.players.push(game === 'poker' ? pokerPlayer(id, name, true) : game === 'dmd' ? dmdPlayer(id, name, true) : game === 'love' ? lovePlayer(id, name, true) : game === 'tomb' ? tombPlayer(id, name, true) : game === 'landlord' ? landlordPlayer(id, name, true) : game === 'alchemy' ? alchemyPlayer(id, name, true, true) : game === 'fishingCard' ? fishCardPlayer(id, name, true, true) : farklePlayer(id, name, true));
    }
    room.updatedAt = nowMs();
  }
  function multiplayerAdmission(game, id, name) {
    const profile = loadProfile(id, name); const paid = charge(profile, ENTRY[game]);
    return { profile, paid, guest: !paid };
  }
  function joinPaidRoom(room, game, id, name) {
    if (!room || room.status !== 'waiting') return { error: '没有可加入的等待中房间。' };
    if (room.players.some((p) => p.id === id)) return { error: '你已经在房间中。' };
    if (room.players.length >= (game === 'love' ? 2 : game === 'tomb' ? 4 : game === 'alchemy' ? 4 : game === 'fishingCard' ? 4 : game === 'landlord' ? (room.doubleDeck ? 4 : 3) : 6)) return { error: '房间已满。' };
    const admission = multiplayerAdmission(game, id, name);
    const player = game === 'poker' ? pokerPlayer(id, name, false, admission.paid) : game === 'dmd' ? dmdPlayer(id, name, false, admission.paid) : game === 'love' ? lovePlayer(id, name, false, admission.paid) : game === 'tomb' ? tombPlayer(id, name, false, admission.paid) : game === 'landlord' ? landlordPlayer(id, name, false, admission.paid) : game === 'alchemy' ? alchemyPlayer(id, name, false, admission.paid) : game === 'fishingCard' ? fishCardPlayer(id, name, false, admission.paid) : farklePlayer(id, name, false, admission.paid);
    setRoomPlayerEligibility(player, admission.paid); room.players.push(player);
    room.updatedAt = nowMs(); return { error: '', paid: admission.paid, guest: admission.guest, profile: admission.profile };
  }
  function cancelWaitingRoom(room, id) {
    if (!room || room.status !== 'waiting') return '只有等待中的房间可以取消。';
    const index = room.players.findIndex((p) => p.id === id); if (index < 0) return '你不在房间中。';
    const pl = room.players[index]; if (!pl.isBot && pl.paid) { const p = loadProfile(pl.id, pl.name); p.coins += room.entry; saveProfile(p); }
    room.players.splice(index, 1);
    const humans = room.players.filter((p) => !p.isBot);
    if (!humans.length) room.players = [];
    else if (room.ownerId === id) room.ownerId = humans[0].id;
    room.updatedAt = nowMs(); return '';
  }

  // -------------------- 赏金对决 --------------------
  // 首版先把地图、仓库、同步行动与基础战斗做成独立数据层；事件与完整战利品表可在此基础上继续扩展。
  const BOUNTY_MAX_PLAYERS = 6;
  const BOUNTY_MAX_ROUNDS = 40;
  const BOUNTY_GRID_SIZE = 13;
  const BOUNTY_TERRAIN_MODIFIERS = {
    P: { name: '平原', move: 1, short: 1.1, mid: 1, long: 0.9, shotgun: 0.9, scout: 1.15 },
    F: { name: '森林', move: 1, short: 1.05, mid: 0.9, long: 0.7, shotgun: 0.85, scout: 0.85 },
    H: { name: '房屋', move: 1, short: 1.2, mid: 1.05, long: 0.75, shotgun: 1.15, scout: 0.8 },
    W: { name: '水地', move: 1, short: 1.05, mid: 1, long: 0.8, shotgun: 0.85, scout: 1.15 },
    G: { name: '高地', move: 1, short: 0.85, mid: 1.05, long: 1.2, shotgun: 0.7, scout: 1.3 }
  };
  const BOUNTY_TRAITS = [
    { id: 'necromancer', name: '死灵法师', cost: 4, desc: '单排可自我复活；组队时可远距离拉起队友。' },
    { id: 'quartermaster', name: '军需官', cost: 3, desc: '携带上限由5格提升至6格。' },
    { id: 'lever-principle', name: '杠杆原理', cost: 3, desc: '杠杆武器开火x2，命中率-20%。' },
    { id: 'lightfoot', name: '轻步', cost: 2, desc: '森林与房屋移动不额外产生声音。' },
    { id: 'iron-skin', name: '硬皮', cost: 3, desc: '首次倒地时保留10点最大生命值。' },
    { id: 'doctor', name: '医师', cost: 2, desc: '治疗类道具额外恢复20HP。' }
  ];
  const BOUNTY_FIELD_TRAITS = [
    { id: 'dark-sight', name: '幽暗视界', desc: '侦查半径+2，并能在私人地图中辨认事件与怪物。' },
    { id: 'bloodless', name: '无血之躯', desc: '免疫流血，已经存在的流血会在获得时清除。' },
    { id: 'relentless', name: '不息者', desc: '每回合第一次冲刺或近战不消耗耐力。' },
    { id: 'beast-face', name: '兽面', desc: '怪物对你的常规感知距离减少2格。' },
    { id: 'bulwark', name: '壁垒', desc: '怪物与地图危险造成的伤害降低25%。' },
    { id: 'executioner', name: '行刑者', desc: '对普通怪物与Boss造成的伤害提高50%。' },
    { id: 'shadow-step', name: '影步', desc: '每回合第一次移动或冲刺不会制造声音。' },
    { id: 'frontiersman', name: '边境搜寻者', desc: '补给事件收益提高，并额外揭示相邻事件。' }
  ];
  const BOUNTY_MONSTER_TYPES = [
    { id: 'meathead', name: '肉傀儡', hp: 240, damage: 78, detectRange: 3, moveRange: 1, moveEvery: 2, armor: 0.1, terrain: ['P', 'H'], desc: '行动迟缓，但重击足以让受伤猎人直接倒地。' },
    { id: 'waterdevil', name: '水鬼', hp: 125, damage: 58, detectRange: 4, moveRange: 1, armor: 0, terrain: ['W'], poison: 2, desc: '偏爱水地，会用毒性撕咬封锁治疗。' },
    { id: 'screecher', name: '尖啸者', hp: 90, damage: 28, detectRange: 5, moveRange: 1, armor: 0, terrain: ['F', 'H'], scream: true, desc: '发现猎人后尖啸，向附近怪物共享目标。' },
    { id: 'armored', name: '铁甲虫', hp: 190, damage: 46, detectRange: 3, moveRange: 1, armor: 0.5, terrain: ['G', 'H'], desc: '枪弹伤害减半，近战与爆炸不受甲壳减伤。' },
    { id: 'hound', name: '血猎犬', hp: 105, damage: 48, detectRange: 5, moveRange: 2, armor: 0, terrain: ['P', 'F'], bleed: 10, desc: '移动迅速，优先追逐流血、燃烧或携赏金的猎人。' }
  ];
  const BOUNTY_MAP_EVENT_TYPES = [
    { id: 'relic', name: '猎人遗物', marker: '特', desc: '获得1技能点，并随机习得一个地图专属高级特质。' },
    { id: 'supply', name: '封存补给箱', marker: '补', desc: '补充当前武器备弹，并可能取得一件战术道具。' },
    { id: 'medic', name: '废弃医疗站', marker: '医', desc: '恢复生命并清除流血、燃烧与中毒。' },
    { id: 'nest', name: '腐化巢穴', marker: '巢', desc: '搜索会惊醒潜伏怪物。' },
    { id: 'fog', name: '白雾泉眼', marker: '雾', desc: '短暂引发浓雾，压缩普通侦查范围。' },
    { id: 'bell', name: '失控警铃', marker: '铃', desc: '发出覆盖大片区域的噪声，吸引怪物靠近。' },
    { id: 'powder', name: '弃置火药库', marker: '药', desc: '可取得炸药；没有道具空位时改为补充弹药。' },
    { id: 'herb', name: '月光药圃', marker: '草', desc: '获得持续治疗，并清除毒素。' }
  ];
  const BOUNTY_WEAPONS = [
    { id: 'colt-saa', name: '和平使者左轮', type: '短', damage: 63, mag: 6, reserve: 18, reload: '转轮逐发', perReload: 2, reloadFull: 3, hip: 67, aim: 79, range: 2, slots: 1, price: 35, fire: '单动', handgun: true },
    { id: 'schofield', name: '斯科菲尔德左轮', type: '短', damage: 66, mag: 6, reserve: 18, reload: '转轮逐发', perReload: 2, reloadFull: 3, hip: 65, aim: 80, range: 2, slots: 1, price: 45, fire: '单动', handgun: true },
    { id: 'colt-new-army', name: '新军双动左轮', type: '短', damage: 55, mag: 6, reserve: 18, reload: '转轮逐发', perReload: 2, reloadFull: 3, hip: 72, aim: 83, range: 2, slots: 1, price: 60, fire: '双动', burst: 2, burstPenalty: 12, handgun: true },
    { id: 'nagant', name: '纳甘左轮', type: '短', damage: 58, mag: 7, reserve: 21, reload: '转轮逐发', perReload: 2, reloadFull: 4, hip: 68, aim: 81, range: 2, slots: 1, price: 55, fire: '双动', burst: 2, burstPenalty: 12, handgun: true },
    { id: 'mauser', name: '毛瑟盒子炮', type: '短', damage: 52, mag: 10, reserve: 30, reload: '弹匣', perReload: 10, reloadFull: 1, hip: 70, aim: 84, range: 2, slots: 2, price: 140, fire: '半自动', burst: 2, burstPenalty: 8, quickReload: true, handgun: true },
    { id: 'win73', name: '温彻斯特73', type: '中', damage: 82, mag: 15, reserve: 30, reload: '管式', perReload: 2, reloadFull: 8, hip: 58, aim: 80, range: 3, slots: 3, price: 100, fire: '杠杆' },
    { id: 'win92', name: '温彻斯特92卡宾', type: '中', damage: 84, mag: 10, reserve: 20, reload: '管式', perReload: 2, reloadFull: 5, hip: 64, aim: 82, range: 3, slots: 2, price: 110, fire: '杠杆' },
    { id: 'springfield', name: '春田活门卡宾', type: '中', damage: 98, mag: 1, reserve: 12, reload: '单发', perReload: 1, reloadFull: 1, hip: 40, aim: 85, range: 3, slots: 2, price: 45, fire: '单发' },
    { id: 'rolling-carbine', name: '滚轮卡宾枪', type: '中', damage: 99, mag: 1, reserve: 12, reload: '单发', perReload: 1, reloadFull: 1, hip: 42, aim: 86, range: 3, slots: 2, price: 50, fire: '单发' },
    { id: 'sharps-carbine', name: '夏普斯卡宾', type: '中', damage: 97, mag: 1, reserve: 10, reload: '单发', perReload: 1, reloadFull: 1, hip: 43, aim: 86, range: 3, slots: 3, price: 65, fire: '单发' },
    { id: 'mosin', name: '莫辛91', type: '长', damage: 127, mag: 5, reserve: 5, reload: '夹条', perReload: 5, reloadFull: 1, hip: 40, aim: 88, range: 4, slots: 4, price: 210, fire: '栓动', quickReload: true },
    { id: 'lebel', name: '勒贝尔86', type: '长', damage: 120, mag: 8, reserve: 8, reload: '管式', perReload: 1, reloadFull: 8, hip: 42, aim: 87, range: 4, slots: 4, price: 205, fire: '栓动' },
    { id: 'martini', name: '马蒂尼-亨利', type: '长', damage: 139, mag: 1, reserve: 8, reload: '单发', perReload: 1, reloadFull: 1, hip: 32, aim: 91, range: 4, slots: 4, price: 95, fire: '单发' },
    { id: 'rolling-rifle', name: '滚轮长步枪', type: '长', damage: 136, mag: 1, reserve: 8, reload: '单发', perReload: 1, reloadFull: 1, hip: 34, aim: 90, range: 4, slots: 4, price: 105, fire: '单发' },
    { id: 'sharps-buffalo', name: '夏普斯水牛枪', type: '长', damage: 145, mag: 1, reserve: 7, reload: '单发', perReload: 1, reloadFull: 1, hip: 28, aim: 92, range: 4, slots: 4, price: 120, fire: '单发' },
    { id: 'win95', name: '温彻斯特95', type: '长', damage: 112, mag: 5, reserve: 5, reload: '夹条', perReload: 5, reloadFull: 1, hip: 50, aim: 86, range: 4, slots: 4, price: 230, fire: '杠杆' },
    { id: 'madsen', name: '麦德森轻机枪', type: '长', damage: 104, mag: 10, reserve: 10, reload: '弹匣', perReload: 10, reloadFull: 1, hip: 36, aim: 72, range: 3, slots: 5, price: 650, fire: '全自动', fullAuto: true, quickReload: true },
    { id: 'elephant', name: '猎象枪', type: '猎象', damage: 150, mag: 1, reserve: 4, reload: '单发', perReload: 1, reloadFull: 1, hip: 25, aim: 52, range: 5, slots: 5, price: 480, fire: '单发', bossDamage: 450, noFalloff: true },
    { id: 'colt-78', name: '柯尔特78双管', type: '霰弹', damage: 175, mag: 2, reserve: 10, reload: '折断', perReload: 2, reloadFull: 1, hip: 74, aim: 78, range: 2, slots: 3, price: 100, fire: '双管', falloff: [175, 155, 92, 40] },
    { id: 'remington-89', name: '雷明顿89双管', type: '霰弹', damage: 180, mag: 2, reserve: 10, reload: '折断', perReload: 2, reloadFull: 1, hip: 72, aim: 78, range: 2, slots: 3, price: 105, fire: '双管', falloff: [180, 158, 90, 38] },
    { id: 'harrington', name: '哈灵顿单管', type: '霰弹', damage: 185, mag: 1, reserve: 12, reload: '单发', perReload: 1, reloadFull: 1, hip: 71, aim: 78, range: 2, slots: 3, price: 45, fire: '单发', falloff: [185, 160, 88, 30] },
    { id: 'win97', name: '温彻斯特97', type: '霰弹', damage: 160, mag: 5, reserve: 10, reload: '管式', perReload: 1, reloadFull: 5, hip: 72, aim: 80, range: 2, slots: 4, price: 175, fire: '泵动', falloff: [160, 145, 108, 55] },
    { id: 'browning-auto5', name: '勃朗宁自动五号', type: '霰弹', damage: 158, mag: 5, reserve: 10, reload: '弹匣', perReload: 5, reloadFull: 1, hip: 70, aim: 82, range: 2, slots: 4, price: 260, fire: '半自动', burst: 2, burstPenalty: 15, quickReload: true, falloff: [158, 148, 110, 58] },
    { id: 'cattleman', name: '卡特曼左轮', type: '短', damage: 60, mag: 6, reserve: 18, reload: '转轮逐发', perReload: 1, reloadFull: 4, hip: 69, aim: 78, range: 2, slots: 1, price: 25, fire: '单动', handgun: true },
    { id: 'bornheim', name: '伯恩海姆', type: '短', damage: 54, mag: 5, reserve: 15, reload: '弹匣', perReload: 5, reloadFull: 1, hip: 73, aim: 81, range: 2, slots: 2, price: 95, fire: '半自动', burst: 2, burstPenalty: 10, quickReload: true, handgun: true },
    { id: 'handcrossbow', name: '手弩', type: '短', damage: 72, mag: 1, reserve: 9, reload: '单发', perReload: 1, reloadFull: 1, hip: 52, aim: 76, range: 2, slots: 2, price: 30, fire: '单发', silent: true },
    { id: 'dolch', name: '多尔希', type: '短', damage: 59, mag: 10, reserve: 20, reload: '弹匣', perReload: 10, reloadFull: 1, hip: 74, aim: 86, range: 2, slots: 2, price: 320, fire: '半自动', burst: 2, burstPenalty: 12, quickReload: true, handgun: true },
    { id: 'uppercut', name: '上勾拳', type: '短', damage: 78, mag: 6, reserve: 12, reload: '转轮逐发', perReload: 1, reloadFull: 4, hip: 48, aim: 76, range: 3, slots: 2, price: 150, fire: '单动', handgun: true },
    { id: 'vetterli', name: '维特利', type: '中', damage: 88, mag: 6, reserve: 12, reload: '管式', perReload: 2, reloadFull: 4, hip: 55, aim: 82, range: 3, slots: 3, price: 135, fire: '栓动' },
    { id: 'centennial', name: '百年纪念', type: '中', damage: 91, mag: 6, reserve: 12, reload: '管式', perReload: 2, reloadFull: 4, hip: 57, aim: 84, range: 3, slots: 3, price: 160, fire: '杠杆' },
    { id: 'scottfield', name: '斯科特菲尔德', type: '中', damage: 79, mag: 6, reserve: 18, reload: '转轮逐发', perReload: 2, reloadFull: 3, hip: 62, aim: 82, range: 3, slots: 1, price: 70, fire: '单动', handgun: true },
    { id: 'pax', name: '帕克斯', type: '中', damage: 76, mag: 6, reserve: 18, reload: '转轮逐发', perReload: 2, reloadFull: 3, hip: 64, aim: 80, range: 3, slots: 1, price: 65, fire: '单动', handgun: true },
    { id: 'win76', name: '温彻斯特76', type: '中', damage: 86, mag: 8, reserve: 16, reload: '管式', perReload: 2, reloadFull: 4, hip: 59, aim: 81, range: 3, slots: 3, price: 115, fire: '杠杆' },
    { id: 'berthier', name: '贝尔蒂耶', type: '长', damage: 121, mag: 3, reserve: 6, reload: '夹条', perReload: 3, reloadFull: 1, hip: 39, aim: 87, range: 4, slots: 4, price: 150, fire: '栓动', quickReload: true },
    { id: 'sparks', name: '斯帕克斯', type: '长', damage: 146, mag: 1, reserve: 8, reload: '单发', perReload: 1, reloadFull: 1, hip: 30, aim: 92, range: 5, slots: 4, price: 130, fire: '单发' },
    { id: 'romero', name: '罗梅罗单管', type: '霰弹', damage: 190, mag: 1, reserve: 12, reload: '单发', perReload: 1, reloadFull: 1, hip: 73, aim: 79, range: 2, slots: 3, price: 35, fire: '单发', falloff: [190, 158, 82, 22] },
    { id: 'terminus', name: '终结者', type: '霰弹', damage: 155, mag: 5, reserve: 10, reload: '管式', perReload: 1, reloadFull: 5, hip: 68, aim: 78, range: 2, slots: 4, price: 210, fire: '半自动', burst: 2, burstPenalty: 15, falloff: [155, 144, 102, 48] },
    { id: 'nitro', name: '硝化步枪', type: '长', damage: 145, mag: 2, reserve: 4, reload: '折断', perReload: 2, reloadFull: 1, hip: 34, aim: 82, range: 5, slots: 5, price: 420, fire: '双管', bossDamage: 500 },
    { id: 'specter', name: '幽灵半自动', type: '霰弹', damage: 150, mag: 4, reserve: 12, reload: '管式', perReload: 1, reloadFull: 4, hip: 67, aim: 79, range: 2, slots: 4, price: 230, fire: '半自动', burst: 2, burstPenalty: 16, falloff: [150, 138, 96, 43] },
    { id: 'crown', name: '皇冠双管', type: '霰弹', damage: 172, mag: 2, reserve: 12, reload: '折断', perReload: 2, reloadFull: 1, hip: 75, aim: 80, range: 2, slots: 3, price: 120, fire: '双管', falloff: [172, 150, 82, 35] },
    { id: 'drilling', name: '三管猎枪', type: '霰弹', damage: 185, mag: 3, reserve: 9, reload: '折断', perReload: 3, reloadFull: 1, hip: 72, aim: 78, range: 2, slots: 4, price: 280, fire: '三管', falloff: [185, 158, 90, 38] },
    { id: 'mosin-scope', name: '莫辛长瞄', type: '长', damage: 127, mag: 5, reserve: 5, reload: '夹条', perReload: 5, reloadFull: 1, hip: 34, aim: 94, range: 6, scope: 5, slots: 5, price: 330, fire: '栓动', quickReload: true },
    { id: 'winfield-scope', name: '温菲尔德长瞄', type: '中', damage: 82, mag: 15, reserve: 30, reload: '管式', perReload: 2, reloadFull: 8, hip: 52, aim: 91, range: 5, scope: 4, slots: 4, price: 210, fire: '杠杆' }
  ];
  const BOUNTY_AMMO = [
    { id: 'normal', name: '普通弹', families: ['短', '中', '长', '霰弹'], price: 0, desc: '无额外效果。' },
    { id: 'dum-dum', name: '达姆弹', families: ['短', '中', '长'], price: 12, desc: '命中后造成流血；房屋/森林命中率略降。' },
    { id: 'fmj', name: '被甲弹', families: ['短', '中'], price: 14, desc: '房屋交战命中提高，远距离命中降低。' },
    { id: 'spitzer', name: '尖头弹', families: ['长'], price: 18, desc: '房屋与远距离命中提高，但伤害降低。' },
    { id: 'incendiary', name: '燃烧弹', families: ['短', '中', '长', '霰弹'], price: 16, desc: '命中后燃烧，持续削减生命上限。' },
    { id: 'poison', name: '毒弹', families: ['短', '中', '长'], price: 15, desc: '命中后中毒，短时间无法使用治疗。' },
    { id: 'coin', name: '硬币弹', families: ['霰弹'], price: 20, desc: '近距离威力大幅提高，远距离衰减明显。' },
    { id: 'slug', name: '独头弹', families: ['霰弹'], price: 22, desc: '降低腰射，提升中近距离单发威力。' },
    { id: 'arrow', name: '箭弹', families: ['霰弹'], price: 18, desc: '近距离威力降低，中远距离威力略升。' }
  ];
  const BOUNTY_ITEMS = [
    { id: 'medkit', name: '急救包', type: '治疗', price: 45, effect: '可使用3次；每次恢复50HP并清除流血、燃烧' },
    { id: 'vitamin', name: '补充针剂', type: '治疗', price: 40, effect: '立即恢复80HP' },
    { id: 'strong-vitamin', name: '强效补充针剂', type: '治疗', price: 65, effect: '立即恢复120HP' },
    { id: 'regen-shot', name: '治疗针剂', type: '治疗', price: 50, effect: '5回合内每回合恢复15HP' },
    { id: 'stamina', name: '体力补剂', type: '补剂', price: 35, effect: '3回合内耐力无限' },
    { id: 'strong-stamina', name: '强效体力补剂', type: '补剂', price: 60, effect: '5回合内耐力无限' },
    { id: 'frag', name: '破片手榴弹', type: '爆炸', price: 90, damage: [175, 110, 50], effect: '爆心同格可击倒猎人' },
    { id: 'dynamite', name: '炸药棒', type: '爆炸', price: 45, damage: [180, 90, 30], effect: '对怪物与Boss造成20倍伤害' },
    { id: 'big-dynamite', name: '大型炸药捆', type: '爆炸', price: 125, damage: [270, 190, 100], effect: '大范围爆炸' },
    { id: 'smoke', name: '烟雾弹', type: '战术', price: 35, effect: '2回合阻挡视线' },
    { id: 'decoy', name: '声音诱饵', type: '战术', price: 15, effect: '制造虚假枪声' },
    { id: 'knife', name: '猎刀', type: '近战', price: 20, damage: [45, 110], effect: '低声近战' },
    { id: 'machete', name: '砍刀', type: '近战', price: 40, damage: [60, 140], effect: '中等耐力消耗' },
    { id: 'axe', name: '战斗斧', type: '近战', price: 60, damage: [75, 165], effect: '重击伤害高' },
    { id: 'hammer', name: '铁路锤', type: '近战', price: 60, damage: [70, 175], effect: '对怪物效果优秀' },
    { id: 'spear', name: '猎矛', type: '近战', price: 70, damage: [80, 180], effect: '近战距离略长' }
  ];
  const BOUNTY_HUNTER_NAMES = ['荒野新手', '沼泽拾荒者', '破旧侦察兵'];
  const BOUNTY_MAPS = [
    { id: 'graystone', name: '灰岩矿镇·断脊镇', cells: [
      'FFPPPGGGPPPPF','FFPPHHGGPPPPF','FPPHHHPPPPPPF','WWPPHPPFFPPG','WPPHHHPPFFPG','WPPPPPGGPPPG','P PFFPGGPPPPF'.replace(/ /g,''),'PFFFFPPPPPPF','PPPPPPFFPPPP','FPPPPGGPPPPF','PPFFPPPPGGPP','PPPPPPPPPFFF','PPPPPPGGGPPP'
    ], landmarks: [{ name: '旧矿镇', cells: ['D2','E2','F2','D3','E3','F3','D4','E4','F4'] }, { name: '断脊高地', cells: ['F1','G1','H1','G2','H2'] }, { name: '黑水沟', cells: ['A4','B4','A5','B5','A6','B6'] }, { name: '风口高地', cells: ['F6','G6','F7','G7'] }, { name: '东林猎场', cells: ['H3','I3','H4','I4','H5','I5'] }], loot: ['E3','E4','D5','B4','A5','H1','G6','I4'] },
    { id: 'mistmarsh', name: '雾泽猎场·沉钟湿地', cells: [
      'FFPPGGPPPPPPF','FWWPGPPFFPPPG','PWHHHPPPPPPPF','PPWHH PFFPPPP'.replace(/ /g,''),'GPPPPPPFFPPPP','GGPPHHPPPPPPF','PGPWWWPPFFPPP','PPPWWWPPFFPPP','PPFPPPPPPPPPG','FPPPGGPPPPPPF','PPPPPPFFPPPP','PPPPPGGGPPPP','PPPPPPPPPPFFF'
    ], landmarks: [{ name: '沉钟教堂', cells: ['C3','D3','E3','D4','E4'] }, { name: '北岭观测台', cells: ['E1','F1','E2'] }, { name: '芦苇水道', cells: ['B2','C2','B3','C3','C4'] }, { name: '旧锯木厂', cells: ['E6','F6'] }, { name: '南岸旧码头', cells: ['D7','E7','F7','D8','E8'] }, { name: '东侧沉林', cells: ['G4','H4','G5','H5','I5','H6'] }], loot: ['D3','C3','F1','B3','C4','E6','E7','H5'] },
    { id: 'redvalley', name: '赤谷边境·黑木岭', cells: [
      'GGPPFFPPPPPPG','GHH PFFPPPPPG'.replace(/ /g,''),'PHHPPPPPGGPPF','PPPWWPPPPPPPG','FFPWWPHHPPPPF','FPPPPPHHPPPPF','PPGGPPPPPPPPF','PGGPPFFFFPPPP','PPPPPPPPPPPGG','FPPPPGGPPPPPP','PPPPPPPPFFPP','PPPPPGGPPPPP','PPPPPPPPPPPPG'
    ], landmarks: [{ name: '北坡哨台', cells: ['A1','B1','A2'] }, { name: '黑木岭矿场', cells: ['B2','C2','B3','C3'] }, { name: '赤河浅滩', cells: ['D4','E4','D5','E5'] }, { name: '东部铁路站', cells: ['G5','H5','G6','H6'] }, { name: '望风台', cells: ['H2','I2','H3','I3'] }, { name: '西侧密林', cells: ['A5','B5','A6','A7','B7','B8'] }, { name: '南岭矿道', cells: ['C7','D7','B8','C8'] }], loot: ['C2','B3','A1','D4','G5','H6','I3','A6'] }
  ];
  BOUNTY_MAPS.forEach((map) => { map.cells = map.cells.map((row) => { const clean = String(row || '').replace(/\s/g, ''); return (clean + 'P'.repeat(BOUNTY_GRID_SIZE)).slice(0, BOUNTY_GRID_SIZE); }); });
  function bountyMapById(id) { return BOUNTY_MAPS.find((map) => map.id === id) || BOUNTY_MAPS[0]; }
  function bountyPos(value) {
    const m = /^([A-Ma-m])(1[0-3]|[1-9])$/.exec(String(value || '').trim());
    if (!m) return null;
    return { x: m[1].toUpperCase().charCodeAt(0) - 65, y: int(m[2], 1) - 1, text: `${m[1].toUpperCase()}${m[2]}` };
  }
  function bountyCell(map, pos) { const p = bountyPos(pos); return p ? String((map.cells[p.y] || '').charAt(p.x) || 'P') : 'P'; }
  function bountyDist(a, b) { const x = bountyPos(a); const y = bountyPos(b); return x && y ? Math.abs(x.x - y.x) + Math.abs(x.y - y.y) : 99; }
  function bountyStepToward(from, to, steps) { const start = bountyPos(from); const target = bountyPos(to); if (!start || !target) return from; let x = start.x; let y = start.y; let left = Math.max(1, int(steps, 1)); while (left-- > 0) { if (x !== target.x) x += target.x > x ? 1 : -1; else if (y !== target.y) y += target.y > y ? 1 : -1; } return `${String.fromCharCode(65 + x)}${y + 1}`; }
  function bountyTerrainName(code) { return ({ P: '平原', F: '森林', H: '房屋', W: '水地', G: '高地' })[code] || '平原'; }
  function bountyWeapon(id) { return BOUNTY_WEAPONS.find((weapon) => weapon.id === id) || BOUNTY_WEAPONS[0]; }
  function bountyItem(id) { return BOUNTY_ITEMS.find((item) => item.id === id) || BOUNTY_ITEMS[0]; }
  function bountyItemMaxUses(id) { return id === 'medkit' ? 3 : 1; }
  function bountyNormalizeItemUses(items, uses) { const source = Array.isArray(uses) ? uses : []; return (items || []).map((id, index) => clamp(int(source[index], bountyItemMaxUses(id)), 1, bountyItemMaxUses(id))); }
  function bountyAddPlayerItem(player, id) { player.items = Array.isArray(player.items) ? player.items : []; player.itemUses = bountyNormalizeItemUses(player.items, player.itemUses); player.items.push(id); player.itemUses.push(bountyItemMaxUses(id)); }
  function bountyConsumePlayerItem(player, index) { player.itemUses = bountyNormalizeItemUses(player.items, player.itemUses); const id = player.items[index]; const maximum = bountyItemMaxUses(id); const remaining = Math.max(0, int(player.itemUses[index], maximum) - 1); if (remaining > 0) player.itemUses[index] = remaining; else { player.items.splice(index, 1); player.itemUses.splice(index, 1); } return { id, maximum, remaining }; }
  function bountyAmmo(id) { return BOUNTY_AMMO.find((ammo) => ammo.id === id) || BOUNTY_AMMO[0]; }
  function bountyFindAmmo(value) { const text = String(value || '').trim().toLowerCase(); return BOUNTY_AMMO.find((ammo) => ammo.id.toLowerCase() === text || ammo.name === value) || null; }
  function bountyHunterLevel(skillPoints) { return Math.max(1, int(skillPoints, 5) - 4); }
  function bountyFieldTrait(value) { const text = String(value || '').trim().toLowerCase(); return BOUNTY_FIELD_TRAITS.find((trait) => trait.id.toLowerCase() === text || trait.name === value) || null; }
  function bountyHasFieldTrait(player, id) { return !!player && Array.isArray(player.fieldTraits) && player.fieldTraits.indexOf(id) >= 0; }
  function bountyMonsterType(value) { const text = String(value || '').trim().toLowerCase(); return BOUNTY_MONSTER_TYPES.find((type) => type.id === text || type.name === value) || BOUNTY_MONSTER_TYPES[0]; }
  function bountyMapEventType(value) { const text = String(value || '').trim().toLowerCase(); return BOUNTY_MAP_EVENT_TYPES.find((type) => type.id === text || type.name === value) || BOUNTY_MAP_EVENT_TYPES[0]; }
  function bountyAdjacentCells(pos, distance) {
    const origin = bountyPos(pos); if (!origin) return [];
    const cells = []; const radius = Math.max(1, int(distance, 1));
    for (let y = Math.max(0, origin.y - radius); y <= Math.min(BOUNTY_GRID_SIZE - 1, origin.y + radius); y++) for (let x = Math.max(0, origin.x - radius); x <= Math.min(BOUNTY_GRID_SIZE - 1, origin.x + radius); x++) if (Math.abs(origin.x - x) + Math.abs(origin.y - y) <= radius && (x !== origin.x || y !== origin.y)) cells.push(`${String.fromCharCode(65 + x)}${y + 1}`);
    return cells;
  }
  function bountyBossSearchArea(pos) {
    const origin = bountyPos(pos); if (!origin) return [];
    const startX = clamp(origin.x - 1, 0, BOUNTY_GRID_SIZE - 3); const startY = clamp(origin.y - 1, 0, BOUNTY_GRID_SIZE - 3); const cells = [];
    for (let y = startY; y < startY + 3; y++) for (let x = startX; x < startX + 3; x++) cells.push(`${String.fromCharCode(65 + x)}${y + 1}`);
    return cells;
  }
  function bountyAddSound(room, pos, intensity, sourceId, kind) {
    if (!room || !bountyPos(pos)) return;
    if (!Array.isArray(room.sounds)) room.sounds = [];
    room.sounds.push({ pos, intensity: clamp(int(intensity, 1), 1, 8), sourceId: sourceId || '', kind: kind || '动静', round: Math.max(0, int(room.round, 0)) });
    room.sounds = room.sounds.filter((sound) => int(sound.round, 0) >= room.round - 2).slice(-18);
  }
  function bountyCreateMonster(typeId, pos, id) {
    const type = bountyMonsterType(typeId);
    return { id: id || `monster-${String(nowMs())}-${Math.floor(Math.random() * 10000)}`, type: type.id, name: type.name, pos, homePos: pos, hp: type.hp, maxHp: type.hp, alive: true, damage: type.damage, detectRange: type.detectRange, moveRange: type.moveRange, armor: type.armor, targetId: '', alertedUntil: 0, lastAction: '潜伏', lastHowlRound: 0, status: '游荡' };
  }
  function bountyNormalizeMonster(monster, index) {
    if (!monster || typeof monster !== 'object') return bountyCreateMonster('meathead', 'G7', `monster-${index + 1}`);
    let type = bountyMonsterType(monster.type);
    if (!monster.type) type = BOUNTY_MONSTER_TYPES.find((candidate) => candidate.name === monster.name) || type;
    monster.id = monster.id || `monster-${index + 1}`; monster.type = type.id; monster.name = type.name; monster.pos = bountyPos(monster.pos) ? bountyPos(monster.pos).text : 'G7'; monster.homePos = bountyPos(monster.homePos) ? bountyPos(monster.homePos).text : monster.pos;
    monster.maxHp = Math.max(1, int(monster.maxHp, type.hp)); monster.hp = clamp(int(monster.hp, monster.maxHp), 0, monster.maxHp); monster.alive = monster.alive !== false && monster.hp > 0; monster.damage = Math.max(1, int(monster.damage, type.damage)); monster.detectRange = Math.max(1, int(monster.detectRange, type.detectRange)); monster.moveRange = Math.max(1, int(monster.moveRange, type.moveRange)); monster.armor = Math.max(0, Math.min(0.8, Number(monster.armor == null ? type.armor : monster.armor))); monster.targetId = String(monster.targetId || ''); monster.alertedUntil = Math.max(0, int(monster.alertedUntil, 0)); monster.lastHowlRound = Math.max(0, int(monster.lastHowlRound, 0)); monster.lastAction = String(monster.lastAction || '潜伏'); monster.status = String(monster.status || '游荡'); return monster;
  }
  function bountyPersistHunterProgress(player) {
    if (!player || player.isBot || !player.hunterId) return;
    const profile = loadProfile(player.id, player.name); bountyProfileNormalize(profile); const hunter = profile.bounty.hunters.find((item) => item.id === player.hunterId); if (!hunter) return;
    hunter.skillPoints = Math.max(int(hunter.skillPoints, 5), int(player.skillPoints, 5)); hunter.level = bountyHunterLevel(hunter.skillPoints); hunter.fieldTraits = Array.from(new Set((hunter.fieldTraits || []).concat(player.fieldTraits || []).filter((id) => !!bountyFieldTrait(id)))); saveProfile(profile);
  }
  function bountyGrantSkillProgress(player, grantTrait) {
    player.skillPoints = Math.max(5, int(player.skillPoints, 5)) + 1; player.level = bountyHunterLevel(player.skillPoints); player.fieldTraits = Array.isArray(player.fieldTraits) ? player.fieldTraits : [];
    let learned = null;
    if (grantTrait) { const available = BOUNTY_FIELD_TRAITS.filter((trait) => player.fieldTraits.indexOf(trait.id) < 0); learned = available.length ? pick(available) : null; if (learned) player.fieldTraits.push(learned.id); }
    if (learned && learned.id === 'bloodless') { player.bleed = 0; player.bleedSource = ''; }
    bountyPersistHunterProgress(player); return learned;
  }
  function bountyWeaponFamily(weapon) { return weapon && weapon.type === '猎象' ? '长' : String(weapon && weapon.type || '短'); }
  function bountyWeaponAmmoKey(state) { const weapon = bountyWeapon(state && state.id); return `${bountyWeaponFamily(weapon)}:${bountyAmmo(state && state.ammoType).id}`; }
  function bountyWeaponMagazine(state) { const weapon = bountyWeapon(state && state.id); return weapon.mag * (state && state.dual ? 2 : 1); }
  function bountyWeaponSlotCost(state) { const weapon = bountyWeapon(state && state.id); return weapon.slots * (state && state.dual ? 2 : 1); }
  function bountyWeaponDisplayName(state) { if (!state || !state.id) return '无武器'; const weapon = bountyWeapon(state.id); return `${state.dual ? '双持' : ''}${weapon.name}`; }
  function bountyNormalizeWeaponState(value, fallbackId) {
    const raw = value && typeof value === 'object' ? value : {}; const weapon = bountyFindWeapon(raw.id) || bountyWeapon(fallbackId || 'colt-saa'); const family = bountyWeaponFamily(weapon); const requestedAmmo = bountyFindAmmo(raw.ammoType); const ammoType = requestedAmmo && requestedAmmo.families.indexOf(family) >= 0 ? requestedAmmo.id : 'normal'; const dual = !!raw.dual && !!weapon.handgun; const maximum = weapon.mag * (dual ? 2 : 1);
    return { id: weapon.id, ammo: clamp(int(raw.ammo, maximum), 0, maximum), reserve: Math.max(0, int(raw.reserve, weapon.reserve)), ammoType, dual };
  }
  function bountySyncWeaponAlias(owner) {
    if (!owner || !Array.isArray(owner.weapons) || !owner.weapons.length) return null;
    owner.activeWeaponIndex = clamp(int(owner.activeWeaponIndex, 0), 0, owner.weapons.length - 1); owner.weapons.forEach((state) => { state.reserve = Math.max(0, int((owner.ammoPools || {})[bountyWeaponAmmoKey(state)], 0)); }); owner.weapon = owner.weapons[owner.activeWeaponIndex]; return owner.weapon;
  }
  function bountyNormalizeWeapons(owner) {
    if (!owner || typeof owner !== 'object') return owner; const preserveEmpty = !!owner.weaponless; let raw = Array.isArray(owner.weapons) ? owner.weapons.slice(0, 2) : []; let activeIndex = clamp(int(owner.activeWeaponIndex, 0), 0, Math.max(0, raw.length - 1));
    if (owner.weapon && bountyFindWeapon(owner.weapon.id) && !raw.length && !preserveEmpty) raw = [owner.weapon];
    // `weapon` is kept as a backwards-compatible alias.  A number of old
    // saves (and callers that customise a loadout before entering a room)
    // update that alias directly, so fold all meaningful fields back into
    // the active slot before normalising.  Without this, assigning a new
    // weapon or special ammo to `player.weapon` would silently continue to
    // use the stale first entry in `weapons`.
    if (owner.weapon && bountyFindWeapon(owner.weapon.id) && raw.length) {
      const alias = owner.weapon; const current = raw[activeIndex] || {};
      if (alias.id !== current.id || int(alias.ammo, -1) !== int(current.ammo, -1) || String(alias.ammoType || 'normal') !== String(current.ammoType || 'normal') || !!alias.dual !== !!current.dual) {
        raw[activeIndex] = Object.assign({}, current, alias);
      }
    }
    if (!raw.length && !preserveEmpty) raw = [{ id: 'colt-saa', ammo: bountyWeapon('colt-saa').mag, reserve: bountyWeapon('colt-saa').reserve }]; owner.weapons = raw.map((state) => bountyNormalizeWeaponState(state, 'colt-saa')).slice(0, 2); activeIndex = owner.weapons.length ? clamp(activeIndex, 0, owner.weapons.length - 1) : 0; owner.activeWeaponIndex = activeIndex;
    const hadPools = owner.ammoPools && typeof owner.ammoPools === 'object' && !Array.isArray(owner.ammoPools); const pools = {}; if (hadPools) Object.keys(owner.ammoPools).forEach((key) => { pools[key] = Math.max(0, int(owner.ammoPools[key], 0)); });
    owner.weapons.forEach((state) => { const key = bountyWeaponAmmoKey(state); if (!hadPools) pools[key] = int(pools[key], 0) + Math.max(0, int(state.reserve, bountyWeapon(state.id).reserve)); else if (pools[key] == null) pools[key] = bountyWeapon(state.id).reserve; });
    owner.ammoPools = pools; owner.weaponless = owner.weapons.length === 0; if (owner.weaponless) { owner.weapon = null; owner.activeWeaponIndex = 0; } else bountySyncWeaponAlias(owner); return owner;
  }
  function bountyResetAmmoPools(owner) {
    bountyNormalizeWeapons(owner); const pools = {}; owner.weapons.forEach((state) => { const weapon = bountyWeapon(state.id); const key = bountyWeaponAmmoKey(state); state.ammo = bountyWeaponMagazine(state); pools[key] = int(pools[key], 0) + weapon.reserve * (state.dual ? 2 : 1); }); owner.ammoPools = pools; bountySyncWeaponAlias(owner); return owner;
  }
  function bountyActiveWeapon(owner) { bountyNormalizeWeapons(owner); return owner.weapons[owner.activeWeaponIndex]; }
  function bountySharedReserve(owner, state) { if (!owner || !state || !state.id) return 0; bountyNormalizeWeapons(owner); return Math.max(0, int(owner.ammoPools[bountyWeaponAmmoKey(state)], 0)); }
  function bountySetSharedReserve(owner, state, amount) { if (!owner || typeof owner !== 'object') return; if (!owner.ammoPools || typeof owner.ammoPools !== 'object' || Array.isArray(owner.ammoPools)) owner.ammoPools = {}; const target = state || owner.weapon || (owner.weapons && owner.weapons[owner.activeWeaponIndex]); if (!target) return; owner.ammoPools[bountyWeaponAmmoKey(target)] = Math.max(0, int(amount, 0)); if (owner.weapons && owner.weapons[owner.activeWeaponIndex] === target) owner.weapon = target; bountySyncWeaponAlias(owner); }
  function bountyLoadoutSlots(owner) { bountyNormalizeWeapons(owner); return owner.weapons.reduce((sum, state) => sum + bountyWeaponSlotCost(state), 0); }
  function bountySwitchWeapon(owner, slot) { bountyNormalizeWeapons(owner); if (!owner.weapons.length) return '当前没有武器，无法切换。'; if (owner.weapons.length < 2) return '当前只携带一把武器，无法切换。'; const target = slot == null || int(slot, 0) <= 0 ? (owner.activeWeaponIndex === 0 ? 1 : 0) : int(slot, 0) - 1; if (target < 0 || target >= owner.weapons.length) return '武器栏位无效，只能切换到1号或2号武器。'; if (target === owner.activeWeaponIndex) return `${bountyWeaponDisplayName(owner.weapon)}已经在手中。`; owner.activeWeaponIndex = target; bountySyncWeaponAlias(owner); return '';
  }
  function bountyNewHunter(id, name, bot) {
    const weapon = bountyWeapon(bot ? 'colt-saa' : 'colt-saa');
    const hunter = { id: `${String(id || 'hunter')}-hunter-${String(nowMs())}`, ownerId: id, name: name || '荒野新手', bot: !!bot, hp: 150, maxHp: 150, stamina: 3, maxStamina: 3, downed: false, dead: false, weapon: { id: weapon.id, ammo: weapon.mag, reserve: weapon.reserve }, weapons: [], activeWeaponIndex: 0, ammoPools: {}, items: ['medkit', 'knife'], traits: [], fieldTraits: [], skillPoints: 5, level: 1, spentTraitPoints: 0, bounty: false, bountyVision: 5, kills: 0, bossDamage: 0, clues: 0, loot: [], lastAction: '', status: '待命' }; bountyNormalizeWeapons(hunter); return hunter;
  }
  function bountyProfileNormalize(p) {
    if (!p.bounty || typeof p.bounty !== 'object') p.bounty = { hunters: [], templates: [], selected: '' };
    if (!Array.isArray(p.bounty.hunters)) p.bounty.hunters = [];
    if (!Array.isArray(p.bounty.templates)) p.bounty.templates = [];
    if (!p.bounty.hunters.length) p.bounty.hunters.push(bountyNewHunter(p.id, '荒野新手', false));
    p.bounty.hunters.forEach((hunter, index) => { if (!hunter.id) hunter.id = `${String(p.id)}-hunter-${index + 1}`; hunter.ownerId = p.id; hunter.maxHp = clamp(int(hunter.maxHp, 150), 0, 150); hunter.hp = clamp(int(hunter.hp, hunter.maxHp), 0, hunter.maxHp); hunter.stamina = clamp(int(hunter.stamina, 3), 0, 3); hunter.maxStamina = 3; hunter.dead = !!hunter.dead; hunter.downed = !!hunter.downed; bountyNormalizeWeapons(hunter); hunter.items = (Array.isArray(hunter.items) ? hunter.items : ['medkit', 'knife']).filter((id) => !!bountyFindItem(id)).slice(0, 4); if (!hunter.items.length) hunter.items = ['medkit', 'knife']; hunter.traits = Array.isArray(hunter.traits) ? hunter.traits.filter((id) => !!bountyFindTrait(id)) : []; hunter.fieldTraits = Array.isArray(hunter.fieldTraits) ? Array.from(new Set(hunter.fieldTraits.filter((id) => !!bountyFieldTrait(id)))) : []; hunter.skillPoints = Math.max(5, int(hunter.skillPoints, 5)); hunter.level = bountyHunterLevel(hunter.skillPoints); hunter.spentTraitPoints = hunter.traits.reduce((sum, traitId) => sum + ((bountyFindTrait(traitId) || {}).cost || 0), 0); });
    if (!p.bounty.selected || !p.bounty.hunters.some((hunter) => hunter.id === p.bounty.selected && !hunter.dead)) p.bounty.selected = p.bounty.hunters.find((hunter) => !hunter.dead).id;
    return p;
  }
  function bountyHunterSummary(hunter) { bountyNormalizeWeapons(hunter); const weaponNames = hunter.weapons.map(bountyWeaponDisplayName).join(' / '); const fieldNames = (hunter.fieldTraits || []).map((id) => (bountyFieldTrait(id) || {}).name).filter(Boolean); return `${hunter.name} · Lv${bountyHunterLevel(hunter.skillPoints)}（${Math.max(5, int(hunter.skillPoints, 5))}点） · ${hunter.dead ? '已死亡' : `HP${hunter.hp}/${hunter.maxHp}`} · ${weaponNames} · ${bountyLoadoutSlots(hunter)}/${hunter.traits.indexOf('quartermaster') >= 0 ? 6 : 5}格 · 道具${(hunter.items || []).length}/4 · 常规特质${(hunter.traits || []).length}${fieldNames.length ? ` · 地图特质${fieldNames.join('、')}` : ''}`; }
  function bountyFindWeapon(value) { const text = String(value || '').trim().toLowerCase(); return BOUNTY_WEAPONS.find((weapon) => weapon.id.toLowerCase() === text || weapon.name === value) || null; }
  function bountyFindItem(value) { const text = String(value || '').trim().toLowerCase(); return BOUNTY_ITEMS.find((item) => item.id.toLowerCase() === text || item.name === value) || null; }
  function bountyFindTrait(value) { const text = String(value || '').trim().toLowerCase(); return BOUNTY_TRAITS.find((trait) => trait.id.toLowerCase() === text || trait.name === value) || null; }
  function bountySelectedHunter(p) { bountyProfileNormalize(p); return p.bounty.hunters.find((hunter) => hunter.id === p.bounty.selected) || p.bounty.hunters[0]; }
  function bountyNormalizeRoom(room) {
    if (!room || room.game !== 'bounty') return room;
    room.version = Math.max(5, int(room.version, 5)); room.mode = room.mode === 'pve' ? 'duo' : room.mode || 'pvpve'; room.maxRounds = clamp(int(room.maxRounds, BOUNTY_MAX_ROUNDS), 1, 40); room.round = Math.max(0, int(room.round, 0)); room.entry = 0;
    room.exits = Array.isArray(room.exits) ? room.exits : []; room.clues = Array.isArray(room.clues) ? room.clues : []; room.publicEvents = Array.isArray(room.publicEvents) ? room.publicEvents : [];
    room.monsters = (Array.isArray(room.monsters) ? room.monsters : []).map(bountyNormalizeMonster); room.publicIntel = Array.isArray(room.publicIntel) ? room.publicIntel : []; room.sounds = Array.isArray(room.sounds) ? room.sounds : [];
    room.mapEvents = (Array.isArray(room.mapEvents) ? room.mapEvents : []).map((event, index) => { const type = bountyMapEventType(event && event.type); return { id: String(event && event.id || `event-${index + 1}`), type: type.id, name: type.name, marker: type.marker, pos: bountyPos(event && event.pos) ? bountyPos(event.pos).text : 'G7', state: event && event.state === 'claimed' ? 'claimed' : 'active', claimedById: String(event && event.claimedById || ''), claimedByName: String(event && event.claimedByName || ''), spawnedRound: Math.max(0, int(event && event.spawnedRound, 0)) }; });
    room.weather = room.weather && typeof room.weather === 'object' ? room.weather : { type: '', untilRound: 0 }; room.weather.type = String(room.weather.type || ''); room.weather.untilRound = Math.max(0, int(room.weather.untilRound, 0)); room.lastDynamicEventRound = Math.max(0, int(room.lastDynamicEventRound, 0));
    if (!room.boss || typeof room.boss !== 'object') room.boss = { hp: 3500, maxHp: 3500, pos: '', area: [], alive: true, banishing: false, banishStart: 0, banished: false, banishRound: 0, bountyReady: false };
    room.boss.pos = bountyPos(room.boss.pos) ? bountyPos(room.boss.pos).text : ''; room.boss.area = Array.from(new Set((Array.isArray(room.boss.area) ? room.boss.area : []).map((pos) => bountyPos(pos)).filter(Boolean).map((pos) => pos.text))).slice(0, 9); if (room.boss.pos && (room.players || []).some((player) => int(player && player.clues, 0) > 0)) room.boss.area = bountyBossSearchArea(room.boss.pos); room.boss.alive = room.boss.alive !== false; room.boss.banishing = !!room.boss.banishing; room.boss.banished = !!room.boss.banished;
    (room.players || []).forEach((player) => { if (!player.isBot) { player.paid = true; player.guest = false; } player.botTendency = String(player.botTendency || ''); player.maxStamina = 3; player.maxHp = clamp(int(player.maxHp, 150), 0, 150); player.hp = clamp(int(player.hp, player.maxHp), 0, player.maxHp); player.stamina = clamp(int(player.stamina, 3), 0, 3); bountyNormalizeWeapons(player); player.items = Array.isArray(player.items) ? player.items.slice(0, 4) : []; player.itemUses = bountyNormalizeItemUses(player.items, player.itemUses); player.traits = Array.isArray(player.traits) ? player.traits.filter((id) => !!bountyFindTrait(id)) : []; player.fieldTraits = Array.isArray(player.fieldTraits) ? Array.from(new Set(player.fieldTraits.filter((id) => !!bountyFieldTrait(id)))) : []; player.skillPoints = Math.max(5, int(player.skillPoints != null ? player.skillPoints : player.traitPoints, 5)); player.level = bountyHunterLevel(player.skillPoints); player.traitPoints = player.skillPoints; player.knownCells = Array.isArray(player.knownCells) ? player.knownCells : []; player.scoutCells = Array.isArray(player.scoutCells) ? player.scoutCells.filter((pos) => !!bountyPos(pos)).map((pos) => bountyPos(pos).text) : []; player.scoutHighlightRound = Math.max(0, int(player.scoutHighlightRound, 0)); player.lastKnown = player.lastKnown && typeof player.lastKnown === 'object' ? player.lastKnown : {}; player.lastKnownStates = player.lastKnownStates && typeof player.lastKnownStates === 'object' ? player.lastKnownStates : {}; player.knownMonsters = player.knownMonsters && typeof player.knownMonsters === 'object' ? player.knownMonsters : {}; player.lastRoundLogs = (Array.isArray(player.lastRoundLogs) ? player.lastRoundLogs : []).slice(-6).map((line) => String(line || '')); player.roundDamageLogs = []; player.bleedSource = String(player.bleedSource || ''); player.burnSource = String(player.burnSource || ''); player.poisonSource = String(player.poisonSource || ''); player.eventFinds = Math.max(0, int(player.eventFinds, 0)); player.dead = !!player.dead; player.extracted = !!player.extracted; });
    return room;
  }
  function bountyRoomPlayer(id, name, isBot, paid, hunterId, teamId) {
    return { id, name, isBot: !!isBot, paid: !!paid, guest: !isBot && !paid, hunterId: hunterId || '', teamId: teamId || 0, pos: '', hp: 150, maxHp: 150, stamina: 3, maxStamina: 3, downed: false, dead: false, extracted: false, items: [], itemUses: [], weapon: null, weapons: [], activeWeaponIndex: 0, ammoPools: {}, botTendency: '', traits: [], fieldTraits: [], skillPoints: 5, level: 1, traitPoints: 5, bounty: false, bountyTakenRound: 0, bountyVision: 0, clues: 0, bossDamage: 0, kills: 0, downs: 0, actions: [], locked: false, recovered: false, status: '待命', lastAction: '', lastRoundLogs: [], roundDamageLogs: [], lastKnown: {}, lastKnownStates: {}, knownCells: [], scoutCells: [], scoutHighlightRound: 0, knownMonsters: {}, sounds: [], loot: [], eventFinds: 0, bleed: 0, burn: 0, poison: 0, bleedSource: '', burnSource: '', poisonSource: '', staminaInfiniteUntil: 0, aimBonus: 0 };
  }
  function bountyApplyHunterToPlayer(player, hunter) {
    if (!player || !hunter) return player;
    bountyNormalizeWeapons(hunter); player.weapons = hunter.weapons.map((state) => Object.assign({}, state)); player.activeWeaponIndex = hunter.activeWeaponIndex; player.ammoPools = Object.assign({}, hunter.ammoPools); player.weapon = null; player.botTendency = hunter.botTendency || ''; bountyNormalizeWeapons(player); player.items = (Array.isArray(hunter.items) && hunter.items.length ? hunter.items : ['medkit', 'knife']).slice(0, 4); player.itemUses = bountyNormalizeItemUses(player.items, []); player.traits = (hunter.traits || []).slice(); player.fieldTraits = (hunter.fieldTraits || []).slice(); player.skillPoints = Math.max(5, int(hunter.skillPoints, 5)); player.traitPoints = player.skillPoints; player.level = bountyHunterLevel(player.skillPoints); player.hunterName = hunter.name; return player;
  }
  function bountyCreateRoom(id, name, paid, mode) {
    const normalizedMode = ['solo', '单排', 'single'].indexOf(String(mode || '').toLowerCase()) >= 0 ? 'solo' : ['duo', '双排', '组队'].indexOf(String(mode || '').toLowerCase()) >= 0 ? 'duo' : mode || 'pvpve';
    const map = pick(BOUNTY_MAPS); const room = { game: 'bounty', version: 5, status: 'waiting', mode: normalizedMode, ownerId: id, entry: 0, round: 0, maxRounds: BOUNTY_MAX_ROUNDS, mapId: map.id, mapName: map.name, mapCells: map.cells.slice(), landmarks: map.landmarks.slice(), lootAnchors: map.loot.slice(), exits: [], clues: [], publicIntel: [], sounds: [], mapEvents: [], weather: { type: '', untilRound: 0 }, lastDynamicEventRound: 0, monsters: [], boss: { hp: 3500, maxHp: 3500, pos: '', area: [], alive: true, banishing: false, banishStart: 0, banished: false, banishRound: 0, bountyReady: false }, players: [], publicEvents: [], updatedAt: nowMs(), seed: `${nowMs()}-${Math.random()}` };
    const p = loadProfile(id, name); bountyProfileNormalize(p); const selected = p.bounty.hunters.find((hunter) => hunter.id === p.bounty.selected) || p.bounty.hunters[0]; const player = bountyApplyHunterToPlayer(bountyRoomPlayer(id, name, false, true, selected.id, 1), selected); room.players.push(player); return room;
  }
  // Bot 的性格只用于开局配装与战术权重，不写入任何公开卡片或图片。
  // 每次创建房间时只调用一次；进入战局后不会重新抽枪，避免 Bot 在
  // 行动阶段“凭空换装备”。同一性格也保留多个候选，保证每局不会总是
  // 出现同一套枪。
  const BOUNTY_BOT_WEAPON_STYLES = [
    { id: 'close', primary: ['romero', 'colt-78', 'crown'], secondary: ['colt-new-army', 'nagant', 'schofield'], dualChance: 0.25 },
    { id: 'mid', primary: ['win73', 'win92', 'centennial'], secondary: ['pax', 'scottfield', 'colt-saa'], dualChance: 0.12 },
    { id: 'marksman', primary: ['mosin-scope', 'winfield-scope', 'sparks'], secondary: ['uppercut', 'schofield', 'pax'], dualChance: 0.08 },
    { id: 'rifle', primary: ['vetterli', 'berthier', 'lebel'], secondary: ['scottfield', 'nagant', 'cattleman'], dualChance: 0.10 },
    { id: 'budget', primary: ['springfield', 'rolling-carbine', 'martini'], secondary: ['cattleman', 'handcrossbow', 'pax'], dualChance: 0.18 },
    { id: 'rapid', primary: ['winfield-scope', 'win76', 'browning-auto5'], secondary: ['mauser', 'bornheim', 'schofield'], dualChance: 0.20 },
    { id: 'duelist', primary: ['colt-new-army', 'nagant', 'mauser'], secondary: ['romero', 'harrington', 'colt-78'], dualChance: 0.35 },
    { id: 'specialist', primary: ['nitro', 'specter', 'terminus'], secondary: ['pax', 'uppercut', 'cattleman'], dualChance: 0.06 }
  ];
  function bountyBotPick(list, botNo, salt) {
    const pool = (list || []).map((id) => bountyFindWeapon(id)).filter(Boolean); if (!pool.length) return bountyWeapon('colt-saa');
    const offset = Math.floor(Math.random() * pool.length); return pool[(Math.max(0, int(botNo, 0)) * 3 + int(salt, 0) + offset) % pool.length];
  }
  function bountyApplyBotLoadout(hunter, botNo) {
    const index = (Math.max(0, int(botNo, 0)) + Math.floor(Math.random() * BOUNTY_BOT_WEAPON_STYLES.length)) % BOUNTY_BOT_WEAPON_STYLES.length;
    const style = BOUNTY_BOT_WEAPON_STYLES[index]; let primary = bountyBotPick(style.primary, botNo, 1); if (primary.slots > 4) primary = bountyBotPick(style.primary.concat(['sparks', 'vetterli', 'win73']), botNo + 1, 4); const dual = !!primary.handgun && Math.random() < Number(style.dualChance || 0);
    const capacity = 5; const primarySlots = bountyWeaponSlotCost({ id: primary.id, dual });
    const legalSecondary = style.secondary.concat(['colt-saa', 'pax', 'cattleman']).map((id) => bountyFindWeapon(id)).filter((weapon, itemIndex, list) => weapon && list.findIndex((item) => item.id === weapon.id) === itemIndex && weapon.id !== primary.id && primarySlots + weapon.slots <= capacity);
    let secondary = legalSecondary.length ? legalSecondary[(Math.max(0, int(botNo, 0)) * 3 + 2 + Math.floor(Math.random() * legalSecondary.length)) % legalSecondary.length] : bountyWeapon('cattleman');
    // 极少数高占格枪支（例如猎象/硝化步枪）本身已经占满常规携带格，
    // Bot 仍然必须带满两把，因此退回到一把合法的短枪作为副武器。
    if (primarySlots + secondary.slots > capacity) secondary = bountyWeapon('cattleman');
    hunter.botTendency = style.id; hunter.botLoadoutLocked = true; // 内部字段，不由 bountyPublicPlayer 暴露
    hunter.weapon = null; hunter.weapons = [{ id: primary.id, dual }, { id: secondary.id, dual: false }].map((state) => Object.assign({}, state)); hunter.activeWeaponIndex = 0; hunter.ammoPools = {}; bountyResetAmmoPools(hunter); return hunter;
  }
  function bountyEnsureBotDiversity(hunter, botNo, used) {
    if (!hunter || !hunter.isBot && !hunter.bot) return hunter;
    const taken = used || {}; const style = BOUNTY_BOT_WEAPON_STYLES[(Math.max(0, int(botNo, 0)) + 1) % BOUNTY_BOT_WEAPON_STYLES.length];
    bountyNormalizeWeapons(hunter); const primary = hunter.weapons[0]; const secondary = hunter.weapons[1]; const capacity = 5;
    function available(preferred, blocked, extraSlots) {
      const candidates = (preferred || []).map((id) => bountyFindWeapon(id)).concat(BOUNTY_WEAPONS).filter((weapon, index, list) => weapon && list.findIndex((item) => item.id === weapon.id) === index && !blocked[weapon.id] && (!extraSlots || bountyWeaponSlotCost({ id: weapon.id }) + extraSlots <= capacity));
      return candidates.find((weapon) => !taken[weapon.id]) || candidates[0] || bountyWeapon('cattleman');
    }
    const blocked = {}; if (taken[primary.id]) { const replacement = available(style.primary, blocked, secondary.slots); primary.id = replacement.id; primary.dual = !!primary.dual && !!replacement.handgun; }
    taken[primary.id] = true; if (taken[secondary.id] || secondary.id === primary.id || bountyWeaponSlotCost(primary) + secondary.slots > capacity) { const replacement = available(style.secondary, { [primary.id]: true }, bountyWeaponSlotCost(primary)); secondary.id = replacement.id; secondary.dual = false; }
    taken[secondary.id] = true; hunter.botLoadoutLocked = true; hunter.ammoPools = {}; bountyResetAmmoPools(hunter); return hunter;
  }
  function bountyAddBots(room, count) {
    const names = ['姜修泽', '葛明治', '阿日', '严茫熙', '亨德森']; const wanted = clamp(int(count, 1), 1, 5);
    const usedWeapons = {};
    for (let i = 0; i < wanted && room.players.length < BOUNTY_MAX_PLAYERS; i++) {
      const botNo = room.players.filter((player) => player.isBot).length; const name = names[botNo % names.length]; const hunter = bountyEnsureBotDiversity(bountyApplyBotLoadout(bountyNewHunter(`${BOT_PREFIX}bounty:${nowMs()}:${botNo}`, name, true), botNo), botNo, usedWeapons); hunter.weapons.forEach((state) => { usedWeapons[state.id] = true; });
      let team;
      if (room.mode === 'solo') team = botNo + 2;
      else if (room.mode === 'duo') team = 2 + Math.floor(botNo / 2);
      else team = Math.floor(room.players.length / 2) + 1;
      const bot = bountyApplyHunterToPlayer(bountyRoomPlayer(hunter.ownerId, name, true, true, hunter.id, team), hunter); room.players.push(bot);
    }
  }
  function bountyEventCandidateCells(room, map) {
    const candidates = (map.loot || []).concat((map.landmarks || []).reduce((all, landmark) => all.concat(landmark.cells || []), []));
    const blocked = (room.exits || []).concat(room.clues || []).concat(room.boss && room.boss.pos ? [room.boss.pos] : []);
    return Array.from(new Set(candidates.filter((pos) => bountyPos(pos) && blocked.indexOf(pos) < 0)));
  }
  function bountyGenerateMapEvents(room, map) {
    const positions = shuffle(bountyEventCandidateCells(room, map)); const types = ['relic', 'supply', 'medic', 'nest', 'fog', 'bell', pick(['powder', 'herb'])];
    room.mapEvents = types.slice(0, positions.length).map((typeId, index) => { const type = bountyMapEventType(typeId); return { id: `event-${index + 1}`, type: type.id, name: type.name, marker: type.marker, pos: positions[index], state: 'active', claimedById: '', claimedByName: '', spawnedRound: 0 }; });
  }
  function bountySpawnDynamicEvent(room, events) {
    if (!room || room.status !== 'playing' || room.round < 5 || room.round % 5 !== 0 || room.lastDynamicEventRound === room.round) return;
    const map = bountyMapById(room.mapId); const occupied = (room.mapEvents || []).filter((event) => event.state === 'active').map((event) => event.pos).concat(room.clues || []).concat(room.exits || []).concat(room.boss && room.boss.pos ? [room.boss.pos] : []); const positions = bountyEventCandidateCells(room, map).filter((pos) => occupied.indexOf(pos) < 0);
    if (!positions.length) return;
    const type = bountyMapEventType(pick(['supply', 'medic', 'nest', 'fog', 'bell', 'powder', 'herb'])); const event = { id: `event-dynamic-${room.round}`, type: type.id, name: type.name, marker: type.marker, pos: pick(positions), state: 'active', claimedById: '', claimedByName: '', spawnedRound: room.round }; room.mapEvents.push(event); room.lastDynamicEventRound = room.round; events.push('猎场深处出现了新的异动，侦查后可在私人地图中辨认。');
  }
  function bountyAssignMap(room) {
    const map = bountyMapById(room.mapId); const edge = []; for (let y = 0; y < BOUNTY_GRID_SIZE; y++) for (let x = 0; x < BOUNTY_GRID_SIZE; x++) if (x === 0 || y === 0 || x === BOUNTY_GRID_SIZE - 1 || y === BOUNTY_GRID_SIZE - 1) edge.push(`${String.fromCharCode(65 + x)}${y + 1}`);
    const shuffled = shuffle(edge); room.exits = shuffled.slice(0, 3); room.clues = shuffle(map.loot.slice()).slice(0, 3); room.publicIntel = []; const bossCandidates = []; for (let y = 1; y < BOUNTY_GRID_SIZE - 1; y++) for (let x = 1; x < BOUNTY_GRID_SIZE - 1; x++) { const pos = `${String.fromCharCode(65 + x)}${y + 1}`; if (room.clues.indexOf(pos) < 0 && room.exits.indexOf(pos) < 0) bossCandidates.push(pos); } room.boss.pos = pick(bossCandidates);
    bountyGenerateMapEvents(room, map); const eventPositions = room.mapEvents.map((event) => event.pos); const monsterPositions = shuffle(map.loot.concat(edge).filter((pos) => bountyDist(pos, room.boss.pos) > 2 && eventPositions.indexOf(pos) < 0)).slice(0, 5); const monsterTypes = shuffle(BOUNTY_MONSTER_TYPES.map((type) => type.id)); room.monsters = monsterPositions.map((pos, index) => bountyCreateMonster(monsterTypes[index % monsterTypes.length], pos, `monster-${index + 1}`)); room.sounds = []; room.weather = { type: '', untilRound: 0 }; room.lastDynamicEventRound = 0;
    const occupied = {}; room.players.forEach((player, index) => { if (!player.teamId) player.teamId = room.mode === 'solo' ? index + 1 : room.mode === 'duo' ? (player.isBot ? 2 + Math.floor(Math.max(0, index - 2) / 2) : 1) : Math.floor(index / 2) + 1; let pos = shuffled.find((candidate) => !occupied[candidate] && bountyDist(candidate, room.exits[0]) > 1); if (!pos) pos = `${String.fromCharCode(65 + (index % 11) + 1)}${index + 1}`; occupied[pos] = true; player.pos = pos; player.hp = 150; player.maxHp = 150; player.stamina = 3; player.maxStamina = 3; player.downed = false; player.dead = false; player.extracted = false; player.status = '存活'; player.bleed = 0; player.burn = 0; player.poison = 0; player.bleedSource = ''; player.burnSource = ''; player.poisonSource = ''; player.bounty = false; player.bountyVision = 0; bountyNormalizeWeapons(player); player.items = player.items && player.items.length ? player.items.slice(0, 4) : ['medkit', 'knife']; player.itemUses = bountyNormalizeItemUses(player.items, player.itemUses); player.lastKnown = {}; player.lastKnownStates = {}; player.knownCells = []; player.scoutCells = []; player.scoutHighlightRound = 0; player.knownMonsters = {}; player.lastRoundLogs = []; player.roundDamageLogs = []; player.shadowStepRound = 0; player.relentlessRound = 0; player.level = bountyHunterLevel(player.skillPoints); });
  }
  function bountyStart(room) { if (!room || room.status !== 'waiting') return '当前不是等待中的赏金房间。'; if (room.mode === 'duo' && room.players.filter((player) => !player.isBot).length < 2) return '双人PvE需要第二名真人加入后才能开始。'; while (room.players.length < BOUNTY_MAX_PLAYERS) bountyAddBots(room, 1); bountyAssignMap(room); room.status = 'playing'; room.round = 1; room.publicEvents = [`${room.mapName}已载入，赏金对决开始。`, room.mode === 'solo' ? '单排PvE：5名Bot各自独立作战。' : room.mode === 'duo' ? '双人PvE：两名真人组成一队，Bot分为两支队伍。' : '多人猎场：队伍由入场顺序组成。', `已知线索位置：${room.clues.join('、')}；抵达后执行“线索”或“搜索”。`, '前两回合撤离点封锁；地图事件与怪物需要侦查后辨认。']; room.updatedAt = nowMs(); return ''; }
  function bountyPublicPlayer(player, includePrivate) { const row = { name: player.name, teamId: player.teamId, level: bountyHunterLevel(player.skillPoints), skillPoints: Math.max(5, int(player.skillPoints, 5)), fieldTraitCount: (player.fieldTraits || []).length, status: player.extracted ? (player.status || '已撤离') : player.status === '迷失' ? '迷失' : player.dead ? '死亡' : player.downed ? '倒地' : player.bounty ? '携带赏金' : '存活', isBot: !!player.isBot, isGuest: !!player.guest, bounty: !!player.bounty, known: false }; if (includePrivate) { bountyNormalizeWeapons(player); const state = player.weapon; const uses = bountyNormalizeItemUses(player.items, player.itemUses); row.weapon = bountyWeaponDisplayName(state); row.weapons = player.weapons.map((weaponState, index) => `${index === player.activeWeaponIndex ? '▶' : ''}${bountyWeaponDisplayName(weaponState)}`); row.activeWeaponIndex = player.activeWeaponIndex; row.ammo = state ? state.ammo : 0; row.reserve = state ? bountySharedReserve(player, state) : 0; row.items = (player.items || []).map((id, index) => `${bountyItem(id).name}${bountyItemMaxUses(id) > 1 ? `×${uses[index]}` : ''}`).slice(0, 4); row.traits = (player.traits || []).map((id) => bountyFindTrait(id).name).slice(0, 8); row.fieldTraits = (player.fieldTraits || []).map((id) => bountyFieldTrait(id).name).filter(Boolean).slice(0, 4); } return row; }
  function bountyCanSee(viewer, target) { return viewer && target && (viewer.id === target.id || viewer.teamId === target.teamId || viewer.lastKnown[target.id]); }
  function bountyDownPlayer(player) {
    if (!player || player.downed || player.dead || player.hp > 0) return false;
    let loss = 50;
    if ((player.traits || []).indexOf('iron-skin') >= 0 && !player.ironSkinUsed) { player.ironSkinUsed = true; loss = 40; }
    player.maxHp = Math.max(0, int(player.maxHp, 150) - loss); player.hp = 0; player.downed = true; player.status = '倒地'; return true;
  }
  function bountyDamagePlayer(player, amount, sourceKind) {
    if (!player || player.dead || player.extracted || player.downed) return 0;
    const before = Math.max(0, int(player.hp, 0)); let damage = Math.max(0, int(amount, 0)); if (bountyHasFieldTrait(player, 'bulwark') && (sourceKind === 'monster' || sourceKind === 'event' || sourceKind === 'explosion')) damage = Math.max(1, Math.floor(damage * 0.75)); player.hp = Math.max(0, before - damage); bountyDownPlayer(player); return before - player.hp;
  }
  function bountyAppendPlayerLog(player, text) {
    if (!player || !text) return; player.roundDamageLogs = (Array.isArray(player.roundDamageLogs) ? player.roundDamageLogs : []).concat(String(text)).slice(-4);
  }
  function bountyMonsterAttackName(type) {
    const names = { meathead: '沉重砸击', waterdevil: '毒性撕咬', screecher: '撕裂抓击', armored: '甲壳冲撞', hound: '撕咬' }; return names[type && type.id] || '近身袭击';
  }
  function bountySpendStamina(player, cost, room) {
    const needed = Math.max(0, int(cost, 0)); if (!needed || nowMs() <= int(player.staminaInfiniteUntil, 0)) return true;
    if (bountyHasFieldTrait(player, 'relentless') && int(player.relentlessRound, 0) !== int(room && room.round, 0)) { player.relentlessRound = int(room && room.round, 0); return true; }
    if (player.stamina < needed) return false; player.stamina -= needed; return true;
  }
  function bountyMove(player, destination, room, sprint) {
    const target = bountyPos(destination); if (!target || target.x < 0 || target.y < 0 || target.x >= BOUNTY_GRID_SIZE || target.y >= BOUNTY_GRID_SIZE) return '移动坐标无效。';
    const from = bountyPos(player.pos); const distance = from ? Math.abs(from.x - target.x) + Math.abs(from.y - target.y) : 99;
    if (distance < 1 || distance > (sprint ? 2 : 1)) return sprint ? '冲刺每次最多移动两格，且必须沿直线或相邻格。' : '普通移动每次只能移动一格。';
    const terrain = bountyCell(bountyMapById(room.mapId), destination); const mod = BOUNTY_TERRAIN_MODIFIERS[terrain] || BOUNTY_TERRAIN_MODIFIERS.P;
    if (sprint && !bountySpendStamina(player, 1, room)) return '耐力不足，冲刺失败。';
    player.pos = target.text; player.lastAction = `${sprint ? '冲刺' : '移动'}至${target.text}（${mod.name}）`;
    let silent = false; if (bountyHasFieldTrait(player, 'shadow-step') && int(player.shadowStepRound, 0) !== room.round) { player.shadowStepRound = room.round; silent = true; }
    if (!silent && (sprint || !((player.traits || []).indexOf('lightfoot') >= 0 && (terrain === 'F' || terrain === 'H')))) { const intensity = sprint ? 4 : terrain === 'P' || terrain === 'W' ? 2 : 1; bountyAddSound(room, player.pos, intensity, player.id, sprint ? '冲刺' : '脚步'); if (sprint && room.round >= 3) room.publicEvents.push(`${mod.name}附近传来一阵急促脚步。`); }
    return '';
  }
  function bountyReload(player, quick) { const state = bountyActiveWeapon(player); if (!state) return '当前没有武器，无法换弹。'; const weapon = bountyWeapon(state.id); const magazine = bountyWeaponMagazine(state); const ammo = Math.max(0, int(state.ammo, 0)); const reserve = bountySharedReserve(player, state); if (ammo >= magazine || reserve <= 0) return '弹仓已满或没有备弹。'; if (quick && weapon.quickReload) { const loaded = Math.min(magazine, reserve); state.ammo = loaded; player.weapon = state; bountySetSharedReserve(player, state, reserve - loaded); return `迅捷换弹完成，弹仓${loaded}/${magazine}；原弹仓剩余子弹已抛弃。`; } const perReload = Math.max(1, int(weapon.perReload, 1)) * (state.dual ? 2 : 1); const loaded = Math.min(perReload, magazine - ammo, reserve); state.ammo = ammo + loaded; player.weapons[player.activeWeaponIndex] = state; player.weapon = state; bountySetSharedReserve(player, state, reserve - loaded); return `换弹完成，补入${loaded}发，共享备弹剩余${reserve - loaded}发。`; }
  function bountyShoot(room, shooter, targetPos, mode, shots) {
    const state = bountyActiveWeapon(shooter); if (!state) return '当前没有武器，无法开火。'; const weapon = bountyWeapon(state.id); const magazine = bountyWeaponMagazine(state); const available = Math.max(0, int(state.ammo, 0)); if (!available) return '弹仓为空，请先换弹。'; const requested = mode === 'fullauto' ? (shots == null ? magazine : int(shots, magazine)) : state.dual ? 2 : (shots || 1); const count = Math.max(1, Math.min(requested, magazine, available));
    const targetPlayer = room.players.find((player) => !player.dead && player.pos === targetPos && player.teamId !== shooter.teamId);
    const targetMonster = room.monsters.find((monster) => monster.alive && monster.pos === targetPos);
    const targetBoss = room.boss.alive && room.boss.pos === targetPos ? room.boss : null;
    const target = targetPlayer || targetMonster || targetBoss;
    const distance = target && target.pos ? bountyDist(shooter.pos, target.pos) : 99; const terrain = bountyCell(bountyMapById(room.mapId), shooter.pos); const tm = BOUNTY_TERRAIN_MODIFIERS[terrain] || BOUNTY_TERRAIN_MODIFIERS.P; const family = weapon.type === '霰弹' ? 'shotgun' : weapon.type === '长' ? 'long' : weapon.type === '中' ? 'mid' : 'short'; const ammo = bountyAmmo(state.ammoType || weapon.ammoType); const ammoId = ammo.id;
    const outcomes = []; let knockedDown = false;
    for (let i = 0; i < count; i++) {
      state.ammo--; let penalty = mode === 'fullauto' ? 18 + Math.max(0, i - 1) * 4 : mode === 'burst' ? int(weapon.burstPenalty, 10) : mode === 'headshot' ? Math.floor(int(weapon.hip, 50) / 2) : 0; if (state.dual) penalty += 20; if (ammoId === 'fmj' && distance <= 2) penalty -= 8; if (ammoId === 'fmj' && distance > 3) penalty += 8; if (ammoId === 'spitzer') penalty -= distance > 3 ? 12 : 6; if (ammoId === 'slug' && !shooter.aiming) penalty += 14; if (ammoId === 'incendiary' || ammoId === 'dum-dum' || ammoId === 'poison') penalty += terrain === 'F' || terrain === 'H' ? 8 : 0; const baseRate = shooter.aiming ? int(weapon.aim, weapon.hip) : int(weapon.hip, 50); const terrainRate = Math.round(baseRate * (tm[family] || 1)); const rangePenalty = distance > weapon.range ? Math.max(0, distance - weapon.range) * 9 : 0; const hitRate = clamp(terrainRate - penalty - rangePenalty, 8, 95); const roll = 1 + Math.floor(Math.random() * 100); const hit = roll <= hitRate; const head = hit && weapon.type !== '霰弹' && (mode === 'headshot' ? roll <= Math.max(1, Math.floor(hitRate / 2)) : roll <= Math.max(1, Math.floor(hitRate / 10))); let damage = hit ? int(weapon.damage, 0) : 0; if (ammoId === 'spitzer') damage = Math.max(1, Math.floor(damage * 0.9)); if (ammoId === 'coin') damage = distance <= 1 ? damage + 60 : Math.max(1, Math.floor(damage * 0.4)); if (ammoId === 'slug') damage = distance <= 3 ? damage + 35 : Math.max(1, Math.floor(damage * 0.55)); if (ammoId === 'arrow') damage = distance <= 1 ? Math.floor(damage * 0.72) : Math.floor(damage * 1.12);
      if (weapon.falloff && distance < weapon.falloff.length) damage = weapon.falloff[distance]; if (head) damage = 999; if (target && hit) {
        if (targetPlayer) {
          const wasDown = target.downed; const effects = []; damage = bountyDamagePlayer(target, damage, 'hunter');
          if (ammoId === 'dum-dum' && !bountyHasFieldTrait(target, 'bloodless')) { if (int(target.bleed, 0) <= 12) target.bleedSource = '未知玩家'; target.bleed = Math.max(target.bleed || 0, 12); effects.push('流血'); }
          if (ammoId === 'incendiary') { if (int(target.burn, 0) <= 10) target.burnSource = '未知玩家'; target.burn = Math.max(target.burn || 0, 10); effects.push('燃烧'); }
          if (ammoId === 'poison') { if (int(target.poison, 0) <= 3) target.poisonSource = '未知玩家'; target.poison = Math.max(target.poison || 0, 3); effects.push('中毒'); }
          bountyAppendPlayerLog(target, `受到枪击伤害：未知玩家造成${damage}伤害${effects.length ? `，并附加${effects.join('、')}` : ''}${target.downed ? '，你已倒地' : ''}。`);
          if (!wasDown && target.downed) { shooter.downs = (shooter.downs || 0) + 1; knockedDown = true; }
        }
        else { let dealt = int(weapon.bossDamage || damage, 0); if (bountyHasFieldTrait(shooter, 'executioner')) dealt = Math.floor(dealt * 1.5); if (targetMonster && targetMonster.armor > 0 && !head) dealt = Math.max(1, Math.floor(dealt * (1 - targetMonster.armor))); target.hp = Math.max(0, target.hp - dealt); damage = dealt; if (target.hp <= 0) { target.alive = false; if (targetBoss) room.boss.alive = false; if (targetMonster) shooter.kills = (shooter.kills || 0) + 1; } if (targetBoss) shooter.bossDamage = (shooter.bossDamage || 0) + dealt; }
      }
      outcomes.push({ hit, head, roll, damage });
    }
    if (!weapon.silent) bountyAddSound(room, shooter.pos, mode === 'fullauto' ? 8 : count > 1 ? 7 : 6, shooter.id, '枪声');
    shooter.lastAction = `使用${bountyWeaponDisplayName(state)}向${targetPos}${mode === 'fullauto' ? `扫射${count}发` : count > 1 ? `开火${count}次` : '开火'}：${outcomes.filter((result) => result.hit).length}/${count}命中${knockedDown ? '，并击倒目标猎人' : ''}`;
    return { text: `${shooter.name}${shooter.lastAction}。`, outcomes, knockedDown };
  }
  function bountyParseAction(raw) {
    const text = String(raw || '').trim(); if (!text) return { type: 'wait' };
    const switchCompact = text.match(/^(切换|换枪|切枪)([12])$/); if (switchCompact) return { type: 'switch', slot: int(switchCompact[2], 0) };
    const coord = /^[A-Ma-m](?:1[0-3]|[1-9])$/;
    const compact = text.match(/^(移动|走|冲刺|冲|开火x2|开火×2|双发|开火|射击|扫射|全弹匣|爆头|轻击|重击|透视)([A-Ma-m](?:1[0-3]|[1-9]))(?:[×x*]?(\d+))?$/i);
    if (compact) return bountyParseAction(`${compact[1]} ${compact[2]}${compact[3] ? ` ${compact[3]}` : ''}`);
    const parts = text.split(/\s+/); const op = parts[0].toLowerCase();
    const coordIndex = parts.findIndex((part) => coord.test(part || ''));
    const lootPos = coordIndex >= 0 ? parts[coordIndex] : '';
    const lootNumbers = parts.slice(coordIndex >= 0 ? coordIndex + 1 : 1).filter((part) => /^[12]$/.test(part)).map((part) => int(part, 1));
    if (['换装', '搜身', '搜刮装备', '拾取武器', '拿枪', '掠夺武器'].indexOf(op) >= 0 || (op === '换枪' && coordIndex >= 0)) return { type: 'lootWeapon', pos: lootPos, sourceSlot: lootNumbers[0] || 1, destSlot: lootNumbers[1] || 0 };
    if (['待机', '等待', 'wait'].indexOf(op) >= 0) return { type: 'wait' };
    if (['移动', '走', 'move'].indexOf(op) >= 0) return { type: 'move', pos: parts[1] };
    if (['冲刺', '冲', 'sprint'].indexOf(op) >= 0) return { type: 'sprint', pos: parts[1] };
    if (['侦查', 'scout'].indexOf(op) >= 0) return { type: 'scout' };
    if (['搜索', '调查', '搜寻', '搜索事件', '调查事件', 'investigate'].indexOf(op) >= 0) return { type: 'investigate' };
    if (['瞄准', 'aim'].indexOf(op) >= 0) return { type: 'aim' };
    if (['开火x2', '开火×2', '双发'].indexOf(op) >= 0) return { type: 'fire', pos: parts[1], shots: 2, mode: 'burst' };
    if (['扫射', '全弹匣', 'fullauto'].indexOf(op) >= 0) {
      const embedded = String(parts[1] || '').match(/^([A-Ma-m](?:1[0-3]|[1-9]))[×x*](\d+)$/i);
      const first = embedded ? embedded[1] : coord.test(parts[1] || '') ? parts[1] : (coord.test(parts[2] || '') ? parts[2] : '');
      const number = parts.find((part) => /^\d+$/.test(part));
      return { type: 'fire', pos: first, shots: embedded ? Math.max(1, int(embedded[2], 1)) : number ? Math.max(1, int(number, 1)) : undefined, mode: 'fullauto' };
    }
    if (['爆头', 'headshot'].indexOf(op) >= 0) return { type: 'fire', pos: parts[1], shots: 1, mode: 'headshot' };
    if (['开火', '射击', 'fire'].indexOf(op) >= 0) return { type: 'fire', pos: parts[1], shots: 1, mode: 'single' };
    if (['近战轻击', '轻击', 'melee'].indexOf(op) >= 0) return { type: 'melee', pos: parts[1], heavy: false };
    if (['近战重击', '重击', 'heavy'].indexOf(op) >= 0) return { type: 'melee', pos: parts[1], heavy: true };
    if (['换弹', '装填', 'reload'].indexOf(op) >= 0) return { type: 'reload' };
    if (['迅捷换弹', '快换', 'quickreload'].indexOf(op) >= 0) return { type: 'quickReload' };
    if (['切换', '换枪', '切枪', 'switch'].indexOf(op) >= 0) return { type: 'switch', slot: parts[1] ? int(parts[1], 0) : 0 };
    if (['使用', '道具', 'use'].indexOf(op) >= 0) return { type: 'use', item: parts.slice(1).join(' ') };
    if (['急救', '治疗', 'heal'].indexOf(op) >= 0) return { type: 'heal' };
    if (['止血', '止燃', '阻燃', 'stop'].indexOf(op) >= 0) return { type: 'stop' };
    if (['线索', '寻找线索', 'clue'].indexOf(op) >= 0) return { type: 'clue' };
    if (['拉人', '复活', 'revive'].indexOf(op) >= 0) return { type: 'revive' };
    if (['放逐', 'banish'].indexOf(op) >= 0) return { type: 'banish' };
    if (['拾取赏金', '拾取', 'lootbounty'].indexOf(op) >= 0) return { type: 'takeBounty' };
    if (['劫掠', '抢赏金', 'rob'].indexOf(op) >= 0) return { type: 'rob' };
    if (['透视', '赏金透视', 'vision'].indexOf(op) >= 0) return { type: 'vision', pos: parts[1] };
    if (['撤离', '逃离', 'extract'].indexOf(op) >= 0) return { type: 'extract' };
    return { type: 'invalid', raw: text };
  }
  function bountyParseActionSubmission(player, value) {
    const raw = String(value || '').split(/[|+；;，,]+/).map((part) => part.trim()).filter(Boolean);
    if (raw.length > 2) return { actions: [], error: '每回合最多只能提交两个行动。' };
    if (raw.length === 1) {
      const action = bountyParseAction(raw[0]); const target = action.type === 'move' || action.type === 'sprint' ? bountyPos(action.pos) : null; const distance = target ? bountyDist(player.pos, target.text) : 0;
      if (action.type === 'move' && distance === 2) return { actions: [{ type: 'move', pos: bountyStepToward(player.pos, target.text, 1) }, { type: 'move', pos: target.text }], autoMove: true };
      if (action.type === 'sprint' && distance >= 3 && distance <= 4) return { actions: [{ type: 'sprint', pos: bountyStepToward(player.pos, target.text, 2) }, { type: 'sprint', pos: target.text }], autoSprint: true };
      return { actions: [action, { type: 'wait' }], autoMove: false, autoSprint: false, autoWait: true };
    }
    if (raw.length < 2) return { actions: [], error: '请至少提交一个行动。' };
    return { actions: [bountyParseAction(raw[0]), bountyParseAction(raw[1])], autoMove: false, autoSprint: false };
  }
  function bountyIsDirectActionSubmission(value) { const first = String(value || '').split(/[|+；;，,]+/).map((part) => part.trim()).filter(Boolean)[0]; return !!first && bountyParseAction(first).type !== 'invalid'; }
  function bountyValidateActionSubmission(room, player, actions) {
    const weaponOwner = { weapon: player.weapon ? Object.assign({}, player.weapon) : null, weapons: (player.weapons || []).map((state) => Object.assign({}, state)), activeWeaponIndex: int(player.activeWeaponIndex, 0), ammoPools: Object.assign({}, player.ammoPools || {}), weaponless: !!player.weaponless }; bountyNormalizeWeapons(weaponOwner);
    const state = {
      pos: player.pos, stamina: int(player.stamina, 0), weaponOwner,
      items: (player.items || []).slice(), itemUses: bountyNormalizeItemUses(player.items, player.itemUses), poison: int(player.poison, 0), bounty: !!player.bounty, bountyVision: int(player.bountyVision, 0), downed: !!player.downed,
      relentlessUsed: int(player.relentlessRound, 0) === int(room.round, 0)
    };
    const targetStates = {}; const lootInventories = {};
    room.players.forEach((target) => { targetStates[`player:${target.id}`] = { hp: int(target.hp, 0), active: !target.dead && !target.extracted && !target.downed }; });
    room.monsters.forEach((target) => { targetStates[`monster:${target.id}`] = { hp: int(target.hp, 0), active: !!target.alive }; });
    function spendStamina(cost) {
      const needed = Math.max(0, int(cost, 0)); if (!needed || nowMs() <= int(player.staminaInfiniteUntil, 0)) return true;
      if (bountyHasFieldTrait(player, 'relentless') && !state.relentlessUsed) { state.relentlessUsed = true; return true; }
      if (state.stamina < needed) return false; state.stamina -= needed; return true;
    }
    function itemIndex(requested) { return state.items.findIndex((item) => item === requested || bountyItem(item).name === requested); }
    function meleeTarget(action) {
      const requested = action.pos ? bountyPos(action.pos) : null;
      if (action.pos && !requested) return { error: '近战目标坐标无效。' };
      if (requested && bountyDist(state.pos, requested.text) > 1) return { error: '近战只能攻击同格或相邻一格的目标。' };
      const players = room.players.filter((target) => target.id !== player.id && target.teamId !== player.teamId && targetStates[`player:${target.id}`].active && bountyDist(state.pos, target.pos) <= 1 && (!requested || target.pos === requested.text)).map((target) => ({ kind: 'player', target }));
      const monsters = room.monsters.filter((target) => targetStates[`monster:${target.id}`].active && bountyDist(state.pos, target.pos) <= 1 && (!requested || target.pos === requested.text)).map((target) => ({ kind: 'monster', target }));
      const nearby = players.concat(monsters);
      if (!requested && nearby.length > 1) { const positions = Array.from(new Set(nearby.map((item) => item.target.pos))).join('、'); return { error: `附近有多个目标（${positions}），请使用“${action.heavy ? '重击' : '轻击'} ${nearby[0].target.pos}”指定坐标。` }; }
      if (!nearby.length) return { error: '同格或相邻一格内没有可近战的目标。' };
      return nearby[0];
    }
    for (let index = 0; index < actions.length; index++) {
      const action = actions[index] || { type: 'invalid', raw: '' }; const label = `第${index + 1}个行动`;
      if (action.type === 'invalid') return `${label}无法识别“${String(action.raw || '').slice(0, 24)}”。`;
      if (state.downed && ['revive', 'stop', 'wait', 'use'].indexOf(action.type) < 0) return `${label}无效：倒地状态不能执行该动作。`;
      if (['wait', 'scout', 'investigate', 'aim', 'stop'].indexOf(action.type) >= 0) continue;
      if (action.type === 'move' || action.type === 'sprint') {
        const target = bountyPos(action.pos); if (!target) return `${label}的移动坐标无效。`;
        const distance = bountyDist(state.pos, target.text); const maxDistance = action.type === 'sprint' ? 2 : 1;
        if (distance < 1 || distance > maxDistance) return `${label}无效：${action.type === 'sprint' ? '冲刺最多移动两格' : '普通移动只能移动一格'}。`;
        if (action.type === 'sprint' && !spendStamina(1)) return `${label}无效：耐力不足，无法冲刺。`;
        state.pos = target.text; continue;
      }
      if (action.type === 'switch') { const switched = bountySwitchWeapon(state.weaponOwner, action.slot); if (switched) return `${label}无效：${switched}`; continue; }
      if (action.type === 'lootWeapon') {
        const targetPos = action.pos ? bountyPos(action.pos) : bountyPos(state.pos); if (!targetPos || bountyDist(state.pos, targetPos.text) > 1) return `${label}无效：换装目标必须在同格或相邻一格。`;
        const target = room.players.find((other) => other.id !== player.id && other.pos === targetPos.text && other.downed && !other.dead && !other.extracted && other.teamId !== player.teamId); if (!target) return `${label}无效：附近没有可搜身的倒地猎人。`;
        bountyNormalizeWeapons(target); if (!lootInventories[target.id]) { lootInventories[target.id] = { weapons: target.weapons.map((item) => Object.assign({}, item)), activeWeaponIndex: target.activeWeaponIndex, ammoPools: Object.assign({}, target.ammoPools || {}), weapon: null, weaponless: !!target.weaponless }; bountyNormalizeWeapons(lootInventories[target.id]); }
        const inventory = lootInventories[target.id]; const sourceIndex = clamp(int(action.sourceSlot, 1), 1, inventory.weapons.length) - 1; const source = inventory.weapons[sourceIndex]; if (!source) return `${label}无效：倒地猎人的武器栏位不存在。`;
        const destination = action.destSlot && int(action.destSlot, 0) >= 1 ? int(action.destSlot, 0) - 1 : state.weaponOwner.weapons.length < 2 ? state.weaponOwner.weapons.length : state.weaponOwner.activeWeaponIndex; if (destination < 0 || destination >= 2) return `${label}无效：你最多只能携带两把武器，请先卸下武器。`;
        const nextWeapons = state.weaponOwner.weapons.map((item) => Object.assign({}, item)); if (destination === nextWeapons.length) nextWeapons.push(Object.assign({}, source)); else nextWeapons[destination] = Object.assign({}, source);
        const preview = { weapons: nextWeapons, activeWeaponIndex: state.weaponOwner.activeWeaponIndex, ammoPools: Object.assign({}, state.weaponOwner.ammoPools || {}), weapon: null }; const sourceKey = bountyWeaponAmmoKey(source); const sourceReserve = bountySharedReserve(inventory, source); preview.ammoPools[sourceKey] = Math.max(0, int(preview.ammoPools[sourceKey], 0)) + sourceReserve; bountyNormalizeWeapons(preview); if (bountyLoadoutSlots(preview) > ((player.traits || []).indexOf('quartermaster') >= 0 ? 6 : 5)) return `${label}无效：换上${bountyWeaponDisplayName(source)}后超过你的携带格数。`;
        state.weaponOwner.weapons = preview.weapons; state.weaponOwner.activeWeaponIndex = preview.activeWeaponIndex; state.weaponOwner.ammoPools = preview.ammoPools; state.weaponOwner.weapon = state.weaponOwner.weapons[state.weaponOwner.activeWeaponIndex] || null; bountyNormalizeWeapons(state.weaponOwner);
        inventory.weapons.splice(sourceIndex, 1); inventory.ammoPools[sourceKey] = Math.max(0, int(inventory.ammoPools[sourceKey], 0) - sourceReserve); inventory.weapon = null; inventory.weaponless = inventory.weapons.length === 0; bountyNormalizeWeapons(inventory); continue;
      }
      if (action.type === 'reload' || action.type === 'quickReload') {
        const weaponState = bountyActiveWeapon(state.weaponOwner); if (!weaponState) return `${label}无效：当前没有武器，无法换弹。`; const weapon = bountyWeapon(weaponState.id); const magazine = bountyWeaponMagazine(weaponState); const reserve = bountySharedReserve(state.weaponOwner, weaponState); if (weaponState.ammo >= magazine || reserve <= 0) return `${label}无效：弹仓已满或没有备弹。`;
        if (action.type === 'quickReload' && weapon.quickReload) { const loaded = Math.min(magazine, reserve); weaponState.ammo = loaded; bountySetSharedReserve(state.weaponOwner, weaponState, reserve - loaded); }
        else { const loaded = Math.min(Math.max(1, int(weapon.perReload, 1)) * (weaponState.dual ? 2 : 1), magazine - weaponState.ammo, reserve); weaponState.ammo += loaded; bountySetSharedReserve(state.weaponOwner, weaponState, reserve - loaded); }
        continue;
      }
      if (action.type === 'fire') {
        const target = bountyPos(action.pos); if (!target) return `${label}的射击坐标无效。`;
        const weaponState = bountyActiveWeapon(state.weaponOwner); if (!weaponState) return `${label}无效：当前没有武器，无法开火。`; const weapon = bountyWeapon(weaponState.id); const magazine = bountyWeaponMagazine(weaponState); if (action.mode === 'fullauto' && !weapon.fullAuto) return `${label}无效：${weapon.name}不能扫射。`;
        if (weaponState.ammo <= 0) return `${label}无效：弹仓为空，请先换弹。`;
        const requested = action.mode === 'fullauto' ? (action.shots == null ? magazine : int(action.shots, magazine)) : weaponState.dual ? 2 : (action.shots || 1); weaponState.ammo -= Math.max(1, Math.min(requested, magazine, weaponState.ammo)); continue;
      }
      if (action.type === 'melee') {
        const found = meleeTarget(action); if (found.error) return `${label}无效：${found.error}`;
        const cost = action.heavy ? 3 : 1; if (!spendStamina(cost)) return `${label}无效：耐力不足，近战失败。`;
        const key = `${found.kind}:${found.target.id}`; let damage = action.heavy ? 140 : 55; if (found.kind === 'monster' && bountyHasFieldTrait(player, 'executioner')) damage = Math.floor(damage * 1.5); targetStates[key].hp = Math.max(0, targetStates[key].hp - damage); if (targetStates[key].hp <= 0) targetStates[key].active = false; continue;
      }
      if (action.type === 'use' || action.type === 'heal') {
        const requested = action.type === 'heal' ? 'medkit' : String(action.item || '').trim(); const foundIndex = itemIndex(requested); if (foundIndex < 0) return `${label}无效：没有可用的该道具。`;
        const item = bountyItem(state.items[foundIndex]); if (['medkit', 'vitamin', 'strong-vitamin', 'regen-shot'].indexOf(item.id) >= 0 && state.poison > 0) return `${label}无效：中毒状态下无法使用治疗物品。`;
        if (['medkit', 'vitamin', 'strong-vitamin', 'regen-shot', 'stamina', 'strong-stamina'].indexOf(item.id) < 0) return `${label}无效：该道具需要指定目标或尚未接入战斗效果。`;
        const remaining = Math.max(0, int(state.itemUses[foundIndex], bountyItemMaxUses(item.id)) - 1); if (remaining > 0) state.itemUses[foundIndex] = remaining; else { state.items.splice(foundIndex, 1); state.itemUses.splice(foundIndex, 1); } continue;
      }
      if (action.type === 'clue') { if (room.clues.indexOf(state.pos) < 0) return `${label}无效：当前位置没有线索。`; continue; }
      if (action.type === 'banish') { if (room.boss.alive || bountyDist(state.pos, room.boss.pos) > 0) return `${label}无效：必须先在Boss所在格击杀Boss。`; continue; }
      if (action.type === 'takeBounty') { if (!room.boss.banishing || room.round - room.boss.banishStart < 2 || bountyDist(state.pos, room.boss.pos) > 0) return `${label}无效：放逐尚未完成或你不在Boss位置。`; continue; }
      if (action.type === 'rob') { const target = room.players.find((other) => other.id !== player.id && other.pos === state.pos && other.bounty && other.teamId !== player.teamId && other.downed); if (!target) return `${label}无效：当前位置没有可劫掠的倒地赏金猎人。`; continue; }
      if (action.type === 'vision') { if (!state.bounty || state.bountyVision <= 0) return `${label}无效：没有可用的赏金透视。`; if (action.pos && !bountyPos(action.pos)) return `${label}的透视坐标无效。`; state.bountyVision--; continue; }
      if (action.type === 'extract') { if (room.round < 3 || room.exits.indexOf(state.pos) < 0) return `${label}无效：撤离点尚未开放或你不在撤离点。`; continue; }
      if (action.type === 'revive') { const remote = (player.traits || []).indexOf('necromancer') >= 0; const ally = room.players.find((other) => other.id !== player.id && other.teamId === player.teamId && other.downed && other.maxHp > 0 && bountyDist(state.pos, other.pos) <= (remote ? 4 : 1)); if (!ally) return `${label}无效：没有可拉起的队友。`; continue; }
      return `${label}无法识别。`;
    }
    return '';
  }
  function bountyRevealNearbyEvents(room, player, radius) {
    const found = (room.mapEvents || []).filter((event) => event.state === 'active' && bountyDist(player.pos, event.pos) <= radius); if (!found.length) return [];
    player.knownCells = Array.from(new Set((player.knownCells || []).concat(found.map((event) => event.pos)))); return found;
  }
  function bountyResolveMapEvent(room, player) {
    const event = (room.mapEvents || []).find((item) => item.state === 'active' && item.pos === player.pos); if (!event) return `${player.name}调查了当前位置，没有发现可触发的地图事件。`;
    const type = bountyMapEventType(event.type); event.state = 'claimed'; event.claimedById = player.id; event.claimedByName = player.name; player.eventFinds = (player.eventFinds || 0) + 1; let detail = '';
    if (type.id === 'relic') { const learned = bountyGrantSkillProgress(player, true); detail = `技能点提升至${player.skillPoints}，猎人升至Lv${player.level}${learned ? `并习得地图特质“${learned.name}”` : '；全部地图特质已收集'}`; }
    else if (type.id === 'supply') { const state = bountyActiveWeapon(player); if (!state) { if (player.items.length < 4) { bountyAddPlayerItem(player, pick(['decoy', 'smoke', 'vitamin'])); detail = '没有可补充的武器，改为取得一件战术道具'; } else detail = '当前没有武器且道具栏已满，补给无法携带'; } else { const weapon = bountyWeapon(state.id); const multiplier = bountyHasFieldTrait(player, 'frontiersman') ? 0.75 : 0.5; const amount = Math.max(2, Math.ceil(weapon.reserve * multiplier)); const reserve = bountySharedReserve(player, state); const capacity = player.weapons.filter((item) => bountyWeaponAmmoKey(item) === bountyWeaponAmmoKey(state)).reduce((sum, item) => sum + bountyWeapon(item.id).reserve * (item.dual ? 2 : 1), 0) * 2; bountySetSharedReserve(player, state, Math.min(capacity, reserve + amount)); if (player.items.length < 4 && Math.random() < (bountyHasFieldTrait(player, 'frontiersman') ? 0.8 : 0.45)) bountyAddPlayerItem(player, pick(['decoy', 'smoke', 'vitamin'])); detail = `补充${Math.min(amount, Math.max(0, capacity - reserve))}发共享备弹${player.items.length < 4 ? '' : '，道具栏已满'}`; } }
    else if (type.id === 'medic') { const amount = 65 + ((player.traits || []).indexOf('doctor') >= 0 ? 20 : 0); player.hp = Math.min(player.maxHp, player.hp + amount); player.bleed = 0; player.burn = 0; player.poison = 0; player.bleedSource = ''; player.burnSource = ''; player.poisonSource = ''; detail = `恢复${amount}HP并清除异常状态`; }
    else if (type.id === 'nest') { const spawnCells = shuffle(bountyAdjacentCells(player.pos, 1).concat([player.pos])).slice(0, 2); spawnCells.forEach((pos, index) => room.monsters.push(bountyCreateMonster(pick(['hound', 'armored', 'screecher']), pos, `monster-nest-${room.round}-${room.monsters.length + index + 1}`))); bountyAddSound(room, player.pos, 7, player.id, '巢穴崩裂'); detail = `惊醒${spawnCells.length}只怪物`; }
    else if (type.id === 'fog') { room.weather = { type: 'fog', untilRound: room.round + 3 }; detail = '浓雾将持续3回合，普通侦查范围缩小2格'; }
    else if (type.id === 'bell') { bountyAddSound(room, player.pos, 8, player.id, '警铃'); room.monsters.forEach((monster) => { if (monster.alive && bountyDist(monster.pos, player.pos) <= 8) { monster.targetId = player.id; monster.alertedUntil = room.round + 3; } }); detail = '警铃响彻猎场，附近怪物已经转向'; }
    else if (type.id === 'powder') { if (player.items.length < 4) { bountyAddPlayerItem(player, 'dynamite'); detail = '取得1枚炸药棒'; } else { const state = bountyActiveWeapon(player); if (!state) detail = '当前没有武器且道具栏已满，火药无法携带'; else { const weapon = bountyWeapon(state.id); const amount = Math.max(2, Math.ceil(weapon.reserve * 0.4)); bountySetSharedReserve(player, state, bountySharedReserve(player, state) + amount); detail = `道具栏已满，改为补充${amount}发共享备弹`; } } }
    else if (type.id === 'herb') { player.poison = 0; player.poisonSource = ''; player.regen = Math.max(int(player.regen, 0), 5); detail = '清除中毒并获得5回合持续治疗'; }
    if (bountyHasFieldTrait(player, 'frontiersman')) { const extra = bountyRevealNearbyEvents(room, player, 1); if (extra.length) detail += `；额外辨认${extra.length}处相邻异动`; }
    return `${player.name}调查${type.name}：${detail}。`;
  }
  function bountyResolveAction(room, player, action) {
    if (!player || player.dead || player.extracted) return ''; const map = bountyMapById(room.mapId);
    if (player.downed && ['revive', 'stop', 'wait', 'use'].indexOf(action.type) < 0) return `${player.name}处于倒地状态，不能执行${action.type}。`;
    if (action.type === 'wait') return '';
    if (action.type === 'move') return bountyMove(player, action.pos, room, false);
    if (action.type === 'sprint') return bountyMove(player, action.pos, room, true);
    if (action.type === 'scout') { const weaponState = bountyActiveWeapon(player); const weapon = weaponState ? bountyWeapon(weaponState.id) : { scope: 0, range: 1 }; const fogPenalty = room.weather && room.weather.type === 'fog' && room.weather.untilRound >= room.round ? 2 : 0; const radius = Math.max(1, (weapon.scope || weapon.range || 1) + (bountyHasFieldTrait(player, 'dark-sight') ? 2 : 0) - fogPenalty); const cells = []; const pos = bountyPos(player.pos); for (let y = Math.max(0, pos.y - radius); y <= Math.min(BOUNTY_GRID_SIZE - 1, pos.y + radius); y++) for (let x = Math.max(0, pos.x - radius); x <= Math.min(BOUNTY_GRID_SIZE - 1, pos.x + radius); x++) cells.push(`${String.fromCharCode(65 + x)}${y + 1}`); if (int(player.scoutHighlightRound, 0) !== room.round) player.scoutCells = []; player.scoutCells = Array.from(new Set((player.scoutCells || []).concat(cells))); player.scoutHighlightRound = room.round; player.knownCells = Array.from(new Set((player.knownCells || []).concat(cells))); player.lastAction = `在${bountyTerrainName(bountyCell(map, player.pos))}${weaponState ? '' : '徒手'}侦查${radius}格范围`; Object.keys(player.lastKnown || {}).forEach((targetId) => { const oldPos = player.lastKnown[targetId]; const target = room.players.find((other) => other.id === targetId); if (cells.indexOf(oldPos) >= 0 && (!target || target.dead || target.extracted || target.pos !== oldPos)) { delete player.lastKnown[targetId]; delete player.lastKnownStates[targetId]; } }); const visible = room.players.filter((other) => other.id !== player.id && !other.dead && !other.extracted && cells.indexOf(other.pos) >= 0); visible.forEach((other) => { player.lastKnown[other.id] = other.pos; player.lastKnownStates[other.id] = other.downed ? 'downed' : 'standing'; }); const monsters = room.monsters.filter((monster) => monster.alive && cells.indexOf(monster.pos) >= 0); monsters.forEach((monster) => { player.knownMonsters[monster.id] = monster.pos; }); const foundEvents = bountyRevealNearbyEvents(room, player, radius); return visible.length || monsters.length || foundEvents.length ? `${player.name}侦查到${visible.length}名猎人、${monsters.length}只怪物与${foundEvents.length}处地图异动。` : `${player.name}完成侦查，没有发现明确目标。`; }
    if (action.type === 'investigate') { if (room.clues.indexOf(player.pos) >= 0 && !player.clues) return bountyResolveAction(room, player, { type: 'clue' }); return bountyResolveMapEvent(room, player); }
    if (action.type === 'aim') { player.aiming = true; player.aimBonus = 1; return `${player.name}进入瞄准状态。`; }
    if (action.type === 'switch') { const error = bountySwitchWeapon(player, action.slot); if (error) return error; player.aiming = false; player.aimBonus = 0; player.lastAction = `切换至${bountyWeaponDisplayName(player.weapon)}`; return `${player.name}${player.lastAction}。`; }
    if (action.type === 'reload') return bountyReload(player, false);
    if (action.type === 'quickReload') return bountyReload(player, true);
    if (action.type === 'fire') { const state = bountyActiveWeapon(player); if (!state) return `${player.name}当前没有武器，无法开火。`; const weapon = bountyWeapon(state.id); if (action.mode === 'burst' && !weapon.burst && !state.dual) action.mode = 'single'; if (action.mode === 'fullauto' && !weapon.fullAuto) return `${player.name}的${weapon.name}不是全自动武器，不能使用扫射。`; const result = bountyShoot(room, player, action.pos, action.mode, action.shots); player.aiming = false; player.aimBonus = 0; return result.text || result; }
    if (action.type === 'melee') {
      const requested = action.pos ? bountyPos(action.pos) : null; let targetPlayer = null; let targetMonster = null;
      if (action.pos && !requested) return '近战目标坐标无效。';
      if (requested && bountyDist(player.pos, requested.text) > 1) return '近战只能攻击同格或相邻一格的目标。';
      if (requested) {
        targetPlayer = room.players.find((other) => other.id !== player.id && other.pos === requested.text && !other.dead && !other.extracted && !other.downed && other.teamId !== player.teamId);
        targetMonster = room.monsters.find((monster) => monster.alive && monster.pos === requested.text);
      } else {
        const nearbyPlayers = room.players.filter((other) => other.id !== player.id && !other.dead && !other.extracted && !other.downed && other.teamId !== player.teamId && bountyDist(player.pos, other.pos) <= 1);
        const nearbyMonsters = room.monsters.filter((monster) => monster.alive && bountyDist(player.pos, monster.pos) <= 1);
        const nearby = nearbyPlayers.map((target) => ({ kind: 'player', target })).concat(nearbyMonsters.map((target) => ({ kind: 'monster', target })));
        if (nearby.length > 1) { const positions = Array.from(new Set(nearby.map((item) => item.target.pos))).join('、'); return `附近有多个目标（${positions}），请使用“${action.heavy ? '重击' : '轻击'} ${nearby[0].target.pos}”指定坐标。`; }
        if (nearby.length === 1) { if (nearby[0].kind === 'player') targetPlayer = nearby[0].target; else targetMonster = nearby[0].target; }
      }
      const target = targetPlayer || targetMonster; if (!target) return '同格或相邻一格内没有可近战的目标。';
      const cost = action.heavy ? 3 : 1; if (!bountySpendStamina(player, cost, room)) return '耐力不足，近战失败。'; let damage = action.heavy ? 140 : 55;
      if (targetMonster && bountyHasFieldTrait(player, 'executioner')) damage = Math.floor(damage * 1.5);
      let knockedDown = false; if (targetPlayer) { const wasDown = targetPlayer.downed; damage = bountyDamagePlayer(targetPlayer, damage, 'hunter'); bountyAppendPlayerLog(targetPlayer, `受到近战${action.heavy ? '重击' : '轻击'}伤害：未知玩家造成${damage}伤害${targetPlayer.downed ? '，你已倒地' : ''}。`); if (!wasDown && targetPlayer.downed) { player.downs = (player.downs || 0) + 1; knockedDown = true; } }
      else { targetMonster.hp = Math.max(0, targetMonster.hp - damage); if (targetMonster.hp <= 0) { targetMonster.alive = false; player.kills = (player.kills || 0) + 1; } }
      if (action.heavy) bountyAddSound(room, player.pos, 2, player.id, '重击'); player.lastAction = `${player.name}近战${action.heavy ? '重击' : '轻击'}${target.name || '目标'}`; return `${player.lastAction}，造成${damage}伤害${knockedDown ? '，并击倒目标猎人' : ''}。`;
    }
    if (action.type === 'use') { const requested = String(action.item || '').trim(); const index = player.items.findIndex((item) => item === requested || bountyItem(item).name === requested); const id = index >= 0 ? player.items[index] : requested; const item = bountyItem(id); if (!item || !item.id || (index < 0 && !player.items.includes(id))) return '没有可用的该道具。'; if (item.id === 'medkit' || item.id === 'vitamin' || item.id === 'strong-vitamin') { if (player.poison > 0) return '中毒状态下无法使用治疗物品。'; const amount = item.id === 'medkit' ? 50 : item.id === 'vitamin' ? 80 : 120; player.hp = Math.min(player.maxHp, player.hp + amount); player.bleed = 0; player.burn = 0; player.bleedSource = ''; player.burnSource = ''; } else if (item.id === 'regen-shot') { if (player.poison > 0) return '中毒状态下无法使用治疗物品。'; player.regen = 5; } else if (item.id === 'stamina' || item.id === 'strong-stamina') player.staminaInfiniteUntil = nowMs() + (item.id === 'stamina' ? 3 : 5) * 60000; else return '该道具需要指定目标或尚未接入战斗效果。'; const consumed = bountyConsumePlayerItem(player, index); return `${player.name}使用了${item.name}${consumed.maximum > 1 ? consumed.remaining > 0 ? `，剩余${consumed.remaining}/${consumed.maximum}次` : '，急救包已耗尽' : ''}。`; }
    if (action.type === 'heal') return bountyResolveAction(room, player, { type: 'use', item: 'medkit' });
    if (action.type === 'stop') { player.bleed = 0; player.burn = 0; player.bleedSource = ''; player.burnSource = ''; return `${player.name}处理了异常状态。`; }
    if (action.type === 'clue') { if (room.clues.indexOf(player.pos) >= 0) { player.clues++; player.knownCells = Array.from(new Set((player.knownCells || []).concat(room.clues))); room.boss.area = bountyBossSearchArea(room.boss.pos); return `${player.name}找到线索，Boss的3×3活动范围已显示。`; } return `${player.name}搜索了当前位置，但没有线索。`; }
    if (action.type === 'banish') { if (room.boss.alive || bountyDist(player.pos, room.boss.pos) > 0) return '必须先在Boss所在格击杀Boss后才能放逐。'; if (!room.boss.banishing) { room.boss.banishing = true; room.boss.banishStart = room.round; return `${player.name}开始放逐，需等待2个回合。`; } return ''; }
    if (action.type === 'takeBounty') { if (!room.boss.banishing || room.round - room.boss.banishStart < 2 || bountyDist(player.pos, room.boss.pos) > 0) return '放逐尚未完成或你不在Boss位置。'; player.bounty = true; player.bountyTakenRound = room.round; player.bountyVision = 5; room.boss.bountyReady = true; room.boss.banishing = false; return `${player.name}拾取了赏金。`; }
    if (action.type === 'lootWeapon') { const targetPos = action.pos ? bountyPos(action.pos) : bountyPos(player.pos); if (!targetPos || bountyDist(player.pos, targetPos.text) > 1) return '换装目标必须在同格或相邻一格。'; const target = room.players.find((other) => other.id !== player.id && other.pos === targetPos.text && other.downed && !other.dead && !other.extracted && other.teamId !== player.teamId); if (!target) return '附近没有可搜身的倒地猎人。'; bountyNormalizeWeapons(target); const sourceIndex = clamp(int(action.sourceSlot, 1), 1, target.weapons.length) - 1; const source = target.weapons[sourceIndex]; if (!source) return '倒地猎人的武器栏位不存在。'; const sourceState = Object.assign({}, source); const sourceReserve = bountySharedReserve(target, source); const sourceKey = bountyWeaponAmmoKey(source); const destination = action.destSlot && int(action.destSlot, 0) >= 1 ? int(action.destSlot, 0) - 1 : player.weapons.length < 2 ? player.weapons.length : player.activeWeaponIndex; if (destination < 0 || destination >= 2) return '你最多只能携带两把武器，请先卸下武器。'; const old = player.weapons[destination]; const currentSlots = bountyLoadoutSlots(player) - (old ? bountyWeaponSlotCost(old) : 0); if (currentSlots + bountyWeaponSlotCost(sourceState) > ((player.traits || []).indexOf('quartermaster') >= 0 ? 6 : 5)) return '换上这把武器后超过你的携带格数。'; player.weapons[destination] = sourceState; player.weapon = player.weapons[player.activeWeaponIndex] || null; player.ammoPools[sourceKey] = Math.max(0, int(player.ammoPools[sourceKey], 0)) + sourceReserve; bountyNormalizeWeapons(player); target.weapons.splice(sourceIndex, 1); target.ammoPools = Object.assign({}, target.ammoPools || {}); target.ammoPools[sourceKey] = Math.max(0, int(target.ammoPools[sourceKey], 0) - sourceReserve); target.weapon = null; target.weaponless = target.weapons.length === 0; bountyNormalizeWeapons(target); player.lastAction = `从${target.name}处换上${bountyWeaponDisplayName(sourceState)}`; return `${player.name}从倒地猎人${target.name}处换上${bountyWeaponDisplayName(sourceState)}${old ? `，替换了${bountyWeaponDisplayName(old)}` : ''}。`; }
    if (action.type === 'rob') { const target = room.players.find((other) => other.id !== player.id && other.pos === player.pos && other.bounty && other.teamId !== player.teamId && other.downed); if (!target) return '当前位置没有可劫掠的倒地赏金猎人。'; target.bounty = false; player.bounty = true; player.bountyVision = 5; player.kills++; return `${player.name}劫掠了${target.name}的赏金，透视次数恢复。`; }
    if (action.type === 'vision') { if (!player.bounty || player.bountyVision <= 0) return '没有可用的赏金透视。'; player.bountyVision--; const pos = bountyPos(action.pos || player.pos) || bountyPos(player.pos); const cells = Array.from(new Set(Array.from({ length: 9 }, (_, i) => `${String.fromCharCode(65 + clamp(pos.x + i % 3 - 1, 0, 12))}${clamp(pos.y + Math.floor(i / 3) - 1, 0, 12) + 1}`))); if (int(player.scoutHighlightRound, 0) !== room.round) player.scoutCells = []; player.scoutCells = Array.from(new Set((player.scoutCells || []).concat(cells))); player.scoutHighlightRound = room.round; player.knownCells = Array.from(new Set((player.knownCells || []).concat(cells))); return `${player.name}使用赏金透视，揭开了${action.pos || player.pos}周围3×3区域。`; }
    if (action.type === 'extract') { if (room.round < 3 || room.exits.indexOf(player.pos) < 0) return '撤离点尚未开放或你不在地图边缘撤离点。'; player.status = player.bounty ? '赏金撤离' : '已撤离'; player.extracted = true; player.dead = true; return `${player.name}${player.bounty ? '携带赏金成功撤离' : '成功撤离'}。`; }
    if (action.type === 'revive') { const remote = (player.traits || []).indexOf('necromancer') >= 0; const ally = room.players.find((other) => other.id !== player.id && other.teamId === player.teamId && other.downed && bountyDist(player.pos, other.pos) <= (remote ? 4 : 1)); if (!ally || ally.maxHp <= 0) return '没有可拉起的队友。'; if (ally.maxHp < 50) ally.maxHp = 50; ally.hp = Math.min(50, ally.maxHp); ally.downed = false; ally.status = '存活'; player.lastAction = `拉起${ally.name}`; return `${player.name}拉起了${ally.name}，其最大HP为${ally.maxHp}。`; }
    return '';
  }
  function bountyBotActions(room) {
    room.players.filter((player) => player.isBot && !player.dead && !player.extracted).forEach((player) => {
      // 旧房间兼容：若没有配装锁定标记，只补一次已有枪械，不在行动中重抽。
      bountyNormalizeWeapons(player); if (!player.botLoadoutLocked) player.botLoadoutLocked = true; const bossDistance = room.boss.pos ? bountyDist(player.pos, room.boss.pos) : 99; const enemies = room.players.filter((other) => other.id !== player.id && !other.dead && !other.downed && other.teamId !== player.teamId).sort((a, b) => bountyDist(player.pos, a.pos) - bountyDist(player.pos, b.pos)); const nearbyEnemy = enemies.find((other) => bountyDist(player.pos, other.pos) <= 2 || ((player.lastKnown || {})[other.id] === other.pos && bountyDist(player.pos, other.pos) <= 6)); const currentEvent = (room.mapEvents || []).find((event) => event.state === 'active' && event.pos === player.pos);
      if (player.downed) player.actions = [{ type: 'wait' }, { type: 'wait' }];
      else if (player.bounty && room.exits.indexOf(player.pos) >= 0 && room.round >= 3) player.actions = [{ type: 'extract' }, { type: 'wait' }];
      else if (!player.weapons.length) { const knownEvent = (room.mapEvents || []).find((event) => event.state === 'active' && (player.knownCells || []).indexOf(event.pos) >= 0); const destination = knownEvent ? knownEvent.pos : player.clues ? room.boss.pos : pick(room.clues); player.actions = nearbyEnemy && bountyDist(player.pos, nearbyEnemy.pos) <= 1 ? [{ type: 'melee', pos: nearbyEnemy.pos, heavy: false }, { type: 'wait' }] : [{ type: 'scout' }, { type: 'move', pos: bountyStepToward(player.pos, destination, 1) }]; }
      else if (nearbyEnemy) {
        const distance = bountyDist(player.pos, nearbyEnemy.pos); const tendency = String(player.botTendency || ''); let bestIndex = player.activeWeaponIndex; let bestScore = -9999; player.weapons.forEach((state, index) => { const weapon = bountyWeapon(state.id); const loaded = int(state.ammo, 0) > 0; const rangeGap = Math.abs(int(weapon.range, 2) - distance); const family = weapon.type === '霰弹' ? 'shotgun' : weapon.type === '长' || weapon.type === '猎象' ? 'long' : weapon.type === '中' ? 'mid' : 'short'; const styleBonus = tendency === 'close' ? (family === 'shotgun' || distance <= 1 ? 120 : 0) : tendency === 'marksman' ? (family === 'long' || distance >= 4 ? 120 : 0) : tendency === 'mid' ? (family === 'mid' || distance === 2 || distance === 3 ? 90 : 0) : tendency === 'rapid' ? (weapon.fullAuto || weapon.burst ? 100 : 0) : tendency === 'budget' ? (weapon.price <= 120 ? 80 : 0) : tendency === 'specialist' ? (weapon.bossDamage ? 130 : 0) : tendency === 'duelist' ? (weapon.handgun || distance <= 1 ? 90 : 0) : 0; const score = (loaded ? 500 : bountySharedReserve(player, state) > 0 ? 100 : -500) + int(weapon.damage, 0) * (state.dual ? 1.55 : 1) - rangeGap * 24 + (distance <= weapon.range ? 80 : 0) + styleBonus; if (score > bestScore) { bestScore = score; bestIndex = index; } });
        const bestState = player.weapons[bestIndex]; if (bestIndex !== player.activeWeaponIndex && int(bestState.ammo, 0) > 0) player.actions = [{ type: 'switch', slot: bestIndex + 1 }, { type: 'fire', pos: nearbyEnemy.pos, shots: 1, mode: 'single' }];
        else if (int(player.weapon.ammo, 0) > 0) player.actions = [{ type: 'aim' }, { type: 'fire', pos: nearbyEnemy.pos, shots: 1, mode: 'single' }];
        else if (bountySharedReserve(player, player.weapon) > 0) player.actions = [{ type: 'reload' }, { type: 'fire', pos: nearbyEnemy.pos, shots: 1, mode: 'single' }];
        else player.actions = [{ type: 'scout' }, { type: 'move', pos: bountyStepToward(player.pos, nearbyEnemy.pos, 1) }];
      }
      else if (currentEvent) player.actions = [{ type: 'investigate' }, { type: 'scout' }];
      else if (!room.boss.alive && bountyDist(player.pos, room.boss.pos) === 0) player.actions = room.boss.banishing ? [{ type: 'wait' }, { type: 'takeBounty' }] : [{ type: 'banish' }, { type: 'wait' }];
      else if (room.clues.indexOf(player.pos) >= 0 && !player.clues) player.actions = [{ type: 'clue' }, { type: 'wait' }];
      else if (bossDistance < 6 && room.boss.alive) player.actions = [{ type: 'move', pos: bountyStepToward(player.pos, room.boss.pos, 1) }, { type: 'scout' }];
      else { const knownEvent = (room.mapEvents || []).find((event) => event.state === 'active' && (player.knownCells || []).indexOf(event.pos) >= 0); const destination = knownEvent ? knownEvent.pos : player.clues ? room.boss.pos : pick(room.clues); player.actions = [{ type: 'scout' }, { type: 'move', pos: bountyStepToward(player.pos, destination, 1) }]; }
      player.locked = true;
    });
  }
  function bountyMonsterTarget(room, monster) {
    const type = bountyMonsterType(monster.type); const active = room.players.filter((player) => !player.dead && !player.extracted && !player.downed); let candidates = [];
    active.forEach((player) => { const terrain = bountyCell(bountyMapById(room.mapId), player.pos); const cover = terrain === 'F' || terrain === 'H' ? 1 : terrain === 'P' || terrain === 'W' ? -1 : 0; const range = Math.max(1, int(monster.detectRange, type.detectRange) - (bountyHasFieldTrait(player, 'beast-face') ? 2 : 0) - cover); const distance = bountyDist(monster.pos, player.pos); if (distance <= range || distance === 0) { let score = 100 - distance * 8; if (player.bounty) score += 45; if (player.bleed > 0 || player.burn > 0) score += type.id === 'hound' ? 55 : 18; candidates.push({ player, score }); } });
    const locked = active.find((player) => player.id === monster.targetId); if (locked && monster.alertedUntil >= room.round) candidates.push({ player: locked, score: 125 - bountyDist(monster.pos, locked.pos) * 5 });
    (room.sounds || []).filter((sound) => sound.round >= room.round - 2 && sound.sourceId).forEach((sound) => { const player = active.find((item) => item.id === sound.sourceId); if (!player) return; const distance = bountyDist(monster.pos, sound.pos); if (distance <= int(monster.detectRange, type.detectRange) + int(sound.intensity, 1)) candidates.push({ player, score: 70 + int(sound.intensity, 1) * 6 - distance * 4 }); });
    candidates.sort((a, b) => b.score - a.score); return candidates.length ? candidates[0].player : null;
  }
  function bountyMonsterAttack(room, monster, target) {
    const type = bountyMonsterType(monster.type); let damage = int(monster.damage, type.damage); const effects = []; if (type.id === 'waterdevil' && bountyCell(bountyMapById(room.mapId), target.pos) === 'W') damage += 18; const dealt = bountyDamagePlayer(target, damage, 'monster');
    if (type.bleed && !bountyHasFieldTrait(target, 'bloodless')) { if (int(target.bleed, 0) <= type.bleed) target.bleedSource = monster.name; target.bleed = Math.max(int(target.bleed, 0), type.bleed); effects.push('流血'); }
    if (type.poison) { if (int(target.poison, 0) <= type.poison) target.poisonSource = monster.name; target.poison = Math.max(int(target.poison, 0), type.poison); effects.push('中毒'); }
    bountyAppendPlayerLog(target, `受到怪物伤害（${bountyMonsterAttackName(type)}）：${monster.name}造成${dealt}伤害${effects.length ? `，并附加${effects.join('、')}` : ''}${target.downed ? '，你已倒地' : ''}。`);
    target.knownMonsters[monster.id] = monster.pos; room.players.filter((player) => player.teamId === target.teamId).forEach((ally) => { ally.knownMonsters[monster.id] = monster.pos; }); monster.lastAction = `袭击${target.name}`; monster.status = '交战'; bountyAddSound(room, monster.pos, type.id === 'screecher' ? 5 : 2, target.id, '怪物袭击'); return `${target.name}遭到${monster.name}袭击，受到${dealt}伤害${target.downed ? '并倒地' : ''}。`;
  }
  function bountyMonsterPatrol(room, monster) {
    const type = bountyMonsterType(monster.type); const candidates = bountyAdjacentCells(monster.pos, 1); const preferred = candidates.filter((pos) => type.terrain.indexOf(bountyCell(bountyMapById(room.mapId), pos)) >= 0); const pool = preferred.length ? preferred : candidates; if (pool.length && Math.random() < 0.45) monster.pos = pick(pool); monster.lastAction = '巡游'; monster.status = '游荡';
  }
  function bountyMonsterActions(room, events) {
    (room.monsters || []).forEach((monster, index) => {
      bountyNormalizeMonster(monster, index); if (!monster.alive) return; const type = bountyMonsterType(monster.type); const target = bountyMonsterTarget(room, monster);
      if (!target) { bountyMonsterPatrol(room, monster); return; }
      monster.targetId = target.id; monster.alertedUntil = room.round + 2; const distance = bountyDist(monster.pos, target.pos);
      if (type.scream && distance > 1 && room.round - int(monster.lastHowlRound, 0) >= 3) { monster.lastHowlRound = room.round; monster.lastAction = '尖啸示警'; monster.status = '警戒'; bountyAddSound(room, monster.pos, 7, target.id, '尖啸'); room.monsters.forEach((other) => { if (other.alive && other.id !== monster.id && bountyDist(other.pos, monster.pos) <= 6) { other.targetId = target.id; other.alertedUntil = room.round + 3; } }); events.push('猎场中响起刺耳尖啸，附近怪物开始向同一方向聚集。'); return; }
      if (distance <= 1) { events.push(bountyMonsterAttack(room, monster, target)); return; }
      if (type.moveEvery && room.round % type.moveEvery !== 0) { monster.lastAction = '蓄力观察'; monster.status = '警戒'; return; }
      const oldPos = monster.pos; monster.pos = bountyStepToward(monster.pos, target.pos, int(monster.moveRange, type.moveRange)); monster.lastAction = `追踪至${monster.pos}`; monster.status = '追踪'; if (bountyDist(monster.pos, target.pos) <= 1) target.knownMonsters[monster.id] = monster.pos; if (type.id === 'hound' && bountyDist(oldPos, monster.pos) > 1) bountyAddSound(room, monster.pos, 2, target.id, '奔跑');
    });
  }
  function bountyApplyRoundEffects(room, events) {
    room.players.forEach((player) => {
      if ((player.scoutCells || []).length && int(player.scoutHighlightRound, 0) < room.round) { player.scoutCells = []; player.scoutHighlightRound = 0; }
      if (player.dead || player.extracted) return;
      if (bountyHasFieldTrait(player, 'bloodless')) { player.bleed = 0; player.bleedSource = ''; }
      if (player.bleed > 0) { const dealt = bountyDamagePlayer(player, player.bleed, 'status'); if (dealt > 0) { const source = player.bleedSource || '未知来源'; const line = `持续伤害（流血）：${source}造成${dealt}伤害${player.downed ? '，你已倒地' : ''}。`; bountyAppendPlayerLog(player, line); events.push(`${player.name}的流血持续造成${dealt}伤害。`); } }
      if (player.burn > 0) { const beforeMax = player.maxHp; player.maxHp = Math.max(0, player.maxHp - player.burn); player.hp = Math.min(player.hp, player.maxHp); const lost = beforeMax - player.maxHp; if (lost > 0) { bountyAppendPlayerLog(player, `持续伤害（燃烧）：${player.burnSource || '未知来源'}造成${lost}点生命上限损失。`); events.push(`${player.name}的燃烧削减了${lost}点生命上限。`); } }
      if (player.poison > 0) { player.poison--; if (player.poison <= 0) player.poisonSource = ''; }
      if (player.regen > 0 && player.poison <= 0) { player.hp = Math.min(player.maxHp, player.hp + 15); player.regen--; }
      if (player.hp <= 0 && !player.downed) bountyDownPlayer(player);
      const usedStamina = (player.actions || []).some((action) => action && (action.type === 'sprint' || action.type === 'melee')); if (!usedStamina && nowMs() > int(player.staminaInfiniteUntil, 0)) player.stamina = Math.min(player.maxStamina || 3, player.stamina + 1);
      player.aiming = false; player.aimBonus = 0;
    });
    if (room.boss.banishing && room.round - room.boss.banishStart >= 2) room.boss.banished = true;
    if (room.weather && room.weather.untilRound < room.round) room.weather = { type: '', untilRound: 0 };
    room.sounds = (room.sounds || []).filter((sound) => sound.round >= room.round - 2);
  }
  function bountySettle(room) {
    if (!room || room.settled) return; room.settled = true; const reward = clamp(seal.ext.getIntConfig(ext, '赏金对决撤离奖励'), 0, 1000000);
    room.ranking = room.players.slice().sort((a, b) => Number(b.bounty && b.extracted) - Number(a.bounty && a.extracted) || Number(b.extracted) - Number(a.extracted) || int(b.kills, 0) - int(a.kills, 0)).map((player, index) => ({ rank: index + 1, name: player.name, status: player.status, bounty: !!(player.bounty && player.extracted), kills: int(player.kills, 0), reward: 0, affectionDelta: 0 }));
    room.players.forEach((player) => { if (!isSettlementEligible(player)) return; const escapedBounty = !!(player.bounty && player.extracted); if (escapedBounty) bountyGrantSkillProgress(player, false); else bountyPersistHunterProgress(player); const p = loadProfile(player.id, player.name); const coinReward = escapedBounty ? reward : 0; p.coins += coinReward; recordGame(p, 'bounty', escapedBounty ? 'win' : 'loss', int(player.kills, 0), coinReward, { affectionDelta: 0, escapes: player.extracted ? 1 : 0, bounties: escapedBounty ? 1 : 0, kills: player.kills, bossKills: int(player.bossDamage, 0) > 0 && !room.boss.alive ? 1 : 0, clues: player.clues, bestDamage: player.bossDamage, rounds: Math.min(room.round, room.maxRounds), downs: player.downs }); const row = room.ranking.find((item) => item.name === player.name); if (row) { row.reward = coinReward; row.affectionDelta = 0; row.level = player.level; row.skillPoints = player.skillPoints; } });
  }
  function bountyResolveRoundLimit(room, events) {
    room.players.forEach((player) => {
      if (player.extracted || player.dead) return;
      if (!player.downed && room.exits.indexOf(player.pos) >= 0) {
        player.status = player.bounty ? '赏金撤离' : '已撤离'; player.extracted = true; player.dead = true;
        const text = `${player.name}在第${room.maxRounds}回合结束时位于撤离点，完成强制撤离${player.bounty ? '并带出赏金' : ''}。`; player.lastRoundLogs = (player.lastRoundLogs || []).concat(text).slice(-6); events.push(text);
      } else if (player.downed) { player.status = '死亡'; player.dead = true; }
      else { player.status = '迷失'; const text = `${player.name}未能在猎场封闭前抵达撤离点，最终迷失。`; player.lastRoundLogs = (player.lastRoundLogs || []).concat(text).slice(-6); events.push(text); }
    });
  }
  function bountyAdvance(room) {
    if (!room || room.status !== 'playing') return;
    bountyBotActions(room);
    if (room.players.some((player) => !player.dead && !player.extracted && !player.locked)) return;
    const events = [];
    room.players.forEach((player) => { player.lastRoundLogs = []; player.roundDamageLogs = []; });
    for (let slot = 0; slot < 2; slot++) room.players.forEach((player) => {
      if (!player || player.dead || player.extracted) return;
      const action = player.actions[slot] || { type: 'wait' }; const previousAction = String(player.lastAction || ''); const result = bountyResolveAction(room, player, action);
      let ownLog = String(result || '');
      if (!ownLog && String(player.lastAction || '') !== previousAction) ownLog = `${player.name}${player.lastAction}。`;
      if (!ownLog && action.type === 'wait') ownLog = `${player.name}选择等待。`;
      if (ownLog) player.lastRoundLogs.push(ownLog);
      if (result) events.push(result);
    });
    bountyMonsterActions(room, events); bountyApplyRoundEffects(room, events); bountySpawnDynamicEvent(room, events); room.players.forEach((player) => { player.lastRoundLogs = (player.lastRoundLogs || []).concat(player.roundDamageLogs || []).slice(-6); player.roundDamageLogs = []; }); room.round++; if (room.round > room.maxRounds) bountyResolveRoundLimit(room, events); room.publicEvents = events.slice(-8);
    room.players.forEach((player) => { player.actions = []; player.locked = false; });
    if (room.round > room.maxRounds || room.players.every((player) => player.dead || player.extracted)) { room.status = 'finished'; bountySettle(room); }
    room.updatedAt = nowMs();
  }
  function bountyView(room, viewerId, privateView, quote) {
    const viewer = room && room.players ? room.players.find((player) => player.id === viewerId) : null; const effectivePrivate = !!privateView || !!(room && viewer && room.mode === 'solo'); const map = room ? bountyMapById(room.mapId) : BOUNTY_MAPS[0]; const shownRound = room ? Math.min(int(room.round, 0), int(room.maxRounds, BOUNTY_MAX_ROUNDS)) : 0; const known = viewer && effectivePrivate ? (viewer.knownCells || []) : []; const highlighted = viewer && effectivePrivate && int(viewer.scoutHighlightRound, 0) + 1 >= int(room && room.round, 0) ? (viewer.scoutCells || []) : [];
    const cardPlayers = room && room.mode === 'solo' && room.status !== 'finished' && viewer ? [viewer] : (room && room.players || []);
    const players = cardPlayers.map((player) => { const visible = effectivePrivate && bountyCanSee(viewer, player); const row = bountyPublicPlayer(player, visible); if (visible) { row.pos = player.pos; row.hp = player.hp; row.maxHp = player.maxHp; row.stamina = player.stamina; row.kills = player.kills || 0; row.clues = player.clues || 0; } return row; });
    const visibleMonsters = effectivePrivate && viewer && room ? (room.monsters || []).filter((monster) => monster.alive && ((viewer.knownMonsters || {})[monster.id] === monster.pos || bountyDist(viewer.pos, monster.pos) <= 1)) : [];
    const visibleEvents = effectivePrivate && viewer && room ? (room.mapEvents || []).filter((event) => known.indexOf(event.pos) >= 0 || event.claimedById === viewer.id) : [];
    const bossArea = room && room.boss && Array.isArray(room.boss.area) ? room.boss.area.slice() : []; const cells = []; const enemySightings = {};
    if (viewer && effectivePrivate && room) Object.keys(viewer.lastKnown || {}).forEach((targetId) => { const target = room.players.find((player) => player.id === targetId); const sighting = bountyPos(viewer.lastKnown[targetId]); if (target && target.id !== viewer.id && target.teamId !== viewer.teamId && sighting) { if (!enemySightings[sighting.text]) enemySightings[sighting.text] = { standing: 0, downed: 0 }; const state = (viewer.lastKnownStates || {})[targetId] === 'downed' ? 'downed' : 'standing'; enemySightings[sighting.text][state]++; } });
    for (let y = 0; y < BOUNTY_GRID_SIZE; y++) for (let x = 0; x < BOUNTY_GRID_SIZE; x++) { const pos = `${String.fromCharCode(65 + x)}${y + 1}`; const cell = bountyCell(map, pos); const marker = effectivePrivate && viewer && viewer.pos === pos ? 'self' : effectivePrivate && viewer && viewer.teamId && room.players.some((player) => player.id !== viewer.id && player.teamId === viewer.teamId && player.pos === pos) ? 'ally' : ''; const event = visibleEvents.find((item) => item.pos === pos && item.state === 'active'); const monster = visibleMonsters.find((item) => item.pos === pos); const landmark = (map.landmarks || []).find((item) => item.cells.indexOf(pos) >= 0); const sighting = enemySightings[pos] || { standing: 0, downed: 0 }; cells.push({ x, y, terrain: cell, marker, enemyCount: sighting.standing + sighting.downed, downedEnemyCount: sighting.downed, event: event ? event.type : '', eventMarker: event ? bountyMapEventType(event.type).marker : '', monster: monster ? monster.type : '', bossArea: bossArea.indexOf(pos) >= 0, clue: !!(room && room.clues.indexOf(pos) >= 0), known: effectivePrivate && highlighted.indexOf(pos) >= 0, exit: room && room.exits.indexOf(pos) >= 0, landmark: landmark ? landmark.name : '' }); }
    const ownLogs = viewer && Array.isArray(viewer.lastRoundLogs) ? viewer.lastRoundLogs.slice(-4) : [];
    return { kind: 'bounty', privateView: !!privateView, title: `赏金对决 · ${room ? room.mapName : '猎场大厅'}`, subtitle: room ? `第${shownRound}/${room.maxRounds}回合 · ${room.status === 'waiting' ? '等待入场' : room.status === 'playing' ? '同步行动' : '对局已结束'}` : '13×13地图 · 随机事件 · 猎人等级与地图特质', bountyScene: { mode: room ? room.status : 'menu', mapName: map.name, width: BOUNTY_GRID_SIZE, height: BOUNTY_GRID_SIZE, cells, exits: room ? room.exits : [], clues: room ? room.clues.slice() : [], bossArea, round: shownRound, maxRounds: room ? room.maxRounds : BOUNTY_MAX_ROUNDS, players, events: visibleEvents.map((event) => ({ type: event.type, name: event.name, pos: event.pos, state: event.state })), monsters: visibleMonsters.map((monster) => ({ type: monster.type, name: monster.name, pos: monster.pos, hp: monster.hp, maxHp: monster.maxHp, status: monster.status })), activeEventCount: room ? room.mapEvents.filter((event) => event.state === 'active').length : 0, aliveMonsterCount: room ? room.monsters.filter((monster) => monster.alive).length : 0, weather: room && room.weather && room.weather.untilRound >= room.round ? room.weather.type : '', publicEvents: room ? room.publicEvents : [], ownLogs, ownActions: viewer ? viewer.actions : [], help: ['.赏金 移动C4，侦查（可省略“行动”）', '.赏金 换装 C4 1 2（从倒地猎人处取1号枪，换入2号栏）', '.赏金 切换2，开火D5', '.赏金 冲刺C8（三至四格自动拆分）', '.赏金 扫射D5 3，换弹', '.赏金 私图', '.赏金 教程 1 / 武器 1 / 道具 1 / 技能 1'] }, lines: room ? [`模式：${room.mode === 'solo' ? '单排PvE（5名独立Bot）' : room.mode === 'duo' ? '双人PvE（三支队伍）' : 'PvP/PvE'}`, `地图：${map.name}`, `玩家：${room.mode === 'solo' ? '你（Bot位置隐藏）' : `${room.players.length}/${BOUNTY_MAX_PLAYERS}`}`, `线索：${room.clues.join('、')}（位置公开，Boss仍未定位）`, `异动：${room.mapEvents.filter((event) => event.state === 'active').length}处；怪物：${room.monsters.filter((monster) => monster.alive).length}只`, `Boss：${room.boss && room.boss.alive ? (bossArea.length ? `3×3范围已定位（${bossArea[0]}至${bossArea[bossArea.length - 1]}）` : '尚未定位') : room.boss && room.boss.banished ? '已放逐' : '已击杀，待放逐'}`, ...ownLogs] : ['猎人初始5技能点、Lv1；等级=技能点-4，最低Lv1。', '地图遗物会授予技能点与专属高级特质；侦查发现异动，搜索触发。', '怪物会感知视野与声音，在全部猎人行动后独立追踪、呼叫或攻击。'], quote: quote || '' };
  }
  function bountyMenuView(p, notice, options) {
    const opts = options || {}; const view = bountyView(null, p && p.id, false, ''); const selected = p ? bountySelectedHunter(p) : null;
    view.title = `赏金对决 · ${opts.title || '猎场大厅'}`; view.subtitle = opts.subtitle || '13×13地图 · 随机事件 · 猎人等级与地图特质'; view.quote = '';
    view.bountyScene.menuMode = opts.mode || 'home'; view.bountyScene.menuTitle = opts.title || '猎场准备'; view.bountyScene.menuNotice = notice || (selected ? `当前猎人：${bountyHunterSummary(selected)}` : '先建立猎人，再配置武器、道具与技能。');
    view.bountyScene.menuEntries = Array.isArray(opts.entries) ? opts.entries : []; view.bountyScene.menuPage = Math.max(1, int(opts.page, 1)); view.bountyScene.menuTotal = Math.max(1, int(opts.total, 1));
    if (view.bountyScene.menuEntries.length) view.lines = [`${view.bountyScene.menuTitle}：${view.bountyScene.menuNotice}`].concat(view.bountyScene.menuEntries.map((entry) => `${entry.title}${entry.tag ? `【${entry.tag}】` : ''}：${entry.detail}${entry.extra ? `；${entry.extra}` : ''}`)); else view.lines = [view.bountyScene.menuNotice];
    return view;
  }
  function bountyWarehouseView(p, pageValue, notice) {
    bountyProfileNormalize(p); const pageSize = 6; const total = Math.max(1, Math.ceil(p.bounty.hunters.length / pageSize)); const page = clamp(int(pageValue, 1), 1, total); const start = (page - 1) * pageSize;
    const entries = p.bounty.hunters.slice(start, start + pageSize).map((hunter, offset) => { bountyNormalizeWeapons(hunter); const weapons = hunter.weapons.map((state, index) => { const ammo = bountyAmmo(state.ammoType); return `${index === hunter.activeWeaponIndex ? '▶' : ''}${bountyWeaponDisplayName(state)}${ammo.id !== 'normal' ? `/${ammo.name}` : ''}`; }).join('、'); return { title: `${start + offset + 1}. ${hunter.name}`, tag: hunter.id === p.bounty.selected ? '当前猎人' : hunter.dead ? '已死亡' : `Lv${bountyHunterLevel(hunter.skillPoints)}`, detail: `${hunter.dead ? '无法出战' : `HP ${hunter.hp}/${hunter.maxHp}`} · 技能点${hunter.skillPoints} · ${weapons}`, extra: `武器${hunter.weapons.length}/2 · 占格${bountyLoadoutSlots(hunter)}/${hunter.traits.indexOf('quartermaster') >= 0 ? 6 : 5} · 道具：${(hunter.items || []).map((id) => bountyItem(id).name).join('、') || '无'} · 特质：${(hunter.traits || []).map((id) => bountyFindTrait(id).name).join('、') || '无'}`, selected: hunter.id === p.bounty.selected, disabled: !!hunter.dead }; });
    return bountyMenuView(p, notice || '发送“.赏金 选择猎人 序号”切换；“.赏金 新建猎人 名字”建立新猎人。', { mode: 'warehouse', title: '猎人仓库', subtitle: `第${page}/${total}页 · 共${p.bounty.hunters.length}名猎人 · 当前余额${p.coins}游戏币`, entries, page, total });
  }
  function bountyInfoView(p, title, subtitle, entries, notice) { return bountyMenuView(p, notice, { mode: 'info', title, subtitle, entries }); }
  function bountyLibraryView(kind, pageValue) {
    const pages = {
      tutorial: [
        [['入场前', '先用“仓库”查看猎人；免费猎人自带和平使者左轮、急救包与猎刀，不会空手入场。', '准备'], ['选择猎人', '“.赏金 选择猎人 1”切换仓库猎人；“.赏金 新建猎人 名字”保存新的猎人。', '仓库'], ['购买装备', '“.赏金 配装 1 武器名”与“.赏金 配装 2 武器名”购买武器；最多两栏且总占格不得超限。', '武器'], ['双持手枪', '“.赏金 双持 1”再购买同款手枪组成双持；仍算一个武器栏，但占格翻倍、命中降低且每次开火射出两发。', '双持'], ['补充弹药', '“.赏金 弹药 2 达姆弹”给指定武器装特殊弹；同弹种同口径共用备弹池。', '弹药'], ['携带道具', '“.赏金 道具 1”查看道具；“.赏金 购买道具 急救包”加入道具栏，最多4件。', '道具'], ['选择技能', '“.赏金 技能”查看常规技能；“.赏金 技能 死灵法师”花技能点购买。', '技能'], ['进入猎场', '“.赏金 人机”开始单排；“.赏金 人机 双排”与真人组队；“.赏金 开房”进行多人局。', '开始']],
        [['两次行动', '可用“|、+、；、，”分隔，例如“.赏金 移动C4，侦查”；“行动”二字可以省略。', '行动'], ['连续移动与冲刺', '相距两格的“移动C6”会拆成两次移动；相距三至四格的“冲刺C8”会拆成两次冲刺，各消耗1点耐力。', '移动'], ['切枪与倒地换装', '“.赏金 切换2，开火D5”切枪；击倒敌人后可用“.赏金 换装 C4 1 2”拿其1号枪替换自己的2号栏，必须相邻且总占格不超上限。', '武器'], ['侦查与战争迷雾', '“.赏金 侦查”按手中武器范围寻找目标；私人图以“敌”显示站立猎人，以“倒”显示倒地猎人。', '侦查'], ['开火与爆头', '“.赏金 开火 D5”射击；“.赏金 爆头 D5”以一半命中率尝试秒杀。', '战斗'], ['近战攻击', '轻击耗1耐力、重击耗3耐力；附近只有一个目标时可省略坐标，例如“.赏金 轻击，等待”；多个目标时使用“轻击 K8”指定。', '近战'], ['状态处理', '“.赏金 止血”可免费止血；“.赏金 治疗”使用治疗物品；中毒时不能回血。', '生存'], ['线索与Boss', '开局公开三处金色“线”标记；抵达任一线索格使用“.赏金 线索，等待”或“搜索，等待”后，才会揭示Boss范围。', '目标'], ['赏金与透视', '放逐完成后用“拾取赏金”；携赏金可用“透视 A1”揭开周围3×3区域，共5次。', '赏金'], ['撤离与胜负', '第3回合起可主动撤离；第40回合结束时，仍存活且已站在撤离点的玩家会被强制撤离，其余玩家迷失。', '结算']]
      ],
      weapon: [
        BOUNTY_WEAPONS.slice(0, 10).map((w, i) => [`${i + 1}. ${w.name}`, `${w.type}子弹 · 伤害${w.damage} · 弹仓${w.mag}/${w.reserve} · 腰${w.hip}%/瞄${w.aim}% · ${w.range}格 · ${w.price}币。${w.fire}，换弹${w.reload}每次${w.perReload}发。`, '武器库']),
        BOUNTY_WEAPONS.slice(10, 20).map((w, i) => [`${i + 11}. ${w.name}`, `${w.type}子弹 · 伤害${w.damage} · 弹仓${w.mag}/${w.reserve} · 腰${w.hip}%/瞄${w.aim}% · ${w.range}格 · ${w.price}币。${w.fire}，换弹${w.reload}每次${w.perReload}发。`, '武器库']),
        BOUNTY_WEAPONS.slice(20, 30).map((w, i) => [`${i + 21}. ${w.name}`, `${w.type}子弹 · 伤害${w.damage} · 弹仓${w.mag}/${w.reserve} · 腰${w.hip}%/瞄${w.aim}% · ${w.range}格 · ${w.price}币。${w.fire}，换弹${w.reload}每次${w.perReload}发。`, '武器库']),
        BOUNTY_WEAPONS.slice(30).map((w, i) => [`${i + 31}. ${w.name}`, `${w.type}子弹 · 伤害${w.damage} · 弹仓${w.mag}/${w.reserve} · 腰${w.hip}%/瞄${w.aim}% · ${w.range}格 · ${w.price}币。${w.fire}，换弹${w.reload}每次${w.perReload}发。`, '武器库'])
      ],
      item: [BOUNTY_ITEMS.slice(0, 8).map((item, i) => [`${i + 1}. ${item.name}`, `${item.type} · ${item.price}币 · ${item.effect}`, '道具库']), BOUNTY_ITEMS.slice(8).map((item, i) => [`${i + 9}. ${item.name}`, `${item.type} · ${item.price}币 · ${item.effect}`, '道具库'])],
      skill: [BOUNTY_TRAITS.map((trait) => [trait.name, `${trait.cost}技能点：${trait.desc}`, '常规技能']), BOUNTY_FIELD_TRAITS.map((trait) => [trait.name, `地图事件获得：${trait.desc}`, '高级技能'])]
    };
    const list = pages[kind] || pages.tutorial; const page = tutorialPage(pageValue, list.length); const names = { tutorial: '完整教程', weapon: '武器库', item: '道具库', skill: '技能库' }; const command = kind === 'tutorial' ? '教程' : kind === 'weapon' ? '武器' : kind === 'item' ? '道具' : '技能'; const next = page === list.length ? 1 : page + 1;
    if (kind === 'weapon') {
      const start = (page - 1) * 10; const rows = BOUNTY_WEAPONS.slice(start, start + 10).map((weapon, index) => [String(start + index + 1), weapon.name, weapon.type, String(weapon.damage), `${weapon.mag}/${weapon.reserve}`, `${weapon.hip}/${weapon.aim}`, String(weapon.range), String(weapon.slots), String(weapon.price), `${weapon.fire}${weapon.handgun ? '/可双持' : ''}；${weapon.reload}+${weapon.perReload}`]);
      return { kind: 'bounty', title: '赏金对决 · 武器库', subtitle: `第${page}/${list.length}页 · 发送“.赏金 武器 ${next}”继续`, tutorial: { layout: 'table', page, total: list.length, columns: [['序', 42], ['武器', 160], ['弹', 46], ['伤害', 58], ['弹仓/备弹', 82], ['腰/瞄', 76], ['距', 44], ['格', 42], ['价格', 60], ['射击与装填', 190]], rows }, lines: [], quote: '命中率栏为腰射/瞄准；装填栏末尾数字表示每次动作装入的子弹数。' };
    }
    if (kind === 'item') {
      const start = (page - 1) * 8; const rows = BOUNTY_ITEMS.slice(start, start + 8).map((item, index) => [String(start + index + 1), item.name, item.type, Array.isArray(item.damage) ? item.damage.join('/') : '—', String(item.price), item.effect]);
      return { kind: 'bounty', title: '赏金对决 · 道具库', subtitle: `第${page}/${list.length}页 · 发送“.赏金 道具 ${next}”继续`, tutorial: { layout: 'table', page, total: list.length, columns: [['序', 48], ['道具', 190], ['类别', 90], ['伤害/轻重击', 130], ['价格', 74], ['效果', 445]], rows }, lines: [], quote: '每名猎人最多携带4件道具；爆炸物对怪物与Boss使用独立倍率结算。' };
    }
    const entries = list[page - 1].map((item) => ({ title: item[0], description: item[1], tag: item[2] }));
    return { kind: 'bounty', title: `赏金对决 · ${names[kind] || names.tutorial}`, subtitle: `第${page}/${list.length}页 · 发送“.赏金 ${command} ${next}”继续`, tutorial: { layout: 'cards', page, total: list.length, entries }, lines: entries.map((entry) => `${entry.title}：${entry.description}`), quote: kind === 'tutorial' ? '先配装、再进图；进图后每回合提交两个行动。' : '常规技能可在仓库配置；高级技能只能通过地图事件取得。' };
  }
  async function handleBounty(ctx, msg, args, cmdArgs) { const id = uid(ctx, msg); const name = uname(ctx, msg); const isPrivate = !!ctx.isPrivate; let gid = groupId(ctx, msg); if (isPrivate) gid = resolvePrivateActiveRoom('bounty', id, gid); const key = roomKey('bounty', gid); const p = loadProfile(id, name); bountyProfileNormalize(p); saveProfile(p); let room = bountyNormalizeRoom(ensureRoomAvailable('bounty', gid)); const op = String(args[0] || '').toLowerCase(); if (room && room.status === 'finished' && ['状态', '查看', '地图', '结算', '结果'].indexOf(op) < 0) { clearKey(key); room = null; }
    if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, bountyLibraryView('tutorial', args[1]));
    if (['仓库', '猎人', 'hunters'].indexOf(op) >= 0) return replyView(ctx, msg, bountyWarehouseView(p, args[1]));
    if (['模板', 'template', 'loadout模板'].indexOf(op) >= 0) {
      if (!args[1] || ['列表', 'list'].indexOf(String(args[1]).toLowerCase()) >= 0) { const entries = p.bounty.templates.map((item, index) => { bountyNormalizeWeapons(item); const weaponNames = item.weapons.map(bountyWeaponDisplayName).join('、'); return { title: `${index + 1}. ${item.name}`, tag: `${item.weapons.length}/2武器`, detail: `武器：${weaponNames} · 道具：${(item.items || []).map((id) => bountyItem(id).name).join('、') || '无'}`, extra: `占格${bountyLoadoutSlots(item)} · 特质：${(item.traits || []).map((id) => bountyFindTrait(id).name).join('、') || '无'}` }; }); return replyView(ctx, msg, bountyInfoView(p, '配装模板', `共${entries.length}份 · 游戏中不能载入`, entries, entries.length ? '发送“.赏金 模板 使用 名称”载入；载入后仍可继续微调。' : '暂无模板；发送“.赏金 模板 保存 名称”保存当前配置。')); }
      const action = String(args[1]).toLowerCase(); const templateName = String(args.slice(2).join(' ') || '').slice(0, 18); const hunter = bountySelectedHunter(p);
      if (action === '保存' || action === 'save') { if (!templateName) return replyView(ctx, msg, bountyMenuView(p, '请提供模板名称。')); bountyNormalizeWeapons(hunter); const saved = { name: templateName, weapon: Object.assign({}, hunter.weapon), weapons: hunter.weapons.map((state) => Object.assign({}, state)), activeWeaponIndex: hunter.activeWeaponIndex, ammoPools: Object.assign({}, hunter.ammoPools), items: (hunter.items || []).slice(0, 4), traits: (hunter.traits || []).slice(), savedAt: nowMs() }; p.bounty.templates = p.bounty.templates.filter((item) => item.name !== templateName).concat(saved).slice(-20); saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `已保存模板“${templateName}”，进入游戏前可随时微调。`)); }
      if (action === '使用' || action === '载入' || action === 'load') { const template = p.bounty.templates.find((item) => item.name === templateName) || p.bounty.templates[int(args[2], 0) - 1]; if (!template) return replyView(ctx, msg, bountyMenuView(p, '没有找到该配装模板。')); if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能修改配装。')); hunter.weapon = template.weapon ? Object.assign({}, template.weapon) : null; hunter.weapons = (template.weapons || []).map((state) => Object.assign({}, state)); hunter.activeWeaponIndex = int(template.activeWeaponIndex, 0); hunter.ammoPools = Object.assign({}, template.ammoPools || {}); bountyNormalizeWeapons(hunter); hunter.items = (template.items || []).slice(0, 4); hunter.traits = (template.traits || []).slice(); hunter.level = bountyHunterLevel(hunter.skillPoints); saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `已载入模板“${template.name}”，仍可继续微调。`)); }
      return replyView(ctx, msg, bountyMenuView(p, '模板用法：列表 / 保存 名称 / 使用 名称。'));
    }
    if (['选择猎人', '选择', 'select'].indexOf(op) >= 0) { if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能更换猎人。')); const index = clamp(int(args[1], 0), 1, p.bounty.hunters.length) - 1; const hunter = p.bounty.hunters[index]; if (!hunter || hunter.dead) return replyView(ctx, msg, bountyMenuView(p, '猎人序号无效或已经死亡。')); p.bounty.selected = hunter.id; saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `已选择：${bountyHunterSummary(hunter)}`)); }
    if (['新建猎人', '创建猎人', 'newhunter'].indexOf(op) >= 0) { if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能创建猎人。')); const hunterName = String(args.slice(1).join(' ') || `猎人${p.bounty.hunters.length + 1}`).slice(0, 9); const hunter = bountyNewHunter(id, hunterName, false); p.bounty.hunters.push(hunter); p.bounty.selected = hunter.id; saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `已创建免费猎人“${hunterName}”，可用“.赏金 配装 1 武器名”与“.赏金 配装 2 武器名”调整装备。`)); }
    if (['配装', '装备', 'loadout'].indexOf(op) >= 0) {
      if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能修改配装。')); const hunter = bountySelectedHunter(p); bountyNormalizeWeapons(hunter); const hasSlot = /^\d+$/.test(String(args[1] || '')); const slot = hasSlot ? int(args[1], 1) - 1 : 0; if (slot < 0 || slot >= 2) return replyView(ctx, msg, bountyMenuView(p, '猎人最多携带两把武器，请使用1号或2号武器栏。')); const weaponText = args.slice(hasSlot ? 2 : 1).join(' '); const weapon = bountyFindWeapon(weaponText); if (!weapon) return replyView(ctx, msg, bountyMenuView(p, '未找到武器；发送“.赏金 武器 1”查看武器库。'));
      const nextWeapons = hunter.weapons.map((state) => Object.assign({}, state)); if (slot > nextWeapons.length || slot >= 2) return replyView(ctx, msg, bountyMenuView(p, '猎人最多携带两把武器，请使用1号或2号武器栏。')); const nextState = { id: weapon.id, ammo: weapon.mag, reserve: weapon.reserve, ammoType: 'normal', dual: false }; if (slot === nextWeapons.length) nextWeapons.push(nextState); else nextWeapons[slot] = nextState; const preview = { weapons: nextWeapons, activeWeaponIndex: Math.min(hunter.activeWeaponIndex, nextWeapons.length - 1), ammoPools: {}, weapon: null }; bountyResetAmmoPools(preview); const capacity = hunter.traits.indexOf('quartermaster') >= 0 ? 6 : 5; const usedSlots = bountyLoadoutSlots(preview); if (usedSlots > capacity) return replyView(ctx, msg, bountyMenuView(p, `这套武器共占${usedSlots}格，当前猎人只能携带${capacity}格。`)); if (p.coins < weapon.price) return replyView(ctx, msg, bountyMenuView(p, `购买${weapon.name}需要${weapon.price}游戏币。`));
      p.coins -= weapon.price; hunter.weapon = null; hunter.weapons = preview.weapons.map((state) => Object.assign({}, state)); hunter.activeWeaponIndex = preview.activeWeaponIndex; hunter.ammoPools = Object.assign({}, preview.ammoPools); bountyNormalizeWeapons(hunter); p.stats.bounty.bountyHighestWeaponPrice = Math.max(p.stats.bounty.bountyHighestWeaponPrice, weapon.price); saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `已在${slot + 1}号栏配备${weapon.name}；当前武器${hunter.weapons.length}/2，占格${usedSlots}/${capacity}。`));
    }
    if (['双持', 'dual'].indexOf(op) >= 0) {
      if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能修改双持配置。')); const hunter = bountySelectedHunter(p); bountyNormalizeWeapons(hunter); let slot = /^[12]$/.test(String(args[1] || '')) ? int(args[1], 1) - 1 : hunter.activeWeaponIndex; if (args[1] && !/^[12]$/.test(String(args[1]))) { const found = hunter.weapons.findIndex((state) => bountyWeapon(state.id).name === args.slice(1).join(' ') || state.id === String(args.slice(1).join(' ')).toLowerCase()); if (found >= 0) slot = found; }
      const state = hunter.weapons[slot]; if (!state) return replyView(ctx, msg, bountyMenuView(p, '没有找到要双持的武器栏。')); const weapon = bountyWeapon(state.id); if (!weapon.handgun) return replyView(ctx, msg, bountyMenuView(p, `${weapon.name}不是可双持的手枪。`)); if (state.dual) return replyView(ctx, msg, bountyMenuView(p, `${weapon.name}已经是双持状态。`)); const capacity = hunter.traits.indexOf('quartermaster') >= 0 ? 6 : 5; const usedSlots = bountyLoadoutSlots(hunter) + weapon.slots; if (usedSlots > capacity) return replyView(ctx, msg, bountyMenuView(p, `双持后会占${usedSlots}格，当前猎人只能携带${capacity}格。`)); if (p.coins < weapon.price) return replyView(ctx, msg, bountyMenuView(p, `购买第二把${weapon.name}需要${weapon.price}游戏币。`)); p.coins -= weapon.price; hunter.weapons[slot].dual = true; hunter.weapons[slot].ammo = weapon.mag * 2; hunter.weapon = hunter.weapons[slot]; hunter.ammoPools = {}; hunter.weapons.forEach((item) => { const key = bountyWeaponAmmoKey(item); hunter.ammoPools[key] = int(hunter.ammoPools[key], 0) + bountyWeapon(item.id).reserve * (item.dual ? 2 : 1); }); bountySyncWeaponAlias(hunter); p.stats.bounty.bountyHighestWeaponPrice = Math.max(p.stats.bounty.bountyHighestWeaponPrice, weapon.price); saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `${hunter.name}已将${slot + 1}号栏改为双持${weapon.name}：每次开火两发，命中率-20%，该栏仍只计一把武器。`));
    }
    if (['卸下', '移除武器', 'unequip'].indexOf(op) >= 0) { if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能卸下武器。')); const hunter = bountySelectedHunter(p); bountyNormalizeWeapons(hunter); const slot = int(args[1], 0) - 1; if (slot < 0 || slot >= hunter.weapons.length) return replyView(ctx, msg, bountyMenuView(p, '请指定有效的1号或2号武器栏。')); if (hunter.weapons.length <= 1) return replyView(ctx, msg, bountyMenuView(p, '至少需要保留一把武器才能进入猎场。')); const removed = bountyWeaponDisplayName(hunter.weapons[slot]); hunter.weapons.splice(slot, 1); hunter.activeWeaponIndex = 0; hunter.weapon = null; hunter.ammoPools = {}; bountyResetAmmoPools(hunter); saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `已卸下${removed}，不返还购买费用。`)); }
    if (['弹药', 'ammo'].indexOf(op) >= 0) { const entries = BOUNTY_AMMO.map((ammo, index) => ({ title: `${index + 1}. ${ammo.name}`, tag: `${ammo.price}币`, detail: `适用：${ammo.families.join('、')}`, extra: ammo.desc })); if (!args[1]) return replyView(ctx, msg, bountyInfoView(p, '特殊弹药库', '可为1号或2号武器分别装配；同口径同弹种共享备弹', entries, '发送“.赏金 弹药 名称”装配当前栏，或“.赏金 弹药 2 名称”装配2号栏。')); if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能修改弹药。')); const hunter = bountySelectedHunter(p); bountyNormalizeWeapons(hunter); const numbered = /^[12]$/.test(String(args[1] || '')); const slot = numbered ? int(args[1], 1) - 1 : hunter.activeWeaponIndex; const ammoText = args.slice(numbered ? 2 : 1).join(' '); const ammo = bountyFindAmmo(ammoText); if (!ammo) return replyView(ctx, msg, bountyInfoView(p, '特殊弹药库', '没有找到该弹药', entries, `未找到“${ammoText}”，请从中央列表选择。`)); const state = hunter.weapons[slot]; if (!state) return replyView(ctx, msg, bountyMenuView(p, `当前没有${slot + 1}号武器。`)); const weapon = bountyWeapon(state.id); const family = bountyWeaponFamily(weapon); if (ammo.families.indexOf(family) < 0) return replyView(ctx, msg, bountyMenuView(p, `${weapon.name}不能使用${ammo.name}。`)); if (p.coins < ammo.price) return replyView(ctx, msg, bountyMenuView(p, `购买${ammo.name}需要${ammo.price}游戏币。`)); p.coins -= ammo.price; state.ammoType = ammo.id; hunter.weapon = null; hunter.ammoPools = {}; bountyResetAmmoPools(hunter); saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `${hunter.name}的${slot + 1}号${bountyWeaponDisplayName(state)}已装配${ammo.name}。`)); }
    if (['购买道具', '买道具', 'buyitem'].indexOf(op) >= 0) { if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能购买道具。')); const hunter = bountySelectedHunter(p); const item = bountyFindItem(args.slice(1).join(' ')); if (!item) return replyView(ctx, msg, bountyMenuView(p, '未找到道具。')); if (hunter.items.length >= 4) return replyView(ctx, msg, bountyMenuView(p, '猎人最多携带4件道具。')); if (p.coins < item.price) return replyView(ctx, msg, bountyMenuView(p, `购买${item.name}需要${item.price}游戏币。`)); p.coins -= item.price; hunter.items.push(item.id); saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `已购买${item.name}，当前道具${hunter.items.length}/4。`)); }
    if (['特质', 'trait', '技能'].indexOf(op) >= 0) { const hunter = bountySelectedHunter(p); if (!args[1] || /^\d+$/.test(String(args[1]))) return replyView(ctx, msg, bountyLibraryView('skill', args[1])); if (room && room.status === 'playing') return replyView(ctx, msg, bountyView(room, id, false, '游戏中不能修改特质。')); const trait = bountyFindTrait(args.slice(1).join(' ')); if (!trait) return replyView(ctx, msg, bountyMenuView(p, '未找到可配置的常规特质；地图高级特质只能在地图事件中获得。')); if (hunter.traits.indexOf(trait.id) >= 0) return replyView(ctx, msg, bountyMenuView(p, '该猎人已经拥有这个特质。')); const used = hunter.traits.reduce((sum, traitId) => sum + ((bountyFindTrait(traitId) || {}).cost || 0), 0); const points = Math.max(5, int(hunter.skillPoints, 5)); if (used + trait.cost > points) return replyView(ctx, msg, bountyMenuView(p, `当前有${points}点技能点，已使用${used}点。`)); hunter.traits.push(trait.id); hunter.spentTraitPoints = used + trait.cost; hunter.level = bountyHunterLevel(points); saveProfile(p); return replyView(ctx, msg, bountyMenuView(p, `${hunter.name}习得了${trait.name}，当前Lv${hunter.level}。`)); }
    if (['地图特质', '高级特质', 'fieldtraits', 'maptraits'].indexOf(op) >= 0) return replyView(ctx, msg, bountyInfoView(p, '地图高级特质', '只能在猎场事件中取得，不能直接购买', BOUNTY_FIELD_TRAITS.map((trait, index) => ({ title: `${index + 1}. ${trait.name}`, tag: '地图限定', detail: trait.desc, extra: '猎人成功带回后会保存到仓库档案。' })), '侦查地图异动并搜索猎人遗物，有机会获得这些强力特质。'));
    if (['武器', 'weapon'].indexOf(op) >= 0) return replyView(ctx, msg, bountyLibraryView('weapon', args[1]));
    if (['道具', 'items', '物品'].indexOf(op) >= 0) return replyView(ctx, msg, bountyLibraryView('item', args[1]));
    if (['人机', 'pve', '单人', '单排', 'solo'].indexOf(op) >= 0) { if (room && room.status !== 'finished') return replyView(ctx, msg, bountyView(room, id, false, '当前群已有赏金对决。')); const duo = ['双排', '组队', 'duo'].indexOf(String(args[1] || '').toLowerCase()) >= 0; room = bountyCreateRoom(id, name, true, duo ? 'duo' : 'solo'); if (duo) { jsonSet(key, room); return replyView(ctx, msg, bountyView(room, id, false, 'PvE双排房已创建，无入场费；可再加入一名真人，开始时补足两支Bot队伍。')); } bountyAddBots(room, 5); bountyStart(room); jsonSet(key, room); return replyView(ctx, msg, bountyView(room, id, false, '单排猎场已开启：你与5名独立Bot各自为敌；Bot不会读取你的隐藏位置。')); }
    if (['开房', '创建', 'create'].indexOf(op) >= 0) { if (room && room.status !== 'finished') return replyView(ctx, msg, bountyView(room, id, false, '当前群已有赏金对决。')); room = bountyCreateRoom(id, name, true, 'pvpve'); jsonSet(key, room); return replyView(ctx, msg, bountyView(room, id, false, '赏金房间已创建（无入场费），等待猎人加入。')); }
    if (!room) return replyView(ctx, msg, bountyMenuView(p, '发送“.赏金 人机”进入单排PvE；“.赏金 人机 双排”与一名真人组队；或“.赏金 开房”进行PvP/PvPvE。')); if (['加入', 'join'].indexOf(op) >= 0) { if (room.status !== 'waiting') return replyView(ctx, msg, bountyView(room, id, false, '只能加入等待中的赏金房间。')); if (room.players.some((player) => player.id === id)) return replyView(ctx, msg, bountyView(room, id, false, '你已经在房间中。')); if (room.mode === 'duo' && room.players.filter((player) => !player.isBot).length >= 2) return replyView(ctx, msg, bountyView(room, id, false, '双人PvE最多允许两名真人组队。')); const selected = bountySelectedHunter(p); const teamId = room.mode === 'duo' ? 1 : Math.floor(room.players.length / 2) + 1; const joined = bountyApplyHunterToPlayer(bountyRoomPlayer(id, name, false, true, selected.id, teamId), selected); room.players.push(joined); room.updatedAt = nowMs(); jsonSet(key, room); return replyView(ctx, msg, bountyView(room, id, false, `${name}已加入赏金房间（无入场费）。`)); }
    if (['开始', 'start'].indexOf(op) >= 0) { if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, bountyView(room, id, false, '只有房主能开始等待中的赏金房间。')); const startError = bountyStart(room); if (startError) return replyView(ctx, msg, bountyView(room, id, false, startError)); jsonSet(key, room); return replyView(ctx, msg, bountyView(room, id, false, '地图已抽取，行动从第1回合开始。')); }
    const actionPrefix = ['行动', 'action'].indexOf(op) >= 0; const directAction = !actionPrefix && bountyIsDirectActionSubmission(args.join(' '));
    if (actionPrefix || directAction) { const player = room.players.find((item) => item.id === id); if (!player || player.dead) return replyView(ctx, msg, bountyView(room, id, isPrivate, '你不在有效猎人席位。')); if (room.status !== 'playing') return replyView(ctx, msg, bountyView(room, id, isPrivate, '当前不在行动阶段。')); const submission = bountyParseActionSubmission(player, actionPrefix ? args.slice(1).join(' ') : args.join(' ')); if (submission.error) return replyView(ctx, msg, bountyView(room, id, isPrivate, `指令错误：${submission.error} 本回合尚未推进，请重新输入。`)); const validationError = bountyValidateActionSubmission(room, player, submission.actions); if (validationError) return replyView(ctx, msg, bountyView(room, id, isPrivate, `指令错误：${validationError} 本回合尚未推进，请重新输入。`)); player.actions = submission.actions; player.locked = true; bountyAdvance(room); jsonSet(key, room); return replyView(ctx, msg, bountyView(room, id, isPrivate, submission.autoMove ? '两格移动已拆分并锁定为本回合的两次行动。' : submission.autoSprint ? '三至四格冲刺已拆分并锁定为本回合的两次行动。' : submission.autoWait ? '单个行动已锁定，第二次行动自动视为等待。' : '两次行动已锁定；私人视图不会泄露给其他玩家。')); }
    if (['改行动', '修改', 'edit'].indexOf(op) >= 0) { const player = room.players.find((item) => item.id === id); if (!player || player.locked) return replyView(ctx, msg, bountyView(room, id, isPrivate, '当前行动已经锁定。')); const submission = bountyParseActionSubmission(player, args.slice(1).join(' ')); if (submission.error) return replyView(ctx, msg, bountyView(room, id, isPrivate, `指令错误：${submission.error} 本回合尚未推进，请重新输入。`)); const validationError = bountyValidateActionSubmission(room, player, submission.actions); if (validationError) return replyView(ctx, msg, bountyView(room, id, isPrivate, `指令错误：${validationError} 本回合尚未推进，请重新输入。`)); player.actions = submission.actions; jsonSet(key, room); return replyView(ctx, msg, bountyView(room, id, isPrivate, submission.autoMove ? '两格移动已拆分为两次行动；发送“.赏金 锁定”提交。' : submission.autoSprint ? '三至四格冲刺已拆分为两次行动；发送“.赏金 锁定”提交。' : '行动已修改，发送“.赏金 锁定”提交。')); }
    if (['锁定', '提交', 'lock'].indexOf(op) >= 0) { const player = room.players.find((item) => item.id === id); if (!player) return replyView(ctx, msg, bountyView(room, id, isPrivate, '你不在房间中。')); if (!player.actions || player.actions.length < 2) player.actions = [{ type: 'wait' }, { type: 'wait' }]; player.locked = true; bountyAdvance(room); jsonSet(key, room); return replyView(ctx, msg, bountyView(room, id, isPrivate, '行动已锁定。')); }
    if (['状态', '查看', '地图', 'status'].indexOf(op) >= 0) return replyView(ctx, msg, bountyView(room, id, false, room.status === 'playing' ? '公共地图只显示公开情报；发送“.赏金 私图”查看自己的私人战术图。' : ''));
    if (['结算', '结果'].indexOf(op) >= 0) return replyView(ctx, msg, bountyView(room, id, false, '本局结算已记录；再次发送“.赏金”返回帮助界面。'));
    if (['私图', '私人', 'private'].indexOf(op) >= 0) { bindPrivateActiveRoom('bounty', id, gid); return replyView(ctx, msg, bountyView(room, id, true, '私人战术图只发送给你。'), true); }
    if (['退出', '取消', 'leave'].indexOf(op) >= 0 && room.status === 'waiting') { cancelWaitingRoom(room, id); if (!room.players.length) clearKey(key); else jsonSet(key, room); return replyView(ctx, msg, room.players.length ? bountyView(room, id, false, '已退出等待中的赏金房间。') : bountyMenuView(p, '房间已取消。')); }
    if (['清理', 'clear'].indexOf(op) >= 0) { if (room.status === 'waiting' && room.ownerId !== id) return replyView(ctx, msg, bountyView(room, id, false, '只有房主可以清理房间。')); refundWaitingRoom(room); clearKey(key); return replyView(ctx, msg, bountyMenuView(p, '赏金房间已清理。')); }
    return replyView(ctx, msg, room ? bountyView(room, id, false, '可用操作：仓库、武器、弹药、道具、特质、配装、双持、卸下、人机、开房、加入、开始、行动、切换、状态、私图。搜索/调查触发地图事件；赏金对决无入场费，好感与档案结算均不受影响。') : bountyMenuView(p, '发送“.赏金 人机”进入单排PvE；“.赏金 人机 双排”与一名真人组队；或“.赏金 开房”邀请其他玩家。'));
  }

  // -------------------- 智力打工 --------------------
  const WORK_TYPES = { math24: '24点', sudoku: '数独', knights: '骑士与无赖', creek: 'Creek溪流', calculator: '计算器游戏' };
  const WORK_TYPE_ALIASES = {
    '24': 'math24', '24点': 'math24', '数学': 'math24', '数独': 'sudoku',
    '骑士': 'knights', '无赖': 'knights', '骑士与无赖': 'knights', '逻辑': 'knights',
    'creek': 'creek', '溪流': 'creek', '顶点扫雷': 'creek', 'creek溪流': 'creek',
    '计算器': 'calculator', '计算器游戏': 'calculator', 'calc': 'calculator', 'calculator': 'calculator'
  };
  const EXPERT_SUDOKU_ALIASES = ['专家数独', '专家', '极难数独', 'expert', 'expert sudoku'];
  const WORK_SESSION_PREFIX = 'aff.work.session.v1:';
  function workSessionKey(id) { return `${WORK_SESSION_PREFIX}${encodeURIComponent(id)}`; }
  function workTypeKey(value) { return WORK_TYPE_ALIASES[String(value || '').trim().toLowerCase()] || ''; }
  function workExpectedMs(type, puzzle) {
    if (type === 'math24') return 120000;
    if (type === 'sudoku') return 600000;
    if (type === 'knights') return Math.max(90000, int(puzzle && puzzle.count, 4) * 30000);
    if (type === 'calculator') return Math.max(60000, int(puzzle && puzzle.stepLimit, 4) * 12000);
    return Math.max(180000, int(puzzle && puzzle.width, 6) * int(puzzle && puzzle.height, 4) * 7000);
  }
  function workDifficulty(type, puzzle) {
    const p = puzzle || {};
    if (type === 'math24') return 2.5 + (p.decimal ? 1.5 : 0) + (p.noSolution ? 1.8 : 0);
    if (type === 'sudoku') return 4.2 + Math.max(0, int(p.blankCount, 43) - 43) * 0.08;
    if (type === 'knights') return 3.2 + Math.max(0, int(p.count, 4) - 3) * 0.65;
    if (type === 'creek') return 3.6 + Math.max(0, int(p.width, 6) * int(p.height, 4) - 24) * 0.08;
    if (type === 'calculator') return 2.8 + Math.max(0, int(p.stepLimit, 3) - 3) * 0.35 + Math.max(0, (p.options || []).length - 3) * 0.25 + (p.special ? 0.8 : 0);
    return 0;
  }
  function workDifficultyLabel(score) {
    const value = Number(score) || 0;
    if (value >= 9) return '地狱';
    if (value >= 7.5) return '专家';
    if (value >= 5.5) return '困难';
    if (value >= 3.5) return '标准';
    return '热身';
  }
  function workReward(session, duration) {
    const elapsed = Math.max(1000, Number(duration) || 0);
    const puzzle = session.puzzle || {};
    const score = Number(session.difficultyScore) || workDifficulty(session.type, puzzle);
    const difficultyReward = Math.max(1, Math.floor(score * 3));
    const timeFloor = Math.max(1, Math.floor(elapsed * 200 / 3600000));
    const reward = difficultyReward + timeFloor;
    return session.isExpert ? Math.min(100, Math.max(1, reward + 12)) : reward;
  }
  function workShuffle(list) {
    const output = list.slice();
    for (let i = output.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const temp = output[i]; output[i] = output[j]; output[j] = temp; }
    return output;
  }
  function workMathSolve(numbers) {
    const epsilon = 1e-9; const memo = {};
    function search(items) {
      const key = items.map((item) => `${item.value.toFixed(9)}:${item.decimal ? 1 : 0}`).sort().join('|');
      if (memo[key]) return memo[key];
      if (items.length === 1) {
        const item = items[0];
        if (Math.abs(item.value - 24) < epsilon) return (memo[key] = item);
        return null;
      }
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const left = items[i]; const right = items[j]; const rest = items.filter((_, index) => index !== i && index !== j);
        const candidates = [
          [left.value + right.value, `(${left.expr}+${right.expr})`],
          [left.value * right.value, `(${left.expr}*${right.expr})`],
          [left.value - right.value, `(${left.expr}-${right.expr})`],
          [right.value - left.value, `(${right.expr}-${left.expr})`]
        ];
        if (Math.abs(right.value) > epsilon) candidates.push([left.value / right.value, `(${left.expr}/${right.expr})`]);
        if (Math.abs(left.value) > epsilon) candidates.push([right.value / left.value, `(${right.expr}/${left.expr})`]);
        for (const pair of candidates) {
          if (!Number.isFinite(pair[0]) || Math.abs(pair[0]) > 1000000) continue;
          const decimal = left.decimal || right.decimal || Math.abs(pair[0] - Math.round(pair[0])) > epsilon;
          const found = search(rest.concat([{ value: pair[0], expr: pair[1], decimal }]));
          if (found) return (memo[key] = found);
        }
      }
      memo[key] = null; return null;
    }
    const start = numbers.map((value) => ({ value, expr: String(value), decimal: false }));
    const solution = search(start);
    if (!solution) return { answer: '', noSolution: true, decimal: false };
    const integerMemo = {};
    function searchInteger(items) {
      const key = items.map((item) => `${item.value.toFixed(9)}`).sort().join('|');
      if (integerMemo[key]) return integerMemo[key];
      if (items.length === 1) return Math.abs(items[0].value - 24) < epsilon ? items[0] : null;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i]; const b = items[j]; const rest = items.filter((_, index) => index !== i && index !== j);
        const candidates = [[a.value + b.value, `(${a.expr}+${b.expr})`], [a.value * b.value, `(${a.expr}*${b.expr})`], [a.value - b.value, `(${a.expr}-${b.expr})`], [b.value - a.value, `(${b.expr}-${a.expr})`]];
        if (Math.abs(b.value) > epsilon && Math.abs(a.value / b.value - Math.round(a.value / b.value)) < epsilon) candidates.push([a.value / b.value, `(${a.expr}/${b.expr})`]);
        if (Math.abs(a.value) > epsilon && Math.abs(b.value / a.value - Math.round(b.value / a.value)) < epsilon) candidates.push([b.value / a.value, `(${b.expr}/${a.expr})`]);
        for (const pair of candidates) { if (!Number.isFinite(pair[0])) continue; const found = searchInteger(rest.concat([{ value: pair[0], expr: pair[1] }])); if (found) return (integerMemo[key] = found); }
      }
      integerMemo[key] = null; return null;
    }
    return { answer: (searchInteger(start) || solution).expr, noSolution: false, decimal: !searchInteger(start) };
  }
  function workMathPuzzle() {
    let selected = null;
    for (let attempt = 0; attempt < 80; attempt++) {
      const sample = Math.random();
      let numbers;
      if (sample === 0) numbers = [1, 5, 5, 5];
      else if (sample >= 0.35 && sample < 0.45) numbers = [1, 1, 1, 1];
      else numbers = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 13));
      const solved = workMathSolve(numbers);
      if (solved.noSolution && (numbers.every((value) => value === 1) || Math.random() < 0.2)) { selected = { numbers, ...solved }; break; }
      if (!solved.noSolution && (solved.decimal || Math.random() < 0.75)) { selected = { numbers, ...solved }; break; }
    }
    if (!selected) { const numbers = [1, 1, 1, 1]; selected = { numbers, ...workMathSolve(numbers) }; }
    return { numbers: selected.numbers, target: 24, answer: selected.answer, decimal: !!selected.decimal, noSolution: !!selected.noSolution };
  }
  const CALCULATOR_LEVELS = [{"level":1,"target":8,"stepLimit":3,"current":0,"options":["+2","+3"],"portal":[0,0]},{"level":2,"target":200,"stepLimit":4,"current":0,"options":["+10","*4"],"portal":[0,0]},{"level":3,"target":24,"stepLimit":3,"current":2,"options":["*2","*3"],"portal":[0,0]},{"level":4,"target":4,"stepLimit":4,"current":125,"options":["<<","*2"],"portal":[0,0]},{"level":5,"target":5,"stepLimit":4,"current":125,"options":["<<","*2"],"portal":[0,0]},{"level":6,"target":95,"stepLimit":3,"current":25,"options":["push5","+4","/5"],"portal":[0,0]},{"level":7,"target":59,"stepLimit":3,"current":25,"options":["push5","+4","/5"],"portal":[0,0]},{"level":8,"target":32,"stepLimit":4,"current":155,"options":["push2","*2","<<"],"portal":[0,0]},{"level":9,"target":24,"stepLimit":4,"current":155,"options":["push2","*2","<<"],"portal":[0,0]},{"level":10,"target":144,"stepLimit":3,"current":11,"options":["push2","*12","<<"],"portal":[0,0]},{"level":11,"target":3,"stepLimit":4,"current":15,"options":["push6","+5","<<","/7"],"portal":[0,0]},{"level":12,"target":96,"stepLimit":3,"current":200,"options":["push1","+12","*3","<<"],"portal":[0,0]},{"level":13,"target":63,"stepLimit":3,"current":200,"options":["push1","+12","*3","<<"],"portal":[0,0]},{"level":14,"target":33,"stepLimit":4,"current":200,"options":["push1","+12","*3","<<"],"portal":[0,0]},{"level":15,"target":62,"stepLimit":3,"current":550,"options":["+6","1=>2","<<"],"portal":[0,0]},{"level":16,"target":321,"stepLimit":4,"current":123,"options":["2=>3","13=>21"],"portal":[0,0]},{"level":17,"target":1970,"stepLimit":3,"current":1985,"options":["sort>","*2","<<"],"portal":[0,0]},{"level":18,"target":1234,"stepLimit":3,"current":16,"options":["sort>","*2","push7"],"portal":[0,0]},{"level":19,"target":333,"stepLimit":4,"current":4321,"options":["sort<","2=>3","1=>3","<<"],"portal":[0,0]},{"level":20,"target":275,"stepLimit":4,"current":97231,"options":["sort<","<<","9=>5"],"portal":[0,0]},{"level":21,"target":19,"stepLimit":3,"current":303,"options":["sort<","+1","*3"],"portal":[0,0]},{"level":22,"target":100,"stepLimit":3,"current":303,"options":["sort<","+1","*3"],"portal":[0,0]},{"level":23,"target":111,"stepLimit":4,"current":423,"options":["sort<","/2","<<","push1"],"portal":[0,0]},{"level":24,"target":123,"stepLimit":4,"current":423,"options":["sort<","/2","<<","push1"],"portal":[0,0]},{"level":25,"target":963,"stepLimit":4,"current":30,"options":["sort>","/5","+6","push3"],"portal":[0,0]},{"level":26,"target":321,"stepLimit":4,"current":30,"options":["sort>","/5","+6","push3"],"portal":[0,0]},{"level":27,"target":4,"stepLimit":3,"current":3,"options":["+4","*4","/4"],"portal":[0,0]},{"level":28,"target":5,"stepLimit":3,"current":4,"options":["+3","*3","/3"],"portal":[0,0]},{"level":29,"target":9,"stepLimit":4,"current":50,"options":["/5","*3","<<"],"portal":[0,0]},{"level":30,"target":100,"stepLimit":3,"current":99,"options":["-8","*11","<<"],"portal":[0,0]},{"level":31,"target":23,"stepLimit":4,"current":171,"options":["*2","-9","<<"],"portal":[0,0]},{"level":32,"target":24,"stepLimit":6,"current":0,"options":["+5","*3","*5","<<"],"portal":[0,0]},{"level":33,"target":2,"stepLimit":5,"current":0,"options":["+4","*9","<<"],"portal":[0,0]},{"level":34,"target":9,"stepLimit":4,"current":0,"options":["+2","/3","push1"],"portal":[0,0]},{"level":35,"target":10,"stepLimit":4,"current":15,"options":["push0","+2","/5"],"portal":[0,0]},{"level":36,"target":93,"stepLimit":4,"current":0,"options":["+6","*7","6=>9"],"portal":[0,0]},{"level":37,"target":2321,"stepLimit":6,"current":0,"options":["push1","push2","1=>2","2=>3"],"portal":[0,0]},{"level":38,"target":24,"stepLimit":5,"current":0,"options":["+9","*2","8=>4"],"portal":[0,0]},{"level":39,"target":29,"stepLimit":5,"current":11,"options":["/2","+3","1=>2","2=>9"],"portal":[0,0]},{"level":40,"target":20,"stepLimit":5,"current":36,"options":["+3","/3","1=>2"],"portal":[0,0]},{"level":41,"target":15,"stepLimit":4,"current":2,"options":["/3","push1","*2","4=>5"],"portal":[0,0]},{"level":42,"target":414,"stepLimit":4,"current":1234,"options":["23=>41","24=>14","12=>24","14=>2"],"portal":[0,0]},{"level":43,"target":-85,"stepLimit":4,"current":0,"options":["+6","push5","-7"],"portal":[0,0]},{"level":44,"target":9,"stepLimit":3,"current":0,"options":["-1","-2","^2"],"portal":[0,0]},{"level":45,"target":-13,"stepLimit":4,"current":0,"options":["+3","-7","+/-"],"portal":[0,0]},{"level":46,"target":52,"stepLimit":5,"current":44,"options":["+9","/2","*4","+/-"],"portal":[0,0]},{"level":47,"target":10,"stepLimit":5,"current":9,"options":["+5","*5","+/-"],"portal":[0,0]},{"level":48,"target":12,"stepLimit":5,"current":14,"options":["push6","+5","/8","+/-"],"portal":[0,0]},{"level":49,"target":13,"stepLimit":4,"current":55,"options":["+9","+/-","<<"],"portal":[0,0]},{"level":50,"target":245,"stepLimit":5,"current":0,"options":["-3","push5","*4","+/-"],"portal":[0,0]},{"level":51,"target":126,"stepLimit":6,"current":111,"options":["*3","-9","+/-","<<"],"portal":[0,0]},{"level":52,"target":3,"stepLimit":5,"current":34,"options":["-5","+8","/7","+/-"],"portal":[0,0]},{"level":53,"target":4,"stepLimit":5,"current":25,"options":["-4","*-4","/3","/8"],"portal":[0,0]},{"level":54,"target":101,"stepLimit":3,"current":100,"options":["push1","+9","rev"],"portal":[0,0]},{"level":55,"target":51,"stepLimit":3,"current":0,"options":["+6","+9","rev"],"portal":[0,0]},{"level":56,"target":101,"stepLimit":3,"current":100,"options":["push1","+9","rev"],"portal":[0,0]},{"level":57,"target":100,"stepLimit":4,"current":1101,"options":["-1","rev"],"portal":[0,0]},{"level":58,"target":58,"stepLimit":4,"current":0,"options":["+4","*4","-3","rev"],"portal":[0,0]},{"level":59,"target":21,"stepLimit":3,"current":15,"options":["+9","*5","rev"],"portal":[0,0]},{"level":60,"target":13,"stepLimit":5,"current":100,"options":["/2","rev"],"portal":[0,0]},{"level":61,"target":102,"stepLimit":4,"current":0,"options":["push10","*4","+5","rev"],"portal":[0,0]},{"level":62,"target":7,"stepLimit":4,"current":0,"options":["push2","+1","/3","rev"],"portal":[0,0]},{"level":63,"target":9,"stepLimit":5,"current":8,"options":["*3","push1","/5","rev"],"portal":[0,0]},{"level":64,"target":13,"stepLimit":5,"current":0,"options":["+7","+8","+9","rev"],"portal":[0,0]},{"level":65,"target":123,"stepLimit":6,"current":0,"options":["+3","push1","-2","rev"],"portal":[0,0]},{"level":66,"target":424,"stepLimit":5,"current":0,"options":["push6","+8","rev"],"portal":[0,0]},{"level":67,"target":81,"stepLimit":5,"current":7,"options":["-9","*3","+4","+/-","rev"],"portal":[0,0]},{"level":68,"target":-43,"stepLimit":5,"current":0,"options":["-5","+7","-9","rev"],"portal":[0,0]},{"level":69,"target":28,"stepLimit":7,"current":0,"options":["+6","-3","rev","<<"],"portal":[0,0]},{"level":70,"target":136,"stepLimit":5,"current":0,"options":["push1","+2","*3","rev"],"portal":[0,0]},{"level":71,"target":-25,"stepLimit":5,"current":0,"options":["+4","rev","+/-","*3"],"portal":[0,0]},{"level":72,"target":-5,"stepLimit":5,"current":0,"options":["+7","*3","rev","+/-"],"portal":[0,0]},{"level":73,"target":41,"stepLimit":4,"current":88,"options":["/4","-4","rev"],"portal":[0,0]},{"level":74,"target":101,"stepLimit":5,"current":100,"options":["push0","*2","2=>10","0=>1","rev"],"portal":[0,0]},{"level":75,"target":424,"stepLimit":7,"current":0,"options":["/2","push5","5=>4","rev"],"portal":[0,0]},{"level":76,"target":100,"stepLimit":5,"current":99,"options":["push9","/9","rev","1=>0"],"portal":[0,0]},{"level":77,"target":30,"stepLimit":5,"current":8,"options":["push2","-4","2=>3","rev"],"portal":[0,0]},{"level":78,"target":222,"stepLimit":5,"current":101,"options":["-1","rev","0=>2"],"portal":[0,0]},{"level":79,"target":500,"stepLimit":5,"current":36,"options":["*4","/3","1=>5","rev"],"portal":[0,0]},{"level":80,"target":196,"stepLimit":8,"current":0,"options":["push1","+12","*13","rev","<<"],"portal":[0,0]},{"level":81,"target":101,"stepLimit":5,"current":50,"options":["1=>10","+50","rev","5=>1"],"portal":[0,0]},{"level":82,"target":2048,"stepLimit":6,"current":1,"options":["push2","*4","*10","rev"],"portal":[0,0]},{"level":83,"target":123,"stepLimit":5,"current":12,"options":["push12","+1","12=>2","rev"],"portal":[0,0]},{"level":84,"target":55,"stepLimit":6,"current":86,"options":["+2","+14","rev","0=>5"],"portal":[0,0]},{"level":85,"target":4,"stepLimit":3,"current":1231,"options":["sum","3=>1","2=>3"],"portal":[0,0]},{"level":86,"target":45,"stepLimit":5,"current":0,"options":["*9","push4","*3","3=>5","sum"],"portal":[0,0]},{"level":87,"target":28,"stepLimit":5,"current":424,"options":["*4","4=>6","sum"],"portal":[0,0]},{"level":88,"target":8,"stepLimit":4,"current":3,"options":["push3","+33","sum","3=>1"],"portal":[0,0]},{"level":89,"target":44,"stepLimit":4,"current":24,"options":["/2","push4","1=>2","sum"],"portal":[0,0]},{"level":90,"target":143,"stepLimit":4,"current":142,"options":["*9","+9","44=>43","sum"],"portal":[0,0]},{"level":91,"target":1,"stepLimit":5,"current":24,"options":["/3","*4","5=>10","sum"],"portal":[0,0]},{"level":92,"target":100,"stepLimit":5,"current":4,"options":["push3","*3","+1","sum"],"portal":[0,0]},{"level":93,"target":8,"stepLimit":5,"current":93,"options":["+4","*3","sum"],"portal":[0,0]},{"level":94,"target":16,"stepLimit":5,"current":5,"options":["*5","/2","sum","5=>2"],"portal":[0,0]},{"level":95,"target":64,"stepLimit":4,"current":128,"options":["*4","/4","sum","5=>16"],"portal":[0,0]},{"level":96,"target":121,"stepLimit":6,"current":59,"options":["push1","*5","15=>51","sum"],"portal":[0,0]},{"level":97,"target":5,"stepLimit":6,"current":18,"options":["*2","/3","12=>21","sum"],"portal":[0,0]},{"level":98,"target":30,"stepLimit":4,"current":9,"options":["-5","*-6","+/-","sum"],"portal":[0,0]},{"level":99,"target":-17,"stepLimit":5,"current":105,"options":["-5","/5","*4","+/-","sum"],"portal":[0,0]},{"level":100,"target":11,"stepLimit":6,"current":36,"options":["-6","/3","+/-","sum"],"portal":[0,0]},{"level":101,"target":64,"stepLimit":5,"current":3,"options":["+3","sum","^3","0=>1"],"portal":[0,0]},{"level":102,"target":11,"stepLimit":5,"current":2,"options":["*2","push10","sum","^3","10=>1"],"portal":[0,0]},{"level":103,"target":121,"stepLimit":3,"current":101,"options":["+2","shift>","<shift"],"portal":[0,0]},{"level":104,"target":1999,"stepLimit":4,"current":98,"options":["push1","push9","89=>99","shift>"],"portal":[0,0]},{"level":105,"target":129,"stepLimit":4,"current":70,"options":["*3","push9","shift>"],"portal":[0,0]},{"level":106,"target":210,"stepLimit":5,"current":120,"options":["+1","<shift","+/-"],"portal":[0,0]},{"level":107,"target":210,"stepLimit":5,"current":1001,"options":["+2","shift>","12=>0"],"portal":[0,0]},{"level":108,"target":501,"stepLimit":3,"current":100,"options":["+5","push0","<shift"],"portal":[0,0]},{"level":109,"target":3,"stepLimit":4,"current":212,"options":["+11","3=>1","sum","<shift"],"portal":[0,0]},{"level":110,"target":121,"stepLimit":4,"current":356,"options":["-2","/3","shift>"],"portal":[0,0]},{"level":111,"target":13,"stepLimit":6,"current":2152,"options":["25=>12","21=>3","12=>5","shift>","rev"],"portal":[0,0]},{"level":112,"target":520,"stepLimit":5,"current":1025,"options":["shift>","50=>0","25=>525","51=>5"],"portal":[0,0]},{"level":113,"target":19,"stepLimit":6,"current":91,"options":["+5","mir","sum"],"portal":[0,0]},{"level":114,"target":116,"stepLimit":4,"current":22,"options":["-3","push6","mir","sum"],"portal":[0,0]},{"level":115,"target":20,"stepLimit":7,"current":125,"options":["6=>2","push0","mir","sum"],"portal":[0,0]},{"level":116,"target":3,"stepLimit":4,"current":22,"options":["sum","/2","mir","<<"],"portal":[0,0]},{"level":117,"target":1111,"stepLimit":5,"current":0,"options":["+2","*6","mir","21=>11"],"portal":[0,0]},{"level":118,"target":2020,"stepLimit":8,"current":-1,"options":["*3","+8","+2","rev","mir"],"portal":[0,0]},{"level":119,"target":112,"stepLimit":6,"current":13,"options":["99=>60","/3","*3","mir","shift>"],"portal":[0,0]},{"level":120,"target":18,"stepLimit":5,"current":140,"options":["-3","+9","/12","mir","<<"],"portal":[0,0]},{"level":121,"target":33,"stepLimit":4,"current":17,"options":["*2","-4","mir","<shift"],"portal":[0,0]},{"level":122,"target":20,"stepLimit":7,"current":125,"options":["mir","sum"],"portal":[0,0]},{"level":123,"target":14,"stepLimit":4,"current":0,"options":["push1","+2","[+]1"],"portal":[0,0]},{"level":124,"target":101,"stepLimit":5,"current":0,"options":["push2","+5","[+]2"],"portal":[0,0]},{"level":125,"target":28,"stepLimit":5,"current":0,"options":["push1","+2","[+]3"],"portal":[0,0]},{"level":126,"target":42,"stepLimit":5,"current":0,"options":["-2","+5","*2","[+]1"],"portal":[0,0]},{"level":127,"target":25,"stepLimit":5,"current":0,"options":["+2","*3","-3","[+]2"],"portal":[0,0]},{"level":128,"target":41,"stepLimit":4,"current":5,"options":["+4","+8","*3","[+]2"],"portal":[0,0]},{"level":129,"target":31,"stepLimit":5,"current":33,"options":["*4","+2","+3","[+]1","sum"],"portal":[0,0]},{"level":130,"target":268,"stepLimit":5,"current":25,"options":["+8","*2","*5","[+]1"],"portal":[0,0]},{"level":131,"target":121,"stepLimit":4,"current":0,"options":["+1","store"],"portal":[0,0]},{"level":132,"target":122,"stepLimit":4,"current":12,"options":["store","rev","<<"],"portal":[0,0]},{"level":133,"target":17,"stepLimit":5,"current":0,"options":["+2","/3","rev","store"],"portal":[0,0]},{"level":134,"target":1234,"stepLimit":4,"current":23,"options":["*2","-5","store","<shift"],"portal":[0,0]},{"level":135,"target":1025,"stepLimit":6,"current":125,"options":["*2","store","<<"],"portal":[0,0]},{"level":136,"target":115,"stepLimit":5,"current":23,"options":["-8","store","+/-"],"portal":[0,0]},{"level":137,"target":16,"stepLimit":4,"current":15,"options":["store","11=>33","rev","sum"],"portal":[0,0]},{"level":138,"target":61,"stepLimit":7,"current":0,"options":["push5","<<","sum","store"],"portal":[0,0]},{"level":139,"target":101,"stepLimit":5,"current":0,"options":["*6","push5","shift>","store","3=>1"],"portal":[0,0]},{"level":140,"target":12525,"stepLimit":5,"current":125,"options":["push1","/5","rev","store"],"portal":[0,0]},{"level":141,"target":17,"stepLimit":6,"current":70,"options":["8=>1","/2","push0","store","sum"],"portal":[0,0]},{"level":142,"target":101,"stepLimit":4,"current":12,"options":["21=>0","12=>1","store","mir"],"portal":[0,0]},{"level":143,"target":3001,"stepLimit":7,"current":9,"options":["39=>93","/3","store","31=>00"],"portal":[0,0]},{"level":144,"target":2,"stepLimit":3,"current":1,"options":["-1","inv10"],"portal":[0,0]},{"level":145,"target":15,"stepLimit":3,"current":14,"options":["+5","*5","inv10"],"portal":[0,0]},{"level":146,"target":12,"stepLimit":3,"current":21,"options":["-7","*5","inv10"],"portal":[0,0]},{"level":147,"target":13,"stepLimit":4,"current":67,"options":["+3","rev","inv10"],"portal":[0,0]},{"level":148,"target":88,"stepLimit":5,"current":23,"options":["-4","-2","rev","inv10"],"portal":[0,0]},{"level":149,"target":105,"stepLimit":4,"current":5,"options":["*3","/9","store","inv10"],"portal":[0,0]},{"level":150,"target":23,"stepLimit":4,"current":24,"options":["+6","*3","rev","inv10"],"portal":[0,0]},{"level":151,"target":17,"stepLimit":4,"current":7,"options":["+3","*3","*4","inv10"],"portal":[0,0]},{"level":152,"target":21,"stepLimit":5,"current":35,"options":["*9","/5","13=>10","inv10"],"portal":[0,0]},{"level":153,"target":18,"stepLimit":5,"current":9,"options":["*3","sum","inv10"],"portal":[0,0]},{"level":154,"target":101,"stepLimit":5,"current":12,"options":["+4","inv10","sum"],"portal":[0,0]},{"level":155,"target":99,"stepLimit":6,"current":26,"options":["push2","sum","inv10"],"portal":[0,0]},{"level":156,"target":13,"stepLimit":7,"current":15,"options":["sum","inv10","mir"],"portal":[0,0]},{"level":157,"target":99,"stepLimit":6,"current":78,"options":["1=>6","6=>11","/6","inv10","rev"],"portal":[0,0]},{"level":158,"target":9,"stepLimit":4,"current":34,"options":["*6","inv10","<<"],"portal":[0,0]},{"level":159,"target":872,"stepLimit":8,"current":0,"options":["push8","88=>34","inv10","<<"],"portal":[0,0]},{"level":160,"target":33,"stepLimit":5,"current":5,"options":["*7","+8","-9","*2","inv10"],"portal":[0,0]},{"level":161,"target":23,"stepLimit":4,"current":12,"options":["*5","sum","store","inv10"],"portal":[0,0]},{"level":162,"target":1991,"stepLimit":4,"current":1,"options":["store","inv10"],"portal":[0,0]},{"level":163,"target":26,"stepLimit":4,"current":12,"options":["<<","sum","store","inv10"],"portal":[0,0]},{"level":164,"target":48,"stepLimit":6,"current":51,"options":["+6","*3","inv10","rev","4=>6"],"portal":[0,0]},{"level":165,"target":1,"stepLimit":6,"current":0,"options":["+5","*3","/6","inv10","rev"],"portal":[0,0]},{"level":166,"target":777,"stepLimit":5,"current":369,"options":["99=>63","63=>33","inv10","36=>93","39=>33"],"portal":[0,0]},{"level":167,"target":10,"stepLimit":3,"current":99,"options":["push1","-1"],"portal":[3,1]},{"level":168,"target":64,"stepLimit":2,"current":9,"options":["push4","push6"],"portal":[3,2]},{"level":169,"target":35,"stepLimit":3,"current":50,"options":["+5","*3","*5"],"portal":[3,2]},{"level":170,"target":131,"stepLimit":4,"current":306,"options":["push3","+1","*2"],"portal":[4,1]},{"level":171,"target":123,"stepLimit":5,"current":321,"options":["/2","push1","push3","push0"],"portal":[4,1]},{"level":172,"target":150,"stepLimit":4,"current":525,"options":["+1","push6","push7","/2"],"portal":[4,1]},{"level":173,"target":212,"stepLimit":4,"current":301,"options":["push10","-2","push3"],"portal":[4,1]},{"level":174,"target":13,"stepLimit":4,"current":99,"options":["sum","mir","inv10"],"portal":[4,2]},{"level":175,"target":822,"stepLimit":5,"current":25,"options":["mir","push5","store","<<"],"portal":[4,2]},{"level":176,"target":516,"stepLimit":4,"current":45,"options":["+10","mir","rev"],"portal":[4,2]},{"level":177,"target":212,"stepLimit":4,"current":238,"options":["28=>21","-5","inv10","shift>"],"portal":[0,0]},{"level":178,"target":90,"stepLimit":5,"current":58,"options":["*6","inv10","shift>"],"portal":[0,0]},{"level":179,"target":500,"stepLimit":5,"current":189,"options":["+8","*4","push9","inv10","7=>0"],"portal":[4,1]},{"level":180,"target":321,"stepLimit":4,"current":234,"options":["push9","+9","53=>32"],"portal":[4,1]},{"level":181,"target":123,"stepLimit":4,"current":333,"options":["push1","push3","/2","[+]1"],"portal":[4,1]},{"level":182,"target":777,"stepLimit":3,"current":613,"options":["push5","*2","+3","rev","inv10"],"portal":[4,1]},{"level":183,"target":550,"stepLimit":6,"current":60,"options":["+5","*5","push2","inv10"],"portal":[4,2]},{"level":184,"target":4321,"stepLimit":5,"current":1234,"options":["24=>13","12=>32","13=>21","23=>32","23=>43"],"portal":[0,0]},{"level":185,"target":750,"stepLimit":6,"current":4,"options":["+6","push4","*3","inv10"],"portal":[4,2]},{"level":186,"target":3507,"stepLimit":6,"current":3002,"options":["push7","3=>5","inv10","shift>"],"portal":[5,1]},{"level":187,"target":21,"stepLimit":3,"current":0,"options":["+15","sum"],"portal":[0,0]},{"level":188,"target":1,"stepLimit":3,"current":20,"options":["cut1","*5","+1"],"portal":[0,0]},{"level":189,"target":2,"stepLimit":3,"current":33,"options":["cut1","+3","*3"],"portal":[0,0]},{"level":190,"target":6,"stepLimit":4,"current":4454,"options":["cut4","+2","+4","<<"],"portal":[0,0]},{"level":191,"target":72,"stepLimit":3,"current":6996,"options":["+3","cut9"],"portal":[0,0]},{"level":192,"target":15,"stepLimit":3,"current":12345,"options":["cut1","/3"],"portal":[0,0]},{"level":193,"target":2,"stepLimit":5,"current":99999,"options":["cut1","9=>3","3=>1","-8"],"portal":[0,0]},{"level":194,"target":123,"stepLimit":2,"current":10203,"options":["(del)"],"portal":[0,0]},{"level":195,"target":40,"stepLimit":3,"current":55,"options":["*2","*4","(del)"],"portal":[0,0]},{"level":196,"target":234,"stepLimit":2,"current":4,"options":["(insert2)","(insert3)","(insert34)"],"portal":[0,0]},{"level":197,"target":48,"stepLimit":3,"current":14,"options":["(del)","(insert2)","*2"],"portal":[0,0]},{"level":198,"target":120,"stepLimit":3,"current":1,"options":["(insert2)","*5","*4"],"portal":[0,0]},{"level":199,"target":45,"stepLimit":3,"current":3,"options":["+2","*3","(insert1)"],"portal":[0,0]},{"level":200,"target":7,"stepLimit":3,"current":4505,"options":["(insert2)","cut5","+2","(del)"],"portal":[0,0]},{"level":201,"target":3,"stepLimit":3,"current":64,"options":["rev","-2","/2"],"portal":[0,0]},{"level":202,"target":21,"stepLimit":3,"current":64,"options":["rev","-2","/2"],"portal":[0,0]},{"level":203,"target":52,"stepLimit":4,"current":12,"options":["rev","*5","(del)"],"portal":[0,0]},{"level":204,"target":15,"stepLimit":3,"current":12,"options":["rev","*5","(del)"],"portal":[0,0]},{"level":205,"target":555,"stepLimit":3,"current":125,"options":["rev","2=>5","+1"],"portal":[0,0]},{"level":206,"target":11,"stepLimit":4,"current":84,"options":["rev","+2","cut4","(insert1)"],"portal":[0,0]},{"level":207,"target":2,"stepLimit":4,"current":84,"options":["rev","+2","cut4","(insert1)"],"portal":[0,0]},{"level":208,"target":200,"stepLimit":2,"current":10,"options":["(round)","(insert5)"],"portal":[0,0]},{"level":209,"target":1000,"stepLimit":2,"current":90,"options":["(round)","(insert5)"],"portal":[0,0]},{"level":210,"target":40,"stepLimit":3,"current":24,"options":["(round)","4=>3","*2"],"portal":[0,0]},{"level":211,"target":500,"stepLimit":2,"current":2150,"options":["(round)","rev"],"portal":[0,0]},{"level":212,"target":1600,"stepLimit":3,"current":35,"options":["(round)","*5","5=>12"],"portal":[0,0]},{"level":213,"target":44,"stepLimit":3,"current":352,"options":["(round)","rev","push4"],"portal":[0,0]},{"level":214,"target":900,"stepLimit":3,"current":2189,"options":["(round)","rev","+1"],"portal":[0,0]},{"level":215,"target":2222,"stepLimit":2,"current":2024,"options":["(+2)","(-2)"],"portal":[0,0]},{"level":216,"target":18,"stepLimit":3,"current":21,"options":["(+2)","4=>8","rev"],"portal":[0,0]},{"level":217,"target":136,"stepLimit":3,"current":100,"options":["(+2)","+8"],"portal":[0,0]},{"level":218,"target":0,"stepLimit":2,"current":25,"options":["(+5)","+25"],"portal":[0,0]},{"level":219,"target":90,"stepLimit":3,"current":12,"options":["(+4)","*4","+2"],"portal":[0,0]},{"level":220,"target":1000,"stepLimit":3,"current":555,"options":["(+9)","*2"],"portal":[0,0]},{"level":221,"target":900,"stepLimit":3,"current":555,"options":["(+9)","*2"],"portal":[0,0]},{"level":222,"target":250,"stepLimit":4,"current":50,"options":["(+4)","(del)","(insert1)","*4"],"portal":[0,0]},{"level":223,"target":500,"stepLimit":4,"current":50,"options":["(+4)","(del)","(insert1)","*4"],"portal":[0,0]},{"level":224,"target":3456,"stepLimit":4,"current":650,"options":["(-2)","(insert3)"],"portal":[0,0]},{"level":225,"target":1750,"stepLimit":4,"current":1990,"options":["(+8)","(del)","(+5)","(round)"],"portal":[0,0]},{"level":226,"target":150,"stepLimit":4,"current":1990,"options":["(+8)","(del)","(+5)","(round)"],"portal":[0,0]},{"level":227,"target":-6,"stepLimit":4,"current":62,"options":["+/-","(+2)","-12"],"portal":[0,0]},{"level":228,"target":-12,"stepLimit":4,"current":208,"options":["+/-","+2","(del)","/2"],"portal":[0,0]},{"level":229,"target":-8,"stepLimit":5,"current":47,"options":["+/-","+5","/2"],"portal":[0,0]},{"level":230,"target":14,"stepLimit":5,"current":10,"options":["+/-","+8","*3"],"portal":[0,0]},{"level":231,"target":66,"stepLimit":5,"current":10,"options":["+/-","+8","*3"],"portal":[0,0]},{"level":232,"target":40,"stepLimit":5,"current":41,"options":["+/-","push1","<<","+2"],"portal":[0,0]},{"level":233,"target":21,"stepLimit":5,"current":41,"options":["+/-","push1","<<","+2"],"portal":[0,0]},{"level":234,"target":151,"stepLimit":3,"current":121,"options":["(move)","+3"],"portal":[0,0]},{"level":235,"target":5,"stepLimit":3,"current":84,"options":["(move)","+2"],"portal":[0,0]},{"level":236,"target":125,"stepLimit":2,"current":215,"options":["(move)","rev"],"portal":[0,0]},{"level":237,"target":678,"stepLimit":3,"current":918,"options":["(move)","<<","1=>67"],"portal":[0,0]},{"level":238,"target":306,"stepLimit":2,"current":1206,"options":["(move)","/2"],"portal":[0,0]},{"level":239,"target":22,"stepLimit":3,"current":55,"options":["(move)","*2"],"portal":[0,0]},{"level":240,"target":102,"stepLimit":4,"current":214,"options":["(move)","-1","/2"],"portal":[0,0]},{"level":241,"target":25,"stepLimit":4,"current":5252,"options":["(move)","cut1","25=>15","52=>12"],"portal":[0,0]},{"level":242,"target":305,"stepLimit":5,"current":152,"options":["(move)","+2","rev","(round)"],"portal":[0,0]},{"level":243,"target":0,"stepLimit":3,"current":1213,"options":["sum","cut1","+4"],"portal":[0,0]},{"level":244,"target":8,"stepLimit":4,"current":1111,"options":["sum","*4","push1"],"portal":[0,0]},{"level":245,"target":35,"stepLimit":5,"current":5000,"options":["sum","rev","+4"],"portal":[0,0]},{"level":246,"target":1199,"stepLimit":5,"current":90,"options":["mir","<shift","push10"],"portal":[0,0]},{"level":247,"target":2112,"stepLimit":4,"current":123,"options":["mir","sum","rev"],"portal":[0,0]},{"level":248,"target":1000,"stepLimit":4,"current":201,"options":["mir","rev","cut2","-1"],"portal":[0,0]},{"level":249,"target":3223,"stepLimit":4,"current":9933,"options":["mir","cut1","/3","31=>2"],"portal":[0,0]},{"level":250,"target":275,"stepLimit":5,"current":2,"options":["mir","rev","*5"],"portal":[0,0]},{"level":251,"target":360,"stepLimit":5,"current":10,"options":["[+]1","*2"],"portal":[0,0]},{"level":252,"target":15,"stepLimit":5,"current":3,"options":["[+]1","+2","mir","sum"],"portal":[0,0]},{"level":253,"target":20,"stepLimit":5,"current":10,"options":["[+]2","*3","cut1"],"portal":[0,0]},{"level":254,"target":123,"stepLimit":3,"current":82,"options":["[+]1","/2","*2"],"portal":[0,0]},{"level":255,"target":6,"stepLimit":5,"current":13,"options":["[+]1","(+2)","43=>2"],"portal":[0,0]},{"level":256,"target":1,"stepLimit":5,"current":222,"options":["[+]2","(insert3)","sum","56=>10"],"portal":[0,0]},{"level":257,"target":501,"stepLimit":1,"current":101,"options":["(rep5)","(rep55)"],"portal":[0,0]},{"level":258,"target":22,"stepLimit":4,"current":65,"options":["(rep6)","(+1)","+5","/5"],"portal":[0,0]},{"level":259,"target":64,"stepLimit":4,"current":20,"options":["(rep6)","mir","sum"],"portal":[0,0]},{"level":260,"target":332,"stepLimit":3,"current":144,"options":["(rep1)","/3","inv10"],"portal":[0,0]},{"level":261,"target":321,"stepLimit":3,"current":144,"options":["(rep1)","/3","inv10"],"portal":[0,0]},{"level":262,"target":82,"stepLimit":4,"current":108,"options":["(rep8)","+2","sum","mir"],"portal":[0,0]},{"level":263,"target":32,"stepLimit":4,"current":108,"options":["(rep8)","+2","sum","mir"],"portal":[0,0]},{"level":264,"target":181,"stepLimit":4,"current":108,"options":["(rep8)","+2","sum","mir"],"portal":[0,0]},{"level":265,"target":9,"stepLimit":4,"current":410,"options":["inv10","*3","sum","<<"],"portal":[0,0]},{"level":266,"target":7,"stepLimit":3,"current":13,"options":["inv10","/5","3=>5"],"portal":[0,0]},{"level":267,"target":19,"stepLimit":3,"current":13,"options":["inv10","/5","3=>5"],"portal":[0,0]},{"level":268,"target":13,"stepLimit":4,"current":180,"options":["inv10","sort<","+2","rev"],"portal":[0,0]},{"level":269,"target":8,"stepLimit":4,"current":180,"options":["inv10","sort<","+2","rev"],"portal":[0,0]},{"level":270,"target":50,"stepLimit":4,"current":154,"options":["inv10","9=>5","+6","(del)"],"portal":[0,0]},{"level":271,"target":40,"stepLimit":3,"current":154,"options":["inv10","9=>5","+6","(del)"],"portal":[0,0]},{"level":272,"target":1,"stepLimit":3,"current":369,"options":["inv10","sum","+2"],"portal":[0,0]},{"level":273,"target":99,"stepLimit":4,"current":369,"options":["inv10","sum","+2"],"portal":[0,0]},{"level":274,"target":80,"stepLimit":3,"current":369,"options":["inv10","sum","+2"],"portal":[0,0]},{"level":275,"target":66,"stepLimit":4,"current":145,"options":["inv10","sum","*3","(rep2)"],"portal":[0,0]},{"level":276,"target":40,"stepLimit":4,"current":145,"options":["inv10","sum","*3","(rep2)"],"portal":[0,0]},{"level":277,"target":60,"stepLimit":3,"current":475,"options":["inv10","<<","(rep2)","(round)"],"portal":[0,0]},{"level":278,"target":70,"stepLimit":4,"current":475,"options":["inv10","<<","(rep2)","(round)"],"portal":[0,0]},{"level":279,"target":80,"stepLimit":4,"current":475,"options":["inv10","<<","(rep2)","(round)"],"portal":[0,0]},{"level":280,"target":18,"stepLimit":4,"current":8,"options":["STORE","+2","<<"],"portal":[0,0]},{"level":281,"target":101,"stepLimit":4,"current":8,"options":["STORE","+2","<<"],"portal":[0,0]},{"level":282,"target":1212,"stepLimit":5,"current":33,"options":["STORE","sum"],"portal":[0,0]},{"level":283,"target":126,"stepLimit":5,"current":33,"options":["STORE","sum"],"portal":[0,0]},{"level":284,"target":12,"stepLimit":4,"current":10,"options":["STORE","(+5)","sum"],"portal":[0,0]},{"level":285,"target":710,"stepLimit":5,"current":10,"options":["STORE","(+5)","sum"],"portal":[0,0]},{"level":286,"target":2112,"stepLimit":4,"current":123,"options":["STORE","rev","<<"],"portal":[0,0]},{"level":287,"target":131,"stepLimit":5,"current":118,"options":["STORE","+2","<<"],"portal":[0,0]},{"level":288,"target":33,"stepLimit":6,"current":118,"options":["STORE","+2","<<"],"portal":[0,0]},{"level":289,"target":123,"stepLimit":6,"current":118,"options":["STORE","+2","<<"],"portal":[0,0]},{"level":290,"target":25,"stepLimit":2,"current":15,"options":["(lock)","+12"],"portal":[0,0]},{"level":291,"target":28,"stepLimit":2,"current":125,"options":["(lock)","sum"],"portal":[0,0]},{"level":292,"target":108,"stepLimit":2,"current":125,"options":["(lock)","sum"],"portal":[0,0]},{"level":293,"target":2400,"stepLimit":3,"current":1975,"options":["(lock)","(round)","(+5)"],"portal":[0,0]},{"level":294,"target":7070,"stepLimit":3,"current":1975,"options":["(lock)","(round)","(+5)"],"portal":[0,0]},{"level":295,"target":2222,"stepLimit":3,"current":12,"options":["(lock)","mir","rev"],"portal":[0,0]},{"level":296,"target":13,"stepLimit":4,"current":35,"options":["(lock)","(insert7)","sum"],"portal":[0,0]},{"level":297,"target":9,"stepLimit":4,"current":35,"options":["(lock)","(insert7)","sum"],"portal":[0,0]},{"level":298,"target":48,"stepLimit":5,"current":2222,"options":["(lock)","cut2","/5"],"portal":[0,0]},{"level":299,"target":21,"stepLimit":2,"current":55,"options":["push5","*2"],"portal":[3,1]},{"level":300,"target":16,"stepLimit":2,"current":55,"options":["push5","*2"],"portal":[3,1]},{"level":301,"target":121,"stepLimit":4,"current":14,"options":["mir","push1","sum"],"portal":[4,1]},{"level":302,"target":111,"stepLimit":4,"current":14,"options":["mir","push1","sum"],"portal":[4,1]},{"level":303,"target":992,"stepLimit":2,"current":91,"options":["inv10","STORE","mir"],"portal":[4,1]},{"level":304,"target":920,"stepLimit":3,"current":91,"options":["inv10","STORE","mir"],"portal":[4,1]},{"level":305,"target":2,"stepLimit":4,"current":91,"options":["inv10","STORE","mir"],"portal":[4,1]},{"level":306,"target":525,"stepLimit":5,"current":15,"options":["inv10","STORE","<<"],"portal":[4,1]},{"level":307,"target":220,"stepLimit":5,"current":15,"options":["inv10","STORE","<<"],"portal":[4,1]},{"level":308,"target":78,"stepLimit":2,"current":77,"options":["mir","(rep4)","<<","sum"],"portal":[4,1]},{"level":309,"target":99,"stepLimit":4,"current":77,"options":["mir","(rep4)","<<","sum"],"portal":[4,1]},{"level":310,"target":2,"stepLimit":3,"current":77,"options":["mir","(rep4)","<<","sum"],"portal":[4,1]},{"level":311,"target":500,"stepLimit":3,"current":77,"options":["mir","(rep4)","<<","sum"],"portal":[4,1]},{"level":312,"target":860,"stepLimit":4,"current":77,"options":["mir","(rep4)","<<","sum"],"portal":[4,1]},{"level":313,"target":456,"stepLimit":4,"current":77,"options":["mir","(rep4)","<<","sum"],"portal":[4,1]},{"level":314,"target":888,"stepLimit":4,"current":77,"options":["mir","(rep4)","<<","sum"],"portal":[4,1]},{"level":315,"target":93,"stepLimit":5,"current":9,"options":["push9","push1","sort<","cut0","(insert2)"],"portal":[5,1]},{"level":316,"target":131,"stepLimit":6,"current":9,"options":["push9","push1","sort<","cut0","(insert2)"],"portal":[5,1]},{"level":317,"target":1,"stepLimit":4,"current":9,"options":["push9","push1","sort<","cut0","(insert2)"],"portal":[5,1]},{"level":318,"target":9933,"stepLimit":6,"current":9,"options":["push9","push1","sort<","cut0","(insert2)"],"portal":[5,1]},{"level":319,"target":31,"stepLimit":6,"current":9,"options":["push9","push1","sort<","cut0","(insert2)"],"portal":[5,1]}];
  function calculatorOptionsFromLabels(labels) {
    return labels.map((label, index) => {
      const text = String(label);
      // 原作中括号操作和 store/STORE 需要在按键后追加一个数字参数。
      const needsArg = /^\((?:round|del|move|lock|insert-?\d+|rep-?\d+|[+-]\d+)\)$/.test(text);
      const optionalArg = text === 'store' || text === 'STORE';
      return { index: index + 1, label: text, needsArg, optionalArg, color: (needsArg || optionalArg) ? '#6b4bb5' : (index % 2 ? '#318dd9' : '#db7633') };
    });
  }
  function calculatorStateValue(state) { return String(state && state.value != null ? state.value : 0); }
  function calculatorDigits(state) { return calculatorStateValue(state).replace(/^-/, ''); }
  function calculatorInt(state) { const n = Number(calculatorStateValue(state)); return Number.isFinite(n) ? Math.trunc(n) : 0; }
  function calculatorApplyPortal(value, portal) {
    const pair = Array.isArray(portal) ? portal : [0, 0]; const trigger = int(pair[0], 0); const target = int(pair[1], 0);
    if (trigger <= 0 || target <= 0) return String(value);
    let sign = String(value).startsWith('-') ? '-' : ''; let digits = String(value).replace(/^-/, '');
    while (digits.length >= trigger) {
      const index = digits.length - trigger; const moved = digits[index]; digits = digits.slice(0, index) + digits.slice(index + 1); digits = String(Number(digits || '0') + Number(moved) * Math.pow(10, target - 1));
    }
    return sign + digits;
  }
  function calculatorApplyLock(value, lockPosition, before) {
    const lock = int(lockPosition, 0); if (lock <= 0) return String(value);
    const sign = String(value).startsWith('-') ? '-' : ''; const digits = String(value).replace(/^-/, '').split(''); const old = String(before == null ? value : before).replace(/^-/, '');
    while (digits.length < lock) digits.unshift('0');
    digits[digits.length - lock] = old[old.length - lock] || '0';
    return sign + String(Number(digits.join('')));
  }
  function calculatorApply(state, optionIndex, extra) {
    const next = Object.assign({}, state); const option = (next.options || [])[optionIndex - 1]; const label = option && typeof option === 'object' ? String(option.label || '') : String(option || ''); if (!label) return { ok: false, error: '没有这个按钮' }; if (option && option.disabled) return { ok: false, error: '这个按钮是占位格，不能操作' };
    const before = calculatorStateValue(next); const arg = extra == null || extra === '' ? 0 : Number(extra); if (!Number.isFinite(arg)) return { ok: false, error: '额外参数必须是数字' };
    let value = before; let stored = next.stored == null ? null : String(next.stored); let lock = int(next.lockPosition, 0); let consumed = 1; let special = false;
    const digits = () => String(value).replace(/^-/, '');
    const replaceAll = (a, b) => { value = String(value).split(String(a)).join(String(b)); };
    if (label === '<<') value = String(Math.floor(calculatorInt({ value }) / 10));
    else if (/^sort[<>]$/.test(label)) { const sign = String(value).startsWith('-') ? '-' : ''; const sorted = digits().split('').sort((a, b) => label === 'sort<' ? Number(a) - Number(b) : Number(b) - Number(a)).join(''); value = sign + (sorted || '0'); }
    else if (label === '+/-') value = String(-calculatorInt({ value }));
    else if (label === 'rev') { const sign = String(value).startsWith('-') ? '-' : ''; value = sign + digits().split('').reverse().join(''); }
    else if (label === 'sum') { const sign = String(value).startsWith('-') ? -1 : 1; value = String(sign * digits().split('').reduce((sum, d) => sum + Number(d), 0)); }
    else if (label === '<shift' || label === 'shift>') { const sign = String(value).startsWith('-') ? '-' : ''; const d = digits(); value = sign + (d.length > 1 ? (label === '<shift' ? d.slice(1) + d[0] : d.slice(-1) + d.slice(0, -1)) : d); }
    else if (label === 'mir') { const sign = String(value).startsWith('-') ? '-' : ''; value = sign + digits() + digits().split('').reverse().join(''); }
    else if (label === 'inv10') value = (String(value).startsWith('-') ? '-' : '') + digits().split('').map((d) => d === '0' ? '0' : String(10 - Number(d))).join('');
    else if (label === 'store' || label === 'STORE') {
      if (extra != null && arg !== 0) { stored = String(value); consumed = label === 'STORE' ? 1 : 0; special = true; }
      else if (stored == null) return { ok: false, error: '还没有存储的数值' };
      else { const sign = String(value).startsWith('-') ? '-' : ''; value = sign + digits() + String(stored).replace(/^-/, ''); }
    } else if (/^\((lock|move|round|del|insert-?\d+|rep-?\d+|[+-]\d+)\)$/.test(label)) {
      const inner = label.slice(1, -1); if (inner === 'lock') { if (arg < 1 || arg > digits().length) return { ok: false, error: `光标位置应在1到${digits().length}之间` }; next.lockPosition = Math.trunc(arg); next.stepsLeft = Math.max(0, int(next.stepsLeft, 0) - 1); next.stored = stored; next.history = (next.history || []).concat([{ option: optionIndex, label, extra: String(arg), before, after: before }]).slice(-12); return { ok: true, state: next }; }
      if (inner === 'move') { const shift = Math.trunc(arg); const sign = String(value).startsWith('-') ? '-' : ''; let d = digits(); for (let i = 0; i < Math.abs(shift); i++) d = d.length > 1 ? (shift >= 0 ? d.slice(1) + d[0] : d.slice(-1) + d.slice(0, -1)) : d; value = sign + d; }
      else { const d = digits(); const pos = Math.trunc(arg); if (inner === 'round') { if (pos < 2 || pos > d.length) return { ok: false, error: `四舍五入位置应在2到${d.length}之间` }; const power = Math.pow(10, pos - 1); value = String(Math.round(calculatorInt({ value }) / power) * power); } else if (inner === 'del') { if (pos < 1 || pos > d.length) return { ok: false, error: `删除位置应在1到${d.length}之间` }; value = (String(value).startsWith('-') ? '-' : '') + (d.slice(0, d.length - pos) + d.slice(d.length - pos + 1) || '0'); } else if (/^insert/.test(inner)) { const at = Math.max(0, Math.min(d.length, pos)); const insert = inner.replace(/^insert/, ''); value = (String(value).startsWith('-') ? '-' : '') + (at === 0 ? d + insert : d.slice(0, d.length - at) + insert + d.slice(d.length - at)); } else if (/^rep/.test(inner)) { if (pos < 1 || pos > d.length) return { ok: false, error: `替换位置应在1到${d.length}之间` }; const repl = inner.replace(/^rep/, ''); const chars = d.split(''); chars[chars.length - pos] = repl; value = (String(value).startsWith('-') ? '-' : '') + chars.join(''); } else { if (pos < 1 || pos > d.length) return { ok: false, error: `光标位置应在1到${d.length}之间` }; const chars = d.split(''); const index = chars.length - pos; const delta = Number(inner); chars[index] = String((Number(chars[index]) + delta + 100) % 10); value = (String(value).startsWith('-') ? '-' : '') + chars.join(''); } }
    } else if (/^\+\-?\d+$/.test(label)) value = String(calculatorInt({ value }) + Number(label.slice(1)));
    else if (/^\-\d+$/.test(label)) value = String(calculatorInt({ value }) - Number(label.slice(1)));
    else if(/^\*-?\d+$/.test(label)) value = String(calculatorInt({ value }) * Number(label.slice(1)));
    else if(/^\/\-?\d+$/.test(label)) { const divisor = Number(label.slice(1)); if (!divisor || calculatorInt({ value }) % divisor !== 0) return { ok: false, error: `当前数值不能整除${divisor}` }; value = String(calculatorInt({ value }) / divisor); }
    else if(/^push-?\d+$/.test(label)) value = (String(value).startsWith('-') ? '-' : '') + digits() + label.slice(4);
    else if(/^\d+=>\d+$/.test(label)) { const parts = label.split('=>'); replaceAll(parts[0], parts[1]); }
    else if(/^\^\-?\d+$/.test(label)) value = String(Math.pow(calculatorInt({ value }), Number(label.slice(1))));
    else if(/^cut-?\d+$/.test(label)) value = (String(value).startsWith('-') ? '-' : '') + (digits().split(label.slice(3)).join('') || '0');
    else if(/^\[\+\]-?\d+$/.test(label)) {
      const delta = Number(label.slice(3));
      next.options = (next.options || []).map((item) => {
        const t = typeof item === 'object' ? Object.assign({}, item) : { label: item }; const text = String(t.label || '');
        if (/^[+\-*\/]\-?\d+$/.test(text)) t.label = text[0] + String(Number(text.slice(1)) + delta);
        else if (/^push-?\d+$/.test(text)) t.label = 'push' + String(Number(text.slice(4)) + delta);
        else if (/^\^-?\d+$/.test(text)) t.label = '^' + String(Number(text.slice(1)) + delta);
        else if (/^cut-?\d+$/.test(text)) t.label = 'cut' + String(Number(text.slice(3)) + delta);
        else if (/^\-?\d+=>\-?\d+$/.test(text)) { const parts = text.split('=>'); t.label = String(Number(parts[0]) + delta) + '=>' + parts[1]; }
        else if (/^\((?:insert|rep|\+|\-)-?\d+\)$/.test(text)) { const inner = text.slice(1, -1); const m = inner.match(/^([a-z+\-]*)(-?\d+)$/); if (m) t.label = `(${m[1]}${Number(m[2]) + delta})`; }
        return t;
      }); special = true;
    }
    else return { ok: false, error: '这个按钮暂不可用' };
    if (!special) { value = calculatorApplyPortal(value, next.portal); value = calculatorApplyLock(value, lock, before); lock = 0; }
    next.value = String(value); next.stored = stored; next.lockPosition = lock; next.stepsLeft = Math.max(0, int(next.stepsLeft, 0) - consumed); next.history = (next.history || []).concat([{ option: optionIndex, label, extra: extra == null ? '' : String(extra), before, after: String(value) }]).slice(-12);
    return { ok: true, state: next };
  }
  function workCalculatorPuzzle() {
    const raw = CALCULATOR_LEVELS[Math.floor(Math.random() * CALCULATOR_LEVELS.length)];
    const level = Object.assign({}, raw); level.options = calculatorOptionsFromLabels(raw.options);
    while (level.options.length < 3) level.options.push({ index: level.options.length + 1, label: '无操作', needsArg: false, color: '#778899', disabled: true });
    return { level: level.level, target: level.target, stepLimit: level.stepLimit, stepsLeft: level.stepLimit, value: String(level.current), options: level.options, portal: Array.isArray(level.portal) ? level.portal.slice() : [0, 0], stored: null, lockPosition: 0, history: [], special: level.options.some((option) => option.needsArg) };
  }
  // 兼容旧版图片/测试：按钮最少保留三格；空余格为无操作占位，不会改变数值。
  function workSudokuSolutionCount(grid, limitValue) {
    const cells = (grid || []).map((value) => int(value, 0)); const limit = Math.max(1, int(limitValue, 2)); let count = 0;
    const rowMask = Array(9).fill(0); const colMask = Array(9).fill(0); const boxMask = Array(9).fill(0); const full = 0x3FE;
    for (let index = 0; index < 81; index++) { const value = cells[index]; if (!value) continue; if (value < 1 || value > 9) return 0; const row = Math.floor(index / 9); const col = index % 9; const bit = 1 << value; const box = Math.floor(row / 3) * 3 + Math.floor(col / 3); if ((rowMask[row] & bit) || (colMask[col] & bit) || (boxMask[box] & bit)) return 0; rowMask[row] |= bit; colMask[col] |= bit; boxMask[box] |= bit; }
    function search() {
      if (count >= limit) return;
      let best = -1; let bestOptions = 0; let bestSize = 10;
      for (let index = 0; index < 81; index++) if (!cells[index]) { const row = Math.floor(index / 9); const col = index % 9; const box = Math.floor(row / 3) * 3 + Math.floor(col / 3); const options = full & ~(rowMask[row] | colMask[col] | boxMask[box]); const size = options.toString(2).replace(/0/g, '').length; if (!options) return; if (size < bestSize) { best = index; bestOptions = options; bestSize = size; if (size === 1) break; } }
      if (best < 0) { count++; return; }
      const row = Math.floor(best / 9); const col = best % 9; const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
      for (let value = 1; value <= 9 && count < limit; value++) { const bit = 1 << value; if (!(bestOptions & bit)) continue; cells[best] = value; rowMask[row] |= bit; colMask[col] |= bit; boxMask[box] |= bit; search(); cells[best] = 0; rowMask[row] ^= bit; colMask[col] ^= bit; boxMask[box] ^= bit; }
    }
    search(); return count;
  }
  function workSudokuPuzzle() {
    const pattern = (row, col) => (row * 3 + Math.floor(row / 3) + col) % 9;
    const rowBands = workShuffle([0, 1, 2]); const rows = []; rowBands.forEach((band) => workShuffle([0, 1, 2]).forEach((offset) => rows.push(band * 3 + offset)));
    const colStacks = workShuffle([0, 1, 2]); const cols = []; colStacks.forEach((stack) => workShuffle([0, 1, 2]).forEach((offset) => cols.push(stack * 3 + offset)));
    const digits = workShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]); const solved = [];
    rows.forEach((row) => cols.forEach((col) => solved.push(digits[pattern(row, col)])));
    const puzzle = solved.slice(); const blanks = workShuffle(Array.from({ length: 81 }, (_, index) => index)); const targetBlanks = 43 + Math.floor(Math.random() * 8); let blankCount = 0;
    for (const index of blanks) { if (blankCount >= targetBlanks) break; const previous = puzzle[index]; puzzle[index] = 0; if (workSudokuSolutionCount(puzzle, 2) === 1) blankCount++; else puzzle[index] = previous; }
    return { width: 9, height: 9, puzzle: puzzle.join(''), answer: solved.join(''), unique: true, blankCount };
  }
  function workExpertSudokuPuzzle() {
    // This rotationally symmetric template is externally calibrated by Sudoku Coach at
    // SE ~= 8.1 / Beyond Hell (10). Digit relabeling and D4 board symmetries preserve
    // both its solving structure and its 180-degree clue symmetry.
    const basePuzzle = '..7..6..3.8..5....45...7.6......43...1..2..7...97......2.5...17....7..2.8..1..6..';
    const baseAnswer = '297486153683951742451237968762814395518329476349765281926543817134678529875192634';
    const digitOrder = workShuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]); const digitMap = {};
    for (let index = 0; index < 9; index++) digitMap[index + 1] = digitOrder[index];
    const transform = Math.floor(Math.random() * 8);
    function transformedIndex(row, col) {
      if (transform === 1) return col * 9 + (8 - row);
      if (transform === 2) return (8 - row) * 9 + (8 - col);
      if (transform === 3) return (8 - col) * 9 + row;
      if (transform === 4) return row * 9 + (8 - col);
      if (transform === 5) return (8 - row) * 9 + col;
      if (transform === 6) return col * 9 + row;
      if (transform === 7) return (8 - col) * 9 + (8 - row);
      return row * 9 + col;
    }
    const puzzle = Array(81).fill(0); const solved = Array(81).fill(0);
    for (let index = 0; index < 81; index++) {
      const target = transformedIndex(Math.floor(index / 9), index % 9);
      const clue = Number(basePuzzle[index]) || 0; const answer = Number(baseAnswer[index]) || 0;
      puzzle[target] = clue ? digitMap[clue] : 0; solved[target] = digitMap[answer];
    }
    if (workSudokuSolutionCount(puzzle, 2) !== 1) throw new Error('expert sudoku template lost uniqueness');
    const blankCount = puzzle.filter((value) => !value).length;
    return {
      width: 9, height: 9, puzzle: puzzle.join(''), answer: solved.join(''), unique: true,
      blankCount, symmetric: true, difficultyScore: 8.1, seEquivalent: 8.1,
      difficultyMethod: 'sudoku-coach-verified-v2', difficultyTier: 'Beyond Hell (10)'
    };
  }
  function workKnightsRoleName(role) { return role === 'T' ? '骑士' : '无赖'; }
  function workKnightsOtherRole(role) { return role === 'T' ? 'F' : 'T'; }
  function workKnightsClaim(rule, roles, count) {
    if (!rule) return null;
    if (rule.kind === 'truth') return true;
    if (rule.kind === 'role') return roles[rule.target] === rule.role;
    if (rule.kind === 'same') return (roles[rule.left] === roles[rule.right]) === Boolean(rule.same);
    if (rule.kind === 'both') return roles[rule.firstTarget] === rule.firstRole && roles[rule.secondTarget] === rule.secondRole;
    if (rule.kind === 'count') {
      const total = roles.filter((role) => role === 'T').length;
      if (rule.op === 'gtHalf') return total > count / 2;
      if (rule.op === 'leHalf') return total <= count / 2;
      if (rule.op === 'atLeast') return total >= rule.threshold;
      if (rule.op === 'below') return total < rule.threshold;
    }
    if (rule.kind === 'range') {
      const values = roles.slice(rule.start, rule.end); const all = values.length > 0 && values.every((role) => role === rule.role);
      return rule.negated ? !all : all;
    }
    return false;
  }
  function workKnightsIsValidRoles(rules, roles, count) { return (rules || []).every((rule) => roles[rule.speaker] === (workKnightsClaim(rule, roles, count) ? 'T' : 'F')); }
  function workKnightsSolutions(puzzle, limitValue) {
    const count = int(puzzle && puzzle.count, 0); const limit = Math.max(1, int(limitValue, 2)); const solutions = [];
    if (count < 1 || count > 8) return solutions;
    for (let mask = 0; mask < Math.pow(2, count) && solutions.length < limit; mask++) {
      const roles = Array.from({ length: count }, (_, index) => (mask & Math.pow(2, index)) ? 'T' : 'F');
      if (workKnightsIsValidRoles(puzzle.rules, roles, count)) solutions.push(roles);
    }
    return solutions;
  }
  function workKnightsParseRules(puzzle) {
    if (Array.isArray(puzzle.rules) && puzzle.rules.length === int(puzzle.count, 0)) return puzzle.rules;
    const rules = []; const statements = Array.isArray(puzzle.statements) ? puzzle.statements : [];
    statements.forEach((statement, index) => {
      const raw = String(statement && statement.text || ''); const speakerMatch = raw.match(/^(\d+)号说：/); const speaker = Math.max(0, int(statement && statement.speaker, speakerMatch ? Number(speakerMatch[1]) : index + 1) - 1); const text = raw.replace(/^\d+号说：/, '').replace(/[。！!]+$/, ''); let rule = null;
      if (/我现在说的是真话/.test(text)) rule = { kind: 'truth' };
      const both = text.match(/^(\d+)号是(骑士|无赖)，(\d+)号是(骑士|无赖)$/);
      if (both) rule = { kind: 'both', firstTarget: Number(both[1]) - 1, firstRole: both[2] === '骑士' ? 'T' : 'F', secondTarget: Number(both[3]) - 1, secondRole: both[4] === '骑士' ? 'T' : 'F' };
      const role = text.match(/^(\d+)号是(骑士|无赖)$/);
      if (role) rule = { kind: 'role', target: Number(role[1]) - 1, role: role[2] === '骑士' ? 'T' : 'F' };
      const relation = text.match(/^(\d+)号和(我|\d+号)(是|不是)一伙的?$/);
      if (relation) rule = { kind: 'same', left: Number(relation[1]) - 1, right: relation[2] === '我' ? speaker : Number(relation[2].replace('号', '')) - 1, same: relation[3] === '是' };
      const half = text === '在场有一半以上的人是骑士。' || text === '在场有一半以上的人是骑士'; if (half) rule = { kind: 'count', op: 'gtHalf' };
      if (text === '在场不超过一半的人是骑士' || text === '在场不超过一半的人是骑士。') rule = { kind: 'count', op: 'leHalf' };
      const threshold = text.match(/^在场至少有(\d+)名骑士$/) || text.match(/^在场至少有(\d+)名骑士。$/); if (threshold) rule = { kind: 'count', op: 'atLeast', threshold: Number(threshold[1]) };
      const below = text.match(/^在场少于(\d+)名骑士$/) || text.match(/^在场少于(\d+)名骑士。$/); if (below) rule = { kind: 'count', op: 'below', threshold: Number(below[1]) };
      const greater = text === '编号大于我的人都是骑士' || text === '编号大于我的人都是骑士。'; if (greater) rule = { kind: 'range', start: speaker + 1, end: int(puzzle.count, 0), role: 'T', negated: false };
      if (text === '编号大于我的人不全是骑士' || text === '编号大于我的人不全是骑士。') rule = { kind: 'range', start: speaker + 1, end: int(puzzle.count, 0), role: 'T', negated: true };
      const lower = text === '编号小于我的人都是无赖' || text === '编号小于我的人都是无赖。'; if (lower) rule = { kind: 'range', start: 0, end: speaker, role: 'F', negated: false };
      if (text === '编号小于我的人不全是无赖' || text === '编号小于我的人不全是无赖。') rule = { kind: 'range', start: 0, end: speaker, role: 'F', negated: true };
      if (rule) { rule.speaker = speaker; rules.push(rule); }
    });
    return rules.length === int(puzzle.count, 0) ? rules : [];
  }
  function workKnightsPuzzle() {
    const count = 3 + Math.floor(Math.random() * 6); const roles = Array.from({ length: count }, () => Math.random() < 0.5 ? 'T' : 'F'); const anchor = Math.floor(Math.random() * count); const order = [anchor].concat(workShuffle(Array.from({ length: count }, (_, index) => index).filter((index) => index !== anchor))); const rules = [{ speaker: anchor, kind: 'truth' }]; const statements = [];
    function add(rule, text) { rules.push(rule); statements.push({ speaker: rule.speaker + 1, text: `${rule.speaker + 1}号说：${text}` }); }
    for (let position = 1; position < order.length; position++) {
      const speaker = order[position]; const parent = order[Math.floor(Math.random() * position)]; const useRelation = position >= 2 && Math.random() < 0.3; const truthful = roles[speaker] === 'T';
      if (useRelation) {
        const options = order.slice(0, position).filter((index) => index !== parent); const other = options[Math.floor(Math.random() * options.length)]; const actualSame = roles[parent] === roles[other]; const claimedSame = truthful ? actualSame : !actualSame; add({ speaker, kind: 'same', left: parent, right: other, same: claimedSame }, `${parent + 1}号和${other + 1}号${claimedSame ? '是一伙的' : '不是一伙的'}。`);
      } else {
        const claimedRole = truthful ? roles[parent] : workKnightsOtherRole(roles[parent]); add({ speaker, kind: 'role', target: parent, role: claimedRole }, `${parent + 1}号是${workKnightsRoleName(claimedRole)}。`);
      }
    }
    const bySpeaker = {}; rules.forEach((rule) => { bySpeaker[rule.speaker] = rule; });
    for (let index = 0; index < count; index++) { const rule = bySpeaker[index]; if (rule) statements.push({ speaker: index + 1, text: `${index + 1}号说：${rule.kind === 'truth' ? '我现在说的是真话。' : '（关系陈述）'}` }); }
    const visible = statements.filter((statement) => !/（关系陈述）/.test(statement.text));
    const ordered = []; for (let index = 0; index < count; index++) { const found = statements.find((statement) => statement.speaker === index + 1 && !/（关系陈述）/.test(statement.text)); ordered.push(found || { speaker: index + 1, text: `${index + 1}号说：我现在说的是真话。` }); }
    const puzzle = { count, rules, statements: ordered, answer: roles.map((role, index) => `${index + 1}${role}`).join('') };
    if (workKnightsSolutions(puzzle, 2).length !== 1) return workKnightsPuzzle();
    return puzzle;
  }
  function workCreekClues(cells, width, height) {
    const clues = [];
    for (let row = 0; row <= height; row++) { const line = []; for (let col = 0; col <= width; col++) { let value = 0; for (let dr = -1; dr <= 0; dr++) for (let dc = -1; dc <= 0; dc++) { const r = row + dr; const c = col + dc; if (r >= 0 && r < height && c >= 0 && c < width) value += cells[r * width + c]; } line.push(value); } clues.push(line.join('')); }
    return clues;
  }
  function workCreekVisibleMismatch(width, height, clues, cells) {
    let mismatches = 0;
    for (let row = 1; row < height; row++) for (let col = 1; col < width; col++) {
      let actual = 0;
      for (let dr = -1; dr <= 0; dr++) for (let dc = -1; dc <= 0; dc++) actual += int(cells[(row + dr) * width + col + dc], 0);
      const expected = Number(String(clues[row] || '')[col]);
      if (!Number.isFinite(expected) || actual !== expected) mismatches++;
    }
    return mismatches;
  }
  function workCreekSolutionInfo(width, height, clues, limitValue) {
    const limit = Math.max(1, int(limitValue, 2)); const rows = Array.from({ length: height }, () => Array(width).fill(0)); let count = 0; let answer = '';
    function searchRow(row) {
      if (count >= limit) return;
      if (row >= height) { count++; if (!answer) answer = rows.map((line) => line.join('')).join(''); return; }
      const previous = rows[row - 1]; const clueLine = String(clues[row] || '');
      for (let first = 0; first <= 1 && count < limit; first++) {
        const current = Array(width).fill(0); current[0] = first; let legal = true;
        for (let col = 1; col < width; col++) {
          const expected = Number(clueLine[col]); const value = expected - previous[col - 1] - previous[col] - current[col - 1];
          if (!Number.isFinite(expected) || (value !== 0 && value !== 1)) { legal = false; break; }
          current[col] = value;
        }
        if (legal) { rows[row] = current; searchRow(row + 1); }
      }
    }
    const firstRowCount = Math.pow(2, width);
    for (let mask = 0; mask < firstRowCount && count < limit; mask++) {
      const firstRow = Array(width).fill(0); for (let col = 0; col < width; col++) firstRow[col] = (mask >> col) & 1;
      rows[0] = firstRow; searchRow(1);
    }
    return { count, answer };
  }
  function workCreekMatches(puzzle, answer) {
    const width = int(puzzle.width, 0); const height = int(puzzle.height, 0); const cells = String(answer || '').replace(/[^01]/g, '');
    return width > 0 && height > 0 && cells.length === width * height && workCreekVisibleMismatch(width, height, puzzle.clues || [], cells.split('')) === 0;
  }
  function workCreekPuzzle() {
    const height = 4 + Math.floor(Math.random() * 7); const width = 6 + Math.floor(Math.random() * 7); let selected = null;
    for (let attempt = 0; attempt < 48; attempt++) {
      const density = 0.18 + Math.random() * 0.28; const cells = [];
      for (let i = 0; i < height * width; i++) cells.push(Math.random() < density ? 1 : 0);
      const clues = workCreekClues(cells, width, height); const solved = workCreekSolutionInfo(width, height, clues, 2);
      if (solved.count === 1) { selected = { cells: solved.answer, clues }; break; }
    }
    if (!selected) {
      const cells = Array(width * height).fill(0); cells[Math.floor(height / 2) * width + Math.floor(width / 2)] = 1;
      const clues = workCreekClues(cells, width, height); const solved = workCreekSolutionInfo(width, height, clues, 2); selected = { cells: solved.answer || cells.join(''), clues };
    }
    return { width, height, cells: selected.cells, clues: selected.clues, unique: true };
  }
  function workNewBatch() {
    return { startedAt: nowMs(), issued: 0, solved: 0, failed: 0, skipped: 0, wrongAnswers: 0, gross: 0, paid: 0, difficultyTotal: 0, durationMs: 0 };
  }
  function workNormalizeBatch(raw) {
    const batch = Object.assign(workNewBatch(), raw && typeof raw === 'object' ? raw : {});
    ['issued', 'solved', 'failed', 'skipped', 'wrongAnswers', 'gross', 'paid', 'durationMs'].forEach((key) => { batch[key] = Math.max(0, int(batch[key], 0)); });
    batch.startedAt = Math.max(0, Number(batch.startedAt) || nowMs()); batch.difficultyTotal = Math.max(0, Number(batch.difficultyTotal) || 0);
    return batch;
  }
  function workBatchRecord(session, kind, values) {
    if (!session || !session.formal || session.isExpert) return null;
    const batch = workNormalizeBatch(session.batch); const details = values || {};
    if (kind === 'solved') batch.solved++;
    if (kind === 'failed') batch.failed++;
    if (kind === 'skipped') batch.skipped++;
    if (kind === 'wrong') batch.wrongAnswers++;
    if (kind !== 'wrong') {
      batch.gross += Math.max(0, int(details.gross, 0)); batch.paid += Math.max(0, int(details.paid, 0));
      batch.difficultyTotal += Math.max(0, Number(details.difficulty) || Number(session.difficultyScore) || 0);
      batch.durationMs += Math.max(0, int(details.durationMs, 0));
    }
    session.batch = batch; return batch;
  }
  function workBatchSummary(session) {
    const batch = workNormalizeBatch(session && session.batch); const completed = batch.solved + batch.failed + batch.skipped;
    return {
      startedAt: batch.startedAt, endedAt: nowMs(), elapsedMs: Math.max(0, nowMs() - batch.startedAt), issued: batch.issued,
      completed, solved: batch.solved, failed: batch.failed, skipped: batch.skipped, wrongAnswers: batch.wrongAnswers,
      gross: batch.gross, paid: batch.paid, averageDifficulty: completed ? batch.difficultyTotal / completed : 0,
      averageSolveSeconds: batch.solved ? Math.round(batch.durationMs / batch.solved / 1000) : 0
    };
  }
  function workNewPuzzle(type, formal) {
    const selected = type || ['math24', 'sudoku', 'knights', 'creek', 'calculator'][Math.floor(Math.random() * 5)];
    const puzzle = selected === 'math24' ? workMathPuzzle() : selected === 'sudoku' ? workSudokuPuzzle() : selected === 'knights' ? workKnightsPuzzle() : selected === 'creek' ? workCreekPuzzle() : workCalculatorPuzzle();
    const difficultyScore = workDifficulty(selected, puzzle);
    return { type: selected, puzzle, startedAt: nowMs(), attemptsLeft: 1, wrongCount: 0, status: 'active', questionNo: 1, formal: formal !== false, isExpert: false, difficultyScore, difficultyLabel: workDifficultyLabel(difficultyScore) };
  }
  function workNewExpertPuzzle() {
    const puzzle = workExpertSudokuPuzzle();
    const difficultyScore = Number(puzzle.difficultyScore) || 7.5;
    return { type: 'expertSudoku', puzzle, startedAt: nowMs(), attemptsLeft: 2, wrongCount: 0, status: 'active', questionNo: 1, formal: true, isExpert: true, difficultyScore, difficultyLabel: workDifficultyLabel(difficultyScore), antiCheat: { nonce: `${nowMs()}-${Math.floor(Math.random() * 1000000)}`, minMs: 12000 } };
  }
  function workAnswerText(args) { return String((args || []).join(' ')).replace(/[\r\n]+/g, ' ').trim(); }
  function workCalculatorActionText(args) {
    const source = workAnswerText(args).replace(/[，,、]/g, ' ').trim();
    const match = source.match(/^(?:按|操作|press)\s+(.+)$/i);
    return match ? match[1].trim() : source;
  }
  function workCalculatorActions(session, answer) {
    const raw = String(answer || '').trim();
    if (!raw) return null;
    const optionNeedsArg = (index) => { const option = session && session.puzzle && session.puzzle.options && session.puzzle.options[index - 1]; return !!(option && (option.needsArg || option.optionalArg)); };
    const groups = raw.match(/\d+|[^\d\s]+/g) || []; const actions = []; let hadWhitespace = /\s/.test(raw);
    for (let position = 0; position < groups.length; position++) {
      const token = groups[position]; if (!/^\d+$/.test(token)) return null;
      if (hadWhitespace && token.length > 1) { const index = Number(token); if (index > 0 && index <= 9 && optionNeedsArg(index) && position + 1 < groups.length && /^\d+$/.test(groups[position + 1])) { actions.push({ index, extra: Number(groups[++position]) }); continue; } }
      if (token.length > 1) token.split('').forEach((digit) => actions.push({ index: Number(digit), extra: null }));
      else actions.push({ index: Number(token), extra: null });
    }
    return actions.length ? actions : null;
  }
  function workCalculatorMatch(session, answer) {
    const actions = workCalculatorActions(session, answer); if (!actions) return { ok: false, error: '请输入按钮编号，例如“按 221122333”或“221122333”。' };
    let state = Object.assign({}, session.puzzle, { history: [] });
    for (const action of actions) {
      const index = typeof action === 'object' ? action.index : action; const extra = typeof action === 'object' ? action.extra : null;
      const option = state.options && state.options[index - 1]; if (!option) return { ok: false, error: `按钮${index}不存在，本关只有${state.options.length}个按钮。` };
      if (option.needsArg && extra == null) return { ok: false, error: `按钮${index}需要额外数字参数，请使用“按 ${index} 参数”操作。` };
      const result = calculatorApply(state, index, extra); if (!result.ok) return { ok: false, error: result.error }; state = result.state;
      if (String(state.value) === String(state.target)) break;
      if (state.stepsLeft <= 0) break;
    }
    const solved = String(state.value) === String(state.target);
    const exhausted = !solved && state.stepsLeft <= 0;
    return { ok: solved, solved, exhausted, state, actions };
  }
  function workNumberTokens(expression) { return (String(expression || '').match(/(?:\d+(?:\.\d+)?|\.\d+)/g) || []).map((value) => Number(value)); }
  function workEvalExpression(expression) {
    const source = String(expression || '').replace(/[xX×]/g, '*').replace(/÷/g, '/').replace(/，/g, ',').replace(/\s+/g, '');
    const tokens = []; let index = 0;
    while (index < source.length) {
      const number = source.slice(index).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
      if (number) { tokens.push({ type: 'number', value: Number(number[0]) }); index += number[0].length; continue; }
      if ('+-*/()'.indexOf(source[index]) >= 0) { tokens.push({ type: source[index] }); index++; continue; }
      return null;
    }
    let cursor = 0;
    function primary() {
      const token = tokens[cursor];
      if (!token) return null;
      if (token.type === 'number') { cursor++; return token.value; }
      if (token.type === '(') { cursor++; const value = additive(); if (!tokens[cursor] || tokens[cursor].type !== ')') return null; cursor++; return value; }
      return null;
    }
    function multiplicative() {
      let value = primary(); if (value == null) return null;
      while (tokens[cursor] && (tokens[cursor].type === '*' || tokens[cursor].type === '/')) {
        const operator = tokens[cursor++].type; const right = primary(); if (right == null || (operator === '/' && Math.abs(right) < 1e-12)) return null;
        value = operator === '*' ? value * right : value / right;
      }
      return value;
    }
    function additive() {
      let value = multiplicative(); if (value == null) return null;
      while (tokens[cursor] && (tokens[cursor].type === '+' || tokens[cursor].type === '-')) {
        const operator = tokens[cursor++].type; const right = multiplicative(); if (right == null) return null; value = operator === '+' ? value + right : value - right;
      }
      return value;
    }
    const value = additive(); return value == null || cursor !== tokens.length ? null : { value, numbers: tokens.filter((token) => token.type === 'number').map((token) => token.value) };
  }
  function sameNumberMultiset(left, right) {
    const a = (left || []).map(Number).sort((x, y) => x - y); const b = (right || []).map(Number).sort((x, y) => x - y);
    return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-9);
  }
  function workKnightsRolesFromAnswer(answer, count) {
    const source = String(answer || '').toUpperCase().replace(/[^TF1-8]/g, ''); const compact = source.replace(/[1-8]/g, '');
    if (compact.length === count && source.length === count) return compact.split('');
    const pairs = []; for (let index = 0; index < source.length; index += 2) { const pair = source.slice(index, index + 2); if (!/^([1-8])([TF])$/.test(pair)) return null; pairs.push(pair); }
    if (pairs.length !== count || pairs.some((pair, index) => Number(pair[0]) !== index + 1)) return null;
    return pairs.map((pair) => pair[1]);
  }
  function workSudokuAnswerInfo(puzzle, answer) {
    const source = String(answer || '').replace(/[^1-9]/g, ''); const given = String(puzzle.puzzle || '').padEnd(81, '0').slice(0, 81); const solution = String(puzzle.answer || '').slice(0, 81); const blanks = [];
    for (let index = 0; index < 81; index++) if (given[index] === '0') blanks.push(index);
    if (source.length === 81) return { mode: 'full', values: source, valid: source === solution };
    if (source.length !== blanks.length) return { mode: 'blank', values: source, valid: false, expected: blanks.length };
    const values = given.split(''); blanks.forEach((index, cursor) => { values[index] = source[cursor]; });
    return { mode: 'blank', values: source, valid: values.join('') === solution, expected: blanks.length };
  }
  function workMatchAnswer(session, answer) {
    const puzzle = session.puzzle || {}; const text = String(answer || '').trim();
    if (session.type === 'calculator') return workCalculatorMatch(session, text).ok;
    if (session.type === 'expertSudoku') return workSudokuAnswerInfo(puzzle, text).valid;
    if (session.type === 'math24') {
      if (puzzle.noSolution) return ['无解', '没有解', '无解题'].indexOf(text.replace(/\s/g, '')) >= 0;
      const parsed = workEvalExpression(text); return !!parsed && Math.abs(parsed.value - 24) < 1e-8 && sameNumberMultiset(parsed.numbers, puzzle.numbers);
    }
    if (session.type === 'sudoku') return workSudokuAnswerInfo(puzzle, text).valid;
    if (session.type === 'creek') return workCreekMatches(puzzle, text);
    if (session.type === 'knights') {
      const roles = workKnightsRolesFromAnswer(text, int(puzzle.count, 0)); if (!roles) return false; const rules = Array.isArray(puzzle.rules) && puzzle.rules.length === int(puzzle.count, 0) ? puzzle.rules : workKnightsParseRules(puzzle);
      return rules.length === puzzle.count && workKnightsIsValidRoles(rules, roles, int(puzzle.count, 0));
    }
    return false;
  }
  function workWrongCount(session, answer) {
    const puzzle = session.puzzle || {}; if (session.type === 'sudoku') {
      const info = workSudokuAnswerInfo(puzzle, answer); if (info.expected != null && info.values.length !== info.expected) return `答案应填写原题空格的${info.expected}个数字，当前收到${info.values.length}个`;
      if (info.mode === 'blank') { const given = String(puzzle.puzzle || '').padEnd(81, '0'); let cursor = 0; let wrong = 0; for (let index = 0; index < 81; index++) if (given[index] === '0') { if (info.values[cursor] !== puzzle.answer[index]) wrong++; cursor++; } return `只填空格模式有${wrong}个数字错误`; }
      const given = info.values; return Array.from({ length: 81 }, (_, index) => given[index] === puzzle.answer[index] ? 0 : 1).reduce((sum, value) => sum + value, 0);
    }
    if (session.type === 'expertSudoku') {
      const info = workSudokuAnswerInfo(puzzle, answer); if (info.expected != null && info.values.length !== info.expected) return `答案应填写原题空格的${info.expected}个数字，当前收到${info.values.length}个`;
      const given = String(puzzle.puzzle || '').padEnd(81, '0'); const values = info.mode === 'blank' ? given.split('') : info.values.split('');
      if (info.mode === 'blank') { let cursor = 0; for (let index = 0; index < 81; index++) if (given[index] === '0') values[index] = info.values[cursor++]; }
      const wrong = Array.from({ length: 81 }, (_, index) => values[index] === puzzle.answer[index] ? 0 : 1).reduce((sum, value) => sum + value, 0);
      return `本次有${wrong}个数字错误`;
    }
    if (session.type === 'creek') {
      const width = int(puzzle.width, 0); const height = int(puzzle.height, 0); const given = String(answer || '').replace(/[^01]/g, ''); const expectedLength = width * height;
      if (given.length !== expectedLength) return `答案共${given.length}格，应为${expectedLength}格`;
      return `有${workCreekVisibleMismatch(width, height, puzzle.clues || [], given.split(''))}个内部顶点线索不匹配`;
    }
    if (session.type === 'knights') { const roles = String(puzzle.answer || '').match(/[TF]/g) || []; const knights = roles.filter((role) => role === 'T').length; return `在场共有${knights}名骑士、${Math.max(0, int(puzzle.count, roles.length) - knights)}名无赖`; }
    if (session.type === 'calculator') return `当前数值为${puzzle.value}，目标为${puzzle.target}；请检查按钮顺序或剩余步数`;
    if (puzzle.noSolution) return '这题并不存在合法解';
    const parsed = workEvalExpression(answer);
    if (!parsed) return '约有4个数字使用错误或缺失';
    const expected = (puzzle.numbers || []).map(Number); const actual = parsed.numbers || [];
    const remaining = expected.slice(); let matched = 0;
    actual.forEach((value) => { const index = remaining.findIndex((candidate) => Math.abs(candidate - value) < 1e-9); if (index >= 0) { remaining.splice(index, 1); matched++; } });
    const wrongDigits = Math.max(0, expected.length - matched) + Math.max(0, actual.length - matched);
    return `约有${Math.max(1, wrongDigits)}个数字使用错误或缺失`;
  }
  function workQuestionStats(p, session, solved, gross, paid, duration) {
    const stats = p.stats.work || emptyGameStats(); stats.workLastType = session.type; stats.workLastReward = gross;
    if (solved) { stats.workSolved++; stats.workCurrentStreak++; stats.workBestStreak = Math.max(stats.workBestStreak, stats.workCurrentStreak); }
    else { stats.workWrong++; stats.workCurrentStreak = 0; }
    stats.workBestReward = Math.max(stats.workBestReward, gross); stats.workGrossReward += gross; stats.workCoinsEarned += paid; stats.workTotalDurationMs += Math.max(0, duration); stats.workMaxDurationMs = Math.max(stats.workMaxDurationMs, duration);
    p.stats.work = stats; saveProfile(p); return stats;
  }
  function expertQuestionStats(p, session, solved, gross, duration, revealed, fast) {
    const stats = p.stats.expertSudoku || emptyGameStats(); stats.expertTotalTimeMs += Math.max(0, duration); stats.expertWrongAnswers += Math.max(0, int(session.wrongCount, 0));
    if (solved) { stats.expertSolved++; stats.expertTotalReward += gross; stats.expertBestReward = Math.max(stats.expertBestReward, gross); stats.expertBestDifficulty = Math.max(stats.expertBestDifficulty, Number(session.difficultyScore) || 0); stats.expertBestTimeMs = !stats.expertBestTimeMs || duration < stats.expertBestTimeMs ? duration : stats.expertBestTimeMs; stats.expertCurrentStreak++; stats.expertBestStreak = Math.max(stats.expertBestStreak, stats.expertCurrentStreak); }
    else { stats.expertFailed++; stats.expertCurrentStreak = 0; }
    if (revealed) stats.expertRevealed++; if (fast) stats.expertFastSubmissions++;
    p.stats.expertSudoku = stats; saveProfile(p); return stats;
  }
  function workRecordType(stats, session) {
    if (!stats || !session) return;
    if (session.type === 'math24') { stats.work24++; if (session.puzzle && session.puzzle.decimal) stats.work24Decimal++; if (session.puzzle && session.puzzle.noSolution) stats.work24NoSolution++; }
    if (session.type === 'sudoku') stats.workSudoku++;
    if (session.type === 'knights') stats.workKnights++;
    if (session.type === 'creek') stats.workCreek++;
    if (session.type === 'calculator') { stats.workCalculator++; if (session.status === 'solved') stats.workCalculatorSolved++; }
  }
  function workRecordCalculatorSolved(p) {
    const stats = p.stats.work || emptyGameStats(); stats.workCalculatorSolved = Math.max(0, int(stats.workCalculatorSolved, 0)) + 1; p.stats.work = stats; saveProfile(p);
  }
  function workApplyReward(p, session, duration) {
    const gross = workReward(session, duration); const paid = p.coins < 200 ? Math.min(gross, 200 - p.coins) : 0; p.coins += paid; workQuestionStats(p, session, true, gross, paid, duration); saveProfile(p); return { gross, paid };
  }
  function workPuzzleLines(session) {
    const puzzle = session.puzzle || {};
    if (session.type === 'expertSudoku') return [`专家数独 · Sudoku Coach校准 SE≈${Number(session.difficultyScore || puzzle.seEquivalent || 8.1).toFixed(1)} · ${puzzle.difficultyTier || 'Beyond Hell (10)'}`, `题面唯一解且保持180度旋转对称；可提交完整81位答案，或只交原题空格的${puzzle.blankCount || 0}个数字。`, ...Array.from({ length: 9 }, (_, row) => String(puzzle.puzzle || '').slice(row * 9, row * 9 + 9).replace(/0/g, '·')), '专家题允许两次错误；用尽后显示服务端答案。每次挑战只有一道题，结束后需重新发送“.打工 专家数独”。'];
    if (session.type === 'math24') return [`数字：${puzzle.numbers.join('、')}  |  目标：24`, puzzle.noSolution ? '本题可能无解；请提交“无解”。' : '请用四个数字各一次组成24，可用 + - x * / 和括号。'];
    if (session.type === 'sudoku') return [`题面已确认唯一解；可提交完整81位答案，也可只填写原题空格的${puzzle.blankCount || String(puzzle.puzzle || '').split('').filter((value) => value === '0').length}个数字（均按从左到右、从上到下）。`, ...Array.from({ length: 9 }, (_, row) => puzzle.puzzle.slice(row * 9, row * 9 + 9).replace(/0/g, '·'))];
    if (session.type === 'knights') return [`共有${puzzle.count}位发言者；骑士说真话，无赖说假话。`, ...puzzle.statements.map((statement) => statement.text), '答案格式：FTTFFT 或 1F2T3T4F5F6T（两种格式等价；允许错误一次）。'];
    if (session.type === 'calculator') return [`第${puzzle.level}/319关 · 当前 ${puzzle.value} · 目标 ${puzzle.target} · 剩余${puzzle.stepsLeft}步${puzzle.portal && puzzle.portal[0] ? ` · 传送门${puzzle.portal[0]}→${puzzle.portal[1]}` : ''}`, '发送“.打工 按 221122333”可连续按键；带括号的光标操作可用“按 编号 参数”。', ...(puzzle.options || []).map((option) => `${option.index}. ${option.label}${option.needsArg || option.optionalArg ? '（可/需参数）' : ''}`), '首次游玩不熟悉按钮？发送“.打工 教程 3”查看计算器按钮图鉴。达到目标数字即过关；步数耗尽则本题失败。'];
    return [`${puzzle.height}×${puzzle.width}格；内部顶点数字表示周围4格中有多少个雷，本题已通过唯一解校验。`, '内部顶点提示：', ...puzzle.clues.slice(1, -1).map((line) => line.slice(1, -1)), '答案请按行提交所有格子，雷写1，空格写0；空格/换行会自动忽略。'];
  }
  function workView(p, session, quote) {
    const publicPuzzle = session && session.puzzle ? Object.assign({}, session.puzzle) : null; if (publicPuzzle && (!session || session.status !== 'revealed')) delete publicPuzzle.answer;
    const stats = p.stats.work || emptyGameStats(); const scene = { mode: session ? session.status : 'menu', type: session ? session.type : '', typeName: session ? (session.isExpert ? '专家数独' : WORK_TYPES[session.type]) : '', name: p.name, coins: p.coins, workLimit: session && session.isExpert ? 0 : 200, attemptsLeft: session ? session.attemptsLeft : 0, wrongCount: session ? session.wrongCount : 0, elapsedMs: session ? Math.max(0, nowMs() - session.startedAt) : 0, questionNo: session ? int(session.questionNo, 1) : 0, formal: session ? session.formal !== false : false, difficultyScore: session ? Number(session.difficultyScore || 0) : 0, difficultyLabel: session ? String(session.difficultyLabel || '') : '', difficultyMethod: publicPuzzle ? String(publicPuzzle.difficultyMethod || '') : '', difficultyTier: publicPuzzle ? String(publicPuzzle.difficultyTier || '') : '', lastResult: session && session.lastResult ? session.lastResult : null, batch: session && session.batch ? workNormalizeBatch(session.batch) : null, puzzle: publicPuzzle, stats: { questions: stats.workQuestions, solved: stats.workSolved, streak: stats.workCurrentStreak, bestStreak: stats.workBestStreak, bestReward: stats.workBestReward, coinsEarned: stats.workCoinsEarned } };
    const lines = session ? workPuzzleLines(session) : ['正式打工必须使用“.打工 开始”；不带题型时从24点、数独、骑士与无赖、Creek、计算器游戏中随机抽取。', '发送“.打工 结束”结束连续发题并查看当次工作结算；指定题型仍作为热身。', '计算器游戏中发送“.打工 按 221122333”即可连续执行按钮1、2、1、1、2、2、3、3、3。', '专家数独可用“.打工 专家数独”挑战，余额不设上限且每次只发一道。'];
    if (session && session.status === 'revealed') lines.push(`本题答案：${String(session.puzzle && session.puzzle.answer || '').slice(0, 81)}`);
    return { kind: 'work', title: '智力打工 · 题目工坊', subtitle: session ? `${scene.typeName} · ${session.isExpert ? '专家挑战不设余额上限' : '200游戏币/小时'} · 第${session.questionNo || 1}题` : '解题换取少量游戏币 · 余额200后停止发薪', workScene: scene, lines, quote: quote || '' };
  }
  function workSummaryView(p, summary, quote) {
    const data = summary || {};
    return {
      kind: 'work', title: '智力打工 · 当次结算', subtitle: `${p.name} · 本次工作已经结束`,
      workScene: { mode: 'summary', type: '', typeName: '当次结算', name: p.name, coins: p.coins, workLimit: 200, summary: data, stats: {} },
      lines: [`本次用时 ${Math.floor((data.elapsedMs || 0) / 1000)}秒 · 领取${data.issued || 0}题 · 完成${data.completed || 0}题`, `答对 ${data.solved || 0} · 未通过 ${data.failed || 0} · 跳过 ${data.skipped || 0} · 错误提交 ${data.wrongAnswers || 0}`, `毛报酬 ${data.gross || 0} · 实际入账 ${data.paid || 0} · 平均难度 ${Number(data.averageDifficulty || 0).toFixed(1)}`],
      quote: quote || '本次工作已结算；发送“.打工 开始”可以开始新一班。'
    };
  }
  function workStatsView(p, quote) {
    const s = p.stats.work || emptyGameStats(); const avg = s.workSolved ? Math.round(s.workTotalDurationMs / s.workSolved / 1000) : 0;
    const e = p.stats.expertSudoku || emptyGameStats(); const eAvg = e.expertSolved ? Math.round(e.expertTotalTimeMs / e.expertSolved / 1000) : 0;
    return { kind: 'work', title: '智力打工 · 专项统计', subtitle: `${p.name} · 历史记录`, workScene: { mode: 'stats', type: '', typeName: '统计', name: p.name, coins: p.coins, workLimit: 200, stats: { questions: s.workQuestions, solved: s.workSolved, wrong: s.workWrong, streak: s.workCurrentStreak, bestStreak: s.workBestStreak, bestReward: s.workBestReward, grossReward: s.workGrossReward, coinsEarned: s.workCoinsEarned, averageSeconds: avg, math24: s.work24, decimal: s.work24Decimal, noSolution: s.work24NoSolution, sudoku: s.workSudoku, knights: s.workKnights, creek: s.workCreek, calculator: s.workCalculator, calculatorSolved: s.workCalculatorSolved, expertAttempts: e.expertAttempts, expertSolved: e.expertSolved, expertFailed: e.expertFailed, expertRevealed: e.expertRevealed, expertBestReward: e.expertBestReward, expertBestDifficulty: e.expertBestDifficulty, expertAverageSeconds: eAvg, expertBestStreak: e.expertBestStreak } }, lines: [`做题 ${s.workQuestions} 题 · 正确 ${s.workSolved} · 错误 ${s.workWrong}`, `当前连对 ${s.workCurrentStreak} · 最长连对 ${s.workBestStreak}`, `单题最高毛报酬 ${s.workBestReward} · 实际入账 ${s.workCoinsEarned} · 毛报酬 ${s.workGrossReward}`, `平均解题耗时 ${avg}秒 · 24点 ${s.work24}（小数${s.work24Decimal} / 无解${s.work24NoSolution}）`, `数独 ${s.workSudoku} · 骑士与无赖 ${s.workKnights} · Creek ${s.workCreek} · 计算器${s.workCalculator}（过关${s.workCalculatorSolved}）`, `专家数独：挑战${e.expertAttempts} · 正确${e.expertSolved} · 失败${e.expertFailed} · 揭示答案${e.expertRevealed} · 最高报酬${e.expertBestReward} · 最高难度SE等效${Number(e.expertBestDifficulty || 0).toFixed(2)} · 平均耗时${eAvg}秒`], quote: quote || '' };
  }
  function workMenuView(p, quote) { return workView(p, null, quote || '可用：开始 [24点/数独/骑士与无赖/Creek/计算器游戏]、答案、按、结束、统计、专家数独、教程。'); }
  function workTutorialView(pageValue) {
    const pages = [[['基本流程', '发送“.打工 开始”进入连续正式打工；答对或用尽容错后自动发下一题。', '流程'], ['当次结算', '发送“.打工 结束”停止连续发题，图片汇总本班用时、完成数、错误、毛报酬和实收。', '结算'], ['工资规则', '难度决定主要报酬、耗时提供保底；余额达到200后普通题仍可做但不再入账。', '工资'], ['容错', '五类普通题都有一次错误机会；第一次只给提示，下一次错误后更新题目。', '风险']], [['24点', '四个数字各使用一次组成24；支持小数中间结果，x、*、×都视为乘号，也可以提交“无解”。', '表达式'], ['计算器游戏', '从当前数字出发按按钮达到目标；支持“.打工 按 221122333”连续执行按钮编号。按钮详细含义见第3页。', '按钮'], ['数独', '可提交完整81位答案，也可只按题面顺序填写全部空格。', '唯一解'], ['Creek溪流', '只按图片中的内部顶点数字判断；发题前会确认恰好只有一个合法0/1答案。', '唯一解']], [['计算器·普通按钮', '`+n`加法、`-n`减法、`*n`乘法、`/n`整除；`<<`删除末位；`pushN`把N接到末尾；`a=>b`替换所有数字。', '数值'], ['计算器·整理按钮', '`sort<`升序、`sort>`降序；`rev`反转数字；`sum`各位求和；`+/-`切换正负；`<shift`/`shift>`循环移位；`mir`把反转结果接到原数后。', '变换'], ['计算器·特殊按钮', '`^n`乘方；`cutN`删除所有N；`inv10`将每位d变成10-d（0不变）；`[+]n`让带参数按钮的参数整体增加n；`store/STORE`存取临时数字。', '特殊'], ['括号按钮·参数规则', '括号内的N是按钮自带的数字，不是要输入的参数；括号外另输一个“位置参数”。位置从右往左数：个位=1、十位=2、百位=3。格式为“.打工 按 按钮编号 位置”，例如“.打工 按 1 2”。', '重点']], [['(round) 四舍五入', '输入位置≥2；例如当前487按`(round)`并输入2，会把十位四舍五入为490（位置1个位不能用于四舍五入）。', '括号'], ['(del) 删除数字', '输入要删除的位置；当前482输入2会删除十位8，结果为42。', '括号'], ['(insertN) / (repN)', '`(insert7)`输入位置后插入数字7；`(rep6)`输入位置后把该位替换成6。位置1就是个位。', '括号'], ['(+N) / (-N)', '输入位置后只改变该位数字，并按10循环；当前482使用`(+2)`、位置1会变成484，使用`(-3)`、位置2会变成452。', '括号']], [['(move) / (lock)', '`(move)`输入正数向左循环、负数向右循环，例如输入1左移一位；`(lock)`输入位置后锁住该位，下一次普通操作结束时该位恢复原数字。', '括号'], ['store / STORE 参数', '对`store`或`STORE`输入非0参数保存当前数值；输入0则把已保存数字接到末尾。`STORE`保存会消耗一步，`store`保存不消耗步数。', '存取'], ['连续按键', '不需要参数的按钮可直接连写，例如`.打工 按 221122333`；括号按钮必须用空格分开并追加位置，例如`.打工 按 2 1`。', '输入'], ['遇到报错怎么办', '提示“位置超出范围”时，检查当前数值位数；提示“不能整除”时，当前数值必须能被除数整除；操作失败不会扣除这一步。', '排错']], [['骑士与无赖', '支持FTTFFT或1F2T3T4F5F6T；题面在不知道人数分布时也保持唯一解。', '逻辑'], ['专家数独', '每次挑战只发一道，不会自动续题；答对、失败或主动结束后，需要重新发送“.打工 专家数独”。', '单题'], ['真实难度', '母版经Sudoku Coach核验为SE约8.1、Beyond Hell(10)，仅做保持难度的同构随机化。', 'SE≈8.1'], ['统计', '普通打工与专家数独分别记录报酬、耗时、连对和挑战结果。', '档案']]];
    const page = tutorialPage(pageValue, pages.length); const entries = pages[page - 1].map((item) => ({ title: item[0], description: item[1], tag: item[2] }));
    return { kind: 'work', title: '智力打工 · 完整教程', subtitle: `第${page}/${pages.length}页 · 发送“.打工 教程 ${page === pages.length ? 1 : page + 1}”继续`, tutorial: { page, total: pages.length, entries }, lines: entries.map((entry) => `${entry.title}：${entry.description}`), quote: '题目没有输家，只有下一道题。' };
  }
  function handleWork(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const p = loadProfile(id, name); const op = String(args[0] || '').trim(); const lower = op.toLowerCase(); let session = jsonGet(workSessionKey(id), null);
    if (['教程', '规则', 'help'].indexOf(lower) >= 0) return replyView(ctx, msg, workTutorialView(args[1]));
    if (['统计', '记录', 'stats', '专家统计', '专家记录'].indexOf(lower) >= 0) return replyView(ctx, msg, workStatsView(p));
    const createSession = (type, formal, expert, countExpertAttempt, resetQuestionNo) => {
      const previous = session; const created = expert ? workNewExpertPuzzle() : workNewPuzzle(type, formal);
      created.questionNo = resetQuestionNo ? 1 : (previous ? int(previous.questionNo, 1) + 1 : 1);
      if (!expert && formal) {
        const carry = !resetQuestionNo && previous && previous.formal && !previous.isExpert ? previous.batch : null;
        created.batch = workNormalizeBatch(carry); created.batch.issued++;
      }
      jsonSet(workSessionKey(id), created);
      if (expert) {
        if (countExpertAttempt !== false) { const es = p.stats.expertSudoku || emptyGameStats(); es.expertAttempts++; p.stats.expertSudoku = es; }
      } else {
      const stats = p.stats.work || emptyGameStats(); stats.workQuestions++; if (formal) stats.workFormalQuestions++; else stats.workWarmups++;
        stats.workLastType = created.type; workRecordType(stats, created); p.stats.work = stats;
      }
      saveProfile(p); return created;
    };
    if (EXPERT_SUDOKU_ALIASES.indexOf(lower) >= 0) { session = createSession('', true, true, true, true); return replyView(ctx, msg, workView(p, session, '专家数独已生成：Sudoku Coach校准SE约8.1，每次挑战仅此一题。')); }
    if (['开始', 'start'].indexOf(lower) >= 0) { if (EXPERT_SUDOKU_ALIASES.indexOf(String(args[1] || '').trim().toLowerCase()) >= 0) { session = createSession('', true, true, true, true); return replyView(ctx, msg, workView(p, session, '专家数独已生成：Sudoku Coach校准SE约8.1，每次挑战仅此一题。')); } const selected = workTypeKey(args[1]) || ''; session = createSession(selected, !selected, false, false, true); return replyView(ctx, msg, workView(p, session, selected ? '热身题已生成；正式打工请使用“.打工 开始”。' : `正式题已生成：${WORK_TYPES[session.type]}。发送“.打工 结束”可随时结算本班。`)); }
    if (['新题', '题目', 'new'].indexOf(lower) >= 0) { if (EXPERT_SUDOKU_ALIASES.indexOf(String(args[1] || '').trim().toLowerCase()) >= 0) { session = createSession('', true, true, true, true); return replyView(ctx, msg, workView(p, session, '专家数独已生成；本次挑战不会自动续题。')); } const selected = workTypeKey(args[1]) || (session && !session.isExpert && session.type) || ''; session = createSession(selected, false, false, false, true); return replyView(ctx, msg, workView(p, session, '热身题已生成；不会计入正式工资。')); }
    if (['结束', '下班', 'end', 'stop'].indexOf(lower) >= 0) {
      if (!session) return replyView(ctx, msg, workMenuView(p, '当前没有进行中的打工。'));
      if (session.isExpert) { clearKey(workSessionKey(id)); return replyView(ctx, msg, workMenuView(p, '本次专家数独挑战已结束；未完成的题目不结算奖励。')); }
      if (!session.formal) { clearKey(workSessionKey(id)); return replyView(ctx, msg, workMenuView(p, '热身已结束；热身题不结算工资。')); }
      const summary = workBatchSummary(session); clearKey(workSessionKey(id)); return replyView(ctx, msg, workSummaryView(p, summary));
    }
    if (!session) return replyView(ctx, msg, workMenuView(p));
    if (!op && (session.status === 'solved' || session.status === 'revealed')) { clearKey(workSessionKey(id)); return replyView(ctx, msg, workMenuView(p, '上一道专家题已结算；已回到打工帮助界面。')); }
    if (['放弃', '跳过', 'skip'].indexOf(lower) >= 0) {
      if (session.isExpert) { clearKey(workSessionKey(id)); return replyView(ctx, msg, workMenuView(p, '本次专家数独已放弃；需要重新发送“.打工 专家数独”才能领取下一题。')); }
      workBatchRecord(session, 'skipped', { durationMs: Math.max(1000, nowMs() - session.startedAt) });
      session = createSession(session.type, session.formal, false, false, false); return replyView(ctx, msg, workView(p, session, '已跳过上一题，换一题继续。'));
    }
    if (session.type === 'calculator' && ['按', '操作', 'press'].indexOf(lower) >= 0) {
      const answer = workCalculatorActionText(args);
      const result = workCalculatorMatch(session, answer);
      if (!result || !result.state) return replyView(ctx, msg, workView(p, session, result && result.error ? result.error : '请输入按钮编号。'));
      session.puzzle = result.state;
      if (result.solved) {
        workRecordCalculatorSolved(p);
        const duration = Math.max(1000, nowMs() - session.startedAt); const reward = session.formal ? workApplyReward(p, session, duration) : (() => { const gross = workReward(session, duration); workQuestionStats(p, session, true, gross, 0, duration); return { gross, paid: 0 }; })();
        workBatchRecord(session, 'solved', { gross: reward.gross, paid: reward.paid, difficulty: session.difficultyScore, durationMs: duration });
        const lastResult = { durationMs: duration, reward: reward.paid, gross: reward.gross, difficulty: session.difficultyLabel, difficultyScore: session.difficultyScore, formal: session.formal };
      const nextType = session.formal ? '' : session.type; const next = createSession(nextType, session.formal, false, false, false); next.lastResult = lastResult; jsonSet(workSessionKey(id), next); return replyView(ctx, msg, workView(p, next, `计算器过关！上一题毛报酬${reward.gross}，实际入账${reward.paid}，已自动进入下一题。`));
      }
      if (result.exhausted) {
        const duration = Math.max(1000, nowMs() - session.startedAt); workQuestionStats(p, session, false, 0, 0, duration); workBatchRecord(session, 'failed', { durationMs: duration }); const next = createSession(session.type, session.formal, false, false, false); return replyView(ctx, msg, workView(p, next, `计算器步数用尽，当前结果为${result.state.value}；已更新下一题。`));
      }
      jsonSet(workSessionKey(id), session); return replyView(ctx, msg, workView(p, session, `已连续执行${result.actions.length}个按钮，当前为${result.state.value}，还剩${result.state.stepsLeft}步。`));
    }
    if (session.status === 'solved' || session.status === 'revealed') return replyView(ctx, msg, workView(p, session, session.status === 'solved' ? '本次专家挑战已经结算；重新发送“.打工 专家数独”可领取新题。' : '本次专家题已经结束；重新发送“.打工 专家数独”可领取新题。'));
    const answer = ['答案', '作答', '提交', 'answer'].indexOf(lower) >= 0 ? workAnswerText(args.slice(1)) : workAnswerText(args);
    if (!answer) return replyView(ctx, msg, workView(p, session, '请提交答案；也可以发送“开始”换一道题。'));
    const duration = Math.max(1000, nowMs() - session.startedAt);
    if (workMatchAnswer(session, answer)) {
      const fast = !!(session.isExpert && session.antiCheat && duration < int(session.antiCheat.minMs, 12000));
      if (session.isExpert) {
        const gross = fast ? 0 : workReward(session, duration); p.coins += gross; expertQuestionStats(p, session, true, gross, duration, false, fast);
        session.status = 'solved'; session.lastResult = { durationMs: duration, reward: gross, gross, difficulty: session.difficultyLabel, difficultyScore: session.difficultyScore, formal: true };
        jsonSet(workSessionKey(id), session); return replyView(ctx, msg, workView(p, session, `专家数独回答正确！${fast ? '用时过短，本次不发放' : `获得${gross}`}游戏币。本次单题挑战已结算。`));
      }
      const reward = session.formal ? workApplyReward(p, session, duration) : (() => { const gross = workReward(session, duration); workQuestionStats(p, session, true, gross, 0, duration); return { gross, paid: 0 }; })();
      workBatchRecord(session, 'solved', { gross: reward.gross, paid: reward.paid, difficulty: session.difficultyScore, durationMs: duration });
      const lastResult = { durationMs: duration, reward: reward.paid, gross: reward.gross, difficulty: session.difficultyLabel, difficultyScore: session.difficultyScore, formal: session.formal };
      const nextType = session.formal ? '' : session.type; const next = createSession(nextType, session.formal, false, false, false); next.lastResult = lastResult; jsonSet(workSessionKey(id), next); return replyView(ctx, msg, workView(p, next, `回答正确！上一题毛报酬${reward.gross}，实际入账${reward.paid}，已自动进入下一题。`));
    }
    const stats = p.stats.work || emptyGameStats(); if (!session.isExpert) { stats.workWrong++; stats.workCurrentStreak = 0; stats.workLastType = session.type; p.stats.work = stats; saveProfile(p); }
    workBatchRecord(session, 'wrong');
    session.wrongCount++; session.attemptsLeft--;
    if (session.isExpert && session.attemptsLeft <= 0) { session.status = 'revealed'; expertQuestionStats(p, session, false, 0, duration, true, false); jsonSet(workSessionKey(id), session); return replyView(ctx, msg, workView(p, session, '两次机会已用尽，服务端答案已显示。')); }
    if (!session.isExpert && session.attemptsLeft < 0) { workBatchRecord(session, 'failed', { durationMs: duration }); const next = createSession(session.type, session.formal, false, false, false); return replyView(ctx, msg, workView(p, next, `答案再次错误（${workWrongCount(session, answer)}），已更新为下一题。`)); }
    jsonSet(workSessionKey(id), session); return replyView(ctx, msg, workView(p, session, `答案错误：${workWrongCount(session, answer)}。${session.isExpert ? `还可再试${session.attemptsLeft}次。` : '这是唯一一次容错机会；再次答错将更新题目。'}`));
  }

  // -------------------- 恶魔轮盘赌（SpaceAdventure V3.1 迁移） --------------------
  // 保留原插件的模式、道具、符文和回合规则；房间改为合集统一 KV 持久化，
  // 奖励使用合集游戏币，统计写入 profile.demon，普通 Bot 与官方 Bot 均可用。
  const DEMON_ITEMS = {
    '锯子': { desc: '锯掉枪管，本回合伤害+1（不叠加）' }, '手铐': { desc: '限制对方，跳过其下一回合（不能重复使用）' },
    '放大镜': { desc: '查看当前子弹虚实，持续到开枪' }, '香烟': { desc: '取出一发空弹并打乱弹仓内子弹排序' },
    '红牛': { desc: '回复1点生命' }, '巧克力': { desc: '装填一发实弹，并打乱顺序' }, '花生': { desc: '装填一发空弹，并打乱顺序' },
    '邀请函': { desc: '抽取道具并跳过本回合；装填模式额外抽取一个' }, '口红': { desc: '随机拿走对方一个道具；对方无可夺道具时随机获得一个' },
    '扑克': { desc: '逆转当前子弹虚实' }, '转盘': { desc: '立刻重新装填一次弹仓' },
    '牛奶': { desc: '自己获得两个道具，其他存活玩家各获得一个' }, '金币': { desc: '购买任意一个其他道具' }
  };
  const DEMON_RUNES = {
    '硬币': { desc: '【被动】中弹概率永远为1/2' }, '魔弹': { desc: '【被动】1/4概率伤害+1' },
    '清霜剑': { desc: '【被动】1/3概率改变子弹目标' }, '不死图腾': { desc: '【被动】护身符破碎时血量+2' },
    '氪石': { desc: '【被动】护身符破碎时获得1枚金币' }, '小丑牌': { desc: '【被动】1/4概率逆转子弹虚实' },
    '眼罩': { desc: '【被动】无法知晓弹仓详情' }, '香水': { desc: '【被动】开枪时2/3概率触发其他符文，1/3概率再触发一次' }
  };
  const DEMON_MODES = {
    '简易': { hp: [2, 3], items: [], maxItems: 0, draw: 0, method: 'none', desc: '没有道具的纯粹对局。', amulets: 0, score: 50, multiplier: 0.8 },
    '经典': { hp: [4, 4], items: ['手铐', '锯子', '花生', '巧克力', '香烟', '红牛', '邀请函', '放大镜'], maxItems: 6, draw: 1, method: 'shoot', desc: '标准规则，一切以此为基础。', amulets: 0, score: 100, multiplier: 1 },
    '道具': { hp: [5, 5], items: 'all', maxItems: 8, draw: 4, method: 'reload', desc: '用于熟悉道具的模式，每次装弹都会抽取大量道具。', amulets: 1, score: 80, multiplier: 1.25 },
    '金币': { hp: [4, 4], items: ['金币'], maxItems: 6, draw: 1, method: 'shoot', desc: '纯粹的博弈，借助护身符产生的金币尝试反杀。', amulets: 2, runes: ['氪石'], score: 125, multiplier: 1.4 },
    '勇者': { hp: [5, 5], items: ['手铐', '锯子', '巧克力', '香烟', '红牛', '放大镜', '口红', '扑克', '转盘', '牛奶'], maxItems: 10, draw: 2, method: 'self', desc: '吞枪可以抽取道具，但要小心魔弹；运气与勇气都是胜负关键。', amulets: 0, runes: ['魔弹'], score: 80, multiplier: 1.15 },
    '秒杀': { hp: [2, 1], items: 'all', maxItems: 4, draw: 2, method: 'shoot', desc: '双方激情互秒，对局速度极快。', amulets: 1, runes: ['不死图腾', '氪石'], score: 10, multiplier: 0.4 },
    '薛定谔': { hp: [5, 5], items: 'all', maxItems: 10, draw: 4, method: 'reload', desc: '类似道具模式，但会有更多意外情况发生。', amulets: 2, runes: ['清霜剑', '魔弹', '小丑牌'], score: 50, multiplier: 0.55 },
    '量子': { hp: [4, 4], items: ['手铐', '锯子', '放大镜', '邀请函', '红牛', '口红', '牛奶'], maxItems: 8, draw: 1, method: 'shoot', desc: '无法观测的对局，中枪概率永远是1/2。', amulets: 1, runes: ['硬币', '眼罩'], score: 30, multiplier: 0.45 },
    '欧皇': { hp: [6, 6], items: 'all', maxItems: 10, draw: 2, method: 'shoot', desc: '非常混乱的模式，主要依靠运气而非实力。', amulets: 2, runes: 'all', score: 15, multiplier: 0.25 },
    '赌徒': { hp: [5, 5], items: ['手铐', '锯子', '巧克力', '香烟', '红牛', '放大镜', '口红', '转盘', '牛奶', '金币'], maxItems: 10, draw: 3, method: 'self', desc: '一切都无法知晓，压迫感和紧张感极强。', amulets: 0, runes: ['魔弹', '小丑牌', '眼罩'], score: 15, multiplier: 0.6 },
    '随机': { hp: ['2+2d3', '3+2d2'], items: 'all', maxItems: 8, draw: 2, method: 'damage', desc: '纯随机，谁也不知道接下来会发生什么。', amulets: 3, runes: ['香水'], score: 15, multiplier: 0.2 }
  };
  function demonRoomKey(gid) { return roomKey('demon', gid); }
  function demonEntryFee(modeKey) { const config = DEMON_MODES[modeKey] || DEMON_MODES['经典']; return Math.max(1, Math.round(ENTRY.demon * (Number(config.multiplier) || 1))); }
  function demonStats(p) { if (!p.demon || typeof p.demon !== 'object') p.demon = {}; const defaults = { wins: 0, losses: 0, rating: 1000, damage: 0, kills: 0 }; Object.keys(defaults).forEach((key) => { if (p.demon[key] === undefined || p.demon[key] === null) p.demon[key] = defaults[key]; }); if (Object.prototype.hasOwnProperty.call(p.demon, 'coins')) delete p.demon.coins; if (!p.demon.modeStats || typeof p.demon.modeStats !== 'object') p.demon.modeStats = {}; return p.demon; }
  function demonRollHp(value) { const text = String(value || 4); const match = /^(\d+)\+(\d+)d(\d+)$/i.exec(text); if (!match) return Math.max(1, int(value, 4)); let total = int(match[1], 0); for (let i = 0; i < int(match[2], 0); i++) total += 1 + Math.floor(Math.random() * int(match[3], 1)); return total; }
  function demonPool(config) { return config.items === 'all' ? Object.keys(DEMON_ITEMS).filter((name) => name !== '金币') : (config.items || []).slice(); }
  function demonShuffle(list) { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; }
  function demonBotName() {
    let configured = '';
    try { configured = String(seal.ext.getStringConfig(ext, '骰娘称呼') || '').trim(); } catch (e) { configured = ''; }
    if (configured && configured !== '骰娘') return configured;
    return pick(['姜修泽', '葛明治', '阿日', '严茫熙', '亨德森']);
  }
  class DemonGame {
    constructor(id, mode, hostId, hostName, hostPaid) { this.id = String(id); this.modeKey = DEMON_MODES[mode] ? mode : '经典'; this.config = DEMON_MODES[this.modeKey]; this.status = 'waiting'; this.entry = demonEntryFee(this.modeKey); this.entryPaidMode = true; this.players = [this.newPlayer(hostId, hostName, demonRollHp(this.config.hp[0]), hostPaid)]; this.turn = 0; this.shells = []; this.logs = [`等待挑战者加入（模式：${this.modeKey}）`]; this.lastBotLogs = []; this.lastTurnLogs = []; this.deadPlayers = []; this.round = 0; this.sawed = false; this.glassActive = false; this.glassResult = ''; this.blind = false; this.damageMod = 1; this.displayLive = 0; this.displayBlank = 0; this.isFirstRound = true; this.result = null; this.settled = false; }
    static revive(raw) { const game = Object.create(DemonGame.prototype); Object.assign(game, raw); const legacyFreeRoom = !Number.isFinite(Number(game.entry)); game.config = DEMON_MODES[game.modeKey] || DEMON_MODES['经典']; game.entry = legacyFreeRoom ? demonEntryFee(game.modeKey) : Math.max(0, int(game.entry, demonEntryFee(game.modeKey))); game.entryPaidMode = !legacyFreeRoom; game.players = game.players || []; game.players.forEach((p) => { if (legacyFreeRoom && !p.isBot) setRoomPlayerEligibility(p, false); else normalizeRoomPlayerEligibility(p); p.items = p.items || []; p.runes = p.runes || []; p.tempRunes = []; p.amulets = int(p.amulets, 0); p.amuletThreshold = int(p.amuletThreshold, game.config.amulets || 0); }); game.logs = game.logs || []; game.lastBotLogs = Array.isArray(game.lastBotLogs) ? game.lastBotLogs : []; game.lastTurnLogs = Array.isArray(game.lastTurnLogs) ? game.lastTurnLogs : []; game.deadPlayers = game.deadPlayers || []; game.displayLive = int(game.displayLive, game.shells.filter((x) => x === 1).length); game.displayBlank = int(game.displayBlank, game.shells.filter((x) => x === 0).length); game.glassActive = !!game.glassActive; game.glassResult = String(game.glassResult || ''); game.result = game.result || null; game.settled = !!game.settled; return game; }
    newPlayer(id, name, hp, paid) { const runes = this.config.runes === 'all' ? Object.keys(DEMON_RUNES) : (this.config.runes || []).slice(); const bot = isBotId(id); return { id, name, isBot: bot, paid: bot ? false : paid !== false, guest: !bot && paid === false, hp, maxHp: hp, amulets: this.config.amulets > 0 ? 1 : 0, amuletThreshold: this.config.amulets || 0, items: [], runes, tempRunes: [], frozen: false, skipped: false, firstShotSkipped: false, damageDealt: 0, kills: 0 }; }
    join(id, name, paid) { if (this.status !== 'waiting') return { ok: false, msg: '游戏已开始。' }; if (this.players.length >= 4) return { ok: false, msg: '房间已满。' }; if (this.players.some((p) => p.id === id)) return { ok: false, msg: '你已在房间中。' }; this.players.push(this.newPlayer(id, name, demonRollHp(this.config.hp[1]), paid)); this.logs.push(`${name}${paid === false ? '（游客）' : ''} 加入房间（${this.players.length}/4）。`); return { ok: true }; }
    drawItems(p, count, pool) { const source = (pool || demonPool(this.config)).filter((name) => name !== '金币'); const got = []; for (let i = 0; i < count && p.items.length < this.config.maxItems && source.length; i++) { const item = source[Math.floor(Math.random() * source.length)]; p.items.push(item); got.push(item); } return got; }
    start() { if (this.players.length < 2) return '至少需要两名玩家。'; this.status = 'playing'; demonShuffle(this.players); this.turn = Math.floor(Math.random() * this.players.length); this.logs.push(`顺序已决定：${this.players.map((p, i) => `P${i + 1} ${p.name}`).join('、')}；首手：${this.current().name}`); const n = this.config.draw || 0; if (n > 0) { for (let offset = 0; offset < this.players.length; offset++) { const p = this.players[(this.turn + offset) % this.players.length]; if (offset > 0) this.drawItems(p, n); if (offset > 2) this.drawItems(p, n); } this.logs.push(`初始道具按行动顺序发放：${this.players.map((p, i) => `${p.name}${p.items.length ? `×${p.items.length}` : '无'}`).join('、')}`); } this.startRound(); return ''; }
    startRound() { this.round++; this.sawed = false; this.glassActive = false; this.glassResult = ''; this.damageMod = 1; const live = Math.floor(Math.random() * 4) + 1; const total = live + Math.floor(Math.random() * 5); this.shells = demonShuffle(Array(live).fill(1).concat(Array(total - live).fill(0))); this.displayLive = live; this.displayBlank = total - live; this.blind = this.players.some((p) => this.hasRune(p, '眼罩')); if (!this.isFirstRound && this.config.method === 'reload') this.players.forEach((p) => { const got = this.drawItems(p, this.config.draw || 0); if (got.length) this.logs.push(`${p.name} 获得：${got.join('、')}`); }); this.isFirstRound = false; this.logs.push(`第${this.round}轮装填：${this.blind ? '弹仓详情隐藏' : `${live}实弹/${total - live}空弹`}`); }
    current() { return this.players[this.turn]; }
    nextTurn() { let guard = 0; do { this.turn = (this.turn + 1) % this.players.length; guard++; } while (guard <= this.players.length && this.current().hp <= 0); const p = this.current(); if (p.frozen && !p.skipped && p.hp > 0) { p.skipped = true; this.logs.push(`⛓️ ${p.name} 被手铐限制，跳过回合。`); this.nextTurn(); if (this.current() && this.current().hp > 0) this.current().firstShotSkipped = true; } else if (p.frozen && p.skipped) { p.frozen = false; p.skipped = false; this.logs.push(`⛓️ ${p.name} 挣脱了手铐。`); } }
    hasRune(p, rune) { return (p.runes || []).indexOf(rune) >= 0 || (p.tempRunes || []).indexOf(rune) >= 0; }
    target(arg) { if (arg === 'self') return this.current(); if (arg === 'opp' && this.players.length === 2) return this.players[1 - this.turn]; const n = Number(arg); return Number.isInteger(n) && n >= 1 && n <= this.players.length ? this.players[n - 1] : null; }
    breakRunes(target) { if (this.hasRune(target, '不死图腾')) { target.hp = Math.min(target.maxHp, target.hp + 2); this.logs.push(`🗿 ${target.name} 的不死图腾生效，HP+2。`); } if (this.hasRune(target, '氪石') && target.items.length < this.config.maxItems) { target.items.push('金币'); this.logs.push(`💎 ${target.name} 的氪石生效，获得一枚金币。`); } }
    damage(target, amount, source) { const old = target.hp; const threshold = int(target.amuletThreshold, 0); let next = Math.max(0, old - amount); const broken = target.amulets > 0 && old > threshold && next <= threshold; if (broken) { target.amulets--; next = threshold; this.logs.push(`🛡️ ${target.name} 的护身符破碎，生命锁定在${threshold}。`); } target.hp = next; if (broken) this.breakRunes(target); const actual = Math.max(0, old - target.hp); if (source && source !== target) { source.damageDealt = (source.damageDealt || 0) + actual; if (target.hp === 0 && old > 0) { source.kills = (source.kills || 0) + 1; this.logs.push(`💀 ${source.name} 击杀了 ${target.name}。`); } } else if (target.hp === 0 && old > 0) this.logs.push(`💀 ${target.name} 自裁或意外死亡。`); if (target.hp === 0 && this.deadPlayers.indexOf(target) < 0) this.deadPlayers.push(target); }
    triggerPerfume(p) { const rune = pick(['硬币', '魔弹', '清霜剑', '小丑牌']); if (p.tempRunes.indexOf(rune) < 0) p.tempRunes.push(rune); this.logs.push(`🌸 ${p.name} 的香水临时触发【${rune}】。`); }
    shoot(arg) { const p = this.current(); let target = this.target(arg); if (!target || target.hp <= 0) return { ok: false, msg: '目标无效或已死亡。' }; if (!this.shells.length) { this.startRound(); return { ok: true, msg: '弹仓为空，已重新装填。' }; } p.tempRunes = []; if (this.hasRune(p, '香水') && Math.random() < 2 / 3) { this.triggerPerfume(p); if (Math.random() < 1 / 3) this.triggerPerfume(p); } if (this.hasRune(p, '小丑牌') && Math.random() < .25) { this.shells[0] = 1 - this.shells[0]; this.logs.push('🃏 小丑牌逆转了当前子弹虚实。'); } if (this.hasRune(p, '清霜剑') && Math.random() < 1 / 3) { const alive = this.players.filter((x) => x.hp > 0); target = pick(alive) || target; this.logs.push(`❄️ 清霜剑改变了目标：${target.name}。`); } let isLive = this.shells.shift() === 1; if (this.hasRune(p, '硬币')) { isLive = Math.random() < .5; this.logs.push(`🪙 硬币判定为${isLive ? '实弹' : '空包'}。`); } let amount = this.damageMod; if (isLive && this.hasRune(p, '魔弹') && Math.random() < .25) { amount++; this.logs.push('🔮 魔弹令伤害+1。'); } let repeat = false; if (isLive) { this.damage(target, amount, p); this.logs.push(`💥 ${p.name} 对 ${target.name} 开枪：实弹，-${amount} HP。`); if (this.config.method === 'damage') this.drawItems(target, this.config.draw || 0); if (this.config.method === 'shoot' && !p.firstShotSkipped) this.drawItems(p, this.config.draw || 0); this.nextTurn(); } else { repeat = target === p; this.logs.push(`💨 ${p.name} 对 ${target.name} 开枪：空包${repeat ? '，获得再动' : ''}。`); if (repeat && this.config.method === 'self') this.drawItems(p, this.config.draw || 0); if (!repeat) { if (this.config.method === 'shoot' && !p.firstShotSkipped) this.drawItems(p, this.config.draw || 0); this.nextTurn(); } } this.displayLive = this.shells.filter((x) => x === 1).length; this.displayBlank = this.shells.filter((x) => x === 0).length; p.tempRunes = []; p.firstShotSkipped = false; this.damageMod = 1; this.sawed = false; this.glassActive = false; this.glassResult = ''; const over = this.checkOver(); if (!over && (!this.shells.length || !this.shells.some((s) => s === 1))) this.startRound(); return { ok: true, gameOver: over, winner: this.players.find((x) => x.hp > 0), repeat }; }
    use(item, arg) { const p = this.current(); const idx = p.items.indexOf(item); if (idx < 0 || !DEMON_ITEMS[item]) return { ok: false, msg: '你没有这个道具。' }; let target = this.target(arg || (this.players.length === 2 ? 'opp' : null)); if ((item === '手铐' || item === '口红') && (!target || target === p || target.hp <= 0)) return { ok: false, msg: '请指定合法的存活目标。' }; p.items.splice(idx, 1); let end = false; let detail = ''; switch (item) { case '锯子': if (this.sawed) { p.items.push(item); return { ok: false, msg: '本轮已经锯过枪管。' }; } this.damageMod++; this.sawed = true; detail = '本回合伤害+1'; break; case '手铐': if (target.frozen) { p.items.push(item); return { ok: false, msg: '目标已经被手铐限制。' }; } target.frozen = true; detail = `限制了${target.name}`; break; case '放大镜': if (!this.shells.length) { p.items.push(item); return { ok: false, msg: '弹仓为空，无法使用放大镜。' }; } this.glassActive = true; this.glassResult = this.shells[0] === 1 ? '实弹' : '空包'; detail = `下一发子弹是${this.glassResult}`; break; case '香烟': { if (!this.shells.length) { p.items.push(item); return { ok: false, msg: '弹仓为空。' }; } const i = this.shells.indexOf(0); const removed = i >= 0 ? 0 : 1; this.shells.splice(i >= 0 ? i : 0, 1); demonShuffle(this.shells); detail = `取出一发${removed ? '实弹' : '空包'}并打乱弹仓`; if (!this.shells.length) this.startRound(); break; } case '红牛': p.hp = Math.min(p.maxHp, p.hp + 1); detail = 'HP+1'; break; case '巧克力': this.shells.push(1); demonShuffle(this.shells); detail = '装入一发实弹并打乱'; break; case '花生': this.shells.push(0); demonShuffle(this.shells); detail = '装入一发空弹并打乱'; break; case '邀请函': { const got = this.drawItems(p, this.config.method === 'reload' ? 3 : 2); detail = `获得${got.join('、') || '无新道具'}并结束回合`; end = true; break; } case '口红': { const avail = target.items.filter((x) => x !== '口红' && x !== '金币'); if (avail.length) { const stolen = pick(avail); target.items.splice(target.items.indexOf(stolen), 1); p.items.push(stolen); detail = `从${target.name}处拿走${stolen}`; } else { const got = this.drawItems(p, 1); detail = `${target.name}没有可夺道具，改为获得${got[0] || '无新道具'}`; } break; } case '扑克': if (this.shells.length) { this.shells[0] = 1 - this.shells[0]; if (this.glassActive) this.glassResult = this.shells[0] === 1 ? '实弹' : '空包'; detail = '逆转当前子弹虚实，公开弹仓计数不变'; } break; case '转盘': this.startRound(); detail = '重新装填弹仓'; break; case '牛奶': { const own = this.drawItems(p, 2); this.players.filter((x) => x !== p && x.hp > 0).forEach((x) => this.drawItems(x, 1)); detail = `自己获得${own.join('、') || '无新道具'}，其他存活玩家各抽取一个`; break; } case '金币': p.items.push(item); return { ok: false, msg: '金币请使用“恶魔 购买 <道具>”。' }; } if (item !== '扑克') { this.displayLive = this.shells.filter((x) => x === 1).length; this.displayBlank = this.shells.filter((x) => x === 0).length; } if (end) this.nextTurn(); this.logs.push(`${p.name} 使用【${item}】：${detail}。`); return { ok: true, msg: detail }; }
    checkOver() { return this.players.filter((p) => p.hp > 0).length <= 1; }
    rewards() { const alive = this.players.find((p) => p.hp > 0); const ordered = this.deadPlayers.filter((p, i, list) => list.indexOf(p) === i); if (alive && ordered.indexOf(alive) < 0) ordered.push(alive); const total = this.players.length; const multiplier = Math.max(0.1, Number(this.config.multiplier) || 1); return ordered.map((p, i) => { const rank = total - i; const dmg = p.damageDealt || 0; const kills = p.kills || 0; const base = this.config.score; let rawRating = dmg * 2 + kills * 10; if (rank === 1) rawRating += base; else if (total === 2) rawRating -= Math.floor(base / 2); else if (total === 3 && i === 0) rawRating -= Math.floor(base / 2); else if (total === 3 && i === 1) rawRating = dmg * 3 + kills * 15; else if (total >= 4 && i === 0) rawRating -= base; else if (total >= 4 && i === 1) rawRating -= Math.floor(base / 2); const rawCoins = dmg * 2 + kills * 10; return { player: p, rank, rating: Math.round(rawRating * multiplier), coins: Math.floor(rawCoins * multiplier), multiplier }; }); }
  }
  // 局内“金币”是一次性兑换道具；兼容“使用 金币 道具”写法，避免被普通道具效果分支拦截。
  const demonUseItem = DemonGame.prototype.use;
  DemonGame.prototype.use = function (item, arg) {
    if (item === '金币') {
      const player = this.current(); const desired = String(arg || '').trim();
      const index = player ? player.items.indexOf('金币') : -1;
      if (index < 0) return { ok: false, msg: '你没有金币道具。' };
      if (!desired || desired === '金币' || !DEMON_ITEMS[desired]) return { ok: false, msg: '请在“金币”后指定要购买的其他道具，例如：使用 金币 锯子。' };
      // 金币本身占一个道具栏位，兑换时是“替换”而非新增；满栏也可以正常兑换。
      if (player.items.length > this.config.maxItems) return { ok: false, msg: '道具栏已超出上限，无法使用金币购买。' };
      player.items.splice(index, 1); player.items.push(desired);
      const detail = `消耗金币购买【${desired}】`;
      this.logs.push(`${player.name} ${detail}。`);
      return { ok: true, msg: `已${detail}。` };
    }
    return demonUseItem.call(this, item, arg);
  };
  function demonView(room, viewerId, quote, menuTab) {
    const me = room && room.players ? room.players.find((p) => p.id === viewerId) : null;
    const menuLines = menuTab === 'wiki'
      ? ['【道具】', ...Object.keys(DEMON_ITEMS).map((name) => `${name}：${DEMON_ITEMS[name].desc}`), '【符文】', ...Object.keys(DEMON_RUNES).map((name) => `${name}：${DEMON_RUNES[name].desc}`)]
      : menuTab === 'modes'
        ? Object.keys(DEMON_MODES).map((name) => `${name}：${DEMON_MODES[name].desc}`)
      : ['.恶魔 人机 [模式]（入场按模式倍率）', '.恶魔 开房 [模式] / 加入 / 开始（入场按模式倍率）', '.恶魔 开枪 自己|对手|序号', '.恶魔 使用 <道具> [目标]', '.恶魔 使用 金币 <道具>（消耗局内金币兑换；不消耗回合）', '.恶魔 购买 <道具>（同样消耗局内金币）', '.恶魔 盘面 / 模式 / 百科 / 排行 / 认输'];
    const actionLogs = room && Array.isArray(room.lastTurnLogs) && room.lastTurnLogs.length ? room.lastTurnLogs.slice(-24) : room && Array.isArray(room.lastBotLogs) && room.lastBotLogs.length ? room.lastBotLogs.slice(-24) : room ? room.logs.slice(-24) : [];
    return {
      kind: 'demon', title: room ? `恶魔轮盘赌 · ${room.modeKey}` : '恶魔轮盘赌',
      subtitle: room ? `房间 ${room.id} · 入场${room.entry} · 胜者返还${room.entry * 2} · ${room.status === 'playing' ? `第${room.round}轮 · 当前：${room.current() ? room.current().name : '—'}` : room.status === 'finished' ? '赌局结算' : '等待开始'}` : menuTab === 'wiki' ? '道具与符文百科' : 'SpaceAdventure V3.1 完整迁移 · 按模式倍率调整入场与返还',
      demonScene: room ? {
        mode: room.status, roomId: room.id, modeKey: room.modeKey, modeMultiplier: DEMON_MODES[room.modeKey].multiplier || 1, round: room.round, turn: room.current() ? room.current().name : '', viewerCurrent: !!me && room.current() === me, viewerItems: me ? me.items.slice() : [], shells: null, shellCount: room.shells.length, shellLive: room.displayLive, shellBlank: room.displayBlank,
        glassActive: !!room.glassActive, glassResult: room.glassActive ? room.glassResult : '', players: room.players.map((p, i) => ({ index: i + 1, name: roomPlayerName(p), hp: p.hp, maxHp: p.maxHp, amulets: p.amulets, items: p.items.slice(), runes: p.runes, current: room.current() === p, dead: p.hp <= 0, damage: p.damageDealt || 0, kills: p.kills || 0 })), logs: actionLogs, logTitle: '本回合行动记录', rules: DEMON_MODES[room.modeKey].desc
      } : {
        mode: 'menu', menuTab: menuTab || 'modes', modes: Object.keys(DEMON_MODES).map((name) => ({ name, hp: DEMON_MODES[name].hp, desc: DEMON_MODES[name].desc, multiplier: DEMON_MODES[name].multiplier || 1 })),
        items: Object.keys(DEMON_ITEMS).map((name) => ({ name, desc: DEMON_ITEMS[name].desc })), runes: Object.keys(DEMON_RUNES).map((name) => ({ name, desc: DEMON_RUNES[name].desc }))
      },
      lines: room ? [`模式：${room.modeKey} · 结算倍率 x${Number(DEMON_MODES[room.modeKey].multiplier || 1).toFixed(2)} · 入场${room.entry}，胜者返还${room.entry * 2}`, ...room.players.map((p) => `${roomPlayerName(p)} ${p.hp}/${p.maxHp}HP · 道具：${p.items.join('、') || '无'}`), `弹仓剩余：${room.displayLive}发实弹 / ${room.displayBlank}发空弹（仅显示数量）`, ...(room.glassActive ? [`放大镜情报：下一发子弹是${room.glassResult}。`] : []), ...actionLogs] : menuLines, quote: quote || ''
    };
  }
  function demonTargetText(value) { const text = String(value || '').toLowerCase(); if (['自己', '自身', '吞枪', 'self'].indexOf(text) >= 0) return 'self'; if (['对手', '对方', 'opp', 'enemy'].indexOf(text) >= 0) return 'opp'; return text; }
  function demonRunBots(room) { const logStart = room && room.logs ? room.logs.length : 0; let guard = 0; while (room && room.status === 'playing' && !room.checkOver() && isBotId(room.current().id) && guard++ < 10) { const bot = room.current(); room.logs.push(`🤖 ${bot.name} 开始行动（弹仓剩余${room.shells.length}发）。`); const usable = bot.items.find((item) => item === '红牛' && bot.hp < bot.maxHp) || bot.items.find((item) => ['锯子', '放大镜', '香烟', '巧克力', '花生', '转盘'].indexOf(item) >= 0 && Math.random() < .35); if (usable) room.use(usable); const opponents = room.players.filter((p) => p.hp > 0 && p !== bot); if (!opponents.length) break; const target = room.shells.length && room.shells[0] === 0 && Math.random() < .75 ? 'self' : String(room.players.indexOf(pick(opponents)) + 1); room.shoot(target); } if (room && room.status === 'playing' && !room.checkOver() && isBotId(room.current().id)) { const bot = room.current(); const opponents = room.players.filter((p) => p.hp > 0 && p !== bot); if (opponents.length) { room.logs.push(`🤖 ${bot.name} 结束连续吞枪，改为向对手开枪。`); room.shoot(String(room.players.indexOf(pick(opponents)) + 1)); } } if (room) { room.lastBotLogs = room.logs.slice(logStart).map((line) => `弹仓记录：${String(line)}`); room.lastTurnLogs = room.lastTurnLogs || []; room.lastTurnLogs = room.lastTurnLogs.concat(room.lastBotLogs).slice(-24); } return room && room.checkOver(); }

  async function handleDemon(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const gid = groupId(ctx, msg); const key = demonRoomKey(gid); const op = String(args[0] || '').toLowerCase(); let raw = jsonGet(key, null); let room = raw ? DemonGame.revive(raw) : null;
    if (!args.length) return replyView(ctx, msg, demonView(room, id, room ? '' : '恶魔轮盘赌已迁移完成；先选择模式再创建房间。'));
    if (['帮助', 'help', '模式', 'list'].indexOf(op) >= 0) return replyView(ctx, msg, demonView(null, id, Object.keys(DEMON_MODES).map((m) => `${m}：${DEMON_MODES[m].desc}`).join('\n'), 'modes'));
    if (['百科', 'wiki'].indexOf(op) >= 0) return replyView(ctx, msg, demonView(null, id, '13种道具与8种符文均沿用SpaceAdventure V3.1规则。', 'wiki'));
    if (['排行', 'rank'].indexOf(op) >= 0) { const board = jsonGet('aff.demon.board.v1', []); return replyView(ctx, msg, demonView(room, id, board.length ? board.map((x, i) => `${i + 1}. ${x.name} · 评分${x.rating} · 胜${x.wins}/负${x.losses}`).join('\n') : '恶魔轮盘赌暂无排行数据。')); }
    if (['人机', '单人', 'pve'].indexOf(op) >= 0) { if (room && room.status !== 'finished') return replyView(ctx, msg, demonView(room, id, '当前群已有恶魔轮盘赌房间。')); const mode = DEMON_MODES[args[1]] ? args[1] : '经典'; const entry = demonEntryFee(mode); const profile = loadProfile(id, name); if (!charge(profile, entry)) return replyView(ctx, msg, { kind: 'profile', title: '无法入场', lines: [`需要 ${entry} 游戏币`, `当前余额 ${profile.coins}`], quote: template(ctx, '文案_余额不足', { name }) }); room = new DemonGame(`${Date.now()}-${Math.floor(Math.random() * 1000)}`, mode, id, name, true); room.join(`${BOT_PREFIX}demon`, demonBotName()); room.start(); if (demonRunBots(room)) { room.status = 'finished'; const winner = room.players.find((p) => p.hp > 0); room.result = winner ? `${winner.name} 获胜` : '无人存活'; room.lastTurnLogs = (room.lastTurnLogs || []).concat([`🏁 赌局结束：${room.result}。`]).slice(-24); await demonSettle(room, ctx, msg); } jsonSet(key, room); return replyView(ctx, msg, demonView(room, id, room.status === 'finished' ? `赌局结束：${room.result || '只剩最后一名存活者。'}` : `恶魔赌局已开始，已支付${entry}游戏币入场费。`)); }
    if (['create', '开房', '创建'].indexOf(op) >= 0) { if (room && room.status !== 'finished') return replyView(ctx, msg, demonView(room, id, '当前群已有恶魔轮盘赌房间。')); const mode = DEMON_MODES[args[1]] ? args[1] : '经典'; const entry = demonEntryFee(mode); const profile = loadProfile(id, name); const paid = charge(profile, entry); room = new DemonGame(`${Date.now()}-${Math.floor(Math.random() * 1000)}`, mode, id, name, paid); jsonSet(key, room); return replyView(ctx, msg, demonView(room, id, paid ? `房间已创建，已支付${entry}游戏币入场费。发送“恶魔 加入”与“恶魔 开始”。` : guestAdmissionQuote(ctx, name, entry))); }
    if (!room) return replyView(ctx, msg, demonView(null, id, '你当前不在恶魔轮盘赌房间中。'));
    if (['加入', 'join'].indexOf(op) >= 0) { if (room.status !== 'waiting') return replyView(ctx, msg, demonView(room, id, '游戏已开始。')); const profile = loadProfile(id, name); const paid = charge(profile, room.entry); const res = room.join(id, name, paid); if (!res.ok) { if (paid) { profile.coins += room.entry; saveProfile(profile); } return replyView(ctx, msg, demonView(room, id, res.msg)); } jsonSet(key, room); return replyView(ctx, msg, demonView(room, id, paid ? `${name} 已加入并支付${room.entry}游戏币入场费。` : guestAdmissionQuote(ctx, name, room.entry))); }
    if (['开始', 'start'].indexOf(op) >= 0) { if (room.players[0].id !== id) return replyView(ctx, msg, demonView(room, id, '只有房主可以开始。')); const err = room.start(); if (err) return replyView(ctx, msg, demonView(room, id, err)); if (demonRunBots(room)) { room.status = 'finished'; const winner = room.players.find((p) => p.hp > 0); room.result = winner ? `${winner.name} 获胜` : '无人存活'; room.lastTurnLogs = (room.lastTurnLogs || []).concat([`🏁 赌局结束：${room.result}。`]).slice(-24); await demonSettle(room, ctx, msg); } jsonSet(key, room); return replyView(ctx, msg, demonView(room, id, room.status === 'finished' ? `赌局结束：${room.result}，结算已写入档案。` : '赌局开始。')); }
    if (['盘面', '状态', 'board', 'status'].indexOf(op) >= 0) return replyView(ctx, msg, demonView(room, id));
    if (['退出', 'leave'].indexOf(op) >= 0 && room.status === 'waiting') { const leaving = room.players.find((player) => player.id === id); const wasPaid = isSettlementEligible(leaving); const entry = room.entry; const err = cancelWaitingRoom(room, id); if (!room.players.length) clearKey(key); else jsonSet(key, room); return replyView(ctx, msg, demonView(room, id, err || (wasPaid ? `已退出并退还${entry}游戏币入场费。` : '游客席位已取消；本次没有收取入场费。'))); }
    if (['认输', '退出', 'quit', 'surrender'].indexOf(op) >= 0) { const p = room.players.find((x) => x.id === id); if (!p || p.hp <= 0) return replyView(ctx, msg, demonView(room, id, '你不在存活玩家中。')); p.hp = 0; if (room.deadPlayers.indexOf(p) < 0) room.deadPlayers.push(p); room.logs.push(`${p.name} 认输并退出赌局。`); if (room.current() === p && !room.checkOver()) room.nextTurn(); if (room.checkOver()) { room.status = 'finished'; await demonSettle(room, ctx, msg); clearKey(key); } else { jsonSet(key, room); } return replyView(ctx, msg, demonView(room, id, '你已认输。')); }
    if (room.status !== 'playing') return replyView(ctx, msg, demonView(room, id, '请先开始房间。')); if (room.current().id !== id) return replyView(ctx, msg, demonView(room, id, '还没轮到你。'));
    const humanLogStart = room.logs.length; let result = null; if (['开枪', '射击', 'shoot'].indexOf(op) >= 0) result = room.shoot(demonTargetText(args[1] || (room.players.length === 2 ? 'opp' : ''))); else if (['使用', 'use', '道具'].indexOf(op) >= 0) result = room.use(args[1], demonTargetText(args[2])); else if (['购买', 'buy'].indexOf(op) >= 0) { const p = room.current(); const item = args.slice(1).join(' '); if (p.items.indexOf('金币') < 0 || !DEMON_ITEMS[item] || item === '金币') result = { ok: false, msg: '需要持有金币且指定有效道具。' }; else { p.items.splice(p.items.indexOf('金币'), 1); p.items.push(item); room.logs.push(`${p.name} 消耗金币购买【${item}】。`); result = { ok: true, msg: `已购买${item}。` }; } } else result = { ok: false, msg: '可用操作：开枪、使用、购买、盘面。' };
    if (!result.ok) return replyView(ctx, msg, demonView(room, id, result.msg)); room.lastTurnLogs = room.logs.slice(humanLogStart); if (!result.gameOver) result.gameOver = demonRunBots(room); if (result.gameOver) { room.status = 'finished'; const winner = room.players.find((p) => p.hp > 0); room.result = winner ? `${winner.name} 获胜` : '无人存活'; room.lastTurnLogs = room.lastTurnLogs.concat([`🏁 赌局结束：${room.result}。`]).slice(-24); await demonSettle(room, ctx, msg); jsonSet(key, room); return replyView(ctx, msg, demonView(room, id, `赌局结束：${room.result}，结算已写入档案。`)); } jsonSet(key, room); return replyView(ctx, msg, demonView(room, id, result.msg || ''));
  }
  async function demonSettle(room, ctx, msg) { if (!room || room.settled) return; room.settled = true; const rewards = room.rewards(); const winner = room.players.find((player) => player.hp > 0) || null; const oldBoard = jsonGet('aff.demon.board.v1', []); rewards.forEach((r) => { const player = r.player; const won = !!winner && player === winner; const rankIndex = Math.max(0, r.rank - 1); const delta = won ? rankedAffection(0, room.players.length) : winner ? rankedAffection(rankIndex, room.players.length) : affectionRules().loss; player.affectionDelta = 0; player.coinReward = 0; if (!isSettlementEligible(player)) { if (!player.isBot) room.logs.push(`${player.name} 以游客身份完成本场，不结算游戏币、好感与档案。`); return; } const p = loadProfile(player.id, player.name); const ds = demonStats(p); if (won) ds.wins++; else ds.losses++; ds.rating = Math.max(0, ds.rating + r.rating); ds.damage += player.damageDealt || 0; ds.kills += player.kills || 0; ds.modeStats[room.modeKey] = (ds.modeStats[room.modeKey] || 0) + 1; const entryReturn = won ? room.entry * 2 : 0; const bonusCoins = r.coins; p.coins += entryReturn + bonusCoins; changeAffection(p, delta); recordGame(p, 'demon', won ? 'win' : 'loss', r.rating, entryReturn + bonusCoins - room.entry, { affectionDelta: delta }); player.affectionDelta = delta; player.coinReward = entryReturn + bonusCoins; room.logs.push(`${player.name}${won ? ' 获胜' : ' 落败'}：好感 ${signedValue(delta)}${entryReturn ? `，获得 ${entryReturn} 游戏币（两倍入场费回报）` : ''}${bonusCoins ? `，另得 ${bonusCoins} 游戏币（伤害与击杀奖励）` : ''}。`); const entry = { id: player.id, name: player.name, rating: ds.rating, wins: ds.wins, losses: ds.losses }; const index = oldBoard.findIndex((x) => x.id === entry.id); if (index >= 0) oldBoard[index] = entry; else oldBoard.push(entry); }); oldBoard.sort((a, b) => b.rating - a.rating); jsonSet('aff.demon.board.v1', oldBoard.slice(0, 50)); }

  // -------------------- 指令处理 --------------------
  async function handleAuction(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const isPrivate = !!ctx.isPrivate; let gid = groupId(ctx, msg); if (isPrivate) gid = resolvePrivateActiveRoom('auction', id, gid); const key = roomKey('auction', gid);
    let profile = loadProfile(id, name); const defaultEntry = !args.length; const op = stripPrivatePrefillNote(args[0] || '状态').toLowerCase(); let roomResetQuote = '';
    const migratedAssistant = auctionNormalizeAssistant(profile.auctionAssistant);
    if (profile.auctionAssistant && migratedAssistant && migratedAssistant !== profile.auctionAssistant) { profile.auctionAssistant = migratedAssistant; saveProfile(profile); }
    let room = ensureRoomAvailable('auction', gid);
    if (!isPrivate && room && room.players.some((player) => player.id === id)) bindPrivateActiveRoom('auction', id, gid);
    if (room && int(room.auctionRate, 1000) !== AUCTION_RATE) {
      refundAuctionEscrow(room); clearKey(key); room = null; profile = loadProfile(id, name);
      roomResetQuote = `竞拍币兑换已更新为1:${AUCTION_RATE}；旧比例房间已清理，已锁定游戏币已经退还。`;
    }
    if (room && room.container && (
      room.container.fogVersion !== AUCTION_FOG_VERSION || room.container.gridWidth !== AUCTION_GRID_WIDTH || room.container.gridHeight !== AUCTION_GRID_HEIGHT ||
      (room.container.items || []).some((item) => !item.uid || !Array.isArray(item.shape))
    )) {
      refundAuctionEscrow(room); clearKey(key); room = null;
    }
    if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, auctionTutorialView(args[1]));
    if (['助手', 'assistant'].indexOf(op) >= 0) {
      const requestedRaw = String(args[1] || '').trim(); const requested = auctionNormalizeAssistant(requestedRaw);
      const roomPlayer = room ? room.players.find((player) => player.id === id) : null;
      if (!requestedRaw) return replyView(ctx, msg, auctionSelectionView(profile, profile.auctionAssistant ? `当前助手为“${profile.auctionAssistant}”；非游戏进行中可以更换。` : '请选择一名助手。'));
      if (!AUCTION_ASSISTANTS[requested]) return replyView(ctx, msg, auctionSelectionView(profile, `没有找到“${requestedRaw}”，请从助手列表中选择。`));
      if (room && room.status === 'playing' && roomPlayer) return replyView(ctx, msg, auctionRoomView(room, id, `竞拍进行中不能更换助手；本场仍由${roomPlayer.assistant}协助。`));
      profile.auctionAssistant = requested; saveProfile(profile);
      if (room && room.status === 'waiting' && roomPlayer) { roomPlayer.assistant = requested; jsonSet(key, room); return replyView(ctx, msg, auctionRoomView(room, id, `${name}已在开场前将助手更换为${requested}。`)); }
      return replyView(ctx, msg, auctionMenuView(profile, `${name}已经将竞拍助手更换为${requested}。`));
    }
    if (!profile.auctionAssistant || !AUCTION_ASSISTANTS[profile.auctionAssistant]) return replyView(ctx, msg, auctionSelectionView(profile));
    if (['图鉴', '收藏', 'collection'].indexOf(op) >= 0) return replyView(ctx, msg, gameStatsView(ctx, profile, '竞拍'));
    if (['场地', '地点', 'venue', 'venues'].indexOf(op) >= 0) return replyView(ctx, msg, auctionMenuView(profile, '无参数默认新手仓；场地只改变出货倾向，不承诺单局收益。'));
    if (defaultEntry && room && room.status === 'finished') { clearKey(key); return replyView(ctx, msg, auctionMenuView(profile)); }
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    const directVenue = auctionVenueName(op);
    if (['人机', 'solo', 'botgame'].indexOf(op) >= 0 || directVenue) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, auctionRoomView(room, id, '当前群已有竞拍房间。'));
      const requestedVenue = directVenue || auctionVenueName(args[1]) || '新手仓';
      if (!directVenue && args[1] && !auctionVenueName(args[1])) return replyView(ctx, msg, auctionMenuView(profile, `没有找到场地“${args[1]}”。`));
      const paid = profile.coins > 0; room = createAuctionRoom(id, name, paid, profile.auctionAssistant, requestedVenue, 'solo'); auctionAddBots(room, 3);
      const err = auctionStart(room); bindPrivateActiveRoom('auction', id, gid); jsonSet(key, room);
      return replyView(ctx, msg, auctionRoomView(room, id, err || (paid ? `${requestedVenue}开场；每轮公共揭开${AUCTION_PUBLIC_CELLS_PER_ROUND}格，你还可用“.竞拍 探索 A1”私查一格。` : guestAdmissionQuote(ctx, name, 0))));
    }
    if (['开房', '创建', 'create'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, auctionRoomView(room, id, '当前群已有竞拍房间。'));
      const requestedVenue = auctionVenueName(args[1]) || '新手仓';
      if (args[1] && !auctionVenueName(args[1])) return replyView(ctx, msg, auctionMenuView(profile, `没有找到场地“${args[1]}”。`));
      const paid = profile.coins > 0; room = createAuctionRoom(id, name, paid, profile.auctionAssistant, requestedVenue, 'multiplayer'); jsonSet(key, room);
      return replyView(ctx, msg, auctionRoomView(room, id, paid ? `${requestedVenue}房间已建立，可邀请真人加入；开始时会补足至少三名Bot。` : guestAdmissionQuote(ctx, name, 0)));
    }
    if (!room) return replyView(ctx, msg, auctionMenuView(profile, roomResetQuote));
    if (['私图', '私人', 'private'].indexOf(op) >= 0) {
      bindPrivateActiveRoom('auction', id, gid);
      return replyView(ctx, msg, auctionRoomView(room, id, '竞拍私人情报只发送给你。', true), true);
    }
    if (['加入', 'join'].indexOf(op) >= 0) {
      if (room.status !== 'waiting') return replyView(ctx, msg, auctionRoomView(room, id, '只能加入等待中的竞拍房间。'));
      if (room.players.some((player) => player.id === id)) return replyView(ctx, msg, auctionRoomView(room, id, '你已经在房间中。'));
      if (room.players.filter((player) => !player.isBot).length >= 5 || room.players.length >= AUCTION_MAX_PLAYERS) return replyView(ctx, msg, auctionRoomView(room, id, '真人席位已满；必须预留至少三个Bot席位。'));
      const paid = profile.coins > 0; room.players.push(auctionPlayer(id, name, false, paid, profile.auctionAssistant)); room.updatedAt = nowMs(); jsonSet(key, room);
      return replyView(ctx, msg, auctionRoomView(room, id, paid ? `${name}已加入竞拍房间。` : guestAdmissionQuote(ctx, name, 0)));
    }
    if (['机器人', 'bot'].indexOf(op) >= 0) {
      if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, auctionRoomView(room, id, '只有等待中的房主可以添加Bot。'));
      auctionAddBots(room, args[1]); jsonSet(key, room); return replyView(ctx, msg, auctionRoomView(room, id, '竞拍Bot已经加入。'));
    }
    if (['开始', 'start'].indexOf(op) >= 0) {
      const err = room.ownerId === id && room.status === 'waiting' ? auctionStart(room) : '只有房主能开始等待中的房间。';
      if (!err) auctionAdvance(room); jsonSet(key, room); return replyView(ctx, msg, auctionRoomView(room, id, err || '暗标开始，请提交第一轮出价。'));
    }
    if (['退出', 'leave'].indexOf(op) >= 0 && room.status === 'waiting') {
      const index = room.players.findIndex((player) => player.id === id); if (index < 0) return replyView(ctx, msg, auctionRoomView(room, id, '你不在这个房间中。'));
      room.players.splice(index, 1); const humans = room.players.filter((player) => !player.isBot);
      if (!humans.length) { clearKey(key); return replyView(ctx, msg, auctionMenuView(profile, '房间已经取消。')); }
      if (room.ownerId === id) room.ownerId = humans[0].id; room.updatedAt = nowMs(); jsonSet(key, room);
      return replyView(ctx, msg, auctionRoomView(room, id, '已退出等待房间。'));
    }
    if (['清理', 'clear'].indexOf(op) >= 0) {
      if (room.status === 'waiting' && room.ownerId !== id) return replyView(ctx, msg, auctionRoomView(room, id, '只有等待中的房主可以清理。'));
      if (room.status !== 'waiting' && room.status !== 'finished') return replyView(ctx, msg, auctionRoomView(room, id, '进行中的竞拍不能清理；请先完成或放弃。'));
      refundAuctionEscrow(room); clearKey(key); return replyView(ctx, msg, auctionMenuView(profile, '竞拍现场已经清理。'));
    }
    let err = '';
    if (['出价', '暗标', 'bid'].indexOf(op) >= 0) err = auctionPlaceBid(room, id, args[1]);
    else if (['确认', '锁定', 'confirm'].indexOf(op) >= 0) err = auctionConfirmBid(room, id);
    else if (['撤回', '取消确认', 'unconfirm'].indexOf(op) >= 0) err = auctionWithdrawBid(room, id);
    else if (['放弃', '退出竞拍', 'pass'].indexOf(op) >= 0) err = auctionPass(room, id);
    else if (['探索', '探寻', '侦察', 'explore'].indexOf(op) >= 0) err = auctionExploreCell(room, id, args[1], args[2]);
    else if (['技能', 'skill'].indexOf(op) >= 0) err = auctionUseSkill(room, id);
    else if (['道具', '使用', 'item'].indexOf(op) >= 0) err = args[1] ? auctionUseTool(room, id, args[1], args[2]) : '请指定道具名称。';
    else if (['状态', '查看', '看', 'status'].indexOf(op) < 0) err = '可用操作：探索、出价、确认、撤回、放弃、技能、道具、状态。';
    if (!isPrivate && room && room.players.some((player) => player.id === id)) bindPrivateActiveRoom('auction', id, gid);
    if (!err && ((room.mode === 'solo' && ['出价', '暗标', 'bid'].indexOf(op) >= 0) || ['确认', '锁定', 'confirm', '放弃', '退出竞拍', 'pass'].indexOf(op) >= 0)) auctionAdvance(room);
    jsonSet(key, room);
    const me = room.players.find((player) => player.id === id);
    const quote = err || (room.status === 'finished' && me && isGuestPlayer(me) ? guestSettlementQuote(ctx, name) : room.status === 'finished' ? '开箱已经完成；再次发送“.竞拍”返回场地与指令菜单。' : ['出价', '暗标', 'bid'].indexOf(op) >= 0 ? room.mode === 'solo' ? '本轮已自动确认并结算；名次已写入席位下方，具体金额仍保密。' : '暗标已更新，可继续修改；满意后发送“.竞拍 确认”。' : '每轮公开价格名次与五轮轨迹，但不公开任何对手具体金额。');
    return replyView(ctx, msg, auctionRoomView(room, id, quote));
  }

  async function handlePoker(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const isPrivate = !!ctx.isPrivate; let gid = groupId(ctx, msg); if (isPrivate) gid = resolvePrivateActiveRoom('poker', id, gid); const key = roomKey('poker', gid);
    const defaultEntry = !args.length;
    let room = ensureRoomAvailable('poker', gid); if (!isPrivate && room && room.players.some((player) => player.id === id)) bindPrivateActiveRoom('poker', id, gid); const op = stripPrivatePrefillNote(args[0] || '状态').toLowerCase();
    if (defaultEntry && room && room.status === 'finished') {
      clearKey(key);
      return replyView(ctx, msg, pokerMenuView());
    }
    if (room) pokerEnsureTournament(room);
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, pokerTutorialView(args[1]));
    if (['人机', '单人', 'bot'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, pokerView(room, id, false, '当前群已有牌桌。'));
      const p = loadProfile(id, name); if (!charge(p, ENTRY.poker)) return replyView(ctx, msg, { kind: 'profile', title: '无法入场', lines: [`需要 ${ENTRY.poker} 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      room = createPokerRoom(id, name, true, 'pve'); addRoomBot(room, 'poker', 1); startPoker(room); pokerRunBots(room); bindPrivateActiveRoom('poker', id, gid); jsonSet(key, room);
      return replyView(ctx, msg, pokerView(room, id, false, profileQuote(ctx, p)));
    }
    if (['开房', '创建', 'create'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, pokerView(room, id, false, '当前群已有牌桌。'));
      const admission = multiplayerAdmission('poker', id, name);
      room = createPokerRoom(id, name, admission.paid, 'pvp'); jsonSet(key, room);
      return replyView(ctx, msg, pokerView(room, id, false, admission.paid ? '开房成功，可加入玩家或机器人。' : guestAdmissionQuote(ctx, name, ENTRY.poker)));
    }
    if (!room) return replyView(ctx, msg, pokerMenuView());
    const nextHandOps = ['下一手', '继续', '发牌', 'nexthand'];
    const nextGameOps = ['下一局', '再来', '重赛', 'next', 'rematch'];
    if (nextHandOps.indexOf(op) >= 0 || (room.status === 'between_hands' && nextGameOps.indexOf(op) >= 0)) {
      const err = pokerNextHand(room, id);
      if (err) return replyView(ctx, msg, pokerView(room, id, false, err));
      jsonSet(key, room); return replyView(ctx, msg, pokerView(room, id, false, '下一手已经发牌，剩余筹码保持不变。'));
    }
    if (nextGameOps.indexOf(op) >= 0) {
      const result = pokerRematch(room, id, name);
      if (result.error) return replyView(ctx, msg, pokerView(room, id, false, result.error));
      room = result.room; jsonSet(key, room);
      return replyView(ctx, msg, pokerView(room, id, false, result.started ? profileQuote(ctx, result.profile) : result.paid ? result.message : guestAdmissionQuote(ctx, name, ENTRY.poker)));
    }
    if (['加入', 'join'].indexOf(op) >= 0) {
      const result = joinPaidRoom(room, 'poker', id, name); if (result.error) return replyView(ctx, msg, pokerView(room, id, false, result.error));
      jsonSet(key, room); return replyView(ctx, msg, pokerView(room, id, false, result.paid ? `${name} 已入座。` : guestAdmissionQuote(ctx, name, ENTRY.poker)));
    }
    if (['机器人', 'bot'].indexOf(op) >= 0) {
      if (room.status !== 'waiting' || room.ownerId !== id) return replyView(ctx, msg, pokerView(room, id, false, '只有房主能在等待阶段添加机器人。'));
      addRoomBot(room, 'poker', args[1]); jsonSet(key, room); return replyView(ctx, msg, pokerView(room, id, false, '机器人已入座。'));
    }
    if (['开始', 'start'].indexOf(op) >= 0) {
      if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, pokerView(room, id, false, '只有房主能开始等待中的牌局。'));
      const err = startPoker(room); if (err) return replyView(ctx, msg, pokerView(room, id, false, err)); pokerRunBots(room); jsonSet(key, room); return replyView(ctx, msg, pokerView(room, id, false, '牌局开始。'));
    }
    if (['看牌', 'hand'].indexOf(op) >= 0) { bindPrivateActiveRoom('poker', id, gid); return replyView(ctx, msg, pokerView(room, id, true, '底牌只通过私聊发送。'), true); }
    if (['退出', 'leave'].indexOf(op) >= 0 && room.status === 'waiting') {
      const leaving = room.players.find((player) => player.id === id); const wasPaid = isSettlementEligible(leaving);
      const err = cancelWaitingRoom(room, id); if (err) return replyView(ctx, msg, pokerView(room, id, false, err));
      if (!room.players.length) clearKey(key); else jsonSet(key, room);
      return replyView(ctx, msg, { kind: 'poker', title: '已退出牌桌', lines: [wasPaid ? '等待阶段入场费已原路退还。' : '游客席位已取消；本次没有收取入场费。'], quote: '' });
    }
    if (['清理', 'clear'].indexOf(op) >= 0) {
      if (room.status === 'waiting' && room.ownerId === id) refundWaitingRoom(room);
      else if (room.status !== 'finished') return replyView(ctx, msg, pokerView(room, id, false, '进行中的牌局不能清理。'));
      clearKey(key); return replyView(ctx, msg, { kind: 'poker', title: '牌桌已清理', lines: ['现在可以创建新牌桌。'], quote: '' });
    }
    const actionMap = { '过牌': 'check', check: 'check', '跟注': 'call', call: 'call', '加注': 'raise', raise: 'raise', '弃牌': 'fold', fold: 'fold', '全押': 'allin', allin: 'allin' };
    if (actionMap[op]) {
      const err = pokerAct(room, id, actionMap[op], args[1]); if (err) return replyView(ctx, msg, pokerView(room, id, false, err));
      pokerRunBots(room); jsonSet(key, room); const p = loadProfile(id, name);
      const me = room.players.find((player) => player.id === id);
      const quote = room.status === 'finished' ? (isGuestPlayer(me) ? guestSettlementQuote(ctx, name) : template(ctx, room.winnerIds.indexOf(id) >= 0 ? '文案_胜利' : '文案_失败', { name })) : profileQuote(ctx, p);
      return replyView(ctx, msg, pokerView(room, id, false, quote));
    }
    return replyView(ctx, msg, pokerView(room, id, false, '可用操作：过牌、跟注、加注、全押、弃牌。'));
  }

  async function handleBlackjack(ctx, msg, args) {
    const gid = groupId(ctx, msg); const id = uid(ctx, msg); const name = uname(ctx, msg); const key = roomKey('blackjack', gid);
    const defaultEntry = !args.length;
    let room = ensureRoomAvailable('blackjack', gid); const op = String(args[0] || '状态').toLowerCase();
    if (defaultEntry && room && room.status === 'finished') {
      clearKey(key);
      return replyView(ctx, msg, blackjackMenuView());
    }
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    bjEnsureNextStarter(room);
    if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, blackjackTutorialView(args[1]));
    if (['开始', '人机', 'start', 'bot'].indexOf(op) >= 0) {
      if (room && room.status === 'playing') {
        if (room.phase !== 'round_result' && room.turn === 'enemy') { bjRunBot(room); jsonSet(key, room); }
        return replyView(ctx, msg, blackjackView(room, '当前群已有21点对局。'));
      }
      const p = loadProfile(id, name); if (!charge(p, ENTRY.blackjack)) return replyView(ctx, msg, { kind: 'profile', title: '无法入场', lines: [`需要 ${ENTRY.blackjack} 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      room = createBlackjackRoom(id, name); jsonSet(key, room); return replyView(ctx, msg, blackjackView(room, profileQuote(ctx, p)));
    }
    if (!room) return replyView(ctx, msg, blackjackMenuView());
    if (['清理', 'clear'].indexOf(op) >= 0) {
      if (room.status === 'playing') return replyView(ctx, msg, blackjackView(room, '进行中的对局请使用“放弃”。'));
      clearKey(key); return replyView(ctx, msg, { kind: 'blackjack', title: '21点桌面已清理', lines: ['可以开始新对局。'], quote: '' });
    }
    if (['放弃', '投降', 'surrender'].indexOf(op) >= 0) {
      if (room.player.id !== id || room.status !== 'playing') return replyView(ctx, msg, blackjackView(room, '无法放弃不属于你的对局。'));
      room.player.hp = 0; bjFinishMatch(room, room.enemy); jsonSet(key, room); return replyView(ctx, msg, blackjackView(room, template(ctx, '文案_失败', { name })));
    }
    if (room.status === 'playing' && room.phase !== 'round_result' && room.turn === 'enemy') bjRunBot(room);
    let err = '';
    if (['抽牌', '抽', 'draw', 'hit'].indexOf(op) >= 0) err = bjPlayerMove(room, id, 'draw');
    else if (['停牌', '停', 'stand'].indexOf(op) >= 0) err = bjPlayerMove(room, id, 'stand');
    else if (['出牌', '王牌', 'trump'].indexOf(op) >= 0) err = args[1] ? bjPlayerMove(room, id, 'trump', args[1]) : '请指定王牌名称。';
    else if (['状态', 'status'].indexOf(op) < 0) err = '可用操作：抽牌、停牌、出牌 [王牌名]。';
    jsonSet(key, room);
    const quote = err || (room.status === 'finished'
      ? template(ctx, room.winnerId === id ? '文案_胜利' : '文案_失败', { name })
      : room.phase === 'round_result'
        ? `双方最终牌面已保留；下一回合由 ${room.roundResult.nextStarterName} 先手，看清结算后发送“.yan 21点 抽牌”开局。`
        : profileQuote(ctx, loadProfile(id, name)));
    return replyView(ctx, msg, blackjackView(room, quote));
  }

  async function handleDmd(ctx, msg, args, cmdArgs) {
    const gid = groupId(ctx, msg); const id = uid(ctx, msg); const name = uname(ctx, msg); const key = roomKey('dmd', gid);
    const defaultEntry = !args.length;
    let room = ensureRoomAvailable('dmd', gid); const op = String(args[0] || '状态').toLowerCase();
    if (defaultEntry && room && room.status === 'finished') {
      clearKey(key);
      return replyView(ctx, msg, dmdMenuView());
    }
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, dmdTutorialView(args[1]));
    if (['人机', '单人', 'bot'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, dmdView(room, '当前群已有神抽房间。'));
      const p = loadProfile(id, name); if (!charge(p, ENTRY.dmd)) return replyView(ctx, msg, { kind: 'profile', title: '无法入场', lines: [`需要 ${ENTRY.dmd} 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      room = createDmdRoom(id, name); addRoomBot(room, 'dmd', 1); dmdStart(room); dmdRunBots(room); jsonSet(key, room); return replyView(ctx, msg, dmdView(room, profileQuote(ctx, p)));
    }
    if (['开房', '创建', 'create'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, dmdView(room, '当前群已有神抽房间。'));
      const admission = multiplayerAdmission('dmd', id, name);
      room = createDmdRoom(id, name, admission.paid); jsonSet(key, room); return replyView(ctx, msg, dmdView(room, admission.paid ? '房间创建成功。' : guestAdmissionQuote(ctx, name, ENTRY.dmd)));
    }
    if (!room) return replyView(ctx, msg, dmdMenuView());
    if (['加入', 'join'].indexOf(op) >= 0) { const result = joinPaidRoom(room, 'dmd', id, name); if (!result.error) jsonSet(key, room); return replyView(ctx, msg, dmdView(room, result.error || (result.paid ? `${name} 已加入。` : guestAdmissionQuote(ctx, name, ENTRY.dmd)))); }
    if (['机器人', 'bot'].indexOf(op) >= 0) { if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, dmdView(room, '只有等待中的房主能添加机器人。')); addRoomBot(room, 'dmd', args[1]); jsonSet(key, room); return replyView(ctx, msg, dmdView(room, '机器人已加入。')); }
    if (['开始', 'start'].indexOf(op) >= 0) { const err = room.ownerId === id && room.status === 'waiting' ? dmdStart(room) : '只有房主能开始等待中的房间。'; if (!err) dmdRunBots(room); jsonSet(key, room); return replyView(ctx, msg, dmdView(room, err || '寻宝开始。')); }
    if (['退出', 'leave'].indexOf(op) >= 0 && room.status === 'waiting') { const leaving = room.players.find((player) => player.id === id); const wasPaid = isSettlementEligible(leaving); const err = cancelWaitingRoom(room, id); if (!room.players.length) clearKey(key); else jsonSet(key, room); return replyView(ctx, msg, dmdView(room, err || (wasPaid ? '已退出并退还入场费。' : '游客席位已取消；本次没有收取入场费。'))); }
    if (['清理', 'clear'].indexOf(op) >= 0) { if (room.status === 'waiting' && room.ownerId === id) refundWaitingRoom(room); else if (room.status !== 'finished') return replyView(ctx, msg, dmdView(room, '进行中不能清理。')); clearKey(key); return replyView(ctx, msg, dmdMenuView('房间已清理，可以开始新的寻宝。')); }
    let err = '';
    if (['抽牌', '抽', 'draw'].indexOf(op) >= 0) err = dmdDraw(room, id);
    else if (['收手', '停牌', 'bank', 'stand'].indexOf(op) >= 0) err = dmdBank(room, id);
    else if (['使用', 'use'].indexOf(op) >= 0) {
      const atId = cmdArgs && cmdArgs.at && cmdArgs.at.length ? cmdArgs.at[0].userId : '';
      err = dmdUseEffect(room, id, args[1], args[2], atId || args[3]);
    } else if (['移动', '挖宝', '抢劫', '钩取', '炮击'].indexOf(op) >= 0) {
      const effectMap = { '移动': '美人鱼', '挖宝': '藏宝图', '抢劫': '弯刀', '钩取': '钩子', '炮击': '大炮' };
      const atId = cmdArgs && cmdArgs.at && cmdArgs.at.length ? cmdArgs.at[0].userId : '';
      err = dmdUseEffect(room, id, effectMap[op], args[1], atId || args[2]);
    } else if (['放弃效果', '跳过效果', 'skip'].indexOf(op) >= 0) err = dmdSkipEffect(room, id);
    else if (['状态', 'status'].indexOf(op) < 0) err = '可用操作：抽牌、收手。';
    if (!err) dmdRunBots(room); jsonSet(key, room);
    const me = room.players.find((p) => p.id === id); const quote = err || (room.status === 'finished' && isGuestPlayer(me) ? guestSettlementQuote(ctx, name) : me && me.grandSlams ? template(ctx, '文案_大满贯', { name }) : profileQuote(ctx, loadProfile(id, name)));
    return replyView(ctx, msg, dmdView(room, quote));
  }

  async function handleFarkle(ctx, msg, args) {
    const gid = groupId(ctx, msg); const id = uid(ctx, msg); const name = uname(ctx, msg); const key = roomKey('farkle', gid);
    const defaultEntry = !args.length;
    let room = ensureRoomAvailable('farkle', gid); const op = String(args[0] || '状态').toLowerCase();
    if (defaultEntry && room && room.status === 'finished') {
      clearKey(key);
      return replyView(ctx, msg, farkleMenuView());
    }
    if (room && room.ruleSet !== 1 && room.ruleSet !== 2) { room.ruleSet = 1; jsonSet(key, room); }
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    if (['教程', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, farkleTutorialView(args[1]));
    if (['人机', '单人', 'bot'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, farkleView(room, '当前群已有快艇骰房间。'));
      const p = loadProfile(id, name); if (!charge(p, ENTRY.farkle)) return replyView(ctx, msg, { kind: 'profile', title: '无法入场', lines: [`需要 ${ENTRY.farkle} 游戏币`], quote: template(ctx, '文案_余额不足', { name }) });
      room = createFarkleRoom(id, name); room.ruleSet = normalizeFarkleRule(args[1]); addRoomBot(room, 'farkle', 1); farkleStart(room); farkleRunBots(room); jsonSet(key, room); return replyView(ctx, msg, farkleView(room, profileQuote(ctx, p)));
    }
    if (['开房', '创建', 'create'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, farkleView(room, '当前群已有快艇骰房间。'));
      const admission = multiplayerAdmission('farkle', id, name);
      room = createFarkleRoom(id, name, admission.paid); room.ruleSet = normalizeFarkleRule(args[1]); jsonSet(key, room); return replyView(ctx, msg, farkleView(room, admission.paid ? `房间创建成功，当前为规则${room.ruleSet}。` : guestAdmissionQuote(ctx, name, ENTRY.farkle)));
    }
    if (!room) return replyView(ctx, msg, farkleMenuView());
    if (['规则', 'rule', 'rules'].indexOf(op) >= 0) {
      if (!args[1]) return replyView(ctx, msg, farkleTutorialView(2));
      if (room.status !== 'waiting') return replyView(ctx, msg, farkleView(room, '规则已经随牌局锁定，下一局开始前才能更换。'));
      if (room.ownerId !== id) return replyView(ctx, msg, farkleView(room, '只有房主可以设置本房间的规则。'));
      const requestedRule = int(args[1], 0);
      if (requestedRule !== 1 && requestedRule !== 2) return replyView(ctx, msg, farkleView(room, '规则编号只能是1或2。'));
      room.ruleSet = requestedRule; room.updatedAt = nowMs(); jsonSet(key, room);
      return replyView(ctx, msg, farkleView(room, `本房间已设置为规则${requestedRule}；发送“开始”后锁定。`));
    }
    if (['加入', 'join'].indexOf(op) >= 0) { const result = joinPaidRoom(room, 'farkle', id, name); if (!result.error) jsonSet(key, room); return replyView(ctx, msg, farkleView(room, result.error || (result.paid ? `${name} 已加入。` : guestAdmissionQuote(ctx, name, ENTRY.farkle)))); }
    if (['机器人', 'bot'].indexOf(op) >= 0) { if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, farkleView(room, '只有等待中的房主能添加机器人。')); addRoomBot(room, 'farkle', args[1]); jsonSet(key, room); return replyView(ctx, msg, farkleView(room, '机器人已加入。')); }
    if (['开始', 'start'].indexOf(op) >= 0) { const err = room.ownerId === id && room.status === 'waiting' ? farkleStart(room) : '只有房主能开始等待中的房间。'; if (!err) farkleRunBots(room); jsonSet(key, room); return replyView(ctx, msg, farkleView(room, err || '比赛开始。')); }
    if (['退出', 'leave'].indexOf(op) >= 0 && room.status === 'waiting') { const leaving = room.players.find((player) => player.id === id); const wasPaid = isSettlementEligible(leaving); const err = cancelWaitingRoom(room, id); if (!room.players.length) clearKey(key); else jsonSet(key, room); return replyView(ctx, msg, farkleView(room, err || (wasPaid ? '已退出并退还入场费。' : '游客席位已取消；本次没有收取入场费。'))); }
    if (['清理', 'clear'].indexOf(op) >= 0) { if (room.status === 'waiting' && room.ownerId === id) refundWaitingRoom(room); else if (room.status !== 'finished') return replyView(ctx, msg, farkleView(room, '进行中不能清理。')); clearKey(key); return replyView(ctx, msg, farkleMenuView('房间已清理，可以创建新房间。')); }
    let err = '';
    if (['投掷', '投', 'roll'].indexOf(op) >= 0) err = farkleRoll(room, id);
    else if (['选择', '保留', 'keep', 'select'].indexOf(op) >= 0) err = farkleKeep(room, id, args.slice(1).join(' '));
    else if (['存分', '收手', 'bank'].indexOf(op) >= 0) err = farkleBank(room, id);
    else if (['状态', 'status'].indexOf(op) < 0) err = '可用操作：投掷、选择 1,1,5（或115）、存分。';
    if (!err) farkleRunBots(room); jsonSet(key, room); const me = room.players.find((player) => player.id === id); const quote = err || (room.status === 'finished' && isGuestPlayer(me) ? guestSettlementQuote(ctx, name) : profileQuote(ctx, loadProfile(id, name))); return replyView(ctx, msg, farkleView(room, quote));
  }

  async function handleLove(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const privateMessage = !!ctx.isPrivate; const op = stripPrivatePrefillNote(args[0] || '状态').toLowerCase();
    let gid = groupId(ctx, msg);
    if (privateMessage) {
      const active = jsonGet(loveActiveRoomKey(id), null);
      if (active && active.gid) gid = String(active.gid);
    }
    const key = roomKey('love', gid); const defaultEntry = !args.length; let room = ensureRoomAvailable('love', gid);
    if (privateMessage && (!room || !room.players.some((player) => player.id === id))) {
      clearKey(loveActiveRoomKey(id));
      return replyView(ctx, msg, loveMenuView('当前没有与你绑定的群聊牌桌，请先在群内创建或加入。'));
    }
    if (defaultEntry && room && room.status === 'finished') { loveUnbindRoomPlayers(room, gid); clearKey(key); return replyView(ctx, msg, loveMenuView()); }
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, loveTutorialView(args[1]));
    if (privateMessage && ['公开', '宣告', 'reveal', '看牌', 'hand', '私牌', '状态', 'status'].indexOf(op) < 0) {
      return replyView(ctx, msg, loveView(room, id, true, '私聊仅用于查看手牌、提交公开牌与宣告；下注、确认公开和下一轮请回到群聊操作。'));
    }
    if (['人机', '单人', 'pve', 'bot'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, loveView(room, id, false, '当前群已有爱赢一切牌桌。'));
      const profile = loadProfile(id, name);
      if (!charge(profile, ENTRY.love)) return replyView(ctx, msg, { kind: 'profile', title: '无法入场', lines: [`需要 ${ENTRY.love} 游戏币`, `当前余额 ${profile.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      room = createLoveRoom(id, name, true, 'pve'); addRoomBot(room, 'love', 1); loveStart(room); loveRunBots(room); loveBindRoomPlayers(room, gid); jsonSet(key, room);
      return replyView(ctx, msg, loveView(room, id, false, '牌局开始；你的三张手牌会在群图中始终常亮，Bot无法读取这些暗牌。'));
    }
    if (['开房', '创建', 'pvp', 'create'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, loveView(room, id, false, '当前群已有爱赢一切牌桌。'));
      const admission = multiplayerAdmission('love', id, name); room = createLoveRoom(id, name, admission.paid, 'pvp'); loveBindRoomPlayers(room, gid); jsonSet(key, room);
      return replyView(ctx, msg, loveView(room, id, false, admission.paid ? '房间创建成功，等待另一位玩家加入。' : guestAdmissionQuote(ctx, name, ENTRY.love)));
    }
    if (!room) return replyView(ctx, msg, loveMenuView());
    if (['加入', 'join'].indexOf(op) >= 0) {
      const result = joinPaidRoom(room, 'love', id, name); if (!result.error) { loveBindRoomPlayers(room, gid); jsonSet(key, room); }
      return replyView(ctx, msg, loveView(room, id, false, result.error || (result.paid ? `${name}已加入牌桌。` : guestAdmissionQuote(ctx, name, ENTRY.love))));
    }
    if (['机器人', 'bot'].indexOf(op) >= 0) {
      if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, loveView(room, id, false, '只有房主能在等待阶段添加机器人。'));
      if (room.players.length >= 2) return replyView(ctx, msg, loveView(room, id, false, '1v1席位已经坐满。'));
      addRoomBot(room, 'love', 1); jsonSet(key, room); return replyView(ctx, msg, loveView(room, id, false, '机器人已经入座。'));
    }
    if (['开始', 'start'].indexOf(op) >= 0) {
      const err = room.ownerId === id && room.status === 'waiting' ? loveStart(room) : '只有房主能开始等待中的房间。';
      if (!err) { loveBindRoomPlayers(room, gid); bindPrivateActiveRoom('love', id, gid); loveRunBots(room); } jsonSet(key, room); return replyView(ctx, msg, loveView(room, id, false, err || (room.mode === 'pve' ? '牌局开始；玩家手牌会在群图中常亮。' : '牌局开始；公开牌与宣告请在私聊中锁定.')));
    }
    if (['看牌', 'hand', '私牌'].indexOf(op) >= 0) {
      if (!room.players.some((player) => player.id === id)) return replyView(ctx, msg, loveView(room, id, false, '你不在这张牌桌上。'));
      bindPrivateActiveRoom('love', id, gid);
      return replyView(ctx, msg, loveView(room, id, true, '仅你自己的未公开手牌会在这张私聊图片中显示。'), true);
    }
    if (['退出', 'leave'].indexOf(op) >= 0 && room.status === 'waiting') {
      const leaving = room.players.find((player) => player.id === id); const wasPaid = isSettlementEligible(leaving); const err = cancelWaitingRoom(room, id);
      loveUnbindRoomPlayers({ players: leaving ? [leaving] : [] }, gid); if (!room.players.length) clearKey(key); else jsonSet(key, room);
      return replyView(ctx, msg, room.players.length ? loveView(room, id, false, err || (wasPaid ? '已退出并退还入场费。' : '游客席位已取消。')) : loveMenuView(err || '房间已经取消。'));
    }
    if (['清理', 'clear'].indexOf(op) >= 0) {
      if (room.status === 'waiting' && room.ownerId === id) refundWaitingRoom(room);
      else if (room.status !== 'finished') return replyView(ctx, msg, loveView(room, id, false, '进行中的牌局不能清理，请先投降或完成比赛。'));
      loveUnbindRoomPlayers(room, gid); clearKey(key); return replyView(ctx, msg, loveMenuView('牌桌已经清理。'));
    }
    if (['投降', '认输', 'surrender'].indexOf(op) >= 0) {
      if (room.status !== 'playing') return replyView(ctx, msg, loveView(room, id, false, '当前没有可以投降的进行中牌局。'));
      const loserIndex = room.players.findIndex((player) => player.id === id); if (loserIndex < 0) return replyView(ctx, msg, loveView(room, id, false, '你不在这张牌桌上。'));
      const winnerIndex = 1 - loserIndex; room.players[winnerIndex].chips += room.pot + room.carryPot; room.pot = 0; room.carryPot = 0; room.players[loserIndex].chips = 0;
      loveFinishMatch(room, `${name}投降，比赛提前结束。`); jsonSet(key, room); return replyView(ctx, msg, loveView(room, id, false, '投降已经生效。'));
    }
    let err = '';
    if (['下一轮', '继续', 'next'].indexOf(op) >= 0) err = privateMessage ? '请回到群聊发送“下一轮”。' : loveNextRound(room);
    else if (['公开', '宣告', 'reveal'].indexOf(op) >= 0) {
      if (room.mode === 'pvp' && !privateMessage) err = 'PvP公开牌与宣告必须私聊骰娘提交，双方锁定后再回群确认公开。';
      else err = loveLockReveal(room, id, args[1], args[2], args[3]);
    }
    else if (['确认公开', '确认开牌', '同时公开', 'confirmreveal'].indexOf(op) >= 0) err = privateMessage ? '请回到牌桌所在群聊确认公开。' : loveConfirmReveals(room, id);
    else if (['过牌', 'check', '跟注', 'call', '全押', 'allin', 'all-in', '弃牌', 'fold'].indexOf(op) >= 0) err = loveBetAction(room, id, op);
    else if (['加注', 'raise'].indexOf(op) >= 0) err = loveBetAction(room, id, op, args[1]);
    else if (['状态', 'status'].indexOf(op) < 0) err = '可用操作：看牌、过牌、跟注、加注、全押、弃牌、公开、确认公开、下一轮。';
    if (!err) loveRunBots(room); jsonSet(key, room);
    const me = room.players.find((player) => player.id === id);
    const quote = err || (room.status === 'finished' && isGuestPlayer(me) ? guestSettlementQuote(ctx, name) : room.status === 'finished' ? profileQuote(ctx, loadProfile(id, name)) : privateMessage && me && me.revealLocked ? room.phase === 'reveal_confirm' ? '双方均已锁定，请回群发送“.爱赢一切 确认公开”。' : '你的选择已锁定；对手的选择不会提前显示。' : room.mode === 'pve' ? '你的手牌保持常亮；Bot只依据公开信息行动。' : '暗牌与锁定内容保持保密，双方确认后才会同时公开。');
    return replyView(ctx, msg, loveView(room, id, privateMessage, quote));
  }

  // -------------------- 魔幻牌炼金术师 --------------------
  const ALCHEMY_ELEMENTS = ['SPIRIT', 'WATER', 'FIRE', 'EARTH', 'AIR', 'CONSERVATION'];
  const ALCHEMY_MAGIC = ['DARKSACRIFICE', 'SNATCH', 'ORACLE', 'TIMEMACHINE'];
  const ALCHEMY_LABELS = { SPIRIT: '灵魂', WATER: '水', FIRE: '火', EARTH: '土', AIR: '气', CONSERVATION: '守恒', DARKSACRIFICE: '黑暗祭祀', SNATCH: '物质吸取', ORACLE: '神谕配方', TIMEMACHINE: '时间机器' };
  const ALCHEMY_COLORS = { SPIRIT: '#b895f5', WATER: '#55bce8', FIRE: '#ef765f', EARTH: '#c99a65', AIR: '#9ed7c5', CONSERVATION: '#f2d06b', DARKSACRIFICE: '#9f83c9', SNATCH: '#e8a85c', ORACLE: '#f5da79', TIMEMACHINE: '#72d4c0' };
  // 魔法牌支持英文简称、完整牌名及中文首字；旧中文名继续作为兼容别名。
  const ALCHEMY_MAGIC_ALIASES = {
    D: 'DARKSACRIFICE', DARK: 'DARKSACRIFICE', DARKSACRIFICE: 'DARKSACRIFICE',
    黑暗祭祀: 'DARKSACRIFICE', 黑暗献祭: 'DARKSACRIFICE', 黑: 'DARKSACRIFICE', 暗: 'DARKSACRIFICE', 祭: 'DARKSACRIFICE', 献: 'DARKSACRIFICE',
    S: 'SNATCH', SNATCH: 'SNATCH', 物质吸取: 'SNATCH', 物质: 'SNATCH', 吸取: 'SNATCH', 物: 'SNATCH', 吸: 'SNATCH', 神偷: 'SNATCH', 偷: 'SNATCH',
    O: 'ORACLE', ORACLE: 'ORACLE', 神谕配方: 'ORACLE', 神谕: 'ORACLE', 配方: 'ORACLE', 神: 'ORACLE', 谕: 'ORACLE', 配: 'ORACLE',
    T: 'TIMEMACHINE', TIMEMACHINE: 'TIMEMACHINE', 时间机器: 'TIMEMACHINE', 时: 'TIMEMACHINE', 机: 'TIMEMACHINE'
  };
  const ALCHEMY_HAND_ORDER = { SPIRIT: 1, WATER: 2, FIRE: 3, EARTH: 4, AIR: 5, CONSERVATION: 6, DARKSACRIFICE: 7, SNATCH: 8, ORACLE: 9, TIMEMACHINE: 10 };
  function alchemySortHand(hand) { return (Array.isArray(hand) ? hand : []).sort((a, b) => (ALCHEMY_HAND_ORDER[a && a.attr] || 99) - (ALCHEMY_HAND_ORDER[b && b.attr] || 99) || int(a && a.id, 0) - int(b && b.id, 0)); }
  function alchemyShuffle(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function alchemyBuildDeck() { const counts = { SPIRIT: 14, WATER: 14, FIRE: 14, EARTH: 14, AIR: 14, CONSERVATION: 2, DARKSACRIFICE: 2, SNATCH: 2, ORACLE: 2, TIMEMACHINE: 2 }; const cards = []; let id = 1; Object.keys(counts).forEach((attr) => { for (let i = 0; i < counts[attr]; i++) cards.push({ id: id++, attr, type: ALCHEMY_MAGIC.indexOf(attr) >= 0 ? 'MAGIC' : 'ELEMENT' }); }); return alchemyShuffle(cards); }
  function alchemyPlayer(id, name, isBot, paid) { const bot = !!isBot; const entryPaid = bot ? false : paid !== false; return { id, name, isBot: bot, paid: entryPaid, guest: !bot && !entryPaid, hand: [], pool: [], collected: {}, score: 0, actionsLeft: 0, done: false, totalElementCards: 0, magicUsed: 0, conservationUsed: 0, lastAction: '', lastPlayed: [], roundPlayed: [] }; }
  function createAlchemyRoom(ownerId, ownerName, ownerPaid, mode) { return { game: 'alchemy', mode: mode || 'pve', status: 'waiting', entry: ENTRY.alchemy, ownerId, round: 0, maxRounds: 12, starter: 0, turn: 0, deck: [], discard: [], players: [alchemyPlayer(ownerId, ownerName, false, ownerPaid)], logs: ['炼金牌桌已创建，等待开始。'], lastAction: '', poolClearNotice: '', winner: '', settled: false, createdAt: nowMs(), updatedAt: nowMs() }; }
  function alchemyDraw(room, count) { const out = []; for (let i = 0; i < count; i++) { if (!room.deck.length) { room.deck = alchemyShuffle(room.discard); room.discard = []; } if (room.deck.length) out.push(room.deck.pop()); } return out; }
  function alchemyStart(room) { if (!room || room.players.length < 2) return '至少需要两名炼金术师。'; while (room.players.length < 4) addRoomBot(room, 'alchemy', 1); room.deck = alchemyBuildDeck(); room.discard = []; room.round = 1; room.starter = Math.floor(Math.random() * room.players.length); room.turn = room.starter; room.status = 'playing'; room.players.forEach((p) => { p.hand = alchemySortHand(alchemyDraw(room, 7)); p.pool = []; p.collected = {}; p.score = 0; p.done = false; p.actionsLeft = 0; p.totalElementCards = 0; p.lastPlayed = []; p.roundPlayed = []; }); room.logs.push(`第1轮开始，${room.players[room.turn].name}先手。`); alchemyActivateTurn(room); return ''; }
  function alchemyClearPlayerPool(room, p) { if (!p) return 0; const cards = Array.isArray(p.pool) ? p.pool : []; if (typeof p.totalElementCards !== 'number') p.totalElementCards = cards.length; if (cards.length) room.discard = room.discard.concat(cards); p.pool = []; p.collected = {}; return cards.length; }
  function alchemyActivateTurn(room) { const p = room.players[room.turn]; if (!p) return; alchemyClearPlayerPool(room, p); p.actionsLeft = p.actionsLeft > 0 ? p.actionsLeft : 2; p.done = false; p.roundPlayed = []; p.lastPlayed = []; }
  function alchemyHasElement(p) { return p.hand.some((card) => card.type === 'ELEMENT' && card.attr !== 'CONSERVATION'); }
  function alchemyParseSelection(p, rawText) {
    const text = String(rawText || '').replace(/[，、；;]/g, ',').replace(/([A-Za-z])\s*[x×]\s*(\d+)/gi, '$1x$2').trim();
    if (!text) return [];
    const tokens = text.split(/[\s,]+/).filter(Boolean);
    const aliases = {
      S: 'SPIRIT', SPIRIT: 'SPIRIT', 灵魂: 'SPIRIT',
      W: 'WATER', WATER: 'WATER', 水: 'WATER',
      F: 'FIRE', FIRE: 'FIRE', 火: 'FIRE',
      E: 'EARTH', EARTH: 'EARTH', 土: 'EARTH',
      A: 'AIR', AIR: 'AIR', 气: 'AIR',
      C: 'CONSERVATION', CONSERVATION: 'CONSERVATION', 守恒: 'CONSERVATION', 质量守恒: 'CONSERVATION'
    };
    const indexes = [];
    const used = {};
    const takeAttr = (attr, count) => {
      let taken = 0;
      // 质量守恒是万能牌：按属性选牌时，实体牌不足的部分自动由未占用的守恒牌补足。
      for (let i = 0; i < p.hand.length && taken < count; i++) {
        if (used[i] || p.hand[i].attr !== attr) continue;
        used[i] = true; indexes.push(i + 1); taken += 1;
      }
      for (let i = 0; i < p.hand.length && taken < count; i++) {
        if (used[i] || p.hand[i].attr !== 'CONSERVATION') continue;
        used[i] = true; indexes.push(i + 1); taken += 1;
      }
    };
    tokens.forEach((token) => {
      const compact = token.replace(/×/g, 'x');
      const repeat = /^([A-Za-z]+)x(\d+)$/i.exec(compact);
      if (repeat && (aliases[repeat[1].toUpperCase()] || aliases[repeat[1]])) {
        const alias = aliases[repeat[1].toUpperCase()] || aliases[repeat[1]];
        takeAttr(alias, Math.max(1, int(repeat[2], 1))); return;
      }
      if (/^\d+$/.test(token)) { const n = int(token, 0); if (n > 0 && n <= p.hand.length && !used[n - 1]) { used[n - 1] = true; indexes.push(n); } return; }
      const upper = token.toUpperCase();
      if (aliases[upper] || aliases[token]) { takeAttr(aliases[upper] || aliases[token], 1); return; }
      if (upper.length > 1 && !repeat) {
        let allAliases = true;
        for (let i = 0; i < upper.length; i++) if (!aliases[upper[i]]) { allAliases = false; break; }
        if (allAliases) { for (let i = 0; i < upper.length; i++) takeAttr(aliases[upper[i]], 1); return; }
      }
      if (upper.length === 1 && aliases[upper]) takeAttr(aliases[upper], 1);
    });
    return indexes;
  }
  function alchemyFinishTurn(room, p) { p.done = true; p.actionsLeft = 0; const need = Math.max(0, 7 - p.hand.length); if (need) p.hand = p.hand.concat(alchemyDraw(room, need)); alchemySortHand(p.hand); const next = (room.turn + 1) % room.players.length; if (next === room.starter) { room.round += 1; room.players.forEach((x) => { x.done = false; }); } room.turn = next; if (room.round <= room.maxRounds) { alchemyActivateTurn(room); if (room.players[room.turn].isBot) alchemyRunBots(room); } else alchemyFinish(room); }
  function alchemyCollect(room, p, indexes) { if (p.id !== room.players[room.turn].id) return '还没轮到你。'; if (p.actionsLeft <= 0) return '本回合出牌机会已用完，请发送“结束”。'; const unique = []; (indexes || []).forEach((n) => { const i = int(n, 0) - 1; if (i >= 0 && i < p.hand.length && unique.indexOf(i) < 0) unique.push(i); }); if (!unique.length) return '请至少选择一张手牌。'; const cards = unique.map((i) => p.hand[i]); if (cards.some((c) => c.type === 'MAGIC')) return '魔法牌需要单独使用，请发送“使用 <序号或名称>”。'; const elements = cards.filter((c) => c.type === 'ELEMENT' && c.attr !== 'CONSERVATION'); if (!elements.length) return '守恒牌不能单独出牌，请同时选择一种元素牌。'; const attr = elements[0].attr; if (elements.some((c) => c.attr !== attr)) return '一次出牌只能选择同一种元素类型；不同属性请分两次出牌。'; cards.forEach((c) => { if (c.attr === 'CONSERVATION') { c.attr = attr; p.conservationUsed += 1; } }); const globalCount = room.players.reduce((sum, x) => sum + (x.collected[attr] || 0), 0); const points = cards.length * (cards.length + globalCount); p.score += points; p.collected[attr] = (p.collected[attr] || 0) + cards.length; p.pool = p.pool.concat(cards); p.totalElementCards = int(p.totalElementCards, 0) + cards.length; const played = cards.map((c) => ({ attr: c.attr, type: c.type })); if (!Array.isArray(p.roundPlayed)) p.roundPlayed = []; p.roundPlayed.push(played); p.lastPlayed = played; unique.sort((a, b) => b - a).forEach((i) => p.hand.splice(i, 1)); p.actionsLeft -= 1; p.lastAction = `第${p.roundPlayed.length}次出牌：收集${cards.length}张${ALCHEMY_LABELS[attr]}牌，获得${points}分`; room.logs.push(`${p.name}${p.lastAction}。`); room.lastAction = p.lastAction; if (p.actionsLeft <= 0 || !alchemyHasElement(p)) alchemyFinishTurn(room, p); return ''; }
  function alchemyUseMagic(room, p, indexOrName) { if (p.id !== room.players[room.turn].id) return '还没轮到你。'; let idx = int(indexOrName, 0) - 1; const rawName = String(indexOrName || '').trim(); const alias = ALCHEMY_MAGIC_ALIASES[rawName.toUpperCase()] || ALCHEMY_MAGIC_ALIASES[rawName]; if (idx < 0 || idx >= p.hand.length || p.hand[idx].type !== 'MAGIC') { const name = rawName.toUpperCase(); idx = p.hand.findIndex((c) => c.attr === name || c.attr === alias); } if (idx < 0 || !p.hand[idx] || p.hand[idx].type !== 'MAGIC') return '请指定魔法牌序号、全名或首字母：D=黑暗祭祀，S=物质吸取，O=神谕配方，T=时间机器。'; const card = p.hand[idx]; p.hand.splice(idx, 1); room.discard.push(card); const played = [{ attr: card.attr, type: card.type }]; if (!Array.isArray(p.roundPlayed)) p.roundPlayed = []; p.roundPlayed.push(played); p.lastPlayed = played; p.magicUsed += 1; p.actionsLeft = Math.max(0, p.actionsLeft - 1); if (card.attr === 'DARKSACRIFICE') { const cleared = []; room.players.forEach((target) => { const count = Array.isArray(target.pool) ? target.pool.length : 0; if (count) cleared.push(`${target.name}${count}张`); alchemyClearPlayerPool(room, target); }); room.poolClearNotice = `${p.name}发动黑暗祭祀：全场炼金池已清空${cleared.length ? `（${cleared.join('、')}）` : ''}。`; room.logs.push(room.poolClearNotice); } else if (card.attr === 'SNATCH') { p.hand = p.hand.concat(alchemyDraw(room, 4)); alchemySortHand(p.hand); room.logs.push(`${p.name}使用物质吸取，额外抽取4张牌。`); } else if (card.attr === 'ORACLE') { p.score += 5; room.logs.push(`${p.name}使用神谕配方，获得5分。`); } else if (card.attr === 'TIMEMACHINE') { p.actionsLeft = 100; room.logs.push(`${p.name}启动时间机器，本轮可连续收集。`); } alchemySortHand(p.hand); p.lastAction = `使用${ALCHEMY_LABELS[card.attr]}`; room.lastAction = p.lastAction; if (p.actionsLeft <= 0) alchemyFinishTurn(room, p); return ''; }
  function alchemyEndAction(room, id) { const p = room.players[room.turn]; if (!p || p.id !== id) return '还没轮到你。'; alchemyFinishTurn(room, p); return ''; }
  function alchemyRunBots(room) { let guard = 0; while (room.status === 'playing' && room.players[room.turn] && room.players[room.turn].isBot && guard++ < 200) { const p = room.players[room.turn]; const magic = p.hand.findIndex((c) => c.type === 'MAGIC' && (c.attr === 'ORACLE' || c.attr === 'SNATCH' || c.attr === 'TIMEMACHINE')); if (magic >= 0 && Math.random() < 0.35) alchemyUseMagic(room, p, magic + 1); else { const first = p.hand.find((c) => c.type === 'ELEMENT' && c.attr !== 'CONSERVATION'); const choices = first ? p.hand.map((c, i) => c.type === 'ELEMENT' && (c.attr === first.attr || c.attr === 'CONSERVATION') ? i + 1 : 0).filter((i) => i > 0) : []; if (choices.length) alchemyCollect(room, p, choices); else alchemyEndAction(room, p.id); } } }
  function alchemyFinish(room) {
    if (!room || room.status === 'finished') return;
    const max = Math.max.apply(null, room.players.map((p) => p.score));
    const winners = room.players.filter((p) => p.score === max);
    if (winners.length > 1 && room.round <= room.maxRounds + 3) {
      room.maxRounds += 1; room.logs.push(`第${room.round - 1}轮结束，${max}分并列，追加一轮。`);
      room.starter = (room.starter + 1) % room.players.length; room.turn = room.starter;
      room.players.forEach((p) => { p.done = false; p.actionsLeft = 0; });
      alchemyActivateTurn(room); if (room.players[room.turn].isBot) alchemyRunBots(room); return;
    }
    room.status = 'finished'; room.winner = winners.map((p) => p.name).join('、');
    const ranked = room.players.slice().sort((a, b) => b.score - a.score);
    room.ranking = ranked.map((p, index) => ({
      rank: index + 1, id: p.id, name: p.name, score: p.score, coinReward: 0, coinProfit: 0,
      affectionDelta: 0, guest: isGuestPlayer(p)
    }));
    room.logs.push(`炼金术完成：${room.winner}以${max}分胜出。`); room.lastAction = `终局：${room.winner}胜出`;
    if (!room.settled) {
      room.settled = true;
      ranked.forEach((p, index) => {
        const row = room.ranking[index];
        if (!isSettlementEligible(p)) {
          if (isGuestPlayer(p)) room.logs.push(`${p.name} 以游客身份完成本场，排名保留但不结算奖励、好感与档案。`);
          return;
        }
        const profile = loadProfile(p.id, p.name); const won = index === 0;
        const outcome = won ? 'win' : 'loss'; const coinReward = awardEntryReturn(profile, 'alchemy', won);
        const delta = room.mode === 'pve' ? (won ? affectionRules().win : affectionRules().loss) : rankedAffection(index, ranked.length);
        changeAffection(profile, delta);
        const stats = profile.stats.alchemy || emptyGameStats();
        stats.alchemyRounds += room.round;
        stats.alchemyElementCards += int(p.totalElementCards, Array.isArray(p.pool) ? p.pool.length : 0);
        stats.alchemyMagicUsed += p.magicUsed; stats.alchemyConservationUsed += p.conservationUsed;
        stats.alchemyBestScore = Math.max(stats.alchemyBestScore, p.score); profile.stats.alchemy = stats;
        const coinProfit = coinReward - ENTRY.alchemy;
        recordGame(profile, 'alchemy', outcome, p.score, coinProfit, { affectionDelta: delta });
        row.coinReward = coinReward; row.coinProfit = coinProfit; row.affectionDelta = delta;
        if (coinReward) room.logs.push(`${p.name} 获得第一名，返还 ${coinReward} 游戏币。`);
      });
      room.settlement = {
        title: '炼金竞赛结算', subtitle: '得分排名 · 游戏币净收益与好感度变化',
        logs: room.ranking.map((row) => row.guest
          ? `#${row.rank} ${row.name}：${row.score}分，游客不结算`
          : `#${row.rank} ${row.name}：${row.score}分，${signedValue(row.coinProfit)}币，${signedValue(row.affectionDelta)}好感`)
      };
    }
  }
  function alchemyView(room, viewerId, quote) {
    const players = (room ? room.players : []).map((p) => {
      const rawGroups = Array.isArray(p.roundPlayed) ? p.roundPlayed : (p.lastPlayed && p.lastPlayed.length ? [p.lastPlayed] : []);
      return {
        name: p.name, isBot: p.isBot, isGuest: isGuestPlayer(p), score: p.score, handCount: p.hand.length, poolCount: p.pool.length,
        isTurn: room && room.status === 'playing' && room.players[room.turn] && room.players[room.turn].id === p.id,
        hand: p.id === viewerId || room.status === 'finished' ? p.hand.map((c) => ({ attr: c.attr, type: c.type })) : [],
        played: (p.lastPlayed || []).map((c) => ({ attr: c.attr, type: c.type })),
        playedGroups: rawGroups.map((group) => group.map((c) => ({ attr: c.attr, type: c.type }))),
        playedGroupCount: rawGroups.length, collected: p.collected, lastAction: p.lastAction
      };
    });
    const table = room ? {
      status: room.status, round: room.round, maxRounds: room.maxRounds,
      current: room.players[room.turn] ? room.players[room.turn].name : '',
      deckCount: room.deck.length, discardCount: room.discard.length, players,
      lastAction: room.lastAction, poolClearNotice: room.poolClearNotice || '', logs: room.logs.slice(-12),
      ranking: room.ranking || [], settlement: room.settlement || null
    } : { status: 'menu', round: 0, maxRounds: 12, current: '', deckCount: 80, discardCount: 0, players: [], lastAction: '', poolClearNotice: '', logs: [] };
    const lines = room ? [
      `第${room.round}/${room.maxRounds}轮 · 当前行动：${table.current || '—'}`,
      `牌堆${room.deck.length} · 弃牌${room.discard.length}`,
      ...room.players.map((p) => `${roomPlayerName(p)}${p.isBot ? '（AI）' : ''} · ${p.score}分 · 手牌${p.hand.length} · 炼金池${p.pool.length}${p.id === viewerId ? ` · 你的手牌：${p.hand.map((c, i) => `${i + 1}.${ALCHEMY_LABELS[c.attr]}`).join(' ')}` : ''}`),
      ...room.logs.slice(-4).map((x) => `· ${x}`)
    ] : ['80张牌：灵魂/水/火/土/气各14，守恒2；黑暗祭祀、物质吸取、神谕配方、时间机器各2。', '每人7张手牌，每轮最多收集2张，12轮后按分数结算；并列时追加一轮。'];
    return { kind: 'alchemy', title: '魔幻牌炼金术师', subtitle: room ? `四席炼金牌桌 · ${room.mode === 'pve' ? '人机' : '多人'} · 当前${table.current || '等待开始'}` : '炼金桌 · 80张牌 · 12轮', alchemyTable: table, lines, quote: quote || '' };
  }
  function alchemyMenuView(quote) { return { kind: 'alchemy', title: '魔幻牌炼金术师 · 牌桌大厅', subtitle: '复刻原SWF炼金规则 · 入场100游戏币 · 第一名返还200', alchemyTable: { status: 'menu', round: 0, maxRounds: 12, current: '', deckCount: 80, discardCount: 0, players: [], logs: [] }, lines: ['人机：.炼金 人机；多人：.炼金 开房 → .炼金 加入 → .炼金 开始。', '操作：.炼金 选牌 1,3 · .炼金 使用 D/S/O/T · .炼金 结束。', '每轮有两次出牌机会；每次可打出同一种元素的任意多张牌，守恒牌随元素转化。', '多人局按最终排名结算好感；余额不足仍可作为游客参赛，但不结算奖励、好感与档案。', '中文魔法：黑/祭=黑暗祭祀 · 物/吸=物质吸取 · 神/谕/配=神谕配方 · 时/机=时间机器；完整中文牌名也可用。'], quote: quote || '炼金术的关键是控制属性数量与出牌节奏。' }; }
  function alchemyTutorialView() { return { kind: 'alchemy', title: '魔幻牌炼金术师 · 图片教程', subtitle: '复刻自Mohuan SWF游戏规则', tutorial: { layout: 'cards', page: 1, total: 1, entries: [{ title: '牌库与手牌', description: '共80张牌：灵魂、水、火、土、气各14张，守恒2张，四种魔法牌各2张。每位玩家起始7张手牌，抽牌后会按属性自动整理。', tag: '牌库' }, { title: '两次出牌机会', description: '每轮恰有两次出牌机会，不是限制只能出两张牌；一次可以选择同一种元素的任意多张牌，不能混合不同元素。', tag: '规则' }, { title: '收集计分', description: '得分=本次同类牌数×（本次同类牌数+场上已有同类牌数）；自己的炼金池保留到下次轮到自己时清空，因此可供其间行动的其他玩家叠加计分。', tag: '计分' }, { title: '四种魔法', description: 'D=黑暗祭祀（清空全场炼金池）；S=物质吸取（抽4张）；O=神谕配方（立即加5分）；T=时间机器（本轮可连续收集）。魔法单独使用并消耗一次机会。', tag: '魔法' }, { title: '回合与胜负', description: '每人轮流行动；再次轮到自己时，上轮炼金池进入弃牌堆并清空。行动结束后补牌，12轮结束时分数最高者胜出。', tag: '流程' }, { title: '指令', description: '选牌 1,3 / 选牌 Ax3 / 选牌 FFF；魔法支持D/S/O/T、完整中英文牌名，以及黑/祭、物/吸、神/谕/配、时/机等中文简称；结束。', tag: '操作' }] }, quote: '炼金池只保留一轮，利用其他玩家留下的元素可以获得更高乘数。' }; }
    async function handleAlchemy(ctx, msg, args) {
      const id = uid(ctx, msg); const name = uname(ctx, msg); const gid = groupId(ctx, msg); const key = roomKey('alchemy', gid);
      const op = String(args[0] || '').toLowerCase(); let room = ensureRoomAvailable('alchemy', gid);
      if (!args.length && room && room.status === 'finished') { clearKey(key); return replyView(ctx, msg, alchemyMenuView()); }
      if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, alchemyTutorialView());
      if (['人机', 'pve', '单人'].indexOf(op) >= 0) {
        if (room && room.status !== 'finished') return replyView(ctx, msg, alchemyView(room, id, '当前群已有炼金牌桌。'));
        const profile = loadProfile(id, name);
        if (!charge(profile, ENTRY.alchemy)) return replyView(ctx, msg, { kind: 'profile', title: '炼金术入场失败', lines: [`需要 ${ENTRY.alchemy} 游戏币`, `当前余额 ${profile.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
        room = createAlchemyRoom(id, name, true, 'pve'); addRoomBot(room, 'alchemy', 3); alchemyStart(room); alchemyRunBots(room); jsonSet(key, room);
        return replyView(ctx, msg, alchemyView(room, id, `炼金术开始；已支付${ENTRY.alchemy}游戏币，你的手牌在状态图中可见，Bot只依据公开信息行动。`));
      }
      if (['开房', '创建', 'pvp'].indexOf(op) >= 0) {
        if (room && room.status !== 'finished') return replyView(ctx, msg, alchemyView(room, id, '当前群已有炼金牌桌。'));
        const admission = multiplayerAdmission('alchemy', id, name); room = createAlchemyRoom(id, name, admission.paid, 'pvp'); jsonSet(key, room);
        return replyView(ctx, msg, alchemyView(room, id, admission.paid ? `房间已创建，已支付${ENTRY.alchemy}游戏币，等待玩家加入。` : guestAdmissionQuote(ctx, name, ENTRY.alchemy)));
      }
      if (!room) return replyView(ctx, msg, alchemyMenuView());
      if (['加入', 'join'].indexOf(op) >= 0) {
        const result = joinPaidRoom(room, 'alchemy', id, name); if (!result.error) jsonSet(key, room);
        return replyView(ctx, msg, alchemyView(room, id, result.error || (result.paid ? `${name}已加入炼金牌桌，已支付${ENTRY.alchemy}游戏币。` : guestAdmissionQuote(ctx, name, ENTRY.alchemy))));
      }
      if (['开始', 'start'].indexOf(op) >= 0) {
        if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, alchemyView(room, id, '只有房主能开始牌局。'));
        const err = alchemyStart(room); if (!err) jsonSet(key, room); return replyView(ctx, msg, alchemyView(room, id, err || '炼金术开始。'));
      }
      if (room.status === 'finished') return replyView(ctx, msg, alchemyView(room, id, '本局已结算，发送“.炼金”返回大厅。'));
      const p = room.players.find((x) => x.id === id); if (!p) return replyView(ctx, msg, alchemyView(room, id, '你不在这张牌桌上。'));
      let err = ''; const isHumanAction = !p.isBot && room.mode === 'pve' && ['选牌', '选择', 'pick', '使用', 'magic', '结束', '停手', 'end'].indexOf(op) >= 0;
      if (isHumanAction) room.logs = [];
      if (['选牌', '选择', 'pick'].indexOf(op) >= 0) err = alchemyCollect(room, p, alchemyParseSelection(p, args.slice(1).join(' ')));
      else if (['使用', 'magic'].indexOf(op) >= 0) err = alchemyUseMagic(room, p, args[1]);
      else if (['结束', '停手', 'end'].indexOf(op) >= 0) err = alchemyEndAction(room, id);
      else if (['状态', '查看', 'status'].indexOf(op) < 0) err = '可用：选牌 1,3、选牌 Ax3、选牌 FFF、使用 D/S/O/T、结束、状态。';
      if (!err) alchemyRunBots(room); jsonSet(key, room);
      return replyView(ctx, msg, alchemyView(room, id, err || (room.status === 'finished' ? `本局结束，${room.winner}胜出。` : '动作已记录。')));
    }

  async function handleTomb(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const gid = groupId(ctx, msg); const key = roomKey('tomb', gid);
    const defaultEntry = !args.length; const op = String(args[0] || '状态').toLowerCase(); let room = ensureRoomAvailable('tomb', gid);
    if (defaultEntry && room && room.status === 'finished') { clearKey(key); return replyView(ctx, msg, tombMenuView()); }
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, tombTutorialView(args[1]));
    if (['人机', '单人', 'pve'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, tombView(room, '当前群已有古墓夺宝房间。'));
      const profile = loadProfile(id, name); if (!charge(profile, ENTRY.tomb)) return replyView(ctx, msg, { kind: 'tomb', title: '古墓入口拒绝通行', subtitle: `需要${ENTRY.tomb}游戏币`, lines: [`当前余额 ${profile.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      room = createTombRoom(id, name, true, tombMode(args[1])); addRoomBot(room, 'tomb', 3); tombStart(room); tombRunBots(room); jsonSet(key, room);
      return replyView(ctx, msg, tombView(room, profileQuote(ctx, profile)));
    }
    if (['开房', '创建', 'pvp', 'create'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, tombView(room, '当前群已有古墓夺宝房间。'));
      const admission = multiplayerAdmission('tomb', id, name); room = createTombRoom(id, name, admission.paid, tombMode(args[1])); jsonSet(key, room);
      return replyView(ctx, msg, tombView(room, admission.paid ? `${tombModeName(room.mode)}房间创建成功，等待其他摸金者。` : guestAdmissionQuote(ctx, name, ENTRY.tomb)));
    }
    if (!room) return replyView(ctx, msg, tombMenuView());
    if (['加入', 'join'].indexOf(op) >= 0) {
      const result = joinPaidRoom(room, 'tomb', id, name); if (!result.error) jsonSet(key, room);
      return replyView(ctx, msg, tombView(room, result.error || (result.paid ? `${name}已加入摸金队。` : guestAdmissionQuote(ctx, name, ENTRY.tomb))));
    }
    if (['机器人', '加机器人', 'bot'].indexOf(op) >= 0) {
      if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, tombView(room, '只有房主能在等待阶段添加机器人。'));
      if (room.players.length >= 4) return replyView(ctx, msg, tombView(room, '四个席位已经坐满。'));
      addRoomBot(room, 'tomb', args[1] || 1); jsonSet(key, room); return replyView(ctx, msg, tombView(room, '摸金机器人已经入队。'));
    }
    if (['开始', 'start'].indexOf(op) >= 0) {
      const err = room.ownerId === id && room.status === 'waiting' ? tombStart(room) : '只有房主能开启等待中的古墓。';
      if (!err) tombRunBots(room); jsonSet(key, room); return replyView(ctx, msg, tombView(room, err || '石门开启，第一批宝物已经落地。'));
    }
    if (['下一墓', '下一局', '继续', 'next'].indexOf(op) >= 0) {
      const player = room.players.find((item) => item.id === id && !item.isBot);
      if (room.status !== 'between_games') return replyView(ctx, msg, tombView(room, '当前不在两座古墓之间。'));
      if (!player) return replyView(ctx, msg, tombView(room, '只有本队真人摸金者可以开启下一墓。'));
      tombStartExpedition(room); tombRunBots(room); jsonSet(key, room); return replyView(ctx, msg, tombView(room, `第${room.gameNo}座古墓已经开启。`));
    }
    if (['退出', '取消', 'leave', 'cancel'].indexOf(op) >= 0 && room.status === 'waiting') {
      const leaving = room.players.find((player) => player.id === id); const wasPaid = isSettlementEligible(leaving); const err = cancelWaitingRoom(room, id);
      if (!room.players.length) clearKey(key); else jsonSet(key, room);
      return replyView(ctx, msg, room.players.length ? tombView(room, err || (wasPaid ? '已退出并退还100游戏币。' : '游客席位已取消。')) : tombMenuView(err || '房间已经取消。'));
    }
    if (['清理', 'clear'].indexOf(op) >= 0) {
      if (room.status === 'waiting' && room.ownerId === id) refundWaitingRoom(room);
      else if (room.status !== 'finished') return replyView(ctx, msg, tombView(room, '进行中的古墓不能清理。'));
      clearKey(key); return replyView(ctx, msg, tombMenuView('古墓记录已经收起，可以重新组队。'));
    }
    let err = '';
    if (['拿', '取', '选择', 'pick'].indexOf(op) >= 0) err = tombPick(room, id, args[1], '');
    else if (['跳过', '超时', 'skip'].indexOf(op) >= 0) err = tombSkip(room, id, name);
    else if (['状态', 'status'].indexOf(op) < 0) err = '可用操作：拿 <序号>、跳过、状态、下一墓。';
    if (!err) tombRunBots(room); jsonSet(key, room);
    const me = room.players.find((player) => player.id === id); const quote = err || (room.status === 'finished' && isGuestPlayer(me) ? guestSettlementQuote(ctx, name) : room.status === 'finished' ? profileQuote(ctx, loadProfile(id, name)) : '不要只看价值；每一次选择都在改变三重诅咒的目标。');
    return replyView(ctx, msg, tombView(room, quote));
  }

  async function handleScratch(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const key = scratchTicketKey(id); const op = String(args[0] || '帮助').toLowerCase();
    if (['扑克', '视频扑克', 'videopoker', 'video'].indexOf(op) >= 0) return handleVideoPoker(ctx, msg, args.slice(1));
    if (['双色球', 'lottery'].indexOf(op) >= 0) return handleLottery(ctx, msg, args.slice(1));
    if (['生死骰', 'deathdice'].indexOf(op) >= 0) return handleDeathDice(ctx, msg, args.slice(1));
    if (['借款', 'loan'].indexOf(op) >= 0) return handleLoan(ctx, msg, args.slice(1));
    if (['买', '购买', 'buy'].indexOf(op) >= 0) {
      const old = jsonGet(key, null); if (old) return replyView(ctx, msg, scratchView(old, false, '请先刮开手中的票。'));
      const denom = int(args[1], 10); if (SCRATCH_DENOMS.indexOf(denom) < 0) return replyView(ctx, msg, { kind: 'scratch', title: '刮刮乐面额无效', lines: [`可选面额：${SCRATCH_DENOMS.join(' / ')}`, `类型：${SCRATCH_TYPES.join(' / ')}`], quote: '' });
      const type = SCRATCH_TYPES.indexOf(args[2]) >= 0 ? args[2] : pick(SCRATCH_TYPES); const p = loadProfile(id, name);
      if (!charge(p, denom)) return replyView(ctx, msg, { kind: 'scratch', title: '购买失败', lines: [`需要 ${denom} 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      videoPokerFundJackpot(denom); const ticket = makeScratchTicket(id, denom, type); jsonSet(key, ticket); return replyView(ctx, msg, scratchView(ticket, false, profileQuote(ctx, p)));
    }
    if (['刮', '刮开', 'scratch'].indexOf(op) >= 0) {
      const ticket = jsonGet(key, null); if (!ticket) return replyView(ctx, msg, { kind: 'scratch', title: '没有未刮彩票', lines: ['先发送“.yan 刮刮 买 10 [类型]”。'], quote: '' });
      ticket.prize = clamp(int(ticket.prize, 0), 0, int(ticket.denom, 0) * 100);
      const p = loadProfile(id, name); p.coins += ticket.prize; let delta = ticket.prize === 0 ? stakeFailureAffection(ticket.denom) : ticket.multiplier >= 100 ? 15 : ticket.multiplier >= 10 ? 3 : ticket.multiplier >= 2 ? 1 : 0;
      ticket.affectionDelta = delta;
      if (delta) changeAffection(p, delta); else saveProfile(p);
      recordGame(p, 'scratch', ticket.prize > ticket.denom ? 'win' : ticket.prize === ticket.denom ? 'draw' : 'loss', ticket.prize, ticket.prize - ticket.denom, { affectionDelta: delta });
      clearKey(key); const quote = ticket.prize ? `${name} 获得 ${ticket.prize} 游戏币${delta ? `，好感 ${signedValue(delta)}` : ''}。` : `${template(ctx, '文案_失败', { name })} 好感 ${signedValue(delta)}。`;
      return replyView(ctx, msg, scratchView(ticket, true, quote));
    }
    return replyView(ctx, msg, scratchMenuView());
  }

  async function handleLottery(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const p = loadProfile(id, name); const time = nowMs();
    const expired = reconcileLotteryTickets(p, time); if (expired) saveProfile(p);
    const op = String(args[0] || '帮助').toLowerCase();
    if (['状态', 'status'].indexOf(op) >= 0) {
      return replyView(ctx, msg, lotterySceneView('status', p, { page: args[1], status: expired ? `${expired}注彩票已超过兑奖期限。` : '开奖后请在下一次18:00前兑奖。' }));
    }
    if (['历史', '记录', 'history'].indexOf(op) >= 0) return replyView(ctx, msg, lotterySceneView('history', p, { page: args[1] }));
    if (['兑奖结果', '结果', 'result'].indexOf(op) >= 0) {
      if (!p.lottery.lastResult || !p.lottery.lastResult.tickets.length) return replyView(ctx, msg, lotterySceneView('status', p, { status: '目前没有可复看的兑奖结果。' }));
      return replyView(ctx, msg, lotterySceneView('result', p, {
        page: args[1], tickets: p.lottery.lastResult.tickets, totalPrize: p.lottery.lastResult.totalPrize,
        status: p.lottery.lastResult.status || '最近一次兑奖结果。', quote: '兑奖结果会保留到下一次兑奖。'
      }));
    }
    if (['兑奖', '领取', 'claim'].indexOf(op) >= 0) {
      const kept = []; const claimed = []; let totalPrize = 0; let claimedCount = 0;
      p.lottery.tickets.forEach((ticket) => {
        const draw = ensureLotteryDraw(ticket.issue, time);
        if (!draw) { kept.push(ticket); return; }
        const result = lotteryResult(ticket, draw); const row = lotteryHistoryRow(ticket, draw, 'claimed', time);
        const count = lotteryTicketCount(ticket); const payout = result.prize * count;
        claimed.push(lotteryTicketView(ticket, draw)); p.lottery.history.push(row); totalPrize += payout; claimedCount += count;
        if (result.prize > 0) { p.lottery.totalWins += count; p.stats.scratch.lotteryWins += count; }
        p.lottery.totalPrize += payout; p.stats.scratch.lotteryPrize += payout;
        p.stats.scratch.lotteryBestPrize = Math.max(p.stats.scratch.lotteryBestPrize, payout);
        p.stats.scratch.score += payout; p.stats.scratch.best = Math.max(p.stats.scratch.best, payout); p.stats.scratch.profit += payout;
      });
      p.lottery.tickets = kept; p.lottery.history = p.lottery.history.slice(-60); p.coins += totalPrize;
      const settlement = saveProfile(p);
      if (!claimed.length) return replyView(ctx, msg, lotterySceneView('status', p, { status: p.lottery.tickets.length ? '当前彩票仍在等待开奖。' : '当前没有可兑奖的彩票。' }));
      let status = `已核验${claimedCount}注（${claimed.length}组），奖金合计${totalPrize}游戏币。`;
      if (settlement.count) status += ` 自动归还${settlement.count}笔借款，共${settlement.repaid}币。`;
      p.lottery.lastResult = { resolvedAt: time, tickets: claimed, totalPrize, status };
      saveProfile(p);
      const quote = totalPrize > 0 ? template(ctx, '文案_双色球中奖', { name, tier: claimed.length === 1 ? claimed[0].tier : `${claimed.length}注彩票`, prize: totalPrize }) : template(ctx, '文案_双色球未中', { name });
      return replyView(ctx, msg, lotterySceneView('result', p, { tickets: claimed, totalPrize, status, quote }));
    }

    if (!args.length || ['帮助', 'help', '菜单'].indexOf(op) >= 0) return replyView(ctx, msg, lotterySceneView('menu', p));
    const parsed = parseLotterySelections(args);
    if (parsed.error) return replyView(ctx, msg, lotterySceneView('menu', p, { status: parsed.error, quote: '示例：.双色球 机选 10 或 .双色球 批量 1 2 3 4 5 1 / 6 7 8 9 10 2' }));
    const selections = parsed.selections; const purchaseCount = selections.reduce((sum, selection) => sum + lotteryTicketCount(selection), 0);
    const issue = nextLotteryIssue(time); const issueCount = p.lottery.tickets.filter((ticket) => ticket.issue === issue).reduce((sum, ticket) => sum + lotteryTicketCount(ticket), 0);
    if (issueCount >= 20) return replyView(ctx, msg, lotterySceneView('status', p, { issue, status: '单期最多保留20注彩票，请等待开奖。' }));
    if (issueCount + purchaseCount > 20) return replyView(ctx, msg, lotterySceneView('status', p, { issue, status: `本期已有${issueCount}注，本次${purchaseCount}注会超过单期20注上限。` }));
    const price = clamp(seal.ext.getIntConfig(ext, '双色球单注价格'), 1, 10000);
    const totalCost = price * purchaseCount;
    if (p.coins < totalCost) return replyView(ctx, msg, lotterySceneView('menu', p, { issue, status: `购买失败：${purchaseCount}注需要${totalCost}游戏币，当前余额${p.coins}。`, quote: template(ctx, '文案_余额不足', { name }) }));
    p.coins -= totalCost; videoPokerFundJackpot(totalCost);
    const purchased = selections.map((selection, index) => ({
      id: `${String(time)}-${String(index).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`,
      issue, red: selection.red, blue: selection.blue, count: lotteryTicketCount(selection), cost: price, boughtAt: time
    }));
    p.lottery.tickets.push(...purchased); p.lottery.totalTickets += purchaseCount; p.stats.scratch.lotteryTickets += purchaseCount;
    p.stats.scratch.lotterySpent += totalCost; p.stats.scratch.profit -= totalCost; saveProfile(p);
    return replyView(ctx, msg, lotterySceneView('ticket', p, {
      issue, ticket: purchased[0], purchaseCount, status: `购买成功：${purchaseCount}注（${purchased.length}组），共${totalCost}游戏币。`,
      quote: `${name}的${purchased.length}组号码已封存，倍投以xN显示，开奖不会主动通知。`
    }));
  }

  async function handleDeathDice(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const p = loadProfile(id, name); const op = String(args[0] || '帮助').toLowerCase();
    let difficulty = '';
    if (['简单', '普通', 'easy'].indexOf(op) >= 0) difficulty = '简单';
    else if (['困难', 'hard'].indexOf(op) >= 0) difficulty = '困难';
    if (!difficulty) return replyView(ctx, msg, deathDiceView('menu', '简单', null, p));
    if (p.coins <= 0) return replyView(ctx, msg, deathDiceView('menu', difficulty, null, p, null));
    const stake = p.coins; videoPokerFundJackpot(stake); const roll = 1 + Math.floor(Math.random() * 6); const survived = difficulty === '困难' ? roll === 1 : roll !== 6;
    const multiplier = difficulty === '困难' ? 3 : 1.2; const payout = survived ? Math.floor(stake * multiplier) : 0; const profit = payout - stake;
    p.coins = payout; const s = p.stats.scratch; s.plays += 1; s.score += payout; s.best = Math.max(s.best, payout); s.profit += profit;
    if (survived) s.wins += 1; else s.losses += 1;
    s.deathDicePlays += 1; s.deathDiceProfit += profit;
    if (survived) { s.deathDiceWins += 1; s.deathDiceBestWin = Math.max(s.deathDiceBestWin, profit); } else s.deathDiceLosses += 1;
    const settlement = saveProfile(p); const quote = survived
      ? template(ctx, '文案_生死骰生还', { name, prize: payout, entry: stake })
      : template(ctx, '文案_生死骰死亡', { name, prize: 0, entry: stake });
    return replyView(ctx, msg, deathDiceView('result', difficulty, { stake, roll, survived, payout, quote }, p, settlement));
  }

  async function handleLandlord(ctx, msg, args, cmdArgs) {
    const gid = groupId(ctx, msg); const id = uid(ctx, msg); const name = uname(ctx, msg); const key = roomKey('landlord', gid);
    const op = String(args[0] || '状态').trim(); const lower = op.toLowerCase(); let room = ensureRoomAvailable('landlord', gid);
    
    if (!args.length && room && room.status === 'finished') { clearKey(key); return replyView(ctx, msg, landlordMenuView()); }
    if (['教程', '规则', 'help'].indexOf(lower) >= 0) return replyView(ctx, msg, landlordTutorialView());

    // 1. 【推进/解卡辅助指令】
    if (['推进', '解卡', '促使', '催促', '下一步', 'step', 'advance', 'fix'].indexOf(lower) >= 0) {
      if (!room) return replyView(ctx, msg, landlordMenuView('当前群没有正在进行的斗地主房间。'));
      landlordEnsure(room);
      if (room.status === 'bidding') {
        if (room.players[room.current] && room.players[room.current].isBot) {
          landlordBotBid(room);
          if (room.status === 'bidding' && room.players[room.current] && room.players[room.current].isBot) {
            landlordBid(room, room.players[room.current].id, 0);
          }
        }
      } else if (room.status === 'landlordReveal') {
        const lord = room.players[room.landlordIndex];
        if (lord && lord.isBot) landlordBotReveal(room);
      } else if (room.status === 'reportChoice' || room.status === 'reportPlayChoice') {
        const lord = room.players[room.landlordIndex];
        if (lord && lord.isBot) landlordBotReport(room);
      } else if (room.status === 'playing') {
        if (room.players[room.current] && room.players[room.current].isBot) {
          landlordRunBots(room);
          if (room.status === 'playing' && room.players[room.current] && room.players[room.current].isBot) {
            const bot = room.players[room.current];
            if (room.currentPlay && room.currentPlay.length) landlordPlay(room, bot.id, []);
            else {
              const first = landlordSort(bot.hand.slice())[0];
              if (first) landlordPlay(room, bot.id, [first.rank]);
              else landlordNext(room);
            }
            landlordRunBots(room);
          }
        }
      }
      jsonSet(key, room);
      return replyView(ctx, msg, landlordView(room, id, false, '已执行强制推进，Bot轮次已完成。'));
    }

    // 2. 【清理/重置房间指令】
    if (['清理', '重置', '强制清理', 'clear', 'reset'].indexOf(lower) >= 0) {
      if (room) {
        if (room.status === 'waiting' && room.ownerId === id) refundWaitingRoom(room);
        clearKey(key);
      }
      return replyView(ctx, msg, landlordMenuView('斗地主牌桌已重置清理，可以重新创建房间。'));
    }

    // 3. 【真实 12 局实战锦标赛开赛】
    if (['锦标赛', '比赛', 'tournament'].indexOf(lower) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, landlordView(room, id, false, '当前群已有斗地主房间进行中。'));
      const p = loadProfile(id, name);
      if (!charge(p, 500)) return replyView(ctx, msg, { kind: 'profile', title: '斗地主锦标赛入场失败', lines: [`需要 500 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      
      const doubleDeck = args.some((x) => /^(?:四人|4|双副)/.test(String(x)));
      room = createLandlordRoom(id, name, true, 'tournament', doubleDeck);
      const need = doubleDeck ? 4 : 3;
      // 从锦标赛全场选手中抽出本桌对手，同桌Bot与排行榜真实关联
      for (let i = 1; i < need; i++) {
        const tableEntrant = room.tournamentEntrants[i];
        room.players.push(landlordPlayer(tableEntrant.id, tableEntrant.name, true));
      }
      landlordStart(room);
      landlordBotBid(room);
      landlordRunBots(room);
      jsonSet(key, room);
      return replyView(ctx, msg, landlordView(room, id, false, `🏆 12副牌锦标赛正式开赛！已扣除500入场费，全场共${room.tournamentEntrants.length}名选手参战，每副牌结束后实时更新全场排名。`));
    }

    // 4. 【人机模式】
    if (['人机', '单人', 'pve', 'bot'].indexOf(lower) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, landlordView(room, id, false, '当前群已有斗地主房间。'));
      const p = loadProfile(id, name);
      const mode = args.some((x) => /^(?:长时|long|12局)/i.test(String(x))) ? 'long' : args.some((x) => /^(?:中时|medium|6局)/i.test(String(x))) ? 'medium' : args.some((x) => /^(?:短时|short|3局)/i.test(String(x))) ? 'short' : 'pve';
      const entry = mode === 'pve' ? 50 : 100;
      if (!charge(p, entry)) return replyView(ctx, msg, { kind: 'profile', title: '斗地主入场失败', lines: [`需要 ${entry} 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      room = createLandlordRoom(id, name, true, mode, args.some((x) => /^(?:四人|4|双副)/.test(String(x))));
      const need = room.doubleDeck ? 4 : 3;
      while (room.players.length < need) {
        room.players.push(landlordPlayer(`${BOT_PREFIX}landlord:${nowMs()}:${room.players.length}`, landlordBotName(room.players.map((x) => x.name)), true));
      }
      landlordStart(room);
      landlordBotBid(room);
      landlordRunBots(room);
      jsonSet(key, room);
      return replyView(ctx, msg, landlordView(room, id, false, '人机牌局开始。'));
    }

    // 5. 【开房/联机】
    if (['开房', '创建', 'create', 'pvp'].indexOf(lower) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, landlordView(room, id, false, '当前群已有斗地主房间。'));
      const doubleDeck = args.some((x) => /^(?:四人|4|双副)/.test(String(x)));
      const mode = args.some((x) => /^(?:长时|long|12局)/i.test(String(x))) ? 'long' : args.some((x) => /^(?:中时|medium|6局)/i.test(String(x))) ? 'medium' : args.some((x) => /^(?:短时|short|3局)/i.test(String(x))) ? 'short' : 'pvp';
      const admission = multiplayerAdmission('landlord', id, name);
      room = createLandlordRoom(id, name, admission.paid, mode, doubleDeck);
      jsonSet(key, room);
      return replyView(ctx, msg, landlordView(room, id, false, admission.paid ? `房间创建成功，${mode === 'pvp' ? '单局' : mode === 'short' ? '短时3局' : mode === 'medium' ? '中时6局' : '长时12局'}。` : guestAdmissionQuote(ctx, name, mode === 'pvp' ? 50 : 100)));
    }

    if (!room) return replyView(ctx, msg, landlordMenuView());
    landlordEnsure(room);
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);

    // 交互操作分支
    if (['明牌', '摊打', 'open', 'openhand'].indexOf(lower) >= 0) { const err = room.doubleDeck && !room.headLuo ? '四人局只有触发头撂后才能选择摊打。' : landlordContinueAfterReveal(room, true, id); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '已明牌，当前倍率翻倍。')); }
    if (['不明牌', '不摊打', '暗牌', 'noopen', 'close'].indexOf(lower) >= 0) { const err = landlordContinueAfterReveal(room, false, id); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '已选择不明牌。')); }
    if (['报到', 'report'].indexOf(lower) >= 0) { const err = landlordReportDecision(room, true, id, 'play'); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '已选择报到。')); }
    if (['报到打', 'reportplay'].indexOf(lower) >= 0) { const err = landlordReportDecision(room, true, id, 'play'); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '已选择打报到牌。')); }
    if (['报到不打', 'reportpass'].indexOf(lower) >= 0) { const err = landlordReportDecision(room, false, id, 'pass'); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '已选择不打报到牌。')); }
    if (['不报到', '不报', 'noreport'].indexOf(lower) >= 0) { const err = landlordReportDecision(room, false, id, 'pass'); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '已选择不报到。')); }
    if (['加入', 'join'].indexOf(lower) >= 0) { const result = joinPaidRoom(room, 'landlord', id, name); if (!result.error) jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, result.error || `${name}已加入。`)); }
    if (['机器人', '加机器人', 'bot'].indexOf(lower) >= 0) { if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, landlordView(room, id, false, '只有等待中的房主可以添加机器人。')); const need = room.doubleDeck ? 4 : 3; if (room.players.length >= need) return replyView(ctx, msg, landlordView(room, id, false, '牌桌座位已经坐满。')); const requested = clamp(int(args[1], 1), 1, need - room.players.length); for (let i = 0; i < requested; i++) room.players.push(landlordPlayer(`${BOT_PREFIX}landlord:${nowMs()}:${room.players.length}`, landlordBotName(room.players.map((x) => x.name)), true)); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, `已添加${requested}名对手。`)); }
    if (['开始', 'start'].indexOf(lower) >= 0) { const err = room.ownerId === id && room.status === 'waiting' ? landlordStart(room) : '只有房主可以开始。'; if (!err) landlordBotBid(room); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '牌局开始。')); }
    if (['退出', 'leave'].indexOf(lower) >= 0 && room.status === 'waiting') { const err = cancelWaitingRoom(room, id); if (!room.players.length) clearKey(key); else jsonSet(key, room); return replyView(ctx, msg, landlordMenuView(err || '已退出。')); }
    if (['看牌', 'hand', '私牌'].indexOf(lower) >= 0) return replyView(ctx, msg, landlordView(room, id, true, '仅在私聊中显示你的手牌。'), true);
    if (['叫', '叫地主', 'bid'].indexOf(lower) >= 0) { const err = landlordBid(room, id, args[1]); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '叫牌已记录。')); }
    if (['不叫', 'passbid'].indexOf(lower) >= 0) { const err = landlordBid(room, id, 0); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '已不叫。')); }
    if (['出牌', 'play'].indexOf(lower) >= 0) { const parsedCards = landlordParseCards(args.slice(1)); const err = parsedCards.invalid ? '无法识别这组牌，请输入牌面（例如333、jjj44、10JQKA），再重新出牌。' : landlordPlay(room, id, parsedCards); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '出牌已记录。')); }
    if (['不出', 'pass'].indexOf(lower) >= 0) { const err = landlordPlay(room, id, []); jsonSet(key, room); return replyView(ctx, msg, landlordView(room, id, false, err || '已选择不出。')); }
    if (['再来一局', '下一局', 'rematch'].indexOf(lower) >= 0) { clearKey(key); return replyView(ctx, msg, landlordMenuView('上一局已结束，请重新发送“斗地主 人机”或“斗地主 开房”。')); }
    
    return replyView(ctx, msg, landlordView(room, id, false, '可用操作：叫 1/2/3、不叫、出牌、不出、看牌、推进。'));
  }

  async function handleLoan(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const p = loadProfile(id, name); const op = String(args[0] || '状态').toLowerCase();
    if (['申请', '借', '借款', 'borrow'].indexOf(op) < 0) {
      const last = p.loan && p.loan.lastSettlement;
      const details = last ? { repaid: last.repaid, restored: last.restored, quote: template(ctx, '文案_还款', { name, debt: last.repaid, delta: signedValue(last.restored), coins: p.coins, affection: p.affection }) } : null;
      return replyView(ctx, msg, loanView(last ? 'repaid' : 'status', p, details));
    }
    if (p.coins >= 150) return replyView(ctx, msg, loanView('ineligible', p, { quote: '只有游戏币低于150时才能申请保底借款。' }));
    p.loan = normalizeLoanData(p.loan); const outstanding = p.loan.loans.length;
    if (outstanding >= 100) return replyView(ctx, msg, loanView('ineligible', p, { quote: '未还借款已达到安全上限，暂时不能继续申请。' }));
    const penalty = Math.max(0, seal.ext.getIntConfig(ext, '借款首次好感损失')) + outstanding * Math.max(0, seal.ext.getIntConfig(ext, '借款叠加好感损失'));
    p.coins += 150; p.affection -= penalty;
    p.loan.loans.push({ id: `${String(nowMs())}-${outstanding + 1}`, borrowedAt: nowMs(), principal: 150, due: 195, affectionLost: penalty });
    p.loan.totalBorrowed += 150; p.loan.totalAffectionLost += penalty; saveProfile(p);
    const quote = template(ctx, '文案_借款', { name, debt: 195, delta: signedValue(-penalty), coins: p.coins, affection: p.affection });
    return replyView(ctx, msg, loanView('borrowed', p, { borrowed: 150, affectionDelta: -penalty, quote }));
  }

  async function handleFishing(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const defaultEntry = !args.length;
    const op = String(args[0] || '帮助'); let session = jsonGet(fishingKey(id), null);
    if (['图鉴', '鱼鉴', 'dex'].indexOf(op.toLowerCase()) >= 0) {
      const p = loadProfile(id, name); return replyView(ctx, msg, fishingDexView(p, args[1] || 1));
    }
    if (defaultEntry && session && session.status === 'banked') {
      clearKey(fishingKey(id));
      return replyView(ctx, msg, fishingMenuView());
    }
    if (session && session.name !== name) { session.name = name; session.updatedAt = nowMs(); jsonSet(fishingKey(id), session); }
    if (PONDS[op] || ['开始', 'start'].indexOf(op.toLowerCase()) >= 0) {
      const pondName = PONDS[op] ? op : (args[1] || '小鱼塘'); if (!PONDS[pondName]) return replyView(ctx, msg, fishingMenuView('请选择小鱼塘、江水或大海。'));
      if (session && session.status === 'playing') return replyView(ctx, msg, fishingView(session, '请先完成当前垂钓。'));
      const p = loadProfile(id, name); if (!charge(p, PONDS[pondName].cost)) return replyView(ctx, msg, { kind: 'fishing', title: '无法下竿', lines: [`需要 ${PONDS[pondName].cost} 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      session = startFishing(id, name, pondName); return replyView(ctx, msg, fishingView(session, profileQuote(ctx, p)));
    }
    if (!session) return replyView(ctx, msg, fishingMenuView());
    if (['继续', '博弈', 'continue'].indexOf(op.toLowerCase()) >= 0) {
      const result = continueFishing(session); if (!result.ok) return replyView(ctx, msg, fishingView(session, result.msg));
      if (result.lost || result.forced) bankFishing(session, ctx);
      return replyView(ctx, msg, fishingView(session, result.lost ? '这次判断过于激进。' : result.forced ? '五次判断已满，自动收杆。' : '还要继续追求更大的鱼吗？'));
    }
    if (['收杆', '止损', 'bank', 'stop'].indexOf(op.toLowerCase()) >= 0) { const p = bankFishing(session, ctx); return replyView(ctx, msg, fishingView(session, p ? profileQuote(ctx, p) : '本次已经结算。')); }
    return replyView(ctx, msg, fishingView(session, '选择“继续”或“收杆”。'));
  }

  async function handleSign(ctx, msg) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const p = loadProfile(id, name); const today = dateKey();
    const baseCoins = clamp(seal.ext.getIntConfig(ext, '每日签到游戏币'), 0, 1000000); const baseDelta = clamp(seal.ext.getIntConfig(ext, '每日签到好感'), -1000, 1000);
    const previous = p.lastSignReward && typeof p.lastSignReward === 'object' && p.lastSignReward.date === today ? p.lastSignReward : null;
    const alreadyTier = previous ? String(previous.tier || 'basic') : 'basic'; const alreadyTierName = previous ? String(previous.tierName || '日常待遇') : '日常待遇';
    const alreadyCoins = previous ? clamp(int(previous.coins, baseCoins), 0, 1000000) : baseCoins; const alreadyDelta = previous ? clamp(int(previous.affection, baseDelta), -1000, 1000) : baseDelta;
    if (p.lastSign === today) return replyView(ctx, msg, {
      kind: 'daily', title: '每日签到 · 今日已领取', subtitle: today,
      dailyScene: { status: 'already', name, date: today, tier: alreadyTier, tierName: alreadyTierName, coinsReward: alreadyCoins, affectionReward: alreadyDelta, coins: p.coins, affection: p.affection, relation: relation(p.affection).name, relationProgress: relationProgress(p) },
      lines: [`${name} 今日已经领取签到补给`, `当前 ${p.coins} 游戏币  |  ${p.affection}好感 [${relation(p.affection).name}]`], quote: profileQuote(ctx, p)
    });
    const tierRoll = Math.random(); let tier = 'basic'; let tierName = '日常待遇'; let coins = baseCoins; let delta = baseDelta;
    if (tierRoll < 0.1) {
      tier = 'best'; tierName = '最好的待遇'; coins = 200 + Math.floor(Math.random() * 101); delta = 10 + Math.floor(Math.random() * 21);
    } else if (tierRoll < 0.4) {
      tier = 'better'; tierName = '较好的待遇'; coins = 100 + Math.floor(Math.random() * 101); delta = 5 + Math.floor(Math.random() * 6);
    }
    p.lastSign = today; p.coins += coins; changeAffection(p, delta);
    p.lastSignReward = { date: today, tier, tierName, coins, affection: delta }; saveProfile(p);
    return replyView(ctx, msg, {
      kind: 'daily', title: `每日签到 · ${tierName}`, subtitle: today,
      dailyScene: { status: 'claimed', name, date: today, tier, tierName, coinsReward: coins, affectionReward: delta, coins: p.coins, affection: p.affection, relation: relation(p.affection).name, relationProgress: relationProgress(p) },
      lines: [`${tierName}（概率权重 ${tier === 'best' ? '1' : tier === 'better' ? '3' : '6'}/10）`, `游戏币 +${coins}`, `好感 ${signedValue(delta)}`, `当前余额 ${p.coins}  |  好感 ${p.affection}`], quote: template(ctx, '文案_签到', { name, coins, delta, tier, tierName, affection: p.affection, relation: relation(p.affection).name })
    });
  }

  async function handleFeed(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const itemName = args[0];
    const p = loadProfile(id, name);
    if (!FEED_ITEMS[itemName]) return replyView(ctx, msg, {
      kind: 'gift', title: '骰娘的礼物架', subtitle: '发送 .投喂 <礼物名> 赠送礼物',
      giftScene: { mode: 'menu', name, coins: p.coins, affection: p.affection, relation: relation(p.affection).name, relationProgress: relationProgress(p), gifts: giftList() },
      lines: Object.keys(FEED_ITEMS).map((k) => `${k}  ${FEED_ITEMS[k].cost}币  +${FEED_ITEMS[k].affection}好感`), quote: itemName ? `没有找到“${itemName}”，请从礼物架中选择。` : '不同分类与关系阶段可以分别配置骰娘的回应。'
    });
    const item = FEED_ITEMS[itemName];
    if (!charge(p, item.cost)) return replyView(ctx, msg, {
      kind: 'gift', title: '赠礼 · 游戏币不足', subtitle: `${item.category} · ${itemName}`,
      giftScene: { mode: 'insufficient', name, item: itemName, category: item.category, cost: item.cost, affectionGain: item.affection, coins: p.coins, affection: p.affection, relation: relation(p.affection).name, relationProgress: relationProgress(p), gifts: [] },
      lines: [`需要 ${item.cost} 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name, item: itemName, category: item.category })
    });
    changeAffection(p, item.affection);
    const band = affectionBand(p); const rel = relation(p.affection);
    return replyView(ctx, msg, {
      kind: 'gift', title: `赠礼 · ${itemName}`, subtitle: `${item.category} · 已送达`,
      giftScene: { mode: 'result', name, item: itemName, category: item.category, cost: item.cost, affectionGain: item.affection, coins: p.coins, affection: p.affection, relation: rel.name, relationProgress: relationProgress(p), gifts: [] },
      lines: [`游戏币 -${item.cost}`, `好感 +${item.affection}`, `当前 ${p.coins}币  |  ${p.affection}好感 [${rel.name}]`],
      quote: template(ctx, '文案_投喂', { name, item: itemName, '礼物': itemName, category: item.category, '分类': item.category, '礼物分类': item.category, affectionBand: band, '好感': band, delta: item.affection, coins: p.coins, affection: p.affection, relation: rel.name })
    });
  }

  function registrationView(message) {
    return {
      kind: 'profile', title: '建立专属档案', subtitle: '首次使用必须登记名字',
      lines: ['发送：.注册 <名字>（或 .yan 注册 <名字>）', '名字长度为1至9个字，登记后所有小游戏和房间都会使用这个名字。'],
      quote: message || '先告诉骰娘该怎样称呼你。'
    };
  }
  function renameInputView(message) {
    return {
      kind: 'profile', title: '修改专属名字', subtitle: '名字长度为1至9个字',
      lines: ['发送：.改名 <新名字>（或 .yan 改名 <新名字>）', '改名会同步档案、排行榜和当前游戏房间。'], quote: message || ''
    };
  }
  function playerNameInput(args) {
    const name = String((args || []).join(' ')).trim();
    if (!name) return { error: '名字不能为空。' };
    if (Array.from(name).length > 9) return { error: '名字不能超过9个字，请换一个更短的名字。' };
    if (Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return { error: '名字中不能包含控制字符。' };
    return { name };
  }
  async function handleRegister(ctx, msg, args, existing) {
    const p = existing || loadProfile(uid(ctx, msg));
    if (p.registered && p.name) return replyView(ctx, msg, profileView(p, `档案已经登记为“${p.name}”。`));
    const input = playerNameInput(args);
    if (input.error) return replyView(ctx, msg, registrationView(input.error));
    p.name = input.name; p.registered = true; saveProfile(p);
    return replyView(ctx, msg, profileView(p, template(ctx, '文案_注册', {
      name: p.name, coins: p.coins, affection: p.affection, relation: relation(p.affection).name
    })));
  }
  async function handleRename(ctx, msg, args, existing) {
    const p = existing || loadProfile(uid(ctx, msg)); const input = playerNameInput(args);
    if (input.error) return replyView(ctx, msg, renameInputView(input.error));
    if (input.name === p.name) return replyView(ctx, msg, profileView(p, `当前名字已经是“${p.name}”。`));
    const oldName = p.name; p.name = input.name; saveProfile(p);
    syncCurrentContextNames(ctx, msg, p.id, p.name);
    return replyView(ctx, msg, profileView(p, template(ctx, '文案_改名', {
      name: p.name, item: oldName, coins: p.coins, affection: p.affection, relation: relation(p.affection).name
    })));
  }

  function helpView() {
    return { kind: 'profile', title: '骰娘好感度 · 小游戏合集', subtitle: '支持 .yan 总入口与独立短指令', lines: [
      '.注册 <名字>  |  首次使用必填，最多9个字',
      '.改名 <新名字>  |  .我的 [项目/第N页/上一页/下一页]  |  .统计 [项目]',
      'QQ官Bot迁移：加载“QQ官方Bot昵称桥接”后使用 .QQ绑定 <原QQ号>',
      '.签到  |  .投喂 [食物]  |  .我的',
      '.好感数据  |  输出当前用户的好感、钱包、借款与小游戏统计（供 AI Plugin 调用）',
      '.德州 人机/开房/下一手  |  整场入场150，盲注25/50',
      '.德州 教程 [页码]  |  完整流程与牌型',
      '.恶魔 人机/开房 [模式]  |  .恶魔 开枪 自己/对手  |  .恶魔 使用 <道具>',
      '.恶魔 模式/百科/盘面/排行  |  SpaceAdventure V3.1 恶魔轮盘赌',
      '.21点 开始  |  入场100，RE7王牌规则',
      '.21点 教程 [页码]  |  流程与全部王牌',
      '.神抽 人机/开房  |  .神抽 教程 [页码]',
       '.快艇 人机/开房  |  .快艇 教程 [页码]',
       '.打工 开始 [24点/计算器/数独/骑士与无赖/Creek]  |  .打工 按 <按钮序列>  |  .打工 答案 <答案>  |  .打工 结束  |  .打工 统计',
      '.爱赢一切 人机/开房  |  .爱赢一切 教程 [页码]',
      '.古墓 人机/开房 常规/耐久  |  .古墓 拿 <序号> / 教程',
      '.赏金 人机/开房/加入/开始  |  .赏金 行动 移动C4|侦查  |  .赏金 私图',
      '.赏金 仓库 / 武器 / 道具 / 技能 / 教程  |  先配装再进图；单局40回合，13×13地图，携赏金撤离',
      '.刮刮 买 [面额] [类型]  |  .刮刮 刮开',
      '.视频扑克 10/30/50  |  .刮刮 扑克 10/30/50',
      '.双色球 [5红+1蓝] xN / 机选N / 批量多组  |  同组倍投只显示一行xN',
      '.双色球 状态/历史/兑奖结果 [页码]  |  每日18:00开奖，兑奖期限1天',
      '.生死骰 简单/困难  |  押上全部游戏币，不计好感',
      '.借款 申请  |  余额低于150可借，到手150应还195',
      '.斗地主 人机 / 开房 / 加入 / 开始  |  三人单副或四人双副经典规则',
      '.钓鱼牌 人机/开房 [短时/中时/长时]  |  吃牌/弃牌/摸牌，福建56张象棋牌',
      '.斗地主 叫 1/2/3 / 不叫  |  出牌 <牌面> / 不出 / 看牌',
      '.炼金 人机 / 开房 / 加入 / 开始  |  .炼金 选牌 1,3 / 使用 神谕配方(O) / 结束 / 状态',
      '.钓鱼 小鱼塘/江水/大海  |  .钓鱼 继续/收杆/图鉴 [1-6]',
      '.钓鱼牌 人机/开房 [单局/短时/中时/长时]  |  吃牌/弃牌 <序号> · 摸牌 · 手牌',
      '.钓鱼牌 教程  |  56张福建红黑象棋牌，同字异色可吃，行动逆时针',
      '.竞拍 人机/开房 [场地]  |  .竞拍 场地',
      '.竞拍 出价 [金额]  |  单机自动确认，多人确认/撤回',
      '.竞拍 教程 [页码]  |  .竞拍 图鉴',
      '.排行 [综合/好感/金币/德州/21点/神抽/快艇/爱赢一切/古墓/钓鱼/竞拍]',
      '以上指令也都支持“.yan 子指令”写法。'
    ], quote: '所有对局结果都会进入统一档案与排行榜。' };
  }

  const DIRECT_SECTIONS = {
    '注册': '注册', '改名': '改名', '我的': '我的', '档案': '档案', '状态': '状态', '好感': '我的', '统计': '统计',
    '恶魔': '恶魔', '恶魔轮盘': '恶魔', '恶魔轮盘赌': '恶魔', '恶魔赌局': '恶魔', 'demon': '恶魔', 'roulette': '恶魔',
    '签到': '签到', '投喂': '投喂', '德州': '德州', 'texas': '德州', '21点': '21点', '二十一点': '21点',
    '神抽': '神抽', '亡命神抽': '神抽', '快艇': '快艇', '快艇骰': '快艇', 'farkle': '快艇',
    '爱赢一切': '爱赢一切', '爱赢': '爱赢一切', 'love': '爱赢一切', '炼金': '炼金', '魔幻牌': '炼金', '魔幻牌炼金术师': '炼金', 'alchemy': '炼金',
    '古墓': '古墓', '古墓夺宝': '古墓', '摸金': '古墓', 'tomb': '古墓',
    '赏金': '赏金', '赏金对决': '赏金', '赏金行动': '赏金', 'bounty': '赏金',
    '刮刮': '刮刮', '刮刮乐': '刮刮', '视频扑克': '视频扑克', 'videopoker': '视频扑克', '钓鱼': '钓鱼', '钓鱼牌': '钓鱼牌', '捕鱼牌': '钓鱼牌', 'fishingcard': '钓鱼牌', '竞拍': '竞拍', '竞拍之王': '竞拍',
    '双色球': '双色球', '生死骰': '生死骰', '借款': '借款', '斗地主': '斗地主', 'landlord': '斗地主', '斗地': '斗地主',
    '排行': '排行', '排行榜': '排行', '好感榜': '排行', '打工': '打工', '智力打工': '打工', 'work': '打工'
  };

  const cmd = seal.ext.newCmdItemInfo();
  cmd.name = 'yan';
  cmd.help = fallbackText(helpView());
  cmd.allowDelegate = false;
  cmd.solve = async (ctx, msg, cmdArgs) => {
    try {
      const invoked = String(cmdArgs.command || 'yan');
      const forcedSection = invoked.toLowerCase() === 'yan' ? '' : (DIRECT_SECTIONS[invoked] || DIRECT_SECTIONS[invoked.toLowerCase()] || '');
      const section = forcedSection || cmdArgs.getArgN(1) || '我的'; const offset = forcedSection ? 1 : 2;
      // 批量选号、竞拍等模块可能需要超过12个令牌；仍以空参数作为结束，最多读取64个，避免截断多组双色球号码。
      const args = []; for (let i = offset; i < offset + 64; i++) { const v = cmdArgs.getArgN(i); if (!v) break; args.push(v); }
      if (invoked === '赏金行动') args.unshift('行动');
      const currentProfile = loadProfile(uid(ctx, msg));
      if (section === '注册') await handleRegister(ctx, msg, args, currentProfile);
      else if (!currentProfile.registered || !currentProfile.name) await replyView(ctx, msg, registrationView());
      else if (section === '改名') await handleRename(ctx, msg, args, currentProfile);
      else if (section === '德州') await handlePoker(ctx, msg, args);
      else if (section === '恶魔') await handleDemon(ctx, msg, args);
      else if (section === '21点' || section === '二十一点') await handleBlackjack(ctx, msg, args);
      else if (section === '神抽' || section === '亡命神抽') await handleDmd(ctx, msg, args, cmdArgs);
      else if (section === '快艇' || section === '快艇骰' || section.toLowerCase() === 'farkle') await handleFarkle(ctx, msg, args);
      else if (section === '爱赢一切' || section === '爱赢' || section.toLowerCase() === 'love') await handleLove(ctx, msg, args);
      else if (section === '炼金' || section === '魔幻牌炼金术师' || section.toLowerCase() === 'alchemy') await handleAlchemy(ctx, msg, args);
      else if (section === '古墓' || section === '古墓夺宝' || section === '摸金' || section.toLowerCase() === 'tomb') await handleTomb(ctx, msg, args);
      else if (section === '赏金' || section === '赏金对决' || section.toLowerCase() === 'bounty') await handleBounty(ctx, msg, args, cmdArgs);
      else if (section === '刮刮' || section === '刮刮乐') await handleScratch(ctx, msg, args);
      else if (section === '视频扑克') await handleVideoPoker(ctx, msg, args);
      else if (section === '双色球') await handleLottery(ctx, msg, args);
      else if (section === '生死骰') await handleDeathDice(ctx, msg, args);
      else if (section === '借款') await handleLoan(ctx, msg, args);
      else if (section === '斗地主' || section.toLowerCase() === 'landlord') await handleLandlord(ctx, msg, args, cmdArgs);
      else if (section === '钓鱼') await handleFishing(ctx, msg, args);
      else if (section === '钓鱼牌') await handleFishingCard(ctx, msg, args);
       else if (section === '竞拍' || section === '竞拍之王') await handleAuction(ctx, msg, args);
       else if (section === '打工' || section === '智力打工' || section.toLowerCase() === 'work') await handleWork(ctx, msg, args);
      else if (section === '签到') await handleSign(ctx, msg);
      else if (section === '投喂') await handleFeed(ctx, msg, args);
      else if (section === '排行' || section === '排行榜') await replyView(ctx, msg, leaderboardView(args[0] || '综合'));
      else if (section === '统计') {
        const p = loadProfile(uid(ctx, msg)); saveProfile(p); await replyView(ctx, msg, gameStatsView(ctx, p, args[0] || ''));
      }
      else if (section === '我的' || section === '档案' || section === '状态') {
        const p = loadProfile(uid(ctx, msg)); saveProfile(p);
        const requested = String(args[0] || '').trim();
        const isPageToken = /^(?:下一页|下页|next|上一页|上页|prev|previous|首页|总览|\d+|第?\d+页?)$/i.test(requested);
        if (requested && !isPageToken) {
          await replyView(ctx, msg, gameStatsView(ctx, p, requested));
        } else {
          const current = int(jsonGet(profilePageKey(p.id), 1), 1);
          const total = Math.max(1, Math.ceil(Object.keys(GAME_NAMES).length / PROFILE_PAGE_SIZE));
          let page = current;
          if (/^(?:下一页|下页|next)$/i.test(requested)) page += 1;
          else if (/^(?:上一页|上页|prev|previous)$/i.test(requested)) page -= 1;
          else if (/^(?:首页|总览)$/i.test(requested)) page = 1;
          else if (/^(?:\d+|第?\d+页?)$/i.test(requested)) page = int(requested.replace(/[^0-9]/g, ''), 1);
          page = clamp(page, 1, total);
          await replyView(ctx, msg, profileView(p, profileQuote(ctx, p), page));
        }
      } else await replyView(ctx, msg, helpView());
    } catch (e) {
      console.error(`${EXT_NAME}: command failed`, e);
      seal.replyToSender(ctx, msg, `小游戏执行失败：${e && e.message ? e.message : e}`);
    }
    return seal.ext.newCmdExecuteResult(true);
  };

  ext.cmdMap.yan = cmd;
  Object.keys(DIRECT_SECTIONS).forEach((name) => { ext.cmdMap[name] = cmd; });
  // AI Plugin 通过 run_command 调用的稳定、只读数据接口。
  const cmdAffectionStatus = seal.ext.newCmdItemInfo();
  cmdAffectionStatus.name = '好感数据';
  cmdAffectionStatus.help = '只读查询当前用户的好感度、关系阶段、游戏币、借款及各小游戏统计。不会显示 QQ 号或内部用户 ID。\n用法：.好感数据';
  cmdAffectionStatus.solve = async (ctx, msg) => {
    try {
      const p = loadProfile(uid(ctx, msg), uname(ctx, msg));
      saveProfile(p);
      seal.replyToSender(ctx, msg, affectionStatusText(p));
    } catch (e) {
      seal.replyToSender(ctx, msg, `好感数据读取失败：${e && e.message ? e.message : e}`);
    }
    return seal.ext.newCmdExecuteResult(true);
  };
  ext.cmdMap['好感数据'] = cmdAffectionStatus;
  ext.cmdMap['好感查询'] = cmdAffectionStatus;
  ext.cmdMap['好感状态'] = cmdAffectionStatus;
  ext.cmdMap['affection_status'] = cmdAffectionStatus;
  if (typeof seal.ext.registerTask === 'function') {
    seal.ext.registerTask(ext, 'daily', '18:00', () => {
      try { ensureLotteryDraw(dateKey(), nowMs()); } catch (e) { console.error(`${EXT_NAME}: lottery draw task failed`, e); }
    }, 'affection-lottery-daily-draw', '每日18:00静默生成双色球开奖号码，不主动发送消息。');
  }
})();
