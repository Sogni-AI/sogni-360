import { chromium } from 'playwright';

async function captureHover() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    console.log('1. Navigating to app...');
    await page.goto('https://360-local.sogni.ai', { waitUntil: 'networkidle', timeout: 15000 });

    console.log('2. Uploading test image...');
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.setInputFiles('/Users/markledford/Pictures/1.jpg');
      await page.waitForTimeout(2000);
    }

    console.log('3. Clicking Continue...');
    const continueButton = await page.$('text=Continue');
    if (continueButton) {
      await continueButton.click();
      await page.waitForTimeout(1000);
    }

    console.log('4. Closing modal if open...');
    const closeBtn = await page.$('.waypoint-editor-panel-header button, button:has-text("×"), [aria-label="Close"]');
    if (closeBtn) {
      await closeBtn.click();
      await page.waitForTimeout(500);
    }
    // Try pressing Escape to close any modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    console.log('5. Hovering over left zone...');
    await page.mouse.move(100, 450);
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/hover-left.png' });
    console.log('   Saved /tmp/hover-left.png');

    console.log('6. Hovering over center zone...');
    await page.mouse.move(720, 450);
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/hover-center.png' });
    console.log('   Saved /tmp/hover-center.png');

    console.log('7. Hovering over right zone...');
    await page.mouse.move(1340, 450);
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/hover-right.png' });
    console.log('   Saved /tmp/hover-right.png');

  } finally {
    await browser.close();
  }
}

captureHover().catch(console.error);
