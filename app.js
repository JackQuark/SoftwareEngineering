const VIEWBOX = { width: 960, height: 560 };
const NODE_RADIUS = 22;
const BASE_DELAY = 900;
const INF = Number.POSITIVE_INFINITY;

const state = {
  nodes: [],
  edges: [],
  nextNodeId: 1,
  nextEdgeId: 1,
  animationSteps: [],
  currentStepIndex: 0,
  playbackTimer: null,
  playbackSpeed: 1,
  draggingNodeId: null,
  lastResult: null,
  undoStack: [],
  redoStack: [],
};

const sampleGraph = {
  nodeCount: 4,
  edges: [
    { from: 1, to: 2, weight: 2 },
    { from: 1, to: 3, weight: 5 },
    { from: 2, to: 3, weight: 1 },
    { from: 2, to: 4, weight: 4 },
    { from: 3, to: 4, weight: 2 },
  ],
  query: { source: 1, via: 3, target: 4 },
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  initDashboardGrid();
  loadSampleGraph();
});

function cacheElements() {
  elements.svg = document.getElementById("graph-svg");
  elements.addNodeBtn = document.getElementById("add-node-btn");
  elements.loadSampleBtn = document.getElementById("load-sample-btn");
  elements.clearGraphBtn = document.getElementById("clear-graph-btn");
  elements.addEdgeBtn = document.getElementById("add-edge-btn");
  elements.deleteNodeBtn = document.getElementById("delete-node-btn");
  elements.deleteNodeSelect = document.getElementById("delete-node-select");
  elements.deleteEdgeBtn = document.getElementById("delete-edge-btn");
  elements.deleteEdgeSelect = document.getElementById("delete-edge-select");
  elements.undoBtn = document.getElementById("undo-btn");
  elements.redoBtn = document.getElementById("redo-btn");
  elements.runBtn = document.getElementById("run-btn");
  elements.playBtn = document.getElementById("play-btn");
  elements.pauseBtn = document.getElementById("pause-btn");
  elements.stepBtn = document.getElementById("step-btn");
  elements.resetBtn = document.getElementById("reset-btn");
  elements.edgeFrom = document.getElementById("edge-from");
  elements.edgeTo = document.getElementById("edge-to");
  elements.edgeWeight = document.getElementById("edge-weight");
  elements.querySource = document.getElementById("query-source");
  elements.queryVia = document.getElementById("query-via");
  elements.queryTarget = document.getElementById("query-target");
  elements.speedSlider = document.getElementById("speed-slider");
  elements.speedLabel = document.getElementById("speed-label");
  elements.phaseBadge = document.getElementById("phase-badge");
  elements.graphHighlight = document.getElementById("graph-highlight");
  elements.graphHighlightContent = document.getElementById("graph-highlight-content");
  elements.graphPrevBtn = document.getElementById("graph-prev-btn");
  elements.graphNextBtn = document.getElementById("graph-next-btn");
  elements.progressLabel = document.getElementById("progress-label");
  elements.currentStepCard = document.getElementById("current-step-card");
  elements.processLog = document.getElementById("process-log");
  elements.distanceTable = document.getElementById("distance-table");
  elements.snapshotNote = document.getElementById("snapshot-note");
  elements.resultCard = document.getElementById("result-card");
  elements.nodeCount = document.getElementById("node-count");
  elements.edgeCount = document.getElementById("edge-count");
  elements.stepCount = document.getElementById("step-count");
}

function bindEvents() {
  elements.addNodeBtn.addEventListener("click", () => {
    saveHistory();
    addNode();
    refreshAfterGraphChange();
  });

  elements.loadSampleBtn.addEventListener("click", loadSampleGraph);
  elements.clearGraphBtn.addEventListener("click", clearGraph);

  elements.addEdgeBtn.addEventListener("click", () => {
    const from = Number(elements.edgeFrom.value);
    const to = Number(elements.edgeTo.value);
    const weight = Number(elements.edgeWeight.value);

    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      showResult("請先建立至少兩個節點。", true);
      return;
    }

    if (from === to) {
      showResult("這個版本不允許自迴圈邊。", true);
      return;
    }

    if (!Number.isFinite(weight)) {
      showResult("邊權重必須是數字。", true);
      return;
    }

    saveHistory();
    addEdge(from, to, weight);
    refreshAfterGraphChange();
  });

  // Delete node/edge events >>>
  elements.deleteNodeBtn.addEventListener("click", () => {
    const nodeId = Number(elements.deleteNodeSelect.value);
    if (!Number.isFinite(nodeId) || !state.nodes.find((n) => n.id === nodeId)) {
      showResult("請選擇一個有效的節點。", true);
      return;
    }
    saveHistory();
    deleteNode(nodeId);
    refreshAfterGraphChange();
    showResult(`節點 ${nodeId} 及其相關邊已刪除。`);
  });

  elements.deleteEdgeBtn.addEventListener("click", () => {
    const edgeId = Number(elements.deleteEdgeSelect.value);
    if (!Number.isFinite(edgeId) || !state.edges.find((e) => e.id === edgeId)) {
      showResult("請選擇一條有效的邊。", true);
      return;
    }
    saveHistory();
    deleteEdge(edgeId);
    refreshAfterGraphChange();
    showResult("邊已刪除。");
  });

  elements.undoBtn.addEventListener("click", undo);
  elements.redoBtn.addEventListener("click", redo);

  document.addEventListener("keydown", (event) => {
    const isInput = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if (isInput) return;
    if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
    }
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key === "y" || (event.key === "z" && event.shiftKey))
    ) {
      event.preventDefault();
      redo();
    }
  });
  // <<< Delete node/edge events

  elements.runBtn.addEventListener("click", runQuery);
  elements.playBtn.addEventListener("click", startPlayback);
  elements.pauseBtn.addEventListener("click", pausePlayback);
  elements.stepBtn.addEventListener("click", stepForward);
  elements.resetBtn.addEventListener("click", resetPlayback);
  elements.graphPrevBtn.addEventListener("click", stepBackward);
  elements.graphNextBtn.addEventListener("click", stepForward);

  elements.speedSlider.addEventListener("input", () => {
    state.playbackSpeed = Number(elements.speedSlider.value);
    elements.speedLabel.textContent = `${state.playbackSpeed.toFixed(2).replace(/\.00$/, "")}x`;
    if (state.playbackTimer !== null) {
      startPlayback();
    }
  });

  [elements.querySource, elements.queryVia, elements.queryTarget].forEach((select) => {
    select.addEventListener("change", renderGraph);
  });

  elements.svg.addEventListener("mousedown", handleDragStart);
  window.addEventListener("mousemove", handleDragMove);
  window.addEventListener("mouseup", handleDragEnd);
}

function initDashboardGrid() {
  if (!window.GridStack) {
    return;
  }

  const grid = GridStack.init({
    cellHeight: 92,
    column: 12,
    float: true,
    margin: 8,
    draggable: {
      handle: ".panel-title-row, .brand-block, .stat-panel",
      scroll: true,
    },
    resizable: {
      handles: "e, se, s, sw, w",
    },
  });

  grid.on("change resizestop dragstop", () => {
    renderGraph();
  });
}

function loadSampleGraph() {
  pausePlayback();
  state.nodes = [];
  state.edges = [];
  state.nextNodeId = 1;
  state.nextEdgeId = 1;
  state.undoStack = [];
  state.redoStack = [];

  for (let index = 0; index < sampleGraph.nodeCount; index += 1) {
    addNode();
  }

  sampleGraph.edges.forEach((edge) => addEdge(edge.from, edge.to, edge.weight));
  clearComputation();
  refreshControls();

  elements.querySource.value = String(sampleGraph.query.source);
  elements.queryVia.value = String(sampleGraph.query.via);
  elements.queryTarget.value = String(sampleGraph.query.target);

  renderGraph();
  showResult("示範圖已載入。這組資料可以直接看出 1 先到 3，再從 3 到 4 的合併結果。");
  runQuery();
}

function clearGraph() {
  pausePlayback();
  state.nodes = [];
  state.edges = [];
  state.nextNodeId = 1;
  state.nextEdgeId = 1;
  state.undoStack = [];
  state.redoStack = [];
  clearComputation();
  refreshControls();
  renderGraph();
  showResult("圖已清空。先新增節點與邊，再執行查詢。");
}

function addNode() {
  const id = state.nextNodeId;
  state.nextNodeId += 1;
  state.nodes.push({ id, ...estimateNodePosition(state.nodes.length) });
}

function addEdge(from, to, weight) {
  state.edges.push({
    id: state.nextEdgeId,
    from,
    to,
    weight,
  });
  state.nextEdgeId += 1;
}

function deleteNode(nodeId) {
  state.nodes = state.nodes.filter((n) => n.id !== nodeId);
  state.edges = state.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
}

function deleteEdge(edgeId) {
  state.edges = state.edges.filter((e) => e.id !== edgeId);
}

// History (Undo / Redo) >>>

const MAX_HISTORY = 64;

function snapshotState() {
  return {
    nodes: state.nodes.map((n) => ({ ...n })),
    edges: state.edges.map((e) => ({ ...e })),
    nextNodeId: state.nextNodeId,
    nextEdgeId: state.nextEdgeId,
  };
}

function saveHistory() {
  state.undoStack.push(snapshotState());
  if (state.undoStack.length > MAX_HISTORY) {
    state.undoStack.shift();
  }
  state.redoStack = [];
  updateUndoRedoButtons();
}

function undo() {
  if (state.undoStack.length === 0) return;
  state.redoStack.push(snapshotState());
  const snap = state.undoStack.pop();
  applySnapshot(snap);
  refreshAfterGraphChange();
  updateUndoRedoButtons();
  showResult("已復原上一步操作。");
}

function redo() {
  if (state.redoStack.length === 0) return;
  state.undoStack.push(snapshotState());
  const snap = state.redoStack.pop();
  applySnapshot(snap);
  refreshAfterGraphChange();
  updateUndoRedoButtons();
  showResult("已重做上一步操作。");
}

function applySnapshot(snap) {
  state.nodes = snap.nodes.map((n) => ({ ...n }));
  state.edges = snap.edges.map((e) => ({ ...e }));
  state.nextNodeId = snap.nextNodeId;
  state.nextEdgeId = snap.nextEdgeId;
}

function updateUndoRedoButtons() {
  elements.undoBtn.disabled = state.undoStack.length === 0;
  elements.redoBtn.disabled = state.redoStack.length === 0;
}

// <<< History (Undo / Redo)

function refreshAfterGraphChange() {
  pausePlayback();
  clearComputation();
  refreshControls();
  renderGraph();
  showResult("圖已更新。請重新執行演算法以產生新的步驟。");
}

function clearComputation() {
  state.animationSteps = [];
  state.currentStepIndex = 0;
  state.lastResult = null;
  renderProcessLog();
  renderDistanceTable();
  updateStatusBadges();
}

function refreshControls() {
  const nodeIds = state.nodes.map((node) => node.id);
  fillSelect(elements.edgeFrom, nodeIds);
  fillSelect(elements.edgeTo, nodeIds);
  fillSelect(elements.querySource, nodeIds);
  fillSelect(elements.queryVia, nodeIds);
  fillSelect(elements.queryTarget, nodeIds);

  // Delete node select
  fillSelect(elements.deleteNodeSelect, nodeIds);

  // Delete edge select — label each edge as "N→M (w)"
  const prevEdge = elements.deleteEdgeSelect.value;
  elements.deleteEdgeSelect.innerHTML = state.edges
    .map((e) => `<option value="${e.id}">${e.from} → ${e.to} (w=${e.weight})</option>`)
    .join("");
  if (state.edges.find((e) => String(e.id) === prevEdge)) {
    elements.deleteEdgeSelect.value = prevEdge;
  }

  elements.nodeCount.textContent = String(state.nodes.length);
  elements.edgeCount.textContent = String(state.edges.length);
  elements.stepCount.textContent = String(state.animationSteps.length);

  updateUndoRedoButtons();
}

function fillSelect(select, nodeIds) {
  const previous = select.value;
  select.innerHTML = nodeIds
    .map((id) => `<option value="${id}">Node ${id}</option>`)
    .join("");

  if (nodeIds.length === 0) {
    select.innerHTML = "";
    return;
  }

  if (nodeIds.includes(Number(previous))) {
    select.value = previous;
    return;
  }

  select.value = String(nodeIds[0]);
}

function runQuery() {
  pausePlayback();
  resetRunStateForNewQuery();

  if (state.nodes.length === 0) {
    showResult("至少要先建立一個節點。", true);
    return;
  }

  if (state.edges.length === 0) {
    showResult("至少要先建立一條邊。", true);
    return;
  }

  const source = Number(elements.querySource.value);
  const via = Number(elements.queryVia.value);
  const target = Number(elements.queryTarget.value);

  if (![source, via, target].every(Number.isFinite)) {
    showResult("請先選擇起點、中繼點與終點。", true);
    return;
  }

  const forward = runBellmanFordPhase(source, "forward");
  const reverse = forward.ok ? runBellmanFordPhase(target, "reverse") : null;
  const summary = summarizeIntermediate(source, via, target, forward, reverse);

  state.lastResult = { source, via, target, forward, reverse, summary };
  state.animationSteps = composeAnimationSteps(source, via, target, forward, reverse, summary);
  state.currentStepIndex = 0;

  elements.stepCount.textContent = String(state.animationSteps.length);
  renderProcessLog();
  renderStep(0);
}

function resetRunStateForNewQuery() {
  state.animationSteps = [];
  state.currentStepIndex = 0;
  state.lastResult = null;
  elements.stepCount.textContent = "0";
  elements.progressLabel.textContent = "0 / 0";
  elements.phaseBadge.textContent = "Idle";
  elements.processLog.scrollTop = 0;
  renderProcessLog();
  renderDistanceTable();
  showResult("新一輪演算法已開始，這裡會在最後顯示中繼點最短路徑答案。");
}

function runBellmanFordPhase(anchor, mode) {
  const distances = createDistanceMap();
  const parents = createParentMap();
  const steps = [];

  distances[anchor] = 0;
  steps.push(
    createPhaseStep({
      phase: mode,
      type: "init",
      iteration: 0,
      message:
        mode === "forward"
          ? `初始化正向距離：dA[${anchor}] = 0，其餘皆為 Infinity。`
          : `初始化反向距離：dB[${anchor}] = 0，代表從終點 ${anchor} 往回推。`,
      dist: distances,
      parent: parents,
      activeNodes: [anchor],
    }),
  );

  for (let pass = 1; pass <= state.nodes.length; pass += 1) {
    let relaxedThisPass = false;

    for (const edge of state.edges) {
      const relaxFrom = mode === "forward" ? edge.from : edge.to;
      const relaxTo = mode === "forward" ? edge.to : edge.from;
      const sourceDistance = distances[relaxFrom];
      const candidate = Number.isFinite(sourceDistance) ? sourceDistance + edge.weight : INF;
      const previous = distances[relaxTo];
      const updated = Number.isFinite(candidate) && candidate < previous;
      const detail = {
        relaxFrom,
        relaxTo,
        sourceDistance,
        candidate,
        previous,
        weight: edge.weight,
      };

      if (updated && pass === state.nodes.length) {
        steps.push(
          createPhaseStep({
            phase: mode,
            type: "negative-cycle",
            iteration: pass,
            edgeId: edge.id,
            relaxed: true,
            message: `第 ${pass} 輪仍可更新 ${relaxTo}，代表存在負環，演算法停止。`,
            dist: distances,
            parent: parents,
            activeNodes: [relaxFrom, relaxTo],
            detail,
          }),
        );

        return {
          ok: false,
          anchor,
          mode,
          distances: cloneMap(distances),
          parents: cloneMap(parents),
          steps,
          negativeCycle: true,
        };
      }

      if (updated) {
        distances[relaxTo] = candidate;
        parents[relaxTo] = relaxFrom;
        relaxedThisPass = true;
      }

      steps.push(
        createPhaseStep({
          phase: mode,
          type: "relax",
          iteration: pass,
          edgeId: edge.id,
          relaxed: updated,
          message: describeRelaxation(mode, pass, edge, relaxFrom, relaxTo, sourceDistance, candidate, previous, updated),
          dist: distances,
          parent: parents,
          activeNodes: [relaxFrom, relaxTo],
          detail,
        }),
      );
    }

    steps.push(
      createPhaseStep({
        phase: mode,
        type: "pass-end",
        iteration: pass,
        message: relaxedThisPass
          ? `第 ${pass} 輪完成，還有更新，進入下一輪。`
          : `第 ${pass} 輪沒有任何更新，可以提前結束。`,
        dist: distances,
        parent: parents,
        activeNodes: [],
      }),
    );

    if (!relaxedThisPass) {
      break;
    }
  }

  return {
    ok: true,
    anchor,
    mode,
    distances: cloneMap(distances),
    parents: cloneMap(parents),
    steps,
    negativeCycle: false,
  };
}

function composeAnimationSteps(source, via, target, forward, reverse, summary) {
  const blankDistances = createDistanceMap(null);
  const blankParents = createParentMap(null);
  const steps = [
    {
      phase: "notice",
      type: "notice",
      stageLabel: "Start Scan",
      iteration: 0,
      message: `開始從起點 ${source} 掃描：計算起點到每個節點的 dA。`,
      forwardDist: blankDistances,
      reverseDist: blankDistances,
      forwardParent: blankParents,
      reverseNext: blankParents,
      activeNodes: [source],
      noticeMode: "forward",
      noticeTitle: `從起點 ${source} 開始掃描`,
      noticeSubtitle: "Forward Bellman-Ford: 計算 dA",
    },
  ];

  forward.steps.forEach((step) => {
    steps.push({
      ...step,
      stageLabel: "Forward",
      forwardDist: step.dist,
      reverseDist: blankDistances,
      forwardParent: step.parent,
      reverseNext: blankParents,
    });
  });

  if (!forward.ok) {
    steps.push({
      phase: "answer",
      type: "answer",
      stageLabel: "Answer",
      message: `起點 ${source} 的正向階段失敗，無法繼續計算中繼點答案。`,
      forwardDist: forward.distances,
      reverseDist: blankDistances,
      forwardParent: forward.parents,
      reverseNext: blankParents,
      activeNodes: [source],
      summary,
    });
    return steps;
  }

  steps.push({
    phase: "notice",
    type: "notice",
    stageLabel: "Start Reverse Scan",
    iteration: 0,
    message: `開始從終點 ${target} 反向掃描：計算每個節點到終點的 dB。`,
    forwardDist: forward.distances,
    reverseDist: blankDistances,
    forwardParent: forward.parents,
    reverseNext: blankParents,
    activeNodes: [target],
    noticeMode: "reverse",
    noticeTitle: `從終點 ${target} 反向掃描`,
    noticeSubtitle: "Reverse Bellman-Ford: 計算 dB",
  });

  reverse.steps.forEach((step) => {
    steps.push({
      ...step,
      stageLabel: "Reverse",
      forwardDist: forward.distances,
      reverseDist: step.dist,
      forwardParent: forward.parents,
      reverseNext: step.parent,
    });
  });

  steps.push({
    phase: "answer",
    type: "answer",
    stageLabel: "Answer",
    message: summary.ok
      ? `答案完成：經過中繼點 ${via} 的最短距離為 ${summary.totalDistance}。`
      : summary.message,
    forwardDist: forward.distances,
    reverseDist: reverse.distances,
    forwardParent: forward.parents,
    reverseNext: reverse.parents,
    activeNodes: [source, via, target],
    summary,
  });

  return steps;
}

function summarizeIntermediate(source, via, target, forward, reverse) {
  if (!forward.ok) {
    return {
      ok: false,
      message: "正向 Bellman-Ford 偵測到負環，無法取得合法距離。",
    };
  }

  if (!reverse.ok) {
    return {
      ok: false,
      message: "反向 Bellman-Ford 偵測到負環，無法取得合法距離。",
    };
  }

  const forwardCost = forward.distances[via];
  const reverseCost = reverse.distances[via];

  if (!Number.isFinite(forwardCost)) {
    return {
      ok: false,
      message: `無法從起點 ${source} 到達中繼點 ${via}：${source} -X-> ${via} ---> ${target}`,
    };
  }

  if (!Number.isFinite(reverseCost)) {
    return {
      ok: false,
      message: `無法從中繼點 ${via} 到達終點 ${target}：${source} ---> ${via} -X-> ${target}`,
    }
  }

  const pathToVia = reconstructForwardPath(source, via, forward.parents);
  const pathToTarget = reconstructReversePath(via, target, reverse.parents);

  if (!pathToVia || !pathToTarget) {
    return {
      ok: false,
      message: "距離雖然存在，但路徑重建失敗，請檢查圖是否有不一致資料。",
    };
  }

  return {
    ok: true,
    totalDistance: forwardCost + reverseCost,
    forwardCost,
    reverseCost,
    pathToVia,
    pathToTarget,
    fullPath: [...pathToVia, ...pathToTarget.slice(1)],
  };
}

function createPhaseStep({ phase, type, iteration, edgeId = null, relaxed = false, message, dist, parent, activeNodes, detail = null }) {
  return {
    phase,
    type,
    iteration,
    edgeId,
    relaxed,
    message,
    dist: cloneMap(dist),
    parent: cloneMap(parent),
    activeNodes: [...activeNodes],
    detail,
  };
}

function createDistanceMap(defaultValue = INF) {
  return Object.fromEntries(state.nodes.map((node) => [node.id, defaultValue]));
}

function createParentMap(defaultValue = null) {
  return Object.fromEntries(state.nodes.map((node) => [node.id, defaultValue]));
}

function cloneMap(map) {
  return Object.fromEntries(Object.entries(map));
}

function reconstructForwardPath(source, target, parents) {
  const path = [];
  const visited = new Set();
  let current = target;

  while (current !== null && current !== undefined) {
    if (visited.has(current)) {
      return null;
    }
    visited.add(current);
    path.push(current);
    if (current === source) {
      return path.reverse();
    }
    current = parents[current];
  }

  return null;
}

function reconstructReversePath(start, target, nextHopMap) {
  const path = [start];
  const visited = new Set([start]);
  let current = start;

  while (current !== target) {
    current = nextHopMap[current];
    if (current === null || current === undefined || visited.has(current)) {
      return null;
    }
    visited.add(current);
    path.push(current);
  }

  return path;
}

function describeRelaxation(mode, pass, edge, relaxFrom, relaxTo, sourceDistance, candidate, previous, updated) {
  const edgeText = `${edge.from} -> ${edge.to} (w=${edge.weight})`;
  const prefix = mode === "forward" ? "正向" : "反向";

  if (!Number.isFinite(sourceDistance)) {
    return `${prefix}第 ${pass} 輪檢查 ${edgeText}：來源節點 ${relaxFrom} 尚未可達，跳過。`;
  }

  if (updated) {
    return `${prefix}第 ${pass} 輪檢查 ${edgeText}：${formatDistance(sourceDistance)} + ${edge.weight} = ${formatDistance(candidate)}，更新 d[${relaxTo}]。`;
  }

  return `${prefix}第 ${pass} 輪檢查 ${edgeText}：候選值 ${formatDistance(candidate)} 不優於目前的 ${formatDistance(previous)}。`;
}

function renderStep(index) {
  if (state.animationSteps.length === 0) {
    updateStatusBadges();
    renderProcessLog();
    renderDistanceTable();
    renderGraph();
    return;
  }

  state.currentStepIndex = clamp(index, 0, state.animationSteps.length - 1);
  updateStatusBadges();
  renderProcessLog();
  renderDistanceTable(state.animationSteps[state.currentStepIndex]);
  renderGraph();
}

function renderGraph() {
  const currentStep = state.animationSteps[state.currentStepIndex] || null;
  const selected = {
    source: Number(elements.querySource?.value),
    via: Number(elements.queryVia?.value),
    target: Number(elements.queryTarget?.value),
  };
  const { minWeight, maxWeight } = getWeightRange();
  renderGraphHighlight(currentStep, selected);

  const gradients = state.edges
    .map((edge) => {
      const geometry = getEdgeGeometry(edge);
      const [startColor, endColor] = getWeightColors(edge.weight, minWeight, maxWeight);
      return `
        <linearGradient id="edge-gradient-${edge.id}" gradientUnits="userSpaceOnUse"
          x1="${geometry.start.x}" y1="${geometry.start.y}" x2="${geometry.end.x}" y2="${geometry.end.y}">
          <stop offset="0%" stop-color="${startColor}" />
          <stop offset="100%" stop-color="${endColor}" />
        </linearGradient>
      `;
    })
    .join("");

  const defs = `
    <defs>
      <linearGradient id="scene-glow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(13, 37, 42, 0.94)" />
        <stop offset="100%" stop-color="rgba(8, 14, 19, 0.98)" />
      </linearGradient>
      <pattern id="grid-pattern" width="32" height="32" patternUnits="userSpaceOnUse">
        <path d="M 32 0 L 0 0 0 32" fill="none" stroke="var(--grid-line)" stroke-width="1" />
      </pattern>
      <marker id="arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
      </marker>
      ${gradients}
    </defs>
  `;

  const background = `
    <rect x="0" y="0" width="${VIEWBOX.width}" height="${VIEWBOX.height}" rx="20" fill="url(#scene-glow)"></rect>
    <rect x="0" y="0" width="${VIEWBOX.width}" height="${VIEWBOX.height}" rx="20" fill="url(#grid-pattern)"></rect>
    <text x="32" y="42" class="hint-label">Demo: 找 1 → 3 → 4。先算 1 到各點，再算各點到 4，最後把節點 3 的兩段距離相加。</text>
  `;

  const edgeMarkup = state.edges
    .map((edge) => {
      const geometry = getEdgeGeometry(edge);
      const ratio = normalize(edge.weight, minWeight, maxWeight);
      const active = currentStep?.edgeId === edge.id;
      const updated = active && currentStep?.relaxed;
      const strokeWidth = (2.2 + ratio * 1.6).toFixed(2);
      const weightStr = String(edge.weight);
      const labelWidth = Math.max(20, Math.ceil(weightStr.length * 8) + 14);
      const labelX = geometry.label.x - labelWidth / 2;
      const labelY = geometry.label.y - 10;

      return `
        <g class="edge-group">
          <path
            class="edge-path ${active ? "active" : ""} ${updated ? "updated" : ""}"
            d="${geometry.path}"
            stroke="url(#edge-gradient-${edge.id})"
            stroke-width="${strokeWidth}"
            marker-end="url(#arrow-head)"
          ></path>
          <rect class="edge-label-box" x="${labelX}" y="${labelY}" width="${labelWidth}" height="20" rx="12"></rect>
          <text class="edge-label-text" x="${geometry.label.x}" y="${geometry.label.y + 5}" text-anchor="middle">${edge.weight}</text>
        </g>
      `;
    })
    .join("");

  const nodeMarkup = state.nodes
    .map((node) => {
      const isActive = currentStep?.activeNodes?.includes(node.id);
      const roleLabel =
        node.id === selected.source ? "START" : node.id === selected.via ? "VIA" : node.id === selected.target ? "TARGET" : "";
      const distanceLabel = getNodeDistanceLabel(currentStep, node.id);

      return `
        <g
          class="node ${isActive ? "active" : ""} ${node.id === selected.source ? "special-source" : ""} ${node.id === selected.via ? "special-via" : ""} ${node.id === selected.target ? "special-target" : ""}"
          data-node-id="${node.id}"
          transform="translate(${node.x}, ${node.y})"
        >
          <circle class="node-ring" r="29"></circle>
          <rect class="node-distance-box" x="-34" y="-66" width="68" height="18" rx="9"></rect>
          ${renderNodeMarker(roleLabel)}
          <circle class="node-core" r="${NODE_RADIUS}"></circle>
          <text class="node-label" y="2">${node.id}</text>
          <text class="node-distance" y="-53">${distanceLabel}</text>
          ${roleLabel ? `<text class="node-role" y="42">${roleLabel}</text>` : ""}
        </g>
      `;
    })
    .join("");

  elements.svg.innerHTML = `${defs}${background}<g>${edgeMarkup}</g><g>${nodeMarkup}</g>`;
}

function renderNodeMarker(roleLabel) {
  if (roleLabel === "START") {
    return '<path class="node-marker marker-source" d="M -10 -31 L 0 -45 L 10 -31 Z"></path>';
  }

  if (roleLabel === "VIA") {
    return '<path class="node-marker marker-via" d="M 0 -46 L 10 -36 L 0 -26 L -10 -36 Z"></path>';
  }

  if (roleLabel === "TARGET") {
    return '<rect class="node-marker marker-target" x="-9" y="-45" width="18" height="18" rx="3"></rect>';
  }

  return "";
}

function renderGraphHighlight(currentStep, selected) {
  if (!currentStep) {
    elements.graphHighlightContent.innerHTML =
      '<div class="empty-state">目前步驟與加法過程會顯示在這裡。</div>';
    return;
  }

  const phaseText = currentStep.stageLabel || currentStep.phase || "Idle";
  const formulaMarkup = buildRelaxFormula(currentStep);
  const outcomeText = describeOutcome(currentStep);

  const stepLabel = currentStep.iteration > 0 ? `Pass ${currentStep.iteration}` : "Init";

  elements.graphHighlightContent.innerHTML = `
    <div class="highlight-head">
      <span class="highlight-title">${phaseText} · ${stepLabel}</span>
      <span class="highlight-step">Step ${state.currentStepIndex + 1} / ${state.animationSteps.length}</span>
    </div>
    <div class="highlight-big ${currentStep.relaxed ? "success" : ""}">${formulaMarkup}</div>
    <div class="highlight-subline">${outcomeText}</div>
  `;
}

function getNodeDistanceLabel(step, nodeId) {
  if (!step) {
    return "d = ∞";
  }

  if (step.phase === "reverse") {
    return `dB=${formatDistance(step.reverseDist[nodeId])}`;
  }

  if ((step.type === "notice" && step.noticeMode === "reverse") || step.phase === "bridge" || step.phase === "answer") {
    return `A:${formatDistance(step.forwardDist[nodeId])} B:${formatDistance(step.reverseDist[nodeId])}`;
  }

  return `dA=${formatDistance(step.forwardDist[nodeId])}`;
}

function buildRelaxFormula(step) {
  if (step?.type === "notice") {
    return `
      <span class="scan-notice-title">${step.noticeTitle}</span>
      <span class="scan-notice-subtitle">${step.noticeSubtitle}</span>
    `;
  }

  if (step?.type === "answer" && step.summary?.ok) {
    return `
      <span class="formula-chip">
        <span class="formula-label">dA via</span>
        <span class="formula-number">${formatDistance(step.summary.forwardCost)}</span>
      </span>
      <span class="formula-operator">+</span>
      <span class="formula-chip edge-weight">
        <span class="formula-label">dB via</span>
        <span class="formula-number">${formatDistance(step.summary.reverseCost)}</span>
      </span>
      <span class="formula-operator">=</span>
      <span class="formula-chip candidate answer-total">
        <span class="formula-label">shortest</span>
        <span class="formula-number">${formatDistance(step.summary.totalDistance)}</span>
      </span>
    `;
  }

  if (!step?.detail) {
    return step?.type === "pass-end" ? "本輪已掃完所有邊" : "等待下一個 relax 步驟";
  }

  const { relaxFrom, relaxTo, sourceDistance, weight, candidate, previous } = step.detail;
  return `
    <span class="formula-chip">
      <span class="formula-label">from ${relaxFrom}</span>
      <span class="formula-number">${formatDistance(sourceDistance)}</span>
    </span>
    <span class="formula-operator">+</span>
    <span class="formula-chip edge-weight">
      <span class="formula-label">edge</span>
      <span class="formula-number">${weight}</span>
    </span>
    <span class="formula-operator">=</span>
    <span class="formula-chip candidate">
      <span class="formula-label">candidate</span>
      <span class="formula-number">${formatDistance(candidate)}</span>
    </span>
    <span class="formula-operator">vs</span>
    <span class="formula-chip current">
      <span class="formula-label">current ${relaxTo}</span>
      <span class="formula-number">${formatDistance(previous)}</span>
    </span>
  `;
}

function describeOutcome(step) {
  if (step?.type === "notice") {
    return "準備開始掃描所有邊";
  }

  if (step?.type === "answer" && step.summary?.ok) {
    return `最短距離 = ${formatDistance(step.summary.totalDistance)}`;
  }

  if (!step?.detail) {
    return step?.type === "negative-cycle" ? "第 n 輪仍可更新，疑似負環" : "沒有公式比較";
  }

  return step.relaxed ? "Update: 更新距離" : "No update: 維持原值";
}

function renderProcessLog() {
  if (state.animationSteps.length === 0) {
    elements.currentStepCard.innerHTML =
      '<div class="empty-state">目前步驟會固定顯示在這裡。</div>';
    elements.processLog.innerHTML =
      '<div class="empty-state">執行演算法後，這裡會顯示每一步鬆弛過程。</div>';
    return;
  }

  const currentStep = state.animationSteps[state.currentStepIndex];
  elements.currentStepCard.innerHTML = `
    <div class="log-entry current">
      <div class="log-meta">
        <span>${currentStep.stageLabel}</span>
        <span>Step ${state.currentStepIndex + 1}</span>
      </div>
      <p class="log-message">${currentStep.message}</p>
    </div>
  `;

  elements.processLog.innerHTML = state.animationSteps
    .map((step, index) => {
      const currentClass = index === state.currentStepIndex ? "current" : "";
      const passLabel = step.iteration > 0 ? `Pass ${step.iteration}` : "Init";
      return `
        <div class="log-entry ${currentClass}">
          <div class="log-meta">
            <span>${step.stageLabel} · ${passLabel}</span>
            <span>Step ${index + 1}</span>
          </div>
          <p class="log-message">${step.message}</p>
        </div>
      `;
    })
    .join("");
}

function renderDistanceTable(step = null) {
  if (!step) {
    elements.distanceTable.innerHTML = "";
    elements.snapshotNote.textContent = "Waiting";
    return;
  }

  const rows = state.nodes
    .map((node) => {
      const isFocus = node.id === Number(elements.queryVia.value);
      return `
        <tr class="${isFocus ? "focus-row" : ""}">
          <td>Node ${node.id}</td>
          <td>${formatDistance(step.forwardDist[node.id])}</td>
          <td>${formatDistance(step.reverseDist[node.id])}</td>
          <td>${formatParent(step.forwardParent[node.id])}</td>
          <td>${formatParent(step.reverseNext[node.id])}</td>
        </tr>
      `;
    })
    .join("");

  elements.distanceTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Node</th>
          <th>dA</th>
          <th>dB</th>
          <th>Prev(A)</th>
          <th>Next(B)</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  elements.snapshotNote.textContent = step.stageLabel;

  if (step.summary) {
    renderSummary(step.summary);
  } else {
    renderProgressHint(step);
  }
}

function renderSummary(summary) {
  if (!summary) {
    return;
  }

  if (!summary.ok) {
    showResult(summary.message, true);
    return;
  }

  const route = summary.fullPath.join(" → ");
  elements.resultCard.className = "result-card";
  elements.resultCard.innerHTML = `
    <p><strong>最短距離</strong>：經過中繼點的總成本是 <strong>${summary.totalDistance}</strong>。</p>
    <p class="formula">dA[via] + dB[via] = ${summary.forwardCost} + ${summary.reverseCost} = ${summary.totalDistance}</p>
    <p>正向路徑：${summary.pathToVia.join(" → ")}</p>
    <p>反向路徑：${summary.pathToTarget.join(" → ")}</p>
    <p>完整路徑：${route}</p>
  `;
}

function renderProgressHint(step) {
  const hintByStage = {
    Forward: "目前在跑第一段 Bellman-Ford，計算起點到各節點的最短距離 dA。",
    Bridge: "正向距離已固定，接著改從終點反向鬆弛，準備取得 dB。",
    Reverse: "目前在跑第二段 Bellman-Ford，計算各節點走到終點的最短距離 dB。",
  };

  showResult(hintByStage[step.stageLabel] || "演算法正在執行中。");
}

function showResult(message, isError = false) {
  elements.resultCard.className = isError ? "result-card error" : "result-card";
  elements.resultCard.innerHTML = `<p>${message}</p>`;
}

function updateStatusBadges() {
  const total = state.animationSteps.length;
  const current = total === 0 ? 0 : state.currentStepIndex + 1;
  const step = state.animationSteps[state.currentStepIndex] || null;

  elements.progressLabel.textContent = `${current} / ${total}`;
  elements.phaseBadge.textContent = step?.stageLabel || "Idle";
}

function startPlayback() {
  pausePlayback();

  if (state.animationSteps.length <= 1) {
    return;
  }

  if (state.currentStepIndex >= state.animationSteps.length - 1) {
    state.currentStepIndex = 0;
    renderStep(0);
  }

  scheduleNextTick();
}

function scheduleNextTick() {
  if (state.currentStepIndex >= state.animationSteps.length - 1) {
    pausePlayback();
    return;
  }

  state.playbackTimer = window.setTimeout(() => {
    renderStep(state.currentStepIndex + 1);
    scheduleNextTick();
  }, BASE_DELAY / state.playbackSpeed);
}

function pausePlayback() {
  if (state.playbackTimer !== null) {
    window.clearTimeout(state.playbackTimer);
    state.playbackTimer = null;
  }
}

function stepForward() {
  pausePlayback();
  if (state.animationSteps.length === 0) {
    return;
  }
  renderStep(Math.min(state.currentStepIndex + 1, state.animationSteps.length - 1));
}

function stepBackward() {
  pausePlayback();
  if (state.animationSteps.length === 0) {
    return;
  }
  renderStep(Math.max(state.currentStepIndex - 1, 0));
}

function resetPlayback() {
  pausePlayback();
  if (state.animationSteps.length === 0) {
    return;
  }
  renderStep(0);
}

function getWeightRange() {
  if (state.edges.length === 0) {
    return { minWeight: 0, maxWeight: 1 };
  }

  const weights = state.edges.map((edge) => edge.weight);
  return {
    minWeight: Math.min(...weights),
    maxWeight: Math.max(...weights),
  };
}

function getWeightColors(weight, minWeight, maxWeight) {
  const ratio = normalize(weight, minWeight, maxWeight);
  const startHue = 165 + ratio * 28;
  const endHue = 198 - ratio * 22;
  return [
    `hsla(${startHue}, 98%, 71%, 1)`,
    `hsla(${endHue}, 96%, 65%, 1)`,
  ];
}

function getEdgeGeometry(edge) {
  const from = state.nodes.find((node) => node.id === edge.from);
  const to = state.nodes.find((node) => node.id === edge.to);

  if (!from || !to) {
    return {
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
      label: { x: 0, y: 0 },
      path: "",
    };
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  const nx = -uy;
  const ny = ux;

  const related = state.edges
    .filter((currentEdge) => {
      const samePair =
        (currentEdge.from === edge.from && currentEdge.to === edge.to) ||
        (currentEdge.from === edge.to && currentEdge.to === edge.from);
      return samePair;
    })
    .sort((left, right) => left.id - right.id);

  const pairIndex = related.findIndex((item) => item.id === edge.id);
  const canonical = related[0];
  const canonicalFrom = state.nodes.find((n) => n.id === canonical.from);
  const canonicalTo   = state.nodes.find((n) => n.id === canonical.to);
  const cdx = canonicalTo.x - canonicalFrom.x;
  const cdy = canonicalTo.y - canonicalFrom.y;
  const cd  = Math.hypot(cdx, cdy) || 1;
  const cnx = -cdy / cd;
  const cny =  cdx / cd;
  const offset = related.length > 1 ? (pairIndex - (related.length - 1) / 2) * 50 : 0;

  const start = {
    x: from.x + ux * NODE_RADIUS,
    y: from.y + uy * NODE_RADIUS,
  };
  const end = {
    x: to.x - ux * NODE_RADIUS,
    y: to.y - uy * NODE_RADIUS,
  };
  const control = {
    x: (start.x + end.x) / 2 + cnx * offset,
    y: (start.y + end.y) / 2 + cny * offset,
  };
  const label = quadraticPoint(start, control, end, 0.5);

  return {
    start,
    end,
    label,
    path: `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`,
  };
}

function quadraticPoint(start, control, end, t) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
  };
}

function estimateNodePosition(index) {
  const angle = index * 2.399963229728653;
  const ring = 140 + Math.floor(index / 7) * 52;
  const centerX = VIEWBOX.width / 2;
  const centerY = VIEWBOX.height / 2;
  return {
    x: clamp(centerX + Math.cos(angle) * ring, 60, VIEWBOX.width - 60),
    y: clamp(centerY + Math.sin(angle) * ring, 70, VIEWBOX.height - 70),
  };
}

function handleDragStart(event) {
  const group = event.target.closest(".node");
  if (!group) {
    return;
  }
  state.draggingNodeId = Number(group.dataset.nodeId);
}

function handleDragMove(event) {
  if (state.draggingNodeId === null) {
    return;
  }

  const position = clientToSvg(event.clientX, event.clientY);
  const node = state.nodes.find((entry) => entry.id === state.draggingNodeId);
  if (!node) {
    return;
  }

  node.x = clamp(position.x, 50, VIEWBOX.width - 50);
  node.y = clamp(position.y, 50, VIEWBOX.height - 50);
  renderGraph();
}

function handleDragEnd() {
  state.draggingNodeId = null;
}

function clientToSvg(clientX, clientY) {
  const point = elements.svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(elements.svg.getScreenCTM().inverse());
  return { x: transformed.x, y: transformed.y };
}

function formatDistance(value) {
  return Number.isFinite(value) ? String(value) : "∞";
}

function formatParent(value) {
  return value === null || value === undefined ? "—" : value;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalize(value, min, max) {
  if (max === min) {
    return 0.5;
  }
  return (value - min) / (max - min);
}
