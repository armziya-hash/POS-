/* Vehicle Sale POS - single file app logic (HTML/CSS/JS only) */

const DB_KEY = "vehicle_pos_db_v1";
const AUTH_KEY = "vehicle_pos_auth_v1";
const SESSION_KEY = "vehicle_pos_session_v1";
/** When "Keep me logged in" is used, session is also stored here (survives browser restart). */
const SESSION_PERSIST_KEY = "vehicle_pos_session_persist_v1";

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

  // Role-based navigation (Home + Main Menu items)
  const allowNav = [
    "home",
    ...(can(PERMS.INVENTORY_VIEW) ? ["inventory"] : []),
    ...(can(PERMS.INVENTORY_VIEW) ? ["inventoryReports"] : []),
    ...(can(PERMS.BILLING_USE) ? ["billing"] : []),
    ...(can(PERMS.LEDGER_VIEW) ? ["ledger"] : []),
    ...(can(PERMS.REPORTS_VIEW) ? ["reports"] : []),
    ...(can(PERMS.USERS_MANAGE) ? ["users"] : []),
    ...(isAdmin() ? ["brokers", "purchase", "suppliers"] : []),
  ];

  document.querySelectorAll("[data-nav]").forEach((el) => {
    const key = el.dataset.nav;
    el.hidden = !allowNav.includes(key);
  });

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
    btnEdit.addEventListener("click", () => fillBrokerForm(b.id));
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
  if (tab === "ledger") return can(PERMS.LEDGER_VIEW);
  if (tab === "reports") return can(PERMS.REPORTS_VIEW);
  if (tab === "users") return can(PERMS.USERS_MANAGE);
  // For now these are admin-only modules
  if (tab === "brokers") return isAdmin();
  if (tab === "suppliers") return isAdmin();
  if (tab === "purchase") return isAdmin();
  return false;
}

function initNav() {
  const go = (tab) => {
    if (!canOpenNav(tab)) return toast(`No permission: ${tab}`);
    setActiveTab(tab);
    const mm = document.querySelector("#mainMenu");
    if (mm?.open) mm.open = false;
  };

  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => go(el.dataset.nav));
  });
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
  const hay = `${v.stockNo} ${v.vin} ${v.make} ${v.model} ${v.year ?? ""} ${v.color} ${v.vehicleNumber ?? ""} ${v.vehicleType ?? ""} ${v.brokerName ?? ""} ${v.countryOfOrigin ?? ""} ${v.fuelType ?? ""} ${v.vehicleCondition ?? ""} ${v.engineCc ?? ""} ${v.mileageKm ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderInventory() {
  const tbody = $("#inventoryTable tbody");
  tbody.innerHTML = "";
  const q = $("#inventorySearch").value.trim();
  const statusFilter = $("#inventoryFilterStatus").value;

  // overall counts (not affected by current filter)
  const totalAll = db.vehicles.length;
  const availableAll = db.vehicles.filter((v) => v.status === "available").length;
  const soldAll = db.vehicles.filter((v) => v.status === "sold").length;
  const totalEl = document.querySelector("#invCountTotal");
  const availBtn = document.querySelector("#btnShowAvailable");
  const soldBtn = document.querySelector("#btnShowSold");
  if (totalEl) totalEl.textContent = `Total: ${totalAll}`;
  if (availBtn) availBtn.textContent = `Available: ${availableAll}`;
  if (soldBtn) soldBtn.textContent = `Sold: ${soldAll}`;

  const list = db.vehicles
    .slice()
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .filter((v) => inventoryMatchesQuery(v, q))
    .filter((v) => (statusFilter === "all" ? true : v.status === statusFilter));

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
      <td>${v.status === "sold" ? `<span class="pill pill--warn">SOLD</span>` : `<span class="pill pill--ok">AVAILABLE</span>`}</td>
      <td class="num"><strong>${formatMoney(v.sellPrice)}</strong><div class="muted" style="margin-top:6px;">Cost: ${formatMoney(v.costPrice)}</div></td>
      <td><span class="pill">${docsCount} file${docsCount === 1 ? "" : "s"}</span></td>
      <td class="actions"></td>
    `;

    const actionsTd = tr.querySelector(".actions");
    actionsTd.classList.add("invActions");

    const btnEdit = mkBtn("Edit", "btn btn--inv");
    btnEdit.addEventListener("click", () => {
      fillVehicleForm(v);
      toast("Loaded vehicle for edit.");
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
  let totalWaste = 0;
  let totalCost = 0;
  let totalSell = 0;

  for (const type of sortedTypes) {
    const onHand = db.vehicles.filter((v) => v.status === "available" && inventoryTypeKey(v.vehicleType) === type);
    const stockOnHandCount = onHand.length;

    const waste = safeNumber(typeSettings[type]?.waste, 0);
    const reorderPoint = safeNumber(typeSettings[type]?.reorderPoint, 0);
    const effectiveStock = stockOnHandCount - waste;
    const reorderNeeded = effectiveStock <= reorderPoint;

    const totalCostPrice = onHand.reduce((s, v) => s + safeNumber(v.costPrice, 0), 0);
    const totalSellingPrice = onHand.reduce((s, v) => s + safeNumber(v.sellPrice, 0), 0);

    totalOnHandCount += stockOnHandCount;
    totalWaste += waste;
    totalCost += totalCostPrice;
    totalSell += totalSellingPrice;

    const wasteInput = `<input type="number" min="0" step="1" data-inv-field="waste" data-inv-type="${escapeAttr(
      type
    )}" value="${waste}" style="width:90px;" />`;
    const reorderInput = `<input type="number" min="0" step="1" data-inv-field="reorderPoint" data-inv-type="${escapeAttr(
      type
    )}" value="${reorderPoint}" style="width:110px;" />`;

    tbody.innerHTML += `
      <tr>
        <td>${escapeHtml(type)}</td>
        <td class="num">${stockOnHandCount}</td>
        <td class="num">${wasteInput}</td>
        <td class="num">${reorderInput}</td>
        <td class="num">${effectiveStock}</td>
        <td>${reorderNeeded ? `<span class="pill pill--warn">REORDER</span>` : `<span class="pill pill--ok">OK</span>`}</td>
        <td class="num">${formatMoney(totalCostPrice)}</td>
        <td class="num">${formatMoney(totalSellingPrice)}</td>
      </tr>
    `;
  }

  $("#kpiInvOnHand").textContent = String(totalOnHandCount);
  $("#kpiInvWaste").textContent = String(totalWaste);
  $("#kpiInvTotalCost").textContent = formatMoney(totalCost);
  $("#kpiInvTotalSell").textContent = formatMoney(totalSell);

  $("#inventoryReportsSummary").textContent = `${sortedTypes.length} type${sortedTypes.length === 1 ? "" : "s"}`;
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
  let totalWaste = 0;
  let totalCost = 0;
  let totalSell = 0;

  for (const type of sortedTypes) {
    const onHand = db.vehicles.filter((v) => v.status === "available" && inventoryTypeKey(v.vehicleType) === type);
    const stockOnHandCount = onHand.length;

    const waste = safeNumber(settings[type]?.waste, 0);
    const reorderPoint = safeNumber(settings[type]?.reorderPoint, 0);
    const effectiveStock = stockOnHandCount - waste;
    const reorderNeeded = effectiveStock <= reorderPoint;

    const totalCostPrice = onHand.reduce((s, v) => s + safeNumber(v.costPrice, 0), 0);
    const totalSellingPrice = onHand.reduce((s, v) => s + safeNumber(v.sellPrice, 0), 0);

    totalOnHandCount += stockOnHandCount;
    totalWaste += waste;
    totalCost += totalCostPrice;
    totalSell += totalSellingPrice;

    rows.push({
      type,
      stockOnHand: stockOnHandCount,
      waste,
      reorderPoint,
      effectiveStock,
      reorderNeeded,
      totalCostPrice,
      totalSellingPrice,
    });
  }

  return {
    rows,
    totals: {
      onHand: totalOnHandCount,
      waste: totalWaste,
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
    ["Vehicle Type", "Stock on Hand", "Waste", "Reorder Point", "Effective Stock", "Reorder Needed", "Total Cost Price", "Total Selling Price"],
    ...report.rows.map((r) => [
      r.type,
      String(r.stockOnHand),
      String(r.waste),
      String(r.reorderPoint),
      String(r.effectiveStock),
      r.reorderNeeded ? "YES" : "NO",
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
      <td style="text-align:right">${r.waste}</td>
      <td style="text-align:right">${r.reorderPoint}</td>
      <td style="text-align:right">${r.effectiveStock}</td>
      <td>${r.reorderNeeded ? "REORDER" : "OK"}</td>
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
            <div class="muted">Total waste (settings)</div>
            <div class="v">${report.totals.waste}</div>
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
              <th style="text-align:right">Waste</th>
              <th style="text-align:right">Reorder point</th>
              <th style="text-align:right">Effective stock</th>
              <th>Reorder</th>
              <th style="text-align:right">Total Cost Price</th>
              <th style="text-align:right">Total Selling Price</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="8" class="muted">No inventory found.</td></tr>`}
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

  const customer = ($("#customerName").value || "").trim() || "Walk-in";
  const phone = ($("#customerPhone").value || "").trim() || "—";
  const pay = $("#paymentMethod").value || "Cash";
  const bearing = ($("#bearingAmount").value || "").trim() ? safeNumber($("#bearingAmount").value, total) : total;
  const sumLkr = ($("#sumLkrAmount").value || "").trim() ? safeNumber($("#sumLkrAmount").value, total) : total;

  $("#invCustomer").textContent = customer;
  $("#invPhone").textContent = phone;
  $("#invPayment").textContent = pay;
  const invPaymentsSummaryEl = document.querySelector("#invPaymentsSummary");
  if (invPaymentsSummaryEl) invPaymentsSummaryEl.textContent = `${pay} (LKR ${formatMoney(sumLkr).replace(/\s+/g, " ")})`;

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
  if (invBearingEl) invBearingEl.textContent = formatMoney(bearing);
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
      name: ($("#customerName").value || "").trim() || "Walk-in",
      phone: ($("#customerPhone").value || "").trim(),
    },
    paymentMethod: $("#paymentMethod").value || "Cash",
    remarks: ($("#invoiceRemarks").value || "").trim(),
    bearingAmount: ($("#bearingAmount").value || "").trim() ? safeNumber($("#bearingAmount").value, total) : total,
    sumLkrAmount: ($("#sumLkrAmount").value || "").trim() ? safeNumber($("#sumLkrAmount").value, total) : total,
    items: items.map((v) => ({
      vehicleId: v.id,
      stockNo: v.stockNo,
      vin: v.vin,
      vehicleNumber: v.vehicleNumber,
      make: v.make,
      model: v.model,
      year: v.year,
      color: v.color,
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
    tr.innerHTML = `
      <td>${escapeHtml(dateStr)}</td>
      <td><span class="pill">${escapeHtml(s.invoiceNo)}</span></td>
      <td>${escapeHtml(s.customer?.name || "Walk-in")}</td>
      <td>${escapeHtml(s.paymentMethod || "")}</td>
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
  $("#customerName").value = s.customer?.name || "";
  $("#customerPhone").value = s.customer?.phone || "";
  $("#paymentMethod").value = s.paymentMethod || "Cash";
  $("#invoiceRemarks").value = s.remarks || "";
  $("#bearingAmount").value = s.bearingAmount ?? s.total ?? "";
  $("#sumLkrAmount").value = s.sumLkrAmount ?? s.total ?? "";

  // show invoice preview using sale snapshot (without changing cart)
  $("#invMetaLine").textContent = new Date(s.createdAt).toLocaleString();
  $("#invNo").textContent = s.invoiceNo;
  $("#invDate").textContent = new Date(s.createdAt).toLocaleString();
  $("#invCustomer").textContent = s.customer?.name || "Walk-in";
  $("#invPhone").textContent = s.customer?.phone || "—";
  $("#invPayment").textContent = s.paymentMethod || "Cash";
  const invPaymentsSummaryEl = document.querySelector("#invPaymentsSummary");
  if (invPaymentsSummaryEl)
    invPaymentsSummaryEl.textContent = `${s.paymentMethod || "Cash"} (LKR ${formatMoney(s.sumLkrAmount ?? s.total ?? 0).replace(/\s+/g, " ")})`;

  const tb = $("#invoiceItemsTable tbody");
  tb.innerHTML = "";
  const saleOf = (s.items || [])
    .map((it) => `${it.year ? `${it.year} ` : ""}${it.make} ${it.model}`.trim())
    .join(", ") || "—";
  const regNo = (s.items || []).map((it) => it.vehicleNumber).filter(Boolean).join(", ") || "—";
  for (const it of s.items || []) {
    const tr = document.createElement("tr");
    const label = `${it.year ? `${it.year} ` : ""}${it.make} ${it.model}`.trim();
    tr.innerHTML = `
      <td>${escapeHtml(it.stockNo)}</td>
      <td>
        ${escapeHtml(label)}
        ${it.vin ? `<div class="muted" style="margin-top:4px;">VIN: ${escapeHtml(it.vin)}</div>` : ""}
        ${it.color ? `<div class="muted" style="margin-top:${it.vin ? "2px" : "4px"};">Color: ${escapeHtml(it.color)}</div>` : ""}
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
  if (invBearingEl) invBearingEl.textContent = formatMoney(s.bearingAmount ?? s.total ?? 0);
  if (invSumLkrEl) invSumLkrEl.textContent = formatMoney(s.sumLkrAmount ?? s.total ?? 0);
  $("#invSaleOf").textContent = saleOf;
  $("#invRegNo").textContent = regNo;
  $("#invAmountWords").textContent = `${numberToWords(s.sumLkrAmount ?? s.total ?? 0)} LKR Only`;
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
  $("#inventorySearch").addEventListener("input", renderInventory);
  $("#inventoryFilterStatus").addEventListener("change", renderInventory);
  $("#vehicleCondition").addEventListener("change", updateLeaseSectionVisibility);
  const btnAvail = document.querySelector("#btnShowAvailable");
  const btnSold = document.querySelector("#btnShowSold");
  const btnAll = document.querySelector("#btnShowAllInv");
  if (btnAvail) {
    btnAvail.addEventListener("click", () => {
      $("#inventoryFilterStatus").value = "available";
      renderInventory();
    });
  }
  if (btnSold) {
    btnSold.addEventListener("click", () => {
      $("#inventoryFilterStatus").value = "sold";
      renderInventory();
    });
  }
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
  ["#customerName", "#customerPhone", "#paymentMethod", "#invoiceNo", "#invoiceRemarks", "#bearingAmount", "#sumLkrAmount"].forEach((sel) => {
    $(sel).addEventListener("input", renderInvoicePreview);
    $(sel).addEventListener("change", renderInvoicePreview);
  });

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

  $("#ledgerForm").addEventListener("submit", addLedgerEntryFromForm);
  $("#ledgerDate").value = todayISODate();
  $("#ledgerSearch").addEventListener("input", renderLedger);
  $("#ledgerFilterType").addEventListener("change", renderLedger);

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
    $("#btnDeleteBroker").addEventListener("click", () => {
      const id = document.querySelector("#brokerId").value.trim();
      if (id) deleteBroker(id);
    });
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
  renderInventory();
  renderInventoryReports();
  renderCart();
  renderLedger();
  renderReports();
  renderUsers();
  renderBrokers();
}

async function bootstrap() {
  await initRemoteStorage();
  if (!useRemoteDb) {
    auth = ensureAuthSeed();
  }

  initNav();
  initEvents();
  resetVehicleForm();
  updateLeaseSectionVisibility();
  renderAll();
  renderInvoicePreview();
  renderInvoiceBranding();
  setUserUi();

  // Home page — Open inventory (button optional if removed from HTML)
  document.querySelector("#btnGoInventory")?.addEventListener("click", () => setActiveTab("inventory"));

  // Always land on Home (so login isn't on a blank/empty screen)
  setActiveTab("home");

  if (useRemoteDb && !sessionStorage.getItem("pos_mysql_ok")) {
    sessionStorage.setItem("pos_mysql_ok", "1");
    toast("Using MySQL server for data & login.");
  }

  if (!currentUser()) openLogin();
}

bootstrap();
