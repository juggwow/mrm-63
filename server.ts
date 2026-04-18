import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(express.urlencoded({ extended: true })); // สำหรับรับข้อมูลจาก Form

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, 'config.json');

export type AppConfig = {
  billperiod: string | undefined;
  username: string | undefined;
  password: string | undefined;
  openrouterApiKey: string | undefined;
  aiModel: string | undefined;
  enabled: boolean | undefined;
}

export function getAppConfig(): AppConfig {
  const CONFIG_FILE = path.join(__dirname, 'config.json');
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error('❌ ไม่พบไฟล์ตั้งค่า โปรดเข้าไปตั้งค่าผ่านหน้าเว็บก่อน');
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
}

// ฟังก์ชันอ่านค่าปัจจุบัน
function getConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  }
  return { username: '', password: '', billperiod: '' };
}

// 1. หน้าเว็บสำหรับกรอกข้อมูล (UI ง่ายๆ)
app.get('/', (req, res) => {
  const config = getConfig();
  const html = `
    <html>
      <body style="font-family: Arial; padding: 50px;">
        <h2>⚙️ ตั้งค่าระบบอ่านมิเตอร์ (PEA)</h2>
        <form method="POST" action="/save">
          <p>รอบบิล (Bill Period): <br><input type="text" name="billperiod" value="${config.billperiod}"></p>
          <p>ชื่อผู้ใช้ (Username): <br><input type="text" name="username" value="${config.username}"></p>
          <p>รหัสผ่าน (Password): <br><input type="text" name="password" value="${config.password}"></p>
          <p>OpenRouter API Key: <br><input type="text" name="openrouterApiKey" value="${config.openrouterApiKey}"></p>
          <p>AI Model: <br><input type="text" name="aiModel" value="${config.aiModel}"></p>
          <p>Enabled: <br><input type="checkbox" name="enabled" value="${config.enabled}"></p>
          <button type="submit" style="padding: 10px 20px; background: blue; color: white;">บันทึกข้อมูล</button>
        </form>
      </body>
    </html>
  `;
  res.send(html);
});

// 2. รับข้อมูลที่ User กด Save แล้วบันทึกลงไฟล์ JSON
app.post('/save', (req, res) => {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2));
  res.send('✅ บันทึกข้อมูลสำเร็จ! <br><a href="/">กลับไปหน้าตั้งค่า</a>');
});

// เปิด Server พอร์ต 3000
app.listen(3000, () => {
  console.log('🌐 Web Admin เปิดใช้งานแล้วที่พอร์ต 3000');
});