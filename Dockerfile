# 1. เปลี่ยนมาใช้ Debian-based image (bookworm-slim) แทน alpine
FROM node:18-bookworm-slim

WORKDIR /app

# 2. คัดลอก package.json มาติดตั้ง dependencies ก่อน
COPY package.json package-lock.json* ./
RUN npm install

# 3. 🌟 ติดตั้ง Browser ของ Playwright 🌟
# ใช้ --with-deps เพื่อให้มันติดตั้งพวก Font และ OS Libraries ที่จำเป็นให้อัตโนมัติ
# ระบุคำว่า chromium ลงไป เพื่อไม่ให้มันโหลด Firefox กับ WebKit มาด้วย (ช่วยประหยัดพื้นที่ไปได้เป็น GB)
RUN npx playwright install chromium --with-deps

# 4. คัดลอกโค้ดทั้งหมดเข้ามา
COPY . .

# 5. Build โค้ด
RUN npm run build

# ลบ Dev Dependencies (ถ้ามี)
RUN npm prune --production

# 8. คำสั่งหลักเมื่อ Container ถูกสั่งรัน (รันไฟล์ที่ Build เสร็จแล้ว)
CMD ["node", "--env-file=.env", "dist/index.js"] 
# หมายเหตุ: ถ้าใน tsconfig.json ของคุณไม่ได้ตั้ง "outDir": "./dist" ให้เปลี่ยนเป็น CMD ["node", "index.js"]