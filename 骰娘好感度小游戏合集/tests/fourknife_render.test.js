'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { renderView } = require('../renderer/server');

test('四只刀: 渲染器生成 PNG 图像测试', async () => {
  const mockView = {
    kind: 'fourKnife',
    title: '四只刀 (Four-Knife Poker)',
    subtitle: '标准52张扑克 · 入场100币 · 底池 400',
    fourKnifeTable: {
      status: 'betting',
      phase: 'bet',
      pot: 400,
      carryPot: 800,
      isRollover: false,
      round: 2,
      currentTurn: 0,
      highestBet: 50,
      lastAction: '玩家A 加注到 50！',
      seats: [
        {
          id: 'player_1',
          name: '玩家A',
          isBot: false,
          isGuest: false,
          chips: 500,
          currentBet: 50,
          folded: false,
          arranged: true,
          isFoul: false,
          isLeader: true,
          isFourOfAKind: false,
          isSweepWinner: false,
          isFrontWinner: false,
          isBackWinner: false,
          cards: [
            { suit: 'S', rank: 'A', text: '♠A' },
            { suit: 'H', rank: 'A', text: '♥A' },
            { suit: 'D', rank: 'K', text: '♦K' },
            { suit: 'C', rank: '9', text: '♣9' }
          ],
          front: [
            { suit: 'D', rank: 'K', text: '♦K' },
            { suit: 'C', rank: '9', text: '♣9' }
          ],
          back: [
            { suit: 'S', rank: 'A', text: '♠A' },
            { suit: 'H', rank: 'A', text: '♥A' }
          ],
          frontHand: { level: 2, text: '9.5点', score: 9.5 },
          backHand: { level: 4, text: '对子 A-A', score: 114 }
        },
        {
          id: 'bot_1',
          name: '海豹姬',
          isBot: true,
          isGuest: false,
          chips: 400,
          currentBet: 0,
          folded: false,
          arranged: true,
          isFoul: false,
          isLeader: false,
          isFourOfAKind: false,
          isSweepWinner: false,
          isFrontWinner: false,
          isBackWinner: false,
          cards: [
            { suit: 'S', rank: 'J', text: '♠J' },
            { suit: 'H', rank: 'Q', text: '♥Q' },
            { suit: 'D', rank: '8', text: '♦8' },
            { suit: 'C', rank: '8', text: '♣8' }
          ],
          front: [
            { suit: 'S', rank: 'J', text: '♠J' },
            { suit: 'H', rank: 'Q', text: '♥Q' }
          ],
          back: [
            { suit: 'D', rank: '8', text: '♦8' },
            { suit: 'C', rank: '8', text: '♣8' }
          ],
          frontHand: { level: 3, text: '罗梭 (J+Q)', score: 50 },
          backHand: { level: 4, text: '对子 8-8', score: 108 }
        },
        {
          id: 'bot_2',
          name: '贪玩海豹',
          isBot: true,
          isGuest: false,
          chips: 350,
          currentBet: 0,
          folded: false,
          arranged: true,
          isFoul: true, // 模拟相公
          isLeader: false,
          isFourOfAKind: false,
          isSweepWinner: false,
          isFrontWinner: false,
          isBackWinner: false,
          cards: [
            { suit: 'S', rank: 'K', text: '♠K' },
            { suit: 'H', rank: 'K', text: '♥K' },
            { suit: 'D', rank: '3', text: '♦3' },
            { suit: 'C', rank: '4', text: '♣4' }
          ],
          front: [
            { suit: 'S', rank: 'K', text: '♠K' },
            { suit: 'H', rank: 'K', text: '♥K' }
          ],
          back: [
            { suit: 'D', rank: '3', text: '♦3' },
            { suit: 'C', rank: '4', text: '♣4' }
          ],
          frontHand: { level: 4, text: '对子 K-K', score: 113 },
          backHand: { level: 2, text: '7点', score: 7 }
        },
        {
          id: 'bot_3',
          name: '笨笨海豹',
          isBot: true,
          isGuest: false,
          chips: 200,
          currentBet: 0,
          folded: true, // 弃牌
          arranged: true,
          isFoul: false,
          isLeader: false,
          isFourOfAKind: false,
          isSweepWinner: false,
          isFrontWinner: false,
          isBackWinner: false,
          cards: [{ hidden: true }, { hidden: true }, { hidden: true }, { hidden: true }],
          front: [{ hidden: true }, { hidden: true }],
          back: [{ hidden: true }, { hidden: true }],
          frontHand: null,
          backHand: null
        }
      ],
      logs: [
        '第 2 局开始！收取底注。',
        '玩家A 为上一局平手领跑者，免收本局底注！',
        '所有玩家刁牌就绪，进入押注轮！',
        '玩家A 加注到 50！'
      ]
    },
    lines: ['阶段：押注轮 · 第 2 局', '底池：400 · 滚存：800'],
    quote: '后墩强度必须大于等于前墩；前后双赢方能通吃彩池！'
  };

  const buffer = await renderView(mockView);
  assert.ok(Buffer.isBuffer(buffer), '渲染器应当返回 Buffer');
  assert.ok(buffer.length > 5000, `生成的 PNG 大小应当正常，实际为 ${buffer.length} 字节`);
  // PNG magic number 0x89 0x50 0x4E 0x47
  assert.strictEqual(buffer[0], 0x89);
  assert.strictEqual(buffer[1], 0x50);
  assert.strictEqual(buffer[2], 0x4e);
  assert.strictEqual(buffer[3], 0x47);
  console.log(`四只刀牌桌图片渲染成功！PNG 大小: ${buffer.length} 字节`);
});

test('四只刀: 大厅界面 (Menu) 渲染测试', async () => {
  const menuView = {
    kind: 'fourKnife',
    title: '四只刀 · 牌桌大厅',
    subtitle: '台湾民间经典 Four-Knife Poker · 标准52张扑克 · 入场100币',
    fourKnifeTable: {
      status: 'menu',
      mode: 'menu',
      pot: 0,
      carryPot: 0,
      round: 1,
      currentTurn: 0,
      highestBet: 0,
      seats: [],
      logs: []
    },
    lines: [
      '人机：.四只刀 人机（1真人 + 3位AI快速开局练习）。',
      '多人：.四只刀 开房 → .四只刀 加入 → .四只刀 机器人 [数量] → .四只刀 开始。',
      '刁牌拆牌：.四只刀 刁牌 1,2（前两张作为前墩）或 .四只刀 刁牌 智能。',
      '合规约束：后墩必须 ≥ 前墩强度，否则判相公违规直接判负！'
    ],
    quote: '点击下方按钮或发送指令选择人机或开房；公开桌面默认隐藏手牌，点击私聊看牌查看。'
  };

  const buffer = await renderView(menuView);
  assert.ok(Buffer.isBuffer(buffer), '大厅渲染应当返回 Buffer');
  assert.ok(buffer.length > 5000, `大厅 PNG 大小应当正常，实际为 ${buffer.length} 字节`);
  assert.strictEqual(buffer[0], 0x89);
  console.log(`四只刀大厅图片渲染成功！PNG 大小: ${buffer.length} 字节`);
});

test('四只刀: 教程卡片 (Tutorial) 渲染测试', async () => {
  const tutorialView = {
    kind: 'fourKnife',
    title: '四只刀 (Four-Knife Poker) · 规则教程',
    subtitle: '第 1/2 页 · 发送“.四只刀 教程 2”翻页',
    tutorial: {
      layout: 'cards',
      page: 1,
      total: 2,
      entries: [
        { title: '用牌与人数', description: '使用标准52张扑克牌（不含大小王）。支持2～6人对战（常见4人桌）。', tag: '基础 1' },
        { title: '发牌与刁牌', description: '每位玩家分发4张手牌，必须将手牌拆为前墩2张与后墩2张。', tag: '流程 2' },
        { title: '相公(倒水)约束', description: '后墩强度必须 ≥ 前墩强度！若后墩严格小于前墩，判违规相公直接判负。', tag: '核心 3' },
        { title: '智能刁牌', description: '输入“.四只刀 刁牌 智能”，算法枚举全部6种拆分，自动选出合规得分最高组合。', tag: '操作 4' }
      ]
    },
    lines: ['用牌与人数：标准52张扑克', '发牌与刁牌：前2后2拆牌'],
    quote: '后墩必须大于等于前墩；智能刁牌可自动排查最优解。'
  };

  const buffer = await renderView(tutorialView);
  assert.ok(Buffer.isBuffer(buffer), '教程渲染应当返回 Buffer');
  assert.ok(buffer.length > 5000, `教程 PNG 大小应当正常，实际为 ${buffer.length} 字节`);
  assert.strictEqual(buffer[0], 0x89);
  console.log(`四只刀教程图片渲染成功！PNG 大小: ${buffer.length} 字节`);
});
