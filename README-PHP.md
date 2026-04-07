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
Before `app.js`, set the same value for the browser (example):

```html
<script>
  window.POS_API_KEY = "your-long-random-secret";
</script>
```

If `POS_API_KEY` is empty in PHP, the header is not required.  
`login.php` stays unauthenticated (username/password only).

## 6. Deploy on a VPS (Linux)

Typical stack: **Ubuntu + Nginx or Apache + PHP-FPM + MySQL/MariaDB + TLS (Let’s Encrypt)**.

### A. Server packages

```bash
sudo apt update && sudo apt install -y nginx php-fpm php-mysql mysql-server certbot python3-certbot-nginx
```

### B. MySQL

```bash
sudo mysql -e "CREATE DATABASE pos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'pos_user'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';"
sudo mysql -e "GRANT ALL PRIVILEGES ON pos_db.* TO 'pos_user'@'localhost'; FLUSH PRIVILEGES;"
```

Edit `api/db.php`: `DB_HOST` (often `127.0.0.1`), `DB_NAME`, `DB_USER`, `DB_PASS`.

### C. Upload the project

Upload the whole POS folder (including `api/`, `index.html`, `app.js`, `styles.css`) to e.g. `/var/www/pos/`.  
Ensure the web user can read files (`www-data`).

### D. Nginx example (`/etc/nginx/sites-available/pos`)

Point **root** to the folder that contains `index.html` (not only `api/`). PHP must run for `/api/*.php`.

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/pos;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~ ^/api/.+\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/run/php/php8.2-fpm.sock;  # adjust PHP version
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }

    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1h;
        add_header Cache-Control "public";
    }
}
```

Enable the site, test `nginx -t`, reload Nginx, then run **Certbot** for HTTPS.

### E. One-time install

Open **once** (HTTPS): `https://your-domain.com/api/install.php`  
Then **delete or deny** `install.php` on production (`rm` or Nginx `deny`).

### F. HTTPS

Use Let’s Encrypt (`certbot --nginx -d your-domain.com`). The app should be opened over **https://** so the browser allows `fetch()` to the same origin API.

### G. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### H. Custom API URL (optional)

If the API is on another host, before `app.js`:

```html
<script>window.POS_API_BASE = "https://api.example.com/api";</script>
```

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
