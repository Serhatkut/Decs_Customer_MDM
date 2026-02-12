let masterData = [];
const nodeW = 220;
const nodeH = 75;

// Initialize SVG and Zoom
const svg = d3.select("#viz-container").append("svg")
    .attr("width", "100%")
    .attr("height", "100%");
const g = svg.append("g");
const zoom = d3.zoom().scaleExtent([0.1, 3]).on("zoom", (e) => g.attr("transform", e.transform));
svg.call(zoom);

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

function mapAccount(acc) {
    let children = [];

    // 1. Nested Child Accounts
    if (acc.children) children.push(...acc.children.map(mapAccount));

    // 2. Billing Attributes
    if (acc.billingAgreements) acc.billingAgreements.forEach(b => children.push({ name: `💳 ${b.paymentTerms}`, type: "DATA" }));

    // 3. Contract Attributes
    if (acc.contracts) acc.contracts.forEach(c => children.push({ name: `📜 ${c.contractName}`, type: "DATA" }));

    // 4. Contact Attributes
    if (acc.contactPersons) acc.contactPersons.forEach(p => children.push({ name: `👤 ${p.lastName}`, type: "DATA" }));

    // 5. Address Attributes
    if (acc.addresses) acc.addresses.forEach(a => children.push({ name: `📍 ${a.city}, ${a.country}`, type: "DATA" }));

    // 6. Platform Objects
    if (acc.platformObject) children.push({ name: `⚙️ ${acc.platformObject.name}`, type: "DATA" });

    return {
        name: acc.mdmAccountId || acc.tradingName,
        type: "ACCOUNT",
        children: children
    };
}

function render(scenario) {
    g.selectAll("*").remove();

    const rootData = {
        name: scenario.customer.globalGroupCode || scenario.customer.officialName,
        type: "GLOBAL",
        children: [{
            name: scenario.customer.officialName,
            type: "CUSTOMER",
            children: scenario.customer.accounts.map(mapAccount)
        }]
    };

    const root = d3.hierarchy(rootData);
    const tree = d3.tree().nodeSize([250, 180]);
    tree(root);

    // Initial Center
    const container = document.getElementById('viz-container');
    svg.call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.7));

    // Links
    g.selectAll(".link").data(root.links()).enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x + nodeW / 2).y(d => d.y));

    // Boxes
    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);

    node.append("rect").attr("width", nodeW).attr("height", nodeH)
        .style("fill", d => {
            if (d.data.type === "GLOBAL") return "#000";
            if (d.data.type === "CUSTOMER") return "#D40511";
            if (d.data.type === "ACCOUNT") return "#FFCC00";
            return "#777"; // Attributes in Gray
        });

    node.append("text").attr("class", d => `label-main ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 10).attr("y", 30).text(d => d.data.name.substring(0, 22));

    node.append("text").attr("class", d => `label-sub ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 10).attr("y", 55).text(d => `TYPE: ${d.data.type}`);
}