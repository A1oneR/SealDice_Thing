// ==UserScript==
// @name         璀璨宝石 (Splendor)
// @author       Gemini 2.5 Pro, Air
// @version      1.0.2
// @description  经典的璀璨宝石桌游，收集宝石，获取声望！
// @timestamp    1747727390
// @license      Apache-2.0
// @homepageURL  https://github.com/A1oneR/SealDice_Thing
// ==/UserScript==

const VERSION = '1.0.2'; // 版本号更新

// --- 常量 ---
const GEM_TYPES = {
    WHITE: '白',
    BLUE: '蓝',
    GREEN: '绿',
    RED: '红',
    BLACK: '黑'
};
const GEM_TYPES_FULL_NAMES = {
    白: '钻石(白)',
    蓝: '蓝宝石(蓝)',
    绿: '翡翠(绿)',
    红: '红宝石(红)',
    黑: '玛瑙(黑)'
};
const GOLD = '金';
const ALL_GEM_COLORS = Object.values(GEM_TYPES);

const GAME_STATE = {
    IDLE: 0,
    WAITING: 1,
    IN_PROGRESS: 2,
    CONCLUDED: 3
};
const MAX_TOKENS_PLAYER = 10;
const MAX_RESERVED_CARDS = 3;
const POINTS_TO_TRIGGER_END = 15;
const GAME_TIMEOUT_MS = 30 * 60 * 1000; // 30 分钟

// --- 卡牌与贵族定义 ---
const c = (w, b, g, r, k) => ({
    白: w || 0,
    蓝: b || 0,
    绿: g || 0,
    红: r || 0,
    黑: k || 0
});

const CARD_DEFINITIONS = {
    // Level 1 Cards (40 total)
    L1_01: { level: 1, points: 1, bonus: GEM_TYPES.WHITE, cost: c(0, 0, 0, 4, 0) },
    L1_02: { level: 1, points: 1, bonus: GEM_TYPES.BLUE, cost: c(0, 0, 4, 0, 0) },
    L1_03: { level: 1, points: 1, bonus: GEM_TYPES.GREEN, cost: c(0, 4, 0, 0, 0) },
    L1_04: { level: 1, points: 1, bonus: GEM_TYPES.RED, cost: c(0, 0, 0, 0, 4) },
    L1_05: { level: 1, points: 1, bonus: GEM_TYPES.BLACK, cost: c(4, 0, 0, 0, 0) },
    L1_06: { level: 1, points: 0, bonus: GEM_TYPES.WHITE, cost: c(0, 3, 0, 0, 0) },
    L1_07: { level: 1, points: 0, bonus: GEM_TYPES.WHITE, cost: c(0, 3, 0, 0, 0) },
    L1_08: { level: 1, points: 0, bonus: GEM_TYPES.BLUE, cost: c(0, 0, 3, 0, 0) },
    L1_09: { level: 1, points: 0, bonus: GEM_TYPES.BLUE, cost: c(0, 0, 3, 0, 0) },
    L1_10: { level: 1, points: 0, bonus: GEM_TYPES.GREEN, cost: c(0, 0, 0, 3, 0) },
    L1_11: { level: 1, points: 0, bonus: GEM_TYPES.GREEN, cost: c(0, 0, 0, 3, 0) },
    L1_12: { level: 1, points: 0, bonus: GEM_TYPES.RED, cost: c(0, 0, 0, 0, 3) },
    L1_13: { level: 1, points: 0, bonus: GEM_TYPES.RED, cost: c(0, 0, 0, 0, 3) },
    L1_14: { level: 1, points: 0, bonus: GEM_TYPES.BLACK, cost: c(3, 0, 0, 0, 0) },
    L1_15: { level: 1, points: 0, bonus: GEM_TYPES.BLACK, cost: c(3, 0, 0, 0, 0) },
    L1_16: { level: 1, points: 0, bonus: GEM_TYPES.WHITE, cost: c(0, 0, 2, 2, 0) },
    L1_17: { level: 1, points: 0, bonus: GEM_TYPES.BLUE, cost: c(0, 0, 0, 2, 2) },
    L1_18: { level: 1, points: 0, bonus: GEM_TYPES.GREEN, cost: c(2, 2, 0, 0, 0) },
    L1_19: { level: 1, points: 0, bonus: GEM_TYPES.RED, cost: c(2, 0, 0, 0, 2) },
    L1_20: { level: 1, points: 0, bonus: GEM_TYPES.BLACK, cost: c(0, 2, 2, 0, 0) },
    L1_21: { level: 1, points: 0, bonus: GEM_TYPES.WHITE, cost: c(0, 1, 1, 1, 2) },
    L1_22: { level: 1, points: 0, bonus: GEM_TYPES.BLUE, cost: c(1, 0, 1, 2, 1) },
    L1_23: { level: 1, points: 0, bonus: GEM_TYPES.GREEN, cost: c(1, 2, 0, 1, 1) },
    L1_24: { level: 1, points: 0, bonus: GEM_TYPES.RED, cost: c(2, 1, 1, 0, 1) },
    L1_25: { level: 1, points: 0, bonus: GEM_TYPES.BLACK, cost: c(1, 1, 2, 1, 0) },
    L1_26: { level: 1, points: 0, bonus: GEM_TYPES.WHITE, cost: c(0, 1, 1, 1, 1) },
    L1_27: { level: 1, points: 0, bonus: GEM_TYPES.BLUE, cost: c(1, 0, 1, 1, 1) },
    L1_28: { level: 1, points: 0, bonus: GEM_TYPES.GREEN, cost: c(1, 1, 0, 1, 1) },
    L1_29: { level: 1, points: 0, bonus: GEM_TYPES.RED, cost: c(1, 1, 1, 0, 1) },
    L1_30: { level: 1, points: 0, bonus: GEM_TYPES.BLACK, cost: c(1, 1, 1, 1, 0) },
    L1_31: { level: 1, points: 0, bonus: GEM_TYPES.WHITE, cost: c(0, 2, 0, 1, 0) },
    L1_32: { level: 1, points: 0, bonus: GEM_TYPES.WHITE, cost: c(0, 0, 2, 0, 1) },
    L1_33: { level: 1, points: 0, bonus: GEM_TYPES.BLUE, cost: c(0, 0, 2, 1, 0) },
    L1_34: { level: 1, points: 0, bonus: GEM_TYPES.BLUE, cost: c(1, 0, 0, 2, 0) },
    L1_35: { level: 1, points: 0, bonus: GEM_TYPES.GREEN, cost: c(1, 0, 0, 0, 2) },
    L1_36: { level: 1, points: 0, bonus: GEM_TYPES.GREEN, cost: c(0, 1, 0, 0, 2) },
    L1_37: { level: 1, points: 0, bonus: GEM_TYPES.RED, cost: c(2, 0, 1, 0, 0) },
    L1_38: { level: 1, points: 0, bonus: GEM_TYPES.RED, cost: c(0, 2, 0, 0, 1) },
    L1_39: { level: 1, points: 0, bonus: GEM_TYPES.BLACK, cost: c(0, 1, 0, 2, 0) },
    L1_40: { level: 1, points: 0, bonus: GEM_TYPES.BLACK, cost: c(2, 0, 0, 1, 0) },
    // Level 2 Cards (30 total)
    L2_01: { level: 2, points: 1, bonus: GEM_TYPES.WHITE, cost: c(0, 2, 0, 2, 3) },
    L2_02: { level: 2, points: 1, bonus: GEM_TYPES.WHITE, cost: c(3, 0, 2, 0, 2) },
    L2_03: { level: 2, points: 1, bonus: GEM_TYPES.BLUE, cost: c(2, 0, 3, 0, 2) },
    L2_04: { level: 2, points: 1, bonus: GEM_TYPES.BLUE, cost: c(0, 2, 2, 3, 0) },
    L2_05: { level: 2, points: 1, bonus: GEM_TYPES.GREEN, cost: c(0, 3, 0, 2, 2) },
    L2_06: { level: 2, points: 1, bonus: GEM_TYPES.GREEN, cost: c(2, 2, 0, 0, 3) },
    L2_07: { level: 2, points: 1, bonus: GEM_TYPES.RED, cost: c(2, 0, 2, 0, 3) },
    L2_08: { level: 2, points: 1, bonus: GEM_TYPES.RED, cost: c(3, 2, 0, 2, 0) },
    L2_09: { level: 2, points: 1, bonus: GEM_TYPES.BLACK, cost: c(2, 3, 0, 2, 0) },
    L2_10: { level: 2, points: 1, bonus: GEM_TYPES.BLACK, cost: c(0, 2, 3, 0, 2) },
    L2_11: { level: 2, points: 2, bonus: GEM_TYPES.WHITE, cost: c(0, 5, 0, 0, 0) },
    L2_12: { level: 2, points: 2, bonus: GEM_TYPES.WHITE, cost: c(0, 0, 0, 0, 5) },
    L2_13: { level: 2, points: 2, bonus: GEM_TYPES.BLUE, cost: c(5, 0, 0, 0, 0) },
    L2_14: { level: 2, points: 2, bonus: GEM_TYPES.BLUE, cost: c(0, 0, 5, 0, 0) },
    L2_15: { level: 2, points: 2, bonus: GEM_TYPES.GREEN, cost: c(0, 5, 0, 0, 0) },
    L2_16: { level: 2, points: 2, bonus: GEM_TYPES.GREEN, cost: c(0, 0, 0, 5, 0) },
    L2_17: { level: 2, points: 2, bonus: GEM_TYPES.RED, cost: c(5, 0, 0, 0, 0) },
    L2_18: { level: 2, points: 2, bonus: GEM_TYPES.RED, cost: c(0, 0, 0, 0, 5) },
    L2_19: { level: 2, points: 2, bonus: GEM_TYPES.BLACK, cost: c(0, 0, 5, 0, 0) },
    L2_20: { level: 2, points: 2, bonus: GEM_TYPES.BLACK, cost: c(0, 0, 0, 5, 0) },
    L2_21: { level: 2, points: 2, bonus: GEM_TYPES.WHITE, cost: c(6, 0, 0, 0, 0) },
    L2_22: { level: 2, points: 2, bonus: GEM_TYPES.BLUE, cost: c(0, 6, 0, 0, 0) },
    L2_23: { level: 2, points: 2, bonus: GEM_TYPES.GREEN, cost: c(0, 0, 6, 0, 0) },
    L2_24: { level: 2, points: 2, bonus: GEM_TYPES.RED, cost: c(0, 0, 0, 6, 0) },
    L2_25: { level: 2, points: 2, bonus: GEM_TYPES.BLACK, cost: c(0, 0, 0, 0, 6) },
    L2_26: { level: 2, points: 3, bonus: GEM_TYPES.WHITE, cost: c(0, 3, 3, 0, 5) },
    L2_27: { level: 2, points: 3, bonus: GEM_TYPES.BLUE, cost: c(3, 0, 5, 3, 0) },
    L2_28: { level: 2, points: 3, bonus: GEM_TYPES.GREEN, cost: c(5, 3, 0, 0, 3) },
    L2_29: { level: 2, points: 3, bonus: GEM_TYPES.RED, cost: c(0, 5, 3, 0, 3) },
    L2_30: { level: 2, points: 3, bonus: GEM_TYPES.BLACK, cost: c(3, 0, 0, 5, 3) },
    // Level 3 Cards (20 total)
    L3_01: { level: 3, points: 3, bonus: GEM_TYPES.WHITE, cost: c(0, 3, 3, 5, 3) },
    L3_02: { level: 3, points: 3, bonus: GEM_TYPES.BLUE, cost: c(3, 0, 3, 3, 5) },
    L3_03: { level: 3, points: 3, bonus: GEM_TYPES.GREEN, cost: c(5, 3, 0, 3, 3) },
    L3_04: { level: 3, points: 3, bonus: GEM_TYPES.RED, cost: c(3, 5, 3, 0, 3) },
    L3_05: { level: 3, points: 3, bonus: GEM_TYPES.BLACK, cost: c(3, 3, 5, 3, 0) },
    L3_06: { level: 3, points: 4, bonus: GEM_TYPES.WHITE, cost: c(0, 0, 0, 0, 7) },
    L3_07: { level: 3, points: 4, bonus: GEM_TYPES.BLUE, cost: c(7, 0, 0, 0, 0) },
    L3_08: { level: 3, points: 4, bonus: GEM_TYPES.GREEN, cost: c(0, 7, 0, 0, 0) },
    L3_09: { level: 3, points: 4, bonus: GEM_TYPES.RED, cost: c(0, 0, 7, 0, 0) },
    L3_10: { level: 3, points: 4, bonus: GEM_TYPES.BLACK, cost: c(0, 0, 0, 7, 0) },
    L3_11: { level: 3, points: 4, bonus: GEM_TYPES.WHITE, cost: c(0, 0, 3, 6, 3) },
    L3_12: { level: 3, points: 4, bonus: GEM_TYPES.BLUE, cost: c(3, 0, 0, 3, 6) },
    L3_13: { level: 3, points: 4, bonus: GEM_TYPES.GREEN, cost: c(6, 3, 0, 0, 3) },
    L3_14: { level: 3, points: 4, bonus: GEM_TYPES.RED, cost: c(3, 6, 3, 0, 0) },
    L3_15: { level: 3, points: 4, bonus: GEM_TYPES.BLACK, cost: c(0, 3, 6, 3, 0) },
    L3_16: { level: 3, points: 5, bonus: GEM_TYPES.WHITE, cost: c(0, 0, 0, 3, 7) },
    L3_17: { level: 3, points: 5, bonus: GEM_TYPES.BLUE, cost: c(3, 7, 0, 0, 0) },
    L3_18: { level: 3, points: 5, bonus: GEM_TYPES.GREEN, cost: c(0, 3, 7, 0, 0) },
    L3_19: { level: 3, points: 5, bonus: GEM_TYPES.RED, cost: c(0, 0, 3, 7, 0) },
    L3_20: { level: 3, points: 5, bonus: GEM_TYPES.BLACK, cost: c(0, 0, 0, 3, 7) }
};

const NOBLE_DEFINITIONS = {
    N01: { points: 3, cost: c(4, 4, 0, 0, 0) },
    N02: { points: 3, cost: c(0, 4, 4, 0, 0) },
    N03: { points: 3, cost: c(0, 0, 4, 4, 0) },
    N04: { points: 3, cost: c(0, 0, 0, 4, 4) },
    N05: { points: 3, cost: c(4, 0, 0, 0, 4) },
    N06: { points: 3, cost: c(3, 3, 3, 0, 0) },
    N07: { points: 3, cost: c(0, 3, 3, 3, 0) },
    N08: { points: 3, cost: c(0, 0, 3, 3, 3) },
    N09: { points: 3, cost: c(3, 0, 0, 3, 3) },
    N10: { points: 3, cost: c(3, 3, 0, 0, 3) }
};

// --- 辅助函数 ---
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function formatCost(costObj, needed = false) {
    let str = "";
    for (const color of ALL_GEM_COLORS) {
        if (costObj[color] > 0) {
            str += `${costObj[color]}${color} `;
        }
    }
    if (needed && costObj[GOLD] > 0) {
        str += `${costObj[GOLD]}${GOLD} `;
    }
    return str.trim() || (needed ? "免费" : "");
}

function formatCard(cardId, showCost = true) {
    const card = CARD_DEFINITIONS[cardId];
    if (!card) {
        return `[未知卡牌 ${cardId}]`;
    }
    let str = `${card.bonus}卡 (${card.points}VP)`;
    if (showCost) {
        str += ` 需: ${formatCost(card.cost)}`;
    }
    return str;
}

function formatNoble(nobleId) {
    const noble = NOBLE_DEFINITIONS[nobleId];
    if (!noble) {
        return `[未知贵族 ${nobleId}]`;
    }
    return `贵族 (${noble.points}VP) 需: ${formatCost(noble.cost)}`;
}


// --- 玩家状态类 ---
class PlayerState {
    constructor(userId, userName) {
        this.userId = userId;
        this.userName = userName;
        this.tokens = {
            白: 0,
            蓝: 0,
            绿: 0,
            红: 0,
            黑: 0,
            金: 0
        };
        this.reservedCards = [];
        this.boughtCards = [];
        this.nobles = [];
        this.updateDerivedStats();
    }

    updateDerivedStats() {
        this.prestigePoints = 0;
        this.gemBonuses = {
            白: 0,
            蓝: 0,
            绿: 0,
            红: 0,
            黑: 0
        };
        this.boughtCards.forEach(cardId => {
            const card = CARD_DEFINITIONS[cardId];
            this.prestigePoints += card.points;
            this.gemBonuses[card.bonus]++;
        });
        this.nobles.forEach(nobleId => {
            this.prestigePoints += NOBLE_DEFINITIONS[nobleId].points;
        });
    }

    getTotalTokens() {
        return Object.values(this.tokens).reduce((sum, count) => sum + count, 0);
    }

    canAfford(cost) {
        let goldNeeded = 0;
        for (const color of ALL_GEM_COLORS) {
            const effectiveCost = Math.max(0, cost[color] - (this.gemBonuses[color] || 0));
            if (this.tokens[color] < effectiveCost) {
                goldNeeded += effectiveCost - this.tokens[color];
            }
        }
        return this.tokens[GOLD] >= goldNeeded;
    }

    getPayment(cost) {
        const payment = {
            白: 0,
            蓝: 0,
            绿: 0,
            红: 0,
            黑: 0,
            金: 0
        };
        let goldToUse = this.tokens[GOLD];

        for (const color of ALL_GEM_COLORS) {
            const costAfterBonus = Math.max(0, cost[color] - (this.gemBonuses[color] || 0));
            if (this.tokens[color] >= costAfterBonus) {
                payment[color] = costAfterBonus;
            } else {
                payment[color] = this.tokens[color];
                const remainder = costAfterBonus - this.tokens[color];
                if (goldToUse >= remainder) {
                    payment[GOLD] += remainder;
                    goldToUse -= remainder;
                } else {
                    return null; // Cannot afford even with all gold
                }
            }
        }
        return payment;
    }
}

// --- 游戏类 ---
class SplendorGame {
    constructor(serializedState = null) {
        if (serializedState) {
            Object.assign(this, JSON.parse(serializedState));
            this.players = this.players.map(pData => {
                const player = new PlayerState(pData.userId, pData.userName);
                Object.assign(player, pData);
                return player;
            });
        } else {
            this.reset();
        }
    }

    toJSON() {
        return {
            state: this.state,
            players: this.players,
            playerOrder: this.playerOrder,
            currentPlayerIndex: this.currentPlayerIndex,
            gameInitiatorId: this.gameInitiatorId,
            gemSupply: this.gemSupply,
            devCardsDecks: this.devCardsDecks,
            devCardsFaceUp: this.devCardsFaceUp,
            nobleTilesFaceUp: this.nobleTilesFaceUp,
            roundCompletedAfterVPTrigger: this.roundCompletedAfterVPTrigger,
            turnsTakenInFinalRound: this.turnsTakenInFinalRound,
            lastActivityTime: this.lastActivityTime
        };
    }

    reset() {
        this.state = GAME_STATE.IDLE;
        this.players = [];
        this.playerOrder = [];
        this.currentPlayerIndex = 0;
        this.gameInitiatorId = null;
        this.gemSupply = {};
        this.devCardsDecks = { 1: [], 2: [], 3: [] };
        this.devCardsFaceUp = { 1: [], 2: [], 3: [] };
        this.nobleTilesFaceUp = [];
        this.roundCompletedAfterVPTrigger = false;
        this.turnsTakenInFinalRound = 0;
        this.lastActivityTime = Date.now();
    }

    setupGame(playerCount) {
        const baseGemCount = playerCount === 2 ? 4 : (playerCount === 3 ? 5 : 7);
        ALL_GEM_COLORS.forEach(color => this.gemSupply[color] = baseGemCount);
        this.gemSupply[GOLD] = 5;

        for (let level = 1; level <= 3; level++) {
            this.devCardsDecks[level] = shuffleArray(Object.keys(CARD_DEFINITIONS).filter(id => CARD_DEFINITIONS[id].level === level));
            for (let i = 0; i < 4; i++) {
                if (this.devCardsDecks[level].length > 0) {
                    this.devCardsFaceUp[level].push(this.devCardsDecks[level].pop());
                }
            }
        }

        const numNobles = playerCount + 1;
        const allNobles = shuffleArray(Object.keys(NOBLE_DEFINITIONS));
        this.nobleTilesFaceUp = allNobles.slice(0, numNobles);
    }

    addPlayer(userId, userName) {
        if (this.state !== GAME_STATE.WAITING) {
            return "游戏已开始或未初始化，无法加入。";
        }
        if (this.players.length >= 4) {
            return "人数已满（最多4人）。";
        }
        if (this.players.find(p => p.userId === userId)) {
            return "你已经加入游戏了。";
        }
        this.players.push(new PlayerState(userId, userName));
        if (!this.gameInitiatorId) {
            this.gameInitiatorId = userId;
        }
        this.lastActivityTime = Date.now();
        return `${userName} 已加入游戏！当前人数: ${this.players.length}。发起人可使用【.spl 开始】。`;
    }

    startGame(initiatorId) {
        if (this.state !== GAME_STATE.WAITING) {
            return "游戏不在等待状态。";
        }
        if (this.gameInitiatorId !== initiatorId) {
            return "只有游戏发起者才能开始游戏。";
        }
        if (this.players.length < 2) {
            return "至少需要2名玩家。";
        }

        this.playerOrder = shuffleArray(this.players.map(p => p.userId));
        this.currentPlayerIndex = 0;
        this.setupGame(this.players.length);
        this.state = GAME_STATE.IN_PROGRESS;
        this.lastActivityTime = Date.now();

        const currentPlayer = this.getCurrentPlayer();
        return `游戏开始！共 ${this.players.length} 名玩家。\n玩家顺序: ${this.playerOrder.map(uid => this.getPlayer(uid).userName).join(" -> ")}\n轮到 ${currentPlayer.userName} 行动。`;
    }

    getPlayer(userId) {
        return this.players.find(p => p.userId === userId);
    }

    getCurrentPlayer() {
        return this.getPlayer(this.playerOrder[this.currentPlayerIndex]);
    }

    nextTurn() {
        const playerWhoFinishedTurn = this.getCurrentPlayer();
        if (playerWhoFinishedTurn.prestigePoints >= POINTS_TO_TRIGGER_END && !this.roundCompletedAfterVPTrigger) {
            this.roundCompletedAfterVPTrigger = true;
            this.turnsTakenInFinalRound = 0;
        }

        if (this.roundCompletedAfterVPTrigger) {
            this.turnsTakenInFinalRound++;
            if (this.turnsTakenInFinalRound >= this.players.length) {
                return this.concludeGame("所有玩家已完成最终回合。");
            }
        }

        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        this.lastActivityTime = Date.now();
        return null; // No game conclusion yet
    }

    takeTokens(userId, colors) {
        if (this.state !== GAME_STATE.IN_PROGRESS) {
            return "游戏未开始。";
        }
        const player = this.getCurrentPlayer();
        if (player.userId !== userId) {
            return "还没轮到你。";
        }

        const uniqueColors = new Set(colors);
        let reply = "";

        if (colors.length === 3 && uniqueColors.size === 3) {
            for (const color of colors) {
                if (!ALL_GEM_COLORS.includes(color)) {
                    return `无效的宝石颜色: ${color}。请使用 ${ALL_GEM_COLORS.join('/')}。`;
                }
                if (this.gemSupply[color] === 0) {
                    return `${GEM_TYPES_FULL_NAMES[color]} 已无库存。`;
                }
            }
            if (player.getTotalTokens() + 3 > MAX_TOKENS_PLAYER) {
                reply += `你的宝石已达上限或将超过上限(${MAX_TOKENS_PLAYER}个)，拿取后可能需要归还。\n`;
            }
            colors.forEach(color => {
                this.gemSupply[color]--;
                player.tokens[color]++;
            });
            reply += `${player.userName} 拿取了 ${colors.join(", ")} 各1个。`;
        } else if (colors.length === 2 && uniqueColors.size === 1) {
            const color = colors[0];
            if (!ALL_GEM_COLORS.includes(color)) {
                return `无效的宝石颜色: ${color}。`;
            }
            if (this.gemSupply[color] < 4) {
                return `拿取2个同色宝石，该颜色 (${GEM_TYPES_FULL_NAMES[color]}) 库存需至少有4个。当前: ${this.gemSupply[color]}。`;
            }
            if (player.getTotalTokens() + 2 > MAX_TOKENS_PLAYER) {
                reply += `你的宝石已达上限或将超过上限(${MAX_TOKENS_PLAYER}个)，拿取后可能需要归还。\n`;
            }
            this.gemSupply[color] -= 2;
            player.tokens[color] += 2;
            reply += `${player.userName} 拿取了2个 ${GEM_TYPES_FULL_NAMES[color]}。`;
        } else {
            return "无效的拿取指令。请拿取3个不同颜色或2个相同颜色的宝石。";
        }

        if (player.getTotalTokens() > MAX_TOKENS_PLAYER) {
            reply += `\n警告: ${player.userName} 现在拥有 ${player.getTotalTokens()} 个宝石，超过上限 ${MAX_TOKENS_PLAYER}！请在后续操作或回合结束时处理。`;
        }

        const nobleCheckMsg = this.checkAndAwardNobles(player);
        if (nobleCheckMsg) {
            reply += "\n" + nobleCheckMsg;
        }

        const endTurnResult = this.nextTurn();
        if (endTurnResult) { // Game ended
            return endTurnResult;
        }
        reply += `\n轮到 ${this.getCurrentPlayer().userName} 行动。`;
        return reply;
    }

    reserveCard(userId, level, cardIdentifier) {
        if (this.state !== GAME_STATE.IN_PROGRESS) {
            return "游戏未开始。";
        }
        const player = this.getCurrentPlayer();
        if (player.userId !== userId) {
            return "还没轮到你。";
        }
        if (player.reservedCards.length >= MAX_RESERVED_CARDS) {
            return `你已保留 ${MAX_RESERVED_CARDS} 张卡，达到上限。`;
        }

        let cardToReserveId = null;
        let takenFromFaceUp = false;
        let faceUpIndex = -1;

        if (cardIdentifier === '牌堆' || cardIdentifier === 'deck') {
            if (this.devCardsDecks[level].length === 0) {
                return `等级 ${level} 牌堆已空。`;
            }
            cardToReserveId = this.devCardsDecks[level].pop();
        } else {
            faceUpIndex = parseInt(cardIdentifier) - 1;
            if (isNaN(faceUpIndex) || faceUpIndex < 0 || faceUpIndex >= this.devCardsFaceUp[level].length) {
                return `无效的卡牌位置。等级 ${level} 只有 ${this.devCardsFaceUp[level].length} 张可见牌。请输入1-${this.devCardsFaceUp[level].length} 或 "牌堆"。`;
            }
            cardToReserveId = this.devCardsFaceUp[level][faceUpIndex];
            takenFromFaceUp = true;
        }

        if (!cardToReserveId) {
            return "无法找到要保留的卡牌。";
        }

        player.reservedCards.push(cardToReserveId);
        let reply = `${player.userName} 保留了 ${formatCard(cardToReserveId, false)}.`;

        if (this.gemSupply[GOLD] > 0) {
            player.tokens[GOLD]++;
            this.gemSupply[GOLD]--;
            reply += ` 并拿取了1个黄金。`;
            if (player.getTotalTokens() > MAX_TOKENS_PLAYER) {
                reply += `\n警告: ${player.userName} 现在拥有 ${player.getTotalTokens()} 个宝石，超过上限 ${MAX_TOKENS_PLAYER}！`;
            }
        } else {
            reply += ` (黄金已无库存).`;
        }

        if (takenFromFaceUp) {
            this.devCardsFaceUp[level].splice(faceUpIndex, 1);
            if (this.devCardsDecks[level].length > 0) {
                this.devCardsFaceUp[level].push(this.devCardsDecks[level].pop());
            }
        }

        const nobleCheckMsg = this.checkAndAwardNobles(player);
        if (nobleCheckMsg) {
            reply += "\n" + nobleCheckMsg;
        }

        const endTurnResult = this.nextTurn();
        if (endTurnResult) { // Game ended
            return endTurnResult;
        }
        reply += `\n轮到 ${this.getCurrentPlayer().userName} 行动。`;
        return reply;
    }

    buyCard(userId, cardIdOrLevel, cardIndexIfFaceUp) {
        if (this.state !== GAME_STATE.IN_PROGRESS) {
            return "游戏未开始。";
        }
        const player = this.getCurrentPlayer();
        if (player.userId !== userId) {
            return "还没轮到你。";
        }

        let cardToBuyId = null;
        let cardSourceType = ''; // 'faceup' or 'reserved'
        let originalFaceUpLevel = -1;
        let originalFaceUpIndex = -1;
        let reservedIndex = -1;

        const idOrLevelStr = String(cardIdOrLevel).toUpperCase();

        // Check if buying from face-up cards
        if (idOrLevelStr.startsWith('L') && cardIndexIfFaceUp !== undefined) {
            const level = parseInt(idOrLevelStr.replace('L', ''));
            originalFaceUpIndex = parseInt(cardIndexIfFaceUp) - 1;

            if (isNaN(level) || !this.devCardsFaceUp[level] ||
                isNaN(originalFaceUpIndex) || originalFaceUpIndex < 0 || originalFaceUpIndex >= this.devCardsFaceUp[level].length) {
                return "购买场上卡牌：无效的卡牌等级或位置。格式：.spl 购买 L<等级> <1-4位置>";
            }
            cardToBuyId = this.devCardsFaceUp[level][originalFaceUpIndex];
            cardSourceType = 'faceup';
            originalFaceUpLevel = level;
        }
        // Check if buying from reserved cards (by R<index> or by card ID)
        else if (idOrLevelStr.startsWith('R') || (CARD_DEFINITIONS[idOrLevelStr] && player.reservedCards.includes(idOrLevelStr))) {
            if (idOrLevelStr.startsWith('R')) { // Buying by R<index>
                reservedIndex = parseInt(idOrLevelStr.substring(1)) - 1;
                if (isNaN(reservedIndex) || reservedIndex < 0 || reservedIndex >= player.reservedCards.length) {
                    return `购买预定卡牌：无效的预定卡牌序号。你有 ${player.reservedCards.length} 张预定卡。请输入 R1-${player.reservedCards.length}。`;
                }
                cardToBuyId = player.reservedCards[reservedIndex];
            } else { // Buying by card ID (must be in reserved cards)
                 if (player.reservedCards.includes(idOrLevelStr)) {
                    cardToBuyId = idOrLevelStr;
                    reservedIndex = player.reservedCards.indexOf(idOrLevelStr);
                 } else {
                     // This case should ideally not be hit if the outer condition is structured well,
                     // but it's a fallback.
                     return `你没有预定ID为 ${idOrLevelStr} 的卡牌。请使用 R<序号> 或检查ID。`;
                 }
            }
            if (!cardToBuyId) { // Should not happen if logic above is correct
                return `未找到预定的卡牌 ${cardIdOrLevel}。`;
            }
            cardSourceType = 'reserved';
        } else {
            return "购买指令格式错误。购买场上卡牌请输入：.spl 购买 L<等级> <1-4位置>。购买预定卡牌请输入：.spl 购买 R<序号> 或 .spl 购买 <预定卡牌ID>";
        }

        const card = CARD_DEFINITIONS[cardToBuyId];
        if (!player.canAfford(card.cost)) {
            let neededStr = "";
            for (const gem of ALL_GEM_COLORS) {
                const needed = Math.max(0, card.cost[gem] - (player.gemBonuses[gem] || 0) - player.tokens[gem]);
                if (needed > 0) {
                    neededStr += `${needed}${gem} `;
                }
            }
            return `资源不足以购买 ${formatCard(cardToBuyId)}。还差 (大约) ${neededStr.trim()} (可用黄金替代)。`;
        }

        const payment = player.getPayment(card.cost);
        if (!payment) {
            return "计算支付时出错。"; // Should not happen if canAfford passed
        }

        // Process payment
        for (const color in payment) {
            player.tokens[color] -= payment[color];
            this.gemSupply[color] += payment[color];
        }

        player.boughtCards.push(cardToBuyId);

        if (cardSourceType === 'reserved') {
            player.reservedCards.splice(reservedIndex, 1);
        } else if (cardSourceType === 'faceup') {
            this.devCardsFaceUp[originalFaceUpLevel].splice(originalFaceUpIndex, 1);
            if (this.devCardsDecks[originalFaceUpLevel].length > 0) {
                this.devCardsFaceUp[originalFaceUpLevel].push(this.devCardsDecks[originalFaceUpLevel].pop());
            }
        }

        player.updateDerivedStats();
        let reply = `${player.userName} 购买了 ${formatCard(cardToBuyId, false)} (花费: ${formatCost(payment, true)})！`;
        reply += `\n${player.userName} 当前 ${player.prestigePoints}VP。`;

        const nobleCheckMsg = this.checkAndAwardNobles(player);
        if (nobleCheckMsg) {
            reply += "\n" + nobleCheckMsg;
        }

        const endTurnResult = this.nextTurn();
        if (endTurnResult) { // Game ended
            return endTurnResult;
        }
        reply += `\n轮到 ${this.getCurrentPlayer().userName} 行动。`;
        return reply;
    }

    checkAndAwardNobles(player, chosenNobleId = null) {
        const eligibleNobles = [];
        this.nobleTilesFaceUp.forEach(nobleId => {
            const noble = NOBLE_DEFINITIONS[nobleId];
            let canClaim = true;
            for (const color in noble.cost) {
                if (noble.cost[color] > 0 && (player.gemBonuses[color] || 0) < noble.cost[color]) {
                    canClaim = false;
                    break;
                }
            }
            if (canClaim) {
                eligibleNobles.push(nobleId);
            }
        });

        if (eligibleNobles.length === 0) {
            return null;
        }

        let awardedNobleId = null;
        let message = "";

        if (eligibleNobles.length === 1) {
            awardedNobleId = eligibleNobles[0];
            message = `${player.userName} 自动获得了贵族 ${formatNoble(awardedNobleId)}！`;
        } else { // Multiple eligible nobles
            if (chosenNobleId && eligibleNobles.includes(chosenNobleId)) {
                awardedNobleId = chosenNobleId;
                message = `${player.userName} 选择了并获得了贵族 ${formatNoble(awardedNobleId)}！`;
            } else {
                const nobleChoices = eligibleNobles.map((id, idx) => `[${idx + 1}] ${formatNoble(id)} (输入 .spl 贵族 ${id})`).join('\n');
                return `${player.userName} 满足多个贵族的条件，请选择一个:\n${nobleChoices}`;
            }
        }

        if (awardedNobleId) {
            player.nobles.push(awardedNobleId);
            player.updateDerivedStats();
            this.nobleTilesFaceUp = this.nobleTilesFaceUp.filter(id => id !== awardedNobleId);
            message += `\n${player.userName} 当前 ${player.prestigePoints}VP。`;
            return message;
        }
        return null; // Should not be reached if logic is correct, but as a fallback.
    }

    concludeGame(reason = "游戏结束。") {
        if (this.state === GAME_STATE.CONCLUDED) {
            return "游戏早已结束。";
        }
        this.state = GAME_STATE.CONCLUDED;

        let summary = reason + "\n--- 游戏结算 ---\n";

        this.players.forEach(p => p.updateDerivedStats()); // Ensure stats are final

        this.players.sort((a, b) => {
            if (b.prestigePoints !== a.prestigePoints) {
                return b.prestigePoints - a.prestigePoints;
            }
            return a.boughtCards.length - b.boughtCards.length; // Tie-breaker: fewer cards is better
        });

        const playerResults = [];
        let lastScore = -1;
        let lastCardCount = -1;
        let currentRank = 0;

        this.players.forEach((p, i) => {
            if (p.prestigePoints !== lastScore || p.boughtCards.length !== lastCardCount) {
                currentRank = i + 1;
            }
            lastScore = p.prestigePoints;
            lastCardCount = p.boughtCards.length;
            const isWinner = currentRank === 1 && p.prestigePoints > 0; // Must have points to be a winner

            playerResults.push({
                userId: p.userId,
                userName: p.userName,
                score: p.prestigePoints,
                cardsBought: p.boughtCards.length,
                rank: currentRank,
                isWinner: isWinner
            });
            summary += `第 ${currentRank} 名: ${p.userName} - ${p.prestigePoints}VP (购买了 ${p.boughtCards.length} 张发展卡)\n`;
        });

        const winners = playerResults.filter(p => p.isWinner);
        if (winners.length > 0) {
            summary += `\n获胜者是: ${winners.map(w => w.userName).join(', ')}！恭喜！\n`;
        } else if (this.players.length > 0 && this.players[0].prestigePoints === 0) {
            summary += "\n没有玩家得分超过0，平局或无人获胜。\n";
        } else if (this.players.length > 0) { // Handles cases like all players having negative (though not possible here) or 0 points, but the sort still picks a "top"
            summary += `\n最高分玩家: ${this.players[0].userName}！恭喜！\n`;
        }

        return { summary, playerResults };
    }

    getGameStatus(requestingPlayerId = null) {
        if (this.state === GAME_STATE.IDLE) {
            return "当前没有璀璨宝石游戏。";
        }
        if (this.state === GAME_STATE.WAITING) {
            return `璀璨宝石游戏等待开始，发起人: ${this.getPlayer(this.gameInitiatorId)?.userName || '未知'}。\n已加入玩家 (${this.players.length}/4): ${this.players.map(p => p.userName).join(', ')}\n发起人请输入【.spl 开始】。`;
        }

        let status = `--- 璀璨宝石进行中 (版本 ${VERSION}) ---\n`;
        const currentPlayer = this.getCurrentPlayer();
        status += `当前回合: ${currentPlayer.userName}\n`;

        status += "宝石库存: ";
        ALL_GEM_COLORS.forEach(c => status += `${this.gemSupply[c]}${c} `);
        status += `${this.gemSupply[GOLD]}${GOLD}\n`;

        status += "场上贵族:\n";
        this.nobleTilesFaceUp.forEach((id, i) => {
            status += `  [N${i + 1}] ${formatNoble(id)}\n`;
        });

        for (let level = 3; level >= 1; level--) {
            status += `等级 ${level} 卡牌:\n`;
            if (this.devCardsFaceUp[level].length === 0 && this.devCardsDecks[level].length === 0) {
                status += "  (已无卡牌)\n";
            } else {
                this.devCardsFaceUp[level].forEach((id, i) => {
                    status += `  [L${level}-${i + 1}] ${formatCard(id)}\n`;
                });
                status += `  (牌堆余: ${this.devCardsDecks[level].length})\n`;
            }
        }

        status += "\n玩家信息:\n";
        this.players.forEach(p => {
            status += `  ${p.userName}: ${p.prestigePoints}VP, 手牌宝石: ${p.getTotalTokens()}, 发展卡: ${p.boughtCards.length}\n`;
            if (requestingPlayerId === p.userId || this.state === GAME_STATE.CONCLUDED) {
                status += `    宝石: ${formatCost(p.tokens, true)}\n`;
                status += `    奖励: ${formatCost(p.gemBonuses)}\n`;
                if (p.reservedCards.length > 0) {
                    status += `    预定 (${p.reservedCards.length}/${MAX_RESERVED_CARDS}):\n`;
                    p.reservedCards.forEach((cardId, i) => {
                        status += `      [R${i + 1}] ${formatCard(cardId)} (ID: ${cardId})\n`;
                    });
                }
            }
        });

        if (this.roundCompletedAfterVPTrigger) {
            status += `\n!! 最终回合进行中，剩余 ${this.players.length - this.turnsTakenInFinalRound} 位玩家未行动 !!\n`;
        }
        return status;
    }
}

// --- 玩家全局统计类 ---
class PlayerOverallStats {
    constructor() {
        this.gamesPlayed = 0;
        this.wins = 0;
        this.totalScore = 0;
        this.totalRank = 0;
        this.rankCounts = {}; // e.g., {1: 5, 2: 3} for 5 first place, 3 second place
    }

    update(playerGameResult) {
        this.gamesPlayed++;
        if (playerGameResult.isWinner) {
            this.wins++;
        }
        this.totalScore += playerGameResult.score;
        this.totalRank += playerGameResult.rank;
        this.rankCounts[playerGameResult.rank] = (this.rankCounts[playerGameResult.rank] || 0) + 1;
    }

    getStatsSummary(playerName) {
        let summary = `${playerName} 的璀璨宝石战绩:\n`;
        summary += `  总场数: ${this.gamesPlayed}\n`;
        summary += `  胜场数: ${this.wins} (胜率: ${this.gamesPlayed > 0 ? (this.wins / this.gamesPlayed * 100).toFixed(1) : 0}%)\n`;
        summary += `  平均得分: ${this.gamesPlayed > 0 ? (this.totalScore / this.gamesPlayed).toFixed(2) : 'N/A'}\n`;
        summary += `  平均名次: ${this.gamesPlayed > 0 ? (this.totalRank / this.gamesPlayed).toFixed(2) : 'N/A'}\n`;
        summary += `  名次分布:\n`;

        const ranks = Object.keys(this.rankCounts).sort((a, b) => parseInt(a) - parseInt(b));
        for (const rank of ranks) {
            summary += `    第 ${rank} 名: ${this.rankCounts[rank]} 次\n`;
        }
        return summary;
    }
}

// --- SealDice 扩展初始化 ---
let ext = seal.ext.find('璀璨宝石');
if (!ext) {
    ext = seal.ext.new('璀璨宝石', 'SplendorAI', VERSION);
    seal.ext.register(ext);
} else {
    ext.version = VERSION; // Update version if extension already exists
}

// --- SealDice 命令 ---
const cmdSplendor = seal.ext.newCmdItemInfo();
cmdSplendor.name = 'spl';
cmdSplendor.aliases = ['splendor', '璀璨宝石'];
cmdSplendor.help = `璀璨宝石游戏指令 (版本 ${VERSION}):
.spl 发起/加入/开始
.spl 状态 (查看游戏全局状态)
.spl 我的状态 (查看个人详细状态)
.spl 拿 <颜色1> <颜色2> <颜色3> (拿3个不同宝石)
.spl 拿 <颜色> <颜色> (拿2个同色宝石, 例: .spl 拿 红 红)
.spl 保留 L<等级> <1-4牌位 或 "牌堆"> (例: .spl 保留 L1 2)
.spl 购买 L<等级> <1-4牌位> (购买场上卡, 例: .spl 购买 L1 2)
.spl 购买 R<1-3序号> (购买预定卡, 例: .spl 购买 R1)
.spl 购买 <卡牌ID> (用ID购买预定卡, ID在'我的状态'中可见)
.spl 贵族 <贵族ID> (当满足多个贵族条件时选择一个, 贵族ID在提示中)
.spl 结束 (发起人或管理员强制结束)
.spl 战绩 [@玩家] (查看玩家统计数据)
可用颜色: ${ALL_GEM_COLORS.join('/')}`;
cmdSplendor.disabledInPrivate = true; // Game is typically group-based

cmdSplendor.solve = (ctx, msg, cmdArgs) => {
    const groupCtxKey = `splendor_game:${ctx.group.groupId}`;
    let game = new SplendorGame(ext.storageGet(groupCtxKey));
    const subCmdRaw = cmdArgs.getArgN(1);

    if (!subCmdRaw) {
        seal.replyToSender(ctx, msg, cmdSplendor.help);
        return seal.ext.newCmdExecuteResult(true);
    }

    const subCmd = subCmdRaw.toLowerCase();
    const player = {
        id: ctx.player.userId,
        name: ctx.player.name
    };
    let reply = "";

    // Game timeout check
    if (game.state !== GAME_STATE.IDLE && game.state !== GAME_STATE.CONCLUDED &&
        (Date.now() - (game.lastActivityTime || 0) > GAME_TIMEOUT_MS)) {
        if (game.state === GAME_STATE.IN_PROGRESS || game.state === GAME_STATE.WAITING) {
            const conclusion = game.concludeGame("游戏超时自动结束。");
            conclusion.playerResults.forEach(pData => {
                const statsKey = `splendor_stats:${pData.userId}`;
                let playerStats = new PlayerOverallStats();
                const storedStats = ext.storageGet(statsKey);
                if (storedStats) {
                    Object.assign(playerStats, JSON.parse(storedStats));
                }
                playerStats.update(pData);
                ext.storageSet(statsKey, JSON.stringify(playerStats));
            });
            reply = conclusion.summary;
            game.reset(); // Reset game state after timeout conclusion
            ext.storageSet(groupCtxKey, JSON.stringify(game.toJSON()));
            seal.replyToSender(ctx, msg, reply);
            return seal.ext.newCmdExecuteResult(true);
        }
    }

    switch (subCmd) {
        case '发起':
            if (game.state !== GAME_STATE.IDLE && game.state !== GAME_STATE.CONCLUDED) {
                reply = "当前群组已有一局璀璨宝石游戏。";
            } else {
                game.reset();
                game.state = GAME_STATE.WAITING;
                reply = game.addPlayer(player.id, player.name);
            }
            break;

        case '加入':
            reply = game.addPlayer(player.id, player.name);
            break;

        case '开始':
            reply = game.startGame(player.id);
            break;

        case '状态':
            reply = game.getGameStatus();
            break;

        case '我的状态':
            if (game.state === GAME_STATE.IDLE || game.state === GAME_STATE.WAITING) {
                reply = "游戏尚未开始。";
            } else {
                const pState = game.getPlayer(player.id);
                if (!pState) {
                    reply = "你不在当前游戏中。";
                    break;
                }
                reply = `${pState.userName} 的状态:\n`;
                reply += `  VP: ${pState.prestigePoints}\n`;
                reply += `  宝石: ${formatCost(pState.tokens, true)} (总数: ${pState.getTotalTokens()})\n`;
                reply += `  奖励: ${formatCost(pState.gemBonuses)}\n`;
                reply += `  发展卡 (${pState.boughtCards.length}张): ${pState.boughtCards.map(id => CARD_DEFINITIONS[id].bonus).join('') || '(无)'}\n`;
                if (pState.reservedCards.length > 0) {
                    reply += `  预定 (${pState.reservedCards.length}/${MAX_RESERVED_CARDS}):\n`;
                    pState.reservedCards.forEach((cardId, i) => {
                        reply += `    [R${i + 1}] ${formatCard(cardId)} (ID: ${cardId})\n`;
                    });
                } else {
                    reply += "  预定: (无)\n";
                }
                if (pState.nobles.length > 0) {
                    reply += `  贵族: ${pState.nobles.map(id => `N[${NOBLE_DEFINITIONS[id].points}VP]`).join(' ')}\n`;
                }
            }
            break;

        case '拿':
            const gemsToTake = [];
            for (let i = 2; i <= 4; i++) { // Args start from 1, command is arg 1, gems are 2,3,4
                const gemColor = cmdArgs.getArgN(i);
                if (gemColor) {
                    gemsToTake.push(gemColor);
                } else {
                    break;
                }
            }
            if (gemsToTake.length < 2 || gemsToTake.length > 3) {
                reply = "请指定要拿取的宝石 (2个同色或3个不同色)。";
            } else {
                reply = game.takeTokens(player.id, gemsToTake);
            }
            break;

        case '保留':
            {
                const levelStr = cmdArgs.getArgN(2);
                const cardId = cmdArgs.getArgN(3); // Can be index or "牌堆"
                if (!levelStr || !cardId) {
                    reply = "格式错误。示例: .spl 保留 L1 2  或  .spl 保留 L1 牌堆";
                    break;
                }
                const level = parseInt(levelStr.replace('L', ''));
                if (isNaN(level) || level < 1 || level > 3) {
                    reply = "无效的卡牌等级 (L1, L2, L3)。";
                    break;
                }
                reply = game.reserveCard(player.id, level, cardId);
            }
            break;

        case '购买':
            {
                const idOrLevel = cmdArgs.getArgN(2); // e.g., L1, R1, or CardID
                const indexIfFaceUp = cmdArgs.getArgN(3); // e.g., 2 (for L1 2)
                if (!idOrLevel) {
                    reply = "请指定要购买的卡牌。示例: .spl 购买 L1 2 (场上) 或 .spl 购买 R1 (预定)";
                    break;
                }
                reply = game.buyCard(player.id, idOrLevel, indexIfFaceUp);
            }
            break;

        case '贵族':
            {
                if (game.state !== GAME_STATE.IN_PROGRESS) {
                    reply = "游戏未开始。";
                    break;
                }
                const p = game.getPlayer(player.id);
                if (!p ) { // Player might not be in game or it's not their turn to choose a noble.
                           // The checkAndAwardNobles will handle if they are eligible.
                    reply = "你不在游戏中，或现在无法选择贵族。";
                    break;
                }
                const nobleIdToClaim = cmdArgs.getArgN(2);
                if (!nobleIdToClaim) {
                    reply = "请指定要选择的贵族ID。";
                    break;
                }
                const nobleMsg = game.checkAndAwardNobles(p, nobleIdToClaim.toUpperCase());
                if (nobleMsg && nobleMsg.includes("获得了贵族")) { // Successfully claimed
                    reply = nobleMsg;
                    // If a noble was chosen, it implies it's the end of their action sequence.
                    // The main game logic (like buyCard/reserveCard/takeTokens) handles nextTurn.
                    // If checkAndAwardNobles is called *after* an action, nextTurn is already handled.
                    // If this is a standalone noble choice, we need to ensure turn progresses if it's part of the "action".
                    // However, Splendor rules usually have noble visits as a *consequence* of an action, not an action itself.
                    // The current implementation checks nobles *after* other actions or if a choice is pending.
                } else if (nobleMsg) { // e.g. prompt to choose again or error message from checkAndAwardNobles
                    reply = nobleMsg;
                } else {
                    reply = `无法选择贵族 ${nobleIdToClaim}，可能条件不满足或ID错误。`;
                }
            }
            break;

        case '结束':
            if (game.state === GAME_STATE.IDLE || game.state === GAME_STATE.CONCLUDED) {
                reply = "没有正在进行的游戏可以结束。";
            } else if (game.gameInitiatorId === player.id || ctx.privilegeLevel >= 100) { // Initiator or admin
                const conclusion = game.concludeGame(`${player.name} 强制结束了游戏。`);
                // Process stats for concluded game
                conclusion.playerResults.forEach(pData => {
                    const statsKey = `splendor_stats:${pData.userId}`;
                    let playerStats = new PlayerOverallStats();
                    const storedStats = ext.storageGet(statsKey);
                    if (storedStats) {
                        Object.assign(playerStats, JSON.parse(storedStats));
                    }
                    playerStats.update(pData);
                    ext.storageSet(statsKey, JSON.stringify(playerStats));
                });
                reply = conclusion.summary;
                game.reset(); // Reset game state
            } else {
                reply = "只有游戏发起者或管理员才能强制结束游戏。";
            }
            break;

        case '战绩':
            {
                let targetPlayerCtx = seal.getCtxProxyFirst(ctx, cmdArgs); // Tries to get @'d player
                let targetPlayerIdToShow = player.id; // Default to self
                let targetPlayerNameToShow = player.name;

                if (targetPlayerCtx && cmdArgs.getArgN(2) && cmdArgs.getArgN(2).startsWith('@')) {
                    targetPlayerIdToShow = targetPlayerCtx.player.userId;
                    targetPlayerNameToShow = targetPlayerCtx.player.name;
                }

                const statsKey = `splendor_stats:${targetPlayerIdToShow}`;
                const storedStats = ext.storageGet(statsKey);
                if (storedStats) {
                    const playerStats = new PlayerOverallStats();
                    Object.assign(playerStats, JSON.parse(storedStats));
                    reply = playerStats.getStatsSummary(targetPlayerNameToShow);
                } else {
                    reply = `${targetPlayerNameToShow} 暂无璀璨宝石战绩记录。`;
                }
            }
            break;

        default:
            reply = "未知指令。查看帮助请输入 .spl";
            break;
    }

    // Handle game conclusion replies (which are objects with summary and playerResults)
    if (typeof reply === 'object' && reply.summary && reply.playerResults) {
        reply.playerResults.forEach(pData => {
            const statsKey = `splendor_stats:${pData.userId}`;
            let playerStats = new PlayerOverallStats();
            const storedStats = ext.storageGet(statsKey);
            if (storedStats) {
                Object.assign(playerStats, JSON.parse(storedStats));
            }
            playerStats.update(pData);
            ext.storageSet(statsKey, JSON.stringify(playerStats));
        });
        reply = reply.summary; // Send only summary as chat message
        game.reset(); // Game is concluded, so reset its state for storage
    }

    if (reply) {
        ext.storageSet(groupCtxKey, JSON.stringify(game.toJSON())); // Save game state
        seal.replyToSender(ctx, msg, reply);
    }

    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['spl'] = cmdSplendor;
ext.cmdMap['splendor'] = cmdSplendor;
ext.cmdMap['璀璨宝石'] = cmdSplendor;