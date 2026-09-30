// ==UserScript==
// @name         QQ官方Bot指令面板
// @author       local
// @version      1.1.0
// @description  管理 QQ 官方 Bot v2 指令面板：本地编辑与合规校验，创建、查询、覆盖更新、一键清理官方面板。
// @timestamp    2026-09-28
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
 *
 * 官方限制约束（避免 40030013 超出数量限制）：
 * 1. 机器人面板总数：单个机器人名下最多只能创建 20 个指令面板；
 * 2. 单面板项目数量：单个面板最多 20 个项目（items）；
 * 3. 项目名称宽度：最多 14 字符宽度（中文按 2 字符算，即最多 7 个汉字）；
 * 4. 项目描述宽度：最多 30 字符宽度（中文按 2 字符算，即最多 15 个汉字）；
 * 5. 全局面板唯一性：同场景（如 group）下通常只能存在 1 个全局面板（all），已有需使用 PUT 覆盖更新。
 */

(() => {
  const NAME = 'QQ官方Bot指令面板';
  const AUTHOR = 'local';
  const VERSION = '1.1.0';
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

  // 从项目中的“插件总览-help裸指令.txt”整理出的初始项目，均已按官方 14/30 宽度约束严格校验。
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

  // 按照官方规范计算字符宽度：半角/ASCII字符计1，汉字/全角/Emoji等计2
  function getStrWidth(str) {
    let width = 0;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (code >= 0 && code <= 128) {
        width += 1;
      } else {
        width += 2;
      }
    }
    return width;
  }

  // 按最大字符宽度安全截断
  function truncateWidth(str, maxWidth) {
    let width = 0;
    let result = '';
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const code = s.charCodeAt(i);
      const w = (code >= 0 && code <= 128) ? 1 : 2;
      if (width + w > maxWidth) break;
      width += w;
      result += ch;
    }
    return result;
  }

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

  // 本地合规校验函数：严格确保在提交给腾讯官方接口前完全满足 14/30 宽度与 20 个项目硬限制
  function validateItems(items) {
    if (!items || !items.length) {
      return { ok: false, message: '本地面板项目为空，请使用 .官方面板 reset 恢复默认或使用 .官方面板 add 添加项目。' };
    }
    if (items.length > 20) {
      return { ok: false, message: `面板项目数量超限（当前 ${items.length}/20），官方最多支持 20 个项目，请使用 .官方面板 del 删减。` };
    }
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const nw = getStrWidth(it.name || '');
      const dw = getStrWidth(it.desc || '');
      if (!it.name || !it.name.trim()) {
        return { ok: false, message: `第 ${i + 1} 个项目名称不能为空。` };
      }
      if (nw > 14) {
        return {
          ok: false,
          message: `第 ${i + 1} 个项目“${it.name}”名称过长！当前宽度 ${nw}/14（约 ${Math.ceil(nw / 2)} 个汉字，官方最多支持 7 个汉字或 14 个英文字符），请修改或删除。`
        };
      }
      if (dw > 30) {
        return {
          ok: false,
          message: `第 ${i + 1} 个项目“${it.name}”描述过长！当前宽度 ${dw}/30（约 ${Math.ceil(dw / 2)} 个汉字，官方最多支持 15 个汉字或 30 个英文字符），请使用 .官方面板 set ${i + 1} <新描述> 修改。`
        };
      }
      if (it.type === 'link') {
        if (!it.link || !/^https:\/\//i.test(it.link)) {
          return { ok: false, message: `第 ${i + 1} 个项目“${it.name}”的链接不合法，必须以 https:// 开头。` };
        }
      }
    }
    return { ok: true };
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
      const errCode = data.err_code || data.code;
      if (response.status === 400 && (errCode === 40030013 || errCode === 30013 || String(detail).includes('超出数量限制'))) {
        throw new Error(
          `官方接口失败(400): 超出数量限制 (40030013)\n` +
          `排查建议：\n` +
          `1. 机器人面板总配额已达上限（官方规定单个Bot最多20个面板），可使用 .官方面板 list 查看或 .官方面板 clean 清理冗余面板；\n` +
          `2. 当前场景可能已存在同类全局面板，请使用 .官方面板 push <panel_id> 覆盖更新或使用 .官方面板 create [scope] -f 强制覆盖；\n` +
          `3. 检查是否有项目文字超长（汉字按2字符算，名称<=7字/14宽，描述<=15字/30宽），可发送 .官方面板 check 进行排查。`
        );
      }
      throw new Error(`官方接口失败(${response.status}): ${detail}${errCode ? ` (代码: ${errCode})` : ''}`);
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
    return items.map((item, index) => {
      const nw = getStrWidth(item.name || '');
      const dw = getStrWidth(item.desc || '');
      const icon = item.type === 'link' ? '🔗' : '⌘';
      const warning = (nw > 14 || dw > 30) ? ' ⚠️[超长]' : '';
      return `${index + 1}. ${icon} ${item.name} (${nw}/14宽)｜${item.desc || '无描述'} (${dw}/30宽)${item.link ? `｜${item.link}` : ''}${warning}`;
    }).join('\n');
  }

  function localHelp() {
    return [
      '官方 Bot 指令面板：',
      '.官方面板 list [scope]                 查询官方面板列表 (group/c2c/channel/dm)',
      '.官方面板 show [panel_id]              查询面板详情',
      '.官方面板 create [scope] [all|specific] [-f] 创建官方面板（加-f自动覆盖更新已有面板）',
      '.官方面板 push [panel_id]              覆盖更新官方面板',
      '.官方面板 remove <panel_id>            删除指定官方面板',
      '.官方面板 clean [scope|all]            批量清理官方面板（释放20个配额）',
      '.官方面板 target <id> add|del <ID,...> 修改关联群/用户 OpenID',
      '.官方面板 items                         查看本地项目及宽度统计',
      '.官方面板 check                         严格检查项目格式与长度规范',
      '.官方面板 fix                           自动截断超长名称与描述至合规长度',
      '.官方面板 add <名称> <描述>            添加指令项目',
      '.官方面板 link <名称> <URL> <描述>     添加链接项目',
      '.官方面板 set <名称|序号> <描述>       修改项目描述',
      '.官方面板 del <名称|序号>              删除项目',
      '.官方面板 reset                        恢复项目总览默认项目',
      '',
      '限制说明：单个机器人最多20个面板；每个面板最多20个项目；名称最多14宽度(约7汉字)，描述最多30宽度(约15汉字)。'
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
    if (op === 'check' || op === '检查') {
      const issues = [];
      if (!items.length) {
        issues.push('- 面板项目列表为空');
      }
      if (items.length > 20) {
        issues.push(`- 面板项目数量超出上限：${items.length}/20（需删除 ${items.length - 20} 个）`);
      }
      items.forEach((it, idx) => {
        const nw = getStrWidth(it.name || '');
        const dw = getStrWidth(it.desc || '');
        if (!it.name) issues.push(`- 第 ${idx + 1} 项名称为空`);
        if (nw > 14) issues.push(`- 第 ${idx + 1} 项“${it.name}”名称过长(${nw}/14宽，超${nw - 14})`);
        if (dw > 30) issues.push(`- 第 ${idx + 1} 项“${it.name}”描述过长(${dw}/30宽，超${dw - 30})`);
        if (it.type === 'link' && (!it.link || !/^https:\/\//i.test(it.link))) {
          issues.push(`- 第 ${idx + 1} 项“${it.name}”链接格式无效(必须https://开头)`);
        }
      });
      if (issues.length) {
        seal.replyToSender(ctx, msg, `项目合规性检查发现 ${issues.length} 个问题：\n${issues.join('\n')}\n\n💡 提示：可发送 .官方面板 fix 自动截断超长内容。`);
      } else {
        seal.replyToSender(ctx, msg, `项目合规性检查通过！当前共有 ${items.length}/20 个项目，所有名称与描述均符合官方规范。`);
      }
      return ret;
    }
    if (op === 'fix' || op === '修复') {
      let fixedCount = 0;
      let trimmedItems = items.slice(0, 20);
      if (items.length > 20) {
        fixedCount += (items.length - 20);
      }
      trimmedItems = trimmedItems.map((it) => {
        let changed = false;
        let newName = it.name || '';
        let newDesc = it.desc || '';
        if (getStrWidth(newName) > 14) {
          newName = truncateWidth(newName, 14);
          changed = true;
        }
        if (getStrWidth(newDesc) > 30) {
          newDesc = truncateWidth(newDesc, 30);
          changed = true;
        }
        if (changed) fixedCount++;
        return { ...it, name: newName, desc: newDesc };
      });
      saveItems(trimmedItems);
      seal.replyToSender(ctx, msg, `已完成项目自动修复！共处理 ${fixedCount} 处超限，当前保留 ${trimmedItems.length}/20 个合规项目。`);
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
      const nw = getStrWidth(name);
      const dw = getStrWidth(desc);
      if (nw > 14) {
        seal.replyToSender(ctx, msg, `名称超出长度限制！当前宽度 ${nw}/14（最多支持 7 个汉字或 14 个英文字符）。`);
        return ret;
      }
      if (dw > 30) {
        seal.replyToSender(ctx, msg, `描述超出长度限制！当前宽度 ${dw}/30（最多支持 15 个汉字或 30 个英文字符）。`);
        return ret;
      }
      if (items.length >= 20) { seal.replyToSender(ctx, msg, '官方面板最多20个项目。'); return ret; }
      if (items.some((item) => item.name === name)) { seal.replyToSender(ctx, msg, `项目“${name}”已存在。`); return ret; }
      items.push({ type: 'command', name, desc }); saveItems(items);
      seal.replyToSender(ctx, msg, `已添加指令项目：${name}（名称宽度 ${nw}/14，描述宽度 ${dw}/30）`); return ret;
    }
    if (op === 'link') {
      const name = String(cmdArgs.getArgN(2) || '').trim();
      const link = String(cmdArgs.getArgN(3) || '').trim();
      const desc = cmdArgs.args.slice(3).join(' ').trim();
      if (!name || !/^https:\/\//i.test(link) || !desc) { seal.replyToSender(ctx, msg, '用法：.官方面板 link <名称> <https://地址> <描述>'); return ret; }
      const nw = getStrWidth(name);
      const dw = getStrWidth(desc);
      if (nw > 14) {
        seal.replyToSender(ctx, msg, `名称超出长度限制！当前宽度 ${nw}/14（最多支持 7 个汉字或 14 个英文字符）。`);
        return ret;
      }
      if (dw > 30) {
        seal.replyToSender(ctx, msg, `描述超出长度限制！当前宽度 ${dw}/30（最多支持 15 个汉字或 30 个英文字符）。`);
        return ret;
      }
      if (items.length >= 20) { seal.replyToSender(ctx, msg, '官方面板最多20个项目。'); return ret; }
      items.push({ type: 'link', name, link, desc }); saveItems(items);
      seal.replyToSender(ctx, msg, `已添加链接项目：${name}（名称宽度 ${nw}/14，描述宽度 ${dw}/30）`); return ret;
    }
    if (op === 'set') {
      const key = String(cmdArgs.getArgN(2) || '').trim();
      const desc = cmdArgs.args.slice(2).join(' ').trim();
      const index = /^\d+$/.test(key) ? Number(key) - 1 : items.findIndex((item) => item.name === key);
      if (index < 0 || !items[index] || !desc) { seal.replyToSender(ctx, msg, '用法：.官方面板 set <名称|序号> <新描述>'); return ret; }
      const dw = getStrWidth(desc);
      if (dw > 30) {
        seal.replyToSender(ctx, msg, `描述超出长度限制！当前宽度 ${dw}/30（最多支持 15 个汉字或 30 个英文字符）。`);
        return ret;
      }
      items[index].desc = desc; saveItems(items);
      seal.replyToSender(ctx, msg, `已修改项目“${items[index].name}”描述（新描述宽度 ${dw}/30）。`); return ret;
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
          ? records.map((item) => `${item.panel_id}｜${item.scope}｜${item.target_type}｜${(item.panel && item.panel.remark) || ''}｜项目数:${((item.panel && item.panel.items) || []).length}`).join('\n')
          : `官方接口未返回 [${scope}] 场景的面板记录。`);
        return;
      }
      if (op === 'show') {
        const id = String(cmdArgs.getArgN(2) || '').trim();
        if (!id) { seal.replyToSender(ctx, msg, '用法：.官方面板 show <panel_id>'); return; }
        const result = await officialApi('GET', `/v2/panels/${encodeURIComponent(id)}`);
        seal.replyToSender(ctx, msg, JSON.stringify(result, null, 2)); return;
      }
      if (op === 'create') {
        const rawArgs = cmdArgs.args.slice(1);
        const force = rawArgs.some((a) => a === '-f' || a === '--force');
        const filterArgs = rawArgs.filter((a) => a !== '-f' && a !== '--force');
        const scope = String(filterArgs[0] || getConfig('默认场景', 'group')).trim();
        const targetType = String(filterArgs[1] || getConfig('默认范围', 'all')).trim();

        if (!['group', 'c2c', 'channel', 'dm'].includes(scope) || !['all', 'specific'].includes(targetType) || (targetType === 'specific' && !['group', 'c2c'].includes(scope))) {
          seal.replyToSender(ctx, msg, '用法：.官方面板 create [group|c2c|channel|dm] [all|specific] [-f]'); return;
        }

        const validRes = validateItems(items);
        if (!validRes.ok) {
          seal.replyToSender(ctx, msg, `项目本地合规校验未通过：\n${validRes.message}`);
          return;
        }

        // 预检：查询已有面板，避免同场景全局面板重复创建引发冲突
        let existingPanels = [];
        try {
          const listRes = await officialApi('GET', `/v2/panels?scope=${encodeURIComponent(scope)}&limit=50`);
          existingPanels = Array.isArray(listRes.records) ? listRes.records : [];
        } catch (e) {
          // 查询失败不阻断后续创建流程
        }

        if (targetType === 'all') {
          const existingGlobal = existingPanels.find((p) => p.target_type === 'all');
          if (existingGlobal) {
            if (force) {
              const updateRes = await officialApi('PUT', `/v2/panels/${encodeURIComponent(existingGlobal.panel_id)}`, {
                panel: { items, remark: 'SealDice 指令面板' }
              });
              seal.replyToSender(ctx, msg, `已自动覆盖更新当前 [${scope}] 场景已存在的全局面板：\nID: ${existingGlobal.panel_id}\n版本: ${updateRes.version === undefined ? '最新' : updateRes.version}`);
              return;
            } else {
              seal.replyToSender(
                ctx,
                msg,
                `检测到当前 [${scope}] 场景已存在全局面板：\n` +
                `ID: ${existingGlobal.panel_id}（备注: ${(existingGlobal.panel && existingGlobal.panel.remark) || '无'}）\n\n` +
                `官方规定同一场景全局面板唯一。请选择：\n` +
                `1. 发送 .官方面板 push ${existingGlobal.panel_id} 覆盖更新内容；\n` +
                `2. 或发送 .官方面板 create ${scope} -f 自动覆盖更新；\n` +
                `3. 或发送 .官方面板 remove ${existingGlobal.panel_id} 删除旧面板后重新创建。`
              );
              return;
            }
          }
        }

        const body = { scope, target_type: targetType, panel: { items, remark: 'SealDice 指令面板' } };
        if (targetType === 'specific') {
          const ids = filterArgs.slice(2).join(' ').split(/[,，\s]+/).filter(Boolean).slice(0, 20);
          if (scope === 'group') body.group_openids = ids;
          else if (scope === 'c2c') body.user_openids = ids;
          if (!ids.length) { seal.replyToSender(ctx, msg, 'specific 模式请在后面填写具体的 group_openid 或 user_openid。'); return; }
        }

        const result = await officialApi('POST', '/v2/panels', body);
        seal.replyToSender(ctx, msg, `官方面板创建成功：${result.panel_id || JSON.stringify(result)}`);
        return;
      }
      if (op === 'push' || op === 'update') {
        const id = String(cmdArgs.getArgN(2) || '').trim();
        if (!id) { seal.replyToSender(ctx, msg, '用法：.官方面板 push <panel_id>'); return; }
        const validRes = validateItems(items);
        if (!validRes.ok) {
          seal.replyToSender(ctx, msg, `项目本地合规校验未通过：\n${validRes.message}`);
          return;
        }
        const result = await officialApi('PUT', `/v2/panels/${encodeURIComponent(id)}`, { panel: { items, remark: 'SealDice 指令面板' } });
        seal.replyToSender(ctx, msg, `官方面板已覆盖更新：${result.version === undefined ? '成功' : `版本 ${result.version}`}`);
        return;
      }
      if (op === 'remove' || op === 'deletepanel') {
        const id = String(cmdArgs.getArgN(2) || '').trim();
        if (!id) { seal.replyToSender(ctx, msg, '用法：.官方面板 remove <panel_id>'); return; }
        await officialApi('DELETE', `/v2/panels/${encodeURIComponent(id)}`);
        seal.replyToSender(ctx, msg, `官方面板已删除：${id}`);
        return;
      }
      if (op === 'clean' || op === 'clear' || op === '清理') {
        const targetScope = String(cmdArgs.getArgN(2) || '').trim().toLowerCase();
        const scopesToClean = targetScope === 'all'
          ? ['group', 'c2c', 'channel', 'dm']
          : [targetScope || getConfig('默认场景', 'group')];
        let deletedCount = 0;
        let failCount = 0;
        for (const sc of scopesToClean) {
          try {
            const listRes = await officialApi('GET', `/v2/panels?scope=${encodeURIComponent(sc)}&limit=50`);
            const records = Array.isArray(listRes.records) ? listRes.records : [];
            for (const r of records) {
              if (r.panel_id) {
                try {
                  await officialApi('DELETE', `/v2/panels/${encodeURIComponent(r.panel_id)}`);
                  deletedCount++;
                } catch (e) {
                  failCount++;
                }
              }
            }
          } catch (e) {
            failCount++;
          }
        }
        seal.replyToSender(ctx, msg, `面板清理完成：成功删除 ${deletedCount} 个面板${failCount ? `，失败 ${failCount} 个` : ''}。`);
        return;
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
