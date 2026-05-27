<?php
use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\LessonController;

// Serve storage files (fallback when symlink doesn't work, e.g. on Windows)
Route::get('/storage/{path}', function (string $path) {
    $path = str_replace('\\', '/', $path);
    $fullPath = storage_path('app/public/' . $path);
    if (!file_exists($fullPath) || !is_file($fullPath)) {
        abort(404);
    }
    // Security: ensure path is within storage/app/public (no directory traversal)
    $realPath = realpath($fullPath);
    $storagePath = realpath(storage_path('app/public'));
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

Route::get('/login', [AuthController::class, 'showLoginForm'])->name('login');
Route::post('/login', [AuthController::class, 'login']);
Route::post('/logout', [AuthController::class, 'logout'])->name('logout');

Route::get('/register', [AuthController::class, 'showRegisterForm'])->name('register');
Route::post('/register', [AuthController::class, 'register']);


Route::middleware('auth')->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/courses/{id}', [DashboardController::class, 'showCourse']);
});

Route::middleware('auth')->group(function () {
    Route::post('/lessons/{id}/complete', [LessonController::class, 'complete']);
});

Route::get('/lessons/{id}/complete', [LessonController::class, 'complete']);
Route::middleware('auth:sanctum')->post('/lessons/{id}/complete', [LessonController::class, 'complete']);
Route::middleware('auth')->get('/courses/{courseId}/progress/{userId}', [LessonController::class, 'getProgress']);