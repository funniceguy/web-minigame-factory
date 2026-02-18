import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TARGETS = [
    {
        type: 'html',
        folder: 'html',
        extension: '.html',
        registryPath: path.join(rootDir, 'src', 'html', 'registry.json'),
        sourceDir: path.join(rootDir, 'src', 'html'),
        ignoredFiles: new Set(['registry.json'])
    },
    {
        type: 'jsx',
        folder: 'jsx',
        extension: '.jsx',
        registryPath: path.join(rootDir, 'src', 'jsx', 'registry.json'),
        sourceDir: path.join(rootDir, 'src', 'jsx'),
        ignoredFiles: new Set([
            'MiniGameFrame.jsx'
        ])
    }
];

const OPTIONAL_KEYS = [
    'id',
    'name',
    'description',
    'icon',
    'color',
    'gradient',
    'enabled',
    'hidden',
    'order',
    'sourcePriority',
    'priority',
    'htmlPath',
    'html'
];

function normalizeRegistryPath(rawPath, folder, extension) {
    if (!rawPath || typeof rawPath !== 'string') return null;

    let normalized = rawPath.trim();
    if (!normalized) return null;

    normalized = normalized.replace(/\\/g, '/');
    if (normalized.includes('?')) normalized = normalized.split('?')[0];
    if (normalized.includes('#')) normalized = normalized.split('#')[0];

    const folderToken = `/src/${folder}/`;
    if (normalized.includes(folderToken)) {
        normalized = normalized.slice(normalized.indexOf(folderToken));
    } else if (normalized.startsWith(`src/${folder}/`)) {
        normalized = `/${normalized}`;
    } else if (!normalized.startsWith('/')) {
        normalized = `/src/${folder}/${normalized}`;
    }

    if (!normalized.toLowerCase().endsWith(extension)) {
        return null;
    }

    return normalized;
}

async function loadJson(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        return null;
    }
}

function readRegistryEntries(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.games)) return data.games;
    return [];
}

function buildExistingEntryMap(entries, folder, extension) {
    const existingByPath = new Map();

    entries.forEach((entry) => {
        const pathLike = typeof entry === 'string'
            ? entry
            : entry?.path || entry?.file || entry?.scriptPath || entry?.script;

        const normalizedPath = normalizeRegistryPath(pathLike, folder, extension);
        if (!normalizedPath) return;

        if (typeof entry === 'string') {
            existingByPath.set(normalizedPath, { path: normalizedPath });
            return;
        }

        if (!entry || typeof entry !== 'object') {
            return;
        }

        const normalizedEntry = { path: normalizedPath };
        for (const key of OPTIONAL_KEYS) {
            if (entry[key] === undefined) continue;
            normalizedEntry[key] = entry[key];
        }

        existingByPath.set(normalizedPath, normalizedEntry);
    });

    return existingByPath;
}

async function listSourceFiles(sourceDir, extension, ignoredFiles) {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((fileName) => fileName.toLowerCase().endsWith(extension))
        .filter((fileName) => !ignoredFiles.has(fileName))
        .sort((a, b) => a.localeCompare(b));
}

async function buildRegistry(target) {
    const existingData = await loadJson(target.registryPath);
    const existingEntries = readRegistryEntries(existingData);
    const existingByPath = buildExistingEntryMap(
        existingEntries,
        target.folder,
        target.extension
    );

    const sourceFiles = await listSourceFiles(
        target.sourceDir,
        target.extension,
        target.ignoredFiles
    );

    const games = sourceFiles.map((fileName) => {
        const discoveredPath = `/src/${target.folder}/${fileName}`;
        const existing = existingByPath.get(discoveredPath);
        if (existing) {
            return {
                ...existing,
                path: discoveredPath
            };
        }
        return {
            path: discoveredPath
        };
    });

    const registry = {
        version: 1,
        generatedAt: new Date().toISOString(),
        games
    };

    const output = `${JSON.stringify(registry, null, 2)}\n`;
    await fs.writeFile(target.registryPath, output, 'utf-8');

    return {
        target: target.type,
        count: games.length,
        registryPath: path.relative(rootDir, target.registryPath).replace(/\\/g, '/')
    };
}

async function run() {
    const results = [];
    for (const target of TARGETS) {
        const result = await buildRegistry(target);
        results.push(result);
    }

    results.forEach((result) => {
        console.log(`[sync:games] ${result.target}: ${result.count} entries -> ${result.registryPath}`);
    });
}

run().catch((error) => {
    console.error('[sync:games] failed:', error);
    process.exitCode = 1;
});
