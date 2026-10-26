// หน้าปก: เลื่อนปุ่มไปทางขวาเพื่อเปิดแผนที่ (แบบหน้าจอล็อกของ iPhone)
(function () {
  var cover = document.getElementById('cover');
  var track = document.getElementById('unlock-track');
  var knob = document.getElementById('unlock-knob');
  var text = document.getElementById('unlock-text');
  if (!cover || !track || !knob) return;

  var PAD = 4;
  var x = 0;
  var drag = null;
  var done = false;

  function maxX() { return Math.max(0, track.clientWidth - knob.offsetWidth - PAD * 2); }

  function render() {
    knob.style.transform = 'translateX(' + x + 'px)';
    var p = maxX() ? x / maxX() : 0;
    text.style.opacity = String(1 - p);
  }

  function open() {
    if (done) return;
    done = true;
    cover.classList.add('is-open');
    setTimeout(function () { cover.remove(); }, 800);
  }

  knob.addEventListener('pointerdown', function (e) {
    if (done) return;
    drag = { startX: e.clientX, startPos: x };
    knob.setPointerCapture(e.pointerId);
  });
  knob.addEventListener('pointermove', function (e) {
    if (!drag) return;
    x = Math.min(maxX(), Math.max(0, drag.startPos + (e.clientX - drag.startX)));
    render();
  });
  function release() {
    if (!drag) return;
    drag = null;
    if (x >= maxX() * 0.85) {
      x = maxX();
      render();
      open();
    } else {
      x = 0;
      knob.style.transition = 'transform .25s ease';
      render();
      setTimeout(function () { knob.style.transition = ''; }, 260);
    }
  }
  knob.addEventListener('pointerup', release);
  knob.addEventListener('pointercancel', release);
  knob.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });
  window.addEventListener('resize', render);
  render();
})();
