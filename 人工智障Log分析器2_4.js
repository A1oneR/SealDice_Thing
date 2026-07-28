// ==UserScript==
// @name         人工智障Log分析器
// @author       Air, Gemini 3.0 Pro
// @version      1.4
// @description  分析跑团Log日志，兼容赵/星骰，溯洄。用法：.logai <链接>
// @timestamp    1766873593
// @license      Apache-2.0
// @homepageURL  https://github.com/A1oneR/SealDice_Thing
// ==/UserScript==

let ext = seal.ext.find('log-analyzer');
if (!ext) {
  ext = seal.ext.new('log-analyzer', 'Air', '1.4');
  seal.ext.register(ext);
}

const cmdLogAi = seal.ext.newCmdItemInfo();
cmdLogAi.name = 'logai';
cmdLogAi.help = 'AI跑团日志评分。\n支持以下格式：\n1. 海豹: .logai https://log.weizaima.com/?key=abcd#123456\n2. 赵/星骰: .logai https://logpainter.trpgbot.com/#1-abc123\n3. 溯洄: .logai https://logpainter.kokona.tech/?s3=ABCD123_456789';

// 辅助函数：等待
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

cmdLogAi.solve = async (ctx, msg, cmdArgs) => {
  let val = cmdArgs.getArgN(1);
  if (!val || val === 'help') {
    const ret = seal.ext.newCmdExecuteResult(true);
    ret.showHelp = true;
    return ret;
  }

  const urlMatch = val.match(/https?:\/\/[^\s\]"']+/);
  if (urlMatch) val = urlMatch[0];

  let logKey = '';
  let logPwd = '';
  let sourceType = '';

  // 智能解析
  if (val.includes('s3=')) {
      const m = val.match(/[?&]s3=([^&#]+)/);
      if (m) { logKey = m[1]; sourceType = 'kokona'; }
  } else if (val.includes('key=')) {
      const k = val.match(/[?&]key=([^&#]+)/);
      if (k) { logKey = k[1]; sourceType = 'weizaima'; }
      const p = val.match(/#([^?&\s]+)/);
      if (p) logPwd = p[1];
  } else if (val.includes('#')) {
      const parts = val.split('#');
      if (parts.length > 1) {
          logKey = parts[parts.length - 1].replace(/[^a-zA-Z0-9-_]/g, '');
          if (logKey.includes('-')) sourceType = 'trpgbot';
      }
  } else {
      if (cmdArgs.args.length >= 1) {
          logKey = cmdArgs.args[0];
          if (logKey.includes('-') && /^\d/.test(logKey)) sourceType = 'trpgbot';
          else if (logKey.includes('_') || logKey.length > 20) sourceType = 'kokona';
          else sourceType = 'weizaima';
          if (sourceType === 'weizaima' && cmdArgs.args.length >= 2) logPwd = cmdArgs.args[1];
      }
  }

  if (!logKey) {
    seal.replyToSender(ctx, msg, '❌ 无法解析链接。');
    return seal.ext.newCmdExecuteResult(true);
  }

  // 1. 提交任务
  seal.replyToSender(ctx, msg, `已提交请求，AI 正在阅读日志 (这可能需要 30-60 秒，请稍候)...`);
  
  let apiUrl = `http://127.0.0.1:8000/api/submit?key=${logKey}`;
  if (logPwd) apiUrl += `&password=${logPwd}`;
  if (sourceType) apiUrl += `&source=${sourceType}`;

  try {
      let resp = await fetch(apiUrl);
      let data = await resp.json();
      
      if (data.status !== 'ok') {
          seal.replyToSender(ctx, msg, `❌ 提交失败：${JSON.stringify(data)}`);
          return seal.ext.newCmdExecuteResult(true);
      }

      let jobId = data.id;
      let checkUrl = `http://127.0.0.1:8000/api/status?id=${jobId}`;
      let resultUrl = `http://127.0.0.1:8000/api/result?id=${jobId}`;

      // 2. 轮询状态 (最多等待 120秒)
      let maxRetries = 60; 
      while (maxRetries > 0) {
          await sleep(2000); // 等待2秒
          
          let sResp = await fetch(checkUrl);
          let sData = await sResp.json();
          
          if (sData.status === 'done' || sData.status === 'error') {
              // 任务结束，发送图片（无论是成功图还是报错图）
              // 加个时间戳防止缓存
              let finalUrl = `${resultUrl}&t=${new Date().getTime()}`;
              seal.replyToSender(ctx, msg, `[CQ:image,file=${finalUrl},cache=0]`);
              return seal.ext.newCmdExecuteResult(true);
          }
          
          maxRetries--;
      }
      
      seal.replyToSender(ctx, msg, `⚠️ 分析超时。后端可能仍在处理，但时间过长。`);

  } catch (e) {
      console.error(e);
      seal.replyToSender(ctx, msg, `❌ 脚本错误：${e.message}`);
  }

  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['logai'] = cmdLogAi;
ext.cmdMap['评分'] = cmdLogAi;