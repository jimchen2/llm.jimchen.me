// ==UserScript==
// @name         Annoying Websites
// @namespace    http://tampermonkey.net/
// @version      6.5
// @license      Unlicense
// @description  Block Harmful Websites
// @author       Jim Chen
// @downloadURL  https://raw.githubusercontent.com/jimchen2/llm.jimchen.me/master/public/annoying-website.user.js
// @match        *://*.reddit.com/*
// @match        *://www.reddit.com/*
// @match        *://*.huaren.us/*
// @match        *://*.tieba.baidu.com/*
// @match        *://www.baidu.com/*
// @match        *://*.aistudio.google.com/*
// @match        *://aistudio.google.com/*
// @match        *://*.1point3acres.com/*
// @match        *://arena.ai/c/*
// @match        *://*.zombsroyale.io/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  blockSite();

  function blockSite() {
    window.location.replace("https://docs.google.com/document/d/1GIW1oz-ttAG3B08usdbz758iCgShPd4DWcBis_IBbgM/edit?tab=t.0");
    alert(
      "WEBSITE BLOCKED\n\nSite blocked by Userscript because it contains extremist contents.\n\nPlease choose healthy alternatives."
    );
  }
})();
