<script lang="ts">
  import { endState, sessionStats } from "../../stores/session";
  import { gameTime } from "../../stores/time";
  import { formatCredits } from "../format";

  let { onNewGame }: { onNewGame: () => void } = $props();

  let end = $state(endState.get());
  let stats = $state(sessionStats.get());
  let time = $state(gameTime.get());

  $effect(() => {
    const unsubs = [
      endState.subscribe((v) => (end = v)),
      sessionStats.subscribe((v) => (stats = v)),
      gameTime.subscribe((v) => (time = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  // A Mars sol is 24h 39m 35s
  const SOL_MS = 88775000;
  let sols = $derived((time / SOL_MS).toFixed(1));

  const TITLES: Record<string, string> = {
    victory: "DEBT CLEARED",
    stranded: "CRAWLER STRANDED",
    bankrupt: "COMPANY DISSOLVED",
  };

  const DETAILS: Record<string, string> = {
    victory:
      "The company's charter debt is paid in full. The crawler is yours.",
    stranded:
      "Out of fuel, out of credits, out of reach. The dust will take the rest.",
    bankrupt:
      "Creditors seized the crawler and its server core. Command terminated.",
  };
</script>

{#if end}
  <div class="overlay" class:victory={end.kind === "victory"}>
    <div class="terminal">
      <div class="title">{TITLES[end.kind]}</div>
      <div class="detail">{DETAILS[end.kind]}</div>

      <dl class="stats">
        <dt>SOLS OPERATED</dt>
        <dd>{sols}</dd>
        <dt>CONTRACTS COMPLETED</dt>
        <dd>{stats.contractsCompleted}</dd>
        <dt>CONTRACTS FAILED</dt>
        <dd>{stats.contractsFailed}</dd>
        <dt>AMBUSHES SURVIVED</dt>
        <dd>{stats.ambushes}</dd>
        <dt>CREDITS EARNED</dt>
        <dd>¤ {formatCredits(stats.creditsEarned)}</dd>
      </dl>

      <button class="restart" onclick={onNewGame}>NEW GAME</button>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(10, 10, 10, 0.85);
    z-index: 500;
    font-family: monospace;
  }

  .terminal {
    width: 340px;
    border: 1px solid rgba(255, 80, 80, 0.5);
    background: rgba(10, 10, 10, 0.95);
    padding: 24px;
    color: rgba(255, 255, 255, 0.85);
  }

  .victory .terminal {
    border-color: rgba(0, 255, 136, 0.5);
  }

  .title {
    font-size: 18px;
    letter-spacing: 3px;
    color: #ff5050;
    margin-bottom: 8px;
  }

  .victory .title {
    color: #00ff88;
  }

  .detail {
    font-size: 11px;
    opacity: 0.6;
    line-height: 1.5;
    margin-bottom: 20px;
  }

  .stats {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 16px;
    margin: 0 0 24px;
    font-size: 11px;
  }

  dt {
    opacity: 0.45;
    letter-spacing: 1px;
    font-size: 10px;
  }

  dd {
    margin: 0;
    text-align: right;
  }

  .restart {
    width: 100%;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.3);
    font-family: monospace;
    font-size: 12px;
    letter-spacing: 2px;
    padding: 8px;
    cursor: pointer;
  }

  .restart:hover {
    background: rgba(255, 255, 255, 0.18);
    color: white;
  }
</style>
