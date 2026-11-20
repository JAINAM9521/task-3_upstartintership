# TaskFlow — Full-Stack Task Manager

TaskFlow is a responsive task management app built for a full-stack CRUD assignment. It connects a plain HTML/CSS/JavaScript frontend to a Node.js + Express REST API and a persistent SQLite database powered by `sql.js`.

## Features

- Create, read, update and delete tasks
- Mark tasks complete or move them back to in progress
- Set a title, description, priority and optional due date
- Search by task title or description
- Filter by all, in-progress and completed tasks
- Sort by newest, oldest, due date or priority
- Frontend and backend input validation
- Dashboard counts for total, active, completed and high-priority tasks
- Responsive layout for desktop, tablet and mobile
- SQLite data is written to `data/tasks.sqlite` and survives server restarts

## Tech stack

- Frontend: HTML, CSS and vanilla JavaScript
- Backend: Node.js and Express
- Database: SQLite through `sql.js` (WebAssembly; no native Node addon compilation)

## Requirements

- Node.js 18 or newer
- npm

## Run locally

1. Download and extract the project ZIP.
2. Open a terminal in the extracted `taskflow-fullstack` folder.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the server:

   ```bash
   npm start
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

The database folder and SQLite file are created automatically on first start. Keep the server terminal running while using the app.

For development with Node's built-in watch mode:

```bash
npm run dev
```

## REST API

All request and response bodies use JSON.

| Method | Endpoint | Description | Success |
|---|---|---|---|
| `GET` | `/api/tasks` | List tasks. Supports `?search=term` and `?status=all\|active\|completed` | `200 OK` |
| `POST` | `/api/tasks` | Create a task | `201 Created` |
| `PUT` | `/api/tasks/:id` | Replace a task's editable fields | `200 OK` |
| `PATCH` | `/api/tasks/:id/toggle` | Toggle completion status | `200 OK` |
| `DELETE` | `/api/tasks/:id` | Delete a task | `200 OK` |
| `GET` | `/api/health` | Check server and database startup | `200 OK` |

### Example task JSON

```json
{
  "title": "Prepare project presentation",
  "description": "Finish the slides and review the demo.",
  "priority": "high",
  "dueDate": "2026-12-01"
}
```

`title` is required (1–100 characters). `description` is optional (up to 500 characters). `priority` must be `low`, `medium` or `high`. `dueDate` is either `null` or a real calendar date in `YYYY-MM-DD` format. The server validates all input again before writing to SQLite. Invalid data returns `400 Bad Request` with field-level errors; a valid but missing task ID returns `404 Not Found`.

## Database design

The app uses one `tasks` table because this assignment is a single-user task manager and does not require accounts or relationships between users and tasks.

| Column | SQLite type | Purpose |
|---|---|---|
| `id` | `INTEGER PRIMARY KEY AUTOINCREMENT` | Unique task ID |
| `title` | `TEXT NOT NULL` | Task title (1–100 characters) |
| `description` | `TEXT NOT NULL DEFAULT ''` | Optional details |
| `priority` | `TEXT NOT NULL` | `low`, `medium` or `high` |
| `due_date` | `TEXT NULL` | Optional `YYYY-MM-DD` date |
| `completed` | `INTEGER NOT NULL DEFAULT 0` | `0` = in progress, `1` = completed |
| `created_at` | `TEXT NOT NULL` | Creation timestamp in ISO 8601 |
| `updated_at` | `TEXT NOT NULL` | Last update timestamp in ISO 8601 |

### Why `sql.js`?

`sql.js` runs SQLite through WebAssembly rather than a native Node.js addon. This avoids common Windows setup failures involving `node-gyp`, C++ build tools and Python when installing native SQLite packages. After each successful write, TaskFlow exports the SQLite database and saves it to `data/tasks.sqlite`, so records persist after the server stops and starts again.

## Validation and error handling

- The browser checks required title and maximum text lengths before sending a request.
- The API repeats validation because browser-side checks can be bypassed.
- SQL statements use bound parameters rather than concatenating user input into SQL.
- Invalid JSON and invalid task IDs receive appropriate `400` responses.
- Missing task records receive `404` responses.
- API errors are returned as JSON with a readable message.

## Test the persistence requirement

1. Create a task in the browser.
2. Stop the server with `Ctrl + C` in the terminal.
3. Run `npm start` again.
4. Refresh the browser. The task should still be present because it was saved in `data/tasks.sqlite`.

## GitHub publishing

The included `.gitignore` excludes `node_modules`, generated SQLite database files, environment files and common OS files.

```bash
git init
git add .
git commit -m "Build TaskFlow full-stack task manager"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

Replace the remote URL with your own public GitHub repository URL. Do not remove `.gitignore` or force-add `node_modules`.

## Project structure

```text
taskflow-fullstack/
├── data/                 # SQLite file is generated at runtime
├── public/
│   ├── app.js             # Frontend behavior and API calls
│   ├── index.html         # App structure
│   └── styles.css         # Responsive UI
├── .gitignore
├── .npmrc
├── package.json
├── README.md
└── server.js              # Express API and SQLite setup
```
