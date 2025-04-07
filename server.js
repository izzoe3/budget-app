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
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const handleError = (res, err, customMessage) => {
  res.status(500).json({ error: customMessage || err.message });
};

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS money (
        id SERIAL PRIMARY KEY,
        amount REAL,
        location TEXT CHECK(location IN ('Cash', 'Bank', 'MyTabung')),
        source TEXT CHECK(source IN ('Salary', 'Freelance', 'Donation', 'Others')),
        date TEXT,
        description TEXT
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
      CREATE TABLE IF NOT EXISTS bills (
        id SERIAL PRIMARY KEY,
        name TEXT,
        amount REAL,
        is_fixed INTEGER,
        paid INTEGER DEFAULT 0,
        due_date TEXT,
        date TEXT,
        paid_date TEXT
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
    `);

    const { rows: billsCat } = await pool.query('SELECT id FROM categories WHERE name = $1', ['Bills']);
    if (billsCat.length === 0) {
      await pool.query('INSERT INTO categories (name, budget) VALUES ($1, $2)', ['Bills', 0]);
    }

    const { rows: othersCat } = await pool.query('SELECT id FROM categories WHERE name = $1', ['Others']);
    if (othersCat.length === 0) {
      await pool.query('INSERT INTO categories (name, budget) VALUES ($1, $2)', ['Others', 0]);
    }
  } catch (err) {
    // Silent fail in production
  }
})();

const addMonths = (dateStr, months) => {
  const date = new Date(dateStr);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().split('T')[0];
};

// Money Endpoints
app.get('/api/money', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM money ORDER BY date DESC');
    res.json(rows);
  } catch (err) {
    handleError(res, err, 'Failed to fetch money');
  }
});

app.post('/api/money', async (req, res) => {
  const { amount, location, source, description } = req.body;
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const validLocations = ['Cash', 'Bank', 'MyTabung'];
  if (!location || !validLocations.includes(location)) {
    return res.status(400).json({ error: `Location must be one of: ${validLocations.join(', ')}` });
  }
  const validSources = ['Salary', 'Freelance', 'Donation', 'Others'];
  if (!source || !validSources.includes(source)) {
    return res.status(400).json({ error: `Source must be one of: ${validSources.join(', ')}` });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO money (amount, location, source, date, description) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [amount, location, source, new Date().toISOString(), description]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    handleError(res, err, 'Failed to add money');
  }
});

app.put('/api/money/:id', async (req, res) => {
  const { amount, location, source, description } = req.body;
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const validLocations = ['Cash', 'Bank', 'MyTabung'];
  if (!location || !validLocations.includes(location)) {
    return res.status(400).json({ error: `Location must be one of: ${validLocations.join(', ')}` });
  }
  const validSources = ['Salary', 'Freelance', 'Donation', 'Others'];
  if (!source || !validSources.includes(source)) {
    return res.status(400).json({ error: `Source must be one of: ${validSources.join(', ')}` });
  }
  try {
    const { rowCount } = await pool.query(
      'UPDATE money SET amount = $1, location = $2, source = $3, description = $4 WHERE id = $5',
      [amount, location, source, description, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Money entry not found' });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to update money');
  }
});

// Expenses Endpoints
app.get('/api/expenses', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT e.*, c.name as category_name FROM expenses e LEFT JOIN categories c ON e.category_id = c.id ORDER BY date DESC'
    );
    res.json(rows);
  } catch (err) {
    handleError(res, err, 'Failed to fetch expenses');
  }
});

app.post('/api/expenses', async (req, res) => {
  let { amount, description, source, category_id } = req.body;
  if (!amount || isNaN(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number' });
  }
  if (!description) {
    return res.status(400).json({ error: 'Description is required' });
  }
  const validSources = ['Cash', 'Bank'];
  if (!source || !validSources.includes(source)) {
    return res.status(400).json({ error: `Source must be one of: ${validSources.join(', ')}` });
  }
  try {
    if (!category_id) {
      const { rows } = await pool.query('SELECT id FROM categories WHERE name = $1', ['Others']);
      category_id = rows[0].id;
    }
    const { rows } = await pool.query(
      'INSERT INTO expenses (amount, description, source, category_id, date) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [amount, description, source, category_id, new Date().toISOString()]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    handleError(res, err, 'Failed to add expense');
  }
});

app.put('/api/expenses/:id', async (req, res) => {
  let { amount, description, source, category_id } = req.body;
  try {
    if (!category_id) {
      const { rows } = await pool.query('SELECT id FROM categories WHERE name = $1', ['Others']);
      category_id = rows[0].id;
    }
    const { rowCount } = await pool.query(
      'UPDATE expenses SET amount = $1, description = $2, source = $3, category_id = $4 WHERE id = $5',
      [amount, description, source, category_id, req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to update expense');
  }
});

app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, 'Failed to delete expense');
  }
});

// Categories Endpoints
app.get('/api/categories', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM categories');
    res.json(rows);
  } catch (err) {
    handleError(res, err, 'Failed to fetch categories');
  }
});

app.post('/api/categories', async (req, res) => {
  const { name, budget } = req.body;
  if (name === 'Others' || name === 'Bills') {
    return res.status(400).json({ error: 'Cannot create a category named "Others" or "Bills"' });
  }
  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (name, budget) VALUES ($1, $2) RETURNING id',
      [name, budget]
    );
    res.json({ id: rows[0].id });
  } catch (err) {
    handleError(res, err, 'Failed to add category');
  }
});

// Bills Endpoints
app.get('/api/bills', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM bills ORDER BY due_date ASC');
    res.json(rows);
  } catch (err) {
    handleError(res, err, 'Failed to fetch bills');
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
    handleError(res, err, 'Failed to add bill');
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

    const paidDate = paid && !wasPaid ? new Date().toISOString() : (paid ? rows[0].paid_date : null);
    await client.query(
      'UPDATE bills SET name = $1, amount = $2, is_fixed = $3, due_date = $4, paid = $5, paid_date = $6 WHERE id = $7',
      [name, amount, is_fixed, due_date, paid ?? 0, paidDate, req.params.id]
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
    handleError(res, err, 'Failed to delete bill');
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
    const { rows: expenses } = await pool.query('SELECT * FROM expenses');

    for (const cat of categories) {
      if (cat.name !== 'Bills' && cat.name !== 'Others') {
        const spent = expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + (e.amount || 0), 0);
        const carryover = cat.budget - spent;
        await client.query(
          'UPDATE categories SET budget = $1 WHERE id = $2',
          [Math.max(0, cat.budget + carryover), cat.id]
        );
      }
    }

    await client.query('UPDATE bills SET paid = 0, paid_date = NULL');

    const { rows: bills } = await client.query('SELECT * FROM bills');
    const totalBillsBudget = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    await client.query('UPDATE categories SET budget = $1 WHERE name = $2', [totalBillsBudget, 'Bills']);

    await client.query('DELETE FROM expenses');

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    handleError(res, err, 'Failed to reset budget');
  } finally {
    client.release();
  }
});

const port = process.env.PORT || 3001;
app.listen(port);