<script lang="ts">
  import { selection, clearSelection } from "../../stores/selection";
  import { nodes, routes } from "../../stores/world";
  import { intel } from "../../stores/intel";
  import { tick } from "../../stores/time";
  import { crawler } from "../../stores/crawler";
  import { FRESH_TICKS } from "../../sim/intel/models";
  import { formatTickDuration } from "../format";
  import { travelTo, travelOverland, cancelTravel } from "../../stores/travel";
  import { togglePanel } from "../../stores/ui";
  import { CRAWLER_SPEED_KM_S, currentRouteOf } from "../../sim/crawler/movement";
  import { buildOverlandRoute, OFFROAD_TERRAIN } from "../../sim/crawler/overland";
  import { routeMetrics } from "../../sim/contracts/generate";
  import { FACTIONS, nodeFaction } from "../../sim/factions/models";
  import type { GameNode } from "../../sim/economy/models";

  let currentSelection = $state(selection.get());
  let nodeMap = $state(nodes.get());
  let routeMap = $state(routes.get());
  let crawlerState = $state(crawler.get());
  let intelMap = $state(intel.get());
  let currentTick = $state(tick.get());

  $effect(() => {
    const unsubs = [
      selection.subscribe((v) => (currentSelection = v)),
      nodes.subscribe((v) => (nodeMap = v)),
      routes.subscribe((v) => (routeMap = v)),
      crawler.subscribe((v) => (crawlerState = v)),
      intel.subscribe((v) => (intelMap = v)),
      tick.subscribe((v) => (currentTick = v)),
    ];
    return () => unsubs.forEach(u => u());
  });

  // Node state comes from the player's intel snapshots, not ground
  // truth — stale data is the design (intelligence.md).
  let intelReport = $derived(() => {
    if (!node) return null;
    const report = intelMap[node.id];
    if (!report) return null;
    const top = Object.entries(report.market.inventory)
      .filter(([c, qty]) => c !== "fuel" && qty >= 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, qty]) => `${Math.floor(qty)} ${c.toUpperCase()}`);
    const age = currentTick - report.observedTick;
    return {
      summary: top.length > 0 ? top.join(" · ") : "DEPLETED",
      ageLabel: age <= FRESH_TICKS ? "LIVE" : `${formatTickDuration(age)} AGO`,
      fresh: age <= FRESH_TICKS,
    };
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

  // Effective km (distance × terrain) for both travel modes to this node
  let travelOptions = $derived(() => {
    if (!node || !crawlerState.currentNode || crawlerState.currentNode === node.id) {
      return null;
    }
    const from = nodeMap[crawlerState.currentNode];
    if (!from) return null;
    const roads = routeMetrics(
      { nodes: nodeMap, routes: routeMap },
      crawlerState.currentNode,
      node.id,
    );
    const overland = buildOverlandRoute(from, node);
    return {
      roadsKm: roads ? Math.round(roads.effectiveKm) : null,
      overlandKm: Math.round(overland.distance * OFFROAD_TERRAIN),
    };
  });

  // ETA calculation
  let etaDisplay = $derived(() => {
    if (!crawlerState.currentRoute || !crawlerState.destination) return null;
    const route = currentRouteOf(crawlerState, routeMap);
    if (!route) return null;

    const remainingProgress = 1 - crawlerState.routeProgress;
    const remainingKm = route.distance * route.terrain * remainingProgress;
    // Add remaining queued routes
    let totalKm = remainingKm;
    for (const [routeId] of crawlerState.routeQueue) {
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
      <dt>FACTION</dt>
      <dd style="color: {FACTIONS[nodeFaction(node)].color}">
        {FACTIONS[nodeFaction(node)].name}
      </dd>

      <dt>POS</dt>
      <dd>{formatCoord(node.position[0], node.position[1])}</dd>

      <dt>H3</dt>
      <dd class="mono">{node.h3Cell}</dd>

      <dt>ELEV</dt>
      <dd class="stub">---</dd>

      <dt>COND</dt>
      <dd class="stub">---</dd>

      <dt>INV</dt>
      {#if intelReport()}
        {@const report = intelReport()!}
        <dd class="inv">
          {report.summary}
          <span class="intel-age" class:fresh={report.fresh}>{report.ageLabel}</span>
        </dd>
      {:else}
        <dd class="stub">NO CONTACT</dd>
      {/if}
    </dl>

    {#if isDockedHere}
      <div class="status docked">DOCKED</div>
      <div class="dock-actions">
        <button class="action dock" onclick={() => togglePanel("contracts")}>CONTRACTS</button>
        <button class="action dock" onclick={() => togglePanel("market")}>TRADE</button>
        <button class="action dock" onclick={() => togglePanel("forces")}>FORCES</button>
      </div>
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
      {@const options = travelOptions()}
      <div class="travel-options">
        <button class="action travel" onclick={handleTravel}>
          TRAVEL{options?.roadsKm ? ` · ${options.roadsKm} KM` : ""}
        </button>
        <button class="action overland" onclick={() => node && travelOverland(node.id)}>
          OVERLAND{options ? ` · ${options.overlandKm} KM` : ""}
        </button>
      </div>
      <div class="travel-note">EFFECTIVE DISTANCE — ROADS ARE FAST BUT WATCHED</div>
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

  .inv {
    font-size: 9px;
    opacity: 0.7;
  }

  .intel-age {
    display: block;
    font-size: 8px;
    letter-spacing: 1px;
    color: #d0c040;
    opacity: 0.8;
  }

  .intel-age.fresh {
    color: #00ff88;
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

  .travel-options {
    display: flex;
  }
  .travel-options .action {
    font-size: 10px;
  }
  .travel-options .action + .action {
    border-left: 1px solid rgba(255, 255, 255, 0.1);
  }

  .overland {
    background: rgba(208, 192, 64, 0.12);
    color: #d0c040;
  }
  .overland:hover {
    background: rgba(208, 192, 64, 0.25);
    color: #d0c040;
  }

  .travel-note {
    padding: 3px 8px;
    font-size: 8px;
    letter-spacing: 1px;
    opacity: 0.3;
  }

  .cancel {
    background: rgba(255, 80, 80, 0.15);
    color: #ff5050;
  }
  .cancel:hover {
    background: rgba(255, 80, 80, 0.25);
  }

  .dock-actions {
    display: flex;
  }

  .dock {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.8);
    letter-spacing: 1px;
    font-size: 10px;
  }
  .dock:hover {
    background: rgba(255, 255, 255, 0.15);
    color: white;
  }
  .dock + .dock {
    border-left: 1px solid rgba(255, 255, 255, 0.1);
  }
</style>
