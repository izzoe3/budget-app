require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3');
const cors = require('cors');
const basicAuth = require('basic-auth');
const app = express();

// Middleware setup (must come before routes and app.listen)
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Basic Auth Middleware
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

// Database connection
const db = new sqlite3.Database('budget.db', (err) => {
    if (err) console.error('Database connection error:', err);
    else console.log('Connected to database');
});

// Initialize database tables
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS money (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL,
        location TEXT CHECK(location IN ('Cash', 'Bank', 'MyTabung')),
        date TEXT
    )`, (err) => { if (err) console.error('Error creating money table:', err); });

    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        budget REAL
    )`, (err) => { if (err) console.error('Error creating categories table:', err); });

    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL,
        description TEXT,
        source TEXT CHECK(source IN ('Cash', 'Bank')),
        category_id INTEGER,
        date TEXT,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    )`, (err) => { if (err) console.error('Error creating expenses table:', err); });

    db.run(`CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        target_amount REAL,
        deadline TEXT
    )`, (err) => { if (err) console.error('Error creating goals table:', err); });

    db.run(`CREATE TABLE IF NOT EXISTS expenses_archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL,
        description TEXT,
        source TEXT,
        category_id INTEGER,
        date TEXT,
        archive_date TEXT
    )`, (err) => { if (err) console.error('Error creating expenses_archive table:', err); });

    db.run(`CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        amount REAL,
        is_fixed INTEGER,
        paid INTEGER DEFAULT 0,
        due_date TEXT,
        date TEXT
    )`, (err) => { if (err) console.error('Error creating bills table:', err); });

    db.run(`ALTER TABLE bills ADD COLUMN due_date TEXT`, (err) => {
        if (err && err.message.includes('duplicate column name')) {
            console.log('due_date column already exists in bills table');
        } else if (err) {
            console.error('Error adding due_date column:', err);
        } else {
            console.log('Added due_date column to bills table');
        }
    });

    db.get('SELECT id FROM categories WHERE name = "Bills"', [], (err, row) => {
        if (!row) {
            db.run('INSERT INTO categories (name, budget) VALUES ("Bills", 0)', (err) => {
                if (err) console.error('Error creating Bills category:', err);
            });
        }
    });
});

// Money Endpoints
app.get('/api/money', (req, res) => {
    db.all('SELECT * FROM money', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/money', (req, res) => {
    const { amount, location } = req.body;
    db.run('INSERT INTO money (amount, location, date) VALUES (?, ?, ?)',
        [amount, location, new Date().toISOString()],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/money/:id', (req, res) => {
    const { amount, location } = req.body;
    db.run('UPDATE money SET amount = ?, location = ? WHERE id = ?',
        [amount, location, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Money entry not found' });
            res.json({ success: true });
        });
});

// Category Endpoints
app.get('/api/categories', (req, res) => {
    db.all('SELECT * FROM categories', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/categories', (req, res) => {
    const { name, budget } = req.body;
    db.run('INSERT INTO categories (name, budget) VALUES (?, ?)',
        [name, budget],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/categories/:id', (req, res) => {
    const { name, budget } = req.body;
    db.run('UPDATE categories SET name = ?, budget = ? WHERE id = ?',
        [name, budget, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Category not found' });
            res.json({ success: true });
        });
});

app.delete('/api/categories/:id', (req, res) => {
    db.run('DELETE FROM categories WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Expenses Endpoints
app.get('/api/expenses', (req, res) => {
    db.all('SELECT e.*, c.name as category_name FROM expenses e LEFT JOIN categories c ON e.category_id = c.id',
        [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
});

app.post('/api/expenses', (req, res) => {
    const { amount, description, source, category_id } = req.body;
    db.run('INSERT INTO expenses (amount, description, source, category_id, date) VALUES (?, ?, ?, ?, ?)',
        [amount, description, source, category_id || null, new Date().toISOString()],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/expenses/:id', (req, res) => {
    const { amount, description, source, category_id } = req.body;
    db.run('UPDATE expenses SET amount = ?, description = ?, source = ?, category_id = ? WHERE id = ?',
        [amount, description, source, category_id || null, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });
            res.json({ success: true });
        });
});

app.delete('/api/expenses/:id', (req, res) => {
    db.run('DELETE FROM expenses WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Goals Endpoints
app.get('/api/goals', (req, res) => {
    db.all('SELECT * FROM goals', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/goals', (req, res) => {
    const { name, target_amount, deadline } = req.body;
    db.run('INSERT INTO goals (name, target_amount, deadline) VALUES (?, ?, ?)',
        [name, target_amount, deadline],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.delete('/api/goals/:id', (req, res) => {
    db.run('DELETE FROM goals WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Bills Endpoints
app.get('/api/bills', (req, res) => {
    db.all('SELECT * FROM bills', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/bills', (req, res) => {
    const { name, amount, is_fixed, due_date } = req.body;
    db.run('INSERT INTO bills (name, amount, is_fixed, due_date, date) VALUES (?, ?, ?, ?, ?)',
        [name, amount, is_fixed, due_date, new Date().toISOString()],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
});

app.put('/api/bills/:id', (req, res) => {
    const { name, amount, is_fixed, due_date, paid } = req.body;
    db.run('UPDATE bills SET name = ?, amount = ?, is_fixed = ?, due_date = ?, paid = ? WHERE id = ?',
        [name, amount, is_fixed, due_date, paid ?? 0, req.params.id],
        function(err) {
            if (err) {
                console.error('Error updating bill:', err);
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                console.error(`Bill with ID ${req.params.id} not found`);
                return res.status(404).json({ error: 'Bill not found' });
            }
            res.json({ success: true });
        });
});

app.delete('/api/bills/:id', (req, res) => {
    db.run('DELETE FROM bills WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Reset Endpoint
app.post('/api/reset', (req, res) => {
    db.serialize(() => {
        db.run(
            `INSERT INTO expenses_archive (amount, description, source, category_id, date, archive_date)
             SELECT amount, description, source, category_id, date, ? FROM expenses`,
            [new Date().toISOString()],
            (err) => {
                if (err) {
                    console.error('Error archiving expenses:', err);
                    return res.status(500).json({ error: err.message });
                }
            }
        );

        db.all('SELECT * FROM categories', [], (err, categories) => {
            if (err) {
                console.error('Error fetching categories:', err);
                return res.status(500).json({ error: err.message });
            }
            db.all('SELECT * FROM expenses', [], (err, expenses) => {
                if (err) {
                    console.error('Error fetching expenses:', err);
                    return res.status(500).json({ error: err.message });
                }

                categories.forEach(cat => {
                    if (cat.name !== 'Bills') {
                        const spent = expenses
                            .filter(e => e.category_id === cat.id)
                            .reduce((sum, e) => sum + e.amount, 0);
                        const carryover = cat.budget - spent;
                        db.run(
                            'UPDATE categories SET budget = ? WHERE id = ?',
                            [Math.max(0, cat.budget + carryover), cat.id],
                            (err) => {
                                if (err) console.error('Error updating budget for category', cat.name, ':', err);
                            }
                        );
                    }
                });

                db.run(
                    'UPDATE bills SET paid = 0',
                    (err) => {
                        if (err) {
                            console.error('Error resetting bills to unpaid:', err);
                            return res.status(500).json({ error: err.message });
                        }
                    }
                );

                db.all('SELECT * FROM bills', [], (err, bills) => {
                    if (err) {
                        console.error('Error fetching bills:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    const totalBillsBudget = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
                    db.run(
                        'UPDATE categories SET budget = ? WHERE name = "Bills"',
                        [totalBillsBudget],
                        (err) => {
                            if (err) console.error('Error updating Bills category budget:', err);
                        }
                    );

                    db.run('DELETE FROM expenses', (err) => {
                        if (err) {
                            console.error('Error deleting expenses:', err);
                            return res.status(500).json({ error: err.message });
                        }
                        res.json({ success: true });
                    });
                });
            });
        });
    });
});

// Start the server (only once, at the end)
const port = process.env.PORT || 3001;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});