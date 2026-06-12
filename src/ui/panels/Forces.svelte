<script lang="ts">
  import {
    crawlerDock,
    crudeRepair,
    deploy,
    garage,
    precisionRepair,
    recall,
    selectedUnit,
    units,
    RECALL_RANGE_KM,
  } from "../../stores/units";
  import { pilots } from "../../stores/pilots";
  import { company } from "../../stores/company";
  import { openPanel } from "../../stores/ui";
  import { CHASSIS, CRAWLER_UNIT_ID } from "../../sim/combat/catalog";
  import { quoteRepairs } from "../../sim/combat/repair";
  import { unitDestroyed } from "../../sim/combat/damage";
  import { marsDistance } from "../../sim/constants";
  import type { Unit } from "../../sim/combat/models";
  import type { Pilot } from "../../sim/pilots/models";

  let stored = $state<readonly Unit[]>(garage.get());
  let allUnits = $state<readonly Unit[]>(units.get());
  let pilotRoster = $state<readonly Pilot[]>(pilots.get());
  let companyState = $state(company.get());
  let dock = $state(crawlerDock.get());
  let lastError = $state<string | null>(null);

  $effect(() => {
    const unsubs = [
      garage.subscribe((v) => (stored = v)),
      units.subscribe((v) => (allUnits = v)),
      pilots.subscribe((v) => (pilotRoster = v)),
      company.subscribe((v) => (companyState = v)),
      crawlerDock.subscribe((v) => (dock = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  let crawler = $derived(allUnits.find((u) => u.id === CRAWLER_UNIT_ID));
  let fielded = $derived(
    allUnits.filter((u) => u.side === "player" && u.id !== CRAWLER_UNIT_ID),
  );

  function pilotOf(unit: Unit): Pilot | undefined {
    return pilotRoster.find((p) => p.id === unit.pilotId);
  }

  function condition(unit: Unit): number {
    let hp = 0;
    let max = 0;
    for (const stack of Object.values(unit.components)) {
      for (const c of stack) {
        hp += Math.max(0, c.hp);
        max += c.maxHP;
      }
    }
    return max > 0 ? hp / max : 0;
  }

  function nearCrawler(unit: Unit): boolean {
    return (
      !!crawler &&
      marsDistance(unit.lat, unit.lng, crawler.lat, crawler.lng) <= RECALL_RANGE_KM
    );
  }

  function act(result: { ok: boolean; reason?: string }) {
    lastError = result.ok ? null : (result as any).reason;
  }
</script>

<div class="panel">
  <div class="header">
    <span class="title">FORCES</span>
    <span class="stock">
      {companyState.cargo.metal ?? 0} METAL · {companyState.cargo.precision ?? 0} PRECISION
    </span>
    <button class="close" onclick={() => openPanel.set(null)}>×</button>
  </div>

  <div class="section">GARAGE</div>
  {#if stored.length === 0}
    <div class="empty">EMPTY — ALL MECHS FIELDED</div>
  {:else}
    <ul>
      {#each stored as unit (unit.id)}
        {@const quote = quoteRepairs(unit)}
        {@const frac = condition(unit)}
        <li>
          <div class="row">
            <span class="name">{unit.name}</span>
            <span class="chassis">{CHASSIS[unit.chassisId].name.toUpperCase()}</span>
            <span class="bar"><span
                class="fill"
                class:warn={frac < 0.7}
                class:bad={frac < 0.35}
                style="width: {frac * 100}%"
              ></span></span>
          </div>
          {#if pilotOf(unit)}
            {@const pilot = pilotOf(unit)!}
            <div class="row pilot-row">
              <span class="pilot">{pilot.name}</span>
              <span class="skills">
                FID {Math.round(pilot.fidelity * 100)} · JDG {Math.round(pilot.judgment * 100)}
              </span>
              <span class="bar small"><span
                  class="fill stress-fill"
                  class:warn={pilot.stress > 0.4}
                  class:bad={pilot.stress > 0.7}
                  style="width: {pilot.stress * 100}%"
                ></span></span>
            </div>
          {/if}
          <div class="row actions-row">
            <button class="deploy" onclick={() => act(deploy(unit.id))}>DEPLOY</button>
            {#if quote.damagedComponents > 0}
              <button class="crude" onclick={() => act(crudeRepair(unit.id))}>
                CRUDE — {quote.crudeMetal} METAL
              </button>
              <button class="precision" onclick={() => act(precisionRepair(unit.id))}>
                PRECISION — {quote.precisionParts} PARTS
              </button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="section">FIELD</div>
  {#if fielded.length === 0}
    <div class="empty">NO MECHS DEPLOYED</div>
  {:else}
    <ul>
      {#each fielded as unit (unit.id)}
        {@const frac = condition(unit)}
        <li>
          <div class="row">
            <span class="name" class:dead={unitDestroyed(unit)}>{unit.name}</span>
            <span class="chassis">{pilotOf(unit)?.name ?? ""}</span>
            <span class="bar"><span
                class="fill"
                class:warn={frac < 0.7}
                class:bad={frac < 0.35}
                style="width: {frac * 100}%"
              ></span></span>
          </div>
          <div class="row actions-row">
            <button class="deploy" onclick={() => selectedUnit.set(unit.id)}>SELECT</button>
            <button
              class="crude"
              disabled={!nearCrawler(unit)}
              title={nearCrawler(unit) ? "" : `MOVE WITHIN ${RECALL_RANGE_KM} KM OF CRAWLER`}
              onclick={() => act(recall(unit.id))}
            >
              RECALL
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="note">
    {dock ? "WORKSHOP ONLINE" : "REPAIRS REQUIRE DOCK"} · CRUDE REPAIRS DEGRADE MAX CONDITION
  </div>

  {#if lastError}
    <div class="error">{lastError}</div>
  {/if}
</div>

<style>
  .panel {
    width: 340px;
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

  .stock {
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

  .section {
    padding: 4px 8px;
    font-size: 9px;
    letter-spacing: 2px;
    opacity: 0.45;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
  }

  .empty {
    padding: 8px;
    opacity: 0.35;
    letter-spacing: 1px;
    font-size: 10px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  li {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1ch;
  }

  .name {
    color: #00ff88;
    letter-spacing: 1px;
  }

  .name.dead {
    color: #ff5050;
    text-decoration: line-through;
  }

  .chassis {
    font-size: 9px;
    opacity: 0.5;
    flex: 1;
  }

  .bar {
    width: 70px;
    height: 5px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    background: #00ff88;
  }
  .fill.warn {
    background: #d0c040;
  }
  .fill.bad {
    background: #ff5050;
  }

  .pilot-row {
    margin-top: 3px;
    font-size: 9px;
  }

  .pilot {
    color: rgba(255, 255, 255, 0.75);
    letter-spacing: 0.5px;
  }

  .skills {
    opacity: 0.45;
    flex: 1;
  }

  .bar.small {
    width: 40px;
    height: 4px;
  }

  .stress-fill {
    background: rgba(255, 255, 255, 0.35);
  }
  .stress-fill.warn {
    background: #d0c040;
  }
  .stress-fill.bad {
    background: #ff5050;
  }

  .actions-row {
    margin-top: 4px;
    gap: 4px;
  }

  .actions-row button {
    border: none;
    font-family: monospace;
    font-size: 9px;
    letter-spacing: 1px;
    padding: 3px 8px;
    cursor: pointer;
  }

  .actions-row button:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .deploy {
    background: rgba(0, 255, 136, 0.12);
    color: #00ff88;
  }
  .deploy:hover:not(:disabled) {
    background: rgba(0, 255, 136, 0.25);
    color: #00ff88;
  }

  .crude {
    background: rgba(208, 192, 64, 0.12);
    color: #d0c040;
  }
  .crude:hover:not(:disabled) {
    background: rgba(208, 192, 64, 0.25);
    color: #d0c040;
  }

  .precision {
    background: rgba(0, 255, 136, 0.12);
    color: #00ff88;
  }
  .precision:hover:not(:disabled) {
    background: rgba(0, 255, 136, 0.25);
    color: #00ff88;
  }

  .note {
    padding: 4px 8px;
    font-size: 8px;
    letter-spacing: 1px;
    opacity: 0.35;
  }

  .error {
    padding: 4px 8px;
    color: #ff5050;
    font-size: 10px;
    letter-spacing: 1px;
    border-top: 1px solid rgba(255, 80, 80, 0.3);
  }
</style>
