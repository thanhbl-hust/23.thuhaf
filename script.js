// ===== LOVE COUNTER =====
const LOVE_START = new Date('2026-02-06T00:00:00');
function pad2(n) { return String(n).padStart(2, '0'); }
function daysTogether(now = Date.now()) { return Math.floor((now - LOVE_START.getTime()) / 86400000); }

// Each digit is its own span; a digit that changes rolls up like a mechanical counter
function setDigits(el, text) {
    if (el.children.length !== text.length) {
        el.replaceChildren(...[...text].map(ch => Object.assign(document.createElement('span'), { className: 'lc-digit', textContent: ch })));
        return;
    }
    [...text].forEach((ch, i) => {
        const digit = el.children[i];
        if (digit.textContent === ch) return;
        digit.dataset.prev = digit.textContent;
        digit.textContent = ch;
        digit.classList.remove('roll');
        void digit.offsetWidth; // restart the animation
        digit.classList.add('roll');
    });
}

// The day count runs up from 0 when the page is shown; until then loveTick leaves it alone
let daysCountingUp = true;
function countUpDays(target, duration = 1400) {
    const el = document.getElementById('lcDays');
    const start = performance.now() + 250;
    function frame(now) {
        const t = Math.min(Math.max((now - start) / duration, 0), 1);
        const eased = 1 - Math.pow(1 - t, 3);
        el.textContent = Math.round(target * eased).toLocaleString('vi-VN');
        if (t < 1) requestAnimationFrame(frame);
        else daysCountingUp = false;
    }
    requestAnimationFrame(frame);
}

function loveTick() {
    const diff = Date.now() - LOVE_START.getTime();
    if (diff < 0) return;
    const rem = diff % 86400000;
    if (!daysCountingUp) document.getElementById('lcDays').textContent = daysTogether().toLocaleString('vi-VN');
    setDigits(document.getElementById('lcH'), pad2(Math.floor(rem / 3600000)));
    setDigits(document.getElementById('lcM'), pad2(Math.floor((rem % 3600000) / 60000)));
    setDigits(document.getElementById('lcS'), pad2(Math.floor((rem % 60000) / 1000)));
}

// ===== OPENING SCREEN =====
// Every visit opens on the beach scene (drawn by intro.js) with a button into the page. Once in, the scene stays
// behind the page as its background, and the island button on the counter goes back to it. The page below is
// built straight away, but its own entrance (the count-up, the pins dropping, ...) waits for the first time in
const intro = document.getElementById('intro');
const app = document.querySelector('.app');
const onPageShown = [];
let pageShown = !intro;
let onBeach = !!intro;
function whenPageShown(fn) {
    if (pageShown) fn();
    else onPageShown.push(fn);
}

if (intro) {
    document.getElementById('introDays').textContent = Math.max(daysTogether(), 0).toLocaleString('vi-VN');
    document.getElementById('introEnter').addEventListener('click', enterPage);
    document.getElementById('backToBeach').addEventListener('click', e => {
        // Not a tap on the counter, so no hearts
        e.stopPropagation();
        backToBeach();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && onBeach) enterPage();
    });
} else {
    document.getElementById('backToBeach').hidden = true;
}

function enterPage() {
    if (!onBeach) return;
    onBeach = false;
    // The title and button fade while the camera pulls back to a wide view of the sunset, then the page comes in
    // over it
    intro.classList.add('leaving');
    window.openingScene?.toBackground();
    setTimeout(() => {
        if (onBeach) return;
        document.documentElement.classList.remove('intro-open');
        intro.inert = true;
        app.inert = false;
        if (!pageShown) {
            pageShown = true;
            onPageShown.forEach(fn => fn());
        }
    }, 700);
}

function backToBeach() {
    if (onBeach) return;
    onBeach = true;
    // The page fades out, the camera comes back in to the two of us, and the title and button return
    app.inert = true;
    document.documentElement.classList.add('intro-open');
    intro.inert = false;
    intro.classList.remove('leaving');
    window.openingScene?.toFront();
    document.getElementById('introEnter').focus({ preventScroll: true });
}

loveTick();
whenPageShown(() => countUpDays(Math.max(daysTogether(), 0)));
setInterval(loveTick, 1000);

// Tap the counter for a burst of hearts
document.querySelector('.love-counter').addEventListener('click', e => burstHearts(e.clientX, e.clientY));

function burstHearts(x, y) {
    const hearts = ['❤️', '💕', '💖', '💗', '💘'];
    for (let i = 0; i < 16; i++) {
        const heart = document.createElement('span');
        heart.className = 'burst-heart';
        heart.textContent = hearts[i % hearts.length];
        heart.style.left = x + 'px';
        heart.style.top = y + 'px';
        document.body.appendChild(heart);
        // Fly out in a random direction, then drift up and fade
        const angle = Math.random() * Math.PI * 2;
        const dist = 60 + Math.random() * 90;
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist - 30;
        const turn = (Math.random() - 0.5) * 70;
        heart.animate([
            { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${turn}deg) scale(1)`, opacity: 1, offset: 0.55 },
            { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy - 60}px)) rotate(${turn}deg) scale(0.7)`, opacity: 0 }
        ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2, .7, .3, 1)' }).finished.then(() => heart.remove());
    }
}

// ===== BUILD DATE → VISITS INDEX =====
function buildDateIndex() {
    const idx = {};
    mapPlaces.forEach(place => {
        place.visits.forEach((visit, vi) => {
            if (!visit.date) return;
            if (!idx[visit.date]) idx[visit.date] = [];
            idx[visit.date].push({ place, visitIdx: vi });
        });
    });
    return idx;
}
const dateVisitMap = buildDateIndex();

// Photos are in photos/ (max 1600px); smaller copies for the calendar and popup grids are in photos/thumbs/
function thumbSrc(src) {
    return src.replace(/^photos\//, 'photos/thumbs/');
}

// ===== SORT STATE =====
let currentSort = 'az';

function setSort(mode) {
    currentSort = mode;
    document.getElementById('sortAZ').classList.toggle('active', mode === 'az');
    document.getElementById('sortVisits').classList.toggle('active', mode === 'visits');
    buildCheckinList();
}

function getSortedPlaces() {
    const copy = [...mapPlaces];
    if (currentSort === 'az') {
        copy.sort((a, b) => {
            const nc = a.name.localeCompare(b.name);
            return nc !== 0 ? nc : b.visits.length - a.visits.length;
        });
    } else {
        copy.sort((a, b) => {
            const vc = b.visits.length - a.visits.length;
            return vc !== 0 ? vc : a.name.localeCompare(b.name);
        });
    }
    return copy;
}

// ===== VIEW TOGGLE =====
const VIEWS = ['map', 'list', 'cal'];
let currentView = 'map';

function switchView(view) {
    // The new view slides in from the side of its tab
    const direction = Math.sign(VIEWS.indexOf(view) - VIEWS.indexOf(currentView));
    currentView = view;
    VIEWS.forEach(k => {
        const key = k.charAt(0).toUpperCase() + k.slice(1);
        const panel = document.getElementById('panel' + key);
        panel.style.setProperty('--panel-dx', direction * 28 + 'px');
        panel.style.setProperty('--panel-dy', '0px');
        panel.classList.toggle('active', k === view);
        document.getElementById('btn' + key).classList.toggle('active', k === view);
    });
    placeTabPill(true);
    if (view === 'cal') restoreCalendarScroll();
}

// Move the blue highlight under the active tab (without animating on first draw and on resize)
function placeTabPill(animate) {
    const bar = document.querySelector('.view-toggle');
    const pill = bar.querySelector('.view-toggle-pill');
    const btn = bar.querySelector('.view-toggle-btn.active');
    if (!animate) pill.style.transition = 'none';
    pill.style.width = btn.offsetWidth + 'px';
    pill.style.height = btn.offsetHeight + 'px';
    pill.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
    if (!animate) {
        void pill.offsetWidth;
        pill.style.transition = '';
    }
    bar.classList.add('has-pill');
}
placeTabPill(false);
new ResizeObserver(() => placeTabPill(false)).observe(document.querySelector('.view-toggle'));
document.fonts?.ready.then(() => placeTabPill(false));

// ===== CHECK-IN LIST =====
function buildCheckinList() {
    const list = document.getElementById('checkinList');
    list.innerHTML = '';
    const sorted = getSortedPlaces();
    if (sorted.length === 0) {
        list.innerHTML = `<div class="checkin-empty"><div class="empty-icon">📍</div><div>No check-ins yet!</div></div>`;
        return;
    }
    sorted.forEach((place, i) => {
        const totalPhotos = place.visits.reduce((s, v) => s + (v.photos || []).filter(p => p?.src).length, 0);
        const totalVideos = place.visits.reduce((s, v) => s + (v.videos || []).filter(x => x?.src).length, 0);
        const visitCount = place.visits.length;
        const item = document.createElement('div');
        item.className = 'checkin-item';
        // Cards come in one after another; past the first screenful they all come in together
        item.style.setProperty('--i', Math.min(i, 12));
        item.innerHTML = `
                    <div class="checkin-item-heart">💕</div>
                    <div class="checkin-item-info">
                        <div class="checkin-item-name">${place.name}</div>
                        ${place.desc ? `<div class="checkin-item-desc">${place.desc}</div>` : ''}
                        <div class="checkin-item-meta">
                            <span class="checkin-photo-count">📷 ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}</span>
                            ${totalVideos > 0 ? `<span class="checkin-video-count">🎬 ${totalVideos} video${totalVideos !== 1 ? 's' : ''}</span>` : ''}
                            <span class="checkin-visit-count">🗓 ${visitCount} visit${visitCount !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="checkin-arrow">→</div>`;
        item.addEventListener('click', () => openMapPopup(place));
        list.appendChild(item);
    });
}
buildCheckinList();

// ===== BIRTHDAYS =====
// Format: "MM-DD"
const BIRTHDAYS = new Set(["12-10", "06-23"]);
function isBirthday(month0, day) {
    return BIRTHDAYS.has(pad2(month0 + 1) + "-" + pad2(day));
}

// ===== CALENDAR =====
// One scrollable list of months, from the month of the oldest check-in to the current month
function renderCalendar() {
    const scroller = document.getElementById('calScroll');
    const today = new Date();
    const dates = Object.keys(dateVisitMap).sort();
    const start = dates.length > 0 ? new Date(dates[0] + 'T00:00:00') : today;

    let year = start.getFullYear();
    let month0 = start.getMonth();
    while (year < today.getFullYear() || (year === today.getFullYear() && month0 <= today.getMonth())) {
        scroller.appendChild(buildMonth(year, month0, today));
        if (++month0 > 11) { month0 = 0; year++; }
    }
}

function buildMonth(year, month0, today) {
    const section = document.createElement('section');
    section.className = 'cal-month';
    section.dataset.month = `${year}-${pad2(month0 + 1)}`;

    const label = document.createElement('div');
    label.className = 'cal-month-label';
    label.textContent = new Date(year, month0, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    section.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'cal-days';
    const firstDay = new Date(year, month0, 1).getDay();
    const daysInMonth = new Date(year, month0 + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) appendBlank(grid);
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === today.getDate() && month0 === today.getMonth() && year === today.getFullYear();
        const dateStr = `${year}-${pad2(month0 + 1)}-${pad2(d)}`;
        appendDay(grid, month0, d, isToday, dateVisitMap[dateStr] || null);
    }
    // Pad the last week so every row has 7 cells
    while (grid.children.length % 7 !== 0) appendBlank(grid);

    section.appendChild(grid);
    return section;
}

function appendBlank(grid) {
    const cell = document.createElement('div');
    cell.className = 'cal-day other-month';
    grid.appendChild(cell);
}

function appendDay(grid, month0, day, isToday, entries) {
    const birthday = isBirthday(month0, day);

    const cell = document.createElement('div');
    cell.className = 'cal-day' +
        (isToday ? ' today' : '') +
        (entries ? ' has-visit' : '') +
        (birthday ? ' is-birthday' : '');

    // Date number row — cake sits next to number if there are entries
    const numRow = document.createElement('div');
    numRow.style.cssText = 'display:flex;align-items:center;gap:3px;';

    const numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = day;
    numRow.appendChild(numEl);

    if (birthday && entries?.length > 0) {
        const cake = document.createElement('span');
        cake.className = 'cal-birthday-cake';
        cake.textContent = '🎂';
        numRow.appendChild(cake);
    }

    cell.appendChild(numRow);

    if (entries?.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'cal-day-photos';
        // The cell shows the day's first check-in; "+N" tells how many more there are
        const { place, visitIdx } = entries[0];
        const firstPhoto = (place.visits[visitIdx].photos || []).find(p => p?.src);
        if (firstPhoto) {
            const thumb = document.createElement('div');
            thumb.className = 'cal-day-thumb';
            const img = document.createElement('img');
            img.src = thumbSrc(firstPhoto.src); img.alt = place.name; img.loading = 'lazy';
            thumb.appendChild(img);
            wrap.appendChild(thumb);
        } else {
            const pill = document.createElement('div');
            pill.className = 'cal-day-place-pill';
            // cake replaces icon in pill slot when birthday + no photo
            pill.textContent = (birthday ? '🎂 ' : place.icon ? place.icon + ' ' : '') + place.name;
            wrap.appendChild(pill);
        }
        if (entries.length > 1) {
            const more = document.createElement('div');
            more.className = 'cal-day-more';
            more.innerHTML = '+' + (entries.length - 1) + '<span class="cal-day-more-label"> more</span>';
            wrap.appendChild(more);
        }
        cell.appendChild(wrap);
        // One check-in opens it directly; several open a list to pick from
        cell.addEventListener('click', () => {
            if (entries.length === 1) openMapPopup(place, visitIdx);
            else openDayPopup(entries);
        });
    } else if (birthday) {
        // No check-in but it's a birthday — show cake in the content area
        const cakeBlock = document.createElement('div');
        cakeBlock.className = 'cal-birthday-solo';
        cakeBlock.textContent = '🎂';
        cell.appendChild(cakeBlock);
    }

    grid.appendChild(cell);
}

renderCalendar();

// Remember where the calendar was scrolled; the first time it opens, start at the month of the
// newest check-in (the current month may still be empty)
let calScrollTop = null;
document.getElementById('calScroll').addEventListener('scroll', e => { calScrollTop = e.target.scrollTop; });

function restoreCalendarScroll() {
    const scroller = document.getElementById('calScroll');
    if (calScrollTop === null) {
        const newestDate = Object.keys(dateVisitMap).sort().pop();
        const startMonth = (newestDate && scroller.querySelector(`[data-month="${newestDate.slice(0, 7)}"]`))
            || scroller.lastElementChild;
        const weekdays = scroller.querySelector('.cal-weekdays');
        calScrollTop = startMonth.offsetTop - weekdays.offsetHeight;
    }
    scroller.scrollTop = calScrollTop;
}

// ===== HANOI MAP =====
// lat: 21.034281533880666,
// lng: 105.81246668161833,
const map = L.map('hanoi-map', { center: [21.034281533880666, 105.81246668161833], zoom: 13, maxZoom: 19 });

// Base map: plain OpenStreetMap image tiles. They move with the pins at no extra cost while dragging;
// a vector map (MapLibre) looked nicer but redrew itself about 30 times a second and made dragging stutter.
// Some networks block OpenStreetMap's own tile server (on one home network its name led nowhere and the map
// stayed grey), so when a tile from it fails the map moves on to the same map hosted elsewhere
const tileServers = [
    { host: 'tile.openstreetmap.org', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
    { host: 'tile.openstreetmap.de', url: 'https://tile.openstreetmap.de/{z}/{x}/{y}.png' },
    {
        host: 'tile.openstreetmap.fr', url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        credit: 'Tiles by <a href="https://www.hotosm.org/">HOT</a>, hosted by <a href="https://openstreetmap.fr/">OSM France</a>'
    }
];
let tileServer = 0;
const baseMap = L.tileLayer(tileServers[0].url, {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
baseMap.on('tileerror', ({ tile }) => {
    // Errors still arriving from a server already given up on don't count against the next one
    if (tileServer === tileServers.length - 1 || !tile.src.includes(tileServers[tileServer].host)) return;
    const next = tileServers[++tileServer];
    if (next.credit) map.attributionControl.addAttribution(next.credit);
    baseMap.setUrl(next.url);
});

// Leaflet only fetches tiles for the size it last measured. Measure again whenever the map's box changes
// (fonts loading, the phone's address bar sliding away, coming back from another tab), but not while hidden
new ResizeObserver(([entry]) => {
    if (entry.contentRect.width && entry.contentRect.height) map.invalidateSize();
}).observe(document.getElementById('hanoi-map'));

// When the page opens the pins drop onto the map one by one, in the order the places were first visited,
// and the hearts land last. Each pin keeps the drop class only until its animation has played once.
const firstVisit = place => place.visits.map(v => v.date).filter(Boolean).sort()[0] || '9999';
const dropOrder = [...mapPlaces].sort((a, b) => firstVisit(a).localeCompare(firstVisit(b)));
const DROP_START = 350;
const DROP_STEP = Math.min(45, 1400 / Math.max(dropOrder.length, 1));
const dropDelay = i => Math.round(DROP_START + i * DROP_STEP);
document.getElementById('hanoi-map').addEventListener('animationend', e => {
    if (e.animationName === 'pinDrop') e.target.classList.remove('pin-drop');
});

mapPlaces.forEach(place => {
    // The pin is a 25px square turned 45°: its tip is 12.5px from the left and 30px from the top
    const icon = L.divIcon({
        html: `<div class="pin-drop" style="animation-delay:${dropDelay(dropOrder.indexOf(place))}ms"><div class="custom-pin"><div class="custom-pin-inner">${place.icon}</div></div></div>`,
        className: '', iconSize: [25, 25], iconAnchor: [12.5, 30], popupAnchor: [0, -36]
    });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
    marker.on('click', () => openMapPopup(place));
    marker.bindTooltip(`<b>${place.name}</b>`, { direction: 'top', offset: [0, -36] });
});

heartPlaces.forEach((place, i) => {
    const icon = L.divIcon({
        html: `<div class="pin-drop" style="animation-delay:${dropDelay(dropOrder.length + 3 + i * 4)}ms"><div class="heart-pin"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="44" viewBox="0 0 48 44"><path d="M24 40 C24 40 4 26 4 14 C4 7.4 9.4 2 16 2 C19.8 2 23.2 3.8 24 6 C24.8 3.8 28.2 2 32 2 C38.6 2 44 7.4 44 14 C44 26 24 40 24 40Z" fill="#e8455a" stroke="#fff" stroke-width="2.5"/></svg></div></div>`,
        className: '', iconSize: [25, 25], iconAnchor: [24, 40], popupAnchor: [0, -44]
    });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
    marker.bindTooltip(`<b>💕 ${place.name}</b>`, { direction: 'top', offset: [0, -42] });
});

// ===== POPUP =====
// Remember where the last tap or click was, so the popup can grow out of the pin, card or day that opened it
let lastPointer = null;
document.addEventListener('pointerdown', e => { lastPointer = { x: e.clientX, y: e.clientY, time: performance.now() }; }, true);

function growPopupFromPointer() {
    const box = document.querySelector('.map-popup-box');
    const recent = lastPointer && performance.now() - lastPointer.time < 1000;
    // offsetLeft/Top ignore the opening animation's scale, so the origin lands on the tap itself
    box.style.transformOrigin = recent ? `${lastPointer.x - box.offsetLeft}px ${lastPointer.y - box.offsetTop}px` : '';
    box.style.setProperty('--pop-from', recent ? '0.3' : '0.82');
}

function openMapPopup(place, startVisitIdx = 0) {
    const overlay = document.getElementById('mapPopup');
    const opening = !overlay.classList.contains('open');
    document.getElementById('mapPopupIcon').textContent = place.icon;
    document.getElementById('mapPopupName').textContent = place.name;
    document.getElementById('mapPopupDesc').textContent = place.desc;
    overlay.classList.add('open');
    renderVisitTabs(place, startVisitIdx);
    if (opening) growPopupFromPointer();
}

function renderVisitTabs(place, activeIdx) {
    const body = document.getElementById('mapPopupBody');
    body.innerHTML = '';

    if (place.visits.length === 0) {
        body.innerHTML = `<div class="visit-empty-state"><div class="empty-icon">🗓️</div><div>No visits yet</div></div>`;
        return;
    }

    const tabBar = document.createElement('div');
    tabBar.className = 'visit-tab-bar';
    place.visits.forEach((visit, i) => {
        const tab = document.createElement('button');
        tab.className = 'visit-tab' + (i === activeIdx ? ' active' : '');
        const dateLabel = visit.date
            ? new Date(visit.date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'Visit ' + (i + 1);
        tab.textContent = 'Visit ' + (i + 1) + ' · ' + dateLabel;
        tab.onclick = () => renderVisitTabs(place, i);
        tabBar.appendChild(tab);
    });
    body.appendChild(tabBar);
    // On phones the tabs scroll sideways: bring the open visit into view
    tabBar.scrollLeft = tabBar.children[activeIdx].offsetLeft - tabBar.offsetLeft;

    const visit = place.visits[activeIdx];
    const realPhotos = visit ? (visit.photos || []).filter(p => p?.src) : [];
    const realVideos = visit ? (visit.videos || []).filter(v => v?.src) : [];

    if (realPhotos.length === 0 && realVideos.length === 0) {
        body.insertAdjacentHTML('beforeend', `<div class="visit-empty-state"><div class="empty-icon">📷</div><div>No photos for this visit yet</div></div>`);
        return;
    }

    // Photos: small copies in the grid, the full-size photo opens in the viewer
    if (realPhotos.length > 0) {
        const photoLabel = document.createElement('div');
        photoLabel.className = 'media-section-label';
        photoLabel.innerHTML = '📷 Photos';
        body.appendChild(photoLabel);

        const photoGrid = document.createElement('div');
        photoGrid.className = 'map-photo-grid';
        realPhotos.forEach(photo => {
            const item = document.createElement('div');
            item.className = 'map-photo-item';
            const img = document.createElement('img');
            img.src = thumbSrc(photo.src); img.alt = photo.caption || place.name; img.loading = 'lazy';
            img.onclick = () => openPhotoViewer(photo.src, img);
            item.appendChild(img);
            photoGrid.appendChild(item);
        });
        body.appendChild(photoGrid);
    }

    // Videos
    if (realVideos.length > 0) {
        const videoLabel = document.createElement('div');
        videoLabel.className = 'media-section-label';
        videoLabel.innerHTML = '🎬 Videos';
        body.appendChild(videoLabel);

        const videoGrid = document.createElement('div');
        videoGrid.className = 'map-video-grid';
        realVideos.forEach(vid => {
            const item = document.createElement('div');
            item.className = 'map-video-item';
            const video = document.createElement('video');
            video.src = vid.src;
            video.controls = true;
            video.preload = 'metadata';
            video.setAttribute('playsinline', '');
            if (vid.caption) video.title = vid.caption;
            item.appendChild(video);
            videoGrid.appendChild(item);
        });
        body.appendChild(videoGrid);
    }
}

function closeMapPopup() {
    document.querySelectorAll('#mapPopupBody video').forEach(v => v.pause());
    document.getElementById('mapPopup').classList.remove('open');
}

// A calendar day with several check-ins: list them, tap one to see its photos
function openDayPopup(entries) {
    const first = entries[0];
    const date = first.place.visits[first.visitIdx].date;
    document.getElementById('mapPopupIcon').textContent = '📅';
    document.getElementById('mapPopupName').textContent = new Date(date + 'T00:00:00')
        .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('mapPopupDesc').textContent = entries.length + ' check-ins';

    const list = document.createElement('div');
    list.className = 'day-entry-list';
    entries.forEach(({ place, visitIdx }) => {
        const photo = (place.visits[visitIdx].photos || []).find(p => p?.src);
        const btn = document.createElement('button');
        btn.className = 'day-entry';
        if (photo) {
            const img = document.createElement('img');
            img.src = thumbSrc(photo.src); img.alt = ''; img.loading = 'lazy';
            btn.appendChild(img);
        } else {
            const noImg = document.createElement('span');
            noImg.className = 'day-entry-noimg';
            noImg.textContent = '📍';
            btn.appendChild(noImg);
        }
        const name = document.createElement('span');
        name.textContent = place.name;
        btn.appendChild(name);
        btn.addEventListener('click', () => openMapPopup(place, visitIdx));
        list.appendChild(btn);
    });

    const body = document.getElementById('mapPopupBody');
    body.innerHTML = '';
    body.appendChild(list);
    document.getElementById('mapPopup').classList.add('open');
    growPopupFromPointer();
}

// ===== PHOTO VIEWER =====
// The photo grows out of the small copy that was tapped. The small copy (already loaded) stands in
// at full size first, and the full-size photo replaces it as soon as it has loaded.
let viewerSrc = null;

function openPhotoViewer(src, fromImg) {
    const viewer = document.getElementById('mapViewer');
    const img = document.getElementById('mapViewerImg');
    viewer.getAnimations().forEach(a => a.cancel()); // a closing fade that is still running
    viewerSrc = src;
    if (fromImg?.naturalWidth) {
        img.style.setProperty('--ar', fromImg.naturalWidth / fromImg.naturalHeight);
        img.classList.add('sized');
        img.src = fromImg.currentSrc || fromImg.src;
        const full = new Image();
        full.src = src;
        full.decode().catch(() => {}).then(() => { if (viewerSrc === src) img.src = src; });
    } else {
        img.classList.remove('sized');
        img.src = src;
    }
    viewer.classList.add('open');
    if (fromImg?.naturalWidth) zoomFromThumb(img, fromImg.closest('.map-photo-item') || fromImg);
}

function zoomFromThumb(img, thumb) {
    const a = thumb.getBoundingClientRect();
    const b = img.getBoundingClientRect();
    if (!a.width || !b.width) return;
    // Start scaled down until it covers the thumbnail, cropped to the thumbnail's square
    const scale = Math.max(a.width / b.width, a.height / b.height);
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const insetX = (b.width - a.width / scale) / 2;
    const insetY = (b.height - a.height / scale) / 2;
    img.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, clipPath: `inset(${insetY}px ${insetX}px round ${12 / scale}px)` },
        { transform: 'none', clipPath: 'inset(0px 0px round 12px)' }
    ], { duration: 420, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    document.getElementById('mapViewer').animate(
        [{ backgroundColor: 'rgba(10, 5, 4, 0)' }, { backgroundColor: 'rgba(10, 5, 4, 0.96)' }],
        { duration: 320 });
}

function closePhotoViewer() {
    const viewer = document.getElementById('mapViewer');
    viewerSrc = null;
    const fade = viewer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    fade.finished.then(() => {
        viewer.classList.remove('open');
        fade.cancel();
    }).catch(() => {}); // cancelled because a photo was opened again
}

document.getElementById('mapPopup').addEventListener('click', function (e) { if (e.target === this) closeMapPopup(); });
document.getElementById('mapViewer').addEventListener('click', function (e) { if (e.target === this) closePhotoViewer(); });

// Esc closes the photo viewer first, then the popup
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('mapViewer').classList.contains('open')) closePhotoViewer();
    else if (document.getElementById('mapPopup').classList.contains('open')) closeMapPopup();
});

// ===== SPECIAL DAYS =====
// Every 100 days together, the anniversary and the birthdays get confetti and a short note.
// Open the page with #celebrate at the end of the address to preview it on any day.
function specialDayMessage(now = new Date()) {
    const days = daysTogether(now.getTime());
    if (isBirthday(now.getMonth(), now.getDate())) return 'Happy birthday! 🎂';
    const years = now.getFullYear() - LOVE_START.getFullYear();
    if (years > 0 && now.getMonth() === LOVE_START.getMonth() && now.getDate() === LOVE_START.getDate()) {
        return `Happy anniversary! ${years} year${years > 1 ? 's' : ''} together 💕`;
    }
    if (days > 0 && days % 100 === 0) return `${days} days together! 🎉`;
    return null;
}

// The confetti library is only downloaded on the days it is used
function loadConfetti() {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.browser.js';
        script.integrity = 'sha384-bopE5cbMjKUprmGnIRk2UdvCnHImrRLCtNW2uR6oDYqO+o3XWJeuIrWWxDzeDgNW';
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve(window.confetti);
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function celebrate(message) {
    const note = document.createElement('div');
    note.className = 'celebrate-note';
    note.setAttribute('role', 'status');
    note.textContent = message;
    document.body.appendChild(note);
    setTimeout(() => note.classList.add('hide'), 5000);
    note.addEventListener('transitionend', () => note.remove());

    loadConfetti().then(confetti => {
        const colors = ['#196ea0', '#85b2d7', '#e8455a', '#f5c0a8', '#ffd166'];
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.35 }, colors });
        setTimeout(() => {
            confetti({ particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.65 }, colors });
            confetti({ particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.65 }, colors });
        }, 400);
    }).catch(() => {});
}

const todaysMessage = location.hash === '#celebrate'
    ? specialDayMessage() || 'Preview: 300 days together! 🎉'
    : specialDayMessage();
if (todaysMessage) whenPageShown(() => setTimeout(() => celebrate(todaysMessage), 1600));