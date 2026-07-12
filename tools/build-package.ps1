param(
    [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

if ($Version.StartsWith("v")) {
    $Version = $Version.Substring(1)
}

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ReleaseDirPath = Join-Path $Root "..\..\releases"
New-Item -ItemType Directory -Force -Path $ReleaseDirPath | Out-Null
$ReleaseDir = (Resolve-Path $ReleaseDirPath).Path
$PackageDir = Join-Path $Root "package\ddys-stremio"
$Zip = Join-Path $ReleaseDir ("ddys-stremio-v{0}.zip" -f $Version)

function Assert-InRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Base
    )

    $full = [System.IO.Path]::GetFullPath($Path)
    $baseFull = [System.IO.Path]::GetFullPath($Base).TrimEnd("\") + "\"
    if (-not $full.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside project root: $full"
    }
}

Assert-InRoot -Path $PackageDir -Base $Root
if (Test-Path -LiteralPath $PackageDir) {
    Remove-Item -LiteralPath $PackageDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $PackageDir | Out-Null

$excludeSegments = @(".git", "node_modules", "dist", "package", "coverage", "bin", "obj")
function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $basePath = [System.IO.Path]::GetFullPath($Base).TrimEnd("\") + "\"
    $baseUri = New-Object System.Uri($basePath)
    $fileUri = New-Object System.Uri([System.IO.Path]::GetFullPath($Path))
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString()).Replace("/", "\")
}

$files = Get-ChildItem -LiteralPath $Root -Recurse -Force -File | Where-Object {
    $relative = (Get-RelativePathCompat -Base $Root -Path $_.FullName).Replace("\", "/")
    $segments = $relative -split "/"
    foreach ($segment in $segments) {
        if ($segment -in $excludeSegments) {
            return $false
        }
    }

    if ($_.Name -match "^\.env" -and $_.Name -ne ".env.example") {
        return $false
    }
    if ($_.Name -match "\.(log|tmp|cache|zip)$") {
        return $false
    }
    return $true
}

foreach ($file in $files) {
    $relative = Get-RelativePathCompat -Base $Root -Path $file.FullName
    $target = Join-Path $PackageDir $relative
    New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($target)) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
}

if (Test-Path -LiteralPath $Zip) {
    Remove-Item -LiteralPath $Zip -Force
}

Compress-Archive -Path (Join-Path $PackageDir "*") -DestinationPath $Zip -Force
$Hash = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash

[pscustomobject]@{
    ok = $true
    package = $Zip
    sha256 = $Hash
} | ConvertTo-Json -Depth 3
