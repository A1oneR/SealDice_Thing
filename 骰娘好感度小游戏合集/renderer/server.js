'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
let canvasApi;
try { canvasApi = require('@napi-rs/canvas'); }
catch (error) { canvasApi = require('canvas'); }
const { createCanvas, loadImage } = canvasApi;

const PORT = Math.max(1, Math.min(65535, Number.parseInt(process.env.AFFECTION_RENDER_PORT || '3891', 10)));
const HOST = process.env.AFFECTION_RENDER_HOST || '127.0.0.1';
const RENDER_TTL_MS = Math.max(60_000, Math.min(3_600_000, Number.parseInt(process.env.AFFECTION_IMAGE_TTL_MS || '600000', 10)));
const MAX_RENDERED_IMAGES = Math.max(10, Math.min(1000, Number.parseInt(process.env.AFFECTION_IMAGE_CACHE_MAX || '200', 10)));
const ASSET_DIR = path.join(__dirname, 'assets');
const BACKGROUNDS = {
  casino: path.join(ASSET_DIR, 'casino-table.png'),
  dice: path.join(ASSET_DIR, 'dice-table.png'),
  fishing: path.join(ASSET_DIR, 'fishing-water.png'),
  auction: path.join(ASSET_DIR, 'auction-yard.png'),
  auctionOpen: path.join(ASSET_DIR, 'auction-open.png')
};
const imageCache = new Map();
const renderedImages = new Map();

function pruneRenderedImages(now = Date.now()) {
  for (const [id, entry] of renderedImages) {
    if (entry.expiresAt <= now) renderedImages.delete(id);
  }
  while (renderedImages.size >= MAX_RENDERED_IMAGES) {
    const oldest = renderedImages.keys().next().value;
    if (!oldest) break;
    renderedImages.delete(oldest);
  }
}

function storeRenderedImage(buffer) {
  pruneRenderedImages();
  const id = crypto.randomBytes(12).toString('hex');
  renderedImages.set(id, { buffer, expiresAt: Date.now() + RENDER_TTL_MS });
  return id;
}

function backgroundFor(kind) {
  if (['poker', 'blackjack', 'dmd', 'love', 'videoPoker'].includes(kind)) return BACKGROUNDS.casino;
  if (kind === 'fishing') return BACKGROUNDS.fishing;
  if (kind === 'auction') return BACKGROUNDS.auction;
  return BACKGROUNDS.dice;
}

function accentFor(kind) {
  if (['poker', 'blackjack', 'dmd', 'videoPoker'].includes(kind)) return '#f3c969';
  if (kind === 'love') return '#7edc9d';
  if (kind === 'fishing') return '#82d5d0';
  if (kind === 'auction') return '#f0c84b';
  return '#ef8d7f';
}

async function cachedImage(file) {
  // node-canvas on Windows can fail to fopen paths containing non-ASCII characters.
  if (!imageCache.has(file)) imageCache.set(file, loadImage(fs.readFileSync(file)));
  return imageCache.get(file);
}

function sanitizeText(value, max = 240) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTone(value) {
  return ['accent', 'positive', 'negative', 'neutral'].includes(value) ? value : 'neutral';
}

function normalizePlayingCard(card) {
  if (!card) return null;
  return {
    rank: sanitizeText(card.rank, 3), suit: ['S', 'H', 'D', 'C'].includes(card.suit) ? card.suit : 'S',
    hidden: Boolean(card.hidden)
  };
}

function normalizeNumberCard(card) {
  if (!card) return null;
  return { value: Math.max(1, Math.min(99, Math.floor(safeNumber(card.value, 1)))), hidden: Boolean(card.hidden) };
}

function normalizeDmdCard(card) {
  if (!card || typeof card !== 'object') return null;
  const suit = ['M', 'T', 'D', 'G', 'C', 'Y', 'B', 'H', 'P', 'Z'].includes(card.suit) ? card.suit : 'M';
  return {
    suit, name: sanitizeText(card.name, 12), value: Math.max(0, Math.min(9, Math.floor(safeNumber(card.value)))),
    code: sanitizeText(card.code, 8)
  };
}

function normalizeFarkleTurn(turn) {
  if (!turn || typeof turn !== 'object') return null;
  return {
    name: sanitizeText(turn.name, 18) || '玩家', isBot: Boolean(turn.isBot), farkled: Boolean(turn.farkled),
    dice: (Array.isArray(turn.dice) ? turn.dice : []).slice(0, 6).map((die) => Math.max(1, Math.min(6, Math.floor(safeNumber(die, 1))))),
    lostScore: Math.max(0, safeNumber(turn.lostScore)), gained: Math.max(0, safeNumber(turn.gained)), total: Math.max(0, safeNumber(turn.total))
  };
}

function normalizeLoveCard(card) {
  if (!card || typeof card !== 'object') return null;
  if (card.hidden) return { type: '', name: '', color: '#26333a', emoji: '', hidden: true, count: 0 };
  const type = ['S', 'R', 'P', 'L', 'C'].includes(card.type) ? card.type : 'S';
  const defaults = {
    S: ['剪刀', '#3f8ee8', '✂'], R: ['石头', '#e0525b', '✊'], P: ['布', '#e4bd42', '✋'],
    L: ['爱', '#51b878', '🫰'], C: ['骗子', '#e56aa6', '🤞']
  };
  const fallback = defaults[type];
  return {
    type, name: sanitizeText(card.name, 8) || fallback[0], color: /^#[0-9a-f]{6}$/i.test(String(card.color || '')) ? String(card.color) : fallback[1],
    emoji: sanitizeText(card.emoji, 4) || fallback[2], hidden: false, count: Math.max(0, Math.floor(safeNumber(card.count)))
  };
}

function normalizeLovePlayer(player) {
  return {
    name: sanitizeText(player && player.name, 18) || '玩家', chips: Math.max(0, Math.floor(safeNumber(player && player.chips))),
    streetBet: Math.max(0, Math.floor(safeNumber(player && player.streetBet))), committed: Math.max(0, Math.floor(safeNumber(player && player.committed))),
    isBot: Boolean(player && player.isBot), isGuest: Boolean(player && player.isGuest), isTurn: Boolean(player && player.isTurn),
    isStarter: Boolean(player && player.isStarter), folded: Boolean(player && player.folded), revealedIndex: Math.floor(safeNumber(player && player.revealedIndex, -1)),
    declaration: sanitizeText(player && player.declaration, 18), declarationLabel: sanitizeText(player && player.declarationLabel, 12), publicAs: sanitizeText(player && player.publicAs, 8), revealLocked: Boolean(player && player.revealLocked),
    roundsWon: Math.max(0, Math.floor(safeNumber(player && player.roundsWon))), affectionDelta: safeNumber(player && player.affectionDelta),
    coinReward: Math.max(0, Math.floor(safeNumber(player && player.coinReward))),
    cards: (Array.isArray(player && player.cards) ? player.cards : []).slice(0, 3).map(normalizeLoveCard).filter(Boolean)
  };
}

function normalizeLotteryTicket(ticket) {
  if (!ticket || typeof ticket !== 'object') return null;
  return {
    id: sanitizeText(ticket.id, 28), issue: sanitizeText(ticket.issue, 16), cost: Math.max(0, Math.floor(safeNumber(ticket.cost))),
    red: (Array.isArray(ticket.red) ? ticket.red : []).slice(0, 5).map((value) => Math.max(1, Math.min(15, Math.floor(safeNumber(value, 1))))),
    blue: Math.max(0, Math.min(4, Math.floor(safeNumber(ticket.blue)))),
    drawRed: (Array.isArray(ticket.drawRed) ? ticket.drawRed : []).slice(0, 5).map((value) => Math.max(1, Math.min(15, Math.floor(safeNumber(value, 1))))),
    drawBlue: Math.max(0, Math.min(4, Math.floor(safeNumber(ticket.drawBlue)))),
    redMatches: Math.max(0, Math.min(5, Math.floor(safeNumber(ticket.redMatches)))), blueMatch: Boolean(ticket.blueMatch),
    tier: sanitizeText(ticket.tier, 16), prize: Math.max(0, Math.floor(safeNumber(ticket.prize))), status: sanitizeText(ticket.status, 16)
  };
}

function normalizeLotteryDraw(draw) {
  if (!draw || typeof draw !== 'object') return null;
  return {
    issue: sanitizeText(draw.issue, 16), drawnAt: Math.max(0, safeNumber(draw.drawnAt)),
    red: (Array.isArray(draw.red) ? draw.red : []).slice(0, 5).map((value) => Math.max(1, Math.min(15, Math.floor(safeNumber(value, 1))))),
    blue: Math.max(0, Math.min(4, Math.floor(safeNumber(draw.blue))))
  };
}

function normalizeView(input) {
  const rawLines = Array.isArray(input && input.lines) ? input.lines : [];
  const rawMeters = Array.isArray(input && input.meters) ? input.meters : [];
  const rawRankings = Array.isArray(input && input.rankings) ? input.rankings : [];
  const rawModules = Array.isArray(input && input.modules) ? input.modules : [];
  const rawTiles = Array.isArray(input && input.tiles) ? input.tiles : [];
  const rawPoker = input && input.pokerTable && typeof input.pokerTable === 'object' ? input.pokerTable : null;
  const rawBlackjack = input && input.blackjackTable && typeof input.blackjackTable === 'object' ? input.blackjackTable : null;
  const rawTutorial = input && input.tutorial && typeof input.tutorial === 'object' ? input.tutorial : null;
  const rawScratch = input && input.scratchTicket && typeof input.scratchTicket === 'object' ? input.scratchTicket : null;
  const rawLottery = input && input.lotteryScene && typeof input.lotteryScene === 'object' ? input.lotteryScene : null;
  const rawDeathDice = input && input.deathDiceScene && typeof input.deathDiceScene === 'object' ? input.deathDiceScene : null;
  const rawLoan = input && input.loanScene && typeof input.loanScene === 'object' ? input.loanScene : null;
  const rawVideoPoker = input && input.videoPokerScene && typeof input.videoPokerScene === 'object' ? input.videoPokerScene : null;
  const rawDmd = input && input.dmdTable && typeof input.dmdTable === 'object' ? input.dmdTable : null;
  const rawFarkle = input && input.farkleTable && typeof input.farkleTable === 'object' ? input.farkleTable : null;
  const rawLove = input && input.loveTable && typeof input.loveTable === 'object' ? input.loveTable : null;
  const rawFishing = input && input.fishingScene && typeof input.fishingScene === 'object' ? input.fishingScene : null;
  const rawDaily = input && input.dailyScene && typeof input.dailyScene === 'object' ? input.dailyScene : null;
  const rawGift = input && input.giftScene && typeof input.giftScene === 'object' ? input.giftScene : null;
  const rawAuction = input && input.auctionScene && typeof input.auctionScene === 'object' ? input.auctionScene : null;
  return {
    kind: sanitizeText(input && input.kind, 32) || 'profile',
    title: sanitizeText(input && input.title, 80) || '骰娘好感度',
    subtitle: sanitizeText(input && input.subtitle, 160),
    quote: sanitizeText(input && input.quote, 300),
    lines: rawLines.slice(0, 24).map((line) => {
      if (line && typeof line === 'object') return `${sanitizeText(line.label, 80)}：${sanitizeText(line.value, 180)}`;
      return sanitizeText(line, 240);
    }),
    meters: rawMeters.slice(0, 8).map((meter) => ({
      label: sanitizeText(meter && meter.label, 40),
      text: sanitizeText(meter && meter.text, 60),
      value: safeNumber(meter && meter.value),
      min: safeNumber(meter && meter.min),
      max: safeNumber(meter && meter.max, 1)
    })),
    rankings: rawRankings.slice(0, 10).map((row, index) => ({
      rank: Math.max(1, Math.floor(safeNumber(row && row.rank, index + 1))),
      name: sanitizeText(row && row.name, 24) || '玩家',
      primary: sanitizeText(row && row.primary, 48),
      secondary: sanitizeText(row && row.secondary, 80),
      ratio: Math.max(0, Math.min(1, safeNumber(row && row.ratio))),
      details: (Array.isArray(row && row.details) ? row.details : []).slice(0, 5).map((detail) => ({
        label: sanitizeText(detail && detail.label, 12), value: sanitizeText(detail && detail.value, 16),
        tone: normalizeTone(detail && detail.tone)
      }))
    })),
    modules: rawModules.slice(0, 8).map((module) => ({
      key: sanitizeText(module && module.key, 20), name: sanitizeText(module && module.name, 30),
      plays: safeNumber(module && module.plays), wins: safeNumber(module && module.wins),
      losses: safeNumber(module && module.losses), draws: safeNumber(module && module.draws),
      best: safeNumber(module && module.best), profit: safeNumber(module && module.profit),
      affection: safeNumber(module && module.affection), affectionGained: safeNumber(module && module.affectionGained),
      affectionLost: safeNumber(module && module.affectionLost), grandSlams: safeNumber(module && module.grandSlams),
      bestPokerHand: sanitizeText(module && module.bestPokerHand, 20)
    })),
    tiles: rawTiles.slice(0, 15).map((tile) => ({
      label: sanitizeText(tile && tile.label, 30), value: sanitizeText(tile && tile.value, 40),
      tone: normalizeTone(tile && tile.tone)
    })),
    pokerTable: rawPoker ? {
      status: ['waiting', 'playing', 'between_hands', 'finished'].includes(rawPoker.status) ? rawPoker.status : 'playing',
      handNo: Math.max(0, Math.floor(safeNumber(rawPoker.handNo))),
      stage: sanitizeText(rawPoker.stage, 32), pot: Math.max(0, safeNumber(rawPoker.pot)), currentBet: Math.max(0, safeNumber(rawPoker.currentBet)),
      board: (Array.isArray(rawPoker.board) ? rawPoker.board : []).slice(0, 5).map(normalizePlayingCard),
      seats: (Array.isArray(rawPoker.seats) ? rawPoker.seats : []).slice(0, 6).map((seat) => ({
        name: sanitizeText(seat && seat.name, 18) || '玩家', stack: Math.max(0, safeNumber(seat && seat.stack)),
        roundBet: Math.max(0, safeNumber(seat && seat.roundBet)), totalBet: Math.max(0, safeNumber(seat && seat.totalBet)),
        status: sanitizeText(seat && seat.status, 18), isTurn: Boolean(seat && seat.isTurn),
        isDealer: Boolean(seat && seat.isDealer), isBot: Boolean(seat && seat.isBot), isGuest: Boolean(seat && seat.isGuest),
        cards: (Array.isArray(seat && seat.cards) ? seat.cards : []).slice(0, 2).map(normalizePlayingCard).filter(Boolean)
      })),
      lastAction: sanitizeText(rawPoker.lastAction, 160), nextAction: sanitizeText(rawPoker.nextAction, 180)
    } : null,
    blackjackTable: rawBlackjack ? {
      round: Math.max(1, Math.floor(safeNumber(rawBlackjack.round, 1))), target: Math.max(1, Math.floor(safeNumber(rawBlackjack.target, 21))),
      turn: rawBlackjack.turn === 'enemy' ? 'enemy' : 'player', phase: rawBlackjack.phase === 'round_result' ? 'round_result' : 'playing',
      player: normalizeBlackjackActor(rawBlackjack.player, false), enemy: normalizeBlackjackActor(rawBlackjack.enemy, true),
      buffs: (Array.isArray(rawBlackjack.buffs) ? rawBlackjack.buffs : []).slice(0, 16).map((buff) => ({
        name: sanitizeText(buff && buff.name, 20), side: buff && buff.side === 'enemy' ? 'enemy' : 'player'
      })),
      roundResult: rawBlackjack.roundResult && typeof rawBlackjack.roundResult === 'object' ? {
        playerSum: Math.max(0, Math.floor(safeNumber(rawBlackjack.roundResult.playerSum))),
        enemySum: Math.max(0, Math.floor(safeNumber(rawBlackjack.roundResult.enemySum))),
        tie: Boolean(rawBlackjack.roundResult.tie), winnerName: sanitizeText(rawBlackjack.roundResult.winnerName, 24),
        loserName: sanitizeText(rawBlackjack.roundResult.loserName, 24), damage: Math.max(0, Math.floor(safeNumber(rawBlackjack.roundResult.damage))),
        nextStarter: rawBlackjack.roundResult.nextStarter === 'enemy' ? 'enemy' : 'player',
        nextStarterName: sanitizeText(rawBlackjack.roundResult.nextStarterName, 24),
        matchFinished: Boolean(rawBlackjack.roundResult.matchFinished)
      } : null,
      recentActions: (Array.isArray(rawBlackjack.recentActions) ? rawBlackjack.recentActions : []).slice(-2).map((line) => sanitizeText(line, 180)),
      lastAction: sanitizeText(rawBlackjack.lastAction, 180)
    } : null,
    tutorial: rawTutorial ? {
      page: Math.max(1, Math.floor(safeNumber(rawTutorial.page, 1))), total: Math.max(1, Math.floor(safeNumber(rawTutorial.total, 1))),
      entries: (Array.isArray(rawTutorial.entries) ? rawTutorial.entries : []).slice(0, 10).map((entry) => ({
        title: sanitizeText(entry && entry.title, 30), description: sanitizeText(entry && entry.description, 180), tag: sanitizeText(entry && entry.tag, 24)
      }))
    } : null,
    scratchTicket: rawScratch ? {
      denom: Math.max(1, Math.floor(safeNumber(rawScratch.denom, 10))), type: sanitizeText(rawScratch.type, 24),
      revealed: Boolean(rawScratch.revealed), maxPrize: Math.max(0, Math.floor(safeNumber(rawScratch.maxPrize))),
      prize: Math.max(0, Math.floor(safeNumber(rawScratch.prize))), multiplier: Math.max(0, safeNumber(rawScratch.multiplier)), affectionDelta: safeNumber(rawScratch.affectionDelta),
      lucky: rawScratch.lucky == null ? null : sanitizeText(rawScratch.lucky, 12), serial: sanitizeText(rawScratch.serial, 20),
      cells: (Array.isArray(rawScratch.cells) ? rawScratch.cells : []).slice(0, 9).map((cell) => ({
        symbol: sanitizeText(cell && cell.symbol, 24), value: Math.max(0, safeNumber(cell && cell.value)), winning: Boolean(cell && cell.winning)
      }))
    } : null,
    lotteryScene: rawLottery ? {
      mode: ['menu', 'ticket', 'status', 'result', 'history'].includes(rawLottery.mode) ? rawLottery.mode : 'menu',
      issue: sanitizeText(rawLottery.issue, 16), price: Math.max(0, Math.floor(safeNumber(rawLottery.price))),
      drawAt: Math.max(0, safeNumber(rawLottery.drawAt)), expiresAt: Math.max(0, safeNumber(rawLottery.expiresAt)), status: sanitizeText(rawLottery.status, 160),
      selectedRed: (Array.isArray(rawLottery.selectedRed) ? rawLottery.selectedRed : []).slice(0, 5).map((value) => Math.max(1, Math.min(15, Math.floor(safeNumber(value, 1))))),
      selectedBlue: Math.max(0, Math.min(4, Math.floor(safeNumber(rawLottery.selectedBlue)))),
      drawnRed: (Array.isArray(rawLottery.drawnRed) ? rawLottery.drawnRed : []).slice(0, 5).map((value) => Math.max(1, Math.min(15, Math.floor(safeNumber(value, 1))))),
      drawnBlue: Math.max(0, Math.min(4, Math.floor(safeNumber(rawLottery.drawnBlue)))),
      redMatches: Math.max(0, Math.min(5, Math.floor(safeNumber(rawLottery.redMatches)))), blueMatch: Boolean(rawLottery.blueMatch),
      tier: sanitizeText(rawLottery.tier, 16), prize: Math.max(0, Math.floor(safeNumber(rawLottery.prize))), totalPrize: Math.max(0, Math.floor(safeNumber(rawLottery.totalPrize))),
      tickets: (Array.isArray(rawLottery.tickets) ? rawLottery.tickets : []).slice(0, 8).map(normalizeLotteryTicket).filter(Boolean),
      history: (Array.isArray(rawLottery.history) ? rawLottery.history : []).slice(0, 8).map(normalizeLotteryTicket).filter(Boolean),
      draws: (Array.isArray(rawLottery.draws) ? rawLottery.draws : []).slice(0, 8).map(normalizeLotteryDraw).filter(Boolean),
      prizeTable: (Array.isArray(rawLottery.prizeTable) ? rawLottery.prizeTable : []).slice(0, 10).map((row) => ({
        label: sanitizeText(row && row.label, 20), tier: sanitizeText(row && row.tier, 16), prize: Math.max(0, Math.floor(safeNumber(row && row.prize)))
      }))
    } : null,
    deathDiceScene: rawDeathDice ? {
      mode: rawDeathDice.mode === 'result' ? 'result' : 'menu', difficulty: rawDeathDice.difficulty === '困难' ? '困难' : '简单',
      stake: Math.max(0, Math.floor(safeNumber(rawDeathDice.stake))), multiplier: Math.max(0, safeNumber(rawDeathDice.multiplier)),
      roll: Math.max(0, Math.min(6, Math.floor(safeNumber(rawDeathDice.roll)))), survived: Boolean(rawDeathDice.survived),
      payout: Math.max(0, Math.floor(safeNumber(rawDeathDice.payout))), balance: Math.max(0, Math.floor(safeNumber(rawDeathDice.balance))),
      faces: (Array.isArray(rawDeathDice.faces) ? rawDeathDice.faces : []).slice(0, 6).map((face) => sanitizeText(face, 8)),
      loanRepaid: Math.max(0, Math.floor(safeNumber(rawDeathDice.loanRepaid))), affectionRestored: Math.max(0, Math.floor(safeNumber(rawDeathDice.affectionRestored)))
    } : null,
    loanScene: rawLoan ? {
      mode: ['status', 'borrowed', 'ineligible', 'repaid'].includes(rawLoan.mode) ? rawLoan.mode : 'status',
      balance: Math.max(0, Math.floor(safeNumber(rawLoan.balance))), affection: Math.floor(safeNumber(rawLoan.affection)), eligible: Boolean(rawLoan.eligible),
      outstanding: Math.max(0, Math.floor(safeNumber(rawLoan.outstanding))), debt: Math.max(0, Math.floor(safeNumber(rawLoan.debt))),
      threshold: Math.max(0, Math.floor(safeNumber(rawLoan.threshold))), nextPenalty: Math.max(0, Math.floor(safeNumber(rawLoan.nextPenalty))),
      borrowed: Math.max(0, Math.floor(safeNumber(rawLoan.borrowed))), affectionDelta: Math.floor(safeNumber(rawLoan.affectionDelta)),
      repaid: Math.max(0, Math.floor(safeNumber(rawLoan.repaid))), restored: Math.max(0, Math.floor(safeNumber(rawLoan.restored))),
      totalBorrowed: Math.max(0, Math.floor(safeNumber(rawLoan.totalBorrowed))), totalRepaid: Math.max(0, Math.floor(safeNumber(rawLoan.totalRepaid))),
      totalAffectionLost: Math.max(0, Math.floor(safeNumber(rawLoan.totalAffectionLost))), totalAffectionRestored: Math.max(0, Math.floor(safeNumber(rawLoan.totalAffectionRestored))),
      lastSettlement: rawLoan.lastSettlement && typeof rawLoan.lastSettlement === 'object' ? {
        at: Math.max(0, safeNumber(rawLoan.lastSettlement.at)), count: Math.max(0, Math.floor(safeNumber(rawLoan.lastSettlement.count))),
        repaid: Math.max(0, Math.floor(safeNumber(rawLoan.lastSettlement.repaid))), restored: Math.max(0, Math.floor(safeNumber(rawLoan.lastSettlement.restored))),
        balance: Math.max(0, Math.floor(safeNumber(rawLoan.lastSettlement.balance)))
      } : null
    } : null,
    videoPokerScene: rawVideoPoker ? {
      mode: ['menu', 'deal', 'result', 'gamble', 'revive', 'stats'].includes(rawVideoPoker.mode) ? rawVideoPoker.mode : 'menu',
      variant: sanitizeText(rawVideoPoker.variant, 24), stake: [10, 30, 50].includes(Math.floor(safeNumber(rawVideoPoker.stake))) ? Math.floor(safeNumber(rawVideoPoker.stake)) : 10,
      phase: sanitizeText(rawVideoPoker.phase, 20),
      paytable: (Array.isArray(rawVideoPoker.paytable) ? rawVideoPoker.paytable : []).slice(0, 10).map((row) => ({
        label: sanitizeText(row && row.label, 24), multiplier: Math.max(0, safeNumber(row && row.multiplier))
      })),
      initialHand: (Array.isArray(rawVideoPoker.initialHand) ? rawVideoPoker.initialHand : []).slice(0, 5).map(normalizePlayingCard).filter(Boolean),
      hand: (Array.isArray(rawVideoPoker.hand) ? rawVideoPoker.hand : []).slice(0, 5).map(normalizePlayingCard).filter(Boolean),
      hands: (Array.isArray(rawVideoPoker.hands) ? rawVideoPoker.hands : []).slice(0, 5).map((hand) => (Array.isArray(hand) ? hand : []).slice(0, 5).map(normalizePlayingCard).filter(Boolean)),
      held: (Array.isArray(rawVideoPoker.held) ? rawVideoPoker.held : []).slice(0, 5).map(Boolean),
      handNames: (Array.isArray(rawVideoPoker.handNames) ? rawVideoPoker.handNames : []).slice(0, 5).map((name) => sanitizeText(name, 24)),
      handPayouts: (Array.isArray(rawVideoPoker.handPayouts) ? rawVideoPoker.handPayouts : []).slice(0, 5).map((value) => Math.max(0, safeNumber(value))),
      totalPayout: Math.max(0, safeNumber(rawVideoPoker.totalPayout)), pendingPrize: Math.max(0, safeNumber(rawVideoPoker.pendingPrize)),
      finalPayout: Math.max(0, Math.floor(safeNumber(rawVideoPoker.finalPayout))), jackpot: Math.max(0, safeNumber(rawVideoPoker.jackpot)),
      jackpotAward: Math.max(0, Math.floor(safeNumber(rawVideoPoker.jackpotAward))),
      anchorCard: normalizePlayingCard(rawVideoPoker.anchorCard), previousCard: normalizePlayingCard(rawVideoPoker.previousCard), drawnCard: normalizePlayingCard(rawVideoPoker.drawnCard),
      guess: sanitizeText(rawVideoPoker.guess, 12), correct: rawVideoPoker.correct == null ? null : Boolean(rawVideoPoker.correct),
      streak: Math.max(0, Math.min(13, Math.floor(safeNumber(rawVideoPoker.streak)))), reviveCost: Math.max(0, safeNumber(rawVideoPoker.reviveCost)),
      balance: Math.max(0, Math.floor(safeNumber(rawVideoPoker.balance))),
      help: (Array.isArray(rawVideoPoker.help) ? rawVideoPoker.help : []).slice(0, 5).map((line) => sanitizeText(line, 90)),
      stats: rawVideoPoker.stats && typeof rawVideoPoker.stats === 'object' ? {
        plays: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.plays))), hands: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.hands))),
        handsWon: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.handsWon))), wagered: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.wagered))),
        won: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.won))), profit: Math.floor(safeNumber(rawVideoPoker.stats.profit)),
        bestPayout: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.bestPayout))), bestHand: sanitizeText(rawVideoPoker.stats.bestHand, 28),
        highLowWins: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.highLowWins))), bestStreak: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.bestStreak))),
        revives: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.revives))), jackpots: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.jackpots))),
        jackpotWon: Math.max(0, Math.floor(safeNumber(rawVideoPoker.stats.jackpotWon)))
      } : null
    } : null,
    dmdTable: rawDmd ? {
      status: ['menu', 'waiting', 'playing', 'finished'].includes(rawDmd.status) ? rawDmd.status : 'playing',
      deckCount: Math.max(0, Math.floor(safeNumber(rawDmd.deckCount))), discardCount: Math.max(0, Math.floor(safeNumber(rawDmd.discardCount))),
      forcedDraws: Math.max(0, Math.floor(safeNumber(rawDmd.forcedDraws))), currentName: sanitizeText(rawDmd.currentName, 18),
      board: (Array.isArray(rawDmd.board) ? rawDmd.board : []).slice(0, 10).map(normalizeDmdCard).filter(Boolean),
      lastAction: sanitizeText(rawDmd.lastAction, 180),
      pending: rawDmd.pending && typeof rawDmd.pending === 'object' ? {
        type: sanitizeText(rawDmd.pending.type, 4), name: sanitizeText(rawDmd.pending.name, 16), mandatory: Boolean(rawDmd.pending.mandatory),
        options: (Array.isArray(rawDmd.pending.options) ? rawDmd.pending.options : []).slice(0, 20).map((option, index) => ({
          index: Math.max(1, Math.floor(safeNumber(option && option.index, index + 1))), playerName: sanitizeText(option && option.playerName, 14),
          ...normalizeDmdCard(option)
        }))
      } : null,
      players: (Array.isArray(rawDmd.players) ? rawDmd.players : []).slice(0, 6).map((player) => ({
        name: sanitizeText(player && player.name, 18) || '玩家', score: Math.max(0, safeNumber(player && player.score)),
        collectedTypes: Math.max(0, Math.min(10, Math.floor(safeNumber(player && player.collectedTypes)))),
        grandSlams: Math.max(0, Math.floor(safeNumber(player && player.grandSlams))), isTurn: Boolean(player && player.isTurn),
        isBot: Boolean(player && player.isBot), isGuest: Boolean(player && player.isGuest), status: sanitizeText(player && player.status, 30), rank: Math.max(0, Math.floor(safeNumber(player && player.rank))),
        affectionDelta: safeNumber(player && player.affectionDelta), coinReward: Math.max(0, safeNumber(player && player.coinReward)),
        collection: (Array.isArray(player && player.collection) ? player.collection : []).slice(0, 10).map((item) => ({
          ...normalizeDmdCard(item), count: Math.max(0, Math.floor(safeNumber(item && item.count)))
        }))
      })),
      help: (Array.isArray(rawDmd.help) ? rawDmd.help : []).slice(0, 6).map((line) => sanitizeText(line, 90))
    } : null,
    farkleTable: rawFarkle ? {
      status: ['menu', 'waiting', 'playing', 'finished'].includes(rawFarkle.status) ? rawFarkle.status : 'playing',
      phase: ['turn', 'rolled', 'kept'].includes(rawFarkle.phase) ? rawFarkle.phase : 'turn',
      phaseLabel: sanitizeText(rawFarkle.phaseLabel, 32), target: Math.max(1, safeNumber(rawFarkle.target, 5000)),
      currentName: sanitizeText(rawFarkle.currentName, 18), remaining: Math.max(0, Math.min(6, Math.floor(safeNumber(rawFarkle.remaining, 6)))),
      dice: (Array.isArray(rawFarkle.dice) ? rawFarkle.dice : []).slice(0, 6).map((die) => Math.max(1, Math.min(6, Math.floor(safeNumber(die, 1))))),
      diceReview: Boolean(rawFarkle.diceReview), reviewTurn: normalizeFarkleTurn(rawFarkle.reviewTurn), lastBotTurn: normalizeFarkleTurn(rawFarkle.lastBotTurn),
      suggestedScore: Math.max(0, safeNumber(rawFarkle.suggestedScore)), lastAction: sanitizeText(rawFarkle.lastAction, 180),
      players: (Array.isArray(rawFarkle.players) ? rawFarkle.players : []).slice(0, 6).map((player) => ({
        name: sanitizeText(player && player.name, 18) || '玩家', score: Math.max(0, safeNumber(player && player.score)),
        turnScore: Math.max(0, safeNumber(player && player.turnScore)), bestTurn: Math.max(0, safeNumber(player && player.bestTurn)),
        isTurn: Boolean(player && player.isTurn), isBot: Boolean(player && player.isBot), isGuest: Boolean(player && player.isGuest), status: sanitizeText(player && player.status, 30),
        rank: Math.max(0, Math.floor(safeNumber(player && player.rank))), affectionDelta: safeNumber(player && player.affectionDelta),
        coinReward: Math.max(0, safeNumber(player && player.coinReward))
      })),
      help: (Array.isArray(rawFarkle.help) ? rawFarkle.help : []).slice(0, 6).map((line) => sanitizeText(line, 80))
    } : null,
    loveTable: rawLove ? {
      status: ['menu', 'waiting', 'playing', 'finished'].includes(rawLove.status) ? rawLove.status : 'playing',
      phase: ['menu', 'waiting', 'bet1', 'reveal', 'reveal_confirm', 'bet2', 'round_result', 'finished'].includes(rawLove.phase) ? rawLove.phase : 'waiting',
      phaseLabel: sanitizeText(rawLove.phaseLabel, 40), round: Math.max(0, Math.floor(safeNumber(rawLove.round))),
      cycleRound: Math.max(0, Math.floor(safeNumber(rawLove.cycleRound))), shuffleCount: Math.max(0, Math.floor(safeNumber(rawLove.shuffleCount))),
      maxRounds: Math.max(1, Math.floor(safeNumber(rawLove.maxRounds, 7))), deckCount: Math.max(0, Math.floor(safeNumber(rawLove.deckCount))),
      discardCount: Math.max(0, Math.floor(safeNumber(rawLove.discardCount))), pot: Math.max(0, Math.floor(safeNumber(rawLove.pot))),
      carryPot: Math.max(0, Math.floor(safeNumber(rawLove.carryPot))), currentBet: Math.max(0, Math.floor(safeNumber(rawLove.currentBet))),
      currentName: sanitizeText(rawLove.currentName, 18), common: normalizeLoveCard(rawLove.common),
      cards: (Array.isArray(rawLove.cards) ? rawLove.cards : []).slice(0, 5).map(normalizeLoveCard).filter(Boolean),
      players: (Array.isArray(rawLove.players) ? rawLove.players : []).slice(0, 2).map(normalizeLovePlayer),
      result: rawLove.result && typeof rawLove.result === 'object' ? {
        round: Math.max(0, Math.floor(safeNumber(rawLove.result.round))), winnerIndex: Math.floor(safeNumber(rawLove.result.winnerIndex, -1)),
        winnerName: sanitizeText(rawLove.result.winnerName, 18), tie: Boolean(rawLove.result.tie), pot: Math.max(0, Math.floor(safeNumber(rawLove.result.pot))),
        penalty: Math.max(0, Math.floor(safeNumber(rawLove.result.penalty))), cheatTieLoss: Boolean(rawLove.result.cheatTieLoss), allInShowdown: Boolean(rawLove.result.allInShowdown), reason: sanitizeText(rawLove.result.reason, 120),
        evaluations: (Array.isArray(rawLove.result.evaluations) ? rawLove.result.evaluations : []).slice(0, 2).map((evaluation) => evaluation && typeof evaluation === 'object' ? {
          key: sanitizeText(evaluation.key, 16), name: sanitizeText(evaluation.name, 18), rank: Math.max(0, Math.floor(safeNumber(evaluation.rank)))
        } : null)
      } : null,
      ranking: (Array.isArray(rawLove.ranking) ? rawLove.ranking : []).slice(0, 2).map((row, index) => ({
        rank: Math.max(1, Math.floor(safeNumber(row && row.rank, index + 1))), name: sanitizeText(row && row.name, 18), chips: Math.max(0, Math.floor(safeNumber(row && row.chips))),
        roundsWon: Math.max(0, Math.floor(safeNumber(row && row.roundsWon))), guest: Boolean(row && row.guest),
        affectionDelta: safeNumber(row && row.affectionDelta), coinReward: Math.max(0, Math.floor(safeNumber(row && row.coinReward)))
      })),
      help: (Array.isArray(rawLove.help) ? rawLove.help : []).slice(0, 5).map((line) => sanitizeText(line, 100))
    } : null,
    fishingScene: rawFishing ? {
      status: ['menu', 'playing', 'banked', 'lost'].includes(rawFishing.status) ? rawFishing.status : 'playing',
      outcome: sanitizeText(rawFishing.outcome, 16), name: sanitizeText(rawFishing.name, 18), pond: sanitizeText(rawFishing.pond, 18),
      cost: Math.max(0, safeNumber(rawFishing.cost)), stage: Math.max(0, Math.floor(safeNumber(rawFishing.stage))),
      maxStage: Math.max(1, Math.floor(safeNumber(rawFishing.maxStage, 5))), risk: Math.max(0, Math.min(100, safeNumber(rawFishing.risk))),
      value: Math.max(0, safeNumber(rawFishing.value)), reward: Math.max(0, safeNumber(rawFishing.reward)),
      affectionDelta: safeNumber(rawFishing.affectionDelta), event: sanitizeText(rawFishing.event, 180),
      lostValue: Math.max(0, safeNumber(rawFishing.lostValue)), lostCount: Math.max(0, Math.floor(safeNumber(rawFishing.lostCount))),
      haul: (Array.isArray(rawFishing.haul) ? rawFishing.haul : []).slice(0, 5).map((fish) => ({
        name: sanitizeText(fish && fish.name, 24), rarity: Math.max(0, Math.min(3, Math.floor(safeNumber(fish && fish.rarity)))),
        rarityName: sanitizeText(fish && fish.rarityName, 12), size: Math.max(0, safeNumber(fish && fish.size)), value: Math.max(0, safeNumber(fish && fish.value))
      })),
      pondOptions: (Array.isArray(rawFishing.pondOptions) ? rawFishing.pondOptions : []).slice(0, 3).map((option) => ({
        name: sanitizeText(option && option.name, 18), cost: Math.max(0, safeNumber(option && option.cost)),
        risk: Math.max(0, Math.min(100, safeNumber(option && option.risk))), maxValue: Math.max(0, safeNumber(option && option.maxValue)),
        speciesCount: Math.max(0, Math.floor(safeNumber(option && option.speciesCount))),
        fish: (Array.isArray(option && option.fish) ? option.fish : []).slice(0, 4).map((name) => sanitizeText(name, 20))
      }))
    } : null,
    dailyScene: rawDaily ? {
      status: rawDaily.status === 'already' ? 'already' : 'claimed', name: sanitizeText(rawDaily.name, 18) || '玩家',
      date: sanitizeText(rawDaily.date, 16), coinsReward: Math.max(0, safeNumber(rawDaily.coinsReward)),
      affectionReward: safeNumber(rawDaily.affectionReward), coins: Math.max(0, safeNumber(rawDaily.coins)),
      affection: safeNumber(rawDaily.affection), relation: sanitizeText(rawDaily.relation, 16),
      relationProgress: Math.max(0, Math.min(1, safeNumber(rawDaily.relationProgress)))
    } : null,
    giftScene: rawGift ? {
      mode: ['menu', 'result', 'insufficient'].includes(rawGift.mode) ? rawGift.mode : 'menu',
      name: sanitizeText(rawGift.name, 18) || '玩家', item: sanitizeText(rawGift.item, 24),
      category: sanitizeText(rawGift.category, 16), cost: Math.max(0, safeNumber(rawGift.cost)),
      affectionGain: safeNumber(rawGift.affectionGain), coins: Math.max(0, safeNumber(rawGift.coins)),
      affection: safeNumber(rawGift.affection), relation: sanitizeText(rawGift.relation, 16),
      relationProgress: Math.max(0, Math.min(1, safeNumber(rawGift.relationProgress))),
      gifts: (Array.isArray(rawGift.gifts) ? rawGift.gifts : []).slice(0, 40).map((gift) => ({
        name: sanitizeText(gift && gift.name, 24), category: sanitizeText(gift && gift.category, 16),
        cost: Math.max(0, safeNumber(gift && gift.cost)), affection: safeNumber(gift && gift.affection)
      }))
    } : null,
    auctionScene: rawAuction ? {
      mode: ['assistant', 'menu', 'waiting', 'bidding', 'result', 'collection'].includes(rawAuction.mode) ? rawAuction.mode : 'menu',
      round: Math.max(0, Math.floor(safeNumber(rawAuction.round))), maxRounds: Math.max(1, Math.floor(safeNumber(rawAuction.maxRounds, 5))),
      auctionRate: Math.max(1, Math.floor(safeNumber(rawAuction.auctionRate, 10000))),
      autoConfirm: Boolean(rawAuction.autoConfirm),
      assistant: rawAuction.assistant && typeof rawAuction.assistant === 'object' ? {
        name: sanitizeText(rawAuction.assistant.name, 18), skill: sanitizeText(rawAuction.assistant.skill, 24),
        description: sanitizeText(rawAuction.assistant.description, 120), used: Boolean(rawAuction.assistant.used),
        kind: ['reveal', 'valuation', 'statistics', 'hybrid'].includes(rawAuction.assistant.kind) ? rawAuction.assistant.kind : 'reveal',
        typeLabel: sanitizeText(rawAuction.assistant.typeLabel, 18), triggerLabel: sanitizeText(rawAuction.assistant.triggerLabel, 28),
        color: /^#[0-9a-f]{6}$/i.test(String(rawAuction.assistant.color || '')) ? String(rawAuction.assistant.color) : '#f0c84b'
      } : null,
      assistants: (Array.isArray(rawAuction.assistants) ? rawAuction.assistants : []).slice(0, 12).map((assistant) => ({
        name: sanitizeText(assistant && assistant.name, 18), skill: sanitizeText(assistant && assistant.skill, 24),
        description: sanitizeText(assistant && assistant.description, 120),
        kind: ['reveal', 'valuation', 'statistics', 'hybrid'].includes(assistant && assistant.kind) ? assistant.kind : 'reveal',
        typeLabel: sanitizeText(assistant && assistant.typeLabel, 18), triggerLabel: sanitizeText(assistant && assistant.triggerLabel, 28),
        color: /^#[0-9a-f]{6}$/i.test(String(assistant && assistant.color || '')) ? String(assistant.color) : '#f0c84b'
      })),
      assistantReport: rawAuction.assistantReport && typeof rawAuction.assistantReport === 'object' ? {
        kind: ['reveal', 'valuation', 'statistics', 'hybrid'].includes(rawAuction.assistantReport.kind) ? rawAuction.assistantReport.kind : 'reveal',
        typeLabel: sanitizeText(rawAuction.assistantReport.typeLabel, 18), triggerLabel: sanitizeText(rawAuction.assistantReport.triggerLabel, 28),
        round: Math.max(0, Math.floor(safeNumber(rawAuction.assistantReport.round))), summary: sanitizeText(rawAuction.assistantReport.summary, 180),
        stats: (Array.isArray(rawAuction.assistantReport.stats) ? rawAuction.assistantReport.stats : []).slice(0, 4).map((stat) => ({
          label: sanitizeText(stat && stat.label, 16), value: sanitizeText(stat && stat.value, 20),
          tone: ['positive', 'negative', 'warning', 'accent', 'neutral'].includes(stat && stat.tone) ? stat.tone : 'neutral'
        })),
        valuation: rawAuction.assistantReport.valuation && typeof rawAuction.assistantReport.valuation === 'object' ? {
          label: sanitizeText(rawAuction.assistantReport.valuation.label, 28), low: Math.max(0, safeNumber(rawAuction.assistantReport.valuation.low)),
          high: Math.max(0, safeNumber(rawAuction.assistantReport.valuation.high)), confidence: sanitizeText(rawAuction.assistantReport.valuation.confidence, 16)
        } : null
      } : null,
      venues: (Array.isArray(rawAuction.venues) ? rawAuction.venues : []).slice(0, 8).map((venue) => ({
        name: sanitizeText(venue && venue.name, 20), tagline: sanitizeText(venue && venue.tagline, 60),
        minItems: Math.max(0, Math.floor(safeNumber(venue && venue.minItems))), maxItems: Math.max(0, Math.floor(safeNumber(venue && venue.maxItems)))
      })),
      selectedVenue: sanitizeText(rawAuction.selectedVenue, 20) || '新手仓',
      container: rawAuction.container && typeof rawAuction.container === 'object' ? {
        code: sanitizeText(rawAuction.container.code, 28), theme: sanitizeText(rawAuction.container.theme, 28), venue: sanitizeText(rawAuction.container.venue, 20),
        clue: sanitizeText(rawAuction.container.clue, 140), silhouette: sanitizeText(rawAuction.container.silhouette, 140),
        seal: sanitizeText(rawAuction.container.seal, 60), gridWidth: Math.max(1, Math.min(12, Math.floor(safeNumber(rawAuction.container.gridWidth, 10)))),
        gridHeight: Math.max(1, Math.min(10, Math.floor(safeNumber(rawAuction.container.gridHeight, 7))))
      } : null,
      ownBid: Math.max(0, safeNumber(rawAuction.ownBid)), budget: Math.max(0, safeNumber(rawAuction.budget)), minimumEstimate: Math.max(0, safeNumber(rawAuction.minimumEstimate)), intel: sanitizeText(rawAuction.intel, 180),
      publicIntel: sanitizeText(rawAuction.publicIntel, 180), exploredCount: Math.max(0, Math.floor(safeNumber(rawAuction.exploredCount))),
      totalCells: Math.max(0, Math.floor(safeNumber(rawAuction.totalCells))), personalExploreUsed: Boolean(rawAuction.personalExploreUsed),
      playerBand: sanitizeText(rawAuction.playerBand, 20), marketHeat: sanitizeText(rawAuction.marketHeat, 20), spread: sanitizeText(rawAuction.spread, 24),
      submittedCount: Math.max(0, Math.floor(safeNumber(rawAuction.submittedCount))), activeCount: Math.max(0, Math.floor(safeNumber(rawAuction.activeCount))),
      players: (Array.isArray(rawAuction.players) ? rawAuction.players : []).slice(0, 8).map((player) => ({
        name: sanitizeText(player && player.name, 20), isBot: Boolean(player && player.isBot), isGuest: Boolean(player && player.isGuest),
        active: Boolean(player && player.active), submitted: Boolean(player && player.submitted), confirmed: Boolean(player && player.confirmed),
        status: sanitizeText(player && player.status, 28), rank: Math.max(0, Math.floor(safeNumber(player && player.rank))),
        rankRound: Math.max(0, Math.floor(safeNumber(player && player.rankRound))),
        rankHistory: (Array.isArray(player && player.rankHistory) ? player.rankHistory : []).slice(0, 5).map((rank) => Math.max(0, Math.floor(safeNumber(rank)))),
        isViewer: Boolean(player && player.isViewer), ownBid: Math.max(0, safeNumber(player && player.ownBid))
      })),
      tools: (Array.isArray(rawAuction.tools) ? rawAuction.tools : []).slice(0, 6).map((tool) => ({
        name: sanitizeText(tool && tool.name, 20), description: sanitizeText(tool && tool.description, 90)
      })),
      feedback: (Array.isArray(rawAuction.feedback) ? rawAuction.feedback : []).slice(0, 6).map((line) => sanitizeText(line, 180)),
      sold: Boolean(rawAuction.sold), winnerName: sanitizeText(rawAuction.winnerName, 20), winningBid: Math.max(0, safeNumber(rawAuction.winningBid)),
      saleValue: Math.max(0, safeNumber(rawAuction.saleValue)), profit: safeNumber(rawAuction.profit), coinDelta: safeNumber(rawAuction.coinDelta),
      affectionDelta: safeNumber(rawAuction.affectionDelta),
      cells: (Array.isArray(rawAuction.cells) ? rawAuction.cells : []).slice(0, 120).map((cell) => ({
        x: Math.max(0, Math.min(11, Math.floor(safeNumber(cell && cell.x)))), y: Math.max(0, Math.min(9, Math.floor(safeNumber(cell && cell.y)))),
        label: sanitizeText(cell && cell.label, 4), revealed: Boolean(cell && cell.revealed), public: Boolean(cell && cell.public),
        personal: Boolean(cell && cell.personal), occupied: Boolean(cell && cell.occupied),
        rarity: Math.max(-1, Math.min(4, Math.floor(safeNumber(cell && cell.rarity, -1)))), rarityName: sanitizeText(cell && cell.rarityName, 12)
      })),
      items: (Array.isArray(rawAuction.items) ? rawAuction.items : []).slice(0, 28).map((item) => ({
        id: sanitizeText(item && item.id, 16), slot: Math.max(0, Math.floor(safeNumber(item && item.slot))), name: sanitizeText(item && item.name, 24), category: sanitizeText(item && item.category, 18),
        rarity: Math.max(-1, Math.min(4, Math.floor(safeNumber(item && item.rarity, -1)))), rarityName: sanitizeText(item && item.rarityName, 12),
        condition: sanitizeText(item && item.condition, 18), value: Math.max(0, safeNumber(item && (item.value == null ? item.bestValue : item.value))),
        width: Math.max(1, Math.min(4, Math.floor(safeNumber(item && item.width, 1)))), height: Math.max(1, Math.min(3, Math.floor(safeNumber(item && item.height, 1)))), sizeLabel: sanitizeText(item && item.sizeLabel, 8),
        authenticity: sanitizeText(item && item.authenticity, 18), count: Math.max(0, Math.floor(safeNumber(item && item.count))), repaired: Boolean(item && item.repaired),
        shapeKnown: Boolean(item && item.shapeKnown), rarityKnown: Boolean(item && item.rarityKnown), categoryKnown: Boolean(item && item.categoryKnown), fullyRevealed: Boolean(item && item.fullyRevealed),
        conditionKnown: Boolean(item && item.conditionKnown), authenticityKnown: Boolean(item && item.authenticityKnown),
        visualType: sanitizeText(item && item.visualType, 18) || 'unknown', visualKnown: Boolean(item && item.visualKnown),
        gridX: Math.max(0, Math.floor(safeNumber(item && item.gridX))), gridY: Math.max(0, Math.floor(safeNumber(item && item.gridY))),
        shape: (Array.isArray(item && item.shape) ? item.shape : [[0, 0]]).slice(0, 12).map((cell) => [Math.max(0, Math.floor(safeNumber(cell && cell[0]))), Math.max(0, Math.floor(safeNumber(cell && cell[1])))])
      })),
      dexUnlocked: Math.max(0, Math.floor(safeNumber(rawAuction.dexUnlocked))), dexTotal: Math.max(0, Math.floor(safeNumber(rawAuction.dexTotal))),
      dexPercent: Math.max(0, Math.min(100, safeNumber(rawAuction.dexPercent))), highestBid: Math.max(0, safeNumber(rawAuction.highestBid)),
      bestProfit: safeNumber(rawAuction.bestProfit), mostItems: Math.max(0, Math.floor(safeNumber(rawAuction.mostItems))),
      totalSpend: Math.max(0, safeNumber(rawAuction.totalSpend)), totalRevenue: Math.max(0, safeNumber(rawAuction.totalRevenue)),
      containers: Math.max(0, Math.floor(safeNumber(rawAuction.containers))), topItem: sanitizeText(rawAuction.topItem, 80),
      sizeHints: (Array.isArray(rawAuction.sizeHints) ? rawAuction.sizeHints : []).slice(0, 8).map((hint) => ({
        sizeLabel: sanitizeText(hint && hint.sizeLabel, 8), width: Math.max(1, Math.min(4, Math.floor(safeNumber(hint && hint.width, 1)))),
        height: Math.max(1, Math.min(3, Math.floor(safeNumber(hint && hint.height, 1)))), count: Math.max(0, Math.floor(safeNumber(hint && hint.count))),
        names: (Array.isArray(hint && hint.names) ? hint.names : []).slice(0, 5).map((name) => sanitizeText(name, 18))
      })),
      venueStats: (Array.isArray(rawAuction.venueStats) ? rawAuction.venueStats : []).slice(0, 8).map((row) => ({
        name: sanitizeText(row && row.name, 20), plays: Math.max(0, Math.floor(safeNumber(row && row.plays))),
        wins: Math.max(0, Math.floor(safeNumber(row && row.wins))), profit: safeNumber(row && row.profit), items: Math.max(0, Math.floor(safeNumber(row && row.items)))
      }))
    } : null
  };
}

function normalizeBlackjackActor(actor, hideTrumps) {
  const raw = actor && typeof actor === 'object' ? actor : {};
  const hp = Math.max(0, safeNumber(raw.hp)); const maxHp = Math.max(1, safeNumber(raw.maxHp, Math.max(5, hp)));
  return {
    name: sanitizeText(raw.name, 18) || '玩家', hp, maxHp,
    sum: raw.sum == null ? null : Math.max(0, safeNumber(raw.sum)),
    hand: (Array.isArray(raw.hand) ? raw.hand : []).slice(0, 11).map(normalizeNumberCard).filter(Boolean),
    trumps: hideTrumps ? [] : (Array.isArray(raw.trumps) ? raw.trumps : []).slice(0, 20).map((name) => sanitizeText(name, 20)),
    trumpCount: Math.max(0, Math.floor(safeNumber(raw.trumpCount))), stand: Boolean(raw.stand), busted: Boolean(raw.busted),
    status: sanitizeText(raw.status, 32)
  };
}

function drawCover(ctx, image, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapLine(ctx, text, maxWidth) {
  const chars = Array.from(text);
  const rows = [];
  let current = '';
  for (const char of chars) {
    const next = current + char;
    if (current && ctx.measureText(next).width > maxWidth) {
      rows.push(current);
      current = char;
    } else current = next;
  }
  if (current || !rows.length) rows.push(current);
  return rows;
}

function meterRatio(meter) {
  if (meter.max <= meter.min) return meter.value >= meter.max ? 1 : 0;
  return Math.max(0, Math.min(1, (meter.value - meter.min) / (meter.max - meter.min)));
}

function drawMeters(ctx, meters, accent, startY) {
  if (!meters.length) return startY;
  const palette = [accent, '#82d5d0', '#ef8d7f', '#f2b5d4', '#b4d58d', '#ffd166', '#9bb7d4', '#d7c49e'];
  const columns = meters.length === 1 ? 1 : 2;
  const gap = 28;
  const fullWidth = 992;
  const columnWidth = columns === 1 ? fullWidth : (fullWidth - gap) / 2;
  const rowHeight = 68;
  meters.forEach((meter, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 104 + column * (columnWidth + gap);
    const y = startY + row * rowHeight;
    ctx.font = '600 18px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillStyle = '#f2efe8';
    ctx.textAlign = 'left';
    ctx.fillText(meter.label, x, y + 19, columnWidth * 0.58);
    ctx.fillStyle = '#cfd7d4';
    ctx.textAlign = 'right';
    ctx.fillText(meter.text, x + columnWidth, y + 19, columnWidth * 0.4);
    ctx.textAlign = 'left';
    roundedRect(ctx, x, y + 31, columnWidth, 13, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    const fillWidth = columnWidth * meterRatio(meter);
    if (fillWidth > 0) {
      roundedRect(ctx, x, y + 31, fillWidth, 13, 6);
      ctx.fillStyle = palette[index % palette.length];
      ctx.fill();
    }
  });
  return startY + Math.ceil(meters.length / columns) * rowHeight + 2;
}

function toneColor(tone, accent) {
  if (tone === 'positive') return '#82d5d0';
  if (tone === 'negative') return '#ef8d7f';
  if (tone === 'accent') return accent;
  return '#cfd7d4';
}

function signedNumber(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function drawModules(ctx, modules, startY) {
  if (!modules.length) return startY;
  const colors = ['#f3c969', '#82d5d0', '#ef8d7f', '#f2b5d4', '#b4d58d', '#9bb7d4'];
  const gap = 20;
  const columnWidth = (992 - gap) / 2;
  const rowHeight = 116;
  modules.forEach((module, index) => {
    const x = 104 + (index % 2) * (columnWidth + gap);
    const y = startY + Math.floor(index / 2) * rowHeight;
    const color = colors[index % colors.length];
    roundedRect(ctx, x, y, columnWidth, 104, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 6, 104);

    ctx.font = '700 19px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(module.name, x + 20, y + 27, 265);
    ctx.textAlign = 'right';
    ctx.fillStyle = module.affection >= 0 ? '#82d5d0' : '#ef8d7f';
    ctx.fillText(`好感净值 ${signedNumber(module.affection)}`, x + columnWidth - 16, y + 27, 180);
    ctx.textAlign = 'left';

    ctx.font = '16px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillStyle = '#f2efe8';
    const recordLine = `${module.plays}局 · ${module.wins}胜 / ${module.losses}负 / ${module.draws}平${module.key === 'poker' && module.bestPokerHand ? ` · 牌型${module.bestPokerHand}` : ''}`;
    ctx.fillText(recordLine, x + 20, y + 53, columnWidth - 40);
    ctx.fillStyle = '#bfc9c6';
    ctx.fillText(`最高 ${module.best} · 收益 ${signedNumber(module.profit)}`, x + 20, y + 78, 235);
    ctx.fillStyle = '#82d5d0';
    ctx.fillText(`+${module.affectionGained}`, x + 265, y + 78, 75);
    ctx.fillStyle = '#ef8d7f';
    ctx.fillText(`-${module.affectionLost}`, x + 340, y + 78, 75);

    roundedRect(ctx, x + 20, y + 89, columnWidth - 40, 6, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    const rate = module.plays ? Math.max(0, Math.min(1, module.wins / module.plays)) : 0;
    if (rate > 0) {
      roundedRect(ctx, x + 20, y + 89, (columnWidth - 40) * rate, 6, 3);
      ctx.fillStyle = color;
      ctx.fill();
    }
  });
  return startY + Math.ceil(modules.length / 2) * rowHeight;
}

function drawTiles(ctx, tiles, accent, startY) {
  if (!tiles.length) return startY;
  const gap = 18;
  const columnWidth = (992 - gap * 2) / 3;
  const dense = tiles.length > 12; const rowHeight = dense ? 96 : 112; const tileHeight = dense ? 82 : 96;
  tiles.forEach((tile, index) => {
    const x = 104 + (index % 3) * (columnWidth + gap);
    const y = startY + Math.floor(index / 3) * rowHeight;
    const color = toneColor(tile.tone, accent);
    roundedRect(ctx, x, y, columnWidth, tileHeight, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 5, tileHeight);
    ctx.font = `${dense ? 14 : 16}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillStyle = '#bfc9c6';
    ctx.fillText(tile.label, x + 20, y + (dense ? 25 : 29), columnWidth - 40);
    ctx.font = `700 ${dense ? 24 : 29}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(tile.value, x + 20, y + (dense ? 60 : 69), columnWidth - 40);
  });
  return startY + Math.ceil(tiles.length / 3) * rowHeight;
}

function drawRankings(ctx, rankings, accent) {
  const palette = ['#f3c969', '#82d5d0', '#ef8d7f'];
  const rowHeight = rankings.length > 8 ? 55 : 62;
  let y = 218;
  rankings.forEach((row, index) => {
    const color = palette[index] || accent;
    ctx.fillStyle = index < 3 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.05)';
    roundedRect(ctx, 94, y, 1012, rowHeight - 7, 6);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.font = '700 21px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(`#${row.rank}`, 112, y + 24, 55);
    ctx.fillStyle = '#f7f3ea';
    ctx.fillText(row.name, 178, y + 24, 360);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.fillText(row.primary, 1084, y + 24, 300);
    ctx.textAlign = 'left';

    const hasDetails = row.details.length > 0;
    const trackWidth = hasDetails ? 270 : 550;
    roundedRect(ctx, 178, y + 36, trackWidth, 8, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    if (row.ratio > 0) {
      roundedRect(ctx, 178, y + 36, trackWidth * row.ratio, 8, 4);
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.fillStyle = '#bfc9c6';
    ctx.font = '16px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    if (hasDetails) {
      ctx.fillText(row.secondary, 466, y + 44, 245);
      const detailWidth = 70;
      row.details.forEach((detail, detailIndex) => {
        ctx.fillStyle = toneColor(detail.tone, accent);
        ctx.font = '600 13px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
        ctx.fillText(`${detail.label}${detail.value}`, 724 + detailIndex * detailWidth, y + 44, detailWidth - 4);
      });
    } else ctx.fillText(row.secondary, 748, y + 44, 330);
    y += rowHeight;
  });
}

function drawSceneHeader(ctx, view, accent) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'left';
  roundedRect(ctx, 36, 24, 1128, 72, 8);
  ctx.fillStyle = 'rgba(9, 13, 14, 0.86)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillRect(58, 43, 6, 34);
  ctx.fillStyle = '#f7f3ea';
  ctx.font = '700 31px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  ctx.fillText(view.title, 82, 64, 650);
  ctx.fillStyle = '#c8d0cd';
  ctx.font = '17px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  ctx.fillText(view.subtitle, 82, 86, 760);
  ctx.textAlign = 'right';
  ctx.fillStyle = accent;
  ctx.font = '700 17px "Microsoft YaHei", sans-serif';
  ctx.fillText('YAN GAME TABLE', 1136, 67);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawPlayingCardSuit(ctx, suit, centerX, centerY, size) {
  const s = Math.max(8, size);
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.beginPath();
  if (suit === 'H') {
    ctx.moveTo(0, s * 0.48);
    ctx.bezierCurveTo(-s * 0.10, s * 0.34, -s * 0.50, s * 0.08, -s * 0.50, -s * 0.18);
    ctx.bezierCurveTo(-s * 0.50, -s * 0.44, -s * 0.17, -s * 0.55, 0, -s * 0.29);
    ctx.bezierCurveTo(s * 0.17, -s * 0.55, s * 0.50, -s * 0.44, s * 0.50, -s * 0.18);
    ctx.bezierCurveTo(s * 0.50, s * 0.08, s * 0.10, s * 0.34, 0, s * 0.48);
    ctx.closePath();
  } else if (suit === 'D') {
    ctx.moveTo(0, -s * 0.52);
    ctx.lineTo(s * 0.36, 0);
    ctx.lineTo(0, s * 0.52);
    ctx.lineTo(-s * 0.36, 0);
    ctx.closePath();
  } else if (suit === 'C') {
    ctx.moveTo(s * 0.21, -s * 0.22);
    ctx.arc(0, -s * 0.22, s * 0.21, 0, Math.PI * 2);
    ctx.moveTo(s * 0.01, s * 0.03);
    ctx.arc(-s * 0.20, s * 0.03, s * 0.21, 0, Math.PI * 2);
    ctx.moveTo(s * 0.41, s * 0.03);
    ctx.arc(s * 0.20, s * 0.03, s * 0.21, 0, Math.PI * 2);
    ctx.moveTo(-s * 0.07, s * 0.10);
    ctx.lineTo(-s * 0.12, s * 0.45);
    ctx.lineTo(s * 0.12, s * 0.45);
    ctx.lineTo(s * 0.07, s * 0.10);
    ctx.closePath();
  } else {
    ctx.moveTo(0, -s * 0.52);
    ctx.bezierCurveTo(-s * 0.10, -s * 0.35, -s * 0.48, -s * 0.08, -s * 0.48, s * 0.16);
    ctx.bezierCurveTo(-s * 0.48, s * 0.39, -s * 0.16, s * 0.41, 0, s * 0.18);
    ctx.bezierCurveTo(s * 0.16, s * 0.41, s * 0.48, s * 0.39, s * 0.48, s * 0.16);
    ctx.bezierCurveTo(s * 0.48, -s * 0.08, s * 0.10, -s * 0.35, 0, -s * 0.52);
    ctx.closePath();
    ctx.moveTo(-s * 0.07, s * 0.13);
    ctx.lineTo(-s * 0.13, s * 0.48);
    ctx.lineTo(s * 0.13, s * 0.48);
    ctx.lineTo(s * 0.07, s * 0.13);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

function drawPlayingCard(ctx, card, x, y, width, height) {
  roundedRect(ctx, x, y, width, height, 6);
  if (!card || card.hidden) {
    ctx.fillStyle = '#162f39';
    ctx.fill();
    ctx.strokeStyle = '#d7bc71';
    ctx.lineWidth = 2;
    ctx.stroke();
    roundedRect(ctx, x + 6, y + 6, width - 12, height - 12, 4);
    ctx.strokeStyle = 'rgba(215,188,113,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(215,188,113,0.22)';
    for (let offset = -height; offset < width; offset += 12) {
      ctx.fillRect(x + Math.max(7, offset), y + 8, 2, height - 16);
    }
    ctx.fillStyle = '#d7bc71';
    ctx.font = `700 ${Math.max(14, Math.floor(width * 0.28))}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('YAN', x + width / 2, y + height / 2 + 6, width - 10);
    ctx.textAlign = 'left';
    return;
  }
  ctx.fillStyle = '#f8f5ed';
  ctx.fill();
  ctx.strokeStyle = 'rgba(15,20,22,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  const red = card.suit === 'H' || card.suit === 'D';
  ctx.fillStyle = red ? '#c83f49' : '#172124';
  const rankFontSize = Math.max(17, Math.floor(width * 0.34));
  ctx.font = `700 ${rankFontSize}px Georgia, serif`;
  ctx.fillText(card.rank, x + 12, y + Math.max(25, Math.floor(rankFontSize * 0.92)), width - 20);
  drawPlayingCardSuit(ctx, card.suit, x + width / 2, y + height * 0.64, Math.min(width * 0.43, height * 0.34));
}

function pokerSeatPositions(count) {
  const points = {
    top: { x: 600, y: 139, side: 'top' }, upperRight: { x: 1000, y: 245, side: 'right' },
    lowerRight: { x: 970, y: 650, side: 'right' }, bottom: { x: 600, y: 728, side: 'bottom' },
    lowerLeft: { x: 230, y: 650, side: 'left' }, upperLeft: { x: 200, y: 245, side: 'left' }
  };
  if (count <= 2) return [points.top, points.bottom];
  if (count === 3) return [points.top, points.lowerRight, points.lowerLeft];
  if (count === 4) return [points.top, points.upperRight, points.bottom, points.upperLeft];
  if (count === 5) return [points.top, points.upperRight, points.lowerRight, points.lowerLeft, points.upperLeft];
  return [points.top, points.upperRight, points.lowerRight, points.bottom, points.lowerLeft, points.upperLeft];
}

function drawPokerSeat(ctx, seat, position, accent) {
  const width = 208; const height = 78; const x = position.x - width / 2; const y = position.y - height / 2;
  const isOut = seat.status === '已淘汰';
  if (seat.isTurn) {
    ctx.shadowColor = '#ffe48a'; ctx.shadowBlur = 18;
  }
  roundedRect(ctx, x, y, width, height, 7);
  ctx.fillStyle = seat.status === '弃牌' || isOut ? 'rgba(34,38,39,0.9)' : 'rgba(11,19,20,0.94)';
  ctx.fill();
  ctx.strokeStyle = seat.isTurn ? '#ffe48a' : seat.status === '全押' ? '#ef8d7f' : seat.isGuest ? '#bba56f' : isOut ? 'rgba(122,132,129,0.45)' : 'rgba(255,255,255,0.30)';
  ctx.lineWidth = seat.isTurn ? 3 : 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = seat.isTurn ? '#ffe48a' : '#f4f1e9';
  ctx.font = '700 18px "Microsoft YaHei", sans-serif';
  ctx.fillText(seat.name, x + 16, y + 27, seat.isGuest ? 108 : 130);
  if (seat.isGuest) {
    ctx.fillStyle = '#d9c487'; ctx.font = '700 11px "Microsoft YaHei", sans-serif';
    ctx.fillText('游客', x + 131, y + 26, 38);
  }
  ctx.fillStyle = '#d9bf70';
  ctx.font = '700 16px "Microsoft YaHei", sans-serif';
  ctx.fillText(`${Math.floor(seat.stack)} 筹码`, x + 16, y + 53, 105);
  ctx.textAlign = 'right';
  ctx.fillStyle = seat.status === '弃牌' || isOut ? '#8e9996' : seat.status === '全押' ? '#ef8d7f' : seat.status === '冠军' ? '#ffe48a' : '#9bcfc8';
  ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillText(seat.status, x + width - 14, y + 53, 70);
  ctx.textAlign = 'left';
  if (seat.isDealer) {
    ctx.beginPath(); ctx.arc(x + width - 22, y + 20, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#f5eee0'; ctx.fill();
    ctx.fillStyle = '#253034'; ctx.font = '700 13px Arial'; ctx.textAlign = 'center'; ctx.fillText('D', x + width - 22, y + 25); ctx.textAlign = 'left';
  }

  const betY = y + height + 9;
  ctx.beginPath(); ctx.arc(position.x - 34, betY + 11, 10, 0, Math.PI * 2);
  ctx.fillStyle = seat.roundBet > 0 ? '#d8ba64' : '#596361'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = seat.roundBet > 0 ? '#f3d880' : '#aab2af';
  ctx.font = '600 14px "Microsoft YaHei", sans-serif';
  ctx.fillText(`本轮下注 ${Math.floor(seat.roundBet)}`, position.x - 17, betY + 16, 130);

  let cardX; let cardY;
  if (position.side === 'top') { cardX = position.x - 48; cardY = y + height + 43; }
  else if (position.side === 'bottom') { cardX = position.x - 48; cardY = y - 83; }
  else if (position.side === 'left') { cardX = x + width + 13; cardY = position.y - 35; }
  else { cardX = x - 109; cardY = position.y - 35; }
  seat.cards.forEach((card, index) => drawPlayingCard(ctx, card, cardX + index * 49, cardY, 44, 64));
}

function drawPokerTable(ctx, view, accent) {
  const table = view.pokerTable;
  drawSceneHeader(ctx, view, accent);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.ellipse(600, 447, 468, 278, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20, 72, 58, 0.96)'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.ellipse(600, 447, 468, 278, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#7e5636'; ctx.lineWidth = 18; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(600, 447, 448, 258, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(239,213,151,0.42)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath(); ctx.ellipse(600, 447, 365, 185, 0, 0, Math.PI * 2); ctx.fill();

  ctx.textAlign = 'center';
  roundedRect(ctx, 515, 292, 170, 34, 17); ctx.fillStyle = 'rgba(5,18,17,0.82)'; ctx.fill();
  ctx.strokeStyle = 'rgba(244,210,118,0.52)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#d9e2de'; ctx.font = '700 16px "Microsoft YaHei", sans-serif';
  ctx.fillText(table.stage || '等待', 600, 315, 145);
  ctx.fillStyle = '#f4d276'; ctx.font = '700 20px "Microsoft YaHei", sans-serif';
  ctx.fillText(`底池 ${Math.floor(table.pot)}`, 490, 347, 185);
  ctx.fillStyle = '#bfc9c6'; ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillText(`当前注 ${Math.floor(table.currentBet)}`, 710, 347, 185);
  const cardWidth = 72; const gap = 13; const boardWidth = cardWidth * 5 + gap * 4; const startX = 600 - boardWidth / 2;
  for (let index = 0; index < 5; index++) {
    const card = table.board[index] || null; const x = startX + index * (cardWidth + gap);
    if (card) drawPlayingCard(ctx, card, x, 357, cardWidth, 104);
    else {
      roundedRect(ctx, x, 357, cardWidth, 104, 6); ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.24)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.30)'; ctx.font = '15px Arial'; ctx.fillText(String(index + 1), x + cardWidth / 2, 414);
    }
  }
  roundedRect(ctx, 335, 485, 530, 54, 6); ctx.fillStyle = 'rgba(5,18,17,0.72)'; ctx.fill();
  ctx.fillStyle = '#e9e6dd'; ctx.font = '17px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center';
  const actionRows = wrapLine(ctx, table.lastAction || '等待行动。', 490).slice(0, 2);
  actionRows.forEach((row, index) => ctx.fillText(row, 600, 508 + index * 21, 490));
  if (table.nextAction) {
    roundedRect(ctx, 350, 548, 500, 40, 20); ctx.fillStyle = 'rgba(121,72,39,0.90)'; ctx.fill();
    ctx.strokeStyle = 'rgba(244,210,118,0.58)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff1c4'; ctx.font = '700 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(table.nextAction, 600, 574, 468);
  }
  ctx.textAlign = 'left';

  const positions = pokerSeatPositions(table.seats.length);
  table.seats.forEach((seat, index) => drawPokerSeat(ctx, seat, positions[index], accent));
  ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'right'; ctx.fillText(view.quote || '公开桌面默认隐藏所有底牌', 1146, 876, 1040); ctx.textAlign = 'left';
}

function drawNumberCard(ctx, card, x, y, width, height) {
  roundedRect(ctx, x, y, width, height, 7);
  if (!card || card.hidden) {
    ctx.fillStyle = '#5a171d'; ctx.fill(); ctx.strokeStyle = '#e6b55f'; ctx.lineWidth = 2; ctx.stroke();
    roundedRect(ctx, x + 7, y + 7, width - 14, height - 14, 4); ctx.strokeStyle = 'rgba(230,181,95,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#e6b55f'; ctx.font = `700 ${Math.floor(width * 0.3)}px Georgia, serif`; ctx.textAlign = 'center';
    ctx.fillText('?', x + width / 2, y + height / 2 + 9); ctx.textAlign = 'left'; return;
  }
  const value = Math.floor(card.value);
  ctx.fillStyle = '#eee7d7'; ctx.fill(); ctx.strokeStyle = value > 9 ? '#d8a94f' : '#5b161d'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#5b161d'; ctx.font = `700 ${Math.floor(width * 0.58)}px Georgia, serif`; ctx.textAlign = 'center';
  ctx.fillText(String(value), x + width / 2, y + height * 0.62, width - 10);
  ctx.fillStyle = '#b58a45'; ctx.font = '700 12px "Microsoft YaHei", sans-serif'; ctx.fillText('BLACKJACK', x + width / 2, y + height - 12, width - 8); ctx.textAlign = 'left';
}

function drawBlackjackActor(ctx, actor, x, y, width, isTurn, accent, concealed) {
  roundedRect(ctx, x, y, width, 66, 7); ctx.fillStyle = 'rgba(12,16,18,0.90)'; ctx.fill();
  ctx.strokeStyle = isTurn ? accent : 'rgba(255,255,255,0.24)'; ctx.lineWidth = isTurn ? 2.5 : 1; ctx.stroke();
  ctx.fillStyle = isTurn ? accent : '#f4f1e9'; ctx.font = '700 21px "Microsoft YaHei", sans-serif'; ctx.fillText(actor.name, x + 18, y + 27, 250);
  ctx.fillStyle = actor.busted ? '#ef8d7f' : actor.stand ? '#bfc9c6' : '#82d5d0'; ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillText(actor.status, x + 18, y + 51, 300);
  ctx.fillStyle = '#f4f1e9'; ctx.font = '700 20px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'right';
  ctx.fillText(concealed && actor.sum == null ? '点数 ?' : `点数 ${Math.floor(actor.sum || 0)}`, x + width - 18, y + 28, 150);
  ctx.fillStyle = '#d6b75d'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText(`HP ${Math.floor(actor.hp)}/${Math.floor(actor.maxHp)}`, x + width - 18, y + 52, 130); ctx.textAlign = 'left';
  roundedRect(ctx, x + width - 238, y + 43, 86, 9, 4); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
  const hpWidth = 86 * Math.max(0, Math.min(1, actor.hp / actor.maxHp)); if (hpWidth > 0) { roundedRect(ctx, x + width - 238, y + 43, hpWidth, 9, 4); ctx.fillStyle = actor.hp <= Math.ceil(actor.maxHp * 0.3) ? '#ef8d7f' : '#82d5d0'; ctx.fill(); }
}

function drawNumberHand(ctx, hand, centerX, y) {
  if (!hand.length) return;
  const width = hand.length > 9 ? 60 : 68; const height = 96; const gap = hand.length > 9 ? 6 : 10;
  const total = hand.length * width + (hand.length - 1) * gap; const startX = centerX - total / 2;
  hand.forEach((card, index) => drawNumberCard(ctx, card, startX + index * (width + gap), y, width, height));
}

function drawBuffColumn(ctx, title, buffs, x, y, color) {
  ctx.fillStyle = color; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.fillText(title, x, y);
  const visible = buffs.slice(0, 5);
  visible.forEach((buff, index) => {
    roundedRect(ctx, x, y + 12 + index * 33, 225, 26, 5); ctx.fillStyle = 'rgba(5,9,10,0.70)'; ctx.fill();
    ctx.fillStyle = color; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(buff.name, x + 10, y + 31 + index * 33, 200);
  });
  if (buffs.length > visible.length) { ctx.fillStyle = '#c5cdca'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(`另有 ${buffs.length - visible.length} 张`, x + 10, y + 31 + visible.length * 33); }
}

function drawBlackjackTable(ctx, view, accent) {
  const table = view.blackjackTable; drawSceneHeader(ctx, view, accent);
  const roundSettled = table.phase === 'round_result' && table.roundResult;
  roundedRect(ctx, 50, 111, 1100, 715, 26); ctx.fillStyle = 'rgba(28,48,40,0.90)'; ctx.fill();
  ctx.strokeStyle = '#805738'; ctx.lineWidth = 11; ctx.stroke();
  ctx.strokeStyle = 'rgba(230,199,126,0.32)'; ctx.lineWidth = 2; roundedRect(ctx, 68, 129, 1064, 679, 20); ctx.stroke();
  drawBlackjackActor(ctx, table.enemy, 260, 126, 680, !roundSettled && table.turn === 'enemy', accent, true);
  drawNumberHand(ctx, table.enemy.hand, 600, 207);
  ctx.fillStyle = '#d8bd70'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`敌方王牌 ${table.enemy.trumpCount} 张（隐藏）`, 600, 321); ctx.textAlign = 'left';

  if (roundSettled) {
    roundedRect(ctx, 330, 342, 540, 118, 8); ctx.fillStyle = 'rgba(7,13,14,0.94)'; ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#d7c27e'; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`第 ${table.round} 回合结算 · 目标 ${table.target}`, 600, 368);
    ctx.fillStyle = '#f4f1e9'; ctx.font = '700 27px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${table.player.name} ${table.roundResult.playerSum}  :  ${table.roundResult.enemySum} ${table.enemy.name}`, 600, 402, 500);
    const resultText = table.roundResult.tie ? '本回合平局 · 双方不受伤害' : `${table.roundResult.winnerName} 获胜 · ${table.roundResult.loserName} -${table.roundResult.damage} HP`;
    ctx.fillStyle = table.roundResult.tie ? '#bfc9c6' : '#efc96f'; ctx.font = '700 16px "Microsoft YaHei", sans-serif'; ctx.fillText(resultText, 600, 429, 500);
    ctx.fillStyle = '#82d5d0'; ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.fillText(table.roundResult.matchFinished ? '整场对决已经结束' : `下一回合 ${table.roundResult.nextStarterName} 先手 · 输入 .yan 21点 抽牌开局`, 600, 451, 500);
  } else {
    ctx.beginPath(); ctx.arc(600, 408, 62, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,13,14,0.88)'; ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#c8d0cd'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`第 ${table.round} 回合`, 600, 390);
    ctx.fillStyle = accent; ctx.font = '700 34px "Microsoft YaHei", sans-serif'; ctx.fillText(`目标 ${table.target}`, 600, 428);
  }
  const enemyBuffs = table.buffs.filter((buff) => buff.side === 'enemy'); const playerBuffs = table.buffs.filter((buff) => buff.side === 'player');
  drawBuffColumn(ctx, '敌方场上王牌', enemyBuffs, 92, 350, '#ef8d7f');
  drawBuffColumn(ctx, '己方场上王牌', playerBuffs, 884, 350, '#82d5d0');
  roundedRect(ctx, 320, 471, 560, 48, 6); ctx.fillStyle = 'rgba(4,11,11,0.72)'; ctx.fill();
  ctx.fillStyle = '#eeeae1'; ctx.font = '15px "Microsoft YaHei", sans-serif';
  const actionRows = table.recentActions.length ? table.recentActions : wrapLine(ctx, table.lastAction || '等待行动。', 520).slice(0, 2);
  actionRows.forEach((row, index) => ctx.fillText(row, 600, 490 + index * 20, 520));
  drawNumberHand(ctx, table.player.hand, 600, 528);
  drawBlackjackActor(ctx, table.player, 260, 637, 680, !roundSettled && table.turn === 'player', accent, false);

  const visibleTrumps = table.player.trumps.slice(0, 8); const trumpWidth = 119; const gap = 10; const total = visibleTrumps.length * trumpWidth + Math.max(0, visibleTrumps.length - 1) * gap;
  let trumpX = 600 - total / 2;
  visibleTrumps.forEach((name, index) => {
    roundedRect(ctx, trumpX + index * (trumpWidth + gap), 720, trumpWidth, 52, 6); ctx.fillStyle = 'rgba(78,20,28,0.95)'; ctx.fill();
    ctx.strokeStyle = '#d8b35d'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#f2dfaa'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(name, trumpX + index * (trumpWidth + gap) + trumpWidth / 2, 751, trumpWidth - 12);
  });
  ctx.textAlign = 'left';
  if (!visibleTrumps.length) { ctx.fillStyle = '#aab3b0'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('手中暂无王牌', 600, 751); ctx.textAlign = 'left'; }
  if (table.player.trumps.length > visibleTrumps.length) { ctx.fillStyle = '#f2dfaa'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`另有 ${table.player.trumps.length - visibleTrumps.length} 张`, 1115, 792); ctx.textAlign = 'left'; }
  ctx.fillStyle = 'rgba(255,255,255,0.66)'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(view.quote || '王牌可连续使用；只有摸牌或停牌才会交出行动权', 600, 855, 1080); ctx.textAlign = 'left';
}

function drawTutorial(ctx, view, accent) {
  const tutorial = view.tutorial; drawSceneHeader(ctx, view, accent);
  roundedRect(ctx, 52, 116, 1096, 712, 8); ctx.fillStyle = 'rgba(10,15,16,0.88)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
  const gapX = 22; const cardWidth = (1024 - gapX) / 2; const rowHeight = tutorial.entries.length > 8 ? 112 : 128;
  tutorial.entries.forEach((entry, index) => {
    const column = index % 2; const row = Math.floor(index / 2); const x = 88 + column * (cardWidth + gapX); const y = 154 + row * rowHeight;
    roundedRect(ctx, x, y, cardWidth, rowHeight - 16, 7); ctx.fillStyle = 'rgba(255,255,255,0.065)'; ctx.fill();
    ctx.fillStyle = index % 3 === 0 ? accent : index % 3 === 1 ? '#82d5d0' : '#ef8d7f'; ctx.fillRect(x, y, 5, rowHeight - 16);
    ctx.fillStyle = '#f5f1e8'; ctx.font = '700 19px "Microsoft YaHei", sans-serif'; ctx.fillText(entry.title, x + 20, y + 29, 270);
    ctx.textAlign = 'right'; ctx.fillStyle = '#d5ba70'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(entry.tag, x + cardWidth - 16, y + 27, 150); ctx.textAlign = 'left';
    ctx.fillStyle = '#c7cfcc'; ctx.font = '15px "Microsoft YaHei", sans-serif';
    const rows = wrapLine(ctx, entry.description, cardWidth - 40).slice(0, 3);
    rows.forEach((line, lineIndex) => ctx.fillText(line, x + 20, y + 57 + lineIndex * 21, cardWidth - 40));
  });
  const dotsWidth = tutorial.total * 18; const startX = 600 - dotsWidth / 2;
  for (let page = 1; page <= tutorial.total; page++) {
    ctx.beginPath(); ctx.arc(startX + (page - 1) * 18, 791, page === tutorial.page ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = page === tutorial.page ? accent : 'rgba(255,255,255,0.35)'; ctx.fill();
  }
  ctx.fillStyle = accent; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(view.quote, 600, 856, 1050); ctx.textAlign = 'left';
}

function scratchRule(type) {
  if (type === '幸运数字') return '刮出与幸运数字相同的号码';
  if (type === '三同符号') return '任意三枚相同符号即可中奖';
  if (type === '金库钥匙') return '找到金钥匙，开启本票奖金';
  return '基础奖金 × 倍率 = 最终奖金';
}

function drawFoilLayer(ctx, x, y, width, height, index) {
  roundedRect(ctx, x, y, width, height, 10);
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, '#6d777b'); gradient.addColorStop(0.45, '#c4cbcc'); gradient.addColorStop(1, '#737d80');
  ctx.fillStyle = gradient; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.72)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.save(); roundedRect(ctx, x + 3, y + 3, width - 6, height - 6, 8); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.24)'; ctx.lineWidth = 2;
  for (let offset = -height; offset < width + height; offset += 18) {
    ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset - height, y + height); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(45,55,58,0.22)'; ctx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    ctx.beginPath();
    for (let step = 0; step <= 12; step++) {
      const px = x + step * width / 12; const py = y + height * (0.25 + row * 0.16) + Math.sin(step + index * 1.7 + row) * 5;
      if (step === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(37,48,51,0.72)'; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(`刮开 ${index + 1}`, x + width / 2, y + height / 2 + 5, width - 20); ctx.textAlign = 'left';
}

function drawRevealedScratchCell(ctx, cell, x, y, width, height, index) {
  roundedRect(ctx, x, y, width, height, 10);
  ctx.fillStyle = cell.winning ? '#fff1b8' : index % 2 ? '#f7f3ea' : '#edf7f4'; ctx.fill();
  ctx.strokeStyle = cell.winning ? '#e5a933' : 'rgba(29,55,57,0.24)'; ctx.lineWidth = cell.winning ? 4 : 1.5; ctx.stroke();
  if (cell.winning) {
    ctx.fillStyle = '#d1424c'; ctx.font = '700 13px "Microsoft YaHei", sans-serif'; ctx.fillText('WIN', x + 12, y + 20);
  }
  const symbol = cell.symbol || '—'; const fontSize = symbol.length > 4 ? 24 : symbol.length > 2 ? 30 : 40;
  ctx.fillStyle = cell.winning ? '#a42834' : '#173c3d'; ctx.font = `700 ${fontSize}px "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(symbol, x + width / 2, y + height * 0.58, width - 24);
  if (cell.value > 0) {
    ctx.fillStyle = '#9a6720'; ctx.font = '700 15px "Microsoft YaHei", sans-serif';
    ctx.fillText(`奖金 ${Math.floor(cell.value)}`, x + width / 2, y + height - 14, width - 20);
  }
  ctx.textAlign = 'left';
}

function scratchGridLayout(ticket) {
  const count = ticket.cells.length;
  if (count <= 3) return { columns: Math.max(1, count), x: 190, y: 365, width: 260, height: 156, gapX: 20, gapY: 18 };
  if (count <= 6) return { columns: 3, x: 228, y: 320, width: 235, height: 126, gapX: 18, gapY: 18 };
  if (ticket.type === '幸运数字') return { columns: 3, x: 342, y: 294, width: 205, height: 96, gapX: 14, gapY: 14 };
  return { columns: 3, x: 250, y: 294, width: 220, height: 96, gapX: 18, gapY: 14 };
}

function drawScratchTicket(ctx, view, accent) {
  const ticket = view.scratchTicket; const x = 70; const y = 58; const width = 1060; const height = 770;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.72)'; ctx.shadowBlur = 32; ctx.shadowOffsetY = 12;
  roundedRect(ctx, x, y, width, height, 24); ctx.fillStyle = '#f4e8d2'; ctx.fill(); ctx.restore();
  roundedRect(ctx, x, y, width, height, 24); ctx.strokeStyle = '#e9bc55'; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = '#0f5a58'; ctx.fillRect(x + 18, y + 18, 10, height - 36);
  ctx.fillStyle = '#c83d4b'; ctx.fillRect(x + width - 28, y + 18, 10, height - 36);

  for (let holeY = y + 48; holeY < y + height - 28; holeY += 42) {
    ctx.beginPath(); ctx.arc(x, holeY, 8, 0, Math.PI * 2); ctx.fillStyle = 'rgba(10,14,15,0.82)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + width, holeY, 8, 0, Math.PI * 2); ctx.fill();
  }

  roundedRect(ctx, x + 38, y + 26, width - 76, 124, 16);
  const headerGradient = ctx.createLinearGradient(x + 38, y + 26, x + width - 38, y + 150);
  headerGradient.addColorStop(0, '#9f2635'); headerGradient.addColorStop(0.55, '#c8434d'); headerGradient.addColorStop(1, '#0e6662');
  ctx.fillStyle = headerGradient; ctx.fill();
  ctx.fillStyle = '#fff5da'; ctx.font = '700 19px "Microsoft YaHei", sans-serif'; ctx.fillText('YAN LUCKY · 即开型彩票', x + 68, y + 60);
  ctx.font = '700 47px "Microsoft YaHei", sans-serif'; ctx.fillText(ticket.type, x + 68, y + 112, 560);
  ctx.fillStyle = 'rgba(255,255,255,0.80)'; ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillText(`票号 ${ticket.serial || '00000000'}  ·  单票最高 ${Math.floor(ticket.maxPrize)} 币`, x + 70, y + 138, 600);
  ctx.beginPath(); ctx.arc(x + width - 115, y + 88, 60, 0, Math.PI * 2); ctx.fillStyle = '#ffd66e'; ctx.fill();
  ctx.strokeStyle = '#fff1bd'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#742432'; ctx.textAlign = 'center'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText('面额', x + width - 115, y + 75);
  ctx.font = '700 32px "Microsoft YaHei", sans-serif'; ctx.fillText(`${Math.floor(ticket.denom)}币`, x + width - 115, y + 111); ctx.textAlign = 'left';

  ctx.fillStyle = '#163f40'; ctx.font = '700 19px "Microsoft YaHei", sans-serif'; ctx.fillText(scratchRule(ticket.type), x + 82, y + 192);
  ctx.fillStyle = '#7b5140'; ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillText(ticket.revealed ? '涂层已经刮开，票面结果如下' : '银色涂层完整 · 刮开全部区域即可核对结果', x + 82, y + 219);
  ctx.strokeStyle = 'rgba(119,83,62,0.32)'; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.moveTo(x + 70, y + 239); ctx.lineTo(x + width - 70, y + 239); ctx.stroke(); ctx.setLineDash([]);

  if (ticket.type === '幸运数字') {
    roundedRect(ctx, 112, 333, 195, 218, 14); ctx.fillStyle = '#155d5b'; ctx.fill();
    ctx.strokeStyle = '#e0bd62'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#d9f1eb'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('幸运数字', 209, 377);
    if (ticket.revealed) {
      ctx.beginPath(); ctx.arc(209, 452, 54, 0, Math.PI * 2); ctx.fillStyle = '#ffd66e'; ctx.fill();
      ctx.fillStyle = '#7a2431'; ctx.font = '700 47px Georgia, serif'; ctx.fillText(ticket.lucky || '?', 209, 468);
    } else drawFoilLayer(ctx, 144, 400, 130, 104, 9);
    ctx.fillStyle = '#b8d9d3'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText('命中任意一格即中奖', 209, 532); ctx.textAlign = 'left';
  }

  const layout = scratchGridLayout(ticket);
  ticket.cells.forEach((cell, index) => {
    const column = index % layout.columns; const row = Math.floor(index / layout.columns);
    const cellX = layout.x + column * (layout.width + layout.gapX); const cellY = layout.y + row * (layout.height + layout.gapY);
    if (ticket.revealed) drawRevealedScratchCell(ctx, cell, cellX, cellY, layout.width, layout.height, index);
    else drawFoilLayer(ctx, cellX, cellY, layout.width, layout.height, index);
  });

  roundedRect(ctx, x + 58, y + 625, width - 116, 88, 14);
  ctx.fillStyle = ticket.revealed && ticket.prize > 0 ? '#fff0b0' : ticket.revealed ? '#e1ece9' : '#183f40'; ctx.fill();
  ctx.strokeStyle = ticket.revealed && ticket.prize > 0 ? '#d59b2c' : 'rgba(21,93,91,0.45)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  if (!ticket.revealed) {
    ctx.fillStyle = '#e9d28c'; ctx.font = '700 25px "Microsoft YaHei", sans-serif'; ctx.fillText('等待刮开', 600, y + 662);
    ctx.fillStyle = '#bed3cf'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText('涂层下已经封存本票结果', 600, y + 690);
  } else if (ticket.prize > 0) {
    ctx.fillStyle = '#a02735'; ctx.font = '700 30px "Microsoft YaHei", sans-serif'; ctx.fillText(`中奖 ${Math.floor(ticket.prize)} 游戏币`, 600, y + 663);
    ctx.fillStyle = '#865b24'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText(`${ticket.multiplier} 倍票面回报`, 600, y + 692);
  } else {
    ctx.fillStyle = '#315b59'; ctx.font = '700 28px "Microsoft YaHei", sans-serif'; ctx.fillText('本票未中奖', 600, y + 667);
    ctx.fillStyle = ticket.affectionDelta < 0 ? '#a02735' : '#6f7774'; ctx.font = '700 16px "Microsoft YaHei", sans-serif';
    ctx.fillText(ticket.affectionDelta < 0 ? `好感 ${Math.floor(ticket.affectionDelta)}` : '票面已经完成核验', 600, y + 693);
  }
  ctx.fillStyle = '#725346'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(view.quote || '骰娘好感度 · 刮刮乐发行中心', 600, y + 748, 900); ctx.textAlign = 'left';
}

function drawLotteryBall(ctx, x, y, value, color, highlighted, radius = 24) {
  ctx.save();
  if (highlighted) { ctx.shadowColor = color; ctx.shadowBlur = 16; }
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  const gradient = ctx.createRadialGradient(x - radius * 0.34, y - radius * 0.38, 2, x, y, radius);
  gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.18, color === '#2878c7' ? '#9fd3ff' : '#ffb1b8'); gradient.addColorStop(1, color);
  ctx.fillStyle = gradient; ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = highlighted ? '#ffd66e' : 'rgba(255,255,255,0.68)'; ctx.lineWidth = highlighted ? 4 : 1.5; ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = `800 ${Math.max(13, Math.floor(radius * 0.76))}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(value || '?').padStart(value ? 2 : 1, '0'), x, y + 1); ctx.restore(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

function drawLotteryNumbers(ctx, red, blue, x, y, hitRed = [], blueHit = false, radius = 22) {
  (red || []).forEach((value, index) => drawLotteryBall(ctx, x + index * (radius * 2 + 14), y, value, '#c72f42', hitRed.includes(value), radius));
  if (blue) drawLotteryBall(ctx, x + 5 * (radius * 2 + 14) + 12, y, blue, '#2878c7', blueHit, radius);
}

function drawLotteryTicketRow(ctx, ticket, x, y, width, showDraw) {
  roundedRect(ctx, x, y, width, 72, 6); ctx.fillStyle = 'rgba(249,245,233,0.94)'; ctx.fill();
  ctx.strokeStyle = 'rgba(151,42,56,0.25)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#742432'; ctx.font = '800 14px "Microsoft YaHei", sans-serif'; ctx.fillText(`${ticket.issue}期`, x + 16, y + 24, 100);
  ctx.fillStyle = '#7b675d'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(ticket.tier || '待开奖', x + 16, y + 48, 92);
  const hitValues = showDraw ? ticket.red.filter((value) => ticket.drawRed.includes(value)) : [];
  drawLotteryNumbers(ctx, ticket.red, ticket.blue, x + 132, y + 36, hitValues, showDraw && ticket.blueMatch, 17);
  ctx.textAlign = 'right'; ctx.fillStyle = ticket.prize > 0 ? '#b12b3c' : '#49605d'; ctx.font = '800 17px "Microsoft YaHei", sans-serif';
  ctx.fillText(showDraw ? `${ticket.prize}币` : '等待开奖', x + width - 18, y + 43, 100); ctx.textAlign = 'left';
}

function drawLotteryScene(ctx, view) {
  const scene = view.lotteryScene; drawSceneHeader(ctx, view, '#f05b68');
  roundedRect(ctx, 48, 112, 1104, 724, 10); ctx.fillStyle = 'rgba(244,232,210,0.96)'; ctx.fill();
  ctx.strokeStyle = '#e0b45a'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#a52b3d'; ctx.fillRect(48, 112, 1104, 82);
  ctx.fillStyle = '#fff3d8'; ctx.font = '800 30px "Microsoft YaHei", sans-serif'; ctx.fillText(`第 ${scene.issue} 期`, 82, 154);
  ctx.fillStyle = '#ffd6a3'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText('每日18:00静默开奖 · 兑奖有效期至下一次开奖', 82, 179);
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff3d8'; ctx.font = '800 25px "Microsoft YaHei", sans-serif'; ctx.fillText(`${scene.price} 币 / 注`, 1114, 157); ctx.textAlign = 'left';

  if (scene.mode === 'menu') {
    ctx.fillStyle = '#173f40'; ctx.font = '800 22px "Microsoft YaHei", sans-serif'; ctx.fillText('选号范围', 82, 238);
    for (let index = 0; index < 15; index++) drawLotteryBall(ctx, 112 + (index % 8) * 70, 284 + Math.floor(index / 8) * 65, index + 1, '#c72f42', false, 22);
    ctx.fillStyle = '#7b5140'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText('红球 1-15 中选5个，不可重复', 82, 407);
    for (let index = 0; index < 4; index++) drawLotteryBall(ctx, 650 + index * 70, 284, index + 1, '#2878c7', false, 22);
    ctx.fillText('蓝球 1-4 中选1个', 620, 337);
    roundedRect(ctx, 620, 365, 492, 58, 6); ctx.fillStyle = '#173f40'; ctx.fill();
    ctx.fillStyle = '#f7e4a6'; ctx.font = '800 18px "Microsoft YaHei", sans-serif'; ctx.fillText('.双色球 1 2 3 4 5 1', 646, 400);
    ctx.fillStyle = '#173f40'; ctx.font = '800 20px "Microsoft YaHei", sans-serif'; ctx.fillText('固定奖级', 82, 468);
    scene.prizeTable.forEach((row, index) => {
      const column = index % 4; const line = Math.floor(index / 4); const x = 82 + column * 257; const y = 492 + line * 78;
      roundedRect(ctx, x, y, 237, 62, 5); ctx.fillStyle = index < 4 ? '#fff0b0' : '#edf3ef'; ctx.fill();
      ctx.fillStyle = '#7d2835'; ctx.font = '800 14px "Microsoft YaHei", sans-serif'; ctx.fillText(`${row.tier} · ${row.label}`, x + 14, y + 24, 208);
      ctx.fillStyle = '#173f40'; ctx.font = '800 19px "Microsoft YaHei", sans-serif'; ctx.fillText(`${row.prize} 游戏币`, x + 14, y + 49);
    });
  } else if (scene.mode === 'history') {
    ctx.fillStyle = '#173f40'; ctx.font = '800 20px "Microsoft YaHei", sans-serif'; ctx.fillText('个人兑奖记录', 78, 232); ctx.fillText('全局开奖记录', 650, 232);
    scene.history.slice(0, 7).forEach((ticket, index) => {
      const y = 255 + index * 68; roundedRect(ctx, 72, y, 530, 56, 5); ctx.fillStyle = 'rgba(255,255,255,0.66)'; ctx.fill();
      ctx.fillStyle = '#742432'; ctx.font = '800 13px "Microsoft YaHei", sans-serif'; ctx.fillText(`${ticket.issue}期 · ${ticket.tier}`, 88, y + 22, 170);
      ctx.fillStyle = '#49605d'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(`命中${ticket.redMatches}红${ticket.blueMatch ? '+蓝' : ''}`, 88, y + 43);
      ctx.textAlign = 'right'; ctx.fillStyle = ticket.prize > 0 ? '#b12b3c' : '#647370'; ctx.font = '800 16px "Microsoft YaHei", sans-serif'; ctx.fillText(`${ticket.prize}币`, 584, y + 35); ctx.textAlign = 'left';
    });
    scene.draws.slice(0, 7).forEach((draw, index) => {
      const y = 255 + index * 68; roundedRect(ctx, 638, y, 482, 56, 5); ctx.fillStyle = 'rgba(255,255,255,0.66)'; ctx.fill();
      ctx.fillStyle = '#742432'; ctx.font = '800 13px "Microsoft YaHei", sans-serif'; ctx.fillText(`${draw.issue}期`, 654, y + 20);
      drawLotteryNumbers(ctx, draw.red, draw.blue, 770, y + 29, [], false, 13);
    });
  } else {
    if (scene.selectedRed.length) {
      ctx.fillStyle = '#173f40'; ctx.font = '800 18px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.mode === 'ticket' ? '本次选号' : '核验号码', 82, 233);
      drawLotteryNumbers(ctx, scene.selectedRed, scene.selectedBlue, 224, 225, [], false, 22);
    }
    if (scene.drawnRed.length) {
      ctx.fillStyle = '#173f40'; ctx.font = '800 18px "Microsoft YaHei", sans-serif'; ctx.fillText('开奖号码', 650, 233);
      drawLotteryNumbers(ctx, scene.drawnRed, scene.drawnBlue, 778, 225, [], false, 22);
    }
    roundedRect(ctx, 72, 276, 1048, 74, 6); ctx.fillStyle = scene.mode === 'result' && scene.totalPrize > 0 ? '#fff0b0' : '#e6f0ec'; ctx.fill();
    ctx.fillStyle = scene.mode === 'result' && scene.totalPrize > 0 ? '#a52b3d' : '#173f40'; ctx.font = '800 23px "Microsoft YaHei", sans-serif';
    ctx.fillText(scene.mode === 'ticket' ? '选号已封存，等待开奖' : scene.mode === 'result' ? `兑奖完成 · 合计 ${scene.totalPrize} 游戏币` : '当前彩票状态', 94, 310);
    ctx.fillStyle = '#66564e'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.status || '开奖后请主动兑奖。', 94, 335, 980);
    const rows = scene.tickets.slice(0, 6); rows.forEach((ticket, index) => drawLotteryTicketRow(ctx, ticket, 72, 374 + index * 76, 1048, scene.mode === 'result' || ticket.tier !== '待开奖'));
    if (!rows.length) { ctx.fillStyle = '#7b675d'; ctx.font = '18px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('当前没有待处理的彩票', 600, 500); ctx.textAlign = 'left'; }
  }
  ctx.fillStyle = '#725346'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(view.quote || '双色球不计算好感度，开奖不会主动通知其他玩家。', 600, 816, 1000); ctx.textAlign = 'left';
}

function drawDeathDiceScene(ctx, view) {
  const scene = view.deathDiceScene; drawSceneHeader(ctx, view, scene.difficulty === '困难' ? '#ef626f' : '#82d5d0');
  roundedRect(ctx, 54, 116, 1092, 700, 8); ctx.fillStyle = 'rgba(9,13,14,0.88)'; ctx.fill();
  ctx.fillStyle = '#f7f3ea'; ctx.font = '800 31px "Microsoft YaHei", sans-serif'; ctx.fillText(`${scene.difficulty}模式`, 84, 169);
  ctx.fillStyle = '#b8c2bf'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText(`全额押注 ${scene.stake} · 空白返还 ${scene.multiplier} 倍 · 不计算好感`, 84, 197);
  scene.faces.forEach((face, index) => {
    const x = 82 + index * 174; const selected = scene.mode === 'result' && scene.roll === index + 1; const death = face === '死亡';
    if (selected) { ctx.shadowColor = death ? '#ef626f' : '#82d5d0'; ctx.shadowBlur = 24; }
    roundedRect(ctx, x, 252, 146, 188, 9); ctx.fillStyle = death ? '#431f28' : '#153f3c'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = selected ? '#ffd66e' : death ? '#a84756' : '#4c9991'; ctx.lineWidth = selected ? 5 : 2; ctx.stroke();
    ctx.fillStyle = death ? '#ef8d7f' : '#82d5d0'; ctx.font = '800 16px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`第${index + 1}面`, x + 73, 288);
    ctx.font = '800 58px "Microsoft YaHei", sans-serif'; ctx.fillText(death ? '死' : '空', x + 73, 367);
    ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(death ? '余额归零' : '获得返还', x + 73, 414); ctx.textAlign = 'left';
  });
  roundedRect(ctx, 82, 488, 1036, 190, 8); ctx.fillStyle = scene.mode === 'result' ? (scene.survived ? 'rgba(24,86,79,0.84)' : 'rgba(91,28,40,0.86)') : 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.textAlign = 'center';
  if (scene.mode === 'result') {
    ctx.fillStyle = scene.survived ? '#82d5d0' : '#ef8d7f'; ctx.font = '800 40px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.survived ? '空白面 · 生还' : '死亡面 · 归零', 600, 548);
    ctx.fillStyle = '#f7f3ea'; ctx.font = '800 28px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.survived ? `返还 ${scene.payout} · 当前余额 ${scene.balance}` : `损失 ${scene.stake} · 当前余额 0`, 600, 594);
    if (scene.loanRepaid) { ctx.fillStyle = '#f3c969'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText(`已自动归还借款 ${scene.loanRepaid}，恢复好感 ${scene.affectionRestored}`, 600, 632); }
  } else {
    ctx.fillStyle = '#f3c969'; ctx.font = '800 31px "Microsoft YaHei", sans-serif'; ctx.fillText('选择难度后立即投掷', 600, 559);
    ctx.fillStyle = '#b8c2bf'; ctx.font = '18px "Microsoft YaHei", sans-serif'; ctx.fillText('简单：5空1死 · 困难：1空5死 · 操作不可撤回', 600, 605);
  }
  ctx.fillStyle = '#b8c2bf'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(view.quote || '骰子已经装入骰盅。', 600, 765, 980); ctx.textAlign = 'left';
}

function drawLoanScene(ctx, view) {
  const scene = view.loanScene; drawSceneHeader(ctx, view, '#e4b85c');
  roundedRect(ctx, 122, 120, 956, 700, 8); ctx.fillStyle = '#f4ecd9'; ctx.fill();
  ctx.strokeStyle = '#d7b466'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#a23b45'; ctx.fillRect(154, 120, 4, 700);
  for (let y = 214; y < 780; y += 42) { ctx.strokeStyle = 'rgba(75,113,119,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(158, y); ctx.lineTo(1046, y); ctx.stroke(); }
  ctx.fillStyle = '#173f40'; ctx.font = '800 33px "Microsoft YaHei", sans-serif'; ctx.fillText('借 款 账 页', 190, 177);
  ctx.textAlign = 'right'; ctx.fillStyle = '#a23b45'; ctx.font = '800 19px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.outstanding ? `未结清 ${scene.outstanding} 笔` : '当前无欠款', 1018, 174); ctx.textAlign = 'left';
  const metrics = [
    ['当前余额', `${scene.balance}币`, '#173f40'], ['当前好感', String(scene.affection), scene.affection >= 0 ? '#2f7c73' : '#a23b45'],
    ['未还本金利息', `${scene.debt}币`, scene.debt ? '#a23b45' : '#2f7c73'], ['下一笔好感损失', `-${scene.nextPenalty}`, '#a23b45']
  ];
  metrics.forEach((item, index) => {
    const x = 190 + (index % 2) * 430; const y = 246 + Math.floor(index / 2) * 112;
    ctx.fillStyle = '#725f54'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(item[0], x, y);
    ctx.fillStyle = item[2]; ctx.font = '800 29px "Microsoft YaHei", sans-serif'; ctx.fillText(item[1], x, y + 40, 360);
  });
  roundedRect(ctx, 190, 478, 820, 94, 6); ctx.fillStyle = scene.outstanding ? '#fff0b0' : '#e2eee9'; ctx.fill();
  ctx.fillStyle = '#173f40'; ctx.font = '800 20px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.outstanding ? '自动还款规则' : '申请条件', 216, 512);
  ctx.fillStyle = '#725f54'; ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillText(scene.outstanding ? '游戏币每次达到345时，自动收回一笔195，并恢复该笔好感损失的50%。' : '游戏币低于150时，可申请150游戏币；每笔固定应还195。', 216, 545, 760);
  ctx.fillStyle = '#725f54'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(`累计借入 ${scene.totalBorrowed} · 累计归还 ${scene.totalRepaid} · 好感扣除 ${scene.totalAffectionLost} · 已恢复 ${scene.totalAffectionRestored}`, 190, 625, 820);
  if (scene.mode === 'borrowed') {
    ctx.fillStyle = '#a23b45'; ctx.font = '800 24px "Microsoft YaHei", sans-serif'; ctx.fillText(`本次到账 +${scene.borrowed}币  ·  好感 ${scene.affectionDelta}`, 190, 682);
  } else if (scene.lastSettlement) {
    ctx.fillStyle = '#2f7c73'; ctx.font = '800 20px "Microsoft YaHei", sans-serif'; ctx.fillText(`最近还款：${scene.lastSettlement.count}笔 / ${scene.lastSettlement.repaid}币 / 恢复${scene.lastSettlement.restored}好感`, 190, 682, 820);
  } else {
    ctx.fillStyle = scene.eligible ? '#2f7c73' : '#8a6f60'; ctx.font = '800 20px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.eligible ? '可以申请：.借款 申请' : '当前余额不符合借款条件', 190, 682);
  }
  ctx.fillStyle = '#725346'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(view.quote || '借款次数越多，下一笔扣除的好感越多。', 600, 778, 820); ctx.textAlign = 'left';
}

function videoPokerNumber(value) {
  const number = Math.max(0, safeNumber(value));
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function drawVideoPokerPaytable(ctx, scene) {
  const rows = scene.paytable; const columns = 5; const gap = 10; const width = (1092 - gap * 4) / columns; const height = 55;
  rows.forEach((row, index) => {
    const x = 54 + (index % columns) * (width + gap); const y = 112 + Math.floor(index / columns) * 62;
    roundedRect(ctx, x, y, width, height, 7); ctx.fillStyle = index < 2 ? 'rgba(119,72,22,0.94)' : 'rgba(9,19,22,0.93)'; ctx.fill();
    ctx.strokeStyle = index < 2 ? '#ffd66e' : 'rgba(243,201,105,0.34)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = index < 2 ? '#fff0b0' : '#e8e2d4'; ctx.font = '800 13px "Microsoft YaHei", sans-serif'; ctx.fillText(row.label, x + 12, y + 21, width - 24);
    ctx.fillStyle = index < 2 ? '#fff7d8' : '#82d5d0'; ctx.font = '800 19px Arial, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${videoPokerNumber(row.multiplier)}×`, x + width - 12, y + 43); ctx.textAlign = 'left';
  });
}

function drawVideoPokerFooter(ctx, view, scene) {
  roundedRect(ctx, 54, 787, 1092, 46, 7); ctx.fillStyle = 'rgba(7,14,16,0.92)'; ctx.fill();
  const help = scene.help.join('   ·   '); ctx.fillStyle = '#f3c969'; ctx.font = '800 14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(help || '选择机台开始游戏', 600, 815, 1040);
  ctx.fillStyle = '#c4cfcc'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(view.quote || `当前余额 ${scene.balance} 游戏币`, 600, 862, 1050); ctx.textAlign = 'left';
}

function drawVideoPokerCardRow(ctx, cards, held, y, compact) {
  const width = compact ? 52 : 138; const height = compact ? 72 : 190; const gap = compact ? 10 : 18;
  const total = cards.length * width + Math.max(0, cards.length - 1) * gap; const startX = 600 - total / 2;
  cards.forEach((card, index) => {
    const x = startX + index * (width + gap); drawPlayingCard(ctx, card, x, y, width, height);
    if (!compact) {
      roundedRect(ctx, x + 12, y + height + 9, width - 24, 28, 14); ctx.fillStyle = held[index] ? '#d6ad4d' : 'rgba(255,255,255,0.10)'; ctx.fill();
      ctx.fillStyle = held[index] ? '#172124' : '#aeb8b5'; ctx.font = '800 13px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(held[index] ? `保留 ${index + 1}` : `${index + 1}`, x + width / 2, y + height + 28); ctx.textAlign = 'left';
    }
  });
}

function drawVideoPokerMenu(ctx, scene) {
  const modes = [
    { stake: 10, title: 'J或更好', text: '单手换牌 · 有奖后可翻牌比大小', color: '#82d5d0', card: { rank: 'J', suit: 'H' } },
    { stake: 30, title: '狂野的2', text: '所有2都是万能牌 · 三条开始返奖', color: '#f2b5d4', card: { rank: '2', suit: 'D' } },
    { stake: 50, title: '五手扑克', text: '一次保留 · 独立完成五手 · 每手10币', color: '#f3c969', card: { rank: 'A', suit: 'S' } }
  ];
  modes.forEach((mode, index) => {
    const x = 72 + index * 358; const y = 270; roundedRect(ctx, x, y, 330, 405, 12); ctx.fillStyle = 'rgba(8,17,19,0.92)'; ctx.fill();
    ctx.strokeStyle = mode.color; ctx.lineWidth = 2; ctx.stroke(); drawPlayingCard(ctx, mode.card, x + 105, y + 36, 120, 166);
    ctx.fillStyle = mode.color; ctx.font = '800 30px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(mode.title, x + 165, y + 244, 290);
    ctx.fillStyle = '#f7f3ea'; ctx.font = '800 40px Arial, sans-serif'; ctx.fillText(`${mode.stake}`, x + 165, y + 298); ctx.fillStyle = '#aeb8b5'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText('游戏币 / 局', x + 165, y + 325);
    ctx.fillStyle = '#d3d9d6'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(mode.text, x + 165, y + 365, 290); ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#f3c969'; ctx.font = '800 20px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`渐进Jackpot · ${videoPokerNumber(scene.jackpot)} 游戏币`, 600, 731); ctx.textAlign = 'left';
}

function drawVideoPokerStats(ctx, scene) {
  const stats = scene.stats || {}; const metrics = [
    ['累计牌局', stats.plays, '#f3c969'], ['完成手数', stats.hands, '#cfd7d4'], ['中奖手数', stats.handsWon, '#82d5d0'],
    ['累计投入', stats.wagered, '#ef8d7f'], ['累计实收', stats.won, '#82d5d0'], ['净收益', `${stats.profit >= 0 ? '+' : ''}${stats.profit || 0}`, stats.profit >= 0 ? '#82d5d0' : '#ef8d7f'],
    ['单局最高', stats.bestPayout, '#f3c969'], ['最佳牌型', stats.bestHand || '尚无记录', '#f2b5d4'], ['翻牌猜中', stats.highLowWins, '#82d5d0'],
    ['最长连中', `${stats.bestStreak || 0}/13`, '#f3c969'], ['复活次数', stats.revives, '#9bb7d4'], ['Jackpot', `${stats.jackpots || 0}次 / ${stats.jackpotWon || 0}币`, '#f2b5d4']
  ];
  metrics.forEach((item, index) => {
    const x = 72 + (index % 3) * 358; const y = 272 + Math.floor(index / 3) * 112;
    roundedRect(ctx, x, y, 330, 94, 8); ctx.fillStyle = 'rgba(8,17,19,0.91)'; ctx.fill(); ctx.fillStyle = item[2]; ctx.fillRect(x, y, 5, 94);
    ctx.fillStyle = '#aeb8b5'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(item[0], x + 22, y + 29, 286);
    ctx.fillStyle = item[2]; ctx.font = '800 27px "Microsoft YaHei", sans-serif'; ctx.fillText(String(item[1] == null ? 0 : item[1]), x + 22, y + 68, 286);
  });
  roundedRect(ctx, 72, 728, 1046, 40, 20); ctx.fillStyle = 'rgba(243,201,105,0.12)'; ctx.fill();
  ctx.fillStyle = '#f3c969'; ctx.font = '800 18px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`当前Jackpot ${videoPokerNumber(scene.jackpot)} 游戏币`, 600, 754); ctx.textAlign = 'left';
}

function drawVideoPokerFiveHands(ctx, scene) {
  scene.hands.forEach((hand, index) => {
    const y = 258 + index * 90; roundedRect(ctx, 72, y, 1046, 80, 8); ctx.fillStyle = index % 2 ? 'rgba(8,17,19,0.88)' : 'rgba(19,37,39,0.90)'; ctx.fill();
    ctx.fillStyle = '#f3c969'; ctx.font = '800 17px Arial, sans-serif'; ctx.fillText(`HAND ${index + 1}`, 92, y + 32);
    ctx.fillStyle = '#aeb8b5'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText('每手10币', 92, y + 56);
    const width = 48; const gap = 10; hand.forEach((card, cardIndex) => drawPlayingCard(ctx, card, 225 + cardIndex * (width + gap), y + 7, width, 66));
    ctx.fillStyle = scene.handPayouts[index] > 0 ? '#82d5d0' : '#aeb8b5'; ctx.font = '800 18px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.handNames[index] || '未成牌', 550, y + 32, 290);
    ctx.textAlign = 'right'; ctx.fillStyle = scene.handPayouts[index] > 0 ? '#f3c969' : '#77827f'; ctx.font = '800 24px "Microsoft YaHei", Arial, sans-serif'; ctx.fillText(`${videoPokerNumber(scene.handPayouts[index] || 0)}币`, 1090, y + 49); ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#f7f3ea'; ctx.font = '800 24px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`五手合计 ${videoPokerNumber(scene.totalPayout)} · 实际入账 ${scene.finalPayout}`, 600, 750); ctx.textAlign = 'left';
}

function drawVideoPokerSingleHand(ctx, scene) {
  const cards = scene.mode === 'deal' ? scene.initialHand : (scene.hand.length ? scene.hand : scene.initialHand);
  ctx.fillStyle = '#c4cfcc'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(scene.mode === 'deal' ? '选择保留牌位后一次性换牌' : `最终牌型 · ${scene.handNames[0] || '未成牌'}`, 600, 286); ctx.textAlign = 'left';
  drawVideoPokerCardRow(ctx, cards, scene.held, 304, false);
  roundedRect(ctx, 152, 555, 896, 138, 10); ctx.fillStyle = 'rgba(8,17,19,0.92)'; ctx.fill();
  ctx.textAlign = 'center';
  if (scene.mode === 'deal') {
    ctx.fillStyle = '#f3c969'; ctx.font = '800 30px "Microsoft YaHei", sans-serif'; ctx.fillText(`已下注 ${scene.stake} 游戏币`, 600, 602);
    ctx.fillStyle = '#c4cfcc'; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.fillText('保留指定牌位，或换掉指定牌位', 600, 642);
  } else {
    const pending = scene.phase === 'offer'; ctx.fillStyle = scene.totalPayout > 0 ? '#82d5d0' : '#ef8d7f'; ctx.font = '800 30px "Microsoft YaHei", sans-serif';
    ctx.fillText(scene.totalPayout > 0 ? `牌面奖金 ${videoPokerNumber(scene.totalPayout)}` : '没有形成返奖牌型', 600, 599);
    ctx.fillStyle = pending ? '#f3c969' : '#c4cfcc'; ctx.font = '17px "Microsoft YaHei", sans-serif';
    ctx.fillText(pending ? '奖金尚未入账 · 收下或翻牌挑战' : `实际入账 ${scene.finalPayout} · 当前余额 ${scene.balance}`, 600, 641);
    if (scene.jackpotAward) { ctx.fillStyle = '#f2b5d4'; ctx.font = '800 18px "Microsoft YaHei", sans-serif'; ctx.fillText(`Jackpot追加 ${scene.jackpotAward} 游戏币`, 600, 673); }
  }
  ctx.textAlign = 'left';
}

function drawVideoPokerGamble(ctx, scene) {
  const left = scene.previousCard || scene.anchorCard; const right = scene.drawnCard || { hidden: true };
  roundedRect(ctx, 110, 260, 980, 470, 12); ctx.fillStyle = 'rgba(8,17,19,0.93)'; ctx.fill();
  drawPlayingCard(ctx, left, 320, 314, 160, 220); drawPlayingCard(ctx, right, 720, 314, 160, 220);
  ctx.textAlign = 'center'; ctx.fillStyle = '#c4cfcc'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.previousCard ? '上张基准牌' : '当前基准牌', 400, 566); ctx.fillText(scene.drawnCard ? '本次翻牌' : '等待下一张', 800, 566);
  ctx.fillStyle = scene.correct === true ? '#82d5d0' : scene.correct === false ? '#ef8d7f' : '#f3c969'; ctx.font = '800 46px Arial, sans-serif';
  ctx.fillText(scene.correct === true ? '✓' : scene.correct === false ? '×' : '?', 600, 435);
  ctx.font = '800 18px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.guess || '比大 / 比小', 600, 474);
  roundedRect(ctx, 230, 606, 740, 82, 8); ctx.fillStyle = scene.mode === 'revive' ? 'rgba(99,31,43,0.82)' : 'rgba(23,77,70,0.78)'; ctx.fill();
  ctx.fillStyle = '#f7f3ea'; ctx.font = '800 26px "Microsoft YaHei", sans-serif'; ctx.fillText(`待领 ${videoPokerNumber(scene.pendingPrize)}  ·  连中 ${scene.streak}/13`, 600, 640);
  ctx.fillStyle = scene.mode === 'revive' ? '#f2b5d4' : '#c4cfcc'; ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.fillText(scene.mode === 'revive' ? `额外支付 ${videoPokerNumber(scene.reviveCost)} 游戏币 · 待领奖金不变` : '猜中倍率 ×1.3 · 相同点数也算失败', 600, 671); ctx.textAlign = 'left';
  roundedRect(ctx, 300, 740, 600, 30, 15); ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();
  if (scene.streak > 0) { roundedRect(ctx, 300, 740, 600 * scene.streak / 13, 30, 15); ctx.fillStyle = '#f3c969'; ctx.fill(); }
  ctx.fillStyle = '#172124'; ctx.font = '800 13px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${scene.streak} / 13`, 600, 760); ctx.textAlign = 'left';
}

function drawVideoPokerScene(ctx, view) {
  const scene = view.videoPokerScene; drawSceneHeader(ctx, view, '#f3c969'); drawVideoPokerPaytable(ctx, scene);
  if (scene.mode === 'menu') drawVideoPokerMenu(ctx, scene);
  else if (scene.mode === 'stats') drawVideoPokerStats(ctx, scene);
  else if (scene.mode === 'gamble' || scene.mode === 'revive') drawVideoPokerGamble(ctx, scene);
  else if (scene.stake === 50 && scene.hands.length) drawVideoPokerFiveHands(ctx, scene);
  else drawVideoPokerSingleHand(ctx, scene);
  drawVideoPokerFooter(ctx, view, scene);
}

function dmdSuitVisual(suit) {
  const visuals = {
    M: { short: '美', color: '#e98fa9' }, T: { short: '图', color: '#dcb45d' }, D: { short: '刀', color: '#d85a61' },
    G: { short: '钩', color: '#65c4b5' }, C: { short: '锚', color: '#91a3ad' }, Y: { short: '钥', color: '#f0cf64' },
    B: { short: '箱', color: '#c8925e' }, H: { short: '怪', color: '#9b82d6' }, P: { short: '炮', color: '#ef775f' }, Z: { short: '球', color: '#72a9df' }
  };
  return visuals[suit] || visuals.M;
}

function drawDmdCard(ctx, card, x, y, width, height, emphasized) {
  const visual = dmdSuitVisual(card.suit); ctx.save();
  if (emphasized) { ctx.shadowColor = visual.color; ctx.shadowBlur = 15; }
  roundedRect(ctx, x, y, width, height, 8); ctx.fillStyle = '#f2ead8'; ctx.fill();
  ctx.strokeStyle = visual.color; ctx.lineWidth = emphasized ? 4 : 2.5; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = visual.color; ctx.fillRect(x + 5, y + 5, width - 10, 20);
  ctx.fillStyle = '#172326'; ctx.font = `700 ${Math.max(11, Math.floor(width * 0.18))}px "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(card.name || card.suit, x + width / 2, y + 20, width - 10);
  ctx.fillStyle = visual.color; ctx.font = `700 ${Math.max(25, Math.floor(width * 0.48))}px "Microsoft YaHei", sans-serif`;
  ctx.fillText(visual.short, x + width / 2, y + height * 0.58, width - 12);
  ctx.fillStyle = '#263336'; ctx.font = `700 ${Math.max(18, Math.floor(width * 0.3))}px Georgia, serif`; ctx.fillText(String(card.value || '?'), x + width / 2, y + height - 12);
  ctx.fillStyle = '#746b5b'; ctx.font = '10px Arial'; ctx.textAlign = 'left'; ctx.fillText(card.code || `${card.suit}${card.value}`, x + 7, y + height - 7, width - 12); ctx.restore();
}

function drawDmdPile(ctx, x, y, count, label, discarded) {
  for (let layer = 2; layer >= 0; layer--) {
    roundedRect(ctx, x - layer * 3, y - layer * 3, 76, 108, 8);
    ctx.fillStyle = discarded ? 'rgba(71,62,57,0.95)' : '#17353b'; ctx.fill(); ctx.strokeStyle = discarded ? '#9b8272' : '#d6b85f'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (!discarded) {
    roundedRect(ctx, x + 8, y + 8, 60, 92, 5); ctx.strokeStyle = 'rgba(214,184,95,0.52)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#d6b85f'; ctx.font = '700 16px Arial'; ctx.textAlign = 'center'; ctx.fillText('DMD', x + 38, y + 58);
  } else {
    ctx.fillStyle = '#ad9a8e'; ctx.font = '700 29px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('弃', x + 38, y + 65);
  }
  ctx.fillStyle = '#f2eee4'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.fillText(`${label} ${Math.floor(count)}`, x + 38, y + 132); ctx.textAlign = 'left';
}

function dmdSeatPositions(count) {
  const positions = {
    top: { x: 600, y: 158 }, upperLeft: { x: 230, y: 174 }, upperRight: { x: 970, y: 174 },
    middleLeft: { x: 170, y: 475 }, middleRight: { x: 1030, y: 475 },
    lowerLeft: { x: 245, y: 714 }, lowerRight: { x: 955, y: 714 }, bottom: { x: 600, y: 742 }
  };
  if (count <= 2) return [positions.top, positions.bottom];
  if (count === 3) return [positions.top, positions.lowerRight, positions.lowerLeft];
  if (count === 4) return [positions.upperLeft, positions.upperRight, positions.lowerRight, positions.lowerLeft];
  if (count === 5) return [positions.top, positions.middleRight, positions.lowerRight, positions.lowerLeft, positions.middleLeft];
  return [positions.top, positions.middleRight, positions.lowerRight, positions.lowerLeft, positions.middleLeft, positions.bottom];
}

function drawDmdSeat(ctx, player, position) {
  const width = 270; const height = 128; const x = position.x - width / 2; const y = position.y - height / 2;
  const accent = player.isTurn ? '#f2cf68' : player.isBot ? '#72c9bd' : player.isGuest ? '#c6ad70' : '#e98fa9';
  ctx.save(); if (player.isTurn) { ctx.shadowColor = 'rgba(242,207,104,0.70)'; ctx.shadowBlur = 18; }
  roundedRect(ctx, x, y, width, height, 11); ctx.fillStyle = 'rgba(10,18,20,0.96)'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = player.isTurn ? 3 : 1.5; ctx.stroke(); ctx.restore();
  ctx.fillStyle = accent; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(player.isGuest ? `${player.name} · 游客` : player.name, x + 13, y + 24, 125);
  ctx.textAlign = 'right'; ctx.fillStyle = player.rank === 1 ? '#f2cf68' : '#a9b4b1'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(player.status || '等待', x + width - 12, y + 23, 122); ctx.textAlign = 'left';
  ctx.fillStyle = '#f5f1e8'; ctx.font = '700 25px "Microsoft YaHei", sans-serif'; ctx.fillText(`${Math.floor(player.score)} 分`, x + 13, y + 57);
  ctx.textAlign = 'right'; ctx.fillStyle = '#c4cfcc'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(`${player.collectedTypes}/10 花色`, x + width - 12, y + 52); ctx.textAlign = 'left';
  const collection = player.collection.length ? player.collection : Array.from({ length: 10 }, (_, index) => ({ suit: ['M', 'T', 'D', 'G', 'C', 'Y', 'B', 'H', 'P', 'Z'][index], value: 0 }));
  collection.slice(0, 10).forEach((item, index) => {
    const boxX = x + 13 + index * 24; const visual = dmdSuitVisual(item.suit);
    roundedRect(ctx, boxX, y + 68, 20, 25, 4); ctx.fillStyle = item.value > 0 ? visual.color : 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.fillStyle = item.value > 0 ? '#142124' : '#74807d'; ctx.font = '700 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(item.value > 0 ? String(item.value) : visual.short, boxX + 10, y + 85); ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#9aa6a3'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(`大满贯 ${Math.floor(player.grandSlams)}`, x + 13, y + 116);
  if (player.rank > 0) {
    ctx.textAlign = 'right'; ctx.fillStyle = player.isGuest ? '#c6ad70' : player.affectionDelta >= 0 ? '#72c9bd' : '#ef806f';
    ctx.fillText(player.isGuest ? '游客 · 不计档案' : `${player.affectionDelta >= 0 ? '+' : ''}${Math.floor(player.affectionDelta)}好感${player.coinReward ? ` · +${Math.floor(player.coinReward)}币` : ''}`, x + width - 12, y + 116, 150); ctx.textAlign = 'left';
  }
}

function drawDmdTable(ctx, view) {
  const table = view.dmdTable; drawSceneHeader(ctx, view, '#f2cf68');
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.68)'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.ellipse(600, 442, 500, 280, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(29,70,58,0.97)'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.ellipse(600, 442, 500, 280, 0, 0, Math.PI * 2); ctx.strokeStyle = '#704b31'; ctx.lineWidth = 18; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(600, 442, 476, 256, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(242,207,104,0.36)'; ctx.lineWidth = 2; ctx.stroke();
  drawDmdPile(ctx, 118, 333, table.deckCount, '牌库', false); drawDmdPile(ctx, 1006, 333, table.discardCount, '弃牌', true);

  ctx.textAlign = 'center'; ctx.fillStyle = '#c4d0cc'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(table.status === 'finished' ? '本局已经结算' : table.status === 'waiting' ? '等待房主开始' : table.status === 'menu' ? '十花色甲板示例' : `当前行动 · ${table.currentName || '等待'}`, 600, 231);
  const uniqueSuits = new Set(table.board.map((card) => card.suit)).size;
  ctx.fillStyle = uniqueSuits >= 8 ? '#f2cf68' : '#f1eee6'; ctx.font = '700 24px "Microsoft YaHei", sans-serif'; ctx.fillText(`甲板 ${table.board.length} 张 · ${uniqueSuits}/10 花色`, 600, 260);
  if (table.forcedDraws > 0) { roundedRect(ctx, 485, 270, 230, 28, 14); ctx.fillStyle = '#8f2f39'; ctx.fill(); ctx.fillStyle = '#ffe0d7'; ctx.font = '700 13px "Microsoft YaHei", sans-serif'; ctx.fillText(`海怪强制再抽 ${table.forcedDraws} 张`, 600, 289); }

  const count = Math.max(1, table.board.length); const cardWidth = count > 8 ? 62 : count > 6 ? 70 : 78; const cardHeight = cardWidth * 1.42; const gap = count > 8 ? 7 : 10;
  const boardWidth = table.board.length ? table.board.length * cardWidth + (table.board.length - 1) * gap : 10 * 52 + 9 * 8;
  const boardX = 600 - boardWidth / 2; const boardY = 306;
  if (table.board.length) table.board.forEach((card, index) => drawDmdCard(ctx, card, boardX + index * (cardWidth + gap), boardY, cardWidth, cardHeight, index === table.board.length - 1));
  else {
    ['M', 'T', 'D', 'G', 'C', 'Y', 'B', 'H', 'P', 'Z'].forEach((suit, index) => {
      roundedRect(ctx, boardX + index * 60, boardY + 18, 52, 74, 6); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill(); ctx.strokeStyle = `${dmdSuitVisual(suit).color}66`; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(dmdSuitVisual(suit).short, boardX + index * 60 + 26, boardY + 61);
    });
  }

  if (table.pending) {
    roundedRect(ctx, 302, 446, 596, 154, 12); ctx.fillStyle = 'rgba(57,18,25,0.95)'; ctx.fill(); ctx.strokeStyle = '#ef806f'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = '#ffd9cf'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(`强制效果 · ${table.pending.name}`, 600, 474);
    ctx.fillStyle = '#e9beb6'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText('存在合法目标，必须选择并执行后才能继续', 600, 496);
    table.pending.options.slice(0, 10).forEach((option, index) => {
      const column = index % 5; const row = Math.floor(index / 5); const x = 326 + column * 111; const y = 510 + row * 36;
      roundedRect(ctx, x, y, 101, 29, 5); ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fill(); ctx.strokeStyle = dmdSuitVisual(option.suit).color; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#f4eee5'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(`${option.index}.${option.playerName ? `${option.playerName}:` : ''}${option.code}`, x + 50, y + 20, 92);
    });
    ctx.fillStyle = '#e9beb6'; ctx.font = '12px "Microsoft YaHei", sans-serif';
    const pendingTip = table.pending.options.length > 10
      ? `另有 ${table.pending.options.length - 10} 个目标 · 发送：.yan 神抽 使用 ${table.pending.name} [序号/牌ID] [目标]`
      : `发送：.yan 神抽 使用 ${table.pending.name} [序号/牌ID] [目标]`;
    ctx.fillText(pendingTip, 600, 592, 555);
  } else {
    roundedRect(ctx, 330, 452, 540, 68, 10); ctx.fillStyle = 'rgba(5,16,17,0.80)'; ctx.fill();
    ctx.fillStyle = '#e8eeeb'; ctx.font = '15px "Microsoft YaHei", sans-serif'; const rows = wrapLine(ctx, table.lastAction || '等待行动。', 500).slice(0, 2);
    rows.forEach((line, index) => ctx.fillText(line, 600, 480 + index * 21, 500));
    roundedRect(ctx, 420, 536, 360, 36, 18); ctx.fillStyle = 'rgba(113,71,39,0.90)'; ctx.fill(); ctx.fillStyle = '#fff0bf'; ctx.font = '700 14px "Microsoft YaHei", sans-serif';
    const instruction = table.status === 'finished' ? '结算完成 · 清理后可开始下一局' : table.status === 'waiting' ? '添加玩家或机器人后由房主开始' : table.status === 'menu' ? '选择人机或创建多人房间' : '发送：.yan 神抽 抽牌  或  .yan 神抽 收手';
    ctx.fillText(instruction, 600, 560, 335);
  }

  if (table.status === 'menu' && table.help.length) {
    table.help.forEach((command, index) => {
      const column = index % 3; const row = Math.floor(index / 3); const x = 222 + column * 254; const y = 592 + row * 38;
      roundedRect(ctx, x, y, 234, 29, 6); ctx.fillStyle = 'rgba(5,18,19,0.88)'; ctx.fill(); ctx.fillStyle = index === 0 ? '#f2cf68' : '#d7e0dd'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(command, x + 117, y + 20, 218);
    });
  }
  ctx.textAlign = 'left';
  const positions = dmdSeatPositions(table.players.length); table.players.forEach((player, index) => drawDmdSeat(ctx, player, positions[index]));
  ctx.fillStyle = 'rgba(255,255,255,0.68)'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(view.quote || '同花色第二张会引爆甲板，船锚可保护之前的牌', 600, 873, 1080); ctx.textAlign = 'left';
}

function farkleSeatPositions(count) {
  const positions = {
    top: { x: 600, y: 154 }, upperLeft: { x: 245, y: 175 }, upperRight: { x: 955, y: 175 },
    middleLeft: { x: 190, y: 436 }, middleRight: { x: 1010, y: 436 },
    lowerLeft: { x: 245, y: 710 }, lowerRight: { x: 955, y: 710 }, bottom: { x: 600, y: 735 }
  };
  if (count <= 2) return [positions.top, positions.bottom];
  if (count === 3) return [positions.top, positions.lowerRight, positions.lowerLeft];
  if (count === 4) return [positions.upperLeft, positions.upperRight, positions.lowerRight, positions.lowerLeft];
  if (count === 5) return [positions.top, positions.middleRight, positions.lowerRight, positions.lowerLeft, positions.middleLeft];
  return [positions.top, positions.middleRight, positions.lowerRight, positions.lowerLeft, positions.middleLeft, positions.bottom];
}

function drawFarkleDie(ctx, value, x, y, size, active) {
  ctx.save();
  if (active) { ctx.shadowColor = 'rgba(255,214,110,0.75)'; ctx.shadowBlur = 16; }
  roundedRect(ctx, x, y, size, size, 14);
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, '#fffaf0'); gradient.addColorStop(1, '#d9d5cb'); ctx.fillStyle = gradient; ctx.fill();
  ctx.strokeStyle = active ? '#ffd66e' : 'rgba(32,42,44,0.70)'; ctx.lineWidth = active ? 4 : 2; ctx.stroke();
  ctx.shadowBlur = 0;
  const pipMap = {
    1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]]
  };
  ctx.fillStyle = value === 1 || value === 5 ? '#b92e3d' : '#17272a';
  (pipMap[value] || pipMap[1]).forEach((pip) => {
    ctx.beginPath(); ctx.arc(x + size * pip[0], y + size * pip[1], size * 0.075, 0, Math.PI * 2); ctx.fill();
  });
  ctx.restore();
}

function drawFarkleGhostDie(ctx, x, y, size, enabled) {
  roundedRect(ctx, x, y, size, size, 14); ctx.fillStyle = enabled ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'; ctx.fill();
  ctx.strokeStyle = enabled ? 'rgba(255,214,110,0.48)' : 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]);
}

function farkleTurnText(turn) {
  if (!turn) return '';
  if (turn.farkled) return `${turn.name} 上一轮 Farkle，${Math.floor(turn.lostScore)} 分暂存归零 · 总分 ${Math.floor(turn.total)}`;
  return `${turn.name} 上一轮入账 +${Math.floor(turn.gained)} 分 · 总分 ${Math.floor(turn.total)}`;
}

function drawFarkleSeat(ctx, player, position, target) {
  const width = 246; const height = 100; const x = position.x - width / 2; const y = position.y - height / 2;
  const color = player.isTurn ? '#ffd66e' : player.isBot ? '#82d5d0' : player.isGuest ? '#c6ad70' : '#ef8d7f';
  ctx.save(); if (player.isTurn) { ctx.shadowColor = 'rgba(255,214,110,0.65)'; ctx.shadowBlur = 19; }
  roundedRect(ctx, x, y, width, height, 12); ctx.fillStyle = 'rgba(10,20,22,0.95)'; ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = player.isTurn ? 3 : 1.5; ctx.stroke(); ctx.restore();
  ctx.fillStyle = color; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(player.isGuest ? `${player.name} · 游客` : player.name, x + 14, y + 25, 126);
  ctx.textAlign = 'right'; ctx.fillStyle = player.rank === 1 ? '#ffd66e' : '#aebbb8'; ctx.font = '13px "Microsoft YaHei", sans-serif';
  ctx.fillText(player.status || '等待', x + width - 13, y + 24, 92); ctx.textAlign = 'left';
  ctx.fillStyle = '#f4f1e9'; ctx.font = '700 24px "Microsoft YaHei", sans-serif'; ctx.fillText(`${Math.floor(player.score)} 分`, x + 14, y + 56, 120);
  ctx.fillStyle = player.turnScore > 0 ? '#ffd66e' : '#9ca8a5'; ctx.font = '14px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'right'; ctx.fillText(`暂存 +${Math.floor(player.turnScore)}`, x + width - 14, y + 52, 98); ctx.textAlign = 'left';
  roundedRect(ctx, x + 14, y + 68, width - 28, 10, 5); ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fill();
  const ratio = Math.max(0, Math.min(1, player.score / target)); const progressWidth = (width - 28) * ratio;
  if (progressWidth > 0) { roundedRect(ctx, x + 14, y + 68, progressWidth, 10, 5); ctx.fillStyle = color; ctx.fill(); }
  ctx.fillStyle = '#9da9a6'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(`最佳回合 ${Math.floor(player.bestTurn)}`, x + 14, y + 94);
  if (player.rank > 0) {
    ctx.textAlign = 'right'; ctx.fillStyle = player.isGuest ? '#c6ad70' : player.affectionDelta >= 0 ? '#82d5d0' : '#ef8d7f';
    ctx.fillText(player.isGuest ? '游客 · 不计档案' : `${player.affectionDelta >= 0 ? '+' : ''}${Math.floor(player.affectionDelta)}好感${player.coinReward ? ` · +${Math.floor(player.coinReward)}币` : ''}`, x + width - 14, y + 94, 135); ctx.textAlign = 'left';
  }
}

function drawFarkleTable(ctx, view) {
  const table = view.farkleTable; drawSceneHeader(ctx, view, '#ffd66e');
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.68)'; ctx.shadowBlur = 30;
  ctx.beginPath(); ctx.ellipse(600, 438, 485, 274, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(32,69,61,0.96)'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.ellipse(600, 438, 485, 274, 0, 0, Math.PI * 2); ctx.strokeStyle = '#684b32'; ctx.lineWidth = 18; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(600, 438, 462, 251, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,214,110,0.38)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(600, 438, 348, 177, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fill();

  ctx.textAlign = 'center'; ctx.fillStyle = '#cbd7d3'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText('胜利目标', 600, 228);
  ctx.fillStyle = '#ffd66e'; ctx.font = '700 31px "Microsoft YaHei", sans-serif'; ctx.fillText(`${Math.floor(table.target)} 分`, 600, 261);
  roundedRect(ctx, 455, 276, 290, 42, 21); ctx.fillStyle = 'rgba(7,18,19,0.78)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,214,110,0.46)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#f5f1e8'; ctx.font = '700 16px "Microsoft YaHei", sans-serif'; ctx.fillText(table.phaseLabel || '等待行动', 600, 303, 260);

  const dieSize = 82; const dieGap = 17; const totalWidth = 6 * dieSize + 5 * dieGap; const diceStart = 600 - totalWidth / 2;
  if (table.status === 'finished') {
    const winner = table.players.find((player) => player.rank === 1);
    ctx.fillStyle = '#ffd66e'; ctx.font = '700 35px "Microsoft YaHei", sans-serif'; ctx.fillText('本局结算', 600, 377);
    ctx.fillStyle = '#f4f1e9'; ctx.font = '700 24px "Microsoft YaHei", sans-serif'; ctx.fillText(winner ? `${winner.name} 获得第一名` : '排名已经生成', 600, 417, 560);
  } else {
    for (let index = 0; index < 6; index++) {
      const x = diceStart + index * (dieSize + dieGap);
      if (table.dice[index]) drawFarkleDie(ctx, table.dice[index], x, 345, dieSize, table.phase === 'rolled' && !table.diceReview);
      else drawFarkleGhostDie(ctx, x, 345, dieSize, index < table.remaining);
    }
    ctx.fillStyle = table.diceReview ? '#ef8d7f' : table.phase === 'rolled' ? '#ffd66e' : '#bac8c4'; ctx.font = '14px "Microsoft YaHei", sans-serif';
    const diceCaption = table.diceReview && table.reviewTurn ? `${table.reviewTurn.name} 上一轮爆骰回看 · ${Math.floor(table.reviewTurn.lostScore)} 分暂存归零` : table.phase === 'rolled' ? `本次 ${table.dice.length} 枚 · 推荐组合最高 ${Math.floor(table.suggestedScore)} 分` : `下次可投 ${table.remaining} 枚骰子`;
    ctx.fillText(diceCaption, 600, 450);
  }

  roundedRect(ctx, 330, 470, 540, 68, 10); ctx.fillStyle = 'rgba(5,16,17,0.78)'; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#e9eeeb'; ctx.font = '16px "Microsoft YaHei", sans-serif';
  const actionRows = wrapLine(ctx, table.lastAction || '六枚骰子已经放上桌。', 500).slice(0, table.lastBotTurn ? 1 : 2);
  actionRows.forEach((line, index) => ctx.fillText(line, 600, 497 + index * 22, 500));
  if (table.lastBotTurn) {
    ctx.fillStyle = table.lastBotTurn.farkled ? '#ef8d7f' : '#82d5d0'; ctx.font = '700 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(farkleTurnText(table.lastBotTurn), 600, 522, 500);
  }

  let instruction = '发送：.快艇 投掷';
  if (table.status === 'waiting') instruction = '房主可添加机器人或等待玩家加入，然后发送“开始”';
  else if (table.status === 'finished') instruction = '结算已完成，可清理房间后开始下一局';
  else if (table.phase === 'rolled') instruction = '发送：.快艇 选择 1,1,5';
  else if (table.phase === 'kept') instruction = '发送：.快艇 投掷  或  .快艇 存分';
  roundedRect(ctx, 397, 555, 406, 38, 19); ctx.fillStyle = 'rgba(121,72,39,0.86)'; ctx.fill();
  ctx.fillStyle = '#fff1c4'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.fillText(instruction, 600, 580, 380);

  if (table.status === 'menu' && table.help.length) {
    table.help.forEach((command, index) => {
      const column = index % 3; const row = Math.floor(index / 3); const x = 224 + column * 252; const y = 608 + row * 40;
      roundedRect(ctx, x, y, 232, 31, 7); ctx.fillStyle = 'rgba(7,20,21,0.86)'; ctx.fill();
      ctx.fillStyle = index === 0 ? '#ffd66e' : '#d5dfdc'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(command, x + 116, y + 21, 214);
    });
  }
  ctx.textAlign = 'left';

  const positions = farkleSeatPositions(table.players.length);
  table.players.forEach((player, index) => drawFarkleSeat(ctx, player, positions[index], table.target));
  ctx.fillStyle = 'rgba(255,255,255,0.68)'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(view.quote || '选择计分骰后，可继续冒险或立即存分', 600, 873, 1080); ctx.textAlign = 'left';
}

function drawLoveFingerHeart(ctx, centerX, centerY, size) {
  const scale = Math.max(0.45, size / 64);
  ctx.save(); ctx.translate(centerX, centerY); ctx.scale(scale, scale); ctx.translate(-7, -7);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 4.5;
  ctx.strokeStyle = '#fffdf7'; ctx.fillStyle = 'rgba(255,255,255,0.13)';

  ctx.beginPath();
  ctx.moveTo(-13, 7); ctx.bezierCurveTo(-20, 12, -18, 24, -8, 29);
  ctx.bezierCurveTo(0, 33, 12, 29, 16, 20); ctx.bezierCurveTo(19, 13, 17, 5, 12, 0);
  ctx.lineTo(5, 8); ctx.lineTo(-4, 1); ctx.closePath(); ctx.fill(); ctx.stroke();

  ctx.beginPath(); ctx.moveTo(-11, 15); ctx.lineTo(1, -13); ctx.bezierCurveTo(3, -18, 10, -17, 11, -12); ctx.lineTo(12, -5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(-4, -2); ctx.bezierCurveTo(-8, -6, -14, -2, -12, 3); ctx.lineTo(-8, 9); ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(17, -12); ctx.bezierCurveTo(9, -19, 0, -10, 17, 3);
  ctx.bezierCurveTo(34, -10, 25, -19, 17, -12); ctx.closePath();
  ctx.fillStyle = '#ffd8e9'; ctx.fill(); ctx.strokeStyle = '#fffdf7'; ctx.lineWidth = 2.8; ctx.stroke();
  ctx.restore();
}

function drawLoveCard(ctx, card, x, y, width, height, highlighted) {
  ctx.save();
  if (highlighted) { ctx.shadowColor = 'rgba(255,235,145,0.78)'; ctx.shadowBlur = 18; }
  roundedRect(ctx, x, y, width, height, 8);
  if (!card || card.hidden) {
    const back = ctx.createLinearGradient(x, y, x + width, y + height); back.addColorStop(0, '#253c4a'); back.addColorStop(1, '#17252d');
    ctx.fillStyle = back; ctx.fill(); ctx.strokeStyle = highlighted ? '#ffe58c' : '#8fb4bd'; ctx.lineWidth = highlighted ? 3 : 1.5; ctx.stroke();
    roundedRect(ctx, x + 7, y + 7, width - 14, height - 14, 5); ctx.strokeStyle = 'rgba(229,106,166,0.58)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#f2b0d1'; ctx.font = `700 ${Math.max(17, Math.floor(width * 0.27))}px Arial, sans-serif`; ctx.textAlign = 'center'; ctx.fillText('YAN', x + width / 2, y + height / 2 + 6, width - 14);
    ctx.restore(); return;
  }
  const gradient = ctx.createLinearGradient(x, y, x, y + height); gradient.addColorStop(0, card.color); gradient.addColorStop(1, '#172126');
  ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = highlighted ? '#ffe58c' : 'rgba(255,255,255,0.72)'; ctx.lineWidth = highlighted ? 3 : 1.5; ctx.stroke();
  ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(255,255,255,0.15)'; roundedRect(ctx, x + 6, y + 6, width - 12, 28, 5); ctx.fill();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fffdf7'; ctx.font = `700 ${Math.max(13, Math.floor(width * 0.19))}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
  ctx.fillText(card.name, x + width / 2, y + 26, width - 10);
  if (card.type === 'L') drawLoveFingerHeart(ctx, x + width / 2, y + height * 0.62, Math.min(width * 0.72, height * 0.48));
  else {
    ctx.font = `${Math.max(28, Math.floor(width * 0.48))}px "Segoe UI Emoji", "Noto Color Emoji", "Microsoft YaHei", sans-serif`;
    ctx.fillText(card.emoji || card.name, x + width / 2, y + height * 0.65, width - 8);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.78)'; ctx.font = `700 ${Math.max(11, Math.floor(width * 0.14))}px Arial, sans-serif`;
  ctx.fillText(card.type, x + width / 2, y + height - 10);
  ctx.restore();
}

function drawLoveSeat(ctx, player, x, y, width, accent) {
  ctx.save(); if (player && player.isTurn) { ctx.shadowColor = 'rgba(126,220,157,0.72)'; ctx.shadowBlur = 18; }
  roundedRect(ctx, x, y, width, 112, 8); ctx.fillStyle = 'rgba(9,17,20,0.93)'; ctx.fill();
  ctx.strokeStyle = player && player.isTurn ? '#7edc9d' : player && player.folded ? '#8a7479' : 'rgba(255,255,255,0.22)'; ctx.lineWidth = player && player.isTurn ? 3 : 1.5; ctx.stroke(); ctx.restore();
  if (!player) {
    ctx.fillStyle = '#8e9b99'; ctx.font = '700 19px "Microsoft YaHei", sans-serif'; ctx.fillText('等待玩家入座', x + 18, y + 37); return;
  }
  ctx.fillStyle = player.isTurn ? '#7edc9d' : '#f4f1e9'; ctx.font = '700 21px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  ctx.fillText(player.name, x + 18, y + 32, width - 120);
  if (player.isStarter) { roundedRect(ctx, x + width - 70, y + 13, 50, 24, 12); ctx.fillStyle = 'rgba(126,220,157,0.17)'; ctx.fill(); ctx.fillStyle = '#7edc9d'; ctx.font = '700 12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('先手', x + width - 45, y + 30); ctx.textAlign = 'left'; }
  ctx.fillStyle = '#f3c969'; ctx.font = '700 25px "Microsoft YaHei", sans-serif'; ctx.fillText(`${player.chips} 筹码`, x + 18, y + 66);
  ctx.fillStyle = '#acb7b4'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(`本阶段 ${player.streetBet}  ·  本轮 ${player.committed}  ·  胜轮 ${player.roundsWon}`, x + 18, y + 91, width - 30);
  if (player.declaration) {
    roundedRect(ctx, x + width - 134, y + 51, 114, 42, 7); ctx.fillStyle = 'rgba(229,106,166,0.18)'; ctx.fill(); ctx.strokeStyle = '#e56aa6'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#f4b7d5'; ctx.font = '700 16px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(player.declaration, x + width - 77, y + 69, 104);
    ctx.fillStyle = '#bbc7c3'; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText(player.publicAs ? `公共骗子=${player.publicAs}` : player.declarationLabel || '牌型宣告', x + width - 77, y + 86, 106); ctx.textAlign = 'left';
  } else if (player.revealLocked) {
    roundedRect(ctx, x + width - 114, y + 55, 94, 34, 17); ctx.fillStyle = 'rgba(126,220,157,0.18)'; ctx.fill(); ctx.strokeStyle = '#7edc9d'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#9ce8b5'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('已私下锁定', x + width - 67, y + 77); ctx.textAlign = 'left';
  }
  if (player.isGuest) { ctx.fillStyle = '#d8c17d'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText('游客 · 不结算档案', x + 145, y + 63); }
}

function drawLoveMenu(ctx, view) {
  const table = view.loveTable; drawSceneHeader(ctx, view, '#7edc9d');
  roundedRect(ctx, 54, 116, 1092, 708, 8); ctx.fillStyle = 'rgba(8,18,20,0.86)'; ctx.fill(); ctx.strokeStyle = 'rgba(126,220,157,0.35)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#f4f1e9'; ctx.font = '700 25px "Microsoft YaHei", sans-serif'; ctx.fillText('49张专属牌库', 82, 158);
  const cards = table.cards.length ? table.cards : [];
  cards.forEach((card, index) => {
    const x = 82 + index * 208; drawLoveCard(ctx, card, x, 188, 116, 166, false);
    ctx.fillStyle = '#f4f1e9'; ctx.font = '700 19px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${card.count} 张`, x + 58, 381); ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#7edc9d'; ctx.font = '700 21px "Microsoft YaHei", sans-serif'; ctx.fillText('一轮牌局', 82, 436);
  const steps = [
    ['01', '两张暗牌', '双方各持两张'], ['02', '公共牌', '全桌共享一张'], ['03', '第一轮下注', '跟注到金额一致'],
    ['04', '最终补牌', '手牌增至三张'], ['05', '公开与宣告', '各翻开一张'], ['06', '再下注摊牌', '胜者收走底池']
  ];
  steps.forEach((step, index) => {
    const x = 82 + (index % 3) * 350; const y = 464 + Math.floor(index / 3) * 92;
    roundedRect(ctx, x, y, 326, 72, 7); ctx.fillStyle = 'rgba(255,255,255,0.055)'; ctx.fill();
    ctx.fillStyle = index >= 4 ? '#e56aa6' : '#7edc9d'; ctx.font = '700 20px Arial'; ctx.fillText(step[0], x + 16, y + 29);
    ctx.fillStyle = '#f0eee7'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText(step[1], x + 62, y + 27);
    ctx.fillStyle = '#aeb9b6'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(step[2], x + 62, y + 51);
  });
  table.help.slice(0, 3).forEach((command, index) => {
    const x = 82 + index * 350; roundedRect(ctx, x, 674, 326, 45, 7); ctx.fillStyle = index === 0 ? 'rgba(126,220,157,0.18)' : 'rgba(229,106,166,0.12)'; ctx.fill();
    ctx.strokeStyle = index === 0 ? '#7edc9d' : 'rgba(229,106,166,0.55)'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#f4f1e9'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(command, x + 163, 703, 306); ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#b7c2bf'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(view.quote || '骗子牌能兑现合法宣告，也会在同牌型时反噬持有者', 600, 784, 1020); ctx.textAlign = 'left';
}

function drawLoveTable(ctx, view) {
  const table = view.loveTable;
  if (table.status === 'menu') { drawLoveMenu(ctx, view); return; }
  drawSceneHeader(ctx, view, '#7edc9d');
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.72)'; ctx.shadowBlur = 30; ctx.beginPath(); ctx.ellipse(600, 449, 496, 292, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(24,73,58,0.96)'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.ellipse(600, 449, 496, 292, 0, 0, Math.PI * 2); ctx.strokeStyle = '#765139'; ctx.lineWidth = 20; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(600, 449, 468, 264, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(126,220,157,0.28)'; ctx.lineWidth = 2; ctx.stroke();

  const top = table.players[1] || (table.players.length === 1 ? null : table.players[0]); const bottom = table.players[0] || null;
  drawLoveSeat(ctx, top, 74, 116, 315, '#7edc9d'); drawLoveSeat(ctx, bottom, 811, 657, 315, '#7edc9d');
  const topCards = top ? top.cards : []; const bottomCards = bottom ? bottom.cards : [];
  topCards.forEach((card, index) => drawLoveCard(ctx, card, 430 + index * 84, 114, 74, 106, top.revealedIndex === index));
  bottomCards.forEach((card, index) => drawLoveCard(ctx, card, 468 + index * 84, 653, 74, 106, bottom.revealedIndex === index));

  ctx.textAlign = 'center'; ctx.fillStyle = '#c7d1ce'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText('公共卡牌', 600, 278);
  if (table.common) drawLoveCard(ctx, table.common, 552, 296, 96, 138, true);
  else drawLoveCard(ctx, { hidden: true }, 552, 296, 96, 138, false);
  roundedRect(ctx, 456, 450, 288, 64, 8); ctx.fillStyle = 'rgba(7,17,19,0.82)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#f3c969'; ctx.font = '700 27px "Microsoft YaHei", sans-serif'; ctx.fillText(`底池 ${table.pot + table.carryPot}`, 600, 480);
  ctx.fillStyle = '#aebbb7'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(`当前注 ${table.currentBet} · 第${table.shuffleCount + 1}副 ${table.cycleRound}/7轮 · 余牌 ${table.deckCount}`, 600, 501);

  roundedRect(ctx, 343, 532, 514, 50, 25); ctx.fillStyle = 'rgba(10,20,22,0.88)'; ctx.fill(); ctx.strokeStyle = '#7edc9d'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#f4f1e9'; ctx.font = '700 17px "Microsoft YaHei", sans-serif';
  const actionText = table.status === 'waiting' ? '等待另一位玩家 · 房主开始后发牌' : table.phase === 'reveal' ? '双方分别锁定公开牌与宣告 · 内容暂不展示' : table.phase === 'reveal_confirm' ? '双方均已锁定 · 回群确认后同时公开' : table.phase === 'round_result' ? '本轮牌面已展开 · 确认后发送“下一轮”' : table.status === 'finished' ? '整场已经结算' : `${table.currentName || '玩家'}行动 · ${table.phaseLabel}`;
  ctx.fillText(actionText, 600, 564, 480);

  if (table.result) {
    roundedRect(ctx, 345, 592, 510, 50, 7); ctx.fillStyle = table.result.tie ? 'rgba(255,255,255,0.10)' : 'rgba(229,106,166,0.17)'; ctx.fill();
    ctx.fillStyle = table.result.tie ? '#e3e8e5' : '#f3b6d4'; ctx.font = '700 18px "Microsoft YaHei", sans-serif';
    const resultText = table.result.tie ? `第${table.result.round}轮${table.result.allInShowdown ? '全押' : ''}平局 · ${table.result.pot}筹码带入后续` : `${table.result.winnerName}赢得第${table.result.round}轮${table.result.allInShowdown ? '全押摊牌' : ''} · 底池${table.result.pot}${table.result.penalty ? ` · 骗子罚${table.result.penalty}` : ''}`;
    ctx.fillText(resultText, 600, 624, 480);
  }
  if (table.status === 'finished' && table.ranking.length) {
    table.ranking.forEach((row, index) => {
      const x = 146 + index * 688; roundedRect(ctx, x, 779, 220, 58, 7); ctx.fillStyle = index === 0 && row.rank === 1 ? 'rgba(126,220,157,0.17)' : 'rgba(10,18,20,0.84)'; ctx.fill();
      ctx.fillStyle = index === 0 && row.rank === 1 ? '#7edc9d' : '#d6ddda'; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'left'; ctx.fillText(`#${row.rank} ${row.name}`, x + 13, 801, 125);
      ctx.fillStyle = '#f3c969'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText(`${row.chips}筹码 · ${row.roundsWon}胜轮`, x + 13, 826);
      ctx.textAlign = 'right'; ctx.fillStyle = row.guest ? '#d8c17d' : row.affectionDelta >= 0 ? '#7edc9d' : '#ef8d7f'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(row.guest ? '游客' : `${row.affectionDelta >= 0 ? '+' : ''}${row.affectionDelta}好感`, x + 207, 802); ctx.textAlign = 'left';
    });
  } else {
    const help = table.help.slice(0, 2); help.forEach((command, index) => {
      const x = 100 + index * 550; roundedRect(ctx, x, 788, 500, 38, 7); ctx.fillStyle = 'rgba(8,17,19,0.82)'; ctx.fill(); ctx.fillStyle = index === 0 ? '#7edc9d' : '#f0b4d2'; ctx.font = '700 13px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(command, x + 250, 813, 470); ctx.textAlign = 'left';
    });
  }
  ctx.fillStyle = 'rgba(255,255,255,0.68)'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(view.quote || 'PvE玩家手牌常亮；PvP双方私聊锁定并在群内同时公开', 600, 874, 1080); ctx.textAlign = 'left';
}

function fishRarityColor(rarity) {
  return ['#bdc9c5', '#6fd3c6', '#a98ce6', '#f0bd4c'][Math.max(0, Math.min(3, rarity))];
}

function drawFishIcon(ctx, x, y, scale, color, facingLeft) {
  ctx.save(); ctx.translate(x, y); if (facingLeft) ctx.scale(-1, 1);
  ctx.beginPath(); ctx.ellipse(0, 0, 54 * scale, 27 * scale, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-48 * scale, 0); ctx.lineTo(-82 * scale, -30 * scale); ctx.lineTo(-78 * scale, 30 * scale); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-4 * scale, -20 * scale); ctx.lineTo(15 * scale, -42 * scale); ctx.lineTo(28 * scale, -16 * scale); ctx.closePath();
  ctx.fillStyle = color; ctx.globalAlpha = 0.82; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(30 * scale, -7 * scale, 4 * scale, 0, Math.PI * 2); ctx.fillStyle = '#10292c'; ctx.fill();
  ctx.beginPath(); ctx.arc(31 * scale, -8 * scale, 1.5 * scale, 0, Math.PI * 2); ctx.fillStyle = '#f5f1e8'; ctx.fill();
  ctx.strokeStyle = 'rgba(15,45,48,0.55)'; ctx.lineWidth = Math.max(1, 2 * scale); ctx.beginPath(); ctx.arc(48 * scale, 2 * scale, 11 * scale, Math.PI * 0.65, Math.PI * 1.35); ctx.stroke();
  ctx.restore();
}

function drawFishingPerson(ctx, snapped) {
  ctx.save();
  ctx.fillStyle = 'rgba(13,29,31,0.96)';
  ctx.beginPath(); ctx.ellipse(125, 493, 98, 32, -0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(150, 290, 25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(125, 270); ctx.lineTo(183, 270); ctx.lineTo(169, 253); ctx.lineTo(139, 252); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 24; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(13,29,31,0.96)';
  ctx.beginPath(); ctx.moveTo(151, 320); ctx.lineTo(150, 417); ctx.lineTo(105, 474); ctx.stroke();
  ctx.lineWidth = 15; ctx.beginPath(); ctx.moveTo(154, 344); ctx.lineTo(224, 371); ctx.lineTo(278, 339); ctx.stroke();
  ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(275, 338); ctx.quadraticCurveTo(420, 166, 590, 226); ctx.strokeStyle = '#402f24'; ctx.stroke();
  ctx.setLineDash(snapped ? [12, 11] : []); ctx.lineWidth = 2; ctx.strokeStyle = snapped ? '#ef8d7f' : 'rgba(228,240,234,0.86)';
  ctx.beginPath(); ctx.moveTo(590, 226); ctx.quadraticCurveTo(630, 284, snapped ? 620 : 650, snapped ? 320 : 382); ctx.stroke(); ctx.setLineDash([]);
  if (!snapped) {
    ctx.beginPath(); ctx.ellipse(650, 386, 12, 22, 0, 0, Math.PI * 2); ctx.fillStyle = '#f2f0e7'; ctx.fill();
    ctx.beginPath(); ctx.rect(638, 386, 24, 18); ctx.fillStyle = '#d34d54'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
    for (let ring = 1; ring <= 3; ring++) { ctx.beginPath(); ctx.ellipse(650, 411, ring * 22, ring * 7, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
}

function drawRiskDial(ctx, risk, x, y) {
  const color = risk >= 50 ? '#ef8d7f' : risk >= 30 ? '#f0bd4c' : '#6fd3c6';
  ctx.lineCap = 'round'; ctx.lineWidth = 13; ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath(); ctx.arc(x, y, 60, -Math.PI * 0.75, Math.PI * 0.75); ctx.stroke();
  ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, 60, -Math.PI * 0.75, -Math.PI * 0.75 + Math.PI * 1.5 * risk / 100); ctx.stroke();
  ctx.lineCap = 'butt'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.font = '700 29px "Microsoft YaHei", sans-serif'; ctx.fillText(`${Math.round(risk)}%`, x, y + 7);
  ctx.fillStyle = '#bdc9c5'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText('断线风险', x, y + 36); ctx.textAlign = 'left';
}

function drawFishingMenu(ctx, view) {
  const scene = view.fishingScene; drawSceneHeader(ctx, view, '#82d5d0');
  const colors = [
    { top: '#326e58', water: '#7fc7a2', label: '静水 · 新手' },
    { top: '#27677a', water: '#72bed0', label: '流水 · 进阶' },
    { top: '#244a73', water: '#6299cf', label: '深海 · 高风险' }
  ];
  scene.pondOptions.forEach((option, index) => {
    const x = 70 + index * 365; const y = 145; const width = 330; const height = 620; const palette = colors[index] || colors[0];
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
    roundedRect(ctx, x, y, width, height, 18); ctx.fillStyle = 'rgba(10,24,26,0.90)'; ctx.fill(); ctx.restore();
    roundedRect(ctx, x, y, width, height, 18); ctx.strokeStyle = index === 2 ? '#f0bd4c' : '#82d5d0'; ctx.lineWidth = 2; ctx.stroke();
    roundedRect(ctx, x + 12, y + 12, width - 24, 155, 13); const gradient = ctx.createLinearGradient(x, y, x, y + 170);
    gradient.addColorStop(0, palette.top); gradient.addColorStop(1, palette.water); ctx.fillStyle = gradient; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
    for (let wave = 0; wave < 4; wave++) { ctx.beginPath(); ctx.ellipse(x + 165, y + 118 + wave * 10, 90 - wave * 12, 13, 0, 0, Math.PI * 2); ctx.stroke(); }
    drawFishIcon(ctx, x + 168, y + 87, 0.72, index === 2 ? '#f3ce67' : '#d9f2ea', index % 2 === 1);
    ctx.fillStyle = '#f4f1e9'; ctx.font = '700 31px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(option.name, x + width / 2, y + 216);
    ctx.fillStyle = '#91d8cf'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText(palette.label, x + width / 2, y + 246);
    ctx.fillStyle = '#d9bb63'; ctx.font = '700 27px "Microsoft YaHei", sans-serif'; ctx.fillText(`${Math.floor(option.cost)} 游戏币`, x + width / 2, y + 298);
    ctx.fillStyle = '#b9c7c3'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText(`初始断线风险 ${Math.round(option.risk)}%`, x + width / 2, y + 334);
    roundedRect(ctx, x + 28, y + 365, width - 56, 116, 10); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.fillStyle = '#f4f1e9'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText('代表鱼获', x + width / 2, y + 397);
    ctx.fillStyle = '#b9c7c3'; ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${option.fish[0] || '小鱼'} · ${option.fish[1] || '少见鱼'}`, x + width / 2, y + 428, width - 70);
    ctx.fillStyle = '#f0bd4c'; ctx.fillText(`传说 · ${option.fish[3] || '未知'}`, x + width / 2, y + 459, width - 70);
    ctx.fillStyle = '#82d5d0'; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.fillText(`${Math.floor(option.speciesCount || 16)} 种鱼获 · 图鉴分区`, x + width / 2, y + 505);
    ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText(`最高基础价值 ${Math.floor(option.maxValue)}`, x + width / 2, y + 530);
    roundedRect(ctx, x + 28, y + 550, width - 56, 45, 8); ctx.fillStyle = index === 2 ? '#8d6231' : '#195b59'; ctx.fill();
    ctx.fillStyle = '#f6f1df'; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.fillText(`.yan 钓鱼 ${option.name}`, x + width / 2, y + 579);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = '#dbe6e2'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(view.quote || scene.event, 600, 840, 1080); ctx.textAlign = 'left';
}

function drawFishingScene(ctx, view) {
  const scene = view.fishingScene;
  if (scene.status === 'menu') { drawFishingMenu(ctx, view); return; }
  drawSceneHeader(ctx, view, '#82d5d0');
  const lost = scene.outcome === 'lost' || scene.status === 'lost'; const banked = scene.status === 'banked';
  const tint = scene.pond === '大海' ? 'rgba(19,49,86,0.24)' : scene.pond === '江水' ? 'rgba(16,83,91,0.20)' : 'rgba(37,91,65,0.18)';
  ctx.fillStyle = tint; ctx.fillRect(0, 105, 1200, 795);
  ctx.fillStyle = 'rgba(7,19,21,0.20)'; ctx.fillRect(0, 470, 1200, 430);
  ctx.strokeStyle = 'rgba(176,231,220,0.22)'; ctx.lineWidth = 2;
  for (let wave = 0; wave < 7; wave++) { ctx.beginPath(); ctx.ellipse(585 + (wave % 2) * 45, 420 + wave * 23, 320 - wave * 25, 20, 0, 0, Math.PI * 2); ctx.stroke(); }
  drawFishingPerson(ctx, lost);

  const latest = scene.haul.length ? scene.haul[scene.haul.length - 1] : null;
  if (latest && !lost) {
    const scale = Math.max(0.65, Math.min(1.35, 0.62 + latest.size * 0.12));
    drawFishIcon(ctx, 635, 438, scale, fishRarityColor(latest.rarity), false);
    ctx.fillStyle = fishRarityColor(latest.rarity); ctx.font = '700 19px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${latest.rarityName || '普通'} · ${latest.name}`, 635, 493, 330); ctx.textAlign = 'left';
  } else if (lost) {
    ctx.fillStyle = '#ef8d7f'; ctx.font = '700 28px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('鱼线断裂', 620, 414);
    ctx.fillStyle = '#f4d2cb'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText(`损失 ${scene.lostCount} 条鱼 · ${Math.floor(scene.lostValue)} 币估值`, 620, 447); ctx.textAlign = 'left';
  }

  roundedRect(ctx, 825, 132, 325, 405, 16); ctx.fillStyle = 'rgba(8,22,24,0.90)'; ctx.fill();
  ctx.strokeStyle = 'rgba(130,213,208,0.55)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#82d5d0'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.pond, 852, 169);
  ctx.fillStyle = '#d1dad7'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`入场 ${Math.floor(scene.cost)} 币`, 1122, 169); ctx.textAlign = 'left';
  drawRiskDial(ctx, scene.risk, 987, 259);
  ctx.fillStyle = '#b8c7c3'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText('判断进度', 855, 345);
  for (let step = 1; step <= scene.maxStage; step++) {
    const stepX = 873 + (step - 1) * 55; ctx.beginPath(); ctx.arc(stepX, 375, 13, 0, Math.PI * 2);
    ctx.fillStyle = step <= scene.stage ? '#82d5d0' : 'rgba(255,255,255,0.14)'; ctx.fill();
    ctx.fillStyle = step <= scene.stage ? '#123c3c' : '#9ba6a3'; ctx.font = '700 12px Arial'; ctx.textAlign = 'center'; ctx.fillText(String(step), stepX, 379); ctx.textAlign = 'left';
  }
  roundedRect(ctx, 850, 412, 275, 88, 10); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.fillStyle = '#b8c7c3'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(banked ? '最终到账' : '鱼篓估值', 870, 440);
  const shownValue = banked ? scene.reward : scene.value; ctx.fillStyle = lost ? '#ef8d7f' : '#f0bd4c'; ctx.font = '700 32px "Microsoft YaHei", sans-serif';
  ctx.fillText(`${Math.floor(shownValue)} 币`, 870, 479);

  roundedRect(ctx, 265, 525, 535, 88, 13); ctx.fillStyle = lost ? 'rgba(91,25,31,0.90)' : 'rgba(8,24,25,0.88)'; ctx.fill();
  ctx.strokeStyle = lost ? '#ef8d7f' : 'rgba(130,213,208,0.55)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = lost ? '#ffd6cf' : '#e8eeeb'; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  const eventRows = wrapLine(ctx, scene.event || '水面暂时没有动静。', 490).slice(0, 2); eventRows.forEach((row, index) => ctx.fillText(row, 532, 557 + index * 24, 490)); ctx.textAlign = 'left';
  if (scene.status === 'playing') {
    roundedRect(ctx, 824, 553, 154, 47, 8); ctx.fillStyle = '#8d6231'; ctx.fill(); roundedRect(ctx, 990, 553, 160, 47, 8); ctx.fillStyle = '#195b59'; ctx.fill();
    ctx.fillStyle = '#f5f1e8'; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('继续博弈', 901, 583); ctx.fillText('收杆止盈', 1070, 583); ctx.textAlign = 'left';
  } else if (banked && !lost) {
    ctx.fillStyle = '#82d5d0'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`已安全收杆 · 好感 +${Math.floor(scene.affectionDelta)}`, 986, 579); ctx.textAlign = 'left';
  } else if (banked && lost) {
    ctx.fillStyle = '#ef8d7f'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`鱼获逃脱 · 好感 ${Math.floor(scene.affectionDelta)}`, 986, 579); ctx.textAlign = 'left';
  }

  roundedRect(ctx, 52, 635, 1096, 190, 16); ctx.fillStyle = 'rgba(7,19,21,0.88)'; ctx.fill();
  ctx.fillStyle = '#82d5d0'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText('今日鱼篓', 76, 670);
  const cardWidth = 198; const gap = 16;
  for (let index = 0; index < 5; index++) {
    const fish = scene.haul[index]; const cardX = 72 + index * (cardWidth + gap); const cardY = 687;
    roundedRect(ctx, cardX, cardY, cardWidth, 111, 10); ctx.fillStyle = fish ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.035)'; ctx.fill();
    ctx.strokeStyle = fish ? fishRarityColor(fish.rarity) : 'rgba(255,255,255,0.10)'; ctx.lineWidth = fish ? 2 : 1; ctx.stroke();
    if (fish) {
      drawFishIcon(ctx, cardX + 52, cardY + 41, 0.38, fishRarityColor(fish.rarity), index % 2 === 1);
      ctx.fillStyle = fishRarityColor(fish.rarity); ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.fillText(fish.name, cardX + 91, cardY + 31, 95);
      ctx.fillStyle = '#c4cfcc'; ctx.font = '13px "Microsoft YaHei", sans-serif'; ctx.fillText(`${fish.rarityName} · ${fish.size}kg`, cardX + 91, cardY + 54, 95);
      ctx.fillStyle = '#f0bd4c'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.fillText(`${Math.floor(fish.value)}币`, cardX + 91, cardY + 80, 90);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.19)'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(lost ? '已被卷走' : '空位', cardX + cardWidth / 2, cardY + 63); ctx.textAlign = 'left';
    }
  }
  ctx.fillStyle = '#d7e1de'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(view.quote || '每次继续都会提高稀有鱼机会，也会抬高断线风险', 600, 864, 1080); ctx.textAlign = 'left';
}

function categoryColor(category) {
  const colors = {
    '甜食': '#f2a6c3', '零食': '#f3c969', '饮品': '#82d5d0',
    '餐点': '#ef9f74', '生活用品': '#9bb7d4', '家具': '#b4d58d'
  };
  return colors[category] || '#d7c49e';
}

function drawHeartIcon(ctx, x, y, size, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 32, size / 32);
  ctx.beginPath(); ctx.moveTo(16, 28); ctx.bezierCurveTo(12, 23, 2, 17, 2, 9);
  ctx.bezierCurveTo(2, 1, 12, -2, 16, 5); ctx.bezierCurveTo(20, -2, 30, 1, 30, 9);
  ctx.bezierCurveTo(30, 17, 20, 23, 16, 28); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.restore();
}

function drawCoinIcon(ctx, x, y, size) {
  ctx.beginPath(); ctx.arc(x, y, size / 2, 0, Math.PI * 2); ctx.fillStyle = '#f3c969'; ctx.fill();
  ctx.strokeStyle = '#fff0a8'; ctx.lineWidth = Math.max(2, size * 0.06); ctx.stroke();
  ctx.fillStyle = '#6b5320'; ctx.font = `700 ${Math.floor(size * 0.48)}px Georgia, serif`; ctx.textAlign = 'center';
  ctx.fillText('Y', x, y + size * 0.17); ctx.textAlign = 'left';
}

function drawGiftIcon(ctx, x, y, size, color) {
  const boxY = y + size * 0.30;
  roundedRect(ctx, x, boxY, size, size * 0.62, Math.max(4, size * 0.04)); ctx.fillStyle = color; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(x + size * 0.43, boxY, size * 0.14, size * 0.62);
  ctx.fillRect(x, boxY + size * 0.16, size, size * 0.12);
  ctx.beginPath(); ctx.ellipse(x + size * 0.38, y + size * 0.24, size * 0.17, size * 0.11, -0.5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + size * 0.62, y + size * 0.24, size * 0.17, size * 0.11, 0.5, 0, Math.PI * 2); ctx.fill();
}

function drawRelationProgress(ctx, x, y, width, relation, affection, progress, color) {
  ctx.fillStyle = '#eef1ed'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(`关系 · ${relation || '初见'}`, x, y);
  ctx.textAlign = 'right'; ctx.fillStyle = color; ctx.fillText(`${Math.floor(affection)} 好感`, x + width, y); ctx.textAlign = 'left';
  roundedRect(ctx, x, y + 16, width, 14, 7); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
  const fillWidth = width * Math.max(0, Math.min(1, progress));
  if (fillWidth > 0) { roundedRect(ctx, x, y + 16, fillWidth, 14, 7); ctx.fillStyle = color; ctx.fill(); }
}

function drawDailyScene(ctx, view) {
  const scene = view.dailyScene; const accent = '#f3c969'; const claimed = scene.status === 'claimed';
  drawSceneHeader(ctx, view, accent);
  roundedRect(ctx, 72, 126, 340, 456, 8); ctx.fillStyle = 'rgba(12,18,20,0.91)'; ctx.fill();
  ctx.strokeStyle = 'rgba(243,201,105,0.58)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#b94f55'; ctx.fillRect(72, 126, 340, 82);
  ctx.fillStyle = '#fff4e4'; ctx.font = '700 26px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  const parts = scene.date.split('-'); const monthText = parts.length === 3 ? `${parts[0]} / ${parts[1]}` : scene.date;
  ctx.fillText(monthText, 242, 178, 290);
  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 126px Georgia, serif'; ctx.fillText(parts[2] || '--', 242, 354, 270);
  ctx.fillStyle = '#bfc9c6'; ctx.font = '18px "Microsoft YaHei", sans-serif'; ctx.fillText('DAILY CHECK-IN', 242, 400);
  roundedRect(ctx, 117, 444, 250, 64, 32); ctx.fillStyle = claimed ? 'rgba(130,213,208,0.17)' : 'rgba(255,255,255,0.08)'; ctx.fill();
  ctx.strokeStyle = claimed ? '#82d5d0' : '#aeb7b4'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = claimed ? '#82d5d0' : '#c7cfcc'; ctx.font = '700 22px "Microsoft YaHei", sans-serif';
  ctx.fillText(claimed ? '今日补给已到账' : '今天已经领取', 242, 484, 220); ctx.textAlign = 'left';

  roundedRect(ctx, 442, 126, 686, 456, 8); ctx.fillStyle = 'rgba(12,18,20,0.91)'; ctx.fill();
  ctx.fillStyle = '#f5f0e5'; ctx.font = '700 30px "Microsoft YaHei", sans-serif'; ctx.fillText(`${scene.name} 的今日补给`, 480, 179, 600);
  ctx.fillStyle = '#bfc9c6'; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.fillText(claimed ? '签到奖励已经写入专属档案' : '奖励已经领取，本日不可重复获得', 480, 210, 600);

  roundedRect(ctx, 480, 246, 282, 138, 7); ctx.fillStyle = 'rgba(243,201,105,0.10)'; ctx.fill();
  drawCoinIcon(ctx, 533, 315, 62); ctx.fillStyle = '#f3c969'; ctx.font = '700 40px "Microsoft YaHei", sans-serif'; ctx.fillText(`+${Math.floor(scene.coinsReward)}`, 584, 312, 145);
  ctx.fillStyle = '#d4d9d6'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText('游戏币补给', 584, 343);
  roundedRect(ctx, 785, 246, 305, 138, 7); ctx.fillStyle = 'rgba(239,141,127,0.10)'; ctx.fill();
  drawHeartIcon(ctx, 824, 289, 56, '#ef8d7f'); ctx.fillStyle = '#ef8d7f'; ctx.font = '700 40px "Microsoft YaHei", sans-serif';
  ctx.fillText(`${scene.affectionReward >= 0 ? '+' : ''}${Math.floor(scene.affectionReward)}`, 886, 312, 155);
  ctx.fillStyle = '#d4d9d6'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText('好感变化', 886, 343);
  ctx.fillStyle = '#bfc9c6'; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.fillText('当前游戏币', 480, 438);
  ctx.fillStyle = '#f3c969'; ctx.font = '700 31px "Microsoft YaHei", sans-serif'; ctx.fillText(String(Math.floor(scene.coins)), 480, 477, 245);
  ctx.fillStyle = '#bfc9c6'; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.fillText('当前关系', 785, 438);
  ctx.fillStyle = '#82d5d0'; ctx.font = '700 31px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.relation || '初见', 785, 477, 245);

  roundedRect(ctx, 72, 610, 1056, 210, 8); ctx.fillStyle = 'rgba(12,18,20,0.91)'; ctx.fill();
  drawRelationProgress(ctx, 112, 663, 976, scene.relation, scene.affection, scene.relationProgress, '#ef8d7f');
  ctx.fillStyle = '#e4e8e5'; ctx.font = '18px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  wrapLine(ctx, view.quote || '明天再来领取新的日常补给。', 900).slice(0, 3).forEach((row, index) => ctx.fillText(row, 600, 742 + index * 28, 900));
  ctx.textAlign = 'left';
}

function drawGiftMenu(ctx, view) {
  const scene = view.giftScene; const categoryOrder = ['甜食', '零食', '饮品', '餐点', '生活用品', '家具'];
  const grouped = {};
  scene.gifts.forEach((gift) => { if (!grouped[gift.category]) grouped[gift.category] = []; grouped[gift.category].push(gift); });
  const categories = categoryOrder.filter((category) => grouped[category]).concat(Object.keys(grouped).filter((category) => categoryOrder.indexOf(category) < 0)).slice(0, 6);
  drawSceneHeader(ctx, view, '#ef8d7f');
  roundedRect(ctx, 80, 112, 1040, 54, 7); ctx.fillStyle = 'rgba(10,15,17,0.88)'; ctx.fill();
  ctx.fillStyle = '#f5f0e8'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.name, 104, 146, 250);
  ctx.fillStyle = '#f3c969'; ctx.fillText(`${Math.floor(scene.coins)} 游戏币`, 410, 146, 230);
  ctx.fillStyle = '#ef8d7f'; ctx.fillText(`${Math.floor(scene.affection)} 好感`, 700, 146, 220);
  ctx.textAlign = 'right'; ctx.fillStyle = '#82d5d0'; ctx.fillText(scene.relation || '初见', 1090, 146, 150); ctx.textAlign = 'left';

  categories.forEach((category, index) => {
    const x = 80 + (index % 3) * 360; const y = 184 + Math.floor(index / 3) * 304; const color = categoryColor(category);
    roundedRect(ctx, x, y, 340, 282, 8); ctx.fillStyle = 'rgba(10,15,17,0.91)'; ctx.fill();
    ctx.strokeStyle = `${color}99`; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = color; ctx.fillRect(x, y, 340, 6);
    ctx.beginPath(); ctx.arc(x + 34, y + 38, 19, 0, Math.PI * 2); ctx.fillStyle = `${color}33`; ctx.fill();
    ctx.fillStyle = color; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(category.slice(0, 1), x + 34, y + 45); ctx.textAlign = 'left';
    ctx.fillStyle = color; ctx.font = '700 22px "Microsoft YaHei", sans-serif'; ctx.fillText(category, x + 65, y + 46, 230);
    (grouped[category] || []).slice(0, 4).forEach((gift, giftIndex) => {
      const rowY = y + 72 + giftIndex * 48;
      roundedRect(ctx, x + 18, rowY, 304, 39, 5); ctx.fillStyle = 'rgba(255,255,255,0.055)'; ctx.fill();
      ctx.fillStyle = '#edf0ec'; ctx.font = '600 16px "Microsoft YaHei", sans-serif'; ctx.fillText(gift.name, x + 31, rowY + 25, 120);
      ctx.fillStyle = '#f3c969'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'right'; ctx.fillText(`${Math.floor(gift.cost)}币`, x + 242, rowY + 25, 70);
      ctx.fillStyle = '#ef8d7f'; ctx.fillText(`+${Math.floor(gift.affection)}`, x + 307, rowY + 25, 54); ctx.textAlign = 'left';
    });
  });
  ctx.fillStyle = '#dbe1de'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(view.quote || '发送 .投喂 <礼物名>，从礼物架中挑一份心意。', 600, 838, 1040); ctx.textAlign = 'left';
}

function drawGiftResult(ctx, view) {
  const scene = view.giftScene; const insufficient = scene.mode === 'insufficient';
  const color = insufficient ? '#ef8d7f' : categoryColor(scene.category);
  drawSceneHeader(ctx, view, color);
  roundedRect(ctx, 72, 126, 430, 608, 8); ctx.fillStyle = 'rgba(10,15,17,0.91)'; ctx.fill();
  ctx.strokeStyle = `${color}99`; ctx.lineWidth = 2; ctx.stroke();
  drawGiftIcon(ctx, 151, 201, 270, color);
  roundedRect(ctx, 153, 509, 268, 38, 19); ctx.fillStyle = `${color}22`; ctx.fill();
  ctx.fillStyle = color; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(scene.category || '礼物', 287, 535, 230);
  ctx.fillStyle = '#f6f2e9'; ctx.font = '700 35px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.item || '礼物', 287, 597, 350);
  ctx.fillStyle = insufficient ? '#ef8d7f' : '#82d5d0'; ctx.font = '700 20px "Microsoft YaHei", sans-serif';
  ctx.fillText(insufficient ? '游戏币不足 · 尚未送出' : '礼物已送达', 287, 648, 340); ctx.textAlign = 'left';

  roundedRect(ctx, 532, 126, 596, 608, 8); ctx.fillStyle = 'rgba(10,15,17,0.91)'; ctx.fill();
  ctx.fillStyle = '#f5f0e8'; ctx.font = '700 28px "Microsoft YaHei", sans-serif'; ctx.fillText(`${scene.name} 的赠礼记录`, 572, 181, 510);
  ctx.fillStyle = '#bfc9c6'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText(insufficient ? '余额不足，本次不会扣费或增加好感' : '花费与好感变化已经写入专属档案', 572, 213, 510);
  roundedRect(ctx, 572, 250, 238, 122, 7); ctx.fillStyle = 'rgba(243,201,105,0.10)'; ctx.fill();
  drawCoinIcon(ctx, 614, 311, 46); ctx.fillStyle = insufficient ? '#ef8d7f' : '#f3c969'; ctx.font = '700 32px "Microsoft YaHei", sans-serif';
  ctx.fillText(insufficient ? `需 ${Math.floor(scene.cost)}` : `-${Math.floor(scene.cost)}`, 654, 310, 130); ctx.fillStyle = '#cbd2cf'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText('游戏币', 654, 341);
  roundedRect(ctx, 832, 250, 256, 122, 7); ctx.fillStyle = 'rgba(239,141,127,0.10)'; ctx.fill();
  drawHeartIcon(ctx, 870, 289, 44, '#ef8d7f'); ctx.fillStyle = '#ef8d7f'; ctx.font = '700 32px "Microsoft YaHei", sans-serif';
  ctx.fillText(`+${Math.floor(scene.affectionGain)}`, 922, 310, 130); ctx.fillStyle = '#cbd2cf'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(insufficient ? '计划好感' : '好感增加', 922, 341);
  ctx.fillStyle = '#bfc9c6'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText('当前游戏币', 572, 425);
  ctx.fillStyle = '#f3c969'; ctx.font = '700 30px "Microsoft YaHei", sans-serif'; ctx.fillText(String(Math.floor(scene.coins)), 572, 465, 220);
  ctx.fillStyle = '#bfc9c6'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText('当前关系', 832, 425);
  ctx.fillStyle = '#82d5d0'; ctx.font = '700 30px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.relation || '初见', 832, 465, 220);
  drawRelationProgress(ctx, 572, 535, 516, scene.relation, scene.affection, scene.relationProgress, color);
  ctx.fillStyle = '#e1e6e3'; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  wrapLine(ctx, view.quote || '', 490).slice(0, 3).forEach((row, index) => ctx.fillText(row, 830, 641 + index * 27, 490)); ctx.textAlign = 'left';
  ctx.fillStyle = '#cbd2cf'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('再次发送 .投喂 可返回礼物架', 600, 838); ctx.textAlign = 'left';
}

function drawGiftScene(ctx, view) {
  if (view.giftScene.mode === 'menu') drawGiftMenu(ctx, view);
  else drawGiftResult(ctx, view);
}

function auctionMoney(value) {
  const number = Math.round(safeNumber(value));
  return `${number < 0 ? '-' : ''}${Math.abs(number).toLocaleString('en-US')}`;
}

function auctionRarityColor(rarity) {
  return ['#aeb8b5', '#82d5d0', '#75a7e8', '#d49aef', '#f3c969'][Math.max(0, Math.min(4, Math.floor(rarity)))] || '#aeb8b5';
}

function drawAuctionFooter(ctx, view) {
  if (!view.quote) return;
  roundedRect(ctx, 50, 812, 1100, 58, 6); ctx.fillStyle = 'rgba(7,10,11,0.88)'; ctx.fill();
  ctx.fillStyle = '#f0c84b'; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  wrapLine(ctx, view.quote, 1030).slice(0, 2).forEach((line, index) => ctx.fillText(line, 600, 837 + index * 21, 1030)); ctx.textAlign = 'left';
}

function drawAuctionAssistantSelection(ctx, view) {
  const scene = view.auctionScene; drawSceneHeader(ctx, view, '#f0c84b');
  const palette = ['#f3c969', '#82d5d0', '#9bb7d4', '#f2b5d4', '#b4d58d', '#ef8d7f', '#d4a7ff', '#73d8ff', '#ffb979', '#9ed18b', '#c2b7f2'];
  scene.assistants.forEach((assistant, index) => {
    const x = 42 + (index % 4) * 282; const y = 112 + Math.floor(index / 4) * 218; const color = assistant.color || palette[index % palette.length];
    roundedRect(ctx, x, y, 264, 198, 6); ctx.fillStyle = 'rgba(7,11,12,0.88)'; ctx.fill(); ctx.strokeStyle = `${color}70`; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = color; ctx.fillRect(x, y, 5, 198);
    ctx.fillStyle = '#f7f3ea'; ctx.font = '700 21px "Microsoft YaHei", sans-serif'; ctx.fillText(assistant.name, x + 20, y + 34, 116);
    ctx.fillStyle = color; ctx.font = '700 13px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'right'; ctx.fillText(assistant.skill, x + 246, y + 33, 110); ctx.textAlign = 'left';
    ctx.fillStyle = '#c8d0cd'; ctx.font = '14px "Microsoft YaHei", sans-serif';
    wrapLine(ctx, assistant.description, 224).slice(0, 3).forEach((line, row) => ctx.fillText(line, x + 20, y + 67 + row * 21, 224));
    ctx.fillStyle = `${color}22`; roundedRect(ctx, x + 18, y + 132, 228, 22, 4); ctx.fill();
    ctx.fillStyle = color; ctx.font = '600 11px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${assistant.typeLabel || '商品情报'} · ${assistant.triggerLabel || '主动'}`, x + 132, y + 147, 212); ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; roundedRect(ctx, x + 18, y + 157, 228, 26, 4); ctx.fill();
    ctx.fillStyle = color; ctx.font = '600 12px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`.竞拍 助手 ${assistant.name}`, x + 132, y + 175, 212); ctx.textAlign = 'left';
  });
  drawAuctionFooter(ctx, view);
}

function drawAuctionAssistantCard(ctx, assistant, x, y, width, height) {
  roundedRect(ctx, x, y, width, height, 7); ctx.fillStyle = 'rgba(7,11,12,0.84)'; ctx.fill();
  ctx.strokeStyle = 'rgba(240,200,75,0.35)'; ctx.stroke(); ctx.fillStyle = '#f0c84b'; ctx.fillRect(x, y, 6, height);
  ctx.fillStyle = '#b9c3c0'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText('专属助手', x + 24, y + 31);
  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 29px "Microsoft YaHei", sans-serif'; ctx.fillText(assistant ? assistant.name : '尚未选择', x + 24, y + 70, width - 48);
  if (assistant) {
    ctx.fillStyle = '#f0c84b'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText(assistant.skill, x + 24, y + 102, width - 48);
    ctx.fillStyle = assistant.color || '#82d5d0'; ctx.font = '600 12px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${assistant.typeLabel || '商品情报'} · ${assistant.triggerLabel || '主动'}`, x + 24, y + 128, width - 48);
    ctx.fillStyle = '#c8d0cd'; ctx.font = '14px "Microsoft YaHei", sans-serif';
    const maxLines = Math.max(1, Math.floor((height - 154) / 22));
    wrapLine(ctx, assistant.description, width - 48).slice(0, maxLines).forEach((line, index) => ctx.fillText(line, x + 24, y + 156 + index * 22, width - 48));
  }
}

function drawAuctionMenu(ctx, view) {
  const scene = view.auctionScene; drawSceneHeader(ctx, view, '#f0c84b');
  drawAuctionAssistantCard(ctx, scene.assistant, 48, 118, 300, 210);
  roundedRect(ctx, 48, 350, 300, 420, 6); ctx.fillStyle = 'rgba(6,10,11,0.82)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 20px "Microsoft YaHei", sans-serif'; ctx.fillText('快速指令', 70, 386);
  const commands = ['.竞拍 助手 [名称]', '.竞拍 人机 [场地]', '.竞拍 开房 [场地]', '.竞拍 探索 A1', '.竞拍 出价 120000', '.竞拍 确认 / 撤回（多人）', '.竞拍 技能（随机）', '.竞拍 图鉴'];
  commands.forEach((command, index) => { ctx.fillStyle = index < 2 ? '#f0c84b' : '#d2d9d7'; ctx.font = `${index < 2 ? '700' : '400'} 14px "Microsoft YaHei", sans-serif`; ctx.fillText(command, 70, 430 + index * 41, 252); });
  ctx.fillStyle = '#82d5d0'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.fillText(`1 游戏币 = ${auctionMoney(scene.auctionRate)} 竞拍币`, 70, 750);
  roundedRect(ctx, 374, 118, 778, 652, 7); ctx.fillStyle = 'rgba(6,10,11,0.76)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
  ctx.fillStyle = '#f0c84b'; ctx.font = '700 22px "Microsoft YaHei", sans-serif'; ctx.fillText('淘货场地', 400, 156);
  ctx.textAlign = 'right'; ctx.fillStyle = '#82d5d0'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText('无参数默认新手仓', 1126, 155); ctx.textAlign = 'left';
  scene.venues.forEach((venue, index) => {
    const x = 398 + (index % 2) * 370; const y = 180 + Math.floor(index / 2) * 132; const selected = venue.name === scene.selectedVenue;
    roundedRect(ctx, x, y, 346, 108, 6); ctx.fillStyle = selected ? 'rgba(240,200,75,0.16)' : 'rgba(255,255,255,0.065)'; ctx.fill();
    ctx.strokeStyle = selected ? '#f0c84b' : 'rgba(255,255,255,0.12)'; ctx.stroke();
    ctx.fillStyle = selected ? '#f0c84b' : '#f4f5ef'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(venue.name, x + 18, y + 31, 150);
    ctx.textAlign = 'right'; ctx.fillStyle = '#82d5d0'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(`${venue.minItems}-${venue.maxItems}件`, x + 324, y + 29); ctx.textAlign = 'left';
    ctx.fillStyle = '#c3ccca'; ctx.font = '13px "Microsoft YaHei", sans-serif'; wrapLine(ctx, venue.tagline, 306).slice(0, 2).forEach((line, row) => ctx.fillText(line, x + 18, y + 61 + row * 20, 306));
  });
  drawAuctionFooter(ctx, view);
}

function drawAuctionPlayers(ctx, players, x, y, width) {
  const gap = 8; const columns = width >= 600 ? 4 : 2; const cardWidth = (width - gap * (columns - 1)) / columns; const cardHeight = 70;
  players.forEach((player, index) => {
    const px = x + (index % columns) * (cardWidth + gap); const py = y + Math.floor(index / columns) * (cardHeight + 7);
    roundedRect(ctx, px, py, cardWidth, cardHeight, 6); ctx.fillStyle = player.isViewer ? 'rgba(240,200,75,0.16)' : player.active ? 'rgba(9,14,15,0.82)' : 'rgba(9,14,15,0.54)'; ctx.fill();
    ctx.strokeStyle = player.isViewer ? '#f0c84b' : 'rgba(255,255,255,0.13)'; ctx.stroke();
    ctx.fillStyle = player.active ? '#f2f4ef' : '#8d9996'; ctx.font = '700 13px "Microsoft YaHei", sans-serif'; ctx.fillText(player.name, px + 10, py + 18, cardWidth - 72);
    ctx.textAlign = 'right'; ctx.fillStyle = player.rank > 0 ? '#f0c84b' : '#6f7b79'; ctx.font = '800 14px "Microsoft YaHei", sans-serif';
    ctx.fillText(player.rank > 0 ? `#${player.rank}` : '—', px + cardWidth - 9, py + 18, 56); ctx.textAlign = 'left';
    ctx.fillStyle = player.confirmed ? '#82d5d0' : player.active ? '#aeb8b5' : '#ef8d7f'; ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${player.isBot ? 'Bot' : '真人'}${player.isGuest ? '·游客' : ''} · ${player.status}`, px + 10, py + 38, cardWidth - 90);
    if (player.isViewer && player.ownBid > 0) { ctx.fillStyle = '#f0c84b'; ctx.textAlign = 'right'; ctx.fillText(auctionMoney(player.ownBid), px + cardWidth - 9, py + 38, 76); ctx.textAlign = 'left'; }
    const history = Array.isArray(player.rankHistory) ? player.rankHistory.slice(0, 5) : []; while (history.length < 5) history.push(0);
    const slotGap = 3; const slotWidth = (cardWidth - 20 - slotGap * 4) / 5; const slotY = py + 47;
    history.forEach((rank, slotIndex) => {
      const sx = px + 10 + slotIndex * (slotWidth + slotGap); const current = player.rankRound > 0 && Math.min(4, player.rankRound - 1) === slotIndex;
      roundedRect(ctx, sx, slotY, slotWidth, 15, 3); ctx.fillStyle = rank > 0 ? current ? 'rgba(240,200,75,0.28)' : 'rgba(130,213,208,0.13)' : 'rgba(255,255,255,0.045)'; ctx.fill();
      ctx.strokeStyle = rank > 0 ? current ? '#f0c84b' : 'rgba(130,213,208,0.35)' : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = rank > 0 ? current ? '#f0c84b' : '#b8d8d3' : '#687471'; ctx.font = '700 8px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`${slotIndex + 1}:${rank || '-'}`, sx + slotWidth / 2, slotY + 11, slotWidth - 4); ctx.textAlign = 'left';
    });
  });
}

function drawAuctionWaiting(ctx, view) {
  const scene = view.auctionScene; drawSceneHeader(ctx, view, '#f0c84b');
  roundedRect(ctx, 54, 126, 390, 610, 7); ctx.fillStyle = 'rgba(6,10,11,0.74)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
  ctx.fillStyle = '#f0c84b'; ctx.font = '700 24px "Microsoft YaHei", sans-serif'; ctx.fillText(`${scene.selectedVenue || '新手仓'} · 等待区`, 82, 172);
  ctx.fillStyle = '#c8d0cd'; ctx.font = '17px "Microsoft YaHei", sans-serif'; ctx.fillText('开始时自动补足至少 3 名 Bot', 82, 207);
  drawAuctionAssistantCard(ctx, scene.assistant, 82, 246, 334, 254);
  ctx.fillStyle = '#82d5d0'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText('.竞拍 机器人 [数量]', 82, 553);
  ctx.fillText('.竞拍 开始', 82, 591);
  ctx.fillStyle = '#aeb8b5'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText('最多 5 名真人 + 至少 3 名 Bot', 82, 640);
  roundedRect(ctx, 470, 126, 676, 610, 7); ctx.fillStyle = 'rgba(6,10,11,0.78)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 23px "Microsoft YaHei", sans-serif'; ctx.fillText(`当前席位 ${scene.players.length}/8`, 498, 170);
  drawAuctionPlayers(ctx, scene.players, 498, 198, 620);
  drawAuctionFooter(ctx, view);
}

function drawAuctionItemArt(ctx, item, x, y, width, height, color) {
  const cx = x + width / 2; const cy = y + height / 2 + 3; const size = Math.max(16, Math.min(48, Math.min(width, height) * 0.48));
  ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = color; ctx.fillStyle = `${color}28`; ctx.lineWidth = Math.max(1.5, size / 18); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (!item.visualKnown || item.visualType === 'unknown') {
    const w = size * 1.18; const h = size * 0.82; ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(0, -h * 0.12); ctx.lineTo(w / 2, -h / 2); ctx.moveTo(0, -h * 0.12); ctx.lineTo(0, h / 2); ctx.stroke();
    ctx.fillStyle = color; ctx.font = `700 ${Math.max(13, size * 0.43)}px "Microsoft YaHei", sans-serif`; ctx.textAlign = 'center'; ctx.fillText('?', 0, h * 0.28); ctx.textAlign = 'left'; ctx.restore(); return;
  }
  if (item.visualType === '家居') {
    ctx.beginPath(); ctx.rect(-size * 0.34, -size * 0.08, size * 0.68, size * 0.3); ctx.rect(-size * 0.29, -size * 0.42, size * 0.58, size * 0.34); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-size * 0.27, size * 0.22); ctx.lineTo(-size * 0.33, size * 0.48); ctx.moveTo(size * 0.27, size * 0.22); ctx.lineTo(size * 0.33, size * 0.48); ctx.stroke();
  } else if (item.visualType === '电器') {
    roundedRect(ctx, -size * 0.48, -size * 0.34, size * 0.96, size * 0.62, size * 0.08); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-size * 0.18, size * 0.29); ctx.lineTo(-size * 0.28, size * 0.48); ctx.lineTo(size * 0.28, size * 0.48); ctx.lineTo(size * 0.18, size * 0.29); ctx.stroke();
    ctx.beginPath(); ctx.arc(size * 0.31, -size * 0.18, size * 0.05, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  } else if (item.visualType === '收藏品') {
    ctx.beginPath(); ctx.rect(-size * 0.43, -size * 0.43, size * 0.86, size * 0.86); ctx.fill(); ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const radius = i % 2 ? size * 0.17 : size * 0.34; const angle = -Math.PI / 2 + i * Math.PI / 5; const px = Math.cos(angle) * radius; const py = Math.sin(angle) * radius; if (!i) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); ctx.stroke();
  } else if (item.visualType === '奢侈品') {
    ctx.beginPath(); ctx.moveTo(0, -size * 0.48); ctx.lineTo(size * 0.42, -size * 0.08); ctx.lineTo(0, size * 0.48); ctx.lineTo(-size * 0.42, -size * 0.08); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-size * 0.42, -size * 0.08); ctx.lineTo(size * 0.42, -size * 0.08); ctx.moveTo(-size * 0.22, -size * 0.27); ctx.lineTo(0, size * 0.48); ctx.lineTo(size * 0.22, -size * 0.27); ctx.stroke();
  } else if (item.visualType === '工业设备') {
    ctx.beginPath(); ctx.arc(0, 0, size * 0.31, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, size * 0.12, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.cos(angle) * size * 0.31, Math.sin(angle) * size * 0.31); ctx.lineTo(Math.cos(angle) * size * 0.5, Math.sin(angle) * size * 0.5); ctx.stroke(); }
  } else if (item.visualType === '交通工具') {
    ctx.beginPath(); ctx.moveTo(-size * 0.5, size * 0.1); ctx.lineTo(-size * 0.32, -size * 0.2); ctx.lineTo(size * 0.2, -size * 0.2); ctx.lineTo(size * 0.46, size * 0.04); ctx.lineTo(size * 0.5, size * 0.25); ctx.lineTo(-size * 0.5, size * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke();
    [-size * 0.28, size * 0.3].forEach((wheelX) => { ctx.beginPath(); ctx.arc(wheelX, size * 0.28, size * 0.14, 0, Math.PI * 2); ctx.fillStyle = 'rgba(4,8,9,0.9)'; ctx.fill(); ctx.stroke(); });
  } else if (item.visualType === '废料') {
    ctx.beginPath(); ctx.moveTo(-size * 0.48, size * 0.35); ctx.lineTo(-size * 0.22, -size * 0.32); ctx.lineTo(0, size * 0.12); ctx.lineTo(size * 0.18, -size * 0.4); ctx.lineTo(size * 0.48, size * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(-size * 0.2, size * 0.08, size * 0.1, 0, Math.PI * 2); ctx.arc(size * 0.23, size * 0.1, size * 0.12, 0, Math.PI * 2); ctx.stroke();
  } else {
    roundedRect(ctx, -size * 0.45, -size * 0.32, size * 0.9, size * 0.7, size * 0.08); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-size * 0.22, -size * 0.32); ctx.quadraticCurveTo(0, -size * 0.58, size * 0.22, -size * 0.32); ctx.moveTo(0, size * 0.02); ctx.lineTo(0, size * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -size * 0.07, size * 0.06, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
  ctx.restore();
}

function drawAuctionCargoGrid(ctx, scene, x, y, cell) {
  const columns = scene.container ? scene.container.gridWidth : 12; const rows = scene.container ? scene.container.gridHeight : 10;
  cell = Math.max(30, Math.min(cell || 46, Math.floor(570 / columns), Math.floor(470 / rows)));
  const width = columns * cell; const height = rows * cell;
  roundedRect(ctx, x - 26, y - 28, width + 34, height + 38, 5); ctx.fillStyle = 'rgba(3,7,8,0.94)'; ctx.fill(); ctx.strokeStyle = 'rgba(240,200,75,0.35)'; ctx.stroke();
  ctx.fillStyle = '#81908d'; ctx.font = '700 10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center';
  for (let gx = 0; gx < columns; gx++) ctx.fillText(String.fromCharCode(65 + gx), x + gx * cell + cell / 2, y - 10);
  ctx.textAlign = 'right'; for (let gy = 0; gy < rows; gy++) ctx.fillText(String(gy + 1), x - 7, y + gy * cell + cell / 2 + 4); ctx.textAlign = 'left';

  const cellMap = {};
  (scene.cells || []).forEach((fogCell) => { cellMap[`${fogCell.x},${fogCell.y}`] = fogCell; });
  if (!(scene.cells || []).length) {
    (scene.items || []).forEach((item) => (item.shape || []).forEach((point) => {
      const gx = item.gridX + point[0]; const gy = item.gridY + point[1]; cellMap[`${gx},${gy}`] = { x: gx, y: gy, revealed: true, occupied: true, rarity: item.rarity, public: true };
    }));
  }
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < columns; gx++) {
    const fogCell = cellMap[`${gx},${gy}`] || { revealed: false }; const px = x + gx * cell; const py = y + gy * cell;
    if (fogCell.revealed) {
      const color = fogCell.occupied ? auctionRarityColor(fogCell.rarity) : '#405154';
      const gradient = ctx.createLinearGradient(px, py, px + cell, py + cell); gradient.addColorStop(0, `${color}b8`); gradient.addColorStop(1, `${color}55`);
      ctx.fillStyle = gradient; ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      if (!fogCell.occupied) { ctx.fillStyle = '#7e8d8a'; ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('空', px + cell / 2, py + cell / 2 + 4); ctx.textAlign = 'left'; }
      ctx.fillStyle = fogCell.public ? '#82d5d0' : fogCell.personal ? '#f0c84b' : '#aeb8b5'; ctx.fillRect(px + cell - 7, py + 2, 5, 5);
    } else {
      const shade = (gx + gy) % 2 ? '#12191b' : '#0d1416'; ctx.fillStyle = shade; ctx.fillRect(px + 1, py + 1, cell - 2, cell - 2);
      ctx.strokeStyle = 'rgba(118,134,136,0.12)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + 5, py + cell - 5); ctx.lineTo(px + cell - 5, py + 5); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1; ctx.strokeRect(px, py, cell, cell);
  }

  (scene.items || []).filter((item) => item.fullyRevealed || scene.mode === 'result' || item.visualKnown).forEach((item) => {
    const color = auctionRarityColor(item.rarity);
    const maxX = Math.max(...item.shape.map((point) => point[0])); const maxY = Math.max(...item.shape.map((point) => point[1]));
    const bx = x + item.gridX * cell; const by = y + item.gridY * cell; const bw = (maxX + 1) * cell; const bh = (maxY + 1) * cell;
    const inset = 3; const ix = bx + inset; const iy = by + inset; const iw = Math.max(8, bw - inset * 2); const ih = Math.max(8, bh - inset * 2);
    const gradient = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih); gradient.addColorStop(0, `${color}d8`); gradient.addColorStop(1, `${color}72`);
    roundedRect(ctx, ix, iy, iw, ih, 5); ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.save(); roundedRect(ctx, ix, iy, iw, ih, 5); ctx.clip(); drawAuctionItemArt(ctx, item, ix, iy, iw, ih, color); ctx.restore();
    const labelWidth = Math.max(cell - 10, Math.min(iw - 4, 150)); roundedRect(ctx, ix + 2, iy + ih - 18, labelWidth, 16, 3); ctx.fillStyle = 'rgba(3,7,8,0.88)'; ctx.fill();
    ctx.fillStyle = '#f5f4ed'; ctx.font = '700 9px "Microsoft YaHei", sans-serif'; ctx.fillText(item.name, ix + 6, iy + ih - 7, labelWidth - 8);
  });
}

function drawAuctionAssistantReport(ctx, report, x, y, width, height) {
  if (!report) return;
  const toneColors = { positive: '#82d5d0', negative: '#ef8d7f', warning: '#f3c969', accent: '#9bb7d4', neutral: '#c8d0cd' };
  roundedRect(ctx, x, y, width, height, 5); ctx.fillStyle = 'rgba(255,255,255,0.055)'; ctx.fill();
  ctx.strokeStyle = 'rgba(130,213,208,0.25)'; ctx.stroke();
  ctx.fillStyle = '#82d5d0'; ctx.font = '700 11px "Microsoft YaHei", sans-serif';
  ctx.fillText(`${report.typeLabel || '助手报告'} · 第${report.round || 1}轮`, x + 10, y + 17, width - 20);
  const stats = Array.isArray(report.stats) ? report.stats.slice(0, 4) : [];
  if (stats.length) {
    const gap = 4; const statWidth = (width - 20 - gap * (stats.length - 1)) / stats.length;
    stats.forEach((stat, index) => {
      const sx = x + 10 + index * (statWidth + gap); roundedRect(ctx, sx, y + 25, statWidth, 31, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fill(); ctx.fillStyle = toneColors[stat.tone] || toneColors.neutral;
      ctx.font = '9px "Microsoft YaHei", sans-serif'; ctx.fillText(stat.label, sx + 5, y + 37, statWidth - 10);
      ctx.font = '700 12px "Microsoft YaHei", sans-serif'; ctx.fillText(String(stat.value), sx + 5, y + 51, statWidth - 10);
    });
  }
  if (report.valuation) {
    ctx.fillStyle = '#f3c969'; ctx.font = '700 11px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${report.valuation.label} ${auctionMoney(report.valuation.low)}—${auctionMoney(report.valuation.high)} · ${report.valuation.confidence}`, x + 10, y + 76, width - 20);
    ctx.fillStyle = '#b9c3c0'; ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.fillText(report.summary, x + 10, y + 96, width - 20);
  } else {
    ctx.fillStyle = '#b9c3c0'; ctx.font = '10px "Microsoft YaHei", sans-serif';
    wrapLine(ctx, report.summary, width - 20).slice(0, 2).forEach((line, index) => ctx.fillText(line, x + 10, y + 77 + index * 18, width - 20));
  }
}

function drawAuctionBidding(ctx, view) {
  const scene = view.auctionScene; drawSceneHeader(ctx, view, '#f0c84b');
  const roundLabel = scene.round <= 4 ? `${[0, 200, 160, 130, 110][scene.round]}%成交线` : scene.round === 5 ? '最高价决胜' : '同价加赛';
  ctx.fillStyle = '#f0c84b'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(`${scene.selectedVenue} · 第${scene.round}轮 · ${roundLabel}`, 50, 126);
  ctx.textAlign = 'right'; ctx.fillStyle = '#aeb8b5'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.container ? scene.container.code : '', 670, 125); ctx.textAlign = 'left';
  drawAuctionCargoGrid(ctx, scene, 50, 158, 46);

  roundedRect(ctx, 700, 110, 450, 525, 7); ctx.fillStyle = 'rgba(5,9,10,0.86)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.stroke();
  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 22px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.container ? scene.container.theme : '未知货柜', 726, 148, 390);
  ctx.fillStyle = '#b9c3c0'; ctx.font = '13px "Microsoft YaHei", sans-serif';
  const clueText = scene.container ? `${scene.container.clue} ${scene.container.silhouette}` : '';
  wrapLine(ctx, clueText, 390).slice(0, 3).forEach((line, row) => ctx.fillText(line, 726, 177 + row * 20, 390));
  const metrics = [
    ['我的价位', scene.playerBand || '尚未出价', '#f0c84b'], ['市场热度', scene.marketHeat || '冷清', '#82d5d0'],
    ['报价分布', scene.spread || '暂无', '#9bb7d4'], ['最低估价', `≥${auctionMoney(scene.minimumEstimate)}`, '#b4d58d']
  ];
  metrics.forEach((metric, index) => {
    const x = 726 + index * 98; roundedRect(ctx, x, 246, 91, 62, 5); ctx.fillStyle = 'rgba(255,255,255,0.065)'; ctx.fill();
    ctx.fillStyle = '#9fa9a7'; ctx.font = '10px "Microsoft YaHei", sans-serif'; ctx.fillText(metric[0], x + 8, 265);
    ctx.fillStyle = metric[2]; ctx.font = '700 13px "Microsoft YaHei", sans-serif'; ctx.fillText(metric[1], x + 8, 291, 76);
  });
  ctx.fillStyle = '#aeb8b5'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText('自己暗标 / 可用预算', 726, 342);
  ctx.fillStyle = '#f0c84b'; ctx.font = '700 20px "Microsoft YaHei", sans-serif'; ctx.fillText(`${auctionMoney(scene.ownBid)} / ${auctionMoney(scene.budget)}`, 726, 371, 390);
  ctx.fillStyle = '#82d5d0'; ctx.font = '13px "Microsoft YaHei", sans-serif';
  ctx.fillText(scene.autoConfirm ? '单机模式 · 出价即自动确认并结算本轮' : `多人已确认 ${scene.submittedCount}/${scene.activeCount} · 确认前可自由改价`, 726, 397, 390);
  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.assistant ? `${scene.assistant.name} · ${scene.assistant.skill}` : '助手', 726, 425, 390);
  const passiveAssistant = scene.assistant && String(scene.assistant.triggerLabel || '').indexOf('开局被动') === 0;
  const skillText = scene.assistant && scene.assistant.used
    ? passiveAssistant ? '开局被动已自动生效' : '主动技能已使用'
    : `.竞拍 技能 · ${scene.assistant ? scene.assistant.typeLabel || '商品情报' : '商品情报'}`;
  ctx.fillStyle = scene.assistant && scene.assistant.used ? '#8f9997' : '#82d5d0'; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText(skillText, 726, 447, 180);
  ctx.fillStyle = scene.personalExploreUsed ? '#8f9997' : '#f0c84b'; ctx.fillText(scene.personalExploreUsed ? '本轮个人探索已使用' : '.竞拍 探索 A1 · 本轮可用', 912, 447, 194);
  if (scene.assistantReport) {
    drawAuctionAssistantReport(ctx, scene.assistantReport, 726, 460, 390, 112);
    ctx.fillStyle = '#82d5d0'; ctx.font = '10px "Microsoft YaHei", sans-serif';
    ctx.fillText(`${scene.publicIntel || '公共探照灯暂无新发现'} · 已探索${scene.exploredCount}/${scene.totalCells}格`, 726, 592, 390);
    ctx.fillStyle = '#aeb8b5'; ctx.fillText(`随身道具：${scene.tools.slice(0, 2).map((tool) => tool.name).join(' / ') || '无'}`, 726, 614, 390);
  } else {
    if (scene.publicIntel) { ctx.fillStyle = '#82d5d0'; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.publicIntel, 726, 475, 390); }
    if (scene.intel) { ctx.fillStyle = '#f0c84b'; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText(scene.intel, 726, 497, 390); }
    if (scene.items.length) { ctx.fillStyle = '#d8dfdc'; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText(`已识别：${scene.items.slice(0, 3).map((item) => item.name).join('、')}${scene.items.length > 3 ? '…' : ''}`, 726, 519, 390); }
    ctx.fillStyle = '#aeb8b5'; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText(`已探索 ${scene.exploredCount}/${scene.totalCells} 格 · 随身道具`, 726, 543);
    scene.tools.slice(0, 2).forEach((tool, index) => {
      const x = 726 + index * 196; roundedRect(ctx, x, 553, 184, 38, 4); ctx.fillStyle = 'rgba(255,255,255,0.065)'; ctx.fill();
      ctx.fillStyle = '#82d5d0'; ctx.font = '700 11px "Microsoft YaHei", sans-serif'; ctx.fillText(tool.name, x + 9, 568, 78);
      ctx.fillStyle = '#aeb8b5'; ctx.font = '9px "Microsoft YaHei", sans-serif'; ctx.fillText(tool.description, x + 9, 583, 164);
    });
  }

  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 14px "Microsoft YaHei", sans-serif'; ctx.fillText('竞拍席位 · 仅显示操作状态', 50, 642);
  drawAuctionPlayers(ctx, scene.players, 50, 656, 1100);
  drawAuctionFooter(ctx, view);
}

function drawAuctionItemCard(ctx, item, x, y, width, height) {
  const color = item.rarity >= 0 ? auctionRarityColor(item.rarity) : '#7e898b'; roundedRect(ctx, x, y, width, height, 6); ctx.fillStyle = 'rgba(6,10,11,0.86)'; ctx.fill();
  ctx.strokeStyle = `${color}99`; ctx.stroke(); ctx.fillStyle = color; ctx.fillRect(x, y, 5, height);
  ctx.fillStyle = color; ctx.font = '700 13px "Microsoft YaHei", sans-serif'; ctx.fillText(item.rarityName || ['常见', '少见', '稀有', '珍奇', '传说'][item.rarity], x + 15, y + 22, 48);
  ctx.fillStyle = '#f3f5f0'; ctx.font = '700 16px "Microsoft YaHei", sans-serif'; ctx.fillText(item.name, x + 15, y + 47, width - 30);
  ctx.fillStyle = '#aeb8b5'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(`${item.sizeLabel ? `${item.sizeLabel} · ` : ''}${item.category}${item.condition ? ` · ${item.condition}` : ''}${item.authenticity ? ` · ${item.authenticity}` : ''}`, x + 15, y + 69, width - 30);
  ctx.fillStyle = item.value > 0 ? '#82d5d0' : '#aeb8b5'; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.fillText(item.value > 0 ? `${auctionMoney(item.value)} 竞拍币` : `累计 ${item.count}`, x + 15, y + height - 15, width - 30);
}

function drawAuctionResult(ctx, view) {
  const scene = view.auctionScene; drawSceneHeader(ctx, view, '#f0c84b');
  if (!scene.sold) {
    roundedRect(ctx, 180, 220, 840, 370, 8); ctx.fillStyle = 'rgba(5,9,10,0.84)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.stroke();
    ctx.fillStyle = '#ef8d7f'; ctx.font = '700 48px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('本箱流拍', 600, 334);
    ctx.fillStyle = '#c8d0cd'; ctx.font = '21px "Microsoft YaHei", sans-serif'; ctx.fillText('所有竞拍者均已放弃，锁定资金已经退回', 600, 392);
    ctx.fillStyle = '#82d5d0'; ctx.font = '18px "Microsoft YaHei", sans-serif'; ctx.fillText('再次发送 .竞拍 返回帮助界面', 600, 474); ctx.textAlign = 'left'; drawAuctionFooter(ctx, view); return;
  }
  const metrics = [
    { label: '成交暗标', value: scene.winningBid, color: '#f0c84b' },
    { label: '货品售价', value: scene.saleValue, color: '#82d5d0' },
    { label: '最终利润', value: scene.profit, color: scene.profit >= 0 ? '#82d5d0' : '#ef8d7f' }
  ];
  metrics.forEach((metric, index) => {
    const x = 54 + index * 364; roundedRect(ctx, x, 118, 342, 118, 7); ctx.fillStyle = 'rgba(5,9,10,0.84)'; ctx.fill(); ctx.strokeStyle = `${metric.color}88`; ctx.stroke();
    ctx.fillStyle = '#aeb8b5'; ctx.font = '15px "Microsoft YaHei", sans-serif'; ctx.fillText(metric.label, x + 22, 151);
    ctx.fillStyle = metric.color; ctx.font = '700 31px "Microsoft YaHei", sans-serif'; ctx.fillText(`${metric.value >= 0 && index === 2 ? '+' : ''}${auctionMoney(metric.value)}`, x + 22, 196, 298);
  });
  roundedRect(ctx, 54, 254, 1092, 62, 6); ctx.fillStyle = 'rgba(5,9,10,0.82)'; ctx.fill();
  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 20px "Microsoft YaHei", sans-serif'; ctx.fillText(`${scene.winnerName} 拍得本箱 · 共揭晓 ${scene.items.length} 件`, 76, 292, 420);
  ctx.fillStyle = scene.coinDelta >= 0 ? '#82d5d0' : '#ef8d7f'; ctx.font = '700 15px "Microsoft YaHei", sans-serif'; ctx.fillText(`游戏币 ${scene.coinDelta >= 0 ? '+' : ''}${auctionMoney(scene.coinDelta)}`, 564, 291, 220);
  ctx.fillStyle = scene.affectionDelta >= 0 ? '#f2b5d4' : '#ef8d7f'; ctx.fillText(`好感 ${scene.affectionDelta >= 0 ? '+' : ''}${scene.affectionDelta}`, 850, 291, 180);
  drawAuctionCargoGrid(ctx, scene, 58, 342, 42);
  roundedRect(ctx, 590, 334, 556, 444, 6); ctx.fillStyle = 'rgba(5,9,10,0.86)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.stroke();
  ctx.fillStyle = '#f0c84b'; ctx.font = '700 17px "Microsoft YaHei", sans-serif'; ctx.fillText('开箱清单', 614, 369);
  scene.items.slice(0, 13).forEach((item, index) => {
    const y = 402 + index * 27; const color = auctionRarityColor(item.rarity);
    ctx.fillStyle = color; ctx.font = '700 12px "Microsoft YaHei", sans-serif'; ctx.fillText(`#${item.slot} ${item.name}`, 614, y, 200);
    ctx.fillStyle = item.authenticity === '仿制品' ? '#ef8d7f' : '#b8c2bf'; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText(`${item.rarityName} · ${item.condition} · ${item.authenticity}`, 820, y, 178);
    ctx.textAlign = 'right'; ctx.fillStyle = '#82d5d0'; ctx.fillText(auctionMoney(item.value), 1122, y, 104); ctx.textAlign = 'left';
  });
  if (scene.items.length > 13) { ctx.fillStyle = '#aeb8b5'; ctx.font = '11px "Microsoft YaHei", sans-serif'; ctx.fillText(`另有 ${scene.items.length - 13} 件已在货格中标注`, 614, 758); }
  drawAuctionFooter(ctx, view);
}

function drawAuctionCollection(ctx, view) {
  const scene = view.auctionScene; drawSceneHeader(ctx, view, '#f0c84b');
  const stats = [
    ['最高竞拍价', scene.highestBid, '#f0c84b'], ['最高利润', scene.bestProfit, scene.bestProfit >= 0 ? '#82d5d0' : '#ef8d7f'],
    ['单箱最多货品', scene.mostItems, '#9bb7d4'], ['买箱次数', scene.containers, '#f2b5d4'],
    ['累计支出', scene.totalSpend, '#ef8d7f'], ['累计出售', scene.totalRevenue, '#82d5d0']
  ];
  stats.forEach((stat, index) => {
    const x = 54 + (index % 3) * 364; const y = 118 + Math.floor(index / 3) * 102;
    roundedRect(ctx, x, y, 342, 88, 6); ctx.fillStyle = 'rgba(5,9,10,0.84)'; ctx.fill(); ctx.fillStyle = stat[2]; ctx.fillRect(x, y, 5, 88);
    ctx.fillStyle = '#aeb8b5'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(stat[0], x + 20, y + 29);
    ctx.fillStyle = stat[2]; ctx.font = '700 25px "Microsoft YaHei", sans-serif'; ctx.fillText(`${stat[1] < 0 ? '-' : ''}${auctionMoney(Math.abs(stat[1]))}`, x + 20, y + 65, 300);
  });
  roundedRect(ctx, 54, 336, 1092, 76, 6); ctx.fillStyle = 'rgba(5,9,10,0.84)'; ctx.fill();
  ctx.fillStyle = '#f7f3ea'; ctx.font = '700 18px "Microsoft YaHei", sans-serif'; ctx.fillText(`货品图鉴 ${scene.dexUnlocked} / ${scene.dexTotal}`, 78, 365);
  ctx.textAlign = 'right'; ctx.fillStyle = '#f0c84b'; ctx.fillText(`${Math.round(scene.dexPercent)}%`, 1122, 365); ctx.textAlign = 'left';
  roundedRect(ctx, 78, 380, 1044, 12, 6); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
  if (scene.dexPercent > 0) { roundedRect(ctx, 78, 380, 1044 * scene.dexPercent / 100, 12, 6); ctx.fillStyle = '#f0c84b'; ctx.fill(); }
  ctx.fillStyle = '#82d5d0'; ctx.font = '14px "Microsoft YaHei", sans-serif'; ctx.fillText(`最高价货品：${scene.topItem}`, 78, 437, 1044);
  if (scene.venueStats.length) {
    const venueSummary = scene.venueStats.slice(0, 4).map((row) => `${row.name}${row.plays}场/${row.wins}箱`).join(' · ');
    ctx.fillStyle = '#c1cac7'; ctx.font = '12px "Microsoft YaHei", sans-serif'; ctx.fillText(`场地记录：${venueSummary}`, 78, 467, 1044);
  }
  scene.sizeHints.slice(0, 6).forEach((hint, index) => {
    const x = 54 + index * 182; const color = ['#82d5d0', '#9bb7d4', '#b4d58d', '#f3c969', '#f2b5d4', '#ef8d7f'][index % 6];
    roundedRect(ctx, x, 480, 172, 58, 5); ctx.fillStyle = 'rgba(5,9,10,0.88)'; ctx.fill(); ctx.strokeStyle = `${color}66`; ctx.stroke();
    ctx.fillStyle = color; ctx.font = '800 14px "Microsoft YaHei", sans-serif'; ctx.fillText(`${hint.sizeLabel} · ${hint.count}种`, x + 11, 501, 150);
    ctx.fillStyle = '#aeb8b5'; ctx.font = '9px "Microsoft YaHei", sans-serif'; ctx.fillText(`可能：${hint.names.slice(0, 3).join(' / ')}`, x + 11, 523, 150);
  });
  if (!scene.items.length) { ctx.fillStyle = '#aeb8b5'; ctx.font = '18px "Microsoft YaHei", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('尚未成交解锁货品；上方尺寸提示仍可用于判断', 600, 650); ctx.textAlign = 'left'; }
  scene.items.slice(0, 10).forEach((item, index) => {
    const cardWidth = 204; const x = 54 + (index % 5) * 218; const y = 552 + Math.floor(index / 5) * 116;
    drawAuctionItemCard(ctx, item, x, y, cardWidth, 104);
  });
  drawAuctionFooter(ctx, view);
}

function drawAuctionScene(ctx, view) {
  const mode = view.auctionScene.mode;
  if (mode === 'assistant') drawAuctionAssistantSelection(ctx, view);
  else if (mode === 'menu') drawAuctionMenu(ctx, view);
  else if (mode === 'waiting') drawAuctionWaiting(ctx, view);
  else if (mode === 'bidding') drawAuctionBidding(ctx, view);
  else if (mode === 'result') drawAuctionResult(ctx, view);
  else drawAuctionCollection(ctx, view);
}

async function renderView(rawView) {
  const view = normalizeView(rawView);
  const width = 1200;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const backgroundPath = view.auctionScene && view.auctionScene.mode === 'result' && view.auctionScene.sold ? BACKGROUNDS.auctionOpen : backgroundFor(view.kind);
  const background = await cachedImage(backgroundPath);
  const accent = accentFor(view.kind);

  drawCover(ctx, background, width, height);
  ctx.fillStyle = 'rgba(12, 16, 18, 0.36)';
  ctx.fillRect(0, 0, width, height);

  if (view.tutorial) {
    drawTutorial(ctx, view, accent);
    return canvas.toBuffer('image/png');
  }
  if (view.pokerTable) {
    drawPokerTable(ctx, view, accent);
    return canvas.toBuffer('image/png');
  }
  if (view.blackjackTable) {
    drawBlackjackTable(ctx, view, accent);
    return canvas.toBuffer('image/png');
  }
  if (view.videoPokerScene) {
    drawVideoPokerScene(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.lotteryScene) {
    drawLotteryScene(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.deathDiceScene) {
    drawDeathDiceScene(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.loanScene) {
    drawLoanScene(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.scratchTicket) {
    drawScratchTicket(ctx, view, accent);
    return canvas.toBuffer('image/png');
  }
  if (view.dmdTable) {
    drawDmdTable(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.farkleTable) {
    drawFarkleTable(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.loveTable) {
    drawLoveTable(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.fishingScene) {
    drawFishingScene(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.dailyScene) {
    drawDailyScene(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.giftScene) {
    drawGiftScene(ctx, view);
    return canvas.toBuffer('image/png');
  }
  if (view.auctionScene) {
    drawAuctionScene(ctx, view);
    return canvas.toBuffer('image/png');
  }

  roundedRect(ctx, 56, 52, 1088, 796, 8);
  ctx.fillStyle = 'rgba(15, 20, 22, 0.84)';
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.fillRect(86, 91, 8, 70);
  ctx.fillStyle = '#f7f3ea';
  ctx.font = '700 48px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
  ctx.fillText(view.title, 116, 137, 970);
  if (view.subtitle) {
    ctx.fillStyle = '#cfd7d4';
    ctx.font = '23px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ctx.fillText(view.subtitle, 116, 174, 970);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(86, 200); ctx.lineTo(1114, 200); ctx.stroke();

  const availableBottom = view.quote ? 728 : 805;
  if (view.rankings.length) drawRankings(ctx, view.rankings, accent);
  else {
    let y = drawMeters(ctx, view.meters, accent, 222);
    if (view.tiles.length) y = drawTiles(ctx, view.tiles, accent, y);
    else if (view.modules.length) y = drawModules(ctx, view.modules, y);
    const visualSummary = view.tiles.length || view.modules.length;
    const imageLines = visualSummary ? [] : view.lines;
    const usableHeight = Math.max(80, availableBottom - y);
    const totalRowsEstimate = imageLines.reduce((n, line) => n + Math.max(1, Math.ceil(Array.from(line).length / 44)), 0);
    const estimatedRowHeight = usableHeight / Math.max(1, totalRowsEstimate);
    const fontSize = estimatedRowHeight < 30 ? 18 : estimatedRowHeight < 35 ? 20 : 23;
    const rowHeight = fontSize + 11;
    ctx.font = `${fontSize}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
    for (const line of imageLines) {
      const ranked = /^#\d+/.test(line);
      const logLine = /^·/.test(line);
      ctx.fillStyle = ranked ? accent : logLine ? '#b8c3c0' : '#f2efe8';
      const rows = wrapLine(ctx, line, 990);
      for (const row of rows) {
        if (y > availableBottom) break;
        ctx.fillText(row, 104, y, 990);
        y += rowHeight;
      }
      if (y > availableBottom) break;
    }
  }

  if (view.quote) {
    roundedRect(ctx, 86, 748, 1028, 72, 6);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = '21px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    const quoteRows = wrapLine(ctx, view.quote, 960).slice(0, 2);
    quoteRows.forEach((row, index) => ctx.fillText(row, 116, 780 + index * 27, 960));
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '15px "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('骰娘好感度 · 小游戏合集', 1114, 838);
  ctx.textAlign = 'left';
  return canvas.toBuffer('image/png');
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Access-Control-Allow-Origin': '*'
  });
  res.end(data);
}

function sendPng(res, buffer) {
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': buffer.length,
    'Cache-Control': 'private, max-age=300',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(buffer);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 512 * 1024) {
        reject(new Error('request too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (error) { reject(new Error('invalid json')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' });
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true, service: 'affection-renderer' });
    return;
  }
  const imageMatch = req.method === 'GET' ? /^\/api\/image\/([a-f0-9]{24})(?:\?.*)?$/.exec(req.url) : null;
  if (imageMatch) {
    pruneRenderedImages();
    const entry = renderedImages.get(imageMatch[1]);
    if (!entry) sendJson(res, 404, { ok: false, error: 'image expired or not found' });
    else sendPng(res, entry.buffer);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/render') {
    try {
      const view = await readJson(req);
      const png = await renderView(view);
      const id = storeRenderedImage(png);
      sendJson(res, 200, { ok: true, mime: 'image/png', url: `/api/image/${id}`, expiresIn: Math.floor(RENDER_TTL_MS / 1000) });
    } catch (error) {
      sendJson(res, error.message === 'request too large' ? 413 : 400, { ok: false, error: error.message });
    }
    return;
  }
  sendJson(res, 404, { ok: false, error: 'not found' });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Affection renderer listening on http://${HOST}:${PORT}`);
  });
}

module.exports = { renderView, normalizeView, server };
