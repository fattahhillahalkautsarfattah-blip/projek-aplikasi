# server.ps1 - Lightweight Local Static Web Server for Alarm Web App
param(
    [int]$Port = 8080
)

$baseDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host " [拔剑 Sketon] Server Web Alarm Berjalan!" -ForegroundColor Yellow
    Write-Host " Buka URL: $prefix di browser Anda." -ForegroundColor Cyan
    Write-Host " Tekan Ctrl+C di terminal ini untuk menghentikan server." -ForegroundColor Gray
    Write-Host "==========================================================" -ForegroundColor Green

    # Open default browser
    Start-Process $prefix

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($urlPath)) {
            $urlPath = "index.html"
        }

        $filePath = Join-Path $baseDir $urlPath
        # Normalize path
        $filePath = [System.IO.Path]::GetFullPath($filePath)

        # Security check: must remain within baseDir
        if (!$filePath.StartsWith($baseDir, [System.StringComparison]::OrdinalIgnoreCase) -or !(Test-Path $filePath -PathType Leaf)) {
            $response.StatusCode = 404
            $buffer = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
            $response.OutputStream.Close()
            continue
        }

        # Content types
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = switch ($ext) {
            ".html" { "text/html; charset=utf-8" }
            ".css"  { "text/css; charset=utf-8" }
            ".js"   { "application/javascript; charset=utf-8" }
            ".json" { "application/manifest+json; charset=utf-8" }
            ".webmanifest" { "application/manifest+json; charset=utf-8" }
            ".png"  { "image/png" }
            ".jpg"  { "image/jpeg" }
            ".jpeg" { "image/jpeg" }
            ".gif"  { "image/gif" }
            ".svg"  { "image/svg+xml" }
            ".mp3"  { "audio/mpeg" }
            ".wav"  { "audio/wav" }
            ".ico"  { "image/x-icon" }
            default { "application/octet-stream" }
        }

        $response.ContentType = $contentType
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        $response.OutputStream.Close()
    }
} catch {
    Write-Host "Server Error: $_" -ForegroundColor Red
} finally {
    if ($listener -and $listener.IsListening) {
        $listener.Stop()
    }
}

