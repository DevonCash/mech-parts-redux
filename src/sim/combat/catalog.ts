/**
 * Component and chassis catalog — data, not code. New mech designs are
 * a different LocationDef[] and loadout, per the universality principle.
 */
import type {
  Chassis,
  ComponentInstance,
  ComponentTemplate,
  Unit,
} from './models'

export const COMPONENTS: Record<string, ComponentTemplate> = {
  // Weapons. Hardness interplay is the texture: autocannons can't
  // scratch heavy plate (hardness 8 eats their 6 damage); cannons can.
  autocannon: {
    id: 'autocannon',
    name: 'AC/20 Autocannon',
    type: 'weapon',
    maxHP: 20,
    hardness: 0,
    damage: 6,
    rangeKm: 0.9,
    cooldownTicks: 10,
  },
  cannon: {
    id: 'cannon',
    name: 'K-90 Cannon',
    type: 'weapon',
    maxHP: 30,
    hardness: 2,
    damage: 25,
    rangeKm: 1.5,
    cooldownTicks: 40,
  },
  // Armor: tough things that take hits first because of where they sit.
  'plate-light': {
    id: 'plate-light',
    name: 'Light Plate',
    type: 'armor',
    maxHP: 60,
    hardness: 4,
  },
  'plate-heavy': {
    id: 'plate-heavy',
    name: 'Heavy Plate',
    type: 'armor',
    maxHP: 120,
    hardness: 8,
  },
  // Locomotion: speed scales with hp/maxHP.
  'actuator-biped': {
    id: 'actuator-biped',
    name: 'Biped Actuators',
    type: 'locomotion',
    maxHP: 40,
    hardness: 1,
    topSpeedKmS: 0.03,
  },
  gyro: {
    id: 'gyro',
    name: 'Gyro Assembly',
    type: 'structure',
    maxHP: 25,
    hardness: 1,
  },
  // Cockpit at 0 HP = unit out of the fight.
  cockpit: {
    id: 'cockpit',
    name: 'Cockpit',
    type: 'cockpit',
    maxHP: 15,
    hardness: 0,
  },
}

export const CHASSIS: Record<string, Chassis> = {
  scout: {
    id: 'scout',
    name: 'Vidar Scout',
    locations: [
      { id: 'head', label: 'HEAD', hitWeight: 1 },
      { id: 'torso', label: 'TORSO', hitWeight: 4 },
      { id: 'left_arm', label: 'L.ARM', hitWeight: 2, parent: 'torso' },
      { id: 'right_arm', label: 'R.ARM', hitWeight: 2, parent: 'torso' },
      { id: 'legs', label: 'LEGS', hitWeight: 3, parent: 'torso' },
    ],
  },
  trooper: {
    id: 'trooper',
    name: 'Brandr Trooper',
    locations: [
      { id: 'head', label: 'HEAD', hitWeight: 1 },
      { id: 'torso', label: 'TORSO', hitWeight: 5 },
      { id: 'left_arm', label: 'L.ARM', hitWeight: 2, parent: 'torso' },
      { id: 'right_arm', label: 'R.ARM', hitWeight: 2, parent: 'torso' },
      { id: 'legs', label: 'LEGS', hitWeight: 3, parent: 'torso' },
    ],
  },
  // Raider frames: same skeletons, patched-together loadouts. Earth-era
  // mil-spec gear (the player's lance) outclasses scavenged kit.
  'raider-scout': {
    id: 'raider-scout',
    name: 'Scavenged Scout',
    locations: [
      { id: 'head', label: 'HEAD', hitWeight: 1 },
      { id: 'torso', label: 'TORSO', hitWeight: 4 },
      { id: 'left_arm', label: 'L.ARM', hitWeight: 2, parent: 'torso' },
      { id: 'right_arm', label: 'R.ARM', hitWeight: 2, parent: 'torso' },
      { id: 'legs', label: 'LEGS', hitWeight: 3, parent: 'torso' },
    ],
  },
  'raider-trooper': {
    id: 'raider-trooper',
    name: 'Scavenged Trooper',
    locations: [
      { id: 'head', label: 'HEAD', hitWeight: 1 },
      { id: 'torso', label: 'TORSO', hitWeight: 5 },
      { id: 'left_arm', label: 'L.ARM', hitWeight: 2, parent: 'torso' },
      { id: 'right_arm', label: 'R.ARM', hitWeight: 2, parent: 'torso' },
      { id: 'legs', label: 'LEGS', hitWeight: 3, parent: 'torso' },
    ],
  },
}

/** Loadouts per chassis: location → template ids, outermost first. */
const LOADOUTS: Record<string, Record<string, string[]>> = {
  scout: {
    head: ['cockpit'],
    torso: ['plate-light', 'gyro'],
    left_arm: ['autocannon'],
    right_arm: ['autocannon'],
    legs: ['actuator-biped'],
  },
  trooper: {
    head: ['cockpit'],
    torso: ['plate-heavy', 'gyro'],
    left_arm: ['cannon'],
    right_arm: ['autocannon'],
    legs: ['actuator-biped'],
  },
  'raider-scout': {
    head: ['cockpit'],
    torso: ['gyro'], // no plate — scavengers run exposed
    left_arm: ['autocannon'],
    legs: ['actuator-biped'],
  },
  'raider-trooper': {
    head: ['cockpit'],
    torso: ['plate-light', 'gyro'],
    left_arm: ['cannon'],
    legs: ['actuator-biped'],
  },
}

export function instantiate(templateId: string): ComponentInstance {
  const t = COMPONENTS[templateId]
  return { templateId, hp: t.maxHP, maxHP: t.maxHP }
}

export function buildUnit(
  id: string,
  name: string,
  chassisId: string,
  side: Unit['side'],
  lat: number,
  lng: number,
): Unit {
  const loadout = LOADOUTS[chassisId]
  const components: Unit['components'] = {}
  for (const [locationId, templateIds] of Object.entries(loadout)) {
    components[locationId] = templateIds.map(instantiate)
  }
  return {
    id,
    name,
    chassisId,
    side,
    lat,
    lng,
    components,
    order: { kind: 'hold' },
    cooldowns: {},
  }
}

/** The company's starting lance, paired with the starting pilots. */
export function startingForces(): Unit[] {
  return [
    { ...buildUnit('mech-1', 'DUSTRUNNER', 'scout', 'player', 0, 0), pilotId: 'pilot-1' },
    { ...buildUnit('mech-2', 'HAMMERFALL', 'trooper', 'player', 0, 0), pilotId: 'pilot-2' },
  ]
}
