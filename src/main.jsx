import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import './styles.css';

const API_URL = '/api';
const AuthContext = createContext(null);

function money(value) {
  return `$${Number(value || 0).toLocaleString('uk-UA')}`;
}

function dateText(value) {
  return new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

async function api(path, options = {}) {
  const token = localStorage.getItem('luxcar_token');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Помилка запиту.');
  return data;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('luxcar_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => localStorage.removeItem('luxcar_token'))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      async login(email, password) {
        const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        localStorage.setItem('luxcar_token', data.token);
        setUser(data.user);
      },
      async register(name, email, password) {
        const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
        localStorage.setItem('luxcar_token', data.token);
        setUser(data.user);
      },
      logout() {
        localStorage.removeItem('luxcar_token');
        setUser(null);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() {
  return useContext(AuthContext);
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}

function Shell() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="site-header">
        <Link className="brand" to="/">
          <span>LuxCar</span>
          <small>premium auctions</small>
        </Link>
        <nav className="nav">
          <NavLink to="/">Каталог</NavLink>
          {user && <NavLink to="/sell">Додати авто</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Адмін</NavLink>}
        </nav>
        <div className="header-actions">
          {user ? (
            <>
              <span className="user-pill">{user.name}</span>
              <button className="ghost-button" onClick={logout}>
                Вийти
              </button>
            </>
          ) : (
            <>
              <Link className="ghost-button" to="/login">
                Увійти
              </Link>
              <Link className="primary-button" to="/register">
                Реєстрація
              </Link>
            </>
          )}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/lots/:id" element={<LotDetails />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route
            path="/sell"
            element={
              <Protected>
                <SellCar />
              </Protected>
            }
          />
          <Route
            path="/admin"
            element={
              <Protected admin>
                <AdminPanel />
              </Protected>
            }
          />
        </Routes>
      </main>
    </>
  );
}

function Protected({ children, admin = false }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const [lots, setLots] = useState([]);
  const [brands, setBrands] = useState([]);
  const [filters, setFilters] = useState({ q: '', brand: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.brand) params.set('brand', filters.brand);

    setLoading(true);
    api(`/lots?${params}`)
      .then((data) => {
        setLots(data.lots);
        setBrands(data.brands);
      })
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <section className="page catalog-page">
      <div className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Український преміум-аукціон авто</p>
          <h1>LuxCar</h1>
          <p>
            Обирайте перевірені автомобілі бізнес- і преміум-класу, робіть ставки онлайн та відстежуйте лоти в реальному
            часі.
          </p>
          <div className="hero-stats">
            <span>
              <b>4</b> стартові лоти
            </span>
            <span>
              <b>24/7</b> онлайн-ставки
            </span>
            <span>
              <b>Admin</b> контроль
            </span>
          </div>
        </div>
        <div className="search-panel glass">
          <label>
            Пошук
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="BMW, Audi, Київ..."
            />
          </label>
          <label>
            Марка
            <select value={filters.brand} onChange={(event) => setFilters((prev) => ({ ...prev, brand: event.target.value }))}>
              <option value="">Усі марки</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="section-title">
        <div>
          <p className="eyebrow">Активні торги</p>
          <h2>Автомобілі на аукціоні</h2>
        </div>
        <Link className="primary-button" to="/sell">
          Продати авто
        </Link>
      </div>

      {loading ? (
        <Loader />
      ) : (
        <div className="lot-grid">
          {lots.map((lot) => (
            <LotCard key={lot.id} lot={lot} />
          ))}
        </div>
      )}
    </section>
  );
}

function LotCard({ lot }) {
  return (
    <article className="lot-card glass">
      <img src={lot.imageUrl} alt={lot.title} />
      <div className="lot-card-body">
        <div className="lot-meta">
          <span>{lot.year}</span>
          <span>{lot.location}</span>
          <span>{lot.bidCount} ставок</span>
        </div>
        <h3>{lot.title}</h3>
        <div className="lot-specs">
          <span>{lot.mileage.toLocaleString('uk-UA')} км</span>
          <span>{lot.fuel}</span>
          <span>{lot.transmission}</span>
        </div>
        <div className="price-row">
          <div>
            <small>Поточна ціна</small>
            <strong>{money(lot.currentPrice)}</strong>
          </div>
          <Link className="icon-link" to={`/lots/${lot.id}`}>
            Деталі
          </Link>
        </div>
      </div>
    </article>
  );
}

function LotDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [lot, setLot] = useState(null);
  const [bids, setBids] = useState([]);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    api(`/lots/${id}`).then((data) => {
      setLot(data.lot);
      setBids(data.bids);
      setAmount(data.lot.currentPrice + 500);
    });

  useEffect(() => {
    load();
  }, [id]);

  async function placeBid(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await api(`/lots/${id}/bids`, { method: 'POST', body: JSON.stringify({ amount: Number(amount) }) });
      setLot(data.lot);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!lot) return <Loader />;

  return (
    <section className="page detail-page">
      <div className="detail-layout">
        <div className="detail-media glass">
          <img src={lot.imageUrl} alt={lot.title} />
        </div>
        <div className="detail-info glass">
          <p className="eyebrow">
            {lot.brand} / {lot.model}
          </p>
          <h1>{lot.title}</h1>
          <p>{lot.description}</p>
          <div className="detail-price">
            <span>Поточна ставка</span>
            <strong>{money(lot.currentPrice)}</strong>
          </div>
          <div className="spec-grid">
            <span>{lot.year} рік</span>
            <span>{lot.mileage.toLocaleString('uk-UA')} км</span>
            <span>{lot.fuel}</span>
            <span>{lot.transmission}</span>
            <span>{lot.location}</span>
            <span>До {dateText(lot.endsAt)}</span>
          </div>

          {user ? (
            <form className="bid-form" onSubmit={placeBid}>
              <input type="number" min={lot.currentPrice + 1} value={amount} onChange={(event) => setAmount(event.target.value)} />
              <button className="primary-button">Зробити ставку</button>
            </form>
          ) : (
            <Link className="primary-button" to="/login">
              Увійдіть, щоб зробити ставку
            </Link>
          )}
          {error && <p className="form-error">{error}</p>}
        </div>
      </div>

      <div className="bids-panel glass">
        <h2>Історія ставок</h2>
        {bids.length === 0 ? (
          <p>Ставок ще немає.</p>
        ) : (
          <div className="table">
            {bids.map((bid) => (
              <div className="table-row" key={bid.id}>
                <span>{bid.user}</span>
                <strong>{money(bid.amount)}</strong>
                <small>{dateText(bid.createdAt)}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page auth-page">
      <form className="auth-card glass" onSubmit={submit}>
        <p className="eyebrow">{isLogin ? 'Повернення в акаунт' : 'Новий профіль'}</p>
        <h1>{isLogin ? 'Вхід у LuxCar' : 'Реєстрація користувача'}</h1>
        {!isLogin && (
          <label>
            Імʼя
            <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
          </label>
        )}
        <label>
          Email
          <input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} />
        </label>
        <label>
          Пароль
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button">{isLogin ? 'Увійти' : 'Створити акаунт'}</button>
        <p className="auth-switch">
          {isLogin ? 'Немає акаунта?' : 'Вже є акаунт?'}{' '}
          <Link to={isLogin ? '/register' : '/login'}>{isLogin ? 'Зареєструватися' : 'Увійти'}</Link>
        </p>
        {isLogin && <small className="hint">Адмін: admin@luxcar.ua / admin123</small>}
      </form>
    </section>
  );
}

function SellCar() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    brand: '',
    model: '',
    year: 2021,
    mileage: 50000,
    fuel: 'Бензин',
    transmission: 'Автомат',
    location: 'Київ',
    imageUrl: '',
    description: '',
    startPrice: 25000,
  });
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const data = await api('/lots', { method: 'POST', body: JSON.stringify(form) });
      navigate(`/lots/${data.lot.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="page form-page">
      <form className="wide-form glass" onSubmit={submit}>
        <div className="form-heading">
          <p className="eyebrow">Продавцям</p>
          <h1>Додати автомобіль на аукціон</h1>
        </div>
        <div className="form-grid">
          {[
            ['title', 'Назва лота'],
            ['brand', 'Марка'],
            ['model', 'Модель'],
            ['year', 'Рік', 'number'],
            ['mileage', 'Пробіг', 'number'],
            ['location', 'Місто'],
            ['imageUrl', 'URL фото'],
            ['startPrice', 'Стартова ціна', 'number'],
          ].map(([name, label, type = 'text']) => (
            <label key={name}>
              {label}
              <input
                type={type}
                value={form[name]}
                onChange={(event) => setForm((prev) => ({ ...prev, [name]: event.target.value }))}
              />
            </label>
          ))}
          <label>
            Паливо
            <select value={form.fuel} onChange={(event) => setForm((prev) => ({ ...prev, fuel: event.target.value }))}>
              <option>Бензин</option>
              <option>Дизель</option>
              <option>Гібрид</option>
              <option>Електро</option>
            </select>
          </label>
          <label>
            КПП
            <select
              value={form.transmission}
              onChange={(event) => setForm((prev) => ({ ...prev, transmission: event.target.value }))}
            >
              <option>Автомат</option>
              <option>Механіка</option>
            </select>
          </label>
        </div>
        <label>
          Опис
          <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button">Опублікувати лот</button>
      </form>
    </section>
  );
}

function AdminPanel() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [lots, setLots] = useState([]);

  const load = () =>
    Promise.all([api('/admin/stats'), api('/admin/users'), api('/admin/lots')]).then(([statsData, usersData, lotsData]) => {
      setStats(statsData);
      setUsers(usersData.users);
      setLots(lotsData.lots);
    });

  useEffect(() => {
    load();
  }, []);

  async function updateStatus(id, status) {
    await api(`/admin/lots/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    load();
  }

  if (!stats) return <Loader />;

  return (
    <section className="page admin-page">
      <div className="section-title">
        <div>
          <p className="eyebrow">Керування LuxCar</p>
          <h1>Адмін-панель</h1>
        </div>
      </div>
      <div className="stats-grid">
        <Stat label="Користувачі" value={stats.users} />
        <Stat label="Лоти" value={stats.lots} />
        <Stat label="Активні" value={stats.activeLots} />
        <Stat label="Ставки" value={stats.bids} />
        <Stat label="Обсяг" value={money(stats.volume)} />
      </div>

      <div className="admin-columns">
        <div className="admin-panel glass">
          <h2>Лоти</h2>
          <div className="table">
            {lots.map((lot) => (
              <div className="table-row lot-admin-row" key={lot.id}>
                <span>{lot.title}</span>
                <strong>{money(lot.currentPrice)}</strong>
                <select value={lot.status} onChange={(event) => updateStatus(lot.id, event.target.value)}>
                  <option value="active">active</option>
                  <option value="sold">sold</option>
                  <option value="paused">paused</option>
                </select>
              </div>
            ))}
          </div>
        </div>
        <div className="admin-panel glass">
          <h2>Користувачі</h2>
          <div className="table">
            {users.map((item) => (
              <div className="table-row" key={item.id}>
                <span>{item.name}</span>
                <strong>{item.role}</strong>
                <small>{item.email}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat-card glass">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Loader() {
  return <div className="loader glass">Завантаження...</div>;
}

createRoot(document.getElementById('root')).render(<App />);
