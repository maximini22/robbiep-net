/* Share to Instagram Story · robbiep.net song pages.
   The 1080x1920 story PNG is pre-rendered at build time (tools/story_cards.py) and served same-origin from /assets/img/story/<slug>.png,
   so nothing is drawn in the browser and there is no canvas/CORS risk. It is a share image only: no audio, no downloads of tracks.
   1. Phones with Web Share Level 2 (navigator.canShare({files})): the song URL is copied for the Link sticker, then the PNG is shared as a file
      (share sheet -> Instagram -> Story). If the browser drops the tap while the image loads, a small sheet asks for one more tap.
   2. Everywhere else: the PNG downloads, the song URL is copied, and a short toast explains the next step. */
(function () {
  var btns = [].slice.call(document.querySelectorAll('[data-story-share]'));
  if (!btns.length) return;
  var cache = {}, toastEl, toastT, sheet;

  function fileName(slug) { return 'robbie-p-' + slug + '-story.png'; }
  function load(b) {
    var src = b.getAttribute('data-story-img');
    if (!cache[src]) cache[src] = fetch(src, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('story image ' + r.status); return r.blob();
    }).then(function (bl) { return new File([bl], fileName(b.getAttribute('data-story-share')), { type: 'image/png' }); })
      .catch(function (e) { delete cache[src]; throw e; });
    return cache[src];
  }
  function canShareFiles() {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })] })); }
    catch (e) { return false; }
  }
  function copy(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { return true; }, legacy);
    } catch (e) {}
    return Promise.resolve(legacy());
    function legacy() {
      try { var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;top:-100px;opacity:0';
        document.body.appendChild(t); t.select(); var ok = document.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
    }
  }
  function toast(html, ms) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'ss-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = html; toastEl.classList.add('on'); clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 6000);
  }
  function short(u) { return u.replace(/^https?:\/\//, ''); }
  function download(b) {
    var a = document.createElement('a'); a.href = b.getAttribute('data-story-img'); a.download = fileName(b.getAttribute('data-story-share'));
    a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  }
  function fallback(b, copied) {
    download(b);
    copied.then(function (ok) {
      var u = b.getAttribute('data-story-url');
      toast(ok ? 'Image saved. Add it to your Story and paste the link sticker.'
               : 'Image saved. Add it to your Story and add a link sticker:<small>' + short(u) + '</small>');
    });
  }
  function share(b, file) {
    return navigator.share({ files: [file], title: b.getAttribute('data-story-title') + ' · ROBBIE P' });
  }
  function done() { toast('Link copied. In Instagram, add a <b>Link sticker</b> and paste it.', 5000); }
  function openSheet(b, file) {
    if (!sheet) {
      sheet = document.createElement('div'); sheet.className = 'ss-sheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Share to Story');
      sheet.innerHTML = '<div class="ss-card"><button type="button" class="ss-x" aria-label="Close">&#10005;</button><span class="label">Your Story image is ready</span><img alt="Story image preview">' +
        '<div class="ss-row"><button type="button" class="btn ss-go">Share</button><button type="button" class="btn ghost ss-save">Save image</button></div></div>';
      document.body.appendChild(sheet);
      sheet.addEventListener('click', function (e) { if (e.target === sheet || e.target.closest('.ss-x')) sheet.hidden = true; });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') sheet.hidden = true; });
    }
    sheet.querySelector('img').src = b.getAttribute('data-story-img');
    sheet.querySelector('.ss-go').onclick = function () { copy(b.getAttribute('data-story-url')); share(b, file).then(function () { sheet.hidden = true; done(); }, function (e) { if (e && e.name !== 'AbortError') { sheet.hidden = true; fallback(b, copy(b.getAttribute('data-story-url'))); } }); };
    sheet.querySelector('.ss-save').onclick = function () { sheet.hidden = true; fallback(b, copy(b.getAttribute('data-story-url'))); };
    sheet.hidden = false; sheet.querySelector('.ss-go').focus();
  }

  var filesOK = canShareFiles();
  btns.forEach(function (b) {
    // warm the image just before the tap so the share sheet can open inside the same user gesture
    if (filesOK) {
      ['pointerdown', 'touchstart', 'focus', 'mouseenter'].forEach(function (ev) { b.addEventListener(ev, function () { load(b).catch(function () {}); }, { passive: true }); });
      var sd = navigator.connection && navigator.connection.saveData;
      if ('IntersectionObserver' in window && !sd) {
        var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); load(b).catch(function () {}); } }, { rootMargin: '200px' });
        io.observe(b);
      }
    }
    b.addEventListener('click', function (e) {
      e.preventDefault();
      var copied = copy(b.getAttribute('data-story-url'));   // inside the tap: clipboard needs the gesture
      if (!filesOK) { fallback(b, copied); return; }
      b.setAttribute('aria-busy', 'true');
      load(b).then(function (file) {
        if (!navigator.canShare({ files: [file] })) { fallback(b, copied); return; }
        return share(b, file).then(done, function (err) {
          if (err && err.name === 'AbortError') return;            // fan closed the share sheet
          if (err && err.name === 'NotAllowedError') { openSheet(b, file); return; }  // tap expired while loading: one more tap
          fallback(b, copied);
        });
      }, function () { fallback(b, copied); }).then(function () { b.removeAttribute('aria-busy'); });
    });
  });
})();
