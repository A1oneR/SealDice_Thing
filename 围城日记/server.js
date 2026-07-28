/* 围城日记图片服务：只做渲染，不持有玩家存档。 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { createCanvas, registerFont } = require('canvas');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
const PORT = Number(process.env.PORT || 3889);
const cache = new Map();
const startedAt = Date.now();

function registerFonts() {
  const candidates = [
    process.env.WJD_FONT,
    path.join(__dirname, 'fonts', 'keji.ttf'),
    'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
  ].filter(Boolean);
  for (const file of candidates) {
    try { if (fs.existsSync(file)) { registerFont(file, { family: 'WJDFont' }); return file; } } catch (_) {}
  }
  return null;
}
const fontPath = registerFonts();

const C = {
  ink: '#182027', paper: '#f2ead8', paper2: '#e5d9bf', rust: '#b34a36', red: '#d95745',
  amber: '#d5913e', teal: '#2e7070', green: '#66855b', blue: '#4e7287', smoke: '#778184',
  white: '#fffaf0', black: '#101518'
};
function clamp(v, a = 0, b = 100) { return Math.max(a, Math.min(b, Number(v) || 0)); }
function safe(v, fallback = '') { return v === undefined || v === null ? fallback : String(v); }
function font(size, bold = false) { return `${bold ? 'bold ' : ''}${size}px "WJDFont", "Microsoft YaHei", Arial`; }
function rounded(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
function wrap(ctx, text, maxWidth) {
  const lines = []; let line = '';
  for (const ch of safe(text).replace(/\r/g, '')) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    const candidate = line + ch;
    if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = ch; } else line = candidate;
  }
  if (line || !lines.length) lines.push(line); return lines;
}
function drawParagraph(ctx, text, x, y, maxWidth, lineHeight = 24, maxLines = 99) {
  const lines = wrap(ctx, text, maxWidth).slice(0, maxLines);
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight)); return y + lines.length * lineHeight;
}
function paperBackground(ctx, w, h, accent = C.rust) {
  ctx.fillStyle = C.paper; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(85,62,35,.06)';
  for (let y = 0; y < h; y += 13) ctx.fillRect(0, y, w, 1);
  for (let x = 11; x < w; x += 47) ctx.fillRect(x, 0, 1, h);
  ctx.strokeStyle = accent; ctx.lineWidth = 4; ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.strokeStyle = 'rgba(24,32,39,.35)'; ctx.lineWidth = 1; ctx.strokeRect(28, 28, w - 56, h - 56);
}
function header(ctx, title, subtitle, accent = C.rust) {
  ctx.fillStyle = accent; ctx.font = font(31, true); ctx.fillText(title, 46, 68);
  ctx.fillStyle = C.ink; ctx.font = font(15); ctx.fillText(subtitle, 48, 94);
  ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(46, 110); ctx.lineTo(854, 110); ctx.stroke();
}
function bar(ctx, x, y, w, label, value, color, suffix = '') {
  ctx.font = font(15, true); ctx.fillStyle = C.ink; ctx.fillText(`${label} ${Math.round(value)}${suffix}`, x, y);
  rounded(ctx, x, y + 9, w, 14, 7, '#cfc5b1'); rounded(ctx, x, y + 9, w * clamp(value) / 100, 14, 7, color);
}
function sealStamp(ctx, x, y, text, color = C.rust) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.08); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.globalAlpha = .78; ctx.strokeRect(-66,-22,132,44); ctx.font = font(18, true); ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.fillText(text,0,7); ctx.restore();
}
function respondPng(res, canvas) { res.set('Content-Type','image/png'); res.send(canvas.toBuffer('image/png')); }
function getState(req) {
  if (req.body && req.body.state) return req.body.state;
  const token = req.query.token; return token && cache.get(token) ? cache.get(token) : {};
}

function renderStatus(state) {
  const w = 900, h = 650, canvas = createCanvas(w,h), ctx = canvas.getContext('2d'); paperBackground(ctx,w,h,C.rust);
  header(ctx, '围城日记 / SURVIVAL LOG', `第 ${safe(state.day, 1)} 天 · ${safe(state.timeLabel, '黄昏')} · ${safe(state.weather&&state.weather.name,'阴天')} · 威胁 ${safe(state.threat, 0)}`, C.rust);
  ctx.fillStyle = C.ink; ctx.font = font(26,true); ctx.fillText(safe(state.name,'无名幸存者'), 48, 151);
  ctx.font = font(15); ctx.fillStyle = C.smoke; ctx.fillText(`${safe(state.background,'未知背景')} · ${safe(state.location,'未知位置')}`, 50, 178);
  const s = state.stats || state; const rows = [['生命值',s.hp,'#b34a36'],['饱食度',s.hunger,'#b88632'],['口渴度',s.thirst,'#4e7287'],['感染度',s.infection,'#8b5c86'],['伤口度',s.wounds,'#a45b44'],['心情值',s.mood,'#66855b']];
  rows.forEach((r,i) => bar(ctx, 50 + (i%2)*375, 214 + Math.floor(i/2)*67, 300, r[0], clamp(r[1]), r[2]));
  rounded(ctx, 48, 430, 390, 158, 5, 'rgba(255,250,240,.66)', C.paper2);
  ctx.font = font(18,true); ctx.fillStyle = C.teal; ctx.fillText('据点概况', 68, 462);
  ctx.font = font(16); ctx.fillStyle = C.ink; const base = state.base || {}; drawParagraph(ctx, `${safe(base.name,'临时藏身处')}  ·  等级 ${safe(base.level,1)}\n防御 ${safe(base.defense,0)}  ·  容量 ${safe(base.capacity,4)}\n${safe(base.condition,'墙上还留着上一任住户的粉笔字。')}`,68,492,340,25,4);
  rounded(ctx, 468, 430, 384, 158, 5, 'rgba(255,250,240,.66)', C.paper2);
  ctx.font = font(18,true); ctx.fillStyle = C.teal; ctx.fillText('背包与装备', 488, 462); ctx.font = font(15); ctx.fillStyle = C.ink;
  const inv = state.inventory || {}; const items = Object.keys(inv).slice(0,7).map(k => `${k} ×${inv[k]}`).join('  ·  ') || '空空如也'; drawParagraph(ctx, items,488,493,340,25,2);
  ctx.font=font(13);ctx.fillStyle=C.smoke;ctx.fillText(`负重 ${Number(state.weight||0).toFixed(1)} / ${safe(state.capacity,22)} · 今日行动 ${safe(state.dailyActions,0)} · 疲劳 ${safe(state.fatigue,0)} · ${state.atBase?'据点内':'据点外'}`,488,568);
  sealStamp(ctx, 770, 145, state.dead ? '档案封存' : '仍在呼吸', state.dead ? C.smoke : C.rust);
  ctx.font = font(13); ctx.fillStyle = C.smoke; ctx.fillText('状态卡由围城日记记录员绘制 · 图片为动态生成', 48, 620);
  return canvas;
}

function renderSetup(state) {
  const w=900,h=730,canvas=createCanvas(w,h),ctx=canvas.getContext('2d'); paperBackground(ctx,w,h,C.teal); header(ctx,'开局构筑 / FIRST NIGHT',`剩余点数 ${safe(state.points,10)}  ·  用选择换取活下去的第一口气`,C.teal);
  ctx.font=font(21,true);ctx.fillStyle=C.ink;ctx.fillText(safe(state.title,'你醒在一座还没有完全死去的城市里。'),48,152);
  ctx.font=font(15);ctx.fillStyle=C.smoke;drawParagraph(ctx,safe(state.prompt,'先挑一个不太糟糕的起点。没有完美答案，只有你愿意承担的代价。'),50,180,780,25,3);
  const options=state.options||[]; options.slice(0,8).forEach((o,i)=>{const x=50+(i%2)*400,y=255+Math.floor(i/2)*91;const color=o.picked?C.green:(!o.affordable?C.smoke:C.teal);rounded(ctx,x,y,360,75,5,o.picked?'#c8d2bd':'rgba(255,250,240,.78)',o.picked?C.green:C.paper2);ctx.fillStyle=color;ctx.font=font(17,true);ctx.fillText(`${safe(o.id,i+1)}. ${o.picked?'✓ ':''}${safe(o.name,'未命名')}`,x+15,y+27);ctx.fillStyle=o.affordable?C.ink:C.smoke;ctx.font=font(13);drawParagraph(ctx,`${safe(o.cost,0)} 点 · ${safe(o.desc,'')}`,x+15,y+51,325,17,2);});
  if(state.finish){rounded(ctx,50,625,800,42,4,'rgba(179,74,54,.09)',C.rust);ctx.fillStyle=C.rust;ctx.font=font(16,true);ctx.fillText(`0. ${safe(state.finish.name,'结束选择')}（0点）`,66,652);ctx.font=font(12);ctx.fillStyle=C.smoke;ctx.fillText(safe(state.finish.desc,''),390,651);}
  ctx.font=font(13);ctx.fillStyle=C.smoke;ctx.fillText(`第 ${safe(state.page,1)}/${safe(state.totalPages,1)} 页 · 可一次输入多个编号：.wjd choose 1 2 5 8 13 · 已选 ${(state.selected||[]).length} 项`,50,695); return canvas;
}

function renderEvent(state) {
  const w=900,h=620,canvas=createCanvas(w,h),ctx=canvas.getContext('2d'); paperBackground(ctx,w,h,state.danger?C.red:C.amber); header(ctx, safe(state.title,'城市没有回答'), `第 ${safe(state.day,1)} 天  ·  ${safe(state.timeLabel,'夜')}  ·  记录编号 ${safe(state.eventId,'--')}`, state.danger?C.red:C.amber);
  ctx.fillStyle=C.ink;ctx.font=font(26,true);ctx.fillText(safe(state.headline,'一阵声音从街角传来。'),50,158);ctx.font=font(17);drawParagraph(ctx,safe(state.text,'你把手放在门把手上，停了很久。'),50,196,780,29,6);
  if(state.choice){rounded(ctx,50,390,800,122,5,'rgba(255,250,240,.72)',C.paper2);ctx.font=font(17,true);ctx.fillStyle=C.teal;ctx.fillText('你的决定',70,423);ctx.font=font(15);ctx.fillStyle=C.ink;drawParagraph(ctx,state.choice,70,454,740,25,3);}
  const delta=state.delta||{};ctx.font=font(14);ctx.fillStyle=C.smoke;ctx.fillText(Object.keys(delta).map(k=>`${k} ${delta[k]>=0?'+':''}${delta[k]}`).join('   ')||'这一次没有立刻付出代价。',50,555);sealStamp(ctx,760,164,state.danger?'警报':'已记录',state.danger?C.red:C.teal);return canvas;
}

function renderBase(state) {
  const w=900,h=650,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.green);header(ctx,'据点蓝图 / SAFEHOUSE',`${safe(state.name,'无名据点')}  ·  第 ${safe(state.day,1)} 天  ·  防御 ${safe(state.defense,0)}`,C.green);
  const rooms=state.rooms||[];rounded(ctx,50,145,800,320,5,'rgba(255,250,240,.6)',C.paper2);ctx.strokeStyle=C.green;ctx.lineWidth=3;
  const positions=[[80,180],[285,180],[490,180],[695,180],[180,340],[385,340],[590,340]];rooms.slice(0,7).forEach((r,i)=>{const [x,y]=positions[i];rounded(ctx,x,y,170,105,4,r.built?'#c8d2bd':'#ddd4c3',r.built?C.green:C.smoke);ctx.fillStyle=r.built?C.teal:C.smoke;ctx.font=font(17,true);ctx.fillText(`${i+1}. ${safe(r.name,'空房')}`,x+14,y+32);ctx.fillStyle=C.ink;ctx.font=font(14);drawParagraph(ctx,`${r.built?'已建成':'待建'}\n${safe(r.effect,'等待木板和螺丝。')}`,x+14,y+58,140,19,2);});
  ctx.font=font(16,true);ctx.fillStyle=C.ink;ctx.fillText('建造提示',50,520);ctx.font=font(15);drawParagraph(ctx,safe(state.tip,'设施不是装饰：厨房解决饥饿，医疗室压住感染，瞭望台让夜袭更早被看见。'),50,548,780,24,3);return canvas;
}

function renderMap(state) {
  const w=900,h=680,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.blue);header(ctx,'城市资源图 / CITY GRID',`当前位置：${safe(state.current,'学校宿舍')}  ·  预计威胁 ${safe(state.threat,0)}`,C.blue);
  ctx.fillStyle='#d0c5ae';ctx.fillRect(62,145,776,430);ctx.strokeStyle='rgba(46,112,112,.32)';ctx.lineWidth=2;
  for(let x=95;x<820;x+=73){ctx.beginPath();ctx.moveTo(x,145);ctx.lineTo(x,575);ctx.stroke();}for(let y=170;y<575;y+=57){ctx.beginPath();ctx.moveTo(62,y);ctx.lineTo(838,y);ctx.stroke();}
  const page=Math.max(1,Number(state.page)||1),start=(page-1)*9;const spots=state.spots||[];spots.slice(start,start+9).forEach((s,i)=>{const x=135+(i%3)*250,y=205+Math.floor(i/3)*115;ctx.fillStyle=s.locked?C.smoke:(s.current?C.rust:C.teal);ctx.beginPath();ctx.arc(x,y,18,0,Math.PI*2);ctx.fill();ctx.fillStyle=C.ink;ctx.font=font(16,true);ctx.fillText(`${start+i+1}. ${safe(s.name,'资源点')}`,x+28,y+5);ctx.font=font(13);ctx.fillStyle=C.smoke;ctx.fillText(`${safe(s.kind,'未知')} · 风险 ${safe(s.risk,0)}`,x+28,y+25);});
  ctx.font=font(14);ctx.fillStyle=C.smoke;ctx.fillText(`第 ${page}/${Math.max(1,Math.ceil(spots.length/9))} 页 · 移动增加今日行动；第4次起疲劳风险持续上升。`,64,620);return canvas;
}

function renderInventory(state) {
  const w=900,h=720,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.amber);const page=Math.max(1,Number(state.page)||1),rows=state.rows||[],start=(page-1)*12;
  header(ctx,'物资清单 / FIELD INVENTORY',`${safe(state.name,'幸存者')} · 第 ${safe(state.day,1)} 天 · 负重 ${Number(state.weight||0).toFixed(1)} / ${safe(state.capacity,22)}`,C.amber);
  ctx.font=font(14,true);ctx.fillStyle=C.smoke;ctx.fillText('名称 / 数量',54,145);ctx.fillText('分类',330,145);ctx.fillText('重量',455,145);ctx.fillText('稀有度',555,145);ctx.fillText('记录',670,145);
  rows.slice(start,start+12).forEach((r,i)=>{const y=178+i*39;if(i%2===0){ctx.fillStyle='rgba(255,250,240,.55)';ctx.fillRect(48,y-25,804,35);}ctx.fillStyle=C.ink;ctx.font=font(15,true);ctx.fillText(`${safe(r.name,'未知')} ×${safe(r.count,0)}`,56,y);ctx.font=font(14);ctx.fillStyle=C.teal;ctx.fillText(safe(r.use,'杂项'),330,y);ctx.fillStyle=C.ink;ctx.fillText((Number(r.weight||0)*Number(r.count||0)).toFixed(1),455,y);ctx.fillStyle=r.rarity==='史诗'?C.rust:(r.rarity==='稀有'?C.amber:C.smoke);ctx.fillText(safe(r.rarity,'普通'),555,y);ctx.fillStyle=C.smoke;ctx.font=font(12);ctx.fillText(safe(r.desc,'').slice(0,13),670,y);});
  ctx.font=font(14);ctx.fillStyle=C.smoke;ctx.fillText(`第 ${page}/${Math.max(1,Math.ceil(rows.length/12))} 页 · .wjd inventory [页码] · .wjd item [物资名]`,52,665);return canvas;
}

function renderTutorial(state) {
  const w=900,h=720,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.teal);header(ctx,`三日生存教程 / DAY ${safe(state.day,1)}`,safe(state.title,'先活过今天'),C.teal);
  ctx.font=font(16);ctx.fillStyle=C.ink;drawParagraph(ctx,safe(state.intro,''),52,145,790,25,3);if(state.weather){ctx.font=font(14,true);ctx.fillStyle=C.amber;ctx.fillText(`今日天气：${safe(state.weather.name,'未知')} · ${safe(state.weather.desc,'')}`,52,225);}
  const tasks=state.tasks||[];tasks.forEach((t,i)=>{const x=54+(i%2)*400,y=270+Math.floor(i/2)*88;rounded(ctx,x,y,370,70,4,t.done?'#c8d2bd':'rgba(255,250,240,.72)',t.done?C.green:C.paper2);ctx.fillStyle=t.done?C.green:C.rust;ctx.font=font(18,true);ctx.fillText(t.done?'✓':'○',x+14,y+28);ctx.fillStyle=C.ink;ctx.font=font(15,true);ctx.fillText(safe(t.text,'任务'),x+46,y+27);ctx.font=font(13);ctx.fillStyle=C.smoke;ctx.fillText(safe(t.cmd,''),x+46,y+51);});
  ctx.font=font(15,true);ctx.fillStyle=C.amber;ctx.fillText(`当日奖励：${safe(state.reward,'无')}`,54,640);ctx.font=font(13);ctx.fillStyle=C.smoke;ctx.fillText(state.finished?'三日教程已完成。现在城市不会再替你标出下一步。':'每天只有在据点休息才会换日；第4次行动起可继续探索，但疲劳危险持续增加。',54,675);return canvas;
}

function renderHelp(state) {
  const w=900,h=720,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.blue);const page=Math.max(1,Number(state.page)||1);header(ctx,'围城日记 / COMMAND MANUAL',`第 ${page}/4 页 · 使用 .wjd help [指令] 查看完整说明`,C.blue);
  const entries=state.entries||[];entries.slice(0,12).forEach((e,i)=>{const x=52+(i%2)*405,y=135+Math.floor(i/2)*84;rounded(ctx,x,y,385,70,4,'rgba(255,250,240,.72)',C.paper2);ctx.fillStyle=C.teal;ctx.font=font(16,true);ctx.fillText(`.wjd ${safe(e.cmd,'')}`,x+14,y+25);ctx.fillStyle=C.ink;ctx.font=font(12);drawParagraph(ctx,safe(e.summary,''),x+14,y+48,350,16,2);});ctx.font=font(13);ctx.fillStyle=C.smoke;ctx.fillText('分页：.wjd help 1 / 2 / 3 / 4 · 教程：.wjd tutorial · 未知指令不会消耗时段',52,675);return canvas;
}

function renderHelpDetail(state) {
  const w=900,h=650,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.blue);header(ctx,`.wjd ${safe(state.cmd,'指令')}`,`${safe(state.group,'帮助')} · 别名：${safe(state.aliases,'无')}`,C.blue);
  ctx.font=font(22,true);ctx.fillStyle=C.teal;ctx.fillText(safe(state.summary,''),52,155);ctx.font=font(17,true);ctx.fillStyle=C.rust;ctx.fillText('标准用法',52,210);ctx.font=font(17);ctx.fillStyle=C.ink;ctx.fillText(safe(state.usage,''),52,242);ctx.font=font(17,true);ctx.fillStyle=C.rust;ctx.fillText('详细说明',52,292);ctx.font=font(16);ctx.fillStyle=C.ink;drawParagraph(ctx,safe(state.detail,''),52,325,790,27,6);ctx.font=font(17,true);ctx.fillStyle=C.rust;ctx.fillText('示例',52,500);ctx.font=font(15);ctx.fillStyle=C.ink;(state.examples||[]).forEach((x,i)=>ctx.fillText(x,72,535+i*27));return canvas;
}

function renderSkills(state) {
  const w=900,h=620,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.green);header(ctx,'技能成长 / SURVIVOR SKILLS',`${safe(state.name,'幸存者')} · 第 ${safe(state.day,1)} 天`,C.green);
  (state.rows||[]).forEach((r,i)=>{const x=55+(i%2)*400,y=155+Math.floor(i/2)*130;rounded(ctx,x,y,365,105,4,'rgba(255,250,240,.72)',C.paper2);ctx.fillStyle=C.teal;ctx.font=font(20,true);ctx.fillText(`${safe(r.name,'技能')} Lv.${safe(r.level,1)}`,x+18,y+32);ctx.font=font(13);ctx.fillStyle=C.smoke;ctx.fillText(`天赋 ${safe(r.aptitude,1)} / 3`,x+270,y+32);bar(ctx,x+18,y+61,320,'经验',Number(r.xp||0)/Math.max(1,Number(r.need||12))*100,C.green);});return canvas;
}

function renderQuests(state) {
  const w=900,h=610,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.amber);header(ctx,'城市委托 / DAILY TASKS',`第 ${safe(state.day,1)} 天 · 完成时自动发放奖励`,C.amber);
  (state.rows||[]).forEach((q,i)=>{const y=145+i*140;rounded(ctx,52,y,796,115,4,q.done?'#c8d2bd':'rgba(255,250,240,.72)',q.done?C.green:C.paper2);ctx.fillStyle=q.done?C.green:C.rust;ctx.font=font(20,true);ctx.fillText(`${q.done?'✓':'○'} ${safe(q.title,'委托')}`,72,y+32);ctx.fillStyle=C.ink;ctx.font=font(15);ctx.fillText(safe(q.desc,''),72,y+61);ctx.fillStyle=C.smoke;ctx.font=font(14);ctx.fillText(`进度 ${safe(q.progress,0)}/${safe(q.need,1)} · 奖励 ${safe(q.reward,'无')}`,72,y+88);});return canvas;
}

function renderSurvivors(state) {
  const rows=state.rows||[],h=Math.max(500,210+Math.ceil(Math.max(1,rows.length)/2)*125),w=900,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.green);header(ctx,'幸存者名册 / SAFEHOUSE CREW',`${safe(state.name,'据点')} · 第 ${safe(state.day,1)} 天 · ${rows.length} 人`,C.green);
  if(!rows.length){ctx.font=font(24,true);ctx.fillStyle=C.smoke;ctx.fillText('名册是空的。无线电里仍有人在呼救。',160,280);return canvas;}rows.forEach((p,i)=>{const x=54+(i%2)*400,y=145+Math.floor(i/2)*125;rounded(ctx,x,y,370,100,4,'rgba(255,250,240,.72)',C.paper2);ctx.fillStyle=C.teal;ctx.font=font(19,true);ctx.fillText(`${safe(p.name,'无名')} · ${safe(p.job,'幸存者')}`,x+16,y+30);ctx.font=font(13);ctx.fillStyle=C.ink;drawParagraph(ctx,safe(p.desc,''),x+16,y+55,335,18,2);ctx.fillStyle=C.green;ctx.fillText(`信任 ${safe(p.trust,0)} · 加成 ${safe(p.bonus,'无')} +${safe(p.value,0)}`,x+16,y+88);});return canvas;
}

function renderDeath(state) {
  const w=900,h=720,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.black);header(ctx,'周目终结 / END OF RUN',`第 ${safe(state.day,1)} 天  ·  生存时长 ${safe(state.survival,'未知')}  ·  档案已封存`,C.black);
  ctx.fillStyle=C.rust;ctx.font=font(31,true);ctx.fillText(safe(state.cause,'城市最终还是收回了这间屋子。'),50,158);ctx.fillStyle=C.ink;ctx.font=font(17);drawParagraph(ctx,safe(state.epitaph,'没有人知道你最后看见了什么。'),50,198,780,28,4);
  rounded(ctx,50,330,370,260,5,'rgba(255,250,240,.72)',C.paper2);ctx.fillStyle=C.teal;ctx.font=font(20,true);ctx.fillText('本周目留下的东西',72,365);ctx.fillStyle=C.ink;ctx.font=font(15);drawParagraph(ctx,(state.achievements||[]).map(x=>`• ${x}`).join('\n')||'• 你至少留下了一页记录。',72,400,320,28,7);
  rounded(ctx,460,330,390,260,5,'rgba(255,250,240,.72)',C.paper2);ctx.fillStyle=C.rust;ctx.font=font(20,true);ctx.fillText('下一次可以带走',482,365);ctx.fillStyle=C.ink;ctx.font=font(15);drawParagraph(ctx,`继承点数：${safe(state.legacyPoints,0)}\n${safe(state.unlock,'继续完成里程碑，可解锁更强特质。')}`,482,408,340,28,6);sealStamp(ctx,750,160,'归档',C.black);ctx.font=font(14);ctx.fillStyle=C.smoke;ctx.fillText('死亡不是删档：它会变成下一局的地图标记。',50,660);return canvas;
}

function renderEscape(state) {
  const w=900,h=560,canvas=createCanvas(w,h),ctx=canvas.getContext('2d');paperBackground(ctx,w,h,C.teal);header(ctx,'撤离计划 / LAST EXIT',`城市威胁 ${safe(state.threat,0)}  ·  进度 ${safe(state.progress,0)}%  ·  选择一条能坚持到底的路`,C.teal);
  const plans=state.plans||[];plans.forEach((p,i)=>{const y=150+i*112;rounded(ctx,52,y,790,87,4,p.ready?'#c8d2bd':'rgba(255,250,240,.68)',p.ready?C.green:C.paper2);ctx.fillStyle=p.ready?C.green:C.rust;ctx.font=font(20,true);ctx.fillText(`${i+1}. ${safe(p.name,'未命名路线')}`,72,y+31);ctx.fillStyle=C.ink;ctx.font=font(14);drawParagraph(ctx,`${safe(p.desc,'')}${p.need?'  需要：'+p.need:''}`,72,y+58,720,19,2);});ctx.font=font(14);ctx.fillStyle=C.smoke;ctx.fillText('完成计划后使用 .wjd escape [编号]。撤离成功将把结局、战绩和特质带入传承档案。',52,505);return canvas;
}

app.get('/health',(req,res)=>res.json({status:'ok',service:'围城日记',uptime:Date.now()-startedAt,font:fontPath||'fallback'}));
app.post('/cache-data',(req,res)=>{const token=crypto.randomBytes(12).toString('hex');cache.set(token,req.body||{});setTimeout(()=>cache.delete(token),10*60*1000);res.json({token});});
app.get('/render/status',(req,res)=>respondPng(res,renderStatus(getState(req))));
app.post('/render/status',(req,res)=>respondPng(res,renderStatus(getState(req))));
app.get('/render/setup',(req,res)=>respondPng(res,renderSetup(getState(req))));app.post('/render/setup',(req,res)=>respondPng(res,renderSetup(getState(req))));
app.get('/render/event',(req,res)=>respondPng(res,renderEvent(getState(req))));app.post('/render/event',(req,res)=>respondPng(res,renderEvent(getState(req))));
app.get('/render/base',(req,res)=>respondPng(res,renderBase(getState(req))));app.post('/render/base',(req,res)=>respondPng(res,renderBase(getState(req))));
app.get('/render/map',(req,res)=>respondPng(res,renderMap(getState(req))));app.post('/render/map',(req,res)=>respondPng(res,renderMap(getState(req))));
app.get('/render/inventory',(req,res)=>respondPng(res,renderInventory(getState(req))));app.post('/render/inventory',(req,res)=>respondPng(res,renderInventory(getState(req))));
app.get('/render/tutorial',(req,res)=>respondPng(res,renderTutorial(getState(req))));app.post('/render/tutorial',(req,res)=>respondPng(res,renderTutorial(getState(req))));
app.get('/render/help',(req,res)=>respondPng(res,renderHelp(getState(req))));app.post('/render/help',(req,res)=>respondPng(res,renderHelp(getState(req))));
app.get('/render/help-detail',(req,res)=>respondPng(res,renderHelpDetail(getState(req))));app.post('/render/help-detail',(req,res)=>respondPng(res,renderHelpDetail(getState(req))));
app.get('/render/skills',(req,res)=>respondPng(res,renderSkills(getState(req))));app.post('/render/skills',(req,res)=>respondPng(res,renderSkills(getState(req))));
app.get('/render/quests',(req,res)=>respondPng(res,renderQuests(getState(req))));app.post('/render/quests',(req,res)=>respondPng(res,renderQuests(getState(req))));
app.get('/render/survivors',(req,res)=>respondPng(res,renderSurvivors(getState(req))));app.post('/render/survivors',(req,res)=>respondPng(res,renderSurvivors(getState(req))));
app.get('/render/death',(req,res)=>respondPng(res,renderDeath(getState(req))));app.post('/render/death',(req,res)=>respondPng(res,renderDeath(getState(req))));
app.get('/render/escape',(req,res)=>respondPng(res,renderEscape(getState(req))));app.post('/render/escape',(req,res)=>respondPng(res,renderEscape(getState(req))));
app.listen(PORT,()=>console.log(`[围城日记] backend listening on ${PORT}`));
module.exports={app,renderStatus,renderSetup,renderEvent,renderBase,renderMap,renderInventory,renderTutorial,renderHelp,renderHelpDetail,renderSkills,renderQuests,renderSurvivors,renderDeath,renderEscape};
