---
name: qqbot-katex-ui
description: "QQ 机器人（官方开放平台 / QQBot / OneBot / SealDice 等）Markdown 与 KaTeX 矢量富文本排版架构师。针对 RPG 状态、系统战报、背包面板、商城流转、技能结算、NPC 抉择等场景，主动运用 KaTeX 宏指令构建高颜值、低延迟、全矢量无图片的纯代码富文本卡片。涵盖防崩溃避坑铁律、十大核心组件库（血条/能量条/徽章/牢笼/瞄准HUD/自适应箭头等）、排版模版库与代码集成工具。"
---

# QQBot KaTeX 富文本排版架构师 (Skill 指南)

本 Skill 专门指导 QQ 机器人开发者利用 QQ 客户端底层内置的 KaTeX 数学排版引擎，在 Markdown 消息中渲染**全矢量、零外部图片依赖、毫秒级响应、超高颜值**的纯代码富文本卡片。

---

## 1. 核心定位与工作流

当用户或机器人需要输出以下场景时，主动调取本 Skill 规范与模板：
1. **RPG 角色面板**：血条/法力条/经验条、品阶星级、称号戴顶、四维属性网格。
2. **实时战报 / BOSS 讨伐**：攻防链路、伤害暴击结算、CD 轮转、弱点锁定 HUD。
3. **背包 / 装备网格**：多行多列微型表格、品质色卡、强化角标、防塌陷占位。
4. **黑市 / 商城流转**：原价划线折扣、自适应拉伸箭头、限时倒计时、多重购买分支。
5. **NPC 互动 / 剧情抉择**：微表情、语气弧线、多分支大括号选项、系统复选框。

### 设计与组装流水线 (5步法则)
```
1. 确定业务场景 (战报 / 状态 / 背包 / 商店 / 对话)
   ↓
2. 规避语法地雷 (中文必须包 \text{} / 禁用 \cfrac / tag*必须独占行 / 宽度<=260px)
   ↓
3. 选取排版框架 (标题栏 $$...\tag*{} + 主体卡片 + 数据网格 + 选项分支)
   ↓
4. 装配视觉组件 (血条 \rule / 徽章 \fcolorbox / 箭头 \xrightarrow / HUD折角)
   ↓
5. 输出纯净 Markdown (验证无冲突下划线与星号，确保手机/PC端均完美适配)
```

---

## 2. 避坑铁律与渲染防崩守则 (Strict Guardrails)

在 QQ 客户端渲染 KaTeX 时，以下规则为不可触碰的红线：

| 铁律编号 | 核心规则 | 致命错误写法 | 正确标准写法 | 事故后果与技术原理 |
|---|---|---|---|---|
| **铁律 1** | **中文必须使用 `\text{}` 包裹** | `$\textcolor{red}{炎魔首领}$` | `$\textcolor{red}{\text{炎魔首领}}$` | KaTeX 默认将未包裹的中文作为数学变量解析，导致**字距剧烈异常拉大、斜体走样甚至直接解析报错崩溃**。中文标点（`，`、`：`、`！`）同样必须包裹。 |
| **铁律 2** | **严禁使用 `\cfrac`** | `\cfrac{A}{B + \cfrac{1}{C}}` | `\begin{matrix} A \\ & \searrow B \end{matrix}` | QQ 移动端环境对连分数（`\cfrac`）兼容性极差，常导致客户端消息渲染引擎直接崩溃或排版严重错乱。阶梯层级改用 `matrix` 或普通换行。 |
| **铁律 3** | **右侧悬浮标签必须使用 `$$ ... $$`** | `$\text{标题} \tag*{\text{标签}}$` | `$$ \text{标题} \tag*{\text{标签}} $$` | `\tag*{}` 属于 display 模式宏，在行内单美元 `$...$` 中会触发致命语法异常（ParseError）。 |
| **铁律 4** | **规避 Markdown 字符交叉解析冲突** | 公式内部裸露 `_` 或 `*`（如 `H_2O`） | 使用 `{_sub}`、`\star`、`\ast` 或将整段封闭在独立代码块/安全行中 | 外层 Markdown 解析器会先于 KaTeX 把 `_` 和 `*` 解析为 HTML `<em>` 或 `<strong>` 标签，导致公式截断破坏。 |
| **铁律 5** | **网格防塌陷撑开原则** | 表格内留空格子 `& &` | `& \phantom{\text{占位}} &` | `array` 单元格若无实体字符，列宽会被引擎自动压缩至 0px，导致整张表格变形畸形。 |
| **铁律 6** | **移动端横向宽度安全边际** | `\rule{350px}{8px}` | 建议单条 `\rule` 宽度控制在 **80px ~ 240px** | 手机端 QQ 聊天气泡可用排版宽度约 280px~320px。超宽会导致横向滚动条、强制截断或不可预测的软换行。 |
| **铁律 7** | **公式内换行规范** | 在普通行内 `$...$` 随意打 `\\` | 多行排版必须包裹在 `\begin{matrix}...\end{matrix}` 环境中，或直接拆分为多行独立的 `$...$` | 行内单美元不具备换行环境，单独使用 `\\` 会被忽略或报错。 |
| **铁律 8** | **SealDice 环境严禁使用 `\f` 开头指令** | `\fcolorbox`、`\frac`、`\footnotesize` | 改用 `\colorbox`、`a/b` 或 `\small` | 海豹骰底层将 `\f` 和 `\\f` 解析为消息截断符（`#{SPLIT}` FormFeed），会导致消息在指令处被强行腰斩为两段发送，公式未闭合造成前后乱码崩溃。 |

---

## 3. 核心组件速查字典 (KaTeX UI Component Library)

详细参数与扩展用法参见 [references/components.md](references/components.md)。

- **【组件 A】颜色、徽章与外框系统**：
  - 文字变色：`\textcolor{#FF5722}{\text{火属性伤害}}`
  - 纯色胶囊：`\colorbox{#E0F2FE}{\textcolor{#0284C7}{\text{ 基础护盾 }}}`
  - 边框徽章：`\fcolorbox{#DC2626}{#FEE2E2}{\textcolor{#DC2626}{\textbf{\text{ 危险警告 }}}}`
  - 双重霓虹框：`\fcolorbox{#9333EA}{#3B0764}{\fcolorbox{#A855F7}{#581C87}{\textcolor{white}{\textbf{\text{ 传说神器 }}}}}`
  - 屋顶挂牌框：`\sqrt[\fcolorbox{#2563EB}{#1D4ED8}{\textcolor{white}{\tiny \textbf{\text{活动副本}}}}]{\ \text{深渊裂隙·第12层}\ }`
- **【组件 B】矢量血条 / 能量条 / 分割线**：
  - 双色血条：`$\text{HP: }\textcolor{#00E676}{\rule{80px}{8px}}\textcolor{#424242}{\rule{20px}{8px}}\ \small \text{80/100}$`
  - 能量条：`$\text{MP: }\textcolor{#00B0FF}{\rule{60px}{6px}}\textcolor{#37474F}{\rule{40px}{6px}}\ \small \text{60/100}$`
  - 彩色细线：`$\textcolor{#FFD700}{\rule{220px}{2px}}$`
- **【组件 C】字号阶梯**：
  - `\Huge` > `\huge` > `\LARGE` > `\Large` > `\large` > `\normalsize` > `\small` > `\footnotesize` > `\scriptsize` > `\tiny`
- **【组件 D】注记、称号与多行堆叠**：
  - 戴顶称号：`\overset{\textcolor{#FFA000}{\tiny ★ 救世主 ★}}{\textbf{\text{阿尔托莉雅}}}`
  - 脚底状态：`\underset{\textcolor{gray}{\tiny [虚弱状态: 防御-30%]}}{\text{亚瑟}}`
  - 双行极小注记：`\overset{\substack{\textcolor{red}{\tiny CRIT +50\%} \\ \textcolor{blue}{\tiny MP消耗 -10}}}{\textbf{\text{真·誓约胜利之剑}}}`
  - 圆弧庇护：`\overgroup{\text{狂战士}\quad\text{游侠}}^{\textcolor{#00E676}{\text{圣盾领域}}}`
- **【组件 E】折扣、改动与拉伸箭头**：
  - 划线改价：`\cancelto{\textcolor{#E53935}{\textbf{\text{99 金币}}}}{\text{500 金币}}`
  - 推进事件：`\xrightarrow[\text{消耗 30 怒气}]{\textcolor{#E65100}{\text{狂暴}}}`
  - 抓取飞爪：`\xhookrightarrow[\text{命中率 90\%}]{\text{暗影锁链}}`
  - 攻防对抗：`\xleftrightharpoons[\text{反伤 200}]{\text{强攻 850}}`
- **【组件 F】网格、矩阵、牢笼与分支**：
  - 2x2 网格：`\begin{array}{|c|c|} \hline \textbf{\text{攻击: 1250}} & \textbf{\text{暴击: 35\%}} \\ \hline \end{array}`
  - 封印牢笼：`\begin{Vmatrix} \Huge \text{😈} \\ \textbf{\text{受缚之炎魔}} \end{Vmatrix}`
  - 抉择分支：`\text{抉择：}\begin{cases} \text{1. 拔刀正面对决} \\ \text{2. 释放烟雾弹撤退} \end{cases}`
- **【组件 G】战术 HUD、四角环绕与瞄准**：
  - 瞄准折角：`\begin{matrix} \ulcorner & & \urcorner \\ & \textcolor{red}{\odot\ \textbf{\text{LOCKED 核心}}} & \\ \llcorner & & \lrcorner \end{matrix}`
  - 右侧悬浮徽章（必须 `$$`）：`$$ \text{任务目标} \tag*{\fcolorbox{#B71C1C}{#FFEBEE}{\textcolor{#B71C1C}{\small \textbf{\text{深渊难度}}}}} $$`
- **【组件 H】纯代码表单控件与离散充能**：
  - 复选框：`\square`（未选）、`\boxtimes`（已选）
  - 离散充能：`\textcolor{#00E5FF}{\bullet\,\bullet\,\bullet}\,\textcolor{#757575}{\circ\,\circ}`
  - 星级品阶：`\textcolor{#FFD700}{\bigstar\bigstar\bigstar\bigstar}\textcolor{#BDBDBD}{\star}`
- **【组件 I】几何变换与粒子**：
  - 水平镜像：`\reflectbox{\text{🗡️}}\ \text{VS}\ \text{🗡️}`
  - 满怒粒子：`\dddot{\text{怒}}`、神圣圆环：`\mathring{\text{光}}`
- **【组件 J】系统状态、逻辑与微表情**：
  - 增益 `\oplus`、减益 `\ominus`、循环 `\circlearrowright`、倒流 `\circlearrowleft`
  - 微笑：`\overset{\smile}{\text{NPC}}`、皱眉：`\overset{\frown}{\text{NPC}}`
  - 判定：契约 `\models`、压制 `\gg`、封顶 `\top`

---

## 4. 排版设计模式库 (Production Templates)

完整模版集合见 [references/templates.md](references/templates.md)。

### 模版 1：【BOSS Raid 讨伐战报卡】
```markdown
$$ \fcolorbox{#B71C1C}{#FFEBEE}{\textcolor{#B71C1C}{\textbf{ BOSS RAID 讨伐进行中 }}} \tag*{\fcolorbox{#212121}{#424242}{\textcolor{white}{\small \text{阶段二}}}} $$

$\text{【讨伐目标】}\overset{\substack{\textcolor{red}{\tiny ★ 远古君王 ★} \\ \textcolor{gray}{\tiny [Lv.95]}}}{\textbf{\text{炼狱炎魔 · 厄里斯}}}$
$\text{生命值: }\textcolor{#F44336}{\rule{120px}{8px}}\textcolor{#616161}{\rule{30px}{8px}}\ \small \text{16.5W / 20W}\ \left( \textcolor{red}{\searrow 17\%} \right)$

$\text{战斗链路：}\text{先锋突刺} \xtwoheadrightarrow{\text{全速冲锋}} \text{破盾} \xrightarrow[\text{护甲穿透 50\%}]{\textcolor{orange}{\text{蓄力斩击}}} \textcolor{red}{\textbf{\text{暴击!}}}$

$\begin{matrix}
\ulcorner & & \urcorner \\
& \textcolor{red}{\odot\ \textbf{\text{弱点锁定：胸口核心}}} & \\
& \circlearrowright\ \text{技能CD冷却中: 3回合} & \\
\llcorner & & \lrcorner
\end{matrix}$
```

### 模版 2：【RPG 角色属性面板】
```markdown
$$ \fcolorbox{#1E3A8A}{#DBEAFE}{\textcolor{#1E3A8A}{\textbf{ 冒险者角色档案 }}} \tag*{\fcolorbox{#059669}{#D1FAE5}{\textcolor{#059669}{\small \text{Lv.45}}}} $$

$\text{角色：}\overset{\textcolor{#EAB308}{\tiny ★ 苍穹龙骑 ★}}{\textbf{\text{艾尔维亚}}}\quad\text{品阶：}\textcolor{#EAB308}{\bigstar\bigstar\bigstar\bigstar\bigstar}$
$\text{生命: }\textcolor{#22C55E}{\rule{110px}{7px}}\textcolor{#374151}{\rule{10px}{7px}}\ \small \text{4580/5000}$
$\text{法力: }\textcolor{#3B82F6}{\rule{80px}{7px}}\textcolor{#374151}{\rule{40px}{7px}}\ \small \text{800/1200}$
$\text{经验: }\textcolor{#EAB308}{\rule{70px}{5px}}\textcolor{#374151}{\rule{50px}{5px}}\ \small \text{58.3\%}$

$\begin{array}{|c|c|}
\hline
\textbf{\text{物理攻击: 1,480}} & \textbf{\text{暴击几率: 42\%}} \\ \hline
\textbf{\text{法术抗性: 320}} & \textbf{\text{攻击速度: 1.85}} \\ \hline
\end{array}$
```

### 模版 3：【限定神秘黑市 / 变动折扣卡】
```markdown
$$ \fcolorbox{#7C2D12}{#FFEDD5}{\textcolor{#9A3412}{\textbf{ 达拉然黑市 · 限时特惠 }}} \tag*{\textcolor{#DC2626}{\small \circlearrowright\ \text{02:45 后刷新}}} $$

$\text{商品：}\overset{\textcolor{#9333EA}{\tiny [史诗武器]}}{\textbf{\text{群星之怒长弓}}}$
$\text{价格：}\cancelto{\textcolor{#DC2626}{\textbf{\text{1,200 金币}}}}{\text{3,000 金币}}\quad\fcolorbox{#DC2626}{#FEE2E2}{\textcolor{#DC2626}{\tiny \textbf{\text{-60\% 折扣}}}}$

$\text{购买分支：}\begin{cases}
\text{1. 金币全款购买} \\
\text{2. 使用 [黑市兑换券] 折抵} \\
\text{3. 离开货摊}
\end{cases}$
```

---

## 5. 开发者代码集成辅助工具

在编写 QQ 官方 Bot（如 Node.js / Python / SealDice 插件）时，请使用辅助脚本动态组装 KaTeX 表达式：
参考实现位于 [assets/katex_helpers.js](assets/katex_helpers.js)。

```javascript
const { text, bar, badge, grid, cancelTo, branchCases } = require('./assets/katex_helpers');
```