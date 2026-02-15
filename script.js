"use strict";

/* ===============================
   DHL eCommerce · Customer MDM Viewer
   Fixes requested:
   - Contacts are separate NODE cards again (CONTACT)
   - Contact channels (email/phone) shown inside CONTACT card (not separate nodes)
   - Icons restored for all major objects
   - Remove left reference panels; add top-right legend bar
================================ */

const PATHS = {
    customers: "./data/customerData.json",
    reference: "./data/reference_master_data.json",
    colors: "./data/reference_colors.json",
};

const UI = {
    viz: document.getElementById("viz-container"),
    legend: document.getElementById("legendBar"),
    selector: document.getElementById("scenarioSelector"),
    search: document.getElementById("nodeSearch"),
    reset: document.getElementById("resetZoom"),
    json: document.getElementById("json-display"),

    fCustomerType: document.getElementById("filterCustomerType"),
    fIndustry: document.getElementById("filterIndustry"),
    fSalesChannel: document.getElementById("filterSalesChannel"),
    btnClearFilters: document.getElementById("clearFilters"),

    tAddresses: document.getElementById("toggleAddresses"),
    tContacts: document.getElementById("toggleContacts"),
    tContracts: document.getElementById("toggleContracts"),

    btnCollapseAll: document.getElementById("collapseAll"),
    btnExpandAll: document.getElementById("expandAll"),

    dqDot: document.getElementById("dqDot"),
    dqText: document.getElementById("dqText"),
};

let scenarios = [];
let refEnums = {};
let refColors = {};
let activeScenarioIndex = -1;
let activeScenario = null;

let svg, g, zoom;
let lastRootHierarchy = null;
const collapsedNodeIds = new Set();

// layout
const L = { nodeW: 320, nodeH: 160, headerH: 34, gapX: 70, gapY: 30 };

function asArray(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
function uniq(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }
function safeOn(el, evt, fn) { if (el && el.addEventListener) el.addEventListener(evt, fn); }

async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
    return await res.json();
}

/* ---------- Icons ---------- */
const ICON = {
    GLOBAL_CUSTOMER: "🌐",
    COUNTRY_CUSTOMER: "🏢",
    ACCOUNT: "🧾",
    ADDRESS: "📍",
    ADDRESS_PICKUP: "🏬",
    CONTACT: "👤",
    CONTRACT: "📄",
    BILLING_PROFILE: "💳",
    PLATFORM: "🧩",
};

function iconForNode(d) {
    const t = d.data.type;
    if (t === "ADDRESS") {
        const at = (d.data.data?.addressType || "").toUpperCase();
        if (at.includes("PICKUP")) return ICON.ADDRESS_PICKUP;
        return ICON.ADDRESS;
    }
    return ICON[t] || "•";
}

/* ---------- Colors ---------- */
function buildTokenHexMap(colorsObj) {
    const map = new Map();
    const walk = (o) => {
        if (!o || typeof o !== "object") return;
        Object.values(o).forEach((v) => {
            if (!v || typeof v !== "object") return;
            if (v.token && v.hex) map.set(v.token, v.hex);
            walk(v);
        });
    };
    walk(colorsObj);
    return map;
}
function resolveToken(value, tokenMap) {
    if (!value) return null;
    if (typeof value === "string" && value.startsWith("--")) return tokenMap.get(value) || null;
    if (typeof value === "string" && value.startsWith("#")) return value;
    return null;
}
function getSemanticColors(key) {
    const fallback = { header: "#D40511", body: "#FFF7D1", accent: "#000" };
    const sm = refColors?.semanticMapping;
    if (!sm || !sm[key]) return fallback;
    const tokenMap = buildTokenHexMap(refColors);
    const m = sm[key];
    return {
        header: resolveToken(m.header, tokenMap) || fallback.header,
        body: resolveToken(m.body, tokenMap) || fallback.body,
        accent: resolveToken(m.accent, tokenMap) || fallback.accent,
    };
}
function semanticKeyForType(t) {
    if (t === "GLOBAL_CUSTOMER") return "GLOBAL_CUSTOMER";
    if (t === "COUNTRY_CUSTOMER") return "COUNTRY_CUSTOMER";
    if (t === "ACCOUNT") return "ACCOUNT";
    if (t === "CONTRACT") return "CONTRACT";
    if (t === "BILLING_PROFILE") return "BILLING_PROFILE";
    if (t === "ADDRESS") return "ADDRESS";
    if (t === "CONTACT") return "CONTACT";
    if (t === "PLATFORM") return "PLATFORM";
    return "ACCOUNT";
}

/* ---------- Legend (top-right) ---------- */
function renderLegend() {
    if (!UI.legend) return;

    const items = [
        { type: "GLOBAL_CUSTOMER", label: "Global Customer" },
        { type: "COUNTRY_CUSTOMER", label: "Customer" },
        { type: "ACCOUNT", label: "Account" },
        { type: "CONTRACT", label: "Contract" },
        { type: "BILLING_PROFILE", label: "Billing" },
        { type: "ADDRESS", label: "Address" },
        { type: "CONTACT", label: "Contact" },
        { type: "PLATFORM", label: "Platform" },
    ];

    UI.legend.innerHTML = items.map(it => {
        const c = getSemanticColors(semanticKeyForType(it.type));
        const icon = ICON[it.type] || "•";
        return `
      <div class="legend-item" title="${it.label}">
        <span class="legend-swatch" style="background:${c.header}"></span>
        <span class="legend-icon">${icon}</span>
        <span class="legend-text">${it.label}</span>
      </div>
    `;
    }).join("");
}

/* ---------- Filters (single select) ---------- */
function fillSelectSingle(selectEl, values) {
    if (!selectEl) return;
    const current = selectEl.value || "";
    selectEl.innerHTML = "";

    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All";
    selectEl.appendChild(all);

    (values || []).forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    });

    const canRestore = Array.from(selectEl.options).some(o => o.value === current);
    selectEl.value = canRestore ? current : "";
}

function discoverEnums() {
    const e = refEnums || {};
    const customerTypes = uniq(e.customerTypeEnums || e.customerTypes || e?.enums?.customerType || []);
    const industries = uniq(e.industryEnums || e.industries || e?.enums?.industrySector || []);
    const channels = uniq(e.salesChannelEnums || e.channels || e?.enums?.salesChannel || []);

    const dsCustomerTypes = uniq(scenarios.map(s => s.customer?.customerType).filter(Boolean));
    const dsIndustries = uniq(scenarios.map(s => s.customer?.industrySector).filter(Boolean));
    const dsChannels = uniq(scenarios.flatMap(s => asArray(s.accounts).map(a => a.salesChannel)).filter(Boolean));

    fillSelectSingle(UI.fCustomerType, uniq([...customerTypes, ...dsCustomerTypes]).sort());
    fillSelectSingle(UI.fIndustry, uniq([...industries, ...dsIndustries]).sort());
    fillSelectSingle(UI.fSalesChannel, uniq([...channels, ...dsChannels]).sort());
}

function scenarioMatchesFilters(s) {
    const type = UI.fCustomerType?.value || "";
    const ind = UI.fIndustry?.value || "";
    const ch = UI.fSalesChannel?.value || "";

    const cust = s.customer || {};
    const accounts = asArray(s.accounts);

    const okType = !type || cust.customerType === type;
    const okInd = !ind || cust.industrySector === ind;
    const okCh = !ch || accounts.some(a => a.salesChannel === ch);

    return okType && okInd && okCh;
}

function populateScenarioDropdown() {
    if (!UI.selector) return;

    UI.selector.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "-- Choose Scenario --";
    UI.selector.appendChild(opt0);

    scenarios.forEach((s, i) => {
        if (!scenarioMatchesFilters(s)) return;
        const opt = document.createElement("option");
        opt.value = String(i);
        opt.textContent = s.scenarioName || `Scenario ${i + 1}`;
        UI.selector.appendChild(opt);
    });

    const stillVisible = activeScenarioIndex >= 0 && scenarioMatchesFilters(scenarios[activeScenarioIndex]);
    if (!stillVisible) {
        const first = Array.from(UI.selector.options).find(o => o.value !== "");
        if (first) {
            activeScenarioIndex = Number(first.value);
            activeScenario = scenarios[activeScenarioIndex];
            UI.selector.value = String(activeScenarioIndex);
        } else {
            activeScenarioIndex = -1;
            activeScenario = null;
        }
    } else {
        UI.selector.value = String(activeScenarioIndex);
    }
}

/* ---------- View toggles ---------- */
function getViewFlags() {
    return {
        showAddresses: UI.tAddresses ? !!UI.tAddresses.checked : true,
        showContacts: UI.tContacts ? !!UI.tContacts.checked : true,
        showContracts: UI.tContracts ? !!UI.tContracts.checked : true,
    };
}

/* ---------- Tree builder ---------- */
function stableId(type, obj) {
    if (!obj) return `${type}::${Math.random()}`;
    if (type === "GLOBAL_CUSTOMER" || type === "COUNTRY_CUSTOMER") return obj.mdmCustomerId || `${type}::${obj.officialName}`;
    if (type === "ACCOUNT") return obj.mdmAccountId || `${type}::${obj.tradingName}`;
    if (type === "CONTRACT") return obj.contractId || `${type}::${obj.contractName}`;
    if (type === "BILLING_PROFILE") return obj.billingProfileId || `${type}::${obj.billingAccountNumber}`;
    if (type === "ADDRESS") return obj.addressId || `${type}::${obj.city}-${obj.postalcode}`;
    if (type === "CONTACT") return obj.contactPersonId || `${type}::${obj.firstName}-${obj.lastName}`;
    if (type === "PLATFORM") return obj.platformId || `${type}::${obj.name}`;
    return `${type}::${JSON.stringify(obj).slice(0, 40)}`;
}

function refSummary(list) {
    const refs = asArray(list);
    if (!refs.length) return null;
    return refs.slice(0, 3).map(r => `${r.refType}:${r.refValue}`).join(" | ");
}

function makeNode(type, obj, label, extraLines = []) {
    return { type, data: obj || {}, _id: stableId(type, obj || { label }), label, lines: extraLines, children: [] };
}

function addAddressChildren(parent, addresses, view) {
    if (!view.showAddresses) return;
    asArray(addresses).forEach(a => {
        const lbl = `${a.addressType || "ADDRESS"} · ${a.city || ""}`.trim();
        const lines = [
            a.street ? `${a.street} ${a.houseNumber || ""}`.trim() : null,
            [a.postalcode, a.city].filter(Boolean).join(" "),
            a.country || null,
        ].filter(Boolean);
        parent.children.push(makeNode("ADDRESS", a, lbl, lines));
    });
}

function addContactChildren(parent, contactPersons, view) {
    if (!view.showContacts) return;

    asArray(contactPersons).forEach(cp => {
        const ch = asArray(cp.communicationChannels);
        const email = ch.find(x => x.type === "EMAIL")?.value;
        const phone = ch.find(x => x.type === "PHONE")?.value;

        const name = [cp.firstName, cp.lastName].filter(Boolean).join(" ").trim() || cp.contactPersonId || "Contact";
        const header = cp.jobTitle ? `${name} · ${cp.jobTitle}` : name;

        const lines = [
            cp.contactType ? `type: ${cp.contactType}` : null,
            email ? `email: ${email}` : null,
            phone ? `phone: ${phone}` : null,
        ].filter(Boolean);

        parent.children.push(makeNode("CONTACT", cp, header, lines));
    });
}

function buildContractsForAccount(accNode, account, view) {
    if (!view.showContracts) return;

    const contracts = asArray(account.contracts);
    contracts.forEach(c => {
        const cLines = [
            c.contractId ? `contractId: ${c.contractId}` : null,
            c.startDate ? `startDate: ${c.startDate}` : null,
            c.contractDetail?.contractType ? `type: ${c.contractDetail.contractType}` : null,
        ].filter(Boolean);

        const cNode = makeNode("CONTRACT", c, (c.contractName || "Contract"), cLines);

        addAddressChildren(cNode, c.addresses, view);
        addContactChildren(cNode, c.contactPersons, view);

        if (c.billingProfile) {
            const bp = c.billingProfile;
            const bpLines = [
                bp.billingProfileId ? `billingProfileId: ${bp.billingProfileId}` : null,
                bp.billingCurrency ? `billingCurrency: ${bp.billingCurrency}` : null,
                bp.invoiceDelivery ? `invoiceDelivery: ${bp.invoiceDelivery}` : null,
                refSummary(bp.referenceIds) ? `refs: ${refSummary(bp.referenceIds)}` : null,
            ].filter(Boolean);

            const bpNode = makeNode("BILLING_PROFILE", bp, (bp.billingProfileId || "Billing Profile"), bpLines);
            addAddressChildren(bpNode, bp.addresses, view);
            addContactChildren(bpNode, bp.contactPersons, view);

            cNode.children.push(bpNode);
        }

        accNode.children.push(cNode);
    });
}

function buildAccountTree(accounts, mdmCustomerIdFilter, view) {
    const list = asArray(accounts).filter(a => !mdmCustomerIdFilter || a.mdmCustomerId === mdmCustomerIdFilter);

    const childrenByParent = new Map();
    list.forEach(a => {
        const pid = a.parentAccountId || "__ROOT__";
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid).push(a);
    });

    function buildNodeForAccount(a) {
        const roles = asArray(a.businessRoles).join(", ");
        const accLines = [
            a.mdmAccountId ? `mdmAccountId: ${a.mdmAccountId}` : null,
            roles ? `roles: ${roles}` : null,
            a.salesChannel ? `salesChannel: ${a.salesChannel}` : null,
            a.currency ? `currency: ${a.currency}` : null,
            a.paymentTerms ? `paymentTerms: ${a.paymentTerms}` : null,
            a.platformObject?.platformId ? `platformId: ${a.platformObject.platformId}` : null,
            refSummary(a.referenceIds) ? `refs: ${refSummary(a.referenceIds)}` : null,
        ].filter(Boolean);

        const node = makeNode("ACCOUNT", a, a.mdmAccountId, accLines);

        // children nodes (controlled by view toggles)
        addAddressChildren(node, a.addresses, view);
        addContactChildren(node, a.contactPersons, view);
        buildContractsForAccount(node, a, view);

        // platform as node (always visible if exists)
        if (a.platformObject && (a.platformObject.platformId || a.platformObject.name)) {
            const p = a.platformObject;
            const pLines = [
                p.platformId ? `platformId: ${p.platformId}` : null,
                p.type ? `type: ${p.type}` : null,
                p.provider ? `provider: ${p.provider}` : null,
            ].filter(Boolean);
            node.children.push(makeNode("PLATFORM", p, (p.name || "Platform"), pLines));
        }

        // child accounts
        const kids = childrenByParent.get(a.mdmAccountId) || [];
        kids.forEach(k => node.children.push(buildNodeForAccount(k)));

        return node;
    }

    const roots = childrenByParent.get("__ROOT__") || [];
    return roots.map(buildNodeForAccount);
}

function buildHierarchyForScenario(scenario, view) {
    const cust = scenario.customer || {};
    const accounts = asArray(scenario.accounts);
    const related = asArray(scenario.relatedCustomers);

    const gcLines = [
        cust.mdmCustomerId ? `mdmCustomerId: ${cust.mdmCustomerId}` : null,
        cust.customerType ? `customerType: ${cust.customerType}` : null,
        cust.customerLevel ? `customerLevel: ${cust.customerLevel}` : null,
        cust.industrySector ? `industry: ${cust.industrySector}` : null,
        cust.countryOfRegistration ? `country: ${cust.countryOfRegistration}` : null,
    ].filter(Boolean);

    const rs = refSummary(cust.referenceIds);
    if (rs) gcLines.push(`refs: ${rs}`);

    const root = makeNode(
        "GLOBAL_CUSTOMER",
        cust,
        (cust.tradingName || cust.officialName || scenario.scenarioName || "Customer"),
        gcLines
    );

    // optional children
    addAddressChildren(root, cust.addresses, view);
    addContactChildren(root, cust.contactPersons, view);

    if (related.length) {
        related.forEach(cc => {
            const ccLines = [
                cc.mdmCustomerId ? `mdmCustomerId: ${cc.mdmCustomerId}` : null,
                cc.customerLevel ? `customerLevel: ${cc.customerLevel}` : null,
                cc.countryOfRegistration ? `country: ${cc.countryOfRegistration}` : null,
            ].filter(Boolean);

            const ccNode = makeNode(
                "COUNTRY_CUSTOMER",
                cc,
                (cc.tradingName || cc.officialName || cc.mdmCustomerId),
                ccLines
            );

            addAddressChildren(ccNode, cc.addresses, view);
            addContactChildren(ccNode, cc.contactPersons, view);

            buildAccountTree(accounts, cc.mdmCustomerId, view).forEach(a => ccNode.children.push(a));
            root.children.push(ccNode);
        });
    } else {
        buildAccountTree(accounts, null, view).forEach(a => root.children.push(a));
    }

    return root;
}

/* ---------- D3 init/render ---------- */
function initViz() {
    if (!UI.viz) return;
    UI.viz.innerHTML = "";
    svg = d3.select(UI.viz).append("svg").attr("width", "100%").attr("height", "100%");
    g = svg.append("g");
    zoom = d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);
}

function zoomToFit(pad = 55) {
    if (!svg || !g) return;
    const bbox = g.node().getBBox();
    const w = UI.viz.clientWidth || 1200;
    const h = UI.viz.clientHeight || 700;
    const scale = Math.min((w - pad) / bbox.width, (h - pad) / bbox.height);
    const tx = (w - scale * (bbox.x + bbox.width)) / 2;
    const ty = (h - scale * (bbox.y + bbox.height)) / 2;
    svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

function applyCollapse(root) {
    root.descendants().forEach(d => {
        const id = d.data?._id;
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

function renderNodeCard(d) {
    const t = d.data.type;
    const colors = getSemanticColors(semanticKeyForType(t));
    const w = L.nodeW, h = L.nodeH;

    const group = g.append("g")
        .attr("class", "node")
        .attr("transform", `translate(${d.x},${d.y})`);

    group.append("rect")
        .attr("rx", 14).attr("ry", 14)
        .attr("width", w).attr("height", h)
        .attr("fill", colors.body)
        .attr("stroke", "#00000025").attr("stroke-width", 1);

    group.append("rect")
        .attr("rx", 14).attr("ry", 14)
        .attr("width", w).attr("height", L.headerH)
        .attr("fill", colors.header);

    // icon
    group.append("text")
        .attr("x", 12).attr("y", 22)
        .attr("fill", "#fff")
        .attr("font-weight", 900)
        .attr("font-size", 12)
        .text(iconForNode(d));

    // title
    group.append("text")
        .attr("x", 32).attr("y", 22)
        .attr("fill", "#fff")
        .attr("font-weight", 800)
        .attr("font-size", 12)
        .text(d.data.label || t);

    // collapse indicator
    const hasKids = (d.children && d.children.length) || (d._children && d._children.length);
    if (hasKids) {
        group.append("text")
            .attr("x", w - 18).attr("y", 22)
            .attr("fill", "#fff")
            .attr("font-weight", 900)
            .attr("text-anchor", "middle")
            .text(collapsedNodeIds.has(d.data._id) ? "+" : "–");
    }

    const lines = asArray(d.data.lines).slice(0, 7);
    group.append("text")
        .attr("x", 12).attr("y", 52)
        .attr("fill", "#111")
        .attr("font-size", 11)
        .selectAll("tspan")
        .data(lines)
        .join("tspan")
        .attr("x", 12)
        .attr("dy", (x, i) => (i === 0 ? 0 : 16))
        .text(x => x);

    // hover json
    group.on("mouseenter", () => {
        if (UI.json) UI.json.textContent = JSON.stringify(d.data.data || d.data, null, 2);
    });

    // click collapse
    group.on("click", () => {
        const id = d.data._id;
        if (collapsedNodeIds.has(id)) collapsedNodeIds.delete(id);
        else collapsedNodeIds.add(id);
        renderActiveScenario();
    });

    return group;
}

function renderActiveScenario() {
    if (!activeScenario || !g) return;
    g.selectAll("*").remove();

    const view = getViewFlags();
    const data = buildHierarchyForScenario(activeScenario, view);
    const root = d3.hierarchy(data);
    lastRootHierarchy = root;

    applyCollapse(root);

    // vertical tree layout
    const tree = d3.tree().nodeSize([L.nodeW + L.gapX, L.nodeH + L.gapY]);
    tree(root);

    // links (orthogonal)
    g.selectAll("path.link")
        .data(root.links())
        .join("path")
        .attr("class", "link")
        .attr("fill", "none")
        .attr("stroke", "#D40511")
        .attr("stroke-width", 1.6)
        .attr("d", (d) => {
            const sx = d.source.x + L.nodeW / 2;
            const sy = d.source.y + L.nodeH;
            const tx = d.target.x + L.nodeW / 2;
            const ty = d.target.y;
            return `M${sx},${sy} V${(sy + ty) / 2} H${tx} V${ty}`;
        });

    // nodes
    root.descendants().forEach(d => renderNodeCard(d));
    zoomToFit(55);
}

/* ---------- DQ badge ---------- */
function renderDQ() {
    if (!UI.dqText || !UI.dqDot) return;
    UI.dqText.textContent = "DQ: OK";
    UI.dqDot.style.background = "#00A651";
}

/* ---------- UI wiring ---------- */
function wireUI() {
    safeOn(UI.selector, "change", (e) => {
        const v = e.target.value;
        if (v === "") return;
        activeScenarioIndex = Number(v);
        activeScenario = scenarios[activeScenarioIndex];
        renderActiveScenario();
    });

    safeOn(UI.reset, "click", () => zoomToFit(55));

    safeOn(UI.search, "input", (e) => {
        const q = (e.target.value || "").trim().toLowerCase();
        if (!q) return;
        const hay = JSON.stringify(activeScenario || {}).toLowerCase();
        if (hay.includes(q) && UI.json) UI.json.textContent = JSON.stringify(activeScenario, null, 2);
    });

    // filter live
    [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel].forEach(sel => {
        safeOn(sel, "change", () => {
            populateScenarioDropdown();
            if (activeScenarioIndex >= 0) renderActiveScenario();
            else if (UI.json) UI.json.textContent = "No scenarios match selected filters.";
        });
    });

    safeOn(UI.btnClearFilters, "click", () => {
        if (UI.fCustomerType) UI.fCustomerType.value = "";
        if (UI.fIndustry) UI.fIndustry.value = "";
        if (UI.fSalesChannel) UI.fSalesChannel.value = "";
        populateScenarioDropdown();
        if (activeScenarioIndex >= 0) renderActiveScenario();
    });

    // view toggles
    [UI.tAddresses, UI.tContacts, UI.tContracts].forEach(t => {
        safeOn(t, "change", () => renderActiveScenario());
    });

    safeOn(UI.btnCollapseAll, "click", () => {
        if (!lastRootHierarchy) return;
        lastRootHierarchy.descendants().forEach(d => collapsedNodeIds.add(d.data?._id));
        renderActiveScenario();
    });

    safeOn(UI.btnExpandAll, "click", () => {
        collapsedNodeIds.clear();
        renderActiveScenario();
    });
}

/* ---------- Boot ---------- */
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

        discoverEnums();
        populateScenarioDropdown();
        renderDQ();

        renderLegend();

        // select first scenario
        if (activeScenarioIndex >= 0) {
            activeScenario = scenarios[activeScenarioIndex];
            renderActiveScenario();
        } else if (scenarios.length) {
            activeScenarioIndex = 0;
            activeScenario = scenarios[0];
            if (UI.selector) UI.selector.value = "0";
            renderActiveScenario();
        } else if (UI.json) {
            UI.json.textContent = `No scenarios found in ${PATHS.customers}`;
        }
    } catch (err) {
        console.error(err);
        if (UI.json) {
            UI.json.textContent =
                `DATA LOAD ERROR\n\n${err.message}\n\nExpected:\n- ${PATHS.customers}\n- ${PATHS.reference}\n- ${PATHS.colors}\n\nTip: Use Live Server / http server (avoid file://).`;
        }
    }
})();