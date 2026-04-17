import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { extractMeterData, validateConfig, type MeterData } from './ai.js';

// 1. กำหนด Interface สำหรับข้อมูลพื้นฐาน (Box และ Confidence)
interface DetectionBase {
    box: [number, number, number, number]; // พิกัด [y1, x1, y2, x2] หรือ [x, y, w, h]
    confidence: number;
}

// 2. ขยายความสามารถสำหรับส่วนที่มีข้อความ (Text) ด้วย
interface DetectionWithText extends DetectionBase {
    text: string;
}

// 3. กำหนดโครงสร้างของแต่ละรายการใน Results
interface ScrapeResult {
    meter: DetectionBase;
    display?: DetectionWithText;
    pea_no?: DetectionWithText;
    others: any[]; // หรือระบุ Type เฉพาะถ้าทราบโครงสร้างข้างใน
}

// 4. Interface หลักสำหรับ API Response
interface MeterInferenceResponse {
    status: "success" | "error"; // กำหนด Literal Type เพื่อความปลอดภัย
    results: ScrapeResult[];
    duration: number;
}

async function fillDropDown(page: Page, id: string, value: string): Promise<void> {
    await page.fill(id, value);
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
}

const USERNAME = process.env.USERNAME || ""
const PASSWORD = process.env.PASSWORD || ""
const BILLPERIOD = process.env.BILLPERIOD || ""

async function loginMrm() {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
        const browser: Browser = await chromium.launch({ headless: false });
        const page: Page = await browser.newPage();

        try {
            // --- ขั้นตอน Login ---
            await page.goto('https://mrm.pea.co.th');
            await page.click('#LoginContent_btnLoginSSO');
            await page.fill('#username', USERNAME);
            await page.fill('#password', PASSWORD);
            await page.click('button[name="login"]');

            // --- ไปที่เมนู ---
            await page.getByText('6. ตรวจสอบมิเตอร์').click();
            await page.waitForSelector('a.menu_6_3', { state: 'visible' });
            await page.click('a.menu_6_3');

            // --- Fill Filters ---
            await fillDropDown(page, '#MainContent_DateEdit_BILL_PERIOD_I', BILLPERIOD);
            await fillDropDown(page, '#MainContent_ComboBox_TYPE_I', '2. จดหน่วยแจ้งหนี้');
            await fillDropDown(page, '#MainContent_ComboBox_PORTION_I', 'ทุก Portion');

            const okButton = page.locator('button.swal2-confirm');
            await okButton.waitFor({ state: 'visible' });
            await okButton.click();
            await page.waitForTimeout(1000);

            await fillDropDown(page, '#MainContent_ComboBox_PTCNO_I', 'ทุกเครื่อง');
            await fillDropDown(page, '#MainContent_ComboBox_SHOW_TYPE_I', 'เฉพาะรายที่ไม่มีผลบันทึก');
            await fillDropDown(page, '#MainContent_ComboBox_Img_I', 'มีรูปภาพสุ่มหน่วย');

            await page.click('#MainContent_ctl00');
            await page.waitForLoadState('networkidle');

            return { page, browser };

        } catch (error) {
            await browser.close();
            retryCount++;
            if (retryCount >= maxRetries) {
                console.error("ลองครบ 3 ครั้งแล้วยังพังอยู่ จบการทำงาน...");
            } else {
                console.log(`จะลองเข้าสู่ระบบใหม่ใน 5 วินาที... (เหลือโอกาสอีก ${maxRetries - retryCount} ครั้ง)`);
                await new Promise(res => setTimeout(res, 5000));
            }
        }
    }
}


async function runScraper(): Promise<void> {
    await validateConfig();
    if (!USERNAME || !PASSWORD || !BILLPERIOD) {
        throw new Error("Missing environment variables");
    }
    let row = 1;
    let retryCount = 0;
    const maxRetries = 3;
    let isErr = false;
    try {
        const l = await loginMrm()
        if (!l) {
            throw new Error("Login failed");
        }
        let page = l.page
        let browser = l.browser

        while (retryCount < maxRetries) {
            if (isErr) {
                const l = await loginMrm()
                if (!l) {
                    break
                }
                page = l.page
                browser = l.browser
            }

            isErr = false;

            try {

                if (row > 0 && row % 100 === 0) {
                    await page.click('a[data-args="PBN"]');
                    await page.waitForLoadState('networkidle');
                }

                await page.waitForTimeout(1000);

                const cancelBtn = page.locator('button[data-toggle="gridview-cancelchanges"]');
                if (await cancelBtn.isVisible()) {
                    console.log("กดปุ่มยกเลิก")
                    await cancelBtn.click();
                }

                const cell = page.locator(`#MainContent_gvSelect_DXDataRow${row} td`).first();
                await cell.waitFor({ state: 'visible' });
                console.log("กดปุ่มแก้ไข")
                await cell.click({ force: true });
                await page.waitForTimeout(1000); // รอฟอร์มเปิด
                const imageUrl = await page.getAttribute('#MainContent_gvSelect_DXEFL_PC_0_DXEditor25', 'src');
                if (!imageUrl) {
                    console.log("ไม่พบรูปภาพ")
                    row++
                    retryCount = 0
                    await page.click('button[data-toggle="gridview-cancelchanges"]');
                    continue
                }

                let meterData: MeterData
                try {
                    console.log("ดึงข้อมูลจากรูปภาพ url: ", imageUrl)
                    meterData = await extractMeterData(imageUrl)
                } catch (e) {
                    console.log("ดึงข้อมูลจากรูปภาพไม่สำเร็จ err: ", e)
                    row++
                    retryCount = 0
                    await page.click('button[data-toggle="gridview-cancelchanges"]');
                    continue
                }

                switch (meterData.image_quality) {
                    case 1:
                        console.log("ชัดเจน")
                        await fillDropDown(page, '#MainContent_gvSelect_DXEFL_PC_0_DXEditor7_I', "ชัด")
                        break
                    case 2:
                        console.log("ไม่ชัดเจน")
                        await fillDropDown(page, '#MainContent_gvSelect_DXEFL_PC_0_DXEditor7_I', "ไม่ชัดเจน")
                        break
                    case 3:
                        console.log("เหตุสุดวิสัย(ไม่ชัดเจน)")
                        await fillDropDown(page, '#MainContent_gvSelect_DXEFL_PC_0_DXEditor7_I', "เหตุสุดวิสัย(ไม่ชัดเจน)")
                        break
                }

                console.log("กดปุ่มบันทึก")
                await page.click('button[data-toggle="gridview-savechanges"]', { force: true })
                await page.waitForLoadState('networkidle');

                retryCount = 0

            } catch (e) {
                await browser.close();
                retryCount++;
                if (retryCount >= maxRetries) {
                    row++
                    break;
                } else {
                    isErr = true
                    console.log(`จะลองบันทึกใหม่ใน 5 วินาที... (เหลือโอกาสอีก ${maxRetries - retryCount} ครั้ง) err:${e}`);
                    await new Promise(res => setTimeout(res, 5000));
                }
            }
        }
        await browser.close();
    } catch (e) {
        throw new Error("Failed or finished")
    }
}


runScraper();



