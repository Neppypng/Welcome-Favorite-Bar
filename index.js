// Welcome Favorites — a row of your favorite characters and groups on SillyTavern's welcome screen.
// The row is placed *inside* the "Recent Chats" title element, so no elements of the welcome
// panel are added, removed or reordered — themes that style the panel's layout keep working.
(function () {
    const MODULE = 'welcomeFavorites';

    const ONOFF = [['on', 'Enabled'], ['off', 'Disabled']];
    const SHAPES = [
        ['card', 'Card'],
        ['square', 'Rounded square'],
        ['circle', 'Circle'],
        ['hexagon', 'Hexagon'],
    ];

    // Settings panel layout + defaults. Every setting is a dropdown.
    const SPEC = [
        { section: 'General' },
        { key: 'enabled', label: 'Favorites bar', onoff: true, def: true },
        { key: 'live', label: 'Live updates', onoff: true, def: true },
        { key: 'groups', label: 'Include group chats', onoff: true, def: true },

        { section: 'Display' },
        { key: 'shape', label: 'Icon shape', options: SHAPES, def: 'card' },
        { key: 'size', label: 'Icon size', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], def: 'medium' },
        {
            key: 'sort', label: 'Sort by', def: 'favorites', options: [
                ['favorites', 'Off (favorited order)'],
                ['az', 'Name (A\u2013Z)'],
                ['za', 'Name (Z\u2013A)'],
                ['recent', 'Recently chatted'],
                ['messages', 'Most messages'],
            ],
        },
        { key: 'names', label: 'Show names', onoff: true, def: true },
        { key: 'counts', label: 'Show chat counts', onoff: true, def: true },
        { key: 'messages', label: 'Show message count', onoff: true, def: true },
        { key: 'lastChat', label: 'Show last chatted', onoff: true, def: false },

        { section: 'Heartbeat' },
        { key: 'heartbeat', label: 'Heartbeat glow', onoff: true, def: false },
        { key: 'beatSpeed', label: 'Speed', options: [['slow', 'Slow'], ['steady', 'Steady'], ['racing', 'Racing']], def: 'steady' },
        { key: 'beatStrength', label: 'Intensity', options: [['soft', 'Soft'], ['medium', 'Medium'], ['strong', 'Strong']], def: 'medium' },

        { section: 'Behavior' },
        { key: 'tap', label: 'Tap to open', options: [['last', 'Last chat'], ['new', 'New chat']], def: 'last' },
        { key: 'longPress', label: 'Long-press menu', onoff: true, def: true },
    ];

    const SIZES = { small: 0.8, medium: 1, large: 1.22 };
    const BEAT_SPEED = { slow: '2.6s', steady: '1.8s', racing: '0.9s' };
    const BEAT_STRENGTH = {
        soft: { rest: '1px', peak: '5px' },
        medium: { rest: '2px', peak: '9px' },
        strong: { rest: '3px', peak: '14px' },
    };

    const ctx = () => SillyTavern.getContext();
    const isFav = (x) => x && (x.fav === true || x.fav === 'true');
    const thumb = (file) => `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    // ---------- Settings ----------
    function getSettings() {
        const c = ctx();
        const store = c.extensionSettings || (window.__wfSettings ??= {});
        const s = (store[MODULE] ??= {});
        if (s.sort === 'chats') s.sort = 'messages'; // older setting name
        for (const item of SPEC) {
            if (!item.key) continue;
            if (item.onoff) {
                if (typeof s[item.key] !== 'boolean') s[item.key] = item.def;
            } else if (!item.options.some(([v]) => v === s[item.key])) {
                s[item.key] = item.def;
            }
        }
        return s;
    }
    const saveSettings = () => ctx().saveSettingsDebounced?.();

    // ---------- Helpers ----------
    function timeAgo(ts) {
        const t = Number(ts);
        if (!t) return '';
        const s = (Date.now() - t) / 1000;
        if (s < 60) return 'just now';
        const m = s / 60;
        if (m < 60) return `${Math.floor(m)}m ago`;
        const h = m / 60;
        if (h < 24) return `${Math.floor(h)}h ago`;
        const d = h / 24;
        if (d < 7) return `${Math.floor(d)}d ago`;
        if (d < 35) return `${Math.floor(d / 7)}w ago`;
        if (d < 365) return `${Math.floor(d / 30)}mo ago`;
        return `${Math.floor(d / 365)}y ago`;
    }

    // Chat stats: how many chats, and how many messages are in the chat the bot is currently on.
    // Characters: one small listing request each. Groups: one small info request. Both cached.
    const statsCache = new Map(); // key -> { chats, messages, stamp }
    const stamp = (item) => `${item.last}|${item.chatFile ?? item.chatId ?? ''}`;
    function cachedStats(item) {
        const hit = statsCache.get(item.key);
        const s = hit && hit.stamp === stamp(item) ? hit : {};
        return {
            chats: item.type === 'group' ? item.groupChats : s.chats,
            messages: s.messages,
            loaded: Boolean(hit && hit.stamp === stamp(item)),
        };
    }
    async function fetchStats(item) {
        if (cachedStats(item).loaded) return;
        const headers = ctx().getRequestHeaders();
        const entry = { chats: undefined, messages: undefined, stamp: stamp(item) };
        try {
            if (item.type === 'char') {
                const res = await fetch('/api/characters/chats', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ avatar_url: item.avatar }),
                });
                if (res.ok) {
                    let data = await res.json();
                    if (!Array.isArray(data)) data = data && !data.error ? Object.values(data) : [];
                    entry.chats = data.length;
                    const current = data.find((c) => String(c.file_name).replace(/\.jsonl$/, '') === item.chatFile);
                    if (current && typeof current.chat_items === 'number') entry.messages = current.chat_items;
                }
            } else if (item.chatId) {
                const res = await fetch('/api/chats/group/info', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ id: item.chatId }),
                });
                if (res.ok) {
                    const info = await res.json();
                    if (typeof info?.chat_items === 'number') entry.messages = info.chat_items;
                }
            }
        } catch {
            /* leave unknown */
        }
        statsCache.set(item.key, entry);
    }

    // ---------- Data ----------
    function getItems(settings) {
        const c = ctx();
        const items = [];
        (c.characters || []).forEach((ch, i) => {
            if (!isFav(ch)) return;
            items.push({
                type: 'char',
                key: `c:${ch.avatar}`,
                index: i,
                name: ch.name,
                avatar: ch.avatar,
                chatFile: ch.chat,
                last: Number(ch.date_last_chat) || 0,
            });
        });
        if (settings.groups) {
            (c.groups || []).forEach((g) => {
                if (!isFav(g)) return;
                items.push({
                    type: 'group',
                    key: `g:${g.id}`,
                    id: g.id,
                    chatId: g.chat_id,
                    name: g.name,
                    groupAvatar: g.avatar_url,
                    members: (g.members || []).slice(0, 4),
                    groupChats: Array.isArray(g.chats) ? g.chats.length : undefined,
                    last: Number(g.date_last_chat) || 0,
                });
            });
        }

        const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        switch (settings.sort) {
            case 'az': items.sort(byName); break;
            case 'za': items.sort((a, b) => byName(b, a)); break;
            case 'recent': items.sort((a, b) => b.last - a.last); break;
            case 'messages': items.sort((a, b) => (cachedStats(b).messages ?? -1) - (cachedStats(a).messages ?? -1)); break;
        }
        return items;
    }

    // Fingerprint of everything shown; when it changes, the row is rebuilt (live updates).
    const signature = (items) => items.map((x) => `${x.key}|${x.name}|${stamp(x)}|${x.groupChats ?? ''}|${x.groupAvatar ?? ''}`).join('\n');

    // ---------- Opening chats ----------
    async function openItem(item, mode) {
        const c = ctx();
        if (item.type === 'char') {
            await c.selectCharacterById(String(item.index));
        } else if (item.chatId) {
            await c.openGroupChat(item.id, item.chatId);
        } else {
            return;
        }
        if (mode === 'new') {
            await delay(500);
            document.getElementById('option_start_new_chat')?.click(); // SillyTavern's own "Start new chat"
        }
    }

    async function openCard(item) {
        await ctx().selectCharacterById(String(item.index));
        const panel = document.getElementById('right-nav-panel');
        if (panel && !panel.classList.contains('openDrawer')) {
            document.getElementById('rightNavDrawerIcon')?.click();
        }
    }

    async function confirmAction(text) {
        const c = ctx();
        if (c.callGenericPopup && c.POPUP_TYPE) {
            return Boolean(await c.callGenericPopup(text, c.POPUP_TYPE.CONFIRM));
        }
        return window.confirm(text);
    }

    async function unfavorite(item) {
        if (!(await confirmAction(`Remove ${item.name} from favorites?`))) return;
        const c = ctx();
        try {
            if (item.type === 'char') {
                const ch = c.characters[item.index];
                await fetch('/api/characters/merge-attributes', {
                    method: 'POST',
                    headers: c.getRequestHeaders(),
                    body: JSON.stringify({ avatar: item.avatar, fav: false, data: { extensions: { fav: false } } }),
                });
                if (ch) ch.fav = false;
                await c.getCharacters?.();
            } else {
                const g = (c.groups || []).find((x) => x.id === item.id);
                if (g) {
                    g.fav = false;
                    await fetch('/api/groups/edit', {
                        method: 'POST',
                        headers: c.getRequestHeaders(),
                        body: JSON.stringify(g),
                    });
                }
            }
        } catch (e) {
            console.error('[Welcome Favorites] Could not unfavorite', e);
        }
        rebuild();
    }

    // ---------- Long-press menu ----------
    function closeMenu() {
        document.querySelectorAll('.wf-menu').forEach((m) => m.remove());
    }

    function openMenu(item, card) {
        closeMenu();
        const menu = document.createElement('div');
        menu.className = 'wf-menu';

        const title = document.createElement('div');
        title.className = 'wf-menu-title';
        title.textContent = item.name;
        menu.append(title);

        const add = (icon, label, fn) => {
            const b = document.createElement('button');
            b.className = 'wf-menu-item';
            b.innerHTML = `<i class="fa-solid ${icon} fa-fw"></i>`;
            const span = document.createElement('span');
            span.textContent = label;
            b.append(span);
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                closeMenu();
                fn();
            });
            menu.append(b);
        };
        add('fa-comments', 'Open last chat', () => openItem(item, 'last'));
        add('fa-comment-medical', 'Start new chat', () => openItem(item, 'new'));
        if (item.type === 'char') add('fa-id-card', 'Open character card', () => openCard(item));
        add('fa-star-half-stroke', 'Remove from favorites', () => unfavorite(item));

        document.body.append(menu);
        const r = card.getBoundingClientRect();
        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;
        let left = r.left + r.width / 2 - mw / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
        let top = r.bottom + 6;
        if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        const cleanup = () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('keydown', onKey);
        };
        const outside = (e) => {
            if (!menu.contains(e.target)) {
                closeMenu();
                cleanup();
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                closeMenu();
                cleanup();
            }
        };
        setTimeout(() => {
            document.addEventListener('pointerdown', outside, true);
            document.addEventListener('keydown', onKey);
        }, 0);
    }

    // ---------- Build ----------
    function findRecentHeading(chat) {
        return (
            chat.querySelector('.welcomePanel .recentChatsTitle') ||
            [...chat.querySelectorAll('*')].find(
                (el) => el.children.length === 0 && el.textContent.trim() === 'Recent Chats',
            )
        );
    }

    function infoText(item, settings) {
        const st = cachedStats(item);
        const parts = [];
        if (settings.counts && st.chats !== undefined) parts.push(`${st.chats} chat${st.chats === 1 ? '' : 's'}`);
        if (settings.messages && st.messages !== undefined) parts.push(`${st.messages} msg${st.messages === 1 ? '' : 's'}`);
        if (settings.lastChat && item.last) parts.push(timeAgo(item.last));
        return parts.join(' \u00B7 ');
    }

    function makeMedia(item) {
        if (item.type === 'char' || item.groupAvatar) {
            const img = document.createElement('img');
            img.className = 'wf-media';
            img.src = item.type === 'char' ? thumb(item.avatar) : item.groupAvatar;
            img.alt = item.name;
            img.loading = 'lazy';
            img.draggable = false;
            return img;
        }
        // Group without its own picture: collage of up to 4 members
        const collage = document.createElement('div');
        collage.className = `wf-media wf-collage wf-collage-${Math.max(1, item.members.length)}`;
        for (const m of item.members) {
            const img = document.createElement('img');
            img.src = thumb(m);
            img.alt = '';
            img.loading = 'lazy';
            img.draggable = false;
            collage.append(img);
        }
        return collage;
    }

    function makeCard(item, settings) {
        const card = document.createElement('button');
        card.className = `wf-card${item.type === 'group' ? ' wf-group' : ''}`;
        card.title = item.name;
        card.dataset.key = item.key;

        const frame = document.createElement('div');
        frame.className = 'wf-frame';
        frame.append(makeMedia(item));
        if (item.type === 'group') {
            const badge = document.createElement('span');
            badge.className = 'wf-badge';
            badge.title = 'Group chat';
            badge.innerHTML = '<i class="fa-solid fa-users"></i>';
            frame.append(badge);
        }
        card.append(frame);

        if (settings.names) {
            const name = document.createElement('span');
            name.className = 'wf-name';
            name.textContent = item.name;
            card.append(name);
        }
        if (settings.counts || settings.messages || settings.lastChat) {
            const info = document.createElement('span');
            info.className = 'wf-info';
            info.textContent = infoText(item, settings);
            card.append(info);
        }

        // Tap vs. long-press
        let timer = null;
        let longPressed = false;
        let startX = 0;
        let startY = 0;
        card.addEventListener('pointerdown', (e) => {
            longPressed = false;
            if (!settings.longPress) return;
            startX = e.clientX;
            startY = e.clientY;
            timer = setTimeout(() => {
                longPressed = true;
                navigator.vibrate?.(15); // small buzz on phones that support it
                openMenu(item, card);
            }, 550);
        });
        card.addEventListener('pointermove', (e) => {
            if (timer && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) {
                clearTimeout(timer);
                timer = null;
            }
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
            card.addEventListener(ev, () => {
                clearTimeout(timer);
                timer = null;
            }),
        );
        card.addEventListener('contextmenu', (e) => {
            if (!settings.longPress) return;
            e.preventDefault();
            // On phones a long-press also fires this; the timer above already opened the menu.
            if (longPressed && document.querySelector('.wf-menu')) return;
            longPressed = true;
            openMenu(item, card);
        });
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            if (longPressed) {
                longPressed = false;
                return;
            }
            openItem(item, settings.tap);
        });
        return card;
    }

    function build() {
        const chat = document.getElementById('chat');
        if (!chat || chat.querySelector('.wf-wrap')) return;

        const settings = getSettings();
        if (!settings.enabled) return;

        const heading = findRecentHeading(chat);
        if (!heading) return; // welcome screen not showing

        const items = getItems(settings);
        if (!items.length) return;

        const wrap = document.createElement('div');
        wrap.className = `wf-wrap wf-shape-${settings.shape}`;
        wrap.classList.toggle('wf-heartbeat', settings.heartbeat);
        wrap.dataset.sig = signature(items);
        wrap._wfCleanup = [];
        const beat = BEAT_STRENGTH[settings.beatStrength];
        wrap.style.setProperty('--wf-s', SIZES[settings.size]);
        wrap.style.setProperty('--wf-beat-dur', BEAT_SPEED[settings.beatSpeed]);
        wrap.style.setProperty('--wf-beat-rest', beat.rest);
        wrap.style.setProperty('--wf-beat-peak', beat.peak);

        // ｡ ₊°༺Favorite ❤︎༻°₊ ｡  (written with escapes so it survives any file encoding)
        const title = document.createElement('div');
        title.className = 'wf-title';
        const part = (cls, text) => {
            const span = document.createElement('span');
            span.className = cls;
            span.textContent = text;
            return span;
        };
        title.append(
            part('wf-title-deco', '\uFF61 \u208A\u00B0\u0F3A'),
            part('wf-title-word', 'Favorite '),
            part('wf-title-heart', '\u2764\uFE0E'),
            part('wf-title-deco', '\u0F3B\u00B0\u208A \uFF61'),
        );

        const row = document.createElement('div');
        row.className = 'wf-row';
        for (const item of items) row.append(makeCard(item, settings));

        // Left / right arrows — shown only when the row overflows; they loop around.
        const step = (dir) => {
            const amount = Math.max(row.clientWidth * 0.8, 100);
            const max = row.scrollWidth - row.clientWidth;
            if (dir === 'right' && row.scrollLeft >= max - 2) row.scrollTo({ left: 0, behavior: 'smooth' });
            else if (dir === 'left' && row.scrollLeft <= 2) row.scrollTo({ left: max, behavior: 'smooth' });
            else row.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
        };
        const makeArrow = (dir) => {
            const b = document.createElement('button');
            b.className = `wf-arrow wf-arrow-${dir}`;
            b.title = dir === 'left' ? 'Scroll left' : 'Scroll right';
            b.innerHTML = `<i class="fa-solid fa-chevron-${dir}"></i>`;
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                step(dir);
            });
            return b;
        };

        const scroller = document.createElement('div');
        scroller.className = 'wf-scroller';
        scroller.append(makeArrow('left'), row, makeArrow('right'));

        const refresh = () => {
            scroller.classList.toggle('wf-has-overflow', row.scrollWidth > row.clientWidth + 2);
        };
        const ro = new ResizeObserver(refresh);
        ro.observe(row);
        wrap._wfCleanup.push(() => ro.disconnect());
        row.querySelectorAll('img').forEach((img) => img.addEventListener('load', refresh));


        wrap.append(title, scroller);

        // Nest inside the title: Favorites sits on top, "Recent Chats" text stays right under it.
        heading.prepend(wrap);
        heading.classList.add('wf-center-heading');
        // Lets the CSS push the Docs / GitHub / Discord / Temporary Chat buttons onto their own line.
        heading.parentElement?.classList.add('wf-header-has-favs');

        requestAnimationFrame(refresh);
        loadCounts(wrap, items, settings);
    }

    // Fill in chat / message counts as they arrive; re-sort once if sorting by message count.
    async function loadCounts(wrap, items, settings) {
        if (!settings.counts && !settings.messages && settings.sort !== 'messages') return;
        const missing = items.filter((x) => !cachedStats(x).loaded);
        if (!missing.length) return;
        await Promise.all(missing.map(fetchStats));
        if (!wrap.isConnected) return;
        if (settings.sort === 'messages') return rebuild();
        for (const item of items) {
            const info = wrap.querySelector(`.wf-card[data-key="${CSS.escape(item.key)}"] .wf-info`);
            if (info) info.textContent = infoText(item, settings);
        }
    }

    function teardown() {
        closeMenu();
        document.querySelectorAll('#chat .wf-wrap').forEach((w) => {
            (w._wfCleanup || []).forEach((fn) => fn());
            w.remove();
        });
        document.querySelectorAll('#chat .wf-center-heading').forEach((h) => h.classList.remove('wf-center-heading'));
        document.querySelectorAll('#chat .wf-header-has-favs').forEach((h) => h.classList.remove('wf-header-has-favs'));
    }

    function rebuild() {
        const oldRow = document.querySelector('#chat .wf-row');
        const scrollLeft = oldRow ? oldRow.scrollLeft : 0;
        teardown();
        build();
        const row = document.querySelector('#chat .wf-row');
        if (row) row.scrollLeft = scrollLeft;
    }

    // ---------- Live updates ----------
    function liveCheck() {
        const settings = getSettings();
        if (!settings.enabled || !settings.live) return;
        const chat = document.getElementById('chat');
        if (!chat || !findRecentHeading(chat)) return;
        const wrap = chat.querySelector('.wf-wrap');
        if (!wrap) return build(); // e.g. you just favorited your first bot
        if (wrap.dataset.sig !== signature(getItems(settings))) rebuild();
    }

    function hookEvents() {
        const c = ctx();
        const es = c.eventSource;
        const et = c.eventTypes || c.event_types;
        if (!es || !et) return;
        const soon = () => setTimeout(liveCheck, 300);
        ['CHARACTER_EDITED', 'CHARACTER_DELETED', 'CHARACTER_RENAMED', 'GROUP_UPDATED', 'CHAT_CREATED', 'GROUP_CHAT_CREATED']
            .filter((k) => et[k])
            .forEach((k) => es.on(et[k], soon));
    }

    // ---------- Settings panel in Extensions ----------
    function addSettingsPanel() {
        const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (!host) return setTimeout(addSettingsPanel, 500);
        if (document.getElementById('wf_settings')) return;

        const settings = getSettings();
        const rows = SPEC.map((item) => {
            if (item.section) return `<div class="wf-settings-section">${item.section}</div>`;
            const opts = (item.onoff ? ONOFF : item.options).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
            return `<div class="wf-settings-row">
                        <label for="wf_${item.key}">${item.label}</label>
                        <select id="wf_${item.key}" class="text_pole" data-key="${item.key}">${opts}</select>
                    </div>`;
        }).join('');

        const panel = document.createElement('div');
        panel.id = 'wf_settings';
        panel.className = 'wf-settings';
        panel.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Welcome Favorites</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">${rows}</div>
            </div>`;
        host.append(panel);

        panel.querySelectorAll('select[data-key]').forEach((sel) => {
            const key = sel.dataset.key;
            const item = SPEC.find((x) => x.key === key);
            sel.value = item.onoff ? (settings[key] ? 'on' : 'off') : settings[key];
            sel.addEventListener('change', () => {
                settings[key] = item.onoff ? sel.value === 'on' : sel.value;
                saveSettings();
                syncDisabledRows(panel, settings);
                rebuild();
            });
        });
        syncDisabledRows(panel, settings);
    }

    // Dim the heartbeat speed/intensity rows while the heartbeat is off.
    function syncDisabledRows(panel, settings) {
        ['beatSpeed', 'beatStrength'].forEach((k) => {
            const sel = panel.querySelector(`#wf_${k}`);
            if (sel) {
                sel.disabled = !settings.heartbeat;
                sel.closest('.wf-settings-row')?.classList.toggle('wf-dim', !settings.heartbeat);
            }
        });
    }

    // ---------- Start ----------
    let queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            build();
        });
    }

    function init() {
        const chat = document.getElementById('chat');
        if (!chat) return setTimeout(init, 500);
        new MutationObserver(schedule).observe(chat, { childList: true, subtree: true });
        schedule();
        hookEvents();
        setInterval(liveCheck, 2000);
    }

    init();
    addSettingsPanel();
})();
