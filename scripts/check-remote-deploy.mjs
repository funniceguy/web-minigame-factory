import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const DEFAULT_BASE_URL = 'http://168.107.60.59/web-minigame-factory';

const targets = [
    {
        label: 'entry',
        localPath: 'index.html',
        remotePath: '/'
    },
    {
        label: 'hub',
        localPath: 'src/platform/GameHub.js',
        remotePath: '/src/platform/GameHub.js'
    },
    {
        label: 'biztycoon',
        localPath: 'src/html/neon_biztycoon.html',
        remotePath: '/src/html/neon_biztycoon.html'
    }
];

function normalizeText(text) {
    return text.replace(/\r\n/g, '\n').trimEnd();
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function color(value, code) {
    return `\x1b[${code}m${value}\x1b[0m`;
}

function okLabel(text) {
    return color(`OK  ${text}`, 32);
}

function warnLabel(text) {
    return color(`WARN ${text}`, 33);
}

function failLabel(text) {
    return color(`FAIL ${text}`, 31);
}

function resolveBaseUrl() {
    const input = process.argv[2]?.trim();
    if (!input) return DEFAULT_BASE_URL;
    return input.endsWith('/') ? input.slice(0, -1) : input;
}

function joinUrl(baseUrl, remotePath) {
    const pathSegment = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;
    return `${baseUrl}${pathSegment}`;
}

async function fetchHead(url) {
    const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-store'
    });
    return response;
}

async function fetchText(url) {
    const response = await fetch(url, {
        cache: 'no-store'
    });
    if (!response.ok) {
        throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
    }
    return response.text();
}

function printCacheCheck(url, response) {
    const cacheControl = response.headers.get('cache-control');
    const pragma = response.headers.get('pragma');
    const expires = response.headers.get('expires');
    const lastModified = response.headers.get('last-modified');

    console.log(`\n[HEAD] ${url}`);
    console.log(`  status: ${response.status}`);
    console.log(`  cache-control: ${cacheControl || '(none)'}`);
    console.log(`  pragma: ${pragma || '(none)'}`);
    console.log(`  expires: ${expires || '(none)'}`);
    console.log(`  last-modified: ${lastModified || '(none)'}`);

    if (!cacheControl) {
        console.log(`  ${warnLabel('Cache-Control missing')}`);
        return;
    }

    const normalized = cacheControl.toLowerCase();
    const hasSafePolicy = normalized.includes('no-cache')
        || normalized.includes('no-store')
        || normalized.includes('must-revalidate');

    if (hasSafePolicy) {
        console.log(`  ${okLabel('cache policy looks safe')}`);
    } else {
        console.log(`  ${warnLabel('cache policy may keep stale responses')}`);
    }
}

async function compareTarget(baseUrl, target) {
    const localAbsPath = path.join(rootDir, target.localPath);
    const remoteUrl = joinUrl(baseUrl, target.remotePath);

    const [localText, remoteText] = await Promise.all([
        fs.readFile(localAbsPath, 'utf-8'),
        fetchText(`${remoteUrl}?_verify=${Date.now()}`)
    ]);

    const localNormalized = normalizeText(localText);
    const remoteNormalized = normalizeText(remoteText);
    const same = localNormalized === remoteNormalized;

    const localHash = sha256(localNormalized);
    const remoteHash = sha256(remoteNormalized);

    console.log(`\n[COMPARE] ${target.label}`);
    console.log(`  local:  ${target.localPath}`);
    console.log(`  remote: ${remoteUrl}`);
    console.log(`  local hash:  ${localHash}`);
    console.log(`  remote hash: ${remoteHash}`);
    console.log(`  ${same ? okLabel('content match') : failLabel('content mismatch')}`);

    return same;
}

async function run() {
    const baseUrl = resolveBaseUrl();
    console.log(`[check-remote-deploy] base URL: ${baseUrl}`);

    const headUrls = [
        joinUrl(baseUrl, '/'),
        joinUrl(baseUrl, '/src/platform/GameHub.js'),
        joinUrl(baseUrl, '/src/html/neon_biztycoon.html')
    ];

    for (const url of headUrls) {
        try {
            const response = await fetchHead(url);
            printCacheCheck(url, response);
        } catch (error) {
            console.log(`\n[HEAD] ${url}`);
            console.log(`  ${failLabel(error.message)}`);
        }
    }

    let allMatched = true;
    for (const target of targets) {
        try {
            const same = await compareTarget(baseUrl, target);
            if (!same) allMatched = false;
        } catch (error) {
            allMatched = false;
            console.log(`\n[COMPARE] ${target.label}`);
            console.log(`  ${failLabel(error.message)}`);
        }
    }

    if (!allMatched) {
        process.exitCode = 1;
        console.log(`\n${failLabel('remote deploy check failed')}`);
        return;
    }

    console.log(`\n${okLabel('remote deploy check passed')}`);
}

run().catch((error) => {
    console.error(failLabel(`[check-remote-deploy] ${error.message}`));
    process.exitCode = 1;
});
