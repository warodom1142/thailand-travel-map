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
const myLayer = L.layerGroup().addTo(map);

// ---------- ตำแหน่งของฉัน ----------
// หาตำแหน่งจาก GPS แล้วเลื่อนแผนที่ไปที่นั่น พร้อมวาดจุดและวงความแม่นยำ
function locateMe(onFound) {
  if (!navigator.geolocation) {
    setStatus('เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง', true);
    return;
  }
  setStatus('กำลังหาตำแหน่งของคุณ…');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const acc = Math.round(pos.coords.accuracy || 0);
      myLayer.clearLayers();
      L.circle([ll.lat, ll.lng], { radius: acc, color: '#2563eb', weight: 1, fillColor: '#2563eb', fillOpacity: 0.12 }).addTo(myLayer);
      L.marker([ll.lat, ll.lng], {
        icon: L.divIcon({ className: 'me-wrap', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false,
      }).addTo(myLayer);
      map.setView([ll.lat, ll.lng], Math.max(map.getZoom(), 15));
      setStatus(`คุณอยู่ที่นี่ · ความแม่นยำประมาณ ${acc} ม.`);
      if (onFound) onFound(ll);
    },
    err => {
      const msg = err.code === 1
        ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง (เปิดในการตั้งค่าของเบราว์เซอร์)'
        : 'หาตำแหน่งไม่ได้ ลองอีกครั้งในที่ที่สัญญาณดีกว่า';
      setStatus(msg, true);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
  );
}

$('btn-locate').addEventListener('click', () => locateMe());
$('btn-pick-here').addEventListener('click', () => {
  locateMe(ll => {
    setPick(false);
    openEditor(null, { lat: ll.lat, lng: ll.lng });
  });
});

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

// สรุปทั้งหมด (ไม่นับตัวกรอง)
function renderSummary() {
  const provinces = new Set(places.map(p => p.province).filter(Boolean));
  $('summary').textContent = `📍 ${places.length} สถานที่ · ${provinces.size} จังหวัด`;
}

function renderMarkers() {
  renderSummary();
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

function syncSearchClear() {
  $('search-clear').hidden = !$('search').value;
}
$('search').addEventListener('input', e => {
  filter.query = e.target.value.trim();
  syncSearchClear();
  renderMarkers();
});
$('search-clear').addEventListener('click', () => {
  $('search').value = '';
  filter.query = '';
  syncSearchClear();
  renderMarkers();
});

function syncGmapClear() {
  $('gmap-clear').hidden = !$('f-gmap').value;
}
$('f-gmap').addEventListener('input', syncGmapClear);
$('gmap-clear').addEventListener('click', () => {
  $('f-gmap').value = '';
  syncGmapClear();
  $('gmap-hint').textContent = 'Plus Code, ลิงก์ Google Maps หรือ 18.79, 98.98';
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

// แสดงจังหวัดที่เลือกอยู่เป็นข้อความ ส่วนรายการเลือกจะซ่อนไว้จนกดเปลี่ยน
function renderProvince() {
  const v = form.elements.province.value;
  $('prov-name').textContent = v || 'ยังไม่ระบุ';
}

function showPicker(on) {
  $('prov-picker').hidden = !on;
}

function provinceFromAddress(a = {}) {
  const names = [a.state, a.province, a.county, a.region]
    .filter(Boolean)
    .map(s => s.replace(/^จังหวัด\s*/, '').trim());
  return names
    .map(n => PROVINCES.find(p => p === n || p.includes(n) || n.includes(p)))
    .find(Boolean);
}

// ตรวจจังหวัดจากพิกัด
// force = true จะเขียนทับจังหวัดเดิม (ใช้ตอนผู้ใช้ปักหมุดใหม่หรือค้นหาใหม่)
// provSeq กันไม่ให้การตรวจเก่า (ที่ตอบกลับช้า) ทับค่าที่ผู้ใช้เลือกเองหรือการตรวจครั้งใหม่
let provSeq = 0;

async function detectProvince(ll, force = false) {
  const seq = ++provSeq;
  $('prov-hint').textContent = 'กำลังตรวจจังหวัด…';
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&accept-language=th&lat=${ll.lat}&lon=${ll.lng}`;
    const j = await (await fetch(url)).json();
    if (seq !== provSeq) return;
    const hit = provinceFromAddress(j.address);
    if (!hit) {
      $('prov-hint').textContent = 'ตรวจจังหวัดจากพิกัดไม่ได้ เลือกเองได้';
      showPicker(true);
      return;
    }
    if (force || !form.elements.province.value) form.elements.province.value = hit;
    $('prov-hint').textContent = 'ตรวจจากพิกัดให้แล้ว';
    renderProvince();
    showPicker(false);
  } catch {
    $('prov-hint').textContent = 'ตรวจจังหวัดไม่สำเร็จ เลือกเองได้';
    showPicker(true);
  }
}

$('btn-prov-change').addEventListener('click', () => {
  showPicker(true);
});
$('f-prov').addEventListener('change', () => {
  provSeq++; // ยกเลิกการตรวจที่ยังค้างอยู่ เพราะผู้ใช้เลือกเองแล้ว
  renderProvince();
  $('prov-hint').textContent = 'เลือกเองแล้ว';
  showPicker(false);
});

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
  provSeq++;
  renderProvince();
  showPicker(!f.province.value);
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
  $('f-gmap').value = '';
  $('gmap-hint').textContent = 'Plus Code, ลิงก์ Google Maps หรือ 18.79, 98.98';
  show('editor');
  if (!place && latlng) detectProvince(latlng, true);
}

// ปิดฟอร์ม ถ้ามีรูปที่อัปโหลดค้างไว้ของฟอร์มนี้ จะถามก่อนลบ
async function closeEditor() {
  const p = loadPending();
  const editingId = editing?.id || null;
  if (p && p.editingId === editingId && Object.keys(p.uploads || {}).length) {
    if (!confirm('มีรูปที่อัปโหลดค้างไว้ ลบรูปเหล่านั้นแล้วปิดฟอร์มใช่หรือไม่?')) return;
    clearPending();
    await discardPending(p);
  }
  hide('editor');
}

$('btn-cancel').addEventListener('click', closeEditor);

// อ่านพิกัดจากข้อความที่วางมา (ลิงก์ Google Maps แบบเต็ม หรือพิกัดตรงๆ)
function parseGmapCoords(text) {
  const s = String(text || '').trim();
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // ลิงก์สถานที่ของ Google Maps
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,      // ...@lat,lng,zoom
    /[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?)(?:,|%2C)(-?\d+(?:\.\d+)?)/i,
    /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,   // วางพิกัดตรงๆ
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (!m) continue;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
  }
  return null;
}

// ---- Plus Code (Open Location Code) ----
const OLC_ALPHABET = '23456789CFGHJMPQRVWX';

// รหัสเต็ม 8 ตัวก่อน '+' แปลงเป็นพิกัดของกลางช่อง
function olcFull(code) {
  const c = String(code).toUpperCase().replace('+', '');
  const d = [...c].map(ch => OLC_ALPHABET.indexOf(ch));
  if (d.length < 2 || d.some(v => v < 0)) return null;
  let lat = -90, lng = -180, res = 20, cell = 20;
  for (let k = 0; k < 5 && 2 * k + 1 < d.length; k++) {
    lat += d[2 * k] * res;
    lng += d[2 * k + 1] * res;
    cell = res;
    res /= 20;
  }
  return { lat: lat + cell / 2, lng: lng + cell / 2 };
}

// รหัสสั้น (เช่น G8V7+RP) ต้องเติม 4 ตัวหน้าจากจุดอ้างอิง เลือกช่องที่ใกล้จุดอ้างอิงที่สุด
function olcNearest(shortCode, ref) {
  const code = String(shortCode).toUpperCase();
  const prefixOf = (lat0, lng0) => {
    const la = lat0 + 90, ln = lng0 + 180;
    return OLC_ALPHABET[Math.floor(la / 20)] + OLC_ALPHABET[Math.floor(ln / 20)]
      + OLC_ALPHABET[Math.floor(la % 20)] + OLC_ALPHABET[Math.floor(ln % 20)];
  };
  let best = null;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const p = olcFull(prefixOf(Math.floor(ref.lat) + dy, Math.floor(ref.lng) + dx) + code);
      if (!p) continue;
      const dist = Math.hypot(p.lat - ref.lat, p.lng - ref.lng);
      if (!best || dist < best.dist) best = { ...p, dist };
    }
  }
  return best ? { lat: best.lat, lng: best.lng } : null;
}

// หาพิกัดจาก Plus Code ในข้อความ (รหัสสั้นจะใช้ชื่อสถานที่ต่อท้ายเป็นจุดอ้างอิง)
async function resolvePlusCode(text) {
  const m = /([23456789CFGHJMPQRVWX]{2,8}\+[23456789CFGHJMPQRVWX]{0,3})/i.exec(text);
  if (!m) return null;
  const code = m[1].toUpperCase();
  const digitsBeforePlus = code.split('+')[0].length;
  if (digitsBeforePlus >= 8) return olcFull(code);
  if (digitsBeforePlus !== 4) return null;

  const c = map.getCenter();
  let ref = { lat: c.lat, lng: c.lng };
  const place = text.slice(m.index + m[1].length).trim();
  if (place) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycode=th&accept-language=th&limit=1&q=${encodeURIComponent(place)}`;
      const list = await (await fetch(url)).json();
      if (Array.isArray(list) && list[0]) ref = { lat: Number(list[0].lat), lng: Number(list[0].lon) };
    } catch { /* ใช้จุดกลางแผนที่แทน */ }
  }
  return olcNearest(code, ref);
}

// ใช้ได้ทั้งตอนปักหมุดสถานที่ใหม่ (แถบปักหมุด) และตอนแก้ไขสถานที่ (ในฟอร์ม)
const COORD_SOURCES = {
  pick: { input: 'f-gmap', hint: 'gmap-hint' },
  edit: { input: 'ed-gmap', hint: 'ed-hint' },
};

async function applyCoords(src) {
  const { input, hint } = COORD_SOURCES[src];
  const text = $(input).value;
  const hintEl = $(hint);
  const ll = parseGmapCoords(text) || await resolvePlusCode(text);
  if (!ll) {
    hintEl.textContent = /goo\.gl|maps\.app/.test(text)
      ? 'ลิงก์สั้นอ่านพิกัดไม่ได้ ให้เปิดลิงก์ในเบราว์เซอร์ แล้วคัดลอก URL เต็มมาวาง'
      : 'หาพิกัดไม่เจอ ลองใส่ Plus Code เช่น G8V7+RP สวนผึ้ง หรือวางลิงก์เต็มจาก Google Maps';
    return;
  }
  $(input).value = '';
  if (input === 'f-gmap') syncGmapClear();

  if (isOpen('editor')) {
    // แก้ไขสถานที่เดิม: เปลี่ยนพิกัดในฟอร์มเลย
    form.elements.lat.value = ll.lat.toFixed(6);
    form.elements.lng.value = ll.lng.toFixed(6);
    hintEl.textContent = `ตั้งพิกัดใหม่แล้ว ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
    await detectProvince(ll, true);
  } else {
    // สถานที่ใหม่: เปิดฟอร์มที่ตำแหน่งนั้น
    setPick(false);
    openEditor(null, { lat: ll.lat, lng: ll.lng });
  }
}

function pasteCoords(src) {
  const { input, hint } = COORD_SOURCES[src];
  navigator.clipboard.readText().then(t => {
    $(input).value = String(t || '').trim();
    if (input === 'f-gmap') syncGmapClear();
    $(hint).textContent = 'วางแล้ว กด "ใช้พิกัด"';
  }).catch(() => {
    $(hint).textContent = 'วางจากคลิปบอร์ดไม่ได้ กดค้างในช่องแล้วเลือก "วาง"';
    $(input).focus();
  });
}

$('btn-gmap').addEventListener('click', () => applyCoords('pick'));
$('f-gmap').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); applyCoords('pick'); }
});
$('btn-paste').addEventListener('click', () => pasteCoords('pick'));

$('ed-apply').addEventListener('click', () => applyCoords('edit'));
$('ed-gmap').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); applyCoords('edit'); }
});
$('ed-paste').addEventListener('click', () => pasteCoords('edit'));

$('btn-geo').addEventListener('click', () => {
  navigator.geolocation?.getCurrentPosition(
    pos => {
      const ll = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      form.elements.lat.value = ll.lat.toFixed(6);
      form.elements.lng.value = ll.lng.toFixed(6);
      detectProvince(ll, true);
    },
    () => alert('ไม่สามารถเข้าถึงตำแหน่งได้'),
    { enableHighAccuracy: true }
  );
});

function setSaving(on) {
  $('btn-save').disabled = on;
  $('btn-save').textContent = on ? 'กำลังบันทึก' : 'บันทึก';
}

// progress = null ไม่แสดงแถบความคืบหน้า, ค่า 0–1 แสดงแถบพร้อมเปอร์เซ็นต์
function showBusy(text, sub = '', cancellable = false, progress = null) {
  $('busy-text').textContent = text;
  $('busy-sub').textContent = sub;
  $('busy-cancel').hidden = !cancellable;
  $('busy-progress').hidden = progress === null;
  if (progress !== null) setBusyProgress(progress);
  setKnob(0);
  $('busy').hidden = false;
}

function setBusyProgress(p) {
  const pct = Math.max(0, Math.min(100, Math.round(p * 100)));
  $('busy-bar').style.width = pct + '%';
  $('busy-pct').textContent = pct + '%';
}

function hideBusy() {
  $('busy').hidden = true;
}

function showAlert(msg, title = 'แจ้งเตือน') {
  $('alert-title').textContent = title;
  $('alert-msg').textContent = msg;
  $('alert').hidden = false;
}

$('alert-ok').addEventListener('click', () => { $('alert').hidden = true; });

function showFormError(msg) {
  $('form-error').textContent = msg;
  hideBusy();
  setSaving(false);
  showAlert(msg, 'บันทึกไม่สำเร็จ');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// อัปโหลดรูปหรือวิดีโอเข้าโฟลเดอร์ของทริป คืนค่า url และ folderId ใหม่
async function uploadFile(file, folderId, folderName, signal, onProgress = () => {}, filename = newFilename(file)) {
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
  const res = await postWithProgress('upload', { filename, mimeType, data, folderId, folderName }, onProgress, signal);
  return { url: res.url, folderId: res.folderId, fileId: res.fileId };
}

// ส่งข้อมูลพร้อมรายงานความคืบหน้า (fetch ทำไม่ได้ จึงใช้ XHR)
function postWithProgress(action, payload, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', cfg.API_URL);
    xhr.setRequestHeader('Content-Type', 'text/plain;charset=utf-8');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let j;
      try { j = JSON.parse(xhr.responseText); } catch { return reject(new Error('ตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง')); }
      if (j.ok) { onProgress(1); resolve(j); } else reject(new Error(j.error || 'เกิดข้อผิดพลาด'));
    };
    xhr.onerror = () => reject(new Error('อัปโหลดไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่'));
    xhr.onabort = () => { const e = new Error('ยกเลิกแล้ว'); e.name = 'AbortError'; reject(e); };
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(JSON.stringify({ action, secret: cfg.SECRET, ...payload }));
  });
}

// ---- งานอัปโหลดค้าง: เก็บไว้ในเบราว์เซอร์ เพื่อให้บันทึกต่อได้โดยไม่อัปโหลดซ้ำ ----
const PENDING_KEY = 'pendingUpload';
const fileSig = f => `${f.name}|${f.size}|${f.lastModified}`;

function loadPending() {
  try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || null; } catch { return null; }
}
function savePending(p) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(p)); } catch { /* ใช้งานต่อได้แม้เก็บไม่ได้ */ }
}
function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* ไม่เป็นไร */ }
}

// ลบรูปที่อัปโหลดค้างไว้ (และโฟลเดอร์ถ้าสร้างในรอบนี้) ลงถังขยะ
async function discardPending(p) {
  if (!p) return;
  const fileIds = Object.values(p.uploads || {}).map(u => u.fileId).filter(Boolean);
  const names = p.inflight ? [p.inflight] : [];
  if (!fileIds.length && !names.length && !p.folderCreated) return;
  try {
    await api('discard', { fileIds, names, folderId: p.folderId || '', deleteFolder: !!p.folderCreated }, true);
  } catch { /* ถ้าลบไม่สำเร็จ ไฟล์จะยังอยู่ใน Drive ให้ลบเองได้ */ }
}

// ขอให้จอไม่ดับระหว่างอัปโหลด (iOS 16.4 ขึ้นไป)
let wakeLock = null;
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
}
function releaseAwake() {
  try { wakeLock?.release(); } catch { /* ไม่เป็นไร */ }
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && $('btn-save').disabled) keepAwake();
});

// ---- ยกเลิกการอัปโหลดด้วยการเลื่อนปุ่ม ----
let upload = { ctl: null, cancelled: false };

class UploadCancelled extends Error {}

function cancelUpload() {
  upload.cancelled = true;
  upload.ctl?.abort();
}

const KNOB_MIN = 4;
const knob = $('slide-knob');
const track = $('slide-track');
const slideMax = () => track.clientWidth - knob.offsetWidth - KNOB_MIN * 2;

function setKnob(x) {
  knob.style.left = x + 'px';
}

let slide = null;
knob.addEventListener('pointerdown', e => {
  slide = { startX: e.clientX, startLeft: parseFloat(knob.style.left) || KNOB_MIN };
  knob.setPointerCapture(e.pointerId);
});
knob.addEventListener('pointermove', e => {
  if (!slide) return;
  const max = slideMax();
  setKnob(clamp(slide.startLeft + (e.clientX - slide.startX), KNOB_MIN, KNOB_MIN + max));
});
function endSlide() {
  if (!slide) return;
  const max = slideMax();
  const x = parseFloat(knob.style.left) || KNOB_MIN;
  slide = null;
  if (x >= KNOB_MIN + max * 0.9) {
    setKnob(KNOB_MIN + max);
    cancelUpload();
  } else {
    setKnob(KNOB_MIN);
  }
}
knob.addEventListener('pointerup', endSlide);
knob.addEventListener('pointercancel', endSlide);

// ชื่อไฟล์ที่ตั้งเองก่อนอัป ใช้ค้นหาไฟล์กำพร้าเพื่อลบได้แม้การอัปถูกยกเลิกกลางทาง
function newFilename(file) {
  const ext = isVideoFile(file) ? (file.name?.split('.').pop() || 'mp4') : 'jpg';
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
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
  await keepAwake();
  upload = { ctl: null, cancelled: false };
  let work = null;
  try {
    const photos = [...keptPhotos];
    // โฟลเดอร์ของทริปตั้งชื่อตาม "จังหวัด วันที่แรก" เช่น "เชียงใหม่ 2026-10-25"
    const folderName = `${f.province.value || 'ไม่ระบุจังหวัด'} ${dates[0] || 'ไม่ระบุวันที่'}`;
    const editingId = editing?.id || null;

    // ถ้ามีงานค้างของฟอร์มอื่น หรือชื่อโฟลเดอร์เปลี่ยน ให้ลบรูปค้างนั้นทิ้งแล้วเริ่มใหม่
    work = loadPending();
    if (work && (work.editingId !== editingId || work.folderName !== folderName)) {
      await discardPending(work);
      work = null;
    }
    if (!work) work = { editingId, folderName, folderId: editing?.folder_id || '', folderCreated: false, uploads: {} };
    savePending(work);

    const total = newFiles.length;
    for (let i = 0; i < total; i++) {
      const sig = fileSig(newFiles[i]);
      let up = work.uploads[sig];
      if (!up) {
        if (upload.cancelled) throw new UploadCancelled();
        const onProgress = f => showBusy(
          isVideoFile(newFiles[i]) ? 'กำลังอัปโหลดวิดีโอ' : 'กำลังอัปโหลดรูปภาพ',
          `${i + 1} จาก ${total} ไฟล์`, true, (i + f) / total
        );
        onProgress(0);
        upload.ctl = new AbortController();
        const wasEmpty = !work.folderId;
        const filename = newFilename(newFiles[i]);
        work.inflight = filename;
        savePending(work);
        const res = await uploadFile(newFiles[i], work.folderId, folderName, upload.ctl.signal, onProgress, filename);
        if (wasEmpty) work.folderCreated = true;
        work.folderId = res.folderId;
        up = { url: res.url, fileId: res.fileId };
        work.uploads[sig] = up;
        work.inflight = null;
        savePending(work); // บันทึกก่อนเช็กการยกเลิก เพื่อให้ลบไฟล์นี้ได้ด้วย
        if (upload.cancelled) throw new UploadCancelled();
      }
      photos.push(up.url);
    }
    showBusy('กำลังบันทึกข้อมูลทริป', 'อย่าเพิ่งปิดหน้านี้');
    const folderId = work.folderId;

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
    clearPending();
    showBusy('บันทึกแล้ว ✓');
    await sleep(500);
    hideBusy();
    setSaving(false);
    hide('editor');
    await loadPlaces();
  } catch (err) {
    if (upload.cancelled || err instanceof UploadCancelled || err.name === 'AbortError') {
      await discardPending(work);
      clearPending();
      return showFormError('ยกเลิกการอัปโหลดแล้ว รูปที่อัปไปแล้วถูกลบ');
    }
    const kept = work && Object.keys(work.uploads).length;
    showFormError(kept ? `${err.message} — รูปที่อัปโหลดแล้วถูกเก็บไว้ กดบันทึกอีกครั้งเพื่อทำต่อ` : err.message);
  } finally {
    releaseAwake();
  }
});

// ---------- keyboard ----------
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const alertBox = $('alert');
  if (alertBox && alertBox.hidden === false) { alertBox.hidden = true; return; }
  if (!lb.hidden) closeLightbox();
  else if (isOpen('editor')) closeEditor();
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
