# 部署到云端（Railway）—— 告别"重启就打不开"

把审核平台搬到 Railway 后，平台运行在云服务器上，**不再依赖你这台电脑开关机**，
Railway 会给你一个固定公网地址（如 `xxx.up.railway.app`），手机微信直接开，永不掉线。

> 代码已经改好：零依赖、支持 `PORT` 和 `DATA_DIR` 环境变量、`Dockerfile` 已就绪。
> 你只需做「注册 + 推代码 + 点几下按钮」，文章迁移有一条命令搞定。

---

## 第 1 步：注册 Railway（1 分钟）

1. 打开 https://railway.app
2. 点 **Login** → 用 **GitHub** 登录（你 serveo 用的就是 GitHub，直接用同一个号）
3. 注册完进入控制台

> 免费额度约 $5，轻量使用（每天几篇文章 + 偶尔审核）能用很久；用完后约 $5/月。
> 不想花钱后再说，先跑通再说。

---

## 第 2 步：把代码推到 GitHub（在你自己电脑上操作）

在你的电脑上打开 **PowerShell 或 Git Bash**，进到项目目录：

```powershell
cd "C:\Users\Junchao Fang\WorkBuddy\2026-08-05-18-45-18\medical-science-platform"
```

如果你还没有 GitHub 仓库，去 https://github.com/new 新建一个（名字随便，如 `medsci-platform`），
然后执行下面几条（把 `你的用户名` 和 `仓库名` 换成你自己的）：

```powershell
git init
git add .
git commit -m "医学科普审核平台 - 云端部署版"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

> 提示：推送时如果让你输密码，GitHub 现在用 **Personal Access Token**（不是账号密码）。
> 在 GitHub → Settings → Developer settings → Personal access tokens 生成一个，勾 repo 权限即可。

---

## 第 3 步：在 Railway 部署（网页点几下）

1. Railway 控制台点 **New Project** → **Deploy from GitHub repo**
2. 选中你刚推的仓库，Railway 会自动识别 Node 项目并开始部署
3. 部署完成后，进入项目 → **Variables**（环境变量），添加两项：
   - `CONTENT_API_KEY` = `medsci-2026`（或你自定义的密钥）
   - `DATA_DIR` = `/data`（让文章存到持久盘，重启不丢）
4. 进入 **Volumes**（持久盘），点 **New Volume**，挂载路径填 `/data`，容量 1GB 足够
5. 回到 **Deployments** 点 **Redeploy**（让挂载和变量生效）

部署完，Railway 会生成一个固定地址，类似：
```
https://medsci-platform.up.railway.app
```
这就是你以后给审核员发的地址，**不用隧道、不用开电脑**。

---

## 第 4 步：把现有 8 篇文章迁过去（一次性）

在本机项目目录运行（把地址换成你第 3 步拿到的）：

```powershell
cd "C:\Users\Junchao Fang\WorkBuddy\2026-08-05-18-45-18\medical-science-platform"
node migrate.js https://medsci-platform.up.railway.app
```

脚本会读取你电脑里 `~/.medsci-platform/data` 的最新文章，逐篇推到云端。
看到 `成功推送 8/8` 就完事。之后所有新文章都直接存云端。

---

## 第 5 步：收尾

- 本地服务器、serveo 隧道、start-serveo.bat 全部可以退休了
- 以后只在 Railway 后台看状态；要改代码就改完 `git push`，Railway 自动重新部署
- 想换自定义域名（如 `review.gurou.link`）？Railway 支持绑定你自己的域名，回头再说

---

## 常见问题

**Q：Railway 重启会丢文章吗？**
不会。文章存在第 3 步挂的 `/data` 持久盘里，重启/重新部署都不丢。

**Q：不想用 Railway 了能搬走吗？**
能。代码零依赖、数据就是 JSON 文件，搬到任何支持 Node 的云（Fly.io / Render / 自己的服务器）都一样。

**Q：审核员现在用 guroulian.serveousercontent.com 还能用吗？**
能，但那是依赖你电脑的临时方案。上云后请把新地址 `xxx.up.railway.app` 发给审核员。
