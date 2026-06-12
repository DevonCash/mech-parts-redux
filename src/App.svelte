<script lang="ts">
  import Game from "./Game.svelte";
  import MainMenu from "./ui/menu/MainMenu.svelte";
  import { startNewSession } from "./stores/session";
  import { loadGame, saveGame, clearSave } from "./stores/save";
  import { clearEvents } from "./stores/events";
  import { openPanel } from "./stores/ui";
  import { timeScale } from "./stores/time";

  let playing = $state(false);

  function newGame() {
    clearSave();
    clearEvents();
    openPanel.set(null);
    startNewSession((Math.random() * 0xffffffff) >>> 0);
    saveGame();
    timeScale.set(1);
    playing = true;
  }

  function continueGame() {
    if (!loadGame()) return;
    clearEvents();
    openPanel.set(null);
    timeScale.set(0); // resume paused so the player can reorient
    playing = true;
  }
</script>

{#if playing}
  <Game onNewGame={newGame} onExit={() => (playing = false)} />
{:else}
  <MainMenu {newGame} {continueGame} />
{/if}
