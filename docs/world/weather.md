# Weather & Environment

Dynamic weather systems on Mars and liquid water.

---

## Existing foundation

The economy has dust storms as discrete events. The map uses real MOLA elevation data. The setting is partially terraformed.

---

## Design

### Weather as a continuous system

Model weather as a lightweight fluid simulation over the H3 grid, running at reduced frequency (every 10 ticks or so) with interpolation between updates for rendering. Atmospheric pressure, temperature, and dust concentration propagate across cells. Weather patterns emerge from the simulation: dust storms form in known real-world storm regions (Hellas Basin is notorious), track across the surface, and dissipate. Seasons follow Mars's 687-day year.

The partially-terraformed setting gives us unique weather: occasional rain in lowlands, fog in valleys, thin cloud cover. Weather that's recognizably Earth-like but wrong — rain that smells like iron, fog that's too thin to obscure anything from radar but plays hell with optics.

### Gameplay effects

- Sand and fog obscure sensors — this is the primary combat impact. Dust storms degrade `sensorRange` and `sensorDetail` for units in affected cells.
- Heavy storms inhibit flying units (drones) and deflect artillery projectiles.
- Polarized dust storms interfere with ECM systems — electromagnetic noise can jam jammers.
- Dust reduces solar power output at affected nodes.
- Extreme cold temporarily degrades component performance (batteries, hydraulics).

### Liquid water

The setting has low-lying standing water and weather-dependent rivers and seasonal flooding. Water level is derived from elevation data at runtime — everything below a threshold is ocean or lake. Seasonal variation and weather events (heavy rain in lowlands, melt cycles) cause water levels to fluctuate, creating dynamic terrain. Rivers follow the lowest paths between water bodies, flooding during storms.

Gameplay implications: water is an obstacle for ground vehicles without amphibious capability, a resource source for nearby settlements, and changes the strategic value of lowland vs. highland positions. Flooding can cut off routes or threaten settlements.

---

## What's new

- Weather state per H3 cell: pressure, temperature, dust concentration
- Weather propagation: simplified diffusion + advection, computed every ~10 ticks, interpolated for rendering
- Seasonal cycle: Mars orbital period drives baseline temperature and weather patterns
- Water level system: dynamic threshold on elevation data, fluctuates with weather and season
- River/flood generation: lowest-path routing between water bodies, volume driven by weather
