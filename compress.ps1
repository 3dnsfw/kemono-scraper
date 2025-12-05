# Compress downloads-* folders:
# - Convert JPG/JPEG to JPEG XL
# - Re-encode non-AV1 MP4 videos to AV1

param(
    [int]$JpegXlQuality = 90,
    [int]$JpegXlEffort = 7,
    [int]$Av1Crf = 30,
    [int]$Av1Preset = 6
)

$ErrorActionPreference = "Stop"

# Check for required tools
function Test-Command($Command) {
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "cjxl")) {
    Write-Host "Error: cjxl not found. Install libjxl (e.g., winget install AOMMediaCodec.libjxl)" -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "ffmpeg")) {
    Write-Host "Error: ffmpeg not found. Install ffmpeg (e.g., winget install ffmpeg)" -ForegroundColor Red
    exit 1
}

if (-not (Test-Command "ffprobe")) {
    Write-Host "Error: ffprobe not found. Install ffmpeg" -ForegroundColor Red
    exit 1
}

# Statistics
$script:convertedImages = 0
$script:skippedImages = 0
$script:convertedVideos = 0
$script:skippedVideos = 0
$script:errors = 0

function Write-Info($Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success($Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Skip($Message) {
    Write-Host "[SKIP] $Message" -ForegroundColor Yellow
}

function Write-Err($Message) {
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-IsAv1($FilePath) {
    try {
        $codec = & ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 $FilePath 2>$null
        return $codec -eq "av1"
    } catch {
        return $false
    }
}

function Convert-Image($SourcePath) {
    $basePath = [System.IO.Path]::ChangeExtension($SourcePath, $null).TrimEnd('.')
    $destPath = "$basePath.jxl"
    
    if (Test-Path $destPath) {
        Write-Skip "JXL already exists: $destPath"
        $script:skippedImages++
        return
    }
    
    Write-Info "Converting image: $SourcePath"
    
    try {
        & cjxl $SourcePath $destPath -q $JpegXlQuality -e $JpegXlEffort 2>$null
        
        if ($LASTEXITCODE -eq 0 -and (Test-Path $destPath)) {
            $srcSize = (Get-Item $SourcePath).Length
            $dstSize = (Get-Item $destPath).Length
            $savings = [math]::Round(100 - ($dstSize * 100 / $srcSize))
            
            Remove-Item $SourcePath -Force
            Write-Success "Converted: $SourcePath -> $destPath (${savings}% smaller)"
            $script:convertedImages++
        } else {
            throw "cjxl failed"
        }
    } catch {
        Write-Err "Failed to convert: $SourcePath"
        if (Test-Path $destPath) { Remove-Item $destPath -Force }
        $script:errors++
    }
}

function Convert-Video($SourcePath) {
    $basePath = [System.IO.Path]::ChangeExtension($SourcePath, $null).TrimEnd('.')
    $destPath = "${basePath}_av1.mp4"
    $tempPath = "${basePath}_av1_tmp.mp4"
    
    # Check if already converted version exists
    if (Test-Path $destPath) {
        Write-Skip "AV1 version already exists: $destPath"
        $script:skippedVideos++
        return
    }
    
    # Check if source is already AV1
    if (Test-IsAv1 $SourcePath) {
        Write-Skip "Already AV1: $SourcePath"
        $script:skippedVideos++
        return
    }
    
    Write-Info "Re-encoding video: $SourcePath"
    
    try {
        & ffmpeg -y -i $SourcePath `
            -c:v libsvtav1 -crf $Av1Crf -preset $Av1Preset `
            -c:a copy `
            -movflags +faststart `
            $tempPath 2>$null
        
        if ($LASTEXITCODE -eq 0 -and (Test-Path $tempPath)) {
            $srcSize = (Get-Item $SourcePath).Length
            $dstSize = (Get-Item $tempPath).Length
            $savings = [math]::Round(100 - ($dstSize * 100 / $srcSize))
            
            # Only keep the new file if it's smaller or similar size
            if ($dstSize -lt ($srcSize * 1.1)) {
                Move-Item $tempPath $destPath -Force
                Remove-Item $SourcePath -Force
                Write-Success "Converted: $SourcePath -> $destPath (${savings}% smaller)"
                $script:convertedVideos++
            } else {
                Remove-Item $tempPath -Force
                Write-Skip "AV1 version larger, keeping original: $SourcePath"
                $script:skippedVideos++
            }
        } else {
            throw "ffmpeg failed"
        }
    } catch {
        Write-Err "Failed to convert: $SourcePath"
        if (Test-Path $tempPath) { Remove-Item $tempPath -Force }
        $script:errors++
    }
}

# Find all downloads-* directories
$downloadDirs = Get-ChildItem -Path . -Directory -Filter "downloads-*" -ErrorAction SilentlyContinue

if (-not $downloadDirs) {
    Write-Skip "No downloads-* directories found"
    exit 0
}

Write-Host "============================================"
Write-Host "  Media Compression Script"
Write-Host "============================================"
Write-Host "JPEG XL Quality: $JpegXlQuality, Effort: $JpegXlEffort"
Write-Host "AV1 CRF: $Av1Crf, Preset: $Av1Preset"
Write-Host "============================================"
Write-Host ""

# Process images
Write-Info "Finding JPEG images..."
$imageFiles = $downloadDirs | ForEach-Object {
    Get-ChildItem -Path $_.FullName -Recurse -Include "*.jpg", "*.jpeg" -File -ErrorAction SilentlyContinue
}

if ($imageFiles) {
    Write-Info "Found $($imageFiles.Count) JPEG images to process"
    foreach ($file in $imageFiles) {
        Convert-Image $file.FullName
    }
} else {
    Write-Info "No JPEG images found"
}

Write-Host ""

# Process videos
Write-Info "Finding MP4 videos..."
$videoFiles = $downloadDirs | ForEach-Object {
    Get-ChildItem -Path $_.FullName -Recurse -Include "*.mp4" -File -ErrorAction SilentlyContinue
}

if ($videoFiles) {
    Write-Info "Found $($videoFiles.Count) MP4 videos to check"
    foreach ($file in $videoFiles) {
        Convert-Video $file.FullName
    }
} else {
    Write-Info "No MP4 videos found"
}

Write-Host ""
Write-Host "============================================"
Write-Host "  Compression Complete"
Write-Host "============================================"
Write-Host "Images converted: $script:convertedImages"
Write-Host "Images skipped: $script:skippedImages"
Write-Host "Videos converted: $script:convertedVideos"
Write-Host "Videos skipped: $script:skippedVideos"
Write-Host "Errors: $script:errors"
Write-Host "============================================"
