CREATE TABLE money (
  id SERIAL PRIMARY KEY,
  amount REAL,
  location TEXT CHECK(location IN ('Cash', 'Bank', 'MyTabung')),
  date TEXT
);
INSERT INTO money (id, amount, location, date) VALUES
  (1, 98.0, 'Cash', '2025-03-27T01:16:38.877Z'),
  (2, 4600.0, 'Bank', '2025-03-27T01:19:52.422Z');

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT,
  budget REAL
);
ALTER TABLE categories ADD CONSTRAINT unique_name UNIQUE (name);
INSERT INTO categories (id, name, budget) VALUES
  (1, 'Bills', 200.0),
  (2, 'Clothing', 500.0),
  (3, 'Food', 700.0);

CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  amount REAL,
  description TEXT,
  source TEXT CHECK(source IN ('Cash', 'Bank')),
  category_id INTEGER,
  date TEXT
);
ALTER TABLE expenses ADD FOREIGN KEY (category_id) REFERENCES categories(id);
INSERT INTO expenses (id, amount, description, source, category_id, date) VALUES
  (3, 140.0, 'Khatam', 'Bank', 2, '2025-03-27T01:39:10.090Z'),
  (4, 710.0, 'CC Settlement', 'Bank', NULL, '2025-03-27T01:52:13.898Z'),
  (18, 920.0, 'Paid: Honda Car', 'Bank', 1, '2025-03-27T04:47:37.474Z'),
  (19, 460.0, 'Paid: Huda', 'Bank', 1, '2025-03-27T04:47:38.782Z'),
  (20, 249.25, 'Paid: Electric', 'Bank', 1, '2025-03-27T09:17:27.842Z');

CREATE TABLE goals (
  id SERIAL PRIMARY KEY,
  name TEXT,
  target_amount REAL,
  deadline TEXT
);

CREATE TABLE expenses_archive (
  id SERIAL PRIMARY KEY,
  amount REAL,
  description TEXT,
  source TEXT,
  category_id INTEGER,
  date TEXT,
  archive_date TEXT
);

CREATE TABLE bills (
  id SERIAL PRIMARY KEY,
  name TEXT,
  amount REAL,
  is_fixed INTEGER,
  paid INTEGER DEFAULT 0,
  due_date TEXT,
  date TEXT
);
INSERT INTO bills (id, name, amount, is_fixed, paid, date, due_date) VALUES
  (1, 'Honda Car', 920.0, 1, 1, '2025-03-27T01:20:27.920Z', '2025-03-28'),
  (2, 'Huda', 460.0, 1, 1, '2025-03-27T01:23:34.777Z', '2025-03-28'),
  (3, 'SONY TV', 200.0, 1, 0, '2025-03-27T01:35:25.978Z', '2025-03-30'),
  (4, 'Fridge Vacuum', 180.0, 1, 0, '2025-03-27T01:35:54.104Z', '2025-04-06'),
  (6, 'Electric', 249.25, 0, 1, '2025-03-27T01:36:52.624Z', '2025-03-25'),
  (22, 'Honda Car', 920.0, 1, 0, '2025-03-27T04:47:37.468Z', '2025-04-28'),
  (23, 'Huda', 460.0, 1, 0, '2025-03-27T04:47:38.776Z', '2025-04-28');