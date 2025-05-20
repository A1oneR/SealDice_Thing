// ==UserScript==
// @name         Farkle骰子游戏 (重制)
// @author       Original: Claude, Air; Refactor & Enhance: Gemini 2.5 Pro
// @version      2.1.5
// @description  经典的Farkle骰子游戏，支持多人对战、单人模式和两种计分规则。
// @timestamp    1747731186
// @license      Apache-2.0
// @homepageURL  https://github.com/A1oneR/SealDice_Thing
// ==/UserScript==

const FARKLE_VERSION = '2.1.5'; // 版本号更新

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
    }

    resetForNewGameOrAttempt() {
        this.gameScore = 0;
        this.turnScore = 0;
        this.diceKeptThisTurn = [];
        this.isLastRoundPlayer = false;
    }

    startTurn() {
        this.turnScore = 0;
        this.diceKeptThisTurn = [];
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
    }

    getDiceAvailableForRoll() {
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
                isLastRoundPlayer: p.isLastRoundPlayer
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
        this.players.forEach(p => p.resetForNewGameOrAttempt());
        this.playerOrder = this._shuffle(this.players.map(p => p.userId));
        this.currentTurnPlayerId = this.playerOrder[0];
        this.state = FARKLE_GAME_STATE.IN_PROGRESS;
        this.isSinglePlayer = false;
        this.currentRoll = [];
        this.isLastRound = false;
        this.playerWhoTriggeredLastRound = null;
        const firstPlayer = this.players.find(p => p.userId === this.currentTurnPlayerId);
        if (firstPlayer) firstPlayer.startTurn();
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
        player.startTurn();
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
        if (this.isSinglePlayer) return null;
        if (this.isLastRound && currentPlayer.userId === this.playerWhoTriggeredLastRound) {
            return this.concludeGame("最后一轮结束！");
        }
        const currentIndex = this.playerOrder.indexOf(this.currentTurnPlayerId);
        const nextIndex = (currentIndex + 1) % this.playerOrder.length;
        this.currentTurnPlayerId = this.playerOrder[nextIndex];
        this.currentRoll = [];
        const nextPlayer = this.getCurrentPlayer();
        if (nextPlayer) nextPlayer.startTurn();
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

        // Attempt to extract high-value, multi-dice combinations first
        // Try for 1-6 straight from available dice
        if (counts[1]>=1 && counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1 && counts[6]>=1) {
            score += 1500;
            [1,2,3,4,5,6].forEach(d => { counts[d]--; scoredDiceValues.push(d); });
        }
        // Try for rule 2 small straights from REMAINING dice
        if (this.ruleSet === 2) {
            if (counts[1]>=1 && counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1) { // Check 1-5
                score += 750;
                [1,2,3,4,5].forEach(d => { counts[d]--; scoredDiceValues.push(d); });
            } else if (counts[2]>=1 && counts[3]>=1 && counts[4]>=1 && counts[5]>=1 && counts[6]>=1) { // Check 2-6 if 1-5 failed
                score += 750;
                [2,3,4,5,6].forEach(d => { counts[d]--; scoredDiceValues.push(d); });
            }
        }
        // Try for three pairs from REMAINING dice (if 6 dice are left and form 3 pairs)
        // This is tricky if straights were already removed. Usually three pairs is an "all or nothing" for the initial 6 dice.
        // For simplicity, the "all or nothing" check at the start is better for three pairs.
        // If we are here, it means the initial dice didn't form a perfect three pair or straight.

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
        let numDiceToRoll;
        let isContinuationRoll = false;
        if (this.currentRoll.length > 0) {
            numDiceToRoll = this.currentRoll.length;
            isContinuationRoll = true;
        } else if (player.diceKeptThisTurn.length === 6) {
            player.diceKeptThisTurn = [];
            numDiceToRoll = 6;
        } else {
            numDiceToRoll = 6 - player.diceKeptThisTurn.length;
             if (numDiceToRoll <= 0) numDiceToRoll = 6;
        }
        if (numDiceToRoll <= 0 && player.diceKeptThisTurn.length === 6 && !isContinuationRoll) {
             player.diceKeptThisTurn = [];
             numDiceToRoll = 6;
        } else if (numDiceToRoll <= 0) {
             return "没有骰子可投掷。可能所有骰子都已计分，请【存分】或进行下一步。" + this._getPlayerScoresString();
        }
        let rollSourceMessage = "";
        if (isContinuationRoll) {
            rollSourceMessage = `继续投掷桌上剩余的 ${numDiceToRoll} 枚骰子`;
        } else {
            rollSourceMessage = `投掷 ${numDiceToRoll} 枚骰子`;
        }
        const newRolledDice = [];
        for (let i = 0; i < numDiceToRoll; i++) {
            newRolledDice.push(Math.floor(Math.random() * 6) + 1);
        }
        this.currentRoll = newRolledDice;
        this.lastActivityTime = Date.now();
        let message = `${player.userName} ${rollSourceMessage}，结果: [${this.currentRoll.join(', ')}]\n`;
        const possibleScores = this._findScoringCombinationsInRoll(this.currentRoll);
        if (possibleScores.length === 0) {
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
            } else {
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
        this.lastActivityTime = Date.now();
        let message = `${player.userName} 选择了 [${scoredDice.join(', ')}]，获得 ${score} 分 (规则 ${this.ruleSet})。\n`;
        message += `本回合已累计 ${player.turnScore} 分。`;
        if (player.diceKeptThisTurn.length === 6) {
            message += `\n所有骰子均已计分 (Hot Dice)！你可以选择再次【投掷】(6枚新骰子)，或【存分】。`;
        } else if (this.currentRoll.length === 0) {
             message += `\n当前投掷的骰子均已计分！你可以用 ${6-player.diceKeptThisTurn.length} 枚新骰子再次【投掷】，或【存分】。`;
        } else {
             message += `\n桌上剩余未计分骰子: [${this.currentRoll.join(', ')}]。你可以用这 ${this.currentRoll.length} 枚骰子再次【投掷】，或从中【选择】更多骰子计分，或【存分】。`;
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
        } else {
            message = `${player.userName} 存分 ${bankedAmount}。总分: ${player.gameScore}。\n`;
            if (!this.isLastRound && player.gameScore >= this.targetScore) {
                this.isLastRound = true;
                this.playerWhoTriggeredLastRound = player.userId;
                player.isLastRoundPlayer = true;
                message += `🎉 ${player.userName} 已达到目标分数 ${this.targetScore}！开启最后一轮！\n`;
            }
            const gameEndMessage = this._nextTurn();
            if (gameEndMessage) return gameEndMessage;
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
            if (player && this.currentAttempt > 0 && this.currentAttempt <= this.maxAttempts &&
                (this.singlePlayerAttemptScores.length < this.currentAttempt || this.singlePlayerAttemptScores[this.currentAttempt-1] === undefined)) {
                 this.singlePlayerAttemptScores[this.currentAttempt - 1] = player.gameScore > 0 ? player.gameScore : (player.turnScore > 0 ? player.turnScore : 0) ;
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
        } else {
            if (!this.players || this.players.length === 0) {
                message += "没有玩家数据可供结算。\n";
                 return { summary: message, playerStatsData: [] };
            }
            this.players.sort((a, b) => b.gameScore - a.gameScore);
            const maxScore = this.players.length > 0 ? this.players[0].gameScore : 0;
            const winners = this.players.filter(p => p.gameScore === maxScore && maxScore >=0);
            message += "最终得分和排名:\n";
            this.players.forEach((p, index) => {
                message += `第 ${index + 1} 名: ${p.userName} - ${p.gameScore} 分\n`;
            });
            if (winners.length > 0 && maxScore > 0) {
                message += `\n获胜者是: ${winners.map(w => w.userName).join(', ')}！恭喜！\n`;
            } else if (winners.length > 0 && maxScore === 0 && this.players.every(p => p.gameScore === 0)) {
                message += "\n所有玩家均为0分，平局！\n";
            } else {
                message += "\n没有玩家得分，或无人获胜。\n";
            }
            return {
                summary: message,
                isSinglePlayerResult: false,
                playerStatsData: this.players.map(p => ({
                    userId: p.userId,
                    userName: p.userName,
                    score: p.gameScore,
                    rank: this.players.findIndex(pl => pl.userId === p.userId) + 1,
                    isWinner: winners.some(w => w.userId === p.userId)
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
        } else {
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
            status += `请【选择 <骰子序列>】或【存分】(若本轮得分>0)。\n`;
        } else {
            status += `请【投掷】骰子。\n`;
        }
        status += this._getPlayerScoresString();
        return status;
    }
}

let farkleExt = seal.ext.find('Farkle骰子');
if (!farkleExt) {
    farkleExt = seal.ext.new('Farkle骰子', 'Gemini 2.5 Pro (Refactor & Enhance)', FARKLE_VERSION);
    seal.ext.register(farkleExt);
} else {
    farkleExt.version = FARKLE_VERSION;
    farkleExt.author = 'Original: Claude, Air; Refactor & Enhance: Gemini 2.5 Pro';
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
.f 投掷 (roll)              - 轮到你时，投掷骰子
.f 选择 (select) <骰子序列>  - 选择骰子计分，如: .f 选择 1,5,5
.f 存分 (bank)              - 结束你的回合，存分
.f 状态 (status)            - 查看当前游戏状态
.f 结束 (end/abort)         - 由发起人/管理员强制结束当前游戏
.f 战绩 (stats/honor)     - 查看多人游戏总体战绩 (荣誉积分)
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
cmdFarkle.disabledInPrivate = true;
cmdFarkle.allowDelegate = true;

cmdFarkle.solve = (ctx, msg, cmdArgs) => {
    const groupCtxKey = `farkle_game:${ctx.group.groupId}`;
    let game = new FarkleGame(farkleExt.storageGet(groupCtxKey));
    const subCmdRaw = cmdArgs.getArgN(1);
    if (!subCmdRaw) {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }
    const subCmd = subCmdRaw.toLowerCase();
    const player = { id: ctx.player.userId, name: ctx.player.name };
    let reply = "";

    if (game.state !== FARKLE_GAME_STATE.IDLE && (Date.now() - game.lastActivityTime > 30 * 60 * 1000)) {
        if (game.state === FARKLE_GAME_STATE.IN_PROGRESS || game.state === FARKLE_GAME_STATE.WAITING) {
            let conclusion = game.concludeGame("游戏超时自动结束。");
            let honorReplyPart = "";

            if (conclusion.isSinglePlayerResult && conclusion.singlePlayerStats) {
                updateSinglePlayerLeaderboard(conclusion.singlePlayerStats);
            } else if (!conclusion.isSinglePlayerResult && conclusion.playerStatsData && conclusion.playerStatsData.length > 0) {
                let totalHonorLostByLosersNet_value = 0; // Use a neutral variable name
                let actualLoserObjects = [];

                conclusion.playerStatsData.filter(p => !p.isWinner).forEach(loserData => {
                    const statsKey = `farkle_stats_mp:${loserData.userId}`;
                    let playerStats = new FarklePlayerOverallStats();
                    const storedStats = farkleExt.storageGet(statsKey);
                    if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                    playerStats.calculateHonorChange(false, loserData.score, game.targetScore);
                    totalHonorLostByLosersNet_value += playerStats.lastHonorChange; // Accumulate negative values
                    actualLoserObjects.push({ data: loserData, stats: playerStats });
                });

                const collectedPortionBase = Math.abs(totalHonorLostByLosersNet_value) * 0.20;
                const winnersData = conclusion.playerStatsData.filter(p => p.isWinner);

                winnersData.forEach(winnerData => {
                    const statsKey = `farkle_stats_mp:${winnerData.userId}`;
                    let playerStats = new FarklePlayerOverallStats(); // Load fresh for each winner
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
                    if (pData.isWinner) {
                        const winnerObj = winnersData.find(w => w.userId === pData.userId);
                        playerStatsToSave = winnerObj.updatedStatsInstance; // Use the instance that had honor calculated
                        finalHonorChangeThisGame = playerStatsToSave.lastHonorChange;
                    } else {
                        const loserObj = actualLoserObjects.find(l => l.data.userId === pData.userId);
                        playerStatsToSave = loserObj.stats; // Use the instance that had honor calculated
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
            farkleExt.storageSet(groupCtxKey, JSON.stringify(game.toJSON()));
            seal.replyToSender(ctx, msg, reply);
            return seal.ext.newCmdExecuteResult(true);
        }
    }

    switch (subCmd) {
        case '发起': case 'init': case 'new':
            if (game.state !== FARKLE_GAME_STATE.IDLE && game.state !== FARKLE_GAME_STATE.CONCLUDED) {
                reply = "当前群组已有一局Farkle游戏。";
            } else {
                const customTargetScore = parseInt(cmdArgs.getArgN(2));
                game.reset();
                if (!isNaN(customTargetScore) && customTargetScore > 0) {
                    game.targetScore = customTargetScore;
                } else {
                    game.targetScore = DEFAULT_TARGET_SCORE;
                }
                game.state = FARKLE_GAME_STATE.WAITING;
                reply = game.addPlayer(player.id, player.name);
                reply += `\n${player.name} 发起了Farkle多人游戏！目标分数: ${game.targetScore} (规则 ${game.ruleSet})。\n其他玩家请输入【.f 加入 (join)】参与。使用【.f 规则 (rule) [1|2]】可在开始前修改规则。`;
            }
            break;
        case '加入': case 'join':
            reply = game.addPlayer(player.id, player.name);
            break;
        case '开始': case 'start':
            if (game.isSinglePlayer) {
                reply = "单人游戏已开始或无法用此命令开始。请使用 .f 单人 (single)";
            } else {
                const gameStartTargetScore = cmdArgs.getArgN(2);
                reply = game.startMultiplayerGame(player.id, gameStartTargetScore);
            }
            break;
        case '单人': case 'single':
            const attemptsArg = cmdArgs.getArgN(2);
            reply = game.startSinglePlayerGame(player.id, player.name, attemptsArg);
            break;
        case '投掷': case 'roll':
            reply = game.rollDice(player.id);
             if (typeof reply === 'object' && reply.summary) {
                let honorReplyPart = "";
                if (reply.isSinglePlayerResult && reply.singlePlayerStats) {
                    updateSinglePlayerLeaderboard(reply.singlePlayerStats);
                } else if (!reply.isSinglePlayerResult && reply.playerStatsData && reply.playerStatsData.length > 0) {
                    let totalHonorLostByLosersNet_value = 0;
                    let actualLoserObjects = [];
                    reply.playerStatsData.filter(p => !p.isWinner).forEach(loserData => {
                        const statsKey = `farkle_stats_mp:${loserData.userId}`;
                        let playerStats = new FarklePlayerOverallStats();
                        const storedStats = farkleExt.storageGet(statsKey);
                        if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                        playerStats.calculateHonorChange(false, loserData.score, game.targetScore);
                        totalHonorLostByLosersNet_value += playerStats.lastHonorChange;
                        actualLoserObjects.push({ data: loserData, stats: playerStats });
                    });
                    const collectedPortionBase = Math.abs(totalHonorLostByLosersNet_value) * 0.20;
                    const winnersData = reply.playerStatsData.filter(p => p.isWinner);
                    winnersData.forEach(winnerData => {
                        const statsKey = `farkle_stats_mp:${winnerData.userId}`;
                        let playerStats = new FarklePlayerOverallStats();
                        const storedStats = farkleExt.storageGet(statsKey);
                        if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                        const collectedForThisWinner = winnersData.length > 0 ? collectedPortionBase / winnersData.length : 0;
                        playerStats.calculateHonorChange(true, winnerData.score, game.targetScore, collectedForThisWinner);
                        winnerData.updatedStatsInstance = playerStats;
                    });
                    reply.playerStatsData.forEach(pData => {
                        const statsKey = `farkle_stats_mp:${pData.userId}`;
                        let playerStatsToSave; let finalHonorChangeThisGame;
                        if (pData.isWinner) {
                            const winnerObj = winnersData.find(w => w.userId === pData.userId); playerStatsToSave = winnerObj.updatedStatsInstance; finalHonorChangeThisGame = playerStatsToSave.lastHonorChange;
                        } else {
                            const loserObj = actualLoserObjects.find(l => l.data.userId === pData.userId); playerStatsToSave = loserObj.stats; finalHonorChangeThisGame = playerStatsToSave.lastHonorChange;
                        }
                        playerStatsToSave.finalizeGameStats(pData.score);
                        farkleExt.storageSet(statsKey, JSON.stringify(playerStatsToSave));
                        honorReplyPart += `\n${pData.userName}: ${finalHonorChangeThisGame >= 0 ? '+' : ''}${finalHonorChangeThisGame}荣誉 (现 ${playerStatsToSave.honorPoints})`;
                    });
                    if (honorReplyPart) reply.summary += "\n--- 荣誉结算 ---" + honorReplyPart;
                }
                reply = reply.summary;
            }
            break;
        case '选择': case 'select':
            const diceToSelect = cmdArgs.getArgN(2);
            if (!diceToSelect) {
                reply = "请指定要选择的骰子点数，用逗号分隔，如: .f 选择 1,5,5";
            } else {
                reply = game.selectDice(player.id, diceToSelect);
            }
            break;
        case '存分': case 'bank':
            reply = game.bankScore(player.id);
            if (typeof reply === 'object' && reply.summary) {
                let honorReplyPart = "";
                if (reply.isSinglePlayerResult && reply.singlePlayerStats) {
                    updateSinglePlayerLeaderboard(reply.singlePlayerStats);
                } else if (!reply.isSinglePlayerResult && reply.playerStatsData && reply.playerStatsData.length > 0) {
                    let totalHonorLostByLosersNet_value = 0;
                    let actualLoserObjects = [];
                    reply.playerStatsData.filter(p => !p.isWinner).forEach(loserData => {
                        const statsKey = `farkle_stats_mp:${loserData.userId}`;
                        let playerStats = new FarklePlayerOverallStats();
                        const storedStats = farkleExt.storageGet(statsKey);
                        if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                        playerStats.calculateHonorChange(false, loserData.score, game.targetScore);
                        totalHonorLostByLosersNet_value += playerStats.lastHonorChange;
                        actualLoserObjects.push({ data: loserData, stats: playerStats });
                    });
                    const collectedPortionBase = Math.abs(totalHonorLostByLosersNet_value) * 0.20;
                    const winnersData = reply.playerStatsData.filter(p => p.isWinner);
                    winnersData.forEach(winnerData => {
                        const statsKey = `farkle_stats_mp:${winnerData.userId}`;
                        let playerStats = new FarklePlayerOverallStats();
                        const storedStats = farkleExt.storageGet(statsKey);
                        if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                        const collectedForThisWinner = winnersData.length > 0 ? collectedPortionBase / winnersData.length : 0;
                        playerStats.calculateHonorChange(true, winnerData.score, game.targetScore, collectedForThisWinner);
                        winnerData.updatedStatsInstance = playerStats;
                    });
                    reply.playerStatsData.forEach(pData => {
                        const statsKey = `farkle_stats_mp:${pData.userId}`;
                        let playerStatsToSave; let finalHonorChangeThisGame;
                        if (pData.isWinner) {
                            const winnerObj = winnersData.find(w => w.userId === pData.userId); playerStatsToSave = winnerObj.updatedStatsInstance; finalHonorChangeThisGame = playerStatsToSave.lastHonorChange;
                        } else {
                            const loserObj = actualLoserObjects.find(l => l.data.userId === pData.userId); playerStatsToSave = loserObj.stats; finalHonorChangeThisGame = playerStatsToSave.lastHonorChange;
                        }
                        playerStatsToSave.finalizeGameStats(pData.score);
                        farkleExt.storageSet(statsKey, JSON.stringify(playerStatsToSave));
                        honorReplyPart += `\n${pData.userName}: ${finalHonorChangeThisGame >= 0 ? '+' : ''}${finalHonorChangeThisGame}荣誉 (现 ${playerStatsToSave.honorPoints})`;
                    });
                    if (honorReplyPart) reply.summary += "\n--- 荣誉结算 ---" + honorReplyPart;
                }
                reply = reply.summary;
            }
            break;
        case '状态': case 'status':
            reply = game.getGameStatus();
            break;
        case '结束': case 'end': case 'abort':
            if (game.state === FARKLE_GAME_STATE.IDLE) {
                reply = "没有正在进行的游戏可以结束。";
            } else if (game.gameInitiatorId === player.id || ctx.privilegeLevel >= 100) {
                const conclusion = game.concludeGame(`${player.name} 强制结束了游戏。`);
                reply = conclusion.summary;
            } else {
                reply = "只有游戏发起者或管理员才能强制结束游戏。";
            }
            break;
        case '战绩': case 'stats': case 'honor':
            {
                let targetPlayerIdToQuery = player.id;
                let targetPlayerNameToQuery = player.name;
                const mentionedPlayerCtx = seal.getCtxProxyFirst(ctx, cmdArgs);
                if (mentionedPlayerCtx && cmdArgs.getArgN(2) && cmdArgs.getArgN(2).startsWith('@')) {
                    targetPlayerIdToQuery = mentionedPlayerCtx.player.userId;
                    targetPlayerNameToQuery = mentionedPlayerCtx.player.name;
                }
                const statsKey = `farkle_stats_mp:${targetPlayerIdToQuery}`;
                const storedStats = farkleExt.storageGet(statsKey);
                if (storedStats) {
                    const playerStats = new FarklePlayerOverallStats();
                    Object.assign(playerStats, JSON.parse(storedStats));
                    reply = `${targetPlayerNameToQuery} 的Farkle多人游戏战绩:\n` + playerStats.getStatsSummary();
                } else {
                    reply = `${targetPlayerNameToQuery} 暂无Farkle多人游戏战绩记录。`;
                }
            }
            break;
        case '规则': case 'rule': case 'rules':
            const ruleArg = cmdArgs.getArgN(2);
            if (!ruleArg) {
                reply = game.setRuleSet(game.ruleSet);
                const ruleHelpMatch = cmdFarkle.help.match(new RegExp(`计分规则 \\(规则 ${game.ruleSet}[^]*?(?=计分规则 \\(规则|Farkle:|Hot Dice:|$)`));
                if (ruleHelpMatch) {
                    reply += "\n" + ruleHelpMatch[0].trim();
                } else {
                     reply += "\n无法找到当前规则的详细描述。";
                }
            } else {
                const ruleNum = parseInt(ruleArg);
                if (!isNaN(ruleNum)) {
                    reply = game.setRuleSet(ruleNum);
                } else {
                    reply = `无效的规则编号。当前规则: ${game.ruleSet}。`;
                }
            }
            break;
        case '排行': case 'board': case 'leaderboard':
             {
                const leaderboard = getSinglePlayerLeaderboard();
                if (leaderboard.length === 0) {
                    reply = "单人模式高分榜暂无数据。";
                } else {
                    reply = "--- Farkle 单人模式高分榜 ---\n";
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
            return hret;
        default:
            reply = `未知指令: ${subCmd}。输入 .f 帮助 查看可用指令。`;
            break;
    }

    if (reply) {
        farkleExt.storageSet(groupCtxKey, JSON.stringify(game.toJSON()));
        seal.replyToSender(ctx, msg, reply);
    }
    return seal.ext.newCmdExecuteResult(true);
};

farkleExt.cmdMap['farkle'] = cmdFarkle;

const cmdFarkleShort = seal.ext.newCmdItemInfo();
cmdFarkleShort.name = 'f';
cmdFarkleShort.help = cmdFarkle.help;
cmdFarkleShort.disabledInPrivate = cmdFarkle.disabledInPrivate;
cmdFarkleShort.allowDelegate = cmdFarkle.allowDelegate;
cmdFarkleShort.solve = cmdFarkle.solve;
farkleExt.cmdMap['f'] = cmdFarkleShort;