// —————————————————————————————————————
// 1) GLOBAL CONFIG & MOBILE DETECTION
// —————————————————————————————————————
const API_KEY           = "pk_0b8abc6f834b444f949f727e88a728e0";
const STATION_ID        = "cutters-choice-radio";
const BASE_URL          = "https://api.radiocult.fm/api";
const SOCKET_URL        = "https://api.radiocult.fm";
const FALLBACK_ART      = "https://i.imgur.com/qWOfxOS.png";
const MIXCLOUD_PASSWORD = "cutters44";
const isMobile          = /Mobi|Android/i.test(navigator.userAgent);

// In-memory map for real-time chat participants
const participantsMap   = new Map();

// —————————————————————————————————————
// 2) HELPERS
// —————————————————————————————————————
function createGoogleCalLink(title, startUtc, endUtc) {
  if (!startUtc || !endUtc) return "#";
  const fmt = dt => new Date(dt)
    .toISOString()
    .replace(/[-:]|\.\d{3}/g, "");
  return `https://calendar.google.com/calendar/render?action=TEMPLATE`
    + `&text=${encodeURIComponent(title)}`
    + `&dates=${fmt(startUtc)}/${fmt(endUtc)}`
    + `&details=Tune in live at https://cutterschoiceradio.com`
    + `&location=https://cutterschoiceradio.com`;
}

async function rcFetch(path) {
  const res = await fetch(BASE_URL + path, {
    headers: { "x-api-key": API_KEY }
  });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function shuffleIframesDaily() {
  const container = document.getElementById("mixcloud-list");
  if (!container) return;
  const iframes = Array.from(container.querySelectorAll("iframe.mixcloud-iframe"));
  const today = new Date().toISOString().split("T")[0];
  if (localStorage.getItem("lastShuffleDate") === today) return;
  for (let i = iframes.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [iframes[i], iframes[j]] = [iframes[j], iframes[i]];
  }
  container.innerHTML = "";
  iframes.forEach(ifr => container.appendChild(ifr));
  localStorage.setItem("lastShuffleDate", today);
}

// —————————————————————————————————————
// 3) CHAT PARTICIPANTS FETCH & RENDER
// —————————————————————————————————————
async function fetchChatParticipants() {
  const path = `/stations/${STATION_ID}/chat/participants`;
  const res = await fetch(BASE_URL + path, {
    headers: { 'x-api-key': API_KEY }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.participants || [];
}

function renderChatParticipants(list) {
  const container = document.querySelector('.rc-user-list');
  if (!container) return;
  container.innerHTML = '';
  list.forEach(u => {
    const div = document.createElement('div');
    div.textContent = u.name;
    container.appendChild(div);
  });
}

function renderParticipantsMap() {
  const container = document.querySelector('.rc-user-list');
  if (!container) return;
  container.innerHTML = '';
  participantsMap.forEach(u => {
    const div = document.createElement('div');
    div.textContent = u.name;
    container.appendChild(div);
  });
}

// —————————————————————————————————————
// 4) DATA FETCHERS: LIVE, SCHEDULE, NOW PLAYING
// —————————————————————————————————————
async function fetchLiveNow() {
  try {
    const { result } = await rcFetch(`/station/${STATION_ID}/schedule/live`);
    const md = result.metadata || {};
    // update desktop artwork
    document.getElementById("now-art").src = md.artwork_url || FALLBACK_ART;
    // update mobile artwork
    const mobileArt = document.getElementById("mobile-now-art");
    if (mobileArt) {
      mobileArt.src = md.artwork_url || FALLBACK_ART;
    }
  } catch (e) {
    console.error("Live-now fetch error:", e);
    document.getElementById("now-art").src = FALLBACK_ART;
    const mobileArt = document.getElementById("mobile-now-art");
    if (mobileArt) {
      mobileArt.src = FALLBACK_ART;
    }
  }
}

async function fetchWeeklySchedule() {
  const container = document.getElementById("schedule-container");
  if (!container) return;
  container.innerHTML = "<p>Loading this week's schedule…</p>";
  try {
    const now = new Date();
    const then = new Date(now.getTime() + 7*24*60*60*1000);
    const path = `/station/${STATION_ID}/schedule?startDate=${now.toISOString()}&endDate=${then.toISOString()}`;
    const { schedules: raw = [] } = await rcFetch(path);
    const schedules = raw.map(ev => ({
      ...ev,
      start: ev.startDateUtc||ev.startDate||ev.start,
      end:   ev.endDateUtc  ||ev.endDate  ||ev.end
    }));
    if (!schedules.length) {
      container.innerHTML = "<p>No shows scheduled this week.</p>";
      return;
    }
    container.innerHTML = '';
    const fmtTime = iso => new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
    const byDay = schedules.reduce((acc, ev) => {
      const day = new Date(ev.start).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"});
      (acc[day]=acc[day]||[]).push(ev);
      return acc;
    }, {});
    Object.entries(byDay).forEach(([day, events]) => {
      const h3 = document.createElement('h3'); h3.textContent = day; container.appendChild(h3);
      const ul = document.createElement('ul'); ul.style.listStyle='none'; ul.style.padding='0';
      events.forEach(ev => {
        const li = document.createElement('li');
        const wrap = document.createElement('div');
        wrap.style.display='flex'; wrap.style.alignItems='center'; wrap.style.gap='8px';
        const t = document.createElement('strong');
        t.textContent = `${fmtTime(ev.start)}–${fmtTime(ev.end)}`;
        wrap.appendChild(t);
        const art = ev.metadata?.artwork?.default||ev.metadata?.artwork?.original;
        if (art) {
          const img = document.createElement('img');
          img.src = art; img.alt = `${ev.title} artwork`;
          img.style.cssText='width:30px;height:30px;object-fit:cover;border-radius:3px;';
          wrap.appendChild(img);
        }
        const title = document.createElement('span');
        title.textContent = ev.title; wrap.appendChild(title);
        if (!/archive/i.test(ev.title)) {
          const calBtn = document.createElement('a');
          calBtn.href = createGoogleCalLink(ev.title,ev.start,ev.end);
          calBtn.target='_blank'; calBtn.innerHTML='📅';
          calBtn.style.cssText='font-size:1.4rem;text-decoration:none;margin-left:6px;';
          wrap.appendChild(calBtn);
        }
        li.appendChild(wrap); ul.appendChild(li);
      });
      container.appendChild(ul);
    });
  } catch (e) {
    console.error("Schedule fetch error:", e);
    container.innerHTML = "<p>Error loading schedule.</p>";
  }
}

async function fetchNowPlaying() {
  try {
    const data = await fetch(`${BASE_URL}/station/${STATION_ID}/schedule/live`, {
      headers:{'x-api-key':API_KEY}
    }).then(r=>r.json());
    const md = data.result?.metadata, ct = data.result?.content;
    const el = document.getElementById('now-archive');
    el.textContent = md?.artist
      ? `Playing Now: ${md.artist} – ${md.title}`
      : (ct?.title
         ? `Playing Now: ${ct.title}`
         : 'Playing Now: Unknown Show');
  } catch (err) {
    console.error('Now playing fetch error:', err);
    document.getElementById('now-archive').textContent = 'Unable to load now playing';
  }
}

// —————————————————————————————————————
// 5) ADMIN & UI ACTIONS
// —————————————————————————————————————
function addMixcloud() { /* unchanged */ }
function deleteMixcloud(btn) { /* unchanged */ }
function openChatPopup() {
  const iframe = document.querySelector('section.chat iframe');
  if (!iframe) return;
  const src = iframe.src;
  const w = window.open('', 'CCRChat', 'width=375,height=667,resizable=yes,menubar=no,toolbar=no');
  w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cutters Choice Chat</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh}iframe{width:100%;height:100%;border:none;border-radius:4px}</style></head><body><iframe src="${src}" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></body></html>`);
  w.document.close();
}

// —————————————————————————————————————
// 6) INITIALIZE ON DOM READY
// —————————————————————————————————————
document.addEventListener('DOMContentLoaded', () => {
  fetchLiveNow();
  fetchWeeklySchedule();
  fetchNowPlaying();
  setInterval(fetchLiveNow, 30000);
  setInterval(fetchNowPlaying, 60000);

  const mixSection = document.querySelector('.mixcloud');
  if (isMobile) {
    mixSection?.remove();
    // hide inline chat on mobile
    document.querySelector('.chat')?.remove();
  } else {
    document.querySelectorAll('iframe.mixcloud-iframe').forEach(iframe => {
      iframe.src = iframe.getAttribute('data-src');
    });
    shuffleIframesDaily();
    const mc = document.createElement('script');
    mc.src = 'https://widget.mixcloud.com/widget.js';
    mc.async = true;
    document.body.appendChild(mc);
  }

  const participantsContainer = document.querySelector('.rc-user-list');
  fetchChatParticipants()
    .then(list => list.length ? renderChatParticipants(list) : participantsContainer.textContent = 'No listeners online')
    .catch(() => participantsContainer.textContent = 'Unable to load listeners');
  setInterval(async () => {
    try {
      const list = await fetchChatParticipants();
      list.length ? renderChatParticipants(list) : participantsContainer.textContent = 'No listeners online';
    } catch {}
  }, 15000);

  const socket = io(SOCKET_URL, {
    path: '/chat/socket.io',
    transports: ['websocket'],
    auth: { key: API_KEY }
  });
  socket.on('participant.join', user => { participantsMap.set(user.id, user); renderParticipantsMap(); });
  socket.on('participant.leave', user => { participantsMap.delete(user.id); renderParticipantsMap(); });

  document.getElementById('popOutBtn')?.addEventListener('click', () => {
    const src = document.getElementById('inlinePlayer').src;
    const w = window.open('', 'CCRPlayer', 'width=400,height=200,resizable=yes');
    w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cutters Choice Player</title><style>body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh}iframe{width:100%;height:180px;border:none;border-radius:4px}</style></head><body><iframe src="${src}" allow="autoplay"></iframe></body></html>`);
    w.document.close();
  });
});
