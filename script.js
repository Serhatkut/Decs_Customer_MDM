/**
 * DHL Master Data Blueprint Engine - Version 3.0.0
 * Compliant with Blueprint image_7a0498.png
 * Features: Deep recursion, Attribute Nesting, and Blueprint Card Styling
 */

let masterData = [];
const nodeW = 240; // Wider cards for metadata
const nodeH = 130; // Taller cards for multi-line blocks

// 1. INITIALIZE SVG & ZOOM
const svg = d3.select("#viz-container").append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

const g = svg.append("g");

const zoom = d3.zoom()
    .scaleExtent([0.1, 3])
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
    .catch(err => console.error("Data Load Error:", err));

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

// 4. THE DEEP HIERARCHY MAPPING ENGINE
/**
 * Recursively maps the JSON into a D3-compliant tree.
 * Handles: Country Customers, Sold-To, Pickup, and nested Attributes (e.g. Comm Channels).
 */
function mapHierarchy(obj, type) {
    let children = [];

    // Map Accounts/Sub-Accounts recursively
    if (obj.accounts) {
        children.push(...obj.accounts.map(acc => mapHierarchy(acc, acc.type || 'ACCOUNT')));
    }
    if (obj.children) {
        children.push(...obj.children.map(child => mapHierarchy(child, child.type || 'SUB_ACCOUNT')));
    }

    // Map Attributes as Child Nodes (As per image_7a0498.png)
    // Contracts
    if (obj.contracts) {
        obj.contracts.forEach(c => children.push({ name: c.contractName, type: 'CONTRACT', data: c }));
    }

    // Contact Persons & their nested Comm Channels
    if (obj.contactPersons) {
        obj.contactPersons.forEach(cp => {
            let contactNode = { name: `${cp.firstName || ''} ${cp.lastName}`, type: 'CONTACT', data: cp, children: [] };
            if (cp.commChannels) {
                cp.commChannels.forEach(cc => contactNode.children.push({ name: cc.type || 'Comm Channel', type: 'COMM', data: cc }));
            }
            children.push(contactNode);
        });
    }

    // Platform, Billing, Reference, Bank
    if (obj.platformObject) children.push({ name: obj.platformObject.name, type: 'PLATFORM', data: obj.platformObject });
    if (obj.billingAgreements) obj.billingAgreements.forEach(b => children.push({ name: 'Billing Agreement', type: 'BILLING', data: b }));
    if (obj.referenceIds) obj.referenceIds.forEach(r => children.push({ name: `Ref: ${r.refValue}`, type: 'REFID', data: r }));
    if (obj.bankAccounts) obj.bankAccounts.forEach(ba => children.push({ name: 'Bank Account', type: 'BANK', data: ba }));

    // Addresses
    if (obj.addresses) {
        obj.addresses.forEach(a => children.push({ name: a.city || 'Address', type: 'ADDRESS', data: a }));
    }

    return {
        name: obj.officialName || obj.tradingName || obj.mdmAccountId || obj.mdmCustomerId || "Master Object",
        type: type,
        data: obj,
        children: children
    };
}

// 5. RENDERING PIPELINE
function render(scenario) {
    g.selectAll("*").remove();

    // Transform Scenario using our new Deep Engine
    const rootData = mapHierarchy(scenario.customer, 'GLOBAL');
    const root = d3.hierarchy(rootData);

    // Spacing for Top-Down Vertical Flow
    const tree = d3.tree().nodeSize([280, 220]);
    tree(root);

    const container = document.getElementById('viz-container');
    svg.call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6));

    // Links (Solid Red Arrows as per blueprint)
    g.selectAll(".link").data(root.links()).enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x + nodeW / 2).y(d => d.y + nodeH / 2))
        .style("stroke", "#D40511")
        .style("stroke-width", "2px")
        .style("fill", "none");

    // Nodes (Cards)
    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`);

    // Card Background (Cream body as per blueprint)
    node.append("rect")
        .attr("width", nodeW)
        .attr("height", nodeH)
        .style("fill", d => d.data.type === 'GLOBAL' ? "#FFCC00" : "#FFF5CC")
        .style("stroke", "#D40511")
        .style("stroke-width", "2px")
        .attr("rx", 10);

    // Card Header Rect (Red Header)
    node.append("rect")
        .attr("width", nodeW)
        .attr("height", 30)
        .style("fill", d => d.data.type === 'GLOBAL' ? "#FFCC00" : "#D40511")
        .style("stroke", "#D40511")
        .attr("rx", 10);

    // Header Text
    node.append("text")
        .attr("x", nodeW / 2).attr("y", 20).attr("text-anchor", "middle")
        .style("fill", d => d.data.type === 'GLOBAL' ? "#000" : "#FFF")
        .style("font-weight", "bold").style("font-size", "11px")
        .text(d => d.data.type.replace('_', ' '));

    // Metadata Mapping Logic (IDs, Legal, etc.)
    node.each(function (d) {
        const el = d3.select(this);
        const data = d.data.data;
        let yPos = 45;

        const addLine = (label, val) => {
            if (val && yPos < nodeH - 10) {
                el.append("text").attr("x", 12).attr("y", yPos)
                    .style("font-size", "8px").style("fill", "#333")
                    .style("font-weight", "bold")
                    .text(`${label}: `);
                el.append("text").attr("x", 12 + (label.length * 5)).attr("y", yPos)
                    .style("font-size", "8px").style("fill", "#555")
                    .text(val.length > 35 ? val.substring(0, 32) + '...' : val);
                yPos += 12;
            }
        };

        if (d.data.type === 'GLOBAL') {
            addLine("[IDs]", data.mdmCustomerId);
            addLine("[Scope]", data.globalGroupCode);
        } else if (d.data.type === 'COUNTRY_CUSTOMER' || d.data.type === 'COUNTRY') {
            addLine("[IDs]", data.mdmCustomerId);
            addLine("[Legal]", data.taxId || data.countryOfRegistration);
            addLine("[Core]", data.officialName);
        } else if (d.data.type === 'SOLD_TO' || d.data.type === 'ACCOUNT') {
            addLine("[IDs]", data.mdmAccountId);
            addLine("[Roles]", data.businessRoles ? data.businessRoles.join(', ') : '');
            addLine("[Finance]", data.paymentTerms || data.currency);
        } else if (d.data.type === 'ADDRESS') {
            addLine("[Type]", data.addressType);
            addLine("[Loc]", `${data.city}, ${data.country}`);
            addLine("[Geo]", data.timezone);
        } else if (d.data.type === 'CONTACT') {
            addLine("[IDs]", data.contactPersonId);
            addLine("[Name]", data.lastName);
            addLine("[Prefs]", data.language);
        } else if (d.data.type === 'COMM') {
            addLine("[Data]", `${data.type}: ${data.value}`);
        } else {
            addLine("[Data]", d.data.name);
        }
    });
}