# KME 学习助手 — 项目说明与协作约定

Chrome MV3 扩展，注入 `pc.kmelearning.com` 学习页，自动按目录顺序播放课程、等平台确认完成后继续下一门。核心文件：

- `content.js` — 注入学习页的全部逻辑（右下角浮窗 + ⚙ 翻转设置面 + 自动学习状态机）
- `styles.css` — 浮窗、翻转设置面与控件样式
- `manifest.json` — MV3 配置（**版本号以此为准**）
- `CHANGELOG.md` / `README.md` / `INSTALL.md` — 文档
- `tests/extension-smoke.mjs` — Playwright 烟雾测试

## 常用命令

- `npm test` — 烟雾测试（**提交前必须通过**）
- `npm run icons` — 重新生成图标

## ⚠️ 每次改完代码后必须「收尾发布」（硬性流程）

只要对扩展做了一处**完整的功能 / 行为改动**，在收尾前要**自己主动**走完下面整套，不用等用户再开口（功能还没写完时不要做）：

1. **升版本号**（语义化版本，`manifest.json` 与 `package.json` 两处**必须一致**）：
   - 修 bug → 修订号 +1（`x.y.Z`）
   - 加功能 → 次版本 +1（`x.Y.0`）
   - 不兼容地改 / 删已有行为 → 主版本 +1（`X.0.0`）
   - 纯文档 / 工具改动 → **不升版本**，提交用 `docs:` / `chore:`
2. **补 `CHANGELOG.md`**：在版本列表**最上方**加 `## [X.Y.Z] - YYYY-MM-DD`（日期用 `date +%F`），按 Keep a Changelog 的中文小节（`### 新增` / `### 变更` / `### 修复` / `### 移除`）写**具体**内容，语气沿用已有条目，**基于真实 diff、不要凭空猜**。
3. **按需更新 `README.md` / `INSTALL.md`**：README 里「最近一次更新（**vX.Y.Z**）：……」那一行**总要**更新；改动涉及功能、设置项、文件结构、安装步骤时同步对应章节，不涉及就别动。
4. **跑 `npm test`**：必须通过。不过就先修好，**绝不带病提交**。
5. **`git commit`**：
   - 只 `git add -u`（已跟踪文件的改动）+ 显式 `git add <路径>` 纳入要进仓库的新文件；**绝不** `git add -A` / `git add .`，绝不提交 `.DS_Store`、`.remember/`、`dist/`、`node_modules/`、`.claude/` 本地配置。
   - 信息格式：`<type>: <简洁中文描述> (vX.Y.Z)`（type 为 `feat` / `fix`；纯文档 / 工具用 `docs:` / `chore:`，不带版本号）。
   - 末尾**单独一行**加：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
6. **`git push`**：推当前分支（本仓库一直直接发布到 `main`）。失败就**原样报告错误**，不要 force push。

## 约定

- 版本号唯一真源是 `manifest.json`，改完务必同步 `package.json`。
- 不新建分支（除非用户明确要求）；本仓库历史一直直推 `main`。
- 文档不要编造 diff 里没有的内容。
- 视频固定 1x 播放是核心行为（平台按真实学习时长判完成），不要再加「倍速」类开关。
