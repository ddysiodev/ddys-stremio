param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$PackageJson = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root "package.json") | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = [string]$PackageJson.version
}
if ($Version.StartsWith("v")) {
    $Version = $Version.Substring(1)
}

$LocalReleaseDirPath = Join-Path $Root "..\..\releases"
if (Test-Path -LiteralPath (Join-Path $Root "..\..\scripts\github-upload-project.ps1")) {
    $ReleaseDirPath = $LocalReleaseDirPath
} else {
    $ReleaseDirPath = Join-Path $Root "releases"
}
New-Item -ItemType Directory -Force -Path $ReleaseDirPath | Out-Null
$ReleaseDir = (Resolve-Path -LiteralPath $ReleaseDirPath).Path
$Zip = Join-Path $ReleaseDir ("ddys-stremio-v{0}.zip" -f $Version)
$ShaFile = "$Zip.sha256"
$LegacyPackageRoot = Join-Path $Root "package"

function Assert-InRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Base
    )

    $separator = [System.IO.Path]::DirectorySeparatorChar
    $full = [System.IO.Path]::GetFullPath($Path)
    $baseFull = [System.IO.Path]::GetFullPath($Base).TrimEnd([char[]]@("\", "/")) + $separator
    if (-not $full.StartsWith($baseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside project root: $full"
    }
}

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $separator = [System.IO.Path]::DirectorySeparatorChar
    $basePath = [System.IO.Path]::GetFullPath($Base).TrimEnd([char[]]@("\", "/")) + $separator
    $baseUri = New-Object System.Uri($basePath)
    $fileUri = New-Object System.Uri([System.IO.Path]::GetFullPath($Path))
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString()).Replace("/", $separator)
}

function New-ZipFromProjectDirectory {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Output
    )

    if (Test-Path -LiteralPath $Output) {
        Remove-Item -LiteralPath $Output -Force
    }

    if (-not ("DdysZipCrc32" -as [type])) {
        Add-Type -TypeDefinition @"
public static class DdysZipCrc32 {
    public static uint Compute(byte[] bytes) {
        uint crc = 0xffffffffu;
        for (int i = 0; i < bytes.Length; i++) {
            uint value = (crc ^ bytes[i]) & 0xffu;
            for (int bit = 0; bit < 8; bit++) {
                value = ((value & 1u) != 0u) ? (0xedb88320u ^ (value >> 1)) : (value >> 1);
            }
            crc = (crc >> 8) ^ value;
        }
        return crc ^ 0xffffffffu;
    }
}
"@
    }

    $utf8 = [System.Text.Encoding]::UTF8
    $fixedDosTime = [uint16]0x0000
    $fixedDosDate = [uint16]0x5c21
    $generalPurposeFlagUtf8 = [uint16]0x0800
    $storedMethod = [uint16]0
    $centralEntries = New-Object System.Collections.Generic.List[object]
    $packageFiles = New-Object System.Collections.Generic.List[object]
    $excludeSegments = @(".git", ".wrangler", "node_modules", "coverage", "dist", "build", "package", "releases")

    foreach ($file in (Get-ChildItem -LiteralPath $Source -Recurse -Force -File)) {
        $relative = (Get-RelativePathCompat -Base $Source -Path $file.FullName).Replace("\", "/")
        $segments = $relative -split "/"
        $skip = $false
        foreach ($segment in $segments) {
            if ($segment -in $excludeSegments) {
                $skip = $true
                break
            }
        }
        if ($skip) { continue }
        if ($file.Name -match "^\.env" -and $file.Name -ne ".env.example") { continue }
        if ($file.Name -match "\.(log|tmp|cache|zip|tgz|sha256)$") { continue }
        if ($file.Name -in @("package-lock.json", "pnpm-lock.yaml", "yarn.lock")) { continue }
        [void]$packageFiles.Add([pscustomobject]@{
            File = $file
            Relative = $relative
        })
    }

    $packageFiles.Sort([System.Comparison[object]]{
        param($left, $right)
        return [System.StringComparer]::Ordinal.Compare([string]$left.Relative, [string]$right.Relative)
    })

    $stream = [System.IO.File]::Open($Output, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $writer = $null
    try {
        $writer = [System.IO.BinaryWriter]::new($stream, $utf8, $false)
        foreach ($packageFile in $packageFiles) {
            $file = $packageFile.File
            $relative = $packageFile.Relative
            $nameBytes = $utf8.GetBytes($relative)
            $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
            if ($bytes.LongLength -gt [uint32]::MaxValue) {
                throw "File too large for deterministic ZIP32 package: $relative"
            }
            if ($nameBytes.Length -gt [uint16]::MaxValue) {
                throw "File name too long for ZIP package: $relative"
            }

            $offset = [uint32]$writer.BaseStream.Position
            $size = [uint32]$bytes.Length
            $crc = [DdysZipCrc32]::Compute($bytes)

            $writer.Write([uint32]0x04034b50)
            $writer.Write([uint16]20)
            $writer.Write($generalPurposeFlagUtf8)
            $writer.Write($storedMethod)
            $writer.Write($fixedDosTime)
            $writer.Write($fixedDosDate)
            $writer.Write([uint32]$crc)
            $writer.Write($size)
            $writer.Write($size)
            $writer.Write([uint16]$nameBytes.Length)
            $writer.Write([uint16]0)
            $writer.Write($nameBytes)
            $writer.Write($bytes)

            [void]$centralEntries.Add([pscustomobject]@{
                NameBytes = $nameBytes
                Crc = [uint32]$crc
                Size = $size
                Offset = $offset
            })
        }

        if ($centralEntries.Count -gt [uint16]::MaxValue) {
            throw "Too many files for deterministic ZIP32 package."
        }

        $centralOffset = [uint32]$writer.BaseStream.Position
        foreach ($entry in $centralEntries) {
            $writer.Write([uint32]0x02014b50)
            $writer.Write([uint16]20)
            $writer.Write([uint16]20)
            $writer.Write($generalPurposeFlagUtf8)
            $writer.Write($storedMethod)
            $writer.Write($fixedDosTime)
            $writer.Write($fixedDosDate)
            $writer.Write([uint32]$entry.Crc)
            $writer.Write([uint32]$entry.Size)
            $writer.Write([uint32]$entry.Size)
            $writer.Write([uint16]$entry.NameBytes.Length)
            $writer.Write([uint16]0)
            $writer.Write([uint16]0)
            $writer.Write([uint16]0)
            $writer.Write([uint16]0)
            $writer.Write([uint32]0)
            $writer.Write([uint32]$entry.Offset)
            $writer.Write($entry.NameBytes)
        }
        $centralSize = [uint32]($writer.BaseStream.Position - $centralOffset)

        $writer.Write([uint32]0x06054b50)
        $writer.Write([uint16]0)
        $writer.Write([uint16]0)
        $writer.Write([uint16]$centralEntries.Count)
        $writer.Write([uint16]$centralEntries.Count)
        $writer.Write($centralSize)
        $writer.Write($centralOffset)
        $writer.Write([uint16]0)
    } finally {
        if ($null -ne $writer) {
            $writer.Dispose()
        } else {
            $stream.Dispose()
        }
    }

    return $packageFiles.Count
}

Assert-InRoot -Path $LegacyPackageRoot -Base $Root
if (Test-Path -LiteralPath $LegacyPackageRoot) {
    Remove-Item -LiteralPath $LegacyPackageRoot -Recurse -Force
}

foreach ($path in @($Zip, $ShaFile)) {
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
    }
}

$FileCount = New-ZipFromProjectDirectory -Source $Root -Output $Zip
$Hash = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash
[System.IO.File]::WriteAllText(
    $ShaFile,
    "$Hash  $(Split-Path -Leaf $Zip)",
    [System.Text.Encoding]::ASCII
)

[pscustomobject]@{
    ok = $true
    package = $Zip
    sha256 = $Hash
    shaFile = $ShaFile
    files = $FileCount
} | ConvertTo-Json -Depth 3
