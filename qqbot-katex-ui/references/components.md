# QQBot KaTeX UI 核心组件库全解析 (Component Library)

本手册详细拆解 QQ 机器人渲染引擎支持的 10 大核心 KaTeX 矢量排版组件，包含完整宏指令、色彩建议、场景示例与防御性排版参数。

---

## 【组件 A】颜色、徽章与外框系统

### 1. 基础文字变色
- **语法**：`\textcolor{颜色名称或#HEX}{\text{文本内容}}`
- **说明**：推荐优先使用 `#HEX` 16进制色值，兼容性与调色宽容度最高。
- **高频色板推荐**：
  - 火焰 / 警告 / 狂暴：`#EF4444`（烈焰红）
  - 治疗 / 增益 / 生命：`#10B981`（自然绿）
  - 冰霜 / 护盾 / 法力：`#0EA5E9`（深邃蓝）
  - 雷电 / 暴击 / 传说：`#F59E0B`（神圣金）
  - 史诗 / 诅咒 / 虚空：`#8B5CF6`（神秘紫）
  - 死亡 / 杂项 / 灰色：`#6B7280`（冷灰）

### 2. 纯色胶囊背景与高亮
- **语法**：`\colorbox{背景色}{\textcolor{前景色}{\text{文字}}}`
- **示例**：`\colorbox{#FEF3C7}{\textcolor{#D97706}{\text{ 消耗金币 x500 }}}`

### 3. 单层精装带边框徽章 (fcolorbox)
- **语法**：`\fcolorbox{边框色}{背景色}{\textcolor{文字色}{\textbf{\text{徽章文字}}}}`
- **示例**：
  - 危险警报：`\fcolorbox{#DC2626}{#FEE2E2}{\textcolor{#DC2626}{\textbf{\text{ RAID 战备中 }}}}`
  - 安全庇护：`\fcolorbox{#059669}{#D1FAE5}{\textcolor{#059669}{\textbf{\text{ 安全避难所 }}}}`

### 4. 街机双重霓虹边框 (Double Neon Border)
- **原理**：双层 `\fcolorbox` 嵌套，内层外层高饱和对比，形成街机/赛博朋克发光质感。
- **语法**：
  ```latex
  \fcolorbox{#9333EA}{#3B0764}{\fcolorbox{#A855F7}{#581C87}{\textcolor{white}{\textbf{\text{ 传说神器 · 灭世之刃 }}}}}
  ```

### 5. 线框包裹与屋顶挂牌框
- **极简线框**：`\boxed{\text{装备已绑定}}`
- **屋顶挂牌框（微型看板）**：利用根号可选参数挂牌：
  ```latex
  \sqrt[\fcolorbox{#2563EB}{#1D4ED8}{\textcolor{white}{\tiny \textbf{\text{限时活动}}}}]{\ \text{暗黑地牢·第 7 层}\ }
  ```

---

## 【组件 B】纯代码无图「血条 / 能量条 / 分割线」

### 1. 核心指令：`\rule`
- **完整语法**：`\rule[垂直基线偏移]{宽度px}{高度px}`
- **移动端宽度铁律**：QQ 移动端单行累计宽度建议控制在 **80px ~ 240px** 之间。

### 2. 双色无缝拼接血条
- **原理**：左侧绿色/红色代表当前生命，右侧深灰/暗色底板代表损失血量。
```latex
% HP 75/100 (总宽 100px)
$\text{HP: }\textcolor{#10B981}{\rule{75px}{7px}}\textcolor{#374151}{\rule{25px}{7px}}\ \small \text{750/1000}$
```

### 3. 三色护盾血条（生命 + 护盾 + 扣除）
```latex
% 生命 50px + 护盾 30px + 扣除 20px (总宽 100px)
$\text{HP: }\textcolor{#EF4444}{\rule{50px}{7px}}\textcolor{#06B6D4}{\rule{30px}{7px}}\textcolor{#374151}{\rule{20px}{7px}}\ \small \text{500+300/1000}$
```

### 4. 段落纯代码装饰分割线
```latex
% 黄金分割线
$\textcolor{#F59E0B}{\rule{230px}{2px}}$

% 暗红战场分割线
$\textcolor{#7F1D1D}{\rule{230px}{1.5px}}$
```

---

## 【组件 C】字号控制与层次强调

- **10级字号梯度**：
  `\Huge` > `\huge` > `\LARGE` > `\Large` > `\large` > `\normalsize` > `\small` > `\footnotesize` > `\scriptsize` > `\tiny`
- **使用原则**：
  - 核心结算暴击 / 斩杀 / 大标题：`\Large` 或 `\LARGE`。
  - 次级标题 / 角色名：`\normalsize` 搭配 `\textbf{}`。
  - 属性小标签 / 状态 / 注记 / 消耗：`\small`、`\footnotesize` 或 `\tiny`。

---

## 【组件 D】注记、称号、多行堆叠与平滑弧线

### 1. 称号戴顶：`\overset`
```latex
% 头顶称号
\overset{\textcolor{#F59E0B}{\tiny ★ 屠龙先驱 ★}}{\textbf{\text{冒险者·雷恩}}}
```

### 2. 脚底状态 / 心声独白：`\underset`
```latex
% 脚底状态说明
\underset{\textcolor{#9CA3AF}{\tiny [处于石化封印中: 2回合]}}{\textbf{\text{远古巨石像}}}
```

### 3. 密集极小多行堆叠：`\substack`
```latex
% 武器极小双行词缀
\overset{\substack{\textcolor{#EF4444}{\tiny 斩杀线 +15\%} \\ \textcolor{#3B82F6}{\tiny 攻击回蓝 +8}}}{\textbf{\text{弑君短刃}}}
```

### 4. 圆弧庇护穹顶：`\overgroup`
```latex
% 组队领域庇护
\overgroup{\text{圣骑士}\quad\text{大魔导师}}^{\textcolor{#10B981}{\text{绝对防御圣域}}}
```

### 5. 花括号汇总与拆解：`\overbrace` / `\underbrace`
```latex
% 装备战力归总
\overbrace{\text{主武器}+\text{防具四件套}}^{\textcolor{#F59E0B}{\textbf{\text{总战力: 18,450}}}}

% 伤害拆解
\underbrace{\text{物理破甲 800}+\text{真实灼烧 350}}_{\textcolor{#DC2626}{\textbf{\text{本次总伤害: 1150}}}}
```

---

## 【组件 E】改动、折扣与动态拉伸箭头

### 1. 划线作废与折扣改价
- **双向打叉作废**：`\xcancel{\text{原价 998}}`
- **单斜线划掉**：`\cancel{\text{失效词条}}`
- **划掉并指向新价（神技）**：
  `\cancelto{\textcolor{#EF4444}{\textbf{\text{199 钻石}}}}{\text{998 钻石}}`

### 2. 自适应带字拉伸箭头
箭头会根据上下文本长度自动缩放延长：
- **基础进化/消耗推进**：`\xrightarrow[\text{消耗 50 魔法}]{\textcolor{#F97316}{\text{烈焰冲击}}}`
- **飞爪 / 钓鱼抓取**：`\xhookrightarrow[\text{命中率 95\%}]{\text{暗影锁链}}`
- **双头冲刺**：`\xtwoheadrightarrow{\text{瞬步疾行}}`
- **滴血认主 / 契约绑定**：`\xmapsto{\text{灵魂共鸣}}`
- **双向攻防激烈对抗**：`\xleftrightharpoons[\text{护盾反震 120}]{\text{正面暴击 680}}`
- **全句横跨指示箭头**：`\overrightarrow{\text{全军突击冲锋}}`、`\overleftarrow{\text{战略性撤退}}`

---

## 【组件 F】网格、矩阵、牢笼与多列布局

### 1. 带细线微型表格 (2x2 或 2x3 网格)
```latex
\begin{array}{|c|c|}
\hline
\textbf{\text{物理攻击: 2,450}} & \textbf{\text{暴击几率: 45\%}} \\ \hline
\textbf{\text{法术抗性: 890}} & \textbf{\text{穿透强度: 320}} \\ \hline
\end{array}
```

### 2. 封印牢笼 (Vmatrix)
```latex
\begin{Vmatrix}
\Huge \text{😈} \\
\textbf{\text{被封印的混沌领主}} \\
\textcolor{#DC2626}{\small \text{剩余锁链: 3条}}
\end{Vmatrix}
```

### 3. 对话 / 行动分支选择器 (cases)
```latex
\text{当前处境：遭遇埋伏}\quad\begin{cases}
\text{1. 拔刀迎战 (力量检定)} \\
\text{2. 投掷闪光弹撤退 (敏捷检定)} \\
\text{3. 表明身份交涉 (魅力检定)}
\end{cases}
```

---

## 【组件 G】战术 HUD、四角环绕与瞄准

### 1. 独占行最右对齐标签 (`$$...\tag*{}$$`)
必须使用双美元符号包裹：
```latex
$$ \text{副本：永夜冰原} \tag*{\fcolorbox{#0284C7}{#E0F2FE}{\textcolor{#0284C7}{\small \textbf{\text{困难模式}}}}} $$
```

### 2. 战术 HUD 四角瞄准折角
```latex
\begin{matrix}
\ulcorner & & \urcorner \\
& \textcolor{#EF4444}{\odot\ \textbf{\text{LOCKED: 机械核心}}} & \\
& \circlearrowright\ \text{过热冷却: 2 回合} & \\
\llcorner & & \lrcorner
\end{matrix}
```

### 3. 四维环绕属性槽 (sideset)
```latex
\sideset{_{\text{\tiny 防御: 450}}^{\text{\tiny 攻击: 880}}}{_{\text{\tiny 暴击: 25\%}}^{\text{\tiny 速度: 120}}}\Huge \blacksquare
```

---

## 【组件 H】纯代码表单控件与离散充能槽

### 1. 系统选项与交互控件
- `\square`：未勾选复选框
- `\boxtimes`：已完成/勾选复选框
- `\boxplus`：展开折叠组
- `\boxminus`：收起折叠组
- `\circ`：单选框未激活
- `\circledcirc`：单选框已激活

### 2. 离散能量与星级槽
- **能量圆点 (3/5)**：`\textcolor{#06B6D4}{\bullet\,\bullet\,\bullet}\,\textcolor{#9CA3AF}{\circ\,\circ}`
- **充能方块 (4/5)**：`\textcolor{#EF4444}{\blacksquare\blacksquare\blacksquare\blacksquare}\textcolor{#4B5563}{\square}`
- **武器品阶 (5星)**：`\textcolor{#F59E0B}{\bigstar\bigstar\bigstar\bigstar\bigstar}`

---

## 【组件 I】几何变换、位移与粒子微动

- **水平镜像**：`\reflectbox{\text{🏹}}\ \text{VS}\ \text{🏹}`
- **垂直偏置 (波浪浮动)**：`\text{幽}\raisebox{2px}{\text{魂}}\raisebox{4px}{\text{飘}}\raisebox{1px}{\text{荡}}`
- **满怒粒子**：`\dddot{\text{爆}}`
- **圣殿圆环**：`\mathring{\text{圣}}`
- **尖顶遮蔽**：`\widehat{\text{苍穹帷幕}}`

---

## 【组件 J】系统状态、逻辑与神秘图腾

- **状态圈号**：增益 `\textcolor{#10B981}{\oplus}`、减益 `\textcolor{#EF4444}{\ominus}`、锁定 `\textcolor{#F59E0B}{\odot}`、阵亡 `\dagger`
- **轮转与波动**：技能循环 `\circlearrowright`、重置 `\circlearrowleft`、San值狂掉 `\leftrightsquigarrow`
- **逻辑运算符**：通过 `\vdash`、压制 `\gg`、极值 `\top` / `\bot`