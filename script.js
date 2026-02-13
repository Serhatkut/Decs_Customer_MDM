let masterData = [];
const nodeW = 240;
const nodeH = 140;

const colors = {
    GLOBAL: "#FFCC00", COMMERCIAL: "#D40511", FINANCIAL: "#003399", PERSONNEL: "#007D8A", LOCATION: "#666666"
};

const svg = d3.select("#viz-container").append("svg").attr("width", "100%").attr("height", "100%");
const g = svg.append("g");
const zoom = d3.zoom().scaleExtent([0.05, 3]).on("zoom", (e) => g.attr("transform", e.transform));
svg.call(zoom);

fetch('customerData.json').then(res => res.json()).then(data => {
    masterData = data;
    const sel = document.getElementById('scenarioSelector');
    data.forEach((s, i) => {
        let opt = document.createElement('option');
        opt.value = i; opt.innerHTML = s.scenarioName; sel.appendChild(opt);
    });
});

function mapHierarchy(obj, type) {
    let children = [];
    if (obj.accounts) children.push(...obj.accounts.map(acc => mapHierarchy(acc, acc.type || 'ACCOUNT')));
    if (obj.children) children.push(...obj.children.map(child => mapHierarchy(child, child.type || 'SUB_ACCOUNT')));

    if (obj.bankAccounts) obj.bankAccounts.forEach(ba => children.push({ name: 'Bank Account', type: 'BANK', data: ba }));
    if (obj.billingAgreements) obj.billingAgreements.forEach(b => children.push({ name: 'Billing', type: 'BILLING', data: b }));
    if (obj.contracts) obj.contracts.forEach(c => children.push({ name: c.contractName, type: 'CONTRACT', data: c }));

    if (obj.contactPersons) {
        obj.contactPersons.forEach(cp => {
            let node = { name: `${cp.firstName || ''} ${cp.lastName}`, type: 'CONTACT', data: cp, children: [] };
            if (cp.commChannels) cp.commChannels.forEach(cc => node.children.push({ name: cc.value, type: 'COMM', data: cc }));
            children.push(node);
        });
    }
    if (obj.addresses) obj.addresses.forEach(a => children.push({ name: `${a.city}, ${a.country}`, type: 'ADDRESS', data: a }));

    return { name: obj.tradingName || obj.officialName || obj.mdmAccountId || "Object", type: type, data: obj, children: children };
}

function render(scenario) {
    g.selectAll("*").remove();
    const rootData = mapHierarchy(scenario.customer, 'GLOBAL');
    const root = d3.hierarchy(rootData);
    d3.tree().nodeSize([300, 260])(root);

    const container = document.getElementById('viz-container');
    svg.call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6));

    g.selectAll(".link").data(root.links()).enter().append("path").attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x + nodeW / 2).y(d => d.y + nodeH / 2));

    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);

    const getHeaderColor = (t) => {
        if (t === 'GLOBAL') return colors.GLOBAL;
        if (['SOLD_TO', 'PICKUP', 'COUNTRY_CUSTOMER'].includes(t)) return colors.COMMERCIAL;
        if (['BANK', 'BILLING', 'CONTRACT'].includes(t)) return colors.FINANCIAL;
        if (['CONTACT', 'COMM'].includes(t)) return colors.PERSONNEL;
        return colors.LOCATION;
    };

    node.append("rect").attr("width", nodeW).attr("height", nodeH).style("fill", "#FFF5CC").style("stroke", "#D40511").attr("rx", 8);
    node.append("rect").attr("width", nodeW).attr("height", 32).style("fill", d => getHeaderColor(d.data.type)).style("stroke", "#D40511").attr("rx", 8);

    node.append("text").attr("x", nodeW / 2).attr("y", 21).attr("text-anchor", "middle").style("fill", d => d.data.type === 'GLOBAL' ? "#000" : "#FFF").style("font-weight", "bold").style("font-size", "11px").text(d => d.data.name.substring(0, 32));

    node.each(function (d) {
        const el = d3.select(this); const data = d.data.data; let yPos = 50;
        const addLine = (l, v) => { if (v && yPos < nodeH - 10) { el.append("text").attr("x", 12).attr("y", yPos).style("font-size", "8.5px").style("fill", "#333").style("font-weight", "bold").text(`${l}: `); el.append("text").attr("x", 12 + (l.length * 5)).attr("y", yPos).style("font-size", "8.5px").style("fill", "#555").text(String(v).substring(0, 35)); yPos += 14; } };
        if (d.data.type === 'GLOBAL') { addLine("[IDs]", data.mdmCustomerId); addLine("[Scope]", data.globalGroupCode); }
        else if (d.data.type === 'BANK') { addLine("[Data]", `IBAN: ${data.iban}`); }
        else if (d.data.type === 'ADDRESS') { addLine("[Loc]", `${data.city}, ${data.country}`); }
        else if (d.data.type === 'CONTACT') { addLine("[Role]", data.jobTitle); }
        else { addLine("[IDs]", data.mdmAccountId || data.mdmCustomerId); }
    });
}

document.getElementById('scenarioSelector').addEventListener('change', e => {
    const scenario = masterData[e.target.value];
    if (scenario) { render(scenario); document.getElementById('json-display').textContent = JSON.stringify(scenario, null, 2); }
});

document.getElementById('resetZoom').addEventListener('click', () => {
    const container = document.getElementById('viz-container');
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(container.clientWidth / 2 - nodeW / 2, 50).scale(0.6));
});