import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../apps/games.js', import.meta.url), 'utf8');

const plannedEntries = [...source.matchAll(/status:\s*'planned'[\s\S]*?\n\s*}/g)];
assert.ok(plannedEntries.length > 0, '游戏中心保留 planned 游戏配置');

const openGameMatch = source.match(/async function openGame\(gameId\) \{([\s\S]*?)\n}\n\nasync function returnToHub/);
assert.ok(openGameMatch, 'openGame function exists');

const openGameBody = openGameMatch[1];
const plannedGuardIndex = openGameBody.indexOf("game.status === 'planned'");
const importIndex = openGameBody.indexOf('import(game.module)');
assert.ok(plannedGuardIndex >= 0, 'planned 游戏入口点击时先走搭建中分支');
assert.ok(importIndex >= 0, 'ready 游戏仍保留动态导入逻辑');
assert.ok(plannedGuardIndex < importIndex, 'planned 分支必须在动态 import 之前执行');
assert.match(openGameBody, /showToast\('这个小世界还在搭建'\)/, 'planned 分支保留搭建中文案');

console.log('game hub planned entry checks passed');
