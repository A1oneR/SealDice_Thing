// ==UserScript==
// @name         Farkle(快艇骰子)
// @author       Claude, Air
// @version      1.1.0
// @description  经典骰子游戏Farkle，通过投掷骰子获取分数，支持多人对战和单人模式
// @timestamp    1746266678
// @license      Apache-2
// @homepageURL  https://github.com/A1oneR
// ==/UserScript==

const VERSION = '1.1.0';

// Farkle游戏规则(快艇骰子)
// 每个玩家轮流投掷6个骰子，并根据得分组合选择哪些骰子得分
// 常见得分规则:
// - 单个1 = 100分
// - 单个5 = 50分
// - 三个相同的数 = 该数字×100分（三个1=1000分）
// - 三对 = 1500分
// - 1-6顺子 = 1500分
// - 四个相同 = 1000分
// - 五个相同 = 2000分
// - 六个相同 = 3000分
// 如果一次投掷没有得分组合，就会失去当前回合所有积累的分数（Farkle）

class Player {
    #name = '';
    #score = 0;
    #turnScore = 0;
    #inTurn = false;
    #honor = 0;         // 荣誉积分
    #highestRoll = 0;   // 单次投掷最高分
    #wins = 0;          // 胜场次数
    #losses = 0;        // 败场次数
    #totalScore = 0;    // 总分数
    #gamesPlayed = 0;   // 参与的游戏总数

    constructor(name, score = 0, honor = 0, highestRoll = 0, wins = 0, losses = 0, totalScore = 0, gamesPlayed = 0) {
        this.#name = String(name);
        this.#score = Number(score);
        this.#turnScore = 0;
        this.#inTurn = false;
        this.#honor = Number(honor);
        this.#highestRoll = Number(highestRoll);
        this.#wins = Number(wins);
        this.#losses = Number(losses);
        this.#totalScore = Number(totalScore);
        this.#gamesPlayed = Number(gamesPlayed);
    }

    toJSON() {
        return {
            name: this.#name,
            score: this.#score,
            turnScore: this.#turnScore,
            inTurn: this.#inTurn,
            honor: this.#honor,
            highestRoll: this.#highestRoll,
            wins: this.#wins,
            losses: this.#losses,
            totalScore: this.#totalScore,
            gamesPlayed: this.#gamesPlayed
        }
    }

    startTurn() {
        this.#inTurn = true;
        this.#turnScore = 0;
    }

    addTurnScore(score) {
        this.#turnScore += score;
        // 更新单次投掷最高分
        if (score > this.#highestRoll) {
            this.#highestRoll = score;
        }
    }

    endTurn(farkled = false) {
        if (!farkled) {
            this.#score += this.#turnScore;
        }
        this.#turnScore = 0;
        this.#inTurn = false;
    }

    addHonor(points) {
        this.#honor += points;
    }

    resetScore() {
        this.#score = 0;
        this.#turnScore = 0;
    }

    addWin() {
        this.#wins++;
        this.#gamesPlayed++;
        this.#totalScore += this.#score;
    }

    addLoss() {
        this.#losses++;
        this.#gamesPlayed++;
        this.#totalScore += this.#score;
    }

    get name() { return this.#name; }
    get score() { return this.#score; }
    get turnScore() { return this.#turnScore; }
    get inTurn() { return this.#inTurn; }
    get honor() { return this.#honor; }
    get highestRoll() { return this.#highestRoll; }
    get wins() { return this.#wins; }
    get losses() { return this.#losses; }
    get avgScore() { 
        return this.#gamesPlayed > 0 ? Math.round(this.#totalScore / this.#gamesPlayed) : 0; 
    }
    get gamesPlayed() { return this.#gamesPlayed; }
}

class FarkleGame {
    #players = new Map();
    #currentPlayerId = '';
    #dice = [];
    #selectedDice = [];
    #status = FarkleGame.StIdle;
    #targetScore = 5000;  // 修改默认目标分数为5000
    #lastRound = false;
    #lastPlayer = '';
    #singlePlayerMode = false;
    #attempts = 1;       // 单人模式尝试次数
    #currentAttempt = 0; // 当前尝试次数
    #leaderboard = [];   // 排行榜
    #lastRollResult = []; // 最后一次投掷结果
    #singlePlayerScores = []; // 单人模式下各次尝试的得分
    #hasSelectedDiceInCurrentRoll = false; // 新增：跟踪当前投掷是否已选择骰子
    #ruleSet = 1;
    #honorChanges = new Map(); // 新增：记录每个玩家的荣誉分变化

    static StIdle = 'idle';
    static StStarted = 'started';
    static StRolled = 'rolled';
    static StFinished = 'finished';
    static StSinglePlayer = 'singlePlayer';

    constructor(str = '', targetScore = 5000, playerData = {}) {
        if (!str) {
            this.#players = new Map();
            this.#currentPlayerId = '';
            this.#dice = [];
            this.#selectedDice = [];
            this.#status = FarkleGame.StIdle;
            this.#targetScore = targetScore;
            this.#lastRound = false;
            this.#lastPlayer = '';
            this.#singlePlayerMode = false;
            this.#attempts = 1;
            this.#currentAttempt = 0;
            this.#leaderboard = [];
            this.#lastRollResult = [];
            this.#singlePlayerScores = [];
            this.#hasSelectedDiceInCurrentRoll = false; // 初始化新属性
            this.#honorChanges = new Map();
            this.#ruleSet = 1; // 添加规则集属性，默认为规则1
            
            // 加载玩家数据
            if (playerData && Object.keys(playerData).length > 0) {
                this.loadPlayerData(playerData);
            }
            return;
        }
    
        // 解析游戏状态
        try {
            let obj = JSON.parse(str);
            
            // 创建玩家对象
            this.#players = new Map();
            if (obj.players) {
                for (let [k, v] of obj.players) {
                    // 合并持久化的玩家数据
                    let honor = 0;
                    let highestRoll = 0;
                    let wins = 0;
                    let losses = 0;
                    let totalScore = 0;
                    let gamesPlayed = 0;
                    
                    // 如果玩家ID在持久化数据中存在，使用持久化数据
                    if (playerData[k]) {
                        honor = playerData[k].honor || 0;
                        highestRoll = playerData[k].highestRoll || 0;
                        wins = playerData[k].wins || 0;
                        losses = playerData[k].losses || 0;
                        totalScore = playerData[k].totalScore || 0;
                        gamesPlayed = playerData[k].gamesPlayed || 0;
                    }
                    
                    // 创建玩家对象，优先使用持久化数据
                    this.#players.set(k, new Player(
                        v.name, 
                        v.score, 
                        honor,
                        highestRoll,
                        wins,
                        losses,
                        totalScore,
                        gamesPlayed
                    ));
                    
                    // 恢复玩家回合状态
                    if (v.inTurn) {
                        let player = this.#players.get(k);
                        player.startTurn();
                        player.addTurnScore(v.turnScore);
                    }
                }
            }
            
            // 恢复游戏状态
            this.#currentPlayerId = obj.currentPlayerId || '';
            this.#dice = obj.dice || [];
            this.#selectedDice = obj.selectedDice || [];
            this.#status = obj.status || FarkleGame.StIdle;
            this.#targetScore = obj.targetScore || targetScore;
            this.#lastRound = obj.lastRound || false;
            this.#lastPlayer = obj.lastPlayer || '';
            this.#singlePlayerMode = obj.singlePlayerMode || false;
            this.#attempts = obj.attempts || 1;
            this.#currentAttempt = obj.currentAttempt || 0;
            this.#leaderboard = obj.leaderboard || [];
            this.#lastRollResult = obj.lastRollResult || [];
            this.#singlePlayerScores = obj.singlePlayerScores || [];
            this.#hasSelectedDiceInCurrentRoll = obj.hasSelectedDiceInCurrentRoll || false; // 从保存状态恢复
            this.#ruleSet = obj.ruleSet || 1; // 恢复规则集设置
            this.#honorChanges = new Map();
            if (obj.honorChanges) {
                for (let [k, v] of obj.honorChanges) {
                    this.#honorChanges.set(k, v);
                }
            }
        } catch (e) {
            // 出错时使用默认值
            console.log("解析游戏数据出错:", e);
            this.#players = new Map();
            this.#currentPlayerId = '';
            this.#dice = [];
            this.#selectedDice = [];
            this.#status = FarkleGame.StIdle;
            this.#targetScore = targetScore;
            this.#lastRound = false;
            this.#lastPlayer = '';
            this.#singlePlayerMode = false;
            this.#attempts = 1;
            this.#currentAttempt = 0;
            this.#leaderboard = [];
            this.#lastRollResult = [];
            this.#singlePlayerScores = [];
            this.#hasSelectedDiceInCurrentRoll = false; // 出错时使用默认值
            this.#ruleSet = 1; // 出错时使用默认规则
            this.#honorChanges = new Map();
        }
    }

    loadPlayerData(playerData) {
        for (let [id, data] of Object.entries(playerData)) {
            // 如果玩家已存在，更新其数据
            if (this.#players.has(id)) {
                let player = this.#players.get(id);
                // 这里实际更新玩家持久化数据
                // 注意：由于Player对象的设计，我们需要创建新对象来替换
                let currentScore = player.score;
                let currentTurnScore = player.turnScore;
                let isInTurn = player.inTurn;
                
                // 创建新Player对象来替换现有对象
                this.#players.set(id, new Player(
                    data.name || id,
                    currentScore, // 保留当前游戏分数
                    data.honor || 0,
                    data.highestRoll || 0,
                    data.wins || 0,
                    data.losses || 0,
                    data.totalScore || 0,
                    data.gamesPlayed || 0
                ));
                
                // 恢复回合状态
                if (isInTurn) {
                    let updatedPlayer = this.#players.get(id);
                    updatedPlayer.startTurn();
                    updatedPlayer.addTurnScore(currentTurnScore);
                }
            } else {
                // 如果是新玩家，创建玩家对象
                this.#players.set(id, new Player(
                    data.name || id,
                    0, // 初始分数为0
                    data.honor || 0,
                    data.highestRoll || 0,
                    data.wins || 0,
                    data.losses || 0,
                    data.totalScore || 0,
                    data.gamesPlayed || 0
                ));
            }
        }
    }

    // 修改getPlayerPersistentData方法，使其保留现有数据
    getPlayerPersistentData() {
      // 先获取现有的持久化数据
        let existingData = {};
        try {
            let playerDataKey = 'farkle:playerData';
            let rawData = ext.storageGet(playerDataKey) || '{}';
            existingData = JSON.parse(rawData);
        } catch (e) {
            console.log("解析现有玩家数据出错:", e);
            existingData = {};
        }
    
        // 更新当前游戏中玩家的数据，但不删除其他玩家的数据
        for (let [id, player] of this.#players.entries()) {
            existingData[id] = {
                name: player.name,
                honor: player.honor,
                highestRoll: player.highestRoll, 
                wins: player.wins,
                losses: player.losses,
                totalScore: player.totalScore,
                gamesPlayed: player.gamesPlayed
            };
        }
        return existingData;
    }

    // 添加切换规则的方法
    setRuleSet(ruleSet) {
        if (ruleSet === 1 || ruleSet === 2) {
            this.#ruleSet = ruleSet;
            return [true, `已切换到规则${ruleSet}`];
        }
        return [false, '无效的规则集，请选择1或2'];
    }

    // 获取当前规则集
    getRuleSet() {
        return this.#ruleSet;
    }

    // 修改addPlayer方法，让它保留玩家的持久化数据
    addPlayer(id, name = '') {
        if (!name) name = id;
        if (this.#status !== FarkleGame.StIdle) return [false, '游戏已开始'];
        if (this.#players.has(id)) return [false, '玩家已存在'];
    
        // 获取玩家持久化数据
        let playerData = {};
        try {
            let playerDataKey = 'farkle:playerData';
            let rawData = ext.storageGet(playerDataKey) || '{}';
            playerData = JSON.parse(rawData);
        } catch (e) {
            console.log("解析玩家数据出错:", e);
        }
    
        // 检查是否有持久化数据
        if (playerData[id]) {
            // 使用持久化数据创建玩家对象
            this.#players.set(id, new Player(
                name, // 使用当前名字
                0,    // 游戏分数重置为0
                playerData[id].honor || 0,
                playerData[id].highestRoll || 0,
                playerData[id].wins || 0,
                playerData[id].losses || 0,
                playerData[id].totalScore || 0,
                playerData[id].gamesPlayed || 0
            ));
        } else {
            // 如果没有持久化数据，创建新玩家
            this.#players.set(id, new Player(name));
        }
        
        return [true, ''];
    }

    removePlayer(id) {
        if (this.#status !== FarkleGame.StIdle) return [false, '游戏已开始'];
        if (!this.#players.has(id)) return [false, '玩家不存在'];
        this.#players.delete(id);
        return [true, ''];
    }

    start() {
        if (this.#status !== FarkleGame.StIdle) return [false, '游戏已开始'];
        if (this.#players.size < 2) return [false, '多人模式至少需要2名玩家'];
        
        this.#status = FarkleGame.StStarted;
        this.#singlePlayerMode = false;
        // 随机选择第一个玩家
        let playerIds = Array.from(this.#players.keys());
        this.#currentPlayerId = playerIds[Math.floor(Math.random() * playerIds.length)];
        this.#players.get(this.#currentPlayerId).startTurn();
        
        return [true, ''];
    }

    // 新增：开始单人模式
    startSinglePlayer(id, name = '') {
        if (this.#status !== FarkleGame.StIdle) return [false, '游戏已开始'];
        
        this.#players.clear(); // 清除所有玩家
        if (!name) name = id;
        this.#players.set(id, new Player(name));
        
        this.#status = FarkleGame.StSinglePlayer;
        this.#singlePlayerMode = true;
        this.#currentPlayerId = id;
        this.#currentAttempt = 1;
        this.#singlePlayerScores = []; // 清空之前的尝试记录
        this.#players.get(id).startTurn();
        
        return [true, '开始单人模式，这是第1次尝试，共1次'];
    }

    roll() {
        // 检查游戏状态
        if (this.#status !== FarkleGame.StStarted && 
            this.#status !== FarkleGame.StRolled && 
            this.#status !== FarkleGame.StSinglePlayer) 
            return [false, '游戏未开始或当前不能投掷'];
        
        // 检查是否为当前玩家
        if (!this.#players.has(this.#currentPlayerId)) 
            return [false, '当前玩家不存在'];
        
        // 检查：如果状态是StRolled且没有已选骰子，必须先选择得分骰子
        if (this.#status === FarkleGame.StRolled && !this.#hasSelectedDiceInCurrentRoll) {
            return [false, '你必须先选择至少一个得分骰子才能继续投掷'];
        }
        
        // 确定可用骰子数量
        let availableDice = 6 - this.#selectedDice.length;
        
        // 如果所有6个骰子都已选择得分，进入新一轮（全部6个骰子）
        if (availableDice === 0) {
            this.#selectedDice = [];
            availableDice = 6;
        }
        
        // 投掷骰子
        this.#dice = [];
        for (let i = 0; i < availableDice; i++) {
            this.#dice.push(Math.floor(Math.random() * 6) + 1);
        }
        
        // 保存投掷结果用于Farkle时显示
        this.#lastRollResult = [...this.#dice];
        
        // 重置当前投掷选择状态
        this.#hasSelectedDiceInCurrentRoll = false;
        
        // 检查是否有得分组合
        let combos = this.findScoringCombinations();
        if (combos.length === 0) {
            // Farkle! 失去当前回合所有分数
            let player = this.#players.get(this.#currentPlayerId);
            player.endTurn(true);
            
            let farkleMsg = `Farkle! 投掷结果 [${this.#lastRollResult.join(', ')}] 没有得分组合，失去当前回合分数`;
            
            if (this.#singlePlayerMode) {
                // 记录当前尝试的得分（在Farkle情况下为当前总分，因为已经endTurn）
                this.#singlePlayerScores[this.#currentAttempt - 1] = player.score;
                
                // 单人模式下，结束当前尝试，开始下一次尝试或结束游戏
                if (this.#currentAttempt >= this.#attempts) {
                    // 完成单人游戏并获取结果
                    let gameResult = this.finishSinglePlayerGame();
                    
                    // 构建结果消息
                    let msg = farkleMsg + '\n您已用完所有尝试次数，游戏结束\n';
                    msg += `最终得分: ${gameResult.bestScore}分\n`;
                    
                    return [false, msg];
                } else {
                    // 增加尝试次数
                    this.#currentAttempt++;
                    
                    // 重置玩家状态
                    player.resetScore();
                    player.startTurn();
                    
                    // 清空骰子状态
                    this.#dice = [];
                    this.#selectedDice = [];
                    this.#hasSelectedDiceInCurrentRoll = false;
                    
                    // 更新游戏状态
                    this.#status = FarkleGame.StSinglePlayer;
                    
                    return [false, farkleMsg + `\n第${this.#currentAttempt-1}次尝试结束。开始第${this.#currentAttempt}次尝试，共${this.#attempts}次`];
                }
            } else {
                this.nextPlayer();
                return [false, farkleMsg];
            }
        }
        
        // 更新游戏状态
        this.#status = FarkleGame.StRolled;
        return [true, ''];
    }
    

    // 结束单人游戏并更新排行榜
    finishSinglePlayerGame() {
        let player = this.#players.get(this.#currentPlayerId);
        
        // 确保最后一次尝试的分数被记录
        if (this.#currentAttempt > 0 && this.#currentAttempt <= this.#attempts) {
            this.#singlePlayerScores[this.#currentAttempt - 1] = player.score;
        }
        
        // 找出所有尝试中的最高分
        let bestScore = 0;
        for (let score of this.#singlePlayerScores) {
            if (score > bestScore) {
                bestScore = score;
            }
        }
        
        // 保存玩家信息
        let playerName = player.name;
        let playerId = this.#currentPlayerId;
        
        // 确保添加到排行榜并正确排序
        this.#leaderboard.push({
            name: playerName,
            score: bestScore,
            timestamp: Date.now()
        });
        
        // 按分数降序排序
        this.#leaderboard.sort((a, b) => b.score - a.score);
        
        // 只保留前10名
        if (this.#leaderboard.length > 10) {
            this.#leaderboard = this.#leaderboard.slice(0, 10);
        }
        
        // 设置状态为已完成
        this.#status = FarkleGame.StFinished;
        
        // 返回游戏结果和得分记录
        return { 
            bestScore: bestScore, 
            attempts: [...this.#singlePlayerScores], // 确保返回副本
            playerName: playerName,
            playerId: playerId 
        };
    }

    // 查找所有可能的得分组合
    findScoringCombinations() {
        let combos = [];
        let counts = [0, 0, 0, 0, 0, 0, 0]; // 索引0不使用，1-6对应骰子点数
        
        // 检查骰子数组是否为空
        if (!this.#dice || this.#dice.length === 0) {
            return combos; // 返回空数组
        }
    
        for (let die of this.#dice) {
            counts[die]++;
        }
        
        // 规则2：检查"六不搭"（六个骰子均无得分组合）
        if (this.#ruleSet === 2 && this.#dice.length === 6) {
            // 检查是否没有1和5
            if (counts[1] === 0 && counts[5] === 0) {
                // 检查是否没有三个或以上相同的数字
                let hasThreeOfAKind = false;
                for (let i = 1; i <= 6; i++) {
                    if (counts[i] >= 3) {
                        hasThreeOfAKind = true;
                        break;
                    }
                }
                
                // 检查是否没有小顺或大顺
                let hasStraight = 
                    (counts[1] >= 1 && counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1) || 
                    (counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1 && counts[6] >= 1) ||
                    (counts[1] >= 1 && counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1 && counts[6] >= 1);
                
                // 检查是否没有三对
                let pairCount = 0;
                for (let i = 1; i <= 6; i++) {
                    if (counts[i] === 2) pairCount++;
                    else if (counts[i] === 4) pairCount += 2;
                    else if (counts[i] === 6) pairCount += 3;
                }
                
                if (!hasThreeOfAKind && !hasStraight && pairCount < 3) {
                    combos.push({
                        type: 'noCombination',
                        dice: [...this.#dice],
                        score: 500
                    });
                }
            }
        }
        
        // 检查直线 (1-6)
        if (counts[1] >= 1 && counts[2] >= 1 && counts[3] >= 1 && 
            counts[4] >= 1 && counts[5] >= 1 && counts[6] >= 1) {
            combos.push({
                type: 'straight',
                dice: [1, 2, 3, 4, 5, 6],
                score: 1500
            });
        }
        
        // 规则2：检查小顺 (1-5) 或 (2-6)
        if (this.#ruleSet === 2) {
            if (counts[1] >= 1 && counts[2] >= 1 && counts[3] >= 1 && 
                counts[4] >= 1 && counts[5] >= 1) {
                combos.push({
                    type: 'smallStraight',
                    dice: [1, 2, 3, 4, 5],
                    score: 750
                });
            }
            
            if (counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && 
                counts[5] >= 1 && counts[6] >= 1) {
                combos.push({
                    type: 'smallStraight',
                    dice: [2, 3, 4, 5, 6],
                    score: 750
                });
            }
        }
        
        // 检查三对
        let pairCounts = 0;
        let pairDice = [];
        for (let i = 1; i <= 6; i++) {
            if (counts[i] >= 2) {
                pairCounts++;
                pairDice.push(i, i);
                
                // 处理四个、六个相同的特殊情况
                if (counts[i] >= 4) pairCounts++;
                if (counts[i] >= 6) pairCounts++;
            }
        }
        
        if (pairCounts >= 3 && this.#dice.length === 6) {
            combos.push({
                type: 'threePairs',
                dice: pairDice.slice(0, 6), // 确保只取前6个作为三对
                score: 1500
            });
        }
        
        // 检查六个相同
        if (this.#ruleSet === 2) {
            // 规则2下的得分计算
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 6) {
                    let baseScore = i === 1 ? 8000 : i * 800;
                    combos.push({
                        type: 'sixOfAKind',
                        dice: Array(6).fill(i),
                        score: baseScore
                    });
                }
                
                if (counts[i] === 5) {
                    let baseScore = i === 1 ? 4000 : i * 400;
                    combos.push({
                        type: 'fiveOfAKind',
                        dice: Array(5).fill(i),
                        score: baseScore
                    });
                }
                
                if (counts[i] === 4) {
                    let baseScore = i === 1 ? 2000 : i * 200;
                    combos.push({
                        type: 'fourOfAKind',
                        dice: Array(4).fill(i),
                        score: baseScore
                    });
                }
                
                if (counts[i] === 3) {
                    let score = i === 1 ? 1000 : i * 100;
                    combos.push({
                        type: 'threeOfAKind',
                        dice: Array(3).fill(i),
                        score: score
                    });
                }
            }
        } else {
            // 原有规则的得分计算
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 6) {
                    combos.push({
                        type: 'sixOfAKind',
                        dice: Array(6).fill(i),
                        score: 3000
                    });
                }
                
                if (counts[i] === 5) {
                    combos.push({
                        type: 'fiveOfAKind',
                        dice: Array(5).fill(i),
                        score: 2000
                    });
                }
                
                if (counts[i] === 4) {
                    combos.push({
                        type: 'fourOfAKind',
                        dice: Array(4).fill(i),
                        score: 1000
                    });
                }
                
                if (counts[i] >= 3) {
                    let score = i === 1 ? 1000 : i * 100;
                    combos.push({
                        type: 'threeOfAKind',
                        dice: Array(3).fill(i),
                        score: score
                    });
                }
            }
        }
        
        // 检查单个1和5（这部分两个规则都一样）
        if (counts[1] >= 1) {
            combos.push({
                type: 'single',
                dice: [1],
                score: 100
            });
        }
        
        if (counts[5] >= 1) {
            combos.push({
                type: 'single',
                dice: [5],
                score: 50
            });
        }
        
        return combos;
    }

    select(selection) {
        if (this.#status !== FarkleGame.StRolled) 
            return [false, '请先投掷骰子'];
        
        // 同时支持中文和英文逗号分隔
        let selectedValues = selection.replace(/，/g, ',').split(',')
            .map(s => parseInt(s.trim()))
            .filter(n => !isNaN(n));
        
        if (selectedValues.length === 0) {
            return [false, '请选择有效的骰子'];
        }
        
        // 验证选择的骰子是否有效
        let tempDice = [...this.#dice];
        for (let val of selectedValues) {
            let index = tempDice.indexOf(val);
            if (index === -1) {
                return [false, `选择无效，没有足够的 ${val} 点骰子`];
            }
            tempDice.splice(index, 1);
        }
        
        // 计算选择的分数
        let score = this.calculateScore(selectedValues);
        if (score === 0) {
            return [false, `选择的骰子 [${selectedValues.join(', ')}] 没有有效的得分组合`];
        }
        
        // 更新玩家得分和已选骰子
        let player = this.#players.get(this.#currentPlayerId);
        player.addTurnScore(score);
        
        // 更新骰子状态
        for (let val of selectedValues) {
            let index = this.#dice.indexOf(val);
            this.#dice.splice(index, 1);
            this.#selectedDice.push(val);
        }
        
        // 标记当前投掷已选择骰子
        this.#hasSelectedDiceInCurrentRoll = true;

        return [true, `选择得分: ${score}`];
    }

    calculateScore(selectedDice) {
        let score = 0;
        // 创建一个副本用于跟踪处理过的骰子
        let remainingDice = [...selectedDice];
    
        if (selectedDice.length === 0) return 0;
        
        // 计算每个点数的出现次数
        let counts = [0, 0, 0, 0, 0, 0, 0]; // 索引0不使用，1-6对应骰子点数
        for (let die of selectedDice) {
            counts[die]++;
        }
        
        // 规则2：检查"六不搭"（六个骰子均无得分组合）
        if (this.#ruleSet === 2 && selectedDice.length === 6) {
            // 检查是否没有1和5
            if (counts[1] === 0 && counts[5] === 0) {
                // 检查是否没有三个或以上相同的数字
                let hasThreeOfAKind = false;
                for (let i = 1; i <= 6; i++) {
                    if (counts[i] >= 3) {
                        hasThreeOfAKind = true;
                        break;
                    }
                }
                
                // 检查是否没有小顺或大顺
                let hasStraight = 
                    (counts[1] >= 1 && counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1) || 
                    (counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1 && counts[6] >= 1) ||
                    (counts[1] >= 1 && counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1 && counts[6] >= 1);
                
                // 检查是否没有三对
                let pairCount = 0;
                for (let i = 1; i <= 6; i++) {
                    if (counts[i] === 2) pairCount++;
                    else if (counts[i] === 4) pairCount += 2;
                    else if (counts[i] === 6) pairCount += 3;
                }
                
                if (!hasThreeOfAKind && !hasStraight && pairCount < 3) {
                    return 500; // 六不搭
                }
            }
        }
        
        // 检查1-6顺子 (需要恰好6个骰子并且每个点数出现1次)
        if (selectedDice.length === 6 && 
            counts[1] === 1 && counts[2] === 1 && counts[3] === 1 && 
            counts[4] === 1 && counts[5] === 1 && counts[6] === 1) {
            return 1500;
        }
        
        // 规则2：检查小顺 (1-5) 或 (2-6)
        if (this.#ruleSet === 2 && selectedDice.length === 5) {
            if (counts[1] === 1 && counts[2] === 1 && counts[3] === 1 && 
                counts[4] === 1 && counts[5] === 1) {
                return 750;
            }
            
            if (counts[2] === 1 && counts[3] === 1 && counts[4] === 1 && 
                counts[5] === 1 && counts[6] === 1) {
                return 750;
            }
        }
    
        // 检查三对 (需要恰好6个骰子，且可以形成3对)
        if (selectedDice.length === 6) {
            let pairCount = 0;
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 2) pairCount++;
                // 如果有4个相同，当作2对计算
                else if (counts[i] === 4) pairCount += 2;
                // 如果有6个相同，当作3对计算
                else if (counts[i] === 6) pairCount += 3;
            }
            if (pairCount === 3) return 1500; // 三对得1500分
        }
        
        // 根据规则集处理多个相同点数
        if (this.#ruleSet === 2) {
            // 规则2的处理方式
            // 六个相同
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 6) {
                    let baseScore = i === 1 ? 8000 : i * 1600;
                    return baseScore;
                }
            }
            
            // 五个相同
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 5) {
                    let baseScore = i === 1 ? 4000 : i * 800;
                    
                    // 处理剩余的1个骰子
                    counts[i] -= 5;
                    
                    // 添加剩余骰子的分数
                    for (let j = 1; j <= 6; j++) {
                        if (j === 1 && counts[j] > 0) {
                            score += counts[j] * 100;
                        } else if (j === 5 && counts[j] > 0) {
                            score += counts[j] * 50;
                        } else if (counts[j] > 0) {
                            // 如果有其他非得分骰子，则组合无效
                            return 0;
                        }
                    }
                    
                    return baseScore + score;
                }
            }
            
            // 四个相同
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 4) {
                    let baseScore = i === 1 ? 2000 : i * 400;
                    
                    // 处理剩余的骰子
                    counts[i] -= 4;
                    
                    // 添加剩余骰子的分数
                    for (let j = 1; j <= 6; j++) {
                        if (j === 1 && counts[j] > 0) {
                            score += counts[j] * 100;
                        } else if (j === 5 && counts[j] > 0) {
                            score += counts[j] * 50;
                        } else if (counts[j] > 0) {
                            // 如果有其他非得分骰子，则组合无效
                            return 0;
                        }
                    }
                    
                    return baseScore + score;
                }
            }
        } else {
            // 原规则的处理方式
            // 六个相同
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 6) return 3000;
            }
            
            // 五个相同
            let hasFiveOfAKind = false;
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 5) {
                    hasFiveOfAKind = true;
                    score += 2000;  // 加上五个相同的分数
                    
                    // 减少计数，后续处理剩余骰子
                    counts[i] -= 5;
                    break;  // 一次只能有一组五个相同
                }
            }
        
            // 如果有五个相同，处理剩余骰子
            if (hasFiveOfAKind) {
                // 处理剩余的1和5
                for (let i = 1; i <= 6; i++) {
                    if (i === 1 && counts[i] > 0) {
                        score += counts[i] * 100;  // 每个1加100分
                    } else if (i === 5 && counts[i] > 0) {
                       score += counts[i] * 50;   // 每个5加50分
                    } else if (counts[i] > 0) {
                        // 如果还有其他非得分骰子，则得分无效
                        return 0;
                    }
                }
                return score;
            }
            
            // 四个相同，并分别计算
            let hasFourOfAKind = false;
            for (let i = 1; i <= 6; i++) {
                if (counts[i] === 4) {
                    hasFourOfAKind = true;
                    score += 1000;  // 四个相同的基础分是1000
                    
                    // 减少计数，以便后续处理剩余骰子
                    counts[i] -= 4;
                    break;  // 只处理一组四个相同
                }
            }
        
            // 如果有四个相同，先单独处理，然后处理剩余骰子
            if (hasFourOfAKind) {
                // 处理剩余的1和5
                for (let i = 1; i <= 6; i++) {
                    if (i === 1 && counts[i] > 0) {
                        score += counts[i] * 100;  // 每个1加100分
                    } else if (i === 5 && counts[i] > 0) {
                        score += counts[i] * 50;   // 每个5加50分
                    } else if (counts[i] > 0) {
                        // 如果还有其他非得分骰子，则得分无效
                        return 0;
                    }
                }
                return score;
            }
        }
        
        // 处理三个相同的情况
        for (let i = 1; i <= 6; i++) {
            if (counts[i] >= 3) {
                // 计算分数
                score += (i === 1) ? 1000 : i * 100;
                
                // 从剩余骰子中移除三个已计分的相同点数
                counts[i] -= 3;
            }
        }
        
        // 处理剩余的1和5
        for (let i = 1; i <= 6; i++) {
            if (i === 1 && counts[i] > 0) {
                score += counts[i] * 100;
            } else if (i === 5 && counts[i] > 0) {
                score += counts[i] * 50;
            } else if (counts[i] > 0) {
                // 如果还有其他非得分骰子，则整个选择无效
                return 0;
            }
        }
        
        return score;
    }

    bank() {
        if (this.#status !== FarkleGame.StRolled) 
            return [false, '请先投掷并选择骰子'];
        
        let player = this.#players.get(this.#currentPlayerId);
        if (player.turnScore === 0) 
            return [false, '没有可存储的得分'];
        
        player.endTurn(); // 将当前回合得分加到总分
        
        // 单人模式处理
        if (this.#singlePlayerMode) {
            let currentScore = player.score;
            
            // 记录当前尝试的得分
            this.#singlePlayerScores[this.#currentAttempt - 1] = currentScore;
            
            // 检查是否是最后一次尝试
            if (this.#currentAttempt >= this.#attempts) {
                // 先记录结果，但不立即重置
                let gameResult = this.finishSinglePlayerGame();
                
                // 构建结果消息 - 不再提及游戏重置
                let msg = `游戏结束! 您的最终得分: ${gameResult.bestScore}分\n`;
                msg += `尝试记录: `;
                for (let i = 0; i < gameResult.attempts.length; i++) {
                    msg += `${i+1}=${gameResult.attempts[i]||0}分 `;
                }
                
                // 返回消息，但不重置游戏 - 这样describe可以显示完成状态
                return [true, msg];
            } else {
                // 进入下一次尝试
                this.#currentAttempt++;
                
                // 重置玩家状态，但保持之前的尝试记录
                player.resetScore();
                player.startTurn();
                this.#dice = [];
                this.#selectedDice = [];
                this.#status = FarkleGame.StSinglePlayer;
                
                return [true, `回合结束，第${this.#currentAttempt-1}次尝试得分: ${currentScore}分\n这是第${this.#currentAttempt}次尝试，共1次`];
            }
        }
        
        // 多人模式处理
    // 检查是否有玩家达到目标分数
    if (player.score >= this.#targetScore && !this.#lastRound) {
        this.#lastRound = true;
        this.#lastPlayer = this.#currentPlayerId;
    }
    
    // 检查游戏是否结束
    if (this.#lastRound && this.#lastPlayer === this.#currentPlayerId) {
        // 计算积分荣誉
        let honorResult = this.calculateHonor();
        
        this.#status = FarkleGame.StFinished;
        
        // 生成包含荣誉分变化的游戏结束消息
        let endMsg = `游戏结束! 赢家是 ${this.#players.get(honorResult.winner).name} (${this.#players.get(honorResult.winner).score}分)\n\n荣誉分变化:`;
        
        for (let [id, player] of this.#players.entries()) {
            let honorChange = honorResult.honorChanges.get(id) || 0;
            let changeText = honorChange > 0 ? `+${honorChange}` : `${honorChange}`;
            endMsg += `\n${player.name}: ${changeText} (总荣誉分: ${player.honor})`;
        }
        
        return [true, endMsg];
        }
        
        this.nextPlayer();
        return [true, `回合结束，得分已保存 (${player.score}分)`];
    }

    // 计算荣誉积分
    calculateHonor() {
        // 清空之前的荣誉变化记录
        this.#honorChanges.clear();
        
        // 找到胜者和失败者
        let maxScore = 0;
        let winner = '';
        let totalHonorPoints = 0;
        
        // 找出最高分玩家
        for (let [id, player] of this.#players.entries()) {
            if (player.score > maxScore) {
                maxScore = player.score;
                winner = id;
            }
        }
        
        // 计算失败者失去的积分并累计
        for (let [id, player] of this.#players.entries()) {
            if (id !== winner) {
                // 计算距离目标分数的差距
                let scoreDiff = this.#targetScore - player.score;
                let lostPoints = Math.ceil(scoreDiff / 100);
                if (lostPoints <= 0) lostPoints = 1; // 至少失去1点
                
                // 记录荣誉分变化
                this.#honorChanges.set(id, -lostPoints);
                
                // 更新失败者的荣誉分和败场
                player.addHonor(-lostPoints);
                player.addLoss();
                totalHonorPoints += lostPoints;
            }
        }
        
        // 更新胜者的荣誉分和胜场
        if (winner && this.#players.has(winner)) {
            // 记录荣誉分变化
            this.#honorChanges.set(winner, totalHonorPoints);
            
            this.#players.get(winner).addHonor(totalHonorPoints);
            this.#players.get(winner).addWin();
        }
    }

    nextPlayer() {
        // 重置骰子状态
        this.#dice = [];
        this.#selectedDice = [];
        this.#hasSelectedDiceInCurrentRoll = false; // 重置选择状态
        
        // 获取所有玩家ID并找到当前玩家的索引
        let playerIds = Array.from(this.#players.keys());
        let currentIndex = playerIds.indexOf(this.#currentPlayerId);
        
        // 计算下一个玩家的索引
        let nextIndex = (currentIndex + 1) % playerIds.length;
        let nextId = playerIds[nextIndex];
        
        // 更新当前玩家并开始其回合
        this.#currentPlayerId = nextId;
        this.#players.get(nextId).startTurn();
        
        this.#status = FarkleGame.StStarted;
    }

    // 获取排行榜
    getLeaderboard() {
        return this.#leaderboard;
    }

    // 获取玩家荣誉信息
    getHonorInfo(playerId) {
        if (!this.#players.has(playerId)) {
            return null;
        }
        
        let player = this.#players.get(playerId);
        return {
            name: player.name,
            honor: player.honor,
            highestRoll: player.highestRoll
        };
    }

    // 修改getHonorRanking方法，使用持久化的玩家数据
    getHonorRanking() {
    // 创建一个从持久化存储中获取的玩家数据的副本
    let playerData = {};
    try {
        // 这里应该获取完整的玩家数据
        let playerDataKey = 'farkle:playerData';
        let rawData = ext.storageGet(playerDataKey) || '{}';
        playerData = JSON.parse(rawData);
    } catch (e) {
        console.log("解析玩家数据出错:", e);
        playerData = {};
    }
    
    // 将所有玩家转换为数组
    let players = [];
    for (let [id, data] of Object.entries(playerData)) {
        players.push({
            id: id,
            name: data.name || id,
            honor: data.honor || 0,
            wins: data.wins || 0,
            losses: data.losses || 0,
            avgScore: data.gamesPlayed > 0 ? Math.round(data.totalScore / data.gamesPlayed) : 0,
            gamesPlayed: data.gamesPlayed || 0,
            highestRoll: data.highestRoll || 0
        });
    }
    
    // 按荣誉积分降序排序
    players.sort((a, b) => b.honor - a.honor);
    
    return players;
}


    // 新回合（仅单人模式）
    newRound(playerId) {
    // 修改条件：只检查是否为单人模式，不再严格检查游戏状态
    if (!this.#singlePlayerMode) {
        return [false, '仅在单人模式可用'];
    }
    
    // 检查游戏是否已结束
    if (this.#status === FarkleGame.StFinished) {
        return [false, '游戏已结束，请开始新游戏'];
    }
    
    if (playerId !== this.#currentPlayerId) {
        return [false, '不是当前玩家'];
    }
    
    // 清空骰子状态
    this.#dice = [];
    this.#selectedDice = [];
    this.#hasSelectedDiceInCurrentRoll = false;
    
    // 开始新回合
    let player = this.#players.get(playerId);
    player.resetScore(); // 确保分数重置
    player.startTurn();
    
    // 设置游戏状态为单人模式
    this.#status = FarkleGame.StSinglePlayer;
    
    return [true, '开始新回合'];
    }


    describe() {
        let s = '';
        
        if (this.#status === FarkleGame.StIdle) {
            s += '游戏未开始\n';
        } else if (this.#status === FarkleGame.StFinished) {
            if (this.#singlePlayerMode) {
                // ... existing code ...
            } else {
                s += '多人游戏已结束\n';
                
                // 按分数排序显示玩家
                let sortedPlayers = Array.from(this.#players.entries())
                    .sort((a, b) => b[1].score - a[1].score);
                
                for (let [id, player] of sortedPlayers) {
                    let honorChange = this.#honorChanges.get(id);
                    let changeText = '';
                    
                    if (honorChange !== undefined) {
                        changeText = honorChange > 0 ? ` +${honorChange}` : ` ${honorChange}`;
                    }
                    
                    s += `${player.name}: ${player.score}分 (荣誉: ${player.honor}${changeText})\n`;
                }
            }
            
            return s.trim();
        } else if (this.#singlePlayerMode) {
            s += `单人模式 | 规则${this.#ruleSet}\n`;
            s += `尝试 ${this.#currentAttempt}/${this.#attempts}\n`;
            
            // 显示之前尝试的得分
            for (let i = 0; i < this.#currentAttempt - 1; i++) {
                s += `第${i+1}次尝试: ${this.#singlePlayerScores[i] || 0}分\n`;
            }
            
            let player = this.#players.get(this.#currentPlayerId);
            s += `当前回合分数: ${player.turnScore}\n`;
            
            if (this.#dice.length > 0) {
                s += `当前骰子: [${this.#dice.join(', ')}]\n`;
            }
            
            if (this.#selectedDice.length > 0) {
                s += `已选骰子: [${this.#selectedDice.join(', ')}]\n`;
            }
        } else {
            s += `多人模式 | 目标分数: ${this.#targetScore} | 规则${this.#ruleSet}\n`;
            
            if (this.#lastRound) {
                s += `最后一轮! ${this.#players.get(this.#lastPlayer).name} 已达到目标分数\n`;
            }
            
            s += `当前玩家: ${this.#players.get(this.#currentPlayerId).name}\n`;
            
            let currentPlayer = this.#players.get(this.#currentPlayerId);
            s += `当前回合分数: ${currentPlayer.turnScore}\n`;
            
            if (this.#dice.length > 0) {
                s += `当前骰子: [${this.#dice.join(', ')}]\n`;
            }
            
            if (this.#selectedDice.length > 0) {
                s += `已选骰子: [${this.#selectedDice.join(', ')}]\n`;
            }
            
            s += '\n玩家分数:\n';
            for (let [id, player] of this.#players.entries()) {
                s += `${player.name}: ${player.score}分\n`;
            }
        }
        
        return s.trim();
    }

    calculateHonor() {
        // 清空之前的荣誉变化记录
        this.#honorChanges.clear();
        
        // 找到胜者和失败者
        let maxScore = 0;
        let winner = '';
        let totalHonorPoints = 0;
        
        // 找出最高分玩家
        for (let [id, player] of this.#players.entries()) {
            if (player.score > maxScore) {
                maxScore = player.score;
                winner = id;
            }
        }
        
        // 计算失败者失去的积分并累计
        for (let [id, player] of this.#players.entries()) {
            if (id !== winner) {
                // 计算距离目标分数的差距
                let scoreDiff = this.#targetScore - player.score;
                let lostPoints = Math.ceil(scoreDiff / 100);
                if (lostPoints <= 0) lostPoints = 1; // 至少失去1点
                
                // 记录荣誉分变化
                this.#honorChanges.set(id, -lostPoints);
                
                // 更新失败者的荣誉分和败场
                player.addHonor(-lostPoints);
                player.addLoss();
                totalHonorPoints += lostPoints;
            }
        }
        
        // 更新胜者的荣誉分和胜场
        if (winner && this.#players.has(winner)) {
            // 记录荣誉分变化
            this.#honorChanges.set(winner, totalHonorPoints);
            
            this.#players.get(winner).addHonor(totalHonorPoints);
            this.#players.get(winner).addWin();
        }
        
        return { 
            winner: winner,
            honorChanges: new Map(this.#honorChanges) // 返回一个副本以便使用
        };
    }

    getHonorInfo(playerId) {
        if (!this.#players.has(playerId)) {
            return null;
        }
        
        let player = this.#players.get(playerId);
        return {
            name: player.name,
            honor: player.honor,
            highestRoll: player.highestRoll,
            wins: player.wins,
            losses: player.losses,
            avgScore: player.avgScore,
            gamesPlayed: player.gamesPlayed
        };
    }

    // 修改玩家名字
    changeName(playerId, newName) {
        if (!newName || typeof newName !== 'string' || newName.trim() === '') {
            return [false, '名字不能为空'];
        }
    
        // 初始化玩家数据
        let playerData = {};
        try {
            let playerDataKey = 'farkle:playerData';
            let rawData = ext.storageGet(playerDataKey) || '{}';
            playerData = JSON.parse(rawData);
        } catch (e) {
            console.log("解析玩家数据出错:", e);
            playerData = {};
        }
    
        // 检查玩家是否存在于持久化数据中
        if (!playerData[playerId]) {
            return [false, '找不到玩家数据'];
        }
    
        // 修改名字
        playerData[playerId].name = newName.trim();
        
        // 如果当前游戏中存在该玩家，同时更新游戏中的名字
        if (this.#players.has(playerId)) {
            // 由于Player类的设计，我们无法直接修改名字
            // 需要创建一个新的Player对象并替换现有的
            let player = this.#players.get(playerId);
            let newPlayer = new Player(
                newName.trim(),
                player.score,
                player.honor,
                player.highestRoll,
                player.wins,
                player.losses,
                player.totalScore,
                player.gamesPlayed
            );
        
            // 如果玩家在回合中，需要保持回合状态
            if (player.inTurn) {
                newPlayer.startTurn();
                newPlayer.addTurnScore(player.turnScore);
            }
        
            this.#players.set(playerId, newPlayer);
        }
    
        // 更新持久化存储
        let playerDataKey = 'farkle:playerData';
        ext.storageSet(playerDataKey, JSON.stringify(playerData));
    
        return [true, `名字已更改为: ${newName.trim()}`];
    }

    // 添加重置方法
    reset() {
    this.#players.clear();
    this.#currentPlayerId = '';
    this.#dice = [];
    this.#selectedDice = [];
    this.#status = FarkleGame.StIdle;
    this.#lastRound = false;
    this.#lastPlayer = '';
    this.#singlePlayerMode = false;
    this.#currentAttempt = 0;
    this.#singlePlayerScores = [];
    this.#lastRollResult = [];
    }

    toJSON() {
        return {
            players: Array.from(this.#players.entries()),
            currentPlayerId: this.#currentPlayerId,
            dice: this.#dice,
            selectedDice: this.#selectedDice,
            status: this.#status,
            targetScore: this.#targetScore,
            lastRound: this.#lastRound,
            lastPlayer: this.#lastPlayer,
            singlePlayerMode: this.#singlePlayerMode,
            attempts: this.#attempts,
            currentAttempt: this.#currentAttempt,
            leaderboard: this.#leaderboard,
            lastRollResult: this.#lastRollResult,
            singlePlayerScores: this.#singlePlayerScores,
            hasSelectedDiceInCurrentRoll: this.#hasSelectedDiceInCurrentRoll, // 添加到JSON序列化
            honorChanges: Array.from(this.#honorChanges.entries()),
            ruleSet: this.#ruleSet  // 添加规则集到JSON
        }
    }
}

// 创建扩展
let ext = seal.ext.find('farkle');
if (!ext) {
    ext = seal.ext.new('farkle', 'Claude', VERSION);
    seal.ext.register(ext);
} else if (ext.version !== VERSION) {
    ext.version = VERSION;
}

// 创建配置项
seal.ext.registerIntConfig(ext, "targetScore", 5000);

// 创建主指令
const cmd = seal.ext.newCmdItemInfo();
cmd.name = 'farkle';
cmd.help = `Farkle(快艇骰子) v${VERSION} by Air
.f reset/init/新游戏 [目标分数]  开始新游戏，默认目标分数为5000
.f join/加入                    加入游戏
.f quit/退出                    退出游戏
.f start/开始                   开始游戏(至少2名玩家)
.f single/单人                  开始单人模式(1次尝试)
.f roll/投掷                    投掷骰子
.f select/选择 1,1,5            选择得分骰子(用逗号分隔)
.f bank/存分                    结束回合，保存当前得分
.f status/查看                  查看当前游戏状态
.f honor/荣誉                   查看个人荣誉积分
.f leader/荣誉排名 [页码]       查看所有玩家的荣誉积分排名
.f board/排行                   查看单人模式排行榜
.f rule/规则 [1或2]             切换游戏规则(1=原版,2=扩展规则)
.f rename/改名 新名字           修改玩家在数据库中的名字
.f help                         显示帮助信息

得分规则(原版):
- 单个1 = 100分
- 单个5 = 50分
- 三个相同数字 = 数字×100分 (三个1=1000分)
- 1-6顺子 = 1500分
- 三对 = 1500分
- 四个相同 = 1000分
- 五个相同 = 2000分
- 六个相同 = 3000分

2号规则修改版：
- 四个相同 = 三同的双倍得分
- 五个相同 = 四同的双倍得分
- 六个相同 = 五同的双倍得分
- 小顺(连续5个) = 750分
- 六不搭(六个骰子无得分组合) = 500分

荣誉系统:
- 游戏胜者获得积分，失败者失去积分
- 失去的积分 = (距离目标分数/100)分
- 胜者获得的积分 = 所有失败者失去的积分之和
`;
cmd.disabledInPrivate = true;

cmd.solve = (ctx, msg, cmdArgs) => {
    let groupKey = `farkle:${ctx.group.groupId}`;
    let playerDataKey = 'farkle:playerData'; // 全局玩家数据
    let plID = ctx.player.userId;
    let plName = ctx.player.name;
    
    // 获取目标分数配置
    let targetScore = seal.ext.getIntConfig(ext, "targetScore");
    
    // 加载玩家数据
    let playerData = {};
    try {
        playerData = JSON.parse(ext.storageGet(playerDataKey) || '{}');
    } catch (e) {
        console.log("解析玩家数据出错:", e);
    }
    
    // 创建游戏对象
    let game = new FarkleGame(ext.storageGet(groupKey), targetScore, playerData);
    let hint = `<${plName}>`;
    
    let op = cmdArgs.getArgN(1);
    switch (op) {
        case 'reset': case 'init': case '新游戏': {
            let customTarget = parseInt(cmdArgs.getArgN(2));
            if (!isNaN(customTarget) && customTarget > 0) {
                targetScore = customTarget;
            }
            // 创建新游戏，但保留玩家数据
            game = new FarkleGame('', targetScore, playerData);
            hint += `重置游戏，目标分数: ${targetScore}`;
            break;
        }
        case 'join': case '加入': {
            let [succ, errMsg] = game.addPlayer(plID, plName);
            if (succ) {
                hint += '加入游戏';
            } else {
                hint += '加入失败: ' + errMsg;
            }
            break;
        }
        case 'quit': case '退出': {
            // 先保存当前玩家的持久化数据
            let currentPlayerData = game.getPlayerPersistentData();
            
            // 然后移除玩家
            let [succ, errMsg] = game.removePlayer(plID);
            
            if (succ) {
                hint += '退出游戏';
                
                // 保存游戏状态
                ext.storageSet(groupKey, JSON.stringify(game));
                
                // 确保保存包含刚退出玩家的数据
                ext.storageSet(playerDataKey, JSON.stringify(currentPlayerData));
            } else {
                hint += '退出失败: ' + errMsg;
                
                // 正常保存游戏状态和玩家数据
                ext.storageSet(groupKey, JSON.stringify(game));
                
                // 保存玩家持久化数据
                let updatedPlayerData = game.getPlayerPersistentData();
                ext.storageSet(playerDataKey, JSON.stringify(updatedPlayerData));
            }
            
            seal.replyToSender(ctx, msg, hint);
            return seal.ext.newCmdExecuteResult(true);
        }
        case 'start': case '开始': {
            let [succ, errMsg] = game.start();
            if (succ) {
                hint += '开始游戏';
                hint += '\n' + game.describe();
            } else {
                hint += '开始失败: ' + errMsg;
            }
            break;
        }
        case 'single': case '单人': {
            let [succ, errMsg] = game.startSinglePlayer(plID, plName);
            if (succ) {
                hint += '开始单人模式';
                hint += '\n' + game.describe();
            } else {
                hint += '开始失败: ' + errMsg;
            }
            break;
        }
        case 'roll': case '投掷': {
            // 检查是否为当前玩家
            if (plID !== game.toJSON().currentPlayerId) {
                hint += '不是你的回合';
                break;
            }
            
            let [succ, errMsg] = game.roll();
            if (succ) {
                hint += '投掷骰子';
                hint += '\n' + game.describe();
            } else {
                hint += errMsg;
                hint += '\n' + game.describe();
            }
            break;
        }
        case 'select': case '选择': {
            // 检查是否为当前玩家
            if (plID !== game.toJSON().currentPlayerId) {
                hint += '不是你的回合';
                break;
            }
            
            let selection = cmdArgs.getArgN(2);
            if (!selection) {
                hint += '请指定要选择的骰子，例如 ".f select 1,1,5"';
                break;
            }
            
            let [succ, errMsg] = game.select(selection);
            if (succ) {
                hint += '选择骰子: ' + selection;
                hint += '\n' + errMsg;
                hint += '\n' + game.describe();
            } else {
                hint += '选择失败: ' + errMsg;
                hint += '\n' + game.describe();
            }
            break;
        }
        case 'bank': case '存分': {
            // 检查是否为当前玩家
            if (plID !== game.toJSON().currentPlayerId) {
                hint += '不是你的回合';
                break;
            }

            let [succ, errMsg] = game.bank();
            if (succ) {
                hint += '存储分数';
                hint += '\n' + errMsg;
                hint += '\n' + game.describe();
            } else {
                hint += '存储失败: ' + errMsg;
                hint += '\n' + game.describe();
            }
            break;
        }
        case 'rule': case '规则': {
            let ruleNum = parseInt(cmdArgs.getArgN(2));
            if (isNaN(ruleNum)) {
                // 显示当前规则
                let currentRule = game.getRuleSet();
                hint += `当前使用规则${currentRule}`;
                if (currentRule === 1) {
                    hint += " (原版规则)";
                } else {
                    hint += " (扩展规则)";
                }
            } else {
                // 切换规则
                let [succ, errMsg] = game.setRuleSet(ruleNum);
                if (succ) {
                    hint += errMsg;
                } else {
                    hint += `规则切换失败: ${errMsg}`;
                }
            }
            break;
        }
        
        case 'rename': case '改名': {
            let newName = cmdArgs.getArgN(2);
            if (!newName) {
                hint += '请指定新名字，例如 ".f rename 新名字"';
                break;
            }
            
            let [succ, errMsg] = game.changeName(plID, newName);
            if (succ) {
                hint += `名字修改成功: ${errMsg}`;
            } else {
                hint += `名字修改失败: ${errMsg}`;
            }
            break;
        }
        
        case 'status': case '查看': {
            hint = game.describe();
            
            // 添加当前规则信息
            let currentRule = game.getRuleSet();
            hint += `\n\n当前使用规则${currentRule}`;
            if (currentRule === 1) {
                hint += " (原版规则)";
            } else {
                hint += " (扩展规则)";
            }
            break;
        }
        case 'honor': case '荣誉': {
            let honorInfo = game.getHonorInfo(plID);
            if (honorInfo) {
                hint = `${honorInfo.name} 的荣誉信息:\n`;
                hint += `荣誉积分: ${honorInfo.honor}\n`;
                hint += `胜场: ${honorInfo.wins} | 败场: ${honorInfo.losses}\n`;
                hint += `参与游戏: ${honorInfo.gamesPlayed}局\n`;
                hint += `单次投掷最高分: ${honorInfo.highestRoll}`;
            } else {
                hint = '您尚未参与游戏';
            }
            break;
        }
        case 'board': case '排行': {
            let leaderboard = game.getLeaderboard();
            if (leaderboard.length === 0) {
                hint = '排行榜暂无数据';
            } else {
                hint = '单人模式排行榜:\n';
                for (let i = 0; i < leaderboard.length; i++) {
                    let date = new Date(leaderboard[i].timestamp);
                    let dateStr = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
                    hint += `${i+1}. ${leaderboard[i].name}: ${leaderboard[i].score}分 (${dateStr})\n`;
                }
            }
            break;
        }
        case 'leader': case '荣誉排名': {
            let page = parseInt(cmdArgs.getArgN(2)) || 1;
            if (page < 1) page = 1;
            
            let playerRanking = game.getHonorRanking();
            
            if (playerRanking.length === 0) {
                hint = '暂无玩家荣誉数据';
            } else {
                const pageSize = 10;
                const totalPages = Math.ceil(playerRanking.length / pageSize);
                
                if (page > totalPages) page = totalPages;
                
                const startIdx = (page - 1) * pageSize;
                const endIdx = Math.min(startIdx + pageSize, playerRanking.length);
                
                hint = `荣誉积分排行榜 (第${page}/${totalPages}页):\n`;
                
                for (let i = startIdx; i < endIdx; i++) {
                    const player = playerRanking[i];
                    hint += `${i+1}. ${player.name}: ${player.honor}分 | 战绩: ${player.wins}胜${player.losses}负`;
                    
                    // 添加一些额外信息
                    if (player.highestRoll > 0) {
                        hint += ` | 最高单掷: ${player.highestRoll}分`;
                    }
                    hint += '\n';
                }
                
                // 添加翻页提示
                if (totalPages > 1) {
                    hint += `\n使用 ".f 荣誉排名 <页码>" 查看其他页`;
                }
            }
            break;
        }        
        case 'help': default: {
            const r = seal.ext.newCmdExecuteResult(true);
            r.showHelp = true;
            return r;
        }
    }
        // 保存游戏状态和玩家数据
        ext.storageSet(groupKey, JSON.stringify(game));
    
        // 保存玩家持久化数据 - 这是关键部分
        let updatedPlayerData = game.getPlayerPersistentData();
        ext.storageSet(playerDataKey, JSON.stringify(updatedPlayerData));
        
        seal.replyToSender(ctx, msg, hint);
        return seal.ext.newCmdExecuteResult(true);
};

// 注册命令
ext.cmdMap['farkle'] = cmd;

// 注册简化指令
const cmdShort = seal.ext.newCmdItemInfo();
cmdShort.name = 'f';
cmdShort.help = cmd.help;
cmdShort.disabledInPrivate = true;
cmdShort.solve = cmd.solve;
ext.cmdMap['f'] = cmdShort;
