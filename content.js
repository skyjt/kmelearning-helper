(() => {
  const EXT_ID = "kme-learning-navigator";
  const HOST_PATTERN = /pc\.kmelearning\.com$/;
  const DEFAULT_RUNTIME = {
    catalogUrl: "",
    currentCourseTitle: "",
    completedCourseTitles: [],
    skippedTitles: [],
    lastTargetKey: "",
    lastTargetAt: 0,
    recoveryKey: "",
    recoveryCount: 0,
    catalogTotal: 0,
    catalogCompleted: 0,
    catalogProgressAt: 0,
    lastCourseRequiredSeconds: 0,
    lastCourseLearnedSeconds: 0,
    lastCourseTimeCheckedAt: 0,
    docScrollDirection: 1,
    docScrollAt: 0
  };
  const TIME_REQUIREMENT_TOLERANCE_SECONDS = 20;
  const DEFAULTS = {
    running: false,
    autoPlay: true,
    recoverOnUnconfirmedEnd: true,
    enforceCourseTotalTime: true,
    skipQuestions: true,
    panelOpen: true,
    nextDelayMs: 3500,
    runtime: DEFAULT_RUNTIME
  };

  if (!HOST_PATTERN.test(location.hostname)) return;
  if (window.__kmeLearningNavigatorLoaded) return;
  window.__kmeLearningNavigatorLoaded = true;

  const state = {
    settings: { ...DEFAULTS },
    runtime: { ...DEFAULT_RUNTIME },
    videos: new WeakSet(),
    status: "未启动",
    panelOpen: true,
    busy: false,
    actionLockUntil: 0,
    lastUrl: location.href,
    panelUrl: location.href,
    lastVideoState: "",
    scanTimer: 0,
    speedTimer: 0,
    mutationTimer: 0,
    panelTimer: 0,
    flipped: false,
    flipTimer: 0,
    rootEl: null
  };

  // DOM scans (querySelectorAll + getComputedStyle/getBoundingClientRect/innerText) are
  // expensive and get called many times per tick and per panel refresh. The DOM cannot
  // change in the middle of one of our synchronous passes (our own clicks are deferred via
  // setTimeout), so we memoize each scan and only recompute when the page actually mutates
  // (epoch bump) or after a short TTL guard. This removes the repeated full-document work
  // without changing behavior, since the baseline already tolerates ~2s scan latency.
  let domEpoch = 0;
  const invalidateScans = () => { domEpoch += 1; };
  function memoScan(compute, ttl = 200) {
    let epoch = -1;
    let at = 0;
    let value;
    return () => {
      const t = Date.now();
      if (epoch !== domEpoch || t - at > ttl) {
        value = compute();
        epoch = domEpoch;
        at = t;
      }
      return value;
    };
  }

  const storageArea = () => {
    try {
      return chrome.storage.local || chrome.storage.sync;
    } catch {
      return null;
    }
  };

  const storage = {
    async get() {
      const area = storageArea();
      if (!area) return { ...DEFAULTS };
      return new Promise((resolve) => {
        try {
          area.get(DEFAULTS, (value) => resolve(value || { ...DEFAULTS }));
        } catch {
          resolve({ ...DEFAULTS });
        }
      });
    },
    async set(patch) {
      const area = storageArea();
      if (!area) return;
      return new Promise((resolve) => {
        try {
          area.set(patch, resolve);
        } catch {
          resolve();
        }
      });
    }
  };

  const now = () => Date.now();
  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const normalize = (text) => (text || "").replace(/\s+/g, " ").trim();
  const compact = (text) => normalize(text).replace(/\s+/g, "");
  // innerText forces a reflow and is one of the hottest calls in the script (every row,
  // every dedupe pass). Cache per-element text for the current epoch / TTL window so the
  // same elements scanned by several helpers in one pass only pay the cost once.
  let textCache = new WeakMap();
  let textCacheEpoch = -1;
  let textCacheAt = 0;
  function textOf(el) {
    if (!el) return "";
    const t = Date.now();
    if (textCacheEpoch !== domEpoch || t - textCacheAt > 200) {
      textCache = new WeakMap();
      textCacheEpoch = domEpoch;
      textCacheAt = t;
    }
    let value = textCache.get(el);
    if (value === undefined) {
      value = normalize(el.innerText || el.textContent || "");
      textCache.set(el, value);
    }
    return value;
  }
  const bodyText = memoScan(() => textOf(document.body));
  const formatSeconds = (seconds) => {
    const value = Math.max(0, Math.round(Number(seconds) || 0));
    const h = Math.floor(value / 3600);
    const m = Math.floor((value % 3600) / 60);
    const s = value % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  function parseClockToSeconds(value) {
    const text = normalize(value).replace(/：/g, ":");
    const match = text.match(/\b(\d{1,3}):(\d{2})(?::(\d{2}))?\b/);
    if (!match) return 0;
    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = match[3] === undefined ? null : Number(match[3]);
    if (![first, second, third ?? 0].every(Number.isFinite)) return 0;
    if (third === null) return first * 60 + second;
    return first * 3600 + second * 60 + third;
  }

  function parseLearningHourSeconds(text) {
    let maxSeconds = 0;
    for (const match of normalize(text).matchAll(/(\d+(?:\.\d+)?)\s*学时/g)) {
      const hours = Number(match[1]);
      if (Number.isFinite(hours) && hours > 0) {
        maxSeconds = Math.max(maxSeconds, Math.round(hours * 3600));
      }
    }
    return maxSeconds;
  }

  function visible(el) {
    if (!el || !(el instanceof Element)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0;
  }

  function runtimePatch(patch) {
    state.runtime = {
      ...DEFAULT_RUNTIME,
      ...state.runtime,
      ...patch
    };
    return storage.set({ runtime: state.runtime });
  }

  function uniqueStrings(values) {
    return [...new Set(values.map(compact).filter(Boolean))].slice(-60);
  }

  function titleFromText(text) {
    return normalize(text)
      .replace(/^(已完成|未完成|进行中|课程|视频|文档)\s*/g, "")
      .replace(/\s*(课程|视频|文档|材料|未完成|已完成|开始学习|继续学习)$/g, "")
      .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, "")
      .trim();
  }

  function targetKey(el) {
    const rect = el.getBoundingClientRect();
    return `${compact(titleFromText(textOf(el))).slice(0, 80)}@${Math.round(rect.top)}:${Math.round(rect.left)}`;
  }

  function setStatus(message) {
    state.status = message;
    const status = document.querySelector(`#${EXT_ID}-status`);
    if (status) status.textContent = message;
    updatePanelSummary();
  }

  function setActionLock(ms = 2500) {
    state.actionLockUntil = now() + ms;
  }

  function isLocked() {
    return state.busy || now() < state.actionLockUntil;
  }

  function clickElement(el, message) {
    if (!el || !visible(el)) return false;
    const key = targetKey(el);
    if (state.runtime.lastTargetKey === key && now() - Number(state.runtime.lastTargetAt || 0) < 3500) {
      return false;
    }

    el.scrollIntoView({ block: "center", inline: "nearest" });
    setActionLock(4500);
    runtimePatch({ lastTargetKey: key, lastTargetAt: now() });
    if (message) setStatus(message);

    window.setTimeout(() => {
      try {
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
        el.click();
      } catch {
        el.click();
      }
    }, 120);
    return true;
  }

  function hasCompleteIcon(el) {
    if (!el) return false;
    return [...el.querySelectorAll("[data-icon='check'], svg[data-icon='check'], .anticon5-check, .anticon-check, [class*='finish'], [class*='Finish'], [class*='overed'], [class*='Overed'], [class*='done'], [class*='Done']")]
      .some((icon) => {
        const className = String(icon.className?.baseVal || icon.className || "");
        if (/close|times|delete|remove/i.test(className)) return false;
        return visible(icon) || icon.getAttribute("data-icon") === "check";
      });
  }

  function textLooksComplete(text) {
    const value = normalize(text);
    if (/未完成|未学习|未开始|待完成/.test(value)) return false;
    return /已完成|学习完成|完成学习|已学完|已结束|COMPLETED/i.test(value);
  }

  function itemComplete(el) {
    if (!el) return false;
    return hasCompleteIcon(el) || textLooksComplete(textOf(el));
  }

  function questionLikeText(text) {
    return /考试|测验|测试|练习|答题|题目|选择题|判断题|问卷|调研|作业|exam|quiz|question|survey|homework|test/i.test(text);
  }

  function questionLikeItem(el) {
    const text = textOf(el);
    if (!questionLikeText(text)) return false;
    return !/课程|视频课程|培训课程/.test(text) || /考试|测验|答题|问卷|作业/.test(text);
  }

  function pageLooksQuestion() {
    const url = location.href;
    if (/exam|quiz|question|survey|homework|paper|test/i.test(url)) return true;
    const body = bodyText();
    return /开始答题|提交答案|重新答题|试卷|单选题|多选题|判断题|问卷调查|考试倒计时/.test(body);
  }

  function injectStyleFix() {
    if (document.getElementById(`${EXT_ID}-style`)) return;
    const style = document.createElement("style");
    style.id = `${EXT_ID}-style`;
    style.textContent = `
      .wmy-video.wmy-video-speed-hidden .prism-setting-speed,
      .${EXT_ID}-speed-visible .prism-setting-speed {
        display: block !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function restoreSpeedMenu() {
    injectStyleFix();
    document.querySelectorAll(".wmy-video-speed-hidden").forEach((el) => {
      el.classList.remove("wmy-video-speed-hidden");
      el.classList.add(`${EXT_ID}-speed-visible`);
    });
  }

  const videos = memoScan(() => [...document.querySelectorAll("video")].filter(visible));

  const primaryVideo = memoScan(() => [...videos()].sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    return br.width * br.height - ar.width * ar.height;
  })[0] || null);

  // Auto-learning always plays at 1x so the platform accrues real watch time; the speed menu
  // restored by restoreSpeedMenu() stays available for manual viewing while auto-learning is off.
  function applySpeed(video) {
    if (!video || !state.settings.running) return;
    try {
      if (Math.abs(video.playbackRate - 1) > 0.01) video.playbackRate = 1;
      if (Math.abs(video.defaultPlaybackRate - 1) > 0.01) video.defaultPlaybackRate = 1;
    } catch {
      // Some player wrappers briefly reject direct rate writes while initializing.
    }
  }

  function bindVideo(video) {
    if (!video || state.videos.has(video)) return;
    state.videos.add(video);
    applySpeed(video);

    video.addEventListener("ratechange", () => {
      if (!state.settings.running) return;
      window.setTimeout(() => applySpeed(video), 80);
    });

    video.addEventListener("play", () => {
      applySpeed(video);
      const duration = Number.isFinite(video.duration) ? Math.round(video.duration) : 0;
      state.lastVideoState = duration ? `视频播放中，1x，约 ${duration} 秒` : "视频播放中，1x";
      setStatus(state.lastVideoState);
    });

    video.addEventListener("ended", () => {
      setStatus("视频已播放到结尾，等待平台完成标记");
      window.setTimeout(() => tick("video-ended"), state.settings.nextDelayMs);
    });
  }

  async function tryAutoPlay() {
    if (!state.settings.running || !state.settings.autoPlay) return false;
    const video = primaryVideo();
    if (!video || video.ended) return false;
    applySpeed(video);
    if (!video.paused) return true;

    try {
      await video.play();
      setStatus("已自动播放，保持 1x 等平台心跳确认");
      return true;
    } catch {
      try {
        video.muted = true;
        await video.play();
        setStatus("已静音自动播放，保持 1x 等平台心跳确认");
        return true;
      } catch {
        // Fall through to the player's own controls.
      }
      const play = [...document.querySelectorAll(".prism-big-play-btn, .prism-play-btn, button, [role='button']")]
        .find((el) => visible(el) && (/播放|开始|play/i.test(textOf(el)) || /play/i.test(String(el.className || ""))));
      if (play) return clickElement(play, "已点击播放按钮");
      return clickElement(video, "已点击播放器区域开始播放");
    }
  }

  function meaningfulRowText(text) {
    if (text.length < 2 || text.length > 220) return false;
    if (/首页|搜索|消息|设置|评论|收藏|分享|返回|清晰度|音轨|倍速/.test(text)) return false;
    return true;
  }

  function dedupeElements(elements) {
    // Key on text *and* on-screen position. Two distinct sibling rows can legitimately share
    // the same title — e.g. a catalog with two different "征信合规管理" courses — and keying on
    // text alone collapsed them into one, undercounting the list (5 shown for 6 courses). The
    // containment pass below still removes nested/overlapping matches of the *same* row, which
    // is the duplication text-only dedup was actually meant to handle.
    const keyOf = (el) => {
      const rect = el.getBoundingClientRect();
      return `${compact(textOf(el))}@${Math.round(rect.top)}:${Math.round(rect.left)}`;
    };
    const seen = new Set();
    const result = [];
    for (const el of elements) {
      if (result.some((item) => item === el || item.contains(el))) continue;
      for (let index = result.length - 1; index >= 0; index -= 1) {
        if (el.contains(result[index])) {
          seen.delete(keyOf(result[index]));
          result.splice(index, 1);
        }
      }
      if (!compact(textOf(el)) || seen.has(keyOf(el))) continue;
      seen.add(keyOf(el));
      result.push(el);
    }
    return result;
  }

  const catalogRows = memoScan(() => {
    const panelRows = [...document.querySelectorAll("[class*='panelContent']")]
      .filter(visible)
      .filter((el) => meaningfulRowText(textOf(el)) && /课程|视频|培训|安全|邮件|软件|信息|口令/.test(textOf(el)));

    if (panelRows.length) return dedupeElements(panelRows);

    const candidates = [...document.querySelectorAll("button, a, [role='button'], [class*='cursor-pointer']")]
      .filter(visible)
      .filter((el) => {
        const text = textOf(el);
        if (!meaningfulRowText(text)) return false;
        return /课程|视频|培训|未完成|开始学习|继续学习/.test(text);
      });
    return dedupeElements(candidates);
  });

  function pageLooksCatalog() {
    const rows = catalogRows();
    if (rows.length >= 2 && bodyText().includes("活动")) return true;
    if (rows.length >= 2 && /\/home\/training\/study\//.test(location.pathname) && !primaryVideo()) return true;
    return false;
  }

  const activeContentItem = memoScan(() => {
    const selectors = [
      ".scrollBody__Jdo84 [class*='active']",
      ".scrollBody__Jdo84 [class*='selected']",
      ".scrollBody__Jdo84 [class*='bg6']",
      ".course-main-sidebar [class*='active']",
      ".course-main-sidebar [class*='selected']",
      ".course-main-sidebar [class*='bg6']",
      "[aria-current='page']"
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (visible(el) && meaningfulRowText(textOf(el))) return el;
    }
    return null;
  });

  function contentRoots() {
    const roots = [
      ...document.querySelectorAll(".scrollBody__Jdo84, .course-main-sidebar, [class*='course-main-sidebar'], [class*='chapter'], [class*='catalog'], [class*='directory'], aside")
    ].filter(visible);
    return roots.length ? roots : [];
  }

  const contentItems = memoScan(() => {
    const roots = contentRoots();
    const items = [];
    for (const root of roots) {
      const candidates = [...root.querySelectorAll("button, a, [role='button'], [class*='cursor-pointer'], [class*='item'], [class*='chapter'], [class*='lesson']")]
        .filter(visible)
        .filter((el) => {
          const text = textOf(el);
          if (!meaningfulRowText(text)) return false;
          if (/目录|记录|评论|收藏|返回|首页|搜索|设置/.test(text)) return false;
          return /课程|视频|文档|材料|学习|考试|测验|作业|问卷|未完成|已完成|\d{1,2}:\d{2}/.test(text);
        });
      items.push(...candidates);
    }
    return dedupeElements(items);
  });

  function pageLooksContent() {
    return Boolean(primaryVideo() || activeContentItem() || contentItems().length);
  }

  function currentTitle() {
    const active = activeContentItem();
    const activeTitle = titleFromText(textOf(active));
    if (activeTitle) return activeTitle;

    const heading = [...document.querySelectorAll("h1, h2, h3, header, [class*='title'], [class*='Title']")]
      .filter(visible)
      .map((el) => titleFromText(textOf(el)))
      .find((text) => text && meaningfulRowText(text));
    return heading || state.runtime.currentCourseTitle || document.title;
  }

  function currentContentComplete() {
    const active = activeContentItem();
    if (active && itemComplete(active)) return true;
    const title = compact(currentTitle());
    if (title) {
      const matchingItem = contentItems().find((item) => compact(textOf(item)).includes(title));
      if (matchingItem && itemComplete(matchingItem)) return true;
    }
    return textLooksComplete(bodyText());
  }

  function courseRoot() {
    return [...document.querySelectorAll(".course-wrap, [class*='course-wrap'], [class*='courseWrap']")]
      .find(visible) || null;
  }

  function courseRequiredSeconds() {
    const root = courseRoot();
    const scoped = root ? textOf(root) : "";
    const scopedHours = parseLearningHourSeconds(scoped);
    if (scopedHours) return { seconds: scopedHours, source: "课程学时" };

    const itemSeconds = contentItems()
      .map((item) => parseClockToSeconds(textOf(item)))
      .filter((seconds) => seconds > 0);
    const summed = itemSeconds.reduce((total, seconds) => total + seconds, 0);
    if (summed) return { seconds: summed, source: "目录视频时长" };

    return { seconds: 0, source: "" };
  }

  function learnedTotalSeconds() {
    const body = bodyText();
    const direct = body.match(/学习总时长\s*([0-9:：]{4,})/);
    if (direct) return parseClockToSeconds(direct[1]);

    const recordRoot = [...document.querySelectorAll("[class*='course-records'], [class*='record'], [class*='Record'], .scrollBody__Jdo84")]
      .find((el) => visible(el) && /学习总时长/.test(textOf(el)));
    if (!recordRoot) return 0;
    const recordMatch = textOf(recordRoot).match(/学习总时长\s*([0-9:：]{4,})/);
    return recordMatch ? parseClockToSeconds(recordMatch[1]) : 0;
  }

  function exactTab(label) {
    return [...document.querySelectorAll("button, a, [role='button'], .ant5-tabs-tab, .ant5-tabs-tab-btn, [class*='tabs-tab'], [class*='Tabs-tab']")]
      .find((el) => visible(el) && textOf(el) === label);
  }

  async function switchCourseTab(label) {
    const tab = exactTab(label);
    if (!tab) return false;
    const active = /active|selected/i.test(String(tab.className || "")) ||
      /active|selected/i.test(String(tab.parentElement?.className || ""));
    if (active) return true;
    if (!clickElement(tab, `切换到${label}，检查学习时长`)) return false;
    await sleep(1500);
    return true;
  }

  async function courseTimeRequirement() {
    const required = courseRequiredSeconds();
    if (!state.settings.enforceCourseTotalTime || !required.seconds) {
      return {
        requiredSeconds: required.seconds,
        learnedSeconds: learnedTotalSeconds(),
        deficitSeconds: 0,
        satisfied: true,
        source: required.source
      };
    }

    let learned = learnedTotalSeconds();
    if (!learned && exactTab("记录")) {
      await switchCourseTab("记录");
      learned = learnedTotalSeconds();
    }

    const deficit = Math.max(0, required.seconds - learned);
    const satisfied = deficit <= TIME_REQUIREMENT_TOLERANCE_SECONDS;
    await runtimePatch({
      lastCourseRequiredSeconds: required.seconds,
      lastCourseLearnedSeconds: learned,
      lastCourseTimeCheckedAt: now()
    });
    return {
      requiredSeconds: required.seconds,
      learnedSeconds: learned,
      deficitSeconds: deficit,
      satisfied,
      source: required.source
    };
  }

  function nextContentItem() {
    const items = contentItems();
    if (!items.length) return null;
    const active = activeContentItem();
    const activeIndex = active
      ? items.findIndex((item) => item === active || item.contains(active) || active.contains(item) || compact(textOf(item)).includes(compact(textOf(active))))
      : -1;
    const ordered = activeIndex >= 0 ? [...items.slice(activeIndex + 1), ...items.slice(0, activeIndex)] : items;
    return ordered.find((item) => !itemComplete(item) && !questionLikeItem(item)) || null;
  }

  function nextCatalogCourse() {
    const completedTitles = uniqueStrings(state.runtime.completedCourseTitles || []);
    const skippedTitles = uniqueStrings(state.runtime.skippedTitles || []);
    return catalogRows().find((row) => {
      const text = textOf(row);
      const key = compact(titleFromText(text));
      if (!key) return false;
      if (completedTitles.includes(key) || skippedTitles.includes(key)) return false;
      if (itemComplete(row)) return false;
      if (state.settings.skipQuestions && questionLikeItem(row)) return false;
      return true;
    }) || null;
  }

  function catalogProgressFromRows(rows = catalogRows()) {
    const completedTitles = uniqueStrings(state.runtime.completedCourseTitles || []);
    const tasks = rows
      .map((row) => {
        const key = compact(titleFromText(textOf(row)));
        if (!key) return null;
        return {
          key,
          complete: itemComplete(row) || completedTitles.includes(key)
        };
      })
      .filter(Boolean);
    const total = tasks.length;
    const completed = tasks.filter((task) => task.complete).length;
    return {
      total,
      completed,
      percent: total ? Math.round((completed / total) * 100) : 0
    };
  }

  async function syncCatalogProgress(rows = catalogRows()) {
    const progress = catalogProgressFromRows(rows);
    if (!progress.total) return progress;
    if (
      Number(state.runtime.catalogTotal || 0) !== progress.total ||
      Number(state.runtime.catalogCompleted || 0) !== progress.completed
    ) {
      await runtimePatch({
        catalogTotal: progress.total,
        catalogCompleted: progress.completed,
        catalogProgressAt: now()
      });
    }
    return progress;
  }

  function currentLearningProgress() {
    const liveRows = catalogRows();
    if (pageLooksCatalog() && liveRows.length) return catalogProgressFromRows(liveRows);

    // Off the catalog, only an active auto-learning session has a meaningful running total.
    // When stopped, don't resurrect a stale total stored from a previous session.
    if (!state.settings.running) return { total: 0, completed: 0, percent: 0 };

    const total = Number(state.runtime.catalogTotal || 0);
    if (!total) return { total: 0, completed: 0, percent: 0 };

    const completed = Math.min(total, Number(state.runtime.catalogCompleted || 0));
    return {
      total,
      completed,
      percent: Math.round((completed / total) * 100)
    };
  }

  async function clickStartControl() {
    const button = [...document.querySelectorAll("button, a, [role='button']")]
      .find((el) => {
        if (!visible(el)) return false;
        const text = textOf(el);
        return /开始学习|继续学习|开始播放|进入学习|开始/.test(text) && !/返回|首页|目录/.test(text);
      });
    if (!button) return false;
    return clickElement(button, "已点击开始/继续学习");
  }

  async function markCurrentCourseComplete() {
    const title = compact(state.runtime.currentCourseTitle || currentTitle());
    if (!title) return;
    const completedTitles = uniqueStrings(state.runtime.completedCourseTitles || []);
    const isNewComplete = !completedTitles.includes(title);
    const total = Number(state.runtime.catalogTotal || 0);
    const completed = Number(state.runtime.catalogCompleted || 0);
    await runtimePatch({
      completedCourseTitles: uniqueStrings([...completedTitles, title]),
      catalogCompleted: isNewComplete && total ? Math.min(total, completed + 1) : completed,
      catalogProgressAt: isNewComplete && total ? now() : Number(state.runtime.catalogProgressAt || 0),
      currentCourseTitle: ""
    });
  }

  async function returnToCatalog(message = "当前目录项已完成，返回课程列表") {
    await markCurrentCourseComplete();
    const back = [...document.querySelectorAll("button, a, [role='button']")]
      .find((el) => visible(el) && /^返回$|返回/.test(textOf(el)));
    if (back && clickElement(back, message)) return true;

    if (state.runtime.catalogUrl && location.href !== state.runtime.catalogUrl) {
      setStatus(message);
      setActionLock(4500);
      location.assign(state.runtime.catalogUrl);
      return true;
    }

    setStatus(message);
    setActionLock(3500);
    history.back();
    return true;
  }

  async function skipQuestionPage() {
    const title = compact(currentTitle());
    await runtimePatch({
      skippedTitles: uniqueStrings([...(state.runtime.skippedTitles || []), title])
    });
    const next = nextContentItem();
    if (next) return clickElement(next, `检测到做题页，跳过并进入：${titleFromText(textOf(next))}`);
    return returnToCatalog("检测到做题页，跳过并返回课程列表");
  }

  async function supplementCourseTime(requirement) {
    const message = `课程总时长不足：已学 ${formatSeconds(requirement.learnedSeconds)} / 要求 ${formatSeconds(requirement.requiredSeconds)}，继续 1x 补学`;
    setStatus(message);

    if (exactTab("目录")) {
      await switchCourseTab("目录");
    }

    const liveVideos = videos();
    liveVideos.forEach(bindVideo);
    liveVideos.forEach(applySpeed);
    const video = primaryVideo();
    if (video) {
      applySpeed(video);
      const duration = Number.isFinite(video.duration) ? Number(video.duration) : 0;
      if (!video.paused && !video.ended) {
        setStatus(`${message}，当前视频 ${Math.floor(video.currentTime)} / ${Math.floor(duration || 0)} 秒`);
        return true;
      }

      try {
        if (video.ended || (duration > 0 && video.currentTime >= duration - 1) || video.currentTime > 3) {
          video.currentTime = 0;
        }
        video.playbackRate = 1;
        video.defaultPlaybackRate = 1;
        await video.play();
        setStatus(`${message}，已重播当前视频`);
        return true;
      } catch {
        const play = [...document.querySelectorAll(".prism-big-play-btn, .prism-play-btn, button, [role='button']")]
          .find((el) => visible(el) && (/播放|重播|play/i.test(textOf(el)) || /play/i.test(String(el.className || ""))));
        if (play) return clickElement(play, `${message}，已点击播放按钮`);
      }
    }

    const playable = contentItems().find((item) => {
      const text = textOf(item);
      return !questionLikeItem(item) && (/视频|课程|\d{1,2}:\d{2}/.test(text));
    });
    if (playable) {
      await runtimePatch({ recoveryKey: "", recoveryCount: 0 });
      return clickElement(playable, `${message}，进入可补学内容：${titleFromText(textOf(playable))}`);
    }

    setStatus(`${message}，但没有找到可重播的视频，请人工确认`);
    return false;
  }

  async function recoverUnconfirmedEnd(video) {
    if (!state.settings.recoverOnUnconfirmedEnd || !video) return false;
    const key = `${location.href}::${Math.round(video.duration || 0)}`;
    if (state.runtime.recoveryKey !== key) {
      await runtimePatch({ recoveryKey: key, recoveryCount: 0 });
    }
    if (Number(state.runtime.recoveryCount || 0) >= 2) {
      setStatus("视频已结束但仍未显示完成，请人工确认页面提示");
      return false;
    }

    await runtimePatch({ recoveryCount: Number(state.runtime.recoveryCount || 0) + 1 });
    try {
      video.pause();
      video.currentTime = 0;
      video.playbackRate = 1;
      video.defaultPlaybackRate = 1;
      await video.play();
      setStatus("视频结束但未完成，已按 1x 重播补足平台学习时长");
      return true;
    } catch {
      const play = [...document.querySelectorAll(".prism-big-play-btn, .prism-play-btn, button, [role='button']")]
        .find((el) => visible(el) && (/播放|重播|play/i.test(textOf(el)) || /play/i.test(String(el.className || ""))));
      if (play) return clickElement(play, "视频结束但未完成，已点击重播补学");
    }
    return false;
  }

  function keepDocumentActive() {
    if (primaryVideo()) return;
    if (now() - Number(state.runtime.docScrollAt || 0) < 5500) return;
    const direction = Number(state.runtime.docScrollDirection || 1);
    const scrollRoot = document.scrollingElement || document.documentElement;
    const maxTop = Math.max(0, scrollRoot.scrollHeight - window.innerHeight);
    if (maxTop > 40) {
      const nextTop = Math.min(maxTop, Math.max(0, scrollRoot.scrollTop + direction * 220));
      scrollRoot.scrollTo({ top: nextTop, behavior: "smooth" });
      runtimePatch({
        docScrollAt: now(),
        docScrollDirection: nextTop >= maxTop || nextTop <= 0 ? -direction : direction
      });
    } else {
      runtimePatch({ docScrollAt: now() });
    }
  }

  async function handleCatalog() {
    if (state.runtime.catalogUrl !== location.href) {
      await runtimePatch({ catalogUrl: location.href, currentCourseTitle: "" });
    }

    await syncCatalogProgress();

    const row = nextCatalogCourse();
    if (!row) {
      await storage.set({ running: false });
      state.settings.running = false;
      setStatus("课程列表里没有未完成课程，自动学习已停止");
      syncRunningUI();
      return;
    }

    const title = titleFromText(textOf(row));
    await runtimePatch({ currentCourseTitle: title, recoveryKey: "", recoveryCount: 0 });
    clickElement(row, `进入未完成课程：${title}`);
  }

  async function handleContent() {
    restoreSpeedMenu();
    const liveVideos = videos();
    liveVideos.forEach(bindVideo);
    liveVideos.forEach(applySpeed);

    if (state.settings.skipQuestions && pageLooksQuestion()) {
      await skipQuestionPage();
      return;
    }

    if (currentContentComplete()) {
      const next = nextContentItem();
      if (next) {
        await runtimePatch({ recoveryKey: "", recoveryCount: 0 });
        clickElement(next, `当前内容已完成，进入下一项：${titleFromText(textOf(next))}`);
        return;
      }

      const requirement = await courseTimeRequirement();
      if (!requirement.satisfied) {
        await supplementCourseTime(requirement);
        return;
      }

      await returnToCatalog("当前课程里的内容已全部完成，返回上一级");
      return;
    }

    const started = await clickStartControl();
    if (started) return;

    const video = primaryVideo();
    if (video) {
      await tryAutoPlay();
      if (video.paused) {
        setStatus("视频尚未开始，正在重试自动播放");
        return;
      }
      if (currentContentComplete()) return;
      if (video.ended || (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime >= video.duration - 1)) {
        await sleep(state.settings.nextDelayMs);
        if (currentContentComplete()) {
          await handleContent();
        } else {
          await recoverUnconfirmedEnd(video);
        }
        return;
      }
      const progress = Number.isFinite(video.duration) && video.duration > 0
        ? `${Math.floor(video.currentTime)} / ${Math.floor(video.duration)} 秒`
        : "等待播放器时长";
      setStatus(`正在学习视频：${progress}`);
      return;
    }

    const next = !activeContentItem() ? nextContentItem() : null;
    if (next && clickElement(next, `进入未完成内容：${titleFromText(textOf(next))}`)) return;

    keepDocumentActive();
    setStatus("正在学习文档/材料，等待平台完成标记");
  }

  async function tick(reason = "timer") {
    invalidateScans();
    if (!state.settings.running) return;
    if (isLocked()) return;

    state.busy = true;
    try {
      if (state.lastUrl !== location.href) {
        state.lastUrl = location.href;
        syncPanelForUrl();
        setActionLock(1200);
        await runtimePatch({ lastTargetKey: "", lastTargetAt: 0 });
        setStatus("页面已切换，重新识别学习状态");
      }

      if (state.settings.skipQuestions && pageLooksQuestion()) {
        await skipQuestionPage();
      } else if (pageLooksCatalog()) {
        await handleCatalog();
      } else if (pageLooksContent()) {
        await handleContent();
      } else {
        const started = await clickStartControl();
        if (!started) setStatus(`等待学习页面加载：${reason}`);
      }
    } finally {
      state.busy = false;
      updatePanelSummary();
    }
  }

  // The panel lives inside documentElement, which the observer watches, so its own status /
  // progress updates would otherwise re-trigger the observer in a feedback loop. Ignore any
  // batch whose mutations are all inside our panel; only page changes should drive a tick.
  function hasExternalMutation(mutations) {
    const root = state.rootEl;
    if (!root) return true;
    for (const mutation of mutations) {
      const target = mutation.target;
      if (!target || !root.contains(target)) return true;
    }
    return false;
  }

  function scheduleTick(mutations) {
    if (mutations && mutations.length && !hasExternalMutation(mutations)) return;
    invalidateScans();
    window.clearTimeout(state.mutationTimer);
    state.mutationTimer = window.setTimeout(() => tick("dom-change"), 500);
  }

  async function start() {
    const progress = pageLooksCatalog() ? catalogProgressFromRows() : currentLearningProgress();
    await runtimePatch({
      catalogUrl: pageLooksCatalog() ? location.href : state.runtime.catalogUrl,
      currentCourseTitle: state.runtime.currentCourseTitle || "",
      completedCourseTitles: [],
      skippedTitles: [],
      lastTargetKey: "",
      lastTargetAt: 0,
      recoveryKey: "",
      recoveryCount: 0,
      lastCourseRequiredSeconds: 0,
      lastCourseLearnedSeconds: 0,
      lastCourseTimeCheckedAt: 0,
      catalogTotal: progress.total ? progress.total : Number(state.runtime.catalogTotal || 0),
      catalogCompleted: progress.total ? progress.completed : Number(state.runtime.catalogCompleted || 0),
      catalogProgressAt: progress.total ? now() : Number(state.runtime.catalogProgressAt || 0)
    });
    state.settings.running = true;
    await storage.set({ running: true, runtime: state.runtime });
    setStatus("已启动，开始寻找第一个未完成课程");
    syncRunningUI();
    tick("start");
  }

  async function stop() {
    state.settings.running = false;
    await storage.set({ running: false });
    setStatus("已停止");
    syncRunningUI();
  }

  function updatePanelSummary() {
    // Panel content is display:none while minimized; skip the expensive DOM scans until the
    // user restores it (restore() calls this again to refresh).
    if (!state.panelOpen) return;
    const summary = document.querySelector(`#${EXT_ID}-summary`);
    if (!summary) return;
    updateProgressDisplay();
    const catalogCount = catalogRows().length;
    const contentCount = contentItems().length;
    const video = primaryVideo();
    const parts = [];
    if (catalogCount) parts.push(`目录 ${catalogCount}`);
    if (contentCount) parts.push(`内容 ${contentCount}`);
    if (video && Number.isFinite(video.duration)) {
      parts.push(`视频 ${Math.floor(video.currentTime)}/${Math.floor(video.duration)} 秒`);
    }
    const requiredSeconds = Number(state.runtime.lastCourseRequiredSeconds || 0);
    const learnedSeconds = Number(state.runtime.lastCourseLearnedSeconds || 0);
    if (requiredSeconds) {
      parts.push(`时长 ${formatSeconds(learnedSeconds)}/${formatSeconds(requiredSeconds)}`);
    }
    summary.textContent = parts.join(" · ") || "等待识别页面";
  }

  function updateProgressDisplay() {
    const container = document.querySelector(`#${EXT_ID}-progress`);
    const label = document.querySelector(`#${EXT_ID}-progress-label`);
    const fill = document.querySelector(`#${EXT_ID}-progress-fill`);
    if (!container || !label || !fill) return;

    const progress = currentLearningProgress();
    // Nothing detected (not on the catalog and not mid-session): hide the bar entirely rather
    // than showing a placeholder or a stale total.
    if (!progress.total) {
      container.style.display = "none";
      return;
    }

    container.style.display = "";
    label.textContent = `总进度 ${progress.completed}/${progress.total} · ${progress.percent}%`;
    fill.style.width = `${progress.percent}%`;
  }

  // Reflect the running flag without tearing down and rebuilding the whole panel on every
  // start/stop. Only the primary button label/state and the logo status dot change.
  function syncRunningUI() {
    const primary = document.querySelector(`.${EXT_ID}-primary`);
    if (primary) {
      primary.classList.toggle("is-running", state.settings.running);
      primary.textContent = state.settings.running ? "停止自动学习" : "开始自动学习";
    }
    const dot = document.querySelector(`.${EXT_ID}-logo-dot`);
    if (dot) dot.classList.toggle("is-running", state.settings.running);
  }

  // The floating panel should only auto-expand on the training "study" page — the real
  // course directory, e.g. /<tenant>/home/training/study. On every other KME page (the home
  // landing, a course player, a quiz, etc.) it stays minimized to the logo so it never covers
  // the player. Actual course content lives under /home/course/..., which is excluded here.
  function isStudyCatalogPage() {
    return /\/home\/training\/study(?:\/|$)/.test(location.pathname);
  }

  // Re-apply that per-page default whenever the URL changes. The site is a single-page app,
  // so navigating from the directory into a course (or back) does not reload the content
  // script; without this the panel would keep whatever state it had. We only act on an actual
  // URL change, so a manual minimize/restore on the current page is preserved.
  function syncPanelForUrl() {
    if (state.panelUrl === location.href) return;
    state.panelUrl = location.href;
    const shouldOpen = isStudyCatalogPage();
    if (shouldOpen === state.panelOpen) return;
    state.panelOpen = shouldOpen;
    if (state.rootEl) state.rootEl.classList.toggle("open", shouldOpen);
    if (shouldOpen) updatePanelSummary();
    else resetFlip();
  }

  // One settings switch on the card's back face: a labelled toggle that writes straight to
  // storage and re-runs a tick so the change takes effect immediately.
  function settingRow(labelText, key) {
    const wrap = document.createElement("label");
    wrap.className = `${EXT_ID}-row`;
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(state.settings[key]);
    input.addEventListener("change", async () => {
      state.settings[key] = input.checked;
      await storage.set({ [key]: input.checked });
      tick(`${key}-changed`);
    });
    wrap.append(label, input);
    return wrap;
  }

  // The card's back face: a small header with a 完成 button (flips back to the front) and the
  // behaviour toggles that used to sit on the front panel.
  function buildSettingsFace() {
    const back = document.createElement("div");
    back.className = `${EXT_ID}-face ${EXT_ID}-face-back`;

    const bar = document.createElement("div");
    bar.className = `${EXT_ID}-titlebar`;
    const title = document.createElement("div");
    title.className = `${EXT_ID}-title`;
    title.textContent = "设置";
    const done = document.createElement("button");
    done.type = "button";
    done.className = `${EXT_ID}-done`;
    done.textContent = "完成";
    done.addEventListener("click", () => flipPanel(false));
    bar.append(title, done);

    const list = document.createElement("div");
    list.className = `${EXT_ID}-settings-list`;
    list.append(
      settingRow("自动播放", "autoPlay"),
      settingRow("未完成自动补学", "recoverOnUnconfirmedEnd"),
      settingRow("总时长达标再返回", "enforceCourseTotalTime"),
      settingRow("跳过做题页", "skipQuestions")
    );

    const note = document.createElement("div");
    note.className = `${EXT_ID}-settings-note`;
    note.textContent = "视频按平台规则固定以 1x 播放，确保积累真实学习时长。";

    back.append(bar, list, note);
    return back;
  }

  const GEAR_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';

  function currentFaces() {
    const root = state.rootEl;
    if (!root) return null;
    const inner = root.querySelector(`.${EXT_ID}-flip-inner`);
    const front = root.querySelector(`.${EXT_ID}-face-front`);
    const back = root.querySelector(`.${EXT_ID}-face-back`);
    return inner && front && back ? { root, inner, front, back } : null;
  }

  // Flip the card between the front panel and the settings face. The front face stays in flow
  // so it auto-sizes to its (changing) status text; we only pin an explicit height during the
  // flip so the card can animate between the two faces' heights, then release it on the front.
  function flipPanel(toBack) {
    const faces = currentFaces();
    if (!faces) return;
    const { root, inner, front, back } = faces;
    state.flipped = toBack;
    inner.style.transition = "transform 0.55s cubic-bezier(0.4, 0.15, 0.2, 1), height 0.45s ease";
    inner.style.height = `${(toBack ? front : back).offsetHeight}px`;
    void inner.offsetHeight; // reflow so the next height write animates from this value
    root.classList.toggle("flipped", toBack);
    inner.style.height = `${(toBack ? back : front).offsetHeight}px`;
    window.clearTimeout(state.flipTimer);
    state.flipTimer = window.setTimeout(() => {
      inner.style.transition = "";
      if (!state.flipped) inner.style.height = "";
    }, 620);
  }

  function resetFlip() {
    state.flipped = false;
    window.clearTimeout(state.flipTimer);
    const faces = currentFaces();
    if (!faces) return;
    faces.root.classList.remove("flipped");
    faces.inner.style.transition = "";
    faces.inner.style.height = "";
  }

  function renderPanel() {
    const old = document.getElementById(EXT_ID);
    if (old) old.remove();

    const root = document.createElement("div");
    root.id = EXT_ID;
    root.className = state.panelOpen ? "open" : "";
    state.rootEl = root;

    const panel = document.createElement("div");
    panel.className = `${EXT_ID}-panel`;

    const titleBar = document.createElement("div");
    titleBar.className = `${EXT_ID}-titlebar`;

    const title = document.createElement("div");
    title.className = `${EXT_ID}-title`;
    title.textContent = "学习助手";

    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.className = `${EXT_ID}-settings`;
    settingsBtn.setAttribute("aria-label", "打开设置");
    settingsBtn.title = "设置";
    settingsBtn.innerHTML = GEAR_SVG;
    settingsBtn.addEventListener("click", () => flipPanel(true));

    const minimize = document.createElement("button");
    minimize.type = "button";
    minimize.className = `${EXT_ID}-minimize`;
    minimize.setAttribute("aria-label", "最小化学习助手");
    minimize.title = "最小化";
    minimize.textContent = "-";
    minimize.addEventListener("click", async () => {
      state.panelOpen = false;
      root.classList.remove("open");
      resetFlip();
      await storage.set({ panelOpen: false });
    });

    const controls = document.createElement("div");
    controls.className = `${EXT_ID}-controls`;
    controls.append(settingsBtn, minimize);
    titleBar.append(title, controls);

    const primary = document.createElement("button");
    primary.type = "button";
    primary.className = `${EXT_ID}-primary ${state.settings.running ? "is-running" : ""}`;
    primary.textContent = state.settings.running ? "停止自动学习" : "开始自动学习";
    primary.addEventListener("click", () => {
      if (state.settings.running) stop();
      else start();
    });

    const scan = document.createElement("button");
    scan.type = "button";
    scan.className = `${EXT_ID}-secondary`;
    scan.textContent = "立即检查";
    scan.addEventListener("click", () => tick("manual"));

    const actions = document.createElement("div");
    actions.className = `${EXT_ID}-actions`;
    actions.append(primary, scan);

    const progress = document.createElement("div");
    progress.id = `${EXT_ID}-progress`;
    progress.className = `${EXT_ID}-progress`;

    const progressLabel = document.createElement("div");
    progressLabel.id = `${EXT_ID}-progress-label`;
    progressLabel.className = `${EXT_ID}-progress-label`;

    const progressTrack = document.createElement("div");
    progressTrack.className = `${EXT_ID}-progress-track`;

    const progressFill = document.createElement("div");
    progressFill.id = `${EXT_ID}-progress-fill`;
    progressFill.className = `${EXT_ID}-progress-fill`;
    progressTrack.append(progressFill);
    progress.append(progressLabel, progressTrack);

    const status = document.createElement("div");
    status.id = `${EXT_ID}-status`;
    status.className = `${EXT_ID}-status`;
    status.textContent = state.status;

    const summary = document.createElement("div");
    summary.id = `${EXT_ID}-summary`;
    summary.className = `${EXT_ID}-summary`;

    // Front face: the live panel. Back face: the settings. They share one card that flips.
    const front = document.createElement("div");
    front.className = `${EXT_ID}-face ${EXT_ID}-face-front`;
    front.append(titleBar, actions, progress, summary, status);

    const inner = document.createElement("div");
    inner.className = `${EXT_ID}-flip-inner`;
    inner.append(front, buildSettingsFace());

    panel.append(inner);

    const toggle = document.createElement("button");
    toggle.className = `${EXT_ID}-logo-toggle`;
    toggle.type = "button";
    toggle.setAttribute("aria-label", "展开学习助手");
    toggle.title = "展开学习助手";

    const logo = document.createElement("img");
    logo.alt = "";
    logo.decoding = "async";
    try {
      // Render the 128px source into a 32px box so the floating logo stays crisp on HiDPI
      // screens (a 32px source was being upscaled ~2x and looked blurry).
      logo.src = chrome.runtime.getURL("icons/icon-128.png");
      logo.addEventListener("error", () => {
        logo.src = chrome.runtime.getURL("icons/icon-32.png");
      }, { once: true });
    } catch {
      logo.remove();
    }

    const dot = document.createElement("span");
    dot.className = `${EXT_ID}-logo-dot ${state.settings.running ? "is-running" : ""}`;
    toggle.append(logo, dot);

    const restore = async () => {
      if (state.panelOpen) return;
      state.panelOpen = true;
      root.classList.add("open");
      await storage.set({ panelOpen: true });
      updatePanelSummary();
    };
    toggle.addEventListener("click", restore);
    toggle.addEventListener("mouseenter", restore);

    root.append(panel, toggle);
    document.documentElement.appendChild(root);
    updatePanelSummary();
  }

  function exposeDebugApi() {
    window.__kmeLearningNavigator = {
      inspect() {
        return {
          running: state.settings.running,
          url: location.href,
          catalog: catalogRows().map((row) => ({
            text: textOf(row),
            complete: itemComplete(row),
            question: questionLikeItem(row)
          })),
          content: contentItems().map((item) => ({
            text: textOf(item),
            complete: itemComplete(item),
            question: questionLikeItem(item)
          })),
          pageLooksCatalog: pageLooksCatalog(),
          pageLooksContent: pageLooksContent(),
          pageLooksQuestion: pageLooksQuestion(),
          progress: currentLearningProgress(),
          timeRequirement: {
            requiredSeconds: Number(state.runtime.lastCourseRequiredSeconds || 0),
            learnedSeconds: Number(state.runtime.lastCourseLearnedSeconds || 0),
            checkedAt: Number(state.runtime.lastCourseTimeCheckedAt || 0)
          },
          nextCatalog: textOf(nextCatalogCourse()),
          nextContent: textOf(nextContentItem())
        };
      },
      start,
      stop,
      tick
    };
  }

  async function init() {
    const stored = await storage.get();
    state.settings = { ...DEFAULTS, ...stored };
    state.runtime = { ...DEFAULT_RUNTIME, ...(stored.runtime || {}) };
    // Panel visibility follows the page, not stored state: only the course directory page
    // opens the panel; every other KME page starts minimized to the logo.
    state.panelUrl = location.href;
    state.panelOpen = isStudyCatalogPage();
    state.status = state.settings.running ? "已恢复自动学习" : "未启动";

    renderPanel();
    exposeDebugApi();
    restoreSpeedMenu();
    videos().forEach(bindVideo);

    const observer = new MutationObserver(scheduleTick);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-icon"]
    });

    state.scanTimer = window.setInterval(() => tick("timer"), 2000);
    state.speedTimer = window.setInterval(() => {
      syncPanelForUrl();
      restoreSpeedMenu();
      const liveVideos = videos();
      liveVideos.forEach(bindVideo);
      liveVideos.forEach(applySpeed);
    }, 1000);
    state.panelTimer = window.setInterval(updatePanelSummary, 1500);
    tick("init");
  }

  init();
})();
