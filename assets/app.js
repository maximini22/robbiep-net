/* ROBBIE P · robbiep.net: sticky nav, video lightbox, page navigation and the persistent player.
   Streams come from the robbiep-audio Worker as short-lived signed links. */
(function () {
  "use strict";
  var H = document.documentElement;
  var ROOT = H.getAttribute("data-root") || "/";
  var WORKER = "https://robbiep-audio.bitcoinslang.workers.dev";
  var FILE = location.protocol === "file:";
  var CAT = (window.RP_CATALOG && window.RP_CATALOG.tracks) || [];
  var BY = {}; CAT.forEach(function (t) { BY[t.slug] = t; });
  function abs(p) { return p.charAt(0) === "/" ? ROOT + p.slice(1) : p; }

  /* ---- nav shrink on scroll ---- */
  // Hysteresis (shrink past 80px, expand under 20px) + one rAF per frame. The nav box never changes height (see site.css),
  // so toggling the class cannot move the page and re-trigger itself.
  var SHRINK_AT = 80, EXPAND_AT = 20, ticking = false, small = null;
  function setSmall(on) { if (on === small) return; small = on; H.classList.toggle("scrolled", on); }
  function onScroll() {
    ticking = false; var y = window.scrollY || 0;
    if (small === null) setSmall(y > SHRINK_AT); else if (!small && y > SHRINK_AT) setSmall(true); else if (small && y < EXPAND_AT) setSmall(false);
  }
  addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true }); onScroll();
  /* phone nav: fade hint only if the six links ever overflow */
  (function () { var ul = document.querySelector("nav.nav ul"); if (!ul) return;
    function chk() { ul.classList.toggle("overflowing", ul.scrollWidth > ul.clientWidth + 1 && ul.scrollLeft + ul.clientWidth < ul.scrollWidth - 2); }
    addEventListener("resize", chk, { passive: true }); ul.addEventListener("scroll", chk, { passive: true }); chk(); })();

  /* ---- lightbox for every video (YouTube nocookie / Rumble), so visitors stay on the site ---- */
  var lb = document.createElement("div");
  lb.className = "lb"; lb.hidden = true; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Video");
  lb.innerHTML = '<div class="box"><button type="button" class="x">Close &times;</button><div class="frame"></div></div>';
  document.body.appendChild(lb);
  function openVideo(src, title) {
    if (!audio.paused) { audio.pause(); }
    lb.querySelector(".frame").innerHTML = '<iframe src="' + src + '" title="' + (title || "Video").replace(/"/g, "") +
      '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    lb.hidden = false; lb.querySelector(".x").focus();
  }
  function closeVideo() { lb.hidden = true; lb.querySelector(".frame").innerHTML = ""; }
  lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("x")) closeVideo(); });
  addEventListener("keydown", function (e) { if (e.key === "Escape" && !lb.hidden) closeVideo(); });

  /* ---- persistent player ----
     Rules: a single (or any one-track play) plays that track, then Next / auto-advance shuffle through the ROBBIE P catalogue.
     An album/EP play goes in album order from the chosen track, then continues into catalogue shuffle.
     Shuffle draws from a no-repeat bag of the whole catalogue (this site's catalog only), refilled and reshuffled when used up.
     Previous walks back through play history; Next after Previous walks forward through it again. State persists across pages. */
  var audio = new Audio(); audio.preload = "none";
  var hist = [], hp = -1, upnext = [], bag = [], retried = false, el = null, pending = 0;
  function cur() { return BY[hist[hp]]; }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function buildPlayer() {
    if (el) return el;
    el = document.createElement("div"); el.id = "rp-player"; el.hidden = true; el.setAttribute("aria-label", "Music player");
    el.innerHTML = '<img alt="" src="">' +
      '<div class="ti"><b>ROBBIE P</b><span></span></div>' +
      '<div class="ctl"><button type="button" class="pv" aria-label="Previous">&#9198;</button><button type="button" class="pp" aria-label="Play or pause">&#9654;</button>' +
      '<button type="button" class="nx" aria-label="Next">&#9197;</button><span class="sh" role="img">&#8644;</span></div>' +
      '<div class="bar"><span class="cur">0:00</span><input type="range" min="0" max="1000" value="0" aria-label="Seek"><span class="dur">0:00</span></div>' +
      '<button type="button" class="cls" aria-label="Close player">&#10005;</button><div class="msg" role="status"></div>';
    document.body.appendChild(el);
    el.querySelector(".pp").onclick = function () { if (hp < 0) return startSingle(draw()); audio.paused ? resume() : audio.pause(); };
    el.querySelector(".nx").onclick = next;
    el.querySelector(".pv").onclick = prev;
    el.querySelector(".cls").onclick = function () { audio.pause(); el.hidden = true; document.body.classList.remove("has-player"); save(); };
    var rng = el.querySelector("input");
    rng.oninput = function () { if (audio.duration) audio.currentTime = audio.duration * rng.value / 1000; };
    return el;
  }
  function msg(t) { buildPlayer().querySelector(".msg").textContent = t || ""; }
  function mode() {
    var sh = buildPlayer().querySelector(".sh"), album = hp === hist.length - 1 && upnext.length > 0;
    sh.classList.toggle("on", !album);
    var t = album ? "Next: album order, then shuffle" : "Shuffle on: next is a random ROBBIE P track";
    sh.setAttribute("aria-label", t); sh.title = t;
  }
  function show() { buildPlayer().hidden = false; document.body.classList.add("has-player"); }
  function paint() {
    var t = cur(); if (!t) return; var p = buildPlayer();
    p.querySelector("img").src = abs(t.art); p.querySelector("img").alt = t.release + " cover";
    p.querySelector(".ti b").textContent = t.title + (t.feat ? " ft. " + t.feat : "");
    p.querySelector(".ti span").textContent = t.release + " · " + t.year;
    document.querySelectorAll(".tracklist li").forEach(function (li) { li.classList.toggle("now", li.getAttribute("data-slug") === t.slug); });
    mode();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: "ROBBIE P", album: t.release, artwork: [{ src: new URL(abs(t.art), location.href).href }] });
      navigator.mediaSession.setActionHandler("nexttrack", next);
      navigator.mediaSession.setActionHandler("previoustrack", prev);
    }
  }
  function sign(t) {
    return fetch(WORKER + "/sign?track=" + encodeURIComponent(t.stream_key), { credentials: "omit" })
      .then(function (r) { if (!r.ok) throw new Error("sign " + r.status); return r.json(); })
      .then(function (j) { return j.url; });
  }
  var loadSeq = 0;
  // play() rejects with AbortError when src changes mid-start ("interrupted by a new load request"); that is expected, so ignore it
  function safePlay() { var p = audio.play(); return p && p.catch ? p.catch(function (e) { if (e && e.name === "AbortError") return; throw e; }) : Promise.resolve(); }
  function load(at) {
    retried = false; var t = cur(); if (!t) return;
    show(); paint(); msg("");
    if (FILE) { msg("Streaming needs the local server (see VIEW-ME.txt). The player itself works."); save(); return; }
    var my = ++loadSeq;             // a newer load (fast Next/clicks) supersedes this one
    return sign(t).then(function (u) {
      if (my !== loadSeq) return;
      audio.src = u; if (at) { audio.addEventListener("loadedmetadata", function f() { audio.removeEventListener("loadedmetadata", f); audio.currentTime = at; }); }
      return safePlay();
    }).catch(function (e) {
      if (my !== loadSeq || (e && e.name === "AbortError")) return;   // interrupted by a newer load: not an error
      if (e && e.name === "NotAllowedError") { msg("Press play to resume."); return; }
      msg("Could not start the stream (" + (e && e.message ? e.message : "error") + ").");
    }).then(save);
  }
  function push(slug) {           // play a new track and record it in history
    if (!BY[slug]) return;
    hist = hist.slice(0, hp + 1); hist.push(slug); if (hist.length > 200) hist = hist.slice(-200); hp = hist.length - 1;
    bag = bag.filter(function (s) { return s !== slug; });
    return load(0);
  }
  function shuffled(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function draw() {               // next random track, no repeats until the whole catalogue has played
    var now = hist[hp];
    bag = bag.filter(function (s) { return BY[s] && s !== now; });
    if (!bag.length) {
      var recent = hist.slice(-Math.min(5, CAT.length - 2));
      var all = shuffled(CAT.map(function (t) { return t.slug; }).filter(function (s) { return s !== now; }));
      bag = all.filter(function (s) { return recent.indexOf(s) < 0; }).concat(all.filter(function (s) { return recent.indexOf(s) >= 0; }));
    }
    return bag.shift();
  }
  function relTracks(rel) { return CAT.filter(function (t) { return t.release_slug === rel; }).sort(function (a, b) { return (a.track || 0) - (b.track || 0); }).map(function (t) { return t.slug; }); }
  function startSingle(slug) { upnext = []; return push(slug); }
  function startAlbum(rel, from) {
    var list = relTracks(rel); if (!list.length) return;
    var i = Math.max(0, from ? list.indexOf(from) : 0);
    upnext = list.slice(i + 1); return push(list[i]);
  }
  function next() {
    if (hp < 0) return startSingle(draw());
    if (hp < hist.length - 1) { hp++; return load(0); }
    if (upnext.length) return push(upnext.shift());
    return push(draw());
  }
  function prev() {
    if (audio.currentTime > 4 || hp <= 0) { audio.currentTime = 0; return; }
    hp--; return load(0);
  }
  function resume() { if (!audio.src) return load(audio.currentTime || pending); safePlay().catch(function () {}); }
  audio.addEventListener("play", function () { buildPlayer().querySelector(".pp").innerHTML = "&#10074;&#10074;"; save(); });
  audio.addEventListener("pause", function () { buildPlayer().querySelector(".pp").innerHTML = "&#9654;"; save(); });
  audio.addEventListener("ended", next);
  audio.addEventListener("error", function () {
    // a signed link lasts 5 minutes; if a late seek hits an expired link, sign again and carry on from the same spot
    if (hp < 0 || retried) return; retried = true; var at = audio.currentTime;
    sign(cur()).then(function (u) { audio.src = u; audio.currentTime = at; return safePlay(); }).catch(function (e) { if (e && e.name === "AbortError") return; msg("Stream error."); });
  });
  var lastSave = 0;
  audio.addEventListener("timeupdate", function () {
    var p = buildPlayer(); if (audio.duration) p.querySelector("input").value = Math.round(1000 * audio.currentTime / audio.duration);
    p.querySelector(".cur").textContent = fmt(audio.currentTime); p.querySelector(".dur").textContent = fmt(audio.duration || (cur() || {}).duration);
    if (Date.now() - lastSave > 3000) { lastSave = Date.now(); save(); }
  });
  function save() {
    try { localStorage.setItem("rp-player2", JSON.stringify({ h: hist, hp: hp, n: upnext, b: bag, t: audio.currentTime || pending, p: !audio.paused, v: el && !el.hidden })); } catch (e) {}
  }
  addEventListener("pagehide", save);
  function restore() {
    // used when a page loads fresh (file:// or no-JS navigation): bring the player back where it was
    try {
      var st = JSON.parse(localStorage.getItem("rp-player2") || "null");
      if (!st) { var o = JSON.parse(localStorage.getItem("rp-player") || "null"); if (o && o.q && o.i >= 0) st = { h: [o.q[o.i]], hp: 0, n: [], b: [], t: o.t, p: o.p, v: o.v }; }
      if (!st || !st.h || !st.v) return;
      hist = st.h.filter(function (s) { return BY[s]; }); hp = Math.min(st.hp, hist.length - 1); if (hp < 0) return;
      upnext = (st.n || []).filter(function (s) { return BY[s]; }); bag = (st.b || []).filter(function (s) { return BY[s]; });
      pending = st.t || 0; show(); paint();
      buildPlayer().querySelector(".cur").textContent = fmt(pending);
      if (st.p && !FILE) load(pending);
    } catch (e) {}
  }

  /* ---- page features (run on first load and after every shell swap) ---- */
  function wire(root) {
    root.querySelectorAll("[data-yt]").forEach(function (b) {
      b.addEventListener("click", function () { openVideo("https://www.youtube-nocookie.com/embed/" + b.getAttribute("data-yt") + "?autoplay=1&rel=0", b.textContent); });
    });
    root.querySelectorAll("[data-rumble]").forEach(function (b) {
      b.addEventListener("click", function () { openVideo("https://rumble.com/embed/" + b.getAttribute("data-rumble") + "/?autoplay=2", b.textContent); });
    });
    root.querySelectorAll("[data-play]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = b.getAttribute("data-play"), rel = b.getAttribute("data-release");
        if (rel && relTracks(rel).length > 1) startAlbum(rel, s); else startSingle(s);
      });
    });
    root.querySelectorAll("[data-play-release]").forEach(function (b) {
      b.addEventListener("click", function () { startAlbum(b.getAttribute("data-play-release")); });
    });
    root.querySelectorAll("[data-shuffle]").forEach(function (b) { b.addEventListener("click", function () { startSingle(draw()); }); });
    root.querySelectorAll(".tabs[data-filter]").forEach(function (tabs) {
      tabs.querySelectorAll("button").forEach(function (b) {
        b.addEventListener("click", function () {
          tabs.querySelectorAll("button").forEach(function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); });
          var k = b.getAttribute("data-k");
          document.querySelectorAll(".disc .item").forEach(function (it) { it.hidden = !(k === "all" || it.getAttribute("data-kind") === k); });
        });
      });
    });
    root.querySelectorAll("form[data-mailto]").forEach(function (f) {
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var m = f.querySelector(".formmsg");
        if (f.checkValidity && !f.checkValidity()) { if (f.reportValidity) f.reportValidity(); if (m) m.textContent = "Please fill in the required fields."; return; }
        var lines = [], subj = f.classList.contains("inline-form") ? "Join the list" : "Booking request";
        Array.prototype.forEach.call(f.elements, function (el) { if (el.name && el.value) lines.push(el.name.charAt(0).toUpperCase() + el.name.slice(1) + ": " + el.value); });
        var ev = f.elements.namedItem("event"); if (ev && ev.value) subj += ": " + ev.value;
        location.href = "mailto:music@robbiep.net?subject=" + encodeURIComponent(subj) + "&body=" + encodeURIComponent(lines.join("\n"));
        if (m) m.textContent = "Opening your email app. If nothing happens, email music@robbiep.net.";
      });
    });
    if (hp >= 0) paint();
  }

  /* ---- shell navigation: swap <main>, keep the player playing ---- */
  function internal(a) {
    if (!a || a.target || a.hasAttribute("download") || a.getAttribute("href").charAt(0) === "#") return false;
    var u; try { u = new URL(a.href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;
    if (/\.(jpe?g|png|zip|pdf|mp3|txt|xml|json)$/i.test(u.pathname)) return false;
    return u;
  }
  /* ---- scroll restoration: back from a release returns to the card that was clicked, with the same filter ---- */
  var SKEY = "rp-scroll:", curPath = location.pathname;
  var CARDS = ".disc .item, .rel > div";
  function filterNow() { var b = document.querySelector(".tabs[data-filter] button.on"); return b ? b.getAttribute("data-k") : null; }
  function setFilter(k) { var b = k && document.querySelector('.tabs[data-filter] button[data-k="' + k + '"]'); if (b && !b.classList.contains("on")) b.click(); }
  function saveScroll(a) {
    try {
      var st = { y: window.scrollY, f: filterNow() };
      var card = a && a.closest && a.closest(CARDS);
      if (card) { var h = card.querySelector("a[href]"); st.card = h && h.getAttribute("href"); st.off = card.getBoundingClientRect().top; }
      sessionStorage.setItem(SKEY + location.pathname, JSON.stringify(st));
    } catch (e) {}
  }
  function restoreScroll() {
    var st = null; try { st = JSON.parse(sessionStorage.getItem(SKEY + location.pathname) || "null"); } catch (e) {}
    if (!st) return false;
    if (st.f) setFilter(st.f);
    var el = null;
    if (st.card) document.querySelectorAll(CARDS).forEach(function (c) { var h = c.querySelector("a[href]"); if (!el && !c.hidden && h && h.getAttribute("href") === st.card) el = c; });
    var y = el ? el.getBoundingClientRect().top + window.scrollY - (st.off || 0) : st.y;
    window.scrollTo(0, Math.max(0, y || 0));
    return true;
  }
  function swap(url, push, back) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (txt) {
      var doc = new DOMParser().parseFromString(txt, "text/html");
      var m = doc.getElementById("main"), cur = document.getElementById("main"); if (!m || !cur) throw new Error("no main");
      if (push) history.pushState({ rp: 1 }, "", url);
      document.title = doc.title;
      ["description", "robots"].forEach(function (n) {
        var a = document.querySelector('meta[name="' + n + '"]'), b = doc.querySelector('meta[name="' + n + '"]'); if (a && b) a.setAttribute("content", b.getAttribute("content"));
      });
      var ca = document.querySelector('link[rel="canonical"]'), cb = doc.querySelector('link[rel="canonical"]'); if (ca && cb) ca.href = cb.href;
      var na = document.querySelector("nav.nav .wrap"), nb = doc.querySelector("nav.nav .wrap"); if (na && nb) na.innerHTML = nb.innerHTML;
      var fa = document.querySelector("footer.site"), fb = doc.querySelector("footer.site"); if (fa && fb) fa.innerHTML = fb.innerHTML;
      var nr = doc.documentElement.getAttribute("data-root"); if (nr) { ROOT = nr; H.setAttribute("data-root", nr); }
      var an = document.querySelector(".announcer"), bn = doc.querySelector(".announcer"); if (an) an.hidden = !bn;
      cur.replaceWith(m); wire(m);
      var hash = new URL(url, location.href).hash; var tgt = hash && document.getElementById(hash.slice(1));
      curPath = location.pathname;
      if (back && restoreScroll()) {} else if (tgt) tgt.scrollIntoView(); else window.scrollTo(0, 0);
      m.setAttribute("tabindex", "-1"); m.focus({ preventScroll: true });
    });
  }
  if (!FILE && window.fetch && window.history && history.pushState) {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest && e.target.closest("a[href]"); var u = internal(a); if (!u) return;
      if (u.pathname === location.pathname && u.hash) return;
      e.preventDefault();
      saveScroll(a);
      swap(u.href, true).catch(function () { location.href = u.href; });
    });
    addEventListener("popstate", function () {
      if (location.pathname === curPath) { var t = location.hash && document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); else window.scrollTo(0, 0); return; }
      swap(location.href, false, true).catch(function () { location.reload(); });
    });
  }
  wire(document);
  restore();
  try { var nv = performance.getEntriesByType && performance.getEntriesByType("navigation")[0]; if (nv && nv.type === "back_forward") restoreScroll(); } catch (e) {}
})();
