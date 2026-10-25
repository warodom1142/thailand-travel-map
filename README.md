# 🇹🇭 แผนที่เที่ยวไทย

เว็บแอพแผนที่ทั้งประเทศสำหรับบันทึกสถานที่เที่ยว เพิ่มรายละเอียดและรูปภาพได้

- **แผนที่**: Leaflet + OpenStreetMap (ฟรี ไม่ต้องใช้ API key)
- **ฐานข้อมูล**: Google Sheet (ผ่าน Google Apps Script)
- **รูปภาพ**: เก็บใน Google Drive
- **โฮสต์**: Vercel (static site ไม่ต้อง build)

## ฟีเจอร์

- คลิก **+ เพิ่มสถานที่** แล้วคลิกบนแผนที่เพื่อปักหมุด (หรือกรอกพิกัดเอง / ใช้ตำแหน่งปัจจุบัน)
- กรอกชื่อ หมวด จังหวัด คะแนน วันที่ไป รายละเอียด และอัปโหลดหลายรูป
- คลิกหมุดเพื่อดูรายละเอียด แก้ไข หรือลบ
- ค้นหาและกรองตามหมวดหมู่
- ลิงก์นำทางไป Google Maps

## การติดตั้ง

### 1. สร้าง Google Sheet และโฟลเดอร์รูปใน Drive

1. สร้าง Google Sheet ใหม่ (ชื่ออะไรก็ได้)
2. สร้างโฟลเดอร์ใหม่ใน Google Drive สำหรับเก็บรูป แล้วคัดลอก **ID** จาก URL
   - URL จะเป็น `https://drive.google.com/drive/folders/<ID>` เอาส่วน `<ID>`

### 2. ใส่โค้ด Apps Script

1. ในชีท เลือก **Extensions > Apps Script**
2. ลบโค้ดเดิมทิ้ง แล้ววางเนื้อหาจาก `apps-script/Code.gs`
3. แก้ค่า 2 บรรทัดบนสุด
   - `PHOTO_FOLDER_ID` = ID โฟลเดอร์รูปจากข้อ 1
   - `SECRET` = รหัสลับของคุณเอง (ตั้งอะไรก็ได้ ต้องตรงกับ `config.js`)
4. กด **Save**

### 3. Deploy เป็น Web App

1. กด **Deploy > New deployment**
2. เลือกประเภท **Web app**
3. ตั้งค่า
   - Execute as: **Me**
   - Who has access: **Anyone**
4. กด **Deploy** แล้วอนุญาตสิทธิ์ที่ Google ขอ (Sheets / Drive)
5. คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

> ถ้าแก้โค้ด Apps Script ภายหลัง ต้อง **Deploy > Manage deployments > แก้ไข > New version** ทุกครั้ง

### 4. ตั้งค่าแอพ

แก้ไฟล์ `config.js`

```js
window.APP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXX/exec', // URL จากข้อ 3
  SECRET: 'รหัสเดียวกับใน Code.gs',
  ...
};
```

### 5. ทดสอบในเครื่อง

```bash
python3 -m http.server 8000
```

แล้วเปิด http://localhost:8000

### 6. Deploy ขึ้น Vercel

1. push โค้ดขึ้น GitHub (มี repo นี้แล้ว)
2. ไปที่ [vercel.com/new](https://vercel.com/new) แล้วเลือก import repo `thailand-travel-map`
3. Framework Preset: **Other**, Build Command: เว้นว่าง, Output Directory: `.`
4. กด **Deploy**

หลังจากนี้ทุกครั้งที่ push ไป `main` Vercel จะ deploy ให้อัตโนมัติ

## หมายเหตุด้านความปลอดภัย

- `SECRET` อยู่ในไฟล์ frontend จึงเป็นแค่การกันคนสุ่มเขียนข้อมูลโดยไม่ตั้งใจ ไม่ใช่ระบบล็อกอินที่แข็งแรง ถ้าต้องการความปลอดภัยสูงขึ้นควรเพิ่ม Google Sign-in ภายหลัง
- รูปที่ถูกลบออกจากแอพ ไฟล์ใน Drive จะยังอยู่ ลบเองได้ที่โฟลเดอร์รูป
- รูปภาพจะถูกย่อให้ไม่เกิน 1600px ก่อนอัปโหลดเพื่อประหยัดพื้นที่และความเร็ว

## ทดสอบ

```bash
node tests/run.js
```

ชุดทดสอบนี้รัน `app.js` และ `apps-script/Code.gs` จริง โดยใช้ DOM และ Google Sheet จำลอง
ไม่ได้ทดสอบบนเบราว์เซอร์หรือ Google Sheet จริง จึงควรลองใช้งานบนมือถือด้วยเสมอ

> หมายเหตุ: หลังแก้ `Code.gs` ต้องคัดลอกโค้ดใหม่ไปวางใน Apps Script และ deploy เป็น New version ทุกครั้ง
