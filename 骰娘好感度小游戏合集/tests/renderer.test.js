'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let canvasApi;
try { canvasApi = require('../renderer/node_modules/@napi-rs/canvas'); }
catch (error) { canvasApi = require('../renderer/node_modules/canvas'); }
const { createCanvas, loadImage } = canvasApi;
const { renderView, normalizeView, server } = require('../renderer/server');

test('德州四种花色使用矢量路径而非服务器字体', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'server.js'), 'utf8');
  assert.match(source, /function drawPlayingCardSuit\(/);
  assert.doesNotMatch(source, /[♠♥♦♣]/);
});

test('斗地主叫地主阶段隐藏底牌，明牌选择阶段才下发底牌', () => {
  const bidding = normalizeView({ kind: 'landlord', title: '斗地主', landlordTable: { status: 'bidding', bottom: [{ rank: '3', suit: '♠' }, { rank: 'A', suit: '♥' }] } });
  assert.deepEqual(bidding.landlordTable.bottom, []);
  const reveal = normalizeView({ kind: 'landlord', title: '斗地主', landlordTable: { status: 'landlordReveal', bottom: [{ rank: '3', suit: '♠' }, { rank: 'A', suit: '♥' }] } });
  assert.equal(reveal.landlordTable.bottom.length, 2);
});

test('四人斗地主图片座位按数组正序逆时针排列', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'server.js'), 'utf8');
  assert.match(source, /players\.length === 4 \? \[\[95, 205\], \[95, 565\], \[775, 565\], \[775, 205\]\]/);
});

test('爱牌使用矢量指尖爱心而不依赖服务器Emoji字体', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'server.js'), 'utf8');
  const iconBlock = source.slice(source.indexOf('function drawLoveFingerHeart('), source.indexOf('function drawLoveCard('));
  const cardBlock = source.slice(source.indexOf('function drawLoveCard('), source.indexOf('function drawLoveSeat('));
  assert.match(source, /function drawLoveFingerHeart\(/);
  assert.match(iconBlock, /ctx\.translate\(-7, -7\)/);
  assert.match(cardBlock, /card\.type === 'L'/);
  assert.match(cardBlock, /drawLoveFingerHeart\(/);
});

test('恶魔轮盘场景保留模式结算倍率并可用于图片绘制', async () => {
  const view = normalizeView({
    kind: 'demon', title: '恶魔轮盘赌', subtitle: '倍率测试',
    demonScene: { mode: 'playing', modeKey: '金币', modeMultiplier: 1.4, round: 2, turn: '测试员', shellCount: 3, shellLive: 1, shellBlank: 2, players: [], logs: [] }
  });
  assert.equal(view.demonScene.modeMultiplier, 1.4);
  const png = await renderView({ kind: 'demon', title: '恶魔轮盘赌', subtitle: '倍率测试', demonScene: { mode: 'menu', menuTab: 'modes', modes: [{ name: '欧皇', hp: [6, 6], desc: '主要依靠运气。', multiplier: 0.25 }] } });
  assert.ok(png.length > 50_000);
});

test('渲染器生成1200x900非空PNG并保留预览', async () => {
  const png = await renderView({
    kind: 'leaderboard',
    title: '亡命神抽排行榜',
    subtitle: '项目分、胜负与好感变化',
    lines: [
      '#1 测试员  725好感  1280币  总胜场12',
      '#2 夜航  640好感  930币  总胜场8',
      '#3 白昼  430好感  1620币  总胜场5',
      '德州扑克：4局 3胜 最高260',
      '亡命神抽：3局 2胜 大满贯1',
      'Farkle快艇骰：5局 3胜 最高5200'
    ],
    rankings: Array.from({ length: 10 }, (_, index) => ({
      rank: index + 1,
      name: ['测试员', '夜航', '白昼', '小七', '墨墨', '青禾', '晚星', '长风', '南枝', '拾光'][index],
      primary: `${725 - index * 47} 项目分`,
      secondary: `最高${700 - index * 20} · 收益${260 - index * 35} · 好感净+${10 + index}`,
      ratio: 1 - index * 0.09,
      details: [
        { label: '局', value: 12 - index, tone: 'neutral' },
        { label: '胜', value: 8 - Math.floor(index / 2), tone: 'positive' },
        { label: '负', value: 4 + index, tone: 'negative' },
        { label: '好感+', value: 20 + index, tone: 'positive' },
        { label: '好感-', value: 10 + index, tone: 'negative' }
      ]
    })),
    quote: ''
  });
  assert.ok(png.length > 50_000);
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  const image = await loadImage(png);
  assert.equal(image.width, 1200);
  assert.equal(image.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'render-preview.png'), png);
});

test('赌场、骰子和钓鱼三类背景均可渲染', async () => {
  const outputs = [];
  for (const kind of ['poker', 'profile', 'fishing']) {
    const png = await renderView({
      kind, title: `${kind} test`,
      meters: [{ label: '状态进度', value: 35, min: 0, max: 100, text: '35/100' }],
      lines: ['state line'], quote: 'quote'
    });
    assert.ok(png.length > 50_000);
    outputs.push(png);
  }
  assert.notDeepEqual(outputs[0], outputs[1]);
  assert.notDeepEqual(outputs[1], outputs[2]);
});

test('档案彩色模块和详细数据块可渲染并保留预览', async () => {
  const modules = ['德州扑克', '生化危机21点', '亡命神抽', '刮刮乐', 'Farkle快艇骰', '钓鱼'].map((name, index) => ({
    key: index === 0 ? 'poker' : `game${index}`, name, plays: 12 + index, wins: 7, losses: 4, draws: 1,
    best: 500 + index * 100, profit: index % 2 ? -120 : 260,
    affection: index % 2 ? -15 : 25, affectionGained: 35 + index, affectionLost: 10 + index,
    bestPokerHand: index === 0 ? '同花顺' : ''
  }));
  const png = await renderView({
    kind: 'profile', title: '骰娘好感档案', subtitle: '测试员 · 信赖 · 分模块统计',
    meters: [
      { label: '关系 · 信赖', value: 986, min: 700, max: 1500, text: '986好感 · 下级1500' },
      { label: '游戏币储备', value: 1350, min: 0, max: 2000, text: '1350币 · 富足线2000' }
    ],
    modules, lines: ['文字回退仍然保留'], quote: '骰娘已经认真整理好每一项记录。'
  });
  assert.ok(png.length > 50_000);
  const image = await loadImage(png);
  assert.equal(image.width, 1200);
  assert.equal(image.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'profile-preview.png'), png);

  const detailPng = await renderView({
    kind: 'stats', title: '亡命神抽 · 详细统计', subtitle: '测试员的项目档案',
    tiles: [
      { label: '总局数', value: '18', tone: 'accent' }, { label: '胜 / 负 / 平', value: '9 / 8 / 1', tone: 'neutral' },
      { label: '胜率', value: '50%', tone: 'positive' }, { label: '历史最高', value: '860', tone: 'accent' },
      { label: '累计项目分', value: '7250', tone: 'neutral' }, { label: '游戏币净收益', value: '-1800', tone: 'negative' },
      { label: '累计获得好感', value: '+105', tone: 'positive' }, { label: '累计失去好感', value: '-80', tone: 'negative' },
      { label: '好感净变化', value: '+25', tone: 'positive' }, { label: '大满贯', value: '1', tone: 'accent' }
    ],
    lines: ['文字回退仍然保留'], quote: '每一次收获和代价都已经分开记录。'
  });
  assert.ok(detailPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'stats-preview.png'), detailPng);
});

test('每日签到与礼物架、赠礼结果使用专用场景渲染', async () => {
  const dailyInput = {
    kind: 'daily', title: '每日签到 · 补给到账', subtitle: '2026-07-26', quote: '“今天也来了呀。” 骰娘递给礼物测试员一份日常补给。',
    dailyScene: { status: 'claimed', name: '礼物测试员', date: '2026-07-26', tier: 'best', tierName: '最好的待遇', coinsReward: 268, affectionReward: 23, coins: 1280, affection: 386, relation: '亲近', relationProgress: 0.215 }
  };
  const normalizedDaily = normalizeView(dailyInput);
  assert.equal(normalizedDaily.dailyScene.status, 'claimed');
  assert.equal(normalizedDaily.dailyScene.tier, 'best');
  assert.equal(normalizedDaily.dailyScene.tierName, '最好的待遇');
  assert.equal(normalizedDaily.dailyScene.relationProgress, 0.215);
  const dailyPng = await renderView(dailyInput);
  assert.ok(dailyPng.length > 50_000);
  let image = await loadImage(dailyPng); assert.equal(image.width, 1200); assert.equal(image.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'daily-preview.png'), dailyPng);

  const gifts = [
    ['甜食', ['蛋糕', '星光糖', '巧克力', '布丁']], ['零食', ['饼干', '薯片', '海苔脆片', '坚果礼盒']],
    ['饮品', ['牛奶', '奶茶', '热可可', '果汁']], ['餐点', ['豪华便当', '三明治', '拉面', '寿司拼盘']],
    ['生活用品', ['保温杯', '毛巾', '香薰', '雨伞']], ['家具', ['台灯', '书架', '懒人沙发', '床头柜']]
  ].flatMap(([category, names], categoryIndex) => names.map((name, index) => ({
    name, category, cost: 30 + categoryIndex * 120 + index * 35, affection: 2 + categoryIndex * 10 + index * 3
  })));
  const menuInput = {
    kind: 'gift', title: '骰娘的礼物架', subtitle: '发送 .投喂 <礼物名> 赠送礼物', quote: '不同分类与关系阶段可以分别配置骰娘的回应。',
    giftScene: { mode: 'menu', name: '礼物测试员', coins: 1280, affection: 386, relation: '亲近', relationProgress: 0.215, gifts }
  };
  const normalizedMenu = normalizeView(menuInput);
  assert.equal(normalizedMenu.giftScene.gifts.length, 24);
  const menuPng = await renderView(menuInput);
  assert.ok(menuPng.length > 50_000);
  image = await loadImage(menuPng); assert.equal(image.width, 1200); assert.equal(image.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'gift-menu-preview.png'), menuPng);

  const resultInput = {
    kind: 'gift', title: '赠礼 · 懒人沙发', subtitle: '家具 · 已送达', quote: '骰娘和礼物测试员一起为懒人沙发挑好了位置，房间里又多了一处共同的痕迹。',
    giftScene: { mode: 'result', name: '礼物测试员', item: '懒人沙发', category: '家具', cost: 900, affectionGain: 72, coins: 380, affection: 458, relation: '亲近', relationProgress: 0.395, gifts: [] }
  };
  const resultPng = await renderView(resultInput);
  assert.ok(resultPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'gift-result-preview.png'), resultPng);

  const insufficientPng = await renderView({
    ...resultInput, title: '赠礼 · 游戏币不足', subtitle: '家具 · 床头柜', quote: '骰娘轻轻敲了敲空空的钱袋：“游戏币不够哦。”',
    giftScene: { ...resultInput.giftScene, mode: 'insufficient', item: '床头柜', cost: 1200, coins: 80 }
  });
  assert.ok(insufficientPng.length > 50_000);
});

test('渲染输入会规范化进度条与排行榜结构', () => {
  const view = normalizeView({
    meters: [{ label: '好感', value: '50', min: 0, max: 100 }],
    rankings: [{ rank: 1, name: '玩家', primary: '50好感', secondary: '500币', ratio: 3, details: [{ label: '胜', value: 2, tone: 'positive' }] }],
    modules: [{ key: 'poker', name: '德州扑克', plays: 3, affectionGained: 5, affectionLost: 10, bestPokerHand: '葫芦' }],
    tiles: [{ label: '累计获得好感', value: '+5', tone: 'positive' }]
  });
  assert.deepEqual(view.meters[0], { label: '好感', text: '', value: 50, min: 0, max: 100 });
  assert.equal(view.rankings[0].ratio, 1);
  assert.equal(view.rankings[0].name, '玩家');
  assert.equal(view.rankings[0].details[0].tone, 'positive');
  assert.equal(view.modules[0].affectionLost, 10);
  assert.equal(view.modules[0].bestPokerHand, '葫芦');
  assert.equal(view.tiles[0].value, '+5');
});

test('德州完整赌桌、21点面对面牌桌与回合结算面板、图片教程可渲染', async () => {
  const pokerPng = await renderView({
    kind: 'poker', title: '德州扑克淘汰赛', subtitle: '整场仅入场一次150 · 底池与每个座位下注独立显示', quote: '当前行动者的座位边框已经高亮。',
    pokerTable: {
      status: 'playing', handNo: 3, stage: '第3手 · 翻牌', pot: 425, currentBet: 100,
      board: [
        { rank: 'A', suit: 'S' }, { rank: '10', suit: 'H' }, { rank: '7', suit: 'D' }, null, null
      ],
      seats: [
        { name: '测试员', stack: 50, roundBet: 100, totalBet: 100, status: '在局', isTurn: true, isDealer: true, cards: [{ rank: 'A', suit: 'H' }, { rank: 'K', suit: 'H' }] },
        { name: '姜修泽', stack: 100, roundBet: 50, totalBet: 50, status: '在局', isGuest: true, cards: [{ hidden: true }, { hidden: true }] },
        { name: '葛明治', stack: 0, roundBet: 150, totalBet: 150, status: '全押', cards: [{ hidden: true }, { hidden: true }] },
        { name: '阿日', stack: 125, roundBet: 25, totalBet: 25, status: '在局', cards: [{ hidden: true }, { hidden: true }] },
        { name: '严茫熙', stack: 150, roundBet: 0, totalBet: 0, status: '弃牌', cards: [{ hidden: true }, { hidden: true }] },
        { name: '亨德森', stack: 100, roundBet: 100, totalBet: 100, status: '在局', cards: [{ hidden: true }, { hidden: true }] }
      ],
      lastAction: '测试员加注到100，等待下一位玩家行动。'
    }
  });
  assert.ok(pokerPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'poker-table-preview.png'), pokerPng);

  const pokerHandResultView = {
    kind: 'poker', title: '德州扑克淘汰赛', subtitle: '单手结束 · 保留筹码继续淘汰赛', quote: '本手没有结算整场战绩，也不会再次扣费。',
    pokerTable: {
      status: 'between_hands', handNo: 3, stage: '第3手 · 单手结算', pot: 0, currentBet: 0,
      board: [{ rank: 'A', suit: 'S' }, { rank: '10', suit: 'H' }, { rank: '7', suit: 'D' }, { rank: '4', suit: 'C' }, { rank: '2', suit: 'S' }],
      seats: [
        { name: '测试员', stack: 250, roundBet: 0, totalBet: 100, status: '晋级', isDealer: true, cards: [{ rank: 'A', suit: 'H' }, { rank: 'K', suit: 'H' }] },
        { name: '姜修泽', stack: 150, roundBet: 0, totalBet: 50, status: '晋级', isBot: true, cards: [{ rank: 'Q', suit: 'C' }, { rank: 'Q', suit: 'D' }] },
        { name: '阿日', stack: 0, roundBet: 0, totalBet: 150, status: '已淘汰', isBot: true, cards: [{ rank: '8', suit: 'C' }, { rank: '8', suit: 'D' }] }
      ],
      lastAction: '第3手结束，阿日筹码归零，仍有2人持有筹码。',
      nextAction: '发送“.德州 下一手”继续发牌，不会再次扣除入场费。'
    }
  };
  const normalizedPokerHandResult = normalizeView(pokerHandResultView);
  assert.equal(normalizedPokerHandResult.pokerTable.status, 'between_hands');
  assert.equal(normalizedPokerHandResult.pokerTable.handNo, 3);
  assert.match(normalizedPokerHandResult.pokerTable.nextAction, /下一手/);
  const pokerHandResultPng = await renderView(pokerHandResultView);
  assert.ok(pokerHandResultPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'poker-hand-result-preview.png'), pokerHandResultPng);

  const pokerResultView = {
    kind: 'poker', title: '德州扑克淘汰赛', subtitle: '整场结算 · 最后一名有筹码者获得冠军', quote: '整场战绩、好感与游戏币回报现已写入档案。',
    pokerTable: {
      status: 'finished', handNo: 7, stage: '第7手 · 整场结算', pot: 0, currentBet: 0,
      board: [{ rank: 'A', suit: 'S' }, { rank: '10', suit: 'H' }, { rank: '7', suit: 'D' }, { rank: '4', suit: 'C' }, { rank: '2', suit: 'S' }],
      seats: [
        { name: '测试员', stack: 300, roundBet: 0, totalBet: 150, status: '冠军', isDealer: true, cards: [{ rank: 'A', suit: 'H' }, { rank: 'K', suit: 'H' }] },
        { name: '姜修泽', stack: 0, roundBet: 0, totalBet: 150, status: '已淘汰', isBot: true, cards: [{ rank: 'Q', suit: 'C' }, { rank: 'Q', suit: 'D' }] }
      ],
      lastAction: '测试员成为最后一名仍有筹码的玩家，获得300游戏币回报。',
      nextAction: '发送“.德州 下一局”重新支付150并开始新一场淘汰赛。'
    }
  };
  const normalizedPokerResult = normalizeView(pokerResultView);
  assert.equal(normalizedPokerResult.pokerTable.status, 'finished');
  assert.match(normalizedPokerResult.pokerTable.nextAction, /下一局/);
  const pokerResultPng = await renderView(pokerResultView);
  assert.ok(pokerResultPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'poker-result-preview.png'), pokerResultPng);

  const blackjackPng = await renderView({
    kind: 'blackjack', title: '生化危机7 · 21点', subtitle: '连续停牌后结算 · 王牌可连续使用', quote: '爆牌不会立即结算，当前仍可连续使用王牌修正牌面。',
    blackjackTable: {
      round: 3, target: 24, turn: 'player',
      enemy: { name: '骰娘', hp: 4, maxHp: 5, sum: null, hand: [{ value: 9, hidden: true }, { value: 7 }], trumpCount: 3, status: '等待' },
      player: { name: '测试员', hp: 3, maxHp: 5, sum: 25, hand: [{ value: 11 }, { value: 8 }, { value: 6 }], trumps: ['退回', '交换', '护盾+', '完美抽牌', '挑战27点'], trumpCount: 5, busted: true, status: '爆牌 · 可出王牌或停牌' },
      buffs: [{ name: '护盾+', side: 'player' }, { name: '增加二', side: 'enemy' }, { name: '挑战24点', side: 'player' }],
      lastAction: '测试员抽到6，爆牌！但回合尚未结算。'
    }
  });
  assert.ok(blackjackPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'blackjack-table-preview.png'), blackjackPng);

  const blackjackResultView = {
    kind: 'blackjack', title: '生化危机7 · 21点', subtitle: '结算牌面保留 · 抽牌开启下一回合', quote: '双方停牌后的最终牌面已保留；看清结算后再开启下一回合。',
    blackjackTable: {
      round: 3, target: 21, turn: 'player', phase: 'round_result',
      enemy: { name: '骰娘', hp: 3, maxHp: 5, sum: 17, hand: [{ value: 8 }, { value: 9 }], trumpCount: 2, stand: true, status: '已停牌 · 回合结算' },
      player: { name: '测试员', hp: 4, maxHp: 5, sum: 20, hand: [{ value: 10 }, { value: 10 }], trumps: ['护盾', '退回'], trumpCount: 2, stand: true, status: '已停牌 · 回合结算' },
      buffs: [{ name: '护盾', side: 'player' }, { name: '增加一', side: 'enemy' }],
      roundResult: { playerSum: 20, enemySum: 17, tie: false, winnerName: '测试员', loserName: '骰娘', damage: 1, nextStarter: 'enemy', nextStarterName: '骰娘', matchFinished: false },
      recentActions: ['骰娘 使用王牌：退回、护盾', '骰娘 停牌。'],
      lastAction: '双方最终牌面已保留；确认结算后发送“.yan 21点 抽牌”开启下一回合。'
    }
  };
  const normalizedResult = normalizeView(blackjackResultView);
  assert.equal(normalizedResult.blackjackTable.phase, 'round_result');
  assert.equal(normalizedResult.blackjackTable.roundResult.playerSum, 20);
  assert.equal(normalizedResult.blackjackTable.roundResult.damage, 1);
  assert.equal(normalizedResult.blackjackTable.roundResult.nextStarter, 'enemy');
  assert.equal(normalizedResult.blackjackTable.roundResult.nextStarterName, '骰娘');
  assert.deepEqual(normalizedResult.blackjackTable.recentActions, ['骰娘 使用王牌：退回、护盾', '骰娘 停牌。']);
  const blackjackResultPng = await renderView(blackjackResultView);
  assert.ok(blackjackResultPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'blackjack-result-preview.png'), blackjackResultPng);

  const tutorialPng = await renderView({
    kind: 'blackjack', title: '生化危机7 · 21点教程', subtitle: '第 2/5 页 · 即时与持续王牌', quote: '标记为敌方专属的王牌不会进入玩家卡池。',
    tutorial: {
      page: 2, total: 5,
      entries: Array.from({ length: 10 }, (_, index) => ({
        title: ['数字1-11', '数字1-11+', '退回', '撤除', '交换', '护盾', '护盾+', '破坏', '破坏+', '破坏++'][index],
        description: ['抽出指定数字，不在牌组时不会生效。', '抽出指定数字并获得一张王牌。', '退回自己上一张明牌。', '退回对手上一张明牌。', '交换双方上一张明牌。', '自己的赌注减少1。', '自己的赌注减少2。', '撤除对手上一张场上王牌。', '撤除对手所有场上王牌。', '清场并禁止对手使用王牌。'][index],
        tag: index < 5 ? '即时' : '持续'
      }))
    }
  });
  assert.ok(tutorialPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'blackjack-tutorial-preview.png'), tutorialPng);
});

test('刮刮乐彩票涂层与揭晓票面可渲染', async () => {
  const coveredPng = await renderView({
    kind: 'scratch', title: '骰娘刮刮乐', subtitle: '四种票面 · 单票奖金硬上限100倍', quote: '涂层下已经封存本票结果。',
    scratchTicket: {
      denom: 50, type: '幸运数字', revealed: false, maxPrize: 5000, prize: 0, multiplier: 0, lucky: null, serial: '57240158',
      cells: Array.from({ length: 9 }, () => ({ symbol: '', value: 0, winning: false }))
    }
  });
  assert.ok(coveredPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'scratch-ticket-covered-preview.png'), coveredPng);

  const revealedPng = await renderView({
    kind: 'scratch', title: '骰娘刮刮乐', subtitle: '四种票面 · 单票奖金硬上限100倍', quote: '幸运数字命中，奖金已经进入统一钱包。',
    scratchTicket: {
      denom: 50, type: '幸运数字', revealed: true, maxPrize: 5000, prize: 500, multiplier: 10, lucky: 8, serial: '57240158',
      cells: [
        { symbol: '3' }, { symbol: '12' }, { symbol: '17' }, { symbol: '6' }, { symbol: '8', value: 500, winning: true },
        { symbol: '14' }, { symbol: '1' }, { symbol: '19' }, { symbol: '10' }
      ]
    }
  });
  assert.ok(revealedPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'scratch-ticket-revealed-preview.png'), revealedPng);

  const lossPng = await renderView({
    kind: 'scratch', title: '骰娘刮刮乐', subtitle: '四种票面 · 单票奖金硬上限100倍', quote: '这张票没有中奖，好感 -4。',
    scratchTicket: {
      denom: 100, type: '金库钥匙', revealed: true, maxPrize: 10000, prize: 0, multiplier: 0, affectionDelta: -4, serial: '57240160',
      cells: Array.from({ length: 6 }, (_, index) => ({ symbol: ['铜钥匙', '银钥匙'][index % 2], value: 0, winning: false }))
    }
  });
  assert.ok(lossPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'scratch-ticket-loss-preview.png'), lossPng);

  const variants = [
    { type: '三同符号', cells: Array.from({ length: 9 }, (_, index) => ({ symbol: ['星', '月', '花'][index % 3] })) },
    { type: '金库钥匙', cells: Array.from({ length: 6 }, (_, index) => ({ symbol: ['铜钥匙', '银钥匙', '金钥匙'][index % 3] })) },
    { type: '倍率寻宝', cells: [{ symbol: '奖50', value: 50 }, { symbol: '倍2', value: 2 }, { symbol: '宝藏', value: 100, winning: true }] }
  ];
  for (const variant of variants) {
    const png = await renderView({
      kind: 'scratch', title: '骰娘刮刮乐', quote: '票面布局检查',
      scratchTicket: { denom: 100, type: variant.type, revealed: true, maxPrize: 10000, prize: 100, multiplier: 1, serial: '57240159', cells: variant.cells }
    });
    assert.ok(png.length > 50_000, `${variant.type}应生成完整彩票图`);
  }
});

test('双色球、生死骰与借款专用票面均可渲染', async () => {
  const lotteryPng = await renderView({
    kind: 'scratch', title: 'YAN 双色球', subtitle: '每日18:00静默开奖 · 5红1蓝 · 不计算好感', quote: '一等奖已完成核验。',
    lotteryScene: {
      mode: 'result', issue: '2026-07-27', price: 10, status: '已核验14注，奖金合计9000游戏币。', totalPrize: 9000,
      page: 2, totalPages: 3, pageSize: 6, totalTickets: 14, totalRows: 6,
      selectedRed: [1, 2, 3, 4, 5], selectedBlue: 1, drawnRed: [1, 2, 3, 4, 5], drawnBlue: 1,
      tickets: Array.from({ length: 6 }, (_, index) => ({ id: `ticket-${index + 1}`, issue: '2026-07-27', red: [1, 2, 3, 4, 5], blue: 1, count: index === 0 ? 9 : 1, drawRed: [1, 2, 3, 4, 5], drawBlue: 1, redMatches: 5, blueMatch: true, tier: index === 0 ? '一等奖' : '未中奖', prize: index === 0 ? 9000 : 0 })),
      prizeTable: [{ label: '5红+蓝', tier: '一等奖', prize: 1000 }]
    }
  });
  assert.ok(lotteryPng.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'lottery-result-preview.png'), lotteryPng);

  const deathDicePng = await renderView({
    kind: 'scratch', title: '生死骰', subtitle: 'All In · 一掷定生死 · 不计算好感', quote: '骰子停在空白面。',
    deathDiceScene: { mode: 'result', difficulty: '简单', stake: 500, multiplier: 1.2, roll: 3, survived: true, payout: 600, balance: 600, faces: ['空白', '空白', '空白', '空白', '空白', '死亡'] }
  });
  assert.ok(deathDicePng.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'death-dice-preview.png'), deathDicePng);

  const loanPng = await renderView({
    kind: 'scratch', title: '骰娘借款处', subtitle: '九出十三归 · 到手150 · 每笔应还195', quote: '本次到账150游戏币，好感-30。',
    loanScene: { mode: 'borrowed', balance: 250, affection: 50, eligible: false, outstanding: 2, debt: 390, threshold: 345, nextPenalty: 40, borrowed: 150, affectionDelta: -30, totalBorrowed: 300, totalRepaid: 0, totalAffectionLost: 50, totalAffectionRestored: 0 }
  });
  assert.ok(loanPng.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'loan-preview.png'), loanPng);
});

test('视频扑克可渲染置顶赔率、单手换牌、五手结算、翻牌复活与独特统计', async () => {
  const paytable = [
    ['皇家同花顺', 600], ['同花顺', 37.5], ['四条', 18.75], ['葫芦', 6.75], ['同花', 4.5],
    ['顺子', 3], ['三条', 2.25], ['两对', 1.5], ['J或更好', 0.75]
  ].map(([label, multiplier]) => ({ label, multiplier }));
  const menuInput = {
    kind: 'videoPoker', title: 'YAN 视频扑克', subtitle: 'J或更好 · 10币机台', quote: '选择10、30或50游戏币机台开始。',
    videoPokerScene: {
      mode: 'menu', variant: 'J或更好', stake: 10, phase: 'menu', paytable, jackpot: 1358.7, balance: 860,
      help: ['.视频扑克 10 / 30 / 50', '.刮刮 扑克 10 / 30 / 50', '.视频扑克 统计'], stats: {}
    }
  };
  const normalizedMenu = normalizeView(menuInput); assert.equal(normalizedMenu.videoPokerScene.paytable.length, 9); assert.equal(normalizedMenu.videoPokerScene.jackpot, 1358.7);
  let png = await renderView(menuInput); assert.ok(png.length > 50_000); let image = await loadImage(png); assert.equal(image.width, 1200); assert.equal(image.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'video-poker-menu-preview.png'), png);

  const cards = [{ rank: 'J', suit: 'H' }, { rank: 'J', suit: 'D' }, { rank: '7', suit: 'S' }, { rank: '9', suit: 'C' }, { rank: 'A', suit: 'H' }];
  png = await renderView({
    ...menuInput, subtitle: 'J或更好 · 10币机台', quote: '保留J对子，换掉其余三张牌。',
    videoPokerScene: { ...menuInput.videoPokerScene, mode: 'deal', phase: 'deal', initialHand: cards, hand: cards, held: [true, true, false, false, false], help: ['.视频扑克 保留 1,2', '.视频扑克 换 3,4,5'] }
  });
  assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'video-poker-deal-preview.png'), png);

  const fiveHands = [
    cards, [{ rank: 'J', suit: 'H' }, { rank: 'J', suit: 'D' }, { rank: 'J', suit: 'C' }, { rank: '9', suit: 'C' }, { rank: 'A', suit: 'H' }],
    [{ rank: '10', suit: 'S' }, { rank: 'J', suit: 'S' }, { rank: 'Q', suit: 'S' }, { rank: 'K', suit: 'S' }, { rank: 'A', suit: 'S' }],
    [{ rank: '4', suit: 'H' }, { rank: '4', suit: 'D' }, { rank: '8', suit: 'S' }, { rank: '8', suit: 'C' }, { rank: 'A', suit: 'H' }],
    [{ rank: '3', suit: 'H' }, { rank: '5', suit: 'D' }, { rank: '7', suit: 'S' }, { rank: '9', suit: 'C' }, { rank: 'A', suit: 'H' }]
  ];
  const fiveInput = {
    ...menuInput, subtitle: '五手扑克 · 50币机台', quote: '五手已经同时完成结算。',
    videoPokerScene: {
      ...menuInput.videoPokerScene, mode: 'result', variant: '五手扑克', stake: 50, phase: 'complete', hands: fiveHands,
      handNames: ['J或更好', '三条', '皇家同花顺', '两对', '高牌'], handPayouts: [7.5, 22.5, 6000, 15, 0],
      totalPayout: 6045, finalPayout: 6045, help: ['.视频扑克 10 / 30 / 50', '.视频扑克 统计']
    }
  };
  const normalizedFive = normalizeView(fiveInput); assert.equal(normalizedFive.videoPokerScene.hands.length, 5); assert.equal(normalizedFive.videoPokerScene.handPayouts[0], 7.5);
  png = await renderView(fiveInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'video-poker-five-hand-preview.png'), png);

  const gambleInput = {
    ...menuInput, subtitle: 'J或更好 · 翻牌挑战', quote: '点数相同也算失败，可以额外支付游戏币复活。',
    videoPokerScene: {
      ...menuInput.videoPokerScene, mode: 'revive', phase: 'revive', previousCard: { rank: '8', suit: 'S' }, drawnCard: { rank: '8', suit: 'D' },
      guess: '比大', correct: false, pendingPrize: 82.5, streak: 6, reviveCost: 62, reviveRound: 7, reviveRate: 0.75,
      cashoutLocked: false, help: ['.视频扑克 复活', '.视频扑克 放弃']
    }
  };
  const normalizedGamble = normalizeView(gambleInput); assert.equal(normalizedGamble.videoPokerScene.reviveRound, 7); assert.equal(normalizedGamble.videoPokerScene.reviveRate, 0.75); assert.equal(normalizedGamble.videoPokerScene.cashoutLocked, false);
  png = await renderView(gambleInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'video-poker-high-low-preview.png'), png);

  const lockedPng = await renderView({
    ...gambleInput, subtitle: 'J或更好 · 复活锁定', quote: '再猜中一轮后才可恢复收下奖金。',
    videoPokerScene: {
      ...gambleInput.videoPokerScene, mode: 'gamble', phase: 'gamble', anchorCard: { rank: '8', suit: 'D' },
      previousCard: null, drawnCard: null, guess: '', correct: null, reviveCost: 0, cashoutLocked: true,
      help: ['.视频扑克 比大 / 比小', '.视频扑克 放弃']
    }
  });
  assert.ok(lockedPng.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'video-poker-revive-lock-preview.png'), lockedPng);

  const statsInput = {
    ...menuInput, subtitle: '专属统计 · 全机台汇总', quote: 'Jackpot与翻牌记录独立保存在刮刮栏目统计中。',
    videoPokerScene: {
      ...menuInput.videoPokerScene, mode: 'stats', phase: 'stats', stats: {
        plays: 86, hands: 174, handsWon: 61, wagered: 2780, won: 2465, profit: -315, bestPayout: 820,
        bestHand: '四张2', highLowWins: 38, bestStreak: 9, revives: 11, jackpots: 1, jackpotWon: 728
      }, help: ['.视频扑克 10 / 30 / 50', '.我的 刮刮']
    }
  };
  png = await renderView(statsInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'video-poker-stats-preview.png'), png);

  const scratchStatsInput = {
    kind: 'stats', title: '刮刮乐 · 详细统计', subtitle: '扑克员的项目档案', quote: '刮刮、彩票、风险游戏与视频扑克统一归入本栏目。',
    tiles: Array.from({ length: 15 }, (_, index) => ({
      label: ['总局数', '胜 / 负 / 平', '胜率', '历史最高', '累计项目分', '游戏币净收益', '累计获得好感', '累计失去好感', '好感净变化', '双色球 注 / 中', '双色球 奖金 / 最高', '生死骰 局 / 胜 / 净收益', '视频扑克 局 / 中奖手', '视频扑克 投入 / 实收', '视频扑克 最高 / 最佳牌型'][index],
      value: ['128', '42 / 79 / 7', '33%', '1000', '5680', '-315', '+4', '-21', '-17', '20 / 3', '1080 / 1000', '6 / 4 / +80', '86 / 61', '2780 / 2465', '820 / 四张2'][index],
      tone: index % 4 === 0 ? 'accent' : index % 4 === 1 ? 'neutral' : index % 4 === 2 ? 'positive' : 'negative'
    }))
  };
  assert.equal(normalizeView(scratchStatsInput).tiles.length, 15);
  png = await renderView(scratchStatsInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'scratch-stats-preview.png'), png);
});

test('亡命神抽专用桌面可渲染甲板、强制道具目标与十花色战利品', async () => {
  const suits = ['M', 'T', 'D', 'G', 'C', 'Y', 'B', 'H', 'P', 'Z'];
  const names = ['美人鱼', '藏宝图', '弯刀', '钩子', '船锚', '钥匙', '宝箱', '海怪', '大炮', '占卜球'];
  const emptyCollection = suits.map((suit, index) => ({ suit, name: names[index], value: 0, count: 0 }));
  const menuPng = await renderView({
    kind: 'dmd', title: '亡命神抽对决', subtitle: '十花色冒险 · 入场100 · 胜者返还200', quote: '同一花色出现第二张会使甲板爆炸。',
    dmdTable: {
      status: 'menu', deckCount: 60, discardCount: 0, forcedDraws: 0,
      board: [
        { suit: 'M', name: '美人鱼', value: 4, code: 'M4' }, { suit: 'C', name: '船锚', value: 5, code: 'C5' },
        { suit: 'H', name: '海怪', value: 3, code: 'H3' }, { suit: 'Y', name: '钥匙', value: 6, code: 'Y6' }, { suit: 'B', name: '宝箱', value: 7, code: 'B7' }
      ],
      lastAction: '同一花色出现第二张会使甲板爆炸；十种花色全部收手可达成大满贯。',
      players: [
        { name: '你的座位', score: 0, collectedTypes: 0, grandSlams: 0, isTurn: true, status: '等待入座', collection: emptyCollection },
        { name: '骰娘 / 玩家', score: 0, collectedTypes: 0, grandSlams: 0, isBot: true, status: '等待对手', collection: emptyCollection }
      ],
      help: ['.yan 神抽 人机', '.yan 神抽 开房 / 加入 / 机器人 / 开始', '.yan 神抽 抽牌', '.yan 神抽 收手', '.yan 神抽 使用 [道具] [牌ID] [目标]']
    }
  });
  assert.ok(menuPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'dmd-menu-preview.png'), menuPng);

  const playerCollection = suits.map((suit, index) => ({ suit, name: names[index], value: index < 6 ? 7 - index : 0, count: index < 6 ? 1 : 0 }));
  const botCollection = suits.map((suit, index) => ({ suit, name: names[index], value: index % 2 ? 5 : 0, count: index % 2 ? 1 : 0 }));
  const tableInput = {
    kind: 'dmd', title: '亡命神抽对决', subtitle: '入场100 · 十花色全收集可获大满贯', quote: '藏宝图必须从翻出的目标中获得一张牌。',
    dmdTable: {
      status: 'playing', deckCount: 31, discardCount: 14, forcedDraws: 0, currentName: '测试员',
      board: [
        { suit: 'T', name: '藏宝图', value: 2, code: 'T2' }, { suit: 'C', name: '船锚', value: 5, code: 'C5' },
        { suit: 'Y', name: '钥匙', value: 6, code: 'Y6' }, { suit: 'B', name: '宝箱', value: 4, code: 'B4' }
      ],
      lastAction: '藏宝图翻出三张弃牌，必须选择一张加入甲板。',
      pending: {
        type: 'T', name: '藏宝图', mandatory: true,
        options: [
          { index: 1, suit: 'D', name: '弯刀', value: 4, code: 'D4' },
          { index: 2, suit: 'P', name: '大炮', value: 5, code: 'P5' },
          { index: 3, suit: 'M', name: '美人鱼', value: 3, code: 'M3' }
        ]
      },
      players: [
        { name: '测试员', score: 31, collectedTypes: 6, grandSlams: 0, isTurn: true, isGuest: true, status: '必须处理藏宝图', collection: playerCollection },
        { name: '姜修泽', score: 25, collectedTypes: 5, grandSlams: 0, isBot: true, status: '等待对手', collection: botCollection }
      ]
    }
  };
  const normalized = normalizeView(tableInput);
  assert.equal(normalized.dmdTable.pending.options[1].code, 'P5');
  assert.equal(normalized.dmdTable.players[0].collection.length, 10);
  assert.equal(normalized.dmdTable.players[0].isGuest, true);
  const tablePng = await renderView(tableInput);
  assert.ok(tablePng.length > 50_000);
  const image = await loadImage(tablePng); assert.equal(image.width, 1200); assert.equal(image.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'dmd-table-preview.png'), tablePng);

  const tutorialPng = await renderView({
    kind: 'dmd', title: '亡命神抽 · 完整教程', subtitle: '第 2/3 页 · 十种花色牌效', quote: '所有存在合法目标的牌效都必须执行。',
    tutorial: {
      page: 2, total: 3,
      entries: names.map((name, index) => ({
        title: `${name} ${suits[index]}`,
        description: ['移动一张较早甲板牌到末尾。', '从弃牌堆翻出至多三张并必须取得一张。', '抢走自己尚未拥有花色的对手顶牌。', '把自己一张战利品移回甲板。', '爆炸时保护它之前的牌。', '与宝箱同次收手触发奖励。', '与钥匙同次收手触发奖励。', '强制追加两次抽牌。', '摧毁一张对手花色顶牌。', '公开预告牌库下一张牌。'][index],
        tag: ['移动', '获取', '抢夺', '回收', '保护', '组合', '组合', '强制', '破坏', '预知'][index]
      }))
    }
  });
  assert.ok(tutorialPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'dmd-tutorial-preview.png'), tutorialPng);
});

test('Farkle专用骰桌可渲染帮助、真实骰面、玩家进度与结算数据', async () => {
  const menuPng = await renderView({
    kind: 'farkle', title: 'Farkle · 快艇骰对决', subtitle: '六骰计分 · 入场100 · 胜者返还200', quote: '选择计分骰后，可以继续投掷，也可以存分。',
    farkleTable: {
      status: 'menu', phase: 'turn', phaseLabel: '选择开局方式', target: 5000, remaining: 6,
      dice: [1, 2, 3, 4, 5, 6], suggestedScore: 1500, lastAction: '顺子、三对、三个及以上同点，以及单独的1和5都能计分。',
      players: [
        { name: '你的座位', score: 0, turnScore: 0, bestTurn: 0, isTurn: true, status: '等待入座' },
        { name: '骰娘 / 玩家', score: 0, turnScore: 0, bestTurn: 0, isBot: true, status: '等待对手' }
      ],
      help: ['.yan 快艇 人机', '.yan 快艇 开房 / 加入 / 机器人 / 开始', '.yan 快艇 投掷', '.yan 快艇 选择 1,1,5', '.yan 快艇 存分']
    }
  });
  assert.ok(menuPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'farkle-menu-preview.png'), menuPng);

  const tableInput = {
    kind: 'farkle', title: 'Farkle · 快艇骰对决', subtitle: '入场100 · 1v1固定5000分获胜', quote: '红色的1和5可以单独计分。',
    farkleTable: {
      status: 'playing', phase: 'rolled', phaseLabel: '选择计分骰', target: 5000, currentName: '测试员', remaining: 6,
      dice: [1, 1, 5, 2, 3, 6], suggestedScore: 250, lastAction: '测试员投出 [1, 1, 5, 2, 3, 6]。',
      players: [
        { name: '测试员', score: 3250, turnScore: 450, bestTurn: 1200, isTurn: true, isGuest: true, status: '选择计分骰' },
        { name: '姜修泽', score: 2800, turnScore: 0, bestTurn: 950, isBot: true, status: '等待对手' }
      ]
    }
  };
  const normalized = normalizeView(tableInput);
  assert.deepEqual(normalized.farkleTable.dice, [1, 1, 5, 2, 3, 6]);
  assert.equal(normalized.farkleTable.players[0].turnScore, 450);
  assert.equal(normalized.farkleTable.players[0].isGuest, true);
  const tablePng = await renderView(tableInput);
  assert.ok(tablePng.length > 50_000);
  const image = await loadImage(tablePng);
  assert.equal(image.width, 1200); assert.equal(image.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'farkle-table-preview.png'), tablePng);

  const tutorialPng = await renderView({
    kind: 'farkle', title: 'Farkle快艇骰 · 完整教程', subtitle: '第 2/2 页 · 全部计分组合', quote: '先认单1、单5和三条，再寻找顺子、三对与高条数组合。',
    tutorial: {
      page: 2, total: 2,
      entries: [
        { title: '单个1', description: '每个单独的1计100分。', tag: '100分' },
        { title: '单个5', description: '每个单独的5计50分。', tag: '50分' },
        { title: '三个1', description: '三个1计1000分，更多相同骰逐次翻倍。', tag: '三条' },
        { title: '普通三条', description: '三个相同的2至6按点数×100计分。', tag: '三条' },
        { title: '四五六条', description: '四条为三条2倍，五条4倍，六条8倍。', tag: '高分' },
        { title: '六骰顺子', description: '1至6各一枚，固定1500分并触发热骰。', tag: '1500分' },
        { title: '三对', description: '六枚骰子组成三组对子，固定1500分。', tag: '1500分' },
        { title: '图片提示', description: '选择阶段显示最高可计分值，爆骰后保留骰面回看。', tag: '界面' }
      ]
    }
  });
  assert.ok(tutorialPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'farkle-tutorial-preview.png'), tutorialPng);

  const bustInput = {
    kind: 'farkle', title: 'Farkle · 快艇骰对决', subtitle: '入场100 · 1v1固定5000分获胜', quote: '爆骰骰面仅用于回看，当前已轮到玩家重新投掷。',
    farkleTable: {
      status: 'playing', phase: 'turn', phaseLabel: '等待投掷', target: 5000, currentName: '测试员', remaining: 6,
      dice: [2, 3, 4, 6, 2, 3], diceReview: true, suggestedScore: 0, lastAction: '轮到 测试员。',
      reviewTurn: { name: '测试员', farkled: true, dice: [2, 3, 4, 6, 2, 3], lostScore: 450, gained: 0, total: 3250 },
      lastBotTurn: { name: '姜修泽', isBot: true, farkled: false, dice: [], lostScore: 0, gained: 1500, total: 4300 },
      players: [
        { name: '测试员', score: 3250, turnScore: 0, bestTurn: 1200, isTurn: true, status: '等待投掷' },
        { name: '姜修泽', score: 4300, turnScore: 0, bestTurn: 1500, isBot: true, status: '等待对手' }
      ]
    }
  };
  const normalizedBust = normalizeView(bustInput);
  assert.equal(normalizedBust.farkleTable.diceReview, true);
  assert.equal(normalizedBust.farkleTable.lastBotTurn.gained, 1500);
  const bustPng = await renderView(bustInput);
  assert.ok(bustPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'farkle-bust-preview.png'), bustPng);
});

test('钓鱼详细统计可显示最大鱼、最小鱼与图鉴进度', async () => {
  const png = await renderView({
    kind: 'stats', title: '钓鱼 · 详细统计', subtitle: '测试员的项目档案', quote: '九十六种鱼获只会在安全收杆后逐项点亮。',
    tiles: [
      { label: '总局数', value: '18', tone: 'accent' }, { label: '胜 / 负 / 平', value: '9 / 8 / 1', tone: 'neutral' },
      { label: '胜率', value: '50%', tone: 'positive' }, { label: '历史最高', value: '1288', tone: 'accent' },
      { label: '累计项目分', value: '7250', tone: 'neutral' }, { label: '游戏币净收益', value: '+980', tone: 'positive' },
      { label: '累计获得好感', value: '+35', tone: 'positive' }, { label: '累计失去好感', value: '-0', tone: 'negative' },
      { label: '好感净变化', value: '+35', tone: 'positive' }, { label: '历史最大鱼', value: '皇带鱼 · 6.20kg', tone: 'accent' },
      { label: '历史最小鱼', value: '麦穗鱼 · 0.18kg', tone: 'positive' }, { label: '图鉴解锁进度', value: '7 / 96 · 7%', tone: 'accent' }
    ],
    lines: ['图鉴已解锁七种鱼获。']
  });
  assert.ok(png.length > 50_000);
  const image = await loadImage(png); assert.equal(image.width, 1200); assert.equal(image.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'fishing-stats-preview.png'), png);
});

test('钓鱼水域菜单、垂钓现场与断线状态可渲染', async () => {
  const menuPng = await renderView({
    kind: 'fishing', title: '钓鱼佬 · 选择水域', subtitle: '小鱼塘10 · 江水50 · 大海100', quote: '越难的水域，鱼获上限和断线风险都越高。',
    fishingScene: {
      status: 'menu', event: '水面平静，选择今天准备挑战的水域。',
      pondOptions: [
        { name: '小鱼塘', cost: 10, risk: 8, maxValue: 30, speciesCount: 32, fish: ['麦穗鱼', '鲫鱼', '锦鲤', '老甲鱼'], representatives: [{ name: '麦穗鱼', rarity: 0, asset: 'fish-001' }, { name: '鲫鱼', rarity: 1, asset: 'fish-009' }, { name: '锦鲤', rarity: 2, asset: 'fish-017' }, { name: '老甲鱼', rarity: 3, asset: 'fish-025' }] },
        { name: '江水', cost: 50, risk: 15, maxValue: 250, speciesCount: 32, fish: ['鳊鱼', '鲈鱼', '鳜鱼', '江豚影子'], representatives: [{ name: '鳊鱼', rarity: 0, asset: 'fish-033' }, { name: '鲈鱼', rarity: 1, asset: 'fish-041' }, { name: '鳜鱼', rarity: 2, asset: 'fish-049' }, { name: '江豚影子', rarity: 3, asset: 'fish-057' }] },
        { name: '大海', cost: 100, risk: 22, maxValue: 800, speciesCount: 32, fish: ['鲭鱼', '石斑鱼', '蓝鳍金枪鱼', '皇带鱼'], representatives: [{ name: '鲭鱼', rarity: 0, asset: 'fish-065' }, { name: '石斑鱼', rarity: 1, asset: 'fish-073' }, { name: '蓝鳍金枪鱼', rarity: 2, asset: 'fish-081' }, { name: '皇带鱼', rarity: 3, asset: 'fish-089' }] }
      ]
    }
  });
  assert.ok(menuPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'fishing-menu-preview.png'), menuPng);

  const scenePng = await renderView({
    kind: 'fishing', title: '钓鱼佬 · 风险与收获', subtitle: '大海 · 高风险水域', quote: '鱼越来越大，下一次也可能让整个鱼篓归零。',
    fishingScene: {
      status: 'playing', name: '测试员', pond: '大海', cost: 100, stage: 4, maxStage: 5, risk: 54, value: 1288,
      event: '传说的皇带鱼咬钩，约5.26kg，估值755。',
      haul: [
        { name: '鲭鱼', asset: 'fish-065', rarity: 0, rarityName: '普通', size: 0.72, value: 42 },
        { name: '石斑鱼', asset: 'fish-073', rarity: 1, rarityName: '少见', size: 1.84, value: 126 },
        { name: '蓝鳍金枪鱼', asset: 'fish-081', rarity: 2, rarityName: '稀有', size: 3.45, value: 365 },
        { name: '皇带鱼', asset: 'fish-089', rarity: 3, rarityName: '传说', size: 5.26, value: 755 }
      ]
    }
  });
  assert.ok(scenePng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'fishing-scene-preview.png'), scenePng);

  const lostPng = await renderView({
    kind: 'fishing', title: '钓鱼佬 · 风险与收获', quote: '这次判断过于激进。',
    fishingScene: { status: 'banked', outcome: 'lost', pond: '江水', cost: 50, stage: 3, maxStage: 5, risk: 39, lostCount: 3, lostValue: 286, value: 0, reward: 0, affectionDelta: -2, event: '鱼线突然绷断，鱼篓也被水流卷走。', haul: [] }
  });
  assert.ok(lostPng.length > 50_000);
});

test('钓鱼图鉴归一化96种资产并渲染4x4锁定页', async () => {
  const dexInput = {
    kind: 'fishing', title: '钓鱼佬 · 鱼类图鉴', subtitle: '测试员 · 第6/6页',
    fishingScene: {
      status: 'dex', name: '测试员', page: 6, totalPages: 6, unlockedCount: 2, totalSpecies: 96,
      biggestFish: { name: '格陵兰鲨', asset: 'fish-096', rarity: 3, size: 426.8 },
      smallestFish: { name: '麦穗鱼', asset: 'fish-001', rarity: 0, size: 0.08 },
      dexEntries: Array.from({ length: 16 }, (_, index) => ({
        name: `海鱼${index + 81}`, pond: '大海', asset: `fish-${String(index + 81).padStart(3, '0')}`,
        rarity: index < 8 ? 2 : 3, rarityName: index < 8 ? '稀有' : '传说', unlocked: index < 2,
        count: index < 2 ? index + 1 : 0, smallestSize: index < 2 ? 1.2 : 0, largestSize: index < 2 ? 8.6 : 0
      }))
    }, quote: '只有安全收入鱼篓的鱼获才会点亮。'
  };
  const normalized = normalizeView(dexInput);
  assert.equal(normalized.fishingScene.status, 'dex'); assert.equal(normalized.fishingScene.dexEntries.length, 16);
  assert.equal(normalized.fishingScene.dexEntries[0].asset, 'fish-081'); assert.equal(normalized.fishingScene.dexEntries[15].asset, 'fish-096');
  const png = await renderView(dexInput); assert.ok(png.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'fishing-dex-preview.png'), png);
});

test('钓鱼96张透明鱼类精灵均可加载且实际替换矢量兜底', async () => {
  const spriteDirectory = path.join(__dirname, '..', 'renderer', 'assets', 'fish-sprites');
  for (let number = 1; number <= 96; number++) {
    const file = path.join(spriteDirectory, `fish-${String(number).padStart(3, '0')}.png`);
    assert.equal(fs.existsSync(file), true, `${path.basename(file)} 应存在`);
    const image = await loadImage(file);
    assert.ok(image.width >= 100 && image.height >= 80, `${path.basename(file)} 尺寸应足够清晰`);
    const canvas = createCanvas(image.width, image.height); const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const corners = [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]];
    corners.forEach(([x, y]) => assert.equal(context.getImageData(x, y, 1, 1).data[3], 0, `${path.basename(file)} 四角应透明`));
  }
  const base = {
    kind: 'fishing', title: '钓鱼佬 · 真实鱼影验证',
    fishingScene: { status: 'playing', pond: '大海', cost: 100, stage: 1, maxStage: 5, risk: 22, value: 45, event: '鲭鱼咬钩。', haul: [{ name: '鲭鱼', rarity: 0, rarityName: '普通', size: 0.72, value: 45 }] }
  };
  const fallback = await renderView(base);
  const bitmap = await renderView({ ...base, fishingScene: { ...base.fishingScene, haul: [{ ...base.fishingScene.haul[0], asset: 'fish-065' }] } });
  assert.notDeepEqual(bitmap, fallback, '有效资产编号应让最终渲染使用透明鱼类精灵');
});

test('智力打工菜单、题目与专项统计可渲染', async () => {
  const active = {
    kind: 'work', title: '智力打工 · 题目工坊', subtitle: '24点 · 200游戏币/小时',
    workScene: {
      mode: 'active', type: 'math24', typeName: '24点', name: '打工测试员', coins: 12, workLimit: 200,
      attemptsLeft: 1, elapsedMs: 42000,
      puzzle: { numbers: [1, 5, 5, 5], target: 24, decimal: true, noSolution: false },
      stats: { questions: 4, solved: 3, bestStreak: 2, bestReward: 8, coinsEarned: 12 }
    },
    quote: '题目没有输家，只有下一道题。'
  };
  const activePng = await renderView(active);
  assert.ok(activePng.length > 50_000);
  const activeImage = await loadImage(activePng);
  assert.equal(activeImage.width, 1200); assert.equal(activeImage.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'work-active-preview.png'), activePng);

  const sudokuInput = {
    kind: 'work', title: '智力打工 · 题目工坊', subtitle: '数独 · 200游戏币/小时 · 第1题', quote: '九个九宫格各自使用一圈金色边框。',
    workScene: { mode: 'active', type: 'sudoku', typeName: '数独', name: '打工测试员', coins: 12, workLimit: 200, attemptsLeft: 1, elapsedMs: 17000,
      puzzle: { width: 9, height: 9, puzzle: '000609000392040058102070369014000000030461287070050001000085906000106470061000830' }, stats: {} }
  };
  const normalizedSudoku = normalizeView(sudokuInput); assert.equal(normalizedSudoku.workScene.puzzle.puzzle.length, 81);
  const sudokuPng = await renderView(sudokuInput); assert.ok(sudokuPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'work-sudoku-preview.png'), sudokuPng);

  const creekInput = {
    kind: 'work', title: '智力打工 · 题目工坊', subtitle: 'Creek溪流 · 200游戏币/小时 · 第1题', quote: '外围只保留边框，数字节点只出现在内部交点。',
    workScene: { mode: 'active', type: 'creek', typeName: 'Creek溪流', name: '打工测试员', coins: 12, workLimit: 200, attemptsLeft: 1, elapsedMs: 22000,
      puzzle: { width: 10, height: 7, unique: true, clues: ['00111111110', '01122223221', '01111222110', '01100110000', '02200000000', '13201101221', '12100101221', '01000000110'] }, stats: {} }
  };
  const normalizedCreek = normalizeView(creekInput); assert.equal(normalizedCreek.workScene.puzzle.clues.length, 8); assert.equal(normalizedCreek.workScene.puzzle.unique, true);
  const creekPng = await renderView(creekInput); assert.ok(creekPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'work-creek-preview.png'), creekPng);

  const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'server.js'), 'utf8');
  const workBlock = rendererSource.slice(rendererSource.indexOf('function drawWorkScene('), rendererSource.indexOf('async function renderView('));
  assert.match(workBlock, /for \(let boxRow = 0; boxRow < 3; boxRow\+\+\).*for \(let boxCol = 0; boxCol < 3; boxCol\+\+\)/s);
  assert.match(workBlock, /for \(let row = 1; row < puzzle\.height; row\+\+\).*for \(let col = 1; col < puzzle\.width; col\+\+\)/s);
  assert.match(workBlock, /ctx\.strokeRect\(left, top, boardWidth, boardHeight\)/);

  const summaryPng = await renderView({
    kind: 'work', title: '智力打工 · 当次结算', subtitle: '打工测试员 · 本次工作已经结束',
    workScene: { mode: 'summary', typeName: '当次结算', name: '打工测试员', coins: 44, workLimit: 200,
      summary: { issued: 4, completed: 3, solved: 2, failed: 1, skipped: 0, wrongAnswers: 1, gross: 18, paid: 18, averageDifficulty: 4.8, averageSolveSeconds: 52, elapsedMs: 188000 } },
    quote: '本次工作已结算；发送“.打工 开始”可以开始新一班。'
  });
  assert.ok(summaryPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'work-summary-preview.png'), summaryPng);

  const statsPng = await renderView({
    kind: 'work', title: '智力打工 · 专项统计', subtitle: '打工测试员 · 历史记录',
    workScene: { mode: 'stats', typeName: '统计', name: '打工测试员', coins: 200, workLimit: 200,
      stats: { questions: 20, solved: 15, wrong: 5, streak: 3, bestStreak: 8, bestReward: 19, grossReward: 120, coinsEarned: 64, averageSeconds: 83, math24: 7, decimal: 2, noSolution: 1, sudoku: 5, knights: 4, creek: 4 } },
    quote: '余额达到200后仍可答题，但不再发薪。'
  });
  assert.ok(statsPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'work-stats-preview.png'), statsPng);

  const calculatorPng = await renderView({
    kind: 'work', title: '智力打工 · 计算器游戏', subtitle: '第6关 · 200游戏币/小时 · 第1题', quote: '按钮可以连续输入：.打工 按 221122333。',
    workScene: { mode: 'active', type: 'calculator', typeName: '计算器游戏', name: '打工测试员', coins: 12, workLimit: 200, attemptsLeft: 1, elapsedMs: 24000,
      puzzle: { level: 6, target: 32, stepLimit: 4, stepsLeft: 2, value: '310', options: [{ index: 1, label: '末位+2', color: '#db7633' }, { index: 2, label: '×2', color: '#318dd9' }, { index: 3, label: '<<', color: '#db7633' }, { index: 4, label: '数位和', color: '#318dd9' }], history: [{ option: 1, label: '末位+2', before: '155', after: '157' }, { option: 2, label: '×2', before: '157', after: '314' }] }, stats: {} }
  });
  assert.ok(calculatorPng.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'work-calculator-preview.png'), calculatorPng);
});

test('计算器游戏图片场景包含按钮与连续按键提示', async () => {
  const normalized = normalizeView({ kind: 'work', workScene: { mode: 'active', type: 'calculator', typeName: '计算器游戏', puzzle: { level: 1, target: 8, stepLimit: 3, stepsLeft: 3, value: '0', options: [{ index: 1, label: '+2' }, { index: 2, label: '+3' }] } } });
  assert.equal(normalized.workScene.type, 'calculator'); assert.equal(normalized.workScene.puzzle.options.length, 2);
  const png = await renderView(normalized); assert.ok(png.length > 40_000);
});

test('竞拍之王可渲染助手、菜单、暗标、开箱、图鉴与图片教程', async () => {
  const assistants = [
    ['加布里埃拉', '循迹教学', '发动时随机探清2件货品，此后每轮再探清2件。', 'reveal', '轮廓探测', '主动·逐轮', '#f3c969'],
    ['索菲', '潮流雷达', '发动时随机探清5件货品，此后每轮再探清2件。', 'reveal', '品质探测', '主动·逐轮', '#82d5d0'],
    ['玛丽亚', '二手排雷', '开局统计低阶品质数量并估算回收价带。', 'valuation', '排雷估价', '开局被动', '#9bb7d4'],
    ['维克托', '稀缺账本', '开局统计高阶品质数量，第3轮追加估价。', 'statistics', '高阶统计', '开局被动·第3轮升级', '#f2b5d4'],
    ['伊莎贝拉', '珠宝视界', '锁定最高品质货品并探清奢侈品。', 'hybrid', '定向鉴宝', '主动', '#b4d58d'],
    ['艾哈迈德', '全局盘货', '开局统计货量并给出整箱估价区间。', 'valuation', '宏观估价', '开局被动·第3轮升级', '#ef8d7f'],
    ['伊森', '轮廓盲猜', '随机探清5件货品并在终局完全展开。', 'reveal', '轮廓盲猜', '主动·终局升级', '#d4a7ff'],
    ['陈美', '璀璨视界', '探清奢侈品并汇总品质分布。', 'hybrid', '品类鉴定', '主动', '#73d8ff'],
    ['娜奥米', '潮品扫货', '探清奢侈品与电器并统计高品质货。', 'hybrid', '品类统计', '主动', '#ffb979'],
    ['卡洛斯', '仓储勘察', '探清家居与电器并逐轮补探。', 'reveal', '品类探测', '主动·逐轮', '#9ed18b'],
    ['拉文', '终局洞察', '前4轮潜伏，第5轮公开全部剩余轮廓。', 'reveal', '延迟爆发', '主动·第5轮生效', '#c2b7f2']
  ].map(([name, skill, description, kind, typeLabel, triggerLabel, color]) => ({ name, skill, description, kind, typeLabel, triggerLabel, color }));
  const assistantInput = {
    kind: 'auction', title: '竞拍之王 · 选择助手', subtitle: '首次进入必须选择 · 选定后写入个人档案', quote: '发送“.竞拍 助手 名称”完成选择。',
    auctionScene: { mode: 'assistant', assistants, players: [], tools: [], feedback: [], items: [] }
  };
  const normalizedAssistant = normalizeView(assistantInput);
  assert.equal(normalizedAssistant.auctionScene.assistants.length, 11);
  assert.ok(normalizedAssistant.auctionScene.assistants.some((assistant) => assistant.kind === 'valuation'));
  assert.ok(normalizedAssistant.auctionScene.assistants.some((assistant) => assistant.kind === 'statistics'));
  const assistantPng = await renderView(assistantInput); assert.ok(assistantPng.length > 80_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'auction-assistant-preview.png'), assistantPng);

  const menuPng = await renderView({
    kind: 'auction', title: '竞拍之王', subtitle: '默认新手仓 · 货品拼格观察 · 五轮暗标', quote: '测试员的助手：加布里埃拉',
    auctionScene: {
      mode: 'menu', auctionRate: 10000, assistant: assistants[0], selectedVenue: '新手仓', players: [], tools: [], items: [],
      venues: [
        ['新手仓', '货多 · 线索清楚 · 精品偏少', 10, 14], ['跳蚤市场', '货最多 · 鱼龙混杂 · 仿品偏多', 12, 17],
        ['港口滞留仓', '大件偏多 · 价值波动明显', 8, 12], ['收藏家遗产', '货少 · 精品率高 · 小件藏得深', 5, 9],
        ['工业清仓', '重货很多 · 设备与废料混装', 8, 13], ['高端会所', '精品偏多 · 受损与仿品风险并存', 6, 10],
        ['无主黑箱', '货少 · 情报极少 · 价值极端', 4, 8]
      ].map(([name, tagline, minItems, maxItems]) => ({ name, tagline, minItems, maxItems })),
      feedback: ['第1-4轮满足领先倍率可提前成交；第5轮最高价成交，同价加赛。']
    }
  });
  assert.equal(normalizeView({ auctionScene: { mode: 'menu', auctionRate: 10000 } }).auctionScene.auctionRate, 10000);
  assert.ok(menuPng.length > 80_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'auction-menu-preview.png'), menuPng);

  const players = [
    { name: '测试员', active: true, submitted: true, confirmed: false, status: '调整中', isViewer: true, ownBid: 168000, rank: 2, rankRound: 3, rankHistory: [4, 2, 2, 0, 0] },
    { name: '姜修泽', isBot: true, active: true, submitted: true, confirmed: true, status: '已确认', rank: 1, rankRound: 3, rankHistory: [2, 1, 1, 0, 0] },
    { name: '葛明治', isBot: true, active: true, submitted: true, confirmed: true, status: '已确认', rank: 3, rankRound: 3, rankHistory: [1, 3, 3, 0, 0] },
    { name: '阿日', isBot: true, active: true, submitted: true, confirmed: true, status: '已确认', rank: 4, rankRound: 3, rankHistory: [3, 4, 4, 0, 0] },
    { name: '严茫熙', isBot: true, active: true, submitted: true, confirmed: true, status: '已确认', rank: 5, rankRound: 3, rankHistory: [5, 6, 5, 0, 0] },
    { name: '亨德森', isBot: true, active: true, submitted: true, confirmed: true, status: '已确认', rank: 6, rankRound: 3, rankHistory: [6, 5, 6, 0, 0] },
    { name: '合作买家', active: true, submitted: false, confirmed: false, status: '观察中', rank: 7, rankRound: 3, rankHistory: [7, 7, 7, 0, 0] },
    { name: '访客位（游客）', active: false, submitted: false, confirmed: false, status: '已离场', isGuest: true, rank: 0, rankRound: 3, rankHistory: [5, 5, 0, 0, 0] }
  ];
  const rect = (width, height) => { const cells = []; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) cells.push([x, y]); return cells; };
  const gridLayout = [
    [0, 0, rect(2, 2)], [3, 0, rect(1, 1)], [5, 0, rect(3, 1)], [9, 0, rect(2, 2)],
    [0, 3, rect(3, 2)], [4, 2, rect(2, 2)], [7, 2, rect(1, 2)], [9, 3, rect(2, 1)],
    [0, 6, rect(1, 1)], [2, 6, rect(2, 1)], [5, 5, rect(3, 2)], [9, 5, rect(2, 2)],
    [0, 8, rect(2, 1)], [3, 8, rect(1, 2)], [5, 8, rect(3, 1)], [9, 8, rect(2, 2)]
  ];
  const previewNames = ['实木餐桌', '机械腕表', '专业功放', '黄铜阀门组', '古董航海仪', '摄影灯组', '藤编躺椅', '限量黑胶唱片', '宝石胸针', '空气压缩机', '模型火车组', '密码保险箱', '收藏级公路赛车', '羊毛地毯', '名家亲笔手稿', '拆机零件'];
  const previewCategories = ['家居', '奢侈品', '电器', '废料', '收藏品', '电器', '家居', '收藏品', '奢侈品', '工业设备', '收藏品', '神秘物件', '交通工具', '家居', '收藏品', '废料'];
  const hiddenItems = gridLayout.map((layout, index) => ({
    id: `货格${index + 1}`, slot: index + 1, name: previewNames[index], category: previewCategories[index], rarity: index % 5,
    rarityName: ['常见', '少见', '稀有', '珍奇', '传说'][index % 5], condition: '状态未知', authenticity: '真伪未知',
    shapeKnown: true, rarityKnown: true, categoryKnown: true, visualKnown: true, fullyRevealed: true,
    visualType: previewCategories[index], gridX: layout[0], gridY: layout[1], shape: layout[2],
    width: Math.max(...layout[2].map((cell) => cell[0])) + 1, height: Math.max(...layout[2].map((cell) => cell[1])) + 1,
    sizeLabel: `${Math.max(...layout[2].map((cell) => cell[0])) + 1}×${Math.max(...layout[2].map((cell) => cell[1])) + 1}`, value: 0
  }));
  const publicKeys = new Set(['0,0', '2,2', '0,3', '9,7']);
  const personalKeys = new Set();
  hiddenItems.slice(1, 3).forEach((item) => item.shape.forEach((point) => personalKeys.add(`${item.gridX + point[0]},${item.gridY + point[1]}`)));
  const occupiedByCell = {};
  hiddenItems.forEach((item) => item.shape.forEach((point) => { occupiedByCell[`${item.gridX + point[0]},${item.gridY + point[1]}`] = item; }));
  const fogCells = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) {
    const key = `${x},${y}`; const item = occupiedByCell[key]; const isPublic = publicKeys.has(key); const isPersonal = personalKeys.has(key); const revealed = isPublic || isPersonal;
    fogCells.push({ x, y, label: `${String.fromCharCode(65 + x)}${y + 1}`, revealed, public: isPublic, personal: isPersonal, occupied: revealed && !!item, rarity: revealed && item ? item.rarity : -1, rarityName: revealed && item ? item.rarityName : '' });
  }
  const identifiedItems = hiddenItems.filter((item) => item.shape.every((point) => personalKeys.has(`${item.gridX + point[0]},${item.gridY + point[1]}`)));
  const biddingInput = {
    kind: 'auction', title: '竞拍之王 · 集装箱暗标', subtitle: '五轮暗标 · 对手金额保密 · 1游戏币=10000竞拍币', quote: '具体金额不会向其他竞拍者公开。',
    auctionScene: {
      mode: 'bidding', round: 3, maxRounds: 5, autoConfirm: true, assistant: { ...assistants[5], used: true },
      assistantReport: {
        kind: 'valuation', typeLabel: '宏观估价', triggerLabel: '开局被动·第3轮升级', round: 3,
        summary: '艾哈迈德结合前三轮情报，把16件货的整箱估价进一步收窄。',
        stats: [
          { label: '货品', value: 16, tone: 'neutral' }, { label: '占格', value: '41/120', tone: 'accent' },
          { label: '大型', value: 6, tone: 'warning' }, { label: '高阶', value: 4, tone: 'positive' }
        ],
        valuation: { label: '第3轮整箱估价', low: 420000, high: 590000, confidence: '较高' }
      },
      selectedVenue: '收藏家遗产', container: { code: 'CT-240726-17', theme: '收藏家遗产', venue: '收藏家遗产', clue: '箱内使用了大量防潮纸与独立木盒。', silhouette: '12×10货柜处于战争迷雾中。', seal: '封条有二次粘贴痕迹', gridWidth: 12, gridHeight: 10 },
      ownBid: 168000, budget: 500000, minimumEstimate: 96000, playerBand: '偏高', marketHeat: '升温', spread: '分歧明显', submittedCount: 6, activeCount: 7, players,
      tools: [{ name: '红外相机', description: '核验一件货品的品质边框。' }, { name: '防伪镜', description: '检查一件货品是否存在仿制嫌疑。' }],
      feedback: ['第2轮总体热度：升温', '第2轮价格名次已写入席位轨迹；具体金额继续保密。'],
      publicIntel: '第3轮公共探照灯揭开：A1、C3、A4、J8', intel: '加布里埃拉更新了格子 D1、F1 的品质情报。',
      exploredCount: fogCells.filter((cell) => cell.revealed).length, totalCells: 120, personalExploreUsed: false, cells: fogCells, items: identifiedItems
    }
  };
  const normalizedBidding = normalizeView(biddingInput);
  assert.equal(normalizedBidding.auctionScene.players[1].ownBid, 0);
  assert.equal(normalizedBidding.auctionScene.round, 3);
  assert.equal(normalizedBidding.auctionScene.minimumEstimate, 96000);
  assert.equal(normalizedBidding.auctionScene.assistantReport.kind, 'valuation');
  assert.deepEqual(normalizedBidding.auctionScene.assistantReport.valuation, { label: '第3轮整箱估价', low: 420000, high: 590000, confidence: '较高' });
  assert.deepEqual(normalizedBidding.auctionScene.players[0].rankHistory, [4, 2, 2, 0, 0]);
  const biddingPng = await renderView(biddingInput); assert.ok(biddingPng.length > 80_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'auction-bidding-preview.png'), biddingPng);
  const hiddenInput = {
    ...biddingInput,
    quote: '战争迷雾中只显示本轮公共探照灯揭开的品质色，不泄露物品轮廓。',
    auctionScene: {
      ...biddingInput.auctionScene,
      round: 1, intel: '', publicIntel: '第1轮公共探照灯揭开：A1、C3、A4、J8', exploredCount: publicKeys.size, totalCells: 120,
      players: players.map((player) => ({ ...player, rank: 0, rankRound: 0, rankHistory: [0, 0, 0, 0, 0] })),
      cells: fogCells.map((cell) => ({ ...cell, revealed: cell.public, personal: false, occupied: cell.public && cell.occupied, rarity: cell.public ? cell.rarity : -1 })), items: []
    }
  };
  const normalizedHidden = normalizeView(hiddenInput);
  assert.equal(normalizedHidden.auctionScene.items.length, 0);
  assert.equal(normalizedHidden.auctionScene.cells.filter((cell) => cell.revealed).length, 4);
  const hiddenPng = await renderView(hiddenInput); assert.ok(hiddenPng.length > 80_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'auction-hidden-preview.png'), hiddenPng);

  const items = [
    ['古董航海仪', '收藏品', 2, '稀有', '保存良好', 178000], ['机械腕表', '奢侈品', 2, '稀有', '明显磨损', 126000],
    ['限量黑胶唱片', '收藏品', 1, '少见', '近乎全新', 64000], ['手工胡桃木柜', '家居', 1, '少见', '保存良好', 51000],
    ['上锁的黄铜匣', '神秘物件', 1, '少见', '明显磨损', 42000], ['老电影胶片', '收藏品', 1, '少见', '保存良好', 36000],
    ['专业功放', '电器', 0, '常见', '近乎全新', 25000], ['成套纪念邮票', '收藏品', 0, '常见', '保存良好', 18000],
    ['黄铜阀门组', '废料', 1, '少见', '明显磨损', 12000], ['异国旅行笔记', '神秘物件', 1, '少见', '保存良好', 22000]
  ].map((item, index) => ({
    id: `A${index + 1}`, slot: index + 1, name: item[0], category: item[1], rarity: item[2], rarityName: item[3], condition: item[4],
    authenticity: index === 5 ? '仿制品' : '真品', value: item[5], shapeKnown: true, rarityKnown: true, visualKnown: true, visualType: item[1],
    gridX: gridLayout[index][0], gridY: gridLayout[index][1], shape: gridLayout[index][2],
    width: Math.max(...gridLayout[index][2].map((cell) => cell[0])) + 1, height: Math.max(...gridLayout[index][2].map((cell) => cell[1])) + 1,
    sizeLabel: `${Math.max(...gridLayout[index][2].map((cell) => cell[0])) + 1}×${Math.max(...gridLayout[index][2].map((cell) => cell[1])) + 1}`
  }));
  const resultPng = await renderView({
    kind: 'auction', title: '竞拍之王 · 开箱结算', subtitle: '五轮暗标 · 对手金额保密 · 1游戏币=10000竞拍币', quote: '再次发送“.竞拍”返回帮助界面。',
    auctionScene: {
      mode: 'result', selectedVenue: '收藏家遗产', container: { code: 'CT-240726-17', theme: '收藏家遗产', venue: '收藏家遗产', gridWidth: 12, gridHeight: 10 },
      sold: true, winnerName: '测试员', winningBid: 388000, saleValue: 574000, profit: 186000, coinDelta: 186, affectionDelta: 5,
      players, tools: [], feedback: [], cells: fogCells.map((cell) => ({ ...cell, revealed: true, public: true, occupied: !!occupiedByCell[`${cell.x},${cell.y}`], rarity: occupiedByCell[`${cell.x},${cell.y}`] ? occupiedByCell[`${cell.x},${cell.y}`].rarity : -1 })), items
    }
  });
  assert.ok(resultPng.length > 80_000); const resultImage = await loadImage(resultPng); assert.equal(resultImage.width, 1200); assert.equal(resultImage.height, 900);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'auction-result-preview.png'), resultPng);

  const collectionPng = await renderView({
    kind: 'auction', title: '竞拍之王 · 详细统计', subtitle: '测试员的项目档案', quote: '只有正式成交并安全结算的货品才会点亮图鉴。',
    auctionScene: {
      mode: 'collection', assistant: assistants[0], dexUnlocked: 10, dexTotal: 96, dexPercent: 10,
      highestBid: 388000, bestProfit: 186000, mostItems: 10, totalSpend: 760000, totalRevenue: 946000, containers: 2,
      topItem: '古董航海仪 · 2×1 · 178000竞拍币',
      sizeHints: [
        { sizeLabel: '1×1', width: 1, height: 1, count: 24, names: ['机械腕表', '宝石胸针', '成套纪念邮票'] },
        { sizeLabel: '2×1', width: 2, height: 1, count: 28, names: ['专业功放', '限量黑胶唱片', '珍珠项链'] },
        { sizeLabel: '1×2', width: 1, height: 2, count: 8, names: ['落地灯', '古董立钟'] },
        { sizeLabel: '2×2', width: 2, height: 2, count: 18, names: ['密码保险箱', '工业机械臂'] },
        { sizeLabel: '3×1', width: 3, height: 1, count: 10, names: ['羊毛地毯', '经典轿跑残件'] },
        { sizeLabel: '3×2', width: 3, height: 2, count: 8, names: ['实木餐桌', '电动叉车'] }
      ],
      venueStats: [{ name: '新手仓', plays: 3, wins: 1, profit: 42, items: 12 }, { name: '收藏家遗产', plays: 2, wins: 1, profit: 186, items: 10 }],
      players: [], tools: [], feedback: [], items: items.map((item, index) => ({ ...item, count: index + 1, bestValue: item.value }))
    }
  });
  assert.ok(collectionPng.length > 80_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'auction-collection-preview.png'), collectionPng);

  const tutorialPng = await renderView({
    kind: 'auction', title: '竞拍之王 · 完整教程', subtitle: '第 3/5 页 · 自由改价与名次轨迹', quote: '系统公开每轮名次，但不公开对手具体金额。',
    tutorial: {
      page: 3, total: 5,
      entries: [
        ['自由改价', '确认前可反复覆盖本轮暗标，允许加价或降价。', '暗标'], ['资金锁定', '加价补锁，降价立即退回差额。', '资金'],
        ['确认暗标', '发送“.竞拍 确认”才算完成本轮。', '确认'], ['撤回确认', '全员确认前可撤回再修改。', '修改'],
        ['价位区间', '只提示自己的报价位于哪个模糊区间。', '保密'], ['市场热度', '只展示全体总体热度与分歧程度。', '总体'],
        ['五轮名次', '玩家卡下方依次记录五轮价格名次。', '排名'], ['金额保密', '公开名次但不公开任何对手金额。', '保密']
      ].map(([title, description, tag]) => ({ title, description, tag }))
    }
  });
  assert.ok(tutorialPng.length > 80_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'auction-tutorial-preview.png'), tutorialPng);
});

test('HTTP渲染接口返回短链接并可下载PNG', async (t) => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/api/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'profile', title: '短链接测试', lines: ['仅一行状态'] })
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.data, undefined, '响应中不应再包含Base64');
  assert.match(result.url, /^\/api\/image\/[a-f0-9]{24}$/);
  assert.ok(result.url.length < 64);

  const imageResponse = await fetch(`${base}${result.url}`);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get('content-type'), 'image/png');
  const png = Buffer.from(await imageResponse.arrayBuffer());
  assert.ok(png.length > 50_000);
  assert.deepEqual(Array.from(png.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
});

test('爱赢一切可渲染菜单、进行中牌桌、完整摊牌结算与图片教程', async () => {
  const card = (type, name, color, emoji, hidden = false) => ({ type, name, color, emoji, hidden });
  const deckCards = [
    card('S', '剪刀', '#3f8ee8', '✂'), card('R', '石头', '#e0525b', '✊'), card('P', '布', '#e4bd42', '✋'),
    card('L', '爱', '#51b878', '🫰'), card('C', '骗子', '#e56aa6', '🤞')
  ];
  const menuInput = {
    kind: 'love', title: '爱赢一切', subtitle: '韩国综艺牌局 · 1v1 · 入场100游戏币', quote: '骗子牌能兑现合法宣告，也会在同牌型时反噬持有者。',
    loveTable: { status: 'menu', phase: 'menu', phaseLabel: '选择模式', maxRounds: 7, deckCount: 49, cards: deckCards.map((item, index) => ({ ...item, count: [18, 12, 12, 6, 1][index] })), players: [], help: ['.爱赢一切 人机', '.爱赢一切 开房 / 加入 / 开始', '.爱赢一切 教程 1'] }
  };
  const normalizedMenu = normalizeView(menuInput); assert.equal(normalizedMenu.loveTable.cards.length, 5); assert.equal(normalizedMenu.loveTable.cards[4].count, 1);
  let png = await renderView(menuInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'love-menu-preview.png'), png);

  const activeInput = {
    kind: 'love', title: '爱赢一切 · 1v1牌桌', subtitle: '锁定公开牌与宣告 · 每7轮压力洗牌并减半筹码', quote: '双方选择在确认前互不公开。',
    loveTable: {
      status: 'playing', phase: 'reveal_confirm', phaseLabel: '等待同步公开确认', round: 10, cycleRound: 3, shuffleCount: 1, maxRounds: 7, deckCount: 28, discardCount: 14, pot: 8, carryPot: 0, currentBet: 0, currentName: '',
      common: deckCards[3], players: [
        { name: '测试员', chips: 17, streetBet: 0, committed: 4, isStarter: true, revealLocked: true, cards: [card('', '', '', '', true), card('', '', '', '', true), card('', '', '', '', true)], revealedIndex: -1, declaration: '', roundsWon: 1 },
        { name: '严茫熙', chips: 15, streetBet: 0, committed: 4, isBot: true, revealLocked: true, cards: [card('', '', '', '', true), card('', '', '', '', true), card('', '', '', '', true)], revealedIndex: -1, declaration: '', roundsWon: 1 }
      ], help: ['双方均已私聊锁定', '.爱赢一切 确认公开（群内）']
    }
  };
  png = await renderView(activeInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'love-table-preview.png'), png);

  const resultInput = {
    ...activeInput, subtitle: '整场结算 · 双方完整牌面', quote: '全爱玩家赢得比赛，返还两倍入场费。',
    loveTable: {
      ...activeInput.loveTable, status: 'finished', phase: 'finished', phaseLabel: '整场结算', pot: 0, currentBet: 0, currentName: '',
      players: [
        { name: '骗子持有者', chips: 14, committed: 1, isStarter: true, cards: [deckCards[3], deckCards[1], deckCards[4]], revealedIndex: 0, declaration: '爱赢一切', roundsWon: 2, affectionDelta: -10 },
        { name: '全爱玩家', chips: 26, committed: 1, cards: [deckCards[3], deckCards[3], deckCards[3]], revealedIndex: 0, declaration: '爱赢一切', roundsWon: 4, affectionDelta: 5, coinReward: 200 }
      ],
      result: { round: 7, winnerIndex: 1, winnerName: '全爱玩家', tie: false, pot: 2, penalty: 5, cheatTieLoss: true, reason: '同牌型时私人骗子牌反噬。', evaluations: [{ key: 'winsAll', name: '爱赢一切', rank: 9 }, { key: 'winsAll', name: '爱赢一切', rank: 9 }] },
      ranking: [{ rank: 1, name: '全爱玩家', chips: 26, roundsWon: 4, affectionDelta: 5, coinReward: 200 }, { rank: 2, name: '骗子持有者', chips: 14, roundsWon: 2, affectionDelta: -10 }], help: ['再输入 .爱赢一切 返回菜单']
    }
  };
  png = await renderView(resultInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'love-result-preview.png'), png);

  const tutorialInput = {
    kind: 'love', title: '爱赢一切 · 完整教程', subtitle: '第 3/4 页 · 私人骗子与公共骗子', quote: '骗子牌越自由，暴露后的风险也越高。',
    tutorial: { page: 3, total: 4, entries: [
      { title: '锁定后同步公开', description: '补牌后各自锁定1张手牌与宣告，确认后双方同时展示。', tag: '情报' },
      { title: '私人骗子牌', description: '公共牌与公开手牌支持目标牌型时，宣告会成为真实牌型。', tag: '万能' },
      { title: '骗子反噬', description: '同牌型只有一方持私人骗子牌时，骗子方直接输并额外支付最多5筹码。', tag: '代价' },
      { title: '公共骗子牌', description: '双方各自指定公共骗子牌为剪刀、石头、布或爱。', tag: '指定' }
    ] }
  };
  png = await renderView(tutorialInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'love-tutorial-preview.png'), png);
});

test('爱赢一切全押直摊图会标记跳过宣告阶段', async () => {
  const png = await renderView({
    kind: 'love', title: '爱赢一切 · 全押摊牌', subtitle: '第一轮全押被跟注 · 直接展开最终牌面', quote: '双方不再公开宣告或进行第二轮下注。',
    loveTable: {
      status: 'finished', phase: 'finished', phaseLabel: '整场结算', round: 1, maxRounds: 7, deckCount: 42, discardCount: 7,
      pot: 0, carryPot: 0, currentBet: 0, currentName: '', common: { type: 'L', name: '爱', color: '#51b878', emoji: '🫰' },
      players: [
        { name: '全押方', chips: 40, committed: 20, cards: [{ type: 'L', name: '爱', color: '#51b878' }, { type: 'S', name: '剪刀', color: '#3f8ee8', emoji: '✂' }, { type: 'L', name: '爱', color: '#51b878' }], declaration: '3爱', declarationLabel: '全押摊牌', roundsWon: 1 },
        { name: '跟注方', chips: 0, committed: 20, cards: [{ type: 'R', name: '石头', color: '#e0525b', emoji: '✊' }, { type: 'R', name: '石头', color: '#e0525b', emoji: '✊' }, { type: 'P', name: '布', color: '#e4bd42', emoji: '✋' }], declaration: '1爱', declarationLabel: '全押摊牌', roundsWon: 0 }
      ],
      result: { round: 1, winnerIndex: 0, winnerName: '全押方', tie: false, pot: 40, penalty: 0, allInShowdown: true, evaluations: [{ key: 'threeLove', name: '3爱', rank: 8 }, { key: 'oneLove', name: '1爱', rank: 1 }] },
      ranking: [{ rank: 1, name: '全押方', chips: 40, roundsWon: 1 }, { rank: 2, name: '跟注方', chips: 0, roundsWon: 0 }], help: ['再输入 .爱赢一切 返回菜单']
    }, lines: []
  });
  assert.ok(png.length > 50_000);
});

test('炼金牌桌大手牌双行布局不遮挡本轮已出区域', async () => {
  const attrs = ['SPIRIT', 'WATER', 'FIRE', 'EARTH', 'AIR', 'CONSERVATION', 'DARKSACRIFICE', 'SNATCH', 'ORACLE', 'TIMEMACHINE', 'FIRE'];
  const card = (attr, index) => ({ id: index + 1, attr, type: ['DARKSACRIFICE', 'SNATCH', 'ORACLE', 'TIMEMACHINE'].includes(attr) ? 'MAGIC' : 'ELEMENT' });
  const png = await renderView({
    kind: 'alchemy', title: '魔幻牌炼金术师', subtitle: '大手牌布局测试',
    alchemyTable: {
      status: 'playing', round: 4, maxRounds: 12, current: '手牌测试', deckCount: 35, discardCount: 9,
      players: [
        { name: '大手牌玩家', score: 42, handCount: attrs.length, poolCount: 3, isTurn: true, hand: attrs.map(card), played: [card('AIR', 24)], playedGroups: [[card('TIMEMACHINE', 20)], [card('WATER', 21)], [card('FIRE', 22), card('FIRE', 23)], [card('AIR', 24)]], playedGroupCount: 4, lastAction: '第4次出牌：收集1张气牌' },
        { name: '对手一', score: 20, handCount: 7, poolCount: 2, hand: [], played: [], lastAction: '隐藏手牌' },
        { name: '对手二', score: 16, handCount: 7, poolCount: 1, hand: [], played: [], lastAction: '隐藏手牌' },
        { name: '对手三', score: 11, handCount: 7, poolCount: 0, hand: [], played: [], lastAction: '隐藏手牌' }
      ], poolClearNotice: '大手牌玩家发动黑暗祭祀：全场炼金池已清空（大手牌玩家3张、对手一2张）。', logs: ['物质吸取抽取4张牌。']
    }, quote: '手牌按属性顺序排列；抽牌较多时自动换行。'
  });
  assert.ok(png.length > 50_000);
  const image = await loadImage(png);
  assert.equal(image.width, 2400);
  assert.equal(image.height, 1800);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'alchemy-large-hand-preview.png'), png);
});

test('炼金牌桌清池事件通过规范化并仅炼金场景使用双倍画布', async () => {
  const normalized = normalizeView({ kind: 'alchemy', title: '炼金', alchemyTable: { status: 'playing', poolClearNotice: '全场炼金池已清空' } });
  assert.equal(normalized.alchemyTable.poolClearNotice, '全场炼金池已清空');
  const regular = await renderView({ kind: 'profile', title: '普通场景', lines: ['保持原尺寸'] });
  const regularImage = await loadImage(regular);
  assert.equal(regularImage.width, 1200);
  assert.equal(regularImage.height, 900);
});

test('古墓夺宝菜单、五宝轮抽与三重诅咒总榜使用专用图片场景', async () => {
  const menuInput = {
    kind: 'tomb', title: '古墓夺宝', subtitle: '四席轮转摸金 · 三重诅咒审判', quote: '真正的目标是活着带走宝物。',
    tombScene: { mode: 'menu', format: 'normal', formatName: '玩法选择', gameNo: 0, maxGames: 1, round: 0, maxRounds: 8, lastAction: '每轮五件宝物，四人各取一件。', help: ['.古墓 人机 常规 / 耐久', '.古墓 开房 常规 / 耐久', '.古墓 教程 1'] }
  };
  let normalized = normalizeView(menuInput); assert.equal(normalized.tombScene.mode, 'menu'); assert.equal(normalized.tombScene.maxRounds, 8);
  let png = await renderView(menuInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'tomb-menu-preview.png'), png);

  const treasures = [
    ['暮金法老冠', 'crown', '传世', 4, 5, 0, 25], ['夜咒黑钻', 'gem', '传世', 1, 0, 4, 22],
    ['星砂寻宝仪', 'compass', '机关', 5, 4, 2, 7], ['驱虫圣香', 'jar', '稀有', 1, 2, 0, 8],
    ['风化旧册', 'book', '残旧', 0, 0, 0, 1]
  ].map((item, index) => ({ slot: index + 1, name: item[0], icon: item[1], rarity: item[2], weight: item[3], magic: item[4], scarabs: item[5], value: item[6] }));
  treasures[1].claimedById = 'QQ:2'; treasures[1].claimedByName = '姜修泽'; treasures[1].claimedOrder = 1;
  treasures[2].effectText = '下一轮高价值宝物更易出现';
  const players = [
    ['测试员', false, true, 6, 4, 3, 38, 52, 1], ['姜修泽', true, false, 8, 2, 1, 45, 21, 1],
    ['葛明治', true, false, 4, 7, 0, 22, 31, 1], ['阿日', true, false, 3, 2, 4, 40, 18, 0]
  ].map((player) => ({ name: player[0], isBot: player[1], isTurn: player[2], weight: player[3], magic: player[4], scarabs: player[5], value: player[6], extractedValue: player[7], survivals: player[8], status: '5/8件', bag: [] }));
  const draftInput = {
    kind: 'tomb', title: '古墓夺宝 · 耐久局', subtitle: '第2/4墓 · 第5/8轮', quote: '不要只看价值。',
    tombScene: { mode: 'playing', format: 'durable', formatName: '耐久局', gameNo: 2, maxGames: 4, round: 5, maxRounds: 8, currentName: '测试员', secondsRemaining: 47, order: ['测试员', '姜修泽', '葛明治', '阿日'], poolSize: 5, nextPoolSize: 5, treasures, players, lastAction: '第5轮宝物落地，测试员获得首选。', help: ['.古墓 拿 <序号>'] }
  };
  normalized = normalizeView(draftInput); assert.equal(normalized.tombScene.treasures.length, 5); assert.equal(normalized.tombScene.players.length, 4); assert.equal(normalized.tombScene.treasures[3].scarabs, 0); assert.equal(normalized.tombScene.treasures[3].magic, 2);
  assert.equal(normalized.tombScene.treasures[1].claimedByName, '姜修泽'); assert.equal(normalized.tombScene.treasures[2].effectText, '下一轮高价值宝物更易出现');
  png = await renderView(draftInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'tomb-table-preview.png'), png);

  const resultInput = {
    ...draftInput, title: '古墓夺宝 · 耐久局', subtitle: '最终审判完成', quote: '累计带出价值决定最终名次。',
    tombScene: {
      ...draftInput.tombScene, mode: 'finished', currentName: '', treasures: [], lastAction: '测试员以累计带出价值146排名第一。',
      settlement: { gameNo: 4, allDead: false, survivors: ['QQ:1'], stages: [
        { name: '超重塌方', detail: '姜修泽以18重量最高，被深渊吞没。', victims: ['QQ:2'] },
        { name: '法力反噬', detail: '葛明治以9法力冠绝余众，灵魂遭到反噬。', victims: ['QQ:3'] },
        { name: '万虫噬心', detail: '阿日的法力不足以压制圣甲虫。', victims: ['QQ:4'] }
      ] },
      ranking: [
        { rank: 1, name: '测试员', value: 146, survivals: 3, reward: 300, affectionDelta: 5 },
        { rank: 2, name: '姜修泽', value: 98, survivals: 2, reward: 100, affectionDelta: 2 },
        { rank: 3, name: '葛明治', value: 61, survivals: 2, reward: 0, affectionDelta: 0 },
        { rank: 4, name: '阿日', value: 20, survivals: 1, reward: 0, affectionDelta: -10 }
      ]
    }
  };
  png = await renderView(resultInput); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'tomb-result-preview.png'), png);
});

test('恶魔轮盘赌模式百科与实战盘面使用专用图片场景', async () => {
  const menu = { kind: 'demon', title: '恶魔轮盘赌', subtitle: '道具与符文百科', quote: '选择模式后创建房间。', demonScene: { mode: 'menu', menuTab: 'wiki', modes: [{ name: '经典', hp: [4, 4], desc: '标准规则，一切以此为基础。' }, { name: '薛定谔', hp: [5, 5], desc: '类似道具模式，但会有更多意外情况发生。' }], items: [{ name: '放大镜', desc: '查看当前子弹虚实，持续到开枪' }], runes: [{ name: '不死图腾', desc: '护身符破碎时血量+2' }] } };
  let normalized = normalizeView(menu); assert.equal(normalized.demonScene.mode, 'menu'); assert.equal(normalized.demonScene.menuTab, 'wiki'); assert.equal(normalized.demonScene.modes.length, 2); assert.equal(normalized.demonScene.runes[0].desc, '护身符破碎时血量+2');
  let png = await renderView(menu); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'demon-wiki-preview.png'), png);
  const botLogs = Array.from({ length: 18 }, (_, index) => `骰娘第${index + 1}步：${index % 2 ? '向恶魔测试员开枪' : '使用公开道具'}`);
  const table = { kind: 'demon', title: '恶魔轮盘赌 · 薛定谔', subtitle: '第3轮 · 当前：恶魔测试员', quote: '所有玩家的道具均为公开信息。', demonScene: { mode: 'playing', roomId: '3141', modeKey: '薛定谔', round: 3, turn: '恶魔测试员', shells: [1, 0, 1, 0], shellCount: 4, shellLive: 2, shellBlank: 2, glassActive: true, glassResult: '实弹', logTitle: '本次人机行动', rules: '类似道具模式，但会有更多意外情况发生。', players: [{ index: 1, name: '恶魔测试员', hp: 4, maxHp: 5, amulets: 1, items: ['放大镜', '锯子'], runes: ['清霜剑', '魔弹', '小丑牌'], current: true, dead: false, damage: 3, kills: 1 }, { index: 2, name: '骰娘', hp: 2, maxHp: 5, amulets: 0, items: ['花生', '香烟', '牛奶', '扑克', '红牛', '转盘', '巧克力'], runes: ['清霜剑', '魔弹', '小丑牌'], current: false, dead: false, damage: 1, kills: 0 }], logs: botLogs } };
  normalized = normalizeView(table); assert.equal(normalized.demonScene.players.length, 2); assert.deepEqual(normalized.demonScene.players[1].items, ['花生', '香烟', '牛奶', '扑克', '红牛', '转盘', '巧克力']); assert.equal(normalized.demonScene.logs.length, 18); assert.equal(normalized.demonScene.logTitle, '本次人机行动'); assert.deepEqual(normalized.demonScene.shells, [1, 0, 1, 0]); assert.equal(normalized.demonScene.glassActive, true); assert.equal(normalized.demonScene.glassResult, '实弹'); png = await renderView(table); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'demon-table-preview.png'), png);
});

test('赏金对决图片显示等级、地图事件与可见怪物AI情报', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'server.js'), 'utf8');
  assert.match(source, /bountyHunt: path\.join\(ASSET_DIR, 'bounty-hunt\.png'\)/);
  assert.match(source, /bountyResult: path\.join\(ASSET_DIR, 'bounty-result\.png'\)/);
  assert.match(source, /view\.bountyScene && view\.bountyScene\.mode === 'finished'/);
  const bossArea = ['F6', 'G6', 'H6', 'F7', 'G7', 'H7', 'F8', 'G8', 'H8'];
  const scene = { mode: 'playing', mapName: '灰岩矿镇·断脊镇', width: 13, height: 13, round: 8, maxRounds: 40, exits: ['A4'], clues: ['D4', 'G7', 'J10'], bossArea, activeEventCount: 4, aliveMonsterCount: 3, weather: 'fog',
    cells: Array.from({ length: 169 }, (_, index) => { const x = index % 13; const y = Math.floor(index / 13); const pos = `${String.fromCharCode(65 + x)}${y + 1}`; return { x, y, terrain: index === 70 ? 'F' : 'P', known: index === 70, marker: index === 70 ? 'self' : '', enemyCount: index === 98 ? 1 : 0, event: index === 81 ? 'relic' : '', eventMarker: index === 81 ? '特' : '', monster: index === 82 ? 'hound' : '', bossArea: bossArea.includes(pos), exit: index === 39, clue: index === 42 || index === 84 || index === 126, landmark: '' }; }),
    players: [{ name: '测试猎人', teamId: 1, level: 3, skillPoints: 7, fieldTraitCount: 2, fieldTraits: ['幽暗视界', '影步'], status: '存活', pos: 'F7', hp: 112, maxHp: 150, stamina: 2, weapon: '和平使者左轮', ammo: 4, reserve: 14, kills: 1, clues: 1 }, { name: 'Bot', teamId: 2, level: 1, skillPoints: 5, fieldTraitCount: 0, status: '存活', isBot: true }],
    events: [{ type: 'relic', name: '猎人遗物', pos: 'G7', state: 'active' }], monsters: [{ type: 'hound', name: '血猎犬', pos: 'H7', hp: 55, maxHp: 105, status: '追踪' }], publicEvents: ['其他猎人向远处开火'], ownLogs: ['受到怪物伤害（撕咬）：血猎犬造成48伤害，并附加流血。', '持续伤害（流血）：血猎犬造成10伤害。'], ownActions: [], help: ['.赏金 行动 移动C4|侦查'] };
  const normalized = normalizeView({ kind: 'bounty', title: '赏金对决', bountyScene: scene }); assert.equal(normalized.bountyScene.players[0].level, 3); assert.equal(normalized.bountyScene.cells[81].eventMarker, '特'); assert.equal(normalized.bountyScene.cells[98].enemyCount, 1); assert.equal(normalized.bountyScene.monsters[0].type, 'hound'); assert.deepEqual(normalized.bountyScene.clues, ['D4', 'G7', 'J10']); assert.deepEqual(normalized.bountyScene.bossArea, bossArea); assert.equal(normalized.bountyScene.cells.filter((cell) => cell.clue).length, 3); assert.equal(normalized.bountyScene.cells.filter((cell) => cell.bossArea).length, 9); assert.deepEqual(normalized.bountyScene.ownLogs, scene.ownLogs);
  const bountyBlock = source.slice(source.indexOf('function drawBountyScene('), source.indexOf('function drawWorkScene(')); assert.match(bountyBlock, /scene\.ownLogs/); assert.match(bountyBlock, /我的战报/); assert.doesNotMatch(bountyBlock, /scene\.publicEvents/);
  const png = await renderView({ kind: 'bounty', title: '赏金对决', subtitle: '事件与怪物阶段', quote: '私人战术图：幽暗视界已生效。', bountyScene: scene }); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'bounty-events-preview.png'), png);
  const image = await loadImage(png); const canvas = createCanvas(image.width, image.height); const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); const markerPixel = context.getImageData(306, 419, 1, 1).data;
  assert.ok(markerPixel[0] < 130 && markerPixel[1] > 190 && markerPixel[2] > 170, 'Boss范围标题不能覆盖自身的青绿色位置标记');
  const resultPng = await renderView({ kind: 'bounty', title: '赏金对决', subtitle: '撤离结算', quote: '雾散了，带着赏金活着离开。', bountyScene: { ...scene, mode: 'finished', round: 18, players: scene.players.map((player, index) => ({ ...player, status: index === 0 ? '赏金撤离' : '未能撤离', bounty: index === 0 })) } });
  assert.ok(resultPng.length > 50_000);
  assert.notEqual(require('node:crypto').createHash('sha256').update(resultPng).digest('hex'), require('node:crypto').createHash('sha256').update(png).digest('hex'));
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'bounty-result-preview.png'), resultPng);
  const soloScene = { ...scene, mode: 'playing', players: [{ ...scene.players[0], pos: 'C4', hp: 150, maxHp: 150, stamina: 3, weapon: '和平使者左轮', ammo: 6, reserve: 18, items: ['急救包', '猎刀'] }] };
  const soloNormalized = normalizeView({ kind: 'bounty', title: '赏金对决', bountyScene: soloScene });
  assert.equal(soloNormalized.bountyScene.players.length, 1);
  assert.equal(soloNormalized.bountyScene.players[0].pos, 'C4');
  const soloPng = await renderView({ kind: 'bounty', title: '赏金对决 · 单排PvE', subtitle: '私人战术图', quote: 'Bot位置隐藏；你的猎人已装备基础武器和道具。', bountyScene: soloScene });
  assert.ok(soloPng.length > 50_000);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'bounty-solo-preview.png'), soloPng);
});

test('赏金仓库居中展示且武器道具库使用分页表格', async () => {
  const warehouse = { kind: 'bounty', title: '赏金对决 · 猎人仓库', subtitle: '第1/1页 · 共2名猎人 · 当前余额500游戏币', quote: '', bountyScene: { mode: 'menu', menuMode: 'warehouse', menuTitle: '猎人仓库', menuNotice: '发送“.赏金 选择猎人 序号”切换当前猎人。', menuPage: 1, menuTotal: 1, menuEntries: [{ title: '1. 荒野新手', tag: '当前猎人', detail: 'HP 150/150 · 技能点5 · 和平使者左轮', extra: '道具：急救包、猎刀 · 特质：无', selected: true }, { title: '2. 夜行者', tag: 'Lv2', detail: 'HP 100/150 · 技能点6 · 莫辛91', extra: '道具：治疗针剂 · 特质：轻步' }] } };
  let png = await renderView(warehouse); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'bounty-warehouse-preview.png'), png);
  const weaponRows = Array.from({ length: 10 }, (_, index) => [String(index + 1), `测试武器${index + 1}`, index < 4 ? '短' : '长', String(60 + index * 5), '6/18', '67/79', '2', '1', String(35 + index * 10), '单动；逐发+2']);
  const weapon = { kind: 'bounty', title: '赏金对决 · 武器库', subtitle: '第1/4页', quote: '命中率栏为腰射/瞄准。', tutorial: { layout: 'table', page: 1, total: 4, columns: [['序', 42], ['武器', 160], ['弹', 46], ['伤害', 58], ['弹仓/备弹', 82], ['腰/瞄', 76], ['距', 44], ['格', 42], ['价格', 60], ['射击与装填', 190]], rows: weaponRows } };
  const normalized = normalizeView(weapon); assert.equal(normalized.tutorial.layout, 'table'); assert.equal(normalized.tutorial.rows.length, 10); png = await renderView(weapon); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'bounty-weapon-table-preview.png'), png);
  const item = { kind: 'bounty', title: '赏金对决 · 道具库', subtitle: '第1/2页', quote: '每名猎人最多携带4件道具。', tutorial: { layout: 'table', page: 1, total: 2, columns: [['序', 48], ['道具', 190], ['类别', 90], ['伤害/轻重击', 130], ['价格', 74], ['效果', 445]], rows: Array.from({ length: 8 }, (_, index) => [String(index + 1), `测试道具${index + 1}`, index < 3 ? '治疗' : '爆炸', index < 3 ? '—' : '180/90/30', String(20 + index * 10), '用于测试中央表格中的较长效果说明']) } };
  png = await renderView(item); assert.ok(png.length > 50_000); fs.writeFileSync(path.join(__dirname, '..', 'docs', 'bounty-item-table-preview.png'), png);
});
