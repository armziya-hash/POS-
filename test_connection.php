<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

require __DIR__ . '/db.php';

try {
    $pdo = getDb();
    $stmt = $pdo->query('SELECT NOW() AS server_time');
    $row = $stmt->fetch();

    echo json_encode([
        'ok' => true,
        'message' => 'Database connected successfully.',
        'server_time' => $row['server_time'] ?? null,
    ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'message' => 'Database connection failed.',
        'error' => $e->getMessage(),
    ], JSON_UNESCAPED_SLASHES);
}

