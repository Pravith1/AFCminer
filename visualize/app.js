/**
 * AFCMiner - Maximal Clique Breakdown: AFC vs WFC
 * Interactive Visual Split & Fair Sub-clique Render Engine
 */

(function () {
  'use strict';

  // --- State Management ---
  let graphData = null;
  let currentSubsetId = "1";
  let currentMaximalCliqueId = null;
  let colorMode = "gender"; // "gender" | "multidim"

  // --- DOM Elements ---
  const subsetSelect = document.getElementById("subset-select");
  const mcSelect = document.getElementById("mc-select");
  const colorModeSelect = document.getElementById("color-mode-select");
  const tooltip = document.getElementById("tooltip");

  // SVG Viewports
  const svgAFC = document.getElementById("svg-afc");
  const svgWFC = document.getElementById("svg-wfc");

  // --- Cohort Color Palette ---
  const COHORT_COLORS = {
    "female | fresh_soph": "#ec4899",     // Pink
    "female | junior_senior": "#f43f5e",   // Rose / Coral
    "female | grad_other": "#d946ef",      // Magenta
    "male | fresh_soph": "#3b82f6",        // Vibrant Blue
    "male | junior_senior": "#06b6d4",     // Cyan
    "male | grad_other": "#6366f1"         // Indigo
  };

  // --- Sub-clique Color Palette (For Derived Fair Sub-cliques) ---
  const SUBCLIQUE_PALETTE = [
    { fill: "rgba(6, 182, 212, 0.18)", stroke: "#06b6d4", text: "#67e8f9", glow: "rgba(6, 182, 212, 0.5)" },   // Cyan
    { fill: "rgba(168, 85, 247, 0.18)", stroke: "#a855f7", text: "#c084fc", glow: "rgba(168, 85, 247, 0.5)" }, // Purple
    { fill: "rgba(245, 158, 11, 0.18)", stroke: "#f59e0b", text: "#fbbf24", glow: "rgba(245, 158, 11, 0.5)" },  // Amber
    { fill: "rgba(16, 185, 129, 0.18)", stroke: "#10b981", text: "#34d399", glow: "rgba(16, 185, 129, 0.5)" },  // Emerald
    { fill: "rgba(244, 63, 94, 0.18)", stroke: "#f43f5e", text: "#fb7185", glow: "rgba(244, 63, 94, 0.5)" },   // Rose
    { fill: "rgba(56, 189, 248, 0.18)", stroke: "#38bdf8", text: "#7dd3fc", glow: "rgba(56, 189, 248, 0.5)" },  // Sky
    { fill: "rgba(236, 72, 153, 0.18)", stroke: "#ec4899", text: "#f472b6", glow: "rgba(236, 72, 153, 0.5)" },  // Pink
    { fill: "rgba(234, 179, 8, 0.18)", stroke: "#eab308", text: "#fde047", glow: "rgba(234, 179, 8, 0.5)" },   // Yellow
  ];

  function getNodeColor(nodeObj) {
    if (colorMode === "multidim") {
      return COHORT_COLORS[nodeObj.attribute] || (nodeObj.gender === "female" ? "#ec4899" : "#3b82f6");
    }
    return nodeObj.gender === "female" ? "#ec4899" : "#3b82f6";
  }

  // --- Geometry Helpers for Smooth SVG Convex Hulls & Blobs ---
  function crossProduct(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  function getConvexHull(points) {
    const pts = points.slice().sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    if (pts.length <= 2) return pts;

    const lower = [];
    for (let p of pts) {
      while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      let p = pts[i];
      while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function generateSubcliqueBlobPath(points, padding = 24) {
    if (!points || points.length === 0) return "";

    if (points.length === 1) {
      const p = points[0];
      return `M ${p.x - padding} ${p.y} A ${padding} ${padding} 0 1 0 ${p.x + padding} ${p.y} A ${padding} ${padding} 0 1 0 ${p.x - padding} ${p.y}`;
    }

    if (points.length === 2) {
      const p1 = points[0];
      const p2 = points[1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      const p1a = { x: p1.x + nx * padding, y: p1.y + ny * padding };
      const p1b = { x: p1.x - nx * padding, y: p1.y - ny * padding };
      const p2a = { x: p2.x + nx * padding, y: p2.y + ny * padding };
      const p2b = { x: p2.x - nx * padding, y: p2.y - ny * padding };

      return `M ${p1a.x} ${p1a.y} L ${p2a.x} ${p2a.y} A ${padding} ${padding} 0 0 1 ${p2b.x} ${p2b.y} L ${p1b.x} ${p1b.y} A ${padding} ${padding} 0 0 1 ${p1a.x} ${p1a.y} Z`;
    }

    // 3 or more points: Convex Hull with Rounded Offset Corner Arcs
    const hull = getConvexHull(points);
    const n = hull.length;
    if (n === 2) {
      return generateSubcliqueBlobPath(hull, padding);
    }

    const offsetEdges = [];
    for (let i = 0; i < n; i++) {
      const p1 = hull[i];
      const p2 = hull[(i + 1) % n];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      offsetEdges.push({
        p1: { x: p1.x + nx * padding, y: p1.y + ny * padding },
        p2: { x: p2.x + nx * padding, y: p2.y + ny * padding },
        vertex: p2
      });
    }

    let pathStr = `M ${offsetEdges[0].p1.x} ${offsetEdges[0].p1.y}`;
    for (let i = 0; i < n; i++) {
      const currentEdge = offsetEdges[i];
      const nextEdge = offsetEdges[(i + 1) % n];
      pathStr += ` L ${currentEdge.p2.x} ${currentEdge.p2.y}`;
      pathStr += ` A ${padding} ${padding} 0 0 1 ${nextEdge.p1.x} ${nextEdge.p1.y}`;
    }
    pathStr += " Z";

    return pathStr;
  }

  // --- Initialization ---
  function init() {
    if (window.GRAPH_DATA) {
      graphData = window.GRAPH_DATA;
    } else {
      console.error("GRAPH_DATA not loaded");
      return;
    }

    // Bind Event Listeners
    subsetSelect.addEventListener("change", (e) => {
      currentSubsetId = e.target.value;
      populateMaximalCliqueDropdown();
      renderCurrentSelection();
    });

    mcSelect.addEventListener("change", (e) => {
      currentMaximalCliqueId = e.target.value;
      renderCurrentSelection();
    });

    colorModeSelect.addEventListener("change", (e) => {
      colorMode = e.target.value;
      renderCurrentSelection();
    });

    // Initial Population
    populateMaximalCliqueDropdown();
    renderCurrentSelection();
  }

  // Populate Maximal Clique Dropdown with split summary
  function populateMaximalCliqueDropdown() {
    const subsetObj = graphData.subsets[currentSubsetId];
    if (!subsetObj || !subsetObj.maximal_cliques) return;

    mcSelect.innerHTML = "";
    subsetObj.maximal_cliques.forEach((mc) => {
      const option = document.createElement("option");
      option.value = mc.id;
      
      const afcCount = mc.afc.derived_cliques.length;
      const wfcCount = mc.wfc.derived_cliques.length;
      
      let afcStatus = mc.afc.is_already_fair ? "Intact Fair" : `Split into ${afcCount} Cliques`;
      let wfcStatus = mc.wfc.is_already_fair ? "Intact Fair" : `Split into ${wfcCount} Cliques`;
      
      option.textContent = `${mc.name} - ${mc.gender_counts.female || 0}F / ${mc.gender_counts.male || 0}M (AFC: ${afcStatus} | WFC: ${wfcStatus})`;
      mcSelect.appendChild(option);
    });

    if (subsetObj.maximal_cliques.length > 0) {
      currentMaximalCliqueId = subsetObj.maximal_cliques[0].id;
      mcSelect.value = currentMaximalCliqueId;
    }
  }

  // --- Main Render Controller ---
  function renderCurrentSelection() {
    const subsetObj = graphData.subsets[currentSubsetId];
    if (!subsetObj) return;

    const mc = subsetObj.maximal_cliques.find(item => item.id === currentMaximalCliqueId);
    if (!mc) return;

    const nodesLookup = subsetObj.nodes_lookup;

    // 1. Render Left Panel (AFC - Absolute Fair Clique)
    renderCliquePanel("afc", svgAFC, mc, mc.afc.derived_cliques, nodesLookup);

    // 2. Render Right Panel (WFC - Weak Fair Clique)
    renderCliquePanel("wfc", svgWFC, mc, mc.wfc.derived_cliques, nodesLookup);
  }

  // --- Render Single Panel (AFC or WFC) ---
  function renderCliquePanel(type, svgElement, mc, derivedCliques, nodesLookup) {
    svgElement.innerHTML = "";

    const width = 500;
    const height = 360;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.36;

    const cliqueNodeIds = mc.nodes;
    const totalNodes = cliqueNodeIds.length;
    const nodePositions = {};

    // 1. Calculate circular node layout positions for ALL maximal clique nodes
    cliqueNodeIds.forEach((nid, i) => {
      const angle = (2 * Math.PI * i) / totalNodes - Math.PI / 2;
      nodePositions[nid] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });

    // 2. Create SVG Layer Groups (Order: Hulls -> Edges -> Nodes)
    const hullGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");

    svgElement.appendChild(hullGroup);
    svgElement.appendChild(edgeGroup);
    svgElement.appendChild(nodeGroup);

    // 3. Draw Sub-clique Convex Hull / Bubble Overlays for each derived fair clique
    derivedCliques.forEach((subItem, idx) => {
      const style = SUBCLIQUE_PALETTE[idx % SUBCLIQUE_PALETTE.length];
      const subPoints = subItem.nodes.map(nid => nodePositions[nid]).filter(Boolean);

      const pathStr = generateSubcliqueBlobPath(subPoints, 24);
      if (pathStr) {
        const hullPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        hullPath.setAttribute("d", pathStr);
        hullPath.setAttribute("class", "svg-subclique-hull");
        hullPath.setAttribute("fill", style.fill);
        hullPath.setAttribute("stroke", style.stroke);
        hullPath.setAttribute("stroke-width", "2.5");
        hullPath.setAttribute("data-subclique-id", subItem.id);
        hullPath.setAttribute("data-panel", type);

        // Hover interaction on hull
        hullPath.addEventListener("mouseenter", () => highlightSubclique(type, subItem.id, idx));
        hullPath.addEventListener("mouseleave", () => resetSubcliqueHighlights(type));

        hullGroup.appendChild(hullPath);
      }
    });

    // 4. Determine node-to-subclique & edge-to-subclique memberships
    const edgeSubcliquesMap = {}; // key: "u-v", val: array of subclique indices
    const nodeSubcliquesMap = {}; // key: node, val: array of subclique indices

    cliqueNodeIds.forEach(nid => { nodeSubcliquesMap[nid] = []; });

    derivedCliques.forEach((subItem, subIdx) => {
      subItem.nodes.forEach(nid => {
        if (nodeSubcliquesMap[nid]) nodeSubcliquesMap[nid].push(subIdx);
      });

      const sNodes = subItem.nodes;
      for (let i = 0; i < sNodes.length; i++) {
        for (let j = i + 1; j < sNodes.length; j++) {
          const u = sNodes[i];
          const v = sNodes[j];
          const edgeKey = u < v ? `${u}-${v}` : `${v}-${u}`;
          if (!edgeSubcliquesMap[edgeKey]) edgeSubcliquesMap[edgeKey] = [];
          edgeSubcliquesMap[edgeKey].push(subIdx);
        }
      }
    });

    // 5. Draw Edges between all pairs of maximal clique nodes
    for (let i = 0; i < totalNodes; i++) {
      for (let j = i + 1; j < totalNodes; j++) {
        const u = cliqueNodeIds[i];
        const v = cliqueNodeIds[j];
        const edgeKey = u < v ? `${u}-${v}` : `${v}-${u}`;
        const matchingSubIdxs = edgeSubcliquesMap[edgeKey] || [];

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", nodePositions[u].x);
        line.setAttribute("y1", nodePositions[u].y);
        line.setAttribute("x2", nodePositions[v].x);
        line.setAttribute("y2", nodePositions[v].y);
        line.setAttribute("data-u", u);
        line.setAttribute("data-v", v);

        if (matchingSubIdxs.length > 0) {
          // Valid edge within at least one derived fair sub-clique
          const firstSubStyle = SUBCLIQUE_PALETTE[matchingSubIdxs[0] % SUBCLIQUE_PALETTE.length];
          line.setAttribute("class", "svg-edge svg-edge-valid");
          line.setAttribute("stroke", firstSubStyle.stroke);
          line.setAttribute("data-subcliques", matchingSubIdxs.join(","));
        } else {
          // Broken edge (Does NOT belong to any derived fair sub-clique)
          line.setAttribute("class", "svg-edge svg-edge-broken");
          line.setAttribute("data-broken", "true");
        }

        // Broken Edge Hover Tooltip
        line.addEventListener("mouseenter", (evt) => {
          if (matchingSubIdxs.length === 0) {
            showEdgeTooltip(evt, u, v, nodesLookup);
          }
        });
        line.addEventListener("mousemove", moveTooltip);
        line.addEventListener("mouseleave", hideTooltip);

        edgeGroup.appendChild(line);
      }
    }

    // 6. Draw Nodes for ALL maximal clique members
    cliqueNodeIds.forEach((nid) => {
      const nObj = nodesLookup[nid];
      const pos = nodePositions[nid];
      const memberSubIdxs = nodeSubcliquesMap[nid] || [];
      const isAssigned = memberSubIdxs.length > 0;

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", `svg-node-group ${isAssigned ? "" : "svg-node-unassigned"}`);
      g.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);
      g.setAttribute("data-node-id", nid);
      g.setAttribute("data-subcliques", memberSubIdxs.join(","));

      // Outer circle
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", 18);
      const color = getNodeColor(nObj);
      circle.setAttribute("fill", color);
      circle.setAttribute("class", "svg-node-circle");

      // Node ID Label
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "svg-node-label");
      label.setAttribute("dy", "4");
      label.textContent = nid.replace("v", "");

      g.appendChild(circle);
      g.appendChild(label);

      // Hover Tooltip Events
      g.addEventListener("mouseenter", (evt) => showNodeTooltip(evt, nObj, memberSubIdxs, derivedCliques, type));
      g.addEventListener("mousemove", moveTooltip);
      g.addEventListener("mouseleave", hideTooltip);

      nodeGroup.appendChild(g);
    });

    // 7. Update Footer KPI Cards & Derived Sub-cliques List Breakdown
    updatePanelFooter(type, mc, derivedCliques, nodesLookup);
  }

  // --- Update Panel KPI Cards & Derived Sub-clique Breakdown List ---
  function updatePanelFooter(type, mc, derivedCliques, nodesLookup) {
    const isAFC = (type === "afc");
    const kpiSubcliques = document.getElementById(`${type}-kpi-subcliques`);
    const kpiCoverage = document.getElementById(`${type}-kpi-coverage`);
    const kpiStatus = document.getElementById(`${type}-kpi-status`);

    const femaleBar = document.getElementById(`${type}-female-bar`);
    const maleBar = document.getElementById(`${type}-male-bar`);
    const cntFemale = document.getElementById(`${type}-cnt-female`);
    const cntMale = document.getElementById(`${type}-cnt-male`);
    const parityRatio = document.getElementById(`${type}-parity-ratio`);

    const subcliqueBadge = document.getElementById(`${type}-subclique-badge`);
    const subcliquesList = document.getElementById(`${type}-subcliques-list`);

    // Number of derived subcliques
    kpiSubcliques.textContent = derivedCliques.length;

    // Node coverage: Unique nodes in derived fair subcliques / total nodes
    const coveredNodesSet = new Set();
    derivedCliques.forEach(sub => sub.nodes.forEach(nid => coveredNodesSet.add(nid)));
    kpiCoverage.textContent = `${coveredNodesSet.size} / ${mc.size}`;

    // Split Status
    const isAlreadyFair = isAFC ? mc.afc.is_already_fair : mc.wfc.is_already_fair;
    if (isAlreadyFair) {
      kpiStatus.textContent = "Intact Fair";
      kpiStatus.style.color = "#10b981";
    } else {
      kpiStatus.textContent = `Split (${derivedCliques.length})`;
      kpiStatus.style.color = isAFC ? "var(--accent-afc)" : "var(--accent-wfc)";
    }

    // Demographic breakdown of Maximal Clique
    let fCount = mc.gender_counts.female || 0;
    let mCount = mc.gender_counts.male || 0;
    cntFemale.textContent = fCount;
    cntMale.textContent = mCount;

    const totalNodes = fCount + mCount;
    const fPct = totalNodes > 0 ? (fCount / totalNodes) * 100 : 50;
    const mPct = totalNodes > 0 ? (mCount / totalNodes) * 100 : 50;

    femaleBar.style.width = `${fPct}%`;
    maleBar.style.width = `${mPct}%`;
    parityRatio.textContent = `${fCount}F : ${mCount}M`;

    subcliqueBadge.textContent = `${derivedCliques.length} ${derivedCliques.length === 1 ? 'Clique' : 'Cliques'}`;

    // Render Sub-clique Cards Breakdown
    subcliquesList.innerHTML = "";
    if (derivedCliques.length === 0) {
      subcliquesList.innerHTML = `<span class="tag-none">No fair sub-cliques derived</span>`;
      return;
    }

    derivedCliques.forEach((subItem, idx) => {
      const style = SUBCLIQUE_PALETTE[idx % SUBCLIQUE_PALETTE.length];
      const card = document.createElement("div");
      card.className = "subclique-chip";
      card.setAttribute("data-subclique-id", subItem.id);

      const fSub = subItem.gender_counts.female || 0;
      const mSub = subItem.gender_counts.male || 0;

      card.innerHTML = `
        <div class="subclique-chip-left">
          <div class="subclique-color-dot" style="background: ${style.stroke}; color: ${style.stroke};"></div>
          <div>
            <span class="subclique-chip-name">Sub-clique #${idx + 1} (${subItem.size} Nodes)</span>
            <div class="subclique-chip-nodes">Nodes: ${subItem.nodes.join(", ")}</div>
          </div>
        </div>
        <div class="subclique-chip-right">
          <span class="badge-ratio">${fSub}F : ${mSub}M</span>
        </div>
      `;

      card.addEventListener("mouseenter", () => highlightSubclique(type, subItem.id, idx));
      card.addEventListener("mouseleave", () => resetSubcliqueHighlights(type));

      subcliquesList.appendChild(card);
    });
  }

  // --- Interactive Highlight Handler for Derived Sub-cliques ---
  function highlightSubclique(panelType, subcliqueId, subcliqueIdx = null) {
    const svgElement = (panelType === "afc") ? svgAFC : svgWFC;
    if (!svgElement) return;

    const subsetObj = graphData.subsets[currentSubsetId];
    if (!subsetObj) return;
    const mc = subsetObj.maximal_cliques.find(item => item.id === currentMaximalCliqueId);
    if (!mc) return;

    const derivedCliques = (panelType === "afc") ? mc.afc.derived_cliques : mc.wfc.derived_cliques;
    if (subcliqueIdx === null) {
      subcliqueIdx = derivedCliques.findIndex(s => s.id === subcliqueId);
    }
    if (subcliqueIdx < 0) return;

    const subItem = derivedCliques[subcliqueIdx];
    const memberNodesSet = new Set(subItem.nodes);

    // 1. Highlight Subclique Hulls
    const hulls = svgElement.querySelectorAll(".svg-subclique-hull");
    hulls.forEach(hull => {
      if (hull.getAttribute("data-subclique-id") === subcliqueId) {
        hull.classList.add("highlighted");
        hull.classList.remove("dimmed");
      } else {
        hull.classList.add("dimmed");
        hull.classList.remove("highlighted");
      }
    });

    // 2. Highlight Nodes
    const nodes = svgElement.querySelectorAll(".svg-node-group");
    nodes.forEach(node => {
      const nid = node.getAttribute("data-node-id");
      if (memberNodesSet.has(nid)) {
        node.classList.add("highlighted");
        node.classList.remove("dimmed");
      } else {
        node.classList.add("dimmed");
        node.classList.remove("highlighted");
      }
    });

    // 3. Highlight Edges
    const edges = svgElement.querySelectorAll(".svg-edge");
    edges.forEach(edge => {
      const u = edge.getAttribute("data-u");
      const v = edge.getAttribute("data-v");
      if (memberNodesSet.has(u) && memberNodesSet.has(v)) {
        edge.classList.add("highlighted");
        edge.classList.remove("dimmed");
      } else {
        edge.classList.add("dimmed");
        edge.classList.remove("highlighted");
      }
    });

    // 4. Highlight Card in list
    const cards = document.querySelectorAll(`#${panelType}-subcliques-list .subclique-chip`);
    cards.forEach(card => {
      if (card.getAttribute("data-subclique-id") === subcliqueId) {
        card.classList.add("active");
      } else {
        card.classList.remove("active");
      }
    });
  }

  function resetSubcliqueHighlights(panelType) {
    const svgElement = (panelType === "afc") ? svgAFC : svgWFC;
    if (!svgElement) return;

    // Reset Hulls
    const hulls = svgElement.querySelectorAll(".svg-subclique-hull");
    hulls.forEach(hull => {
      hull.classList.remove("highlighted", "dimmed");
    });

    // Reset Nodes
    const nodes = svgElement.querySelectorAll(".svg-node-group");
    nodes.forEach(node => {
      node.classList.remove("highlighted", "dimmed");
    });

    // Reset Edges
    const edges = svgElement.querySelectorAll(".svg-edge");
    edges.forEach(edge => {
      edge.classList.remove("highlighted", "dimmed");
    });

    // Reset Cards
    const cards = document.querySelectorAll(`#${panelType}-subcliques-list .subclique-chip`);
    cards.forEach(card => {
      card.classList.remove("active");
    });
  }

  // --- Tooltips ---
  function showNodeTooltip(evt, nodeObj, memberSubIdxs, derivedCliques, type) {
    tooltip.style.display = "flex";

    let subcliquesStr = "";
    if (memberSubIdxs.length === 0) {
      subcliquesStr = `<span style="color: var(--accent-danger);">Not in any derived ${type.toUpperCase()} clique</span>`;
    } else {
      const names = memberSubIdxs.map(idx => `Sub-clique #${idx + 1}`).join(", ");
      subcliquesStr = `<span style="color: #10b981;">Member of ${names}</span>`;
    }

    tooltip.innerHTML = `
      <div class="tooltip-title">User ${nodeObj.id}</div>
      <div>Gender: <b>${nodeObj.gender.toUpperCase()}</b></div>
      <div>Cohort: <b>${nodeObj.year_group}</b></div>
      <div>Degree: <b>${nodeObj.degree}</b></div>
      <div style="margin-top: 4px; font-weight: 700; font-size: 0.75rem;">
        ${subcliquesStr}
      </div>
    `;
    moveTooltip(evt);
  }

  function showEdgeTooltip(evt, u, v, nodesLookup) {
    tooltip.style.display = "flex";
    const uObj = nodesLookup[u];
    const vObj = nodesLookup[v];

    tooltip.innerHTML = `
      <div class="tooltip-title" style="color: #f87171;">Broken Fair Edge (${u} ⟷ ${v})</div>
      <div>Node ${u}: <b>${uObj.gender.toUpperCase()}</b></div>
      <div>Node ${v}: <b>${vObj.gender.toUpperCase()}</b></div>
      <div style="margin-top: 4px; font-size: 0.73rem; color: #fca5a5; max-width: 200px;">
        ⚠️ Pair cannot co-exist in any derived fair clique due to demographic parity requirements.
      </div>
    `;
    moveTooltip(evt);
  }

  function moveTooltip(evt) {
    const margin = 16;
    let x = evt.clientX + margin;
    let y = evt.clientY + margin;

    const tooltipWidth = tooltip.offsetWidth || 200;
    const tooltipHeight = tooltip.offsetHeight || 130;

    if (x + tooltipWidth > window.innerWidth) {
      x = evt.clientX - tooltipWidth - margin;
    }
    if (y + tooltipHeight > window.innerHeight) {
      y = evt.clientY - tooltipHeight - margin;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  function hideTooltip() {
    tooltip.style.display = "none";
  }

  // Start app on DOM loaded
  document.addEventListener("DOMContentLoaded", init);

})();
