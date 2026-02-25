const fs = require('fs/promises');
const path = require('path');
const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_PATH = path.join(ROOT, 'data', 'pokemon-go-db.json');

async function loadDb() {
  const raw = await fs.readFile(DB_PATH, 'utf8');
  return JSON.parse(raw);
}

function scoreTradeSide(items, db) {
  const multipliers = db.tradeOptions.variantMultipliers;
  const rarityMultipliers = db.tradeOptions.rarityMultipliers;

  let total = 0;
  const details = [];

  for (const item of items) {
    const pokemon = db.pokemon.find((p) => p.id === Number(item.pokemonId));
    if (!pokemon) continue;

    const base = pokemon.stats.attack * 1.1 + pokemon.stats.defense + pokemon.stats.stamina * 0.95;
    let variantScore = 1;
    const applied = [];

    for (const [key, enabled] of Object.entries(item.options || {})) {
      if (enabled && multipliers[key]) {
        variantScore *= multipliers[key];
        applied.push(key);
      }
    }

    const rarityScore = rarityMultipliers[pokemon.rarityTier] ?? 1;
    const finalScore = base * variantScore * rarityScore;
    total += finalScore;

    details.push({
      pokemon: pokemon.displayName,
      rarity: pokemon.rarityTier,
      base: Math.round(base),
      options: applied,
      finalScore: Math.round(finalScore)
    });
  }

  return { total: Math.round(total), details };
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function serveStatic(req, res, pathname) {
  const cleanPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, cleanPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const contentType =
      ext === '.html'
        ? 'text/html; charset=utf-8'
        : ext === '.css'
          ? 'text/css; charset=utf-8'
          : ext === '.js'
            ? 'application/javascript; charset=utf-8'
            : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  } catch {
    const index = await fs.readFile(path.join(PUBLIC_DIR, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(index);
  }
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(body ? JSON.parse(body) : {}));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/db') {
    try {
      const db = await loadDb();
      return json(res, 200, db);
    } catch {
      return json(res, 500, { error: 'Database not found. Run: npm run sync' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/pokemon') {
    try {
      const db = await loadDb();
      const q = (url.searchParams.get('q') || '').toLowerCase();
      const filtered = db.pokemon.filter((p) => !q || p.name.includes(q) || p.displayName.toLowerCase().includes(q));
      return json(res, 200, filtered.slice(0, 250));
    } catch {
      return json(res, 500, { error: 'Database not found. Run: npm run sync' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/trade-evaluate') {
    try {
      const db = await loadDb();
      const payload = await parseBody(req);
      const left = scoreTradeSide(payload.left || [], db);
      const right = scoreTradeSide(payload.right || [], db);
      const delta = left.total - right.total;
      const ratio = Math.abs(delta) / Math.max(left.total, right.total, 1);
      let verdict = 'שווה';
      if (ratio > 0.08) verdict = delta > 0 ? 'לא שווה לצד ימין' : 'לא שווה לצד שמאל';
      const reason = `מנוע ה-AI השווה פוטנציאל קרב, נדירות ווריאנטים מיוחדים. יחס ההפרש: ${(ratio * 100).toFixed(1)}%`;
      return json(res, 200, { left, right, delta, ratio, verdict, reason });
    } catch {
      return json(res, 500, { error: 'Cannot evaluate trade' });
    }
  }

  return serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Pokemon GO IL portal running on http://localhost:${PORT}`);
});
