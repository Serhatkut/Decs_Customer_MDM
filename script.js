/* DHL eCommerce - Customer Master Data Viewer
   - Loads /data/customerData.json
   - Renders interactive hierarchy using D3 tree layout
   - Click node -> shows JSON
   - Search -> highlights nodes
*/

const DATA_URL = "data/customerData.json";

const UI = {
    selector: document.getElementById("scenarioSelector"),
    search: document.getElementById("nodeSearch"),
    json: document.getElementById("json-display"),
    reset: document.getElementById("resetZoom"),
    viz: document.getElementById("viz-container"),
};

const THEME = {
    dhlRed: "#D40511",
    dhlYellow: "#FFCC00",
    ink: "#111",
    paper: "#FFFFFF",
    soft: "#FFF6CC",
    grid: "#ECECEC",
    global: "#111111",      // dark header
    account: "#D40511",     // DHL red header
    contract: "#7A0008",    // darker red for contracts/billing
    contact: "#111111",     // dark
    address: "#6B6B6B"      // grey
};

// Node geometry
const NODE_W = 320;
const NODE_H = 170;
const HEADER_H = 34;

// D3 globals
let svg, g, zoom;
let scenarios = [];
let selectedScenario = null;
let selectedNodeDatum = null;

// ---------- Helpers (safe access / normalization) ----------
function asArray(x) {
    return Array.isArray(x) ? x : [];
}

function safeString(x) {
    if (x === null || x === undefined) return "";
    return String(x);
}

function normalizeScenarioShape(s) {
    // Supports BOTH shapes:
    // A) { scenarioName, customer:{...}, accounts:[...], relatedCustomers:[...] }
    // B) legacy: { scenarioName, customerType..., accounts:[...], children:[...] } (older file)
    if (s.customer) return s;

    // Build scenario.customer from legacy fields (if needed)
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
        scenarioName: s.scenarioName,
        customer: legacyCustomer,
        accounts: asArray(s.accounts),
        relatedCustomers: asArray(s.relatedCustomers).length ? asArray(s.relatedCustomers) : asArray(s.children),
    };
}

// Key line picker per type
function pickKeyLines(type, data) {
    const lines = [];

    const push = (k, v) => {
        const val = safeString(v);
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
        push("countryOfRegistration", data.countryOfRegistration);
    }

    if (type.startsWith("ACCOUNT")) {
        push("mdmAccountId", data.mdmAccountId);
        push("roles", asArray(data.businessRoles).join(", "));
        push("salesChannel", data.salesChannel);
        push("salesManager", data.salesManager);
        if (data.platformObject) push("platformId", data.platformObject.platformId || data.platformObject.name);
        push("paymentTerms", data.paymentTerms);
        push("currency", data.currency);
    }

    if (type === "CONTRACT") {
        push("contractId", data.contractId);
        push("startDate", data.startDate);
        const cd = data.contractDetail || {};
        push("contractType", cd.contractType);
        push("billingModel", cd.billingModel);
        push("billingFrequency", cd.billingFrequency);
        if (Array.isArray(cd.services)) push("services", cd.services.join(", "));
    }

    if (type === "BILLING_PROFILE") {
        push("billingProfileId", data.billingProfileId);
        push("billingAccountNumber", data.billingAccountNumber);
        push("billingCurrency", data.billingCurrency);
        push("invoiceDelivery", data.invoiceDelivery);
        if (data.paymentMethod) {
            push("payMethod", data.paymentMethod.type);
            push("iban", data.paymentMethod.iban);
        }
    }

    if (type.startsWith("ADDRESS")) {
        push("addressId", data.addressId);
        push("addressType", data.addressType);
        push("city", data.city);
        push("country", data.country);
        push("postalcode", data.postalcode);
    }

    if (type === "CONTACT") {
        push("contactPersonId", data.contactPersonId);
        push("jobTitle", data.jobTitle);
        const ch = asArray(data.communicationChannels);
        const email = ch.find(c => c.type === "EMAIL");
        const phone = ch.find(c => c.type === "PHONE");
        push("email", email?.value);
        push("phone", phone?.value);
    }

    if (type === "COMM") {
        push("type", data.type);
        push("value", data.value);
    }

    if (type === "REFERENCE_ID") {
        push("refType", data.refType);
        push("refValue", data.refValue);
        push("issuedBy", data.issuedByAuthority);
    }

    if (type === "PLATFORM") {
        push("platformId", data.platformId);
        push("name", data.name);
        push("type", data.type);
        push("provider", data.provider);
    }

    return lines.slice(0, 6);
}

function iconFor(type, data) {
    // You asked: different icons for pickup address and other addresses + icons for customer/account/contract/contact
    if (type === "GLOBAL_CUSTOMER") return "🌐";
    if (type === "COUNTRY_CUSTOMER") return "🏢";

    if (type === "ACCOUNT_SOLDTO") return "🧾";
    if (type === "ACCOUNT_SUB") {
        // If PICKUP role -> warehouse icon; else generic
        const roles = asArray(data?.businessRoles);
        if (roles.includes("PICKUP")) return "🏬";
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
        return "🏷️";
    }

    return "•";
}

function headerColorFor(type) {
    if (type === "GLOBAL_CUSTOMER" || type === "COUNTRY_CUSTOMER") return THEME.global;
    if (type.startsWith("ACCOUNT")) return THEME.account;
    if (type === "CONTRACT" || type === "BILLING_PROFILE") return THEME.contract;
    if (type === "CONTACT" || type === "COMM") return THEME.contact;
    if (type.startsWith("ADDRESS")) return THEME.address;
    if (type === "REFERENCE_ID" || type === "PLATFORM") return THEME.contract;
    return THEME.global;
}

function displayNameFor(type, obj) {
    if (!obj) return "(unknown)";
    if (type === "GLOBAL_CUSTOMER" || type === "COUNTRY_CUSTOMER") {
        return obj.tradingName || obj.officialName || obj.mdmCustomerId;
    }
    if (type.startsWith("ACCOUNT")) {
        return obj.mdmAccountId || "(account)";
    }
    if (type === "CONTRACT") return obj.contractName || obj.contractId;
    if (type === "BILLING_PROFILE") return obj.billingProfileId || "Billing Profile";
    if (type.startsWith("ADDRESS")) return `${obj.city || ""}${obj.country ? ", " + obj.country : ""}`.trim() || obj.addressId;
    if (type === "CONTACT") return `${obj.firstName || ""} ${obj.lastName || ""}`.trim() || obj.contactPersonId;
    if (type === "COMM") return obj.value || "(channel)";
    if (type === "REFERENCE_ID") return obj.refType || "Reference";
    if (type === "PLATFORM") return obj.platformId || obj.name || "Platform";
    return obj.mdmCustomerId || obj.mdmAccountId || "(node)";
}

// Attach addresses + contacts + referenceIds + platform (optional) as children nodes
function enrichWithCommonChildren(node, obj) {
    const children = asArray(node.children);

    // Platform (if present)
    if (obj?.platformObject) {
        children.push({
            type: "PLATFORM",
            data: obj.platformObject,
            children: []
        });
    }

    // Reference IDs
    asArray(obj?.referenceIds).forEach(r => {
        children.push({
            type: "REFERENCE_ID",
            data: r,
            children: []
        });
    });

    // Contacts -> comm channels
    asArray(obj?.contactPersons).forEach(cp => {
        const commKids = asArray(cp.communicationChannels).map(cc => ({
            type: "COMM",
            data: cc,
            children: []
        }));
        children.push({
            type: "CONTACT",
            data: cp,
            children: commKids
        });
    });

    // Addresses -> tag address type in node type for icon differentiation
    asArray(obj?.addresses).forEach(a => {
        const at = safeString(a.addressType).toUpperCase();
        let t = "ADDRESS_OTHER";
        if (at.includes("PICKUP")) t = "ADDRESS_PICKUP";
        else if (at.includes("BILLING")) t = "ADDRESS_BILLING";
        else if (at.includes("RESIDENTIAL")) t = "ADDRESS_RESIDENTIAL";
        else t = "ADDRESS_BUSINESS";

        children.push({
            type: t,
            data: a,
            children: []
        });
    });

    node.children = children;
    return node;
}

// Build account tree from flat accounts using parentAccountId
function buildAccountTree(accounts) {
    const byId = new Map();
    const roots = [];

    accounts.forEach(acc => {
        byId.set(acc.mdmAccountId, {
            type: asArray(acc.businessRoles).includes("SOLDTO") ? "ACCOUNT_SOLDTO" : "ACCOUNT_SUB",
            data: acc,
            children: []
        });
    });

    // Link children
    byId.forEach((node, id) => {
        const parentId = node.data.parentAccountId;
        if (parentId && byId.has(parentId)) {
            byId.get(parentId).children.push(node);
        } else {
            roots.push(node);
        }
    });

    // Attach contract under each account node
    byId.forEach(node => {
        const contracts = asArray(node.data.contracts);
        contracts.forEach(c => {
            const contractNode = enrichWithCommonChildren({
                type: "CONTRACT",
                data: c,
                children: []
            }, c);

            // Billing profile nested under contract
            if (c.billingProfile) {
                const billingNode = enrichWithCommonChildren({
                    type: "BILLING_PROFILE",
                    data: c.billingProfile,
                    children: []
                }, c.billingProfile);

                contractNode.children.push(billingNode);
            }

            node.children.push(contractNode);
        });

        // Add common children for accounts themselves (addresses/contacts/reference/platform)
        enrichWithCommonChildren(node, node.data);
    });

    return roots;
}

function buildHierarchy(scenario) {
    const s = normalizeScenarioShape(scenario);

    // Root = Global customer
    let root = {
        type: "GLOBAL_CUSTOMER",
        data: s.customer,
        children: []
    };
    root = enrichWithCommonChildren(root, s.customer);

    // Country customers (optional)
    const countryCustomers = asArray(s.relatedCustomers);
    countryCustomers.forEach(cc => {
        let ccNode = {
            type: "COUNTRY_CUSTOMER",
            data: cc,
            children: []
        };
        ccNode = enrichWithCommonChildren(ccNode, cc);
        root.children.push(ccNode);
    });

    // Accounts under root (full account tree)
    const accounts = asArray(s.accounts);
    const accountRoots = buildAccountTree(accounts);

    // Attach account roots under: if country customers exist, attach Sold-To roots to best match by mdmCustomerId; else attach to root
    if (countryCustomers.length > 0) {
        const countryByCustomerId = new Map(countryCustomers.map(c => [c.mdmCustomerId, c]));
        const countryNodeById = new Map();
        root.children.forEach(n => {
            if (n.type === "COUNTRY_CUSTOMER") countryNodeById.set(n.data.mdmCustomerId, n);
        });

        accountRoots.forEach(ar => {
            const custId = ar.data.mdmCustomerId;
            if (countryByCustomerId.has(custId) && countryNodeById.has(custId)) {
                countryNodeById.get(custId).children.push(ar);
            } else {
                root.children.push(ar);
            }
        });
    } else {
        accountRoots.forEach(ar => root.children.push(ar));
    }

    // Decorate node names for D3
    function decorate(node) {
        node.name = displayNameFor(node.type, node.data);
        node.icon = iconFor(node.type, node.data);
        node.keyLines = pickKeyLines(node.type, node.data);
        node.headerColor = headerColorFor(node.type);
        node.children = asArray(node.children).map(decorate);
        return node;
    }

    return decorate(root);
}

// ---------- Render ----------
function initViz() {
    UI.viz.innerHTML = "";

    const w = UI.viz.clientWidth || 1200;
    const h = UI.viz.clientHeight || 800;

    svg = d3.select("#viz-container")
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%");

    g = svg.append("g");

    zoom = d3.zoom()
        .scaleExtent([0.2, 2.5])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
        });

    svg.call(zoom);
}

function renderScenario(scenario) {
    selectedScenario = scenario;
    selectedNodeDatum = null;
    UI.json.textContent = JSON.stringify(scenario, null, 2);

    g.selectAll("*").remove();

    const hierarchyData = buildHierarchy(scenario);
    const root = d3.hierarchy(hierarchyData);

    d3.tree().nodeSize([NODE_W + 70, NODE_H + 70])(root);

    // Center initial view
    const container = UI.viz;
    const tx = (container.clientWidth / 2) - (NODE_W / 2);
    const ty = 60;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(0.75));

    // Links
    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical()
            .x(d => d.x + NODE_W / 2)
            .y(d => d.y + NODE_H / 2)
        );

    // Nodes
    const node = g.selectAll(".node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", d => `node node-${d.data.type}`)
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .on("click", (event, d) => {
            event.stopPropagation();
            selectedNodeDatum = d;
            UI.json.textContent = JSON.stringify(d.data.data, null, 2);
            highlightSelected(d);
        });

    // Card
    node.append("rect")
        .attr("class", "card")
        .attr("width", NODE_W)
        .attr("height", NODE_H)
        .attr("rx", 14);

    // Header
    node.append("rect")
        .attr("class", "header")
        .attr("width", NODE_W)
        .attr("height", HEADER_H)
        .attr("rx", 14)
        .attr("fill", d => d.data.headerColor);

    // Icon
    node.append("text")
        .attr("class", "icon")
        .attr("x", 12)
        .attr("y", 23)
        .text(d => d.data.icon);

    // Title
    node.append("text")
        .attr("class", "title")
        .attr("x", 42)
        .attr("y", 22)
        .text(d => safeString(d.data.name).slice(0, 34));

    // Key lines
    node.each(function (d) {
        const el = d3.select(this);
        const lines = asArray(d.data.keyLines);

        let y = HEADER_H + 22;
        lines.forEach(([k, v]) => {
            el.append("text")
                .attr("class", "kv k")
                .attr("x", 14)
                .attr("y", y)
                .text(`${k}:`);

            el.append("text")
                .attr("class", "kv v")
                .attr("x", 120)
                .attr("y", y)
                .text(safeString(v).slice(0, 34));

            y += 18;
        });
    });

    // Make background click clear selection
    svg.on("click", () => {
        selectedNodeDatum = null;
        UI.json.textContent = JSON.stringify(selectedScenario, null, 2);
        clearSelection();
    });
}

function highlightSelected(d) {
    g.selectAll(".node").classed("selected", false);
    d3.select(d3.event?.currentTarget); // no-op (compat)
    g.selectAll(".node").filter(n => n === d).classed("selected", true);
}

function clearSelection() {
    g.selectAll(".node").classed("selected", false);
}

// ---------- Search ----------
function nodeTextIndex(d) {
    const data = d.data?.data || {};
    const type = d.data?.type || "";
    const name = safeString(d.data?.name);

    const fields = [
        name,
        type,
        data.mdmCustomerId,
        data.mdmAccountId,
        data.contractId,
        data.billingProfileId,
        data.platformId,
        data.addressId,
        data.contactPersonId,
        data.officialName,
        data.tradingName,
        data.contractName,
    ].map(safeString).filter(Boolean);

    return fields.join(" ").toLowerCase();
}

function applySearch(term) {
    const t = safeString(term).trim().toLowerCase();
    if (!t) {
        g.selectAll(".node").classed("dim", false).classed("match", false);
        return;
    }

    g.selectAll(".node").each(function (d) {
        const hay = nodeTextIndex(d);
        const isMatch = hay.includes(t);
        d3.select(this).classed("match", isMatch).classed("dim", !isMatch);
    });
}

// ---------- Boot ----------
async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
    const json = await res.json();
    return asArray(json);
}

function populateDropdown(data) {
    UI.selector.innerHTML = `<option value="">-- Choose Scenario --</option>`;
    data.forEach((s, idx) => {
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = s.scenarioName || `Scenario ${idx + 1}`;
        UI.selector.appendChild(opt);
    });
}

function wireUI() {
    UI.selector.addEventListener("change", (e) => {
        const idx = e.target.value;
        if (idx === "") return;
        const s = scenarios[Number(idx)];
        if (s) renderScenario(s);
    });

    UI.search.addEventListener("input", (e) => {
        applySearch(e.target.value);
    });

    UI.reset.addEventListener("click", () => {
        const container = UI.viz;
        const tx = (container.clientWidth / 2) - (NODE_W / 2);
        const ty = 60;
        svg.transition()
            .duration(500)
            .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(0.75));
    });
}

(async function main() {
    initViz();
    wireUI();

    try {
        scenarios = await loadData();
        populateDropdown(scenarios);

        // Auto-select first scenario (optional)
        if (scenarios.length > 0) {
            UI.selector.value = "0";
            renderScenario(scenarios[0]);
        }
    } catch (err) {
        UI.json.textContent = `ERROR: ${err.message}`;
        console.error(err);
    }
})();
