# secret-store.ps1 — Single-secret stash for the make-no-mistakes-toolkit
# Native PowerShell implementation for Windows (no bash required).
# Companion to secret-store.sh which serves Linux/macOS (and Git Bash / WSL).
#
# Usage:
#   powershell.exe -NoProfile -File secret-store.ps1 prompt
#   powershell.exe -NoProfile -File secret-store.ps1 use ENVVAR -- command [args...]
#   powershell.exe -NoProfile -File secret-store.ps1 clear
#   powershell.exe -NoProfile -File secret-store.ps1 status
#
# Stores ONE secret at a time at $env:TEMP\mnm-secret with an ACL locked to
# the current user. Backing store is NTFS (disk), NOT tmpfs — secret persists
# on disk until /secret-clear is invoked.
#
# Design constraints (mirror secret-store.sh):
#   - The secret value MUST NEVER appear in stdout/stderr of any subcommand.
#   - The value MUST NEVER be passed as a process argument (visible in
#     `Get-Process -IncludeUserName`).
#   - The value MUST NOT outlive the consuming command (env var is scoped
#     to the Process and unset in `finally`).

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('prompt', 'use', 'clear', 'status')]
    [string]$Subcommand,

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$RestArgs
)

$ErrorActionPreference = 'Stop'
$script:SecretPath = Join-Path $env:TEMP 'mnm-secret'

function Lock-FilePermissions {
    param([string]$Path)
    # Remove inheritance, grant only current user full control.
    # `icacls` ships with Windows by default since Vista.
    $user = "$env:USERDOMAIN\$env:USERNAME"
    & icacls $Path /inheritance:r /grant:r "${user}:(F)" 2>$null | Out-Null
}

function Get-FileBytes {
    param([string]$Path)
    return [System.IO.File]::ReadAllBytes($Path)
}

function Set-FileBytesNoBom {
    param([string]$Path, [string]$Content)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Invoke-Prompt {
    $title = 'Secret input — make-no-mistakes-toolkit'
    $message = 'Paste secret. It will not be echoed or logged anywhere visible to Claude.'

    # Get-Credential opens the native Windows credential dialog (password masked).
    # The username field is locked to "secret" (cosmetic — we discard it).
    $cred = $null
    try {
        $cred = Get-Credential -UserName 'secret' -Message $message
    } catch {
        Write-Error 'Cancelled or dialog unavailable.'
        exit 1
    }

    if (-not $cred) {
        Write-Error 'Cancelled — no secret staged.'
        exit 1
    }

    $secretValue = $cred.GetNetworkCredential().Password
    if ([string]::IsNullOrEmpty($secretValue)) {
        Write-Error 'Empty input — refusing to stage an empty secret.'
        exit 1
    }

    Set-FileBytesNoBom -Path $script:SecretPath -Content $secretValue
    Lock-FilePermissions -Path $script:SecretPath

    # Best-effort wipe of in-memory copy (PowerShell GC may keep duplicates;
    # SecureString would be stricter but doesn't help once we've materialized
    # the plaintext for file write).
    $secretValue = $null
    Remove-Variable secretValue -ErrorAction SilentlyContinue

    $size = (Get-Item $script:SecretPath).Length
    Write-Host "Staged at $script:SecretPath (ACL locked to ${env:USERDOMAIN}\${env:USERNAME}, $size bytes)"
    Write-Host 'Backing store: NTFS (NOT tmpfs — secret persists on disk until /secret-clear).'
    Write-Host ''
    Write-Host 'WARN: Windows backing store is disk-backed. Call /secret-clear when done — auto-cleanup at logout is NOT guaranteed.'
    Write-Host ''
    Write-Host 'Next:'
    Write-Host '  /secret-use ENVVAR -- your-command   (consume in one command)'
    Write-Host '  /secret-clear                        (wipe when done)'
}

function Invoke-Use {
    param([string[]]$Args)

    if (-not $Args -or $Args.Count -eq 0) {
        Write-Error 'Usage: secret-store.ps1 use ENVVAR -- command [args...]'
        exit 64
    }

    $envvar = $Args[0]
    if ($envvar -notmatch '^[A-Z_][A-Z0-9_]*$') {
        Write-Error "ENVVAR must be uppercase alphanumeric + underscore (got: $envvar)"
        exit 64
    }

    # Find the optional `--` separator. Skip it if present.
    $cmdStart = 1
    if ($Args.Count -gt 1 -and $Args[1] -eq '--') {
        $cmdStart = 2
    }

    if ($Args.Count -le $cmdStart) {
        Write-Error 'No command provided after --'
        exit 64
    }

    $cmdParts = $Args[$cmdStart..($Args.Count - 1)]

    if (-not (Test-Path $script:SecretPath)) {
        Write-Error 'No secret staged. Run /secret-input first.'
        exit 1
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $secretValue = [System.IO.File]::ReadAllText($script:SecretPath, $utf8NoBom)

    [Environment]::SetEnvironmentVariable($envvar, $secretValue, 'Process')
    $secretValue = $null
    Remove-Variable secretValue -ErrorAction SilentlyContinue

    try {
        & $cmdParts[0] $cmdParts[1..($cmdParts.Count - 1)]
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { $exitCode = 0 }
    } finally {
        # Always unset, even if the command threw.
        [Environment]::SetEnvironmentVariable($envvar, $null, 'Process')
    }

    exit $exitCode
}

function Invoke-Clear {
    if (-not (Test-Path $script:SecretPath)) {
        Write-Host 'No secret staged.'
        return
    }

    # Best-effort overwrite with random bytes before delete (defensive on disk).
    try {
        $size = (Get-Item $script:SecretPath).Length
        if ($size -gt 0) {
            $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            $randBytes = New-Object byte[] $size
            $rng.GetBytes($randBytes)
            [System.IO.File]::WriteAllBytes($script:SecretPath, $randBytes)
            $rng.Dispose()
        }
    } catch {
        # Overwrite is best-effort; proceed to delete regardless.
    }

    Remove-Item $script:SecretPath -Force
    Write-Host "Cleared $script:SecretPath"
}

function Invoke-Status {
    if (Test-Path $script:SecretPath) {
        $size = (Get-Item $script:SecretPath).Length
        Write-Host "Staged: $script:SecretPath ($size bytes)"
    } else {
        Write-Host 'No secret staged.'
    }
}

switch ($Subcommand) {
    'prompt' { Invoke-Prompt }
    'use'    { Invoke-Use -Args $RestArgs }
    'clear'  { Invoke-Clear }
    'status' { Invoke-Status }
}
