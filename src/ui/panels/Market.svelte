<script lang="ts">
  import { markets, tradeCommodity, buyFuel } from "../../stores/market";
  import { company } from "../../stores/company";
  import { crawlerDock } from "../../stores/units";
  import { openPanel } from "../../stores/ui";
  import { COMMODITIES, type Commodity } from "../../sim/economy/models";
  import { cargoUsed, quote } from "../../sim/economy/market";
  import { formatCredits } from "../format";

  let marketMap = $state(markets.get());
  let companyState = $state(company.get());
  let dock = $state(crawlerDock.get());
  let lastError = $state<string | null>(null);

  $effect(() => {
    const unsubs = [
      markets.subscribe((v) => (marketMap = v)),
      company.subscribe((v) => (companyState = v)),
      crawlerDock.subscribe((v) => (dock = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  let market = $derived(dock ? marketMap[dock] : undefined);

  function trade(commodity: Commodity, qty: number, side: "buy" | "sell") {
    const result = tradeCommodity(commodity, qty, side);
    lastError = result.ok ? null : result.reason;
  }

  function refuel(qty: number) {
    const result = buyFuel(qty);
    lastError = result.ok ? null : result.reason;
  }

  let fuelMissing = $derived(
    Math.ceil(companyState.fuelCapacity - companyState.fuel),
  );
</script>

<div class="panel">
  <div class="header">
    <span class="title">MARKET</span>
    <span class="hold">HOLD {cargoUsed(companyState)}/{companyState.cargoCapacity}</span>
    <button class="close" onclick={() => openPanel.set(null)}>×</button>
  </div>

  {#if !market}
    <div class="empty">DOCK AT A NODE TO TRADE</div>
  {:else}
    <div class="fuel-row">
      <span class="label">FUEL</span>
      <span class="price">¤ {quote(market, "fuel").buy.toFixed(2)}/u</span>
      <span class="held">TANK {Math.floor(companyState.fuel)}/{companyState.fuelCapacity}</span>
      <span class="actions">
        <button onclick={() => refuel(100)}>+100</button>
        <button onclick={() => refuel(fuelMissing)} disabled={fuelMissing <= 0}>FILL</button>
      </span>
    </div>

    <table class="goods">
      <thead>
        <tr>
          <th>GOODS</th>
          <th>BUY</th>
          <th>SELL</th>
          <th>STOCK</th>
          <th>HELD</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each COMMODITIES.filter((c) => c !== "fuel") as commodity (commodity)}
          {@const q = quote(market, commodity)}
          {@const held = companyState.cargo[commodity] ?? 0}
          <tr>
            <td class="name">{commodity.toUpperCase()}</td>
            <td>{q.buy.toFixed(1)}</td>
            <td class="sell">{q.sell.toFixed(1)}</td>
            <td class="stock">{market.inventory[commodity]}</td>
            <td class="held" class:has={held > 0}>{held || "—"}</td>
            <td class="actions">
              <button onclick={() => trade(commodity, 1, "buy")}>+1</button>
              <button onclick={() => trade(commodity, 5, "buy")}>+5</button>
              <button onclick={() => trade(commodity, 1, "sell")} disabled={held < 1}>-1</button>
              <button onclick={() => trade(commodity, 5, "sell")} disabled={held < 5}>-5</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>

    <div class="footer">
      <span>CREDITS</span>
      <span class="credits">¤ {formatCredits(companyState.credits)}</span>
    </div>
  {/if}

  {#if lastError}
    <div class="error">{lastError}</div>
  {/if}
</div>

<style>
  .panel {
    width: 380px;
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

  .hold {
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

  .fuel-row {
    display: flex;
    align-items: center;
    gap: 1.5ch;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(208, 192, 64, 0.25);
    color: #d0c040;
  }

  .fuel-row .label {
    letter-spacing: 1.5px;
    font-size: 10px;
  }

  .fuel-row .held {
    flex: 1;
    text-align: right;
    font-size: 10px;
    opacity: 0.8;
  }

  .goods {
    width: 100%;
    border-collapse: collapse;
  }

  .goods th {
    text-align: left;
    font-size: 9px;
    letter-spacing: 1px;
    opacity: 0.4;
    padding: 4px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-weight: normal;
  }

  .goods td {
    padding: 3px 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .name {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.9);
  }

  .sell {
    color: #00ff88;
    opacity: 0.8;
  }

  .stock {
    opacity: 0.5;
  }

  .held {
    opacity: 0.35;
  }

  .held.has {
    opacity: 1;
    color: #d0c040;
  }

  .actions {
    display: flex;
    gap: 3px;
  }

  .actions button {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.7);
    border: none;
    font-family: monospace;
    font-size: 9px;
    padding: 2px 5px;
    cursor: pointer;
  }

  .actions button:hover:not(:disabled) {
    background: rgba(0, 255, 136, 0.2);
    color: #00ff88;
  }

  .actions button:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    padding: 5px 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 10px;
    letter-spacing: 1px;
    opacity: 0.8;
  }

  .credits {
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
