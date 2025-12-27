// ==UserScript==
// @name         人工智障Log分析器
// @author       Air, Gemini 3.0 Pro
// @version      1.0.0
// @description  分析跑团Log日志（支持带密码的链接）。用法：.logai <链接>
// @timestamp    1766873593
// @license      Apache-2.0
// @homepageURL  https://github.com/A1oneR/SealDice_Thing
// ==/UserScript==

let ext = seal.ext.find('log-analyzer');
if (!ext) {
  ext = seal.ext.new('log-analyzer', 'Air', '1.0.0');
  seal.ext.register(ext);
}

const cmdLogAi = seal.ext.newCmdItemInfo();
cmdLogAi.name = 'logai';
cmdLogAi.help = '海豹AI跑团日志评分。\n用法：.logai https://log.weizaima.com/?key=xxxx#123456';

cmdLogAi.solve = (ctx, msg, cmdArgs) => {
  let val = cmdArgs.getArgN(1);

  if (!val || val === 'help') {
    const ret = seal.ext.newCmdExecuteResult(true);
    ret.showHelp = true;
    return ret;
  }

  // 处理可能的 CQ 码（如果用户发的是卡片分享，提取 URL）
  // 简单处理：提取文本中的 http... 部分
  const urlMatch = val.match(/https?:\/\/[^\s\]]+/);
  if (urlMatch) {
      val = urlMatch[0];
  }

  // 1. 解析 Key 和 Password
  // 格式通常是: ...?key=abcde...#123456
  let logKey = '';
  let logPwd = '';

  try {
      // 提取 Key
      const keyMatch = val.match(/[?&]key=([^&#]+)/);
      if (keyMatch && keyMatch[1]) {
          logKey = keyMatch[1];
      }

      // 提取 Password (Hash 部分)
      // 匹配 # 后面紧跟的数字或字符
      const hashMatch = val.match(/#([^?&\s]+)/);
      if (hashMatch && hashMatch[1]) {
          logPwd = hashMatch[1];
      }
  } catch (e) {
      console.error(e);
  }

  // 容错：如果没解析出 URL，但用户发了 "abcd 123456" 这种格式
  if (!logKey) {
      if (cmdArgs.args.length >= 1 && !val.includes('http')) {
          logKey = cmdArgs.args[0];
          if (cmdArgs.args.length >= 2) {
              logPwd = cmdArgs.args[1];
          }
      }
  }

  if (!logKey) {
    seal.replyToSender(ctx, msg, '❌ 无法解析链接。请发送完整链接，例如：\n.logai https://log.weizaima.com/?key=abcd#123456');
    return seal.ext.newCmdExecuteResult(true);
  }

  // 2. 反馈给用户
  seal.replyToSender(ctx, msg, `🤖 正在提取日志 (Key: ${logKey}, Pwd: ${logPwd ? '***' : '无'}) 并进行 AI 运算，请耐心等待...`);

  // 3. 构建请求 URL
  const timestamp = new Date().getTime();
  let backendUrl = `http://127.0.0.1:8000/analyze?key=${logKey}&t=${timestamp}`;
  if (logPwd) {
      backendUrl += `&password=${logPwd}`;
  }

  // 4. 发送图片
  seal.replyToSender(ctx, msg, `[CQ:image,file=${backendUrl},cache=0]`);
    
  return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['logai'] = cmdLogAi;
ext.cmdMap['评分'] = cmdLogAi;