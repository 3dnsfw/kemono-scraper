#!/bin/bash

# Compress downloads-* folders:
# - Convert JPG/JPEG to JPEG XL
# - Re-encode non-AV1 MP4/MKV videos to AV1

# Don't exit on error - we handle errors in functions
set +e

# Check for required tools
if ! command -v cjxl &> /dev/null; then
    echo "Error: cjxl not found. Install libjxl (e.g., paru -S libjxl)"
    exit 1
fi

if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg not found. Install ffmpeg"
    exit 1
fi

if ! command -v ffprobe &> /dev/null; then
    echo "Error: ffprobe not found. Install ffmpeg"
    exit 1
fi

if ! command -v timeout &> /dev/null; then
    echo "Warning: timeout command not found. Install coreutils for better safety"
fi

# Configuration
JPEG_XL_QUALITY="${JPEG_XL_QUALITY:-90}"  # Quality for JPEG XL (1-100, higher = better)
JPEG_XL_EFFORT="${JPEG_XL_EFFORT:-5}"     # Encoding effort (1-9, lower = less memory usage, safer)
AV1_CRF="${AV1_CRF:-30}"                  # CRF for AV1 (lower = better quality, 18-35 typical)
AV1_PRESET="${AV1_PRESET:-6}"             # SVT-AV1 preset (0-13, lower = slower but better)
PARALLEL_JOBS="${PARALLEL_JOBS:-1}"       # Number of parallel image conversions (1 = sequential, safer for system)
KEEP_ORIGINALS="${KEEP_ORIGINALS:-1}"    # Keep original files after compression (1 = keep, 0 = remove)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Statistics (temp files for parallel tracking)
STATS_DIR=$(mktemp -d)
trap "rm -rf $STATS_DIR" EXIT
echo 0 > "$STATS_DIR/converted_images"
echo 0 > "$STATS_DIR/skipped_images"
echo 0 > "$STATS_DIR/converted_videos"
echo 0 > "$STATS_DIR/skipped_videos"
echo 0 > "$STATS_DIR/errors"
touch "$STATS_DIR/blacklist.txt"  # Track files that cause segfaults

increment_stat() {
    local file="$STATS_DIR/$1"
    # Use flock if available, otherwise use a simple atomic increment
    if command -v flock &> /dev/null; then
        flock "$file" bash -c "echo \$((\$(cat '$file' 2>/dev/null || echo 0) + 1)) > '$file'"
    else
        # Fallback: simple increment (may have race conditions but better than nothing)
        local count=$(cat "$file" 2>/dev/null || echo 0)
        echo $((count + 1)) > "$file"
    fi
}

get_stat() {
    cat "$STATS_DIR/$1"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if video is already AV1
is_av1() {
    local file="$1"
    local codec=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$file" 2>/dev/null)
    [[ "$codec" == "av1" ]]
}

# Validate image file before processing
validate_image() {
    local file="$1"
    # Try to read image info with identify (ImageMagick) or file command
    if command -v identify &> /dev/null; then
        identify "$file" &>/dev/null
        return $?
    elif command -v file &> /dev/null; then
        local file_type=$(file -b "$file" 2>/dev/null)
        [[ "$file_type" == *"JPEG"* ]] || [[ "$file_type" == *"image"* ]]
        return $?
    else
        # Fallback: check if file is readable and has valid JPEG header
        local header=$(head -c 3 "$file" 2>/dev/null | od -An -tx1 | tr -d ' \n')
        [[ "$header" == *"ffd8ff"* ]]  # JPEG magic bytes
        return $?
    fi
}

# Convert a single image to JPEG XL
convert_image() {
    local src="$1"
    [[ -z "$src" || ! -f "$src" ]] && return 1

    local dst="${src%.*}.jxl"

    if [[ -f "$dst" ]]; then
        log_warn "JXL already exists: $dst"
        increment_stat skipped_images
        return 0
    fi

    # Check if file is blacklisted (caused segfaults before)
    if [[ -f "$STATS_DIR/blacklist.txt" ]] && grep -Fxq "$src" "$STATS_DIR/blacklist.txt" 2>/dev/null; then
        log_warn "Skipping blacklisted file (previous segfault): $src"
        increment_stat skipped_images
        return 0
    fi

    # Check file size - skip very large images that might cause segfaults
    local src_size=$(stat -c%s "$src" 2>/dev/null || echo 0)
    if [[ $src_size -gt 52428800 ]]; then  # Skip files larger than 50MB (more conservative)
        log_warn "Skipping large file (>50MB): $src"
        increment_stat skipped_images
        return 0
    fi

    if [[ $src_size -lt 1000 ]]; then  # Skip tiny files (likely corrupted)
        log_warn "Skipping suspiciously small file: $src"
        increment_stat skipped_images
        return 0
    fi

    # Validate image before processing
    if ! validate_image "$src"; then
        log_warn "Skipping invalid/corrupted image: $src"
        increment_stat skipped_images
        return 0
    fi

    log_info "Converting image: $src"

    # Check available memory before processing (if free command available)
    if command -v free &> /dev/null; then
        local avail_mem_mb=$(free -m | awk '/^Mem:/ {print $7}')
        if [[ -n "$avail_mem_mb" ]] && [[ $avail_mem_mb -lt 512 ]]; then
            log_warn "Low memory (${avail_mem_mb}MB available), pausing for 10 seconds..."
            sleep 10
        fi
    fi

    # Run cjxl with memory limits and timeout to prevent crashes
    # Use systemd-run with memory limits if available, otherwise timeout + ulimit
    local max_mem_mb=1024  # 1GB limit (more conservative)
    local timeout_sec=180   # 3 minute timeout (shorter to fail faster)
    local cjxl_success=false
    local exit_code=0

    # Try systemd-run first (best isolation)
    if command -v systemd-run &> /dev/null; then
        systemd-run --user --scope \
            -p MemoryMax="${max_mem_mb}M" \
            -p CPUQuota=50% \
            nice -n 10 cjxl "$src" "$dst" -j 0 -q "$JPEG_XL_QUALITY" -e "$JPEG_XL_EFFORT" 2>/dev/null
        exit_code=$?
    elif command -v timeout &> /dev/null; then
        # Use timeout with memory limit via ulimit (less reliable but better than nothing)
        timeout $timeout_sec bash -c "
            ulimit -v $((max_mem_mb * 1024)) 2>/dev/null
            nice -n 10 cjxl \"$src\" \"$dst\" -j 0 -q $JPEG_XL_QUALITY -e $JPEG_XL_EFFORT 2>/dev/null
        " 2>/dev/null
        exit_code=$?
    else
        # Fallback: just nice priority
        nice -n 10 cjxl "$src" "$dst" -j 0 -q "$JPEG_XL_QUALITY" -e "$JPEG_XL_EFFORT" 2>/dev/null
        exit_code=$?
    fi

    # Handle exit codes
    case $exit_code in
        0)
            cjxl_success=true
            ;;
        124)
            log_error "Timeout converting: $src (took >${timeout_sec}s)"
            rm -f "$dst"
            increment_stat errors
            return 1
            ;;
        137)
            log_error "Killed (likely OOM): $src"
            rm -f "$dst"
            increment_stat errors
            return 1
            ;;
        139)
            log_error "Segfault detected: $src (skipping to prevent crash)"
            rm -f "$dst"
            increment_stat errors
            # Add to blacklist to skip in future runs
            echo "$src" >> "$STATS_DIR/blacklist.txt" 2>/dev/null
            return 1
            ;;
        *)
            # Other errors
            ;;
    esac

    if [[ "$cjxl_success" == "true" && -f "$dst" ]]; then
        local dst_size=$(stat -c%s "$dst" 2>/dev/null || echo 0)
        if [[ $src_size -gt 0 && $dst_size -gt 0 ]]; then
            local savings=$((100 - (dst_size * 100 / src_size)))
            # Preserve original modification time
            touch -r "$src" "$dst" 2>/dev/null
            log_success "Converted: $src -> $dst (${savings}% smaller)"
            if [[ "$KEEP_ORIGINALS" == "0" ]]; then
                rm "$src" 2>/dev/null
            fi
            increment_stat converted_images
            return 0
        else
            log_error "Invalid file sizes: $src"
            rm -f "$dst"
            increment_stat errors
            return 1
        fi
    else
        if [[ $exit_code -ne 124 && $exit_code -ne 137 && $exit_code -ne 139 ]]; then
            log_error "cjxl failed (exit code $exit_code): $src"
        fi
        rm -f "$dst"
        increment_stat errors
        return 1
    fi
}

# Convert a single video to AV1
convert_video() {
    local src="$1"
    local dst="${src%.*}_av1.mp4"
    local tmp="${src%.*}_av1_tmp.mp4"

    # Check if already converted version exists
    if [[ -f "$dst" ]]; then
        log_warn "AV1 version already exists: $dst"
        increment_stat skipped_videos
        return 0
    fi

    # Check if source is already AV1
    if is_av1 "$src"; then
        log_warn "Already AV1: $src"
        increment_stat skipped_videos
        return 0
    fi

    log_info "Re-encoding video: $src"

    # Use SVT-AV1 encoder with copy audio
    # Limit threads to prevent system overload (use 75% of available cores)
    local max_threads=$(nproc)
    local svt_threads=$((max_threads * 3 / 4))
    if [[ $svt_threads -lt 1 ]]; then
        svt_threads=1
    fi

    # Run with nice priority to avoid freezing the system
    if nice -n 10 ffmpeg -y -i "$src" \
        -c:v libsvtav1 -crf "$AV1_CRF" -preset "$AV1_PRESET" \
        -svtav1-params "threads=$svt_threads" \
        -c:a copy \
        -movflags +faststart \
        "$tmp" 2>/dev/null; then

        local src_size=$(stat -c%s "$src")
        local dst_size=$(stat -c%s "$tmp")
        local savings=$((100 - (dst_size * 100 / src_size)))

        # Only keep the new file if it's smaller or similar size
        if [[ $dst_size -lt $((src_size * 110 / 100)) ]]; then
            # Preserve original modification time
            touch -r "$src" "$tmp"
            mv "$tmp" "$dst"
            if [[ "$KEEP_ORIGINALS" == "0" ]]; then
                rm "$src"
            fi
            log_success "Converted: $src -> $dst (${savings}% smaller)"
            increment_stat converted_videos
        else
            rm "$tmp"
            log_warn "AV1 version larger, keeping original: $src"
            increment_stat skipped_videos
        fi
    else
        log_error "Failed to convert: $src"
        rm -f "$tmp"
        increment_stat errors
    fi
}

export -f convert_image convert_video validate_image is_av1 log_info log_success log_warn log_error increment_stat get_stat
export JPEG_XL_QUALITY JPEG_XL_EFFORT AV1_CRF AV1_PRESET KEEP_ORIGINALS STATS_DIR
export RED GREEN YELLOW BLUE NC

# Find all downloads-* directories
DOWNLOAD_DIRS=$(find . -maxdepth 1 -type d -name "downloads-*" 2>/dev/null)

if [[ -z "$DOWNLOAD_DIRS" ]]; then
    log_warn "No downloads-* directories found"
    exit 0
fi

echo "============================================"
echo "  Media Compression Script"
echo "============================================"
echo "JPEG XL Quality: $JPEG_XL_QUALITY, Effort: $JPEG_XL_EFFORT"
echo "AV1 CRF: $AV1_CRF, Preset: $AV1_PRESET"
echo "Parallel jobs: $PARALLEL_JOBS"
if [[ "$KEEP_ORIGINALS" == "0" ]]; then
    echo "Original files: Will be removed after compression"
else
    echo "Original files: Will be kept (set KEEP_ORIGINALS=0 to remove)"
fi
echo "============================================"
echo ""

# Process images
log_info "Finding JPEG images..."
IMAGE_FILES=$(find $DOWNLOAD_DIRS -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) 2>/dev/null)
IMAGE_COUNT=$(echo "$IMAGE_FILES" | grep -c . || echo 0)

if [[ $IMAGE_COUNT -gt 0 ]]; then
    log_info "Found $IMAGE_COUNT JPEG images to process"
    if [[ $IMAGE_COUNT -gt 1000 ]]; then
        log_warn "Large batch detected ($IMAGE_COUNT images). This may take a while..."
    fi
    # Always process images sequentially to prevent memory issues and segfaults
    # Process in batches with delays to let system recover
    local processed=0
    echo "$IMAGE_FILES" | while read -r file; do
        [[ -z "$file" ]] && continue

        # Check system load - pause if too high
        if command -v uptime &> /dev/null; then
            local load=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | tr -d ',')
            if [[ -n "$load" ]] && (( $(echo "$load > $(nproc)" | bc -l 2>/dev/null || echo 0) )); then
                log_warn "High system load ($load), pausing for 5 seconds..."
                sleep 5
            fi
        fi

        convert_image "$file"
        ((processed++))

        # Add delay every 10 images to let system recover
        if [[ $((processed % 10)) -eq 0 ]]; then
            log_info "Processed $processed/$IMAGE_COUNT images..."
            sleep 2  # Longer pause every 10 images
        else
            sleep 0.5  # Small delay between each image
        fi
    done
else
    log_info "No JPEG images found"
fi

echo ""

# Process videos
log_info "Finding MP4/MKV videos..."
VIDEO_FILES=$(find $DOWNLOAD_DIRS -type f \( -iname "*.mp4" -o -iname "*.mkv" \) 2>/dev/null)
VIDEO_COUNT=$(echo "$VIDEO_FILES" | grep -c . || echo 0)

if [[ $VIDEO_COUNT -gt 0 ]]; then
    log_info "Found $VIDEO_COUNT MP4/MKV videos to check"
    if [[ $VIDEO_COUNT -gt 50 ]]; then
        log_warn "Large batch detected ($VIDEO_COUNT videos). This will take a very long time..."
    fi
    # Process videos sequentially - SVT-AV1 is already multi-threaded and very CPU intensive
    echo "$VIDEO_FILES" | while read -r file; do
        [[ -n "$file" ]] && convert_video "$file"
        # Small delay to let system recover between videos
        sleep 0.5
    done
else
    log_info "No MP4/MKV videos found"
fi

echo ""
echo "============================================"
echo "  Compression Complete"
echo "============================================"
echo "Images converted: $(get_stat converted_images)"
echo "Images skipped: $(get_stat skipped_images)"
echo "Videos converted: $(get_stat converted_videos)"
echo "Videos skipped: $(get_stat skipped_videos)"
echo "Errors: $(get_stat errors)"

# Check for blacklisted files
if [[ -f "$STATS_DIR/blacklist.txt" ]] && [[ -s "$STATS_DIR/blacklist.txt" ]]; then
    local blacklist_count=$(wc -l < "$STATS_DIR/blacklist.txt" 2>/dev/null || echo 0)
    if [[ $blacklist_count -gt 0 ]]; then
        echo ""
        echo "Warning: $blacklist_count file(s) caused segfaults and were blacklisted"
        echo "These files will be skipped in future runs to prevent crashes"
    fi
fi

echo "============================================"
