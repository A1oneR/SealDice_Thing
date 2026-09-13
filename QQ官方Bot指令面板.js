// ==UserScript==
// @name         QQ官方Bot指令面板
// @author       local
// @version      1.0.1
// @description  管理 QQ 官方 Bot v2 指令面板：本地编辑项目，并创建、查询、覆盖更新、删除官方面板。
// @timestamp    2026-08-21
// @license      MIT
// @sealVersion  1.6.0
// ==/UserScript==

/*
 * 官方接口依据：
 *   /v2/panels                         查询、创建面板
 *   /v2/panels/{panel_id}              查询详情、覆盖更新、删除
 *   /v2/panels/{panel_id}/target       修改指定群/用户关联
 *
 * 在海豹配置中填写 Secret Key 即可；若同时填写 AppID，则按官方接口换取并缓存
 * 短期访问令牌，再以 Authorization: QQBot {ACCESS_TOKEN} 调用面板 API。
 */

(() => {
  const NAME = 'QQ官方Bot指令面板';
  const AUTHOR = 'local';
  const VERSION = '1.0.1';
  const STORE_KEY = 'panel-items-v1';

  let ext = seal.ext.find(NAME);
  if (!ext) {
    ext = seal.ext.new(NAME, AUTHOR, VERSION);
    seal.ext.register(ext);
  }

  seal.ext.registerTemplateConfig(ext, 'API地址', ['https://api.sgroup.qq.com'], 'QQ 官方 Bot API 根地址，不要填写末尾 /');
  seal.ext.registerTemplateConfig(ext, 'AppID', [''], 'QQ 开放平台机器人 AppID');
  seal.ext.registerTemplateConfig(ext, 'Secret Key', [''], 'QQ 开放平台机器人 Secret Key（不会写入日志）');
  seal.ext.registerTemplateConfig(ext, 'Token地址', ['https://bots.qq.com/app/getAppAccessToken'], '用于以 AppID/Secret Key 换取短期令牌的地址');
  seal.ext.registerOptionConfig(ext, '默认场景', 'group', ['group', 'c2c', 'channel', 'dm'], '官方面板创建时使用的 scope');
  seal.ext.registerOptionConfig(ext, '默认范围', 'all', ['all', 'specific'], '官方面板创建时使用的 target_type');

  // 从项目中的“插件总览-help裸指令.txt”整理出的初始项目，后续可用命令修改。
  const DEFAULT_ITEMS = [
    { type: 'command', name: '角色卡评分', desc: '读取并评分 COC/DND 角色卡' },
    { type: 'command', name: '模组分析', desc: '分析模组并生成备团建议' },
    { type: 'command', name: 'logai', desc: '分析跑团 Log' },
    { type: 'command', name: '团计时', desc: '统计跑团活跃度' },
    { type: 'command', name: 'map2', desc: '生成战斗地图' },
    { type: 'command', name: 'clue', desc: '记录和查看团内线索' },
    { type: 'command', name: 'timeline', desc: '维护故事时间线' },
    { type: 'command', name: 'inventory', desc: '管理玩家物品栏' },
    { type: 'command', name: '成就', desc: '制作 TRPG 成就图' },
    { type: 'command', name: 'hs', desc: '汇森探灵员检定' },
    { type: 'command', name: '喵', desc: '喵苏鲁规则与角色卡' },
    { type: 'command', name: '三词', desc: '三词故事游戏' },
    { type: 'command', name: '农场指令', desc: '我的农田游戏' },
    { type: 'command', name: 'star', desc: '星际拓荒生存游戏' },
    { type: 'command', name: 'dmd', desc: '亡命神抽卡牌游戏' },
    { type: 'command', name: 'farkle', desc: 'Farkle 骰子游戏' },
    { type: 'command', name: '刮开', desc: '揭开刮刮乐' },
    { type: 'command', name: '球员卡', desc: 'COC FUT 球员卡' },
    { type: 'command', name: '生成图片', desc: '按描述生成图片' },
    { type: 'command', name: 'agv', desc: '管理员加群验证设置' }
  ];

  function cloneItems(items) {
    return items.map((item) => ({
      type: item.type === 'link' ? 'link' : 'command',
      name: String(item.name || '').trim(),
      desc: String(item.desc || '').trim(),
      ...(item.type === 'link' ? { link: String(item.link || '').trim() } : {}),
      ...(item.only_admin === true ? { only_admin: true } : {})
    }));
  }

  function loadItems() {
    try {
      const value = JSON.parse(ext.storageGet(STORE_KEY) || 'null');
      if (Array.isArray(value)) return cloneItems(value).filter((item) => item.name);
    } catch (err) {
      console.warn(`[${NAME}] 读取本地项目失败，将使用默认项目: ${err.message || err}`);
    }
    return cloneItems(DEFAULT_ITEMS);
  }

  function saveItems(items) {
    ext.storageSet(STORE_KEY, JSON.stringify(cloneItems(items).slice(0, 20)));
  }

  function getConfig(name, fallback) {
    try {
      const templateNames = ['API地址', 'AppID', 'Secret Key', 'Token地址'];
      const value = templateNames.includes(name)
        ? seal.ext.getTemplateConfig(ext, name)
        : seal.ext.getOptionConfig(ext, name);
      return Array.isArray(value) ? String(value[0] || fallback) : String(value || fallback);
    } catch (err) {
      return fallback;
    }
  }

  function apiRoot() {
    return getConfig('API地址', 'https://api.sgroup.qq.com').replace(/\/+$/, '');
  }

  let accessToken = '';
  let accessTokenExpiresAt = 0;

  async function getAccessToken(forceRefresh) {
    if (!forceRefresh && accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
    const appId = getConfig('AppID', '').trim();
    const secretKey = getConfig('Secret Key', '').trim();
    if (!secretKey) throw new Error('未配置 Secret Key，请在插件配置中填写');
    // 新版平台可直接使用 Secret Key；配置 AppID 时兼容核心的令牌交换流程。
    if (!appId) return secretKey;
    const response = await fetch(getConfig('Token地址', 'https://bots.qq.com/app/getAppAccessToken').trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId, clientSecret: secretKey })
    });
    const text = await response.text();
    let data = {};
    if (text) { try { data = JSON.parse(text); } catch (err) { data = { raw: text }; } }
    if (!response.ok || (data.code !== undefined && Number(data.code) !== 0)) {
      throw new Error(`获取官方 Bot AccessToken 失败(${response.status || '未知'}): ${data.message || data.msg || data.raw || '未知错误'}`);
    }
    const token = String(data.access_token || '').trim();
    if (!token) throw new Error('官方令牌接口未返回 access_token');
    const expiresIn = Math.max(60, Number(data.expires_in || 7200) || 7200);
    accessToken = token;
    accessTokenExpiresAt = Date.now() + Math.max(30, expiresIn - 60) * 1000;
    return accessToken;
  }

  async function officialApi(method, path, body) {
    const token = await getAccessToken(false);
    const options = {
      method,
      headers: { Authorization: `QQBot ${token}`, 'Content-Type': 'application/json' }
    };
    if (body !== undefined) options.body = JSON.stringify(body);
    let response = await fetch(`${apiRoot()}${path}`, options);
    if (response.status === 401) {
      const refreshed = await getAccessToken(true);
      options.headers.Authorization = `QQBot ${refreshed}`;
      response = await fetch(`${apiRoot()}${path}`, options);
    }
    const text = await response.text();
    let data = {};
    if (text) {
      try { data = JSON.parse(text); } catch (err) { data = { raw: text }; }
    }
    if (!response.ok) {
      const detail = data.message || data.msg || data.raw || `HTTP ${response.status}`;
      throw new Error(`官方接口失败(${response.status}): ${detail}`);
    }
    return data;
  }

  function checkAdmin(ctx, msg) {
    if (Number(ctx && ctx.privilegeLevel || 0) >= 50) return true;
    seal.replyToSender(ctx, msg, seal.formatTmpl(ctx, '核心:提示_无权限'));
    return false;
  }

  function parseItemsText(items) {
    if (!items.length) return '（空）';
    return items.map((item, index) => `${index + 1}. ${item.type === 'link' ? '🔗' : '⌘'} ${item.name}｜${item.desc || '无描述'}${item.link ? `｜${item.link}` : ''}`).join('\n');
  }

  function localHelp() {
    return [
      '官方 Bot 指令面板：',
      '.官方面板 list [scope]                 查询官方面板列表',
      '.官方面板 show [panel_id]              查询面板详情',
      '.官方面板 create [scope] [all|specific] 创建官方面板（使用本地项目）',
      '.官方面板 push [panel_id]              覆盖更新官方面板',
      '.官方面板 remove <panel_id>            删除官方面板',
      '.官方面板 target <id> add|del <ID,...> 修改关联群/用户 OpenID',
      '.官方面板 items                         查看本地项目',
      '.官方面板 add <名称> <描述>            添加指令项目',
      '.官方面板 link <名称> <URL> <描述>     添加链接项目',
      '.官方面板 set <名称|序号> <描述>       修改项目描述',
      '.官方面板 del <名称|序号>              删除项目',
      '.官方面板 reset                        恢复项目总览默认项目',
      '',
      '说明：官方群面板使用 group_openid，不是普通 QQ 群号；最多 20 个项目。'
    ].join('\n');
  }

  const cmd = seal.ext.newCmdItemInfo();
  cmd.name = '官方面板';
  cmd.help = localHelp();
  cmd.solve = (ctx, msg, cmdArgs) => {
    const ret = seal.ext.newCmdExecuteResult(true);
    if (!checkAdmin(ctx, msg)) return ret;
    const op = String(cmdArgs.getArgN(1) || '').trim().toLowerCase();
    const items = loadItems();

    if (!op || op === 'help' || op === '帮助') {
      ret.showHelp = true;
      return ret;
    }
    if (op === 'items' || op === '项目') {
      seal.replyToSender(ctx, msg, `本地面板项目（${items.length}/20）：\n${parseItemsText(items)}`);
      return ret;
    }
    if (op === 'reset' || op === '重置') {
      saveItems(DEFAULT_ITEMS);
      seal.replyToSender(ctx, msg, `已恢复 ${DEFAULT_ITEMS.length} 个默认项目。`);
      return ret;
    }
    if (op === 'add') {
      const name = String(cmdArgs.getArgN(2) || '').trim();
      const desc = cmdArgs.args.slice(2).join(' ').trim();
      if (!name || !desc) { seal.replyToSender(ctx, msg, '用法：.官方面板 add <名称> <描述>'); return ret; }
      if (name.length > 14 || desc.length > 30) { seal.replyToSender(ctx, msg, '名称最多14字符，描述最多30字符。'); return ret; }
      if (items.length >= 20) { seal.replyToSender(ctx, msg, '官方面板最多20个项目。'); return ret; }
      if (items.some((item) => item.name === name)) { seal.replyToSender(ctx, msg, `项目“${name}”已存在。`); return ret; }
      items.push({ type: 'command', name, desc }); saveItems(items);
      seal.replyToSender(ctx, msg, `已添加指令项目：${name}`); return ret;
    }
    if (op === 'link') {
      const name = String(cmdArgs.getArgN(2) || '').trim();
      const link = String(cmdArgs.getArgN(3) || '').trim();
      const desc = cmdArgs.args.slice(3).join(' ').trim();
      if (!name || !/^https:\/\//i.test(link) || !desc) { seal.replyToSender(ctx, msg, '用法：.官方面板 link <名称> <https://地址> <描述>'); return ret; }
      if (name.length > 14 || desc.length > 30) { seal.replyToSender(ctx, msg, '名称最多14字符，描述最多30字符。'); return ret; }
      if (items.length >= 20) { seal.replyToSender(ctx, msg, '官方面板最多20个项目。'); return ret; }
      items.push({ type: 'link', name, link, desc }); saveItems(items);
      seal.replyToSender(ctx, msg, `已添加链接项目：${name}`); return ret;
    }
    if (op === 'set') {
      const key = String(cmdArgs.getArgN(2) || '').trim();
      const desc = cmdArgs.args.slice(2).join(' ').trim();
      const index = /^\d+$/.test(key) ? Number(key) - 1 : items.findIndex((item) => item.name === key);
      if (index < 0 || !items[index] || !desc) { seal.replyToSender(ctx, msg, '用法：.官方面板 set <名称|序号> <新描述>'); return ret; }
      if (desc.length > 30) { seal.replyToSender(ctx, msg, '描述最多30字符。'); return ret; }
      items[index].desc = desc; saveItems(items);
      seal.replyToSender(ctx, msg, `已修改项目“${items[index].name}”。`); return ret;
    }
    if (op === 'del' || op === 'delete' || op === '删除') {
      const key = String(cmdArgs.getArgN(2) || '').trim();
      const index = /^\d+$/.test(key) ? Number(key) - 1 : items.findIndex((item) => item.name === key);
      if (index < 0 || !items[index]) { seal.replyToSender(ctx, msg, '找不到要删除的项目。'); return ret; }
      const removed = items.splice(index, 1)[0]; saveItems(items);
      seal.replyToSender(ctx, msg, `已删除项目“${removed.name}”。`); return ret;
    }

    const run = async () => {
      if (op === 'list') {
        const scope = String(cmdArgs.getArgN(2) || getConfig('默认场景', 'group')).trim();
        const result = await officialApi('GET', `/v2/panels?scope=${encodeURIComponent(scope)}&limit=50`);
        const records = Array.isArray(result.records) ? result.records : [];
        seal.replyToSender(ctx, msg, records.length
          ? records.map((item) => `${item.panel_id}｜${item.scope}｜${item.target_type}｜${(item.panel && item.panel.remark) || ''}`).join('\n')
          : '官方接口未返回面板记录。');
        return;
      }
      if (op === 'show') {
        const id = String(cmdArgs.getArgN(2) || '').trim();
        if (!id) { seal.replyToSender(ctx, msg, '用法：.官方面板 show <panel_id>'); return; }
        const result = await officialApi('GET', `/v2/panels/${encodeURIComponent(id)}`);
        seal.replyToSender(ctx, msg, JSON.stringify(result, null, 2)); return;
      }
      if (op === 'create') {
        const scope = String(cmdArgs.getArgN(2) || getConfig('默认场景', 'group')).trim();
        const targetType = String(cmdArgs.getArgN(3) || getConfig('默认范围', 'all')).trim();
        if (!['group', 'c2c', 'channel', 'dm'].includes(scope) || !['all', 'specific'].includes(targetType) || (targetType === 'specific' && !['group', 'c2c'].includes(scope))) {
          seal.replyToSender(ctx, msg, 'scope 只能是 group/c2c/channel/dm，范围只能是 all/specific。'); return;
        }
        const body = { scope, target_type: targetType, panel: { items, remark: 'SealDice 指令面板' } };
        if (targetType === 'specific') {
          const ids = cmdArgs.args.slice(3).join(' ').split(/[,，\s]+/).filter(Boolean).slice(0, 20);
          if (scope === 'group') body.group_openids = ids;
          else if (scope === 'c2c') body.user_openids = ids;
          if (!ids.length) { seal.replyToSender(ctx, msg, 'specific 模式请在后面填写 group_openid 或 user_openid。'); return; }
        }
        const result = await officialApi('POST', '/v2/panels', body);
        seal.replyToSender(ctx, msg, `官方面板创建成功：${result.panel_id || JSON.stringify(result)}`); return;
      }
      if (op === 'push' || op === 'update') {
        const id = String(cmdArgs.getArgN(2) || '').trim();
        if (!id) { seal.replyToSender(ctx, msg, '用法：.官方面板 push <panel_id>'); return; }
        const result = await officialApi('PUT', `/v2/panels/${encodeURIComponent(id)}`, { panel: { items, remark: 'SealDice 指令面板' } });
        seal.replyToSender(ctx, msg, `官方面板已覆盖更新：${result.version === undefined ? '成功' : `版本 ${result.version}`}`); return;
      }
      if (op === 'remove' || op === 'deletepanel') {
        const id = String(cmdArgs.getArgN(2) || '').trim();
        if (!id) { seal.replyToSender(ctx, msg, '用法：.官方面板 remove <panel_id>'); return; }
        await officialApi('DELETE', `/v2/panels/${encodeURIComponent(id)}`);
        seal.replyToSender(ctx, msg, '官方面板已删除。'); return;
      }
      if (op === 'target') {
        const id = String(cmdArgs.getArgN(2) || '').trim();
        const targetOp = String(cmdArgs.getArgN(3) || '').trim().toLowerCase();
        const ids = cmdArgs.args.slice(3).join(' ').split(/[,，\s]+/).filter(Boolean).slice(0, 20);
        if (!id || !['add', 'del'].includes(targetOp) || !ids.length) { seal.replyToSender(ctx, msg, '用法：.官方面板 target <panel_id> add|del <OpenID,...>'); return; }
        const scope = getConfig('默认场景', 'group');
        const body = { op: targetOp };
        if (scope === 'group') body.group_openids = ids; else body.user_openids = ids;
        await officialApi('PUT', `/v2/panels/${encodeURIComponent(id)}/target`, body);
        seal.replyToSender(ctx, msg, `面板关联对象已${targetOp === 'add' ? '添加' : '删除'}。`); return;
      }
      seal.replyToSender(ctx, msg, '未知子命令，请发送 .官方面板 help');
    };
    run().catch((err) => {
      console.error(`[${NAME}] ${err.message || err}`);
      seal.replyToSender(ctx, msg, `操作失败：${err.message || err}`);
    });
    return ret;
  };

  ext.cmdMap['官方面板'] = cmd;
  ext.cmdMap['panel'] = cmd;
})();
