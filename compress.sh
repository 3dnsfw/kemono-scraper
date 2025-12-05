#!/bin/bash

# Compress downloads-* folders:
# - Convert JPG/JPEG to JPEG XL
# - Re-encode non-AV1 MP4 videos to AV1

set -e

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

# Configuration
JPEG_XL_QUALITY="${JPEG_XL_QUALITY:-90}"  # Quality for JPEG XL (1-100, higher = better)
JPEG_XL_EFFORT="${JPEG_XL_EFFORT:-7}"     # Encoding effort (1-9, higher = slower but smaller)
AV1_CRF="${AV1_CRF:-30}"                  # CRF for AV1 (lower = better quality, 18-35 typical)
AV1_PRESET="${AV1_PRESET:-6}"             # SVT-AV1 preset (0-13, lower = slower but better)
PARALLEL_JOBS="${PARALLEL_JOBS:-4}"       # Number of parallel conversions

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

increment_stat() {
    local file="$STATS_DIR/$1"
    flock "$file" bash -c "echo \$((\$(cat '$file') + 1)) > '$file'"
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

# Convert a single image to JPEG XL
convert_image() {
    local src="$1"
    local dst="${src%.*}.jxl"
    
    if [[ -f "$dst" ]]; then
        log_warn "JXL already exists: $dst"
        increment_stat skipped_images
        return 0
    fi
    
    log_info "Converting image: $src"
    # -j 0 disables lossless JPEG transcoding to allow quality setting
    if cjxl "$src" "$dst" -j 0 -q "$JPEG_XL_QUALITY" -e "$JPEG_XL_EFFORT" 2>/dev/null; then
        local src_size=$(stat -c%s "$src")
        local dst_size=$(stat -c%s "$dst")
        local savings=$((100 - (dst_size * 100 / src_size)))
        # Preserve original modification time
        touch -r "$src" "$dst"
        log_success "Converted: $src -> $dst (${savings}% smaller)"
        rm "$src"
        increment_stat converted_images
    else
        log_error "Failed to convert: $src"
        rm -f "$dst"
        increment_stat errors
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
    if ffmpeg -y -i "$src" \
        -c:v libsvtav1 -crf "$AV1_CRF" -preset "$AV1_PRESET" \
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
            rm "$src"
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

export -f convert_image convert_video is_av1 log_info log_success log_warn log_error increment_stat get_stat
export JPEG_XL_QUALITY JPEG_XL_EFFORT AV1_CRF AV1_PRESET STATS_DIR
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
echo "============================================"
echo ""

# Process images
log_info "Finding JPEG images..."
IMAGE_FILES=$(find $DOWNLOAD_DIRS -type f \( -iname "*.jpg" -o -iname "*.jpeg" \) 2>/dev/null)
IMAGE_COUNT=$(echo "$IMAGE_FILES" | grep -c . || echo 0)

if [[ $IMAGE_COUNT -gt 0 ]]; then
    log_info "Found $IMAGE_COUNT JPEG images to process"
    echo "$IMAGE_FILES" | xargs -P "$PARALLEL_JOBS" -I {} bash -c 'convert_image "$@"' _ {}
else
    log_info "No JPEG images found"
fi

echo ""

# Process videos
log_info "Finding MP4 videos..."
VIDEO_FILES=$(find $DOWNLOAD_DIRS -type f -iname "*.mp4" 2>/dev/null)
VIDEO_COUNT=$(echo "$VIDEO_FILES" | grep -c . || echo 0)

if [[ $VIDEO_COUNT -gt 0 ]]; then
    log_info "Found $VIDEO_COUNT MP4 videos to check"
    echo "$VIDEO_FILES" | xargs -P "$PARALLEL_JOBS" -I {} bash -c 'convert_video "$@"' _ {}
else
    log_info "No MP4 videos found"
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
echo "============================================"
