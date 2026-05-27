<?php

/**
 * Script pentru migrarea datelor din SQLite în MySQL
 * 
 * Acest script exportă datele din tabelul users din SQLite
 * și le importă în MySQL.
 * 
 * Utilizare:
 * php migrate-users-to-mysql.php
 */

require __DIR__ . '/vendor/autoload.php';

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Bootstrap Laravel
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

echo "=== Migrare Users din SQLite în MySQL ===\n\n";

// Configurare conexiuni
$sqlitePath = __DIR__ . '/database/database.sqlite';
$sqliteExists = file_exists($sqlitePath);

if (!$sqliteExists) {
    echo "❌ Eroare: Fișierul SQLite nu există la: {$sqlitePath}\n";
    exit(1);
}

try {
    // Conectare la SQLite
    $sqliteDb = new PDO("sqlite:{$sqlitePath}");
    $sqliteDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "✓ Conectat la SQLite\n";
    
    // Listează toate tabelele din SQLite
    $tables = $sqliteDb->query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    echo "✓ Tabele găsite în SQLite: " . implode(', ', $tables) . "\n\n";
    
    // Verifică dacă tabelul users există în SQLite
    if (!in_array('users', $tables)) {
        echo "⚠ Avertisment: Tabelul 'users' nu există în SQLite\n";
        echo "ℹ Tabele disponibile: " . implode(', ', $tables) . "\n";
        echo "\nDacă nu ai date în SQLite, poți crea utilizatori noi direct în MySQL.\n";
        echo "Sau dacă ai date în altă bază de date, spune-mi și voi adapta scriptul.\n";
        exit(0);
    }
    
    // Obține toți utilizatorii din SQLite
    $users = $sqliteDb->query("SELECT * FROM users")->fetchAll(PDO::FETCH_ASSOC);
    $userCount = count($users);
    
    echo "✓ Găsiți {$userCount} utilizatori în SQLite\n\n";
    
    if ($userCount === 0) {
        echo "ℹ Nu există utilizatori de migrat\n";
        exit(0);
    }
    
    // Verifică dacă tabelul users există în MySQL
    if (!Schema::hasTable('users')) {
        echo "❌ Eroare: Tabelul 'users' nu există în MySQL. Rulează mai întâi migrările!\n";
        exit(1);
    }
    
    echo "✓ Tabelul 'users' există în MySQL\n\n";
    
    // Obține utilizatorii existenți din MySQL (pentru a evita duplicatele)
    $existingUsers = DB::table('users')->pluck('email')->toArray();
    echo "✓ Găsiți " . count($existingUsers) . " utilizatori existenți în MySQL\n\n";
    
    // Import utilizatori
    $imported = 0;
    $skipped = 0;
    $errors = 0;
    
    foreach ($users as $user) {
        // Verifică dacă utilizatorul există deja (după email)
        if (in_array($user['email'], $existingUsers)) {
            echo "⊘ Omis: {$user['email']} (există deja)\n";
            $skipped++;
            continue;
        }
        
        try {
            // Pregătește datele pentru inserare
            $userData = [
                'name' => $user['name'] ?? 'User',
                'email' => $user['email'] ?? null,
                'password' => $user['password'] ?? bcrypt('password'), // Fallback dacă nu există
                'role' => $user['role'] ?? 'student',
                'avatar' => $user['avatar'] ?? null,
                'bio' => $user['bio'] ?? null,
                'level' => isset($user['level']) ? (int)$user['level'] : 1,
                'points' => isset($user['points']) ? (int)$user['points'] : 0,
                'status' => $user['status'] ?? 'active',
                'must_change_password' => isset($user['must_change_password']) ? (bool)$user['must_change_password'] : false,
            ];
            
            // Handle JSON fields
            if (isset($user['permissions'])) {
                if (is_string($user['permissions'])) {
                    $decoded = json_decode($user['permissions'], true);
                    $userData['permissions'] = $decoded !== null ? json_encode($decoded) : null;
                } else {
                    $userData['permissions'] = json_encode($user['permissions']);
                }
            }
            
            // Handle timestamps
            if (isset($user['last_login_at']) && $user['last_login_at']) {
                $userData['last_login_at'] = $user['last_login_at'];
            }
            if (isset($user['last_activity_at']) && $user['last_activity_at']) {
                $userData['last_activity_at'] = $user['last_activity_at'];
            }
            if (isset($user['suspended_until']) && $user['suspended_until']) {
                $userData['suspended_until'] = $user['suspended_until'];
            }
            
            // Handle text fields
            if (isset($user['suspended_reason']) && $user['suspended_reason']) {
                $userData['suspended_reason'] = $user['suspended_reason'];
            }
            
            // Handle timestamps created_at și updated_at
            $userData['created_at'] = isset($user['created_at']) ? $user['created_at'] : now();
            $userData['updated_at'] = isset($user['updated_at']) ? $user['updated_at'] : now();
            
            // Verifică că email-ul există (obligatoriu)
            if (empty($userData['email'])) {
                echo "⚠ Avertisment: Utilizator fără email, omis: " . ($user['name'] ?? 'Unknown') . "\n";
                $skipped++;
                continue;
            }
            
            // Inserare în MySQL
            DB::table('users')->insert($userData);
            
            echo "✓ Importat: {$user['email']}\n";
            $imported++;
            
        } catch (\Exception $e) {
            echo "❌ Eroare la importul utilizatorului {$user['email']}: {$e->getMessage()}\n";
            $errors++;
        }
    }
    
    echo "\n=== Rezumat ===\n";
    echo "Total utilizatori în SQLite: {$userCount}\n";
    echo "Importați: {$imported}\n";
    echo "Omisi (duplicate): {$skipped}\n";
    echo "Erori: {$errors}\n";
    echo "\n✓ Migrarea este completă!\n";
    
} catch (PDOException $e) {
    echo "❌ Eroare SQLite: {$e->getMessage()}\n";
    exit(1);
} catch (\Exception $e) {
    echo "❌ Eroare: {$e->getMessage()}\n";
    exit(1);
}

