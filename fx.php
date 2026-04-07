<?php
declare(strict_types=1);

/**
 * USD/JPY mid-rate proxy (ECB via Frankfurter). Same-origin fetch avoids browser CORS issues.
 * Public read-only; does not use the database.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=300');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed'], JSON_UNESCAPED_UNICODE);
    exit;
}

$url = 'https://api.frankfurter.app/latest?from=USD&to=JPY';
$raw = false;

if (ini_get('allow_url_fopen')) {
    $ctx = stream_context_create([
        'http' => [
            'timeout' => 10,
            'header' => "Accept: application/json\r\n",
            'ignore_errors' => true,
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $got = @file_get_contents($url, false, $ctx);
    if (is_string($got) && $got !== '') {
        $raw = $got;
    }
}

if ($raw === false && function_exists('curl_init')) {
    $ch = curl_init($url);
    if ($ch !== false) {
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $got = curl_exec($ch);
        curl_close($ch);
        if (is_string($got) && $got !== '') {
            $raw = $got;
        }
    }
}

if ($raw === false || $raw === '') {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Could not reach exchange-rate service'], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data) || !isset($data['rates']['JPY']) || !is_numeric($data['rates']['JPY'])) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'Invalid upstream response'], JSON_UNESCAPED_UNICODE);
    exit;
}

$jpy = (float) $data['rates']['JPY'];
echo json_encode([
    'ok' => true,
    'base' => isset($data['base']) && is_string($data['base']) ? $data['base'] : 'USD',
    'quote' => 'JPY',
    'date' => isset($data['date']) && is_string($data['date']) ? $data['date'] : '',
    'jpy' => $jpy,
], JSON_UNESCAPED_UNICODE);
