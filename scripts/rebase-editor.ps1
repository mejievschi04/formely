# Editor pentru rebase - schimbă pick în edit pentru 34d71b7
param([string]$TodoFile = $args[0])
if (-not $TodoFile) { exit 1 }
(Get-Content $TodoFile -Raw) -replace 'pick 34d71b7', 'edit 34d71b7' | Set-Content $TodoFile -NoNewline
