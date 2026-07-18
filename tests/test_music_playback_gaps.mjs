import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../apps/music.js', import.meta.url), 'utf8');
const probeStart = source.indexOf('function probeMediaDuration');
const probeEnd = source.indexOf('\nasync function readID3', probeStart);
const probe = source.slice(probeStart, probeEnd);
const playStart = source.indexOf('async function playSong');
const toggleStart = source.indexOf('async function togglePlay', playStart);
const playSong = source.slice(playStart, toggleStart);

assert.equal((source.match(/const audio = new Audio\(\)/g) || []).length, 1, 'only one persistent playback Audio is constructed');
assert.match(probe, /document\.createElement\('audio'\)/, 'metadata uses a detached probe element');
assert.doesNotMatch(probe, /\.play\s*\(/, 'metadata probe never calls play');
assert.match(probe, /loadedmetadata/);
assert.match(probe, /error/);
assert.match(probe, /abort/);
assert.match(probe, /setTimeout\(onFailure,timeoutMs\)/);
assert.match(probe, /removeEventListener\('loadedmetadata'/);
assert.match(probe, /removeAttribute\('src'\)/);
assert.match(probe, /URL\.revokeObjectURL\(url\)/);
assert.match(probe, /validDuration\(value\)\?Number\(value\):null/);
assert.doesNotMatch(probe, /state\./, 'probe is isolated from persistent playback state');

let created = 0;
let revoked = 0;
const filesByUrl = new Map();
class FakeProbe {
  constructor() { this.listeners = new Map(); this.duration = NaN; this.src = ''; this.cleaned = false; }
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name) { this.listeners.delete(name); }
  removeAttribute(name) { if (name === 'src') { this.src = ''; this.cleaned = true; } }
  load() {
    const file = filesByUrl.get(this.src);
    if (!file) return;
    queueMicrotask(() => {
      if (file.kind === 'metadata') { this.duration = file.duration; this.listeners.get('loadedmetadata')?.(); }
      if (file.kind === 'error') this.listeners.get('error')?.();
    });
  }
}
const fakeDocument = { createElement(name) { assert.equal(name, 'audio'); created++; return new FakeProbe(); } };
const fakeURL = {
  createObjectURL(file) { const url = `blob:test-${created}`; filesByUrl.set(url, file); return url; },
  revokeObjectURL(url) { revoked++; filesByUrl.delete(url); }
};
const validDuration = value => Number.isFinite(Number(value)) && Number(value) > 0;
const makeProbe = new Function('document', 'URL', 'validDuration', 'setTimeout', 'clearTimeout', `${probe}; return probeMediaDuration;`);
const runProbe = makeProbe(fakeDocument, fakeURL, validDuration, setTimeout, clearTimeout);
assert.equal(await runProbe({ kind: 'metadata', duration: 123.5 }), 123.5);
assert.equal(await runProbe({ kind: 'metadata', duration: Infinity }), null);
assert.equal(await runProbe({ kind: 'metadata', duration: 0 }), null);
assert.equal(await runProbe({ kind: 'error' }), null);
assert.equal(await runProbe({ kind: 'timeout' }, { timeoutMs: 1 }), null);
const controller = new AbortController(); controller.abort();
assert.equal(await runProbe({ kind: 'timeout' }, { signal: controller.signal }), null);
assert.equal(created, 6);
assert.equal(revoked, 6, 'every metadata object URL is released');

assert.match(source, /const duration=await probeMediaDuration\(file\)/, 'duration is probed before the song record is stored');
assert.match(source, /unknownDuration:\[\]/);
assert.match(source, /时长暂时未知/);
assert.match(source, /formatTime\(song\.duration,true\)/);

assert.match(source, /sourceState: 'idle'/);
for (const state of ['preparing', 'ready', 'playing', 'error']) assert(source.includes(`sourceState = '${state}'`) || source.includes(`sourceState='${state}'`));
assert.match(playSong, /state\.preparePromise\) return state\.preparePromise/, 'same-song repeated clicks share one preparation');
assert(playSong.indexOf('state.preparedSongId = song.id') < playSong.indexOf('getDB(BLOB_STORE'), 'the preparing target is recorded before IndexedDB');
assert(playSong.indexOf('playPreparedSong(options)') < playSong.indexOf('getDB(BLOB_STORE'), 'prepared songs play before any IndexedDB read');
assert.match(playSong, /token !== state\.loadToken/, 'stale preparation is rejected');
assert.match(source, /error\?\.name === 'NotAllowedError'/);
assert.match(source, /歌曲准备好了，点一下继续播放/);
assert.doesNotMatch(source.slice(source.indexOf("error?.name === 'NotAllowedError'"), source.indexOf('handlePlayError(error)', source.indexOf("error?.name === 'NotAllowedError'"))), /playNext/);
assert.match(source, /audio\.addEventListener\('play',[\s\S]*markPlayed\(\); emitMusic\('music:play'\)/, 'statistics and play event remain tied to the real play event');
assert.match(source, /previousUrl.*retiredObjectUrls\.add\(previousUrl\)/s);
assert.match(source, /function releaseRetiredObjectUrls\(\).*URL\.revokeObjectURL/s);
assert.match(source, /state\.loadToken\+\+;state\.audio\?\.pause\(\).*revokeObjectUrl\(\)/s, 'deleting the current song invalidates preparation and releases its URL');

console.log('music playback gap checks passed');
