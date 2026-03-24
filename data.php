<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

const POS_DATA_ROW_ID = 1;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    $pdo = getDb();
} catch (Throwable $e) {
    jsonOut(['ok' => false, 'error' => 'Database connection failed'], 500);
}

if ($method === 'GET') {
    requirePosApiKey();
    $stmt = $pdo->prepare('SELECT payload FROM pos_data WHERE id = ?');
    $stmt->execute([POS_DATA_ROW_ID]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        jsonOut(['ok' => true, 'data' => null]);
    }
    $data = json_decode($row['payload'], true);
    if (!is_array($data)) {
        jsonOut(['ok' => false, 'error' => 'Stored payload is invalid JSON'], 500);
    }
    jsonOut(['ok' => true, 'data' => $data]);
}

if ($method === 'POST') {
    requirePosApiKey();
    $body = readJsonBody();
    if ($body === null) {
        jsonOut(['ok' => false, 'error' => 'Expected JSON body'], 400);
    }
    $enc = json_encode($body, JSON_UNESCAPED_UNICODE);
    if ($enc === false) {
        jsonOut(['ok' => false, 'error' => 'Could not encode JSON'], 400);
    }
    $sql = 'INSERT INTO pos_data (id, payload) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([POS_DATA_ROW_ID, $enc]);
    jsonOut(['ok' => true]);
}

jsonOut(['ok' => false, 'error' => 'Method not allowed'], 405);
