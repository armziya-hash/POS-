<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = getDb();
} catch (Throwable $e) {
    jsonOut(['ok' => false, 'error' => 'Database connection failed'], 500);
}

function normalizeBizId(string $id): string
{
    $id = trim($id);
    if ($id === '') return '';
    if (!preg_match('/^[a-zA-Z0-9_\-]+$/', $id)) return '';
    return $id;
}

if ($method === 'GET') {
    requirePosApiKey();
    $stmt = $pdo->query('SELECT id, name, created_at FROM pos_businesses ORDER BY name');
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $out[] = [
            'id' => (string) $row['id'],
            'name' => (string) $row['name'],
            'createdAt' => $row['created_at'] ? (string) $row['created_at'] : null,
        ];
    }
    jsonOut(['ok' => true, 'businesses' => $out]);
}

if ($method === 'POST') {
    requirePosApiKey();
    $body = readJsonBody();
    if ($body === null) jsonOut(['ok' => false, 'error' => 'Expected JSON'], 400);

    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    $id = isset($body['id']) ? normalizeBizId((string) $body['id']) : '';
    if ($name === '') jsonOut(['ok' => false, 'error' => 'Business name required'], 400);
    if ($id === '') {
        $id = 'biz_' . bin2hex(random_bytes(6));
    }

    $now = (new DateTimeImmutable('now'))->format('Y-m-d H:i:s');
    $stmt = $pdo->prepare('INSERT INTO pos_businesses (id, name, created_at) VALUES (?, ?, ?)');
    try {
        $stmt->execute([$id, $name, $now]);
    } catch (Throwable $e) {
        jsonOut(['ok' => false, 'error' => 'Could not create business (duplicate name or id)'], 409);
    }

    jsonOut(['ok' => true, 'business' => ['id' => $id, 'name' => $name, 'createdAt' => $now]]);
}

jsonOut(['ok' => false, 'error' => 'Method not allowed'], 405);

