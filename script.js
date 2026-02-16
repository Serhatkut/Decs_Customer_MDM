// script.js
(() => {
    const DATASET_URL = "data/customerData.json";
    const REF_URL = "data/reference_master_data.json";

    const els = {
        scenarioSelector: document.getElementById("scenarioSelector"),
        filterCustomerType: document.getElementById("filterCustomerType"),
        filterIndustry: document.getElementById("filterIndustry"),
        filterSalesChannel: document.getElementById("filterSalesChannel"),
        clearFilters: document.getElementById("clearFilters"),

        collapseAll: document.getElementById("collapseAll"),
        expandAll: document.getElementById("expandAll"),
        resetView: document.getElementById("resetView"),
        toggleInspector: document.getElementById("toggleInspector"),

        dqDot: document.getElementById("dqDot"),
        dqText: document.getElementById("dqText"),

        inspector: document.getElementById("inspector"),
        classificationPills: document.getElementById("classificationPills"),
        objectSummary: document.getElementById("objectSummary"),
        meaningBox: document.getElementById("meaningBox"),
        readableJson: document.getElementById("readableJson"),
        rawJson: document.getElementById("rawJson"),

        legend: document.getElementById("legend"),
        viz: document.getElementById("viz"),
    };

    let ref = null;
    let dataset = [];
    let currentScenario = null;

    let hiddenTypes = new Set(); // legend toggles
    let collapsedIds = new Set(); // collapse all / expand all behavior

    // D3
    let svg, rootG, zoom;
    let tooltip;

    // Channel definitions (your mapping)
    const channelDefinitions = {
        MAJOR_ACCOUNT: {
            title: "Major & Key Accounts (Strategic Channel)",
            definition:
                "Dedicated management for high-value, complex, or multi-national customers. Focus on long-term retention, global governance, QBRs, and customized logistics solutions.",
            primaryContact: "Global/Regional Key Account Manager (GAM/RAM).",
            mappedTypes: ["STRATEGIC_CUSTOMERS"],
        },
        KEY_ACCOUNT: {
            title: "Major & Key Accounts (Strategic Channel)",
            definition:
                "Dedicated management for high-value, complex, or multi-national customers. Focus on long-term retention, global governance, QBRs, and customized logistics solutions.",
            primaryContact: "Global/Regional Key Account Manager (GAM/RAM).",
            mappedTypes: ["STRATEGIC_CUSTOMERS"],
        },
        FIELD_SALES: {
            title: "Field Sales (Relationship Channel)",
            definition:
                "Face-to-face sales management for mid-to-large domestic customers. Focus on hunting new business and farming existing accounts via on-site visits.",
            primaryContact: "Field Sales Executive.",
            mappedTypes: ["RELATIONSHIP_CUSTOMERS"],
        },
        TELESALES: {
            title: "Telesales / Inside Sales (Relationship Channel)",
            definition:
                "Remote account management for SME customers with recurring volume. Focus on efficiency, retention, and up-selling via phone/video calls.",
            primaryContact: "Telesales Agent.",
            mappedTypes: ["RELATIONSHIP_CUSTOMERS"],
        },
        MULTICHANNEL: {
            title: "Digital / Multichannel (Automated Channel)",
            definition:
                "Zero-touch or low-touch channel where customers self-onboard via web portals, plugins (Shopify/WooCommerce), or APIs.",
            primaryContact: "Digital Sales Bot / Customer Service Support.",
            mappedTypes: ["MULTICHANNEL_DIGITAL_CUSTOMERS"],
        },
        SERVICE_POINTS_RETAIL: {
            title: "Retail / ServicePoint (Cash Channel)",
            definition:
                "Physical network (Parcel Shops, Lockers, Post Offices) serving ad-hoc shippers. Transactional only (Pay-as-you-go).",
            primaryContact: "ServicePoint Agent / POS System.",
            mappedTypes: ["RETAIL_CASH_CUSTOMERS"],
        },
        PARTNER_MANAGERS: {
            title: "Partner Channel (Indirect)",
            definition:
                "Management of intermediaries who resell or integrate DHL services. Focus on enabling partners (platforms/resellers/integrators) to sell DHL.",
            primaryContact: "Partner Manager.",
            mappedTypes: ["PARTNERS", "RESELLERS"],
        },
        INTERNAL: {
            title: "Internal Channel",
            definition:
                "Inter-company logistics services for DHL operations (uniforms, IT equipment, documents between hubs).",
            primaryContact: "Internal Operations Lead.",
            mappedTypes: ["INTERNAL_CUSTOMERS"],
        },
    };

    // ---------- boot ----------
    Promise.all([fetchJson(DATASET_URL), fetchJson(REF_URL)])
        .then(([data, reference]) => {
            dataset = Array.isArray(data) ? data : [];
            ref = reference;

            initScenarioSelector(dataset);
            initFilters(reference, dataset);

            initD3();

            // default: first scenario
            if (dataset.length) {
                setScenario(dataset[0].scenarioName);
            }

            bindUI();
        })
        .catch((err) => {
            console.error("Load failed:", err);
            alert("Failed to load JSON data. Check /data paths and run via a local server.");
        });

    function fetchJson(url) {
        return fetch(url, { cache: "no-store" }).then((r) => {
            if (!r.ok) throw new Error(`${url} -> ${r.status}`);
            return r.json();
        });
    }

    // ---------- UI init ----------
    function initScenarioSelector(data) {
        els.scenarioSelector.innerHTML = "";
        data.forEach((s, i) => {
            const opt = document.createElement("option");
            opt.value = s.scenarioName || `Scenario ${i + 1}`;
            opt.textContent = s.scenarioName || `Scenario ${i + 1}`;
            els.scenarioSelector.appendChild(opt);
        });
    }

    function initFilters(reference, data) {
        const domains = (reference && reference.domains) || {};

        fillSelect(els.filterCustomerType, ["", ...((domains.customerType) || [])], "All");
        fillSelect(els.filterIndustry, ["", ...((domains.industrySector) || [])], "All");
        fillSelect(els.filterSalesChannel, ["", ...((domains.salesChannel) || [])], "All");

        // scenario-dependent DQ
        computeDQForDataset(reference, data);
    }

    function fillSelect(selectEl, values, labelAll) {
        selectEl.innerHTML = "";
        values.forEach((v) => {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = v === "" ? labelAll : v;
            selectEl.appendChild(opt);
        });
    }

    function bindUI() {
        els.scenarioSelector.addEventListener("change", () => setScenario(els.scenarioSelector.value));

        els.filterCustomerType.addEventListener("change", applyTopFilters);
        els.filterIndustry.addEventListener("change", applyTopFilters);
        els.filterSalesChannel.addEventListener("change", applyTopFilters);

        els.clearFilters.addEventListener("click", () => {
            els.filterCustomerType.value = "";
            els.filterIndustry.value = "";
            els.filterSalesChannel.value = "";
            applyTopFilters();
        });

        els.toggleInspector.addEventListener("click", () => {
            els.inspector.classList.toggle("is-collapsed");
        });

        els.collapseAll.addEventListener("click", () => {
            if (!currentScenario) return;
            collapsedIds = new Set();
            const tree = buildTreeForScenario(currentScenario);
            tree.descendants.forEach((n) => {
                if (n.depth >= 1) collapsedIds.add(n.id);
            });
            render();
        });

        els.expandAll.addEventListener("click", () => {
            collapsedIds = new Set();
            render();
        });

        els.resetView.addEventListener("click", () => zoomToFit());
    }

    // ---------- scenario selection ----------
    function setScenario(name) {
        currentScenario = dataset.find((s) => s.scenarioName === name) || dataset[0] || null;
        hiddenTypes = new Set(); // reset legend toggles per scenario
        collapsedIds = new Set();

        applyTopFilters();
        renderLegend();
        render();
        zoomToFit();

        // defaults in inspector
        setSelectedObject(null, currentScenario);
    }

    // ---------- filtering ----------
    function applyTopFilters() {
        if (!currentScenario) return;

        const t = els.filterCustomerType.value;
        const i = els.filterIndustry.value;
        const c = els.filterSalesChannel.value;

        // In this viewer we don't hide anything at scenario-level unless it mismatches root customer.
        // Instead we compute a "match score" and update DQ badge visually.
        const rootCustomer = currentScenario.customer || {};
        const matches =
            (t ? rootCustomer.customerType === t : true) &&
            (i ? rootCustomer.industrySector === i : true);

        // channel is mainly on accounts; scenario-level check is: any account matches channel
        let channelMatch = true;
        if (c) {
            channelMatch = (currentScenario.accounts || []).some((a) => a.salesChannel === c);
        }

        const ok = matches && channelMatch;
        els.dqDot.style.background = ok ? "#22c55e" : "#f59e0b";
        els.dqText.textContent = ok ? "DQ: OK" : "DQ: CHECK";

        // Also update Business meaning panel based on selected filters (or selected node later)
        const ct = t || rootCustomer.customerType || "—";
        const ind = i || rootCustomer.industrySector || "—";
        const ch = c || pickDominantChannel(currentScenario) || "—";
        renderBusinessMeaning(ct, ind, ch);
        renderClassificationPills(ct, ind, ch);

        // IMPORTANT: do not rebuild tree here, only update dimming based on hiddenTypes
        render();
    }

    function pickDominantChannel(scenario) {
        const counts = new Map();
        (scenario.accounts || []).forEach((a) => {
            if (!a.salesChannel) return;
            counts.set(a.salesChannel, (counts.get(a.salesChannel) || 0) + 1);
        });
        let best = null;
        let bestN = -1;
        for (const [k, v] of counts.entries()) {
            if (v > bestN) { bestN = v; best = k; }
        }
        return best;
    }

    function computeDQForDataset(reference, data) {
        // optional: keep minimal; current badge computed on scenario change
        els.dqDot.style.background = "#9ca3af";
        els.dqText.textContent = "DQ: N/A";
    }

    // ---------- legend ----------
    const LEGEND_TYPES = [
        { key: "GLOBAL_CUSTOMER", label: "Global Customer", colorVar: "--c-global", icon: "🌐" },
        { key: "CUSTOMER", label: "Customer", colorVar: "--c-customer", icon: "🏢" },
        { key: "ACCOUNT", label: "Account", colorVar: "--c-account", icon: "🧾" },
        { key: "CONTRACT", label: "Contract", colorVar: "--c-contract", icon: "📄" },
        { key: "BILLING", label: "Billing", colorVar: "--c-billing", icon: "💳" },
        { key: "ADDRESS", label: "Address", colorVar: "--c-address", icon: "📍" },
        { key: "CONTACT", label: "Contact", colorVar: "--c-contact", icon: "👤" },
        { key: "PLATFORM", label: "Platform", colorVar: "--c-platform", icon: "🧩" },
    ];

    function renderLegend() {
        els.legend.innerHTML = "";

        LEGEND_TYPES.forEach((t) => {
            const item = document.createElement("div");
            item.className = "legend-item";
            item.dataset.type = t.key;

            const dot = document.createElement("span");
            dot.className = "legend-dot";
            dot.style.background = getCssVar(t.colorVar);

            const txt = document.createElement("span");
            txt.textContent = `${t.icon} ${t.label}`;

            item.appendChild(dot);
            item.appendChild(txt);

            item.addEventListener("click", () => {
                if (hiddenTypes.has(t.key)) hiddenTypes.delete(t.key);
                else hiddenTypes.add(t.key);

                item.classList.toggle("off", hiddenTypes.has(t.key));
                render();
            });

            els.legend.appendChild(item);
        });
    }

    function getCssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    // ---------- D3 ----------
    function initD3() {
        els.viz.innerHTML = "";
        svg = d3.select("#viz").append("svg");
        rootG = svg.append("g");

        zoom = d3.zoom()
            .scaleExtent([0.25, 2.5])
            .on("zoom", (event) => rootG.attr("transform", event.transform));

        svg.call(zoom);

        tooltip = d3.select("#viz")
            .append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);
    }

    function render() {
        if (!currentScenario) return;

        // build tree + apply collapse state
        const tree = buildTreeForScenario(currentScenario);

        // layout
        const root = d3.hierarchy(tree.data, (d) => d.children);
        const treeLayout = d3.tree().nodeSize([200, 120]);
        treeLayout(root);

        // clear
        rootG.selectAll("*").remove();

        // links
        rootG.selectAll(".link")
            .data(root.links())
            .enter()
            .append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("d", d => {
                // orthogonal-ish
                const sx = d.source.x, sy = d.source.y;
                const tx = d.target.x, ty = d.target.y;
                const midY = (sy + ty) / 2;
                return `M${sx},${sy} L${sx},${midY} L${tx},${midY} L${tx},${ty}`;
            });

        // nodes
        const nodes = rootG.selectAll(".node")
            .data(root.descendants(), d => d.data.__id)
            .enter()
            .append("g")
            .attr("class", d => `node node--${d.data.__type}`)
            .attr("transform", d => `translate(${d.x},${d.y})`)
            .classed("is-hidden", d => hiddenTypes.has(d.data.__type))
            .on("click", (event, d) => {
                setSelectedObject(d.data.__raw, currentScenario, d.data.__type);
            })
            .on("mousemove", (event, d) => {
                showTooltip(event, d.data);
            })
            .on("mouseout", () => hideTooltip());

        // card
        const CARD_W = 220;
        const CARD_H = 72;

        nodes.append("rect")
            .attr("x", -CARD_W / 2)
            .attr("y", -CARD_H / 2)
            .attr("width", CARD_W)
            .attr("height", CARD_H);

        nodes.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "-4")
            .text(d => d.data.__title || d.data.name || d.data.__id || "");

        nodes.append("text")
            .attr("text-anchor", "middle")
            .attr("dy", "16")
            .style("font-weight", 700)
            .style("font-size", "11px")
            .text(d => d.data.__subtitle || "");

        // apply dimming if a topbar filter is set and node doesn't match classification
        applyDimming(nodes);

        // resize svg viewBox to content
        const xs = root.descendants().map(d => d.x);
        const ys = root.descendants().map(d => d.y);
        const minX = Math.min(...xs) - 300, maxX = Math.max(...xs) + 300;
        const minY = Math.min(...ys) - 200, maxY = Math.max(...ys) + 200;
        svg.attr("viewBox", `${minX} ${minY} ${maxX - minX} ${maxY - minY}`);
    }

    function applyDimming(nodesSel) {
        const t = els.filterCustomerType.value;
        const i = els.filterIndustry.value;
        const c = els.filterSalesChannel.value;

        // if no filters selected, no dimming
        if (!t && !i && !c) {
            nodesSel.classed("is-dimmed", false);
            return;
        }

        nodesSel.classed("is-dimmed", (d) => {
            const raw = d.data.__raw || {};
            if (d.data.__type === "CUSTOMER" || d.data.__type === "GLOBAL_CUSTOMER") {
                const okT = t ? raw.customerType === t : true;
                const okI = i ? raw.industrySector === i : true;
                return !(okT && okI);
            }
            if (d.data.__type === "ACCOUNT") {
                const okC = c ? raw.salesChannel === c : true;
                return !okC;
            }
            // child objects follow parent: don't dim by default
            return false;
        });
    }

    function zoomToFit() {
        const bbox = rootG.node()?.getBBox?.();
        if (!bbox) return;

        const vw = els.viz.clientWidth;
        const vh = els.viz.clientHeight;

        const scale = Math.min(vw / (bbox.width + 120), vh / (bbox.height + 120), 1.6);
        const tx = (vw / 2) - (bbox.x + bbox.width / 2) * scale;
        const ty = (vh / 2) - (bbox.y + bbox.height / 2) * scale;

        svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    // ---------- tree builder ----------
    function buildTreeForScenario(scenario) {
        // Decide root type: only Strategic multi-country gets GLOBAL_CUSTOMER wrapper
        const rootCustomer = scenario.customer || {};
        const hasMultiCountry = Array.isArray(scenario.relatedCustomers) && scenario.relatedCustomers.length >= 2;
        const isStrategic = rootCustomer.customerType === "STRATEGIC_CUSTOMERS" || rootCustomer.customerLevel === "STRATEGIC";

        const rootNode = isStrategic && hasMultiCountry
            ? makeNode("GLOBAL_CUSTOMER", rootCustomer.mdmCustomerId || "GLOBAL", rootCustomer.tradingName || rootCustomer.officialName || "Global Customer", "", rootCustomer)
            : makeNode("CUSTOMER", rootCustomer.mdmCustomerId || "CUSTOMER", rootCustomer.tradingName || rootCustomer.officialName || "Customer", iso2(rootCustomer.countryOfRegistration), rootCustomer);

        const accounts = scenario.accounts || [];

        // group accounts by parentAccountId
        const byParent = new Map();
        accounts.forEach((a) => {
            const p = a.parentAccountId || "__ROOT__";
            if (!byParent.has(p)) byParent.set(p, []);
            byParent.get(p).push(a);
        });

        // attach root accounts (parent null)
        const rootAccounts = (byParent.get("__ROOT__") || []);
        rootAccounts.forEach((acc) => rootNode.children.push(buildAccountSubtree(acc, byParent)));

        // if GLOBAL root, attach country customers as children nodes (based on relatedCustomers)
        if (rootNode.__type === "GLOBAL_CUSTOMER") {
            (scenario.relatedCustomers || []).forEach((rc) => {
                const cn = makeNode(
                    "CUSTOMER",
                    rc.mdmCustomerId,
                    rc.tradingName || rc.officialName || "Country Customer",
                    iso2(rc.countryOfRegistration),
                    rc
                );

                // attach accounts belonging to that country customerId if any
                const countryAccounts = accounts.filter(a => a.mdmCustomerId === rc.mdmCustomerId && !a.parentAccountId);
                countryAccounts.forEach((acc) => cn.children.push(buildAccountSubtree(acc, byParent)));

                rootNode.children.push(cn);
            });

            // also include accounts that belong to global mdmCustomerId (if present)
            // already added above as rootAccounts (since parentAccountId null); ok.
        }

        // Apply collapse-all state: mark children empty if collapsed
        const flat = [];
        walk(rootNode, (n) => flat.push(n));

        flat.forEach((n) => {
            if (collapsedIds.has(n.__id)) {
                n.__collapsed = true;
                n.__savedChildren = n.children;
                n.children = [];
            }
        });

        // mimic original "tree" object
        const tree = {
            data: rootNode,
            descendants: flat,
        };

        // assign __id uniqueness
        return normalizeIds(tree);
    }

    function buildAccountSubtree(acc, byParent) {
        const subtitle = (acc.businessRoles || []).join(", ");
        const node = makeNode("ACCOUNT", acc.mdmAccountId, acc.tradingName || acc.mdmAccountId, subtitle, acc);

        // contacts as separate objects
        (acc.contactPersons || []).forEach((c) => {
            const nm = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.contactPersonId;
            const sub = c.jobTitle || "";
            node.children.push(makeNode("CONTACT", c.contactPersonId || nm, nm, sub, c));
        });

        // addresses as separate objects
        (acc.addresses || []).forEach((a) => {
            const nm = `${a.addressType || "ADDRESS"} · ${a.city || ""}`.trim();
            const sub = `${a.street || ""} ${a.houseNumber || ""}`.trim();
            node.children.push(makeNode("ADDRESS", a.addressId || nm, nm, sub, a));
        });

        // platform as separate object
        if (acc.platformObject) {
            const p = acc.platformObject;
            node.children.push(makeNode("PLATFORM", p.platformId || "PLATFORM", p.name || "Platform", p.type || "", p));
        }

        // contracts
        (acc.contracts || []).forEach((c) => {
            const cn = makeNode("CONTRACT", c.contractId, c.contractName || "Contract", c.startDate || "", c);

            // billing profile
            if (c.billingProfile) {
                const b = c.billingProfile;
                const bn = makeNode("BILLING", b.billingProfileId || "BILLING", b.billingAccountNumber || "Billing Profile", b.billingCurrency || "", b);
                cn.children.push(bn);
            }

            // contract contact persons
            (c.contactPersons || []).forEach((cp) => {
                const nm = `${cp.firstName || ""} ${cp.lastName || ""}`.trim() || cp.contactPersonId;
                cn.children.push(makeNode("CONTACT", cp.contactPersonId || nm, nm, cp.jobTitle || "", cp));
            });

            // contract addresses
            (c.addresses || []).forEach((ad) => {
                const nm = `${ad.addressType || "ADDRESS"} · ${ad.city || ""}`.trim();
                cn.children.push(makeNode("ADDRESS", ad.addressId || nm, nm, `${ad.street || ""} ${ad.houseNumber || ""}`.trim(), ad));
            });

            node.children.push(cn);
        });

        // sub accounts
        const kids = byParent.get(acc.mdmAccountId) || [];
        kids.forEach((k) => node.children.push(buildAccountSubtree(k, byParent)));

        return node;
    }

    function makeNode(type, id, title, subtitle, raw) {
        return {
            __type: type,
            __id: String(id || title || type),
            __title: title || String(id || type),
            __subtitle: subtitle || "",
            __raw: raw || {},
            children: [],
        };
    }

    function normalizeIds(tree) {
        let seq = 0;
        const seen = new Map();
        walk(tree.data, (n) => {
            const base = n.__id || `node-${seq++}`;
            const k = `${n.__type}:${base}`;
            const count = (seen.get(k) || 0) + 1;
            seen.set(k, count);
            n.__id = count === 1 ? k : `${k}#${count}`;
        });

        // re-create descendants
        const flat = [];
        walk(tree.data, (n) => flat.push(n));
        tree.descendants = flat;
        return tree;
    }

    function walk(node, fn) {
        fn(node);
        (node.children || []).forEach((c) => walk(c, fn));
    }

    function iso2(x) {
        return (x || "").toString().toUpperCase();
    }

    // ---------- inspector / readable JSON ----------
    function setSelectedObject(raw, scenario, typeHint) {
        // if null selection, show scenario customer summary
        const obj = raw || (scenario ? scenario.customer : null) || {};

        // classification pills
        const ct = obj.customerType || (scenario?.customer?.customerType) || "—";
        const ind = obj.industrySector || (scenario?.customer?.industrySector) || "—";
        const ch = obj.salesChannel || pickDominantChannel(scenario) || "—";

        renderClassificationPills(ct, ind, ch);
        renderBusinessMeaning(ct, ind, ch);

        // object summary
        els.objectSummary.innerHTML = "";
        const summaryPairs = buildSummaryPairs(obj, typeHint);
        summaryPairs.forEach(([k, v]) => {
            els.objectSummary.appendChild(kvRow(k, v));
        });

        // readable JSON
        els.readableJson.innerHTML = "";
        els.readableJson.appendChild(buildReadable(obj));

        // raw JSON
        els.rawJson.textContent = JSON.stringify(obj, null, 2);
    }

    function renderClassificationPills(customerType, industry, channel) {
        els.classificationPills.innerHTML = "";
        els.classificationPills.appendChild(pill(`customerType: ${customerType || "—"}`));
        els.classificationPills.appendChild(pill(`industry: ${industry || "—"}`));
        els.classificationPills.appendChild(pill(`channel: ${channel || "—"}`));
    }

    function renderBusinessMeaning(customerType, industry, channel) {
        const parts = [];

        parts.push(`<b>Customer Type:</b> ${escapeHtml(customerType || "—")}<br/>`);
        parts.push(`<b>Sales Channel:</b> ${escapeHtml(channel || "—")}<br/>`);
        parts.push(`<b>Industry:</b> ${escapeHtml(industry || "—")}<br/><br/>`);

        const def = channelDefinitions[channel];
        if (def) {
            parts.push(`<b>${escapeHtml(def.title)}</b><br/>`);
            parts.push(`${escapeHtml(def.definition)}<br/><br/>`);
            parts.push(`<b>Primary contact:</b> ${escapeHtml(def.primaryContact)}<br/>`);
            if (def.mappedTypes?.length) {
                parts.push(`<b>Mapped customer types:</b> ${escapeHtml(def.mappedTypes.join(", "))}`);
            }
        } else {
            parts.push(`No standard channel definition found for <b>${escapeHtml(channel || "—")}</b>.`);
        }

        els.meaningBox.innerHTML = parts.join("");
    }

    function kvRow(k, v) {
        const row = document.createElement("div");
        row.className = "kv-row";
        const kk = document.createElement("div");
        kk.className = "kv-k";
        kk.textContent = k;
        const vv = document.createElement("div");
        vv.className = "kv-v";
        vv.textContent = v == null ? "—" : String(v);
        row.appendChild(kk);
        row.appendChild(vv);
        return row;
    }

    function pill(text) {
        const p = document.createElement("span");
        p.className = "pill";
        p.textContent = text;
        return p;
    }

    function buildSummaryPairs(obj, typeHint) {
        const pairs = [];
        const type = typeHint || guessType(obj);

        pairs.push(["Object Type", type || "—"]);

        if (obj.mdmCustomerId) pairs.push(["mdmCustomerId", obj.mdmCustomerId]);
        if (obj.mdmAccountId) pairs.push(["mdmAccountId", obj.mdmAccountId]);
        if (obj.contractId) pairs.push(["contractId", obj.contractId]);
        if (obj.billingProfileId) pairs.push(["billingProfileId", obj.billingProfileId]);
        if (obj.addressId) pairs.push(["addressId", obj.addressId]);
        if (obj.contactPersonId) pairs.push(["contactPersonId", obj.contactPersonId]);
        if (obj.platformId) pairs.push(["platformId", obj.platformId]);

        if (obj.officialName) pairs.push(["officialName", obj.officialName]);
        if (obj.tradingName) pairs.push(["tradingName", obj.tradingName]);

        if (obj.countryOfRegistration) pairs.push(["country", obj.countryOfRegistration]);
        if (obj.country) pairs.push(["country", obj.country]);

        if (obj.customerType) pairs.push(["customerType", obj.customerType]);
        if (obj.industrySector) pairs.push(["industry", obj.industrySector]);
        if (obj.customerLevel) pairs.push(["level", obj.customerLevel]);

        if (obj.salesChannel) pairs.push(["salesChannel", obj.salesChannel]);
        if (obj.salesManager) pairs.push(["salesManager", obj.salesManager]);

        if (obj.businessRoles) pairs.push(["roles", obj.businessRoles.join(", ")]);

        return pairs.slice(0, 10);
    }

    function guessType(obj) {
        if (obj.mdmAccountId) return "ACCOUNT";
        if (obj.mdmCustomerId) return "CUSTOMER";
        if (obj.contractId) return "CONTRACT";
        if (obj.billingProfileId) return "BILLING";
        if (obj.addressId) return "ADDRESS";
        if (obj.contactPersonId) return "CONTACT";
        if (obj.platformId) return "PLATFORM";
        return "OBJECT";
    }

    function buildReadable(obj) {
        const wrap = document.createElement("div");

        // Classification
        wrap.appendChild(section("Classification", [
            ["customerType", obj.customerType],
            ["customerLevel", obj.customerLevel],
            ["industrySector", obj.industrySector],
            ["salesChannel", obj.salesChannel],
            ["salesManager", obj.salesManager],
            ["country", obj.countryOfRegistration || obj.country],
        ]));

        // Identifiers
        wrap.appendChild(section("Identifiers", [
            ["mdmCustomerId", obj.mdmCustomerId],
            ["parentMdmCustomerId", obj.parentMdmCustomerId],
            ["mdmAccountId", obj.mdmAccountId],
            ["parentAccountId", obj.parentAccountId],
            ["contractId", obj.contractId],
            ["billingProfileId", obj.billingProfileId],
            ["addressId", obj.addressId],
            ["contactPersonId", obj.contactPersonId],
            ["platformId", obj.platformId],
        ]));

        // Names
        wrap.appendChild(section("Names", [
            ["officialName", obj.officialName],
            ["tradingName", obj.tradingName],
            ["contractName", obj.contractName],
            ["billingAccountNumber", obj.billingAccountNumber],
            ["city", obj.city],
            ["jobTitle", obj.jobTitle],
            ["name", obj.name],
        ]));

        // Communications (only if contact)
        if (Array.isArray(obj.communicationChannels)) {
            const items = obj.communicationChannels.map((c) => [`${c.type}`, c.value]);
            wrap.appendChild(section("Communication Channels", items));
        }

        return wrap;
    }

    function section(title, pairs) {
        const sec = document.createElement("div");
        sec.className = "section";

        const h = document.createElement("div");
        h.className = "section-title";
        h.textContent = title;
        sec.appendChild(h);

        (pairs || [])
            .filter(([, v]) => v != null && String(v).trim() !== "")
            .forEach(([k, v]) => {
                const item = document.createElement("div");
                item.className = "item";
                item.innerHTML = `<b>${escapeHtml(k)}</b>: ${escapeHtml(String(v))}`;
                sec.appendChild(item);
            });

        if (!sec.querySelector(".item")) {
            const empty = document.createElement("div");
            empty.className = "item";
            empty.innerHTML = `<b>—</b>: (no data)`;
            sec.appendChild(empty);
        }

        return sec;
    }

    function escapeHtml(str) {
        return (str || "").replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        }[m]));
    }

    // ---------- Tooltip ----------
    function showTooltip(event, nodeData) {
        const raw = nodeData.__raw || {};
        tooltip.style("opacity", 1);

        const rows = buildTooltipRows(raw, nodeData.__type);

        tooltip.html(`
      <h4>${escapeHtml(nodeData.__type)} · ${escapeHtml(nodeData.__title || "")}</h4>
      ${rows.map(r => `<div class="trow"><div class="tkey">${escapeHtml(r[0])}</div><div class="tval">${escapeHtml(r[1])}</div></div>`).join("")}
    `);

        const bounds = els.viz.getBoundingClientRect();
        const x = event.clientX - bounds.left + 12;
        const y = event.clientY - bounds.top + 12;
        tooltip.style("left", `${x}px`).style("top", `${y}px`);
    }

    function hideTooltip() {
        tooltip.style("opacity", 0);
    }

    function buildTooltipRows(raw, type) {
        const out = [];
        // key set prioritization
        const push = (k, v) => {
            if (v == null) return;
            const s = String(v);
            if (!s.trim()) return;
            out.push([k, s]);
        };

        if (type === "CUSTOMER" || type === "GLOBAL_CUSTOMER") {
            push("mdmCustomerId", raw.mdmCustomerId);
            push("officialName", raw.officialName);
            push("tradingName", raw.tradingName);
            push("customerType", raw.customerType);
            push("customerLevel", raw.customerLevel);
            push("industrySector", raw.industrySector);
            push("countryOfRegistration", raw.countryOfRegistration);
            push("globalGroupCode", raw.globalGroupCode);
        } else if (type === "ACCOUNT") {
            push("mdmAccountId", raw.mdmAccountId);
            push("roles", (raw.businessRoles || []).join(", "));
            push("salesChannel", raw.salesChannel);
            push("salesManager", raw.salesManager);
            push("currency", raw.currency);
            push("paymentTerms", raw.paymentTerms);
        } else if (type === "CONTRACT") {
            push("contractId", raw.contractId);
            push("contractName", raw.contractName);
            push("startDate", raw.startDate);
            if (raw.contractDetail?.contractType) push("contractType", raw.contractDetail.contractType);
            if (raw.contractDetail?.services) push("services", raw.contractDetail.services.join(", "));
        } else if (type === "BILLING") {
            push("billingProfileId", raw.billingProfileId);
            push("billingAccountNumber", raw.billingAccountNumber);
            push("billingCurrency", raw.billingCurrency);
            push("invoiceDelivery", raw.invoiceDelivery);
            if (raw.paymentMethod?.type) push("paymentMethod", raw.paymentMethod.type);
        } else if (type === "ADDRESS") {
            push("addressId", raw.addressId);
            push("addressType", raw.addressType);
            push("street", `${raw.street || ""} ${raw.houseNumber || ""}`.trim());
            push("city", raw.city);
            push("postalcode", raw.postalcode);
            push("country", raw.country);
        } else if (type === "CONTACT") {
            push("contactPersonId", raw.contactPersonId);
            push("name", `${raw.firstName || ""} ${raw.lastName || ""}`.trim());
            push("jobTitle", raw.jobTitle);
            // summarize channels
            if (Array.isArray(raw.communicationChannels)) {
                raw.communicationChannels.forEach((c) => push(c.type, c.value));
            }
        } else if (type === "PLATFORM") {
            push("platformId", raw.platformId);
            push("name", raw.name);
            push("type", raw.type);
            push("provider", raw.provider);
        }

        // cap
        return out.slice(0, 14).map(([k, v]) => [k, v]);
    }

})(); 