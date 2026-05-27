# Replace Hugging Face token occurrences with a redaction marker
# Skips the .git directory
Get-ChildItem -Recurse -File | ForEach-Object {
    if ($_.FullName -notlike '*\\.git\\*') {
        try {
            $t = Get-Content -Raw -ErrorAction Stop $_.FullName
            # Token-ul se citește din variabilă de mediu - NU hardcoda niciodată aici
            $token = $env:HUGGINGFACE_TOKEN
            $t2 = if ($token) { $t -replace [regex]::Escape($token), '***REDACTED***' } else { $t }
            if ($t2 -ne $t) { Set-Content -Value $t2 -Path $_.FullName }
        } catch {
            # binary files or read errors - ignore
        }
    }
}