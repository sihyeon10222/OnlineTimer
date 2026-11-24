import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const viewports = [
    [320, 568], [375, 667], [390, 844], [430, 932],
    [768, 1024], [820, 1180], [1024, 768],
    [1280, 800], [1440, 900], [1920, 1080]
];
const sampleWidths = [320, 390, 820, 1440];
const longName = 'W'.repeat(70);

async function capture(page, name) {
    const directory = process.env.E2E_SCREENSHOT_DIR;
    if (!directory) return;
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, `${name}.png`), fullPage: true, animations: 'disabled' });
}

async function expectLayout(page, state, scope = 'body') {
    const problems = await page.locator(scope).evaluate(root => {
        const viewport = document.documentElement;
        const issues = [];
        const tolerance = 2;
        if (viewport.scrollWidth > viewport.clientWidth + tolerance) {
            issues.push(`document width ${viewport.scrollWidth} exceeds ${viewport.clientWidth}`);
        }

        const controls = 'button, a[href], input, select';
        const text = 'h1, h2, h3, #timer-display, #timer-display span, #timer-name-display, .timer-list-name, .timer-list-time';
        const elements = [...root.querySelectorAll(`${controls}, ${text}`)].filter(element => element.checkVisibility());
        const name = element => element.id || element.getAttribute('aria-label') || element.className || element.tagName;
        const interactive = [];
        for (const element of elements) {
            const rect = element.getBoundingClientRect();
            if (rect.left < -tolerance || rect.right > viewport.clientWidth + tolerance) {
                issues.push(`${name(element)} extends beyond the viewport`);
            }
            if (element.clientWidth && element.scrollWidth > element.clientWidth + tolerance && !element.matches('input, select')) {
                issues.push(`${name(element)} clips horizontally (${element.scrollWidth} > ${element.clientWidth})`);
            }
            if (element.matches('button, input[type="date"], select') && (rect.width < 43.5 || rect.height < 43.5)) {
                issues.push(`${name(element)} has a ${Math.round(rect.width)}x${Math.round(rect.height)}px touch area`);
            }
            if (element.matches(controls)) interactive.push({ element, rect });
        }
        for (const [index, first] of interactive.entries()) {
            for (const second of interactive.slice(index + 1)) {
                if (first.element.contains(second.element) || second.element.contains(first.element)) continue;
                const overlapX = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
                const overlapY = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);
                if (overlapX > tolerance && overlapY > tolerance) {
                    issues.push(`${name(first.element)} overlaps ${name(second.element)}`);
                }
            }
        }
        return issues;
    });
    expect(problems, state).toEqual([]);
}

async function loadSavedTimers(page) {
    await page.evaluate(name => {
        const timers = [
            { id: 'long', name, type: 'stopwatch' },
            { id: 'deadline', name: '프로젝트 마감', type: 'countdown' }
        ];
        localStorage.setItem('timerList', JSON.stringify(timers));
        localStorage.setItem('timer_state_long', JSON.stringify({
            type: 'stopwatch', active: false, pauseTime: 8_640_000_000_000, timerName: name
        }));
        localStorage.setItem('timer_state_deadline', JSON.stringify({
            type: 'countdown', countdownMode: 'target', active: false, pauseTime: 0,
            targetAt: Date.now() + 10 * 86400_000, timerName: timers[1].name
        }));
    }, longName);
    await page.reload();
}

async function expectDialogFits(page, selector) {
    const dialog = page.locator(selector);
    await expect(dialog).toBeVisible();
    await expectLayout(page, selector, selector);
    const { left, right, top, bottom, viewportWidth, viewportHeight } = await dialog.evaluate(element => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    expect(left).toBeGreaterThanOrEqual(-1);
    expect(top).toBeGreaterThanOrEqual(-1);
    expect(right).toBeLessThanOrEqual(viewportWidth + 1);
    expect(bottom).toBeLessThanOrEqual(viewportHeight + 1);
}

async function activateWithKeyboard(page, selector) {
    const button = page.locator(selector);
    await expect(button).toBeVisible();
    await button.focus();
    await expect(button).toBeFocused();
    await page.keyboard.press('Enter');
}

async function expectDialog(page, selector, closeDialog, trigger) {
    await expectDialogFits(page, selector);
    await expect(page.locator(`${selector} :focus`)).toBeVisible();
    await closeDialog();
    await expect(page.locator(selector)).toBeHidden();
    await expect(page.locator(trigger)).toBeFocused();
}

for (const [width, height] of viewports) {
    test.describe(`${width}x${height}`, () => {
        test.use({ viewport: { width, height }, isMobile: width <= 1024, hasTouch: width <= 1024, reducedMotion: 'reduce' });

        test('creation, history, timer modes and dialogs fit the viewport', async ({ page }) => {
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.addInitScript(() => {
                Object.defineProperty(navigator, 'clipboard', { value: undefined });
            });
            await page.goto('/');
            await page.evaluate(() => document.fonts.ready);
            await expect(page.locator('#create-form')).toBeVisible();
            await expectLayout(page, 'initial create form');
            if (sampleWidths.includes(width)) await capture(page, `${width}-create`);

            await page.locator('#mode-target').click();
            await expect(page.locator('#target-date')).toBeVisible();
            await expectLayout(page, 'deadline form');
            await page.locator('#type-stopwatch').click();
            await expectLayout(page, 'stopwatch form');
            await page.locator('#sw-mode-target').click();
            await expect(page.locator('#sw-target-date')).toBeVisible();
            await expectLayout(page, 'scheduled stopwatch form');
            if (sampleWidths.includes(width)) await capture(page, `${width}-scheduled`);

            await loadSavedTimers(page);
            const longTimer = page.getByRole('link', { name: new RegExp(longName) });
            await expect(longTimer).toBeVisible();
            await expectLayout(page, 'saved timers');
            if (sampleWidths.includes(width)) await capture(page, `${width}-history`);
            await longTimer.click();
            await expect(page.locator('#timer-name-display')).toHaveText(longName);
            for (const mode of ['normal', 'minutes', 'seconds']) {
                await page.locator(`#mode-${mode}-btn`).click();
                await expect(page.locator(`#mode-${mode}-btn`)).toHaveAttribute('aria-pressed', 'true');
                await expectLayout(page, `long stopwatch in ${mode} mode`);
            }
            if (sampleWidths.includes(width)) await capture(page, `${width}-long-timer`);

            await activateWithKeyboard(page, '#share-btn');
            await expect(page.locator('#copy-value')).toHaveValue(/#(?:\*|s\/)/);
            if (sampleWidths.includes(width)) await capture(page, `${width}-copy-dialog`);
            await expectDialog(page, '#copy-dialog', () => page.keyboard.press('Escape'), '#share-btn');

            await page.locator('#back-to-home').click();
            await page.getByRole('link', { name: /프로젝트 마감/ }).click();
            await page.locator('#mode-normal-btn').click();
            await expectLayout(page, 'deadline timer');
            if (sampleWidths.includes(width)) await capture(page, `${width}-deadline-timer`);
            await activateWithKeyboard(page, '#change-target-btn');
            if (sampleWidths.includes(width)) await capture(page, `${width}-deadline-dialog`);
            await expectDialog(page, '#change-target-modal', () => page.locator('#cancel-change-btn').click(), '#change-target-btn');
            expect(errors).toEqual([]);
        });
    });
}

test('rotating and resizing keep the open dialog and its controls reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await loadSavedTimers(page);
    await page.getByRole('link', { name: /프로젝트 마감/ }).click();
    await activateWithKeyboard(page, '#change-target-btn');
    for (const [width, height] of [[844, 390], [568, 320], [820, 1180], [1180, 820], [1440, 900], [320, 568]]) {
        await page.setViewportSize({ width, height });
        expect(await page.evaluate(() => matchMedia('(orientation: portrait)').matches)).toBe(height >= width);
        await expectDialogFits(page, '#change-target-modal');
        const apply = page.locator('#confirm-change-btn');
        await apply.scrollIntoViewIfNeeded();
        await expect(apply).toBeInViewport();
    }
    await expectDialog(page, '#change-target-modal', () => page.keyboard.press('Escape'), '#change-target-btn');
    await expectLayout(page, 'timer after resizing');
});

test.describe('saved timers on touch', () => {
    test.use({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });

    test('the second tap confirms removal and restores focus to the list', async ({ page }) => {
        await page.goto('/');
        await loadSavedTimers(page);
        const rows = page.locator('#timer-list-container').getByRole('listitem');
        await expect(rows).toHaveCount(2);
        await rows.first().getByRole('button', { name: '목록에서 삭제' }).tap();
        const confirmation = page.getByRole('button', { name: '삭제 확인' });
        await expect(confirmation).toBeVisible();
        await expectLayout(page, 'saved timer removal confirmation');
        await confirmation.tap();
        await expect(rows).toHaveCount(1);
        await expect(page.getByRole('link', { name: /프로젝트 마감/ })).toBeFocused();
    });
});

test('fullscreen clock and controls stay within the available area after resizing', async ({ page }) => {
    await page.goto('/');
    await loadSavedTimers(page);
    await page.getByRole('link', { name: new RegExp(longName) }).click();
    test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), 'Fullscreen API unavailable');
    await page.locator('#fullscreen-btn').click();
    await expect(page.locator('#app:fullscreen')).toBeVisible();
    // Exercise wider glyph metrics than the system font used by the test runner.
    await page.addStyleTag({ content: '.timer-clock { font-family: monospace; letter-spacing: .16em; }' });

    for (const [width, height] of [[1920, 1080], [320, 568], [844, 390], [844, 180], [620, 140], [1180, 820]]) {
        await page.setViewportSize({ width, height });
        for (const mode of ['normal', 'minutes', 'seconds']) {
            await page.locator(`#mode-${mode}-btn`).evaluate(button => button.click());
            await expect.poll(() => page.locator('#app').evaluate(app => {
                const bounds = app.getBoundingClientRect();
                const overflow = [];
                if (app.scrollWidth > app.clientWidth + 1) overflow.push('horizontal scrolling');
                if (app.scrollHeight > app.clientHeight + 1) overflow.push('vertical scrolling');
                const right = bounds.left + app.clientWidth;
                const bottom = bounds.top + app.clientHeight;
                const display = app.querySelector('#timer-display');
                const text = document.createRange();
                text.selectNodeContents(display.querySelector('.timer-clock'));
                const displayBounds = display.getBoundingClientRect();
                for (const rect of text.getClientRects()) {
                    if (rect.left < displayBounds.left - 1 || rect.right > displayBounds.right + 1) {
                        overflow.push('clock text extends outside the display');
                        break;
                    }
                }
                return [...app.querySelectorAll('#timer-view button, .timer-clock-part')]
                    .filter(element => element.checkVisibility())
                    .filter(element => {
                        const rect = element.getBoundingClientRect();
                        return rect.left < bounds.left - 1 || rect.right > right + 1
                            || rect.top < bounds.top - 1 || rect.bottom > bottom + 1;
                    }).map(element => element.id || element.textContent).concat(overflow);
            }), `${width}x${height}, ${mode}`).toEqual([]);
        }
    }
    await page.locator('#fullscreen-btn').click();
    await expect(page.locator('#app:fullscreen')).toHaveCount(0);
});
