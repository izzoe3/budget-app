require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const basicAuth = require('basic-auth');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const auth = (req, res, next) => {
  const user = basicAuth(req);
  const username = process.env.AUTH_USERNAME || 'defaultuser';
  const password = process.env.AUTH_PASSWORD || 'defaultpass';
  if (!user || user.name !== username || user.pass !== password) {
    res.set('WWW-Authenticate', 'Basic realm="Private Budget App"');
    return res.status(401).send('Unauthorized');
  }
  next();
};

app.use(auth);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:your_local_password@localhost:5432/budget_app',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS money (
        id SERIAL PRIMARY KEY,
        amount REAL,
        location TEXT CHECK(location IN ('Cash', 'Bank', 'MyTabung')),
        date TEXT
      );
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT,
        budget REAL,
        CONSTRAINT unique_name UNIQUE (name)
      );
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        amount REAL,
        description TEXT,
        source TEXT CHECK(source IN ('Cash', 'Bank')),
        category_id INTEGER REFERENCES categories(id),
        date TEXT
      );
      CREATE TABLE IF NOT EXISTS goals (
        id SERIAL PRIMARY KEY,
        name TEXT,
        target_amount REAL,
        deadline TEXT
      );
      CREATE TABLE IF NOT EXISTS expenses_archive (
        id SERIAL PRIMARY KEY,
        amount REAL,
        description TEXT,
        source TEXT,
        category_id INTEGER,
        date TEXT,
        archive_date TEXT
      );
      CREATE TABLE IF NOT EXISTS bills (
        id SERIAL PRIMARY KEY,
        name TEXT,
        amount REAL,
        is_fixed INTEGER,
        paid INTEGER DEFAULT 0,
        due_date TEXT,
        date TEXT
      );
    `);

    const { rows } = await pool.query('SELECT id FROM categories WHERE name = $1', ['Bills']);
    if (rows.length === 0) {
      await pool.query('INSERT INTO categories (name, budget) VALUES ($1, $2)', ['Bills', 0]);
    }
    console.log('Connected to database');
  } catch (err) {
    console.error('Database connection or initialization error:', err);
  }
})();

// Helper to add months to a date
const addMonths = (dateStr, months) => {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
};

// Money Endpoints
app.get('/api/money', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM money');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/money', async (req, res) => {
  const { amount, location } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO money (amount, location, date) VALUES ($1, $2, $3) RETURNING id',
      [amount, location, new Date().toISOString()]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/money/:id', async (req, res) => {
  const { amount, location } = req.body;
  try {
    const { rowCount } = await pool.query(
      'UPDATE money SET amount = $1, location = $2 WHERE id = $3',
      [amount, location, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Money entry not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Category Endpoints
app.get('/api/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  const { name, budget } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (name, budget) VALUES ($1, $2) RETURNING id',
      [name, budget]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  const { name, budget } = req.body;
  try {
    const { rowCount } = await pool.query(
      'UPDATE categories SET name = $1, budget = $2 WHERE id = $3',
      [name, budget, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Expenses Endpoints
app.get('/api/expenses', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT e.*, c.name as category_name FROM expenses e LEFT JOIN categories c ON e.category_id = c.id'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/expenses', async (req, res) => {
  const { amount, description, source, category_id } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO expenses (amount, description, source, category_id, date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [amount, description, source, category_id || null, new Date().toISOString()]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  const { amount, description, source, category_id } = req.body;
  try {
    const { rowCount } = await pool.query(
      'UPDATE expenses SET amount = $1, description = $2, source = $3, category_id = $4 WHERE id = $5',
      [amount, description, source, category_id || null, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Goals Endpoints
app.get('/api/goals', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM goals');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/goals', async (req, res) => {
  const { name, target_amount, deadline } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO goals (name, target_amount, deadline) VALUES ($1, $2, $3) RETURNING id',
      [name, target_amount, deadline]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/goals/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM goals WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Goal not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bills Endpoints
app.get('/api/bills', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bills');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bills', async (req, res) => {
  const { name, amount, is_fixed, due_date } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO bills (name, amount, is_fixed, due_date, date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, amount, is_fixed, due_date, new Date().toISOString()]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/bills/:id', async (req, res) => {
  const { name, amount, is_fixed, due_date, paid } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT paid FROM bills WHERE id = $1', [req.params.id]);
    if (rows.length === 0) throw new Error('Bill not found');
    const wasPaid = rows[0].paid;

    await client.query(
      'UPDATE bills SET name = $1, amount = $2, is_fixed = $3, due_date = $4, paid = $5 WHERE id = $6',
      [name, amount, is_fixed, due_date, paid ?? 0, req.params.id]
    );

    if (!wasPaid && paid && is_fixed) {
      await client.query(
        'INSERT INTO bills (name, amount, is_fixed, due_date, date, paid) VALUES ($1, $2, $3, $4, $5, 0)',
        [name, amount, is_fixed, addMonths(due_date, 1), new Date().toISOString()]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(err.message === 'Bill not found' ? 404 : 500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/bills/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM bills WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Bill not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset Endpoint
app.post('/api/reset', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO expenses_archive (amount, description, source, category_id, date, archive_date)
       SELECT amount, description, source, category_id, date, $1 FROM expenses`,
      [new Date().toISOString()]
    );

    const { rows: categories } = await client.query('SELECT * FROM categories');
    const { rows: expenses } = await client.query('SELECT * FROM expenses');

    for (const cat of categories) {
      if (cat.name !== 'Bills') {
        const spent = expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + (e.amount || 0), 0);
        const carryover = cat.budget - spent;
        await client.query(
          'UPDATE categories SET budget = $1 WHERE id = $2',
          [Math.max(0, cat.budget + carryover), cat.id]
        );
      }
    }

    await client.query('UPDATE bills SET paid = 0');

    const { rows: bills } = await client.query('SELECT * FROM bills');
    const totalBillsBudget = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    await client.query('UPDATE categories SET budget = $1 WHERE name = $2', [totalBillsBudget, 'Bills']);

    await client.query('DELETE FROM expenses');

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));