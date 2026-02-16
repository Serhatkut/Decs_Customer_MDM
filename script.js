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
        meaningBox: document.getElementById("meaningBox"),
        objectSummary: document.getElementById("objectSummary"),
        readableJson: document.getElementById("readableJson"),
        rawJson: document.getElementById("rawJson"),

        legend: document.getElementById("legend"),
        viz: document.getElementById("viz"),
    };

    // ---- state ----
    let ref = null;
    let dataset = [];
    let currentScenario = null;

    // Legend hide/show
    let hiddenTypes = new Set();

    // Collapse state (stable keys: TYPE:ID)
    let collapsedKeys = new Set();

    // D3
    let svg, rootG, zoom, tooltip, resizeObs;

    // Fit scheduling
    let fitRequested = false;

    // ---------- channel definitions ----------
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
            ref = reference || null;

            initScenarioSelector(dataset);
            initFilters(reference);

            initD3();
            bindUI();

            // ensure dropdown is consistent with default filters
            filterScenarioListByTopFilters(true);

            // default scenario (prefer Relationship Customers if present)
            if (dataset.length) {
                const preferred =
                    dataset.find(s => s?.customer?.customerType === "RELATIONSHIP_CUSTOMERS") ||
                    dataset.find(s => (s?.scenarioName || "").toLowerCase().includes("relationship")) ||
                    dataset[0];

                const preferredName =
                    preferred?.scenarioName ||
                    (dataset[0]?.scenarioName ?? "");

                if (preferredName) {
                    els.scenarioSelector.value = preferredName;
                    setScenario(preferredName, { fit: true });
                }
            }
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
    function initScenarioSelector(data, keepSelection = null) {
        const sel = keepSelection ?? els.scenarioSelector.value ?? "";
        els.scenarioSelector.innerHTML = "";

        data.forEach((s, i) => {
            const opt = document.createElement("option");
            opt.value = s.scenarioName || `Scenario ${i + 1}`;
            opt.textContent = s.scenarioName || `Scenario ${i + 1}`;
            els.scenarioSelector.appendChild(opt);
        });

        if (sel && Array.from(els.scenarioSelector.options).some((o) => o.value === sel)) {
            els.scenarioSelector.value = sel;
        } else if (els.scenarioSelector.options.length) {
            els.scenarioSelector.value = els.scenarioSelector.options[0].value;
        }
    }

    function initFilters(reference) {
        const domains = (reference && reference.domains) || {};
        fillSelect(els.filterCustomerType, ["", ...((domains.customerType) || [])], "All");
        fillSelect(els.filterIndustry, ["", ...((domains.industrySector) || [])], "All");
        fillSelect(els.filterSalesChannel, ["", ...((domains.salesChannel) || [])], "All");
        els.dqDot.style.background = "#9ca3af";
        els.dqText.textContent = "DQ: N/A";
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
        els.scenarioSelector.addEventListener("change", () => {
            setScenario(els.scenarioSelector.value, { fit: true, keepCollapse: true });
        });

        const onFilterChange = () => {
            filterScenarioListByTopFilters(false);
            applyDQAndMeaning();
            requestFit(true);
            render();
        };

        els.filterCustomerType.addEventListener("change", onFilterChange);
        els.filterIndustry.addEventListener("change", onFilterChange);
        els.filterSalesChannel.addEventListener("change", onFilterChange);

        els.clearFilters.addEventListener("click", () => {
            els.filterCustomerType.value = "";
            els.filterIndustry.value = "";
            els.filterSalesChannel.value = "";
            onFilterChange();
        });

        els.toggleInspector.addEventListener("click", () => {
            els.inspector.classList.toggle("is-collapsed");
            // width transition in CSS -> re-fit after it settles
            requestFit(true);
            setTimeout(() => requestFit(true), 260);
            render();
        });

        els.collapseAll.addEventListener("click", () => {
            if (!currentScenario) return;
            const tree = buildTreeForScenario(currentScenario);
            collapsedKeys = new Set();
            walk(tree.data, (n) => {
                if (n.__depth >= 1 && n.__hasChildrenOriginal) collapsedKeys.add(n.__stableKey);
            });
            requestFit(true);
            render();
        });

        els.expandAll.addEventListener("click", () => {
            collapsedKeys = new Set();
            requestFit(true);
            render();
        });

        els.resetView.addEventListener("click", () => {
            requestFit(true);
            render();
        });
    }

    function requestFit(force = false) {
        fitRequested = true;
        scheduleZoomToFit(force);
    }

    // ---------- Scenario filtering ----------
    function filterScenarioListByTopFilters(isBoot) {
        const t = els.filterCustomerType.value;
        const i = els.filterIndustry.value;
        const c = els.filterSalesChannel.value;

        const filtered = dataset.filter((s) => {
            const cust = s.customer || {};
            const okT = t ? cust.customerType === t : true;
            const okI = i ? cust.industrySector === i : true;
            const okC = c ? (s.accounts || []).some((a) => a.salesChannel === c) : true;
            return okT && okI && okC;
        });

        const prevSelected = els.scenarioSelector.value;
        initScenarioSelector(filtered.length ? filtered : dataset, prevSelected);

        const stillExists = Array.from(els.scenarioSelector.options).some((o) => o.value === prevSelected);
        if (!stillExists && !isBoot) {
            const next = els.scenarioSelector.options[0]?.value || "";
            if (next) setScenario(next, { fit: true, keepCollapse: true });
        }
    }

    // ---------- scenario selection ----------
    function setScenario(name, opts = {}) {
        const { fit = false, keepCollapse = false } = opts;

        currentScenario = dataset.find((s) => s.scenarioName === name) || dataset[0] || null;
        hiddenTypes = new Set();
        if (!keepCollapse) collapsedKeys = new Set();

        renderLegend();
        applyDQAndMeaning();
        render();

        // default inspector selection
        setSelectedObject(null, currentScenario);

        // IMPORTANT: defer the first fit so layout has real sizes (prevents initial jump/vanish)
        if (fit) setTimeout(() => requestFit(true), 0);
    }

    function applyDQAndMeaning() {
        if (!currentScenario) return;

        const t = els.filterCustomerType.value;
        const i = els.filterIndustry.value;
        const c = els.filterSalesChannel.value;

        const rootCustomer = currentScenario.customer || {};
        const okT = t ? rootCustomer.customerType === t : true;
        const okI = i ? rootCustomer.industrySector === i : true;
        const okC = c ? (currentScenario.accounts || []).some((a) => a.salesChannel === c) : true;

        const ok = okT && okI && okC;
        els.dqDot.style.background = ok ? "#22c55e" : "#f59e0b";
        els.dqText.textContent = ok ? "DQ: OK" : "DQ: CHECK";

        const ct = t || rootCustomer.customerType || "—";
        const ind = i || rootCustomer.industrySector || "—";
        const ch = c || pickDominantChannel(currentScenario) || "—";
        renderBusinessMeaning(ct, ind, ch);
        renderClassificationPills(ct, ind, ch);
    }

    function pickDominantChannel(scenario) {
        const counts = new Map();
        (scenario?.accounts || []).forEach((a) => {
            if (!a.salesChannel) return;
            counts.set(a.salesChannel, (counts.get(a.salesChannel) || 0) + 1);
        });
        let best = null, bestN = -1;
        for (const [k, v] of counts.entries()) {
            if (v > bestN) { bestN = v; best = k; }
        }
        return best;
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
                requestFit(true);
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

        // Keep svg sized to the canvas; prevents the initial “tiny svg -> wrong fit” jump.
        const resizeSvg = () => {
            const w = els.viz.clientWidth;
            const h = els.viz.clientHeight;
            if (!w || !h) return;
            svg.attr("width", w).attr("height", h);
        };

        resizeSvg();

        // React to layout changes (header/footer/inspector collapse)
        if (resizeObs) {
            try { resizeObs.disconnect(); } catch (_) { }
        }
        resizeObs = new ResizeObserver(() => {
            resizeSvg();
            requestFit(true);
        });
        resizeObs.observe(els.viz);

        // Fallback window resize
        window.addEventListener(
            "resize",
            () => {
                resizeSvg();
                requestFit(true);
            },
            { passive: true }
        );

        zoom = d3.zoom()
            .scaleExtent([0.2, 3.2])
            .on("zoom", (event) => rootG.attr("transform", event.transform));
        svg.call(zoom);
        svg.style("user-select", "none");

        tooltip = d3
            .select("#viz")
            .append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);
    }

    function render() {
        if (!currentScenario) return;

        const tree = buildTreeForScenario(currentScenario);
        const root = d3.hierarchy(tree.data, (d) => d.children);

        const CARD_W = 250;
        const CARD_H = 88;

        // Extra spacing to avoid overlap
        const layout = d3.tree().nodeSize([CARD_W + 80, CARD_H + 72]);
        layout(root);

        rootG.selectAll("*").remove();

        // defs for clipPaths (prevents any label overflow outside cards)
        const defs = rootG.append("defs");

        const isHidden = (node) => hiddenTypes.has(node.data.__type);

        // LINKS: only if both ends visible
        const visibleLinks = root.links().filter((l) => !isHidden(l.source) && !isHidden(l.target));

        rootG
            .selectAll(".link")
            .data(visibleLinks)
            .enter()
            .append("path")
            .attr("class", "link")
            .attr("fill", "none")
            .attr("d", (d) => {
                const sx = d.source.x, sy = d.source.y;
                const tx = d.target.x, ty = d.target.y;
                const midY = (sy + ty) / 2;
                return `M${sx},${sy} L${sx},${midY} L${tx},${midY} L${tx},${ty}`;
            });

        // NODES: only visible types
        const visibleNodes = root.descendants().filter((n) => !isHidden(n));

        // Per-node clip path to prevent any label overflow outside cards
        visibleNodes.forEach((n) => {
            const id = `clip-${cssSafeId(n.data.__stableKey)}`;
            defs
                .append("clipPath")
                .attr("id", id)
                .append("rect")
                .attr("x", -CARD_W / 2 + 10)
                .attr("y", -CARD_H / 2 + 10)
                .attr("width", CARD_W - 20)
                .attr("height", CARD_H - 20)
                .attr("rx", 12)
                .attr("ry", 12);

            // store on node for use in text selections
            n.data.__clipId = id;
        });

        const nodes = rootG
            .selectAll(".node")
            .data(visibleNodes, (d) => d.data.__stableKey)
            .enter()
            .append("g")
            .attr("class", (d) => `node node--${d.data.__type}`)
            .attr("transform", (d) => `translate(${d.x},${d.y})`)
            .on("mousemove", (event, d) => showTooltip(event, d.data))
            .on("mouseout", hideTooltip);

        nodes
            .append("rect")
            .attr("x", -CARD_W / 2)
            .attr("y", -CARD_H / 2)
            .attr("width", CARD_W)
            .attr("height", CARD_H);

        nodes.select("rect")
            .style("cursor", (d) => (d.data.__type === "CHILD_ACCOUNTS_GROUP" ? "default" : "pointer"))
            .on("click", (event, d) => {
                if (d.data.__type === "CHILD_ACCOUNTS_GROUP") return;
                setSelectedObject(d.data.__raw, currentScenario, d.data.__type);
            });

        // PLUS/MINUS toggle with a generous hitbox (prevents label overlap from blocking clicks)
        const pm = nodes
            .append("g")
            .attr("class", "pmg")
            .style("pointer-events", "all")
            .style("cursor", (d) => (d.data.__hasChildrenOriginal ? "pointer" : "default"))
            .on("click", (event, d) => {
                event.stopPropagation();
                if (d.data.__type === "CHILD_ACCOUNTS_GROUP") return;
                if (!d.data.__hasChildrenOriginal) return;

                if (collapsedKeys.has(d.data.__stableKey)) collapsedKeys.delete(d.data.__stableKey);
                else collapsedKeys.add(d.data.__stableKey);

                requestFit(true);
                render();
            });

        // transparent hitbox
        pm.append("rect")
            .attr("class", "pm-hit")
            .attr("x", CARD_W / 2 - 38)
            .attr("y", -CARD_H / 2 + 6)
            .attr("width", 32)
            .attr("height", 32)
            .attr("rx", 8)
            .attr("ry", 8)
            .attr("fill", "transparent");

        // the visible +/- glyph
        pm.append("text")
            .attr("class", "pm")
            .attr("x", CARD_W / 2 - 21)
            .attr("y", -CARD_H / 2 + 26)
            .attr("text-anchor", "middle")
            .text((d) => {
                if (d.data.__type === "CHILD_ACCOUNTS_GROUP") return "";
                return d.data.__hasChildrenOriginal ? (collapsedKeys.has(d.data.__stableKey) ? "+" : "−") : "";
            })
            .style("pointer-events", "none");

        // Title line with icon (icon larger) + truncation for long titles
        const titleText = nodes
            .append("text")
            .attr("class", "node-title")
            .attr("text-anchor", "middle")
            .attr("dy", "-18")
            .style("clip-path", (d) => `url(#${d.data.__clipId})`)
            .style("pointer-events", "none");

        titleText.each(function (d) {
            const el = d3.select(this);
            el.selectAll("*").remove();

            // icon
            el.append("tspan")
                .attr("class", "node-icon")
                .style("font-size", "15px")
                .text(`${d.data.__icon} `);

            // title
            const t = el.append("tspan")
                .attr("class", "node-title-text")
                .style("font-size", "13px")
                .style("font-weight", 800)
                .text(d.data.__title || "");

            // Truncate title to available width (leave room for icon)
            const maxPx = (CARD_W - 78);
            truncateSvgTextToWidth(t.node(), maxPx);
        });

        // Key attribute lines (2 lines) with truncation
        const k1Text = nodes
            .append("text")
            .attr("class", "node-k1")
            .attr("text-anchor", "middle")
            .attr("dy", "4")
            .style("font-weight", 800)
            .style("font-size", "11px")
            .style("clip-path", (d) => `url(#${d.data.__clipId})`)
            .style("pointer-events", "none")
            .text((d) => d.data.__k1 || "");

        k1Text.each(function (d) {
            const str = d.data.__k1 || "";
            const maxPx = (CARD_W - 22);
            truncateSvgTextToWidth(this, maxPx, shouldMiddleTruncate(str));
        });

        const k2Text = nodes
            .append("text")
            .attr("class", "node-k2")
            .attr("text-anchor", "middle")
            .attr("dy", "22")
            .style("font-weight", 800)
            .style("font-size", "11px")
            .style("clip-path", (d) => `url(#${d.data.__clipId})`)
            .style("pointer-events", "none")
            .text((d) => d.data.__k2 || "");

        k2Text.each(function (d) {
            const str = d.data.__k2 || "";
            const maxPx = (CARD_W - 22);
            truncateSvgTextToWidth(this, maxPx, shouldMiddleTruncate(str));
        });

        // Fit after render if requested
        if (fitRequested) {
            fitRequested = false;
            scheduleZoomToFit(true);
        }

        applyDimming(nodes);
    }

    function applyDimming(nodesSel) {
        const t = els.filterCustomerType.value;
        const i = els.filterIndustry.value;
        const c = els.filterSalesChannel.value;

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
            return false;
        });
    }

    // ---------- Zoom-to-fit scheduling ----------
    function scheduleZoomToFit(force = false) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                zoomToFit(force);
            });
        });
    }

    function zoomToFit(force = false) {
        const g = rootG?.node?.();
        if (!g) return;

        const vw = els.viz.clientWidth;
        const vh = els.viz.clientHeight;

        // If layout not ready yet, retry next frame
        if (!vw || !vh || vw < 80 || vh < 80) {
            scheduleZoomToFit(true);
            return;
        }
        svg.attr("width", vw).attr("height", vh);

        const bbox = g.getBBox();
        if (!bbox || bbox.width === 0 || bbox.height === 0) {
            scheduleZoomToFit(true);
            return;
        }

        const pad = 140;
        const scale = Math.min(vw / (bbox.width + pad), vh / (bbox.height + pad), 2.0) * 1.3;
        const tx = vw / 2 - (bbox.x + bbox.width / 2) * scale;
        const ty = vh / 2 - (bbox.y + bbox.height / 2) * scale;

        const t = d3.zoomIdentity.translate(tx, ty).scale(scale);
        svg.interrupt();
        svg.transition().duration(force ? 320 : 220).call(zoom.transform, t);
    }

    // ---------- tree builder ----------
    function buildTreeForScenario(scenario) {
        const rootCustomer = scenario.customer || {};
        const hasMultiCountry = Array.isArray(scenario.relatedCustomers) && scenario.relatedCustomers.length >= 2;
        const isStrategic =
            rootCustomer.customerType === "STRATEGIC_CUSTOMERS" || rootCustomer.customerLevel === "STRATEGIC";

        // Not everyone is global: only strategic + multi-country
        const rootNode =
            isStrategic && hasMultiCountry
                ? makeNode(
                    "GLOBAL_CUSTOMER",
                    stableKey("GLOBAL_CUSTOMER", rootCustomer.mdmCustomerId || "GLOBAL"),
                    rootCustomer.tradingName || rootCustomer.officialName || "Global Customer",
                    rootCustomer
                )
                : makeNode(
                    "CUSTOMER",
                    stableKey("CUSTOMER", rootCustomer.mdmCustomerId || "CUSTOMER"),
                    rootCustomer.tradingName || rootCustomer.officialName || "Customer",
                    rootCustomer
                );

        const accounts = scenario.accounts || [];

        const byParent = new Map();
        accounts.forEach((a) => {
            const p = a.parentAccountId || "__ROOT__";
            if (!byParent.has(p)) byParent.set(p, []);
            byParent.get(p).push(a);
        });

        const attachAccountsForCustomer = (custId, parentNode) => {
            const roots = accounts.filter((a) => a.mdmCustomerId === custId && !a.parentAccountId);
            roots.forEach((acc) => parentNode.children.push(buildAccountSubtree(acc, byParent)));
        };

        if (rootNode.__type === "GLOBAL_CUSTOMER") {
            (scenario.relatedCustomers || []).forEach((rc) => {
                const cn = makeNode(
                    "CUSTOMER",
                    stableKey("CUSTOMER", rc.mdmCustomerId),
                    rc.tradingName || rc.officialName || "Country Customer",
                    rc
                );
                attachAccountsForCustomer(rc.mdmCustomerId, cn);
                rootNode.children.push(cn);
            });

            attachAccountsForCustomer(rootCustomer.mdmCustomerId, rootNode);
        } else {
            attachAccountsForCustomer(rootCustomer.mdmCustomerId, rootNode);
        }

        markDepth(rootNode, 0);
        markHasChildrenOriginal(rootNode);
        applyCollapse(rootNode);

        return { data: rootNode };
    }

    function buildAccountSubtree(acc, byParent) {
        const node = makeNode("ACCOUNT", stableKey("ACCOUNT", acc.mdmAccountId), acc.tradingName || acc.mdmAccountId, acc);

        (acc.contactPersons || []).forEach((c) => {
            const nm = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.contactPersonId;
            node.children.push(makeNode("CONTACT", stableKey("CONTACT", c.contactPersonId || nm), nm, c));
        });

        (acc.addresses || []).forEach((a) => {
            const nm = `${a.addressType || "ADDRESS"} · ${a.city || ""}`.trim();
            node.children.push(makeNode("ADDRESS", stableKey("ADDRESS", a.addressId || nm), nm, a));
        });

        if (acc.platformObject) {
            const p = acc.platformObject;
            node.children.push(
                makeNode("PLATFORM", stableKey("PLATFORM", p.platformId || p.name || "PLATFORM"), p.name || "Platform", p)
            );
        }

        (acc.contracts || []).forEach((c) => {
            const cn = makeNode("CONTRACT", stableKey("CONTRACT", c.contractId), c.contractName || "Contract", c);

            if (c.billingProfile) {
                const b = c.billingProfile;
                cn.children.push(
                    makeNode(
                        "BILLING",
                        stableKey("BILLING", b.billingProfileId || b.billingAccountNumber || "BILLING"),
                        b.billingAccountNumber || "Billing Profile",
                        b
                    )
                );
            }

            (c.contactPersons || []).forEach((cp) => {
                const nm = `${cp.firstName || ""} ${cp.lastName || ""}`.trim() || cp.contactPersonId;
                cn.children.push(makeNode("CONTACT", stableKey("CONTACT", cp.contactPersonId || nm), nm, cp));
            });

            (c.addresses || []).forEach((ad) => {
                const nm = `${ad.addressType || "ADDRESS"} · ${ad.city || ""}`.trim();
                cn.children.push(makeNode("ADDRESS", stableKey("ADDRESS", ad.addressId || nm), nm, ad));
            });

            node.children.push(cn);
        });

        // Child accounts: render as a separate lane (one depth deeper) to avoid mixing
        // account-owned objects (contacts/addresses/contracts/platform) with the hierarchy.
        const kids = byParent.get(acc.mdmAccountId) || [];
        if (kids.length) {
            const group = makeNode(
                "CHILD_ACCOUNTS_GROUP",
                stableKey("CHILD_ACCOUNTS_GROUP", acc.mdmAccountId),
                "Child accounts",
                { parentAccountId: acc.mdmAccountId }
            );
            kids.forEach((k) => group.children.push(buildAccountSubtree(k, byParent)));
            node.children.push(group);
        }

        return node;
    }

    function stableKey(type, id) {
        return `${type}:${String(id || "").trim()}`;
    }

    function markDepth(node, d) {
        node.__depth = d;
        (node.children || []).forEach((c) => markDepth(c, d + 1));
    }

    // Preserve original child-existence so +/- stays available after “Collapse All”
    function markHasChildrenOriginal(node) {
        node.__hasChildrenOriginal = Array.isArray(node.children) && node.children.length > 0;
        (node.children || []).forEach(markHasChildrenOriginal);
    }

    function applyCollapse(node) {
        const hasChildrenNow = Array.isArray(node.children) && node.children.length > 0;
        const hasSaved = Array.isArray(node.__savedChildren) && node.__savedChildren.length > 0;

        if (!collapsedKeys.has(node.__stableKey) && !hasChildrenNow && hasSaved) {
            node.children = node.__savedChildren;
            node.__savedChildren = null;
        }

        if (collapsedKeys.has(node.__stableKey) && hasChildrenNow) {
            node.__savedChildren = node.children;
            node.children = [];
        }

        (node.children || []).forEach(applyCollapse);
    }

    function makeNode(type, stableKeyValue, title, raw) {
        const r = raw || {};
        const icon = iconForType(type);
        const { k1, k2 } = keyAttrs(type, r);

        return {
            __type: type,
            __stableKey: stableKeyValue,
            __title: title || stableKeyValue,
            __raw: r,
            __icon: icon,
            __k1: k1,
            __k2: k2,
            children: [],
            __depth: 0,
            __hasChildrenOriginal: false,
            __savedChildren: null,
        };
    }

    function iconForType(type) {
        switch (type) {
            case "GLOBAL_CUSTOMER": return "🌐";
            case "CUSTOMER": return "🏢";
            case "ACCOUNT": return "🧾";
            case "CONTRACT": return "📄";
            case "BILLING": return "💳";
            case "ADDRESS": return "📍";
            case "CONTACT": return "👤";
            case "PLATFORM": return "🧩";
            case "CHILD_ACCOUNTS_GROUP": return "↧";
            default: return "•";
        }
    }

    function keyAttrs(type, r) {
        if (type === "GLOBAL_CUSTOMER" || type === "CUSTOMER") {
            return {
                k1: `mdmCustomerId: ${r.mdmCustomerId || "—"}`,
                k2: `${r.customerType || "—"} · ${(r.countryOfRegistration || r.country || "—")}`,
            };
        }
        if (type === "CHILD_ACCOUNTS_GROUP") {
            return { k1: "Child accounts", k2: "" };
        }
        if (type === "ACCOUNT") {
            const roles = (r.businessRoles || []).join(", ");
            return { k1: `roles: ${roles || "—"}`, k2: `channel: ${r.salesChannel || "—"}` };
        }
        if (type === "CONTRACT") {
            return { k1: `contractId: ${r.contractId || "—"}`, k2: `start: ${r.startDate || "—"}` };
        }
        if (type === "BILLING") {
            return { k1: `currency: ${r.billingCurrency || "—"}`, k2: `delivery: ${r.invoiceDelivery || "—"}` };
        }
        if (type === "ADDRESS") {
            return {
                k1: `${r.addressType || "ADDRESS"} · ${r.city || "—"}`,
                k2: `${r.country || "—"} · ${r.postalcode || "—"}`,
            };
        }
        if (type === "CONTACT") {
            const name = `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—";
            return { k1: name, k2: `${r.jobTitle || "—"}` };
        }
        if (type === "PLATFORM") {
            return { k1: `${r.type || "—"}`, k2: `${r.provider || "—"}` };
        }
        return { k1: "", k2: "" };
    }

    function walk(node, fn) {
        fn(node);
        (node.children || []).forEach((c) => walk(c, fn));
        if (node.__savedChildren) node.__savedChildren.forEach((c) => walk(c, fn));
    }

    // ---------- inspector / readable JSON ----------
    function setSelectedObject(raw, scenario, typeHint) {
        const obj = raw || (scenario ? scenario.customer : null) || {};

        const ct = obj.customerType || scenario?.customer?.customerType || "—";
        const ind = obj.industrySector || scenario?.customer?.industrySector || "—";
        const ch = obj.salesChannel || pickDominantChannel(scenario) || "—";

        renderClassificationPills(ct, ind, ch);
        renderBusinessMeaning(ct, ind, ch);

        els.objectSummary.innerHTML = "";
        buildSummaryPairs(obj, typeHint).forEach(([k, v]) => els.objectSummary.appendChild(kvRow(k, v)));

        els.readableJson.innerHTML = "";
        els.readableJson.appendChild(buildReadable(obj));
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
            if (def.mappedTypes?.length) parts.push(`<b>Mapped customer types:</b> ${escapeHtml(def.mappedTypes.join(", "))}`);
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

        return pairs.slice(0, 12);
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
        wrap.appendChild(
            section("Classification", [
                ["customerType", obj.customerType],
                ["customerLevel", obj.customerLevel],
                ["industrySector", obj.industrySector],
                ["salesChannel", obj.salesChannel],
                ["salesManager", obj.salesManager],
                ["country", obj.countryOfRegistration || obj.country],
            ])
        );
        wrap.appendChild(
            section("Identifiers", [
                ["mdmCustomerId", obj.mdmCustomerId],
                ["parentMdmCustomerId", obj.parentMdmCustomerId],
                ["mdmAccountId", obj.mdmAccountId],
                ["parentAccountId", obj.parentAccountId],
                ["contractId", obj.contractId],
                ["billingProfileId", obj.billingProfileId],
                ["addressId", obj.addressId],
                ["contactPersonId", obj.contactPersonId],
                ["platformId", obj.platformId],
            ])
        );
        wrap.appendChild(
            section("Names / Labels", [
                ["officialName", obj.officialName],
                ["tradingName", obj.tradingName],
                ["contractName", obj.contractName],
                ["billingAccountNumber", obj.billingAccountNumber],
                ["city", obj.city],
                ["jobTitle", obj.jobTitle],
                ["name", obj.name],
            ])
        );

        if (Array.isArray(obj.communicationChannels)) {
            const items = obj.communicationChannels.map((c) => [c.type, c.value]);
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
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
        }[m]));
    }

    // ---------- Tooltip ----------
    function showTooltip(event, nodeData) {
        const raw = nodeData.__raw || {};
        tooltip.style("opacity", 1);

        const rows = buildTooltipRows(raw, nodeData.__type);
        tooltip.html(`
      <h4>${escapeHtml(nodeData.__type)} · ${escapeHtml(nodeData.__title || "")}</h4>
      ${rows.map((r) => `<div class="trow"><div class="tkey">${escapeHtml(r[0])}</div><div class="tval">${escapeHtml(r[1])}</div></div>`).join("")}
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
            if (Array.isArray(raw.communicationChannels)) raw.communicationChannels.forEach((c) => push(c.type, c.value));
        } else if (type === "PLATFORM") {
            push("platformId", raw.platformId);
            push("name", raw.name);
            push("type", raw.type);
            push("provider", raw.provider);
        }
        return out.slice(0, 16);
    }

    // ---------- SVG text truncation helpers (prevents label overflow) ----------
    function shouldMiddleTruncate(str) {
        // Middle-truncate IDs and codes; end-truncate human text.
        const s = String(str || "");
        return (
            s.includes("mdmCustomerId") ||
            s.includes("mdmAccountId") ||
            s.includes("contractId") ||
            s.includes("billingProfileId") ||
            s.includes("CUST-") ||
            s.includes("ACC-") ||
            s.includes("CON-") ||
            s.includes("BPROF-") ||
            s.includes("PLT-")
        );
    }

    function truncateSvgTextToWidth(textNode, maxPx, middle = false) {
        if (!textNode) return;
        const full = (textNode.textContent || "").trim();
        if (!full) return;

        // If already fits, nothing to do.
        try {
            if (textNode.getComputedTextLength() <= maxPx) return;
        } catch (_) {
            return;
        }

        const ell = "…";
        const minKeep = 6;

        const setText = (s) => {
            textNode.textContent = s;
        };

        if (!middle) {
            // End truncation
            let lo = 0;
            let hi = full.length;
            let best = "";
            while (lo <= hi) {
                const midLen = (lo + hi) >> 1;
                const candidate = full.slice(0, Math.max(0, midLen)) + ell;
                setText(candidate);
                const w = textNode.getComputedTextLength();
                if (w <= maxPx) {
                    best = candidate;
                    lo = midLen + 1;
                } else {
                    hi = midLen - 1;
                }
            }
            setText(best || (full.slice(0, Math.max(0, minKeep)) + ell));
            return;
        }

        // Middle truncation (keeps both ends, good for IDs)
        let leftKeep = Math.max(minKeep, Math.floor(full.length / 2) - 1);
        let rightKeep = Math.max(minKeep, Math.floor(full.length / 2) - 1);

        const makeMid = (l, r) => {
            const a = full.slice(0, Math.max(0, l));
            const b = full.slice(Math.max(0, full.length - r));
            return a + ell + b;
        };

        // Start from a reasonable split and shrink until it fits.
        let candidate = makeMid(leftKeep, rightKeep);
        setText(candidate);

        // Guard loop
        let guard = 0;
        while (guard++ < 80 && textNode.getComputedTextLength() > maxPx && (leftKeep + rightKeep) > (minKeep * 2)) {
            if (leftKeep > rightKeep) leftKeep -= 1;
            else rightKeep -= 1;
            candidate = makeMid(leftKeep, rightKeep);
            setText(candidate);
        }

        // If still too wide, fall back to end truncation.
        if (textNode.getComputedTextLength() > maxPx) {
            setText(full);
            truncateSvgTextToWidth(textNode, maxPx, false);
        }
    }
    // Helper to make a CSS-safe id for use in clipPath URLs
    function cssSafeId(s) {
        return String(s || "")
            .replace(/[^a-zA-Z0-9_-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
    }

})();