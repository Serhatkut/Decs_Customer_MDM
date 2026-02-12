let masterData = [];
const nodeW = 200;
const nodeH = 60;

// Initialize D3 Components ONCE
const svg = d3.select("#viz-container").append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

const g = svg.append("g"); // This group holds the diagram

const zoom = d3.zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
    });

svg.call(zoom);

// Load Data
fetch('customerData.json').then(res => res.json()).then(data => {
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
        document.getElementById('json-display').textContent = JSON.stringify(scenario, null, 2);
        render(scenario);
    }
});

// Reset Zoom Button
document.getElementById('resetZoom').addEventListener('click', () => {
    const container = document.getElementById('viz-container');
    svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.8)
    );
});

function render(scenario) {
    g.selectAll("*").remove(); // Clear only the nodes/links

    // Comprehensive Mapping (Includes all child objects)
    const mapAcc = (acc) => ({
        name: acc.mdmAccountId || acc.tradingName || "Object",
        type: "ACCOUNT",
        children: [
            ...(acc.children ? acc.children.map(mapAcc) : []),
            ...(acc.addresses || []).map(a => ({ name: `📍 ${a.city}`, type: "ATTR" })),
            ...(acc.contracts || []).map(c => ({ name: `📜 ${c.contractName}`, type: "ATTR" })),
            ...(acc.contactPersons || []).map(cp => ({ name: `👤 ${cp.lastName}`, type: "ATTR" }))
        ]
    });

    const rootData = {
        name: scenario.customer.globalGroupCode || "GLOBAL",
        type: "GLOBAL",
        children: [{
            name: scenario.customer.officialName,
            type: "CUSTOMER",
            children: scenario.customer.accounts.map(mapAcc)
        }]
    };

    const root = d3.hierarchy(rootData);
    const tree = d3.tree().nodeSize([250, 150]);
    tree(root);

    // Initial Center
    const container = document.getElementById('viz-container');
    svg.call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.8));

    // Links
    g.selectAll(".link").data(root.links()).enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x + nodeW / 2).y(d => d.y));

    // Nodes
    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`);

    node.append("rect").attr("width", nodeW).attr("height", nodeH)
        .style("fill", d => {
            if (d.data.type === "GLOBAL") return "#111";
            if (d.data.type === "CUSTOMER") return "#D40511";
            if (d.data.type === "ACCOUNT") return "#FFCC00";
            return "#666";
        });

    node.append("text").attr("class", d => `label-main ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 10).attr("y", 25).text(d => d.data.name);

    node.append("text").attr("class", d => `label-sub ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 10).attr("y", 45).text(d => d.data.type);
}