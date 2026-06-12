<script lang="ts">
  import { company } from "../../stores/company";
  import { sessionParams } from "../../stores/session";
  import { cargoUsed } from "../../sim/economy/market";
  import { formatCredits } from "../format";

  let companyState = $state(company.get());
  let params = $state(sessionParams.get());

  $effect(() => {
    const unsubs = [
      company.subscribe((v) => (companyState = v)),
      sessionParams.subscribe((v) => (params = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  let fuelFraction = $derived(companyState.fuel / companyState.fuelCapacity);
  let cargo = $derived(cargoUsed(companyState));
  let targetFraction = $derived(
    Math.min(1, Math.max(0, companyState.credits / params.creditTarget)),
  );
</script>

<div class="status">
  <span class="field" title="Credits / debt target">
    <span class="label">¤</span>
    <span class="value">{formatCredits(companyState.credits)}</span>
    <span class="target">/ {formatCredits(params.creditTarget)}</span>
    <span class="bar"><span class="fill target-fill" style="width: {targetFraction * 100}%"></span></span>
  </span>

  <span class="field" title="Fuel">
    <span class="label">FUEL</span>
    <span class="value" class:low={fuelFraction < 0.2}>{Math.floor(companyState.fuel)}</span>
    <span class="bar"><span class="fill fuel-fill" class:low={fuelFraction < 0.2} style="width: {fuelFraction * 100}%"></span></span>
  </span>

  <span class="field" title="Cargo hold">
    <span class="label">HOLD</span>
    <span class="value">{cargo}/{companyState.cargoCapacity}</span>
  </span>
</div>

<style>
  .status {
    display: flex;
    align-items: center;
    gap: 2ch;
    font-family: monospace;
    font-size: 12px;
    background: rgba(10, 10, 10, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.85);
    padding: 4px 10px;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.75ch;
  }

  .label {
    opacity: 0.45;
    letter-spacing: 1px;
    font-size: 10px;
  }

  .value.low {
    color: #ff5050;
  }

  .target {
    opacity: 0.35;
    font-size: 10px;
  }

  .bar {
    width: 60px;
    height: 5px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
  }

  .target-fill {
    background: #00ff88;
  }

  .fuel-fill {
    background: #d0c040;
  }

  .fuel-fill.low {
    background: #ff5050;
  }
</style>
