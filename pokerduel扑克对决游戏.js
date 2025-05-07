// ==UserScript==
// @name         扑克对决
// @author       Gemini 2.5 Pro, Air
// @version      1.2.2
// @description  基于扑克牌的对决小游戏。
// @timestamp    1746622977
// @license      Apache-2.0
// @homepageURL  https://github.com/sealdice/javascript
// ==/UserScript==

// 首先检查是否已经加载了扩展，如果加载了则使用现有的，否则创建一个新的
let ext = seal.ext.find('PokerDuel');
if (!ext) {
    ext = seal.ext.new('PokerDuel', 'Gemini, Air', '1.2.2'); // 版本号更新
    seal.ext.register(ext);
}
// 新增AI名称配置
seal.ext.registerStringConfig(ext, "AI玩家_名称", "扑克机器人");
const BOT_THINK_DELAY = 5500; // BOT思考延迟（毫秒）


const SUITS = ['♠', '♥', '♣', '♦']; // 黑桃, 红桃, 梅花, 方片
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 卡牌点数映射，A=1, J=11, Q=12, K=13
function getCardNumericValue(cardValue) {
    if (cardValue === 'A') return 1;
    if (cardValue === 'J') return 11;
    if (cardValue === 'Q') return 12;
    if (cardValue === 'K') return 13;
    return parseInt(cardValue);
}

// 创建一副新牌堆
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const value of VALUES) {
            deck.push({ suit, value, text: suit + value });
        }
    }
    return deck;
}

// 洗牌 (Fisher-Yates shuffle)
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

// 初始化玩家数据
function initializePlayer(id, name, isBot = false) {
    return {
        id,
        name,
        hp: 20,
        sp: 10,
        def: 0,
        isBot,
        hand: [], // 手牌，仅进攻方有
        vampireStacks: 0, // 吸血附魔层数
        consecutiveHighHpTurns: 0, // 肉身成圣计数器
        isExhausted: false, // 是否力竭
        lastDamageTakenThisTurn: 0, // 本回合受到的伤害（用于碎甲、再生、反击）
    };
}

// 获取游戏状态的键
function getGameKey(groupId) {
    return `pokerduel:game:${groupId}`;
}

// 获取玩家统计数据的键
function getStatsKey(userId) {
    return `pokerduel:stats:${userId}`;
}

// 加载或初始化游戏数据
function loadGameData(groupId) {
    const key = getGameKey(groupId);
    const storedData = ext.storageGet(key);
    if (storedData) {
        try {
            const gameData = JSON.parse(storedData);
            return gameData;
        } catch (e) {
            seal. ομάδα日志.error('扑克对决：解析游戏数据失败', e);
            return null; 
        }
    }
    return null; 
}

// 保存游戏数据
function saveGameData(groupId, gameData) {
    const key = getGameKey(groupId);
    ext.storageSet(key, JSON.stringify(gameData));
}

// 加载玩家统计
function loadPlayerStats(userId) {
    const key = getStatsKey(userId);
    const storedData = ext.storageGet(key);
    if (storedData) {
        try {
            return JSON.parse(storedData);
        } catch (e) {
            seal. ομάδα日志.error('扑克对决：解析玩家统计失败', e);
            return { wins: 0, losses: 0 };
        }
    }
    return { wins: 0, losses: 0 };
}

// 保存玩家统计
function savePlayerStats(userId, stats) {
    const key = getStatsKey(userId);
    ext.storageSet(key, JSON.stringify(stats));
}

// 游戏主逻辑
const duelCmd = seal.ext.newCmdItemInfo();
duelCmd.name = '扑克对决';
duelCmd.aliases = ['pokerduel'];
duelCmd.help = `发起或管理一场扑克对决。 (v${ext.version})
用法：
.扑克对决 - 发起一场对决，等待其他玩家加入。
.扑克对决 接受 - 接受当前群组中等待开始的对决。自己接受则与BOT对战。
.扑克对决 出牌 <1|2|3> - 在你的回合，从手牌中选择一张打出。
.扑克对决 状态 - 查看当前对局状态。
.扑克对决 投降 - 投降并结束当前对局。
.扑克对决 战绩 - 查看你的战绩。`;
duelCmd.disabledInPrivate = true;

duelCmd.solve = (ctx, msg, cmdArgs) => {
    const groupId = ctx.group.groupId;
    const userId = ctx.player.userId;
    const userName = ctx.player.name;
    let game = loadGameData(groupId);
    let turnMessages = []; 

    const action = cmdArgs.getArgN(1) || '发起'; 

    if (action.toLowerCase() === '战绩' || action.toLowerCase() === 'stats') {
        const stats = loadPlayerStats(userId);
        const totalGames = stats.wins + stats.losses;
        const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(2) : 'N/A';
        seal.replyToSender(ctx, msg, `${userName} 的战绩：\n胜利：${stats.wins} 次\n失败：${stats.losses} 次\n胜率：${winRate}%`);
        return seal.ext.newCmdExecuteResult(true);
    }

    function endGame(winner, loser, reason) {
        turnMessages.push(`游戏结束！${winner.name} 获胜！原因：${reason}`);
        if (!winner.isBot) {
            const winnerStats = loadPlayerStats(winner.id);
            winnerStats.wins += 1;
            savePlayerStats(winner.id, winnerStats);
        }
        if (!loser.isBot) {
            const loserStats = loadPlayerStats(loser.id);
            loserStats.losses += 1;
            savePlayerStats(loser.id, loserStats);
        }
        seal.replyToSender(ctx, msg, turnMessages.join('\n'));
        turnMessages = []; 
        ext.storageSet(getGameKey(groupId), null); 
        return seal.ext.newCmdExecuteResult(true); 
    }

    function checkGameOver(currentGame) {
        if (!currentGame || !currentGame.players || currentGame.players.length < 2) {
            return null; 
        }
        const player1 = currentGame.players[0];
        const player2 = currentGame.players[1];

        if (player1.hp <= 0) return endGame(player2, player1, `${player1.name} HP归零`);
        if (player2.hp <= 0) return endGame(player1, player2, `${player2.name} HP归零`);
        
        const attacker = currentGame.players[currentGame.currentPlayerIndex];
        const defender = currentGame.players[1 - currentGame.currentPlayerIndex];

        if (defender.hp > 45) {
            if (defender.consecutiveHighHpTurns > 1) {
                 return endGame(defender, attacker, `${defender.name} 肉身成圣`);
            }
        }
        if (currentGame.deck.length === 0 && attacker.hand.length === 0) { 
            turnMessages.push("牌库已空且进攻方无手牌！比较血量决定胜负...");
            if (player1.hp > player2.hp) return endGame(player1, player2, "牌库耗尽，血量较高");
            if (player2.hp > player1.hp) return endGame(player2, player1, "牌库耗尽，血量较高");
            return endGame(player1, player2, "牌库耗尽，血量相同（平局）"); 
        }
        return null; 
    }
    
    function getCardSkillHint(suit) {
        switch (suit) {
            case '♠': return '防御';
            case '♥': return '恢复';
            case '♣': return '技能';
            case '♦': return '攻击';
            default: return '';
        }
    }

    function formatPlayerStatus(player, isCurrentAttacker) {
        let status = `${player.name}: HP ${player.hp.toFixed(1)}, SP ${player.sp}, DEF ${player.def}`;
        if (player.vampireStacks > 0) status += `, 吸血层数 ${player.vampireStacks}`;
        if (player.isExhausted) status += ` (力竭)`;
        if (isCurrentAttacker && player.hand.length > 0) {
            const handDescription = player.hand.map((c, i) => {
                const skillHint = getCardSkillHint(c.suit);
                return `[${i+1}]${c.suit}${skillHint}${c.value}`; // 例如 [1]♥恢复A
            }).join(' ');
            status += `\n手牌: ${handDescription}`;
        }
        return status;
    }

    async function handleBotPlayCard(currentGame) {
        const attacker = currentGame.players[currentGame.currentPlayerIndex];
        const defender = currentGame.players[1 - currentGame.currentPlayerIndex];

        if (!attacker.isBot || attacker.hand.length === 0) {
            return; 
        }
        
        turnMessages.push(`轮到 ${attacker.name} (BOT) 思考...`);
        seal.replyToSender(ctx, msg, turnMessages.join('\n')); 
        turnMessages = []; 

        await new Promise(resolve => setTimeout(resolve, BOT_THINK_DELAY)); 

        let bestCardIndex = 0; 
        let bestScore = -Infinity;
        const hand = attacker.hand;

        for (let i = 0; i < hand.length; i++) {
            const card = hand[i];
            let currentScore = 0;
            const cardTrueValue = getCardNumericValue(card.value);
            currentScore += cardTrueValue * 0.1; 
            switch (card.suit) {
                case '♥': 
                    currentScore += 2; 
                    if (attacker.hp < 15) currentScore += (15 - attacker.hp) * 0.8;
                    if (attacker.hp < 20 && cardTrueValue > 0) currentScore += cardTrueValue * 0.5; 
                    if (card.value === 'A' || (hand.length === 3 && attacker.sp >= cardTrueValue + 3)) {
                        currentScore += 3; 
                    }
                    break;
                case '♠': 
                    currentScore += 2; 
                    if (attacker.def < 5) currentScore += (5 - attacker.def) * 0.6; 
                    currentScore += cardTrueValue * 0.3;
                    if (card.value === 'A' || (hand.length === 3 && attacker.sp >= cardTrueValue + 3)) {
                        currentScore += 2.5;
                    }
                    break;
                case '♣': 
                    currentScore += 1.5;
                    if (attacker.sp < 8) currentScore += (8 - attacker.sp) * 0.7; 
                    currentScore += cardTrueValue * 0.2;
                    if (hand.length === 3 || card.value === 'A') { 
                        currentScore += 4.5; 
                        let otherCards = hand.filter((_, idx) => idx !== i);
                        if (otherCards.some(oc => oc.suit === '♦')) currentScore += 2.5; 
                        if (otherCards.some(oc => oc.suit === '♥' && attacker.hp < 18)) currentScore += 2;
                    }
                    break;
                case '♦': 
                    currentScore += 3; 
                    currentScore += cardTrueValue * 1.0; 
                    if (defender.def < cardTrueValue * 0.8) currentScore += 2.5; 
                    if (attacker.vampireStacks > 0) currentScore += 5; 
                    if (card.value === 'A' || (hand.length === 3 && attacker.sp >= cardTrueValue + 3)) {
                        if (attacker.hp > cardTrueValue / 2 + 6) { 
                            currentScore += 4; 
                            if (defender.hp <= cardTrueValue * 1.5 - defender.def) currentScore += 10; 
                        }
                    }
                    if (defender.hp <= cardTrueValue - defender.def && card.value !== 'A') currentScore += 8; 
                    break;
            }
            if (card.value === 'A') {
                currentScore += 6; 
                if (hand.length === 3 && attacker.sp > 12) {
                   let otherCards = hand.filter((_, idx) => idx !== i);
                   if (otherCards.every(oc => getCardNumericValue(oc.value) >= 5)) {
                       currentScore += 6; 
                   }
                }
            }
            if (currentScore > bestScore) {
                bestScore = currentScore;
                bestCardIndex = i;
            }
        }
        
        const playedCard = attacker.hand[bestCardIndex];
        let cardValue = getCardNumericValue(playedCard.value);

        turnMessages.push(`---------- ${attacker.name} (BOT) 的回合 (牌库: ${currentGame.deck.length}) ----------`);

        if (playedCard.value === 'A') {
            const aceRoll = Math.floor(Math.random() * 6) + 1;
            cardValue = aceRoll; 
            turnMessages.push(`${attacker.name} 打出【${playedCard.text}】，发动ACE技能！六面骰判定为 ${aceRoll}。`);
            turnMessages.push(`所有手牌 (${attacker.hand.map(c=>c.text).join(', ')}) 将作为点数为 ${aceRoll} 的技能牌打出！`);
            const cardsToPlayAsSkill = [...attacker.hand]; 
            attacker.hand = []; 
            for (const aceCard of cardsToPlayAsSkill) {
                const effectResult = applyCardEffect(currentGame, attacker, defender, aceCard, cardValue, true, false);
                turnMessages.push(effectResult.message);
                let gameEndCheck = checkGameOver(currentGame); if (gameEndCheck) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndCheck; }
            }
        } else {
            attacker.hand.splice(bestCardIndex, 1); 
            const effectResult = applyCardEffect(currentGame, attacker, defender, playedCard, cardValue, false, false);
            turnMessages.push(effectResult.message);
            let gameEndCheck = checkGameOver(currentGame); if (gameEndCheck) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndCheck; }

            if (!(playedCard.suit === '♣' && effectResult.message.includes("技能判定成功"))) {
                 if (attacker.hand.length > 0) {
                    turnMessages.push(`${attacker.name} 剩余手牌 ${attacker.hand.map(c=>c.text).join(', ')} 已舍弃。`);
                    attacker.hand = [];
                 }
            }
        }
        
        let gameEndResult = checkGameOver(currentGame);
        if (gameEndResult) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndResult; }

        if (defender.sp > 0 && !defender.isExhausted) { 
            const defenseSkillRoll = Math.floor(Math.random() * 20) + 1;
            turnMessages.push(`${defender.name} (SP ${defender.sp}) 进行防守技能判定... D20掷出 ${defenseSkillRoll}。`);
            if (defender.sp >= defenseSkillRoll) {
                if (currentGame.deck.length > 0) {
                    const defenseCard = currentGame.deck.shift();
                    const defenseCardValue = getCardNumericValue(defenseCard.value);
                    turnMessages.push(`${defender.name} 技能判定成功！从牌堆顶抽取【${defenseCard.text}】(点数 ${defenseCardValue})作为技能牌打出！`);
                    const effectResult = applyCardEffect(currentGame, defender, attacker, defenseCard, defenseCardValue, true, true);
                    turnMessages.push(effectResult.message);
                    gameEndResult = checkGameOver(currentGame); if (gameEndResult) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndResult; }
                } else {
                    turnMessages.push("但牌库已空，无法抽取技能牌。");
                }
            } else {
                turnMessages.push(`${defender.name} 技能判定失败(${defender.sp} < ${defenseSkillRoll})。`);
            }
        }

        if (attacker.sp < 0 && !attacker.isExhausted) {
            turnMessages.push(`${attacker.name} 技能点(${attacker.sp})耗尽，陷入力竭！`);
            attacker.isExhausted = true; 
        }
        if (defender.sp < 0 && !defender.isExhausted) { 
            turnMessages.push(`${defender.name} 技能点(${defender.sp})耗尽，陷入力竭！`);
            defender.isExhausted = true;
        }
        
        if (defender.hp > 45) {
            defender.consecutiveHighHpTurns +=1; 
            if (defender.consecutiveHighHpTurns > 1) { 
                gameEndResult = endGame(defender, attacker, `${defender.name} 肉身成圣`);
                seal.replyToSender(ctx, msg, turnMessages.join('\n'));
                return gameEndResult;
            }
        } else {
            defender.consecutiveHighHpTurns = 0;
        }
         if (attacker.hp > 45) {
            attacker.consecutiveHighHpTurns +=1; 
        } else {
            attacker.consecutiveHighHpTurns = 0;
        }

        gameEndResult = checkGameOver(currentGame); 
        if (gameEndResult) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndResult; }
        
        currentGame.currentPlayerIndex = 1 - currentGame.currentPlayerIndex;
        currentGame.turn++;
        
        const nextTurnStartResult = startNewTurn(currentGame); 
        if (nextTurnStartResult && typeof nextTurnStartResult.success === 'boolean') { 
             seal.replyToSender(ctx, msg, turnMessages.join('\n')); 
             return nextTurnStartResult;
        }
        saveGameData(groupId, currentGame);
        seal.replyToSender(ctx, msg, turnMessages.join('\n')); 
        turnMessages = []; 
        return null; 
    }


    function startNewTurn(currentGame) {
        const attacker = currentGame.players[currentGame.currentPlayerIndex];
        const defender = currentGame.players[1 - currentGame.currentPlayerIndex];
        
        // **FIX**: Only apply defense decay if it's not the very first turn setup
        if (!currentGame.isFirstTurnSetup) {
            if (defender.def > 10) {
                turnMessages.push(`${defender.name} 防御过高 (${defender.def})，强制变为10。`);
                defender.def = 10;
            } else if (defender.def > 0 && defender.def <= 10) { 
                const defReduction = Math.min(defender.def, 2);
                turnMessages.push(`${defender.name} 防御 (${defender.def}) 自动降低${defReduction}。`);
                defender.def -= defReduction;
                defender.def = Math.max(0, defender.def);
            }
        }
        currentGame.isFirstTurnSetup = false; // Reset flag after first check

        if (attacker.isExhausted) {
            turnMessages.push(`${attacker.name} 处于力竭状态，跳过行动回合，SP回复至5。`);
            attacker.sp = 5;
            attacker.isExhausted = false;
            currentGame.currentPlayerIndex = 1 - currentGame.currentPlayerIndex; 
            saveGameData(groupId, currentGame); 
            return startNewTurn(currentGame); 
        }

        attacker.hand = [];
        if (currentGame.deck.length < 3) { 
            turnMessages.push(currentGame.deck.length > 0 ? "牌库不足3张，补充剩余所有牌作为手牌。" : "牌库已空，无法抽牌。");
            while(currentGame.deck.length > 0) {
                attacker.hand.push(currentGame.deck.shift());
            }
        } else {
            for (let i = 0; i < 3; i++) {
                attacker.hand.push(currentGame.deck.shift());
            }
        }
        
        if (attacker.hand.length === 0 && currentGame.deck.length === 0) { 
            const gameEndResult = checkGameOver(currentGame);
            if (gameEndResult) return gameEndResult; 
        }

        turnMessages.push("----------");
        turnMessages.push(`轮到 ${attacker.name} 进攻！ (回合 ${currentGame.turn})`);
        turnMessages.push(formatPlayerStatus(attacker, true));
        turnMessages.push(formatPlayerStatus(defender, false));
        turnMessages.push("----------");
        if (attacker.hand.length > 0) {
             if (!attacker.isBot) { 
                turnMessages.push(`请 ${attacker.name} 使用 ".扑克对决 出牌 <1-${attacker.hand.length}>" 选择一张牌打出。`);
             }
        } else { 
            turnMessages.push(`${attacker.name} 没有手牌可以打出，回合结束。`);
            let gameEndCheck = checkGameOver(currentGame);
            if (gameEndCheck) return gameEndCheck;
            currentGame.currentPlayerIndex = 1 - currentGame.currentPlayerIndex;
            saveGameData(groupId, currentGame);
            return startNewTurn(currentGame); 
        }

        if (attacker.isBot) {
            handleBotPlayCard(currentGame).then(gameEndResult => {
                // Game end messages handled by endGame or within handleBotPlayCard
            }).catch(err => {
                seal. ομάδα日志.error("Error during BOT turn: ", err);
            });
            return null; 
        }
        return null; 
    }
    
    function applyCardEffect(currentGame, player, opponent, card, cardValue, isSkillCard, isDefenderSkill) {
        const p = cardValue; 
        let message = "";
        let damageDealtToHp = 0; 
        let attackPower = 0; 

        opponent.lastDamageTakenThisTurn = 0;
        if (!isDefenderSkill) player.lastDamageTakenThisTurn = 0; 

        if (isDefenderSkill) { 
            message += `${player.name} 作为防守方发动技能【${card.text}】(点数${p})：`;
            if (card.suit !== '♣') {
                if (player.sp < p) {
                    message += `SP不足(${player.sp} < ${p})，技能发动失败。`;
                    return { message, attackPower: 0, damageDealtToHp: 0 };
                }
                player.sp -= p;
            }
            switch (card.suit) {
                case '♠': 
                    player.def += Math.floor(p / 2);
                    message += `自身防御提高${Math.floor(p / 2)}。`;
                    break;
                case '♥': 
                    player.hp += Math.floor(p / 2);
                    message += `自身生命回复${Math.floor(p / 2)}。`;
                    break;
                case '♣':  
                    opponent.sp -= p;
                    message += `使 ${opponent.name} 技能点减少${p}。`;
                    break;
                case '♦': 
                    attackPower = Math.floor(p / 2);
                    message += `对 ${opponent.name} 发动${attackPower}点攻击。`;
                    break;
            }
        } else if (isSkillCard) { 
            message += `${player.name} 发动技能【${card.text}】(点数${p})：`;
            if (player.sp < p && !(card.suit === '♣' && !isDefenderSkill) ) { 
                 message += `SP不足(${player.sp} < ${p})，技能发动失败。`;
                 return { message, attackPower: 0, damageDealtToHp: 0 };
            }
            if (card.suit !== '♣') { 
                player.sp -= p;
            }

            switch (card.suit) {
                case '♠': 
                    attackPower = Math.floor(p / 2);
                    player.def += Math.floor(p / 2);
                    message += `对 ${opponent.name} 发动${attackPower}点攻击，自身防御增加${Math.floor(p / 2)}。`;
                    break;
                case '♥': 
                    player.hp += Math.floor(p / 2);
                    player.vampireStacks++;
                    message += `自身生命回复${Math.floor(p / 2)}，获得1层吸血附魔。`;
                    break;
                case '♣': 
                    if (!isDefenderSkill) player.sp -= p; // Cost for 吟唱 if offensive
                    player.sp += p; 
                    message += `自身技能点增加${p} (SP变为${player.sp})。`;
                    
                    const availableSuits = ['♠', '♥', '♦']; 
                    const randomSuit = availableSuits[Math.floor(Math.random() * availableSuits.length)];
                    const randomValueNumber = Math.floor(Math.random() * (8 - 4 + 1)) + 4; 
                    const randomCardValueTextObj = VALUES.find((val, idx) => getCardNumericValue(val) === randomValueNumber);
                    const randomCardValueText = randomCardValueTextObj || String(randomValueNumber);
                    const randomCard = { suit: randomSuit, value: randomCardValueText, text: randomSuit + randomCardValueText};
                    
                    message += `\n${player.name} 因【吟唱】额外打出随机技能牌【${randomCard.text}】(点数${randomValueNumber})！`;
                    
                    if (player.sp < randomValueNumber) { 
                        message += `\n但SP不足(${player.sp} < ${randomValueNumber})以发动额外技能，跳过。`;
                    } else {
                        const subEffectResult = applyCardEffect(currentGame, player, opponent, randomCard, randomValueNumber, true, false);
                        attackPower += subEffectResult.attackPower || 0; 
                        message += "\n" + subEffectResult.message; 
                    }
                    break;
                case '♦': 
                    const selfDamage = Math.floor(p / 2);
                    player.hp -= selfDamage;
                    player.lastDamageTakenThisTurn = selfDamage; 
                    attackPower = Math.floor(p * 1.5);
                    message += `自身生命降低${selfDamage}，对 ${opponent.name} 发动${attackPower}点攻击。`;
                    if (player.hp <= 0) { 
                        message += `\n${player.name} 因燃血HP归零！`;
                    }
                    break;
            }
        } else { 
            message += `${player.name} 打出【${card.text}】(点数${p})：`;
            switch (card.suit) {
                case '♠': 
                    player.def += p;
                    message += `自身防御增加${p}。`;
                    break;
                case '♥': 
                    player.hp += p;
                    message += `自身生命回复${p}。`;
                    break;
                case '♣': 
                    player.sp += p;
                    message += `自身技能点增加${p}。`;
                    const skillCheckRoll = Math.floor(Math.random() * 20) + 1;
                    if (player.sp >= skillCheckRoll) {
                        message += `技能判定成功(${player.sp} >= ${skillCheckRoll})！将剩余两张手牌作为技能牌打出！`;
                        const otherCards = player.hand.filter(c => c.text !== card.text); 
                        for (const otherCard of otherCards) {
                            const otherCardValue = getCardNumericValue(otherCard.value);
                            const subEffectResult = applyCardEffect(currentGame, player, opponent, otherCard, otherCardValue, true, false);
                            attackPower += subEffectResult.attackPower || 0;
                            message += "\n" + subEffectResult.message;
                        }
                        player.hand = []; 
                    } else {
                        message += `技能判定失败(${player.sp} < ${skillCheckRoll})。`;
                    }
                    break;
                case '♦': 
                    attackPower = p;
                    message += `对 ${opponent.name} 发动${p}点攻击。`;
                    break;
            }
        }

        if (attackPower > 0) {
            const damageBeforeDef = attackPower;
            const actualDef = opponent.def;
            const damageAfterDef = Math.max(0, damageBeforeDef - actualDef);
            
            if (damageAfterDef > 0) {
                opponent.hp -= damageAfterDef;
                damageDealtToHp = damageAfterDef;
                opponent.lastDamageTakenThisTurn = damageDealtToHp; 
                message += `\n${opponent.name} DEF(${actualDef}) 抵挡 ${damageBeforeDef - damageAfterDef}，受到 ${damageDealtToHp.toFixed(1)} 点伤害。`;

                if (player.vampireStacks > 0 && !isDefenderSkill) { 
                    const healedAmount = Math.floor(damageDealtToHp / 2);
                    player.hp += healedAmount;
                    message += `\n${player.name} 通过吸血回复 ${healedAmount.toFixed(1)} 点生命。`;
                    player.vampireStacks = 0; 
                }
            } else {
                message += `\n${opponent.name} 的防御 (${actualDef}) 完全抵挡了攻击 (${damageBeforeDef})。`;
                if (player.vampireStacks > 0 && !isDefenderSkill) {
                     message += `\n${player.name} 的吸血攻击未造成伤害，吸血层数已消耗。`; 
                     player.vampireStacks = 0;
                }
            }
        }
        
        if (player.lastDamageTakenThisTurn > 0 && isDefenderSkill) { 
            if (card.suit === '♠') { 
                opponent.def = Math.max(0, opponent.def - p); 
                 message += `\n因【碎甲】(${p})效果，${opponent.name} 防御值减少${p}。`;
            } else if (card.suit === '♥') { 
                player.hp += p;
                 message += `\n因【再生】(${p})效果，${player.name} 额外回复${p}生命。`;
            } else if (card.suit === '♦') { 
                const reflectDamage = Math.floor(player.lastDamageTakenThisTurn * 0.5);
                opponent.hp -= reflectDamage; 
                 message += `\n因【反击】效果，对 ${opponent.name} 反射${reflectDamage}点伤害（无视防御）。`;
            }
        }
        return { message, attackPower, damageDealtToHp };
    }


    // 主要命令处理逻辑
    switch (action.toLowerCase()) {
        case '发起':
        case 'start':
            if (game && game.status !== 'ended' && game.status !== null) {
                seal.replyToSender(ctx, msg, '当前群组已有一场对决正在进行中或等待开始。');
                return seal.ext.newCmdExecuteResult(true);
            }
            game = {
                status: 'waiting',
                initiator: { id: userId, name: userName },
                players: [],
                deck: [],
                currentPlayerIndex: -1,
                firstPlayerId: null, 
                turn: 0,
                groupName: ctx.group.name || '未知群组', 
                groupId: groupId, 
                isFirstTurnSetup: false, // For preventing initial def decay
            };
            saveGameData(groupId, game);
            seal.replyToSender(ctx, msg, `${userName} 发起了一场扑克对决！\n其他玩家发送 ".扑克对决 接受" 加入对战。\n${userName} 自己接受则与BOT对战。`);
            break;

        case '接受':
        case 'join':
            if (!game || game.status !== 'waiting') {
                seal.replyToSender(ctx, msg, '当前没有等待开始的对决。');
                return seal.ext.newCmdExecuteResult(true);
            }
            if (game.players.find(p => p.id === userId) && userId !== game.initiator.id) {
                 seal.replyToSender(ctx, msg, '你已经加入了。');
                 return seal.ext.newCmdExecuteResult(true);
            }

            const player1 = initializePlayer(game.initiator.id, game.initiator.name);
            let player2;

            if (userId === game.initiator.id) { 
                const configuredAiName = seal.ext.getStringConfig(ext, "AI玩家_名称") || "扑克机器人"; 
                player2 = initializePlayer('BOT_PLAYER_ID', configuredAiName, true);
                turnMessages.push(`${userName} 接受了自己的挑战，将与 ${configuredAiName} 对战！`);
            } else { 
                if (game.players.some(p => p.id === userId)) { 
                    seal.replyToSender(ctx, msg, '你已经加入这场对决了。');
                    return seal.ext.newCmdExecuteResult(true);
                }
                player2 = initializePlayer(userId, userName);
                turnMessages.push(`${userName} 接受了 ${game.initiator.name} 的挑战！`);
            }
            
            game.players = [player1, player2];
            game.status = 'playing';
            game.isFirstTurnSetup = true; // **Mark that this is the initial setup**

            const firstPlayerRoll = Math.random();
            game.currentPlayerIndex = firstPlayerRoll < 0.5 ? 0 : 1;
            const firstPlayer = game.players[game.currentPlayerIndex];
            const secondPlayer = game.players[1 - game.currentPlayerIndex];
            game.firstPlayerId = firstPlayer.id;

            turnMessages.push(`系统随机选定 ${firstPlayer.name} 为先手方。`);
            secondPlayer.def = 5; 
            turnMessages.push(`${secondPlayer.name} 作为后手方，获得 5点 DEF。`);

            game.deck = createDeck();
            shuffleDeck(game.deck);
            turnMessages.push("牌堆已洗牌！");
            
            game.turn = 1;
            const turnStartResult = startNewTurn(game); 
            if (turnStartResult && typeof turnStartResult.success === 'boolean') { 
                // Game ended during setup, messages handled by endGame
            } else if (!game.players[game.currentPlayerIndex].isBot) { // Only send if next is human
                 seal.replyToSender(ctx, msg, turnMessages.join('\n')); 
                 turnMessages = []; 
            } // If BOT is first, handleBotPlayCard will send its own messages.
            saveGameData(groupId, game); 
            break;

        case '出牌':
        case 'play':
            if (!game || game.status !== 'playing') {
                seal.replyToSender(ctx, msg, '当前没有正在进行的对决。');
                return seal.ext.newCmdExecuteResult(true);
            }
            const attacker = game.players[game.currentPlayerIndex];
            const defender = game.players[1 - game.currentPlayerIndex];

            if (attacker.isBot) {
                seal.replyToSender(ctx, msg, '现在是 BOT 的回合，请等待其行动。');
                return seal.ext.newCmdExecuteResult(true);
            }
            if (attacker.id !== userId) { 
                seal.replyToSender(ctx, msg, '现在不是你的回合。');
                return seal.ext.newCmdExecuteResult(true);
            }
             if (attacker.isExhausted) {
                seal.replyToSender(ctx, msg, '你处于力竭状态，本回合无法行动。');
                return seal.ext.newCmdExecuteResult(true);
            }

            const cardIndex = parseInt(cmdArgs.getArgN(2)) - 1;
            if (isNaN(cardIndex) || cardIndex < 0 || cardIndex >= attacker.hand.length) {
                seal.replyToSender(ctx, msg, `无效的选择。请从1到${attacker.hand.length}中选择一张牌。手牌: ${attacker.hand.map((c,i)=> {const sh=getCardSkillHint(c.suit); return `[${i+1}]${c.suit}${sh}${c.value}`;}).join(' ')}`);
                return seal.ext.newCmdExecuteResult(true);
            }

            const playedCard = attacker.hand[cardIndex];
            let cardValue = getCardNumericValue(playedCard.value);

            turnMessages.push(`---------- ${attacker.name} 的回合 (牌库: ${game.deck.length}) ----------`);

            if (playedCard.value === 'A') {
                const aceRoll = Math.floor(Math.random() * 6) + 1;
                cardValue = aceRoll; 
                turnMessages.push(`${attacker.name} 打出【${playedCard.text}】，发动ACE技能！六面骰判定为 ${aceRoll}。`);
                turnMessages.push(`所有手牌 (${attacker.hand.map(c=>c.text).join(', ')}) 将作为点数为 ${aceRoll} 的技能牌打出！`);
                const cardsToPlayAsSkill = [...attacker.hand]; 
                attacker.hand = []; 
                for (const aceCard of cardsToPlayAsSkill) {
                    const effectResult = applyCardEffect(game, attacker, defender, aceCard, cardValue, true, false);
                    turnMessages.push(effectResult.message);
                    let gameEndCheck = checkGameOver(game); if (gameEndCheck) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndCheck; }
                }
            } else {
                attacker.hand.splice(cardIndex, 1); 
                const effectResult = applyCardEffect(game, attacker, defender, playedCard, cardValue, false, false);
                turnMessages.push(effectResult.message);
                let gameEndCheck = checkGameOver(game); if (gameEndCheck) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndCheck; }

                if (!(playedCard.suit === '♣' && effectResult.message.includes("技能判定成功"))) {
                     if (attacker.hand.length > 0) {
                        turnMessages.push(`${attacker.name} 剩余手牌 ${attacker.hand.map(c=>c.text).join(', ')} 已舍弃。`);
                        attacker.hand = [];
                     }
                }
            }
            
            let gameEndResult = checkGameOver(game);
            if (gameEndResult) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndResult; }

            if (defender.sp > 0 && !defender.isExhausted) { 
                const defenseSkillRoll = Math.floor(Math.random() * 20) + 1;
                turnMessages.push(`${defender.name} (SP ${defender.sp}) 进行防守技能判定... D20掷出 ${defenseSkillRoll}。`);
                if (defender.sp >= defenseSkillRoll) {
                    if (game.deck.length > 0) {
                        const defenseCard = game.deck.shift();
                        const defenseCardValue = getCardNumericValue(defenseCard.value);
                        turnMessages.push(`${defender.name} 技能判定成功！从牌堆顶抽取【${defenseCard.text}】(点数 ${defenseCardValue})作为技能牌打出！`);
                        const effectResult = applyCardEffect(game, defender, attacker, defenseCard, defenseCardValue, true, true);
                        turnMessages.push(effectResult.message);
                        gameEndResult = checkGameOver(game); if (gameEndResult) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndResult; }
                    } else {
                        turnMessages.push("但牌库已空，无法抽取技能牌。");
                    }
                } else {
                    turnMessages.push(`${defender.name} 技能判定失败(${defender.sp} < ${defenseSkillRoll})。`);
                }
            }

            if (attacker.sp < 0 && !attacker.isExhausted) {
                turnMessages.push(`${attacker.name} 技能点(${attacker.sp})耗尽，陷入力竭！`);
                attacker.isExhausted = true; 
            }
            if (defender.sp < 0 && !defender.isExhausted) { 
                turnMessages.push(`${defender.name} 技能点(${defender.sp})耗尽，陷入力竭！`);
                defender.isExhausted = true;
            }
            
            if (defender.hp > 45) {
                defender.consecutiveHighHpTurns +=1; 
                if (defender.consecutiveHighHpTurns > 1) { 
                    gameEndResult = endGame(defender, attacker, `${defender.name} 肉身成圣`);
                    seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndResult;
                }
            } else {
                defender.consecutiveHighHpTurns = 0;
            }
             if (attacker.hp > 45) {
                attacker.consecutiveHighHpTurns +=1; 
            } else {
                attacker.consecutiveHighHpTurns = 0;
            }

            gameEndResult = checkGameOver(game); 
            if (gameEndResult) { seal.replyToSender(ctx, msg, turnMessages.join('\n')); return gameEndResult; }
            
            game.currentPlayerIndex = 1 - game.currentPlayerIndex;
            game.turn++;
            
            const nextTurnStartResult = startNewTurn(game); 
            if (nextTurnStartResult && typeof nextTurnStartResult.success === 'boolean') { 
                 seal.replyToSender(ctx, msg, turnMessages.join('\n')); 
                 return nextTurnStartResult;
            }
            if (!game.players[game.currentPlayerIndex].isBot) {
                 seal.replyToSender(ctx, msg, turnMessages.join('\n'));
            }
            turnMessages = []; 
            saveGameData(groupId, game);
            break;

        case '状态':
        case 'status':
            if (!game || game.status === 'ended' || game.status === null) {
                seal.replyToSender(ctx, msg, '当前没有正在进行的对决。');
                return seal.ext.newCmdExecuteResult(true);
            }
            if (game.status === 'waiting') {
                 seal.replyToSender(ctx, msg, `一场由 ${game.initiator.name} 发起的对决正在等待玩家接受。`);
                 return seal.ext.newCmdExecuteResult(true);
            }

            const currentAttacker = game.players[game.currentPlayerIndex];
            const currentDefender = game.players[1 - game.currentPlayerIndex];
            let statusReport = [`当前回合: ${game.turn}`, `牌库剩余: ${game.deck.length}张`];
            statusReport.push("----------");
            statusReport.push(formatPlayerStatus(currentAttacker, true)); 
            statusReport.push(formatPlayerStatus(currentDefender, false));
            statusReport.push("----------");
            if (currentAttacker.id === userId && !currentAttacker.isBot && !currentAttacker.isExhausted) {
                 statusReport.push(`轮到你 (${currentAttacker.name}) 行动。`);
            } else if (currentAttacker.isBot && !currentAttacker.isExhausted) {
                 statusReport.push(`轮到 ${currentAttacker.name} 行动。`);
            } else if (currentAttacker.isExhausted) {
                 statusReport.push(`${currentAttacker.name} 处于力竭状态。`);
            } else {
                 statusReport.push(`轮到 ${currentAttacker.name} 行动。`);
            }
            seal.replyToSender(ctx, msg, statusReport.join('\n'));
            break;
        
        case '投降':
        case 'surrender':
            if (!game || game.status !== 'playing') {
                seal.replyToSender(ctx, msg, '当前没有正在进行的对决可以投降。');
                return seal.ext.newCmdExecuteResult(true);
            }
            const playerIndex = game.players.findIndex(p => p.id === userId);
            if (playerIndex === -1) {
                seal.replyToSender(ctx, msg, '你不在当前的对决中。');
                return seal.ext.newCmdExecuteResult(true);
            }
            const surrenderer = game.players[playerIndex];
            const winnerBySurrender = game.players[1 - playerIndex];
            turnMessages.push(`${surrenderer.name} 选择了投降。`);
            return endGame(winnerBySurrender, surrenderer, `${surrenderer.name} 投降`);

        default:
            const ret = seal.ext.newCmdExecuteResult(true);
            ret.showHelp = true;
            return ret;
    }

    return seal.ext.newCmdExecuteResult(true);
};

ext.cmdMap['扑克对决'] = duelCmd;
ext.cmdMap['pokerduel'] = duelCmd; 