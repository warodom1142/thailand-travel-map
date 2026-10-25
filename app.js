const cfg = window.APP_CONFIG;

const CATEGORIES = [
  { name: 'ธรรมชาติ', emoji: '🌿', color: '#22c55e' },
  { name: 'วัด/ศาสนสถาน', emoji: '🛕', color: '#f59e0b' },
  { name: 'ร้านอาหาร/คาเฟ่', emoji: '☕', color: '#f97316' },
  { name: 'ที่พัก', emoji: '🏨', color: '#3b82f6' },
  { name: 'ช้อปปิ้ง/ตลาด', emoji: '🛍️', color: '#a855f7' },
  { name: 'กิจกรรม', emoji: '🎯', color: '#14b8a6' },
  { name: 'อื่นๆ', emoji: '📍', color: '#64748b' },
];

const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี',
  'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง',
  'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์',
  'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี',
  'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี',
  'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยะลา', 'ยโสธร',
  'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ',
  'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี',
  'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู',
  'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
];

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const catOf = name => CATEGORIES.find(c => c.name === name) || CATEGORIES.at(-1);
const pad = n => String(n).padStart(2, '0');
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = iso => new Date(iso + 'T00:00:00')
  .toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
// แปลงค่าวันที่จากชีทให้เป็น yyyy-mm-dd; ค่าที่อ่านไม่ออกจะถูกทิ้ง ไม่แสดง Invalid Date
function toIso(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : isoOf(d);
}
const splitDates = v => [...new Set(String(v ?? '').split(',').map(toIso).filter(Boolean))].sort();
// วิดีโอเก็บเป็นลิงก์ preview ของ Google Drive (…/preview)
const isDriveVideo = url => String(url || '').includes('drive.google.com/file/d/');
const isVideoFile = f => String(f.type || '').startsWith('video/');
const MAX_VIDEO_MB = 50;

const tile = (url, kind, i, idx) =>
  `<div class="tile"><img src="${esc(url)}" data-i="${idx}" alt="">` +
  `<button type="button" class="tile-x" data-kind="${kind}" data-i="${i}" aria-label="ลบรูป">✕</button></div>`;

// ---------- state ----------
let places = [];
let filter = { category: '', query: '' };
let pickMode = false;
let editing = null;
let keptPhotos = [];
let newFiles = [];
let previewUrls = [];
let dates = [];
let rating = 0;
let detailId = null;

const form = $('form');

// ---------- map ----------
const map = L.map('map', { zoomControl: false }).setView(cfg.MAP_CENTER, cfg.MAP_ZOOM);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);
if (matchMedia('(min-width: 720px)').matches) L.control.zoom({ position: 'bottomleft' }).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

// ---------- sheets / lightbox ----------
function show(id) {
  const el = $(id);
  clearTimeout(el._t);
  el.hidden = false;
  void el.offsetWidth; // force reflow so the slide-in transition runs
  el.classList.add('open');
  document.body.classList.add('sheet-open');
}

function hide(id) {
  const el = $(id);
  el.classList.remove('open');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.hidden = true; }, 320);
  if (!document.querySelector('.sheet.open')) document.body.classList.remove('sheet-open');
}

const isOpen = id => $(id).classList.contains('open');
const lb = $('lightbox');
const lbTrack = $('lb-track');

const lbState = { urls: [], index: 0, zs: [], pts: new Map(), drag: null, pinch: null, dragX: 0, lastTap: 0 };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const curIsVideo = () => isDriveVideo(lbState.urls[lbState.index]);

// วางทุกรูปเรียงกันด้วย transform แล้วคำนวณตำแหน่งตาม index
function lbApply(animated) {
  const { index, dragX, zs, urls } = lbState;
  const w = lb.clientWidth;
  [...lbTrack.children].forEach((slide, i) => {
    slide.style.transition = animated ? 'transform .3s cubic-bezier(.2,.8,.2,1)' : 'none';
    slide.style.transform = `translate3d(${(i - index) * w + dragX}px,0,0)`;
    const z = zs[i];
    const img = slide.firstChild;
    if (img.tagName === 'IMG') {
      img.style.transition = animated ? 'transform .25s ease' : 'none';
      img.style.transform = `translate(${z.x}px,${z.y}px) scale(${z.s})`;
    }
  });
  $('lb-count').textContent = urls.length > 1 ? `${index + 1} / ${urls.length}` : '';
}

function openLightbox(urls, start = 0) {
  if (!urls.length) return;
  Object.assign(lbState, { urls, index: start, zs: urls.map(() => ({ s: 1, x: 0, y: 0 })), dragX: 0, pts: new Map(), drag: null, pinch: null });
  lbTrack.innerHTML = urls.map(u => (isDriveVideo(u)
    ? `<div class="lb-slide"><iframe src="${esc(u)}" allow="autoplay; fullscreen" allowfullscreen></iframe></div>`
    : `<div class="lb-slide"><img src="${esc(u)}" alt="" draggable="false"></div>`)).join('');
  lb.hidden = false;
  lbApply(false);
}

function closeLightbox() {
  lb.hidden = true;
  lbTrack.innerHTML = '';
}

function clampPan(z) {
  const maxX = (z.s - 1) * lb.clientWidth / 2;
  const maxY = (z.s - 1) * lb.clientHeight / 2;
  z.x = clamp(z.x, -maxX, maxX);
  z.y = clamp(z.y, -maxY, maxY);
}

function goTo(i) {
  lbState.index = clamp(i, 0, lbState.urls.length - 1);
  lbState.dragX = 0;
  lbApply(true);
}

function toggleZoom() {
  const z = lbState.zs[lbState.index];
  z.s = z.s > 1 ? 1 : 2.5;
  z.x = 0;
  z.y = 0;
  lbApply(true);
}

lb.addEventListener('pointerdown', e => {
  if (e.target.closest('.lb-close')) return;
  lbState.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const z = lbState.zs[lbState.index];
  if (lbState.pts.size === 1) {
    const now = Date.now();
    if (now - lbState.lastTap < 300 && !curIsVideo()) {
      lbState.lastTap = 0;
      lbState.drag = null;
      return toggleZoom();
    }
    lbState.lastTap = now;
    lbState.drag = { x: e.clientX, y: e.clientY, zx: z.x, zy: z.y, t: now };
  } else if (lbState.pts.size === 2 && !curIsVideo()) {
    const [a, b] = [...lbState.pts.values()];
    lbState.pinch = { d: dist(a, b), s: z.s };
    lbState.drag = null;
  }
});

lb.addEventListener('pointermove', e => {
  if (!lbState.pts.has(e.pointerId)) return;
  lbState.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const z = lbState.zs[lbState.index];
  if (lbState.pts.size === 2 && lbState.pinch && !curIsVideo()) {
    const [a, b] = [...lbState.pts.values()];
    z.s = clamp(lbState.pinch.s * dist(a, b) / lbState.pinch.d, 1, 5);
    clampPan(z);
    lbApply(false);
  } else if (lbState.pts.size === 1 && lbState.drag) {
    const dx = e.clientX - lbState.drag.x;
    const dy = e.clientY - lbState.drag.y;
    if (z.s > 1 && !curIsVideo()) {
      z.x = lbState.drag.zx + dx;
      z.y = lbState.drag.zy + dy;
      clampPan(z);
    } else {
      lbState.dragX = dx;
    }
    lbApply(false);
  }
});

function endPointer(e) {
  if (!lbState.pts.has(e.pointerId)) return;
  const drag = lbState.drag;
  lbState.pts.delete(e.pointerId);
  if (lbState.pts.size < 2) lbState.pinch = null;
  if (lbState.pts.size > 0) return;

  const z = lbState.zs[lbState.index];
  if (z.s <= 1) {
    z.s = 1;
    z.x = 0;
    z.y = 0;
  }
  if (drag && z.s === 1) {
    const dx = lbState.dragX;
    const w = lb.clientWidth;
    const fast = Date.now() - drag.t < 300 && Math.abs(dx) > 40;
    if (dx < -w * 0.2 || (fast && dx < 0)) goTo(lbState.index + 1);
    else if (dx > w * 0.2 || (fast && dx > 0)) goTo(lbState.index - 1);
    else { lbState.dragX = 0; lbApply(true); }
  } else {
    lbApply(true);
  }
  lbState.drag = null;
}
lb.addEventListener('pointerup', endPointer);
lb.addEventListener('pointercancel', endPointer);

$('lb-close').addEventListener('click', closeLightbox);

// ---------- API ----------
const configured = () => cfg.API_URL && !cfg.API_URL.includes('PASTE_');

async function api(action, payload = {}, write = false) {
  if (!configured()) throw new Error('ยังไม่ได้ตั้งค่า API_URL ใน config.js');
  const res = write
    ? await fetch(cfg.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, secret: cfg.SECRET, ...payload }),
      })
    : await fetch(`${cfg.API_URL}?action=${action}`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
  return json;
}

async function loadPlaces(fit = false) {
  setStatus('กำลังโหลด…');
  try {
    const { places: list } = await api('list');
    places = list;
    renderMarkers();
    if (fit && places.length) {
      map.fitBounds(places.map(p => [p.lat, p.lng]), { maxZoom: 10, padding: [60, 60] });
    }
  } catch (err) {
    setStatus('โหลดไม่สำเร็จ: ' + err.message, true);
  }
}

// ---------- status / filters / markers ----------
function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

function visiblePlaces() {
  const q = filter.query.toLowerCase();
  return places.filter(p =>
    (!filter.category || p.category === filter.category) &&
    (!q || [p.name, p.province, p.description].some(v => String(v || '').toLowerCase().includes(q)))
  );
}

function renderChips() {
  const all = [
    { name: '', label: 'ทั้งหมด', emoji: '✨', color: '#111827' },
    ...CATEGORIES.map(c => ({ ...c, label: c.name })),
  ];
  $('chips').innerHTML = all.map(c =>
    `<button type="button" class="chip${filter.category === c.name ? ' on' : ''}" data-cat="${esc(c.name)}" style="--c:${c.color}">${c.emoji} ${esc(c.label)}</button>`
  ).join('');
}

function renderMarkers() {
  markerLayer.clearLayers();
  const list = visiblePlaces();
  for (const p of list) {
    const c = catOf(p.category);
    L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        className: 'pin-wrap',
        html: `<div class="pin" style="--c:${c.color}">${c.emoji}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      }),
      title: p.name,
    }).on('click', () => openDetail(p.id)).addTo(markerLayer);
  }
  const filtered = filter.category || filter.query;
  setStatus(`${list.length} สถานที่${filtered ? ` จาก ${places.length}` : ''}`);
}

$('chips').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  filter.category = b.dataset.cat;
  renderChips();
  renderMarkers();
});

$('search').addEventListener('input', e => {
  filter.query = e.target.value.trim();
  renderMarkers();
});

// ---------- detail ----------
// ภาพรวมรูปแบบคอลลาจ: 1 / 2 / 3 / 4+ รูป พร้อมจำนวนรูปทั้งหมด
function collageHtml(photos, c) {
  const n = photos.length;
  if (!n) return `<div class="hero-empty" style="--c:${c.color}">${c.emoji}</div>`;
  const layout = ['', 'one', 'two', 'three'][n] || 'four';
  const cells = photos.slice(0, 4).map((u, i) => {
    const more = i === 3 && n > 4 ? `<span class="more">+${n - 4}</span>` : '';
    if (isDriveVideo(u)) {
      return `<button type="button" class="cell video-cell" data-i="${i}"><span class="play">▶</span>${more}</button>`;
    }
    return `<button type="button" class="cell" data-i="${i}"><img src="${esc(u)}" loading="lazy" alt="">${more}</button>`;
  }).join('');
  return `<div class="collage ${layout}">${cells}<span class="photo-count">📷 ${n} รูป</span></div>`;
}

function openDetail(id) {
  const p = places.find(x => x.id === id);
  if (!p) return;
  detailId = id;
  const c = catOf(p.category);
  const days = splitDates(p.visited);

  const hero = collageHtml(p.photos, c);

  const meta = [p.province, p.rating ? '⭐'.repeat(p.rating) : ''].filter(Boolean).map(esc).join(' · ');

  $('detail-body').innerHTML = `
    ${hero}
    <div class="detail-pad">
      <span class="badge" style="--c:${c.color}">${c.emoji} ${esc(c.name)}</span>
      <h2>${esc(p.name)}</h2>
      ${meta ? `<p class="sub">${meta}</p>` : ''}
      ${days.length ? `<p class="when">📅 ${esc(fmtRange(days))}${days.length > 1 ? ` · ${days.length} วัน` : ''}</p>` : ''}
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
      <div class="detail-actions">
        <a class="btn primary" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" rel="noopener">🧭 นำทาง</a>
        <button class="btn" type="button" data-act="edit">✏️ แก้ไข</button>
        <button class="btn" type="button" data-act="delete" aria-label="ลบ">🗑️</button>
      </div>
    </div>`;
  show('detail');
}

$('detail').addEventListener('click', e => {
  const p = places.find(x => x.id === detailId);
  const cell = e.target.closest('.cell');
  if (cell && p) return openLightbox(p.photos, Number(cell.dataset.i));

  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') hide('detail');
  if (act === 'edit' && p) { openEditor(p); hide('detail'); }
  if (act === 'delete' && p) removePlace(p);
});

async function removePlace(p) {
  if (!confirm(`ลบ "${p.name}" ออกจากรายการ?\n(รูปและวิดีโอในไดรฟ์จะยังอยู่)`)) return;
  try {
    await api('delete', { id: p.id }, true);
    hide('detail');
    await loadPlaces();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- pick on map ----------
function setPick(on) {
  pickMode = on;
  document.body.classList.toggle('picking', on);
  $('pick-banner').hidden = !on;
  $('btn-add').classList.toggle('active', on);
  $('btn-add').textContent = on ? '×' : '+';
}

$('btn-add').addEventListener('click', () => {
  if (pickMode) return setPick(false);
  hide('detail');
  setPick(true);
});
$('btn-pick-cancel').addEventListener('click', () => setPick(false));

map.on('click', e => {
  if (!pickMode) return;
  setPick(false);
  openEditor(null, e.latlng);
});

// ---------- editor ----------
function setCategory(name) {
  form.elements.category.value = name;
  const c = catOf(name);
  $('form-cats').innerHTML = CATEGORIES.map(x =>
    `<button type="button" class="cat-opt${x.name === name ? ' on' : ''}" data-cat="${esc(x.name)}" style="--c:${x.color}">${x.emoji} ${esc(x.name)}</button>`
  ).join('');
  return c;
}

$('form-cats').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]');
  if (b) setCategory(b.dataset.cat);
});

function renderStars() {
  $('form-stars').innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" class="star${n <= rating ? ' on' : ''}" data-n="${n}" aria-label="${n} ดาว">★</button>`
  ).join('');
}

$('form-stars').addEventListener('click', e => {
  const b = e.target.closest('[data-n]');
  if (!b) return;
  const n = Number(b.dataset.n);
  rating = rating === n ? 0 : n;
  renderStars();
});

function rangeDays(a, b) {
  const out = [];
  const d = new Date(a + 'T00:00:00');
  const end = new Date(b + 'T00:00:00');
  for (; d <= end; d.setDate(d.getDate() + 1)) out.push(isoOf(d));
  return out;
}

// ---------- วันที่ไป ----------
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// แสดงวันที่แบบ "9–12 ต.ค. 69" (ปี พ.ศ. 2 หลัก)
function fmtRange(list) {
  if (!list.length) return '';
  const ds = list.map(d => new Date(d + 'T00:00:00'));
  const first = ds[0];
  const last = ds.at(-1);
  const contiguous = ds.length === Math.round((last - first) / 86400000) + 1;
  if (!contiguous) return list.map(fmtDate).join(', ');
  const yy = d => String((d.getFullYear() + 543) % 100).padStart(2, '0');
  const mon = d => TH_MONTHS[d.getMonth()];
  if (ds.length === 1) return `${first.getDate()} ${mon(first)} ${yy(first)}`;
  if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
    return `${first.getDate()}–${last.getDate()} ${mon(last)} ${yy(last)}`;
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${first.getDate()} ${mon(first)} – ${last.getDate()} ${mon(last)} ${yy(last)}`;
  }
  return `${first.getDate()} ${mon(first)} ${yy(first)} – ${last.getDate()} ${mon(last)} ${yy(last)}`;
}

// true เมื่อผู้ใช้แก้ช่องวันที่เอง (ถ้ายังไม่แก้ วันเดิมจะถูกเก็บไว้ตามเดิม)
let dateTouched = false;
let dateError = '';

function renderDates() {
  $('date-summary').textContent = fmtRange(dates) || 'ยังไม่ได้เลือกวัน';
}

function syncDateInputs() {
  $('date-from').value = dates[0] || '';
  $('date-to').value = dates.at(-1) || '';
}

// อ่านช่องจาก–ถึง แล้วสร้างรายการวัน (ถ้าไม่กรอกถึง = วันเดียว)
function onDateChange(source) {
  dateTouched = true;
  const from = $('date-from').value;
  // เปลี่ยน "จาก" ให้ไปอยู่หลัง "ถึง" เดิม → ขยับ "ถึง" ตามอัตโนมัติ
  if (source === 'from' && from && $('date-to').value && $('date-to').value < from) {
    $('date-to').value = from;
  }
  const to = $('date-to').value || from;
  if (from && to < from) {
    dateError = 'ถึงวันที่ต้องไม่ก่อนวันที่ไป';
    $('date-error').textContent = dateError;
    return;
  }
  dateError = '';
  $('date-error').textContent = '';
  dates = from ? rangeDays(from, to) : [];
  renderDates();
}

$('date-from').addEventListener('change', () => onDateChange('from'));
$('date-to').addEventListener('change', () => onDateChange('to'));
$('btn-clear-date').addEventListener('click', () => {
  dates = [];
  dateTouched = false;
  dateError = '';
  $('date-error').textContent = '';
  syncDateInputs();
  renderDates();
});

function renderPhotos() {
  previewUrls = [...keptPhotos];
  const kept = keptPhotos.map((u, i) => tile(u, 'kept', i, i)).join('');
  const added = newFiles.map((f, i) => {
    if (isVideoFile(f)) {
      return `<div class="tile video-tile"><span>🎬 วิดีโอ</span><button type="button" class="tile-x" data-kind="new" data-i="${i}" aria-label="ลบ">✕</button></div>`;
    }
    const url = URL.createObjectURL(f);
    previewUrls.push(url);
    return tile(url, 'new', i, previewUrls.length - 1);
  }).join('');
  $('photo-grid').innerHTML =
    kept + added + `<label class="add-tile">+<input type="file" accept="image/*,video/*" multiple class="sr-only"></label>`;
}

$('photo-grid').addEventListener('change', e => {
  if (e.target.type !== 'file') return;
  newFiles.push(...e.target.files);
  e.target.value = '';
  renderPhotos();
});

$('photo-grid').addEventListener('click', e => {
  const x = e.target.closest('.tile-x');
  if (x) {
    const i = Number(x.dataset.i);
    if (x.dataset.kind === 'kept') keptPhotos.splice(i, 1);
    else newFiles.splice(i, 1);
    return renderPhotos();
  }
  const img = e.target.closest('.tile img');
  if (img) openLightbox(previewUrls, Number(img.dataset.i));
});

async function detectProvince(ll) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&accept-language=th&lat=${ll.lat}&lon=${ll.lng}`;
    const j = await (await fetch(url)).json();
    const a = j.address || {};
    const names = [a.state, a.province, a.county, a.region]
      .filter(Boolean)
      .map(s => s.replace(/^จังหวัด\s*/, '').trim());
    const hit = names
      .map(n => PROVINCES.find(p => p === n || p.includes(n) || n.includes(p)))
      .find(Boolean);
    if (!hit) return;
    if (!form.elements.province.value) form.elements.province.value = hit;
    $('prov-hint').textContent = 'ตรวจจากพิกัดให้แล้ว';
  } catch {
    // ไม่ได้ตรวจจังหวัดอัตโนมัติ ผู้ใช้เลือกเองได้
  }
}

function openEditor(place = null, latlng = null) {
  editing = place;
  const f = form.elements;
  $('form-title').textContent = place ? 'แก้ไขสถานที่' : 'สถานที่ใหม่';

  f.name.value = place?.name || '';
  f.description.value = place?.description || '';
  f.lat.value = place ? place.lat : latlng ? latlng.lat.toFixed(6) : '';
  f.lng.value = place ? place.lng : latlng ? latlng.lng.toFixed(6) : '';
  f.province.value = place?.province || '';
  $('prov-hint').textContent = '';
  setCategory(place?.category || CATEGORIES[0].name);

  rating = place?.rating || 0;
  renderStars();

  dates = splitDates(place?.visited);
  dateTouched = false;
  dateError = '';
  syncDateInputs();
  renderDates();

  keptPhotos = place ? [...place.photos] : [];
  newFiles = [];
  renderPhotos();

  $('form-error').textContent = '';
  show('editor');
  if (!place && latlng) detectProvince(latlng);
}

$('btn-cancel').addEventListener('click', () => hide('editor'));

$('btn-geo').addEventListener('click', () => {
  navigator.geolocation?.getCurrentPosition(
    pos => {
      const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      form.elements.lat.value = ll.lat.toFixed(6);
      form.elements.lng.value = ll.lng.toFixed(6);
      detectProvince(ll);
    },
    () => alert('ไม่สามารถเข้าถึงตำแหน่งได้'),
    { enableHighAccuracy: true }
  );
});

function setSaving(on) {
  $('btn-save').disabled = on;
  $('btn-save').textContent = on ? 'กำลังบันทึก' : 'บันทึก';
}

function showBusy(text, sub = '') {
  $('busy-text').textContent = text;
  $('busy-sub').textContent = sub;
  $('busy').hidden = false;
}

function hideBusy() {
  $('busy').hidden = true;
}

function showFormError(msg) {
  $('form-error').textContent = msg;
  hideBusy();
  setSaving(false);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// อัปโหลดรูปหรือวิดีโอเข้าโฟลเดอร์ของทริป คืนค่า url และ folderId ใหม่
async function uploadFile(file, folderId, folderName) {
  let data;
  let mimeType;
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`วิดีโอใหญ่เกิน ${MAX_VIDEO_MB} MB`);
    data = await readAsBase64(file);
    mimeType = file.type || 'video/mp4';
  } else {
    const dataUrl = await resizeImage(file);
    data = dataUrl.split(',')[1];
    mimeType = 'image/jpeg';
  }
  const ext = isVideoFile(file) ? (file.name?.split('.').pop() || 'mp4') : 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await api('upload', { filename, mimeType, data, folderId, folderName }, true);
  return { url: res.url, folderId: res.folderId };
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('อ่านไฟล์วิดีโอไม่ได้'));
    r.readAsDataURL(file);
  });
}

function resizeImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('เปิดรูปภาพไม่ได้: ' + file.name));
    img.src = src;
  });
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const f = form.elements;
  const name = f.name.value.trim();
  const lat = parseFloat(f.lat.value);
  const lng = parseFloat(f.lng.value);

  if (!name) return showFormError('กรุณาใส่ชื่อสถานที่');
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return showFormError('ยังไม่มีพิกัด — แตะบนแผนที่เพื่อปักหมุด หรือเปิดหัวข้อพิกัดแล้วกรอกเอง');
  }

  if (dateError) {
    $('date-error').textContent = dateError;
    return showFormError('กรุณาแก้วันที่ให้ถูกต้องก่อนบันทึก');
  }

  setSaving(true);
  showBusy('กำลังเตรียมบันทึก…');
  try {
    const photos = [...keptPhotos];
    // โฟลเดอร์ของทริปตั้งชื่อตาม "จังหวัด วันที่แรก" เช่น "เชียงใหม่ 2026-10-25"
    let folderId = editing?.folder_id || '';
    const folderName = `${f.province.value || 'ไม่ระบุจังหวัด'} ${dates[0] || 'ไม่ระบุวันที่'}`;
    for (let i = 0; i < newFiles.length; i++) {
      showBusy(isVideoFile(newFiles[i]) ? 'กำลังอัปโหลดวิดีโอ' : 'กำลังอัปโหลดรูปภาพ', `${i + 1} จาก ${newFiles.length} ไฟล์`);
      const up = await uploadFile(newFiles[i], folderId, folderName);
      folderId = up.folderId;
      photos.push(up.url);
    }
    showBusy('กำลังบันทึกข้อมูลทริป', 'อย่าเพิ่งปิดหน้านี้');

    const place = {
      name,
      category: f.category.value,
      province: f.province.value,
      lat,
      lng,
      rating,
      visited: dates.join(','),
      folder_id: folderId,
      folder_name: folderName,
      description: f.description.value.trim(),
      photos,
    };
    if (editing) {
      place.id = editing.id;
      await api('update', { place }, true);
    } else {
      await api('add', { place }, true);
    }
    showBusy('บันทึกแล้ว ✓');
    await sleep(500);
    hideBusy();
    setSaving(false);
    hide('editor');
    await loadPlaces();
  } catch (err) {
    showFormError(err.message);
  }
});

// ---------- keyboard ----------
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!lb.hidden) closeLightbox();
  else if (isOpen('editor')) hide('editor');
  else if (pickMode) setPick(false);
  else if (isOpen('detail')) hide('detail');
});

// ---------- init ----------
$('f-prov').insertAdjacentHTML('beforeend', PROVINCES.map(p => `<option>${esc(p)}</option>`).join(''));
renderChips();

if (!configured()) {
  setStatus('⚠️ ยังไม่ได้ตั้งค่า API_URL ใน config.js', true);
} else {
  loadPlaces(true);
}
