/**
 * DHL Master Data Visualizer - Core Logic
 * Author: Senior Data Architect
 * Purpose: Render 1:1 Mapping of Customer Types and Recursive Account Hierarchies
 */

let masterData = [];

// 1. DATA INITIALIZATION
// Fetches the JSON file and populates the dropdown selector
fetch('customerData.json')
    .then(response => response.json())
    .then(data => {
        masterData = data;
        const selector = document.getElementById('scenarioSelector');
        
        data.forEach((item, index) => {
            let opt = document.createElement('option');
            opt.value = index;
            // Display Scenario name in the dropdown
            opt.innerHTML = `${index + 1}. ${item.scenarioName}`;
            selector.appendChild(opt);
        });
    })
    .catch(err => {
        console.error("Critical: Could not load customerData.json", err);
        document.getElementById('json-display').textContent = "Error: Ensure customerData.json is in the same folder.";
    });

// 2. UI EVENT LISTENERS
document.getElementById('scenarioSelector').addEventListener('change', function(e) {
    const scenario = masterData[e.target.value];
    if (scenario) {
        // Trigger the D3 Visualizer
        renderDiagram(scenario);
        
        // Update the Code Terminal
        document.getElementById('json-display').textContent = JSON.stringify(scenario, null, 2);
        
        // Update Metadata sidebar area
        document.getElementById('details').innerHTML = `
            <div style="margin-top:20px; border-top:2px solid var(--dhl-yellow); padding-top:15px">
                <p><strong>Legal Entity:</strong><br>${scenario.customer.officialName}</p>
                <p><strong>Industry Sector:</strong><br>${scenario.customer.industrySector || 'N/A'}</p>
                <p><strong>Customer Level:</strong><br><span style="color:var(--dhl-red); font-weight:bold;">${scenario.customer.customerLevel}</span></p>
                <p><strong>Type:</strong><br>${scenario.customer.customerType}</p>
            </div>
        `;
    }
});

// Real-time Search Logic: Filters nodes by name/ID/city
document.getElementById('nodeSearch').addEventListener('input', function(e) {
    const term = e.target.value.toLowerCase();
    
    // Smoothly transition opacity for non-matching nodes
    d3.selectAll(".node").transition().duration(250).style("opacity", d => 
        d.data.name.toLowerCase().includes(term) ? 1 : 0.1
    );
    
    // Fade links to emphasize matched nodes
    d3.selectAll(".link").transition().duration(250).style("opacity", term ? 0.05 : 0.4);
});

// 3. RECURSIVE D3 RENDERING ENGINE
function renderDiagram(scenario) {
    // Clean slate for the new drawing
    d3.select("#viz-container svg").remove();
    
    const container = document.getElementById('viz-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select("#viz-container").append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", "translate(100,0)");

    /**
     * RECURSIVE MAPPING FUNCTION
     * Maps the MDM Customer/Account structure to D3's hierarchy format.
     */
    function mapAccount(acc) {
        return {
            name: acc.mdmAccountId,
            type: "ACCOUNT",
            children: [
                // Check for nested child accounts (Strategic/Blueprint scenarios)
                ...(acc.children ? acc.children.map(mapAccount) : []),
                // Map Addresses
                ...(acc.addresses || []).map(a => ({ name: `📍 ${a.city}, ${a.country}`, type: "OTHER" })),
                // Map Contracts
                ...(acc.contracts || []).map(c => ({ name: `📜 ${c.contractName}`, type: "OTHER" })),
                // Map Platform Objects (Digital/Partners)
                ...(acc.platformObject ? [{ name: `⚙️ ${acc.platformObject.name}`, type: "OTHER" }] : []),
                // Map Reference IDs (Resellers)
                ...(acc.referenceIds || []).map(r => ({ name: `🆔 Ref: ${r.refValue}`, type: "OTHER" }))
            ]
        };
    }

    // Build the Hierarchy Root
    const rootData = {
        name: scenario.customer.globalGroupCode || "GROUP",
        type: "GLOBAL",
        children: [{
            name: scenario.customer.officialName,
            type: "CUSTOMER",
            children: scenario.customer.accounts.map(mapAccount)
        }]
    };

    const root = d3.hierarchy(rootData);
    const treeLayout = d3.tree().size([height - 100, width - 400]);
    treeLayout(root);

    // DRAWING LINKS
    svg.selectAll(".link")
        .data(root.links())
        .enter().append("path")
        .attr("class", "link")
        .attr("d", d3.linkHorizontal().x(d => d.y).y(d => d.x));

    // DRAWING NODES
    const node = svg.selectAll(".node")
        .data(root.descendants())
        .enter().append("g")
        .attr("class", "node")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    // Node Circles with Custom DHL Logic
    node.append("circle")
        .attr("r", d => d.data.type === "GLOBAL" ? 10 : 7)
        .style("fill", d => {
            if (d.data.type === "GLOBAL") return "#000000"; // Black
            if (d.data.type === "CUSTOMER") return "#D40511"; // Red
            if (d.data.type === "ACCOUNT") return "#FFCC00"; // Yellow
            return "#999999"; // Gray
        })
        .style("stroke", d => {
            if (d.data.type === "ACCOUNT") return "#b38f00"; // Darker Yellow border
            if (d.data.type === "CUSTOMER") return "#a0040d"; // Darker Red border
            return "none";
        });

    // Node Text Labels
    node.append("text")
        .attr("dy", "0.35em")
        .attr("x", d => d.children ? -15 : 15)
        .style("text-anchor", d => d.children ? "end" : "start")
        .text(d => d.data.name);
}