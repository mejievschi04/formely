<?php

// Serve storage files (fallback when symlink doesn't work, e.g. on Windows)
Route::get('/storage/{path}', function (string $path) {
    $path = str_replace('\\', '/', $path);
    $root = config('filesystems.disks.public.root');
    $fullPath = $root . '/' . $path;
    if (!file_exists($fullPath) || !is_file($fullPath)) {
        abort(404);
    }
    // Security: ensure path is within storage/app/public (no directory traversal)
    $realPath = realpath($fullPath);
    $storagePath = realpath($root);
    if (!$realPath || !$storagePath) {
        abort(404);
    }
    $realNorm = strtolower(str_replace('\\', '/', $realPath));
    $storeNorm = strtolower(str_replace('\\', '/', $storagePath));
    if (!str_starts_with($realNorm, $storeNorm)) {
        abort(403);
    }
    return response()->file($realPath);
})->where('path', '.*');

// Interfața (login, cursuri, admin) e aplicația React separată; backend-ul servește doar /api și /storage.
