// ==UserScript==
// @name         刮刮乐彩票
// @author       Claude
// @version      1.0.0
// @description  刮刮乐彩票游戏，支持获取彩票、刮开号码、查看记录等功能
// @timestamp    1708510619
// 2024-02-21
// @license      Apache-2
// @homepageURL  https://github.com/sealdice/javascript
// ==/UserScript==

// 创建扩展模块
let ext = seal.ext.find('scratch_lottery');
if (!ext) {
  ext = seal.ext.new('scratch_lottery', 'Claude', '1.0.0');
  seal.ext.register(ext);
}

// 奖项设置
const PRIZES = [
    {amount: 250000, weight: 50},
    {amount: 100000, weight: 50},
    {amount: 50000, weight: 50},
    {amount: 25000, weight: 50},
    {amount: 10000, weight: 50},
    {amount: 5000, weight: 50},
    {amount: 1000, weight: 300},
    {amount: 500, weight: 300},
    {amount: 100, weight: 600},
    {amount: 50, weight: 1000},
    {amount: 25, weight: 1000},
    {amount: 10, weight: 2000}
  ];

// 获取随机数字
function getRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 生成彩票内容
function generateLottery() {
    const luckyNumber = getRandomNumber(1, 99);
    const numbers = {};
    const usedNumbers = new Set();
  
    for (let i = 0; i < 12; i++) {
      const position = i < 9 ? (i + 1).toString() : String.fromCharCode(65 + i - 9);
      let num;
      do {
        num = getRandomNumber(1, 99);
      } while (usedNumbers.has(num));
      usedNumbers.add(num);
      numbers[position] = {
        number: num,
        prize: getWeightedRandomPrize()
      };
    }
  
    return {
      luckyNumber,
      numbers,
      scratched: [],
      completed: false
    };
  }

// 根据权重获取随机奖项
function getWeightedRandomPrize() {
    const totalWeight = PRIZES.reduce((sum, prize) => sum + prize.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const prize of PRIZES) {
      if (random < prize.weight) {
        return prize.amount;
      }
      random -= prize.weight;
    }
    
    return PRIZES[PRIZES.length - 1].amount; // 保底返回最小奖项
  }

// 辅助函数：打乱数组
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

// 格式化彩票显示
function formatLottery(lottery) {
    const lines = [
      '┍┄┄┄┄┄┄┄┄┄┑',
      `┆  幸运数字  ${lottery.luckyNumber.toString().padStart(2, '0')}     ┆`
    ];
  
    for (const [pos, data] of Object.entries(lottery.numbers)) {
      const display = lottery.scratched.includes(pos) 
        ? `${data.number.toString().padStart(2, '0')} ¥${data.prize}` 
        : '未刮开';
      lines.push(`┆ 号码${pos} ${display.padEnd(12)} ┆`);
    }
  
    lines.push('┕┄┄┄┄┄┄┄┄┄┙');
    return lines.join('\n');
  }

// 检查中奖
function checkWinning(lottery) {
    let totalPrize = 0;
    for (const [pos, data] of Object.entries(lottery.numbers)) {
      if (data.number === lottery.luckyNumber) {
        totalPrize += data.prize;
      }
    }
    return totalPrize;
  }

// 新增函数：检查每日刮奖次数
function checkDailyScratchLimit(userId) {
    const now = new Date();
    const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const scratchData = JSON.parse(ext.storageGet(`scratch_${userId}`) || '{}');
    
    if (scratchData.date !== today) {
      scratchData.date = today;
      scratchData.count = 0;
    }
  
    if (scratchData.count >= 3) {
      return false;
    }
  
    scratchData.count++;
    ext.storageSet(`scratch_${userId}`, JSON.stringify(scratchData));
    return true;
  }

// 获取中奖评语
function getWinningComment(prize) {
  if (prize === 0) return '下次走运的一定是你！';
  if (prize <= 100) return '呦呵，小来一笔，回本！';
  if (prize <= 1000) return '有点大，运气不赖嘛！';
  if (prize <= 10000) return '枪枪爆头，好运连连！';
  return '朋友，要不来点真的？';
}

// 创建获取彩票命令
const cmdGet = seal.ext.newCmdItemInfo();
cmdGet.name = '获取刮刮';
cmdGet.help = '获取一张新的刮刮乐（每天限3次）';
cmdGet.solve = (ctx, msg, cmdArgs) => {
  const userId = msg.sender.userId;
  const userLotteryData = ext.storageGet(`lottery_${userId}`);
  
  if (userLotteryData) {
    const userLottery = JSON.parse(userLotteryData);
    if (!userLottery.completed) {
      seal.replyToSender(ctx, msg, '你已经有一张未完成的刮刮，请先完成当前刮刮！');
      return seal.ext.newCmdExecuteResult(true);
    }
    ext.storageSet(`lottery_${userId}`, '');
  }

  if (!checkDailyScratchLimit(userId)) {
    seal.replyToSender(ctx, msg, '今天的刮刮次数已用完，请明天再来！');
    return seal.ext.newCmdExecuteResult(true);
  }

  const lottery = generateLottery();
  ext.storageSet(`lottery_${userId}`, JSON.stringify(lottery));
  
  seal.replyToSender(ctx, msg, `获得一张新刮刮：\n${formatLottery(lottery)}`);
  return seal.ext.newCmdExecuteResult(true);
};

// 创建刮开命令
const cmdScratch = seal.ext.newCmdItemInfo();
cmdScratch.name = '刮开';
cmdScratch.help = '刮开一个号码，格式：.刮开';
cmdScratch.solve = (ctx, msg, cmdArgs) => {
  const userId = msg.sender.userId;
  const lotteryData = ext.storageGet(`lottery_${userId}`);
  
  if (!lotteryData) {
    seal.replyToSender(ctx, msg, '你还没有刮刮，请先获取刮刮！');
    return seal.ext.newCmdExecuteResult(true);
  }

  const lottery = JSON.parse(lotteryData);
  if (lottery.completed) {
    seal.replyToSender(ctx, msg, '当前刮刮已完成，请获取新的刮刮！');
    return seal.ext.newCmdExecuteResult(true);
  }

  const positions = Object.keys(lottery.numbers);
  const nextPos = positions.find(pos => !lottery.scratched.includes(pos));
  
  if (!nextPos) {
    lottery.completed = true;
    const prize = checkWinning(lottery);
    const comment = getWinningComment(prize);
    
    updateUserStats(userId, prize);
    
    seal.replyToSender(ctx, msg, `所有号码已刮开！\n${formatLottery(lottery)}\n${comment}\n幸运积分：¥${prize}`);
    ext.storageSet(`lottery_${userId}`, '');
  } else {
    lottery.scratched.push(nextPos);
    ext.storageSet(`lottery_${userId}`, JSON.stringify(lottery));
    seal.replyToSender(ctx, msg, `刮开号码${nextPos}：\n${formatLottery(lottery)}`);
  }
  
  return seal.ext.newCmdExecuteResult(true);
};

// 创建全刮命令
const cmdScratchAll = seal.ext.newCmdItemInfo();
cmdScratchAll.name = '全刮';
cmdScratchAll.help = '一次性刮开所有号码，格式：.全刮';
cmdScratchAll.solve = (ctx, msg, cmdArgs) => {
  const userId = msg.sender.userId;
  const lotteryData = ext.storageGet(`lottery_${userId}`);
  
  if (!lotteryData) {
    seal.replyToSender(ctx, msg, '你还没有刮刮，请先获取刮刮！');
    return seal.ext.newCmdExecuteResult(true);
  }

  const lottery = JSON.parse(lotteryData);
  if (lottery.completed) {
    seal.replyToSender(ctx, msg, '当前刮刮已完成，请获取新的刮刮！');
    return seal.ext.newCmdExecuteResult(true);
  }

  lottery.scratched = Object.keys(lottery.numbers);
  lottery.completed = true;
  
  const prize = checkWinning(lottery);
  const comment = getWinningComment(prize);
  
  updateUserStats(userId, prize);
  
  seal.replyToSender(ctx, msg, `一次性刮开所有号码！\n${formatLottery(lottery)}\n${comment}\n幸运积分：¥${prize}`);
  
  ext.storageSet(`lottery_${userId}`, '');
  
  return seal.ext.newCmdExecuteResult(true);
};

// 修改 checkWinning 函数
function checkWinning(lottery) {
    let totalPrize = 0;
    for (const [pos, data] of Object.entries(lottery.numbers)) {
      if (data.number === lottery.luckyNumber) {
        totalPrize += data.prize;
      }
    }
    return totalPrize;
  }

// 新增一个辅助函数来更新用户统计
function updateUserStats(userId, prize) {
    const stats = JSON.parse(ext.storageGet(`stats_${userId}`) || '{"total": 0, "wins": 0, "amount": 0}');
    stats.total += 1;
    if (prize > 0) {
      stats.wins += 1;
      stats.amount += prize;
    }
    ext.storageSet(`stats_${userId}`, JSON.stringify(stats));
  }

// 创建记录查看命令
const cmdStats = seal.ext.newCmdItemInfo();
cmdStats.name = '刮刮记录';
cmdStats.help = '查看个人刮刮统计记录';
cmdStats.solve = (ctx, msg, cmdArgs) => {
  const userId = msg.sender.userId;
  const stats = JSON.parse(ext.storageGet(`stats_${userId}`) || '{"total": 0, "wins": 0, "amount": 0}');
  
  const winRate = stats.total > 0 ? (stats.wins / stats.total * 100).toFixed(2) : 0;
  seal.replyToSender(ctx, msg, 
    `刮刮统计记录：\n` +
    `总计参与：${stats.total}次\n` +
    `幸运次数：${stats.wins}次\n` +
    `幸运率：${winRate}%\n` +
    `总幸运积分：¥${stats.amount}`
  );
  return seal.ext.newCmdExecuteResult(true);
};

// 注册命令
ext.cmdMap['获取刮刮'] = cmdGet;
ext.cmdMap['刮开'] = cmdScratch;
ext.cmdMap['全刮'] = cmdScratchAll;
ext.cmdMap['刮刮记录'] = cmdStats;
