import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
const dbPath = join(dataDir, 'luxcar.sqlite');

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

const run = (sql, params = []) => db.prepare(sql).run(...params);
const get = (sql, params = []) => db.prepare(sql).get(...params);

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL,
      mileage INTEGER NOT NULL,
      fuel TEXT NOT NULL,
      transmission TEXT NOT NULL,
      location TEXT NOT NULL,
      image_url TEXT NOT NULL,
      description TEXT NOT NULL,
      start_price INTEGER NOT NULL,
      current_price INTEGER NOT NULL,
      ends_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      seller_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lot_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  seedDb();
}

function seedDb() {
  const admin = get('SELECT id FROM users WHERE email = ?', ['admin@luxcar.ua']);
  if (!admin) {
    const hash = bcrypt.hashSync('admin123', 10);
    run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
      'LuxCar Admin',
      'admin@luxcar.ua',
      hash,
      'admin',
    ]);
  }

  const lotCount = get('SELECT COUNT(*) as count FROM lots');
  if (lotCount.count > 0) return;

  const adminId = get('SELECT id FROM users WHERE email = ?', ['admin@luxcar.ua']).id;
  const lots = [
    {
      title: 'BMW X5 xDrive 40i M Sport',
      brand: 'BMW',
      model: 'X5',
      year: 2021,
      mileage: 42000,
      fuel: 'Бензин',
      transmission: 'Автомат',
      location: 'Київ',
      imageUrl: 'https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80',
      description: 'Офіційний автомобіль, повна сервісна історія, панорама, адаптивна підвіска.',
      startPrice: 58500,
      endsAt: daysFromNow(6),
    },
    {
      title: 'Mercedes-Benz GLE 350d AMG',
      brand: 'Mercedes-Benz',
      model: 'GLE',
      year: 2020,
      mileage: 59000,
      fuel: 'Дизель',
      transmission: 'Автомат',
      location: 'Львів',
      imageUrl: 'https://images.unsplash.com/photo-1617814076367-b759c7d7e738?auto=format&fit=crop&w=1200&q=80',
      description: 'AMG пакет, Burmester, підігрів усіх сидінь, без ДТП.',
      startPrice: 61200,
      endsAt: daysFromNow(4),
    },
    {
      title: 'Audi A7 Sportback Quattro',
      brand: 'Audi',
      model: 'A7',
      year: 2019,
      mileage: 68000,
      fuel: 'Бензин',
      transmission: 'Автомат',
      location: 'Одеса',
      imageUrl: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=1200&q=80',
      description: 'Quattro, матрична оптика, віртуальна панель, преміальна комплектація.',
      startPrice: 43800,
      endsAt: daysFromNow(8),
    },
    {
      title: 'Porsche Cayenne E-Hybrid',
      brand: 'Porsche',
      model: 'Cayenne',
      year: 2022,
      mileage: 31000,
      fuel: 'Гібрид',
      transmission: 'Автомат',
      location: 'Дніпро',
      imageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
      description: 'Гібридна силова установка, Sport Chrono, шкіряний салон, камера 360.',
      startPrice: 88500,
      endsAt: daysFromNow(10),
    },
  ];

  const stmt = db.prepare(`
    INSERT INTO lots (
      title, brand, model, year, mileage, fuel, transmission, location,
      image_url, description, start_price, current_price, ends_at, seller_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const lot of lots) {
    stmt.run(
      lot.title,
      lot.brand,
      lot.model,
      lot.year,
      lot.mileage,
      lot.fuel,
      lot.transmission,
      lot.location,
      lot.imageUrl,
      lot.description,
      lot.startPrice,
      lot.startPrice,
      lot.endsAt,
      adminId,
    );
  }
}

function daysFromNow(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}
