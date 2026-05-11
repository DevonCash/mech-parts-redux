<script lang="ts">
  import Game from "./Game.svelte";
  import MainMenu from "./ui/menu/MainMenu.svelte";

  let playing = $state(false);
</script>

{#if playing}
  <Game />
{:else}
  <MainMenu startGame={() => (playing = true)} />
{/if}
