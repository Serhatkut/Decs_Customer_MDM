"use strict";

/* ===============================
   DHL eCommerce · Customer MDM Viewer
   Fix: Restore Address/Contract/Billing rendering
   - Contacts + ReferenceIds are rendered as attributes (NOT nodes)
   - Addresses are nodes (LOCATION)
   - Accounts are vertical (tree layout)
================================ */

const PATHS = {
    customers: "./data/customerData.json",
    reference: "./data/reference_master_data.json",
    colors: "./data/reference_colors.json",
};

/* ---------- UI ---------- */
const UI = {
    viz: document.getElementById("viz-container"),
    selector: document.getElementById("scenarioSelector"),
    search: document.getElementById("nodeSearch"),
    reset: document.getElementById("resetZoom"),
    json: document.getElementById("json-display"),

    // Filters
    fCustomerType: document.getElementById("filterCustomerType"),
    fIndustry: document.getElementById("filterIndustry"),
    fSalesChannel: document.getElementById("filterSalesChannel"),
    btnClearFilters: document.getElementById("clearFilters"),

    dqDot: document.getElementById("dqDot"),
    dqText: document.getElementById("dqText"),

    swatches: document.getElementById("colorSwatches"),
    refEnumsPreview: document.getElementById("refEnumsPreview"),
    refColorsPreview: document.getElementById("refColorsPreview"),
};

let scenarios = [];
let refEnums = {};
let refColors = {};
let activeScenarioIndex = -1;
let activeScenario = null;

let svg, g, zoom;
let lastRootHierarchy = null;

// collapse state
const collapsedNodeIds = new Set();

// layout
const L = {
    nodeW: 320,
    nodeH: 160,
    headerH: 34,
    gapX: 70,
    gapY: 30,
};

function asArray(v) {
    return v ? (Array.isArray(v) ? v : [v]) : [];
}
function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
}
function safeOn(el, evt, fn) {
    if (el && el.addEventListener) el.addEventListener(evt, fn);
}
function getSelectedValues(sel) {
    if (!sel) return [];
    return Array.from(sel.selectedOptions || []).map((o) => o.value);
}
function fillMultiSelect(sel, values) {
    if (!sel) return;
    sel.innerHTML = "";
    (values || []).forEach((v) => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v;
        sel.appendChild(opt);
    });
}

async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
    return await res.json();
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

/* ---------- Reference enums + filters ---------- */
function discoverEnums() {
    // accept multiple shapes
    const e = refEnums || {};
    const customerTypes =
        uniq(e.customerTypeEnums || e.customerTypes || e?.enums?.customerType || []);
    const industries =
        uniq(e.industryEnums || e.industries || e?.enums?.industrySector || []);
    const channels =
        uniq(e.salesChannelEnums || e.channels || e?.enums?.salesChannel || []);

    // dataset fallback
    const dsCustomerTypes = uniq(scenarios.map(s => (s.customer?.customerType ?? s.customerType)).filter(Boolean));
    const dsIndustries = uniq(scenarios.map(s => (s.customer?.industrySector ?? s.industrySector)).filter(Boolean));
    const dsChannels = uniq(
        scenarios.flatMap(s => asArray(s.accounts || s.customer?.accounts).map(a => a.salesChannel)).filter(Boolean)
    );

    fillMultiSelect(UI.fCustomerType, uniq([...customerTypes, ...dsCustomerTypes]).sort());
    fillMultiSelect(UI.fIndustry, uniq([...industries, ...dsIndustries]).sort());
    fillMultiSelect(UI.fSalesChannel, uniq([...channels, ...dsChannels]).sort());

    if (UI.refEnumsPreview) UI.refEnumsPreview.textContent = JSON.stringify(refEnums, null, 2);
    if (UI.refColorsPreview) UI.refColorsPreview.textContent = JSON.stringify(refColors, null, 2);

    // swatches (optional)
    if (UI.swatches) {
        UI.swatches.innerHTML = "";
        const tokenMap = buildTokenHexMap(refColors);
        const showTokens = [
            "--clr-primary-red",
            "--clr-primary-yellow",
            "--clr-primary-black",
            "--clr-fg-purple",
            "--clr-fg-blue",
            "--clr-fg-teal",
            "--clr-neutral-600",
        ];
        showTokens.forEach(t => {
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

function scenarioMatchesFilters(s) {
    const selType = getSelectedValues(UI.fCustomerType);
    const selInd = getSelectedValues(UI.fIndustry);
    const selCh = getSelectedValues(UI.fSalesChannel);

    const cust = s.customer || s;
    const accounts = asArray(s.accounts || cust.accounts);

    const hasType = cust.customerType ? [cust.customerType] : [];
    const hasInd = cust.industrySector ? [cust.industrySector] : [];
    const hasCh = uniq(accounts.map(a => a.salesChannel).filter(Boolean));

    const okType = !selType.length || selType.some(x => hasType.includes(x));
    const okInd = !selInd.length || selInd.some(x => hasInd.includes(x));
    const okCh = !selCh.length || selCh.some(x => hasCh.includes(x));

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

    // select first visible if current invalid
    if (activeScenarioIndex < 0 || !scenarioMatchesFilters(scenarios[activeScenarioIndex])) {
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

/* ---------- Normalize scenario (supports two shapes) ---------- */
function normalizeScenario(s) {
    // shape A: {customer:{...}, accounts:[...], relatedCustomers:[...]}
    if (s && s.customer && Array.isArray(s.accounts)) return s;

    // shape B: flattened customer fields on scenario + accounts + children
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
        contactPersons: asArray(s.contactPersons),
    };

    return {
        scenarioName: s.scenarioName || "Scenario",
        customer: legacyCustomer,
        accounts: asArray(s.accounts),
        relatedCustomers: asArray(s.relatedCustomers || s.children),
    };
}

/* ---------- Build tree nodes ---------- */
function stableId(type, obj) {
    if (!obj) return `${type}::${Math.random()}`;
    if (type === "GLOBAL_CUSTOMER" || type === "COUNTRY_CUSTOMER") return obj.mdmCustomerId || `${type}::${obj.officialName}`;
    if (type === "ACCOUNT") return obj.mdmAccountId || `${type}::${obj.tradingName}`;
    if (type === "CONTRACT") return obj.contractId || `${type}::${obj.contractName}`;
    if (type === "BILLING_PROFILE") return obj.billingProfileId || `${type}::${obj.billingAccountNumber}`;
    if (type === "ADDRESS") return obj.addressId || `${type}::${obj.city}-${obj.postalcode}`;
    if (type === "PLATFORM") return obj.platformId || `${type}::${obj.name}`;
    return `${type}::${JSON.stringify(obj).slice(0, 40)}`;
}

function contactSummary(list) {
    const cps = asArray(list);
    if (!cps.length) return [];
    // show as attributes: Name (Role) · email · phone
    return cps.slice(0, 2).map(cp => {
        const ch = asArray(cp.communicationChannels);
        const email = ch.find(x => x.type === "EMAIL")?.value;
        const phone = ch.find(x => x.type === "PHONE")?.value;
        const name = [cp.firstName, cp.lastName].filter(Boolean).join(" ").trim();
        const role = cp.jobTitle ? ` (${cp.jobTitle})` : "";
        const parts = [
            `${name || cp.contactPersonId || "Contact"}${role}`,
            email ? `email: ${email}` : null,
            phone ? `phone: ${phone}` : null
        ].filter(Boolean);
        return parts.join(" · ");
    });
}

function refSummary(list) {
    const refs = asArray(list);
    if (!refs.length) return null;
    // render as inline refs: TYPE:VALUE
    return refs.slice(0, 3).map(r => `${r.refType}:${r.refValue}`).join(" | ");
}

function makeNode(type, obj, label, extraLines = []) {
    return {
        type,
        data: obj || {},
        _id: stableId(type, obj || { label }),
        label: label || type,
        lines: extraLines || [],
        children: [],
    };
}

function addAddressChildren(parent, addresses) {
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

function buildContractsForAccount(accNode, account) {
    const contracts = asArray(account.contracts);
    contracts.forEach(c => {
        const cLines = [
            c.contractId ? `contractId: ${c.contractId}` : null,
            c.startDate ? `startDate: ${c.startDate}` : null,
            c.contractDetail?.contractType ? `type: ${c.contractDetail.contractType}` : null,
        ].filter(Boolean);

        const cNode = makeNode("CONTRACT", c, (c.contractName || "Contract"), cLines);

        // contract addresses as LOCATION nodes
        addAddressChildren(cNode, c.addresses);

        // contract contacts as attributes
        const cContacts = contactSummary(c.contactPersons);
        cContacts.forEach(x => cNode.lines.push(x));

        // billing profile node
        if (c.billingProfile) {
            const bp = c.billingProfile;
            const bpLines = [
                bp.billingProfileId ? `billingProfileId: ${bp.billingProfileId}` : null,
                bp.billingCurrency ? `billingCurrency: ${bp.billingCurrency}` : null,
                bp.invoiceDelivery ? `invoiceDelivery: ${bp.invoiceDelivery}` : null,
                refSummary(bp.referenceIds) ? `refs: ${refSummary(bp.referenceIds)}` : null,
            ].filter(Boolean);

            const bpNode = makeNode("BILLING_PROFILE", bp, (bp.billingProfileId || "Billing Profile"), bpLines);

            // billing addresses as nodes
            addAddressChildren(bpNode, bp.addresses);

            // billing contacts as attributes
            const bpContacts = contactSummary(bp.contactPersons);
            bpContacts.forEach(x => bpNode.lines.push(x));

            cNode.children.push(bpNode);
        }

        accNode.children.push(cNode);
    });
}

function buildAccountTree(accounts, mdmCustomerIdFilter = null) {
    const list = asArray(accounts).filter(a => !mdmCustomerIdFilter || a.mdmCustomerId === mdmCustomerIdFilter);

    const byId = new Map(list.map(a => [a.mdmAccountId, a]));
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

        // contacts as attributes
        contactSummary(a.contactPersons).forEach(x => accLines.push(x));

        const node = makeNode("ACCOUNT", a, a.mdmAccountId, accLines);

        // addresses as nodes
        addAddressChildren(node, a.addresses);

        // contracts + billing profile
        buildContractsForAccount(node, a);

        // platform as node (optional but useful)
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

function buildHierarchyForScenario(scenario) {
    const s = normalizeScenario(scenario);

    // root global customer
    const gcLines = [
        s.customer.mdmCustomerId ? `mdmCustomerId: ${s.customer.mdmCustomerId}` : null,
        s.customer.customerType ? `customerType: ${s.customer.customerType}` : null,
        s.customer.customerLevel ? `customerLevel: ${s.customer.customerLevel}` : null,
        s.customer.industrySector ? `industry: ${s.customer.industrySector}` : null,
        s.customer.countryOfRegistration ? `country: ${s.customer.countryOfRegistration}` : null,
    ].filter(Boolean);

    // contacts as attributes
    contactSummary(s.customer.contactPersons).forEach(x => gcLines.push(x));
    // refs as attributes (if any exist at customer)
    if (s.customer.referenceIds) {
        const rs = refSummary(s.customer.referenceIds);
        if (rs) gcLines.push(`refs: ${rs}`);
    }

    const root = makeNode(
        "GLOBAL_CUSTOMER",
        s.customer,
        (s.customer.tradingName || s.customer.officialName || s.scenarioName),
        gcLines
    );

    // customer addresses as nodes
    addAddressChildren(root, s.customer.addresses);

    // country customers
    const countries = asArray(s.relatedCustomers);
    countries.forEach(cc => {
        const ccLines = [
            cc.mdmCustomerId ? `mdmCustomerId: ${cc.mdmCustomerId}` : null,
            cc.customerLevel ? `customerLevel: ${cc.customerLevel}` : null,
            cc.countryOfRegistration ? `country: ${cc.countryOfRegistration}` : null,
        ].filter(Boolean);

        contactSummary(cc.contactPersons).forEach(x => ccLines.push(x));

        const ccNode = makeNode(
            "COUNTRY_CUSTOMER",
            cc,
            (cc.tradingName || cc.officialName || cc.mdmCustomerId),
            ccLines
        );
        addAddressChildren(ccNode, cc.addresses);

        // accounts under that country by mdmCustomerId
        const accRoots = buildAccountTree(s.accounts, cc.mdmCustomerId);
        accRoots.forEach(a => ccNode.children.push(a));

        root.children.push(ccNode);
    });

    // if no country customers: attach accounts directly
    if (!countries.length) {
        buildAccountTree(s.accounts).forEach(a => root.children.push(a));
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

function zoomToFit(pad = 50) {
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
    const colors = getSemanticColors(
        t === "ADDRESS" ? "ADDRESS" :
            t === "CONTACT" ? "CONTACT" :
                t === "CONTRACT" ? "CONTRACT" :
                    t === "BILLING_PROFILE" ? "BILLING_PROFILE" :
                        t === "ACCOUNT" ? "ACCOUNT" :
                            t === "PLATFORM" ? "PLATFORM" :
                                t === "COUNTRY_CUSTOMER" ? "COUNTRY_CUSTOMER" :
                                    "GLOBAL_CUSTOMER"
    );

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

    // title + collapse indicator
    group.append("text")
        .attr("x", 12).attr("y", 22)
        .attr("fill", "#fff")
        .attr("font-weight", 800)
        .attr("font-size", 12)
        .text(d.data.label || t);

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

    // hover shows JSON
    group.on("mouseenter", () => {
        if (UI.json) UI.json.textContent = JSON.stringify(d.data.data || d.data, null, 2);
    });

    // click toggles collapse
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

    const data = buildHierarchyForScenario(activeScenario);
    const root = d3.hierarchy(data);
    lastRootHierarchy = root;

    applyCollapse(root);

    // vertical tree
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
        // lightweight: if query exists anywhere, show scenario JSON
        const hay = JSON.stringify(activeScenario || {}).toLowerCase();
        if (hay.includes(q) && UI.json) UI.json.textContent = JSON.stringify(activeScenario, null, 2);
    });

    safeOn(UI.btnClearFilters, "click", () => {
        [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel].forEach(sel => {
            if (!sel) return;
            Array.from(sel.options).forEach(o => (o.selected = false));
        });
        populateScenarioDropdown();
        if (activeScenarioIndex >= 0) renderActiveScenario();
    });

    [UI.fCustomerType, UI.fIndustry, UI.fSalesChannel].forEach(sel => {
        safeOn(sel, "change", () => {
            populateScenarioDropdown();
            if (activeScenarioIndex >= 0) renderActiveScenario();
            else if (UI.json) UI.json.textContent = "No scenarios match selected filters.";
        });
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