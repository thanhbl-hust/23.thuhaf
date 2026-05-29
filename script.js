// ===== LOVE COUNTER =====
const LOVE_START = new Date('2026-02-06T00:00:00');
function pad2(n) { return String(n).padStart(2, '0'); }
function loveTick() {
    const diff = Date.now() - LOVE_START.getTime();
    if (diff < 0) return;
    const days = Math.floor(diff / 86400000);
    const rem = diff % 86400000;
    document.getElementById('lcDays').textContent = days.toLocaleString('vi-VN');
    document.getElementById('lcH').textContent = pad2(Math.floor(rem / 3600000));
    document.getElementById('lcM').textContent = pad2(Math.floor((rem % 3600000) / 60000));
    document.getElementById('lcS').textContent = pad2(Math.floor((rem % 60000) / 1000));
}
loveTick();
setInterval(loveTick, 1000);

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
function switchView(view) {
    ['map', 'list', 'cal'].forEach(k => {
        const key = k.charAt(0).toUpperCase() + k.slice(1);
        document.getElementById('panel' + key).classList.toggle('active', k === view);
        document.getElementById('btn' + key).classList.toggle('active', k === view);
    });
    if (view === 'map') setTimeout(() => map.invalidateSize(), 50);
    if (view === 'cal') renderCalendar();
}

// ===== CHECK-IN LIST =====
function buildCheckinList() {
    const list = document.getElementById('checkinList');
    list.innerHTML = '';
    const sorted = getSortedPlaces();
    if (sorted.length === 0) {
        list.innerHTML = `<div class="checkin-empty"><div class="empty-icon">📍</div><div>No check-ins yet!</div></div>`;
        return;
    }
    sorted.forEach(place => {
        const totalPhotos = place.visits.reduce((s, v) => s + (v.photos || []).filter(p => p?.src).length, 0);
        const totalVideos = place.visits.reduce((s, v) => s + (v.videos || []).filter(x => x?.src).length, 0);
        const visitCount = place.visits.length;
        const item = document.createElement('div');
        item.className = 'checkin-item';
        item.innerHTML = `
                    <div class="checkin-item-heart">💕</div>
                    <div class="checkin-item-info">
                        <div class="checkin-item-name">${place.name}</div>
                        <div class="checkin-item-desc">${place.desc}</div>
                    </div>
                    <div class="checkin-item-right">
                        <div class="checkin-photo-count">📷 ${totalPhotos} photo${totalPhotos !== 1 ? 's' : ''}</div>
                        ${totalVideos > 0 ? `<div class="checkin-video-count">🎬 ${totalVideos} video${totalVideos !== 1 ? 's' : ''}</div>` : ''}
                        <div class="checkin-visit-count">🗓 ${visitCount} visit${visitCount !== 1 ? 's' : ''}</div>
                        <div class="checkin-arrow">→</div>
                    </div>`;
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
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

function calShift(delta) {
    calMonth += delta;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
}

function renderCalendar() {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    document.getElementById('calMonthLabel').textContent =
        months[calMonth] + ' ' + calYear;

    const grid = document.getElementById('calDays');
    grid.innerHTML = '';

    const today = new Date();

    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth, 0).getDate();

    let cellsRendered = 0;

    // ===== PREVIOUS MONTH =====
    for (let i = firstDay - 1; i >= 0; i--) {
        appendDay(
            grid,
            daysInPrev - i,
            true,
            null,
            null,
            null,
            null
        );
        cellsRendered++;
    }

    // ===== CURRENT MONTH =====
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday =
            d === today.getDate() &&
            calMonth === today.getMonth() &&
            calYear === today.getFullYear();

        const dateStr =
            `${calYear}-${pad2(calMonth + 1)}-${pad2(d)}`;

        appendDay(
            grid,
            d,
            false,
            isToday,
            dateVisitMap[dateStr] || null,
            calMonth,
            d
        );

        cellsRendered++;
    }

    // ===== NEXT MONTH =====
    // Always fill to 42 cells (6 rows × 7 days)
    let nextDay = 1;

    while (cellsRendered < 42) {
        appendDay(
            grid,
            nextDay++,
            true,
            null,
            null,
            null,
            null
        );

        cellsRendered++;
    }
}

function appendDay(grid, dayNum, otherMonth, isToday, entries, month0, day) {
    const birthday = !otherMonth && month0 != null && isBirthday(month0, day);

    const cell = document.createElement('div');
    cell.className = 'cal-day' +
        (otherMonth ? ' other-month' : '') +
        (isToday ? ' today' : '') +
        (entries ? ' has-visit' : '') +
        (birthday ? ' is-birthday' : '');

    // Date number row — cake sits next to number if there are entries
    const numRow = document.createElement('div');
    numRow.style.cssText = 'display:flex;align-items:center;gap:3px;';

    const numEl = document.createElement('div');
    numEl.className = 'cal-day-num';
    numEl.textContent = dayNum;
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
        entries.slice(0, 1).forEach(({ place, visitIdx }) => {
            const visit = place.visits[visitIdx];
            const firstPhoto = (visit.photos || []).find(p => p?.src);
            if (firstPhoto) {
                const thumb = document.createElement('div');
                thumb.className = 'cal-day-thumb';
                const img = document.createElement('img');
                img.src = firstPhoto.src; img.alt = place.name; img.loading = 'lazy';
                thumb.appendChild(img);
                wrap.appendChild(thumb);
            } else {
                const pill = document.createElement('div');
                pill.className = 'cal-day-place-pill';
                // cake replaces icon in pill slot when birthday + no photo
                pill.textContent = (birthday ? '🎂 ' : place.icon + ' ') + place.name;
                wrap.appendChild(pill);
            }
        });
        if (entries.length > 2) {
            const more = document.createElement('div');
            more.className = 'cal-day-more';
            more.textContent = '+' + (entries.length - 2) + ' more';
            wrap.appendChild(more);
        }
        cell.appendChild(wrap);
        cell.addEventListener('click', () => {
            const { place, visitIdx } = entries[0];
            openMapPopup(place, visitIdx);
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

// Init calendar to latest data month
(function () {
    const dates = Object.keys(dateVisitMap).sort();
    if (dates.length > 0) {
        const d = new Date(dates[dates.length - 1] + 'T00:00:00');
        calYear = d.getFullYear();
        calMonth = d.getMonth();
    }
})();

// ===== HANOI MAP =====
// lat: 21.034281533880666,
// lng: 105.81246668161833,
const map = L.map('hanoi-map', { center: [21.034281533880666, 105.81246668161833], zoom: 13 });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
setTimeout(() => map.invalidateSize(), 300);

mapPlaces.forEach(place => {
    const icon = L.divIcon({
        html: `<div class="custom-pin"><div class="custom-pin-inner">${place.icon}</div></div>`,
        className: '', iconSize: [38, 38], iconAnchor: [19, 38], popupAnchor: [0, -42]
    });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
    marker.on('click', () => openMapPopup(place));
    marker.bindTooltip(`<b>${place.name}</b>`, { direction: 'top', offset: [0, -42] });
});

heartPlaces.forEach(place => {
    const icon = L.divIcon({
        html: `<div class="heart-pin"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="44" viewBox="0 0 48 44"><path d="M24 40 C24 40 4 26 4 14 C4 7.4 9.4 2 16 2 C19.8 2 23.2 3.8 24 6 C24.8 3.8 28.2 2 32 2 C38.6 2 44 7.4 44 14 C44 26 24 40 24 40Z" fill="#e8455a" stroke="#fff" stroke-width="2.5"/></svg></div>`,
        className: '', iconSize: [48, 44], iconAnchor: [24, 40], popupAnchor: [0, -44]
    });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
    marker.bindTooltip(`<b>💕 ${place.name}</b>`, { direction: 'top', offset: [0, -28] });
});

// ===== POPUP =====
function openMapPopup(place, startVisitIdx = 0) {
    document.getElementById('mapPopupIcon').textContent = place.icon;
    document.getElementById('mapPopupName').textContent = place.name;
    document.getElementById('mapPopupDesc').textContent = place.desc;
    document.getElementById('mapPopup').classList.add('open');
    renderVisitTabs(place, startVisitIdx);
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

    const visit = place.visits[activeIdx];
    const realPhotos = visit ? (visit.photos || []).filter(p => p?.src) : [];
    const realVideos = visit ? (visit.videos || []).filter(v => v?.src) : [];

    // Photos
    const photoLabel = document.createElement('div');
    photoLabel.className = 'media-section-label';
    photoLabel.innerHTML = '📷 Photos';
    body.appendChild(photoLabel);

    const photoGrid = document.createElement('div');
    photoGrid.className = 'map-photo-grid';
    if (realPhotos.length > 0) {
        realPhotos.forEach(photo => {
            const item = document.createElement('div');
            item.className = 'map-photo-item';
            const img = document.createElement('img');
            img.src = photo.src; img.alt = photo.caption || place.name; img.loading = 'lazy';
            img.onclick = () => {
                document.getElementById('mapViewerImg').src = photo.src;
                document.getElementById('mapViewer').classList.add('open');
            };
            item.appendChild(img);
            photoGrid.appendChild(item);
        });
    } else {
        const ph = document.createElement('div');
        ph.className = 'map-photo-item';
        ph.innerHTML = `<div class="map-photo-placeholder"><div class="ph-icon">📷</div><div>No photos yet</div><code>images/yourphoto.jpg</code></div>`;
        photoGrid.appendChild(ph);
    }
    body.appendChild(photoGrid);

    // Videos
    const videoLabel = document.createElement('div');
    videoLabel.className = 'media-section-label';
    videoLabel.innerHTML = '🎬 Videos';
    body.appendChild(videoLabel);

    const videoGrid = document.createElement('div');
    videoGrid.className = 'map-video-grid';
    if (realVideos.length > 0) {
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
    } else {
        const ph = document.createElement('div');
        ph.className = 'map-video-item';
        ph.style.cssText = 'background:var(--soft);border-radius:12px;padding:24px;text-align:center;';
        ph.innerHTML = `<div style="font-size:2rem;margin-bottom:8px;">🎬</div><div style="font-size:0.78rem;color:var(--muted);">No videos yet</div><code style="background:#f3e8e0;padding:2px 7px;border-radius:5px;font-size:0.72rem;color:var(--accent);">videos/yourvideo.mp4</code>`;
        videoGrid.appendChild(ph);
    }
    body.appendChild(videoGrid);
}

function closeMapPopup() {
    document.querySelectorAll('#mapPopupBody video').forEach(v => v.pause());
    document.getElementById('mapPopup').classList.remove('open');
}

document.getElementById('mapPopup').addEventListener('click', function (e) { if (e.target === this) closeMapPopup(); });
document.getElementById('mapViewer').addEventListener('click', function (e) { if (e.target === this) this.classList.remove('open'); });