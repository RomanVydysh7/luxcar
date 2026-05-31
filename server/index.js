import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, initDb } from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'luxcar-dev-secret';

initDb();

app.use(cors());
app.use(express.json());

const toUser = (row) =>
  row && {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
  };

const lotSelect = `
  SELECT lots.*, users.name as seller_name,
    (SELECT COUNT(*) FROM bids WHERE bids.lot_id = lots.id) as bid_count
  FROM lots
  LEFT JOIN users ON users.id = lots.seller_id
`;

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Потрібно увійти в акаунт.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db
      .prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?')
      .get(payload.id);

    if (!user) return res.status(401).json({ message: 'Користувача не знайдено.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Сесія недійсна або застаріла.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Доступ лише для адміністратора.' });
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'luxcar' });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ message: 'Вкажіть імʼя, email і пароль від 6 символів.' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ message: 'Користувач з таким email вже існує.' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase().trim(), hash);
  const user = db.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

  res.status(201).json({ user: toUser(user), token: signToken(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ message: 'Невірний email або пароль.' });
  }

  res.json({ user: toUser(user), token: signToken(user) });
});

app.get('/api/auth/me', auth, (req, res) => {
  res.json({ user: toUser(req.user) });
});

app.get('/api/lots', (req, res) => {
  const { q = '', brand = '', status = 'active' } = req.query;
  const where = [];
  const params = [];

  if (status !== 'all') {
    where.push('lots.status = ?');
    params.push(status);
  }

  if (brand) {
    where.push('lots.brand = ?');
    params.push(brand);
  }

  if (q) {
    where.push('(lots.title LIKE ? OR lots.brand LIKE ? OR lots.model LIKE ? OR lots.location LIKE ?)');
    const term = `%${q}%`;
    params.push(term, term, term, term);
  }

  const sql = `${lotSelect} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY lots.created_at DESC`;
  const lots = db.prepare(sql).all(...params).map(mapLot);
  const brands = db.prepare('SELECT DISTINCT brand FROM lots ORDER BY brand').all().map((row) => row.brand);

  res.json({ lots, brands });
});

app.get('/api/lots/:id', (req, res) => {
  const lot = db.prepare(`${lotSelect} WHERE lots.id = ?`).get(req.params.id);
  if (!lot) return res.status(404).json({ message: 'Лот не знайдено.' });

  const bids = db
    .prepare(
      `SELECT bids.id, bids.amount, bids.created_at, users.name
       FROM bids
       JOIN users ON users.id = bids.user_id
       WHERE bids.lot_id = ?
       ORDER BY bids.amount DESC, bids.created_at DESC`,
    )
    .all(req.params.id);

  res.json({ lot: mapLot(lot), bids: bids.map((bid) => ({ id: bid.id, amount: bid.amount, createdAt: bid.created_at, user: bid.name })) });
});

app.post('/api/lots', auth, (req, res) => {
  const {
    title,
    brand,
    model,
    year,
    mileage,
    fuel,
    transmission,
    location,
    imageUrl,
    description,
    startPrice,
    endsAt,
  } = req.body;

  if (!title || !brand || !model || !year || !location || !startPrice) {
    return res.status(400).json({ message: 'Заповніть основні поля лота.' });
  }

  const fallbackImage = 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80';
  const result = db
    .prepare(
      `INSERT INTO lots (
        title, brand, model, year, mileage, fuel, transmission, location, image_url,
        description, start_price, current_price, ends_at, seller_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      title,
      brand,
      model,
      Number(year),
      Number(mileage || 0),
      fuel || 'Бензин',
      transmission || 'Автомат',
      location,
      imageUrl || fallbackImage,
      description || 'Опис буде додано продавцем.',
      Number(startPrice),
      Number(startPrice),
      endsAt || defaultEndDate(),
      req.user.id,
    );

  const lot = db.prepare(`${lotSelect} WHERE lots.id = ?`).get(result.lastInsertRowid);
  res.status(201).json({ lot: mapLot(lot) });
});

app.post('/api/lots/:id/bids', auth, (req, res) => {
  const lot = db.prepare('SELECT * FROM lots WHERE id = ?').get(req.params.id);
  const amount = Number(req.body.amount);

  if (!lot || lot.status !== 'active') return res.status(404).json({ message: 'Активний лот не знайдено.' });
  if (!amount || amount <= lot.current_price) {
    return res.status(400).json({ message: `Ставка має бути більшою за $${lot.current_price.toLocaleString('uk-UA')}.` });
  }

  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO bids (lot_id, user_id, amount) VALUES (?, ?, ?)').run(lot.id, req.user.id, amount);
    db.prepare('UPDATE lots SET current_price = ? WHERE id = ?').run(amount, lot.id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const updated = db.prepare(`${lotSelect} WHERE lots.id = ?`).get(lot.id);
  res.status(201).json({ lot: mapLot(updated) });
});

app.get('/api/admin/stats', auth, adminOnly, (_req, res) => {
  const users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const lots = db.prepare('SELECT COUNT(*) as count FROM lots').get().count;
  const activeLots = db.prepare("SELECT COUNT(*) as count FROM lots WHERE status = 'active'").get().count;
  const bids = db.prepare('SELECT COUNT(*) as count FROM bids').get().count;
  const volume = db.prepare('SELECT COALESCE(SUM(current_price), 0) as sum FROM lots').get().sum;

  res.json({ users, lots, activeLots, bids, volume });
});

app.get('/api/admin/users', auth, adminOnly, (_req, res) => {
  const users = db
    .prepare(
      `SELECT users.id, users.name, users.email, users.role, users.created_at,
        COUNT(DISTINCT lots.id) as lots_count,
        COUNT(DISTINCT bids.id) as bids_count
       FROM users
       LEFT JOIN lots ON lots.seller_id = users.id
       LEFT JOIN bids ON bids.user_id = users.id
       GROUP BY users.id
       ORDER BY users.created_at DESC`,
    )
    .all();

  res.json({ users: users.map((user) => ({ ...toUser(user), lotsCount: user.lots_count, bidsCount: user.bids_count })) });
});

app.get('/api/admin/lots', auth, adminOnly, (_req, res) => {
  const lots = db.prepare(`${lotSelect} ORDER BY lots.created_at DESC`).all().map(mapLot);
  res.json({ lots });
});

app.patch('/api/admin/lots/:id/status', auth, adminOnly, (req, res) => {
  const { status } = req.body;
  if (!['active', 'sold', 'paused'].includes(status)) {
    return res.status(400).json({ message: 'Невідомий статус лота.' });
  }

  db.prepare('UPDATE lots SET status = ? WHERE id = ?').run(status, req.params.id);
  const lot = db.prepare(`${lotSelect} WHERE lots.id = ?`).get(req.params.id);
  res.json({ lot: mapLot(lot) });
});

function mapLot(row) {
  return {
    id: row.id,
    title: row.title,
    brand: row.brand,
    model: row.model,
    year: row.year,
    mileage: row.mileage,
    fuel: row.fuel,
    transmission: row.transmission,
    location: row.location,
    imageUrl: row.image_url,
    description: row.description,
    startPrice: row.start_price,
    currentPrice: row.current_price,
    endsAt: row.ends_at,
    status: row.status,
    seller: row.seller_name || 'LuxCar',
    bidCount: row.bid_count || 0,
    createdAt: row.created_at,
  };
}

function defaultEndDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString();
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Помилка сервера LuxCar.' });
});

app.listen(PORT, () => {
  console.log(`LuxCar API: http://127.0.0.1:${PORT}`);
});
