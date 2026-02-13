/**
 * DHL Master Data Blueprint Engine - v3.4.0
 * Logic: Functional Object Coloring & Deep Mapping
 */

let masterData = [];
const nodeW = 240;
const nodeH = 140;

// Object Type Coloring Palette
const colors = {
    GLOBAL: "#FFCC00",      // DHL Yellow
    COMMERCIAL: "#D40511",  // DHL Red (Customer, Sold-To, Pickup)
    FINANCIAL: "#003399",   // DHL Blue (Bank, Billing)
    PERSONNEL: "#007D8A",   // Teal (Contact, Comm)
    LOCATION: "#666666",    // Gray (Address)
};

// 1. Initialize SVG & Zoom
const svg = d3.select("#viz-container").append("svg").attr("width", "100%").attr("height", "100%");
const g = svg.append("g");
const zoom = d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => g.attr("transform", e.transform));
svg.call(zoom);

// 2. Data Load
fetch('customerData.json').then(res => res.json()).then(data => {
    masterData = data;
    const sel = document.getElementById('scenarioSelector');
    data.forEach((s, i) => {
        let opt = document.createElement('option');
        opt.value = i; opt.innerHTML = s.scenarioName; sel.appendChild(opt);
    });
});

// 3. Deep Object Mapping Engine
function mapHierarchy(obj, type) {
    let children = [];

    // Map Nested Accounts (Recursive Multi-Country)
    if (obj.accounts) children.push(...obj.accounts.map(acc => mapHierarchy(acc, acc.type || 'ACCOUNT')));
    if (obj.children) children.push(...obj.children.map(child => mapHierarchy(child, child.type || 'SUB_ACCOUNT')));

    // Extract Arrays into Parallel Nodes
    if (obj.bankAccounts) obj.bankAccounts.forEach(ba => children.push({ name: 'Bank Account', type: 'BANK', data: ba }));
    if (obj.billingAgreements) obj.billingAgreements.forEach(b => children.push({ name: 'Billing Agreement', type: 'BILLING', data: b }));

    if (obj.contactPersons) {
        obj.contactPersons.forEach(cp => {
            let contactNode = { name: `${cp.firstName || ''} ${cp.lastName}`, type: 'CONTACT', data: cp, children: [] };
            if (cp.commChannels) cp.commChannels.forEach(cc => contactNode.children.push({ name: cc.value, type: 'COMM', data: cc }));
            children.push(contactNode);
        });
    }

    if (obj.addresses) obj.addresses.forEach(a => children.push({ name: `${a.city}, ${a.country}`, type: 'ADDRESS', data: a }));

    return {
        name: obj.tradingName || obj.officialName || obj.mdmAccountId || "Master Object",
        type: type,
        data: obj,
        children: children
    };
}

// 4. Rendering Pipeline
function render(scenario) {
    g.selectAll("*").remove();
    const rootData = mapHierarchy(scenario.customer, 'GLOBAL');
    const root = d3.hierarchy(rootData);
    const tree = d3.tree().nodeSize([300, 260]); // Spacing for sibling visibility
    tree(root);

    const container = document.getElementById('viz-container');
    svg.call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6));

    // Links (Solid Red as per blueprint)
    g.selectAll(".link").data(root.links()).enter().append("path").attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x + nodeW / 2).y(d => d.y + nodeH / 2));

    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);

    // Helper to get functional color
    const getHeaderColor = (type) => {
        if (type === 'GLOBAL') return colors.GLOBAL;
        if (['SOLD_TO', 'PICKUP', 'COUNTRY_CUSTOMER'].includes(type)) return colors.COMMERCIAL;
        if (['BANK', 'BILLING'].includes(type)) return colors.FINANCIAL;
        if (['CONTACT', 'COMM'].includes(type)) return colors.PERSONNEL;
        return colors.LOCATION;
    };

    // Blueprint Card Body & Header
    node.append("rect").attr("width", nodeW).attr("height", nodeH).style("fill", "#FFF5CC").style("stroke", "#D40511").attr("rx", 8);
    node.append("rect").attr("width", nodeW).attr("height", 32).style("fill", d => getHeaderColor(d.data.type)).style("stroke", "#D40511").attr("rx", 8);

    node.append("text").attr("x", nodeW / 2).attr("y", 21).attr("text-anchor", "middle")
        .style("fill", d => d.data.type === 'GLOBAL' ? "#000" : "#FFF").style("font-weight", "bold").style("font-size", "11px")
        .text(d => d.data.name.substring(0, 32));

    // Metadata Blocks
    node.each(function (d) {
        const el = d3.select(this); const data = d.data.data; let yPos = 50;
        const addLine = (label, val) => {
            if (val && yPos < nodeH - 10) {
                el.append("text").attr("x", 12).attr("y", yPos).style("font-size", "8.5px").style("fill", "#333").style("font-weight", "bold").text(`${label}: `);
                el.append("text").attr("x", 12 + (label.length * 5)).attr("y", yPos).style("font-size", "8.5px").style("fill", "#555").text(String(val).substring(0, 35));
                yPos += 14;
            }
        };
        if (d.data.type === 'GLOBAL') { addLine("[IDs]", data.mdmCustomerId); addLine("[Scope]", data.globalGroupCode); }
        else if (d.data.type === 'BANK') { addLine("[Data]", `IBAN: ${data.iban}`); }
        else if (d.data.type === 'ADDRESS') { addLine("[Loc]", `${data.city}, ${data.country}`); }
        else if (d.data.type === 'CONTACT') { addLine("[Role]", data.jobTitle); }
        else { addLine("[IDs]", data.mdmAccountId || data.mdmCustomerId); }
    });
}

// 5. Interaction Handlers
document.getElementById('scenarioSelector').addEventListener('change', e => {
    const scenario = masterData[e.target.value];
    if (scenario) { render(scenario); document.getElementById('json-display').textContent = JSON.stringify(scenario, null, 2); }
});

document.getElementById('resetZoom').addEventListener('click', () => {
    const container = document.getElementById('viz-container');
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6));
});