// KARTUNBOX Stock & RTO Management System - Core JS Logic

// Supabase Configuration
const SUPABASE_URL = "https://qsnvrasbwxegzirdicie.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_DeoGyMBpjl6Kn6HPBk5RnA_7jZ1F930";
let supabaseClient = null;

// Default Mock Data if local storage & database are empty
const defaultSKUs = [
    { id: "1", code: "KB-BOX-S1", name: "Craft Shipping Box Small (7x4x3)", warehouseStock: 450, threshold: 50, ratioAmazon: 30, ratioFlipkart: 30, ratioMeesho: 40 },
    { id: "2", code: "KB-BOX-M2", name: "Corrugated Storage Box Medium (10x8x6)", warehouseStock: 85, threshold: 30, ratioAmazon: 40, ratioFlipkart: 20, ratioMeesho: 40 },
    { id: "3", code: "KB-BOX-L3", name: "Heavy Duty Cardboard Box Large (15x12x10)", warehouseStock: 18, threshold: 25, ratioAmazon: 20, ratioFlipkart: 30, ratioMeesho: 50 }, // Low Stock
    { id: "4", code: "KB-TAP-W1", name: "Self-Adhesive Packing Tape Transparent (65m)", warehouseStock: 320, threshold: 80, ratioAmazon: 33, ratioFlipkart: 33, ratioMeesho: 34 },
    { id: "5", code: "KB-BUB-R1", name: "Bubble Wrap Protective Cushioning Roll 100m", warehouseStock: 12, threshold: 15, ratioAmazon: 40, ratioFlipkart: 30, ratioMeesho: 30 }  // Low Stock
];

const defaultReturns = [
    { id: "r1", date: "2026-06-21", orderId: "OD4810237910", sku: "KB-BOX-S1", marketplace: "amazon", type: "RTO", qty: 2, reason: "Customer Rejected", status: "restocked" },
    { id: "r2", date: "2026-06-22", orderId: "403-1283811-92", sku: "KB-BOX-M2", marketplace: "amazon", type: "Return", qty: 1, reason: "Wrong Item Received", status: "restocked" },
    { id: "r3", date: "2026-06-23", orderId: "FK-992019A", sku: "KB-BOX-L3", marketplace: "flipkart", type: "RTO", qty: 1, reason: "Address Incomplete", status: "restocked" },
    { id: "r4", date: "2026-06-24", orderId: "MS-8819231", sku: "KB-TAP-W1", marketplace: "meesho", type: "RTO", qty: 4, reason: "Customer Rejected", status: "restocked" },
    { id: "r5", date: "2026-06-25", orderId: "FK-883011B", sku: "KB-BUB-R1", marketplace: "flipkart", type: "Return", qty: 1, reason: "Product Damaged", status: "damaged" },
    { id: "r6", date: "2026-06-26", orderId: "MS-7738210", sku: "KB-BOX-M2", marketplace: "meesho", type: "Return", qty: 2, reason: "Defective Product", status: "damaged" },
    { id: "r7", date: "2026-06-26", orderId: "405-9928131-01", sku: "KB-BOX-S1", marketplace: "amazon", type: "RTO", qty: 10, reason: "Customer Rejected", status: "pending" },
    { id: "r8", date: "2026-06-27", orderId: "FK-551029C", sku: "KB-BOX-S1", marketplace: "flipkart", type: "Return", qty: 1, reason: "Wrong Item Received", status: "restocked" }
];

const defaultSyncLogs = [
    { timestamp: "2026-06-27T08:00:12", type: "success", message: "Initial SKU catalog synced successfully to Amazon, Flipkart & Meesho." },
    { timestamp: "2026-06-27T08:05:45", type: "info", message: "SKU KB-BOX-S1 stock adjusted manually. Triggering update..." },
    { timestamp: "2026-06-27T08:06:00", type: "success", message: "Amazon inventory updated for KB-BOX-S1: 135 units synced." }
];

// App State
let skus = [];
let returns = [];
let syncLogs = [];

// Chart References
let marketplaceChart = null;
let reasonsChart = null;
let trendChart = null;
let skuChart = null;

// Initialize App
document.addEventListener("DOMContentLoaded", async () => {
    initSupabase();
    await loadData();
    initNavigation();
    initForms();
    initSearchAndFilters();
    initModal();
    initGlobalSync();
    initCSVExport();
    
    // Initial Render
    renderAll();
    
    // Simulate first sync to show success
    simulateChannelSync(true);
});

// Initialize Supabase Client
function initSupabase() {
    try {
        if (window.supabase) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log("Supabase Client initialized successfully.");
        } else {
            console.warn("Supabase library not loaded.");
            updateSupabaseStatus("offline", "Supabase client not loaded. Running in local mode.");
        }
    } catch (error) {
        console.error("Error initializing Supabase client:", error);
        updateSupabaseStatus("offline", "Connection error. Running in local mode.");
    }
}

// Update Database Status badge in UI
function updateSupabaseStatus(state, message) {
    const statusText = document.getElementById("supabase-status-text");
    const statusIndicator = document.getElementById("supabase-status-indicator");
    
    if (!statusText || !statusIndicator) return;

    statusText.textContent = message;
    
    if (state === "online") {
        statusIndicator.className = "stock-indicator in-stock";
    } else if (state === "syncing") {
        statusIndicator.className = "stock-indicator low-stock";
    } else {
        statusIndicator.className = "stock-indicator out-of-stock";
    }
}

// Load data from Supabase (with LocalStorage cache fallback)
async function loadData() {
    // 1. Load LocalStorage first so the user gets an instant paint
    const savedSKUs = localStorage.getItem("kartunbox_skus");
    const savedReturns = localStorage.getItem("kartunbox_returns");
    const savedLogs = localStorage.getItem("kartunbox_logs");

    if (savedSKUs) skus = JSON.parse(savedSKUs);
    else skus = [...defaultSKUs];

    if (savedReturns) returns = JSON.parse(savedReturns);
    else returns = [...defaultReturns];

    if (savedLogs) syncLogs = JSON.parse(savedLogs);
    else syncLogs = [...defaultSyncLogs];

    // 2. Attempt to load from Supabase
    if (!supabaseClient) {
        updateSupabaseStatus("offline", "Supabase client uninitialized. Local Mode active.");
        return;
    }

    updateSupabaseStatus("syncing", "Synchronizing database tables...");

    try {
        // Fetch SKUs
        const { data: dbSkus, error: skuError } = await supabaseClient
            .from('skus')
            .select('*');

        if (skuError) throw skuError;

        // Fetch Returns
        const { data: dbReturns, error: returnsError } = await supabaseClient
            .from('returns')
            .select('*');

        if (returnsError) throw returnsError;

        // If fetch succeeded, override local data
        if (dbSkus) {
            if (dbSkus.length > 0) {
                skus = dbSkus.map(item => ({
                    id: item.id,
                    code: item.code,
                    name: item.name,
                    warehouseStock: item.warehouseStock,
                    threshold: item.threshold,
                    ratioAmazon: item.ratioAmazon,
                    ratioFlipkart: item.ratioFlipkart,
                    ratioMeesho: item.ratioMeesho
                }));
                localStorage.setItem("kartunbox_skus", JSON.stringify(skus));
            } else {
                // Database table exists but is empty, seed with mock SKUs
                addLog("info", "Supabase table 'skus' is empty. Seeding with mock SKUs...");
                await seedSupabaseSKUs();
            }
        }

        if (dbReturns) {
            if (dbReturns.length > 0) {
                returns = dbReturns.map(item => ({
                    id: item.id,
                    date: item.date,
                    orderId: item.orderId,
                    sku: item.sku,
                    marketplace: item.marketplace,
                    type: item.type,
                    qty: item.qty,
                    reason: item.reason,
                    status: item.status
                }));
                localStorage.setItem("kartunbox_returns", JSON.stringify(returns));
            } else {
                // Seed returns table
                addLog("info", "Supabase table 'returns' is empty. Seeding with default logs...");
                await seedSupabaseReturns();
            }
        }

        updateSupabaseStatus("online", "Connected to Supabase Database (Real-time Sync)");
        addLog("success", "Successfully loaded latest catalog and logs from Supabase Cloud.");

    } catch (err) {
        console.warn("Supabase fetch failed. Falling back to local data.", err);
        updateSupabaseStatus("offline", "Supabase Offline. Local cache active.");
        addLog("warning", "Database sync failed: " + err.message + ". Running in offline mode.");
    }
}

// Seed SKUs helper if Supabase table is empty
async function seedSupabaseSKUs() {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('skus')
            .insert(skus);
        if (error) throw error;
        addLog("success", "Seeded catalog SKUs to Supabase.");
    } catch (err) {
        console.error("Failed to seed SKUs:", err);
    }
}

// Seed Returns helper if Supabase table is empty
async function seedSupabaseReturns() {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('returns')
            .insert(returns);
        if (error) throw error;
        addLog("success", "Seeded default return/RTO logs to Supabase.");
    } catch (err) {
        console.error("Failed to seed returns:", err);
    }
}

// Save data to LocalStorage (runs in background on data mutations)
function saveState() {
    localStorage.setItem("kartunbox_skus", JSON.stringify(skus));
    localStorage.setItem("kartunbox_returns", JSON.stringify(returns));
    localStorage.setItem("kartunbox_logs", JSON.stringify(syncLogs));
}

// Navigation controller
function initNavigation() {
    const navLinks = document.querySelectorAll(".nav-link");
    const sections = document.querySelectorAll(".dashboard-section");
    const pageTitle = document.getElementById("page-title");
    const pageDesc = document.getElementById("page-desc");

    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            
            // Remove active class from all links and sections
            navLinks.forEach(l => l.classList.remove("active"));
            sections.forEach(s => s.classList.remove("active"));

            // Add active to current
            link.classList.add("active");
            const targetSection = link.getAttribute("data-section");
            document.getElementById(`${targetSection}-section`).classList.add("active");

            // Update header texts based on section
            switch(targetSection) {
                case "dashboard":
                    pageTitle.textContent = "Dashboard Overview";
                    pageDesc.textContent = "Real-time e-commerce synchronization and return intelligence.";
                    break;
                case "inventory":
                    pageTitle.textContent = "Inventory Management";
                    pageDesc.textContent = "Manage central warehouse stock and configure marketplace stock ratios.";
                    break;
                case "rto-logger":
                    pageTitle.textContent = "Returns & RTO Logger";
                    pageDesc.textContent = "Log customer returns and RTO deliveries to adjust inventory automatically.";
                    break;
                case "sync-channel":
                    pageTitle.textContent = "Channel Sync Status";
                    pageDesc.textContent = "Real-time communication logs and marketplace integrations.";
                    break;
                case "analytics":
                    pageTitle.textContent = "Return & RTO Analytics";
                    pageDesc.textContent = "Analyze marketplace performance, return reasons, and financial losses.";
                    break;
            }

            // Redraw charts if analytics tab is active
            if (targetSection === "analytics") {
                // Short timeout to let the page section transition and reveal the canvas
                setTimeout(renderCharts, 50);
            }
        });
    });
}

// Render everything on screen
function renderAll() {
    renderStats();
    renderLowStockTable();
    renderInventoryCatalog();
    renderRtoLogs();
    renderSyncLogs();
    populateSkuDropdowns();
}

// Calculate and render stats widgets
function renderStats() {
    // Total SKUs
    document.getElementById("stat-total-skus").textContent = skus.length;

    // Total Stock
    const totalWarehouse = skus.reduce((sum, item) => sum + parseInt(item.warehouseStock), 0);
    document.getElementById("stat-total-stock").textContent = totalWarehouse;

    // Low Stock count
    const lowStockCount = skus.filter(item => parseInt(item.warehouseStock) <= parseInt(item.threshold)).length;
    document.getElementById("stat-low-stock").textContent = lowStockCount;

    // Avg Return/RTO Rate calculation (simulate 1500 total orders for realistic calculation)
    const totalOrdersSimulated = 2500;
    const totalReturnedUnits = returns.reduce((sum, item) => sum + parseInt(item.qty), 0);
    const returnRate = (totalReturnedUnits / totalOrdersSimulated) * 100;
    document.getElementById("stat-rto-rate").textContent = `${returnRate.toFixed(2)}%`;
    
    // RTO trend subtext
    const rtoCount = returns.filter(r => r.type === "RTO").length;
    const customerReturnCount = returns.filter(r => r.type === "Return").length;
    document.getElementById("stat-rto-trend").textContent = `${rtoCount} RTOs & ${customerReturnCount} Returns logged`;
}

// Render recent sync logs on dashboard and channel page
function renderSyncLogs() {
    const containerDash = document.getElementById("dashboard-sync-logs");
    const containerFull = document.getElementById("full-sync-logs");
    
    if (!containerDash || !containerFull) return;

    // Sort logs descending (latest first)
    const sortedLogs = [...syncLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Dashboard gets top 5 logs
    const dashHTML = sortedLogs.slice(0, 5).map(log => createLogHTML(log)).join("");
    containerDash.innerHTML = dashHTML || `<p style="padding: 1rem; color: var(--text-muted); font-size: 0.85rem; text-align:center;">No sync logs recorded.</p>`;

    // Full logs section gets all logs
    const fullHTML = sortedLogs.map(log => createLogHTML(log)).join("");
    containerFull.innerHTML = fullHTML || `<p style="padding: 1rem; color: var(--text-muted); font-size: 0.85rem; text-align:center;">No sync logs recorded.</p>`;
}

function createLogHTML(log) {
    const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    return `
        <div class="sync-log-item ${log.type}">
            <div class="sync-log-message">
                <span>${escapeHTML(log.message)}</span>
                <span class="sync-log-meta">${dateStr} &bull; ${timeStr}</span>
            </div>
            <span style="font-size: 0.75rem; text-transform: uppercase; font-weight: bold; color: var(--text-muted);">${log.type}</span>
        </div>
    `;
}

// Add logs helper
function addLog(type, message) {
    const newLog = {
        timestamp: new Date().toISOString(),
        type: type,
        message: message
    };
    syncLogs.push(newLog);
    // Keep max 50 logs to save memory
    if (syncLogs.length > 50) syncLogs.shift();
    saveState();
    renderSyncLogs();
}

// Render Low Stock Alert dashboard list
function renderLowStockTable() {
    const tbody = document.getElementById("low-stock-table-body");
    if (!tbody) return;

    // Filter SKUs that are low stock
    const lowStockItems = skus.filter(item => parseInt(item.warehouseStock) <= parseInt(item.threshold));

    if (lowStockItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    🎉 All products are fully stocked! No low stock alerts active.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = lowStockItems.map(item => {
        const amzStock = Math.floor(item.warehouseStock * (item.ratioAmazon / 100));
        const fkStock = Math.floor(item.warehouseStock * (item.ratioFlipkart / 100));
        const msStock = Math.floor(item.warehouseStock * (item.ratioMeesho / 100));
        const statusClass = item.warehouseStock === 0 ? "out-of-stock" : "low-stock";
        const statusText = item.warehouseStock === 0 ? "Out of Stock" : "Low Stock";

        return `
            <tr>
                <td style="font-weight: 700;">${escapeHTML(item.code)}</td>
                <td>${escapeHTML(item.name)}</td>
                <td style="color: var(--text-muted);">${item.threshold} units</td>
                <td style="font-weight: 700; color: white;">${item.warehouseStock}</td>
                <td><span style="color: var(--color-amazon); font-weight:600;">${amzStock}</span></td>
                <td><span style="color: var(--color-flipkart); font-weight:600;">${fkStock}</span></td>
                <td><span style="color: var(--color-meesho); font-weight:600;">${msStock}</span></td>
                <td>
                    <span class="stock-indicator ${statusClass}">
                        <span class="indicator-dot"></span>
                        ${statusText}
                    </span>
                </td>
            </tr>
        `;
    }).join("");
}

// Render Product SKU Catalog in Inventory Manager
function renderInventoryCatalog() {
    const tbody = document.getElementById("inventory-table-body");
    const searchQuery = document.getElementById("inventory-search").value.toLowerCase();
    
    if (!tbody) return;

    let filteredSKUs = skus;
    if (searchQuery) {
        filteredSKUs = skus.filter(item => 
            item.code.toLowerCase().includes(searchQuery) || 
            item.name.toLowerCase().includes(searchQuery)
        );
    }

    if (filteredSKUs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No matching SKUs found in catalog.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredSKUs.map(item => {
        const amzStock = Math.floor(item.warehouseStock * (item.ratioAmazon / 100));
        const fkStock = Math.floor(item.warehouseStock * (item.ratioFlipkart / 100));
        const msStock = Math.floor(item.warehouseStock * (item.ratioMeesho / 100));
        
        const isLow = parseInt(item.warehouseStock) <= parseInt(item.threshold);
        const stockStatusBadge = isLow 
            ? (item.warehouseStock === 0 ? "out-of-stock" : "low-stock")
            : "in-stock";
        const stockStatusText = isLow 
            ? (item.warehouseStock === 0 ? "Out of Stock" : "Low Stock")
            : "Good Stock";

        return `
            <tr>
                <td>
                    <div style="font-weight: 700; color: white;">${escapeHTML(item.code)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${escapeHTML(item.name)}
                    </div>
                </td>
                <td style="font-weight: 700; color: white;">
                    ${item.warehouseStock}
                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight:normal;">Min: ${item.threshold}</div>
                </td>
                <td>
                    <span style="color: var(--color-amazon); font-weight: 600;">${amzStock}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted); display:block;">(${item.ratioAmazon}%)</span>
                </td>
                <td>
                    <span style="color: var(--color-flipkart); font-weight: 600;">${fkStock}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted); display:block;">(${item.ratioFlipkart}%)</span>
                </td>
                <td>
                    <span style="color: var(--color-meesho); font-weight: 600;">${msStock}</span>
                    <span style="font-size: 0.7rem; color: var(--text-muted); display:block;">(${item.ratioMeesho}%)</span>
                </td>
                <td>
                    <span class="stock-indicator ${stockStatusBadge}">
                        <span class="indicator-dot"></span>
                        <span style="font-size: 0.8rem;">${stockStatusText}</span>
                    </span>
                </td>
                <td style="text-align: right;">
                    <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.8rem;" onclick="openEditModal('${item.id}')">
                            Edit
                        </button>
                        <button class="btn btn-secondary" style="padding: 0.4rem 0.75rem; font-size: 0.8rem; border-color: rgba(239, 68, 68, 0.2); color: var(--color-danger);" onclick="deleteSKU('${item.id}')">
                            Delete
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// Populate SKU drop-down selections in RTO Forms
function populateSkuDropdowns() {
    const rtoSelect = document.getElementById("rto-sku");
    if (!rtoSelect) return;
    
    const options = skus.map(item => `<option value="${escapeHTML(item.code)}">${escapeHTML(item.code)} - ${escapeHTML(item.name)}</option>`).join("");
    rtoSelect.innerHTML = options || `<option value="">-- No SKUs Configured --</option>`;
}

// Render Return/RTO log table
function renderRtoLogs() {
    const tbody = document.getElementById("rto-table-body");
    const filterMarketplace = document.getElementById("filter-rto-marketplace").value;
    const filterType = document.getElementById("filter-rto-type").value;
    
    if (!tbody) return;

    let filtered = returns;
    
    if (filterMarketplace !== "all") {
        filtered = filtered.filter(item => item.marketplace === filterMarketplace);
    }
    
    if (filterType !== "all") {
        filtered = filtered.filter(item => item.type === filterType);
    }

    // Sort returns by date descending
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                    No RTO/Return logs found matching the filter criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filtered.map(item => {
        return `
            <tr>
                <td style="font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap;">
                    ${item.date}
                </td>
                <td>
                    <div style="font-weight: 600; color: white;">${escapeHTML(item.orderId)}</div>
                    <span class="marketplace-badge ${item.marketplace}">${item.marketplace}</span>
                </td>
                <td style="font-weight: 700; color: var(--color-primary);">${escapeHTML(item.sku)}</td>
                <td>
                    <span style="font-weight: 600; color: ${item.type === 'RTO' ? 'var(--color-warning)' : 'var(--color-accent)'};">
                        ${item.type}
                    </span>
                </td>
                <td style="font-weight: bold; color: white;">x${item.qty}</td>
                <td style="font-size: 0.85rem; color: var(--text-secondary); max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHTML(item.reason)}
                </td>
                <td>
                    <span class="status-badge ${item.status}">${item.status}</span>
                </td>
                <td>
                    <button class="btn btn-secondary" style="padding: 0.35rem 0.6rem; font-size: 0.75rem; border-color: rgba(239, 68, 68, 0.15); color: var(--color-danger);" onclick="deleteReturn('${item.id}')">
                        Remove
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

// Setup Search & Filters listeners
function initSearchAndFilters() {
    const invSearch = document.getElementById("inventory-search");
    if (invSearch) {
        invSearch.addEventListener("input", renderInventoryCatalog);
    }

    const filterMarket = document.getElementById("filter-rto-marketplace");
    const filterType = document.getElementById("filter-rto-type");
    
    if (filterMarket) filterMarket.addEventListener("change", renderRtoLogs);
    if (filterType) filterType.addEventListener("change", renderRtoLogs);
}

// Setup Inventory & RTO form submissions
function initForms() {
    // Add SKU Form
    const skuForm = document.getElementById("sku-form");
    const cancelBtn = document.getElementById("sku-form-cancel");
    
    if (skuForm) {
        skuForm.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const skuId = document.getElementById("sku-form-edit-id").value;
            const code = document.getElementById("sku-code").value.trim().toUpperCase();
            const name = document.getElementById("sku-name").value.trim();
            const warehouseStock = parseInt(document.getElementById("sku-warehouse-stock").value);
            const threshold = parseInt(document.getElementById("sku-threshold").value);
            
            const ratioAmazon = parseInt(document.getElementById("sku-ratio-amazon").value || 0);
            const ratioFlipkart = parseInt(document.getElementById("sku-ratio-flipkart").value || 0);
            const ratioMeesho = parseInt(document.getElementById("sku-ratio-meesho").value || 0);

            // Ratio integrity check
            if ((ratioAmazon + ratioFlipkart + ratioMeesho) !== 100) {
                alert("⚠️ Error: The total sum of Amazon, Flipkart, and Meesho stock ratios must equal exactly 100%. Current sum: " + (ratioAmazon + ratioFlipkart + ratioMeesho) + "%");
                return;
            }

            if (skuId) {
                // Edit existing SKU
                const idx = skus.findIndex(item => item.id === skuId);
                if (idx !== -1) {
                    // Check if code matches other SKUs
                    const duplicate = skus.find(item => item.code === code && item.id !== skuId);
                    if (duplicate) {
                        alert("⚠️ SKU Code already exists in your catalog.");
                        return;
                    }
                    skus[idx] = { ...skus[idx], code, name, warehouseStock, threshold, ratioAmazon, ratioFlipkart, ratioMeesho };
                    addLog("info", `Updated SKU details for ${code}. Syncing updates...`);
                    dbUpsertSKU(skus[idx]);
                }
            } else {
                // New SKU
                const duplicate = skus.find(item => item.code === code);
                if (duplicate) {
                    alert("⚠️ SKU Code already exists in your catalog.");
                    return;
                }
                const newSKU = {
                    id: Date.now().toString(),
                    code, name, warehouseStock, threshold, ratioAmazon, ratioFlipkart, ratioMeesho
                };
                skus.push(newSKU);
                addLog("info", `Added new SKU ${code} to central warehouse. Syncing updates...`);
                dbUpsertSKU(newSKU);
            }

            saveState();
            renderAll();
            skuForm.reset();
            
            // Hide cancel button and reset title
            cancelBtn.style.display = "none";
            document.getElementById("sku-form-title").textContent = "Add New SKU";
            document.getElementById("sku-form-edit-id").value = "";
            document.getElementById("sku-code").disabled = false;

            // Trigger sync
            simulateChannelSync();
        });

        if (cancelBtn) {
            cancelBtn.addEventListener("click", () => {
                skuForm.reset();
                cancelBtn.style.display = "none";
                document.getElementById("sku-form-title").textContent = "Add New SKU";
                document.getElementById("sku-form-edit-id").value = "";
                document.getElementById("sku-code").disabled = false;
            });
        }
    }

    // Return Form
    const rtoForm = document.getElementById("rto-form");
    if (rtoForm) {
        // Set today's date as default
        document.getElementById("rto-date").valueAsDate = new Date();

        rtoForm.addEventListener("submit", (e) => {
            e.preventDefault();

            const marketplace = document.getElementById("rto-marketplace").value;
            const orderId = document.getElementById("rto-order-id").value.trim();
            const skuCode = document.getElementById("rto-sku").value;
            const type = document.getElementById("rto-type").value;
            const qty = parseInt(document.getElementById("rto-qty").value);
            const reason = document.getElementById("rto-reason").value;
            const status = document.getElementById("rto-status").value;
            const date = document.getElementById("rto-date").value;

            if (!skuCode) {
                alert("⚠️ Please add a SKU product before logging returns!");
                return;
            }

            const newReturn = {
                id: "r" + Date.now(),
                date, orderId, sku: skuCode, marketplace, type, qty, reason, status
            };

            returns.push(newReturn);
            addLog("info", `Logged a ${type} for order ${orderId} (${qty}x ${skuCode}) on ${marketplace}.`);
            dbUpsertReturn(newReturn);

            // Automatically update warehouse stock if status is "restocked"
            if (status === "restocked") {
                const skuItem = skus.find(item => item.code === skuCode);
                if (skuItem) {
                    skuItem.warehouseStock = parseInt(skuItem.warehouseStock) + qty;
                    addLog("success", `Auto-Adjust Stock: Added ${qty} units back to Warehouse for SKU ${skuCode}.`);
                    dbUpsertSKU(skuItem);
                }
            }

            saveState();
            renderAll();
            rtoForm.reset();
            document.getElementById("rto-date").valueAsDate = new Date(); // Re-assign today's date

            // Scroll returns table to view
            renderRtoLogs();

            // Trigger sync
            simulateChannelSync();
        });
    }
}

// Edit SKU click handler (loads SKU into editor form)
window.openEditModal = function(id) {
    // Instead of actual dialog modal, load into the Left form for quick editing
    const skuItem = skus.find(item => item.id === id);
    if (!skuItem) return;

    document.getElementById("sku-form-edit-id").value = skuItem.id;
    
    const codeField = document.getElementById("sku-code");
    codeField.value = skuItem.code;
    codeField.disabled = true; // SKU Code cannot be changed once created to maintain relations

    document.getElementById("sku-name").value = skuItem.name;
    document.getElementById("sku-warehouse-stock").value = skuItem.warehouseStock;
    document.getElementById("sku-threshold").value = skuItem.threshold;
    
    document.getElementById("sku-ratio-amazon").value = skuItem.ratioAmazon;
    document.getElementById("sku-ratio-flipkart").value = skuItem.ratioFlipkart;
    document.getElementById("sku-ratio-meesho").value = skuItem.ratioMeesho;

    document.getElementById("sku-form-title").textContent = "Edit SKU details";
    document.getElementById("sku-form-cancel").style.display = "inline-flex";

    // Switch view to Inventory tab if clicked from elsewhere
    document.querySelector('[data-section="inventory"]').click();
    
    // Scroll form into view for mobile devices
    document.getElementById("sku-form").scrollIntoView({ behavior: "smooth" });
};

// Open standalone Modal overlay for editing stock level
function openEditModalOverlay(id) {
    const item = skus.find(s => s.id === id);
    if (!item) return;

    document.getElementById("modal-sku-id").value = item.id;
    document.getElementById("modal-sku-code").value = item.code;
    document.getElementById("modal-sku-name").value = item.name;
    document.getElementById("modal-sku-stock").value = item.warehouseStock;
    document.getElementById("modal-sku-threshold").value = item.threshold;
    document.getElementById("modal-ratio-amazon").value = item.ratioAmazon;
    document.getElementById("modal-ratio-flipkart").value = item.ratioFlipkart;
    document.getElementById("modal-ratio-meesho").value = item.ratioMeesho;

    document.getElementById("edit-stock-modal").classList.add("active");
}

function initModal() {
    const modal = document.getElementById("edit-stock-modal");
    const closeBtn = document.getElementById("modal-close-btn");
    const form = document.getElementById("edit-sku-modal-form");

    if (closeBtn) {
        closeBtn.addEventListener("click", () => {
            modal.classList.remove("active");
        });
    }

    if (form) {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            
            const id = document.getElementById("modal-sku-id").value;
            const name = document.getElementById("modal-sku-name").value;
            const stock = parseInt(document.getElementById("modal-sku-stock").value);
            const threshold = parseInt(document.getElementById("modal-sku-threshold").value);
            
            const rAmz = parseInt(document.getElementById("modal-ratio-amazon").value);
            const rFk = parseInt(document.getElementById("modal-ratio-flipkart").value);
            const rMs = parseInt(document.getElementById("modal-ratio-meesho").value);

            if ((rAmz + rFk + rMs) !== 100) {
                alert("⚠️ Error: The total sum of Amazon, Flipkart, and Meesho stock ratios must equal exactly 100%.");
                return;
            }

            const idx = skus.findIndex(s => s.id === id);
            if (idx !== -1) {
                skus[idx] = { 
                    ...skus[idx], 
                    name, 
                    warehouseStock: stock, 
                    threshold, 
                    ratioAmazon: rAmz, 
                    ratioFlipkart: rFk, 
                    ratioMeesho: rMs 
                };
                addLog("info", `Adjusted stock levels for SKU ${skus[idx].code}.`);
                dbUpsertSKU(skus[idx]);
                saveState();
                renderAll();
                simulateChannelSync();
            }

            modal.classList.remove("active");
        });
    }
}

// Global modal binder helper
window.openEditModal = function(id) {
    openEditModalOverlay(id);
};

// Delete SKU
window.deleteSKU = function(id) {
    const item = skus.find(s => s.id === id);
    if (!item) return;

    if (confirm(`🗑️ Are you sure you want to delete SKU "${item.code}" from your catalog?`)) {
        skus = skus.filter(s => s.id !== id);
        addLog("warning", `Deleted SKU ${item.code} from the system.`);
        dbDeleteSKU(id);
        saveState();
        renderAll();
    }
};

// Delete Return/RTO record
window.deleteReturn = function(id) {
    const record = returns.find(r => r.id === id);
    if (!record) return;

    if (confirm(`🗑️ Remove return log for Order "${record.orderId}"?`)) {
        
        // If it was already restocked, we ask if we should deduct the stock back out
        if (record.status === "restocked") {
            if (confirm("⚠️ This return was previously 'restocked' into the warehouse stock. Would you like to DEDUCT the returned quantity back out from the warehouse stock?")) {
                const skuItem = skus.find(s => s.code === record.sku);
                if (skuItem) {
                    skuItem.warehouseStock = Math.max(0, parseInt(skuItem.warehouseStock) - parseInt(record.qty));
                    addLog("info", `Subtracted ${record.qty} units from warehouse stock due to return record deletion.`);
                    dbUpsertSKU(skuItem);
                }
            }
        }

        returns = returns.filter(r => r.id !== id);
        addLog("warning", `Removed return/RTO log entry for order ${record.orderId}.`);
        dbDeleteReturn(id);
        saveState();
        renderAll();
        
        // Redraw charts if we are on the analytics section
        const activeSection = document.querySelector(".dashboard-section.active");
        if (activeSection && activeSection.id === "analytics-section") {
            renderCharts();
        }
    }
};

// Simulated Multi-channel Synchronization Engine
function initGlobalSync() {
    const mainSyncBtn = document.getElementById("global-sync-btn");
    const panelSyncBtn = document.getElementById("manual-sync-btn");

    if (mainSyncBtn) {
        mainSyncBtn.addEventListener("click", () => simulateChannelSync());
    }

    if (panelSyncBtn) {
        panelSyncBtn.addEventListener("click", () => simulateChannelSync());
    }
}

function simulateChannelSync(isInitial = false) {
    const mainSyncBtn = document.getElementById("global-sync-btn");
    const panelSyncBtn = document.getElementById("manual-sync-btn");
    const icon = document.getElementById("sync-btn-icon");
    const iconPanel = document.getElementById("sync-btn-icon-panel");
    const progressBar = document.getElementById("sync-progress-bar");
    const progressText = document.getElementById("sync-progress-percentage");

    const badgeAmz = document.getElementById("badge-amazon");
    const badgeFk = document.getElementById("badge-flipkart");
    const badgeMs = document.getElementById("badge-meesho");

    // Add animation classes
    if (icon) icon.style.animation = "spin 1s infinite linear";
    if (iconPanel) iconPanel.style.animation = "spin 1s infinite linear";
    if (progressBar) {
        progressBar.style.width = "10%";
        progressText.textContent = "Syncing (10%)...";
    }

    // Set badges to syncing state
    [badgeAmz, badgeFk, badgeMs].forEach(badge => {
        if (badge) {
            badge.textContent = "Syncing...";
            badge.className = "sync-badge syncing";
        }
    });

    if (!isInitial) {
        addLog("info", "Initiating API handshake with marketplaces (Amazon, Flipkart, Meesho)...");
    }

    // Phase 1: 300ms Amazon Sync
    setTimeout(() => {
        if (progressBar) {
            progressBar.style.width = "40%";
            progressText.textContent = "Syncing Amazon (40%)...";
        }
        if (badgeAmz) {
            badgeAmz.textContent = "Synced";
            badgeAmz.className = "sync-badge synced";
        }
        if (!isInitial) {
            addLog("success", `Amazon inventory synced: ${skus.length} active SKUs updated on Seller Portal.`);
        }
        
        // Update dashboard channel text
        const amzText = document.getElementById("channel-amazon-text");
        if (amzText) amzText.textContent = "Last synced: Just now";

    }, 500);

    // Phase 2: 700ms Flipkart Sync
    setTimeout(() => {
        if (progressBar) {
            progressBar.style.width = "75%";
            progressText.textContent = "Syncing Flipkart (75%)...";
        }
        if (badgeFk) {
            badgeFk.textContent = "Synced";
            badgeFk.className = "sync-badge synced";
        }
        if (!isInitial) {
            addLog("success", `Flipkart inventory synced: ${skus.length} active listing nodes successfully mapped.`);
        }
        
        const fkText = document.getElementById("channel-flipkart-text");
        if (fkText) fkText.textContent = "Last synced: Just now";

    }, 1000);

    // Phase 3: 1100ms Meesho Sync & Completion
    setTimeout(() => {
        if (progressBar) {
            progressBar.style.width = "100%";
            progressText.textContent = "100% Synced";
        }
        if (badgeMs) {
            badgeMs.textContent = "Synced";
            badgeMs.className = "sync-badge synced";
        }
        if (!isInitial) {
            addLog("success", `Meesho inventory synced: Stock counts refreshed across suppliers.`);
            addLog("success", `Stock Sync completed successfully. Central warehouse is now unified across all marketplaces!`);
        }
        
        const msText = document.getElementById("channel-meesho-text");
        if (msText) msText.textContent = "Last synced: Just now";

        // Stop animations
        if (icon) icon.style.animation = "";
        if (iconPanel) iconPanel.style.animation = "";

        // Re-render components
        renderAll();
    }, 1500);
}

// CSS Rotation inject for spin animation on sync
const styleSheet = document.createElement("style");
styleSheet.innerText = `
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(styleSheet);

// HTML escaping helper
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Chart.js graphics rendering
function renderCharts() {
    const activeSection = document.querySelector(".dashboard-section.active");
    // Only render if analytics section is active, to avoid canvas rendering size bugs
    if (!activeSection || activeSection.id !== "analytics-section") return;

    // Destroy existing charts to reload fresh data
    if (marketplaceChart) marketplaceChart.destroy();
    if (reasonsChart) reasonsChart.destroy();
    if (trendChart) trendChart.destroy();
    if (skuChart) skuChart.destroy();

    // 1. Marketplace comparison (Amazon vs Flipkart vs Meesho)
    const marketplaceCounts = { amazon: 0, flipkart: 0, meesho: 0 };
    returns.forEach(r => {
        if (marketplaceCounts[r.marketplace] !== undefined) {
            marketplaceCounts[r.marketplace] += parseInt(r.qty);
        }
    });

    const ctxMarketplace = document.getElementById("marketplaceComparisonChart").getContext("2d");
    marketplaceChart = new Chart(ctxMarketplace, {
        type: 'doughnut',
        data: {
            labels: ['Amazon', 'Flipkart', 'Meesho'],
            datasets: [{
                data: [marketplaceCounts.amazon, marketplaceCounts.flipkart, marketplaceCounts.meesho],
                backgroundColor: ['#ff9900', '#2874f0', '#f43f5e'],
                borderColor: 'rgba(255, 255, 255, 0.08)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#9ca3af', boxWidth: 12, padding: 15 }
                }
            }
        }
    });

    // 2. Return Reasons Breakdown
    const reasonCounts = {};
    returns.forEach(r => {
        reasonCounts[r.reason] = (reasonCounts[r.reason] || 0) + parseInt(r.qty);
    });

    const ctxReasons = document.getElementById("returnReasonsChart").getContext("2d");
    reasonsChart = new Chart(ctxReasons, {
        type: 'pie',
        data: {
            labels: Object.keys(reasonCounts),
            datasets: [{
                data: Object.values(reasonCounts),
                backgroundColor: [
                    '#f59e0b', // orange
                    '#ef4444', // red
                    '#3b82f6', // blue
                    '#10b981', // green
                    '#8b5cf6', // purple
                    '#6b7280'  // gray
                ],
                borderColor: 'rgba(255, 255, 255, 0.08)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#9ca3af', boxWidth: 10, padding: 10 }
                }
            }
        }
    });

    // 3. RTO vs Returns Trend (Last 6 Months)
    // We group by month (mock trend for older months plus live data)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const rtoTrend = [18, 25, 15, 30, 22, 0]; // Jan - May mock, Jun is live RTO
    const returnTrend = [12, 10, 8, 14, 18, 0]; // Jan - May mock, Jun is live Returns

    // Add current live June entries to June trend index 5
    returns.forEach(r => {
        // Assume returns logged are in June
        if (r.type === 'RTO') {
            rtoTrend[5] += parseInt(r.qty);
        } else {
            returnTrend[5] += parseInt(r.qty);
        }
    });

    const ctxTrend = document.getElementById("rtoTrendChart").getContext("2d");
    trendChart = new Chart(ctxTrend, {
        type: 'bar',
        data: {
            labels: months,
            datasets: [
                {
                    label: 'RTO (Undelivered)',
                    data: rtoTrend,
                    backgroundColor: 'rgba(245, 158, 11, 0.75)',
                    borderColor: '#f59e0b',
                    borderWidth: 1
                },
                {
                    label: 'Customer Return',
                    data: returnTrend,
                    backgroundColor: 'rgba(6, 182, 212, 0.75)',
                    borderColor: '#06b6d4',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#9ca3af' }
                }
            }
        }
    });

    // 4. SKU-wise Returns volume (Top 5 returned items)
    const skuCounts = {};
    returns.forEach(r => {
        skuCounts[r.sku] = (skuCounts[r.sku] || 0) + parseInt(r.qty);
    });

    // Sort SKUs descending by volume
    const sortedSKUs = Object.entries(skuCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const ctxSku = document.getElementById("skuReturnChart").getContext("2d");
    skuChart = new Chart(ctxSku, {
        type: 'bar',
        data: {
            labels: sortedSKUs.map(entry => entry[0]),
            datasets: [{
                label: 'Returned Quantity',
                data: sortedSKUs.map(entry => entry[1]),
                backgroundColor: 'rgba(99, 102, 241, 0.7)',
                borderColor: '#6366f1',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } },
                y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af' } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });

    // 5. Update Financial Loss calculations
    // Estimated shipping loss: ₹80 per RTO unit
    const totalRTOUnits = returns.filter(r => r.type === "RTO").reduce((sum, item) => sum + parseInt(item.qty), 0);
    const shippingLoss = totalRTOUnits * 80;
    document.getElementById("financial-loss-shipping").textContent = `₹${shippingLoss.toLocaleString('en-IN')}`;

    // Estimated damaged item loss: ₹200 per damaged return unit
    const totalDamagedUnits = returns.filter(r => r.status === "damaged").reduce((sum, item) => sum + parseInt(item.qty), 0);
    const damagedLoss = totalDamagedUnits * 200;
    document.getElementById("financial-loss-damaged").textContent = `₹${damagedLoss.toLocaleString('en-IN')}`;

    // Recovered stock value: ₹150 per restocked unit
    const totalRestockedUnits = returns.filter(r => r.status === "restocked").reduce((sum, item) => sum + parseInt(item.qty), 0);
    const recoveredValue = totalRestockedUnits * 150;
    document.getElementById("financial-recovered").textContent = `₹${recoveredValue.toLocaleString('en-IN')}`;
}

// Backup & Export Data functionality
function initCSVExport() {
    const exportBtn = document.getElementById("export-csv-btn");
    if (!exportBtn) return;

    exportBtn.addEventListener("click", () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        
        // Part 1: SKUs section
        csvContent += "=== CATALOG SKU INVENTORY ===\n";
        csvContent += "SKU Code,Product Name,Warehouse Stock,Alert Threshold,Amazon Ratio (%),Flipkart Ratio (%),Meesho Ratio (%)\n";
        
        skus.forEach(s => {
            const nameEscaped = s.name.replace(/"/g, '""');
            csvContent += `"${s.code}","${nameEscaped}",${s.warehouseStock},${s.threshold},${s.ratioAmazon},${s.ratioFlipkart},${s.ratioMeesho}\n`;
        });

        csvContent += "\n\n";

        // Part 2: Returns/RTO section
        csvContent += "=== LOGGED RETURNS AND RTO RECORDS ===\n";
        csvContent += "Date,Order ID,Marketplace,SKU,Type,Quantity,Reason,Restock Status\n";

        returns.forEach(r => {
            const reasonEscaped = r.reason.replace(/"/g, '""');
            csvContent += `"${r.date}","${r.orderId}","${r.marketplace}","${r.sku}","${r.type}",${r.qty},"${reasonEscaped}","${r.status}"\n`;
        });

        // Download trigger
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `KARTUNBOX_Data_Report_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        addLog("info", "Exported inventory and return data to CSV backup file.");
    });
}

// === SUPABASE DATABASE OPERATION HELPMATES ===

// Upsert SKU to Supabase
async function dbUpsertSKU(sku) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('skus')
            .upsert({
                id: sku.id,
                code: sku.code,
                name: sku.name,
                warehouseStock: parseInt(sku.warehouseStock),
                threshold: parseInt(sku.threshold),
                ratioAmazon: parseInt(sku.ratioAmazon),
                ratioFlipkart: parseInt(sku.ratioFlipkart),
                ratioMeesho: parseInt(sku.ratioMeesho),
                updated_at: new Date().toISOString()
            });
        if (error) throw error;
        console.log(`SKU ${sku.code} successfully upserted to Supabase.`);
    } catch (err) {
        console.error(`Supabase error upserting SKU ${sku.code}:`, err);
        addLog("error", `Supabase sync failed for SKU ${sku.code}: ` + err.message);
    }
}

// Delete SKU from Supabase
async function dbDeleteSKU(id) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('skus')
            .delete()
            .eq('id', id);
        if (error) throw error;
        console.log(`SKU ID ${id} deleted from Supabase.`);
    } catch (err) {
        console.error(`Supabase error deleting SKU ${id}:`, err);
        addLog("error", `Supabase delete failed: ` + err.message);
    }
}

// Upsert Return/RTO Log to Supabase
async function dbUpsertReturn(ret) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('returns')
            .upsert({
                id: ret.id,
                date: ret.date,
                orderId: ret.orderId,
                sku: ret.sku,
                marketplace: ret.marketplace,
                type: ret.type,
                qty: parseInt(ret.qty),
                reason: ret.reason,
                status: ret.status,
                updated_at: new Date().toISOString()
            });
        if (error) throw error;
        console.log(`Return/RTO ${ret.orderId} successfully saved to Supabase.`);
    } catch (err) {
        console.error(`Supabase error saving Return ${ret.orderId}:`, err);
        addLog("error", `Supabase sync failed for Return ${ret.orderId}: ` + err.message);
    }
}

// Delete Return/RTO Log from Supabase
async function dbDeleteReturn(id) {
    if (!supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from('returns')
            .delete()
            .eq('id', id);
        if (error) throw error;
        console.log(`Return ID ${id} deleted from Supabase.`);
    } catch (err) {
        console.error(`Supabase error deleting Return ${id}:`, err);
        addLog("error", `Supabase delete failed: ` + err.message);
    }
}
