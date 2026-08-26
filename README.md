# 医学科普内容自动生成与审核发布平台

## 功能概览

- **每日自动生成**：WorkBuddy 自动化每天早上 8:00 自动生成骨科/心理学科普文章
- **手机端审核**：专业人士在手机微信中打开链接即可审核文章
- **AI 智能修改**：审核员写修改意见，AI 即时改稿并更新内容
- **一键发布**：审核通过后，一键生成公众号和小红书格式内容
- **多平台输出**：自动排版微信公众号 HTML 和小红书图文格式

## 工作流程

```
每日 8:00 自动生成文章
        ↓
  进入"待审核"队列
        ↓
  专业人士手机审核 ← 微信打开链接
     ↙   ↓   ↘
  通过  AI修改  拒绝（可填写原因）
   ↓     ↓        ↓
"已通过" 更新内容  "已拒绝"
   ↓     ↓        ↓
 点击发布  继续审核  可编辑后重新提交
   ↓
 生成公众号格式 + 小红书格式
   ↓
"已发布"
```

## AI 智能修改功能

审核员在文章详情页可以直接写修改意见，AI 会根据意见修改文章。**不需要任何 API Key**——默认由 AI 助手（骨肉相连 / WorkBuddy）接管改稿。

### 两种改稿模式（自动切换）
- **WorkBuddy 模式（默认，无需配置）**：未配置外部 AI API Key 时，提交意见后文章进入"待 AI 改稿"状态，AI 助手（WorkBuddy）自动接管改稿并推回，审核员页面自动刷新看到新版。
  - 即时路径：在对话中直接对我说"去改一下待改稿的文章"，我立刻改好。
  - 自动路径：已配置「医学科普AI自动改稿」自动化（每小时检查一次），不在电脑前也能自动改。
- **外部 AI 模式（可选）**：在设置中配置 DeepSeek/通义千问/OpenAI 等 API Key 后，提交意见由外部 AI 即时改稿（约 10-30 秒）。

### 使用方法
1. 打开文章详情页
2. 在底部"AI 智能修改"区域输入修改意见（如"第三段专业术语太多，请简化"）
3. 点击"提交修改意见"
4. WorkBuddy 模式下文章显示"🤖 AI 助手正在修改…"，稍候自动刷新；外部 AI 模式下等待 10-30 秒自动更新
5. 查看修改后的文章，继续审核或再次提交修改意见
6. 每次修改的历史记录都会保存（标注 byAgent），可展开查看修改前内容

### 配置外部 AI API（可选）
1. 点击页面右上角齿轮图标打开设置
2. 填写 AI API 信息：
   - **API 地址**：默认 `https://api.deepseek.com/v1/chat/completions`
   - **API Key**：在 DeepSeek/通义千问/OpenAI 等平台注册获取
   - **模型名称**：如 `deepseek-chat`、`qwen-plus`、`gpt-4o-mini`
3. 保存设置后走外部 AI 即时改稿；留空则走 WorkBuddy 模式

支持任何 OpenAI 兼容的 AI API。

## 快速启动

### 方法一：双击启动
双击 `启动平台.bat` 文件

### 方法二：命令行启动
```bash
cd medical-science-platform
node server.js
```

启动后：
- 电脑访问：http://localhost:3000
- 手机访问：http://[你的电脑IP]:3000（需在同一 WiFi 下）

### 获取本机 IP
```bash
ipconfig    # Windows
```
找到 IPv4 地址（如 192.168.1.xxx），手机浏览器访问 http://192.168.1.xxx:3000

## 公网访问（不在同一 WiFi / 异地也能用）

使用 localhost.run 免费隧道，把电脑上的审核平台暴露到公网，审核人无论在哪都能打开。

### 固定域名（已配置，推荐）

已注册 localhost.run 账号并绑定本机 SSH 公钥，隧道域名固定不变：

```
https://533d349740755e.lhr.life
```

启动方式（二选一）：
- **双击 `start-tunnel.bat`**（会自动启动本地平台 + 建立公网隧道）
- 或命令行运行其中的 ssh 命令

> 该域名已绑定账号，**重启电脑后重新运行脚本，链接依然是同一个**，可直接发给审核人长期用。
> 隧道进程若因电脑睡眠/断网断开，重跑 `start-tunnel.bat` 即可恢复（域名不变）。

### 原理解释（小白版）
- localhost.run 是一根"网线"，把你电脑的 3000 端口接到它的公网服务器上
- 你电脑上生成的 SSH 密钥（公钥已上传到你的 localhost.run 账号）就是"身份证"，让它认得你的电脑
- 因此每次连上都是同一个子域名，不用每次换链接

### 临时匿名隧道（备用，域名随机会变）
```
ssh -R 80:localhost:3000 nokey@localhost.run
```
匿名隧道每次连接域名都变，仅应急用，不建议长期用。

## 手机审核使用方法

1. 在电脑上启动平台（双击 `启动平台.bat` 或 `start-tunnel.bat`）
2. 获取公网链接（固定域名见上）或电脑 IP 地址
3. 在微信中把链接 `https://533d349740755e.lhr.life`（或 `http://[IP]:3000`）发给审核人
4. 审核人在手机上打开链接（公网链接无需同 WiFi）
5. 在"待审核"列表中查看文章
6. 点击文章查看全文
7. 点击"通过审核"或"拒绝"
8. 通过后点击"发布"，复制公众号/小红书格式内容
9. 粘贴到微信公众号编辑器或小红书 App 发布

## 每日自动生成

已配置 WorkBuddy 自动化任务：
- **执行时间**：每天早上 8:00
- **内容**：骨科和心理学交替生成
- **流程**：自动生成 → 推送到审核平台 → 进入待审核队列

如需修改自动化设置，在 WorkBuddy 中编辑"医学科普每日自动生成"自动化任务。

## 后续配置：微信公众号自动发布

当你注册并认证了微信公众号后：

1. 登录微信公众平台 → 开发 → 基本配置
2. 获取 AppID 和 AppSecret
3. 配置 IP 白名单（添加你的服务器 IP）
4. 在平台设置中填入 AppID 和 AppSecret
5. 系统将支持一键自动发布到公众号（草稿箱 → 发布）

### 微信公众号 API 流程
```
创建草稿 (draft/add) → 提交发布 (freepublish/submit)
```

## 技术架构

- **后端**：Node.js + 内置 HTTP 模块（零依赖）
- **前端**：HTML + CSS + JavaScript（移动端优先）
- **数据存储**：JSON 文件（版本化存储，位于 ~/.medsci-platform/data/）
- **内容生成**：WorkBuddy 自动化 + AI
- **API 认证**：X-API-Key 头（默认密钥：medsci-2026）

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/articles | 文章列表（支持 ?status=pending 筛选） |
| GET | /api/articles/:id | 文章详情 |
| POST | /api/articles | 创建文章（需 X-API-Key） |
| PUT | /api/articles/:id | 编辑文章 |
| POST | /api/articles/:id/approve | 通过审核 |
| POST | /api/articles/:id/reject | 拒绝审核 |
| POST | /api/articles/:id/revise | AI 修改文章（需配置 AI API） |
| POST | /api/articles/:id/publish | 发布文章 |
| GET | /api/stats | 统计数据 |
| GET | /api/settings | 获取设置 |
| PUT | /api/settings | 更新设置 |

## 目录结构

```
medical-science-platform/
├── server.js              # 服务器主程序
├── generate-data.js       # 示例数据生成脚本
├── package.json           # 项目配置
├── 启动平台.bat            # Windows 一键启动
├── README.md              # 本文档
├── public/                # 前端文件
│   ├── index.html         # 主页面
│   ├── css/style.css      # 样式
│   └── js/app.js          # 前端逻辑
└── data/                  # 数据目录（示例）
    └── articles-db.json   # 示例数据
```

## 常见问题

**Q: 手机打不开链接？**
A: 确保电脑和手机在同一 WiFi 下，检查防火墙是否允许 3000 端口。

**Q: 自动生成的文章没出现？**
A: 检查服务器是否在运行。如果服务器未启动，自动化任务会尝试启动它。

**Q: 如何修改 API 密钥？**
A: 设置环境变量 `CONTENT_API_KEY` 或修改 server.js 中的默认值。

**Q: 数据存在哪里？**
A: 数据文件存储在 `~/.medsci-platform/data/` 目录下，使用版本化文件自动管理。
