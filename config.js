// ตั้งค่าแอพ — แก้ 2 ค่าหลังจาก deploy Apps Script แล้ว
window.APP_CONFIG = {
  // URL ของ Web App จาก Google Apps Script (ลงท้ายด้วย /exec)
  API_URL: 'PASTE_APPS_SCRIPT_WEB_APP_URL_HERE',

  // ต้องตรงกับ SECRET ในไฟล์ apps-script/Code.gs
  SECRET: 'change-me',

  // จุดเริ่มต้นของแผนที่ (กลางประเทศไทย)
  MAP_CENTER: [13.5, 101.0],
  MAP_ZOOM: 6,
};
