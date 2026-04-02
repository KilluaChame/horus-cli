#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# horus-init-skill installer — Cross-platform auto-detect
# Usage: ./install.sh [--platform <name>] [--all] [--dry-run]
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

SKILL_NAME="horus-init"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1" >&2; }
info() { echo -e "${CYAN}ℹ${NC} $1"; }

# ─── Platform detection ──────────────────────────────────────────────

declare -A PLATFORMS=(
  ["claude"]="$HOME/.claude/skills"
  ["cursor"]="$PWD/.cursor/rules"
  ["cursor-global"]="$HOME/.cursor/skills"
  ["copilot"]="$PWD/.github/skills"
  ["windsurf"]="$PWD/.windsurf/rules"
  ["windsurf-global"]="$HOME/.codeium/windsurf/skills"
  ["cline"]="$PWD/.clinerules"
  ["gemini"]="$HOME/.gemini/skills"
  ["kiro"]="$PWD/.kiro/skills"
  ["trae"]="$PWD/.trae/rules"
  ["roo"]="$PWD/.roo/rules"
  ["goose"]="$HOME/.config/goose/skills"
  ["opencode"]="$HOME/.config/opencode/skills"
  ["antigravity"]="$PWD/.agents/skills"
  ["universal"]="$HOME/.agents/skills"
)

detect_platforms() {
  local detected=()
  [[ -d "$HOME/.claude" ]] && detected+=("claude")
  [[ -d "$PWD/.cursor" || -d "$HOME/.cursor" ]] && detected+=("cursor")
  [[ -d "$PWD/.github" ]] && detected+=("copilot")
  [[ -d "$HOME/.codeium/windsurf" || -d "$PWD/.windsurf" ]] && detected+=("windsurf")
  [[ -d "$PWD/.clinerules" ]] && detected+=("cline")
  [[ -d "$HOME/.gemini" ]] && detected+=("gemini")
  [[ -d "$PWD/.kiro" ]] && detected+=("kiro")
  [[ -d "$PWD/.trae" ]] && detected+=("trae")
  [[ -d "$PWD/.roo" ]] && detected+=("roo")
  [[ -d "$HOME/.config/goose" ]] && detected+=("goose")
  [[ -d "$HOME/.config/opencode" ]] && detected+=("opencode")
  [[ -d "$PWD/.agents" ]] && detected+=("antigravity")
  [[ -d "$HOME/.agents" ]] && detected+=("universal")
  echo "${detected[@]}"
}

# ─── Install logic ───────────────────────────────────────────────────

install_to() {
  local platform="$1"
  local target_dir="${PLATFORMS[$platform]}/$SKILL_NAME"

  if [[ "$DRY_RUN" == "true" ]]; then
    info "[DRY-RUN] Would install to: $target_dir"
    return
  fi

  mkdir -p "$(dirname "$target_dir")"
  
  if [[ -d "$target_dir" ]]; then
    warn "Already installed at $target_dir — updating..."
    rm -rf "$target_dir"
  fi

  cp -R "$SCRIPT_DIR" "$target_dir"
  log "Installed to $target_dir ($platform)"
}

# ─── CLI parsing ─────────────────────────────────────────────────────

PLATFORM=""
INSTALL_ALL=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform) PLATFORM="$2"; shift 2 ;;
    --all)      INSTALL_ALL=true; shift ;;
    --dry-run)  DRY_RUN=true; shift ;;
    --help|-h)
      echo "Usage: ./install.sh [--platform <name>] [--all] [--dry-run]"
      echo ""
      echo "Platforms: ${!PLATFORMS[*]}"
      echo ""
      echo "Options:"
      echo "  --platform <name>  Install to a specific platform"
      echo "  --all              Install to all detected platforms"
      echo "  --dry-run          Show what would be installed without doing it"
      exit 0
      ;;
    *) err "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Execute ─────────────────────────────────────────────────────────

echo ""
echo "  ██╗  ██╗ ██████╗ ██████╗ ██╗   ██╗███████╗"
echo "  ██║  ██║██╔═══██╗██╔══██╗██║   ██║██╔════╝"
echo "  ███████║██║   ██║██████╔╝██║   ██║███████╗"
echo "  ██╔══██║██║   ██║██╔══██╗██║   ██║╚════██║"
echo "  ██║  ██║╚██████╔╝██║  ██║╚██████╔╝███████║"
echo "  ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝"
echo "  Skill Installer — $SKILL_NAME"
echo ""

if [[ -n "$PLATFORM" ]]; then
  if [[ -z "${PLATFORMS[$PLATFORM]+_}" ]]; then
    err "Unknown platform: $PLATFORM"
    err "Available: ${!PLATFORMS[*]}"
    exit 1
  fi
  install_to "$PLATFORM"
elif [[ "$INSTALL_ALL" == "true" ]]; then
  detected=($(detect_platforms))
  if [[ ${#detected[@]} -eq 0 ]]; then
    warn "No platforms detected. Installing to universal path..."
    install_to "universal"
  else
    for p in "${detected[@]}"; do
      install_to "$p"
    done
  fi
else
  # Auto-detect single best platform
  detected=($(detect_platforms))
  if [[ ${#detected[@]} -eq 0 ]]; then
    info "No platforms auto-detected. Installing to universal path..."
    install_to "universal"
  elif [[ ${#detected[@]} -eq 1 ]]; then
    install_to "${detected[0]}"
  else
    info "Multiple platforms detected: ${detected[*]}"
    info "Installing to first detected: ${detected[0]}"
    info "Use --all to install to all, or --platform <name> for a specific one."
    install_to "${detected[0]}"
  fi
fi

echo ""
log "Installation complete!"
echo ""
info "To use it, open your AI assistant and type:"
echo ""
echo "  /horus-init"
echo ""
info "Or ask naturally: 'Create the horus.json for this project'"
echo ""
