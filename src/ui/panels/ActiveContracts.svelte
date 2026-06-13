<script lang="ts">
  import {
    activeContracts,
    deliverContract,
    abandonContract,
    lootWreck,
  } from "../../stores/contracts";
  import { crawlerDock, crawlerUnit, units } from "../../stores/units";
  import { nodes, quanta, wrecks } from "../../stores/world";
  import { tick } from "../../stores/time";
  import { company } from "../../stores/company";
  import { LOOT_RANGE_KM } from "../../sim/balance";
  import type { Contract, EscortContract, SalvageContract } from "../../sim/contracts/models";
  import type { Unit } from "../../sim/combat/models";
  import { unitDestroyed } from "../../sim/combat/damage";
  import { marsDistance } from "../../sim/constants";
  import type { CargoWreck } from "../../sim/economy/convoys";
  import type { Quantum } from "../../sim/economy/models";
  import { formatCredits, formatTickDuration } from "../format";

  let active = $state<readonly Contract[]>(activeContracts.get());
  let dock = $state(crawlerDock.get());
  let allUnits = $state<readonly Unit[]>(units.get());
  let nodeMap = $state(nodes.get());
  // Exact tick: deadline urgency and the DUE/OVERDUE flip must not lag.
  // (The panel already re-renders each frame via units/quanta anyway.)
  let currentTick = $state(tick.get());
  let companyState = $state(company.get());
  let allQuanta = $state<readonly Quantum[]>(quanta.get());
  let allWrecks = $state<readonly CargoWreck[]>(wrecks.get());
  let lastError = $state<string | null>(null);

  $effect(() => {
    const unsubs = [
      activeContracts.subscribe((v) => (active = v)),
      crawlerDock.subscribe((v) => (dock = v)),
      units.subscribe((v) => (allUnits = v)),
      nodes.subscribe((v) => (nodeMap = v)),
      tick.subscribe((v) => (currentTick = v)),
      company.subscribe((v) => (companyState = v)),
      quanta.subscribe((v) => (allQuanta = v)),
      wrecks.subscribe((v) => (allWrecks = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  // One pass per store update instead of a find/filter per contract row.
  let quantaById = $derived(new Map(allQuanta.map((q) => [q.id, q])));
  let wrecksById = $derived(new Map(allWrecks.map((w) => [w.id, w])));
  let liveUnitCounts = $derived.by(() => {
    const byContract = new Map<string, number>();
    const byBand = new Map<string, number>();
    for (const u of allUnits) {
      if (unitDestroyed(u)) continue;
      if (u.contractId) byContract.set(u.contractId, (byContract.get(u.contractId) ?? 0) + 1);
      if (u.bandId) byBand.set(u.bandId, (byBand.get(u.bandId) ?? 0) + 1);
    }
    return { byContract, byBand };
  });

  function convoyStatus(contract: EscortContract): string {
    const q = quantaById.get(contract.quantumId);
    if (!q) return "LOST";
    if (q.materialized) return "UNDER ATTACK";
    if (q.location === contract.origin) {
      return `DEPARTS ${formatTickDuration(Math.max(0, contract.departTick - currentTick))}`;
    }
    return "IN TRANSIT";
  }

  function wreckOf(contract: SalvageContract): CargoWreck | undefined {
    return wrecksById.get(contract.wreckId);
  }

  function inLootRange(contract: SalvageContract): boolean {
    const crawler = crawlerUnit();
    const wreck = wreckOf(contract);
    if (!crawler || !wreck) return false;
    return marsDistance(crawler.lat, crawler.lng, wreck.lat, wreck.lng) <= LOOT_RANGE_KM;
  }

  function loot(contract: SalvageContract) {
    const result = lootWreck(contract.wreckId);
    lastError = result.ok ? null : result.reason;
  }

  function hostilesUp(contractId: string): number {
    return liveUnitCounts.byContract.get(contractId) ?? 0;
  }

  function bandUp(bandId: string): number {
    return liveUnitCounts.byBand.get(bandId) ?? 0;
  }

  function nodeName(id: string): string {
    return nodeMap[id]?.name?.toUpperCase() ?? id.toUpperCase();
  }

  function urgency(deadlineTick: number | null): "" | "amber" | "red" {
    if (deadlineTick === null) return "";
    const remaining = deadlineTick - currentTick;
    if (remaining < 18000) return "red"; // < 30 game-min
    if (remaining < 60000) return "amber"; // < ~1.7 game-h
    return "";
  }

  function deliver(id: string) {
    const result = deliverContract(id);
    lastError = result.ok ? null : result.reason;
  }

  function abandon(id: string) {
    const result = abandonContract(id);
    lastError = result.ok ? null : result.reason;
  }
</script>

{#if active.length > 0}
  <div class="tracker">
    <div class="header">ACTIVE CONTRACTS</div>
    <ul>
      {#each active as contract (contract.id)}
        {@const canDeliver =
          (contract.type === "hauling" || contract.type === "salvage") &&
          dock === contract.destination &&
          (companyState.cargo[contract.commodity] ?? 0) >= contract.quantity}
        <li>
          <div class="row">
            {#if contract.type === "combat"}
              <span class="cargo combat">
                CLEAR {hostilesUp(contract.id)}/{contract.hostiles} HOSTILES
              </span>
              <span class="arrow">@</span>
            {:else if contract.type === "security"}
              <span class="cargo combat">
                PATROL {bandUp(contract.bandId)}/{contract.hostiles} RAIDERS
              </span>
              <span class="arrow">@</span>
            {:else if contract.type === "escort"}
              <span class="cargo escort">
                ESCORT {contract.quantity} {contract.commodity.toUpperCase()}
              </span>
              <span class="arrow">→</span>
            {:else if contract.type === "salvage"}
              <span class="cargo escort">
                SALVAGE {contract.quantity} {contract.commodity.toUpperCase()}
              </span>
              <span class="arrow">→</span>
            {:else}
              <span class="cargo">{contract.quantity} {contract.commodity.toUpperCase()}</span>
              <span class="arrow">→</span>
            {/if}
            <span class="dest">{nodeName(contract.destination)}</span>
            <span class="pay">¤{formatCredits(contract.pay)}</span>
          </div>
          <div class="row sub">
            {#if contract.type === "escort"}
              <span class="deadline {convoyStatus(contract) === 'UNDER ATTACK' ? 'red' : ''}">
                {convoyStatus(contract)}
              </span>
            {:else if contract.type === "salvage"}
              {@const wreck = wreckOf(contract)}
              <span class="deadline">
                {wreck ? `${wreck.cargo.qty} AT SITE` : "SITE STRIPPED"}
              </span>
            {:else if contract.deadlineTick !== null}
              <span class="deadline {urgency(contract.deadlineTick)}">
                {contract.deadlineTick > currentTick
                  ? `DUE ${formatTickDuration(contract.deadlineTick - currentTick)}`
                  : "OVERDUE"}
              </span>
            {:else}
              <span class="deadline soft">OPEN</span>
            {/if}
            {#if canDeliver}
              <button class="deliver" onclick={() => deliver(contract.id)}>DELIVER</button>
            {:else if contract.type === "salvage" && inLootRange(contract)}
              <button class="deliver" onclick={() => loot(contract)}>LOOT</button>
            {:else}
              <button class="abandon" onclick={() => abandon(contract.id)}>ABANDON</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    {#if lastError}
      <div class="error">{lastError}</div>
    {/if}
  </div>
{/if}

<style>
  .tracker {
    position: absolute;
    top: 3.5rem;
    left: 0.5rem;
    z-index: 10;
    width: 230px;
    background: rgba(10, 10, 10, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-family: monospace;
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;
  }

  .header {
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    letter-spacing: 1.5px;
    font-size: 10px;
    opacity: 0.6;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    padding: 5px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1ch;
  }

  .sub {
    margin-top: 2px;
    justify-content: space-between;
  }

  .cargo {
    color: rgba(255, 255, 255, 0.9);
    font-size: 10px;
  }

  .cargo.combat {
    color: #ff5050;
  }

  .cargo.escort {
    color: #d0c040;
  }

  .arrow {
    opacity: 0.4;
  }

  .dest {
    opacity: 0.6;
    font-size: 9px;
    flex: 1;
  }

  .pay {
    color: #00ff88;
    font-size: 10px;
  }

  .deadline {
    font-size: 9px;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.5);
  }

  .deadline.amber {
    color: #d0c040;
  }

  .deadline.red {
    color: #ff5050;
  }

  .deadline.soft {
    color: rgba(255, 255, 255, 0.3);
  }

  button {
    border: none;
    font-family: monospace;
    font-size: 9px;
    letter-spacing: 1px;
    padding: 2px 7px;
    cursor: pointer;
  }

  .deliver {
    background: rgba(0, 255, 136, 0.15);
    color: #00ff88;
  }
  .deliver:hover {
    background: rgba(0, 255, 136, 0.3);
    color: #00ff88;
  }

  .abandon {
    background: rgba(255, 80, 80, 0.1);
    color: rgba(255, 80, 80, 0.6);
  }
  .abandon:hover {
    background: rgba(255, 80, 80, 0.25);
    color: #ff5050;
  }

  .error {
    padding: 4px 8px;
    color: #ff5050;
    font-size: 9px;
    letter-spacing: 1px;
    border-top: 1px solid rgba(255, 80, 80, 0.3);
  }
</style>
