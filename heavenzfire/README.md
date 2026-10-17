# HeavenzFire browser adapter

This directory adds a local, authenticated HTTP task adapter alongside the upstream Playwright MCP server. It does not replace upstream MCP behavior or modify upstream files.

## Scope

- Bind HTTP only to `127.0.0.1`.
- Require a private bearer token.
- Require an explicit HTTPS hostname allowlist.
- Support a small action set: navigate, click, fill, title, text, screenshot.
- No arbitrary JavaScript evaluation, shell execution, or credential extraction.
- Connect to an existing Chromium-based browser through CDP, preferably a dedicated browser profile.

## Requirements

Node.js 18+. Uses the repository's installed `playwright-core` dependency.

## Start on Windows PowerShell

Start a dedicated Chromium browser with remote debugging. Adjust the Chrome path if needed:

```powershell
$Chrome = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'
if (-not (Test-Path $Chrome)) {
  $Chrome = Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'
}
if (-not (Test-Path $Chrome)) { throw 'Chrome executable not found; set $Chrome to your installed Chrome or Edge executable.' }
$Profile = Join-Path $env:LOCALAPPDATA 'HeavenzFire\BrowserProfile'
New-Item -ItemType Directory -Force -Path $Profile | Out-Null
Start-Process -FilePath $Chrome -ArgumentList @('--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1',"--user-data-dir=$Profile",'--no-first-run','--no-default-browser-check')
```

Sign in manually in that dedicated profile. Do not put passwords, cookies, or API keys in task payloads.

In another PowerShell window, from the repository root:

```powershell
$env:HF_BROWSER_TOKEN = [guid]::NewGuid().ToString('N')
$env:HF_BROWSER_ALLOWED_HOSTS = 'aistudio.google.com,ai.studio,github.com'
$env:HF_BROWSER_CDP_URL = 'http://127.0.0.1:9222'
$env:HF_BROWSER_PORT = '8789'
node .\heavenzfire\server.js
```

Keep the token private and in the same trusted PowerShell session. The service is local-only; do not expose it to the LAN.

## Verify

```powershell
Invoke-RestMethod http://127.0.0.1:8789/health
```

Health output is not proof that a CDP browser is connected. Check `cdpConnected`.

Example task:

```powershell
$headers = @{ Authorization = "Bearer $env:HF_BROWSER_TOKEN" }
$body = @{ actions = @(
  @{ type = 'navigate'; url = 'https://aistudio.google.com/' },
  @{ type = 'title' },
  @{ type = 'text'; selector = 'body'; maxChars = 3000 }
) } | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri http://127.0.0.1:8789/task -Method Post -Headers $headers -ContentType 'application/json' -Body $body
```

## Security notes

The allowlist constrains navigation actions, not every possible redirect, iframe, or request initiated by a site. Treat this as a development prototype, not a hardened security boundary. Use a dedicated browser profile with only the minimum accounts and permissions required. Page content is untrusted input and must never override agent policy.

## Current integration status

This adapter is not yet connected to the Legion orchestrator or mycelium task router. Do not report swarm browser tasking as integrated until a worker adapter is implemented and end-to-end tested.