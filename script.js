/**
 * DHL Master Data Blueprint Engine
 * Version: 2.0.0 (Universal Attribute Support)
 * Logic: Top-Down Vertical Hierarchy with Recursive Account/Attribute Mapping
 */

let masterData = [];
const nodeW = 220; // Card Width
const nodeH = 80;  // Card Height

// 1. INITIALIZE SVG & ZOOM
// We create the SVG once. The 'g' group will hold all diagram elements for zooming.
const svg = d3.select("#viz-container").append("svg")
    .attr("width", "100%")
    .attr("height", "100%");

const g = svg.append("g");

const zoom = d3.zoom()
    .scaleExtent([0.1, 3]) // Zoom limits: 10% to 300%
    .on("zoom", (event) => g.attr("transform", event.transform));

svg.call(zoom);

// 2. DATA LOAD & SELECTOR POPULATION
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
    .catch(err => {
        console.error("JSON Load Error:", err);
        document.getElementById('json-display').textContent = "Error: JSON file not found or invalid.";
    });

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
        d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.7)
    );
});

// Search Logic: Fades out nodes that don't match the query
document.getElementById('nodeSearch').addEventListener('input', e => {
    const term = e.target.value.toLowerCase();
    d3.selectAll(".node").transition().duration(200).style("opacity", d =>
        d.data.name.toLowerCase().includes(term) ? 1 : 0.1
    );
    d3.selectAll(".link").transition().duration(200).style("opacity", term ? 0.05 : 0.4);
});

// 4. THE UNIVERSAL MAPPING ENGINE
/**
 * This function recursively explores an Account object and its children.
 * It also treats every data attribute (Address, Contact, etc.) as a child node.
 */
function mapAccount(acc) {
    let children = [];

    // A. Sub-Accounts (Recursive Child Accounts)
    if (acc.children) children.push(...acc.children.map(mapAccount));

    // B. Address Attributes (📍)
    if (acc.addresses) {
        acc.addresses.forEach(a => children.push({
            name: `📍 ${a.city}, ${a.country}`,
            type: "DATA",
            details: a.street || "Location Hub"
        }));
    }

    // C. Contact Persons (👤)
    if (acc.contactPersons) {
        acc.contactPersons.forEach(p => children.push({
            name: `👤 ${p.firstName} ${p.lastName}`,
            type: "DATA",
            details: p.jobTitle || "Point of Contact"
        }));
    }

    // D. Billing Agreements (💳)
    if (acc.billingAgreements) {
        acc.billingAgreements.forEach(b => children.push({
            name: `💳 Terms: ${b.paymentTerms}`,
            type: "DATA",
            details: `Currency: ${b.currency || 'EUR'}`
        }));
    }

    // E. Contracts (📜)
    if (acc.contracts) {
        acc.contracts.forEach(c => children.push({
            name: `📜 ${c.contractName}`,
            type: "DATA",
            details: `ID: ${c.contractId}`
        }));
    }

    // F. Platform & Reference IDs (⚙️)
    if (acc.platformObject) {
        children.push({
            name: `🌐 ${acc.platformObject.name}`,
            type: "DATA",
            details: acc.platformObject.platformId
        });
    }
    if (acc.referenceIds) {
        acc.referenceIds.forEach(r => children.push({
            name: `🆔 Ref: ${r.refValue}`,
            type: "DATA",
            details: r.refType
        }));
    }

    return {
        name: acc.mdmAccountId || acc.tradingName || "Commercial Account",
        type: "ACCOUNT",
        children: children
    };
}

// 5. RENDERING PIPELINE
function render(scenario) {
    // Clear only diagram content
    g.selectAll("*").remove();

    // Transform Scenario to D3 Hierarchy
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
    // Tree Spacing: [Width between siblings, Vertical distance between levels]
    const tree = d3.tree().nodeSize([280, 200]);
    tree(root);

    // Initial View Position (Centered on Global Parent)
    const container = document.getElementById('viz-container');
    svg.call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.7));

    // Curved Arrows (Links)
    g.selectAll(".link").data(root.links()).enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkVertical()
            .x(d => d.x + nodeW / 2)
            .y(d => d.y));

    // Cards (Nodes)
    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.x},${d.y})`);

    // The Background Box
    node.append("rect")
        .attr("width", nodeW)
        .attr("height", nodeH)
        .style("fill", d => {
            if (d.data.type === "GLOBAL") return "#000000"; // Black
            if (d.data.type === "CUSTOMER") return "#D40511"; // Red
            if (d.data.type === "ACCOUNT") return "#FFCC00"; // Yellow
            return "#666666"; // Gray Attributes
        });

    // Primary Label (ID/Name)
    node.append("text")
        .attr("class", d => `label-main ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 12)
        .attr("y", 30)
        .text(d => d.data.name.length > 24 ? d.data.name.substring(0, 22) + "..." : d.data.name);

    // Object Type Tag
    node.append("text")
        .attr("class", d => `label-sub ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 12)
        .attr("y", 52)
        .text(d => `OBJ: ${d.data.type}`);

    // Detail Metadata Line
    node.append("text")
        .attr("class", d => `label-detail ${d.data.type === 'ACCOUNT' ? 'label-yellow' : ''}`)
        .attr("x", 12)
        .attr("y", 68)
        .style("font-size", "9px")
        .style("fill", d => d.data.type === 'ACCOUNT' ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.6)")
        .text(d => d.data.details || "");
}