/* DHL eCommerce · Customer Master Data Viewer
   - Loads JSON from data/ folder
   - Toolbar (topbar) hosts scenario selector + filters
   - Left inspector is collapsible and shows business context + readable JSON
   - Footer hosts the legend
*/

let DATASET = [];
let REF = null;
let REF_COLORS = null;

let activeScenarioIndex = null;
let activeScenario = null;
let rootHierarchy = null;
let selectedNodeDatum = null; // locked by click
let COLLAPSED_IDS = new Set();

const VIEW = {
    addresses: true,
    contacts: true,
    contracts: true,
    platforms: true,
};

const CUSTOMER_TYPE_DEFS = {
    STRATEGIC_CUSTOMERS: {
        title: "Major & Key Accounts (Strategic Channel)",
        body: "Dedicated management for high-value, complex, or multi-national customers. Focus on long-term retention, governance, and customized logistics solutions."
    },
    RELATIONSHIP_CUSTOMERS: {
        title: "Field Sales / Telesales (Relationship Channel)",
        body: "Domestic B2B customers managed via Field Sales or Telesales. Focus on retention and scalable growth."
    },
    RESELLERS: {
        title: "Partner Channel (Indirect) · Reseller",
        body: "Intermediary selling DHL services to SMEs through a tech/provider layer. Managed via Partner Managers."
    },
    RETAIL_CASH_CUSTOMERS: {
        title: "Retail / ServicePoint (Cash Channel)",
        body: "Ad-hoc shippers using ServicePoints and cash/transactional pricing."
    },
    PARTNERS: {
        title: "Partner Channel (Indirect) · Platform",
        body: "Marketplace/ecosystem partner bringing volume via integrations; DHL sold through partner’s portfolio."
    },
    MULTICHANNEL_DIGITAL_CUSTOMERS: {
        title: "Digital / Multichannel (Automated Channel)",
        body: "Self-onboarded customers via portal, plugins, or APIs. Low-touch, automation-first."
    },
    INTERNAL_CUSTOMERS: {
        title: "Internal Channel",
        body: "Inter-company services within DHL group. Cost-center driven operational enablement."
    }
};

const SALES_CHANNEL_DEFS = {
    MAJOR_ACCOUNT: "Dedicated management for high-value / complex customers (Strategic).",
    KEY_ACCOUNT: "Key-account governance for strategic customers (Strategic).",
    FIELD_SALES: "Face-to-face management for domestic customers (Relationship).",
    TELESALES: "Remote account management (Relationship).",
    MULTICHANNEL: "Automated / self-onboarded via portals, plugins, APIs (Digital).",
    SERVICE_POINTS_RETAIL: "Transactional retail / ServicePoint usage (Retail/Cash).",
    PARTNER_MANAGERS: "Indirect channel management for platforms/resellers (Partner/Reseller).",
    INTERNAL: "Internal cost-center services (Internal)."
};

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

const FALLBACK_COLORS = {
    GLOBAL_CUSTOMER: { fill: "#6D28D9", stroke: "#4C1D95", text: "#ffffff" },
    CUSTOMER: { fill: "#FFCC00", stroke: "#B68900", text: "#111111" },
    ACCOUNT: { fill: "#D40511", stroke: "#8F000A", text: "#ffffff" },
    CONTRACT: { fill: "#1D4ED8", stroke: "#1E3A8A", text: "#ffffff" },
    BILLING: { fill: "#0EA5E9", stroke: "#0369A1", text: "#ffffff" },
    PLATFORM: { fill: "#E5E7EB", stroke: "#9CA3AF", text: "#111111" },
    LOCATION: { fill: "#6B7280", stroke: "#374151", text: "#ffffff" },
    CONTACT: { fill: "#10B981", stroke: "#065F46", text: "#ffffff" },
};

const ICONS = {
    GLOBAL_CUSTOMER: "🌐",
    CUSTOMER: "🏢",
    ACCOUNT: "🧾",
    CONTRACT: "📄",
    BILLING: "💳",
    PLATFORM: "🧩",
    LOCATION: "📍",
    CONTACT: "👤",
};

function getColorToken(nodeType) {
    // Explicit override: platform nodes must be visually distinct from accounts (light gray).
    if (nodeType === "PLATFORM") {
        return { fill: "#E5E7EB", stroke: "#9CA3AF", text: "#111111" };
    }
    return FALLBACK_COLORS[nodeType] || { fill: "#111827", stroke: "#111827", text: "#ffffff" };
}

async function loadJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return await res.json();
}

async function boot() {
    try {
        const [dataset, ref, colors] = await Promise.all([
            loadJson("data/customerData.json"),
            loadJson("data/reference_master_data.json"),
            loadJson("data/reference_colors.json").catch(() => null),
        ]);

        DATASET = Array.isArray(dataset) ? dataset : [];
        REF = ref;
        REF_COLORS = colors;

        initUi();
        populateFiltersFromReference();
        rebuildScenarioOptions();

        if (DATASET.length > 0) {
            $("scenarioSelector").value = "0";
            onScenarioChange();
        }
    } catch (err) {
        console.error(err);
        renderFatalError(err);
    }
}

function renderFatalError(err) {
    const container = document.querySelector("#viz-container");
    if (!container) return;
    container.innerHTML = `
    <div style="padding:18px; font-family: system-ui;">
      <h2 style="margin:0 0 10px;">Data could not be loaded</h2>
      <div style="color:#444; margin-bottom:10px;">Check that these files exist under <code>data/</code> and that you are serving this folder via a local web server (not file://).</div>
      <pre style="background:#0b0f14;color:#e9eef5;padding:12px;border-radius:12px;overflow:auto;">${escapeHtml(String(err))}</pre>
      <div style="color:#444; margin-top:10px;">Expected relative paths:</div>
      <ul style="color:#444; margin-top:6px;">
        <li><code>data/customerData.json</code></li>
        <li><code>data/reference_master_data.json</code></li>
        <li><code>data/reference_colors.json</code></li>
      </ul>
    </div>
  `;
}

function initUi() {
    $("scenarioSelector")?.addEventListener("change", onScenarioChange);
    $("filterCustomerType")?.addEventListener("change", onFilterChange);
    $("filterIndustry")?.addEventListener("change", onFilterChange);
    $("filterSalesChannel")?.addEventListener("change", onFilterChange);
    $("nodeSearch")?.addEventListener("input", onSearch);
    $("resetZoom")?.addEventListener("click", () => zoomToFit(true));
    $("toggleSidebar")?.addEventListener("click", () => {
        document.body.classList.toggle("sidebar-collapsed");
    });
}

function populateFiltersFromReference() {
    const domains = REF?.domains;
    if (!domains) return;
    fillSelect($("filterCustomerType"), ["", ...(domains.customerType || [])], v => v ? v : "All");
    fillSelect($("filterIndustry"), ["", ...(domains.industrySector || [])], v => v ? v : "All");
    fillSelect($("filterSalesChannel"), ["", ...(domains.salesChannel || [])], v => v ? v : "All");
}

function fillSelect(selectEl, values, labelFn) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    for (const v of values) {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = labelFn(v);
        selectEl.appendChild(opt);
    }
}

function getScenarioFilterSignature(scenario) {
    const customerType = scenario?.customer?.customerType || "";
    const industry = scenario?.customer?.industrySector || "";
    const soldTo = (scenario?.accounts || []).find(a => Array.isArray(a.businessRoles) && a.businessRoles.includes("SOLDTO"));
    const channel = soldTo?.salesChannel || "";
    return { customerType, industry, channel };
}

function scenarioMatchesFilters(scenario) {
    const fType = $("filterCustomerType")?.value || "";
    const fIndustry = $("filterIndustry")?.value || "";
    const fChannel = $("filterSalesChannel")?.value || "";
    const sig = getScenarioFilterSignature(scenario);
    if (fType && sig.customerType !== fType) return false;
    if (fIndustry && sig.industry !== fIndustry) return false;
    if (fChannel && sig.channel !== fChannel) return false;
    return true;
}

function rebuildScenarioOptions() {
    const sel = $("scenarioSelector");
    if (!sel) return;
    const prev = sel.value;

    sel.innerHTML = '<option value="">-- Choose Scenario --</option>';
    DATASET.forEach((s, idx) => {
        if (!scenarioMatchesFilters(s)) return;
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = s.scenarioName || `Scenario ${idx + 1}`;
        sel.appendChild(opt);
    });

    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    else sel.value = "";
}

function onFilterChange() {
    rebuildScenarioOptions();
    const sel = $("scenarioSelector");
    if (sel && sel.value) onScenarioChange();
    else clearCanvasAndInspector();
}

function onScenarioChange() {
    const idxStr = $("scenarioSelector")?.value;
    if (!idxStr) {
        clearCanvasAndInspector();
        return;
    }
    const idx = Number(idxStr);
    const scenario = DATASET[idx];
    if (!scenario) return;

    activeScenarioIndex = idx;
    activeScenario = scenario;
    selectedNodeDatum = null;
    COLLAPSED_IDS = new Set();

    rootHierarchy = buildHierarchyForScenario(scenario);
    renderTree(rootHierarchy);
    updateDQBadge(scenario);
}

function clearCanvasAndInspector() {
    d3.select("#viz-container").selectAll("*").remove();
    // recreate svg to avoid stale bindings
    initSvg();
    setInspector(null);
    updateDQBadge(null);
}

function updateDQBadge(scenario) {
    const dot = $("dqDot");
    const text = $("dqText");
    if (!scenario) {
        if (dot) dot.style.background = "#999";
        if (text) text.textContent = "DQ: N/A";
        return;
    }

    const domains = REF?.domains;
    if (!domains) {
        if (dot) dot.style.background = "#999";
        if (text) text.textContent = "DQ: Unknown";
        return;
    }

    const issues = [];
    const ct = scenario?.customer?.customerType;
    if (ct && !domains.customerType?.includes(ct)) issues.push("customerType");
    const ind = scenario?.customer?.industrySector;
    if (ind && !domains.industrySector?.includes(ind)) issues.push("industrySector");
    const soldTo = (scenario?.accounts || []).find(a => a?.businessRoles?.includes("SOLDTO"));
    const ch = soldTo?.salesChannel;
    if (ch && !domains.salesChannel?.includes(ch)) issues.push("salesChannel");

    if (issues.length === 0) {
        if (dot) dot.style.background = "#22c55e";
        if (text) text.textContent = "DQ: OK";
    } else {
        if (dot) dot.style.background = "#f59e0b";
        if (text) text.textContent = `DQ: ${issues.length} issue(s)`;
    }
}

function guessCountryFromId(id) {
    if (!id) return "";
    const m = String(id).match(/-(ES|TR|NL|DE|FR|IT|GB|US|PL|CZ|BE|LU|PT|IE|CH|AT|SE|NO|DK|FI|GR|HU|RO|BG|HR|SI|SK|EE|LV|LT)\b/);
    return m ? m[1] : "";
}

function globalLabel(c) {
    return c?.tradingName || c?.officialName || c?.mdmCustomerId || "Global Customer";
}

function customerLabel(c) {
    const name = c?.tradingName || c?.officialName || c?.mdmCustomerId || "Customer";
    const cc = c?.countryOfRegistration ? ` (${c.countryOfRegistration})` : "";
    return `${name}${cc}`;
}

function accountLabel(a) {
    const role = Array.isArray(a?.businessRoles) ? a.businessRoles.join("+") : "ACCOUNT";
    const base = a?.mdmAccountId || "Account";
    return `${base} · ${role}`;
}

function addressLabel(a) {
    const t = a?.addressType ? `${a.addressType}` : "ADDRESS";
    const city = a?.city || "";
    const cc = a?.country || "";
    return `${t} · ${city}${city && cc ? ", " : ""}${cc}`.trim();
}

function contactLabel(c) {
    const name = `${c?.firstName || ""} ${c?.lastName || ""}`.trim() || (c?.contactPersonId || "Contact");
    const title = c?.jobTitle ? ` · ${c.jobTitle}` : "";
    return `${name}${title}`;
}

function platformLabel(p) {
    return `${p?.name || "Platform"}${p?.platformId ? ` · ${p.platformId}` : ""}`;
}

function billingLabel(b) {
    return `${b?.billingAccountNumber || b?.billingProfileId || "Billing Profile"}`;
}

function makeNode(type, name, data) {
    return { type, name, data, children: [] };
}

function buildHierarchyForScenario(scenario) {
    const global = scenario.customer;
    const relatedCustomers = Array.isArray(scenario.relatedCustomers) ? scenario.relatedCustomers : [];
    const accounts = Array.isArray(scenario.accounts) ? scenario.accounts : [];

    const custById = new Map();
    for (const c of relatedCustomers) custById.set(c.mdmCustomerId, c);

    const customersWithCountry = relatedCustomers.map(c => ({
        ...c,
        _country: c.countryOfRegistration || guessCountryFromId(c.mdmCustomerId) || ""
    }));

    function findCustomerForAccount(acc) {
        if (acc?.mdmCustomerId && custById.has(acc.mdmCustomerId)) return custById.get(acc.mdmCustomerId);
        const cc = guessCountryFromId(acc?.mdmAccountId);
        if (!cc) return null;
        return customersWithCountry.find(c => c._country === cc) || null;
    }

    const childrenByParent = new Map();
    for (const a of accounts) {
        const p = a.parentAccountId || "__ROOT__";
        if (!childrenByParent.has(p)) childrenByParent.set(p, []);
        childrenByParent.get(p).push(a);
    }

    const root = makeNode("GLOBAL_CUSTOMER", globalLabel(global), global);
    root.children = [];

    const countryNodes = customersWithCountry.map(c => {
        const n = makeNode("CUSTOMER", customerLabel(c), c);
        n._country = c._country;
        return n;
    });

    if (countryNodes.length === 0) {
        root.children.push(...(childrenByParent.get("__ROOT__") || []).map(a => buildAccountTree(a)));
        attachCommonChildren(root);
        return root;
    }

    countryNodes.sort((a, b) => String(a._country).localeCompare(String(b._country)));

    for (const cn of countryNodes) {
        cn.children = [];

        const soldTos = accounts.filter(a => a.parentAccountId == null).filter(a => {
            const c = findCustomerForAccount(a);
            return c && c.mdmCustomerId === cn.data.mdmCustomerId;
        });

        if (soldTos.length === 0) {
            const cc = cn._country;
            soldTos.push(...accounts.filter(a => a.parentAccountId == null).filter(a => guessCountryFromId(a.mdmAccountId) === cc));
        }

        for (const st of soldTos) cn.children.push(buildAccountTree(st));

        attachCommonChildren(cn);
        root.children.push(cn);
    }

    attachCommonChildren(root);
    return root;

    function buildAccountTree(acc) {
        const n = makeNode("ACCOUNT", accountLabel(acc), acc);
        n.children = [];

        if (VIEW.platforms && acc.platformObject) {
            n.children.push(makeNode("PLATFORM", platformLabel(acc.platformObject), acc.platformObject));
        }

        if (VIEW.contracts && Array.isArray(acc.contracts) && acc.contracts.length) {
            for (const c of acc.contracts) {
                const cn = makeNode("CONTRACT", c.contractName || c.contractId || "Contract", c);
                cn.children = [];
                if (c.billingProfile) cn.children.push(makeNode("BILLING", billingLabel(c.billingProfile), c.billingProfile));
                attachCommonChildren(cn);
                n.children.push(cn);
            }
        }

        const kids = childrenByParent.get(acc.mdmAccountId) || [];
        for (const k of kids) n.children.push(buildAccountTree(k));

        attachCommonChildren(n);
        return n;
    }

    function attachCommonChildren(node) {
        const obj = node.data;
        if (!obj) return;

        if (VIEW.addresses && Array.isArray(obj.addresses)) {
            for (const a of obj.addresses) node.children.push(makeNode("LOCATION", addressLabel(a), a));
        }

        if (VIEW.contacts && Array.isArray(obj.contactPersons)) {
            for (const c of obj.contactPersons) node.children.push(makeNode("CONTACT", contactLabel(c), c));
        }
    }
}

// ---- D3 ----
let svg, g, zoom;
const NODE_W = 270;
const NODE_H = 88;
const HEADER_H = 30;
const X_SPACING = 32;
const Y_SPACING = 24;

function initSvg() {
    svg = d3.select("#viz-container").append("svg").attr("width", "100%").attr("height", "100%");
    g = svg.append("g");
    zoom = d3.zoom().scaleExtent([0.08, 2.5]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);
}

initSvg();

function getNodeKey(nodeObj) {
    if (!nodeObj) return "";
    const d = nodeObj.data || {};
    return (
        d.mdmCustomerId ||
        d.mdmAccountId ||
        d.contractId ||
        d.billingProfileId ||
        d.platformId ||
        d.addressId ||
        d.contactPersonId ||
        nodeObj.name ||
        JSON.stringify([nodeObj.type, nodeObj.name])
    );
}

function renderTree(rootObj) {
    g.selectAll("*").remove();
    if (!rootObj) return;

    const root = d3.hierarchy(rootObj, d => d.children);

    root.descendants().forEach(d => {
        const key = getNodeKey(d.data);
        if (COLLAPSED_IDS.has(key) && d.children && d.children.length) {
            d._children = d.children;
            d.children = null;
        }
    });

    d3.tree().nodeSize([NODE_W + X_SPACING, NODE_H + Y_SPACING])(root);

    g.selectAll("path.link")
        .data(root.links())
        .enter()
        .append("path")
        .attr("fill", "none")
        .attr("stroke", "rgba(0,0,0,.18)")
        .attr("stroke-width", 1.4)
        .attr("d", d3.linkVertical()
            .x(d => d.x + NODE_W / 2)
            .y(d => d.y + NODE_H / 2));

    const node = g.selectAll("g.node")
        .data(root.descendants())
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .style("cursor", "pointer")
        .on("mouseenter", (e, d) => {
            if (selectedNodeDatum) return;
            setInspector(d.data);
        })
        .on("mouseleave", () => {
            if (selectedNodeDatum) return;
            setInspector(null);
        })
        .on("click", (e, d) => {
            const key = getNodeKey(d.data);
            if (COLLAPSED_IDS.has(key)) COLLAPSED_IDS.delete(key);
            else COLLAPSED_IDS.add(key);
            selectedNodeDatum = d;
            setInspector(d.data);
            renderTree(rootObj);
            e.stopPropagation();
        });

    node.append("rect")
        .attr("width", NODE_W)
        .attr("height", NODE_H)
        .attr("rx", 14)
        .attr("fill", "#fff")
        .attr("stroke", "rgba(0,0,0,.12)");

    node.append("rect")
        .attr("width", NODE_W)
        .attr("height", HEADER_H)
        .attr("rx", 14)
        .attr("fill", d => getColorToken(d.data.type).fill)
        .attr("stroke", d => getColorToken(d.data.type).stroke);

    node.append("text")
        .attr("x", 12)
        .attr("y", 20)
        .attr("fill", d => getColorToken(d.data.type).text)
        .attr("font-weight", 900)
        .attr("font-size", 12)
        .text(d => `${ICONS[d.data.type] || ""} ${truncate(d.data.name, 30)}`);

    node.each(function (d) {
        const el = d3.select(this);
        const obj = d.data.data || {};
        const lines = computeMiniLines(d.data.type, obj);
        let y = HEADER_H + 22;
        for (const ln of lines) {
            el.append("text")
                .attr("x", 12)
                .attr("y", y)
                .attr("font-size", 11)
                .attr("fill", "#2b3138")
                .attr("font-weight", ln.bold ? 900 : 700)
                .text(truncate(ln.text, 44));
            y += 16;
            if (y > NODE_H - 10) break;
        }
    });

    zoomToFit(false);
    renderLegend();

    svg.on("click", (e) => {
        if (e.target.tagName.toLowerCase() === "svg") {
            selectedNodeDatum = null;
            setInspector(null);
        }
    });
}

function computeMiniLines(type, obj) {
    const out = [];
    if (type === "GLOBAL_CUSTOMER" || type === "CUSTOMER") {
        if (obj.mdmCustomerId) out.push({ text: `ID: ${obj.mdmCustomerId}`, bold: true });
        if (obj.customerType) out.push({ text: `Type: ${obj.customerType}`, bold: false });
        if (obj.industrySector) out.push({ text: `Industry: ${obj.industrySector}`, bold: false });
    } else if (type === "ACCOUNT") {
        if (obj.mdmAccountId) out.push({ text: `ID: ${obj.mdmAccountId}`, bold: true });
        if (obj.businessRoles) out.push({ text: `Roles: ${obj.businessRoles.join(", ")}`, bold: false });
        if (obj.salesChannel) out.push({ text: `Channel: ${obj.salesChannel}`, bold: false });
    } else if (type === "CONTRACT") {
        if (obj.contractId) out.push({ text: `ID: ${obj.contractId}`, bold: true });
        if (obj.startDate) out.push({ text: `Start: ${obj.startDate}`, bold: false });
    } else if (type === "BILLING") {
        if (obj.billingProfileId) out.push({ text: `Profile: ${obj.billingProfileId}`, bold: true });
        if (obj.billingCurrency) out.push({ text: `Currency: ${obj.billingCurrency}`, bold: false });
    } else if (type === "PLATFORM") {
        if (obj.platformId) out.push({ text: `Platform ID: ${obj.platformId}`, bold: true });
        if (obj.type) out.push({ text: `Type: ${obj.type}`, bold: false });
    } else if (type === "LOCATION") {
        if (obj.addressType) out.push({ text: `${obj.addressType}`, bold: true });
        out.push({ text: `${obj.city || ""}${obj.city && obj.country ? ", " : ""}${obj.country || ""}`, bold: false });
    } else if (type === "CONTACT") {
        out.push({ text: `${obj.firstName || ""} ${obj.lastName || ""}`.trim() || "Contact", bold: true });
        if (obj.jobTitle) out.push({ text: obj.jobTitle, bold: false });
    }
    return out;
}

function truncate(s, n) {
    const str = String(s ?? "");
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function zoomToFit(animated) {
    const container = document.getElementById("viz-container");
    if (!container) return;

    const bounds = g.node().getBBox();
    const fullWidth = container.clientWidth;
    const fullHeight = container.clientHeight;
    const padding = 36;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;
    if (width <= 0 || height <= 0) return;

    const scale = Math.min(1.6, Math.max(0.1, Math.min(fullWidth / width, fullHeight / height)));
    const tx = fullWidth / 2 - (bounds.x + bounds.width / 2) * scale;
    const ty = fullHeight / 2 - (bounds.y + bounds.height / 2) * scale;
    const t = d3.zoomIdentity.translate(tx, ty).scale(scale);

    if (animated) svg.transition().duration(650).call(zoom.transform, t);
    else svg.call(zoom.transform, t);
}

function onSearch() {
    const q = ($("nodeSearch")?.value || "").trim().toLowerCase();
    const nodes = g.selectAll("g.node");
    if (!q) {
        nodes.style("opacity", 1);
        return;
    }
    nodes.style("opacity", d => {
        const name = String(d.data.name || "").toLowerCase();
        const id = String(d.data.data?.mdmCustomerId || d.data.data?.mdmAccountId || d.data.data?.contractId || d.data.data?.billingProfileId || d.data.data?.platformId || "").toLowerCase();
        return (name.includes(q) || id.includes(q)) ? 1 : 0.18;
    });
}

function setInspector(nodeObj) {
    const meta = $("inspectorMeta");
    const ctx = $("inspectorContext");
    const defs = $("inspectorDefs");
    const pj = $("prettyJson");

    if (!nodeObj) {
        if (meta) meta.innerHTML = "<div class=\"kv\"><div class=\"k\">Hover/Click</div><div class=\"v\">Select a node to see details</div></div>";
        if (ctx) ctx.innerHTML = "";
        if (defs) defs.innerHTML = "";
        if (pj) pj.innerHTML = "";
        return;
    }

    const type = nodeObj.type;
    const data = nodeObj.data || {};

    const metaRows = [];
    metaRows.push(kvRow("Object Type", `${ICONS[type] || ""} ${type}`));
    if (data.mdmCustomerId) metaRows.push(kvRow("mdmCustomerId", data.mdmCustomerId));
    if (data.mdmAccountId) metaRows.push(kvRow("mdmAccountId", data.mdmAccountId));
    if (data.contractId) metaRows.push(kvRow("contractId", data.contractId));
    if (data.billingProfileId) metaRows.push(kvRow("billingProfileId", data.billingProfileId));
    if (data.platformId) metaRows.push(kvRow("platformId", data.platformId));
    if (data.officialName) metaRows.push(kvRow("officialName", data.officialName));
    if (data.tradingName) metaRows.push(kvRow("tradingName", data.tradingName));
    if (data.countryOfRegistration) metaRows.push(kvRow("country", data.countryOfRegistration));

    if (meta) meta.innerHTML = metaRows.join("");

    const badges = [];
    if (data.customerType) badges.push(badge(`customerType: ${data.customerType}`));
    if (data.industrySector) badges.push(badge(`industry: ${data.industrySector}`));
    if (data.salesChannel) badges.push(badge(`salesChannel: ${data.salesChannel}`));
    if (data.customerLevel) badges.push(badge(`level: ${data.customerLevel}`));
    if (ctx) ctx.innerHTML = badges.join("");

    const defBlocks = [];
    if (data.customerType && CUSTOMER_TYPE_DEFS[data.customerType]) {
        const d = CUSTOMER_TYPE_DEFS[data.customerType];
        defBlocks.push(defCard(d.title, d.body));
    }
    if (data.salesChannel && SALES_CHANNEL_DEFS[data.salesChannel]) {
        defBlocks.push(defCard("Sales Channel", SALES_CHANNEL_DEFS[data.salesChannel]));
    }
    if (defs) defs.innerHTML = defBlocks.join("");

    if (pj) pj.innerHTML = renderPrettyJson(data);
}

function kvRow(k, v) {
    return `<div class="kv"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`;
}

function badge(text) {
    return `<span class="badge">${escapeHtml(text)}</span>`;
}

function defCard(title, body) {
    return `<div class="def-card"><div class="def-title">${escapeHtml(title)}</div><div class="def-body">${escapeHtml(body)}</div></div>`;
}

function renderPrettyJson(obj) {
    const rows = [];
    const complex = [];
    const keys = Object.keys(obj || {}).sort((a, b) => a.localeCompare(b));
    for (const k of keys) {
        const v = obj[k];
        if (v == null) continue;
        if (Array.isArray(v) || (typeof v === "object" && v !== null)) complex.push([k, v]);
        else rows.push(prettyRow(k, v));
    }

    const parts = [];
    if (rows.length) {
        parts.push(`<div class="pj-item"><div class="pj-head"><div class="pj-key">Attributes</div><div class="pj-type">primitive</div></div><div class="pj-body">${rows.join("")}</div></div>`);
    }
    for (const [k, v] of complex) parts.push(renderComplexBlock(k, v));
    if (!parts.length) return `<div class="pj-item"><div class="pj-head"><div class="pj-key">Empty</div><div class="pj-type">—</div></div><div class="pj-body">No attributes</div></div>`;
    return parts.join("");
}

function prettyRow(k, v) {
    const val = typeof v === "boolean" ? (v ? "true" : "false") : String(v);
    return `<div class="pj-row"><div class="pj-k">${escapeHtml(k)}</div><div class="pj-v"><span class="pj-pill">${escapeHtml(val)}</span></div></div>`;
}

function renderComplexBlock(key, value) {
    const isArr = Array.isArray(value);
    const t = isArr ? `array · ${value.length}` : "object";

    if (isArr) {
        const items = value.map((it, idx) => {
            if (it == null) return "";
            if (typeof it === "object") {
                return `<details class="pj-details"><summary>${escapeHtml(key)}[${idx}] <span class="pj-type">object</span></summary><div class="pj-body">${renderPrettyJson(it)}</div></details>`;
            }
            return `<div class="pj-row"><div class="pj-k">${escapeHtml(key)}[${idx}]</div><div class="pj-v"><span class="pj-pill">${escapeHtml(String(it))}</span></div></div>`;
        }).join("");

        return `<div class="pj-item"><div class="pj-head"><div class="pj-key">${escapeHtml(key)}</div><div class="pj-type">${escapeHtml(t)}</div></div><div class="pj-body">${items || "<span class=\"pj-pill\">(empty)</span>"}</div></div>`;
    }

    return `<div class="pj-item"><div class="pj-head"><div class="pj-key">${escapeHtml(key)}</div><div class="pj-type">${escapeHtml(t)}</div></div><div class="pj-body">${renderPrettyJson(value)}</div></div>`;
}

function renderLegend() {
    const el = $("footerLegend");
    if (!el) return;

    const items = [
        ["GLOBAL_CUSTOMER", "Global customer"],
        ["CUSTOMER", "Customer"],
        ["ACCOUNT", "Account"],
        ["CONTRACT", "Contract"],
        ["BILLING", "Billing"],
        ["PLATFORM", "Platform"],
        ["LOCATION", "Address / Location"],
        ["CONTACT", "Contact"],
    ];

    el.innerHTML = items.map(([t, label]) => {
        const c = getColorToken(t);
        return `<div class="legend-item"><span class="legend-swatch" style="background:${c.fill}"></span><span class="legend-icon">${ICONS[t] || ""}</span><span class="legend-text">${escapeHtml(label)}</span></div>`;
    }).join("");
}

boot();
