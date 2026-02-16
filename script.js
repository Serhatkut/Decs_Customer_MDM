"use strict";

/* ===========================================================
   DHL eCommerce · Customer Master Data Viewer
   - Topbar: scenario + filters
   - Sidebar: inspector (collapsible) + business meaning + readable JSON
   - Footer: legend (click to hide/show object types)
   Data sources (relative):
     ./data/customerData.json
     ./data/reference_master_data.json
     ./data/reference_colors.json
=========================================================== */

const PATHS = {
    customers: "./data/customerData.json",
    reference: "./data/reference_master_data.json",
    colors: "./data/reference_colors.json",
};

const UI = {
    viz: document.getElementById("viz-container"),
    selector: document.getElementById("scenarioSelector"),
    search: document.getElementById("nodeSearch"),
    reset: document.getElementById("resetZoom"),

    fCustomerType: document.getElementById("filterCustomerType"),
    fIndustry: document.getElementById("filterIndustry"),
    fSalesChannel: document.getElementById("filterSalesChannel"),
    clearFilters: document.getElementById("clearFilters"),

    toggleInspector: document.getElementById("toggleInspector"),
    inspector: document.getElementById("inspectorSidebar"),

    btnCollapseAll: document.getElementById("collapseAll"),
    btnExpandAll: document.getElementById("expandAll"),

    dqDot: document.getElementById("dqDot"),
    dqText: document.getElementById("dqText"),

    selType: document.getElementById("selType"),
    selId: document.getElementById("selId"),
    selName: document.getElementById("selName"),
    selCountry: document.getElementById("selCountry"),
    selCustomerType: document.getElementById("selCustomerType"),
    selIndustry: document.getElementById("selIndustry"),
    selChannel: document.getElementById("selChannel"),

    meaningCustomerType: document.getElementById("meaningCustomerType"),
    meaningSalesChannel: document.getElementById("meaningSalesChannel"),
    meaningBody: document.getElementById("meaningBody"),

    readableJson: document.getElementById("readableJson"),
    rawJson: document.getElementById("json-display"),

    legend: document.getElementById("legendBar"),
};

function safeOn(el, evt, fn) { if (el && el.addEventListener) el.addEventListener(evt, fn); }
function asArray(v) { return v ? (Array.isArray(v) ? v : [v]) : []; }
function uniq(arr) { return Array.from(new Set((arr || []).filter(Boolean))); }
function escapeHtml(s) {
    return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
    return await res.json();
}

/* ---------- Business definitions (user-provided) ---------- */
const CUSTOMER_TYPE_DEF = {
    STRATEGIC_CUSTOMERS: {
        title: "Strategic Customers (Major & Key Accounts)",
        body: "Dedicated management for high-value, complex, multi-national customers. Focus: global governance, QBRs, customized solutions and long-term retention."
    },
    RELATIONSHIP_CUSTOMERS: {
        title: "Relationship Customers (Standard B2B)",
        body: "Traditional B2B customers managed via Field Sales or Telesales. Focus: hunting + farming, retention, upsell and predictable recurring volume."
    },
    RESELLERS: {
        title: "Resellers (Aggregator)",
        body: "Tech / logistics intermediaries reselling DHL services to SMEs. Focus: enablement, partner operations, and tracking underlying shippers via reference IDs."
    },
    RETAIL_CASH_CUSTOMERS: {
        title: "Retail / Cash Customers",
        body: "Ad-hoc shippers using ServicePoints / retail network. Transactional, pay-as-you-go. Typically no contract; immediate payment terms."
    },
    PARTNERS: {
        title: "Partners (Marketplace Ecosystem)",
        body: "Platforms bringing volume via ecosystem partnerships. Focus: partner management, integration and linking underlying sellers/merchants to legal entities."
    },
    MULTICHANNEL_DIGITAL_CUSTOMERS: {
        title: "Multichannel / Digital Customers",
        body: "Self-onboarded via portal/plugins/APIs. Focus: automation, scalability and low-touch operations; often managed by digital channel (bots/support)."
    },
    INTERNAL_CUSTOMERS: {
        title: "Internal Customers",
        body: "Inter-company logistics services inside DHL. Focus: internal efficiency; payment terms are internal transfer/cost center based."
    }
};

const SALES_CHANNEL_DEF = {
    MAJOR_ACCOUNT: { title: "Major Account (Strategic Channel)", body: "High-value, complex accounts with dedicated KAM/GAM management, governance and QBR cadence." },
    KEY_ACCOUNT: { title: "Key Account (Strategic Channel)", body: "Key account management for strategic portfolios, often cross-country, with tailored commercial/ops governance." },
    FIELD_SALES: { title: "Field Sales (Relationship Channel)", body: "Face-to-face sales management for mid/large domestic customers; hunting & farming through visits." },
    TELESALES: { title: "Telesales / Inside Sales (Relationship Channel)", body: "Remote management for SMEs; efficiency, retention and upselling with lower cost-to-serve." },
    MULTICHANNEL: { title: "Digital / Multichannel (Automated Channel)", body: "Low-touch onboarding via web portals, plugins or APIs; scalable volume acquisition." },
    SERVICE_POINTS_RETAIL: { title: "Retail / ServicePoint (Cash Channel)", body: "Physical parcel shop/locker network; ad-hoc, transactional, pay-as-you-go." },
    PARTNER_MANAGERS: { title: "Partner Channel (Indirect)", body: "Management of intermediaries (platforms/resellers/integrators) who sell or integrate DHL services." },
    INTERNAL: { title: "Internal Channel", body: "Internal DHL logistics services, cost center based, driven by operational needs." }
};

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

/* ---------- Colors (reference_colors.json) ---------- */
let refColors = {};
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
    // Platform must be distinct (light gray) – user request
    if (key === "PLATFORM") {
        return { header: "#D9DDE1", body: "#F2F4F6", accent: "#111" };
    }

    const fallback = { header: "#D40511", body: "#FFF5CC", accent: "#111" };
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

/* ---------- Reference enums ---------- */
let refEnums = {};
function discoverEnums(scenarios) {
    const domains = refEnums?.domains || {};
    const customerTypes = uniq(domains.customerType || []);
    const industries = uniq(domains.industrySector || []);
    const channels = uniq(domains.salesChannel || []);

    const dsCustomerTypes = uniq(scenarios.map(s => s.customer?.customerType).filter(Boolean));
    const dsIndustries = uniq(scenarios.map(s => s.customer?.industrySector).filter(Boolean));
    const dsChannels = uniq(scenarios.flatMap(s => asArray(s.accounts).map(a => a.salesChannel)).filter(Boolean));

    fillSelect(UI.fCustomerType, uniq([...customerTypes, ...dsCustomerTypes]).sort());
    fillSelect(UI.fIndustry, uniq([...industries, ...dsIndustries]).sort());
    fillSelect(UI.fSalesChannel, uniq([...channels, ...dsChannels]).sort());
}
function fillSelect(selectEl, values) {
    if (!selectEl) return;
    const current = selectEl.value || "";
    selectEl.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All";
    selectEl.appendChild(all);

    (values || []).forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        selectEl.appendChild(opt);
    });

    const canRestore = Array.from(selectEl.options).some(o => o.value === current);
    selectEl.value = canRestore ? current : "";
}

/* ---------- Data / state ---------- */
let scenarios = [];
let activeScenarioIndex = -1;
let activeScenario = null;

/* Collapse state */
const collapsedNodeIds = new Set();
let lastRootHierarchy = null;

/* Legend toggles */
const hiddenTypes = new Set(); // e.g. CONTACT, ADDRESS…

/* ---------- Filters ---------- */
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
function makeNode(type, obj, label, extraLines = []) {
    return { type, data: obj || {}, _id: stableId(type, obj || { label }), label, lines: extraLines, children: [] };
}
function refSummary(list) {
    const refs = asArray(list);
    if (!refs.length) return null;
    return refs.slice(0, 3).map(r => `${r.refType}:${r.refValue}`).join(" | ");
}

function addAddressChildren(parent, addresses) {
    if (hiddenTypes.has("ADDRESS")) return;
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
function addContactChildren(parent, contactPersons) {
    if (hiddenTypes.has("CONTACT")) return;
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

function buildContractsForAccount(accNode, account) {
    if (hiddenTypes.has("CONTRACT")) return;

    const contracts = asArray(account.contracts);
    contracts.forEach(c => {
        const cLines = [
            c.contractId ? `contractId: ${c.contractId}` : null,
            c.startDate ? `startDate: ${c.startDate}` : null,
            c.contractDetail?.contractType ? `type: ${c.contractDetail.contractType}` : null,
        ].filter(Boolean);

        const cNode = makeNode("CONTRACT", c, (c.contractName || "Contract"), cLines);

        addAddressChildren(cNode, c.addresses);
        addContactChildren(cNode, c.contactPersons);

        if (c.billingProfile && !hiddenTypes.has("BILLING_PROFILE")) {
            const bp = c.billingProfile;
            const bpLines = [
                bp.billingProfileId ? `billingProfileId: ${bp.billingProfileId}` : null,
                bp.billingCurrency ? `billingCurrency: ${bp.billingCurrency}` : null,
                bp.invoiceDelivery ? `invoiceDelivery: ${bp.invoiceDelivery}` : null,
                refSummary(bp.referenceIds) ? `refs: ${refSummary(bp.referenceIds)}` : null,
            ].filter(Boolean);

            const bpNode = makeNode("BILLING_PROFILE", bp, (bp.billingProfileId || "Billing Profile"), bpLines);
            addAddressChildren(bpNode, bp.addresses);
            addContactChildren(bpNode, bp.contactPersons);

            cNode.children.push(bpNode);
        }

        accNode.children.push(cNode);
    });
}

function buildAccountTree(accounts, mdmCustomerIdFilter) {
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

        addAddressChildren(node, a.addresses);
        addContactChildren(node, a.contactPersons);
        buildContractsForAccount(node, a);

        if (a.platformObject && (a.platformObject.platformId || a.platformObject.name) && !hiddenTypes.has("PLATFORM")) {
            const p = a.platformObject;
            const pLines = [
                p.platformId ? `platformId: ${p.platformId}` : null,
                p.type ? `type: ${p.type}` : null,
                p.provider ? `provider: ${p.provider}` : null,
            ].filter(Boolean);
            node.children.push(makeNode("PLATFORM", p, (p.name || "Platform"), pLines));
        }

        const kids = childrenByParent.get(a.mdmAccountId) || [];
        kids.forEach(k => node.children.push(buildNodeForAccount(k)));

        return node;
    }

    const roots = childrenByParent.get("__ROOT__") || [];
    return roots.map(buildNodeForAccount);
}

function buildHierarchyForScenario(s) {
    const cust = s.customer || {};
    const accounts = asArray(s.accounts);
    const related = asArray(s.relatedCustomers);

    const gcLines = [
        cust.mdmCustomerId ? `mdmCustomerId: ${cust.mdmCustomerId}` : null,
        cust.customerType ? `customerType: ${cust.customerType}` : null,
        cust.customerLevel ? `customerLevel: ${cust.customerLevel}` : null,
        cust.industrySector ? `industry: ${cust.industrySector}` : null,
        cust.countryOfRegistration ? `country: ${cust.countryOfRegistration}` : null,
    ].filter(Boolean);

    const root = makeNode("GLOBAL_CUSTOMER", cust, (cust.tradingName || cust.officialName || s.scenarioName || "Customer"), gcLines);

    addAddressChildren(root, cust.addresses);
    addContactChildren(root, cust.contactPersons);

    // Country customers (related) as children if present
    related.forEach(rc => {
        const ccLines = [
            rc.mdmCustomerId ? `mdmCustomerId: ${rc.mdmCustomerId}` : null,
            rc.countryOfRegistration ? `country: ${rc.countryOfRegistration}` : null,
            rc.customerLevel ? `level: ${rc.customerLevel}` : null,
        ].filter(Boolean);
        const cc = makeNode("COUNTRY_CUSTOMER", rc, (rc.tradingName || rc.officialName || rc.mdmCustomerId), ccLines);
        addAddressChildren(cc, rc.addresses);
        addContactChildren(cc, rc.contactPersons);

        // Attach accounts for this country customer if mdmCustomerId matches
        const accNodes = buildAccountTree(accounts, rc.mdmCustomerId);
        accNodes.forEach(n => cc.children.push(n));
        root.children.push(cc);
    });

    // Also attach any root accounts tied directly to global cust (common in earlier datasets)
    const directAcc = buildAccountTree(accounts, cust.mdmCustomerId);
    directAcc.forEach(n => root.children.push(n));

    return root;
}

/* ---------- D3 rendering ---------- */
let svg, g, zoom;
const L = { nodeW: 320, nodeH: 160, headerH: 34, gapX: 70, gapY: 28 };

function initViz() {
    if (!UI.viz) return;

    UI.viz.innerHTML = "";
    const { width, height } = UI.viz.getBoundingClientRect();

    svg = d3.select(UI.viz).append("svg")
        .attr("width", width)
        .attr("height", height);

    g = svg.append("g");

    zoom = d3.zoom()
        .scaleExtent([0.2, 2.5])
        .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);

    // Resize handling
    window.addEventListener("resize", () => {
        if (!UI.viz) return;
        const r = UI.viz.getBoundingClientRect();
        svg.attr("width", r.width).attr("height", r.height);
        if (lastRootHierarchy) zoomToFit();
    });
}

function diagonal(s, t) {
    // Orthogonal elbow
    const mx = (s.x + t.x) / 2;
    return `M ${s.x} ${s.y}
          C ${mx} ${s.y}, ${mx} ${t.y}, ${t.x} ${t.y}`;
}

function applyCollapseState(root) {
    root.each(d => {
        const id = d.data?._id;
        if (collapsedNodeIds.has(id) && d.children) {
            d._children = d.children;
            d.children = null;
        }
        if (!collapsedNodeIds.has(id) && d._children) {
            d.children = d._children;
            d._children = null;
        }
    });
}

function render(rootData) {
    if (!svg || !g) return;

    g.selectAll("*").remove();

    const root = d3.hierarchy(rootData, d => d.children);
    lastRootHierarchy = root;

    applyCollapseState(root);

    // Tree layout (vertical)
    const tree = d3.tree().nodeSize([L.nodeW + L.gapX, L.nodeH + L.gapY]);
    tree(root);

    // LINKS
    const links = root.links();
    g.selectAll("path.link")
        .data(links)
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d => diagonal({ x: d.source.x, y: d.source.y }, { x: d.target.x, y: d.target.y }));

    // NODES
    const nodes = root.descendants();

    const node = g.selectAll("g.node")
        .data(nodes, d => d.data._id)
        .enter()
        .append("g")
        .attr("class", d => "node" + (shouldDim(d) ? " node-dim" : ""))
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            event.stopPropagation();
            toggleNode(d);
            selectNode(d);
        })
        .on("mouseenter", (event, d) => showHoverJson(event, d))
        .on("mouseleave", hideHoverJson);

    // Card group
    const card = node.append("g").attr("class", "node-card");

    // Background rect
    card.append("rect")
        .attr("class", "node-rect")
        .attr("x", -L.nodeW / 2)
        .attr("y", -L.headerH / 2)
        .attr("width", L.nodeW)
        .attr("height", L.nodeH)
        .attr("fill", d => getSemanticColors(semanticKeyForType(d.data.type)).body);

    // Header band
    card.append("rect")
        .attr("x", -L.nodeW / 2)
        .attr("y", -L.headerH / 2)
        .attr("width", L.nodeW)
        .attr("height", L.headerH)
        .attr("fill", d => getSemanticColors(semanticKeyForType(d.data.type)).header)
        .attr("opacity", 0.98);

    // Header text (icon + label)
    card.append("text")
        .attr("class", "node-header")
        .attr("x", -L.nodeW / 2 + 12)
        .attr("y", 6)
        .attr("fill", d => getSemanticColors(semanticKeyForType(d.data.type)).accent)
        .text(d => `${iconForNode(d)}  ${d.data.label}`);

    // Lines
    card.selectAll("text.node-line")
        .data(d => (d.data.lines || []).slice(0, 6))
        .enter()
        .append("text")
        .attr("class", "node-line")
        .attr("x", -L.nodeW / 2 + 12)
        .attr("y", (d, i) => 30 + i * 18)
        .text(t => t);

    zoomToFit();
}

function shouldDim(d) {
    // if some scenario-level filters applied, dim nodes that are irrelevant? keep simple:
    return false;
}

function toggleNode(d) {
    const id = d.data?._id;
    if (!id) return;
    if (collapsedNodeIds.has(id)) collapsedNodeIds.delete(id);
    else collapsedNodeIds.add(id);
    // re-render from last scenario rootData
    if (activeScenario) {
        const rootData = buildHierarchyForScenario(activeScenario);
        render(rootData);
    }
}

function zoomToFit() {
    if (!svg || !g || !lastRootHierarchy) return;

    const bounds = g.node().getBBox();
    const parent = svg.node().getBoundingClientRect();
    const fullWidth = parent.width;
    const fullHeight = parent.height;

    const padding = 40;
    const width = bounds.width + padding;
    const height = bounds.height + padding;

    const midX = bounds.x + bounds.width / 2;
    const midY = bounds.y + bounds.height / 2;

    const scale = 0.9 / Math.max(width / fullWidth, height / fullHeight);
    const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

    svg.transition().duration(250).call(
        zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
}

/* ---------- Hover JSON tooltip ---------- */
let hoverDiv = null;
function showHoverJson(event, d) {
    if (!hoverDiv) {
        hoverDiv = document.createElement("div");
        hoverDiv.style.position = "fixed";
        hoverDiv.style.zIndex = "9999";
        hoverDiv.style.maxWidth = "520px";
        hoverDiv.style.maxHeight = "260px";
        hoverDiv.style.overflow = "auto";
        hoverDiv.style.background = "rgba(11,11,11,.92)";
        hoverDiv.style.color = "#f0f0f0";
        hoverDiv.style.border = "1px solid rgba(255,255,255,.12)";
        hoverDiv.style.borderRadius = "12px";
        hoverDiv.style.padding = "10px";
        hoverDiv.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace";
        hoverDiv.style.fontSize = "12px";
        hoverDiv.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";
        document.body.appendChild(hoverDiv);
    }
    const obj = d.data?.data || {};
    hoverDiv.textContent = JSON.stringify(obj, null, 2);
    hoverDiv.style.display = "block";
    hoverDiv.style.left = Math.min(event.clientX + 14, window.innerWidth - 540) + "px";
    hoverDiv.style.top = Math.min(event.clientY + 14, window.innerHeight - 280) + "px";
}
function hideHoverJson() {
    if (hoverDiv) hoverDiv.style.display = "none";
}

/* ---------- Inspector rendering ---------- */
function pickId(obj) {
    return obj?.mdmCustomerId || obj?.mdmAccountId || obj?.contractId || obj?.billingProfileId || obj?.addressId || obj?.contactPersonId || obj?.platformId || "—";
}
function pickName(d) {
    const o = d.data?.data || {};
    return o.officialName || o.tradingName || o.contractName || o.billingProfileId || o.addressId || o.contactPersonId || o.name || d.data?.label || "—";
}
function pickCountry(d) {
    const o = d.data?.data || {};
    return o.countryOfRegistration || o.country || "—";
}

function selectNode(d) {
    const type = d.data.type;
    const obj = d.data.data || {};

    // pills
    const custType = obj.customerType || (type === "GLOBAL_CUSTOMER" ? activeScenario?.customer?.customerType : "—") || "—";
    const industry = obj.industrySector || (type === "GLOBAL_CUSTOMER" ? activeScenario?.customer?.industrySector : "—") || "—";
    const channel = obj.salesChannel || "—";

    if (UI.selType) UI.selType.textContent = type;
    if (UI.selId) UI.selId.textContent = pickId(obj);
    if (UI.selName) UI.selName.textContent = pickName(d);
    if (UI.selCountry) UI.selCountry.textContent = pickCountry(d);

    if (UI.selCustomerType) UI.selCustomerType.textContent = custType;
    if (UI.selIndustry) UI.selIndustry.textContent = industry;
    if (UI.selChannel) UI.selChannel.textContent = channel;

    // business meaning
    const ctDef = CUSTOMER_TYPE_DEF[custType] || null;
    const chDef = SALES_CHANNEL_DEF[channel] || null;

    if (UI.meaningCustomerType) UI.meaningCustomerType.textContent = ctDef ? ctDef.title : (custType !== "—" ? custType : "—");
    if (UI.meaningSalesChannel) UI.meaningSalesChannel.textContent = chDef ? chDef.title : (channel !== "—" ? channel : "—");

    if (UI.meaningBody) {
        const parts = [];
        if (ctDef) parts.push(ctDef.body);
        if (chDef) parts.push(chDef.body);
        UI.meaningBody.textContent = parts.length ? parts.join(" ") : "No definition available for this selection.";
    }

    // readable json + raw json
    if (UI.rawJson) UI.rawJson.textContent = JSON.stringify(obj, null, 2);
    if (UI.readableJson) UI.readableJson.innerHTML = renderReadable(obj);
}

function renderReadable(obj) {
    if (!obj || typeof obj !== "object") return "<div class='hint'>No object selected.</div>";

    const sections = [];

    const addSection = (title, entries) => {
        const cleaned = entries.filter(e => e && e.value !== undefined && e.value !== null && String(e.value).length);
        if (!cleaned.length) return;
        sections.push(`
      <div class="rj-section">
        <div class="rj-title">${escapeHtml(title)}</div>
        <div class="rj-grid">
          ${cleaned.map(e => `
            <div class="rj-item">
              <div class="rj-key">${escapeHtml(e.key)}</div>
              <div class="rj-val ${e.mono ? "mono" : ""}">${escapeHtml(e.value)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `);
    };

    // Basic
    addSection("Basics", [
        { key: "ID", value: pickId(obj), mono: true },
        { key: "Name", value: obj.officialName || obj.tradingName || obj.contractName || obj.name || "" },
        { key: "Type", value: obj.customerType || obj.salesChannel || obj.addressType || obj.contactType || obj.platformType || "" },
        { key: "Country", value: obj.countryOfRegistration || obj.country || "" },
    ]);

    // Commercial / finance
    addSection("Commercial & Finance", [
        { key: "businessRoles", value: Array.isArray(obj.businessRoles) ? obj.businessRoles.join(", ") : "", mono: true },
        { key: "accountStatus", value: obj.accountStatus || "" },
        { key: "currency", value: obj.currency || obj.billingCurrency || "" },
        { key: "paymentTerms", value: obj.paymentTerms || "" },
        { key: "creditLimit", value: obj.creditLimit !== undefined ? String(obj.creditLimit) : "", mono: true },
        { key: "salesChannel", value: obj.salesChannel || "" },
        { key: "salesManager", value: obj.salesManager || "" },
        { key: "segmentGroup", value: obj.segmentGroup || "" },
        { key: "segmentGroup2", value: obj.segmentGroup2 || "" },
    ]);

    // Contract detail / billing
    if (obj.contractDetail && typeof obj.contractDetail === "object") {
        const cd = obj.contractDetail;
        addSection("Contract detail", Object.keys(cd).slice(0, 20).map(k => ({ key: k, value: Array.isArray(cd[k]) ? cd[k].join(", ") : String(cd[k]) })));
    }
    if (obj.paymentMethod && typeof obj.paymentMethod === "object") {
        const pm = obj.paymentMethod;
        addSection("Payment method", [
            { key: "type", value: pm.type || "" },
            { key: "bankName", value: pm.bankName || "" },
            { key: "iban", value: pm.iban || "", mono: true },
            { key: "bic", value: pm.bic || "", mono: true },
        ]);
    }

    // Contact channels (if contact)
    if (Array.isArray(obj.communicationChannels)) {
        const ch = obj.communicationChannels.map(x => `${x.type}: ${x.value}`).join(" · ");
        addSection("Communication", [{ key: "channels", value: ch }]);
    }

    // Reference IDs
    if (Array.isArray(obj.referenceIds)) {
        const refs = obj.referenceIds.map(r => `${r.refType}: ${r.refValue} (${r.issuedByAuthority || ""})`).join("\n");
        addSection("Reference IDs", [{ key: "referenceIds", value: refs, mono: true }]);
    }

    // Platform object (if nested)
    if (obj.platformObject && typeof obj.platformObject === "object") {
        const p = obj.platformObject;
        addSection("Platform", [
            { key: "platformId", value: p.platformId || "", mono: true },
            { key: "name", value: p.name || "" },
            { key: "type", value: p.type || "" },
            { key: "provider", value: p.provider || "" },
        ]);
    }

    return sections.join("") || "<div class='hint'>No readable fields found.</div>";
}

/* ---------- Legend (footer) ---------- */
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
        const off = hiddenTypes.has(it.type) ? "off" : "";
        return `
      <div class="legend-item ${off}" data-type="${it.type}" title="${it.label}">
        <span class="legend-swatch" style="background:${c.header}"></span>
        <span class="legend-icon">${icon}</span>
        <span class="legend-text">${it.label}</span>
      </div>
    `;
    }).join("");
}

/* ---------- DQ ---------- */
function renderDQ() {
    if (!UI.dqDot || !UI.dqText) return;

    const domains = refEnums?.domains || {};
    const knownCustomerTypes = new Set(domains.customerType || []);
    const knownIndustries = new Set(domains.industrySector || []);
    const knownChannels = new Set(domains.salesChannel || []);

    let total = 0, ok = 0;

    scenarios.forEach(s => {
        const cust = s.customer || {};
        if (cust.customerType) { total++; if (knownCustomerTypes.has(cust.customerType)) ok++; }
        if (cust.industrySector) { total++; if (knownIndustries.has(cust.industrySector)) ok++; }
        asArray(s.accounts).forEach(a => {
            if (a.salesChannel) { total++; if (knownChannels.has(a.salesChannel)) ok++; }
        });
    });

    const pct = total ? Math.round((ok / total) * 100) : 0;
    UI.dqText.textContent = `DQ: ${pct}%`;
    UI.dqDot.style.background = pct >= 90 ? "#14a44d" : (pct >= 70 ? "#f5c542" : "#e03d2d");
}

/* ---------- Scenario render ---------- */
function renderActiveScenario() {
    if (!activeScenario) {
        if (UI.rawJson) UI.rawJson.textContent = "No scenario selected.";
        return;
    }
    const rootData = buildHierarchyForScenario(activeScenario);
    render(rootData);

    // Select root by default
    const rootObj = rootData.data;
    if (UI.rawJson) UI.rawJson.textContent = JSON.stringify(rootObj, null, 2);
    if (UI.readableJson) UI.readableJson.innerHTML = renderReadable(rootObj);
    if (UI.selType) UI.selType.textContent = rootData.type;
    if (UI.selId) UI.selId.textContent = pickId(rootObj);
    if (UI.selName) UI.selName.textContent = rootData.label;
    if (UI.selCountry) UI.selCountry.textContent = rootObj.countryOfRegistration || "—";
    if (UI.selCustomerType) UI.selCustomerType.textContent = rootObj.customerType || "—";
    if (UI.selIndustry) UI.selIndustry.textContent = rootObj.industrySector || "—";
    if (UI.selChannel) UI.selChannel.textContent = "—";
    if (UI.meaningCustomerType) UI.meaningCustomerType.textContent = (CUSTOMER_TYPE_DEF[rootObj.customerType]?.title) || (rootObj.customerType || "—");
    if (UI.meaningSalesChannel) UI.meaningSalesChannel.textContent = "—";
    if (UI.meaningBody) UI.meaningBody.textContent = (CUSTOMER_TYPE_DEF[rootObj.customerType]?.body) || "Select a node to see definitions.";
}

/* ---------- Wire UI ---------- */
function wireUI() {
    safeOn(UI.selector, "change", () => {
        const v = UI.selector.value;
        if (!v) {
            activeScenarioIndex = -1;
            activeScenario = null;
            if (UI.rawJson) UI.rawJson.textContent = "No scenario selected.";
            return;
        }
        activeScenarioIndex = Number(v);
        activeScenario = scenarios[activeScenarioIndex];
        renderActiveScenario();
    });

    // Filters update dropdown list + keep current scenario if possible
    [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel].forEach(sel => {
        safeOn(sel, "change", () => {
            populateScenarioDropdown();
            if (activeScenarioIndex >= 0 && activeScenario) renderActiveScenario();
        });
    });

    safeOn(UI.clearFilters, "click", () => {
        if (UI.fCustomerType) UI.fCustomerType.value = "";
        if (UI.fIndustry) UI.fIndustry.value = "";
        if (UI.fSalesChannel) UI.fSalesChannel.value = "";
        populateScenarioDropdown();
        if (activeScenarioIndex >= 0 && activeScenario) renderActiveScenario();
    });

    // Search (simple: if query matches, show raw json of scenario)
    safeOn(UI.search, "input", () => {
        const q = (UI.search.value || "").trim().toLowerCase();
        if (!q) return;
        const hay = JSON.stringify(activeScenario || {}).toLowerCase();
        if (hay.includes(q) && UI.rawJson) {
            UI.rawJson.textContent = JSON.stringify(activeScenario, null, 2);
        }
    });

    safeOn(UI.reset, "click", zoomToFit);

    safeOn(UI.toggleInspector, "click", () => {
        if (!UI.inspector) return;
        UI.inspector.classList.toggle("collapsed");
    });

    safeOn(UI.btnCollapseAll, "click", () => {
        if (!lastRootHierarchy) return;
        lastRootHierarchy.descendants().forEach(d => collapsedNodeIds.add(d.data?._id));
        if (activeScenario) render(buildHierarchyForScenario(activeScenario));
    });

    safeOn(UI.btnExpandAll, "click", () => {
        collapsedNodeIds.clear();
        if (activeScenario) render(buildHierarchyForScenario(activeScenario));
    });

    // Legend hide/show
    safeOn(UI.legend, "click", (e) => {
        const item = e.target.closest(".legend-item");
        if (!item) return;
        const t = item.getAttribute("data-type");
        if (!t) return;
        if (hiddenTypes.has(t)) hiddenTypes.delete(t);
        else hiddenTypes.add(t);

        renderLegend();
        if (activeScenario) render(buildHierarchyForScenario(activeScenario));
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

        discoverEnums(scenarios);
        populateScenarioDropdown();
        renderDQ();
        renderLegend();

        // pick first visible scenario
        if (scenarios.length) {
            const first = Array.from(UI.selector.options).find(o => o.value !== "");
            if (first) {
                activeScenarioIndex = Number(first.value);
                activeScenario = scenarios[activeScenarioIndex];
                UI.selector.value = String(activeScenarioIndex);
                renderActiveScenario();
            } else {
                if (UI.rawJson) UI.rawJson.textContent = "No scenarios match selected filters.";
            }
        } else {
            if (UI.rawJson) UI.rawJson.textContent = `No scenarios found in ${PATHS.customers}`;
        }
    } catch (err) {
        console.error(err);
        if (UI.rawJson) {
            UI.rawJson.textContent =
                `DATA LOAD ERROR\n\n${err.message}\n\nExpected:\n- ${PATHS.customers}\n- ${PATHS.reference}\n- ${PATHS.colors}\n\nTip: Use Live Server / http server (avoid file://).`;
        }
    }
})();
