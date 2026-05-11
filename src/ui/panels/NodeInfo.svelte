<script lang="ts">
  import { selection, clearSelection } from "../../stores/selection";
  import { nodes, routes } from "../../stores/world";
  import { crawler } from "../../stores/crawler";
  import { travelTo, cancelTravel } from "../../stores/travel";
  import { CRAWLER_SPEED_KM_S } from "../../sim/crawler/movement";
  import type { GameNode } from "../../sim/economy/models";

  let currentSelection = $state(selection.get());
  let nodeMap = $state(nodes.get());
  let routeMap = $state(routes.get());
  let crawlerState = $state(crawler.get());

  $effect(() => {
    const unsubs = [
      selection.subscribe((v) => (currentSelection = v)),
      nodes.subscribe((v) => (nodeMap = v)),
      routes.subscribe((v) => (routeMap = v)),
      crawler.subscribe((v) => (crawlerState = v)),
    ];
    return () => unsubs.forEach(u => u());
  });

  let node: GameNode | null = $derived(
    currentSelection?.kind === "node" ? nodeMap[currentSelection.id] ?? null : null
  );

  // Is the crawler docked at this node?
  let isDockedHere = $derived(
    node !== null && crawlerState.currentNode === node.id
  );

  // Is the crawler docked somewhere and can we reach this node?
  let canTravel = $derived(() => {
    if (!node || !crawlerState.currentNode) return false;
    if (crawlerState.currentNode === node.id) return false;
    // Any node is potentially reachable — travelTo handles pathfinding
    return true;
  });

  // Is the crawler currently traveling?
  let isTraveling = $derived(crawlerState.currentRoute !== null);

  // Is this the destination?
  let isDestination = $derived(
    node !== null && crawlerState.destination === node.id
  );

  // ETA calculation
  let etaDisplay = $derived(() => {
    if (!crawlerState.currentRoute || !crawlerState.destination) return null;
    const route = routeMap[crawlerState.currentRoute];
    if (!route) return null;

    const remainingProgress = 1 - crawlerState.routeProgress;
    const remainingKm = route.distance * route.terrain * remainingProgress;
    // Add remaining queued routes
    let totalKm = remainingKm;
    for (const routeId of crawlerState.routeQueue) {
      const r = routeMap[routeId];
      if (r) totalKm += r.distance * r.terrain;
    }

    const seconds = totalKm / CRAWLER_SPEED_KM_S;
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  });

  const typeLabels: Record<string, string> = {
    extraction: "EXTRACTION",
    processing: "PROCESSING",
    settlement: "SETTLEMENT",
    depot: "DEPOT",
    terminal: "TERMINAL",
  };

  function formatCoord(lat: number, lng: number): string {
    const ns = lat >= 0 ? "N" : "S";
    const ew = lng >= 0 ? "E" : "W";
    return `${Math.abs(lat).toFixed(2)}°${ns}  ${Math.abs(lng).toFixed(2)}°${ew}`;
  }

  function handleTravel() {
    if (node) travelTo(node.id);
  }
</script>

{#if node}
  <div class="node-info">
    <div class="header">
      <span class="type">{typeLabels[node.type] ?? node.type}</span>
      <button class="close" onclick={clearSelection}>×</button>
    </div>

    <h2 class="name">{node.name}</h2>

    {#if node.description}
      <p class="desc">{node.description}</p>
    {/if}

    <dl class="fields">
      <dt>POS</dt>
      <dd>{formatCoord(node.position[0], node.position[1])}</dd>

      <dt>H3</dt>
      <dd class="mono">{node.h3Cell}</dd>

      <dt>ELEV</dt>
      <dd class="stub">---</dd>

      <dt>COND</dt>
      <dd class="stub">---</dd>

      <dt>INV</dt>
      <dd class="stub">NO DATA</dd>
    </dl>

    {#if isDockedHere}
      <div class="status docked">DOCKED</div>
    {/if}

    {#if isDestination && isTraveling}
      <div class="travel-status">
        <span class="status traveling">EN ROUTE</span>
        {#if etaDisplay()}
          <span class="eta">ETA {etaDisplay()}</span>
        {/if}
      </div>
      <button class="action cancel" onclick={cancelTravel}>CANCEL</button>
    {/if}

    {#if canTravel() && !isTraveling}
      <button class="action travel" onclick={handleTravel}>TRAVEL</button>
    {/if}
  </div>
{/if}

<style>
  .node-info {
    position: absolute;
    top: 3.5rem;
    right: 0.5rem;
    z-index: 10;
    width: 240px;
    background: rgba(10, 10, 10, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-family: monospace;
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
  }

  .type {
    letter-spacing: 1.5px;
    font-size: 10px;
    opacity: 0.6;
  }

  .close {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    font-family: monospace;
    font-size: 14px;
    cursor: pointer;
    padding: 0 2px;
    line-height: 1;
  }
  .close:hover {
    color: rgba(255, 255, 255, 0.9);
  }

  .name {
    margin: 0;
    padding: 6px 8px 2px;
    font-size: 13px;
    font-weight: normal;
    letter-spacing: 0.5px;
  }

  .desc {
    margin: 0;
    padding: 2px 8px 6px;
    font-size: 10px;
    opacity: 0.5;
    line-height: 1.4;
  }

  .fields {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 8px;
    padding: 6px 8px 8px;
    margin: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  dt {
    opacity: 0.4;
    letter-spacing: 1px;
    font-size: 10px;
  }

  dd {
    margin: 0;
  }

  .mono {
    font-size: 9px;
    opacity: 0.6;
    word-break: break-all;
  }

  .stub {
    opacity: 0.25;
  }

  .status {
    padding: 4px 8px;
    font-size: 10px;
    letter-spacing: 1.5px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .docked {
    color: #00ff88;
  }

  .travel-status {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .traveling {
    color: #d0c040;
    border: none;
  }

  .eta {
    padding: 4px 8px;
    font-size: 10px;
    opacity: 0.6;
  }

  .action {
    display: block;
    width: 100%;
    padding: 6px 8px;
    font-family: monospace;
    font-size: 11px;
    letter-spacing: 1px;
    border: none;
    cursor: pointer;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .travel {
    background: rgba(0, 255, 136, 0.15);
    color: #00ff88;
  }
  .travel:hover {
    background: rgba(0, 255, 136, 0.25);
  }

  .cancel {
    background: rgba(255, 80, 80, 0.15);
    color: #ff5050;
  }
  .cancel:hover {
    background: rgba(255, 80, 80, 0.25);
  }
</style>
