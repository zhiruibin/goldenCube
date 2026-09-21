#!/usr/bin/env node
/** 分包结构、资源引用和 4MB 上限回归检查。 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIMIT = 4 * 1024 * 1024;
const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.config.json'), 'utf8'));
const game = JSON.parse(fs.readFileSync(path.join(ROOT, 'game.json'), 'utf8'));
const packages = Array.isArray(game.subpackages) ? game.subpackages : [];
const packageRoots = packages.map((item) => String(item.root || '').replace(/\/$/, ''));
const ignoredFolders = new Set(
    ((project.packOptions && project.packOptions.ignore) || [])
        .filter((item) => item.type === 'folder')
        .map((item) => item.value)
        .concat(['.git', 'node_modules'])
);
const ignoredFiles = new Set(
    ((project.packOptions && project.packOptions.ignore) || [])
        .filter((item) => item.type === 'file')
        .map((item) => item.value)
);

let passed = 0;
let failed = 0;
function check(ok, label) {
    if (ok) { passed++; console.log('  PASS', label); }
    else { failed++; console.log('  FAIL', label); }
}

function treeSize(dir, mainPackage) {
    let total = 0;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        const rel = path.relative(ROOT, full).replace(/\\/g, '/');
        if (entry.isDirectory()) {
            if (mainPackage && (ignoredFolders.has(rel) || packageRoots.indexOf(rel) >= 0)) return;
            total += treeSize(full, mainPackage);
            return;
        }
        if (!mainPackage || !ignoredFiles.has(rel)) total += fs.statSync(full).size;
    });
    return total;
}

console.log('小游戏分包回归检查');
check(packages.length === 3, 'game.json 声明 3 个资源分包');
packages.forEach((item) => {
    const dir = path.join(ROOT, item.root);
    check(fs.existsSync(path.join(dir, 'game.js')), item.name + ' 包含入口 game.js');
    const bytes = treeSize(dir, false);
    check(bytes < LIMIT, item.name + ' 小于 4MB（' + (bytes / 1024 / 1024).toFixed(2) + 'MB）');
});

const mainBytes = treeSize(ROOT, true);
check(mainBytes < LIMIT, '主包小于 4MB（' + (mainBytes / 1024 / 1024).toFixed(2) + 'MB）');

const themeSource = fs.readFileSync(path.join(ROOT, 'js/theme/theme-images.js'), 'utf8');
const themeBody = (themeSource.match(/const THEME_PATHS = \{([\s\S]*?)\n\};/) || [])[1] || '';
const themePaths = Array.from(themeBody.matchAll(/:\s*'([^']+)'/g), (match) => match[1]);
const missing = themePaths.filter((assetPath) => !fs.existsSync(path.join(ROOT, assetPath)));
check(missing.length === 0, '全部主题资源路径存在（' + themePaths.length + ' 项）');
if (missing.length) missing.forEach((item) => console.log('       missing:', item));

check(/const STARTUP_THEME_KEYS = \[/.test(themeSource)
    && /const list = Array\.isArray\(keys\).*STARTUP_THEME_KEYS/.test(themeSource),
'启动预加载使用白名单而非全部主题资源');

console.log('\n==== RESULT ====');
console.log('passed:', passed, 'failed:', failed);
if (failed) process.exitCode = 1;
else console.log('ALL TESTS PASSED');
