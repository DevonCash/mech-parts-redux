<script lang="ts">
  import { selection, clearSelection } from "../../stores/selection";
  import { nodes } from "../../stores/world";
  import type { GameNode } from "../../sim/economy/models";

  let currentSelection = $state(selection.get());
  let nodeMap = $state(nodes.get());

  $effect(() => {
    const unsubSel = selection.subscribe((v) => (currentSelection = v));
    const unsubNodes = nodes.subscribe((v) => (nodeMap = v));
    return () => { unsubSel(); unsubNodes(); };
  });

  let node: GameNode | null = $derived(
    currentSelection?.kind === "node" ? nodeMap[currentSelection.id] ?? null : null
  );

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
</style>
