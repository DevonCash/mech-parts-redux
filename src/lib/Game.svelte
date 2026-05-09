<script lang="ts">
  import { onMount } from "svelte";
  import { fromStore } from "svelte/store";
  import GameTime from "./cmp/GameTime.svelte";
  import PauseMenu from "./cmp/PauseMenu.svelte";
  import MarsMap from "./mars/MarsMap.svelte";
  import { handleKeydown } from "./keybinds";

  let { game } = $props();

  let gameState = $state();

  onMount(() => {
    gameState = fromStore(game.state);
    game.run();
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if gameState}
  <header>
    <PauseMenu {game} />
    <div class="resources">
      <span>
        <label aria-label="Credits" title="Credits" for="money">¤</label>
        <output id="money"
          >{gameState.current.resources.money
            .toString()
            .padStart("0", 6)}</output
        >
      </span>
      <span>
        <label aria-label="Parts" title="Parts" for="parts">⚙</label>
        <output id="parts">{gameState.current.resources.parts}</output>
      </span>
      <span>
        <label aria-label="Fuel" title="Fuel" for="fuel">⏣</label>
        <output id="fuel">{gameState.current.resources.fuel}</output>
      </span>
    </div>
    <GameTime
      state={gameState.current}
      setGameSpeed={(speed: number) => game.setGameSpeed(speed)}
    />
  </header>

  <main class="map-viewport">
    <MarsMap />
  </main>
{/if}

<style>
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

  .controls {
    display: flex;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    position: relative;
    z-index: 10;
  }

  .map-viewport {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  dialog {
    z-index: 1000;
  }
</style>
