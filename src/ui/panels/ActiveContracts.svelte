<script lang="ts">
  import {
    activeContracts,
    deliverContract,
    abandonContract,
  } from "../../stores/contracts";
  import { crawler } from "../../stores/crawler";
  import { nodes } from "../../stores/world";
  import { tick } from "../../stores/time";
  import { company } from "../../stores/company";
  import type { Contract } from "../../sim/contracts/models";
  import { formatCredits, formatTickDuration } from "../format";

  let active = $state<readonly Contract[]>(activeContracts.get());
  let crawlerState = $state(crawler.get());
  let nodeMap = $state(nodes.get());
  let currentTick = $state(tick.get());
  let companyState = $state(company.get());
  let lastError = $state<string | null>(null);

  $effect(() => {
    const unsubs = [
      activeContracts.subscribe((v) => (active = v)),
      crawler.subscribe((v) => (crawlerState = v)),
      nodes.subscribe((v) => (nodeMap = v)),
      tick.subscribe((v) => (currentTick = v)),
      company.subscribe((v) => (companyState = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

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
          crawlerState.currentNode === contract.destination &&
          (companyState.cargo[contract.commodity] ?? 0) >= contract.quantity}
        <li>
          <div class="row">
            <span class="cargo">{contract.quantity} {contract.commodity.toUpperCase()}</span>
            <span class="arrow">→</span>
            <span class="dest">{nodeName(contract.destination)}</span>
            <span class="pay">¤{formatCredits(contract.pay)}</span>
          </div>
          <div class="row sub">
            {#if contract.deadlineTick !== null}
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
