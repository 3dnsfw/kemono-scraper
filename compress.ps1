# Compress downloads-* folders:
# - Convert JPG/JPEG to JPEG XL
# - Re-encode non-AV1 MP4 videos to AV1

param(
    [int]$JpegXlQuality = 90,
    [int]$JpegXlEffort = 7,
    [int]$Av1Crf = 30,
    [int]$Av1Preset = 6,
    [int]$ParallelJobs = 4
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

# Statistics (thread-safe for parallel execution)
$script:stats = [hashtable]::Synchronized(@{
    convertedImages = 0
    skippedImages = 0
    convertedVideos = 0
    skippedVideos = 0
    errors = 0
})

function Write-Info($Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Skip($Message) {
    Write-Host "[SKIP] $Message" -ForegroundColor Yellow
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
Write-Host "Parallel jobs: $ParallelJobs"
Write-Host "============================================"
Write-Host ""

# Process images
Write-Info "Finding JPEG images..."
$imageFiles = $downloadDirs | ForEach-Object {
    Get-ChildItem -Path $_.FullName -Recurse -Include "*.jpg", "*.jpeg" -File -ErrorAction SilentlyContinue
}

if ($imageFiles) {
    Write-Info "Found $($imageFiles.Count) JPEG images to process"
    $imageFiles | ForEach-Object -ThrottleLimit $ParallelJobs -Parallel {
        $SourcePath = $_.FullName
        $Quality = $using:JpegXlQuality
        $Effort = $using:JpegXlEffort
        $Stats = $using:stats
        
        $basePath = [System.IO.Path]::ChangeExtension($SourcePath, $null).TrimEnd('.')
        $destPath = "$basePath.jxl"
        
        if (Test-Path $destPath) {
            Write-Host "[SKIP] JXL already exists: $destPath" -ForegroundColor Yellow
            $Stats.skippedImages++
            return
        }
        
        Write-Host "[INFO] Converting image: $SourcePath" -ForegroundColor Blue
        
        try {
            # -j 0 disables lossless JPEG transcoding to allow quality setting
            & cjxl $SourcePath $destPath -j 0 -q $Quality -e $Effort 2>$null
            
            if ($LASTEXITCODE -eq 0 -and (Test-Path $destPath)) {
                $srcItem = Get-Item $SourcePath
                $srcSize = $srcItem.Length
                $dstSize = (Get-Item $destPath).Length
                $savings = [math]::Round(100 - ($dstSize * 100 / $srcSize))
                
                # Preserve original modification time
                (Get-Item $destPath).LastWriteTime = $srcItem.LastWriteTime
                
                Remove-Item $SourcePath -Force
                Write-Host "[OK] Converted: $SourcePath -> $destPath (${savings}% smaller)" -ForegroundColor Green
                $Stats.convertedImages++
            } else {
                throw "cjxl failed"
            }
        } catch {
            Write-Host "[ERROR] Failed to convert: $SourcePath" -ForegroundColor Red
            if (Test-Path $destPath) { Remove-Item $destPath -Force }
            $Stats.errors++
        }
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
    $videoFiles | ForEach-Object -ThrottleLimit $ParallelJobs -Parallel {
        $SourcePath = $_.FullName
        $Crf = $using:Av1Crf
        $Preset = $using:Av1Preset
        $Stats = $using:stats
        
        $basePath = [System.IO.Path]::ChangeExtension($SourcePath, $null).TrimEnd('.')
        $destPath = "${basePath}_av1.mp4"
        $tempPath = "${basePath}_av1_tmp.mp4"
        
        # Check if already converted version exists
        if (Test-Path $destPath) {
            Write-Host "[SKIP] AV1 version already exists: $destPath" -ForegroundColor Yellow
            $Stats.skippedVideos++
            return
        }
        
        # Check if source is already AV1
        try {
            $codec = & ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 $SourcePath 2>$null
            if ($codec -eq "av1") {
                Write-Host "[SKIP] Already AV1: $SourcePath" -ForegroundColor Yellow
                $Stats.skippedVideos++
                return
            }
        } catch {}
        
        Write-Host "[INFO] Re-encoding video: $SourcePath" -ForegroundColor Blue
        
        try {
            & ffmpeg -y -i $SourcePath `
                -c:v libsvtav1 -crf $Crf -preset $Preset `
                -c:a copy `
                -movflags +faststart `
                $tempPath 2>$null
            
            if ($LASTEXITCODE -eq 0 -and (Test-Path $tempPath)) {
                $srcItem = Get-Item $SourcePath
                $srcSize = $srcItem.Length
                $dstSize = (Get-Item $tempPath).Length
                $savings = [math]::Round(100 - ($dstSize * 100 / $srcSize))
                
                # Only keep the new file if it's smaller or similar size
                if ($dstSize -lt ($srcSize * 1.1)) {
                    # Preserve original modification time
                    (Get-Item $tempPath).LastWriteTime = $srcItem.LastWriteTime
                    
                    Move-Item $tempPath $destPath -Force
                    Remove-Item $SourcePath -Force
                    Write-Host "[OK] Converted: $SourcePath -> $destPath (${savings}% smaller)" -ForegroundColor Green
                    $Stats.convertedVideos++
                } else {
                    Remove-Item $tempPath -Force
                    Write-Host "[SKIP] AV1 version larger, keeping original: $SourcePath" -ForegroundColor Yellow
                    $Stats.skippedVideos++
                }
            } else {
                throw "ffmpeg failed"
            }
        } catch {
            Write-Host "[ERROR] Failed to convert: $SourcePath" -ForegroundColor Red
            if (Test-Path $tempPath) { Remove-Item $tempPath -Force }
            $Stats.errors++
        }
    }
} else {
    Write-Info "No MP4 videos found"
}

Write-Host ""
Write-Host "============================================"
Write-Host "  Compression Complete"
Write-Host "============================================"
Write-Host "Images converted: $($script:stats.convertedImages)"
Write-Host "Images skipped: $($script:stats.skippedImages)"
Write-Host "Videos converted: $($script:stats.convertedVideos)"
Write-Host "Videos skipped: $($script:stats.skippedVideos)"
Write-Host "Errors: $($script:stats.errors)"
Write-Host "============================================"
