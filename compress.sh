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

# Statistics
declare -i converted_images=0
declare -i skipped_images=0
declare -i converted_videos=0
declare -i skipped_videos=0
declare -i errors=0

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
        ((skipped_images++))
        return 0
    fi
    
    log_info "Converting image: $src"
    if cjxl "$src" "$dst" -q "$JPEG_XL_QUALITY" -e "$JPEG_XL_EFFORT" 2>/dev/null; then
        local src_size=$(stat -c%s "$src")
        local dst_size=$(stat -c%s "$dst")
        local savings=$((100 - (dst_size * 100 / src_size)))
        log_success "Converted: $src -> $dst (${savings}% smaller)"
        rm "$src"
        ((converted_images++))
    else
        log_error "Failed to convert: $src"
        rm -f "$dst"
        ((errors++))
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
        ((skipped_videos++))
        return 0
    fi
    
    # Check if source is already AV1
    if is_av1 "$src"; then
        log_warn "Already AV1: $src"
        ((skipped_videos++))
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
            mv "$tmp" "$dst"
            rm "$src"
            log_success "Converted: $src -> $dst (${savings}% smaller)"
            ((converted_videos++))
        else
            rm "$tmp"
            log_warn "AV1 version larger, keeping original: $src"
            ((skipped_videos++))
        fi
    else
        log_error "Failed to convert: $src"
        rm -f "$tmp"
        ((errors++))
    fi
}

export -f convert_image convert_video is_av1 log_info log_success log_warn log_error
export JPEG_XL_QUALITY JPEG_XL_EFFORT AV1_CRF AV1_PRESET
export converted_images skipped_images converted_videos skipped_videos errors
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
    echo "$IMAGE_FILES" | while read -r file; do
        [[ -n "$file" ]] && convert_image "$file"
    done
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
    echo "$VIDEO_FILES" | while read -r file; do
        [[ -n "$file" ]] && convert_video "$file"
    done
else
    log_info "No MP4 videos found"
fi

echo ""
echo "============================================"
echo "  Compression Complete"
echo "============================================"
echo "Images converted: $converted_images"
echo "Images skipped: $skipped_images"
echo "Videos converted: $converted_videos"
echo "Videos skipped: $skipped_videos"
echo "Errors: $errors"
echo "============================================"
