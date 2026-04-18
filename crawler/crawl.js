const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL = process.env.RUBINOT_BASE_URL || 'https://rubinot.com.br';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const DATA_ROOT = path.resolve(__dirname, '..', 'data');
const WORLDS = require('./worlds.json');

const todayUtc = () => new Date().toISOString().slice(0, 10);

async function primePage(browser) {
    const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'pt-BR' });
    const page = await context.newPage();

    console.log(`[init] navigating to ${BASE_URL}/killstats`);
    await page.goto(`${BASE_URL}/killstats`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    try {
        await page.waitForLoadState('networkidle', { timeout: 45000 });
    } catch {
        console.log('[init] networkidle timeout');
    }

    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        const status = await page.evaluate(async () => {
            const r = await fetch('/api/killstats?world=11', { headers: { accept: 'application/json' } });
            return r.status;
        });
        if (status === 200) {
            console.log('[init] CF cleared (probe 200)');
            return { context, page };
        }
        console.log(`[init] probe ${status}, waiting...`);
        await page.waitForTimeout(3000);
    }

    throw new Error('init: CF challenge did not resolve within 90s');
}

async function crawlWorld(page, world) {
    const entries = await page.evaluate(async (id) => {
        const r = await fetch(`/api/killstats?world=${id}`, { headers: { accept: 'application/json' } });
        if (!r.ok) return { error: `HTTP ${r.status}` };
        const j = await r.json();
        return { entries: j.entries || [] };
    }, world.external_id);

    if (entries.error) {
        throw new Error(`world ${world.name}: ${entries.error}`);
    }

    const mapped = entries.entries.map((e) => ({
        race: e.race_name,
        last_day_players_killed: e.players_killed_24h ?? 0,
        last_day_killed: e.creatures_killed_24h ?? 0,
        last_week_players_killed: e.players_killed_7d ?? 0,
        last_week_killed: e.creatures_killed_7d ?? 0,
    }));

    return mapped;
}

async function writeWorldFile(worldName, date, entries) {
    const dir = path.join(DATA_ROOT, worldName.toLowerCase());
    await fs.mkdir(dir, { recursive: true });

    const payload = {
        killstatistics: {
            world: worldName,
            date,
            entries,
        },
    };

    const filepath = path.join(dir, `${date}.json`);
    await fs.writeFile(filepath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
    return filepath;
}

async function main() {
    const date = todayUtc();
    console.log(`[run] target date: ${date}`);
    console.log(`[run] worlds: ${WORLDS.length}`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });

    let succeeded = 0;
    let failed = 0;

    try {
        const { page } = await primePage(browser);

        for (const world of WORLDS) {
            try {
                const entries = await crawlWorld(page, world);

                if (entries.length === 0) {
                    console.log(`[${world.name}] empty entries (skipping write)`);
                    failed++;
                    continue;
                }

                const filepath = await writeWorldFile(world.name, date, entries);
                console.log(`[${world.name}] ${entries.length} entries → ${path.relative(process.cwd(), filepath)}`);
                succeeded++;
            } catch (err) {
                console.error(`[${world.name}] failed: ${err.message}`);
                failed++;
            }
        }
    } finally {
        await browser.close();
    }

    console.log(`\n[done] ${succeeded}/${WORLDS.length} worlds written, ${failed} failed`);

    if (succeeded === 0) {
        process.exit(2);
    }
}

main().catch((err) => {
    console.error('fatal:', err.message);
    process.exit(1);
});
