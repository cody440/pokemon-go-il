const fs = require('fs/promises');
const path = require('path');

const API_BASE = 'https://pokeapi.co/api/v2';
const LIMIT = 151;

const OFFLINE_POKEMON = [
  ['bulbasaur', ['grass', 'poison'], 118, 111, 128, 'common'],
  ['charmander', ['fire'], 116, 93, 118, 'common'],
  ['squirtle', ['water'], 94, 121, 127, 'common'],
  ['pikachu', ['electric'], 112, 96, 111, 'common'],
  ['machamp', ['fighting'], 234, 159, 207, 'rare'],
  ['gengar', ['ghost', 'poison'], 261, 149, 155, 'rare'],
  ['snorlax', ['normal'], 190, 169, 330, 'rare'],
  ['dragonite', ['dragon', 'flying'], 263, 198, 209, 'rare'],
  ['mewtwo', ['psychic'], 300, 182, 214, 'legendary'],
  ['mew', ['psychic'], 210, 210, 225, 'mythical']
];

const DEFAULT_EVENTS = [
  { id: 'community-day', title: 'Community Day', start: daysFromNow(4, 17), end: daysFromNow(4, 20), description: 'בונוסים מוגברים, יותר הופעות בשטח ומתקפות מיוחדות בהתפתחות.', boostTypes: ['grass', 'fire', 'water'] },
  { id: 'raid-hour', title: 'Raid Hour', start: daysFromNow(2, 18), end: daysFromNow(2, 19), description: 'שעת ריידים מוגברת עם בוסים נבחרים.', boostTypes: ['dragon', 'dark'] },
  { id: 'spotlight-hour', title: 'Spotlight Hour', start: daysFromNow(1, 18), end: daysFromNow(1, 19), description: 'הופעה מוגברת של פוקימון ספציפי ובונוס XP/סטארדאסט.', boostTypes: ['electric', 'fairy'] }
];

function daysFromNow(days, hour) {
  const dt = new Date();
  dt.setDate(dt.getDate() + days);
  dt.setHours(hour, 0, 0, 0);
  return dt.toISOString();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.json();
}

function getStat(stats, statName) {
  return stats.find((s) => s.stat.name === statName)?.base_stat ?? 0;
}

async function buildOnlinePokemon() {
  const list = await fetchJson(`${API_BASE}/pokemon?limit=${LIMIT}`);
  const pokemon = [];

  for (const entry of list.results) {
    const details = await fetchJson(entry.url);
    const species = await fetchJson(details.species.url);

    pokemon.push({
      id: details.id,
      name: details.name,
      displayName: details.name[0].toUpperCase() + details.name.slice(1),
      pokedexNumber: details.id,
      types: details.types.map((t) => t.type.name),
      stats: { attack: getStat(details.stats, 'attack'), defense: getStat(details.stats, 'defense'), stamina: getStat(details.stats, 'hp') },
      forms: details.forms.map((f) => f.name),
      variants: { shiny: true, shadow: !['ditto', 'smeargle', 'mew'].includes(details.name), costume: details.id % 7 === 0, event: details.id % 11 === 0 },
      rarityTier: species.is_mythical ? 'mythical' : species.is_legendary ? 'legendary' : details.id % 13 === 0 ? 'rare' : 'common'
    });
  }

  return pokemon;
}

function buildOfflinePokemon() {
  return OFFLINE_POKEMON.map(([name, types, attack, defense, stamina, rarityTier], i) => ({
    id: i + 1,
    name,
    displayName: name[0].toUpperCase() + name.slice(1),
    pokedexNumber: i + 1,
    types,
    stats: { attack, defense, stamina },
    forms: [name],
    variants: { shiny: true, shadow: true, costume: (i + 1) % 3 === 0, event: (i + 1) % 4 === 0 },
    rarityTier
  }));
}

async function buildDatabase() {
  let pokemon;
  let source;
  try {
    pokemon = await buildOnlinePokemon();
    source = 'PokeAPI + Pokemon GO IL enrichment';
  } catch {
    pokemon = buildOfflinePokemon();
    source = 'Offline fallback dataset (network unavailable)';
  }

  return {
    metadata: { source, lastSyncedAt: new Date().toISOString(), pokemonCount: pokemon.length },
    pokemon,
    tradeOptions: {
      variantMultipliers: { shiny: 1.25, shadow: 1.2, purified: 1.08, lucky: 1.12, event: 1.18, costume: 1.1, legacyMove: 1.2 },
      rarityMultipliers: { common: 1, rare: 1.1, legendary: 1.45, mythical: 1.7 }
    },
    events: DEFAULT_EVENTS,
    links: [
      { title: 'Pokemon GO Live', url: 'https://pokemongolive.com' },
      { title: 'Silph Road (Archive)', url: 'https://thesilphroad.com' },
      { title: 'PokeBattler', url: 'https://www.pokebattler.com' },
      { title: 'PvPoke', url: 'https://pvpoke.com' }
    ]
  };
}

async function main() {
  const db = await buildDatabase();
  const outputPath = path.join(__dirname, '..', 'data', 'pokemon-go-db.json');
  await fs.writeFile(outputPath, JSON.stringify(db, null, 2), 'utf8');
  console.log(`Database written: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
