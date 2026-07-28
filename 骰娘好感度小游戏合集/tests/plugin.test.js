'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness(options = {}) {
  const extensions = new Map();
  const replies = [];
  const configs = new Map();
  const templates = new Map();
  const tasks = [];
  const clock = { now: options.now == null ? Date.now() : Number(options.now) };
  class HarnessDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }

  function makeExt(name, author, version) {
    const storage = new Map();
    return {
      name, author, version, cmdMap: {}, storage,
      storageGet(key) { return storage.get(key) || ''; },
      storageSet(key, value) { storage.set(key, value == null ? '' : String(value)); }
    };
  }

  const seal = {
    ext: {
      find: (name) => extensions.get(name) || null,
      new: makeExt,
      register(ext) { extensions.set(ext.name, ext); },
      newCmdItemInfo: () => ({}),
      newCmdExecuteResult: (solved) => ({ solved, showHelp: false }),
      registerIntConfig(ext, key, value) { if (!configs.has(key)) configs.set(key, value); },
      registerStringConfig(ext, key, value) { if (!configs.has(key)) configs.set(key, value); },
      registerBoolConfig(ext, key, value) { if (!configs.has(key)) configs.set(key, value); },
      registerOptionConfig(ext, key, value) { if (!configs.has(key)) configs.set(key, value); },
      registerTemplateConfig(ext, key, value) { if (!templates.has(key)) templates.set(key, value); },
      registerTask(ext, type, schedule, callback, key, description) { tasks.push({ ext, type, schedule, callback, key, description }); },
      getIntConfig: (ext, key) => configs.get(key),
      getStringConfig: (ext, key) => configs.get(key),
      getBoolConfig: (ext, key) => configs.get(key),
      getOptionConfig: (ext, key) => configs.get(key),
      getTemplateConfig: (ext, key) => templates.get(key)
    },
    replyToSender(ctx, msg, text) { replies.push({ mode: 'sender', text }); },
    replyPerson(ctx, msg, text) { replies.push({ mode: 'private', text }); },
    base64ToImage() { return '[native-image-placeholder]'; },
    format(ctx, text) {
      if (!ctx) throw new Error('seal.format requires a non-null ctx');
      return text;
    }
  };

  const pluginPath = path.join(__dirname, '..', '骰娘好感度小游戏合集.js');
  const code = fs.readFileSync(pluginPath, 'utf8');
  const fetchImpl = options.fetch || (async () => { throw new Error('fetch should be disabled in tests'); });
  const math = Object.create(Math);
  if (typeof options.random === 'function') math.random = options.random;
  vm.runInNewContext(code, { seal, console, setTimeout, clearTimeout, fetch: fetchImpl, Math: math, Date: HarnessDate }, { filename: pluginPath });
  configs.set('启用图片输出', false);
  const ext = extensions.get('骰娘好感度（小游戏合集）');

  async function dispatch(command, args = [], user = { id: 'QQ:1001', name: '测试员' }, group = 'QQ-Group:2001', privateMessage = false) {
    const ctx = {
      player: { userId: user.id, name: user.name },
      group: privateMessage ? null : { groupId: group }, isPrivate: privateMessage
    };
    const msg = { sender: { userId: user.id, nickname: user.name }, messageType: privateMessage ? 'private' : 'group', groupId: privateMessage ? '' : group };
    const cmdArgs = { command, args, at: [], getArgN(n) { return args[n - 1] || ''; } };
    const before = replies.length;
    await ext.cmdMap[command].solve(ctx, msg, cmdArgs);
    return replies.slice(before);
  }

  async function run(command, args = [], user = { id: 'QQ:1001', name: '测试员' }, group = 'QQ-Group:2001') {
    if (options.autoRegister !== false && command !== '注册' && !(command === 'yan' && args[0] === '注册')) {
      const profile = storedJson(`aff.profile.v1:${encodeURIComponent(user.id)}`);
      if (!profile || !profile.registered) await dispatch('yan', ['注册', user.name], user, group);
    }
    return dispatch(command, args, user, group);
  }

  async function runPrivate(command, args = [], user = { id: 'QQ:1001', name: '测试员' }) {
    if (options.autoRegister !== false && command !== '注册' && !(command === 'yan' && args[0] === '注册')) {
      const profile = storedJson(`aff.profile.v1:${encodeURIComponent(user.id)}`);
      if (!profile || !profile.registered) await dispatch('yan', ['注册', user.name], user, 'QQ-Group:2001');
    }
    return dispatch(command, args, user, '', true);
  }

  function storedJson(key) {
    const raw = ext.storageGet(key);
    return raw ? JSON.parse(raw) : null;
  }

  return { seal, ext, configs, templates, replies, tasks, clock, run, runPrivate, runRaw: dispatch, storedJson };
}

async function setProfileCoins(h, user, coins, group = 'QQ-Group:2001') {
  await h.run('yan', ['我的'], user, group);
  const key = `aff.profile.v1:${encodeURIComponent(user.id)}`;
  const profile = h.storedJson(key); profile.coins = coins;
  h.ext.storageSet(key, JSON.stringify(profile));
  return key;
}

function assertGameStatsUntouched(profile, game) {
  const stats = profile.stats[game];
  assert.equal(profile.coins, 0);
  assert.equal(profile.affection, 0);
  assert.equal(stats.plays, 0);
  assert.equal(stats.wins, 0);
  assert.equal(stats.losses, 0);
  assert.equal(stats.draws, 0);
  assert.equal(stats.score, 0);
  assert.equal(stats.best, 0);
  assert.equal(stats.profit, 0);
  assert.equal(stats.affection, 0);
  assert.equal(stats.affectionGained, 0);
  assert.equal(stats.affectionLost, 0);
}

test('新玩家必须先注册且登记名不会被群名片覆盖', async () => {
  const h = createHarness({ autoRegister: false });
  const blocked = await h.runRaw('yan', ['签到']);
  assert.match(blocked[0].text, /\.yan 注册 <名字>/);
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`), null);

  const tooLong = await h.runRaw('yan', ['注册', '一二三四五六七八九十']);
  assert.match(tooLong[0].text, /不能超过9个字/);
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`), null);

  await h.runRaw('yan', ['注册', '小颜']);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.registered, true);
  assert.equal(profile.name, '小颜');

  await h.runRaw('yan', ['德州', '人机'], { id: 'QQ:1001', name: '变化后的群名片' });
  let room = h.storedJson(`aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.players.find((p) => !p.isBot).name, '小颜');
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`).name, '小颜');

  const invalidRename = await h.runRaw('yan', ['改名', '一二三四五六七八九十']);
  assert.match(invalidRename[0].text, /不能超过9个字/);
  await h.runRaw('yan', ['改名', '新名字']);
  room = h.storedJson(`aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.players.find((p) => !p.isBot).name, '新名字');
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`).name, '新名字');
});

test('旧版本已有名字的档案会自动迁移为已注册', async () => {
  const h = createHarness({ autoRegister: false });
  const key = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  h.ext.storageSet(key, JSON.stringify({ id: 'QQ:1001', name: '旧档案名', coins: 321, affection: 45, stats: {} }));
  const result = await h.runRaw('yan', ['我的'], { id: 'QQ:1001', name: '新群名片' });
  const migrated = h.storedJson(key);
  assert.equal(migrated.registered, true);
  assert.equal(migrated.name, '旧档案名');
  assert.match(result[0].text, /旧档案名/);
});

test('档案文案支持好感与金币的九宫格判别', async () => {
  const h = createHarness();
  await h.run('yan', ['我的']);
  const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  const cases = [
    [-1, 99, '低好感_低金币'], [-1, 500, '低好感_普通金币'], [-1, 2000, '低好感_高金币'],
    [0, 99, '普通好感_低金币'], [0, 500, '普通好感_普通金币'], [0, 2000, '普通好感_高金币'],
    [700, 99, '高好感_低金币'], [700, 500, '高好感_普通金币'], [700, 2000, '高好感_高金币']
  ];
  for (const [affection, coins, suffix] of cases) {
    h.templates.set(`文案_判别_${suffix}`, [`命中:${suffix}:{name}:{affection}:{coins}:{relation}`]);
    const profile = h.storedJson(profileKey);
    profile.affection = affection;
    profile.coins = coins;
    h.ext.storageSet(profileKey, JSON.stringify(profile));
    const result = await h.run('yan', ['我的']);
    assert.match(result[0].text, new RegExp(`命中:${suffix}:测试员:${affection}:${coins}:`));
  }
});

test('Template配置新增的多个条目会动态随机抽取且避免连续重复', async () => {
  let randomValue = 0;
  const h = createHarness({ autoRegister: false, random: () => randomValue });
  await h.runRaw('yan', ['注册', '随机文案员']);
  const key = '文案_判别_普通好感_普通金币';
  h.templates.set(key, ['第一条:{name}', '', '第二条:{coins}', '第三条:{relation}']);

  randomValue = 0;
  const first = await h.runRaw('yan', ['我的']);
  assert.match(first[0].text, /第一条:随机文案员/);

  randomValue = 0;
  const second = await h.runRaw('yan', ['我的']);
  assert.match(second[0].text, /第二条:500/);
  assert.doesNotMatch(second[0].text, /第一条:/, '存在其他候选时不应连续重复上一条文案');

  randomValue = 0.99;
  const third = await h.runRaw('yan', ['我的']);
  assert.match(third[0].text, /第三条:初见/);

  h.templates.set(key, ['保存后新增:{name}']);
  const updated = await h.runRaw('yan', ['我的']);
  assert.match(updated[0].text, /保存后新增:随机文案员/, '每次调用都应读取WebUI最新保存的候选列表');

  h.templates.set(key, ['%0%绝不出现', '%50%带权重:{name}']);
  const weighted = await h.runRaw('yan', ['我的']);
  assert.match(weighted[0].text, /带权重:随机文案员/);
  assert.doesNotMatch(weighted[0].text, /%50%|绝不出现/);

  h.templates.set(key, ['%50%低权重', '%150%高权重']);
  randomValue = 0.1;
  const lowWeight = await h.runRaw('yan', ['我的']);
  assert.match(lowWeight[0].text, /低权重/);
  randomValue = 0.9;
  const highWeight = await h.runRaw('yan', ['我的']);
  assert.match(highWeight[0].text, /高权重/);
});

test('签到与赠礼发送专用图片数据且重复签到不重复奖励', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '礼物测试员']);
  h.configs.set('启用图片输出', true);

  await h.run('yan', ['签到']);
  await h.run('yan', ['签到']);
  await h.run('yan', ['投喂']);
  await h.run('yan', ['投喂', '蛋糕']);

  assert.equal(views[0].kind, 'daily');
  assert.equal(views[0].dailyScene.status, 'claimed');
  assert.equal(views[0].dailyScene.coinsReward, 100);
  assert.equal(views[1].dailyScene.status, 'already');
  assert.equal(views[2].kind, 'gift');
  assert.equal(views[2].giftScene.mode, 'menu');
  assert.equal(views[2].giftScene.gifts.length, 24);
  assert.deepEqual(Array.from(new Set(views[2].giftScene.gifts.map((gift) => gift.category))).sort(), ['家具', '甜食', '生活用品', '零食', '饮品', '餐点'].sort());
  assert.equal(views[3].giftScene.mode, 'result');
  assert.equal(views[3].giftScene.category, '甜食');
  assert.equal(views[3].giftScene.item, '蛋糕');

  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.coins, 480, '签到只发放一次，之后扣除蛋糕120币');
  assert.equal(profile.affection, 15, '签到增加5，蛋糕增加10');
});

test('投喂文案支持分类、好感和礼物条件且具体条件优先', async () => {
  const h = createHarness();
  h.templates.set('文案_投喂', [
    '分类=甜食::甜食单条件:{item}:{category}',
    '好感=高::高好感单条件:{item}',
    '%50%分类=甜食;好感=高::双条件优先:{item}:{好感}',
    '礼物=牛奶;好感=低::低好感牛奶:{name}',
    '通用回退:{item}:{relation}'
  ]);
  const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  await h.run('yan', ['我的']);

  let profile = h.storedJson(profileKey); profile.coins = 5000; profile.affection = 700;
  h.ext.storageSet(profileKey, JSON.stringify(profile));
  let result = await h.run('yan', ['投喂', '蛋糕']);
  assert.match(result[0].text, /双条件优先:蛋糕:高/);
  assert.doesNotMatch(result[0].text, /甜食单条件|高好感单条件|%50%/);

  profile = h.storedJson(profileKey); profile.affection = 0;
  h.ext.storageSet(profileKey, JSON.stringify(profile));
  result = await h.run('yan', ['投喂', '布丁']);
  assert.match(result[0].text, /甜食单条件:布丁:甜食/);

  profile = h.storedJson(profileKey); profile.affection = -10;
  h.ext.storageSet(profileKey, JSON.stringify(profile));
  result = await h.run('yan', ['投喂', '牛奶']);
  assert.match(result[0].text, /低好感牛奶:测试员/);

  profile = h.storedJson(profileKey); profile.affection = 0;
  h.ext.storageSet(profileKey, JSON.stringify(profile));
  result = await h.run('yan', ['投喂', '毛巾']);
  assert.match(result[0].text, /通用回退:毛巾:初见/);
});

test('赠礼余额不足发送专用失败场景且不扣费不加好感', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: '/api/image/0123456789abcdef01234567' }) };
    }
  });
  await h.runRaw('yan', ['注册', '余额测试员']);
  const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  const profile = h.storedJson(profileKey); profile.coins = 0;
  h.ext.storageSet(profileKey, JSON.stringify(profile));
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['投喂', '床头柜']);
  assert.equal(views[0].giftScene.mode, 'insufficient');
  assert.equal(views[0].giftScene.cost, 1200);
  const unchanged = h.storedJson(profileKey);
  assert.equal(unchanged.coins, 0);
  assert.equal(unchanged.affection, 0);
});

test('项目详细统计使用真实上下文生成文案', async () => {
  const h = createHarness();
  const detail = await h.run('yan', ['我的', '钓鱼']);
  assert.equal(detail.length, 1);
  assert.match(detail[0].text, /钓鱼 · 详细统计/);
  assert.match(detail[0].text, /累计获得好感 \+0/);

  const alias = await h.run('yan', ['统计', '钓鱼']);
  assert.match(alias[0].text, /钓鱼 · 详细统计/);
});

test('短指令与yan总入口共用档案和功能', async () => {
  const h = createHarness();
  assert.ok(h.ext.cmdMap.yan);
  ['我的', '签到', '德州', '21点', '神抽', '快艇', '刮刮', '视频扑克', '双色球', '生死骰', '借款', '钓鱼', '排行'].forEach((name) => assert.equal(h.ext.cmdMap[name], h.ext.cmdMap.yan));
  const profileReply = await h.run('我的');
  assert.match(profileReply[0].text, /测试员/);
  await h.run('签到');
  const key = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  const first = h.storedJson(key);
  assert.equal(first.coins, 600);
  assert.equal(first.affection, 5);
  await h.run('yan', ['签到']);
  const second = h.storedJson(key);
  assert.equal(second.coins, 600);
  assert.equal(second.affection, 5);
  assert.ok(h.storedJson('aff.registry.v1').ids.includes('QQ:1001'));
});

test('图片回复使用CQ码包裹短链接且保持单行', async () => {
  const h = createHarness({
    fetch: async () => ({ ok: true, json: async () => ({ url: '/api/image/0123456789abcdef01234567' }) })
  });
  h.configs.set('启用图片输出', true);
  const replies = await h.run('yan', ['我的']);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].text, '[CQ:image,file=http://127.0.0.1:3891/api/image/0123456789abcdef01234567,cache=0]');
  assert.equal(replies[0].text.split('\n').length, 1);
  assert.ok(replies[0].text.length < 160);
});

test('德州、21点、神抽与快艇教程会发送结构化图片数据', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '测试员']);
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['德州', '教程', '1']);
  await h.run('yan', ['德州', '人机']);
  await h.run('yan', ['21点', '教程', '1']);
  await h.run('yan', ['21点', '开始']);
  await h.run('神抽', ['教程', '2']);
  await h.run('快艇', ['教程', '2']);
  assert.equal(views[0].tutorial.page, 1);
  assert.ok(views[0].tutorial.entries.length >= 6);
  assert.equal(views[1].pokerTable.board.length, 5);
  assert.equal(views[1].pokerTable.seats.length, 2);
  assert.equal(views[1].pokerTable.seats[0].cards.length, 2);
  assert.equal(views[1].pokerTable.seats.find((seat) => !seat.isBot).cards.every((card) => !card.hidden), true, '德州PvE玩家手牌应在群图常亮');
  assert.equal(views[1].pokerTable.seats.find((seat) => seat.isBot).cards.every((card) => card.hidden), true, '德州Bot暗牌不能显示');
  assert.equal(views[2].tutorial.page, 1);
  assert.match(views[2].tutorial.entries.map((entry) => entry.description).join(''), /双方.*停牌/);
  assert.equal(views[3].blackjackTable.round, 1);
  assert.equal(views[3].blackjackTable.player.trumps.length, 1);
  assert.equal(views[4].tutorial.page, 2);
  assert.equal(views[4].tutorial.total, 3);
  assert.deepEqual(Array.from(views[4].tutorial.entries.map((entry) => entry.title)), ['美人鱼 M', '藏宝图 T', '弯刀 D', '钩子 G', '船锚 C', '钥匙 Y', '宝箱 B', '海怪 H', '大炮 P', '占卜球 Z']);
  assert.equal(views[5].tutorial.page, 2);
  assert.equal(views[5].tutorial.total, 2);
  assert.match(views[5].tutorial.entries.map((entry) => entry.description).join(''), /三个1.*1000.*顺子.*1500/);
});

test('刮刮乐奖金永远不超过面额一百倍', async () => {
  const h = createHarness();
  await h.run('yan', ['刮刮', '买', '10', '幸运数字']);
  const ticketKey = `aff.scratch.ticket.v1:${encodeURIComponent('QQ:1001')}`;
  const ticket = h.storedJson(ticketKey);
  assert.equal(ticket.denom, 10);
  assert.ok(ticket.prize >= 0 && ticket.prize <= 1000);
  await h.run('yan', ['刮刮', '刮开']);
  assert.equal(h.ext.storageGet(ticketKey), '');
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.stats.scratch.plays, 1);
});

test('刮刮乐购买与刮开都会发送结构化彩票图', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '刮票员']);
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['刮刮', '买', '50', '三同符号']);
  await h.run('yan', ['刮刮', '刮开']);
  assert.equal(views.length, 2);
  assert.equal(views[0].scratchTicket.revealed, false);
  assert.equal(views[0].scratchTicket.cells.length, 9);
  assert.ok(views[0].scratchTicket.cells.every((cell) => cell.symbol === ''), '未刮票面不得提前发送结果符号');
  assert.equal(views[1].scratchTicket.revealed, true);
  assert.equal(views[1].scratchTicket.type, '三同符号');
  assert.equal(views[1].scratchTicket.cells.length, 9);
});

test('刮刮乐未中奖会按面额扣除好感并写入统计', async () => {
  const expectedLosses = new Map([[10, 1], [50, 2], [100, 4], [500, 8]]);
  for (const [denom, expectedLoss] of expectedLosses) {
    const h = createHarness();
    await h.run('刮刮', ['买', String(denom), '金库钥匙']);
    const ticketKey = `aff.scratch.ticket.v1:${encodeURIComponent('QQ:1001')}`;
    const ticket = h.storedJson(ticketKey);
    ticket.prize = 0; ticket.multiplier = 0; ticket.cells = ticket.cells.map(() => ({ symbol: '落空', value: 0 }));
    h.ext.storageSet(ticketKey, JSON.stringify(ticket));
    const replies = await h.run('刮刮', ['刮开']);
    const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
    assert.equal(profile.affection, -expectedLoss, `${denom}币票面的失败好感`);
    assert.equal(profile.stats.scratch.affectionLost, expectedLoss);
    assert.equal(profile.stats.scratch.affection, -expectedLoss);
    assert.match(replies[0].text, new RegExp(`好感 -${expectedLoss}`));
  }
});

test('双色球按18点划分期号并在有效期内静默兑奖', async () => {
  const views = [];
  const h = createHarness({
    now: new Date('2026-07-27T17:30:00+08:00').getTime(),
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '彩票员']); h.configs.set('启用图片输出', true);
  await h.run('双色球', ['1', '2', '3', '4', '5', '1']);
  const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  let profile = h.storedJson(profileKey); const ticket = profile.lottery.tickets[0];
  assert.equal(ticket.issue, '2026-07-27'); assert.equal(profile.coins, 490); assert.equal(profile.affection, 0);
  assert.deepEqual(Array.from(ticket.red), [1, 2, 3, 4, 5]); assert.equal(ticket.blue, 1);
  h.ext.storageSet(`aff.lottery.draw.v1:${ticket.issue}`, JSON.stringify({ issue: ticket.issue, red: [1, 2, 3, 4, 5], blue: 1, drawnAt: new Date('2026-07-27T18:00:00+08:00').getTime() }));
  h.clock.now = new Date('2026-07-27T18:10:00+08:00').getTime();
  await h.run('双色球', ['兑奖']);
  profile = h.storedJson(profileKey);
  assert.equal(profile.coins, 1490); assert.equal(profile.affection, 0); assert.equal(profile.lottery.tickets.length, 0);
  assert.equal(profile.lottery.history[0].tier, '一等奖'); assert.equal(profile.stats.scratch.lotteryPrize, 1000);
  assert.equal(views[0].lotteryScene.mode, 'ticket'); assert.equal(views[1].lotteryScene.mode, 'result');
  assert.equal(views[1].lotteryScene.totalPrize, 1000);
});

test('双色球每日任务只写开奖号码且不会主动发送消息', async () => {
  const h = createHarness({ now: new Date('2026-07-27T18:00:00+08:00').getTime() });
  assert.equal(h.tasks.length, 1); assert.equal(h.tasks[0].type, 'daily'); assert.equal(h.tasks[0].schedule, '18:00');
  const beforeReplies = h.replies.length; h.tasks[0].callback();
  const draw = h.storedJson('aff.lottery.draw.v1:2026-07-27');
  assert.ok(draw); assert.equal(draw.red.length, 5); assert.ok(draw.blue >= 1 && draw.blue <= 4);
  assert.equal(h.replies.length, beforeReplies, '静默开奖不应调用任何回复API');
});

test('双色球18点后购买进入次日期且超过下一次开奖即过期', async () => {
  const h = createHarness({ now: new Date('2026-07-27T18:30:00+08:00').getTime() });
  await h.run('双色球', ['6', '7', '8', '9', '10', '2']);
  const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`; let profile = h.storedJson(profileKey);
  assert.equal(profile.lottery.tickets[0].issue, '2026-07-28');
  h.clock.now = new Date('2026-07-29T18:00:00+08:00').getTime();
  await h.run('双色球', ['兑奖']); profile = h.storedJson(profileKey);
  assert.equal(profile.coins, 490); assert.equal(profile.affection, 0); assert.equal(profile.lottery.tickets.length, 0);
  assert.equal(profile.lottery.history[0].status, 'expired'); assert.equal(profile.lottery.history[0].prize, 0);
});

test('生死骰按难度全额结算且不改变好感', async () => {
  const survive = createHarness({ random: () => 0 });
  await survive.run('生死骰', ['简单']);
  let profile = survive.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.coins, 600); assert.equal(profile.affection, 0);
  assert.equal(profile.stats.scratch.deathDiceWins, 1); assert.equal(profile.stats.scratch.deathDiceProfit, 100);

  const death = createHarness({ random: () => 0.999999 });
  await death.run('生死骰', ['困难']);
  profile = death.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.coins, 0); assert.equal(profile.affection, 0);
  assert.equal(profile.stats.scratch.deathDiceLosses, 1); assert.equal(profile.stats.scratch.deathDiceProfit, -500);
});

test('视频扑克10币机台使用同副剩余牌翻牌，猜错可从钱包额外付费复活', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '扑克员']); h.configs.set('启用图片输出', true);
  await h.run('视频扑克', ['10']);
  const sessionKey = `aff.videoPoker.session.v1:${encodeURIComponent('QQ:1001')}`;
  const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  let session = h.storedJson(sessionKey);
  assert.equal(session.phase, 'deal'); assert.equal(session.initialHand.length, 5); assert.equal(session.deck.length, 47);
  assert.equal(h.storedJson(profileKey).coins, 490); assert.equal(h.storedJson('aff.videoPoker.jackpot.v1'), 1001);

  session.initialHand = [
    { rank: 'J', suit: 'H', value: 11 }, { rank: 'J', suit: 'D', value: 11 }, { rank: '4', suit: 'S', value: 4 },
    { rank: '7', suit: 'C', value: 7 }, { rank: '9', suit: 'H', value: 9 }
  ];
  session.hand = session.initialHand.slice();
  session.deck = [{ rank: 'K', suit: 'S', value: 13 }, { rank: '5', suit: 'D', value: 5 }, { rank: '5', suit: 'C', value: 5 }];
  h.ext.storageSet(sessionKey, JSON.stringify(session));
  await h.run('视频扑克', ['保留', '全部']);
  session = h.storedJson(sessionKey); assert.equal(session.phase, 'offer'); assert.equal(session.totalPayout, 7.5);
  assert.equal(session.results[0].name, 'J或更好'); assert.equal(views.at(-1).videoPokerScene.mode, 'result');

  await h.run('视频扑克', ['翻牌']); session = h.storedJson(sessionKey); assert.equal(session.anchorCard.value, 5); assert.equal(session.deck.length, 2);
  await h.run('视频扑克', ['比大']); session = h.storedJson(sessionKey); assert.equal(session.phase, 'revive'); assert.equal(session.correct, false); assert.equal(session.reviveCost, 4);
  await h.run('视频扑克', ['复活']); session = h.storedJson(sessionKey); assert.equal(session.phase, 'gamble'); assert.equal(session.pendingPrize, 7.5); assert.equal(h.storedJson(profileKey).coins, 486);
  await h.run('视频扑克', ['比大']); session = h.storedJson(sessionKey); assert.equal(session.correct, true); assert.equal(session.pendingPrize, 9.75);
  await h.run('视频扑克', ['收下']); assert.equal(h.ext.storageGet(sessionKey), '');
  const profile = h.storedJson(profileKey);
  assert.equal(profile.coins, 495); assert.equal(profile.affection, 0); assert.equal(profile.stats.scratch.videoPokerWon, 9);
  assert.equal(profile.stats.scratch.videoPokerWagered, 14); assert.equal(profile.stats.scratch.profit, -5);
  assert.equal(profile.stats.scratch.videoPokerHighLowWins, 1); assert.equal(profile.stats.scratch.videoPokerBestStreak, 1); assert.equal(profile.stats.scratch.videoPokerRevives, 1);
});

test('视频扑克复活余额不足时保留待领奖金与复活状态', async () => {
  const h = createHarness(); await h.run('视频扑克', ['10']);
  const sessionKey = `aff.videoPoker.session.v1:${encodeURIComponent('QQ:1001')}`; const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  const session = h.storedJson(sessionKey); const profile = h.storedJson(profileKey);
  session.phase = 'revive'; session.pendingPrize = 1200.5; session.reviveCost = 601; session.drawnCard = { rank: '8', suit: 'D', value: 8 };
  profile.coins = 600; h.ext.storageSet(sessionKey, JSON.stringify(session)); h.ext.storageSet(profileKey, JSON.stringify(profile));
  await h.run('视频扑克', ['复活']);
  const storedSession = h.storedJson(sessionKey); const storedProfile = h.storedJson(profileKey);
  assert.equal(storedSession.phase, 'revive'); assert.equal(storedSession.pendingPrize, 1200.5); assert.equal(storedSession.reviveCost, 601);
  assert.equal(storedProfile.coins, 600); assert.equal(storedProfile.stats.scratch.videoPokerRevives, 0);
});

test('视频扑克30币狂野2正确识别狂野皇家同花顺并从三条起奖', async () => {
  const h = createHarness(); await h.run('视频扑克', ['30']);
  const sessionKey = `aff.videoPoker.session.v1:${encodeURIComponent('QQ:1001')}`; const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  const session = h.storedJson(sessionKey);
  session.initialHand = [
    { rank: '2', suit: 'S', value: 2 }, { rank: '2', suit: 'H', value: 2 }, { rank: 'A', suit: 'H', value: 14 },
    { rank: 'K', suit: 'H', value: 13 }, { rank: 'Q', suit: 'H', value: 12 }
  ];
  session.hand = session.initialHand.slice(); h.ext.storageSet(sessionKey, JSON.stringify(session));
  await h.run('视频扑克', ['保留', '全部']);
  assert.equal(h.ext.storageGet(sessionKey), '');
  const profile = h.storedJson(profileKey);
  assert.equal(profile.coins, 1025); assert.equal(profile.stats.scratch.videoPokerWon, 555);
  assert.equal(profile.stats.scratch.videoPokerBestHand, '狂野皇家同花顺'); assert.equal(profile.stats.scratch.videoPokerHandsWon, 1);
});

test('视频扑克50币机台共用保留牌并独立结算五手', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '五手玩家']); h.configs.set('启用图片输出', true); await h.run('视频扑克', ['50']);
  const sessionKey = `aff.videoPoker.session.v1:${encodeURIComponent('QQ:1001')}`; const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  const session = h.storedJson(sessionKey);
  session.initialHand = [
    { rank: 'J', suit: 'S', value: 11 }, { rank: 'J', suit: 'C', value: 11 }, { rank: '5', suit: 'H', value: 5 },
    { rank: '8', suit: 'D', value: 8 }, { rank: '10', suit: 'C', value: 10 }
  ];
  session.hand = session.initialHand.slice(); h.ext.storageSet(sessionKey, JSON.stringify(session));
  await h.run('视频扑克', ['保留', '全部']);
  const resultView = views.at(-1).videoPokerScene; assert.equal(resultView.hands.length, 5); assert.equal(resultView.handPayouts.length, 5); assert.equal(resultView.totalPayout, 37.5);
  const profile = h.storedJson(profileKey); assert.equal(profile.coins, 487); assert.equal(profile.stats.scratch.videoPokerHands, 5); assert.equal(profile.stats.scratch.videoPokerHandsWon, 5);
});

test('视频扑克连续命中13次获得一半Jackpot并保留奖池小数', async () => {
  const h = createHarness(); await h.run('视频扑克', ['10']);
  const sessionKey = `aff.videoPoker.session.v1:${encodeURIComponent('QQ:1001')}`; const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  let session = h.storedJson(sessionKey);
  session.initialHand = [
    { rank: 'J', suit: 'S', value: 11 }, { rank: 'J', suit: 'C', value: 11 }, { rank: '5', suit: 'H', value: 5 },
    { rank: '8', suit: 'D', value: 8 }, { rank: '10', suit: 'C', value: 10 }
  ];
  session.hand = session.initialHand.slice(); h.ext.storageSet(sessionKey, JSON.stringify(session)); await h.run('视频扑克', ['保留', '全部']);
  session = h.storedJson(sessionKey); session.phase = 'gamble'; session.pendingPrize = 100; session.streak = 12;
  session.anchorCard = { rank: '5', suit: 'S', value: 5 }; session.deck = [{ rank: 'K', suit: 'H', value: 13 }]; h.ext.storageSet(sessionKey, JSON.stringify(session));
  h.ext.storageSet('aff.videoPoker.jackpot.v1', JSON.stringify(1000.5)); await h.run('视频扑克', ['比大']);
  assert.equal(h.ext.storageGet(sessionKey), ''); assert.equal(h.storedJson('aff.videoPoker.jackpot.v1'), 500.25);
  const profile = h.storedJson(profileKey); assert.equal(profile.coins, 1120); assert.equal(profile.stats.scratch.videoPokerJackpots, 1);
  assert.equal(profile.stats.scratch.videoPokerJackpotWon, 500); assert.equal(profile.stats.scratch.videoPokerBestStreak, 13);
});

test('刮刮栏目各类下注都会按十分之一注入视频扑克Jackpot', async () => {
  const h = createHarness({ random: () => 0 });
  await h.run('刮刮', ['买', '10', '幸运数字']);
  await h.run('双色球', ['1', '2', '3', '4', '5', '1']);
  await h.run('视频扑克', ['30']);
  await h.run('生死骰', ['简单']);
  assert.equal(h.storedJson('aff.videoPoker.jackpot.v1'), 1050);
});

test('多笔借款递增扣好感并在余额达到345时逐笔归还', async () => {
  const h = createHarness(); const user = { id: 'QQ:loan', name: '借款员' };
  const profileKey = await setProfileCoins(h, user, 100);
  let profile = h.storedJson(profileKey); profile.affection = 100; h.ext.storageSet(profileKey, JSON.stringify(profile));
  await h.run('借款', ['申请'], user);
  profile = h.storedJson(profileKey); assert.equal(profile.coins, 250); assert.equal(profile.affection, 80); assert.equal(profile.loan.loans.length, 1);
  profile.coins = 100; h.ext.storageSet(profileKey, JSON.stringify(profile));
  await h.run('借款', ['申请'], user);
  profile = h.storedJson(profileKey); assert.equal(profile.coins, 250); assert.equal(profile.affection, 50); assert.equal(profile.loan.loans.length, 2);

  profile.coins = 345; h.ext.storageSet(profileKey, JSON.stringify(profile)); await h.run('我的', [], user);
  profile = h.storedJson(profileKey); assert.equal(profile.coins, 150); assert.equal(profile.affection, 60); assert.equal(profile.loan.loans.length, 1);
  profile.coins = 345; h.ext.storageSet(profileKey, JSON.stringify(profile)); await h.run('我的', [], user);
  profile = h.storedJson(profileKey); assert.equal(profile.coins, 150); assert.equal(profile.affection, 75); assert.equal(profile.loan.loans.length, 0);
  assert.equal(profile.loan.totalRepaid, 390); assert.equal(profile.loan.totalAffectionRestored, 25);
});

test('德州扑克人机局使用150筹码和25/50盲注', async () => {
  const h = createHarness();
  await h.run('yan', ['德州', '人机']);
  const room = h.storedJson(`aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.status, 'playing');
  assert.equal(room.players.length, 2);
  assert.equal(room.pot, 75);
  assert.deepEqual(Array.from(room.players.map((p) => p.stack)).sort((a, b) => a - b), [100, 125]);
  assert.equal(room.currentBet, 50);
  assert.ok(['姜修泽', '葛明治', '阿日', '严茫熙', '亨德森'].includes(room.players.find((p) => p.isBot).name));
});

test('德州扑克机器人只使用指定姓名池', async () => {
  const h = createHarness();
  await h.run('yan', ['德州', '开房']);
  await h.run('yan', ['德州', '机器人', '5']);
  const room = h.storedJson(`aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`);
  assert.deepEqual(Array.from(room.players.filter((p) => p.isBot).map((p) => p.name)), ['姜修泽', '葛明治', '阿日', '严茫熙', '亨德森']);
});

test('德州扑克人机结算图引导下一局并可原桌立即重开', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.run('德州', ['人机']);
  const key = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key); const botName = room.players.find((player) => player.isBot).name;
  room.status = 'finished'; room.stage = 'showdown'; room.settled = true;
  h.ext.storageSet(key, JSON.stringify(room));
  h.configs.set('启用图片输出', true);
  await h.run('德州', ['状态']);
  assert.match(views[0].pokerTable.nextAction, /\.德州 下一局.*重新支付150/);
  await h.run('德州', ['下一局']);
  const rematch = h.storedJson(key);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(rematch.status, 'playing');
  assert.equal(rematch.players.length, 2);
  assert.equal(rematch.players.find((player) => player.isBot).name, botName);
  assert.equal(profile.coins, 200);
});

test('德州扑克多人下一局只由真人重新确认入场', async () => {
  const h = createHarness();
  const owner = { id: 'QQ:1001', name: '房主' }; const guest = { id: 'QQ:1002', name: '客人' };
  await h.run('德州', ['开房'], owner);
  await h.run('德州', ['加入'], guest);
  await h.run('德州', ['机器人', '1'], owner);
  const key = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`;
  const finished = h.storedJson(key); const botName = finished.players.find((player) => player.isBot).name;
  finished.status = 'finished'; finished.stage = 'showdown'; finished.settled = true;
  h.ext.storageSet(key, JSON.stringify(finished));
  const denied = await h.run('德州', ['下一局'], guest);
  assert.match(denied[0].text, /上一局房主/);
  await h.run('德州', ['下一局'], owner);
  let rematch = h.storedJson(key);
  assert.equal(rematch.status, 'waiting');
  assert.deepEqual(Array.from(rematch.players.map((player) => player.name)), ['房主', botName]);
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent(guest.id)}`).coins, 350, '未重新加入前不得再次扣费');
  await h.run('德州', ['加入'], guest);
  rematch = h.storedJson(key);
  assert.equal(rematch.players.some((player) => player.id === guest.id), true);
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent(guest.id)}`).coins, 200);
});

test('德州扑克双方全押且一方筹码归零后才完成整场结算', async () => {
  const h = createHarness();
  await h.run('yan', ['德州', '人机']);
  const key = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  const bot = room.players.find((p) => p.isBot);
  bot.hand = [{ suit: 'S', rank: 'A', value: 14 }, { suit: 'H', rank: 'A', value: 14 }];
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['德州', '全押']);
  const finished = h.storedJson(key);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.board.length, 5);
  assert.equal(finished.pot, 0);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.stats.poker.plays, 1);
});

test('德州扑克单手结束后保留筹码且下一手不重复收费', async () => {
  const h = createHarness();
  const owner = { id: 'QQ:1001', name: '房主' }; const guest = { id: 'QQ:1002', name: '客人' };
  await h.run('德州', ['开房'], owner); await h.run('德州', ['加入'], guest); await h.run('德州', ['开始'], owner);
  const key = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key); const ownerSeat = room.players.find((p) => p.id === owner.id); const guestSeat = room.players.find((p) => p.id === guest.id);
  room.stage = 'river'; room.status = 'playing'; room.pot = 100; room.currentBet = 50;
  room.board = [
    { suit: 'C', rank: '4', value: 4 }, { suit: 'D', rank: '7', value: 7 }, { suit: 'H', rank: '9', value: 9 },
    { suit: 'S', rank: 'J', value: 11 }, { suit: 'D', rank: 'K', value: 13 }
  ];
  ownerSeat.hand = [{ suit: 'S', rank: 'A', value: 14 }, { suit: 'H', rank: 'A', value: 14 }];
  guestSeat.hand = [{ suit: 'C', rank: '2', value: 2 }, { suit: 'D', rank: '3', value: 3 }];
  room.players.forEach((p) => {
    p.stack = 100; p.handStartStack = 150; p.roundBet = 50; p.totalBet = 50;
    p.status = 'active'; p.acted = false; p.foldedThisHand = false;
  });
  room.turn = room.players.findIndex((p) => p.id === owner.id); h.ext.storageSet(key, JSON.stringify(room));
  await h.run('德州', ['过牌'], owner); await h.run('德州', ['过牌'], guest);
  const handResult = h.storedJson(key);
  assert.equal(handResult.status, 'between_hands');
  assert.equal(handResult.handNo, 1);
  assert.deepEqual(Array.from(handResult.players.map((p) => p.stack)).sort((a, b) => a - b), [100, 200]);
  assert.equal(handResult.ranking, null);
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent(owner.id)}`).stats.poker.plays, 0, '单手结束不得提前结算整场战绩');
  const interimProfile = await h.run('yan', ['我的'], owner);
  assert.match(interimProfile[0].text, /德州扑克：0局.*最大牌型一对/, '单手摊牌后应立即更新最大牌型');
  const handStatus = await h.run('德州', ['状态'], owner);
  assert.match(handStatus[0].text, /下一手.*不会再次扣除入场费/);
  const beforeCoins = h.storedJson(`aff.profile.v1:${encodeURIComponent(owner.id)}`).coins;
  const replies = await h.run('德州', ['下一手'], owner);
  const nextHand = h.storedJson(key);
  assert.equal(nextHand.status, 'playing'); assert.equal(nextHand.handNo, 2);
  assert.equal(nextHand.players.reduce((sum, p) => sum + p.stack, 0) + nextHand.pot, 300, '下一手必须继承整场筹码总量');
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent(owner.id)}`).coins, beforeCoins, '下一手不得再次扣除150');
  assert.match(replies[0].text, /下一手已经发牌/);
});

test('德州扑克多人同手淘汰按入手筹码确定退场顺序', async () => {
  const h = createHarness();
  const users = [
    { id: 'QQ:1001', name: '冠军' }, { id: 'QQ:1002', name: '大筹码' },
    { id: 'QQ:1003', name: '中筹码' }, { id: 'QQ:1004', name: '小筹码' }
  ];
  await h.run('德州', ['开房'], users[0]);
  for (let i = 1; i < users.length; i++) await h.run('德州', ['加入'], users[i]);
  await h.run('德州', ['开始'], users[0]);
  const key = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`; const room = h.storedJson(key);
  const starts = [300, 150, 100, 50]; const bets = [299, 150, 100, 50];
  room.stage = 'river'; room.status = 'playing'; room.pot = 599; room.currentBet = 299;
  room.board = [
    { suit: 'C', rank: '4', value: 4 }, { suit: 'D', rank: '7', value: 7 }, { suit: 'H', rank: '9', value: 9 },
    { suit: 'S', rank: 'J', value: 11 }, { suit: 'D', rank: 'K', value: 13 }
  ];
  const hands = [
    [{ suit: 'S', rank: 'A', value: 14 }, { suit: 'H', rank: 'A', value: 14 }],
    [{ suit: 'C', rank: 'K', value: 13 }, { suit: 'D', rank: 'Q', value: 12 }],
    [{ suit: 'C', rank: '2', value: 2 }, { suit: 'D', rank: '3', value: 3 }],
    [{ suit: 'C', rank: '5', value: 5 }, { suit: 'D', rank: '6', value: 6 }]
  ];
  room.players.forEach((p, index) => {
    p.hand = hands[index]; p.handStartStack = starts[index]; p.stack = index === 0 ? 1 : 0;
    p.roundBet = bets[index]; p.totalBet = bets[index]; p.status = index === 0 ? 'active' : 'allin';
    p.acted = index !== 0; p.foldedThisHand = false;
  });
  room.turn = 0; h.ext.storageSet(key, JSON.stringify(room));
  await h.run('德州', ['全押'], users[0]);
  const finished = h.storedJson(key);
  assert.equal(finished.status, 'finished');
  assert.deepEqual(Array.from(finished.ranking.map((row) => row.name)), ['冠军', '大筹码', '中筹码', '小筹码']);
  assert.deepEqual(Array.from(finished.players.slice(1).map((p) => p.eliminationOrder)), [3, 2, 1]);
  assert.equal(finished.players[0].stack, 600);
});

test('德州扑克获胜获得两倍入场费并计入净收益', async () => {
  const views = [];
  const h = createHarness({
    random: () => 0.99,
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.run('yan', ['德州', '人机']);
  const key = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key); const human = room.players.find((p) => !p.isBot); const bot = room.players.find((p) => p.isBot);
  human.hand = [{ suit: 'S', rank: 'A', value: 14 }, { suit: 'H', rank: 'A', value: 14 }];
  bot.hand = [{ suit: 'C', rank: '2', value: 2 }, { suit: 'D', rank: '3', value: 3 }];
  room.deck = [
    { suit: 'C', rank: '4', value: 4 }, { suit: 'D', rank: '7', value: 7 }, { suit: 'H', rank: '9', value: 9 },
    { suit: 'S', rank: 'J', value: 11 }, { suit: 'D', rank: 'K', value: 13 }
  ];
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['德州', '全押']);
  const finished = h.storedJson(key); const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.winnerIds[0], human.id);
  assert.equal(profile.coins, 650);
  assert.equal(profile.stats.poker.profit, 150);
  assert.equal(profile.stats.poker.bestPokerHand.category, 1);
  assert.equal(profile.stats.poker.bestPokerHand.name, '一对');
  assert.equal(finished.ranking.find((row) => row.id === human.id).coinReward, 300);
  const overview = await h.run('yan', ['我的']);
  assert.match(overview[0].text, /德州扑克：.*最大牌型一对/);
  const detail = await h.run('yan', ['我的', '德州']);
  assert.match(detail[0].text, /历史最大牌型 一对/);
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['我的']); await h.run('yan', ['我的', '德州']);
  assert.equal(views[0].modules.find((module) => module.key === 'poker').bestPokerHand, '一对');
  assert.equal(views[1].tiles.find((tile) => tile.label === '历史最大牌型').value, '一对');
});

test('21点每回合使用1到11的唯一数字牌', async () => {
  const h = createHarness();
  await h.run('yan', ['21点', '开始']);
  const room = h.storedJson(`aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`);
  const cards = room.deck.concat(room.player.hand, room.enemy.hand);
  assert.equal(cards.length, 11);
  assert.equal(new Set(cards).size, 11);
  assert.deepEqual(Array.from(cards).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(room.player.trumps.length, 1);
  assert.equal(room.enemy.trumps.length, 1);
  assert.equal(room.player.hp, 5);
  assert.equal(room.enemy.hp, 5);
  assert.equal(room.player.maxHp, 5);
});

test('21点爆牌不会立即结算且可用王牌修正', async () => {
  const h = createHarness();
  h.configs.set('21点摸牌获得王牌概率', 0);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.player.hand = [10, 11]; room.player.lastDrawn = 11; room.player.trumps = ['退回']; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [8, 9]; room.enemy.lastDrawn = 9; room.enemy.trumps = []; room.enemy.stand = true; room.enemy.busted = false;
  room.deck = [1, 2, 3, 4, 5, 6, 7]; room.turn = 'player'; room.buffs = [];
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['21点', '抽牌']);
  let updated = h.storedJson(key);
  assert.equal(updated.status, 'playing');
  assert.equal(updated.player.busted, true);
  assert.equal(updated.player.stand, false);
  assert.equal(updated.turn, 'player', '对手已停牌时玩家应继续获得行动权');

  const denied = await h.run('yan', ['21点', '抽牌']);
  assert.match(denied[0].text, /爆牌.*不能普通摸牌/);
  await h.run('yan', ['21点', '出牌', '退回']);
  updated = h.storedJson(key);
  assert.equal(updated.player.busted, false);
  assert.deepEqual(Array.from(updated.player.hand), [10, 11]);
});

test('21点停牌后对手摸牌会重新交还反制行动权', async () => {
  const h = createHarness();
  h.configs.set('21点摸牌获得王牌概率', 0);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key); const oldRound = room.round;
  room.player.hand = [9, 10]; room.player.lastDrawn = 10; room.player.trumps = []; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [1, 2]; room.enemy.lastDrawn = 2; room.enemy.trumps = []; room.enemy.stand = false; room.enemy.busted = false;
  room.deck = [3, 4, 5, 6, 7, 8, 11]; room.turn = 'player'; room.buffs = [];
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['21点', '停牌']);
  const updated = h.storedJson(key);
  assert.equal(updated.status, 'playing');
  assert.equal(updated.round, oldRound);
  assert.equal(updated.turn, 'player');
  assert.equal(updated.player.stand, false, '对手摸牌后旧停牌标记必须失效');
  assert.equal(updated.enemy.stand, false);
  assert.equal(updated.enemy.hand.length, 3);
  assert.match(updated.logs.join('\n'), /停牌并交出行动权.*骰娘 抽到/s);
});

test('21点可以连续出王牌且只有摸牌或停牌才交换行动', async () => {
  const h = createHarness();
  h.configs.set('21点摸牌获得王牌概率', 0);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.player.hand = [1, 2]; room.player.lastDrawn = 2; room.player.trumps = ['护盾', '增加一']; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [9, 10]; room.enemy.lastDrawn = 10; room.enemy.trumps = []; room.enemy.stand = false; room.enemy.busted = false;
  room.deck = [3, 4, 5, 6, 7, 8, 11]; room.turn = 'player'; room.buffs = []; room.logs = [];
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['21点', '出牌', '护盾']);
  let updated = h.storedJson(key);
  assert.equal(updated.turn, 'player');
  assert.ok(updated.buffs.some((buff) => buff.owner === updated.player.id && buff.id === '护盾'));
  assert.equal(updated.logs.filter((line) => /骰娘 (抽到|停牌)/.test(line)).length, 0);

  await h.run('yan', ['21点', '出牌', '增加一']);
  updated = h.storedJson(key);
  assert.equal(updated.turn, 'player');
  assert.ok(updated.buffs.some((buff) => buff.owner === updated.player.id && buff.id === '增加一'));
  assert.equal(updated.logs.filter((line) => /骰娘 (抽到|停牌)/.test(line)).length, 0);

  await h.run('yan', ['21点', '抽牌']);
  updated = h.storedJson(key);
  assert.equal(updated.turn, 'player', '机器人同步完成一次回应后应把行动权交还玩家');
  assert.ok(updated.logs.some((line) => /骰娘 (抽到|停牌)/.test(line)), '摸牌后机器人必须获得一次行动');
});

test('21点双方停牌后保留结算牌面，玩家抽牌才开启下一回合', async () => {
  const h = createHarness();
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  const oldRound = room.round;
  room.player.hand = [8, 9]; room.player.lastDrawn = 9; room.player.trumps = ['护盾']; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [10, 10]; room.enemy.lastDrawn = 10; room.enemy.trumps = ['增加一']; room.enemy.stand = true; room.enemy.busted = false;
  room.deck = [1, 2, 3, 4, 5, 6, 7, 11]; room.turn = 'player'; room.roundStarter = 'player'; room.buffs = [];
  h.ext.storageSet(key, JSON.stringify(room));
  const resultReply = await h.run('yan', ['21点', '停牌']);
  let updated = h.storedJson(key);
  assert.equal(updated.round, oldRound);
  assert.equal(updated.status, 'playing');
  assert.equal(updated.phase, 'round_result');
  assert.deepEqual(Array.from(updated.player.hand), [8, 9]);
  assert.deepEqual(Array.from(updated.enemy.hand), [10, 10]);
  assert.equal(updated.player.stand, true);
  assert.equal(updated.enemy.stand, true);
  assert.equal(updated.roundResult.playerSum, 17);
  assert.equal(updated.roundResult.enemySum, 20);
  assert.equal(updated.roundResult.winnerName, updated.enemy.name);
  assert.equal(updated.nextStarter, 'player');
  assert.equal(updated.roundResult.nextStarterName, updated.player.name);
  assert.match(resultReply[0].text, /手牌 8 9[\s\S]*手牌 10 10/);
  assert.match(resultReply[0].text, /下一回合由 测试员 先手/);

  const denied = await h.run('yan', ['21点', '停牌']);
  assert.match(denied[0].text, /本回合已经结算.*抽牌/);
  assert.equal(h.storedJson(key).round, oldRound);

  await h.run('yan', ['21点', '抽牌']);
  updated = h.storedJson(key);
  assert.equal(updated.round, oldRound + 1);
  assert.equal(updated.phase, 'playing');
  assert.equal(updated.roundResult, null);
  assert.equal(updated.roundStarter, 'player');
  assert.equal(updated.turn, 'player');
  assert.equal(updated.player.hand.length, 2);
  assert.equal(updated.enemy.hand.length, 2);
  assert.ok(updated.player.trumps.includes('护盾'));
  assert.ok(updated.enemy.trumps.includes('增加一'));
  assert.equal(updated.player.trumps.length, 2);
  assert.equal(updated.enemy.trumps.length, 2);
});

test('21点下一回合由输家先手，平局时交换先手', async () => {
  const enemyLoses = createHarness();
  await enemyLoses.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  let room = enemyLoses.storedJson(key); const oldRound = room.round;
  room.player.hand = [10, 10]; room.player.lastDrawn = 10; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [8, 9]; room.enemy.lastDrawn = 9; room.enemy.stand = true; room.enemy.busted = false;
  room.deck = [1, 2, 3, 4, 5, 6, 7, 11]; room.turn = 'player'; room.roundStarter = 'player'; room.buffs = [];
  enemyLoses.ext.storageSet(key, JSON.stringify(room));
  await enemyLoses.run('yan', ['21点', '停牌']);
  room = enemyLoses.storedJson(key);
  assert.equal(room.nextStarter, 'enemy');
  assert.equal(room.roundResult.nextStarterName, room.enemy.name);

  await enemyLoses.run('yan', ['21点', '抽牌']);
  room = enemyLoses.storedJson(key);
  assert.ok(room.round >= oldRound + 1);
  assert.equal(room.roundStarter, 'enemy');
  assert.ok(room.logs.some((line) => new RegExp(`第 \\d+ 回合开始.*由 ${room.enemy.name} 先手`).test(line)));

  for (const starter of ['player', 'enemy']) {
    const tied = createHarness();
    await tied.run('yan', ['21点', '开始']);
    let tiedRoom = tied.storedJson(key);
    tiedRoom.player.hand = [9, 10]; tiedRoom.player.lastDrawn = 10; tiedRoom.player.stand = false; tiedRoom.player.busted = false;
    tiedRoom.enemy.hand = [8, 11]; tiedRoom.enemy.lastDrawn = 11; tiedRoom.enemy.stand = true; tiedRoom.enemy.busted = false;
    tiedRoom.deck = [1, 2, 3, 4, 5, 6, 7]; tiedRoom.turn = 'player'; tiedRoom.roundStarter = starter; tiedRoom.buffs = [];
    tied.ext.storageSet(key, JSON.stringify(tiedRoom));
    await tied.run('yan', ['21点', '停牌']);
    tiedRoom = tied.storedJson(key);
    assert.equal(tiedRoom.roundResult.tie, true);
    assert.equal(tiedRoom.nextStarter, starter === 'player' ? 'enemy' : 'player');
  }
});

test('21点交换先手后Bot先行动也不会提前翻开暗牌', async () => {
  const views = [];
  const h = createHarness({
    random: () => 0.5,
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '换先手测试员']);
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key); const oldRound = room.round;
  room.phase = 'round_result'; room.turn = 'player'; room.roundStarter = 'player'; room.nextStarter = 'enemy';
  room.player.trumps = []; room.enemy.trumps = []; room.player.revealed = true; room.enemy.revealed = true;
  room.roundResult = {
    round: room.round, target: 21, playerSum: 20, enemySum: 17, tie: false,
    winnerName: room.player.name, loserName: room.enemy.name, damage: 1,
    nextStarter: 'enemy', nextStarterName: room.enemy.name, matchFinished: false
  };
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['21点', '抽牌']);
  const updated = h.storedJson(key); const view = views[views.length - 1]; const table = view.blackjackTable;
  assert.equal(updated.round, oldRound + 1);
  assert.equal(updated.roundStarter, 'enemy');
  assert.equal(updated.phase, 'playing');
  assert.equal(updated.enemy.revealed, false, 'Bot停牌只记录行动状态，不应改写暗牌公开标志');
  assert.equal(table.enemy.hand[0].hidden, true);
  assert.equal(table.enemy.hand[1].hidden, false);
  assert.equal(table.enemy.sum, null);
  assert.doesNotMatch(view.lines.find((line) => line.indexOf(updated.enemy.name) === 0), /\|  点数/);
});

test('21点遗忘重开后若骰娘仍是先手会自动完成行动而不会卡死', async () => {
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const botUsesForget = createHarness({ random: () => 0.5 });
  botUsesForget.configs.set('21点摸牌获得王牌概率', 0);
  await botUsesForget.run('yan', ['21点', '开始']);
  let room = botUsesForget.storedJson(key); const oldRound = room.round;
  room.roundStarter = 'enemy'; room.turn = 'player'; room.target = 21; room.phase = 'playing';
  room.player.hand = [10, 10]; room.player.lastDrawn = 10; room.player.trumps = []; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [1, 2]; room.enemy.lastDrawn = 2; room.enemy.trumps = ['遗忘']; room.enemy.stand = false; room.enemy.busted = false;
  room.deck = [3, 4, 5, 6, 7, 8, 9, 11]; room.buffs = []; room.logs = []; room.lastBotActions = [];
  botUsesForget.ext.storageSet(key, JSON.stringify(room));

  await botUsesForget.run('yan', ['21点', '停牌']);
  room = botUsesForget.storedJson(key);
  assert.equal(room.round, oldRound + 1);
  assert.equal(room.roundStarter, 'enemy');
  assert.equal(room.turn, 'player', '遗忘重开且骰娘继续先手时，应自动行动后交还玩家');
  assert.match(room.logs.join('\n'), /骰娘 使用【遗忘】.*当前回合被抹去/);
  assert.match(room.lastBotActions.join('\n'), /骰娘 使用【遗忘】/);

  const playerUsesForget = createHarness({ random: () => 0.5 });
  playerUsesForget.configs.set('21点摸牌获得王牌概率', 0);
  await playerUsesForget.run('yan', ['21点', '开始']);
  room = playerUsesForget.storedJson(key); const playerOldRound = room.round;
  room.roundStarter = 'enemy'; room.turn = 'player'; room.target = 21; room.phase = 'playing';
  room.player.trumps = ['遗忘']; room.enemy.trumps = []; room.player.stand = false; room.enemy.stand = false;
  room.buffs = []; room.logs = []; room.lastBotActions = [];
  playerUsesForget.ext.storageSet(key, JSON.stringify(room));

  await playerUsesForget.run('yan', ['21点', '出牌', '遗忘']);
  room = playerUsesForget.storedJson(key);
  assert.equal(room.round, playerOldRound + 1);
  assert.equal(room.roundStarter, 'enemy');
  assert.equal(room.turn, 'player', '玩家使用遗忘后若骰娘先手，也必须立即驱动骰娘行动');
  assert.match(room.logs.join('\n'), /使用【遗忘】.*当前回合被抹去/);
  assert.ok(room.lastBotActions.length > 0, '新回合骰娘的先手操作应写入行动记录');

  const oldSave = createHarness({ random: () => 0.5 });
  oldSave.configs.set('21点摸牌获得王牌概率', 0);
  await oldSave.run('yan', ['21点', '开始']);
  room = oldSave.storedJson(key);
  room.phase = 'playing'; room.turn = 'enemy'; room.roundStarter = 'enemy'; room.enemy.trumps = [];
  room.player.hand = [8, 9]; room.player.lastDrawn = 9; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [10, 10]; room.enemy.lastDrawn = 10; room.enemy.stand = false; room.enemy.busted = false;
  room.deck = [1, 2, 3, 4, 5, 6, 7, 11]; room.logs = ['旧版本遗留的骰娘行动状态']; room.lastBotActions = [];
  oldSave.ext.storageSet(key, JSON.stringify(room));
  await oldSave.run('yan', ['21点', '状态']);
  room = oldSave.storedJson(key);
  assert.equal(room.turn, 'player', '升级前已经卡住的敌方回合应在查看状态时自动恢复');
  assert.ok(room.lastBotActions.length > 0);
});

test('21点普通摸牌按配置概率额外获得王牌', async () => {
  const h = createHarness();
  h.configs.set('21点摸牌获得王牌概率', 100);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  const before = room.player.trumps.length;
  room.player.hand = [1, 2]; room.player.lastDrawn = 2; room.player.stand = false; room.player.busted = false;
  room.enemy.stand = true; room.enemy.busted = false; room.deck = [3, 4, 5, 6, 7, 8, 9, 10, 11]; room.turn = 'player';
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['21点', '抽牌']);
  const updated = h.storedJson(key);
  assert.ok(updated.player.trumps.length >= before + 1, '普通摸牌至少应获得配置保证的1张王牌');
  assert.ok(updated.logs.some((line) => /测试员 抽到.*获得王牌/.test(line)));
});

test('21点敌方爆牌不翻暗牌、摸牌不泄露新王牌且停牌前牌效可见', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '测试员']);
  h.configs.set('启用图片输出', true);
  h.configs.set('21点摸牌获得王牌概率', 100);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  let room = h.storedJson(key);

  room.enemy.hand = [10, 11]; room.enemy.lastDrawn = 11; room.enemy.busted = true; room.enemy.revealed = false; room.enemy.stand = false;
  room.player.hand = [8, 9]; room.player.lastDrawn = 9; room.player.busted = false; room.player.stand = false;
  room.turn = 'player'; room.phase = 'playing'; room.roundResult = null;
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['21点', '状态']);
  let view = views[views.length - 1].blackjackTable;
  assert.equal(view.enemy.hand[0].hidden, true, '敌方爆牌不应翻开原本的暗牌');
  assert.equal(view.enemy.hand[1].hidden, false, '敌方已经打出的明牌仍应可见');
  assert.equal(view.enemy.sum, null);

  room = h.storedJson(key);
  room.player.hand = [1, 2]; room.player.lastDrawn = 2; room.player.trumps = []; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [3, 4]; room.enemy.lastDrawn = 4; room.enemy.trumps = []; room.enemy.stand = false; room.enemy.busted = false; room.enemy.revealed = false;
  room.deck = [5, 6, 7, 8, 9, 10, 11]; room.turn = 'player'; room.buffs = []; room.logs = []; room.lastBotActions = [];
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['21点', '抽牌']);
  room = h.storedJson(key);
  const drawLogs = room.logs.join('\n');
  assert.match(drawLogs, /骰娘 抽到 6，并获得一张王牌/);
  assert.doesNotMatch(drawLogs, /骰娘 抽到[^\n]*【[^】]+】/);
  view = views[views.length - 1].blackjackTable;
  assert.doesNotMatch(view.recentActions.join('\n'), /【[^】]+】/);

  room.player.hand = [9, 10]; room.player.lastDrawn = 10; room.player.trumps = []; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [10, 11, 1]; room.enemy.lastDrawn = 1; room.enemy.trumps = ['退回']; room.enemy.stand = false; room.enemy.busted = true; room.enemy.revealed = false;
  room.deck = [2, 3, 4, 5, 6, 7, 8]; room.turn = 'player'; room.buffs = []; room.logs = []; room.lastBotActions = [];
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['21点', '停牌']);
  view = views[views.length - 1].blackjackTable;
  assert.match(view.recentActions.join('\n'), /骰娘 使用王牌：退回/);
  assert.match(view.recentActions.join('\n'), /骰娘 停牌/);
});

test('21点Bot会评估并连续使用高价值王牌而不是持续堆积', async () => {
  const h = createHarness({ random: () => 0.5 });
  h.configs.set('21点摸牌获得王牌概率', 0);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.player.hand = [10, 10]; room.player.lastDrawn = 10; room.player.trumps = ['护盾', '增加一', '数字1', '数字2'];
  room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [8, 9]; room.enemy.lastDrawn = 9; room.enemy.busted = false; room.enemy.stand = false;
  room.enemy.trumps = ['数字4', '护盾', '护盾+', '增加一', '增加二', '死寂', '收割', '欲望', '欲望+', '破坏++'];
  room.deck = [1, 2, 3, 4, 5, 6, 7, 10, 11]; room.turn = 'player'; room.buffs = []; room.logs = []; room.lastBotActions = [];
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['21点', '停牌']);
  const updated = h.storedJson(key);
  const used = updated.logs.filter((line) => /骰娘 使用【/.test(line));
  assert.equal(updated.enemy.trumpsUsed, 5, '十张手牌时单次响应应评估并使用至多五张，避免无限循环');
  assert.equal(used.length, 5);
  assert.deepEqual(Array.from(updated.enemy.hand), [8, 9, 4], '应优先使用数字4精确达到21点');
  assert.ok(updated.buffs.some((buff) => buff.owner === updated.enemy.id && buff.id === '死寂'), '应主动使用控场王牌');
  assert.ok(updated.enemy.trumps.length < 10, '即使收割补牌，王牌数量也不应继续无上限堆积');
  assert.equal(updated.turn, 'player', 'Bot完成一次抽牌或停牌后仍须交还行动权');
});

test('21点Bot在17、24、27点目标下会检查安全牌并在领先时停牌', async () => {
  const cases = [
    { target: 17, playerHand: [8, 9], botHand: [9, 7], deck: [2, 3, 4, 5, 6, 10, 11], reason: '差1点但数字1已不可能发出' },
    { target: 24, playerHand: [10, 11], botHand: [11, 11], deck: [1, 2, 3, 5, 6, 7, 8], reason: '已经领先停牌玩家' },
    { target: 27, playerHand: [11, 10, 5], botHand: [11, 9, 5], deck: [3, 4, 6, 7, 8], reason: '差2点但没有1或2可抽' }
  ];
  for (const item of cases) {
    const h = createHarness({ random: () => 0.5 });
    h.configs.set('21点摸牌获得王牌概率', 0);
    await h.run('yan', ['21点', '开始']);
    const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
    const room = h.storedJson(key);
    room.target = item.target; room.player.hand = item.playerHand.slice(); room.player.lastDrawn = item.playerHand[item.playerHand.length - 1];
    room.player.trumps = []; room.player.stand = false; room.player.busted = false;
    room.enemy.hand = item.botHand.slice(); room.enemy.lastDrawn = item.botHand[item.botHand.length - 1];
    room.enemy.trumps = []; room.enemy.stand = false; room.enemy.busted = false;
    room.deck = item.deck.slice(); room.turn = 'player'; room.buffs = []; room.logs = []; room.lastBotActions = [];
    h.ext.storageSet(key, JSON.stringify(room));

    await h.run('yan', ['21点', '停牌']);
    const updated = h.storedJson(key);
    assert.deepEqual(Array.from(updated.enemy.hand), item.botHand, `${item.target}点：${item.reason}，不应继续摸牌`);
    assert.equal(updated.logs.some((line) => /骰娘 抽到/.test(line)), false, `${item.target}点目标不应盲目追分`);
  }
});

test('21点Bot只使用牌组中仍可取得的数字王牌', async () => {
  const h = createHarness({ random: () => 0.5 });
  h.configs.set('21点摸牌获得王牌概率', 0);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.target = 24; room.player.hand = [9, 11]; room.player.lastDrawn = 11; room.player.trumps = [];
  room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [10, 10]; room.enemy.lastDrawn = 10; room.enemy.trumps = ['数字4', '数字3'];
  room.enemy.stand = false; room.enemy.busted = false;
  room.deck = [3, 5, 6, 7, 8]; room.turn = 'player'; room.buffs = []; room.logs = []; room.lastBotActions = [];
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['21点', '停牌']);
  const updated = h.storedJson(key);
  assert.match(updated.logs.join('\n'), /骰娘 使用【数字3】/);
  assert.doesNotMatch(updated.logs.join('\n'), /骰娘 使用【数字4】/);
  assert.ok(updated.enemy.trumps.includes('数字4'), '牌组里没有数字4时不应浪费对应王牌');
  assert.deepEqual(Array.from(updated.enemy.hand), [10, 10, 3]);
});

test('21点Bot会拒绝不可达的挑战目标，但会用挑战牌解除爆牌', async () => {
  const unreachable = createHarness({ random: () => 0.5 });
  unreachable.configs.set('21点摸牌获得王牌概率', 0);
  await unreachable.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  let room = unreachable.storedJson(key);
  room.target = 21; room.player.hand = [8, 9]; room.player.lastDrawn = 9; room.player.trumps = [];
  room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [10, 10]; room.enemy.lastDrawn = 10; room.enemy.trumps = ['挑战27点'];
  room.enemy.stand = false; room.enemy.busted = false;
  room.deck = [1, 8, 9, 10, 11]; room.turn = 'player'; room.buffs = []; room.logs = []; room.lastBotActions = [];
  unreachable.ext.storageSet(key, JSON.stringify(room));
  await unreachable.run('yan', ['21点', '抽牌']);
  room = unreachable.storedJson(key);
  assert.equal(room.target, 21);
  assert.ok(room.enemy.trumps.includes('挑战27点'));
  assert.doesNotMatch(room.logs.join('\n'), /使用【挑战27点】/);

  const rescue = createHarness({ random: () => 0.5 });
  rescue.configs.set('21点摸牌获得王牌概率', 0);
  await rescue.run('yan', ['21点', '开始']);
  room = rescue.storedJson(key);
  room.target = 21; room.player.hand = [8, 9]; room.player.lastDrawn = 9; room.player.trumps = [];
  room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [11, 8, 5]; room.enemy.lastDrawn = 5; room.enemy.trumps = ['挑战27点'];
  room.enemy.stand = false; room.enemy.busted = true;
  room.deck = [1, 6, 7, 9, 10]; room.turn = 'player'; room.buffs = []; room.logs = []; room.lastBotActions = [];
  rescue.ext.storageSet(key, JSON.stringify(room));
  await rescue.run('yan', ['21点', '抽牌']);
  room = rescue.storedJson(key);
  assert.equal(room.target, 27);
  assert.equal(room.enemy.busted, false);
  assert.match(room.logs.join('\n'), /骰娘 使用【挑战27点】/);
});

test('21点进行中完整隐藏Bot爆牌标志、暗牌与旧日志提示', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '隐私测试员']);
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.player.hand = [8, 9]; room.player.lastDrawn = 9; room.player.busted = false; room.player.stand = false;
  room.enemy.hand = [10, 11, 5]; room.enemy.lastDrawn = 5; room.enemy.busted = true; room.enemy.stand = true; room.enemy.revealed = true;
  room.turn = 'player'; room.phase = 'playing'; room.roundResult = null;
  room.logs = ['骰娘 抽到 5，爆牌！但回合尚未结算。', '骰娘 停牌。'];
  room.lastBotActions = room.logs.slice();
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['21点', '状态']);
  const view = views[views.length - 1]; const table = view.blackjackTable;
  assert.equal(table.enemy.sum, null);
  assert.equal(table.enemy.busted, false, '发送给渲染器的敌方爆牌标志必须隐藏');
  assert.equal(table.enemy.hand[0].hidden, true, '即使旧房间已将revealed设为true，爆牌时仍需隐藏暗牌');
  assert.doesNotMatch(table.enemy.status, /爆牌/);
  assert.doesNotMatch(table.recentActions.join('\n'), /爆牌/);
  assert.doesNotMatch(table.lastAction, /爆牌/);
  assert.doesNotMatch(view.lines.join('\n'), /骰娘[^\n]*爆牌/);
});

test('21点挑战牌会替换目标点数并持久化', async () => {
  const h = createHarness();
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.player.trumps = ['挑战24点'];
  room.enemy.trumps = [];
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['21点', '出牌', '挑战24点']);
  const updated = h.storedJson(key);
  assert.equal(updated.target, 24);
  assert.ok(updated.buffs.some((b) => b.id === '挑战24点'));
});

test('21点挑战牌被破坏后目标恢复21并重新判断爆牌', async () => {
  for (const destroyCard of ['破坏', '破坏+', '破坏++']) {
    const h = createHarness(); await h.run('yan', ['21点', '开始']);
    const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`; const room = h.storedJson(key);
    room.target = 24; room.turn = 'player'; room.phase = 'playing'; room.roundResult = null;
    room.player.hand = [11, 11]; room.player.lastDrawn = 11; room.player.busted = false; room.player.stand = false; room.player.trumps = [destroyCard];
    room.enemy.hand = [10, 10]; room.enemy.lastDrawn = 10; room.enemy.busted = false; room.enemy.stand = false;
    room.buffs = [{ id: '护盾', owner: room.enemy.id }, { id: '挑战24点', owner: room.enemy.id }];
    h.ext.storageSet(key, JSON.stringify(room)); await h.run('yan', ['21点', '出牌', destroyCard]);
    const updated = h.storedJson(key);
    assert.equal(updated.target, 21, `${destroyCard}解除挑战后应恢复21点`);
    assert.equal(updated.player.busted, true, '22点牌面在恢复21点后应重新标记为爆牌');
    assert.equal(updated.buffs.some((buff) => buff.id === '挑战24点'), false);
    assert.match(updated.logs.join('\n'), /目标点数恢复为21/);
  }
});

test('21点整场获胜获得两倍入场费', async () => {
  const h = createHarness();
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.player.hand = [10, 11]; room.player.lastDrawn = 11; room.player.hp = 5; room.player.stand = false; room.player.busted = false;
  room.enemy.hand = [9, 10]; room.enemy.lastDrawn = 10; room.enemy.hp = 1; room.enemy.stand = true; room.enemy.busted = false;
  room.turn = 'player'; room.buffs = [];
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['21点', '停牌']);
  const finished = h.storedJson(key); const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.winnerId, finished.player.id);
  assert.equal(finished.coinReward, 200);
  assert.equal(profile.coins, 600);
  assert.equal(profile.stats.blackjack.profit, 100);
});

test('亡命神抽可以创建含机器人的可持久化房间', async () => {
  const h = createHarness();
  await h.run('yan', ['神抽', '人机']);
  const room = h.storedJson(`aff.room.v1:dmd:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.status, 'playing');
  assert.equal(room.players.length, 2);
  assert.equal(room.deck.length, 60);
});

test('亡命神抽帮助、甲板、强制目标与玩家战利品会发送专用桌面数据', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '寻宝者']);
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['神抽']);
  await h.run('yan', ['神抽', '人机']);
  const key = `aff.room.v1:dmd:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key); const humanIndex = room.players.findIndex((player) => !player.isBot);
  room.current = humanIndex; room.board = [{ suit: 'T', value: 2 }, { suit: 'C', value: 5 }];
  room.players[humanIndex].collected.M = [7, 3]; room.players[humanIndex].collected.Y = [6];
  room.pending = { type: 'T', name: '藏宝图', required: true, options: [{ card: { suit: 'D', value: 4 } }, { card: { suit: 'P', value: 5 } }] };
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['神抽', '状态']);
  assert.equal(views.length, 3);
  assert.equal(views[0].dmdTable.status, 'menu');
  assert.equal(views[0].dmdTable.help.length, 6);
  assert.match(views[0].dmdTable.help[0], /教程/);
  assert.equal(views[1].dmdTable.players.length, 2);
  assert.equal(views[2].dmdTable.board.length, 2);
  assert.equal(views[2].dmdTable.pending.name, '藏宝图');
  assert.deepEqual(Array.from(views[2].dmdTable.pending.options.map((option) => option.code)), ['D4', 'P5']);
  const humanView = views[2].dmdTable.players.find((player) => player.name === '寻宝者');
  assert.equal(humanView.collection.find((item) => item.suit === 'M').value, 7);
  assert.equal(humanView.collectedTypes, 2);
});

test('亡命神抽藏宝图必须选择并获得一张翻出的道具', async () => {
  const h = createHarness();
  await h.run('yan', ['神抽', '人机']);
  const key = `aff.room.v1:dmd:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.current = room.players.findIndex((p) => !p.isBot);
  room.board = [];
  room.pending = null;
  room.forcedDraws = 0;
  room.discard = [{ suit: 'M', value: 3 }, { suit: 'D', value: 4 }, { suit: 'P', value: 5 }];
  room.deck = [{ suit: 'T', value: 2 }].concat(room.deck.filter((c) => !['T2', 'M3', 'D4', 'P5'].includes(`${c.suit}${c.value}`)));
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['神抽', '抽牌']);
  let updated = h.storedJson(key);
  assert.equal(updated.pending.type, 'T');
  assert.equal(updated.pending.options.length, 3);

  const skipped = await h.run('yan', ['神抽', '放弃效果']);
  assert.match(skipped[0].text, /必须执行.*不能放弃/);
  updated = h.storedJson(key);
  assert.equal(updated.pending.type, 'T');

  await h.run('yan', ['神抽', '使用', '藏宝图', 'M3']);
  updated = h.storedJson(key);
  assert.ok(updated.board.some((c) => c.suit === 'M' && c.value === 3));
  assert.equal(updated.discard.length, 2);
  assert.equal(updated.pending.type, 'M', '获得的美人鱼应继续触发自身牌效');
});

test('亡命神抽弯刀在满足条件时可由玩家选择目标使用', async () => {
  const h = createHarness();
  await h.run('yan', ['神抽', '人机']);
  const key = `aff.room.v1:dmd:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  const humanIndex = room.players.findIndex((p) => !p.isBot);
  const bot = room.players.find((p) => p.isBot);
  room.current = humanIndex;
  room.board = [];
  room.pending = null;
  room.forcedDraws = 0;
  bot.collected.P = [7];
  room.deck = [{ suit: 'D', value: 2 }].concat(room.deck.filter((c) => `${c.suit}${c.value}` !== 'D2'));
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('yan', ['神抽', '抽牌']);
  let updated = h.storedJson(key);
  assert.equal(updated.pending.type, 'D');
  const skipped = await h.run('yan', ['神抽', '放弃效果']);
  assert.match(skipped[0].text, /弯刀.*必须执行.*不能放弃/);
  updated = h.storedJson(key);
  assert.equal(updated.pending.type, 'D');
  await h.run('yan', ['神抽', '使用', '弯刀', 'P7', bot.name]);
  updated = h.storedJson(key);
  assert.ok(updated.board.some((c) => c.suit === 'P' && c.value === 7));
  assert.equal(updated.players.find((p) => p.id === bot.id).collected.P.length, 0);
});

test('亡命神抽道具没有合法目标时不会锁住回合', async () => {
  const h = createHarness();
  await h.run('yan', ['神抽', '人机']);
  const key = `aff.room.v1:dmd:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.current = room.players.findIndex((p) => !p.isBot);
  room.board = [];
  room.pending = null;
  room.forcedDraws = 0;
  room.players.forEach((p) => Object.keys(p.collected).forEach((suit) => { p.collected[suit] = []; }));
  room.deck = [{ suit: 'D', value: 2 }].concat(room.deck.filter((c) => `${c.suit}${c.value}` !== 'D2'));
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['神抽', '抽牌']);
  const updated = h.storedJson(key);
  assert.equal(updated.pending, null);
  assert.match(updated.logs[updated.logs.length - 1], /没有合法的抢夺目标/);
});

test('亡命神抽十花色收手触发高额大满贯好感并计入模块统计', async () => {
  const h = createHarness();
  await h.run('yan', ['神抽', '人机']);
  const key = `aff.room.v1:dmd:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.current = room.players.findIndex((p) => !p.isBot);
  room.board = Object.keys({ M: 1, T: 1, D: 1, G: 1, C: 1, Y: 1, B: 1, H: 1, P: 1, Z: 1 }).map((suit) => ({ suit, value: 7 }));
  room.deck = [];
  room.forcedDraws = 0;
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['神抽', '收手']);
  const finished = h.storedJson(key);
  const me = finished.players.find((p) => !p.isBot);
  assert.equal(me.grandSlams, 1);
  assert.equal(finished.status, 'finished');
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.affection, 65);
  assert.equal(profile.stats.dmd.grandSlams, 1);
  assert.equal(profile.stats.dmd.affectionGained, 65);
  assert.equal(profile.stats.dmd.affectionLost, 0);
  assert.equal(profile.stats.dmd.affection, 65);
  assert.equal(profile.coins, 600);
  assert.equal(profile.stats.dmd.profit, 100);
  const detail = await h.run('yan', ['我的', '神抽']);
  assert.match(detail[0].text, /累计获得好感 \+65/);
  assert.match(detail[0].text, /大满贯 1 次/);
});

test('对决结算强制失败损失绝对值大于胜利收益', async () => {
  const h = createHarness();
  h.configs.set('对决胜利好感', 50);
  h.configs.set('对决失败好感', -1);
  await h.run('yan', ['21点', '开始']);
  const key = `aff.room.v1:blackjack:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.player.hp = 1;
  room.player.hand = [8, 10];
  room.player.lastDrawn = 10;
  room.enemy.hand = [9, 10];
  room.enemy.lastDrawn = 10;
  room.player.stand = false;
  room.enemy.stand = true;
  room.player.busted = false;
  room.enemy.busted = false;
  room.deck = [1, 2, 3, 4, 5, 6, 7, 11];
  room.buffs = [];
  room.turn = 'player';
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['21点', '停牌']);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.affection, -51);
  assert.equal(profile.stats.blackjack.affectionGained, 0);
  assert.equal(profile.stats.blackjack.affectionLost, 51);
  assert.equal(profile.stats.blackjack.affection, -51);
  assert.equal(profile.coins, 400);
  assert.equal(profile.stats.blackjack.profit, -100);
});

test('Farkle获胜获得两倍入场费', async () => {
  const h = createHarness();
  await h.run('yan', ['快艇', '人机']);
  const key = `aff.room.v1:farkle:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key); const humanIndex = room.players.findIndex((p) => !p.isBot); const human = room.players[humanIndex];
  room.current = humanIndex; human.score = 4900; human.turnScore = 100; human.bestTurn = 500; room.phase = 'kept';
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['快艇', '存分']);
  const finished = h.storedJson(key); const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.winnerId, human.id);
  assert.equal(finished.ranking.find((row) => row.id === human.id).coinReward, 200);
  assert.equal(profile.coins, 600);
  assert.equal(profile.stats.farkle.profit, 100);
});

test('Farkle四条加单1单5正确计为1150分', async () => {
  const h = createHarness();
  await h.run('yan', ['快艇', '人机']);
  const key = `aff.room.v1:farkle:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.current = room.players.findIndex((p) => !p.isBot);
  room.phase = 'rolled';
  room.dice = [2, 2, 2, 2, 1, 5];
  room.remaining = 6;
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['快艇', '选择', '2,2,2,2,1,5']);
  const updated = h.storedJson(key);
  const player = updated.players.find((p) => !p.isBot);
  assert.equal(player.turnScore, 1150);
  assert.equal(updated.remaining, 6, 'hot dice should reset to six dice');
});

test('Farkle拒绝夹带不计分骰子的选择', async () => {
  const h = createHarness();
  await h.run('yan', ['快艇', '人机']);
  const key = `aff.room.v1:farkle:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.current = room.players.findIndex((p) => !p.isBot);
  room.phase = 'rolled';
  room.dice = [2, 2, 2, 3, 4, 6];
  h.ext.storageSet(key, JSON.stringify(room));
  const replies = await h.run('yan', ['快艇', '选择', '2,2,2,3']);
  assert.match(replies[0].text, /不计分骰/);
  const updated = h.storedJson(key);
  assert.equal(updated.players.find((p) => !p.isBot).turnScore, 0);
});

test('Farkle帮助、对局与骰面会发送专用结构化骰桌', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '快艇手']);
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['快艇']);
  await h.run('yan', ['快艇', '人机']);
  const key = `aff.room.v1:farkle:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(key);
  room.current = room.players.findIndex((player) => !player.isBot);
  room.phase = 'rolled'; room.dice = [1, 1, 5, 2, 3, 6]; room.remaining = 6;
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('yan', ['快艇', '状态']);
  assert.equal(views.length, 3);
  assert.equal(views[0].farkleTable.status, 'menu');
  assert.equal(views[0].farkleTable.help.length, 6);
  assert.match(views[0].farkleTable.help[0], /教程/);
  assert.equal(views[1].farkleTable.status, 'playing');
  assert.equal(views[1].farkleTable.players.length, 2);
  assert.deepEqual(Array.from(views[2].farkleTable.dice), [1, 1, 5, 2, 3, 6]);
  assert.equal(views[2].farkleTable.phaseLabel, '选择计分骰');
  assert.ok(views[2].farkleTable.suggestedScore > 0);
});

test('Farkle玩家爆骰后保留骰面回看并显示Bot上一轮入账', async () => {
  const rolls = [0.20, 0.40, 0.55, 0.90, 0.20, 0.40, 0.01, 0.20, 0.34, 0.51, 0.68, 0.85];
  let useScriptedRolls = false;
  const views = [];
  const h = createHarness({
    random: () => useScriptedRolls ? (rolls.shift() ?? 0.1) : 0.1,
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: '/api/image/000000000000000000000001' }) };
    }
  });
  await h.run('快艇', ['人机']);
  useScriptedRolls = true;
  h.configs.set('启用图片输出', true);
  await h.run('快艇', ['投掷']);
  const room = h.storedJson(`aff.room.v1:farkle:${encodeURIComponent('QQ-Group:2001')}`);
  assert.deepEqual(Array.from(room.dice), [], '实际游戏状态应清空爆骰骰面');
  assert.deepEqual(Array.from(room.lastHumanTurn.dice), [2, 3, 4, 6, 2, 3]);
  assert.equal(room.lastHumanTurn.farkled, true);
  assert.equal(room.lastBotTurn.farkled, false);
  assert.equal(room.lastBotTurn.gained, 1500);
  assert.equal(room.players.find((player) => player.isBot).score, 1500);
  assert.equal(views.length, 1);
  assert.equal(views[0].farkleTable.diceReview, true);
  assert.deepEqual(Array.from(views[0].farkleTable.dice), [2, 3, 4, 6, 2, 3]);
  assert.equal(views[0].farkleTable.lastBotTurn.gained, 1500);
});

test('钓鱼可及时收杆并结算到统一钱包', async () => {
  const h = createHarness();
  await h.run('yan', ['钓鱼', '小鱼塘']);
  const sessionKey = `aff.fishing.v1:${encodeURIComponent('QQ:1001')}`;
  const session = h.storedJson(sessionKey);
  assert.equal(session.status, 'playing');
  assert.ok(session.value > 0);
  await h.run('yan', ['钓鱼', '收杆']);
  const banked = h.storedJson(sessionKey);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(banked.status, 'banked');
  assert.equal(profile.stats.fishing.plays, 1);
  assert.ok(profile.coins >= 490);
});

test('钓鱼菜单与垂钓现场会发送结构化场景图', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.runRaw('yan', ['注册', '钓鱼佬']);
  h.configs.set('启用图片输出', true);
  await h.run('yan', ['钓鱼']);
  await h.run('yan', ['钓鱼', '江水']);
  assert.equal(views.length, 2);
  assert.equal(views[0].fishingScene.status, 'menu');
  assert.equal(views[0].fishingScene.pondOptions.length, 3);
  assert.ok(views[0].fishingScene.pondOptions.every((pond) => pond.speciesCount === 16));
  assert.equal(views[1].fishingScene.status, 'playing');
  assert.equal(views[1].fishingScene.pond, '江水');
  assert.equal(views[1].fishingScene.haul.length, 1);
  assert.ok(views[1].fishingScene.haul[0].name);
  assert.ok(views[1].fishingScene.risk > 0);
});

test('钓鱼断线结算保留损失现场信息', async () => {
  const h = createHarness();
  await h.run('yan', ['钓鱼', '大海']);
  const key = `aff.fishing.v1:${encodeURIComponent('QQ:1001')}`;
  const session = h.storedJson(key);
  session.status = 'lost'; session.lostCount = session.haul.length; session.lostValue = session.value;
  session.haul = []; session.value = 0; session.event = `鱼线断裂，损失 ${session.lostCount} 条鱼和 ${session.lostValue} 币估值。`;
  h.ext.storageSet(key, JSON.stringify(session));
  await h.run('yan', ['钓鱼', '收杆']);
  const banked = h.storedJson(key);
  assert.equal(banked.status, 'banked');
  assert.equal(banked.outcome, 'lost');
  assert.match(banked.event, /鱼线断裂.*损失/);
  assert.equal(banked.reward, 0);
});

test('钓鱼逃脱会按水域投入扣除好感并写入统计', async () => {
  const cases = [['小鱼塘', 1], ['江水', 2], ['大海', 4]];
  for (const [pond, expectedLoss] of cases) {
    const h = createHarness();
    await h.run('钓鱼', [pond]);
    const sessionKey = `aff.fishing.v1:${encodeURIComponent('QQ:1001')}`;
    const session = h.storedJson(sessionKey);
    session.status = 'lost'; session.lostCount = session.haul.length; session.lostValue = session.value;
    session.haul = []; session.value = 0; session.event = '鱼线断裂，鱼获逃脱。';
    h.ext.storageSet(sessionKey, JSON.stringify(session));
    const replies = await h.run('钓鱼', ['收杆']);
    const banked = h.storedJson(sessionKey);
    const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
    assert.equal(banked.affectionDelta, -expectedLoss, `${pond}失败好感`);
    assert.equal(profile.affection, -expectedLoss);
    assert.equal(profile.stats.fishing.affectionLost, expectedLoss);
    assert.equal(profile.stats.fishing.affection, -expectedLoss);
    assert.match(replies[0].text, new RegExp(`好感 -${expectedLoss}`));
  }
});

test('钓鱼断线鱼获不会写入图鉴或历史极值', async () => {
  const h = createHarness();
  await h.run('yan', ['钓鱼', '大海']);
  const sessionKey = `aff.fishing.v1:${encodeURIComponent('QQ:1001')}`;
  const session = h.storedJson(sessionKey);
  session.status = 'lost'; session.lostCount = 4; session.lostValue = 999; session.value = 0; session.haul = [];
  session.caughtHistory = [
    { name: '麦穗鱼', pond: '小鱼塘', rarity: 0, size: 0.18, value: 4 },
    { name: '皇带鱼', pond: '大海', rarity: 3, size: 6.2, value: 800 },
    { name: '鳜鱼', pond: '江水', rarity: 2, size: 2.75, value: 100 }
  ];
  session.event = '鱼线断裂，未安全收入囊中的鱼不计入档案。';
  h.ext.storageSet(sessionKey, JSON.stringify(session));
  await h.run('yan', ['钓鱼', '收杆']);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  const stats = profile.stats.fishing;
  assert.equal(stats.biggestFish, null);
  assert.equal(stats.smallestFish, null);
  assert.deepEqual(stats.fishDex, {});
  const detail = await h.run('yan', ['我的', '钓鱼']);
  assert.match(detail[0].text, /历史最大鱼 尚无记录/);
  assert.match(detail[0].text, /图鉴解锁 0\/48（0%）/);
});

test('钓鱼安全收杆可解锁完整48种图鉴并记录大小极值', async () => {
  const h = createHarness();
  await h.run('yan', ['钓鱼', '大海']);
  const sessionKey = `aff.fishing.v1:${encodeURIComponent('QQ:1001')}`;
  const session = h.storedJson(sessionKey);
  const names = [
    '麦穗鱼', '白条鱼', '鳑鲏', '泥鳅', '鲫鱼', '鲤鱼', '黄颡鱼', '罗非鱼', '锦鲤', '乌鳢', '翘嘴鲌', '大口鲶', '老甲鱼', '金色锦鲤', '巨型鳄雀鳝', '镜鲤鱼王',
    '鳊鱼', '马口鱼', '赤眼鳟', '餐条', '鲈鱼', '青鱼', '草鱼', '鲢鱼', '鳜鱼', '长江鲟', '胭脂鱼', '鳗鲡', '江豚影子', '白鲟幻影', '巨型鲶鱼', '川陕哲罗鲑',
    '鲭鱼', '沙丁鱼', '秋刀鱼', '竹荚鱼', '石斑鱼', '真鲷', '鲣鱼', '带鱼', '蓝鳍金枪鱼', '旗鱼', '剑鱼', '苏眉鱼', '皇带鱼', '鲸鲨', '腔棘鱼', '皱鳃鲨'
  ];
  session.status = 'playing'; session.haul = names.map((name, index) => ({ name, rarity: Math.floor((index % 16) / 4), size: (index + 1) / 10, value: 10 }));
  session.value = 480; session.stage = 5;
  h.ext.storageSet(sessionKey, JSON.stringify(session));
  await h.run('yan', ['钓鱼', '收杆']);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`); const stats = profile.stats.fishing;
  assert.equal(Object.keys(stats.fishDex).length, 48);
  assert.equal(stats.smallestFish.name, '麦穗鱼'); assert.equal(stats.smallestFish.size, 0.1);
  assert.equal(stats.biggestFish.name, '皱鳃鲨'); assert.equal(stats.biggestFish.size, 4.8);
  const detail = await h.run('yan', ['我的', '钓鱼']);
  assert.match(detail[0].text, /图鉴解锁 48\/48（100%）/);
});

test('旧钓鱼档案缺少图鉴字段时可自动兼容', async () => {
  const h = createHarness({ autoRegister: false });
  const key = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  h.ext.storageSet(key, JSON.stringify({
    id: 'QQ:1001', name: '旧钓友', registered: true, coins: 500, affection: 0,
    stats: { fishing: { plays: 2, wins: 1, losses: 1, score: 33, best: 25, profit: -7 } }
  }));
  const detail = await h.runRaw('yan', ['我的', '钓鱼']);
  assert.match(detail[0].text, /图鉴解锁 0\/48（0%）/);
  const migrated = h.storedJson(key);
  assert.deepEqual(migrated.stats.fishing.fishDex, {});
  assert.equal(migrated.stats.fishing.biggestFish, null);
  assert.equal(migrated.stats.fishing.smallestFish, null);
});

test('小游戏结算后无参数入口清除快照并返回帮助，显式状态仍可复查', async () => {
  const roomCases = [
    { module: '德州', start: ['德州', '开房'], game: 'poker', help: /\.yan 德州 人机/ },
    { module: '21点', start: ['21点', '开始'], game: 'blackjack', help: /\.yan 21点 教程/ },
    { module: '神抽', start: ['神抽', '开房'], game: 'dmd', help: /\.yan 神抽 人机/ },
    { module: '快艇', start: ['快艇', '开房'], game: 'farkle', help: /\.yan 快艇 人机/ }
  ];

  for (const item of roomCases) {
    const h = createHarness();
    const key = `aff.room.v1:${item.game}:${encodeURIComponent('QQ-Group:2001')}`;
    await h.run('yan', item.start);
    await h.run('yan', [item.module]);
    assert.notEqual(h.ext.storageGet(key), '', `${item.module}进行中或等待中的房间不应被清除`);

    const room = h.storedJson(key);
    room.status = 'finished';
    h.ext.storageSet(key, JSON.stringify(room));
    await h.run('yan', [item.module, '状态']);
    assert.notEqual(h.ext.storageGet(key), '', `${item.module}显式状态应保留结算快照`);

    const menu = await h.run('yan', [item.module]);
    assert.match(menu[0].text, item.help);
    assert.equal(h.ext.storageGet(key), '', `${item.module}无参数入口应清除结算快照`);
  }

  const fishing = createHarness();
  const fishingKey = `aff.fishing.v1:${encodeURIComponent('QQ:1001')}`;
  await fishing.run('yan', ['钓鱼', '小鱼塘']);
  await fishing.run('yan', ['钓鱼']);
  assert.notEqual(fishing.ext.storageGet(fishingKey), '', '进行中的垂钓不应被清除');
  await fishing.run('yan', ['钓鱼', '收杆']);
  await fishing.run('yan', ['钓鱼', '状态']);
  assert.notEqual(fishing.ext.storageGet(fishingKey), '', '钓鱼显式状态应保留结算快照');
  const fishingMenu = await fishing.run('yan', ['钓鱼']);
  assert.match(fishingMenu[0].text, /钓鱼佬 · 选择水域/);
  assert.equal(fishing.ext.storageGet(fishingKey), '');

  const scratch = createHarness();
  const ticketKey = `aff.scratch.ticket.v1:${encodeURIComponent('QQ:1001')}`;
  await scratch.run('yan', ['刮刮', '买', '10', '幸运数字']);
  await scratch.run('yan', ['刮刮', '刮开']);
  assert.equal(scratch.ext.storageGet(ticketKey), '');
  const scratchMenu = await scratch.run('yan', ['刮刮']);
  assert.match(scratchMenu[0].text, /\.yan 刮刮 买/);
});

test('德州、神抽与快艇多人房余额不足时可开房和加入并标记游客', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  const owner = { id: 'QQ:guest-owner', name: '游客房主' };
  const joiner = { id: 'QQ:guest-joiner', name: '游客成员' };
  const ownerKey = await setProfileCoins(h, owner, 0);
  const joinerKey = await setProfileCoins(h, joiner, 0);
  h.configs.set('启用图片输出', true);

  const games = [
    { module: '德州', game: 'poker', table: 'pokerTable', players: 'seats' },
    { module: '神抽', game: 'dmd', table: 'dmdTable', players: 'players' },
    { module: '快艇', game: 'farkle', table: 'farkleTable', players: 'players' }
  ];
  for (const item of games) {
    const beforeOpen = views.length;
    await h.run('yan', [item.module, '开房'], owner);
    let room = h.storedJson(`aff.room.v1:${item.game}:${encodeURIComponent('QQ-Group:2001')}`);
    let seat = room.players.find((player) => player.id === owner.id);
    assert.equal(seat.paid, false, `${item.module}游客房主不应扣费`);
    assert.equal(seat.guest, true);
    assert.match(views[beforeOpen].quote, /游客/);
    assert.equal(views[beforeOpen][item.table][item.players].find((player) => player.name === owner.name).isGuest, true);

    const beforeJoin = views.length;
    await h.run('yan', [item.module, '加入'], joiner);
    room = h.storedJson(`aff.room.v1:${item.game}:${encodeURIComponent('QQ-Group:2001')}`);
    seat = room.players.find((player) => player.id === joiner.id);
    assert.equal(seat.paid, false, `${item.module}游客成员不应扣费`);
    assert.equal(seat.guest, true);
    assert.match(views[beforeJoin].quote, /游客/);
    assert.equal(views[beforeJoin][item.table][item.players].find((player) => player.name === joiner.name).isGuest, true);
  }
  assert.equal(h.storedJson(ownerKey).coins, 0);
  assert.equal(h.storedJson(joinerKey).coins, 0);
});

test('余额不足的人机模式仍拒绝入场', async () => {
  const h = createHarness(); const user = { id: 'QQ:no-coins-pve', name: '零币玩家' };
  const profileKey = await setProfileCoins(h, user, 0);
  const games = [
    { module: '德州', game: 'poker' }, { module: '神抽', game: 'dmd' }, { module: '快艇', game: 'farkle' }
  ];
  for (const item of games) {
    const result = await h.run('yan', [item.module, '人机'], user);
    assert.match(result[0].text, /无法入场|需要 \d+ 游戏币/);
    assert.equal(h.storedJson(`aff.room.v1:${item.game}:${encodeURIComponent('QQ-Group:2001')}`), null);
  }
  assert.equal(h.storedJson(profileKey).coins, 0);
});

test('等待房退出只给付费玩家退款，游客余额保持不变', async () => {
  const h = createHarness(); const owner = { id: 'QQ:refund-owner', name: '付费房主' }; const guest = { id: 'QQ:refund-guest', name: '退款游客' };
  await h.run('yan', ['我的'], owner); const ownerKey = `aff.profile.v1:${encodeURIComponent(owner.id)}`;
  const guestKey = await setProfileCoins(h, guest, 0);
  await h.run('快艇', ['开房'], owner); await h.run('快艇', ['加入'], guest);
  const guestExit = await h.run('快艇', ['退出'], guest);
  assert.match(guestExit[0].text, /没有收取入场费/);
  assert.equal(h.storedJson(guestKey).coins, 0);
  assert.equal(h.storedJson(ownerKey).coins, 400);
  const ownerExit = await h.run('快艇', ['退出'], owner);
  assert.match(ownerExit[0].text, /退还入场费/);
  assert.equal(h.storedJson(ownerKey).coins, 500);
});

test('旧多人房缺少paid字段时默认真人已经付费', async () => {
  const h = createHarness(); const user = { id: 'QQ:legacy-paid', name: '旧房玩家' };
  await h.run('快艇', ['开房'], user);
  const roomKey = `aff.room.v1:farkle:${encodeURIComponent('QQ-Group:2001')}`;
  const profileKey = `aff.profile.v1:${encodeURIComponent(user.id)}`;
  const room = h.storedJson(roomKey); delete room.players[0].paid; delete room.players[0].guest;
  h.ext.storageSet(roomKey, JSON.stringify(room));
  await h.run('快艇', ['退出'], user);
  assert.equal(h.storedJson(profileKey).coins, 500, '旧房真人应按已付费处理并正常退款');
});

test('德州游客完成摊牌后不写入奖励、战绩或最大牌型', async () => {
  const h = createHarness(); const user = { id: 'QQ:poker-guest', name: '德州游客' };
  const profileKey = await setProfileCoins(h, user, 0);
  await h.run('德州', ['开房'], user); await h.run('德州', ['机器人', '1'], user); await h.run('德州', ['开始'], user);
  const roomKey = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(roomKey); const human = room.players.find((player) => !player.isBot); const bot = room.players.find((player) => player.isBot);
  room.stage = 'river'; room.status = 'playing'; room.pot = 299; room.currentBet = 150;
  room.board = [
    { suit: 'C', rank: '4', value: 4 }, { suit: 'D', rank: '7', value: 7 }, { suit: 'H', rank: '9', value: 9 },
    { suit: 'S', rank: 'J', value: 11 }, { suit: 'D', rank: 'K', value: 13 }
  ];
  human.hand = [{ suit: 'S', rank: 'A', value: 14 }, { suit: 'H', rank: 'A', value: 14 }];
  bot.hand = [{ suit: 'C', rank: '2', value: 2 }, { suit: 'D', rank: '3', value: 3 }];
  human.handStartStack = 150; human.stack = 1; human.roundBet = 149; human.totalBet = 149; human.status = 'active'; human.acted = false; human.foldedThisHand = false;
  bot.handStartStack = 150; bot.stack = 0; bot.roundBet = 150; bot.totalBet = 150; bot.status = 'allin'; bot.acted = true; bot.foldedThisHand = false;
  room.turn = room.players.indexOf(human); h.ext.storageSet(roomKey, JSON.stringify(room));

  const result = await h.run('德州', ['全押'], user);
  const finished = h.storedJson(roomKey); const profile = h.storedJson(profileKey);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.ranking.find((row) => row.id === user.id).guest, true);
  assert.match(result[0].text, /游客.*不结算|不结算.*游客/);
  assertGameStatsUntouched(profile, 'poker');
  assert.equal(profile.stats.poker.bestPokerHand, null);
});

test('亡命神抽游客大满贯只保留本桌表现且不写入档案', async () => {
  const h = createHarness(); const user = { id: 'QQ:dmd-guest', name: '神抽游客' };
  const profileKey = await setProfileCoins(h, user, 0);
  await h.run('神抽', ['开房'], user); await h.run('神抽', ['机器人', '1'], user); await h.run('神抽', ['开始'], user);
  const roomKey = `aff.room.v1:dmd:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(roomKey); const humanIndex = room.players.findIndex((player) => !player.isBot);
  room.current = humanIndex; room.board = ['M', 'T', 'D', 'G', 'C', 'Y', 'B', 'H', 'P', 'Z'].map((suit) => ({ suit, value: 7 }));
  room.deck = []; room.forcedDraws = 0; room.pending = null; h.ext.storageSet(roomKey, JSON.stringify(room));

  const result = await h.run('神抽', ['收手'], user);
  const finished = h.storedJson(roomKey); const profile = h.storedJson(profileKey); const human = finished.players[humanIndex];
  assert.equal(finished.status, 'finished');
  assert.equal(human.grandSlams, 1, '游客仍应在本桌看到自己达成的大满贯');
  assert.equal(finished.ranking.find((row) => row.id === user.id).guest, true);
  assert.match(result[0].text, /游客.*不结算|不结算.*游客/);
  assertGameStatsUntouched(profile, 'dmd');
  assert.equal(profile.stats.dmd.grandSlams, 0);
});

test('Farkle游客完成比赛不写入奖励、好感或项目统计', async () => {
  const h = createHarness(); const user = { id: 'QQ:farkle-guest', name: '快艇游客' };
  const profileKey = await setProfileCoins(h, user, 0);
  await h.run('快艇', ['开房'], user); await h.run('快艇', ['机器人', '1'], user); await h.run('快艇', ['开始'], user);
  const roomKey = `aff.room.v1:farkle:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(roomKey); const humanIndex = room.players.findIndex((player) => !player.isBot); const human = room.players[humanIndex];
  room.current = humanIndex; human.score = 4900; human.turnScore = 100; human.bestTurn = 500; room.phase = 'kept'; h.ext.storageSet(roomKey, JSON.stringify(room));

  const result = await h.run('快艇', ['存分'], user);
  const finished = h.storedJson(roomKey); const profile = h.storedJson(profileKey);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.ranking.find((row) => row.id === user.id).guest, true);
  assert.match(result[0].text, /游客.*不结算|不结算.*游客/);
  assertGameStatsUntouched(profile, 'farkle');
});

test('付费玩家和游客同桌时只给付费玩家结算', async () => {
  const h = createHarness(); const owner = { id: 'QQ:paid-owner', name: '付费房主' }; const guest = { id: 'QQ:mixed-guest', name: '混桌游客' };
  await h.run('yan', ['我的'], owner); const ownerKey = `aff.profile.v1:${encodeURIComponent(owner.id)}`;
  const guestKey = await setProfileCoins(h, guest, 0);
  await h.run('快艇', ['开房'], owner); await h.run('快艇', ['加入'], guest); await h.run('快艇', ['开始'], owner);
  const roomKey = `aff.room.v1:farkle:${encodeURIComponent('QQ-Group:2001')}`;
  const room = h.storedJson(roomKey); const ownerIndex = room.players.findIndex((player) => player.id === owner.id); const ownerSeat = room.players[ownerIndex];
  room.current = ownerIndex; ownerSeat.score = 4900; ownerSeat.turnScore = 100; ownerSeat.bestTurn = 500; room.phase = 'kept'; h.ext.storageSet(roomKey, JSON.stringify(room));
  await h.run('快艇', ['存分'], owner);

  const ownerProfile = h.storedJson(ownerKey); const guestProfile = h.storedJson(guestKey); const finished = h.storedJson(roomKey);
  assert.equal(ownerProfile.coins, 600);
  assert.equal(ownerProfile.affection, 5);
  assert.equal(ownerProfile.stats.farkle.plays, 1);
  assert.equal(finished.ranking.find((row) => row.id === owner.id).coinReward, 200);
  assert.equal(finished.ranking.find((row) => row.id === guest.id).guest, true);
  assertGameStatsUntouched(guestProfile, 'farkle');
});

test('德州多人重赛允许零余额房主转为游客，人机重赛仍要求付费', async () => {
  const multiplayer = createHarness(); const owner = { id: 'QQ:rematch-owner', name: '重赛房主' }; const peer = { id: 'QQ:rematch-peer', name: '重赛成员' };
  await multiplayer.run('德州', ['开房'], owner); await multiplayer.run('德州', ['加入'], peer);
  const roomKey = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`;
  let room = multiplayer.storedJson(roomKey); room.status = 'finished'; room.stage = 'tournament_end'; room.settled = true; multiplayer.ext.storageSet(roomKey, JSON.stringify(room));
  await setProfileCoins(multiplayer, owner, 0);
  const result = await multiplayer.run('德州', ['下一局'], owner);
  room = multiplayer.storedJson(roomKey); const ownerSeat = room.players.find((player) => player.id === owner.id);
  assert.equal(room.status, 'waiting'); assert.equal(ownerSeat.guest, true); assert.equal(ownerSeat.paid, false);
  assert.match(result[0].text, /游客/);

  const pve = createHarness(); const solo = { id: 'QQ:rematch-pve', name: '人机玩家' };
  await pve.run('德州', ['人机'], solo);
  const pveRoomKey = `aff.room.v1:poker:${encodeURIComponent('QQ-Group:2001')}`;
  room = pve.storedJson(pveRoomKey); room.status = 'finished'; room.stage = 'tournament_end'; room.settled = true; pve.ext.storageSet(pveRoomKey, JSON.stringify(room));
  await setProfileCoins(pve, solo, 0);
  const denied = await pve.run('德州', ['下一局'], solo);
  assert.match(denied[0].text, /人机下一局仍需 150/);
  assert.equal(pve.storedJson(pveRoomKey).status, 'finished');
});

test('竞拍之王首次进入必须选择助手，赛前可更换但游戏中锁定', async () => {
  const h = createHarness();
  const first = await h.run('竞拍', []);
  assert.match(first[0].text, /选择助手/);
  assert.match(first[0].text, /加布里埃拉/);
  assert.doesNotMatch(first[0].text, /整箱估值/);

  await h.run('竞拍', ['助手', '伊森']);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.auctionAssistant, '伊森');

  await h.run('竞拍', ['助手', '卡洛斯']);
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`).auctionAssistant, '卡洛斯');
  await h.run('竞拍', ['开房']); await h.run('竞拍', ['助手', '索菲']);
  let waiting = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(waiting.players.find((player) => player.id === 'QQ:1001').assistant, '索菲');
  await h.run('竞拍', ['开始']);
  const cannotChange = await h.run('竞拍', ['助手', '伊森']);
  assert.match(cannotChange[0].text, /进行中不能更换助手/);
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`).auctionAssistant, '索菲');
});

test('竞拍菜单向图片渲染器传递当前1比10000兑换倍率', async () => {
  const views = [];
  const h = createHarness({
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: '/api/image/000000000000000000000001' }) };
    }
  });
  await h.run('竞拍', ['助手', '索菲']);
  h.configs.set('启用图片输出', true);
  await h.run('竞拍', []);
  const menu = views.at(-1);
  assert.equal(menu.auctionScene.mode, 'menu');
  assert.equal(menu.auctionScene.auctionRate, 10000);
  assert.doesNotMatch(JSON.stringify(menu), /1\s*游戏币\s*=\s*1,?000\s*竞拍币/);
});

test('竞拍估价与开局统计助手会自动生成玩家私有报告且不公开精确总价', async () => {
  const cases = [
    ['玛丽亚', 'valuation', '排雷估价', true],
    ['维克托', 'statistics', '高阶统计', false],
    ['艾哈迈德', 'valuation', '宏观估价', true]
  ];
  for (const [assistant, kind, typeLabel, hasValuation] of cases) {
    const views = [];
    const h = createHarness({
      random: () => 0.5,
      fetch: async (url, options) => {
        views.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
      }
    });
    await h.run('竞拍', ['助手', assistant]); h.configs.set('启用图片输出', true); await h.run('竞拍', ['人机']);
    const room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
    const player = room.players.find((row) => row.id === 'QQ:1001'); const scene = views.at(-1).auctionScene; const report = scene.assistantReport;
    assert.equal(player.skillUsed, true, `${assistant}的开局被动应自动发动`);
    assert.equal(player.assistantActivated, true);
    assert.equal(scene.assistant.kind, kind);
    assert.equal(report.kind, kind);
    assert.equal(report.typeLabel, typeLabel);
    assert.ok(report.stats.length >= 3);
    assert.equal(Object.prototype.hasOwnProperty.call(report, 'actual'), false);
    assert.equal(scene.players.some((row) => Object.prototype.hasOwnProperty.call(row, 'assistantReport')), false, '其他座位不能携带私人助手报告');
    if (hasValuation) {
      assert.ok(report.valuation.low < report.valuation.high);
      assert.notEqual(report.valuation.low, room.container.saleValue);
      assert.notEqual(report.valuation.high, room.container.saleValue);
      assert.doesNotMatch(JSON.stringify(report), new RegExp(`[:\"]${room.container.saleValue}[,\"]`));
    } else assert.equal(report.valuation, null);
  }
});

test('艾哈迈德会在第三轮将开局整箱估价区间收窄', async () => {
  const views = [];
  const h = createHarness({
    random: () => 0.5,
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.run('竞拍', ['助手', '艾哈迈德']); h.configs.set('启用图片输出', true); await h.run('竞拍', ['人机']);
  const opening = views.at(-1).auctionScene.assistantReport.valuation;
  await h.run('竞拍', ['出价', '10000']); await h.run('竞拍', ['出价', '10000']);
  const room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`); const report = views.at(-1).auctionScene.assistantReport;
  assert.equal(room.round, 3);
  assert.equal(report.round, 3);
  assert.match(report.valuation.label, /第3轮/);
  assert.ok(report.valuation.high - report.valuation.low < opening.high - opening.low);
  assert.notEqual(report.valuation.low, room.container.saleValue);
  assert.notEqual(report.valuation.high, room.container.saleValue);
});

test('竞拍人机局公开轮次名次但不泄露Bot性格、对手金额或整箱估值', async () => {
  const views = [];
  const h = createHarness({
    random: () => 0.5,
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.run('竞拍', ['助手', '伊森']);
  h.configs.set('启用图片输出', true);
  const reply = await h.run('竞拍', ['人机']);
  assert.match(reply[0].text, /^\[CQ:image,file=.*cache=0\]$/);

  const room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.status, 'playing');
  assert.equal(room.players.filter((player) => player.isBot).length, 3);
  assert.equal(room.players.length, 4);
  assert.equal(room.venue, '新手仓');
  const scene = views.at(-1).auctionScene;
  assert.equal(scene.mode, 'bidding');
  assert.equal(scene.players.filter((player) => player.isBot).length, 3);
  assert.ok(scene.players.filter((player) => player.isBot).every((player) => player.ownBid === 0));
  assert.ok(scene.players.every((player) => !Object.prototype.hasOwnProperty.call(player, 'behavior')));
  assert.ok(scene.players.every((player) => player.rank === 0 && player.rankHistory.length === 5));
  assert.equal(scene.estimate, undefined);
  assert.ok(scene.minimumEstimate > 0 && scene.minimumEstimate <= room.container.saleValue);
  assert.ok(scene.container.code);
  assert.equal(scene.container.gridWidth, 12);
  assert.equal(scene.container.gridHeight, 10);
  assert.equal(scene.cells.length, 120);
  assert.equal(scene.cells.filter((cell) => cell.public && cell.revealed).length, 4);
  assert.ok(room.container.items.length >= 16);
  assert.equal(new Set(room.container.items.map((item) => item.uid)).size, room.container.items.length);
  assert.ok(scene.cells.filter((cell) => !cell.revealed).every((cell) => !cell.occupied && cell.rarity === -1));
  assert.ok(scene.items.every((item) => item.fullyRevealed && item.value === 0));
  assert.doesNotMatch(scene.feedback.join('\n'), /\d+\.[^\n]+[›>]/);

  const knownBeforeSkill = scene.items.length;
  await h.run('竞拍', ['技能']);
  const inspected = views.at(-1).auctionScene;
  assert.ok(inspected.items.length >= knownBeforeSkill + 3, '伊森应随机完整识别三件未知货物');
  assert.ok(inspected.items.every((item) => item.visualKnown && item.fullyRevealed));
  assert.ok(inspected.minimumEstimate >= scene.minimumEstimate && inspected.minimumEstimate <= room.container.saleValue);
  await h.run('竞拍', ['出价', '10000']);
  const ranked = views.at(-1).auctionScene;
  assert.ok(ranked.players.every((player) => player.rank > 0 && player.rankHistory[0] === player.rank));
  assert.ok(ranked.players.filter((player) => player.isBot).every((player) => player.ownBid === 0), '公开排名后仍不能泄露Bot金额');
});

test('竞拍战争迷雾每轮公开四格且个人每轮只能探索一格', async () => {
  const h = createHarness({ random: () => 0.5 });
  await h.run('竞拍', ['助手', '索菲']); await h.run('竞拍', ['人机']);
  const roomKey = `aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`;
  let room = h.storedJson(roomKey); const player = room.players.find((row) => row.id === 'QQ:1001');
  assert.equal(Object.keys(room.publicExploredCells).length, 4);
  const hidden = [];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) if (!room.publicExploredCells[`${x},${y}`]) hidden.push({ x, y, label: `${String.fromCharCode(65 + x)}${y + 1}` });
  await h.run('竞拍', ['探索', hidden[0].label]);
  room = h.storedJson(roomKey); assert.equal(room.players.find((row) => row.id === player.id).exploredRound, 1);
  const denied = await h.run('竞拍', ['探索', hidden[1].label]); assert.match(denied[0].text, /已经进行过个人探索/);
  await h.run('竞拍', ['出价', '10000']);
  room = h.storedJson(roomKey);
  assert.equal(room.round, 2); assert.equal(Object.keys(room.publicExploredCells).length, 8);
  assert.equal(room.players.find((row) => row.id === player.id).exploredRound, 0);
  assert.ok(room.players.every((row) => row.rank > 0 && row.rankHistory.length === 5 && row.rankHistory[0] === row.rank));
});

test('竞拍高额暗标可提前成交并结算利润、好感、货品图鉴与专项统计', async () => {
  const views = [];
  const h = createHarness({
    random: () => 0.5,
    fetch: async (url, options) => {
      views.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
    }
  });
  await h.run('竞拍', ['助手', '艾哈迈德']);
  await setProfileCoins(h, { id: 'QQ:1001', name: '测试员' }, 100000);
  h.configs.set('启用图片输出', true);
  await h.run('竞拍', ['人机', '收藏家遗产']);
  let room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  const winningBid = Math.ceil(room.container.saleValue * 0.9 / 10000) * 10000;
  await h.run('竞拍', ['技能']);
  await h.run('竞拍', ['出价', String(winningBid)]);
  room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.mode, 'solo');
  assert.equal(room.status, 'finished');
  assert.equal(room.result.sold, true);
  assert.equal(room.result.winnerId, 'QQ:1001');
  assert.equal(room.result.winningBid, winningBid);
  assert.equal(room.result.items.length, room.container.items.length);

  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  const stats = profile.stats.auction;
  const expectedCoinProfit = Math.floor(room.result.saleValue / 10000) - room.result.winningBid / 10000;
  assert.equal(room.result.coinDelta, expectedCoinProfit);
  assert.equal(profile.coins, 100000 + expectedCoinProfit, '成交成本与出售收入都应按1:10000折算');
  assert.equal(stats.plays, 1);
  assert.equal(stats.highestBid, winningBid);
  assert.equal(stats.auctionContainers, 1);
  assert.equal(stats.mostAuctionItems, room.result.items.length);
  assert.equal(Object.keys(stats.auctionDex).length > 0, true);
  assert.equal(stats.auctionSpend, winningBid);
  assert.equal(stats.auctionRevenue, room.result.saleValue);
  assert.equal(stats.auctionVenueStats['收藏家遗产'].wins, 1);
  assert.equal(stats.affection, profile.affection);
  assert.equal(views.at(-1).auctionScene.mode, 'result');
  assert.ok(views.at(-1).auctionScene.items.length > 0);

  await h.run('我的', ['竞拍']);
  assert.equal(views.at(-1).auctionScene.mode, 'collection');
  assert.ok(views.at(-1).auctionScene.dexUnlocked > 0);
  assert.equal(views.at(-1).auctionScene.dexTotal, 96);
  assert.ok(views.at(-1).auctionScene.sizeHints.length >= 5);

  await h.run('竞拍', []);
  assert.equal(views.at(-1).auctionScene.mode, 'menu', '结算后无参数入口应返回竞拍帮助菜单');
  assert.equal(h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`), null);
});

test('竞拍落拍放弃会退回锁定游戏币且不会扣好感', async () => {
  const h = createHarness({ random: () => 0.5 });
  await h.run('竞拍', ['助手', '索菲']);
  await h.run('竞拍', ['人机']);
  await h.run('竞拍', ['出价', '10000']);
  let profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.coins, 499, '10,000竞拍币暗标应锁定1游戏币');

  await h.run('竞拍', ['放弃']);
  profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.coins, 500, '放弃后锁定资金应全额退回');
  assert.equal(profile.affection, 0);
  assert.equal(profile.stats.auction.affection, 0);
});

test('竞拍同轮可自由升降价，降价退回差额，确认前可继续修改或撤回', async () => {
  const h = createHarness({ random: () => 0.5 });
  const owner = { id: 'QQ:auction-edit-owner', name: '改价者' }; const peer = { id: 'QQ:auction-edit-peer', name: '等待者' };
  await h.run('竞拍', ['助手', '玛丽亚'], owner);
  await h.run('竞拍', ['开房', '新手仓'], owner);
  await h.run('竞拍', ['助手', '卡洛斯'], peer);
  await h.run('竞拍', ['加入'], peer);
  await h.run('竞拍', ['开始'], owner);
  await h.run('竞拍', ['出价', '120000'], owner);
  let profile = h.storedJson(`aff.profile.v1:${encodeURIComponent(owner.id)}`);
  assert.equal(profile.coins, 488);
  await h.run('竞拍', ['出价', '50000'], owner);
  profile = h.storedJson(`aff.profile.v1:${encodeURIComponent(owner.id)}`);
  assert.equal(profile.coins, 495, '降价70,000竞拍币应退回7游戏币');
  let room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.players.find((player) => player.id === owner.id).bid, 50000);
  await h.run('竞拍', ['确认'], owner);
  room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.status, 'playing');
  assert.equal(room.players.find((player) => player.id === owner.id).confirmedRound, 1);
  await h.run('竞拍', ['撤回'], owner);
  room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.players.find((player) => player.id === owner.id).confirmedRound, 0);
  await h.run('竞拍', ['出价', '50000'], owner);
  assert.equal(h.storedJson(`aff.profile.v1:${encodeURIComponent(owner.id)}`).coins, 495, '重复同价不应重复扣款');
});

test('竞拍各场地体现货量与精品倾向且可直接用场地名开人机局', async () => {
  const beginner = createHarness({ random: () => 0.5 });
  await beginner.run('竞拍', ['助手', '加布里埃拉']);
  await beginner.run('竞拍', ['新手仓']);
  const beginnerRoom = beginner.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);

  const collector = createHarness({ random: () => 0.5 });
  await collector.run('竞拍', ['助手', '加布里埃拉']);
  await collector.run('竞拍', ['收藏家遗产']);
  const collectorRoom = collector.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  const averageRarity = (room) => room.container.items.reduce((sum, item) => sum + item.rarity, 0) / room.container.items.length;
  assert.equal(beginnerRoom.venue, '新手仓');
  assert.equal(collectorRoom.venue, '收藏家遗产');
  assert.ok(beginnerRoom.container.items.length > collectorRoom.container.items.length, '新手仓应倾向货多');
  assert.ok(averageRarity(collectorRoom) > averageRarity(beginnerRoom), '收藏家遗产应倾向精品');
});

test('旧竞拍房缺少货格数据时会退还锁定资金并无损清理', async () => {
  const h = createHarness({ random: () => 0.5 });
  await h.run('竞拍', ['助手', '索菲']);
  await h.run('竞拍', ['人机']);
  await h.run('竞拍', ['出价', '120000']);
  const roomKey = `aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`;
  const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  let room = h.storedJson(roomKey); delete room.container.items[0].uid; delete room.container.items[0].shape;
  h.ext.storageSet(roomKey, JSON.stringify(room));
  assert.equal(h.storedJson(profileKey).coins, 488);
  await h.run('竞拍', ['状态']);
  assert.equal(h.storedJson(roomKey), null);
  assert.equal(h.storedJson(profileKey).coins, 500);
});

test('旧版1比1000竞拍房会退还锁币并清理', async () => {
  const h = createHarness({ random: () => 0.5 }); await h.run('竞拍', ['助手', '索菲']); await h.run('竞拍', ['人机']);
  const roomKey = `aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`; const profileKey = `aff.profile.v1:${encodeURIComponent('QQ:1001')}`;
  const room = h.storedJson(roomKey); const player = room.players.find((row) => row.id === 'QQ:1001'); const profile = h.storedJson(profileKey);
  room.auctionRate = 1000; player.bid = 120000; player.heldCoins = 120; profile.coins = 380;
  h.ext.storageSet(roomKey, JSON.stringify(room)); h.ext.storageSet(profileKey, JSON.stringify(profile));
  const reply = await h.run('竞拍', ['状态']);
  assert.equal(h.storedJson(roomKey), null); assert.equal(h.storedJson(profileKey).coins, 500);
  assert.match(reply[0].text, /旧比例房间已清理/);
});

test('竞拍货品均为固定尺寸矩形且不重叠不越界', async () => {
  const h = createHarness({ random: () => 0.56 });
  await h.run('竞拍', ['助手', '伊森']);
  await h.run('竞拍', ['港口滞留仓']);
  const room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`); const occupied = new Set(); const sizesById = {};
  room.container.items.forEach((item) => {
    const maxX = Math.max(...item.shape.map((cell) => cell[0])); const maxY = Math.max(...item.shape.map((cell) => cell[1]));
    assert.equal(item.shape.length, (maxX + 1) * (maxY + 1), `${item.name}必须为完整长方形`);
    assert.equal(item.width, maxX + 1); assert.equal(item.height, maxY + 1); assert.equal(item.sizeLabel, `${item.width}×${item.height}`);
    if (sizesById[item.id]) assert.deepEqual([item.width, item.height], sizesById[item.id], '同一货品ID的尺寸必须固定');
    else sizesById[item.id] = [item.width, item.height];
    item.shape.forEach((cell) => {
      const x = item.gridX + cell[0]; const y = item.gridY + cell[1]; const key = `${x},${y}`;
      assert.ok(x >= 0 && x < 12 && y >= 0 && y < 10, `货格越界：${key}`);
      assert.equal(occupied.has(key), false, `货格重叠：${key}`); occupied.add(key);
    });
  });
  const mirror = createHarness({ random: () => 0.56 }); await mirror.run('竞拍', ['助手', '伊森']); await mirror.run('竞拍', ['港口滞留仓']);
  const mirrorRoom = mirror.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`); const mirrorSizes = {};
  mirrorRoom.container.items.forEach((item) => { mirrorSizes[item.id] = [item.width, item.height, item.sizeLabel]; });
  room.container.items.forEach((item) => assert.deepEqual([item.width, item.height, item.sizeLabel], mirrorSizes[item.id], `${item.name}跨局尺寸必须恒定`));
});

test('竞拍多人房会保留真人PvP并补足三名Bot，零余额游客不落档', async () => {
  const h = createHarness({ random: () => 0.5 });
  const owner = { id: 'QQ:1001', name: '房主' };
  const guest = { id: 'QQ:1002', name: '游客' };
  await h.run('竞拍', ['助手', '玛丽亚'], owner);
  await h.run('竞拍', ['开房', '高端会所'], owner);
  await h.run('竞拍', ['助手', '卡洛斯'], guest);
  await setProfileCoins(h, guest, 0);
  await h.run('竞拍', ['加入'], guest);
  await h.run('竞拍', ['开始'], owner);

  let room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.players.filter((player) => !player.isBot).length, 2);
  assert.equal(room.players.filter((player) => player.isBot).length, 3);
  assert.equal(room.players.find((player) => player.id === guest.id).guest, true);

  h.configs.set('竞拍游客预算', 100000000);
  await h.run('竞拍', ['出价', '100000000'], guest);
  await h.run('竞拍', ['确认'], guest);
  await h.run('竞拍', ['放弃'], owner);
  room = h.storedJson(`aff.room.v1:auction:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.status, 'finished');
  assert.equal(room.result.winnerId, guest.id);
  assert.equal(room.result.winnerGuest, true);
  const guestProfile = h.storedJson(`aff.profile.v1:${encodeURIComponent(guest.id)}`);
  assertGameStatsUntouched(guestProfile, 'auction');
  assert.equal(Object.keys(guestProfile.stats.auction.auctionDex).length, 0);
});

function loveTestCard(type, serial = 1) {
  return { id: `${type}${serial}`, type };
}

function resetLoveRevealRoom(room, commonType, firstHand, secondHand) {
  room.status = 'playing'; room.phase = 'reveal'; room.round = 1; room.maxRounds = 7; room.starter = 0; room.turn = 0;
  room.common = loveTestCard(commonType, 90); room.pot = 2; room.carryPot = 0; room.currentBet = 0; room.roundResult = null; room.ranking = null;
  [firstHand, secondHand].forEach((hand, index) => {
    const player = room.players[index]; player.hand = hand.map((type, cardIndex) => loveTestCard(type, index * 10 + cardIndex));
    player.chips = 19; player.streetBet = 0; player.roundCommitted = 1; player.acted = false; player.folded = false;
    player.revealedIndex = -1; player.declarationKey = ''; player.declarationName = ''; player.publicAs = ''; player.evaluation = null;
    player.revealLocked = false; player.pendingRevealIndex = -1; player.pendingDeclarationKey = ''; player.pendingDeclarationName = '';
    player.pendingPublicAs = ''; player.pendingEvaluation = null;
  });
  return room;
}

async function revealLovePvp(h, first, firstArgs, second, secondArgs) {
  await h.runPrivate('爱赢一切', ['公开'].concat(firstArgs), first);
  await h.runPrivate('爱赢一切', ['公开'].concat(secondArgs), second);
  return h.run('爱赢一切', ['确认公开'], first);
}

test('爱赢一切使用49张固定牌库并收取100游戏币入场费', async () => {
  const h = createHarness({ random: () => 0 });
  await h.run('爱赢一切', ['人机']);
  const room = h.storedJson(`aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.players.length, 2);
  assert.deepEqual(room.players.map((player) => player.chips), [19, 19]);
  assert.equal(room.pot, 2);
  const allCards = room.deck.concat(room.discard, [room.common], ...room.players.map((player) => player.hand));
  assert.equal(allCards.length, 49);
  const counts = allCards.reduce((result, card) => { result[card.type] = (result[card.type] || 0) + 1; return result; }, {});
  assert.deepEqual(counts, { S: 18, R: 12, P: 12, L: 6, C: 1 });
  assert.equal(new Set(allCards.map((card) => card.id)).size, 49);
  const profile = h.storedJson(`aff.profile.v1:${encodeURIComponent('QQ:1001')}`);
  assert.equal(profile.coins, 400);
});

test('爱赢一切首轮下注相等后才补发最终手牌并进入公开阶段', async () => {
  const h = createHarness({ random: () => 0.99 });
  await h.run('爱赢一切', ['人机']);
  let room = h.storedJson(`aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.phase, 'bet1');
  assert.equal(room.turn, 0, '机器人先手过牌后应把行动权交给玩家');
  assert.deepEqual(room.players.map((player) => player.hand.length), [2, 2]);
  await h.run('爱赢一切', [room.currentBet > room.players[0].streetBet ? '跟注' : '过牌']);
  room = h.storedJson(`aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.phase, 'reveal');
  assert.deepEqual(room.players.map((player) => player.hand.length), [3, 3]);
  assert.equal(room.deck.length, 42);
  assert.equal(room.players[1].revealLocked, true, '机器人应私下锁定公开与宣告');
  assert.equal(room.players[1].revealedIndex, -1, '玩家锁定前不能公开机器人选择');
  assert.ok(room.players[1].pendingDeclarationKey);
});

test('爱赢一切第一轮全押被跟注后补牌并跳过公开宣告直接摊牌', async () => {
  const h = createHarness({ random: () => 0 });
  const first = { id: 'QQ:1001', name: '全押方' }; const second = { id: 'QQ:1002', name: '跟注方' };
  await h.run('爱赢一切', ['开房'], first); await h.run('爱赢一切', ['加入'], second); await h.run('爱赢一切', ['开始'], first);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = h.storedJson(key); room.status = 'playing'; room.phase = 'bet1'; room.starter = 0; room.turn = 0; room.round = 1;
  room.deck = [loveTestCard('S', 71), loveTestCard('R', 72)]; room.discard = []; room.common = loveTestCard('P', 70); room.pot = 2; room.carryPot = 0; room.currentBet = 1;
  room.players[0].hand = [loveTestCard('L', 1), loveTestCard('S', 2)]; room.players[1].hand = [loveTestCard('R', 11), loveTestCard('R', 12)];
  room.players.forEach((player) => { player.chips = 19; player.streetBet = 1; player.roundCommitted = 1; player.acted = false; player.revealedIndex = -1; player.declarationKey = ''; player.evaluation = null; });
  h.ext.storageSet(key, JSON.stringify(room));

  await h.run('爱赢一切', ['全押'], first);
  room = h.storedJson(key); assert.equal(room.phase, 'bet1'); assert.equal(room.turn, 1); assert.equal(room.players[0].chips, 0);
  await h.run('爱赢一切', ['跟注'], second);
  room = h.storedJson(key);
  assert.equal(room.status, 'finished');
  assert.equal(room.phase, 'finished');
  assert.equal(room.roundResult.allInShowdown, true);
  assert.equal(room.roundResult.reason, '第一轮全押跟注，直接摊牌。');
  assert.deepEqual(room.players.map((player) => player.hand.length), [3, 3]);
  assert.deepEqual(room.players.map((player) => player.revealedIndex), [-1, -1]);
  assert.ok(room.roundResult.evaluations.every((evaluation) => !!evaluation));
  assert.equal(room.players.every((player) => player.autoShowdown), true);
});

test('爱赢一切第一轮全押直摊会自动处理公共与私人骗子牌', async () => {
  const h = createHarness({ random: () => 0 });
  const liar = { id: 'QQ:1001', name: '私人骗子' }; const publicUser = { id: 'QQ:1002', name: '公共骗子' };
  await h.run('爱赢一切', ['开房'], liar); await h.run('爱赢一切', ['加入'], publicUser); await h.run('爱赢一切', ['开始'], liar);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = h.storedJson(key); room.status = 'playing'; room.phase = 'bet1'; room.starter = 0; room.turn = 0; room.round = 1;
  room.deck = [loveTestCard('P', 71), loveTestCard('L', 72)]; room.discard = []; room.common = loveTestCard('C', 70); room.pot = 2; room.carryPot = 0; room.currentBet = 1;
  room.players[0].hand = [loveTestCard('C', 1), loveTestCard('L', 2)]; room.players[1].hand = [loveTestCard('L', 11), loveTestCard('L', 12)];
  room.players.forEach((player) => { player.chips = 19; player.streetBet = 1; player.roundCommitted = 1; player.acted = false; player.revealedIndex = -1; player.declarationKey = ''; player.publicAs = ''; player.evaluation = null; });
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('爱赢一切', ['全押'], liar); await h.run('爱赢一切', ['跟注'], publicUser);
  room = h.storedJson(key);
  assert.equal(room.status, 'finished');
  assert.equal(room.phase, 'finished');
  assert.ok(room.players.every((player) => ['S', 'R', 'P', 'L'].indexOf(player.publicAs) >= 0));
  assert.ok(room.roundResult.evaluations.every((evaluation) => !!evaluation));
  assert.ok(room.players[0].evaluation.rank >= 1);
});

test('爱赢一切短筹码第一轮全押获胜后只结算本轮并可继续下一轮', async () => {
  const h = createHarness({ random: () => 0 });
  const short = { id: 'QQ:1001', name: '短筹码' }; const deep = { id: 'QQ:1002', name: '深筹码' };
  await h.run('爱赢一切', ['开房'], short); await h.run('爱赢一切', ['加入'], deep); await h.run('爱赢一切', ['开始'], short);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = h.storedJson(key); room.status = 'playing'; room.phase = 'bet1'; room.starter = 0; room.turn = 0; room.round = 1;
  room.deck = Array.from({ length: 8 }, (_, index) => loveTestCard('S', 80 + index)).concat([loveTestCard('R', 71), loveTestCard('L', 72)]); room.discard = []; room.common = loveTestCard('L', 70); room.pot = 2; room.carryPot = 0; room.currentBet = 1;
  room.players[0].hand = [loveTestCard('L', 1), loveTestCard('S', 2)]; room.players[1].hand = [loveTestCard('R', 11), loveTestCard('R', 12)];
  room.players[0].chips = 6; room.players[1].chips = 32;
  room.players.forEach((player) => { player.streetBet = 1; player.roundCommitted = 1; player.acted = false; player.revealedIndex = -1; player.declarationKey = ''; player.evaluation = null; });
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('爱赢一切', ['全押'], short); await h.run('爱赢一切', ['跟注'], deep);
  room = h.storedJson(key);
  assert.equal(room.status, 'playing'); assert.equal(room.phase, 'round_result');
  assert.equal(room.roundResult.winnerIndex, 0); assert.equal(room.roundResult.allInShowdown, true);
  assert.deepEqual(room.players.map((player) => player.chips), [14, 26]);
});

test('爱赢一切九档牌型按规则顺序识别', async () => {
  const h = createHarness({ random: () => 0 });
  const first = { id: 'QQ:1001', name: '牌型甲' }; const second = { id: 'QQ:1002', name: '牌型乙' };
  await h.run('爱赢一切', ['开房'], first); await h.run('爱赢一切', ['加入'], second); await h.run('爱赢一切', ['开始'], first);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  const cases = [
    ['L', ['S', 'S', 'R'], '1爱', 1], ['S', ['S', 'R', 'P'], '1对', 2], ['S', ['S', 'S', 'R'], '3条', 3],
    ['S', ['S', 'R', 'R'], '2对', 4], ['L', ['L', 'S', 'S'], '2爱', 5], ['L', ['S', 'R', 'P'], '混合', 6],
    ['S', ['S', 'S', 'S'], '4条', 7], ['L', ['L', 'L', 'S'], '3爱', 8], ['L', ['L', 'L', 'L'], '爱赢一切', 9]
  ];
  const ranks = [];
  for (const [common, hand, declaration, expectedRank] of cases) {
    const room = resetLoveRevealRoom(h.storedJson(key), common, hand, ['R', 'R', 'P']); h.ext.storageSet(key, JSON.stringify(room));
    await h.runPrivate('爱赢一切', ['公开', '1', declaration], first);
    const updated = h.storedJson(key); ranks.push(updated.players[0].pendingEvaluation.rank); assert.equal(updated.players[0].pendingEvaluation.rank, expectedRank, declaration);
  }
  assert.deepEqual(ranks, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('爱赢一切允许基于两张公开牌虚假宣告但普通牌手仍按真实牌型摊牌', async () => {
  const h = createHarness({ random: () => 0 });
  const bluffer = { id: 'QQ:1001', name: '诈唬方' }; const honest = { id: 'QQ:1002', name: '实牌方' };
  await h.run('爱赢一切', ['开房'], bluffer); await h.run('爱赢一切', ['加入'], honest); await h.run('爱赢一切', ['开始'], bluffer);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;

  let room = resetLoveRevealRoom(h.storedJson(key), 'P', ['S', 'L', 'S'], ['R', 'R', 'S']); h.ext.storageSet(key, JSON.stringify(room));
  await h.runPrivate('爱赢一切', ['公开', '2', '混合'], bluffer);
  room = h.storedJson(key);
  assert.equal(room.players[0].pendingDeclarationKey, 'mixed');
  assert.equal(room.players[0].pendingEvaluation.key, 'oneLove', '普通牌手的诈唬不能改变真实牌型');
  await h.runPrivate('爱赢一切', ['公开', '1', '1对'], honest); await h.run('爱赢一切', ['确认公开'], bluffer);
  await h.run('爱赢一切', ['过牌'], bluffer); await h.run('爱赢一切', ['过牌'], honest);
  room = h.storedJson(key);
  assert.equal(room.roundResult.winnerIndex, 1, '摊牌应由真实的1对击败诈唬方真实的1爱');
  assert.deepEqual(room.roundResult.evaluations.map((item) => item.key), ['oneLove', 'pair']);

  room = resetLoveRevealRoom(room, 'P', ['S', 'L', 'S'], ['R', 'R', 'S']); h.ext.storageSet(key, JSON.stringify(room));
  await h.runPrivate('爱赢一切', ['公开', '1', '2对'], bluffer);
  room = h.storedJson(key);
  assert.equal(room.players[0].pendingDeclarationKey, 'twoPair');
  assert.equal(room.players[0].pendingEvaluation.key, 'oneLove');

  room = resetLoveRevealRoom(room, 'P', ['L', 'S', 'S'], ['R', 'R', 'S']); h.ext.storageSet(key, JSON.stringify(room));
  await h.runPrivate('爱赢一切', ['公开', '1', '4条'], bluffer);
  room = h.storedJson(key);
  assert.equal(room.players[0].revealLocked, false, '仍应拒绝无法由两张公开牌补成的宣告');
});

test('爱赢一切Bot会隐藏私人骗子牌并按场况选择可兑现的强宣告', async () => {
  const h = createHarness({ random: () => 0.5, now: 1784995200000 });
  const human = { id: 'QQ:1001', name: '观察员' };
  await h.run('爱赢一切', ['人机'], human);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = resetLoveRevealRoom(h.storedJson(key), 'L', ['R', 'R', 'S'], ['C', 'L', 'R']);
  room.round = 6; room.turn = 1; room.starter = 1; room.pot = 10; room.players[0].chips = 32; room.players[1].chips = 8;
  room.players[1].botMind = { seed: 0.21, aggression: 0.8, deception: 0.8, patience: 0.1, decisions: 0 };
  h.ext.storageSet(key, JSON.stringify(room));
  await h.run('爱赢一切', ['状态'], human);
  room = h.storedJson(key);
  const bot = room.players[1];
  assert.notEqual(bot.hand[bot.pendingRevealIndex].type, 'C', 'Bot应尽量把私人骗子牌留在暗处');
  assert.equal(bot.pendingRevealIndex, 1, '公共爱牌配合手中的爱牌应公开第2张，而不是机械公开第1张');
  assert.ok(['threeLove', 'winsAll'].indexOf(bot.pendingDeclarationKey) >= 0, '大幅落后且接近压力洗牌时应兑现高强度宣告');
  assert.equal(bot.pendingEvaluation.key, bot.pendingDeclarationKey);
});

test('爱赢一切Bot会用可信诈唬且不会偷看对手未公开手牌', async () => {
  const h = createHarness({ random: () => 0.5, now: 1784995200000 });
  const human = { id: 'QQ:1001', name: '观察员' };
  await h.run('爱赢一切', ['人机'], human);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  const baseMind = {
    seed: 0.1, aggression: 0.9, deception: 1, patience: 0, decisions: 0,
    opponentActions: 4, opponentFolds: 4, opponentFacedBets: 4, opponentRaises: 0,
    opponentCalls: 0, opponentChecks: 0, opponentBluffs: 2, opponentTruths: 0
  };
  async function decisionFor(opponentHand, discard, botHand) {
    let room = resetLoveRevealRoom(h.storedJson(key), 'P', opponentHand, botHand || ['S', 'L', 'S']);
    room.discard = discard || []; room.round = 6; room.turn = 1; room.starter = 0; room.pot = 8;
    room.players[0].chips = 32; room.players[0].revealedIndex = 0; room.players[0].declarationKey = 'mixed'; room.players[0].declarationName = '混合';
    room.players[1].chips = 8; room.players[1].botMind = Object.assign({}, baseMind);
    h.ext.storageSet(key, JSON.stringify(room));
    await h.run('爱赢一切', ['状态'], human);
    room = h.storedJson(key); const bot = room.players[1];
    return { index: bot.pendingRevealIndex, declaration: bot.pendingDeclarationKey, actual: bot.pendingEvaluation.key, mode: bot.botMind.lastMode };
  }
  const first = await decisionFor(['R', 'L', 'L']);
  const second = await decisionFor(['R', 'S', 'S']);
  assert.equal(first.mode, 'bluff');
  assert.notEqual(first.declaration, first.actual, '落后且对手容易弃牌时应允许可信诈唬');
  assert.deepEqual(second, first, '只改变对手两张暗牌时，Bot决策不应变化');
  const abundantLove = await decisionFor(['R', 'S', 'S'], [], ['S', 'R', 'S']);
  const exhaustedLove = await decisionFor(['R', 'S', 'S'], Array.from({ length: 6 }, (_, index) => loveTestCard('L', 100 + index)), ['S', 'R', 'S']);
  assert.notEqual(exhaustedLove.declaration, abundantLove.declaration, '所需牌已经全部废弃后应改用仍可信的宣告');
});

test('爱赢一切Bot会记录对手下注倾向供后续轮次调整策略', async () => {
  const h = createHarness({ random: () => 0.5, now: 1784995200000 });
  const human = { id: 'QQ:1001', name: '施压者' };
  await h.run('爱赢一切', ['人机'], human);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = h.storedJson(key); room.phase = 'bet1'; room.turn = 0; room.currentBet = 1; room.pot = 2;
  room.players.forEach((player) => { player.chips = 19; player.streetBet = 1; player.roundCommitted = 1; player.acted = false; });
  room.players[1].botMind = null; h.ext.storageSet(key, JSON.stringify(room));
  await h.run('爱赢一切', ['加注', '3'], human);
  room = h.storedJson(key);
  assert.equal(room.players[1].botMind.opponentActions, 1);
  assert.equal(room.players[1].botMind.opponentRaises, 1);
});

test('love同牌型按石头剪刀布克制且平局底池带入下一轮', async () => {
  const h = createHarness({ random: () => 0 });
  const first = { id: 'QQ:1001', name: '石头方' }; const second = { id: 'QQ:1002', name: '剪刀方' };
  await h.run('爱赢一切', ['开房'], first); await h.run('爱赢一切', ['加入'], second); await h.run('爱赢一切', ['开始'], first);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = resetLoveRevealRoom(h.storedJson(key), 'P', ['R', 'R', 'S'], ['S', 'S', 'R']); h.ext.storageSet(key, JSON.stringify(room));
  await revealLovePvp(h, first, ['1', '1对'], second, ['1', '1对']);
  await h.run('爱赢一切', ['过牌'], first); await h.run('爱赢一切', ['过牌'], second);
  room = h.storedJson(key); assert.equal(room.roundResult.winnerIndex, 0, '石头对子应克制剪刀对子'); assert.equal(room.starter, 1, '下一轮由败方先手');

  room = resetLoveRevealRoom(room, 'L', ['S', 'R', 'P'], ['P', 'S', 'R']); h.ext.storageSet(key, JSON.stringify(room));
  await revealLovePvp(h, first, ['1', '混合'], second, ['1', '混合']);
  await h.run('爱赢一切', ['过牌'], first); await h.run('爱赢一切', ['过牌'], second);
  room = h.storedJson(key); assert.equal(room.roundResult.tie, true); assert.equal(room.carryPot, 2); assert.equal(room.starter, 1, '平局应交换先手');
  await h.run('爱赢一切', ['下一轮'], first); room = h.storedJson(key);
  assert.equal(room.round, 2); assert.equal(room.pot, 4, '平局2筹码与新一轮双方底注应共同进入底池'); assert.equal(room.carryPot, 0);
});

test('爱赢一切私人骗子牌可兑现合法宣告，同牌型时反噬并额外支付5筹码', async () => {
  const h = createHarness({ random: () => 0 });
  const liar = { id: 'QQ:1001', name: '骗子持有者' }; const honest = { id: 'QQ:1002', name: '全爱玩家' };
  await h.run('爱赢一切', ['开房'], liar); await h.run('爱赢一切', ['加入'], honest); await h.run('爱赢一切', ['开始'], liar);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = resetLoveRevealRoom(h.storedJson(key), 'L', ['L', 'R', 'C'], ['L', 'L', 'L']); h.ext.storageSet(key, JSON.stringify(room));
  await h.runPrivate('爱赢一切', ['公开', '1', '爱赢一切'], liar);
  room = h.storedJson(key); assert.equal(room.players[0].pendingEvaluation.key, 'winsAll');
  await h.runPrivate('爱赢一切', ['公开', '1', '爱赢一切'], honest); await h.run('爱赢一切', ['确认公开'], liar);
  await h.run('爱赢一切', ['过牌'], liar); await h.run('爱赢一切', ['过牌'], honest);
  room = h.storedJson(key);
  assert.equal(room.phase, 'round_result');
  assert.equal(room.roundResult.winnerIndex, 1);
  assert.equal(room.roundResult.cheatTieLoss, true);
  assert.equal(room.roundResult.penalty, 5);
  assert.deepEqual(room.players.map((player) => player.chips), [14, 26]);
  assert.equal(room.players[0].cheatLosses, 1);
  assert.equal(room.players[0].cheatPenalties, 5);
  assert.equal(room.players[1].winsAll, 1);

  room.round = 7; room.cycleRound = 7; room.players[0].chips = 1; room.players[1].chips = 39; h.ext.storageSet(key, JSON.stringify(room)); await h.run('爱赢一切', ['下一轮'], liar);
  room = h.storedJson(key); assert.equal(room.status, 'playing'); assert.equal(room.phase, 'bet1');
  assert.equal(room.round, 8); assert.equal(room.cycleRound, 1); assert.equal(room.shuffleCount, 1);
  assert.deepEqual(room.players.map((player) => player.chips), [0, 19], '压力减半后还要扣除新一轮底注');
  assert.equal(room.deck.length, 44); assert.equal(room.discard.length, 0);
  await h.run('爱赢一切', ['投降'], liar); room = h.storedJson(key); assert.equal(room.status, 'finished');
  const liarProfile = h.storedJson(`aff.profile.v1:${encodeURIComponent(liar.id)}`); const honestProfile = h.storedJson(`aff.profile.v1:${encodeURIComponent(honest.id)}`);
  assert.equal(liarProfile.stats.love.loveCheatLosses, 1); assert.equal(liarProfile.stats.love.loveCheatPenalties, 5);
  assert.equal(honestProfile.stats.love.loveWinsAll, 1); assert.equal(honestProfile.coins, 600, '胜者返还两倍入场费200币');
  assert.ok(Math.abs(liarProfile.affection) > honestProfile.affection, '失败好感损失绝对值应大于胜利收益');
  await h.run('爱赢一切', [], liar); assert.equal(h.storedJson(key), null, '完成后无参数入口应清除快照并返回菜单');
});

test('爱赢一切公共骗子牌由双方独立指定且不会触发私人骗子罚则', async () => {
  const h = createHarness({ random: () => 0 });
  const first = { id: 'QQ:1001', name: '指定石头' }; const second = { id: 'QQ:1002', name: '指定爱' };
  await h.run('爱赢一切', ['开房'], first); await h.run('爱赢一切', ['加入'], second); await h.run('爱赢一切', ['开始'], first);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = resetLoveRevealRoom(h.storedJson(key), 'C', ['R', 'R', 'S'], ['L', 'L', 'S']); h.ext.storageSet(key, JSON.stringify(room));
  await revealLovePvp(h, first, ['1', '3条', '石头'], second, ['1', '3爱', '爱']);
  await h.run('爱赢一切', ['过牌'], first); await h.run('爱赢一切', ['过牌'], second);
  room = h.storedJson(key);
  assert.deepEqual(room.players.map((player) => player.publicAs), ['R', 'L']);
  assert.equal(room.roundResult.winnerIndex, 1);
  assert.equal(room.roundResult.penalty, 0);
});

test('爱赢一切多人余额不足可作为游客游玩但不会留下奖励或统计', async () => {
  const h = createHarness({ random: () => 0 });
  const owner = { id: 'QQ:1001', name: '付费玩家' }; const guest = { id: 'QQ:1002', name: '游客玩家' };
  await h.run('爱赢一切', ['开房'], owner); await setProfileCoins(h, guest, 0); await h.run('爱赢一切', ['加入'], guest);
  let room = h.storedJson(`aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`);
  assert.equal(room.players.find((player) => player.id === guest.id).guest, true);
  await h.run('爱赢一切', ['开始'], owner); await h.run('爱赢一切', ['投降'], owner);
  room = h.storedJson(`aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`); assert.equal(room.status, 'finished'); assert.equal(room.winnerId, guest.id);
  const guestProfile = h.storedJson(`aff.profile.v1:${encodeURIComponent(guest.id)}`); assertGameStatsUntouched(guestProfile, 'love');
});

test('爱赢一切PvE群图常亮玩家手牌且私聊看牌仍发送专用结构化图片数据', async () => {
  const views = [];
  const h = createHarness({ random: () => 0, fetch: async (url, options) => {
    views.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
  } });
  await h.run('yan', ['我的']); h.configs.set('启用图片输出', true);
  await h.run('爱赢一切', []); await h.run('爱赢一切', ['人机']); const privateReply = await h.run('爱赢一切', ['看牌']);
  assert.equal(views[0].kind, 'love'); assert.equal(views[0].loveTable.status, 'menu'); assert.equal(views[0].loveTable.cards.length, 5);
  assert.equal(views[1].loveTable.status, 'playing'); assert.equal(views[1].loveTable.players.length, 2);
  assert.equal(views[1].loveTable.players[0].cards.every((card) => !card.hidden), true);
  assert.equal(views[1].loveTable.players[1].cards.every((card) => card.hidden), true);
  const privateView = views[2]; assert.equal(privateReply[0].mode, 'private');
  assert.equal(privateView.loveTable.players[0].cards.every((card) => !card.hidden), true);
  assert.equal(privateView.loveTable.players[1].cards.every((card) => card.hidden), true);
});

test('爱赢一切PvP私聊锁定后只在群内确认时同步公开', async () => {
  const views = [];
  const h = createHarness({ random: () => 0, fetch: async (url, options) => {
    views.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ url: `/api/image/${String(views.length).padStart(24, '0')}` }) };
  } });
  const first = { id: 'QQ:1001', name: '先锁定' }; const second = { id: 'QQ:1002', name: '后锁定' };
  await h.run('爱赢一切', ['开房'], first); await h.run('爱赢一切', ['加入'], second); await h.run('爱赢一切', ['开始'], first);
  const key = `aff.room.v1:love:${encodeURIComponent('QQ-Group:2001')}`;
  let room = resetLoveRevealRoom(h.storedJson(key), 'P', ['R', 'R', 'S'], ['S', 'S', 'R']); h.ext.storageSet(key, JSON.stringify(room));
  h.configs.set('启用图片输出', true);
  const rejected = await h.run('爱赢一切', ['公开', '1', '1对'], first); assert.equal(rejected[0].mode, 'sender');
  await h.runPrivate('爱赢一切', ['公开', '1', '1对'], first); room = h.storedJson(key);
  assert.equal(room.players[0].revealLocked, true); assert.equal(room.players[0].revealedIndex, -1); assert.equal(room.players[0].declarationKey, '');
  await h.runPrivate('爱赢一切', ['公开', '1', '1对'], second); room = h.storedJson(key);
  assert.equal(room.phase, 'reveal_confirm'); assert.deepEqual(room.players.map((player) => player.revealedIndex), [-1, -1]);
  await h.run('爱赢一切', ['确认公开'], first); room = h.storedJson(key);
  assert.equal(room.phase, 'bet2'); assert.deepEqual(room.players.map((player) => player.revealedIndex), [0, 0]);
  assert.deepEqual(room.players.map((player) => player.declarationKey), ['pair', 'pair']);
});
