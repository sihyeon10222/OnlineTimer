import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { encodeSnapshot, normalizeLegacy } from '../legacy.js';

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
            await expect(page.getByRole('heading', { level: 1 })).toHaveText('새 타이머 만들기');
            const form = await page.locator('#create-form').boundingBox();
            const list = await page.locator('#timer-list-section').boundingBox();
            if (width >= 768) {
                expect(list.x).toBeGreaterThan(form.x + form.width);
                expect(list.y).toBeCloseTo(form.y);
            } else {
                expect(list.x).toBeCloseTo(form.x);
                expect(list.y).toBeGreaterThan(form.y + form.height);
            }
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
            await expect(page.locator('#create-title')).toBeFocused();
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

test('motion follows form changes, list updates, dialogs and keyboard interaction', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await loadSavedTimers(page);

    await page.locator('#mode-target').click();
    const ampm = page.locator('#target-ampm');
    if (await ampm.evaluate(element => getComputedStyle(element).appearance === 'base-select')) {
        await ampm.click();
        await expect(ampm).toHaveCSS('appearance', 'base-select');
        await expect.poll(() => ampm.evaluate(element => element.matches(':open'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect.poll(() => ampm.evaluate(element => element.matches(':open'))).toBe(false);
    }
    await page.locator('#mode-duration').click();
    await expect(page.locator('#create-options')).not.toHaveAttribute('data-resizing');
    const options = page.locator('#create-options');
    const selector = page.locator('.timer-type-selector');
    const selection = () => selector.evaluate(element => getComputedStyle(element, '::before').transform);
    const initialSelection = await selection();
    const expansion = await options.evaluate(element => {
        document.querySelector('#type-stopwatch').click();
        const resize = element.getAnimations().find(animation => animation.effect.getKeyframes().some(frame => frame.height));
        return resize?.effect.getTiming().duration;
    });
    expect(expansion).toBe(220);
    await expect.poll(selection).not.toBe(initialSelection);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(options).not.toHaveAttribute('data-resizing');
    await page.locator('#sw-mode-target').click();
    await expect(page.locator('#sw-target-date')).toBeVisible();
    await expect(options).not.toHaveAttribute('data-resizing');
    await expectLayout(page, 'scheduled form after expansion and resize');

    const toggle = page.locator('#saved-toggle');
    const panel = page.locator('#saved-panel');
    const expandedHeight = (await panel.boundingBox()).height;
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('link', { name: /프로젝트 마감/ })).toHaveCount(0);
    await expect.poll(async () => (await panel.boundingBox())?.height || 0).toBe(0);
    await toggle.press('Enter');
    await expect.poll(async () => (await panel.boundingBox()).height).toBeCloseTo(expandedHeight);

    const rowChanges = await panel.evaluate(element => {
        const timers = JSON.parse(localStorage.getItem('timerList'));
        localStorage.setItem('timerList', JSON.stringify([{ id: 'new', name: '새 항목', type: 'stopwatch' }, ...timers.reverse()]));
        window.dispatchEvent(new StorageEvent('storage', { key: 'timerList' }));
        return [...element.querySelectorAll('li')].map(row => row.getAnimations().flatMap(animation => animation.effect.getKeyframes()));
    });
    expect(rowChanges[0][0].opacity).toBe('0');
    expect(rowChanges[1][0].transform).toMatch(/translateY/);
    await expect(page.getByRole('link', { name: /새 항목/ })).toBeVisible();
    const exit = await page.locator('[data-key="local:new"] button').evaluate(button => {
        button.click();
        button.click();
        return document.querySelector('.timer-list-item[aria-hidden]')?.getAnimations()[0]?.effect.getTiming().duration;
    });
    expect(exit).toBe(180);
    await expect(page.locator('.timer-list-item[aria-hidden]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /새 항목/ })).toHaveCount(0);

    await page.getByRole('link', { name: /프로젝트 마감/ }).click();
    await expect(page.locator('#timer-name-display')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#back-to-home')).toBeFocused();
    const tooltip = page.locator('#action-tooltip');
    await expect(tooltip).toHaveAttribute('data-visible', 'focus');
    await expect(tooltip).toHaveText('타이머 만들기');
    await page.keyboard.press('Escape');
    await expect(tooltip).not.toHaveAttribute('data-visible');

    await activateWithKeyboard(page, '#change-target-btn');
    const dialog = page.locator('#change-target-modal');
    await expect(dialog).toHaveCSS('opacity', '1');
    await expectDialogFits(page, '#change-target-modal');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#change-target-btn')).toBeFocused();

    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    await expect(page.locator('body')).toHaveClass('dark-mode');
    await capture(page, '390-dark-timer');
    await page.locator('#back-to-home').click();
    await page.locator('#type-countdown').click();
    await expect(options).not.toHaveAttribute('data-resizing');
    await expect(page.locator('#landing-view')).toHaveCSS('animation-name', 'none');
    expect(await selection()).toBe(initialSelection);
    await expectLayout(page, 'dark home with reduced motion');
    await capture(page, '390-dark-home');
});

test('a shared timer uses a skeleton until its clock is ready', async ({ page }) => {
    const timer = normalizeLegacy({ type: 'stopwatch', active: false, pauseTime: 90, timerName: '공유 스톱워치' }, Date.now());
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/query', async route => {
        await gate;
        await route.fulfill({
            headers: { 'access-control-allow-origin': '*' },
            json: { status: 'success', value: { role: 'snapshot', snapshot: encodeSnapshot(timer).slice(2) } }
        });
    });
    try {
        await page.goto('/#s/ABCDEFGHIJKLMNOPQRSTUV');
        const display = page.locator('#timer-display');
        await expect(display).toHaveClass(/loading/);
        await expect(display).toHaveAttribute('aria-busy', 'true');
        await expect(display).toHaveAccessibleName('시간 불러오는 중');
        expect(await display.evaluate(element => getComputedStyle(element, '::before').animationName)).toBe('clock-skeleton');
        release();
        await expect(page.locator('#timer-name-display')).toHaveText('공유 스톱워치');
        await expect(display).not.toHaveAttribute('aria-busy');
        await expect(display.locator('.timer-clock')).toHaveText('00:01:3000');
    } finally {
        release();
    }
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

test('the clock fits wide glyphs and scaled layouts in both timer views', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 620 });
    await page.goto('/');
    await loadSavedTimers(page);
    await expect(page.getByText('100,000,000일 00:00:00 · 일시정지')).toBeVisible();
    await page.getByRole('link', { name: new RegExp(longName) }).click();
    await page.addStyleTag({ content: '.timer-clock { font-family: monospace; letter-spacing: .16em; }' });

    const groupedValues = {
        normal: ['[data-days]', '100,000,000'],
        minutes: ['[data-minutes]', '144,000,000,000'],
        seconds: ['[data-time]', '8,640,000,000,000']
    };
    const clockOverflow = () => page.locator('#timer-display').evaluate(display => {
        const bounds = display.getBoundingClientRect();
        const clock = display.querySelector('.timer-clock');
        const text = document.createRange();
        text.selectNodeContents(clock);
        return [...text.getClientRects(), ...[...clock.children].map(part => part.getBoundingClientRect())].some(rect =>
            rect.left < bounds.left + 4 || rect.right > bounds.right - 4
        );
    });

    for (const [mode, [selector, value]] of Object.entries(groupedValues)) {
        await page.locator(`#mode-${mode}-btn`).click();
        await expect(page.locator(`#timer-display ${selector}`)).toHaveText(value);
        await expect.poll(clockOverflow, `regular layout, ${mode}`).toBe(false);
    }
    if (!(await page.evaluate(() => document.fullscreenEnabled))) return;

    await page.locator('#fullscreen-btn').click();
    await expect(page.locator('#app:fullscreen')).toBeVisible();

    for (const [width, height, scale = 1] of [
        [1920, 1080], [320, 568], [844, 390, .8], [844, 180], [620, 140], [1180, 820, 1.25]
    ]) {
        await page.setViewportSize({ width, height });
        await page.locator('#timer-display').evaluate((display, scale) => { display.style.zoom = scale; }, scale);
        for (const [mode, [selector, value]] of Object.entries(groupedValues)) {
            await page.locator(`#mode-${mode}-btn`).evaluate(button => button.click());
            await expect(page.locator(`#timer-display ${selector}`)).toHaveText(value);
            await expect.poll(clockOverflow, `fullscreen ${width}x${height} scale ${scale}, ${mode}`).toBe(false);
            await expect.poll(() => page.locator('#app').evaluate(app => {
                const bounds = app.getBoundingClientRect();
                const overflow = [];
                if (app.scrollWidth > app.clientWidth + 1) overflow.push('horizontal scrolling');
                if (app.scrollHeight > app.clientHeight + 1) overflow.push('vertical scrolling');
                const right = bounds.left + app.clientWidth;
                const bottom = bounds.top + app.clientHeight;
                return [...app.querySelectorAll('#timer-view button')]
                    .filter(element => element.checkVisibility())
                    .filter(element => {
                        const rect = element.getBoundingClientRect();
                        return rect.left < bounds.left - 1 || rect.right > right + 1
                            || rect.top < bounds.top - 1 || rect.bottom > bottom + 1;
                    }).map(element => element.id).concat(overflow);
            }), `${width}x${height}, ${mode}`).toEqual([]);
        }
    }
    await page.locator('#fullscreen-btn').click();
    await expect(page.locator('#app:fullscreen')).toHaveCount(0);
});
