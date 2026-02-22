/* =====================================================
   SchoolStock Inventory — Frontend App
   ===================================================== */

const API = (window.location.origin || '') + '/api';

// ── State ──────────────────────────────────────────────────────
let allItems = [];
let allCategories = [];
let currentUser = null;

// ── Utilities ──────────────────────────────────────────────────
const fmt = n => `PKR ${Number(n).toLocaleString('en-PK')}`;
const fmtDate = d => new Date(d).toLocaleString('en-PK', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
});

async function api(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    if (res.status === 401 && !path.includes('/auth/')) {
        window.location.href = '/login.html';
        throw new Error('Session expired');
    }
    return res.json();
}

// ── Toast ───────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3500) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

// ── Live Clock ──────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').textContent = now.toLocaleString('en-PK', {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}
setInterval(updateClock, 1000);
updateClock();

// ── Auth ───────────────────────────────────────────────────────
const WRITE_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];
const MANAGER_UP_ROLES = ['ADMIN', 'MANAGER'];  // Can add items, stock-in, see costs (staff: sales only)

function canWrite() {
    return currentUser && WRITE_ROLES.includes(currentUser.role);
}

function isStaff() {
    return currentUser?.role === 'STAFF';
}

function canAddItemsOrStockIn() {
    return currentUser && MANAGER_UP_ROLES.includes(currentUser.role);
}

async function checkAuth() {
    const res = await api('/auth/me');
    if (!res.success) {
        window.location.href = '/login.html';
        return false;
    }
    currentUser = res.data;
    document.getElementById('user-name').textContent = currentUser.name || currentUser.email;
    document.getElementById('user-role').textContent = currentUser.role;
    document.body.classList.toggle('role-staff', isStaff());
    if (currentUser.role === 'ADMIN') {
        document.getElementById('nav-users').style.display = 'flex';
    }
    if (!canWrite()) {
        document.getElementById('btn-add-item').style.display = 'none';
        const addCat = document.getElementById('btn-add-category');
        if (addCat) addCat.style.display = 'none';
    }
    if (isStaff()) {
        document.getElementById('btn-add-item').style.display = 'none';
        const addCat = document.getElementById('btn-add-category');
        if (addCat) addCat.style.display = 'none';
    }
    return true;
}

document.getElementById('btn-logout').addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
});

// ── Navigation ──────────────────────────────────────────────────
const pages = ['dashboard', 'items', 'categories', 'transactions', 'users'];

function navigate(page) {
    pages.forEach(p => {
        document.getElementById(`page-${p}`).classList.toggle('active', p === page);
        document.getElementById(`nav-${p}`).classList.toggle('active', p === page);
    });

    const titles = {
        dashboard: 'Dashboard',
        items: 'Inventory',
        categories: 'Categories',
        transactions: 'Transactions',
        users: 'Users',
    };
    document.getElementById('page-title').textContent = titles[page];

    // Load data for the page
    if (page === 'dashboard') loadDashboard();
    if (page === 'items') renderItemsTable();
    if (page === 'categories') renderCategories();
    if (page === 'transactions') loadTransactions();
    if (page === 'users') {
        if (currentUser?.role !== 'ADMIN') {
            navigate('dashboard');
            return;
        }
        loadUsers();
    }
}

document.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        navigate(link.dataset.page);
    });
});

// ── Modal Helpers ───────────────────────────────────────────────
function openModal(id) {
    document.getElementById(id).classList.add('open');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('open');
    const form = document.querySelector(`#${id} form`);
    if (form) form.reset();
}

function closeModalOnOverlay(event, id) {
    if (event.target === event.currentTarget) closeModal(id);
}

// ── Chart theme (Al Jazeera / By The Numb3rs style) ─────────────
const CHART_COLORS = [
    '#2E77D3', '#1e5ba8', '#4a90e2',
    '#6a707f', '#8a909f', '#9ca3af', '#b8bfc9', '#c8cfd8',
];
const CHART_FONTS = { family: "'Montserrat', sans-serif", size: 11 };

let chartSales = null;
let chartProfit = null;
let chartCategory = null;

function renderCategoryChart(categoryStats) {
    const el = document.getElementById('chart-category-empty');
    if (!categoryStats || categoryStats.length === 0) {
        el.classList.remove('hidden');
        if (chartCategory) { chartCategory.destroy(); chartCategory = null; }
        return;
    }
    el.classList.add('hidden');

    const labels = categoryStats.map((r) => r.categoryName);
    const data = categoryStats.map((r) => r.revenue);
    const total = data.reduce((a, b) => a + b, 0);
    const colors = categoryStats.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

    const datalabelsPlugin = typeof ChartDataLabels !== 'undefined' ? ChartDataLabels : null;

    if (chartCategory) chartCategory.destroy();
    chartCategory = new Chart(document.getElementById('chart-category'), {
        type: 'pie',
        data: {
            labels,
            datasets: [{
                data,
                backgroundColor: colors,
                borderColor: '#ffffff',
                borderWidth: 2,
            }],
        },
        plugins: datalabelsPlugin ? [datalabelsPlugin] : [],
        options: {
            responsive: true,
            maintainAspectRatio: true,
            layout: { padding: 40 },
            hover: { animationDuration: 0 },
            plugins: {
                legend: { display: !datalabelsPlugin, position: 'right', labels: { font: CHART_FONTS, color: '#4a5568', padding: 12, usePointStyle: true } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const v = ctx.raw;
                            const pct = ((v / total) * 100).toFixed(1);
                            return ` ${ctx.label}: PKR ${Number(v).toLocaleString('en-PK')} (${pct}%)`;
                        },
                    },
                },
                ...(datalabelsPlugin && {
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        offset: 12,
                        font: { family: CHART_FONTS.family, size: 11, weight: '700' },
                        color: '#1a1d24',
                        clamp: true,
                        clip: false,
                        formatter: (value, ctx) => {
                            const pct = ((value / total) * 100).toFixed(0);
                            const name = (ctx.chart.data.labels[ctx.dataIndex] || '').toUpperCase();
                            return `${name}\nPKR ${Number(value).toLocaleString('en-PK')} (${pct}%)`;
                        },
                        display: 'auto',
                    },
                }),
            },
        },
    });
}

function renderItemCharts(itemStats, staffView = false) {
    if (!itemStats || itemStats.length === 0) {
        document.getElementById('chart-sales-empty').classList.remove('hidden');
        document.getElementById('chart-profit-empty').classList.remove('hidden');
        if (chartSales) { chartSales.destroy(); chartSales = null; }
        if (chartProfit) { chartProfit.destroy(); chartProfit = null; }
    } else {

    const topItems = itemStats.slice(0, 8);
    const labels = topItems.map((r) => r.itemName.length > 18 ? r.itemName.slice(0, 15) + '…' : r.itemName);
    const revenueData = topItems.map((r) => r.revenue);
    const profitData = topItems.map((r) => r.profit);

    document.getElementById('chart-sales-empty').classList.add('hidden');
    document.getElementById('chart-profit-empty').classList.add('hidden');

    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: true,
        layout: { padding: 16 },
        hover: { animationDuration: 0 },
        plugins: {
            legend: { display: false },
        },
        scales: {
            x: {
                grid: { color: 'rgba(0,0,0,0.06)' },
                ticks: { font: CHART_FONTS, color: '#4a5568', maxRotation: 45 },
            },
            y: {
                grid: { color: 'rgba(0,0,0,0.06)' },
                ticks: { font: CHART_FONTS, color: '#4a5568' },
            },
        },
    };

    if (chartSales) chartSales.destroy();
    chartSales = new Chart(document.getElementById('chart-sales'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Revenue (PKR)',
                data: revenueData,
                backgroundColor: revenueData.map((_, i) =>
                    i < 2 ? CHART_COLORS[i] : CHART_COLORS[3 + (i % 5)]
                ),
                borderColor: revenueData.map((_, i) =>
                    i < 2 ? CHART_COLORS[i] : '#6a707f'
                ),
                borderWidth: 1,
            }],
        },
        options: {
            ...defaultOptions,
            indexAxis: 'y',
            scales: {
                ...defaultOptions.scales,
                x: {
                    ...defaultOptions.scales.x,
                    ticks: {
                        ...defaultOptions.scales.x.ticks,
                        callback: (v) => 'PKR ' + Number(v).toLocaleString('en-PK'),
                    },
                },
            },
        },
    });

    if (staffView) {
        if (chartProfit) { chartProfit.destroy(); chartProfit = null; }
    } else {
    if (chartProfit) chartProfit.destroy();
    chartProfit = new Chart(document.getElementById('chart-profit'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Profit (PKR)',
                data: profitData,
                backgroundColor: profitData.map((v) =>
                    v >= 0 ? 'rgba(39, 174, 96, 0.7)' : 'rgba(192, 57, 43, 0.6)'
                ),
                borderColor: profitData.map((v) =>
                    v >= 0 ? '#27ae60' : '#c0392b'
                ),
                borderWidth: 1,
            }],
        },
        options: {
            ...defaultOptions,
            indexAxis: 'y',
            scales: {
                ...defaultOptions.scales,
                x: {
                    ...defaultOptions.scales.x,
                    ticks: {
                        ...defaultOptions.scales.x.ticks,
                        callback: (v) => 'PKR ' + Number(v).toLocaleString('en-PK'),
                    },
                },
            },
        },
    });
    }
    }
}

// ── Dashboard ───────────────────────────────────────────────────
async function loadDashboard() {
    try {
        const [summaryRes, itemStatsRes, categoryStatsRes] = await Promise.all([
            api('/transactions/summary'),
            api('/transactions/item-stats'),
            api('/transactions/category-stats'),
        ]);

        if (!summaryRes.success) throw new Error(summaryRes.error);
        const d = summaryRes.data;

        document.getElementById('stat-items').textContent = d.totalItems;
        document.getElementById('stat-units').textContent = d.totalUnitsInStock ?? 0;
        document.getElementById('stat-categories').textContent = d.totalCategories;
        if (!isStaff()) {
            document.getElementById('stat-cost-value').textContent = fmt(d.totalStockValue);
            document.getElementById('stat-profit').textContent = fmt(d.potentialProfit);
        }
        document.getElementById('stat-retail-value').textContent = fmt(d.totalRetailValue);

        // Low Stock Alerts
        const lowEl = document.getElementById('low-stock-list');
        if (d.lowStockItems.length === 0) {
            lowEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div>All items are well-stocked!</div>`;
        } else {
            lowEl.innerHTML = d.lowStockItems.map(item => `
        <div class="alert-item">
          <div>
            <div class="alert-item-name">${item.name}</div>
            <div class="alert-item-sub">${item.category?.name || ''} · SKU: ${item.sku}</div>
          </div>
          <span class="${item.stock === 0 ? 'stock-zero' : 'stock-low'}">${item.stock} left</span>
        </div>
      `).join('');
        }

        // Recent Sales
        const salesEl = document.getElementById('recent-sales-list');
        if (d.recentSales.length === 0) {
            salesEl.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🛒</div>No sales recorded yet.</div>`;
        } else {
            salesEl.innerHTML = d.recentSales.map(tx => `
        <div class="alert-item">
          <div>
            <div class="alert-item-name">${tx.item.name}</div>
            <div class="alert-item-sub">${fmtDate(tx.createdAt)} · Qty: ${Math.abs(tx.quantity)}</div>
          </div>
          <span style="color:var(--accent-green);font-weight:700;">
            ${fmt(Math.abs(tx.quantity) * (tx.price || 0))}
          </span>
        </div>
      `).join('');
        }

        if (itemStatsRes.success && itemStatsRes.data) {
            renderItemCharts(itemStatsRes.data, isStaff());
        }
        if (categoryStatsRes.success && categoryStatsRes.data) {
            renderCategoryChart(categoryStatsRes.data);
        }
    } catch (err) {
        showToast(`Dashboard error: ${err.message}`, 'error');
    }
}

// ── Items ───────────────────────────────────────────────────────
async function loadItems() {
    const result = await api('/items');
    if (result.success) {
        allItems = result.data;
        populateCategoryFilters();
    }
}

function stockClass(s) {
    if (s === 0) return 'stock-zero';
    if (s <= 10) return 'stock-low';
    return 'stock-ok';
}

function getCategoryBadge(catName) {
    const name = (catName || '').toLowerCase();
    if (name.includes('boy')) return 'badge-blue';
    if (name.includes('girl')) return 'badge-purple';
    if (name.includes('book')) return 'badge-orange';
    return 'badge-teal';
}

function renderItemsTable() {
    const search = (document.getElementById('item-search')?.value || '').toLowerCase();
    const catFilter = document.getElementById('filter-category')?.value || '';
    const lowStock = document.getElementById('filter-low-stock')?.checked || false;

    let items = allItems;
    if (search) items = items.filter(i =>
        i.name.toLowerCase().includes(search) ||
        i.sku.toLowerCase().includes(search)
    );
    if (catFilter) items = items.filter(i => String(i.categoryId) === catFilter);
    if (lowStock) items = items.filter(i => i.stock <= 10);

    const tbody = document.getElementById('items-tbody');
    const colCount = isStaff() ? 8 : 9;
    if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="loading-row">No items found.</td></tr>`;
        return;
    }

    tbody.innerHTML = items.map(item => {
        const detail = item.size
            ? `Size ${item.size}`
            : item.class
                ? `${item.class}${item.subject ? ' · ' + item.subject : ''}`
                : '—';
        const safeName = (item.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeSku = (item.sku || '').replace(/'/g, "\\'");

        return `
      <tr class="item-row" data-item-id="${item.id}" onclick="if(!event.target.closest('button')) openItemProfile(${item.id})">
        <td class="col-profile">
          <button class="btn-icon" title="View Profile" onclick="event.stopPropagation(); openItemProfile(${item.id})">👤</button>
        </td>
        <td class="col-sku"><span class="sku-code">${item.sku}</span></td>
        <td class="item-name-cell"><strong>${item.name}</strong>${item.description ? `<br><small style="color:var(--text-muted)">${item.description}</small>` : ''}</td>
        <td><span class="badge ${getCategoryBadge(item.category?.name)}">${item.category?.name || '—'}</span></td>
        <td style="color:var(--text-secondary)">${detail}</td>
        ${isStaff() ? '' : `<td>${fmt(item.costPrice)}</td>`}
        <td style="color:var(--accent-green)">${fmt(item.salePrice)}</td>
        <td class="col-stock"><span class="${stockClass(item.stock)}">${item.stock}</span></td>
        <td>
          ${canWrite() ? `
          <div class="action-btns">
            ${canAddItemsOrStockIn() ? `<button class="btn-icon success" title="Add Stock" onclick="event.stopPropagation(); openStockInModal(${item.id}, '${safeSku}', '${safeName}', ${item.stock})">📥 In</button>` : ''}
            <button class="btn-icon danger"  title="Record Sale" onclick="event.stopPropagation(); openSaleModal(${item.id}, '${safeSku}', '${safeName}', ${item.stock}, ${item.salePrice})">🛒 Sell</button>
          </div>
          ` : '<span style="color:var(--text-muted)">—</span>'}
        </td>
      </tr>
    `;
    }).join('');
}

function populateCategoryFilters() {
    const catFilter = document.getElementById('filter-category');
    const addSelect = document.getElementById('add-item-category-select');

    const opts = allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    catFilter.innerHTML = `<option value="">All Categories</option>` + opts;
    addSelect.innerHTML = `<option value="">Select category...</option>` + opts;
}

// ── Item Profile ────────────────────────────────────────────────
async function openItemProfile(itemId) {
    const body = document.getElementById('item-profile-body');
    body.innerHTML = '<div class="profile-loading">Loading...</div>';
    openModal('modal-item-profile');

    try {
        const result = await api(`/items/${itemId}`);
        if (!result.success) throw new Error(result.error);
        const item = result.data;

        const typeBadge = (t) => {
            const map = { SALE: 'badge-red', STOCK_IN: 'badge-green', INITIAL_BALANCE: 'badge-blue', STOCK_OUT: 'badge-orange' };
            return `<span class="badge ${map[t] || 'badge-teal'}">${(t || '').replace(/_/g, ' ')}</span>`;
        };

        const priceForStaff = (tx) => {
            if (!isStaff()) return tx.price ? fmt(tx.price) : '—';
            return tx.type === 'SALE' ? (tx.price ? fmt(tx.price) : '—') : '—';
        };
        const txRows = (item.transactions || []).slice(0, 20).map(tx => `
            <tr>
              <td style="color:var(--text-secondary);white-space:nowrap">${fmtDate(tx.createdAt)}</td>
              <td>${typeBadge(tx.type)}</td>
              <td style="text-align:center;font-weight:700;color:${tx.quantity > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${tx.quantity > 0 ? '+' : ''}${tx.quantity}</td>
              <td>${priceForStaff(tx)}</td>
              <td style="color:var(--text-muted)">${tx.reference || '—'}</td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:20px">No transactions yet.</td></tr>';

        body.innerHTML = `
            <div class="profile-header">
              <div class="profile-title-row">
                <h3 class="profile-name">${item.name}</h3>
                <span class="sku-code profile-sku">${item.sku}</span>
              </div>
              <span class="badge ${getCategoryBadge(item.category?.name)}">${item.category?.name || '—'}</span>
            </div>

            <div class="profile-grid">
              <div class="profile-section">
                <h4 class="profile-section-title">Details</h4>
                <dl class="profile-dl">
                  <dt>Size</dt><dd>${item.size || '—'}</dd>
                  <dt>Class</dt><dd>${item.class || '—'}</dd>
                  <dt>Subject</dt><dd>${item.subject || '—'}</dd>
                  <dt>Description</dt><dd>${item.description || '—'}</dd>
                </dl>
              </div>
              <div class="profile-section">
                <h4 class="profile-section-title">Pricing & Stock</h4>
                <dl class="profile-dl">
                  ${isStaff() ? '' : `<dt>Cost Price</dt><dd>${fmt(item.costPrice)}</dd>`}
                  <dt>Sale Price</dt><dd style="color:var(--accent-green)">${fmt(item.salePrice)}</dd>
                  <dt>Current Stock</dt><dd><span class="${stockClass(item.stock)}">${item.stock}</span></dd>
                  ${isStaff() ? '' : `<dt>Stock Value</dt><dd>${fmt(item.stock * item.costPrice)}</dd>`}
                </dl>
              </div>
            </div>

            ${canWrite() ? `
            <div class="profile-actions">
              ${canAddItemsOrStockIn() ? `<button class="btn btn-success" onclick="closeModal('modal-item-profile'); openStockInModal(${item.id}, '${(item.sku||'').replace(/'/g,"\\'")}', '${(item.name||'').replace(/'/g,"\\'")}', ${item.stock})">📥 Add Stock</button>` : ''}
              <button class="btn btn-danger" onclick="closeModal('modal-item-profile'); openSaleModal(${item.id}, '${(item.sku||'').replace(/'/g,"\\'")}', '${(item.name||'').replace(/'/g,"\\'")}', ${item.stock}, ${item.salePrice})">🛒 Record Sale</button>
            </div>
            ` : ''}

            <div class="profile-section">
              <h4 class="profile-section-title">Recent Transactions</h4>
              <div class="profile-table-wrap">
                <table class="data-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>Price</th><th>Reference</th></tr></thead>
                  <tbody>${txRows}</tbody>
                </table>
              </div>
            </div>
        `;
    } catch (err) {
        body.innerHTML = `<div class="profile-error">Error: ${err.message}</div>`;
    }
}

// ── Stock In Modal ──────────────────────────────────────────────
function openStockInModal(id, sku, name, currentStock) {
    document.getElementById('stock-in-item-id').value = id;
    document.getElementById('stock-in-item-banner').innerHTML = `
    <strong>${name}</strong>
    <span>SKU: ${sku} &nbsp;|&nbsp; Current Stock: <b style="color:var(--accent-green)">${currentStock}</b></span>
  `;
    openModal('modal-stock-in');
}

// ── Sale Modal ──────────────────────────────────────────────────
function openSaleModal(id, sku, name, currentStock, salePrice) {
    document.getElementById('sale-item-id').value = id;
    document.getElementById('sale-item-banner').innerHTML = `
    <strong>${name}</strong>
    <span>SKU: ${sku} &nbsp;|&nbsp; Stock: <b style="color:var(--accent-green)">${currentStock}</b> &nbsp;|&nbsp; Sale Price: <b style="color:var(--accent-orange)">${fmt(salePrice)}</b></span>
  `;
    document.getElementById('sale-price').placeholder = `Default: ${salePrice}`;
    openModal('modal-sale');
}

// ── Categories ──────────────────────────────────────────────────
async function loadCategories() {
    const result = await api('/categories');
    if (result.success) allCategories = result.data;
}

const catEmoji = name => {
    const n = (name || '').toLowerCase();
    if (n.includes('boy')) return '👦';
    if (n.includes('girl')) return '👧';
    if (n.includes('book')) return '📚';
    return '📦';
};

function renderCategories() {
    const grid = document.getElementById('categories-grid');
    if (allCategories.length === 0) {
        grid.innerHTML = `<div class="empty-state">No categories found.</div>`;
        return;
    }
    grid.innerHTML = allCategories.map(c => `
    <div class="category-card">
      <div class="category-emoji">${catEmoji(c.name)}</div>
      <div>
        <div class="category-name">${c.name}</div>
        <div class="category-desc">${c.description || 'No description'}</div>
      </div>
      <div class="category-count"><span>${c._count?.items ?? 0}</span> items in this category</div>
    </div>
  `).join('');
}

// ── Transactions ────────────────────────────────────────────────
async function loadTransactions() {
    const type = document.getElementById('filter-tx-type')?.value || '';
    const params = new URLSearchParams({ limit: 200 });
    if (type) params.set('type', type);

    const result = await api(`/transactions?${params}`);
    if (!result.success) return;

    const typeBadge = t => {
        const map = {
            SALE: 'badge-red',
            STOCK_IN: 'badge-green',
            INITIAL_BALANCE: 'badge-blue',
            STOCK_OUT: 'badge-orange',
        };
        return `<span class="badge ${map[t] || 'badge-teal'}">${t.replace('_', ' ')}</span>`;
    };

    const tbody = document.getElementById('tx-tbody');
    if (result.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="loading-row">No transactions found.</td></tr>`;
        return;
    }

    const txPrice = (tx) => {
        if (!isStaff()) return tx.price ? fmt(tx.price) : '—';
        return tx.type === 'SALE' ? (tx.price ? fmt(tx.price) : '—') : '—';
    };
    tbody.innerHTML = result.data.map(tx => `
    <tr>
      <td style="color:var(--text-secondary);white-space:nowrap">${fmtDate(tx.createdAt)}</td>
      <td><strong>${tx.item?.name || '—'}</strong><br><span class="sku-code">${tx.item?.sku || ''}</span></td>
      <td>${typeBadge(tx.type)}</td>
      <td style="text-align:center;font-weight:700;color:${tx.quantity > 0 ? 'var(--accent-green)' : 'var(--accent-red)'}">${tx.quantity > 0 ? '+' : ''}${tx.quantity}</td>
      <td>${txPrice(tx)}</td>
      <td style="color:var(--text-muted)">${tx.reference || '—'}</td>
    </tr>
  `).join('');
}

// ── Form Submissions ────────────────────────────────────────────

// Add Item
document.getElementById('form-add-item').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
        name: fd.get('name'),
        categoryId: fd.get('categoryId'),
        sku: fd.get('sku') || undefined,
        size: fd.get('size') || undefined,
        itemClass: fd.get('itemClass') || undefined,
        subject: fd.get('subject') || undefined,
        costPrice: fd.get('costPrice'),
        salePrice: fd.get('salePrice'),
        stock: fd.get('stock') || 0,
        description: fd.get('description') || undefined,
    };

    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Adding...'; btn.disabled = true;

    try {
        const result = await api('/items', { method: 'POST', body: JSON.stringify(body) });
        if (!result.success) throw new Error(result.error);
        showToast(`✅ Item "${result.data.name}" added with SKU ${result.data.sku}`, 'success');
        closeModal('modal-add-item');
        await loadItems();
        renderItemsTable();
        await loadDashboard();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        btn.textContent = 'Add Item'; btn.disabled = false;
    }
});

// Add Category
document.getElementById('form-add-category').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = { name: fd.get('name'), description: fd.get('description') || undefined };

    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Creating...'; btn.disabled = true;

    try {
        const result = await api('/categories', { method: 'POST', body: JSON.stringify(body) });
        if (!result.success) throw new Error(result.error);
        showToast(`Category "${result.data.name}" created`, 'success');
        closeModal('modal-add-category');
        await loadCategories();
        renderCategories();
        populateCategoryFilters();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        btn.textContent = 'Create Category'; btn.disabled = false;
    }
});

// Stock In
document.getElementById('form-stock-in').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const itemId = fd.get('itemId');
    const body = {
        quantity: fd.get('quantity'),
        price: fd.get('price') || undefined,
        reference: fd.get('reference') || undefined,
    };

    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Adding...'; btn.disabled = true;

    try {
        const result = await api(`/items/${itemId}/stock-in`, { method: 'POST', body: JSON.stringify(body) });
        if (!result.success) throw new Error(result.error);
        showToast(result.message, 'success');
        closeModal('modal-stock-in');
        await loadItems();
        renderItemsTable();
        await loadDashboard();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        btn.textContent = 'Add Stock'; btn.disabled = false;
    }
});

// Sale
document.getElementById('form-sale').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const itemId = fd.get('itemId');
    const body = {
        quantity: fd.get('quantity'),
        price: fd.get('price') || undefined,
        reference: fd.get('reference') || undefined,
    };

    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Recording...'; btn.disabled = true;

    try {
        const result = await api(`/items/${itemId}/sale`, { method: 'POST', body: JSON.stringify(body) });
        if (!result.success) throw new Error(result.error);
        showToast(`${result.message} · Revenue: ${fmt(result.revenue)}`, 'success');
        closeModal('modal-sale');
        await loadItems();
        renderItemsTable();
        await loadDashboard();
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        btn.textContent = 'Record Sale'; btn.disabled = false;
    }
});

// ── Live Filters ────────────────────────────────────────────────
document.getElementById('item-search').addEventListener('input', renderItemsTable);
document.getElementById('filter-category').addEventListener('change', renderItemsTable);
document.getElementById('filter-low-stock').addEventListener('change', renderItemsTable);
document.getElementById('filter-tx-type').addEventListener('change', loadTransactions);

// ── Users (Admin only) ──────────────────────────────────────────
async function loadUsers() {
    if (currentUser?.role !== 'ADMIN') return;
    const tbody = document.getElementById('users-tbody');
    try {
        const res = await api('/users');
        if (!res.success) throw new Error(res.error);
        if (res.data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No users found.</td></tr>';
            return;
        }
        tbody.innerHTML = res.data.map(u => {
            const data = JSON.stringify({ id: u.id, email: u.email, name: u.name || '', role: u.role, isActive: u.isActive }).replace(/"/g, '&quot;');
            const canDelete = u.id !== currentUser?.id;
            return `
            <tr data-user="${data}">
              <td><strong>${u.email}</strong></td>
              <td>${u.name || '—'}</td>
              <td><span class="badge badge-blue">${u.role}</span></td>
              <td>${u.isActive ? '<span class="stock-ok">Active</span>' : '<span class="stock-zero">Inactive</span>'}</td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon" title="Edit" data-action="edit">✏️ Edit</button>
                  ${canDelete ? '<button class="btn-icon danger" title="Delete" data-action="delete">🗑️</button>' : ''}
                </div>
              </td>
            </tr>
        `}).join('');

        tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.onclick = () => {
                const raw = btn.closest('tr').getAttribute('data-user').replace(/&quot;/g, '"');
                openEditUserModal(JSON.parse(raw));
            };
        });
        tbody.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.onclick = () => {
                const raw = btn.closest('tr').getAttribute('data-user').replace(/&quot;/g, '"');
                const u = JSON.parse(raw);
                deleteUser(u.id, u.email);
            };
        });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="loading-row">Error: ${err.message}</td></tr>`;
    }
}

function openEditUserModal(user) {
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-email').value = user.email || '';
    document.getElementById('edit-user-name').value = user.name || '';
    document.getElementById('edit-user-role').value = user.role || 'STAFF';
    document.getElementById('edit-user-active').checked = user.isActive !== false;
    document.getElementById('edit-user-password').value = '';
    openModal('modal-edit-user');
}

async function deleteUser(id, email) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    try {
        const res = await api(`/users/${id}`, { method: 'DELETE' });
        if (!res.success) throw new Error(res.error);
        showToast('User deleted', 'success');
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

document.getElementById('form-edit-user')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-user-id').value;
    const body = {
        name: document.getElementById('edit-user-name').value || null,
        role: document.getElementById('edit-user-role').value,
        isActive: document.getElementById('edit-user-active').checked,
    };
    const pwd = document.getElementById('edit-user-password').value;
    if (pwd) body.password = pwd;

    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
        const res = await api(`/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
        if (!res.success) throw new Error(res.error);
        showToast('User updated', 'success');
        closeModal('modal-edit-user');
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Changes';
    }
});

document.getElementById('form-add-user')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
        email: fd.get('email'),
        password: fd.get('password'),
        name: fd.get('name') || undefined,
        role: fd.get('role'),
    };
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Creating...';
    try {
        const res = await api('/users', { method: 'POST', body: JSON.stringify(body) });
        if (!res.success) throw new Error(res.error);
        showToast(`User ${res.data.email} created`, 'success');
        closeModal('modal-add-user');
        loadUsers();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Create User';
    }
});

// ── Bootstrap ───────────────────────────────────────────────────
async function init() {
    try {
        if (!(await checkAuth())) return;
        await Promise.all([loadCategories(), loadItems()]);
        await loadDashboard();
        showToast(`Welcome, ${currentUser?.name || currentUser?.email} ✅`, 'success', 2500);
    } catch (err) {
        document.getElementById('server-status').innerHTML = `
      <span class="status-dot" style="background:var(--accent-red)"></span>
      <span>Cannot reach server</span>`;
        showToast('Cannot connect to server. Is it running?', 'error', 5000);
    }
}

init();
