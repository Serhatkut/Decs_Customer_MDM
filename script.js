"use strict";

/* ---------------- Paths (DATA FOLDER) ---------------- */
const PATHS = {
    customers: "./data/customerData.json",
    reference: "./data/reference_master_data.json",
    colors: "./data/reference_colors.json",
};

/* ---------------- UI hooks ---------------- */
const UI = {
    selector: document.getElementById("scenarioSelector"),
    search: document.getElementById("nodeSearch"),
    reset: document.getElementById("resetZoom"),
    json: document.getElementById("json-display"),

    // Filters
    fCustomerType: document.getElementById("filterCustomerType"),
    fIndustry: document.getElementById("filterIndustry"),
    fSalesChannel: document.getElementById("filterSalesChannel"),
    btnClearFilters: document.getElementById("clearFilters"),

    // Toggles
    tAddresses: document.getElementById("showAddresses"),
    tContacts: document.getElementById("showContacts"),
    tReferenceIds: document.getElementById("showReferenceIds"),

    btnCollapseAll: document.getElementById("collapseAll"),
    btnExpandAll: document.getElementById("expandAll"),

    dqDot: document.getElementById("dqDot"),
    dqText: document.getElementById("dqText"),

    swatches: document.getElementById("colorSwatches"),
    refEnumsPreview: document.getElementById("refEnumsPreview"),
    refColorsPreview: document.getElementById("refColorsPreview"),

    viz: document.getElementById("viz-container"),
};

/* ---------------- State ---------------- */
let scenarios = [];
let refEnums = {};
let refColors = {};
let activeScenarioIndex = -1;
let activeScenario = null;

// collapse state (stable)
const collapsedNodeIds = new Set();

/* ---------------- D3 globals ---------------- */
let svg, g, zoom;
let lastRootHierarchy = null;

const LAYOUT = {
    nodeW: 300,
    nodeH: 150,
    gapX: 60,
    gapY: 22,
    headerH: 30,
};

function safeOn(elem, evt, fn) {
    if (elem && elem.addEventListener) elem.addEventListener(evt, fn);
}

async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
    return await res.json();
}

function asArray(v) {
    return v ? (Array.isArray(v) ? v : [v]) : [];
}

function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
}

function getSelectedValues(selectEl) {
    if (!selectEl) return [];
    return Array.from(selectEl.selectedOptions || []).map((o) => o.value);
}

function fillMultiSelect(selectEl, values) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    (values || []).forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    });
}

/* ---------------- Colors via reference ---------------- */
function buildTokenHexMap(colorsObj) {
    const map = new Map();
    const walk = (obj) => {
        if (!obj || typeof obj !== "object") return;
        Object.values(obj).forEach((v) => {
            if (!v || typeof v !== "object") return;
            if (v.token && v.hex) map.set(v.token, v.hex);
            walk(v);
        });
    };
    walk(colorsObj);
    return map;
}

function resolveColor(value, tokenMap) {
    if (!value) return null;
    if (typeof value === "string" && value.startsWith("--")) return tokenMap.get(value) || null;
    if (typeof value === "string" && value.startsWith("#")) return value;
    return null;
}

function getSemanticColors(semanticKey) {
    const fallback = { header: "#D40511", body: "#FFF7D1", accent: "#000000" };
    const sm = refColors?.semanticMapping || null;
    if (!sm || !sm[semanticKey]) return fallback;

    const tokenMap = buildTokenHexMap(refColors);
    const m = sm[semanticKey];

    return {
        header: resolveColor(m.header, tokenMap) || fallback.header,
        body: resolveColor(m.body, tokenMap) || fallback.body,
        accent: resolveColor(m.accent, tokenMap) || fallback.accent,
    };
}

/* ---------------- Filters logic ---------------- */
function scenarioMatchesFilters(s) {
    const selCustomerTypes = getSelectedValues(UI.fCustomerType);
    const selIndustry = getSelectedValues(UI.fIndustry);
    const selChannel = getSelectedValues(UI.fSalesChannel);

    // we check across scenario customer + accounts + contracts where relevant
    const cust = s?.customer || {};
    const accounts = asArray(s?.accounts);

    const hasCustomerType = cust.customerType ? [cust.customerType] : [];
    const hasIndustry = cust.industrySector ? [cust.industrySector] : [];
    const hasChannel = uniq(
        accounts
            .map((a) => a.salesChannel)
            .filter(Boolean)
    );

    const okType = !selCustomerTypes.length || selCustomerTypes.some((x) => hasCustomerType.includes(x));
    const okIndustry = !selIndustry.length || selIndustry.some((x) => hasIndustry.includes(x));
    const okChannel = !selChannel.length || selChannel.some((x) => hasChannel.includes(x));

    return okType && okIndustry && okChannel;
}

function getFilteredScenarioIndices() {
    const idxs = [];
    scenarios.forEach((s, i) => {
        if (scenarioMatchesFilters(s)) idxs.push(i);
    });
    return idxs;
}

function populateScenarioDropdown() {
    if (!UI.selector) return;
    const idxs = getFilteredScenarioIndices();

    UI.selector.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "-- Choose Scenario --";
    UI.selector.appendChild(opt0);

    idxs.forEach((i) => {
        const s = scenarios[i];
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = s?.scenarioName || `Scenario ${i + 1}`;
        UI.selector.appendChild(opt);
    });

    // keep current if possible
    if (activeScenarioIndex >= 0 && idxs.includes(activeScenarioIndex)) {
        UI.selector.value = String(activeScenarioIndex);
    } else if (idxs.length) {
        UI.selector.value = String(idxs[0]);
        activeScenarioIndex = idxs[0];
        activeScenario = scenarios[activeScenarioIndex];
    } else {
        activeScenarioIndex = -1;
        activeScenario = null;
    }
}

function populateFilterDropdowns() {
    // reference_master_data.json expected to contain enums; we also fallback to dataset
    const refCustomerTypes = uniq(refEnums?.customerTypeEnums || refEnums?.customerTypes || refEnums?.enums?.customerType || []);
    const refIndustries = uniq(refEnums?.industryEnums || refEnums?.industries || refEnums?.enums?.industrySector || []);
    const refChannels = uniq(refEnums?.salesChannelEnums || refEnums?.channels || refEnums?.enums?.salesChannel || []);

    // dataset fallback
    const dsCustomerTypes = uniq(scenarios.map((s) => s?.customer?.customerType).filter(Boolean));
    const dsIndustries = uniq(scenarios.map((s) => s?.customer?.industrySector).filter(Boolean));
    const dsChannels = uniq(
        scenarios.flatMap((s) => asArray(s?.accounts).map((a) => a.salesChannel)).filter(Boolean)
    );

    fillMultiSelect(UI.fCustomerType, uniq([...refCustomerTypes, ...dsCustomerTypes]).sort());
    fillMultiSelect(UI.fIndustry, uniq([...refIndustries, ...dsIndustries]).sort());
    fillMultiSelect(UI.fSalesChannel, uniq([...refChannels, ...dsChannels]).sort());

    if (UI.refEnumsPreview) UI.refEnumsPreview.textContent = JSON.stringify(refEnums, null, 2);
    if (UI.refColorsPreview) UI.refColorsPreview.textContent = JSON.stringify(refColors, null, 2);

    // swatches
    if (UI.swatches) {
        UI.swatches.innerHTML = "";
        const tokenMap = buildTokenHexMap(refColors);
        // show primary tokens
        const showTokens = [
            "--clr-primary-red",
            "--clr-primary-yellow",
            "--clr-primary-black",
            "--clr-fg-purple",
            "--clr-fg-blue",
            "--clr-fg-teal",
            "--clr-bg-gray",
        ];
        showTokens.forEach((t) => {
            const hex = tokenMap.get(t);
            if (!hex) return;
            const d = document.createElement("div");
            d.className = "swatch";
            d.title = `${t} = ${hex}`;
            d.style.background = hex;
            UI.swatches.appendChild(d);
        });
    }
}

/* ---------------- D3 init ---------------- */
function initViz() {
    if (!UI.viz) return;
    UI.viz.innerHTML = "";

    svg = d3.select(UI.viz).append("svg").attr("width", "100%").attr("height", "100%");
    g = svg.append("g");

    zoom = d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);
}

function zoomToFit(pad = 40) {
    if (!svg || !g) return;
    const bbox = g.node().getBBox();
    const w = UI.viz.clientWidth || 1000;
    const h = UI.viz.clientHeight || 600;

    const scale = Math.min((w - pad) / bbox.width, (h - pad) / bbox.height);
    const tx = (w - scale * (bbox.x + bbox.width)) / 2;
    const ty = (h - scale * (bbox.y + bbox.height)) / 2;

    svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

/* ---------------- Hierarchy builder ----------------
   NOTE: This is a simplified renderer hook; your existing buildHierarchy logic can be pasted in.
   For now, we just show the root customer and its accounts/objects.
--------------------------------------------------- */
function buildHierarchyForScenario(s) {
    const cust = s.customer || {};
    const accounts = asArray(s.accounts);

    const root = {
        _stableId: cust.mdmCustomerId || `CUST_${s.scenarioName}`,
        nodeType: "GLOBAL_CUSTOMER",
        label: cust.tradingName || cust.officialName || s.scenarioName || "Customer",
        obj: cust,
        children: [],
    };

    // country customers (if present)
    const related = asArray(s.relatedCustomers);
    related.forEach((rc) => {
        root.children.push({
            _stableId: rc.mdmCustomerId,
            nodeType: "COUNTRY_CUSTOMER",
            label: rc.tradingName || rc.officialName || rc.mdmCustomerId,
            obj: rc,
            children: [],
        });
    });

    // accounts under root
    accounts.forEach((a) => {
        root.children.push({
            _stableId: a.mdmAccountId,
            nodeType: "ACCOUNT",
            label: a.mdmAccountId,
            obj: a,
            children: [],
        });
    });

    return root;
}

/* ---------------- Render ---------------- */
function renderNodeCard(d) {
    const t = d.data.nodeType;
    const colors = getSemanticColors(t);

    const w = LAYOUT.nodeW;
    const h = LAYOUT.nodeH;

    const group = g.append("g").attr("transform", `translate(${d.x},${d.y})`);

    group
        .append("rect")
        .attr("rx", 12)
        .attr("ry", 12)
        .attr("width", w)
        .attr("height", h)
        .attr("fill", colors.body)
        .attr("stroke", "#00000022")
        .attr("stroke-width", 1);

    group
        .append("rect")
        .attr("rx", 12)
        .attr("ry", 12)
        .attr("width", w)
        .attr("height", LAYOUT.headerH)
        .attr("fill", colors.header);

    group
        .append("text")
        .attr("x", 12)
        .attr("y", 20)
        .attr("fill", "#fff")
        .attr("font-weight", 700)
        .attr("font-size", 12)
        .text(d.data.label);

    const lines = [];
    const o = d.data.obj || {};

    if (t.includes("CUSTOMER")) {
        if (o.mdmCustomerId) lines.push(`mdmCustomerId: ${o.mdmCustomerId}`);
        if (o.customerType) lines.push(`customerType: ${o.customerType}`);
        if (o.industrySector) lines.push(`industry: ${o.industrySector}`);
    } else if (t === "ACCOUNT") {
        if (o.mdmAccountId) lines.push(`mdmAccountId: ${o.mdmAccountId}`);
        if (o.businessRoles) lines.push(`roles: ${(o.businessRoles || []).join(", ")}`);
        if (o.salesChannel) lines.push(`salesChannel: ${o.salesChannel}`);
    }

    group
        .append("text")
        .attr("x", 12)
        .attr("y", 48)
        .attr("fill", "#111")
        .attr("font-size", 11)
        .selectAll("tspan")
        .data(lines.slice(0, 6))
        .join("tspan")
        .attr("x", 12)
        .attr("dy", (d, i) => (i === 0 ? 0 : 16))
        .text((d) => d);

    group.on("click", () => {
        if (UI.json) UI.json.textContent = JSON.stringify(d.data.obj || d.data, null, 2);

        // toggle collapse
        const id = d.data._stableId;
        if (collapsedNodeIds.has(id)) collapsedNodeIds.delete(id);
        else collapsedNodeIds.add(id);

        renderActiveScenario();
    });

    return group;
}

function applyCollapseToHierarchy(root) {
    root.descendants().forEach((d) => {
        const id = d.data?._stableId;
        if (!id) return;
        if (collapsedNodeIds.has(id) && d.children && d.children.length) {
            d._children = d.children;
            d.children = null;
        } else if (!collapsedNodeIds.has(id) && d._children && d._children.length) {
            d.children = d._children;
            d._children = null;
        }
    });
}

function renderActiveScenario() {
    if (!activeScenario || !g) return;

    g.selectAll("*").remove();

    const vis = {
        showAddresses: !!UI.tAddresses?.checked,
        showContacts: !!UI.tContacts?.checked,
        showReferenceIds: !!UI.tReferenceIds?.checked,
    };

    const data = buildHierarchyForScenario(activeScenario, vis);
    const root = d3.hierarchy(data);
    lastRootHierarchy = root;

    applyCollapseToHierarchy(root);

    const tree = d3.tree().nodeSize([LAYOUT.nodeW + LAYOUT.gapX, LAYOUT.nodeH + LAYOUT.gapY]);
    tree(root);

    // links
    g.selectAll("path.link")
        .data(root.links())
        .join("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#D40511")
        .attr("stroke-width", 1.6)
        .attr("d", (d) => {
            const sx = d.source.x + LAYOUT.nodeW / 2;
            const sy = d.source.y + LAYOUT.nodeH;
            const tx = d.target.x + LAYOUT.nodeW / 2;
            const ty = d.target.y;
            return `M${sx},${sy} V${(sy + ty) / 2} H${tx} V${ty}`;
        });

    // nodes
    root.descendants().forEach((d) => renderNodeCard(d));

    zoomToFit(50);
}

/* ---------------- DQ Badge ---------------- */
function renderDQBadge() {
    if (!UI.dqText || !UI.dqDot) return;
    UI.dqText.textContent = "DQ: OK";
    UI.dqDot.style.background = "#00A651";
}

/* ---------------- Search ---------------- */
function applySearch(q) {
    if (!q || !q.trim()) return;
    const query = q.trim().toLowerCase();

    // naive: find first matching node label/id in current scenario and show its JSON
    const s = activeScenario || {};
    const hay = JSON.stringify(s).toLowerCase();
    if (hay.includes(query)) {
        UI.json.textContent = JSON.stringify(s, null, 2);
    }
}

/* ---------------- UI wiring ---------------- */
function wireUI() {
    safeOn(UI.selector, "change", (e) => {
        const idx = e.target.value;
        if (idx === "") return;
        activeScenarioIndex = Number(idx);
        activeScenario = scenarios[activeScenarioIndex];
        UI.json.textContent = JSON.stringify(activeScenario, null, 2);
        renderDQBadge();
        renderActiveScenario();
    });

    safeOn(UI.search, "input", (e) => applySearch(e.target.value));
    safeOn(UI.reset, "click", () => zoomToFit(40));

    safeOn(UI.btnClearFilters, "click", () => {
        [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel].forEach((sel) => {
            if (!sel) return;
            Array.from(sel.options).forEach((o) => (o.selected = false));
        });
        populateScenarioDropdown();
        renderActiveScenario();
    });

    // Live filter changes
    [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel].forEach((sel) => {
        safeOn(sel, "change", () => {
            populateScenarioDropdown();
            if (activeScenarioIndex >= 0) {
                activeScenario = scenarios[activeScenarioIndex];
                UI.json.textContent = JSON.stringify(activeScenario, null, 2);
                renderActiveScenario();
            } else {
                if (UI.json) UI.json.textContent = "No scenarios match selected filters.";
                if (g) g.selectAll("*").remove();
            }
        });
    });

    const rerender = () => {
        renderActiveScenario();
        renderDQBadge();
    };

    safeOn(UI.tAddresses, "change", rerender);
    safeOn(UI.tContacts, "change", rerender);
    safeOn(UI.tReferenceIds, "change", rerender);

    safeOn(UI.btnCollapseAll, "click", () => {
        if (!lastRootHierarchy) return;
        lastRootHierarchy.descendants().forEach((d) => collapsedNodeIds.add(d.data?._stableId));
        renderActiveScenario();
    });

    safeOn(UI.btnExpandAll, "click", () => {
        collapsedNodeIds.clear();
        renderActiveScenario();
    });
}

/* ---------------- Boot ---------------- */
(async function main() {
    initViz();
    wireUI();

    try {
        const [cust, ref, colors] = await Promise.all([
            fetchJson(PATHS.customers),
            fetchJson(PATHS.reference),
            fetchJson(PATHS.colors),
        ]);

        scenarios = asArray(cust);
        refEnums = ref || {};
        refColors = colors || {};

        populateFilterDropdowns();
        populateScenarioDropdown();
        renderDQBadge();

        const idxs = getFilteredScenarioIndices();
        const idx = idxs.length ? idxs[0] : (scenarios.length ? 0 : -1);

        if (idx >= 0) {
            activeScenarioIndex = idx;
            activeScenario = scenarios[idx];

            if (UI.selector) UI.selector.value = String(idx);
            if (UI.json) UI.json.textContent = JSON.stringify(activeScenario, null, 2);

            renderActiveScenario();
        } else {
            if (UI.json) UI.json.textContent = `No scenarios found in ${PATHS.customers}`;
        }
    } catch (err) {
        if (UI.json) {
            UI.json.textContent =
                `DATA LOAD ERROR\n\n${err.message}\n\nExpected paths:\n- ${PATHS.customers}\n- ${PATHS.reference}\n- ${PATHS.colors}\n\nTIP: Use Live Server / http server (avoid file://)`;
        }
        console.error(err);
    }
})();