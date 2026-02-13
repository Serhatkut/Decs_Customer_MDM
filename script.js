/**
 * DHL Master Data Blueprint Engine
 * Version: 3.1.0 (Enterprise Multi-Country Support)
 * Logic: Top-Down Vertical Hierarchy based on image_7a0498.png
 */

let masterData = [];
const nodeW = 240; // Card Width
const nodeH = 135; // Card Height for metadata blocks

// 1. INITIALIZE SVG & ZOOM
const svg = d3.select("#viz-container").append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

const g = svg.append("g");

const zoom = d3.zoom()
    .scaleExtent([0.05, 3])
    .on("zoom", (event) => g.attr("transform", event.transform));

svg.call(zoom);

// 2. DATA LOAD
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
    })
    .catch(err => console.error("JSON Load Error:", err));

// 3. UI EVENT LISTENERS
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
        zoom.transform,
        d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6)
    );
});

document.getElementById('nodeSearch').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    d3.selectAll(".node").transition().duration(200).style("opacity", d =>
        d.data.name.toLowerCase().includes(term) ? 1 : 0.1
    );
    d3.selectAll(".link").transition().duration(200).style("opacity", term ? 0.1 : 1);
});

// 4. THE DEEP HIERARCHY MAPPING ENGINE
/**
 * Recursively maps the JSON into a D3-compliant tree.
 * Prioritizes Names in the title area as per image_85ec24.png
 */
function mapHierarchy(obj, type) {
    let children = [];

    // Map Accounts/Sub-Accounts recursively (Multi-Country/Multi-Brand)
    if (obj.accounts) children.push(...obj.accounts.map(acc => mapHierarchy(acc, acc.type || 'ACCOUNT')));
    if (obj.children) children.push(...obj.children.map(child => mapHierarchy(child, child.type || 'SUB_ACCOUNT')));

    // Attribute Mapping as Child Nodes
    if (obj.contracts) obj.contracts.forEach(c => children.push({ name: c.contractName, type: 'CONTRACT', data: c }));
    if (obj.billingAgreements) obj.billingAgreements.forEach(b => children.push({ name: 'Billing Agreement', type: 'BILLING', data: b }));
    if (obj.bankAccounts) obj.bankAccounts.forEach(ba => children.push({ name: 'Bank Account', type: 'BANK', data: ba }));

    if (obj.contactPersons) {
        obj.contactPersons.forEach(cp => {
            let contactNode = { name: `${cp.firstName || ''} ${cp.lastName}`, type: 'CONTACT', data: cp, children: [] };
            if (cp.commChannels) cp.commChannels.forEach(cc => contactNode.children.push({ name: cc.type || 'Comm', type: 'COMM', data: cc }));
            children.push(contactNode);
        });
    }

    if (obj.addresses) obj.addresses.forEach(a => children.push({ name: `${a.city}, ${a.country}`, type: 'ADDRESS', data: a }));
    if (obj.platformObject) children.push({ name: obj.platformObject.name, type: 'PLATFORM', data: obj.platformObject });

    return {
        // Priority: Official/Trading Name for headers
        name: obj.officialName || obj.tradingName || obj.mdmAccountId || obj.mdmCustomerId || "Master Object",
        type: type,
        data: obj,
        children: children
    };
}

// 5. RENDERING PIPELINE
function render(scenario) {
    g.selectAll("*").remove();

    const rootData = mapHierarchy(scenario.customer, 'GLOBAL');
    const root = d3.hierarchy(rootData);

    // Spacing for Top-Down flow
    const tree = d3.tree().nodeSize([280, 240]);
    tree(root);

    const container = document.getElementById('viz-container');
    svg.call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6));

    // Links (Solid Red Arrows)
    g.selectAll(".link").data(root.links()).enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x + nodeW / 2).y(d => d.y + nodeH / 2));

    // Nodes (Cards)
    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`);

    // Card Body
    node.append("rect")
        .attr("width", nodeW)
        .attr("height", nodeH)
        .style("fill", d => d.data.type === 'GLOBAL' ? "#FFCC00" : "#FFF5CC")
        .style("stroke", "#D40511")
        .attr("rx", 8);

    // Card Header
    node.append("rect")
        .attr("width", nodeW)
        .attr("height", 32)
        .style("fill", d => d.data.type === 'GLOBAL' ? "#FFCC00" : "#D40511")
        .style("stroke", "#D40511")
        .attr("rx", 8);

    // Header Text (The Entity/Account Name)
    node.append("text")
        .attr("x", nodeW / 2).attr("y", 21).attr("text-anchor", "middle")
        .style("fill", d => d.data.type === 'GLOBAL' ? "#000" : "#FFF")
        .style("font-weight", "bold").style("font-size", "11px")
        .text(d => d.data.name.length > 30 ? d.data.name.substring(0, 28) + "..." : d.data.name);

    // Metadata Mapping logic
    node.each(function (d) {
        const el = d3.select(this);
        const data = d.data.data;
        let yPos = 48;

        const addLine = (label, val) => {
            if (val && yPos < nodeH - 10) {
                el.append("text").attr("x", 12).attr("y", yPos)
                    .style("font-size", "8px").style("fill", "#333").style("font-weight", "bold")
                    .text(`${label}: `);
                el.append("text").attr("x", 12 + (label.length * 5)).attr("y", yPos)
                    .style("font-size", "8px").style("fill", "#555")
                    .text(String(val).substring(0, 35));
                yPos += 13;
            }
        };

        if (d.data.type === 'GLOBAL') {
            addLine("[IDs]", data.mdmCustomerId);
            addLine("[Scope]", data.globalGroupCode);
        } else if (d.data.type === 'COUNTRY_CUSTOMER') {
            addLine("[IDs]", data.mdmCustomerId);
            addLine("[Core]", data.officialName);
        } else if (d.data.type === 'SOLD_TO' || d.data.type === 'ACCOUNT') {
            addLine("[IDs]", data.mdmAccountId);
            addLine("[Roles]", (data.businessRoles || []).join(', '));
        } else if (d.data.type === 'CONTACT') {
            addLine("[IDs]", data.contactPersonId);
            addLine("[Role]", data.jobTitle);
        } else if (d.data.type === 'ADDRESS') {
            addLine("[Loc]", `${data.city}, ${data.country}`);
        } else if (d.data.type === 'COMM') {
            addLine("[Data]", `${data.type}: ${data.value}`);
        } else {
            addLine("[Info]", d.data.name);
        }
    });
}