<?php
// Exercise nginx -> PHP-FPM and the loader, without exposing installation details.
foreach (['pdo_mysql', 'openssl', 'curl', 'gmp', 'mbstring', 'ionCube Loader'] as $extension) {
    if (!extension_loaded($extension)) {
        http_response_code(503);
        exit;
    }
}
http_response_code(204);
