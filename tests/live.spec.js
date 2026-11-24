import { randomBytes } from 'node:crypto';
import { expect, test, devices } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { setTimeout as delay } from 'node:timers/promises';

const fn = name => makeFunctionReference(`timers:${name}`);
const backend = new ConvexHttpClient(process.env.E2E_CONVEX_URL || 'http://127.0.0.1:3210', { logger: false });
const id = size => randomBytes(size).toString('hex');
const liveStatus = page => page.locator('#timer-status');
const label = page => page.locator('#timer-type-label');
const display = page => page.locator('#timer-display');

function viewLink(url) {
    const address = new URL(url);
    address.hash = address.hash.split('/').slice(0, 3).join('/');
    return address.href;
}

async function localDateInput(page, prefix, timestamp) {
    const date = new Date(timestamp);
    const day = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()].map(x => String(x).padStart(2, '0')).join('-');
    await page.locator(`#${prefix}-date`).fill(day);
    await page.locator(`#${prefix}-ampm`).selectOption(date.getUTCHours() < 12 ? 'AM' : 'PM');
    await page.locator(`#${prefix}-hour`).fill(String(date.getUTCHours() % 12 || 12));
    await page.locator(`#${prefix}-minute`).fill(String(date.getUTCMinutes()));
    await page.locator(`#${prefix}-second`).fill(String(date.getUTCSeconds()));
}

test('two browser contexts share countdown, reconnect, reopen and keep running without the creator', async ({ browser, baseURL }) => {
    const controllerContext = await browser.newContext({ timezoneId: 'UTC', permissions: ['clipboard-read', 'clipboard-write'] });
    const viewerContext = await browser.newContext({ ...devices['iPhone 13'], defaultBrowserType: undefined, timezoneId: 'Asia/Seoul' });
    try {
        const controller = await controllerContext.newPage();
        const viewer = await viewerContext.newPage();
        await viewer.clock.setFixedTime(Date.now() + 5 * 60 * 1000);
        await controller.goto(baseURL);
        await controller.getByRole('button', { name: '1분', exact: true }).click();
        await controller.locator('#timer-name-input').fill('함께 보는 타이머');
        await controller.getByRole('button', { name: '타이머 생성하기' }).click();
        await expect(liveStatus(controller)).toHaveText('실시간 연결됨');
        const controlUrl = controller.url();
        const viewUrl = viewLink(controlUrl);
        await controller.locator('#share-btn').click();
        await expect.poll(() => controller.evaluate(() => navigator.clipboard.readText())).toBe(viewUrl);
        await controller.locator('#control-link-btn').click();
        await expect.poll(() => controller.evaluate(() => navigator.clipboard.readText())).toBe(controlUrl);
        await viewer.goto(viewUrl);
        await expect(liveStatus(viewer)).toContainText('보기 전용');
        await expect(viewer.locator('#timer-name-display')).toHaveText('함께 보는 타이머');
        await expect(viewer.locator('#controls')).toBeHidden();
        await expect(viewer.locator('#alarm-btn')).toHaveAttribute('aria-pressed', 'false');
        expect(await viewer.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            await viewer.evaluate(() => window.innerWidth)
        );

        await controller.getByRole('button', { name: '시작', exact: true }).click();
        await expect(label(viewer)).toContainText('진행 중');
        await expect.poll(async () => {
            const milliseconds = async page => {
                const [hours, minutes, seconds, fraction] = (await display(page).textContent()).match(/\d{2}/g).map(Number);
                return (hours * 3600 + minutes * 60 + seconds) * 1000 + fraction * 10;
            };
            return Math.abs(await milliseconds(controller) - await milliseconds(viewer));
        }).toBeLessThan(600);

        await controller.getByRole('button', { name: '일시정지' }).click();
        await expect(label(viewer)).toContainText('일시정지');
        const paused = await display(viewer).textContent();
        await viewer.reload();
        await expect(liveStatus(viewer)).toContainText('보기 전용');
        await expect(display(viewer)).toHaveText(paused);
        await controller.getByRole('button', { name: '재개' }).click();
        await expect(label(viewer)).toContainText('진행 중');

        await controllerContext.setOffline(true);
        await expect(liveStatus(controller)).toContainText('연결 끊김');
        await expect(controller.getByRole('button', { name: '다시 시작' })).toBeDisabled();
        const remoteController = await viewerContext.newPage();
        await remoteController.goto(controlUrl);
        await expect(liveStatus(remoteController)).toHaveText('실시간 연결됨');
        await remoteController.getByRole('button', { name: '초기화' }).click();
        await expect(label(viewer)).toContainText('시작 전');
        await controllerContext.setOffline(false);
        await expect(liveStatus(controller)).toHaveText('실시간 연결됨');
        await expect(label(controller)).toContainText('시작 전');
        await expect(label(viewer)).toContainText('시작 전');
        await remoteController.close();
        await controller.getByRole('button', { name: '다시 시작' }).click();
        await expect(label(viewer)).toContainText('진행 중');
        const beforeClose = await display(viewer).innerText();
        await controller.close();
        await expect.poll(() => display(viewer).innerText()).not.toBe(beforeClose);
        await expect(label(viewer)).toContainText('진행 중');

        const reopened = await controllerContext.newPage();
        await reopened.goto(baseURL);
        await reopened.getByRole('link', { name: /함께 보는 타이머/ }).click();
        await expect(liveStatus(reopened)).toHaveText('실시간 연결됨');
        await reopened.goto(viewUrl);
        await expect(liveStatus(reopened)).toContainText('보기 전용');
        await expect(reopened.locator('#controls')).toBeHidden();
    } finally {
        await viewerContext.close();
        await controllerContext.close();
    }
});

test('private deadline link works on another device and viewers only receive the changed deadline', async ({ browser, baseURL }) => {
    const creatorContext = await browser.newContext({ timezoneId: 'UTC' });
    const otherContext = await browser.newContext({ timezoneId: 'UTC', isMobile: true, viewport: { width: 390, height: 844 } });
    try {
        const creator = await creatorContext.newPage();
        const viewer = await otherContext.newPage();
        const manager = await otherContext.newPage();
        await creator.goto(baseURL);
        await creator.locator('#mode-target').click();
        await localDateInput(creator, 'target', Date.now() + 60000);
        await creator.getByRole('button', { name: '타이머 생성하기' }).click();
        await expect(liveStatus(creator)).toHaveText('실시간 연결됨');
        const manageUrl = creator.url();
        expect(manageUrl).toContain('/manage/');
        await viewer.goto(viewLink(manageUrl));
        await expect(liveStatus(viewer)).toContainText('보기 전용');
        await expect(viewer.locator('#change-target-btn')).toBeHidden();
        await manager.goto(manageUrl);
        await expect(liveStatus(manager)).toHaveText('실시간 연결됨');
        await expect(manager.locator('#toggle-btn')).toBeHidden();
        await expect(manager.locator('#reset-btn')).toBeHidden();
        await expect(manager.locator('#restart-btn')).toBeHidden();
        const before = await viewer.locator('#timer-info').innerText();
        await creator.getByRole('button', { name: '종료 시점 변경' }).click();
        await manager.getByRole('button', { name: '종료 시점 변경' }).click();
        await localDateInput(manager, 'new-target', Date.now() + 120000);
        await manager.getByRole('button', { name: '적용하기' }).click();
        await expect(viewer.locator('#timer-info')).not.toHaveText(before);
        const updated = await manager.locator('#timer-info').innerText();
        await expect(viewer.locator('#timer-info')).toHaveText(updated);
        await localDateInput(creator, 'new-target', Date.now() + 180000);
        await creator.getByRole('button', { name: '적용하기' }).click();
        await expect(creator.locator('#target-feedback')).toContainText('다른 기기의 변경');
        await expect(viewer.locator('#timer-info')).toHaveText(updated);
        await creator.getByRole('button', { name: '적용하기' }).click();
        await expect(viewer.locator('#timer-info')).not.toHaveText(updated);

        const wrongRole = new URL(manageUrl);
        wrongRole.hash = wrongRole.hash.replace('/manage/', '/control/');
        await manager.goto(wrongRole.href);
        await expect(liveStatus(manager)).toContainText('보기 전용');
        await expect(manager.locator('#change-target-btn')).toBeHidden();
    } finally {
        await otherContext.close();
        await creatorContext.close();
    }
});

test('server validates links and applies only one command per revision', async () => {
    const roomId = id(16);
    const key = id(32);
    const input = { roomId, key, mode: 'duration', name: '동시 조작', durationMs: 1000 };
    const [first, retry] = await Promise.all([
        backend.mutation(fn('create'), input, { skipQueue: true }),
        backend.mutation(fn('create'), input, { skipQueue: true })
    ]);
    expect(retry).toEqual(first);
    const published = await backend.query(fn('get'), { roomId });
    expect(published).not.toHaveProperty('accessHash');
    expect(published).not.toHaveProperty('key');
    expect(await backend.query(fn('authorize'), { roomId, key: id(32) })).toBeNull();
    await expect(backend.mutation(fn('apply'), {
        roomId, key: id(32), expectedRevision: 0, command: { type: 'start' }
    })).rejects.toThrow('forbidden');

    const commands = [{ type: 'start' }, { type: 'restart' }];
    const results = await Promise.all(commands.map(command =>
        backend.mutation(fn('apply'), { roomId, key, expectedRevision: 0, command }, { skipQueue: true })));
    expect(results.filter(result => result.applied)).toHaveLength(1);
    expect(results.find(result => !result.applied).reason).toBe('conflict');
    const timer = await backend.query(fn('get'), { roomId });
    expect(timer.revision).toBe(1);
    await delay(1050);
    const afterDeadline = await backend.mutation(fn('apply'), { roomId, key, expectedRevision: 1, command: { type: 'pause' } });
    expect(afterDeadline.reason).toBe('invalidAction');
    expect(afterDeadline.timer.revision).toBe(1);
});

test('existing local history and snapshot links can open and create a live copy', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
        localStorage.setItem('timerList', JSON.stringify([{ id: 'old123', name: '<회,의>', type: 'countdown' }]));
        localStorage.setItem('timer_state_old123', JSON.stringify({
            type: 'countdown', countdownMode: 'duration', active: false, pauseTime: 17,
            duration: 60, timerName: '<회,의>'
        }));
    });
    await page.goto(baseURL);
    await page.getByRole('link', { name: /<회,의>/ }).click();
    await expect(label(page)).toContainText('일시정지');
    await expect(display(page)).toHaveText('00:00:1700');
    await page.getByRole('button', { name: '실시간 링크 만들기' }).click();
    await expect(liveStatus(page)).toHaveText('실시간 연결됨');
    await expect(label(page)).toContainText('일시정지');
    await expect(display(page)).toHaveText('00:00:1700');
    await page.goto(new URL('#*,O0,,,,%ED%83%80%EC%9D%B4%EB%A8%B8', baseURL).href);
    await expect(liveStatus(page)).toContainText('이 기기에서만');
    await expect(page.locator('#timer-name-display')).toHaveText('타이머');
});

test('a scheduled stopwatch and an expired countdown are correct without an open creator page', async ({ page, baseURL }) => {
    const scheduledId = id(16);
    const scheduledKey = id(32);
    const targetAt = Date.now() + 3000;
    await backend.mutation(fn('create'), {
        roomId: scheduledId, key: scheduledKey, mode: 'scheduled', name: '예약', targetAt
    });
    await page.goto(new URL(`#/live/${scheduledId}`, baseURL).href);
    await expect(liveStatus(page)).toContainText('보기 전용');
    await expect(label(page)).toContainText('진행 중', { timeout: 8000 });
    await expect(display(page)).not.toHaveText('00:00:0000');

    const countdownId = id(16);
    const countdownKey = id(32);
    await backend.mutation(fn('create'), {
        roomId: countdownId, key: countdownKey, mode: 'duration', name: '짧은 타이머', durationMs: 1000
    });
    await backend.mutation(fn('apply'), {
        roomId: countdownId, key: countdownKey, command: { type: 'start' }, expectedRevision: 0
    });
    await delay(1050);
    await page.goto(new URL(`#/live/${countdownId}`, baseURL).href);
    await expect(label(page)).toContainText('종료됨');
    await expect(display(page)).toHaveText('00:00:0000');
    expect((await backend.query(fn('get'), { roomId: countdownId })).revision).toBe(1);
});
