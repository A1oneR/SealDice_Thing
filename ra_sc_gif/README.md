# ra/sc GIF 动效

## 启动后端

后端优先执行附件中的原始 Canvas 动画：`assets/animation_template.html`
（800×800 画布，按 HTML 的 `renderFrame` 逐帧截图后缩放导出 400×400 GIF）。
若运行环境没有 Chrome，则自动回退 Pillow，并可在 `/health` 返回的
`renderer` 字段看到当前实际引擎。

```powershell
cd E:\DownLoading\javascript-main\JavaScript_Plugins\ra_sc_gif
py -3 -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe ra_sc_gif_server.py
```

默认关闭后台事件记录；调试时可先执行 `$env:RA_SC_GIF_DEBUG_EVENTS='1'` 再启动服务。

默认监听 `127.0.0.1:3892`。插件默认使用 URL，避免 GIF Base64 超过海豹单条消息长度限制。如要让官方 QQ Bot 读取图片，设置 `RA_SC_GIF_PUBLIC_BASE=https://你的域名`，反向代理该端口；本机 OneBot 可直接使用 `http://127.0.0.1:3892`。Base64 仅适合很小的图片，GIF 过大时插件会自动改用 URL。

也可以直接调用后端（`result` 是骰点，`target` 是技能目标值）：

```powershell
Invoke-RestMethod http://127.0.0.1:3892/api/roll-gif -Method Post -ContentType 'application/json' -Body '{"mode":"coc","skill":"侦查","target":60,"result":32}'
```

## 安装插件

将 `seal_ra_sc_gif.js` 上传到 SealDice JS 插件目录并启用。插件默认关闭，需先在目标会话输入：

```text
.ra动效 开启
```

如果使用的是本仓库附带的核心源码，请同时带上 `dice/im_session.go`、`dice/dice_jsvm.go` 与 `dice/im_helpers.go` 修复：前者让扩展指令在执行期间保留 `ctx.commandName`，后者让热重载同步 `autoActive` 到 wrapper 并导出 `replyToSenderBypassIntercept`/`replyPersonBypassIntercept`，从而使 `onMessageSendIntercept` 能无死锁安全拦截与异步回发 COC7 的 `ra/sc` 及私聊/暗骰。未包含这些修复的旧核心会出现“钩子：无”或无法安全异步回发；仅重载 JS 插件无法弥补核心没有调用钩子的情况。
同时，插件支持在扩展配置中通过【支持私聊】开关一键启用或禁用私聊动效（关闭后私聊直接发送原生文案，不生成动图）。

也支持 `.sc动效 开启`、`.检定动效 开启`、`.ra_sc_gif 开启`；关闭或查看状态分别使用“关闭”“状态”。群聊按群保存状态，且要求权限等级≥50；私聊按用户保存。风格也通过同一指令切换：

```text
.ra动效 风格 骰子       # 默认：晶体骰子
.ra动效 风格 表盘       # 命运表盘
.ra动效 风格 老虎       # 多轴老虎机
```

插件也会处理普通 `.r/.rd/.roll` 骰点（包括 `.r d6`、`.r 2d6+1` 等）以及 `.rh/.rhd/.rdh` 暗骰别名。常规 D2-D100 会按实际骰面显示；D100 以上的非常规骰面（例如 D121）为避免动画分面溢出，会回退为默认 D100 动效，但原始骰点文案不变。可在插件配置中设置“最大同时动画数”（默认 3）和“最大动画骰子数”（默认 8），达到上限时保留原文并写入诊断日志。

风格同样按群/私聊独立保存，群聊切换要求权限等级≥50。后端不再有风格配置项，插件会在请求中传入当前会话选择。开启后插件才会拦截 `ra`、`sc` 的出站文案。发送顺序固定为两条独立消息：先单独发送 GIF 图片，等待动画前段播放到最后一帧（默认约 3.4 秒，可在“文案延迟秒数”中增加等待）后，再单独发送一次原有自定义文案；图片不会与文字拼在同一条消息中。后端失败时默认只回退原文，不会吞掉骰点结果。

如果没有收到 GIF，可在同一会话执行：

```text
.ra动效 诊断
```

后端默认不记录每次请求的拦截/渲染事件，避免后台日志噪声；需要排查时启动后端前设置 `$env:RA_SC_GIF_DEBUG_EVENTS='1'`，再通过 `/api/debug` 查看最近事件。插件错误时默认会在原文前附加 `[GIF动效未发送：原因]`，便于定位。诊断中的“指令”记录可证明 `ra/sc` 已执行；“钩子”仍为“无”则说明当前核心未调用前置拦截 API，必须使用上述核心源码重新编译/替换运行中的 `sealdice-core.exe`。

## 时间与体积

动画部分为 35 帧、每帧 100 ms；最后一帧通过 GIF Graphics Control Extension 的 16 位 centisecond 延迟保持 300 秒（可用 `RA_SC_GIF_TAIL_SECONDS` 调到 270–655 秒）。这是单帧长延迟，不是复制数千帧，因此尾帧时长不会让文件大小线性增长。
