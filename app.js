/* Vehicle Sale POS - single file app logic (HTML/CSS/JS only) */

// DB is stored per-business: `${DB_KEY}:${businessId}`
const DB_KEY = "vehicle_pos_db_v1";
const AUTH_KEY = "vehicle_pos_auth_v1";
const SESSION_KEY = "vehicle_pos_session_v1";
/** When "Keep me logged in" is used, session is also stored here (survives browser restart). */
const SESSION_PERSIST_KEY = "vehicle_pos_session_persist_v1";
const DEFAULT_BUSINESS_ID = "biz_default";

// Supabase (shared sync)
const USE_SUPABASE = false;
const SUPABASE_URL = "https://sunncjbcilvvfntcowue.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1bm5jamJjaWx2dmZudGNvd3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjI1MDUsImV4cCI6MjA4OTkzODUwNX0.Qy5Lt0xJ0OdvsU_Bof8IPdSZfL7LT91n_o4tWrC7iCw";
/** Client instance (named sbClient — UMD bundle also exposes global `supabase`, so we must not redeclare that name). */
const sbClient = USE_SUPABASE && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/** Set on failed `login()` so the form can show Supabase (or other) details. */
let lastLoginError = "";
const INVOICE_SENT_TEMPLATE =
  "Hi {{Customer Name}}, your invoice {{Invoice Number}} for {{Amount}}. Thank you for your business! - {{Company Name}}";
const INVOICE_SENT_TEMPLATE_OLD =
  "Hi {{Customer Name}}, your invoice {{Invoice Number}} for {{Amount}} is now available. Thank you for your business! - {{Company Name}}";

const DEFAULT_QUOTATION_TERMS = `1. This quotation is valid only until the "Valid until" date shown above unless extended in writing by the dealer.
2. Vehicle availability, price, and specifications are subject to confirmation at the time of purchase.
3. A formal sales agreement and full payment (or agreed financing) are required to conclude the sale.
4. The vehicle is offered as described; the customer is encouraged to inspect and test the vehicle before purchase.
5. Registration, insurance, and statutory fees (if any) are the buyer's responsibility unless stated otherwise in writing.
6. Any deposit paid may be governed by a separate receipt and refund policy as applicable.`;

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

/**
 * Only these permissions appear as checkboxes in Create User / Edit Permissions.
 * Remove lines here to hide options from the UI (RBAC still uses stored values).
 */
const USER_PERMISSION_PICKER_KEYS = [
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
  PERMS.USERS_MANAGE,
  PERMS.DATA_IMPORT_EXPORT,
  PERMS.DATA_RESET,
  PERMS.BRANDING_EDIT,
];

function userPermissionPickerKeys() {
  return USER_PERMISSION_PICKER_KEYS.slice();
}

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
  superadmin: ["*"],
  business_admin: [PERMS.USERS_MANAGE, PERMS.INVENTORY_VIEW, PERMS.INVENTORY_EDIT, PERMS.DOCS_MANAGE, PERMS.BILLING_USE, PERMS.BILLING_SALE, PERMS.BILLING_PRINT, PERMS.LEDGER_VIEW, PERMS.LEDGER_ADD, PERMS.REPORTS_VIEW, PERMS.REPORTS_EXPORT, PERMS.DATA_IMPORT_EXPORT, PERMS.BRANDING_EDIT],
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

async function copyText(text) {
  const t = String(text ?? "");
  if (!t) return false;
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.setAttribute("readonly", "readonly");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.left = "-1000px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return !!ok;
  } catch {
    return false;
  }
}

function $(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function $$ (sel) {
  return Array.from(document.querySelectorAll(sel));
}

function dbKeyForBusiness(businessId) {
  const biz = String(businessId || "").trim() || DEFAULT_BUSINESS_ID;
  return `${DB_KEY}:${biz}`;
}

function loadDb(businessId = DEFAULT_BUSINESS_ID) {
  try {
    const key = dbKeyForBusiness(businessId);
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
    // Backward-compat: migrate legacy single-key DB into default business.
    if (String(businessId) === DEFAULT_BUSINESS_ID) {
      const legacy = localStorage.getItem(DB_KEY);
      if (!legacy) return null;
      const parsed = JSON.parse(legacy);
      localStorage.setItem(key, JSON.stringify(parsed));
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function saveDb(db, businessId = DEFAULT_BUSINESS_ID) {
  localStorage.setItem(dbKeyForBusiness(businessId), JSON.stringify(db));
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
      companyPhone2: "",
      companyEmail: "",
      companyWebsite: "",
      invoiceLogoDataUrl: "",
      invoiceSentAuto: false,
      invoiceSentTemplate: INVOICE_SENT_TEMPLATE,
      // Inventory report settings are stored per vehicle type.
      // Example: waste/reorderPoint values are user-entered (not derived from sales history).
      inventoryReports: { typeSettings: {} },
      /** @type {Record<string, { cashCounted?: number | string; depositNote?: string }>} */
      dailyTillSessions: {},
      /** Default terms for new quotations (editable under Quotation). */
      quotationTerms: DEFAULT_QUOTATION_TERMS,
      initialSetupDone: false,
    },
    vehicles: [],
    brokers: [],
    suppliers: [],
    purchases: [],
    refusedVehicles: [],
    cart: { items: [], discount: 0, extras: [] },
    sales: [],
    ledger: [],
    customers: [],
    garageJobs: [],
    quotations: [],
  };
}

// Start with default business DB; will be swapped on login / business switch.
let db = loadDb(DEFAULT_BUSINESS_ID) ?? createEmptyDb();
let useRemoteDb = false;
let persistTimer = null;

async function supabaseGetSessionUser() {
  if (!sbClient) return null;
  const { data, error } = await sbClient.auth.getUser();
  if (error) return null;
  return data?.user ?? null;
}

async function supabaseLoadMembershipContext() {
  if (!sbClient) return { role: null, businessId: null, businesses: [] };
  // memberships + businesses must exist in Supabase (as per setup SQL)
  const { data, error } = await sbClient
    .from("memberships")
    .select("role,business_id,businesses(id,name)")
    .order("created_at", { ascending: true });
  if (error || !Array.isArray(data)) return { role: null, businessId: null, businesses: [] };

  const businesses = [];
  for (const m of data) {
    if (m?.businesses?.id) businesses.push({ id: m.businesses.id, name: m.businesses.name || m.businesses.id });
  }
  const superadmin = data.find((m) => m.role === "superadmin");
  const admin = data.find((m) => m.role === "admin");
  const staff = data.find((m) => m.role === "staff");
  const role = superadmin ? "superadmin" : admin ? "admin" : staff ? "cashier" : null;
  const businessId = (admin || staff)?.business_id ?? null;
  return { role, businessId, businesses };
}

async function supabaseLoadBusinessData(businessId) {
  if (!sbClient || !businessId) return null;
  const { data, error } = await sbClient
    .from("business_data")
    .select("payload")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    // PostgREST returns 404 when a table/view does not exist or is not exposed.
    const code = String(error?.code || "");
    const msg = String(error?.message || "");
    if ((code === "PGRST205" || /not find/i.test(msg) || /404/i.test(msg)) && !supabaseLoadBusinessData._warned) {
      supabaseLoadBusinessData._warned = true;
      toast('Supabase setup missing: table "business_data" not found. Run the setup SQL in Supabase → SQL Editor.');
    }
    return null;
  }
  return data?.payload ?? null;
}

async function supabaseSaveBusinessData(businessId, payload) {
  if (!sbClient || !businessId) return false;
  const { error } = await sbClient.from("business_data").upsert({ business_id: businessId, payload });
  if (error) {
    const code = String(error?.code || "");
    const msg = String(error?.message || "");
    if ((code === "PGRST205" || /not find/i.test(msg) || /404/i.test(msg)) && !supabaseSaveBusinessData._warned) {
      supabaseSaveBusinessData._warned = true;
      toast('Supabase setup missing: table "business_data" not found. Run the setup SQL in Supabase → SQL Editor.');
    }
    return false;
  }
  return true;
}

function normalizeImportedDb(parsed) {
  if (!parsed || typeof parsed !== "object") return createEmptyDb();
  return {
    ...createEmptyDb(),
    ...parsed,
    meta: { ...createEmptyDb().meta, ...(parsed.meta || {}), version: 1, updatedAt: nowIso() },
  };
}

function getActiveBusinessId() {
  const u = currentUser();
  if (!u) return null;
  if (u.role === "superadmin") return auth.session?.activeBusinessId || DEFAULT_BUSINESS_ID;
  return u.businessId || auth.session?.activeBusinessId || DEFAULT_BUSINESS_ID;
}

function localBusinesses() {
  auth.businesses = Array.isArray(auth.businesses) ? auth.businesses : [];
  if (!auth.businesses.length) {
    auth.businesses = [{ id: DEFAULT_BUSINESS_ID, name: "Default Business", disabled: false, createdAt: nowIso() }];
    auth.updatedAt = nowIso();
    saveAuth(auth);
  }
  return auth.businesses;
}

function ensureBusinessDbInitialized(bizId) {
  const biz = String(bizId || "").trim() || DEFAULT_BUSINESS_ID;
  const existing = loadDb(biz);
  if (existing) return existing;
  const bName = localBusinesses().find((b) => b.id === biz)?.name || "E-Inventory";
  const fresh = createEmptyDb();
  fresh.meta.companyName = String(bName || "").trim() || fresh.meta.companyName;
  saveDb(fresh, biz);
  return fresh;
}

function switchActiveBusinessLocal(bizId) {
  const biz = String(bizId || "").trim() || "";
  if (!biz) return;
  auth.session = auth.session || { user: currentUser(), loggedInAt: nowIso(), activeBusinessId: biz };
  auth.session.activeBusinessId = biz;
  saveSession(auth.session);
  db = ensureBusinessDbInitialized(biz);
  renderAll();
  renderInvoiceBranding();
  setCopyrightTexts();
  setUserUi();
  toast("Business switched.");
}

async function fetchPosApi(path, options = {}) {
  const base = POS_API_BASE.replace(/\/?$/, "");
  const p = path.replace(/^\//, "");
  const url = `${base}/${p}`;
  const headers = { ...(options.headers || {}) };
  if (POS_API_KEY) headers["X-POS-API-Key"] = POS_API_KEY;
  const biz = getActiveBusinessId();
  if (biz) headers["X-POS-Business-Id"] = biz;
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
  if (isSuperAdmin() && !getActiveBusinessId()) {
    auth.users = [];
    auth.updatedAt = nowIso();
    saveAuth(auth);
    return;
  }
  const { ok, body } = await fetchPosApi("users.php", { method: "GET" });
  if (ok && body && body.ok && Array.isArray(body.users)) {
    auth.users = body.users;
    auth.updatedAt = nowIso();
    saveAuth(auth);
  }
}

let businessesCache = [];

async function refreshBusinessesFromServer() {
  if (!useRemoteDb) return;
  const { ok, body } = await fetchPosApi("businesses.php", { method: "GET" });
  if (ok && body && body.ok && Array.isArray(body.businesses)) {
    businessesCache = body.businesses;
  }
}

async function loadBusinessData({ silent = false } = {}) {
  if (!useRemoteDb) return;
  const biz = getActiveBusinessId();
  if (!biz) return;
  const { ok, body } = await fetchPosApi("data.php", { method: "GET" });
  if (!ok || !body || !body.ok) return;
  if (body.data != null) {
    db = normalizeImportedDb(body.data);
    saveDb(db, biz);
    renderAll();
    if (!silent) toast("Business data loaded.");
    return;
  }
  // Initialize empty business snapshot
  db = createEmptyDb();
  persist();
  renderAll();
  if (!silent) toast("Business initialized.");
}

async function initRemoteStorage() {
  if (USE_SUPABASE) {
    useRemoteDb = false;
    return;
  }
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
    // In multi-business mode, data is loaded after login based on businessId.
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
    auth.businesses = Array.isArray(auth.businesses) ? auth.businesses : [{ id: DEFAULT_BUSINESS_ID, name: "Default Business", disabled: false, createdAt: nowIso() }];
    return auth;
  }
  const seeded = {
    businesses: [{ id: DEFAULT_BUSINESS_ID, name: "Default Business", disabled: false, createdAt: nowIso() }],
    users: [
      { id: uid("usr"), username: "superadmin", password: "superadmin123", role: "superadmin", name: "Super Admin", disabled: false, businessId: DEFAULT_BUSINESS_ID },
      { id: uid("usr"), username: "admin", password: "admin123", role: "admin", name: "Admin", disabled: false, businessId: DEFAULT_BUSINESS_ID },
      { id: uid("usr"), username: "cashier", password: "cashier123", role: "cashier", name: "Cashier", disabled: false, businessId: DEFAULT_BUSINESS_ID },
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

function isSuperAdmin() {
  return currentUser()?.role === "superadmin";
}

function isAdmin() {
  const r = currentUser()?.role;
  // "Admin-only" UI (purchase, suppliers, brokers, void sale, etc.) applies to these roles.
  // Note: this is separate from `can(PERMS.*)` — legacy code used role === "admin" only,
  // which incorrectly hid Purchase/Supplier for superadmin and business_admin.
  return r === "admin" || r === "superadmin" || r === "business_admin";
}

function rolePerms(role) {
  return ROLE_PERMS[role] ?? [];
}

function allPermKeys() {
  return Object.values(PERMS);
}

function permLabel(p) {
  const map = {
    [PERMS.INVENTORY_VIEW]: "Inventory: View",
    [PERMS.INVENTORY_EDIT]: "Inventory: Edit",
    [PERMS.INVENTORY_DELETE]: "Inventory: Delete",
    [PERMS.DOCS_MANAGE]: "Docs: Manage",
    [PERMS.BILLING_USE]: "Billing: Use",
    [PERMS.BILLING_SALE]: "Billing: Complete sale",
    [PERMS.BILLING_PRINT]: "Billing: Print",
    [PERMS.LEDGER_VIEW]: "Ledger: View",
    [PERMS.LEDGER_ADD]: "Ledger: Add",
    [PERMS.LEDGER_DELETE]: "Ledger: Delete",
    [PERMS.REPORTS_VIEW]: "Reports: View",
    [PERMS.REPORTS_EXPORT]: "Reports: Export",
    [PERMS.REPORTS_VOID]: "Reports: Void",
    [PERMS.USERS_MANAGE]: "Users: Manage",
    [PERMS.DATA_IMPORT_EXPORT]: "Data: Import/Export",
    [PERMS.DATA_RESET]: "Data: Reset",
    [PERMS.BRANDING_EDIT]: "Branding: Edit",
  };
  return map[p] || p;
}

function renderUserPermsPicker(selectedPerms) {
  const grid = document.querySelector("#userPermsGrid");
  const allCb = document.querySelector("#permAll");
  const summary = document.querySelector("#userPermsSummary");
  if (!grid) return;
  const sel = Array.isArray(selectedPerms) ? selectedPerms : [];
  const isAll = sel.includes("*");
  if (allCb) allCb.checked = isAll;
  grid.innerHTML = "";
  const perms = allPermKeys().slice().sort((a, b) => permLabel(a).localeCompare(permLabel(b)));
  for (const p of perms) {
    const id = `perm_${p.replaceAll(".", "_")}`;
    const wrap = document.createElement("label");
    wrap.className = "row";
    wrap.style.gap = "10px";
    wrap.style.alignItems = "center";
    wrap.style.margin = "0";
    wrap.innerHTML = `
      <input type="checkbox" data-perm="${escapeAttr(p)}" id="${escapeAttr(id)}" />
      <span>${escapeHtml(permLabel(p))}</span>
    `;
    const cb = wrap.querySelector("input");
    if (cb) cb.checked = isAll || sel.includes(p);
    grid.appendChild(wrap);
  }
  const updateDisabled = () => {
    const isAllNow = !!document.querySelector("#permAll")?.checked;
    grid.querySelectorAll("input[type=checkbox][data-perm]").forEach((el) => {
      el.disabled = isAllNow;
    });
    if (summary) {
      summary.textContent = isAllNow ? "All permissions" : "Custom permissions";
    }
  };
  if (allCb) {
    allCb.onchange = () => updateDisabled();
  }
  grid.querySelectorAll("input[type=checkbox][data-perm]").forEach((el) => {
    el.addEventListener("change", () => {
      if (summary) summary.textContent = "Custom permissions";
      if (allCb) allCb.checked = false;
      updateDisabled();
    });
  });
  updateDisabled();
}

function getSelectedPermsFromUserForm() {
  const allCb = document.querySelector("#permAll");
  if (allCb?.checked) return ["*"];
  const picked = Array.from(document.querySelectorAll("#userPermsGrid input[type=checkbox][data-perm]"))
    .filter((el) => el.checked)
    .map((el) => el.dataset.perm)
    .filter(Boolean);
  return picked;
}

function renderEditUserPermsPicker(selectedPerms) {
  const grid = document.querySelector("#editUserPermsGrid");
  const allCb = document.querySelector("#editPermAll");
  const summary = document.querySelector("#editUserPermsSummary");
  if (!grid) return;
  const sel = Array.isArray(selectedPerms) ? selectedPerms : [];
  const isAll = sel.includes("*");
  if (allCb) allCb.checked = isAll;
  grid.innerHTML = "";
  const perms = userPermissionPickerKeys().sort((a, b) => permLabel(a).localeCompare(permLabel(b)));
  for (const p of perms) {
    const id = `edit_perm_${p.replaceAll(".", "_")}`;
    const wrap = document.createElement("label");
    wrap.className = "row";
    wrap.style.gap = "10px";
    wrap.style.alignItems = "center";
    wrap.style.margin = "0";
    wrap.innerHTML = `
      <input type="checkbox" data-perm="${escapeAttr(p)}" id="${escapeAttr(id)}" />
      <span>${escapeHtml(permLabel(p))}</span>
    `;
    const cb = wrap.querySelector("input");
    if (cb) cb.checked = isAll || sel.includes(p);
    grid.appendChild(wrap);
  }
  const updateDisabled = () => {
    const isAllNow = !!document.querySelector("#editPermAll")?.checked;
    grid.querySelectorAll("input[type=checkbox][data-perm]").forEach((el) => {
      el.disabled = isAllNow;
    });
    if (summary) summary.textContent = isAllNow ? "All permissions" : "Custom";
  };
  if (allCb) allCb.onchange = () => updateDisabled();
  grid.querySelectorAll("input[type=checkbox][data-perm]").forEach((el) => {
    el.addEventListener("change", () => {
      if (summary) summary.textContent = "Custom";
      if (allCb) allCb.checked = false;
      updateDisabled();
    });
  });
  updateDisabled();
}

function getSelectedPermsFromEditDialog() {
  const allCb = document.querySelector("#editPermAll");
  if (allCb?.checked) return ["*"];
  const picked = Array.from(document.querySelectorAll("#editUserPermsGrid input[type=checkbox][data-perm]"))
    .filter((el) => el.checked)
    .map((el) => el.dataset.perm)
    .filter(Boolean);
  return picked;
}

function openEditUserPermsDialog(userId) {
  requirePerm("manage users", PERMS.USERS_MANAGE);
  const dlg = document.querySelector("#editUserPermsDialog");
  if (!dlg || typeof dlg.showModal !== "function") return;
  const u = (auth.users || []).find((x) => String(x.id) === String(userId));
  if (!u) return toast("User not found.");
  const isAdminUser = normalizeUsername(u.username) === "admin";
  if (isAdminUser) return toast('Cannot edit permissions for "admin".');

  const who = document.querySelector("#editUserPermsWho");
  if (who) who.textContent = `${u.username} (${u.role || ""})`;
  const idEl = document.querySelector("#editUserPermsUserId");
  if (idEl) idEl.value = u.id;

  const permsArr = Array.isArray(u.permissions) ? u.permissions : rolePerms(u.role);
  renderEditUserPermsPicker(permsArr);
  dlg.showModal();
}

async function saveEditUserPermsFromForm(e) {
  e.preventDefault();
  requirePerm("manage users", PERMS.USERS_MANAGE);
  await migratePasswordsToHash();

  const userId = document.querySelector("#editUserPermsUserId")?.value || "";
  const u = (auth.users || []).find((x) => String(x.id) === String(userId));
  if (!u) return toast("User not found.");
  const isAdminUser = normalizeUsername(u.username) === "admin";
  if (isAdminUser) return toast('Cannot edit permissions for "admin".');

  const prior = Array.isArray(u.permissions) ? u.permissions : rolePerms(u.role);
  const picked = getSelectedPermsFromEditDialog();
  if (!picked.length) return toast("Select at least one permission (or All).");
  u.permissions = picked.includes("*") ? ["*"] : mergePermissionsWithPicker(prior, picked);
  auth.updatedAt = nowIso();
  saveAuth(auth);
  toast("Permissions updated.");
  document.querySelector("#editUserPermsDialog")?.close();
  renderUsers();
}

function can(perm) {
  const u = currentUser();
  if (!u) return false;
  if (u.role === "admin" || u.role === "superadmin") return true;

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
  const bizLine = u.businessId
    ? `<p class="menu__accountMuted">Business: <span class="pill">${escapeHtml(u.businessId)}</span></p>`
    : "";
  const superAdminBizSwitch = isSuperAdmin()
    ? `
      <div style="margin-top:10px;">
        <div class="menu__accountMuted" style="margin-bottom:6px;">Active business</div>
        <select id="activeBusinessPick" class="input" style="min-height:42px;">
          <option value="">— Select business —</option>
          ${(!useRemoteDb ? localBusinesses() : (businessesCache || []))
            .map((b) => `<option value="${escapeAttr(b.id)}">${escapeHtml(b.name || b.id)}</option>`)
            .join("")}
        </select>
        <div class="muted" style="margin-top:6px;font-size:12px;">Select a business to load its data.</div>
      </div>
    `
    : "";
  el.innerHTML = `
    <p class="menu__accountStrong">${name}</p>
    <p class="menu__accountMuted">@${uname} · ${role}</p>
    ${bizLine}
    <p class="menu__accountSession">Signed in: ${started}</p>
    ${superAdminBizSwitch}
  `;

  if (isSuperAdmin()) {
    const pick = document.querySelector("#activeBusinessPick");
    if (pick) {
      pick.value = auth.session?.activeBusinessId || "";
      pick.onchange = async () => {
        const next = pick.value || "";
        if (!next) return;
        if (!useRemoteDb) {
          switchActiveBusinessLocal(next);
          return;
        }
        auth.session.activeBusinessId = next;
        saveSession(auth.session);
        await loadBusinessData();
      };
    }
  }
}

function canAccessGarageCustomer() {
  return can(PERMS.INVENTORY_VIEW) || can(PERMS.BILLING_USE);
}

function canManageGarageCustomerData() {
  return can(PERMS.INVENTORY_EDIT) || can(PERMS.BILLING_USE);
}

function setUserUi() {
  const u = currentUser();
  const pill = document.querySelector("#userPill");
  const btnLogout = document.querySelector("#btnLogout");
  const btnMenuLogin = document.querySelector("#btnMenuLogin");
  const btnMenuLogout = document.querySelector("#btnMenuLogout");

  updateMainMenuAccount();

  if (!u) {
    if (pill) pill.hidden = true;
    if (btnLogout) btnLogout.hidden = true;
    if (btnMenuLogin) btnMenuLogin.hidden = false;
    if (btnMenuLogout) btnMenuLogout.hidden = true;
    document.querySelectorAll("#mainMenu .menu__panel [data-nav]").forEach((navEl) => {
      navEl.hidden = true;
    });
    document.querySelector("#mainMenu .menu__panel")?.classList.add("menu__panel--guest");
    return;
  }
  document.querySelector("#mainMenu .menu__panel")?.classList.remove("menu__panel--guest");
  const nameEl = document.querySelector("#userNameLabel");
  const roleEl = document.querySelector("#userRoleLabel");
  if (nameEl) nameEl.textContent = u.name || u.username;
  if (roleEl) roleEl.textContent = u.role.toUpperCase();
  if (pill) pill.hidden = false;
  // Only show Log out inside the main menu (not on the header).
  if (btnLogout) btnLogout.hidden = true;
  if (btnMenuLogin) btnMenuLogin.hidden = true;
  if (btnMenuLogout) btnMenuLogout.hidden = false;

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
    ...(can(PERMS.REPORTS_VIEW) ? ["reports", "dailyReport", "soldVehicleReports"] : []),
    ...(can(PERMS.INVENTORY_VIEW) ? ["refusedVehicles"] : []),
    ...(canAccessGarageCustomer() ? ["garage", "customer"] : []),
    ...(can(PERMS.BRANDING_EDIT) ? ["companyInfo"] : []),
    ...(can(PERMS.USERS_MANAGE) ? ["users"] : []),
    ...(isSuperAdmin() ? ["businesses"] : []),
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
  lastLoginError = "";
  $("#loginError").textContent = "";
  $("#loginUsername").value = "";
  $("#loginPassword").value = "";
  const pick = document.querySelector("#loginBusinessPick");
  if (pick) {
    const list = !useRemoteDb ? localBusinesses() : (businessesCache || []);
    const cur = pick.value || DEFAULT_BUSINESS_ID;
    pick.innerHTML = "";
    const raw = list.filter((b) => b && !b.disabled);
    const def = raw.find((b) => String(b.id) === DEFAULT_BUSINESS_ID);
    const rest = raw
      .filter((b) => String(b.id) !== DEFAULT_BUSINESS_ID)
      .slice()
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));
    const ordered = def ? [def, ...rest] : rest;
    for (const b of ordered) {
      const opt = document.createElement("option");
      opt.value = b.id || "";
      opt.textContent = String(b.id) === DEFAULT_BUSINESS_ID ? "Default Business" : b.name || b.id;
      pick.appendChild(opt);
    }
    const hasCur = cur && Array.from(pick.options).some((o) => o.value === cur);
    const hasDefault = Array.from(pick.options).some((o) => o.value === DEFAULT_BUSINESS_ID);
    pick.value = hasCur ? cur : hasDefault ? DEFAULT_BUSINESS_ID : pick.options[0]?.value || DEFAULT_BUSINESS_ID;
  }
  setCopyrightTexts();
  d.showModal();
  setTimeout(() => $("#loginUsername").focus(), 0);
}

function closeLogin() {
  const d = $("#loginDialog");
  if (d.open) d.close();
}

function openSetup() {
  const d = document.querySelector("#setupDialog");
  if (!d || typeof d.showModal !== "function") return;
  const err = document.querySelector("#setupError");
  if (err) err.textContent = "";
  const cn = document.querySelector("#setupCompanyName");
  if (cn) cn.value = String(db.meta.companyName || "").trim() || "E-Inventory";
  const su = document.querySelector("#setupSuperadminUser");
  if (su) su.value = String(su.value || "").trim() || "superadmin";
  const p1 = document.querySelector("#setupSuperadminPass");
  const p2 = document.querySelector("#setupSuperadminPass2");
  if (p1) p1.value = "";
  if (p2) p2.value = "";
  setCopyrightTexts();
  d.showModal();
  setTimeout(() => cn?.focus(), 0);
}

function closeSetup() {
  document.querySelector("#setupDialog")?.close();
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
    if (u.role !== "superadmin" && !u.businessId) {
      u.businessId = DEFAULT_BUSINESS_ID;
      changed = true;
    }
  }
  if (changed) {
    auth.updatedAt = nowIso();
    saveAuth(auth);
  }
}

async function runOneTimeSetupFromForm(e) {
  e?.preventDefault?.();
  const err = document.querySelector("#setupError");
  if (err) err.textContent = "";

  const companyName = String(document.querySelector("#setupCompanyName")?.value || "").trim();
  const suNameRaw = String(document.querySelector("#setupSuperadminUser")?.value || "").trim();
  const suName = normalizeUsername(suNameRaw);
  const p1 = String(document.querySelector("#setupSuperadminPass")?.value || "");
  const p2 = String(document.querySelector("#setupSuperadminPass2")?.value || "");

  if (!companyName) {
    if (err) err.textContent = "Enter company name.";
    return;
  }
  if (!suName) {
    if (err) err.textContent = "Enter superadmin username.";
    return;
  }
  if (p1.length < 6) {
    if (err) err.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (p1 !== p2) {
    if (err) err.textContent = "Passwords do not match.";
    return;
  }

  // Update company name
  db.meta.companyName = companyName;
  db.meta.updatedAt = nowIso();
  db.meta.initialSetupDone = true;
  saveDb(db);

  // Ensure auth exists and has a superadmin user
  auth = ensureAuthSeed();
  auth.users = Array.isArray(auth.users) ? auth.users : [];
  let su = auth.users.find((u) => normalizeUsername(u.username) === "superadmin" || u.role === "superadmin");
  if (!su) {
    su = { id: uid("usr"), username: "superadmin", role: "superadmin", name: "Super Admin", disabled: false };
    auth.users.unshift(su);
  }
  su.username = suName;
  su.name = su.name || "Super Admin";
  su.role = "superadmin";
  su.disabled = false;
  su.passwordHash = await hashPassword(su.username, p1);
  delete su.password;
  auth.updatedAt = nowIso();
  saveAuth(auth);

  // Auto-login superadmin after setup
  auth.session = {
    user: {
      id: su.id,
      username: su.username,
      name: su.name || su.username,
      role: "superadmin",
      businessId: DEFAULT_BUSINESS_ID,
      permissions: ["*"],
    },
    loggedInAt: nowIso(),
    activeBusinessId: DEFAULT_BUSINESS_ID,
  };
  saveAuth(auth);
  saveSession(auth.session);

  closeSetup();
  renderAll();
  renderInvoiceBranding();
  setCopyrightTexts();
  setUserUi();
  toast("Setup complete.");
}

async function login(username, password) {
  lastLoginError = "";
  const uname = normalizeUsername(username);
  const pass = String(password);
  const keepLoggedIn = !!document.querySelector("#loginRemember")?.checked;

  if (USE_SUPABASE) {
    if (!sbClient) {
      lastLoginError =
        "Supabase did not load. Use http://localhost (not file://) and ensure vendor/supabase.min.js is present.";
      return false;
    }
    if (!uname.includes("@")) {
      lastLoginError =
        "Use the email address you created in Supabase (Dashboard → Authentication → Users), not a short username like admin.";
      return false;
    }
    const { data, error } = await sbClient.auth.signInWithPassword({ email: uname, password: pass });
    if (error || !data?.user) {
      const msg = String(error?.message || "").toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("wrong password")) {
        lastLoginError =
          "Wrong email or password for this Supabase project. Add the user in Supabase → Authentication → Users (or reset password there).";
      } else if (msg.includes("email not confirmed")) {
        lastLoginError =
          "Confirm your email from the link Supabase sent, or turn off “Confirm email” under Authentication → Providers → Email.";
      } else {
        lastLoginError = error?.message || "Could not sign in. Check Supabase Auth and your network.";
      }
      return false;
    }

    const ctx = await supabaseLoadMembershipContext();
    const role = ctx.role || "admin";
    auth.session = {
      user: {
        id: data.user.id,
        username: data.user.email || uname,
        name: data.user.email || uname,
        role,
        businessId: ctx.businessId,
        permissions: role === "superadmin" || role === "admin" ? ["*"] : ROLE_PERMS.cashier,
      },
      loggedInAt: nowIso(),
      activeBusinessId: "",
    };
    // Super Admin: pick business later. Admin/Staff: auto business.
    if (role !== "superadmin") {
      auth.session.activeBusinessId = ctx.businessId || "";
      const payload = await supabaseLoadBusinessData(auth.session.activeBusinessId);
      if (payload) db = normalizeImportedDb(payload);
      else db = createEmptyDb();
      saveDb(db);
    }
    auth.updatedAt = nowIso();
    saveAuth(auth);
    saveSession(auth.session, keepLoggedIn);
    setUserUi();
    closeLogin();
    toast(`Logged in as ${role}.`);
    renderAll();
    return true;
  }

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
        businessId: u.businessId ?? null,
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
    await refreshBusinessesFromServer();
    if (!isSuperAdmin()) {
      await loadBusinessData();
    }
    return true;
  }

  await migratePasswordsToHash();
  const passHash = await hashPassword(uname, pass);
  const u = auth.users.find((x) => normalizeUsername(x.username) === uname && x.passwordHash === passHash);
  if (!u || u.disabled) return false;
  // Business selection (local mode)
  const pickedBiz = String(document.querySelector("#loginBusinessPick")?.value || "").trim() || DEFAULT_BUSINESS_ID;
  if (u.role !== "superadmin") {
    const uBiz = String(u.businessId || DEFAULT_BUSINESS_ID);
    if (pickedBiz && pickedBiz !== uBiz) {
      lastLoginError = "This user is not assigned to the selected business.";
      return false;
    }
  }
  auth.session = {
    user: {
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      businessId: u.role === "superadmin" ? null : (u.businessId || DEFAULT_BUSINESS_ID),
      permissions: ROLE_PERMS[u.role] ?? u.permissions ?? [],
    },
    loggedInAt: nowIso(),
    activeBusinessId: u.role === "superadmin" ? pickedBiz : (u.businessId || DEFAULT_BUSINESS_ID),
  };
  auth.updatedAt = nowIso();
  saveAuth(auth);
  saveSession(auth.session, keepLoggedIn);
  setUserUi();
  closeLogin();
  toast(`Logged in as ${u.role}.`);
  if (!useRemoteDb) {
    const biz = getActiveBusinessId() || DEFAULT_BUSINESS_ID;
    db = ensureBusinessDbInitialized(biz);
    renderAll();
    renderInvoiceBranding();
  }
  return true;
}

function logout() {
  if (USE_SUPABASE && sbClient) {
    sbClient.auth.signOut();
  }
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

  const activeBiz = getActiveBusinessId();
  if (!activeBiz) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">Select an Active Business from Main Menu → Account.</td></tr>`;
    const summary = document.querySelector("#usersSummary");
    if (summary) summary.textContent = "0 users";
    return;
  }

  const list = (auth.users || [])
    .slice()
    .sort((a, b) => normalizeUsername(a.username).localeCompare(normalizeUsername(b.username)))
    .filter((u) => {
      const ub = String(u.businessId || DEFAULT_BUSINESS_ID);
      // Superadmin sees active business users; business_admin also sees only their business.
      if (isSuperAdmin()) return ub === String(activeBiz);
      if (String(currentUser()?.role) === "business_admin") return ub === String(activeBiz) && u.role !== "superadmin";
      // admin: keep current behavior (all local users), but still default-filter to active business for consistency
      return ub === String(activeBiz);
    })
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

    const btnPerms = mkBtn("Permissions", "btn btn--table btn--table-primary btn--table-compact");
    btnPerms.disabled = isAdminUser;
    btnPerms.title = btnPerms.disabled ? 'Cannot edit permissions for "admin"' : "";
    btnPerms.addEventListener("click", () => openEditUserPermsDialog(u.id));

    const btnToggle = mkBtn(u.disabled ? "Enable" : "Disable", "btn btn--table btn--table-compact");
    btnToggle.disabled = isAdminUser || isSelf;
    btnToggle.title = btnToggle.disabled ? "Cannot disable this user" : "";
    btnToggle.addEventListener("click", () => toggleUserDisabled(u.id));

    const btnReset = mkBtn("Reset PW", "btn btn--table btn--table-primary btn--table-compact");
    btnReset.disabled = isAdminUser && isSelf;
    btnReset.addEventListener("click", () => resetUserPassword(u.id));

    const btnDelete = mkBtn("Delete", "btn btn--table btn--table-danger btn--table-compact");
    btnDelete.disabled = isAdminUser || isSelf;
    btnDelete.title = btnDelete.disabled ? "Cannot delete this user" : "";
    btnDelete.addEventListener("click", () => deleteUser(u.id));

    actions.append(btnPerms, btnToggle, btnReset, btnDelete);
    tbody.appendChild(tr);
  }

  $("#usersSummary").textContent = `${list.length} user${list.length === 1 ? "" : "s"}`;
}

async function createBusinessFromForm(e) {
  e.preventDefault();
  if (!isSuperAdmin()) return toast("Super Admin only.");
  const name = (document.querySelector("#businessName")?.value || "").trim();
  if (!name) return toast("Business name required.");
  if (!useRemoteDb) {
    const id = uid("biz");
    const biz = { id, name, disabled: false, createdAt: nowIso() };
    const list = localBusinesses();
    list.push(biz);
    auth.businesses = list;
    auth.updatedAt = nowIso();
    saveAuth(auth);
    // init empty DB for this business
    const fresh = createEmptyDb();
    fresh.meta.companyName = name;
    fresh.meta.initialSetupDone = true;
    saveDb(fresh, id);
    businessesCache = list;
    document.querySelector("#businessForm")?.reset();
    renderBusinessesUi();
    toast("Business created.");
    return;
  }
  const { ok, body } = await fetchPosApi("businesses.php", { method: "POST", body: JSON.stringify({ name }) });
  if (!ok || !body || !body.ok) return toast(body?.error || "Could not create business.");
  document.querySelector("#businessForm")?.reset();
  await refreshBusinessesFromServer();
  renderBusinessesUi();
  toast("Business created.");
}

async function createBusinessAdminFromForm(e) {
  e.preventDefault();
  if (!isSuperAdmin()) return toast("Super Admin only.");
  const businessId = (document.querySelector("#businessPick")?.value || "").trim();
  const username = normalizeUsername(document.querySelector("#businessAdminUsername")?.value || "");
  const name = (document.querySelector("#businessAdminName")?.value || "").trim();
  const password = document.querySelector("#businessAdminPassword")?.value || "";
  if (!businessId || !username || !name || !password) return toast("Fill all fields.");
  if (!useRemoteDb) {
    await migratePasswordsToHash();
    const exists = (auth.users || []).some((u) => normalizeUsername(u.username) === username);
    if (exists) return toast("Username already exists.");
    auth.users = Array.isArray(auth.users) ? auth.users : [];
    auth.users.push({
      id: uid("usr"),
      username,
      name,
      role: "business_admin",
      businessId,
      disabled: false,
      permissions: ROLE_PERMS.business_admin ?? [PERMS.USERS_MANAGE],
      passwordHash: await hashPassword(username, password),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    auth.updatedAt = nowIso();
    saveAuth(auth);
    document.querySelector("#businessAdminForm")?.reset();
    toast("Business admin created.");
    return;
  }
  const { ok, body } = await fetchPosApi("users.php", {
    method: "POST",
    body: JSON.stringify({
      username,
      name,
      role: "admin",
      password,
      businessId,
      permissions: ["*"],
    }),
  });
  if (!ok || !body || !body.ok) return toast(body?.error || "Could not create admin.");
  document.querySelector("#businessAdminForm")?.reset();
  toast("Business admin created.");
}

function renderBusinessesUi() {
  const tbody = document.querySelector("#businessesTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  const list = useRemoteDb ? (businessesCache || []) : localBusinesses();
  businessesCache = list;
  for (const b0 of list) {
    const b = { ...b0 };
    const tr = document.createElement("tr");
    const status = b.disabled ? `<span class="pill pill--warn">DISABLED</span>` : `<span class="pill pill--ok">ACTIVE</span>`;
    tr.innerHTML = `
      <td><strong>${escapeHtml(b.name || "")}</strong></td>
      <td><span class="pill">${escapeHtml(b.id || "")}</span></td>
      <td>${status}</td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    if (actions) {
      const btnAdmins = mkBtn("Admins", "btn btn--table btn--table-primary btn--table-compact");
      btnAdmins.addEventListener("click", () => openBusinessAdminsDialog(String(b.id || "")));

      const btnEdit = mkBtn("Edit", "btn btn--table btn--table-primary btn--table-compact");
      btnEdit.addEventListener("click", () => editBusinessLocal(String(b.id || "")));

      const btnToggle = mkBtn(b.disabled ? "Enable" : "Disable", "btn btn--table btn--table-danger btn--table-compact");
      btnToggle.addEventListener("click", () => toggleBusinessDisabledLocal(String(b.id || "")));

      const btnDelete = mkBtn("Delete", "btn btn--table btn--table-danger btn--table-compact");
      btnDelete.addEventListener("click", () => openDeleteBusinessDialog(String(b.id || "")));

      actions.append(btnAdmins, btnEdit, btnToggle, btnDelete);
    }
    tbody.appendChild(tr);
  }
  const sum = document.querySelector("#businessesSummary");
  if (sum) sum.textContent = `${list.length} business${list.length === 1 ? "" : "es"}`;

  const pick = document.querySelector("#businessPick");
  if (pick) {
    const keep = pick.value;
    pick.innerHTML = `<option value="">Select business</option>`;
    for (const b of list) {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name || b.id;
      pick.appendChild(opt);
    }
    pick.value = keep;
  }
}

function editBusinessLocal(bizId) {
  if (!isSuperAdmin()) return toast("Super Admin only.");
  if (useRemoteDb) return toast("Edit business is not available in server mode yet.");
  const id = String(bizId || "").trim();
  if (!id) return;
  const list = localBusinesses();
  const b = list.find((x) => String(x.id) === id);
  if (!b) return toast("Business not found.");
  const next = prompt("Edit business name", b.name || "");
  if (next == null) return;
  const name = String(next || "").trim();
  if (!name) return toast("Business name required.");
  b.name = name;
  auth.businesses = list;
  auth.updatedAt = nowIso();
  saveAuth(auth);
  // keep business DB meta companyName in sync
  const snap = loadDb(id);
  if (snap) {
    snap.meta = snap.meta || {};
    snap.meta.companyName = name;
    snap.meta.updatedAt = nowIso();
    saveDb(snap, id);
  }
  renderBusinessesUi();
  updateMainMenuAccount();
  toast("Business updated.");
}

function toggleBusinessDisabledLocal(bizId) {
  if (!isSuperAdmin()) return toast("Super Admin only.");
  if (useRemoteDb) return toast("Disable/Enable business is not available in server mode yet.");
  const id = String(bizId || "").trim();
  if (!id) return;
  const list = localBusinesses();
  const b = list.find((x) => String(x.id) === id);
  if (!b) return toast("Business not found.");
  const next = !b.disabled;
  if (!confirm(`${next ? "Disable" : "Enable"} business "${b.name || b.id}"?`)) return;
  b.disabled = next;
  auth.businesses = list;
  auth.updatedAt = nowIso();
  saveAuth(auth);
  // If current active business gets disabled, fall back to default.
  if (String(auth.session?.activeBusinessId || "") === id && next) {
    auth.session.activeBusinessId = DEFAULT_BUSINESS_ID;
    saveSession(auth.session);
    db = ensureBusinessDbInitialized(DEFAULT_BUSINESS_ID);
    renderAll();
    renderInvoiceBranding();
  }
  renderBusinessesUi();
  updateMainMenuAccount();
  toast(next ? "Business disabled." : "Business enabled.");
}

function openBusinessAdminsDialog(bizId) {
  if (!isSuperAdmin()) return toast("Super Admin only.");
  const id = String(bizId || "").trim();
  if (!id) return;
  const dlg = document.querySelector("#businessAdminsDialog");
  if (!dlg || typeof dlg.showModal !== "function") return;
  const biz = (useRemoteDb ? (businessesCache || []) : localBusinesses()).find((b) => String(b.id) === id);
  const title = document.querySelector("#businessAdminsDialogTitle");
  const sub = document.querySelector("#businessAdminsDialogSub");
  if (title) title.textContent = `Business admins · ${biz?.name || id}`;
  if (sub) sub.textContent = `Business ID: ${id}`;

  const tbody = document.querySelector("#businessAdminsTable tbody");
  if (tbody) {
    tbody.innerHTML = "";
    const admins = (auth.users || []).filter((u) => String(u.role) === "business_admin" && String(u.businessId) === id);
    if (!admins.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">No business admin accounts for this business.</td></tr>`;
    } else {
      for (const u of admins) {
        const tr = document.createElement("tr");
        const status = u.disabled ? `<span class="pill pill--warn">DISABLED</span>` : `<span class="pill pill--ok">ACTIVE</span>`;
        tr.innerHTML = `
          <td><span class="pill">${escapeHtml(u.username || "")}</span></td>
          <td><strong>${escapeHtml(u.name || "")}</strong></td>
          <td>${status}</td>
          <td class="actions"></td>
        `;
        const actions = tr.querySelector(".actions");
        const btnReset = mkBtn("Reset PW", "btn btn--table btn--table-primary btn--table-compact");
        btnReset.addEventListener("click", () => resetUserPassword(u.id));
        const btnToggle = mkBtn(u.disabled ? "Enable" : "Disable", "btn btn--table btn--table-danger btn--table-compact");
        btnToggle.addEventListener("click", () => toggleUserDisabled(u.id));
        actions?.append(btnReset, btnToggle);
        tbody.appendChild(tr);
      }
    }
  }
  dlg.showModal();
}

let pendingDeleteBusinessId = null;

function openDeleteBusinessDialog(bizId) {
  if (!isSuperAdmin()) return toast("Super Admin only.");
  if (useRemoteDb) return toast("Delete business is not available in server mode yet.");
  const id = String(bizId || "").trim();
  if (!id) return;
  if (id === DEFAULT_BUSINESS_ID) return toast("Default Business cannot be deleted.");

  pendingDeleteBusinessId = id;
  const biz = localBusinesses().find((b) => String(b.id) === id);
  const name = biz?.name || id;
  const usersCount = (auth.users || []).filter((u) => String(u.businessId || "") === id).length;
  const sum = document.querySelector("#deleteBusinessSummary");
  if (sum) sum.textContent = `Business: ${name} (${id}) · Users: ${usersCount}`;
  const uEl = document.querySelector("#deleteBizSuperUser");
  const pEl = document.querySelector("#deleteBizSuperPass");
  if (uEl) uEl.value = "";
  if (pEl) pEl.value = "";
  const dlg = document.querySelector("#deleteBusinessDialog");
  if (dlg && typeof dlg.showModal === "function") dlg.showModal();
  setTimeout(() => uEl?.focus(), 0);
}

function closeDeleteBusinessDialog() {
  document.querySelector("#deleteBusinessDialog")?.close();
  pendingDeleteBusinessId = null;
}

async function verifySuperadminCredentials(username, password) {
  await migratePasswordsToHash();
  const uname = normalizeUsername(username);
  const pass = String(password || "");
  const passHash = await hashPassword(uname, pass);
  const su = (auth.users || []).find((u) => u.role === "superadmin" && normalizeUsername(u.username) === uname);
  return !!(su && !su.disabled && su.passwordHash === passHash);
}

function deleteBusinessLocalNow(bizId) {
  const id = String(bizId || "").trim();
  if (!id || id === DEFAULT_BUSINESS_ID) return false;

  // Remove business
  auth.businesses = localBusinesses().filter((b) => String(b.id) !== id);
  // Remove users belonging to this business (including business_admin and staff)
  auth.users = (auth.users || []).filter((u) => String(u.businessId || "") !== id);
  auth.updatedAt = nowIso();
  saveAuth(auth);

  // Remove business DB snapshot
  try {
    localStorage.removeItem(dbKeyForBusiness(id));
  } catch {
    /* ignore */
  }

  // If active business removed, fall back to default
  if (String(auth.session?.activeBusinessId || "") === id) {
    auth.session.activeBusinessId = DEFAULT_BUSINESS_ID;
    saveSession(auth.session);
    db = ensureBusinessDbInitialized(DEFAULT_BUSINESS_ID);
  }

  renderBusinessesUi();
  updateMainMenuAccount();
  renderAll();
  renderInvoiceBranding();
  toast("Business deleted.");
  return true;
}

function normalizeBroker(b) {
  return {
    id: b.id ?? uid("brk"),
    name: String(b.name ?? "").trim(),
    idNumber: String(b.idNumber ?? b.id_number ?? "").trim(),
    photoDataUrl: typeof b.photoDataUrl === "string" ? b.photoDataUrl : "",
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
      const hay = `${b.name ?? ""} ${b.idNumber ?? ""} ${b.phone ?? ""} ${b.email ?? ""} ${b.address ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  table.innerHTML = "";
  for (const b of list) {
    const tr = document.createElement("tr");
    const hasPhoto = !!String(b.photoDataUrl || "").trim();
    const photoHtml = hasPhoto
      ? `<img class="thumb" alt="Photo" src="${escapeAttr(b.photoDataUrl)}" />`
      : `<div class="thumb thumb--empty">NO IMG</div>`;
    tr.innerHTML = `
      <td>${photoHtml}</td>
      <td><strong>${escapeHtml(b.name || "")}</strong></td>
      <td>${escapeHtml(b.idNumber || "—")}</td>
      <td>${escapeHtml(b.phone || "")}</td>
      <td>${escapeHtml(b.email || "")}</td>
      <td>${escapeHtml(b.address || "")}</td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnEdit = mkBtn("Edit", "btn btn--table btn--table-primary");
    btnEdit.addEventListener("click", () => openBrokerFormDialogForEdit(b.id));
    const btnDel = mkBtn("Delete", "btn btn--table btn--table-danger");
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
  const idNo = document.querySelector("#brokerIdNumber");
  if (idNo) idNo.value = b.idNumber || "";
  pendingBrokerPhotoDataUrl = "";
  setBrokerPhotoPreview(b.photoDataUrl || "");
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
  clearBrokerPhotoPreview();
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
    idNumber: document.querySelector("#brokerIdNumber")?.value,
    photoDataUrl: getBrokerPhotoDataUrlForSave(),
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
  const firstName = String(s.firstName ?? s.first_name ?? "").trim();
  const secondName = String(s.secondName ?? s.second_name ?? "").trim();
  const fullFromParts = [firstName, secondName].filter(Boolean).join(" ").trim();
  const name = String(s.name ?? fullFromParts ?? "").trim();
  return {
    id: s.id ?? uid("sup"),
    name,
    firstName,
    secondName,
    idNumber: String(s.idNumber ?? s.id_number ?? "").trim(),
    photoDataUrl: typeof s.photoDataUrl === "string" ? s.photoDataUrl : "",
    idCopyFrontDataUrl: typeof s.idCopyFrontDataUrl === "string" ? s.idCopyFrontDataUrl : "",
    idCopyBackDataUrl: typeof s.idCopyBackDataUrl === "string" ? s.idCopyBackDataUrl : "",
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
      const hay = `${s.name ?? ""} ${s.firstName ?? ""} ${s.secondName ?? ""} ${s.idNumber ?? ""} ${s.phone ?? ""} ${s.email ?? ""} ${s.address ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  table.innerHTML = "";
  for (const s of list) {
    const tr = document.createElement("tr");
    const hasPhoto = !!String(s.photoDataUrl || "").trim();
    const hasIdFront = !!String(s.idCopyFrontDataUrl || "").trim();
    const hasIdBack = !!String(s.idCopyBackDataUrl || "").trim();
    const idCopyLabel = hasIdFront && hasIdBack ? "Front + Back" : hasIdFront ? "Front" : hasIdBack ? "Back" : "—";
    const photoHtml = hasPhoto
      ? `<img class="thumb" alt="Photo" src="${escapeAttr(s.photoDataUrl)}" />`
      : `<div class="thumb thumb--empty">NO IMG</div>`;
    tr.innerHTML = `
      <td>${photoHtml}</td>
      <td><strong>${escapeHtml(s.name || "")}</strong></td>
      <td>${escapeHtml(s.idNumber || "—")}</td>
      <td>${escapeHtml(s.phone || "")}</td>
      <td>${escapeHtml(s.email || "")}</td>
      <td>${escapeHtml(s.address || "")}</td>
      <td>${idCopyLabel !== "—" ? `<span class="pill">${escapeHtml(idCopyLabel)}</span>` : "—"}</td>
      <td class="actions"></td>
    `;

    const actions = tr.querySelector(".actions");
    const btnEdit = mkBtn("Edit", "btn btn--table btn--table-primary");
    btnEdit.addEventListener("click", () => openSupplierFormDialogForEdit(s.id));
    const btnDel = mkBtn("Delete", "btn btn--table btn--table-danger");
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
  const fn = document.querySelector("#supplierFirstName");
  const sn = document.querySelector("#supplierSecondName");
  const fallbackName = String(s.name || "").trim();
  if (fn) fn.value = String(s.firstName || "").trim() || (fallbackName ? fallbackName.split(/\s+/)[0] : "");
  if (sn) {
    const rest = fallbackName ? fallbackName.split(/\s+/).slice(1).join(" ") : "";
    sn.value = String(s.secondName || "").trim() || rest;
  }
  const idNo = document.querySelector("#supplierIdNumber");
  if (idNo) idNo.value = String(s.idNumber || "").trim();
  pendingSupplierPhotoDataUrl = "";
  setSupplierPhotoPreview(s.photoDataUrl || "");
  pendingSupplierIdFrontDataUrl = "";
  pendingSupplierIdBackDataUrl = "";
  setSupplierIdFrontPreview(s.idCopyFrontDataUrl || "");
  setSupplierIdBackPreview(s.idCopyBackDataUrl || "");
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
  clearSupplierPhotoPreview();
  clearSupplierIdFrontPreview();
  clearSupplierIdBackPreview();
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
  const firstName = document.querySelector("#supplierFirstName")?.value;
  const secondName = document.querySelector("#supplierSecondName")?.value;
  const idNumber = document.querySelector("#supplierIdNumber")?.value;
  const payload = {
    id,
    firstName,
    secondName,
    name: [String(firstName || "").trim(), String(secondName || "").trim()].filter(Boolean).join(" ").trim(),
    idNumber,
    photoDataUrl: getSupplierPhotoDataUrlForSave(),
    idCopyFrontDataUrl: getSupplierIdFrontDataUrlForSave(),
    idCopyBackDataUrl: getSupplierIdBackDataUrlForSave(),
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
  const firstName = String(c.firstName ?? c.first_name ?? "").trim();
  const secondName = String(c.secondName ?? c.second_name ?? "").trim();
  const fullFromParts = [firstName, secondName].filter(Boolean).join(" ").trim();
  const name = String(c.name ?? fullFromParts ?? "").trim();
  return {
    id: c.id ?? uid("cus"),
    name,
    firstName,
    secondName,
    idNumber: String(c.idNumber ?? c.id_number ?? "").trim(),
    photoDataUrl: typeof c.photoDataUrl === "string" ? c.photoDataUrl : "",
    idCopyFrontDataUrl: typeof c.idCopyFrontDataUrl === "string" ? c.idCopyFrontDataUrl : "",
    idCopyBackDataUrl: typeof c.idCopyBackDataUrl === "string" ? c.idCopyBackDataUrl : "",
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
      const hay = `${c.name ?? ""} ${c.firstName ?? ""} ${c.secondName ?? ""} ${c.idNumber ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.address ?? ""} ${c.notes ?? ""}`.toLowerCase();
      return hay.includes(q);
    });

  table.innerHTML = "";
  for (const c of list) {
    const tr = document.createElement("tr");
    const photoUrl = String(c.photoDataUrl || "").trim();
    const hasPhoto = photoUrl.startsWith("data:image/");
    const hasIdFront = !!String(c.idCopyFrontDataUrl || "").trim();
    const hasIdBack = !!String(c.idCopyBackDataUrl || "").trim();
    const photoHtml = hasPhoto ? `<img class="thumb" alt="Photo" src="${escapeAttr(photoUrl)}" />` : "";
    const docsParts = [];
    if (hasIdFront) docsParts.push(`<span class="pill">ID Front</span>`);
    if (hasIdBack) docsParts.push(`<span class="pill">ID Back</span>`);
    const docsHtml = docsParts.length ? docsParts.join(" ") : "";
    tr.innerHTML = `
      <td>${photoHtml}</td>
      <td><strong>${escapeHtml(c.name || "")}</strong></td>
      <td>${escapeHtml(c.idNumber || "—")}</td>
      <td>${escapeHtml(c.phone || "")}</td>
      <td>${escapeHtml(c.email || "")}</td>
      <td>${escapeHtml(c.address || "")}</td>
      <td>${docsHtml}</td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnEdit = mkBtn("Edit", "btn btn--table btn--table-primary");
    btnEdit.addEventListener("click", () => openCustomerFormDialogForEdit(c.id));
    const btnDel = mkBtn("Delete", "btn btn--table btn--table-danger");
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
    const idNo = String(c.idNumber || "").trim();
    const label = idNo ? `${c.name} · ID: ${idNo}` : c.name || "—";
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = label;
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
      const idNo = String(c.idNumber || "").trim();
      const label = idNo ? `${c.name} · ID: ${idNo}` : c.name || "—";
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = label;
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

function ensureQuotationTermsMeta() {
  if (!String(db.meta.quotationTerms ?? "").trim()) db.meta.quotationTerms = DEFAULT_QUOTATION_TERMS;
}

function nextQuotationRef() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const prefix = `QT-${y}${m}${day}-`;
  const existing = (db.quotations || [])
    .map((q) => String(q.quoteRef ?? ""))
    .filter((x) => x.startsWith(prefix))
    .map((x) => safeNumber(x.slice(prefix.length), 0));
  const next = (existing.length ? Math.max(...existing) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function quotationLogoDataUrl() {
  if (db.meta.invoiceLogoDataUrl) return db.meta.invoiceLogoDataUrl;
  const companyName = String(db.meta.companyName || "E-Inventory").trim() || "E-Inventory";
  const parts = companyName.split(" ").filter(Boolean);
  const letters = ((parts[0]?.[0] || "E") + (parts[1]?.[0] || "I")).toUpperCase();
  const safeMark = String(letters)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="160" viewBox="0 0 200 160"><rect width="200" height="160" rx="32" fill="#2563eb"/><rect x="10" y="10" width="180" height="140" rx="26" fill="rgba(255,255,255,0.16)"/><text x="100" y="100" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${safeMark}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeMultilineForHtml(text) {
  return escapeHtml(String(text || "")).replace(/\n/g, "<br />");
}

function vehicleQuotationSpecInner(v) {
  const label = v._label || vehicleLabel(v) || "—";
  const rows = [
    ["Vehicle", label],
    ["Stock No.", v.stockNo || "—"],
    ["VIN", v.vin || "—"],
    ["Reg. / Vehicle No.", v.vehicleNumber || "—"],
    ["Type", v.vehicleType || "—"],
    ["Colour", v.color || "—"],
    ["Odometer (km)", v.mileageKm != null && v.mileageKm !== "" ? String(v.mileageKm) : "—"],
    ["Fuel", v.fuelType || "—"],
    ["Transmission / Gear", v.gearSystem || "—"],
    ["Engine (cc)", v.engineCc != null && v.engineCc !== "" ? String(v.engineCc) : "—"],
    ["Country of origin", v.countryOfOrigin || "—"],
    ["Condition", v.vehicleCondition || "—"],
    ["Owner type", v.ownerType || "—"],
    ["Vehicle owner", vehicleOwnerDisplayName(v) || "—"],
  ];
  return rows
    .map(([k, val]) => `<div class="quoteDoc__specRow"><span class="quoteDoc__specK">${escapeHtml(k)}</span> ${escapeHtml(val)}</div>`)
    .join("");
}

function buildQuotationDocumentHtml(s) {
  const companyName = escapeHtml(String(db.meta.companyName || "").trim() || "E-Inventory");
  const logoSrc = quotationLogoDataUrl();
  const addr = String(db.meta.companyAddress || "").trim();
  const phone = String(db.meta.companyPhone || "").trim();
  const email = String(db.meta.companyEmail || "").trim();
  const web = String(db.meta.companyWebsite || "").trim();
  const coLines = [addr, phone ? `Tel: ${phone}` : "", email, web].filter(Boolean);
  const coBlock = coLines.length ? coLines.map(escapeHtml).join("<br />") : escapeHtml("—");

  const refRaw = (s.quoteRef || "").trim();
  const refDisp = escapeHtml(refRaw || "—");

  const termsHtml = escapeMultilineForHtml(s.terms || "");
  const words = s.v ? `${numberToWords(safeNumber(s.amount, 0))} LKR Only` : "—";

  return `
    <div class="quoteDoc">
      <header class="quoteDoc__head">
        <div class="quoteDoc__brand">
          <img class="quoteDoc__logo" src="${escapeAttr(logoSrc)}" alt="" />
          <div>
            <div class="quoteDoc__company">${companyName}</div>
            <div class="quoteDoc__companyMeta muted">${coBlock}</div>
          </div>
        </div>
        <div class="quoteDoc__refBlock">
          <div class="quoteDoc__doctitle">QUOTATION</div>
          <div class="quoteDoc__subtitle muted">DEALERS IN MOTOR VEHICLES</div>
          <div class="quoteDoc__ref">Ref: <strong>${refDisp}</strong></div>
          <div>Date: <strong>${escapeHtml(s.quoteDate || "—")}</strong></div>
          <div>Valid until: <strong>${escapeHtml(s.validUntil || "—")}</strong></div>
        </div>
      </header>

      <section class="quoteDoc__to">
        <div class="quoteDoc__toTitle">To</div>
        <div><strong>${escapeHtml(s.customerName || "—")}</strong></div>
        <div class="muted">${s.customerPhone ? `Tel: ${escapeHtml(s.customerPhone)}` : ""}</div>
      </section>

      <p class="quoteDoc__intro">We are pleased to submit the following quotation for the motor vehicle described below.</p>

      <div class="tableWrap quoteDoc__tableWrap">
        <table class="table quoteDoc__table">
          <thead>
            <tr>
              <th style="width:22%">Item</th>
              <th>Description &amp; specifications</th>
              <th class="num" style="width:24%">Amount (LKR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Motor vehicle</strong></td>
              <td><div class="quoteDoc__spec">${s.v ? vehicleQuotationSpecInner(s.v) : escapeHtml("—")}</div></td>
              <td class="num"><strong>${escapeHtml(formatMoney(safeNumber(s.amount, 0)))}</strong></td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="num"><strong>Total quotation value</strong></td>
              <td class="num"><strong>${escapeHtml(formatMoney(safeNumber(s.amount, 0)))}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="quoteDoc__words"><strong>Amount in words:</strong> ${escapeHtml(words)}</div>
      ${s.remarks ? `<div class="quoteDoc__remarks"><strong>Remarks:</strong> ${escapeHtml(s.remarks)}</div>` : ""}

      <section class="quoteDoc__terms">
        <div class="quoteDoc__termsTitle">TERMS AND CONDITIONS</div>
        <div class="quoteDoc__termsBody">${termsHtml}</div>
      </section>

      <div class="quoteDoc__sign">
        <div class="quoteDoc__signCol">
          <div class="quoteDoc__signLine"></div>
          <div class="quoteDoc__signCap">Customer</div>
        </div>
        <div class="quoteDoc__signCol">
          <div class="quoteDoc__signLine"></div>
          <div class="quoteDoc__signCap">Authorized signatory (${companyName})</div>
        </div>
      </div>

      <footer class="quoteDoc__footer muted">
        This document is a quotation only and does not constitute a contract of sale until agreed in writing.
      </footer>
    </div>
  `;
}

function getQuotationState() {
  ensureQuotationTermsMeta();
  const customerName = String(document.querySelector("#quotationCustomerName")?.value || "").trim();
  const customerPhone = String(document.querySelector("#quotationCustomerPhone")?.value || "").trim();
  const quoteDate = String(document.querySelector("#quotationDate")?.value || "").trim();
  const validUntil = String(document.querySelector("#quotationValidUntil")?.value || "").trim();
  const remarks = String(document.querySelector("#quotationRemarks")?.value || "").trim();
  const quoteRef = String(document.querySelector("#quotationRefNo")?.value || "").trim();
  const terms = String(document.querySelector("#quotationTerms")?.value ?? "");
  const vehicleId = String(document.querySelector("#quotationVehiclePick")?.value || "").trim();
  const v = getVehicleById(vehicleId);
  const enteredPrice = safeNumber(document.querySelector("#quotationPrice")?.value, NaN);
  const amount = Number.isFinite(enteredPrice) && enteredPrice >= 0 ? enteredPrice : safeNumber(v?.sellPrice, 0);
  return { customerName, customerPhone, quoteDate, validUntil, remarks, quoteRef, terms, v, amount };
}

function normalizeQuotation(q) {
  return {
    id: q.id ?? uid("quo"),
    quoteRef: String(q.quoteRef ?? "").trim(),
    quoteDate: String(q.quoteDate ?? "").trim(),
    validUntil: String(q.validUntil ?? "").trim(),
    customerName: String(q.customerName ?? "").trim(),
    customerPhone: String(q.customerPhone ?? "").trim(),
    remarks: String(q.remarks ?? "").trim(),
    terms: String(q.terms ?? "").trim(),
    amount: Math.max(0, safeNumber(q.amount, 0)),
    vehicleId: String(q.vehicleId ?? "").trim(),
    vehicleSnapshot: {
      stockNo: String(q.vehicleSnapshot?.stockNo ?? "").trim(),
      label: String(q.vehicleSnapshot?.label ?? "").trim(),
      vehicleNumber: String(q.vehicleSnapshot?.vehicleNumber ?? "").trim(),
      gearSystem: String(q.vehicleSnapshot?.gearSystem ?? "").trim(),
      vehicleCondition: String(q.vehicleSnapshot?.vehicleCondition ?? "").trim(),
      vin: String(q.vehicleSnapshot?.vin ?? "").trim(),
      year: q.vehicleSnapshot?.year === "" || q.vehicleSnapshot?.year == null ? null : safeNumber(q.vehicleSnapshot.year, null),
      make: String(q.vehicleSnapshot?.make ?? "").trim(),
      model: String(q.vehicleSnapshot?.model ?? "").trim(),
      color: String(q.vehicleSnapshot?.color ?? "").trim(),
      mileageKm: q.vehicleSnapshot?.mileageKm === "" || q.vehicleSnapshot?.mileageKm == null ? null : safeNumber(q.vehicleSnapshot.mileageKm, null),
      fuelType: String(q.vehicleSnapshot?.fuelType ?? "").trim(),
      vehicleType: String(q.vehicleSnapshot?.vehicleType ?? "").trim(),
      engineCc: q.vehicleSnapshot?.engineCc === "" || q.vehicleSnapshot?.engineCc == null ? null : safeNumber(q.vehicleSnapshot.engineCc, null),
      countryOfOrigin: String(q.vehicleSnapshot?.countryOfOrigin ?? "").trim(),
    },
    createdAt: q.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
}

function vehicleFromQuotationSnapshot(q) {
  const vs = q.vehicleSnapshot || {};
  return {
    stockNo: vs.stockNo || "—",
    vehicleNumber: vs.vehicleNumber || "—",
    gearSystem: vs.gearSystem || "—",
    vehicleCondition: vs.vehicleCondition || "—",
    vin: vs.vin || "",
    year: vs.year,
    make: vs.make || "",
    model: vs.model || "",
    color: vs.color || "",
    mileageKm: vs.mileageKm,
    fuelType: vs.fuelType || "",
    vehicleType: vs.vehicleType || "",
    engineCc: vs.engineCc,
    countryOfOrigin: vs.countryOfOrigin || "",
    _label: vs.label || "",
  };
}

function quotationToState(q) {
  ensureQuotationTermsMeta();
  const v = vehicleFromQuotationSnapshot(q);
  return {
    customerName: q.customerName || "",
    customerPhone: q.customerPhone || "",
    quoteDate: q.quoteDate || "",
    validUntil: q.validUntil || "",
    remarks: q.remarks || "",
    quoteRef: q.quoteRef || "",
    terms: String(q.terms || "").trim() || db.meta.quotationTerms || DEFAULT_QUOTATION_TERMS,
    amount: safeNumber(q.amount, 0),
    v,
  };
}

function buildQuotationMessageFromState(s) {
  if (!s?.v) return "";
  const label = s.v._label || vehicleLabel(s.v) || "—";
  const ref = (s.quoteRef || "").trim() || "—";
  const termsShort = String(s.terms || "")
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(0, 3)
    .join(" ");
  const lines = [
    `${db.meta.companyName || "E-Inventory"} — Vehicle quotation (${ref})`,
    `Date: ${s.quoteDate || "—"} · Valid until: ${s.validUntil || "—"}`,
    `Customer: ${s.customerName || "—"} · Phone: ${s.customerPhone || "—"}`,
    "",
    `Vehicle: ${label}`,
    `Stock: ${s.v.stockNo || "—"} · Reg/Vehicle No: ${s.v.vehicleNumber || "—"}`,
    `Quoted price: ${formatMoney(s.amount)}`,
  ];
  if (s.remarks) lines.push(`Remarks: ${s.remarks}`);
  if (termsShort) lines.push("", `Terms (summary): ${termsShort}…`);
  lines.push("", "Full quotation with terms: please refer to the printed/PDF quotation.");
  return lines.join("\n");
}

function renderQuotationPreview() {
  const preview = document.querySelector("#quotationPreview");
  if (!preview) return;
  const s = getQuotationState();
  if (!s.v) {
    preview.classList.add("muted");
    preview.innerHTML = "Select a vehicle to preview the formal quotation layout.";
    return;
  }
  preview.classList.remove("muted");
  const ref = (s.quoteRef || "").trim() || nextQuotationRef();
  const html = buildQuotationDocumentHtml({ ...s, quoteRef: ref, terms: s.terms || db.meta.quotationTerms || "" });
  preview.innerHTML = `<div class="quotePreviewShell">${html}</div>`;
}

function sendQuotationWhatsapp() {
  requirePerm("quotation", PERMS.BILLING_USE);
  const s = getQuotationState();
  if (!s.v) return toast("Select a vehicle first.");
  const phone = String(s.customerPhone || "").replace(/[^\d]/g, "");
  if (!phone) return toast("Customer phone is required for WhatsApp.");
  const ref = (s.quoteRef || "").trim() || nextQuotationRef();
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(buildQuotationMessageFromState({ ...s, quoteRef: ref }))}`;
  window.open(url, "_blank");
}

function printQuotationFromState(s) {
  if (!s?.v) return toast("Select a vehicle first.");
  ensureQuotationTermsMeta();
  const ref = (s.quoteRef || "").trim() || nextQuotationRef();
  const terms = String(s.terms || "").trim() || db.meta.quotationTerms || "";
  const bodyHtml = buildQuotationDocumentHtml({ ...s, quoteRef: ref, terms });
  const w = window.open("", "_blank");
  if (!w) return toast("Popup blocked. Allow popups to print quotation.");
  w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Quotation ${escapeHtml(ref)}</title>
    <link rel="stylesheet" href="./styles.css" />
    <style>
      body { font-family: "DM Sans", system-ui, sans-serif; padding: 24px; color: #0f172a; background: #fff; max-width: 900px; margin: 0 auto; }
      @media print { body { padding: 12px; } }
    </style>
  </head>
  <body>${bodyHtml}<script>window.onload=()=>window.print()<\/script></body>
</html>`);
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
  const quoteRef = (s.quoteRef || "").trim() || nextQuotationRef();
  const termsText = String(s.terms || "").trim() || db.meta.quotationTerms || "";
  const q = normalizeQuotation({
    quoteRef,
    quoteDate: s.quoteDate || todayISODate(),
    validUntil: s.validUntil || "",
    customerName: s.customerName,
    customerPhone: s.customerPhone,
    remarks: s.remarks,
    terms: termsText,
    amount: s.amount,
    vehicleId: s.v.id || "",
    vehicleSnapshot: {
      stockNo: s.v.stockNo || "",
      label: vehicleLabel(s.v) || "",
      vehicleNumber: s.v.vehicleNumber || "",
      gearSystem: s.v.gearSystem || "",
      vehicleCondition: s.v.vehicleCondition || "",
      vin: s.v.vin || "",
      year: s.v.year,
      make: s.v.make || "",
      model: s.v.model || "",
      color: s.v.color || "",
      mileageKm: s.v.mileageKm,
      fuelType: s.v.fuelType || "",
      vehicleType: s.v.vehicleType || "",
      engineCc: s.v.engineCc,
      countryOfOrigin: s.v.countryOfOrigin || "",
    },
  });
  db.quotations = Array.isArray(db.quotations) ? db.quotations : [];
  db.quotations.push(q);
  persist();
  const refEl = document.querySelector("#quotationRefNo");
  if (refEl) refEl.value = quoteRef;
  renderQuotation();
  toast("Quotation saved.");
}

function loadQuotationToForm(id) {
  ensureQuotationTermsMeta();
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
  const qRef = document.querySelector("#quotationRefNo");
  const qTerms = document.querySelector("#quotationTerms");
  if (qDate) qDate.value = q.quoteDate || "";
  if (qValid) qValid.value = q.validUntil || "";
  if (qName) qName.value = q.customerName || "";
  if (qPhone) qPhone.value = q.customerPhone || "";
  if (qRemarks) qRemarks.value = q.remarks || "";
  if (qPrice) qPrice.value = String(safeNumber(q.amount, 0));
  if (qRef) qRef.value = q.quoteRef || "";
  if (qTerms) qTerms.value = String(q.terms || "").trim() || db.meta.quotationTerms || "";
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
      <td><span class="pill">${escapeHtml(q.quoteRef || "—")}</span><div class="muted" style="margin-top:6px;">${escapeHtml(q.quoteDate || "—")}</div></td>
      <td><strong>${escapeHtml(q.customerName || "—")}</strong><div class="muted">${escapeHtml(q.customerPhone || "")}</div></td>
      <td><strong>${escapeHtml(q.vehicleSnapshot?.label || "—")}</strong><div class="muted">${escapeHtml(q.vehicleSnapshot?.stockNo || "—")}</div></td>
      <td>${escapeHtml(q.validUntil || "—")}</td>
      <td class="num"><strong>${escapeHtml(formatMoney(q.amount))}</strong></td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnLoad = mkBtn("Load", "btn btn--table");
    btnLoad.addEventListener("click", () => loadQuotationToForm(q.id));
    const btnPrint = mkBtn("Print", "btn btn--table btn--table-export");
    btnPrint.addEventListener("click", () => printQuotationFromState(quotationToState(q)));
    const btnDel = mkBtn("Delete", "btn btn--table btn--table-danger");
    btnDel.addEventListener("click", () => deleteQuotation(q.id));
    actions.append(btnLoad, btnPrint, btnDel);
    tbody.appendChild(tr);
  }
  const summary = document.querySelector("#quotationSummary");
  if (summary) summary.textContent = `${list.length} quotation${list.length === 1 ? "" : "s"}`;
}

function saveQuotationTermsAsDefault() {
  requirePerm("save quotation terms", PERMS.BILLING_USE);
  ensureQuotationTermsMeta();
  const te = document.querySelector("#quotationTerms");
  const text = String(te?.value ?? "");
  db.meta.quotationTerms = text.trim() || DEFAULT_QUOTATION_TERMS;
  persist();
  toast("Terms saved as default for new quotations.");
}

function renderQuotation() {
  ensureQuotationTermsMeta();
  renderQuotationOptions();
  renderQuotationPreview();
  renderQuotationList();
}

function fillCustomerForm(id) {
  const c = (db.customers || []).find((x) => x.id === id);
  if (!c) return;
  const idEl = document.querySelector("#customerId");
  if (idEl) idEl.value = c.id;
  const fn = document.querySelector("#customerFirstName");
  const sn = document.querySelector("#customerSecondName");
  const fallbackName = String(c.name || "").trim();
  if (fn) fn.value = String(c.firstName || "").trim() || (fallbackName ? fallbackName.split(/\s+/)[0] : "");
  if (sn) {
    const rest = fallbackName ? fallbackName.split(/\s+/).slice(1).join(" ") : "";
    sn.value = String(c.secondName || "").trim() || rest;
  }
  const idNo = document.querySelector("#customerIdNumber");
  if (idNo) idNo.value = String(c.idNumber || "").trim();
  pendingCustomerPhotoDataUrl = "";
  setCustomerPhotoPreview(c.photoDataUrl || "");
  pendingCustomerIdFrontDataUrl = "";
  pendingCustomerIdBackDataUrl = "";
  setCustomerIdFrontPreview(c.idCopyFrontDataUrl || "");
  setCustomerIdBackPreview(c.idCopyBackDataUrl || "");
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
  clearCustomerPhotoPreview();
  clearCustomerIdFrontPreview();
  clearCustomerIdBackPreview();
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
  const firstName = document.querySelector("#customerFirstName")?.value;
  const secondName = document.querySelector("#customerSecondName")?.value;
  const idNumber = document.querySelector("#customerIdNumber")?.value;
  const payload = {
    id,
    firstName,
    secondName,
    name: [String(firstName || "").trim(), String(secondName || "").trim()].filter(Boolean).join(" ").trim(),
    idNumber,
    photoDataUrl: getCustomerPhotoDataUrlForSave(),
    idCopyFrontDataUrl: getCustomerIdFrontDataUrlForSave(),
    idCopyBackDataUrl: getCustomerIdBackDataUrlForSave(),
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
    const btnEdit = mkBtn("Edit", "btn btn--table btn--table-primary");
    const canEdit = canManageGarageCustomerData();
    if (!canEdit) {
      btnEdit.disabled = true;
      btnEdit.title = "Not allowed";
    }
    btnEdit.addEventListener("click", () => {
      if (!canEdit) return;
      openGarageJobFormDialogForEdit(j.id);
    });
    const btnDel = mkBtn("Delete", "btn btn--table btn--table-danger");
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
  const password2 = document.querySelector("#newPassword2")?.value || "";
  const activeBiz = getActiveBusinessId();
  const pickedPerms = getSelectedPermsFromUserForm();

  if (!username || !name || !role || !password) {
    toast("Please fill all user fields.");
    return;
  }
  if (password !== password2) {
    toast("Password and Confirm Password do not match.");
    return;
  }
  if (!activeBiz) {
    toast("Select an Active Business first.");
    return;
  }
  if (String(currentUser()?.role) === "business_admin") {
    if (role === "admin" || role === "superadmin" || role === "business_admin") {
      toast("Business admin cannot create admin/superadmin.");
      return;
    }
  }
  if (!ROLE_PERMS[role] && role !== "superadmin") {
    toast("Invalid role.");
    return;
  }
  if (!pickedPerms.length) {
    toast("Select at least one permission (or All).");
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
        permissions: pickedPerms.includes("*") ? ["*"] : pickedPerms,
        businessId: activeBiz,
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
    permissions: pickedPerms.includes("*") ? ["*"] : pickedPerms,
    businessId: role === "superadmin" ? null : activeBiz,
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

async function deleteUser(userId) {
  requirePerm("manage users", PERMS.USERS_MANAGE);
  await migratePasswordsToHash();
  const u = (auth.users || []).find((x) => x.id === userId);
  if (!u) return;

  const isSelf = currentUser()?.id && u.id === currentUser()?.id;
  const isAdminUser = normalizeUsername(u.username) === "admin";
  if (isSelf) return toast("Cannot delete your own user.");
  if (isAdminUser) return toast('Cannot delete "admin" user.');

  if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;

  if (useRemoteDb) {
    // Keep behavior safe if server endpoint differs.
    // If you later confirm users.php supports DELETE, we can wire it.
    toast("User delete is not enabled in server mode.");
    return;
  }

  auth.users = (auth.users || []).filter((x) => x.id !== userId);
  auth.updatedAt = nowIso();
  saveAuth(auth);
  renderUsers();
  toast("User deleted.");
}

function persist() {
  db.meta.updatedAt = nowIso();
  saveDb(db, getActiveBusinessId() || DEFAULT_BUSINESS_ID);
  if (USE_SUPABASE) {
    if (!auth.session?.user) return;
    const biz = getActiveBusinessId();
    if (!biz) return;
    window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      supabaseSaveBusinessData(biz, db).then((ok) => {
        if (!ok) toast("Could not save to Supabase (local copy updated).");
      });
    }, 450);
    return;
  }
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
    ownerType: String(v.ownerType ?? "").trim(),
    ownerFirstName: String(v.ownerFirstName ?? "").trim(),
    ownerSecondName: String(v.ownerSecondName ?? "").trim(),
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

function vehicleOwnerDisplayName(v) {
  const a = String(v?.ownerFirstName ?? "").trim();
  const b = String(v?.ownerSecondName ?? "").trim();
  const full = [a, b].filter(Boolean).join(" ");
  return full || "";
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
  if (tab === "marketplace") return can(PERMS.INVENTORY_VIEW);
  if (tab === "inventory") return can(PERMS.INVENTORY_VIEW);
  if (tab === "inventoryReports") return can(PERMS.INVENTORY_VIEW);
  if (tab === "billing") return can(PERMS.BILLING_USE);
  if (tab === "quotation") return can(PERMS.BILLING_USE);
  if (tab === "ledger") return can(PERMS.LEDGER_VIEW);
  if (tab === "reports") return can(PERMS.REPORTS_VIEW);
  if (tab === "dailyReport") return can(PERMS.REPORTS_VIEW);
  if (tab === "soldVehicleReports") return can(PERMS.REPORTS_VIEW);
  if (tab === "refusedVehicles") return can(PERMS.INVENTORY_VIEW);
  if (tab === "companyInfo") return can(PERMS.BRANDING_EDIT);
  if (tab === "users") return can(PERMS.USERS_MANAGE);
  if (tab === "businesses") return isSuperAdmin();
  if (tab === "garage" || tab === "customer") return canAccessGarageCustomer();
  // For now these are admin-only modules
  if (tab === "brokers") return isAdmin();
  if (tab === "suppliers") return isAdmin();
  if (tab === "purchase") return isAdmin();
  return false;
}

/**
 * Public Marketplace page (separate tab). Does not touch main POS session.
 * Server mode: marketplace.html?biz=...  (loads via api/marketplace.php)
 * Local mode:  marketplace.html?biz=...&local=1 (reads this browser's storage)
 */
function marketplaceUrl({ vehicleId = "", businessId = "", absolute = false } = {}) {
  const biz =
    String(businessId || "").trim() ||
    String(getActiveBusinessId() || DEFAULT_BUSINESS_ID).trim() ||
    DEFAULT_BUSINESS_ID;
  const u = new URL("marketplace.html", location.href);
  u.searchParams.set("biz", biz);
  if (!useRemoteDb) u.searchParams.set("local", "1");
  else u.searchParams.delete("local");
  if (vehicleId) u.searchParams.set("veh", String(vehicleId));
  else u.searchParams.delete("veh");
  return absolute ? u.toString() : `${u.pathname}${u.search}`;
}

function marketplaceCompanyMetaLine() {
  const addr = String(db.meta.companyAddress || "").trim();
  const phone = String(db.meta.companyPhone || "").trim();
  const phone2 = String(db.meta.companyPhone2 || "").trim();
  const email = String(db.meta.companyEmail || "").trim();
  const web = String(db.meta.companyWebsite || "").trim();
  const phones = [phone, phone2].filter(Boolean).join(" / ");
  return [addr, phones, email, web].filter(Boolean).join(" · ") || "—";
}

function marketplaceVehicleCandidates() {
  return (Array.isArray(db.vehicles) ? db.vehicles : [])
    .slice()
    .filter((v) => String(v.status || "available") !== "sold")
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function setMarketplaceHeader() {
  const name = String(db.meta.companyName || "").trim() || "E-Inventory";
  const titleEl = document.querySelector("#marketCompanyName");
  if (titleEl) titleEl.textContent = name;
  const metaEl = document.querySelector("#marketCompanyMeta");
  if (metaEl) metaEl.textContent = marketplaceCompanyMetaLine();
  const mark = document.querySelector("#marketLogoMark");
  if (mark) {
    const parts = name.split(" ").filter(Boolean);
    const letters = ((parts[0]?.[0] || "E") + (parts[1]?.[0] || "I")).toUpperCase();
    mark.textContent = letters;
  }
}

function renderMarketplaceList() {
  setMarketplaceHeader();

  const grid = document.querySelector("#marketGrid");
  const sum = document.querySelector("#marketSummary");
  const detail = document.querySelector("#marketVehicleDetail");
  const backBtn = document.querySelector("#btnMarketplaceBack");
  if (detail) detail.hidden = true;
  if (backBtn) backBtn.hidden = true;
  if (grid) grid.hidden = false;

  const q = String(document.querySelector("#marketSearch")?.value || "").trim().toLowerCase();
  const all = marketplaceVehicleCandidates();
  const list = q
    ? all.filter((v) => {
        const hay = [
          v.stockNo,
          v.vehicleNumber,
          v.make,
          v.model,
          v.year != null ? String(v.year) : "",
          v.vehicleType,
          v.color,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
    : all;

  const summary = document.querySelector("#marketSearchSummary");
  if (summary) summary.textContent = q ? `${list.length} of ${all.length}` : `${all.length} available`;

  if (!grid) return;
  const placeholderSvg = (label = "Vehicle") =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#e2e8f0"/><stop offset="1" stop-color="#f8fafc"/>
          </linearGradient>
        </defs>
        <rect width="800" height="520" rx="24" fill="url(#g)"/>
        <rect x="28" y="28" width="744" height="464" rx="20" fill="rgba(255,255,255,0.55)" stroke="rgba(148,163,184,0.35)"/>
        <text x="50%" y="54%" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#334155">${escapeHtml(
          label
        )}</text>
        <text x="50%" y="64%" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#64748b">No image uploaded</text>
      </svg>`
    )}`;

  const cards = list
    .map((v) => {
      const title = vehicleLabel(v) || "Vehicle";
      const img =
        v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")
          ? String(v.imageDataUrl).trim()
          : placeholderSvg(title);
      const price = formatMoney(v.sellPrice);
      const bits = [v.make, v.model].filter(Boolean).join(" ");
      const year = v.year != null && v.year !== "" ? String(v.year) : "—";
      const stock = String(v.stockNo || "").trim() ? `Stock: ${escapeHtml(v.stockNo)}` : "";
      const href = marketplaceUrl({ vehicleId: v.id, absolute: false });
      return `
        <article class="marketCard" data-market-veh="${escapeAttr(v.id)}" tabindex="0" role="link" aria-label="Open ${escapeAttr(title)}">
          <div class="marketCard__imgWrap">
            <img class="marketCard__img" src="${escapeAttr(img)}" alt="${escapeAttr(title)}" loading="lazy" />
          </div>
          <div class="marketCard__body">
            <div class="marketCard__title">${escapeHtml(bits || title)}</div>
            <div class="marketCard__sub muted">${escapeHtml(year)}${stock ? ` · ${stock}` : ""}</div>
            <div class="marketCard__price">${escapeHtml(price)}</div>
          </div>
          <div class="marketCard__footer">
            <a class="marketCard__link" href="${escapeAttr(href)}" data-market-open="${escapeAttr(v.id)}">View details</a>
            <button class="btn btn--sm" type="button" data-market-copy="${escapeAttr(v.id)}">Copy link</button>
          </div>
        </article>
      `;
    })
    .join("");

  grid.innerHTML = cards || `<div class="muted" style="padding: 18px">No available vehicles.</div>`;
  if (sum) sum.textContent = `${list.length} vehicles`;
}

function renderMarketplaceVehicleDetail(vehicleId) {
  setMarketplaceHeader();
  const v = getVehicleById(String(vehicleId || "").trim());
  const detail = document.querySelector("#marketVehicleDetail");
  const grid = document.querySelector("#marketGrid");
  const backBtn = document.querySelector("#btnMarketplaceBack");
  if (!detail || !grid) return;

  if (!v || String(v.status || "available") === "sold") {
    detail.hidden = false;
    grid.hidden = true;
    if (backBtn) backBtn.hidden = false;
    detail.innerHTML = `<div class="card"><div class="card__header"><h3>Not found</h3></div><div class="card__footer muted">This vehicle is no longer available.</div></div>`;
    return;
  }

  const img =
    v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")
      ? String(v.imageDataUrl).trim()
      : "";
  const title = vehicleLabel(v) || `${String(v.make || "").trim()} ${String(v.model || "").trim()}`.trim() || "Vehicle";
  const price = formatMoney(v.sellPrice);
  const rows = [
    ["Make", v.make || "—"],
    ["Model", v.model || "—"],
    ["Year", v.year != null && v.year !== "" ? String(v.year) : "—"],
    ["Selling price", price],
    ["Stock No.", v.stockNo || "—"],
    ["Vehicle No.", v.vehicleNumber || "—"],
    ["Type", v.vehicleType || "—"],
    ["Colour", v.color || "—"],
  ];

  detail.hidden = false;
  grid.hidden = true;
  if (backBtn) backBtn.hidden = false;
  detail.innerHTML = `
    <div class="marketDetail card">
      <div class="marketDetail__header">
        <div>
          <h3 style="margin:0">${escapeHtml(title)}</h3>
          <div class="muted">${escapeHtml(v.stockNo || "")}${v.stockNo ? " · " : ""}${escapeHtml(String(v.vehicleNumber || ""))}</div>
        </div>
        <div class="marketDetail__actions">
          <div class="marketDetail__price">${escapeHtml(price)}</div>
          <button class="btn" type="button" data-market-copy="${escapeAttr(v.id)}">Copy link</button>
        </div>
      </div>
      <div class="marketDetail__grid">
        <div class="marketDetail__media">
          ${
            img
              ? `<img class="marketDetail__img" src="${escapeAttr(img)}" alt="${escapeAttr(title)}" />`
              : `<div class="marketDetail__imgPlaceholder muted">No image uploaded</div>`
          }
        </div>
        <div class="marketDetail__spec">
          <div class="marketSpec">
            ${rows
              .map(
                ([k, val]) =>
                  `<div class="marketSpec__row"><div class="marketSpec__k muted">${escapeHtml(k)}</div><div class="marketSpec__v">${escapeHtml(val)}</div></div>`
              )
              .join("")}
          </div>
        </div>
      </div>
      ${
        String(v.notes || "").trim()
          ? `<div class="marketDetail__notes"><div class="muted" style="font-weight:700;margin-bottom:6px;">Notes</div><div>${escapeMultilineForHtml(
              v.notes
            )}</div></div>`
          : ""
      }
      <div class="card__footer muted">
        ${
          !useRemoteDb
            ? "Note: In local mode, shared links work only on this same device/browser. Use server mode to share publicly."
            : "Share this link with customers to view this vehicle."
        }
      </div>
    </div>
  `;
}

function renderMarketplace() {
  const params = new URLSearchParams(location.search);
  const veh = String(params.get("veh") || "").trim();
  if (veh) renderMarketplaceVehicleDetail(veh);
  else renderMarketplaceList();
}

function initNav() {
  const mm = document.querySelector("#mainMenu");
  const go = (tab) => {
    if (!canOpenNav(tab)) return toast(`No permission: ${tab}`);
    if (tab === "marketplace") {
      const url = marketplaceUrl({ absolute: true });
      const w = window.open(url, "_blank", "noopener,noreferrer");
      if (!w) toast("Popup blocked. Allow popups to open Marketplace.");
      if (mm?.open) mm.open = false;
      return;
    }
    setActiveTab(tab);
    if (tab === "purchase") {
      renderPurchaseVehicleBrokerOptions();
      renderPurchasePartyOptions();
    }
    if (tab === "dailyReport") renderDailyReport();
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
  document.querySelector("#vehicleLeaseDialog")?.close();
  document.querySelector("#vehicleFormDialog")?.close();
}

function openVehicleFormDialogForNew() {
  if (!can(PERMS.INVENTORY_EDIT)) {
    toast("No permission: add vehicle");
    return;
  }
  resetVehicleForm();
  document.querySelector("#vehicleFormDialog")?.showModal();
}

function openVehicleFormDialogForEdit(v) {
  if (!can(PERMS.INVENTORY_EDIT)) {
    toast("No permission: edit vehicle");
    return;
  }
  fillVehicleForm(v);
  document.querySelector("#vehicleFormDialog")?.showModal();
  toast("Loaded vehicle for edit.");
}

function closePurchaseFormDialog() {
  document.querySelector("#purchaseLeaseDialog")?.close();
  document.querySelector("#purchaseFormDialog")?.close();
}

function setPurchaseFormDialogMode(isEdit) {
  const title = document.querySelector("#purchaseFormDialogTitle");
  const badge = document.querySelector("#purchaseFormDialogBadge");
  const submitBtn = document.querySelector("#purchaseForm button[type='submit']");
  if (title) title.textContent = isEdit ? "Edit Purchase" : "Add Purchase";
  if (badge) badge.textContent = isEdit ? "Update purchase & inventory" : "Full vehicle details";
  if (submitBtn) submitBtn.textContent = isEdit ? "Save changes" : "Save purchase";
}

function fillPurchaseFormFromPurchase(p) {
  const v = purchaseRecordVehicle(p);
  const setVal = (sel, val) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.value = val == null ? "" : String(val);
  };
  setVal("#purchaseDate", p.purchaseDate || todayISODate());
  const srcEl = document.querySelector("#purchaseSource");
  if (srcEl) srcEl.value = p.source === "broker" ? "broker" : "supplier";
  renderPurchasePartyOptions();
  const partyEl = document.querySelector("#purchaseParty");
  if (partyEl) {
    const party = String(p.partyName || "").trim();
    const opts = Array.from(partyEl.options).map((o) => o.value);
    partyEl.value = party && opts.includes(party) ? party : "";
  }
  setVal("#purchaseOwnerFirstName", v.ownerFirstName || "");
  setVal("#purchaseOwnerSecondName", v.ownerSecondName || "");
  setVal("#purchaseOwnerType", v.ownerType || "");
  setVal("#purchaseStockNo", v.stockNo || "");
  setVal("#purchaseVin", v.vin || "");
  setVal("#purchaseMake", v.make || "");
  setVal("#purchaseModel", v.model || "");
  setVal("#purchaseYear", v.year != null && v.year !== "" ? v.year : "");
  setVal("#purchaseColor", v.color || "");
  setVal("#purchaseVehicleNumber", v.vehicleNumber || "");
  const vt = document.querySelector("#purchaseVehicleType");
  if (vt) vt.value = v.vehicleType || "";
  renderPurchaseVehicleBrokerOptions();
  const br = document.querySelector("#purchaseVehicleBrokerName");
  if (br) {
    const bn = String(v.brokerName || "Self").trim() || "Self";
    const bropts = Array.from(br.options).map((o) => o.value);
    br.value = bropts.includes(bn) ? bn : "Self";
  }
  setVal("#purchaseCountryOfOrigin", v.countryOfOrigin || "");
  setVal("#purchaseMileageKm", v.mileageKm != null && v.mileageKm !== "" ? v.mileageKm : "");
  const ft = document.querySelector("#purchaseFuelType");
  if (ft) ft.value = v.fuelType || "";
  const gs = document.querySelector("#purchaseGearSystem");
  if (gs) gs.value = v.gearSystem || "";
  const cond = document.querySelector("#purchaseVehicleCondition");
  if (cond) cond.value = v.vehicleCondition || "";
  setVal("#purchaseEngineCc", v.engineCc != null && v.engineCc !== "" ? v.engineCc : "");
  setVal("#purchaseCostPrice", v.costPrice ?? "");
  setVal("#purchaseSellPrice", v.sellPrice ?? "");
  setVal("#purchaseNotes", v.notes || "");
  const pls = document.querySelector("#purchaseLeasingStatus");
  if (pls) pls.value = v.leasingStatus || "No";
  setVal("#purchaseLeasingCompany", v.leasingCompany || "");
  setVal("#purchaseLeaseAmount", v.leaseAmount ?? "");
  setVal("#purchaseLeaseBalanceAmount", v.leaseBalanceAmount ?? "");
  setVal("#purchaseLeasePeriod", v.leasePeriod || "");
  setVal("#purchaseLeaseBalancePeriod", v.leaseBalancePeriod || "");
  pendingPurchaseImageDataUrl = "";
  clearPurchaseImagePreview();
  const img = String(v.imageDataUrl || "").trim();
  if (img.startsWith("data:image/")) setPurchaseImagePreview(img);
  updatePurchaseLeaseSectionVisibility();
}

function openPurchaseFormDialogForEdit(purchaseId) {
  if (!isAdmin()) {
    toast("Only admin can edit purchases.");
    return;
  }
  const p = (Array.isArray(db.purchases) ? db.purchases : []).find((x) => x.id === purchaseId);
  if (!p) {
    toast("Purchase not found.");
    return;
  }
  document.querySelector("#purchaseLeaseDialog")?.close();
  editingPurchaseId = purchaseId;
  fillPurchaseFormFromPurchase(p);
  setPurchaseFormDialogMode(true);
  document.querySelector("#purchaseFormDialog")?.showModal();
}

function openPurchaseViewDialog(purchaseId) {
  if (!isAdmin()) {
    toast("Only admin can open purchases.");
    return;
  }
  const p = (Array.isArray(db.purchases) ? db.purchases : []).find((x) => x.id === purchaseId);
  if (!p) {
    toast("Purchase not found.");
    return;
  }
  const v = purchaseRecordVehicle(p);
  const dlg = document.querySelector("#purchaseViewDialog");
  const body = document.querySelector("#purchaseViewBody");
  if (!dlg || !body) return;
  viewingPurchaseId = purchaseId;
  const owner = vehicleOwnerDisplayName(v);
  const ownerBlock =
    owner || v.ownerType
      ? `<div class="muted" style="margin: 12px 0 4px; font-weight: 700">Owner</div>
         <div>${v.ownerType ? `${escapeHtml(v.ownerType)} · ` : ""}${owner ? escapeHtml(owner) : "—"}</div>`
      : "";
  const leaseBlock =
    String(v.leasingStatus || "") === "Yes" ||
    (v.leasingCompany && String(v.leasingCompany).trim()) ||
    Number(v.leaseAmount) > 0 ||
    Number(v.leaseBalanceAmount) > 0 ||
    (v.leasePeriod && String(v.leasePeriod).trim()) ||
    (v.leaseBalancePeriod && String(v.leaseBalancePeriod).trim())
      ? `<div class="muted" style="margin: 12px 0 4px; font-weight: 700">Leasing</div>
         <div>
           ${escapeHtml(v.leasingStatus || "No")}${v.leasingCompany ? ` · ${escapeHtml(v.leasingCompany)}` : ""}<br/>
           ${v.leaseAmount ? `Amount: ${escapeHtml(formatMoney(v.leaseAmount))}` : ""}
           ${v.leaseBalanceAmount ? ` · Balance: ${escapeHtml(formatMoney(v.leaseBalanceAmount))}` : ""}<br/>
           ${v.leasePeriod ? `Period: ${escapeHtml(v.leasePeriod)}` : ""}
           ${v.leaseBalancePeriod ? ` · Balance period: ${escapeHtml(v.leaseBalancePeriod)}` : ""}
         </div>`
      : "";
  const imgHtml =
    v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")
      ? `<div class="imgPreviewWrap" style="max-width: 320px; margin-top: 12px">
           <img src="${escapeAttr(v.imageDataUrl)}" alt="Vehicle" />
         </div>`
      : `<p class="muted" style="margin-top: 12px">No vehicle image on file.</p>`;

  const makeModel = `${String(v.make || "").trim()} ${String(v.model || "").trim()}`.trim();

  const sysBlock = `
    <div class="muted" style="margin: 12px 0 4px; font-weight: 700">System</div>
    <div class="formGrid" style="padding: 0">
      <label class="field"><span class="muted">Purchase ID</span><div><span class="pill">${escapeHtml(p.id || "—")}</span></div></label>
      <label class="field"><span class="muted">Recorded</span><div>${p.createdAt ? escapeHtml(new Date(p.createdAt).toLocaleString()) : "—"}</div></label>
      <label class="field"><span class="muted">Vehicle ID</span><div><span class="pill">${escapeHtml(v.id || "—")}</span></div></label>
      <label class="field"><span class="muted">Updated</span><div>${v.updatedAt ? escapeHtml(new Date(v.updatedAt).toLocaleString()) : "—"}</div></label>
    </div>
  `;
  body.innerHTML = `
    <div class="formGrid" style="padding: 0">
      <label class="field field--full"><span class="muted">Purchase date</span><div><strong>${escapeHtml(p.purchaseDate || "—")}</strong></div></label>
      <label class="field"><span class="muted">Source</span><div>${escapeHtml(p.source || "—")}</div></label>
      <label class="field"><span class="muted">Stock No.</span><div><strong>${escapeHtml(v.stockNo || "—")}</strong></div></label>
      <label class="field field--full"><span class="muted">Party</span><div><strong>${escapeHtml(p.partyName || "—")}</strong></div></label>
    </div>
    ${ownerBlock}
    <div class="muted" style="margin: 12px 0 4px; font-weight: 700">Vehicle</div>
    <div class="formGrid" style="padding: 0">
      <label class="field field--full"><span class="muted">Make / Model</span><div><strong>${escapeHtml(makeModel || vehicleLabel(v) || "—")}</strong></div></label>
      <label class="field"><span class="muted">Make</span><div>${escapeHtml(v.make || "—")}</div></label>
      <label class="field"><span class="muted">Model</span><div>${escapeHtml(v.model || "—")}</div></label>
      <label class="field"><span class="muted">VIN / Chassis</span><div>${escapeHtml(v.vin || "—")}</div></label>
      <label class="field"><span class="muted">Vehicle number</span><div>${escapeHtml(v.vehicleNumber || "—")}</div></label>
      <label class="field"><span class="muted">Year</span><div>${v.year != null && v.year !== "" ? escapeHtml(String(v.year)) : "—"}</div></label>
      <label class="field"><span class="muted">Color</span><div>${escapeHtml(v.color || "—")}</div></label>
      <label class="field"><span class="muted">Type</span><div>${escapeHtml(v.vehicleType || "—")}</div></label>
      <label class="field"><span class="muted">Broker name</span><div>${escapeHtml(v.brokerName || "—")}</div></label>
      <label class="field"><span class="muted">Country of origin</span><div>${escapeHtml(v.countryOfOrigin || "—")}</div></label>
      <label class="field"><span class="muted">Mileage (km)</span><div>${v.mileageKm != null ? escapeHtml(String(v.mileageKm)) : "—"}</div></label>
      <label class="field"><span class="muted">Fuel</span><div>${escapeHtml(v.fuelType || "—")}</div></label>
      <label class="field"><span class="muted">Gear</span><div>${escapeHtml(v.gearSystem || "—")}</div></label>
      <label class="field"><span class="muted">Condition</span><div>${escapeHtml(v.vehicleCondition || "—")}</div></label>
      <label class="field"><span class="muted">Engine CC</span><div>${v.engineCc != null ? escapeHtml(String(v.engineCc)) : "—"}</div></label>
      <label class="field"><span class="muted">Cost price</span><div>${escapeHtml(formatMoney(v.costPrice))}</div></label>
      <label class="field"><span class="muted">Selling price</span><div>${escapeHtml(formatMoney(v.sellPrice))}</div></label>
    </div>
    ${leaseBlock}
    <label class="field field--full" style="margin-top: 12px"><span class="muted">Notes</span><div style="white-space: pre-wrap">${escapeHtml(v.notes || "—")}</div></label>
    ${sysBlock}
    <div><span class="muted">Image</span>${imgHtml}</div>
  `;
  if (typeof dlg.showModal === "function") dlg.showModal();
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
  document.querySelector("#vehicleLeaseDialog")?.close();
  $("#vehicleId").value = "";
  $("#vehicleFormTitle").textContent = "Add Vehicle";
  $("#vehicleFormModeBadge").textContent = "New";
  $("#btnDeleteVehicle").hidden = true;
  $("#vehicleForm").reset();
  renderVehicleBrokerOptions();
  $("#vehicleBrokerName").value = "Self";
  clearVehicleImagePreview();
  updateLeaseSectionVisibility();
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
  const ot = document.querySelector("#ownerType");
  if (ot) ot.value = v.ownerType ?? "";
  const of = document.querySelector("#ownerFirstName");
  const os = document.querySelector("#ownerSecondName");
  if (of) of.value = v.ownerFirstName ?? "";
  if (os) os.value = v.ownerSecondName ?? "";

  setVehicleImagePreview(v.imageDataUrl || "");
}

function inventoryMatchesQuery(v, q) {
  if (!q) return true;
  const hay = `${v.stockNo ?? ""} ${v.vehicleNumber ?? ""}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderInventory() {
  const tbody = $("#inventoryTable tbody");
  tbody.innerHTML = "";
  const q = $("#inventorySearch").value.trim();

  const inInventory = db.vehicles.filter((v) => v.status !== "sold");
  const totalAll = inInventory.length;
  const totalEl = document.querySelector("#invCountTotal");
  if (totalEl) totalEl.textContent = `Total: ${totalAll}`;

  const list = inInventory
    .slice()
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .filter((v) => inventoryMatchesQuery(v, q));

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
      <td><strong>${escapeHtml(String(v.vehicleNumber || "").trim() || "—")}</strong></td>
      <td>${inventoryGarageStatusHtml(v)}</td>
      <td class="num"><strong>${formatMoney(v.sellPrice)}</strong><div class="muted" style="margin-top:6px;">Cost: ${formatMoney(v.costPrice)}</div></td>
      <td><span class="pill">${docsCount} file${docsCount === 1 ? "" : "s"}</span></td>
      <td class="actions"></td>
    `;

    const actionsTd = tr.querySelector(".actions");

    const btnEdit = mkBtn("Edit", "btn btn--table btn--table-primary");
    if (!can(PERMS.INVENTORY_EDIT)) {
      btnEdit.disabled = true;
      btnEdit.classList.remove("btn--table-primary");
      btnEdit.classList.add("btn--table-muted");
      btnEdit.title = "No permission to edit";
    }
    btnEdit.addEventListener("click", () => {
      if (!can(PERMS.INVENTORY_EDIT)) return;
      openVehicleFormDialogForEdit(v);
    });

    const btnView = mkBtn("View", "btn btn--table");
    btnView.addEventListener("click", () => openInventoryViewDialog(v.id));

    const btnDocs = mkBtn("Docs", "btn btn--table");
    btnDocs.addEventListener("click", () => {
      docsDialogMode = "default";
      openDocsDialog(v.id);
    });

    const btnDelete = mkBtn("Delete", "btn btn--table btn--table-danger");
    if (!can(PERMS.INVENTORY_DELETE)) {
      btnDelete.disabled = true;
      btnDelete.classList.remove("btn--table-danger");
      btnDelete.classList.add("btn--table-muted");
      btnDelete.title = "No permission to delete";
    }
    btnDelete.addEventListener("click", () => {
      if (!can(PERMS.INVENTORY_DELETE)) return;
      deleteVehicleById(v.id);
    });

    const inCart = isInCart(v.id);
    const sold = v.status === "sold";
    const btnAdd = mkBtn(inCart ? "In cart" : "Add to cart", "btn btn--table");
    if (inCart || sold) {
      btnAdd.classList.add("btn--table-muted");
      btnAdd.disabled = true;
    } else {
      btnAdd.classList.add("btn--table-primary");
    }
    btnAdd.addEventListener("click", () => {
      if (sold || isInCart(v.id)) return;
      db.cart.items.push(v.id);
      persist();
      renderAll();
      toast("Added to cart.");
      setActiveTab("billing");
    });

    actionsTd.append(btnEdit, btnView, btnDocs, btnDelete, btnAdd);
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
    const vehicle =
      (r.vehicleId ? getVehicleById(r.vehicleId) : null) ||
      ((db.vehicles || []).find(
        (v) =>
          String(v.stockNo || "").trim().toLowerCase() === String(r.stockNo || "").trim().toLowerCase() &&
          v.status === "sold"
      ) ??
        null);
    const btnView = mkBtn("View", "btn btn--table");
    const btnDocs = mkBtn("Docs", "btn btn--table");
    const btnUpload = mkBtn("Sold docs", "btn btn--table btn--table-export");
    if (!vehicle) {
      btnView.disabled = true;
      btnDocs.disabled = true;
      btnUpload.disabled = true;
      btnView.title = "Vehicle details not available";
      btnDocs.title = "Vehicle documents not available";
      btnUpload.title = "Vehicle documents not available";
    } else {
      btnView.addEventListener("click", () => openInventoryViewDialog(vehicle.id, { hideDocs: true }));
      btnDocs.addEventListener("click", () => {
        docsDialogMode = "default";
        openDocsDialog(vehicle.id);
      });
      const canUpload = can(PERMS.DOCS_MANAGE);
      btnUpload.disabled = !canUpload;
      btnUpload.title = canUpload ? "Upload documents" : "No permission to upload documents";
      btnUpload.addEventListener("click", () => {
        if (!canUpload) return;
        // Open Sold-documents view (no auto file picker).
        docsDialogMode = "sold";
        openDocsDialog(vehicle.id);
      });
    }
    actions.append(btnView, btnDocs, btnUpload);
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
              <div class="k">Owner type</div><div class="v">${escapeHtml(v.ownerType || "—")}</div>
              <div class="k">Vehicle owner</div><div class="v">${escapeHtml(vehicleOwnerDisplayName(v) || "—")}</div>
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

/** In-app vehicle view (same style as Purchase view). */
function openInventoryViewDialog(vehicleId, { hideDocs } = {}) {
  const v = getVehicleById(vehicleId);
  if (!v) {
    toast("Vehicle not found.");
    return;
  }
  const dlg = document.querySelector("#inventoryViewDialog");
  const body = document.querySelector("#inventoryViewBody");
  if (!dlg || !body) return;

  // Allow Sold Vehicles "View" to hide docs UI.
  openInventoryViewDialog.lastVehicleId = vehicleId;
  openInventoryViewDialog.hideDocs = !!hideDocs;
  const btnDocs = document.querySelector("#btnInventoryViewOpenDocs");
  if (btnDocs) btnDocs.hidden = !!hideDocs;

  const owner = vehicleOwnerDisplayName(v);
  const ownerBlock =
    owner || v.ownerType
      ? `<div class="muted" style="margin: 12px 0 4px; font-weight: 700">Owner</div>
         <div>${v.ownerType ? `${escapeHtml(v.ownerType)} · ` : ""}${owner ? escapeHtml(owner) : "—"}</div>`
      : "";

  const showLease =
    String(v.leasingStatus || "") === "Yes" ||
    (v.leasingCompany && String(v.leasingCompany).trim()) ||
    Number(v.leaseAmount) > 0 ||
    Number(v.leaseBalanceAmount) > 0 ||
    (v.leasePeriod && String(v.leasePeriod).trim()) ||
    (v.leaseBalancePeriod && String(v.leaseBalancePeriod).trim());
  const leaseBlock = showLease
    ? `<div class="muted" style="margin: 12px 0 4px; font-weight: 700">Leasing</div>
       <div>
         ${escapeHtml(v.leasingStatus || "No")}${v.leasingCompany ? ` · ${escapeHtml(v.leasingCompany)}` : ""}<br/>
         ${v.leaseAmount ? `Amount: ${escapeHtml(formatMoney(v.leaseAmount))}` : ""}
         ${v.leaseBalanceAmount ? ` · Balance: ${escapeHtml(formatMoney(v.leaseBalanceAmount))}` : ""}<br/>
         ${v.leasePeriod ? `Period: ${escapeHtml(v.leasePeriod)}` : ""}
         ${v.leaseBalancePeriod ? ` · Balance period: ${escapeHtml(v.leaseBalancePeriod)}` : ""}
       </div>`
    : "";

  const imgHtml =
    v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")
      ? `<div class="imgPreviewWrap" style="max-width: 340px; margin-top: 12px">
           <img src="${escapeAttr(v.imageDataUrl)}" alt="Vehicle" />
         </div>`
      : `<p class="muted" style="margin-top: 12px">No vehicle image on file.</p>`;

  const docsCount = Array.isArray(v.docs) ? v.docs.length : 0;
  const statusPill =
    v.status === "sold"
      ? `<span class="pill pill--warn">SOLD</span>`
      : `<span class="pill pill--ok">AVAILABLE</span>`;

  const makeModel = `${String(v.make || "").trim()} ${String(v.model || "").trim()}`.trim();

  const findSaleForVehicle = (vid) => {
    if (!vid) return null;
    const byId = v.saleId ? (db.sales || []).find((s) => s.id === v.saleId) : null;
    if (byId) return byId;
    return (db.sales || []).find((s) => (s.items || []).some((it) => it.vehicleId === vid)) || null;
  };
  const sale = v.status === "sold" ? findSaleForVehicle(v.id) : null;
  const saleItem = sale ? (sale.items || []).find((it) => it.vehicleId === v.id) || null : null;
  const saleDetailsBlock = sale
    ? (() => {
        const createdAt = sale.createdAt ? new Date(sale.createdAt).toLocaleString() : "—";
        const invoiceNo = sale.invoiceNo || "—";
        const custName = sale.customer?.name || "Walk-in";
        const custPhone = sale.customer?.phone || "—";
        const paymentMethod = sale.paymentMethod || "—";
        const soldBy = sale.soldBy ? sale.soldBy.name || sale.soldBy.username || "" : "";
        const soldPrice = saleItem ? safeNumber(saleItem.sellPrice, 0) : safeNumber(v.sellPrice, 0);
        const total = safeNumber(sale.total, soldPrice);
        const paid = Math.max(0, safeNumber(sale.paidAmount, total));
        const balance = Math.max(0, total - paid);
        const remarks = String(sale.remarks || "").trim();
        const doc = sale.documents || {};
        const docLine = [
          doc.originalCr ? "ORIGINAL CR" : "",
          doc.noObjectionLetter ? "NO OBJECTION LETTER" : "",
          doc.deletion ? "DELETION" : "",
          doc.revenueLicence ? "REVENUE LICENCE" : "",
        ]
          .filter(Boolean)
          .join(", ");
        const others = String(doc.others || "").trim();
        const docsText = [docLine, others ? `OTHERS: ${others}` : ""].filter(Boolean).join(" · ") || "—";

        return `
          <div class="muted" style="margin: 16px 0 6px; font-weight: 800">After sale (Sale details)</div>
          <div class="formGrid" style="padding: 0">
            <label class="field"><span class="muted">Invoice no</span><div><span class="pill">${escapeHtml(invoiceNo)}</span></div></label>
            <label class="field"><span class="muted">Sold at</span><div>${escapeHtml(createdAt)}</div></label>
            <label class="field"><span class="muted">Customer</span><div><strong>${escapeHtml(custName)}</strong></div></label>
            <label class="field"><span class="muted">Phone</span><div>${escapeHtml(custPhone)}</div></label>
            <label class="field"><span class="muted">Payment</span><div>${escapeHtml(paymentMethod)}</div></label>
            <label class="field"><span class="muted">Sold by</span><div>${escapeHtml(soldBy || "—")}</div></label>
            <label class="field"><span class="muted">Sold price</span><div><strong>${escapeHtml(formatMoney(soldPrice))}</strong></div></label>
            <label class="field"><span class="muted">Invoice total</span><div>${escapeHtml(formatMoney(total))}</div></label>
            <label class="field"><span class="muted">Paid</span><div>${escapeHtml(formatMoney(paid))}</div></label>
            <label class="field"><span class="muted">Balance</span><div>${balance > 0 ? `<span class="pill pill--warn">${escapeHtml(formatMoney(balance))}</span>` : `<span class="pill pill--ok">0.00</span>`}</div></label>
            <label class="field field--full"><span class="muted">Documents</span><div>${escapeHtml(docsText)}</div></label>
          </div>
          ${
            remarks
              ? `<label class="field field--full" style="margin-top: 10px"><span class="muted">Remarks</span><div style="white-space: pre-wrap">${escapeHtml(remarks)}</div></label>`
              : ""
          }
        `;
      })()
    : v.status === "sold"
      ? `<div class="muted" style="margin: 16px 0 6px; font-weight: 800">After sale (Sale details)</div>
         <div class="muted">Sale record not found for this vehicle.</div>`
      : "";

  const docsRowHtml = hideDocs
    ? ""
    : `<label class="field"><span class="muted">Docs</span><div><span class="pill">${docsCount} file${docsCount === 1 ? "" : "s"}</span></div></label>`;

  body.innerHTML = `
    <div class="formGrid" style="padding: 0">
      <label class="field"><span class="muted">Stock No.</span><div><strong>${escapeHtml(v.stockNo || "—")}</strong></div></label>
      <label class="field"><span class="muted">Status</span><div>${statusPill}</div></label>
      <label class="field"><span class="muted">VIN / Chassis</span><div>${escapeHtml(v.vin || "—")}</div></label>
      <label class="field"><span class="muted">Vehicle number</span><div>${escapeHtml(v.vehicleNumber || "—")}</div></label>
      <label class="field field--full"><span class="muted">Make / Model</span><div><strong>${escapeHtml(makeModel || vehicleLabel(v) || "—")}</strong></div></label>
    </div>
    ${ownerBlock}
    <div class="muted" style="margin: 12px 0 4px; font-weight: 800">Before sale (Vehicle details)</div>
    <div class="formGrid" style="padding: 0">
      <label class="field"><span class="muted">Make</span><div>${escapeHtml(v.make || "—")}</div></label>
      <label class="field"><span class="muted">Model</span><div>${escapeHtml(v.model || "—")}</div></label>
      <label class="field"><span class="muted">Year</span><div>${v.year != null && v.year !== "" ? escapeHtml(String(v.year)) : "—"}</div></label>
      <label class="field"><span class="muted">Color</span><div>${escapeHtml(v.color || "—")}</div></label>
      <label class="field"><span class="muted">Type</span><div>${escapeHtml(v.vehicleType || "—")}</div></label>
      <label class="field"><span class="muted">Broker</span><div>${escapeHtml(v.brokerName || "—")}</div></label>
      <label class="field"><span class="muted">Country</span><div>${escapeHtml(v.countryOfOrigin || "—")}</div></label>
      <label class="field"><span class="muted">Mileage (km)</span><div>${v.mileageKm != null ? escapeHtml(String(v.mileageKm)) : "—"}</div></label>
      <label class="field"><span class="muted">Fuel</span><div>${escapeHtml(v.fuelType || "—")}</div></label>
      <label class="field"><span class="muted">Gear</span><div>${escapeHtml(v.gearSystem || "—")}</div></label>
      <label class="field"><span class="muted">Condition</span><div>${escapeHtml(v.vehicleCondition || "—")}</div></label>
      <label class="field"><span class="muted">Engine CC</span><div>${v.engineCc != null ? escapeHtml(String(v.engineCc)) : "—"}</div></label>
      <label class="field"><span class="muted">Cost price</span><div>${escapeHtml(formatMoney(v.costPrice))}</div></label>
      <label class="field"><span class="muted">Selling price</span><div>${escapeHtml(formatMoney(v.sellPrice))}</div></label>
      ${docsRowHtml}
      <label class="field"><span class="muted">Vehicle ID</span><div><span class="pill">${escapeHtml(v.id || "—")}</span></div></label>
    </div>
    ${leaseBlock}
    <label class="field field--full" style="margin-top: 12px"><span class="muted">Notes</span><div style="white-space: pre-wrap">${escapeHtml(v.notes || "—")}</div></label>
    <div class="muted" style="margin-top: 12px; font-weight: 700">System</div>
    <div class="formGrid" style="padding: 0">
      <label class="field"><span class="muted">Created</span><div>${v.createdAt ? escapeHtml(new Date(v.createdAt).toLocaleString()) : "—"}</div></label>
      <label class="field"><span class="muted">Updated</span><div>${v.updatedAt ? escapeHtml(new Date(v.updatedAt).toLocaleString()) : "—"}</div></label>
      ${
        v.status === "sold"
          ? `<label class="field field--full"><span class="muted">Sold at</span><div>${v.soldAt ? escapeHtml(new Date(v.soldAt).toLocaleString()) : "—"}</div></label>`
          : ""
      }
    </div>
    ${saleDetailsBlock}
    <div><span class="muted">Image</span>${imgHtml}</div>
  `;

  // store for footer actions
  openInventoryViewDialog.lastVehicleId = vehicleId;

  if (typeof dlg.showModal === "function") dlg.showModal();
}
openInventoryViewDialog.lastVehicleId = null;
openInventoryViewDialog.hideDocs = false;

function vehicleDocsCountForScope(v, scope) {
  const docs = Array.isArray(v?.docs) ? v.docs : [];
  return docs.filter((d) => String(d?.scope || "default") === scope).length;
}

/** In-app layout: hero image, Before sale (Docs), After sale (Sold docs). */
function openVehicleQuickViewDialog(vehicleId) {
  const v = getVehicleById(vehicleId);
  if (!v) {
    toast("Vehicle not found.");
    return;
  }
  const dlg = document.querySelector("#vehicleQuickViewDialog");
  if (!dlg || typeof dlg.showModal !== "function") return;

  vehicleQuickViewVehicleId = vehicleId;

  const imgWrap = document.querySelector("#vehicleQuickViewImageWrap");
  if (imgWrap) {
    if (v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")) {
      imgWrap.innerHTML = `<img src="${escapeAttr(v.imageDataUrl)}" alt="Vehicle" />`;
    } else {
      imgWrap.innerHTML = `<span class="muted">No image on file</span>`;
    }
  }

  const meta = document.querySelector("#vehicleQuickViewHeroMeta");
  if (meta) {
    const statusPill =
      v.status === "sold"
        ? `<span class="pill pill--warn" style="margin-left:8px">SOLD</span>`
        : `<span class="pill pill--ok" style="margin-left:8px">AVAILABLE</span>`;
    const title = `${escapeHtml(String(v.make || "").trim())} ${escapeHtml(String(v.model || "").trim())}`.trim() || escapeHtml(vehicleLabel(v) || "—");
    meta.innerHTML = `<div><strong>${escapeHtml(v.stockNo || "—")}</strong>${statusPill}</div>
      <div class="muted" style="margin-top:6px">${title}</div>
      <div class="muted" style="margin-top:4px">Vehicle no. · ${escapeHtml(v.vehicleNumber || "—")} · VIN · ${escapeHtml(v.vin || "—")}</div>
      <div style="margin-top:8px"><strong>${escapeHtml(formatMoney(v.sellPrice))}</strong> <span class="muted">asking</span></div>`;
  }

  const nDefault = vehicleDocsCountForScope(v, "default");
  const nSold = vehicleDocsCountForScope(v, "sold");
  const beforeHint = document.querySelector("#vehicleQuickViewBeforeHint");
  if (beforeHint) {
    beforeHint.textContent =
      nDefault > 0
        ? `${nDefault} document${nDefault === 1 ? "" : "s"} in Docs (inventory / before sale).`
        : "No documents in Docs yet. Use Docs to upload ownership, book copy, etc.";
  }

  const afterHint = document.querySelector("#vehicleQuickViewAfterHint");
  const btnSoldDocs = document.querySelector("#btnVehicleQuickViewSoldDocs");
  const isSold = v.status === "sold";
  if (afterHint) {
    if (isSold) {
      const sale =
        (v.saleId && (db.sales || []).find((s) => s.id === v.saleId)) ||
        (db.sales || []).find((s) => (s.items || []).some((it) => it.vehicleId === v.id)) ||
        null;
      const inv = sale?.invoiceNo || "—";
      const cust = sale?.customer?.name || "Walk-in";
      afterHint.textContent = `Invoice ${inv} · ${cust}. ${nSold > 0 ? `${nSold} Sold doc${nSold === 1 ? "" : "s"}.` : "No Sold docs yet."}`;
    } else {
      afterHint.textContent = "Not sold yet. Sold docs are for paperwork after the sale.";
    }
  }
  if (btnSoldDocs) {
    btnSoldDocs.disabled = !isSold;
    btnSoldDocs.title = isSold ? "Open sold-vehicle documents" : "Available after the vehicle is sold";
    if (isSold) {
      btnSoldDocs.classList.remove("btn--table-muted");
      btnSoldDocs.classList.add("btn--table-primary");
    } else {
      btnSoldDocs.classList.add("btn--table-muted");
      btnSoldDocs.classList.remove("btn--table-primary");
    }
  }

  const btnDocs = document.querySelector("#btnVehicleQuickViewDocs");
  if (btnDocs) {
    btnDocs.disabled = false;
    btnDocs.title = "Inventory / before-sale documents";
    btnDocs.classList.remove("btn--table-muted");
  }

  dlg.showModal();
}

function closeVehicleQuickViewDialog() {
  document.querySelector("#vehicleQuickViewDialog")?.close();
  vehicleQuickViewVehicleId = null;
}

function openVehicleSearchPickDialog(vehicles, queryLabel) {
  const dlg = document.querySelector("#vehicleSearchPickDialog");
  const tbody = document.querySelector("#vehicleSearchPickTableBody");
  const sum = document.querySelector("#vehicleSearchPickSummary");
  if (!dlg || !tbody || typeof dlg.showModal !== "function") return;
  if (sum) {
    sum.textContent = `Search: ${queryLabel} · ${vehicles.length} match${vehicles.length === 1 ? "" : "es"} — open Quick view for one vehicle.`;
  }
  tbody.innerHTML = "";
  for (const v of vehicles.slice(0, 100)) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span class="pill">${escapeHtml(v.stockNo || "—")}</span></td>
      <td>${escapeHtml(v.vehicleNumber || "—")}</td>
      <td>${escapeHtml(vehicleLabel(v) || "—")}</td>
      <td class="actions"></td>
    `;
    const td = tr.querySelector(".actions");
    const btn = mkBtn("Quick view", "btn btn--table btn--table-primary btn--table-compact");
    btn.addEventListener("click", () => {
      dlg.close();
      openVehicleQuickViewDialog(v.id);
    });
    td.appendChild(btn);
    tbody.appendChild(tr);
  }
  dlg.showModal();
}

function openHomeVehicleSearchResultsWindow() {
  const input = document.querySelector("#homeVehicleSearch");
  if (!input) return;
  const qRaw = String(input.value || "").trim();
  const q = qRaw.toLowerCase();
  if (!q) {
    toast("Type Stock No or Vehicle Number.");
    return;
  }
  const matches = (db.vehicles || []).filter(
    (v) =>
      String(v.stockNo || "").toLowerCase().includes(q) || String(v.vehicleNumber || "").toLowerCase().includes(q)
  );
  const summaryEl = document.querySelector("#homeVehicleSearchSummary");
  if (!matches.length) {
    if (summaryEl) summaryEl.textContent = "No vehicle found.";
    toast("No vehicle found.");
    return;
  }
  if (summaryEl) {
    summaryEl.textContent = `${matches.length} result${matches.length === 1 ? "" : "s"} — Quick view opened${matches.length === 1 ? "" : "; pick a row below."}.`;
  }
  if (matches.length === 1) {
    openVehicleQuickViewDialog(matches[0].id);
    return;
  }
  openVehicleSearchPickDialog(matches, qRaw);
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

  // Only show inventory types that have AVAILABLE vehicles (avoid showing sold-only types).
  const availableVehicles = (Array.isArray(db.vehicles) ? db.vehicles : []).filter((v) => v.status === "available");
  const types = new Set();
  for (const v of availableVehicles) types.add(inventoryTypeKey(v.vehicleType));
  // Keep any explicitly saved settings, but only if that type exists in available stock.
  for (const k of Object.keys(typeSettings || {})) {
    if (types.has(k)) types.add(k);
  }

  const sortedTypes = Array.from(types).sort((a, b) => a.localeCompare(b));

  let totalOnHandCount = 0;
  let totalCost = 0;
  let totalSell = 0;

  for (const type of sortedTypes) {
    const onHand = availableVehicles.filter((v) => inventoryTypeKey(v.vehicleType) === type);
    const stockOnHandCount = onHand.length;
    if (!stockOnHandCount) continue;

    const totalCostPrice = onHand.reduce((s, v) => s + safeNumber(v.costPrice, 0), 0);
    const totalSellingPrice = onHand.reduce((s, v) => s + safeNumber(v.sellPrice, 0), 0);

    totalOnHandCount += stockOnHandCount;
    totalCost += totalCostPrice;
    totalSell += totalSellingPrice;
    const iconId = inventoryTypeIconId(type);
    tbody.innerHTML += `
      <tr>
        <td>
          <div class="row" style="gap:10px;align-items:center;justify-content:space-between;">
            <span class="invTypeCell"><svg class="invTypeIcon" aria-hidden="true"><use href="#${escapeAttr(iconId)}" /></svg>${escapeHtml(type)}</span>
            <button type="button" class="btn btn--table btn--table-compact" data-inv-type-details="${escapeAttr(type)}">Details</button>
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

  const rowsShown = tbody.querySelectorAll("tr").length;
  $("#inventoryReportsSummary").textContent = `${rowsShown} type${rowsShown === 1 ? "" : "s"}`;

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

function inventoryTypeIconId(typeKey) {
  const t = String(typeKey || "").trim().toLowerCase();
  if (t === "car") return "i-type-car";
  if (t === "van") return "i-type-van";
  if (t === "bus") return "i-type-bus";
  if (t === "truck") return "i-type-truck";
  if (t === "lorry" || t === "lorries") return "i-type-truck";
  if (t === "pickup") return "i-type-pickup";
  if (t === "bike" || t === "motorbike" || t === "motorcycle") return "i-type-bike";
  if (t === "three wheeler" || t === "three-wheeler" || t === "threewheeler" || t === "tuk tuk" || t === "tuktuk") return "i-type-threewheeler";
  return "i-type-other";
}

function appCopyrightText() {
  const year = new Date().getFullYear();
  // Requirement: use the app developer/company name (not the business/company info).
  const developerName = "E-Inventory";
  return `© ${year} ${developerName}. All rights reserved.`;
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
/** When set, saving the purchase form updates this record (and linked inventory row). */
let editingPurchaseId = null;
/** When set, View dialog Download exports this purchase. */
let viewingPurchaseId = null;

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

function getPurchaseImageDataUrlForSave() {
  if (pendingPurchaseImageDataUrl) return pendingPurchaseImageDataUrl;
  const wrap = document.querySelector("#purchaseImagePreviewWrap");
  const img = document.querySelector("#purchaseImagePreview");
  if (wrap && wrap.hidden) return "";
  const src = img?.src ? String(img.src).trim() : "";
  if (src.startsWith("data:image/")) return src;
  return "";
}

function exportPurchaseDetailsCsv(purchaseId) {
  if (!isAdmin()) {
    toast("Only admin can export purchases.");
    return;
  }
  const p = (Array.isArray(db.purchases) ? db.purchases : []).find((x) => x.id === purchaseId);
  if (!p) {
    toast("Purchase not found.");
    return;
  }
  const v = purchaseRecordVehicle(p);
  const headers = [
    "purchase_id",
    "created_at",
    "purchase_date",
    "source",
    "party_name",
    "vehicle_id",
    "stock_no",
    "vin",
    "make",
    "model",
    "year",
    "color",
    "vehicle_number",
    "vehicle_type",
    "broker_name",
    "country_of_origin",
    "mileage_km",
    "fuel_type",
    "gear_system",
    "vehicle_condition",
    "engine_cc",
    "cost_price",
    "sell_price",
    "owner_type",
    "owner_first_name",
    "owner_second_name",
    "leasing_status",
    "leasing_company",
    "lease_amount",
    "lease_balance_amount",
    "lease_period",
    "lease_balance_period",
    "notes",
  ];
  const esc = (x) => `"${String(x ?? "").replaceAll('"', '""')}"`;
  const row = [
    esc(p.id),
    esc(p.createdAt || ""),
    esc(p.purchaseDate || ""),
    esc(p.source || ""),
    esc(p.partyName || ""),
    esc(v.id || ""),
    esc(v.stockNo || ""),
    esc(v.vin || ""),
    esc(v.make || ""),
    esc(v.model || ""),
    esc(v.year ?? ""),
    esc(v.color || ""),
    esc(v.vehicleNumber || ""),
    esc(v.vehicleType || ""),
    esc(v.brokerName || ""),
    esc(v.countryOfOrigin || ""),
    esc(v.mileageKm ?? ""),
    esc(v.fuelType || ""),
    esc(v.gearSystem || ""),
    esc(v.vehicleCondition || ""),
    esc(v.engineCc ?? ""),
    esc(v.costPrice ?? 0),
    esc(v.sellPrice ?? 0),
    esc(v.ownerType || ""),
    esc(v.ownerFirstName || ""),
    esc(v.ownerSecondName || ""),
    esc(v.leasingStatus || ""),
    esc(v.leasingCompany || ""),
    esc(v.leaseAmount ?? 0),
    esc(v.leaseBalanceAmount ?? 0),
    esc(v.leasePeriod || ""),
    esc(v.leaseBalancePeriod || ""),
    esc(v.notes || ""),
  ].join(",");
  const csv = `${headers.join(",")}\n${row}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stock = String(v.stockNo || "purchase").trim().replaceAll(/[^\w\-]+/g, "-");
  const date = String(p.purchaseDate || todayISODate()).trim();
  a.href = url;
  a.download = `purchase-${stock}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Purchase details downloaded.");
}

/** Print layout opened in a new window; user picks “Save as PDF” / “Microsoft Print to PDF”. */
function exportPurchaseDetailsPdf(purchaseId) {
  if (!isAdmin()) {
    toast("Only admin can export purchases.");
    return;
  }
  const p = (Array.isArray(db.purchases) ? db.purchases : []).find((x) => x.id === purchaseId);
  if (!p) {
    toast("Purchase not found.");
    return;
  }
  const v = purchaseRecordVehicle(p);
  const company = String(db.meta?.companyName || "").trim() || "E-Inventory";
  const owner = vehicleOwnerDisplayName(v);
  const showLease =
    String(v.leasingStatus || "") === "Yes" ||
    (v.leasingCompany && String(v.leasingCompany).trim()) ||
    Number(v.leaseAmount) > 0 ||
    Number(v.leaseBalanceAmount) > 0 ||
    (v.leasePeriod && String(v.leasePeriod).trim()) ||
    (v.leaseBalancePeriod && String(v.leaseBalancePeriod).trim());
  const leaseHtml = showLease
    ? `<h2>Leasing</h2>
       <table>
         <tr><th>Status</th><td>${escapeHtml(v.leasingStatus || "—")}</td></tr>
         <tr><th>Company</th><td>${escapeHtml(v.leasingCompany || "—")}</td></tr>
         <tr><th>Lease amount</th><td>${escapeHtml(formatMoney(v.leaseAmount ?? 0))}</td></tr>
         <tr><th>Lease balance</th><td>${escapeHtml(formatMoney(v.leaseBalanceAmount ?? 0))}</td></tr>
         <tr><th>Period</th><td>${escapeHtml(v.leasePeriod || "—")}</td></tr>
         <tr><th>Balance period</th><td>${escapeHtml(v.leaseBalancePeriod || "—")}</td></tr>
       </table>`
    : "";
  const ownerHtml =
    owner || v.ownerType
      ? `<h2>Owner</h2>
         <table>
           <tr><th>Type</th><td>${escapeHtml(v.ownerType || "—")}</td></tr>
           <tr><th>Name</th><td>${escapeHtml(owner || "—")}</td></tr>
         </table>`
      : "";
  const imgHtml =
    v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")
      ? `<h2>Vehicle image</h2><div class="imgwrap"><img src="${escapeAttr(v.imageDataUrl)}" alt="Vehicle" /></div>`
      : `<p class="muted">No vehicle image on file.</p>`;
  const inner = `
    <div class="muted" style="margin-bottom:16px">${escapeHtml(company)}</div>
    <h1>Purchase details</h1>
    <p class="muted">Purchase ID: ${escapeHtml(p.id || "—")} · Recorded: ${escapeHtml(p.createdAt || "—")}</p>

    <h2>Purchase</h2>
    <table>
      <tr><th>Purchase date</th><td>${escapeHtml(p.purchaseDate || "—")}</td></tr>
      <tr><th>Source</th><td>${escapeHtml(p.source || "—")}</td></tr>
      <tr><th>Party</th><td>${escapeHtml(p.partyName || "—")}</td></tr>
      <tr><th>Stock No.</th><td>${escapeHtml(v.stockNo || "—")}</td></tr>
    </table>

    ${ownerHtml}

    <h2>Vehicle</h2>
    <table>
      <tr><th>Description</th><td><strong>${escapeHtml(vehicleLabel(v) || "—")}</strong></td></tr>
      <tr><th>VIN / Chassis</th><td>${escapeHtml(v.vin || "—")}</td></tr>
      <tr><th>Vehicle number</th><td>${escapeHtml(v.vehicleNumber || "—")}</td></tr>
      <tr><th>Color</th><td>${escapeHtml(v.color || "—")}</td></tr>
      <tr><th>Type</th><td>${escapeHtml(v.vehicleType || "—")}</td></tr>
      <tr><th>Broker (vehicle)</th><td>${escapeHtml(v.brokerName || "—")}</td></tr>
      <tr><th>Country of origin</th><td>${escapeHtml(v.countryOfOrigin || "—")}</td></tr>
      <tr><th>Mileage (km)</th><td>${v.mileageKm != null ? escapeHtml(String(v.mileageKm)) : "—"}</td></tr>
      <tr><th>Fuel</th><td>${escapeHtml(v.fuelType || "—")}</td></tr>
      <tr><th>Gear</th><td>${escapeHtml(v.gearSystem || "—")}</td></tr>
      <tr><th>Condition</th><td>${escapeHtml(v.vehicleCondition || "—")}</td></tr>
      <tr><th>Engine CC</th><td>${v.engineCc != null ? escapeHtml(String(v.engineCc)) : "—"}</td></tr>
      <tr><th>Cost price</th><td>${escapeHtml(formatMoney(v.costPrice))}</td></tr>
      <tr><th>Selling price</th><td>${escapeHtml(formatMoney(v.sellPrice))}</td></tr>
      <tr><th>Vehicle record ID</th><td>${escapeHtml(v.id || "—")}</td></tr>
    </table>

    ${leaseHtml}

    <h2>Notes</h2>
    <p style="white-space:pre-wrap;margin:0">${escapeHtml(v.notes || "—")}</p>

    ${imgHtml}
  `;
  const docTitle = `Purchase-${String(v.stockNo || p.id || "record").trim().replaceAll(/[^\w\-]+/g, "-")}`;
  const w = window.open("", "_blank");
  if (!w) {
    toast("Popup blocked. Allow popups to print / save PDF.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(docTitle)}</title>
    <style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;padding:20px;color:#111;max-width:900px;margin:0 auto}
      h1{font-size:22px;margin:0 0 6px}
      h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
      .muted{color:#666;font-size:13px}
      table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}
      th,td{border:1px solid #e6e6e6;padding:8px;text-align:left;vertical-align:top}
      th{width:34%;background:#f6f6f6;font-weight:600}
      .imgwrap{margin-top:10px}
      .imgwrap img{max-width:100%;max-height:400px;height:auto;display:block}
      @media print{body{padding:0}}
    </style></head><body>${inner}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
  toast("Print dialog opened — choose Save as PDF (or Microsoft Print to PDF).");
}

let pendingCustomerPhotoDataUrl = "";
let pendingCustomerIdFrontDataUrl = "";
let pendingCustomerIdBackDataUrl = "";
let customerWebcamStream = null;
let customerWebcamTarget = "photo"; // photo | idFront | idBack

/** Print layout opened in a new window; user picks “Save as PDF” / “Microsoft Print to PDF”. */
function exportVehicleDetailsPdf(vehicleId) {
  const v = getVehicleById(vehicleId);
  if (!v) {
    toast("Vehicle not found.");
    return;
  }

  const company = String(db.meta?.companyName || "").trim() || "E-Inventory";
  const owner = vehicleOwnerDisplayName(v);
  const findSaleForVehicle = (vid) => {
    if (!vid) return null;
    const byId = v.saleId ? (db.sales || []).find((s) => s.id === v.saleId) : null;
    if (byId) return byId;
    return (db.sales || []).find((s) => (s.items || []).some((it) => it.vehicleId === vid)) || null;
  };
  const sale = v.status === "sold" ? findSaleForVehicle(v.id) : null;
  const saleItem = sale ? (sale.items || []).find((it) => it.vehicleId === v.id) || null : null;

  const showLease =
    String(v.leasingStatus || "") === "Yes" ||
    (v.leasingCompany && String(v.leasingCompany).trim()) ||
    Number(v.leaseAmount) > 0 ||
    Number(v.leaseBalanceAmount) > 0 ||
    (v.leasePeriod && String(v.leasePeriod).trim()) ||
    (v.leaseBalancePeriod && String(v.leaseBalancePeriod).trim());

  const ownerHtml =
    owner || v.ownerType
      ? `<h2>Owner</h2>
         <table>
           <tr><th>Type</th><td>${escapeHtml(v.ownerType || "—")}</td></tr>
           <tr><th>Name</th><td>${escapeHtml(owner || "—")}</td></tr>
         </table>`
      : "";

  const leaseHtml = showLease
    ? `<h2>Leasing</h2>
       <table>
         <tr><th>Status</th><td>${escapeHtml(v.leasingStatus || "—")}</td></tr>
         <tr><th>Company</th><td>${escapeHtml(v.leasingCompany || "—")}</td></tr>
         <tr><th>Lease amount</th><td>${escapeHtml(formatMoney(v.leaseAmount ?? 0))}</td></tr>
         <tr><th>Lease balance</th><td>${escapeHtml(formatMoney(v.leaseBalanceAmount ?? 0))}</td></tr>
         <tr><th>Period</th><td>${escapeHtml(v.leasePeriod || "—")}</td></tr>
         <tr><th>Balance period</th><td>${escapeHtml(v.leaseBalancePeriod || "—")}</td></tr>
       </table>`
    : "";

  const imgHtml =
    v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")
      ? `<h2>Vehicle image</h2><div class="imgwrap"><img src="${escapeAttr(v.imageDataUrl)}" alt="Vehicle" /></div>`
      : `<p class="muted">No vehicle image on file.</p>`;

  const docsCount = Array.isArray(v.docs) ? v.docs.length : 0;
  const makeModel = `${String(v.make || "").trim()} ${String(v.model || "").trim()}`.trim();

  const afterSaleHtml = sale
    ? (() => {
        const createdAt = sale.createdAt ? new Date(sale.createdAt).toLocaleString() : "—";
        const invoiceNo = sale.invoiceNo || "—";
        const custName = sale.customer?.name || "Walk-in";
        const custPhone = sale.customer?.phone || "—";
        const paymentMethod = sale.paymentMethod || "—";
        const soldBy = sale.soldBy ? sale.soldBy.name || sale.soldBy.username || "" : "";
        const soldPrice = saleItem ? safeNumber(saleItem.sellPrice, 0) : safeNumber(v.sellPrice, 0);
        const total = safeNumber(sale.total, soldPrice);
        const paid = Math.max(0, safeNumber(sale.paidAmount, total));
        const balance = Math.max(0, total - paid);
        const remarks = String(sale.remarks || "").trim();
        const doc = sale.documents || {};
        const docLine = [
          doc.originalCr ? "ORIGINAL CR" : "",
          doc.noObjectionLetter ? "NO OBJECTION LETTER" : "",
          doc.deletion ? "DELETION" : "",
          doc.revenueLicence ? "REVENUE LICENCE" : "",
        ]
          .filter(Boolean)
          .join(", ");
        const others = String(doc.others || "").trim();
        const docsText = [docLine, others ? `OTHERS: ${others}` : ""].filter(Boolean).join(" · ") || "—";
        return `
          <h2>After sale (Sale details)</h2>
          <table>
            <tr><th>Invoice no.</th><td>${escapeHtml(invoiceNo)}</td></tr>
            <tr><th>Sold at</th><td>${escapeHtml(createdAt)}</td></tr>
            <tr><th>Customer</th><td><strong>${escapeHtml(custName)}</strong></td></tr>
            <tr><th>Phone</th><td>${escapeHtml(custPhone)}</td></tr>
            <tr><th>Payment</th><td>${escapeHtml(paymentMethod)}</td></tr>
            <tr><th>Sold by</th><td>${escapeHtml(soldBy || "—")}</td></tr>
            <tr><th>Sold price</th><td><strong>${escapeHtml(formatMoney(soldPrice))}</strong></td></tr>
            <tr><th>Invoice total</th><td>${escapeHtml(formatMoney(total))}</td></tr>
            <tr><th>Paid</th><td>${escapeHtml(formatMoney(paid))}</td></tr>
            <tr><th>Balance</th><td>${escapeHtml(formatMoney(balance))}</td></tr>
            <tr><th>Invoice documents</th><td>${escapeHtml(docsText)}</td></tr>
          </table>
          ${remarks ? `<h2>Remarks</h2><p style="white-space:pre-wrap;margin:0">${escapeHtml(remarks)}</p>` : ""}
        `;
      })()
    : v.status === "sold"
      ? `<h2>After sale (Sale details)</h2><p class="muted" style="margin:0">Sale record not found for this vehicle.</p>`
      : "";

  const inner = `
    <div class="muted" style="margin-bottom:16px">${escapeHtml(company)}</div>
    <h1>Vehicle details</h1>
    <p class="muted">Vehicle ID: ${escapeHtml(v.id || "—")} · Stock: ${escapeHtml(v.stockNo || "—")}</p>

    <h2>Before sale (Vehicle details)</h2>
    <table>
      <tr><th>Stock No.</th><td><strong>${escapeHtml(v.stockNo || "—")}</strong></td></tr>
      <tr><th>Status</th><td>${escapeHtml(v.status || "—")}</td></tr>
      <tr><th>VIN / Chassis</th><td>${escapeHtml(v.vin || "—")}</td></tr>
      <tr><th>Make</th><td>${escapeHtml(v.make || "—")}</td></tr>
      <tr><th>Model</th><td>${escapeHtml(v.model || "—")}</td></tr>
      <tr><th>Make / Model</th><td><strong>${escapeHtml(makeModel || vehicleLabel(v) || "—")}</strong></td></tr>
      <tr><th>Year</th><td>${v.year != null && v.year !== "" ? escapeHtml(String(v.year)) : "—"}</td></tr>
      <tr><th>Color</th><td>${escapeHtml(v.color || "—")}</td></tr>
      <tr><th>Vehicle number</th><td>${escapeHtml(v.vehicleNumber || "—")}</td></tr>
      <tr><th>Type</th><td>${escapeHtml(v.vehicleType || "—")}</td></tr>
      <tr><th>Broker</th><td>${escapeHtml(v.brokerName || "—")}</td></tr>
      <tr><th>Country of origin</th><td>${escapeHtml(v.countryOfOrigin || "—")}</td></tr>
      <tr><th>Mileage (km)</th><td>${v.mileageKm != null ? escapeHtml(String(v.mileageKm)) : "—"}</td></tr>
      <tr><th>Fuel</th><td>${escapeHtml(v.fuelType || "—")}</td></tr>
      <tr><th>Gear</th><td>${escapeHtml(v.gearSystem || "—")}</td></tr>
      <tr><th>Condition</th><td>${escapeHtml(v.vehicleCondition || "—")}</td></tr>
      <tr><th>Engine CC</th><td>${v.engineCc != null ? escapeHtml(String(v.engineCc)) : "—"}</td></tr>
      <tr><th>Cost price</th><td>${escapeHtml(formatMoney(v.costPrice))}</td></tr>
      <tr><th>Selling price</th><td>${escapeHtml(formatMoney(v.sellPrice))}</td></tr>
      <tr><th>Docs</th><td>${escapeHtml(String(docsCount))}</td></tr>
    </table>

    ${ownerHtml}
    ${leaseHtml}

    ${afterSaleHtml}

    <h2>Notes</h2>
    <p style="white-space:pre-wrap;margin:0">${escapeHtml(v.notes || "—")}</p>

    <h2>System</h2>
    <table>
      <tr><th>Created</th><td>${v.createdAt ? escapeHtml(new Date(v.createdAt).toLocaleString()) : "—"}</td></tr>
      <tr><th>Updated</th><td>${v.updatedAt ? escapeHtml(new Date(v.updatedAt).toLocaleString()) : "—"}</td></tr>
      ${v.status === "sold" ? `<tr><th>Sold at</th><td>${v.soldAt ? escapeHtml(new Date(v.soldAt).toLocaleString()) : "—"}</td></tr>` : ""}
    </table>

    ${imgHtml}
  `;

  const docTitle = `Vehicle-${String(v.stockNo || v.id || "record").trim().replaceAll(/[^\w\-]+/g, "-")}`;
  const w = window.open("", "_blank");
  if (!w) {
    toast("Popup blocked. Allow popups to print / save PDF.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(docTitle)}</title>
    <style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;padding:20px;color:#111;max-width:900px;margin:0 auto}
      h1{font-size:22px;margin:0 0 6px}
      h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
      .muted{color:#666;font-size:13px}
      table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}
      th,td{border:1px solid #e6e6e6;padding:8px;text-align:left;vertical-align:top}
      th{width:34%;background:#f6f6f6;font-weight:600}
      .imgwrap{margin-top:10px}
      .imgwrap img{max-width:100%;max-height:400px;height:auto;display:block}
      @media print{body{padding:0}}
    </style></head><body>${inner}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
  toast("Print dialog opened — choose Save as PDF (or Microsoft Print to PDF).");
}

let pendingBrokerPhotoDataUrl = "";
let brokerWebcamStream = null;

function setBrokerPhotoPreview(dataUrl) {
  const wrap = document.querySelector("#brokerPhotoPreviewWrap");
  const img = document.querySelector("#brokerPhotoPreview");
  if (!wrap || !img) return;
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
}

function clearBrokerPhotoPreview() {
  pendingBrokerPhotoDataUrl = "";
  const input = document.querySelector("#brokerPhotoInput");
  if (input) input.value = "";
  setBrokerPhotoPreview("");
}

function getBrokerPhotoDataUrlForSave() {
  if (pendingBrokerPhotoDataUrl) return pendingBrokerPhotoDataUrl;
  const wrap = document.querySelector("#brokerPhotoPreviewWrap");
  const img = document.querySelector("#brokerPhotoPreview");
  if (wrap && wrap.hidden) return "";
  return img?.src || "";
}

async function startBrokerWebcam() {
  const dlg = document.querySelector("#brokerWebcamDialog");
  const video = document.querySelector("#brokerWebcamVideo");
  if (!dlg || !video) return;
  try {
    if (brokerWebcamStream) stopBrokerWebcam();
    brokerWebcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = brokerWebcamStream;
    if (typeof dlg.showModal === "function") dlg.showModal();
  } catch {
    toast("Camera not available or permission denied.");
  }
}

function stopBrokerWebcam() {
  const video = document.querySelector("#brokerWebcamVideo");
  if (video) video.srcObject = null;
  if (brokerWebcamStream) {
    brokerWebcamStream.getTracks().forEach((t) => t.stop());
    brokerWebcamStream = null;
  }
}

function captureBrokerWebcam() {
  const video = document.querySelector("#brokerWebcamVideo");
  const canvas = document.querySelector("#brokerWebcamCanvas");
  if (!video || !canvas) return;
  const w = video.videoWidth || 0;
  const h = video.videoHeight || 0;
  if (!w || !h) {
    toast("Webcam not ready yet.");
    return;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  pendingBrokerPhotoDataUrl = dataUrl;
  setBrokerPhotoPreview(dataUrl);
  stopBrokerWebcam();
  document.querySelector("#brokerWebcamDialog")?.close();
  toast("Broker photo captured.");
}

let pendingSupplierPhotoDataUrl = "";
let supplierWebcamStream = null;
let pendingSupplierIdFrontDataUrl = "";
let pendingSupplierIdBackDataUrl = "";

function setSupplierPhotoPreview(dataUrl) {
  const wrap = document.querySelector("#supplierPhotoPreviewWrap");
  const img = document.querySelector("#supplierPhotoPreview");
  if (!wrap || !img) return;
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
}

function clearSupplierPhotoPreview() {
  pendingSupplierPhotoDataUrl = "";
  const input = document.querySelector("#supplierPhotoInput");
  if (input) input.value = "";
  setSupplierPhotoPreview("");
}

function setSupplierIdFrontPreview(dataUrl) {
  const wrap = document.querySelector("#supplierIdFrontPreviewWrap");
  const img = document.querySelector("#supplierIdFrontPreview");
  const view = document.querySelector("#supplierIdFrontView");
  const dl = document.querySelector("#supplierIdFrontDownload");
  if (!wrap || !img) return;
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    if (view) view.href = "#";
    if (dl) dl.href = "#";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
  if (view) view.href = dataUrl;
  if (dl) dl.href = dataUrl;
}

function setSupplierIdBackPreview(dataUrl) {
  const wrap = document.querySelector("#supplierIdBackPreviewWrap");
  const img = document.querySelector("#supplierIdBackPreview");
  const view = document.querySelector("#supplierIdBackView");
  const dl = document.querySelector("#supplierIdBackDownload");
  if (!wrap || !img) return;
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    if (view) view.href = "#";
    if (dl) dl.href = "#";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
  if (view) view.href = dataUrl;
  if (dl) dl.href = dataUrl;
}

function clearSupplierIdFrontPreview() {
  pendingSupplierIdFrontDataUrl = "";
  const input = document.querySelector("#supplierIdFrontInput");
  if (input) input.value = "";
  setSupplierIdFrontPreview("");
}

function clearSupplierIdBackPreview() {
  pendingSupplierIdBackDataUrl = "";
  const input = document.querySelector("#supplierIdBackInput");
  if (input) input.value = "";
  setSupplierIdBackPreview("");
}

function getSupplierPhotoDataUrlForSave() {
  if (pendingSupplierPhotoDataUrl) return pendingSupplierPhotoDataUrl;
  const wrap = document.querySelector("#supplierPhotoPreviewWrap");
  const img = document.querySelector("#supplierPhotoPreview");
  if (wrap && wrap.hidden) return "";
  return img?.src || "";
}

function getSupplierIdFrontDataUrlForSave() {
  if (pendingSupplierIdFrontDataUrl) return pendingSupplierIdFrontDataUrl;
  const wrap = document.querySelector("#supplierIdFrontPreviewWrap");
  const img = document.querySelector("#supplierIdFrontPreview");
  if (wrap && wrap.hidden) return "";
  return img?.src || "";
}

function getSupplierIdBackDataUrlForSave() {
  if (pendingSupplierIdBackDataUrl) return pendingSupplierIdBackDataUrl;
  const wrap = document.querySelector("#supplierIdBackPreviewWrap");
  const img = document.querySelector("#supplierIdBackPreview");
  if (wrap && wrap.hidden) return "";
  return img?.src || "";
}

async function startSupplierWebcam() {
  const dlg = document.querySelector("#supplierWebcamDialog");
  const video = document.querySelector("#supplierWebcamVideo");
  if (!dlg || !video) return;
  try {
    if (supplierWebcamStream) stopSupplierWebcam();
    supplierWebcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = supplierWebcamStream;
    if (typeof dlg.showModal === "function") dlg.showModal();
  } catch {
    toast("Camera not available or permission denied.");
  }
}

function stopSupplierWebcam() {
  const video = document.querySelector("#supplierWebcamVideo");
  if (video) video.srcObject = null;
  if (supplierWebcamStream) {
    supplierWebcamStream.getTracks().forEach((t) => t.stop());
    supplierWebcamStream = null;
  }
}

function captureSupplierWebcam() {
  const video = document.querySelector("#supplierWebcamVideo");
  const canvas = document.querySelector("#supplierWebcamCanvas");
  if (!video || !canvas) return;
  const w = video.videoWidth || 0;
  const h = video.videoHeight || 0;
  if (!w || !h) {
    toast("Webcam not ready yet.");
    return;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  pendingSupplierPhotoDataUrl = dataUrl;
  setSupplierPhotoPreview(dataUrl);
  stopSupplierWebcam();
  document.querySelector("#supplierWebcamDialog")?.close();
  toast("Supplier photo captured.");
}

function setCustomerPhotoPreview(dataUrl) {
  const wrap = document.querySelector("#customerPhotoPreviewWrap");
  const img = document.querySelector("#customerPhotoPreview");
  if (!wrap || !img) return;
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
}

function clearCustomerPhotoPreview() {
  pendingCustomerPhotoDataUrl = "";
  const input = document.querySelector("#customerPhotoInput");
  if (input) input.value = "";
  setCustomerPhotoPreview("");
}

function setCustomerIdFrontPreview(dataUrl) {
  const wrap = document.querySelector("#customerIdFrontPreviewWrap");
  const img = document.querySelector("#customerIdFrontPreview");
  const view = document.querySelector("#customerIdFrontView");
  const dl = document.querySelector("#customerIdFrontDownload");
  if (!wrap || !img) return;
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    if (view) view.href = "#";
    if (dl) dl.href = "#";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
  if (view) view.href = dataUrl;
  if (dl) dl.href = dataUrl;
}

function setCustomerIdBackPreview(dataUrl) {
  const wrap = document.querySelector("#customerIdBackPreviewWrap");
  const img = document.querySelector("#customerIdBackPreview");
  const view = document.querySelector("#customerIdBackView");
  const dl = document.querySelector("#customerIdBackDownload");
  if (!wrap || !img) return;
  if (!dataUrl) {
    wrap.hidden = true;
    img.src = "";
    if (view) view.href = "#";
    if (dl) dl.href = "#";
    return;
  }
  img.src = dataUrl;
  wrap.hidden = false;
  if (view) view.href = dataUrl;
  if (dl) dl.href = dataUrl;
}

function clearCustomerIdFrontPreview() {
  pendingCustomerIdFrontDataUrl = "";
  const input = document.querySelector("#customerIdFrontInput");
  if (input) input.value = "";
  setCustomerIdFrontPreview("");
}

function clearCustomerIdBackPreview() {
  pendingCustomerIdBackDataUrl = "";
  const input = document.querySelector("#customerIdBackInput");
  if (input) input.value = "";
  setCustomerIdBackPreview("");
}

function getCustomerPhotoDataUrlForSave() {
  if (pendingCustomerPhotoDataUrl) return pendingCustomerPhotoDataUrl;
  const wrap = document.querySelector("#customerPhotoPreviewWrap");
  const img = document.querySelector("#customerPhotoPreview");
  if (wrap && wrap.hidden) return "";
  return img?.src || "";
}

function getCustomerIdFrontDataUrlForSave() {
  if (pendingCustomerIdFrontDataUrl) return pendingCustomerIdFrontDataUrl;
  const wrap = document.querySelector("#customerIdFrontPreviewWrap");
  const img = document.querySelector("#customerIdFrontPreview");
  if (wrap && wrap.hidden) return "";
  return img?.src || "";
}

function getCustomerIdBackDataUrlForSave() {
  if (pendingCustomerIdBackDataUrl) return pendingCustomerIdBackDataUrl;
  const wrap = document.querySelector("#customerIdBackPreviewWrap");
  const img = document.querySelector("#customerIdBackPreview");
  if (wrap && wrap.hidden) return "";
  return img?.src || "";
}

async function startCustomerWebcam(target = "photo") {
  customerWebcamTarget = target;
  const dlg = document.querySelector("#customerWebcamDialog");
  const video = document.querySelector("#customerWebcamVideo");
  const title = document.querySelector("#customerWebcamTitle");
  if (!dlg || !video) return;
  if (title) {
    title.textContent =
      target === "idFront" ? "Capture ID copy (front)" : target === "idBack" ? "Capture ID copy (back)" : "Take customer photo";
  }
  try {
    if (customerWebcamStream) stopCustomerWebcam();
    customerWebcamStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = customerWebcamStream;
    if (typeof dlg.showModal === "function") dlg.showModal();
  } catch {
    toast("Camera not available or permission denied.");
  }
}

function stopCustomerWebcam() {
  const video = document.querySelector("#customerWebcamVideo");
  if (video) video.srcObject = null;
  if (customerWebcamStream) {
    customerWebcamStream.getTracks().forEach((t) => t.stop());
    customerWebcamStream = null;
  }
}

function captureCustomerWebcam() {
  const video = document.querySelector("#customerWebcamVideo");
  const canvas = document.querySelector("#customerWebcamCanvas");
  if (!video || !canvas) return;
  const w = video.videoWidth || 0;
  const h = video.videoHeight || 0;
  if (!w || !h) {
    toast("Webcam not ready yet.");
    return;
  }
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  if (customerWebcamTarget === "idFront") {
    pendingCustomerIdFrontDataUrl = dataUrl;
    setCustomerIdFrontPreview(dataUrl);
  } else if (customerWebcamTarget === "idBack") {
    pendingCustomerIdBackDataUrl = dataUrl;
    setCustomerIdBackPreview(dataUrl);
  } else {
    pendingCustomerPhotoDataUrl = dataUrl;
    setCustomerPhotoPreview(dataUrl);
  }
  stopCustomerWebcam();
  document.querySelector("#customerWebcamDialog")?.close();
  toast("Captured.");
}

function updatePurchaseLeaseSectionVisibility({ openLeaseDialogIfUsed } = {}) {
  const hint = document.querySelector("#purchaseLeaseSectionHint");
  const dlg = document.querySelector("#purchaseLeaseDialog");
  const cond = (document.querySelector("#purchaseVehicleCondition")?.value || "").trim();
  const show = cond === "Used";
  if (!show) {
    if (dlg?.open) dlg.close();
    if (hint) hint.hidden = true;
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
    return;
  }
  if (hint) hint.hidden = false;
  if (openLeaseDialogIfUsed && dlg && typeof dlg.showModal === "function") {
    try {
      dlg.showModal();
    } catch {
      /* nested dialog or already open */
    }
  }
}

function renderPurchaseVehicleBrokerOptions() {
  const sel = document.querySelector("#purchaseVehicleBrokerName");
  if (!sel) return;
  const current = sel.value || "Self";
  sel.innerHTML = "";
  const add = (val, text) => {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = text;
    sel.appendChild(o);
  };
  add("Self", "Self");
  for (const b of Array.isArray(db.brokers) ? db.brokers : []) {
    const name = String(b?.name || "").trim();
    if (!name) continue;
    const idNo = String(b?.idNumber || "").trim();
    add(name, idNo ? `${name} · ID: ${idNo}` : name);
  }
  const vals = Array.from(sel.options).map((o) => o.value);
  sel.value = vals.includes(current) ? current : "Self";
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
      const name = String(b?.name || "").trim();
      if (!name) continue;
      const idNo = String(b?.idNumber || "").trim();
      add(name, idNo ? `${name} · ID: ${idNo}` : name);
    }
  } else {
    for (const s of Array.isArray(db.suppliers) ? db.suppliers : []) {
      const name = String(s?.name || "").trim();
      if (!name) continue;
      const idNo = String(s?.idNumber || "").trim();
      add(name, idNo ? `${name} · ID: ${idNo}` : name);
    }
  }
  const opts = Array.from(sel.options).map((o) => o.value);
  if (current && opts.includes(current)) sel.value = current;
}

/**
 * Put purchase line items on the inventory list (db.vehicles).
 * Matches by stock number; refuses if that stock is already a sold unit.
 * @returns {object|null} The inventory row, or null if blocked.
 */
function upsertInventoryVehicleFromPurchase(nv) {
  db.vehicles = Array.isArray(db.vehicles) ? db.vehicles : [];
  const sn = String(nv.stockNo || "").trim().toLowerCase();
  const idx = db.vehicles.findIndex((v) => String(v.stockNo || "").trim().toLowerCase() === sn);
  if (idx >= 0) {
    const cur = db.vehicles[idx];
    if (cur.status === "sold") {
      toast("Stock number already used by a sold vehicle. Use a different stock number.");
      return null;
    }
    const merged = normalizeVehicle({
      ...cur,
      ...nv,
      id: cur.id,
      createdAt: cur.createdAt,
      docs: Array.isArray(cur.docs) && cur.docs.length ? cur.docs : nv.docs,
      imageDataUrl: nv.imageDataUrl?.trim() ? nv.imageDataUrl : cur.imageDataUrl || "",
      status: "available",
      soldAt: null,
      saleId: null,
    });
    db.vehicles[idx] = merged;
    return merged;
  }
  db.vehicles.push(nv);
  return nv;
}

/**
 * Update an existing inventory row when editing a purchase (match by vehicle id, not stock).
 * Preserves docs and sold linkage; blocks edits when vehicle is sold.
 */
function updateInventoryVehicleFromPurchaseEdit(nv, vehicleId) {
  db.vehicles = Array.isArray(db.vehicles) ? db.vehicles : [];
  const idx = db.vehicles.findIndex((x) => x.id === vehicleId);
  if (idx < 0) {
    toast("Linked inventory row was not found.");
    return null;
  }
  const cur = db.vehicles[idx];
  if (cur.status === "sold") {
    toast("This vehicle is sold. Edit the sale or inventory instead.");
    return null;
  }
  const sn = String(nv.stockNo || "").trim().toLowerCase();
  const dup = db.vehicles.find(
    (x, i) => i !== idx && String(x.stockNo || "").trim().toLowerCase() === sn
  );
  if (dup) {
    toast("Stock No. already exists. Use a unique stock number.");
    return null;
  }
  const imageDataUrl = getPurchaseImageDataUrlForSave();
  const merged = normalizeVehicle({
    ...cur,
    ...nv,
    id: cur.id,
    createdAt: cur.createdAt,
    status: cur.status,
    soldAt: cur.soldAt,
    saleId: cur.saleId,
    docs: Array.isArray(cur.docs) ? cur.docs : [],
    imageDataUrl: imageDataUrl || "",
  });
  db.vehicles[idx] = merged;
  return merged;
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
      ownerType: p?.ownerType || "",
      ownerFirstName: p?.ownerFirstName || "",
      ownerSecondName: p?.ownerSecondName || "",
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
    ownerType: p?.ownerType || "",
    ownerFirstName: p?.ownerFirstName || "",
    ownerSecondName: p?.ownerSecondName || "",
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
    ownerType: document.querySelector("#purchaseOwnerType")?.value,
    ownerFirstName: document.querySelector("#purchaseOwnerFirstName")?.value,
    ownerSecondName: document.querySelector("#purchaseOwnerSecondName")?.value,
  };

  if (editingPurchaseId) {
    const recIdx = (Array.isArray(db.purchases) ? db.purchases : []).findIndex((x) => x.id === editingPurchaseId);
    if (recIdx < 0) {
      toast("Purchase not found.");
      return;
    }
    const prev = db.purchases[recIdx];
    const vehicleId = purchaseRecordVehicle(prev).id;
    if (!vehicleId) {
      toast("Cannot update this purchase (missing vehicle link).");
      return;
    }
    payload.id = vehicleId;
  }

  const nv = normalizeVehicle(payload);
  if (!nv.stockNo || !nv.make || !nv.model) {
    toast("Please fill Stock No., Make, and Model.");
    return;
  }
  if (nv.costPrice <= 0) {
    toast("Enter a valid cost price.");
    return;
  }

  db.purchases = Array.isArray(db.purchases) ? db.purchases : [];

  if (editingPurchaseId) {
    const recIdx = db.purchases.findIndex((x) => x.id === editingPurchaseId);
    const prev = db.purchases[recIdx];
    const vehicleId = purchaseRecordVehicle(prev).id;
    const invRow = updateInventoryVehicleFromPurchaseEdit(nv, vehicleId);
    if (!invRow) return;
    db.purchases[recIdx] = {
      ...prev,
      purchaseDate: document.querySelector("#purchaseDate")?.value || prev.purchaseDate || todayISODate(),
      source: document.querySelector("#purchaseSource")?.value || "supplier",
      partyName,
      vehicle: normalizeVehicle({ ...invRow }),
    };
    persist();
    closePurchaseFormDialog();
    renderPurchases();
    renderAll();
    toast("Purchase updated.");
    return;
  }

  nv.imageDataUrl = getPurchaseImageDataUrlForSave();
  nv.docs = [];
  nv.status = "available";
  nv.soldAt = null;
  nv.saleId = null;

  const invRow = upsertInventoryVehicleFromPurchase(nv);
  if (!invRow) return;

  const rec = {
    id: uid("pur"),
    createdAt: nowIso(),
    purchaseDate: document.querySelector("#purchaseDate")?.value || todayISODate(),
    source: document.querySelector("#purchaseSource")?.value || "supplier",
    partyName,
    vehicle: normalizeVehicle({ ...invRow }),
  };

  db.purchases.unshift(rec);
  persist();
  closePurchaseFormDialog();
  renderPurchases();
  renderAll();
  toast("Purchase recorded — added to inventory.");
}

function resetPurchaseForm() {
  editingPurchaseId = null;
  setPurchaseFormDialogMode(false);
  document.querySelector("#purchaseLeaseDialog")?.close();
  document.querySelector("#purchaseForm")?.reset();
  clearPurchaseImagePreview();
  const d = document.querySelector("#purchaseDate");
  if (d) d.value = todayISODate();
  renderPurchasePartyOptions();
  renderPurchaseVehicleBrokerOptions();
  updatePurchaseLeaseSectionVisibility();
}

function deletePurchaseById(purchaseId) {
  if (!isAdmin()) {
    toast("Only admin can delete purchases.");
    return;
  }
  const id = String(purchaseId || "").trim();
  if (!id) return;
  const recIdx = (Array.isArray(db.purchases) ? db.purchases : []).findIndex((x) => x.id === id);
  if (recIdx < 0) {
    toast("Purchase not found.");
    return;
  }
  const p = db.purchases[recIdx];
  const v = purchaseRecordVehicle(p);
  const vehicleId = String(v?.id || "").trim();
  if (vehicleId) {
    const inv = getVehicleById(vehicleId);
    if (inv?.status === "sold") {
      toast("Cannot delete: vehicle is sold. Void the sale first if needed.");
      return;
    }
    if (isInCart(vehicleId)) {
      toast("Remove this vehicle from the cart before deleting the purchase.");
      return;
    }
  }
  const label = `${v?.stockNo || "—"} · ${vehicleLabel(v) || "vehicle"}`;
  if (!confirm(`Delete this purchase and remove it from inventory?\n\n${label}`)) return;

  db.purchases = (db.purchases || []).filter((x) => x.id !== id);
  if (vehicleId) {
    db.vehicles = (db.vehicles || []).filter((x) => x.id !== vehicleId);
  }
  if (editingPurchaseId === id) {
    editingPurchaseId = null;
    resetPurchaseForm();
    closePurchaseFormDialog();
  }
  persist();
  renderAll();
  toast("Purchase deleted.");
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
      const hay = `${p.partyName ?? ""} ${p.source ?? ""} ${v.stockNo} ${v.vin} ${v.make} ${v.model} ${vehicleLabel(v)} ${v.gearSystem ?? ""} ${p.purchaseDate ?? ""} ${v.ownerType ?? ""} ${vehicleOwnerDisplayName(v)}`
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  for (const p of list) {
    const v = purchaseRecordVehicle(p);
    const tr = document.createElement("tr");
    const owner = vehicleOwnerDisplayName(v);
    const typeLine =
      v.ownerType || owner
        ? `<div class="muted" style="margin-top:4px;font-size:12px;">${v.ownerType ? `${escapeHtml(v.ownerType)}${owner ? " · " : ""}` : ""}${owner ? `Owner: ${escapeHtml(owner)}` : ""}</div>`
        : "";
    tr.innerHTML = `
      <td>${escapeHtml(p.purchaseDate || "—")}</td>
      <td><span class="pill">${escapeHtml(p.source || "—")}</span></td>
      <td>${escapeHtml(p.partyName || "—")}</td>
      <td><span class="pill">${escapeHtml(v.stockNo || "—")}</span></td>
      <td><strong>${escapeHtml(vehicleLabel(v) || "—")}</strong>${typeLine}</td>
      <td class="num">${formatMoney(v.costPrice)}</td>
      <td class="num">${formatMoney(v.sellPrice)}</td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    if (actions) {
      const btnView = mkBtn("View", "btn btn--table");
      btnView.addEventListener("click", () => openPurchaseViewDialog(p.id));
      const btnEdit = mkBtn("Edit", "btn btn--table btn--table-primary");
      btnEdit.addEventListener("click", () => openPurchaseFormDialogForEdit(p.id));
      const btnDelete = mkBtn("Delete", "btn btn--table btn--table-danger");
      if (!isAdmin()) {
        btnDelete.disabled = true;
        btnDelete.classList.remove("btn--table-danger");
        btnDelete.classList.add("btn--table-muted");
        btnDelete.title = "Admin only";
      } else {
        btnDelete.title = "Delete purchase and linked inventory row";
      }
      btnDelete.addEventListener("click", () => {
        if (!isAdmin()) return;
        deletePurchaseById(p.id);
      });
      actions.appendChild(btnView);
      actions.appendChild(btnEdit);
      actions.appendChild(btnDelete);
    }
    tbody.appendChild(tr);
  }

  const sum = document.querySelector("#purchaseSummary");
  if (sum) sum.textContent = `${list.length} purchase${list.length === 1 ? "" : "s"}`;
}

function updateLeaseSectionVisibility({ openLeaseDialogIfUsed } = {}) {
  const hint = document.querySelector("#leaseSectionHint");
  const dlg = document.querySelector("#vehicleLeaseDialog");
  const cond = (document.querySelector("#vehicleCondition")?.value || "").trim();
  const show = cond === "Used";
  if (!show) {
    if (dlg?.open) dlg.close();
    if (hint) hint.hidden = true;
    const ls = document.querySelector("#leasingStatus");
    if (ls) ls.value = "No";
    const lc = document.querySelector("#leasingCompany");
    if (lc) lc.value = "";
    const la = document.querySelector("#leaseAmount");
    if (la) la.value = "";
    const lb = document.querySelector("#leaseBalanceAmount");
    if (lb) lb.value = "";
    const lp = document.querySelector("#leasePeriod");
    if (lp) lp.value = "";
    const lbp = document.querySelector("#leaseBalancePeriod");
    if (lbp) lbp.value = "";
    return;
  }
  if (hint) hint.hidden = false;
  if (openLeaseDialogIfUsed && dlg && typeof dlg.showModal === "function") {
    try {
      dlg.showModal();
    } catch {
      /* nested dialog or already open */
    }
  }
}

function renderVehicleBrokerOptions() {
  const sel = document.querySelector("#vehicleBrokerName");
  if (!sel) return;

  const current = sel.value || "Self";
  sel.innerHTML = "";
  const add = (val, text) => {
    const o = document.createElement("option");
    o.value = val;
    o.textContent = text;
    sel.appendChild(o);
  };
  add("Self", "Self");
  const brokers = Array.isArray(db.brokers) ? db.brokers : [];
  for (const b of brokers) {
    const name = String(b?.name || "").trim();
    if (!name) continue;
    const idNo = String(b?.idNumber || "").trim();
    add(name, idNo ? `${name} · ID: ${idNo}` : name);
  }
  const vals = Array.from(sel.options).map((o) => o.value);
  sel.value = vals.includes(current) ? current : "Self";
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
    ownerType: document.querySelector("#ownerType")?.value,
    ownerFirstName: document.querySelector("#ownerFirstName")?.value,
    ownerSecondName: document.querySelector("#ownerSecondName")?.value,
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

function deleteVehicleById(vehicleId) {
  requirePerm("delete vehicle", PERMS.INVENTORY_DELETE);
  const id = String(vehicleId || "").trim();
  if (!id) return;
  const v = getVehicleById(id);
  if (!v) return toast("Vehicle not found.");

  if (v.status === "sold") {
    toast("Cannot delete a SOLD vehicle. Void the sale first (Reports).");
    return;
  }
  if (isInCart(id)) {
    toast("Remove from cart before deleting.");
    return;
  }
  if (!confirm(`Delete vehicle ${v.stockNo} (${vehicleLabel(v)})?`)) return;

  db.vehicles = (db.vehicles || []).filter((x) => x.id !== id);
  persist();
  renderAll();
  toast("Vehicle deleted.");
}

function cartTotals() {
  db.cart.extras = Array.isArray(db.cart.extras) ? db.cart.extras : [];
  const items = db.cart.items
    .map(getVehicleById)
    .filter(Boolean)
    .filter((v) => v.status !== "sold");

  const extrasTotal = db.cart.extras.reduce(
    (s, it) => s + safeNumber(it.price, 0) * Math.max(1, safeNumber(it.qty, 1)),
    0
  );
  const subtotal = items.reduce((sum, v) => sum + safeNumber(v.sellPrice, 0), 0) + extrasTotal;
  const discount = Math.min(safeNumber(db.cart.discount, 0), subtotal);
  const total = Math.max(0, subtotal - discount);
  return { items, extras: db.cart.extras, extrasTotal, subtotal, discount, total };
}

function renderCart() {
  const tbody = $("#cartTable tbody");
  tbody.innerHTML = "";

  // remove missing or sold vehicles from cart
  db.cart.items = db.cart.items.filter((id) => {
    const v = getVehicleById(id);
    return v && v.status !== "sold";
  });

  const { items, extras, extrasTotal, subtotal, discount, total } = cartTotals();
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
    const btnRemove = mkBtn("Remove", "btn btn--table btn--table-danger");
    btnRemove.addEventListener("click", () => {
      db.cart.items = db.cart.items.filter((id) => id !== v.id);
      persist();
      renderAll();
      toast("Removed from cart.");
    });
    actions.append(btnRemove);
    tbody.appendChild(tr);
  }

  // extras
  const extrasTbody = document.querySelector("#cartExtrasTable tbody");
  const extrasBadge = document.querySelector("#cartExtrasCount");
  if (extrasBadge) extrasBadge.textContent = String(extras.length);
  if (extrasTbody) {
    extrasTbody.innerHTML = "";
    for (const it of extras) {
      const tr = document.createElement("tr");
      const qty = Math.max(1, safeNumber(it.qty, 1));
      const price = safeNumber(it.price, 0);
      tr.innerHTML = `
        <td><strong>${escapeHtml(String(it.name || "Extra item"))}</strong></td>
        <td class="num">${escapeHtml(String(qty))}</td>
        <td class="num">${escapeHtml(formatMoney(price))}</td>
        <td class="num"><strong>${escapeHtml(formatMoney(price * qty))}</strong></td>
        <td class="actions"></td>
      `;
      const actions = tr.querySelector(".actions");
      const btnRemove = mkBtn("Remove", "btn btn--table btn--table-danger btn--table-compact");
      btnRemove.addEventListener("click", () => {
        db.cart.extras = (db.cart.extras || []).filter((x) => x.id !== it.id);
        persist();
        renderAll();
        toast("Removed extra item.");
      });
      actions?.append(btnRemove);
      extrasTbody.appendChild(tr);
    }
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
  const { items, extras, subtotal, discount, total } = cartTotals();
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
  for (const it of extras) {
    const qty = Math.max(1, safeNumber(it.qty, 1));
    const price = safeNumber(it.price, 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>—</td>
      <td>
        ${escapeHtml(String(it.name || "Extra item"))}
        <div class="muted" style="margin-top:4px;">Qty: ${escapeHtml(String(qty))}</div>
      </td>
      <td class="num">${formatMoney(price * qty)}</td>
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
  const docOriginal = !!document.querySelector("#docOriginalCr")?.checked;
  const docNoObj = !!document.querySelector("#docNoObjection")?.checked;
  const docDeletion = !!document.querySelector("#docDeletion")?.checked;
  const docRevenue = !!document.querySelector("#docRevenueLicence")?.checked;
  // Prefer explicit tick marks instead of "Pending/Attached"
  $("#invDocOriginalCr").textContent = docOriginal ? "✓" : "—";
  $("#invDocNoObj").textContent = docNoObj ? "✓" : "—";
  $("#invDocDeletion").textContent = docDeletion ? "✓" : "—";
  $("#invDocRevenue").textContent = docRevenue ? "✓" : "—";
  $("#invDocOthers").textContent = (document.querySelector("#docOthers")?.value || "").trim() || "—";

  const remarks = ($("#invoiceRemarks").value || "").trim();
  $("#invFooter").textContent = remarks || "Thank you.";
  $("#invCopyright").textContent = appCopyrightText();
}

function clearCart() {
  requirePerm("billing", PERMS.BILLING_USE);
  if (!db.cart.items.length) return;
  if (!confirm("Clear cart?")) return;
  db.cart.items = [];
  db.cart.discount = 0;
  db.cart.extras = [];
  persist();
  renderAll();
  toast("Cart cleared.");
}

function completeSale() {
  requirePerm("complete sale", PERMS.BILLING_SALE);
  const { items, extras, subtotal, discount, total } = cartTotals();
  const hasExtras = Array.isArray(extras) && extras.length > 0;
  if (!items.length && !hasExtras) {
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
  const cu = currentUser();
  const sale = {
    id: saleId,
    invoiceNo,
    createdAt: nowIso(),
    soldBy: cu
      ? { id: cu.id, username: cu.username, name: cu.name || cu.username }
      : null,
    customer: {
      name: ($("#invoiceCustomerName").value || "").trim() || "Walk-in",
      phone: ($("#invoiceCustomerPhone").value || "").trim(),
    },
    paymentMethod: $("#paymentMethod").value || "Cash",
    remarks: ($("#invoiceRemarks").value || "").trim(),
    customerIdNumber: ($("#bearingAmount").value || "").trim(),
    paidAmount: ($("#sumLkrAmount").value || "").trim() ? Math.max(0, safeNumber($("#sumLkrAmount").value, total)) : total,
    sumLkrAmount: subtotal,
    documents: {
      originalCr: !!document.querySelector("#docOriginalCr")?.checked,
      noObjectionLetter: !!document.querySelector("#docNoObjection")?.checked,
      deletion: !!document.querySelector("#docDeletion")?.checked,
      revenueLicence: !!document.querySelector("#docRevenueLicence")?.checked,
      others: (document.querySelector("#docOthers")?.value || "").trim(),
    },
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
    extras: (extras || []).map((x) => ({
      id: x.id,
      name: x.name,
      qty: Math.max(1, safeNumber(x.qty, 1)),
      price: safeNumber(x.price, 0),
      total: safeNumber(x.price, 0) * Math.max(1, safeNumber(x.qty, 1)),
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

  const lineItems = sale.items.map((it) => {
    const vv = getVehicleById(it.vehicleId);
    const desc = `${it.year ? `${it.year} ` : ""}${it.make} ${it.model}`.trim() || (vv ? vehicleLabel(vv) : "Vehicle");
    return {
      stockNo: it.stockNo || "",
      description: desc,
      qty: 1,
      unitPrice: safeNumber(it.sellPrice, 0),
      lineTotal: safeNumber(it.sellPrice, 0),
      costPrice: safeNumber(vv?.costPrice, 0),
    };
  });
  for (const ex of sale.extras || []) {
    const qty = Math.max(1, safeNumber(ex.qty, 1));
    const unitPrice = safeNumber(ex.price, 0);
    lineItems.push({
      stockNo: "",
      description: String(ex.name || "Extra item"),
      qty,
      unitPrice,
      lineTotal: unitPrice * qty,
      costPrice: 0,
    });
  }
  const cogsTotal = lineItems.reduce((s, it) => s + safeNumber(it.costPrice, 0), 0);

  db.ledger.push(
    normalizeLedgerEntry({
      id: uid("led"),
      createdAt: sale.createdAt,
      date: (sale.createdAt || nowIso()).slice(0, 10),
      type: "income",
      category: "Vehicle Sale",
      amount: total,
      subtotalAmount: subtotal,
      discountAmount: discount,
      taxAmount: 0,
      txnRef: invoiceNo,
      paymentMethod: sale.paymentMethod || "Cash",
      counterparty: sale.customer?.name || "Walk-in",
      details: `Invoice ${invoiceNo} · ${sale.customer?.name || "Walk-in"}${sale.customer?.phone ? ` · ${sale.customer.phone}` : ""}`,
      items: lineItems.map(({ stockNo, description, qty, unitPrice, lineTotal }) => ({
        stockNo,
        description,
        qty,
        unitPrice,
        lineTotal,
      })),
      soldBy: sale.soldBy || null,
      source: { kind: "sale", saleId, line: "revenue" },
    })
  );

  if (cogsTotal > 0) {
    db.ledger.push(
      normalizeLedgerEntry({
        id: uid("led"),
        createdAt: sale.createdAt,
        date: (sale.createdAt || nowIso()).slice(0, 10),
        type: "expense",
        category: "Cost of Goods Sold (COGS)",
        amount: cogsTotal,
        txnRef: invoiceNo,
        paymentMethod: "",
        counterparty: "Inventory",
        details: `COGS matched to invoice ${invoiceNo}`,
        items: lineItems.map((it) => ({
          stockNo: it.stockNo,
          description: `${it.description} (cost)`,
          qty: 1,
          unitPrice: it.costPrice,
          lineTotal: it.costPrice,
        })),
        source: { kind: "sale", saleId, line: "cogs" },
      })
    );
  }

  db.sales.unshift(sale);
  db.cart.items = [];
  db.cart.discount = 0;
  db.cart.extras = [];
  persist();
  sendImmediateInvoiceMessage(sale);
  renderAll();
  toast("Sale completed.");
  setActiveTab("reports");
  return saleId;
}

function normalizeLedgerEntry(e) {
  if (!e || typeof e !== "object") return e;
  const src = e.source && typeof e.source === "object" ? { ...e.source } : { kind: "manual" };
  if (src.kind === "sale" && !src.line) src.line = "revenue";
  return {
    ...e,
    txnRef: String(e.txnRef ?? "").trim(),
    paymentMethod: String(e.paymentMethod ?? "").trim(),
    counterparty: String(e.counterparty ?? "").trim(),
    taxAmount: e.taxAmount == null || e.taxAmount === "" ? 0 : safeNumber(e.taxAmount, 0),
    discountAmount: e.discountAmount == null || e.discountAmount === "" ? 0 : safeNumber(e.discountAmount, 0),
    subtotalAmount: (() => {
      if (e.subtotalAmount == null || e.subtotalAmount === "") return null;
      const n = safeNumber(e.subtotalAmount, NaN);
      return Number.isFinite(n) ? n : null;
    })(),
    items: Array.isArray(e.items) ? e.items : [],
    soldBy: e.soldBy && typeof e.soldBy === "object" ? e.soldBy : null,
    source: src,
  };
}

function migrateLedgerEntries() {
  db.ledger = Array.isArray(db.ledger) ? db.ledger.map((x) => normalizeLedgerEntry({ ...x })) : [];
}

function getLedgerEntriesFiltered() {
  const from = document.querySelector("#ledgerFilterFrom")?.value?.trim() || "";
  const to = document.querySelector("#ledgerFilterTo")?.value?.trim() || "";
  const typeFilter = document.querySelector("#ledgerFilterType")?.value || "all";
  const q = document.querySelector("#ledgerSearch")?.value?.trim().toLowerCase() || "";
  return (Array.isArray(db.ledger) ? db.ledger : [])
    .map((x) => normalizeLedgerEntry({ ...x }))
    .filter((e) => {
      const d = (e.date || (e.createdAt || "").slice(0, 10) || "").slice(0, 10);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    })
    .filter((e) => (typeFilter === "all" ? true : e.type === typeFilter))
    .filter((e) => {
      if (!q) return true;
      const itemsHay = (e.items || [])
        .map((i) => `${i.stockNo ?? ""} ${i.description ?? ""} ${i.lineTotal ?? ""}`)
        .join(" ");
      const staff = e.soldBy ? `${e.soldBy.name ?? ""} ${e.soldBy.username ?? ""}` : "";
      const hay =
        `${e.category ?? ""} ${e.details ?? ""} ${e.txnRef ?? ""} ${e.counterparty ?? ""} ${e.paymentMethod ?? ""} ${itemsHay} ${staff}`.toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

function ledgerTooltipText(s) {
  return String(s || "")
    .replace(/\r?\n/g, " ")
    .replace(/"/g, "'")
    .slice(0, 480);
}

function ledgerLineItemsSummary(entry) {
  const items = entry.items || [];
  if (!items.length) return escapeHtml(entry.details || "—");
  const bits = items.slice(0, 3).map((i) => {
    const sn = i.stockNo ? `${i.stockNo}: ` : "";
    return `${sn}${(i.description || "Line").slice(0, 40)}${(i.description || "").length > 40 ? "…" : ""}`;
  });
  const more = items.length > 3 ? ` (+${items.length - 3} more)` : "";
  const full = [entry.details, ...items.map((i) => `${i.stockNo || "—"} ×${i.qty ?? 1} @ ${formatMoney(i.unitPrice)} → ${formatMoney(i.lineTotal)}`)].filter(Boolean).join("\n");
  return `<span title="${escapeAttr(ledgerTooltipText(full))}">${escapeHtml(bits.join(" · ") + more)}</span>`;
}

function ledgerAdjCell(entry) {
  const d = entry.discountAmount > 0 ? `D ${formatMoney(entry.discountAmount)}` : "";
  const t = entry.taxAmount > 0 ? `T ${formatMoney(entry.taxAmount)}` : "";
  const s = [d, t].filter(Boolean).join(" · ");
  return s || "—";
}

function salesInLedgerDateRange(from, to) {
  return (db.sales || []).filter((s) => dateInRange(s.createdAt, from || null, to || null));
}

function renderLedgerZSummary() {
  const from = document.querySelector("#ledgerFilterFrom")?.value?.trim() || "";
  const to = document.querySelector("#ledgerFilterTo")?.value?.trim() || "";
  const list = (Array.isArray(db.ledger) ? db.ledger : [])
    .map((x) => normalizeLedgerEntry({ ...x }))
    .filter((e) => {
      const d = (e.date || (e.createdAt || "").slice(0, 10) || "").slice(0, 10);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
      return true;
    });
  let income = 0;
  let expense = 0;
  for (const e of list) {
    if (e.type === "income") income += safeNumber(e.amount, 0);
    else if (e.type === "expense") expense += safeNumber(e.amount, 0);
  }
  const elI = document.querySelector("#ledgerSumIncome");
  const elE = document.querySelector("#ledgerSumExpense");
  const elN = document.querySelector("#ledgerSumNet");
  const elC = document.querySelector("#ledgerSumSaleCount");
  if (elI) elI.textContent = formatMoney(income);
  if (elE) elE.textContent = formatMoney(expense);
  if (elN) elN.textContent = formatMoney(income - expense);
  const sales = salesInLedgerDateRange(from || null, to || null);
  if (elC) elC.textContent = String(sales.length);

  const tender = new Map();
  let saleNet = 0;
  let saleDiscount = 0;
  for (const s of sales) {
    const m = String(s.paymentMethod || "Cash").trim() || "Cash";
    tender.set(m, (tender.get(m) || 0) + safeNumber(s.total, 0));
    saleNet += safeNumber(s.total, 0);
    saleDiscount += safeNumber(s.discount, 0);
  }
  const tenderEl = document.querySelector("#ledgerZSummaryTender");
  if (tenderEl) {
    const lines = [
      `Sales in range: ${sales.length} · Net sales (from sales module): ${formatMoney(saleNet)} · Discounts on invoices: ${formatMoney(saleDiscount)}`,
      tender.size
        ? `Tender (by payment method): ${[...tender.entries()].map(([k, v]) => `${k} ${formatMoney(v)}`).join(" · ")}`
        : "Tender: no sales in this date range.",
      "Staff on new sales: captured on each sale (see income lines). Voids remove sale + linked ledger rows.",
    ];
    tenderEl.textContent = lines.join("\n");
  }
}

function exportLedgerCsv() {
  requirePerm("export ledger", PERMS.LEDGER_VIEW);
  const list = getLedgerEntriesFiltered();
  const headers = [
    "date",
    "time",
    "txn_ref",
    "type",
    "category",
    "payment_method",
    "counterparty",
    "discount",
    "tax",
    "amount",
    "details",
    "lines",
    "source",
    "staff",
  ];
  const rows = [headers.join(",")];
  for (const e of list) {
    const d = e.date || (e.createdAt || "").slice(0, 10);
    const t = (e.createdAt || "").slice(11, 19) || "";
    const lines = (e.items || [])
      .map((i) => `${i.stockNo || "-"}:${i.qty || 1}@${i.unitPrice}`)
      .join(";");
    const staff = e.soldBy ? e.soldBy.username || e.soldBy.name || "" : "";
    const src = e.source?.kind === "sale" ? `sale:${e.source.saleId || ""}:${e.source.line || ""}` : e.source?.kind || "";
    const esc = (x) => `"${String(x ?? "").replaceAll('"', '""')}"`;
    rows.push(
      [
        esc(d),
        esc(t),
        esc(e.txnRef),
        esc(e.type),
        esc(e.category),
        esc(e.paymentMethod),
        esc(e.counterparty),
        esc(e.discountAmount),
        esc(e.taxAmount),
        esc(e.amount),
        esc(e.details),
        esc(lines),
        esc(src),
        esc(staff),
      ].join(",")
    );
  }
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ledger-export-${todayISODate()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Ledger CSV exported.");
}

function renderLedger() {
  const tbody = $("#ledgerTable tbody");
  tbody.innerHTML = "";

  const list = getLedgerEntriesFiltered();

  for (const entry of list) {
    const tr = document.createElement("tr");
    const typePill =
      entry.type === "income"
        ? `<span class="pill pill--ok">INCOME</span>`
        : `<span class="pill pill--warn">EXPENSE</span>`;

    const dateStr = entry.date || (entry.createdAt ? entry.createdAt.slice(0, 10) : "");
    const timeStr = entry.createdAt && entry.createdAt.length > 11 ? entry.createdAt.slice(11, 19) : "—";
    const ref = entry.txnRef || "—";
    const staff = entry.soldBy ? escapeHtml(entry.soldBy.name || entry.soldBy.username || "") : "";

    tr.innerHTML = `
      <td>${escapeHtml(dateStr)}<div class="muted" style="font-size:11px;margin-top:2px;">${escapeHtml(timeStr)}</div></td>
      <td><span class="pill">${escapeHtml(ref || "—")}</span></td>
      <td>${typePill}</td>
      <td><strong>${escapeHtml(entry.category || "")}</strong>${staff ? `<div class="muted" style="font-size:11px;margin-top:2px;">${staff}</div>` : ""}</td>
      <td>${escapeHtml(entry.paymentMethod || "—")}</td>
      <td>${escapeHtml(entry.counterparty || "—")}</td>
      <td style="max-width:220px;font-size:12px;">${ledgerLineItemsSummary(entry)}</td>
      <td class="num muted" style="font-size:12px;">${ledgerAdjCell(entry)}</td>
      <td class="num"><strong>${formatMoney(entry.amount)}</strong></td>
      <td class="actions"></td>
    `;

    const actions = tr.querySelector(".actions");
    const isAutoSale = entry.source?.kind === "sale";
    const btnDel = mkBtn(
      isAutoSale ? "Auto" : "Delete",
      isAutoSale ? "btn btn--table btn--table-muted" : "btn btn--table btn--table-danger"
    );
    const canDelete = isAdmin() && !isAutoSale;
    btnDel.disabled = !canDelete;
    btnDel.title = isAutoSale ? "Auto-created from sale (void sale to remove)" : isAdmin() ? "Delete entry" : "Admin only";
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

  $("#ledgerSummary").textContent = `${list.length} entr${list.length === 1 ? "y" : "ies"} (filtered)`;
  renderLedgerZSummary();
}

function addLedgerEntryFromForm(e) {
  e.preventDefault();
  requirePerm("add ledger entry", PERMS.LEDGER_ADD);
  const entry = normalizeLedgerEntry({
    id: uid("led"),
    createdAt: nowIso(),
    date: $("#ledgerDate").value || todayISODate(),
    type: $("#ledgerType").value,
    category: ($("#ledgerCategory").value || "").trim(),
    amount: safeNumber($("#ledgerAmount").value, 0),
    details: ($("#ledgerDetails").value || "").trim(),
    txnRef: ($("#ledgerTxnRef").value || "").trim(),
    paymentMethod: ($("#ledgerPaymentMethod").value || "").trim(),
    counterparty: ($("#ledgerCounterparty").value || "").trim(),
    taxAmount: safeNumber($("#ledgerTaxAmount").value, 0),
    discountAmount: safeNumber($("#ledgerDiscountAmount").value, 0),
    items: [],
    source: { kind: "manual" },
  });

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
    const btnView = mkBtn("View", "btn btn--table");
    btnView.addEventListener("click", () => viewSale(s.id));

    const btnDownload = mkBtn("Download", "btn btn--table btn--table-export");
    btnDownload.addEventListener("click", () => downloadInvoiceForSale(s.id));

    const btnVoid = mkBtn("Void", "btn btn--table btn--table-danger");
    btnVoid.disabled = !isAdmin();
    btnVoid.title = isAdmin() ? "Void sale" : "Admin only";
    btnVoid.addEventListener("click", () => voidSale(s.id));

    actions.append(btnView, btnDownload, btnVoid);
    tbody.appendChild(tr);
  }

  $("#salesSummary").textContent = `${list.length} sale${list.length === 1 ? "" : "s"}`;
}

const DAILY_REPORT_PAYMENT_ORDER = ["Cash", "Bank", "Card", "E-Wallet", "Mixed"];

let dailyReportTillSyncKey = "";

function ensureDailyTillSessionsMeta() {
  if (!db.meta.dailyTillSessions || typeof db.meta.dailyTillSessions !== "object") db.meta.dailyTillSessions = {};
}

function salesOnCalendarDay(dayStr) {
  const d = String(dayStr || "").trim().slice(0, 10);
  if (!d) return [];
  return (db.sales || []).filter((s) => (s.createdAt || "").slice(0, 10) === d);
}

function buildDailyReportPrintHtml(dayStr, parts) {
  const phones = [db.meta.companyPhone, db.meta.companyPhone2]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" / ");
  const companyLine = [db.meta.companyAddress, phones].filter(Boolean).join(" · ");
  const payRows = parts.payRowsHtml;
  const topRows = parts.topRowsHtml;
  const mixRows = parts.mixRowsHtml;
  const empRows = parts.empRowsHtml;
  return `
    <div class="drPrint">
      <h1>${escapeHtml(db.meta.companyName || "E-Inventory")} · Daily report</h1>
      ${companyLine ? `<div class="muted">${escapeHtml(companyLine)}</div>` : ""}
      <div class="muted">Range: <strong>${escapeHtml(dayStr)}</strong> · Generated: ${escapeHtml(new Date().toLocaleString())}</div>
      <h2>Financial</h2>
      <table>
        <tr><td>Gross sales</td><td class="num">${escapeHtml(formatMoney(parts.gross))}</td></tr>
        <tr><td>Discounts</td><td class="num">${escapeHtml(formatMoney(parts.discount))}</td></tr>
        <tr><td>Net sales</td><td class="num">${escapeHtml(formatMoney(parts.net))}</td></tr>
        <tr><td>Tax collected</td><td class="num">${escapeHtml(formatMoney(0))} <span class="muted">(not tracked)</span></td></tr>
      </table>
      <h2>Payment methods</h2>
      <table>
        <thead><tr><th>Method</th><th class="num">Txns</th><th class="num">Net</th></tr></thead>
        <tbody>${payRows}</tbody>
      </table>
      <h2>Transactions</h2>
      <p>Count: <strong>${parts.listLen}</strong> · Avg net: <strong>${escapeHtml(formatMoney(parts.avgNet))}</strong> · Partial payments: <strong>${parts.partialCount}</strong></p>
      <p class="muted">Voids remove sales from this app. Refunds: use ledger adjustments if needed.</p>
      <h2>Vehicle performance</h2>
      <h3 class="h3">Top sellers</h3>
      <table><thead><tr><th>Vehicle</th><th class="num">Qty</th><th class="num">Net</th></tr></thead><tbody>${topRows}</tbody></table>
      <h3 class="h3">Mix by type</h3>
      <table><thead><tr><th>Type</th><th class="num">Units</th><th class="num">Net</th></tr></thead><tbody>${mixRows}</tbody></table>
      <p>Gross profit (est.): <strong>${escapeHtml(formatMoney(parts.gp))}</strong> · Margin on COGS: <strong>${escapeHtml(parts.marginStr)}</strong></p>
      <h2>Till</h2>
      <p>Expected cash: <strong>${escapeHtml(formatMoney(parts.expectedCash))}</strong> · Counted: <strong>${escapeHtml(parts.countedStr)}</strong> · Variance: <strong>${escapeHtml(parts.varianceStr)}</strong></p>
      <p>${escapeHtml(parts.depositNote || "—")}</p>
      <h2>Staff</h2>
      <table><thead><tr><th>User</th><th class="num">Sales</th><th class="num">Net</th></tr></thead><tbody>${empRows}</tbody></table>
      <p class="muted">Hours / clock-in are not tracked in this application.</p>
      <h2>Inventory</h2>
      <p>Vehicles sold (range): <strong>${parts.unitsSold}</strong> · Available for sale: <strong>${parts.avail}</strong></p>
      <p class="muted">${escapeHtml(parts.invNote)}</p>
    </div>
  `;
}

function renderDailyReport() {
  const panel = document.querySelector("#panel-daily-report");
  if (!panel) return;

  const fromEl = document.querySelector("#dailyReportFrom");
  const toEl = document.querySelector("#dailyReportTo");
  const today = todayISODate();
  let from = (fromEl?.value || "").trim().slice(0, 10) || today;
  let to = (toEl?.value || "").trim().slice(0, 10) || from;
  if (fromEl && !fromEl.value) fromEl.value = from;
  if (toEl && !toEl.value) toEl.value = to;
  if (to < from) {
    const t = from;
    from = to;
    to = t;
    if (fromEl) fromEl.value = from;
    if (toEl) toEl.value = to;
  }
  const rangeLabel = from === to ? from : `${from} → ${to}`;
  const isSingleDay = from === to;

  ensureDailyTillSessionsMeta();
  const tillKey = isSingleDay ? from : "";
  if (dailyReportTillSyncKey !== tillKey) {
    dailyReportTillSyncKey = tillKey;
    const till = tillKey ? db.meta.dailyTillSessions[tillKey] || {} : {};
    const cEl = document.querySelector("#drTillCashCounted");
    const dEl = document.querySelector("#drTillDepositNote");
    if (cEl) cEl.value = tillKey && till.cashCounted != null && String(till.cashCounted) !== "" ? String(till.cashCounted) : "";
    if (dEl) dEl.value = tillKey ? till.depositNote || "" : "";
  }
  const btnSaveTill = document.querySelector("#btnDailyReportSaveTill");
  if (btnSaveTill) {
    btnSaveTill.disabled = !isSingleDay;
    btnSaveTill.title = isSingleDay ? "Save till notes" : "Till notes can be saved only for a single day.";
  }

  const list = (db.sales || []).filter((s) => dateInRange(s.createdAt, from, to));
  const gross = list.reduce((sum, s) => sum + safeNumber(s.subtotal, 0), 0);
  const discount = list.reduce((sum, s) => sum + safeNumber(s.discount, 0), 0);
  const net = list.reduce((sum, s) => sum + safeNumber(s.total, 0), 0);

  document.querySelector("#drFinGross") && (document.querySelector("#drFinGross").textContent = formatMoney(gross));
  document.querySelector("#drFinDiscount") && (document.querySelector("#drFinDiscount").textContent = formatMoney(discount));
  document.querySelector("#drFinNet") && (document.querySelector("#drFinNet").textContent = formatMoney(net));
  document.querySelector("#drFinTax") && (document.querySelector("#drFinTax").textContent = formatMoney(0));
  document.querySelector("#drFinRevenue") && (document.querySelector("#drFinRevenue").textContent = formatMoney(net));

  const payMap = new Map();
  for (const s of list) {
    const m = String(s.paymentMethod || "Cash").trim() || "Cash";
    if (!payMap.has(m)) payMap.set(m, { count: 0, net: 0 });
    const row = payMap.get(m);
    row.count += 1;
    row.net += safeNumber(s.total, 0);
  }
  const allPay = [...payMap.keys()];
  const methods = [
    ...DAILY_REPORT_PAYMENT_ORDER.filter((m) => payMap.has(m)),
    ...allPay.filter((m) => !DAILY_REPORT_PAYMENT_ORDER.includes(m)).sort(),
  ];
  const payBody = document.querySelector("#drPayTbody");
  if (payBody) {
    payBody.innerHTML = methods.length
      ? methods
          .map((m) => {
            const r = payMap.get(m);
            return `<tr><td>${escapeHtml(m)}</td><td class="num">${r.count}</td><td class="num">${formatMoney(r.net)}</td></tr>`;
          })
          .join("")
      : `<tr><td colspan="3" class="muted">No sales this day.</td></tr>`;
  }

  const partialCount = list.filter((s) => {
    const t = safeNumber(s.total, 0);
    const p = safeNumber(s.paidAmount, t);
    return t > 0 && p < t - 0.005;
  }).length;

  const drTxnCount = document.querySelector("#drTxnCount");
  if (drTxnCount) drTxnCount.textContent = String(list.length);
  const drTxnAvg = document.querySelector("#drTxnAvg");
  if (drTxnAvg) drTxnAvg.textContent = list.length ? formatMoney(net / list.length) : formatMoney(0);
  const drTxnPartial = document.querySelector("#drTxnPartial");
  if (drTxnPartial) drTxnPartial.textContent = String(partialCount);
  const drTxnVoid = document.querySelector("#drTxnVoid");
  if (drTxnVoid) {
    drTxnVoid.innerHTML =
      '<span class="muted" style="font-weight:400">Voided sales are removed from data. Refunds: use ledger entries.</span>';
  }

  const lineAgg = new Map();
  const typeAgg = new Map();
  let totalCogs = 0;
  let totalRevItems = 0;

  for (const s of list) {
    for (const it of s.items || []) {
      const key = `${String(it.stockNo || "").trim()}|${String(it.make || "").trim()}|${String(it.model || "").trim()}`;
      const label =
        [it.stockNo, it.year ? `${it.year}` : "", `${it.make || ""} ${it.model || ""}`.trim()].filter(Boolean).join(" · ") ||
        key;
      const price = safeNumber(it.sellPrice, 0);
      if (!lineAgg.has(key)) lineAgg.set(key, { label, qty: 0, net: 0 });
      const L = lineAgg.get(key);
      L.qty += 1;
      L.net += price;
      totalRevItems += price;

      const v = getVehicleById(it.vehicleId);
      const tkey = String(v?.vehicleType || "Unknown").trim() || "Unknown";
      if (!typeAgg.has(tkey)) typeAgg.set(tkey, { units: 0, net: 0 });
      const T = typeAgg.get(tkey);
      T.units += 1;
      T.net += price;

      totalCogs += safeNumber(v?.costPrice, 0);
    }
  }

  const topSorted = [...lineAgg.values()].sort((a, b) => b.net - a.net).slice(0, 15);
  const topBody = document.querySelector("#drTopTbody");
  if (topBody) {
    topBody.innerHTML = topSorted.length
      ? topSorted
          .map(
            (r) =>
              `<tr><td>${escapeHtml(r.label)}</td><td class="num">${r.qty}</td><td class="num">${formatMoney(r.net)}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="3" class="muted">No line items.</td></tr>`;
  }

  const typeSorted = [...typeAgg.entries()].sort((a, b) => b[1].net - a[1].net);
  const mixBody = document.querySelector("#drMixTbody");
  if (mixBody) {
    mixBody.innerHTML = typeSorted.length
      ? typeSorted
          .map(
            ([name, r]) =>
              `<tr><td>${escapeHtml(name)}</td><td class="num">${r.units}</td><td class="num">${formatMoney(r.net)}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="3" class="muted">No mix data.</td></tr>`;
  }

  const gp = totalRevItems - totalCogs;
  const marginPct = totalCogs > 0 ? (gp / totalCogs) * 100 : null;
  const elGp = document.querySelector("#drGpTotal");
  if (elGp) elGp.textContent = formatMoney(gp);
  const elGm = document.querySelector("#drGpMargin");
  if (elGm) elGm.textContent = marginPct != null && Number.isFinite(marginPct) ? `${marginPct.toFixed(1)}%` : "—";

  let expectedCash = 0;
  for (const s of list) {
    if (String(s.paymentMethod || "Cash").trim() !== "Cash") continue;
    const t = safeNumber(s.total, 0);
    const p = Math.min(Math.max(0, safeNumber(s.paidAmount, t)), t);
    expectedCash += p;
  }
  const expEl = document.querySelector("#drTillExpected");
  if (expEl) expEl.value = formatMoney(expectedCash);

  const cVal = document.querySelector("#drTillCashCounted")?.value;
  const counted = cVal === "" || cVal == null ? NaN : safeNumber(cVal, NaN);
  const varEl = document.querySelector("#drTillVariance");
  let varianceStr = "—";
  if (varEl) {
    if (!Number.isFinite(counted)) varEl.value = "—";
    else {
      const diff = counted - expectedCash;
      const tag = diff > 0 ? "over" : diff < 0 ? "short" : "balanced";
      varianceStr = `${formatMoney(diff)} (${tag})`;
      varEl.value = varianceStr;
    }
  }

  const empMap = new Map();
  for (const s of list) {
    const label = s.soldBy?.name || s.soldBy?.username || "";
    const key = label || "— (legacy / not recorded)";
    if (!empMap.has(key)) empMap.set(key, { count: 0, net: 0 });
    const E = empMap.get(key);
    E.count += 1;
    E.net += safeNumber(s.total, 0);
  }
  const empSorted = [...empMap.entries()].sort((a, b) => b[1].net - a[1].net);
  const empBody = document.querySelector("#drEmpTbody");
  if (empBody) {
    empBody.innerHTML = empSorted.length
      ? empSorted
          .map(
            ([name, r]) =>
              `<tr><td>${escapeHtml(name)}</td><td class="num">${r.count}</td><td class="num">${formatMoney(r.net)}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="3" class="muted">No sales.</td></tr>`;
  }

  const unitsSold = list.reduce((n, s) => n + (s.items?.length || 0), 0);
  const avail = (db.vehicles || []).filter((v) => v.status !== "sold").length;
  const invSoldEl = document.querySelector("#drInvSold");
  if (invSoldEl) invSoldEl.textContent = String(unitsSold);
  const invAvailEl = document.querySelector("#drInvAvail");
  if (invAvailEl) invAvailEl.textContent = String(avail);
  const invLow = document.querySelector("#drInvLowNote");
  const settings = db.meta.inventoryReports?.typeSettings ?? {};
  const hasAnyThreshold = Object.keys(settings).some((k) => {
    const rp = settings[k]?.reorderPoint;
    return rp != null && safeNumber(rp, 0) > 0;
  });
  if (invLow) {
    invLow.textContent = hasAnyThreshold
      ? "Check Inventory Reports for vehicle types below reorder point."
      : "No automatic low-stock threshold is set. Use Inventory Reports → type settings for reorder points.";
  }

  const depositNote = isSingleDay ? document.querySelector("#drTillDepositNote")?.value || "" : "";
  const countedStr = Number.isFinite(counted) ? formatMoney(counted) : "—";
  const payRowsHtml = methods.length
    ? methods
        .map((m) => {
          const r = payMap.get(m);
          return `<tr><td>${escapeHtml(m)}</td><td class="num">${r.count}</td><td class="num">${formatMoney(r.net)}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="3" class="muted">No sales</td></tr>`;
  const topRowsHtml = topSorted.length
    ? topSorted
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.label)}</td><td class="num">${r.qty}</td><td class="num">${formatMoney(r.net)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="muted">None</td></tr>`;
  const mixRowsHtml = typeSorted.length
    ? typeSorted
        .map(
          ([name, r]) =>
            `<tr><td>${escapeHtml(name)}</td><td class="num">${r.units}</td><td class="num">${formatMoney(r.net)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="muted">None</td></tr>`;
  const empRowsHtml = empSorted.length
    ? empSorted
        .map(
          ([name, r]) =>
            `<tr><td>${escapeHtml(name)}</td><td class="num">${r.count}</td><td class="num">${formatMoney(r.net)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="3" class="muted">None</td></tr>`;

  const printRoot = document.querySelector("#dailyReportPrintRoot");
  if (printRoot) {
    printRoot.innerHTML = buildDailyReportPrintHtml(rangeLabel, {
      gross,
      discount,
      net,
      listLen: list.length,
      avgNet: list.length ? net / list.length : 0,
      partialCount,
      gp,
      marginStr: marginPct != null && Number.isFinite(marginPct) ? `${marginPct.toFixed(1)}%` : "—",
      expectedCash,
      countedStr,
      varianceStr,
      depositNote,
      unitsSold,
      avail,
      invNote: invLow?.textContent || "",
      payRowsHtml,
      topRowsHtml,
      mixRowsHtml,
      empRowsHtml,
    });
  }
}

function saveDailyTillFromForm() {
  requirePerm("save till session", PERMS.REPORTS_VIEW);
  const fromEl = document.querySelector("#dailyReportFrom");
  const toEl = document.querySelector("#dailyReportTo");
  const from = (fromEl?.value || todayISODate()).trim().slice(0, 10) || todayISODate();
  const to = (toEl?.value || from).trim().slice(0, 10) || from;
  if (from !== to) {
    toast("Till notes can be saved only for a single day (From = To).");
    return;
  }
  const dayStr = from;
  ensureDailyTillSessionsMeta();
  const raw = document.querySelector("#drTillCashCounted")?.value ?? "";
  const cashCounted = raw === "" ? "" : safeNumber(raw, 0);
  const depositNote = document.querySelector("#drTillDepositNote")?.value || "";
  db.meta.dailyTillSessions[dayStr] = { cashCounted, depositNote };
  persist();
  toast("Till notes saved for this date.");
}

function printDailyReport() {
  requirePerm("print daily report", PERMS.REPORTS_VIEW);
  renderDailyReport();
  const inner = document.querySelector("#dailyReportPrintRoot")?.innerHTML || "";
  if (!inner) {
    toast("Nothing to print.");
    return;
  }
  const w = window.open("", "_blank");
  if (!w) {
    toast("Popup blocked. Allow popups to print.");
    return;
  }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Daily Report</title>
    <style>
      body{font-family:system-ui,Segoe UI,Arial,sans-serif;padding:20px;color:#111}
      h1{font-size:20px;margin:0 0 8px}
      h2{font-size:15px;margin:20px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
      h3.h3{font-size:13px;margin:12px 0 6px;color:#444}
      .muted{color:#666;font-size:13px}
      table{border-collapse:collapse;width:100%;margin:8px 0;font-size:13px}
      th,td{border:1px solid #e6e6e6;padding:8px;text-align:left}
      th{background:#f6f6f6}
      .num{text-align:right}
      @media print{body{padding:0}}
    </style></head><body>${inner}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
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
  const docs = s.documents || {};
  const d1 = document.querySelector("#docOriginalCr");
  const d2 = document.querySelector("#docNoObjection");
  const d3 = document.querySelector("#docDeletion");
  const d4 = document.querySelector("#docRevenueLicence");
  if (d1) d1.checked = !!docs.originalCr;
  if (d2) d2.checked = !!docs.noObjectionLetter;
  if (d3) d3.checked = !!docs.deletion;
  if (d4) d4.checked = !!docs.revenueLicence;
  const dO = document.querySelector("#docOthers");
  if (dO) dO.value = String(docs.others || "").trim();

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
  for (const ex of s.extras || []) {
    const qty = Math.max(1, safeNumber(ex.qty, 1));
    const unitPrice = safeNumber(ex.price, safeNumber(ex.unitPrice, 0));
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>—</td>
      <td>
        ${escapeHtml(String(ex.name || "Extra item"))}
        <div class="muted" style="margin-top:4px;">Qty: ${escapeHtml(String(qty))}</div>
      </td>
      <td class="num">${formatMoney(unitPrice * qty)}</td>
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
  $("#invDocOriginalCr").textContent = docs.originalCr ? "✓" : "—";
  $("#invDocNoObj").textContent = docs.noObjectionLetter ? "✓" : "—";
  $("#invDocDeletion").textContent = docs.deletion ? "✓" : "—";
  $("#invDocRevenue").textContent = docs.revenueLicence ? "✓" : "—";
  $("#invDocOthers").textContent = String(docs.others || "").trim() || "—";
  $("#invFooter").textContent = s.remarks || "Thank you.";
  $("#invCopyright").textContent = appCopyrightText();

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
  if (!confirm(`Void sale ${s.invoiceNo}? Vehicles return to stock and all linked ledger lines (revenue + COGS) are removed.`)) return;

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

function exportCustomersCsv() {
  requirePerm("export customers", PERMS.DATA_IMPORT_EXPORT);
  const rows = Array.isArray(db.customers) ? db.customers : [];
  const cols = [
    "id",
    "name",
    "firstName",
    "secondName",
    "idNumber",
    "phone",
    "email",
    "address",
    "notes",
    "hasPhoto",
    "hasIdCopyFront",
    "hasIdCopyBack",
    "createdAt",
    "updatedAt",
  ];
  const lines = [];
  lines.push(cols.join(","));
  for (const c of rows) {
    const norm = normalizeCustomer(c);
    lines.push(
      [
        norm.id,
        norm.name,
        norm.firstName,
        norm.secondName,
        norm.idNumber,
        norm.phone,
        norm.email,
        norm.address,
        norm.notes,
        String(!!String(norm.photoDataUrl || "").trim()),
        String(!!String(norm.idCopyFrontDataUrl || "").trim()),
        String(!!String(norm.idCopyBackDataUrl || "").trim()),
        norm.createdAt,
        norm.updatedAt,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `customers_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported CSV.");
}

function exportSuppliersCsv() {
  requirePerm("export suppliers", PERMS.DATA_IMPORT_EXPORT);
  const rows = Array.isArray(db.suppliers) ? db.suppliers : [];
  const cols = [
    "id",
    "name",
    "firstName",
    "secondName",
    "idNumber",
    "phone",
    "email",
    "address",
    "notes",
    "hasPhoto",
    "hasIdCopyFront",
    "hasIdCopyBack",
    "createdAt",
    "updatedAt",
  ];
  const lines = [];
  lines.push(cols.join(","));
  for (const s of rows) {
    const norm = normalizeSupplier(s);
    lines.push(
      [
        norm.id,
        norm.name,
        norm.firstName,
        norm.secondName,
        norm.idNumber,
        norm.phone,
        norm.email,
        norm.address,
        norm.notes,
        String(!!String(norm.photoDataUrl || "").trim()),
        String(!!String(norm.idCopyFrontDataUrl || "").trim()),
        String(!!String(norm.idCopyBackDataUrl || "").trim()),
        norm.createdAt,
        norm.updatedAt,
      ]
        .map(csvCell)
        .join(",")
    );
  }
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `suppliers_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported CSV.");
}

// Documents
let docsDialogVehicleId = null;
let docsDialogMode = "default"; // default | sold
let vehicleQuickViewVehicleId = null;

function openDocsDialog(vehicleId) {
  const v = getVehicleById(vehicleId);
  if (!v) return;
  docsDialogVehicleId = vehicleId;
  $("#docsVehicleLine").textContent = `${v.stockNo} · ${vehicleLabel(v)}`;
  const purchaseLetterLabel = document.querySelector("#docsPurchaseLetterLabel");
  if (purchaseLetterLabel) {
    purchaseLetterLabel.textContent = docsDialogMode === "sold" ? "Sales latter" : "Purchased letter";
  }
  $("#docsFileInput").value = "";
  const btnSaveDocs = document.querySelector("#btnSaveDocs");
  if (btnSaveDocs) {
    btnSaveDocs.disabled = !can(PERMS.DOCS_MANAGE);
    btnSaveDocs.title = can(PERMS.DOCS_MANAGE) ? "Save documents to storage (and server if enabled)" : "No permission to save documents";
  }
  renderDocsList();
  $("#docsDialog").showModal();
}

function openDocsDialogAndPromptUpload(vehicleId) {
  docsDialogMode = "sold";
  openDocsDialog(vehicleId);
}

function renderDocsList() {
  const v = docsDialogVehicleId ? getVehicleById(docsDialogVehicleId) : null;
  const host = $("#docsList");
  host.innerHTML = "";
  if (!v) return;

  const docsAll = Array.isArray(v.docs) ? v.docs : [];
  const scope = docsDialogMode === "sold" ? "sold" : "default";
  const docs = docsAll.filter((d) => String(d?.scope || "default") === scope);
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
    open.disabled = !doc.dataUrl;
    open.style.opacity = doc.dataUrl ? "1" : "0.5";
    open.addEventListener("click", () => {
      if (!doc.dataUrl) return;
      openDocPreview(doc);
    });

    const download = node.querySelector(".docItem__download");
    if (download) {
      download.href = doc.dataUrl || "#";
      download.download = doc.name || "document";
      download.style.pointerEvents = doc.dataUrl ? "" : "none";
      download.style.opacity = doc.dataUrl ? "1" : "0.5";
    }

    node.querySelector(".docItem__remove").addEventListener("click", () => {
      if (!confirm(`Remove document "${doc.name}"?`)) return;
      v.docs = docsAll.filter((d) => d.id !== doc.id);
      v.updatedAt = nowIso();
      persist();
      renderDocsList();
      renderInventory();
      toast("Document removed.");
    });

    host.appendChild(node);
  }
}

function openDocPreview(doc) {
  const dlg = document.querySelector("#docPreviewDialog");
  const body = document.querySelector("#docPreviewBody");
  const title = document.querySelector("#docPreviewTitle");
  const sub = document.querySelector("#docPreviewSub");
  const openNew = document.querySelector("#docPreviewOpenNewTab");
  if (!dlg || !body || !title || !sub || !openNew) return;

  const name = String(doc?.name || "Document");
  const type = String(doc?.type || "");
  const size = doc?.size ? `${Math.round(doc.size / 1024)} KB` : "";
  const addedAt = doc?.addedAt ? new Date(doc.addedAt).toLocaleString() : "";
  title.textContent = name;
  sub.textContent = [type, size, addedAt].filter(Boolean).join(" · ");

  const dataUrl = String(doc?.dataUrl || "").trim();
  openNew.href = dataUrl || "#";
  openNew.style.pointerEvents = dataUrl ? "" : "none";
  openNew.style.opacity = dataUrl ? "1" : "0.5";

  if (!dataUrl) {
    body.innerHTML = `<div class="muted">No preview available.</div>`;
    dlg.showModal();
    return;
  }

  const isPdf = type === "application/pdf" || name.toLowerCase().endsWith(".pdf") || dataUrl.startsWith("data:application/pdf");
  const isImg = type.startsWith("image/") || dataUrl.startsWith("data:image/");
  if (isPdf) {
    body.innerHTML = `<iframe class="docPreview__frame" title="${escapeAttr(name)}" src="${escapeAttr(dataUrl)}"></iframe>`;
  } else if (isImg) {
    body.innerHTML = `<img class="docPreview__img" alt="${escapeAttr(name)}" src="${escapeAttr(dataUrl)}" />`;
  } else {
    body.innerHTML = `<div class="muted">Preview not supported for this file type.</div>`;
  }

  dlg.showModal();
}

async function addDocsFromFiles(fileList, label = "") {
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
      const safeLabel = String(label || "").trim();
      const name = safeLabel ? `${safeLabel} - ${f.name}` : f.name;
      v.docs.push({
        id: uid("doc"),
        scope: docsDialogMode === "sold" ? "sold" : "default",
        name,
        label: safeLabel,
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
  const docsAll = Array.isArray(v.docs) ? v.docs : [];
  const scope = docsDialogMode === "sold" ? "sold" : "default";
  const scoped = docsAll.filter((d) => String(d?.scope || "default") === scope);
  if (!scoped.length) return;
  if (!confirm(`Clear ${docsDialogMode === "sold" ? "sold docs" : "docs"} for this vehicle?`)) return;
  v.docs = docsAll.filter((d) => String(d?.scope || "default") !== scope);
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
  const loginUserEl = $("#loginUsername");
  if (USE_SUPABASE && loginUserEl) loginUserEl.type = "email";

  // Marketplace
  document.querySelector("#marketSearch")?.addEventListener("input", () => {
    const params = new URLSearchParams(location.search);
    if (params.get("veh")) {
      // if user is viewing a detail page and starts searching, go back to list
      params.delete("veh");
      history.replaceState({}, "", `${location.pathname}?${params.toString()}`);
    }
    renderMarketplaceList();
  });
  document.querySelector("#btnMarketplaceBack")?.addEventListener("click", () => {
    const params = new URLSearchParams(location.search);
    params.delete("veh");
    params.set("marketplace", "1");
    history.pushState({}, "", `${location.pathname}?${params.toString()}`);
    renderMarketplaceList();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.querySelector("#btnMarketplaceCopyLink")?.addEventListener("click", async () => {
    const link = marketplaceUrl({ absolute: true });
    const ok = await copyText(link);
    toast(ok ? "Marketplace link copied." : "Could not copy link.");
  });
  document.querySelector("#panel-marketplace")?.addEventListener("click", async (e) => {
    const t = e.target;
    const copyBtn = t?.closest?.("[data-market-copy]");
    if (copyBtn) {
      const id = String(copyBtn.getAttribute("data-market-copy") || "").trim();
      const link = marketplaceUrl({ vehicleId: id, absolute: true });
      const ok = await copyText(link);
      toast(ok ? "Vehicle link copied." : "Could not copy link.");
      return;
    }
    const openEl = t?.closest?.("[data-market-open]");
    if (openEl) {
      e.preventDefault();
      const id = String(openEl.getAttribute("data-market-open") || "").trim();
      const params = new URLSearchParams(location.search);
      params.set("marketplace", "1");
      params.set("veh", id);
      history.pushState({}, "", `${location.pathname}?${params.toString()}`);
      renderMarketplaceVehicleDetail(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const card = t?.closest?.("[data-market-veh]");
    if (card) {
      const id = String(card.getAttribute("data-market-veh") || "").trim();
      const params = new URLSearchParams(location.search);
      params.set("marketplace", "1");
      params.set("veh", id);
      history.pushState({}, "", `${location.pathname}?${params.toString()}`);
      renderMarketplaceVehicleDetail(id);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
  });
  document.querySelector("#panel-marketplace")?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const card = e.target?.closest?.("[data-market-veh]");
    if (!card) return;
    const id = String(card.getAttribute("data-market-veh") || "").trim();
    const params = new URLSearchParams(location.search);
    params.set("marketplace", "1");
    params.set("veh", id);
    history.pushState({}, "", `${location.pathname}?${params.toString()}`);
    renderMarketplaceVehicleDetail(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  window.addEventListener("popstate", () => {
    const params = new URLSearchParams(location.search);
    if (params.get("marketplace") === "1") {
      setActiveTab("marketplace");
      renderMarketplace();
    }
  });

  // Company info explicit save (in addition to auto-save)
  document.querySelector("#btnSaveCompanyInfo")?.addEventListener("click", () => {
    requirePerm("save company info", PERMS.BRANDING_EDIT);
    db.meta.companyName = String(document.querySelector("#companyName")?.value || "");
    db.meta.companyAddress = String(document.querySelector("#companyAddress")?.value || "");
    db.meta.companyPhone = String(document.querySelector("#companyPhone")?.value || "");
    db.meta.companyPhone2 = String(document.querySelector("#companyPhone2")?.value || "");
    db.meta.companyEmail = String(document.querySelector("#companyEmail")?.value || "");
    db.meta.companyWebsite = String(document.querySelector("#companyWebsite")?.value || "");
    persist();
    renderInvoiceBranding();
    toast("Company details saved.");
  });

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
      $("#loginError").textContent =
        lastLoginError || (USE_SUPABASE ? "Could not sign in." : "Invalid username or password.");
      return;
    }
  });
  document.querySelector("#setupForm")?.addEventListener("submit", runOneTimeSetupFromForm);
  const btnTouch = document.querySelector("#btnLoginTouchId");
  if (btnTouch) {
    btnTouch.addEventListener("click", () => {
      toast("Touch ID / Windows Hello isn’t available in the browser — use Log In.");
    });
  }
  document.querySelector("#btnLogout")?.addEventListener("click", logout);

  $("#vehicleForm").addEventListener("submit", upsertVehicleFromForm);
  $("#btnClearVehicleForm").addEventListener("click", resetVehicleForm);
  $("#btnDeleteVehicle").addEventListener("click", deleteVehicleFromForm);
  document.querySelector("#btnAddNewVehicle")?.addEventListener("click", openVehicleFormDialogForNew);
  document.querySelector("#btnCloseVehicleFormDialog")?.addEventListener("click", () => {
    document.querySelector("#vehicleLeaseDialog")?.close();
    document.querySelector("#vehicleFormDialog")?.close();
  });
  $("#inventorySearch").addEventListener("input", renderInventory);
  document.querySelector("#btnAddCartExtra")?.addEventListener("click", () => {
    requirePerm("billing", PERMS.BILLING_USE);
    const name = String(document.querySelector("#cartExtraName")?.value || "").trim();
    const qty = Math.max(1, safeNumber(document.querySelector("#cartExtraQty")?.value || 1, 1));
    const price = Math.max(0, safeNumber(document.querySelector("#cartExtraPrice")?.value || 0, 0));
    if (!name) return toast("Enter item name.");
    if (price <= 0) return toast("Enter price.");
    db.cart.extras = Array.isArray(db.cart.extras) ? db.cart.extras : [];
    db.cart.extras.push({ id: uid("extra"), name, qty, price, createdAt: nowIso() });
    const n = document.querySelector("#cartExtraName");
    const p = document.querySelector("#cartExtraPrice");
    const q = document.querySelector("#cartExtraQty");
    if (n) n.value = "";
    if (p) p.value = "0";
    if (q) q.value = "1";
    persist();
    renderAll();
    toast("Extra item added.");
  });
  // inventoryFilterStatus removed (search only by Stock/Vehicle No.)
  document.querySelector("#homeVehicleSearch")?.addEventListener("input", () => {
    const summary = document.querySelector("#homeVehicleSearchSummary");
    if (summary) summary.textContent = "Click Search to open Vehicle Quick view (or pick from a list if several match).";
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
  document.querySelector("#refusedVehicleSearch")?.addEventListener("input", renderRefusedVehicles);
  document.querySelector("#btnOpenRefusedVehicleFormDialog")?.addEventListener("click", () => {
    openRefusedVehicleFormDialogForNew();
  });
  document.querySelector("#btnCloseRefusedVehicleFormDialog")?.addEventListener("click", () => {
    document.querySelector("#refusedVehicleFormDialog")?.close();
  });
  document.querySelector("#btnClearRefusedVehicleForm")?.addEventListener("click", () => {
    clearRefusedVehicleForm();
    toast("Cleared.");
  });
  document.querySelector("#refusedVehicleForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    upsertRefusedVehicleFromForm();
  });
  document.querySelector("#refusedDocsInput")?.addEventListener("change", async (e) => {
    const input = e.currentTarget;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const id = String(document.querySelector("#refusedVehicleId")?.value || "").trim() || refusedDialogEditingId || uid("refused");
    refusedDialogEditingId = id;
    const elId = document.querySelector("#refusedVehicleId");
    if (elId && !String(elId.value || "").trim()) elId.value = id;

    db.refusedVehicles = Array.isArray(db.refusedVehicles) ? db.refusedVehicles : [];
    let rec = db.refusedVehicles.find((r) => r.id === id);
    if (!rec) {
      rec = normalizeRefusedVehicle({ id, createdAt: nowIso(), updatedAt: nowIso(), docs: [] });
      db.refusedVehicles.unshift(rec);
    }
    rec.docs = Array.isArray(rec.docs) ? rec.docs : [];

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
        toast("Only PDF and JPG/PNG documents are allowed.");
        continue;
      }
      try {
        const dataUrl = await readFileAsDataUrl(f);
        rec.docs.push({
          id: uid("rdoc"),
          name: f.name || "document",
          type: f.type || "",
          size: f.size || 0,
          dataUrl,
          addedAt: nowIso(),
        });
        addedAny = true;
      } catch {
        toast("Could not read file.");
      }
    }
    if (addedAny) {
      rec.updatedAt = nowIso();
      persist();
      renderRefusedDocsList(rec.docs);
      renderRefusedVehicles();
      toast("Document attached.");
    }
    input.value = "";
  });
  $("#vehicleCondition").addEventListener("change", () =>
    updateLeaseSectionVisibility({ openLeaseDialogIfUsed: true })
  );
  document.querySelector("#btnOpenVehicleLeaseDialog")?.addEventListener("click", () => {
    const dlg = document.querySelector("#vehicleLeaseDialog");
    if (dlg && typeof dlg.showModal === "function") {
      try {
        dlg.showModal();
      } catch {
        /* unavailable */
      }
    }
  });
  document.querySelector("#btnCloseVehicleLeaseDialog")?.addEventListener("click", () => {
    document.querySelector("#vehicleLeaseDialog")?.close();
  });
  document.querySelector("#btnDoneVehicleLeaseDialog")?.addEventListener("click", () => {
    document.querySelector("#vehicleLeaseDialog")?.close();
  });
  const btnAll = document.querySelector("#btnShowAllInv");
  if (btnAll) {
    btnAll.addEventListener("click", () => {
      // inventoryFilterStatus removed
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
  ["#docOriginalCr", "#docNoObjection", "#docDeletion", "#docRevenueLicence"].forEach((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    el.addEventListener("change", renderInvoicePreview);
  });
  document.querySelector("#docOthers")?.addEventListener("input", renderInvoicePreview);
  document.querySelector("#invoiceSentAuto")?.addEventListener("change", () => {
    requirePerm("invoice sms settings", PERMS.BRANDING_EDIT);
    db.meta.invoiceSentAuto = !!document.querySelector("#invoiceSentAuto")?.checked;
    persist();
  });
  document.querySelector("#invoiceSentTemplate")?.addEventListener("input", () => {
    requirePerm("invoice sms template", PERMS.BRANDING_EDIT);
    db.meta.invoiceSentTemplate = document.querySelector("#invoiceSentTemplate")?.value || "";
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
      const idEl = document.querySelector("#bearingAmount");
      if (nameEl) nameEl.value = c.name || "";
      if (phoneEl) phoneEl.value = c.phone || "";
      if (idEl) idEl.value = c.idNumber || "";
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
  document.querySelector("#quotationRefNo")?.addEventListener("input", renderQuotationPreview);
  document.querySelector("#quotationTerms")?.addEventListener("input", renderQuotationPreview);
  document.querySelector("#btnQuotationTermsDefault")?.addEventListener("click", () => {
    try {
      saveQuotationTermsAsDefault();
    } catch {
      /* requirePerm */
    }
  });
  document.querySelector("#btnSaveQuotation")?.addEventListener("click", saveQuotation);
  document.querySelector("#btnSendQuotationWhatsapp")?.addEventListener("click", sendQuotationWhatsapp);
  document.querySelector("#btnPrintQuotation")?.addEventListener("click", () => {
    try {
      printQuotation();
    } catch {
      /* requirePerm */
    }
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
  document.querySelector("#companyPhone2")?.addEventListener("input", () => {
    requirePerm("change company info", PERMS.BRANDING_EDIT);
    db.meta.companyPhone2 = String(document.querySelector("#companyPhone2")?.value || "");
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
  document.querySelector("#ledgerFilterFrom")?.addEventListener("change", renderLedger);
  document.querySelector("#ledgerFilterTo")?.addEventListener("change", renderLedger);
  document.querySelector("#btnLedgerRangeToday")?.addEventListener("click", () => {
    const t = todayISODate();
    const f = document.querySelector("#ledgerFilterFrom");
    const to = document.querySelector("#ledgerFilterTo");
    if (f) f.value = t;
    if (to) to.value = t;
    renderLedger();
  });
  document.querySelector("#btnLedgerRangeMonth")?.addEventListener("click", () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const first = new Date(y, m, 1).toISOString().slice(0, 10);
    const last = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    const f = document.querySelector("#ledgerFilterFrom");
    const to = document.querySelector("#ledgerFilterTo");
    if (f) f.value = first;
    if (to) to.value = last;
    renderLedger();
  });
  document.querySelector("#btnLedgerRangeClear")?.addEventListener("click", () => {
    const f = document.querySelector("#ledgerFilterFrom");
    const to = document.querySelector("#ledgerFilterTo");
    if (f) f.value = "";
    if (to) to.value = "";
    renderLedger();
  });
  document.querySelector("#btnExportLedgerCsv")?.addEventListener("click", () => {
    try {
      exportLedgerCsv();
    } catch {
      /* requirePerm */
    }
  });
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

  document.querySelector("#btnDailyReportRefresh")?.addEventListener("click", () => renderDailyReport());
  document.querySelector("#btnDailyReportPrint")?.addEventListener("click", () => {
    try {
      printDailyReport();
    } catch {
      /* requirePerm */
    }
  });
  document.querySelector("#btnDailyReportSaveTill")?.addEventListener("click", () => {
    try {
      saveDailyTillFromForm();
    } catch {
      /* requirePerm */
    }
  });
  document.querySelector("#dailyReportFrom")?.addEventListener("change", () => {
    dailyReportTillSyncKey = "";
    renderDailyReport();
  });
  document.querySelector("#dailyReportTo")?.addEventListener("change", () => {
    dailyReportTillSyncKey = "";
    renderDailyReport();
  });
  document.querySelector("#drTillCashCounted")?.addEventListener("input", () => renderDailyReport());

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

  // Inventory Reports "Save Settings" removed by requirement.

  const btnInvCsv = document.querySelector("#btnDownloadInventoryReportsCsv");
  if (btnInvCsv) btnInvCsv.addEventListener("click", exportInventoryReportsCsv);

  const btnInvPrint = document.querySelector("#btnPrintInventoryReports");
  if (btnInvPrint) btnInvPrint.addEventListener("click", printInventoryReports);

  // docs dialog
  $("#docsFileInput").addEventListener("change", async () => addDocsFromFiles($("#docsFileInput").files));
  document.querySelector("#docsOwnerIdFrontInput")?.addEventListener("change", async (e) => {
    const input = e.currentTarget;
    await addDocsFromFiles(input.files, "Owner Identity - Front");
    input.value = "";
  });
  document.querySelector("#docsOwnerIdBackInput")?.addEventListener("change", async (e) => {
    const input = e.currentTarget;
    await addDocsFromFiles(input.files, "Owner Identity - Back");
    input.value = "";
  });
  document.querySelector("#docsVehiclePhotoInput")?.addEventListener("change", async (e) => {
    const input = e.currentTarget;
    await addDocsFromFiles(input.files, "Vehicle Photo");
    input.value = "";
  });
  document.querySelector("#docsChassiImageInput")?.addEventListener("change", async (e) => {
    const input = e.currentTarget;
    await addDocsFromFiles(input.files, "Chassi Number Image");
    input.value = "";
  });
  document.querySelector("#docsPurchaseLetterInput")?.addEventListener("change", async (e) => {
    const input = e.currentTarget;
    await addDocsFromFiles(input.files, docsDialogMode === "sold" ? "Sales latter" : "Purchased Letter");
    input.value = "";
  });
  document.querySelector("#docsBookCopyInput")?.addEventListener("change", async (e) => {
    const input = e.currentTarget;
    await addDocsFromFiles(input.files, "Book Copy");
    input.value = "";
  });
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
    const qvId = vehicleQuickViewVehicleId;
    const qvOpen = document.querySelector("#vehicleQuickViewDialog")?.open;
    docsDialogVehicleId = null;
    docsDialogMode = "default";
    const purchaseLetterLabel = document.querySelector("#docsPurchaseLetterLabel");
    if (purchaseLetterLabel) purchaseLetterLabel.textContent = "Purchased letter";
    if (qvId && qvOpen) openVehicleQuickViewDialog(qvId);
  });

  // users (admin)
  if (document.querySelector("#userForm")) {
    $("#userForm").addEventListener("submit", createUserFromForm);
    $("#userSearch").addEventListener("input", renderUsers);
    document.querySelector("#btnOpenUserFormDialog")?.addEventListener("click", () => {
      const dlg = document.querySelector("#userFormDialog");
      if (!dlg || typeof dlg.showModal !== "function") return;
      try {
        $("#userForm").reset();
      } catch {
        /* ignore */
      }
      const role = document.querySelector("#newRole")?.value || "cashier";
      renderUserPermsPicker(role === "admin" || role === "superadmin" ? ["*"] : ROLE_PERMS[role] ?? []);
      dlg.showModal();
      setTimeout(() => document.querySelector("#newUsername")?.focus(), 0);
    });
    document.querySelector("#btnCloseUserFormDialog")?.addEventListener("click", () => {
      document.querySelector("#userFormDialog")?.close();
    });
    document.querySelector("#newRole")?.addEventListener("change", () => {
      const role = document.querySelector("#newRole")?.value || "cashier";
      renderUserPermsPicker(role === "admin" || role === "superadmin" ? ["*"] : ROLE_PERMS[role] ?? []);
      const badge = document.querySelector("#userPermsSummary");
      if (badge) badge.textContent = "Default by role";
    });
  }

  // edit user permissions
  document.querySelector("#btnCloseEditUserPermsDialog")?.addEventListener("click", () => {
    document.querySelector("#editUserPermsDialog")?.close();
  });
  document.querySelector("#btnCancelEditUserPerms")?.addEventListener("click", () => {
    document.querySelector("#editUserPermsDialog")?.close();
  });
  document.querySelector("#editUserPermsForm")?.addEventListener("submit", saveEditUserPermsFromForm);

  // businesses (super admin)
  document.querySelector("#businessForm")?.addEventListener("submit", createBusinessFromForm);
  document.querySelector("#businessAdminForm")?.addEventListener("submit", createBusinessAdminFromForm);
  const closeBizAdmins = () => document.querySelector("#businessAdminsDialog")?.close();
  document.querySelector("#btnCloseBusinessAdminsDialog")?.addEventListener("click", closeBizAdmins);
  document.querySelector("#btnBusinessAdminsCloseFooter")?.addEventListener("click", closeBizAdmins);
  const closeDelBiz = () => closeDeleteBusinessDialog();
  document.querySelector("#btnCloseDeleteBusinessDialog")?.addEventListener("click", closeDelBiz);
  document.querySelector("#btnCancelDeleteBusiness")?.addEventListener("click", closeDelBiz);
  document.querySelector("#deleteBusinessForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = pendingDeleteBusinessId;
    if (!id) return;
    const user = document.querySelector("#deleteBizSuperUser")?.value || "";
    const pass = document.querySelector("#deleteBizSuperPass")?.value || "";
    const ok = await verifySuperadminCredentials(user, pass);
    if (!ok) return toast("Superadmin username/password incorrect.");
    const biz = localBusinesses().find((b) => String(b.id) === String(id));
    const name = biz?.name || id;
    if (!confirm(`Delete business "${name}"? This cannot be undone.`)) return;
    deleteBusinessLocalNow(id);
    closeDeleteBusinessDialog();
  });

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

    const photoInput = document.querySelector("#brokerPhotoInput");
    if (photoInput) {
      photoInput.addEventListener("change", async () => {
        const f = photoInput.files?.[0];
        if (!f) return;
        try {
          pendingBrokerPhotoDataUrl = await readImageAsDataUrl(f);
          setBrokerPhotoPreview(pendingBrokerPhotoDataUrl);
          toast("Broker photo attached.");
        } catch {
          toast("Invalid image file.");
        } finally {
          photoInput.value = "";
        }
      });
    }
    document.querySelector("#btnClearBrokerPhoto")?.addEventListener("click", () => {
      const id = document.querySelector("#brokerId")?.value.trim() || "";
      if (id) {
        const b = (db.brokers || []).find((x) => x.id === id);
        if (b) {
          b.photoDataUrl = "";
          b.updatedAt = nowIso();
          persist();
          renderBrokers();
        }
      }
      clearBrokerPhotoPreview();
      toast("Broker photo removed.");
    });
    document.querySelector("#btnBrokerOpenWebcam")?.addEventListener("click", startBrokerWebcam);
    document.querySelector("#btnBrokerCaptureWebcam")?.addEventListener("click", captureBrokerWebcam);
    document.querySelector("#btnBrokerStopWebcam")?.addEventListener("click", () => {
      stopBrokerWebcam();
      toast("Webcam stopped.");
    });
    document.querySelector("#btnCloseBrokerWebcamDialog")?.addEventListener("click", () => {
      stopBrokerWebcam();
      document.querySelector("#brokerWebcamDialog")?.close();
    });
    document.querySelector("#brokerWebcamDialog")?.addEventListener("close", () => {
      stopBrokerWebcam();
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

    const photoInput = document.querySelector("#supplierPhotoInput");
    if (photoInput) {
      photoInput.addEventListener("change", async () => {
        const f = photoInput.files?.[0];
        if (!f) return;
        try {
          pendingSupplierPhotoDataUrl = await readImageAsDataUrl(f);
          setSupplierPhotoPreview(pendingSupplierPhotoDataUrl);
          toast("Supplier photo attached.");
        } catch {
          toast("Invalid image file.");
        } finally {
          photoInput.value = "";
        }
      });
    }
    document.querySelector("#btnClearSupplierPhoto")?.addEventListener("click", () => {
      const id = document.querySelector("#supplierId")?.value.trim() || "";
      if (id) {
        const s = (db.suppliers || []).find((x) => x.id === id);
        if (s) {
          s.photoDataUrl = "";
          s.updatedAt = nowIso();
          persist();
          renderSuppliers();
          renderPurchasePartyOptions();
        }
      }
      clearSupplierPhotoPreview();
      toast("Supplier photo removed.");
    });
    document.querySelector("#btnSupplierOpenWebcam")?.addEventListener("click", startSupplierWebcam);
    document.querySelector("#btnSupplierCaptureWebcam")?.addEventListener("click", captureSupplierWebcam);
    document.querySelector("#btnSupplierStopWebcam")?.addEventListener("click", () => {
      stopSupplierWebcam();
      toast("Webcam stopped.");
    });
    document.querySelector("#btnCloseSupplierWebcamDialog")?.addEventListener("click", () => {
      stopSupplierWebcam();
      document.querySelector("#supplierWebcamDialog")?.close();
    });
    document.querySelector("#supplierWebcamDialog")?.addEventListener("close", () => {
      stopSupplierWebcam();
    });

    document.querySelector("#btnExportSuppliersCsv")?.addEventListener("click", () => {
      try {
        exportSuppliersCsv();
      } catch {
        /* requirePerm */
      }
    });

    const idFrontInput = document.querySelector("#supplierIdFrontInput");
    if (idFrontInput) {
      idFrontInput.addEventListener("change", async () => {
        const f = idFrontInput.files?.[0];
        if (!f) return;
        try {
          pendingSupplierIdFrontDataUrl = await readImageAsDataUrl(f);
          setSupplierIdFrontPreview(pendingSupplierIdFrontDataUrl);
          toast("Supplier ID front attached.");
        } catch {
          toast("Invalid image file.");
        } finally {
          idFrontInput.value = "";
        }
      });
    }
    const idBackInput = document.querySelector("#supplierIdBackInput");
    if (idBackInput) {
      idBackInput.addEventListener("change", async () => {
        const f = idBackInput.files?.[0];
        if (!f) return;
        try {
          pendingSupplierIdBackDataUrl = await readImageAsDataUrl(f);
          setSupplierIdBackPreview(pendingSupplierIdBackDataUrl);
          toast("Supplier ID back attached.");
        } catch {
          toast("Invalid image file.");
        } finally {
          idBackInput.value = "";
        }
      });
    }
    document.querySelector("#btnClearSupplierIdFront")?.addEventListener("click", () => {
      const id = document.querySelector("#supplierId")?.value.trim() || "";
      if (id) {
        const s = (db.suppliers || []).find((x) => x.id === id);
        if (s) {
          s.idCopyFrontDataUrl = "";
          s.updatedAt = nowIso();
          persist();
          renderSuppliers();
        }
      }
      clearSupplierIdFrontPreview();
      toast("Supplier ID front removed.");
    });
    document.querySelector("#btnClearSupplierIdBack")?.addEventListener("click", () => {
      const id = document.querySelector("#supplierId")?.value.trim() || "";
      if (id) {
        const s = (db.suppliers || []).find((x) => x.id === id);
        if (s) {
          s.idCopyBackDataUrl = "";
          s.updatedAt = nowIso();
          persist();
          renderSuppliers();
        }
      }
      clearSupplierIdBackPreview();
      toast("Supplier ID back removed.");
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

    const photoInput = document.querySelector("#customerPhotoInput");
    if (photoInput) {
      photoInput.addEventListener("change", async () => {
        const f = photoInput.files?.[0];
        if (!f) return;
        try {
          pendingCustomerPhotoDataUrl = await readImageAsDataUrl(f);
          setCustomerPhotoPreview(pendingCustomerPhotoDataUrl);
          toast("Customer photo attached.");
        } catch {
          toast("Invalid image file.");
        } finally {
          photoInput.value = "";
        }
      });
    }
    document.querySelector("#btnClearCustomerPhoto")?.addEventListener("click", () => {
      const id = document.querySelector("#customerId")?.value.trim() || "";
      if (id) {
        const c = (db.customers || []).find((x) => x.id === id);
        if (c) {
          c.photoDataUrl = "";
          c.updatedAt = nowIso();
          persist();
          renderCustomers();
          renderInvoiceCustomerPick();
        }
      }
      clearCustomerPhotoPreview();
      toast("Customer photo removed.");
    });
    document.querySelector("#btnCustomerOpenWebcam")?.addEventListener("click", startCustomerWebcam);
    document.querySelector("#btnCustomerCaptureWebcam")?.addEventListener("click", captureCustomerWebcam);
    document.querySelector("#btnCustomerStopWebcam")?.addEventListener("click", () => {
      stopCustomerWebcam();
      toast("Webcam stopped.");
    });
    document.querySelector("#btnCloseCustomerWebcamDialog")?.addEventListener("click", () => {
      stopCustomerWebcam();
      document.querySelector("#customerWebcamDialog")?.close();
    });
    document.querySelector("#customerWebcamDialog")?.addEventListener("close", () => {
      stopCustomerWebcam();
    });

    document.querySelector("#btnExportCustomersCsv")?.addEventListener("click", () => {
      try {
        exportCustomersCsv();
      } catch {
        /* requirePerm */
      }
    });

    const idFrontInput = document.querySelector("#customerIdFrontInput");
    if (idFrontInput) {
      idFrontInput.addEventListener("change", async () => {
        const f = idFrontInput.files?.[0];
        if (!f) return;
        try {
          pendingCustomerIdFrontDataUrl = await readImageAsDataUrl(f);
          setCustomerIdFrontPreview(pendingCustomerIdFrontDataUrl);
          toast("ID front attached.");
        } catch {
          toast("Invalid image file.");
        } finally {
          idFrontInput.value = "";
        }
      });
    }
    const idBackInput = document.querySelector("#customerIdBackInput");
    if (idBackInput) {
      idBackInput.addEventListener("change", async () => {
        const f = idBackInput.files?.[0];
        if (!f) return;
        try {
          pendingCustomerIdBackDataUrl = await readImageAsDataUrl(f);
          setCustomerIdBackPreview(pendingCustomerIdBackDataUrl);
          toast("ID back attached.");
        } catch {
          toast("Invalid image file.");
        } finally {
          idBackInput.value = "";
        }
      });
    }

    document.querySelector("#btnClearCustomerIdFront")?.addEventListener("click", () => {
      const id = document.querySelector("#customerId")?.value.trim() || "";
      if (id) {
        const c = (db.customers || []).find((x) => x.id === id);
        if (c) {
          c.idCopyFrontDataUrl = "";
          c.updatedAt = nowIso();
          persist();
          renderCustomers();
          renderInvoiceCustomerPick();
        }
      }
      clearCustomerIdFrontPreview();
      toast("ID front removed.");
    });
    document.querySelector("#btnClearCustomerIdBack")?.addEventListener("click", () => {
      const id = document.querySelector("#customerId")?.value.trim() || "";
      if (id) {
        const c = (db.customers || []).find((x) => x.id === id);
        if (c) {
          c.idCopyBackDataUrl = "";
          c.updatedAt = nowIso();
          persist();
          renderCustomers();
          renderInvoiceCustomerPick();
        }
      }
      clearCustomerIdBackPreview();
      toast("ID back removed.");
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
    document.querySelector("#purchaseFormDialog")?.addEventListener("close", () => {
      resetPurchaseForm();
    });
    document.querySelector("#btnClosePurchaseFormDialog")?.addEventListener("click", () => {
      document.querySelector("#purchaseLeaseDialog")?.close();
      document.querySelector("#purchaseFormDialog")?.close();
    });
    const closePurchaseView = () => document.querySelector("#purchaseViewDialog")?.close();
    document.querySelector("#btnClosePurchaseViewDialog")?.addEventListener("click", closePurchaseView);
    document.querySelector("#btnPurchaseViewCloseFooter")?.addEventListener("click", closePurchaseView);
    document.querySelector("#purchaseViewDialog")?.addEventListener("close", () => {
      viewingPurchaseId = null;
    });
    document.querySelector("#btnPurchaseViewPdf")?.addEventListener("click", () => {
      if (!viewingPurchaseId) {
        toast("No purchase selected.");
        return;
      }
      exportPurchaseDetailsPdf(viewingPurchaseId);
    });
    document.querySelector("#btnPurchaseViewDownloadCsv")?.addEventListener("click", () => {
      if (!viewingPurchaseId) {
        toast("No purchase selected.");
        return;
      }
      exportPurchaseDetailsCsv(viewingPurchaseId);
    });
    document.querySelector("#btnResetPurchaseForm")?.addEventListener("click", resetPurchaseForm);
    $("#purchaseSource").addEventListener("change", () => {
      renderPurchasePartyOptions();
    });
    const pCond = document.querySelector("#purchaseVehicleCondition");
    if (pCond) {
      pCond.addEventListener("change", () =>
        updatePurchaseLeaseSectionVisibility({ openLeaseDialogIfUsed: true })
      );
    }
    document.querySelector("#btnOpenPurchaseLeaseDialog")?.addEventListener("click", () => {
      const dlg = document.querySelector("#purchaseLeaseDialog");
      if (dlg && typeof dlg.showModal === "function") {
        try {
          dlg.showModal();
        } catch {
          /* unavailable */
        }
      }
    });
    document.querySelector("#btnClosePurchaseLeaseDialog")?.addEventListener("click", () => {
      document.querySelector("#purchaseLeaseDialog")?.close();
    });
    document.querySelector("#btnDonePurchaseLeaseDialog")?.addEventListener("click", () => {
      document.querySelector("#purchaseLeaseDialog")?.close();
    });
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

  // inventory view dialog
  const closeInvView = () => document.querySelector("#inventoryViewDialog")?.close();
  document.querySelector("#btnCloseInventoryViewDialog")?.addEventListener("click", closeInvView);
  document.querySelector("#btnInventoryViewCloseFooter")?.addEventListener("click", closeInvView);
  document.querySelector("#inventoryViewDialog")?.addEventListener("close", () => {
    openInventoryViewDialog.lastVehicleId = null;
    openInventoryViewDialog.hideDocs = false;
    const btnDocs = document.querySelector("#btnInventoryViewOpenDocs");
    if (btnDocs) btnDocs.hidden = false;
  });
  document.querySelector("#btnInventoryViewPdf")?.addEventListener("click", () => {
    const vid = openInventoryViewDialog.lastVehicleId;
    if (!vid) return toast("No vehicle selected.");
    exportVehicleDetailsPdf(vid);
  });
  document.querySelector("#btnInventoryViewOpenDocs")?.addEventListener("click", () => {
    const vid = openInventoryViewDialog.lastVehicleId;
    if (!vid) return toast("No vehicle selected.");
    closeInvView();
    docsDialogMode = "default";
    openDocsDialog(vid);
  });

  const closeQuickVehicle = () => closeVehicleQuickViewDialog();
  document.querySelector("#btnCloseVehicleQuickViewDialog")?.addEventListener("click", closeQuickVehicle);
  document.querySelector("#btnVehicleQuickViewCloseFooter")?.addEventListener("click", closeQuickVehicle);
  document.querySelector("#vehicleQuickViewDialog")?.addEventListener("close", () => {
    vehicleQuickViewVehicleId = null;
  });
  document.querySelector("#btnVehicleQuickViewDocs")?.addEventListener("click", () => {
    const vid = vehicleQuickViewVehicleId;
    if (!vid) return toast("No vehicle selected.");
    docsDialogMode = "default";
    openDocsDialog(vid);
  });
  document.querySelector("#btnVehicleQuickViewSoldDocs")?.addEventListener("click", () => {
    const vid = vehicleQuickViewVehicleId;
    if (!vid) return toast("No vehicle selected.");
    const v = getVehicleById(vid);
    if (!v || v.status !== "sold") return;
    docsDialogMode = "sold";
    openDocsDialog(vid);
  });
  document.querySelector("#btnVehicleQuickViewFullDetails")?.addEventListener("click", () => {
    const vid = vehicleQuickViewVehicleId;
    if (!vid) return toast("No vehicle selected.");
    closeQuickVehicle();
    openInventoryViewDialog(vid);
  });

  const closePick = () => document.querySelector("#vehicleSearchPickDialog")?.close();
  document.querySelector("#btnCloseVehicleSearchPickDialog")?.addEventListener("click", closePick);
  document.querySelector("#btnVehicleSearchPickCloseFooter")?.addEventListener("click", closePick);
}

function setCopyrightTexts() {
  const text = appCopyrightText();
  const homeCopyright = document.querySelector("#homeCopyright");
  if (homeCopyright) homeCopyright.textContent = text;
  const loginCopyright = document.querySelector("#loginCopyright");
  if (loginCopyright) loginCopyright.textContent = text;
  const setupCopyright = document.querySelector("#setupCopyright");
  if (setupCopyright) setupCopyright.textContent = text;
}

// Refused vehicles
function normalizeRefusedVehicle(x) {
  const v = x || {};
  return {
    id: String(v.id || "").trim() || uid("refused"),
    createdAt: String(v.createdAt || "").trim() || nowIso(),
    updatedAt: String(v.updatedAt || "").trim() || nowIso(),
    vehicleNumber: String(v.vehicleNumber || "").trim(),
    model: String(v.model || "").trim(),
    make: String(v.make || "").trim(),
    year: v.year != null && String(v.year).trim() !== "" ? Number(v.year) : "",
    chassisNumber: String(v.chassisNumber || "").trim(),
    broker: String(v.broker || "").trim(),
    currentOwner: String(v.currentOwner || "").trim(),
    location: String(v.location || "").trim(),
    reason: String(v.reason || "").trim(),
    docs: Array.isArray(v.docs) ? v.docs : [],
  };
}

let refusedDialogEditingId = null;

function renderRefusedDocsList(docs) {
  const host = document.querySelector("#refusedDocsList");
  if (!host) return;
  const list = Array.isArray(docs) ? docs : [];
  host.innerHTML = "";
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No documents uploaded.";
    host.appendChild(empty);
    return;
  }
  for (const doc of list.slice().sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")))) {
    const row = document.createElement("div");
    row.className = "docItem";
    const name = String(doc.name || "file");
    const sub = [];
    if (doc.type) sub.push(doc.type);
    if (doc.size) sub.push(`${Math.round(Number(doc.size) / 1024)} KB`);
    if (doc.addedAt) sub.push(new Date(doc.addedAt).toLocaleString());
    row.innerHTML = `
      <div class="docItem__main">
        <div class="docItem__name">${escapeHtml(name)}</div>
        <div class="docItem__sub">${escapeHtml(sub.join(" · "))}</div>
      </div>
      <div class="docItem__actions">
        <a class="btn btn--table btn--table-compact" href="${escapeAttr(doc.dataUrl || "#")}" target="_blank" rel="noreferrer">View</a>
        <a class="btn btn--table btn--table-export btn--table-compact" href="${escapeAttr(doc.dataUrl || "#")}" download="${escapeAttr(name)}">Download</a>
        <button class="btn btn--table btn--table-danger btn--table-compact" type="button">Remove</button>
      </div>
    `;
    const btnRemove = row.querySelector("button");
    btnRemove?.addEventListener("click", () => {
      if (!confirm(`Remove document "${name}"?`)) return;
      const id = refusedDialogEditingId;
      if (!id) return;
      db.refusedVehicles = Array.isArray(db.refusedVehicles) ? db.refusedVehicles : [];
      const rec = db.refusedVehicles.find((r) => r.id === id);
      if (!rec) return;
      rec.docs = (Array.isArray(rec.docs) ? rec.docs : []).filter((d) => d.id !== doc.id);
      rec.updatedAt = nowIso();
      persist();
      renderRefusedDocsList(rec.docs);
      renderRefusedVehicles();
      toast("Removed.");
    });
    host.appendChild(row);
  }
}

function fillRefusedVehicleFormFromRecord(r0) {
  const r = normalizeRefusedVehicle(r0);
  refusedDialogEditingId = r.id;
  const id = document.querySelector("#refusedVehicleId");
  if (id) id.value = r.id;
  const set = (sel, val) => {
    const el = document.querySelector(sel);
    if (el) el.value = val ?? "";
  };
  set("#refusedVehicleNumber", r.vehicleNumber);
  set("#refusedModel", r.model);
  set("#refusedMake", r.make);
  set("#refusedYear", r.year === "" ? "" : String(r.year));
  set("#refusedChassisNumber", r.chassisNumber);
  set("#refusedBroker", r.broker);
  set("#refusedCurrentOwner", r.currentOwner);
  set("#refusedLocation", r.location);
  set("#refusedReason", r.reason);
  renderRefusedDocsList(r.docs);
}

function openRefusedVehicleFormDialogForNew() {
  clearRefusedVehicleForm();
  const id = uid("refused");
  refusedDialogEditingId = id;
  const elId = document.querySelector("#refusedVehicleId");
  if (elId) elId.value = id;
  renderRefusedDocsList([]);
  const dlg = document.querySelector("#refusedVehicleFormDialog");
  if (dlg && typeof dlg.showModal === "function") dlg.showModal();
}

function openRefusedVehicleFormDialogForEdit(id) {
  db.refusedVehicles = Array.isArray(db.refusedVehicles) ? db.refusedVehicles : [];
  const rec = db.refusedVehicles.find((r) => r.id === id);
  if (!rec) return toast("Record not found.");
  fillRefusedVehicleFormFromRecord(rec);
  const dlg = document.querySelector("#refusedVehicleFormDialog");
  if (dlg && typeof dlg.showModal === "function") dlg.showModal();
}

function clearRefusedVehicleForm() {
  const id = document.querySelector("#refusedVehicleId");
  if (id) id.value = "";
  refusedDialogEditingId = null;
  const map = [
    ["#refusedVehicleNumber", ""],
    ["#refusedModel", ""],
    ["#refusedMake", ""],
    ["#refusedYear", ""],
    ["#refusedChassisNumber", ""],
    ["#refusedBroker", ""],
    ["#refusedCurrentOwner", ""],
    ["#refusedLocation", ""],
    ["#refusedReason", ""],
  ];
  for (const [sel, val] of map) {
    const el = document.querySelector(sel);
    if (el) el.value = val;
  }
  renderRefusedDocsList([]);
}

function upsertRefusedVehicleFromForm() {
  if (!can(PERMS.INVENTORY_VIEW)) {
    toast("No permission.");
    return;
  }
  db.refusedVehicles = Array.isArray(db.refusedVehicles) ? db.refusedVehicles : [];
  const id = String(document.querySelector("#refusedVehicleId")?.value || "").trim() || refusedDialogEditingId || uid("refused");
  refusedDialogEditingId = id;
  const existing = db.refusedVehicles.find((r) => r.id === id);
  const payload = normalizeRefusedVehicle({
    id,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    vehicleNumber: document.querySelector("#refusedVehicleNumber")?.value || "",
    model: document.querySelector("#refusedModel")?.value || "",
    make: document.querySelector("#refusedMake")?.value || "",
    year: document.querySelector("#refusedYear")?.value || "",
    chassisNumber: document.querySelector("#refusedChassisNumber")?.value || "",
    broker: document.querySelector("#refusedBroker")?.value || "",
    currentOwner: document.querySelector("#refusedCurrentOwner")?.value || "",
    location: document.querySelector("#refusedLocation")?.value || "",
    reason: document.querySelector("#refusedReason")?.value || "",
    docs: Array.isArray(existing?.docs) ? existing.docs : [],
  });

  if (!payload.vehicleNumber && !payload.chassisNumber) {
    toast("Enter Vehicle number or Chassis number.");
    return;
  }
  if (!payload.reason) {
    toast("Enter reason for rejection.");
    return;
  }

  const idx = db.refusedVehicles.findIndex((r) => r.id === payload.id);
  if (idx >= 0) db.refusedVehicles[idx] = payload;
  else db.refusedVehicles.unshift(payload);
  persist();
  renderRefusedVehicles();
  clearRefusedVehicleForm();
  document.querySelector("#refusedVehicleFormDialog")?.close();
  toast("Saved.");
}

function refusedMatchesQuery(r, q) {
  if (!q) return true;
  const hay = `${r.vehicleNumber} ${r.chassisNumber}`.toLowerCase();
  return hay.includes(q.toLowerCase());
}

function renderRefusedVehicles() {
  const tbody = document.querySelector("#refusedVehiclesTable tbody");
  const summary = document.querySelector("#refusedVehiclesSummary");
  const q = String(document.querySelector("#refusedVehicleSearch")?.value || "").trim();
  if (!tbody || !summary) return;

  db.refusedVehicles = Array.isArray(db.refusedVehicles) ? db.refusedVehicles : [];
  const list = db.refusedVehicles
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .filter((r) => refusedMatchesQuery(normalizeRefusedVehicle(r), q));

  tbody.innerHTML = "";
  for (const raw of list) {
    const r = normalizeRefusedVehicle(raw);
    const tr = document.createElement("tr");
    const date = r.createdAt ? new Date(r.createdAt).toLocaleString() : "—";
    const docsCount = Array.isArray(r.docs) ? r.docs.length : 0;
    tr.innerHTML = `
      <td>${escapeHtml(date)}</td>
      <td><strong>${escapeHtml(r.vehicleNumber || "—")}</strong></td>
      <td>${escapeHtml(r.make || "—")}</td>
      <td>${escapeHtml(r.model || "—")}</td>
      <td class="num">${r.year !== "" ? escapeHtml(String(r.year)) : "—"}</td>
      <td>${escapeHtml(r.chassisNumber || "—")}</td>
      <td>${escapeHtml(r.broker || "—")}</td>
      <td>${escapeHtml(r.currentOwner || "—")}</td>
      <td>${escapeHtml(r.location || "—")}</td>
      <td><span class="pill">${docsCount} file${docsCount === 1 ? "" : "s"}</span></td>
      <td style="max-width: 360px; white-space: pre-wrap;">${escapeHtml(r.reason || "—")}</td>
      <td class="actions"></td>
    `;
    const actions = tr.querySelector(".actions");
    const btnEdit = mkBtn("View / Edit", "btn btn--table btn--table-primary btn--table-compact");
    btnEdit.addEventListener("click", () => openRefusedVehicleFormDialogForEdit(r.id));
    const btnDelete = mkBtn("Delete", "btn btn--table btn--table-danger btn--table-compact");
    btnDelete.addEventListener("click", () => {
      if (!confirm("Delete this refused vehicle record?")) return;
      db.refusedVehicles = (db.refusedVehicles || []).filter((x) => x.id !== r.id);
      persist();
      renderRefusedVehicles();
      toast("Deleted.");
    });
    actions?.append(btnEdit, btnDelete);
    tbody.appendChild(tr);
  }
  summary.textContent = `${list.length} refused vehicle${list.length === 1 ? "" : "s"}`;
}

function renderInvoiceBranding() {
  const companyName = String(db.meta.companyName || "").trim() || "E-Inventory";
  $("#appCompanyName").textContent = companyName;
  $("#companyName").value = db.meta.companyName || "";
  $("#companyAddress").value = db.meta.companyAddress || "";
  $("#companyPhone").value = db.meta.companyPhone || "";
  const p2 = document.querySelector("#companyPhone2");
  if (p2) p2.value = db.meta.companyPhone2 || "";
  $("#companyEmail").value = db.meta.companyEmail || "";
  $("#companyWebsite").value = db.meta.companyWebsite || "";

  // Build brand details in the order you requested:
  // Address, then Phone(s), then Email, then Website.
  const addr = String(db.meta.companyAddress || "").trim();
  const phone = String(db.meta.companyPhone || "").trim();
  const phone2 = String(db.meta.companyPhone2 || "").trim();
  const email = String(db.meta.companyEmail || "").trim();
  const website = String(db.meta.companyWebsite || "").trim();
  const detailsPieces = [
    addr || "—",
    [phone, phone2].filter(Boolean).join(" / ") || "—",
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
    ? `<img src="${escapeAttr(db.meta.invoiceLogoDataUrl)}" style="width:100px;height:100px;object-fit:contain;border:1px solid #ddd;border-radius:14px;background:#f6f6f6;" />`
    : "";
  const phones = [db.meta.companyPhone, db.meta.companyPhone2].map((x) => String(x || "").trim()).filter(Boolean).join(" / ");
  const companyLine = [db.meta.companyAddress, phones, db.meta.companyEmail, db.meta.companyWebsite]
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
  renderRefusedVehicles();
  renderMarketplace();
  renderCart();
  renderQuotation();
  renderLedger();
  renderReports();
  renderDailyReport();
  renderUsers();
  renderBusinessesUi();
  renderBrokers();
  renderSuppliers();
  renderPurchases();
  renderCustomers();
  renderInvoiceCustomerPick();
  renderInvoiceSentSettings();
  renderGarageJobs();
}

async function bootstrap() {
  if (USE_SUPABASE && location.protocol === "file:") {
    toast("Use a local server (not file://): open PowerShell in this folder and run: php -S localhost:8080 — then visit http://localhost:8080/");
  }
  await initRemoteStorage();
  if (!useRemoteDb) {
    auth = ensureAuthSeed();
  }

  // On refresh, make sure we load the correct business DB for the logged-in session.
  // Otherwise the app may show another business' data (default DB) until you re-login.
  if (currentUser()) {
    if (useRemoteDb) {
      await loadBusinessData({ silent: true });
    } else {
      const biz = getActiveBusinessId() || DEFAULT_BUSINESS_ID;
      db = ensureBusinessDbInitialized(biz);
    }
  }

  db.customers = Array.isArray(db.customers) ? db.customers : [];
  db.garageJobs = Array.isArray(db.garageJobs) ? db.garageJobs : [];
  db.quotations = Array.isArray(db.quotations) ? db.quotations : [];
  db.refusedVehicles = Array.isArray(db.refusedVehicles) ? db.refusedVehicles : [];
  db.cart = db.cart || { items: [], discount: 0, extras: [] };
  db.cart.items = Array.isArray(db.cart.items) ? db.cart.items : [];
  db.cart.extras = Array.isArray(db.cart.extras) ? db.cart.extras : [];
  if (typeof db.meta.initialSetupDone !== "boolean") db.meta.initialSetupDone = false;
  if (typeof db.meta.invoiceSentAuto !== "boolean") db.meta.invoiceSentAuto = false;
  if (!String(db.meta.invoiceSentTemplate || "").trim()) db.meta.invoiceSentTemplate = INVOICE_SENT_TEMPLATE;
  if (String(db.meta.invoiceSentTemplate || "").trim() === INVOICE_SENT_TEMPLATE_OLD) {
    db.meta.invoiceSentTemplate = INVOICE_SENT_TEMPLATE;
  }
  ensureQuotationTermsMeta();
  migrateLedgerEntries();

  initNav();
  initEvents();
  await refreshBusinessesFromServer();
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
  const drFrom = document.querySelector("#dailyReportFrom");
  const drTo = document.querySelector("#dailyReportTo");
  if (drFrom && !drFrom.value) drFrom.value = todayISODate();
  if (drTo && !drTo.value) drTo.value = todayISODate();
  const qt = document.querySelector("#quotationTerms");
  if (qt && !String(qt.value || "").trim()) qt.value = db.meta.quotationTerms || DEFAULT_QUOTATION_TERMS;
  renderPurchasePartyOptions();
  renderPurchaseVehicleBrokerOptions();
  updatePurchaseLeaseSectionVisibility();
  renderAll();
  renderInvoicePreview();
  renderInvoiceBranding();
  setUserUi();

  // Always land on Home (so login isn't on a blank/empty screen)
  // Refresh should always land on Home.
  // If the URL had marketplace params, clear them to avoid "sticky" refresh state.
  try {
    const params = new URLSearchParams(location.search);
    if (params.get("marketplace") === "1" || params.get("veh")) {
      params.delete("marketplace");
      params.delete("veh");
      const qs = params.toString();
      history.replaceState({}, "", qs ? `${location.pathname}?${qs}` : location.pathname);
    }
  } catch {
    // ignore
  }
  setActiveTab("home");

  if (useRemoteDb && !sessionStorage.getItem("pos_mysql_ok")) {
    sessionStorage.setItem("pos_mysql_ok", "1");
    toast("Using MySQL server for data & login.");
  }

  if (!db.meta.initialSetupDone) {
    openSetup();
    return;
  }
  if (!currentUser()) openLogin();
}

bootstrap();
