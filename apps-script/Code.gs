/**
 * Backend ของแผนที่เที่ยวไทย — วางโค้ดนี้ใน Google Sheet ผ่าน
 * Extensions > Apps Script (ผูกกับชีทนั้นโดยตรง)
 *
 * ต้องแก้ 2 ค่าด้านล่างก่อน deploy
 */
const PHOTO_FOLDER_ID = '18hPgUTsr999zbvjAsObJh9OO1-jnYUxD'; // โฟลเดอร์หลักใน Google Drive (แต่ละทริปจะมีโฟลเดอร์ย่อยข้างใน)
const SECRET = '1142';                                       // ต้องตรงกับ config.js

const SHEET_NAME = 'places';
const HEADERS = [
  'id', 'name', 'category', 'province', 'lat', 'lng', 'description',
  'rating', 'visited', 'photos', 'created_at', 'updated_at', 'folder_id',
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
      case 'upload': return json({ ok: true, ...uploadFile(body) });
      case 'discard': discardUploads(body); return json({ ok: true });
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
  // ชีทเก่าที่ยังไม่มีคอลัมน์ใหม่ (เช่น folder_id) ให้เพิ่มหัวคอลัมน์ให้อัตโนมัติ
  const header = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  HEADERS.forEach((h, i) => {
    if (!header[i]) sh.getRange(1, i + 1).setValue(h);
  });
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
      folder_id: String(o.folder_id || ''),
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
    p.folder_id || '',
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
  // ถ้าจังหวัดหรือวันที่เปลี่ยน ให้เปลี่ยนชื่อโฟลเดอร์ของทริปตามไปด้วย
  if (p.folder_id && p.folder_name) renameTripFolder(p.folder_id, p.folder_name);
  return { id: p.id };
}

// ลบเฉพาะแถวในชีท รูปในไดรฟ์จะยังอยู่ (กันการลบพลาด)
function deletePlace(id) {
  const sh = getSheet();
  const idx = findRow(sh, id);
  if (idx > 0) sh.deleteRow(idx);
}

// ---------- photos & videos ----------

// อัปโหลดรูปหรือวิดีโอเข้าโฟลเดอร์ของทริป
// body: { data (base64), mimeType, filename, folderId?, folderName? }
// คืนค่า url และ folderId (ใช้ผูกกับทริปต่อไป)
function uploadFile(body) {
  const blob = Utilities.newBlob(
    Utilities.base64Decode(body.data),
    body.mimeType || 'image/jpeg',
    body.filename || 'file.jpg'
  );
  const folder = getTripFolder(body.folderId, body.folderName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const isVideo = String(body.mimeType || '').indexOf('video/') === 0;
  const url = isVideo
    ? 'https://drive.google.com/file/d/' + file.getId() + '/preview'
    : 'https://lh3.googleusercontent.com/d/' + file.getId();
  return { url: url, folderId: folder.getId(), fileId: file.getId() };
}

// ลบรูปที่อัปโหลดค้างไว้แต่ยังไม่ได้บันทึกทริป (ย้ายลงถังขยะ)
// body: { fileIds: [...], folderId?, deleteFolder? } — deleteFolder ใช้เมื่อโฟลเดอร์ถูกสร้างในรอบนี้
function discardUploads(body) {
  (body.fileIds || []).forEach(id => {
    try { DriveApp.getFileById(id).setTrashed(true); } catch (err) { /* ไฟล์หายไปแล้ว */ }
  });
  // ไฟล์ที่อัปค้างตอนถูกยกเลิก อาจถูกสร้างไปแล้วโดยที่ไม่ได้รับ id — ค้นหาด้วยชื่อไฟล์ที่สุ่มขึ้นเอง (ไม่ซ้ำกัน)
  (body.names || []).forEach(name => {
    if (!/^\d+-[a-z0-9]+\.[a-z0-9]+$/i.test(name)) return; // รับเฉพาะชื่อรูปแบบที่แอปตั้งเท่านั้น
    try {
      const it = DriveApp.searchFiles('title = "' + name + '" and trashed = false');
      while (it.hasNext()) it.next().setTrashed(true);
    } catch (err) { /* ค้นหาไม่ได้ก็ข้าม */ }
  });
  if (body.deleteFolder && body.folderId) {
    try { DriveApp.getFolderById(body.folderId).setTrashed(true); } catch (err) { /* โฟลเดอร์หายไปแล้ว */ }
  }
}

// ใช้โฟลเดอร์เดิมถ้ายังอยู่ ไม่งั้นสร้างใหม่ใต้โฟลเดอร์หลัก
function getTripFolder(folderId, folderName) {
  if (folderId) {
    try {
      const existing = DriveApp.getFolderById(folderId);
      if (!existing.isTrashed()) return existing;
    } catch (err) {
      // โฟลเดอร์ถูกลบไปแล้ว ให้สร้างใหม่ด้านล่าง
    }
  }
  const root = DriveApp.getFolderById(PHOTO_FOLDER_ID);
  return root.createFolder(safeFolderName(folderName));
}

function safeFolderName(name) {
  return String(name || 'ทริปใหม่').replace(/[\\/]/g, '-').slice(0, 120);
}

function renameTripFolder(folderId, folderName) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const name = safeFolderName(folderName);
    if (!folder.isTrashed() && folder.getName() !== name) folder.setName(name);
  } catch (err) {
    // โฟลเดอร์หายไปแล้ว ไม่ต้องทำอะไร
  }
}

// ---------- util ----------

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
