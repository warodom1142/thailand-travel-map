/**
 * Backend ของแผนที่เที่ยวไทย — วางโค้ดนี้ใน Google Sheet ผ่าน
 * Extensions > Apps Script (ผูกกับชีทนั้นโดยตรง)
 *
 * ต้องแก้ 2 ค่าด้านล่างก่อน deploy
 */
const PHOTO_FOLDER_ID = 'PUT_DRIVE_FOLDER_ID_HERE'; // ID ของโฟลเดอร์ใน Google Drive ที่จะเก็บรูป
const SECRET = 'change-me';                          // ต้องตรงกับ config.js

const SHEET_NAME = 'places';
const HEADERS = [
  'id', 'name', 'category', 'province', 'lat', 'lng', 'description',
  'rating', 'visited', 'photos', 'created_at', 'updated_at',
];

// ---------- HTTP entry points ----------

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'list';
  if (action === 'list') return json({ ok: true, places: readAll() });
  return json({ ok: false, error: 'unknown action' });
}

function doPost(e) {
  let locked = false;
  const lock = LockService.getScriptLock();
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (body.secret !== SECRET) return json({ ok: false, error: 'unauthorized' });

    lock.waitLock(20000);
    locked = true;

    switch (body.action) {
      case 'add':    return json({ ok: true, place: addPlace(body.place) });
      case 'update': return json({ ok: true, place: updatePlace(body.place) });
      case 'delete': deletePlace(body.id); return json({ ok: true });
      case 'upload': return json({ ok: true, url: uploadPhoto(body) });
      default:       return json({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

// ---------- sheet helpers ----------

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readAll() {
  const sh = getSheet();
  const values = sh.getDataRange().getValues();
  const head = values[0];
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  return values.slice(1).filter(r => r[0]).map(r => {
    const o = {};
    head.forEach((h, i) => (o[h] = r[i]));
    return {
      id: String(o.id),
      name: String(o.name || ''),
      category: String(o.category || ''),
      province: String(o.province || ''),
      lat: Number(o.lat),
      lng: Number(o.lng),
      description: String(o.description || ''),
      rating: Number(o.rating) || 0,
      visited: fmtDate(o.visited, tz),
      photos: String(o.photos || '').split('\n').filter(Boolean),
    };
  });
}

function fmtDate(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return v ? String(v) : '';
}

// กัน formula injection: ขึ้นต้นด้วย = + - @ ให้เป็นข้อความ
function safe(v) {
  const s = v == null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function rowFor(p, created, updated) {
  return [
    p.id,
    safe(p.name),
    safe(p.category),
    safe(p.province),
    Number(p.lat),
    Number(p.lng),
    safe(p.description),
    Number(p.rating) || 0,
    p.visited || '',
    (p.photos || []).join('\n'),
    created,
    updated,
  ];
}

function findRow(sh, id) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
  const i = ids.indexOf(String(id));
  return i < 0 ? -1 : i + 2;
}

// ---------- CRUD ----------

// เขียนแถวลงชีท โดยตั้งคอลัมน์ visited เป็น "ข้อความ" ก่อน
// ไม่งั้น Google Sheet จะแปลง "2026-10-25" เป็นวันที่เอง และค่าหลายวันจะเพี้ยน
function writeRow(sh, rowIdx, row) {
  const VISITED_COL = HEADERS.indexOf('visited') + 1;
  sh.getRange(rowIdx, VISITED_COL).setNumberFormat('@');
  sh.getRange(rowIdx, 1, 1, HEADERS.length).setValues([row]);
}

function addPlace(p) {
  const sh = getSheet();
  const now = new Date().toISOString();
  const row = rowFor({ ...p, id: Utilities.getUuid() }, now, now);
  writeRow(sh, Math.max(sh.getLastRow(), 1) + 1, row);
  return { id: row[0] };
}

function updatePlace(p) {
  const sh = getSheet();
  const idx = findRow(sh, p.id);
  if (idx < 0) throw new Error('ไม่พบสถานที่นี้');
  const created = sh.getRange(idx, HEADERS.indexOf('created_at') + 1).getValue();
  writeRow(sh, idx, rowFor(p, created, new Date().toISOString()));
  return { id: p.id };
}

function deletePlace(id) {
  const sh = getSheet();
  const idx = findRow(sh, id);
  if (idx > 0) sh.deleteRow(idx);
}

// ---------- photos ----------

function uploadPhoto(body) {
  const blob = Utilities.newBlob(
    Utilities.base64Decode(body.data),
    body.mimeType || 'image/jpeg',
    body.filename || 'photo.jpg'
  );
  const file = DriveApp.getFolderById(PHOTO_FOLDER_ID).createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

// ---------- util ----------

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
