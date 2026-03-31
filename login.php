<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    jsonOut(['ok' => false, 'error' => 'POST only'], 405);
}

$body = readJsonBody();
if ($body === null) {
    jsonOut(['ok' => false, 'error' => 'Expected JSON'], 400);
}

$username = isset($body['username']) ? strtolower(trim((string) $body['username'])) : '';
$password = isset($body['password']) ? (string) $body['password'] : '';

if ($username === '' || $password === '') {
    jsonOut(['ok' => false, 'error' => 'Username and password required'], 400);
}

try {
    $pdo = getDb();
} catch (Throwable $e) {
    jsonOut(['ok' => false, 'error' => 'Database connection failed'], 500);
}

$stmt = $pdo->prepare(
    'SELECT id, username, name, role, business_id, disabled, password_hash, permissions FROM pos_users WHERE LOWER(username) = ? LIMIT 1'
);
$stmt->execute([$username]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row || (int) $row['disabled'] === 1) {
    jsonOut(['ok' => false, 'error' => 'Invalid login'], 401);
}

if (!password_verify($password, $row['password_hash'])) {
    jsonOut(['ok' => false, 'error' => 'Invalid login'], 401);
}

$role = (string) $row['role'];
$permissions = null;
if ($role === 'admin') {
    $permissions = ['*'];
} elseif ($row['permissions'] !== null && $row['permissions'] !== '') {
    $decoded = json_decode((string) $row['permissions'], true);
    $permissions = is_array($decoded) ? $decoded : [];
} else {
    $permissions = [];
}

jsonOut([
    'ok' => true,
    'user' => [
        'id' => (string) $row['id'],
        'username' => (string) $row['username'],
        'name' => (string) $row['name'],
        'role' => $role,
        'businessId' => $row['business_id'] !== null ? (string) $row['business_id'] : null,
        'permissions' => $permissions,
    ],
]);
