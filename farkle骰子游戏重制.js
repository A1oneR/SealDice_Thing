// ==UserScript==
// @name         Farkle骰子游戏 (重制)
// @author       Original: Claude, Air; Refactor & Enhance: Gemini 2.5 Pro
// @version      2.1.9
// @description  经典的Farkle骰子游戏，支持多人对战、单人模式和两种计分规则。修正投掷后需先选择的逻辑。
// @timestamp    1747902293
// @license      Apache-2.0
// @homepageURL  https://github.com/A1oneR/SealDice_Thing
// ==/UserScript==

const FARKLE_VERSION = '2.1.9'; // 版本号更新

// 游戏状态常量
const FARKLE_GAME_STATE = {
    IDLE: 0,        // 空闲，未开始
    WAITING: 1,     // 等待玩家加入 (多人)
    IN_PROGRESS: 2, // 游戏中 (多人或单人)
    CONCLUDED: 3    // 已结束（但可能未清理）
};

// 默认目标分数
const DEFAULT_TARGET_SCORE = 5000;
const DEFAULT_SINGLE_PLAYER_ATTEMPTS = 1;
const MIN_PLAYERS_MULTIPLAYER = 2;
const MAX_PLAYERS_MULTIPLAYER = 6;

class FarklePlayerOverallStats {
    constructor() {
        this.gamesPlayed = 0;
        this.wins = 0;
        this.totalScoreAcrossGames = 0;
        this.highestGameScore = 0;
        this.honorPoints = 1000;
        this.lastHonorChange = 0;
    }

    calculateHonorChange(isWinner, gameScore, targetScore, totalHonorLostByLosersForWinner = 0) {
        this.lastHonorChange = 0;
        if (isWinner) {
            let honorGained = 15;
            honorGained += Math.floor(totalHonorLostByLosersForWinner);
            if (gameScore > targetScore) {
                honorGained += Math.floor((gameScore - targetScore) / 250);
            }
            this.honorPoints += honorGained;
            this.lastHonorChange = honorGained;
            this.wins++;
        } else {
            let honorLost = 20;
            if (gameScore < targetScore) {
                honorLost += Math.ceil((targetScore - gameScore) / 250);
            }
            this.honorPoints -= honorLost;
            if (this.honorPoints < 0) this.honorPoints = 0;
            this.lastHonorChange = -honorLost;
        }
    }

    finalizeGameStats(gameScore) {
        this.gamesPlayed++;
        this.totalScoreAcrossGames += gameScore;
        if (gameScore > this.highestGameScore) {
            this.highestGameScore = gameScore;
        }
    }

    getStatsSummary() {
        let summary = `总参与(多人)场数: ${this.gamesPlayed}\n`;
        summary += `胜场数: ${this.wins} (胜率: ${this.gamesPlayed > 0 ? (this.wins / this.gamesPlayed * 100).toFixed(1) : 0}%)\n`;
        summary += `荣誉积分: ${this.honorPoints}\n`;
        summary += `单局最高分(多人): ${this.highestGameScore}\n`;
        summary += `平均每局得分(多人): ${this.gamesPlayed > 0 ? (this.totalScoreAcrossGames / this.gamesPlayed).toFixed(0) : 'N/A'}\n`;
        return summary;
    }
}

class FarklePlayerState {
    constructor(userId, userName) {
        this.userId = userId;
        this.userName = userName;
        this.gameScore = 0;
        this.turnScore = 0;
        this.diceKeptThisTurn = [];
        this.isLastRoundPlayer = false;
        this.hasSelectedSinceLastRoll = false; // ADDED: Tracks if player selected after last roll
    }

    resetForNewGameOrAttempt() {
        this.gameScore = 0;
        this.turnScore = 0;
        this.diceKeptThisTurn = [];
        this.isLastRoundPlayer = false;
        this.hasSelectedSinceLastRoll = false; // ADDED
    }

    startTurn() {
        this.turnScore = 0;
        this.diceKeptThisTurn = [];
        this.hasSelectedSinceLastRoll = false; // ADDED
    }

    addScoreToTurn(score, diceValues) {
        this.turnScore += score;
        this.diceKeptThisTurn.push(...diceValues);
        this.diceKeptThisTurn.sort((a,b)=>a-b);
    }

    bankTurnScore() {
        this.gameScore += this.turnScore;
        const banked = this.turnScore;
        this.turnScore = 0;
        return banked;
    }

    farkle() {
        this.turnScore = 0;
        // hasSelectedSinceLastRoll remains false, as the turn ends.
    }

    getDiceAvailableForRoll() {
        // This is primarily for when currentRoll is empty
        return this.diceKeptThisTurn.length >= 6 ? 6 : 6 - this.diceKeptThisTurn.length;
    }
}

class FarkleGame {
    constructor(serializedState = null) {
        if (serializedState) {
            const obj = JSON.parse(serializedState);
            this.state = obj.state;
            this.players = obj.players.map(pData => {
                const player = new FarklePlayerState(pData.userId, pData.userName);
                player.gameScore = pData.gameScore;
                player.turnScore = pData.turnScore;
                player.diceKeptThisTurn = pData.diceKeptThisTurn;
                player.isLastRoundPlayer = pData.isLastRoundPlayer;
                player.hasSelectedSinceLastRoll = pData.hasSelectedSinceLastRoll || false; // ADDED
                return player;
            });
            this.playerOrder = obj.playerOrder || [];
            this.currentTurnPlayerId = obj.currentTurnPlayerId;
            this.gameInitiatorId = obj.gameInitiatorId;
            this.targetScore = obj.targetScore || DEFAULT_TARGET_SCORE;
            this.lastActivityTime = obj.lastActivityTime || Date.now();
            this.currentRoll = obj.currentRoll || [];
            this.isLastRound = obj.isLastRound || false;
            this.playerWhoTriggeredLastRound = obj.playerWhoTriggeredLastRound || null;
            this.isSinglePlayer = obj.isSinglePlayer || false;
            this.maxAttempts = obj.maxAttempts || DEFAULT_SINGLE_PLAYER_ATTEMPTS;
            this.currentAttempt = obj.currentAttempt || 0;
            this.singlePlayerAttemptScores = obj.singlePlayerAttemptScores || [];
            this.ruleSet = obj.ruleSet || 1;
        } else {
            this.targetScore = DEFAULT_TARGET_SCORE;
            this.ruleSet = 1;
            this.reset();
        }
    }

    toJSON() {
        return {
            state: this.state,
            players: this.players.map(p => ({
                userId: p.userId,
                userName: p.userName,
                gameScore: p.gameScore,
                turnScore: p.turnScore,
                diceKeptThisTurn: p.diceKeptThisTurn,
                isLastRoundPlayer: p.isLastRoundPlayer,
                hasSelectedSinceLastRoll: p.hasSelectedSinceLastRoll, // ADDED
            })),
            playerOrder: this.playerOrder,
            currentTurnPlayerId: this.currentTurnPlayerId,
            gameInitiatorId: this.gameInitiatorId,
            targetScore: this.targetScore,
            lastActivityTime: this.lastActivityTime,
            currentRoll: this.currentRoll,
            isLastRound: this.isLastRound,
            playerWhoTriggeredLastRound: this.playerWhoTriggeredLastRound,
            isSinglePlayer: this.isSinglePlayer,
            maxAttempts: this.maxAttempts,
            currentAttempt: this.currentAttempt,
            singlePlayerAttemptScores: this.singlePlayerAttemptScores,
            ruleSet: this.ruleSet,
        };
    }

    reset() {
        this.state = FARKLE_GAME_STATE.IDLE;
        this.players = [];
        this.playerOrder = [];
        this.currentTurnPlayerId = null;
        this.gameInitiatorId = null;
        this.lastActivityTime = Date.now();
        this.currentRoll = [];
        this.isLastRound = false;
        this.playerWhoTriggeredLastRound = null;
        this.isSinglePlayer = false;
        this.maxAttempts = DEFAULT_SINGLE_PLAYER_ATTEMPTS;
        this.currentAttempt = 0;
        this.singlePlayerAttemptScores = [];
        // Note: Player state (like hasSelectedSinceLastRoll) is reset when players are added/game starts
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    addPlayer(userId, userName) {
        if (this.isSinglePlayer) return "单人游戏中无法加入新玩家。";
        if (this.state !== FARKLE_GAME_STATE.WAITING) return "游戏已开始或未初始化，无法加入。";
        if (this.players.length >= MAX_PLAYERS_MULTIPLAYER) return `人数已满（最多${MAX_PLAYERS_MULTIPLAYER}人）。`;
        if (this.players.find(p => p.userId === userId)) return "你已经加入游戏了。";
        const player = new FarklePlayerState(userId, userName);
        this.players.push(player);
        if (!this.gameInitiatorId) this.gameInitiatorId = userId;
        this.lastActivityTime = Date.now();
        return `${userName} 已加入游戏！当前人数: ${this.players.length}。`;
    }

    setRuleSet(ruleSetNumber) {
        if (this.state !== FARKLE_GAME_STATE.IDLE && this.state !== FARKLE_GAME_STATE.WAITING) {
            return "只能在游戏开始前或等待玩家时更改规则。";
        }
        if (ruleSetNumber === 1 || ruleSetNumber === 2) {
            this.ruleSet = ruleSetNumber;
            return `游戏规则已设置为: 规则 ${this.ruleSet}。`;
        }
        return `无效的规则编号。请选择 1 或 2。当前规则: ${this.ruleSet}。`;
    }

    startMultiplayerGame(initiatorId, customTargetScore) {
        if (this.state !== FARKLE_GAME_STATE.WAITING) return "游戏不在等待状态，无法开始。";
        if (this.gameInitiatorId !== initiatorId) return "只有游戏发起者才能开始游戏。";
        if (this.players.length < MIN_PLAYERS_MULTIPLAYER) return `至少需要 ${MIN_PLAYERS_MULTIPLAYER} 名玩家才能开始游戏。`;
        if (customTargetScore && !isNaN(parseInt(customTargetScore)) && parseInt(customTargetScore) > 0) {
            this.targetScore = parseInt(customTargetScore);
        }
        this.players.forEach(p => p.resetForNewGameOrAttempt()); // Resets hasSelectedSinceLastRoll too
        this.playerOrder = this._shuffle(this.players.map(p => p.userId));
        this.currentTurnPlayerId = this.playerOrder[0];
        this.state = FARKLE_GAME_STATE.IN_PROGRESS;
        this.isSinglePlayer = false;
        this.currentRoll = [];
        this.isLastRound = false;
        this.playerWhoTriggeredLastRound = null;
        const firstPlayer = this.getPlayer(this.currentTurnPlayerId);
        if (firstPlayer) firstPlayer.startTurn(); // Resets hasSelectedSinceLastRoll too
        this.lastActivityTime = Date.now();
        const currentPlayer = this.getPlayer(this.currentTurnPlayerId);
        let message = `Farkle多人游戏开始！目标分数: ${this.targetScore} (规则 ${this.ruleSet})。\n玩家顺序: ${this.playerOrder.map(uid => this.getPlayer(uid).userName).join(" -> ")}\n轮到 ${currentPlayer.userName} 行动，请【投掷】。`;
        message += this._getPlayerScoresString();
        return message;
    }

    startSinglePlayerGame(userId, userName, numAttempts) {
        if (this.state !== FARKLE_GAME_STATE.IDLE && this.state !== FARKLE_GAME_STATE.CONCLUDED) {
            return "已有游戏在进行或等待中。请先结束或等待。";
        }
        this.reset();
        this.isSinglePlayer = true;
        this.maxAttempts = (!isNaN(parseInt(numAttempts)) && parseInt(numAttempts) > 0) ? parseInt(numAttempts) : DEFAULT_SINGLE_PLAYER_ATTEMPTS;
        this.currentAttempt = 1;
        this.singlePlayerAttemptScores = [];
        const player = new FarklePlayerState(userId, userName);
        this.players = [player];
        this.currentTurnPlayerId = userId;
        this.gameInitiatorId = userId;
        this.state = FARKLE_GAME_STATE.IN_PROGRESS;
        player.startTurn(); // Resets hasSelectedSinceLastRoll
        this.lastActivityTime = Date.now();
        return `Farkle单人模式开始！玩家: ${userName}，尝试次数: ${this.maxAttempts} (规则 ${this.ruleSet})。\n第 ${this.currentAttempt} 次尝试。请【投掷】。`;
    }

    getPlayer(userId) {
        return this.players.find(p => p.userId === userId);
    }

    getCurrentPlayer() {
        if (!this.currentTurnPlayerId) return null;
        return this.getPlayer(this.currentTurnPlayerId);
    }

    _nextTurn() {
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer) return this.concludeGame("错误：找不到当前玩家。");
        if (this.isSinglePlayer) return null; // Single player handles turns differently (attempts)
        if (this.isLastRound && currentPlayer.userId === this.playerWhoTriggeredLastRound) {
            return this.concludeGame("最后一轮结束！");
        }
        const currentIndex = this.playerOrder.indexOf(this.currentTurnPlayerId);
        const nextIndex = (currentIndex + 1) % this.playerOrder.length;
        this.currentTurnPlayerId = this.playerOrder[nextIndex];
        this.currentRoll = [];
        const nextPlayer = this.getCurrentPlayer();
        if (nextPlayer) nextPlayer.startTurn(); // Resets hasSelectedSinceLastRoll
        this.lastActivityTime = Date.now();
        return null;
    }

    _isSixUnscorable(diceRoll, counts) {
        if (diceRoll.length !== 6 || this.ruleSet !== 2) return false;
        if (counts[1] > 0 || counts[5] > 0) return false;
        for (let i = 1; i <= 6; i++) if (counts[i] >= 3) return false;
        if (counts[1]>=1 && counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1 && counts[6]>=1) return false;
        let pairs = 0;
        for (let i=1; i<=6; i++) if (counts[i] === 2) pairs++;
        if (pairs === 3) return false;
        if ((counts[1]>=1 && counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1) ||
            (counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1 && counts[6]>=1)) return false;
        return true;
    }

    _calculateDiceScore(diceToScoreArray) {
        let score = 0;
        let scoredDiceValues = [];
        const initialCounts = [0,0,0,0,0,0,0];
        diceToScoreArray.forEach(d => initialCounts[d]++);
        const counts = [...initialCounts];

        if (this.ruleSet === 2 && diceToScoreArray.length === 6 && this._isSixUnscorable(diceToScoreArray, counts)) {
            return { score: 500, scoredDice: [...diceToScoreArray] };
        }
        if (this.ruleSet === 2 && diceToScoreArray.length === 5) {
            const is1to5 = counts[1]===1 && counts[2]===1 && counts[3]===1 && counts[4]===1 && counts[5]===1;
            const is2to6 = counts[2]===1 && counts[3]===1 && counts[4]===1 && counts[5]===1 && counts[6]===1;
            if (is1to5) return { score: 750, scoredDice: [1,2,3,4,5] };
            if (is2to6) return { score: 750, scoredDice: [2,3,4,5,6] };
        }
        if (diceToScoreArray.length === 6 && counts[1]===1 && counts[2]===1 && counts[3]===1 && counts[4]===1 && counts[5]===1 && counts[6]===1) {
            return { score: 1500, scoredDice: [1,2,3,4,5,6] };
        }
        if (diceToScoreArray.length === 6) {
            let pairCount = 0;
            for (let i = 1; i <= 6; i++) if (counts[i] === 2) pairCount++;
            if (pairCount === 3) return { score: 1500, scoredDice: [...diceToScoreArray] };
        }

        if (counts[1]>=1 && counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1 && counts[6]>=1) {
            score += 1500;
            [1,2,3,4,5,6].forEach(d => { counts[d]--; scoredDiceValues.push(d); });
        }
        if (this.ruleSet === 2) {
            if (counts[1]>=1 && counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1) {
                score += 750;
                [1,2,3,4,5].forEach(d => { counts[d]--; scoredDiceValues.push(d); });
            } else if (counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1 && counts[6]>=1) {
                score += 750;
                [2,3,4,5,6].forEach(d => { counts[d]--; scoredDiceValues.push(d); });
            }
        }

        for (let num = 6; num >= 3; num--) {
            for (let dieVal = 1; dieVal <= 6; dieVal++) {
                if (counts[dieVal] >= num) {
                    let currentScorePart = 0;
                    if (num === 6) currentScorePart = this.ruleSet === 2 ? (dieVal === 1 ? 8000 : dieVal * 800) : 3000;
                    else if (num === 5) currentScorePart = this.ruleSet === 2 ? (dieVal === 1 ? 4000 : dieVal * 400) : 2000;
                    else if (num === 4) currentScorePart = this.ruleSet === 2 ? (dieVal === 1 ? 2000 : (dieVal * 100) * 2) : 1000;
                    else if (num === 3) currentScorePart = dieVal === 1 ? 1000 : dieVal * 100;
                    if (currentScorePart > 0) {
                        score += currentScorePart;
                        for (let k = 0; k < num; k++) scoredDiceValues.push(dieVal);
                        counts[dieVal] -= num;
                    }
                }
            }
        }
        if (counts[1] > 0) {
            score += counts[1] * 100;
            for (let k = 0; k < counts[1]; k++) scoredDiceValues.push(1);
            counts[1] = 0;
        }
        if (counts[5] > 0) {
            score += counts[5] * 50;
            for (let k = 0; k < counts[5]; k++) scoredDiceValues.push(5);
            counts[5] = 0;
        }

        if (score > 0) {
            const finalScoredCounts = [0,0,0,0,0,0,0];
            scoredDiceValues.forEach(d => finalScoredCounts[d]++);
            let allInputAccountedFor = true;
            for (let i = 1; i <= 6; i++) {
                if (initialCounts[i] !== finalScoredCounts[i]) {
                    allInputAccountedFor = false;
                    break;
                }
            }
            let sumOfRemainingInWorkingCounts = 0;
            for(let j=1; j<=6; j++) sumOfRemainingInWorkingCounts += counts[j];
            if (!allInputAccountedFor || sumOfRemainingInWorkingCounts > 0) {
                return {score: 0, scoredDice: []};
            }
        } else {
             return {score: 0, scoredDice: []};
        }
        return { score, scoredDice: scoredDiceValues.sort((a,b)=>a-b) };
    }

    _findScoringCombinationsInRoll(roll) {
        const counts = [0,0,0,0,0,0,0];
        roll.forEach(d => counts[d]++);
        if (this.ruleSet === 2 && roll.length === 6 && this._isSixUnscorable(roll, counts)) return [{dice: roll, score: 500}];
        if (counts[1] > 0) return [{dice: [1], score: 100}];
        if (counts[5] > 0) return [{dice: [5], score: 50}];
        for (let i = 1; i <= 6; i++) {
            if (counts[i] >= 3) return [{dice: [i,i,i], score: i === 1 ? 1000 : i * 100}];
        }
        return [];
    }

    _getPlayerScoresString() {
        if (this.isSinglePlayer || this.players.length === 0 || this.state !== FARKLE_GAME_STATE.IN_PROGRESS) return "";
        let scores = "\n--- 当前分数 ---";
        const playersToDisplay = (this.playerOrder && this.playerOrder.length === this.players.length)
            ? this.playerOrder.map(uid => this.getPlayer(uid)).filter(p => p)
            : [...this.players].sort((a,b) => a.userName.localeCompare(b.userName));

        playersToDisplay.forEach(p => {
            scores += `\n${p.userName}: ${p.gameScore} 分`;
        });
        return scores;
    }

    rollDice(userId) {
        if (this.state !== FARKLE_GAME_STATE.IN_PROGRESS) return "游戏未开始。";
        const player = this.getCurrentPlayer();
        if (!player || player.userId !== userId) return "还没轮到你或出现错误。";

        // START OF MODIFIED LOGIC
        // If dice are on the table (from a previous roll in this turn's sequence)
        // AND the player has NOT YET selected anything from THOSE specific dice,
        // they cannot roll again. They must select first.
        if (this.currentRoll.length > 0 && !player.hasSelectedSinceLastRoll) {
            return `你已经投掷过: [${this.currentRoll.join(', ')}]。请先【选择】骰子计分，然后才能再次投掷桌上剩余的骰子或新的骰子。` + this._getPlayerScoresString();
        }
        // END OF MODIFIED LOGIC

        let numDiceToRoll;
        let rollSourceMessagePart = "";

        if (this.currentRoll.length > 0) {
            // This implies player.hasSelectedSinceLastRoll was true, so they are rolling remaining dice.
            numDiceToRoll = this.currentRoll.length;
            rollSourceMessagePart = `继续投掷桌上剩余的 ${numDiceToRoll} 枚骰子`;
        } else { // currentRoll is empty
            if (player.diceKeptThisTurn.length === 6) { // Hot Dice: all 6 were scored and kept
                player.diceKeptThisTurn = []; // Clear kept dice for a fresh 6
                numDiceToRoll = 6;
                rollSourceMessagePart = `获得Hot Dice！投掷全新的 6 枚骰子`;
            } else { // Not Hot Dice, but current roll was exhausted. Roll remaining needed.
                numDiceToRoll = 6 - player.diceKeptThisTurn.length;
                if (numDiceToRoll <= 0) { // Should be Hot Dice if 0, this is a fallback
                    console.warn("Farkle: numDiceToRoll <= 0 in unexpected non-HotDice path. Resetting to 6.");
                    player.diceKeptThisTurn = []; // Ensure a fresh start if logic flaw
                    numDiceToRoll = 6;
                    rollSourceMessagePart = `(异常状态) 投掷 6 枚新骰子`;
                } else {
                    rollSourceMessagePart = `投掷 ${numDiceToRoll} 枚新骰子`;
                }
            }
        }

        if (numDiceToRoll <= 0) { // Should not happen with the logic above
             return "逻辑错误：计算出的投掷骰子数为0或负数。" + this._getPlayerScoresString();
        }

        const newRolledDice = [];
        for (let i = 0; i < numDiceToRoll; i++) {
            newRolledDice.push(Math.floor(Math.random() * 6) + 1);
        }
        this.currentRoll = newRolledDice; // Update table with new dice
        player.hasSelectedSinceLastRoll = false; // Reset: these new dice haven't been selected from yet
        this.lastActivityTime = Date.now();

        let message = `${player.userName} ${rollSourceMessagePart}，结果: [${this.currentRoll.join(', ')}]\n`;
        const possibleScores = this._findScoringCombinationsInRoll(this.currentRoll);

        if (possibleScores.length === 0) { // Farkle!
            player.farkle();
            message += `💥 Farkle! 没有可得分的骰子。本回合分数清零。\n`;
            if (this.isSinglePlayer) {
                this.singlePlayerAttemptScores[this.currentAttempt - 1] = player.gameScore;
                player.resetForNewGameOrAttempt();
                if (this.currentAttempt >= this.maxAttempts) {
                    message += "所有尝试次数已用完。\n";
                    return this.concludeGame("单人游戏结束。");
                } else {
                    this.currentAttempt++;
                    player.startTurn();
                    this.currentRoll = [];
                    message += `进入第 ${this.currentAttempt} / ${this.maxAttempts} 次尝试。请【投掷】。`;
                }
            } else { // Multiplayer Farkle
                const gameEndMessage = this._nextTurn();
                if (gameEndMessage) return gameEndMessage;
                const nextPlayer = this.getCurrentPlayer();
                if (nextPlayer) {
                    message += `轮到 ${nextPlayer.userName} 行动。`;
                } else {
                    message += `错误：找不到下一位玩家。游戏可能已结束。`;
                }
            }
        } else {
            message += `请【选择 <骰子点数序列，如1,5,5>】来计分，或如果当前回合分数 > 0 且不想继续投掷，可【存分】。`;
        }
        message += this._getPlayerScoresString();
        return message;
    }

    selectDice(userId, diceString) {
        if (this.state !== FARKLE_GAME_STATE.IN_PROGRESS) return "游戏未开始。";
        const player = this.getCurrentPlayer();
        if (!player || player.userId !== userId) return "还没轮到你或出现错误。";
        if (this.currentRoll.length === 0) return "你还没有投掷骰子，请先【投掷】。" + this._getPlayerScoresString();
        const selectedValues = diceString.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 6);
        if (selectedValues.length === 0) return "无效的选择。请提供骰子点数，如: .f 选择 1,5,5" + this._getPlayerScoresString();

        let tempCurrentRollCounts = [0,0,0,0,0,0,0];
        this.currentRoll.forEach(d => tempCurrentRollCounts[d]++);
        let tempSelectedCounts = [0,0,0,0,0,0,0];
        selectedValues.forEach(d => tempSelectedCounts[d]++);
        for (let i=1; i<=6; i++) {
            if (tempSelectedCounts[i] > tempCurrentRollCounts[i]) {
                return `选择的骰子 [${selectedValues.join(', ')}] 与投掷结果 [${this.currentRoll.join(', ')}] 不符 (骰子 ${i} 数量不足)。` + this._getPlayerScoresString();
            }
        }

        const { score, scoredDice } = this._calculateDiceScore(selectedValues);
        if (score === 0 || scoredDice.length !== selectedValues.length) {
            return `选择的骰子 [${selectedValues.join(', ')}] 无法得分或包含无法计分的骰子。请重新选择。\n当前投掷: [${this.currentRoll.join(', ')}] (规则 ${this.ruleSet})` + this._getPlayerScoresString();
        }

        player.addScoreToTurn(score, scoredDice);
        let newCurrentRollAfterSelection = [...this.currentRoll];
        for (const dieValue of scoredDice) {
            const index = newCurrentRollAfterSelection.indexOf(dieValue);
            if (index > -1) {
                newCurrentRollAfterSelection.splice(index, 1);
            }
        }
        this.currentRoll = newCurrentRollAfterSelection;
        player.hasSelectedSinceLastRoll = true; // Player has now selected from the current roll
        this.lastActivityTime = Date.now();

        let message = `${player.userName} 选择了 [${scoredDice.join(', ')}]，获得 ${score} 分 (规则 ${this.ruleSet})。\n`;
        message += `本回合已累计 ${player.turnScore} 分。`;
        if (player.diceKeptThisTurn.length === 6) {
            message += `\n所有骰子均已计分 (Hot Dice)！你可以选择再次【投掷】(6枚新骰子)，或【存分】。`;
        } else if (this.currentRoll.length === 0) {
             message += `\n当前投掷的骰子均已计分！你可以用 ${6 - player.diceKeptThisTurn.length} 枚新骰子再次【投掷】，或【存分】。`;
        } else {
             message += `\n桌上剩余未计分骰子: [${this.currentRoll.join(', ')}]。你可以【投掷】这些剩余骰子，或从中【选择】更多骰子计分，或【存分】。`;
        }
        message += this._getPlayerScoresString();
        return message;
    }

    bankScore(userId) {
        if (this.state !== FARKLE_GAME_STATE.IN_PROGRESS) return "游戏未开始。";
        const player = this.getCurrentPlayer();
        if (!player || player.userId !== userId) return "还没轮到你或出现错误。";
        if (player.turnScore === 0) return "本回合没有得分，不能存分。请先【投掷】或【选择】骰子。" + this._getPlayerScoresString();

        const bankedAmount = player.bankTurnScore();
        this.lastActivityTime = Date.now();
        let message = "";

        if (this.isSinglePlayer) {
            this.singlePlayerAttemptScores[this.currentAttempt - 1] = player.gameScore;
            message = `${player.userName} 在第 ${this.currentAttempt} 次尝试中存分 ${bankedAmount}。本次尝试总分: ${player.gameScore}。\n`;
            player.resetForNewGameOrAttempt(); // Resets gameScore, turnScore, diceKept, hasSelected
            if (this.currentAttempt >= this.maxAttempts) {
                message += "所有尝试次数已用完。\n";
                return this.concludeGame("单人游戏结束。");
            } else {
                this.currentAttempt++;
                player.startTurn(); // Resets turnScore, diceKept, hasSelected
                this.currentRoll = [];
                message += `进入第 ${this.currentAttempt} / ${this.maxAttempts} 次尝试。请【投掷】。`;
            }
        } else { // Multiplayer
            message = `${player.userName} 存分 ${bankedAmount}。总分: ${player.gameScore}。\n`;
            if (!this.isLastRound && player.gameScore >= this.targetScore) {
                this.isLastRound = true;
                this.playerWhoTriggeredLastRound = player.userId;
                player.isLastRoundPlayer = true;
                message += `🎉 ${player.userName} 已达到目标分数 ${this.targetScore}！开启最后一轮！\n`;
            }
            const gameEndMessage = this._nextTurn(); // _nextTurn will call startTurn() for the next player
            if (gameEndMessage) return gameEndMessage; // Game concluded

            const nextPlayerMP = this.getCurrentPlayer();
            if (nextPlayerMP) {
                message += `轮到 ${nextPlayerMP.userName} 行动。`;
            } else {
                 message += `错误：找不到下一位玩家。游戏可能已结束。`;
            }
            message += this._getPlayerScoresString();
        }
        return message;
    }

    concludeGame(reason = "游戏结束。") {
        if (this.state !== FARKLE_GAME_STATE.IN_PROGRESS && this.state !== FARKLE_GAME_STATE.IDLE) {
            if(this.state === FARKLE_GAME_STATE.IDLE && !this.players) this.players = [];
            else if (this.state !== FARKLE_GAME_STATE.IN_PROGRESS) return "游戏未在进行中，无法结束。";
        }
        let message = reason + "\n--- 游戏结算 ---\n";
        this.state = FARKLE_GAME_STATE.CONCLUDED;
        this.lastActivityTime = Date.now();

        if (this.isSinglePlayer) {
            const player = this.players[0];
            // Ensure current attempt's score (even if Farkled out on last roll) is captured if not already banked
            if (player && this.currentAttempt > 0 && this.currentAttempt <= this.maxAttempts &&
                (this.singlePlayerAttemptScores.length < this.currentAttempt || this.singlePlayerAttemptScores[this.currentAttempt-1] === undefined)) {
                 // If gameScore is 0 (due to resetForNewGameOrAttempt after a bank),
                 // and turnScore might have been in progress before Farkle,
                 // it's better to rely on what was stored or default to 0.
                 // If concludeGame is called mid-turn without bank/farkle, gameScore is correct.
                 // If Farkle happened, turnScore is 0, gameScore is previous banked.
                 // singlePlayerAttemptScores is updated on Farkle/Bank correctly.
                 // This final check here might be redundant if Farkle/Bank always set it.
                 // For safety, if an attempt was started but not explicitly ended by Farkle/Bank, log current gameScore.
                 this.singlePlayerAttemptScores[this.currentAttempt - 1] = player.gameScore;
            }
            const validScores = this.singlePlayerAttemptScores.filter(s => typeof s === 'number');
            const bestScore = validScores.length > 0 ? Math.max(0, ...validScores) : 0;
            message += `玩家: ${player ? player.userName : '未知'}\n`;
            message += `规则: ${this.ruleSet}\n`;
            message += `尝试得分: ${this.singlePlayerAttemptScores.map((s, i) => `第${i+1}次: ${s === undefined ? '未完成' : s}`).join(' | ')}\n`;
            message += `最佳得分: ${bestScore}\n`;
            return {
                summary: message,
                isSinglePlayerResult: true,
                singlePlayerStats: player ? {
                    userId: player.userId,
                    userName: player.userName,
                    bestScore: bestScore,
                    ruleSet: this.ruleSet,
                    timestamp: Date.now()
                } : null
            };
        } else { // Multiplayer
            if (!this.players || this.players.length === 0) {
                message += "没有玩家数据可供结算。\n";
                 return { summary: message, playerStatsData: [] };
            }
            this.players.sort((a, b) => b.gameScore - a.gameScore);
            const maxScore = this.players.length > 0 ? this.players[0].gameScore : 0;
            const winners = this.players.filter(p => p.gameScore === maxScore && maxScore >=0); // maxScore >= 0 ensures actual score
            message += "最终得分和排名:\n";
            this.players.forEach((p, index) => {
                message += `第 ${index + 1} 名: ${p.userName} - ${p.gameScore} 分\n`;
            });
            if (winners.length > 0 && maxScore > 0) { // Only declare winners if score > 0
                message += `\n获胜者是: ${winners.map(w => w.userName).join(', ')}！恭喜！\n`;
            } else if (this.players.every(p => p.gameScore === 0)) { // All players 0 score
                message += "\n所有玩家均为0分，平局！\n";
            } else if (winners.length > 0 && maxScore === 0 && !this.players.every(p=>p.gameScore===0)) {
                // This case: highest score is 0, but not everyone is 0. Should be rare if game progresses.
                message += `\n最高分为0。获胜者: ${winners.map(w => w.userName).join(', ')} (0分胜出)。\n`;
            }
            else { // No winners (e.g., aborted game before anyone scored meaningfully)
                message += "\n游戏结束，无明确获胜者或所有玩家得分过低。\n";
            }
            return {
                summary: message,
                isSinglePlayerResult: false,
                playerStatsData: this.players.map(p => ({
                    userId: p.userId,
                    userName: p.userName,
                    score: p.gameScore,
                    rank: this.players.findIndex(pl => pl.userId === p.userId) + 1,
                    isWinner: winners.some(w => w.userId === p.userId && maxScore > 0) // Winner only if maxScore > 0
                }))
            };
        }
    }

    getGameStatus() {
        if (this.state === FARKLE_GAME_STATE.IDLE) return "当前没有Farkle游戏。";
        if (this.state === FARKLE_GAME_STATE.WAITING) {
            return `Farkle游戏等待开始，发起人: ${this.getPlayer(this.gameInitiatorId)?.userName || '未知'}。\n目标分数: ${this.targetScore} (规则 ${this.ruleSet})\n已加入玩家 (${this.players.length}/${MAX_PLAYERS_MULTIPLAYER}): ${this.players.map(p => p.userName).join(', ')}\n请发起人输入【.f 开始 [可选目标分数]】以开始游戏。或使用【.f 规则 [1|2]】修改规则。`;
        }
        if (this.state === FARKLE_GAME_STATE.CONCLUDED) return "游戏已结束。使用【.f 发起】或【.f 单人】开始新游戏。";

        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer) return "错误：当前无玩家。游戏状态异常。";

        let status = "";
        if (this.isSinglePlayer) {
            status = `--- Farkle单人模式 (规则 ${this.ruleSet}) ---\n`;
            status += `玩家: ${currentPlayer.userName} | 第 ${this.currentAttempt}/${this.maxAttempts} 次尝试\n`;
            status += `本次尝试已累计: ${currentPlayer.gameScore} (回合内: ${currentPlayer.turnScore})\n`;
             if (this.singlePlayerAttemptScores.length > 0 && this.currentAttempt > 1) {
                status += `先前尝试得分: ${this.singlePlayerAttemptScores.slice(0, this.currentAttempt -1).map((s, i) => `T${i+1}:${s === undefined ? '未完成' : s}`).join(' ')}\n`;
            }
        } else { // Multiplayer
            status = `--- Farkle进行中 (目标: ${this.targetScore}, 规则 ${this.ruleSet}) ---\n`;
            status += `当前回合: ${currentPlayer.userName} (总分: ${currentPlayer.gameScore}, 本轮已累计: ${currentPlayer.turnScore})\n`;
            if (this.isLastRound) {
                status += `注意: 这是最后一轮！ (由 ${this.getPlayer(this.playerWhoTriggeredLastRound)?.userName || '未知'} 触发)\n`;
            }
        }

        if (currentPlayer.diceKeptThisTurn.length > 0) {
            status += `本轮已计分骰子: [${currentPlayer.diceKeptThisTurn.join(', ')}]\n`;
        }

        if (this.currentRoll.length > 0) {
            status += `当前投掷结果: [${this.currentRoll.join(', ')}]\n`;
            if (currentPlayer.hasSelectedSinceLastRoll) {
                status += `你已从本次投掷中选择过。可再次【选择】更多骰子，【投掷】剩余骰子，或【存分】。\n`;
            } else {
                status += `请【选择 <骰子序列>】计分。或若本轮得分>0且不想继续，可【存分】。\n`;
            }
        } else { // No dice on table (currentRoll is empty)
            status += `请【投掷】骰子。\n`;
        }
        status += this._getPlayerScoresString();
        return status;
    }
}

// --- SealDice Extension Setup ---
let farkleExt = seal.ext.find('Farkle骰子');
if (!farkleExt) {
    farkleExt = seal.ext.new('Farkle骰子', 'Gemini 2.5 Pro (Refactor & Enhance)', FARKLE_VERSION);
    seal.ext.register(farkleExt);
} else {
    farkleExt.version = FARKLE_VERSION;
    farkleExt.author = 'Original: Claude, Air; Refactor & Enhance: Gemini 2.5 Pro';
    // Ensure author and version are updated on reload if script changes
}

const SP_LEADERBOARD_KEY = 'farkle_sp_leaderboard';
const MAX_SP_LEADERBOARD_ENTRIES = 10;

function getSinglePlayerLeaderboard() {
    const stored = farkleExt.storageGet(SP_LEADERBOARD_KEY);
    return stored ? JSON.parse(stored) : [];
}
function updateSinglePlayerLeaderboard(entry) {
    if (!entry || typeof entry.bestScore !== 'number') return;
    let leaderboard = getSinglePlayerLeaderboard();
    leaderboard.push(entry);
    // Sort by bestScore descending, then by timestamp ascending (earlier record of same score is better)
    leaderboard.sort((a, b) => b.bestScore - a.bestScore || a.timestamp - b.timestamp);
    if (leaderboard.length > MAX_SP_LEADERBOARD_ENTRIES) {
        leaderboard = leaderboard.slice(0, MAX_SP_LEADERBOARD_ENTRIES);
    }
    farkleExt.storageSet(SP_LEADERBOARD_KEY, JSON.stringify(leaderboard));
}

const cmdFarkle = seal.ext.newCmdItemInfo();
cmdFarkle.name = 'farkle';
cmdFarkle.aliases = ['fk', '快艇骰子'];
cmdFarkle.help = `Farkle骰子游戏 v${FARKLE_VERSION} (指令: .farkle 或 .f)
指令 (中/英文):
.f 发起 (init/new) [目标分数]   - 发起新多人游戏 (默认目标 ${DEFAULT_TARGET_SCORE})
.f 加入 (join)              - 加入等待中的多人游戏
.f 开始 (start) [目标分数]   - 由发起人开始多人游戏
.f 单人 (single) [尝试次数] - 开始单人挑战模式 (默认 ${DEFAULT_SINGLE_PLAYER_ATTEMPTS} 次)
.f 投掷 (roll)              - 轮到你时，投掷骰子。
                            (若桌上有骰子，需先【选择】过才能再次投掷剩余的)
.f 选择 (select) <骰子序列>  - 选择骰子计分，如: .f 选择 1,5,5
.f 存分 (bank)              - 结束你的回合，存分
.f 状态 (status)            - 查看当前游戏状态
.f 结束 (end/abort)         - 由发起人/管理员强制结束当前游戏
.f 战绩 (stats/honor) [@某人]- 查看自己或@提及玩家的多人游戏总体战绩
.f 规则 (rule/rules) [1|2] - 查看/设置游戏规则 (1=原版, 2=扩展。需在游戏开始前设置)
.f 排行 (board/leaderboard) - 查看单人模式高分排行榜
.f 帮助 (help)              - 显示此帮助信息

计分规则 (规则1 - 原版):
- 单个 1=100, 单个 5=50
- 三个1=1000, 三个X (X≠1)=X*100
- 四个相同=1000, 五个相同=2000, 六个相同=3000
- 1-6顺子=1500, 三对=1500

计分规则 (规则2 - 扩展):
- 单个 1=100, 单个 5=50
- 三个1=1000, 三个X (X≠1)=X*100
- 四个相同: 三个1的x2 (2000分), 三个X的x2 (X*200分)
- 五个相同: 四个1的x2 (4000分), 四个X的x2 (X*400分)
- 六个相同: 五个1的x2 (8000分), 六个X的x2 (X*800分)
- 小顺子 (1-5 或 2-6)=750 (需5枚骰子)
- 1-6顺子=1500, 三对=1500
- 六不搭 (6枚骰子均无标准得分组合)=500

Farkle: 当次投掷无任何可计分骰子，本回合累计分数清零，回合结束。
Hot Dice: 如果一轮投掷中，所有6枚骰子都参与了计分，玩家可以选择用全部6枚骰子重新投掷，并继续累积当前回合的分数。
`;
cmdFarkle.disabledInPrivate = true; // Farkle is a group game
cmdFarkle.allowDelegate = true;

cmdFarkle.solve = (ctx, msg, cmdArgs) => {
    const groupCtxKey = `farkle_game:${ctx.group.groupId}`;
    let gameJson = farkleExt.storageGet(groupCtxKey);
    let game = new FarkleGame(gameJson); // Always create a game object

    const subCmdRaw = cmdArgs.getArgN(1);
    if (!subCmdRaw) {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }
    const subCmd = subCmdRaw.toLowerCase();
    const playerIdentity = { id: ctx.player.userId, name: ctx.player.name }; // Use a consistent object
    let reply = "";

    // Timeout check
    if (game.state !== FARKLE_GAME_STATE.IDLE && game.state !== FARKLE_GAME_STATE.CONCLUDED &&
        (Date.now() - game.lastActivityTime > 30 * 60 * 1000)) { // 30 minutes timeout
        if (game.state === FARKLE_GAME_STATE.IN_PROGRESS || game.state === FARKLE_GAME_STATE.WAITING) {
            let conclusion = game.concludeGame("游戏超时自动结束。");
            let honorReplyPart = "";

            if (conclusion.isSinglePlayerResult && conclusion.singlePlayerStats) {
                updateSinglePlayerLeaderboard(conclusion.singlePlayerStats);
            } else if (!conclusion.isSinglePlayerResult && conclusion.playerStatsData && conclusion.playerStatsData.length > 0) {
                let totalHonorLostByLosersNet_value = 0;
                let actualLoserObjects = [];

                conclusion.playerStatsData.filter(p => !p.isWinner).forEach(loserData => {
                    const statsKey = `farkle_stats_mp:${loserData.userId}`;
                    let playerStats = new FarklePlayerOverallStats();
                    const storedStats = farkleExt.storageGet(statsKey);
                    if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                    playerStats.calculateHonorChange(false, loserData.score, game.targetScore);
                    totalHonorLostByLosersNet_value += playerStats.lastHonorChange; // This is negative
                    actualLoserObjects.push({ data: loserData, stats: playerStats });
                });

                const collectedPortionBase = Math.abs(totalHonorLostByLosersNet_value) * 0.20; // 20% of total lost
                const winnersData = conclusion.playerStatsData.filter(p => p.isWinner);

                winnersData.forEach(winnerData => {
                    const statsKey = `farkle_stats_mp:${winnerData.userId}`;
                    let playerStats = new FarklePlayerOverallStats();
                    const storedStats = farkleExt.storageGet(statsKey);
                    if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                    const collectedForThisWinner = winnersData.length > 0 ? collectedPortionBase / winnersData.length : 0;
                    playerStats.calculateHonorChange(true, winnerData.score, game.targetScore, collectedForThisWinner);
                    winnerData.updatedStatsInstance = playerStats; // Store instance for saving
                });

                conclusion.playerStatsData.forEach(pData => {
                    const statsKey = `farkle_stats_mp:${pData.userId}`;
                    let playerStatsToSave;
                    let finalHonorChangeThisGame;

                    if (pData.isWinner) {
                        const winnerObj = winnersData.find(w => w.userId === pData.userId);
                        playerStatsToSave = winnerObj.updatedStatsInstance;
                        finalHonorChangeThisGame = playerStatsToSave.lastHonorChange;
                    } else {
                        const loserObj = actualLoserObjects.find(l => l.data.userId === pData.userId);
                        playerStatsToSave = loserObj.stats;
                        finalHonorChangeThisGame = playerStatsToSave.lastHonorChange;
                    }
                    playerStatsToSave.finalizeGameStats(pData.score);
                    farkleExt.storageSet(statsKey, JSON.stringify(playerStatsToSave));
                    honorReplyPart += `\n${pData.userName}: ${finalHonorChangeThisGame >= 0 ? '+' : ''}${finalHonorChangeThisGame}荣誉 (现 ${playerStatsToSave.honorPoints})`;
                });
                 if (honorReplyPart) {
                    conclusion.summary += "\n--- 荣誉结算 ---" + honorReplyPart;
                }
            }
            reply = conclusion.summary;
            // Game state is now CONCLUDED, save it
            farkleExt.storageSet(groupCtxKey, JSON.stringify(game.toJSON()));
            seal.replyToSender(ctx, msg, reply);
            return seal.ext.newCmdExecuteResult(true);
        }
    }

    // Main command switch
    switch (subCmd) {
        case '发起': case 'init': case 'new':
            if (game.state !== FARKLE_GAME_STATE.IDLE && game.state !== FARKLE_GAME_STATE.CONCLUDED) {
                reply = "当前群组已有一局Farkle游戏。请先【结束】或等待其结束。";
            } else {
                const customTargetScore = parseInt(cmdArgs.getArgN(2));
                game.reset(); // Reset game object for a new game
                if (!isNaN(customTargetScore) && customTargetScore > 0) {
                    game.targetScore = customTargetScore;
                } else {
                    game.targetScore = DEFAULT_TARGET_SCORE;
                }
                game.state = FARKLE_GAME_STATE.WAITING;
                reply = game.addPlayer(playerIdentity.id, playerIdentity.name); // Add initiator
                reply += `\n${playerIdentity.name} 发起了Farkle多人游戏！目标分数: ${game.targetScore} (规则 ${game.ruleSet})。\n其他玩家请输入【.f 加入 (join)】参与。使用【.f 规则 (rule) [1|2]】可在开始前修改规则。`;
            }
            break;
        case '加入': case 'join':
            reply = game.addPlayer(playerIdentity.id, playerIdentity.name);
            break;
        case '开始': case 'start':
            if (game.isSinglePlayer) { // Should not happen if game started as single
                reply = "单人游戏已开始或无法用此命令开始。请使用 .f 单人 (single)";
            } else {
                const gameStartTargetScore = cmdArgs.getArgN(2); // Optional target score override at start
                reply = game.startMultiplayerGame(playerIdentity.id, gameStartTargetScore);
            }
            break;
        case '单人': case 'single':
            if (game.state !== FARKLE_GAME_STATE.IDLE && game.state !== FARKLE_GAME_STATE.CONCLUDED) {
                 reply = "当前群组已有一局Farkle游戏。请先【结束】或等待其结束。";
            } else {
                const attemptsArg = cmdArgs.getArgN(2);
                game.reset(); // Reset for single player
                reply = game.startSinglePlayerGame(playerIdentity.id, playerIdentity.name, attemptsArg);
            }
            break;
        case '投掷': case 'roll':
            reply = game.rollDice(playerIdentity.id);
             if (typeof reply === 'object' && reply.summary) { // Game ended (e.g. Farkle on last attempt)
                // Honor/Leaderboard logic handled by the shared block below
            }
            break;
        case '选择': case 'select':
            const diceToSelect = cmdArgs.getArgN(2);
            if (!diceToSelect) {
                reply = "请指定要选择的骰子点数，用逗号分隔，如: .f 选择 1,5,5";
            } else {
                reply = game.selectDice(playerIdentity.id, diceToSelect);
            }
            break;
        case '存分': case 'bank':
            reply = game.bankScore(playerIdentity.id);
            if (typeof reply === 'object' && reply.summary) { // Game ended
                // Honor/Leaderboard logic handled by the shared block below
            }
            break;
        case '状态': case 'status':
            reply = game.getGameStatus();
            break;
        case '结束': case 'end': case 'abort':
            if (game.state === FARKLE_GAME_STATE.IDLE || game.state === FARKLE_GAME_STATE.CONCLUDED) {
                reply = "没有正在进行或等待中的游戏可以结束。";
            } else if (game.gameInitiatorId === playerIdentity.id || ctx.privilegeLevel >= 100) { // Privilege 100 = Admin
                const conclusion = game.concludeGame(`${playerIdentity.name} 强制结束了游戏。`);
                reply = conclusion; // Pass the object to the shared handler
            } else {
                reply = "只有游戏发起者或管理员才能强制结束游戏。";
            }
            break;
        case '战绩': case 'stats': case 'honor':
            {
                let targetPlayerIdToQuery = playerIdentity.id;
                let targetPlayerNameToQuery = playerIdentity.name;
                // Check for @mention. cmdArgs.getArgN(2) would be the @mention string itself.
                // seal.getCtxProxyFirst is better for getting the user from mention.
                const mentionedPlayerCtx = seal.getCtxProxyFirst(ctx, cmdArgs);
                if (mentionedPlayerCtx && cmdArgs.getArgN(2) && cmdArgs.getArgN(2).startsWith('@')) {
                     targetPlayerIdToQuery = mentionedPlayerCtx.player.userId;
                     targetPlayerNameToQuery = mentionedPlayerCtx.player.name;
                }

                const statsKey = `farkle_stats_mp:${targetPlayerIdToQuery}`;
                const storedStats = farkleExt.storageGet(statsKey);
                if (storedStats) {
                    const playerStats = new FarklePlayerOverallStats();
                    Object.assign(playerStats, JSON.parse(storedStats)); // Populate from stored
                    reply = `${targetPlayerNameToQuery} 的Farkle多人游戏战绩:\n` + playerStats.getStatsSummary();
                } else {
                    reply = `${targetPlayerNameToQuery} 暂无Farkle多人游戏战绩记录。`;
                }
            }
            break;
        case '规则': case 'rule': case 'rules':
            const ruleArg = cmdArgs.getArgN(2);
            if (!ruleArg) { // Display current rule details
                reply = `当前游戏规则: 规则 ${game.ruleSet}。\n`;
                const ruleHelpMatch = cmdFarkle.help.match(new RegExp(`计分规则 \\(规则 ${game.ruleSet}[^]*?(?=计分规则 \\(规则|Farkle:|Hot Dice:|$)`));
                if (ruleHelpMatch) {
                    reply += "\n" + ruleHelpMatch[0].trim();
                } else {
                     reply += "\n无法找到当前规则的详细描述。输入 .f 帮助 查看完整规则。";
                }
            } else { // Attempt to set rule
                const ruleNum = parseInt(ruleArg);
                if (!isNaN(ruleNum)) {
                    reply = game.setRuleSet(ruleNum); // This returns a message
                } else {
                    reply = `无效的规则编号。请输入 1 或 2。当前规则: ${game.ruleSet}。`;
                }
            }
            break;
        case '排行': case 'board': case 'leaderboard':
             {
                const leaderboard = getSinglePlayerLeaderboard();
                if (leaderboard.length === 0) {
                    reply = "单人模式高分榜暂无数据。";
                } else {
                    reply = "--- Farkle 单人模式高分榜 (Top 10) ---\n";
                    leaderboard.forEach((entry, index) => {
                        const date = new Date(entry.timestamp);
                        const dateStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
                        reply += `${index+1}. ${entry.userName}: ${entry.bestScore}分 (规则 ${entry.ruleSet || '未知'}, ${dateStr})\n`;
                    });
                }
            }
            break;
        case '帮助': case 'help':
             const hret = seal.ext.newCmdExecuteResult(true);
            hret.showHelp = true;
            return hret; // Return immediately, no further processing
        default:
            reply = `未知指令: ${subCmd}。输入 .f 帮助 查看可用指令。`;
            break;
    }

    // Shared handler for replies that might be game conclusion objects
    if (typeof reply === 'object' && reply !== null && reply.summary) {
        let conclusion = reply; // It's already a conclusion object
        let honorReplyPart = "";

        if (conclusion.isSinglePlayerResult && conclusion.singlePlayerStats) {
            updateSinglePlayerLeaderboard(conclusion.singlePlayerStats);
        } else if (!conclusion.isSinglePlayerResult && conclusion.playerStatsData && conclusion.playerStatsData.length > 0) {
            let totalHonorLostByLosersNet_value = 0;
            let actualLoserObjects = [];

            conclusion.playerStatsData.filter(p => !p.isWinner).forEach(loserData => {
                const statsKey = `farkle_stats_mp:${loserData.userId}`;
                let playerStats = new FarklePlayerOverallStats();
                const storedStats = farkleExt.storageGet(statsKey);
                if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));

                // For aborted games, subCmd 'end'/'abort' means 'conclusion' might not have winners
                // So, calculateHonorChange might treat everyone as loser if no one isWinner
                // If it was a natural end, isWinner is set correctly.
                let isActualWinner = conclusion.playerStatsData.find(p => p.userId === loserData.userId)?.isWinner || false;
                if(subCmd === '结束' || subCmd === 'end' || subCmd === 'abort') isActualWinner = false; // Force non-winner for honor calc on abort

                playerStats.calculateHonorChange(isActualWinner, loserData.score, game.targetScore);
                totalHonorLostByLosersNet_value += playerStats.lastHonorChange;
                actualLoserObjects.push({ data: loserData, stats: playerStats });
            });

            const collectedPortionBase = Math.abs(totalHonorLostByLosersNet_value) * 0.20;
            const winnersData = conclusion.playerStatsData.filter(p => p.isWinner); // Relies on isWinner from concludeGame

            winnersData.forEach(winnerData => { // This loop only runs if there are actual winners
                const statsKey = `farkle_stats_mp:${winnerData.userId}`;
                let playerStats = new FarklePlayerOverallStats();
                const storedStats = farkleExt.storageGet(statsKey);
                if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                const collectedForThisWinner = winnersData.length > 0 ? collectedPortionBase / winnersData.length : 0;
                playerStats.calculateHonorChange(true, winnerData.score, game.targetScore, collectedForThisWinner);
                winnerData.updatedStatsInstance = playerStats;
            });

            conclusion.playerStatsData.forEach(pData => {
                const statsKey = `farkle_stats_mp:${pData.userId}`;
                let playerStatsToSave;
                let finalHonorChangeThisGame;

                if (pData.isWinner && !(subCmd === '结束' || subCmd === 'end' || subCmd === 'abort')) { // No winners for honor gain on abort
                    const winnerObj = winnersData.find(w => w.userId === pData.userId);
                    playerStatsToSave = winnerObj.updatedStatsInstance;
                } else {
                    const loserObj = actualLoserObjects.find(l => l.data.userId === pData.userId);
                    playerStatsToSave = loserObj.stats;
                }
                finalHonorChangeThisGame = playerStatsToSave.lastHonorChange;
                playerStatsToSave.finalizeGameStats(pData.score);
                farkleExt.storageSet(statsKey, JSON.stringify(playerStatsToSave));
                honorReplyPart += `\n${pData.userName}: ${finalHonorChangeThisGame >= 0 ? '+' : ''}${finalHonorChangeThisGame}荣誉 (现 ${playerStatsToSave.honorPoints})`;
            });
            if (honorReplyPart) {
                 conclusion.summary += (subCmd === '结束' || subCmd === 'end' || subCmd === 'abort' ? "\n--- 荣誉结算 (游戏中止) ---" : "\n--- 荣誉结算 ---") + honorReplyPart;
            }
        }
        reply = conclusion.summary; // Convert back to string for sending
    }


    // Save game state and reply
    if (reply) { // Ensure reply is not empty or null
        // Only save if game state might have changed meaningfully
        // Avoid saving for read-only commands like 'status', '战绩', '排行', '规则' (when just viewing)
        const writeCommands = /^(发起|init|new|加入|join|开始|start|单人|single|投掷|roll|选择|select|存分|bank|结束|end|abort)$/;
        const ruleSetCommand = /^(规则|rule|rules)$/;
        if (writeCommands.test(subCmd) || (ruleSetCommand.test(subCmd) && cmdArgs.getArgN(2))) { // Rule set command with arg changes state
            farkleExt.storageSet(groupCtxKey, JSON.stringify(game.toJSON()));
        }
        seal.replyToSender(ctx, msg, reply);
    }
    return seal.ext.newCmdExecuteResult(true);
};

farkleExt.cmdMap['farkle'] = cmdFarkle;

// Shortcut command '.f'
const cmdFarkleShort = seal.ext.newCmdItemInfo();
cmdFarkleShort.name = 'f';
cmdFarkleShort.help = cmdFarkle.help; // Share help text
cmdFarkleShort.disabledInPrivate = cmdFarkle.disabledInPrivate;
cmdFarkleShort.allowDelegate = cmdFarkle.allowDelegate;
cmdFarkleShort.solve = cmdFarkle.solve; // Share the same solver logic
farkleExt.cmdMap['f'] = cmdFarkleShort;