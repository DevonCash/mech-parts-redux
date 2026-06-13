<script lang="ts">
  import { selection, clearSelection } from "../../stores/selection";
  import { nodes, routes } from "../../stores/world";
  import { intel } from "../../stores/intel";
  import { tickCoarse } from "../../stores/time";
  import { crawlerDock, units } from "../../stores/units";
  import { FRESH_TICKS } from "../../sim/intel/models";
  import { formatTickDuration } from "../format";
  import { travelTo, travelOverland, cancelTravel } from "../../stores/travel";
  import { togglePanel } from "../../stores/ui";
  import { CRAWLER_SPEED_KM_S } from "../../sim/crawler/movement";
  import { remainingKm, ROAD_SPEED_MULT } from "../../sim/combat/orders";
  import { CRAWLER_UNIT_ID } from "../../sim/combat/catalog";
  import { marsDistance } from "../../sim/constants";
  import { routeMetrics } from "../../sim/contracts/generate";
  import { FACTIONS, nodeFaction } from "../../sim/factions/models";
  import type { GameNode } from "../../sim/economy/models";

  let currentSelection = $state(selection.get());
  let nodeMap = $state(nodes.get());
  let routeMap = $state(routes.get());
  let allUnits = $state(units.get());
  let dock = $state(crawlerDock.get());
  let intelMap = $state(intel.get());
  // Intel age renders at second granularity — tickCoarse notifies once
  // per game-second instead of every tick batch.
  let currentTick = $state(tickCoarse.get());

  $effect(() => {
    const unsubs = [
      selection.subscribe((v) => (currentSelection = v)),
      nodes.subscribe((v) => (nodeMap = v)),
      routes.subscribe((v) => (routeMap = v)),
      units.subscribe((v) => (allUnits = [...v])),
      crawlerDock.subscribe((v) => (dock = v)),
      intel.subscribe((v) => (intelMap = v)),
      tickCoarse.subscribe((v) => (currentTick = v)),
    ];
    return () => unsubs.forEach(u => u());
  });

  let crawler = $derived(allUnits.find((u) => u.id === CRAWLER_UNIT_ID) ?? null);

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
  let isDockedHere = $derived(node !== null && dock === node.id);

  // Is the crawler currently executing a move order?
  let isTraveling = $derived(crawler?.order.kind === "move");

  // Is this node the crawler's dock target?
  let isDestination = $derived(
    node !== null &&
      crawler?.order.kind === "move" &&
      crawler.order.dockNodeId === node.id,
  );

  // Road metrics depend only on (dock, target node), not the crawler's
  // live position — memoize the graph walk so it doesn't re-run on
  // every movement tick.
  let roadsKm = $derived.by(() => {
    if (!node || !dock || dock === node.id) return null;
    const roads = routeMetrics({ nodes: nodeMap, routes: routeMap }, dock, node.id);
    return roads ? Math.round(roads.effectiveKm) : null;
  });

  // Effective km (cost-comparable: time and fuel both scale with it)
  // for both travel modes to this node
  let travelOptions = $derived(() => {
    if (!node || !crawler || isDockedHere) return null;
    const directKm = marsDistance(crawler.lat, crawler.lng, node.position[0], node.position[1]);
    return {
      roadsKm,
      directKm: Math.round(directKm),
    };
  });

  // ETA from the crawler's live move order
  let etaDisplay = $derived(() => {
    if (!crawler || crawler.order.kind !== "move") return null;
    const groundKm = remainingKm(crawler.lat, crawler.lng, crawler.order);
    const speed =
      CRAWLER_SPEED_KM_S * (crawler.order.mode === "road" ? ROAD_SPEED_MULT : 1);
    const seconds = groundKm / speed;
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

    {#if !isDockedHere && !isTraveling}
      {@const options = travelOptions()}
      <div class="travel-options">
        <button
          class="action travel"
          disabled={!dock || options?.roadsKm === null}
          onclick={handleTravel}
        >
          ROADS{options?.roadsKm ? ` · ${options.roadsKm} KM` : ""}
        </button>
        <button class="action overland" onclick={() => node && travelOverland(node.id)}>
          DIRECT{options ? ` · ${options.directKm} KM` : ""}
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
