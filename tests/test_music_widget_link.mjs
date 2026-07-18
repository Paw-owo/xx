import fs from 'node:fs';
import assert from 'node:assert/strict';

const music = fs.readFileSync(new URL('../apps/music.js', import.meta.url), 'utf8');
const desktop = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

assert.equal((music.match(/new Audio\(\)/g) || []).length, 1, 'music keeps one persistent playback Audio');
assert.match(music, /cover: song\?\.cover \|\| ''/, 'public state carries the real cover');
assert.match(music, /new CustomEvent\('music:statechange'/, 'all sync paths publish one state event');
assert.match(music, /options\.page === 'player'/, 'desktop can open the real player page');

assert.match(desktop, /getAPI\('music'\)/, 'widget controls use the registered public API');
assert.doesNotMatch(desktop, /window\.musicPlayer\?\.(?:togglePlay|playNext|playPrevious)/, 'widget does not call page globals');
assert.match(desktop, /window\.addEventListener\('music:statechange', updateVinylWidget\)/, 'widget updates immediately from player events');
assert.match(desktop, /if \(!vinylStateBound\)/, 'widget event subscription is registered once');
assert.doesNotMatch(desktop, /setInterval\(updateVinylWidget/, 'widget does not poll or duplicate playback state');
assert.match(desktop, /openApp\('music', \{ page: getAPI\('music'\)\?\.getCurrentSong/, 'widget body opens the current player or library');
assert.match(desktop, /snapshot\?\.sourceState === 'preparing'/, 'preparing is rendered from real state');
assert.match(desktop, /snapshot\?\.needsPlayGesture/, 'gesture-ready state is rendered without pretending to play');
assert.match(desktop, /snapshot\?\.sourceState === 'error'/, 'playback error is rendered from real state');

console.log('music widget link checks passed');
