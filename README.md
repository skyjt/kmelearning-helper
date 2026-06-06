# kmelearning-helper

给 `pc.kmelearning.com` 学习页使用的 Chrome Manifest V3 扩展。扩展会在页面右下角加入“学习助手”浮窗，帮助按课程目录顺序自动播放、等待平台确认完成，并继续进入下一个未完成课程。

## 适用场景

这个项目适合用于减少重复点击：进入学习目录后，按平台自身的完成规则持续播放、返回课程列表、继续下一个未完成课程。

它不是跳过学习或伪造完成状态的工具。现有实现默认保持 1x 播放，并等待平台页面自己显示完成标记后再继续。

## 为什么默认不做倍速/跳过

`pc.kmelearning.com` 的课程页面不是只看视频有没有播放到结尾。页面会按心跳、真实学习时长、播放进度和完成状态共同判断学习是否完成。

因此：

- 第三方倍速插件即使把视频播完，也可能因为真实学习时长不足而不显示完成。
- 直接拖到结尾或跳过播放，通常不会通过平台的完成判断。
- 本扩展默认锁定 1x，并在平台没有确认完成时按 1x 补学/重播。

## 功能

- 在学习目录页显示“学习助手”浮窗。
- 点击“开始自动学习”后，自动进入第一个未完成课程。
- 显示当前目录的总学习进度。
- 支持最小化为右下角 logo，点击或鼠标移上去可恢复。
- 在课程内自动播放视频，文档/材料页会保持页面活跃并等待完成标记。
- 当前课程内容完成后，自动返回上一级课程列表。
- 返回课程列表前检查课程记录里的“学习总时长”；如果低于课程要求学时，会继续按 1x 补学。
- 自动跳过考试、测验、问卷、作业等需要人工完成的页面。
- 默认抵消第三方倍速导致的未完成问题。

## 安装

### 方式一：下载源码 ZIP

1. 打开 GitHub 仓库页面。
2. 点击 `Code` -> `Download ZIP`。
3. 解压下载到本地的 ZIP 文件。
4. 打开 Chrome，进入 `chrome://extensions`。
5. 打开右上角“开发者模式”。
6. 点击“加载已解压的扩展程序”。
7. 选择解压后的项目文件夹，也就是包含 `manifest.json` 的目录。
8. 打开或刷新 `https://pc.kmelearning.com/` 的学习页面。

### 方式二：用 Git 克隆

```bash
git clone https://github.com/skyjt/kmelearning-helper.git
```

然后在 Chrome 的 `chrome://extensions` 中加载克隆下来的 `kmelearning-helper` 目录。

## 使用

1. 登录并进入 `pc.kmelearning.com` 的学习目录页。
2. 确认页面右下角出现“学习助手”浮窗。
3. 点击“开始自动学习”。
4. 保持标签页打开，扩展会按“课程内容完成 -> 返回上一级 -> 继续下一个未完成课程”的顺序执行。

如果进入考试、测验、问卷或作业页面，扩展会跳过，不会代替用户作答或提交。

## 设置项

浮窗中可以调整这些行为：

- 自动播放视频。
- 强制 1x 速度。
- 视频结束但平台未确认时自动补学。
- 检查课程总学习时长。
- 跳过考试/测验/问卷/作业页面。

## 开发

安装依赖：

```bash
npm install
```

运行烟雾测试：

```bash
npm test
```

重新生成图标：

```bash
npm run icons
```

打包本地安装 ZIP：

```bash
mkdir -p dist
zip -r "dist/kmelearning-helper-v$(node -p "require('./manifest.json').version").zip" \
  manifest.json content.js styles.css icons README.md INSTALL.md LICENSE
```

## 文件结构

- `manifest.json`：Chrome MV3 扩展配置。
- `content.js`：注入到学习页面的主要逻辑。
- `styles.css`：浮窗和控件样式。
- `icons/`：扩展图标。
- `tests/extension-smoke.mjs`：基于 Playwright 的本地烟雾测试。
- `tools/generate-icons.mjs`：图标生成脚本。

## 免责声明

请在遵守所在组织、平台规则和课程要求的前提下使用。本项目只做本地浏览器页面辅助，不上传学习数据，不替用户完成考试、测验、问卷或作业。

## License

MIT
