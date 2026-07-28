// ==UserScript==
// @name         骰娘好感度（小游戏合集）
// @author       Codex, Air
// @version      1.22.0
// @description  包含德州扑克、RE7二十一点、亡命神抽、Farkle、爱赢一切、钓鱼、竞拍之王、签到、投喂与排行榜的养成小游戏合集。
// @timestamp    1784995200
// @license      Apache-2.0
// @sealVersion  1.4.5
// ==/UserScript==

(function () {
  'use strict';

  const EXT_NAME = '骰娘好感度（小游戏合集）';
  const VERSION = '1.22.0';
  const BOT_PREFIX = 'AFF-BOT:';
  const ENTRY = { poker: 150, blackjack: 100, dmd: 100, farkle: 100, love: 100 };
  const GAME_NAMES = {
    poker: '德州扑克', blackjack: '生化危机21点', dmd: '亡命神抽',
    scratch: '刮刮乐', farkle: 'Farkle快艇骰', love: '爱赢一切', fishing: '钓鱼', auction: '竞拍之王'
  };

  let ext = seal.ext.find(EXT_NAME);
  if (!ext) {
    ext = seal.ext.new(EXT_NAME, 'Codex, Air', VERSION);
    seal.ext.register(ext);
  } else ext.version = VERSION;

  // -------------------- 可配置项 --------------------
  seal.ext.registerIntConfig(ext, '初始游戏币', 500, '首次建立档案时发放的游戏币。');
  seal.ext.registerIntConfig(ext, '每日签到游戏币', 100, '每日签到发放的游戏币。');
  seal.ext.registerIntConfig(ext, '每日签到好感', 5, '每日签到增加的好感度。');
  seal.ext.registerIntConfig(ext, '对决胜利好感', 5, '竞技小游戏第一名或1v1获胜时增加的好感。');
  seal.ext.registerIntConfig(ext, '对决失败好感', -10, '竞技小游戏落败时扣除的好感；实际扣除绝对值始终大于胜利收益。');
  seal.ext.registerIntConfig(ext, '对决第二名好感', 2, '三人及以上对局第二名增加的好感，不会超过第一名。');
  seal.ext.registerIntConfig(ext, '亡命神抽大满贯奖励', 60, '亡命神抽每次大满贯追加的好感；大满贯极难达成，因此默认奖励较高。');
  seal.ext.registerIntConfig(ext, '投入失败好感损失_10币', 1, '10币项目未中奖或鱼获逃脱时扣除的好感。');
  seal.ext.registerIntConfig(ext, '投入失败好感损失_50币', 2, '50币项目未中奖或鱼获逃脱时扣除的好感。');
  seal.ext.registerIntConfig(ext, '投入失败好感损失_100币', 4, '100币项目未中奖或鱼获逃脱时扣除的好感。');
  seal.ext.registerIntConfig(ext, '投入失败好感损失_500币', 8, '500币项目未中奖时扣除的好感。');
  seal.ext.registerIntConfig(ext, '21点摸牌获得王牌概率', 25, '普通摸取数字牌后额外获得一张王牌的概率，范围0-100。');
  seal.ext.registerIntConfig(ext, '判别式文案_低好感上限', 0, '好感低于此值时使用低好感文案。');
  seal.ext.registerIntConfig(ext, '判别式文案_高好感下限', 700, '好感达到此值时使用高好感文案。');
  seal.ext.registerIntConfig(ext, '判别式文案_低游戏币上限', 100, '游戏币低于此值时使用低游戏币文案。');
  seal.ext.registerIntConfig(ext, '判别式文案_高游戏币下限', 2000, '游戏币达到此值时使用高游戏币文案。');
  seal.ext.registerStringConfig(ext, '骰娘称呼', '骰娘', '插件文案中使用的骰娘称呼。');
  seal.ext.registerBoolConfig(ext, '启用图片输出', true, '开启后优先调用图片渲染服务。');
  seal.ext.registerStringConfig(ext, '图片服务地址', 'http://127.0.0.1:3891', '配套 renderer/server.js 的地址。');
  seal.ext.registerIntConfig(ext, '图片请求超时秒数', 15, '图片服务请求超时，范围3-60秒。');
  seal.ext.registerBoolConfig(ext, '图片失败回退文字', true, '渲染失败时是否发送纯文字结果。');
  seal.ext.registerIntConfig(ext, '房间过期分钟', 30, '等待或进行中的房间无操作多久后允许无损清理。');
  seal.ext.registerIntConfig(ext, '竞拍游客预算', 500000, '竞拍多人房中游客可使用的虚拟竞拍币，只影响玩法且不会结算。');
  seal.ext.registerIntConfig(ext, '双色球单注价格', 10, '双色球每注消耗的游戏币，建议保持为10。');
  seal.ext.registerIntConfig(ext, '借款首次好感损失', 20, '没有未还借款时，新借一笔扣除的好感。');
  seal.ext.registerIntConfig(ext, '借款叠加好感损失', 10, '每有一笔未还借款，再次借款额外扣除的好感。');

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
  Object.keys(TEMPLATE_DEFAULTS).forEach((key) => {
    const conditionHelp = key === '文案_投喂' ? ' 投喂文案还支持“分类=甜食;好感=高::文案”的条件前缀；可用条件为分类、好感、礼物，多条件同时满足，越具体的候选越优先。' : '';
    seal.ext.registerTemplateConfig(ext, key, TEMPLATE_DEFAULTS[key], `点击“＋”可添加随机候选；每次调用会重新读取并抽取一条，等权多条时避免连续重复。支持 %权重%文案，以及 {name}、{dice}、{item}、{category}、{delta}、{entry}、{coins}、{affection}、{relation} 占位符。${conditionHelp}`);
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
  function uid(ctx, msg) { return String((ctx.player && ctx.player.userId) || msg.sender.userId); }
  function platformName(ctx, msg) { return String((ctx.player && ctx.player.name) || msg.sender.nickname || '玩家'); }
  function uname(ctx, msg) {
    const stored = jsonGet(profileKey(uid(ctx, msg)), null);
    return stored && stored.registered && stored.name ? String(stored.name) : platformName(ctx, msg);
  }
  function groupId(ctx, msg) { return ctx.isPrivate ? `private:${uid(ctx, msg)}` : String(ctx.group.groupId); }
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
  function roomKey(game, gid) { return `aff.room.v1:${game}:${encodeURIComponent(gid)}`; }
  function loveActiveRoomKey(id) { return `aff.love.active.v1:${encodeURIComponent(id)}`; }
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
      loveRoundsWon: 0, loveWinsAll: 0, loveCheatWins: 0, loveCheatLosses: 0, loveCheatPenalties: 0,
      loveBestChips: 0, loveBestHandRank: 0, loveBestHand: ''
    };
  }
  function emptyLotteryData() {
    return { tickets: [], history: [], totalTickets: 0, totalWins: 0, totalPrize: 0 };
  }
  function emptyLoanData() {
    return { loans: [], totalBorrowed: 0, totalRepaid: 0, totalAffectionLost: 0, totalAffectionRestored: 0, lastSettlement: null };
  }
  function normalizeLotteryData(raw) {
    const data = Object.assign(emptyLotteryData(), raw && typeof raw === 'object' ? raw : {});
    data.tickets = (Array.isArray(data.tickets) ? data.tickets : []).slice(-40).map((ticket) => ({
      id: String(ticket.id || ''), issue: String(ticket.issue || ''), red: (Array.isArray(ticket.red) ? ticket.red : []).map((value) => int(value, 0)).slice(0, 5),
      blue: int(ticket.blue, 0), cost: Math.max(0, int(ticket.cost, 0)), boughtAt: Math.max(0, Number(ticket.boughtAt) || 0)
    })).filter((ticket) => ticket.id && ticket.issue && ticket.red.length === 5 && ticket.blue);
    data.history = (Array.isArray(data.history) ? data.history : []).slice(-60);
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
      lottery: emptyLotteryData(), loan: emptyLoanData(),
      stats: {
        poker: emptyGameStats(), blackjack: emptyGameStats(), dmd: emptyGameStats(),
        scratch: emptyGameStats(), farkle: emptyGameStats(), love: emptyGameStats(), fishing: emptyGameStats(), auction: emptyGameStats()
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
    if (game === 'fishing' && extra && Array.isArray(extra.caughtFish)) recordFishingCatches(s, extra.caughtFish);
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
    if (!seal.ext.getBoolConfig(ext, '启用图片输出')) {
      send(ctx, msg, plain);
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
      send(ctx, msg, `[CQ:image,file=${imageUrl},cache=0]`);
    } catch (e) {
      console.warn(`${EXT_NAME}: render failed`, e);
      if (seal.ext.getBoolConfig(ext, '图片失败回退文字')) send(ctx, msg, `${plain}\n\n[图片渲染失败：${e.message || e}]`);
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
    ['poker', 'blackjack', 'dmd', 'farkle', 'love', 'auction'].forEach((game) => {
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
    return { kind: 'poker', title: '德州扑克淘汰赛', subtitle: '整场仅入场一次150 · 小盲25 · 大盲50', pokerTable, meters, lines, quote: quote || '' };
  }
  function pokerMenuView(quote) {
    return {
      kind: 'poker', title: '德州扑克淘汰赛', subtitle: '整场仅入场一次150 · 小盲25 · 大盲50',
      lines: ['.yan 德州 教程 [页码]', '.yan 德州 人机', '.yan 德州 开房 / 加入 / 机器人 [数量] / 开始', '.yan 德州 过牌 / 跟注 / 加注 [额度] / 全押 / 弃牌', '.yan 德州 看牌 / 状态 / 下一手 / 下一局 / 退出 / 清理', '多人房余额不足仍可作为游客入座，但不结算奖励、好感与档案。'],
      quote: quote || ''
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
    return { game: 'farkle', status: 'waiting', entry: ENTRY.farkle, ownerId, players: [farklePlayer(ownerId, ownerName, false, ownerPaid)], current: 0, target: 5000, dice: [], remaining: 6, phase: 'turn', lastHumanTurn: null, lastBotTurn: null, logs: ['六枚骰子已经放上桌。'], createdAt: nowMs(), updatedAt: nowMs(), settled: false };
  }
  function farkleScore(dice) {
    if (!dice || !dice.length) return 0;
    const counts = [0, 0, 0, 0, 0, 0, 0]; dice.forEach((d) => { if (d >= 1 && d <= 6) counts[d]++; });
    if (dice.length === 6 && counts.slice(1).every((n) => n === 1)) return 1500;
    if (dice.length === 6 && counts.slice(1).filter((n) => n > 0).every((n) => n % 2 === 0) && counts.slice(1).reduce((s, n) => s + n / 2, 0) === 3) return 1500;
    let score = 0;
    for (let face = 1; face <= 6; face++) {
      let count = counts[face];
      if (count === 6) { score += 3000; count = 0; }
      else if (count === 5) { score += 2000; count = 0; }
      else if (count === 4) { score += 1000; count = 0; }
      else if (count >= 3) { score += face === 1 ? 1000 : face * 100; count -= 3; }
      if (face === 1) score += count * 100;
      else if (face === 5) score += count * 50;
      else if (count > 0) return 0;
    }
    return score;
  }
  function farkleBestSelection(dice) {
    let best = { dice: [], score: 0 };
    const total = 1 << dice.length;
    for (let mask = 1; mask < total; mask++) {
      const selected = []; for (let i = 0; i < dice.length; i++) if (mask & (1 << i)) selected.push(dice[i]);
      const score = farkleScore(selected);
      if (score > best.score || (score === best.score && selected.length > best.dice.length)) best = { dice: selected, score };
    }
    return best;
  }
  function farkleStart(room) {
    if (room.players.length < 2) return '至少需要两名玩家或机器人。';
    room.players.forEach((p) => { p.score = 0; p.turnScore = 0; p.bestTurn = 0; });
    room.current = 0; room.dice = []; room.remaining = 6; room.phase = 'turn'; room.status = 'playing'; room.lastHumanTurn = null; room.lastBotTurn = null; room.logs = [`${room.players[0].name} 先手，目标固定为5000分。`]; room.updatedAt = nowMs(); return '';
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
    room.dice = []; for (let i = 0; i < room.remaining; i++) room.dice.push(1 + Math.floor(Math.random() * 6));
    room.phase = 'rolled'; room.logs.push(`${p.name} 投出 [${room.dice.join(', ')}]。`);
    if (!farkleBestSelection(room.dice).score) {
      const rolled = room.dice.slice(); const lostScore = p.turnScore;
      farkleRememberTurn(room, p, { dice: rolled, farkled: true, lostScore, gained: 0 });
      p.turnScore = 0; room.logs.push(`Farkle！${p.name} 本回合 ${lostScore} 分暂存归零。`); farkleNext(room);
    }
    room.updatedAt = nowMs(); return '';
  }
  function parseDiceSelection(text) {
    return String(text || '').replace(/，/g, ',').split(',').map((s) => int(s.trim(), 0)).filter((n) => n >= 1 && n <= 6);
  }
  function farkleKeep(room, id, selection) {
    if (room.status !== 'playing') return '游戏尚未开始或已经结束。';
    const p = room.players[room.current]; if (p.id !== id) return `还没轮到你，当前是 ${p.name}。`;
    if (room.phase !== 'rolled') return '请先投掷。';
    const selected = Array.isArray(selection) ? selection : parseDiceSelection(selection); if (!selected.length) return '请选择至少一枚骰子，例如：1,1,5。';
    const copy = room.dice.slice();
    for (let i = 0; i < selected.length; i++) { const at = copy.indexOf(selected[i]); if (at < 0) return `投掷结果中没有足够的 ${selected[i]}。`; copy.splice(at, 1); }
    const score = farkleScore(selected); if (!score) return '选择中含有不计分骰，或不能构成有效组合。';
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
        const best = farkleBestSelection(room.dice); farkleKeep(room, bot.id, best.dice);
      }
      if (room.status !== 'playing' || room.players[room.current].id !== bot.id) continue;
      if (bot.turnScore >= 500 || bot.score + bot.turnScore >= room.target || Math.random() < 0.32) farkleBank(room, bot.id);
    }
  }
  function farkleView(room, quote) {
    const current = room.players[room.current] || null;
    const phaseLabels = { turn: '等待投掷', rolled: '选择计分骰', kept: '继续投掷或存分' };
    const phaseLabel = room.status === 'waiting' ? '等待房主开始' : room.status === 'finished' ? '比赛已结算' : (phaseLabels[room.phase] || '等待行动');
    const reviewTurn = room.lastHumanTurn && room.lastHumanTurn.farkled && room.phase === 'turn' && !room.dice.length && current && current.id === room.lastHumanTurn.playerId ? room.lastHumanTurn : null;
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
    const best = room.phase === 'rolled' ? farkleBestSelection(room.dice) : { score: 0 };
    const farkleTable = {
      status: room.status, phase: room.phase, phaseLabel, target: room.target, currentName: current ? current.name : '',
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
    return { kind: 'farkle', title: 'Farkle · 快艇骰对决', subtitle: '入场100 · 1v1固定5000分获胜', farkleTable, meters, lines, quote: quote || '' };
  }
  function farkleMenuView(quote) {
    return {
      kind: 'farkle', title: 'Farkle · 快艇骰对决', subtitle: '六骰计分 · 入场100 · 胜者返还200',
      farkleTable: {
        status: 'menu', phase: 'turn', phaseLabel: '选择开局方式', target: 5000, currentName: '', remaining: 6,
        dice: [1, 2, 3, 4, 5, 6], diceReview: false, reviewTurn: null, lastBotTurn: null, suggestedScore: 1500, lastAction: '顺子、三对、三个及以上同点，以及单独的1和5都能计分。',
        players: [
          { name: '你的座位', score: 0, turnScore: 0, bestTurn: 0, isTurn: true, status: '等待入座' },
          { name: '骰娘 / 玩家', score: 0, turnScore: 0, bestTurn: 0, isBot: true, status: '等待对手' }
        ],
        help: ['.快艇 教程 [页码]', '.快艇 人机', '.快艇 开房 / 加入 / 机器人 / 开始', '.快艇 投掷', '.快艇 选择 1,1,5', '.快艇 存分']
      },
      lines: ['.快艇 教程 [页码]', '.快艇 人机  |  .yan 快艇 人机', '.快艇 开房 / 加入 / 机器人 [数量] / 开始', '.快艇 投掷 / 选择 1,1,5 / 存分', '.快艇 状态 / 退出 / 清理', '多人房余额不足仍可作为游客参赛，但不会结算奖励、好感或档案。'],
      quote: quote || '选择计分骰后，可以继续冒险投掷，也可以立即存分。'
    };
  }
  function farkleTutorialView(pageValue) {
    const pages = [
      [
        ['胜利目标', '1v1固定先达到5000分获胜；多人房同样按率先达到目标结束并排名。', '目标'],
        ['游客席位', '多人房余额不足仍可完整参赛，但不结算奖励、好感、项目分或战绩。', '多人'],
        ['开始回合', '每回合从六枚骰子开始投掷；投完后必须选择本次投掷中的有效计分骰。', '流程'],
        ['选择计分骰', '发送“.快艇 选择 1,1,5”保留计分骰；不能夹带任何不参与计分的骰子。', '操作'],
        ['继续冒险', '选完计分骰后可用剩余骰子继续投掷，新的得分会累加到本回合暂存。', '博弈'],
        ['存分', '发送“.快艇 存分”把本回合暂存加入总分并换人；未选择计分骰前不能存分。', '止盈'],
        ['Farkle爆骰', '一次投掷完全没有计分组合时，本回合全部暂存归零并立即换人。', '风险'],
        ['热骰', '一次投掷的所有骰子都被选为计分骰时触发热骰，可重新投掷完整六枚。', '奖励'],
        ['经济结算', '入场100；唯一第一名返还200游戏币。失败扣除的好感默认多于胜利增加值。', '结算']
      ],
      [
        ['单个1', '每个单独的1计100分，可以和其他有效组合一起选择。', '100分'],
        ['单个5', '每个单独的5计50分，可以和其他有效组合一起选择。', '50分'],
        ['三个1', '三个1计1000分；多出的第4、第5、第6个1会依次将该组合分数翻倍。', '三条'],
        ['普通三条', '三个相同的2至6按点数×100计分，例如三个4计400分。', '三条'],
        ['四五六条', '四条是对应三条的2倍，五条4倍，六条8倍；可再叠加单个1或5。', '高分组合'],
        ['六骰顺子', '1、2、3、4、5、6各一枚组成顺子，固定计1500分并触发热骰。', '1500分'],
        ['三对', '六枚骰子恰好组成三组对子，固定计1500分并触发热骰。', '1500分'],
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
      kind: 'love', title: '爱赢一切 · 1v1牌桌', subtitle: `${phaseLabels[room.phase] || '等待行动'} · 每7轮压力洗牌并减半筹码`,
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
      kind: 'scratch', title: '骰娘彩票与风险游戏', subtitle: '即开票 · 每日双色球 · 生死骰 · 九出十三归',
      lines: [
        '.刮刮 买 [面额] [类型]  |  .刮刮 刮开',
        '.yan 刮刮 买 [面额] [类型]  |  完整写法同样有效',
        '.双色球 [5个红球] [1个蓝球]  |  .双色球 兑奖/状态/历史',
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
      ticketId: ticket.id, issue: ticket.issue, red: ticket.red.slice(), blue: ticket.blue,
      drawRed: draw.red.slice(), drawBlue: draw.blue, redMatches: result.redMatches, blueMatch: result.blueMatch,
      tier: status === 'expired' ? '已过期' : result.tier, prize: status === 'expired' ? 0 : result.prize,
      status, resolvedAt: timestamp
    };
  }
  function reconcileLotteryTickets(p, timestamp) {
    const time = timestamp == null ? nowMs() : timestamp; p.lottery = normalizeLotteryData(p.lottery);
    const kept = []; let expired = 0;
    p.lottery.tickets.forEach((ticket) => {
      const draw = ensureLotteryDraw(ticket.issue, time); const expiresAt = lotteryDrawAt(shiftDateKey(ticket.issue, 1));
      if (draw && time >= expiresAt) {
        p.lottery.history.push(lotteryHistoryRow(ticket, draw, 'expired', time)); expired += 1;
      } else kept.push(ticket);
    });
    p.lottery.tickets = kept; p.lottery.history = p.lottery.history.slice(-60);
    return expired;
  }
  function lotteryTicketView(ticket, draw) {
    const result = draw ? lotteryResult(ticket, draw) : null;
    return {
      id: ticket.id, issue: ticket.issue, red: ticket.red.slice(), blue: ticket.blue, cost: ticket.cost,
      drawRed: draw ? draw.red.slice() : [], drawBlue: draw ? draw.blue : 0,
      redMatches: result ? result.redMatches : 0, blueMatch: result ? result.blueMatch : false,
      tier: result ? result.tier : '待开奖', prize: result ? result.prize : 0
    };
  }
  function lotterySceneView(mode, p, options) {
    const opts = options || {}; const time = nowMs(); const issue = opts.issue || nextLotteryIssue(time);
    const pending = p.lottery.tickets.map((ticket) => lotteryTicketView(ticket, ensureLotteryDraw(ticket.issue, time))).slice(-8);
    const globalHistory = jsonGet(LOTTERY_DRAW_HISTORY_KEY, []); const history = p.lottery.history.slice(-8).reverse();
    const scene = {
      mode, issue, price: clamp(seal.ext.getIntConfig(ext, '双色球单注价格'), 1, 10000),
      drawAt: lotteryDrawAt(issue), expiresAt: lotteryDrawAt(shiftDateKey(issue, 1)), status: opts.status || '',
      selectedRed: opts.ticket ? opts.ticket.red : [], selectedBlue: opts.ticket ? opts.ticket.blue : 0,
      drawnRed: opts.draw ? opts.draw.red : [], drawnBlue: opts.draw ? opts.draw.blue : 0,
      redMatches: opts.result ? opts.result.redMatches : 0, blueMatch: opts.result ? opts.result.blueMatch : false,
      tier: opts.result ? opts.result.tier : '', prize: opts.result ? opts.result.prize : 0,
      totalPrize: Math.max(0, int(opts.totalPrize, 0)), tickets: opts.tickets || pending,
      history, draws: (Array.isArray(globalHistory) ? globalHistory : []).slice(-8).reverse(),
      prizeTable: LOTTERY_PRIZES.map((row) => ({ label: row.red < 0 ? '仅中蓝球' : `${row.red}红${row.blue ? '+蓝' : ''}`, tier: row.tier, prize: row.prize }))
    };
    const lines = [`第 ${issue} 期  |  开奖 ${formatLocalTime(scene.drawAt)}  |  单注 ${scene.price} 币`];
    if (mode === 'menu') lines.push('从1-15选择5个不重复红球，再从1-4选择1个蓝球。', '.双色球 1 2 3 4 5 1', '.双色球 随机  |  .双色球 状态/兑奖/历史');
    else if (mode === 'ticket') lines.push(`选号：红 ${scene.selectedRed.join(' ')}  |  蓝 ${scene.selectedBlue}`, '彩票已经进入下一期开奖队列。');
    else if (mode === 'result') lines.push(`本次兑奖 ${scene.tickets.length} 注  |  奖金合计 ${scene.totalPrize}`, opts.status || '兑奖完成。');
    else if (mode === 'history') lines.push(`个人记录 ${p.lottery.history.length} 条  |  累计奖金 ${p.lottery.totalPrize}`, '这里只显示最近的个人票据与全局开奖记录。');
    else lines.push(`待处理 ${p.lottery.tickets.length} 注`, opts.status || '开奖后请在下一次18:00前兑奖。');
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

  // -------------------- 钓鱼 --------------------
  const PONDS = {
    '小鱼塘': {
      cost: 10, baseRisk: 0.08, values: [4, 8, 15, 30], fish: [
        ['麦穗鱼', '白条鱼', '鳑鲏', '泥鳅'],
        ['鲫鱼', '鲤鱼', '黄颡鱼', '罗非鱼'],
        ['锦鲤', '乌鳢', '翘嘴鲌', '大口鲶'],
        ['老甲鱼', '金色锦鲤', '巨型鳄雀鳝', '镜鲤鱼王']
      ]
    },
    '江水': {
      cost: 50, baseRisk: 0.15, values: [20, 45, 100, 250], fish: [
        ['鳊鱼', '马口鱼', '赤眼鳟', '餐条'],
        ['鲈鱼', '青鱼', '草鱼', '鲢鱼'],
        ['鳜鱼', '长江鲟', '胭脂鱼', '鳗鲡'],
        ['江豚影子', '白鲟幻影', '巨型鲶鱼', '川陕哲罗鲑']
      ]
    },
    '大海': {
      cost: 100, baseRisk: 0.22, values: [45, 120, 300, 800], fish: [
        ['鲭鱼', '沙丁鱼', '秋刀鱼', '竹荚鱼'],
        ['石斑鱼', '真鲷', '鲣鱼', '带鱼'],
        ['蓝鳍金枪鱼', '旗鱼', '剑鱼', '苏眉鱼'],
        ['皇带鱼', '鲸鲨', '腔棘鱼', '皱鳃鲨']
      ]
    }
  };
  const FISH_RARITIES = ['普通', '少见', '稀有', '传说'];
  function fishCatalog() {
    const result = [];
    Object.keys(PONDS).forEach((pondName) => {
      PONDS[pondName].fish.forEach((group, rarity) => {
        group.forEach((name) => result.push({ name, pond: pondName, rarity }));
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
      name: definition.name, pond: definition.pond, rarity: definition.rarity,
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
        name: fish.name, pond: fish.pond, rarity: fish.rarity, count: Math.max(0, int(previous.count, 0)) + 1,
        largestSize: Number.isFinite(previousLargest) ? Math.max(previousLargest, fish.size) : fish.size,
        smallestSize: Number.isFinite(previousSmallest) ? Math.min(previousSmallest, fish.size) : fish.size
      };
      if (!stats.biggestFish || fish.size > Number(stats.biggestFish.size || 0)) stats.biggestFish = fish;
      if (!stats.smallestFish || fish.size < Number(stats.smallestFish.size || 0)) stats.smallestFish = fish;
    });
  }
  function fishingRarity(stage) {
    const progress = clamp(int(stage, 0), 0, 4);
    const legendaryChance = 0.0025 + progress * 0.0015;
    const rareChance = 0.025 + progress * 0.006;
    const uncommonChance = 0.18 + progress * 0.012;
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
    const size = Math.round((0.3 + Math.random() * (rarity + 1.2)) * 100) / 100;
    const value = Math.max(1, Math.floor(pond.values[rarity] * (0.75 + Math.random() * 0.5)));
    const catchItem = { name: pick(pond.fish[rarity]), pond: session.pond, rarity, size, value };
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
      fish: PONDS[name].fish.map((group) => group[0]), speciesCount: PONDS[name].fish.reduce((sum, group) => sum + group.length, 0),
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
      haul: session.haul.slice(-5).map((fish) => ({ name: fish.name, rarity: fish.rarity, rarityName: FISH_RARITIES[fish.rarity], size: fish.size, value: fish.value }))
    };
    return { kind: 'fishing', title: '钓鱼佬 · 风险与收获', subtitle: '小鱼塘10 · 江水50 · 大海100', fishingScene, meters, lines, quote: quote || '' };
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
  function auctionRoomView(room, viewerId, quote) {
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
    const scene = {
      mode, round: room.round, maxRounds: room.maxRounds, autoConfirm: room.mode === 'solo', assistant: assistantData,
      assistantReport: viewer && viewer.assistantReport ? viewer.assistantReport : null, assistants: [], venues: [], selectedVenue: room.venue || '新手仓',
      container: room.container ? {
        code: room.container.code, theme: room.container.theme, venue: room.venue, clue: room.container.clue,
        silhouette: mode === 'result' ? room.container.silhouette : `${AUCTION_GRID_WIDTH}×${AUCTION_GRID_HEIGHT}货柜处于战争迷雾中；只按格显示已取得的品质情报。`,
        seal: room.container.seal, gridWidth: AUCTION_GRID_WIDTH, gridHeight: AUCTION_GRID_HEIGHT
      } : null,
      ownBid: viewer ? viewer.bid : 0, budget: viewer ? auctionBudget(viewer) : 0,
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
    return { kind: 'auction', title: mode === 'result' ? '竞拍之王 · 开箱结算' : '竞拍之王 · 货柜暗标', subtitle: `${room.venue || '新手仓'} · 金额保密 · 轮次名次公开 · 1游戏币=${AUCTION_RATE}竞拍币`, auctionScene: scene, lines, quote: quote || '' };
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
      '神抽': 'dmd', '亡命神抽': 'dmd', '刮刮': 'scratch', '刮刮乐': 'scratch',
      '快艇': 'farkle', '快艇骰': 'farkle', 'farkle': 'farkle', '钓鱼': 'fishing',
      '爱赢一切': 'love', '爱赢': 'love', 'love': 'love',
      '竞拍': 'auction', '竞拍之王': 'auction', 'auction': 'auction'
    };
    return gameMap[String(board || '').toLowerCase()] || gameMap[String(board || '')] || '';
  }
  function moduleViewModel(game, stats) {
    const s = Object.assign(emptyGameStats(), stats || {});
    return {
      key: game, name: GAME_NAMES[game], plays: s.plays, wins: s.wins, losses: s.losses, draws: s.draws,
      score: s.score, best: s.best, profit: s.profit, grandSlams: s.grandSlams,
      affection: s.affection, affectionGained: s.affectionGained, affectionLost: s.affectionLost,
      bestPokerHand: game === 'poker' ? pokerBestHandText(s) : ''
    };
  }
  function profileView(p, quote) {
    const rel = relation(p.affection); const progress = rel.next === null ? '已达到最高关系阶段' : `距离下一级还需 ${rel.next - p.affection}`;
    const lines = [`${p.name}  |  关系 ${rel.name}`, `好感 ${p.affection}  |  ${progress}`, `游戏币 ${p.coins}`];
    if (p.loan && Array.isArray(p.loan.loans) && p.loan.loans.length) lines.push(`未还借款 ${p.loan.loans.length} 笔  |  应还 ${p.loan.loans.length * 195} 游戏币`);
    Object.keys(GAME_NAMES).forEach((g) => {
      const s = p.stats[g];
      if (s.plays || (g === 'poker' && s.bestPokerHand)) lines.push(`${GAME_NAMES[g]}：${s.plays}局 ${s.wins}胜/${s.losses}负/${s.draws}平 最高${s.best}${g === 'poker' ? ` 最大牌型${pokerBestHandText(s)}` : ''} 收益${s.profit} 好感+${s.affectionGained}/-${s.affectionLost}（净${s.affection >= 0 ? '+' : ''}${s.affection}）`);
    });
    const coinGoal = Math.max(1, seal.ext.getIntConfig(ext, '判别式文案_高游戏币下限'));
    const meters = [relationMeter(p), { label: '游戏币储备', value: p.coins, min: 0, max: coinGoal, text: `${p.coins}币 · 富足线${coinGoal}` }];
    const modules = Object.keys(GAME_NAMES).map((game) => moduleViewModel(game, p.stats[game]));
    return { kind: 'profile', title: '骰娘好感档案', subtitle: `${p.name} · ${rel.name} · 发送“.yan 我的 项目”查看详情`, meters, modules, lines, quote: quote || profileQuote(null, p) };
  }
  function gameStatsView(ctx, p, board) {
    const game = boardGameKey(board);
    if (!game) return {
      kind: 'stats', title: '请选择统计项目', subtitle: p.name,
      lines: [`可查看：德州 / 21点 / 神抽 / 刮刮 / 快艇 / ${GAME_NAMES.love} / 钓鱼 / 竞拍`, `示例：.yan 我的 ${GAME_NAMES.love}`], quote: profileQuote(ctx, p)
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
    if (game === 'scratch') tiles.push(
      { label: '双色球 注 / 中', value: `${s.lotteryTickets} / ${s.lotteryWins}`, tone: 'positive' },
      { label: '双色球 奖金 / 最高', value: `${s.lotteryPrize} / ${s.lotteryBestPrize}`, tone: 'accent' },
      { label: '生死骰 局 / 胜 / 净收益', value: `${s.deathDicePlays} / ${s.deathDiceWins} / ${signedValue(s.deathDiceProfit)}`, tone: s.deathDiceProfit >= 0 ? 'positive' : 'negative' }
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
      fishingDetails = { biggestText, smallestText, unlocked, total: catalog.length, percent };
    }
    const lines = [
      `总局数 ${s.plays}  |  ${s.wins}胜 ${s.losses}负 ${s.draws}平  |  胜率 ${winRate}%`,
      `历史最高 ${s.best}  |  累计项目分 ${s.score}  |  游戏币净收益 ${signedProfit}`,
      `累计获得好感 +${s.affectionGained}  |  累计失去好感 -${s.affectionLost}  |  净变化 ${signedAffection}`
    ];
    if (game === 'poker') lines.push(`历史最大牌型 ${pokerBestHandText(s)}`);
    if (game === 'dmd') lines.push(`大满贯 ${s.grandSlams} 次`);
    if (game === 'love') {
      lines.push(`赢下轮次 ${s.loveRoundsWon}  |  爱赢一切 ${s.loveWinsAll} 次  |  终局最高 ${s.loveBestChips} 筹码`);
      lines.push(`骗子牌 ${s.loveCheatWins}胜/${s.loveCheatLosses}负  |  额外罚筹码 ${s.loveCheatPenalties}  |  最高牌型 ${s.loveBestHand || '尚无记录'}`);
    }
    if (game === 'scratch') {
      lines.push(`双色球 ${s.lotteryTickets}注 / ${s.lotteryWins}次中奖  |  累计奖金 ${s.lotteryPrize}  |  最高 ${s.lotteryBestPrize}`);
      lines.push(`生死骰 ${s.deathDicePlays}局 ${s.deathDiceWins}胜/${s.deathDiceLosses}负  |  净收益 ${signedValue(s.deathDiceProfit)}  |  单次最高净赢 ${s.deathDiceBestWin}`);
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
    return { kind: 'stats', title: `${GAME_NAMES[game]} · 详细统计`, subtitle: `${p.name}的项目档案`, tiles, auctionScene: auctionDetails, lines, quote: profileQuote(ctx, p) };
  }
  function allProfiles() {
    const reg = jsonGet('aff.registry.v1', { ids: [], names: {} }); const list = [];
    reg.ids.forEach((id) => {
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
    if (g === 'scratch' || g === 'fishing') return s.profit;
    if (g === 'auction') return s.bestAuctionProfit + s.wins * 100000;
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
    return { kind: 'leaderboard', title: `${normalized}排行榜`, subtitle: `可查看：综合 / 好感 / 金币 / 德州 / 21点 / 神抽 / 刮刮 / 快艇 / ${GAME_NAMES.love} / 钓鱼 / 竞拍`, rankings, lines, quote: '' };
  }

  // -------------------- 房间操作辅助 --------------------
  function addRoomBot(room, game, count) {
    count = clamp(int(count, 1), 1, 5);
    const names = ['姜修泽', '葛明治', '阿日', '严茫熙', '亨德森'];
    for (let i = 0; i < count && room.players.length < 6; i++) {
      const id = `${BOT_PREFIX}${game}:${nowMs()}:${room.players.length}`; const name = names[(room.players.length - 1) % names.length];
      room.players.push(game === 'poker' ? pokerPlayer(id, name, true) : game === 'dmd' ? dmdPlayer(id, name, true) : game === 'love' ? lovePlayer(id, name, true) : farklePlayer(id, name, true));
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
    if (room.players.length >= (game === 'love' ? 2 : 6)) return { error: '房间已满。' };
    const admission = multiplayerAdmission(game, id, name);
    const player = game === 'poker' ? pokerPlayer(id, name, false, admission.paid) : game === 'dmd' ? dmdPlayer(id, name, false, admission.paid) : game === 'love' ? lovePlayer(id, name, false, admission.paid) : farklePlayer(id, name, false, admission.paid);
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

  // -------------------- 指令处理 --------------------
  async function handleAuction(ctx, msg, args) {
    const gid = groupId(ctx, msg); const id = uid(ctx, msg); const name = uname(ctx, msg); const key = roomKey('auction', gid);
    let profile = loadProfile(id, name); const defaultEntry = !args.length; const op = String(args[0] || '状态').toLowerCase(); let roomResetQuote = '';
    const migratedAssistant = auctionNormalizeAssistant(profile.auctionAssistant);
    if (profile.auctionAssistant && migratedAssistant && migratedAssistant !== profile.auctionAssistant) { profile.auctionAssistant = migratedAssistant; saveProfile(profile); }
    let room = ensureRoomAvailable('auction', gid);
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
      const err = auctionStart(room); jsonSet(key, room);
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
    if (!err && ((room.mode === 'solo' && ['出价', '暗标', 'bid'].indexOf(op) >= 0) || ['确认', '锁定', 'confirm', '放弃', '退出竞拍', 'pass'].indexOf(op) >= 0)) auctionAdvance(room);
    jsonSet(key, room);
    const me = room.players.find((player) => player.id === id);
    const quote = err || (room.status === 'finished' && me && isGuestPlayer(me) ? guestSettlementQuote(ctx, name) : room.status === 'finished' ? '开箱已经完成；再次发送“.竞拍”返回场地与指令菜单。' : ['出价', '暗标', 'bid'].indexOf(op) >= 0 ? room.mode === 'solo' ? '本轮已自动确认并结算；名次已写入席位下方，具体金额仍保密。' : '暗标已更新，可继续修改；满意后发送“.竞拍 确认”。' : '每轮公开价格名次与五轮轨迹，但不公开任何对手具体金额。');
    return replyView(ctx, msg, auctionRoomView(room, id, quote));
  }

  async function handlePoker(ctx, msg, args) {
    const gid = groupId(ctx, msg); const id = uid(ctx, msg); const name = uname(ctx, msg); const key = roomKey('poker', gid);
    const defaultEntry = !args.length;
    let room = ensureRoomAvailable('poker', gid); const op = String(args[0] || '状态').toLowerCase();
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
      room = createPokerRoom(id, name, true, 'pve'); addRoomBot(room, 'poker', 1); startPoker(room); pokerRunBots(room); jsonSet(key, room);
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
    if (['看牌', 'hand'].indexOf(op) >= 0) return replyView(ctx, msg, pokerView(room, id, true, '底牌只通过私聊发送。'), true);
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
    if (syncRoomPlayerName(room, id, name)) jsonSet(key, room);
    if (['教程', '规则', 'help'].indexOf(op) >= 0) return replyView(ctx, msg, farkleTutorialView(args[1]));
    if (['人机', '单人', 'bot'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, farkleView(room, '当前群已有快艇骰房间。'));
      const p = loadProfile(id, name); if (!charge(p, ENTRY.farkle)) return replyView(ctx, msg, { kind: 'profile', title: '无法入场', lines: [`需要 ${ENTRY.farkle} 游戏币`], quote: template(ctx, '文案_余额不足', { name }) });
      room = createFarkleRoom(id, name); addRoomBot(room, 'farkle', 1); farkleStart(room); farkleRunBots(room); jsonSet(key, room); return replyView(ctx, msg, farkleView(room, profileQuote(ctx, p)));
    }
    if (['开房', '创建', 'create'].indexOf(op) >= 0) {
      if (room && room.status !== 'finished') return replyView(ctx, msg, farkleView(room, '当前群已有快艇骰房间。'));
      const admission = multiplayerAdmission('farkle', id, name);
      room = createFarkleRoom(id, name, admission.paid); jsonSet(key, room); return replyView(ctx, msg, farkleView(room, admission.paid ? '房间创建成功。' : guestAdmissionQuote(ctx, name, ENTRY.farkle)));
    }
    if (!room) return replyView(ctx, msg, farkleMenuView());
    if (['加入', 'join'].indexOf(op) >= 0) { const result = joinPaidRoom(room, 'farkle', id, name); if (!result.error) jsonSet(key, room); return replyView(ctx, msg, farkleView(room, result.error || (result.paid ? `${name} 已加入。` : guestAdmissionQuote(ctx, name, ENTRY.farkle)))); }
    if (['机器人', 'bot'].indexOf(op) >= 0) { if (room.ownerId !== id || room.status !== 'waiting') return replyView(ctx, msg, farkleView(room, '只有等待中的房主能添加机器人。')); addRoomBot(room, 'farkle', args[1]); jsonSet(key, room); return replyView(ctx, msg, farkleView(room, '机器人已加入。')); }
    if (['开始', 'start'].indexOf(op) >= 0) { const err = room.ownerId === id && room.status === 'waiting' ? farkleStart(room) : '只有房主能开始等待中的房间。'; if (!err) farkleRunBots(room); jsonSet(key, room); return replyView(ctx, msg, farkleView(room, err || '比赛开始。')); }
    if (['退出', 'leave'].indexOf(op) >= 0 && room.status === 'waiting') { const leaving = room.players.find((player) => player.id === id); const wasPaid = isSettlementEligible(leaving); const err = cancelWaitingRoom(room, id); if (!room.players.length) clearKey(key); else jsonSet(key, room); return replyView(ctx, msg, farkleView(room, err || (wasPaid ? '已退出并退还入场费。' : '游客席位已取消；本次没有收取入场费。'))); }
    if (['清理', 'clear'].indexOf(op) >= 0) { if (room.status === 'waiting' && room.ownerId === id) refundWaitingRoom(room); else if (room.status !== 'finished') return replyView(ctx, msg, farkleView(room, '进行中不能清理。')); clearKey(key); return replyView(ctx, msg, farkleMenuView('房间已清理，可以创建新房间。')); }
    let err = '';
    if (['投掷', '投', 'roll'].indexOf(op) >= 0) err = farkleRoll(room, id);
    else if (['选择', '保留', 'keep', 'select'].indexOf(op) >= 0) err = farkleKeep(room, id, args[1]);
    else if (['存分', '收手', 'bank'].indexOf(op) >= 0) err = farkleBank(room, id);
    else if (['状态', 'status'].indexOf(op) < 0) err = '可用操作：投掷、选择 1,1,5、存分。';
    if (!err) farkleRunBots(room); jsonSet(key, room); const me = room.players.find((player) => player.id === id); const quote = err || (room.status === 'finished' && isGuestPlayer(me) ? guestSettlementQuote(ctx, name) : profileQuote(ctx, loadProfile(id, name))); return replyView(ctx, msg, farkleView(room, quote));
  }

  async function handleLove(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const privateMessage = !!ctx.isPrivate; const op = String(args[0] || '状态').toLowerCase();
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
      if (!err) { loveBindRoomPlayers(room, gid); loveRunBots(room); } jsonSet(key, room); return replyView(ctx, msg, loveView(room, id, false, err || (room.mode === 'pve' ? '牌局开始；玩家手牌会在群图中常亮。' : '牌局开始；公开牌与宣告请在私聊中锁定。')));
    }
    if (['看牌', 'hand', '私牌'].indexOf(op) >= 0) {
      if (!room.players.some((player) => player.id === id)) return replyView(ctx, msg, loveView(room, id, false, '你不在这张牌桌上。'));
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

  async function handleScratch(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const key = `aff.scratch.ticket.v1:${encodeURIComponent(id)}`; const op = String(args[0] || '帮助').toLowerCase();
    if (['双色球', 'lottery'].indexOf(op) >= 0) return handleLottery(ctx, msg, args.slice(1));
    if (['生死骰', 'deathdice'].indexOf(op) >= 0) return handleDeathDice(ctx, msg, args.slice(1));
    if (['借款', 'loan'].indexOf(op) >= 0) return handleLoan(ctx, msg, args.slice(1));
    if (['买', '购买', 'buy'].indexOf(op) >= 0) {
      const old = jsonGet(key, null); if (old) return replyView(ctx, msg, scratchView(old, false, '请先刮开手中的票。'));
      const denom = int(args[1], 10); if (SCRATCH_DENOMS.indexOf(denom) < 0) return replyView(ctx, msg, { kind: 'scratch', title: '刮刮乐面额无效', lines: [`可选面额：${SCRATCH_DENOMS.join(' / ')}`, `类型：${SCRATCH_TYPES.join(' / ')}`], quote: '' });
      const type = SCRATCH_TYPES.indexOf(args[2]) >= 0 ? args[2] : pick(SCRATCH_TYPES); const p = loadProfile(id, name);
      if (!charge(p, denom)) return replyView(ctx, msg, { kind: 'scratch', title: '购买失败', lines: [`需要 ${denom} 游戏币`, `当前余额 ${p.coins}`], quote: template(ctx, '文案_余额不足', { name }) });
      const ticket = makeScratchTicket(id, denom, type); jsonSet(key, ticket); return replyView(ctx, msg, scratchView(ticket, false, profileQuote(ctx, p)));
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
      return replyView(ctx, msg, lotterySceneView('status', p, { status: expired ? `${expired}注彩票已超过兑奖期限。` : '开奖后请在下一次18:00前兑奖。' }));
    }
    if (['历史', '记录', 'history'].indexOf(op) >= 0) return replyView(ctx, msg, lotterySceneView('history', p));
    if (['兑奖', '领取', 'claim'].indexOf(op) >= 0) {
      const kept = []; const claimed = []; let totalPrize = 0;
      p.lottery.tickets.forEach((ticket) => {
        const draw = ensureLotteryDraw(ticket.issue, time);
        if (!draw) { kept.push(ticket); return; }
        const result = lotteryResult(ticket, draw); const row = lotteryHistoryRow(ticket, draw, 'claimed', time);
        claimed.push(lotteryTicketView(ticket, draw)); p.lottery.history.push(row); totalPrize += result.prize;
        if (result.prize > 0) { p.lottery.totalWins += 1; p.stats.scratch.lotteryWins += 1; }
        p.lottery.totalPrize += result.prize; p.stats.scratch.lotteryPrize += result.prize;
        p.stats.scratch.lotteryBestPrize = Math.max(p.stats.scratch.lotteryBestPrize, result.prize);
        p.stats.scratch.score += result.prize; p.stats.scratch.best = Math.max(p.stats.scratch.best, result.prize); p.stats.scratch.profit += result.prize;
      });
      p.lottery.tickets = kept; p.lottery.history = p.lottery.history.slice(-60); p.coins += totalPrize;
      const settlement = saveProfile(p);
      if (!claimed.length) return replyView(ctx, msg, lotterySceneView('status', p, { status: p.lottery.tickets.length ? '当前彩票仍在等待开奖。' : '当前没有可兑奖的彩票。' }));
      let status = `已核验${claimed.length}注，奖金合计${totalPrize}游戏币。`;
      if (settlement.count) status += ` 自动归还${settlement.count}笔借款，共${settlement.repaid}币。`;
      const quote = totalPrize > 0 ? template(ctx, '文案_双色球中奖', { name, tier: claimed.length === 1 ? claimed[0].tier : `${claimed.length}注彩票`, prize: totalPrize }) : template(ctx, '文案_双色球未中', { name });
      return replyView(ctx, msg, lotterySceneView('result', p, { tickets: claimed, totalPrize, status, quote }));
    }

    let tokens = args.slice();
    if (['买', '购买', 'buy'].indexOf(op) >= 0) tokens = args.slice(1);
    if (['随机', '机选', 'random'].indexOf(op) >= 0) {
      const reds = shuffle(Array.from({ length: 15 }, (_, index) => index + 1)).slice(0, 5).sort((a, b) => a - b);
      tokens = reds.concat([1 + Math.floor(Math.random() * 4)]).map(String);
    }
    tokens = tokens.filter((value) => ['+', '蓝', '蓝球'].indexOf(String(value)) < 0);
    if (!tokens.length || ['帮助', 'help', '菜单'].indexOf(op) >= 0) return replyView(ctx, msg, lotterySceneView('menu', p));
    if (tokens.length !== 6 || tokens.some((value) => !/^\d+$/.test(String(value)))) {
      return replyView(ctx, msg, lotterySceneView('menu', p, { status: '需要依次输入5个红球和1个蓝球。', quote: '示例：.双色球 1 2 3 4 5 1' }));
    }
    const red = tokens.slice(0, 5).map((value) => int(value, 0)).sort((a, b) => a - b); const blue = int(tokens[5], 0);
    if (red.some((value) => value < 1 || value > 15) || new Set(red).size !== 5 || blue < 1 || blue > 4) {
      return replyView(ctx, msg, lotterySceneView('menu', p, { status: '红球必须是1-15内的5个不重复号码，蓝球必须是1-4。' }));
    }
    const issue = nextLotteryIssue(time); const issueCount = p.lottery.tickets.filter((ticket) => ticket.issue === issue).length;
    if (issueCount >= 20) return replyView(ctx, msg, lotterySceneView('status', p, { issue, status: '单期最多保留20注彩票，请等待开奖。' }));
    const price = clamp(seal.ext.getIntConfig(ext, '双色球单注价格'), 1, 10000);
    if (!charge(p, price)) return replyView(ctx, msg, lotterySceneView('menu', p, { issue, status: `购买失败：需要${price}游戏币，当前余额${p.coins}。`, quote: template(ctx, '文案_余额不足', { name }) }));
    const ticket = { id: `${String(time)}-${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`, issue, red, blue, cost: price, boughtAt: time };
    p.lottery.tickets.push(ticket); p.lottery.totalTickets += 1; p.stats.scratch.lotteryTickets += 1; p.stats.scratch.lotterySpent += price; p.stats.scratch.profit -= price; saveProfile(p);
    return replyView(ctx, msg, lotterySceneView('ticket', p, { issue, ticket, status: '购买成功。', quote: `${name}的号码已封存，开奖不会主动通知。` }));
  }

  async function handleDeathDice(ctx, msg, args) {
    const id = uid(ctx, msg); const name = uname(ctx, msg); const p = loadProfile(id, name); const op = String(args[0] || '帮助').toLowerCase();
    let difficulty = '';
    if (['简单', '普通', 'easy'].indexOf(op) >= 0) difficulty = '简单';
    else if (['困难', 'hard'].indexOf(op) >= 0) difficulty = '困难';
    if (!difficulty) return replyView(ctx, msg, deathDiceView('menu', '简单', null, p));
    if (p.coins <= 0) return replyView(ctx, msg, deathDiceView('menu', difficulty, null, p, null));
    const stake = p.coins; const roll = 1 + Math.floor(Math.random() * 6); const survived = difficulty === '困难' ? roll === 1 : roll !== 6;
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
    const coins = clamp(seal.ext.getIntConfig(ext, '每日签到游戏币'), 0, 1000000); const delta = clamp(seal.ext.getIntConfig(ext, '每日签到好感'), -1000, 1000);
    if (p.lastSign === today) return replyView(ctx, msg, {
      kind: 'daily', title: '每日签到 · 今日已领取', subtitle: today,
      dailyScene: { status: 'already', name, date: today, coinsReward: coins, affectionReward: delta, coins: p.coins, affection: p.affection, relation: relation(p.affection).name, relationProgress: relationProgress(p) },
      lines: [`${name} 今日已经领取签到补给`, `当前 ${p.coins} 游戏币  |  ${p.affection}好感 [${relation(p.affection).name}]`], quote: profileQuote(ctx, p)
    });
    p.lastSign = today; p.coins += coins; changeAffection(p, delta);
    return replyView(ctx, msg, {
      kind: 'daily', title: '每日签到 · 补给到账', subtitle: today,
      dailyScene: { status: 'claimed', name, date: today, coinsReward: coins, affectionReward: delta, coins: p.coins, affection: p.affection, relation: relation(p.affection).name, relationProgress: relationProgress(p) },
      lines: [`游戏币 +${coins}`, `好感 ${signedValue(delta)}`, `当前余额 ${p.coins}  |  好感 ${p.affection}`], quote: template(ctx, '文案_签到', { name, coins, delta, affection: p.affection, relation: relation(p.affection).name })
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
      '.改名 <新名字>  |  .我的 [项目]  |  .统计 [项目]',
      '.签到  |  .投喂 [食物]  |  .我的',
      '.德州 人机/开房/下一手  |  整场入场150，盲注25/50',
      '.德州 教程 [页码]  |  完整流程与牌型',
      '.21点 开始  |  入场100，RE7王牌规则',
      '.21点 教程 [页码]  |  流程与全部王牌',
      '.神抽 人机/开房  |  .神抽 教程 [页码]',
      '.快艇 人机/开房  |  .快艇 教程 [页码]',
      '.爱赢一切 人机/开房  |  .爱赢一切 教程 [页码]',
      '.刮刮 买 [面额] [类型]  |  .刮刮 刮开',
      '.双色球 [5红+1蓝]  |  每日18:00开奖，兑奖期限1天',
      '.生死骰 简单/困难  |  押上全部游戏币，不计好感',
      '.借款 申请  |  余额低于150可借，到手150应还195',
      '.钓鱼 小鱼塘/江水/大海  |  .钓鱼 继续/收杆',
      '.竞拍 人机/开房 [场地]  |  .竞拍 场地',
      '.竞拍 出价 [金额]  |  单机自动确认，多人确认/撤回',
      '.竞拍 教程 [页码]  |  .竞拍 图鉴',
      '.排行 [综合/好感/金币/德州/21点/神抽/快艇/爱赢一切/钓鱼/竞拍]',
      '以上指令也都支持“.yan 子指令”写法。'
    ], quote: '所有对局结果都会进入统一档案与排行榜。' };
  }

  const DIRECT_SECTIONS = {
    '注册': '注册', '改名': '改名', '我的': '我的', '档案': '档案', '状态': '状态', '好感': '我的', '统计': '统计',
    '签到': '签到', '投喂': '投喂', '德州': '德州', 'texas': '德州', '21点': '21点', '二十一点': '21点',
    '神抽': '神抽', '亡命神抽': '神抽', '快艇': '快艇', '快艇骰': '快艇', 'farkle': '快艇',
    '爱赢一切': '爱赢一切', '爱赢': '爱赢一切', 'love': '爱赢一切',
    '刮刮': '刮刮', '刮刮乐': '刮刮', '钓鱼': '钓鱼', '竞拍': '竞拍', '竞拍之王': '竞拍',
    '双色球': '双色球', '生死骰': '生死骰', '借款': '借款',
    '排行': '排行', '排行榜': '排行', '好感榜': '排行'
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
      const args = []; for (let i = offset; i < offset + 12; i++) { const v = cmdArgs.getArgN(i); if (!v) break; args.push(v); }
      const currentProfile = loadProfile(uid(ctx, msg));
      if (section === '注册') await handleRegister(ctx, msg, args, currentProfile);
      else if (!currentProfile.registered || !currentProfile.name) await replyView(ctx, msg, registrationView());
      else if (section === '改名') await handleRename(ctx, msg, args, currentProfile);
      else if (section === '德州') await handlePoker(ctx, msg, args);
      else if (section === '21点' || section === '二十一点') await handleBlackjack(ctx, msg, args);
      else if (section === '神抽' || section === '亡命神抽') await handleDmd(ctx, msg, args, cmdArgs);
      else if (section === '快艇' || section === '快艇骰' || section.toLowerCase() === 'farkle') await handleFarkle(ctx, msg, args);
      else if (section === '爱赢一切' || section === '爱赢' || section.toLowerCase() === 'love') await handleLove(ctx, msg, args);
      else if (section === '刮刮' || section === '刮刮乐') await handleScratch(ctx, msg, args);
      else if (section === '双色球') await handleLottery(ctx, msg, args);
      else if (section === '生死骰') await handleDeathDice(ctx, msg, args);
      else if (section === '借款') await handleLoan(ctx, msg, args);
      else if (section === '钓鱼') await handleFishing(ctx, msg, args);
      else if (section === '竞拍' || section === '竞拍之王') await handleAuction(ctx, msg, args);
      else if (section === '签到') await handleSign(ctx, msg);
      else if (section === '投喂') await handleFeed(ctx, msg, args);
      else if (section === '排行' || section === '排行榜') await replyView(ctx, msg, leaderboardView(args[0] || '综合'));
      else if (section === '统计') {
        const p = loadProfile(uid(ctx, msg)); saveProfile(p); await replyView(ctx, msg, gameStatsView(ctx, p, args[0] || ''));
      }
      else if (section === '我的' || section === '档案' || section === '状态') {
        const p = loadProfile(uid(ctx, msg)); saveProfile(p);
        await replyView(ctx, msg, args[0] ? gameStatsView(ctx, p, args[0]) : profileView(p, profileQuote(ctx, p)));
      } else await replyView(ctx, msg, helpView());
    } catch (e) {
      console.error(`${EXT_NAME}: command failed`, e);
      seal.replyToSender(ctx, msg, `小游戏执行失败：${e && e.message ? e.message : e}`);
    }
    return seal.ext.newCmdExecuteResult(true);
  };

  ext.cmdMap.yan = cmd;
  Object.keys(DIRECT_SECTIONS).forEach((name) => { ext.cmdMap[name] = cmd; });
  if (typeof seal.ext.registerTask === 'function') {
    seal.ext.registerTask(ext, 'daily', '18:00', () => {
      try { ensureLotteryDraw(dateKey(), nowMs()); } catch (e) { console.error(`${EXT_NAME}: lottery draw task failed`, e); }
    }, 'affection-lottery-daily-draw', '每日18:00静默生成双色球开奖号码，不主动发送消息。');
  }
})();
