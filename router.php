<?php
/**
 * Router for PHP built-in server.
 *
 * - "/" and "/index.html" → index.html with no-cache headers
 * - "*.php" files (e.g. api/*.php) → return false so PHP executes them
 * - Other files → return false so the server sends static assets
 *
 * Start the server from THIS folder (or use serve.bat):
 *   php -S 127.0.0.1:8080 router.php
 *
 * Open: http://127.0.0.1:8080/
 */
declare(strict_types=1);

$root = __DIR__;
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (!is_string($uri) || $uri === '') {
    $uri = '/';
}

// Block path traversal
if (strpos($uri, '..') !== false) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Forbidden';
    return true;
}

// App shell
if ($uri === '/' || $uri === '/index.html') {
    $index = $root . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($index)) {
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'index.html not found next to router.php.';
        return true;
    }
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('Expires: 0');
    header('Content-Type: text/html; charset=utf-8');
    readfile($index);
    return true;
}

// Map URI to filesystem (UTF-8 paths)
$rel = str_replace('/', DIRECTORY_SEPARATOR, rawurldecode($uri));
$fs = $root . $rel;
if (is_file($fs) && preg_match('/\.php$/i', $fs)) {
    // Run api/*.php etc.
    return false;
}

// css, js, images, marketplace.html, …
return false;
