// ตั้งค่าแอพ — แก้ 2 ค่าหลังจาก deploy Apps Script แล้ว
window.APP_CONFIG = {
  // URL ของ Web App จาก Google Apps Script (ลงท้ายด้วย /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbyB_8KdsQwJb61yODkoqTCkyYCqKCvofyDNkbSUdJgE00O84-ct3uGZt5dBC4-qwV8B/exec',

  // ต้องตรงกับ SECRET ในไฟล์ apps-script/Code.gs
  SECRET: '1142',

  // จุดเริ่มต้นของแผนที่ (กลางประเทศไทย)
  MAP_CENTER: [13.5, 101.0],
  MAP_ZOOM: 6,
};
