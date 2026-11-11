// ==UserScript==
// @name         Annoying Websites
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Block annoying websites completely - before the page can load, play, or paint over the block.
// @author       Jim Chen
// @license      Unlicense
// @updateURL    https://raw.githubusercontent.com/jimchen2/llm.jimchen.me/master/public/annoying-website.user.js
// @downloadURL  https://raw.githubusercontent.com/jimchen2/llm.jimchen.me/master/public/annoying-website.user.js
// @run-at       document-start
// @grant        none
// @match        *://*.1point3acres.com/*
// @match        *://*.huaren.us/*
// @match        *://www.reddit.com/*
// @match        *://arena.ai/c/*
// @match        *://www.baidu.com/*
// @match        *://aistudio.google.com/*
// @match        *://*.zombsroyale.io/*
// ==/UserScript==

/*
 * Why a plain document-end overlay fails on zombsroyale.io:
 * 1. Unity WebGL (webgl.{framework.js,wasm,data}.br) still downloads, compiles WASM, and
 *    runs its rAF loop + ad/CMP scripts underneath, stalling the main thread (>20s freezes).
 * 2. Fullscreen, pointer lock, and WebAudio/<audio> bypass DOM overlays; CMP modals also
 *    sit at max z-index (2147483647), and a single unguarded node can be removed.
 * 3. Fix & limit: run at document-start, stub browser APIs, repaint/mute on a timer, and
 *    call window.stop() so WASM/framework bodies never arrive. (Must wait for <body> + 2 rAFs
 *    or the parser aborts before first paint; true request-time blocking needs DNR/DNS/hosts.)
 */

(() => {
  "use strict";

  const MINUTES = 0; // 0 = block immediately; >0 = allow this many focused minutes first
  const PAPERS = "https://github.com/jimchen2/randompapers/tree/main";

  // Escape hatches: no fullscreen, no pointer lock, no sound.
  for (const p of ["requestFullscreen", "webkitRequestFullscreen", "requestPointerLock"])
    if (Element.prototype[p]) Element.prototype[p] = () => Promise.reject(Error("blocked"));
  for (const n of ["AudioContext", "webkitAudioContext"]) if (window[n])
    window[n] = class extends window[n] { constructor(...a) { super(...a); this.suspend(); } };

  const UI = `<style>
    #aw{all:initial;position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:28px;padding:24px;box-sizing:border-box;
      background:#000;color:#fff;font:700 clamp(30px,7vw,88px)/1.15 Arial,sans-serif;text-align:center}
    #aw h1{margin:0;font:inherit;max-width:1200px}
    #aw nav{display:flex;flex-direction:column;gap:14px;width:min(300px,80vw)}
    #aw a,#aw button{padding:12px 20px;border:0;border-radius:8px;background:#4caf50;color:#fff;
      font:700 16px/1.4 Arial,sans-serif;text-align:center;text-decoration:none;cursor:pointer}
    #aw button{background:#455a64}
  </style>
  <div id="aw" role="alertdialog" aria-modal="true">
    <h1>ЭТОТ САЙТ ЗАБЛОКИРОВАН</h1>
    <nav>
      <a href="${PAPERS}" rel="noopener noreferrer">Go to papers</a>
      <button type="button">Close the computer and go for a walk.</button>
    </nav>
  </div>`;

  const until = (test, fn, ms = 20000) => {             // poll until test() is true
    const t = setInterval(() => { if (test()) { clearInterval(t); fn(); } }, 20);
    setTimeout(() => clearInterval(t), ms);
  };

  const paint = () => {
    const root = document.documentElement;
    if (!root?.isConnected) return false;
    if (!document.getElementById("aw-css")) root.insertAdjacentHTML("beforeend",
      "<style id='aw-css'>html{overflow:hidden!important}body>*:not(#aw){display:none!important}</style>");
    if (!document.getElementById("aw")) {
      root.insertAdjacentHTML("beforeend", UI);
      document.querySelector("#aw button").onclick = () => { close(); location.replace("about:blank"); };
    }
    return true;
  };

  let blocked = false, stopped = false;
  const halt = () => {                                  // kill the rest of the site's loading
    if (stopped) return;
    stopped = true;
    try { window.stop(); } catch {}
  };

  const silence = () => document.querySelectorAll("audio,video").forEach(m => {
    try { if (!m.paused) m.pause(); m.muted = true; } catch {}
  });

  const block = () => {
    if (blocked) return;
    blocked = true;
    silence();
    paint();
    // Wait for <body> + 2 frames: stopping earlier aborts the parser before first composite.
    until(() => document.body, () => requestAnimationFrame(() => requestAnimationFrame(halt)));
    setInterval(() => { paint(); silence(); }, 500);    // the site may wipe our DOM or start audio; undo it
  };

  if (MINUTES <= 0) block();
  else {
    let left = MINUTES * 60;
    setInterval(() => { if (document.visibilityState === "visible" && document.hasFocus() && --left <= 0) block(); }, 1000);
  }
})();
