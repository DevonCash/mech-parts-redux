<script lang="ts">
  import { company } from "../../stores/company";
  import { crawler } from "../../stores/crawler";
  import { emergencyResupply } from "../../stores/market";
  import { pushEvents } from "../../stores/events";
  import { tick } from "../../stores/time";
  import { saveGame } from "../../stores/save";
  import { EMERGENCY_RESUPPLY_COST } from "../../sim/balance";
  import { formatCredits } from "../format";

  let companyState = $state(company.get());
  let crawlerState = $state(crawler.get());

  $effect(() => {
    const unsubs = [
      company.subscribe((v) => (companyState = v)),
      crawler.subscribe((v) => (crawlerState = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  let halted = $derived(
    crawlerState.currentRoute !== null && companyState.fuel <= 0,
  );
  let canAfford = $derived(companyState.credits >= EMERGENCY_RESUPPLY_COST);

  function resupply() {
    const result = emergencyResupply();
    if (result.ok) {
      pushEvents([
        {
          tick: tick.get(),
          kind: "emergency-resupply",
          message: `EMERGENCY RESUPPLY — ¤${formatCredits(EMERGENCY_RESUPPLY_COST)} PAID`,
        },
      ]);
      saveGame();
    }
  }
</script>

{#if halted}
  <div class="banner">
    <span class="alert">FUEL EXHAUSTED — CRAWLER HALTED MID-ROUTE</span>
    <button onclick={resupply} disabled={!canAfford}>
      EMERGENCY RESUPPLY — ¤ {formatCredits(EMERGENCY_RESUPPLY_COST)}
    </button>
  </div>
{/if}

<style>
  .banner {
    position: absolute;
    top: 4rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 150;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    background: rgba(10, 10, 10, 0.95);
    border: 1px solid rgba(255, 80, 80, 0.6);
    padding: 12px 20px;
    font-family: monospace;
  }

  .alert {
    color: #ff5050;
    font-size: 12px;
    letter-spacing: 2px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  button {
    background: rgba(208, 192, 64, 0.15);
    color: #d0c040;
    border: 1px solid rgba(208, 192, 64, 0.4);
    font-family: monospace;
    font-size: 11px;
    letter-spacing: 1px;
    padding: 6px 14px;
    cursor: pointer;
  }

  button:hover:not(:disabled) {
    background: rgba(208, 192, 64, 0.3);
    color: #d0c040;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }
</style>
