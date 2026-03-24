<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

const POS_API_KEY = '';

function requirePosApiKey(): void
{
    $expected = POS_API_KEY;
    if ($expected === '') {
        return;
    }
    $got = $_SERVER['HTTP_X_POS_API_KEY'] ?? '';
    if (!is_string($got) || !hash_equals($expected, $got)) {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Invalid or missing X-POS-API-Key'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function jsonOut(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function readJsonBody(): ?array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return null;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}
