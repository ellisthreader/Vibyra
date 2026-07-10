<#
  vibyra-desktop.ps1 — safe launcher / restarter for Vibyra Desktop on Windows.

  Why this exists:
    The Vibyra bridge (node desktop/local-app.mjs, port 4317) is the parent of
    every AI terminal. Each terminal actually runs as a DETACHED worker process
    with its own PID, designed to survive a bridge restart and re-attach. They
    only die if the bridge is "tree-killed" (taskkill /T), which follows PID
    links down into the detached children.

    So the rules that keep terminals alive across restarts are:
      1. Start the bridge as an INDEPENDENT process (orphan), never as a child
         of a shell/agent/task that might later be tree-killed.
      2. Stop the bridge GRACEFULLY (POST /desktop/quit -> clean process.exit),
         or by SINGLE PID only. Never taskkill /T the bridge.
    On the next start the bridge reconciles and re-attaches the survivors.

  Usage:
    powershell -ExecutionPolicy Bypass -File scripts\vibyra-desktop.ps1 start
    powershell -ExecutionPolicy Bypass -File scripts\vibyra-desktop.ps1 restart
    powershell -ExecutionPolicy Bypass -File scripts\vibyra-desktop.ps1 window
    powershell -ExecutionPolicy Bypass -File scripts\vibyra-desktop.ps1 stop      # bridge only; terminals keep running
#>
param(
  [ValidateSet("start", "restart", "window", "stop", "status")]
  [string]$Action = "start"
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$Port = 4317
$Health = "http://127.0.0.1:$Port/health"
$Electron = Join-Path $Repo "node_modules\electron\dist\electron.exe"
$Entry = Join-Path $Repo "desktop\electron-main.cjs"
$DesktopUrl = "http://127.0.0.1:$Port/desktop"
$RuntimeUrl = "http://127.0.0.1:$Port/desktop/runtime"
$TerminalProviderAdapters = Join-Path $Repo "desktop\lib\aiTerminalProviderAdapters.mjs"

function Get-ExpectedTerminalLaunchContract {
  $source = Get-Content -Raw -LiteralPath $TerminalProviderAdapters
  $match = [regex]::Match(
    $source,
    'AI_TERMINAL_LAUNCH_CONTRACT_VERSION\s*=\s*(\d+)'
  )
  if (-not $match.Success) {
    throw "Could not read the AI terminal launch contract from $TerminalProviderAdapters."
  }
  return [int]$match.Groups[1].Value
}

function Get-RunningTerminalLaunchContract {
  try {
    $runtime = Invoke-RestMethod -Uri $RuntimeUrl -TimeoutSec 3
    return [int]$runtime.aiTerminalLaunchContractVersion
  } catch {
    return -1
  }
}

function Test-Bridge {
  try { (Invoke-RestMethod -Uri $Health -TimeoutSec 3).ok -eq $true } catch { $false }
}

function Wait-Bridge([int]$Seconds = 25) {
  for ($i = 0; $i -lt $Seconds; $i++) { if (Test-Bridge) { return $true }; Start-Sleep -Seconds 1 }
  return $false
}

function Stop-DesktopWindow {
  Get-CimInstance Win32_Process -Filter "name = 'electron.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -eq $Electron } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 400
}

function Start-Bridge {
  if (Test-Bridge) {
    $expectedContract = Get-ExpectedTerminalLaunchContract
    $runningContract = Get-RunningTerminalLaunchContract
    if ($runningContract -eq $expectedContract) {
      Write-Host "Bridge already healthy on $Port."
      return
    }

    Write-Host "Refreshing the Vibyra Desktop bridge (terminal contract $runningContract -> $expectedContract)..."
    Stop-DesktopWindow
    Stop-BridgeGraceful
    if (Test-Bridge) {
      throw "The stale Vibyra Desktop bridge is still running on port $Port."
    }
  }
  Write-Host "Starting Vibyra bridge (independent process)..."
  # Start-Process makes node a top-level process; when this script exits node is
  # orphaned to the OS (NOT in any agent/task tree), so it cannot be tree-killed.
  Start-Process -FilePath "node" -ArgumentList "desktop/local-app.mjs" `
    -WorkingDirectory $Repo -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Repo "tmp\vibyra-desktop.out.log") `
    -RedirectStandardError  (Join-Path $Repo "tmp\vibyra-desktop.err.log")
  if (-not (Wait-Bridge)) { throw "Bridge did not become healthy on $Port." }
  Write-Host "Bridge healthy."
}

function Open-Window {
  Stop-DesktopWindow
  $env:VIBYRA_DESKTOP_URL = $DesktopUrl
  Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  Start-Process -FilePath $Electron `
    -ArgumentList @("--disable-gpu", "--disable-gpu-compositing", $Entry) `
    -WorkingDirectory $Repo
  Write-Host "Window opening: $DesktopUrl"
}

function Stop-BridgeGraceful {
  # Graceful quit = clean process.exit of the bridge ONLY. Detached terminal
  # workers keep running and re-attach when the bridge comes back.
  if (Test-Bridge) {
    Write-Host "Stopping bridge gracefully (terminals keep running)..."
    try { Invoke-RestMethod -Uri "http://127.0.0.1:$Port/desktop/quit" -Method Post -TimeoutSec 5 | Out-Null } catch {}
    for ($i = 0; $i -lt 30; $i++) { if (-not (Test-Bridge)) { break }; Start-Sleep -Milliseconds 300 }
  }
  if (Test-Bridge) { Write-Warning "Bridge still responding; NOT force-killing (would risk terminals). Investigate PID on $Port." }
  else { Write-Host "Bridge stopped." }
}

switch ($Action) {
  "start"   { Start-Bridge; Open-Window }
  "restart" { Stop-BridgeGraceful; Start-Bridge; Open-Window; Write-Host "Restarted. Surviving terminals re-attached." }
  "window"  { Start-Bridge; Open-Window }
  "stop"    { Stop-BridgeGraceful }
  "status"  {
    if (Test-Bridge) {
      $s = Invoke-RestMethod -Uri "$DesktopUrl/pty-terminals" -TimeoutSec 5
      $n = ($s.sessions | Where-Object { $_.agent -eq "claude" } | Measure-Object).Count
      Write-Host ("Bridge UP on {0}. Claude agents running: {1}" -f $Port, $n)
    } else { Write-Host "Bridge DOWN." }
  }
}
