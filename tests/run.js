// ทดสอบจำลองโดยไม่ใช้เบราว์เซอร์ (รันด้วย: node tests/run.js)
// - Code.gs ทำงานจริงบน Google Sheet จำลอง (ชีทจะแปลง "2026-10-25" เป็นวันที่เอง เหมือนของจริง)
// - app.js ทำงานจริงบน DOM จำลอง โดย fetch จะส่งไปหา Code.gs จริง
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
let failed = 0;
function check(name, cond, info = '') {
  if (cond) {
    passed++;
    console.log('  ✓', name);
  } else {
    failed++;
    console.log('  ✗', name, info ? `— ${info}` : '');
  }
}
const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
const flush = async () => { for (let i = 0; i < 6; i++) await sleep(0); };

// ---------- Google Sheet จำลอง ----------
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function makeSpreadsheet(tz = 'Asia/Bangkok') {
  const sheets = {};
  function makeSheet(name) {
    const grid = [];
    const fmt = {};
    // จำลองการแปลงค่าของ Google Sheet: ถ้าไม่ได้ตั้งเป็นข้อความ จะแปลงรูปแบบวันที่เป็นวันที่
    const coerce = (v, r, c) => {
      if (fmt[`${r},${c}`] === '@') return v == null ? '' : String(v);
      if (typeof v === 'string' && DATE_RE.test(v)) {
        const [y, m, d] = v.split('-').map(Number);
        return new Date(y, m - 1, d);
      }
      return v;
    };
    const cellRange = (r, c, nr, nc) => ({
      getValues: () => Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) => ((grid[r - 1 + i] || [])[c - 1 + j] ?? ''))),
      getValue: () => ((grid[r - 1] || [])[c - 1] ?? ''),
      setValue: v => { grid[r - 1] = grid[r - 1] || []; grid[r - 1][c - 1] = v; },
      setValues: vals => vals.forEach((row, i) => {
        const ri = r + i - 1;
        grid[ri] = grid[ri] || [];
        row.forEach((v, j) => { grid[ri][c - 1 + j] = coerce(v, r + i, c + j); });
      }),
      setNumberFormat: f => {
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) fmt[`${r + i},${c + j}`] = f;
      },
    });
    return {
      name,
      _grid: grid,
      getLastRow: () => grid.length,
      getDataRange: () => ({ getValues: () => (grid.length ? grid.map(r => [...r]) : [['']]) }),
      getRange: (r, c, nr = 1, nc = 1) => cellRange(r, c, nr, nc),
      appendRow: row => cellRange(grid.length + 1, 1, 1, row.length).setValues([row]),
      deleteRow: r => grid.splice(r - 1, 1),
      setFrozenRows() {},
    };
  }
  return {
    _sheets: sheets,
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = makeSheet(n)),
    getSpreadsheetTimeZone: () => tz,
  };
}

// ---------- โหลด Code.gs (ใช้ SECRET เดียวกับ config.js) ----------
function loadCodeGs(ss) {
  const src = read('apps-script/Code.gs')
    .replace("const SECRET = 'change-me';", "const SECRET = '1142';")
    .replace(/const PHOTO_FOLDER_ID = '[^']*'/, "const PHOTO_FOLDER_ID = 'FOLDER_TEST'");
  let fileSeq = 0;
  let folderSeq = 0;
  const fileIndex = {};
  const drive = { folders: [], files: fileIndex };
  const makeFolder = (id, name) => {
    const f = {
      id, name, files: [], trashed: false,
      getName: () => f.name,
      setName: n => { f.name = n; },
      getId: () => f.id,
      isTrashed: () => f.trashed,
      setTrashed: v => { f.trashed = v; },
      getFilesByName: n => {
        const list = f.files.filter(x => x.name === n && !x.trashed);
        let i = 0;
        return { hasNext: () => i < list.length, next: () => list[i++] };
      },
      createFile: blob => {
        const fid = 'FILE' + (++fileSeq);
        const fo = { id: fid, name: blob.name, blob, trashed: false, setTrashed(v) { fo.trashed = v; } };
        f.files.push(fo);
        fileIndex[fid] = fo;
        return { getId: () => fid, setSharing() {} };
      },
      createFolder: n => {
        const sub = makeFolder('F' + (++folderSeq), n);
        drive.folders.push(sub);
        return sub;
      },
    };
    return f;
  };
  const rootFolder = makeFolder('FOLDER_TEST', 'root');
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ContentService: {
      createTextOutput: s => ({ s, setMimeType() { return this; } }),
      MimeType: { JSON: 'json' },
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      base64Decode: s => Buffer.from(s, 'base64'),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: d => {
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      },
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'anyone' },
      Permission: { VIEW: 'view' },
      searchFiles: q => {
        const m = /title = "([^"]+)"/.exec(q);
        const list = Object.values(fileIndex).filter(x => x.name === m[1] && !x.trashed);
        let i = 0;
        return { hasNext: () => i < list.length, next: () => list[i++] };
      },
      getFileById: id => {
        const x = fileIndex[id];
        if (!x) throw new Error('File not found: ' + id);
        return x;
      },
      getFolderById: id => {
        if (id === 'FOLDER_TEST') return rootFolder;
        const f = drive.folders.find(x => x.id === id);
        if (!f) throw new Error('Folder not found: ' + id);
        return f;
      },
    },
    Date, JSON, Math, Number, String, Array, Object, Error, RegExp, Buffer, crypto,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { ctx, drive };
}

// ---------- DOM จำลองสำหรับ app.js ----------
function loadApp(gas) {
  const store = {};
  // ทุกครั้งที่อ้างถึง id จะได้ element เสมอ (เหมือน $('id') ในหน้าจริง)
  const els = new Proxy(store, { get: (t, id) => (t[id] ||= mk(String(id))) });
  const docL = {};
  const mapH = {};
  const alerts = [];
  const confirmAnswer = { v: true };
  const failNext = { v: null }; // ชื่อ action ที่จะให้ล้มเหลวครั้งเดียว
  const storage = new Map();
  const fakeStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: k => { storage.delete(k); },
  };
  const nominatimReply = { v: { address: {} } };

  const mkClassList = () => {
    const s = new Set();
    return {
      add: (...c) => c.forEach(x => s.add(x)),
      remove: (...c) => c.forEach(x => s.delete(x)),
      toggle: (c, f) => { const on = f ?? !s.has(c); on ? s.add(c) : s.delete(c); return on; },
      contains: c => s.has(c),
    };
  };
  const mk = id => ({
    id,
    value: '',
    checked: false,
    hidden: false,
    disabled: false,
    innerHTML: '',
    textContent: '',
    type: '',
    dataset: {},
    scrollLeft: 0,
    clientWidth: 400,
    offsetWidth: 1,
    children: [],
    style: {},
    classList: mkClassList(),
    _l: {},
    addEventListener(t, fn) { (this._l[t] ||= []).push(fn); },
    dispatch(t, ev = {}) {
      const e = { target: this, preventDefault() {}, ...ev };
      return Promise.all((this._l[t] || []).map(fn => fn(e)));
    },
    insertAdjacentHTML(pos, html) { this.innerHTML += html; },
    closest() { return null; },
  });

  els.form = mk('form');
  // สถานะเริ่มต้นตาม index.html (มี attribute hidden)
  for (const id of ['detail', 'editor', 'lightbox', 'pick-banner', 'stay-box']) els[id].hidden = true;
  const fields = {};
  els.form.elements = new Proxy({}, { get: (_, name) => (fields[name] ||= mk(String(name))) });

  const document = {
    getElementById: id => (els[id] ||= mk(id)),
    addEventListener(t, fn) { (docL[t] ||= []).push(fn); },
    querySelector: sel => (sel === '.sheet.open'
      ? ['detail', 'editor'].map(i => els[i]).find(e => e && e.classList.contains('open')) || null
      : null),
    get body() { return els.body; },
    createElement: tag => (tag === 'canvas'
      ? { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,QUJD' }
      : {}),
  };

  class FakeImage {
    set src(v) {
      this._src = v;
      setTimeout(() => { this.width = 800; this.height = 600; this.onload && this.onload(); }, 0);
    }
    get src() { return this._src; }
  }

  const layers = [];
  const viewCalls = [];
  const L = {
    map: () => {
      const m = { setView(ll, z) { viewCalls.push({ ll, z }); return m; }, getZoom: () => 6, on(t, fn) { mapH[t] = fn; }, panTo() {}, fitBounds() {} };
      return m;
    },
    tileLayer: () => ({ addTo() { return this; } }),
    control: { zoom: () => ({ addTo() {} }) },
    layerGroup: () => {
      const g = { markers: [], addTo() { return this; }, clearLayers() { g.markers = []; }, addLayer() {} };
      layers.push(g);
      return g;
    },
    divIcon: o => o,
    circle: (ll, opts) => ({ ll, opts, addTo(layer) { layer.markers.push(this); return this; } }),
    marker: (ll, opts) => {
      const m = {
        ll, opts, _fn: null,
        on(t, fn) { this._fn = fn; return this; },
        bindTooltip() { return this; },
        addTo(layer) { layer.markers.push(this); return this; },
      };
      return m;
    },
  };

  // XHR จำลองสำหรับการอัปโหลด (มี upload.onprogress และ abort)
  const hooks = { afterUpload: null };
  class FakeXHR {
    constructor() { this.upload = {}; this.aborted = false; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    abort() { this.aborted = true; this.onabort && this.onabort(); }
    send(body) {
      setTimeout(() => {
        if (this.aborted) return;
        this.upload.onprogress && this.upload.onprogress({ lengthComputable: true, loaded: 1, total: 2 });
        const out = gas.ctx.doPost({ postData: { contents: body } });
        if (hooks.afterUpload) { const h = hooks.afterUpload; hooks.afterUpload = null; h(); }
        this.responseText = out.s;
        this.onload && this.onload();
      }, 0);
    }
  }

  const fetchStub = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('nominatim')) return { json: async () => nominatimReply.v };
    if (opts.method === 'POST' && failNext.v && JSON.parse(opts.body).action === failNext.v) {
      failNext.v = null;
      throw new Error('เครือข่ายขัดข้อง');
    }
    const out = opts.method === 'POST'
      ? gas.ctx.doPost({ postData: { contents: opts.body } })
      : gas.ctx.doGet({ parameter: { action: new URL(u).searchParams.get('action') } });
    return { json: async () => JSON.parse(out.s) };
  };

  const sandbox = {
    document,
    localStorage: fakeStorage,
    XMLHttpRequest: FakeXHR,
    AbortController,
    console,
    Date, Math, Number, String, Promise, JSON, Set, Map, Array, Object, Error, RegExp, Intl,
    setTimeout, clearTimeout,
    navigator: {},
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: fn => fn(),
    alert: m => alerts.push(m),
    confirm: () => confirmAnswer.v,
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} },
    Image: FakeImage,
    FileReader: class {
      readAsDataURL() {
        setTimeout(() => { this.result = 'data:video/mp4;base64,QUJD'; this.onload && this.onload(); }, 0);
      }
    },
    fetch: fetchStub,
    L,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read('config.js'), sandbox);
  vm.runInContext(read('app.js'), sandbox);

  return {
    sb: sandbox,
    els,
    fields,
    docL,
    mapH,
    alerts,
    confirmAnswer,
    nominatimReply,
    failNext,
    fakeStorage,
    hooks,
    confirmAnswer,
    markers: () => layers[0].markers,
    viewCalls,
    myMarkers: () => layers[1]?.markers || [],
    get: name => vm.runInContext(name, sandbox),
    // ข้อความที่แอพเขียนด้วย textContent (สถานะ, ข้อผิดพลาด) หรือ innerHTML
    html: id => els[id]?.innerHTML || els[id]?.textContent || '',
    cls: id => els[id]?.classList,
  };
}

// helper: ตัวจำลองเป้าหมายของเหตุการณ์คลิก
const tgt = (dataset, match) => ({
  dataset,
  closest: sel => (match === undefined || sel === match ? { dataset } : null),
});

async function main() {
  // ================= 1. Code.gs =================
  console.log('\n== 1. Code.gs (backend บน Google Sheet จำลอง) ==');
  const ss = makeSpreadsheet();
  const gas = loadCodeGs(ss);
  const call = body => JSON.parse(gas.ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);
  const listRaw = () => JSON.parse(gas.ctx.doGet({ parameter: { action: 'list' } }).s);
  const base = (o = {}) => ({
    name: 'ดอยอินทนนท์', category: 'ธรรมชาติ', province: 'เชียงใหม่',
    lat: 18.58, lng: 98.48, rating: 5, visited: '', description: '', photos: [], ...o,
  });

  check('เขียนโดยไม่มี secret ถูกปฏิเสธ', call({ action: 'add', secret: 'x', place: base() }).ok === false);
  check('add วันเดียวสำเร็จ', call({ action: 'add', secret: '1142', place: base({ visited: '2026-10-25' }) }).ok === true);
  check('อ่านวันเดียวกลับมาเป็น yyyy-mm-dd', listRaw().places[0].visited === '2026-10-25',
    JSON.stringify(listRaw().places[0]?.visited));
  check('คอลัมน์ visited เก็บเป็นข้อความ (ไม่ถูกแปลงเป็นวันที่)',
    typeof ss._sheets.places._grid[1][8] === 'string', typeof ss._sheets.places._grid[1][8]);

  call({ action: 'add', secret: '1142', place: base({ name: 'ปาย', visited: '2026-10-25,2026-10-26,2026-10-27' }) });
  const two = listRaw().places;
  check('เก็บหลายวันแล้วอ่านกลับครบ', two[1].visited === '2026-10-25,2026-10-26,2026-10-27', two[1].visited);
  check('มี 2 สถานที่', two.length === 2);

  const id0 = two[0].id;
  const created = ss._sheets.places._grid[1][10];
  check('update สำเร็จ', call({ action: 'update', secret: '1142', place: { ...base({ name: 'ดอยอินทนนท์ (แก้)', visited: '2026-11-01' }), id: id0 } }).ok);
  const upd = listRaw().places.find(p => p.id === id0);
  check('update เปลี่ยนชื่อ', upd.name === 'ดอยอินทนนท์ (แก้)');
  check('update เปลี่ยนวันที่', upd.visited === '2026-11-01', upd.visited);
  check('update ไม่แก้ created_at', ss._sheets.places._grid[1][10] === created);
  check('update id ที่ไม่มีอยู่ถูกปฏิเสธ', call({ action: 'update', secret: '1142', place: { ...base(), id: 'nope' } }).ok === false);
  call({ action: 'add', secret: '1142', place: base({ name: '=HYPERLINK("x")' }) });
  const injected = ss._sheets.places._grid.at(-1)[1];
  check('ข้อความที่ขึ้นต้นด้วย = ถูกทำให้เป็นข้อความ', injected.startsWith("'="), injected);
  check('ลบสถานที่สำเร็จ', call({ action: 'delete', secret: '1142', id: two[1].id }).ok);
  check('หลังลบเหลือ 2 แถว (รวมที่เพิ่ง add)', listRaw().places.length === 2, listRaw().places.length);
  check('action ไม่รู้จักถูกปฏิเสธ', call({ action: 'zzz', secret: '1142' }).ok === false);
  const up = call({ action: 'upload', secret: '1142', filename: 'a.jpg', mimeType: 'image/jpeg', data: Buffer.from('hi').toString('base64') });
  check('upload รูปได้ url', up.ok && up.url.startsWith('https://lh3.googleusercontent.com/d/FILE'), JSON.stringify(up));
  ss._sheets.places._grid.push(['legacy', 'เก่า', 'อื่นๆ', '', 13, 100, '', 0, new Date(2026, 9, 25), '', '', '']);
  const legacy = listRaw().places.find(p => p.id === 'legacy');
  check('แถวเก่าที่เป็น Date อ่านได้เป็น yyyy-mm-dd', legacy?.visited === '2026-10-25', legacy?.visited);

  // ================= 2. app.js =================
  console.log('\n== 2. app.js (หน้าเว็บ) ==');
  const app = loadApp(gas);
  await flush();
  const { get } = app;

  const N = listRaw().places.length;
  check('โหลดสถานที่มาแสดงเป็นหมุด', app.markers().length === N, `หมุด=${app.markers().length}`);
  check('แสดงจำนวนในสถานะ', app.html('status') === `${N} สถานที่`, app.html('status'));
  check('มีตัวเลือกจังหวัดครบ (77)', (app.html('f-prov').match(/<option>/g) || []).length === 77, String((app.html('f-prov').match(/<option>/g) || []).length));

  // --- filter ---
  await app.els.chips.dispatch('click', { target: tgt({ cat: 'ที่พัก' }, '[data-cat]') });
  check('กรองหมวด "ที่พัก" ไม่มีอะไรตรง', app.markers().length === 0, `หมุด=${app.markers().length}`);
  check('สถานะบอกจำนวนที่กรอง', app.html('status').includes(`จาก ${N}`), app.html('status'));
  await app.els.chips.dispatch('click', { target: tgt({ cat: '' }, '[data-cat]') });
  check('เลือก "ทั้งหมด" กลับมาครบ', app.markers().length === N);

  // --- search ---
  app.els.search.value = 'ดอยอิน';
  await app.els.search.dispatch('input');
  check('ค้นหาด้วยชื่อ', app.markers().length === 1);
  app.els.search.value = 'ไม่มีจริง';
  await app.els.search.dispatch('input');
  check('ค้นหาไม่เจอ = 0', app.markers().length === 0);
  app.els.search.value = '';
  await app.els.search.dispatch('input');

  // --- detail ---
  const m0 = app.markers()[0];
  m0._fn();
  check('คลิกหมุดเปิดหน้ารายละเอียด', app.cls('detail').contains('open'));
  check('หน้ารายละเอียดมีชื่อสถานที่', app.html('detail-body').includes('<h2>ดอยอินทนนท์ (แก้)</h2>'));
  check('ไม่มีคำว่า Invalid Date ในหน้ารายละเอียด', !/Invalid/i.test(app.html('detail-body')));
  check('ปุ่มนำทางมีพิกัด', app.html('detail-body').includes('destination='));
  check('closeDetail ด้วย Escape', (app.docL.keydown[0]({ key: 'Escape' }), !app.cls('detail').contains('open')));

  // --- add place via map ---
  await app.els['btn-add'].dispatch('click');
  check('กดเพิ่มสถานที่เข้าโหมดปักหมุด', app.cls('body').contains('picking'));
  check('แบนเนอร์โหมดปักหมุดแสดงอยู่', app.els['pick-banner'].hidden === false);
  app.nominatimReply.v = { address: { state: 'จังหวัดเชียงใหม่' } };
  app.mapH.click({ latlng: { lat: 18.79, lng: 98.98 } });
  check('แตะแผนที่แล้วเปิดฟอร์ม', app.cls('editor').contains('open'));
  check('แตะแผนที่แล้วกรอกพิกัดให้', app.fields.lat.value === '18.790000', app.fields.lat.value);
  check('ปิดโหมดปักหมุดหลังแตะแผนที่', !app.cls('body').contains('picking'));
  await flush();
  check('ตรวจจังหวัดอัตโนมัติจากพิกัด (ตัดคำว่า "จังหวัด" ออก)', app.fields.province.value === 'เชียงใหม่', app.fields.province.value);
  check('มีข้อความบอกว่าตรวจจากพิกัดแล้ว', app.html('prov-hint').includes('ตรวจจากพิกัด'));
  check('แสดงชื่อจังหวัดที่ตรวจได้ โดยไม่ต้องเลือกเอง', app.html('prov-name').includes('เชียงใหม่'));
  check('รายการจังหวัดถูกซ่อนไว้ตอนตรวจได้แล้ว', app.els['prov-picker'].hidden === true);

  // วางลิงก์ Google Maps แล้วได้พิกัด
  const parsed = (txt) => vm.runInContext(`parseGmapCoords(${JSON.stringify(txt)})`, app.sb);
  check('อ่านพิกัดจาก @lat,lng ของลิงก์ Google Maps', parsed('https://www.google.com/maps/@18.7883,98.9853,17z')?.lat === 18.7883);
  check('อ่านพิกัดจาก !3d !4d ของลิงก์สถานที่', parsed('https://www.google.com/maps/place/X/data=!3d13.75!4d100.5')?.lng === 100.5);
  check('อ่านพิกัดจาก ?q=lat,lng', parsed('https://maps.google.com/?q=14.0,100.6')?.lat === 14);
  check('อ่านพิกัดที่วางตรงๆ', parsed('18.79, 98.98')?.lng === 98.98);
  check('ลิงก์ที่ไม่มีพิกัดได้ null', parsed('https://maps.app.goo.gl/abc123') === null);
  check('พิกัดนอกช่วงถูกปฏิเสธ', parsed('@95.0,200.0') === null);
  app.els['f-gmap'].value = 'https://www.google.com/maps/@17.4,100.4,15z';
  await app.els['btn-gmap'].dispatch('click');
  await flush();
  check('วางลิงก์แล้วใส่พิกัดในฟอร์ม', app.fields.lat.value === '17.400000', app.fields.lat.value);
  check('วางลิงก์แล้วโชว์ปุ่มดูตำแหน่ง', app.els['btn-gmap-show'].hidden === false);

  // เปลี่ยนจังหวัดเองได้ผ่านปุ่ม "เปลี่ยน"
  await app.els['btn-prov-change'].dispatch('click');
  check('กดเปลี่ยนแล้วเปิดรายการจังหวัด', app.els['prov-picker'].hidden === false);
  // คืนพิกัดเดิมจากการปักหมุด เพื่อให้เทสต์ส่วนหมุดด้านล่างยังถูกต้อง
  app.fields.lat.value = '18.790000';
  app.fields.lng.value = '98.980000';

  app.fields.name.value = 'ดอยสุเทพ';
  app.fields.description.value = 'วิวเมือง';
  await app.els['form-cats'].dispatch('click', { target: tgt({ cat: 'วัด/ศาสนสถาน' }, '[data-cat]') });
  check('เลือกหมวดหมู่ได้', app.fields.category.value === 'วัด/ศาสนสถาน');
  await app.els['form-stars'].dispatch('click', { target: tgt({ n: '4' }, '[data-n]') });
  check('ให้คะแนน 4 ดาว', get('rating') === 4);
  await app.els['form-stars'].dispatch('click', { target: tgt({ n: '4' }, '[data-n]') });
  check('กดดาวเดิมซ้ำเพื่อล้างคะแนน', get('rating') === 0);
  await app.els['form-stars'].dispatch('click', { target: tgt({ n: '4' }, '[data-n]') });

  // วันที่: ใส่ "จาก" อย่างเดียว = วันเดียว
  app.els['date-from'].value = '2026-10-25';
  await app.els['date-from'].dispatch('change');
  check('ใส่แค่วันที่จาก = วันเดียว', JSON.stringify(get('dates')) === '["2026-10-25"]', JSON.stringify(get('dates')));
  check('สรุปวันที่แสดงแบบ "25 ต.ค. 69"', app.html('date-summary') === '25 ต.ค. 69', app.html('date-summary'));

  // ใส่ "ถึง" = ทั้งช่วง
  app.els['date-to'].value = '2026-10-28';
  await app.els['date-to'].dispatch('change');
  check('ถึงวันที่ 28 = 4 วัน (25–28)', get('dates').length === 4, JSON.stringify(get('dates')));
  check('สรุปเป็นช่วงแบบ "25–28 ต.ค. 69"', app.html('date-summary') === '25–28 ต.ค. 69', app.html('date-summary'));

  // ถึงก่อนจากต้องถูกปฏิเสธและไม่เปลี่ยนค่าเดิม
  app.els['date-to'].value = '2026-10-24';
  await app.els['date-to'].dispatch('change');
  check('ถึงวันที่ก่อนวันที่จากถูกปฏิเสธ', app.html('date-error').includes('ต้องไม่ก่อน'), app.html('date-error'));
  check('ค่าวันที่เดิมไม่เปลี่ยนเมื่อผิดพลาด', get('dates').length === 4);

  // แก้เป็นถึงวันที่ 27 = 3 วัน
  app.els['date-to'].value = '2026-10-27';
  await app.els['date-to'].dispatch('change');
  check('แก้เป็นถึงวันที่ 27 = 3 วัน และล้างข้อความผิดพลาด', get('dates').length === 3 && app.html('date-error') === '');
  check('สรุปหลังแก้ถูกต้อง', app.html('date-summary') === '25–27 ต.ค. 69', app.html('date-summary'));

  // ปุ่มล้างวัน
  app.els['btn-clear-date'].dispatch('click');
  check('ปุ่มล้างทำให้วันว่าง', get('dates').length === 0 && app.html('date-summary') === 'ยังไม่ได้เลือกวัน');
  app.els['date-from'].value = '2026-10-25';
  app.els['date-to'].value = '2026-10-27';
  await app.els['date-to'].dispatch('change');
  check('เลือกช่วงวันใหม่หลังล้าง', get('dates').length === 3);

  // รูปภาพ
  await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: [{ name: 'a.jpg' }], value: '' } });
  check('เลือกรูปแล้วขึ้นพรีวิว', app.html('photo-grid').includes('tile-x') && get('previewUrls').length === 1);

  // บันทึก
  app.fields.name.value = 'ดอยสุเทพ';
  await app.els.form.dispatch('submit', {});
  await flush();
  const afterAdd = listRaw().places;
  const added = afterAdd.find(p => p.name === 'ดอยสุเทพ');
  check('บันทึกสถานที่ใหม่ลง Sheet', !!added);
  check('วันที่ที่บันทึกเป็นช่วงที่เลือก', added?.visited === '2026-10-25,2026-10-26,2026-10-27', added?.visited);
  check('หมวด/จังหวัด/คะแนน ถูกบันทึก', added?.category === 'วัด/ศาสนสถาน' && added?.province === 'เชียงใหม่' && added?.rating === 4, JSON.stringify([added?.category, added?.province, added?.rating]));
  check('รูปถูกอัปโหลดและบันทึก URL', added?.photos?.length === 1 && added.photos[0].startsWith('https://lh3'), JSON.stringify(added?.photos));
  check('ฟอร์มปิดหลังบันทึกสำเร็จ', !app.cls('editor').contains('open'));
  check('คอลัมน์วันที่ในชีทเป็นข้อความ', typeof ss._sheets.places._grid.find(r => r[1] === 'ดอยสุเทพ')[8] === 'string');

  // --- validation ---
  app.mapH.click({ latlng: { lat: 18.79, lng: 98.98 } });
  app.fields.name.value = '';
  await app.els.form.dispatch('submit', {});
  check('ไม่กรอกชื่อ แจ้งเตือน', app.html('form-error').includes('ชื่อ'), app.html('form-error'));
  app.fields.name.value = 'ทดสอบ';
  app.fields.lat.value = '';
  await app.els.form.dispatch('submit', {});
  check('ไม่มีพิกัด แจ้งเตือน', app.html('form-error').includes('พิกัด'), app.html('form-error'));
  app.fields.lat.value = '';
  app.els['btn-cancel'].dispatch('click');
  await sleep(340);
  check('ปุ่มยกเลิกปิดฟอร์ม', !app.cls('editor').contains('open'));

  // --- edit / detail / lightbox / delete ---
  const pl = listRaw().places;
  const newMarker = app.markers().find(m => Math.abs(m.ll[0] - 18.79) < 1e-6);
  check('หมุดของสถานที่ใหม่แสดงบนแผนที่', !!newMarker);
  newMarker._fn();
  await flush();
  const dlist = app.html('detail-body');
  check('หน้ารายละเอียดแสดงช่วงวันที่แบบ "25–27 ต.ค. 69 · 3 วัน"', dlist.includes('25–27 ต.ค. 69 · 3 วัน'), dlist.slice(0, 400));
  check('หน้ารายละเอียดของที่ใหม่ไม่มี Invalid', !/Invalid/i.test(dlist));

  // รูปเต็มจอ
  await app.els.detail.dispatch('click', { target: tgt({ i: '0' }, '.cell') });
  check('กดรูปแล้วเปิดดูเต็มจอ', app.els.lightbox.hidden === false);
  check('เต็มจอแสดงจำนวนรูป (ซ่อนเมื่อรูปเดียว)', app.html('lb-count') === '' || app.html('lb-count') === '1 / 1');
  app.els['lb-close'].dispatch('click');
  check('ปิดรูปเต็มจอได้', app.els.lightbox.hidden === true);

  // คอลลาจและจำนวนรูปในหน้ารายละเอียด
  check('หน้ารายละเอียดแสดงจำนวนรูป "📷 1 รูป"', app.html('detail-body').includes('📷 1 รูป'));
  const col5 = get("collageHtml(['a','b','c','d','e'], {color:'#000', emoji:'x'})");
  check('คอลลาจ 5 รูปแสดงเพียง 4 ช่องและบอกจำนวนที่เหลือ "+1"', col5.includes('+1') && (col5.match(/class="cell"/g) || []).length === 4 && col5.includes('📷 5 รูป'));
  check('คอลลาจ 3 รูปใช้เค้าโครงแบบ three', get("collageHtml(['a','b','c'], {color:'#000', emoji:'x'})").includes('collage three'));
  check('คอลลาจไม่มีรูปแสดงอิโมจิหมวด', get("collageHtml([], {color:'#000', emoji:'🛕'})").includes('🛕'));

  // ซูมรูปเต็มจอ: pinch / double tap / swipe
  const lbEl = app.els.lightbox;
  const noTarget = { closest: () => null };
  get("openLightbox(['a','b'], 0)");
  get('lbState').lastTap = 0;
  lbEl.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 100, target: noTarget });
  lbEl.dispatch('pointerdown', { pointerId: 2, clientX: 200, clientY: 100, target: noTarget });
  lbEl.dispatch('pointermove', { pointerId: 2, clientX: 300, clientY: 100, target: noTarget });
  check('pinch ขยายรูปตามระยะนิ้ว', Math.abs(get('lbState').zs[0].s - 2) < 1e-6, String(get('lbState').zs[0].s));
  lbEl.dispatch('pointerup', { pointerId: 1, target: noTarget });
  lbEl.dispatch('pointerup', { pointerId: 2, target: noTarget });
  check('ขยายได้สูงสุด 5 เท่า', (() => { get("openLightbox(['a'], 0)"); const l=get('lbState'); l.pinch=null; l.zs[0].s=1; lbEl.dispatch('pointerdown',{pointerId:7,clientX:0,clientY:0,target:noTarget}); lbEl.dispatch('pointerdown',{pointerId:8,clientX:100,clientY:0,target:noTarget}); lbEl.dispatch('pointermove',{pointerId:8,clientX:5000,clientY:0,target:noTarget}); const v=l.zs[0].s; lbEl.dispatch('pointerup',{pointerId:7,target:noTarget}); lbEl.dispatch('pointerup',{pointerId:8,target:noTarget}); return v===5; })());

  get("openLightbox(['a','b'], 0)");
  get('lbState').lastTap = 0;
  lbEl.dispatch('pointerdown', { pointerId: 11, clientX: 50, clientY: 50, target: noTarget });
  lbEl.dispatch('pointerup', { pointerId: 11, target: noTarget });
  lbEl.dispatch('pointerdown', { pointerId: 11, clientX: 50, clientY: 50, target: noTarget });
  check('แตะสองครั้งซูมเข้า 2.5 เท่า', get('lbState').zs[0].s === 2.5, String(get('lbState').zs[0].s));
  lbEl.dispatch('pointerup', { pointerId: 11, target: noTarget });
  get('lbState').lastTap = 0;
  lbEl.dispatch('pointerdown', { pointerId: 12, clientX: 50, clientY: 50, target: noTarget });
  lbEl.dispatch('pointerup', { pointerId: 12, target: noTarget });
  lbEl.dispatch('pointerdown', { pointerId: 12, clientX: 50, clientY: 50, target: noTarget });
  lbEl.dispatch('pointerup', { pointerId: 12, target: noTarget });
  check('แตะสองครั้งอีกครั้งย่อกลับ 1 เท่า', get('lbState').zs[0].s === 1);

  get("openLightbox(['a','b','c'], 0)");
  get('lbState').lastTap = 0;
  lbEl.dispatch('pointerdown', { pointerId: 21, clientX: 300, clientY: 50, target: noTarget });
  lbEl.dispatch('pointermove', { pointerId: 21, clientX: 100, clientY: 50, target: noTarget });
  lbEl.dispatch('pointerup', { pointerId: 21, target: noTarget });
  check('ปัดซ้ายไปรูปถัดไปเมื่อยังไม่ได้ซูม', get('lbState').index === 1, String(get('lbState').index));
  check('ตัวนับแสดง 2 / 3', app.html('lb-count') === '2 / 3', app.html('lb-count'));

  // ป๊อปอัประหว่างบันทึก: ต้องซ่อนหลังบันทึกเสร็จ
  check('ป๊อปอัปบันทึกถูกซ่อนหลังทำงานเสร็จ', app.els.busy.hidden === true);

  // แก้ไข
  await app.els.detail.dispatch('click', { target: tgt({ act: 'edit' }, '[data-act]') });
  check('ปุ่มแก้ไขเปิดฟอร์มพร้อมข้อมูลเดิม', app.fields.name.value === 'ดอยสุเทพ' && app.cls('editor').contains('open'));
  check('ฟอร์มแก้ไขแสดงวันที่เดิม', JSON.stringify(get('dates')) === '["2026-10-25","2026-10-26","2026-10-27"]', JSON.stringify(get('dates')));
  check('ฟอร์มแก้ไขใส่วันจากและถึง', app.els['date-from'].value === '2026-10-25' && app.els['date-to'].value === '2026-10-27');
  check('ฟอร์มแก้ไขเก็บรูปเดิม', get('keptPhotos').length === 1);
  app.fields.name.value = 'ดอยสุเทพ (แก้)';
  await app.els.form.dispatch('submit', {});
  await flush();
  const edited = listRaw().places.find(p => p.name === 'ดอยสุเทพ (แก้)');
  check('บันทึกการแก้ไขลง Sheet', !!edited);
  check('การแก้ไขไม่ทำให้วันที่หาย', edited?.visited === '2026-10-25,2026-10-26,2026-10-27', edited?.visited);
  check('การแก้ไขไม่ทำให้รูปหาย', edited?.photos?.length === 1);

  // ลบ
  const target = app.markers().find(m => Math.abs(m.ll[0] - 18.79) < 1e-6);
  target._fn();
  await app.els.detail.dispatch('click', { target: tgt({ act: 'delete' }, '[data-act]') });
  await flush();
  check('ลบสถานที่แล้วหายจากหน้าเว็บ', !listRaw().places.some(p => p.name === 'ดอยสุเทพ (แก้)'));
  check('หลังลบเหลือหมุดเท่าที่มีจริง', app.markers().length === listRaw().places.length, `${app.markers().length} vs ${listRaw().places.length}`);

  // --- helper functions ---
  console.log('\n== 3. ฟังก์ชันช่วย ==');
  check('splitDates ข้ามค่าที่อ่านไม่ได้และตัดซ้ำ', JSON.stringify(get("splitDates('2026-10-25, abc, ,2026-10-25,2026-10-26')")) === '["2026-10-25","2026-10-26"]');
  check('splitDates แปลง Date ที่เป็นข้อความยาวได้', JSON.stringify(get(`splitDates('${new Date(2026, 9, 25).toString()}')`)) === '["2026-10-25"]');
  check('splitDates ค่าว่างคืนอาร์เรย์ว่าง', JSON.stringify(get("splitDates('')")) === '[]');
  check('fmtDate แสดงเป็นภาษาไทย', get("fmtDate('2026-10-25')").includes('ต.ค.'), get("fmtDate('2026-10-25')"));
  check('rangeDays ข้ามเดือนและรองรับปีอธิกสุรทิน', JSON.stringify(get("rangeDays('2028-02-28','2028-03-01')")) === '["2028-02-28","2028-02-29","2028-03-01"]');
  check('rangeDays วันเดียว', JSON.stringify(get("rangeDays('2026-10-25','2026-10-25')")) === '["2026-10-25"]');

  check('fmtRange ช่วงในเดือนเดียว', get("fmtRange(['2026-10-09','2026-10-10','2026-10-11','2026-10-12'])") === '9–12 ต.ค. 69');
  check('fmtRange วันเดียว', get("fmtRange(['2026-10-09'])") === '9 ต.ค. 69');
  check('fmtRange ข้ามเดือน', get("fmtRange(['2026-10-30','2026-10-31','2026-11-01'])") === '30 ต.ค. – 1 พ.ย. 69', get("fmtRange(['2026-10-30','2026-10-31','2026-11-01'])"));
  check('fmtRange ข้ามปี (พ.ศ. 2570)', get("fmtRange(['2026-12-31','2027-01-01'])") === '31 ธ.ค. 69 – 1 ม.ค. 70', get("fmtRange(['2026-12-31','2027-01-01'])"));
  check('fmtRange วันไม่ต่อเนื่องแสดงทีละวัน', get("fmtRange(['2026-10-09','2026-10-11'])") === '9 ต.ค. 69, 11 ต.ค. 69');
  check('fmtRange ลิสต์ว่างได้ข้อความว่าง', get("fmtRange([])") === '');

  // ================= 4. โฟลเดอร์ทริป / วิดีโอ / ลบ =================
  console.log('\n== 4. โฟลเดอร์ทริป วิดีโอ และการลบ ==');
  const drv = gas.drive;
  const countFiles = () => drv.folders.reduce((n, f) => n + f.files.length, 0);
  await app.els['btn-add'].dispatch('click');
  app.mapH.click({ latlng: { lat: 19.0, lng: 99.0 } });
  app.fields.name.value = 'วัดร่องขุ่น';
  app.fields.province.value = 'เชียงราย';
  await app.els['f-prov'].dispatch('change'); // ผู้ใช้เลือกเอง ต้องไม่ถูกการตรวจพิกัดที่ค้างอยู่ทับ
  await flush();
  app.els['date-from'].value = '2026-11-10';
  await app.els['date-from'].dispatch('change');
  await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: [
    { name: 'a.jpg', type: 'image/jpeg', size: 10 },
    { name: 'trip.mp4', type: 'video/mp4', size: 5000 },
  ], value: '' } });
  await app.els.form.dispatch('submit', {});
  await flush();
  const trip = listRaw().places.find(p => p.name === 'วัดร่องขุ่น');
  check('สร้างโฟลเดอร์ชื่อ "เชียงราย 2026-11-10"', drv.folders.some(f => f.name === 'เชียงราย 2026-11-10'));
  check('ทริปเก็บ folder_id ไว้ในชีท', !!trip?.folder_id, JSON.stringify(trip));
  const tripFolder = drv.folders.find(f => f.id === trip?.folder_id);
  check('รูปและวิดีโอของทริปอยู่โฟลเดอร์เดียวกัน', tripFolder?.files.length === 2, String(tripFolder?.files.length));
  check('วิดีโอได้ลิงก์ preview ของ Drive', trip.photos.some(u => u.includes('drive.google.com/file/d/') && u.endsWith('/preview')), JSON.stringify(trip.photos));
  check('รูปได้ลิงก์ lh3', trip.photos.some(u => u.includes('lh3.googleusercontent.com')));

  const foldersBefore = drv.folders.length;
  const mkTrip = app.markers().find(m => Math.abs(m.ll[0] - 19.0) < 1e-6);
  mkTrip._fn();
  await app.els.detail.dispatch('click', { target: tgt({ act: 'edit' }, '[data-act]') });
  await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: [{ name: 'b.jpg', type: 'image/jpeg', size: 10 }], value: '' } });
  await app.els.form.dispatch('submit', {});
  await flush();
  check('แก้ไขแล้วเพิ่มรูปใช้โฟลเดอร์เดิม ไม่สร้างซ้ำ', drv.folders.length === foldersBefore, `${foldersBefore} → ${drv.folders.length}`);
  check('รูปใหม่ตามเข้าโฟลเดอร์เดิม', tripFolder.files.length === 3, String(tripFolder.files.length));

  // วิดีโอเกินขนาดที่กำหนด (50 MB) ต้องถูกปฏิเสธพร้อมข้อความชัดเจน
  mkTrip._fn();
  await app.els.detail.dispatch('click', { target: tgt({ act: 'edit' }, '[data-act]') });
  vm.runInContext('newFiles = []', app.sb);
  await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: [{ name: 'big.mp4', type: 'video/mp4', size: 51 * 1024 * 1024 }], value: '' } });
  await app.els.form.dispatch('submit', {});
  check('วิดีโอเกิน 50 MB ถูกปฏิเสธพร้อมข้อความ', app.html('form-error').includes('ใหญ่เกิน 50 MB'), app.html('form-error'));

  // วิดีโอ 49 MB ผ่าน + เปลี่ยนวันที่ → โฟลเดอร์ต้องเปลี่ยนชื่อตาม
  vm.runInContext('newFiles = []', app.sb);
  await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: [{ name: 'ok.mp4', type: 'video/mp4', size: 49 * 1024 * 1024 }], value: '' } });
  app.els['date-from'].value = '2026-11-12';
  await app.els['date-from'].dispatch('change');
  await app.els.form.dispatch('submit', {});
  await flush();
  check('วิดีโอ 49 MB อัปโหลดได้', listRaw().places.find(p => p.name === 'วัดร่องขุ่น')?.photos.some(u => u.endsWith('/preview')));
  check('เปลี่ยนวันที่แล้วโฟลเดอร์เปลี่ยนชื่อตาม "เชียงราย 2026-11-12"', tripFolder.name === 'เชียงราย 2026-11-12', tripFolder.name);
  check('เปลี่ยนชื่อโฟลเดอร์โดยไม่สร้างโฟลเดอร์ใหม่', drv.folders.filter(f => f.id === tripFolder.id).length === 1);
  check('เลื่อน "จาก" ไปหลัง "ถึง" เดิมแล้ว "ถึง" ขยับตามอัตโนมัติ', app.els['date-to'].value === '2026-11-12');

  // --- อัปโหลดค้างแล้วบันทึกต่อ ต้องไม่อัปซ้ำ ---
  const liveFiles = () => drv.folders.reduce((n, f) => n + f.files.filter(x => !x.trashed).length, 0);
  const photoFiles = () => [
    { name: 'p1.jpg', type: 'image/jpeg', size: 11, lastModified: 1 },
    { name: 'p2.jpg', type: 'image/jpeg', size: 12, lastModified: 2 },
  ];
  await app.els['btn-add'].dispatch('click');
  app.mapH.click({ latlng: { lat: 17.0, lng: 100.0 } });
  await app.els['f-prov'].dispatch('change');
  app.fields.name.value = 'ทดสอบค้าง';
  app.fields.province.value = 'พิษณุโลก';
  await app.els['f-prov'].dispatch('change');
  app.els['date-from'].value = '2026-12-01';
  await app.els['date-from'].dispatch('change');
  vm.runInContext('newFiles = []', app.sb);
  await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: photoFiles(), value: '' } });
  const liveBefore = liveFiles();
  app.failNext.v = 'add';
  await app.els.form.dispatch('submit', {});
  await flush();
  const pend1 = JSON.parse(app.fakeStorage.getItem('pendingUpload') || 'null');
  check('บันทึกไม่สำเร็จ แต่รูปที่อัปโหลดแล้วถูกเก็บไว้', Object.keys(pend1?.uploads || {}).length === 2, JSON.stringify(pend1));
  check('แจ้งผู้ใช้ว่ารูปถูกเก็บไว้ กดบันทึกซ้ำได้', app.html('form-error').includes('ถูกเก็บไว้'), app.html('form-error'));
  check('อัปโหลดรูป 2 ไฟล์ตอนแรก', liveFiles() - liveBefore === 2, `${liveBefore} → ${liveFiles()}`);

  vm.runInContext('newFiles = []', app.sb);
  await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: photoFiles(), value: '' } });
  await app.els.form.dispatch('submit', {});
  await flush();
  check('บันทึกซ้ำด้วยรูปเดิมไม่อัปโหลดซ้ำ', liveFiles() === liveBefore + 2, `${liveBefore} → ${liveFiles()}`);
  const resumed = listRaw().places.find(p => p.name === 'ทดสอบค้าง');
  check('ทริปที่บันทึกต่อมีรูป 2 รูปพอดี', resumed?.photos.length === 2, JSON.stringify(resumed?.photos));
  check('บันทึกสำเร็จแล้วล้างงานค้าง', app.fakeStorage.getItem('pendingUpload') === null);

  // ปิดฟอร์มหลังอัปโหลดค้าง → รูปและโฟลเดอร์ที่สร้างในรอบนั้นต้องถูกลบ (ย้ายลงถังขยะ)
  app.els['date-from'].value = '2026-12-05';
  await app.els['date-from'].dispatch('change');
  app.mapH.click({ latlng: { lat: 17.2, lng: 100.2 } });
  await app.els['f-prov'].dispatch('change');
  app.fields.name.value = 'ทิ้งงาน';
  app.fields.province.value = 'สุโขทัย';
  await app.els['f-prov'].dispatch('change');
  app.els['date-from'].value = '2026-12-06';
  await app.els['date-from'].dispatch('change');
  await app.els['btn-add'].dispatch('click');
  vm.runInContext('newFiles = []', app.sb);
  await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: [{ name: 'x1.jpg', type: 'image/jpeg', size: 21, lastModified: 3 }], value: '' } });
  app.failNext.v = 'add';
  await app.els.form.dispatch('submit', {});
  await flush();
  const pend2 = JSON.parse(app.fakeStorage.getItem('pendingUpload') || 'null');
  const leftFileId = Object.values(pend2?.uploads || {})[0]?.fileId;
  check('มีรูปค้างก่อนปิดฟอร์ม', !!leftFileId, JSON.stringify(pend2));
  app.confirmAnswer.v = true;
  await app.els['btn-cancel'].dispatch('click');
  await flush();
  check('ปิดฟอร์มแล้วรูปค้างถูกย้ายลงถังขยะ', drv.files[leftFileId]?.trashed === true);
  check('ปิดฟอร์มแล้วล้างงานค้าง', app.fakeStorage.getItem('pendingUpload') === null);
  check('ทริปที่ไม่ได้บันทึกไม่เข้าชีท', !listRaw().places.some(p => p.name === 'ทิ้งงาน'));

  // ยกเลิกกลางอัปโหลด: ไฟล์ถูกสร้างไปแล้วแต่ไม่ได้รับ id ต้องถูกลบด้วยชื่อไฟล์
  {
    const liveBeforeX = liveFiles();
    if (!app.cls('body').contains('picking')) await app.els['btn-add'].dispatch('click');
    app.mapH.click({ latlng: { lat: 17.4, lng: 100.4 } });
    await app.els['f-prov'].dispatch('change');
    app.fields.name.value = 'ยกเลิกกลางทาง';
    app.fields.province.value = 'ลำปาง';
    await app.els['f-prov'].dispatch('change');
    app.els['date-from'].value = '2026-12-10';
    await app.els['date-from'].dispatch('change');
    vm.runInContext('newFiles = []', app.sb);
    await app.els['photo-grid'].dispatch('change', { target: { type: 'file', files: [{ name: 'c1.jpg', type: 'image/jpeg', size: 41, lastModified: 9 }], value: '' } });
    app.hooks.afterUpload = () => vm.runInContext('cancelUpload()', app.sb);
    await app.els.form.dispatch('submit', {});
    await flush();
    check('ยกเลิกกลางอัปโหลด ไม่บันทึกทริป', !listRaw().places.some(p => p.name === 'ยกเลิกกลางทาง'));
    check('ยกเลิกกลางอัปโหลด ลบรูปที่อัปไปแล้วทั้งหมด', liveFiles() === liveBeforeX, `${liveBeforeX} → ${liveFiles()}`);
    check('ยกเลิกแล้วล้างงานค้าง', app.fakeStorage.getItem('pendingUpload') === null);
    check('ยกเลิกแล้วฟอร์มยังเปิดอยู่', app.cls('editor').contains('open'));
    check('แจ้งผู้ใช้ว่ายกเลิกแล้ว', app.html('form-error').includes('ยกเลิกการอัปโหลดแล้ว'), app.html('form-error'));
  }

  mkTrip._fn();
  await flush();
  check('รายละเอียดแสดงวิดีโอเป็นช่อง ▶', app.html('detail-body').includes('video-cell'));
  check('รายละเอียดนับรูปรวมวิดีโอ "📷 4 รูป"', app.html('detail-body').includes('📷 4 รูป'), app.html('detail-body').match(/📷 \d+ รูป/)?.[0]);
  get("openLightbox(['https://drive.google.com/file/d/X/preview'], 0)");
  check('เปิดวิดีโอเต็มจอด้วย iframe', app.els['lb-track'].innerHTML.includes('<iframe'));
  app.els['lb-close'].dispatch('click');

  // ลบทริปแล้วรูปในไดรฟ์ยังอยู่
  const filesBeforeDelete = countFiles();
  mkTrip._fn();
  await app.els.detail.dispatch('click', { target: tgt({ act: 'delete' }, '[data-act]') });
  await flush();
  check('ลบทริปแล้วไฟล์ในไดรฟ์ยังอยู่ทั้งหมด', countFiles() === filesBeforeDelete, `${filesBeforeDelete} → ${countFiles()}`);
  check('ทริปที่ลบหายจากชีท', !listRaw().places.some(p => p.name === 'วัดร่องขุ่น'));

  // โฟลเดอร์ที่ถูกลบไปแล้วต้องสร้างใหม่ ไม่ล้มเหลว
  tripFolder.trashed = true;
  const re = call({ action: 'upload', secret: '1142', filename: 'c.jpg', mimeType: 'image/jpeg', data: Buffer.from('x').toString('base64'), folderId: tripFolder.id, folderName: 'ทดสอบ' });
  check('โฟลเดอร์ในถังขยะถูกแทนด้วยโฟลเดอร์ใหม่', re.ok && re.folderId !== tripFolder.id, JSON.stringify(re));

  // ชีทเก่าที่ไม่มีคอลัมน์ folder_id ต้องถูกเพิ่มให้เอง
  const ss2 = makeSpreadsheet();
  const oldSheet = ss2.insertSheet('places');
  oldSheet.appendRow(['id','name','category','province','lat','lng','description','rating','visited','photos','created_at','updated_at']);
  const gas2 = loadCodeGs(ss2);
  gas2.ctx.doGet({ parameter: { action: 'list' } });
  check('ชีทเก่าได้หัวคอลัมน์ folder_id เพิ่มอัตโนมัติ', ss2._sheets.places._grid[0][12] === 'folder_id');

  // ================= 5. ตำแหน่งของฉัน =================
  console.log('\n== 5. ตำแหน่งของฉัน ==');
  app.sb.navigator.geolocation = {
    getCurrentPosition: (ok) => ok({ coords: { latitude: 18.7883, longitude: 98.9853, accuracy: 12 } }),
  };
  app.els['btn-locate'].dispatch('click');
  check('ปุ่มหาตำแหน่งเลื่อนแผนที่ไปที่ตำแหน่งจริง', app.viewCalls.at(-1)?.ll[0] === 18.7883);
  check('แสดงข้อความความแม่นยำ', app.html('status').includes('คุณอยู่ที่นี่') && app.html('status').includes('12 ม.'), app.html('status'));
  check('วาดจุดของฉันบนแผนที่', app.myMarkers().length >= 1);

  app.sb.navigator.geolocation = {
    getCurrentPosition: (_ok, err) => err({ code: 1 }),
  };
  app.els['btn-locate'].dispatch('click');
  check('ไม่ได้รับอนุญาตแจ้งข้อความชัดเจน', app.html('status').includes('ไม่ได้รับอนุญาต'), app.html('status'));

  app.sb.navigator.geolocation = {
    getCurrentPosition: (ok) => ok({ coords: { latitude: 13.7563, longitude: 100.5018, accuracy: 30 } }),
  };
  await app.els['btn-add'].dispatch('click');
  await app.els['btn-pick-here'].dispatch('click');
  await flush();
  check('ใช้ตำแหน่งฉันตอนปักหมุดเปิดฟอร์มพร้อมพิกัด', app.cls('editor').contains('open') && app.fields.lat.value === '13.756300', app.fields.lat.value);
  check('ออกจากโหมดปักหมุดหลังใช้ตำแหน่งฉัน', !app.cls('body').contains('picking'));

  app.sb.navigator.geolocation = undefined;
  app.els['btn-locate'].dispatch('click');
  check('เบราว์เซอร์ไม่รองรับ GPS แจ้งเตือน', app.html('status').includes('ไม่รองรับ'), app.html('status'));

  console.log(`\nผ่าน ${passed} / ${passed + failed}`);
  if (failed) process.exitCode = 1;
}

main().catch(err => {
  console.error('ทดสอบล้มเหลวกลางทาง:', err);
  process.exitCode = 1;
});
