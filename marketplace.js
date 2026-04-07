/* Standalone Marketplace page — does not share session/state with index.html */
(function () {
  const DB_PREFIX = "vehicle_pos_db_v1";

  function $(sel) {
    return document.querySelector(sel);
  }

  function toast(msg) {
    const el = $("#mpToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-on");
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("`", "&#96;");
  }

  function formatMoney(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "—";
    return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function safeNumber(n, fallback = 0) {
    const x = Number(n);
    return Number.isFinite(x) ? x : fallback;
  }

  function normalizeVehicleExtraItems(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((ex) => {
        const name = String(ex?.name ?? "").trim();
        const qty = Math.max(1, safeNumber(ex?.qty, 1));
        const price = Math.max(0, safeNumber(ex?.price, 0));
        return { name, qty, price };
      })
      .filter((ex) => ex.name.length > 0);
  }

  function sumVehicleExtraItemsMoney(items) {
    return normalizeVehicleExtraItems(items).reduce(
      (s, ex) => s + safeNumber(ex.price, 0) * Math.max(1, safeNumber(ex.qty, 1)),
      0
    );
  }

  function vehicleSellingPriceTotal(v) {
    if (!v) return 0;
    return Math.max(0, safeNumber(v.sellPrice, 0)) + sumVehicleExtraItemsMoney(v.extraItems || []);
  }

  function vehicleLabel(v) {
    const year = v.year != null && v.year !== "" ? `${v.year} ` : "";
    return `${year}${v.make || ""} ${v.model || ""}`.trim();
  }

  function marketplaceCopyrightText() {
    const year = new Date().getFullYear();
    return `Copyright © ${year} Axiom Lanka Holdings. All rights reserved.`;
  }

  function companyMetaLine(c) {
    const addr = String(c.companyAddress || "").trim();
    const p1 = String(c.companyPhone || "").trim();
    const p2 = String(c.companyPhone2 || "").trim();
    const phones = [p1, p2].filter(Boolean).join(" / ");
    const email = String(c.companyEmail || "").trim();
    const web = String(c.companyWebsite || "").trim();
    return [addr, phones, email, web].filter(Boolean).join(" · ") || "—";
  }

  function getParams() {
    return new URLSearchParams(location.search);
  }

  function currentBizId() {
    return getParams().get("biz") || "biz_default";
  }

  function marketplacePageUrl({ vehicleId = "" } = {}) {
    const u = new URL("marketplace.html", location.href);
    u.searchParams.set("biz", currentBizId());
    const local = getParams().get("local") === "1";
    if (local) u.searchParams.set("local", "1");
    if (vehicleId) u.searchParams.set("veh", String(vehicleId));
    return u.toString();
  }

  async function copyText(text) {
    const t = String(text ?? "");
    if (!t) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch {
      /* fall through */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = t;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }

  let state = {
    company: {},
    vehicles: [],
    filtered: [],
  };

  function setHeader() {
    const name = String(state.company.companyName || "").trim() || "E-Inventory";
    const titleEl = $("#mpCompanyName");
    if (titleEl) titleEl.textContent = name;
    const metaEl = $("#mpCompanyMeta");
    if (metaEl) metaEl.textContent = companyMetaLine(state.company);
    const mark = $("#mpLogoMark");
    if (mark) {
      const parts = name.split(" ").filter(Boolean);
      const letters = ((parts[0]?.[0] || "E") + (parts[1]?.[0] || "I")).toUpperCase();
      mark.textContent = letters;
    }
  }

  function placeholderSvg(label) {
    const safe = escapeHtml(label || "Vehicle");
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><rect width="800" height="520" rx="24" fill="#f1f5f9"/><text x="50%" y="52%" text-anchor="middle" font-family="Arial,sans-serif" font-size="32" font-weight="700" fill="#334155">${safe}</text><text x="50%" y="60%" text-anchor="middle" font-family="Arial,sans-serif" font-size="16" fill="#64748b">No image</text></svg>`
    )}`;
  }

  function renderList() {
    setHeader();
    const grid = $("#mpGrid");
    const sum = $("#mpSummary");
    const detail = $("#mpVehicleDetail");
    if (detail) {
      detail.hidden = true;
      detail.innerHTML = "";
    }
    if (grid) grid.hidden = false;

    const list = state.vehicles.slice();
    state.filtered = list;

    if (!grid) return;
    const cards = list
      .map((v) => {
        const title = vehicleLabel(v) || "Vehicle";
        const img =
          v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")
            ? String(v.imageDataUrl).trim()
            : placeholderSvg(title);
        const price = formatMoney(vehicleSellingPriceTotal(v));
        const bits = [v.make, v.model].filter(Boolean).join(" ");
        const year = v.year != null && v.year !== "" ? String(v.year) : "—";
        const stock = String(v.stockNo || "").trim() ? `Stock: ${escapeHtml(v.stockNo)}` : "";
        const href = marketplacePageUrl({ vehicleId: v.id });
        return `
        <article class="marketCard" data-mp-veh="${escapeAttr(v.id)}" tabindex="0" role="link" aria-label="Open ${escapeAttr(title)}">
          <div class="marketCard__imgWrap">
            <img class="marketCard__img" src="${escapeAttr(img)}" alt="${escapeAttr(title)}" />
          </div>
          <div class="marketCard__body">
            <div class="marketCard__title">${escapeHtml(bits || title)}</div>
            <div class="marketCard__sub muted">${escapeHtml(year)}${stock ? ` · ${stock}` : ""}</div>
            <div class="marketCard__price">${escapeHtml(price)}</div>
          </div>
          <div class="marketCard__footer">
            <a class="marketCard__link" href="${escapeAttr(href)}">View details</a>
            <button class="btn btn--sm" type="button" data-mp-copy="${escapeAttr(v.id)}">Copy link</button>
          </div>
        </article>`;
      })
      .join("");

    grid.innerHTML = cards || `<div class="muted" style="padding: 18px">No available vehicles.</div>`;
    if (sum) sum.textContent = `${list.length} vehicles`;
  }

  function renderDetail(vehicleId) {
    setHeader();
    const v = state.vehicles.find((x) => String(x.id) === String(vehicleId));
    const detail = $("#mpVehicleDetail");
    const grid = $("#mpGrid");
    if (!detail || !grid) return;

    if (!v) {
      grid.hidden = true;
      detail.hidden = false;
      detail.innerHTML = `<div class="card"><div class="card__header"><h3>Not found</h3></div><div class="card__footer muted">This vehicle is not listed.</div></div>`;
      return;
    }

    grid.hidden = true;
    detail.hidden = false;
    const title = vehicleLabel(v) || "Vehicle";
    const img =
      v.imageDataUrl && String(v.imageDataUrl).trim().startsWith("data:image/")
        ? String(v.imageDataUrl).trim()
        : "";
    const price = formatMoney(vehicleSellingPriceTotal(v));
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
    const notes = String(v.notes || "").trim();
    detail.innerHTML = `
      <div class="marketDetail card">
        <div class="marketDetail__header">
          <div>
            <h3 style="margin:0">${escapeHtml(title)}</h3>
            <div class="muted">${escapeHtml(v.stockNo || "")}${v.stockNo ? " · " : ""}${escapeHtml(String(v.vehicleNumber || ""))}</div>
          </div>
          <div class="marketDetail__actions">
            <div class="marketDetail__price">${escapeHtml(price)}</div>
            <a class="btn" href="${escapeAttr(marketplacePageUrl())}">Back to list</a>
            <button class="btn" type="button" data-mp-copy="${escapeAttr(v.id)}">Copy link</button>
          </div>
        </div>
        <div class="marketDetail__grid">
          <div class="marketDetail__media">
            ${
              img
                ? `<img class="marketDetail__img" src="${escapeAttr(img)}" alt="${escapeAttr(title)}" />`
                : `<div class="marketDetail__imgPlaceholder muted">No image</div>`
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
          notes
            ? `<div class="marketDetail__notes"><div class="muted" style="font-weight:700;margin-bottom:6px;">Notes</div><div>${escapeHtml(notes).replace(/\n/g, "<br />")}</div></div>`
            : ""
        }
      </div>`;
  }

  function syncRoute() {
    const veh = getParams().get("veh");
    if (veh) renderDetail(veh);
    else renderList();
  }

  async function load() {
    const params = getParams();
    const biz = params.get("biz") || "biz_default";
    const local = params.get("local") === "1";

    if (local) {
      const key = `${DB_PREFIX}:${biz}`;
      let raw = localStorage.getItem(key);
      if (!raw && biz === "biz_default") {
        raw = localStorage.getItem(DB_PREFIX);
      }
      if (!raw) {
        state.company = { companyName: "E-Inventory" };
        state.vehicles = [];
        toast("No local data for this business on this device.");
        syncRoute();
        return;
      }
      let db;
      try {
        db = JSON.parse(raw);
      } catch {
        state.company = { companyName: "E-Inventory" };
        state.vehicles = [];
        toast("Could not read saved data.");
        syncRoute();
        return;
      }
      const meta = db.meta || {};
      state.company = {
        companyName: meta.companyName || "E-Inventory",
        companyAddress: meta.companyAddress || "",
        companyPhone: meta.companyPhone || "",
        companyPhone2: meta.companyPhone2 || "",
        companyEmail: meta.companyEmail || "",
        companyWebsite: meta.companyWebsite || "",
      };
      state.vehicles = (Array.isArray(db.vehicles) ? db.vehicles : [])
        .filter((v) => String(v.status || "available") !== "sold")
        .map((v) => ({
          id: String(v.id || ""),
          stockNo: String(v.stockNo || ""),
          make: String(v.make || ""),
          model: String(v.model || ""),
          year: v.year,
          sellPrice: Number(v.sellPrice) || 0,
          extraItems: Array.isArray(v.extraItems) ? v.extraItems : [],
          vehicleNumber: String(v.vehicleNumber || ""),
          vehicleType: String(v.vehicleType || ""),
          color: String(v.color || ""),
          imageDataUrl: typeof v.imageDataUrl === "string" ? v.imageDataUrl : "",
          notes: String(v.notes || ""),
        }));
      syncRoute();
      return;
    }

    try {
      const r = await fetch(`api/marketplace.php?biz=${encodeURIComponent(biz)}`);
      const body = await r.json();
      if (!body || !body.ok) {
        state.company = { companyName: "E-Inventory" };
        state.vehicles = [];
        toast((body && body.error) || "Could not load marketplace.");
        syncRoute();
        return;
      }
      state.company = body.company || {};
      state.vehicles = Array.isArray(body.vehicles) ? body.vehicles : [];
      syncRoute();
    } catch {
      state.company = { companyName: "E-Inventory" };
      state.vehicles = [];
      toast("Network error loading marketplace.");
      syncRoute();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const cr = $("#mpCopyright");
    if (cr) cr.textContent = marketplaceCopyrightText();

    $("#mpBtnCopyLink")?.addEventListener("click", async () => {
      const ok = await copyText(marketplacePageUrl());
      toast(ok ? "Link copied." : "Could not copy link.");
    });

    document.body.addEventListener("click", async (e) => {
      const t = e.target;
      const copyBtn = t.closest?.("[data-mp-copy]");
      if (copyBtn) {
        const id = String(copyBtn.getAttribute("data-mp-copy") || "").trim();
        const ok = await copyText(marketplacePageUrl({ vehicleId: id }));
        toast(ok ? "Vehicle link copied." : "Could not copy link.");
        return;
      }
      const card = t.closest?.("[data-mp-veh]");
      if (card && !t.closest("a, button")) {
        const id = String(card.getAttribute("data-mp-veh") || "").trim();
        history.pushState({}, "", marketplacePageUrl({ vehicleId: id }));
        syncRoute();
      }
    });

    document.body.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const card = e.target?.closest?.("[data-mp-veh]");
      if (!card) return;
      const id = String(card.getAttribute("data-mp-veh") || "").trim();
      history.pushState({}, "", marketplacePageUrl({ vehicleId: id }));
      syncRoute();
    });

    window.addEventListener("popstate", () => syncRoute());

    load();
  });
})();
