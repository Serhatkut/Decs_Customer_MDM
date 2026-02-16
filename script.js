"use strict";

const PATHS = { customers: "./data/customerData.json", reference: "./data/reference_master_data.json", colors: "./data/reference_colors.json" };
const L = { nodeW: 300, nodeH: 140, headerH: 32, gapX: 80, gapY: 40 };

let state = { scenarios: [], refEnums: {}, refColors: {}, activeScenario: null, collapsed: new Set() };
let svg, g, zoom, treeLayout;

// --- 1. DQ ENGINE (Audit) ---
const auditNode = (node) => {
    if (node.type !== "ACCOUNT") return { ok: true };
    const mandatory = state.refEnums.rules?.mandatoryForAccount || [];
    const missing = mandatory.filter(field => !node.data[field]);
    return { ok: missing.length === 0, missing };
};

// --- 2. DATA LOAD & BOOT ---
async function boot() {
    try {
        const [cust, ref, colors] = await Promise.all([
            fetch(PATHS.customers).then(r => r.json()),
            fetch(PATHS.reference).then(r => r.json()),
            fetch(PATHS.colors).then(r => r.json())
        ]);
        state.scenarios = cust; state.refEnums = ref; state.refColors = colors;
        initUI();
        loadScenario(0);
    } catch (e) { console.error("Boot Error:", e); }
}

// --- 3. VIZ CORE ---
function initUI() {
    const viz = d3.select("#viz-container");
    svg = viz.append("svg").attr("width", "100%").attr("height", "100%");
    g = svg.append("g");

    zoom = d3.zoom().scaleExtent([0.1, 3]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);

    // Filter Listeners
    d3.select("#scenarioSelector").on("change", (e) => loadScenario(e.target.value));
    populateDropdowns();
}

function loadScenario(index) {
    state.activeScenario = state.scenarios[index];
    render();
}

function render() {
    g.selectAll("*").remove();
    const data = buildTree(state.activeScenario);
    const root = d3.hierarchy(data);

    const tree = d3.tree().nodeSize([L.nodeW + L.gapX, L.nodeH + L.gapY]);
    tree(root);

    // Links
    g.selectAll(".link")
        .data(root.links())
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x + L.nodeW / 2).y(d => d.y));

    // Nodes
    const nodes = g.selectAll(".node-group")
        .data(root.descendants())
        .enter().append("g")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .on("click", (e, d) => updateInspector(d.data));

    nodes.each(function (d) {
        const audit = auditNode(d.data);
        const el = d3.select(this);
        const semantic = getSemanticColors(d.data.type);

        // Card Base
        el.append("rect")
            .attr("width", L.nodeW).attr("height", L.nodeH)
            .attr("rx", 6).attr("fill", "#1c1c1f")
            .attr("stroke", audit.ok ? "#333" : "#D40511")
            .attr("stroke-width", audit.ok ? 1 : 2);

        // Card Header
        el.append("rect")
            .attr("width", L.nodeW).attr("height", L.headerH)
            .attr("rx", 6).attr("fill", semantic.header);

        // Title
        el.append("text")
            .attr("x", 12).attr("y", 20).attr("fill", "#fff").style("font-weight", "bold").style("font-size", "11px")
            .text(d.data.label);

        // Details
        const lines = d.data.lines || [];
        el.append("text")
            .attr("x", 12).attr("y", 50).attr("fill", "#a8a8b3").style("font-size", "10px")
            .selectAll("tspan").data(lines).enter().append("tspan")
            .attr("x", 12).attr("dy", "1.2em").text(l => l);
    });

    zoomToFit();
}

// --- 4. HELPERS ---
function getSemanticColors(type) {
    const mapping = state.refColors.semanticMapping[type] || state.refColors.semanticMapping.ACCOUNT;
    const findHex = (token) => {
        let hex = "#333";
        const walk = (obj) => {
            if (obj.token === token) hex = obj.hex;
            else if (typeof obj === 'object') Object.values(obj).forEach(walk);
        };
        walk(state.refColors);
        return hex;
    };
    return { header: findHex(mapping.header), body: findHex(mapping.body) };
}

function updateInspector(node) {
    const audit = auditNode(node);
    const container = d3.select("#inspectorContent");
    container.html(`
        <div class="audit-status ${audit.ok ? 'ok' : 'fail'}">
            ${audit.ok ? '✅ Validated' : '❌ DQ Issues Detected'}
        </div>
        <div class="meta-row"><strong>ID:</strong> ${node._id}</div>
        <div class="meta-row"><strong>Type:</strong> ${node.type}</div>
        ${!audit.ok ? `<div class="error-box">Missing: ${audit.missing.join(", ")}</div>` : ''}
        <pre class="json-peek">${JSON.stringify(node.data, null, 2)}</pre>
    `);
}

function zoomToFit() {
    const bounds = g.node().getBBox();
    const fullWidth = svg.node().clientWidth, fullHeight = svg.node().clientHeight;
    const scale = 0.85 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight);
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(fullWidth / 2 - scale * (bounds.x + bounds.width / 2), fullHeight / 2 - scale * (bounds.y + bounds.height / 2)).scale(scale));
}

// Data mapping logic (buildTree, populateDropdowns, etc.) stays consistent with previous architectural patterns.
boot();