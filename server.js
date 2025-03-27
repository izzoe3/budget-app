require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3');
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
    )`, err => err && console.error('Error creating money table:', err));

    db.run(`CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        budget REAL
    )`, err => err && console.error('Error creating categories table:', err));

    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL,
        description TEXT,
        source TEXT CHECK(source IN ('Cash', 'Bank')),
        category_id INTEGER,
        date TEXT,
        FOREIGN KEY (category_id) REFERENCES categories(id)
    )`, err => err && console.error('Error creating expenses table:', err));

    db.run(`CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        target_amount REAL,
        deadline TEXT
    )`, err => err && console.error('Error creating goals table:', err));

    db.run(`CREATE TABLE IF NOT EXISTS expenses_archive (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL,
        description TEXT,
        source TEXT,
        category_id INTEGER,
        date TEXT,
        archive_date TEXT
    )`, err => err && console.error('Error creating expenses_archive table:', err));

    db.run(`CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        amount REAL,
        is_fixed INTEGER,
        paid INTEGER DEFAULT 0,
        due_date TEXT,
        date TEXT
    )`, err => err && console.error('Error creating bills table:', err));

    // Ensure "Bills" category exists (run once)
    db.get('SELECT id FROM categories WHERE name = "Bills"', [], (err, row) => {
        if (!row && !err) {
            db.run('INSERT INTO categories (name, budget) VALUES ("Bills", 0)', err => 
                err && console.error('Error creating Bills category:', err));
        }
    });
});

// Helper to add months to a date
const addMonths = (dateStr, months) => {
    const date = new Date(dateStr);
    date.setMonth(date.getMonth() + months);
    return date.toISOString().split('T')[0];
};

// Helper to check if today is 5 days before due_date
const isFiveDaysBefore = (dueDateStr) => {
    const dueDate = new Date(dueDateStr);
    const fiveDaysBefore = new Date(dueDate);
    fiveDaysBefore.setDate(dueDate.getDate() - 5);
    return new Date() >= fiveDaysBefore && new Date() < dueDate;
};

// Money Endpoints (unchanged)
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

// Category Endpoints (unchanged)
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

// Expenses Endpoints (unchanged)
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

// Goals Endpoints (unchanged)
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
        // Revert paid status if 5 days before due_date
        rows.forEach(bill => {
            if (bill.paid && isFiveDaysBefore(bill.due_date)) {
                db.run('UPDATE bills SET paid = 0 WHERE id = ?', [bill.id], err => 
                    err && console.error('Error reverting bill status:', err));
            }
        });
        db.all('SELECT * FROM bills', [], (err, updatedRows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(updatedRows);
        });
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
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ error: 'Bill not found' });
            if (paid && is_fixed) { // Recur fixed bills when marked paid
                db.run('INSERT INTO bills (name, amount, is_fixed, due_date, date) VALUES (?, ?, ?, ?, ?)',
                    [name, amount, is_fixed, addMonths(due_date, 1), new Date().toISOString()],
                    err => err && console.error('Error recurring bill:', err));
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

// Reset Endpoint (unchanged)
app.post('/api/reset', (req, res) => {
    db.serialize(() => {
        db.run(
            `INSERT INTO expenses_archive (amount, description, source, category_id, date, archive_date)
             SELECT amount, description, source, category_id, date, ? FROM expenses`,
            [new Date().toISOString()],
            err => err && console.error('Error archiving expenses:', err)
        );

        db.all('SELECT * FROM categories', [], (err, categories) => {
            if (err) return res.status(500).json({ error: err.message });
            db.all('SELECT * FROM expenses', [], (err, expenses) => {
                if (err) return res.status(500).json({ error: err.message });

                categories.forEach(cat => {
                    if (cat.name !== 'Bills') {
                        const spent = expenses.filter(e => e.category_id === cat.id).reduce((sum, e) => sum + e.amount, 0);
                        const carryover = cat.budget - spent;
                        db.run('UPDATE categories SET budget = ? WHERE id = ?', [Math.max(0, cat.budget + carryover), cat.id],
                            err => err && console.error('Error updating budget for category', cat.name, ':', err));
                    }
                });

                db.run('UPDATE bills SET paid = 0', err => err && console.error('Error resetting bills:', err));

                db.all('SELECT * FROM bills', [], (err, bills) => {
                    if (err) return res.status(500).json({ error: err.message });
                    const totalBillsBudget = bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
                    db.run('UPDATE categories SET budget = ? WHERE name = "Bills"', [totalBillsBudget],
                        err => err && console.error('Error updating Bills budget:', err));

                    db.run('DELETE FROM expenses', err => {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ success: true });
                    });
                });
            });
        });
    });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server running at http://localhost:${port}`));