<script lang="ts">
  import { forces, crudeRepair, precisionRepair } from "../../stores/forces";
  import { pilots } from "../../stores/pilots";
  import { company } from "../../stores/company";
  import { openPanel } from "../../stores/ui";
  import { CHASSIS } from "../../sim/combat/catalog";
  import { quoteRepairs } from "../../sim/combat/repair";
  import { unitDestroyed } from "../../sim/combat/damage";
  import type { Unit } from "../../sim/combat/models";
  import type { Pilot } from "../../sim/pilots/models";

  let roster = $state<readonly Unit[]>(forces.get());
  let pilotRoster = $state<readonly Pilot[]>(pilots.get());
  let companyState = $state(company.get());
  let lastError = $state<string | null>(null);

  $effect(() => {
    const unsubs = [
      forces.subscribe((v) => (roster = v)),
      pilots.subscribe((v) => (pilotRoster = v)),
      company.subscribe((v) => (companyState = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

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

  function repair(unitId: string, grade: "crude" | "precision") {
    const result = grade === "crude" ? crudeRepair(unitId) : precisionRepair(unitId);
    lastError = result.ok ? null : result.reason;
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

  {#if roster.length === 0}
    <div class="empty">NO OPERATIONAL MECHS</div>
  {:else}
    <ul>
      {#each roster as unit (unit.id)}
        {@const quote = quoteRepairs(unit)}
        {@const frac = condition(unit)}
        <li>
          <div class="row">
            <span class="name" class:dead={unitDestroyed(unit)}>{unit.name}</span>
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
              <span class="stress-label" class:hot={pilot.stress > 0.5}>STRESS</span>
              <span class="bar small"><span
                  class="fill stress-fill"
                  class:warn={pilot.stress > 0.4}
                  class:bad={pilot.stress > 0.7}
                  style="width: {pilot.stress * 100}%"
                ></span></span>
            </div>
          {/if}
          {#if quote.damagedComponents > 0}
            <div class="row repairs">
              <button class="crude" onclick={() => repair(unit.id, "crude")}>
                CRUDE — {quote.crudeMetal} METAL
              </button>
              <button class="precision" onclick={() => repair(unit.id, "precision")}>
                PRECISION — {quote.precisionParts} PARTS
              </button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  <div class="note">CRUDE REPAIRS DEGRADE MAX CONDITION · WORKSHOP REQUIRES DOCK</div>

  {#if lastError}
    <div class="error">{lastError}</div>
  {/if}
</div>

<style>
  .panel {
    width: 320px;
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

  .empty {
    padding: 12px 8px;
    opacity: 0.4;
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

  .stress-label {
    font-size: 8px;
    letter-spacing: 1px;
    opacity: 0.4;
  }

  .stress-label.hot {
    color: #ff5050;
    opacity: 0.9;
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

  .repairs {
    margin-top: 4px;
    gap: 4px;
  }

  .repairs button {
    border: none;
    font-family: monospace;
    font-size: 9px;
    letter-spacing: 1px;
    padding: 3px 8px;
    cursor: pointer;
  }

  .crude {
    background: rgba(208, 192, 64, 0.12);
    color: #d0c040;
  }
  .crude:hover {
    background: rgba(208, 192, 64, 0.25);
    color: #d0c040;
  }

  .precision {
    background: rgba(0, 255, 136, 0.12);
    color: #00ff88;
  }
  .precision:hover {
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
