<?php
declare(strict_types=1);

/**
 * Read-only public listing for the standalone Marketplace page.
 * Returns company branding + available vehicles only (no sales, customers, ledger, etc.).
 */
require_once __DIR__ . '/config.php';

const MP_DEFAULT_BUSINESS_ID = 'biz_default';

function normalizeBizId(string $id): string
{
    $id = trim($id);
    if ($id === '') {
        return MP_DEFAULT_BUSINESS_ID;
    }
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $id)) {
        return '';
    }
    return $id;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    jsonOut(['ok' => false, 'error' => 'Method not allowed'], 405);
}

try {
    $pdo = getDb();
} catch (Throwable $e) {
    jsonOut(['ok' => false, 'error' => 'Database connection failed'], 500);
}

requirePosApiKey();

$biz = $_GET['biz'] ?? ($_SERVER['HTTP_X_POS_BUSINESS_ID'] ?? '');
if (!is_string($biz)) {
    $biz = '';
}
$biz = normalizeBizId($biz);
if ($biz === '') {
    jsonOut(['ok' => false, 'error' => 'Invalid business id'], 400);
}

$stmt = $pdo->prepare('SELECT payload FROM pos_data WHERE business_id = ?');
$stmt->execute([$biz]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    jsonOut([
        'ok' => true,
        'businessId' => $biz,
        'company' => [
            'companyName' => 'E-Inventory',
            'companyAddress' => '',
            'companyPhone' => '',
            'companyPhone2' => '',
            'companyEmail' => '',
            'companyWebsite' => '',
            'invoiceLogoDataUrl' => '',
        ],
        'vehicles' => [],
    ]);
}

$data = json_decode((string) $row['payload'], true);
if (!is_array($data)) {
    jsonOut(['ok' => false, 'error' => 'Stored payload is invalid JSON'], 500);
}

$meta = is_array($data['meta'] ?? null) ? $data['meta'] : [];
$company = [
    'companyName' => (string) ($meta['companyName'] ?? 'E-Inventory'),
    'companyAddress' => (string) ($meta['companyAddress'] ?? ''),
    'companyPhone' => (string) ($meta['companyPhone'] ?? ''),
    'companyPhone2' => (string) ($meta['companyPhone2'] ?? ''),
    'companyEmail' => (string) ($meta['companyEmail'] ?? ''),
    'companyWebsite' => (string) ($meta['companyWebsite'] ?? ''),
    'invoiceLogoDataUrl' => (string) ($meta['invoiceLogoDataUrl'] ?? ''),
];

$rawVehicles = is_array($data['vehicles'] ?? null) ? $data['vehicles'] : [];
$out = [];
foreach ($rawVehicles as $v) {
    if (!is_array($v)) {
        continue;
    }
    $status = (string) ($v['status'] ?? 'available');
    if ($status === 'sold') {
        continue;
    }
    $img = (string) ($v['imageDataUrl'] ?? '');
    if ($img !== '' && strpos($img, 'data:image/') !== 0) {
        $img = '';
    }
    $out[] = [
        'id' => (string) ($v['id'] ?? ''),
        'stockNo' => (string) ($v['stockNo'] ?? ''),
        'make' => (string) ($v['make'] ?? ''),
        'model' => (string) ($v['model'] ?? ''),
        'year' => $v['year'] ?? null,
        'sellPrice' => is_numeric($v['sellPrice'] ?? null) ? (float) $v['sellPrice'] : 0.0,
        'vehicleNumber' => (string) ($v['vehicleNumber'] ?? ''),
        'vehicleType' => (string) ($v['vehicleType'] ?? ''),
        'color' => (string) ($v['color'] ?? ''),
        'imageDataUrl' => $img,
        'notes' => (string) ($v['notes'] ?? ''),
    ];
}

jsonOut([
    'ok' => true,
    'businessId' => $biz,
    'company' => $company,
    'vehicles' => $out,
]);
