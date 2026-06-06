import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

Module._initPaths();
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const sourceExtensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const html = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>江苏农商联合银行</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { padding: 24px; }
    .panelContent__VcTCG { display: flex; align-items: center; justify-content: space-between; width: 720px; min-height: 52px; margin: 8px 0; padding: 0 16px; border: 1px solid #ddd; cursor: pointer; }
    .anticon5-check { color: #246bfe; }
    .scrollBody__Jdo84 { width: 300px; border-right: 1px solid #ddd; min-height: 260px; }
    .lesson-item { padding: 12px 16px; cursor: pointer; }
    .lesson-item.active { background: #eff5ff; }
    .layout { display: flex; gap: 24px; }
  </style>
</head>
<body>
<main id="app"></main>
<script>
  const app = document.getElementById("app");
  const log = [];
  window.__mockLog = log;

  const courses = [
    { title: "网络安全意识专题培训", complete: false },
    { title: "使用正版软件推动网络安全", complete: true },
    { title: "电子邮件安全", complete: false }
  ];

  let currentCourse = 0;
  let currentLesson = 0;
  let lessonDone = [];

  function check() {
    return '<span class="anticon5-check" data-icon="check">✓</span>';
  }

  function renderCatalog() {
    history.pushState({}, "", "/jsncxyslhs/home/training/study/mock");
    app.innerHTML = '<h1>2026年6月暨网络安全意识培训</h1><p>「2个活动未完成」</p>' +
      courses.map((course, index) => (
        '<div class="panelContent__VcTCG" data-index="' + index + '">' +
        '<span>' + course.title + ' 课程</span>' +
        (course.complete ? check() : '<span>未完成</span>') +
        '</div>'
      )).join("");
    document.querySelectorAll(".panelContent__VcTCG").forEach((row) => {
      row.addEventListener("click", () => {
        currentCourse = Number(row.dataset.index);
        log.push("course:" + courses[currentCourse].title);
        renderCourse();
      });
    });
  }

  function renderCourse() {
    history.pushState({}, "", "/jsncxyslhs/home/course/study/" + currentCourse);
    lessonDone = [false, false, false];
    currentLesson = 0;
    paintCourse();
    completeCurrentSoon();
  }

  function paintCourse() {
    const lessons = ["视频一", "随堂测验", "文档一"];
    app.innerHTML =
      '<button id="back">返回</button>' +
      '<h1>课程内容：' + courses[currentCourse].title + '</h1>' +
      '<div class="layout"><aside class="scrollBody__Jdo84">' +
      lessons.map((lesson, index) => (
        '<div class="lesson-item ' + (index === currentLesson ? "active" : "") + '" data-index="' + index + '">' +
        '<div class="cursor-pointer"><span>' + lesson + (index === 1 ? " 测验" : " 课程") + '</span></div>' +
        (lessonDone[index] ? check() : '<span>未完成</span>') +
        '</div>'
      )).join("") +
      '</aside><section><p>正在学习：' + lessons[currentLesson] + '</p></section></div>';

    document.getElementById("back").addEventListener("click", () => {
      courses[currentCourse].complete = true;
      log.push("back:" + courses[currentCourse].title);
      renderCatalog();
    });
    document.querySelectorAll(".lesson-item").forEach((item) => {
      item.addEventListener("click", () => {
        currentLesson = Number(item.dataset.index);
        log.push("lesson:" + lessons[currentLesson]);
        paintCourse();
        completeCurrentSoon();
      });
    });
  }

  function completeCurrentSoon() {
    setTimeout(() => {
      if (currentLesson === 1) return;
      lessonDone[currentLesson] = true;
      log.push("done:" + currentLesson);
      paintCourse();
    }, 1200);
  }

  renderCatalog();
</script>
</body>
</html>`;

const timeShortHtml = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>江苏农商联合银行</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { padding: 24px; }
    .course-wrap { display: flex; flex-direction: column; gap: 16px; }
    .course-main-wrap { display: flex; gap: 24px; }
    .course-main-area { width: 520px; }
    video { display: block; width: 480px; height: 270px; background: #111; }
    .root__mZMt4 { width: 340px; }
    .ant5-tabs-tab-btn { display: inline-block; margin-right: 24px; cursor: pointer; }
    .scrollBody__Jdo84 { margin-top: 18px; min-height: 180px; }
    .lesson-item.active { padding: 12px; background: #eff5ff; }
    .anticon5-check { color: #246bfe; }
  </style>
</head>
<body>
<main>
  <button id="back">返回</button>
  <section class="course-wrap">
    <header><strong>补学课程</strong><span> 收藏 </span><span>1学时</span></header>
    <div class="course-main-wrap">
      <div class="course-main-area">
        <video id="mock-video"></video>
      </div>
      <aside class="root__mZMt4">
        <nav>
          <button class="ant5-tabs-tab-btn ant5-tabs-tab-active">目录</button>
          <button class="ant5-tabs-tab-btn">记录</button>
          <button class="ant5-tabs-tab-btn">评论</button>
        </nav>
        <div class="scrollBody__Jdo84">
          <div class="lesson-item active">
            <span>补学课程 00:32:16</span>
            <span class="anticon5-check" data-icon="check">✓</span>
          </div>
          <div class="course-records-root__WU_lB">
            <div>学习次数 6</div>
            <div>学习总时长 00:32:23</div>
            <div>开始时间 持续时间</div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</main>
<script>
  window.__mockReplayCount = 0;
  window.__mockBackCount = 0;
  window.__mockPaused = true;
  window.__mockEnded = true;
  window.__mockCurrentTime = 1936;
  const video = document.getElementById("mock-video");
  Object.defineProperty(video, "duration", { configurable: true, get: () => 1936 });
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => window.__mockCurrentTime,
    set: (value) => { window.__mockCurrentTime = Number(value) || 0; }
  });
  Object.defineProperty(video, "paused", { configurable: true, get: () => window.__mockPaused });
  Object.defineProperty(video, "ended", { configurable: true, get: () => window.__mockEnded });
  video.play = async () => {
    window.__mockReplayCount += 1;
    window.__mockPaused = false;
    window.__mockEnded = false;
  };
  video.pause = () => {
    window.__mockPaused = true;
  };
  document.getElementById("back").addEventListener("click", () => {
    window.__mockBackCount += 1;
  });
</script>
</body>
</html>`;

const browser = await chromium.launch({
  headless: true,
  executablePath: fs.existsSync(chromeExecutable) ? chromeExecutable : undefined
});
const context = await browser.newContext();

try {
  await context.addInitScript(() => {
    window.__mockChromeStorage = {};
    window.chrome = {
      storage: {
        local: {
          get(defaults, callback) {
            callback({ ...defaults, ...window.__mockChromeStorage });
          },
          set(patch, callback) {
            Object.assign(window.__mockChromeStorage, patch);
            callback?.();
          }
        }
      }
    };
  });

  await context.route("https://pc.kmelearning.com/**", (route) => {
    const body = route.request().url().includes("/time-short") ? timeShortHtml : html;
    route.fulfill({ status: 200, contentType: "text/html", body });
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://pc.kmelearning.com/jsncxyslhs/home/training/study/mock");
  await page.addStyleTag({ path: path.join(sourceExtensionPath, "styles.css") });
  await page.addScriptTag({ path: path.join(sourceExtensionPath, "content.js") });
  try {
    await page.waitForSelector("#kme-learning-navigator", { timeout: 10000 });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      title: document.title,
      url: location.href,
      body: document.body.innerText.slice(0, 500),
      helperPanel: Boolean(document.querySelector("#kme-learning-navigator"))
    }));
    const workers = [];
    throw new Error(`helper panel did not load: ${JSON.stringify({ diagnostics, workers })}`);
  }

  const initial = await page.evaluate(() => ({
    panel: document.querySelector("#kme-learning-navigator")?.innerText || "",
    catalog: [...document.querySelectorAll(".panelContent__VcTCG")].map((row) => row.innerText)
  }));
  if (!initial.panel.includes("学习助手") || initial.catalog.length !== 3) {
    throw new Error(`catalog detection failed: ${JSON.stringify(initial)}`);
  }
  if (!initial.panel.includes("总进度 1/3")) {
    throw new Error(`initial progress failed: ${JSON.stringify(initial.panel)}`);
  }

  await page.locator(".kme-learning-navigator-minimize").click();
  await page.waitForSelector(".kme-learning-navigator-panel", { state: "hidden", timeout: 5000 });
  await page.waitForSelector(".kme-learning-navigator-logo-toggle", { state: "visible", timeout: 5000 });
  await page.evaluate(() => {
    document.querySelector(".kme-learning-navigator-logo-toggle")
      ?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  });
  await page.waitForSelector(".kme-learning-navigator-panel", { state: "visible", timeout: 5000 });

  await page.locator(".kme-learning-navigator-primary").click();
  await page.waitForFunction(() => document.body.innerText.includes("课程内容：网络安全意识专题培训"), undefined, { timeout: 10000 });
  await page.waitForFunction(() => document.body.innerText.includes("课程内容：电子邮件安全"), undefined, { timeout: 20000 });

  const finalState = await page.evaluate(() => ({
    panel: document.querySelector("#kme-learning-navigator")?.innerText || "",
    log: window.__mockLog,
    text: document.body.innerText
  }));

  if (!finalState.log.includes("course:网络安全意识专题培训")) {
    throw new Error(`wrong first target: ${JSON.stringify(finalState.log)}`);
  }
  if (!finalState.log.includes("lesson:文档一")) {
    throw new Error(`question skip / next lesson failed: ${JSON.stringify(finalState.log)}`);
  }
  if (!finalState.log.includes("back:网络安全意识专题培训")) {
    throw new Error(`return to catalog failed: ${JSON.stringify(finalState.log)}`);
  }
  if (!finalState.text.includes("课程内容：电子邮件安全")) {
    throw new Error(`next catalog course failed: ${finalState.text}`);
  }
  if (!finalState.panel.includes("总进度 2/3")) {
    throw new Error(`final progress failed: ${JSON.stringify(finalState.panel)}`);
  }

  const timePage = await context.newPage();
  await timePage.goto("https://pc.kmelearning.com/jsncxyslhs/home/course/time-short");
  await timePage.addStyleTag({ path: path.join(sourceExtensionPath, "styles.css") });
  await timePage.addScriptTag({ path: path.join(sourceExtensionPath, "content.js") });
  await timePage.waitForSelector("#kme-learning-navigator", { timeout: 10000 });
  await timePage.locator(".kme-learning-navigator-primary").click();
  await timePage.waitForFunction(() => window.__mockReplayCount > 0, undefined, { timeout: 10000 });
  const timeState = await timePage.evaluate(() => ({
    replayCount: window.__mockReplayCount,
    backCount: window.__mockBackCount,
    currentTime: window.__mockCurrentTime,
    status: document.querySelector("#kme-learning-navigator-status")?.innerText || "",
    summary: document.querySelector("#kme-learning-navigator-summary")?.innerText || "",
    inspect: window.__kmeLearningNavigator?.inspect?.()
  }));
  if (timeState.backCount !== 0) {
    throw new Error(`time-short course returned too early: ${JSON.stringify(timeState)}`);
  }
  if (timeState.currentTime !== 0 || !timeState.status.includes("课程总时长不足")) {
    throw new Error(`time-short replay failed: ${JSON.stringify(timeState)}`);
  }
  if (timeState.inspect?.timeRequirement?.requiredSeconds !== 3600) {
    throw new Error(`time requirement parse failed: ${JSON.stringify(timeState)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    initialCatalogCount: initial.catalog.length,
    progress: {
      initial: "1/3",
      final: "2/3"
    },
    log: finalState.log,
    timeShort: {
      replayCount: timeState.replayCount,
      requiredSeconds: timeState.inspect.timeRequirement.requiredSeconds,
      learnedSeconds: timeState.inspect.timeRequirement.learnedSeconds
    },
    currentPage: "电子邮件安全"
  }, null, 2));
} finally {
  await browser.close();
}
