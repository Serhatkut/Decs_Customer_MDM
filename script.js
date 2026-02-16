const svg = d3.select("#viz")
const g = svg.append("g")

const zoom = d3.zoom().on("zoom", e => g.attr("transform", e.transform))
svg.call(zoom)

document.getElementById("resetZoom").onclick = () => {
    svg.transition().call(zoom.transform, d3.zoomIdentity)
}

Promise.all([
    fetch("./data/customerData.json").then(r => r.json()),
    fetch("./data/reference_master_data.json").then(r => r.json())
]).then(([data, ref]) => init(data, ref))

function init(data, ref) {

    const scenarioSelect = document.getElementById("scenarioSelect")

    data.forEach((s, i) => {
        let o = document.createElement("option")
        o.value = i
        o.text = s.scenarioName
        scenarioSelect.appendChild(o)
    })

    scenarioSelect.onchange = () => draw(data[scenarioSelect.value])

    draw(data[0])

    function draw(sc) {

        g.selectAll("*").remove()

        let nodes = []
        let links = []

        nodes.push({ id: "root", label: sc.customer.tradingName, type: "global" })

        sc.accounts.forEach(a => {
            nodes.push({ id: a.mdmAccountId, label: a.mdmAccountId, type: "account" })
            links.push({ s: "root", t: a.mdmAccountId })

            a.addresses?.forEach(ad => {
                let id = a.mdmAccountId + "ad" + Math.random()
                nodes.push({ id, label: ad.city, type: "address" })
                links.push({ s: a.mdmAccountId, t: id })
            })

            a.contactPersons?.forEach(c => {
                let id = a.mdmAccountId + "c" + Math.random()
                nodes.push({ id, label: c.firstName, type: "contact" })
                links.push({ s: a.mdmAccountId, t: id })
            })
        })

        const sim = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(130))
            .force("charge", d3.forceManyBody().strength(-400))
            .force("center", d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))

        const link = g.selectAll("line")
            .data(links)
            .enter().append("line")
            .attr("stroke", "#bbb")

        const node = g.selectAll("rect")
            .data(nodes)
            .enter().append("rect")
            .attr("class", d => "node " + d.type)
            .attr("width", 160)
            .attr("height", 50)
            .on("click", (e, d) => showInfo(d))

        const label = g.selectAll("text")
            .data(nodes)
            .enter().append("text")
            .text(d => d.label)
            .attr("font-size", 12)
            .attr("text-anchor", "middle")
            .attr("dy", "1.6em")

        sim.on("tick", () => {
            node.attr("x", d => d.x - 80).attr("y", d => d.y - 25)
            label.attr("x", d => d.x).attr("y", d => d.y - 10)
            link.attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y)
        })
    }

    function showInfo(d) {
        document.getElementById("selectedInfo").innerHTML =
            `<div class="card"><b>${d.label}</b><br>Type: ${d.type}</div>`

        document.getElementById("prettyJson").innerHTML =
            `<div class="card">Readable object view<br>ID: ${d.id}</div>`

        document.getElementById("meaningBox").innerHTML =
            `<div class="card">Customer Type:<br><b>${d.type.toUpperCase()}</b></div>`
    }

    document.getElementById("toggleInspector").onclick = () => {
        document.getElementById("sidebar").classList.toggle("collapsed")
    }

    document.querySelectorAll(".legend input").forEach(ch => {
        ch.onchange = e => {
            let t = e.target.dataset.type
            d3.selectAll("." + t).style("display", e.target.checked ? "" : "none")
        }
    })
}