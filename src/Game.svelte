<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import GameTime from "./ui/hud/GameTime.svelte";
  import CompanyStatus from "./ui/hud/CompanyStatus.svelte";
  import EventFeed from "./ui/hud/EventFeed.svelte";
  import StrandedBanner from "./ui/hud/StrandedBanner.svelte";
  import PauseMenu from "./ui/menu/PauseMenu.svelte";
  import GameOver from "./ui/menu/GameOver.svelte";
  import MarsMap from "./ui/map/MarsMap.svelte";
  import NodeInfo from "./ui/panels/NodeInfo.svelte";
  import ContractBoard from "./ui/panels/ContractBoard.svelte";
  import Market from "./ui/panels/Market.svelte";
  import ActiveContracts from "./ui/panels/ActiveContracts.svelte";
  import Forces from "./ui/panels/Forces.svelte";
  import UnitStatus from "./ui/panels/UnitStatus.svelte";

  import { handleKeydown } from "./keybinds";
  import { createStepper } from "./sim/tick";
  import { timeScale, alpha } from "./stores/time";
  import { advanceTick } from "./sim/session/pipeline";
  import type { GameEvent } from "./sim/session/state";
  import {
    applySessionState,
    gatherSessionState,
    getWorld,
    endState,
  } from "./stores/session";
  import { pushEvents } from "./stores/events";
  import { saveGame } from "./stores/save";
  import { openPanel, type DockPanel } from "./stores/ui";

  let { onNewGame, onExit }: { onNewGame: () => void; onExit: () => void } =
    $props();

  const stepper = createStepper();
  const AUTOSAVE_INTERVAL_MS = 15000;
  let rafId: number;
  let lastAutosave = performance.now();

  let panel = $state<DockPanel>(openPanel.get());
  let ended = $state(endState.get());

  $effect(() => {
    const unsubs = [
      openPanel.subscribe((v) => (panel = v)),
      endState.subscribe((v) => (ended = v)),
    ];
    return () => unsubs.forEach((u) => u());
  });

  onMount(() => {
    let lastTime = performance.now();
    const world = getWorld();

    function frame(now: number) {
      const realDelta = now - lastTime;
      lastTime = now;

      const result = stepper.step(realDelta, timeScale.get());

      if (result.ticks > 0 && !endState.get()) {
        let session = gatherSessionState();
        const events: GameEvent[] = [];

        for (let i = 0; i < result.ticks; i++) {
          const r = advanceTick(session, world);
          session = r.state;
          if (r.events.length > 0) events.push(...r.events);
          if (session.endState) break;
        }

        applySessionState(session);
        if (events.length > 0) pushEvents(events);

        // Autosave at tick-batch boundaries only — never mid-batch.
        if (session.endState) {
          saveGame();
        } else if (now - lastAutosave > AUTOSAVE_INTERVAL_MS) {
          saveGame();
          lastAutosave = now;
        }
      }

      alpha.set(result.alpha);

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
  });

  onDestroy(() => {
    cancelAnimationFrame(rafId);
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="game-shell">
  <header>
    <PauseMenu {onExit} />
    <CompanyStatus />
    <GameTime />
  </header>

  <main class="map-viewport">
    <MarsMap />
    <NodeInfo />
    <ActiveContracts />

    {#if panel === "contracts"}
      <div class="dock-panel"><ContractBoard /></div>
    {:else if panel === "market"}
      <div class="dock-panel"><Market /></div>
    {:else if panel === "forces"}
      <div class="dock-panel"><Forces /></div>
    {/if}

    <UnitStatus />
    <StrandedBanner />
    <EventFeed />
  </main>

  {#if ended}
    <GameOver {onNewGame} />
  {/if}
</div>

<style>
  :global(html), :global(body), :global(#app) {
    margin: 0;
    padding: 0;
    height: 100%;
    overflow: hidden;
  }

  .game-shell {
    height: 100dvh;
    position: relative;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.5rem;
    position: relative;
    z-index: 1;
  }

  .map-viewport {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  .dock-panel {
    position: absolute;
    bottom: 0.5rem;
    right: 0.5rem;
    z-index: 20;
  }
</style>
