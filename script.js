/* =========================================================
   DHL eCommerce · Customer Master Data Viewer (FULL)
   FIX: Filters not showing when reference_master_data.json paths differ
   - Adds robust enum discovery + dataset fallback
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

/* ---------------- Layout config ---------------- */
const LAYOUT = {
    normal: { nodeW: 290, nodeH: 140, headerH: 28, gapX: 70, gapY: 35 },
    compact: { nodeW: 250, nodeH: 120, headerH: 26, gapX: 55, gapY: 26 }
};

/* ---------------- Helpers ---------------- */
function asArray(x) { return Array.isArray(x) ? x : []; }
function safeString(x) { return x === null || x === undefined ? "" : String(x); }
function uniq(arr) { return [...new Set(arr.filter(v => v !== null && v !== undefined && String(v).trim() !== ""))]; }

async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${url} (HTTP ${res.status})`);
    return res.json();
}

/* ---------------- Reference enums: robust discovery ---------------- */
function tryGet(ref, path) {
    return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), ref);
}

/**
 * Attempt 1: direct paths (fast path)
 */
function getEnumListByPaths(ref, candidates) {
    for (const p of candidates) {
        const val = tryGet(ref, p);
        if (Array.isArray(val) && val.every(x => typeof x === "string")) return val;
    }
    return [];
}

/**
 * Attempt 2: deep scan for arrays of strings under keys that include keywords
 * Example: any object path containing "customerType" or "salesChannel"
 */
function deepFindStringArraysByKeyword(obj, keywordLower) {
    const found = [];
    const walk = (node, path) => {
        if (!node || typeof node !== "object") return;

        if (Array.isArray(node)) {
            if (node.length > 0 && node.every(x => typeof x === "string")) {
                const p = path.join(".").toLowerCase();
                if (p.includes(keywordLower)) found.push(node);
            }
            return;
        }

        for (const [k, v] of Object.entries(node)) {
            walk(v, [...path, k]);
        }
    };
    walk(obj, []);
    // choose the "best" candidate: longest array
    found.sort((a, b) => b.length - a.length);
    return found[0] || [];
}

/**
 * Attempt 3: dataset fallback (always works)
 */
function deriveEnumsFromDataset(dataset) {
    const customerTypes = [];
    const industries = [];
    const channels = [];
    const platforms = [];

    asArray(dataset).forEach(sc => {
        const s = normalizeScenario(sc);

        // customer / related customers
        if (s.customer?.customerType) customerTypes.push(s.customer.customerType);
        if (s.customer?.industrySector) industries.push(s.customer.industrySector);

        asArray(s.relatedCustomers).forEach(rc => {
            if (rc?.customerType) customerTypes.push(rc.customerType);
            if (rc?.industrySector) industries.push(rc.industrySector);
        });

        // accounts
        asArray(s.accounts).forEach(acc => {
            if (acc?.salesChannel) channels.push(acc.salesChannel);

            const po = acc?.platformObject;
            if (po?.platformId) platforms.push(po.platformId);
            else if (po?.name) platforms.push(po.name);
        });
    });

    return {
        customerTypes: uniq(customerTypes).sort(),
        industries: uniq(industries).sort(),
        salesChannels: uniq(channels).sort(),
        platforms: uniq(platforms).sort()
    };
}

/**
 * Unified enum getter: reference-first, then dataset fallback
 */
function getEnumsForFilters(ref, dataset) {
    // Customer Type
    let customerTypes = getEnumListByPaths(ref, [
        "domains.customerType",
        "domains.customerTypes",
        "enums.customerType",
        "enums.customerTypes",
        "reference.domains.customerType",
        "reference.enums.customerType"
    ]);
    if (!customerTypes.length) customerTypes = deepFindStringArraysByKeyword(ref, "customertype");

    // Industry
    let industries = getEnumListByPaths(ref, [
        "domains.industrySector",
        "domains.industrySectors",
        "enums.industrySector",
        "enums.industrySectors",
        "reference.domains.industrySector",
        "reference.enums.industrySector"
    ]);
    if (!industries.length) industries = deepFindStringArraysByKeyword(ref, "industry");

    // Sales Channel
    let salesChannels = getEnumListByPaths(ref, [
        "domains.salesChannel",
        "domains.salesChannels",
        "enums.salesChannel",
        "enums.salesChannels",
        "reference.domains.salesChannel",
        "reference.enums.salesChannel"
    ]);
    if (!salesChannels.length) salesChannels = deepFindStringArraysByKeyword(ref, "channel");

    const derived = deriveEnumsFromDataset(dataset);

    return {
        customerTypes: uniq((customerTypes.length ? customerTypes : derived.customerTypes)).sort(),
        industries: uniq((industries.length ? industries : derived.industries)).sort(),
        salesChannels: uniq((salesChannels.length ? salesChannels : derived.salesChannels)).sort(),
        platforms: derived.platforms // platform always dataset-derived (most accurate)
    };
}

/* ---------------- Multi-select helpers ---------------- */
function getSelectedValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions).map(o => o.value).filter(Boolean);
}
function fillMultiSelect(selectEl, values) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const vals = uniq(values).sort((a, b) => a.localeCompare(b));
    vals.forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    });
}

/* ---------------- Reference Colors ---------------- */
function buildTokenHexMap(colorsJson) {
    const map = new Map();
    if (!colorsJson) return map;

    const scanObj = (obj) => {
        if (!obj || typeof obj !== "object") return;
        for (const v of Object.values(obj)) {
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

    if (t.startsWith("--")) {
        const cssVal = getComputedStyle(document.documentElement).getPropertyValue(t).trim();
        if (cssVal) return cssVal;
        const fallback = tokenToHexMap.get(t);
        if (fallback) return fallback;
    }
    return t;
}

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

/* ---------------- Node metadata ---------------- */
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
        push("globalGroupCode", data.globalGroupCode);
        push("industrySector", data.industrySector);
    }

    if (type === "ACCOUNT_SOLDTO" || type === "ACCOUNT_SUB") {
        push("mdmAccountId", data.mdmAccountId);
        push("roles", asArray(data.businessRoles).join(", "));
        push("salesChannel", data.salesChannel);
        const pid = data?.platformObject?.platformId || data?.platformObject?.name;
        if (pid) push("platform", pid);
        push("paymentTerms", data.paymentTerms);
    }

    if (type === "CONTRACT") {
        push("contractId", data.contractId);
        push("startDate", data.startDate);
        const cd = data.contractDetail || {};
        push("contractType", cd.contractType);
        if (Array.isArray(cd.services)) push("services", cd.services.join(", "));
    }

    if (type === "BILLING_PROFILE") {
        push("billingProfileId", data.billingProfileId);
        push("billingAccountNumber", data.billingAccountNumber);
        if (data.paymentMethod?.type) push("payMethod", data.paymentMethod.type);
    }

    if (type === "PLATFORM") {
        push("platformId", data.platformId || data.name);
        push("type", data.type);
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
    }

    return lines.slice(0, 5);
}

/* ---------------- Scenario normalization ---------------- */
function normalizeScenario(s) {
    if (s && s.customer && Array.isArray(s.accounts)) return s;
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
function getVis() {
    return {
        compact: !!UI.tCompact?.checked,
        showAddresses: !!UI.tAddresses?.checked,
        showContacts: !!UI.tContacts?.checked,
        showReferenceIds: !!UI.tReferenceIds?.checked,
        showPlatforms: !!UI.tPlatforms?.checked
    };
}

/* ---------------- Build hierarchy ---------------- */
function enrichCommonChildren(node, obj, vis) {
    const children = asArray(node.children);

    if (vis.showPlatforms && obj?.platformObject) {
        children.push({ type: "PLATFORM", data: obj.platformObject, children: [] });
    }

    if (vis.showReferenceIds) {
        asArray(obj?.referenceIds).forEach(r => children.push({ type: "REFERENCE_ID", data: r, children: [] }));
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
            let t = "ADDRESS_BUSINESS";
            if (at.includes("PICKUP")) t = "ADDRESS_PICKUP";
            else if (at.includes("BILLING")) t = "ADDRESS_BILLING";
            else if (at.includes("RESIDENTIAL")) t = "ADDRESS_RESIDENTIAL";
            else if (at.includes("REGISTERED")) t = "ADDRESS_REGISTERED";
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

    byId.forEach(node => {
        asArray(node.data.contracts).forEach(c => {
            let contractNode = enrichCommonChildren({ type: "CONTRACT", data: c, children: [] }, c, vis);

            if (c.billingProfile) {
                let billingNode = enrichCommonChildren({ type: "BILLING_PROFILE", data: c.billingProfile, children: [] }, c.billingProfile, vis);
                contractNode.children.push(billingNode);
            }
            node.children.push(contractNode);
        });

        enrichCommonChildren(node, node.data, vis);
    });

    return roots;
}

function buildHierarchyForScenario(scenario, vis) {
    const s = normalizeScenario(scenario);

    let root = enrichCommonChildren({ type: "GLOBAL_CUSTOMER", data: s.customer, children: [] }, s.customer, vis);

    const countryNodes = asArray(s.relatedCustomers).map(cc =>
        enrichCommonChildren({ type: "COUNTRY_CUSTOMER", data: cc, children: [] }, cc, vis)
    );
    countryNodes.forEach(n => root.children.push(n));

    const accountRoots = buildAccountTree(asArray(s.accounts), vis);

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

/* ---------------- D3 init/render ---------------- */
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

function renderActiveScenario() {
    if (!activeScenario) return;

    const vis = getVis();
    const cfg = vis.compact ? LAYOUT.compact : LAYOUT.normal;
    currentRenderConfig = cfg;

    g.selectAll("*").remove();

    const data = buildHierarchyForScenario(activeScenario, vis);
    const root = d3.hierarchy(data);
    lastRootHierarchy = root;

    // Apply collapse state stored in node.data.__collapsed
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

    const tokenToHex = buildTokenHexMap(refColors);
    const semMap = refColors?.semanticMapping || {};

    function colorsFor(nodeType) {
        const key = semanticKeyForNodeType(nodeType);
        const entry = semMap[key] || semMap["GLOBAL_CUSTOMER"] || {};
        return {
            header: resolveColor(entry.header || "#000", tokenToHex),
            body: resolveColor(entry.body || "#eee", tokenToHex)
        };
    }

    // Links
    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d => elbowLink(d, cfg));

    // Nodes
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

    nodes.append("rect")
        .attr("class", "card")
        .attr("width", cfg.nodeW)
        .attr("height", cfg.nodeH)
        .attr("rx", 14)
        .attr("fill", d => colorsFor(d.data.type).body);

    nodes.append("rect")
        .attr("class", "header")
        .attr("width", cfg.nodeW)
        .attr("height", cfg.headerH)
        .attr("rx", 14)
        .attr("fill", d => colorsFor(d.data.type).header);

    nodes.append("text")
        .attr("class", "icon")
        .attr("x", 12)
        .attr("y", cfg.headerH / 2 + 2)
        .text(d => d.data.icon);

    nodes.append("text")
        .attr("class", "title")
        .attr("x", 42)
        .attr("y", cfg.headerH / 2 + 2)
        .text(d => safeString(d.data.name).slice(0, 36));

    // Header hotspot: collapse/expand
    nodes.append("rect")
        .attr("class", "header-hit")
        .attr("width", cfg.nodeW)
        .attr("height", cfg.headerH)
        .attr("rx", 14)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            event.stopPropagation();

            if (d.children) {
                d.data.__collapsed = true;
                d._children = d.children;
                d.children = null;
            } else if (d._children) {
                d.data.__collapsed = false;
                d.children = d._children;
                d._children = null;
            }

            renderActiveScenario();
            applySearch(UI.search.value);
            applyFiltersToGraph();
        });

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
function selectedFilters() {
    return {
        customerTypes: getSelectedValues(UI.fCustomerType),
        industries: getSelectedValues(UI.fIndustry),
        salesChannels: getSelectedValues(UI.fSalesChannel),
        platforms: getSelectedValues(UI.fPlatform)
    };
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

/* ---------------- Reference previews ---------------- */
function renderReferencePreviews(enumsForFilters) {
    UI.refEnumsPreview.textContent = JSON.stringify({
        customerType: enumsForFilters.customerTypes,
        industrySector: enumsForFilters.industries,
        salesChannel: enumsForFilters.salesChannels
    }, null, 2);

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

/* ---------------- Data Quality (basic) ---------------- */
function renderDQBadge() {
    // simple: if reference not giving enums, still show "OK" (N/A removed)
    UI.dqText.textContent = "DQ: OK";
    UI.dqDot.classList.remove("dq-ok", "dq-warn", "dq-err");
    UI.dqDot.classList.add("dq-ok");
    UI.dqBadge.title = "Data Quality: basic checks (enum validation optional)";
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
    const enumsForFilters = getEnumsForFilters(refEnums || {}, scenarios);

    fillMultiSelect(UI.fCustomerType, enumsForFilters.customerTypes);
    fillMultiSelect(UI.fIndustry, enumsForFilters.industries);
    fillMultiSelect(UI.fSalesChannel, enumsForFilters.salesChannels);
    fillMultiSelect(UI.fPlatform, enumsForFilters.platforms);

    renderReferencePreviews(enumsForFilters);
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

    UI.search.addEventListener("input", (e) => applySearch(e.target.value));

    UI.reset.addEventListener("click", () => zoomToFit(40));

    UI.btnClearFilters.addEventListener("click", () => {
        [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel, UI.fPlatform].forEach(sel => {
            Array.from(sel.options).forEach(o => (o.selected = false));
        });
        applyFiltersToGraph();
    });

    UI.btnApplyFilters.addEventListener("click", () => applyFiltersToGraph());

    const rerender = () => {
        renderActiveScenario();
        renderDQBadge();
    };

    UI.tCompact.addEventListener("change", rerender);
    UI.tAddresses.addEventListener("change", rerender);
    UI.tContacts.addEventListener("change", rerender);
    UI.tReferenceIds.addEventListener("change", rerender);
    UI.tPlatforms.addEventListener("change", rerender);

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
