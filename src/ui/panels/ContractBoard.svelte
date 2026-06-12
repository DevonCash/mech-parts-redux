<script lang="ts">
  import { boards, activeContracts, acceptContract } from "../../stores/contracts";
  import { crawler } from "../../stores/crawler";
  import { nodes } from "../../stores/world";
  import { tick } from "../../stores/time";
  import { openPanel } from "../../stores/ui";
  import { ACTIVE_CONTRACT_SLOTS } from "../../sim/balance";
  import type { Contract } from "../../sim/contracts/models";
  import { formatCredits, formatTickDuration } from "../format";

  let boardMap = $state(boards.get());
  let active = $state<readonly Contract[]>(activeContracts.get());
  let crawlerState = $state(crawler.get());
  let nodeMap = $state(nodes.get());
  let currentTick = $state(tick.get());
  let lastError = $state<string | null>(null);

  $effect(() => {
    const unsubs = [
      boards.subscribe((v) => (boardMap = v)),
      activeContracts.subscribe((v) => (active = v)),
      crawler.subscribe((v) => (crawlerState = v)),
      nodes.subscribe((v) => (nodeMap = v)),
      tick.subscribe((v) => (currentTick = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  let dockedNode = $derived(crawlerState.currentNode);
  let board = $derived(dockedNode ? boardMap[dockedNode] : undefined);
  let contracts = $derived(board?.contracts ?? []);

  function nodeName(id: string): string {
    return nodeMap[id]?.name?.toUpperCase() ?? id.toUpperCase();
  }

  function accept(id: string) {
    const result = acceptContract(id);
    lastError = result.ok ? null : result.reason;
  }
</script>

<div class="panel">
  <div class="header">
    <span class="title">CONTRACT BOARD</span>
    <span class="slots">{active.length}/{ACTIVE_CONTRACT_SLOTS} ACTIVE</span>
    <button class="close" onclick={() => openPanel.set(null)}>×</button>
  </div>

  {#if !dockedNode}
    <div class="empty">DOCK AT A NODE TO VIEW CONTRACTS</div>
  {:else if contracts.length === 0}
    <div class="empty">NO CONTRACTS POSTED</div>
  {:else}
    <ul class="list">
      {#each contracts as contract (contract.id)}
        <li class="contract">
          <div class="row main">
            <span class="cargo">{contract.quantity} {contract.commodity.toUpperCase()}</span>
            <span class="arrow">→</span>
            <span class="dest">{nodeName(contract.destination)}</span>
          </div>
          <div class="row terms">
            <span class="pay">¤ {formatCredits(contract.pay)}</span>
            {#if contract.deadlineTick !== null}
              <span class="deadline">DUE {formatTickDuration(contract.deadlineTick - currentTick)}</span>
            {:else}
              <span class="deadline soft">NO DEADLINE</span>
            {/if}
            <button class="accept" onclick={() => accept(contract.id)}>ACCEPT</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if lastError}
    <div class="error">{lastError}</div>
  {/if}
</div>

<style>
  .panel {
    width: 300px;
    background: rgba(10, 10, 10, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-family: monospace;
    color: rgba(255, 255, 255, 0.8);
    font-size: 11px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 1ch;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
  }

  .title {
    letter-spacing: 1.5px;
    font-size: 10px;
    opacity: 0.6;
    flex: 1;
  }

  .slots {
    font-size: 9px;
    opacity: 0.5;
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

  .empty {
    padding: 12px 8px;
    opacity: 0.4;
    letter-spacing: 1px;
    font-size: 10px;
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 320px;
    overflow-y: auto;
  }

  .contract {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1ch;
  }

  .main {
    margin-bottom: 3px;
  }

  .cargo {
    color: rgba(255, 255, 255, 0.9);
  }

  .arrow {
    opacity: 0.4;
  }

  .dest {
    opacity: 0.7;
    font-size: 10px;
  }

  .terms {
    justify-content: space-between;
  }

  .pay {
    color: #00ff88;
  }

  .deadline {
    color: #d0c040;
    font-size: 10px;
  }

  .deadline.soft {
    color: rgba(255, 255, 255, 0.35);
  }

  .accept {
    background: rgba(0, 255, 136, 0.15);
    color: #00ff88;
    border: none;
    font-family: monospace;
    font-size: 10px;
    letter-spacing: 1px;
    padding: 2px 8px;
    cursor: pointer;
  }
  .accept:hover {
    background: rgba(0, 255, 136, 0.3);
    color: #00ff88;
  }

  .error {
    padding: 4px 8px;
    color: #ff5050;
    font-size: 10px;
    letter-spacing: 1px;
    border-top: 1px solid rgba(255, 80, 80, 0.3);
  }
</style>
