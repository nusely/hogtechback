# Kill any process using port 5000
Write-Host "Checking for processes on port 5000..." -ForegroundColor Yellow

$port = 5000
$connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if ($connections) {
    $uniquePIDs = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $uniquePIDs) {
        try {
            $process = Get-Process -Id $pid -ErrorAction Stop
            Write-Host "Killing process $pid ($($process.ProcessName))" -ForegroundColor Red
            Stop-Process -Id $pid -Force -ErrorAction Stop
            Write-Host "✓ Process $pid terminated" -ForegroundColor Green
        } catch {
            Write-Host "Could not kill process $pid: $_" -ForegroundColor Yellow
        }
    }
    Start-Sleep -Seconds 1
    Write-Host "Port $port is now free" -ForegroundColor Green
} else {
    Write-Host "No processes found on port $port" -ForegroundColor Green
}

