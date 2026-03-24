<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = getDb();
} catch (Throwable $e) {
    jsonOut(['ok' => false, 'error' => 'Database connection failed'], 500);
}

function rowToUser(array $row): array
{
    $role = (string) $row['role'];
    $perms = null;
    if ($row['permissions'] !== null && $row['permissions'] !== '') {
        $decoded = json_decode((string) $row['permissions'], true);
        $perms = is_array($decoded) ? $decoded : [];
    }
    return [
        'id' => (string) $row['id'],
        'username' => (string) $row['username'],
        'name' => (string) $row['name'],
        'role' => $role,
        'disabled' => (int) $row['disabled'] === 1,
        'permissions' => $perms ?? ($role === 'admin' ? ['*'] : []),
        'createdAt' => $row['created_at'] ? (string) $row['created_at'] : null,
    ];
}

if ($method === 'GET') {
    requirePosApiKey();
    $stmt = $pdo->query('SELECT id, username, name, role, disabled, permissions, created_at FROM pos_users ORDER BY username');
    $users = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $users[] = rowToUser($row);
    }
    jsonOut(['ok' => true, 'users' => $users]);
}

if ($method === 'POST') {
    requirePosApiKey();
    $body = readJsonBody();
    if ($body === null) {
        jsonOut(['ok' => false, 'error' => 'Expected JSON'], 400);
    }
    $username = isset($body['username']) ? strtolower(trim((string) $body['username'])) : '';
    $password = isset($body['password']) ? (string) $body['password'] : '';
    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    $role = isset($body['role']) ? trim((string) $body['role']) : '';
    $permissions = $body['permissions'] ?? null;

    $allowedRoles = ['cashier', 'supervisor', 'manager', 'admin'];
    if ($username === '' || $password === '' || $name === '' || !in_array($role, $allowedRoles, true)) {
        jsonOut(['ok' => false, 'error' => 'Invalid user fields'], 400);
    }
    if (strlen($password) < 4) {
        jsonOut(['ok' => false, 'error' => 'Password too short'], 400);
    }

    $check = $pdo->prepare('SELECT id FROM pos_users WHERE LOWER(username) = ? LIMIT 1');
    $check->execute([$username]);
    if ($check->fetch()) {
        jsonOut(['ok' => false, 'error' => 'Username already exists'], 409);
    }

    $id = isset($body['id']) && preg_match('/^[a-zA-Z0-9_\-]+$/', (string) $body['id'])
        ? (string) $body['id']
        : ('usr_' . bin2hex(random_bytes(8)));

    $permJson = null;
    if ($role === 'admin') {
        $permJson = null;
    } elseif (is_array($permissions)) {
        $permJson = json_encode(array_values($permissions), JSON_UNESCAPED_UNICODE);
    }

    $hash = password_hash($password, PASSWORD_DEFAULT);
    $now = (new DateTimeImmutable('now'))->format('Y-m-d H:i:s');
    $ins = $pdo->prepare(
        'INSERT INTO pos_users (id, username, password_hash, name, role, disabled, permissions, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
    );
    $ins->execute([$id, $username, $hash, $name, $role, $permJson, $now]);

    $stmt = $pdo->prepare('SELECT id, username, name, role, disabled, permissions, created_at FROM pos_users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    jsonOut(['ok' => true, 'user' => rowToUser($row)]);
}

if ($method === 'PUT') {
    requirePosApiKey();
    $body = readJsonBody();
    if ($body === null || empty($body['id'])) {
        jsonOut(['ok' => false, 'error' => 'Expected JSON with id'], 400);
    }
    $id = (string) $body['id'];

    $stmt = $pdo->prepare('SELECT id, username FROM pos_users WHERE id = ? LIMIT 1');
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        jsonOut(['ok' => false, 'error' => 'User not found'], 404);
    }

    if (strtolower((string) $existing['username']) === 'admin' && array_key_exists('disabled', $body) && $body['disabled']) {
        jsonOut(['ok' => false, 'error' => 'Cannot disable admin'], 400);
    }

    if (isset($body['password']) && (string) $body['password'] !== '') {
        if (strlen((string) $body['password']) < 4) {
            jsonOut(['ok' => false, 'error' => 'Password too short'], 400);
        }
        $hash = password_hash((string) $body['password'], PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE pos_users SET password_hash = ? WHERE id = ?')->execute([$hash, $id]);
    }

    if (array_key_exists('disabled', $body)) {
        $dis = filter_var($body['disabled'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($dis !== null) {
            $pdo->prepare('UPDATE pos_users SET disabled = ? WHERE id = ?')->execute([$dis ? 1 : 0, $id]);
        }
    }

    $stmt = $pdo->prepare('SELECT id, username, name, role, disabled, permissions, created_at FROM pos_users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    jsonOut(['ok' => true, 'user' => rowToUser($row)]);
}

jsonOut(['ok' => false, 'error' => 'Method not allowed'], 405);
