const express = require('express');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'tasks.sqlite');

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

let db;

function persistDatabase() {
  const bytes = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(bytes));
}

function readTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    dueDate: row.due_date,
    completed: Boolean(row.completed),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function queryAll(sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows = [];
    while (statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally {
    statement.free();
  }
}

function queryOne(sql, params = []) {
  return queryAll(sql, params)[0] || null;
}

function getTaskById(id) {
  const row = queryOne('SELECT * FROM tasks WHERE id = ?', [id]);
  return row ? readTask(row) : null;
}

function validateTask(input, { partial = false } = {}) {
  const errors = {};
  const value = {};

  if (!partial || Object.prototype.hasOwnProperty.call(input, 'title')) {
    if (typeof input.title !== 'string' || !input.title.trim()) {
      errors.title = 'Please enter a task title.';
    } else if (input.title.trim().length > 100) {
      errors.title = 'Title must be 100 characters or fewer.';
    } else {
      value.title = input.title.trim();
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, 'description')) {
    if (input.description !== undefined && typeof input.description !== 'string') {
      errors.description = 'Description must be text.';
    } else if ((input.description || '').length > 500) {
      errors.description = 'Description must be 500 characters or fewer.';
    } else {
      value.description = (input.description || '').trim();
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, 'priority')) {
    const priority = input.priority === undefined ? 'medium' : input.priority;
    if (!['low', 'medium', 'high'].includes(priority)) {
      errors.priority = 'Priority must be low, medium, or high.';
    } else {
      value.priority = priority;
    }
  }

  if (!partial || Object.prototype.hasOwnProperty.call(input, 'dueDate')) {
    const dueDate = input.dueDate === undefined ? null : input.dueDate;
    if (dueDate !== null && dueDate !== '') {
      if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        errors.dueDate = 'Due date must use YYYY-MM-DD format.';
      } else {
        const parsed = new Date(`${dueDate}T00:00:00.000Z`);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate) {
          errors.dueDate = 'Please enter a valid calendar date.';
        } else {
          value.dueDate = dueDate;
        }
      }
    } else {
      value.dueDate = null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'completed')) {
    if (typeof input.completed !== 'boolean') errors.completed = 'Completed must be true or false.';
    else value.completed = input.completed;
  }

  return { errors, value };
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

app.get('/api/tasks', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  const status = ['all', 'active', 'completed'].includes(req.query.status) ? req.query.status : 'all';
  const clauses = [];
  const params = [];

  if (status === 'active') clauses.push('completed = 0');
  if (status === 'completed') clauses.push('completed = 1');
  if (search) {
    clauses.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    const pattern = `%${search.toLowerCase()}%`;
    params.push(pattern, pattern);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = queryAll(`SELECT * FROM tasks ${where} ORDER BY completed ASC, created_at DESC`, params);
  res.json({ tasks: rows.map(readTask), total: rows.length });
});

app.post('/api/tasks', (req, res) => {
  const { errors, value } = validateTask(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please check the task details.', errors });

  const now = new Date().toISOString();
  db.run(
    'INSERT INTO tasks (title, description, priority, due_date, completed, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    [value.title, value.description, value.priority, value.dueDate, now, now]
  );
  persistDatabase();
  const task = getTaskById(db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0]);
  res.status(201).json({ message: 'Task created successfully.', task });
});

app.put('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid task ID.' });
  const existing = getTaskById(id);
  if (!existing) return res.status(404).json({ message: 'Task not found.' });

  const { errors, value } = validateTask(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please check the task details.', errors });

  const now = new Date().toISOString();
  db.run(
    'UPDATE tasks SET title = ?, description = ?, priority = ?, due_date = ?, updated_at = ? WHERE id = ?',
    [value.title, value.description, value.priority, value.dueDate, now, id]
  );
  persistDatabase();
  res.json({ message: 'Task updated successfully.', task: getTaskById(id) });
});

app.patch('/api/tasks/:id/toggle', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid task ID.' });
  const existing = getTaskById(id);
  if (!existing) return res.status(404).json({ message: 'Task not found.' });

  const now = new Date().toISOString();
  db.run('UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?', [existing.completed ? 0 : 1, now, id]);
  persistDatabase();
  res.json({ message: 'Task status updated.', task: getTaskById(id) });
});

app.delete('/api/tasks/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: 'Invalid task ID.' });
  const existing = getTaskById(id);
  if (!existing) return res.status(404).json({ message: 'Task not found.' });
  db.run('DELETE FROM tasks WHERE id = ?', [id]);
  persistDatabase();
  res.json({ message: 'Task deleted successfully.' });
});

app.use('/api', (_req, res) => res.status(404).json({ message: 'API endpoint not found.' }));

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON request body.' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

async function start() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file)
  });

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(DB_PATH)));
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
    description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    due_date TEXT NULL,
    completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  persistDatabase();

  app.listen(PORT, () => {
    console.log(`\nTaskFlow is running at http://localhost:${PORT}`);
    console.log('SQLite database: data/tasks.sqlite\n');
  });
}

start().catch((error) => {
  console.error('Failed to start TaskFlow:', error);
  process.exit(1);
});
