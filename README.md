# HavenSocial

HavenSocial is a social application for sharing posts and connecting with a community.

## Development

Use Node.js 20.9 or newer. Install dependencies with `npm ci`, configure the local environment
using `.env.example`, then start the development server with `npm run dev`.

## Project checks

- `npm run typecheck`
- `npm run build`

$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

try {
$rng.GetBytes($bytes)
$passphrase = ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
Write-Host "Your local crypto-storage passphrase:"
Write-Host $passphrase
}
finally {
    $rng.Dispose()
$bytes = $null
}


Bob device:
Your local crypto-storage passphrase:
026a901b2fdf17113c8cf5d7fa736d9be627604d1ad4276b0067a98ea236b6d8

Alice device:
Your local crypto-storage passphrase:
2e40cae17dc6d85f1227bdce759265a6300c04f55d657be34be6707e4d4219f0
