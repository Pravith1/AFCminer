/**
 * AFCMiner - Maximal Clique Breakdown: AFC vs WFC
 * Interactive Split-Screen 2D Render Engine
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

  function getNodeColor(nodeObj) {
    if (colorMode === "multidim") {
      return COHORT_COLORS[nodeObj.attribute] || (nodeObj.gender === "female" ? "#ec4899" : "#3b82f6");
    }
    return nodeObj.gender === "female" ? "#ec4899" : "#3b82f6";
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

  // Populate Maximal Clique Dropdown
  function populateMaximalCliqueDropdown() {
    const subsetObj = graphData.subsets[currentSubsetId];
    if (!subsetObj || !subsetObj.maximal_cliques) return;

    mcSelect.innerHTML = "";
    subsetObj.maximal_cliques.forEach((mc, idx) => {
      const option = document.createElement("option");
      option.value = mc.id;
      
      const afcPrunedCnt = mc.afc.derived_cliques[0] ? mc.afc.derived_cliques[0].pruned_nodes.length : 0;
      const wfcPrunedCnt = mc.wfc.derived_cliques[0] ? mc.wfc.derived_cliques[0].pruned_nodes.length : 0;
      
      let statusStr = "";
      if (mc.afc.is_already_fair && mc.wfc.is_already_fair) {
        statusStr = "[Fair] Already Fair (AFC & WFC)";
      } else if (mc.wfc.is_already_fair) {
        statusStr = `[AFC Pruned: ${afcPrunedCnt}] WFC Fair`;
      } else {
        statusStr = `[Pruned: AFC ${afcPrunedCnt} / WFC ${wfcPrunedCnt}]`;
      }

      option.textContent = `${mc.name} - ${mc.gender_counts.female || 0}F / ${mc.gender_counts.male || 0}M (${statusStr})`;
      mcSelect.appendChild(option);
    });

    if (subsetObj.maximal_cliques.length > 0) {
      currentMaximalCliqueId = subsetObj.maximal_cliques[0].id;
      mcSelect.value = currentMaximalCliqueId;
    }
  }

  // --- Main Render Controller ---
  function renderCurrentSelection(overridePrunedStates = null) {
    const subsetObj = graphData.subsets[currentSubsetId];
    if (!subsetObj) return;

    const mc = subsetObj.maximal_cliques.find(item => item.id === currentMaximalCliqueId);
    if (!mc) return;

    const nodesLookup = subsetObj.nodes_lookup;

    // Derived AFC and WFC info
    const afcDerived = mc.afc.derived_cliques[0] || { nodes: mc.nodes, pruned_nodes: [] };
    const wfcDerived = mc.wfc.derived_cliques[0] || { nodes: mc.nodes, pruned_nodes: [] };

    const afcPrunedSet = new Set(overridePrunedStates ? overridePrunedStates.afcPruned : afcDerived.pruned_nodes);
    const wfcPrunedSet = new Set(overridePrunedStates ? overridePrunedStates.wfcPruned : wfcDerived.pruned_nodes);

    // 1. Render Left Panel (AFC)
    renderCliqueGraph(svgAFC, mc.nodes, afcPrunedSet, nodesLookup);
    updatePanelFooter("afc", mc, afcDerived, afcPrunedSet.size, nodesLookup);

    // 2. Render Right Panel (WFC)
    renderCliqueGraph(svgWFC, mc.nodes, wfcPrunedSet, nodesLookup);
    updatePanelFooter("wfc", mc, wfcDerived, wfcPrunedSet.size, nodesLookup);
  }

  // --- 2D Circular Graph Renderer ---
  function renderCliqueGraph(svgElement, cliqueNodeIds, prunedNodeSet, nodesLookup) {
    svgElement.innerHTML = "";

    const width = 500;
    const height = 360;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.36;

    const total = cliqueNodeIds.length;
    const nodePositions = {};

    // Compute node coordinates along circle
    cliqueNodeIds.forEach((nid, i) => {
      const angle = (2 * Math.PI * i) / total - Math.PI / 2;
      nodePositions[nid] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });

    // Create SVG Groups
    const edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const nodeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svgElement.appendChild(edgeGroup);
    svgElement.appendChild(nodeGroup);

    // Draw Edges between all pairs (Clique)
    for (let i = 0; i < total; i++) {
      for (let j = i + 1; j < total; j++) {
        const u = cliqueNodeIds[i];
        const v = cliqueNodeIds[j];

        const isUPruned = prunedNodeSet.has(u);
        const isVPruned = prunedNodeSet.has(v);

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", nodePositions[u].x);
        line.setAttribute("y1", nodePositions[u].y);
        line.setAttribute("x2", nodePositions[v].x);
        line.setAttribute("y2", nodePositions[v].y);

        if (isUPruned || isVPruned) {
          line.setAttribute("class", "svg-edge svg-edge-pruned");
        } else {
          line.setAttribute("class", "svg-edge");
        }

        edgeGroup.appendChild(line);
      }
    }

    // Draw Nodes
    cliqueNodeIds.forEach((nid) => {
      const nObj = nodesLookup[nid];
      const pos = nodePositions[nid];
      const isPruned = prunedNodeSet.has(nid);

      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "svg-node-group");
      g.setAttribute("transform", `translate(${pos.x}, ${pos.y})`);

      // Outer glow / circle
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("r", 18);
      const color = getNodeColor(nObj);
      circle.setAttribute("fill", color);
      circle.setAttribute("class", `svg-node-circle ${isPruned ? "pruned" : "retained"}`);

      // Node Label (Node ID / User Number)
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("class", "svg-node-label");
      label.setAttribute("dy", "4");
      label.textContent = nid.replace("v", "");

      g.appendChild(circle);
      g.appendChild(label);

      // If pruned, append Red ✕ Badge
      if (isPruned) {
        const cross = document.createElementNS("http://www.w3.org/2000/svg", "text");
        cross.setAttribute("class", "svg-cross-badge");
        cross.setAttribute("x", "14");
        cross.setAttribute("y", "-10");
        cross.textContent = "✕";
        g.appendChild(cross);
      }

      // Hover Tooltip Events
      g.addEventListener("mouseenter", (evt) => showTooltip(evt, nObj, isPruned));
      g.addEventListener("mousemove", (evt) => moveTooltip(evt));
      g.addEventListener("mouseleave", hideTooltip);

      nodeGroup.appendChild(g);
    });
  }

  // --- Update Panel KPI Footers ---
  function updatePanelFooter(type, mc, derivedObj, activePrunedCount, nodesLookup) {
    const isAFC = (type === "afc");
    const kpiSize = document.getElementById(`${type}-kpi-size`);
    const kpiPruned = document.getElementById(`${type}-kpi-pruned`);
    const kpiStatus = document.getElementById(`${type}-kpi-status`);

    const femaleBar = document.getElementById(`${type}-female-bar`);
    const maleBar = document.getElementById(`${type}-male-bar`);
    const cntFemale = document.getElementById(`${type}-cnt-female`);
    const cntMale = document.getElementById(`${type}-cnt-male`);
    const parityRatio = document.getElementById(`${type}-parity-ratio`);

    const prunedList = document.getElementById(`${type}-pruned-list`);

    // Retained size
    const retainedSize = mc.size - activePrunedCount;
    kpiSize.textContent = `${retainedSize} / ${mc.size}`;
    kpiPruned.textContent = activePrunedCount;

    // Status
    const isAlready = isAFC ? mc.afc.is_already_fair : mc.wfc.is_already_fair;
    if (activePrunedCount === 0) {
      kpiStatus.textContent = isAlready ? "Natural Fair" : "Full Clique";
      kpiStatus.style.color = "#10b981";
    } else {
      kpiStatus.textContent = isAFC ? "Pruned for Parity" : "Pruned for WFC";
      kpiStatus.style.color = isAFC ? "var(--accent-afc)" : "var(--accent-wfc)";
    }

    // Gender breakdown of retained nodes
    let fCount = 0;
    let mCount = 0;

    const prunedSet = new Set(derivedObj.pruned_nodes);
    mc.nodes.forEach(nid => {
      if (!prunedSet.has(nid)) {
        const g = nodesLookup[nid].gender;
        if (g === "female") fCount++;
        else if (g === "male") mCount++;
      }
    });

    cntFemale.textContent = fCount;
    cntMale.textContent = mCount;

    const totalRetained = fCount + mCount;
    const fPct = totalRetained > 0 ? (fCount / totalRetained) * 100 : 50;
    const mPct = totalRetained > 0 ? (mCount / totalRetained) * 100 : 50;

    femaleBar.style.width = `${fPct}%`;
    maleBar.style.width = `${mPct}%`;
    parityRatio.textContent = `${fCount}F : ${mCount}M`;

    // Render Pruned Nodes Tags
    prunedList.innerHTML = "";
    if (derivedObj.pruned_nodes.length === 0) {
      prunedList.innerHTML = `<span class="tag-none">No nodes pruned (100% Retained)</span>`;
    } else {
      derivedObj.pruned_nodes.forEach(nid => {
        const nObj = nodesLookup[nid];
        const span = document.createElement("span");
        span.className = "tag-pruned";
        span.innerHTML = `<span>Pruned: ${nid} (${nObj.gender[0].toUpperCase()})</span>`;
        prunedList.appendChild(span);
      });
    }
  }



  // --- Tooltip Event Handlers ---
  function showTooltip(evt, nodeObj, isPruned) {
    tooltip.style.display = "flex";
    tooltip.innerHTML = `
      <div class="tooltip-title">User ${nodeObj.id}</div>
      <div>Gender: <b>${nodeObj.gender.toUpperCase()}</b></div>
      <div>Cohort: <b>${nodeObj.year_group}</b></div>
      <div>Degree: <b>${nodeObj.degree}</b></div>
      <div style="margin-top: 4px; font-weight: 700; color: ${isPruned ? 'var(--accent-danger)' : '#10b981'};">
        ${isPruned ? 'PRUNED (Removed for Fairness)' : 'RETAINED in Fair Sub-clique'}
      </div>
    `;
    moveTooltip(evt);
  }

  function moveTooltip(evt) {
    const margin = 16;
    let x = evt.clientX + margin;
    let y = evt.clientY + margin;

    // Keep tooltip inside window boundaries
    const tooltipWidth = tooltip.offsetWidth || 180;
    const tooltipHeight = tooltip.offsetHeight || 120;

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
