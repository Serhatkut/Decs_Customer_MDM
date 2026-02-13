/* =========================================================
   DHL eCommerce · Customer Master Data Viewer (FULL)
   - Root files: /index.html, /script.js, /style.css
   - Data files : /data/customerData.json
                : /data/reference_master_data.json
                : /data/reference_colors.json

   Features (this build):
   ✅ Loads scenarios + reference enums + reference colors
   ✅ Horizontal compact tree + orthogonal (elbow) links
   ✅ Zoom-to-fit / reset view
   ✅ Node click -> JSON panel
   ✅ Search (dims non-matching)
   ✅ Multi-select filters: customerType / industry / salesChannel / platform
   ✅ Visibility toggles: addresses / contacts / referenceIds / platforms
   ✅ Compact mode toggle
   ✅ Collapse All / Expand All
   ✅ Reference panels: enum preview + palette swatches preview
   ✅ Data Quality badge (basic enum validation)
========================================================= */

const PATHS = {
    customers: "./data/customerData.json",
    reference: "./data/reference_master_data.json",
    colors: "./data/reference_colors.json"
};

/* ---------------- UI ---------------- */
const UI = {
    selector: document.getElementById("scenarioSelector"),
    search: document.getElementById("nodeSearch"),
    json: document.getElementById("json-display"),
    reset: document.getElementById("resetZoom"),
    viz: document.getElementById("viz-container"),

    // Filters
    fCustomerType: document.getElementById("filterCustomerType"),
    fIndustry: document.getElementById("filterIndustry"),
    fSalesChannel: document.getElementById("filterSalesChannel"),
    fPlatform: document.getElementById("filterPlatform"),
    btnClearFilters: document.getElementById("clearFilters"),
    btnApplyFilters: document.getElementById("applyFilters"),

    // Toggles
    tCompact: document.getElementById("toggleCompact"),
    tAddresses: document.getElementById("showAddresses"),
    tContacts: document.getElementById("showContacts"),
    tReferenceIds: document.getElementById("showReferenceIds"),
    tPlatforms: document.getElementById("showPlatforms"),
    btnCollapseAll: document.getElementById("collapseAll"),
    btnExpandAll: document.getElementById("expandAll"),

    // Reference preview
    refEnumsPreview: document.getElementById("refEnumsPreview"),
    refColorsPreview: document.getElementById("refColorsPreview"),
    swatches: document.getElementById("colorSwatches"),

    // Data quality badge
    dqBadge: document.getElementById("dqBadge"),
    dqDot: document.getElementById("dqDot"),
    dqText: document.getElementById("dqText")
};

/* ---------------- D3 Globals ---------------- */
let svg, g, zoom;
let scenarios = [];
let refEnums = null;
let refColors = null;

let activeScenarioIndex = 0;
let activeScenario = null;

let lastRootHierarchy = null; // d3.hierarchy
let currentRenderConfig = null;

/* ---------------- Layout config (defaults) ---------------- */
const LAYOUT = {
    normal: { nodeW: 290, nodeH: 140, headerH: 28, gapX: 70, gapY: 35, scale: 0.85 },
    compact: { nodeW: 250, nodeH: 120, headerH: 26, gapX: 55, gapY: 26, scale: 0.85 }
};

/* ---------------- Helpers ---------------- */
function asArray(x) { return Array.isArray(x) ? x : []; }
function safeString(x) { return x === null || x === undefined ? "" : String(x); }
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${url} (HTTP ${res.status})`);
    return res.json();
}

/* Robust enum extraction from unknown reference JSON shape */
function tryGet(ref, path) {
    return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), ref);
}
function getEnumList(ref, candidates) {
    for (const p of candidates) {
        const val = tryGet(ref, p);
        if (Array.isArray(val)) return val;
    }
    return [];
}

/* Multi-select read helper */
function getSelectedValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions).map(o => o.value).filter(Boolean);
}
function fillMultiSelect(selectEl, values, placeholder = "") {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const vals = uniq(values).sort((a, b) => a.localeCompare(b));
    // If placeholder needed, multi-select generally shouldn't have placeholder option.
    vals.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    });
}

/* ---------------- Reference Colors: token->hex + semantic mapping ---------------- */
function buildTokenHexMap(colorsJson) {
    const map = new Map();
    if (!colorsJson) return map;

    const scanObj = (obj) => {
        if (!obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj)) {
            if (v && typeof v === "object" && typeof v.token === "string" && typeof v.hex === "string") {
                map.set(v.token.trim(), v.hex.trim());
            } else if (v && typeof v === "object") {
                scanObj(v);
            }
        }
    };

    scanObj(colorsJson.primary);
    scanObj(colorsJson.foreground);
    scanObj(colorsJson.background);
    scanObj(colorsJson.neutralScale);
    return map;
}

function resolveColor(tokenOrHex, tokenToHexMap) {
    if (!tokenOrHex) return "#000";
    const t = safeString(tokenOrHex).trim();
    if (t.startsWith("#")) return t;

    // token like --clr-primary-red
    if (t.startsWith("--")) {
        const cssVal = getComputedStyle(document.documentElement).getPropertyValue(t).trim();
        if (cssVal) return cssVal;
        const fallback = tokenToHexMap.get(t);
        if (fallback) return fallback;
    }
    // last resort
    return t;
}

/* ---------------- Node semantics ----------------
   We map internal node "type" -> semanticMapping key
   so colors are data-driven from reference_colors.json
-------------------------------------------------- */
function semanticKeyForNodeType(nodeType) {
    if (nodeType === "GLOBAL_CUSTOMER") return "GLOBAL_CUSTOMER";
    if (nodeType === "COUNTRY_CUSTOMER") return "COUNTRY_CUSTOMER";

    if (nodeType === "ACCOUNT_SOLDTO" || nodeType === "ACCOUNT_SUB") return "ACCOUNT";
    if (nodeType === "CONTRACT") return "CONTRACT";
    if (nodeType === "BILLING_PROFILE") return "BILLING_PROFILE";
    if (nodeType === "CONTACT" || nodeType === "COMM") return "CONTACT";
    if (nodeType.startsWith("ADDRESS")) return "ADDRESS";
    if (nodeType === "PLATFORM") return "PLATFORM";
    if (nodeType === "REFERENCE_ID") return "REFERENCE_ID";

    return "GLOBAL_CUSTOMER";
}

function iconFor(type, data) {
    if (type === "GLOBAL_CUSTOMER") return "🌐";
    if (type === "COUNTRY_CUSTOMER") return "🏢";
    if (type === "ACCOUNT_SOLDTO") return "🧾";
    if (type === "ACCOUNT_SUB") {
        const roles = asArray(data?.businessRoles);
        if (roles.includes("PICKUP")) return "🏬";
        if (roles.includes("SHIPPER")) return "📦";
        return "📦";
    }
    if (type === "CONTRACT") return "📝";
    if (type === "BILLING_PROFILE") return "💳";
    if (type === "PLATFORM") return "🧩";
    if (type === "REFERENCE_ID") return "🔗";
    if (type === "CONTACT") return "👤";
    if (type === "COMM") {
        if (data?.type === "EMAIL") return "✉️";
        if (data?.type === "PHONE") return "📞";
        return "📡";
    }
    if (type.startsWith("ADDRESS")) {
        const at = safeString(data?.addressType).toUpperCase();
        if (at.includes("PICKUP")) return "📍";
        if (at.includes("BILLING")) return "💼";
        if (at.includes("RESIDENTIAL")) return "🏠";
        if (at.includes("REGISTERED")) return "🏛️";
        return "🏷️";
    }
    return "•";
}

function displayNameFor(type, obj) {
    if (!obj) return "(unknown)";
    if (type === "GLOBAL_CUSTOMER" || type === "COUNTRY_CUSTOMER") {
        return obj.tradingName || obj.officialName || obj.mdmCustomerId;
    }
    if (type === "ACCOUNT_SOLDTO" || type === "ACCOUNT_SUB") return obj.mdmAccountId || "(account)";
    if (type === "CONTRACT") return obj.contractName || obj.contractId;
    if (type === "BILLING_PROFILE") return obj.billingProfileId || "Billing Profile";
    if (type.startsWith("ADDRESS")) return `${obj.city || ""}${obj.country ? ", " + obj.country : ""}`.trim() || obj.addressId;
    if (type === "CONTACT") return `${obj.firstName || ""} ${obj.lastName || ""}`.trim() || obj.contactPersonId;
    if (type === "COMM") return obj.value || "(channel)";
    if (type === "REFERENCE_ID") return obj.refType || "Reference";
    if (type === "PLATFORM") return obj.platformId || obj.name || "Platform";
    return obj.mdmCustomerId || obj.mdmAccountId || "(node)";
}

/* Keep node summary lines compact for diagram */
function pickKeyLines(type, data) {
    const lines = [];
    const push = (k, v) => {
        const val = safeString(v).trim();
        if (!val) return;
        lines.push([k, val]);
    };
    if (!data) return lines;

    if (type === "GLOBAL_CUSTOMER" || type === "COUNTRY_CUSTOMER") {
        push("mdmCustomerId", data.mdmCustomerId);
        push("customerType", data.customerType);
        push("customerLevel", data.customerLevel);
        push("industrySector", data.industrySector);
        if (data.globalGroupCode) push("globalGroupCode", data.globalGroupCode);
        push("country", data.countryOfRegistration);
    }

    if (type === "ACCOUNT_SOLDTO" || type === "ACCOUNT_SUB") {
        push("mdmAccountId", data.mdmAccountId);
        push("roles", asArray(data.businessRoles).join(", "));
        push("salesChannel", data.salesChannel);
        if (data.platformObject?.platformId) push("platformId", data.platformObject.platformId);
        push("paymentTerms", data.paymentTerms);
        push("currency", data.currency);
    }

    if (type === "CONTRACT") {
        push("contractId", data.contractId);
        push("startDate", data.startDate);
        const cd = data.contractDetail || {};
        push("contractType", cd.contractType);
        if (Array.isArray(cd.services)) push("services", cd.services.join(", "));
        push("billingModel", cd.billingModel);
    }

    if (type === "BILLING_PROFILE") {
        push("billingProfileId", data.billingProfileId);
        push("billingAccountNumber", data.billingAccountNumber);
        push("invoiceDelivery", data.invoiceDelivery);
        if (data.paymentMethod?.type) push("payMethod", data.paymentMethod.type);
    }

    if (type === "PLATFORM") {
        push("platformId", data.platformId);
        push("type", data.type);
        push("provider", data.provider);
    }

    if (type === "REFERENCE_ID") {
        push("refType", data.refType);
        push("refValue", data.refValue);
    }

    if (type === "CONTACT") {
        push("contactPersonId", data.contactPersonId);
        push("jobTitle", data.jobTitle);
    }

    if (type.startsWith("ADDRESS")) {
        push("addressType", data.addressType);
        push("city", data.city);
        push("postalcode", data.postalcode);
        push("country", data.country);
    }

    return lines.slice(0, 5);
}

/* ---------------- Scenario normalization ---------------- */
function normalizeScenario(s) {
    if (s && s.customer && Array.isArray(s.accounts)) return s;
    // fallback legacy shapes (if any)
    const legacyCustomer = {
        customerType: s.customerType,
        customerLevel: s.customerLevel,
        mdmCustomerId: s.mdmCustomerId,
        parentMdmCustomerId: s.parentMdmCustomerId ?? null,
        officialName: s.officialName,
        tradingName: s.tradingName,
        globalGroupCode: s.globalGroupCode ?? null,
        industrySector: s.industrySector ?? null,
        taxId: s.taxId ?? null,
        countryOfRegistration: s.countryOfRegistration ?? null,
        addresses: asArray(s.addresses),
        contactPersons: asArray(s.contactPersons)
    };
    return {
        scenarioName: s.scenarioName || "Scenario",
        customer: legacyCustomer,
        accounts: asArray(s.accounts),
        relatedCustomers: asArray(s.relatedCustomers || s.children)
    };
}

/* ---------------- Visibility toggles ---------------- */
function getVisibilityConfigFromUI() {
    return {
        compact: !!UI.tCompact?.checked,
        showAddresses: !!UI.tAddresses?.checked,
        showContacts: !!UI.tContacts?.checked,
        showReferenceIds: !!UI.tReferenceIds?.checked,
        showPlatforms: !!UI.tPlatforms?.checked
    };
}

/* ---------------- Build hierarchy (your target structure) ---------------- */
function enrichCommonChildren(node, obj, vis) {
    const children = asArray(node.children);

    if (vis.showPlatforms && obj?.platformObject) {
        children.push({ type: "PLATFORM", data: obj.platformObject, children: [] });
    }

    if (vis.showReferenceIds) {
        asArray(obj?.referenceIds).forEach(r => {
            children.push({ type: "REFERENCE_ID", data: r, children: [] });
        });
    }

    if (vis.showContacts) {
        asArray(obj?.contactPersons).forEach(cp => {
            const commKids = asArray(cp.communicationChannels).map(cc => ({ type: "COMM", data: cc, children: [] }));
            children.push({ type: "CONTACT", data: cp, children: commKids });
        });
    }

    if (vis.showAddresses) {
        asArray(obj?.addresses).forEach(a => {
            const at = safeString(a.addressType).toUpperCase();
            let t = "ADDRESS_OTHER";
            if (at.includes("PICKUP")) t = "ADDRESS_PICKUP";
            else if (at.includes("BILLING")) t = "ADDRESS_BILLING";
            else if (at.includes("RESIDENTIAL")) t = "ADDRESS_RESIDENTIAL";
            else if (at.includes("REGISTERED")) t = "ADDRESS_REGISTERED";
            else t = "ADDRESS_BUSINESS";
            children.push({ type: t, data: a, children: [] });
        });
    }

    node.children = children;
    return node;
}

function buildAccountTree(accounts, vis) {
    const byId = new Map();
    const roots = [];

    accounts.forEach(acc => {
        byId.set(acc.mdmAccountId, {
            type: asArray(acc.businessRoles).includes("SOLDTO") ? "ACCOUNT_SOLDTO" : "ACCOUNT_SUB",
            data: acc,
            children: []
        });
    });

    byId.forEach(node => {
        const pid = node.data.parentAccountId;
        if (pid && byId.has(pid)) byId.get(pid).children.push(node);
        else roots.push(node);
    });

    // Attach contracts/billing to sold-to accounts (and any account that has contracts)
    byId.forEach(node => {
        asArray(node.data.contracts).forEach(c => {
            let contractNode = { type: "CONTRACT", data: c, children: [] };
            contractNode = enrichCommonChildren(contractNode, c, vis);

            if (c.billingProfile) {
                let billingNode = { type: "BILLING_PROFILE", data: c.billingProfile, children: [] };
                billingNode = enrichCommonChildren(billingNode, c.billingProfile, vis);
                contractNode.children.push(billingNode);
            }

            node.children.push(contractNode);
        });

        // Account children (platform/ref/contact/address)
        enrichCommonChildren(node, node.data, vis);
    });

    return roots;
}

function buildHierarchyForScenario(scenario, vis) {
    const s = normalizeScenario(scenario);

    let root = { type: "GLOBAL_CUSTOMER", data: s.customer, children: [] };
    root = enrichCommonChildren(root, s.customer, vis);

    // Country customers (optional)
    const countryCustomers = asArray(s.relatedCustomers);
    const countryNodes = countryCustomers.map(cc => enrichCommonChildren({ type: "COUNTRY_CUSTOMER", data: cc, children: [] }, cc, vis));
    countryNodes.forEach(n => root.children.push(n));

    // Accounts (tree)
    const accountRoots = buildAccountTree(asArray(s.accounts), vis);

    // Attach account roots under matching country customer if mdmCustomerId matches
    if (countryNodes.length > 0) {
        const map = new Map(countryNodes.map(n => [n.data.mdmCustomerId, n]));
        accountRoots.forEach(ar => {
            const custId = ar.data.mdmCustomerId;
            if (map.has(custId)) map.get(custId).children.push(ar);
            else root.children.push(ar);
        });
    } else {
        accountRoots.forEach(ar => root.children.push(ar));
    }

    // Decorate nodes with diagram properties
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

/* ---------------- D3 render: horizontal tree with elbow links ---------------- */
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
    // Horizontal tree:
    // x = vertical position; y = horizontal position
    const sx = d.source.x + cfg.nodeH / 2;
    const sy = d.source.y + cfg.nodeW; // right edge of source box
    const tx = d.target.x + cfg.nodeH / 2;
    const ty = d.target.y; // left edge of target box
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

function renderActiveScenario() {
    if (!activeScenario) return;

    const vis = getVisibilityConfigFromUI();
    const cfg = vis.compact ? LAYOUT.compact : LAYOUT.normal;
    currentRenderConfig = cfg;

    g.selectAll("*").remove();

    // Build hierarchy + create d3.hierarchy
    const data = buildHierarchyForScenario(activeScenario, vis);
    const root = d3.hierarchy(data);
    lastRootHierarchy = root;

    // Manage collapsed state across renders by persisting "collapsed" flag on data nodes
    // If node has _children saved, keep it.
    function applyCollapseState(node) {
        if (node.data && node.data.__collapsed) {
            node._children = node.children;
            node.children = null;
        }
        (node.children || node._children || []).forEach(applyCollapseState);
    }
    applyCollapseState(root);

    // Tree layout (horizontal)
    const tree = d3.tree()
        .nodeSize([cfg.nodeH + cfg.gapY, cfg.nodeW + cfg.gapX])
        .separation((a, b) => (a.parent === b.parent ? 0.95 : 1.2));

    tree(root);

    // Precompute colors from reference_colors.json
    const tokenToHex = buildTokenHexMap(refColors);
    const semMap = refColors?.semanticMapping || {};

    function colorsFor(nodeType) {
        const key = semanticKeyForNodeType(nodeType);
        const entry = semMap[key] || semMap["GLOBAL_CUSTOMER"] || {};
        return {
            header: resolveColor(entry.header || "#000", tokenToHex),
            body: resolveColor(entry.body || "#eee", tokenToHex),
            accent: resolveColor(entry.accent || "#FFCC00", tokenToHex)
        };
    }

    // Links
    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d => elbowLink(d, cfg));

    // Nodes group
    const nodes = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", d => `node node-${d.data.type}`)
        .attr("transform", d => `translate(${d.y},${d.x})`)
        .on("click", (event, d) => {
            event.stopPropagation();
            UI.json.textContent = JSON.stringify(d.data.data, null, 2);

            g.selectAll(".node").classed("selected", false);
            d3.select(event.currentTarget).classed("selected", true);
        });

    // Card
    nodes.append("rect")
        .attr("class", "card")
        .attr("width", cfg.nodeW)
        .attr("height", cfg.nodeH)
        .attr("rx", 14)
        .attr("fill", d => colorsFor(d.data.type).body);

    // Header
    nodes.append("rect")
        .attr("class", "header")
        .attr("width", cfg.nodeW)
        .attr("height", cfg.headerH)
        .attr("rx", 14)
        .attr("fill", d => colorsFor(d.data.type).header);

    // Icon
    nodes.append("text")
        .attr("class", "icon")
        .attr("x", 12)
        .attr("y", cfg.headerH / 2 + 2)
        .text(d => d.data.icon);

    // Title
    nodes.append("text")
        .attr("class", "title")
        .attr("x", 42)
        .attr("y", cfg.headerH / 2 + 2)
        .text(d => safeString(d.data.name).slice(0, 36));

    // Collapse/expand hotspot: click header toggles subtree (doesn't override node selection click)
    nodes.append("rect")
        .attr("class", "header-hit")
        .attr("width", cfg.nodeW)
        .attr("height", cfg.headerH)
        .attr("rx", 14)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            event.stopPropagation();

            // Toggle collapsed state
            if (d.children) {
                d.data.__collapsed = true;
                d._children = d.children;
                d.children = null;
            } else if (d._children) {
                d.data.__collapsed = false;
                d.children = d._children;
                d._children = null;
            }

            // Rerender preserving state stored in d.data.__collapsed
            renderActiveScenario();
            // Re-apply current search + filters
            applySearch(UI.search.value);
            applyFiltersToGraph();
        });

    // Key lines
    nodes.each(function (d) {
        const el = d3.select(this);
        const lines = asArray(d.data.keyLines);
        let y = cfg.headerH + 22;

        lines.forEach(([k, v]) => {
            el.append("text").attr("class", "kv k").attr("x", 14).attr("y", y).text(`${k}:`);
            el.append("text").attr("class", "kv v").attr("x", 112).attr("y", y).text(safeString(v).slice(0, 38));
            y += 17;
        });
    });

    // Background click clears selection
    svg.on("click", () => {
        g.selectAll(".node").classed("selected", false);
        UI.json.textContent = JSON.stringify(activeScenario, null, 2);
    });

    // Fit to screen
    setTimeout(() => zoomToFit(40), 0);

    // Apply current search + filters after render
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
        data.refType, data.refValue
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
function extractPlatformsFromDataset(dataset) {
    const platformIds = [];
    asArray(dataset).forEach(sc => {
        const s = normalizeScenario(sc);
        asArray(s.accounts).forEach(acc => {
            const pid = acc?.platformObject?.platformId;
            if (pid) platformIds.push(pid);
        });
    });
    return uniq(platformIds);
}

function selectedFilters() {
    return {
        customerTypes: getSelectedValues(UI.fCustomerType),
        industries: getSelectedValues(UI.fIndustry),
        salesChannels: getSelectedValues(UI.fSalesChannel),
        platforms: getSelectedValues(UI.fPlatform)
    };
}

function nodeFilterSignature(node) {
    // Extract comparable attributes from the object behind the node
    const t = node.data.type;
    const obj = node.data.data || {};

    const sig = {
        customerType: null,
        industrySector: null,
        salesChannel: null,
        platformId: null
    };

    if (t === "GLOBAL_CUSTOMER" || t === "COUNTRY_CUSTOMER") {
        sig.customerType = obj.customerType || null;
        sig.industrySector = obj.industrySector || null;
    }

    if (t === "ACCOUNT_SOLDTO" || t === "ACCOUNT_SUB") {
        sig.salesChannel = obj.salesChannel || null;
        sig.platformId = obj?.platformObject?.platformId || null;
        // also allow account to carry customerType/industry via linked customer if needed later; for now keep null
    }

    if (t === "PLATFORM") {
        sig.platformId = obj.platformId || obj.name || null;
    }

    if (t === "REFERENCE_ID") {
        // platform shipper IDs are under referenceIds; we’ll still filter by platform via accounts/platform nodes
    }

    return sig;
}

function matchesAny(list, value) {
    if (!list || list.length === 0) return true; // no filter applied
    if (!value) return false;
    return list.includes(value);
}

function matchesFilters(sig, filters) {
    // AND across filter groups; within a group: OR via multi-select list
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

    // Determine matched nodes
    const matchedNodes = new Set();
    lastRootHierarchy.descendants().forEach(d => {
        const sig = nodeFilterSignature(d);
        if (matchesFilters(sig, filters)) matchedNodes.add(d);
    });

    // Expand match context: include ancestors + descendants of matched nodes
    const contextNodes = new Set();
    function addAncestors(n) {
        let p = n;
        while (p) { contextNodes.add(p); p = p.parent; }
    }
    function addDescendants(n) {
        n.descendants().forEach(x => contextNodes.add(x));
    }

    matchedNodes.forEach(n => {
        addAncestors(n);
        addDescendants(n);
    });

    // Apply classes
    g.selectAll(".node").each(function (d) {
        const isMatch = matchedNodes.has(d);
        const inContext = contextNodes.has(d);
        d3.select(this)
            .classed("filter-match", isMatch)
            .classed("filter-dim", !inContext);
    });
}

/* ---------------- Collapse/Expand All ---------------- */
function setCollapsedAll(collapsed) {
    if (!lastRootHierarchy) return;

    // Apply to data layer so it survives rerender
    lastRootHierarchy.descendants().forEach(d => {
        if (!d.data) return;
        if (d.depth === 0) return; // keep root open
        d.data.__collapsed = collapsed;
    });

    renderActiveScenario();
}

/* ---------------- Reference panels (preview + swatches) ---------------- */
function renderReferencePreviews() {
    // enums preview
    const preview = {
        customerType: getEnumList(refEnums, [
            "domains.customerType",
            "domains.customerTypes",
            "enums.customerType",
            "enums.customerTypes"
        ]).slice(0, 50),
        industrySector: getEnumList(refEnums, [
            "domains.industrySector",
            "domains.industrySectors",
            "enums.industrySector",
            "enums.industrySectors"
        ]).slice(0, 50),
        salesChannel: getEnumList(refEnums, [
            "domains.salesChannel",
            "domains.salesChannels",
            "enums.salesChannel",
            "enums.salesChannels"
        ]).slice(0, 50),
        businessRoles: getEnumList(refEnums, [
            "domains.businessRoles",
            "domains.roles",
            "enums.businessRoles",
            "enums.roles"
        ]).slice(0, 50)
    };
    UI.refEnumsPreview.textContent = JSON.stringify(preview, null, 2);

    // colors preview
    UI.refColorsPreview.textContent = JSON.stringify(refColors, null, 2);

    // swatches
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

/* ---------------- Data Quality (basic enum validation) ---------------- */
function computeDQForScenario(scenario) {
    const s = normalizeScenario(scenario);

    const enumCustomerTypes = new Set(getEnumList(refEnums, [
        "domains.customerType",
        "domains.customerTypes",
        "enums.customerType",
        "enums.customerTypes"
    ]));
    const enumIndustry = new Set(getEnumList(refEnums, [
        "domains.industrySector",
        "domains.industrySectors",
        "enums.industrySector",
        "enums.industrySectors"
    ]));
    const enumSalesChannel = new Set(getEnumList(refEnums, [
        "domains.salesChannel",
        "domains.salesChannels",
        "enums.salesChannel",
        "enums.salesChannels"
    ]));

    let errors = 0;
    let warnings = 0;

    // Customer checks
    const c = s.customer || {};
    if (!c.mdmCustomerId) errors++;
    if (c.customerType && enumCustomerTypes.size && !enumCustomerTypes.has(c.customerType)) warnings++;
    if (c.industrySector && enumIndustry.size && !enumIndustry.has(c.industrySector)) warnings++;

    // Accounts checks
    asArray(s.accounts).forEach(a => {
        if (!a.mdmAccountId) errors++;
        if (!Array.isArray(a.businessRoles) || a.businessRoles.length === 0) errors++;
        if (a.salesChannel && enumSalesChannel.size && !enumSalesChannel.has(a.salesChannel)) warnings++;
    });

    return { errors, warnings };
}

function renderDQBadge() {
    const dq = computeDQForScenario(activeScenario);

    let status = "OK";
    if (dq.errors > 0) status = "ERRORS";
    else if (dq.warnings > 0) status = "WARNINGS";

    UI.dqText.textContent = `DQ: ${status}`;
    UI.dqBadge.title = `Data Quality\nErrors: ${dq.errors}\nWarnings: ${dq.warnings}`;

    UI.dqDot.classList.remove("dq-ok", "dq-warn", "dq-err");
    if (status === "OK") UI.dqDot.classList.add("dq-ok");
    if (status === "WARNINGS") UI.dqDot.classList.add("dq-warn");
    if (status === "ERRORS") UI.dqDot.classList.add("dq-err");
}

/* ---------------- Populate dropdowns ---------------- */
function populateScenarioDropdown() {
    UI.selector.innerHTML = `<option value="">-- Choose Scenario --</option>`;
    scenarios.forEach((s, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = s.scenarioName || `Scenario ${idx + 1}`;
        UI.selector.appendChild(opt);
    });
}

function populateFilterDropdowns() {
    const customerTypes = getEnumList(refEnums, [
        "domains.customerType",
        "domains.customerTypes",
        "enums.customerType",
        "enums.customerTypes"
    ]);
    const industries = getEnumList(refEnums, [
        "domains.industrySector",
        "domains.industrySectors",
        "enums.industrySector",
        "enums.industrySectors"
    ]);
    const salesChannels = getEnumList(refEnums, [
        "domains.salesChannel",
        "domains.salesChannels",
        "enums.salesChannel",
        "enums.salesChannels"
    ]);

    fillMultiSelect(UI.fCustomerType, customerTypes);
    fillMultiSelect(UI.fIndustry, industries);
    fillMultiSelect(UI.fSalesChannel, salesChannels);

    const platforms = extractPlatformsFromDataset(scenarios);
    fillMultiSelect(UI.fPlatform, platforms);
}

/* ---------------- Wire UI events ---------------- */
function wireUI() {
    UI.selector.addEventListener("change", (e) => {
        const idx = e.target.value;
        if (idx === "") return;

        activeScenarioIndex = Number(idx);
        activeScenario = scenarios[activeScenarioIndex];

        UI.json.textContent = JSON.stringify(activeScenario, null, 2);
        renderDQBadge();
        renderActiveScenario();
    });

    UI.search.addEventListener("input", (e) => {
        applySearch(e.target.value);
    });

    UI.reset.addEventListener("click", () => {
        // Zoom-to-fit rather than generic identity reset
        zoomToFit(40);
    });

    // Filters
    UI.btnClearFilters.addEventListener("click", () => {
        [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel, UI.fPlatform].forEach(sel => {
            Array.from(sel.options).forEach(o => (o.selected = false));
        });
        applyFiltersToGraph();
    });

    UI.btnApplyFilters.addEventListener("click", () => {
        applyFiltersToGraph();
    });

    // Toggles rerender
    const rerender = () => {
        renderActiveScenario();
        renderDQBadge();
    };

    UI.tCompact.addEventListener("change", rerender);
    UI.tAddresses.addEventListener("change", rerender);
    UI.tContacts.addEventListener("change", rerender);
    UI.tReferenceIds.addEventListener("change", rerender);
    UI.tPlatforms.addEventListener("change", rerender);

    // Collapse/Expand
    UI.btnCollapseAll.addEventListener("click", () => setCollapsedAll(true));
    UI.btnExpandAll.addEventListener("click", () => setCollapsedAll(false));
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

        populateScenarioDropdown();
        populateFilterDropdowns();
        renderReferencePreviews();

        // default load first scenario
        if (scenarios.length > 0) {
            activeScenarioIndex = 0;
            activeScenario = scenarios[0];
            UI.selector.value = "0";
            UI.json.textContent = JSON.stringify(activeScenario, null, 2);
            renderDQBadge();
            renderActiveScenario();
        } else {
            UI.json.textContent = "No scenarios found in /data/customerData.json";
        }

    } catch (err) {
        UI.json.textContent =
            `DATA LOAD ERROR\n\n${err.message}\n\nExpected paths:\n- ${PATHS.customers}\n- ${PATHS.reference}\n- ${PATHS.colors}`;
        console.error(err);
    }
})();
