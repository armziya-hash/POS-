<?php
declare(strict_types=1);

/**
 * One-time setup: creates tables and default users.
 * Open in browser: http://localhost/POS/api/install.php
 * Default logins: admin / admin123 , cashier / cashier123
 */
header('Content-Type: text/plain; charset=utf-8');

require_once __DIR__ . '/db.php';

$sqlFile = __DIR__ . '/schema.sql';
if (!is_readable($sqlFile)) {
    http_response_code(500);
    echo "Missing schema.sql\n";
    exit;
}

$pdo = getDb();
$sql = file_get_contents($sqlFile);
foreach (preg_split('/;\s*\R?/', $sql) as $chunk) {
    $chunk = trim($chunk);
    if ($chunk !== '') {
        $pdo->exec($chunk);
    }
}

$now = (new DateTimeImmutable('now'))->format('Y-m-d H:i:s');

$bizId = 'biz_default';
$bizName = 'Default Business';
$pdo->prepare('INSERT INTO pos_businesses (id, name, created_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)')
    ->execute([$bizId, $bizName, $now]);

$seed = [
    // Super Admin (global)
    ['id' => 'usr_superadmin', 'username' => 'superadmin', 'password' => 'superadmin123', 'name' => 'Super Admin', 'role' => 'superadmin', 'business_id' => null, 'permissions' => null],
    // Default business users
    ['id' => 'usr_admin', 'username' => 'admin', 'password' => 'admin123', 'name' => 'Admin', 'role' => 'admin', 'business_id' => $bizId, 'permissions' => null],
    ['id' => 'usr_cashier', 'username' => 'cashier', 'password' => 'cashier123', 'name' => 'Cashier', 'role' => 'cashier', 'business_id' => $bizId, 'permissions' => json_encode([
        'inventory.view', 'inventory.edit', 'docs.manage', 'billing.use', 'billing.sale', 'billing.print', 'ledger.view', 'ledger.add',
    ])],
];

$ins = $pdo->prepare(
    'INSERT INTO pos_users (id, username, password_hash, name, role, business_id, disabled, permissions, created_at)
     VALUES (:id, :username, :password_hash, :name, :role, :business_id, 0, :permissions, :created_at)
     ON DUPLICATE KEY UPDATE name = VALUES(name), role = VALUES(role), disabled = 0'
);

foreach ($seed as $row) {
    $hash = password_hash($row['password'], PASSWORD_DEFAULT);
    $ins->execute([
        'id' => $row['id'],
        'username' => $row['username'],
        'password_hash' => $hash,
        'name' => $row['name'],
        'role' => $row['role'],
        'business_id' => $row['business_id'],
        'permissions' => $row['permissions'],
        'created_at' => $now,
    ]);
}

echo "OK — tables created/verified and default users ensured.\n";
echo "Login: superadmin / superadmin123 OR admin / admin123 OR cashier / cashier123\n";
echo "Delete or protect this file on production.\n";
