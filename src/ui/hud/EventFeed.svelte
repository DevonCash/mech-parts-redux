<script lang="ts">
  import { eventFeed, type FeedEvent } from "../../stores/events";

  const TOAST_LIFETIME_MS = 7000;

  let events = $state<readonly FeedEvent[]>(eventFeed.get());
  let now = $state(Date.now());

  $effect(() => {
    const unsub = eventFeed.subscribe((v) => (events = v));
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  });

  let visible = $derived(events.filter((e) => now - e.receivedAt < TOAST_LIFETIME_MS));

  const KIND_CLASS: Record<string, string> = {
    ambush: "bad",
    "fuel-empty": "bad",
    "contract-failed": "bad",
    stranded: "bad",
    bankrupt: "bad",
    arrival: "good",
    "contract-completed": "good",
    victory: "good",
    "emergency-resupply": "warn",
  };
</script>

{#if visible.length > 0}
  <div class="feed">
    {#each visible as event (event.id)}
      <div class="toast {KIND_CLASS[event.kind] ?? ''}">{event.message}</div>
    {/each}
  </div>
{/if}

<style>
  .feed {
    position: absolute;
    bottom: 48px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    z-index: 200;
    pointer-events: none;
  }

  .toast {
    font-family: monospace;
    font-size: 11px;
    letter-spacing: 1px;
    padding: 4px 12px;
    background: rgba(10, 10, 10, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: rgba(255, 255, 255, 0.85);
  }

  .toast.bad {
    border-color: rgba(255, 80, 80, 0.5);
    color: #ff5050;
  }

  .toast.good {
    border-color: rgba(0, 255, 136, 0.5);
    color: #00ff88;
  }

  .toast.warn {
    border-color: rgba(208, 192, 64, 0.5);
    color: #d0c040;
  }
</style>
