// ==UserScript==
// @name         海豹之路 (Path of the Seal)
// @author       Gemini 2.5 Pro, Air
// @version      0.1.1
// @description  一款类杀戮尖塔的单人卡牌策略游戏。
// @timestamp    1748784164
// @license      Apache-2.0
// @homepageURL  https://github.com/A1oneR/SealDice_Thing
// ==/UserScript==
const MAX_ENERGY = 3;
const PLAYER_DRAW_COUNT = 5; // 每回合抽牌数
const MAX_HAND_SIZE = 10;    // 手牌上限
const PLAYER_MAX_HP = 80;

const STATUS_TRANSLATIONS = {
    'strength': '力量',
    'dexterity': '敏捷',
    'vulnerable': '易伤',
    'weak': '虚弱',
    'ritual': '仪式', // 邪教徒特定
    'bellowStrGain': '咆哮力量增益', // 颚虫特定
    'bellowBlkGain': '咆哮格挡增益'  // 颚虫特定
};

function translateStatus(statusId) {
    return STATUS_TRANSLATIONS[statusId] || statusId;
}

// --- 游戏数据定义 ---

const CARDS = {
    'strike': {
        name: '打击', type: 'Attack', cost: 1, rarity: 'Basic', target: 'SingleEnemy',
        effect: (player, enemy, _game, _cardArgs) => {
            const baseDamage = 6;
            let damage = baseDamage + (player.status.strength || 0);
            if (player.status.weak) damage = Math.floor(damage * 0.75); // 虚弱减少25%攻击伤害
            damage = Math.max(0, damage);
            enemy.dealDamage(damage);
            return [`对 ${enemy.name} 造成 ${damage} 点伤害。`];
        },
        description: (p) => {
            let baseDmg = 6 + (p.status.strength || 0);
            if (p.status.weak) baseDmg = Math.floor(baseDmg * 0.75);
            return `造成 ${baseDmg} 点伤害。`;
        }
    },
    'defend': {
        name: '防御', type: 'Skill', cost: 1, rarity: 'Basic', target: 'Self',
        effect: (player, _enemy, _game, _cardArgs) => {
            const block = 5 + (player.status.dexterity || 0);
            player.gainBlock(block);
            return [`获得 ${block} 点格挡。`];
        },
        description: (p) => `获得 ${5 + (p.status.dexterity || 0)} 点格挡。`
    },
    'bash': {
        name: '重击', type: 'Attack', cost: 2, rarity: 'Common', target: 'SingleEnemy',
        effect: (player, enemy, _game, _cardArgs) => {
            const baseDamage = 8;
            let damage = baseDamage + (player.status.strength || 0);
            if (player.status.weak) damage = Math.floor(damage * 0.75);
            damage = Math.max(0, damage);
            enemy.dealDamage(damage);
            enemy.applyStatus('vulnerable', 2);
            return [`对 ${enemy.name} 造成 ${damage} 点伤害并施加 2 层${translateStatus('vulnerable')}。`];
        },
        description: (p) => {
            let baseDmg = 8 + (p.status.strength || 0);
            if (p.status.weak) baseDmg = Math.floor(baseDmg * 0.75);
            return `造成 ${baseDmg} 点伤害。施加 2 层${translateStatus('vulnerable')}。`;
        }
    },
    'neutralize': {
        name: '中和', type: 'Attack', cost: 0, rarity: 'Common', target: 'SingleEnemy',
        effect: (player, enemy, _game, _cardArgs) => {
            const baseDamage = 3;
            let damage = baseDamage + (player.status.strength || 0);
            if (player.status.weak) damage = Math.floor(damage * 0.75);
            damage = Math.max(0, damage);
            enemy.dealDamage(damage);
            enemy.applyStatus('weak', 1);
            return [`对 ${enemy.name} 造成 ${damage} 点伤害并施加 1 层${translateStatus('weak')}。`];
        },
        description: (p) => {
            let baseDmg = 3 + (p.status.strength || 0);
            if (p.status.weak) baseDmg = Math.floor(baseDmg * 0.75);
            return `造成 ${baseDmg} 点伤害。施加 1 层${translateStatus('weak')}。`;
        }
    },
    'survivor': {
        name: '生存', type: 'Skill', cost: 1, rarity: 'Common', target: 'Self',
        effect: (player, _enemy, game, _cardArgs) => { // Added game parameter
            const block = 8 + (player.status.dexterity || 0);
            player.gainBlock(block);
            player.drawCards(1, game); // Pass game for logging
            return [`获得 ${block} 点格挡。抽 1 张牌。`];
        },
        description: (p) => `获得 ${8 + (p.status.dexterity || 0)} 点格挡。抽 1 张牌。`
    },
};

const RELICS = {
    'burning_blood': {
        name: '燃烧之血',
        description: '在每次战斗结束时，回复 6点HP。',
        effectOnCombatEnd: (player, _game) => {
            player.heal(6);
            return [`${translateStatus('burning_blood')}使你回复了 6点HP。`];
        }
    },
    'ring_of_snake': {
        name: '蛇之戒指',
        description: '在每次战斗开始时，额外抽 2 张牌。',
        effectOnCombatStart: (player, game) => { // Added game parameter
            player.drawCards(2, game); // Pass game for logging
            return [`${translateStatus('ring_of_snake')}使你额外抽取了 2 张牌。`];
        }
    }
};
STATUS_TRANSLATIONS['burning_blood'] = '燃烧之血'; // Add relic names to translations if needed for logs
STATUS_TRANSLATIONS['ring_of_snake'] = '蛇之戒指';

const ENEMIES = {
    'cultist': {
        name: '邪教徒', maxHp: 50,
        intents: [
            { id: 'incantation', type: 'Buff', value: 3, description: (e) => `吟唱(${translateStatus('strength')}+${e.status.ritual || 3})` },
            { id: 'dark_strike', type: 'Attack', value: 6, description: (e) => {
                let baseDmg = 6 + (e.status.strength || 0);
                if (e.status.weak) baseDmg = Math.floor(baseDmg * 0.75);
                return `暗黑打击(${baseDmg})`;
            }}
        ],
        onTurn: (enemy, player, _game) => {
            let messages = [];
            const currentIntent = enemy.currentIntent;
            enemy.status.ritual = (enemy.status.ritual || 0) +1;

            if (currentIntent.id === 'incantation') {
                const strengthGain = enemy.status.ritual || 3;
                enemy.applyStatus('strength', strengthGain);
                messages.push(`${enemy.name} 进行吟唱，获得 ${strengthGain} 点${translateStatus('strength')}！`);
            } else if (currentIntent.id === 'dark_strike') {
                let damage = currentIntent.value + (enemy.status.strength || 0);
                if (enemy.status.weak) damage = Math.floor(damage * 0.75); // 敌人虚弱也影响自己攻击
                damage = Math.max(0, damage);
                messages.push(`${enemy.name} 使用暗黑打击对你造成 ${damage} 点伤害。`);
                player.takeDamage(damage);
            }
            enemy.updateIntent();
            return messages;
        }
    },
    'jaw_worm': {
        name: '颚虫', maxHp: 42,
        intents: [
            { id: 'chomp', type: 'Attack', value: 11, description: (e) => {
                let baseDmg = 11 + (e.status.strength || 0);
                if (e.status.weak) baseDmg = Math.floor(baseDmg * 0.75);
                return `啃咬(${baseDmg})`;
            }},
            { id: 'thrash', type: 'Attack', value: 7, description: (e) => {
                let baseDmg = 7 + (e.status.strength || 0);
                if (e.status.weak) baseDmg = Math.floor(baseDmg * 0.75);
                return `猛撞(${baseDmg})`;
            }},
            { id: 'bellow', type: 'Buff', value: 3, block: 5, description: (e) => `咆哮(${translateStatus('strength')}+${e.status.bellowStrGain || 3}, 格挡+${e.status.bellowBlkGain || 5})` }
        ],
        onTurn: (enemy, player, _game) => {
            let messages = [];
            const currentIntent = enemy.currentIntent;
            enemy.status.bellowStrGain = (enemy.status.bellowStrGain || 0) +1;
            enemy.status.bellowBlkGain = (enemy.status.bellowBlkGain || 0) +1;

            if (currentIntent.id === 'chomp') {
                let damage = currentIntent.value + (enemy.status.strength || 0);
                if (enemy.status.weak) damage = Math.floor(damage * 0.75);
                damage = Math.max(0, damage);
                messages.push(`${enemy.name} 使用啃咬对你造成 ${damage} 点伤害。`);
                player.takeDamage(damage);
            } else if (currentIntent.id === 'thrash') {
                let damage = currentIntent.value + (enemy.status.strength || 0);
                if (enemy.status.weak) damage = Math.floor(damage * 0.75);
                damage = Math.max(0, damage);
                messages.push(`${enemy.name} 使用猛撞对你造成 ${damage} 点伤害。`);
                player.takeDamage(damage);
            } else if (currentIntent.id === 'bellow') {
                const strGain = enemy.status.bellowStrGain || 3;
                const blkGain = enemy.status.bellowBlkGain || 5;
                enemy.applyStatus('strength', strGain);
                enemy.gainBlock(blkGain);
                messages.push(`${enemy.name} 发出咆哮，获得 ${strGain} ${translateStatus('strength')}和 ${blkGain} 格挡！`);
            }
            enemy.updateIntent();
            return messages;
        }
    }
};

const FLOORS = [
    { type: 'Combat', enemyId: 'cultist' },
    { type: 'Reward', rewardType: 'Card' },
    { type: 'Combat', enemyId: 'jaw_worm' },
    { type: 'Reward', rewardType: 'Relic' },
    { type: 'Combat', enemyId: 'cultist' },
    { type: 'Combat', enemyId: 'jaw_worm' },
    { type: 'Victory' }
];

// --- Helper Classes ---
class Player {
    constructor() {
        this.hp = PLAYER_MAX_HP;
        this.maxHp = PLAYER_MAX_HP;
        this.energy = MAX_ENERGY;
        this.block = 0;
        this.deck = ['strike', 'strike', 'strike', 'strike', 'strike', 'defend', 'defend', 'defend', 'defend'];
        this.hand = [];
        this.drawPile = [];
        this.discardPile = [];
        this.relics = [];
        this.status = {}; // { strength: X, dexterity: Y, vulnerable: turns, weak: turns }
    }

    shuffleDrawPile() {
        for (let i = this.drawPile.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.drawPile[i], this.drawPile[j]] = [this.drawPile[j], this.drawPile[i]];
        }
    }

    startCombat(game) {
        this.drawPile = [...this.deck];
        this.shuffleDrawPile();
        this.hand = [];
        this.discardPile = [];
        this.status = {};
        this.relics.forEach(relicId => {
            const relic = RELICS[relicId];
            if (relic && relic.effectOnCombatStart) {
                const relicMessages = relic.effectOnCombatStart(this, game);
                if (relicMessages) game.logCombatMessage(relicMessages.join('\n'));
            }
        });
    }

    startTurn(game) {
        this.block = 0;
        this.energy = MAX_ENERGY;
        this.relics.forEach(relicId => {
            const relic = RELICS[relicId];
            if (relic && relic.effectOnTurnStart) {
                const relicMessages = relic.effectOnTurnStart(this, game);
                 if (relicMessages) game.logCombatMessage(relicMessages.join('\n'));
            }
        });
        const newStatus = {};
        for (const key in this.status) {
            if (typeof this.status[key] === 'number' && key !== 'strength' && key !== 'dexterity') {
                if (this.status[key] -1 > 0) {
                    newStatus[key] = this.status[key] - 1;
                    game.logCombatMessage(`${translateStatus(key)} 剩余 ${newStatus[key]} 回合。`);
                } else {
                    game.logCombatMessage(`${translateStatus(key)} 效果结束。`);
                }
            } else {
                 newStatus[key] = this.status[key]; // Keep strength/dexterity
            }
        }
        this.status = newStatus;
        this.drawCards(PLAYER_DRAW_COUNT, game);
    }

    drawCards(count, game) { // Added game parameter for logging
        let drawnCount = 0;
        for (let i = 0; i < count; i++) {
            if (this.hand.length >= MAX_HAND_SIZE) {
                if (game) game.logCombatMessage("手牌已满，无法再抽牌。");
                break;
            }
            if (this.drawPile.length === 0) {
                if (this.discardPile.length === 0) {
                    if (game) game.logCombatMessage("牌库和弃牌堆都已空，无法抽牌。");
                    break;
                }
                this.drawPile = [...this.discardPile];
                this.discardPile = [];
                this.shuffleDrawPile();
                if (game) game.logCombatMessage("牌库已空，重洗弃牌堆！");
            }
            if (this.drawPile.length > 0) {
                 const drawnCardId = this.drawPile.shift();
                 this.hand.push(drawnCardId);
                 if (game) game.logCombatMessage(`抽到【${CARDS[drawnCardId].name}】。`);
                 drawnCount++;
            }
        }
        return drawnCount;
    }

    playCard(cardIndex, enemy, game) {
        if (cardIndex < 0 || cardIndex >= this.hand.length) return ["无效的卡牌选择。"];
        const cardId = this.hand[cardIndex];
        const cardData = CARDS[cardId];
        if (!cardData) return [`卡牌数据错误: ${cardId}`];
        if (this.energy < cardData.cost) return [`能量不足以打出 ${cardData.name} (需要${cardData.cost})。`];

        this.energy -= cardData.cost;
        this.hand.splice(cardIndex, 1);
        
        let messages = [`你打出了【${cardData.name}】。`];
        const effectResult = cardData.effect(this, enemy, game, {});
        if (Array.isArray(effectResult)) { // If effect returns messages
            messages = messages.concat(effectResult);
        } else if (typeof effectResult === 'string') { // If effect returns a single message string
            messages.push(effectResult);
        }
        // If effect logs directly and returns nothing, messages will just be the "打出了" part.

        if (cardData.type === 'Power') {
            this.discardPile.push(cardId);
        } else {
            this.discardPile.push(cardId);
        }
        return messages; // Return array of messages
    }

    gainBlock(amount) {
        this.block += Math.max(0, amount);
    }

    takeDamage(amount) {
        let actualDamage = amount;
        if (this.status.vulnerable) actualDamage = Math.floor(actualDamage * 1.5); // 易伤使受到的攻击伤害增加50%
        actualDamage = Math.max(0, actualDamage);

        let hpLost = 0;
        if (this.block > 0) {
            const blocked = Math.min(this.block, actualDamage);
            this.block -= blocked;
            actualDamage -= blocked;
            // game.logCombatMessage(`格挡抵消了 ${blocked} 点伤害。`); // Handled by caller
        }
        if (actualDamage > 0) {
            this.hp -= actualDamage;
            hpLost = actualDamage;
        }
        return hpLost; // Amount of HP lost
    }
    
    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    applyStatus(statusId, value) {
        if (statusId === 'strength' || statusId === 'dexterity') {
            this.status[statusId] = (this.status[statusId] || 0) + value;
        } else {
            this.status[statusId] = (this.status[statusId] || 0) + value;
        }
        // game.logCombatMessage(`你获得了 ${value} 层${translateStatus(statusId)}。`); // Usually logged by card/enemy effect
    }

    addRelic(relicId) {
        if (RELICS[relicId] && !this.relics.includes(relicId)) {
            this.relics.push(relicId);
            const relic = RELICS[relicId];
            if (relic.effectOnInit) {
                 relic.effectOnInit(this, null);
            }
            return true;
        }
        return false;
    }

    addCardToDeck(cardId) {
        if (CARDS[cardId]) {
            this.deck.push(cardId);
            return true;
        }
        return false;
    }
}

class EnemyInstance {
    constructor(enemyId) {
        const template = ENEMIES[enemyId];
        this.id = enemyId;
        this.name = template.name;
        this.hp = template.maxHp;
        this.maxHp = template.maxHp;
        this.block = 0;
        this.intents = template.intents;
        this.currentIntentIndex = -1;
        this.status = {};
        this.onTurnAction = template.onTurn;
        this.updateIntent();
    }

    updateIntent() {
        this.currentIntentIndex = (this.currentIntentIndex + 1) % this.intents.length;
        this.currentIntent = this.intents[this.currentIntentIndex];
    }

    getIntentDescription() {
        if (this.currentIntent && this.currentIntent.description) {
             return this.currentIntent.description(this);
        }
        return "未知行动";
    }

    startTurn(game) { // Added game parameter
        this.block = 0;
        const newStatus = {};
        for (const key in this.status) {
            if (typeof this.status[key] === 'number' && key !== 'strength' && key !== 'dexterity') {
                 if (this.status[key] -1 > 0) {
                    newStatus[key] = this.status[key] - 1;
                    if (game) game.logCombatMessage(`${this.name} 的 ${translateStatus(key)} 剩余 ${newStatus[key]} 回合。`);
                } else {
                    if (game) game.logCombatMessage(`${this.name} 的 ${translateStatus(key)} 效果结束。`);
                }
            } else {
                newStatus[key] = this.status[key];
            }
        }
        this.status = newStatus;
    }

    dealDamage(amount) {
        let actualDamage = amount; // Already adjusted for attacker's weak status by card effect
        if (this.status.vulnerable) actualDamage = Math.floor(actualDamage * 1.5);
        actualDamage = Math.max(0, actualDamage);
        
        if (this.block > 0) {
            const blocked = Math.min(this.block, actualDamage);
            this.block -= blocked;
            actualDamage -= blocked;
        }
        if (actualDamage > 0) {
            this.hp -= actualDamage;
        }
    }
    
    gainBlock(amount) {
        this.block += Math.max(0, amount);
    }

    applyStatus(statusId, value) {
        if (statusId === 'strength' || statusId === 'dexterity') {
            this.status[statusId] = (this.status[statusId] || 0) + value;
        } else {
            this.status[statusId] = (this.status[statusId] || 0) + value;
        }
        // game.logCombatMessage(`${this.name} 获得了 ${value} 层${translateStatus(statusId)}。`); // Usually logged by card/enemy effect
    }
}

class GameState {
    constructor(userId) {
        this.userId = userId;
        this.player = new Player();
        this.currentFloor = 0;
        this.status = 'idle';
        this.currentEnemy = null;
        this.cardRewardOptions = [];
        this.relicRewardOptions = [];
        this.combatLog = []; // Stores messages for the current turn/action sequence
    }

    logCombatMessage(message) {
        this.combatLog.push(message);
    }

    clearCombatLog() {
        this.combatLog = [];
    }

    // Gets and clears the log for display
    getAndClearCombatLogOutput() {
        const output = this.combatLog.join('\n');
        this.clearCombatLog();
        return output;
    }
}

// --- Storage Functions ---
function getGameKey(userId) {
    return `spirepath:game:${userId}`;
}

function loadGame(userId) {
    const key = getGameKey(userId);
    const storedData = ext.storageGet(key);
    if (storedData) {
        try {
            const rawGame = JSON.parse(storedData);
            const game = new GameState(userId);
            game.player = Object.assign(new Player(), rawGame.player);
            game.currentFloor = rawGame.currentFloor;
            game.status = rawGame.status;
            if (rawGame.currentEnemy) {
                game.currentEnemy = new EnemyInstance(rawGame.currentEnemy.id); // Creates with fresh intents
                // Copy over mutable state like HP, status, and importantly, the currentIntentIndex
                game.currentEnemy.hp = rawGame.currentEnemy.hp;
                game.currentEnemy.maxHp = rawGame.currentEnemy.maxHp; // Though usually same as template
                game.currentEnemy.block = rawGame.currentEnemy.block;
                game.currentEnemy.status = rawGame.currentEnemy.status || {};
                // Restore the correct intent based on the saved index
                if (rawGame.currentEnemy.currentIntentIndex !== undefined && rawGame.currentEnemy.currentIntentIndex !== null) {
                    game.currentEnemy.currentIntentIndex = rawGame.currentEnemy.currentIntentIndex;
                    game.currentEnemy.currentIntent = game.currentEnemy.intents[game.currentEnemy.currentIntentIndex];
                } else {
                    // If index wasn't saved, or invalid, re-initialize (though constructor already does)
                    game.currentEnemy.updateIntent();
                }
            }
            game.cardRewardOptions = rawGame.cardRewardOptions || [];
            game.relicRewardOptions = rawGame.relicRewardOptions || [];
            game.combatLog = rawGame.combatLog || []; // Ensure combatLog is an array

            Object.setPrototypeOf(game.player, Player.prototype);
            if (game.currentEnemy) {
                Object.setPrototypeOf(game.currentEnemy, EnemyInstance.prototype);
            }
            return game;
        } catch (e) {
            seal. ομάδα日志.error('尖塔之路: 解析游戏数据失败', e);
            return null;
        }
    }
    return null;
}

function saveGame(game) {
    if (!game || !game.userId) return;
    const key = getGameKey(game.userId);
    ext.storageSet(key, JSON.stringify(game));
}

function deleteGame(userId) {
    ext.storageSet(getGameKey(userId), null);
}

// --- Game Logic Functions ---

function startGameFlow(userId) { // Renamed from startGame to avoid conflict with class method names
    let game = new GameState(userId);
    game.status = 'map';
    game.player.addRelic('burning_blood');
    // game.player.addRelic('ring_of_snake');

    proceedToNextEncounter(game); // This will log initial messages
    saveGame(game);
    // formatGameStatus will be called by the command handler
    return game; // Return game for the command handler
}

function proceedToNextEncounter(game) {
    game.clearCombatLog(); // 清除上一阶段的所有日志

    if (game.currentFloor >= FLOORS.length) {
        game.status = 'victory';
        game.logCombatMessage("已达尖塔之顶！"); // 确保有最终胜利消息
        return;
    }

    const floorData = FLOORS[game.currentFloor];
    game.logCombatMessage(`\n--- 你来到了第 ${game.currentFloor + 1} 层 ---`);

    if (floorData.type === 'Combat') {
        game.status = 'combat';
        game.currentEnemy = new EnemyInstance(floorData.enemyId);
        game.logCombatMessage(`遭遇了 ${game.currentEnemy.name}！`);
        game.player.startCombat(game);
        game.logCombatMessage("----------\n你的回合！");
        game.player.startTurn(game);
    } else if (floorData.type === 'Reward') {
        if (floorData.rewardType === 'Card') {
            game.status = 'reward_card';
            game.cardRewardOptions = generateCardRewardOptions(3, game.player.deck);
            if (game.cardRewardOptions.length > 0) {
                game.logCombatMessage(`你找到了三张卡牌可供选择。`);
            } else {
                game.logCombatMessage(`没有可供选择的卡牌奖励。`);
                game.currentFloor++;
                proceedToNextEncounter(game); // Skip to next if no options
            }
        } else if (floorData.rewardType === 'Relic') {
            game.status = 'reward_relic';
            game.relicRewardOptions = generateRelicRewardOptions(1, game.player.relics);
            if (game.relicRewardOptions.length > 0) {
                game.logCombatMessage(`你找到了一个遗物：${RELICS[game.relicRewardOptions[0]].name}。`);
            } else {
                game.logCombatMessage(`你寻找遗物，但一无所获。`);
                game.currentFloor++;
                proceedToNextEncounter(game); // Skip to next if no options
            }
        }
    } else if (floorData.type === 'Victory') { // Should be caught by the check at the beginning
        game.status = 'victory';
        game.logCombatMessage("恭喜你！你成功登顶尖塔！");
    }
}

function generateCardRewardOptions(count, playerDeck) {
    const availableCards = Object.keys(CARDS).filter(id => CARDS[id].rarity !== 'Basic');
    let options = [];
    if (availableCards.length === 0) return [];

    for (let i = 0; i < count; i++) {
        if (options.length >= availableCards.length) break;
        let cardId;
        do {
            cardId = availableCards[Math.floor(Math.random() * availableCards.length)];
        } while (options.includes(cardId))
        options.push(cardId);
    }
    return options;
}

function generateRelicRewardOptions(count, playerRelics) {
    const availableRelics = Object.keys(RELICS).filter(id => !playerRelics.includes(id));
    let options = [];
    if (availableRelics.length === 0) return [];
    
    for (let i = 0; i < count; i++) {
        if (options.length >= availableRelics.length) break;
        let relicId;
        do {
            relicId = availableRelics[Math.floor(Math.random() * availableRelics.length)];
        } while (options.includes(relicId))
        options.push(relicId);
    }
    return options;
}

function handlePlayerAction(game, action, args) {
    // 当前 game.combatLog 包含的是自上次 clear 以来，到当前命令执行前的日志

    if (game.status === 'combat') {
        if (action === 'play') {
            const cardIndex = parseInt(args[0]) - 1;
            // 在打牌前，combatLog 可能包含上个回合的 "你的回合！" 和抽牌信息
            // 或者如果连续打牌，则是上一张牌的日志
            // 为了确保打牌日志的纯净，可以在这里先 clear 一次，如果希望每次打牌都只显示该次打牌结果
            // 但通常我们会期望连续打牌的日志累积，直到回合结束或战斗结束
            // game.clearCombatLog(); // 如果想让每次play的日志独立，可以在此清除

            const messages = game.player.playCard(cardIndex, game.currentEnemy, game);
            messages.forEach(m => game.logCombatMessage(m)); // 记录本次打牌的日志

            if (game.currentEnemy.hp <= 0) {
                game.logCombatMessage(`${game.currentEnemy.name} 被击败了！`);
                game.player.relics.forEach(relicId => {
                    const relic = RELICS[relicId];
                    if (relic && relic.effectOnCombatEnd) {
                        const relicMessages = relic.effectOnCombatEnd(game.player, game);
                        if (relicMessages) relicMessages.forEach(m => game.logCombatMessage(m));
                    }
                });
                // 战斗结束的日志已记录完毕
                // proceedToNextEncounter 将会清除这些，并开始新阶段的日志
                game.currentEnemy = null;
                game.currentFloor++;
                proceedToNextEncounter(game);
            } else if (game.player.hp <= 0) {
                 game.status = 'game_over';
                 game.logCombatMessage("你被打败了... 游戏结束。");
            }
            // 如果战斗继续，当前 combatLog 包含打牌的日志
        } else if (action === 'endturn') {
            // combatLog 当前包含本回合所有打牌的日志，以及之前的开场日志
            game.logCombatMessage("你结束了回合。"); // 添加 "结束回合" 到日志

            // 敌人行动
            game.currentEnemy.startTurn(game);
            const enemyMessages = game.currentEnemy.onTurnAction(game.currentEnemy, game.player, game);
            enemyMessages.forEach(m => game.logCombatMessage(m)); // 添加敌人行动日志

            if (game.player.hp <= 0) {
                game.status = 'game_over';
                game.logCombatMessage("你被打败了... 游戏结束。");
            } else {
                // 清除本回合所有交互（玩家出牌、结束回合语、敌人行动）的详细日志
                game.clearCombatLog();
                // 开始记录新回合的开场日志
                game.logCombatMessage("----------\n你的回合！");
                game.player.startTurn(game); // 记录抽牌、状态tick
            }
        }
    } else if (game.status === 'reward_card') {
        if (action === 'choose') {
            // combatLog 当前包含奖励界面的开场白 (e.g., "你找到了三张卡牌...")
            const choiceIndex = parseInt(args[0]) - 1;
            if (choiceIndex >= 0 && choiceIndex < game.cardRewardOptions.length) {
                const chosenCardId = game.cardRewardOptions[choiceIndex];
                game.player.addCardToDeck(chosenCardId);
                game.logCombatMessage(`你选择了【${CARDS[chosenCardId].name}】并加入了你的牌组。`); // 记录选择结果
                
                // proceedToNextEncounter 将会清除这个选择结果日志，并开始新阶段日志
                game.cardRewardOptions = [];
                game.currentFloor++;
                proceedToNextEncounter(game);
            } else if (args[0] && args[0].toLowerCase() === 'skip') {
                game.logCombatMessage("你跳过了卡牌奖励。"); // 记录跳过结果
                game.cardRewardOptions = [];
                game.currentFloor++;
                proceedToNextEncounter(game);
            } else {
                 game.logCombatMessage("无效的选择。"); // 这个会显示，状态不变
            }
        }
    } else if (game.status === 'reward_relic') {
         if (action === 'take' || (action === 'choose' && (args[0] === '1' || args[0].toLowerCase() === 'take'))) {
            if (game.relicRewardOptions.length > 0) {
                const chosenRelicId = game.relicRewardOptions[0];
                game.player.addRelic(chosenRelicId);
                game.logCombatMessage(`你获得了遗物：【${RELICS[chosenRelicId].name}】。`);
                game.relicRewardOptions = [];
                game.currentFloor++;
                proceedToNextEncounter(game);
            } else {
                game.logCombatMessage("没有遗物可供拾取。");
            }
        } else if (action === 'skip' || (action === 'choose' && args[0] && args[0].toLowerCase() === 'skip')) {
            game.logCombatMessage("你跳过了遗物奖励。");
            game.relicRewardOptions = [];
            game.currentFloor++;
            proceedToNextEncounter(game);
        } else {
             game.logCombatMessage("无效的选择 (请输入 'take' 或 'skip').");
        }
    }
    saveGame(game);
}

// --- Formatting Functions ---
function formatGameStatus(game) {
    // 1. 获取并清除当前回合/行动的日志
    let currentActionLog = game.getAndClearCombatLogOutput();
    let output = "";

    // 2. 构建核心状态信息
    let coreStatusOutput = "";
    if (game.status === 'combat' && game.currentEnemy) {
        coreStatusOutput += "--- 战斗中 ---\n";
        coreStatusOutput += `楼层: ${game.currentFloor + 1}\n`;
        // Player
        coreStatusOutput += `你: HP ${game.player.hp}/${game.player.maxHp}, 能量 ${game.player.energy}/${MAX_ENERGY}, 格挡 ${game.player.block}\n`;
        if (Object.keys(game.player.status).length > 0) {
            coreStatusOutput += `  状态: ${Object.entries(game.player.status).map(([k,v]) => `${translateStatus(k)}:${v}`).join(', ')}\n`;
        }
        coreStatusOutput += `  手牌 (${game.player.hand.length}/${MAX_HAND_SIZE}):\n`;
        game.player.hand.forEach((cardId, index) => {
            const card = CARDS[cardId];
            coreStatusOutput += `    [${index + 1}] ${card.name} (费用:${card.cost}) - ${card.description(game.player)}\n`;
        });
        coreStatusOutput += `  牌库: ${game.player.drawPile.length}, 弃牌堆: ${game.player.discardPile.length}\n`;
        // Enemy
        coreStatusOutput += `${game.currentEnemy.name}: HP ${game.currentEnemy.hp}/${game.currentEnemy.maxHp}, 格挡 ${game.currentEnemy.block}\n`;
         if (Object.keys(game.currentEnemy.status).length > 0) {
            coreStatusOutput += `  状态: ${Object.entries(game.currentEnemy.status).map(([k,v]) => `${translateStatus(k)}:${v}`).join(', ')}\n`;
        }
        coreStatusOutput += `  意图: ${game.currentEnemy.getIntentDescription()}\n`;
        coreStatusOutput += "输入 '.sts play <序号>' 出牌, 或 '.sts endturn' 结束回合。";

    } else if (game.status === 'reward_card') {
        coreStatusOutput += "--- 卡牌奖励 ---\n";
        coreStatusOutput += `楼层: ${game.currentFloor + 1}\n`;
        coreStatusOutput += "选择一张卡牌加入你的牌组：\n";
        game.cardRewardOptions.forEach((cardId, index) => {
            const card = CARDS[cardId];
            coreStatusOutput += `  [${index + 1}] ${card.name} (费用:${card.cost}, ${card.type}) - ${card.description(game.player)}\n`;
        });
        coreStatusOutput += "输入 '.sts choose <序号>' 选择, 或 '.sts choose skip' 跳过。";

    } else if (game.status === 'reward_relic') {
        coreStatusOutput += "--- 遗物奖励 ---\n";
        coreStatusOutput += `楼层: ${game.currentFloor + 1}\n`;
        if (game.relicRewardOptions.length > 0) {
            const relic = RELICS[game.relicRewardOptions[0]];
            coreStatusOutput += `你找到了一个遗物：\n  [1] ${relic.name} - ${relic.description}\n`;
            coreStatusOutput += "输入 '.sts choose take' (或 choose 1) 拾取, 或 '.sts choose skip' 跳过。";
        } else {
            coreStatusOutput += "这里没有遗物。\n";
        }

    } else if (game.status === 'map') { // 通常是过渡状态
        coreStatusOutput += "--- 地图 ---\n";
        coreStatusOutput += `你当前在第 ${game.currentFloor + 1} 层。\n`;
        // "准备进入下一个区域..." 通常会很快被实际遭遇覆盖
    } else if (game.status === 'game_over') {
        coreStatusOutput += "--- 游戏结束 ---\n你失败了。输入 '.sts start' 重新开始。";
    } else if (game.status === 'victory') {
        coreStatusOutput += "--- 胜利！ ---\n恭喜你通关了尖塔之路！输入 '.sts start' 开始新的冒险。";
    } else if (game.status === 'idle') {
        coreStatusOutput += "欢迎来到尖塔之路！输入 '.sts start' 开始游戏。";
    }

    // 3. 组合日志和状态
    // 如果有当前行动的日志，先显示它，然后是核心状态。
    // 确保 "楼层" 和 "遭遇" 这类信息在战斗开始时被记录到 currentActionLog 中。
    if (currentActionLog.length > 0) {
        output = currentActionLog + "\n" + coreStatusOutput;
    } else {
        output = coreStatusOutput;
    }

    return output;
}

// --- Command Definition ---
const spireCmd = seal.ext.newCmdItemInfo();
spireCmd.name = 'sts';
spireCmd.aliases = ['尖塔之路'];
spireCmd.help = `尖塔之路 - 类杀戮尖塔卡牌游戏 (v${ext.version})
指令:
.sts start - 开始新游戏或重新开始。
.sts play <卡牌序号> - 在战斗中打出一张手牌。
.sts endturn - 在战斗中结束你的回合。
.sts choose <选项序号|skip|take> - 在奖励界面做出选择。
.sts status - 查看当前游戏状态。
.sts deck - 查看当前牌组构成。
.sts relics - 查看当前拥有的遗物。
.sts abandon - 放弃当前游戏。
.sts help - 显示此帮助信息。`; // Added help explicitly

spireCmd.solve = (ctx, msg, cmdArgs) => {
    const userId = ctx.player.userId;
    let game = loadGame(userId);
    const actionArg = cmdArgs.getArgN(1);
    const action = actionArg ? actionArg.toLowerCase() : 'status'; // Default to status if no action
    let reply = "";
    let showHelp = false;

    if (action === 'help' || (!actionArg && !game)) { // Show help if .sts help or just .sts and no game
        showHelp = true;
    } else if (action === 'start') {
        if (game && (game.status !== 'game_over' && game.status !== 'victory' && game.status !== 'idle')) {
            reply = "你已经在游戏中了。如果想重新开始，请先使用 '.sts abandon'。";
        } else {
            game = startGameFlow(userId); // Use the new function name
            reply = formatGameStatus(game);
        }
    } else if (action === 'abandon') {
        if (game) {
            deleteGame(userId);
            reply = "游戏已放弃。输入 '.sts start' 重新开始。";
        } else {
            reply = "没有正在进行的游戏可以放弃。";
        }
    } else {
        if (!game || game.status === 'idle') {
            reply = "没有正在进行的游戏。输入 '.sts start' 开始。";
        } else if (game.status === 'game_over' || game.status === 'victory') {
            reply = formatGameStatus(game);
        } else {
            switch (action) {
                case 'play':
                case 'endturn':
                case 'choose':
                    const subArgs = [];
                    for (let i = 2; i <= cmdArgs.args.length; i++) {
                         if (cmdArgs.getArgN(i)) subArgs.push(cmdArgs.getArgN(i));
                    }
                    handlePlayerAction(game, action, subArgs);
                    reply = formatGameStatus(game);
                    break;
                case 'status':
                    reply = formatGameStatus(game);
                    break;
                case 'deck':
                    let deckComposition = {};
                    game.player.deck.forEach(cardId => deckComposition[cardId] = (deckComposition[cardId] || 0) + 1);
                    reply = "当前牌组构成：\n" +
                        Object.entries(deckComposition)
                              .map(([id, count]) => `${CARDS[id].name} x${count}`)
                              .join('\n');
                    reply += `\n总计: ${game.player.deck.length} 张牌。`;
                    break;
                case 'relics':
                    if (game.player.relics.length > 0) {
                        reply = "当前遗物：\n" +
                            game.player.relics
                                .map(id => `【${RELICS[id].name}】: ${RELICS[id].description}`)
                                .join('\n');
                    } else {
                        reply = "你还没有遗物。";
                    }
                    break;
                default:
                    showHelp = true; // Unknown command, show help
                    break;
            }
        }
    }

    if (showHelp) {
        const ret = seal.ext.newCmdExecuteResult(true);
        ret.showHelp = true;
        return ret;
    }

    seal.replyToSender(ctx, msg, reply);
    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['sts'] = spireCmd;
ext.cmdMap['海豹之路'] = spireCmd;