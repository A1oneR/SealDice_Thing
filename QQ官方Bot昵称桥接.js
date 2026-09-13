// ==UserScript==
// @name         QQ官方Bot昵称桥接
// @author       local
// @version      1.8.0
// @description  将QQ官方Bot身份绑定到原QQ/QQ群，并同步平台昵称到AIPlugin用户档案。
// @timestamp    2026-09-11
// @license      MIT
// @sealVersion  1.6.0
// ==/UserScript==

(() => {
const EXT_NAME = 'qq-official-name-bridge';
const AI_EXT_NAME = 'aiplugin4';
const VERSION = '1.8.0';
const PENDING_TTL_MS = 10 * 60 * 1000;
const CARD_RECOVERY_DECOYS = [
  '艾琳娜·沃森', '格兰特·霍尔', '维克托·莱恩', '莉迪亚·格雷', '诺亚·贝克',
  '塞西莉亚·摩尔', '奥斯卡·里德', '伊芙琳·克拉克', '马库斯·怀特', '露西·哈珀',
  '阿尔伯特·芬奇', '黛安娜·罗斯', '西蒙·布莱克', '海伦·卡特', '埃德加·米尔斯',
  '朱利安·福克斯', '玛格丽特·希尔', '亚瑟·库珀', '索菲娅·伍德', '亨利·贝尔',
  '林砚秋', '沈闻舟', '顾长川', '苏晚晴', '周怀瑾',
  '程见雪', '陆景明', '叶知微', '许临川', '唐静姝',
  'K', 'Q', '零', '七', '无名氏', '？？？', '404', '000', 'Null', 'N/A',
  'PC-07', 'NPC?', 'Q_Q', 'M-01', 'λ-17', 'ξ', '███', '■', 'X Æ A-12', '404_NOT_FOUND',
  'Dr. Morrow', "O'Connor", 'Mary Jane', 'J.D.', 'A/B测试员', 'User_001', 'CASE-13', 'No Name',
  '雨宮レイ', '佐藤·零', '九十九夜', '山田（暂定）', 'クロ', '名無し', '이서준', 'Кира Волкова',
  '阿列克谢·K', '让-皮埃尔', '玛丽-安', '冯·诺依曼？', '伊本·萨利赫', 'A. Z. Crowley',
  '此处应有姓名', '名字被吃掉了', '调查员（临时）', '第十三位访客', '昨日的我', '明天再取名',
  '档案已损坏', '████-β', '门后的声音', '不愿透露姓名的人', '三号备用人格', '最后一个醒来的人',
  '小明.exe', 'root@arkham', 'C:\\Users\\Unknown', 'ERROR_姓名为空', '（空白）', '……',
  '猫猫？', '会走路的雨伞', '星期八', '半杯冷咖啡', '正在加载中', '不要选我', '真的不是NPC'
];
const GROUP_LOG_RECOVERY_DECOYS = [
  '序章', '第一夜', '第二幕', '幕间', '终章', '尾声', 'Session Zero', 'Session 01',
  '未命名日志', '新建文本文档', 'log_001', 'backup-final-final', '归档-请勿删除',
  '2024-07-13', '周六团记录', '临时记录', '测试log', '跑团记录（最终版）',
  '雾港来信', '午夜列车', '白塔之下', '无星之夜', '旧宅调查', '沉没剧院',
  '？？？', '████', '404_LOG_NOT_FOUND', '第十三次重开', '这次一定开完', 'KP忘记改名了',
  '只有骰点没有RP', '不要点开', '已撕卡', '团灭现场', '梦里发生的事', '昨天的明天'
];

let ext = seal.ext.find(EXT_NAME);
if (!ext) {
  ext = seal.ext.new(EXT_NAME, 'local', VERSION);
  seal.ext.register(ext);
}

seal.ext.registerBoolConfig(
  ext,
  'overwriteExistingName',
  false,
  '是否用QQ官方Bot最新下发的昵称覆盖AIPlugin已经保存的名称'
);
seal.ext.registerBoolConfig(
  ext,
  'enableCardRecovery',
  true,
  '原QQ Bot不可用时，允许通过五个角色卡名称选项恢复绑定'
);
seal.ext.registerIntConfig(
  ext,
  'cardRecoveryCooldownMinutes',
  30,
  '角色卡验证答错后的冷却分钟数，范围10-1440'
);
seal.ext.registerBoolConfig(
  ext,
  'enableGroupLogRecovery',
  true,
  '原QQ Bot不可用时，允许通过原群历史Log名称恢复群绑定'
);
seal.ext.registerIntConfig(
  ext,
  'groupLogRecoveryCooldownMinutes',
  30,
  '群Log验证答错后的冷却分钟数，范围10-1440'
);
seal.ext.registerBoolConfig(
  ext,
  'logUpdates',
  false,
  '是否在同步昵称时输出日志'
);
seal.ext.registerBoolConfig(
  ext,
  'enableButtons',
  true,
  '是否在QQ官方Bot消息中附带快捷按钮（角色卡验证、状态查询等）'
);
seal.ext.registerBoolConfig(
  ext,
  'buttonAutoEnter',
  true,
  '快捷按钮点击后是否直接自动发送指令（若关闭则仅将指令填入输入框）'
);

function isButtonEnabled() {
  try {
    return seal.ext.getBoolConfig(ext, 'enableButtons');
  } catch (err) {
    return true;
  }
}

function isButtonAutoEnter() {
  try {
    return seal.ext.getBoolConfig(ext, 'buttonAutoEnter');
  } catch (err) {
    return true;
  }
}

function sanitizeButtonLabel(text, maxLen = 16) {
  const str = String(text || '').replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(1, maxLen - 1)) + '…';
}

function buildCommandButton(id, label, command, visitedLabel, autoEnter, style = 0) {
  return {
    id: String(id),
    render_data: {
      label: sanitizeButtonLabel(label, 16),
      visited_label: sanitizeButtonLabel(visitedLabel || label, 16),
      style: Number(style) || 0
    },
    action: {
      type: 2, // ActionTypeAtBot (指令按钮)
      permission: { type: 2 }, // PermissionTypAll (所有人可操作，插件内校验身份)
      data: String(command || ''),
      enter: autoEnter !== false,
      unsupport_tips: '当前客户端版本暂不支持快捷按钮，请手动发送指令'
    }
  };
}

function buildKeyboardRows(buttonList, columns = 2, autoEnter = true) {
  const rows = [];
  for (let i = 0; i < buttonList.length && rows.length < 5; i += columns) {
    const chunk = buttonList.slice(i, i + columns);
    const buttons = chunk.map((b, idx) =>
      buildCommandButton(
        b.id || `btn_${rows.length}_${idx}`,
        b.label || b.name || '',
        b.command || b.data || '',
        b.visitedLabel,
        b.enter !== undefined ? b.enter : autoEnter,
        b.style !== undefined ? b.style : 0
      )
    );
    if (buttons.length > 0) {
      rows.push({ buttons });
    }
  }
  return rows;
}

function normalizeKeyboardRows(input, defaultAutoEnter = true, defaultColumns = 2) {
  if (!Array.isArray(input) || input.length === 0) return [];
  if (input[0] && Array.isArray(input[0].buttons)) {
    return input.slice(0, 5);
  }
  if (input[0] && Array.isArray(input[0])) {
    const rows = [];
    for (let r = 0; r < input.length && rows.length < 5; r++) {
      const rowChunk = input[r].slice(0, 5);
      const buttons = rowChunk.map((b, idx) =>
        buildCommandButton(
          b.id || `btn_${r}_${idx}`,
          b.label || b.name || '',
          b.command || b.data || '',
          b.visitedLabel,
          b.enter !== undefined ? b.enter : defaultAutoEnter,
          b.style !== undefined ? b.style : 0
        )
      );
      if (buttons.length > 0) {
        rows.push({ buttons });
      }
    }
    return rows;
  }
  return buildKeyboardRows(input, defaultColumns, defaultAutoEnter);
}

function buildQuizKeyboardRows(code, options, cmdPrefix, fallbackText, autoEnter = true) {
  const buttonItems = [];
  (Array.isArray(options) ? options : []).forEach((name, index) => {
    const num = index + 1;
    buttonItems.push({
      id: `quiz_${num}`,
      label: `${num}. ${name}`,
      visitedLabel: `已选: ${name}`,
      command: `${cmdPrefix} ${code} ${num}`,
      enter: autoEnter,
      style: 0
    });
  });
  buttonItems.push({
    id: 'quiz_6',
    label: `6. ${fallbackText}`,
    visitedLabel: `已选: ${fallbackText}`,
    command: `${cmdPrefix} ${code} 6`,
    enter: autoEnter,
    style: 0
  });
  return buildKeyboardRows(buttonItems, 2, autoEnter);
}

function replyWithButtons(ctx, msg, text, buttonRows) {
  if (!isButtonEnabled() || !Array.isArray(buttonRows) || buttonRows.length === 0) {
    seal.replyToSender(ctx, msg, text);
    return;
  }

  const userId = currentUserId(ctx, msg);
  const groupId = currentGroupId(ctx, msg);
  const isOfficial = !!getOfficialQQIdentity(userId) || isOfficialGroupId(groupId);

  if (!isOfficial || typeof seal.replyToSenderWithKeyboard !== 'function') {
    seal.replyToSender(ctx, msg, text);
    return;
  }

  const rows = normalizeKeyboardRows(buttonRows, isButtonAutoEnter(), 2);
  if (!rows.length) {
    seal.replyToSender(ctx, msg, text);
    return;
  }

  const payload = { content: { rows } };
  try {
    seal.replyToSenderWithKeyboard(ctx, msg, text, payload);
  } catch (err) {
    console.warn(`[${EXT_NAME}] 发送快捷按钮失败，降级为普通文本: ${err.message || err}`);
    seal.replyToSender(ctx, msg, text);
  }
}

function getOfficialQQIdentity(userId) {
  if (typeof userId !== 'string') return null;

  const groupOrC2C = /^OpenQQ:[^-]+-(.+)$/.exec(userId);
  if (groupOrC2C) {
    return { userId, opaqueId: groupOrC2C[1] };
  }

  if (userId.startsWith('OpenQQCH:') && userId.length > 'OpenQQCH:'.length) {
    return { userId, opaqueId: userId.slice('OpenQQCH:'.length) };
  }

  return null;
}

function isOfficialGroupId(groupId) {
  return typeof groupId === 'string' && /^OpenQQ-Group:[^-]+-.+/.test(groupId);
}

function normalizeLegacyUserId(value) {
  const match = /^(?:QQ:)?(\d{5,12})$/.exec(String(value || '').trim());
  return match ? `QQ:${match[1]}` : '';
}

function normalizeLegacyGroupId(value) {
  const match = /^(?:QQ-Group:)?(\d{5,12})$/.exec(String(value || '').trim());
  return match ? `QQ-Group:${match[1]}` : '';
}

function bindingKey(kind, officialId) {
  return `binding:${kind}:${officialId}`;
}

function reverseBindingKey(kind, legacyId) {
  return `binding:${kind}-reverse:${legacyId}`;
}

function readBinding(kind, officialId) {
  if (!officialId) return '';
  return String(ext.storageGet(bindingKey(kind, officialId)) || '').trim();
}

function readReverseBinding(kind, legacyId) {
  if (!legacyId) return '';
  return String(ext.storageGet(reverseBindingKey(kind, legacyId)) || '').trim();
}

function resolveUserId(userId) {
  return getOfficialQQIdentity(userId) ? (readBinding('user', userId) || userId) : userId;
}

function resolveGroupId(groupId) {
  return isOfficialGroupId(groupId) ? (readBinding('group', groupId) || groupId) : groupId;
}

function getUserBindingStatus(userId) {
  const value = String(userId || '');
  const official = !!getOfficialQQIdentity(value);
  const legacyId = official ? readBinding('user', value) : normalizeLegacyUserId(value);
  return {
    required: official,
    bound: !official || !!legacyId,
    userId: value,
    legacyId: legacyId || '',
    resolvedUserId: legacyId || value
  };
}

function isUserBound(userId) {
  return getUserBindingStatus(userId).bound;
}

function requireUserBinding(ctx, msg, featureName) {
  const status = getUserBindingStatus(currentUserId(ctx, msg));
  if (status.bound) return true;
  const feature = sanitizeCardChoice(featureName || '该功能');
  replyWithButtons(
    ctx,
    msg,
    `${feature || '该功能'}需要先绑定原QQ号。\n请发送：.QQ绑定 <原QQ号>\n旧Bot不可用时可按随后给出的角色卡选项完成验证。`,
    [
      [
        { label: '🔗 发起QQ绑定', command: '.QQ绑定 ', enter: false, style: 1 }
      ]
    ]
  );
  return false;
}

function loadBindingIndex() {
  try {
    const value = JSON.parse(ext.storageGet('binding:index') || '[]');
    return Array.isArray(value) ? value : [];
  } catch (err) {
    return [];
  }
}

function saveBindingIndex(items) {
  ext.storageSet('binding:index', JSON.stringify(items.slice(-2000)));
}

function registerCoreAlias(officialId, legacyId) {
  if (typeof seal.registerOfficialQQIdentityAlias !== 'function') {
    throw new Error('当前海豹核心不支持QQ身份映射，请更新配套核心程序');
  }
  if (!seal.registerOfficialQQIdentityAlias(officialId, legacyId)) {
    throw new Error('海豹核心拒绝了不匹配的QQ身份映射');
  }
  return true;
}

function inheritCoreCharacterBinding(groupId, officialUserId) {
  if (!isOfficialGroupId(groupId) || !getOfficialQQIdentity(officialUserId) ||
      typeof seal.inheritOfficialQQCharacterBinding !== 'function') return false;
  try {
    const result = seal.inheritOfficialQQCharacterBinding(groupId, officialUserId);
    if (result && result.ok === false) {
      console.warn(`[${EXT_NAME}] 继承原QQ当前角色卡失败: ${result.error || '未知错误'}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[${EXT_NAME}] 继承原QQ当前角色卡失败: ${err.message || err}`);
    return false;
  }
}

function migrateStoredCharacterBindingOnce(ctx, msg) {
  const groupId = currentGroupId(ctx, msg);
  const userId = currentUserId(ctx, msg);
  if (!isOfficialGroupId(groupId) || !getOfficialQQIdentity(userId) || !readBinding('user', userId)) return;
  const key = `character-binding-migrated-v2:${groupId}:${userId}`;
  if (ext.storageGet(key) === '1') return;
  if (inheritCoreCharacterBinding(groupId, userId)) ext.storageSet(key, '1');
}

// Early message hooks run before native command dispatch. Repair bindings here
// so old storage created before binding:index existed also reaches .pc/.st/.ra.
function restoreStoredBindingsForMessage(ctx, msg) {
  const userId = currentUserId(ctx, msg);
  if (getOfficialQQIdentity(userId)) {
    const legacyUserId = readBinding('user', userId);
    if (legacyUserId) {
      restoreStoredUserBinding(userId, legacyUserId);
      readPrimaryUserBinding(legacyUserId);
    }
  }

  const groupId = currentGroupId(ctx, msg);
  if (isOfficialGroupId(groupId)) {
    const legacyGroupId = readBinding('group', groupId);
    if (legacyGroupId) {
      try {
        registerCoreAlias(groupId, legacyGroupId);
        rememberBinding('group', groupId, legacyGroupId);
      } catch (err) {
        console.warn(`[${EXT_NAME}] 恢复老版QQ群身份映射失败: ${err.message || err}`);
      }
    }
  }
}

function nativeCharacterInventorySummary(legacyUserId) {
  if (typeof seal.getOfficialQQBindingCardNames !== 'function') return '当前核心不支持库存诊断';
  try {
    const result = seal.getOfficialQQBindingCardNames(legacyUserId);
    if (!result || result.ok !== true) return `库存诊断失败：${result && result.error || '未知错误'}`;
    const names = Array.isArray(result.names) ? result.names : [];
    return `原生角色卡库存：${names.length} 张`;
  } catch (err) {
    return `库存诊断失败：${err.message || err}`;
  }
}

function removeCoreAlias(officialId) {
  if (typeof seal.removeOfficialQQIdentityAlias === 'function') {
    seal.removeOfficialQQIdentityAlias(officialId);
  }
}

function rememberBinding(kind, officialId, legacyId) {
  const currentItems = loadBindingIndex();
  if (currentItems.some(item => item &&
      item.kind === kind &&
      item.officialId === officialId &&
      item.legacyId === legacyId)) return;
  const items = currentItems.filter(item => item && item.officialId !== officialId);
  items.push({ kind, officialId, legacyId });
  saveBindingIndex(items);
}

function forgetBinding(officialId) {
  saveBindingIndex(loadBindingIndex().filter(item => item && item.officialId !== officialId));
}

function findAlternateBinding(kind, legacyId, excludedOfficialId) {
  const item = loadBindingIndex().find(candidate => candidate &&
    candidate.kind === kind &&
    candidate.legacyId === legacyId &&
    candidate.officialId !== excludedOfficialId &&
    (kind !== 'user' || isCurrentOfficialUserId(candidate.officialId)) &&
    readBinding(kind, candidate.officialId) === legacyId);
  return item ? String(item.officialId || '') : '';
}

function isCurrentOfficialUserId(userId) {
  const value = String(userId || '');
  return /^OpenQQ:\d{5,12}-.+/.test(value) ||
    (value.startsWith('OpenQQCH:') && value.length > 'OpenQQCH:'.length);
}

function restoreStoredUserBinding(officialId, legacyId) {
  if (!officialId || !legacyId) return false;
  try {
    registerCoreAlias(officialId, legacyId);
    rememberBinding('user', officialId, legacyId);
    return true;
  } catch (err) {
    console.warn(`[${EXT_NAME}] 恢复老版QQ身份映射失败: ${err.message || err}`);
    return false;
  }
}

function readPrimaryUserBinding(legacyId) {
  const primary = readReverseBinding('user', legacyId);
  if (primary && readBinding('user', primary) === legacyId) {
    restoreStoredUserBinding(primary, legacyId);
    return primary;
  }
  const replacement = findAlternateBinding('user', legacyId, '');
  if (primary || replacement) {
    ext.storageSet(reverseBindingKey('user', legacyId), replacement);
  }
  return replacement;
}

function isMigratedVersionOfOfficialUser(storedId, currentId) {
  if (storedId === currentId) return true;
  const currentIdentity = getOfficialQQIdentity(currentId);
  if (!currentIdentity || currentIdentity.opaqueId.length < 8) return false;

  const storedIdentity = getOfficialQQIdentity(storedId);
  if (storedIdentity && storedIdentity.opaqueId === currentIdentity.opaqueId) return true;
  return String(storedId || '').startsWith('OpenQQ-Member-T:') &&
    String(storedId).endsWith(`-${currentIdentity.opaqueId}`);
}

function promoteMigratedPrimaryBinding(storedId, currentId, legacyId) {
  restoreStoredUserBinding(storedId, legacyId);
  ext.storageSet(bindingKey('user', currentId), legacyId);
  ext.storageSet(reverseBindingKey('user', legacyId), currentId);
  registerCoreAlias(currentId, legacyId);
  rememberBinding('user', currentId, legacyId);
}

function repairReverseBinding(kind, legacyId, removedOfficialId) {
  if (readReverseBinding(kind, legacyId) !== removedOfficialId) return;
  ext.storageSet(
    reverseBindingKey(kind, legacyId),
    findAlternateBinding(kind, legacyId, removedOfficialId)
  );
}

function writeBinding(kind, officialId, legacyId, ownerId) {
  const claimedBy = kind === 'user'
    ? readPrimaryUserBinding(legacyId)
    : readReverseBinding(kind, legacyId);
  if (kind === 'group' && claimedBy && claimedBy !== officialId) {
    throw new Error('该QQ群已经绑定了另一个官Bot群');
  }

  const oldLegacyId = readBinding(kind, officialId);
  if (oldLegacyId && oldLegacyId !== legacyId) {
    repairReverseBinding(kind, oldLegacyId, officialId);
  }
  ext.storageSet(bindingKey(kind, officialId), legacyId);
  if (!claimedBy || claimedBy === officialId) {
    ext.storageSet(reverseBindingKey(kind, legacyId), officialId);
  }
  if (kind === 'group' && ownerId) ext.storageSet(`binding:group-owner:${officialId}`, ownerId);
  registerCoreAlias(officialId, legacyId);
  rememberBinding(kind, officialId, legacyId);
}

function removeBinding(kind, officialId, legacyId) {
  if (kind === 'user' && !officialId && legacyId) {
    const matches = loadBindingIndex().filter(item => item &&
      item.kind === 'user' && item.legacyId === legacyId);
    matches.forEach(item => {
      ext.storageSet(bindingKey('user', item.officialId), '');
      removeCoreAlias(item.officialId);
      forgetBinding(item.officialId);
    });
    ext.storageSet(reverseBindingKey('user', legacyId), '');
    return matches.length > 0;
  }

  const resolvedOfficialId = officialId || readReverseBinding(kind, legacyId);
  const resolvedLegacyId = legacyId || readBinding(kind, officialId);
  if (!resolvedOfficialId || !resolvedLegacyId) return false;
  ext.storageSet(bindingKey(kind, resolvedOfficialId), '');
  repairReverseBinding(kind, resolvedLegacyId, resolvedOfficialId);
  if (kind === 'group') ext.storageSet(`binding:group-owner:${resolvedOfficialId}`, '');
  removeCoreAlias(resolvedOfficialId);
  forgetBinding(resolvedOfficialId);
  return true;
}

function pendingKey(code) {
  return `pending:${code}`;
}

function pendingOwnerKey(kind, officialId) {
  return `pending-owner:${kind}:${officialId}`;
}

function createPending(kind, officialId, legacyId, requesterId, extra) {
  const previousCode = String(ext.storageGet(pendingOwnerKey(kind, officialId)) || '');
  if (previousCode) ext.storageSet(pendingKey(previousCode), '');

  let code = '';
  for (let attempt = 0; attempt < 20; attempt++) {
    code = String(Math.floor(10000000 + Math.random() * 90000000));
    if (!ext.storageGet(pendingKey(code))) break;
  }
  const pending = {
    kind,
    officialId,
    legacyId,
    requesterId: String(requesterId || ''),
    expiresAt: Date.now() + PENDING_TTL_MS
  };
  if (extra && typeof extra === 'object') {
    Object.keys(extra).forEach(key => { pending[key] = extra[key]; });
  }
  ext.storageSet(pendingKey(code), JSON.stringify(pending));
  ext.storageSet(pendingOwnerKey(kind, officialId), code);
  return code;
}

function loadPending(code) {
  let pending;
  try {
    pending = JSON.parse(ext.storageGet(pendingKey(code)) || 'null');
  } catch (err) {
    pending = null;
  }
  if (!pending || !pending.kind || !pending.officialId || !pending.legacyId) return null;
  if (Number(pending.expiresAt || 0) <= Date.now()) {
    ext.storageSet(pendingKey(code), '');
    ext.storageSet(pendingOwnerKey(pending.kind, pending.officialId), '');
    return null;
  }
  return pending;
}

function consumePending(code, pending) {
  ext.storageSet(pendingKey(code), '');
  ext.storageSet(pendingOwnerKey(pending.kind, pending.officialId), '');
}

function sanitizeCardChoice(name) {
  return String(name || '')
    .replace(/[\r\n\t|`\[\]<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 36);
}

function shuffle(items) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index--) {
    const selected = Math.floor(Math.random() * (index + 1));
    const temp = result[index];
    result[index] = result[selected];
    result[selected] = temp;
  }
  return result;
}

function cardRecoveryCooldownMs() {
  let minutes = Number(seal.ext.getIntConfig(ext, 'cardRecoveryCooldownMinutes') || 30);
  minutes = Math.max(10, Math.min(1440, Math.floor(minutes)));
  return minutes * 60 * 1000;
}

function cardRecoveryCooldownKey(officialId) {
  return `card-recovery-cooldown:${officialId}`;
}

function remainingCardRecoveryCooldown(officialId) {
  const until = Number(ext.storageGet(cardRecoveryCooldownKey(officialId)) || 0);
  return Math.max(0, until - Date.now());
}

function buildCardRecoveryQuiz(legacyUserId) {
  if (!seal.ext.getBoolConfig(ext, 'enableCardRecovery')) {
    return { available: false, reason: '角色卡恢复验证已关闭' };
  }
  if (typeof seal.getOfficialQQBindingCardNames !== 'function') {
    return { available: false, reason: '当前海豹核心不支持角色卡恢复验证' };
  }

  let result;
  try {
    result = seal.getOfficialQQBindingCardNames(legacyUserId);
  } catch (err) {
    return { available: false, reason: `角色卡数据库查询失败：${err.message || err}` };
  }
  if (!result || result.ok !== true) {
    return { available: false, reason: String(result && result.error || '角色卡数据库查询失败') };
  }

  const ownedNames = [];
  const ownedSet = {};
  Array.from(result.names || []).forEach(rawName => {
    const name = sanitizeCardChoice(rawName);
    const key = name.toLowerCase();
    if (!name || ownedSet[key]) return;
    ownedSet[key] = true;
    ownedNames.push(name);
  });

  const decoys = shuffle(CARD_RECOVERY_DECOYS.filter(name => !ownedSet[name.toLowerCase()]));
  let options;
  let answer;
  if (ownedNames.length) {
    const ownedName = ownedNames[Math.floor(Math.random() * ownedNames.length)];
    options = shuffle([ownedName].concat(decoys.slice(0, 4)));
    answer = options.indexOf(ownedName) + 1;
  } else {
    options = decoys.slice(0, 5);
    answer = 6;
  }
  return { available: true, options, answer, hasCards: ownedNames.length > 0 };
}

function renderCardRecoveryQuiz(code, quiz) {
  const lines = ['旧Bot不可用时，可通过角色卡名称验证：'];
  quiz.options.forEach((name, index) => lines.push(`${index + 1}. ${name}`));
  lines.push('6. 没有可用的卡');
  lines.push(`请在10分钟内发送：.QQ绑定验证 ${code} <序号>`);
  lines.push('每次只有一次作答机会，答错后进入冷却。');
  return lines.join('\n');
}

function groupLogRecoveryCooldownMs() {
  let minutes = Number(seal.ext.getIntConfig(ext, 'groupLogRecoveryCooldownMinutes') || 30);
  minutes = Math.max(10, Math.min(1440, Math.floor(minutes)));
  return minutes * 60 * 1000;
}

function groupLogRecoveryCooldownKey(officialGroupId) {
  return `group-log-recovery-cooldown:${officialGroupId}`;
}

function remainingGroupLogRecoveryCooldown(officialGroupId) {
  const until = Number(ext.storageGet(groupLogRecoveryCooldownKey(officialGroupId)) || 0);
  return Math.max(0, until - Date.now());
}

function buildGroupLogRecoveryQuiz(legacyGroupId) {
  if (!seal.ext.getBoolConfig(ext, 'enableGroupLogRecovery')) {
    return { available: false, reason: '群Log恢复验证已关闭' };
  }
  if (typeof seal.getOfficialQQBindingLogNames !== 'function') {
    return { available: false, reason: '当前海豹核心不支持群Log恢复验证' };
  }

  let result;
  try {
    result = seal.getOfficialQQBindingLogNames(legacyGroupId);
  } catch (err) {
    return { available: false, reason: `群Log数据库查询失败：${err.message || err}` };
  }
  if (!result || result.ok !== true) {
    return { available: false, reason: String(result && result.error || '群Log数据库查询失败') };
  }

  const ownedNames = [];
  const ownedSet = {};
  Array.from(result.names || []).forEach(rawName => {
    const name = sanitizeCardChoice(rawName);
    const key = name.toLowerCase();
    if (!name || ownedSet[key]) return;
    ownedSet[key] = true;
    ownedNames.push(name);
  });

  const decoys = shuffle(GROUP_LOG_RECOVERY_DECOYS.filter(name => !ownedSet[name.toLowerCase()]));
  let options;
  let answer;
  if (ownedNames.length) {
    const ownedName = ownedNames[Math.floor(Math.random() * ownedNames.length)];
    options = shuffle([ownedName].concat(decoys.slice(0, 4)));
    answer = options.indexOf(ownedName) + 1;
  } else {
    options = decoys.slice(0, 5);
    answer = 6;
  }
  return { available: true, options, answer, hasLogs: ownedNames.length > 0 };
}

function renderGroupLogRecoveryQuiz(code, quiz) {
  const lines = ['旧Bot不可用时，可通过原群历史Log名称验证：'];
  quiz.options.forEach((name, index) => lines.push(`${index + 1}. ${name}`));
  lines.push('6. 该群没有可用的历史Log');
  lines.push(`请在10分钟内发送：.QQ群绑定验证 ${code} <序号>`);
  lines.push('每次只有一次作答机会，答错后该官Bot群进入冷却。');
  return lines.join('\n');
}

function currentUserId(ctx, msg) {
  return String((ctx && ctx.player && ctx.player.userId) || (msg && msg.sender && msg.sender.userId) || '');
}

function currentGroupId(ctx, msg) {
  return String((ctx && ctx.group && ctx.group.groupId) || (msg && msg.groupId) || '');
}

function commandResult() {
  return seal.ext.newCmdExecuteResult(true);
}

function isGeneratedFallbackName(name, opaqueId) {
  if (name === '用户') return true;
  return opaqueId.length >= 4 && name === `用户${opaqueId.slice(-4)}`;
}

function syncNickname(ctx, msg) {
  const userId = ctx && ctx.player ? ctx.player.userId : '';
  const identity = getOfficialQQIdentity(userId);
  if (!identity) return;

  const nickname = msg && msg.sender && typeof msg.sender.nickname === 'string'
    ? msg.sender.nickname.trim()
    : '';
  if (!nickname || isGeneratedFallbackName(nickname, identity.opaqueId)) return;

  const aiExt = seal.ext.find(AI_EXT_NAME);
  if (!aiExt) return;

  const resolvedUserId = resolveUserId(identity.userId);
  const storageKey = `user_${resolvedUserId}`;
  let user = {};
  try {
    user = JSON.parse(aiExt.storageGet(storageKey) || '{}');
  } catch (err) {
    console.warn(`[${EXT_NAME}] AIPlugin用户档案解析失败: ${err}`);
  }

  const overwrite = seal.ext.getBoolConfig(ext, 'overwriteExistingName');
  if (user.userName && user.userName !== nickname && !overwrite) return;
  if (user.userName === nickname && user.userId === resolvedUserId) return;

  user.userId = resolvedUserId;
  user.userName = nickname;
  aiExt.storageSet(storageKey, JSON.stringify(user));

  if (seal.ext.getBoolConfig(ext, 'logUpdates')) {
    console.log(`[${EXT_NAME}] 已同步QQ官方Bot用户昵称: ${nickname}`);
  }
}

const cmdUserBind = seal.ext.newCmdItemInfo();
cmdUserBind.name = 'QQ绑定';
cmdUserBind.help = `将QQ官Bot身份绑定到原QQ号，以继续使用原有插件数据。
官Bot侧：.QQ绑定 <原QQ号>
原QQ侧：.QQ绑定确认 <验证码>
旧Bot不可用：.QQ绑定验证 <验证码> <选项序号>
其他官Bot群：发起后回首次绑定处使用 .QQ绑定确认 <验证码>
查看：.QQ绑定 状态
解除：.QQ绑定 解绑`;
cmdUserBind.solve = (ctx, msg, cmdArgs) => {
  const op = String(cmdArgs.getArgN(1) || '状态').trim();
  const userId = currentUserId(ctx, msg);
  const officialIdentity = getOfficialQQIdentity(userId);
  const legacyUserId = normalizeLegacyUserId(userId);

  if (op === '帮助' || op.toLowerCase() === 'help') {
    replyWithButtons(ctx, msg, cmdUserBind.help, [
      [
        { label: '📊 绑定状态', command: '.QQ绑定 状态', enter: true, style: 0 },
        { label: '🔗 发起绑定', command: '.QQ绑定 ', enter: false, style: 1 }
      ],
      [
        { label: '🔓 解除绑定', command: '.QQ绑定 解绑', enter: true, style: 0 }
      ]
    ]);
    return commandResult();
  }

  if (op === '状态' || op.toLowerCase() === 'status') {
    const bound = officialIdentity ? readBinding('user', userId) : readPrimaryUserBinding(legacyUserId);
    if (bound && officialIdentity) {
      const coreReady = restoreStoredUserBinding(userId, bound);
      readPrimaryUserBinding(bound);
      replyWithButtons(ctx, msg, `当前官Bot身份已绑定原QQ，核心映射${coreReady ? '已刷新' : '刷新失败'}。\n${nativeCharacterInventorySummary(bound)}`, [
        [
          { label: '📊 刷新状态', command: '.QQ绑定 状态', enter: true, style: 0 },
          { label: '🔓 解除绑定', command: '.QQ绑定 解绑', enter: true, style: 0 }
        ]
      ]);
    } else {
      replyWithButtons(ctx, msg, bound
        ? '当前原QQ已绑定官Bot身份（身份标识已隐藏）。'
        : '当前身份尚未建立QQ绑定。',
        officialIdentity && !bound ? [
          [
            { label: '🔗 发起QQ绑定', command: '.QQ绑定 ', enter: false, style: 1 }
          ]
        ] : []
      );
    }
    return commandResult();
  }

  if (op === '解绑' || op.toLowerCase() === 'unbind') {
    const removed = officialIdentity
      ? removeBinding('user', userId, '')
      : removeBinding('user', '', legacyUserId);
    replyWithButtons(ctx, msg, removed ? 'QQ身份绑定已解除。' : '当前身份没有可解除的QQ绑定。',
      officialIdentity ? [
        [
          { label: '🔗 重新发起绑定', command: '.QQ绑定 ', enter: false, style: 1 }
        ]
      ] : []
    );
    return commandResult();
  }

  if (!officialIdentity) {
    seal.replyToSender(ctx, msg, '请先在QQ官Bot会话中使用 .QQ绑定 <原QQ号> 发起绑定。');
    return commandResult();
  }

  const target = normalizeLegacyUserId(op);
  if (!target) {
    replyWithButtons(ctx, msg, 'QQ号格式不正确。用法：.QQ绑定 <原QQ号>', [
      [
        { label: '🔗 发起QQ绑定', command: '.QQ绑定 ', enter: false, style: 1 }
      ]
    ]);
    return commandResult();
  }
  const current = readBinding('user', userId);
  if (current === target) {
    replyWithButtons(ctx, msg, `当前官Bot身份已经绑定 ${target}。`, [
      [
        { label: '📊 查看状态', command: '.QQ绑定 状态', enter: true, style: 0 },
        { label: '🔓 解除绑定', command: '.QQ绑定 解绑', enter: true, style: 0 }
      ]
    ]);
    return commandResult();
  }
  const primaryOfficialId = readPrimaryUserBinding(target);
  if (primaryOfficialId && primaryOfficialId !== userId) {
    const code = createPending('user-link', userId, target, userId, {
      primaryOfficialId,
      targetGroupId: currentGroupId(ctx, msg)
    });
    replyWithButtons(
      ctx,
      msg,
      `当前群的官Bot身份需要追加绑定。\n验证码：${code}\n请在10分钟内回到首次完成QQ绑定的官Bot群或会话，由本人发送：.QQ绑定确认 ${code}`,
      [
        [
          { label: '📊 查看绑定状态', command: '.QQ绑定 状态', enter: true, style: 0 }
        ]
      ]
    );
    return commandResult();
  }

  const cooldown = remainingCardRecoveryCooldown(userId);
  const quiz = cooldown > 0 ? null : buildCardRecoveryQuiz(target);
  const pendingExtra = { targetGroupId: currentGroupId(ctx, msg) };
  if (quiz && quiz.available) {
    pendingExtra.quizAnswer = quiz.answer;
    pendingExtra.quizHasCards = quiz.hasCards;
  }
  const code = createPending('user', userId, target, userId, pendingExtra);
  const lines = [
    `绑定验证码：${code}`,
    `旧Bot可用时，请在10分钟内使用原QQ号发送：.QQ绑定确认 ${code}`
  ];
  let buttonRows = [];
  if (quiz && quiz.available) {
    lines.push('', renderCardRecoveryQuiz(code, quiz));
    buttonRows = buildQuizKeyboardRows(code, quiz.options, '.QQ绑定验证', '没有可用的卡', isButtonAutoEnter());
  } else if (cooldown > 0) {
    lines.push('', `角色卡验证仍在冷却中，约 ${Math.ceil(cooldown / 60000)} 分钟后可重新发起。`);
    buttonRows = [
      [{ label: '📊 查看绑定状态', command: '.QQ绑定 状态', enter: true, style: 0 }]
    ];
  } else if (quiz && quiz.reason) {
    lines.push('', `角色卡验证暂不可用：${quiz.reason}`);
    buttonRows = [
      [{ label: '📊 查看绑定状态', command: '.QQ绑定 状态', enter: true, style: 0 }]
    ];
  }
  replyWithButtons(ctx, msg, lines.join('\n'), buttonRows);
  return commandResult();
};

const cmdUserConfirm = seal.ext.newCmdItemInfo();
cmdUserConfirm.name = 'QQ绑定确认';
cmdUserConfirm.help = '确认QQ身份绑定或其他群的追加绑定：.QQ绑定确认 <验证码>';
cmdUserConfirm.solve = (ctx, msg, cmdArgs) => {
  const code = String(cmdArgs.getArgN(1) || '').trim();
  const pending = /^\d{8}$/.test(code) ? loadPending(code) : null;
  const confirmerId = currentUserId(ctx, msg);
  if (!pending || (pending.kind !== 'user' && pending.kind !== 'user-link')) {
    seal.replyToSender(ctx, msg, '验证码无效或已过期，请回到官Bot重新发起绑定。');
    return commandResult();
  }

  if (pending.kind === 'user-link') {
    let primaryConfirmed = !!getOfficialQQIdentity(confirmerId) &&
      confirmerId === pending.primaryOfficialId &&
      readBinding('user', confirmerId) === pending.legacyId;
    if (!primaryConfirmed &&
        readBinding('user', pending.primaryOfficialId) === pending.legacyId &&
        isMigratedVersionOfOfficialUser(pending.primaryOfficialId, confirmerId)) {
      try {
        promoteMigratedPrimaryBinding(pending.primaryOfficialId, confirmerId, pending.legacyId);
        primaryConfirmed = true;
      } catch (err) {
        console.warn(`[${EXT_NAME}] 升级老版首绑身份失败: ${err.message || err}`);
      }
    }
    if (!primaryConfirmed) {
      seal.replyToSender(ctx, msg, '追加绑定必须回到首次完成QQ绑定的官Bot群或会话，由本人确认。');
      return commandResult();
    }
    try {
      writeBinding('user', pending.officialId, pending.legacyId, pending.requesterId);
      inheritCoreCharacterBinding(pending.targetGroupId, pending.officialId);
      consumePending(code, pending);
      replyWithButtons(ctx, msg, '当前新群的官Bot身份已追加绑定，无需重复进行原QQ或角色卡验证。', [
        [{ label: '📊 查看绑定状态', command: '.QQ绑定 状态', enter: true, style: 1 }]
      ]);
    } catch (err) {
      seal.replyToSender(ctx, msg, `绑定失败：${err.message || err}`);
    }
    return commandResult();
  }

  const legacyUserId = normalizeLegacyUserId(confirmerId);
  if (!legacyUserId || legacyUserId !== pending.legacyId) {
    seal.replyToSender(ctx, msg, '必须使用待绑定的原QQ账号确认。');
    return commandResult();
  }
  try {
    writeBinding('user', pending.officialId, pending.legacyId, pending.requesterId);
    inheritCoreCharacterBinding(pending.targetGroupId, pending.officialId);
    consumePending(code, pending);
    replyWithButtons(ctx, msg, 'QQ身份绑定成功，官Bot侧插件将继续使用该QQ号对应的历史数据。', [
      [{ label: '📊 查看绑定状态', command: '.QQ绑定 状态', enter: true, style: 1 }]
    ]);
  } catch (err) {
    seal.replyToSender(ctx, msg, `绑定失败：${err.message || err}`);
  }
  return commandResult();
};

const cmdUserCardVerify = seal.ext.newCmdItemInfo();
cmdUserCardVerify.name = 'QQ绑定验证';
cmdUserCardVerify.help = '旧Bot不可用时，在官Bot侧选择角色卡名称：.QQ绑定验证 <验证码> <1-6>';
cmdUserCardVerify.solve = (ctx, msg, cmdArgs) => {
  const code = String(cmdArgs.getArgN(1) || '').trim();
  const choice = Number(cmdArgs.getArgN(2) || 0);
  const pending = /^\d{8}$/.test(code) ? loadPending(code) : null;
  const userId = currentUserId(ctx, msg);
  if (!pending || pending.kind !== 'user' || !Number.isInteger(Number(pending.quizAnswer))) {
    replyWithButtons(ctx, msg, '该验证码没有可用的角色卡验证，可能已过期或当前核心不支持。', [
      [{ label: '📊 查看绑定状态', command: '.QQ绑定 状态', enter: true, style: 0 }]
    ]);
    return commandResult();
  }
  if (!getOfficialQQIdentity(userId) || userId !== pending.officialId) {
    seal.replyToSender(ctx, msg, '必须由发起绑定的官Bot用户本人作答。');
    return commandResult();
  }
  if (!Number.isInteger(choice) || choice < 1 || choice > 6) {
    seal.replyToSender(ctx, msg, `选项格式不正确。用法：.QQ绑定验证 ${code} <1-6>`);
    return commandResult();
  }
  if (choice !== Number(pending.quizAnswer)) {
    consumePending(code, pending);
    ext.storageSet(cardRecoveryCooldownKey(userId), String(Date.now() + cardRecoveryCooldownMs()));
    replyWithButtons(ctx, msg, '角色卡验证未通过，本次验证码已失效。请在冷却结束后重新发起，或改用原QQ确认。', [
      [{ label: '📊 查看状态', command: '.QQ绑定 状态', enter: true, style: 0 }]
    ]);
    return commandResult();
  }
  try {
    writeBinding('user', pending.officialId, pending.legacyId, pending.requesterId);
    inheritCoreCharacterBinding(pending.targetGroupId, pending.officialId);
    consumePending(code, pending);
    ext.storageSet(cardRecoveryCooldownKey(userId), '');
    replyWithButtons(ctx, msg, pending.quizHasCards
      ? '角色卡验证通过，QQ身份绑定成功。'
      : '已确认该QQ没有历史角色卡，按新用户完成身份绑定。', [
      [{ label: '📊 查看绑定状态', command: '.QQ绑定 状态', enter: true, style: 1 }]
    ]);
  } catch (err) {
    seal.replyToSender(ctx, msg, `绑定失败：${err.message || err}`);
  }
  return commandResult();
};

const cmdGroupBind = seal.ext.newCmdItemInfo();
cmdGroupBind.name = 'QQ群绑定';
cmdGroupBind.help = `将官Bot群绑定到原QQ群，以继续使用原群插件数据。
官Bot群：.QQ群绑定 <原QQ群号>
原QQ群：.QQ群绑定确认 <验证码>
旧Bot不可用：.QQ群绑定验证 <验证码> <选项序号>
查看：.QQ群绑定 状态
解除：.QQ群绑定 解绑`;
cmdGroupBind.solve = (ctx, msg, cmdArgs) => {
  const op = String(cmdArgs.getArgN(1) || '状态').trim();
  const groupId = currentGroupId(ctx, msg);
  const userId = currentUserId(ctx, msg);
  const officialGroup = isOfficialGroupId(groupId);
  const legacyGroupId = normalizeLegacyGroupId(groupId);

  if (op === '帮助' || op.toLowerCase() === 'help') {
    replyWithButtons(ctx, msg, cmdGroupBind.help, [
      [
        { label: '📊 群绑定状态', command: '.QQ群绑定 状态', enter: true, style: 0 },
        { label: '🔗 发起群绑定', command: '.QQ群绑定 ', enter: false, style: 1 }
      ],
      [
        { label: '🔓 解除群绑定', command: '.QQ群绑定 解绑', enter: true, style: 0 }
      ]
    ]);
    return commandResult();
  }

  if (op === '状态' || op.toLowerCase() === 'status') {
    const bound = officialGroup ? readBinding('group', groupId) : readReverseBinding('group', legacyGroupId);
    replyWithButtons(ctx, msg, bound
      ? `当前群已绑定：${officialGroup ? bound : '官Bot群（OpenID已隐藏）'}`
      : '当前群尚未建立QQ群绑定。',
      officialGroup ? [
        bound ? [
          { label: '📊 刷新状态', command: '.QQ群绑定 状态', enter: true, style: 0 },
          { label: '🔓 解绑原群', command: '.QQ群绑定 解绑', enter: true, style: 0 }
        ] : [
          { label: '🔗 发起群绑定', command: '.QQ群绑定 ', enter: false, style: 1 }
        ]
      ] : []
    );
    return commandResult();
  }
  if (op === '解绑' || op.toLowerCase() === 'unbind') {
    const ownerId = officialGroup ? String(ext.storageGet(`binding:group-owner:${groupId}`) || '') : '';
    if (officialGroup && ownerId && ownerId !== userId && Number(ctx && ctx.privilegeLevel || 0) < 100) {
      seal.replyToSender(ctx, msg, '只有最初完成群绑定的官Bot用户或骰主可以在官Bot群解除绑定。');
      return commandResult();
    }
    if (!officialGroup && Number(ctx && ctx.privilegeLevel || 0) < 40) {
      seal.replyToSender(ctx, msg, '在原QQ群解除绑定需要群管理、群主或骰主权限。');
      return commandResult();
    }
    const removed = officialGroup
      ? removeBinding('group', groupId, '')
      : removeBinding('group', '', legacyGroupId);
    replyWithButtons(ctx, msg, removed ? 'QQ群绑定已解除。' : '当前群没有可解除的QQ群绑定。',
      officialGroup ? [
        [
          { label: '🔗 重新发起群绑定', command: '.QQ群绑定 ', enter: false, style: 1 }
        ]
      ] : []
    );
    return commandResult();
  }
  if (!officialGroup) {
    seal.replyToSender(ctx, msg, '请先在QQ官Bot群中使用 .QQ群绑定 <原QQ群号> 发起绑定。');
    return commandResult();
  }

  const target = normalizeLegacyGroupId(op);
  if (!target) {
    replyWithButtons(ctx, msg, 'QQ群号格式不正确。用法：.QQ群绑定 <原QQ群号>', [
      [
        { label: '🔗 发起群绑定', command: '.QQ群绑定 ', enter: false, style: 1 }
      ]
    ]);
    return commandResult();
  }
  if (readBinding('group', groupId) === target) {
    replyWithButtons(ctx, msg, `当前官Bot群已经绑定 ${target}。`, [
      [
        { label: '📊 查看状态', command: '.QQ群绑定 状态', enter: true, style: 0 },
        { label: '🔓 解绑原群', command: '.QQ群绑定 解绑', enter: true, style: 0 }
      ]
    ]);
    return commandResult();
  }
  const ownerId = String(ext.storageGet(`binding:group-owner:${groupId}`) || '');
  if (readBinding('group', groupId) && ownerId && ownerId !== userId && Number(ctx && ctx.privilegeLevel || 0) < 100) {
    seal.replyToSender(ctx, msg, '只有最初完成群绑定的官Bot用户或骰主可以更换该群绑定。');
    return commandResult();
  }
  if (readReverseBinding('group', target) && readReverseBinding('group', target) !== groupId) {
    seal.replyToSender(ctx, msg, '该QQ群已经绑定了另一个官Bot群。');
    return commandResult();
  }
  const cooldown = remainingGroupLogRecoveryCooldown(groupId);
  const quiz = cooldown > 0 ? null : buildGroupLogRecoveryQuiz(target);
  const pendingExtra = quiz && quiz.available
    ? { quizAnswer: quiz.answer, quizHasLogs: quiz.hasLogs }
    : {};
  const code = createPending('group', groupId, target, userId, pendingExtra);
  const lines = [
    `群绑定验证码：${code}`,
    `旧Bot可用时，请在10分钟内由原QQ群的管理、群主或骰主发送：.QQ群绑定确认 ${code}`
  ];
  let buttonRows = [];
  if (quiz && quiz.available) {
    lines.push('', renderGroupLogRecoveryQuiz(code, quiz));
    buttonRows = buildQuizKeyboardRows(code, quiz.options, '.QQ群绑定验证', '该群无可用Log', isButtonAutoEnter());
  } else if (cooldown > 0) {
    lines.push('', `群Log验证仍在冷却中，约 ${Math.ceil(cooldown / 60000)} 分钟后可重新发起。`);
    buttonRows = [
      [{ label: '📊 查看群绑定状态', command: '.QQ群绑定 状态', enter: true, style: 0 }]
    ];
  } else if (quiz && quiz.reason) {
    lines.push('', `群Log验证暂不可用：${quiz.reason}`);
    buttonRows = [
      [{ label: '📊 查看群绑定状态', command: '.QQ群绑定 状态', enter: true, style: 0 }]
    ];
  }
  replyWithButtons(ctx, msg, lines.join('\n'), buttonRows);
  return commandResult();
};

const cmdGroupConfirm = seal.ext.newCmdItemInfo();
cmdGroupConfirm.name = 'QQ群绑定确认';
cmdGroupConfirm.help = '在原QQ群确认官Bot群绑定：.QQ群绑定确认 <验证码>';
cmdGroupConfirm.solve = (ctx, msg, cmdArgs) => {
  const code = String(cmdArgs.getArgN(1) || '').trim();
  const pending = /^\d{8}$/.test(code) ? loadPending(code) : null;
  const legacyGroupId = normalizeLegacyGroupId(currentGroupId(ctx, msg));
  if (!pending || pending.kind !== 'group') {
    seal.replyToSender(ctx, msg, '验证码无效或已过期，请回到官Bot群重新发起绑定。');
    return commandResult();
  }
  if (!legacyGroupId || legacyGroupId !== pending.legacyId) {
    seal.replyToSender(ctx, msg, '必须在待绑定的原QQ群中确认。');
    return commandResult();
  }
  if (Number(ctx && ctx.privilegeLevel || 0) < 40) {
    seal.replyToSender(ctx, msg, '确认群绑定需要群管理、群主或骰主权限。');
    return commandResult();
  }
  try {
    writeBinding('group', pending.officialId, pending.legacyId, pending.requesterId);
    consumePending(code, pending);
    replyWithButtons(ctx, msg, 'QQ群绑定成功，官Bot群插件将继续使用原群的历史数据。', [
      [{ label: '📊 查看群绑定状态', command: '.QQ群绑定 状态', enter: true, style: 1 }]
    ]);
  } catch (err) {
    seal.replyToSender(ctx, msg, `绑定失败：${err.message || err}`);
  }
  return commandResult();
};

const cmdGroupLogVerify = seal.ext.newCmdItemInfo();
cmdGroupLogVerify.name = 'QQ群绑定验证';
cmdGroupLogVerify.help = '旧Bot不可用时，在发起绑定的官Bot群选择原群历史Log名称：.QQ群绑定验证 <验证码> <1-6>';
cmdGroupLogVerify.solve = (ctx, msg, cmdArgs) => {
  const code = String(cmdArgs.getArgN(1) || '').trim();
  const choice = Number(cmdArgs.getArgN(2) || 0);
  const pending = /^\d{8}$/.test(code) ? loadPending(code) : null;
  const groupId = currentGroupId(ctx, msg);
  const userId = currentUserId(ctx, msg);
  if (!pending || pending.kind !== 'group' || !Number.isInteger(Number(pending.quizAnswer))) {
    replyWithButtons(ctx, msg, '该验证码没有可用的群Log验证，可能已过期或当前核心不支持。', [
      [{ label: '📊 查看群绑定状态', command: '.QQ群绑定 状态', enter: true, style: 0 }]
    ]);
    return commandResult();
  }
  if (!isOfficialGroupId(groupId) || groupId !== pending.officialId) {
    seal.replyToSender(ctx, msg, '必须回到发起绑定的QQ官Bot群作答。');
    return commandResult();
  }
  if (!getOfficialQQIdentity(userId) || userId !== pending.requesterId) {
    seal.replyToSender(ctx, msg, '必须由发起群绑定的官Bot用户本人作答。');
    return commandResult();
  }
  if (!Number.isInteger(choice) || choice < 1 || choice > 6) {
    seal.replyToSender(ctx, msg, `选项格式不正确。用法：.QQ群绑定验证 ${code} <1-6>`);
    return commandResult();
  }
  if (choice !== Number(pending.quizAnswer)) {
    consumePending(code, pending);
    ext.storageSet(groupLogRecoveryCooldownKey(groupId), String(Date.now() + groupLogRecoveryCooldownMs()));
    replyWithButtons(ctx, msg, '群Log验证未通过，本次验证码已失效。请在冷却结束后重新发起，或改在原QQ群确认。', [
      [{ label: '📊 查看群状态', command: '.QQ群绑定 状态', enter: true, style: 0 }]
    ]);
    return commandResult();
  }
  try {
    writeBinding('group', pending.officialId, pending.legacyId, pending.requesterId);
    consumePending(code, pending);
    ext.storageSet(groupLogRecoveryCooldownKey(groupId), '');
    replyWithButtons(ctx, msg, pending.quizHasLogs
      ? '群Log验证通过，QQ群绑定成功。'
      : '已确认该群没有历史Log，按新群完成QQ群绑定。', [
      [{ label: '📊 查看群绑定状态', command: '.QQ群绑定 状态', enter: true, style: 1 }]
    ]);
  } catch (err) {
    seal.replyToSender(ctx, msg, `绑定失败：${err.message || err}`);
  }
  return commandResult();
};

ext.cmdMap['QQ绑定'] = cmdUserBind;
ext.cmdMap['qqbind'] = cmdUserBind;
ext.cmdMap['QQ绑定确认'] = cmdUserConfirm;
ext.cmdMap['qqbindconfirm'] = cmdUserConfirm;
ext.cmdMap['QQ绑定验证'] = cmdUserCardVerify;
ext.cmdMap['qqbindverify'] = cmdUserCardVerify;
ext.cmdMap['QQ群绑定'] = cmdGroupBind;
ext.cmdMap['qqgroupbind'] = cmdGroupBind;
ext.cmdMap['QQ群绑定确认'] = cmdGroupConfirm;
ext.cmdMap['qqgroupbindconfirm'] = cmdGroupConfirm;
ext.cmdMap['QQ群绑定验证'] = cmdGroupLogVerify;
ext.cmdMap['qqgroupbindverify'] = cmdGroupLogVerify;

globalThis.SealOfficialQQIdentityBridge = {
  version: VERSION,
  resolveUserId,
  resolveGroupId,
  getUserBindingStatus,
  isUserBound,
  requireUserBinding,
  getUserBinding: userId => readBinding('user', userId),
  getGroupBinding: groupId => readBinding('group', groupId),
  getAllBindings: () => loadBindingIndex(),
  buildCommandButton,
  buildKeyboardRows,
  buildQuizKeyboardRows,
  normalizeKeyboardRows,
  replyWithButtons
};

ext.onMessageReceived = (ctx, msg) => {
  restoreStoredBindingsForMessage(ctx, msg);
  migrateStoredCharacterBindingOnce(ctx, msg);
  try {
    syncNickname(ctx, msg);
  } catch (err) {
    console.error(`[${EXT_NAME}] 同步昵称失败: ${err}`);
  }
};

ext.onLoad = () => {
  loadBindingIndex().forEach(item => {
    if (!item || !item.officialId || !item.legacyId) return;
    try {
      registerCoreAlias(String(item.officialId), String(item.legacyId));
    } catch (err) {
      console.error(`[${EXT_NAME}] 恢复海豹原生身份映射失败: ${err}`);
    }
  });
  if (!seal.ext.find(AI_EXT_NAME)) {
    console.warn(`[${EXT_NAME}] 未找到AIPlugin扩展，收到消息后会继续尝试连接`);
  }
};
})();
