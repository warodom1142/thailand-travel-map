const cfg = window.APP_CONFIG;

const CATEGORIES = [
  { name: 'ธรรมชาติ', color: '#2e7d32' },
  { name: 'วัด/ศาสนสถาน', color: '#f9a825' },
  { name: 'ร้านอาหาร/คาเฟ่', color: '#e64a19' },
  { name: 'ที่พัก', color: '#1565c0' },
  { name: 'ช้อปปิ้ง/ตลาด', color: '#8e24aa' },
  { name: 'กิจกรรม', color: '#00897b' },
  { name: 'อื่นๆ', color: '#546e7a' },
];

const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี',
  'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง',
  'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์',
  'นนทบุรี', 'นราธิวาส', 'น่าน', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี',
  'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี',
  'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยะลา', 'ยโสธร',
  'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี', 'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ',
  'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี',
  'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู',
  'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
];

const colorOf = name => (CATEGORIES.find(c => c.name === name) || CATEGORIES.at(-1)).color;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let places = [];
let pickMode = false;
let editing = null;
let keptPhotos = [];
let newFiles = [];

const form = $('form');
const dlg = $('dlg');
const panel = $('panel');

// ---------- map ----------
const map = L.map('map').setView(cfg.MAP_CENTER, cfg.MAP_ZOOM);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap',
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

// ---------- API ----------
function configured() {
  return cfg.API_URL && !cfg.API_URL.includes('PASTE_');
}

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
  setStatus('กำลังโหลดข้อมูล...');
  try {
    const { places: list } = await api('list');
    places = list;
    renderMarkers();
    if (fit && places.length) {
      map.fitBounds(places.map(p => [p.lat, p.lng]), { maxZoom: 10, padding: [40, 40] });
    }
  } catch (err) {
    setStatus('โหลดไม่สำเร็จ: ' + err.message, true);
  }
}

// ---------- rendering ----------
function setStatus(msg, isError = false) {
  const el = $('status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

function visiblePlaces() {
  const q = $('search').value.trim().toLowerCase();
  const cat = $('filter-category').value;
  return places.filter(p =>
    (!cat || p.category === cat) &&
    (!q || [p.name, p.province, p.description].some(v => String(v || '').toLowerCase().includes(q)))
  );
}

function renderMarkers() {
  markerLayer.clearLayers();
  const list = visiblePlaces();
  for (const p of list) {
    const icon = L.divIcon({
      className: '',
      html: `<div class="pin" style="background:${colorOf(p.category)}"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    L.marker([p.lat, p.lng], { icon })
      .bindTooltip(esc(p.name))
      .on('click', () => openDetail(p.id))
      .addTo(markerLayer);
  }
  setStatus(`แสดง ${list.length} จาก ${places.length} สถานที่`);
}

function openDetail(id) {
  const p = places.find(x => x.id === id);
  if (!p) return;
  panel.dataset.id = id;
  panel.innerHTML = `
    <button class="close" data-act="close" aria-label="ปิด">✕</button>
    <h2>${esc(p.name)}</h2>
    <p class="meta">
      <span class="tag" style="background:${colorOf(p.category)}">${esc(p.category)}</span>
      ${p.province ? `· ${esc(p.province)}` : ''}
      ${p.rating ? `· ${'⭐'.repeat(p.rating)}` : ''}
      ${p.visited ? `· ${esc(p.visited)}` : ''}
    </p>
    ${p.photos.length ? `<div class="gallery">${p.photos.map(u =>
      `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" loading="lazy" alt=""></a>`
    ).join('')}</div>` : ''}
    <p class="desc">${esc(p.description) || '<span class="muted">ไม่มีรายละเอียด</span>'}</p>
    <p><a href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">🧭 นำทางด้วย Google Maps</a></p>
    <div class="actions">
      <button data-act="edit">แก้ไข</button>
      <button data-act="delete" class="danger">ลบ</button>
    </div>`;
  panel.hidden = false;
  map.panTo([p.lat, p.lng]);
}

panel.addEventListener('click', e => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  const p = places.find(x => x.id === panel.dataset.id);
  if (act === 'close') panel.hidden = true;
  if (act === 'edit' && p) openForm(p);
  if (act === 'delete' && p) deletePlace(p);
});

// ---------- add-by-clicking-map ----------
function togglePick(on = !pickMode) {
  pickMode = on;
  document.body.classList.toggle('picking', on);
  $('btn-add').textContent = on ? '✕ ยกเลิก' : '+ เพิ่มสถานที่';
  if (on) setStatus('คลิกบนแผนที่เพื่อเลือกตำแหน่งสถานที่ (กด Esc เพื่อยกเลิก)');
  else renderMarkers();
}

map.on('click', e => {
  if (!pickMode) return;
  togglePick(false);
  openForm(null, e.latlng);
});

// ---------- form ----------
function initSelects() {
  const catOpts = CATEGORIES.map(c => `<option>${esc(c.name)}</option>`).join('');
  $('filter-category').insertAdjacentHTML('beforeend', catOpts);
  $('form-category').innerHTML = catOpts;
  $('provinces').innerHTML = PROVINCES.map(p => `<option value="${esc(p)}">`).join('');
  $('form-rating').innerHTML = [0, 1, 2, 3, 4, 5]
    .map(n => `<option value="${n}">${n ? '⭐'.repeat(n) : 'ยังไม่ให้'}</option>`).join('');
}

function openForm(place = null, latlng = null) {
  editing = place;
  form.reset();
  $('form-error').textContent = '';
  $('form-title').textContent = place ? 'แก้ไขสถานที่' : 'เพิ่มสถานที่ใหม่';

  const d = place || {
    name: '',
    category: CATEGORIES[0].name,
    province: '',
    rating: 0,
    visited: '',
    description: '',
    lat: latlng.lat.toFixed(6),
    lng: latlng.lng.toFixed(6),
  };
  for (const k of ['name', 'category', 'province', 'lat', 'lng', 'rating', 'visited', 'description']) {
    form.elements[k].value = d[k] ?? '';
  }

  keptPhotos = place ? [...place.photos] : [];
  newFiles = [];
  $('photos').value = '';
  renderThumbs();
  dlg.showModal();
}

function renderThumbs() {
  $('form-photos').innerHTML =
    keptPhotos.map((u, i) =>
      `<div class="thumb"><img src="${esc(u)}" alt=""><button type="button" data-kind="kept" data-i="${i}">✕</button></div>`
    ).join('') +
    newFiles.map((f, i) =>
      `<div class="thumb"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-kind="new" data-i="${i}">✕</button></div>`
    ).join('');
}

$('photos').addEventListener('change', e => {
  newFiles.push(...e.target.files);
  e.target.value = '';
  renderThumbs();
});

$('form-photos').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const i = Number(b.dataset.i);
  if (b.dataset.kind === 'kept') keptPhotos.splice(i, 1);
  else newFiles.splice(i, 1);
  renderThumbs();
});

$('btn-geo').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('เบราว์เซอร์นี้ไม่รองรับตำแหน่งที่ตั้ง');
  navigator.geolocation.getCurrentPosition(
    pos => {
      form.elements.lat.value = pos.coords.latitude.toFixed(6);
      form.elements.lng.value = pos.coords.longitude.toFixed(6);
    },
    () => alert('ไม่สามารถเข้าถึงตำแหน่งได้'),
    { enableHighAccuracy: true }
  );
});

$('btn-cancel').addEventListener('click', () => dlg.close());

function setSaving(on) {
  $('btn-save').disabled = on;
  $('btn-save').textContent = on ? 'กำลังบันทึก...' : 'บันทึก';
}

function showFormError(msg) {
  $('form-error').textContent = msg;
  setSaving(false);
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  const f = form.elements;
  const place = {
    name: f.name.value.trim(),
    category: f.category.value,
    province: f.province.value.trim(),
    lat: parseFloat(f.lat.value),
    lng: parseFloat(f.lng.value),
    rating: Number(f.rating.value),
    visited: f.visited.value,
    description: f.description.value.trim(),
    photos: [...keptPhotos],
  };
  if (!place.name) return showFormError('กรุณาใส่ชื่อสถานที่');
  if (Number.isNaN(place.lat) || Number.isNaN(place.lng)) return showFormError('กรุณาระบุละติจูด/ลองจิจูด');

  setSaving(true);
  try {
    for (const file of newFiles) {
      place.photos.push(await uploadPhoto(file));
    }
    if (editing) {
      place.id = editing.id;
      await api('update', { place }, true);
    } else {
      await api('add', { place }, true);
    }
    dlg.close();
    await loadPlaces();
  } catch (err) {
    showFormError(err.message);
  } finally {
    setSaving(false);
  }
});

// ---------- photos ----------
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

async function uploadPhoto(file) {
  const dataUrl = await resizeImage(file);
  const data = dataUrl.split(',')[1];
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { url } = await api('upload', { filename, mimeType: 'image/jpeg', data }, true);
  return url;
}

// ---------- delete ----------
async function deletePlace(p) {
  if (!confirm(`ลบ "${p.name}" ใช่ไหม?`)) return;
  try {
    await api('delete', { id: p.id }, true);
    panel.hidden = true;
    await loadPlaces();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- wiring ----------
$('btn-add').addEventListener('click', () => togglePick());
$('search').addEventListener('input', renderMarkers);
$('filter-category').addEventListener('change', renderMarkers);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && pickMode) togglePick(false);
});

initSelects();
if (!configured()) {
  setStatus('⚠️ ยังไม่ได้ตั้งค่า API_URL ใน config.js — ดูขั้นตอนใน README', true);
} else {
  loadPlaces(true);
}
