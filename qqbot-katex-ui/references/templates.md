# QQBot KaTeX 经典实战排版模版库 (Production Templates)

以下模版均经过严格实测，完全规避中文字符变形、移动端超宽截断、`\cfrac` 崩溃与 Markdown 语法冲突问题。可直接复制并替换动态变量。

---

## 模版 1：【BOSS Raid 讨伐战报卡】
适用于多人讨伐、世界 BOSS、高难副本实时战况汇报。

```markdown
$$ \fcolorbox{#B71C1C}{#FFEBEE}{\textcolor{#B71C1C}{\textbf{ BOSS RAID 讨伐进行中 }}} \tag*{\fcolorbox{#212121}{#424242}{\textcolor{white}{\small \text{阶段二}}}} $$

$\text{【讨伐首领】}\overset{\substack{\textcolor{#EF4444}{\tiny ★ 远古君王 ★} \\ \textcolor{#9CA3AF}{\tiny [Lv.95 炼狱种]}}}{\textbf{\text{炼狱炎魔 · 厄里斯}}}$

$\text{生命值: }\textcolor{#EF4444}{\rule{120px}{8px}}\textcolor{#4B5563}{\rule{30px}{8px}}\ \small \text{16.5W / 20W}\ \left( \textcolor{#EF4444}{\searrow 17.5\%} \right)$

$\text{战斗链路：}\text{前锋突刺} \xtwoheadrightarrow{\text{全速冲锋}} \text{破盾} \xrightarrow[\text{护甲穿透 50\%}]{\textcolor{#F97316}{\text{蓄力斩击}}} \textcolor{#DC2626}{\textbf{\text{暴击 8,940!}}}$

$\begin{matrix}
\ulcorner & & \urcorner \\
& \textcolor{#EF4444}{\odot\ \textbf{\text{弱点锁定：胸口熔岩核心}}} & \\
& \circlearrowright\ \text{全屏大招蓄力中: 剩余 2 回合} & \\
\llcorner & & \lrcorner
\end{matrix}$

$\textcolor{#F59E0B}{\rule{220px}{1.5px}}$
```

---

## 模版 2：【RPG 角色综合属性面板】
适用于玩家个人信息查询、装备栏总览、属性升级。

```markdown
$$ \fcolorbox{#1E3A8A}{#DBEAFE}{\textcolor{#1E3A8A}{\textbf{ 冒险者角色档案 }}} \tag*{\fcolorbox{#059669}{#D1FAE5}{\textcolor{#059669}{\small \text{Lv.45}}}} $$

$\text{冒险者：}\overset{\textcolor{#F59E0B}{\tiny ★ 苍穹龙骑 ★}}{\textbf{\text{艾尔维亚}}}\quad\text{品质：}\textcolor{#F59E0B}{\bigstar\bigstar\bigstar\bigstar\bigstar}$

$\text{生命: }\textcolor{#10B981}{\rule{100px}{7px}}\textcolor{#374151}{\rule{15px}{7px}}\ \small \text{4,650 / 5,000}$
$\text{法力: }\textcolor{#0EA5E9}{\rule{70px}{7px}}\textcolor{#374151}{\rule{45px}{7px}}\ \small \text{700 / 1,200}$
$\text{经验: }\textcolor{#F59E0B}{\rule{85px}{5px}}\textcolor{#374151}{\rule{30px}{5px}}\ \small \text{74.2\%}$

$\begin{array}{|c|c|}
\hline
\textbf{\text{物理攻击: 1,480}} & \textbf{\text{暴击几率: 42\%}} \\ \hline
\textbf{\text{物理防御: 920}} & \textbf{\text{法术抗性: 540}} \\ \hline
\textbf{\text{移动速度: 460}} & \textbf{\text{攻击速度: 1.85}} \\ \hline
\end{array}$

$\text{状态：}\textcolor{#10B981}{\oplus\ \text{祝福增益}}\quad\textcolor{#6B7280}{\circ\ \text{无负面状态}}$
```

---

## 模版 3：【防塌陷 3x3 战术背包与装备栏】
使用 `\phantom` 防止空格子坍缩，并标上品阶颜色与强化等级。

```markdown
$$ \fcolorbox{#374151}{#F3F4F6}{\textcolor{#1F2937}{\textbf{ 随身次元背包 (9/12) }}} \tag*{\textcolor{#4B5563}{\small \text{容量: 75\%}}} $$

$\begin{array}{|c|c|c|}
\hline
\overset{\textcolor{#DC2626}{\tiny [+12]}}{\textcolor{#DC2626}{\textbf{\text{龙骨圣剑}}}} & 
\overset{\textcolor{#8B5CF6}{\tiny [+8]}}{\textcolor{#8B5CF6}{\text{暗影斗篷}}} & 
\textcolor{#2563EB}{\text{生命药水x5}} \\ \hline
\textcolor{#2563EB}{\text{法力药水x3}} & 
\overset{\textcolor{#D97706}{\tiny [传说]}}{\textcolor{#D97706}{\textbf{\text{封印罗盘}}}} & 
\textcolor{#4B5563}{\text{传送卷轴}} \\ \hline
\textcolor{#4B5563}{\text{铁矿石x24}} & 
\phantom{\text{占位空格}} & 
\phantom{\text{占位空格}} \\ \hline
\end{array}$

$\text{金币储量：}\textcolor{#D97706}{\blacksquare}\ \textbf{\text{148,500 金币}}\quad\text{充能点：}\textcolor{#0EA5E9}{\bullet\,\bullet\,\bullet}\,\textcolor{#9CA3AF}{\circ\,\circ}$
```

---

## 模版 4：【神秘黑市 · 变动折扣与购买卡】
利用 `\cancelto` 实现视觉冲击极强的价格变动划线。

```markdown
$$ \fcolorbox{#7C2D12}{#FFEDD5}{\textcolor{#9A3412}{\textbf{ 达拉然黑市 · 限时特惠 }}} \tag*{\textcolor{#DC2626}{\small \circlearrowright\ \text{03:20 后撤柜}}} $$

$\text{限时商品：}\overset{\textcolor{#8B5CF6}{\tiny [史诗级武器 · 仅此一件]}}{\textbf{\text{群星之怒 · 逐风长弓}}}$

$\text{原厂售价：}\cancelto{\textcolor{#DC2626}{\textbf{\text{1,200 金币}}}}{\text{3,200 金币}}\quad\fcolorbox{#DC2626}{#FEE2E2}{\textcolor{#DC2626}{\tiny \textbf{\text{-62.5\% OFF}}}}$

$\text{背包持有：}\textbf{\text{5,420 金币}}\quad\text{判定：}\textcolor{#10B981}{\checkmark\ \text{余额充裕}}$

$\text{交易抉择：}\begin{cases}
\text{1. 金币全款现结} \\
\text{2. 使用 [黑市抵扣券] -300金} \\
\text{3. 离开货摊}
\end{cases}$
```

---

## 模版 5：【公会悬赏令 / 任务日志卡】
结合表单控件 `\boxtimes` 和 `\square` 直观展示多目标完成进度。

```markdown
$$ \fcolorbox{#78350F}{#FEF3C7}{\textcolor{#78350F}{\textbf{ 公会 S 级悬赏令 }}} \tag*{\textcolor{#D97706}{\bigstar\bigstar\bigstar\bigstar\star}} $$

$\text{任务代号：}\overset{\textcolor{#DC2626}{\tiny [极度危险]}}{\textbf{\text{清理幽暗沼泽毒蛛巢穴}}}$

$\begin{matrix}
\boxtimes & \text{深入幽暗沼泽毒雾核心区} & \textcolor{#10B981}{\text{[已完成]}} \\
\boxtimes & \text{讨伐 15 只腐蚀剧毒蛛} & \textcolor{#10B981}{\text{[15/15]}} \\
\square & \text{击溃潜伏的蛛后·艾希拉} & \textcolor{#EF4444}{\text{[0/1 未达成]}} \\
\square & \text{采集 3 份纯净蛛皇毒囊} & \textcolor{#F59E0B}{\text{[1/3 进行中]}}
\end{matrix}$

$\text{总悬赏酬金：}\overbrace{\text{8,000 金币}+\text{声望 500点}}^{\textcolor{#F59E0B}{\textbf{\text{极高公会回报}}}}$
```

---

## 模版 6：【NPC 剧情对话与语气分支卡】
结合微表情、语气弧线与分支抉择，提升剧情跑团沉浸感。

```markdown
$$ \fcolorbox{#312E81}{#EEF2FF}{\textcolor{#312E81}{\textbf{ 剧情对话：隐居学者 · 诺顿 }}} \tag*{\text{好感度: }\textcolor{#EF4444}{\heartsuit\heartsuit\heartsuit}\textcolor{#9CA3AF}{\heartsuit\heartsuit}} $$

$\overset{\smile}{\text{诺顿}}：\overgroup{\text{“年轻人，你身上的古代徽章...究竟是从哪里得到的？”}}^{\textcolor{#6366F1}{\tiny [眼神充满探究与戒备]}}$

$\text{你的应对：}\begin{cases}
\text{1. 如实告知：在黑石山遗迹地宫寻获 (诚信+5)} \\
\text{2. 隐瞒真相：集市地摊随手买的玩具 (伪装检定)} \\
\text{3. 反客为主：先告诉我你为何认得它 (魅力检定)}
\end{cases}$
```

---

## 模版 7：【迷宫多层探索下潜战报 (禁用 cfrac 安全方案)】
采用阶梯矩阵替代易崩溃的 `\cfrac`，稳定呈现层级下潜视觉。

```markdown
$$ \fcolorbox{#064E3B}{#ECFDF5}{\textcolor{#064E3B}{\textbf{ 深渊迷宫探索简报 }}} \tag*{\textcolor{#059669}{\small \textbf{\text{深度 B4}}}} $$

$\text{下潜轨迹：}\begin{matrix}
\textbf{\text{地表入口}} & & \\
& \searrow \text{幽暗矿坑 B1} & \\
& & \searrow \text{地下溶洞 B2} \\
& & & \searrow \textcolor{#EF4444}{\textbf{\text{熔岩核心 B4 [当前]}}}
\end{matrix}$

$\text{探索进度: }\textcolor{#10B981}{\rule{90px}{6px}}\textcolor{#374151}{\rule{30px}{6px}}\ \small \text{75\% 完成}$
$\text{队伍精力：}\textcolor{#0EA5E9}{\bullet\,\bullet}\,\textcolor{#9CA3AF}{\circ\,\circ\,\circ}\quad\text{San值判定：}\textcolor{#10B981}{\top\ \text{精神平稳}}$
```

---

## 模版 8：【竞技场 PVP 双方巅峰对决】
运用水平镜像反转 `\reflectbox` 和双向鱼叉对抗拉伸箭头。

```markdown
$$ \fcolorbox{#831843}{#FDF2F8}{\textcolor{#831843}{\textbf{ 荣耀角斗场 · 巅峰对决 }}} \tag*{\textcolor{#DC2626}{\small \textbf{\text{赛点局}}}} $$

$\overset{\textcolor{#2563EB}{\tiny [积分 2,450]}}{\textbf{\text{雷霆战狂 · 凯尔}}}\quad\reflectbox{\text{🗡️}}\ \text{VS}\ \text{🗡️}\quad\overset{\textcolor{#DC2626}{\tiny [积分 2,480]}}{\textbf{\text{暗影刺客 · 莉莉丝}}}$

$\text{蓝方 HP: }\textcolor{#2563EB}{\rule{60px}{6px}}\textcolor{#374151}{\rule{40px}{6px}}\ \small \text{60\%}\quad\Big|\quad\text{红方 HP: }\textcolor{#DC2626}{\rule{45px}{6px}}\textcolor{#374151}{\rule{55px}{6px}}\ \small \text{45\%}$

$\text{交锋回合：}\text{破空斩} \xleftrightharpoons[\text{暗影斗篷规避 80\%}]{\text{正面劈砍 1,200}} \text{伏击背刺}$

$\text{战局判定：}\text{凯尔}\ \gg\ \text{莉莉丝 (力量压制生效!)}$
```