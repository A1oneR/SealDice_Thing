'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 提取四只刀核心算法进行独立测试
const FOUR_KNIFE_SUITS = ['S', 'H', 'D', 'C'];
const FOUR_KNIFE_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const FOUR_KNIFE_PAIR_RANKS = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};
const FOUR_KNIFE_POINTS = {
  'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 0,
  'J': 0.5, 'Q': 0.5, 'K': 0.5
};

function makeCard(suit, rank) {
  return {
    suit,
    rank,
    text: `${suit}${rank}`,
    point: FOUR_KNIFE_POINTS[rank],
    pairRank: FOUR_KNIFE_PAIR_RANKS[rank]
  };
}

function fourKnifeEvalTwo(c1, c2) {
  if (!c1 || !c2) return { level: 0, text: '无', name: '无', score: 0, pairRank: 0, cards: [] };
  if (c1.rank === c2.rank) {
    const pr = c1.pairRank;
    return {
      level: 4,
      name: '对子',
      pairRank: pr,
      score: 100 + pr,
      text: `对子 ${c1.rank}-${c2.rank}`,
      cards: [c1, c2]
    };
  }
  const isFace1 = ['J', 'Q', 'K'].indexOf(c1.rank) >= 0;
  const isFace2 = ['J', 'Q', 'K'].indexOf(c2.rank) >= 0;
  if (isFace1 && isFace2 && c1.rank !== c2.rank) {
    return {
      level: 3,
      name: '罗梭',
      pairRank: 0,
      score: 50,
      text: `罗梭 (${c1.rank}+${c2.rank})`,
      cards: [c1, c2]
    };
  }
  let raw = (c1.point + c2.point) % 10;
  raw = Math.round(raw * 10) / 10;
  return {
    level: 2,
    name: `${raw}点`,
    pairRank: 0,
    score: raw,
    text: `${raw}点`,
    cards: [c1, c2]
  };
}

function fourKnifeCompareTwo(h1, h2) {
  if (!h1 || !h2) return 0;
  if (h1.level !== h2.level) return h1.level > h2.level ? 1 : -1;
  if (h1.level === 4) {
    if (h1.pairRank !== h2.pairRank) return h1.pairRank > h2.pairRank ? 1 : -1;
    return 0;
  }
  if (h1.level === 3) return 0;
  if (h1.level === 2) {
    if (h1.score !== h2.score) return h1.score > h2.score ? 1 : -1;
    return 0;
  }
  return 0;
}

function fourKnifeIsFoul(frontHand, backHand) {
  return fourKnifeCompareTwo(backHand, frontHand) < 0;
}

const FOUR_KNIFE_SPLIT_INDEXES = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
  [[1, 2], [0, 3]],
  [[1, 3], [0, 2]],
  [[2, 3], [0, 1]]
];

function fourKnifeFindSplits(cards) {
  if (!cards || cards.length < 4) return [];
  return FOUR_KNIFE_SPLIT_INDEXES.map((pair) => {
    const front = fourKnifeEvalTwo(cards[pair[0][0]], cards[pair[0][1]]);
    const back = fourKnifeEvalTwo(cards[pair[1][0]], cards[pair[1][1]]);
    const isFoul = fourKnifeIsFoul(front, back);
    const strength = (isFoul ? -9999 : 0) + (back.score * 1.5) + (front.score * 1.0);
    return {
      frontIndexes: pair[0],
      backIndexes: pair[1],
      front,
      back,
      isFoul,
      strength
    };
  });
}

function fourKnifeBestSplit(cards) {
  const splits = fourKnifeFindSplits(cards);
  const valid = splits.filter((s) => !s.isFoul);
  if (!valid.length) return splits[0];
  valid.sort((a, b) => b.strength - a.strength);
  return valid[0];
}

function fourKnifeIsFourOfAKind(cards) {
  if (!cards || cards.length < 4) return false;
  return cards[0].rank === cards[1].rank &&
         cards[1].rank === cards[2].rank &&
         cards[2].rank === cards[3].rank;
}

test('四只刀: 单牌点数与牌型评定', () => {
  // 对子测试
  const pairA = fourKnifeEvalTwo(makeCard('S', 'A'), makeCard('H', 'A'));
  assert.strictEqual(pairA.level, 4);
  assert.strictEqual(pairA.pairRank, 14);

  const pairK = fourKnifeEvalTwo(makeCard('S', 'K'), makeCard('D', 'K'));
  assert.strictEqual(pairK.level, 4);
  assert.strictEqual(pairK.pairRank, 13);
  assert.strictEqual(fourKnifeCompareTwo(pairA, pairK), 1);

  const pair2 = fourKnifeEvalTwo(makeCard('S', '2'), makeCard('C', '2'));
  assert.strictEqual(pair2.level, 4);
  assert.strictEqual(fourKnifeCompareTwo(pairK, pair2), 1);

  // 罗梭测试
  const luo1 = fourKnifeEvalTwo(makeCard('S', 'J'), makeCard('H', 'Q'));
  const luo2 = fourKnifeEvalTwo(makeCard('D', 'K'), makeCard('C', 'J'));
  assert.strictEqual(luo1.level, 3);
  assert.strictEqual(luo2.level, 3);
  assert.strictEqual(fourKnifeCompareTwo(luo1, luo2), 0, '罗梭相互等大');

  // 对子 > 罗梭
  assert.strictEqual(fourKnifeCompareTwo(pair2, luo1), 1);

  // 罗梭 > 点数牌 (哪怕是 9.5 点)
  const pts9_5 = fourKnifeEvalTwo(makeCard('S', '9'), makeCard('H', 'K')); // 9 + 0.5 = 9.5
  assert.strictEqual(pts9_5.level, 2);
  assert.strictEqual(pts9_5.score, 9.5);
  assert.strictEqual(fourKnifeCompareTwo(luo1, pts9_5), 1);

  // 点数牌大小
  const pts8_5 = fourKnifeEvalTwo(makeCard('S', '8'), makeCard('H', 'K')); // 8.5
  assert.strictEqual(fourKnifeCompareTwo(pts9_5, pts8_5), 1);

  const pts0 = fourKnifeEvalTwo(makeCard('S', '10'), makeCard('H', '10')); // 10+10 是对子
  assert.strictEqual(pts0.level, 4, '两张10是对子');

  const pts10_other = fourKnifeEvalTwo(makeCard('S', '10'), makeCard('H', 'A')); // 0 + 1 = 1
  assert.strictEqual(pts10_other.score, 1);
});

test('四只刀: 相公/倒水判定', () => {
  // 后墩对子，前墩罗梭 -> 合法
  const frontLuo = fourKnifeEvalTwo(makeCard('S', 'J'), makeCard('H', 'Q'));
  const backPair = fourKnifeEvalTwo(makeCard('S', '3'), makeCard('H', '3'));
  assert.strictEqual(fourKnifeIsFoul(frontLuo, backPair), false);

  // 前墩对子，后墩罗梭 -> 相公 (Back < Front)
  assert.strictEqual(fourKnifeIsFoul(backPair, frontLuo), true);

  // 前墩 9.5 点，后墩 8.5 点 -> 相公
  const h95 = fourKnifeEvalTwo(makeCard('S', '9'), makeCard('H', 'K'));
  const h85 = fourKnifeEvalTwo(makeCard('S', '8'), makeCard('H', 'K'));
  assert.strictEqual(fourKnifeIsFoul(h95, h85), true);

  // 前后墩等大 -> 合法 (双罗梭 或 同点数)
  const luoA = fourKnifeEvalTwo(makeCard('S', 'J'), makeCard('H', 'Q'));
  const luoB = fourKnifeEvalTwo(makeCard('D', 'Q'), makeCard('C', 'K'));
  assert.strictEqual(fourKnifeIsFoul(luoA, luoB), false);
});

test('四只刀: 四支刀特殊起手牌', () => {
  const cards = [makeCard('S', '8'), makeCard('H', '8'), makeCard('D', '8'), makeCard('C', '8')];
  assert.strictEqual(fourKnifeIsFourOfAKind(cards), true);

  const cards2 = [makeCard('S', '8'), makeCard('H', '8'), makeCard('D', '8'), makeCard('C', '7')];
  assert.strictEqual(fourKnifeIsFourOfAKind(cards2), false);
});

test('四只刀: 智能刁牌算法', () => {
  // 手牌：♠A, ♥A, ♦K, ♣9 (对A + 9.5点)
  const cards = [makeCard('S', 'A'), makeCard('H', 'A'), makeCard('D', 'K'), makeCard('C', '9')];
  const best = fourKnifeBestSplit(cards);
  assert.strictEqual(best.isFoul, false, '推荐拆牌不能相公');
  assert.strictEqual(best.back.level, 4, '后墩应为对A');
  assert.strictEqual(best.front.score, 9.5, '前墩应为9.5点');
});

function createTestHarness() {
  const pluginPath = path.join(__dirname, '..', '骰娘好感度小游戏合集2.js');
  const code = fs.readFileSync(pluginPath, 'utf8');
  const extensions = new Map();
  const storage = new Map();
  const replies = [];
  let keyboardData = null;
  const configs = new Map([['启用官方Bot按钮', true], ['启用图片输出', false]]);
  const seal = {
    ext: {
      find: (n) => extensions.get(n) || null,
      new: (name, author, version) => {
        const ext = {
          name, author, version, cmdMap: {},
          storageGet: (k) => storage.get(k) || '',
          storageSet: (k, v) => storage.set(k, String(v))
        };
        extensions.set(name, ext);
        return ext;
      },
      register: (ext) => { extensions.set(ext.name, ext); },
      newCmdItemInfo: () => ({}),
      newCmdExecuteResult: (s) => ({ solved: s }),
      registerIntConfig: () => {},
      registerStringConfig: () => {},
      registerBoolConfig: () => {},
      registerOptionConfig: () => {},
      registerTemplateConfig: () => {},
      registerTask: () => {},
      getIntConfig: (e, k) => configs.get(k) || 100,
      getStringConfig: (e, k) => configs.get(k) || '',
      getBoolConfig: (e, k) => configs.get(k) !== undefined ? configs.get(k) : true,
      getOptionConfig: (e, k) => configs.get(k) || '',
      getTemplateConfig: (e, k) => configs.get(k) || ''
    },
    replyToSender: (ctx, msg, text) => replies.push({ mode: 'sender', text }),
    replyPerson: (ctx, msg, text) => replies.push({ mode: 'private', text }),
    replyToSenderWithKeyboard: (ctx, msg, text, kb) => { replies.push({ mode: 'sender', text }); keyboardData = kb; },
    replyPersonWithKeyboard: (ctx, msg, text, kb) => { replies.push({ mode: 'private', text }); keyboardData = kb; },
    base64ToImage: () => '[image]',
    format: (ctx, text) => text
  };
  const ctx = { seal, console, setTimeout, clearTimeout, Math, Date, fetch: async () => { throw new Error('no fetch'); } };
  vm.runInNewContext(code, ctx);
  const ext = extensions.get('骰娘好感度（小游戏合集）');

  async function run(cmd, args) {
    const mCtx = { player: { userId: 'QQ:1001', name: '玩家' }, group: { groupId: 'QQ-Group:2001' }, isPrivate: false };
    const msg = { sender: { userId: 'QQ:1001', nickname: '玩家' }, messageType: 'group', groupId: 'QQ-Group:2001' };
    const cmdArgs = { command: cmd, args, at: [], getArgN: (n) => args[n - 1] || '' };
    await ext.cmdMap[cmd].solve(mCtx, msg, cmdArgs);
  }

  return { run, storage, replies, getKeyboard: () => keyboardData };
}

test('四只刀: PvE 人机模式人类玩家弃牌即淘汰出局，清空房间且按钮为人机指令', async () => {
  const harness = createTestHarness();
  await harness.run('yan', ['注册', '测试玩家']);
  const prof = JSON.parse(harness.storage.get('aff.profile.v1:QQ%3A1001'));
  prof.coins = 1000;
  harness.storage.set('aff.profile.v1:QQ%3A1001', JSON.stringify(prof));

  await harness.run('四只刀', ['人机']);
  await harness.run('四只刀', ['刁牌', '智能']);
  await harness.run('四只刀', ['弃牌']);

  const roomAfter = harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001');
  assert.strictEqual(roomAfter, '', '淘汰出局后房间应直接清除');

  const kb = harness.getKeyboard();
  assert.ok(kb && kb.content && kb.content.rows, '应返回官方Bot键盘');
  const firstButton = kb.content.rows[0].buttons[0];
  assert.strictEqual(firstButton.render_data.label, '🤖 重新开始', '弃牌出局后按钮应为重新开始人机');
  assert.strictEqual(firstButton.action.data, '.yan 四只刀 人机', '按钮指令应为人机模式启动指令');

  // 验证重新开局不积累赌池
  await harness.run('四只刀', ['人机']);
  const newRoom = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001'));
  assert.strictEqual(newRoom.carryPot, 0, '重新开局不积累赌池');
  assert.strictEqual(newRoom.pot, 400, '新对局底池恢复标准4人底注');
  assert.strictEqual(newRoom.round, 1, '局数重置为第1局');
});

test('四只刀: PvE 人机模式平局拿墩进入延长赛且滚存，未拿墩淘汰出局清空房间', async () => {
  const harness = createTestHarness();
  await harness.run('yan', ['注册', '测试玩家']);
  const prof = JSON.parse(harness.storage.get('aff.profile.v1:QQ%3A1001'));
  prof.coins = 10000;
  harness.storage.set('aff.profile.v1:QQ%3A1001', JSON.stringify(prof));

  // 1. 测试平局拿墩 (人类玩家拿前墩，机器人拿后墩) -> 延长赛滚存
  await harness.run('四只刀', ['人机']);
  const room = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001'));
  room.players[0].cards = [
    { suit: 'S', rank: '8', text: '♠8', point: 8, pairRank: 8 },
    { suit: 'H', rank: '8', text: '♥8', point: 8, pairRank: 8 },
    { suit: 'D', rank: '9', text: '♦9', point: 9, pairRank: 9 },
    { suit: 'C', rank: '9', text: '♣9', point: 9, pairRank: 9 }
  ];
  room.players[1].cards = [
    { suit: 'S', rank: '7', text: '♠7', point: 7, pairRank: 7 },
    { suit: 'H', rank: '7', text: '♥7', point: 7, pairRank: 7 },
    { suit: 'D', rank: '10', text: '♦10', point: 0, pairRank: 10 },
    { suit: 'C', rank: '10', text: '♣10', point: 0, pairRank: 10 }
  ];
  room.players[1].front = [room.players[1].cards[0], room.players[1].cards[1]];
  room.players[1].back = [room.players[1].cards[2], room.players[1].cards[3]];
  room.players[1].frontHand = { level: 4, name: '对子', pairRank: 7, score: 107, text: '对子 7-7' };
  room.players[1].backHand = { level: 4, name: '对子', pairRank: 10, score: 110, text: '对子 10-10' };

  for (let i = 2; i < 4; i++) {
    room.players[i].cards = [
      { suit: 'S', rank: '2', text: '♠2', point: 2, pairRank: 2 },
      { suit: 'H', rank: '3', text: '♥3', point: 3, pairRank: 3 },
      { suit: 'D', rank: '2', text: '♦2', point: 2, pairRank: 2 },
      { suit: 'C', rank: '4', text: '♣4', point: 4, pairRank: 4 }
    ];
    room.players[i].front = [room.players[i].cards[0], room.players[i].cards[1]];
    room.players[i].back = [room.players[i].cards[2], room.players[i].cards[3]];
    room.players[i].frontHand = { level: 2, name: '5点', pairRank: 0, score: 5, text: '5点' };
    room.players[i].backHand = { level: 2, name: '6点', pairRank: 0, score: 6, text: '6点' };
  }
  harness.storage.set('aff.room.v1:fourKnife:QQ-Group%3A2001', JSON.stringify(room));

  await harness.run('四只刀', ['刁牌', '智能']);
  let cur = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001') || '{}');
  let guard = 0;
  while (cur.status === 'betting' && guard++ < 10) {
    await harness.run('四只刀', ['跟注']);
    cur = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001') || '{}');
  }

  const tiedRoom = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001') || '{}');
  assert.strictEqual(tiedRoom.isRollover, true, '人类拿墩平手应触发延长赛');
  assert.ok(tiedRoom.carryPot >= 400, '平局底池（含下注）全额滚存');
  assert.strictEqual(tiedRoom.players[0].isLeader, true, '人类玩家应为平手领跑者');

  const kbTied = harness.getKeyboard();
  const nextBtn = kbTied.content.rows[0].buttons[0];
  const resetBtn = kbTied.content.rows[0].buttons[1];
  assert.strictEqual(nextBtn.render_data.label, '🔥 延长赛/决胜', '平局时应给予延长赛按钮');
  assert.strictEqual(nextBtn.action.data, '.yan 四只刀 下一局', '延长赛按钮应触发下一局指令');
  assert.strictEqual(resetBtn.render_data.label, '🤖 重新开局', '平局时备选按钮应为人机指令而非开房');
  assert.strictEqual(resetBtn.action.data, '.yan 四只刀 人机', '备选指令应为人机启动');

  // 2. 测试人类玩家未拿任何一墩 (机器人分别拿前墩与后墩，人类落败) -> 淘汰出局直接清房
  await harness.run('四只刀', ['人机']);
  const room2 = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001'));
  // 人类弱牌：2+3=5点，2+4=6点
  room2.players[0].cards = [
    { suit: 'S', rank: '2', text: '♠2', point: 2, pairRank: 2 },
    { suit: 'H', rank: '3', text: '♥3', point: 3, pairRank: 3 },
    { suit: 'D', rank: '2', text: '♦2', point: 2, pairRank: 2 },
    { suit: 'C', rank: '4', text: '♣4', point: 4, pairRank: 4 }
  ];
  // 机器人1对7前墩，机器人2对10后墩
  room2.players[1].cards = [
    { suit: 'S', rank: '7', text: '♠7', point: 7, pairRank: 7 },
    { suit: 'H', rank: '7', text: '♥7', point: 7, pairRank: 7 },
    { suit: 'D', rank: '9', text: '♦9', point: 9, pairRank: 9 },
    { suit: 'C', rank: '9', text: '♣9', point: 9, pairRank: 9 }
  ];
  room2.players[1].front = [room2.players[1].cards[0], room2.players[1].cards[1]];
  room2.players[1].back = [room2.players[1].cards[2], room2.players[1].cards[3]];
  room2.players[1].frontHand = { level: 4, name: '对子', pairRank: 7, score: 107, text: '对子 7-7' };
  room2.players[1].backHand = { level: 4, name: '对子', pairRank: 9, score: 109, text: '对子 9-9' };

  room2.players[2].cards = [
    { suit: 'S', rank: '8', text: '♠8', point: 8, pairRank: 8 },
    { suit: 'H', rank: '8', text: '♥8', point: 8, pairRank: 8 },
    { suit: 'D', rank: '10', text: '♦10', point: 0, pairRank: 10 },
    { suit: 'C', rank: '10', text: '♣10', point: 0, pairRank: 10 }
  ];
  room2.players[2].front = [room2.players[2].cards[0], room2.players[2].cards[1]];
  room2.players[2].back = [room2.players[2].cards[2], room2.players[2].cards[3]];
  room2.players[2].frontHand = { level: 4, name: '对子', pairRank: 8, score: 108, text: '对子 8-8' };
  room2.players[2].backHand = { level: 4, name: '对子', pairRank: 10, score: 110, text: '对子 10-10' };

  harness.storage.set('aff.room.v1:fourKnife:QQ-Group%3A2001', JSON.stringify(room2));
  await harness.run('四只刀', ['刁牌', '智能']);

  cur = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001') || '{}');
  guard = 0;
  while (cur.status === 'betting' && guard++ < 10) {
    await harness.run('四只刀', ['跟注']);
    cur = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001') || '{}');
  }

  const roomAfterElim = harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001');
  assert.strictEqual(roomAfterElim, '', '人类玩家未能拿墩淘汰出局后房间应直接清除');
  const kbElim = harness.getKeyboard();
  const restartBtn = kbElim.content.rows[0].buttons[0];
  assert.strictEqual(restartBtn.render_data.label, '🤖 重新开始', '淘汰出局后首个按钮为重新开始');
  assert.strictEqual(restartBtn.action.data, '.yan 四只刀 人机', '按钮指令为四只刀人机');
});

test('四只刀: 下注上限500游戏币限制、真实扣币与余额不足拦截', async () => {
  const harness = createTestHarness();
  await harness.run('yan', ['注册', '押注测试玩家']);
  let prof = JSON.parse(harness.storage.get('aff.profile.v1:QQ%3A1001'));
  prof.coins = 300; // 余额300，入场扣除100后剩余200
  harness.storage.set('aff.profile.v1:QQ%3A1001', JSON.stringify(prof));

  await harness.run('四只刀', ['人机']);
  prof = JSON.parse(harness.storage.get('aff.profile.v1:QQ%3A1001'));
  assert.strictEqual(prof.coins, 200, '入场扣除100游戏币');

  await harness.run('四只刀', ['刁牌', '智能']);

  // 测试加注超出余额被拦截
  await harness.run('四只刀', ['加注', '300']);
  const lastReply = harness.replies[harness.replies.length - 1];
  assert.ok(lastReply.text.includes('游戏币不足') || lastReply.text.includes('需要 300 游戏币'), '余额不足应拦截加注');

  // 充值充裕资金进行500上限测试
  prof.coins = 10000;
  harness.storage.set('aff.profile.v1:QQ%3A1001', JSON.stringify(prof));

  // 人类尝试超额加注 600，验证上限自动限制为 500
  // 设置房间最高注为 500，且轮到人类行动
  let room = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001'));
  room.highestBet = 500;
  room.players[0].currentBet = 500;
  room.currentTurn = 0;
  harness.storage.set('aff.room.v1:fourKnife:QQ-Group%3A2001', JSON.stringify(room));

  // 达到500上限后继续尝试加注应当被阻止
  await harness.run('四只刀', ['加注', '50']);
  const replyAtMax = harness.replies[harness.replies.length - 1];
  assert.ok(replyAtMax.text.includes('当前下注已达上限 500 游戏币，无法继续加注'), '达到500后禁止加注');

  // 达到500上限后继续尝试全押也应当被阻止
  await harness.run('四只刀', ['全押']);
  const replyAllinAtMax = harness.replies[harness.replies.length - 1];
  assert.ok(replyAllinAtMax.text.includes('当前下注已达上限 500 游戏币，无法继续全押'), '达到500后禁止全押');
});

test('四只刀: 独赢通吃好感与游戏币结算提示', async () => {
  const harness = createTestHarness();
  await harness.run('yan', ['注册', '赢家玩家']);
  let prof = JSON.parse(harness.storage.get('aff.profile.v1:QQ%3A1001'));
  prof.coins = 5000;
  const initialAff = prof.affection;
  harness.storage.set('aff.profile.v1:QQ%3A1001', JSON.stringify(prof));

  await harness.run('四只刀', ['人机']);
  // 人类拥有绝杀牌型：前墩对K，后墩对A
  const room = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001'));
  room.players[0].cards = [
    { suit: 'S', rank: 'K', text: '♠K', point: 0.5, pairRank: 13 },
    { suit: 'H', rank: 'K', text: '♥K', point: 0.5, pairRank: 13 },
    { suit: 'D', rank: 'A', text: '♦A', point: 1, pairRank: 14 },
    { suit: 'C', rank: 'A', text: '♣A', point: 1, pairRank: 14 }
  ];
  // 机器人的牌都较小
  for (let i = 1; i < 4; i++) {
    room.players[i].cards = [
      { suit: 'S', rank: '2', text: '♠2', point: 2, pairRank: 2 },
      { suit: 'H', rank: '3', text: '♥3', point: 3, pairRank: 3 },
      { suit: 'D', rank: '4', text: '♦4', point: 4, pairRank: 4 },
      { suit: 'C', rank: '5', text: '♣5', point: 5, pairRank: 5 }
    ];
    room.players[i].front = [room.players[i].cards[0], room.players[i].cards[1]];
    room.players[i].back = [room.players[i].cards[2], room.players[i].cards[3]];
    room.players[i].frontHand = { level: 2, name: '5点', pairRank: 0, score: 5, text: '5点' };
    room.players[i].backHand = { level: 2, name: '9点', pairRank: 0, score: 9, text: '9点' };
  }
  harness.storage.set('aff.room.v1:fourKnife:QQ-Group%3A2001', JSON.stringify(room));

  await harness.run('四只刀', ['刁牌', '智能']);

  let cur = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001') || '{}');
  let guard = 0;
  while (cur.status === 'betting' && guard++ < 10) {
    await harness.run('四只刀', ['过牌']);
    cur = JSON.parse(harness.storage.get('aff.room.v1:fourKnife:QQ-Group%3A2001') || '{}');
  }

  // 检查结算档案
  prof = JSON.parse(harness.storage.get('aff.profile.v1:QQ%3A1001'));
  assert.ok(prof.affection > initialAff, '独赢胜利好感度增加');
  assert.ok(prof.coins > 5000, '独赢通吃获得彩池游戏币');

  // 检查输出提示文本包含结算获得游戏币与增加好感度
  const winReply = harness.replies[harness.replies.length - 1].text;
  assert.ok(winReply.includes('【结算】') && winReply.includes('独赢通吃'), '输出应包含【结算】与独赢通吃');
  assert.ok(winReply.includes('获得') && winReply.includes('游戏币'), '应提示获得多少游戏币');
  assert.ok(winReply.includes('好感度增加'), '应提示好感度增加');
});

test('四只刀: 弃牌与落败好感扣除与损失提示', async () => {
  const harness = createTestHarness();
  await harness.run('yan', ['注册', '落败测试玩家']);
  let prof = JSON.parse(harness.storage.get('aff.profile.v1:QQ%3A1001'));
  prof.coins = 5000;
  const initialAff = prof.affection;
  harness.storage.set('aff.profile.v1:QQ%3A1001', JSON.stringify(prof));

  await harness.run('四只刀', ['人机']);
  await harness.run('四只刀', ['刁牌', '智能']);
  await harness.run('四只刀', ['弃牌']);

  prof = JSON.parse(harness.storage.get('aff.profile.v1:QQ%3A1001'));
  assert.ok(prof.affection < initialAff, '弃牌淘汰好感度扣除');
  assert.strictEqual(prof.coins, 5000 - 100, '扣除入场底注100');

  const foldReply = harness.replies[harness.replies.length - 1].text;
  assert.ok(foldReply.includes('【结算】'), '弃牌出局应包含【结算】');
  assert.ok(foldReply.includes('扣除投入 100 游戏币'), '应提示扣除投入多少游戏币');
  assert.ok(foldReply.includes('好感度减少'), '应提示好感度减少');
});

console.log('四只刀单元测试准备就绪');

