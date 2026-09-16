#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
海豹骰 (SealDice) 动画 GIF 渲染微服务 [抽牌节奏完美同步版]
优化点: 卡牌在翻转完全呈正面平躺后才触发悬念停顿，四大风格时间轴全量对齐
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import re
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from PIL import Image

# ----------------- 核心配置 -----------------
HOST = os.getenv("RA_SC_GIF_HOST", "0.0.0.0")
PORT = int(os.getenv("RA_SC_GIF_PORT", "3892"))
PUBLIC_BASE = os.getenv("RA_SC_GIF_PUBLIC_BASE", "").rstrip("/")
TAIL_SECONDS = max(60, min(655, int(os.getenv("RA_SC_GIF_TAIL_SECONDS", "300"))))

CANVAS_SIZE = int(os.getenv("RA_SC_GIF_SIZE", "600"))
WIDTH = HEIGHT = CANVAS_SIZE

FRAME_COUNT = 40
FRAME_DELAY_MS = 40
PRELUDE_SECONDS = 2.3

CUSTOM_SEALDICE_DIR = os.getenv("SEALDICE_DIR", "")


def resolve_cache_dir() -> tuple[Path, str]:
    candidates = []
    if CUSTOM_SEALDICE_DIR:
        candidates.append(Path(CUSTOM_SEALDICE_DIR))

    cur = Path(__file__).resolve().parent
    candidates.extend([cur, cur.parent, cur.parent.parent])

    for base in candidates:
        data_dir = base / "data"
        if data_dir.exists() and data_dir.is_dir():
            target = data_dir / "cache_gifs"
            target.mkdir(parents=True, exist_ok=True)
            return target, "data/cache_gifs"

    fallback = cur / "data" / "cache_gifs"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback, "data/cache_gifs"


CACHE_DIR, RELATIVE_DIR_NAME = resolve_cache_dir()

STORE: dict[str, tuple[bytes, float]] = {}
LOCK = threading.Lock()

# ----------------- 内嵌 4 风格 Canvas 渲染引擎 -----------------
EMBEDDED_HTML_ENGINE = r"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; } body { background: #03060c; }</style></head>
<body>
<canvas id="c"></canvas>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');

function setCanvasDimension(size) {
    if (canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
        canvas.style.width = size + 'px';
        canvas.style.height = size + 'px';
    }
}

function lerpColor(c1, c2, factor) {
    function parseHex(h) {
        h = h.replace('#', '');
        if (h.length === 3) h = h.split('').map(x => x+x).join('');
        return [parseInt(h.slice(0,2), 16), parseInt(h.slice(2,4), 16), parseInt(h.slice(4,6), 16)];
    }
    const [r1, g1, b1] = parseHex(c1), [r2, g2, b2] = parseHex(c2);
    return `rgb(${Math.round(r1 + (r2 - r1) * factor)}, ${Math.round(g1 + (g2 - g1) * factor)}, ${Math.round(b1 + (b2 - b1) * factor)})`;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawFacet(ctx, pts, fillStyle, strokeStyle, lineWidth = 3.5) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for(let i=1; i<pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
    if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
}

function drawDiceText(ctx, text, x, y, size = 52, color = '#ffffff') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `900 ${size}px "JetBrains Mono", "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur = 10;
    ctx.fillText(text, x, y + 2);
    ctx.restore();
}

/* ---------------- 🃏 1. 命运抽牌渲染器 (极速翻至正面) ---------------- */
function drawCardBack(ctx, w, h, S) {
    const grad = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#090d16');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, -w/2, -h/2, w, h, 14 * S);
    ctx.fill();

    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3.5 * S;
    drawRoundedRect(ctx, -w/2 + 6*S, -h/2 + 6*S, w - 12*S, h - 12*S, 10 * S);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
    ctx.lineWidth = 1.5 * S;
    drawRoundedRect(ctx, -w/2 + 12*S, -h/2 + 12*S, w - 24*S, h - 24*S, 8 * S);
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    const rw = w * 0.28, rh = h * 0.28;
    ctx.moveTo(0, -rh); ctx.lineTo(rw, 0); ctx.lineTo(0, rh); ctx.lineTo(-rw, 0);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = `900 ${20 * S}px "JetBrains Mono", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SEAL', 0, 0);
    ctx.restore();
}

function drawCardFront(ctx, w, h, dice, currentLineColor, isLit, S) {
    const grad = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
    if (dice.isDiscarded) {
        grad.addColorStop(0, '#090d16');
        grad.addColorStop(1, '#040711');
    } else {
        grad.addColorStop(0, '#131d31');
        grad.addColorStop(0.5, '#0a101d');
        grad.addColorStop(1, '#050811');
    }
    ctx.fillStyle = grad;
    drawRoundedRect(ctx, -w/2, -h/2, w, h, 14 * S);
    ctx.fill();

    ctx.strokeStyle = dice.isDiscarded ? '#334155' : currentLineColor;
    ctx.lineWidth = (isLit && !dice.isDiscarded ? 5.0 : 3.5) * S;
    if (isLit && !dice.isDiscarded) {
        ctx.shadowColor = currentLineColor;
        ctx.shadowBlur = 20 * S;
    }
    drawRoundedRect(ctx, -w/2 + 5*S, -h/2 + 5*S, w - 10*S, h - 10*S, 10 * S);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = dice.isDiscarded ? '#1e293b' : 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5 * S;
    drawRoundedRect(ctx, -w/2 + 12*S, -h/2 + 12*S, w - 24*S, h - 24*S, 8 * S);
    ctx.stroke();

    ctx.fillStyle = dice.isDiscarded ? '#475569' : (isLit ? currentLineColor : '#94a3b8');
    ctx.font = `bold ${Math.max(14 * S, 12)}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(dice.type.toUpperCase(), -w/2 + 18*S, -h/2 + 28*S);
    ctx.textAlign = 'right';
    ctx.fillText(dice.label, w/2 - 18*S, h/2 - 16*S);

    ctx.save();
    ctx.fillStyle = dice.isDiscarded ? '#475569' : '#ffffff';
    const numLen = String(dice.display).length;
    const fontSize = (numLen > 2 ? w * 0.38 : (numLen > 1 ? w * 0.46 : w * 0.54));
    ctx.font = `900 ${fontSize}px "JetBrains Mono", "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = dice.isDiscarded ? 'transparent' : 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 12 * S;
    ctx.fillText(dice.display, 0, 4 * S);
    ctx.restore();

    ctx.fillStyle = dice.isDiscarded ? '#1e293b' : 'rgba(15, 23, 42, 0.8)';
    drawRoundedRect(ctx, -w/2 + 22*S, h/2 - 44*S, w - 44*S, 24*S, 6*S);
    ctx.fill();
    ctx.fillStyle = dice.isDiscarded ? '#64748b' : (isLit ? currentLineColor : '#cbd5e1');
    ctx.font = `bold ${12 * S}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dice.label, 0, h/2 - 32*S);

    if (dice.isDiscarded) {
        ctx.save();
        ctx.translate(0, 0);
        ctx.rotate(-Math.PI / 6);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 4 * S;
        drawRoundedRect(ctx, -w * 0.35, -18 * S, w * 0.7, 36 * S, 6 * S);
        ctx.stroke();

        ctx.fillStyle = '#ef4444';
        ctx.font = `900 ${18 * S}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('✕ 弃用', 0, 0);
        ctx.restore();
    }
}

function drawCardDeck(ctx, cx, cy, S) {
    ctx.save();
    ctx.translate(cx, cy);
    const dw = 140 * S, dh = 190 * S;
    for (let i = 2; i >= 0; i--) {
        ctx.save();
        ctx.translate(i * 3 * S, -i * 3 * S);
        drawCardBack(ctx, dw, dh, S * 0.8);
        ctx.restore();
    }
    ctx.restore();
}

function getCardLayout(count, w, h, S) {
    const list = [];
    const cy = h / 2 + 16 * S;

    if (count === 1) {
        list.push({ x: w / 2, y: cy, w: 260 * S, h: 380 * S, rot: 0 });
    } else if (count === 2) {
        const offset = 150 * S;
        list.push({ x: w / 2 - offset, y: cy, w: 220 * S, h: 330 * S, rot: -0.05 });
        list.push({ x: w / 2 + offset, y: cy, w: 220 * S, h: 330 * S, rot: 0.05 });
    } else if (count === 3) {
        const offset = 210 * S;
        list.push({ x: w / 2 - offset, y: cy + 10*S, w: 180 * S, h: 280 * S, rot: -0.09 });
        list.push({ x: w / 2, y: cy - 8*S, w: 180 * S, h: 280 * S, rot: 0 });
        list.push({ x: w / 2 + offset, y: cy + 10*S, w: 180 * S, h: 280 * S, rot: 0.09 });
    } else if (count === 4) {
        const offset = 90 * S;
        list.push({ x: w / 2 - offset * 3, y: cy + 12*S, w: 150 * S, h: 235 * S, rot: -0.12 });
        list.push({ x: w / 2 - offset, y: cy - 4*S, w: 150 * S, h: 235 * S, rot: -0.04 });
        list.push({ x: w / 2 + offset, y: cy - 4*S, w: 150 * S, h: 235 * S, rot: 0.04 });
        list.push({ x: w / 2 + offset * 3, y: cy + 12*S, w: 150 * S, h: 235 * S, rot: 0.12 });
    } else {
        const spacing = (w - 80 * S) / count;
        const startX = 40 * S + spacing / 2;
        for (let i = 0; i < count; i++) {
            const mid = (count - 1) / 2;
            const rot = (i - mid) * 0.04;
            const dy = Math.abs(i - mid) * 10 * S;
            list.push({ x: startX + i * spacing, y: cy + dy, w: 130 * S, h: 200 * S, rot });
        }
    }
    return list;
}

function renderCardDrawStyle(ctx, rollConfig, p, w, h, currentLineColor, S) {
    const count = rollConfig.diceList.length;
    const cx = w / 2;
    const deckX = cx, deckY = 160 * S;

    drawCardDeck(ctx, deckX, deckY, S);
    const cardLayout = getCardLayout(count, w, h, S);

    // ★ 关键重构：将发牌与翻面全面提前到 p <= 0.30 完成，确保悬念停顿帧(p=0.45)处于 100% 正面平躺展示点数状态
    rollConfig.diceList.forEach((dice, i) => {
        const target = cardLayout[i];
        const cardW = target.w;
        const cardH = target.h;

        let curX = target.x;
        let curY = target.y;
        let curScale = 1.0;
        let curRot = target.rot;
        let flipP = 0.0;
        let opacity = 1.0;

        const dealDelay = i * 0.02;
        const dealDuration = 0.12;
        const flipDuration = 0.14;
        const flipStart = dealDelay + 0.06;
        const flipEnd = flipStart + flipDuration;

        if (p < dealDelay) {
            return;
        } else if (p < dealDelay + dealDuration) {
            const localP = (p - dealDelay) / dealDuration;
            const easeOutCubic = 1 - Math.pow(1 - localP, 3);
            curX = deckX + (target.x - deckX) * easeOutCubic;
            curY = deckY + (target.y - deckY) * easeOutCubic;
            curRot = target.rot * easeOutCubic;
            curScale = 0.6 + 0.4 * easeOutCubic;
            flipP = 0.0;
        } else if (p < flipEnd) {
            // 快速 3D 翻转阶段
            curX = target.x;
            curY = target.y;
            curRot = target.rot;
            curScale = 1.0;
            flipP = Math.min(1.0, Math.max(0.0, (p - flipStart) / flipDuration));
        } else {
            // ★ 完全平躺正面展示状态 (p >= flipEnd，覆盖 p=0.45 的 1200ms 长停)
            curX = target.x;
            curY = target.y;
            curRot = target.rot;
            curScale = 1.0;
            flipP = 1.0;
            if (dice.isDiscarded) opacity = 0.35;
        }

        const flipAngle = flipP * Math.PI;
        const sx = Math.cos(flipAngle);
        const isFront = (flipP >= 0.5);

        ctx.save();
        ctx.translate(curX, curY);
        ctx.globalAlpha = opacity;
        ctx.rotate(curRot);
        ctx.scale(Math.abs(sx) * curScale, curScale);

        if (!isFront) {
            drawCardBack(ctx, cardW, cardH, S);
        } else {
            drawCardFront(ctx, cardW, cardH, dice, currentLineColor, p >= 0.72, S);

            // 翻面瞬间扫过高光
            if (flipP > 0.5 && flipP < 0.9) {
                const sheenP = (flipP - 0.5) / 0.4;
                ctx.save();
                drawRoundedRect(ctx, -cardW/2, -cardH/2, cardW, cardH, 14 * S);
                ctx.clip();
                const gradSheen = ctx.createLinearGradient(-cardW + sheenP * cardW * 2, -cardH, -cardW/2 + sheenP * cardW * 2, cardH);
                gradSheen.addColorStop(0, 'rgba(255,255,255,0)');
                gradSheen.addColorStop(0.5, 'rgba(255,255,255,0.4)');
                gradSheen.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = gradSheen;
                ctx.fillRect(-cardW/2, -cardH/2, cardW, cardH);
                ctx.restore();
            }
        }
        ctx.restore();
    });
}

/* ---------------- 🎲 2. 晶体骰子渲染器 ---------------- */
const DiceRenderers = {
    d3(ctx, R, lineCol, val, S) {
        const h = R * 1.05;
        const p0 = [0, -h], p1 = [R * Math.cos(Math.PI/6), h * 0.5], p2 = [-R * Math.cos(Math.PI/6), h * 0.5];
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]);
        ctx.quadraticCurveTo(R * 0.8, -h * 0.3, p1[0], p1[1]);
        ctx.quadraticCurveTo(0, h * 1.15, p2[0], p2[1]);
        ctx.quadraticCurveTo(-R * 0.8, -h * 0.3, p0[0], p0[1]);
        ctx.fillStyle = '#0f172a'; ctx.fill();
        ctx.strokeStyle = lineCol; ctx.lineWidth = 5.5 * S; ctx.stroke();
        drawFacet(ctx, [[0,0], p0, p1], 'rgba(30, 41, 59, 0.4)', null);
        drawFacet(ctx, [[0,0], p1, p2], 'rgba(15, 23, 42, 0.6)', null);
        drawFacet(ctx, [[0,0], p2, p0], 'rgba(51, 65, 85, 0.3)', null);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(p0[0], p0[1]);
        ctx.moveTo(0, 0); ctx.lineTo(p1[0], p1[1]);
        ctx.moveTo(0, 0); ctx.lineTo(p2[0], p2[1]);
        ctx.strokeStyle = lineCol; ctx.lineWidth = 3.5 * S; ctx.stroke();
        drawDiceText(ctx, val, 0, h * 0.15, R * 0.52);
    },
    d2(ctx, R, lineCol, val, S) {
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a'; ctx.fill();
        ctx.strokeStyle = lineCol; ctx.lineWidth = 6.5 * S; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, Math.PI * 2);
        ctx.strokeStyle = lineCol; ctx.lineWidth = 2.8 * S; ctx.setLineDash([8 * S, 8 * S]); ctx.stroke(); ctx.setLineDash([]);
        drawDiceText(ctx, val, 0, 0, R * 0.55);
    },
    d4(ctx, R, lineCol, val, S) {
        const h = R * 1.1, pTop = [0, -h], pLeft = [-R * 0.95, h * 0.6], pRight = [R * 0.95, h * 0.6], pCenter = [0, h * 0.1];
        drawFacet(ctx, [pTop, pRight, pLeft], '#0b1120', lineCol, 5.5 * S);
        drawFacet(ctx, [pTop, pRight, pCenter], 'rgba(30, 41, 59, 0.5)', null);
        drawFacet(ctx, [pTop, pLeft, pCenter], 'rgba(51, 65, 85, 0.4)', null);
        drawFacet(ctx, [pLeft, pRight, pCenter], 'rgba(15, 23, 42, 0.8)', null);
        ctx.beginPath();
        ctx.moveTo(pTop[0], pTop[1]); ctx.lineTo(pCenter[0], pCenter[1]);
        ctx.moveTo(pLeft[0], pLeft[1]); ctx.lineTo(pCenter[0], pCenter[1]);
        ctx.moveTo(pRight[0], pRight[1]); ctx.lineTo(pCenter[0], pCenter[1]);
        ctx.strokeStyle = lineCol; ctx.lineWidth = 3.5 * S; ctx.stroke();
        drawDiceText(ctx, val, 0, h * 0.28, R * 0.5);
    },
    d6(ctx, R, lineCol, val, S) {
        const pts = [];
        for(let i=0; i<6; i++) {
            const ang = (i * 60 - 30) * Math.PI / 180;
            pts.push([R * Math.cos(ang), R * Math.sin(ang)]);
        }
        drawFacet(ctx, pts, '#0f172a', lineCol, 5.5 * S);
        drawFacet(ctx, [[0,0], pts[0], pts[1], pts[2]], 'rgba(51, 65, 85, 0.45)', lineCol, 3.2 * S);
        drawFacet(ctx, [[0,0], pts[2], pts[3], pts[4]], 'rgba(15, 23, 42, 0.7)', lineCol, 3.2 * S);
        drawFacet(ctx, [[0,0], pts[4], pts[5], pts[0]], 'rgba(30, 41, 59, 0.55)', lineCol, 3.2 * S);
        drawDiceText(ctx, val, 0, 0, R * 0.58);
    },
    d8(ctx, R, lineCol, val, S) {
        const pTop = [0, -R * 1.15], pBottom = [0, R * 1.15], pLeft = [-R * 0.9, 0], pRight = [R * 0.9, 0];
        drawFacet(ctx, [pTop, pRight, pBottom, pLeft], '#0f172a', lineCol, 5.5 * S);
        drawFacet(ctx, [pTop, pRight, [0,0]], 'rgba(51, 65, 85, 0.45)', null);
        drawFacet(ctx, [pTop, pLeft, [0,0]], 'rgba(30, 41, 59, 0.35)', null);
        drawFacet(ctx, [pBottom, pLeft, [0,0]], 'rgba(15, 23, 42, 0.7)', null);
        drawFacet(ctx, [pBottom, pRight, [0,0]], 'rgba(15, 23, 42, 0.85)', null);
        ctx.beginPath();
        ctx.moveTo(pLeft[0], pLeft[1]); ctx.lineTo(pRight[0], pRight[1]);
        ctx.moveTo(pTop[0], pTop[1]); ctx.lineTo(0, 0);
        ctx.moveTo(pBottom[0], pBottom[1]); ctx.lineTo(0, 0);
        ctx.strokeStyle = lineCol; ctx.lineWidth = 3.5 * S; ctx.stroke();
        drawDiceText(ctx, val, 0, -R * 0.15, R * 0.54);
    },
    d10(ctx, R, lineCol, val, S) {
        const pTop = [0, -R * 1.22], pBottom = [0, R * 1.12], pUpperL = [-R * 0.88, -R * 0.2], pUpperR = [R * 0.88, -R * 0.2], pLowerL = [-R * 0.55, R * 0.62], pLowerR = [R * 0.55, R * 0.62], pCenter = [0, 0];
        drawFacet(ctx, [pTop, pUpperR, pLowerR, pBottom, pLowerL, pUpperL], '#0f172a', lineCol, 5.5 * S);
        drawFacet(ctx, [pTop, pUpperR, pCenter], 'rgba(51, 65, 85, 0.5)', null);
        drawFacet(ctx, [pTop, pUpperL, pCenter], 'rgba(30, 41, 59, 0.4)', null);
        drawFacet(ctx, [pUpperR, pLowerR, pCenter], 'rgba(15, 23, 42, 0.6)', null);
        drawFacet(ctx, [pUpperL, pLowerL, pCenter], 'rgba(15, 23, 42, 0.7)', null);
        drawFacet(ctx, [pBottom, pLowerL, pCenter], 'rgba(11, 17, 32, 0.9)', null);
        drawFacet(ctx, [pBottom, pLowerR, pCenter], 'rgba(11, 17, 32, 0.9)', null);
        ctx.beginPath();
        ctx.moveTo(pTop[0], pTop[1]); ctx.lineTo(pCenter[0], pCenter[1]);
        ctx.moveTo(pBottom[0], pBottom[1]); ctx.lineTo(pCenter[0], pCenter[1]);
        ctx.moveTo(pUpperL[0], pUpperL[1]); ctx.lineTo(pCenter[0], pCenter[1]);
        ctx.moveTo(pUpperR[0], pUpperR[1]); ctx.lineTo(pCenter[0], pCenter[1]);
        ctx.strokeStyle = lineCol; ctx.lineWidth = 3.2 * S; ctx.stroke();
        drawDiceText(ctx, val, 0, -R * 0.05, String(val).length > 1 ? R * 0.48 : R * 0.56);
    },
    d12(ctx, R, lineCol, val, S) {
        const outerPts = [];
        for(let i=0; i<10; i++) {
            const ang = (i * 36 - 90) * Math.PI / 180;
            outerPts.push([R * Math.cos(ang), R * Math.sin(ang)]);
        }
        drawFacet(ctx, outerPts, '#0b1120', lineCol, 5.5 * S);
        const innerPts = [];
        for(let i=0; i<5; i++) {
            const ang = (i * 72 - 90) * Math.PI / 180;
            innerPts.push([R * 0.56 * Math.cos(ang), R * 0.56 * Math.sin(ang)]);
        }
        drawFacet(ctx, innerPts, 'rgba(30, 41, 59, 0.65)', lineCol, 3.5 * S);
        ctx.beginPath();
        for(let i=0; i<5; i++) { ctx.moveTo(innerPts[i][0], innerPts[i][1]); ctx.lineTo(outerPts[i * 2][0], outerPts[i * 2][1]); }
        ctx.strokeStyle = lineCol; ctx.lineWidth = 2.8 * S; ctx.stroke();
        drawDiceText(ctx, val, 0, 0, R * 0.5);
    },
    d20(ctx, R, lineCol, val, S) {
        const hexPts = [];
        for(let i=0; i<6; i++) {
            const ang = (i * 60 - 30) * Math.PI / 180;
            hexPts.push([R * Math.cos(ang), R * Math.sin(ang)]);
        }
        drawFacet(ctx, hexPts, '#0b1120', lineCol, 5.5 * S);
        const triPts = [[0, -R * 0.65], [R * 0.56, R * 0.32], [-R * 0.56, R * 0.32]];
        drawFacet(ctx, triPts, 'rgba(51, 65, 85, 0.55)', lineCol, 3.5 * S);
        ctx.beginPath();
        ctx.moveTo(triPts[0][0], triPts[0][1]); ctx.lineTo(hexPts[0][0], hexPts[0][1]);
        ctx.moveTo(triPts[0][0], triPts[0][1]); ctx.lineTo(hexPts[1][0], hexPts[1][1]);
        ctx.moveTo(triPts[1][0], triPts[1][1]); ctx.lineTo(hexPts[2][0], hexPts[2][1]);
        ctx.moveTo(triPts[1][0], triPts[1][1]); ctx.lineTo(hexPts[3][0], hexPts[3][1]);
        ctx.moveTo(triPts[2][0], triPts[2][1]); ctx.lineTo(hexPts[4][0], hexPts[4][1]);
        ctx.moveTo(triPts[2][0], triPts[2][1]); ctx.lineTo(hexPts[5][0], hexPts[5][1]);
        ctx.strokeStyle = lineCol; ctx.lineWidth = 2.8 * S; ctx.stroke();
        drawDiceText(ctx, val, 0, 0, R * 0.5);
    }
};

function getMultiElementLayout(count, w, h, isDial, S) {
    const list = [], cy = h / 2 + 10 * S;
    if (count === 1) {
        list.push({ x: w / 2, y: cy, r: (isDial ? 330 : 330) * S });
    } else if (count === 2) {
        const offset = (isDial ? 245 : 240) * S;
        list.push({ x: w / 2 - offset, y: cy, r: (isDial ? 220 : 250) * S });
        list.push({ x: w / 2 + offset, y: cy, r: (isDial ? 220 : 250) * S });
    } else if (count === 3) {
        const offset = (isDial ? 350 : 355) * S;
        list.push({ x: w / 2 - offset, y: cy, r: (isDial ? 160 : 175) * S });
        list.push({ x: w / 2, y: cy, r: (isDial ? 160 : 175) * S });
        list.push({ x: w / 2 + offset, y: cy, r: (isDial ? 160 : 175) * S });
    } else if (count === 4) {
        const offX = (isDial ? 255 : 260) * S, offY = (isDial ? 180 : 185) * S;
        list.push({ x: w / 2 - offX, y: cy - offY, r: (isDial ? 150 : 160) * S });
        list.push({ x: w / 2 + offX, y: cy - offY, r: (isDial ? 150 : 160) * S });
        list.push({ x: w / 2 - offX, y: cy + offY, r: (isDial ? 150 : 160) * S });
        list.push({ x: w / 2 + offX, y: cy + offY, r: (isDial ? 150 : 160) * S });
    } else {
        const spacingX = (isDial ? 320 : 325) * S, offY = (isDial ? 180 : 185) * S;
        for (let i = 0; i < count; i++) {
            const row = Math.floor(i / 3), col = i % 3;
            list.push({ x: w / 2 + (col - 1) * spacingX, y: cy + (row === 0 ? -offY : offY), r: (isDial ? 130 : 140) * S });
        }
    }
    return list;
}

function renderDiceStyle(ctx, rollConfig, p, w, h, currentLineColor, S) {
    const layout = getMultiElementLayout(rollConfig.diceList.length, w, h, false, S);
    rollConfig.diceList.forEach((dice, i) => {
        const pos = layout[i], R = pos.r;
        let sx = 1.0, sy = 1.0, rot = 0.0, displayVal = dice.display, opacity = 1.0;
        const seedX = (i + 1) * 2.1, seedY = (i + 1) * 3.7;

        if (p < 0.28) {
            const normP = p / 0.28;
            sx = Math.cos(normP * 14 * Math.PI + seedX);
            sy = Math.cos(normP * 11 * Math.PI + seedY);
            rot = Math.sin(normP * 8 * Math.PI + seedX) * 0.22;
            const max = dice.sectors || 10;
            if (dice.isTens) displayVal = String(Math.floor(Math.random() * 10) * 10);
            else if (dice.type === 'd2') displayVal = Math.random() > 0.5 ? '正' : '反';
            else displayVal = String(Math.floor(Math.random() * max) + 1);
        } else if (p < 0.34) {
            const settleP = (p - 0.28) / 0.06;
            const bounce = 1 + 1.8 * Math.pow(settleP - 1, 3) + 1.2 * Math.pow(settleP - 1, 2);
            sx = Math.min(1.15, Math.max(0.1, bounce));
            sy = Math.min(1.15, Math.max(0.1, bounce));
        } else {
            sx = 1.0; sy = 1.0; rot = 0.0;
            if (dice.isDiscarded) opacity = 0.30;
        }

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.globalAlpha = opacity;
        ctx.rotate(rot);
        ctx.scale(sx, sy);
        if (p >= 0.72 && !dice.isDiscarded) {
            ctx.shadowColor = currentLineColor;
            ctx.shadowBlur = 20 * S;
        }
        const renderer = DiceRenderers[dice.type] || DiceRenderers.d6;
        renderer(ctx, R, dice.isDiscarded ? '#475569' : currentLineColor, displayVal, S);

        if (dice.isDiscarded && p >= 0.34) {
            ctx.beginPath(); ctx.moveTo(-R * 0.7, -R * 0.7); ctx.lineTo(R * 0.7, R * 0.7);
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 6 * S; ctx.stroke();
        }
        if (dice.isChosen && rollConfig.diceList.length > 2 && p >= 0.34 && !dice.isDiscarded) {
            ctx.beginPath(); ctx.arc(0, 0, R * 1.15, 0, Math.PI * 2);
            ctx.strokeStyle = currentLineColor; ctx.lineWidth = 3.5 * S; ctx.setLineDash([12 * S, 8 * S]); ctx.stroke();
        }
        ctx.restore();
    });
}

/* ---------------- 🎡 3. 命运表盘渲染器 ---------------- */
function renderRouletteStyle(ctx, rollConfig, p, w, h, currentLineColor, S) {
    const layout = getMultiElementLayout(rollConfig.diceList.length, w, h, true, S);
    rollConfig.diceList.forEach((dice, i) => {
        const pos = layout[i], R = pos.r, N = dice.sectors || 10, k = dice.chosenIdx;
        const sliceAng = (Math.PI * 2) / N;
        const settleAngle = -Math.PI / 2 - (k + 0.5) * sliceAng;
        let curAngle = settleAngle, opacity = 1.0;

        if (p < 0.32) {
            const normP = p / 0.32;
            const spinEase = 1 - Math.pow(1 - normP, 3);
            curAngle = settleAngle + (1 - spinEase) * ((12 + i * 4) * Math.PI * 2);
        } else if (dice.isDiscarded) {
            opacity = 0.35;
        }

        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.globalAlpha = opacity;
        ctx.save();
        ctx.rotate(curAngle);

        for (let idx = 0; idx < N; idx++) {
            const a0 = idx * sliceAng, a1 = (idx + 1) * sliceAng;
            ctx.beginPath();
            ctx.arc(0, 0, R, a0, a1);
            ctx.arc(0, 0, R * 0.35, a1, a0, true);
            ctx.closePath();

            const isTarget = (idx === k);
            ctx.fillStyle = (isTarget && p >= 0.72 && !dice.isDiscarded) ? 'rgba(30, 58, 138, 0.9)' : ((idx % 2 === 0) ? '#0f172a' : '#1e293b');
            ctx.fill();
            ctx.strokeStyle = (isTarget && p >= 0.72 && !dice.isDiscarded) ? currentLineColor : '#334155';
            ctx.lineWidth = (isTarget ? 3.5 : 2.0) * S;
            ctx.stroke();

            const midA = a0 + sliceAng / 2, midR = R * 0.68;
            ctx.save();
            ctx.translate(Math.cos(midA) * midR, Math.sin(midA) * midR);
            ctx.rotate(midA + Math.PI / 2);
            ctx.fillStyle = (isTarget && p >= 0.72 && !dice.isDiscarded) ? currentLineColor : '#f8fafc';
            ctx.font = `900 ${R > 120 * S ? 30 * S : (R > 80 * S ? 22 * S : 16 * S)}px "JetBrains Mono", sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(dice.sectorItems[idx], 0, 0);
            ctx.restore();
        }

        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 4.5 * S; ctx.stroke();
        for (let idx = 0; idx < N; idx++) {
            const a = idx * sliceAng;
            ctx.beginPath(); ctx.arc(Math.cos(a) * R, Math.sin(a) * R, 4.5 * S, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b'; ctx.fill();
        }
        ctx.restore();

        ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = '#070d1a'; ctx.fill();
        ctx.strokeStyle = (p >= 0.72 && !dice.isDiscarded) ? currentLineColor : '#475569';
        ctx.lineWidth = 3.5 * S; ctx.stroke();
        drawDiceText(ctx, dice.display, 0, 0, R * 0.32, (p >= 0.72 && !dice.isDiscarded) ? currentLineColor : '#fff');

        const wiggle = (p < 0.32) ? Math.sin(p * 50 + i) * 0.18 : 0;
        ctx.save();
        ctx.translate(0, -R); ctx.rotate(wiggle);
        const ptrSize = Math.max(22 * S, R * 0.22);
        ctx.beginPath(); ctx.moveTo(0, ptrSize * 0.9); ctx.lineTo(-ptrSize * 0.5, -ptrSize * 0.4); ctx.lineTo(ptrSize * 0.5, -ptrSize * 0.4); ctx.closePath();
        ctx.fillStyle = dice.isDiscarded ? '#64748b' : '#f59e0b';
        ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 12 * S; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.0 * S; ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#94a3b8'; ctx.font = `bold ${20 * S}px "Segoe UI", sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(dice.label, 0, R + 26 * S);

        if (dice.isDiscarded && p >= 0.34) {
            ctx.beginPath(); ctx.moveTo(-R * 0.6, -R * 0.6); ctx.lineTo(R * 0.6, R * 0.6);
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 6 * S; ctx.stroke();
            ctx.fillStyle = '#ef4444'; ctx.font = `900 ${20 * S}px sans-serif`;
            ctx.fillText('✕ 弃用', 0, R + 52 * S);
        }
        ctx.restore();
    });
}

/* ---------------- 🎰 4. 赛博老虎机渲染器 ---------------- */
function renderSlotStyle(ctx, rollConfig, p, w, h, currentLineColor, S) {
    const cx = w / 2, cy = h / 2 + 10 * S, diceList = rollConfig.diceList, count = diceList.length;
    const boxHeight = 630 * S;
    const boxWidth = Math.min(1080 * S, Math.max(520 * S, (count * 200 + 100) * S));

    ctx.save();
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(cx - boxWidth / 2, cy - boxHeight / 2, boxWidth, boxHeight);
    ctx.strokeStyle = currentLineColor; ctx.lineWidth = 6 * S;
    if (p >= 0.72) { ctx.shadowColor = currentLineColor; ctx.shadowBlur = 25 * S; }
    ctx.strokeRect(cx - boxWidth / 2, cy - boxHeight / 2, boxWidth, boxHeight);

    ctx.fillStyle = '#1e293b'; ctx.fillRect(cx - boxWidth / 2 + 30 * S, cy - boxHeight / 2 - 46 * S, boxWidth - 60 * S, 52 * S);
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 3 * S; ctx.strokeRect(cx - boxWidth / 2 + 30 * S, cy - boxHeight / 2 - 46 * S, boxWidth - 60 * S, 52 * S);
    ctx.fillStyle = '#f59e0b'; ctx.font = `900 ${24 * S}px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillText('✦ SEAL DICE MULTI-SLOTS ✦', cx, cy - boxHeight / 2 - 12 * S);

    const reelWidth = (boxWidth - 50 * S) / count, startX = cx - (boxWidth - 50 * S) / 2;
    const reelHeight = 490 * S;

    diceList.forEach((dice, idx) => {
        const rx = startX + idx * reelWidth + reelWidth / 2, ry = cy, stopTime = 0.22 + idx * 0.04;
        const isRolling = (p < stopTime);

        ctx.save();
        ctx.beginPath(); ctx.rect(rx - reelWidth / 2 + 4 * S, ry - reelHeight / 2, reelWidth - 8 * S, reelHeight); ctx.clip();
        ctx.fillStyle = dice.isDiscarded ? '#050811' : '#070d1a';
        ctx.fillRect(rx - reelWidth / 2 + 4 * S, ry - reelHeight / 2, reelWidth - 8 * S, reelHeight);

        if (isRolling) {
            const speedOffset = (p * 5500 * (idx + 1)) % (280 * S);
            for (let n = -2; n <= 3; n++) {
                const drawY = ry + n * 140 * S + speedOffset - 140 * S;
                const randVal = Math.floor(Math.random() * dice.sectors) * (dice.isTens ? 10 : 1);
                ctx.fillStyle = 'rgba(148, 163, 184, 0.4)'; ctx.font = `bold ${64 * S}px "JetBrains Mono", monospace`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(randVal), rx, drawY);
            }
        } else {
            const settleElapsed = p - stopTime;
            let bounceY = (settleElapsed < 0.06) ? Math.sin(settleElapsed / 0.06 * Math.PI) * 22 * S : 0;
            ctx.fillStyle = dice.isDiscarded ? '#475569' : (p >= 0.72 ? currentLineColor : '#f8fafc');
            ctx.font = `900 ${reelWidth > 180 * S ? 92 * S : (reelWidth > 120 * S ? 70 * S : 50 * S)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(dice.display, rx, ry + bounceY);

            ctx.fillStyle = 'rgba(71, 85, 105, 0.35)'; ctx.font = `bold ${44 * S}px "JetBrains Mono", monospace`;
            ctx.fillText(String((dice.value + 1) % 100), rx, ry - 130 * S + bounceY);
            ctx.fillText(String((dice.value + 99) % 100), rx, ry + 130 * S + bounceY);

            if (dice.isDiscarded) {
                ctx.beginPath(); ctx.moveTo(rx - 45 * S, ry - 45 * S); ctx.lineTo(rx + 45 * S, ry + 45 * S);
                ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 6.0 * S; ctx.stroke();
            }
        }
        ctx.restore();

        ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 3.5 * S;
        ctx.strokeRect(rx - reelWidth / 2 + 4 * S, ry - reelHeight / 2, reelWidth - 8 * S, reelHeight);
        ctx.fillStyle = dice.isDiscarded ? '#ef4444' : '#38bdf8';
        ctx.font = `bold ${20 * S}px "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.fillText(dice.label, rx, ry - reelHeight / 2 - 12 * S);
    });

    ctx.beginPath(); ctx.moveTo(cx - boxWidth / 2 + 15 * S, cy); ctx.lineTo(cx + boxWidth / 2 - 15 * S, cy);
    ctx.strokeStyle = p >= 0.72 ? currentLineColor : 'rgba(245, 158, 11, 0.6)'; ctx.lineWidth = 5.0 * S;
    ctx.setLineDash([14 * S, 10 * S]); ctx.stroke(); ctx.setLineDash([]);

    ctx.fillStyle = currentLineColor;
    ctx.beginPath(); ctx.moveTo(cx - boxWidth / 2 + 8 * S, cy - 12 * S); ctx.lineTo(cx - boxWidth / 2 + 28 * S, cy); ctx.lineTo(cx - boxWidth / 2 + 8 * S, cy + 12 * S);
    ctx.moveTo(cx + boxWidth / 2 - 8 * S, cy - 12 * S); ctx.lineTo(cx + boxWidth / 2 - 28 * S, cy); ctx.lineTo(cx + boxWidth / 2 - 8 * S, cy + 12 * S);
    ctx.fill();

    if (rollConfig.modifier !== 0) {
        ctx.fillStyle = '#f59e0b'; ctx.font = `bold ${22 * S}px "JetBrains Mono", monospace`; ctx.textAlign = 'right';
        ctx.fillText(`加值: +${rollConfig.modifier}`, cx + boxWidth / 2 - 15 * S, cy + boxHeight / 2 - 15 * S);
    }
    ctx.restore();
}

/* ---------------- 💥 5. 全套成功等级高能大招视效 ---------------- */
function renderFumbleFX(ctx, w, h, intensity, S) {
    ctx.save(); ctx.globalAlpha = intensity;
    const cx = w / 2, cy = h / 2 + 10 * S;
    const grad = ctx.createRadialGradient(cx, cy, 15 * S, cx, cy, 480 * S);
    grad.addColorStop(0, 'rgba(40, 0, 10, 0.92)'); grad.addColorStop(0.5, 'rgba(15, 0, 5, 0.65)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

    for (let i = 0; i < 5; i++) {
        const ang = (i * (Math.PI * 2) / 5) + 0.3, len = 240 * S * intensity;
        const tx = cx + Math.cos(ang) * len, ty = cy + Math.sin(ang) * len;
        const cpx = cx + Math.cos(ang + 0.6) * (len * 0.7), cpy = cy + Math.sin(ang + 0.6) * (len * 0.7);
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cpx, cpy, tx, ty);
        ctx.strokeStyle = '#180206'; ctx.lineWidth = 21 * S * intensity; ctx.lineCap = 'round'; ctx.stroke();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3.5 * S; ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'; ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8 * S; ctx.lineWidth = 3.5 * S;
    [0.2, 0.9, 1.8, 2.7, 3.6, 4.4, 5.3].forEach(ang => {
        ctx.beginPath(); ctx.moveTo(cx, cy);
        let curX = cx, curY = cy;
        for (let step = 0; step < 4; step++) {
            curX += Math.cos(ang + (step % 2 === 0 ? 0.2 : -0.2)) * (75 + step * 38) * S;
            curY += Math.sin(ang + (step % 2 === 0 ? 0.2 : -0.2)) * (75 + step * 38) * S;
            ctx.lineTo(curX, curY);
        }
        ctx.stroke();
    });
    [120 * S, 240 * S, 390 * S].forEach(r => {
        ctx.beginPath();
        for (let i = 0; i <= 8; i++) {
            const a = (i * Math.PI * 2) / 8, cr = r + (i % 2 === 0 ? 22 * S : -22 * S);
            const px = cx + Math.cos(a) * cr, py = cy + Math.sin(a) * cr;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.stroke();
    });
    ctx.restore();
}

function renderCritFX(ctx, w, h, intensity, S) {
    ctx.save(); ctx.globalAlpha = intensity;
    const cx = w / 2, cy = h / 2 + 15 * S;
    for (let i = 0; i < 14; i++) {
        const ang = (i * Math.PI * 2) / 14;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, 540 * S, ang, ang + 0.14); ctx.closePath();
        ctx.fillStyle = (i % 2 === 0) ? 'rgba(245, 158, 11, 0.15)' : 'rgba(251, 191, 36, 0.07)'; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 210 * S, 0, Math.PI * 2); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 4.5 * S; ctx.shadowColor = '#f59e0b'; ctx.shadowBlur = 20 * S; ctx.stroke();
    ctx.restore();
}

function renderArcaneFX(ctx, w, h, intensity, color, S) {
    ctx.save(); ctx.globalAlpha = intensity;
    const cx = w / 2, cy = h / 2 + 15 * S;
    [150 * S, 240 * S, 330 * S].forEach((baseR, idx) => {
        ctx.beginPath(); ctx.arc(cx, cy, baseR + idx * 30 * S * (1 - intensity), 0, Math.PI * 2);
        ctx.strokeStyle = color; ctx.lineWidth = 3.5 * S; ctx.shadowColor = color; ctx.shadowBlur = 16 * S; ctx.setLineDash([18 * S, 15 * S]); ctx.stroke();
    });
    ctx.restore();
}

function renderSuccessFX(ctx, w, h, intensity, S) {
    ctx.save(); ctx.globalAlpha = intensity;
    const cx = w / 2, cy = h / 2 + 15 * S;
    const grad = ctx.createRadialGradient(cx, cy, 45 * S, cx, cy, 300 * S);
    grad.addColorStop(0, 'rgba(16, 185, 129, 0.25)'); grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.06)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(cx, cy, 195 * S, 0, Math.PI * 2); ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3.5 * S; ctx.shadowColor = '#10b981'; ctx.shadowBlur = 16 * S; ctx.stroke();
    ctx.restore();
}

/* ---------------- 🚀 主时间轴渲染与帧合成 ---------------- */
window.renderFrame = function(rollConfig, visualStyle, p, targetSize) {
    setCanvasDimension(targetSize);
    const w = targetSize, h = targetSize;
    const S = targetSize / 1200.0;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#03060c';
    ctx.fillRect(0, 0, w, h);

    let currentLineColor = '#64748b';
    if (p < 0.65) currentLineColor = '#94a3b8';
    else if (p < 0.85) currentLineColor = lerpColor('#94a3b8', rollConfig.targetColor, (p - 0.65) / 0.20);
    else currentLineColor = rollConfig.targetColor;

    if (p >= 0.72) {
        const fxIntensity = Math.min(1.0, (p - 0.72) / 0.18);
        if (rollConfig.rankType === 'fumble') renderFumbleFX(ctx, w, h, fxIntensity, S);
        else if (rollConfig.rankType === 'crit') renderCritFX(ctx, w, h, fxIntensity, S);
        else if (rollConfig.rankType === 'extreme' || rollConfig.rankType === 'hard') renderArcaneFX(ctx, w, h, fxIntensity, rollConfig.targetColor, S);
        else if (rollConfig.rankType === 'success') renderSuccessFX(ctx, w, h, fxIntensity, S);
    }

    if (visualStyle === 'card') renderCardDrawStyle(ctx, rollConfig, p, w, h, currentLineColor, S);
    else if (visualStyle === 'dice') renderDiceStyle(ctx, rollConfig, p, w, h, currentLineColor, S);
    else if (visualStyle === 'roulette') renderRouletteStyle(ctx, rollConfig, p, w, h, currentLineColor, S);
    else if (visualStyle === 'slot') renderSlotStyle(ctx, rollConfig, p, w, h, currentLineColor, S);

    // 顶部标题
    ctx.save();
    ctx.fillStyle = 'rgba(7, 10, 18, 0.9)'; ctx.fillRect(60 * S, 48 * S, w - 120 * S, 108 * S);
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 4.5 * S; ctx.strokeRect(60 * S, 48 * S, w - 120 * S, 108 * S);
    ctx.fillStyle = '#94a3b8'; ctx.font = `bold ${42 * S}px "Segoe UI", sans-serif`; ctx.textAlign = 'center';
    ctx.fillText(`【海豹骰】${rollConfig.title}`, w / 2, 116 * S);
    ctx.restore();

    // 底部结算横幅
    if (p >= 0.72) {
        ctx.save();
        ctx.globalAlpha = Math.min(1.0, (p - 0.72) / 0.12);
        ctx.strokeStyle = rollConfig.targetColor; ctx.lineWidth = 15 * S; ctx.shadowColor = rollConfig.targetColor; ctx.shadowBlur = 30 * S;
        ctx.strokeRect(12 * S, 12 * S, w - 24 * S, h - 24 * S);

        ctx.fillStyle = 'rgba(7, 10, 18, 0.95)'; ctx.fillRect(60 * S, h - 195 * S, w - 120 * S, 138 * S);
        ctx.strokeStyle = rollConfig.targetColor; ctx.lineWidth = 5.0 * S; ctx.strokeRect(60 * S, h - 195 * S, w - 120 * S, 138 * S);
        ctx.fillStyle = rollConfig.targetColor; ctx.font = `900 ${48 * S}px "Segoe UI", sans-serif`; ctx.textAlign = 'center';

        if (rollConfig.target !== null && rollConfig.target !== undefined && rollConfig.target > 0) {
            ctx.fillText(`${rollConfig.finalTotal} / ${rollConfig.target} 【${rollConfig.rankText}】`, w / 2, h - 108 * S);
        } else {
            ctx.fillText(`投掷结果: ${rollConfig.finalTotal} 【${rollConfig.rankText}】`, w / 2, h - 108 * S);
        }
        ctx.restore();
    }
};

window.renderSpecificFramesBase64 = function(rollConfig, visualStyle, pList, targetSize) {
    setCanvasDimension(targetSize);
    const frames = [];
    for (let i = 0; i < pList.length; i++) {
        window.renderFrame(rollConfig, visualStyle, pList[i], targetSize);
        frames.push(canvas.toDataURL('image/jpeg', 0.82).slice(23));
    }
    return frames;
};
</script>
</body>
</html>"""


# ----------------- 规则与特效解析 -----------------
def resolve_rank_and_fx(rank_text: str, custom_color: str | None = None) -> tuple[str, str, str]:
    t = str(rank_text or "").strip()
    if not t:
        return "neutral", "投掷完成", custom_color or "#38bdf8"
    if any(k in t for k in ["大失败", "大绝败", "fumble", "botch", "天然 1", "天然1"]):
        return "fumble", t, custom_color or "#ef4444"
    if any(k in t for k in ["大成功", "极佳", "critical", "crit", "天然 20", "天然20"]):
        return "crit", t, custom_color or "#f59e0b"
    if any(k in t for k in ["极难成功", "极难", "extreme"]):
        return "extreme", t, custom_color or "#a855f7"
    if any(k in t for k in ["困难成功", "困难", "hard"]):
        return "hard", t, custom_color or "#38bdf8"
    if any(k in t for k in ["普通成功", "成功", "通过", "success", "pass"]):
        return "success", t, custom_color or "#10b981"
    if any(k in t for k in ["失败", "未通过", "fail", "failure"]):
        return "fail", t, custom_color or "#f43f5e"
    return "neutral", t, custom_color or "#38bdf8"


def build_roll_config(payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
    mode = str(payload.get("mode", "coc")).lower()
    raw_style = str(payload.get("style", "card")).lower()

    if raw_style in {"card", "抽牌", "卡牌", "牌", "c"}:
        style = "card"
    elif raw_style in {"dice", "骰子", "晶体骰子", "d"}:
        style = "dice"
    elif raw_style in {"roulette", "轮盘", "表盘", "命运表盘", "r"}:
        style = "roulette"
    elif raw_style in {"slot", "老虎机", "多轴老虎机", "s"}:
        style = "slot"
    else:
        style = "card"

    skill = str(payload.get("skill") or "检定")[:40]
    result = int(payload.get("result", 1))
    target = payload.get("target")
    target_val = int(target) if (target is not None and str(target).isdigit()) else None

    raw_rank_text = str(payload.get("rank_text") or payload.get("rank") or "").strip()
    rank_type, rank_text, color = resolve_rank_and_fx(raw_rank_text, payload.get("color"))

    dice_list: list[dict[str, Any]] = []
    modifier = int(payload.get("bonus", 0) or payload.get("modifier", 0))

    raw_breakdown = payload.get("dice_breakdown")
    if isinstance(raw_breakdown, list) and len(raw_breakdown) > 0:
        for idx, item in enumerate(raw_breakdown[:6]):
            val = int(item.get("value", 1))
            stype_raw = str(item.get("type", "d6")).lower()
            is_tens = bool(item.get("isTens", False))

            sides_match = re.search(r"d(\d+)", stype_raw)
            sides = 10 if is_tens else (int(sides_match.group(1)) if sides_match else 6)
            stype = f"d{sides}"

            display = str(item.get("display") or val)
            if is_tens:
                display = "00" if val == 0 else ("00" if val < 10 else str(val))

            dice_list.append({
                "type": stype if stype in {"d2", "d3", "d4", "d6", "d8", "d10", "d12", "d20"} else "d6",
                "label": str(item.get("label") or f"{stype.upper()}#{idx+1}"),
                "value": val,
                "display": display,
                "sectors": sides,
                "sectorItems": (
                    ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"]
                    if is_tens
                    else (["正", "反"] if sides == 2 else [str(i) for i in range(1, sides + 1)])
                ),
                "chosenIdx": (val // 10) % 10 if is_tens else (val - 1 if sides > 2 else (0 if val == 1 else 1)),
                "isTens": is_tens,
                "isChosen": bool(item.get("isChosen", True)),
                "isDiscarded": bool(item.get("isDiscarded", False)),
            })
    elif mode in {"coc", "sc"}:
        units = result % 10 if result < 100 else 0
        tens = (result // 10) * 10 if result < 100 else 0
        bp = str(payload.get("bp") or payload.get("advantage") or "").lower()
        bp_count = 1 + (int(bp[1:]) if bp[1:].isdigit() else 1) if bp[:1] in {"b", "p"} else 1
        bp_count = max(1, min(3, bp_count))

        tens_values = [tens]
        for i in range(bp_count - 1):
            tens_values.append((tens + (i + 1) * 30) % 100)

        chosen_idx = 0
        candidates = [t + units if not (t == 0 and units == 0) else 100 for t in tens_values]
        if bp[:1] == "b":
            chosen_idx = min(range(len(candidates)), key=lambda i: candidates[i])
        elif bp[:1] == "p":
            chosen_idx = max(range(len(candidates)), key=lambda i: candidates[i])

        for idx, t in enumerate(tens_values):
            dice_list.append({
                "type": "d10",
                "label": f"十位#{idx+1}" if bp_count > 1 else "十位",
                "value": t,
                "display": "00" if (t == 0 and units == 0) else ("00" if t < 10 else str(t)),
                "sectors": 10,
                "sectorItems": ["00", "10", "20", "30", "40", "50", "60", "70", "80", "90"],
                "chosenIdx": (t // 10) % 10,
                "isTens": True,
                "isChosen": idx == chosen_idx,
                "isDiscarded": idx != chosen_idx and bp_count > 1,
            })
        dice_list.append({
            "type": "d10",
            "label": "个位",
            "value": units,
            "display": str(units),
            "sectors": 10,
            "sectorItems": [str(i) for i in range(10)],
            "chosenIdx": units % 10,
            "isTens": False,
            "isChosen": True,
            "isDiscarded": False,
        })
    else:
        expr = str(payload.get("expression") or payload.get("skill") or "")
        dice_matches = re.findall(r"(\d*)[dD](\d+)", expr)
        dice_count_param = int(payload.get("dice_count", 0))

        dice_pool: list[int] = []
        if dice_matches:
            for count_str, max_str in dice_matches:
                cnt = int(count_str) if count_str else 1
                mx = int(max_str)
                dice_pool.extend([mx] * cnt)
        elif dice_count_param > 1:
            sides_param = int(payload.get("sides", 6))
            dice_pool = [sides_param] * min(6, dice_count_param)
        else:
            sides_param = int(payload.get("sides", 20 if mode == "dnd" else 6))
            dice_pool = [sides_param]

        if len(dice_pool) == 1:
            sides = dice_pool[0]
            disp = ("正" if result == 1 else "反") if sides == 2 else str(result)
            dice_list.append({
                "type": f"d{sides}" if sides in {2, 3, 4, 6, 8, 10, 12, 20} else "d6",
                "label": f"D{sides}",
                "value": result,
                "display": disp,
                "sectors": sides,
                "sectorItems": ["正", "反"] if sides == 2 else [str(i) for i in range(1, sides + 1)],
                "chosenIdx": result - 1 if sides > 2 else (0 if result == 1 else 1),
                "isChosen": True,
                "isDiscarded": False,
            })
        else:
            rem = result - modifier
            for idx, mx in enumerate(dice_pool[:6]):
                val = max(1, min(mx, int(round(rem / max(1, len(dice_pool) - idx)))))
                rem -= val
                dice_list.append({
                    "type": f"d{mx}" if mx in {2, 3, 4, 6, 8, 10, 12, 20} else "d6",
                    "label": f"D{mx}#{idx+1}",
                    "value": val,
                    "display": str(val),
                    "sectors": mx,
                    "sectorItems": [str(i) for i in range(1, mx + 1)],
                    "chosenIdx": val - 1,
                    "isChosen": True,
                    "isDiscarded": False,
                })

    config = {
        "mode": mode,
        "title": skill,
        "target": target_val,
        "diceList": dice_list,
        "modifier": modifier,
        "finalTotal": result,
        "rankType": rank_type,
        "rankText": rank_text,
        "targetColor": color,
    }
    return config, style


# ----------------- Headless 渲染引擎 -----------------
class HeadlessCanvasRenderer:
    def __init__(self):
        self._browser = None
        self._page = None
        self._lock = asyncio.Lock()
        self._loop = None
        self._thread = None
        self._ready_event = threading.Event()
        self._start_thread()

    def _start_thread(self):
        def _runner():
            if os.name == "nt":
                asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            self._loop.run_until_complete(self._init_browser())
            self._ready_event.set()
            self._loop.run_forever()

        self._thread = threading.Thread(target=_runner, daemon=True)
        self._thread.start()
        self._ready_event.wait(timeout=15)

    async def _init_browser(self):
        try:
            from playwright.async_api import async_playwright

            pw = await async_playwright().start()
            self._browser = await pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            )
            self._page = await self._browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
            await self._page.set_content(EMBEDDED_HTML_ENGINE)
            print(f"[Renderer] 极速秒发渲染引擎已就绪 (支持 4 风格 | 规格: {WIDTH}x{HEIGHT})")
        except Exception as e:
            print(f"[Renderer Error] Playwright 启动失败: {e}")

    def render_frames(self, roll_config: dict[str, Any], style: str, p_list: list[float]) -> list[bytes] | None:
        if not self._loop or not self._page:
            return None

        async def _exec():
            async with self._lock:
                raw_b64_list = await self._page.evaluate(
                    """([config, style, pList, targetSize]) => {
                        return window.renderSpecificFramesBase64(config, style, pList, targetSize);
                    }""",
                    [roll_config, style, p_list, WIDTH],
                )
                return [base64.b64decode(b64) for b64 in raw_b64_list]

        future = asyncio.run_coroutine_threadsafe(_exec(), self._loop)
        try:
            return future.result(timeout=10)
        except Exception as err:
            print(f"[Render Frame Error] {err}")
            return None


RENDERER = HeadlessCanvasRenderer()


def generate_dice_gif(payload: dict[str, Any]) -> tuple[bytes, list[int]]:
    t0 = time.time()
    roll_config, style = build_roll_config(payload)

    # 变长关键帧序列 (前段动态 -> p=0.45完全正面平躺展示大字长停 1200ms -> p>=0.72大招爆发)
    spin_p = [i * (0.34 / 14) for i in range(14)]
    settle_p = [0.35, 0.37]
    pause_p = [0.45]
    reveal_p = [0.72 + i * (0.28 / 7) for i in range(7)]
    final_p = [1.0]

    p_list = spin_p + settle_p + pause_p + reveal_p + final_p
    durations = [40] * 14 + [45] * 2 + [1200] * 1 + [50] * 7 + [TAIL_SECONDS * 1000]

    frame_bytes_list = RENDERER.render_frames(roll_config, style, p_list)
    t1 = time.time()

    if not frame_bytes_list:
        raise RuntimeError("渲染引擎未响应，请检查 Playwright 是否正常运行。")

    pil_images = [Image.open(io.BytesIO(b)).convert("RGB") for b in frame_bytes_list]
    palette_im = pil_images[-1].quantize(colors=36, method=Image.Quantize.FASTOCTREE)
    quantized_frames = [img.quantize(palette=palette_im, dither=Image.Dither.NONE) for img in pil_images]

    out = io.BytesIO()
    quantized_frames[0].save(
        out,
        format="GIF",
        save_all=True,
        append_images=quantized_frames[1:],
        duration=durations,
        loop=0,
        optimize=False,
        disposal=2,
    )
    t2 = time.time()

    render_ms = round((t1 - t0) * 1000, 1)
    encode_ms = round((t2 - t1) * 1000, 1)
    return out.getvalue(), [render_ms, encode_ms]


# ----------------- HTTP 服务端 -----------------
class ReusableThreadingServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class RequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status: int, data: dict[str, Any]):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {
                "ok": True,
                "service": "ra-sc-gif-synced-pacing",
                "preludeSeconds": PRELUDE_SECONDS,
                "tailSeconds": TAIL_SECONDS,
                "width": WIDTH,
                "height": HEIGHT,
                "cacheDir": str(CACHE_DIR),
            })
            return

        match = re.match(r"^/api/gif/([a-f0-9]{24})$", self.path)
        if match:
            key = match.group(1)
            file_path = CACHE_DIR / f"{key}.gif"
            if file_path.exists():
                raw = file_path.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/gif")
                self.send_header("Content-Length", str(len(raw)))
                self.send_header("Cache-Control", "public, max-age=600")
                self.end_headers()
                self.wfile.write(raw)
                return

        self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path != "/api/roll-gif":
            self._send_json(404, {"ok": False, "error": "not found"})
            return
        try:
            started = time.time()
            length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(length)
            payload = json.loads(raw_body or "{}")

            gif_bytes, [render_ms, encode_ms] = generate_dice_gif(payload)
            key = secrets.token_hex(12)

            gif_file = CACHE_DIR / f"{key}.gif"
            gif_file.write_bytes(gif_bytes)

            relative_path = f"{RELATIVE_DIR_NAME}/{key}.gif"
            local_file_path = gif_file.resolve().as_posix()

            elapsed_ms = round((time.time() - started) * 1000, 1)
            kb_size = round(len(gif_bytes) / 1024, 1)

            print(
                f"[出图成功] 风格: {payload.get('style', 'card')} | 渲染: {render_ms}ms | 编码: {encode_ms}ms | 总耗时: {elapsed_ms}ms | 体积: {kb_size}KB | 路径: {relative_path}"
            )

            url = (
                f"{PUBLIC_BASE}/api/gif/{key}"
                if PUBLIC_BASE
                else f"http://{HOST if HOST != '0.0.0.0' else '127.0.0.1'}:{PORT}/api/gif/{key}"
            )

            self._send_json(200, {
                "ok": True,
                "mime": "image/gif",
                "url": url,
                "relative_path": relative_path,
                "file_path": local_file_path,
                "bytes": len(gif_bytes),
                "elapsedMs": elapsed_ms,
                "preludeSeconds": PRELUDE_SECONDS,
                "tailSeconds": TAIL_SECONDS,
            })
        except Exception as exc:
            print(f"[生成失败] {exc}")
            self._send_json(500, {"ok": False, "error": str(exc)})


def main():
    server_address = (HOST, PORT)
    print("=" * 60)
    print(f"海豹骰 (SealDice) 动效微服务 [节奏对齐版]")
    print(f"监听地址: http://{HOST}:{PORT}")
    print(f"缓存目录: {CACHE_DIR}")
    print(f"沙箱白名单相对路径: {RELATIVE_DIR_NAME}/")
    print(f"支持风格: 抽牌 (card) / 骰子 (dice) / 表盘 (roulette) / 老虎机 (slot)")
    print(f"渲染规格: {WIDTH}x{HEIGHT}")
    print("=" * 60)

    try:
        httpd = ReusableThreadingServer(server_address, RequestHandler)
        print(f"服务已就绪并在后台常驻监听中... (按 Ctrl+C 可停止服务)")
        httpd.serve_forever()
    except OSError as err:
        print(f"端口绑定失败: {err}")
    except KeyboardInterrupt:
        print("\n收到退出指令，服务正在安全关闭...")
    finally:
        if "httpd" in locals():
            httpd.server_close()


if __name__ == "__main__":
    main()