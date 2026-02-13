/**
 * DHL Master Data Blueprint Engine - v3.3.0
 * Features: Full Object Extraction & Interactive Viewport
 */

let masterData = [];
const nodeW = 240;
const nodeH = 140;

// 1. Initialize SVG & Zoom logic
const svg = d3.select("#viz-container").append("svg").attr("width", "100%").attr("height", "100%");
const g = svg.append("g");
const zoom = d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => g.attr("transform", e.transform));
svg.call(zoom);

// 2. Data Load & Selector
fetch('customerData.json').then(res => res.json()).then(data => {
    masterData = data;
    const sel = document.getElementById('scenarioSelector');
    data.forEach((s, i) => {
        let opt = document.createElement('option');
        opt.value = i; opt.innerHTML = s.scenarioName; sel.appendChild(opt);
    });
});

// 3. The Deep Object Mapping Engine
function mapHierarchy(obj, type) {
    let children = [];

    // Recursive Account Levels (Country -> Brand -> Depot)
    if (obj.accounts) children.push(...obj.accounts.map(acc => mapHierarchy(acc, acc.type || 'ACCOUNT')));
    if (obj.children) children.push(...obj.children.map(child => mapHierarchy(child, child.type || 'SUB_ACCOUNT')));

    // Object Type Mapping (Extracting arrays into distinct boxes)
    if (obj.contracts) obj.contracts.forEach(c => children.push({ name: c.contractName, type: 'CONTRACT', data: c }));
    if (obj.billingAgreements) obj.billingAgreements.forEach(b => children.push({ name: 'Billing Agreement', type: 'BILLING', data: b }));
    if (obj.bankAccounts) obj.bankAccounts.forEach(ba => children.push({ name: 'Bank Account', type: 'BANK', data: ba }));
    if (obj.referenceIds) obj.referenceIds.forEach(r => children.push({ name: `Ref: ${r.refValue}`, type: 'REFID', data: r }));
    if (obj.platformObject) children.push({ name: obj.platformObject.name, type: 'PLATFORM', data: obj.platformObject });

    // Addresses & Contacts with nested Comm Channels
    if (obj.addresses) obj.addresses.forEach(a => children.push({ name: `${a.city}, ${a.country}`, type: 'ADDRESS', data: a }));
    if (obj.contactPersons) {
        obj.contactPersons.forEach(cp => {
            let contactNode = { name: `${cp.firstName || ''} ${cp.lastName}`, type: 'CONTACT', data: cp, children: [] };
            if (cp.commChannels) cp.commChannels.forEach(cc => contactNode.children.push({ name: cc.type || 'Comm', type: 'COMM', data: cc }));
            children.push(contactNode);
        });
    }

    return {
        name: obj.officialName || obj.tradingName || obj.mdmAccountId || "Master Object",
        type: type,
        data: obj,
        children: children
    };
}

// 4. Interactive Listeners
document.getElementById('scenarioSelector').addEventListener('change', e => {
    const scenario = masterData[e.target.value];
    if (scenario) {
        document.getElementById('json-display').textContent = JSON.stringify(scenario, null, 2);
        render(scenario);
    }
});

document.getElementById('resetZoom').addEventListener('click', () => {
    const container = document.getElementById('viz-container');
    svg.transition().duration(750).call(
        zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6)
    );
});

document.getElementById('nodeSearch').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    d3.selectAll(".node").style("opacity", d => d.data.name.toLowerCase().includes(term) ? 1 : 0.1);
});

// 5. Blueprint Rendering Pipeline
function render(scenario) {
    g.selectAll("*").remove();
    const rootData = mapHierarchy(scenario.customer, 'GLOBAL');
    const root = d3.hierarchy(rootData);
    const tree = d3.tree().nodeSize([280, 260]);
    tree(root);

    const container = document.getElementById('viz-container');
    svg.call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6));

    // Links
    g.selectAll(".link").data(root.links()).enter().append("path").attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x + nodeW / 2).y(d => d.y + nodeH / 2));

    // Cards
    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);

    // Card Body & Header logic
    node.append("rect").attr("width", nodeW).attr("height", nodeH).style("fill", "#FFF5CC").style("stroke", "#D40511").attr("rx", 8);
    node.append("rect").attr("width", nodeW).attr("height", 32).style("fill", d => d.data.type === 'GLOBAL' ? "#FFCC00" : "#D40511").style("stroke", "#D40511").attr("rx", 8);

    node.append("text").attr("x", nodeW / 2).attr("y", 21).attr("text-anchor", "middle")
        .style("fill", d => d.data.type === 'GLOBAL' ? "#000" : "#FFF").style("font-weight", "bold").style("font-size", "11px")
        .text(d => d.data.name.substring(0, 30));

    // Metadata Blocks
    node.each(function (d) {
        const el = d3.select(this); const data = d.data.data; let yPos = 50;
        const addLine = (label, val) => {
            if (val && yPos < nodeH - 10) {
                el.append("text").attr("x", 12).attr("y", yPos).style("font-size", "8px").style("fill", "#333").style("font-weight", "bold").text(`${label}: `);
                el.append("text").attr("x", 12 + (label.length * 5)).attr("y", yPos).style("font-size", "8px").style("fill", "#555").text(String(val).substring(0, 35));
                yPos += 14;
            }
        };
        if (d.data.type === 'GLOBAL') { addLine("[IDs]", data.mdmCustomerId); addLine("[Scope]", data.globalGroupCode); }
        else if (d.data.type === 'BANK') { addLine("[Data]", `IBAN: ${data.iban}`); }
        else if (d.data.type === 'ADDRESS') { addLine("[Loc]", `${data.city}, ${data.country}`); }
        else if (d.data.type === 'CONTACT') { addLine("[Role]", data.jobTitle); }
        else if (d.data.type === 'COMM') { addLine("[Data]", `${data.type}: ${data.value}`); }
        else { addLine("[IDs]", data.mdmAccountId || data.mdmCustomerId); }
    });
}