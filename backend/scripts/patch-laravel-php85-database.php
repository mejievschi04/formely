<?php

/**
 * PHP 8.5 deprecates PDO::MYSQL_ATTR_SSL_CA — patch Laravel vendor config once per install.
 */
$path = dirname(__DIR__).'/vendor/laravel/framework/config/database.php';

if (! is_file($path)) {
    exit(0);
}

$contents = file_get_contents($path);
if ($contents === false) {
    exit(1);
}

if (str_contains($contents, '$pdoMysqlSslCa')) {
    exit(0);
}

$needle = "use Illuminate\\Support\\Str;\n\nreturn [";
$replacement = "use Illuminate\\Support\\Str;\n\n\$pdoMysqlSslCa = class_exists(\\Pdo\\Mysql::class, false) ? \\Pdo\\Mysql::ATTR_SSL_CA : PDO::MYSQL_ATTR_SSL_CA;\n\nreturn [";

if (! str_contains($contents, $needle)) {
    fwrite(STDERR, "patch-laravel-php85-database: unexpected vendor file layout\n");
    exit(1);
}

$contents = str_replace($needle, $replacement, $contents);
$contents = str_replace(
    'PDO::MYSQL_ATTR_SSL_CA => env(\'MYSQL_ATTR_SSL_CA\')',
    '$pdoMysqlSslCa => env(\'MYSQL_ATTR_SSL_CA\')',
    $contents
);

file_put_contents($path, $contents);

echo "Applied PHP 8.5 database config patch to laravel/framework\n";
