// State management
let graphDataPayload = null;
let currentSubsetKey = "1";
let activeCliqueFilter = "all"; // 'all', 'afc', 'wfc', 'both'
let topNLimit = 5;
let selectedClique = null;
let colorMode = "gender"; // 'gender', 'multidim', 'role'
let isolateMode = false;
let backgroundEdgeOpacity = 0.08;
let isAutoRotating = false;

// Palette constants
const COLORS = {
  afc: "#00f0ff",
  wfc: "#ff9f1c",
  both: "#e040fb",
  female: "#f43f5e",
  male: "#06b6d4",
  femaleJrSr: "#f43f5e",
  femaleFrSo: "#fb923c",
  maleJrSr: "#06b6d4",
  maleFrSo: "#a855f7",
  bgNode: "#334155",
  bgEdge: "rgba(100, 116, 139, 0.2)"
};

// Initialize 3D Force Graph
const elem = document.getElementById('3d-graph');
const Graph = ForceGraph3D()(elem)
  .backgroundColor('#070a12')
  .showNavInfo(false)
  .nodeRelSize(5)
  .nodeResolution(16)
  .linkResolution(6)
  .nodeLabel(node => `
    <div style="background: rgba(13, 20, 36, 0.95); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(99,133,200,0.4); font-family: Outfit, sans-serif;">
      <div style="font-weight:700; color:#fff; font-size:14px;">${node.label}</div>
      <div style="color:#94a3b8; font-size:12px; margin-top:2px;">Gender: <b style="color:${node.gender === 'female' ? COLORS.female : COLORS.male}">${node.gender}</b></div>
      <div style="color:#94a3b8; font-size:12px;">Cohort: <b>${node.year_group}</b></div>
      <div style="color:#94a3b8; font-size:12px;">Degree: <b>${node.degree}</b></div>
      ${node.__cliques && node.__cliques.length ? `<div style="margin-top:4px; font-size:11px; color:#00f0ff;">In ${node.__cliques.length} Clique(s): ${node.__cliques.join(', ')}</div>` : ''}
    </div>
  `)
  .nodeColor(getNodeColor)
  .nodeVal(getNodeVal)
  .linkColor(getLinkColor)
  .linkWidth(getLinkWidth)
  .linkDirectionalParticles(getLinkParticles)
  .linkDirectionalParticleWidth(1.6)
  .linkDirectionalParticleSpeed(0.008)
  .onNodeClick(node => {
    // Smoothly fly camera to center on clicked node
    const distance = 120;
    const distRatio = 1 + distance / Math.hypot(node.x, node.y, node.z);
    Graph.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
      node,
      1500
    );
  });

// Load data with fallback support (fetch JSON or window.GRAPH_DATA from network_data.js)
async function initData() {
  if (window.GRAPH_DATA) {
    graphDataPayload = window.GRAPH_DATA;
  } else {
    try {
      const res = await fetch('network_data.json');
      graphDataPayload = await res.json();
    } catch (e) {
      console.error("Failed to fetch network_data.json, checking window.GRAPH_DATA fallback...", e);
    }
  }

  if (!graphDataPayload) {
    alert("Failed to load graph data. Please verify network_data.json exists.");
    return;
  }

  setupEventListeners();
  loadSubsetValue(currentSubsetKey);
}

function setupEventListeners() {
  // Subset dropdown
  const subsetSelect = document.getElementById('subset-select');
  subsetSelect.addEventListener('change', (e) => {
    currentSubsetKey = e.target.value;
    document.getElementById('subset-tag').textContent = `SubSet ${currentSubsetKey}`;
    loadSubsetValue(currentSubsetKey);
  });

  // Filter tabs
  const tabs = document.querySelectorAll('#clique-filter-tabs button');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeCliqueFilter = tab.dataset.filter;
      updateCliqueList();
      updateGraphVisuals();
    });
  });

  // Top N slider
  const topNSlider = document.getElementById('top-n-slider');
  const topNLabel = document.getElementById('top-n-label');
  topNSlider.addEventListener('input', (e) => {
    topNLimit = parseInt(e.target.value, 10);
    topNLabel.textContent = `Top ${topNLimit}`;
    updateGraphVisuals();
  });

  // Clique specific dropdown
  const cliqueSelect = document.getElementById('clique-select');
  cliqueSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) {
      selectedClique = null;
      resetInspector();
    } else {
      const allCliques = getAllCliquesForSubset(currentSubsetKey);
      selectedClique = allCliques.find(c => c.id === val);
      populateInspector(selectedClique);
      focusCameraOnClique(selectedClique);
    }
    updateGraphVisuals();
  });

  // Color Mode
  const colorSelect = document.getElementById('color-mode-select');
  colorSelect.addEventListener('change', (e) => {
    colorMode = e.target.value;
    updateLegend();
    updateGraphVisuals();
  });

  // Isolate Mode
  const isolateToggle = document.getElementById('isolate-toggle');
  isolateToggle.addEventListener('change', (e) => {
    isolateMode = e.target.checked;
    refreshGraphData();
  });

  // Edge Opacity Slider
  const edgeOpacitySlider = document.getElementById('edge-opacity-slider');
  const edgeOpacityLabel = document.getElementById('edge-opacity-label');
  edgeOpacitySlider.addEventListener('input', (e) => {
    backgroundEdgeOpacity = parseFloat(e.target.value);
    edgeOpacityLabel.textContent = backgroundEdgeOpacity.toFixed(2);
    updateGraphVisuals();
  });

  // Action buttons
  document.getElementById('btn-reset-camera').addEventListener('click', () => {
    Graph.cameraPosition({ x: 0, y: 0, z: 450 }, { x: 0, y: 0, z: 0 }, 1200);
  });

  const spinBtn = document.getElementById('btn-toggle-spin');
  spinBtn.addEventListener('click', () => {
    isAutoRotating = !isAutoRotating;
    spinBtn.style.background = isAutoRotating ? 'rgba(37, 99, 235, 0.4)' : '';
  });

  // Auto rotation ticker
  let angle = 0;
  setInterval(() => {
    if (isAutoRotating) {
      angle += Math.PI / 800;
      const distance = 420;
      Graph.cameraPosition({
        x: distance * Math.sin(angle),
        z: distance * Math.cos(angle)
      });
    }
  }, 30);
}

// Retrieve active subset data
function getActiveSubset() {
  return graphDataPayload.subsets[currentSubsetKey];
}

function getAllCliquesForSubset(subKey) {
  const sub = graphDataPayload.subsets[subKey];
  return [...sub.afc_cliques, ...sub.wfc_cliques];
}

function getFilteredCliques() {
  const sub = getActiveSubset();
  let list = [];
  if (activeCliqueFilter === 'all') {
    list = [...sub.afc_cliques, ...sub.wfc_cliques];
  } else if (activeCliqueFilter === 'afc') {
    list = sub.afc_cliques;
  } else if (activeCliqueFilter === 'wfc') {
    list = sub.wfc_cliques;
  } else if (activeCliqueFilter === 'both') {
    list = sub.afc_cliques.filter(c => c.is_also_other);
  }
  return list;
}

function loadSubsetValue(key) {
  const sub = graphDataPayload.subsets[key];
  if (!sub) return;

  // Update KPI banner
  document.getElementById('kpi-nodes').textContent = sub.node_count;
  document.getElementById('kpi-edges').textContent = sub.edge_count;
  document.getElementById('kpi-afc').textContent = sub.stats.total_afc;
  document.getElementById('kpi-wfc').textContent = sub.stats.total_wfc;
  document.getElementById('kpi-overlap').textContent = sub.stats.overlapping_cliques;

  // Adjust slider max to available cliques
  const totalCliques = sub.afc_cliques.length + sub.wfc_cliques.length;
  const topNSlider = document.getElementById('top-n-slider');
  topNSlider.max = Math.max(1, totalCliques);
  if (topNLimit > totalCliques) topNLimit = Math.min(5, totalCliques);
  topNSlider.value = topNLimit;
  document.getElementById('top-n-label').textContent = `Top ${topNLimit}`;

  // Reset selection
  selectedClique = null;
  resetInspector();

  // Populate dropdown & legend
  updateCliqueList();
  updateLegend();

  // Render Graph
  refreshGraphData();

  // Auto-focus first AFC clique if available
  if (sub.afc_cliques.length > 0) {
    setTimeout(() => {
      const firstAfc = sub.afc_cliques[0];
      document.getElementById('clique-select').value = firstAfc.id;
      selectedClique = firstAfc;
      populateInspector(firstAfc);
      focusCameraOnClique(firstAfc);
      updateGraphVisuals();
    }, 1000);
  }
}

function updateCliqueList() {
  const select = document.getElementById('clique-select');
  select.innerHTML = '<option value="">-- Select a Clique to Focus --</option>';

  const filtered = getFilteredCliques();
  filtered.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    const tag = c.is_also_other ? '[AFC & WFC]' : `[${c.type}]`;
    const femCount = c.gender_counts.female || 0;
    const maleCount = c.gender_counts.male || 0;
    opt.textContent = `${tag} ${c.id} (Size ${c.size}) • ${femCount}F, ${maleCount}M`;
    select.appendChild(opt);
  });
}

function refreshGraphData() {
  const sub = getActiveSubset();

  // Pre-tag nodes with their clique memberships
  const nodeCliqueMap = {};
  sub.nodes.forEach(n => nodeCliqueMap[n.id] = []);
  [...sub.afc_cliques, ...sub.wfc_cliques].forEach(c => {
    c.nodes.forEach(nid => {
      if (nodeCliqueMap[nid] && !nodeCliqueMap[nid].includes(c.id)) {
        nodeCliqueMap[nid].push(c.id);
      }
    });
  });

  let nodes = sub.nodes.map(n => ({
    ...n,
    __cliques: nodeCliqueMap[n.id] || []
  }));

  let links = sub.links.map(l => ({ ...l }));

  // If isolateMode is on, filter to only nodes belonging to active visible cliques
  if (isolateMode) {
    const activeCliques = getActiveVisibleCliques();
    const activeNodeIds = new Set();
    activeCliques.forEach(c => c.nodes.forEach(nid => activeNodeIds.add(nid)));

    if (activeNodeIds.size > 0) {
      nodes = nodes.filter(n => activeNodeIds.has(n.id));
      links = links.filter(l => activeNodeIds.has(l.source.id || l.source) && activeNodeIds.has(l.target.id || l.target));
    }
  }

  Graph.graphData({ nodes, links });
  updateGraphVisuals();
}

function getActiveVisibleCliques() {
  if (selectedClique) {
    return [selectedClique];
  }
  const filtered = getFilteredCliques();
  return filtered.slice(0, topNLimit);
}

function updateGraphVisuals() {
  Graph.nodeColor(getNodeColor)
       .nodeVal(getNodeVal)
       .linkColor(getLinkColor)
       .linkWidth(getLinkWidth)
       .linkDirectionalParticles(getLinkParticles);
}

// Node Visual Properties
function getNodeColor(node) {
  const visibleCliques = getActiveVisibleCliques();
  const inVisibleClique = visibleCliques.some(c => c.nodes.includes(node.id));

  if (colorMode === "gender") {
    if (!inVisibleClique && !isolateMode) {
      return node.gender === "female" ? "rgba(244, 63, 94, 0.25)" : "rgba(6, 182, 212, 0.25)";
    }
    return node.gender === "female" ? COLORS.female : COLORS.male;
  } 
  else if (colorMode === "multidim") {
    const key = `${node.gender} | ${node.year_group}`;
    let baseColor = COLORS.maleFrSo;
    if (key === "female | junior_senior") baseColor = COLORS.femaleJrSr;
    else if (key === "female | fresh_soph") baseColor = COLORS.femaleFrSo;
    else if (key === "male | junior_senior") baseColor = COLORS.maleJrSr;

    if (!inVisibleClique && !isolateMode) {
      return hexToRgba(baseColor, 0.25);
    }
    return baseColor;
  }
  else { // 'role'
    const inAfc = getActiveSubset().afc_cliques.some(c => c.nodes.includes(node.id));
    const inWfc = getActiveSubset().wfc_cliques.some(c => c.nodes.includes(node.id));

    if (inAfc && inWfc) return COLORS.both;
    if (inAfc) return COLORS.afc;
    if (inWfc) return COLORS.wfc;
    return COLORS.bgNode;
  }
}

function getNodeVal(node) {
  const visibleCliques = getActiveVisibleCliques();
  const inVisibleClique = visibleCliques.some(c => c.nodes.includes(node.id));

  if (selectedClique && selectedClique.nodes.includes(node.id)) {
    return 9; // Large prominent sphere for focused clique
  }
  if (inVisibleClique) {
    return 6;
  }
  return 2.5; // Dim smaller background sphere
}

// Link Visual Properties
function getLinkColor(link) {
  const u = link.source.id || link.source;
  const v = link.target.id || link.target;

  const visibleCliques = getActiveVisibleCliques();
  for (let c of visibleCliques) {
    if (c.nodes.includes(u) && c.nodes.includes(v)) {
      if (c.is_also_other) return COLORS.both;
      return c.type === "AFC" ? COLORS.afc : COLORS.wfc;
    }
  }

  return `rgba(100, 116, 139, ${backgroundEdgeOpacity})`;
}

function getLinkWidth(link) {
  const u = link.source.id || link.source;
  const v = link.target.id || link.target;

  const visibleCliques = getActiveVisibleCliques();
  for (let c of visibleCliques) {
    if (c.nodes.includes(u) && c.nodes.includes(v)) {
      return selectedClique ? 3.5 : 2.2;
    }
  }
  return 0.4;
}

function getLinkParticles(link) {
  const u = link.source.id || link.source;
  const v = link.target.id || link.target;

  const visibleCliques = getActiveVisibleCliques();
  for (let c of visibleCliques) {
    if (c.nodes.includes(u) && c.nodes.includes(v)) {
      return 3; // Animated glowing pulses along clique edges
    }
  }
  return 0;
}

// Camera Focus on Selected Clique
function focusCameraOnClique(clique) {
  if (!clique || !clique.nodes.length) return;

  const gNodes = Graph.graphData().nodes;
  const cliqueObjNodes = gNodes.filter(n => clique.nodes.includes(n.id));

  if (!cliqueObjNodes.length) return;

  // Compute centroid of the clique in 3D
  let cx = 0, cy = 0, cz = 0;
  cliqueObjNodes.forEach(n => {
    cx += n.x || 0;
    cy += n.y || 0;
    cz += n.z || 0;
  });
  cx /= cliqueObjNodes.length;
  cy /= cliqueObjNodes.length;
  cz /= cliqueObjNodes.length;

  // Position camera at comfortable inspection distance
  const distance = 160;
  Graph.cameraPosition(
    { x: cx + distance * 0.7, y: cy + distance * 0.5, z: cz + distance },
    { x: cx, y: cy, z: cz },
    1400
  );
}

// Populate Right Inspector HUD
function populateInspector(clique) {
  if (!clique) return;

  const titleElem = document.getElementById('insp-title');
  const subElem = document.getElementById('insp-subtitle');
  const badgeElem = document.getElementById('insp-badge');

  titleElem.textContent = `${clique.id}`;
  subElem.textContent = `Clique Size: ${clique.size} fully connected nodes`;

  badgeElem.style.display = 'inline-flex';
  if (clique.is_also_other) {
    badgeElem.textContent = 'AFC & WFC';
    badgeElem.className = 'badge badge-both';
  } else if (clique.type === 'AFC') {
    badgeElem.textContent = 'ABSOLUTE FAIR';
    badgeElem.className = 'badge badge-afc';
  } else {
    badgeElem.textContent = 'WEAK FAIR';
    badgeElem.className = 'badge badge-wfc';
  }

  // Fairness Verdict
  const verdictElem = document.getElementById('fairness-verdict');
  const descElem = document.getElementById('fairness-desc');
  if (clique.type === 'AFC') {
    verdictElem.textContent = 'PERFECT PARITY';
    verdictElem.style.color = 'var(--accent-afc)';
    descElem.textContent = 'Every demographic cohort has identical representation. Absolute zero disparity across groups.';
  } else {
    verdictElem.textContent = 'RELAXED WEAK FAIR';
    verdictElem.style.color = 'var(--accent-wfc)';
    descElem.textContent = 'Satisfies k=1, delta=10 constraints with minority representation guaranteed, allowing higher cardinality.';
  }

  // Gender Breakdown
  const fCount = clique.gender_counts.female || 0;
  const mCount = clique.gender_counts.male || 0;
  const total = fCount + mCount || 1;
  const fPct = Math.round((fCount / total) * 100);
  const mPct = Math.round((mCount / total) * 100);

  document.getElementById('gender-summary').textContent = `${fCount}F (${fPct}%) : ${mCount}M (${mPct}%)`;
  document.getElementById('female-count').textContent = `${fCount} (${fPct}%)`;
  document.getElementById('male-count').textContent = `${mCount} (${mPct}%)`;
  document.getElementById('female-bar').style.width = `${fPct}%`;
  document.getElementById('male-bar').style.width = `${mPct}%`;

  // Multidim breakdown bars
  const multiContainer = document.getElementById('multidim-bars');
  multiContainer.innerHTML = '';
  const cohorts = [
    { key: "female | junior_senior", label: "Female Jr/Sr", color: COLORS.femaleJrSr },
    { key: "female | fresh_soph", label: "Female Fr/So", color: COLORS.femaleFrSo },
    { key: "male | junior_senior", label: "Male Jr/Sr", color: COLORS.maleJrSr },
    { key: "male | fresh_soph", label: "Male Fr/So", color: COLORS.maleFrSo }
  ];

  cohorts.forEach(c => {
    const count = clique.attribute_counts[c.key] || 0;
    const pct = Math.round((count / clique.size) * 100);

    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-labels">
        <span style="color: ${c.color}; font-size: 0.72rem;">${c.label}</span>
        <span style="font-family: 'JetBrains Mono'; font-size: 0.72rem;">${count} (${pct}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="background: ${c.color}; width: ${pct}%;"></div>
      </div>
    `;
    multiContainer.appendChild(row);
  });

  // Member Nodes Grid
  const grid = document.getElementById('clique-nodes-grid');
  grid.innerHTML = '';
  document.getElementById('member-count-badge').textContent = `${clique.nodes.length} Nodes`;

  const sub = getActiveSubset();
  const nodeLookup = {};
  sub.nodes.forEach(n => nodeLookup[n.id] = n);

  clique.nodes.forEach(nid => {
    const nData = nodeLookup[nid] || { id: nid, gender: '?', year_group: '?' };
    const chip = document.createElement('div');
    chip.className = 'node-chip';
    chip.innerHTML = `
      <div class="node-chip-id">${nData.id}</div>
      <div class="node-chip-sub" style="color: ${nData.gender === 'female' ? COLORS.female : COLORS.male};">${nData.gender}, ${nData.year_group}</div>
    `;
    chip.addEventListener('click', () => {
      const gNode = Graph.graphData().nodes.find(n => n.id === nid);
      if (gNode) {
        Graph.cameraPosition(
          { x: gNode.x + 60, y: gNode.y + 30, z: gNode.z + 80 },
          gNode,
          1000
        );
      }
    });
    grid.appendChild(chip);
  });
}

function resetInspector() {
  document.getElementById('insp-title').textContent = 'Select a Clique';
  document.getElementById('insp-subtitle').textContent = 'Hover or select a clique to inspect fairness';
  document.getElementById('insp-badge').style.display = 'none';
  document.getElementById('fairness-verdict').textContent = '-';
  document.getElementById('fairness-desc').textContent = 'Absolute Fair Cliques require exact parity. Weak Fair Cliques permit bounded disparities.';
  document.getElementById('gender-summary').textContent = '-';
  document.getElementById('female-count').textContent = '0';
  document.getElementById('male-count').textContent = '0';
  document.getElementById('female-bar').style.width = '0%';
  document.getElementById('male-bar').style.width = '0%';
  document.getElementById('multidim-bars').innerHTML = '<span style="font-size:0.75rem; color:var(--text-dim);">No active clique selected</span>';
  document.getElementById('clique-nodes-grid').innerHTML = '';
  document.getElementById('member-count-badge').textContent = '0 Nodes';
}

// Dynamic Legend Bar update
function updateLegend() {
  const legend = document.getElementById('dynamic-legend');
  legend.innerHTML = '';

  if (colorMode === 'gender') {
    legend.innerHTML = `
      <div class="legend-item"><span class="dot" style="background:${COLORS.female};"></span> Female</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.male};"></span> Male</div>
      <div class="legend-item" style="margin-left: 10px; border-left: 1px solid rgba(255,255,255,0.15); padding-left: 15px;"><span class="dot" style="background:${COLORS.afc}; box-shadow: 0 0 6px ${COLORS.afc};"></span> AFC Links</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.wfc}; box-shadow: 0 0 6px ${COLORS.wfc};"></span> WFC Links</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.both}; box-shadow: 0 0 6px ${COLORS.both};"></span> Overlap Links</div>
    `;
  } else if (colorMode === 'multidim') {
    legend.innerHTML = `
      <div class="legend-item"><span class="dot" style="background:${COLORS.femaleJrSr};"></span> Female Jr/Sr</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.femaleFrSo};"></span> Female Fr/So</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.maleJrSr};"></span> Male Jr/Sr</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.maleFrSo};"></span> Male Fr/So</div>
    `;
  } else { // 'role'
    legend.innerHTML = `
      <div class="legend-item"><span class="dot" style="background:${COLORS.afc};"></span> AFC Member</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.wfc};"></span> WFC Member</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.both};"></span> Dual Member</div>
      <div class="legend-item"><span class="dot" style="background:${COLORS.bgNode};"></span> Background Node</div>
    `;
  }
}

function hexToRgba(hex, alpha) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

// Boot application
window.addEventListener('DOMContentLoaded', initData);
