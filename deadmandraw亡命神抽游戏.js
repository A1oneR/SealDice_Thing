// ==UserScript==
// @name         亡命神抽 (Dead Man's Draw)
// @author       Gemini 2.5 Pro, Air
// @version      1.0.6
// @description  经典的亡命神抽游戏，看谁能获得最多的宝藏！
// @timestamp    1747227352
// @license      Apache-2.0
// @homepageURL  https://github.com/A1oneR/SealDice_Thing
// ==/UserScript==

const VERSION = '1.0.6';

// 卡牌定义
const SUIT_NAMES = {
    'M': '美人鱼', 'T': '藏宝图', 'D': '弯刀', 'G': '钩子',
    'C': '船锚', 'Y': '钥匙', 'B': '宝箱', 'H': '海怪',
    'P': '大炮', 'Z': '占卜球'
};
const ALL_SUITS = Object.keys(SUIT_NAMES);

// 游戏状态常量
const GAME_STATE = {
    IDLE: 0,        // 空闲，未开始
    WAITING: 1,     // 等待玩家加入
    IN_PROGRESS: 2, // 游戏中
    CONCLUDED: 3    // 已结束（但可能未清理）
};

class PlayerState {
    constructor(userId, userName) {
        this.userId = userId;
        this.userName = userName;
        this.collectedCards = {}; // {'M': ['M1', 'M4'], 'D': ['D3']}
        ALL_SUITS.forEach(suit => this.collectedCards[suit] = []);
        this.score = 0;
        this.totalCollectedCount = 0; // 收集的总卡牌数
        this.grandSlams = 0; // 大满贯次数
    }

    addCollectedCard(card) {
        const suit = card.slice(-2, -1);
        if (this.collectedCards[suit]) {
            this.collectedCards[suit].push(card);
            this.collectedCards[suit].sort((a, b) => parseInt(b.slice(-1)) - parseInt(a.slice(-1)));
            this.totalCollectedCount++;
        }
    }

    removeCollectedCard(cardIdOrFullName) {
        let suit, cardValue, cardFullNameToMatch;
        const inputNormalized = cardIdOrFullName.toUpperCase();

        if (inputNormalized.length <= 3 && /^[A-Z]\d$/.test(inputNormalized)) { // 是短ID，如 D5, d5
            suit = inputNormalized.slice(0, 1);
            cardValue = parseInt(inputNormalized.slice(1));
            if (!SUIT_NAMES[suit]) return null; // 无效花色字母
            cardFullNameToMatch = `${SUIT_NAMES[suit]}${suit}${cardValue}`;
        } else { // 认为是全名，需要找到标准全名
             // 尝试在所有可能的卡牌全名中查找（不区分大小写）
            let foundStandardFullName = null;
            for (const s_suit of ALL_SUITS) {
                for (let val = 0; val <= 9; val++) { // 假设卡牌值最大到9
                    const standardName = `${SUIT_NAMES[s_suit]}${s_suit}${val}`;
                    if (standardName.toLowerCase() === cardIdOrFullName.toLowerCase()) {
                        foundStandardFullName = standardName;
                        break;
                    }
                }
                if (foundStandardFullName) break;
            }
            if (!foundStandardFullName) return null; // 无法识别的全名
            cardFullNameToMatch = foundStandardFullName;
            suit = cardFullNameToMatch.slice(-2,-1);
        }


        if (this.collectedCards[suit] && this.collectedCards[suit].length > 0) {
            // 规则通常要求操作顶牌，所以我们主要检查顶牌
            if (this.collectedCards[suit][0] === cardFullNameToMatch) {
                const removedCard = this.collectedCards[suit].shift(); // 移除第一张
                this.totalCollectedCount--;
                return removedCard;
            } else {
                 // 如果不是顶牌，但允许操作非顶牌（通常规则不允许，但以防万一）
                 // 或者用户输入的是非顶牌的ID，这里会找不到
                const index = this.collectedCards[suit].findIndex(c => c === cardFullNameToMatch);
                if (index !== -1) { // 一般钩子只钩顶牌，这里作为后备
                    // const removedCard = this.collectedCards[suit].splice(index, 1)[0];
                    // this.totalCollectedCount--;
                    // return removedCard;
                    return null; // 严格按顶牌规则
                }
            }
        }
        return null;
    }


    calculateScore() {
        let currentScore = 0;
        for (const suit in this.collectedCards) {
            if (this.collectedCards[suit].length > 0) {
                currentScore += parseInt(this.collectedCards[suit][0].slice(-1));
            }
        }
        this.score = currentScore;
        return this.score;
    }

    getCollectionDescription() {
        let desc = `${this.userName} 的战利品:`;
        let count = 0;
        for (const suit in this.collectedCards) {
            if (this.collectedCards[suit].length > 0) {
                desc += ` ${this.collectedCards[suit][0]}`;
                if (this.collectedCards[suit].length > 1) {
                     desc += `(共${this.collectedCards[suit].length}张)`;
                }
                count++;
            }
        }
        if (count === 0) {
            desc += " (空)";
        }
        return desc + ` | 总分: ${this.calculateScore()}`;
    }
}


class ShenChouGame {
    constructor(serializedState = null) {
        if (serializedState) {
            const obj = JSON.parse(serializedState);
            this.state = obj.state;
            this.players = obj.players.map(pData => {
                const player = new PlayerState(pData.userId, pData.userName);
                player.collectedCards = pData.collectedCards;
                player.score = pData.score;
                player.totalCollectedCount = pData.totalCollectedCount;
                player.grandSlams = pData.grandSlams;
                return player;
            });
            this.playerOrder = obj.playerOrder;
            this.currentTurnPlayerId = obj.currentTurnPlayerId;
            this.gameInitiatorId = obj.gameInitiatorId;
            this.deckPile = obj.deckPile;
            this.discardPile = obj.discardPile;
            this.boardCards = obj.boardCards;
            this.activeEffects = obj.activeEffects || {};
            this.lastActivityTime = obj.lastActivityTime || Date.now();
        } else {
            this.reset();
        }
    }

    toJSON() {
        return {
            state: this.state,
            players: this.players.map(p => ({
                userId: p.userId,
                userName: p.userName,
                collectedCards: p.collectedCards,
                score: p.score,
                totalCollectedCount: p.totalCollectedCount,
                grandSlams: p.grandSlams,
            })),
            playerOrder: this.playerOrder,
            currentTurnPlayerId: this.currentTurnPlayerId,
            gameInitiatorId: this.gameInitiatorId,
            deckPile: this.deckPile,
            discardPile: this.discardPile,
            boardCards: this.boardCards,
            activeEffects: this.activeEffects,
            lastActivityTime: this.lastActivityTime
        };
    }

    reset() {
        this.state = GAME_STATE.IDLE;
        this.players = [];
        this.playerOrder = [];
        this.currentTurnPlayerId = null;
        this.gameInitiatorId = null;
        this.deckPile = [];
        this.discardPile = [];
        this.boardCards = [];
        this.activeEffects = {};
        this.lastActivityTime = Date.now();
    }

    _shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    _generateCards(playerCount) {
        const baseValues = [1, 2, 3, 4, 6, 7, 8, 9];
        const discardValues = [0, 5];
        let fullDeck = [];
        ALL_SUITS.forEach(suit => {
            baseValues.forEach(val => fullDeck.push(`${SUIT_NAMES[suit]}${suit}${val}`));
        });
        this._shuffle(fullDeck);
        this.deckPile = fullDeck.slice(0, 16 * playerCount);

        let fullDiscard = [];
        ALL_SUITS.forEach(suit => {
            discardValues.forEach(val => fullDiscard.push(`${SUIT_NAMES[suit]}${suit}${val}`));
        });
        this._shuffle(fullDiscard);
        this.discardPile = fullDiscard.slice(0, 4 * playerCount);
    }

    addPlayer(userId, userName) {
        if (this.state !== GAME_STATE.WAITING) return "游戏已开始或未初始化，无法加入。";
        if (this.players.length >= 5) return "人数已满（最多5人）。";
        if (this.players.find(p => p.userId === userId)) return "你已经加入游戏了。";
        
        const player = new PlayerState(userId, userName);
        this.players.push(player);
        if (!this.gameInitiatorId) {
            this.gameInitiatorId = userId;
        }
        this.lastActivityTime = Date.now();
        return `${userName} 已加入游戏！当前人数: ${this.players.length}。`;
    }

    startGame(initiatorId) {
        if (this.state !== GAME_STATE.WAITING) return "游戏不在等待状态，无法开始。";
        if (this.gameInitiatorId !== initiatorId) return "只有游戏发起者才能开始游戏。";
        if (this.players.length < 2) return "至少需要2名玩家才能开始游戏。";

        this._generateCards(this.players.length);
        this.playerOrder = this._shuffle(this.players.map(p => p.userId));
        this.currentTurnPlayerId = this.playerOrder[0];
        this.state = GAME_STATE.IN_PROGRESS;
        this.boardCards = [];
        this.activeEffects = {};
        this.lastActivityTime = Date.now();
        const currentPlayer = this.getPlayer(this.currentTurnPlayerId);
        return `游戏开始！共 ${this.players.length} 名玩家。\n玩家顺序: ${this.playerOrder.map(uid => this.getPlayer(uid).userName).join(" -> ")}\n轮到 ${currentPlayer.userName} 行动，请【抽卡】。`;
    }

    getPlayer(userId) {
        return this.players.find(p => p.userId === userId);
    }

    getCurrentPlayer() {
        return this.getPlayer(this.currentTurnPlayerId);
    }
    
    _nextTurn() {
        const currentIndex = this.playerOrder.indexOf(this.currentTurnPlayerId);
        const nextIndex = (currentIndex + 1) % this.playerOrder.length;
        this.currentTurnPlayerId = this.playerOrder[nextIndex];
        this.boardCards = [];
        // activeEffects 清理在回合结束时或爆炸时
        this.lastActivityTime = Date.now();
    }

    _checkBoardForExplosion(newCard) {
        const newCardSuit = newCard.slice(-2, -1);
        return this.boardCards.some(card => card.slice(-2, -1) === newCardSuit);
    }

    _isKrakenRestrictionLifted() {
        const krakenIndex = this.boardCards.findIndex(card => card.slice(-2, -1) === 'H');
        if (krakenIndex === -1) { 
            return true;
        }
        const cardsAfterKraken = this.boardCards.length - 1 - krakenIndex;
        return cardsAfterKraken >= 2;
    }

    drawCard(userId) {
        if (this.state !== GAME_STATE.IN_PROGRESS) return "游戏未开始。";
        const player = this.getCurrentPlayer();
        if (player.userId !== userId) return "还没轮到你。";

        const isKrakenActiveAndBlocking = this.boardCards.some(card => card.slice(-2, -1) === 'H') && !this._isKrakenRestrictionLifted();

        if (!isKrakenActiveAndBlocking && (this.activeEffects['M'] || this.activeEffects['T'] || this.activeEffects['D'] || this.activeEffects['P'] || this.activeEffects['G'])) {
            return "你还有卡牌效果尚未使用，请先使用效果或【不抽了】。";
        }

        if (this.deckPile.length === 0) {
            return this.concludeGame("牌库已抽光！");
        }

        const drawnCard = this.deckPile.shift();
        let message = `${player.userName} 抽到了【${drawnCard}】。\n`;
        
        const exploded = this._checkBoardForExplosion(drawnCard);
        this.boardCards.push(drawnCard); // 先加入甲板再判断爆炸
        message += `当前甲板: ${this.boardCards.join(', ')}\n`;

        if (exploded) {
            message += `💥 爆炸了！回合结束。\n`;
            const anchorIndex = this.boardCards.findIndex(c => c.slice(-2, -1) === 'C');
            if (anchorIndex !== -1 && anchorIndex > 0) { 
                let savedCount = 0;
                for (let i = 0; i < anchorIndex; i++) {
                    player.addCollectedCard(this.boardCards[i]); // 此处boardCards已经包含了新抽的牌
                    savedCount++;
                }
                if (savedCount > 0) message += `船锚保护了 ${savedCount} 张牌！\n`;
            }
            this.discardPile.push(...this.boardCards);
            this.activeEffects = {}; 
            this._nextTurn();
            const nextPlayer = this.getCurrentPlayer();
            message += `轮到 ${nextPlayer.userName} 行动。`;
        } else {
            // 清理上一个一次性效果（如果新牌不是同类效果）
            const drawnSuit = drawnCard.slice(-2, -1);
            ['M', 'T', 'D', 'G', 'P'].forEach(effSuit => {
                if (this.activeEffects[effSuit] && drawnSuit !== effSuit) {
                    delete this.activeEffects[effSuit];
                }
            });

            let effectMsgObj = { text: "" };
            this._triggerCardEffectOnBoard(drawnCard, player, effectMsgObj, true); 
            message += effectMsgObj.text; 
        }
        this.lastActivityTime = Date.now();
        return message;
    }

    standTurn(userId) {
        if (this.state !== GAME_STATE.IN_PROGRESS) return "游戏未开始。";
        const player = this.getCurrentPlayer();
        if (player.userId !== userId) return "还没轮到你。";

        if (this.activeEffects['M'] || this.activeEffects['T'] || this.activeEffects['D'] || this.activeEffects['P'] || this.activeEffects['G']) {
            return "你还有卡牌效果尚未使用，请先使用效果。";
        }
        
        if (this.boardCards.some(card => card.slice(-2, -1) === 'H') && !this._isKrakenRestrictionLifted()) {
            const krakenCard = this.boardCards.find(card => card.slice(-2, -1) === 'H');
            const krakenIndex = this.boardCards.indexOf(krakenCard);
            const cardsNeeded = 2 - (this.boardCards.length - 1 - krakenIndex);
            return `海怪效果：你还需要在海怪右侧再获得 ${cardsNeeded} 张牌才能停牌。`;
        }

        if (this.boardCards.length === 0) {
            return "甲板上没有牌，你不能停牌，请先抽卡。";
        }

        let message = `${player.userName} 决定停牌，收获甲板上的: ${this.boardCards.join(', ')}\n`;
        
        if (this.boardCards.length >= 10) {
            player.grandSlams++;
            message += `🎉 ${player.userName} 达成大满贯！🎉\n`;
        }
        
        if (this.activeEffects['Y'] && this.activeEffects['B']) {
            const numToDraw = this.boardCards.length;
            const drawnFromDiscard = this.discardPile.splice(0, numToDraw);
            if (drawnFromDiscard.length > 0) {
                message += `钥匙和宝箱发挥效果！从弃牌堆额外获得 ${drawnFromDiscard.join(', ')}\n`;
                drawnFromDiscard.forEach(card => player.addCollectedCard(card));
            }
        }
        
        this.boardCards.forEach(card => player.addCollectedCard(card));
        
        message += `${player.getCollectionDescription()}\n`;
        
        this.activeEffects = {}; 
        this._nextTurn();
        const nextPlayer = this.getCurrentPlayer();
        message += `轮到 ${nextPlayer.userName} 行动。`;
        this.lastActivityTime = Date.now();
        return message;
    }
    
    _triggerCardEffectOnBoard(card, player, messageObj, isDirectDraw = false) {
        const suit = card.slice(-2, -1);
        let effectMessage = ""; 
        const prefix = isDirectDraw ? "" : "新牌效果：";
        
        switch (suit) {
            case 'M':
                if (this.boardCards.length > 1) {
                    this.activeEffects['M'] = true;
                    effectMessage = prefix + "美人鱼！你可以选择甲板上的一张牌移到最后。\n";
                } else {
                    effectMessage = prefix + "美人鱼出现，但甲板上只有一张牌，无需移动。\n";
                }
                break;
            case 'T':
                this.activeEffects['T'] = this.discardPile.slice(0, 3);
                this.discardPile.splice(0, this.activeEffects['T'].length);
                if (this.activeEffects['T'].length > 0) {
                    effectMessage = prefix + `藏宝图！从弃牌堆翻开 ${this.activeEffects['T'].join(', ')}。请选择一张加入甲板。\n`;
                } else {
                    effectMessage = prefix + "藏宝图出现，但弃牌堆为空。\n";
                    delete this.activeEffects['T'];
                }
                break;
            case 'D':
                {
                    let canRob = false; 
                    for (const otherPlayer of this.players) {
                        if (otherPlayer.userId === player.userId) continue;
                        for (const s_suit in otherPlayer.collectedCards) {
                            if (otherPlayer.collectedCards[s_suit].length > 0 && (!player.collectedCards[s_suit] || player.collectedCards[s_suit].length === 0)) {
                                canRob = true; break;
                            }
                        }
                        if (canRob) break;
                    }
                    if (canRob) {
                        this.activeEffects['D'] = true;
                        effectMessage = prefix + "弯刀！你可以抢夺其他玩家的一张你没有类别的顶牌。\n";
                    } else {
                        effectMessage = prefix + "弯刀出现，但无合法目标。\n";
                    }
                }
                break;
            case 'G':
                if (player.totalCollectedCount > 0) {
                    this.activeEffects['G'] = true;
                    effectMessage = prefix + "钩子！你可以将自己的一张战利品牌移回甲板。\n";
                } else {
                    effectMessage = prefix + "钩子出现，但你无战利品可钩。\n";
                }
                break;
            case 'Y': this.activeEffects['Y'] = true; effectMessage = prefix + "钥匙出现了！\n"; break;
            case 'B': this.activeEffects['B'] = true; effectMessage = prefix + "宝箱出现了！\n"; break;
            case 'H': 
                effectMessage = prefix + "海怪出现了！在其右侧有两张牌前不能随意停牌。\n"; 
                break;
            case 'P':
                {
                    let canBomb = false; 
                    for (const otherPlayer of this.players) {
                        if (otherPlayer.userId === player.userId) continue;
                        if (otherPlayer.totalCollectedCount > 0) {
                            canBomb = true; break;
                        }
                    }
                    if (canBomb) {
                        this.activeEffects['P'] = true;
                        effectMessage = prefix + "大炮！你可以炮击其他玩家的一张顶牌。\n";
                    } else {
                        effectMessage = prefix + "大炮出现，但无合法目标。\n";
                    }
                }
                break;
            case 'Z':
                if (this.deckPile.length > 0) effectMessage = prefix + `占卜球！牌库顶的下一张牌是【${this.deckPile[0]}】。\n`;
                else effectMessage = prefix + "占卜球！牌库已空。\n";
                break;
            case 'C': effectMessage = prefix + "船锚已放下！\n"; break; 
        }
        messageObj.text += effectMessage;
    }

    useCardEffect(userId, effectType, ...args) {
        if (this.state !== GAME_STATE.IN_PROGRESS) return "游戏未开始。";
        const player = this.getCurrentPlayer();
        if (player.userId !== userId) return "还没轮到你或效果不属于你。";

        let message = "";
        let messageObj = { text: "" }; 
        let targetInput, targetPlayerId, targetPlayer; 
        let newEffectiveCard = null; 

        switch(effectType) {
            case 'M': 
                if (!this.activeEffects['M']) return "美人鱼效果未激活。";
                targetInput = args[0]; 
                if (!targetInput) return "请输入要移动的卡牌。";
                
                let cardToMove = null;
                let originalCardIndex = -1;
                const targetInputUpperM = targetInput.toUpperCase();

                if (targetInputUpperM.length <=3 && /^[A-Z]\d$/.test(targetInputUpperM)) {
                    const shortSuit = targetInputUpperM.slice(0,1);
                    const shortVal = targetInputUpperM.slice(1);
                    originalCardIndex = this.boardCards.findIndex(c => c.slice(-2, -1) === shortSuit && c.slice(-1) === shortVal);
                }
                
                if (originalCardIndex === -1) { 
                    originalCardIndex = this.boardCards.findIndex(c => c.toLowerCase() === targetInput.toLowerCase());
                }

                if (originalCardIndex === -1) return `指定的牌【${targetInput}】不在甲板上。`;
                if (originalCardIndex === this.boardCards.length - 1) return "指定的牌已在末尾。";
                
                cardToMove = this.boardCards.splice(originalCardIndex, 1)[0];
                this.boardCards.push(cardToMove);
                delete this.activeEffects['M']; // 效果已使用
                message = `${player.userName} 使用美人鱼将【${cardToMove}】移到了甲板末尾。\n当前甲板: ${this.boardCards.join(', ')}\n`;
                newEffectiveCard = cardToMove; 
                break;

            case 'T': 
                if (!this.activeEffects['T'] || this.activeEffects['T'].length === 0) return "藏宝图效果未激活或无牌可选。";
                targetInput = args[0]; 
                if (!targetInput) return "请输入要选择的卡牌。";
                
                let choiceIndex = -1;
                const targetInputTUpper = targetInput.toUpperCase();

                if (targetInputTUpper.length <= 3 && /^[A-Z]\d$/.test(targetInputTUpper)) { 
                    const targetSuitShort = targetInputTUpper.slice(0, 1);
                    const targetValueShort = targetInputTUpper.slice(1);
                    choiceIndex = this.activeEffects['T'].findIndex(c => c.slice(-2, -1) === targetSuitShort && c.slice(-1) === targetValueShort);
                } else { 
                    choiceIndex = this.activeEffects['T'].findIndex(c => c.toLowerCase() === targetInput.toLowerCase());
                }

                if (choiceIndex === -1) return `指定的牌【${targetInput}】不在藏宝图选项中。选项: ${this.activeEffects['T'].join(', ')}`;
                
                const chosenCardFromOptions = this.activeEffects['T'].splice(choiceIndex, 1)[0];
                this.discardPile.push(...this.activeEffects['T']); 
                
                const exploded = this._checkBoardForExplosion(chosenCardFromOptions);
                this.boardCards.push(chosenCardFromOptions);
                delete this.activeEffects['T']; // 效果已使用

                message = `${player.userName} 从藏宝图中选择了【${chosenCardFromOptions}】加入甲板。\n当前甲板: ${this.boardCards.join(', ')}\n`;
                if (exploded) {
                    message += `💥 爆炸了！回合结束。\n`;
                    this.discardPile.push(...this.boardCards);
                    this.activeEffects = {};
                    this._nextTurn();
                    const nextPlayer = this.getCurrentPlayer();
                    message += `轮到 ${nextPlayer.userName} 行动。`;
                } else {
                    newEffectiveCard = chosenCardFromOptions;
                }
                break;
            
            case 'D': 
                if (!this.activeEffects['D']) return "弯刀效果未激活。";
                targetInput = args[0]; 
                targetPlayerId = args[1]; 
                targetPlayer = this.getPlayer(targetPlayerId); 
                if (!targetPlayer || targetPlayer.userId === player.userId) return "无效的目标玩家或不能以自己为目标。";
                if (!targetInput) return "请输入要抢夺的卡牌ID。";

                const targetInputDUpper = targetInput.toUpperCase();
                if (!(targetInputDUpper.length <=3 && /^[A-Z]\d$/.test(targetInputDUpper))) {
                     return `目标卡牌ID【${targetInput}】格式错误。应为 字母+数字，如P3。`;
                }

                const targetSuit = targetInputDUpper.slice(0, 1); 
                const targetValue = parseInt(targetInputDUpper.slice(1));
                const fullTargetCardName = `${SUIT_NAMES[targetSuit]}${targetSuit}${targetValue}`;

                if (player.collectedCards[targetSuit] && player.collectedCards[targetSuit].length > 0) {
                    return `你已经拥有【${SUIT_NAMES[targetSuit]}】类别的牌了，不能抢夺。`;
                }
                if (!targetPlayer.collectedCards[targetSuit] || targetPlayer.collectedCards[targetSuit].length === 0 ||
                    targetPlayer.collectedCards[targetSuit][0] !== fullTargetCardName) {
                    return `${targetPlayer.userName} 没有这张顶牌【${fullTargetCardName}】或该类别无牌。`;
                }

                const stolenCard = targetPlayer.removeCollectedCard(fullTargetCardName); 
                if (!stolenCard) return `无法从 ${targetPlayer.userName} 处抢夺【${fullTargetCardName}】。`;

                const d_exploded = this._checkBoardForExplosion(stolenCard);
                this.boardCards.push(stolenCard);
                delete this.activeEffects['D']; // 效果已使用
                message = `${player.userName} 用弯刀从 ${targetPlayer.userName} 处抢夺了【${stolenCard}】到甲板！\n当前甲板: ${this.boardCards.join(', ')}\n`;
                if (d_exploded) {
                     message += `💥 爆炸了！回合结束。\n`;
                    this.discardPile.push(...this.boardCards);
                    this.activeEffects = {};
                    this._nextTurn();
                    const nextPlayer = this.getCurrentPlayer();
                    message += `轮到 ${nextPlayer.userName} 行动。`;
                } else {
                    newEffectiveCard = stolenCard;
                }
                break;

            case 'G': 
                if (!this.activeEffects['G']) return "钩子效果未激活。";
                targetInput = args[0]; 
                if (!targetInput) return "请输入要钩取的卡牌ID。";

                const targetInputGUpper = targetInput.toUpperCase();
                 if (!(targetInputGUpper.length <=3 && /^[A-Z]\d$/.test(targetInputGUpper))) {
                     return `目标卡牌ID【${targetInput}】格式错误。应为 字母+数字，如Y7。`;
                }

                const hookSuit = targetInputGUpper.slice(0,1);
                // const hookValue = parseInt(targetInputGUpper.slice(1)); // hookValue主要用于构建全名提示
                
                const hookedCard = player.removeCollectedCard(targetInputGUpper); 
                if (!hookedCard) {
                     // removeCollectedCard 已经处理了顶牌逻辑
                     return `你没有这张战利品【${SUIT_NAMES[hookSuit]}${targetInputGUpper}】或它不是该类别的顶牌。`;
                }

                const g_exploded = this._checkBoardForExplosion(hookedCard);
                this.boardCards.push(hookedCard);
                delete this.activeEffects['G']; // 效果已使用
                message = `${player.userName} 用钩子将自己的【${hookedCard}】移回甲板！\n当前甲板: ${this.boardCards.join(', ')}\n`;
                 if (g_exploded) {
                     message += `💥 爆炸了！回合结束。\n`;
                    this.discardPile.push(...this.boardCards);
                    this.activeEffects = {};
                    this._nextTurn();
                    const nextPlayer = this.getCurrentPlayer();
                    message += `轮到 ${nextPlayer.userName} 行动。`;
                } else {
                    newEffectiveCard = hookedCard;
                }
                break;

            case 'P': 
                if (!this.activeEffects['P']) return "大炮效果未激活。";
                targetInput = args[0]; 
                targetPlayerId = args[1]; 
                targetPlayer = this.getPlayer(targetPlayerId);
                if (!targetPlayer || targetPlayer.userId === player.userId) return "无效的目标玩家或不能以自己为目标。";
                if (!targetInput) return "请输入要炮击的卡牌ID。";

                const targetInputPUpper = targetInput.toUpperCase();
                if (!(targetInputPUpper.length <=3 && /^[A-Z]\d$/.test(targetInputPUpper))) {
                     return `目标卡牌ID【${targetInput}】格式错误。应为 字母+数字，如B6。`;
                }

                const cannonSuit = targetInputPUpper.slice(0, 1);
                const cannonValue = parseInt(targetInputPUpper.slice(1));
                const fullCannonCardName = `${SUIT_NAMES[cannonSuit]}${cannonSuit}${cannonValue}`;

                if (!targetPlayer.collectedCards[cannonSuit] || targetPlayer.collectedCards[cannonSuit].length === 0 ||
                    targetPlayer.collectedCards[cannonSuit][0] !== fullCannonCardName) {
                    return `${targetPlayer.userName} 没有这张顶牌【${fullCannonCardName}】或该类别无牌。`;
                }
                
                const destroyedCard = targetPlayer.removeCollectedCard(fullCannonCardName); 
                if (!destroyedCard) return `无法从 ${targetPlayer.userName} 处破坏【${fullCannonCardName}】。`;

                this.discardPile.push(destroyedCard);
                delete this.activeEffects['P']; // 效果已使用
                message = `${player.userName} 用大炮摧毁了 ${targetPlayer.userName} 的【${destroyedCard}】！`;
                break;
            default: return "未知的卡牌效果类型。";
        }

        if (newEffectiveCard) {
            messageObj.text = ""; 
            this._triggerCardEffectOnBoard(newEffectiveCard, player, messageObj, false); 
            message += messageObj.text; 
        }

        this.lastActivityTime = Date.now();
        return message;
    }

    concludeGame(reason = "游戏结束。") {
        if (this.state !== GAME_STATE.IN_PROGRESS && this.state !== GAME_STATE.WAITING) return "游戏未在进行或等待中，无法结束。";
        
        let message = reason + "\n--- 游戏结算 ---\n";
        this.players.forEach(p => p.calculateScore());
        this.players.sort((a, b) => b.score - a.score); 

        let maxScore = 0;
        if (this.players.length > 0) {
            maxScore = this.players[0].score;
        }
        
        const winners = this.players.filter(p => p.score === maxScore && maxScore > 0);

        message += "最终得分和排名:\n";
        this.players.forEach((p, index) => {
            message += `第 ${index + 1} 名: ${p.userName} - ${p.score} 分`;
            if (p.grandSlams > 0) {
                message += ` (大满贯 ${p.grandSlams} 次)`;
            }
            message += "\n";
        });

        if (winners.length > 0) {
            message += `\n获胜者是: ${winners.map(w => w.userName).join(', ')}！恭喜！\n`;
        } else {
            message += "\n没有玩家得分，平局或无人获胜。\n";
        }
        
        this.state = GAME_STATE.CONCLUDED; 
        this.lastActivityTime = Date.now();
        return {
            summary: message,
            playerStatsData: this.players.map(p => ({
                userId: p.userId,
                userName: p.userName,
                score: p.score,
                rank: this.players.findIndex(pl => pl.userId === p.userId) + 1,
                grandSlams: p.grandSlams,
                isWinner: winners.some(w => w.userId === p.userId)
            }))
        };
    }

    getGameStatus() {
        if (this.state === GAME_STATE.IDLE) return "当前没有亡命神抽游戏。";
        if (this.state === GAME_STATE.WAITING) {
            return `亡命神抽游戏等待开始，发起人: ${this.getPlayer(this.gameInitiatorId)?.userName || '未知'}。\n已加入玩家 (${this.players.length}/5): ${this.players.map(p=>p.userName).join(', ')}\n请发起人输入【.dmd 开始】以开始游戏。`;
        }
        
        let status = `--- 亡命神抽进行中 ---\n`;
        status += `牌库剩余: ${this.deckPile.length} 张，弃牌堆: ${this.discardPile.length} 张。\n`;
        const currentPlayer = this.getCurrentPlayer();
        status += `当前回合: ${currentPlayer.userName}\n`;
        status += `甲板: ${this.boardCards.length > 0 ? this.boardCards.join(', ') : '(空)'}\n`;
        
        if (this.boardCards.some(card => card.slice(-2, -1) === 'H') && !this._isKrakenRestrictionLifted()) {
            status += "海怪效果生效中！在其右侧有两张牌前不能随意停牌。\n";
        }

        let activeEffectDescriptions = [];
        if (this.activeEffects['M']) activeEffectDescriptions.push("美人鱼");
        if (this.activeEffects['T']) activeEffectDescriptions.push(`藏宝图(${this.activeEffects['T'].join('/')})`);
        if (this.activeEffects['D']) activeEffectDescriptions.push("弯刀");
        if (this.activeEffects['P']) activeEffectDescriptions.push("大炮");
        if (this.activeEffects['G']) activeEffectDescriptions.push("钩子");
        if (this.activeEffects['Y']) activeEffectDescriptions.push("钥匙");
        if (this.activeEffects['B']) activeEffectDescriptions.push("宝箱");
        
        if(activeEffectDescriptions.length > 0) {
            status += "等待使用效果: " + activeEffectDescriptions.join(', ') + "\n";
        }
        return status;
    }
}

// 初始化扩展
let ext = seal.ext.find('亡命神抽'); 
if (!ext) {
    ext = seal.ext.new('亡命神抽', 'Gemini 2.5 Pro, Air', VERSION);
    seal.ext.register(ext);
} else {
    ext.version = VERSION; 
}

class PlayerOverallStats {
    constructor() {
        this.gamesPlayed = 0;
        this.wins = 0;
        this.totalRankSum = 0; 
        this.totalCardsDrawn = 0; 
        this.grandSlamTotal = 0;
        this.rankCounts = {}; 
    }

    update(gameResult) { 
        this.gamesPlayed++;
        if (gameResult.isWinner) this.wins++;
        this.totalRankSum += gameResult.rank;
        this.grandSlamTotal += gameResult.grandSlams;
        this.rankCounts[gameResult.rank] = (this.rankCounts[gameResult.rank] || 0) + 1;
    }

    getStatsSummary() {
        let summary = `总场数: ${this.gamesPlayed}\n`;
        summary += `胜场数: ${this.wins} (胜率: ${this.gamesPlayed > 0 ? (this.wins / this.gamesPlayed * 100).toFixed(1) : 0}%)\n`;
        summary += `平均排名: ${this.gamesPlayed > 0 ? (this.totalRankSum / this.gamesPlayed).toFixed(2) : 'N/A'}\n`;
        summary += `大满贯总次数: ${this.grandSlamTotal}\n`;
        summary += `名次分布:\n`;
        for (const rank in this.rankCounts) {
            summary += `  第 ${rank} 名: ${this.rankCounts[rank]} 次\n`;
        }
        return summary;
    }
}


const cmdDMD = seal.ext.newCmdItemInfo(); 
cmdDMD.name = 'dmd'; 
cmdDMD.aliases = []; 
cmdDMD.help = `亡命神抽游戏指令 (.dmd):
.dmd 发起/加入/开始/抽卡/不抽了/状态/查看战利品/结束
卡牌效果指令 (在提示后使用, 卡牌ID/名称不区分大小写):
  .dmd 移动 <甲板牌ID如M1或全名> (美人鱼)
  .dmd 挖宝 <弃牌堆牌ID如D5或全名> (藏宝图)
  .dmd 抢劫 <目标牌ID如P3> @玩家 (弯刀)
  .dmd 钩取 <自己战利品牌ID如Y7> (钩子)
  .dmd 炮击 <目标牌ID如B6> @玩家 (大炮)
.dmd 战绩 [@玩家] : 查看玩家统计数据
`;
cmdDMD.disabledInPrivate = true; 
cmdDMD.allowDelegate = true; 

cmdDMD.solve = (ctx, msg, cmdArgs) => {
    const groupCtxKey = `wmshenchou_game:${ctx.group.groupId}`; 
    let game = new ShenChouGame(ext.storageGet(groupCtxKey));
    
    const subCmdRaw = cmdArgs.getArgN(1);
    if (!subCmdRaw) { 
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }
    const subCmd = subCmdRaw.toLowerCase();

    const player = { id: ctx.player.userId, name: ctx.player.name };
    let reply = "";

    if (game.state !== GAME_STATE.IDLE && (Date.now() - game.lastActivityTime > 15 * 60 * 1000)) {
        if (game.state === GAME_STATE.IN_PROGRESS || game.state === GAME_STATE.WAITING) {
            const conclusion = game.concludeGame("游戏超时自动结束。");
            conclusion.playerStatsData.forEach(pData => {
                const statsKey = `wmshenchou_stats:${pData.userId}`;
                let playerStats = new PlayerOverallStats();
                const storedStats = ext.storageGet(statsKey);
                if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                playerStats.update(pData);
                ext.storageSet(statsKey, JSON.stringify(playerStats));
            });
            reply = conclusion.summary;
            game.reset(); 
            ext.storageSet(groupCtxKey, JSON.stringify(game.toJSON()));
            seal.replyToSender(ctx, msg, reply);
            return seal.ext.newCmdExecuteResult(true);
        }
    }

    switch (subCmd) {
        case '发起':
            if (game.state !== GAME_STATE.IDLE && game.state !== GAME_STATE.CONCLUDED) {
                reply = "当前群组已有一局亡命神抽游戏。";
            } else {
                game.reset();
                game.state = GAME_STATE.WAITING;
                reply = game.addPlayer(player.id, player.name);
                reply += `\n${player.name} 发起了亡命神抽！其他玩家请输入【.dmd 加入】来参与。`;
            }
            break;
        case '加入':
            reply = game.addPlayer(player.id, player.name);
            break;
        case '开始':
            reply = game.startGame(player.id);
            break;
        case '抽卡':
            reply = game.drawCard(player.id);
            if (typeof reply === 'object' && reply.summary) { // 游戏因抽光牌库结束
                reply.playerStatsData.forEach(pData => {
                    const statsKey = `wmshenchou_stats:${pData.userId}`;
                    let playerStats = new PlayerOverallStats();
                    const storedStats = ext.storageGet(statsKey);
                    if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                    playerStats.update(pData);
                    ext.storageSet(statsKey, JSON.stringify(playerStats));
                });
                reply = reply.summary; 
                game.reset(); 
            }
            break;
        case '不抽了':
        case '停牌':
            reply = game.standTurn(player.id);
            break;
        case '状态':
            reply = game.getGameStatus();
            break;
        case '查看战利品':
            if (game.state === GAME_STATE.IDLE || game.state === GAME_STATE.WAITING) {
                reply = "游戏尚未开始或无战利品可查看。";
            } else {
                reply = "--- 当前所有玩家战利品 ---\n";
                game.players.forEach(p => {
                    reply += p.getCollectionDescription() + "\n";
                });
            }
            break;
        case '结束':
            if (game.state === GAME_STATE.IDLE) {
                reply = "没有正在进行的游戏可以结束。";
            } else if (game.gameInitiatorId === player.id || ctx.privilegeLevel >= 100) { 
                const conclusion = game.concludeGame(`${player.name} 强制结束了游戏。`);
                conclusion.playerStatsData.forEach(pData => {
                    const statsKey = `wmshenchou_stats:${pData.userId}`;
                    let playerStats = new PlayerOverallStats();
                    const storedStats = ext.storageGet(statsKey);
                    if (storedStats) Object.assign(playerStats, JSON.parse(storedStats));
                    playerStats.update(pData);
                    ext.storageSet(statsKey, JSON.stringify(playerStats));
                });
                reply = conclusion.summary;
                game.reset();
            } else {
                reply = "只有游戏发起者或管理员才能强制结束游戏。";
            }
            break;
        case '移动': 
            reply = game.useCardEffect(player.id, 'M', cmdArgs.getArgN(2)); 
            break;
        case '挖宝': 
            reply = game.useCardEffect(player.id, 'T', cmdArgs.getArgN(2));
            break;
        case '抢劫': 
            {
                const targetCardRaw = cmdArgs.getArgN(2); 
                const targetPlayerCtx = seal.getCtxProxyFirst(ctx, cmdArgs); 
                
                if (!targetPlayerCtx) {
                    reply = "抢劫需要@一位其他玩家作为目标。";
                } else if (targetPlayerCtx.player.userId === ctx.player.userId) {
                    reply = "不能抢劫自己。";
                } else if (!targetCardRaw || targetCardRaw.startsWith('@')) {
                    reply = "抢劫指令格式错误。正确格式：.dmd 抢劫 <目标牌ID> @玩家";
                }
                else {
                     reply = game.useCardEffect(player.id, 'D', targetCardRaw, targetPlayerCtx.player.userId);
                }
            }
            break;
        case '钩取': 
            const hookTargetCardRaw = cmdArgs.getArgN(2);
            if (!hookTargetCardRaw || hookTargetCardRaw.startsWith('@')) {
                 reply = "钩取指令格式错误。正确格式：.dmd 钩取 <自己战利品牌ID如Y7>";
            } else {
                reply = game.useCardEffect(player.id, 'G', hookTargetCardRaw);
            }
            break;
        case '炮击': 
             {
                const targetCardRaw = cmdArgs.getArgN(2); 
                const targetPlayerCtx = seal.getCtxProxyFirst(ctx, cmdArgs); 

                if (!targetPlayerCtx) {
                    reply = "炮击需要@一位其他玩家作为目标。";
                } else if (targetPlayerCtx.player.userId === ctx.player.userId) {
                    reply = "不能炮击自己。";
                } else if (!targetCardRaw || targetCardRaw.startsWith('@')) {
                    reply = "炮击指令格式错误。正确格式：.dmd 炮击 <目标牌ID> @玩家";
                }
                else {
                     reply = game.useCardEffect(player.id, 'P', targetCardRaw, targetPlayerCtx.player.userId);
                }
            }
            break;
        case '战绩':
            {
                let targetPlayerId = player.id;
                let targetPlayerName = player.name;
                const mentionedPlayerCtx = seal.getCtxProxyFirst(ctx, cmdArgs);
                // 检查第二个参数是否是@提及，并且它不是唯一的参数 (避免 .dmd 战绩 @自己 时误判)
                if (mentionedPlayerCtx && cmdArgs.getArgN(2) && cmdArgs.getArgN(2).startsWith('@')) { 
                    targetPlayerId = mentionedPlayerCtx.player.userId;
                    targetPlayerName = mentionedPlayerCtx.player.name;
                }
                
                const statsKey = `wmshenchou_stats:${targetPlayerId}`;
                const storedStats = ext.storageGet(statsKey);
                if (storedStats) {
                    const playerStats = new PlayerOverallStats();
                    Object.assign(playerStats, JSON.parse(storedStats));
                    reply = `${targetPlayerName} 的亡命神抽战绩:\n` + playerStats.getStatsSummary();
                } else {
                    reply = `${targetPlayerName} 暂无亡命神抽战绩记录。`;
                }
            }
            break;
        default:
            const ret = seal.ext.newCmdExecuteResult(true);
            ret.showHelp = true;
            return ret;
    }

    if (reply) {
        ext.storageSet(groupCtxKey, JSON.stringify(game.toJSON()));
        seal.replyToSender(ctx, msg, reply);
    }
    return seal.ext.newCmdExecuteResult(true);
};

// 注册命令
ext.cmdMap['dmd'] = cmdDMD; 