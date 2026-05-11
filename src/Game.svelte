<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import GameTime from "./ui/hud/GameTime.svelte";
  import PauseMenu from "./ui/menu/PauseMenu.svelte";
  import MarsMap from "./ui/map/MarsMap.svelte";
  import NodeInfo from "./ui/panels/NodeInfo.svelte";

  import { handleKeydown } from "./keybinds";
  import { createStepper, TICK_DURATION_MS } from "./sim/tick";
  import { gameTime, tick, timeScale, alpha } from "./stores/time";

  const stepper = createStepper();
  let rafId: number;

  onMount(() => {
    let lastTime = performance.now();

    function frame(now: number) {
      const realDelta = now - lastTime;
      lastTime = now;

      const result = stepper.step(realDelta, timeScale.get());

      if (result.ticks > 0) {
        const currentTick = tick.get();
        const currentGameTime = gameTime.get();

        // Advance tick counter and game time
        tick.set(currentTick + result.ticks);
        gameTime.set(currentGameTime + result.ticks * TICK_DURATION_MS);

        // Future: run simulation ticks here
        // for (let i = 0; i < result.ticks; i++) { simulate(); }
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
    <PauseMenu />
    <div class="resources">
      <span>
        <label aria-label="Credits" title="Credits" for="money">¤</label>
        <output id="money">{"0".padStart(6, "0")}</output>
      </span>
      <span>
        <label aria-label="Parts" title="Parts" for="parts">⚙</label>
        <output id="parts">0</output>
      </span>
      <span>
        <label aria-label="Fuel" title="Fuel" for="fuel">⏣</label>
        <output id="fuel">0</output>
      </span>
    </div>
    <GameTime />
  </header>

  <main class="map-viewport">
    <MarsMap />
    <NodeInfo />
  </main>
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

  .resources {
    display: flex;
    gap: 3px;
  }

  .resources span {
    display: flex;
    align-items: center;
    background: black;
    color: white;
    border: 2px solid black;
  }

  .resources label {
    height: 1.5rem;
    width: 1.5rem;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .resources output {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    background: white;
    color: black;
    width: 5ch;
    height: 100%;
    padding: 0 0.5ch;
  }

  .resources output::before {
    left: 0;
    position: absolute;
    width: 100%;
    content: "00000";
    opacity: 0.1;
    margin: 0 0.5ch;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    position: relative;
    z-index: 1;
  }

  .map-viewport {
    position: absolute;
    inset: 0;
    z-index: 0;
  }

  dialog {
    z-index: 1000;
  }
</style>
