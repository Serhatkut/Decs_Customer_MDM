let masterData = [];
const nodeW = 200; // Slightly wider for long names
const nodeH = 60;

fetch('customerData.json')
    .then(res => res.json())
    .then(data => {
        masterData = data;
        const sel = document.getElementById('scenarioSelector');
        data.forEach((s, i) => {
            let opt = document.createElement('option');
            opt.value = i;
            opt.innerHTML = s.scenarioName;
            sel.appendChild(opt);
        });
    });

document.getElementById('scenarioSelector').addEventListener('change', e => {
    const scenario = masterData[e.target.value];
    if (scenario) {
        render(scenario);
        document.getElementById('json-display').textContent = JSON.stringify(scenario, null, 2);
    }
});

function render(scenario) {
    d3.select("#viz-container svg").remove();
    const container = document.getElementById('viz-container');

    // Create a large canvas to allow for deep trees
    const svg = d3.select("#viz-container").append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .call(d3.zoom().on("zoom", (event) => {
            g.attr("transform", event.transform);
        }));

    const g = svg.append("g");

    // Arrow Marker
    svg.append("defs").append("marker")
        .attr("id", "arrow").attr("viewBox", "0 -5 10 10").attr("refX", 10)
        .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#666");

    // COMPREHENSIVE MAPPING LOGIC
    const mapAcc = (acc) => ({
        name: acc.mdmAccountId || acc.tradingName || "Account Object",
        type: "ACCOUNT",
        children: [
            ...(acc.children ? acc.children.map(mapAcc) : []),
            ...(acc.addresses || []).map(a => ({ name: `📍 ${a.city}, ${a.country}`, type: "ATTR" })),
            ...(acc.contracts || []).map(c => ({ name: `📜 ${c.contractName}`, type: "ATTR" })),
            ...(acc.contactPersons || []).map(cp => ({ name: `👤 ${cp.firstName} ${cp.lastName}`, type: "ATTR" })),
            ...(acc.billingAgreements || []).map(b => ({ name: `💳 ${b.paymentTerms}`, type: "ATTR" })),
            ...(acc.referenceIds || []).map(r => ({ name: `🆔 ${r.refValue}`, type: "ATTR" })),
            ...(acc.platformObject ? [{ name: `🌐 ${acc.platformObject.name}`, type: "ATTR" }] : [])
        ]
    });

    const rootData = {
        name: scenario.customer.globalGroupCode || "GROUP",
        type: "GLOBAL",
        children: [{
            name: scenario.customer.officialName,
            type: "CUSTOMER",
            children: [
                ...scenario.customer.accounts.map(mapAcc),
                // Legal Level Attributes
                ...(scenario.customer.taxId ? [{ name: `TAX: ${scenario.customer.taxId}`, type: "ATTR" }] : [])
            ]
        }]
    };

    const root = d3.hierarchy(rootData);
    // Spacing: [Horizontal, Vertical]
    const tree = d3.tree().nodeSize([250, 150]);
    tree(root);

    // Center the Diagram
    const initialX = container.clientWidth / 2 - (nodeW / 2);
    const initialY = 50;
    g.attr("transform", `translate(${initialX}, ${initialY})`);

    // Links
    g.selectAll(".link").data(root.links()).enter().append("path")
        .attr("class", "link").attr("marker-end", "url(#arrow)")
        .attr("d", d => `M${d.source.x + nodeW / 2},${d.source.y + nodeH} 
                        C${d.source.x + nodeW / 2},${(d.source.y + d.target.y + nodeH) / 2} 
                         ${d.target.x + nodeW / 2},${(d.source.y + d.target.y + nodeH) / 2} 
                         ${d.target.x + nodeW / 2},${d.target.y}`);

    // Nodes
    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);

    node.append("rect")
        .attr("width", nodeW).attr("height", nodeH)
        .style("fill", d => {
            if (d.data.type === "GLOBAL") return "#111";
            if (d.data.type === "CUSTOMER") return "#D40511";
            if (d.data.type === "ACCOUNT") return "#FFCC00";
            return "#666"; // Attribute Gray
        });

    // Main ID/Name
    node.append("text").attr("class", d => `label-main ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 10).attr("y", 25).text(d => d.data.name.length > 22 ? d.data.name.substring(0, 20) + '..' : d.data.name);

    // Subtitle
    node.append("text").attr("class", d => `label-sub ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 10).attr("y", 45).text(d => d.data.type === "ATTR" ? "DATA POINT" : `OBJ: ${d.data.type}`);
}