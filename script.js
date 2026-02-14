/* =========================================================
   DHL eCommerce · Customer Master Data Viewer (D3)
   - Loads data from /data folder
   - Filters work before scenario selection (filter-first UX)
   - Reference IDs are NOT rendered as separate nodes
   - Contact comm channels are rendered as attributes (not nodes)
   ========================================================= */

"use strict";

/* ---------------- Paths ---------------- */
const PATHS = {
    customers: "data/customerData.json",
    reference: "data/reference_master_data.json",
    colors: "data/reference_colors.json"
};

/* ---------------- UI hooks ---------------- */
const UI = {
    selector: document.getElementById("scenarioSelector"),
    search: document.getElementById("nodeSearch"),
    reset: document.getElementById("resetZoom"),

    fCustomerType: document.getElementById("filterCustomerType"),
    fIndustry: document.getElementById("filterIndustry"),
    fSalesChannel: document.getElementById("filterSalesChannel"),
    fPlatform: document.getElementById("filterPlatform"),
    btnClearFilters: document.getElementById("clearFilters"),
    btnApplyFilters: document.getElementById("applyFilters"),

    tCompact: document.getElementById("toggleCompact"),
    tAddresses: document.getElementById("showAddresses"),
    tContacts: document.getElementById("showContacts"),
    tReferenceIds: document.getElementById("showReferenceIds"),
    tPlatforms: document.getElementById("showPlatforms"),

    btnCollapseAll: document.getElementById("collapseAll"),
    btnExpandAll: document.getElementById("expandAll"),

    json: document.getElementById("json-display"),

    refEnumsPreview: document.getElementById("refEnumsPreview"),
    refColorsPreview: document.getElementById("refColorsPreview"),
    swatches: document.getElementById("colorSwatches"),

    dqBadge: document.getElementById("dqBadge"),
    dqDot: document.getElementById("dqDot"),
    dqText: document.getElementById("dqText"),

    viz: document.getElementById("viz-container")
};

/* ---------------- State ---------------- */
let scenarios = [];
let refEnums = {};
let refColors = {};

let activeScenarioIndex = -1;
let activeScenario = null;

let svg, g, zoom;
let lastRootHierarchy = null;

/* ---------------- Layout ---------------- */
const LAYOUT = {
    normal: { nodeW: 300, nodeH: 150, gapX: 60, gapY: 22 }
};
let currentRenderConfig = LAYOUT.normal;

/* ---------------- Helpers ---------------- */
function asArray(v) {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
}

function safeString(v) {
    if (v === null || v === undefined) return "";
    return String(v);
}

function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
}

function el(id) {
    return document.getElementById(id);
}

function safeOn(elem, evt, fn) {
    if (elem && typeof elem.addEventListener === "function") {
        elem.addEventListener(evt, fn);
    }
}

async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
    return await res.json();
}

function getSelectedValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions || []).map(o => o.value);
}

function fillMultiSelect(selectEl, values) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    (values || []).forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    });
}

/* ---------------- Reference colors ---------------- */
function buildTokenHexMap(colorsObj) {
    const map = new Map();

    const walk = (obj) => {
        if (!obj || typeof obj !== "object") return;
        Object.values(obj).forEach(v => {
            if (!v || typeof v !== "object") return;
            if (v.token && v.hex) map.set(v.token, v.hex);
            walk(v);
        });
    };

    walk(colorsObj);
    return map;
}

function resolveColor(tokenOrHex, tokenMap) {
    const s = safeString(tokenOrHex).trim();
    if (!s) return null;
    if (s.startsWith("#")) return s;
    if (tokenMap && tokenMap.has(s)) return tokenMap.get(s);
    return null;
}

/* ---------------- Semantic styling ---------------- */
function semanticKeyForNodeType(nodeType) {
    // align with reference_colors.json semanticMapping keys
    switch (nodeType) {
        case "GLOBAL_CUSTOMER": return "GLOBAL_CUSTOMER";
        case "COUNTRY_CUSTOMER": return "COUNTRY_CUSTOMER";
        case "ACCOUNT_SOLDTO":
        case "ACCOUNT_SUB": return "ACCOUNT";
        case "CONTRACT": return "CONTRACT";
        case "BILLING_PROFILE": return "BILLING_PROFILE";
        case "CONTACT": return "CONTACT";
        case "ADDRESS": return "ADDRESS";
        case "PLATFORM": return "PLATFORM";
        default: return "ACCOUNT";
    }
}

function iconFor(nodeType, obj) {
    // simple emoji icons (no extra libs)
    const t = nodeType;
    if (t === "GLOBAL_CUSTOMER") return "🌐";
    if (t === "COUNTRY_CUSTOMER") return "🏳️";
    if (t === "ACCOUNT_SOLDTO") return "🏢";
    if (t === "ACCOUNT_SUB") return (asArray(obj?.businessRoles).includes("PICKUP") ? "📦" : "🏬");
    if (t === "CONTRACT") return "📄";
    if (t === "BILLING_PROFILE") return "💳";
    if (t === "CONTACT") return "👤";
    if (t === "ADDRESS") {
        const at = obj?.addressType;
        if (at === "PICKUP") return "📦";
        if (at === "BILLING") return "💰";
        if (at === "REGISTERED_OFFICE") return "🏛️";
        return "📍";
    }
    if (t === "PLATFORM") return "🧩";
    return "⬚";
}

function displayNameFor(nodeType, obj) {
    if (!obj) return nodeType;
    switch (nodeType) {
        case "GLOBAL_CUSTOMER":
        case "COUNTRY_CUSTOMER":
            return obj.tradingName || obj.officialName || obj.mdmCustomerId || "Customer";
        case "ACCOUNT_SOLDTO":
        case "ACCOUNT_SUB":
            return obj.tradingName || obj.officialName || obj.mdmAccountId || "Account";
        case "CONTRACT":
            return obj.contractName || obj.contractId || "Contract";
        case "BILLING_PROFILE":
            return obj.billingProfileId || obj.billingAccountNumber || "Billing Profile";
        case "CONTACT":
            return `${obj.firstName || ""} ${obj.lastName || ""}`.trim() || obj.contactPersonId || "Contact";
        case "ADDRESS":
            return `${obj.addressType || "ADDRESS"} · ${obj.city || ""}`.trim() || obj.addressId || "Address";
        case "PLATFORM":
            return obj.name || obj.platformId || "Platform";
        default:
            return nodeType;
    }
}

/* ---------------- View toggles ---------------- */
function getVis() {
    return {
        showAddresses: !!UI.tAddresses?.checked,
        showContacts: !!UI.tContacts?.checked,
        showReferenceIds: !!UI.tReferenceIds?.checked,
        showPlatforms: !!UI.tPlatforms?.checked
    };
}

/* ---------------- Key-lines (attributes on node card) ---------------- */
function refSummary(referenceIds) {
    const refs = asArray(referenceIds);
    if (!refs.length) return null;
    // keep short: first 2 refs
    const top = refs.slice(0, 2).map(r => `${r.refType}:${r.refValue}`).filter(Boolean);
    const more = refs.length > 2 ? ` (+${refs.length - 2})` : "";
    return top.length ? top.join(" | ") + more : null;
}

function commSummary(channels) {
    const arr = asArray(channels);
    if (!arr.length) return null;
    const email = arr.find(x => (x?.type || "").toUpperCase() === "EMAIL")?.value;
    const phone = arr.find(x => (x?.type || "").toUpperCase() === "PHONE")?.value;
    const parts = [];
    if (email) parts.push(`Email: ${email}`);
    if (phone) parts.push(`Phone: ${phone}`);
    if (!parts.length) {
        const top = arr.slice(0, 2).map(x => `${x.type}:${x.value}`).filter(Boolean);
        return top.join(" | ");
    }
    return parts.join(" · ");
}

function pickKeyLines(nodeType, obj) {
    const vis = getVis();
    const lines = [];

    if (!obj) return lines;

    if (nodeType === "GLOBAL_CUSTOMER" || nodeType === "COUNTRY_CUSTOMER") {
        if (obj.mdmCustomerId) lines.push(`mdmCustomerId: ${obj.mdmCustomerId}`);
        if (obj.customerType) lines.push(`customerType: ${obj.customerType}`);
        if (obj.industrySector) lines.push(`industrySector: ${obj.industrySector}`);
        if (obj.globalGroupCode) lines.push(`group: ${obj.globalGroupCode}`);
    }

    if (nodeType === "ACCOUNT_SOLDTO" || nodeType === "ACCOUNT_SUB") {
        if (obj.mdmAccountId) lines.push(`mdmAccountId: ${obj.mdmAccountId}`);
        if (obj.businessRoles?.length) lines.push(`roles: ${asArray(obj.businessRoles).join(", ")}`);
        if (obj.salesChannel) lines.push(`salesChannel: ${obj.salesChannel}`);
        if (obj.currency) lines.push(`currency: ${obj.currency}`);
        if (vis.showPlatforms && obj.platformObject?.platformId) lines.push(`platformId: ${obj.platformObject.platformId}`);
        if (vis.showReferenceIds) {
            const rs = refSummary(obj.referenceIds);
            if (rs) lines.push(`refs: ${rs}`);
        }
    }

    if (nodeType === "CONTRACT") {
        if (obj.contractId) lines.push(`contractId: ${obj.contractId}`);
        if (obj.startDate) lines.push(`startDate: ${obj.startDate}`);
        if (vis.showReferenceIds) {
            const rs = refSummary(obj.referenceIds);
            if (rs) lines.push(`refs: ${rs}`);
        }
    }

    if (nodeType === "BILLING_PROFILE") {
        if (obj.billingProfileId) lines.push(`billingProfileId: ${obj.billingProfileId}`);
        if (obj.billingCurrency) lines.push(`billingCurrency: ${obj.billingCurrency}`);
        if (obj.invoiceDelivery) lines.push(`invoiceDelivery: ${obj.invoiceDelivery}`);
        if (vis.showReferenceIds) {
            const rs = refSummary(obj.referenceIds);
            if (rs) lines.push(`refs: ${rs}`);
        }
    }

    if (nodeType === "CONTACT") {
        if (obj.jobTitle) lines.push(`jobTitle: ${obj.jobTitle}`);
        const cs = commSummary(obj.communicationChannels);
        if (cs) lines.push(cs);
    }

    if (nodeType === "ADDRESS") {
        if (obj.addressType) lines.push(`addressType: ${obj.addressType}`);
        const loc = [obj.street, obj.houseNumber].filter(Boolean).join(" ");
        if (loc) lines.push(loc);
        const city = [obj.postalcode, obj.city].filter(Boolean).join(" ");
        if (city) lines.push(city);
        if (obj.country) lines.push(obj.country);
    }

    if (nodeType === "PLATFORM") {
        if (obj.platformId) lines.push(`platformId: ${obj.platformId}`);
        if (obj.type) lines.push(`type: ${obj.type}`);
        if (obj.provider) lines.push(`provider: ${obj.provider}`);
    }

    return lines.slice(0, 6);
}

/* ---------------- Build tree ---------------- */
function normalizeScenario(sc) {
    // tolerate older formats
    return {
        scenarioName: sc?.scenarioName,
        customer: sc?.customer || sc?.rootCustomer || sc?.globalCustomer || {},
        relatedCustomers: sc?.relatedCustomers || sc?.countryCustomers || [],
        accounts: sc?.accounts || []
    };
}

// Enrich node with Address/Contact/Platform children according to toggles
function enrichCommonChildren(node, obj, vis) {
    const children = [];

    // addresses
    if (vis.showAddresses) {
        asArray(obj?.addresses).forEach(a => {
            children.push({
                type: "ADDRESS",
                data: a,
                children: []
            });
        });
    }

    // contacts
    if (vis.showContacts) {
        asArray(obj?.contactPersons).forEach(cp => {
            children.push({
                type: "CONTACT",
                data: cp,
                children: []
            });
        });
    }

    // platform (as child node, but refIds stay as attributes)
    if (vis.showPlatforms && obj?.platformObject) {
        const p = obj.platformObject;
        // normalize platformId name
        const platformNode = {
            type: "PLATFORM",
            data: {
                platformId: p.platformId || p.id || p.name,
                name: p.name || p.platformId || p.id,
                type: p.type,
                provider: p.provider
            },
            children: []
        };
        children.push(platformNode);
    }

    node.children = asArray(node.children).concat(children);
    return node;
}

function buildAccountTree(accounts, vis) {
    const byId = new Map();
    const roots = [];

    asArray(accounts).forEach(acc => {
        byId.set(acc.mdmAccountId, {
            type: asArray(acc.businessRoles).includes("SOLDTO") ? "ACCOUNT_SOLDTO" : "ACCOUNT_SUB",
            data: acc,
            children: []
        });
    });

    // parent-child accounts
    byId.forEach(node => {
        const pid = node.data.parentAccountId;
        if (pid && byId.has(pid)) byId.get(pid).children.push(node);
        else roots.push(node);
    });

    // contracts attach to SOLD-TO (or any account that has them)
    byId.forEach(node => {
        asArray(node.data.contracts).forEach(c => {
            let contractNode = { type: "CONTRACT", data: c, children: [] };

            // billing profile under contract
            if (c.billingProfile) {
                const bp = { type: "BILLING_PROFILE", data: c.billingProfile, children: [] };
                enrichCommonChildren(bp, c.billingProfile, vis);
                contractNode.children.push(bp);
            }

            enrichCommonChildren(contractNode, c, vis);
            node.children.push(contractNode);
        });

        // finally, add addresses/contacts/platform under the account itself
        enrichCommonChildren(node, node.data, vis);
    });

    return roots;
}

function buildHierarchyForScenario(scenario, vis) {
    const s = normalizeScenario(scenario);

    let root = { type: "GLOBAL_CUSTOMER", data: s.customer, children: [] };
    enrichCommonChildren(root, s.customer, vis);

    // country customers (legal entities under group)
    const countryNodes = asArray(s.relatedCustomers).map(cc => {
        const n = { type: "COUNTRY_CUSTOMER", data: cc, children: [] };
        enrichCommonChildren(n, cc, vis);
        return n;
    });

    countryNodes.forEach(n => root.children.push(n));

    const accountRoots = buildAccountTree(s.accounts, vis);

    // attach accounts under matching country mdmCustomerId; otherwise under root
    if (countryNodes.length > 0) {
        const map = new Map(countryNodes.map(n => [n.data.mdmCustomerId, n]));
        accountRoots.forEach(ar => {
            const custId = ar.data.mdmCustomerId;
            if (custId && map.has(custId)) map.get(custId).children.push(ar);
            else root.children.push(ar);
        });
    } else {
        accountRoots.forEach(ar => root.children.push(ar));
    }

    // decorate for rendering
    function decorate(node) {
        node.name = displayNameFor(node.type, node.data);
        node.icon = iconFor(node.type, node.data);
        node.keyLines = pickKeyLines(node.type, node.data);
        node.semanticKey = semanticKeyForNodeType(node.type);
        node.children = asArray(node.children).map(decorate);
        return node;
    }

    return decorate(root);
}

/* ---------------- Viz init ---------------- */
function initViz() {
    UI.viz.innerHTML = "";
    svg = d3.select("#viz-container").append("svg").attr("width", "100%").attr("height", "100%");
    g = svg.append("g");

    zoom = d3.zoom()
        .scaleExtent([0.15, 3])
        .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);
}

function elbowLink(d, cfg) {
    // horizontal tree (y is depth)
    const sx = d.source.x + cfg.nodeH / 2;
    const sy = d.source.y + cfg.nodeW;
    const tx = d.target.x + cfg.nodeH / 2;
    const ty = d.target.y;
    const midY = (sy + ty) / 2;
    return `M${sy},${sx} H${midY} V${tx} H${ty}`;
}

function zoomToFit(padding = 40) {
    const container = UI.viz;
    const cw = container.clientWidth || 1200;
    const ch = container.clientHeight || 800;

    const bbox = g.node().getBBox();
    if (!bbox.width || !bbox.height) return;

    const scale = Math.min((cw - padding * 2) / bbox.width, (ch - padding * 2) / bbox.height);
    const s = Math.max(0.15, Math.min(2.5, scale));

    const tx = (cw / 2) - (bbox.x + bbox.width / 2) * s;
    const ty = (ch / 2) - (bbox.y + bbox.height / 2) * s;

    svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(s));
}

/* ---------------- Rendering ---------------- */
function getSemanticColors(semanticKey) {
    // default DHL-ish fallback
    const fallback = { header: "#D40511", body: "#FFF7D1", accent: "#000000" };
    const sm = refColors?.semanticMapping || null;
    if (!sm || !sm[semanticKey]) return fallback;

    const tokenMap = buildTokenHexMap(refColors);
    const m = sm[semanticKey];

    return {
        header: resolveColor(m.header, tokenMap) || fallback.header,
        body: resolveColor(m.body, tokenMap) || fallback.body,
        accent: resolveColor(m.accent, tokenMap) || fallback.accent
    };
}

function renderActiveScenario() {
    if (!activeScenario) return;

    const vis = getVis();
    const cfg = LAYOUT.normal;
    currentRenderConfig = cfg;

    g.selectAll("*").remove();

    const data = buildHierarchyForScenario(activeScenario, vis);
    const root = d3.hierarchy(data);
    lastRootHierarchy = root;

    // apply collapse state stored on data objects
    (function applyCollapseState(node) {
        if (node.data && node.data.__collapsed && node.children) {
            node._children = node.children;
            node.children = null;
        }
        (node.children || node._children || []).forEach(applyCollapseState);
    })(root);

    const tree = d3.tree()
        .nodeSize([cfg.nodeH + cfg.gapY, cfg.nodeW + cfg.gapX])
        .separation((a, b) => (a.parent === b.parent ? 0.95 : 1.2));

    tree(root);

    // links
    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d => elbowLink(d, cfg));

    // nodes
    const nodes = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    // card
    nodes.append("rect")
        .attr("class", "card")
        .attr("width", cfg.nodeW)
        .attr("height", cfg.nodeH)
        .attr("rx", 12)
        .attr("ry", 12);

    // header band
    nodes.append("rect")
        .attr("class", "card-header")
        .attr("width", cfg.nodeW)
        .attr("height", 34)
        .attr("rx", 12)
        .attr("ry", 12);

    // header text
    nodes.append("text")
        .attr("class", "card-title")
        .attr("x", 14)
        .attr("y", 22)
        .text(d => `${d.data.icon} ${safeString(d.data.name).slice(0, 34)}`);

    // attributes
    nodes.each(function (d) {
        const lines = asArray(d.data.keyLines);
        const group = d3.select(this);
        let y = 54;

        lines.forEach(line => {
            group.append("text")
                .attr("class", "card-line")
                .attr("x", 14)
                .attr("y", y)
                .text(safeString(line).slice(0, 54));
            y += 14;
        });

        // collapse indicator if has children
        const hasKids = (d.children && d.children.length) || (d._children && d._children.length);
        if (hasKids) {
            group.append("text")
                .attr("class", "collapse-hint")
                .attr("x", cfg.nodeW - 18)
                .attr("y", 22)
                .text(d.children ? "−" : "+");
        }
    });

    // apply semantic colors
    nodes.each(function (d) {
        const sem = getSemanticColors(d.data.semanticKey);
        const node = d3.select(this);
        node.select("rect.card").attr("fill", sem.body).attr("stroke", sem.accent);
        node.select("rect.card-header").attr("fill", sem.header).attr("stroke", sem.accent);
        node.select("text.card-title").attr("fill", "#ffffff");
        // GLOBAL_CUSTOMER header can be dark; ensure contrast
        if (d.data.semanticKey === "GLOBAL_CUSTOMER") node.select("text.card-title").attr("fill", "#ffffff");
    });

    // interactions
    nodes.on("click", (event, d) => {
        event.stopPropagation();

        // toggle collapse on click (optional, but requested as possibility)
        if (d.children) {
            d.data.__collapsed = true;
        } else if (d._children) {
            d.data.__collapsed = false;
        }

        // selected highlight
        g.selectAll(".node").classed("selected", false);
        d3.select(event.currentTarget).classed("selected", true);

        UI.json.textContent = JSON.stringify(d.data.data, null, 2);

        // re-render for collapse/expand
        renderActiveScenario();
        applySearch(UI.search.value);
        applyFiltersToGraph();
    });

    svg.on("click", () => {
        g.selectAll(".node").classed("selected", false);
        UI.json.textContent = JSON.stringify(activeScenario, null, 2);
    });

    setTimeout(() => zoomToFit(40), 0);

    applySearch(UI.search.value);
    applyFiltersToGraph();
}

/* ---------------- Search ---------------- */
function nodeTextIndex(d) {
    const data = d.data?.data || {};
    const name = safeString(d.data?.name);
    const type = safeString(d.data?.type);
    const fields = [
        name, type,
        data.mdmCustomerId, data.mdmAccountId, data.contractId,
        data.billingProfileId, data.platformId, data.addressId, data.contactPersonId,
        data.officialName, data.tradingName, data.contractName,
        data.refType, data.refValue,
        data.platformObject?.platformId, data.platformObject?.name
    ].map(safeString).filter(Boolean);
    return fields.join(" ").toLowerCase();
}

function applySearch(term) {
    const t = safeString(term).trim().toLowerCase();
    if (!t) {
        g.selectAll(".node").classed("search-dim", false).classed("search-match", false);
        return;
    }
    g.selectAll(".node").each(function (d) {
        const hay = nodeTextIndex(d);
        const isMatch = hay.includes(t);
        d3.select(this).classed("search-match", isMatch).classed("search-dim", !isMatch);
    });
}

/* ---------------- Filters ---------------- */
function selectedFilters() {
    return {
        customerTypes: getSelectedValues(UI.fCustomerType),
        industries: getSelectedValues(UI.fIndustry),
        salesChannels: getSelectedValues(UI.fSalesChannel),
        platforms: getSelectedValues(UI.fPlatform)
    };
}

function scenarioSignature(sc) {
    const s = normalizeScenario(sc);
    const customerTypes = [];
    const industries = [];
    const salesChannels = [];
    const platforms = [];

    if (s.customer?.customerType) customerTypes.push(s.customer.customerType);
    if (s.customer?.industrySector) industries.push(s.customer.industrySector);

    asArray(s.relatedCustomers).forEach(rc => {
        if (rc?.customerType) customerTypes.push(rc.customerType);
        if (rc?.industrySector) industries.push(rc.industrySector);
    });

    asArray(s.accounts).forEach(acc => {
        if (acc?.salesChannel) salesChannels.push(acc.salesChannel);
        const pid = acc?.platformObject?.platformId || acc?.platformObject?.name;
        if (pid) platforms.push(pid);
    });

    return {
        customerTypes: uniq(customerTypes),
        industries: uniq(industries),
        salesChannels: uniq(salesChannels),
        platforms: uniq(platforms)
    };
}

function scenarioMatchesFilters(sig, filters) {
    const okCT = !filters.customerTypes.length || filters.customerTypes.some(v => sig.customerTypes.includes(v));
    const okInd = !filters.industries.length || filters.industries.some(v => sig.industries.includes(v));
    const okCh = !filters.salesChannels.length || filters.salesChannels.some(v => sig.salesChannels.includes(v));
    const okPl = !filters.platforms.length || filters.platforms.some(v => sig.platforms.includes(v));
    return okCT && okInd && okCh && okPl;
}

function getFilteredScenarioIndices() {
    const filters = selectedFilters();
    const anyActive = filters.customerTypes.length || filters.industries.length || filters.salesChannels.length || filters.platforms.length;
    if (!anyActive) return scenarios.map((_, i) => i);

    const idxs = [];
    scenarios.forEach((sc, i) => {
        const sig = scenarioSignature(sc);
        if (scenarioMatchesFilters(sig, filters)) idxs.push(i);
    });
    return idxs;
}

function nodeFilterSignature(node) {
    const t = node.data.type;
    const obj = node.data.data || {};
    const sig = { customerType: null, industrySector: null, salesChannel: null, platformId: null };

    if (t === "GLOBAL_CUSTOMER" || t === "COUNTRY_CUSTOMER") {
        sig.customerType = obj.customerType || null;
        sig.industrySector = obj.industrySector || null;
    }
    if (t === "ACCOUNT_SOLDTO" || t === "ACCOUNT_SUB") {
        sig.salesChannel = obj.salesChannel || null;
        sig.platformId = obj?.platformObject?.platformId || obj?.platformObject?.name || null;
    }
    if (t === "PLATFORM") {
        sig.platformId = obj.platformId || obj.name || null;
    }
    return sig;
}

function matchesAny(list, value) {
    if (!list || list.length === 0) return true;
    if (!value) return false;
    return list.includes(value);
}

function matchesFilters(sig, filters) {
    const okCustomerType = filters.customerTypes.length ? matchesAny(filters.customerTypes, sig.customerType) : true;
    const okIndustry = filters.industries.length ? matchesAny(filters.industries, sig.industrySector) : true;
    const okChannel = filters.salesChannels.length ? matchesAny(filters.salesChannels, sig.salesChannel) : true;
    const okPlatform = filters.platforms.length ? matchesAny(filters.platforms, sig.platformId) : true;
    return okCustomerType && okIndustry && okChannel && okPlatform;
}

function applyFiltersToGraph() {
    if (!lastRootHierarchy) return;

    const filters = selectedFilters();
    const anyActive =
        filters.customerTypes.length ||
        filters.industries.length ||
        filters.salesChannels.length ||
        filters.platforms.length;

    if (!anyActive) {
        g.selectAll(".node").classed("filter-dim", false).classed("filter-match", false);
        return;
    }

    const matched = new Set();
    lastRootHierarchy.descendants().forEach(d => {
        const sig = nodeFilterSignature(d);
        if (matchesFilters(sig, filters)) matched.add(d);
    });

    const context = new Set();
    function addAncestors(n) { let p = n; while (p) { context.add(p); p = p.parent; } }
    function addDesc(n) { n.descendants().forEach(x => context.add(x)); }

    matched.forEach(n => { addAncestors(n); addDesc(n); });

    g.selectAll(".node").each(function (d) {
        const isMatch = matched.has(d);
        const inContext = context.has(d);
        d3.select(this).classed("filter-match", isMatch).classed("filter-dim", !inContext);
    });
}

/* ---------------- Populate dropdowns & previews ---------------- */
function getEnumsForFilters(ref, scs) {
    const dom = ref?.domains || {};
    const ct = asArray(dom.customerType);
    const ind = asArray(dom.industrySector);
    const ch = asArray(dom.salesChannel);

    // platforms derived from dataset (and optional reference later)
    const platforms = uniq(scs.flatMap(sc => scenarioSignature(sc).platforms));

    // if ref is missing, fall back to data-derived lists
    const derived = {
        customerTypes: uniq(scs.flatMap(sc => scenarioSignature(sc).customerTypes)),
        industries: uniq(scs.flatMap(sc => scenarioSignature(sc).industries)),
        salesChannels: uniq(scs.flatMap(sc => scenarioSignature(sc).salesChannels)),
        platforms
    };

    return {
        customerTypes: ct.length ? ct : derived.customerTypes,
        industries: ind.length ? ind : derived.industries,
        salesChannels: ch.length ? ch : derived.salesChannels,
        platforms
    };
}

function populateFilterDropdowns() {
    const enumsForFilters = getEnumsForFilters(refEnums || {}, scenarios);
    fillMultiSelect(UI.fCustomerType, enumsForFilters.customerTypes);
    fillMultiSelect(UI.fIndustry, enumsForFilters.industries);
    fillMultiSelect(UI.fSalesChannel, enumsForFilters.salesChannels);
    fillMultiSelect(UI.fPlatform, enumsForFilters.platforms);
    renderReferencePreviews(enumsForFilters);
}

function populateScenarioDropdown() {
    const filteredIdxs = getFilteredScenarioIndices();

    UI.selector.innerHTML = `<option value="">-- Choose Scenario --</option>`;
    filteredIdxs.forEach((idx) => {
        const s = scenarios[idx];
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = s.scenarioName || `Scenario ${idx + 1}`;
        UI.selector.appendChild(opt);
    });

    // If current selection is not available under filters, pick the first filtered scenario (or clear)
    const stillAvailable = filteredIdxs.includes(activeScenarioIndex);
    if (!stillAvailable) {
        if (filteredIdxs.length > 0) {
            activeScenarioIndex = filteredIdxs[0];
            activeScenario = scenarios[activeScenarioIndex];
            UI.selector.value = String(activeScenarioIndex);
            UI.json.textContent = JSON.stringify(activeScenario, null, 2);
            renderDQBadge();
            renderActiveScenario();
        } else {
            activeScenario = null;
            activeScenarioIndex = -1;
            UI.selector.value = "";
            g.selectAll("*").remove();
            UI.json.textContent = "No scenarios match the selected filters.";
        }
    }
}

/* ---------------- Reference previews ---------------- */
function renderReferencePreviews(enumsForFilters) {
    if (UI.refEnumsPreview) {
        UI.refEnumsPreview.textContent = JSON.stringify({
            customerType: enumsForFilters.customerTypes,
            industrySector: enumsForFilters.industries,
            salesChannel: enumsForFilters.salesChannels,
            platform: enumsForFilters.platforms
        }, null, 2);
    }

    if (UI.refColorsPreview) {
        UI.refColorsPreview.textContent = JSON.stringify(refColors || {}, null, 2);
    }

    // swatches
    if (!UI.swatches) return;
    UI.swatches.innerHTML = "";
    if (!refColors) return;

    const tokenToHex = buildTokenHexMap(refColors);

    const addSwatchRow = (title, obj) => {
        const row = document.createElement("div");
        row.className = "swatch-row";

        const label = document.createElement("div");
        label.className = "swatch-title";
        label.textContent = title;
        row.appendChild(label);

        const grid = document.createElement("div");
        grid.className = "swatch-row-grid";

        Object.values(obj || {}).forEach(v => {
            if (!v || typeof v !== "object") return;
            const token = v.token;
            const hex = resolveColor(token || v.hex, tokenToHex);
            if (!hex) return;

            const sw = document.createElement("div");
            sw.className = "swatch";
            sw.title = `${token || ""} ${hex}`.trim();

            const dot = document.createElement("div");
            dot.className = "swatch-dot";
            dot.style.background = hex;

            const txt = document.createElement("div");
            txt.className = "swatch-txt";
            txt.textContent = hex;

            sw.appendChild(dot);
            sw.appendChild(txt);
            grid.appendChild(sw);
        });

        row.appendChild(grid);
        UI.swatches.appendChild(row);
    };

    addSwatchRow("Primary", refColors.primary);
    addSwatchRow("Foreground", refColors.foreground);
    addSwatchRow("Background", refColors.background);
}

/* ---------------- Data Quality (basic) ---------------- */
function renderDQBadge() {
    if (!UI.dqText || !UI.dqDot || !UI.dqBadge) return;
    UI.dqText.textContent = "DQ: OK";
    UI.dqDot.classList.remove("dq-ok", "dq-warn", "dq-err");
    UI.dqDot.classList.add("dq-ok");
    UI.dqBadge.title = "Data Quality: basic checks (enum validation optional)";
}

/* ---------------- Collapse/Expand all ---------------- */
function setCollapsedAll(collapsed) {
    if (!lastRootHierarchy) return;
    lastRootHierarchy.descendants().forEach(d => {
        if (!d.data) return;
        if (d.depth === 0) return;
        d.data.__collapsed = collapsed;
    });
    renderActiveScenario();
}

/* ---------------- Wire UI ---------------- */
function wireUI() {
    // Scenario selection
    safeOn(UI.selector, "change", (e) => {
        const idx = e.target.value;
        if (idx === "") return;

        activeScenarioIndex = Number(idx);
        activeScenario = scenarios[activeScenarioIndex];

        UI.json.textContent = JSON.stringify(activeScenario, null, 2);
        renderDQBadge();
        renderActiveScenario();
    });

    // Search
    safeOn(UI.search, "input", (e) => applySearch(e.target.value));

    // Reset view
    safeOn(UI.reset, "click", () => zoomToFit(40));

    // Clear filters
    safeOn(UI.btnClearFilters, "click", () => {
        [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel, UI.fPlatform].forEach(sel => {
            if (!sel) return;
            Array.from(sel.options).forEach(o => (o.selected = false));
        });
        populateScenarioDropdown();
        applyFiltersToGraph();
    });

    // Apply filters (optional button)
    safeOn(UI.btnApplyFilters, "click", () => {
        populateScenarioDropdown();
        applyFiltersToGraph();
    });

    // Live filtering (filter-first UX)
    [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel, UI.fPlatform].forEach(sel => {
        safeOn(sel, "change", () => {
            populateScenarioDropdown();
            applyFiltersToGraph();
        });
    });

    // View options toggles
    const rerender = () => {
        renderActiveScenario();
        renderDQBadge();
    };

    // Compact mode is not used; disable if present
    if (UI.tCompact) {
        UI.tCompact.checked = false;
        UI.tCompact.disabled = true;
    }

    safeOn(UI.tAddresses, "change", rerender);
    safeOn(UI.tContacts, "change", rerender);
    safeOn(UI.tReferenceIds, "change", rerender);
    safeOn(UI.tPlatforms, "change", rerender);

    safeOn(UI.btnCollapseAll, "click", () => setCollapsedAll(true));
    safeOn(UI.btnExpandAll, "click", () => setCollapsedAll(false));
}

/* ---------------- Boot ---------------- */
(async function main() {
    initViz();
    wireUI();

    try {
        const [cust, ref, colors] = await Promise.all([
            fetchJson(PATHS.customers),
            fetchJson(PATHS.reference),
            fetchJson(PATHS.colors)
        ]);

        scenarios = asArray(cust);
        refEnums = ref || {};
        refColors = colors || {};

        populateFilterDropdowns();
        populateScenarioDropdown();

        if (scenarios.length > 0) {
            // pick first available under current filters
            const idxs = getFilteredScenarioIndices();
            const idx = idxs.length ? idxs[0] : 0;

            activeScenarioIndex = idx;
            activeScenario = scenarios[idx];

            UI.selector.value = String(idx);
            UI.json.textContent = JSON.stringify(activeScenario, null, 2);

            renderDQBadge();
            renderActiveScenario();
        } else {
            UI.json.textContent = `No scenarios found in ${PATHS.customers}`;
        }

    } catch (err) {
        UI.json.textContent =
            `DATA LOAD ERROR\n\n${err.message}\n\nExpected paths:\n- ${PATHS.customers}\n- ${PATHS.reference}\n- ${PATHS.colors}`;
        console.error(err);
    }
})();