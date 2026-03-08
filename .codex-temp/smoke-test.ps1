$wd = 'D:\Coding\Antigravity folder\MyDigitalTwin'
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'cmd.exe'
$psi.Arguments = '/c npm run start -- -p 3010'
$psi.WorkingDirectory = $wd
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$proc = [System.Diagnostics.Process]::Start($psi)
try {
    Start-Sleep -Seconds 8

    $health = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3010/api/scheduler/tasks'

    $badBody = @{ taskType='reminders'; scheduleType='once'; runAt='2026-03-08T12:00:00.000Z'; config=@{}; createdBy='smoke-test' } | ConvertTo-Json -Depth 5
    $badResult = $null
    try {
        Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3010/api/scheduler/tasks' -Method POST -ContentType 'application/json' -Body $badBody | Out-Null
        $badResult = 'unexpected-success'
    } catch {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $badResult = $reader.ReadToEnd()
        $reader.Dispose()
    }

    $goodBody = @{ taskType='reminders'; scheduleType='once'; runAt='2026-03-08T12:00:00.000Z'; config=@{ topicId='smoke-test-topic'; topicName='Smoke Test Topic'; customMessage='Smoke test only' }; createdBy='smoke-test' } | ConvertTo-Json -Depth 5
    $created = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3010/api/scheduler/tasks' -Method POST -ContentType 'application/json' -Body $goodBody
    $createdJson = $created.Content | ConvertFrom-Json
    $createdId = $createdJson.id

    $list = Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:3010/api/scheduler/tasks'
    $found = ($list.Content | ConvertFrom-Json).tasks | Where-Object { $_.id -eq $createdId }

    $deleted = Invoke-WebRequest -UseBasicParsing -Uri ("http://localhost:3010/api/scheduler/tasks?id=" + $createdId) -Method DELETE

    [PSCustomObject]@{
        healthStatus = $health.StatusCode
        missingTopicResponse = $badResult
        createdTaskId = $createdId
        createdTaskFound = [bool]$found
        deleteStatus = $deleted.StatusCode
    } | ConvertTo-Json -Depth 5 | Set-Content -Path '.codex-temp\smoke-result.json'
}
finally {
    if (!$proc.HasExited) {
        $proc.Kill()
        $proc.WaitForExit()
    }
    $proc.StandardOutput.ReadToEnd() | Set-Content -Path '.codex-temp\smoke-start.out.log'
    $proc.StandardError.ReadToEnd() | Set-Content -Path '.codex-temp\smoke-start.err.log'
}
