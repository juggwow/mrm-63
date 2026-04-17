// หากใช้ Node.js เวอร์ชันเก่ากว่า 18 อาจต้องติดตั้ง 'node-fetch'
// npm install node-fetch และ import fetch from 'node-fetch';

export type MeterData = {
    meter_reading: string;
    image_quality: number;
}



export async function extractMeterData(imageUrl: string, OPENROUTER_API_KEY: string, AI_MODEL: string) {
    // const imageResponse = await fetch(imageUrl);

    // if (!imageResponse.ok) {
    //     throw new Error(`ไม่สามารถดาวน์โหลดรูปภาพได้: ${JSON.stringify(imageResponse)}`);
    // }

    // // แปลงรูปภาพเป็น Base64
    // const arrayBuffer = await imageResponse.arrayBuffer();
    // const buffer = Buffer.from(arrayBuffer);
    // const base64Image = buffer.toString('base64');

    // // ดึง MimeType จากรูปภาพโดยตรง (ถ้าไม่มีให้ตั้งค่าเริ่มต้นเป็น image/jpeg)
    // const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
    // console.log(`- แปลงรูปภาพเป็น Base64 สำเร็จ (${mimeType})`);

    // สร้าง Payload สำหรับ Gemini
    const payload = {
        model: AI_MODEL,
        temperature: 0,
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "meter_reading_extraction", // ตั้งชื่อ Schema (ห้ามมีเว้นวรรค)
                strict: true, // บังคับให้โมเดลตอบตาม Schema นี้ 100%
                schema: {
                    type: "object",
                    properties: {
                        meter_reading: {
                            type: "string",
                            description: "The electricity meter reading extracted directly from the physical dial."
                        },
                        image_quality: {
                            type: "integer",
                            description: "1=Clear, 2=Not Clear, 3=Force Majeure"
                        }
                    },
                    required: ["meter_reading", "image_quality"],
                    additionalProperties: false // ไม่อนุญาตให้โมเดลสร้าง Key อื่นมั่วๆ เพิ่มเข้ามา
                }
            }
        },
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `Analyze the provided image to extract the electricity meter reading and the PEA NO.

CRITICAL INSTRUCTION: There are digital text stamps or watermarks overlaid on this image. YOU MUST COMPLETELY IGNORE THESE DIGITAL OVERLAYS.
- ONLY extract the "meter reading" directly from the physical mechanical or digital dial inside the meter itself.

Evaluate the image quality based ONLY on the visibility of the physical meter dial and physical PEA tag:
1. Clear: The physical meter dial is clearly readable.
2. Not Clear: The physical meter is blurry, out of focus, or unreadable.
3. Force Majeure: The physical meter cannot be read due to external damage, severe scratches, broken glass, or moisture/condensation inside the dial.

Return the result strictly in JSON format using this exact structure:
{
  "meter_reading": "string",
  "image_quality": integer (1=Clear, 2=Not Clear, 3=Force Majeure)
}`
                    },
                    {
                        type: "image_url",
                        image_url: {
                            // OpenRouter ต้องการรูปแบบ Data URI สำหรับ Base64
                            url: imageUrl
                        }
                    }
                ]
            }
        ]
    };

    console.log('2. กำลังส่งข้อมูลไปยัง OpenRouter API...');

    let retryCount = 0

    while (retryCount < 5) {
        const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                // Optional: แนะนำให้ใส่ HTTP-Referer และ X-Title ตามกฎของ OpenRouter เพื่อเก็บสถิติ
                'HTTP-Referer': 'https://yourwebsite.com',
                'X-Title': 'PEA Meter Reader'
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(180000)
        });

        if (openRouterResponse.status === 429) {
            console.log("Rate limit exceeded, please try again later")
            retryCount++
            await new Promise(res => setTimeout(res, 10000))
            continue
        }

        if (!openRouterResponse.ok) {
            const errorText = await openRouterResponse.text();
            throw new Error(`API Error: ${openRouterResponse.status} - ${errorText}`);
        }

        const result = await openRouterResponse.json();

        console.log('\n=== ผลลัพธ์จากรูปภาพ ===');
        // ดึงข้อความ JSON จาก response ของ OpenRouter
        const jsonStringResponse = result.choices[0].message.content;

        // แปลงข้อความ JSON เป็น Object
        const meterData: MeterData = JSON.parse(jsonStringResponse);

        console.log("ผลการอ่านมิเตอร์ ", meterData);

        return meterData;

    }

    throw new Error("Failed to extract meter data after multiple retries");
}

export async function validateConfig(OPENROUTER_API_KEY: string, AI_MODEL: string): Promise<void> {
    console.log(`🔍 กำลังตรวจสอบ API Key และ Model: ${AI_MODEL}...`);

    // 1. ตรวจสอบรูปแบบเบื้องต้น (Basic Validation)
    if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.trim() === '') {
        throw new Error('❌ ตรวจสอบไม่ผ่าน: API Key ว่างเปล่า');
    }
    // API Key ของ OpenRouter มักจะขึ้นต้นด้วย sk-or-
    if (!OPENROUTER_API_KEY.startsWith('sk-or-')) {
        throw new Error('❌ ตรวจสอบไม่ผ่าน: รูปแบบ API Key ไม่ถูกต้อง (ควรขึ้นต้นด้วย sk-or-)');
    }
    if (!AI_MODEL || AI_MODEL.trim() === '') {
        throw new Error('❌ ตรวจสอบไม่ผ่าน: ไม่ได้ระบุชื่อ Model');
    }

    try {
        // 2. เรียก API ของ OpenRouter เพื่อตรวจสอบ Key และดึงรายชื่อ Models
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`
            },
            // ใส่ AbortSignal เพื่อป้องกันการรอค้างหากเน็ตมีปัญหา
            signal: AbortSignal.timeout(10000)
        });

        // 3. เช็คว่า API Key ถูกต้องหรือไม่
        if (response.status === 401) {
            throw new Error('❌ ตรวจสอบไม่ผ่าน: API Key ไม่ถูกต้อง, ถูกระงับ หรือหมดอายุ (401 Unauthorized)');
        }

        if (!response.ok) {
            throw new Error(`❌ ตรวจสอบไม่ผ่าน: เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (${response.status} - ${response.statusText})`);
        }

        // 4. เช็คว่า Model มีอยู่จริงในระบบหรือไม่
        const result = await response.json();
        const availableModels: Array<{ id: string }> = result.data;

        const isModelValid = availableModels.some((m) => m.id === AI_MODEL);

        if (!isModelValid) {
            throw new Error(`❌ ตรวจสอบไม่ผ่าน: ไม่พบโมเดลชื่อ '${AI_MODEL}' บนระบบ OpenRouter โปรดตรวจสอบตัวสะกดอีกครั้ง`);
        }

        console.log('✅ ตรวจสอบผ่าน: API Key และ Model พร้อมใช้งาน!');

    } catch (error: any) {
        // โยน Error ออกไปให้ฟังก์ชันหลักจัดการต่อ
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            throw new Error('❌ ตรวจสอบไม่ผ่าน: หมดเวลาการเชื่อมต่อ (Timeout) ไม่สามารถติดต่อเซิร์ฟเวอร์ได้');
        }
        throw error;
    }
}

// เรียกใช้งานฟังก์ชัน
// extractMeterData('https://webservice.pea.co.th/SurveyImage/JPTM/202603_JPTM_207_A1_JPTM0009_16486328_020003794987.jpg');