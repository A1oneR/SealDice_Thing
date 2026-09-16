// ==UserScript==
// @name         ra/sc GIF 动效 (防死锁与异步事件安全版)
// @author       Air
// @version      2.7.0
// @description  彻底消除 Goja 重入死锁（含私聊与群聊暗骰环境）、默认 URL 极速直传、支持 4 大风格与多骰拆解、支持私聊独立开关
// @timestamp    2026-09-15
// @license      MIT
// ==/UserScript==

(() => {
  const NAME = 'ra/sc GIF 动效';
  // 防重入零宽安全标记 (避免多插件并发死锁)
  const ANTI_REENTRY_FLAG = '\u200B';

  let ext = seal.ext.find(NAME);
  if (!ext) {
    ext = seal.ext.new(NAME, 'Air', '2.7.0');
    ext.autoActive = true;
    seal.ext.register(ext);
  } else {
    ext.autoActive = true;
    ext.version = '2.7.0';
  }

  seal.ext.registerStringConfig(ext, '后端地址', 'http://127.0.0.1:3892', '运行 ra_sc_gif_server.py 的地址');
  // ★ 恢复默认 URL 极速直传，避开多插件环境下的本地文件锁
  seal.ext.registerOptionConfig(ext, '发送方式', 'URL', ['URL', '本地文件', 'Base64'], '【URL】最稳定，避免 Goja 事件锁；本地单机且无复杂插件可试【本地文件】');
  seal.ext.registerStringConfig(ext, '技能默认名', '检定', '无法从原文案识别技能名时使用');
  seal.ext.registerIntConfig(ext, '请求超时秒数', 12, '范围 3-30');
  seal.ext.registerBoolConfig(ext, '失败时仍发送原文', true, '后端不可用时不丢失原有自定义文案');
  seal.ext.registerBoolConfig(ext, '错误时提示原因', true, '后端失败时在原文前附加简短诊断信息');
  seal.ext.registerBoolConfig(ext, '调试日志', true, '开启后在控制台打印真实耗时与路由路径');
  seal.ext.registerIntConfig(ext, '最大同时动画数', 4, '单次允许生成的最大动图数 (官方Bot上限为4张)，范围 1-4');
  seal.ext.registerIntConfig(ext, '最大动画骰子数', 8, '单次 .r 最多生成的动画骰子数，范围 1-20');
  seal.ext.registerIntConfig(ext, '文案延迟秒数', 8, '动画播放完前段后等待多久再发送文案');
  seal.ext.registerBoolConfig(ext, '支持私聊', true, '是否在私聊中启用 GIF 动效（关闭后私聊将直接使用原生文案，不生成动图）');

  const COMMANDS = ['ra', 'sc', 'rc', 'cra', 'crc', 'coc7:ra', 'coc7:sc', 'coc7', 'r', 'rd', 'roll', 'rx'];
  let activeAnimations = 0;
  const taskEpochs = {};

  function debug(msg) {
    if (seal.ext.getBoolConfig(ext, '调试日志')) console.log('[' + NAME + '] ' + msg);
  }
  function mark(stage, detail) {
    try { ext.storageSet('last_' + stage, String(new Date().getTime()) + ' ' + String(detail || '').slice(0, 220)); } catch (_) {}
  }

  function isPrivateChat(ctx, msg) {
    if (ctx && ctx.isPrivate) return true;
    if (msg) {
      if (msg.messageType === 'private' || msg.messageType === 'direct') return true;
      if (msg.groupId === '' && msg.sender && msg.sender.userId) return true;
    }
    return false;
  }

  function scopeKey(ctx, msg) {
    if (ctx && ctx.group && ctx.group.groupId) return 'group:' + String(ctx.group.groupId);
    if (msg && msg.groupId) return 'group:' + String(msg.groupId);
    const userId = ctx && ctx.player && ctx.player.userId ? ctx.player.userId : (msg && msg.sender && msg.sender.userId ? msg.sender.userId : 'unknown');
    return 'private:' + String(userId);
  }
  function isEnabled(ctx, msg) {
    if (isPrivateChat(ctx, msg) && !seal.ext.getBoolConfig(ext, '支持私聊')) {
      return false;
    }
    return ext.storageGet('enabled_' + scopeKey(ctx, msg)) === '1';
  }
  function taskKey(ctx, msg) { return scopeKey(ctx, msg); }
  function beginTask(ctx, msg) {
    const key = taskKey(ctx, msg);
    // 仅记录当前取消代次；新任务不应取消同一会话中已经在生成的其他动效。
    // 真正需要终止时由 cancelTasks 递增代次。
    const epoch = taskEpochs[key] || 0;
    taskEpochs[key] = epoch;
    return { key: key, epoch: epoch };
  }
  function cancelTasks(ctx, msg) {
    const key = taskKey(ctx, msg);
    taskEpochs[key] = (taskEpochs[key] || 0) + 1;
  }
  function taskActive(task) { return !!task && taskEpochs[task.key] === task.epoch; }
  function deferReply(ctx, msg, text, isSecret, task) {
    setTimeout(() => {
      if (task && !taskActive(task)) return;
      safeAsyncReply(ctx, msg, text, isSecret);
    }, 0);
  }

  // 海豹处理“.ext <扩展> off”前会先广播 OnMessageReceived；在这里
  // 取消本会话尚未完成的渲染任务，避免扩展关闭后仍排队发送 CQ 码并阻塞事件循环。
  function isOwnExtensionDisableMessage(msg) {
    const source = String(msg && msg.message || '')
      .replace(/^\s*[.。!！/\\]+\s*/, '').trim().toLowerCase();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length < 3 || parts[0] !== 'ext') return false;
    const action = parts[parts.length - 1];
    if (action !== 'off' && action !== '关闭' && action !== '关' && action !== '0') return false;
    const target = parts.slice(1, -1).join(' ');
    return target === 'ra_sc_gif' || target === 'ra/sc gif 动效' ||
      target === 'ra/sc' || target === 'ra/sc gif' || target === 'ra动效' ||
      target === 'sc动效' || target === '检定动效';
  }

  ext.onMessageReceived = (ctx, msg) => {
    if (isOwnExtensionDisableMessage(msg)) cancelTasks(ctx, msg);
  };
  function getStyle(ctx, msg) {
    const value = String(ext.storageGet('style_' + scopeKey(ctx, msg)) || 'card').toLowerCase();
    return ['card', 'dice', 'roulette', 'slot'].indexOf(value) >= 0 ? value : 'card';
  }
  function styleLabel(style) {
    return style === 'card' ? '🃏 灵魂抽牌' : style === 'roulette' ? '🎡 命运表盘' : style === 'slot' ? '🎰 赛博老虎机' : '🎲 晶体骰子';
  }
  function parseStyle(value) {
    const v = String(value || '').toLowerCase();
    if (['card', '抽牌', '卡牌', '牌', 'c'].indexOf(v) >= 0) return 'card';
    if (['dice', '骰子', '晶体骰子', 'd'].indexOf(v) >= 0) return 'dice';
    if (['roulette', '轮盘', '表盘', '命运表盘', 'r'].indexOf(v) >= 0) return 'roulette';
    if (['slot', '老虎机', '多轴老虎机', 's'].indexOf(v) >= 0) return 'slot';
    return '';
  }

  const toggleCmd = seal.ext.newCmdItemInfo();
  toggleCmd.name = 'ra动效';
  toggleCmd.help = 'ra/sc GIF 动效设置\n.ra动效 开启/关闭\n.ra动效 风格 抽牌/骰子/表盘/老虎机';
  toggleCmd.solve = (ctx, msg, cmdArgs) => {
    const ret = seal.ext.newCmdExecuteResult(true);
    const action = String(cmdArgs.getArgN(1) || '状态').toLowerCase();
    const key = 'enabled_' + scopeKey(ctx, msg);

    if (action === '风格' || action === 'style' || action === '样式') {
      const style = parseStyle(cmdArgs.getArgN(2));
      if (!style) {
        seal.replyToSender(ctx, msg, '当前风格：' + styleLabel(getStyle(ctx, msg)) + '\n可选风格：\n· .ra动效 风格 抽牌 (🃏 命运抽牌)\n· .ra动效 风格 骰子 (🎲 晶体骰子)\n· .ra动效 风格 表盘 (🎡 命运表盘)\n· .ra动效 风格 老虎 (🎰 赛博老虎机)');
        return ret;
      }
      ext.storageSet('style_' + scopeKey(ctx, msg), style);
      seal.replyToSender(ctx, msg, '已切换动效风格为：' + styleLabel(style));
    } else if (action === '开启' || action === '开' || action === 'on' || action === '1') {
      if (isPrivateChat(ctx, msg) && !seal.ext.getBoolConfig(ext, '支持私聊')) {
        seal.replyToSender(ctx, msg, '当前全局配置已禁用私聊动效，请在扩展配置中开启【支持私聊】后再开启本会话。');
        return ret;
      }
      ext.storageSet(key, '1');
      seal.replyToSender(ctx, msg, '已开启本会话的极速 GIF 动效。');
    } else if (action === '关闭' || action === '关' || action === 'off' || action === '0') {
      ext.storageSet(key, '0');
      cancelTasks(ctx, msg);
      seal.replyToSender(ctx, msg, '已关闭本会话的 GIF 动效。');
    } else {
      const privateNotice = (isPrivateChat(ctx, msg) && !seal.ext.getBoolConfig(ext, '支持私聊')) ? '（全局配置：私聊已禁用）' : '';
      seal.replyToSender(ctx, msg, '当前动效状态：' + (isEnabled(ctx, msg) ? '开启' : '关闭') + privateNotice + '；风格：' + styleLabel(getStyle(ctx, msg)));
    }
    return ret;
  };
  ['ra动效', 'sc动效', '检定动效', 'ra_sc_gif'].forEach(name => { ext.cmdMap[name] = toggleCmd; });

  const baseUrl = () => String(seal.ext.getStringConfig(ext, '后端地址') || '').replace(/\/+$/, '');
  const timeout = () => Math.max(3, Math.min(30, parseInt(seal.ext.getIntConfig(ext, '请求超时秒数'), 10) || 12)) * 1000;
  const isCommand = (cmd, target) => {
    const v = String(cmd || '').toLowerCase().trim();
    return v === target || v.endsWith(':' + target) || v.endsWith('/' + target);
  };

  function calcCocRank(result, target) {
    if (result === 1) return '大成功';
    if (result === 100 || (target < 50 && result >= 96)) return '大失败';
    if (result <= Math.floor(target / 5)) return '极难成功';
    if (result <= Math.floor(target / 2)) return '困难成功';
    if (result <= target) return '普通成功';
    return '失败';
  }

  function isSecretRollMessage(ctx, msg, source, command) {
    // 私聊环境下，谁发的回给谁直接走 replyToSenderBypassIntercept（发给个人且绕过拦截），绝非群聊暗骰
    if (isPrivateChat(ctx, msg)) {
      return false;
    }
    const cmd = String(command || '').toLowerCase().trim();
    const secretCmds = ['rah', 'rch', 'crch', 'crah', 'rh', 'rhd', 'rdh', 'rxh', 'rhx'];
    if (secretCmds.some(c => cmd === c || cmd.endsWith(':' + c) || cmd.endsWith('/' + c))) {
      return true;
    }
    if (source.includes('暗中检定') || source.includes('暗骰') || source.includes('来自群') || source.startsWith('来自群')) {
      return true;
    }
    return false;
  }

  // ★ 核心改造：异步非阻塞安全发送 (杜绝 Goja 事件循环死锁)
  function safeAsyncReply(ctx, msg, textToSend, isSecret) {
    try {
      if (isSecret) {
        // 群聊暗骰：必须且只能使用具备绕过拦截的私聊回复
        if (typeof seal.replyPersonBypassIntercept === 'function') {
          seal.replyPersonBypassIntercept(ctx, msg, textToSend);
          return;
        }
        // 核心若无 replyPersonBypassIntercept，绝不能调用普通的 seal.replyPerson，
        // 否则会在 Goja 事件循环中调用非绕过方法导致事件循环重入自死锁。
        debug('群聊暗骰因核心缺少 replyPersonBypassIntercept 已安全阻断发送，杜绝死锁');
        return;
      }
      if (typeof seal.replyToSenderBypassIntercept === 'function') {
        seal.replyToSenderBypassIntercept(ctx, msg, textToSend);
        return;
      }
      // 缺少绕过 API 时绝不调用普通的 seal.replyToSender 避免死锁
      debug('缺少 replyToSenderBypassIntercept，安全降级终止发送以防死锁');
    } catch (err) {
      debug('发送异常: ' + String(err));
    }
  }

  function parseRolls(text, command, rawArgs, ctx, msg) {
    const source = String(text || '');
    const lines = source.split(/\r?\n/);
    const rolls = [];

    let baseSkill = '';
    const quoted = source.match(/[「“\"]([^」”\"]{1,40})[」”\"]/);
    if (quoted) baseSkill = quoted[1];
    if (!baseSkill && isCommand(command, 'sc')) baseSkill = 'San 检定';
    if (!baseSkill) {
      const arg = String(rawArgs || '').replace(/^\d+#/, '').replace(/^(?:b|p)\d*\s*/i, '').trim();
      baseSkill = arg.split(/\s+/)[0] || seal.ext.getStringConfig(ext, '技能默认名') || '检定';
    }

    const globalStyle = getStyle(ctx, msg);
    const isMultiCheckText = source.includes('次检定') || source.includes('次投骰') || lines.length > 2;

    // 1. 逐行匹配 CoC / DND 技能检定
    lines.forEach((line, lineIdx) => {
      const checkMatch = line.match(/(?:[bp]\d*|D100|d100|D20|d20)?\s*[=:]\s*(\d+)\s*\/\s*(\d+)/i);
      if (checkMatch) {
        const result = Number(checkMatch[1]);
        const target = Number(checkMatch[2]);
        const sides = (line.match(/D20\s*[=:]/i) || line.match(/\/\s*20(?:[^\d]|$)/)) ? 20 : 100;

        let rankText = '';
        const currentLineRank = (line.match(/【([^】]+)】/) || [])[1] || 
                                (line.match(/(大成功|大失败|极难成功|困难成功|普通成功|成功|失败|天然\s*20|天然\s*1)/) || [])[1];
        if (currentLineRank) rankText = currentLineRank;

        if (!rankText && lineIdx + 1 < lines.length) {
          const nextLine = lines[lineIdx + 1];
          const nextLineRank = (nextLine.match(/【([^】]+)】/) || [])[1] || 
                               (nextLine.match(/(大成功|大失败|极难成功|困难成功|普通成功|成功|失败|天然\s*20|天然\s*1)/) || [])[1];
          if (nextLineRank) rankText = nextLineRank;
        }

        if (!rankText && !isMultiCheckText) {
          const globalRank = (source.match(/【([^】]+)】/) || [])[1] || 
                             (source.match(/(大成功|大失败|极难成功|困难成功|普通成功|成功|失败|天然\s*20|天然\s*1)/) || [])[1];
          if (globalRank) rankText = globalRank;
        }

        if (!rankText) {
          rankText = (sides === 20) ? (result >= target ? '成功' : '失败') : calcCocRank(result, target);
        }

        const bp = (String(rawArgs || '').match(/(?:^|\s)([bp]\d*)\b/i) || line.match(/([bp]\d*)\s*=/i) || [])[1] || '';

        // 提取多重奖惩骰 (如 "[D100=5,奖励5 7]")
        let diceBreakdown = [];
        const cocBpDetail = line.match(/\[\s*D100\s*=\s*(\d+)\s*,\s*([^\]]+)\]/i);

        if (cocBpDetail) {
          const baseD100 = parseInt(cocBpDetail[1]);
          const bpListStr = cocBpDetail[2];

          const units = (baseD100 === 100) ? 0 : (baseD100 % 10);
          const baseTens = (baseD100 === 100) ? 0 : Math.floor(baseD100 / 10) * 10;
          const finalTens = (result === 100) ? 0 : Math.floor(result / 10) * 10;

          const isBonus = bpListStr.includes('奖励') || bpListStr.includes('bonus') || bpListStr.includes('b');
          const bpTypeStr = isBonus ? '奖励' : '惩罚';
          const bpNums = [...bpListStr.matchAll(/\b(\d+)\b/g)].map(m => parseInt(m[1]));

          const isBaseChosen = (baseTens === finalTens);
          diceBreakdown.push({
            type: 'd10',
            label: '主十位',
            value: baseTens,
            display: (baseTens === 0 && units === 0) ? '00' : (baseTens < 10 ? '00' : String(baseTens)),
            isTens: true,
            isChosen: isBaseChosen,
            isDiscarded: !isBaseChosen
          });

          let chosenAssigned = isBaseChosen;
          bpNums.forEach((bpNum, bIdx) => {
            const bpTens = bpNum * 10;
            const isThisChosen = (!chosenAssigned && bpTens === finalTens);
            if (isThisChosen) chosenAssigned = true;

            diceBreakdown.push({
              type: 'd10',
              label: `${bpTypeStr}#${bIdx + 1}`,
              value: bpTens,
              display: (bpTens === 0) ? '00' : String(bpTens),
              isTens: true,
              isChosen: isThisChosen,
              isDiscarded: !isThisChosen
            });
          });

          diceBreakdown.push({
            type: 'd10',
            label: '个位',
            value: units,
            display: String(units),
            isTens: false,
            isChosen: true,
            isDiscarded: false
          });
        }

        rolls.push({
          mode: isCommand(command, 'sc') ? 'sc' : sides === 20 ? 'dnd' : 'coc',
          skill: isMultiCheckText ? `${baseSkill} #${rolls.length + 1}` : baseSkill,
          result: result,
          target: target,
          bp: bp,
          rank_text: rankText,
          dice_breakdown: diceBreakdown.length > 0 ? diceBreakdown : null,
          style: globalStyle
        });
      }
    });

    if (rolls.length > 0) {
      return rolls;
    }

    // 2. 自由投骰指令解析 (如 .rd10+d8+2d6+d2 以及 .r 4d6=18[4d6=4+3+6+5]=18)
    if (['r', 'rd', 'roll', 'rh', 'rhd', 'rdh', 'rx', 'rxh', 'rhx'].some(c => isCommand(command, c))) {
      lines.forEach((line) => {
        const totalMatches = [...line.matchAll(/=\s*(-?\d+)(?:[^\d\[]|$)/g)];
        if (totalMatches.length === 0) return;

        const result = Number(totalMatches[totalMatches.length - 1][1]);

        let expr = '';
        const exprMatch = line.match(/([0-9]*[dD][0-9]+(?:\s*[\+\-]\s*(?:[0-9]*[dD]?[0-9]+))*)\s*=/i);
        if (exprMatch) {
          expr = exprMatch[1].replace(/\s+/g, '');
        } else {
          let raw = String(rawArgs || '').replace(/^\d+#/, '').trim().split(/\s+/)[0];
          if (isCommand(command, 'rd') && /^\d/.test(raw)) raw = 'd' + raw;
          expr = raw || '1D100';
        }

        let diceBreakdown = [];

        // Token 级流式扫描器 (支持 1[d10] + 2[d8] + 11[2d6=5+6] + 1[d2])
        const bracketTokenRe = /(-?\d+)?\s*\[\s*([^\]]+)\s*\]/g;
        const bracketTokens = [...line.matchAll(bracketTokenRe)];

        if (bracketTokens.length > 0) {
          bracketTokens.forEach((tk) => {
            const leadingVal = tk[1];
            const inside = tk[2].trim();

            if (inside.includes('+')) {
              let typeMatch = inside.match(/[dD](\d+)/i);
              let fallbackType = typeMatch ? `d${typeMatch[1]}` : 'd6';

              const addPart = inside.includes('=') ? inside.split('=')[1] : inside;
              const subNums = addPart.split('+').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

              subNums.forEach((val) => {
                diceBreakdown.push({
                  type: fallbackType,
                  label: `${fallbackType.toUpperCase()}#${diceBreakdown.length + 1}`,
                  value: val
                });
              });
            } else {
              let typeMatch = inside.match(/[dD](\d+)/i);
              if (typeMatch) {
                const sides = typeMatch[1];
                const stype = `d${sides}`;
                const val = leadingVal ? parseInt(leadingVal) : 1;
                diceBreakdown.push({
                  type: stype,
                  label: `${stype.toUpperCase()}#${diceBreakdown.length + 1}`,
                  value: val
                });
              }
            }
          });
        }

        if (diceBreakdown.length === 0) {
          const bracketMatch = line.match(/\(([\d\s\+]+)\)/);
          if (bracketMatch) {
            const parts = bracketMatch[1].split('+');
            parts.forEach((p) => {
              const v = parseInt(p.trim());
              if (!isNaN(v)) diceBreakdown.push({ type: 'd6', label: `D#${diceBreakdown.length + 1}`, value: v });
            });
          }
        }

        let diceCount = diceBreakdown.length;
        if (diceCount === 0) {
          const diceMatches = expr.match(/(\d*)[dD](\d+)/g) || [];
          diceMatches.forEach(dm => {
            const cnt = parseInt(dm.match(/(\d*)[dD]/)[1] || '1');
            diceCount += cnt;
          });
        }

        rolls.push({
          mode: 'multi',
          skill: isMultiCheckText ? `${expr.toUpperCase()} #${rolls.length + 1}` : expr.toUpperCase(),
          expression: expr.toUpperCase(),
          result: result,
          dice_count: Math.max(1, diceCount || 1),
          dice_breakdown: diceBreakdown.length > 0 ? diceBreakdown : null,
          rank_text: `点数: ${result}`,
          style: globalStyle
        });
      });
    }

    return rolls.length > 0 ? rolls : null;
  }

  function withTimeout(promise) {
    return new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => {
        if (!done) { done = true; reject(new Error('GIF 渲染超时')); }
      }, timeout());
      promise.then(v => { if (!done) { done = true; clearTimeout(t); resolve(v); } }, e => { if (!done) { done = true; clearTimeout(t); reject(e); } });
    });
  }

  async function sendAnimations(ctx, msg, original, rolls, isSecret, task) {
    const MAX_BOT_IMAGES = 4;
    const rollsToSend = rolls.slice(0, MAX_BOT_IMAGES);

    const maxConcurrent = Math.max(1, Math.min(10, parseInt(seal.ext.getIntConfig(ext, '最大同时动画数'), 10) || 4));
    if (activeAnimations + rollsToSend.length > maxConcurrent + 2) {
      deferReply(ctx, msg, original + ANTI_REENTRY_FLAG, isSecret, task);
      return;
    }

    activeAnimations += rollsToSend.length;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeAnimations = Math.max(0, activeAnimations - rollsToSend.length);
      }
    };

    const tStart = Date.now();
    try {
      debug(`🚀 启动动效生成: 共 ${rolls.length} 个任务 | 目标通道: ${isSecret ? '🔒 私聊' : '📢 群聊'}`);

      const renderPromises = rollsToSend.map(roll => {
        return withTimeout(fetch(baseUrl() + '/api/roll-gif', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(roll)
        })).then(r => r.json());
      });

      const results = await Promise.all(renderPromises);
      if (!taskActive(task)) { release(); return; }
      const configuredMode = seal.ext.getOptionConfig(ext, '发送方式') || 'URL';
      
      const imageTags = [];
      let maxPreludeSeconds = 2.3;

      results.forEach((data) => {
        if (data && data.ok) {
          if (configuredMode === '本地文件' && (data.relative_path || data.file_path)) {
            imageTags.push(`[CQ:image,file=${data.relative_path || data.file_path}]`);
          } else if (configuredMode === 'URL') {
            imageTags.push(`[CQ:image,file=${data.url},cache=0]`);
          } else {
            imageTags.push(`[CQ:image,file=base64://${data.data},cache=0]`);
          }
          if (data.preludeSeconds) {
            maxPreludeSeconds = Math.max(maxPreludeSeconds, Number(data.preludeSeconds));
          }
        }
      });

      if (imageTags.length === 0) {
        throw new Error('所有动图均生成失败');
      }

      // 1. 发送动图 (CQ码并排连发，带零宽标记防重入)
      const combinedImageMsg = imageTags.join('') + ANTI_REENTRY_FLAG;
      // 让当前 onMessageSendIntercept 回调先返回，再进入海豹发送链，避免老群 JS 扩展重入死锁。
      deferReply(ctx, msg, combinedImageMsg, isSecret, task);

      const tFetch = Date.now() - tStart;
      debug(`🎉 [出图成功] 并发完成 ${imageTags.length} 张动图 | 耗时: ${tFetch}ms`);

      // 2. 延迟发送完整原文案 (注入零宽标记防重入死锁)
      const preludeDelay = Math.ceil(maxPreludeSeconds * 1000);
      const configuredDelay = Math.max(1, parseInt(seal.ext.getIntConfig(ext, '文案延迟秒数'), 10) || 3) * 1000;
      const delay = Math.max(configuredDelay, preludeDelay);

      setTimeout(() => {
        try {
          deferReply(ctx, msg, original + ANTI_REENTRY_FLAG, isSecret, task);
        } finally {
          release();
        }
      }, delay);

    } catch (e) {
      debug('后端渲染失败: ' + String(e.message || e));
      if (seal.ext.getBoolConfig(ext, '失败时仍发送原文')) {
        const reason = seal.ext.getBoolConfig(ext, '错误时提示原因') ? `[GIF未发送: ${String(e.message || e).slice(0, 100)}]\n` : '';
        deferReply(ctx, msg, reason + original + ANTI_REENTRY_FLAG, isSecret, task);
      }
      release();
    }
  }

  ext.messageInterceptCommands = COMMANDS;
  ext.onMessageSendIntercept = (ctx, msg, text, flag, command, rawArgs) => {
    // ★ 零宽标记防死锁：若文案包含 ANTI_REENTRY_FLAG 说明是自身延迟发出的消息，0ms 直接放行
    if (String(text || '').includes(ANTI_REENTRY_FLAG)) {
      return false;
    }
    // 缺少必要绕过 API 时直接放行，避免拦截后无法安全异步发送而死锁
    if (typeof seal.replyToSenderBypassIntercept !== 'function') {
      return false;
    }
    if (!isEnabled(ctx, msg)) return false;

    const isSecret = isSecretRollMessage(ctx, msg, String(text || ''), command);
    // 群聊暗骰在缺少 replyPersonBypassIntercept 时直接放行，防止在群内走光或死锁
    if (isSecret && typeof seal.replyPersonBypassIntercept !== 'function') {
      return false;
    }

    const rolls = parseRolls(text, command, rawArgs, ctx, msg);
    if (!rolls || rolls.length === 0) return false;

    const task = beginTask(ctx, msg);
    sendAnimations(ctx, msg, String(text), rolls, isSecret, task);
    return true;
  };
})();
