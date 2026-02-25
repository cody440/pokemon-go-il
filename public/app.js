const PAGES = [
  { id: 'links', title: 'קישורים' },
  { id: 'alerts', title: 'התרעות' },
  { id: 'types', title: 'מדריך סוגים' },
  { id: 'pokedex', title: 'Pokédex' },
  { id: 'calendar', title: 'לוח שנה' },
  { id: 'trade', title: 'Trade AI' }
];

const TYPE_CHART = {
  fire: { strong: ['grass', 'ice', 'bug', 'steel'], weak: ['water', 'rock', 'dragon'] },
  water: { strong: ['fire', 'ground', 'rock'], weak: ['water', 'grass', 'dragon'] },
  grass: { strong: ['water', 'ground', 'rock'], weak: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon'] },
  electric: { strong: ['water', 'flying'], weak: ['electric', 'grass', 'dragon'] },
  psychic: { strong: ['fighting', 'poison'], weak: ['psychic', 'steel', 'dark'] },
  fighting: { strong: ['normal', 'rock', 'steel', 'ice', 'dark'], weak: ['poison', 'flying', 'psychic', 'bug', 'fairy'] }
};

let db;

async function init() {
  const res = await fetch('/api/db');
  db = await res.json();
  renderNav();
  showPage('links');
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  PAGES.forEach((page) => {
    const btn = document.createElement('button');
    btn.textContent = page.title;
    btn.onclick = () => showPage(page.id);
    nav.appendChild(btn);
  });
}

function showPage(pageId) {
  const app = document.getElementById('app');
  const tpl = document.getElementById(`page-${pageId}`);
  app.innerHTML = '';
  app.appendChild(tpl.content.cloneNode(true));

  if (pageId === 'links') renderLinks();
  if (pageId === 'alerts') renderAlerts();
  if (pageId === 'types') renderTypes();
  if (pageId === 'pokedex') renderPokedex();
  if (pageId === 'calendar') renderCalendar();
  if (pageId === 'trade') renderTrade();
}

function renderLinks() {
  const list = document.getElementById('links-list');
  db.links.forEach((link) => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="${link.url}" target="_blank" rel="noreferrer">${link.title}</a>`;
    list.appendChild(li);
  });
}

function renderAlerts() {
  const root = document.getElementById('alerts-list');
  const now = Date.now();
  db.events
    .sort((a, b) => new Date(a.start) - new Date(b.start))
    .forEach((event) => {
      const start = new Date(event.start);
      const hoursLeft = Math.max(0, Math.round((start.getTime() - now) / 36e5));
      const div = document.createElement('div');
      div.className = 'poke-card';
      div.innerHTML = `<strong>${event.title}</strong><p>${event.description}</p><small>מתחיל בעוד ${hoursLeft} שעות</small>`;
      root.appendChild(div);
    });
}

function renderTypes() {
  const tbody = document.getElementById('types-table');
  Object.entries(TYPE_CHART).forEach(([type, data]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${type}</td><td>${data.strong.join(', ')}</td><td>${data.weak.join(', ')}</td>`;
    tbody.appendChild(tr);
  });
}

function renderPokedex() {
  const grid = document.getElementById('pokedex-grid');
  const input = document.getElementById('pokedex-search');

  const paint = (query = '') => {
    grid.innerHTML = '';
    db.pokemon
      .filter((p) => p.name.includes(query.toLowerCase()) || p.displayName.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 120)
      .forEach((p) => {
        const card = document.createElement('article');
        card.className = 'poke-card';
        card.innerHTML = `<h4>#${p.pokedexNumber} ${p.displayName}</h4>
          <div>סוגים: ${p.types.join(', ')}</div>
          <div>ווריאנטים: ${Object.entries(p.variants).filter(([, v]) => v).map(([k]) => k).join(', ') || 'רגיל'}</div>`;
        grid.appendChild(card);
      });
  };

  input.addEventListener('input', (e) => paint(e.target.value));
  paint();
}

function renderCalendar() {
  const root = document.getElementById('calendar');
  const grouped = {};
  db.events.forEach((event) => {
    const day = new Date(event.start).toLocaleDateString('he-IL');
    grouped[day] = grouped[day] || [];
    grouped[day].push(event);
  });

  Object.entries(grouped).forEach(([day, events]) => {
    const div = document.createElement('div');
    div.className = 'poke-card';
    div.innerHTML = `<h4>${day}</h4><ul>${events.map((e) => `<li>${e.title}</li>`).join('')}</ul>`;
    root.appendChild(div);
  });
}

function createTradeItem(sideEl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'trade-item';

  const select = document.createElement('select');
  db.pokemon.forEach((p) => {
    const option = document.createElement('option');
    option.value = p.id;
    option.textContent = `#${p.pokedexNumber} ${p.displayName}`;
    select.appendChild(option);
  });

  wrapper.appendChild(select);

  ['shiny', 'shadow', 'purified', 'lucky', 'event', 'costume', 'legacyMove'].forEach((flag) => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" data-flag="${flag}" /> ${flag}`;
    wrapper.appendChild(label);
  });

  sideEl.appendChild(wrapper);
}

function collectSide(sideId) {
  const sideEl = document.getElementById(sideId);
  return [...sideEl.querySelectorAll('.trade-item')].map((item) => {
    const options = {};
    item.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      options[cb.dataset.flag] = cb.checked;
    });

    return {
      pokemonId: Number(item.querySelector('select').value),
      options
    };
  });
}

function renderTrade() {
  const left = document.getElementById('left-side');
  const right = document.getElementById('right-side');

  createTradeItem(left);
  createTradeItem(right);

  document.querySelectorAll('button[data-add]').forEach((btn) => {
    btn.onclick = () => {
      if (btn.dataset.add === 'left') createTradeItem(left);
      if (btn.dataset.add === 'right') createTradeItem(right);
    };
  });

  document.getElementById('evaluate').onclick = async () => {
    const payload = {
      left: collectSide('left-side'),
      right: collectSide('right-side')
    };

    const res = await fetch('/api/trade-evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const out = await res.json();
    document.getElementById('trade-result').textContent = JSON.stringify(out, null, 2);
  };
}

init();
