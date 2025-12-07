# Compress downloads-* folders:
# - Convert JPG/JPEG to JPEG XL
# - Re-encode non-AV1 MP4/MKV videos to AV1

param(
    [int]$JpegXlQuality = 90,
    [int]$JpegXlEffort = 5,
    [int]$Av1Crf = 30,
    [int]$Av1Preset = 6,
    [int]$ParallelJobs = 1,
    [bool]$KeepOriginals = $true
)

# Don't stop on errors - we handle them in functions
$ErrorActionPreference = "Continue"

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
if ($KeepOriginals) {
    Write-Host "Original files: Will be kept (use -KeepOriginals `$false to remove)"
} else {
    Write-Host "Original files: Will be removed after compression"
}
Write-Host "============================================"
Write-Host ""

# Process images
Write-Info "Finding JPEG images..."
$imageFiles = $downloadDirs | ForEach-Object {
    Get-ChildItem -Path $_.FullName -Recurse -Include "*.jpg", "*.jpeg" -File -ErrorAction SilentlyContinue
}

if ($imageFiles) {
    Write-Info "Found $($imageFiles.Count) JPEG images to process"
    if ($imageFiles.Count -gt 1000) {
        Write-Skip "Large batch detected ($($imageFiles.Count) images). This may take a while..."
    }

    if ($ParallelJobs -gt 1) {
        $imageFiles | ForEach-Object -ThrottleLimit $ParallelJobs -Parallel {
        $SourcePath = $_.FullName
        $Quality = $using:JpegXlQuality
        $Effort = $using:JpegXlEffort
        $Stats = $using:stats
        $KeepOriginals = $using:KeepOriginals

        $basePath = [System.IO.Path]::ChangeExtension($SourcePath, $null).TrimEnd('.')
        $destPath = "$basePath.jxl"

        if (Test-Path $destPath) {
            Write-Host "[SKIP] JXL already exists: $destPath" -ForegroundColor Yellow
            $Stats.skippedImages++
            return
        }

        # Check file size - skip very large images that might cause segfaults
        $srcItem = Get-Item $SourcePath
        $srcSize = $srcItem.Length
        if ($srcSize -gt 104857600) {  # Skip files larger than 100MB
            Write-Host "[SKIP] Skipping very large file (>100MB): $SourcePath" -ForegroundColor Yellow
            $Stats.skippedImages++
            return
        }

        Write-Host "[INFO] Converting image: $SourcePath" -ForegroundColor Blue

        try {
            # -j 0 disables lossless JPEG transcoding to allow quality setting
            & cjxl $SourcePath $destPath -j 0 -q $Quality -e $Effort 2>$null

            if ($LASTEXITCODE -eq 0 -and (Test-Path $destPath)) {
                $dstSize = (Get-Item $destPath).Length
                if ($srcSize -gt 0 -and $dstSize -gt 0) {
                    $savings = [math]::Round(100 - ($dstSize * 100 / $srcSize))

                    # Preserve original modification time
                    (Get-Item $destPath).LastWriteTime = $srcItem.LastWriteTime

                    if (-not $KeepOriginals) {
                        Remove-Item $SourcePath -Force
                    }
                    Write-Host "[OK] Converted: $SourcePath -> $destPath (${savings}% smaller)" -ForegroundColor Green
                    $Stats.convertedImages++
                } else {
                    throw "Invalid file sizes"
                }
            } else {
                throw "cjxl failed"
            }
        } catch {
            Write-Host "[ERROR] Failed to convert: $SourcePath - $_" -ForegroundColor Red
            if (Test-Path $destPath) { Remove-Item $destPath -Force }
            $Stats.errors++
        }
    }
    } else {
        # Sequential processing with delay to prevent system overload
        $imageFiles | ForEach-Object {
            $SourcePath = $_.FullName
            $basePath = [System.IO.Path]::ChangeExtension($SourcePath, $null).TrimEnd('.')
            $destPath = "$basePath.jxl"

            if (Test-Path $destPath) {
                Write-Skip "JXL already exists: $destPath"
                $script:stats.skippedImages++
                return
            }

            # Check file size - skip very large images that might cause segfaults
            $srcItem = Get-Item $SourcePath
            $srcSize = $srcItem.Length
            if ($srcSize -gt 104857600) {  # Skip files larger than 100MB
                Write-Skip "Skipping very large file (>100MB): $SourcePath"
                $script:stats.skippedImages++
                continue
            }

            Write-Info "Converting image: $SourcePath"

            try {
                # -j 0 disables lossless JPEG transcoding to allow quality setting
                # Use lower priority to prevent system freezing
                $job = Start-Job -ScriptBlock {
                    param($src, $dst, $q, $e)
                    & cjxl $src $dst -j 0 -q $q -e $e 2>$null
                    return $LASTEXITCODE
                } -ArgumentList $SourcePath, $destPath, $JpegXlQuality, $JpegXlEffort

                # Wait with timeout (5 minutes)
                $job | Wait-Job -Timeout 300 | Out-Null

                if ($job.State -eq "Completed") {
                    $exitCode = Receive-Job $job
                    Remove-Job $job -Force

                    if ($exitCode -eq 0 -and (Test-Path $destPath)) {
                        $dstSize = (Get-Item $destPath).Length
                        if ($srcSize -gt 0 -and $dstSize -gt 0) {
                            $savings = [math]::Round(100 - ($dstSize * 100 / $srcSize))

                            # Preserve original modification time
                            (Get-Item $destPath).LastWriteTime = $srcItem.LastWriteTime

                            if (-not $KeepOriginals) {
                                Remove-Item $SourcePath -Force
                            }
                            Write-Host "[OK] Converted: $SourcePath -> $destPath (${savings}% smaller)" -ForegroundColor Green
                            $script:stats.convertedImages++
                        } else {
                            throw "Invalid file sizes"
                        }
                    } else {
                        throw "cjxl failed (exit code $exitCode)"
                    }
                } else {
                    # Timeout or failed
                    Stop-Job $job -ErrorAction SilentlyContinue
                    Remove-Job $job -Force
                    if ($job.State -eq "Running") {
                        throw "Timeout converting (took >5 minutes)"
                    } else {
                        throw "cjxl job failed"
                    }
                }
            } catch {
                Write-Host "[ERROR] Failed to convert: $SourcePath - $_" -ForegroundColor Red
                if (Test-Path $destPath) { Remove-Item $destPath -Force }
                $script:stats.errors++
            }

            # Delay to prevent system overload (longer delay for safety)
            Start-Sleep -Milliseconds 200
        }
    }
} else {
    Write-Info "No JPEG images found"
}

Write-Host ""

# Process videos
Write-Info "Finding MP4/MKV videos..."
$videoFiles = $downloadDirs | ForEach-Object {
    Get-ChildItem -Path $_.FullName -Recurse -Include "*.mp4", "*.mkv" -File -ErrorAction SilentlyContinue
}

if ($videoFiles) {
    Write-Info "Found $($videoFiles.Count) MP4/MKV videos to check"
    # Process videos sequentially - SVT-AV1 is already multi-threaded and very CPU intensive
    $videoFiles | ForEach-Object {
        $SourcePath = $_.FullName

        $basePath = [System.IO.Path]::ChangeExtension($SourcePath, $null).TrimEnd('.')
        $destPath = "${basePath}_av1.mp4"
        $tempPath = "${basePath}_av1_tmp.mp4"

        # Check if already converted version exists
        if (Test-Path $destPath) {
            Write-Skip "AV1 version already exists: $destPath"
            $script:stats.skippedVideos++
            return
        }

        # Check if source is already AV1
        try {
            $codec = & ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 $SourcePath 2>$null
            if ($codec -eq "av1") {
                Write-Skip "Already AV1: $SourcePath"
                $script:stats.skippedVideos++
                return
            }
        } catch {}

        Write-Info "Re-encoding video: $SourcePath"

        try {
            & ffmpeg -y -i $SourcePath `
                -c:v libsvtav1 -crf $Av1Crf -preset $Av1Preset `
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
                    if (-not $KeepOriginals) {
                        Remove-Item $SourcePath -Force
                    }
                    Write-Host "[OK] Converted: $SourcePath -> $destPath (${savings}% smaller)" -ForegroundColor Green
                    $script:stats.convertedVideos++
                } else {
                    Remove-Item $tempPath -Force
                    Write-Skip "AV1 version larger, keeping original: $SourcePath"
                    $script:stats.skippedVideos++
                }
            } else {
                throw "ffmpeg failed"
            }
        } catch {
            Write-Host "[ERROR] Failed to convert: $SourcePath" -ForegroundColor Red
            if (Test-Path $tempPath) { Remove-Item $tempPath -Force }
            $script:stats.errors++
        }
    }
} else {
    Write-Info "No MP4/MKV videos found"
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
