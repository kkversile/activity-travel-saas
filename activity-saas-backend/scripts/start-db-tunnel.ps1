param(
  [int]$LocalPort = 15432,
  [int]$RetryDelaySeconds = 5
)

$ErrorActionPreference = 'Stop'
$remoteHost = '139.59.73.162'
$remotePort = 5432
$bindAddress = '127.0.0.1'
$ssh = (Get-Command ssh.exe -ErrorAction Stop).Source

function Get-PortListener {
  Get-NetTCPConnection -LocalAddress $bindAddress -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

$listener = Get-PortListener
if ($listener) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  $expectedForward = "$bindAddress`:$LocalPort`:127.0.0.1`:$remotePort"
  if ($process.Name -eq 'ssh.exe' -and $process.CommandLine.Contains($remoteHost) -and $process.CommandLine.Contains($expectedForward)) {
    Write-Host "SSH database tunnel already listens on $bindAddress`:$LocalPort (PID $($process.ProcessId))."
    exit 0
  }
  throw "Local port $LocalPort is already occupied by PID $($listener.OwningProcess). Stop that process or choose another -LocalPort."
}

Write-Host "Forwarding $bindAddress`:$LocalPort to PostgreSQL at $remoteHost`:$remotePort. Press Ctrl+C to stop."
while ($true) {
  & $ssh -N -L "$bindAddress`:$LocalPort`:127.0.0.1`:$remotePort" `
    -o BatchMode=yes `
    -o ExitOnForwardFailure=yes `
    -o ServerAliveInterval=30 `
    -o ServerAliveCountMax=3 `
    "root@$remoteHost"

  $exitCode = $LASTEXITCODE
  if ($exitCode -eq 0) {
    Write-Warning 'SSH tunnel exited. Reconnecting shortly.'
  } else {
    Write-Warning "SSH tunnel exited with code $exitCode. Reconnecting shortly."
  }
  Start-Sleep -Seconds ([Math]::Max(1, $RetryDelaySeconds))
}
