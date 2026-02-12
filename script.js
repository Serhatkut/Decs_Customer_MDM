let masterData = [];
const nodeW = 180;
const nodeH = 55;

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
    const svg = d3.select("#viz-container").append("svg")
        .attr("width", 2000).attr("height", 1000)
        .append("g").attr("transform", "translate(100,50)");

    // Arrow Marker
    svg.append("defs").append("marker")
        .attr("id", "arrow").attr("viewBox", "0 -5 10 10").attr("refX", 10)
        .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
        .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#666");

    // Mapping Logic
    const mapAcc = (acc) => ({
        name: acc.mdmAccountId,
        type: "ACCOUNT",
        children: [
            ...(acc.children ? acc.children.map(mapAcc) : []),
            ...(acc.addresses || []).map(a => ({ name: a.city, type: "ATTR" })),
            ...(acc.contracts || []).map(c => ({ name: c.contractName, type: "ATTR" }))
        ]
    });

    const rootData = {
        name: scenario.customer.globalGroupCode || "GROUP",
        type: "GLOBAL",
        children: [{
            name: scenario.customer.officialName,
            type: "CUSTOMER",
            children: scenario.customer.accounts.map(mapAcc)
        }]
    };

    const root = d3.hierarchy(rootData);
    const tree = d3.tree().nodeSize([220, 120]);
    tree(root);

    // Links (Top-down lines)
    svg.selectAll(".link").data(root.links()).enter().append("path")
        .attr("class", "link").attr("marker-end", "url(#arrow)")
        .attr("d", d => `M${d.source.x + nodeW / 2},${d.source.y + nodeH} L${d.target.x + nodeW / 2},${d.target.y}`);

    // Nodes (Cards)
    const node = svg.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);

    node.append("rect")
        .attr("width", nodeW).attr("height", nodeH)
        .style("fill", d => {
            if (d.data.type === "GLOBAL") return "#111";
            if (d.data.type === "CUSTOMER") return "#D40511";
            if (d.data.type === "ACCOUNT") return "#FFCC00";
            return "#777";
        });

    node.append("text").attr("class", d => `label-main ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 10).attr("y", 22).text(d => d.data.name.substring(0, 20));

    node.append("text").attr("class", d => `label-sub ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 10).attr("y", 40).text(d => `OBJ: ${d.data.type}`);
}