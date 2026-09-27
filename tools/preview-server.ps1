param(
    [int]$Port = 4173,
    [switch]$NoBrowser
)

$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\dist"))
$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "text/javascript; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)

try {
    $listener.Start()
} catch {
    Write-Host "Poker Trainer could not start on port $Port." -ForegroundColor Red
    Write-Host "It may already be running. Try opening http://127.0.0.1:$Port in your browser."
    exit 1
}

$url = "http://127.0.0.1:$Port/"
Write-Host "Poker Trainer is running at $url" -ForegroundColor Green
Write-Host "Keep this window open while playing. Press Ctrl+C to stop."

if (-not $NoBrowser) {
    Start-Process $url
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            while ($reader.ReadLine()) { }

            $requestPath = "/"
            if ($requestLine -match "^[A-Z]+\s+([^\s]+)") {
                $requestPath = ([System.Uri]::UnescapeDataString($Matches[1]) -split "\?")[0]
            }
            if ($requestPath -eq "/") { $requestPath = "/index.html" }

            $relativePath = $requestPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
            $filePath = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $relativePath))

            if (-not $filePath.StartsWith($siteRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not [System.IO.File]::Exists($filePath)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
                $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
            } else {
                $body = [System.IO.File]::ReadAllBytes($filePath)
                $extension = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
                $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
                $header = "HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
            }

            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
            $stream.Flush()
        } catch {
            Write-Host "A browser request could not be completed: $($_.Exception.Message)" -ForegroundColor Yellow
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
