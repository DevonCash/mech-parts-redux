<script lang="ts">
  import { createGame } from "./lib/game";
  import Game from "./lib/Game.svelte";
  import MainMenu from "./lib/MainMenu.svelte";

  let game = $state();
</script>

{#if game}
  <Game {game} />
{:else}
  <MainMenu startGame={(id: string) => (game = createGame(id))} />
{/if}
