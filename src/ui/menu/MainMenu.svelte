<script lang="ts">
  import { hasSave } from "../../stores/save";

  let {
    newGame,
    continueGame,
  }: { newGame: () => void; continueGame: () => void } = $props();

  const saveExists = hasSave();
</script>

<div class="menu-screen">
  <div class="title-block">
    <h1>MECH.PARTS</h1>
    <p class="tagline">MARS // POST-PULLBACK // COMMAND AI ONLINE</p>
  </div>

  <menu>
    {#if saveExists}
      <li><button onclick={continueGame}>CONTINUE</button></li>
    {/if}
    <li><button onclick={newGame}>NEW GAME</button></li>
  </menu>
</div>

<style>
  .menu-screen {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 48px;
    background: #0a0a0a;
    font-family: monospace;
  }

  .title-block {
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 32px;
    letter-spacing: 8px;
    color: rgba(255, 255, 255, 0.95);
    font-weight: normal;
  }

  .tagline {
    margin: 8px 0 0;
    font-size: 11px;
    letter-spacing: 3px;
    color: rgba(0, 255, 136, 0.6);
  }

  menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0;
    list-style: none;
    width: 220px;
  }

  li button {
    width: 100%;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.25);
    font-family: monospace;
    font-size: 13px;
    letter-spacing: 3px;
    padding: 10px;
    cursor: pointer;
  }

  li button:hover {
    background: rgba(0, 255, 136, 0.12);
    border-color: rgba(0, 255, 136, 0.5);
    color: #00ff88;
  }
</style>
