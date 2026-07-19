// apps/music.js — single-source local music library and player
import { getData, setData, generateId, getNow, getDB, setDB, deleteDB, getAllDB } from '../core/storage.js';
import { createIcon, showToast } from '../core/ui.js';
import { emit, on, registerAPI } from '../core/app-bus.js';
import { promptForRemoteImage } from '../core/image-url.js';

const STYLE_ID = 'music-app-style';
const SONG_STORE = 'songs';
const PLAYLIST_STORE = 'playlists';
const BLOB_STORE = 'blobs';
const SETTINGS_KEY = 'music_app_settings';
const CURRENT_KEY = 'music_current_song';
const MODES = ['list', 'loop', 'shuffle'];
const MODE_LABELS = { list: '列表循环', loop: '单曲循环', shuffle: '随机播放' };

const state = {
  mounted: false, root: null, page: 'home', detailId: '', songs: [], playlists: [],
  queue: [], queueIndex: -1, currentSongId: '', isPlaying: false, loading: false,
  error: '', currentTime: 0, duration: 0, volume: 1, mode: 'list', search: '',
  sort: 'added', filter: 'all', lyricsOpen: false, lyrics: [], lyricIndex: -1,
  lyricManualUntil: 0, seeking: false, audio: null, objectUrl: '', loadToken: 0,
  playerBg: '', listBg: '', importStatus: null, offRequest: null, unregister: null,
  settings: {}, characters: [], initialized: false, api: null, lifecycleBound: false,
  restoredTime: 0, sourceState: 'idle', preparedSongId: '', preparePromise: null,
  needsPlayGesture: false, pendingChange: false, retiredObjectUrls: new Set()
};

export async function mount(containerEl) {
  state.root = containerEl;
  state.mounted = true;
  if (!state.initialized) {
    await loadPreferences();
    await Promise.all([loadLibrary(), loadCharacters()]);
    initAudio();
    await prepareRestoredSong();
    bindLifecycleSync();
    state.initialized = true;
  }
  await loadBackgrounds();
  exposeAPI();
  injectStyle();
  render();
}

export function unmount() {
  state.mounted = false;
  state.root = null;
  state.lyricsOpen = false;
  document.querySelector('.music-lyrics-sheet')?.remove();
  document.querySelector('.music-sheet-backdrop')?.remove();
  // Audio intentionally survives app navigation; it is the sole player instance.
}

function exposeAPI() {
  const api = state.api || {
    isPlaying: () => state.isPlaying,
    getCurrentSong: () => currentSong(),
    getState: () => publicState(),
    togglePlay, playNext, playPrevious, playSong, openPlayer: () => go('player'),
    getSongs: () => state.songs.slice(),
    getPlaylists: () => state.playlists.slice()
  };
  state.api = api;
  window.musicPlayer = api;
  if (!state.unregister) state.unregister = registerAPI('music', api);
  if (!state.offRequest) state.offRequest = on('music:play', data => {
    if (data?.source === 'music-player') return;
    if (data?.songId) playSong(data.songId, { reason: 'external' });
    else togglePlay();
  });
}

function publicState() {
  const song = currentSong();
  return { songId: song?.id || '', title: song?.title || '', artist: song?.artist || '', cover: song?.cover || '', album: song?.album || '',
    isPlaying: state.isPlaying, currentTime: state.currentTime, duration: state.duration,
    mode: state.mode, queue: state.queue.slice(), sourceState: state.sourceState,
    loading: state.loading, needsPlayGesture: state.needsPlayGesture, error: state.error };
}

function initAudio() {
  if (state.audio) return;
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = state.volume;
  state.audio = audio;
  audio.addEventListener('loadstart', () => { state.loading = true; state.error = ''; sync(); });
  audio.addEventListener('canplay', () => { state.loading = false; if (state.sourceState === 'preparing') state.sourceState = 'ready'; sync(); });
  audio.addEventListener('loadedmetadata', () => {
    state.duration = finite(audio.duration);
    state.loading = false;
    if (state.restoredTime > 0) {
      audio.currentTime = Math.min(state.restoredTime, Math.max(0, state.duration - 0.25));
      state.currentTime = audio.currentTime;
      state.restoredTime = 0;
    }
    const song = currentSong();
    if (song && state.duration && song.duration !== state.duration) { song.duration = state.duration; setDB(SONG_STORE, cleanSong(song)); }
    sync();
  });
  audio.addEventListener('timeupdate', () => {
    if (!state.seeking) state.currentTime = finite(audio.currentTime);
    updateProgress(); updateLyrics(); persistPlayback(false);
  });
  audio.addEventListener('play', () => {
    state.isPlaying = true; state.loading = false; state.error = ''; state.sourceState = 'playing'; state.needsPlayGesture = false;
    markPlayed(); emitMusic('music:play'); sync();
  });
  audio.addEventListener('pause', () => {
    state.isPlaying = false; if (state.audio.src && !['preparing','error'].includes(state.sourceState)) state.sourceState = 'ready'; persistPlayback(true); emitMusic('music:pause'); sync();
  });
  audio.addEventListener('ended', () => {
    emitMusic('music:ended');
    if (state.mode === 'loop') { audio.currentTime = 0; audio.play().catch(handlePlayError); }
    else playNext({ reason: 'ended' });
  });
  audio.addEventListener('error', () => {
    state.loading = false; state.isPlaying = false;
    state.sourceState = 'error'; state.error = '这首歌暂时无法播放'; sync();
  });
}

async function prepareRestoredSong() {
  const song = currentSong();
  if (!song || state.audio.src) return;
  const record = await getDB(BLOB_STORE, `audio_${song.id}`).catch(() => null);
  const source = record?.value || song.url || song.src || '';
  if (!source) return;
  revokeObjectUrl();
  state.audio.src = source instanceof Blob ? (state.objectUrl = URL.createObjectURL(source)) : source;
  state.preparedSongId = song.id;
  state.sourceState = 'preparing';
  state.audio.load();
}

function bindLifecycleSync() {
  if (state.lifecycleBound) return;
  state.lifecycleBound = true;
  const syncFromAudio = () => {
    if (!state.audio) return;
    state.isPlaying = !state.audio.paused && !state.audio.ended;
    state.currentTime = finite(state.audio.currentTime);
    state.duration = finite(state.audio.duration) || state.duration;
    persistPlayback(true);
    sync();
  };
  document.addEventListener('visibilitychange', syncFromAudio);
  window.addEventListener('pagehide', syncFromAudio);
  window.addEventListener('pageshow', syncFromAudio);
}

async function loadLibrary() {
  const [songs, playlists] = await Promise.all([getAllDB(SONG_STORE), getAllDB(PLAYLIST_STORE)]);
  state.songs = (Array.isArray(songs) ? songs : []).map(normalizeSong);
  state.playlists = (Array.isArray(playlists) ? playlists : []).map(normalizePlaylist);
  const saved = getData(CURRENT_KEY) || {};
  state.currentSongId = resolveSongId(saved.songId);
  state.queue = (Array.isArray(saved.queue) ? saved.queue : []).map(resolveSongId).filter(id => id !== '');
  if (!state.queue.length) state.queue = state.songs.map(s => s.id);
  state.queueIndex = state.queue.indexOf(state.currentSongId);
  state.currentTime = finite(saved.currentTime);
  state.restoredTime = state.currentTime;
  state.lyrics = lyricsFor(currentSong());
}

function normalizeSong(raw) {
  return { ...raw, id: raw?.id ?? generateId('song'), title: String(raw?.title || '未命名歌曲'),
    artist: String(raw?.artist || ''), album: String(raw?.album || ''), cover: String(raw?.cover || ''),
    duration: validDuration(raw?.duration) ? Number(raw.duration) : null, lyrics: raw?.lyrics ?? '', favorite: Boolean(raw?.favorite),
    addedAt: raw?.addedAt || raw?.createdAt || getNow(), lastPlayedAt: raw?.lastPlayedAt || '',
    playCount: finite(raw?.playCount), source: raw?.source || 'local' };
}

function normalizePlaylist(raw) {
  const songIds = (Array.isArray(raw?.songIds) ? raw.songIds : []).map(id => { const resolved = resolveSongId(id); return resolved === '' ? id : resolved; });
  return { ...raw, id: raw?.id ?? generateId('playlist'), name: String(raw?.name || '未命名歌单'),
    description: String(raw?.description || ''), cover: String(raw?.cover || ''),
    songIds: [...new Set(songIds)],
    createdAt: raw?.createdAt || getNow(), updatedAt: raw?.updatedAt || raw?.createdAt || getNow() };
}

async function loadPreferences() {
  state.settings = getData(SETTINGS_KEY) || {};
  state.volume = clamp(Number(state.settings.volume ?? 1), 0, 1);
  state.mode = MODES.includes(state.settings.playMode) ? state.settings.playMode : 'list';
}

async function loadBackgrounds() {
  const [player, list] = await Promise.all([
    getDB(BLOB_STORE, state.settings.playerBgKey || 'app_bg_music_player').catch(() => null),
    getDB(BLOB_STORE, state.settings.listBgKey || 'app_bg_music_list').catch(() => null)
  ]);
  state.playerBg = player?.value || '';
  state.listBg = list?.value || '';
}

async function loadCharacters(){state.characters=await getAllDB('characters').catch(()=>[]);if(!Array.isArray(state.characters))state.characters=[];}

function savePreferences() {
  state.settings = { ...state.settings, volume: state.volume, playMode: state.mode,
    playerBgKey: state.settings.playerBgKey || 'app_bg_music_player',
    listBgKey: state.settings.listBgKey || 'app_bg_music_list' };
  setData(SETTINGS_KEY, state.settings);
}

function persistPlayback(force) {
  const now = Date.now();
  if (!force && now - (state.lastPersist || 0) < 2000) return;
  state.lastPersist = now;
  setData(CURRENT_KEY, { songId: state.currentSongId, queue: state.queue.slice(),
    queueIndex: state.queueIndex, currentTime: state.currentTime, updatedAt: getNow() });
}

async function playSong(songId, options = {}) {
  const song = state.songs.find(item => sameId(item.id, songId));
  if (!song) { state.error = '歌曲已经不在音乐库里了'; sync(); return; }
  initAudio();
  if (sameId(state.preparedSongId, song.id) && state.audio.src && state.sourceState !== 'preparing') {
    state.currentSongId = song.id;
    return playPreparedSong(options);
  }
  if (sameId(state.preparedSongId, song.id) && state.sourceState === 'preparing' && state.preparePromise) return state.preparePromise;
  const token = ++state.loadToken;
  if (state.isPlaying) state.audio.pause();
  state.loading = true; state.error = ''; state.sourceState = 'preparing'; state.needsPlayGesture = false;
  state.preparedSongId = song.id;
  state.pendingChange = options.reason !== 'external';
  if (!state.queue.some(id => sameId(id, song.id))) state.queue = visibleSongs().map(item => item.id);
  state.queueIndex = state.queue.findIndex(id => sameId(id, song.id));
  const resumingRestoredSong = !state.audio.src && sameId(state.currentSongId, song.id) && state.restoredTime > 0;
  state.currentSongId = song.id;
  state.currentTime = resumingRestoredSong ? state.restoredTime : 0;
  if (!resumingRestoredSong) state.restoredTime = 0;
  state.duration = finite(song.duration);
  state.lyrics = lyricsFor(song); state.lyricIndex = -1; sync();
  const preparation = (async () => {
    const record = await getDB(BLOB_STORE, `audio_${song.id}`).catch(() => null);
    if (token !== state.loadToken) return;
    const source = record?.value || song.url || song.src || '';
    if (!source) { state.loading = false; state.sourceState = 'error'; state.audio.removeAttribute('src');revokeObjectUrl();state.preparedSongId = ''; state.error = '找不到这首歌的音频文件'; sync(); return; }
    const nextUrl = source instanceof Blob ? URL.createObjectURL(source) : '';
    const previousUrl = state.objectUrl;
    state.audio.src = nextUrl || source;
    state.objectUrl = nextUrl;
    state.preparedSongId = song.id;
    state.audio.load();
    if (previousUrl && previousUrl !== nextUrl) state.retiredObjectUrls.add(previousUrl);
    const ready = await waitForPersistentAudio(token);
    if (token !== state.loadToken) { if (nextUrl && state.objectUrl !== nextUrl) URL.revokeObjectURL(nextUrl); return; }
    if (!ready) { state.loading=false;state.sourceState='error';state.error=state.error||'音频准备超时，可以重试或跳过';if(nextUrl&&state.objectUrl===nextUrl){state.audio.removeAttribute('src');revokeObjectUrl();state.preparedSongId='';}else releaseRetiredObjectUrls();sync();return; }
    releaseRetiredObjectUrls();
    state.sourceState = 'ready'; state.loading = false; sync();
    await playPreparedSong(options);
  })();
  const tracked = preparation.finally(() => { if (state.preparePromise === tracked) state.preparePromise = null; });
  state.preparePromise = tracked;
  return state.preparePromise;
}

function waitForPersistentAudio(token) {
  if (state.audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve(true);
  return new Promise(resolve => {
    let timer;
    const finish = value => { clearTimeout(timer); state.audio.removeEventListener('canplay', onReady); state.audio.removeEventListener('error', onError); resolve(value); };
    const onReady = () => finish(token === state.loadToken);
    const onError = () => finish(false);
    state.audio.addEventListener('canplay', onReady, { once: true });
    state.audio.addEventListener('error', onError, { once: true });
    timer = setTimeout(() => finish(false), 12000);
  });
}

async function playPreparedSong(options = {}) {
  try {
    const promise = state.audio.play();
    await promise;
    if (state.pendingChange) { state.pendingChange = false; emitMusic('music:change'); }
  } catch (error) {
    if (error?.name === 'NotAllowedError') {
      state.loading = false; state.isPlaying = false; state.sourceState = 'ready'; state.needsPlayGesture = true;
      state.error = '歌曲准备好了，点一下继续播放'; sync(); return;
    }
    handlePlayError(error);
  }
}

async function togglePlay() {
  initAudio();
  if (state.isPlaying) { state.audio.pause(); return; }
  if (state.currentSongId === '') {
    const first = visibleSongs()[0] || state.songs[0];
    if (first) await playSong(first.id);
    return;
  }
  if (!state.audio.src || !sameId(state.preparedSongId, state.currentSongId)) { await playSong(state.currentSongId); return; }
  return playPreparedSong();
}

function handlePlayError() {
  state.loading = false; state.isPlaying = false;
  state.sourceState = 'error'; state.error = '播放没有成功，可以重试或跳过'; sync();
}

function playPrevious() {
  if (state.audio && state.currentTime > 5) { state.audio.currentTime = 0; return; }
  moveQueue(-1);
}

function playNext() { moveQueue(1); }

function moveQueue(direction) {
  const ids = state.queue.filter(id => state.songs.some(s => s.id === id));
  if (!ids.length) { state.isPlaying = false; state.error = ''; sync(); return; }
  let index = ids.indexOf(state.currentSongId);
  if (state.mode === 'shuffle' && ids.length > 1) {
    let next = index;
    while (next === index) next = Math.floor(Math.random() * ids.length);
    index = next;
  } else index = (Math.max(0, index) + direction + ids.length) % ids.length;
  state.queue = ids; playSong(ids[index], { reason: 'queue' });
}

async function markPlayed() {
  const song = currentSong();
  if (!song) return;
  const now = Date.now();
  if (now - finite(song._countedAt) < 10000) return;
  song._countedAt = now; song.lastPlayedAt = getNow(); song.playCount = finite(song.playCount) + 1;
  await setDB(SONG_STORE, cleanSong(song));
}

function emitMusic(name, extra = {}) {
  const song = currentSong();
  emit(name, { source: 'music-player', songId: song?.id || '', title: song?.title || '',
    artist: song?.artist || '', currentTime: state.currentTime, ...extra });
}

function render() {
  if (!state.root) return;
  state.root.innerHTML = '';
  const app = el('section', 'music-app');
  if (state.listBg && state.page !== 'player') app.style.backgroundImage = `url("${cssUrl(state.listBg)}")`;
  app.append(topbar(), navigation(), pageContent());
  if (state.currentSongId !== '' && state.page !== 'player') app.append(miniPlayer());
  state.root.append(app);
  if (state.lyricsOpen) document.body.append(lyricsSheet());
}

function topbar() {
  const bar = el('header', 'music-topbar');
  const back = iconButton('back', '返回', () => state.page === 'home' ? window.closeCurrentApp?.() : go('home'));
  const title = el('strong', 'music-title', state.page === 'player' ? '正在播放' : pageTitle());
  const settings = iconButton('settings', '音乐设置', openSettings);
  bar.append(back, title, settings); return bar;
}

function navigation() {
  if (state.page === 'player' || state.page === 'playlist') return el('div', 'music-nav-spacer');
  const nav = el('nav', 'music-nav');
  [['home','首页'],['library','音乐库'],['playlists','歌单']].forEach(([id,label]) => {
    const button = el('button', `music-nav-btn${state.page === id ? ' active' : ''}`, label);
    button.onclick = () => go(id); nav.append(button);
  }); return nav;
}

function pageContent() {
  if (state.page === 'player') return playerPage();
  if (state.page === 'library') return libraryPage();
  if (state.page === 'playlists') return playlistsPage();
  if (state.page === 'playlist') return playlistPage();
  return homePage();
}

function homePage() {
  const main = el('main', 'music-scroll music-home');
  const current = currentSong();
  if (current) {
    const card = el('button', 'now-card'); card.onclick = () => go('player');
    const control=iconButton(state.loading?'refresh':state.isPlaying?'pause':'play',state.isPlaying?'暂停':'播放',event=>{event.stopPropagation();togglePlay();},'now-play');
    card.append(cover(current, 'now-cover'), textBlock(state.sourceState==='preparing'?'正在准备':'继续听', current.title, artistAlbum(current)),control); main.append(card);
  }
  const quick=el('div','music-quick');
  [['recent','最近播放',state.songs.filter(s=>s.lastPlayedAt).length,'clock'],['favorite','我的收藏',state.songs.filter(s=>s.favorite).length,'heart'],['all','最近添加',state.songs.length,'music'],['playlists','我的歌单',state.playlists.length,'star']].forEach(([id,label,count,icon])=>{const b=el('button',`quick-entry quick-${id}`);const art=el('span','quick-art');art.append(iconNode(icon,20));b.append(art,el('strong','',label),el('small','',`${count} ${id==='playlists'?'个':'首'}`));b.onclick=()=>id==='playlists'?go('playlists'):openLibraryFilter(id);quick.append(b);});
  main.append(quick);
  main.append(sectionHeader('最近播放', '查看全部', () => openLibraryFilter('recent')));
  main.append(songRail(sortSongs(state.songs.filter(s=>s.lastPlayedAt),'recent').slice(0, 6), '还没有播放记录', '从音乐库挑一首，猫猫会替你记住。'));
  main.append(sectionHeader('我的收藏', '查看全部', () => openLibraryFilter('favorite')));
  main.append(songRail(state.songs.filter(s => s.favorite).slice(0, 6), '收藏夹还是空的', '遇到喜欢的歌，点一下小心心就好。'));
  main.append(sectionHeader('我的歌单', '查看全部', () => go('playlists')), playlistGrid(state.playlists.slice(0, 6)));
  main.append(sectionHeader('最近添加', '查看全部', () => openLibraryFilter('all')));
  main.append(songRail(sortedSongs('added').slice(0, 6), '音乐库空空的', '导入手机里的音乐，开始第一场小小演出。', importSongs));
  return main;
}

function libraryPage() {
  const main = el('main', 'music-scroll music-library');
  const search = el('div', 'music-search'); search.append(iconNode('search', 17));
  const input = el('input'); input.type = 'search'; input.placeholder = '搜索歌曲、歌手、专辑或歌单'; input.value = state.search;
  let timer; input.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { state.search = input.value.trim(); render(); }, 180); };
  search.append(input); main.append(search);
  const playlistMatches = state.search ? state.playlists.filter(pl => pl.name.toLocaleLowerCase().includes(state.search.toLocaleLowerCase())) : [];
  if (playlistMatches.length) main.append(sectionHeader('匹配歌单', `${playlistMatches.length} 个`), playlistGrid(playlistMatches));
  const filters = el('div', 'library-filters');
  [['all','全部'],['favorite','收藏'],['recent','最近播放'],['albums','专辑'],['artists','歌手']].forEach(([id,label]) => {
    const b = el('button', state.filter === id ? 'active' : '', label); b.onclick = () => { state.filter=id; render(); }; filters.append(b);
  });
  const sort = el('select', 'music-sort');
  [['added','最近添加'],['recent','最近播放'],['title','歌曲名'],['artist','歌手'],['plays','播放次数']].forEach(([v,l]) => { const o=el('option','',l); o.value=v; o.selected=state.sort===v; sort.append(o); });
  sort.onchange=()=>{state.sort=sort.value;render();};
  const actions=el('div','library-tools'); actions.append(filters,sort); main.append(actions);
  if (state.filter === 'albums' || state.filter === 'artists') main.append(groupView());
  else {
    const songs = queriedSongs(); main.append(sectionHeader(state.filter === 'favorite' ? '收藏歌曲' : state.filter === 'recent' ? '最近播放' : '全部歌曲', `${songs.length} 首`));
    main.append(songList(songs));
  }
  const importBtn=el('button','music-primary','导入本地音乐'); importBtn.onclick=importSongs; main.append(importBtn);
  if (state.importStatus) main.append(importReport());
  return main;
}

function queriedSongs() {
  let songs = state.songs.slice();
  if (state.filter === 'favorite') songs=songs.filter(s=>s.favorite);
  if (state.filter === 'recent') songs=songs.filter(s=>s.lastPlayedAt);
  const q=state.search.toLocaleLowerCase();
  if(q) songs=songs.filter(s=>[s.title,s.artist,s.album].some(v=>String(v).toLocaleLowerCase().includes(q)));
  return sortSongs(songs,state.sort);
}

function groupView() {
  const q=state.search.toLocaleLowerCase(); const key=state.filter==='albums'?'album':'artist'; const groups=new Map();
  state.songs.forEach(song=>{const name=song[key]||`未知${key==='album'?'专辑':'歌手'}`; if(q&&!name.toLocaleLowerCase().includes(q))return; if(!groups.has(name))groups.set(name,[]);groups.get(name).push(song);});
  const wrap=el('div','music-groups'); if(!groups.size)return emptyState('没有找到内容','换个关键词试试看。');
  groups.forEach((songs,name)=>{const card=el('button','group-card');card.append(cover(songs[0],'group-cover'),textBlock('',name,`${songs.length} 首`));card.onclick=()=>{state.queue=songs.map(s=>s.id);playSong(songs[0].id);};wrap.append(card);}); return wrap;
}

function playlistsPage() {
  const main=el('main','music-scroll');
  const head=sectionHeader('我的歌单',`${state.playlists.length} 个`); const add=iconButton('add','新建歌单',createPlaylist);head.append(add);main.append(head);
  main.append(playlistGrid(state.playlists));
  if(!state.playlists.length) main.append(emptyState('还没有自建歌单','把喜欢的歌收进属于自己的小窝。', '新建歌单', createPlaylist));
  return main;
}

function playlistPage() {
  const main=el('main','music-scroll playlist-detail'); const pl=state.playlists.find(p=>p.id===state.detailId);
  if(!pl)return emptyState('歌单不见了','它可能已经被删除。','返回歌单',()=>go('playlists'));
  const songs=pl.songIds.map(id=>state.songs.find(s=>s.id===id)).filter(Boolean);
  const hero=el('div','playlist-hero');hero.append(playlistCover(pl),textBlock('',pl.name,pl.description||'还没有简介'));
  const edit=iconButton('edit','编辑歌单',()=>editPlaylist(pl));hero.append(edit);main.append(hero);
  const controls=el('div','playlist-controls'); const all=el('button','music-primary','播放全部');all.disabled=!songs.length;all.onclick=()=>playCollection(songs,false);
  const random=el('button','music-secondary','随机播放');random.disabled=!songs.length;random.onclick=()=>playCollection(songs,true);
  const add=el('button','music-secondary','添加歌曲');add.onclick=()=>chooseSongs(pl);controls.append(all,random,add);main.append(controls,sectionHeader('歌曲',`${songs.length} 首`),songList(songs,pl));
  const remove=el('button','music-danger','删除歌单');remove.onclick=()=>deletePlaylist(pl);main.append(remove);return main;
}

function playerPage() {
  const song=currentSong(); const main=el('main','music-player');
  if(state.playerBg)main.style.backgroundImage=`url("${cssUrl(state.playerBg)}")`;
  if(!song){main.append(emptyState('还没有正在播放的歌','先去音乐库挑一首吧。','打开音乐库',()=>go('library')));return main;}
  const disc=el('div',`player-disc${state.isPlaying?' spinning':''}`);disc.append(cover(song,'player-cover'));main.append(disc);
  const meta=el('div','player-meta');meta.append(el('h2','',song.title),el('p','',artistAlbum(song)));const fav=iconButton('heart',song.favorite?'取消收藏':'收藏',()=>toggleFavorite(song));fav.classList.add('player-favorite');fav.classList.toggle('selected',song.favorite);const metaRow=el('div','player-meta-row');metaRow.append(meta,fav);main.append(metaRow);
  main.append(progressControl());
  const controls=el('div','player-main-controls');controls.append(iconButton('back','上一首',playPrevious),iconButton(state.loading?'refresh':state.isPlaying?'pause':'play',state.isPlaying?'暂停':'播放',togglePlay,'player-play'),iconButton('arrow-right','下一首',playNext));main.append(controls);
  const extras=el('div','player-extras');
  const mode=el('button','');mode.append(iconNode('refresh',18),el('span','',MODE_LABELS[state.mode]));mode.onclick=cycleMode;
  const lyrics=el('button','');lyrics.append(iconNode('music',18),el('span','','歌词'));lyrics.onclick=()=>{state.lyricsOpen=true;render();};
  const queue=el('button','');queue.append(iconNode('list',18),el('span','','队列'));queue.onclick=openQueue;
  extras.append(mode,lyrics,queue);main.append(extras,volumeControl());
  if(state.error){const err=el('div','player-error',state.error);const retry=el('button','','重试');retry.onclick=()=>playSong(song.id);const skip=el('button','','跳过');skip.onclick=playNext;err.append(retry,skip);main.append(err);}
  return main;
}

function progressControl() {
  const wrap=el('div','player-progress');const range=el('input');range.type='range';range.min='0';range.max=String(Math.max(0,state.duration));range.step='0.1';range.value=String(Math.min(state.currentTime,state.duration||0));
  range.onpointerdown=()=>{state.seeking=true;};range.oninput=()=>{state.currentTime=finite(range.value);updateProgress();};range.onchange=()=>{if(state.audio)state.audio.currentTime=state.currentTime;state.seeking=false;persistPlayback(true);};range.onpointerup=range.onchange;
  const times=el('div','progress-times');times.append(el('span','progress-current',formatTime(state.currentTime)),el('span','progress-duration',formatTime(state.duration,true)));wrap.append(range,times);return wrap;
}

function volumeControl(){const wrap=el('label','volume-control');wrap.append(iconNode('music',18));if(isIOS()){wrap.append(el('span','volume-system','请使用系统音量键'));return wrap;}const input=el('input');input.type='range';input.min='0';input.max='1';input.step='.05';input.value=String(state.volume);input.oninput=()=>{state.volume=clamp(Number(input.value),0,1);if(state.audio)state.audio.volume=state.volume;savePreferences();};wrap.append(input);return wrap;}

function miniPlayer(){const mini=el('button','music-mini');const song=currentSong();mini.onclick=()=>go('player');mini.append(cover(song,'mini-cover'),textBlock('',song.title,state.sourceState==='preparing'?'正在准备…':state.needsPlayGesture?'点一下继续播放':song.artist||'未知歌手'));const play=iconButton(state.sourceState==='preparing'?'refresh':state.isPlaying?'pause':'play',state.isPlaying?'暂停':'播放',e=>{e.stopPropagation();togglePlay();});const next=iconButton('arrow-right','下一首',e=>{e.stopPropagation();playNext();});mini.append(play,next);return mini;}

function songList(songs, playlist) {
  if(!songs.length)return emptyState(state.search?'没有搜索结果':'这里还没有歌曲',state.search?'换个关键词再找找。':'导入音乐或从其他歌单添加。');
  const list=el('div','song-list');songs.slice(0,250).forEach((song,index)=>{
    const row=el('div',`song-row${song.id===state.currentSongId?' active':''}`);const main=el('button','song-main');main.onclick=()=>{state.queue=songs.map(s=>s.id);playSong(song.id);};
    main.append(cover(song,'song-cover'),textBlock('',song.title,artistAlbum(song)),el('span','song-duration',playbackStatus(song)||formatTime(song.duration,true)));
    const fav=iconButton('heart',song.favorite?'取消收藏':'收藏',()=>toggleFavorite(song));fav.classList.toggle('selected',song.favorite);
    const more=iconButton('more','歌曲管理',()=>songActions(song,playlist));row.append(main,fav,more);
    if(playlist){const up=iconButton('arrow-down','上移',()=>movePlaylistSong(playlist,index,-1));up.classList.add('move-up');const down=iconButton('arrow-down','下移',()=>movePlaylistSong(playlist,index,1));up.disabled=index===0;down.disabled=index===songs.length-1;row.append(up,down);}
    if(playlist){row.draggable=true;row.ondragstart=e=>e.dataTransfer.setData('text/plain',String(index));row.ondragover=e=>e.preventDefault();row.ondrop=e=>reorderPlaylist(e,playlist,index);}
    list.append(row);
  });return list;
}

function songRail(songs,title,desc,action){if(!songs.length)return emptyState(title,desc,action?'导入音乐':'',action);const rail=el('div','song-rail');songs.forEach(song=>{const b=el('button','rail-song');b.onclick=()=>{state.queue=songs.map(s=>s.id);playSong(song.id);};b.append(cover(song,'rail-cover'),el('strong','',song.title),el('span','',song.artist||'未知歌手'));rail.append(b);});return rail;}
function playlistGrid(playlists){const grid=el('div','playlist-grid');playlists.forEach(pl=>{const b=el('button','playlist-card');b.onclick=()=>{state.detailId=pl.id;go('playlist');};b.append(playlistCover(pl),el('strong','',pl.name),el('span','',`${pl.songIds.filter(id=>state.songs.some(s=>s.id===id)).length} 首`));grid.append(b);});return grid;}

async function toggleFavorite(song){const favorite=!song.favorite;const next={...song,favorite};if(!await setDB(SONG_STORE,cleanSong(next))){showToast('收藏状态保存失败');return;}Object.assign(song,next);emit('music:favorite',{source:'music-player',songId:song.id,title:song.title||'',artist:song.artist||'',favorite});showToast(favorite?'已收藏':'已取消收藏');render();}

function songActions(song,playlist){const actions=[['编辑歌曲',()=>editSong(song)],['更换封面',()=>editSongCover(song)],['加入歌单',()=>addSongToPlaylist(song)],['编辑歌词',()=>editLyrics(song)],['在线匹配歌词',()=>matchLyrics(song)]];if(playlist)actions.push(['从此歌单移除',()=>removeFromPlaylist(song,playlist)]);actions.push(['从音乐库删除',()=>deleteSong(song)]);actionSheet(song.title,actions);}

async function editSong(song){const title=prompt('歌曲名：',song.title);if(title===null||!title.trim())return;const artist=prompt('歌手（可留空）：',song.artist);if(artist===null)return;const album=prompt('专辑（可留空）：',song.album);if(album===null)return;const next={...song,title:title.trim(),artist:artist.trim(),album:album.trim()};if(!await setDB(SONG_STORE,cleanSong(next))){showToast('歌曲信息保存失败');return;}Object.assign(song,next);emitMusic('music:change');render();showToast('歌曲信息已保存');}
function editSongCover(song){actionSheet('歌曲封面',[['本地选择',()=>pickSongCover(song)],['图片 URL',()=>setSongCoverUrl(song)],['清除图片',()=>saveSongCover(song,'','')]]);}
function pickSongCover(song){const input=el('input');input.type='file';input.accept='image/*';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{await saveSongCover(song,await readAsDataURL(file),'local');}catch{showToast('封面读取失败');}};input.click();}
async function setSongCoverUrl(song){const result=await promptForRemoteImage();if(result.error){showToast(result.error);return;}if(result.url)await saveSongCover(song,result.url,'url');}
async function saveSongCover(song,cover,coverSource){const next={...song,cover,coverSource,coverUrl:coverSource==='url'?cover:''};if(!await setDB(SONG_STORE,cleanSong(next))){showToast('封面保存失败');return;}Object.assign(song,next);emitMusic('music:change');render();showToast(cover?'封面已保存':'封面已清除');}
async function editLyrics(song){const existing=lyricsRaw(song);const text=prompt('输入 LRC 时间轴歌词或纯文本歌词：',existing);if(text===null)return;const synced=/\[\d{1,2}:\d{2}/.test(text);const next={...song,lyricsText:text,lyrics:synced?parseLRC(text):text,lyricsSynced:synced};if(!await setDB(SONG_STORE,cleanSong(next))){showToast('歌词保存失败');return;}Object.assign(song,next);if(sameId(song.id,state.currentSongId))state.lyrics=lyricsFor(song);render();showToast('歌词已保存');}

async function matchLyrics(song){showToast('正在匹配歌词…');try{const q=encodeURIComponent(`${song.title} ${song.artist||''}`.trim());const response=await fetch(`https://lrclib.net/api/search?q=${q}`,{headers:{Accept:'application/json'}});if(!response.ok)throw new Error();const rows=await response.json();const match=Array.isArray(rows)?rows.find(x=>x.syncedLyrics)||rows.find(x=>x.plainLyrics):null;const text=match?.syncedLyrics||match?.plainLyrics||'';if(!text){showToast('没有找到匹配歌词');return;}const synced=Boolean(match?.syncedLyrics);const next={...song,lyricsText:text,lyrics:synced?parseLRC(text):text,lyricsSynced:synced};if(!await setDB(SONG_STORE,cleanSong(next)))throw new Error();Object.assign(song,next);if(sameId(song.id,state.currentSongId))state.lyrics=lyricsFor(song);render();showToast('歌词已匹配并保存');}catch{showToast('在线歌词暂时不可用');}}

async function deleteSong(song){
  if(!confirm(`确定从音乐库删除《${song.title}》吗？\n音频文件、收藏记录和所有歌单中的引用都会移除。`))return;
  const audioKey=`audio_${song.id}`;const audioRecord=await getDB(BLOB_STORE,audioKey).catch(()=>null);
  const affected=state.playlists.filter(pl=>pl.songIds.some(id=>sameId(id,song.id)));
  const replacements=affected.map(pl=>({...pl,songIds:pl.songIds.filter(id=>!sameId(id,song.id)),updatedAt:getNow()}));
  const rollback=async()=>{let ok=Boolean(await setDB(SONG_STORE,cleanSong(song)));if(audioRecord)ok=Boolean(await setDB(BLOB_STORE,audioRecord))&&ok;for(const pl of affected)ok=Boolean(await setDB(PLAYLIST_STORE,pl))&&ok;return ok;};
  if(!await deleteDB(BLOB_STORE,audioKey)){showToast('音频文件删除失败，没有更改音乐库');return;}
  if(!await deleteDB(SONG_STORE,song.id)){const recovered=!audioRecord||Boolean(await setDB(BLOB_STORE,audioRecord));showToast(recovered?'歌曲删除失败，数据已恢复':'歌曲删除失败且音频恢复未完成，请立即导出备份');return;}
  for(const pl of replacements){if(!await setDB(PLAYLIST_STORE,pl)){const recovered=await rollback();showToast(recovered?'歌单关系更新失败，删除已撤销':'删除失败且恢复不完整，请立即导出备份并重试');return;}}
  const wasCurrent=sameId(song.id,state.currentSongId);const oldQueue=state.queue.slice();
  state.songs=state.songs.filter(s=>!sameId(s.id,song.id));state.queue=state.queue.filter(id=>!sameId(id,song.id));
  state.playlists=state.playlists.map(pl=>replacements.find(item=>sameId(item.id,pl.id))||pl);
  if(wasCurrent){state.loadToken++;state.audio?.pause();state.audio?.removeAttribute('src');revokeObjectUrl();state.currentSongId='';state.preparedSongId='';state.sourceState='idle';state.needsPlayGesture=false;state.currentTime=0;state.duration=0;state.restoredTime=0;const next=oldQueue.find(id=>!sameId(id,song.id)&&state.songs.some(s=>sameId(s.id,id)));if(next!==undefined)await playSong(next);else persistPlayback(true);}else persistPlayback(true);
  updateDesktopWidget();render();showToast('歌曲已从音乐库删除');
}

async function createPlaylist(){const name=prompt('给新歌单起个名字：');if(!name?.trim())return;const pl=normalizePlaylist({id:generateId('playlist'),name:name.trim(),songIds:[],createdAt:getNow()});if(!await setDB(PLAYLIST_STORE,pl)){showToast('歌单创建失败');return;}state.playlists.push(pl);emit('music:playlist',{action:'create',playlistId:pl.id,name:pl.name,songCount:0});render();}
async function editPlaylist(pl){const name=prompt('歌单名称：',pl.name);if(name===null||!name.trim())return;const description=prompt('歌单简介（可留空）：',pl.description);if(description===null)return;const next={...pl,name:name.trim(),description:description.trim(),updatedAt:getNow()};if(!await setDB(PLAYLIST_STORE,next)){showToast('歌单保存失败');return;}Object.assign(pl,next);emit('music:playlist',{action:'update',playlistId:pl.id,name:pl.name,songCount:pl.songIds.length});render();}
async function deletePlaylist(pl){if(!confirm(`确定删除歌单“${pl.name}”吗？\n只会删除歌单，不会删除音乐库里的歌曲。`))return;if(!await deleteDB(PLAYLIST_STORE,pl.id)){showToast('歌单删除失败');return;}state.playlists=state.playlists.filter(p=>!sameId(p.id,pl.id));emit('music:playlist',{action:'delete',playlistId:pl.id,name:pl.name,songCount:pl.songIds.length});go('playlists');}

function addSongToPlaylist(song){if(!state.playlists.length){showToast('请先新建一个歌单');go('playlists');return;}actionSheet('加入歌单',state.playlists.map(pl=>[pl.name,async()=>{if(pl.songIds.some(id=>sameId(id,song.id))){showToast('这首歌已经在歌单里');return;}const next={...pl,songIds:[...pl.songIds,song.id],updatedAt:getNow()};if(!await setDB(PLAYLIST_STORE,next)){showToast('加入歌单失败');return;}Object.assign(pl,next);emit('music:playlist',{action:'add-song',playlistId:pl.id,songId:song.id,name:pl.name});showToast('已加入歌单');}]));}
function chooseSongs(pl){const available=state.songs.filter(s=>!pl.songIds.some(id=>sameId(id,s.id)));if(!available.length){showToast('音乐库里的歌都在这里了');return;}actionSheet('添加歌曲',available.slice(0,100).map(song=>[`${song.title}${song.artist?` · ${song.artist}`:''}`,async()=>{const next={...pl,songIds:[...pl.songIds,song.id],updatedAt:getNow()};if(!await setDB(PLAYLIST_STORE,next)){showToast('添加歌曲失败');return;}Object.assign(pl,next);render();}]));}
async function removeFromPlaylist(song,pl){const next={...pl,songIds:pl.songIds.filter(id=>!sameId(id,song.id)),updatedAt:getNow()};if(!await setDB(PLAYLIST_STORE,next)){showToast('移出歌单失败');return;}Object.assign(pl,next);render();}
async function reorderPlaylist(event,pl,to){const from=Number(event.dataTransfer.getData('text/plain'));if(!Number.isInteger(from)||from===to)return;await movePlaylistSong(pl,from,to-from);}
async function movePlaylistSong(pl,from,delta){const to=from+delta;if(to<0||to>=pl.songIds.length)return;const original=pl.songIds.slice();const [id]=pl.songIds.splice(from,1);pl.songIds.splice(to,0,id);pl.updatedAt=getNow();if(!await setDB(PLAYLIST_STORE,pl)){pl.songIds=original;showToast('顺序保存失败，请重试');return;}render();}

function playCollection(songs,shuffle){state.queue=songs.map(s=>s.id);if(shuffle&&state.queue.length>1){const first=Math.floor(Math.random()*state.queue.length);playSong(state.queue[first]);}else if(state.queue.length)playSong(state.queue[0]);}
function cycleMode(){state.mode=MODES[(MODES.indexOf(state.mode)+1)%MODES.length];savePreferences();showToast(MODE_LABELS[state.mode]);render();}

async function importSongs(){const input=el('input');input.type='file';input.accept='audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac';input.multiple=true;input.onchange=async()=>{const files=Array.from(input.files||[]);if(!files.length)return;state.importStatus={total:files.length,done:0,success:[],failed:[],duplicates:[],unknownDuration:[]};render();for(const file of files){try{const duplicate=state.songs.find(s=>s.fileName===file.name&&finite(s.fileSize)===file.size&&String(s.mimeType||'')===String(file.type||''));if(duplicate&&!confirm(`“${file.name}”与已导入文件的信息相同。仍然导入吗？`)){state.importStatus.duplicates.push(file.name);}else{const song=await importFile(file);state.songs.push(song);state.importStatus.success.push(file.name);if(!validDuration(song.duration))state.importStatus.unknownDuration.push(file.name);emit('music:import',{songId:song.id,title:song.title,artist:song.artist||'',fileName:file.name,duration:song.duration});}}catch(error){state.importStatus.failed.push({name:file.name,message:error?.message||'无法读取'});}state.importStatus.done++;render();}state.queue=state.queue.filter(id=>state.songs.some(s=>sameId(s.id,id)));showToast(`导入完成：成功 ${state.importStatus.success.length} 首`);};input.click();}

async function importFile(file){const id=generateId('song');const duration=await probeMediaDuration(file);const data=await readAsDataURL(file);const tags=await readID3(file);const song=normalizeSong({id,title:tags.title||file.name.replace(/\.[^.]+$/,''),artist:tags.artist,album:tags.album,cover:tags.cover,duration,addedAt:getNow(),source:'local',fileName:file.name,fileSize:file.size,mimeType:file.type,lyrics:''});if(!await setDB(BLOB_STORE,{key:`audio_${id}`,value:data,type:file.type,name:file.name}))throw new Error('音频保存失败');if(!await setDB(SONG_STORE,cleanSong(song))){await deleteDB(BLOB_STORE,`audio_${id}`);throw new Error('歌曲信息保存失败');}return song;}

function importReport(){const s=state.importStatus;const box=el('section','import-report');box.append(el('strong','',s.done<s.total?`正在导入 ${s.done}/${s.total}`:`导入完成 ${s.success.length}/${s.total}`));if(s.duplicates.length)box.append(el('p','',`已跳过重复文件：${s.duplicates.join('、')}`));if(s.unknownDuration?.length)box.append(el('p','',`时长暂时未知：${s.unknownDuration.join('、')}`));if(s.failed.length)box.append(el('p','',`失败：${s.failed.map(x=>`${x.name}（${x.message}）`).join('、')}`));box.append(el('small','','音乐保存在当前浏览器里，记得随整机数据一起导出备份。'));return box;}

function lyricsSheet(){document.querySelector('.music-lyrics-sheet')?.remove();const sheet=el('section','music-lyrics-sheet');const head=el('header');head.append(el('strong','',currentSong()?.title||'歌词'),iconButton('close','关闭歌词',()=>{state.lyricsOpen=false;sheet.remove();}));sheet.append(head);const body=el('div','lyrics-body');body.onscroll=()=>{state.lyricManualUntil=Date.now()+4000;};if(!state.lyrics.length)body.append(emptyState('这首歌还没有歌词','可以添加 LRC 或纯文本，不会伪造同步。','添加歌词',()=>{sheet.remove();editLyrics(currentSong());}));else state.lyrics.forEach((line,i)=>{const b=el('button',`lyric-line${i===state.lyricIndex?' active':''}`,line.text);if(line.time!==null)b.onclick=()=>{if(state.audio){state.audio.currentTime=line.time;state.currentTime=line.time;}};body.append(b);});sheet.append(body);return sheet;}
function updateLyrics(){if(!state.lyrics.length)return;let i=-1;for(let n=state.lyrics.length-1;n>=0;n--){if(state.lyrics[n].time!==null&&state.currentTime>=state.lyrics[n].time){i=n;break;}}if(i===state.lyricIndex)return;state.lyricIndex=i;document.querySelectorAll('.lyric-line').forEach((node,n)=>node.classList.toggle('active',n===i));if(i>=0&&Date.now()>state.lyricManualUntil)document.querySelectorAll('.lyric-line')[i]?.scrollIntoView({behavior:'smooth',block:'center'});}

function openQueue(){actionSheet(`播放队列 · ${state.queue.length} 首`,state.queue.map(id=>state.songs.find(s=>s.id===id)).filter(Boolean).map(song=>[`${song.id===state.currentSongId?'正在播放 · ':''}${song.title}`,()=>playSong(song.id)]));}
function openSettings(){actionSheet('音乐设置',[['播放页背景',()=>editBackground('player')],['列表背景',()=>editBackground('list')],['恢复主题背景',clearBackground],[(state.settings.dualMode?'关闭':'开启')+'一起听',toggleDualMode],['浏览器存储提醒',()=>alert('歌曲保存在这个浏览器里。清理浏览器数据前，请先在设置中导出整机数据备份。')]]);}
function editBackground(kind){actionSheet(kind==='player'?'播放页背景':'列表背景',[['本地选择',()=>uploadBackground(kind)],['图片 URL',()=>setBackgroundUrl(kind)],['清除图片',()=>clearOneBackground(kind)]]);}
function toggleDualMode(){if(!state.settings.dualMode&&state.characters.length){actionSheet('选择一起听的角色',state.characters.map(character=>[character.name||'未命名角色',()=>{state.settings.dualMode=true;state.settings.selectedCharacterId=character.id;savePreferences();showToast('一起听已开启');}]));return;}state.settings.dualMode=!state.settings.dualMode;savePreferences();showToast(state.settings.dualMode?'一起听已开启':'一起听已关闭');}
async function uploadBackground(kind){const input=el('input');input.type='file';input.accept='image/*';input.onchange=async()=>{const file=input.files?.[0];if(!file)return;const value=await readAsDataURL(file);const key=getBackgroundKey(kind);if(!await setDB(BLOB_STORE,{key,value,type:file.type,name:file.name,source:file.name,sourceType:'local',url:''})){showToast('背景保存失败');return;}setBackgroundState(kind,value);render();};input.click();}
function getBackgroundKey(kind){return kind==='player'?(state.settings.playerBgKey||'app_bg_music_player'):(state.settings.listBgKey||'app_bg_music_list');}
function setBackgroundState(kind,value){if(kind==='player')state.playerBg=value;else state.listBg=value;}
async function setBackgroundUrl(kind){const result=await promptForRemoteImage();if(result.error){showToast(result.error);return;}if(!result.url)return;const key=getBackgroundKey(kind);if(!await setDB(BLOB_STORE,{key,value:result.url,url:result.url,source:result.url,sourceType:'url'})){showToast('背景保存失败');return;}setBackgroundState(kind,result.url);render();}
async function clearOneBackground(kind){const ok=await deleteDB(BLOB_STORE,getBackgroundKey(kind));if(!ok){showToast('背景清除失败，请重试');return;}setBackgroundState(kind,'');render();}
async function clearBackground(){const playerKey=state.settings.playerBgKey||'app_bg_music_player';const listKey=state.settings.listBgKey||'app_bg_music_list';const [playerOk,listOk]=await Promise.all([deleteDB(BLOB_STORE,playerKey),deleteDB(BLOB_STORE,listKey)]);if(playerOk)state.playerBg='';if(listOk)state.listBg='';if(!playerOk||!listOk)showToast('部分背景未能清除，请重试');render();}

function actionSheet(title,actions){document.querySelector('.music-sheet-backdrop')?.remove();const bg=el('div','music-sheet-backdrop');const sheet=el('section','music-sheet');sheet.append(el('strong','sheet-title',title));actions.forEach(([label,fn])=>{const b=el('button','sheet-action',label);b.onclick=async()=>{bg.remove();await fn?.();};sheet.append(b);});const cancel=el('button','sheet-cancel','取消');cancel.onclick=()=>bg.remove();sheet.append(cancel);bg.onclick=e=>{if(e.target===bg)bg.remove();};bg.append(sheet);document.body.append(bg);}

function updateProgress(){const range=document.querySelector('.player-progress input');if(range&&!state.seeking){range.max=String(Math.max(0,state.duration));range.value=String(Math.min(state.currentTime,state.duration||0));}const cur=document.querySelector('.progress-current');const dur=document.querySelector('.progress-duration');if(cur)cur.textContent=formatTime(state.currentTime);if(dur)dur.textContent=formatTime(state.duration,true);}
function sync(){updateProgress();const play=document.querySelector('.player-play');if(play){play.innerHTML='';play.append(iconNode(state.loading?'refresh':state.isPlaying?'pause':'play',26));}document.querySelector('.player-disc')?.classList.toggle('spinning',state.isPlaying);if(state.mounted&&state.root&&!document.activeElement?.matches('input,textarea,select'))render();updateDesktopWidget();}
function updateDesktopWidget(){window.dispatchEvent(new CustomEvent('music:statechange',{detail:publicState()}));}

function go(page){state.page=page;state.search='';render();}
function openLibraryFilter(filter){state.filter=filter;go('library');}
function pageTitle(){return {home:'音乐',library:'音乐库',playlists:'歌单',playlist:'歌单详情'}[state.page]||'音乐';}
function currentSong(){return state.songs.find(s=>sameId(s.id,state.currentSongId))||null;}
function resolveSongId(value){const song=state.songs.find(item=>sameId(item.id,value));return song ? song.id : '';}
function sameId(left,right){return left !== null && left !== undefined && right !== null && right !== undefined && String(left)===String(right);}
function visibleSongs(){if(state.page==='playlist'){const pl=state.playlists.find(p=>p.id===state.detailId);if(pl)return pl.songIds.map(id=>state.songs.find(s=>s.id===id)).filter(Boolean);}return queriedSongs();}
function sortedSongs(kind){return sortSongs(state.songs.slice(),kind);}
function sortSongs(songs,kind){const text=(v)=>String(v||'').localeCompare('', 'zh-CN');return songs.sort((a,b)=>{if(kind==='recent')return String(b.lastPlayedAt||'').localeCompare(String(a.lastPlayedAt||''));if(kind==='title')return a.title.localeCompare(b.title,'zh-CN');if(kind==='artist')return (a.artist||'').localeCompare(b.artist||'','zh-CN');if(kind==='plays')return finite(b.playCount)-finite(a.playCount);return String(b.addedAt||'').localeCompare(String(a.addedAt||''));});}
function lyricsFor(song){if(!song)return[];const raw=song.lyricsText??song.lyrics;if(Array.isArray(raw))return raw.map(x=>({time:song.lyricsSynced===true&&Number.isFinite(Number(x.time))?Number(x.time):null,text:String(x.text||'')})).filter(x=>x.text);if(typeof raw!=='string'||!raw.trim())return[];if(/\[\d{1,2}:\d{2}/.test(raw))return parseLRC(raw);return raw.split(/\r?\n/).map(text=>({time:null,text:text.trim()})).filter(x=>x.text);}
function lyricsRaw(song){if(!song)return'';if(typeof song.lyricsText==='string')return song.lyricsText;if(typeof song.lyrics==='string')return song.lyrics;if(Array.isArray(song.lyrics))return song.lyrics.map(x=>x.time==null?x.text:`[${formatLrcTime(x.time)}]${x.text}`).join('\n');return'';}
function parseLRC(text){const out=[];text.split(/\r?\n/).forEach(line=>{const stamps=[...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];const lyric=line.replace(/\[[^\]]+\]/g,'').trim();stamps.forEach(m=>{if(lyric)out.push({time:Number(m[1])*60+Number(m[2])+Number(`0.${m[3]||0}`),text:lyric});});});return out.sort((a,b)=>a.time-b.time);}

function sectionHeader(title,meta,onClick){const h=el('div','section-header');h.append(el('h2','',title));if(onClick){const button=el('button','section-link',meta||'查看全部');button.onclick=onClick;h.append(button);}else h.append(el('span','',meta||''));return h;}
function emptyState(title,desc,button,fn){const box=el('div','music-empty');box.append(catMark(),el('strong','',title),el('p','',desc));if(button){const b=el('button','music-secondary',button);b.onclick=fn;box.append(b);}return box;}
function catMark(){const mark=el('div','cat-mark');mark.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 25 18 10l12 10h4l12-10 4 15v18c0 8-8 14-18 14S14 51 14 43V25Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 35h1m14 0h1M27 44c3 2 7 2 10 0" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';return mark;}
function cover(song,className){const box=el('div',className);if(song?.cover){const img=el('img');img.src=song.cover;img.alt='';box.append(img);}else box.append(catMark());return box;}
function playlistCover(pl){const first=pl.songIds.map(id=>state.songs.find(s=>s.id===id)).find(Boolean);return cover(pl.cover?{cover:pl.cover}:first,'playlist-cover');}
function textBlock(kicker,title,subtitle){const box=el('span','music-text');if(kicker)box.append(el('small','',kicker));box.append(el('strong','',title||''),el('span','',subtitle||''));return box;}
function artistAlbum(song){return [song.artist||'未知歌手',song.album].filter(Boolean).join(' · ');}
function playbackStatus(song){if(!sameId(song?.id,state.currentSongId))return'';if(state.sourceState==='preparing')return'加载中';if(state.needsPlayGesture)return'待继续';if(state.sourceState==='error')return'播放失败';return'';}
function iconButton(name,label,handler,className=''){const b=el('button',`icon-btn ${className}`.trim());b.type='button';b.setAttribute('aria-label',label);b.title=label;b.append(iconNode(name,20));b.onclick=handler;return b;}
function iconNode(name,size){return createIcon(name,size);}
function el(tag,className='',text=''){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined&&text!==null&&text!=='')node.textContent=text;return node;}
function formatTime(value,unknownWhenInvalid=false){if(!validDuration(value)){if(unknownWhenInvalid)return '时长未知';value=0;}const sec=Number(value);return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(Math.floor(sec%60)).padStart(2,'0')}`;}
function formatLrcTime(value){const sec=finite(value);return `${String(Math.floor(sec/60)).padStart(2,'0')}:${(sec%60).toFixed(2).padStart(5,'0')}`;}
function finite(value){const n=Number(value);return Number.isFinite(n)&&n>=0?n:0;}
function validDuration(value){const n=Number(value);return Number.isFinite(n)&&n>0;}
function clamp(v,min,max){return Math.min(max,Math.max(min,v));}
function isIOS(){return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
function cssUrl(value){return String(value).replace(/["\\\n\r]/g,'');}
function cleanSong(song){const copy={...song};delete copy._countedAt;return copy;}
function releaseRetiredObjectUrls(){state.retiredObjectUrls.forEach(url=>URL.revokeObjectURL(url));state.retiredObjectUrls.clear();}
function revokeObjectUrl(){if(state.objectUrl){URL.revokeObjectURL(state.objectUrl);state.objectUrl='';}releaseRetiredObjectUrls();}
function readAsDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error('文件读取失败'));reader.readAsDataURL(file);});}

function probeMediaDuration(file,{signal,timeoutMs=10000}={}){
  return new Promise(resolve=>{
    const probe=document.createElement('audio');
    const url=URL.createObjectURL(file);
    let settled=false;let timer;
    const cleanup=()=>{clearTimeout(timer);probe.removeEventListener('loadedmetadata',onMetadata);probe.removeEventListener('error',onFailure);signal?.removeEventListener('abort',onFailure);probe.removeAttribute('src');probe.load();URL.revokeObjectURL(url);};
    const finish=value=>{if(settled)return;settled=true;cleanup();resolve(validDuration(value)?Number(value):null);};
    const onMetadata=()=>finish(probe.duration);
    const onFailure=()=>finish(null);
    probe.preload='metadata';
    probe.addEventListener('loadedmetadata',onMetadata);
    probe.addEventListener('error',onFailure);
    signal?.addEventListener('abort',onFailure,{once:true});
    if(signal?.aborted){finish(null);return;}
    timer=setTimeout(onFailure,timeoutMs);
    probe.src=url;
    probe.load();
  });
}

async function readID3(file){const tags={title:'',artist:'',album:'',cover:''};try{const buffer=await file.arrayBuffer();const view=new DataView(buffer);if(buffer.byteLength<10||view.getUint8(0)!==73||view.getUint8(1)!==68||view.getUint8(2)!==51)return tags;const version=view.getUint8(3);const total=synchsafe(view,6);let pos=10;while(pos+10<=Math.min(buffer.byteLength,total+10)){const id=String.fromCharCode(...new Uint8Array(buffer,pos,4));const size=version===4?synchsafe(view,pos+4):view.getUint32(pos+4);if(!size||pos+10+size>buffer.byteLength)break;if(id==='TIT2')tags.title=decodeText(buffer,pos+10,size);if(id==='TPE1')tags.artist=decodeText(buffer,pos+10,size);if(id==='TALB')tags.album=decodeText(buffer,pos+10,size);if(id==='APIC')tags.cover=decodePicture(buffer,pos+10,size);pos+=10+size;}}catch{}return tags;}
function synchsafe(view,pos){return ((view.getUint8(pos)&127)<<21)|((view.getUint8(pos+1)&127)<<14)|((view.getUint8(pos+2)&127)<<7)|(view.getUint8(pos+3)&127);}
function decodeText(buffer,pos,size){const encoding=new Uint8Array(buffer,pos,1)[0];const bytes=new Uint8Array(buffer,pos+1,Math.max(0,size-1));const charset=encoding===0?'latin1':encoding===1||encoding===2?'utf-16':'utf-8';return new TextDecoder(charset).decode(bytes).replace(/\0/g,'').trim();}
function decodePicture(buffer,pos,size){try{const bytes=new Uint8Array(buffer,pos,size);let cursor=1;while(cursor<bytes.length&&bytes[cursor]!==0)cursor++;const mime=new TextDecoder('latin1').decode(bytes.slice(1,cursor))||'image/jpeg';cursor+=2;while(cursor<bytes.length&&bytes[cursor]!==0)cursor++;cursor++;let binary='';for(let offset=cursor;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,Math.min(offset+8192,bytes.length)));return binary?`data:${mime};base64,${btoa(binary)}`:'';}catch{return'';}}

function injectStyle(){document.getElementById(STYLE_ID)?.remove();const style=el('style');style.id=STYLE_ID;style.textContent=`
.music-app{--music-glass:color-mix(in srgb,var(--bg-card) 78%,transparent);--music-soft:color-mix(in srgb,var(--accent) 12%,var(--bg-primary));position:relative;height:100%;overflow:hidden;background:var(--bg-primary);color:var(--text-primary);background-size:cover;background-position:center;font-family:inherit}.music-app:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--bg-primary) 54%,transparent),color-mix(in srgb,var(--bg-primary) 76%,transparent));pointer-events:none}.music-app>*{position:relative}.music-app button{font:inherit;-webkit-tap-highlight-color:transparent}.music-topbar{height:54px;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;padding:0 12px}.music-title{text-align:center;font-size:17px;letter-spacing:.04em}.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border:0;border-radius:50%;background:transparent;color:inherit}.icon-btn.selected{color:var(--accent)}.icon-btn:active,.music-app button:active{transform:scale(.95)}.music-app button:disabled{opacity:.42}.music-nav{display:flex;gap:24px;margin:0 18px 8px;border-bottom:1px solid color-mix(in srgb,var(--border-soft) 68%,transparent)}.music-nav-btn{position:relative;border:0;padding:8px 1px 10px;background:transparent;color:var(--text-secondary);font-size:14px}.music-nav-btn.active{color:var(--text-primary);font-weight:700}.music-nav-btn.active:after{content:"";position:absolute;left:18%;right:18%;bottom:-1px;height:3px;border-radius:3px;background:var(--accent)}.music-nav-spacer{height:2px}.music-scroll{height:calc(100% - 106px);overflow:auto;padding:8px 16px calc(112px + env(safe-area-inset-bottom));scrollbar-width:none}.music-nav-spacer+.music-scroll{height:calc(100% - 56px)}.section-header{display:flex;align-items:center;justify-content:space-between;margin:19px 2px 10px}.section-header h2{margin:0;font-size:17px;letter-spacing:.02em}.section-header span,.section-link{color:var(--text-secondary);font-size:12px}.section-link{border:0;background:transparent;padding:7px}.now-card{position:relative;width:100%;min-height:104px;display:flex;align-items:center;gap:14px;padding:13px;border:0;border-radius:28px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 24%,var(--bg-card)),var(--music-glass));color:inherit;text-align:left;overflow:hidden}.now-card:after{content:"";position:absolute;width:92px;height:92px;border:20px solid color-mix(in srgb,var(--accent) 12%,transparent);border-radius:50%;right:-42px;top:-45px}.now-cover{width:78px;height:78px;border-radius:23px;overflow:hidden;flex:none;box-shadow:0 8px 22px color-mix(in srgb,var(--text-primary) 10%,transparent)}.now-play{position:relative;z-index:1;flex:none;background:var(--accent);color:var(--bubble-user-text)}.music-text{display:flex;flex-direction:column;min-width:0;flex:1;gap:4px;text-align:left}.music-text strong,.music-text span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.music-text strong{font-size:15px}.music-text small,.music-text span{color:var(--text-secondary);font-size:12px}.music-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0 4px}.quick-entry{min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;border:0;padding:8px 2px;background:transparent;color:inherit}.quick-art{display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:18px 18px 18px 8px;background:var(--music-soft);color:var(--accent)}.quick-favorite .quick-art{border-radius:50% 50% 18px 18px}.quick-all .quick-art{transform:rotate(-3deg)}.quick-playlists .quick-art{border-radius:14px 22px 14px 22px}.quick-entry>svg{display:none}.quick-entry strong{max-width:100%;font-size:11px;white-space:nowrap}.quick-entry small{font-size:10px;color:var(--text-hint)}.cat-mark{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--accent);background:radial-gradient(circle at 70% 22%,color-mix(in srgb,var(--accent) 24%,transparent),transparent 25%),linear-gradient(145deg,var(--music-soft),color-mix(in srgb,var(--bg-card) 72%,transparent))}.cat-mark:after{content:"♪";position:absolute;right:10%;top:7%;font-size:12px;font-weight:700}.cat-mark svg{width:55%;height:55%}.music-app img{width:100%;height:100%;object-fit:cover}.song-rail{display:grid;grid-auto-flow:column;grid-auto-columns:112px;gap:12px;overflow:auto;padding-bottom:3px}.rail-song{border:0;background:transparent;color:inherit;text-align:left;padding:0}.rail-cover{width:112px;height:112px;border-radius:24px 24px 24px 10px;overflow:hidden}.rail-song:nth-child(even) .rail-cover{border-radius:50% 50% 22px 22px}.rail-song strong,.rail-song span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:6px}.rail-song span{margin-top:2px;font-size:12px;color:var(--text-secondary)}.playlist-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.playlist-card{border:0;background:transparent;color:inherit;text-align:left}.playlist-cover{aspect-ratio:1;border-radius:25px 25px 12px 25px;overflow:hidden}.playlist-card strong,.playlist-card span{display:block;margin:6px 2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.playlist-card span{font-size:12px;color:var(--text-secondary)}.music-empty{display:grid;grid-template-columns:48px 1fr;align-items:center;text-align:left;gap:2px 12px;padding:13px;border:1px dashed color-mix(in srgb,var(--border-soft) 80%,transparent);border-radius:19px;color:var(--text-secondary)}.music-empty>.cat-mark{grid-row:1/4;width:48px;height:48px;border-radius:17px}.music-empty strong{color:var(--text-primary)}.music-empty p{font-size:12px;margin:3px 0}.music-empty button{justify-self:start;margin-top:4px}.music-primary,.music-secondary,.music-danger{border:0;border-radius:17px;padding:12px 16px;font:inherit;font-weight:600}.music-primary{background:var(--accent);color:var(--bubble-user-text)}.music-secondary{background:var(--music-soft);color:var(--text-primary)}.music-danger{background:color-mix(in srgb,var(--color-danger) 10%,var(--bg-card));color:var(--color-danger);margin-top:22px;width:100%}.music-search{display:flex;align-items:center;gap:8px;background:var(--music-glass);padding:0 13px;border:1px solid color-mix(in srgb,var(--border-soft) 55%,transparent);border-radius:18px}.music-search input{width:100%;border:0;outline:0;background:transparent;color:inherit;padding:12px 0;font:inherit}.library-tools{display:flex;align-items:flex-start;gap:8px;margin:10px 0}.library-filters{display:flex;gap:6px;overflow:auto;flex:1}.library-filters button,.music-sort{border:0;border-radius:14px;padding:8px 10px;background:var(--music-glass);color:var(--text-secondary);white-space:nowrap}.library-filters button.active{background:var(--accent);color:var(--bubble-user-text)}.song-list{display:flex;flex-direction:column;gap:4px}.song-row{display:flex;align-items:center;padding:5px 4px;border-radius:17px}.song-row.active{background:color-mix(in srgb,var(--accent) 13%,transparent)}.song-main{display:flex;align-items:center;gap:10px;min-width:0;flex:1;padding:5px;border:0;background:transparent;color:inherit}.song-cover{width:48px;height:48px;border-radius:15px;overflow:hidden;flex:none}.song-row.active .song-cover{border-radius:50%}.song-duration{font-size:10px;color:var(--text-hint)}.song-row>.icon-btn{width:34px}.music-library>.music-primary{width:100%;margin-top:16px}.import-report{margin-top:12px;padding:14px;border-radius:20px;background:var(--music-glass)}.import-report p,.import-report small{display:block;color:var(--text-secondary);font-size:12px}.music-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.group-card{display:flex;align-items:center;gap:9px;border:0;border-radius:20px;padding:9px;background:var(--music-glass);color:inherit}.group-cover{width:52px;height:52px;border-radius:15px;overflow:hidden;flex:none}.playlist-hero{display:grid;grid-template-columns:104px 1fr 42px;align-items:center;gap:13px;padding:12px;border-radius:25px;background:linear-gradient(135deg,var(--music-soft),var(--music-glass))}.playlist-hero>.playlist-cover{width:104px}.playlist-controls{display:flex;gap:8px;margin:18px 0;overflow:auto}.playlist-controls button{white-space:nowrap}.music-player{position:relative;height:calc(100% - 54px);overflow:auto;padding:10px 24px calc(24px + env(safe-area-inset-bottom));text-align:center;background-size:cover;background-position:center}.music-player:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,color-mix(in srgb,var(--bg-primary) 52%,transparent),color-mix(in srgb,var(--bg-primary) 80%,transparent))}.music-player>*{position:relative}.player-disc{width:min(62vw,228px);aspect-ratio:1;margin:clamp(8px,3vh,28px) auto 22px;border-radius:34px;padding:8px;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 24%,var(--bg-card)),var(--music-glass));box-shadow:0 18px 42px color-mix(in srgb,var(--text-primary) 12%,transparent)}.player-cover{height:100%;border-radius:28px;overflow:hidden}.player-disc.spinning{animation:music-float 4s ease-in-out infinite}.player-meta-row{display:flex;align-items:center;gap:10px;max-width:310px;margin:auto;text-align:left}.player-meta{min-width:0;flex:1}.player-meta h2{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:22px}.player-meta p{margin:6px 0;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.player-favorite{flex:none;background:var(--music-soft)}.player-progress{margin-top:18px}.player-progress input,.volume-control input{width:100%;height:22px;accent-color:var(--accent)}.progress-times{display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary)}.player-main-controls{display:flex;align-items:center;justify-content:center;gap:24px;margin:14px}.player-main-controls>.icon-btn{width:50px;height:50px;background:color-mix(in srgb,var(--bg-card) 52%,transparent)}.player-main-controls .player-play{width:66px;height:66px;background:var(--accent);color:var(--bubble-user-text);box-shadow:0 9px 28px color-mix(in srgb,var(--accent) 28%,transparent)}.player-extras{display:flex;justify-content:space-around;gap:8px}.player-extras button{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:70px;border:0;padding:7px;background:transparent;color:var(--text-secondary);font-size:11px}.volume-control{display:flex;align-items:center;gap:10px;margin:12px auto;max-width:260px;color:var(--text-secondary);font-size:12px}.player-error{padding:11px;border-radius:16px;background:var(--music-soft);color:var(--text-secondary)}.player-error button{margin-left:7px;border:0;border-radius:12px;padding:7px;background:var(--bg-card);color:inherit}.music-mini{position:absolute;z-index:5;left:12px;right:12px;bottom:calc(10px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:9px;padding:8px 9px;border:1px solid color-mix(in srgb,var(--border-soft) 58%,transparent);border-radius:23px;background:color-mix(in srgb,var(--bg-card) 82%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:inherit;text-align:left;box-shadow:0 12px 32px color-mix(in srgb,var(--text-primary) 13%,transparent)}.mini-cover{width:48px;height:48px;border-radius:16px;overflow:hidden;flex:none}.music-mini>.icon-btn{width:38px;flex:none}.music-sheet-backdrop{position:fixed;z-index:10020;inset:0;display:flex;align-items:flex-end;background:color-mix(in srgb,var(--text-primary) 24%,transparent)}.music-sheet{width:100%;max-height:min(72vh,620px);overflow:auto;padding:10px 14px calc(14px + env(safe-area-inset-bottom));border-radius:28px 28px 0 0;background:color-mix(in srgb,var(--bg-primary) 94%,transparent);color:var(--text-primary);backdrop-filter:blur(22px)}.sheet-title{display:block;padding:10px}.sheet-action,.sheet-cancel{display:block;width:100%;padding:14px;border:0;border-radius:14px;background:transparent;color:inherit;text-align:left}.sheet-action:active{background:var(--music-soft)}.sheet-cancel{text-align:center;margin-top:7px;background:var(--music-soft)}.music-lyrics-sheet{position:fixed;z-index:10010;inset:0;display:flex;flex-direction:column;background:color-mix(in srgb,var(--bg-primary) 94%,transparent);backdrop-filter:blur(20px);color:var(--text-primary)}.music-lyrics-sheet header{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 16px}.lyrics-body{flex:1;overflow:auto;padding:22vh 22px}.lyric-line{display:block;width:100%;border:0;background:transparent;color:var(--text-secondary);font-size:16px;line-height:1.55;padding:10px;text-align:center}.lyric-line.active{color:var(--accent);font-size:19px;font-weight:700}@keyframes music-float{50%{transform:translateY(-4px) rotate(1deg)}}@media(max-height:650px){.player-disc{width:min(48vw,176px);margin:4px auto 12px}.player-main-controls{margin:7px}.player-progress{margin-top:8px}.volume-control{margin:7px auto}}@media(orientation:landscape) and (max-height:520px){.music-player{display:grid;grid-template-columns:minmax(150px,38%) 1fr;grid-template-rows:auto auto auto auto;padding:6px 18px;column-gap:24px}.player-disc{grid-row:1/5;width:min(32vw,190px);align-self:center}.player-meta-row,.player-progress,.player-main-controls,.player-extras{grid-column:2}.volume-control{display:none}}@media(max-width:350px){.music-scroll{padding-left:11px;padding-right:11px}.music-quick{gap:2px}.quick-art{width:44px;height:44px}.player-disc{width:56vw}}@media(prefers-reduced-motion:reduce){.player-disc.spinning{animation:none}}
`;document.head.append(style);}
