<script lang="ts">
  import { engagement, selectedUnit } from "../../stores/combat";
  import { CHASSIS, COMPONENTS } from "../../sim/combat/catalog";
  import { unitDestroyed } from "../../sim/combat/damage";

  let eng = $state(engagement.get());
  let selected = $state(selectedUnit.get());

  $effect(() => {
    const unsubs = [
      engagement.subscribe((v) => (eng = v)),
      selectedUnit.subscribe((v) => (selected = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  let unit = $derived(eng?.units.find((u) => u.id === selected) ?? null);
  let chassis = $derived(unit ? CHASSIS[unit.chassisId] : null);
  let pilot = $derived(unit && eng ? (eng.pilots[unit.id] ?? null) : null);

  function hpClass(frac: number): string {
    if (frac <= 0) return "dead";
    if (frac < 0.35) return "critical";
    if (frac < 0.7) return "damaged";
    return "";
  }
</script>

{#if unit && chassis}
  <div class="panel">
    <div class="header">
      <span class="name">{unit.name}</span>
      <span class="chassis">{chassis.name.toUpperCase()}</span>
      {#if unitDestroyed(unit)}<span class="kia">DESTROYED</span>{/if}
    </div>

    {#if pilot}
      <div class="pilot-line">
        <span class="pilot-name">{pilot.name}</span>
        <span class="pilot-stress" class:hot={pilot.stress > 0.5}>
          STRESS {Math.round(pilot.stress * 100)}%
        </span>
      </div>
    {/if}

    <div class="order">
      ORDER:
      {#if unit.order.kind === "hold"}HOLD POSITION
      {:else if unit.order.kind === "move"}MOVE
      {:else}ATTACK {eng?.units.find((u) => u.id === (unit!.order as any).targetId)?.name ?? "?"}
      {/if}
    </div>

    {#each chassis.locations as location (location.id)}
      {@const stack = unit.components[location.id] ?? []}
      <div class="location">
        <span class="loc-label">{location.label}</span>
        <div class="components">
          {#each stack as component, i (i)}
            {@const template = COMPONENTS[component.templateId]}
            {@const frac = component.maxHP > 0 ? component.hp / component.maxHP : 0}
            <div class="component {hpClass(frac)}">
              <span class="comp-name">{template.name}</span>
              <span class="bar"><span class="fill" style="width: {Math.max(0, frac) * 100}%"></span></span>
              <span class="hp">{Math.max(0, Math.ceil(component.hp))}/{component.maxHP}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <div class="hint">CLICK GROUND TO MOVE — CLICK HOSTILE TO ATTACK</div>
  </div>
{/if}

<style>
  .panel {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    z-index: 20;
    width: 260px;
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

  .name {
    color: #00ff88;
    letter-spacing: 1px;
  }

  .chassis {
    font-size: 9px;
    opacity: 0.5;
    flex: 1;
  }

  .kia {
    color: #ff5050;
    font-size: 9px;
    letter-spacing: 1px;
  }

  .pilot-line {
    display: flex;
    justify-content: space-between;
    padding: 4px 8px;
    font-size: 9px;
    letter-spacing: 1px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .pilot-name {
    color: rgba(255, 255, 255, 0.85);
  }

  .pilot-stress {
    opacity: 0.5;
  }

  .pilot-stress.hot {
    color: #ff5050;
    opacity: 1;
  }

  .order {
    padding: 4px 8px;
    font-size: 9px;
    letter-spacing: 1px;
    color: #d0c040;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .location {
    display: flex;
    gap: 1ch;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .loc-label {
    width: 5ch;
    font-size: 9px;
    opacity: 0.45;
    letter-spacing: 1px;
    padding-top: 2px;
  }

  .components {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .component {
    display: flex;
    align-items: center;
    gap: 1ch;
  }

  .comp-name {
    flex: 1;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar {
    width: 50px;
    height: 4px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
    flex-shrink: 0;
  }

  .fill {
    display: block;
    height: 100%;
    background: #00ff88;
  }

  .damaged .fill {
    background: #d0c040;
  }

  .critical .fill {
    background: #ff5050;
  }

  .dead {
    opacity: 0.35;
  }
  .dead .comp-name {
    text-decoration: line-through;
  }

  .hp {
    font-size: 9px;
    opacity: 0.5;
    width: 7ch;
    text-align: right;
  }

  .hint {
    padding: 4px 8px;
    font-size: 8px;
    letter-spacing: 1px;
    opacity: 0.35;
  }
</style>
