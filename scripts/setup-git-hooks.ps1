# PowerShell version of hook setup
if (Test-Path .githooks) {
    git config core.hooksPath .githooks
    Write-Output "Configured git hooks path to .githooks"
} else {
    Write-Error ".githooks directory not found"
    exit 1
}