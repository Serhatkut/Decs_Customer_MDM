/**
 * DHL eCommerce – Master Data Scenarios Explorer
 * Expects customerData.json to be a JSON array of 7 scenario root objects (as provided).
 */

let scenarios = [];
let currentScenario = null;
let currentRoot = null;

const nodeW = 260;
const nodeH = 160;

const colors = {
    CUSTOMER: "#FFCC00",      // DHL Yellow
    ACCOUNT: "#D40511",       // DHL Red
    FINANCIAL: "#003399",
    PERSONNEL: "#007D8A",
    LOCATION: "#666666",
    GROUP: "#111111"
};

const svg = d3.select("#viz-container").append("svg").attr("width", "100%").attr("height", "100%");
const g = svg.append("g");

const zoom = d3.zoom().scaleExtent([0.2, 2.5]).on("zoom", (e) => g.attr("transform", e.transform));
svg.call(zoom);

/* ---------- Helpers ---------- */

const safe = (v) => (v === null || v === undefined) ? "" : String(v);

function headerColor(type) {
    switch (type) {
        case "CUSTOMER": return colors.CUSTOMER;
        case "ACCOUNT": return colors.ACCOUNT;
        case "CONTRACT":
        case "REFERENCE_ID": return colors.FINANCIAL;
        case "CONTACT":
        case "COMM": return colors.PERSONNEL;
        case "ADDRESS": return colors.LOCATION;
        case "GROUP": return colors.GROUP;
        default: return "#444";
    }
}

function nodeTitle(d) {
    const data = d.data.data || {};
    if (d.data.type === "CUSTOMER") return safe(data.tradingName || data.officialName || data.mdmCustomerId);
    if (d.data.type === "ACCOUNT") return safe(data.mdmAccountId || "Account");
    if (d.data.type === "ADDRESS") return safe(`${data.city || ""} ${data.country || ""}`).trim() || "Address";
    if (d.data.type === "CONTACT") return safe(`${data.firstName || ""} ${data.lastName || ""}`).trim() || "Contact";
    if (d.data.type === "CONTRACT") return safe(data.contractName || data.contractId || "Contract");
    if (d.data.type === "REFERENCE_ID") return safe(data.refValue || "Reference");
    if (d.data.type === "GROUP") return safe(d.data.name || "Group");
    return safe(d.data.name || "Object");
}

function buildIndexByCustomerId(scenario) {
    const idx = new Map();
    // root customer
    idx.set(scenario.mdmCustomerId, scenario);
    // children legal entities
    if (Array.isArray(scenario.children)) {
        scenario.children.forEach(c => {
            if (c && c.mdmCustomerId) idx.set(c.mdmCustomerId, c);
        });
    }
    return idx;
}

/**
 * Normalizes incoming JSON so the renderer supports BOTH shapes:
 * A) Preferred: scenario is the CUSTOMER root object (7-scenario array)
 * B) Legacy:    { scenarioName, customer: { ...customerRoot } }
 *
 * Returns a CUSTOMER-root object with top-level fields expected by the UI.
 */
function normalizeScenario(s) {
    if (!s) return null;

    // If it already looks like a customer-root scenario (has mdmCustomerId + accounts or customerType)
    const looksLikeRoot = (typeof s === "object") && (
        "mdmCustomerId" in s || "accounts" in s || "customerType" in s || "customerLevel" in s
    );
    if (looksLikeRoot && !s.customer) return s;

    // Legacy shape: { scenarioName, customer: {...} }
    if (s.customer && typeof s.customer === "object") {
        const c = s.customer;
        return {
            // Keep scenario name at root for selector display
            scenarioName: s.scenarioName || c.scenarioName || c.tradingName || c.officialName,
            // Promote customer fields
            ...c,
            // Ensure mandatory fields exist on root (some legacy data only had these inside customer)
            customerType: c.customerType,
            customerLevel: c.customerLevel,
            mdmCustomerId: c.mdmCustomerId,
            accounts: Array.isArray(c.accounts) ? c.accounts : [],
            children: Array.isArray(c.children) ? c.children : []
        };
    }

    // Unexpected shape: best-effort return
    return s;
}

function toNode(name, type, data, children = []) {
    return { name, type, data, children };
}

/**
 * Build a hierarchy suitable for d3.hierarchy from the scenario JSON.
 * - Root: CUSTOMER (scenario legal entity)
 * - Under root: groups for Accounts + (optional) Child Legal Entities
 * - Under each Account: Address, Contacts (+ comm), Contracts, Reference IDs
 * - For "bridge" accounts (e.g., Vinted pickup): if mdmCustomerId points to a legal entity that exists in children, show it;
 *   otherwise show a placeholder linked legal entity node (mdmCustomerId only).
 */
function mapScenarioToHierarchy(scenario) {
    scenario = normalizeScenario(scenario);
    if (!scenario) return toNode("Invalid Scenario", "CUSTOMER", {}, []);
    const customerIndex = buildIndexByCustomerId(scenario);

    const rootChildren = [];

    // Accounts group
    if (Array.isArray(scenario.accounts) && scenario.accounts.length) {
        const accountsChildren = scenario.accounts.map(acc => {
            const accountChildren = [];

            // Addresses
            if (Array.isArray(acc.addresses)) {
                acc.addresses.forEach(a => {
                    accountChildren.push(toNode(`${safe(a.city)}, ${safe(a.country)}`.trim(), "ADDRESS", a));
                });
            }

            // Contacts + comm channels
            if (Array.isArray(acc.contactPersons)) {
                acc.contactPersons.forEach(cp => {
                    const commChildren = [];
                    const ch = Array.isArray(cp.communicationChannels) ? cp.communicationChannels : [];
                    ch.forEach(cc => commChildren.push(toNode(`${safe(cc.type)}: ${safe(cc.value)}`, "COMM", cc)));
                    accountChildren.push(toNode(`${safe(cp.firstName)} ${safe(cp.lastName)}`.trim(), "CONTACT", cp, commChildren));
                });
            }

            // Contracts
            if (Array.isArray(acc.contracts)) {
                acc.contracts.forEach(c => accountChildren.push(toNode(c.contractName || c.contractId, "CONTRACT", c)));
            }

            // Reference IDs
            if (Array.isArray(acc.referenceIds)) {
                acc.referenceIds.forEach(r => accountChildren.push(toNode(r.refValue || r.refType, "REFERENCE_ID", r)));
            }

            // Bridge: account -> linked legal entity (mdmCustomerId)
            if (acc.mdmCustomerId && acc.mdmCustomerId !== scenario.mdmCustomerId) {
                const linked = customerIndex.get(acc.mdmCustomerId);
                if (linked) {
                    accountChildren.push(toNode(linked.tradingName || linked.officialName || linked.mdmCustomerId, "CUSTOMER", linked));
                } else {
                    accountChildren.push(toNode(`Linked Legal Entity`, "CUSTOMER", {
                        mdmCustomerId: acc.mdmCustomerId,
                        officialName: null,
                        tradingName: null
                    }));
                }
            }

            const name = (acc.businessRoles && acc.businessRoles.length)
                ? `${safe(acc.mdmAccountId)}  (${acc.businessRoles.join(", ")})`
                : safe(acc.mdmAccountId);

            return toNode(name, "ACCOUNT", acc, accountChildren);
        });

        rootChildren.push(toNode("Accounts", "GROUP", { group: "ACCOUNTS" }, accountsChildren));
    }

    // Child legal entities group (for strategic hierarchy)
    if (Array.isArray(scenario.children) && scenario.children.length) {
        const legalChildren = scenario.children.map(le => toNode(le.tradingName || le.officialName || le.mdmCustomerId, "CUSTOMER", le));
        rootChildren.push(toNode("Legal Entity Hierarchy", "GROUP", { group: "LEGAL_ENTITIES" }, legalChildren));
    }

    // Root customer node
    return toNode(
        scenario.tradingName || scenario.officialName || scenario.scenarioName,
        "CUSTOMER",
        scenario,
        rootChildren
    );
}

/* ---------- Rendering ---------- */

function fitToCanvas() {
    const container = document.getElementById("viz-container");
    const w = container.clientWidth;
    svg.transition().duration(600).call(
        zoom.transform,
        d3.zoomIdentity.translate(Math.max(20, w / 2 - nodeW / 2), 40).scale(0.85)
    );
}

function renderScenario(scenario) {
    scenario = normalizeScenario(scenario);
    currentScenario = scenario;
    g.selectAll("*").remove();

    const rootData = mapScenarioToHierarchy(scenario);
    currentRoot = d3.hierarchy(rootData);

    d3.tree().nodeSize([nodeW + 60, nodeH + 90])(currentRoot);

    // Links
    g.selectAll(".link")
        .data(currentRoot.links())
        .enter()
        .append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical()
            .x(d => d.x + nodeW / 2)
            .y(d => d.y + nodeH / 2)
        );

    // Nodes
    const node = g.selectAll(".node")
        .data(currentRoot.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .on("click", (e, d) => {
            e.stopPropagation();
            showDetails(d);
            highlightSelection(d);
        });

    node.append("rect")
        .attr("width", nodeW)
        .attr("height", nodeH)
        .attr("rx", 10)
        .style("fill", "var(--card-body)")
        .style("stroke", "var(--dhl-red)")
        .style("stroke-width", 1.8);

    node.append("rect")
        .attr("width", nodeW)
        .attr("height", 34)
        .attr("rx", 10)
        .style("fill", d => headerColor(d.data.type))
        .style("stroke", "var(--dhl-red)")
        .style("stroke-width", 1.8);

    node.append("text")
        .attr("x", 12)
        .attr("y", 22)
        .style("fill", d => d.data.type === "CUSTOMER" ? "#000" : "#FFF")
        .style("font-weight", "700")
        .style("font-size", "11px")
        .text(d => {
            const t = nodeTitle(d);
            return t.length > 34 ? (t.substring(0, 34) + "…") : t;
        });

    // Body lines (compact)
    node.each(function (d) {
        const el = d3.select(this);
        const data = d.data.data || {};
        let y = 54;

        const addLine = (k, v) => {
            const vv = safe(v);
            if (!vv) return;
            if (y > nodeH - 12) return;

            el.append("text")
                .attr("x", 12)
                .attr("y", y)
                .style("font-size", "9px")
                .style("fill", "#222")
                .style("font-weight", "700")
                .text(`${k}:`);

            el.append("text")
                .attr("x", 12 + (k.length + 1) * 6)
                .attr("y", y)
                .style("font-size", "9px")
                .style("fill", "#444")
                .text(vv.length > 32 ? vv.substring(0, 32) + "…" : vv);

            y += 14;
        };

        if (d.data.type === "CUSTOMER") {
            addLine("customerType", data.customerType);
            addLine("customerLevel", data.customerLevel);
            addLine("mdmCustomerId", data.mdmCustomerId);
            addLine("globalGroupCode", data.globalGroupCode);
            addLine("country", data.countryOfRegistration);
        } else if (d.data.type === "ACCOUNT") {
            addLine("mdmAccountId", data.mdmAccountId);
            addLine("roles", (data.businessRoles || []).join(", "));
            addLine("status", data.accountStatus);
            addLine("paymentTerms", data.paymentTerms);
            addLine("currency", data.currency);
            addLine("salesManager", data.salesManager);
        } else if (d.data.type === "ADDRESS") {
            addLine("type", data.addressType);
            addLine("street", `${safe(data.street)} ${safe(data.houseNumber)}`.trim());
            addLine("city", data.city);
            addLine("postalcode", data.postalcode);
            addLine("country", data.country);
            addLine("timezone", data.timezone);
        } else if (d.data.type === "CONTACT") {
            addLine("jobTitle", data.jobTitle);
            addLine("contactType", data.contactType);
        } else if (d.data.type === "CONTRACT") {
            addLine("contractId", data.contractId);
            addLine("startDate", data.startDate);
        } else if (d.data.type === "REFERENCE_ID") {
            addLine("refType", data.refType);
            addLine("issuedBy", data.issuedByAuthority);
        } else if (d.data.type === "GROUP") {
            addLine("group", data.group);
            addLine("count", (d.children || []).length);
        }
    });

    // Default view
    fitToCanvas();

    // JSON (full scenario)
    document.getElementById("json-display").textContent = JSON.stringify(scenario, null, 2);

    // Clear selection details
    clearDetails();
    clearHighlights();
}

function clearHighlights() {
    g.selectAll(".node").classed("is-highlight", false).classed("is-dim", false).classed("is-selected", false);
    g.selectAll(".link").classed("is-dim", false);
}

function highlightSelection(d) {
    // Dim everything, highlight path to root + selected subtree
    g.selectAll(".node").classed("is-dim", true).classed("is-selected", false);
    g.selectAll(".link").classed("is-dim", true);

    const keep = new Set();

    // Path to root
    let p = d;
    while (p) { keep.add(p); p = p.parent; }

    // Subtree
    d.each(x => keep.add(x));

    g.selectAll(".node").each(function (n) {
        if (keep.has(n)) d3.select(this).classed("is-dim", false).classed("is-highlight", true);
    });

    d3.select(d3.event?.currentTarget);

    // Selected node
    g.selectAll(".node").filter(n => n === d).classed("is-selected", true);
}

function clearDetails() {
    document.getElementById("node-title").textContent = "Select a node";
    document.getElementById("node-meta").textContent = "";
    document.getElementById("node-attrs").textContent = "";
}

function showDetails(d) {
    const title = `${d.data.type}: ${nodeTitle(d)}`;
    document.getElementById("node-title").textContent = title;

    const data = d.data.data || {};
    const meta = {
        depth: d.depth,
        childrenCount: (d.children || []).length,
        nodeType: d.data.type
    };
    document.getElementById("node-meta").textContent = JSON.stringify(meta, null, 2);
    document.getElementById("node-attrs").textContent = JSON.stringify(data, null, 2);
}

/* ---------- UI Wiring ---------- */

function populateScenarioSelector(data) {
    const sel = document.getElementById("scenarioSelector");
    sel.innerHTML = `<option value="">-- Choose Scenario --</option>`;
    data.forEach((raw, i) => {
        const s = normalizeScenario(raw) || raw;
        const opt = document.createElement("option");
        opt.value = i;
        const name = s.scenarioName || s.tradingName || s.officialName || s.mdmCustomerId || `Scenario ${i + 1}`;
        const type = s.customerType || (raw && raw.customer && raw.customer.customerType) || "";
        opt.textContent = `${name}  •  ${type}`;
        sel.appendChild(opt);
    });
}

function applySearch(query) {
    if (!currentRoot) return;
    const q = (query || "").trim().toLowerCase();
    if (!q) { clearHighlights(); return; }

    const matches = [];
    currentRoot.descendants().forEach(d => {
        const data = d.data.data || {};
        const hay = [
            nodeTitle(d),
            data.mdmCustomerId, data.parentMdmCustomerId,
            data.mdmAccountId, data.parentAccountId,
            data.officialName, data.tradingName,
            data.taxId, data.globalGroupCode,
            (data.businessRoles || []).join(", "),
            data.refValue
        ].map(safe).join(" ").toLowerCase();
        if (hay.includes(q)) matches.push(d);
    });

    // Highlight matches; dim others
    g.selectAll(".node").classed("is-dim", true).classed("is-highlight", false).classed("is-selected", false);
    g.selectAll(".link").classed("is-dim", true);

    const keep = new Set();
    matches.forEach(m => {
        keep.add(m);
        // also keep path to root so user can understand context
        let p = m;
        while (p) { keep.add(p); p = p.parent; }
    });

    g.selectAll(".node").each(function (n) {
        if (keep.has(n)) d3.select(this).classed("is-dim", false);
    });

    g.selectAll(".node").each(function (n) {
        if (matches.includes(n)) d3.select(this).classed("is-highlight", true);
    });

    // If exactly one match, show details
    if (matches.length === 1) showDetails(matches[0]);
}

/* ---------- Load Data ---------- */

fetch("customerData.json")
    .then(res => res.json())
    .then(data => {
        // Accept either an array, or an object with a 'scenarios' array, or a map-of-scenarios.
        let arr = data;
        if (data && Array.isArray(data.scenarios)) arr = data.scenarios;
        if (arr && !Array.isArray(arr) && typeof arr === "object") arr = Object.values(arr);
        scenarios = Array.isArray(arr) ? arr : [];

        populateScenarioSelector(scenarios);

        // Give an explicit hint if dataset is incomplete (common cause of “only 2 scenarios in dropdown”).
        if (scenarios.length && scenarios.length !== 7) {
            document.getElementById("json-display").textContent =
                `WARNING: Loaded ${scenarios.length} scenario(s) from customerData.json. Expected 7.\n\n` +
                JSON.stringify(data, null, 2);
        }
    })
    .catch(err => {
        console.error("Failed to load customerData.json", err);
        document.getElementById("json-display").textContent =
            "ERROR: Could not load customerData.json. Put your 7-scenario JSON array in the same folder and name it customerData.json.";
    });

document.getElementById("scenarioSelector").addEventListener("change", (e) => {
    const i = e.target.value;
    if (i === "") return;
    const scenario = scenarios[Number(i)];
    if (scenario) renderScenario(scenario);
});

document.getElementById("resetZoom").addEventListener("click", () => fitToCanvas());

document.getElementById("nodeSearch").addEventListener("input", (e) => applySearch(e.target.value));

svg.on("click", () => {
    clearDetails();
    clearHighlights();
});

// Refit on resize
window.addEventListener("resize", () => {
    if (currentScenario) fitToCanvas();
});
