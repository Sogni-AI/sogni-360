import { chromium } from 'playwright';

const url = process.argv[2] || 'https://360-local.sogni.ai';
const outputPath = process.argv[3] || '/tmp/screenshot.png';
const testImage = process.argv[4] || '/Users/markledford/Pictures/1.jpg';
const width = parseInt(process.argv[5]) || 1440;
const height = parseInt(process.argv[6]) || 900;

async function captureWaypointEditor() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height } });

  try {
    console.log(`1. Navigating to app (${width}x${height})...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

    console.log('2. Uploading test image...');
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles(testImage);
      console.log('   Image uploaded, waiting for processing...');
      await page.waitForTimeout(2000);
    }

    console.log('3. Looking for Continue button (naming dialog)...');
    await page.waitForTimeout(500);
    const continueButton = await page.$('text=Continue');
    if (continueButton) {
      await continueButton.click();
      console.log('   Clicked Continue');
      await page.waitForTimeout(1000);
    }

    console.log('4. Looking for Camera Angles button...');
    await page.waitForTimeout(500);
    const angleButton = await page.$('text=Choose Camera Angles');
    if (angleButton) {
      await angleButton.click();
      console.log('   Opened Camera Angles modal');
      await page.waitForTimeout(1000);
    }

    console.log('5. Taking screenshot...');
    await page.screenshot({ path: outputPath, fullPage: false });
    console.log(`Screenshot saved to: ${outputPath}`);

  } catch (e) {
    console.error('Error:', e.message);
    await page.screenshot({ path: outputPath, fullPage: false });
  } finally {
    await browser.close();
  }
}

captureWaypointEditor();
