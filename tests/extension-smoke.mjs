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
const targetArgument = process.argv.find((argument) => argument.startsWith("--target="));
const target = targetArgument?.split("=")[1] || "extension";
if (!new Set(["extension", "userscript"]).has(target)) {
  throw new Error(`unknown smoke-test target: ${target}`);
}

async function injectHelper(page) {
  if (target === "userscript") {
    await page.addScriptTag({
      path: path.join(sourceExtensionPath, "userscript", "kme-learning-helper.user.js")
    });
    return;
  }
  await page.addStyleTag({ path: path.join(sourceExtensionPath, "styles.css") });
  await page.addScriptTag({ path: path.join(sourceExtensionPath, "content.js") });
}

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

const homeHtml = String.raw`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>江苏农商联合银行</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { min-height: 600px; padding: 24px; background: #f6f7f9; }
    .home-heading { margin: 24px 0 12px; }
    .home-heading-row { display: flex; align-items: center; justify-content: space-between; }
    .cursor-pointer { cursor: pointer; }
    .task-grid { display: grid; grid-template-columns: repeat(2, 320px); gap: 16px; }
    .task-card { display: flex; min-height: 64px; align-items: center; gap: 8px; padding: 16px; background: #fff; }
    .task-card img { width: 36px; height: 36px; }
    .panelContent__VcTCG { display: flex; width: 720px; min-height: 52px; align-items: center; justify-content: space-between; margin: 8px 0; padding: 0 16px; border: 1px solid #ddd; cursor: pointer; }
    .anticon5-check { color: #246bfe; }
    .lesson-item { width: 320px; min-height: 48px; padding: 12px; background: #eff5ff; }
  </style>
</head>
<body>
<main id="app"></main>
<script>
  const app = document.getElementById("app");
  window.__mockTaskLog = [];

  function check() {
    return '<span class="anticon5-check" data-icon="check">✓</span>';
  }

  function renderHome() {
    app.innerHTML =
      '<div class="home-heading"><div class="home-heading-row"><span>我的任务</span>' +
      '<div class="cursor-pointer"><span>更多</span></div></div></div>' +
      '<div class="task-section"><div class="task-grid">' +
      '<div class="task-card cursor-pointer" data-task="required">' +
      '<img src="/static/media/task_training.mock.svg" alt=""><div><p>2026年党员线上学习课程（必修）</p><span>项目</span></div></div>' +
      '<div class="task-card cursor-pointer" data-task="complete">' +
      '<img src="/static/media/task_training.mock.svg" alt=""><div><p>已完成的历史任务</p><span>项目</span>' + check() + '</div></div>' +
      '</div></div>';

    document.querySelector('[data-task="required"]').addEventListener("click", () => {
      window.__mockTaskLog.push("task:2026年党员线上学习课程（必修）");
      renderDetail();
    });
    document.querySelector('[data-task="complete"]').addEventListener("click", () => {
      window.__mockTaskLog.push("task:completed");
    });
  }

  function renderDetail() {
    history.pushState({}, "", "/jsncxyslhs/home/training/detail/task-required");
    app.innerHTML = '<h1>2026年党员线上学习课程（必修）</h1><p>2个活动</p><button id="enter-task">进入学习</button>';
    document.getElementById("enter-task").addEventListener("click", () => {
      window.__mockTaskLog.push("enter:task");
      renderTaskCatalog();
    });
  }

  function renderTaskCatalog() {
    history.pushState({}, "", "/jsncxyslhs/home/training/study/task-required");
    app.innerHTML = '<h1>2026年党员线上学习课程（必修）</h1><p>2个活动，1个活动未完成</p>' +
      '<div class="panelContent__VcTCG" data-course="first"><span>任务课程一 课程</span><span>未完成</span></div>' +
      '<div class="panelContent__VcTCG"><span>任务课程二 课程</span>' + check() + '</div>';
    document.querySelector('[data-course="first"]').addEventListener("click", () => {
      window.__mockTaskLog.push("course:任务课程一");
      history.pushState({}, "", "/jsncxyslhs/home/course/study/task-course-1");
      app.innerHTML = '<h1>课程内容：任务课程一</h1><aside class="scrollBody__Jdo84">' +
        '<div class="lesson-item active"><span>任务视频 课程</span><span>未完成</span></div></aside>';
    });
  }

  renderHome();
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
    <header><strong>补学课程</strong><span> 收藏 </span><span>1学时</span><span>已完成</span></header>
    <div class="course-main-wrap">
      <div class="course-main-area">
        <video id="mock-video"></video>
      </div>
      <aside class="root__mZMt4">
        <nav>
          <button id="directory-tab" class="ant5-tabs-tab-btn">目录</button>
          <button id="record-tab" class="ant5-tabs-tab-btn ant5-tabs-tab-active">记录</button>
          <button class="ant5-tabs-tab-btn">评论</button>
        </nav>
        <div id="course-tab-content" class="scrollBody__Jdo84">
          <div class="course-records-root__WU_lB">
            <div>学习次数 0</div>
            <div>学习总时长 00:00:00</div>
            <div>空空如也~</div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</main>
<script>
  window.__mockReplayCount = 0;
  window.__mockBackCount = 0;
  window.__mockRecordRefreshCount = 0;
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
  const directoryTab = document.getElementById("directory-tab");
  const recordTab = document.getElementById("record-tab");
  const tabContent = document.getElementById("course-tab-content");
  function activateTab(activeTab) {
    [directoryTab, recordTab].forEach((tab) => {
      tab.classList.toggle("ant5-tabs-tab-active", tab === activeTab);
    });
  }
  directoryTab.addEventListener("click", () => {
    activateTab(directoryTab);
    tabContent.innerHTML = '<div class="lesson-item active"><span>补学课程 00:32:16</span>' +
      '<span class="anticon5-check" data-icon="check">✓</span></div>';
  });
  recordTab.addEventListener("click", () => {
    window.__mockRecordRefreshCount += 1;
    activateTab(recordTab);
    tabContent.innerHTML = '<div class="course-records-root__WU_lB">' +
      '<div>学习次数 0</div><div>学习总时长 00:00:00</div>' +
      '<div class="ant5-spin-spinning" aria-busy="true">加载中</div></div>';
    window.setTimeout(() => {
      if (!recordTab.classList.contains("ant5-tabs-tab-active")) return;
      tabContent.innerHTML = '<div class="course-records-root__WU_lB">' +
        '<div>学习次数 6</div><div>学习总时长 00:32:23</div>' +
        '<div>开始时间 持续时间</div></div>';
    }, 650);
  });
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
    window.__mockUserscriptStorage = {};
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
    window.GM_getValue = (key, fallback) => (
      Object.hasOwn(window.__mockUserscriptStorage, key)
        ? window.__mockUserscriptStorage[key]
        : fallback
    );
    window.GM_setValue = (key, value) => {
      window.__mockUserscriptStorage[key] = value;
    };
    window.GM_addStyle = (css) => {
      const style = document.createElement("style");
      style.dataset.kmeUserscript = "";
      style.textContent = css;
      document.documentElement.appendChild(style);
      return style;
    };
  });

  await context.route("https://pc.kmelearning.com/**", (route) => {
    const requestUrl = route.request().url();
    const body = requestUrl.includes("/time-short")
      ? timeShortHtml
      : (requestUrl.includes("/home/index") ? homeHtml : html);
    route.fulfill({ status: 200, contentType: "text/html", body });
  });

  const homePage = context.pages()[0] || await context.newPage();
  await homePage.goto("https://pc.kmelearning.com/jsncxyslhs/home/index");
  await injectHelper(homePage);
  await homePage.waitForSelector("#kme-learning-navigator", { timeout: 10000 });
  await homePage.waitForSelector(".kme-learning-navigator-panel", { state: "visible", timeout: 5000 });

  const homeInitial = await homePage.evaluate(() => ({
    panel: document.querySelector("#kme-learning-navigator")?.innerText || "",
    taskButtons: document.querySelectorAll(".kme-learning-navigator-task-item").length,
    inspect: window.__kmeLearningNavigator?.inspect?.()
  }));
  if (!homeInitial.panel.includes("未完成任务 1") || homeInitial.taskButtons !== 1) {
    throw new Error(`home task detection failed: ${JSON.stringify(homeInitial)}`);
  }
  if (homeInitial.inspect?.homeTasks?.length !== 2 || homeInitial.inspect.homeTasks.filter((task) => task.complete).length !== 1) {
    throw new Error(`home task completion filter failed: ${JSON.stringify(homeInitial.inspect?.homeTasks)}`);
  }

  await homePage.locator(".kme-learning-navigator-task-item").click();
  await homePage.waitForSelector(".kme-learning-navigator-task-confirmation", { state: "visible", timeout: 5000 });
  const beforeConfirmation = await homePage.evaluate(() => ({
    log: window.__mockTaskLog,
    running: window.__kmeLearningNavigator?.inspect?.()?.running,
    confirmation: document.querySelector(".kme-learning-navigator-task-confirmation")?.innerText || ""
  }));
  if (beforeConfirmation.log.length || beforeConfirmation.running || !beforeConfirmation.confirmation.includes("确认开始")) {
    throw new Error(`task confirmation guard failed: ${JSON.stringify(beforeConfirmation)}`);
  }

  await homePage.locator(".kme-learning-navigator-task-cancel").click();
  await homePage.waitForSelector(".kme-learning-navigator-task-confirmation", { state: "hidden", timeout: 5000 });
  await homePage.locator(".kme-learning-navigator-task-item").click();
  await homePage.locator(".kme-learning-navigator-task-confirm").click();
  await homePage.waitForFunction(() => window.__mockTaskLog.includes("task:2026年党员线上学习课程（必修）"), undefined, { timeout: 5000 });
  await homePage.waitForFunction(() => window.__mockTaskLog.includes("enter:task"), undefined, { timeout: 12000 });
  await homePage.waitForFunction(() => window.__mockTaskLog.includes("course:任务课程一"), undefined, { timeout: 12000 });
  const homeFinal = await homePage.evaluate(() => ({
    log: window.__mockTaskLog,
    url: location.href,
    text: document.body.innerText
  }));
  if (!homeFinal.text.includes("课程内容：任务课程一")) {
    throw new Error(`task auto navigation failed: ${JSON.stringify(homeFinal)}`);
  }

  const page = await context.newPage();
  await page.goto("https://pc.kmelearning.com/jsncxyslhs/home/training/study/mock");
  await injectHelper(page);
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
  if (target === "userscript") {
    const assets = await page.evaluate(() => {
      const icon = document.querySelector(".kme-learning-navigator-logo-toggle img");
      return {
        styleInjected: Boolean(document.querySelector("style[data-kme-userscript]")),
        iconUrl: icon?.src || "",
        iconLoaded: Boolean(icon?.complete && icon.naturalWidth > 0)
      };
    });
    if (!assets.styleInjected || !assets.iconUrl.startsWith("data:image/svg+xml") || !assets.iconLoaded) {
      throw new Error(`userscript assets failed: ${JSON.stringify(assets)}`);
    }
  }
  await page.evaluate(() => {
    document.querySelector(".kme-learning-navigator-logo-toggle")
      ?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  });
  await page.waitForSelector(".kme-learning-navigator-panel", { state: "visible", timeout: 5000 });

  await page.locator(".kme-learning-navigator-primary").click();
  await page.waitForFunction((currentTarget) => (
    currentTarget === "userscript"
      ? window.__mockUserscriptStorage.running === true
      : window.__mockChromeStorage.running === true
  ), target, { timeout: 5000 });
  await page.waitForFunction(() => document.body.innerText.includes("课程内容：网络安全意识专题培训"), undefined, { timeout: 10000 });
  await page.waitForFunction(() => document.body.innerText.includes("课程内容：电子邮件安全"), undefined, { timeout: 20000 });

  // Auto-learning is now on a course player page (/home/course/...), which is not the
  // directory, so the panel must have auto-minimized. Read progress from the debug API,
  // which does not depend on the panel being visible.
  await page.waitForSelector(".kme-learning-navigator-panel", { state: "hidden", timeout: 5000 });
  const finalState = await page.evaluate(() => ({
    log: window.__mockLog,
    text: document.body.innerText,
    progress: window.__kmeLearningNavigator?.inspect?.()?.progress || null
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
  if (!finalState.progress || finalState.progress.completed !== 2 || finalState.progress.total !== 3) {
    throw new Error(`final progress failed: ${JSON.stringify(finalState.progress)}`);
  }

  const timePage = await context.newPage();
  await timePage.goto("https://pc.kmelearning.com/jsncxyslhs/home/course/time-short");
  await injectHelper(timePage);
  await timePage.waitForSelector("#kme-learning-navigator", { timeout: 10000 });
  // A course player page is not the directory, so the panel starts minimized; restore it
  // before driving the controls.
  await timePage.waitForSelector(".kme-learning-navigator-panel", { state: "hidden", timeout: 5000 });
  await timePage.evaluate(() => {
    document.querySelector(".kme-learning-navigator-logo-toggle")
      ?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  });
  await timePage.waitForSelector(".kme-learning-navigator-panel", { state: "visible", timeout: 5000 });
  await timePage.locator(".kme-learning-navigator-primary").click();
  await timePage.waitForFunction(() => window.__mockReplayCount > 0, undefined, { timeout: 10000 });
  const timeState = await timePage.evaluate(() => ({
    replayCount: window.__mockReplayCount,
    backCount: window.__mockBackCount,
    recordRefreshCount: window.__mockRecordRefreshCount,
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
  if (timeState.recordRefreshCount < 1 || timeState.inspect?.timeRequirement?.learnedSeconds !== 1943) {
    throw new Error(`stale course record refresh failed: ${JSON.stringify(timeState)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    target,
    homeTaskNavigation: {
      unfinished: homeInitial.taskButtons,
      log: homeFinal.log
    },
    initialCatalogCount: initial.catalog.length,
    progress: {
      initial: "1/3",
      final: "2/3"
    },
    log: finalState.log,
    timeShort: {
      replayCount: timeState.replayCount,
      recordRefreshCount: timeState.recordRefreshCount,
      requiredSeconds: timeState.inspect.timeRequirement.requiredSeconds,
      learnedSeconds: timeState.inspect.timeRequirement.learnedSeconds
    },
    currentPage: "电子邮件安全"
  }, null, 2));
} finally {
  await browser.close();
}
