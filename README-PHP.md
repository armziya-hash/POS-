# PHP + MySQL backend

The app can run **offline** (localStorage only) or **with MySQL** when served over HTTP and the API is reachable.

## 1. Create database

```sql
CREATE DATABASE pos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 2. Configure `api/db.php`

Set `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASS` for your MySQL server.

## 3. Install tables + default users

Open once in the browser (same origin as the app):

`http://localhost/.../api/install.php`

Default logins:

- `admin` / `admin123`
- `cashier` / `cashier123`

Remove or protect `install.php` on production.

## 4. Serve the project over HTTP

Do not open `index.html` as `file://` — use Apache, nginx, or for example:

```bash
cd /path/to/POS
php -S localhost:8080
```

Then open `http://localhost:8080/`.

## 5. Optional API key

In `api/config.php`, set `POS_API_KEY` to a secret string.  
In `app.js`, set the same value in `POS_API_KEY` and send it as header `X-POS-API-Key` (already wired for `data.php` and `users.php`).  
`login.php` stays unauthenticated (username/password only).

## Endpoints

| File | Method | Purpose |
|------|--------|---------|
| `api/data.php` | GET | Load full app JSON snapshot |
| `api/data.php` | POST | Save full snapshot |
| `api/users.php` | GET | List users (no passwords) |
| `api/users.php` | POST | Create user |
| `api/users.php` | PUT | Update `disabled` and/or `password` |
| `api/login.php` | POST | Login (`{ "username", "password" }`) |
| `api/test_connection.php` | GET | DB connectivity check |

If `data.php` and `users.php` both succeed and at least one user exists, the UI switches to **remote mode** (MySQL is authoritative). Otherwise it keeps using **localStorage**.
