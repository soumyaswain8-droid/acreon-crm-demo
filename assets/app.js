/* ===================================================================
   Dwellinn CRM mockup — runtime auth + role gating + modal interactivity
   No innerHTML for user-typed data — uses DOM methods + textContent.
   =================================================================== */

(function () {
  const LS_USER     = 'dwellinn_currentUserId';
  const LS_LEADS    = 'dwellinn_leadOverrides_v2';
  const LS_NEW_LEADS= 'dwellinn_newLeads_v1';

  // ---------- New leads (created via Add Lead modal) ----------
  function getNewLeads() {
    try { return JSON.parse(localStorage.getItem(LS_NEW_LEADS) || '[]'); } catch { return []; }
  }
  function saveNewLead(lead) {
    const all = getNewLeads();
    all.unshift(lead); // newest first
    localStorage.setItem(LS_NEW_LEADS, JSON.stringify(all));
  }
  function nextLeadId() {
    const existing = getNewLeads();
    const startId = 2000;
    return `L-${startId + existing.length}`;
  }
  function getLeadById(id) {
    if (!id) return null;
    // Try mock data first
    const fromMock = (window.MOCK_DATA?.leads || []).find(l => l.id === id);
    if (fromMock) return { ...fromMock, source: { name: fromMock.source, cls: fromMock.sourceCls, icon: fromMock.sourceIcon } };
    // Then check new leads
    const newOne = getNewLeads().find(l => l.id === id);
    return newOne || null;
  }
  function getOwnerName(ownerId) {
    if (!window.MOCK_DATA) return ownerId;
    if (window.MOCK_DATA.owner.id === ownerId) return window.MOCK_DATA.owner.name;
    const e = window.MOCK_DATA.employees.find(x => x.id === ownerId);
    return e ? e.name : ownerId;
  }
  function getOwnerInitials(ownerId) {
    if (window.MOCK_DATA.owner.id === ownerId) return window.MOCK_DATA.owner.initials;
    const e = window.MOCK_DATA.employees.find(x => x.id === ownerId);
    return e ? e.initials : '??';
  }
  function getOwnerColor(ownerId) {
    if (window.MOCK_DATA.owner.id === ownerId) return window.MOCK_DATA.owner.color;
    const e = window.MOCK_DATA.employees.find(x => x.id === ownerId);
    return e ? e.color : 'slate';
  }

  // ---------- CP + clash storage (demo) ----------
  const LS_CP_OVERRIDES = 'dwellinn_cpOverrides_v1';   // { CP-xxxx: { status } }
  const LS_NEW_CPS       = 'dwellinn_newCps_v1';        // [ {id,name,firm,...} ]
  const LS_NEW_PROJECTS  = 'dwellinn_newProjects_v1';   // [ {name,builder,location,...} ]
  const LS_CLASH_OV      = 'dwellinn_clashOverrides_v1';// { CL-xxxx: { status, resolution, resolvedBy } }
  const LS_NOTIFS        = 'dwellinn_notifs_v1';        // [ {title, time, kind} ]

  function getCpOverrides() { try { return JSON.parse(localStorage.getItem(LS_CP_OVERRIDES) || '{}'); } catch { return {}; } }
  function saveCpStatus(id, status) { const o = getCpOverrides(); o[id] = { status }; localStorage.setItem(LS_CP_OVERRIDES, JSON.stringify(o)); }
  function getNewCps() { try { return JSON.parse(localStorage.getItem(LS_NEW_CPS) || '[]'); } catch { return []; } }
  function saveNewCp(cp) { const all = getNewCps(); all.unshift(cp); localStorage.setItem(LS_NEW_CPS, JSON.stringify(all)); }
  function getNewProjects() { try { return JSON.parse(localStorage.getItem(LS_NEW_PROJECTS) || '[]'); } catch { return []; } }
  function saveNewProject(p) { const all = getNewProjects(); all.unshift(p); localStorage.setItem(LS_NEW_PROJECTS, JSON.stringify(all)); }
  function getClashOverrides() { try { return JSON.parse(localStorage.getItem(LS_CLASH_OV) || '{}'); } catch { return {}; } }
  function saveClashResolution(id, resolution, resolvedBy) {
    const o = getClashOverrides(); o[id] = { status: 'resolved', resolution, resolvedBy, when: new Date().toISOString() };
    localStorage.setItem(LS_CLASH_OV, JSON.stringify(o));
  }
  function getNotifs() { try { return JSON.parse(localStorage.getItem(LS_NOTIFS) || '[]'); } catch { return []; } }
  // Simulated notification — pushes into the bell panel feed (no real network) + optional toast.
  function pushNotif(title, kind = 'navy', alsoToast = false) {
    const all = getNotifs();
    all.unshift({ title, time: 'just now', kind });
    localStorage.setItem(LS_NOTIFS, JSON.stringify(all.slice(0, 30)));
    addNotifToPanel(title, kind);
    if (alsoToast) showToast(title);
  }
  function addNotifToPanel(title, kind) {
    const list = document.querySelector('#notifPanel .notif-list');
    if (!list) return;
    const colorMap = { red: 'var(--color-red-500)', amber: 'var(--color-amber-500)', emerald: 'var(--color-emerald-500)', navy: 'var(--color-navy-700)', violet: 'var(--color-violet-600)' };
    const item = el('div', { class: 'notif-item' });
    item.appendChild(el('div', { class: 'notif-dot', style: `background:${colorMap[kind] || colorMap.navy};` }));
    const wrap = el('div');
    wrap.appendChild(el('div', { class: 'notif-title', text: title }));
    wrap.appendChild(el('div', { class: 'notif-time', text: 'just now' }));
    item.appendChild(wrap);
    list.insertBefore(item, list.firstChild);
  }

  // Phone normalization — strip spaces, +, leading 91/0 for matching.
  function normPhone(p) {
    let s = String(p || '').replace(/[\s\-()+]/g, '');
    if (s.startsWith('91') && s.length > 10) s = s.slice(s.length - 10);
    if (s.startsWith('0') && s.length > 10) s = s.slice(s.length - 10);
    return s;
  }
  function normName(n) { return String(n || '').trim().toLowerCase(); }

  // All known leads (MOCK_DATA + user-created), normalized for matching.
  function allKnownLeads() {
    const mock = (window.MOCK_DATA?.leads || []);
    const news = getNewLeads();
    return [...mock, ...news];
  }

  // ---------- Detection engine (spec §4) ----------
  // Returns one of: CLEAN | AWARENESS | CLASH | PENDING_VERIFICATION with context.
  function detectClash(newLead) {
    const today = new Date().toISOString().slice(0, 10);
    const phone = normPhone(newLead.phone);
    if (!phone) return { outcome: 'CLEAN' };

    const matches = allKnownLeads().filter(l => normPhone(l.phone) === phone);
    // "live" = claim still valid and not closed. Seed leads without claimValidUntil are treated live.
    const live = matches.filter(l => {
      if (l.isClosed) return false;
      if (!l.claimValidUntil) return true;
      return l.claimValidUntil >= today;
    });
    if (live.length === 0) return { outcome: 'CLEAN' };

    const sameProject = live.filter(l => (l.project || '') === (newLead.project || ''));
    if (sameProject.length === 0) {
      // AWARENESS — same phone, different project
      return { outcome: 'AWARENESS', related: live };
    }

    // earliest by registeredAt (fallback: keep order)
    const existing = sameProject.slice().sort((a, b) => (a.registeredAt || '').localeCompare(b.registeredAt || ''))[0];

    if (normName(newLead.name) === normName(existing.name)) {
      return { outcome: 'CLASH', existing };
    }
    return { outcome: 'PENDING_VERIFICATION', existing };
  }

  // ---------- Session ----------
  function getCurrentUser() {
    const id = localStorage.getItem(LS_USER);
    if (!id || !window.MOCK_DATA) return null;
    if (id === window.MOCK_DATA.owner.id) return { ...window.MOCK_DATA.owner, isOwner: true };
    return window.MOCK_DATA.employees.find(e => e.id === id) || null;
  }

  function requireLogin() {
    const u = getCurrentUser();
    if (!u) {
      window.location.href = 'index.html';
      return null;
    }
    return u;
  }

  function logout() {
    localStorage.removeItem(LS_USER);
    window.location.href = 'index.html';
  }

  // ---------- Lead overrides (notes / transfers / closures added during demo) ----------
  function getOverrides() {
    try { return JSON.parse(localStorage.getItem(LS_LEADS) || '{}'); } catch { return {}; }
  }
  function saveOverride(leadId, change) {
    const all = getOverrides();
    if (!all[leadId]) all[leadId] = { events: [] };
    all[leadId].events.push({ ...change, when: new Date().toISOString() });
    if (change.newOwnerId) all[leadId].currentOwnerId = change.newOwnerId;
    if (change.closed) all[leadId].closed = true;
    localStorage.setItem(LS_LEADS, JSON.stringify(all));
  }

  // ---------- Helpers ----------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'style') node.setAttribute('style', v);
      else if (k.startsWith('data-')) node.setAttribute(k, v);
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    children.forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return node;
  }

  function avatarEl(initials, color, size = '') {
    return el('div', { class: `avatar ${size ? 'avatar-' + size : ''} avatar-${color}`, text: initials });
  }

  function showToast(msg, kind = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast toast-${kind}`;
    t.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { t.hidden = true; }, 2400);
  }

  // ---------- Sidebar + topbar render ----------
  function renderSidebar(user) {
    const isOwner = !!user.isOwner;
    const items = isOwner ? [
      { key: 'dashboard',  label: 'Dashboard',       href: 'dashboard.html', icon: '◆' },
      { key: 'leads',      label: 'All Leads',       href: 'leads.html',     icon: '☰' },
      { key: 'rotation',   label: 'Rotation Engine', href: 'rotation.html',  icon: '↻' },
      { key: 'clashes',    label: 'Clashes / Verification', href: 'clashes.html', icon: '⚠' },
      { key: 'channel-partners', label: 'Channel Partners', href: 'channel-partners.html', icon: '◈' },
      { key: 'employees',  label: 'Team',            href: 'employees.html', icon: '◯' },
    ] : [
      { key: 'dashboard',  label: 'My Dashboard',    href: 'dashboard.html', icon: '◆' },
      { key: 'leads',      label: 'My Leads',        href: 'leads.html',     icon: '☰' },
    ];
    const lower = [
      { key: 'projects',  label: 'Projects', href: 'projects.html', icon: '⌂', ownerOnly: false },
      { key: 'reports',   label: 'Reports',  href: 'reports.html',  icon: '▤', ownerOnly: true },
      { key: 'conversion-funnel', label: 'Funnel & Conversion', href: 'conversion-funnel.html', icon: '▽', ownerOnly: true },
      { key: 'settings',  label: 'Settings', href: 'settings.html', icon: '⚙', ownerOnly: true },
    ].filter(i => !i.ownerOnly || isOwner);
    const activePage = document.body.dataset.page;

    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.replaceChildren();
    sidebar.classList.add('sidebar');

    // Brand
    const brand = el('div', { class: 'brand' });
    brand.append(
      el('div', { class: 'brand-mark', text: 'D' }),
      el('div', {}, [
        el('div', { class: 'brand-name', text: 'Dwellinn CRM' }),
        el('div', { class: 'brand-tag', text: 'Dwellinn Properties' }),
      ])
    );
    sidebar.appendChild(brand);

    function makeNavSection(label, list) {
      const sec = el('div', { class: 'nav-section' });
      sec.appendChild(el('div', { class: 'nav-label', text: label }));
      list.forEach(it => {
        const a = el('a', { href: it.href, class: `nav-item${it.key === activePage ? ' is-active' : ''}` });
        a.appendChild(el('span', { class: 'nav-icon', text: it.icon }));
        a.appendChild(el('span', { text: it.label }));
        sec.appendChild(a);
      });
      return sec;
    }
    sidebar.appendChild(makeNavSection(isOwner ? 'Workspace' : 'My Workspace', items));
    sidebar.appendChild(makeNavSection('Tools', lower));

    // Footer (user chip)
    const footer = el('div', { class: 'sidebar-footer' });
    const chip = el('div', { class: 'user-chip' });
    chip.appendChild(avatarEl(user.initials, user.color, 'md'));
    chip.appendChild(el('div', { class: 'user-info' }, [
      el('div', { class: 'user-name', text: user.name }),
      el('div', { class: 'user-role', text: (isOwner ? 'Owner' : user.roleName) + ' · Dwellinn' }),
    ]));
    const logoutBtn = el('button', { class: 'icon-btn', title: 'Logout', style: 'margin-left:auto;background:transparent;border-color:rgba(255,255,255,0.15);color:rgba(255,255,255,0.7);width:28px;height:28px;', text: '⏏' });
    logoutBtn.addEventListener('click', logout);
    chip.appendChild(logoutBtn);
    footer.appendChild(chip);
    sidebar.appendChild(footer);
  }

  function renderTopbar(user) {
    const isOwner = !!user.isOwner;
    const page = document.body.dataset.page;
    const t = document.getElementById('topbar');
    if (!t) return;
    t.replaceChildren();
    t.classList.add('topbar');

    let title = '';
    let subtitle = '';
    if (page === 'dashboard') {
      title = isOwner ? `Good evening, ${user.name.split(' ')[0]}` : `Hi ${user.name.split(' ')[0]}`;
      subtitle = isOwner ? `Dwellinn Properties — today's overview` : `Your leads and follow-ups for today`;
    } else if (page === 'leads') {
      title = isOwner ? 'All Leads' : 'My Leads';
    } else if (page === 'rotation') title = 'Rotation Engine';
    else if (page === 'channel-partners') title = 'Channel Partners';
    else if (page === 'clashes') title = 'Clashes / Verification';
    else if (page === 'employees') title = 'Team';
    else if (page === 'projects')  title = 'Projects';
    else if (page === 'reports')   title = 'Reports';
    else if (page === 'conversion-funnel') title = 'Lead Funnel & Conversion';
    else if (page === 'settings')  title = 'Settings';
    else title = 'Lead Detail';

    const left = el('div', {});
    left.appendChild(el('div', { class: 'topbar-title', text: title }));
    if (subtitle) left.appendChild(el('div', { class: 'topbar-meta', text: subtitle }));
    t.appendChild(left);
    t.appendChild(el('div', { class: 'topbar-spacer' }));
    const search = el('input', { class: 'topbar-search', id: 'topbarSearch', placeholder: 'Search leads, employees, projects...' });
    t.appendChild(search);
    const bell = el('button', { class: 'icon-btn', id: 'bellBtn', title: 'Notifications', text: '🔔' });
    t.appendChild(bell);
    // Add Lead button on the topbar (owner sees on every page; employee on dashboard/leads)
    if (isOwner || page === 'leads' || page === 'dashboard') {
      const addBtn = el('button', { class: 'btn btn-accent', 'data-action': 'add-lead', text: '+ Add Lead' });
      t.appendChild(addBtn);
    }

    // Wire search
    search.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const rows = document.querySelectorAll('[data-lead-row]');
      rows.forEach(r => {
        if (!q) { r.style.display = ''; return; }
        const hay = r.getAttribute('data-search') || '';
        const matches = hay.includes(q);
        r.style.display = matches ? '' : 'none';
      });
    });

    // Wire bell to toggle notification panel
    bell.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('notifPanel');
      if (!panel) return;
      panel.hidden = !panel.hidden;
    });

    // Close notification panel on outside click
    document.addEventListener('click', (e) => {
      const panel = document.getElementById('notifPanel');
      if (!panel || panel.hidden) return;
      if (panel.contains(e.target) || bell.contains(e.target)) return;
      panel.hidden = true;
    });

    // Close button inside notification panel
    document.querySelectorAll('[data-notif-close]').forEach(b => {
      b.addEventListener('click', () => {
        const panel = document.getElementById('notifPanel');
        if (panel) panel.hidden = true;
      });
    });
  }

  // ---------- Owner-only access guard ----------
  function checkOwnerOnly(user) {
    if (document.body.dataset.ownerOnly === '1' && !user.isOwner) {
      // Redirect employee away from owner-only pages
      window.location.href = 'dashboard.html';
      return false;
    }
    return true;
  }

  // ---------- Dashboard: show employee view for non-owner ----------
  function setupDashboard(user) {
    const ownerView = document.querySelector('[data-view="owner"]');
    const empView = document.querySelector('[data-view="employee"]');
    if (!ownerView || !empView) return;
    if (user.isOwner) {
      ownerView.hidden = false; empView.hidden = true;
    } else {
      ownerView.hidden = true; empView.hidden = false;
      populateEmployeeDashboard(user);
    }
  }

  function populateEmployeeDashboard(user) {
    const overrides = getOverrides();
    const userNewLeads = getNewLeads().filter(l => l.currentOwnerId === user.id);
    const mockMyLeads = window.MOCK_DATA.leads.filter(l => {
      const ov = overrides[l.id];
      const curOwner = ov?.currentOwnerId || l.currentOwnerId;
      const isClosed = ov?.closed || l.isClosed;
      return curOwner === user.id && !isClosed;
    });
    const myLeads = [...userNewLeads, ...mockMyLeads];
    const closedByMe = window.MOCK_DATA.leads.filter(l => {
      const ov = overrides[l.id];
      const curOwner = ov?.currentOwnerId || l.currentOwnerId;
      const isClosed = ov?.closed || l.isClosed;
      return curOwner === user.id && isClosed;
    });
    const rotatedIn = myLeads.filter(l => l.rotations > 0 && l.originalOwnerId !== user.id).length;
    // Stale heuristic: any lead with rotations>0 is "needs attention" for demo
    const stale = myLeads.filter(l => l.rotations >= 1).length;

    document.querySelectorAll('[data-stat="my-active"]').forEach(n => { n.textContent = myLeads.length; });
    document.querySelectorAll('[data-stat="my-rotated-in"]').forEach(n => { n.textContent = rotatedIn; });
    document.querySelectorAll('[data-stat="my-stale"]').forEach(n => { n.textContent = stale; });
    document.querySelectorAll('[data-stat="my-closed"]').forEach(n => { n.textContent = closedByMe.length; });

    // Fill the "my leads" table
    const tbody = document.querySelector('[data-my-leads-body]');
    if (!tbody) return;
    tbody.replaceChildren();
    if (myLeads.length === 0) {
      const tr = el('tr');
      tr.appendChild(el('td', { colspan: '6', style: 'text-align:center;padding:30px;color:var(--color-slate-500);font-size:13px;', text: 'No leads currently assigned to you.' }));
      tbody.appendChild(tr);
      return;
    }
    myLeads.forEach(l => {
      const tr = el('tr');
      // Lead name + avatar
      const tdName = el('td');
      const cell = el('div', { class: 'lead-name-cell' });
      cell.appendChild(avatarEl(l.initials || (l.name||'?').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase(), l.color || 'amber', 'md'));
      const nameInner = el('div');
      const strong = el('div', { class: 'cell-strong' });
      strong.appendChild(el('a', { href: `lead-detail.html?id=${l.id}`, text: l.name }));
      nameInner.appendChild(strong);
      nameInner.appendChild(el('div', { class: 'lead-meta', text: `${l.id} · ${l.config || ''}` }));
      cell.appendChild(nameInner);
      tdName.appendChild(cell);
      tr.appendChild(tdName);

      // Project
      const tdProj = el('td');
      tdProj.appendChild(el('div', { class: 'cell-strong', style: 'font-size:12.5px;', text: l.project || '—' }));
      if (l.source) tdProj.appendChild(el('div', { class: 'lead-meta', text: `Source: ${l.source}` }));
      tr.appendChild(tdProj);

      // Budget
      tr.appendChild(el('td', { class: 'cell-strong', text: l.budget ? '₹' + l.budget : '—' }));

      // Last contact
      const tdContact = el('td');
      if (l.isClosed) tdContact.appendChild(el('span', { class: 'muted', text: '—' }));
      else if (l.isStale) tdContact.appendChild(el('strong', { style: 'color:var(--color-red-600);', text: `${l.daysSinceContact}d` }));
      else tdContact.appendChild(el('span', { style: 'color:var(--color-emerald-600);font-weight:600;', text: `${l.daysSinceContact || 0}d` }));
      tr.appendChild(tdContact);

      // Status pill
      const tdStatus = el('td');
      const pillSpan = el('span', { class: `pill ${l.statusPill || 'pill-emerald'}` });
      pillSpan.appendChild(el('span', { class: 'pill-dot' }));
      pillSpan.appendChild(document.createTextNode(l.statusLabel || 'Fresh'));
      tdStatus.appendChild(pillSpan);
      tr.appendChild(tdStatus);

      // Open
      const tdOpen = el('td');
      tdOpen.appendChild(el('a', { href: `lead-detail.html?id=${l.id}`, class: 'btn btn-ghost btn-sm', text: 'Open' }));
      tr.appendChild(tdOpen);

      tbody.appendChild(tr);
    });
  }

  // ---------- Apply overrides (close/convert/transfer) to leads-list rows ----------
  function applyOverridesToLeadsList() {
    const overrides = getOverrides();
    Object.keys(overrides).forEach(leadId => {
      const data = overrides[leadId];
      if (!data.events) return;
      const linkEl = document.querySelector(`a[href="lead-detail.html?id=${leadId}"]`);
      const rowEl = linkEl?.closest('tr[data-lead-row]');
      if (!rowEl) return;

      const convertEv = data.events.find(e => e.type === 'convert');
      const closeEv = data.events.find(e => e.type === 'close');
      const transferEv = [...data.events].reverse().find(e => e.type === 'transfer' || e.type === 'rotation');

      if (convertEv || closeEv || data.closed) {
        rowEl.setAttribute('data-status', 'closed');
        const statusCell = rowEl.cells[rowEl.cells.length - 2];
        if (statusCell) {
          statusCell.replaceChildren();
          const pill = document.createElement('span');
          pill.className = convertEv ? 'pill pill-emerald' : 'pill pill-slate';
          const dot = document.createElement('span'); dot.className = 'pill-dot'; pill.appendChild(dot);
          pill.appendChild(document.createTextNode(convertEv ? 'Converted to Deal' : (closeEv?.reason || 'Closed')));
          statusCell.appendChild(pill);
        }
        const contactCell = rowEl.cells[rowEl.cells.length - 3];
        if (contactCell) {
          contactCell.replaceChildren();
          const dash = document.createElement('span'); dash.className = 'muted'; dash.textContent = '—';
          contactCell.appendChild(dash);
        }
      }

      if (transferEv && !convertEv && !closeEv) {
        const newOwner = window.MOCK_DATA.employees.find(e => e.id === transferEv.newOwnerId);
        if (newOwner) {
          rowEl.setAttribute('data-current-owner', transferEv.newOwnerId);
          const ownerCell = rowEl.cells[3];
          if (ownerCell) {
            ownerCell.replaceChildren();
            const wrap = document.createElement('div');
            wrap.className = 'row'; wrap.style.gap = '8px';
            const av = document.createElement('div'); av.className = `avatar avatar-sm avatar-${newOwner.color}`; av.textContent = newOwner.initials;
            wrap.appendChild(av);
            const info = document.createElement('div');
            const name = document.createElement('div');
            name.style.cssText = 'font-size:12.5px;font-weight:600;color:var(--color-slate-800);';
            name.textContent = newOwner.name;
            info.appendChild(name);
            const role = document.createElement('div');
            role.className = 'text-xs muted'; role.textContent = newOwner.roleName;
            info.appendChild(role);
            wrap.appendChild(info);
            ownerCell.appendChild(wrap);
          }
        }
      }
    });
    if (typeof updateFilterChipCounts === 'function') updateFilterChipCounts();
  }

  // ---------- Inject converted leads into rotation page "Recently closed" ----------
  function injectClosedIntoRotation() {
    if (document.body.dataset.page !== 'rotation') return;
    const overrides = getOverrides();
    const cards = document.querySelectorAll('.card');
    const closedCard = Array.from(cards).find(c => c.querySelector('.card-title')?.textContent?.includes('Recently closed'));
    if (!closedCard) return;
    const body = closedCard.querySelector('.card-body');
    if (!body) return;
    Object.keys(overrides).forEach(leadId => {
      const data = overrides[leadId];
      const convertEv = data.events?.find(e => e.type === 'convert');
      const closeEv = data.events?.find(e => e.type === 'close');
      if (!convertEv && !closeEv) return;
      const lead = (window.MOCK_DATA?.leads || []).find(l => l.id === leadId)
                || getNewLeads().find(l => l.id === leadId);
      if (!lead) return;

      const empty = body.querySelector('.muted.text-sm');
      if (empty) empty.remove();

      const card = document.createElement('div');
      card.style.cssText = 'padding:12px 0;border-bottom:1px solid var(--color-slate-100);';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;';
      const av = document.createElement('div');
      av.className = `avatar avatar-sm avatar-${lead.color || 'amber'}`;
      av.textContent = lead.initials || (lead.name || '?').split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
      row.appendChild(av);
      const info = document.createElement('div'); info.style.cssText = 'flex:1;font-size:13px;';
      const strong = document.createElement('strong');
      const a = document.createElement('a'); a.href = `lead-detail.html?id=${lead.id}`; a.textContent = lead.name;
      strong.appendChild(a);
      info.appendChild(strong);
      info.appendChild(document.createTextNode(' '));
      const muted = document.createElement('span'); muted.className = 'muted';
      muted.textContent = `· ${lead.project || ''}`;
      info.appendChild(muted);
      row.appendChild(info);
      const pill = document.createElement('span');
      pill.className = convertEv ? 'pill pill-emerald' : 'pill pill-slate';
      const dot = document.createElement('span'); dot.className = 'pill-dot'; pill.appendChild(dot);
      pill.appendChild(document.createTextNode(convertEv ? `🏆 Converted — ₹${convertEv.amount}` : (closeEv?.reason || 'Closed')));
      row.appendChild(pill);
      card.appendChild(row);
      const detail = document.createElement('div');
      detail.style.cssText = 'font-size:12px;color:var(--color-slate-600);margin-top:6px;padding-left:32px;';
      const span1 = document.createElement('span');
      span1.appendChild(document.createTextNode('Closed by '));
      const strong2 = document.createElement('strong');
      strong2.textContent = lead.currentOwner?.name || getOwnerName(lead.currentOwnerId) || 'employee';
      span1.appendChild(strong2);
      span1.appendChild(document.createTextNode(' · just now'));
      detail.appendChild(span1);
      card.appendChild(detail);
      body.insertBefore(card, body.firstChild);
    });
  }

  // ---------- Leads list filtering by role ----------
  function setupLeadsList(user) {
    if (document.body.dataset.page !== 'leads') return;
    if (user.isOwner) return; // owner sees all
    const rows = document.querySelectorAll('[data-lead-row]');
    let visibleCount = 0;
    rows.forEach(r => {
      const owner = r.getAttribute('data-current-owner');
      if (owner === user.id) { r.style.display = ''; visibleCount++; }
      else r.style.display = 'none';
    });
    const counter = document.querySelector('[data-leads-count]');
    if (counter) counter.textContent = `Showing your ${visibleCount} leads`;
  }

  // ---------- Filter chips on leads page (actually filter) ----------
  function applyStatusFilter(filter) {
    const chips = document.querySelectorAll('.filter-chip[data-filter]');
    chips.forEach(x => x.classList.remove('is-active'));
    const activeChip = document.querySelector(`.filter-chip[data-filter="${filter}"]`);
    if (activeChip) activeChip.classList.add('is-active');
    const rows = document.querySelectorAll('[data-lead-row]');
    let visible = 0;
    rows.forEach(r => {
      const status = r.getAttribute('data-status');
      let show = false;
      if (filter === 'all') show = true;
      else if (filter === 'fresh') show = (status === 'fresh');
      else if (filter === 'rotation') show = (status === 'rotation' || status === 'stale' || status === 'final');
      else if (filter === 'stale') show = (status === 'stale');
      else if (filter === 'final') show = (status === 'final');
      else if (filter === 'closed') show = (status === 'closed');
      r.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    const counter = document.querySelector('[data-leads-count]');
    if (counter) counter.textContent = `Showing ${visible} of ${rows.length}`;
  }

  function setupLeadFilters() {
    const chips = document.querySelectorAll('.filter-chip[data-filter]');
    chips.forEach(c => {
      c.addEventListener('click', () => applyStatusFilter(c.getAttribute('data-filter')));
    });

    // Apply URL params on initial load
    const params = new URLSearchParams(location.search);
    const filter = params.get('filter');
    const ownerId = params.get('owner');
    const sourceId = params.get('source');
    const projectName = params.get('project');

    if (filter) {
      applyStatusFilter(filter);
      addContextBanner(`Filter: ${filterLabel(filter)}`);
    } else if (ownerId) {
      filterByAttr('data-current-owner', ownerId);
      const ownerName = getOwnerName(ownerId);
      addContextBanner(`Showing leads owned by ${ownerName}`);
    } else if (sourceId) {
      filterByAttr('data-source', sourceId);
      addContextBanner(`Showing leads from ${sourceLabel(sourceId)}`);
    } else if (projectName) {
      filterByText('data-search', projectName.toLowerCase());
      addContextBanner(`Showing leads for project: ${projectName}`);
    }
  }

  function filterLabel(f) {
    return { all: 'All', fresh: 'Fresh', rotation: 'In Rotation', stale: 'Stale 3+ days', final: 'Final attempt', closed: 'Closed' }[f] || f;
  }
  function sourceLabel(s) {
    return { fb: 'Facebook', ig: 'Instagram', '99': '99acres', mb: 'MagicBricks', housing: 'Housing.com', website: 'Website', walkin: 'Walk-in', referral: 'Referral' }[s] || s;
  }

  function filterByAttr(attr, value) {
    const rows = document.querySelectorAll('[data-lead-row]');
    let visible = 0;
    rows.forEach(r => {
      const show = r.getAttribute(attr) === value;
      r.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    const counter = document.querySelector('[data-leads-count]');
    if (counter) counter.textContent = `Showing ${visible} of ${rows.length}`;
  }

  function filterByText(attr, value) {
    const rows = document.querySelectorAll('[data-lead-row]');
    let visible = 0;
    rows.forEach(r => {
      const show = (r.getAttribute(attr) || '').includes(value);
      r.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    const counter = document.querySelector('[data-leads-count]');
    if (counter) counter.textContent = `Showing ${visible} of ${rows.length}`;
  }

  function addContextBanner(text) {
    const filterBar = document.querySelector('.filter-bar');
    if (!filterBar) return;
    if (document.getElementById('contextBanner')) return; // don't duplicate
    const banner = document.createElement('div');
    banner.id = 'contextBanner';
    banner.style.cssText = 'background:var(--color-navy-50);color:var(--color-navy-800);padding:10px 14px;border-radius:var(--radius);margin-bottom:14px;display:flex;align-items:center;gap:10px;font-size:13px;font-weight:500;';
    const icon = document.createElement('span'); icon.textContent = '🔎'; banner.appendChild(icon);
    banner.appendChild(document.createTextNode(text));
    const clearBtn = document.createElement('a');
    clearBtn.href = 'leads.html';
    clearBtn.textContent = '× Clear filter';
    clearBtn.style.cssText = 'margin-left:auto;font-size:12px;color:var(--color-navy-700);text-decoration:none;font-weight:600;';
    banner.appendChild(clearBtn);
    filterBar.parentNode.insertBefore(banner, filterBar);
  }

  // ---------- Inject user-created leads into leads table ----------
  function injectNewLeads(user) {
    const tbody = document.querySelector('[data-leads-body]');
    if (!tbody) return;
    const newLeads = getNewLeads();
    if (newLeads.length === 0) return;

    // Visible-to-user filter
    const visible = newLeads.filter(l => user.isOwner || l.currentOwnerId === user.id);

    const params = new URLSearchParams(location.search);
    const highlightId = params.get('new');

    visible.forEach(l => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-lead-row', '');
      tr.setAttribute('data-current-owner', l.currentOwnerId);
      tr.setAttribute('data-status', 'fresh');
      tr.setAttribute('data-source', l.source);
      tr.setAttribute('data-search', (l.name + ' ' + l.phone + ' ' + l.email + ' ' + l.project).toLowerCase());
      if (l.id === highlightId) {
        tr.style.background = 'linear-gradient(90deg, rgba(245,158,11,0.18), transparent 60%)';
        tr.style.transition = 'background 2.5s';
      }

      // Lead cell
      const tdName = document.createElement('td');
      const cell = document.createElement('div'); cell.className = 'lead-name-cell';
      const av = document.createElement('div'); av.className = `avatar avatar-md avatar-${l.color}`; av.textContent = l.initials;
      cell.appendChild(av);
      const innerName = document.createElement('div');
      const strong = document.createElement('div'); strong.className = 'cell-strong';
      const a = document.createElement('a'); a.href = `lead-detail.html?id=${l.id}`; a.textContent = l.name;
      strong.appendChild(a);
      const newPill = document.createElement('span');
      newPill.className = 'pill pill-emerald';
      newPill.style.marginLeft = '6px'; newPill.style.fontSize = '10px';
      newPill.textContent = 'NEW';
      strong.appendChild(newPill);
      innerName.appendChild(strong);
      const meta = document.createElement('div'); meta.className = 'lead-meta';
      meta.textContent = `${l.id} · ${l.phone}`;
      innerName.appendChild(meta);
      cell.appendChild(innerName);
      tdName.appendChild(cell);
      tr.appendChild(tdName);

      // Source cell
      const tdSrc = document.createElement('td');
      const sdot = document.createElement('span');
      sdot.className = `source-dot ${l.sourceCls}`;
      sdot.title = l.source; sdot.textContent = l.sourceIcon;
      tdSrc.appendChild(sdot);
      const sname = document.createElement('span');
      sname.style.cssText = 'font-size:12px;color:var(--color-slate-700);margin-left:6px;';
      sname.textContent = l.source;
      tdSrc.appendChild(sname);
      tr.appendChild(tdSrc);

      // Project cell
      const tdProj = document.createElement('td');
      const pStrong = document.createElement('div'); pStrong.className = 'cell-strong'; pStrong.style.fontSize = '12.5px';
      pStrong.textContent = l.project;
      tdProj.appendChild(pStrong);
      const pMeta = document.createElement('div'); pMeta.className = 'lead-meta';
      pMeta.textContent = `${l.config} · ${l.budget !== '—' ? '₹' + l.budget : '—'}`;
      tdProj.appendChild(pMeta);
      tr.appendChild(tdProj);

      // Owner cell
      const tdOwner = document.createElement('td');
      const ownerRow = document.createElement('div');
      ownerRow.className = 'row'; ownerRow.style.gap = '8px';
      const oav = document.createElement('div');
      oav.className = `avatar avatar-sm avatar-${getOwnerColor(l.currentOwnerId)}`;
      oav.textContent = getOwnerInitials(l.currentOwnerId);
      ownerRow.appendChild(oav);
      const oinfo = document.createElement('div');
      const oname = document.createElement('div');
      oname.style.cssText = 'font-size:12.5px;font-weight:600;color:var(--color-slate-800);';
      oname.textContent = l.ownerName;
      oinfo.appendChild(oname);
      ownerRow.appendChild(oinfo);
      tdOwner.appendChild(ownerRow);
      tr.appendChild(tdOwner);

      // Rotations
      const tdRot = document.createElement('td');
      const rotPill = document.createElement('span'); rotPill.className = 'pill pill-emerald';
      const rotDot = document.createElement('span'); rotDot.className = 'pill-dot';
      rotPill.appendChild(rotDot); rotPill.appendChild(document.createTextNode('0x'));
      tdRot.appendChild(rotPill);
      tr.appendChild(tdRot);

      // Last contact
      const tdContact = document.createElement('td');
      const contactSpan = document.createElement('span');
      contactSpan.style.cssText = 'color:var(--color-emerald-600);font-weight:600;';
      contactSpan.textContent = 'Just now';
      tdContact.appendChild(contactSpan);
      tr.appendChild(tdContact);

      // Status
      const tdStatus = document.createElement('td');
      const sPill = document.createElement('span'); sPill.className = 'pill pill-emerald';
      const sDot = document.createElement('span'); sDot.className = 'pill-dot';
      sPill.appendChild(sDot); sPill.appendChild(document.createTextNode('New — Active'));
      tdStatus.appendChild(sPill);
      tr.appendChild(tdStatus);

      // Open
      const tdOpen = document.createElement('td');
      const openA = document.createElement('a');
      openA.href = `lead-detail.html?id=${l.id}`;
      openA.className = 'btn btn-ghost btn-sm';
      openA.textContent = 'Open';
      tdOpen.appendChild(openA);
      tr.appendChild(tdOpen);

      tbody.insertBefore(tr, tbody.firstChild);
    });

    // Update counter
    const total = document.querySelectorAll('[data-lead-row]').length;
    const counter = document.querySelector('[data-leads-count]');
    if (counter) counter.textContent = user.isOwner ? `Showing all ${total} of ${total}` : `Showing your ${visible.length + (counter.dataset.baseCount || 0)} leads`;

    // Update filter chip counts
    updateFilterChipCounts();

    // If this is a fresh navigation with ?new=, fade the highlight after a moment
    if (highlightId) {
      setTimeout(() => {
        const row = document.querySelector(`[data-lead-row][data-search*="${(visible.find(l=>l.id===highlightId)?.name||'').toLowerCase()}"]`);
        if (row) row.style.background = '';
      }, 2500);
    }
  }

  function updateFilterChipCounts() {
    const rows = document.querySelectorAll('[data-lead-row]');
    const all = rows.length;
    let fresh=0, rotation=0, stale=0, final=0, closed=0;
    rows.forEach(r => {
      const s = r.getAttribute('data-status');
      if (s==='fresh') fresh++;
      else if (s==='stale') { stale++; rotation++; }
      else if (s==='final') { final++; rotation++; }
      else if (s==='rotation') rotation++;
      else if (s==='closed') closed++;
    });
    const map = { all, fresh, rotation, stale, final, closed };
    document.querySelectorAll('.filter-chip[data-filter]').forEach(c => {
      const key = c.getAttribute('data-filter');
      const muted = c.querySelector('.muted');
      if (muted) muted.textContent = `(${map[key] ?? 0})`;
    });
  }

  // ---------- Inject new lead summary into dashboard ----------
  function injectNewLeadsDashboard(user) {
    const newLeads = getNewLeads().filter(l => user.isOwner || l.currentOwnerId === user.id);
    if (newLeads.length === 0) return;
    // Update Active Leads KPI on owner dashboard
    const activeKpi = document.querySelector('[data-view="owner"] .kpi:first-child .kpi-value');
    if (activeKpi) {
      const cur = parseInt(activeKpi.textContent, 10) || 0;
      activeKpi.textContent = cur + newLeads.length;
      const meta = activeKpi.parentElement.querySelector('.kpi-meta');
      if (meta) meta.textContent = `+${newLeads.length} added today`;
    }
    // For the employee view, the stat numbers are updated by populateEmployeeDashboard which we'll patch separately
  }

  // ---------- Tab switching on detail page ----------
  function setupTabs() {
    const bars = document.querySelectorAll('[data-tabs]');
    bars.forEach(bar => {
      const tabs = bar.querySelectorAll('.tab');
      tabs.forEach(t => {
        t.addEventListener('click', () => {
          tabs.forEach(x => x.classList.remove('is-active'));
          t.classList.add('is-active');
          const which = t.getAttribute('data-tab');
          showToast(`Showing ${t.textContent} tab (demo — content lives here in production)`);
        });
      });
    });
  }

  // ---------- Lead detail loader (picks by ?id=) ----------
  function setupLeadDetail() {
    const dataEl = document.getElementById('leadDetailsData');
    const host = document.querySelector('[data-lead-detail-host]');
    if (!dataEl || !host) return;
    let leadDetails;
    try { leadDetails = JSON.parse(dataEl.textContent); } catch { return; }
    const params = new URLSearchParams(location.search);
    const id = params.get('id') || Object.keys(leadDetails)[0];

    // If this lead exists in the prebuilt map, use it
    if (leadDetails[id]) {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<div>' + leadDetails[id] + '</div>', 'text/html');
      const fragment = doc.body.firstChild;
      while (fragment.firstChild) host.appendChild(fragment.firstChild);
      return;
    }

    // Otherwise, check if it's a user-created lead and render dynamically (safe DOM building)
    const newLead = getNewLeads().find(l => l.id === id);
    if (newLead) {
      renderDynamicLeadDetail(host, newLead);
      return;
    }

    // Fallback — show first known lead
    const fallback = leadDetails[Object.keys(leadDetails)[0]];
    if (fallback) {
      const parser = new DOMParser();
      const doc = parser.parseFromString('<div>' + fallback + '</div>', 'text/html');
      const fragment = doc.body.firstChild;
      while (fragment.firstChild) host.appendChild(fragment.firstChild);
    }
  }

  // Build a lead-detail page DOM for a user-created lead, safely (createElement only).
  function renderDynamicLeadDetail(host, l) {
    // Hero
    const hero = el('div', { class: 'lead-hero' });
    const row = el('div', { class: 'lead-hero-row' });
    row.appendChild(avatarEl(l.initials, l.color, 'lg'));
    const left = el('div', { style: 'position:relative;z-index:1;' });
    left.appendChild(el('div', { class: 'lead-hero-name', text: l.name }));
    left.appendChild(el('div', { class: 'lead-hero-meta', text: `${l.id} · ${l.phone} · ${l.email}` }));
    const tags = el('div', { class: 'lead-hero-tags' });
    [l.project, l.config, l.budget !== '—' ? `₹${l.budget}` : null, `Possession: ${l.possession}`, `Source: ${l.source}`, 'NEW LEAD'].filter(Boolean).forEach(t => {
      const span = el('span', { class: 'hero-tag', text: t });
      if (t === 'NEW LEAD') { span.style.background = 'rgba(16,185,129,0.3)'; span.style.borderColor = 'rgba(16,185,129,0.5)'; }
      tags.appendChild(span);
    });
    left.appendChild(tags);
    row.appendChild(left);
    const actions = el('div', { class: 'lead-hero-actions' });
    actions.appendChild(buttonEl('📞 Call', 'btn btn-ghost', { 'data-action': 'call' }, 'rgba(255,255,255,0.1)'));
    actions.appendChild(buttonEl('💬 WhatsApp', 'btn btn-ghost', { 'data-action': 'whatsapp' }, 'rgba(255,255,255,0.1)'));
    actions.appendChild(buttonEl('+ Feedback', 'btn btn-accent', { 'data-action': 'feedback', 'data-lead-id': l.id }));
    actions.appendChild(buttonEl('Transfer →', 'btn btn-ghost', { 'data-action': 'transfer', 'data-lead-id': l.id }, 'rgba(255,255,255,0.1)'));
    row.appendChild(actions);
    hero.appendChild(row);
    host.appendChild(hero);

    // Detail grid: timeline + side panels
    const grid = el('div', { class: 'detail-grid' });

    // Timeline column
    const colMain = el('div', { class: 'col' });
    const card = el('div', { class: 'card' });
    const tabBar = el('div', { class: 'tab-bar', 'data-tabs': '' });
    ['Activity','Call Logs','WhatsApp','Notes','Documents'].forEach((t, i) => {
      const tab = el('div', { class: 'tab' + (i === 0 ? ' is-active' : ''), 'data-tab': t.toLowerCase(), text: t });
      tabBar.appendChild(tab);
    });
    card.appendChild(tabBar);
    const cardBody = el('div', { class: 'card-body' });
    const timeline = el('div', { class: 'timeline', 'data-timeline': '', 'data-lead-id': l.id });
    const item = el('div', { class: 'timeline-item' });
    item.appendChild(el('div', { class: 'timeline-dot is-success' }));
    item.appendChild(el('div', { class: 'timeline-time', text: `${l.createdAt} · ${getOwnerName(l.currentOwnerId)}` }));
    const body = el('div', { class: 'timeline-body' });
    body.appendChild(el('strong', { text: 'Lead created' }));
    body.appendChild(document.createTextNode(` from ${l.source} · assigned to ${getOwnerName(l.currentOwnerId)}`));
    item.appendChild(body);
    timeline.appendChild(item);
    cardBody.appendChild(timeline);
    card.appendChild(cardBody);
    colMain.appendChild(card);
    grid.appendChild(colMain);

    // Side column
    const colSide = el('div', { class: 'col' });

    const briefCard = el('div', { class: 'card' });
    const briefHdr = el('div', { class: 'card-header' });
    const briefHdrInner = el('div');
    briefHdrInner.appendChild(el('div', { class: 'card-title', text: 'Real estate brief' }));
    briefHdr.appendChild(briefHdrInner);
    briefCard.appendChild(briefHdr);
    const briefBody = el('div', { class: 'card-body' });
    const fields = [
      ['Project', l.project, true],
      ['Configuration', l.config, true],
      ['Budget', l.budget !== '—' ? `₹${l.budget}` : '—', false, 'currency'],
      ['Possession', l.possession, false],
      ['Source', l.source, false],
      ['Phone', l.phone, false],
      ['Email', l.email, false],
    ];
    fields.forEach(([k,v,strong,extra]) => {
      const r = el('div', { class: 'field-row' });
      r.appendChild(el('span', { class: 'field-key', text: k }));
      const v2 = el('span', { class: 'field-value' + (strong ? ' is-strong' : '') + (extra === 'currency' ? ' is-currency' : ''), text: v });
      r.appendChild(v2);
      briefBody.appendChild(r);
    });
    briefCard.appendChild(briefBody);
    colSide.appendChild(briefCard);

    const ownCard = el('div', { class: 'card' });
    const ownHdr = el('div', { class: 'card-header' });
    const ownHdrInner = el('div');
    ownHdrInner.appendChild(el('div', { class: 'card-title', text: 'Ownership' }));
    ownHdr.appendChild(ownHdrInner);
    ownCard.appendChild(ownHdr);
    const ownBody = el('div', { class: 'card-body' });
    const ownRow = el('div', { style: 'display:flex;align-items:center;gap:10px;' });
    ownRow.appendChild(avatarEl(getOwnerInitials(l.currentOwnerId), getOwnerColor(l.currentOwnerId), 'md'));
    const ownText = el('div');
    ownText.appendChild(el('div', { class: 'text-strong', style: 'font-size:13.5px;', text: getOwnerName(l.currentOwnerId) }));
    ownText.appendChild(el('div', { class: 'text-xs muted', text: 'Current owner · Newly assigned' }));
    ownRow.appendChild(ownText);
    ownBody.appendChild(ownRow);
    ownCard.appendChild(ownBody);
    colSide.appendChild(ownCard);

    grid.appendChild(colSide);
    host.appendChild(grid);
  }

  function buttonEl(text, cls, attrs, bg) {
    const b = el('button', { class: cls, ...attrs, text });
    if (bg) b.setAttribute('style', `background:${bg};border-color:rgba(255,255,255,0.15);color:#fff;`);
    return b;
  }

  // ---------- Modals ----------
  function setupModals() {
    const overlays = document.querySelectorAll('.modal-overlay');
    overlays.forEach(o => {
      o.addEventListener('click', (e) => { if (e.target === o) o.hidden = true; });
      o.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { o.hidden = true; }));
    });

    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const action = a.getAttribute('data-action');
      const leadId = a.getAttribute('data-lead-id');

      // CSV import/export + project filters are handled by the data-IO module
      if (action.startsWith('export-') || action.startsWith('import-') || action === 'clear-project-filters') {
        e.preventDefault();
        handleDataIO(action);
        return;
      }

      if (action === 'feedback') {
        const modal = document.getElementById('feedbackModal');
        modal.dataset.leadId = leadId || '';
        modal.hidden = false;
      } else if (action === 'transfer') {
        const modal = document.getElementById('transferModal');
        modal.dataset.leadId = leadId || '';
        modal.hidden = false;
      } else if (action === 'close') {
        const modal = document.getElementById('closeModal');
        modal.dataset.leadId = leadId || '';
        modal.hidden = false;
      } else if (action === 'call') {
        showToast('Calling customer... (demo)');
      } else if (action === 'whatsapp') {
        showToast('Opening WhatsApp chat... (demo)');
      } else if (action === 'add-lead') {
        const m = document.getElementById('addLeadModal');
        if (m) m.hidden = false;
      } else if (action === 'add-employee') {
        const m = document.getElementById('addEmployeeModal');
        if (m) m.hidden = false;
      } else if (action === 'configure-rules') {
        const m = document.getElementById('configRulesModal');
        if (m) m.hidden = false;
      } else if (action === 'trigger-rotation-all') {
        const m = document.getElementById('rotateAllModal');
        if (m) {
          const cntEl = document.getElementById('raCount');
          if (cntEl) cntEl.textContent = a.getAttribute('data-count') || 'all queued';
          m.hidden = false;
        }
      } else if (action === 'rotate-lead') {
        const m = document.getElementById('rotateLeadModal');
        if (m) {
          m.dataset.leadId = a.getAttribute('data-lead-id') || '';
          m.dataset.leadName = a.getAttribute('data-lead-name') || '';
          m.dataset.currentOwnerId = a.getAttribute('data-current-owner-id') || '';
          const suggested = a.getAttribute('data-suggested-id');
          // Pre-select the suggested next employee
          const sel = document.getElementById('rlEmployee');
          if (sel && suggested) sel.value = suggested;
          const ctx = document.getElementById('rlContext');
          if (ctx) ctx.textContent = `Rotating "${m.dataset.leadName}" (${m.dataset.leadId}) — the current owner must record why before the handoff is final. Lohit sees the full trail.`;
          m.hidden = false;
        }
      } else if (action === 'add-project') {
        const m = document.getElementById('addProjectModal');
        if (m) m.hidden = false;
      } else if (action === 'advance-stage') {
        const m = document.getElementById('stageModal');
        if (m) {
          m.dataset.leadId = a.getAttribute('data-lead-id') || '';
          m.dataset.leadName = a.getAttribute('data-lead-name') || '';
          const ctx = document.getElementById('stContext');
          if (ctx) ctx.textContent = `Advancing "${m.dataset.leadName}" — current stage: ${a.getAttribute('data-current-stage') || 'Open'}. Capture what the customer said.`;
          m.hidden = false;
        }
      } else if (action === 'followup') {
        const m = document.getElementById('followupModal');
        if (m) {
          m.dataset.leadId = a.getAttribute('data-lead-id') || '';
          m.dataset.leadName = a.getAttribute('data-lead-name') || '';
          const ctx = document.getElementById('fuContext');
          if (ctx) ctx.textContent = `Scheduling follow-up for "${m.dataset.leadName}". You and Lohit will get a reminder on the day.`;
          // Default date = tomorrow
          const d = new Date(); d.setDate(d.getDate() + 1);
          const dateEl = document.getElementById('fuDate');
          if (dateEl) dateEl.value = d.toISOString().slice(0, 10);
          m.hidden = false;
        }
      } else if (action === 'add-task') {
        const m = document.getElementById('taskModal');
        if (m) {
          m.dataset.leadId = a.getAttribute('data-lead-id') || '';
          m.dataset.leadName = a.getAttribute('data-lead-name') || '';
          const ctx = document.getElementById('tkContext');
          if (ctx) ctx.textContent = `New task for "${m.dataset.leadName}". The employee gets a reminder; Lohit can be notified for site visits & important tasks.`;
          // Default date = 2 days from now
          const d = new Date(); d.setDate(d.getDate() + 2);
          const dateEl = document.getElementById('tkDate');
          if (dateEl) dateEl.value = d.toISOString().slice(0, 10);
          m.hidden = false;
        }
      } else if (action === 'convert') {
        const m = document.getElementById('convertModal');
        if (m) {
          m.dataset.leadId = a.getAttribute('data-lead-id') || '';
          const dateEl = document.getElementById('cvDate');
          if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);
          m.hidden = false;
        }
      } else if (action === 'toggle-task') {
        const taskId = a.getAttribute('data-task-id');
        const leadId = a.getAttribute('data-lead-id');
        toggleTask(leadId, taskId);
      } else if (action === 'add-cp') {
        const m = document.getElementById('addCpModal');
        if (m) m.hidden = false;
      } else if (action === 'cp-approve') {
        const id = a.getAttribute('data-cp-id');
        const nm = a.getAttribute('data-cp-name') || 'Partner';
        saveCpStatus(id, 'Active');
        setCpRowActive(a.closest('tr'), id, nm);
        pushNotif(`Channel Partner ${nm} approved — now Active and selectable for leads`, 'emerald');
        showToast(`${nm} approved — now Active.`);
      } else if (action === 'cp-suspend') {
        const id = a.getAttribute('data-cp-id');
        const nm = a.getAttribute('data-cp-name') || 'Partner';
        saveCpStatus(id, 'Suspended');
        setCpRowSuspended(a.closest('tr'), id, nm);
        pushNotif(`Channel Partner ${nm} suspended — can no longer register leads`, 'amber');
        showToast(`${nm} suspended.`);
      } else if (action === 'clash-uphold') {
        resolveClash(a.getAttribute('data-clash-id'), 'keep_original', `Clash upheld — ${a.getAttribute('data-existing')} keeps the lead.`, a.closest('[data-clash-card]'));
      } else if (action === 'clash-transfer') {
        resolveClash(a.getAttribute('data-clash-id'), 'transfer_to_new', `Clash transferred — ${a.getAttribute('data-new')} takes the lead.`, a.closest('[data-clash-card]'));
      } else if (action === 'verify-same') {
        resolveClash(a.getAttribute('data-clash-id'), 'same_customer', 'Confirmed same customer — routed to clash queue for adjudication.', a.closest('[data-verify-card]'));
      } else if (action === 'verify-different') {
        resolveClash(a.getAttribute('data-clash-id'), 'different_customer', 'Confirmed different customer — released as a new lead (shares mobile).', a.closest('[data-verify-card]'));
      }
    });

    // Add Channel Partner submit
    const cpSubmit = document.getElementById('cpSubmit');
    if (cpSubmit) cpSubmit.addEventListener('click', () => {
      const name = document.getElementById('cpName').value.trim();
      if (!name) { showToast('Please enter a partner name', 'error'); return; }
      const firm = document.getElementById('cpFirm').value.trim() || '—';
      const phone = document.getElementById('cpPhone').value.trim() || '—';
      const email = document.getElementById('cpEmail').value.trim() || '—';
      const rera = document.getElementById('cpRera').value.trim() || '—';
      const area = document.getElementById('cpArea').value.trim() || '—';
      const initials = name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
      const colors = ['amber','emerald','violet','rose','sky','teal','slate'];
      const id = 'CP-' + (20000 + getNewCps().length);
      saveNewCp({ id, name, firm, phone, email, reraRegNo: rera, area, status: 'Pending', initials, color: colors[Math.floor(Math.random()*colors.length)], onboardedAt: new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}), approvedBy: null });
      const m = document.getElementById('addCpModal');
      if (m) m.hidden = true;
      ['cpName','cpFirm','cpPhone','cpEmail','cpRera','cpArea'].forEach(i => { const e = document.getElementById(i); if (e) e.value = ''; });
      pushNotif(`New Channel Partner onboarded: ${name} (${firm}) — Pending approval`, 'violet');
      showToast(`${name} added as Pending. Approve them to activate.`);
      setTimeout(() => location.reload(), 900);
    });

    // Add Project submit
    const apSubmit = document.getElementById('apSubmit');
    if (apSubmit) apSubmit.addEventListener('click', () => {
      const name = document.getElementById('apName').value.trim();
      if (!name) { showToast('Please enter a project name', 'error'); return; }
      const builder = document.getElementById('apBuilder').value.trim() || '—';
      const location = document.getElementById('apLocation').value.trim() || 'Bangalore';
      const priceCr = document.getElementById('apPrice').value.trim() || '—';
      const config = document.getElementById('apConfig').value.trim() || '—';
      const possession = document.getElementById('apPossession').value;
      const status = document.getElementById('apStatus').value;
      const rera = document.getElementById('apRera').value.trim() || '—';
      saveNewProject({ name, builder, location, priceCr, config, possession, status, reraRegNo: rera });
      const m = document.getElementById('addProjectModal');
      if (m) m.hidden = true;
      ['apName','apBuilder','apLocation','apPrice','apConfig','apRera'].forEach(i => { const e = document.getElementById(i); if (e) e.value = ''; });
      pushNotif(`New project added to catalog: ${name} (${builder}) · ${location}`, 'navy');
      showToast(`${name} added to the project catalog.`);
      setTimeout(() => location.reload(), 900);
    });

    // Stage advance submit
    const stSubmit = document.getElementById('stSubmit');
    if (stSubmit) stSubmit.addEventListener('click', () => {
      const modal = document.getElementById('stageModal');
      const leadId = modal.dataset.leadId;
      const stage = document.getElementById('stStage').value;
      const remarks = document.getElementById('stRemarks').value;
      saveOverride(leadId, { type: 'stage', stage, remarks });
      modal.hidden = true;
      showToast(`Stage advanced to "${stage}". Remarks saved on the audit trail.`);
      document.getElementById('stRemarks').value = '';
      setTimeout(() => location.reload(), 700);
    });

    // Follow-up submit
    const fuSubmit = document.getElementById('fuSubmit');
    if (fuSubmit) fuSubmit.addEventListener('click', () => {
      const modal = document.getElementById('followupModal');
      const leadId = modal.dataset.leadId;
      const date = document.getElementById('fuDate').value;
      const time = document.getElementById('fuTime').value;
      const type = document.getElementById('fuType').value;
      const reason = document.getElementById('fuReason').value;
      const taskId = 'T-' + Date.now();
      saveOverride(leadId, { type: 'followup', taskId, date, time, fuType: type, reason });
      modal.hidden = true;
      showToast(`Follow-up scheduled — ${type} on ${date} at ${time}. Reminder set for you & Lohit.`);
      document.getElementById('fuReason').value = '';
      setTimeout(() => location.reload(), 700);
    });

    // Task submit
    const tkSubmit = document.getElementById('tkSubmit');
    if (tkSubmit) tkSubmit.addEventListener('click', () => {
      const modal = document.getElementById('taskModal');
      const leadId = modal.dataset.leadId;
      const taskType = document.getElementById('tkType').value;
      const date = document.getElementById('tkDate').value;
      const priority = document.getElementById('tkPriority').value;
      const remarks = document.getElementById('tkRemarks').value;
      const notifyLead = document.getElementById('tkNotifyLead').checked;
      const taskId = 'T-' + Date.now();
      saveOverride(leadId, { type: 'task', taskId, taskType, date, priority, remarks, notifyLead });
      modal.hidden = true;
      const msg = notifyLead
        ? `Task "${taskType}" created for ${date}. You and Lohit notified.`
        : `Task "${taskType}" created for ${date}.`;
      showToast(msg);
      document.getElementById('tkRemarks').value = '';
      setTimeout(() => location.reload(), 700);
    });

    // Convert submit
    const cvSubmit = document.getElementById('cvSubmit');
    if (cvSubmit) cvSubmit.addEventListener('click', () => {
      const modal = document.getElementById('convertModal');
      const leadId = modal.dataset.leadId;
      const amount = document.getElementById('cvAmount').value || '—';
      const date = document.getElementById('cvDate').value;
      const token = document.getElementById('cvToken').value || '—';
      const remarks = document.getElementById('cvRemarks').value;
      saveOverride(leadId, { type: 'convert', amount, date, token, remarks, closed: true });
      modal.hidden = true;
      showToast(`🏆 Lead converted! Deal value ₹${amount}. All open tasks marked complete. Lohit notified.`);
      setTimeout(() => location.reload(), 1200);
    });

    // Add Lead submit
    const alSubmit = document.getElementById('alSubmit');
    if (alSubmit) alSubmit.addEventListener('click', () => {
      const firstName = document.getElementById('alFirstName').value.trim();
      const lastName = document.getElementById('alLastName').value.trim();
      const name = `${firstName} ${lastName}`.trim();
      if (!name) { showToast('Please enter a name', 'error'); return; }

      const phone = document.getElementById('alPhone').value.trim() || '—';
      const email = document.getElementById('alEmail').value.trim() || '—';
      const sourceSel = document.getElementById('alSource');
      const sourceName = sourceSel.options[sourceSel.selectedIndex].text;
      const project = document.getElementById('alProject').value;
      const config = document.getElementById('alConfig').value;
      const budget = document.getElementById('alBudget').value.trim() || '—';
      const possession = document.getElementById('alPossession').value;
      const ownerSel = document.getElementById('alOwner');
      const ownerId = ownerSel.value;
      const ownerName = ownerSel.options[ownerSel.selectedIndex].text;
      const validityDays = parseInt(document.getElementById('alValidity')?.value, 10) || 90;

      // Registrant (In-house employee / Channel Partner)
      const regType = (window.__alRegType || 'inhouse');
      let registrantType, registeredBy, registrantName;
      if (regType === 'cp') {
        const cpSel = document.getElementById('alRegCpPicker');
        registrantType = 'cp';
        registeredBy = cpSel?.value || '';
        registrantName = cpSel ? cpSel.options[cpSel.selectedIndex].text.split(' · ')[0] : registeredBy;
      } else {
        const inSel = document.getElementById('alRegInhousePicker');
        registrantType = 'inhouse';
        registeredBy = inSel?.value || ownerId;
        registrantName = inSel ? inSel.options[inSel.selectedIndex].text.split(' · ')[0] : ownerName;
      }

      const initials = name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
      const colors = ['amber','emerald','violet','rose','sky','teal','indigo'];
      const color = colors[Math.floor(Math.random() * colors.length)];

      // Source mapping for icon
      const sourceMap = {
        'Facebook':    { cls: 'source-fb',       icon: 'F' },
        'Instagram':   { cls: 'source-ig',       icon: 'I' },
        '99acres':     { cls: 'source-99',       icon: '9' },
        'MagicBricks': { cls: 'source-mb',       icon: 'M' },
        'Housing.com': { cls: 'source-housing',  icon: 'H' },
        'Website':     { cls: 'source-website',  icon: 'W' },
        'Walk-in':     { cls: 'source-walkin',   icon: 'V' },
        'Referral':    { cls: 'source-referral', icon: 'R' },
      };
      const sourceInfo = sourceMap[sourceName] || { cls: 'source-website', icon: '·' };

      const today = new Date();
      const validUntil = new Date(today); validUntil.setDate(validUntil.getDate() + validityDays);

      const newLead = {
        id: nextLeadId(),
        name, initials, color,
        phone, email,
        source: sourceName, sourceCls: sourceInfo.cls, sourceIcon: sourceInfo.icon,
        project, config, budget, possession,
        currentOwnerId: ownerId,
        originalOwnerId: ownerId,
        ownerName,
        isClosed: false,
        rotations: 0,
        isStale: false,
        daysSinceContact: 0,
        statusLabel: 'New',
        statusPill: 'pill-emerald',
        createdAt: today.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        isNew: true,
        // registrant + claim
        registrantType, registeredBy, registrantName,
        registeredAt: today.toISOString().slice(0, 10),
        validityDays,
        claimValidUntil: validUntil.toISOString().slice(0, 10),
        clashStatus: null,
        relatedTo: [],
      };

      const modal = document.getElementById('addLeadModal');

      // ---- Run clash detection (spec §4) ----
      const result = detectClash(newLead);

      const clearInputs = () => ['alFirstName','alLastName','alPhone','alEmail','alBudget'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      const finalizeAndGo = (lead, msg) => {
        saveNewLead(lead);
        modal.hidden = true;
        clearInputs();
        showToast(msg);
        setTimeout(() => { window.location.href = `leads.html?new=${lead.id}`; }, 1000);
      };

      if (result.outcome === 'PENDING_VERIFICATION') {
        // BLOCK — hold, do NOT create yet. Show verify dialog.
        const vm = document.getElementById('verifyModal');
        const msgEl = document.getElementById('verifyMsg');
        if (msgEl) msgEl.textContent = `This mobile is already registered for ${newLead.project} under a different name: ${result.existing.name}. Same customer?`;
        // Stash the pending lead + existing for the verify handlers
        window.__pendingLead = newLead;
        window.__pendingExisting = result.existing;
        modal.hidden = true;
        if (vm) vm.hidden = false;
        return;
      }

      if (result.outcome === 'CLASH') {
        newLead.clashStatus = 'under_review';
        newLead.relatedTo = [result.existing.id];
        // notify both sides (simulated)
        pushNotif(`CLASH: ${registrantName} is registering ${newLead.name} for ${newLead.project} — same mobile & name as an existing claim`, 'red');
        pushNotif(`Under review — ${newLead.name} may clash with ${result.existing.registrantName || 'an existing registration'}`, 'amber');
        finalizeAndGo(newLead, `⚠ Possible clash — "${name}" created under review. Lohit notified to adjudicate.`);
        return;
      }

      if (result.outcome === 'AWARENESS') {
        newLead.relatedTo = result.related.map(l => l.id);
        const otherProjects = [...new Set(result.related.map(l => l.project))].join(', ');
        pushNotif(`AWARENESS: ${registrantName} is registering ${newLead.name} (already in our data for ${otherProjects}) for a different project ${newLead.project}`, 'navy');
        finalizeAndGo(newLead, `Lead "${name}" added (awareness flag — same customer exists for another project). Existing owner notified.`);
        return;
      }

      // CLEAN
      finalizeAndGo(newLead, `Lead "${name}" added and assigned to ${ownerName}. Opening leads list…`);
    });

    // ---- Registrant toggle inside Add Lead modal ----
    function setAlRegType(type) {
      window.__alRegType = type;
      const inBtn = document.getElementById('alRegInhouse');
      const cpBtn = document.getElementById('alRegCp');
      const inPick = document.getElementById('alRegInhousePicker');
      const cpPick = document.getElementById('alRegCpPicker');
      const label = document.getElementById('alRegPickerLabel');
      if (inBtn) inBtn.classList.toggle('is-active', type === 'inhouse');
      if (cpBtn) cpBtn.classList.toggle('is-active', type === 'cp');
      if (inPick) inPick.hidden = (type !== 'inhouse');
      if (cpPick) cpPick.hidden = (type !== 'cp');
      if (label) label.textContent = type === 'cp' ? 'Channel Partner' : 'Employee';
    }
    const alInBtn = document.getElementById('alRegInhouse');
    const alCpBtn = document.getElementById('alRegCp');
    if (alInBtn) alInBtn.addEventListener('click', () => setAlRegType('inhouse'));
    if (alCpBtn) alCpBtn.addEventListener('click', () => setAlRegType('cp'));

    // ---- Verify modal (BLOCK resolution) ----
    const verifySame = document.getElementById('verifySame');
    if (verifySame) verifySame.addEventListener('click', () => {
      const vm = document.getElementById('verifyModal');
      const lead = window.__pendingLead; const existing = window.__pendingExisting;
      if (!lead) { if (vm) vm.hidden = true; return; }
      // Same customer → route into CLASH flow
      lead.clashStatus = 'under_review';
      lead.relatedTo = existing ? [existing.id] : [];
      pushNotif(`CLASH (post-verification): ${lead.registrantName} confirmed same customer as ${existing?.name || 'existing lead'} for ${lead.project}`, 'red');
      pushNotif(`Under review — ${lead.name} routed to clash queue`, 'amber');
      saveNewLead(lead);
      if (vm) vm.hidden = true;
      showToast(`Confirmed same customer — "${lead.name}" created under review. Lohit will adjudicate.`);
      setTimeout(() => { window.location.href = `leads.html?new=${lead.id}`; }, 1000);
    });
    const verifyDifferent = document.getElementById('verifyDifferent');
    if (verifyDifferent) verifyDifferent.addEventListener('click', () => {
      const vm = document.getElementById('verifyModal');
      const lead = window.__pendingLead; const existing = window.__pendingExisting;
      if (!lead) { if (vm) vm.hidden = true; return; }
      // Different customer → create as new, linked "shares mobile with"
      lead.relatedTo = existing ? [existing.id] : [];
      lead.sharesMobileWith = existing ? existing.name : null;
      pushNotif(`New lead ${lead.name} created — shares mobile with ${existing?.name || 'an existing lead'} (different customer, no clash)`, 'navy');
      saveNewLead(lead);
      if (vm) vm.hidden = true;
      showToast(`Created "${lead.name}" as a new lead (different customer — shares mobile with ${existing?.name || 'existing'}).`);
      setTimeout(() => { window.location.href = `leads.html?new=${lead.id}`; }, 1000);
    });

    // Add Employee submit
    const aeSubmit = document.getElementById('aeSubmit');
    if (aeSubmit) aeSubmit.addEventListener('click', () => {
      const name = document.getElementById('aeName').value.trim();
      if (!name) { showToast('Please enter a name', 'error'); return; }
      const modal = document.getElementById('addEmployeeModal');
      modal.hidden = true;
      showToast(`Invitation sent to ${name}. They will receive a login email.`);
      ['aeName','aeEmail','aePhone'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    });

    // Configure Rules submit
    const crSubmit = document.getElementById('crSubmit');
    if (crSubmit) crSubmit.addEventListener('click', () => {
      const trigger = document.getElementById('crTrigger').value;
      const modal = document.getElementById('configRulesModal');
      modal.hidden = true;
      showToast(`Rotation rules updated — trigger after ${trigger}.`);
    });

    // Rotate single lead submit
    const rlSubmit = document.getElementById('rlSubmit');
    if (rlSubmit) rlSubmit.addEventListener('click', () => {
      const modal = document.getElementById('rotateLeadModal');
      const leadId = modal.dataset.leadId;
      const leadName = modal.dataset.leadName;
      const newOwnerId = document.getElementById('rlEmployee').value;
      const reason = document.getElementById('rlReason').value;
      const note = document.getElementById('rlNote').value;
      const newOwner = window.MOCK_DATA.employees.find(e => e.id === newOwnerId);
      saveOverride(leadId, { type: 'rotation', newOwnerId, reason, note });
      modal.hidden = true;
      showToast(`${leadName} rotated to ${newOwner?.name || 'employee'}. Lohit has visibility.`);
      // Remove the row from rotation queue
      const row = document.querySelector(`[data-action="rotate-lead"][data-lead-id="${leadId}"]`)?.closest('tr');
      if (row) {
        row.style.transition = 'opacity .4s';
        row.style.opacity = '0';
        setTimeout(() => row.remove(), 450);
      }
      // Clear note for next use
      const noteEl = document.getElementById('rlNote'); if (noteEl) noteEl.value = '';
    });

    // Rotate all submit
    const raSubmit = document.getElementById('raSubmit');
    if (raSubmit) raSubmit.addEventListener('click', () => {
      const modal = document.getElementById('rotateAllModal');
      const reason = document.getElementById('raReason').value;
      const rows = document.querySelectorAll('[data-action="rotate-lead"]');
      let count = 0;
      rows.forEach(btn => {
        const leadId = btn.getAttribute('data-lead-id');
        const newOwnerId = btn.getAttribute('data-suggested-id');
        saveOverride(leadId, { type: 'rotation', newOwnerId, reason, note: 'Bulk manual rotation' });
        const row = btn.closest('tr');
        if (row) {
          row.style.transition = 'opacity .4s';
          row.style.opacity = '0';
          setTimeout(() => row.remove(), 450);
        }
        count++;
      });
      modal.hidden = true;
      showToast(`${count} leads rotated. Each handoff is now in the audit trail.`);
    });

    // Feedback submit
    const fbSubmit = document.getElementById('fbSubmit');
    if (fbSubmit) fbSubmit.addEventListener('click', () => {
      const modal = document.getElementById('feedbackModal');
      const leadId = modal.dataset.leadId;
      const outcome = document.getElementById('fbOutcome').value;
      const note = document.getElementById('fbNote').value;
      saveOverride(leadId, { type: 'feedback', outcome, note });
      modal.hidden = true;
      showToast('Feedback saved. Lohit can see this on the audit trail.');
      setTimeout(() => location.reload(), 700);
    });

    // Transfer submit
    const trSubmit = document.getElementById('trSubmit');
    if (trSubmit) trSubmit.addEventListener('click', () => {
      const modal = document.getElementById('transferModal');
      const leadId = modal.dataset.leadId;
      const newOwnerId = document.getElementById('trEmployee').value;
      const reason = document.getElementById('trReason').value;
      const note = document.getElementById('trNote').value;
      saveOverride(leadId, { type: 'transfer', newOwnerId, reason, note });
      modal.hidden = true;
      const newOwner = window.MOCK_DATA.employees.find(e => e.id === newOwnerId);
      showToast(`Lead transferred to ${newOwner?.name || 'employee'}.`);
      setTimeout(() => location.reload(), 800);
    });

    // Close submit
    const clSubmit = document.getElementById('clSubmit');
    if (clSubmit) clSubmit.addEventListener('click', () => {
      const modal = document.getElementById('closeModal');
      const leadId = modal.dataset.leadId;
      const reason = document.getElementById('clReason').value;
      const note = document.getElementById('clNote').value;
      saveOverride(leadId, { type: 'close', reason, note, closed: true });
      modal.hidden = true;
      showToast('Lead closed. Lohit can review the closure reason.');
      setTimeout(() => location.reload(), 800);
    });
  }

  // ---------- Toggle task complete ----------
  function toggleTask(leadId, taskId) {
    const all = getOverrides();
    if (!all[leadId]) return;
    const ev = all[leadId].events.find(e => e.taskId === taskId);
    if (!ev) return;
    ev.completed = !ev.completed;
    localStorage.setItem(LS_LEADS, JSON.stringify(all));
    location.reload();
  }

  // ---------- Apply overrides from localStorage onto the rendered page ----------
  function applyOverridesToDetail() {
    const params = new URLSearchParams(location.search);
    const leadId = params.get('id');
    if (!leadId) return;
    const overrides = getOverrides();
    const data = overrides[leadId];
    if (!data || !data.events) return;

    const timeline = document.querySelector(`[data-timeline][data-lead-id="${leadId}"]`);
    const tasksList = document.querySelector(`[data-tasks-card][data-lead-id="${leadId}"] [data-tasks-list]`);

    // ---- Build TIMELINE entries ----
    if (timeline) {
      data.events.slice().reverse().forEach(ev => {
        const item = el('div', { class: 'timeline-item' });
        let dotCls = 'is-success';
        if (ev.type === 'close') dotCls = 'is-close';
        else if (ev.type === 'transfer' || ev.type === 'rotation') dotCls = 'is-rotation';
        else if (ev.type === 'stage') dotCls = 'is-success';
        else if (ev.type === 'followup' || ev.type === 'task') dotCls = '';
        else if (ev.type === 'convert') dotCls = 'is-success';
        item.appendChild(el('div', { class: `timeline-dot ${dotCls}` }));
        const time = new Date(ev.when).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: 'numeric' });
        item.appendChild(el('div', { class: 'timeline-time', text: `${time} · Just now` }));
        const body = el('div', { class: 'timeline-body' });
        let summary = '';
        if (ev.type === 'feedback') summary = `Remarks added — ${ev.outcome}`;
        else if (ev.type === 'transfer') {
          const newOwner = window.MOCK_DATA.employees.find(e => e.id === ev.newOwnerId);
          summary = `Transferred to ${newOwner?.name || 'employee'} — ${ev.reason}`;
        } else if (ev.type === 'rotation') {
          const newOwner = window.MOCK_DATA.employees.find(e => e.id === ev.newOwnerId);
          summary = `Manually rotated to ${newOwner?.name || 'employee'} — ${ev.reason}`;
        } else if (ev.type === 'close') summary = `Lead closed — ${ev.reason}`;
        else if (ev.type === 'stage') summary = `Stage advanced to "${ev.stage}"`;
        else if (ev.type === 'followup') summary = `📅 Follow-up scheduled — ${ev.fuType} on ${ev.date} at ${ev.time}`;
        else if (ev.type === 'task') summary = `✓ Task created — ${ev.taskType} (due ${ev.date}${ev.notifyLead ? ', Lohit notified' : ''})`;
        else if (ev.type === 'convert') summary = `🏆 Lead converted — ₹${ev.amount} deal · token ₹${ev.token}`;
        body.appendChild(el('strong', { text: summary }));
        const noteText = ev.note || ev.remarks || ev.reason;
        if (noteText && ev.type !== 'transfer' && ev.type !== 'rotation' && ev.type !== 'close') {
          body.appendChild(el('br'));
          const span = el('span', { style: 'color:var(--color-slate-600);' });
          span.appendChild(document.createTextNode(`Customer said: ${noteText}`));
          body.appendChild(span);
        }
        item.appendChild(body);
        timeline.insertBefore(item, timeline.firstChild);
      });
    }

    // ---- Build TASKS panel ----
    if (tasksList) {
      const tasks = data.events.filter(e => e.type === 'task' || e.type === 'followup');
      if (tasks.length > 0) {
        // Hide the empty state
        const empty = tasksList.querySelector('[data-empty-tasks]');
        if (empty) empty.remove();

        // If converted, mark all as auto-complete
        const isConverted = data.events.some(e => e.type === 'convert');

        tasks.forEach(t => {
          const isComplete = t.completed || isConverted;
          const card = el('div', { style: `padding:10px 0;border-bottom:1px solid var(--color-slate-100);display:flex;gap:10px;align-items:flex-start;${isComplete ? 'opacity:.55;' : ''}` });

          // Checkbox button
          const checkBtn = el('button', {
            'data-action': 'toggle-task',
            'data-task-id': t.taskId,
            'data-lead-id': leadId,
            style: `width:18px;height:18px;border-radius:4px;border:2px solid ${isComplete ? 'var(--color-emerald-500)' : 'var(--color-slate-300)'};background:${isComplete ? 'var(--color-emerald-500)' : 'transparent'};cursor:pointer;flex-shrink:0;margin-top:2px;color:#fff;font-size:11px;line-height:1;text-align:center;`,
            text: isComplete ? '✓' : '',
          });
          card.appendChild(checkBtn);

          const inner = el('div', { style: 'flex:1;min-width:0;' });
          const title = el('div', { class: 'text-strong', style: `font-size:12.5px;${isComplete ? 'text-decoration:line-through;' : ''}` });
          if (t.type === 'task') title.textContent = `${t.taskType}`;
          else title.textContent = `📅 Follow-up: ${t.fuType}`;
          inner.appendChild(title);

          const meta = el('div', { class: 'text-xs muted', style: 'margin-top:2px;' });
          if (t.type === 'task') {
            const priority = t.priority || 'Medium';
            meta.textContent = `Due ${t.date} · ${priority} priority`;
            if (t.notifyLead) {
              meta.textContent += ' · Lohit notified';
            }
          } else {
            meta.textContent = `${t.date} at ${t.time}`;
          }
          inner.appendChild(meta);

          const remarksText = t.remarks || t.reason;
          if (remarksText) {
            const note = el('div', { style: 'font-size:11.5px;color:var(--color-slate-600);margin-top:5px;padding:5px 8px;background:var(--color-amber-50);border-left:2px solid var(--color-amber-500);border-radius:0 3px 3px 0;line-height:1.4;' });
            note.textContent = `"${remarksText}"`;
            inner.appendChild(note);
          }

          card.appendChild(inner);
          tasksList.appendChild(card);
        });

        if (isConverted) {
          const banner = el('div', { style: 'margin-top:12px;padding:10px 12px;background:var(--color-emerald-100);border-radius:6px;font-size:11.5px;color:var(--color-emerald-600);font-weight:600;text-align:center;' });
          banner.textContent = '✓ All tasks auto-completed on conversion';
          tasksList.appendChild(banner);
        }
      }
    }

    // ---- Show converted banner on top of detail page ----
    const convertEv = data.events.find(e => e.type === 'convert');
    if (convertEv) {
      const hero = document.querySelector('.lead-hero');
      if (hero && !document.getElementById('convertBanner')) {
        const banner = el('div', {
          id: 'convertBanner',
          style: 'background:linear-gradient(135deg, var(--color-emerald-600), var(--color-emerald-500));color:#fff;padding:14px 22px;border-radius:var(--radius-lg);margin-bottom:20px;display:flex;align-items:center;gap:14px;'
        });
        banner.appendChild(el('div', { style: 'font-size:32px;', text: '🏆' }));
        const txt = el('div', { style: 'flex:1;' });
        txt.appendChild(el('div', { style: 'font-family:var(--font-serif);font-size:18px;font-weight:600;', text: 'Lead Converted to Deal' }));
        txt.appendChild(el('div', { style: 'font-size:13px;color:rgba(255,255,255,0.85);margin-top:2px;', text: `Booking value: ₹${convertEv.amount} · Token ₹${convertEv.token} · ${convertEv.date}` }));
        banner.appendChild(txt);
        hero.parentNode.insertBefore(banner, hero);
      }
    }
  }

  // ---------- Channel Partners page ----------
  function statusPillNode(status) {
    const map = { Active: 'pill-emerald', Approved: 'pill-navy', Pending: 'pill-amber', Suspended: 'pill-slate' };
    const span = el('span', { class: `pill ${map[status] || 'pill-slate'}` });
    span.appendChild(el('span', { class: 'pill-dot' }));
    span.appendChild(document.createTextNode(status));
    return span;
  }
  function setCpRowActive(row, id, name) {
    if (!row) return;
    const statusCell = row.querySelector('[data-cp-status]');
    if (statusCell) { statusCell.replaceChildren(); statusCell.appendChild(statusPillNode('Active')); }
    const actionsCell = row.querySelector('[data-cp-actions]');
    if (actionsCell) {
      actionsCell.replaceChildren();
      actionsCell.appendChild(el('button', { class: 'btn btn-ghost btn-sm', 'data-action': 'cp-suspend', 'data-cp-id': id, 'data-cp-name': name, text: 'Suspend' }));
    }
  }
  function setCpRowSuspended(row, id, name) {
    if (!row) return;
    const statusCell = row.querySelector('[data-cp-status]');
    if (statusCell) { statusCell.replaceChildren(); statusCell.appendChild(statusPillNode('Suspended')); }
    const actionsCell = row.querySelector('[data-cp-actions]');
    if (actionsCell) {
      actionsCell.replaceChildren();
      actionsCell.appendChild(el('button', { class: 'btn btn-accent btn-sm', 'data-action': 'cp-approve', 'data-cp-id': id, 'data-cp-name': name, text: 'Reinstate' }));
    }
  }
  function setupChannelPartners() {
    if (document.body.dataset.page !== 'channel-partners') return;
    // Apply saved status overrides to seeded rows
    const ov = getCpOverrides();
    document.querySelectorAll('[data-cp-row]').forEach(row => {
      const id = row.getAttribute('data-cp-id');
      const o = ov[id];
      if (!o) return;
      const name = row.querySelector('.cell-strong')?.textContent || 'Partner';
      if (o.status === 'Active') setCpRowActive(row, id, name);
      else if (o.status === 'Suspended') setCpRowSuspended(row, id, name);
    });
    // Inject user-created CPs (Pending)
    const tbody = document.querySelector('[data-cp-body]');
    if (!tbody) return;
    getNewCps().forEach(c => {
      const status = ov[c.id]?.status || c.status;
      const tr = el('tr', { 'data-cp-row': '', 'data-cp-id': c.id });
      const tdName = el('td');
      const cell = el('div', { class: 'lead-name-cell' });
      cell.appendChild(avatarEl(c.initials, c.color, 'md'));
      const inner = el('div');
      const strong = el('div', { class: 'cell-strong' });
      strong.appendChild(document.createTextNode(c.name));
      const np = el('span', { class: 'pill pill-emerald', style: 'margin-left:6px;font-size:10px;', text: 'NEW' });
      strong.appendChild(np);
      inner.appendChild(strong);
      inner.appendChild(el('div', { class: 'lead-meta', text: `${c.id} · ${c.email}` }));
      cell.appendChild(inner);
      tdName.appendChild(cell);
      tr.appendChild(tdName);
      tr.appendChild(el('td', { class: 'cell-strong', style: 'font-size:12.5px;', text: c.firm }));
      tr.appendChild(el('td', { style: 'font-size:12.5px;color:var(--color-slate-700);', text: c.phone }));
      tr.appendChild(el('td', { style: 'font-size:11.5px;color:var(--color-slate-500);', text: c.reraRegNo }));
      tr.appendChild(el('td', { style: 'font-size:12.5px;color:var(--color-slate-700);', text: c.area }));
      const tdStatus = el('td', { 'data-cp-status': '' }); tdStatus.appendChild(statusPillNode(status)); tr.appendChild(tdStatus);
      const tdAct = el('td', { 'data-cp-actions': '' });
      if (status === 'Active') tdAct.appendChild(el('button', { class: 'btn btn-ghost btn-sm', 'data-action': 'cp-suspend', 'data-cp-id': c.id, 'data-cp-name': c.name, text: 'Suspend' }));
      else tdAct.appendChild(el('button', { class: 'btn btn-accent btn-sm', 'data-action': 'cp-approve', 'data-cp-id': c.id, 'data-cp-name': c.name, text: status === 'Suspended' ? 'Reinstate' : 'Approve' }));
      tr.appendChild(tdAct);
      tbody.insertBefore(tr, tbody.firstChild);
    });
  }

  // ---------- Projects page ----------
  function setupProjects() {
    if (document.body.dataset.page !== 'projects') return;
    const grid = document.querySelector('[data-projects-grid]');
    if (!grid) return;
    getNewProjects().forEach(p => {
      const types = Array.isArray(p.types) ? p.types : [];
      const card = el('a', {
        class: 'emp-card', href: `leads.html?project=${encodeURIComponent(p.name)}`, style: 'color:inherit;text-decoration:none;',
        'data-project-card': '',
        'data-name': String(p.name || '').toLowerCase(),
        'data-zone': p.zone || '',
        'data-location': p.location || '',
        'data-price': String(p.priceCr ?? ''),
        'data-types': types.join('|'),
      });

      const top = el('div', { style: 'display:flex;align-items:flex-start;gap:12px;' });
      top.appendChild(el('div', { style: 'width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,var(--color-navy-700),var(--color-navy-900));display:grid;place-items:center;color:#fff;font-family:var(--font-serif);font-size:18px;font-weight:600;', text: '⌂' }));
      const info = el('div', { style: 'flex:1;min-width:0;' });
      const nameRow = el('div', { class: 'emp-card-name', style: 'font-size:14px;' });
      nameRow.appendChild(document.createTextNode(p.name));
      nameRow.appendChild(el('span', { class: 'pill pill-emerald', style: 'margin-left:6px;font-size:10px;', text: 'NEW' }));
      info.appendChild(nameRow);
      info.appendChild(el('div', { class: 'text-xs muted', style: 'margin-top:2px;', text: `${p.builder} · ${p.location}` }));
      top.appendChild(info);
      card.appendChild(top);

      const row1 = el('div', { style: 'display:flex;justify-content:space-between;font-size:11px;color:var(--color-slate-500);padding-top:10px;border-top:1px solid var(--color-slate-100);' });
      row1.appendChild(el('span', { text: 'Avg ticket' }));
      row1.appendChild(el('span', { class: 'text-strong', style: 'font-family:var(--font-serif);font-size:14px;color:var(--color-amber-700);', text: `₹${p.priceCr} Cr` }));
      card.appendChild(row1);

      const row2 = el('div', { style: 'display:flex;justify-content:space-between;font-size:11px;color:var(--color-slate-500);' });
      row2.appendChild(el('span', { text: 'Status' }));
      row2.appendChild(el('span', { class: 'text-strong', text: p.status || 'Ongoing' }));
      card.appendChild(row2);

      grid.insertBefore(card, grid.firstChild);
    });
  }

  // ---------- Clashes page ----------
  function setupClashTabs() {
    if (document.body.dataset.page !== 'clashes') return;
    const tabBar = document.querySelector('[data-clash-tabs]');
    if (!tabBar) return;
    const tabs = tabBar.querySelectorAll('.tab');
    function show(which) {
      tabs.forEach(t => t.classList.toggle('is-active', t.getAttribute('data-clash-tab') === which));
      document.querySelectorAll('[data-clash-panel]').forEach(p => { p.hidden = (p.getAttribute('data-clash-panel') !== which); });
    }
    tabs.forEach(t => t.addEventListener('click', () => show(t.getAttribute('data-clash-tab'))));
    // honor ?tab=verification
    const params = new URLSearchParams(location.search);
    if (params.get('tab') === 'verification') show('verification');
    // Apply previously-resolved overrides (hide resolved cards)
    const ov = getClashOverrides();
    Object.keys(ov).forEach(id => {
      const card = document.querySelector(`[data-clash-id="${id}"]`);
      if (card && ov[id].status === 'resolved') markCardResolved(card, ov[id].resolution);
    });
  }
  function markCardResolved(card, resolution) {
    const labelMap = {
      keep_original: 'Resolved — original kept',
      transfer_to_new: 'Resolved — transferred',
      same_customer: 'Resolved — same customer (clash)',
      different_customer: 'Resolved — new lead created',
    };
    // Replace action buttons with a resolved pill
    const actionsRow = Array.from(card.querySelectorAll('div')).find(d => d.querySelector('[data-action^="clash-"], [data-action^="verify-"]'));
    if (actionsRow) {
      actionsRow.replaceChildren();
      const pill = el('span', { class: 'pill pill-emerald' });
      pill.appendChild(el('span', { class: 'pill-dot' }));
      pill.appendChild(document.createTextNode(labelMap[resolution] || 'Resolved'));
      actionsRow.appendChild(pill);
    }
    card.style.opacity = '0.7';
  }
  function resolveClash(id, resolution, toastMsg, card) {
    const user = getCurrentUser();
    saveClashResolution(id, resolution, user?.name || 'Lohit');
    if (card) markCardResolved(card, resolution);
    pushNotif(`Clash ${id} resolved by ${user?.name || 'Lohit'} — ${resolution.replace(/_/g, ' ')}. Both sides notified.`, 'emerald');
    showToast(toastMsg);
  }

  // ========================================================================
  // CSV IMPORT / EXPORT  (offline · opens in Excel · no backend, no library)
  // ========================================================================

  // New employees imported from CSV persist here (mirrors new-projects / new-cps stores).
  const LS_NEW_EMPLOYEES = 'dwellinn_newEmployees_v1';
  function getNewEmployees() { try { return JSON.parse(localStorage.getItem(LS_NEW_EMPLOYEES) || '[]'); } catch { return []; } }
  function saveNewEmployee(emp) { const all = getNewEmployees(); all.unshift(emp); localStorage.setItem(LS_NEW_EMPLOYEES, JSON.stringify(all)); }

  // ---- serialise ----
  function csvCell(v) {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows, columns) {
    const header = columns.map(c => csvCell(c.header)).join(',');
    const body = rows.map(r => columns.map(c => csvCell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(',')).join('\n');
    return header + '\n' + body;
  }
  function downloadCSV(filename, csv) {
    // Prepend a UTF-8 BOM so Excel reads ₹ and accents correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---- parse (RFC-4180-ish: handles quotes, commas & newlines inside quotes) ----
  function parseCSV(text) {
    const rows = []; let row = [], field = '', inQuotes = false;
    text = String(text).replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows[0].map(h => h.trim());
    return rows.slice(1)
      .filter(r => r.some(c => c.trim() !== ''))
      .map(r => { const o = {}; headers.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); }); return o; });
  }
  function pickCSV(cb) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,text/csv';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { try { cb(parseCSV(String(reader.result))); } catch (err) { showToast('Could not read CSV: ' + err.message, 'error'); } };
      reader.readAsText(f);
    });
    inp.click();
  }
  // Read a value by any of several candidate header names (case-insensitive).
  function col(obj, ...names) {
    const keys = Object.keys(obj);
    for (const n of names) { const k = keys.find(k => k.toLowerCase() === n.toLowerCase()); if (k && obj[k] !== '') return obj[k]; }
    return '';
  }

  // ---- live data collectors (baked MOCK_DATA merged with localStorage additions) ----
  function liveLeads()     { return [...getNewLeads(), ...(window.MOCK_DATA?.leads || [])]; }
  function liveProjects()  { return [...getNewProjects(), ...(window.MOCK_DATA?.projects || [])]; }
  function liveEmployees() { return [...(window.MOCK_DATA?.owner ? [window.MOCK_DATA.owner] : []), ...(window.MOCK_DATA?.employees || []), ...getNewEmployees()]; }
  function liveCps() {
    const ov = getCpOverrides();
    const base = (window.MOCK_DATA?.channelPartners || []).map(c => ({ ...c, status: ov[c.id]?.status || c.status }));
    return [...getNewCps(), ...base];
  }
  function ownerNameOf(l) { return l.ownerName || getOwnerName(l.currentOwnerId) || l.currentOwnerId || ''; }

  // ---- exporters ----
  function exportProjects() {
    const rows = liveProjects();
    downloadCSV('dwellinn-projects.csv', toCSV(rows, [
      { header: 'Project',     key: 'name' },
      { header: 'Location',    key: 'location' },
      { header: 'Zone',        get: p => p.zone || '' },
      { header: 'Price (Cr)',  get: p => p.priceCr ?? '' },
      { header: 'Types',       get: p => Array.isArray(p.types) ? p.types.join(' / ') : (p.types || '') },
      { header: 'Builder',     get: p => p.builder || '' },
      { header: 'Active Leads',get: p => liveLeads().filter(l => l.project === p.name).length },
    ]));
    showToast(`Exported ${rows.length} projects`);
  }
  function exportEmployees() {
    const rows = liveEmployees();
    downloadCSV('dwellinn-employees.csv', toCSV(rows, [
      { header: 'Emp ID',   get: e => e.employeeId || e.id || '' },
      { header: 'Name',     key: 'name' },
      { header: 'Role',     get: e => e.roleName || '' },
      { header: 'Email',    get: e => e.email || '' },
      { header: 'Phone',    get: e => e.phone || '' },
      { header: 'Department', get: e => e.department || '' },
      { header: 'Joined',   get: e => e.joinedAt || '' },
    ]));
    showToast(`Exported ${rows.length} employees`);
  }
  function exportLeads() {
    const rows = liveLeads();
    downloadCSV('dwellinn-leads.csv', toCSV(rows, [
      { header: 'Lead ID',   get: l => l.id || '' },
      { header: 'Name',      key: 'name' },
      { header: 'Phone',     get: l => l.phone || '' },
      { header: 'Email',     get: l => l.email || '' },
      { header: 'Project',   get: l => l.project || '' },
      { header: 'Config',    get: l => l.config || '' },
      { header: 'Budget',    get: l => l.budget || '' },
      { header: 'Source',    get: l => l.source || '' },
      { header: 'Current Owner', get: ownerNameOf },
      { header: 'Status',    get: l => l.statusLabel || (l.isClosed ? 'Closed' : 'Open') },
      { header: 'Rotations', get: l => l.rotations ?? 0 },
    ]));
    showToast(`Exported ${rows.length} leads`);
  }
  function exportOwnership() {
    const rows = liveLeads();
    downloadCSV('dwellinn-lead-ownership.csv', toCSV(rows, [
      { header: 'Lead ID',        get: l => l.id || '' },
      { header: 'Lead Name',      key: 'name' },
      { header: 'Phone',          get: l => l.phone || '' },
      { header: 'Project',        get: l => l.project || '' },
      { header: 'Current Owner',  get: ownerNameOf },
      { header: 'Original Owner', get: l => getOwnerName(l.originalOwnerId) || l.originalOwnerId || '' },
      { header: 'Registered By',  get: l => l.registrantName || '' },
      { header: 'Registrant Type',get: l => l.registrantType === 'cp' ? 'Channel Partner' : 'In-house' },
      { header: 'Registered On',  get: l => l.registeredAt || '' },
      { header: 'Claim Valid Until', get: l => l.claimValidUntil || '' },
      { header: 'Rotations',      get: l => l.rotations ?? 0 },
    ]));
    showToast(`Exported ownership for ${rows.length} leads`);
  }
  function exportRotation() {
    // Only leads that have moved through the rotation engine (or are stale).
    const rows = liveLeads().filter(l => (l.rotations || 0) > 0 || l.isStale);
    downloadCSV('dwellinn-lead-rotation.csv', toCSV(rows, [
      { header: 'Lead ID',        get: l => l.id || '' },
      { header: 'Lead Name',      key: 'name' },
      { header: 'Project',        get: l => l.project || '' },
      { header: 'Current Owner',  get: ownerNameOf },
      { header: 'Original Owner', get: l => getOwnerName(l.originalOwnerId) || l.originalOwnerId || '' },
      { header: 'Rotations',      get: l => l.rotations ?? 0 },
      { header: 'Stale',          get: l => l.isStale ? 'Yes' : 'No' },
      { header: 'Days Since Contact', get: l => l.daysSinceContact ?? '' },
      { header: 'Status',         get: l => l.isClosed ? 'Closed' : (l.statusLabel || 'In rotation') },
    ]));
    showToast(`Exported ${rows.length} rotation records`);
  }
  function exportCps() {
    const rows = liveCps();
    downloadCSV('dwellinn-channel-partners.csv', toCSV(rows, [
      { header: 'CP ID',   get: c => c.id || '' },
      { header: 'Name',    key: 'name' },
      { header: 'Firm',    get: c => c.firm || '' },
      { header: 'Phone',   get: c => c.phone || '' },
      { header: 'Email',   get: c => c.email || '' },
      { header: 'RERA Reg No', get: c => c.reraRegNo || '' },
      { header: 'Area',    get: c => c.area || '' },
      { header: 'Status',  get: c => c.status || '' },
      { header: 'Onboarded', get: c => c.onboardedAt || '' },
    ]));
    showToast(`Exported ${rows.length} channel partners`);
  }

  // ---- importers (additive: append new rows, skip duplicates) ----
  function importProjects(records) {
    const existing = new Set(liveProjects().map(p => String(p.name).toLowerCase()));
    let added = 0, skipped = 0;
    records.forEach(r => {
      const name = col(r, 'Project', 'Name'); if (!name) { skipped++; return; }
      if (existing.has(name.toLowerCase())) { skipped++; return; }
      const typesRaw = col(r, 'Types', 'Type', 'Requirement', 'Configuration');
      const types = typesRaw ? typesRaw.split(/[\/|,]/).map(s => s.trim()).filter(Boolean) : [];
      const priceRaw = col(r, 'Price (Cr)', 'Price', 'PriceCr', 'Price Cr');
      saveNewProject({
        name,
        location: col(r, 'Location', 'Area') || '—',
        zone: col(r, 'Zone', 'Direction') || '',
        priceCr: parseFloat(String(priceRaw).replace(/[^\d.]/g, '')) || 0,
        types,
        builder: col(r, 'Builder', 'Developer') || 'Imported',
        status: col(r, 'Status') || 'Ongoing',
      });
      existing.add(name.toLowerCase()); added++;
    });
    showToast(`Imported ${added} projects${skipped ? `, skipped ${skipped}` : ''}`);
    if (added) setTimeout(() => location.reload(), 700);
  }
  function importEmployees(records) {
    const existing = new Set(liveEmployees().map(e => String(e.email || e.name).toLowerCase()));
    let added = 0, skipped = 0;
    const colors = ['amber', 'emerald', 'violet', 'rose', 'sky', 'teal', 'indigo'];
    records.forEach((r, idx) => {
      const name = col(r, 'Name', 'Employee', 'Full Name'); if (!name) { skipped++; return; }
      const email = col(r, 'Email');
      const dedupeKey = (email || name).toLowerCase();
      if (existing.has(dedupeKey)) { skipped++; return; }
      const initials = name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
      saveNewEmployee({
        id: col(r, 'Emp ID', 'ID', 'EmployeeId') || ('U-IMP-' + Date.now() + '-' + idx),
        employeeId: col(r, 'Emp ID', 'EmployeeId', 'ID'),
        name, initials, color: colors[idx % colors.length],
        roleName: col(r, 'Role', 'Designation') || 'Sales Executive',
        email: email || '—',
        phone: col(r, 'Phone', 'Mobile') || '—',
        department: col(r, 'Department', 'Dept') || 'Sales',
        joinedAt: col(r, 'Joined', 'Joined At', 'Join Date') || '',
      });
      existing.add(dedupeKey); added++;
    });
    showToast(`Imported ${added} employees${skipped ? `, skipped ${skipped}` : ''}`);
    if (added) setTimeout(() => location.reload(), 700);
  }
  function importLeads(records) {
    const existingPhones = new Set(liveLeads().map(l => normPhone(l.phone)).filter(Boolean));
    const existingIds = new Set(liveLeads().map(l => String(l.id)));
    let added = 0, skipped = 0;
    const colors = ['amber', 'emerald', 'violet', 'rose', 'sky', 'teal', 'indigo'];
    records.forEach((r, idx) => {
      const name = col(r, 'Name', 'Lead Name', 'Customer'); if (!name) { skipped++; return; }
      const phone = col(r, 'Phone', 'Mobile', 'Contact');
      const id = col(r, 'Lead ID', 'ID');
      if ((phone && existingPhones.has(normPhone(phone))) || (id && existingIds.has(id))) { skipped++; return; }
      const initials = name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
      const sourceName = col(r, 'Source') || 'Website';
      saveNewLead({
        id: id || nextLeadId(),
        name, initials, color: colors[idx % colors.length],
        phone: phone || '—', email: col(r, 'Email') || '—',
        source: sourceName, sourceCls: 'source-website', sourceIcon: '·',
        project: col(r, 'Project') || '—',
        config: col(r, 'Config', 'Configuration', 'Requirement') || '—',
        budget: col(r, 'Budget') || '—',
        currentOwnerId: '', originalOwnerId: '',
        ownerName: col(r, 'Current Owner', 'Owner') || 'Unassigned',
        isClosed: false, rotations: parseInt(col(r, 'Rotations'), 10) || 0,
        isStale: false, daysSinceContact: 0,
        statusLabel: col(r, 'Status') || 'New', statusPill: 'pill-emerald',
        createdAt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        isNew: true,
        registrantType: 'inhouse', registrantName: col(r, 'Current Owner', 'Owner') || '',
        registeredAt: new Date().toISOString().slice(0, 10),
        validityDays: 90, clashStatus: null, relatedTo: [],
      });
      if (phone) existingPhones.add(normPhone(phone));
      if (id) existingIds.add(id);
      added++;
    });
    showToast(`Imported ${added} leads${skipped ? `, skipped ${skipped}` : ''}`);
    if (added) setTimeout(() => location.reload(), 700);
  }
  function importCps(records) {
    const existing = new Set(liveCps().map(c => String(c.name).toLowerCase()));
    let added = 0, skipped = 0;
    const colors = ['amber', 'emerald', 'violet', 'rose', 'sky', 'teal', 'indigo'];
    records.forEach((r, idx) => {
      const name = col(r, 'Name', 'Partner', 'CP Name'); if (!name) { skipped++; return; }
      if (existing.has(name.toLowerCase())) { skipped++; return; }
      const initials = name.split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase();
      saveNewCp({
        id: col(r, 'CP ID', 'ID') || ('CP-IMP-' + Date.now() + '-' + idx),
        name, initials, color: colors[idx % colors.length],
        firm: col(r, 'Firm', 'Company') || '',
        phone: col(r, 'Phone', 'Mobile') || '—',
        email: col(r, 'Email') || '—',
        reraRegNo: col(r, 'RERA Reg No', 'RERA', 'RERA Reg') || '',
        area: col(r, 'Area', 'Location') || '',
        status: col(r, 'Status') || 'Active',
        onboardedAt: col(r, 'Onboarded', 'Onboarded At') || new Date().toISOString().slice(0, 10),
        approvedBy: 'Imported',
      });
      existing.add(name.toLowerCase()); added++;
    });
    showToast(`Imported ${added} channel partners${skipped ? `, skipped ${skipped}` : ''}`);
    if (added) setTimeout(() => location.reload(), 700);
  }

  // ---- dispatcher for every export-* / import-* / clear-project-filters action ----
  function handleDataIO(action) {
    switch (action) {
      case 'export-projects':  return exportProjects();
      case 'export-employees': return exportEmployees();
      case 'export-leads':     return exportLeads();
      case 'export-ownership': return exportOwnership();
      case 'export-rotation':  return exportRotation();
      case 'export-cps':       return exportCps();
      case 'import-projects':  return pickCSV(importProjects);
      case 'import-employees': return pickCSV(importEmployees);
      case 'import-leads':     return pickCSV(importLeads);
      case 'import-cps':       return pickCSV(importCps);
      case 'clear-project-filters': return clearProjectFilters();
    }
  }

  // ========================================================================
  // PROJECTS PAGE — location / price / requirement filters (everyone)
  // ========================================================================
  function applyProjectFilters() {
    const grid = document.querySelector('[data-projects-grid]'); if (!grid) return;
    const locSel  = document.querySelector('[data-filter-location]');
    const priceSel = document.querySelector('[data-filter-price]');
    const typeSel = document.querySelector('[data-filter-type]');
    const loc = locSel ? locSel.value : '';
    const price = priceSel ? priceSel.value : '';
    const type = typeSel ? typeSel.value : '';
    const [pMin, pMax] = price ? price.split('-') : ['', ''];
    const cards = grid.querySelectorAll('[data-project-card]');
    let visible = 0;
    cards.forEach(card => {
      let show = true;
      if (loc) {
        if (loc.startsWith('zone:'))  show = show && (card.dataset.zone === loc.slice(5));
        else if (loc.startsWith('area:')) show = show && (card.dataset.location === loc.slice(5));
      }
      if (show && price) {
        const v = parseFloat(card.dataset.price) || 0;
        if (pMin !== '' && v < parseFloat(pMin)) show = false;
        if (pMax !== '' && v >= parseFloat(pMax)) show = false;
      }
      if (show && type) {
        const types = (card.dataset.types || '').split('|');
        show = types.includes(type);
      }
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    const counter = document.querySelector('[data-projects-count]');
    if (counter) counter.textContent = `Showing ${visible} of ${cards.length}`;
    const empty = document.querySelector('[data-projects-empty]');
    if (empty) empty.hidden = visible !== 0;
  }
  function clearProjectFilters() {
    ['[data-filter-location]', '[data-filter-price]', '[data-filter-type]'].forEach(sel => {
      const el = document.querySelector(sel); if (el) el.value = '';
    });
    applyProjectFilters();
  }
  function setupProjectFilters() {
    if (document.body.dataset.page !== 'projects') return;
    ['[data-filter-location]', '[data-filter-price]', '[data-filter-type]'].forEach(sel => {
      const el = document.querySelector(sel); if (el) el.addEventListener('change', applyProjectFilters);
    });
    applyProjectFilters();
  }

  // ---- inject CSV-imported employees into the team grid ----
  function injectNewEmployees() {
    if (document.body.dataset.page !== 'employees') return;
    const grid = document.querySelector('[data-employees-grid]'); if (!grid) return;
    getNewEmployees().forEach(e => {
      const card = el('a', { class: 'emp-card', href: `leads.html?owner=${e.id}`, style: 'color:inherit;text-decoration:none;' });
      const top = el('div', { class: 'emp-card-top' });
      top.appendChild(avatarEl(e.initials || '?', e.color || 'slate', 'lg'));
      const info = el('div', { style: 'flex:1;min-width:0;' });
      const nameRow = el('div', { class: 'emp-card-name' });
      nameRow.appendChild(document.createTextNode(e.name));
      nameRow.appendChild(el('span', { class: 'pill pill-emerald', style: 'margin-left:6px;font-size:10px;', text: 'NEW' }));
      info.appendChild(nameRow);
      info.appendChild(el('div', { class: 'emp-card-id', text: e.employeeId ? 'ID ' + e.employeeId : (e.id || '') }));
      info.appendChild(el('div', { class: 'text-xs muted', style: 'margin-top:2px;', text: e.roleName || '' }));
      top.appendChild(info);
      card.appendChild(top);
      card.appendChild(el('div', { style: 'font-size:11.5px;color:var(--color-slate-500);margin-top:10px;', text: `📧 ${e.email || '—'}  ·  📞 ${e.phone || '—'}` }));
      grid.insertBefore(card, grid.firstChild);
    });
  }

  // ---------- Bootstrap ----------
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('sidebar')) return; // not an app page (e.g., login)
    const user = requireLogin();
    if (!user) return;
    if (!checkOwnerOnly(user)) return;

    renderSidebar(user);
    renderTopbar(user);

    const page = document.body.dataset.page;
    const isLeadDetail = !!document.querySelector('[data-lead-detail-host]');

    if (page === 'dashboard') {
      setupDashboard(user);
      injectNewLeadsDashboard(user);
    }
    if (page === 'leads' && !isLeadDetail) {
      setupLeadsList(user);
      injectNewLeads(user);
      applyOverridesToLeadsList();
      setupLeadFilters();
    }
    if (page === 'rotation') {
      injectClosedIntoRotation();
    }
    if (page === 'channel-partners') {
      setupChannelPartners();
    }
    if (page === 'projects') {
      setupProjects();
      setupProjectFilters();
    }
    if (page === 'employees') {
      injectNewEmployees();
    }
    if (page === 'clashes') {
      setupClashTabs();
    }
    if (isLeadDetail) {
      setupLeadDetail();
      applyOverridesToDetail();
    }

    setupModals();
    setupTabs();
    // Default registrant toggle = in-house
    if (typeof window.__alRegType === 'undefined') window.__alRegType = 'inhouse';
    // Render persisted simulated notifications into the bell panel
    getNotifs().slice().reverse().forEach(n => addNotifToPanel(n.title, n.kind));
  });
})();
