import { atom } from "nanostores";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function createGame(id?: string) {
  if (id === null) {
    id = id ?? `game:${crypto.randomUUID()}`;
    games.set([...games.get(), id]);
  }
  const state = atom({
    time: 0,
    timeScale: 1,
    resources: {
      money: 0,
      parts: 0,
      fuel: 0,
    },
    entities: [],
  });

  if (localStorage.getItem(id)) {
    const saved = JSON.parse(localStorage.getItem(id)!) as ReturnType<
      typeof state.get
    >;
    state.set(saved);
  }

  state.subscribe((value) => {
    localStorage.setItem(id!, JSON.stringify(value));
  });

  return {
    id,
    _exit: false,
    state,
    step(delta: number) {
      const previous = this.state.get();
      if (previous.timeScale === 0) return;

      const next = {
        ...previous,
        time: previous.time + delta * previous.timeScale,
      };

      this.state.set(next);
    },

    setGameSpeed(speed: number) {
      if (speed < 0) throw new Error("Speed cannot be negative");
      const previous = this.state.get();
      this.state.set({ ...previous, timeScale: speed });
    },

    async run() {
      let lastTime = performance.now();
      while (!this._exit) {
        await wait(1000 / 60);
        const now = performance.now();
        this.step(now - lastTime);
        lastTime = now;
      }
    },
  };
}

const games = atom<string[]>([]);

games.set(listGames());

function listGames(): string[] {
  const keys = Object.keys(localStorage);
  return keys.filter((key) => key.startsWith("game:"));
}

function deleteGame(id: string) {
  localStorage.removeItem(id);
  games.set(listGames());
}

export { createGame, deleteGame, games };
