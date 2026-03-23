/* Vehicle Sale POS - single file app logic (HTML/CSS/JS only) */

const DB_KEY = "vehicle_pos_db_v1";
const AUTH_KEY = "vehicle_pos_auth_v1";
const SESSION_KEY = "vehicle_pos_session_v1";
/** When "Keep me logged in" is used, session is also stored here (survives browser restart). */
const SESSION_PERSIST_KEY = "vehicle_pos_session_persist_v1";
const INVOICE_SENT_TEMPLATE =
  "Hi {{Customer Name}}, your invoice {{Invoice Number}} for {{Amount}}. Thank you for your business! - {{Company Name}}";
const INVOICE_SENT_TEMPLATE_OLD =
  "Hi {{Customer Name}}, your invoice {{Invoice Number}} for {{Amount}} is now available. Thank you for your business! - {{Company Name}}";

const PERMS = {
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_EDIT: "inventory.edit",
  INVENTORY_DELETE: "inventory.delete",
  DOCS_MANAGE: "docs.manage",
  BILLING_USE: "billing.use",
  BILLING_SALE: "billing.sale",
  BILLING_PRINT: "billing.print",
  LEDGER_VIEW: "ledger.view",
  LEDGER_ADD: "ledger.add",
  LEDGER_DELETE: "ledger.delete",
  REPORTS_VIEW: "reports.view",
  REPORTS_EXPORT: "reports.export",
  REPORTS_VOID: "reports.void",
  USERS_MANAGE: "users.manage",
  DATA_IMPORT_EXPORT: "data.import_export",
  DATA_RESET: "data.reset",
  BRANDING_EDIT: "branding.edit",
};

const ROLE_PERMS = {
  cashier: [
    PERMS.INVENTORY_VIEW,
    PERMS.INVENTORY_EDIT,
    PERMS.DOCS_MANAGE,
    PERMS.BILLING_USE,
    PERMS.BILLING_SALE,
    PERMS.BILLING_PRINT,
    PERMS.LEDGER_VIEW,
    PERMS.LEDGER_ADD,
  ],
  supervisor: [
    PERMS.INVENTORY_VIEW,
    PERMS.INVENTORY_EDIT,
    PERMS.DOCS_MANAGE,
    PERMS.BILLING_USE,
    PERMS.BILLING_SALE,
    PERMS.BILLING_PRINT,
    PERMS.LEDGER_VIEW,
    PERMS.LEDGER_ADD,
    PERMS.REPORTS_VIEW,
    PERMS.REPORTS_EXPORT,
  ],
  manager: [
    PERMS.INVENTORY_VIEW,
    PERMS.INVENTORY_EDIT,
    PERMS.INVENTORY_DELETE,
    PERMS.DOCS_MANAGE,
    PERMS.BILLING_USE,
    PERMS.BILLING_SALE,
    PERMS.BILLING_PRINT,
    PERMS.LEDGER_VIEW,
    PERMS.LEDGER_ADD,
    PERMS.LEDGER_DELETE,
    PERMS.REPORTS_VIEW,
    PERMS.REPORTS_EXPORT,
    PERMS.REPORTS_VOID,
    PERMS.BRANDING_EDIT,
    PERMS.DATA_IMPORT_EXPORT,
  ],
  admin: ["*"],
};

function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(n) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { style: "currency", currency: "LKR" });
}

function numberToWords(n) {
  const num = Math.floor(Math.max(0, Number(n || 0)));
  if (num === 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const chunk = (x) => {
    let s = "";
    const h = Math.floor(x / 100);
    const r = x % 100;
    if (h) s += `${ones[h]} Hundred `;
    if (r >= 10 && r < 20) s += `${teens[r - 10]} `;
    else {
      const t = Math.floor(r / 10);
      const o = r % 10;
      if (t) s += `${tens[t]} `;
      if (o) s += `${ones[o]} `;
    }
    return s.trim();
  };
  const parts = [
    { v: 1000000000, n: "Billion" },
    { v: 1000000, n: "Million" },
    { v: 1000, n: "Thousand" },
    { v: 1, n: "" },
  ];
  let rem = num;
  const out = [];
  for (const p of parts) {
    const c = Math.floor(rem / p.v);
    if (c) out.push(`${chunk(c)}${p.n ? ` ${p.n}` : ""}`);
    rem %= p.v;
  }
  return out.join(" ").trim();
}

function safeNumber(n, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("is-on");
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.classList.remove("is-on"), 2200);
}

function $(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function $$ (sel) {
  return Array.from(document.querySelectorAll(sel));
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function createEmptyDb() {
  return {
    meta: {
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      companyName: "E-Inventory",
      companyAddress: "",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
      invoiceLogoDataUrl: "",
      invoiceSentAuto: false,
      invoiceSentTemplate: INVOICE_SENT_TEMPLATE,
      // Inventory report settings are stored per vehicle type.
      // Example: waste/reorderPoint values are user-entered (not derived from sales history).
      inventoryReports: { typeSettings: {} },
    },
    vehicles: [],
    brokers: [],
    suppliers: [],
    purchases: [],
    cart: { items: [], discount: 0 },
    sales: [],
    ledger: [],
    customers: [],
    garageJobs: [],
    quotations: [],
  };
}

let db = loadDb() ?? createEmptyDb();
let useRemoteDb = false;
let persistTimer = null;

function normalizeImportedDb(parsed) {
  if (!parsed || typeof parsed !== "object") return createEmptyDb();
  return {
    ...createEmptyDb(),
    ...parsed,
    meta: { ...createEmptyDb().meta, ...(parsed.meta || {}), version: 1, updatedAt: nowIso() },
  };
}

async function fetchPosApi(path, options = {}) {
  const base = POS_API_BASE.replace(/\/?$/, "");
  const p = path.replace(/^\//, "");
  const url = `${base}/${p}`;
  const headers = { ...(options.headers || {}) };
  if (POS_API_KEY) headers["X-POS-API-Key"] = POS_API_KEY;
  if (options.body && typeof options.body === "string" && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(url, { ...options, headers });
  let body = null;
  try {
    body = await r.json();
  } catch {
    body = null;
  }
  return { res: r, ok: r.ok, body };
}

async function flushDbRemoteNow() {
  if (!useRemoteDb) return { ok: true };
  const { res, body } = await fetchPosApi("data.php", {
    method: "POST",
    body: JSON.stringify(db),
  });
  const ok = res.ok && body && body.ok;
  return { ok: !!ok };
}

async function refreshUsersFromServer() {
  if (!useRemoteDb) return;
  const { ok, body } = await fetchPosApi("users.php", { method: "GET" });
  if (ok && body && body.ok && Array.isArray(body.users)) {
    auth.users = body.users;
    auth.updatedAt = nowIso();
    saveAuth(auth);
  }
}

async function initRemoteStorage() {
  useRemoteDb = false;
  try {
    const dr = await fetchPosApi("data.php", { method: "GET" });
    if (!dr.ok || !dr.body || !dr.body.ok) return;

    const ur = await fetchPosApi("users.php", { method: "GET" });
    if (!ur.ok || !ur.body || !ur.body.ok || !Array.isArray(ur.body.users)) return;

    useRemoteDb = true;
    auth.users = ur.body.users;
    auth.updatedAt = nowIso();
    saveAuth(auth);

    if (dr.body.data != null) {
      db = normalizeImportedDb(dr.body.data);
      saveDb(db);
    } else {
      await flushDbRemoteNow();
    }
  } catch {
    useRemoteDb = false;
  }
}

function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveAuth(a) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(a));
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(session) {
  if (!session) {
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function ensureAuthSeed() {
  const auth = loadAuth();
  if (auth && Array.isArray(auth.users)) {
    // session is intentionally not persisted across browser close
    auth.session = loadSession();
    return auth;
  }
  const seeded = {
    users: [
      { id: uid("usr"), username: "admin", password: "admin123", role: "admin", name: "Admin", disabled: false },
      { id: uid("usr"), username: "cashier", password: "cashier123", role: "cashier", name: "Cashier", disabled: false },
    ],
    session: loadSession(),
    updatedAt: nowIso(),
  };
  saveAuth(seeded);
  return seeded;
}

let auth = ensureAuthSeed();

function currentUser() {
  return auth.session?.user ?? null;
}

function isAdmin() {
  return currentUser()?.role === "admin";
}

function rolePerms(role) {
  return ROLE_PERMS[role] ?? [];
}

function can(perm) {
  const u = currentUser();
  if (!u) return false;
  if (u.role === "admin") return true;

  // Prefer explicit permissions if present on session (created users), but
  // fall back to role mapping to support older saved users/sessions.
  const explicitPerms = Array.isArray(u.permissions) ? u.permissions : null;
  const perms = explicitPerms ?? rolePerms(u.role);
  return perms.includes("*") || perms.includes(perm);
}

function requirePerm(action, perm) {
  const u = currentUser();
  if (!u) {
    toast("Please login.");
    openLogin();
    throw new Error("Not logged in");
  }
  if (!can(perm)) {
    toast(`No permission: ${action}`);
    throw new Error("No permission");
  }
}

function formatSessionStarted(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function updateMainMenuAccount() {
  const el = document.querySelector("#menuAccountInfo");
  if (!el) return;
  const u = currentUser();
  if (!u) {
    el.innerHTML = `
      <p class="menu__accountStrong">Not signed in</p>
      <p class="menu__accountMuted">Use <strong>Log in</strong> below to access the system.</p>`;
    return;
  }
  const name = escapeHtml(u.name || u.username);
  const uname = escapeHtml(u.username);
  const role = escapeHtml(String(u.role || "").toUpperCase());
  const started = escapeHtml(formatSessionStarted(auth.session?.loggedInAt));
  el.innerHTML = `
    <p class="menu__accountStrong">${name}</p>
    <p class="menu__accountMuted">@${uname} · ${role}</p>
    <p class="menu__accountSession">Signed in: ${started}</p>`;
}

function canAccessGarageCustomer() {
  return can(PERMS.INVENTORY_VIEW) || can(PERMS.BILLING_USE);
}

function canManageGarageCustomerData() {
  return can(PERMS.INVENTORY_EDIT) || can(PERMS.BILLING_USE);
}

function setUserUi() {
  const u = currentUser();
  const pill = $("#userPill");
  const btnLogout = $("#btnLogout");
  const btnMenuLogin = document.querySelector("#btnMenuLogin");
  const btnMenuLogout = document.querySelector("#btnMenuLogout");

  updateMainMenuAccount();

  if (!u) {
    pill.hidden = true;
    btnLogout.hidden = true;
    if (btnMenuLogin) btnMenuLogin.hidden = false;
    if (btnMenuLogout) btnMenuLogout.hidden = true;
    document.querySelectorAll("#mainMenu .menu__panel [data-nav]").forEach((navEl) => {
      navEl.hidden = true;
    });
    document.querySelector("#mainMenu .menu__panel")?.classList.add("menu__panel--guest");
    return;
  }
  document.querySelector("#mainMenu .menu__panel")?.classList.remove("menu__panel--guest");
  $("#userNameLabel").textContent = u.name || u.username;
  $("#userRoleLabel").textContent = u.role.toUpperCase();
  pill.hidden = false;
  // Only show Log out inside the main menu (not on the header).
  btnLogout.hidden = true;
  if (btnMenuLogin) btnMenuLogin.hidden = true;
  if (btnMenuLogout) btnMenuLogout.hidden = false;

  const admin = isAdmin();

  // RBAC controls
  $("#btnResetAll").disabled = !can(PERMS.DATA_RESET);
  $("#btnResetAll").title = can(PERMS.DATA_RESET) ? "Clears all saved data" : "Not allowed";

  $("#btnExportData").disabled = !can(PERMS.DATA_IMPORT_EXPORT);
  $("#btnExportData").title = can(PERMS.DATA_IMPORT_EXPORT) ? "Export data JSON" : "Not allowed";

  $("#importFile").disabled = !can(PERMS.DATA_IMPORT_EXPORT);
  const importLabel = document.querySelector('label[for="importFile"]');
  if (importLabel) {
    importLabel.style.pointerEvents = can(PERMS.DATA_IMPORT_EXPORT) ? "" : "none";
    importLabel.style.opacity = can(PERMS.DATA_IMPORT_EXPORT) ? "1" : "0.5";
    importLabel.title = can(PERMS.DATA_IMPORT_EXPORT) ? "Import data JSON" : "Not allowed";
  }

  $("#invoiceLogoInput").disabled = !can(PERMS.BRANDING_EDIT);
  $("#btnClearInvoiceLogo").disabled = !can(PERMS.BRANDING_EDIT);
  $("#companyName").disabled = !can(PERMS.BRANDING_EDIT);

  const btnAddNv = document.querySelector("#btnAddNewVehicle");
  if (btnAddNv) {
    const ok = can(PERMS.INVENTORY_EDIT);
    btnAddNv.hidden = !ok;
    btnAddNv.disabled = !ok;
    btnAddNv.title = ok ? "Open add-vehicle form" : "Not allowed";
  }

  const btnAddGj = document.querySelector("#btnAddNewGarageJob");
  if (btnAddGj) {
    const ok = canManageGarageCustomerData();
    btnAddGj.hidden = !ok;
    btnAddGj.disabled = !ok;
    btnAddGj.title = ok ? "Open add-garage-job form" : "Not allowed";
  }

  const btnAddBroker = document.querySelector("#btnAddNewBroker");
  if (btnAddBroker) {
    const ok = isAdmin();
    btnAddBroker.hidden = !ok;
    btnAddBroker.disabled = !ok;
    btnAddBroker.title = ok ? "Open add-broker window" : "Admin only";
  }

  const btnAddLedger = document.querySelector("#btnAddNewLedgerEntry");
  if (btnAddLedger) {
    const ok = can(PERMS.LEDGER_ADD);
    btnAddLedger.hidden = !ok;
    btnAddLedger.disabled = !ok;
    btnAddLedger.title = ok ? "Open add-ledger-entry window" : "Not allowed";
  }

  const btnAddCustomer = document.querySelector("#btnAddNewCustomer");
  if (btnAddCustomer) {
    const ok = canManageGarageCustomerData();
    btnAddCustomer.hidden = !ok;
    btnAddCustomer.disabled = !ok;
    btnAddCustomer.title = ok ? "Open add-customer window" : "Not allowed";
  }

  const btnAddSupplier = document.querySelector("#btnAddNewSupplier");
  if (btnAddSupplier) {
    const ok = isAdmin();
    btnAddSupplier.hidden = !ok;
    btnAddSupplier.disabled = !ok;
    btnAddSupplier.title = ok ? "Open add-supplier window" : "Admin only";
  }

  // Role-based navigation (Home + Main Menu items)
  const allowNav = [
    "home",
    ...(can(PERMS.INVENTORY_VIEW) ? ["inventory"] : []),
    ...(can(PERMS.INVENTORY_VIEW) ? ["inventoryReports"] : []),
    ...(can(PERMS.BILLING_USE) ? ["billing"] : []),
    ...(can(PERMS.BILLING_USE) ? ["quotation"] : []),
    ...(can(PERMS.LEDGER_VIEW) ? ["ledger"] : []),
    ...(can(PERMS.REPORTS_VIEW) ? ["reports", "soldVehicleReports"] : []),
    ...(canAccessGarageCustomer() ? ["garage", "customer"] : []),
    ...(can(PERMS.USERS_MANAGE) ? ["users"] : []),
    ...(isAdmin() ? ["brokers", "purchase", "suppliers"] : []),
  ];

  document.querySelectorAll("[data-nav]").forEach((el) => {
    const key = el.dataset.nav;
    el.hidden = !allowNav.includes(key);
  });

  const homeNavMap = [
    { sel: "#btnGoInventory", tab: "inventory" },
    { sel: "#btnHomeBilling", tab: "billing" },
    { sel: "#btnHomePurchase", tab: "purchase" },
    { sel: "#btnHomeSupplier", tab: "suppliers" },
    { sel: "#btnHomeCustomer", tab: "customer" },
  ];
  for (const item of homeNavMap) {
    const btn = document.querySelector(item.sel);
    if (!btn) continue;
    const ok = canOpenNav(item.tab);
    btn.disabled = !ok;
    btn.hidden = !ok;
  }

  // If user can't access any report sections, hide the "Reports" submenu.
  const reportsSubMenu = document.querySelector("#reportsSubMenu");
  if (reportsSubMenu) {
    const anyVisible = Array.from(reportsSubMenu.querySelectorAll("[data-nav]")).some(
      (el) => !el.hidden
    );
    reportsSubMenu.hidden = !anyVisible;
  }

  const activeKey = document.querySelector("[data-nav].is-active")?.dataset.nav;
  if (activeKey && !allowNav.includes(activeKey)) setActiveTab("home");
}

function openLogin() {
  const d = $("#loginDialog");
  $("#loginError").textContent = "";
  $("#loginUsername").value = "";
  $("#loginPassword").value = "";
  setCopyrightTexts();
  d.showModal();
  setTimeout(() => $("#loginUsername").focus(), 0);
}

function closeLogin() {
  const d = $("#loginDialog");
  if (d.open) d.close();
}

function normalizeUsername(u) {
  return String(u || "").trim().toLowerCase();
}

async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(username, password) {
  // lightweight client-side hashing (still not secure like a real server, but avoids plain-text storage)
  const u = normalizeUsername(username);
  return await sha256Hex(`vehicle-pos|${u}|${password}`);
}

async function migratePasswordsToHash() {
  if (useRemoteDb) return;
  let changed = false;
  for (const u of auth.users) {
    if (!u) continue;
    if (u.passwordHash) continue;
    if (u.password) {
      u.passwordHash = await hashPassword(u.username, u.password);
      delete u.password;
      changed = true;
    }
    if (!u.id) {
      u.id = uid("usr");
      changed = true;
    }
    if (typeof u.disabled !== "boolean") {
      u.disabled = false;
      changed = true;
    }
  }
  if (changed) {
    auth.updatedAt = nowIso();
    saveAuth(auth);
  }
}

async function login(username, password) {
  const uname = normalizeUsername(username);
  const pass = String(password);
  const keepLoggedIn = !!document.querySelector("#loginRemember")?.checked;

  if (useRemoteDb) {
    const { ok, body } = await fetchPosApi("login.php", {
      method: "POST",
      body: JSON.stringify({ username: uname, password: pass }),
    });
    if (!ok || !body || !body.ok || !body.user) return false;
    const u = body.user;
    if (u.disabled) return false;
    auth.session = {
      user: {
        id: u.id,
        username: u.username,
        name: u.name,
        role: u.role,
        permissions: Array.isArray(u.permissions) ? u.permissions : ROLE_PERMS[u.role] ?? [],
      },
      loggedInAt: nowIso(),
    };
    auth.updatedAt = nowIso();
    saveAuth(auth);
    saveSession(auth.session);
    setUserUi();
    closeLogin();
    toast(`Logged in as ${u.role}.`);
    return true;
  }

  await migratePasswordsToHash();
  const passHash = await hashPassword(uname, pass);
  const u = auth.users.find((x) => normalizeUsername(x.username) === uname && x.passwordHash === passHash);
  if (!u || u.disabled) return false;
  auth.session = {
    user: {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      permissions: ROLE_PERMS[u.role] ?? u.permissions ?? [],
    },
    loggedInAt: nowIso(),
  };
  auth.updatedAt = nowIso();
  saveAuth(auth);
  saveSession(auth.session, keepLoggedIn);
  setUserUi();
  closeLogin();
  toast(`Logged in as ${u.role}.`);
  return true;
}

function logout() {
  auth.session = null;
  auth.updatedAt = nowIso();
  saveAuth(auth);
  saveSession(null);
  setUserUi();
  toast("Logged out.");
  openLogin();
}

function userMatchesQuery(u, q) {
  if (!q) return true;
  const hay = `${u.username ?? ""} ${u.name ?? ""} ${u.role ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderUsers() {
  if (!document.querySelector("#usersTable")) return;
  if (!can(PERMS.USERS_MANAGE)) return;

  const tbody = $("#usersTable tbody");
  tbody.innerHTML = "";
  const q = ($("#userSearch").value || "").trim();

  const list = (auth.users || [])
    .slice()
    .sort((a, b) => normalizeUsername(a.username).localeCompare(normalizeUsername(b.username)))
    .filter((u) => userMatchesQuery(u, q));

  for (const u of list) {
    const tr = document.createElement("tr");
    const status = u.disabled ? `<span class="pill pill--warn">DISABLED</span>` : `<span class="pill pill--ok">ACTIVE</span>`;

    const permsArr = u.role === "admin" ? ["*"] : Array.isArray(u.permissions) ? u.permissions : rolePerms(u.role);
    const permsText = permsArr.includes("*") ? "All" : permsArr.join(", ");

    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(u.username)}</span></td>
      <td><strong>${escapeHtml(u.name || "")}</strong></td>
      <td>${escapeHtml(u.role || "")}</td>
      <td>${escapeHtml(permsText)}</td>
      <td>${status}</td>
      <td class="actions"></td>
    `;

    const actions = tr.querySelector(".actions");
    const isSelf = currentUser()?.id && u.id === currentUser()?.id;
    const isAdminUser = normalizeUsername(u.username) === "admin";

    const btnToggle = mkBtn(u.disabled ? "Enable" : "Disable", "btn btn--ghost");
    btnToggle.disabled = isAdminUser || isSelf;
    btnToggle.title = btnToggle.disabled ? "Cannot disable this user" : "";
    btnToggle.addEventListener("click", () => toggleUserDisabled(u.id));

    const btnReset = mkBtn("Reset PW", "btn");
    btnReset.disabled = isAdminUser && isSelf;
    btnReset.addEventListener("click", () => resetUserPassword(u.id));

    actions.append(btnToggle, btnReset);
    tbody.appendChild(tr);
  }

  $("#usersSummary").textContent = `${list.length} user${list.length === 1 ? "" : "s"}`;
}

function normalizeBroker(b) {
  return {
    id: b.id ?? uid("brk"),
    name: String(b.name ?? "").trim(),
    phone: String(b.phone ?? "").trim(),
    email: String(b.email ?? "").trim(),
    address: String(b.address ?? "").trim(),
    notes: String(b.notes ?? "").trim(),
    createdAt: b.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

function renderBrokers() {
  const table = document.querySelector("#brokersTable tbody");
  if (!table) return;
  const q = (document.querySelector("#brokerSearch")?.value || "").trim().toLowerCase();
  const list = (db.brokers || [])
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .filter((b) => {
      if (!q) return true;
      const hay = `${b.name ?? ""} ${b.phone ?? ""} ${b.email ?? ""} ${b.address ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  table.innerHTML = "";
  for (const b of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(b.name || "")}</strong></td>
      <td>${escapeHtml(b.phone || "")}</td>
      <td>${escapeHtml(b.email || "")}</td>
      <td>${escapeHtml(b.address || "")}</td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnEdit = mkBtn("Edit", "btn btn--ghost");
    btnEdit.addEventListener("click", () => openBrokerFormDialogForEdit(b.id));
    const btnDel = mkBtn("Delete", "btn btn--danger");
    btnDel.addEventListener("click", () => deleteBroker(b.id));
    actions.append(btnEdit, btnDel);
    table.appendChild(tr);
  }

  const summary = document.querySelector("#brokersSummary");
  if (summary) summary.textContent = `${list.length} broker${list.length === 1 ? "" : "s"}`;

  // update vehicle broker dropdown based on latest brokers
  renderVehicleBrokerOptions();
}

function fillBrokerForm(id) {
  const b = (db.brokers || []).find((x) => x.id === id);
  if (!b) return;
  const form = document.querySelector("#brokerForm");
  if (!form) return;
  document.querySelector("#brokerId").value = b.id;
  document.querySelector("#brokerName").value = b.name || "";
  document.querySelector("#brokerPhone").value = b.phone || "";
  document.querySelector("#brokerEmail").value = b.email || "";
  document.querySelector("#brokerAddress").value = b.address || "";
  document.querySelector("#brokerNotes").value = b.notes || "";
}

function clearBrokerForm() {
  const form = document.querySelector("#brokerForm");
  if (!form) return;
  form.reset();
  const idEl = document.querySelector("#brokerId");
  if (idEl) idEl.value = "";
}

function ensureBrokerDialogMount() {
  const body = document.querySelector("#brokerFormDialogBody");
  const form = document.querySelector("#brokerForm");
  if (!body || !form) return;
  if (body.contains(form)) return;
  form.hidden = false;
  body.innerHTML = "";
  body.appendChild(form);
}

function closeBrokerFormDialog() {
  document.querySelector("#brokerFormDialog")?.close();
}

function openBrokerFormDialogForNew() {
  if (!isAdmin()) {
    toast("Only admin can manage brokers.");
    return;
  }
  ensureBrokerDialogMount();
  const t = document.querySelector("#brokerFormDialogTitle");
  if (t) t.textContent = "Add Broker";
  const b = document.querySelector("#brokerFormDialogBadge");
  if (b) b.textContent = "New";
  clearBrokerForm();
  document.querySelector("#brokerFormDialog")?.showModal();
}

function openBrokerFormDialogForEdit(id) {
  if (!isAdmin()) {
    toast("Only admin can manage brokers.");
    return;
  }
  ensureBrokerDialogMount();
  const t = document.querySelector("#brokerFormDialogTitle");
  if (t) t.textContent = "Edit Broker";
  const b = document.querySelector("#brokerFormDialogBadge");
  if (b) b.textContent = "Edit";
  fillBrokerForm(id);
  document.querySelector("#brokerFormDialog")?.showModal();
}

function upsertBrokerFromForm(e) {
  e.preventDefault();
  if (!isAdmin()) {
    toast("Only admin can manage brokers.");
    return;
  }
  const id = document.querySelector("#brokerId").value.trim() || undefined;
  const payload = {
    id,
    name: document.querySelector("#brokerName").value,
    phone: document.querySelector("#brokerPhone").value,
    email: document.querySelector("#brokerEmail").value,
    address: document.querySelector("#brokerAddress").value,
    notes: document.querySelector("#brokerNotes").value,
  };
  const b = normalizeBroker(payload);
  if (!b.name) {
    toast("Broker name is required.");
    return;
  }
  db.brokers = Array.isArray(db.brokers) ? db.brokers : [];
  const idx = db.brokers.findIndex((x) => x.id === b.id);
  if (idx >= 0) {
    b.createdAt = db.brokers[idx].createdAt;
    db.brokers[idx] = b;
    toast("Broker updated.");
  } else {
    db.brokers.push(b);
    toast("Broker added.");
  }
  persist();
  clearBrokerForm();
  renderBrokers();
  renderPurchasePartyOptions();
  renderPurchaseVehicleBrokerOptions();
  closeBrokerFormDialog();
}

function deleteBroker(id) {
  if (!isAdmin()) {
    toast("Only admin can delete brokers.");
    return;
  }
  const b = (db.brokers || []).find((x) => x.id === id);
  if (!b) return;
  if (!confirm(`Delete broker "${b.name}"?`)) return;
  db.brokers = (db.brokers || []).filter((x) => x.id !== id);
  persist();
  clearBrokerForm();
  renderBrokers();
  renderPurchasePartyOptions();
  renderPurchaseVehicleBrokerOptions();
  closeBrokerFormDialog();
}

function normalizeSupplier(s) {
  return {
    id: s.id ?? uid("sup"),
    name: String(s.name ?? "").trim(),
    phone: String(s.phone ?? "").trim(),
    email: String(s.email ?? "").trim(),
    address: String(s.address ?? "").trim(),
    notes: String(s.notes ?? "").trim(),
    createdAt: s.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

function renderSuppliers() {
  const table = document.querySelector("#suppliersTable tbody");
  if (!table) return;

  const q = (document.querySelector("#supplierSearch")?.value || "").trim().toLowerCase();
  const list = (db.suppliers || [])
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .filter((s) => {
      if (!q) return true;
      const hay = `${s.name ?? ""} ${s.phone ?? ""} ${s.email ?? ""} ${s.address ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  table.innerHTML = "";
  for (const s of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(s.name || "")}</strong></td>
      <td>${escapeHtml(s.phone || "")}</td>
      <td>${escapeHtml(s.email || "")}</td>
      <td>${escapeHtml(s.address || "")}</td>
      <td class="actions"></td>
    `;

    const actions = tr.querySelector(".actions");
    const btnEdit = mkBtn("Edit", "btn btn--ghost");
    btnEdit.addEventListener("click", () => openSupplierFormDialogForEdit(s.id));
    const btnDel = mkBtn("Delete", "btn btn--danger");
    btnDel.addEventListener("click", () => deleteSupplier(s.id));
    actions.append(btnEdit, btnDel);
    table.appendChild(tr);
  }

  const summary = document.querySelector("#suppliersSummary");
  if (summary) summary.textContent = `${list.length} supplier${list.length === 1 ? "" : "s"}`;
}

function fillSupplierForm(id) {
  const s = (db.suppliers || []).find((x) => x.id === id);
  if (!s) return;
  const form = document.querySelector("#supplierForm");
  if (!form) return;
  document.querySelector("#supplierId").value = s.id;
  document.querySelector("#supplierName").value = s.name || "";
  document.querySelector("#supplierPhone").value = s.phone || "";
  document.querySelector("#supplierEmail").value = s.email || "";
  document.querySelector("#supplierAddress").value = s.address || "";
  document.querySelector("#supplierNotes").value = s.notes || "";
}

function clearSupplierForm() {
  const form = document.querySelector("#supplierForm");
  if (!form) return;
  form.reset();
  const idEl = document.querySelector("#supplierId");
  if (idEl) idEl.value = "";
}

function ensureSupplierDialogMount() {
  const body = document.querySelector("#supplierFormDialogBody");
  const form = document.querySelector("#supplierForm");
  if (!body || !form) return;
  if (body.contains(form)) return;
  form.hidden = false;
  body.innerHTML = "";
  body.appendChild(form);
}

function closeSupplierFormDialog() {
  document.querySelector("#supplierFormDialog")?.close();
}

function openSupplierFormDialogForNew() {
  if (!isAdmin()) {
    toast("Only admin can manage suppliers.");
    return;
  }
  ensureSupplierDialogMount();
  const t = document.querySelector("#supplierFormDialogTitle");
  if (t) t.textContent = "Add Supplier";
  const b = document.querySelector("#supplierFormDialogBadge");
  if (b) b.textContent = "New";
  clearSupplierForm();
  document.querySelector("#supplierFormDialog")?.showModal();
}

function openSupplierFormDialogForEdit(id) {
  if (!isAdmin()) {
    toast("Only admin can manage suppliers.");
    return;
  }
  ensureSupplierDialogMount();
  const t = document.querySelector("#supplierFormDialogTitle");
  if (t) t.textContent = "Edit Supplier";
  const b = document.querySelector("#supplierFormDialogBadge");
  if (b) b.textContent = "Edit";
  fillSupplierForm(id);
  document.querySelector("#supplierFormDialog")?.showModal();
}

function upsertSupplierFromForm(e) {
  e.preventDefault();
  requirePerm("save supplier", PERMS.INVENTORY_EDIT);
  // Suppliers are also admin-only in nav; this keeps action-level consistent.
  if (!isAdmin()) {
    toast("Only admin can manage suppliers.");
    return;
  }

  const id = document.querySelector("#supplierId").value.trim() || undefined;
  const payload = {
    id,
    name: document.querySelector("#supplierName").value,
    phone: document.querySelector("#supplierPhone").value,
    email: document.querySelector("#supplierEmail").value,
    address: document.querySelector("#supplierAddress").value,
    notes: document.querySelector("#supplierNotes").value,
  };

  const s = normalizeSupplier(payload);
  if (!s.name) {
    toast("Supplier name is required.");
    return;
  }

  db.suppliers = Array.isArray(db.suppliers) ? db.suppliers : [];
  const idx = db.suppliers.findIndex((x) => x.id === s.id);
  if (idx >= 0) {
    s.createdAt = db.suppliers[idx].createdAt;
    db.suppliers[idx] = s;
    toast("Supplier updated.");
  } else {
    db.suppliers.push(s);
    toast("Supplier added.");
  }

  persist();
  clearSupplierForm();
  renderSuppliers();
  renderPurchasePartyOptions();
  closeSupplierFormDialog();
}

function deleteSupplier(id) {
  if (!isAdmin()) {
    toast("Only admin can delete suppliers.");
    return;
  }
  const s = (db.suppliers || []).find((x) => x.id === id);
  if (!s) return;
  if (!confirm(`Delete supplier "${s.name}"?`)) return;

  db.suppliers = (db.suppliers || []).filter((x) => x.id !== id);
  persist();
  clearSupplierForm();
  renderSuppliers();
  renderPurchasePartyOptions();
  closeSupplierFormDialog();
}

function normalizeCustomer(c) {
  return {
    id: c.id ?? uid("cus"),
    name: String(c.name ?? "").trim(),
    phone: String(c.phone ?? "").trim(),
    email: String(c.email ?? "").trim(),
    address: String(c.address ?? "").trim(),
    notes: String(c.notes ?? "").trim(),
    createdAt: c.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

function renderCustomers() {
  const table = document.querySelector("#customersTable tbody");
  if (!table) return;
  const q = (document.querySelector("#customerSearch")?.value || "").trim().toLowerCase();
  const list = (Array.isArray(db.customers) ? db.customers : [])
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .filter((c) => {
      if (!q) return true;
      const hay = `${c.name ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.address ?? ""} ${c.notes ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  table.innerHTML = "";
  for (const c of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapeHtml(c.name || "")}</strong></td>
      <td>${escapeHtml(c.phone || "")}</td>
      <td>${escapeHtml(c.email || "")}</td>
      <td>${escapeHtml(c.address || "")}</td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnEdit = mkBtn("Edit", "btn btn--ghost");
    btnEdit.addEventListener("click", () => openCustomerFormDialogForEdit(c.id));
    const btnDel = mkBtn("Delete", "btn btn--danger");
    btnDel.addEventListener("click", () => deleteCustomer(c.id));
    actions.append(btnEdit, btnDel);
    table.appendChild(tr);
  }

  const summary = document.querySelector("#customersSummary");
  if (summary) summary.textContent = `${list.length} customer${list.length === 1 ? "" : "s"}`;
}

/** Billing: dropdown of saved customers → fills invoice customer name & phone. */
function renderInvoiceCustomerPick() {
  const sel = document.querySelector("#invoiceCustomerPick");
  if (!sel) return;
  const keep = sel.value;
  while (sel.options.length > 1) {
    sel.remove(1);
  }
  const list = (Array.isArray(db.customers) ? db.customers : [])
    .slice()
    .filter((c) => String(c.name ?? "").trim())
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
  for (const c of list) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name || "—";
    sel.appendChild(opt);
  }
  const ids = new Set(list.map((c) => c.id));
  if (keep && ids.has(keep)) sel.value = keep;
  else sel.value = "";
}

function quotationVehicleCandidates() {
  return (Array.isArray(db.vehicles) ? db.vehicles : [])
    .slice()
    .filter((v) => v.status !== "sold")
    .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
}

function renderQuotationOptions() {
  const customerSel = document.querySelector("#quotationCustomerPick");
  if (customerSel) {
    const keep = customerSel.value;
    while (customerSel.options.length > 1) customerSel.remove(1);
    const customers = (Array.isArray(db.customers) ? db.customers : [])
      .slice()
      .filter((c) => String(c.name ?? "").trim())
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" }));
    for (const c of customers) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name || "—";
      customerSel.appendChild(opt);
    }
    const ids = new Set(customers.map((c) => c.id));
    customerSel.value = keep && ids.has(keep) ? keep : "";
  }

  const vehicleSel = document.querySelector("#quotationVehiclePick");
  if (vehicleSel) {
    const keep = vehicleSel.value;
    while (vehicleSel.options.length > 1) vehicleSel.remove(1);
    const vehicles = quotationVehicleCandidates();
    for (const v of vehicles) {
      const opt = document.createElement("option");
      opt.value = v.id;
      const bits = [v.stockNo || "—", vehicleLabel(v) || "—", v.vehicleNumber || "—", formatMoney(v.sellPrice)];
      opt.textContent = bits.join(" | ");
      vehicleSel.appendChild(opt);
    }
    const ids = new Set(vehicles.map((v) => v.id));
    vehicleSel.value = keep && ids.has(keep) ? keep : "";
  }
}

function getQuotationState() {
  const customerName = String(document.querySelector("#quotationCustomerName")?.value || "").trim();
  const customerPhone = String(document.querySelector("#quotationCustomerPhone")?.value || "").trim();
  const quoteDate = String(document.querySelector("#quotationDate")?.value || "").trim();
  const validUntil = String(document.querySelector("#quotationValidUntil")?.value || "").trim();
  const remarks = String(document.querySelector("#quotationRemarks")?.value || "").trim();
  const vehicleId = String(document.querySelector("#quotationVehiclePick")?.value || "").trim();
  const v = getVehicleById(vehicleId);
  const enteredPrice = safeNumber(document.querySelector("#quotationPrice")?.value, NaN);
  const amount = Number.isFinite(enteredPrice) && enteredPrice >= 0 ? enteredPrice : safeNumber(v?.sellPrice, 0);
  return { customerName, customerPhone, quoteDate, validUntil, remarks, v, amount };
}

function quotationMessageText() {
  const s = getQuotationState();
  if (!s.v) return "";
  const lines = [
    `${db.meta.companyName || "E-Inventory"} Vehicle Quotation`,
    `Date: ${s.quoteDate || "—"}`,
    `Valid Until: ${s.validUntil || "—"}`,
    `Customer: ${s.customerName || "—"}`,
    `Phone: ${s.customerPhone || "—"}`,
    "",
    `Vehicle: ${vehicleLabel(s.v) || "—"}`,
    `Stock No: ${s.v.stockNo || "—"}`,
    `Vehicle No: ${s.v.vehicleNumber || "—"}`,
    `Gear: ${s.v.gearSystem || "—"}`,
    `Condition: ${s.v.vehicleCondition || "—"}`,
    `Quoted Price: ${formatMoney(s.amount)}`,
  ];
  if (s.remarks) lines.push(`Remarks: ${s.remarks}`);
  return lines.join("\n");
}

function normalizeQuotation(q) {
  return {
    id: q.id ?? uid("quo"),
    quoteDate: String(q.quoteDate ?? "").trim(),
    validUntil: String(q.validUntil ?? "").trim(),
    customerName: String(q.customerName ?? "").trim(),
    customerPhone: String(q.customerPhone ?? "").trim(),
    remarks: String(q.remarks ?? "").trim(),
    amount: Math.max(0, safeNumber(q.amount, 0)),
    vehicleId: String(q.vehicleId ?? "").trim(),
    vehicleSnapshot: {
      stockNo: String(q.vehicleSnapshot?.stockNo ?? "").trim(),
      label: String(q.vehicleSnapshot?.label ?? "").trim(),
      vehicleNumber: String(q.vehicleSnapshot?.vehicleNumber ?? "").trim(),
      gearSystem: String(q.vehicleSnapshot?.gearSystem ?? "").trim(),
      vehicleCondition: String(q.vehicleSnapshot?.vehicleCondition ?? "").trim(),
    },
    createdAt: q.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

function quotationToState(q) {
  const vehicle = {
    stockNo: q.vehicleSnapshot?.stockNo || "—",
    vehicleNumber: q.vehicleSnapshot?.vehicleNumber || "—",
    gearSystem: q.vehicleSnapshot?.gearSystem || "—",
    vehicleCondition: q.vehicleSnapshot?.vehicleCondition || "—",
  };
  return {
    customerName: q.customerName || "",
    customerPhone: q.customerPhone || "",
    quoteDate: q.quoteDate || "",
    validUntil: q.validUntil || "",
    remarks: q.remarks || "",
    amount: safeNumber(q.amount, 0),
    v: { ...vehicle, make: "", model: "", year: "", _label: q.vehicleSnapshot?.label || "" },
  };
}

function buildQuotationMessageFromState(s) {
  if (!s?.v) return "";
  const label = s.v._label || vehicleLabel(s.v) || "—";
  const lines = [
    `${db.meta.companyName || "E-Inventory"} Vehicle Quotation`,
    `Date: ${s.quoteDate || "—"}`,
    `Valid Until: ${s.validUntil || "—"}`,
    `Customer: ${s.customerName || "—"}`,
    `Phone: ${s.customerPhone || "—"}`,
    "",
    `Vehicle: ${label}`,
    `Stock No: ${s.v.stockNo || "—"}`,
    `Vehicle No: ${s.v.vehicleNumber || "—"}`,
    `Gear: ${s.v.gearSystem || "—"}`,
    `Condition: ${s.v.vehicleCondition || "—"}`,
    `Quoted Price: ${formatMoney(s.amount)}`,
  ];
  if (s.remarks) lines.push(`Remarks: ${s.remarks}`);
  return lines.join("\n");
}

function renderQuotationPreview() {
  const preview = document.querySelector("#quotationPreview");
  if (!preview) return;
  const s = getQuotationState();
  if (!s.v) {
    preview.classList.add("muted");
    preview.innerHTML = "Select customer and vehicle to generate quotation preview.";
    return;
  }
  preview.classList.remove("muted");
  preview.innerHTML = `
    <div style="display:grid;gap:8px;">
      <div><strong>${escapeHtml(db.meta.companyName || "E-Inventory")}</strong></div>
      <div class="muted">Date: ${escapeHtml(s.quoteDate || "—")} · Valid Until: ${escapeHtml(s.validUntil || "—")}</div>
      <div><strong>Customer:</strong> ${escapeHtml(s.customerName || "—")} ${s.customerPhone ? `(${escapeHtml(s.customerPhone)})` : ""}</div>
      <div><strong>Vehicle:</strong> ${escapeHtml(vehicleLabel(s.v) || "—")}</div>
      <div><strong>Stock No:</strong> ${escapeHtml(s.v.stockNo || "—")} · <strong>Vehicle No:</strong> ${escapeHtml(s.v.vehicleNumber || "—")}</div>
      <div><strong>Gear:</strong> ${escapeHtml(s.v.gearSystem || "—")} · <strong>Condition:</strong> ${escapeHtml(s.v.vehicleCondition || "—")}</div>
      <div><strong>Quoted Price:</strong> ${escapeHtml(formatMoney(s.amount))}</div>
      ${s.remarks ? `<div><strong>Remarks:</strong> ${escapeHtml(s.remarks)}</div>` : ""}
    </div>
  `;
}

function sendQuotationWhatsapp() {
  requirePerm("quotation", PERMS.BILLING_USE);
  const s = getQuotationState();
  if (!s.v) return toast("Select a vehicle first.");
  const phone = String(s.customerPhone || "").replace(/[^\d]/g, "");
  if (!phone) return toast("Customer phone is required for WhatsApp.");
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildQuotationMessageFromState(s))}`;
  window.open(url, "_blank");
}

function printQuotationFromState(s) {
  if (!s?.v) return toast("Select a vehicle first.");
  const label = s.v._label || vehicleLabel(s.v) || "—";
  const w = window.open("", "_blank");
  if (!w) return toast("Popup blocked. Allow popups to print quotation.");
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Quotation</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
          h1 { margin: 0 0 8px; font-size: 20px; }
          .muted { color: #666; font-size: 12px; }
          .box { border: 1px solid #e6e6e6; border-radius: 10px; padding: 14px; margin-top: 12px; }
          .kv { display: grid; grid-template-columns: 160px 1fr; gap: 8px 12px; }
          .k { color: #666; }
          .price { font-size: 20px; font-weight: 700; margin-top: 10px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(db.meta.companyName || "E-Inventory")} · Vehicle Quotation</h1>
        <div class="muted">Date: ${escapeHtml(s.quoteDate || "—")} · Valid Until: ${escapeHtml(s.validUntil || "—")}</div>
        <div class="box">
          <div class="kv">
            <div class="k">Customer</div><div>${escapeHtml(s.customerName || "—")}</div>
            <div class="k">Phone</div><div>${escapeHtml(s.customerPhone || "—")}</div>
            <div class="k">Vehicle</div><div>${escapeHtml(label)}</div>
            <div class="k">Stock No</div><div>${escapeHtml(s.v.stockNo || "—")}</div>
            <div class="k">Vehicle No</div><div>${escapeHtml(s.v.vehicleNumber || "—")}</div>
            <div class="k">Gear</div><div>${escapeHtml(s.v.gearSystem || "—")}</div>
            <div class="k">Condition</div><div>${escapeHtml(s.v.vehicleCondition || "—")}</div>
            ${s.remarks ? `<div class="k">Remarks</div><div>${escapeHtml(s.remarks)}</div>` : ""}
          </div>
          <div class="price">Quoted Price: ${escapeHtml(formatMoney(s.amount))}</div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  w.document.close();
}

function printQuotation() {
  requirePerm("quotation", PERMS.BILLING_USE);
  const s = getQuotationState();
  printQuotationFromState(s);
}

function saveQuotation() {
  requirePerm("quotation", PERMS.BILLING_USE);
  const s = getQuotationState();
  if (!s.v) return toast("Select a vehicle first.");
  if (!s.customerName) return toast("Customer name is required.");
  const q = normalizeQuotation({
    quoteDate: s.quoteDate || todayISODate(),
    validUntil: s.validUntil || "",
    customerName: s.customerName,
    customerPhone: s.customerPhone,
    remarks: s.remarks,
    amount: s.amount,
    vehicleId: s.v.id || "",
    vehicleSnapshot: {
      stockNo: s.v.stockNo || "",
      label: vehicleLabel(s.v) || "",
      vehicleNumber: s.v.vehicleNumber || "",
      gearSystem: s.v.gearSystem || "",
      vehicleCondition: s.v.vehicleCondition || "",
    },
  });
  db.quotations = Array.isArray(db.quotations) ? db.quotations : [];
  db.quotations.push(q);
  persist();
  renderQuotation();
  toast("Quotation saved.");
}

function loadQuotationToForm(id) {
  const q = (db.quotations || []).find((x) => x.id === id);
  if (!q) return;
  const qDate = document.querySelector("#quotationDate");
  const qValid = document.querySelector("#quotationValidUntil");
  const qName = document.querySelector("#quotationCustomerName");
  const qPhone = document.querySelector("#quotationCustomerPhone");
  const qRemarks = document.querySelector("#quotationRemarks");
  const qPrice = document.querySelector("#quotationPrice");
  const qVehiclePick = document.querySelector("#quotationVehiclePick");
  const qCustomerPick = document.querySelector("#quotationCustomerPick");
  if (qDate) qDate.value = q.quoteDate || "";
  if (qValid) qValid.value = q.validUntil || "";
  if (qName) qName.value = q.customerName || "";
  if (qPhone) qPhone.value = q.customerPhone || "";
  if (qRemarks) qRemarks.value = q.remarks || "";
  if (qPrice) qPrice.value = String(safeNumber(q.amount, 0));
  if (qCustomerPick) qCustomerPick.value = "";
  if (qVehiclePick && q.vehicleId && Array.from(qVehiclePick.options).some((opt) => opt.value === q.vehicleId)) {
    qVehiclePick.value = q.vehicleId;
  } else if (qVehiclePick) {
    qVehiclePick.value = "";
  }
  renderQuotationPreview();
}

function deleteQuotation(id) {
  requirePerm("quotation", PERMS.BILLING_USE);
  const q = (db.quotations || []).find((x) => x.id === id);
  if (!q) return;
  if (!confirm(`Delete quotation for "${q.customerName}"?`)) return;
  db.quotations = (db.quotations || []).filter((x) => x.id !== id);
  persist();
  renderQuotation();
  toast("Quotation deleted.");
}

function renderQuotationList() {
  const tbody = document.querySelector("#quotationTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const list = (Array.isArray(db.quotations) ? db.quotations : [])
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  for (const q of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(q.quoteDate || "—")}</td>
      <td><strong>${escapeHtml(q.customerName || "—")}</strong><div class="muted">${escapeHtml(q.customerPhone || "")}</div></td>
      <td><strong>${escapeHtml(q.vehicleSnapshot?.label || "—")}</strong><div class="muted">${escapeHtml(q.vehicleSnapshot?.stockNo || "—")}</div></td>
      <td>${escapeHtml(q.validUntil || "—")}</td>
      <td class="num"><strong>${escapeHtml(formatMoney(q.amount))}</strong></td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnLoad = mkBtn("Load", "btn btn--ghost");
    btnLoad.addEventListener("click", () => loadQuotationToForm(q.id));
    const btnPrint = mkBtn("Print", "btn");
    btnPrint.addEventListener("click", () => printQuotationFromState(quotationToState(q)));
    const btnDel = mkBtn("Delete", "btn btn--danger");
    btnDel.addEventListener("click", () => deleteQuotation(q.id));
    actions.append(btnLoad, btnPrint, btnDel);
    tbody.appendChild(tr);
  }
  const summary = document.querySelector("#quotationSummary");
  if (summary) summary.textContent = `${list.length} quotation${list.length === 1 ? "" : "s"}`;
}

function renderQuotation() {
  renderQuotationOptions();
  renderQuotationPreview();
  renderQuotationList();
}

function fillCustomerForm(id) {
  const c = (db.customers || []).find((x) => x.id === id);
  if (!c) return;
  const idEl = document.querySelector("#customerId");
  if (idEl) idEl.value = c.id;
  document.querySelector("#crmCustomerName").value = c.name || "";
  document.querySelector("#crmCustomerPhone").value = c.phone || "";
  document.querySelector("#customerEmail").value = c.email || "";
  document.querySelector("#customerAddress").value = c.address || "";
  document.querySelector("#customerNotes").value = c.notes || "";
}

function clearCustomerForm() {
  const form = document.querySelector("#customerForm");
  if (form) form.reset();
  const idEl = document.querySelector("#customerId");
  if (idEl) idEl.value = "";
}

function ensureCustomerDialogMount() {
  const body = document.querySelector("#customerFormDialogBody");
  const form = document.querySelector("#customerForm");
  if (!body || !form) return;
  if (body.contains(form)) return;
  // If the inline form was hidden in the Customer panel, make sure it becomes visible in the dialog.
  form.hidden = false;
  body.innerHTML = "";
  body.appendChild(form);
}

function closeCustomerFormDialog() {
  document.querySelector("#customerFormDialog")?.close();
}

function openCustomerFormDialogForNew() {
  ensureCustomerDialogMount();
  if (!canManageGarageCustomerData()) {
    toast("Not allowed.");
    return;
  }
  const t = document.querySelector("#customerFormDialogTitle");
  if (t) t.textContent = "Add customer";
  const b = document.querySelector("#customerFormDialogBadge");
  if (b) b.textContent = "New";
  clearCustomerForm();
  document.querySelector("#customerFormDialog")?.showModal();
}

function openCustomerFormDialogForEdit(id) {
  ensureCustomerDialogMount();
  if (!canManageGarageCustomerData()) {
    toast("Not allowed.");
    return;
  }
  const t = document.querySelector("#customerFormDialogTitle");
  if (t) t.textContent = "Edit customer";
  const b = document.querySelector("#customerFormDialogBadge");
  if (b) b.textContent = "Edit";
  fillCustomerForm(id);
  document.querySelector("#customerFormDialog")?.showModal();
}

function upsertCustomerFromForm(e) {
  e.preventDefault();
  if (!canManageGarageCustomerData()) {
    toast("Not allowed.");
    return;
  }
  const id = document.querySelector("#customerId")?.value.trim() || undefined;
  const payload = {
    id,
    name: document.querySelector("#crmCustomerName")?.value,
    phone: document.querySelector("#crmCustomerPhone")?.value,
    email: document.querySelector("#customerEmail")?.value,
    address: document.querySelector("#customerAddress")?.value,
    notes: document.querySelector("#customerNotes")?.value,
  };
  const c = normalizeCustomer(payload);
  if (!c.name) {
    toast("Customer name is required.");
    return;
  }
  db.customers = Array.isArray(db.customers) ? db.customers : [];
  const idx = db.customers.findIndex((x) => x.id === c.id);
  if (idx >= 0) {
    c.createdAt = db.customers[idx].createdAt;
    db.customers[idx] = c;
    toast("Customer updated.");
  } else {
    db.customers.push(c);
    toast("Customer added.");
  }
  persist();
  clearCustomerForm();
  renderCustomers();
  renderInvoiceCustomerPick();
  closeCustomerFormDialog();
}

function deleteCustomer(id) {
  if (!canManageGarageCustomerData()) {
    toast("Not allowed.");
    return;
  }
  const c = (db.customers || []).find((x) => x.id === id);
  if (!c) return;
  if (!confirm(`Delete customer "${c.name}"?`)) return;
  db.customers = (db.customers || []).filter((x) => x.id !== id);
  persist();
  clearCustomerForm();
  renderCustomers();
  renderInvoiceCustomerPick();
  closeCustomerFormDialog();
}

function garageJobStockNo(j) {
  const s = String(j?.stockNo ?? "").trim();
  if (s) return s;
  return String(j?.relatedStock ?? "").trim();
}

function garageJobVehicleRef(j) {
  return String(j?.vehicleRef ?? "").trim();
}

function garageJobIsActive(j) {
  return String(j?.status ?? "")
    .trim()
    .toLowerCase() !== "done";
}

/** True if an open / in-progress garage job references this vehicle by stock no. or vehicle number. */
function vehicleHasActiveGarageJob(v) {
  if (!v) return false;
  const stock = String(v.stockNo ?? "").trim().toLowerCase();
  const vnum = String(v.vehicleNumber ?? "").trim().toLowerCase();
  if (!stock && !vnum) return false;
  const jobs = Array.isArray(db.garageJobs) ? db.garageJobs : [];
  for (const j of jobs) {
    if (!garageJobIsActive(j)) continue;
    const jStock = garageJobStockNo(j).trim().toLowerCase();
    const jVeh = garageJobVehicleRef(j).trim().toLowerCase();
    if (stock && jStock && stock === jStock) return true;
    if (vnum && jVeh && vnum === jVeh) return true;
  }
  return false;
}

/** Garage status column: linked to active garage job (stock no. / vehicle number). */
function inventoryGarageStatusHtml(v) {
  return vehicleHasActiveGarageJob(v)
    ? `<span class="pill pill--garage">In garage</span>`
    : `<span class="muted">—</span>`;
}

function normalizeGarageJob(j) {
  return {
    id: j.id ?? uid("gjob"),
    title: String(j.title ?? "").trim(),
    stockNo: String(j.stockNo ?? "").trim(),
    vehicleRef: String(j.vehicleRef ?? "").trim(),
    status: String(j.status ?? "In progress").trim(),
    notes: String(j.notes ?? "").trim(),
    createdAt: j.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

function renderGarageJobs() {
  const table = document.querySelector("#garageJobsTable tbody");
  if (!table) return;
  const q = (document.querySelector("#garageJobSearch")?.value || "").trim().toLowerCase();
  const list = (Array.isArray(db.garageJobs) ? db.garageJobs : [])
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .filter((j) => {
      if (!q) return true;
      const sn = garageJobStockNo(j);
      const vr = garageJobVehicleRef(j);
      const hay = `${j.title ?? ""} ${sn} ${vr} ${j.status ?? ""} ${j.notes ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  table.innerHTML = "";
  for (const j of list) {
    const tr = document.createElement("tr");
    const dt = j.createdAt ? new Date(j.createdAt).toLocaleString() : "—";
    const sn = garageJobStockNo(j);
    const vr = garageJobVehicleRef(j);
    tr.innerHTML = `
      <td class="muted" style="white-space:nowrap;font-size:12px;">${escapeHtml(dt)}</td>
      <td><strong>${escapeHtml(j.title || "")}</strong></td>
      <td>${escapeHtml(sn || "—")}</td>
      <td>${escapeHtml(vr || "—")}</td>
      <td><span class="pill">${escapeHtml(j.status || "—")}</span></td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnEdit = mkBtn("Edit", "btn btn--ghost");
    const canEdit = canManageGarageCustomerData();
    if (!canEdit) {
      btnEdit.disabled = true;
      btnEdit.title = "Not allowed";
    }
    btnEdit.addEventListener("click", () => {
      if (!canEdit) return;
      openGarageJobFormDialogForEdit(j.id);
    });
    const btnDel = mkBtn("Delete", "btn btn--danger");
    if (!canEdit) {
      btnDel.disabled = true;
      btnDel.title = "Not allowed";
    }
    btnDel.addEventListener("click", () => {
      if (!canEdit) return;
      deleteGarageJob(j.id);
    });
    actions.append(btnEdit, btnDel);
    table.appendChild(tr);
  }

  const summary = document.querySelector("#garageJobsSummary");
  if (summary) summary.textContent = `${list.length} job${list.length === 1 ? "" : "s"}`;
}

function fillGarageJobForm(id) {
  const j = (db.garageJobs || []).find((x) => x.id === id);
  if (!j) return;
  const idEl = document.querySelector("#garageJobId");
  if (idEl) idEl.value = j.id;
  document.querySelector("#garageJobTitle").value = j.title || "";
  document.querySelector("#garageJobStockNo").value = garageJobStockNo(j);
  document.querySelector("#garageJobVehicleNumber").value = garageJobVehicleRef(j);
  document.querySelector("#garageJobStatus").value = j.status || "In progress";
  document.querySelector("#garageJobNotes").value = j.notes || "";
}

function clearGarageJobForm() {
  const form = document.querySelector("#garageJobForm");
  if (form) form.reset();
  const idEl = document.querySelector("#garageJobId");
  if (idEl) idEl.value = "";
  const st = document.querySelector("#garageJobStatus");
  if (st) st.value = "In progress";
}

function closeGarageJobFormDialog() {
  document.querySelector("#garageJobFormDialog")?.close();
}

function openGarageJobFormDialogForNew() {
  if (!canManageGarageCustomerData()) {
    toast("Not allowed.");
    return;
  }
  const mode = document.querySelector("#garageJobFormDialogModeBadge");
  if (mode) mode.textContent = "New";
  clearGarageJobForm();
  document.querySelector("#garageJobFormDialog")?.showModal();
}

function openGarageJobFormDialogForEdit(id) {
  if (!canManageGarageCustomerData()) {
    toast("Not allowed.");
    return;
  }
  const j = (db.garageJobs || []).find((x) => x.id === id);
  if (!j) return;
  const mode = document.querySelector("#garageJobFormDialogModeBadge");
  if (mode) mode.textContent = "Edit";
  fillGarageJobForm(id);
  document.querySelector("#garageJobFormDialog")?.showModal();
}

function upsertGarageJobFromForm(e) {
  e.preventDefault();
  if (!canManageGarageCustomerData()) {
    toast("Not allowed.");
    return;
  }
  const id = document.querySelector("#garageJobId")?.value.trim() || undefined;
  const payload = {
    id,
    title: document.querySelector("#garageJobTitle")?.value,
    stockNo: document.querySelector("#garageJobStockNo")?.value,
    vehicleRef: document.querySelector("#garageJobVehicleNumber")?.value,
    status: document.querySelector("#garageJobStatus")?.value,
    notes: document.querySelector("#garageJobNotes")?.value,
  };
  const j = normalizeGarageJob(payload);
  if (!j.title) {
    toast("Job title is required.");
    return;
  }
  db.garageJobs = Array.isArray(db.garageJobs) ? db.garageJobs : [];
  const idx = db.garageJobs.findIndex((x) => x.id === j.id);
  if (idx >= 0) {
    j.createdAt = db.garageJobs[idx].createdAt;
    db.garageJobs[idx] = j;
    toast("Job updated.");
  } else {
    db.garageJobs.push(j);
    toast("Job logged.");
  }
  persist();
  clearGarageJobForm();
  renderGarageJobs();
  renderInventory();
  closeGarageJobFormDialog();
}

function deleteGarageJob(id) {
  if (!canManageGarageCustomerData()) {
    toast("Not allowed.");
    return;
  }
  const j = (db.garageJobs || []).find((x) => x.id === id);
  if (!j) return;
  if (!confirm(`Delete job "${j.title}"?`)) return;
  db.garageJobs = (db.garageJobs || []).filter((x) => x.id !== id);
  persist();
  clearGarageJobForm();
  renderGarageJobs();
  renderInventory();
  closeGarageJobFormDialog();
}

async function createUserFromForm(e) {
  e.preventDefault();
  requirePerm("manage users", PERMS.USERS_MANAGE);
  await migratePasswordsToHash();

  const username = normalizeUsername($("#newUsername").value);
  const name = ($("#newName").value || "").trim();
  const role = $("#newRole").value;
  const password = $("#newPassword").value;

  if (!username || !name || !role || !password) {
    toast("Please fill all user fields.");
    return;
  }
  if (!ROLE_PERMS[role]) {
    toast("Invalid role.");
    return;
  }
  const exists = auth.users.some((u) => normalizeUsername(u.username) === username);
  if (exists) {
    toast("Username already exists.");
    return;
  }
  if (password.length < 4) {
    toast("Password too short.");
    return;
  }

  if (useRemoteDb) {
    const { ok, body } = await fetchPosApi("users.php", {
      method: "POST",
      body: JSON.stringify({
        username,
        name,
        role,
        password,
        permissions: ROLE_PERMS[role] ?? [],
      }),
    });
    if (!ok || !body || !body.ok) {
      toast(body?.error || "Could not create user on server.");
      return;
    }
    await refreshUsersFromServer();
    auth.updatedAt = nowIso();
    saveAuth(auth);
    toast("User created.");
    $("#userForm").reset();
    renderUsers();
    return;
  }

  auth.users.push({
    id: uid("usr"),
    username,
    name,
    role,
    permissions: ROLE_PERMS[role] ?? [],
    disabled: false,
    passwordHash: await hashPassword(username, password),
    createdAt: nowIso(),
  });
  auth.updatedAt = nowIso();
  saveAuth(auth);
  toast("User created.");
  $("#userForm").reset();
  renderUsers();
}

async function toggleUserDisabled(userId) {
  requirePerm("manage users", PERMS.USERS_MANAGE);
  const u = auth.users.find((x) => x.id === userId);
  if (!u) return;
  const isSelf = currentUser()?.id && u.id === currentUser()?.id;
  const isAdminUser = normalizeUsername(u.username) === "admin";
  if (isSelf || isAdminUser) {
    toast("Cannot disable this user.");
    return;
  }
  const next = !u.disabled;
  if (useRemoteDb) {
    const { ok, body } = await fetchPosApi("users.php", {
      method: "PUT",
      body: JSON.stringify({ id: userId, disabled: next }),
    });
    if (!ok || !body || !body.ok) {
      toast(body?.error || "Could not update user on server.");
      return;
    }
    await refreshUsersFromServer();
    auth.updatedAt = nowIso();
    saveAuth(auth);
    renderUsers();
    toast(next ? "User disabled." : "User enabled.");
    return;
  }
  u.disabled = next;
  auth.updatedAt = nowIso();
  saveAuth(auth);
  renderUsers();
  toast(u.disabled ? "User disabled." : "User enabled.");
}

async function resetUserPassword(userId) {
  requirePerm("manage users", PERMS.USERS_MANAGE);
  const u = auth.users.find((x) => x.id === userId);
  if (!u) return;
  const temp = prompt(`Set new password for "${u.username}"`);
  if (!temp) return;
  if (useRemoteDb) {
    const { ok, body } = await fetchPosApi("users.php", {
      method: "PUT",
      body: JSON.stringify({ id: userId, password: temp }),
    });
    if (!ok || !body || !body.ok) {
      toast(body?.error || "Could not reset password on server.");
      return;
    }
    await refreshUsersFromServer();
    auth.updatedAt = nowIso();
    saveAuth(auth);
    toast("Password reset.");
    return;
  }
  await migratePasswordsToHash();
  u.passwordHash = await hashPassword(u.username, temp);
  auth.updatedAt = nowIso();
  saveAuth(auth);
  toast("Password reset.");
}

function persist() {
  db.meta.updatedAt = nowIso();
  saveDb(db);
  if (!useRemoteDb) return;
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    flushDbRemoteNow().then((r) => {
      if (!r.ok) toast("Could not save to server (local copy updated).");
    });
  }, 450);
}

function normalizeVehicle(v) {
  return {
    id: v.id ?? uid("veh"),
    stockNo: String(v.stockNo ?? "").trim(),
    vin: String(v.vin ?? "").trim(),
    make: String(v.make ?? "").trim(),
    model: String(v.model ?? "").trim(),
    year: v.year === "" || v.year == null ? null : safeNumber(v.year, null),
    color: String(v.color ?? "").trim(),
    vehicleType: String(v.vehicleType ?? "").trim(),
    brokerName: String(v.brokerName ?? "").trim(),
    vehicleNumber: String(v.vehicleNumber ?? "").trim(),
    countryOfOrigin: String(v.countryOfOrigin ?? "").trim(),
    mileageKm: v.mileageKm === "" || v.mileageKm == null ? null : safeNumber(v.mileageKm, null),
    fuelType: String(v.fuelType ?? "").trim(),
    gearSystem: String(v.gearSystem ?? "").trim(),
    vehicleCondition: String(v.vehicleCondition ?? "").trim(),
    leasingStatus: String(v.leasingStatus ?? "No").trim(),
    leasingCompany: String(v.leasingCompany ?? "").trim(),
    leaseAmount: v.leaseAmount === "" || v.leaseAmount == null ? 0 : safeNumber(v.leaseAmount, 0),
    leaseBalanceAmount: v.leaseBalanceAmount === "" || v.leaseBalanceAmount == null ? 0 : safeNumber(v.leaseBalanceAmount, 0),
    leasePeriod: String(v.leasePeriod ?? "").trim(),
    leaseBalancePeriod: String(v.leaseBalancePeriod ?? "").trim(),
    engineCc: v.engineCc === "" || v.engineCc == null ? null : safeNumber(v.engineCc, null),
    costPrice: safeNumber(v.costPrice, 0),
    sellPrice: safeNumber(v.sellPrice, 0),
    notes: String(v.notes ?? "").trim(),
    status: v.status ?? "available", // available | sold
    createdAt: v.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    soldAt: v.soldAt ?? null,
    saleId: v.saleId ?? null,
    docs: Array.isArray(v.docs) ? v.docs : [],
    imageDataUrl: typeof v.imageDataUrl === "string" ? v.imageDataUrl : "",
  };
}

function vehicleLabel(v) {
  const year = v.year ? `${v.year} ` : "";
  return `${year}${v.make} ${v.model}`.trim();
}

function getVehicleById(id) {
  return db.vehicles.find((v) => v.id === id) ?? null;
}

function isInCart(vehicleId) {
  return db.cart.items.includes(vehicleId);
}

function setActiveTab(tab) {
  document.querySelectorAll("[data-nav].is-active").forEach((el) => el.classList.remove("is-active"));
  document.querySelectorAll(`[data-nav="${tab}"]`).forEach((el) => el.classList.add("is-active"));
  $$(".panel").forEach((p) => p.classList.toggle("is-active", p.dataset.panel === tab));
}

function canOpenNav(tab) {
  if (tab === "home") return true;
  if (tab === "inventory") return can(PERMS.INVENTORY_VIEW);
  if (tab === "inventoryReports") return can(PERMS.INVENTORY_VIEW);
  if (tab === "billing") return can(PERMS.BILLING_USE);
  if (tab === "quotation") return can(PERMS.BILLING_USE);
  if (tab === "ledger") return can(PERMS.LEDGER_VIEW);
  if (tab === "reports") return can(PERMS.REPORTS_VIEW);
  if (tab === "soldVehicleReports") return can(PERMS.REPORTS_VIEW);
  if (tab === "users") return can(PERMS.USERS_MANAGE);
  if (tab === "garage" || tab === "customer") return canAccessGarageCustomer();
  // For now these are admin-only modules
  if (tab === "brokers") return isAdmin();
  if (tab === "suppliers") return isAdmin();
  if (tab === "purchase") return isAdmin();
  return false;
}

function initNav() {
  const mm = document.querySelector("#mainMenu");
  const go = (tab) => {
    if (!canOpenNav(tab)) return toast(`No permission: ${tab}`);
    setActiveTab(tab);
    if (tab === "purchase") {
      renderPurchaseVehicleBrokerOptions();
      renderPurchasePartyOptions();
    }
    if (mm?.open) mm.open = false;
  };

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.nav));
  });

  // Close main menu when user clicks anywhere outside it.
  document.addEventListener("click", (e) => {
    if (!mm?.open) return;
    if (mm.contains(e.target)) return;
    mm.open = false;
  });
}

function closeVehicleFormDialog() {
  document.querySelector("#vehicleFormDialog")?.close();
}

function openVehicleFormDialogForNew() {
  if (!can(PERMS.INVENTORY_EDIT)) {
    toast("No permission: add vehicle");
    return;
  }
  resetVehicleForm();
  document.querySelector("#vehicleFormDialog")?.showModal();
  updateLeaseSectionVisibility();
}

function openVehicleFormDialogForEdit(v) {
  if (!can(PERMS.INVENTORY_EDIT)) {
    toast("No permission: edit vehicle");
    return;
  }
  fillVehicleForm(v);
  document.querySelector("#vehicleFormDialog")?.showModal();
  updateLeaseSectionVisibility();
  toast("Loaded vehicle for edit.");
}

function closePurchaseFormDialog() {
  document.querySelector("#purchaseFormDialog")?.close();
}

function openPurchaseFormDialogForNew() {
  if (!isAdmin()) {
    toast("Only admin can record purchases.");
    return;
  }
  resetPurchaseForm();
  document.querySelector("#purchaseFormDialog")?.showModal();
}

function ensureLedgerEntryDialogMount() {
  const body = document.querySelector("#ledgerEntryDialogBody");
  const form = document.querySelector("#ledgerForm");
  if (!body || !form) return;
  if (body.contains(form)) return;
  body.innerHTML = "";
  body.appendChild(form);
}

function closeLedgerEntryDialog() {
  document.querySelector("#ledgerEntryDialog")?.close();
}

function openLedgerEntryDialogForNew() {
  ensureLedgerEntryDialogMount();
  if (!can(PERMS.LEDGER_ADD)) {
    toast("No permission: add ledger entry");
    return;
  }
  const t = document.querySelector("#ledgerEntryDialogTitle");
  if (t) t.textContent = "Add Ledger Entry";
  const b = document.querySelector("#ledgerEntryDialogBadge");
  if (b) b.textContent = "Manual";
  $("#ledgerForm").reset();
  $("#ledgerDate").value = todayISODate();
  document.querySelector("#ledgerEntryDialog")?.showModal();
}

function resetVehicleForm() {
  $("#vehicleId").value = "";
  $("#vehicleFormTitle").textContent = "Add Vehicle";
  $("#vehicleFormModeBadge").textContent = "New";
  $("#btnDeleteVehicle").hidden = true;
  $("#vehicleForm").reset();
  renderVehicleBrokerOptions();
  $("#vehicleBrokerName").value = "Self";
  clearVehicleImagePreview();
}

function fillVehicleForm(v) {
  $("#vehicleId").value = v.id;
  $("#vehicleFormTitle").textContent = "Edit Vehicle";
  $("#vehicleFormModeBadge").textContent = v.status === "sold" ? "Sold" : "Edit";
  $("#btnDeleteVehicle").hidden = !isAdmin();

  $("#stockNo").value = v.stockNo;
  $("#vin").value = v.vin ?? "";
  $("#make").value = v.make;
  $("#model").value = v.model;
  $("#year").value = v.year ?? "";
  $("#color").value = v.color ?? "";
  $("#vehicleNumber").value = v.vehicleNumber ?? "";
  $("#vehicleType").value = v.vehicleType ?? "";
  $("#vehicleBrokerName").value = v.brokerName || "Self";
  $("#countryOfOrigin").value = v.countryOfOrigin ?? "";
  $("#mileageKm").value = v.mileageKm ?? "";
  $("#fuelType").value = v.fuelType ?? "";
  $("#gearSystem").value = v.gearSystem ?? "";
  $("#vehicleCondition").value = v.vehicleCondition ?? "";
  $("#leasingStatus").value = v.leasingStatus || "No";
  $("#leasingCompany").value = v.leasingCompany || "";
  $("#leaseAmount").value = v.leaseAmount || "";
  $("#leaseBalanceAmount").value = v.leaseBalanceAmount || "";
  $("#leasePeriod").value = v.leasePeriod || "";
  $("#leaseBalancePeriod").value = v.leaseBalancePeriod || "";
  updateLeaseSectionVisibility();
  $("#engineCc").value = v.engineCc ?? "";
  $("#costPrice").value = v.costPrice ?? 0;
  $("#sellPrice").value = v.sellPrice ?? 0;
  $("#notes").value = v.notes ?? "";

  setVehicleImagePreview(v.imageDataUrl || "");
}

function inventoryMatchesQuery(v, q) {
  if (!q) return true;
  const hay = `${v.stockNo} ${v.vin} ${v.make} ${v.model} ${v.year ?? ""} ${v.color} ${v.vehicleNumber ?? ""} ${v.vehicleType ?? ""} ${v.brokerName ?? ""} ${v.countryOfOrigin ?? ""} ${v.fuelType ?? ""} ${v.gearSystem ?? ""} ${v.vehicleCondition ?? ""} ${v.engineCc ?? ""} ${v.mileageKm ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderInventory() {
  const tbody = $("#inventoryTable tbody");
  tbody.innerHTML = "";
  const q = $("#inventorySearch").value.trim();
  const statusFilter = $("#inventoryFilterStatus").value;

  const inInventory = db.vehicles.filter((v) => v.status !== "sold");
  const totalAll = inInventory.length;
  const totalEl = document.querySelector("#invCountTotal");
  if (totalEl) totalEl.textContent = `Total: ${totalAll}`;

  const list = inInventory
    .slice()
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .filter((v) => inventoryMatchesQuery(v, q))
    .filter((v) => (statusFilter === "available" ? v.status === "available" : true));

  for (const v of list) {
    const tr = document.createElement("tr");
    const docsCount = Array.isArray(v.docs) ? v.docs.length : 0;

    const yearDisp = v.year != null && v.year !== "" ? escapeHtml(String(v.year)) : "—";
    tr.innerHTML = `
      <td>${v.imageDataUrl ? `<img class="thumb" alt="img" src="${escapeAttr(v.imageDataUrl)}" />` : `<div class="thumb thumb--empty">NO IMG</div>`}</td>
      <td><span class="pill">${escapeHtml(v.stockNo)}</span><div class="muted" style="margin-top:6px;font-family:var(--mono);font-size:12px;">${escapeHtml(v.vin || "—")}</div></td>
      <td class="num"><strong>${yearDisp}</strong></td>
      <td><strong>${escapeHtml(String(v.make || "").trim() || "—")}</strong></td>
      <td><strong>${escapeHtml(String(v.model || "").trim() || "—")}</strong></td>
      <td>${inventoryGarageStatusHtml(v)}</td>
      <td class="num"><strong>${formatMoney(v.sellPrice)}</strong><div class="muted" style="margin-top:6px;">Cost: ${formatMoney(v.costPrice)}</div></td>
      <td><span class="pill">${docsCount} file${docsCount === 1 ? "" : "s"}</span></td>
      <td class="actions"></td>
    `;

    const actionsTd = tr.querySelector(".actions");
    actionsTd.classList.add("invActions");

    const btnEdit = mkBtn("Edit", "btn btn--inv");
    if (!can(PERMS.INVENTORY_EDIT)) {
      btnEdit.disabled = true;
      btnEdit.classList.add("btn--inv-muted");
      btnEdit.title = "No permission to edit";
    }
    btnEdit.addEventListener("click", () => {
      if (!can(PERMS.INVENTORY_EDIT)) return;
      openVehicleFormDialogForEdit(v);
    });

    const btnView = mkBtn("View", "btn btn--inv");
    btnView.addEventListener("click", () => viewVehicleDetails(v.id));

    const btnDocs = mkBtn("Docs", "btn btn--inv");
    btnDocs.addEventListener("click", () => openDocsDialog(v.id));

    const inCart = isInCart(v.id);
    const sold = v.status === "sold";
    const btnAdd = mkBtn(inCart ? "In cart" : "Add to cart", "btn btn--inv");
    if (inCart || sold) {
      btnAdd.classList.add("btn--inv-muted");
      btnAdd.disabled = true;
    } else {
      btnAdd.classList.add("btn--inv-primary");
    }
    btnAdd.addEventListener("click", () => {
      if (sold || isInCart(v.id)) return;
      db.cart.items.push(v.id);
      persist();
      renderAll();
      toast("Added to cart.");
      setActiveTab("billing");
    });

    actionsTd.append(btnEdit, btnView, btnDocs, btnAdd);
    tbody.appendChild(tr);
  }

  $("#inventorySummary").textContent = `${list.length} vehicle${list.length === 1 ? "" : "s"}`;
}

function renderSoldVehicleReports() {
  const tbody = document.querySelector("#soldVehiclesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const q = (document.querySelector("#soldVehicleSearch")?.value || "").trim().toLowerCase();
  const soldById = new Map((db.vehicles || []).filter((v) => v.status === "sold").map((v) => [v.id, v]));

  const rows = (db.sales || [])
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .flatMap((s) =>
      (s.items || []).map((it) => {
        const v = soldById.get(it.vehicleId);
        return {
          createdAt: s.createdAt || "",
          invoiceNo: s.invoiceNo || "",
          vehicleId: it.vehicleId || "",
          stockNo: v?.stockNo || it.stockNo || "",
          vin: v?.vin || it.vin || "",
          year: v?.year ?? it.year ?? "",
          make: v?.make || it.make || "",
          model: v?.model || it.model || "",
          vehicleNumber: v?.vehicleNumber || it.vehicleNumber || "",
          gearSystem: v?.gearSystem || it.gearSystem || "",
          imageDataUrl: v?.imageDataUrl || "",
          docsCount: Array.isArray(v?.docs) ? v.docs.length : 0,
          customer: s.customer?.name || "Walk-in",
          soldPrice: safeNumber(it.sellPrice, v?.sellPrice ?? 0),
        };
      })
    )
    .filter((r) => {
      if (!q) return true;
      const hay = `${r.invoiceNo} ${r.stockNo} ${r.vin} ${r.year} ${r.make} ${r.model} ${r.vehicleNumber} ${r.gearSystem} ${r.customer}`.toLowerCase();
      return hay.includes(q);
    });

  for (const r of rows) {
    const tr = document.createElement("tr");
    const yearDisp = r.year != null && r.year !== "" ? escapeHtml(String(r.year)) : "—";
    tr.innerHTML = `
      <td>${r.imageDataUrl ? `<img class="thumb" alt="img" src="${escapeAttr(r.imageDataUrl)}" />` : `<div class="thumb thumb--empty">NO IMG</div>`}</td>
      <td><span class="pill">${escapeHtml(r.stockNo || "—")}</span><div class="muted" style="margin-top:6px;font-family:var(--mono);font-size:12px;">${escapeHtml(r.vin || "—")}</div></td>
      <td class="num"><strong>${yearDisp}</strong></td>
      <td><strong>${escapeHtml(String(r.make || "").trim() || "—")}</strong></td>
      <td><strong>${escapeHtml(String(r.model || "").trim() || "—")}</strong></td>
      <td>${escapeHtml(r.vehicleNumber || "—")}</td>
      <td>${escapeHtml(r.gearSystem || "—")}</td>
      <td><span class="pill">${r.docsCount} file${r.docsCount === 1 ? "" : "s"}</span></td>
      <td>${escapeHtml(r.customer || "Walk-in")}</td>
      <td><span class="pill">${escapeHtml(r.invoiceNo || "—")}</span></td>
      <td>${escapeHtml(r.createdAt ? new Date(r.createdAt).toLocaleString() : "—")}</td>
      <td class="num"><strong>${formatMoney(r.soldPrice)}</strong></td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const vehicle = r.vehicleId ? getVehicleById(r.vehicleId) : null;
    const btnView = mkBtn("View", "btn btn--ghost");
    const btnDocs = mkBtn("Docs", "btn btn--ghost");
    if (!vehicle) {
      btnView.disabled = true;
      btnDocs.disabled = true;
      btnView.title = "Vehicle details not available";
      btnDocs.title = "Vehicle documents not available";
    } else {
      btnView.addEventListener("click", () => viewVehicleDetails(vehicle.id));
      btnDocs.addEventListener("click", () => openDocsDialog(vehicle.id));
    }
    actions.append(btnView, btnDocs);
    tbody.appendChild(tr);
  }

  const summary = document.querySelector("#soldVehiclesSummary");
  if (summary) summary.textContent = `${rows.length} sold vehicle${rows.length === 1 ? "" : "s"}`;
}

function viewVehicleDetails(vehicleId) {
  const v = getVehicleById(vehicleId);
  if (!v) return;

  const w = window.open("", "_blank");
  if (!w) {
    toast("Popup blocked. Allow popups to view vehicle details.");
    return;
  }

  const imageHtml = v.imageDataUrl
    ? `<img src="${escapeAttr(v.imageDataUrl)}" alt="Vehicle" style="max-width:100%;max-height:320px;object-fit:contain;border:1px solid #ddd;border-radius:10px;background:#f6f6f6;" />`
    : `<div class="muted">NO IMG</div>`;

  const docs = Array.isArray(v.docs) ? v.docs : [];
  const docsHtml = docs.length
    ? `<ul class="docs">${docs
        .slice()
        .sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""))
        .map(
          (d) => `
          <li>
            <div class="docName">${escapeHtml(d.name || "file")}</div>
            <div class="docSub">${escapeHtml([d.type, d.size ? `${Math.round(d.size / 1024)} KB` : "", d.addedAt ? new Date(d.addedAt).toLocaleString() : ""].filter(Boolean).join(" · "))}</div>
            ${
              d.dataUrl
                ? `<a class="docLink" href="${escapeAttr(d.dataUrl)}" target="_blank" rel="noreferrer">Open</a>`
                : ""
            }
          </li>`
        )
        .join("")}</ul>`
    : `<div class="muted">No documents uploaded.</div>`;

  // Keep HTML simple and readable for a new window.
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Vehicle Details</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 18px; color: #111; }
          h1 { margin: 0 0 12px 0; font-size: 18px; }
          .muted { color: #555; font-size: 12px; }
          .grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; align-items: start; }
          .box { border: 1px solid #e6e6e6; border-radius: 10px; padding: 14px; background: #fff; }
          .kv { display: grid; grid-template-columns: 180px 1fr; gap: 8px 14px; font-size: 13px; }
          .k { color: #666; }
          .v { word-break: break-word; }
          .price { font-weight: 700; }
          .thumbRow { margin-bottom: 12px; }
          .docs { margin: 0; padding-left: 18px; }
          .docs li { margin: 10px 0; }
          .docName { font-weight: 700; }
          .docSub { color: #666; font-size: 12px; margin-top: 2px; }
          .docLink { display: inline-block; margin-top: 6px; font-size: 13px; text-decoration: none; color: #0b57d0; }
          @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .kv { grid-template-columns: 140px 1fr; } }
        </style>
      </head>
      <body>
        <h1>Vehicle Details · ${escapeHtml(v.stockNo || "—")}</h1>
        <div class="grid">
          <div class="box">
            <div class="thumbRow">${imageHtml}</div>
            <div class="muted">Status: ${escapeHtml(v.status || "—")}</div>
            <div style="margin-top:10px;" class="kv">
              <div class="k">Stock No</div><div class="v">${escapeHtml(v.stockNo || "—")}</div>
              <div class="k">VIN</div><div class="v">${escapeHtml(v.vin || "—")}</div>
              <div class="k">Make / Model</div><div class="v">${escapeHtml(vehicleLabel(v) || "—")}</div>
              <div class="k">Color</div><div class="v">${escapeHtml(v.color || "—")}</div>
              <div class="k">Vehicle No</div><div class="v">${escapeHtml(v.vehicleNumber || "—")}</div>
              <div class="k">Type</div><div class="v">${escapeHtml(v.vehicleType || "—")}</div>
              <div class="k">Broker</div><div class="v">${escapeHtml(v.brokerName || "—")}</div>
              <div class="k">Fuel</div><div class="v">${escapeHtml(v.fuelType || "—")}</div>
              <div class="k">Gear</div><div class="v">${escapeHtml(v.gearSystem || "—")}</div>
              <div class="k">Condition</div><div class="v">${escapeHtml(v.vehicleCondition || "—")}</div>
              <div class="k">Engine CC</div><div class="v">${escapeHtml(v.engineCc ?? "—")}</div>
              <div class="k">Mileage</div><div class="v">${escapeHtml(v.mileageKm ?? "—")} km</div>
              <div class="k">Country</div><div class="v">${escapeHtml(v.countryOfOrigin || "—")}</div>
              <div class="k">Notes</div><div class="v">${escapeHtml(v.notes || "—")}</div>
            </div>
            ${
              v.leasingStatus && String(v.leasingStatus).toLowerCase() !== "no"
                ? `<div style="margin-top:14px;" class="kv">
                    <div class="k">Leasing</div><div class="v">${escapeHtml(v.leasingStatus)}</div>
                    <div class="k">Company</div><div class="v">${escapeHtml(v.leasingCompany || "—")}</div>
                    <div class="k">Lease Amount</div><div class="v">${escapeHtml(v.leaseAmount ?? "0")}</div>
                    <div class="k">Balance</div><div class="v">${escapeHtml(v.leaseBalanceAmount ?? "0")}</div>
                    <div class="k">Period</div><div class="v">${escapeHtml(v.leasePeriod || "—")}</div>
                    <div class="k">Balance Period</div><div class="v">${escapeHtml(v.leaseBalancePeriod || "—")}</div>
                  </div>`
                : ""
            }
          </div>
          <div class="box">
            <div class="kv">
              <div class="k">Sell Price</div><div class="v price">${escapeHtml(formatMoney(v.sellPrice))}</div>
              <div class="k">Cost Price</div><div class="v price muted" style="font-weight:600;">${escapeHtml(formatMoney(v.costPrice))}</div>
              <div class="k">Created At</div><div class="v">${escapeHtml(v.createdAt ? new Date(v.createdAt).toLocaleString() : "—")}</div>
              <div class="k">Updated At</div><div class="v">${escapeHtml(v.updatedAt ? new Date(v.updatedAt).toLocaleString() : "—")}</div>
              ${
                v.status === "sold"
                  ? `<div class="k">Sold At</div><div class="v">${escapeHtml(v.soldAt ? new Date(v.soldAt).toLocaleString() : "—")}</div>`
                  : ``
              }
            </div>
            <div style="margin-top:16px;">
              <div style="font-weight:700; margin-bottom:6px;">Documents</div>
              ${docsHtml}
            </div>
            <div style="margin-top:16px;" class="muted">Tip: you can copy Stock/VIN from this window.</div>
          </div>
        </div>
      </body>
    </html>
  `);

  w.document.close();
}

function openHomeVehicleQuickWindow(v) {
  const w = window.open("", "_blank", "width=980,height=680");
  if (!w) {
    toast("Popup blocked. Allow popups to view vehicle details.");
    return;
  }
  const year = v.year != null && v.year !== "" ? String(v.year) : "—";
  const imageHtml = v.imageDataUrl
    ? `<img src="${escapeAttr(v.imageDataUrl)}" alt="Vehicle" style="max-width:220px;max-height:140px;object-fit:contain;border:1px solid #ddd;border-radius:10px;background:#f6f6f6;" />`
    : `<div style="width:220px;height:140px;border:1px solid #ddd;border-radius:10px;display:grid;place-items:center;color:#666;background:#fafafa;">NO IMG</div>`;
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Vehicle Quick View</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
          h1 { margin: 0 0 10px; font-size: 18px; }
          .muted { color: #666; font-size: 12px; }
          .row { display: grid; grid-template-columns: 240px 1fr; gap: 14px; align-items: start; }
          .box { border: 1px solid #e6e6e6; border-radius: 10px; padding: 12px; background: #fff; }
          .kv { display: grid; grid-template-columns: 140px 1fr; gap: 7px 10px; font-size: 13px; }
          .k { color: #666; }
        </style>
      </head>
      <body>
        <h1>Vehicle Quick View</h1>
        <div class="row">
          <div class="box">${imageHtml}</div>
          <div class="box kv">
            <div class="k">Stock No</div><div>${escapeHtml(v.stockNo || "—")}</div>
            <div class="k">VIN</div><div>${escapeHtml(v.vin || "—")}</div>
            <div class="k">Year</div><div>${escapeHtml(year)}</div>
            <div class="k">Make</div><div>${escapeHtml(v.make || "—")}</div>
            <div class="k">Model</div><div>${escapeHtml(v.model || "—")}</div>
            <div class="k">Vehicle Number</div><div>${escapeHtml(v.vehicleNumber || "—")}</div>
            <div class="k">Gear</div><div>${escapeHtml(v.gearSystem || "—")}</div>
            <div class="k">Condition</div><div>${escapeHtml(v.vehicleCondition || "—")}</div>
            <div class="k">Selling Price</div><div><strong>${formatMoney(v.sellPrice)}</strong></div>
          </div>
        </div>
      </body>
    </html>
  `);
  w.document.close();
}

function renderHomeVehicleSearchResults() {
  const tbody = document.querySelector("#homeVehicleSearchTable tbody");
  const summary = document.querySelector("#homeVehicleSearchSummary");
  const input = document.querySelector("#homeVehicleSearch");
  if (!tbody || !summary || !input) return;
  const q = String(input.value || "").trim().toLowerCase();
  tbody.innerHTML = "";
  if (!q) {
    summary.textContent = "Type Stock No or Vehicle Number";
    return;
  }
  const list = (db.vehicles || [])
    .filter((v) => String(v.stockNo || "").toLowerCase().includes(q) || String(v.vehicleNumber || "").toLowerCase().includes(q))
    .slice(0, 30);
  for (const v of list) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><button class="btn btn--ghost js-home-open-stock" type="button">${escapeHtml(v.stockNo || "—")}</button></td>
      <td><button class="btn btn--ghost js-home-open-vehno" type="button">${escapeHtml(v.vehicleNumber || "—")}</button></td>
      <td>${escapeHtml(vehicleLabel(v) || "—")}</td>
      <td class="actions"></td>
    `;
    tr.querySelector(".js-home-open-stock")?.addEventListener("click", () => openHomeVehicleQuickWindow(v));
    tr.querySelector(".js-home-open-vehno")?.addEventListener("click", () => openHomeVehicleQuickWindow(v));
    const actions = tr.querySelector(".actions");
    const btnOpen = mkBtn("Open", "btn");
    btnOpen.addEventListener("click", () => openHomeVehicleQuickWindow(v));
    actions?.append(btnOpen);
    tbody.appendChild(tr);
  }
  summary.textContent = list.length ? `${list.length} result${list.length === 1 ? "" : "s"}` : "No vehicle found.";
}

function openHomeVehicleSearchResultsWindow() {
  const input = document.querySelector("#homeVehicleSearch");
  if (!input) return;
  const q = String(input.value || "").trim().toLowerCase();
  if (!q) {
    toast("Type Stock No or Vehicle Number.");
    return;
  }
  const salesById = new Map((db.sales || []).map((s) => [s.id, s]));

  const purchaseLatestByStockNo = new Map();
  const purchaseLatestByVehicleNumber = new Map();
  for (const p of Array.isArray(db.purchases) ? db.purchases : []) {
    const pv = purchaseRecordVehicle(p);
    const stockNo = String(pv.stockNo || "").trim();
    const vnum = String(pv.vehicleNumber || "").trim();
    const purchaseDate = String(p.purchaseDate || "").trim();
    const createdAt = String(p.createdAt || "").trim();
    const score = `${purchaseDate || "0000-00-00"}|${createdAt || ""}`;
    if (stockNo) {
      const cur = purchaseLatestByStockNo.get(stockNo);
      if (!cur || score > cur.score) purchaseLatestByStockNo.set(stockNo, { purchaseDate, score });
    }
    if (vnum) {
      const cur = purchaseLatestByVehicleNumber.get(vnum);
      if (!cur || score > cur.score) purchaseLatestByVehicleNumber.set(vnum, { purchaseDate, score });
    }
  }

  const garageLatestByStockNo = new Map();
  const garageLatestByVehicleNumber = new Map();
  for (const j of Array.isArray(db.garageJobs) ? db.garageJobs : []) {
    const sn = garageJobStockNo(j);
    const vr = garageJobVehicleRef(j);
    const createdAt = String(j.createdAt || "").trim();
    const score = createdAt || "";
    if (sn) {
      const cur = garageLatestByStockNo.get(sn);
      if (!cur || score > cur.score) garageLatestByStockNo.set(sn, { createdAt, title: j.title || "", score });
    }
    if (vr) {
      const cur = garageLatestByVehicleNumber.get(vr);
      if (!cur || score > cur.score) garageLatestByVehicleNumber.set(vr, { createdAt, title: j.title || "", score });
    }
  }

  const list = (db.vehicles || [])
    .filter((v) => String(v.stockNo || "").toLowerCase().includes(q) || String(v.vehicleNumber || "").toLowerCase().includes(q))
    .slice(0, 100)
    .map((v) => ({
      stockNo: v.stockNo || "—",
      vehicleNumber: v.vehicleNumber || "—",
      vehicle: vehicleLabel(v) || "—",
      vin: v.vin || "—",
      year: v.year ?? "—",
      make: v.make || "—",
      model: v.model || "—",
      gear: v.gearSystem || "—",
      condition: v.vehicleCondition || "—",
      sellPrice: formatMoney(v.sellPrice),
      imageDataUrl: v.imageDataUrl || "",
      // Inventory: purchase date + ready-to-sell
      inventoryPurchaseDate:
        purchaseLatestByStockNo.get(String(v.stockNo || "").trim())?.purchaseDate ||
        purchaseLatestByVehicleNumber.get(String(v.vehicleNumber || "").trim())?.purchaseDate ||
        "",
      readyToSell: v.status !== "sold" && !vehicleHasActiveGarageJob(v) ? "Yes" : "No",
      // Garage: last job sent to garage + title
      garageSentToDate:
        garageLatestByStockNo.get(String(v.stockNo || "").trim())?.createdAt ||
        garageLatestByVehicleNumber.get(String(v.vehicleNumber || "").trim())?.createdAt ||
        "",
      garageTitle:
        garageLatestByStockNo.get(String(v.stockNo || "").trim())?.title ||
        garageLatestByVehicleNumber.get(String(v.vehicleNumber || "").trim())?.title ||
        "",
      // Sold: sold date + customer name
      soldDate: v.soldAt ? String(v.soldAt) : "",
      soldCustomerName:
        v.saleId && salesById.get(v.saleId)?.customer?.name
          ? salesById.get(v.saleId).customer.name
          : "",
    }));

  const w = window.open("", "_blank", "width=980,height=680");
  if (!w) {
    toast("Popup blocked. Allow popups to view search results.");
    return;
  }

  const payload = JSON.stringify(list).replace(/</g, "\\u003c");
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Vehicle Search Results</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
          h1 { margin: 0 0 6px; font-size: 18px; }
          .muted { color: #666; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border-bottom: 1px solid #e6e6e6; padding: 10px; text-align: left; vertical-align: top; }
          th { background: #f8fafc; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; }
          .btn { border: 1px solid #d1d5db; border-radius: 8px; background: #fff; padding: 6px 10px; cursor: pointer; }
          .btn:hover { background: #f8fafc; }
          .num { text-align: right; }
        </style>
      </head>
      <body>
        <h1>Vehicle Search Results</h1>
        <div class="muted">Search: ${escapeHtml(input.value || "")} · ${list.length} result${list.length === 1 ? "" : "s"}</div>
        <table>
          <thead>
            <tr>
              <th>Stock No</th>
              <th>Vehicle Number</th>
              <th>Vehicle</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
        <script>
          const rows = ${payload};
          const tbody = document.getElementById("rows");
          function esc(v){
            return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
          }
          function openDetail(i){
            const v = rows[i];
            const ww = window.open("", "_blank", "width=920,height=640");
            if(!ww) return;
            const imageHtml = v.imageDataUrl
              ? '<img src="' + esc(v.imageDataUrl) + '" alt="Vehicle" style="max-width:220px;max-height:140px;object-fit:contain;border:1px solid #ddd;border-radius:10px;background:#f6f6f6;" />'
              : '<div style="width:220px;height:140px;border:1px solid #ddd;border-radius:10px;display:grid;place-items:center;color:#666;background:#fafafa;">NO IMG</div>';
            const invPurchase = v.inventoryPurchaseDate ? new Date(v.inventoryPurchaseDate).toLocaleDateString() : "—";
            const garageDate = v.garageSentToDate ? new Date(v.garageSentToDate).toLocaleDateString() : "—";
            const soldDate = v.soldDate ? new Date(v.soldDate).toLocaleDateString() : "—";
            const soldCustomer = v.soldCustomerName || "—";
            ww.document.write('<!doctype html><html><head><meta charset="utf-8"/><title>Vehicle Quick View</title><style>body{font-family:Arial,sans-serif;padding:16px;color:#111}.row{display:grid;grid-template-columns:240px 1fr;gap:14px}.box{border:1px solid #e6e6e6;border-radius:10px;padding:12px}.kv{display:grid;grid-template-columns:140px 1fr;gap:7px 10px;font-size:13px}.k{color:#666}h1{margin:0 0 10px;font-size:18px}</style></head><body><h1>Vehicle Quick View</h1><div class="row"><div class="box">'+imageHtml+'</div><div class="box kv"><div class="k">Stock No</div><div>'+esc(v.stockNo)+'</div><div class="k">VIN</div><div>'+esc(v.vin)+'</div><div class="k">Year</div><div>'+esc(v.year)+'</div><div class="k">Make</div><div>'+esc(v.make)+'</div><div class="k">Model</div><div>'+esc(v.model)+'</div><div class="k">Vehicle Number</div><div>'+esc(v.vehicleNumber)+'</div><div class="k">Gear</div><div>'+esc(v.gear)+'</div><div class="k">Condition</div><div>'+esc(v.condition)+'</div><div class="k">Selling Price</div><div><strong>'+esc(v.sellPrice)+'</strong></div><div class="k">Inventory Purchase Date</div><div>'+esc(invPurchase)+'</div><div class="k">Ready to Sell</div><div>'+esc(v.readyToSell || "No")+'</div><div class="k">Sent to Garage Date</div><div>'+esc(garageDate)+'</div><div class="k">Garage Title</div><div>'+esc(v.garageTitle || "—")+'</div><div class="k">Sold Date</div><div>'+esc(soldDate)+'</div><div class="k">Sold Customer</div><div>'+esc(soldCustomer)+'</div></div></div></body></html>');
            ww.document.close();
          }
          if(!rows.length){
            tbody.innerHTML = '<tr><td colspan="4" class="muted">No vehicle found.</td></tr>';
          } else {
            tbody.innerHTML = rows.map((v, i) => '<tr><td>'+esc(v.stockNo)+'</td><td>'+esc(v.vehicleNumber)+'</td><td>'+esc(v.vehicle)+'</td><td><button class="btn" type="button" onclick="openDetail('+i+')">Open</button></td></tr>').join("");
          }
        </script>
      </body>
    </html>
  `);
  w.document.close();
}

function openHomeQuickTab(tab) {
  if (!canOpenNav(tab)) {
    toast(`No permission: ${tab}`);
    return;
  }
  setActiveTab(tab);
}

function renderInventoryReports() {
  const table = document.querySelector("#inventoryReportsTable");
  if (!table) return;

  const tbody = $("#inventoryReportsTable tbody");
  tbody.innerHTML = "";

  const typeSettings = db.meta.inventoryReports?.typeSettings ?? {};

  const types = new Set();
  for (const v of db.vehicles) types.add(inventoryTypeKey(v.vehicleType));
  for (const k of Object.keys(typeSettings || {})) types.add(k);

  const sortedTypes = Array.from(types).sort((a, b) => a.localeCompare(b));

  let totalOnHandCount = 0;
  let totalCost = 0;
  let totalSell = 0;

  for (const type of sortedTypes) {
    const onHand = db.vehicles.filter((v) => v.status === "available" && inventoryTypeKey(v.vehicleType) === type);
    const stockOnHandCount = onHand.length;

    const totalCostPrice = onHand.reduce((s, v) => s + safeNumber(v.costPrice, 0), 0);
    const totalSellingPrice = onHand.reduce((s, v) => s + safeNumber(v.sellPrice, 0), 0);

    totalOnHandCount += stockOnHandCount;
    totalCost += totalCostPrice;
    totalSell += totalSellingPrice;
    tbody.innerHTML += `
      <tr>
        <td>
          <div class="row" style="gap:10px;align-items:center;justify-content:space-between;">
            <span>${escapeHtml(type)}</span>
            <button type="button" class="btn btn--ghost" data-inv-type-details="${escapeAttr(type)}">Details</button>
          </div>
        </td>
        <td class="num">${stockOnHandCount}</td>
        <td class="num">${formatMoney(totalCostPrice)}</td>
        <td class="num">${formatMoney(totalSellingPrice)}</td>
      </tr>
    `;
  }

  $("#kpiInvOnHand").textContent = String(totalOnHandCount);
  $("#kpiInvTotalCost").textContent = formatMoney(totalCost);
  $("#kpiInvTotalSell").textContent = formatMoney(totalSell);

  $("#inventoryReportsSummary").textContent = `${sortedTypes.length} type${sortedTypes.length === 1 ? "" : "s"}`;

  // Attach Details handlers after re-render.
  document.querySelectorAll("#inventoryReportsTable button[data-inv-type-details]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.invTypeDetails || "";
      viewVehiclesByInventoryTypeDetails(type);
    });
  });
}

function viewVehiclesByInventoryTypeDetails(type) {
  const vType = String(type ?? "").trim();
  if (!vType) return;

  const list = (Array.isArray(db.vehicles) ? db.vehicles : [])
    .filter((v) => v.status === "available" && inventoryTypeKey(v.vehicleType) === vType);

  const w = window.open("", "_blank", "width=980,height=680");
  if (!w) {
    toast("Popup blocked. Allow popups to view type details.");
    return;
  }

  const rowsHtml = list
    .slice()
    .sort((a, b) => String(a.stockNo ?? "").localeCompare(String(b.stockNo ?? "")))
    .map((v) => {
      const yearDisp = v.year != null && v.year !== "" ? String(v.year) : "—";
      return `
        <tr>
          <td>${v.imageDataUrl ? `<img class="thumb" alt="img" src="${escapeAttr(v.imageDataUrl)}" />` : `<div class="thumb thumb--empty">NO IMG</div>`}</td>
          <td><strong>${escapeHtml(v.stockNo || "—")}</strong><div class="muted" style="margin-top:4px;">VIN: ${escapeHtml(v.vin || "—")}</div></td>
          <td>${escapeHtml(yearDisp)}</td>
          <td>${escapeHtml(String(v.make || "").trim() || "—")}</td>
          <td>${escapeHtml(String(v.model || "").trim() || "—")}</td>
          <td>${escapeHtml(v.vehicleNumber || "—")}</td>
          <td>${escapeHtml(v.gearSystem || "—")}</td>
          <td style="text-align:right">${formatMoney(v.costPrice)}</td>
          <td style="text-align:right">${formatMoney(v.sellPrice)}</td>
        </tr>
      `;
    })
    .join("");

  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Inventory Type Details · ${escapeHtml(vType)}</title>
        <link rel="stylesheet" href="./styles.css" />
        <style>
          body { font-family: Arial, sans-serif; padding: 14px; }
          h1 { font-size: 16px; margin: 0 0 10px 0; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #e6e6e6; padding: 8px 6px; font-size: 12px; vertical-align: top; }
          th { text-align: left; background: #fafafa; }
          .thumb { width: 44px; height: 34px; object-fit: cover; border-radius: 6px; border: 1px solid #eee; }
          .thumb--empty { width: 44px; height: 34px; display:flex;align-items:center;justify-content:center; background:#f3f3f3; color:#999; font-size:10px; border-radius:6px; border:1px dashed #ddd; }
          .muted { color:#666; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(db.meta.companyName || "E-Inventory")} · Inventory Type Details</h1>
        <div class="muted" style="margin-bottom:12px;">Type: <strong>${escapeHtml(vType)}</strong> · Vehicles: <strong>${list.length}</strong></div>
        <div style="overflow:auto; max-height: 560px;">
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Stock / VIN</th>
                <th>Year</th>
                <th>Make</th>
                <th>Model</th>
                <th>Vehicle No</th>
                <th>Gear</th>
                <th style="text-align:right">Cost</th>
                <th style="text-align:right">Sell</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || `<tr><td colspan="9" class="muted">No vehicles found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </body>
    </html>
  `);
  w.document.close();
}

function inventoryTypeKey(vType) {
  const t = String(vType ?? "").trim();
  return t || "Unspecified";
}

function saveInventoryReportSettings() {
  requirePerm("inventory report settings", PERMS.INVENTORY_EDIT);

  const typeSettings = db.meta.inventoryReports?.typeSettings ?? {};

  const inputs = document.querySelectorAll('input[data-inv-field][data-inv-type]');
  for (const el of Array.from(inputs)) {
    const type = el.dataset.invType || "Unspecified";
    const field = el.dataset.invField;
    if (!field) continue;

    const val = safeNumber(el.value, 0);
    if (!typeSettings[type]) typeSettings[type] = {};
    typeSettings[type][field] = val;
  }

  db.meta.inventoryReports = { ...(db.meta.inventoryReports ?? {}), typeSettings };
  persist();
  renderInventoryReports();
  toast("Inventory report settings saved.");
}

function getInventoryReportTypeSettingsFromUiOrMeta() {
  const meta = db.meta.inventoryReports?.typeSettings ?? {};
  const uiInputs = document.querySelectorAll('input[data-inv-field][data-inv-type]');
  if (!uiInputs || uiInputs.length === 0) return meta;

  // Build a new object from UI values, but keep meta for types/fields not present.
  const merged = { ...(meta || {}) };
  for (const el of Array.from(uiInputs)) {
    const type = el.dataset.invType || "Unspecified";
    const field = el.dataset.invField;
    if (!field) continue;

    if (!merged[type]) merged[type] = {};
    merged[type][field] = safeNumber(el.value, 0);
  }

  return merged;
}

function computeInventoryReports(typeSettings) {
  const settings = typeSettings ?? {};

  const types = new Set();
  for (const v of db.vehicles) types.add(inventoryTypeKey(v.vehicleType));
  for (const k of Object.keys(settings || {})) types.add(k);

  const sortedTypes = Array.from(types).sort((a, b) => a.localeCompare(b));

  const rows = [];
  let totalOnHandCount = 0;
  let totalCost = 0;
  let totalSell = 0;

  for (const type of sortedTypes) {
    const onHand = db.vehicles.filter((v) => v.status === "available" && inventoryTypeKey(v.vehicleType) === type);
    const stockOnHandCount = onHand.length;

    const totalCostPrice = onHand.reduce((s, v) => s + safeNumber(v.costPrice, 0), 0);
    const totalSellingPrice = onHand.reduce((s, v) => s + safeNumber(v.sellPrice, 0), 0);

    totalOnHandCount += stockOnHandCount;
    totalCost += totalCostPrice;
    totalSell += totalSellingPrice;

    rows.push({
      type,
      stockOnHand: stockOnHandCount,
      totalCostPrice,
      totalSellingPrice,
    });
  }

  return {
    rows,
    totals: {
      onHand: totalOnHandCount,
      cost: totalCost,
      sell: totalSell,
    },
    typesCount: sortedTypes.length,
  };
}

function exportInventoryReportsCsv() {
  requirePerm("inventory view/export", PERMS.INVENTORY_VIEW);

  const typeSettings = getInventoryReportTypeSettingsFromUiOrMeta();
  const report = computeInventoryReports(typeSettings);

  const rows = [
    ["Vehicle Type", "Stock on Hand", "Total Cost Price", "Total Selling Price"],
    ...report.rows.map((r) => [
      r.type,
      String(r.stockOnHand),
      String(r.totalCostPrice),
      String(r.totalSellingPrice),
    ]),
  ];

  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inventory-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast("Inventory report downloaded (CSV).");
}

function printInventoryReports() {
  requirePerm("inventory view/print", PERMS.INVENTORY_VIEW);

  const typeSettings = getInventoryReportTypeSettingsFromUiOrMeta();
  const report = computeInventoryReports(typeSettings);

  const rowsHtml = report.rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.type)}</td>
      <td style="text-align:right">${r.stockOnHand}</td>
      <td style="text-align:right">${formatMoney(r.totalCostPrice)}</td>
      <td style="text-align:right">${formatMoney(r.totalSellingPrice)}</td>
    </tr>`
    )
    .join("");

  const w = window.open("", "_blank");
  if (!w) {
    toast("Popup blocked. Allow popups to print.");
    return;
  }

  const companyName = db.meta.companyName || "E-Inventory";

  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Inventory Reports</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 16px; color: #111; }
          h1 { font-size: 18px; margin: 0 0 12px 0; }
          .muted { color: #555; font-size: 12px; }
          .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
          .kpi { border: 1px solid #e6e6e6; border-radius: 10px; padding: 10px; }
          .kpi .v { font-weight: 700; margin-top: 6px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border-bottom: 1px solid #e6e6e6; padding: 8px; font-size: 12px; vertical-align: top; }
          th { text-align: left; color: #333; background: #f7f7f7; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(companyName)} · Inventory Reports</h1>
        <div class="muted">Generated: ${escapeHtml(new Date().toLocaleString())}</div>

        <div class="kpis">
          <div class="kpi">
            <div class="muted">Stock on hand</div>
            <div class="v">${report.totals.onHand}</div>
          </div>
          <div class="kpi">
            <div class="muted">Total cost price</div>
            <div class="v">${formatMoney(report.totals.cost)}</div>
          </div>
          <div class="kpi">
            <div class="muted">Total selling price</div>
            <div class="v">${formatMoney(report.totals.sell)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Vehicle Type</th>
              <th style="text-align:right">Stock on hand</th>
              <th style="text-align:right">Total Cost Price</th>
              <th style="text-align:right">Total Selling Price</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="4" class="muted">No inventory found.</td></tr>`}
          </tbody>
        </table>

        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);

  w.document.close();
}

function mkBtn(text, className) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = text;
  return b;
}

function escapeAttr(s) {
  return String(s ?? "").replaceAll("\"", "&quot;");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

let pendingVehicleImageDataUrl = "";

function setVehicleImagePreview(dataUrl) {
  const wrap = $("#vehicleImagePreviewWrap");
  const img = $("#vehicleImagePreview");
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
}

function clearVehicleImagePreview() {
  pendingVehicleImageDataUrl = "";
  $("#vehicleImageInput").value = "";
  setVehicleImagePreview("");
}

let pendingPurchaseImageDataUrl = "";

function setPurchaseImagePreview(dataUrl) {
  const wrap = document.querySelector("#purchaseImagePreviewWrap");
  const img = document.querySelector("#purchaseImagePreview");
  if (!wrap || !img) return;
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
}

function clearPurchaseImagePreview() {
  pendingPurchaseImageDataUrl = "";
  const input = document.querySelector("#purchaseImageInput");
  if (input) input.value = "";
  setPurchaseImagePreview("");
}

function updatePurchaseLeaseSectionVisibility() {
  const sec = document.querySelector("#purchaseLeaseSection");
  const cond = (document.querySelector("#purchaseVehicleCondition")?.value || "").trim();
  if (!sec) return;
  const show = cond === "Used";
  sec.hidden = !show;
  if (!show) {
    const ls = document.querySelector("#purchaseLeasingStatus");
    if (ls) ls.value = "No";
    const lc = document.querySelector("#purchaseLeasingCompany");
    if (lc) lc.value = "";
    const la = document.querySelector("#purchaseLeaseAmount");
    if (la) la.value = "";
    const lb = document.querySelector("#purchaseLeaseBalanceAmount");
    if (lb) lb.value = "";
    const lp = document.querySelector("#purchaseLeasePeriod");
    if (lp) lp.value = "";
    const lbp = document.querySelector("#purchaseLeaseBalancePeriod");
    if (lbp) lbp.value = "";
  }
}

function renderPurchaseVehicleBrokerOptions() {
  const sel = document.querySelector("#purchaseVehicleBrokerName");
  if (!sel) return;
  const current = sel.value || "Self";
  const options = new Set();
  options.add("Self");
  for (const b of Array.isArray(db.brokers) ? db.brokers : []) {
    const n = String(b?.name || "").trim();
    if (n) options.add(n);
  }
  sel.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    sel.appendChild(o);
  }
  sel.value = Array.from(options).includes(current) ? current : "Self";
}

function renderPurchasePartyOptions() {
  const sel = document.querySelector("#purchaseParty");
  if (!sel) return;
  const source = document.querySelector("#purchaseSource")?.value || "supplier";
  const current = sel.value;
  sel.innerHTML = "";
  const add = (val, text) => {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = text;
    sel.appendChild(o);
  };
  add("", "— Select —");
  if (source === "broker") {
    for (const b of Array.isArray(db.brokers) ? db.brokers : []) {
      const n = String(b?.name || "").trim();
      if (n) add(n, n);
    }
  } else {
    for (const s of Array.isArray(db.suppliers) ? db.suppliers : []) {
      const n = String(s?.name || "").trim();
      if (n) add(n, n);
    }
  }
  const opts = Array.from(sel.options).map((o) => o.value);
  if (current && opts.includes(current)) sel.value = current;
}

/** Normalize vehicle data on a purchase record (supports older saved shapes). */
function purchaseRecordVehicle(p) {
  if (p && p.vehicle && typeof p.vehicle === "object" && (p.vehicle.make || p.vehicle.model || p.vehicle.stockNo)) {
    return p.vehicle;
  }
  if (typeof p?.vehicle === "string" && p.vehicle.trim()) {
    return normalizeVehicle({
      stockNo: p.stockNo || "",
      make: p.vehicle,
      model: "",
      year: p.year,
      costPrice: p.cost ?? p.costPrice ?? 0,
      sellPrice: p.sellPrice ?? 0,
    });
  }
  return normalizeVehicle({
    stockNo: p?.stockNo || "",
    vin: p?.vin || "",
    make: p?.make || "",
    model: p?.model || "",
    year: p?.year,
    costPrice: p?.cost ?? p?.costPrice ?? 0,
    sellPrice: p?.sellPrice ?? 0,
  });
}

function addPurchaseFromForm(e) {
  e.preventDefault();
  if (!isAdmin()) {
    toast("Only admin can record purchases.");
    return;
  }
  const partyName = (document.querySelector("#purchaseParty")?.value || "").trim();
  if (!partyName) {
    toast("Select a supplier or broker.");
    return;
  }

  const payload = {
    stockNo: document.querySelector("#purchaseStockNo")?.value,
    vin: document.querySelector("#purchaseVin")?.value,
    make: document.querySelector("#purchaseMake")?.value,
    model: document.querySelector("#purchaseModel")?.value,
    year: document.querySelector("#purchaseYear")?.value,
    color: document.querySelector("#purchaseColor")?.value,
    vehicleNumber: document.querySelector("#purchaseVehicleNumber")?.value,
    vehicleType: document.querySelector("#purchaseVehicleType")?.value,
    brokerName: document.querySelector("#purchaseVehicleBrokerName")?.value,
    countryOfOrigin: document.querySelector("#purchaseCountryOfOrigin")?.value,
    mileageKm: document.querySelector("#purchaseMileageKm")?.value,
    fuelType: document.querySelector("#purchaseFuelType")?.value,
    gearSystem: document.querySelector("#purchaseGearSystem")?.value,
    vehicleCondition: document.querySelector("#purchaseVehicleCondition")?.value,
    leasingStatus: document.querySelector("#purchaseLeasingStatus")?.value,
    leasingCompany: document.querySelector("#purchaseLeasingCompany")?.value,
    leaseAmount: document.querySelector("#purchaseLeaseAmount")?.value,
    leaseBalanceAmount: document.querySelector("#purchaseLeaseBalanceAmount")?.value,
    leasePeriod: document.querySelector("#purchaseLeasePeriod")?.value,
    leaseBalancePeriod: document.querySelector("#purchaseLeaseBalancePeriod")?.value,
    engineCc: document.querySelector("#purchaseEngineCc")?.value,
    costPrice: document.querySelector("#purchaseCostPrice")?.value,
    sellPrice: document.querySelector("#purchaseSellPrice")?.value,
    notes: document.querySelector("#purchaseNotes")?.value,
  };

  const nv = normalizeVehicle(payload);
  if (!nv.stockNo || !nv.make || !nv.model) {
    toast("Please fill Stock No., Make, and Model.");
    return;
  }
  if (nv.costPrice <= 0) {
    toast("Enter a valid cost price.");
    return;
  }

  nv.imageDataUrl = pendingPurchaseImageDataUrl || "";
  nv.docs = [];
  nv.status = "available";
  nv.soldAt = null;
  nv.saleId = null;

  const rec = {
    id: uid("pur"),
    createdAt: nowIso(),
    purchaseDate: document.querySelector("#purchaseDate")?.value || todayISODate(),
    source: document.querySelector("#purchaseSource")?.value || "supplier",
    partyName,
    vehicle: nv,
  };

  db.purchases = Array.isArray(db.purchases) ? db.purchases : [];
  db.purchases.unshift(rec);
  persist();
  resetPurchaseForm();
  closePurchaseFormDialog();
  renderPurchases();
  toast("Purchase recorded.");
}

function resetPurchaseForm() {
  document.querySelector("#purchaseForm")?.reset();
  clearPurchaseImagePreview();
  const d = document.querySelector("#purchaseDate");
  if (d) d.value = todayISODate();
  renderPurchasePartyOptions();
  renderPurchaseVehicleBrokerOptions();
  updatePurchaseLeaseSectionVisibility();
}

function renderPurchases() {
  const tbody = document.querySelector("#purchaseTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const q = (document.querySelector("#purchaseSearch")?.value || "").trim().toLowerCase();
  const list = (Array.isArray(db.purchases) ? db.purchases : [])
    .filter((p) => {
      if (!q) return true;
      const v = purchaseRecordVehicle(p);
      const hay = `${p.partyName ?? ""} ${p.source ?? ""} ${v.stockNo} ${v.vin} ${v.make} ${v.model} ${vehicleLabel(v)} ${v.gearSystem ?? ""} ${p.purchaseDate ?? ""}`
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  for (const p of list) {
    const v = purchaseRecordVehicle(p);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(p.purchaseDate || "—")}</td>
      <td><span class="pill">${escapeHtml(p.source || "—")}</span></td>
      <td>${escapeHtml(p.partyName || "—")}</td>
      <td><span class="pill">${escapeHtml(v.stockNo || "—")}</span></td>
      <td><strong>${escapeHtml(vehicleLabel(v) || "—")}</strong></td>
      <td class="num">${formatMoney(v.costPrice)}</td>
      <td class="num">${formatMoney(v.sellPrice)}</td>
    `;
    tbody.appendChild(tr);
  }

  const sum = document.querySelector("#purchaseSummary");
  if (sum) sum.textContent = `${list.length} purchase${list.length === 1 ? "" : "s"}`;
}

function updateLeaseSectionVisibility() {
  const sec = document.querySelector("#leaseSection");
  const cond = (document.querySelector("#vehicleCondition")?.value || "").trim();
  const isAddMode = !(document.querySelector("#vehicleId")?.value || "").trim();
  if (!sec) return;
  const show = isAddMode && cond === "Used";
  sec.hidden = !show;
  if (!show) {
    document.querySelector("#leasingStatus").value = "No";
    document.querySelector("#leasingCompany").value = "";
    document.querySelector("#leaseAmount").value = "";
    document.querySelector("#leaseBalanceAmount").value = "";
    document.querySelector("#leasePeriod").value = "";
    document.querySelector("#leaseBalancePeriod").value = "";
  }
}

function renderVehicleBrokerOptions() {
  const sel = document.querySelector("#vehicleBrokerName");
  if (!sel) return;

  const current = sel.value || "Self";
  const options = new Set();
  options.add("Self");

  const brokers = Array.isArray(db.brokers) ? db.brokers : [];
  for (const b of brokers) {
    const n = String(b?.name || "").trim();
    if (n) options.add(n);
  }

  sel.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    sel.appendChild(o);
  }
  sel.value = Array.from(options).includes(current) ? current : "Self";
}

async function readImageAsDataUrl(file) {
  if (!file) return "";
  if (!file.type?.startsWith("image/")) throw new Error("Not an image");
  return await readFileAsDataUrl(file);
}

async function upsertVehicleFromForm(e) {
  e.preventDefault();
  requirePerm("save vehicle", PERMS.INVENTORY_EDIT);
  const id = $("#vehicleId").value.trim();
  const payload = {
    id: id || undefined,
    stockNo: $("#stockNo").value,
    vin: $("#vin").value,
    make: $("#make").value,
    model: $("#model").value,
    year: $("#year").value,
    color: $("#color").value,
    vehicleNumber: $("#vehicleNumber").value,
    vehicleType: $("#vehicleType").value,
    brokerName: $("#vehicleBrokerName").value,
    countryOfOrigin: $("#countryOfOrigin").value,
    mileageKm: $("#mileageKm").value,
    fuelType: $("#fuelType").value,
    gearSystem: $("#gearSystem").value,
    vehicleCondition: $("#vehicleCondition").value,
    leasingStatus: $("#leasingStatus").value,
    leasingCompany: $("#leasingCompany").value,
    leaseAmount: $("#leaseAmount").value,
    leaseBalanceAmount: $("#leaseBalanceAmount").value,
    leasePeriod: $("#leasePeriod").value,
    leaseBalancePeriod: $("#leaseBalancePeriod").value,
    engineCc: $("#engineCc").value,
    costPrice: $("#costPrice").value,
    sellPrice: $("#sellPrice").value,
    notes: $("#notes").value,
  };

  const normalized = normalizeVehicle(payload);
  if (!normalized.stockNo || !normalized.make || !normalized.model) {
    toast("Please fill Stock No., Make, and Model.");
    return;
  }

  const dupStock = db.vehicles.find((v) => v.stockNo.toLowerCase() === normalized.stockNo.toLowerCase() && v.id !== normalized.id);
  if (dupStock) {
    toast("Stock No. already exists. Use a unique stock number.");
    return;
  }

  const idx = db.vehicles.findIndex((v) => v.id === normalized.id);
  if (idx >= 0) {
    // preserve status/docs/sale linkage
    normalized.status = db.vehicles[idx].status;
    normalized.soldAt = db.vehicles[idx].soldAt;
    normalized.saleId = db.vehicles[idx].saleId;
    normalized.docs = db.vehicles[idx].docs ?? [];
    normalized.imageDataUrl = db.vehicles[idx].imageDataUrl ?? "";
    normalized.createdAt = db.vehicles[idx].createdAt;

    if (pendingVehicleImageDataUrl) normalized.imageDataUrl = pendingVehicleImageDataUrl;

    db.vehicles[idx] = normalized;
    toast("Vehicle updated.");
  } else {
    if (pendingVehicleImageDataUrl) normalized.imageDataUrl = pendingVehicleImageDataUrl;
    db.vehicles.push(normalized);
    toast("Vehicle added.");
  }
  persist();
  resetVehicleForm();
  closeVehicleFormDialog();
  renderAll();
}

function deleteVehicleFromForm() {
  requirePerm("delete vehicle", PERMS.INVENTORY_DELETE);
  const id = $("#vehicleId").value.trim();
  if (!id) return;
  const v = getVehicleById(id);
  if (!v) return;

  if (v.status === "sold") {
    toast("Cannot delete a SOLD vehicle. Void the sale first (Reports).");
    return;
  }
  if (isInCart(id)) {
    toast("Remove from cart before deleting.");
    return;
  }
  if (!confirm(`Delete vehicle ${v.stockNo} (${vehicleLabel(v)})?`)) return;

  db.vehicles = db.vehicles.filter((x) => x.id !== id);
  persist();
  resetVehicleForm();
  closeVehicleFormDialog();
  renderAll();
  toast("Vehicle deleted.");
}

function cartTotals() {
  const items = db.cart.items
    .map(getVehicleById)
    .filter(Boolean)
    .filter((v) => v.status !== "sold");

  const subtotal = items.reduce((sum, v) => sum + safeNumber(v.sellPrice, 0), 0);
  const discount = Math.min(safeNumber(db.cart.discount, 0), subtotal);
  const total = Math.max(0, subtotal - discount);
  return { items, subtotal, discount, total };
}

function renderCart() {
  const tbody = $("#cartTable tbody");
  tbody.innerHTML = "";

  // remove missing or sold vehicles from cart
  db.cart.items = db.cart.items.filter((id) => {
    const v = getVehicleById(id);
    return v && v.status !== "sold";
  });

  const { items, subtotal, discount, total } = cartTotals();
  $("#cartCountBadge").textContent = String(items.length);
  $("#cartSubtotal").textContent = formatMoney(subtotal);
  $("#cartTotal").textContent = formatMoney(total);
  $("#cartDiscount").value = String(db.cart.discount ?? 0);

  for (const v of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(v.stockNo)}</span></td>
      <td><strong>${escapeHtml(vehicleLabel(v))}</strong><div class="muted" style="margin-top:6px;">${escapeHtml(v.vin || "—")}</div></td>
      <td class="num"><strong>${formatMoney(v.sellPrice)}</strong></td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnRemove = mkBtn("Remove", "btn btn--danger");
    btnRemove.addEventListener("click", () => {
      db.cart.items = db.cart.items.filter((id) => id !== v.id);
      persist();
      renderAll();
      toast("Removed from cart.");
    });
    actions.append(btnRemove);
    tbody.appendChild(tr);
  }

  renderInvoicePreview();
  persist();
}

function nextInvoiceNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const prefix = `INV-${y}${m}${day}-`;
  const existing = db.sales
    .map((s) => String(s.invoiceNo ?? ""))
    .filter((x) => x.startsWith(prefix))
    .map((x) => safeNumber(x.slice(prefix.length), 0));
  const next = (existing.length ? Math.max(...existing) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function renderInvoicePreview() {
  const { items, subtotal, discount, total } = cartTotals();
  const invNo = ($("#invoiceNo").value || "").trim() || nextInvoiceNo();
  const dt = new Date();
  const dtStr = dt.toLocaleString();

  $("#invMetaLine").textContent = dtStr;
  $("#invNo").textContent = invNo;
  $("#invDate").textContent = dtStr;

  const customer = ($("#invoiceCustomerName").value || "").trim() || "Walk-in";
  const phone = ($("#invoiceCustomerPhone").value || "").trim() || "—";
  const pay = $("#paymentMethod").value || "Cash";
  const bearingIdNo = ($("#bearingAmount").value || "").trim() || "—";
  const paidRaw = ($("#sumLkrAmount").value || "").trim();
  const paidAmount = paidRaw ? Math.max(0, safeNumber(paidRaw, total)) : total;
  const sumLkr = subtotal;

  $("#invCustomer").textContent = customer;
  $("#invPhone").textContent = phone;
  $("#invPayment").textContent = pay;
  const invPaymentsSummaryEl = document.querySelector("#invPaymentsSummary");
  if (invPaymentsSummaryEl) {
    const remaining = Math.max(0, total - paidAmount);
    if (remaining <= 0) {
      invPaymentsSummaryEl.textContent = "Full Payments";
    } else {
      invPaymentsSummaryEl.textContent = `${pay} Paid: ${formatMoney(paidAmount)} | Balance: ${formatMoney(remaining)}`;
    }
  }

  const tb = $("#invoiceItemsTable tbody");
  tb.innerHTML = "";
  const saleOf = items.map((v) => vehicleLabel(v)).filter(Boolean).join(", ") || "—";
  const regNo = items.map((v) => v.vehicleNumber).filter(Boolean).join(", ") || "—";
  for (const v of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(v.stockNo)}</td>
      <td>
        ${escapeHtml(vehicleLabel(v))}
        ${v.vin ? `<div class="muted" style="margin-top:4px;">VIN: ${escapeHtml(v.vin)}</div>` : ""}
        ${v.color ? `<div class="muted" style="margin-top:${v.vin ? "2px" : "4px"};">Color: ${escapeHtml(v.color)}</div>` : ""}
        ${v.gearSystem ? `<div class="muted" style="margin-top:2px;">Gear: ${escapeHtml(v.gearSystem)}</div>` : ""}
      </td>
      <td class="num">${formatMoney(v.sellPrice)}</td>
    `;
    tb.appendChild(tr);
  }

  const invSubtotalEl = document.querySelector("#invSubtotal");
  const invDiscountEl = document.querySelector("#invDiscount");
  const invTotalEl = document.querySelector("#invTotal");
  const invBearingEl = document.querySelector("#invBearingAmount");
  const invSumLkrEl = document.querySelector("#invSumLkrAmount");
  if (invSubtotalEl) invSubtotalEl.textContent = formatMoney(subtotal);
  if (invDiscountEl) invDiscountEl.textContent = formatMoney(discount);
  if (invTotalEl) invTotalEl.textContent = formatMoney(total);
  if (invBearingEl) invBearingEl.textContent = bearingIdNo;
  if (invSumLkrEl) invSumLkrEl.textContent = formatMoney(sumLkr);
  const amountWords = `${numberToWords(sumLkr)} LKR Only`;
  const docsCount = items.reduce((s, v) => s + (Array.isArray(v.docs) ? v.docs.length : 0), 0);
  $("#invSaleOf").textContent = saleOf;
  $("#invRegNo").textContent = regNo;
  $("#invAmountWords").textContent = amountWords;
  $("#invDocOriginalCr").textContent = docsCount ? "Attached" : "Pending";
  $("#invDocNoObj").textContent = "Pending";
  $("#invDocDeletion").textContent = "Pending";
  $("#invDocRevenue").textContent = "Pending";
  $("#invDocOthers").textContent = $("#invoiceRemarks").value?.trim() || "—";

  const remarks = ($("#invoiceRemarks").value || "").trim();
  $("#invFooter").textContent = remarks || "Thank you.";
  const year = new Date().getFullYear();
  const companyName = db.meta.companyName || "E-Inventory";
  $("#invCopyright").textContent = `© ${year} ${companyName}. All rights reserved.`;
}

function clearCart() {
  requirePerm("billing", PERMS.BILLING_USE);
  if (!db.cart.items.length) return;
  if (!confirm("Clear cart?")) return;
  db.cart.items = [];
  db.cart.discount = 0;
  persist();
  renderAll();
  toast("Cart cleared.");
}

function completeSale() {
  requirePerm("complete sale", PERMS.BILLING_SALE);
  const { items, subtotal, discount, total } = cartTotals();
  if (!items.length) {
    toast("Cart is empty.");
    return;
  }

  const invoiceNo = ($("#invoiceNo").value || "").trim() || nextInvoiceNo();
  const duplicate = db.sales.some((s) => String(s.invoiceNo).toLowerCase() === invoiceNo.toLowerCase());
  if (duplicate) {
    toast("Invoice No. already used. Change it and try again.");
    return;
  }

  const saleId = uid("sale");
  const sale = {
    id: saleId,
    invoiceNo,
    createdAt: nowIso(),
    customer: {
      name: ($("#invoiceCustomerName").value || "").trim() || "Walk-in",
      phone: ($("#invoiceCustomerPhone").value || "").trim(),
    },
    paymentMethod: $("#paymentMethod").value || "Cash",
    remarks: ($("#invoiceRemarks").value || "").trim(),
    customerIdNumber: ($("#bearingAmount").value || "").trim(),
    paidAmount: ($("#sumLkrAmount").value || "").trim() ? Math.max(0, safeNumber($("#sumLkrAmount").value, total)) : total,
    sumLkrAmount: subtotal,
    items: items.map((v) => ({
      vehicleId: v.id,
      stockNo: v.stockNo,
      vin: v.vin,
      vehicleNumber: v.vehicleNumber,
      make: v.make,
      model: v.model,
      year: v.year,
      color: v.color,
      gearSystem: v.gearSystem ?? "",
      sellPrice: safeNumber(v.sellPrice, 0),
    })),
    subtotal,
    discount,
    total,
  };

  // mark vehicles sold
  for (const it of sale.items) {
    const v = getVehicleById(it.vehicleId);
    if (!v) continue;
    v.status = "sold";
    v.soldAt = sale.createdAt;
    v.saleId = saleId;
    v.updatedAt = nowIso();
  }

  // auto ledger income entry
  db.ledger.push({
    id: uid("led"),
    createdAt: sale.createdAt,
    date: todayISODate(),
    type: "income",
    category: "Vehicle Sale",
    amount: total,
    details: `Invoice ${invoiceNo} · ${sale.customer.name}`,
    source: { kind: "sale", saleId },
  });

  db.sales.unshift(sale);
  db.cart.items = [];
  db.cart.discount = 0;
  persist();
  sendImmediateInvoiceMessage(sale);
  renderAll();
  toast("Sale completed.");
  setActiveTab("reports");
  return saleId;
}

function renderLedger() {
  const tbody = $("#ledgerTable tbody");
  tbody.innerHTML = "";

  const q = $("#ledgerSearch").value.trim().toLowerCase();
  const typeFilter = $("#ledgerFilterType").value;
  const list = db.ledger
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .filter((e) => (typeFilter === "all" ? true : e.type === typeFilter))
    .filter((e) => {
      if (!q) return true;
      const hay = `${e.category ?? ""} ${e.details ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  for (const entry of list) {
    const tr = document.createElement("tr");
    const typePill =
      entry.type === "income"
        ? `<span class="pill pill--ok">INCOME</span>`
        : `<span class="pill pill--warn">EXPENSE</span>`;

    const dateStr = entry.date || (entry.createdAt ? entry.createdAt.slice(0, 10) : "");
    tr.innerHTML = `
      <td>${escapeHtml(dateStr)}</td>
      <td>${typePill}</td>
      <td><strong>${escapeHtml(entry.category || "")}</strong></td>
      <td>${escapeHtml(entry.details || "")}</td>
      <td class="num"><strong>${formatMoney(entry.amount)}</strong></td>
      <td class="actions"></td>
    `;

    const actions = tr.querySelector(".actions");
    const isAutoSale = entry.source?.kind === "sale";
    const btnDel = mkBtn(isAutoSale ? "Auto" : "Delete", isAutoSale ? "btn btn--ghost" : "btn btn--danger");
    const canDelete = isAdmin() && !isAutoSale;
    btnDel.disabled = !canDelete;
    btnDel.title = isAutoSale ? "Auto-created from sale" : (isAdmin() ? "Delete entry" : "Admin only");
    btnDel.addEventListener("click", () => {
      if (btnDel.disabled) return;
      requirePerm("delete ledger entry", PERMS.LEDGER_DELETE);
      if (!confirm("Delete ledger entry?")) return;
      db.ledger = db.ledger.filter((x) => x.id !== entry.id);
      persist();
      renderAll();
      toast("Ledger entry deleted.");
    });
    actions.append(btnDel);
    tbody.appendChild(tr);
  }

  $("#ledgerSummary").textContent = `${list.length} entr${list.length === 1 ? "y" : "ies"}`;
}

function addLedgerEntryFromForm(e) {
  e.preventDefault();
  requirePerm("add ledger entry", PERMS.LEDGER_ADD);
  const entry = {
    id: uid("led"),
    createdAt: nowIso(),
    date: $("#ledgerDate").value || todayISODate(),
    type: $("#ledgerType").value,
    category: ($("#ledgerCategory").value || "").trim(),
    amount: safeNumber($("#ledgerAmount").value, 0),
    details: ($("#ledgerDetails").value || "").trim(),
    source: { kind: "manual" },
  };

  if (!entry.category || entry.amount <= 0) {
    toast("Please enter Category and Amount.");
    return;
  }

  db.ledger.unshift(entry);
  persist();
  $("#ledgerForm").reset();
  $("#ledgerDate").value = todayISODate();
  renderAll();
  toast("Ledger entry added.");
  closeLedgerEntryDialog();
}

function dateInRange(iso, from, to) {
  const d = (iso || "").slice(0, 10);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

function reportFilteredSales() {
  const from = $("#reportFrom").value || "";
  const to = $("#reportTo").value || "";
  return db.sales.filter((s) => dateInRange(s.createdAt, from, to));
}

function renderReports() {
  const list = reportFilteredSales();
  const gross = list.reduce((sum, s) => sum + safeNumber(s.subtotal, 0), 0);
  const discount = list.reduce((sum, s) => sum + safeNumber(s.discount, 0), 0);
  const net = list.reduce((sum, s) => sum + safeNumber(s.total, 0), 0);

  $("#kpiSalesCount").textContent = String(list.length);
  $("#kpiGross").textContent = formatMoney(gross);
  $("#kpiDiscount").textContent = formatMoney(discount);
  $("#kpiNet").textContent = formatMoney(net);

  const tbody = $("#salesTable tbody");
  tbody.innerHTML = "";

  for (const s of list) {
    const tr = document.createElement("tr");
    const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString() : "";
    const paidAmount = Math.max(0, safeNumber(s.paidAmount, s.total ?? 0));
    const balanceAmount = Math.max(0, safeNumber(s.total, 0) - paidAmount);
    const paymentCellHtml =
      balanceAmount > 0
        ? `${escapeHtml(s.paymentMethod || "")}<div style="margin-top:6px;"><span class="pill pill--warn">PARTIAL PAYMENT</span></div><div class="muted" style="margin-top:6px;">Balance: ${formatMoney(balanceAmount)}</div>`
        : `${escapeHtml(s.paymentMethod || "")}<div class="muted" style="margin-top:6px;">Full Payments</div>`;
    tr.innerHTML = `
      <td>${escapeHtml(dateStr)}</td>
      <td><span class="pill">${escapeHtml(s.invoiceNo)}</span></td>
      <td>${escapeHtml(s.customer?.name || "Walk-in")}</td>
      <td>${paymentCellHtml}</td>
      <td>${escapeHtml(String(s.items?.length || 0))}</td>
      <td class="num"><strong>${formatMoney(s.total)}</strong></td>
      <td class="actions"></td>
    `;

    const actions = tr.querySelector(".actions");
    const btnView = mkBtn("View", "btn btn--ghost");
    btnView.addEventListener("click", () => viewSale(s.id));

    const btnDownload = mkBtn("Download", "btn btn--ghost");
    btnDownload.addEventListener("click", () => downloadInvoiceForSale(s.id));

    const btnVoid = mkBtn("Void", "btn btn--danger");
    btnVoid.disabled = !isAdmin();
    btnVoid.title = isAdmin() ? "Void sale" : "Admin only";
    btnVoid.addEventListener("click", () => voidSale(s.id));

    actions.append(btnView, btnDownload, btnVoid);
    tbody.appendChild(tr);
  }

  $("#salesSummary").textContent = `${list.length} sale${list.length === 1 ? "" : "s"}`;
}

function viewSale(saleId) {
  const s = db.sales.find((x) => x.id === saleId);
  if (!s) return;

  setActiveTab("billing");
  // ensure company info/logo is shown on invoice preview
  renderInvoiceBranding();
  $("#invoiceNo").value = s.invoiceNo;
  $("#invoiceCustomerName").value = s.customer?.name || "";
  $("#invoiceCustomerPhone").value = s.customer?.phone || "";
  const pick = document.querySelector("#invoiceCustomerPick");
  if (pick) {
    const match = (db.customers || []).find(
      (c) =>
        String(c.name || "").trim().toLowerCase() === String(s.customer?.name || "").trim().toLowerCase() &&
        String(c.phone || "").trim() === String(s.customer?.phone || "").trim()
    );
    pick.value = match?.id || "";
  }
  $("#paymentMethod").value = s.paymentMethod || "Cash";
  $("#invoiceRemarks").value = s.remarks || "";
  $("#bearingAmount").value = s.customerIdNumber ?? (s.bearingAmount != null ? String(s.bearingAmount) : "");
  $("#sumLkrAmount").value = s.paidAmount ?? s.total ?? "";

  // show invoice preview using sale snapshot (without changing cart)
  $("#invMetaLine").textContent = new Date(s.createdAt).toLocaleString();
  $("#invNo").textContent = s.invoiceNo;
  $("#invDate").textContent = new Date(s.createdAt).toLocaleString();
  $("#invCustomer").textContent = s.customer?.name || "Walk-in";
  $("#invPhone").textContent = s.customer?.phone || "—";
  $("#invPayment").textContent = s.paymentMethod || "Cash";
  const invPaymentsSummaryEl = document.querySelector("#invPaymentsSummary");
  if (invPaymentsSummaryEl) {
    const paidAmount = Math.max(0, safeNumber(s.paidAmount, s.total ?? 0));
    const remaining = Math.max(0, safeNumber(s.total, 0) - paidAmount);
    if (remaining <= 0) {
      invPaymentsSummaryEl.textContent = "Full Payments";
    } else {
      invPaymentsSummaryEl.textContent = `${s.paymentMethod || "Cash"} Paid: ${formatMoney(paidAmount)} | Balance: ${formatMoney(remaining)}`;
    }
  }

  const tb = $("#invoiceItemsTable tbody");
  tb.innerHTML = "";
  const saleOf = (s.items || [])
    .map((it) => `${it.year ? `${it.year} ` : ""}${it.make} ${it.model}`.trim())
    .join(", ") || "—";
  const regNo = (s.items || []).map((it) => it.vehicleNumber).filter(Boolean).join(", ") || "—";
  for (const it of s.items || []) {
    const tr = document.createElement("tr");
    const label = `${it.year ? `${it.year} ` : ""}${it.make} ${it.model}`.trim();
    const gear = String(it.gearSystem || getVehicleById(it.vehicleId)?.gearSystem || "").trim();
    tr.innerHTML = `
      <td>${escapeHtml(it.stockNo)}</td>
      <td>
        ${escapeHtml(label)}
        ${it.vin ? `<div class="muted" style="margin-top:4px;">VIN: ${escapeHtml(it.vin)}</div>` : ""}
        ${it.color ? `<div class="muted" style="margin-top:${it.vin ? "2px" : "4px"};">Color: ${escapeHtml(it.color)}</div>` : ""}
        ${gear ? `<div class="muted" style="margin-top:2px;">Gear: ${escapeHtml(gear)}</div>` : ""}
      </td>
      <td class="num">${formatMoney(it.sellPrice)}</td>
    `;
    tb.appendChild(tr);
  }
  const invSubtotalEl = document.querySelector("#invSubtotal");
  const invDiscountEl = document.querySelector("#invDiscount");
  const invTotalEl = document.querySelector("#invTotal");
  const invBearingEl = document.querySelector("#invBearingAmount");
  const invSumLkrEl = document.querySelector("#invSumLkrAmount");
  if (invSubtotalEl) invSubtotalEl.textContent = formatMoney(s.subtotal);
  if (invDiscountEl) invDiscountEl.textContent = formatMoney(s.discount);
  if (invTotalEl) invTotalEl.textContent = formatMoney(s.total);
  if (invBearingEl) invBearingEl.textContent = s.customerIdNumber || (s.bearingAmount != null ? String(s.bearingAmount) : "—");
  if (invSumLkrEl) invSumLkrEl.textContent = formatMoney(s.subtotal ?? s.sumLkrAmount ?? s.total ?? 0);
  $("#invSaleOf").textContent = saleOf;
  $("#invRegNo").textContent = regNo;
  $("#invAmountWords").textContent = `${numberToWords(s.subtotal ?? s.sumLkrAmount ?? s.total ?? 0)} LKR Only`;
  $("#invDocOriginalCr").textContent = "As per sale";
  $("#invDocNoObj").textContent = "As per sale";
  $("#invDocDeletion").textContent = "As per sale";
  $("#invDocRevenue").textContent = "As per sale";
  $("#invDocOthers").textContent = s.remarks || "—";
  $("#invFooter").textContent = s.remarks || "Thank you.";
  const year = new Date().getFullYear();
  const companyName = db.meta.companyName || "E-Inventory";
  $("#invCopyright").textContent = `© ${year} ${companyName}. All rights reserved.`;

  toast("Loaded sale into invoice preview.");
}

function downloadInvoiceForSale(saleId) {
  requirePerm("billing print", PERMS.BILLING_PRINT);

  const s = db.sales.find((x) => x.id === saleId);
  if (!s) return;

  // Load invoice preview in the current app first (no DB changes).
  viewSale(saleId);

  const invPreview = document.querySelector("#invoicePreview");
  if (!invPreview) {
    toast("Invoice preview not found.");
    return;
  }

  const w = window.open("", "_blank");
  if (!w) {
    toast("Popup blocked. Allow popups to download invoice.");
    return;
  }

  // Clone invoicePreview HTML into the new window.
  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice ${escapeHtml(s.invoiceNo || "")}</title>
        <link rel="stylesheet" href="./styles.css" />
      </head>
      <body>
        ${invPreview.outerHTML}
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  w.document.close();
}

function voidSale(saleId) {
  requirePerm("void sale", PERMS.REPORTS_VOID);
  const s = db.sales.find((x) => x.id === saleId);
  if (!s) return;
  if (!confirm(`Void sale ${s.invoiceNo}? This will mark vehicles as AVAILABLE and remove the auto ledger entry.`)) return;

  // revert vehicles
  for (const it of s.items || []) {
    const v = getVehicleById(it.vehicleId);
    if (!v) continue;
    if (v.saleId !== saleId) continue;
    v.status = "available";
    v.soldAt = null;
    v.saleId = null;
    v.updatedAt = nowIso();
  }

  // remove auto ledger entries for this sale
  db.ledger = db.ledger.filter((e) => !(e.source?.kind === "sale" && e.source?.saleId === saleId));

  db.sales = db.sales.filter((x) => x.id !== saleId);
  persist();
  renderAll();
  toast("Sale voided.");
}

function exportAllData() {
  const payload = JSON.stringify(db, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vehicle-pos-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported JSON.");
}

async function importAllData(file) {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON");
    if (!Array.isArray(parsed.vehicles) || !Array.isArray(parsed.sales) || !Array.isArray(parsed.ledger)) {
      throw new Error("Missing required arrays");
    }
    db = {
      ...createEmptyDb(),
      ...parsed,
      meta: { ...(parsed.meta ?? {}), version: 1, updatedAt: nowIso() },
    };
    persist();
    renderAll();
    toast("Imported JSON.");
  } catch (err) {
    toast(`Import failed: ${err?.message || "Invalid file"}`);
  }
}

function exportSalesCsv() {
  requirePerm("sales reports export", PERMS.REPORTS_EXPORT);
  const list = reportFilteredSales();
  const rows = [
    ["Date", "InvoiceNo", "Customer", "Phone", "Payment", "Items", "Subtotal", "Discount", "Total"],
    ...list.map((s) => [
      new Date(s.createdAt).toISOString(),
      s.invoiceNo,
      s.customer?.name || "",
      s.customer?.phone || "",
      s.paymentMethod || "",
      String(s.items?.length || 0),
      String(s.subtotal ?? 0),
      String(s.discount ?? 0),
      String(s.total ?? 0),
    ]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported CSV.");
}

function csvCell(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replaceAll("\"", "\"\"")}"`;
  return s;
}

// Documents
let docsDialogVehicleId = null;

function openDocsDialog(vehicleId) {
  const v = getVehicleById(vehicleId);
  if (!v) return;
  docsDialogVehicleId = vehicleId;
  $("#docsVehicleLine").textContent = `${v.stockNo} · ${vehicleLabel(v)}`;
  $("#docsFileInput").value = "";
  const btnSaveDocs = document.querySelector("#btnSaveDocs");
  if (btnSaveDocs) {
    btnSaveDocs.disabled = !can(PERMS.DOCS_MANAGE);
    btnSaveDocs.title = can(PERMS.DOCS_MANAGE) ? "Save documents to storage (and server if enabled)" : "No permission to save documents";
  }
  renderDocsList();
  $("#docsDialog").showModal();
}

function renderDocsList() {
  const v = docsDialogVehicleId ? getVehicleById(docsDialogVehicleId) : null;
  const host = $("#docsList");
  host.innerHTML = "";
  if (!v) return;

  const docs = Array.isArray(v.docs) ? v.docs : [];
  if (!docs.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No documents uploaded.";
    host.appendChild(empty);
    return;
  }

  const tpl = $("#tplDocItem");
  for (const doc of docs.slice().sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""))) {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector(".docItem__name").textContent = doc.name || "file";
    const sub = [];
    if (doc.type) sub.push(doc.type);
    if (doc.size) sub.push(`${Math.round(doc.size / 1024)} KB`);
    if (doc.addedAt) sub.push(new Date(doc.addedAt).toLocaleString());
    node.querySelector(".docItem__sub").textContent = sub.join(" · ");

    const open = node.querySelector(".docItem__open");
    open.href = doc.dataUrl || "#";
    open.style.pointerEvents = doc.dataUrl ? "" : "none";
    open.style.opacity = doc.dataUrl ? "1" : "0.5";

    const download = node.querySelector(".docItem__download");
    if (download) {
      download.href = doc.dataUrl || "#";
      download.download = doc.name || "document";
      download.style.pointerEvents = doc.dataUrl ? "" : "none";
      download.style.opacity = doc.dataUrl ? "1" : "0.5";
    }

    node.querySelector(".docItem__remove").addEventListener("click", () => {
      if (!confirm(`Remove document "${doc.name}"?`)) return;
      v.docs = docs.filter((d) => d.id !== doc.id);
      v.updatedAt = nowIso();
      persist();
      renderDocsList();
      renderInventory();
      toast("Document removed.");
    });

    host.appendChild(node);
  }
}

async function addDocsFromFiles(fileList) {
  const v = docsDialogVehicleId ? getVehicleById(docsDialogVehicleId) : null;
  if (!v) return;
  const files = Array.from(fileList || []);
  if (!files.length) return;

  let addedAny = false;
  for (const f of files) {
    const ok =
      f.type === "application/pdf" ||
      f.name.toLowerCase().endsWith(".pdf") ||
      f.type.startsWith("image/") ||
      f.name.toLowerCase().endsWith(".jpg") ||
      f.name.toLowerCase().endsWith(".jpeg") ||
      f.name.toLowerCase().endsWith(".png");
    if (!ok) {
      toast("Only PDF and JPG documents are allowed.");
      continue;
    }

    try {
      const dataUrl = await readFileAsDataUrl(f);
      v.docs.push({
        id: uid("doc"),
        name: f.name,
        type: f.type,
        size: f.size,
        addedAt: nowIso(),
        dataUrl,
      });
      addedAny = true;
    } catch {
      toast(`Failed to read file: ${f.name}`);
    }
  }

  if (!addedAny) toast("No valid documents were selected.");
  v.updatedAt = nowIso();
  persist();
  renderDocsList();
  renderInventory();
  if (addedAny) toast("Documents added.");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("Failed to read file"));
    fr.readAsDataURL(file);
  });
}

function clearDocs() {
  const v = docsDialogVehicleId ? getVehicleById(docsDialogVehicleId) : null;
  if (!v) return;
  if (!v.docs?.length) return;
  if (!confirm("Clear all documents for this vehicle?")) return;
  v.docs = [];
  v.updatedAt = nowIso();
  persist();
  renderDocsList();
  renderInventory();
  toast("Documents cleared.");
}

async function saveVehicleDocuments() {
  requirePerm("save vehicle documents", PERMS.DOCS_MANAGE);
  const v = docsDialogVehicleId ? getVehicleById(docsDialogVehicleId) : null;
  if (!v) {
    toast("No vehicle selected.");
    return;
  }
  v.docs = Array.isArray(v.docs) ? v.docs : [];
  v.updatedAt = nowIso();
  persist();
  if (useRemoteDb) {
    const r = await flushDbRemoteNow();
    if (r.ok) toast("Documents saved to server.");
    else toast("Saved locally; could not sync to server.");
  } else {
    toast("Documents saved.");
  }
  renderInventory();
  const dlg = document.querySelector("#docsDialog");
  if (dlg?.open) dlg.close();
}

function initEvents() {
  const btnMenuLogin = document.querySelector("#btnMenuLogin");
  if (btnMenuLogin) {
    btnMenuLogin.addEventListener("click", () => {
      const mm = document.querySelector("#mainMenu");
      if (mm) mm.open = false;
      openLogin();
    });
  }

  const btnMenuLogout = document.querySelector("#btnMenuLogout");
  if (btnMenuLogout) {
    btnMenuLogout.addEventListener("click", () => {
      const mm = document.querySelector("#mainMenu");
      if (mm) mm.open = false;
      logout();
    });
  }

  // login
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const ok = await login($("#loginUsername").value, $("#loginPassword").value);
    if (!ok) {
      $("#loginError").textContent = "Invalid username or password.";
      return;
    }
  });
  const btnTouch = document.querySelector("#btnLoginTouchId");
  if (btnTouch) {
    btnTouch.addEventListener("click", () => {
      toast("Touch ID / Windows Hello isn’t available in the browser — use Log In.");
    });
  }
  $("#btnLogout").addEventListener("click", logout);

  $("#vehicleForm").addEventListener("submit", upsertVehicleFromForm);
  $("#btnClearVehicleForm").addEventListener("click", resetVehicleForm);
  $("#btnDeleteVehicle").addEventListener("click", deleteVehicleFromForm);
  document.querySelector("#btnAddNewVehicle")?.addEventListener("click", openVehicleFormDialogForNew);
  document.querySelector("#btnCloseVehicleFormDialog")?.addEventListener("click", () => {
    document.querySelector("#vehicleFormDialog")?.close();
  });
  $("#inventorySearch").addEventListener("input", renderInventory);
  $("#inventoryFilterStatus").addEventListener("change", renderInventory);
  document.querySelector("#homeVehicleSearch")?.addEventListener("input", () => {
    // Requirement: do not show search results in the dashboard table.
    const tbody = document.querySelector("#homeVehicleSearchTable tbody");
    const summary = document.querySelector("#homeVehicleSearchSummary");
    if (tbody) tbody.innerHTML = "";
    if (summary) summary.textContent = "Click Search to open results window.";
  });
  document.querySelector("#homeVehicleSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      openHomeVehicleSearchResultsWindow();
    }
  });
  document.querySelector("#btnHomeVehicleSearch")?.addEventListener("click", openHomeVehicleSearchResultsWindow);
  document.querySelector("#btnGoInventory")?.addEventListener("click", () => openHomeQuickTab("inventory"));
  document.querySelector("#btnHomeBilling")?.addEventListener("click", () => openHomeQuickTab("billing"));
  document.querySelector("#btnHomePurchase")?.addEventListener("click", () => openHomeQuickTab("purchase"));
  document.querySelector("#btnHomeSupplier")?.addEventListener("click", () => openHomeQuickTab("suppliers"));
  document.querySelector("#btnHomeCustomer")?.addEventListener("click", () => openHomeQuickTab("customer"));
  document.querySelector("#soldVehicleSearch")?.addEventListener("input", renderSoldVehicleReports);
  $("#vehicleCondition").addEventListener("change", updateLeaseSectionVisibility);
  const btnAll = document.querySelector("#btnShowAllInv");
  if (btnAll) {
    btnAll.addEventListener("click", () => {
      $("#inventoryFilterStatus").value = "all";
      renderInventory();
    });
  }

  $("#vehicleImageInput").addEventListener("change", async () => {
    const f = $("#vehicleImageInput").files?.[0];
    if (!f) return;
    try {
      pendingVehicleImageDataUrl = await readImageAsDataUrl(f);
      setVehicleImagePreview(pendingVehicleImageDataUrl);
      toast("Vehicle image selected.");
    } catch {
      toast("Invalid image file.");
    }
  });
  $("#btnClearVehicleImage").addEventListener("click", () => {
    pendingVehicleImageDataUrl = "";
    const id = $("#vehicleId").value.trim();
    if (id) {
      const v = getVehicleById(id);
      if (v) {
        v.imageDataUrl = "";
        v.updatedAt = nowIso();
        persist();
        renderInventory();
      }
    }
    clearVehicleImagePreview();
    toast("Vehicle image removed.");
  });

  $("#cartDiscount").addEventListener("input", () => {
    db.cart.discount = Math.max(0, safeNumber($("#cartDiscount").value, 0));
    persist();
    renderCart();
  });
  $("#btnClearCart").addEventListener("click", clearCart);
  $("#btnCompleteSale").addEventListener("click", completeSale);
  $("#btnPrintInvoice").addEventListener("click", () => {
    requirePerm("billing print", PERMS.BILLING_PRINT);
    const saleId = completeSale();
    if (!saleId) return;
    setActiveTab("billing");
    viewSale(saleId);
    window.print();
  });
  ["#invoiceCustomerName", "#invoiceCustomerPhone", "#paymentMethod", "#invoiceNo", "#invoiceRemarks", "#bearingAmount", "#sumLkrAmount"].forEach((sel) => {
    $(sel).addEventListener("input", renderInvoicePreview);
    $(sel).addEventListener("change", renderInvoicePreview);
  });
  document.querySelector("#invoiceSentAuto")?.addEventListener("change", () => {
    db.meta.invoiceSentAuto = !!document.querySelector("#invoiceSentAuto")?.checked;
    persist();
  });

  const invPick = document.querySelector("#invoiceCustomerPick");
  if (invPick) {
    invPick.addEventListener("change", () => {
      const id = invPick.value?.trim() || "";
      if (!id) {
        renderInvoicePreview();
        return;
      }
      const c = (db.customers || []).find((x) => x.id === id);
      if (!c) return;
      const nameEl = document.querySelector("#invoiceCustomerName");
      const phoneEl = document.querySelector("#invoiceCustomerPhone");
      if (nameEl) nameEl.value = c.name || "";
      if (phoneEl) phoneEl.value = c.phone || "";
      renderInvoicePreview();
    });
  }
  document.querySelector("#invoiceCustomerName")?.addEventListener("input", () => {
    const p = document.querySelector("#invoiceCustomerPick");
    if (p) p.value = "";
  });
  document.querySelector("#invoiceCustomerPhone")?.addEventListener("input", () => {
    const p = document.querySelector("#invoiceCustomerPick");
    if (p) p.value = "";
  });

  const quoteCustomerPick = document.querySelector("#quotationCustomerPick");
  if (quoteCustomerPick) {
    quoteCustomerPick.addEventListener("change", () => {
      const id = quoteCustomerPick.value?.trim() || "";
      if (!id) return renderQuotationPreview();
      const c = (db.customers || []).find((x) => x.id === id);
      if (!c) return;
      const nameEl = document.querySelector("#quotationCustomerName");
      const phoneEl = document.querySelector("#quotationCustomerPhone");
      if (nameEl) nameEl.value = c.name || "";
      if (phoneEl) phoneEl.value = c.phone || "";
      renderQuotationPreview();
    });
  }
  document.querySelector("#quotationCustomerName")?.addEventListener("input", () => {
    const p = document.querySelector("#quotationCustomerPick");
    if (p) p.value = "";
    renderQuotationPreview();
  });
  document.querySelector("#quotationCustomerPhone")?.addEventListener("input", renderQuotationPreview);
  document.querySelector("#quotationDate")?.addEventListener("change", renderQuotationPreview);
  document.querySelector("#quotationValidUntil")?.addEventListener("change", renderQuotationPreview);
  document.querySelector("#quotationRemarks")?.addEventListener("input", renderQuotationPreview);
  document.querySelector("#quotationPrice")?.addEventListener("input", renderQuotationPreview);
  document.querySelector("#quotationVehiclePick")?.addEventListener("change", () => {
    const v = getVehicleById(document.querySelector("#quotationVehiclePick")?.value || "");
    const priceEl = document.querySelector("#quotationPrice");
    if (v && priceEl && !String(priceEl.value || "").trim()) {
      priceEl.value = String(safeNumber(v.sellPrice, 0));
    }
    renderQuotationPreview();
  });
  document.querySelector("#btnSaveQuotation")?.addEventListener("click", saveQuotation);
  document.querySelector("#btnSendQuotationWhatsapp")?.addEventListener("click", sendQuotationWhatsapp);
  document.querySelector("#btnPrintQuotation")?.addEventListener("click", printQuotation);

  // invoice logo + company name
  $("#invoiceLogoInput").addEventListener("change", async () => {
    requirePerm("change logo", PERMS.BRANDING_EDIT);
    const f = $("#invoiceLogoInput").files?.[0];
    $("#invoiceLogoInput").value = "";
    if (!f) return;
    try {
      const dataUrl = await readImageAsDataUrl(f);
      db.meta.invoiceLogoDataUrl = dataUrl;
      persist();
      renderInvoiceBranding();
      toast("Logo updated.");
    } catch {
      toast("Invalid logo image.");
    }
  });
  $("#btnClearInvoiceLogo").addEventListener("click", () => {
    requirePerm("change logo", PERMS.BRANDING_EDIT);
    db.meta.invoiceLogoDataUrl = "";
    persist();
    renderInvoiceBranding();
    toast("Logo removed.");
  });
  $("#companyName").addEventListener("input", () => {
    requirePerm("change company name", PERMS.BRANDING_EDIT);
    // Don't trim on every keystroke; otherwise a space you just typed
    // between words becomes "trailing" and gets removed.
    db.meta.companyName = $("#companyName").value || "";
    persist();
    renderInvoiceBranding();
  });
  $("#companyAddress").addEventListener("input", () => {
    requirePerm("change company info", PERMS.BRANDING_EDIT);
    db.meta.companyAddress = $("#companyAddress").value || "";
    persist();
    renderInvoiceBranding();
  });
  $("#companyPhone").addEventListener("input", () => {
    requirePerm("change company info", PERMS.BRANDING_EDIT);
    db.meta.companyPhone = $("#companyPhone").value || "";
    persist();
    renderInvoiceBranding();
  });
  $("#companyEmail").addEventListener("input", () => {
    requirePerm("change company info", PERMS.BRANDING_EDIT);
    db.meta.companyEmail = $("#companyEmail").value || "";
    persist();
    renderInvoiceBranding();
  });
  $("#companyWebsite").addEventListener("input", () => {
    requirePerm("change company info", PERMS.BRANDING_EDIT);
    db.meta.companyWebsite = $("#companyWebsite").value || "";
    persist();
    renderInvoiceBranding();
  });

  ensureLedgerEntryDialogMount();
  $("#ledgerForm").addEventListener("submit", addLedgerEntryFromForm);
  $("#ledgerDate").value = todayISODate();
  $("#ledgerSearch").addEventListener("input", renderLedger);
  $("#ledgerFilterType").addEventListener("change", renderLedger);
  document.querySelector("#btnAddNewLedgerEntry")?.addEventListener("click", openLedgerEntryDialogForNew);
  document.querySelector("#btnCloseLedgerEntryDialog")?.addEventListener("click", closeLedgerEntryDialog);

  $("#btnApplyReportFilter").addEventListener("click", renderReports);
  $("#btnClearReportFilter").addEventListener("click", () => {
    $("#reportFrom").value = "";
    $("#reportTo").value = "";
    renderReports();
  });
  $("#btnExportSalesCsv").addEventListener("click", exportSalesCsv);
  $("#btnExportSalesPdf").addEventListener("click", exportSalesPdf);

  $("#btnExportData").addEventListener("click", exportAllData);
  $("#importFile").addEventListener("change", async () => {
    const f = $("#importFile").files?.[0];
    $("#importFile").value = "";
    if (!f) return;
    if (!confirm("Import will replace current data. Continue?")) return;
    await importAllData(f);
  });

  $("#btnResetAll").addEventListener("click", async () => {
    requirePerm("reset all data", PERMS.DATA_RESET);
    if (!confirm("Reset ALL data? This cannot be undone.")) return;
    db = createEmptyDb();
    persist();
    if (useRemoteDb) {
      const r = await flushDbRemoteNow();
      if (!r.ok) toast("Reset locally; server sync failed.");
    }
    renderAll();
    toast("All data reset.");
    resetVehicleForm();
    closeVehicleFormDialog();
    closePurchaseFormDialog();
    closeLedgerEntryDialog();
    closeCustomerFormDialog();
  });

  const btnSaveInvRpt = document.querySelector("#btnSaveInventoryReportSettings");
  if (btnSaveInvRpt) btnSaveInvRpt.addEventListener("click", saveInventoryReportSettings);

  const btnInvCsv = document.querySelector("#btnDownloadInventoryReportsCsv");
  if (btnInvCsv) btnInvCsv.addEventListener("click", exportInventoryReportsCsv);

  const btnInvPrint = document.querySelector("#btnPrintInventoryReports");
  if (btnInvPrint) btnInvPrint.addEventListener("click", printInventoryReports);

  // docs dialog
  $("#docsFileInput").addEventListener("change", async () => addDocsFromFiles($("#docsFileInput").files));
  $("#btnClearDocs").addEventListener("click", clearDocs);
  const btnSaveDocs = document.querySelector("#btnSaveDocs");
  if (btnSaveDocs) {
    btnSaveDocs.addEventListener("click", async () => {
      try {
        await saveVehicleDocuments();
      } catch {
        /* requirePerm / login flow already showed a toast */
      }
    });
  }
  $("#docsDialog").addEventListener("close", () => {
    docsDialogVehicleId = null;
  });

  // users (admin)
  if (document.querySelector("#userForm")) {
    $("#userForm").addEventListener("submit", createUserFromForm);
    $("#userSearch").addEventListener("input", renderUsers);
  }

  // brokers
  if (document.querySelector("#brokerForm")) {
    $("#brokerForm").addEventListener("submit", upsertBrokerFromForm);
    $("#brokerSearch").addEventListener("input", renderBrokers);
    document.querySelector("#btnAddNewBroker")?.addEventListener("click", openBrokerFormDialogForNew);
    document.querySelector("#btnCloseBrokerFormDialog")?.addEventListener("click", closeBrokerFormDialog);
    $("#btnDeleteBroker").addEventListener("click", () => {
      const id = document.querySelector("#brokerId").value.trim();
      if (id) deleteBroker(id);
    });
  }

  // suppliers (admin)
  if (document.querySelector("#supplierForm")) {
    $("#supplierForm").addEventListener("submit", upsertSupplierFromForm);
    document.querySelector("#supplierSearch")?.addEventListener("input", renderSuppliers);
    document.querySelector("#btnAddNewSupplier")?.addEventListener("click", openSupplierFormDialogForNew);
    document.querySelector("#btnCloseSupplierFormDialog")?.addEventListener("click", closeSupplierFormDialog);
    document.querySelector("#btnDeleteSupplier")?.addEventListener("click", () => {
      const id = document.querySelector("#supplierId")?.value.trim();
      if (id) deleteSupplier(id);
    });
  }

  // customers (garage menu section)
  if (document.querySelector("#customerForm")) {
    $("#customerForm").addEventListener("submit", upsertCustomerFromForm);
    document.querySelector("#customerSearch")?.addEventListener("input", renderCustomers);
    document.querySelector("#btnClearCustomerForm")?.addEventListener("click", clearCustomerForm);
    document.querySelector("#btnAddNewCustomer")?.addEventListener("click", openCustomerFormDialogForNew);
    document.querySelector("#btnCloseCustomerFormDialog")?.addEventListener("click", closeCustomerFormDialog);
    document.querySelector("#btnDeleteCustomer")?.addEventListener("click", () => {
      const id = document.querySelector("#customerId")?.value.trim();
      if (id) deleteCustomer(id);
    });
  }

  // garage jobs
  if (document.querySelector("#garageJobForm")) {
    $("#garageJobForm").addEventListener("submit", upsertGarageJobFromForm);
    document.querySelector("#garageJobSearch")?.addEventListener("input", renderGarageJobs);
    document.querySelector("#btnClearGarageJobForm")?.addEventListener("click", clearGarageJobForm);
    document.querySelector("#btnAddNewGarageJob")?.addEventListener("click", openGarageJobFormDialogForNew);
    document.querySelector("#btnCloseGarageJobFormDialog")?.addEventListener("click", closeGarageJobFormDialog);
    document.querySelector("#btnDeleteGarageJob")?.addEventListener("click", () => {
      const id = document.querySelector("#garageJobId")?.value.trim();
      if (id) deleteGarageJob(id);
      else toast("Select a job to delete (Edit first).");
    });
  }

  // purchase (admin)
  if (document.querySelector("#purchaseForm")) {
    $("#purchaseForm").addEventListener("submit", addPurchaseFromForm);
    document.querySelector("#btnAddNewPurchase")?.addEventListener("click", openPurchaseFormDialogForNew);
    document.querySelector("#btnClosePurchaseFormDialog")?.addEventListener("click", () => {
      document.querySelector("#purchaseFormDialog")?.close();
    });
    document.querySelector("#btnResetPurchaseForm")?.addEventListener("click", resetPurchaseForm);
    $("#purchaseSource").addEventListener("change", () => {
      renderPurchasePartyOptions();
    });
    const pCond = document.querySelector("#purchaseVehicleCondition");
    if (pCond) pCond.addEventListener("change", updatePurchaseLeaseSectionVisibility);
    const pImg = document.querySelector("#purchaseImageInput");
    if (pImg) {
      pImg.addEventListener("change", async () => {
        const f = pImg.files?.[0];
        if (!f) return;
        try {
          pendingPurchaseImageDataUrl = await readImageAsDataUrl(f);
          setPurchaseImagePreview(pendingPurchaseImageDataUrl);
          toast("Image selected.");
        } catch {
          toast("Invalid image file.");
        }
      });
    }
    document.querySelector("#btnClearPurchaseImage")?.addEventListener("click", () => {
      clearPurchaseImagePreview();
      toast("Image removed.");
    });
    const pSearch = document.querySelector("#purchaseSearch");
    if (pSearch) pSearch.addEventListener("input", renderPurchases);
  }
}

function setCopyrightTexts() {
  const companyName = String(db.meta.companyName || "").trim() || "E-Inventory";
  const year = new Date().getFullYear();
  const text = `© ${year} ${companyName}. All rights reserved.`;
  const homeCopyright = document.querySelector("#homeCopyright");
  if (homeCopyright) homeCopyright.textContent = text;
  const loginCopyright = document.querySelector("#loginCopyright");
  if (loginCopyright) loginCopyright.textContent = text;
}

function renderInvoiceBranding() {
  const companyName = String(db.meta.companyName || "").trim() || "E-Inventory";
  $("#appCompanyName").textContent = companyName;
  $("#companyName").value = db.meta.companyName || "";
  $("#companyAddress").value = db.meta.companyAddress || "";
  $("#companyPhone").value = db.meta.companyPhone || "";
  $("#companyEmail").value = db.meta.companyEmail || "";
  $("#companyWebsite").value = db.meta.companyWebsite || "";

  // Build brand details in the order you requested:
  // Address, then Phone, then Email, then Website.
  const addr = String(db.meta.companyAddress || "").trim();
  const phone = String(db.meta.companyPhone || "").trim();
  const email = String(db.meta.companyEmail || "").trim();
  const website = String(db.meta.companyWebsite || "").trim();
  const detailsPieces = [
    addr || "—",
    phone || "—",
    email || "—",
    website || "—",
  ];
  const detailsHtml = detailsPieces.map((x) => `<div>${escapeHtml(x)}</div>`).join("");

  // Top header subtitle (brand details).
  const brandSubtitle = document.querySelector("#appCompanySubtitle");
  if (brandSubtitle) brandSubtitle.innerHTML = detailsHtml;

  // Keep only the company name on the invoice header.
  $("#invTitle").textContent = companyName;
  const lineEl = document.querySelector("#invCompanyLine");
  if (lineEl) lineEl.innerHTML = detailsHtml;

  const logo = $("#invLogo");
  if (db.meta.invoiceLogoDataUrl) {
    logo.src = db.meta.invoiceLogoDataUrl;
    logo.hidden = false;
  } else {
    // Fallback: generate a simple SVG from the header logo mark text.
    // This ensures "brand logo should come to invoice" even without uploading.
    const mark = ($("#appLogoMark")?.textContent || "EI").trim() || "EI";
    const safeMark = String(mark)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160"><rect width="200" height="160" rx="32" fill="#0b57ff"/><rect x="10" y="10" width="180" height="140" rx="26" fill="rgba(255,255,255,0.16)"/><text x="100" y="100" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${safeMark}</text></svg>`;
    logo.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    logo.hidden = false;
  }

  // Also apply the uploaded logo to the app header brand mark.
  // This makes "Upload Logo" change the brand logo in the top bar too.
  const markEl = document.querySelector("#appLogoMark");
  if (markEl) {
    if (db.meta.invoiceLogoDataUrl) {
      markEl.textContent = "";
      markEl.style.background = `url(${db.meta.invoiceLogoDataUrl}) center/cover no-repeat`;
    } else {
      markEl.style.background = "";
      const parts = companyName.split(" ").filter(Boolean);
      const letters = (parts[0]?.[0] || "E") + (parts[1]?.[0] || "I");
      markEl.textContent = letters.toUpperCase();
    }
  }

  setCopyrightTexts();
}

function renderInvoiceSentSettings() {
  const chk = document.querySelector("#invoiceSentAuto");
  const tpl = document.querySelector("#invoiceSentTemplate");
  if (chk) chk.checked = !!db.meta.invoiceSentAuto;
  if (tpl) tpl.value = db.meta.invoiceSentTemplate || INVOICE_SENT_TEMPLATE;
}

function buildInvoiceSentMessage(sale) {
  const template = String(db.meta.invoiceSentTemplate || INVOICE_SENT_TEMPLATE);
  const customerName = String(sale?.customer?.name || "Customer");
  const invoiceNo = String(sale?.invoiceNo || "—");
  const amount = formatMoney(sale?.total ?? 0);
  const companyName = String(db.meta.companyName || "E-Inventory");
  return template
    .replaceAll("{{Customer Name}}", customerName)
    .replaceAll("{{Invoice Number}}", invoiceNo)
    .replaceAll("{{Amount}}", amount)
    .replaceAll("{{Company Name}}", companyName);
}

function sendImmediateInvoiceMessage(sale) {
  if (!db.meta.invoiceSentAuto) return;
  const phoneRaw = String(sale?.customer?.phone || "").trim();
  const phone = phoneRaw.replace(/[^\d+]/g, "");
  if (!phone) {
    toast("Invoice SMS skipped: customer phone missing.");
    return;
  }
  const text = buildInvoiceSentMessage(sale);
  window.open(`sms:${phone}?body=${encodeURIComponent(text)}`, "_blank");
}

function exportSalesPdf() {
  requirePerm("sales reports export", PERMS.REPORTS_EXPORT);
  const list = reportFilteredSales();
  const from = $("#reportFrom").value || "";
  const to = $("#reportTo").value || "";
  const gross = list.reduce((sum, s) => sum + safeNumber(s.subtotal, 0), 0);
  const discount = list.reduce((sum, s) => sum + safeNumber(s.discount, 0), 0);
  const net = list.reduce((sum, s) => sum + safeNumber(s.total, 0), 0);

  const w = window.open("", "_blank");
  if (!w) {
    toast("Popup blocked. Allow popups to export PDF.");
    return;
  }

  const rows = list
    .map((s) => {
      const dateStr = s.createdAt ? new Date(s.createdAt).toLocaleString() : "";
      return `
        <tr>
          <td>${escapeHtml(dateStr)}</td>
          <td>${escapeHtml(s.invoiceNo)}</td>
          <td>${escapeHtml(s.customer?.name || "Walk-in")}</td>
          <td>${escapeHtml(s.paymentMethod || "")}</td>
          <td style="text-align:right">${escapeHtml(String(s.items?.length || 0))}</td>
          <td style="text-align:right">${formatMoney(s.total)}</td>
        </tr>
      `;
    })
    .join("");

  const logoHtml = db.meta.invoiceLogoDataUrl
    ? `<img src="${escapeAttr(db.meta.invoiceLogoDataUrl)}" style="width:54px;height:54px;object-fit:contain;border:1px solid #ddd;border-radius:10px;background:#f6f6f6;" />`
    : "";
  const companyLine = [db.meta.companyAddress, db.meta.companyPhone, db.meta.companyEmail, db.meta.companyWebsite]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" · ");

  w.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Sales Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 18px; color: #111; }
          .top { display:flex; justify-content: space-between; align-items:center; gap: 12px; }
          h1 { margin: 0; font-size: 18px; }
          .muted { color: #555; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border-bottom: 1px solid #e6e6e6; padding: 10px 8px; text-align: left; font-size: 12px; }
          th { color: #444; }
          .kpis { margin-top: 10px; display:flex; gap: 16px; flex-wrap: wrap; }
          .kpi { border: 1px solid #e6e6e6; border-radius: 10px; padding: 10px; min-width: 160px; }
          .kpi strong { display:block; margin-top: 6px; font-size: 14px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="top">
          <div style="display:flex;align-items:center;gap:12px;">
            ${logoHtml}
            <div>
              <h1>${escapeHtml(db.meta.companyName || "E-Inventory")} · Sales Report</h1>
              ${companyLine ? `<div class="muted">${escapeHtml(companyLine)}</div>` : ""}
              <div class="muted">Range: ${escapeHtml(from || "—")} to ${escapeHtml(to || "—")} · Generated: ${escapeHtml(new Date().toLocaleString())}</div>
            </div>
          </div>
        </div>

        <div class="kpis">
          <div class="kpi"><div class="muted">Sales Count</div><strong>${list.length}</strong></div>
          <div class="kpi"><div class="muted">Gross Sales</div><strong>${formatMoney(gross)}</strong></div>
          <div class="kpi"><div class="muted">Discount</div><strong>${formatMoney(discount)}</strong></div>
          <div class="kpi"><div class="muted">Net Sales</div><strong>${formatMoney(net)}</strong></div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Invoice</th>
              <th>Customer</th>
              <th>Payment</th>
              <th style="text-align:right">Items</th>
              <th style="text-align:right">Net</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="6" class="muted">No sales found.</td></tr>`}
          </tbody>
        </table>
        <script>window.onload = () => window.print();</script>
      </body>
    </html>
  `);
  w.document.close();
}

function renderAll() {
  renderVehicleBrokerOptions();
  renderPurchaseVehicleBrokerOptions();
  renderInventory();
  renderSoldVehicleReports();
  renderInventoryReports();
  renderCart();
  renderQuotation();
  renderLedger();
  renderReports();
  renderUsers();
  renderBrokers();
  renderSuppliers();
  renderPurchases();
  renderCustomers();
  renderInvoiceCustomerPick();
  renderInvoiceSentSettings();
  renderGarageJobs();
}

async function bootstrap() {
  await initRemoteStorage();
  if (!useRemoteDb) {
    auth = ensureAuthSeed();
  }

  db.customers = Array.isArray(db.customers) ? db.customers : [];
  db.garageJobs = Array.isArray(db.garageJobs) ? db.garageJobs : [];
  db.quotations = Array.isArray(db.quotations) ? db.quotations : [];
  if (typeof db.meta.invoiceSentAuto !== "boolean") db.meta.invoiceSentAuto = false;
  if (!String(db.meta.invoiceSentTemplate || "").trim()) db.meta.invoiceSentTemplate = INVOICE_SENT_TEMPLATE;
  if (String(db.meta.invoiceSentTemplate || "").trim() === INVOICE_SENT_TEMPLATE_OLD) {
    db.meta.invoiceSentTemplate = INVOICE_SENT_TEMPLATE;
  }

  initNav();
  initEvents();
  resetVehicleForm();
  updateLeaseSectionVisibility();
  const qDate = document.querySelector("#quotationDate");
  if (qDate && !qDate.value) qDate.value = todayISODate();
  const qValid = document.querySelector("#quotationValidUntil");
  if (qValid && !qValid.value) {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    qValid.value = d.toISOString().slice(0, 10);
  }
  const pDate = document.querySelector("#purchaseDate");
  if (pDate && !pDate.value) pDate.value = todayISODate();
  renderPurchasePartyOptions();
  renderPurchaseVehicleBrokerOptions();
  updatePurchaseLeaseSectionVisibility();
  renderAll();
  renderInvoicePreview();
  renderInvoiceBranding();
  setUserUi();

  // Always land on Home (so login isn't on a blank/empty screen)
  setActiveTab("home");

  if (useRemoteDb && !sessionStorage.getItem("pos_mysql_ok")) {
    sessionStorage.setItem("pos_mysql_ok", "1");
    toast("Using MySQL server for data & login.");
  }

  if (!currentUser()) openLogin();
}

bootstrap();
