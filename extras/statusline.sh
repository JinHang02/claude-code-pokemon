#!/usr/bin/env bash
# Pokémon Journey status line: a battle HUD for Claude Code's status line.
# Reads Claude Code's status JSON on stdin and prints two lines. Needs bash, jq and perl.
# Setup: https://github.com/JinHang02/claude-code-pokemon#optional-a-pokémon-status-line
input=$(cat)

E=$'\033'
R="${E}[0m"; B="${E}[1m"; D="${E}[2m"
fg() { printf '%s[38;2;%s;%s;%sm' "$E" "$1" "$2" "$3"; }
bg() { printf '%s[48;2;%s;%s;%sm' "$E" "$1" "$2" "$3"; }

# --- Parse every field in one jq pass (unit-separator delimited so empty fields survive) ---
US=$'\x1f'
IFS="$US" read -r model project_dir total_input total_output used_pct ctx_size current_input duration_ms effort <<EOF
$(printf '%s' "$input" | jq -r --arg s "$US" '[
  (.model.display_name // "Unknown"),
  (.workspace.project_dir // .cwd // ""),
  (.context_window.total_input_tokens // 0),
  (.context_window.total_output_tokens // 0),
  (.context_window.used_percentage // ""),
  (.context_window.context_window_size // 0),
  (.context_window.current_usage // {} | (.input_tokens // 0) + (.cache_creation_input_tokens // 0) + (.cache_read_input_tokens // 0)),
  (.cost.total_duration_ms // ""),
  (.effort.level // "")
] | map(tostring) | join($s)' 2>/dev/null)
EOF

num() { if [[ "$1" =~ ^[0-9]+$ ]]; then printf '%s' "$1"; else printf 0; fi; }
[ -n "$model" ] || model="Unknown"
total_input=$(num "$total_input"); total_output=$(num "$total_output")
ctx_size=$(num "$ctx_size"); current_input=$(num "$current_input")

format_k() {
  if [ "$1" -ge 1000000 ] && [ $(( $1 % 1000000 )) -eq 0 ]; then printf '%dM' $(( $1 / 1000000 ))
  elif [ "$1" -ge 1000 ]; then printf '%dk' $(( $1 / 1000 ))
  else printf '%d' "$1"; fi
}
input_fmt=$(format_k "$total_input")
output_fmt=$(format_k "$total_output")

# --- Project + git branch ---
project_name=""
[ -n "$project_dir" ] && project_name=$(basename "$project_dir")
git_branch=""
if [ -n "$project_dir" ] && [ -d "$project_dir" ] && git -C "$project_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_branch=$(git -C "$project_dir" symbolic-ref --short HEAD 2>/dev/null || git -C "$project_dir" rev-parse --short HEAD 2>/dev/null)
fi

# --- Context window: pct is empty when used_percentage is missing ---
pct=""; total_k="--"
if [[ "$used_pct" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  # Rounded in shell arithmetic: printf would misread "31.5" where the decimal mark is a comma.
  pct=${used_pct%%.*}
  [[ "$used_pct" =~ [.][5-9] ]] && pct=$(( pct + 1 ))
  [ "$pct" -gt 100 ] && pct=100
  total_k=$(format_k "$ctx_size")
fi

# HP colour by context used: green < 50%, yellow < 80%, red otherwise (Pokémon HP thresholds)
hp_fg() {
  if [ -z "$pct" ]; then printf '%s' "$D"
  elif [ "$pct" -lt 50 ]; then fg 72 208 72
  elif [ "$pct" -lt 80 ]; then fg 248 184 0
  else fg 248 88 88; fi
}
rep() { local s="" i; for ((i = 0; i < $2; i++)); do s="$s$1"; done; printf '%s' "$s"; }

# --- Session duration: Claude Code's own wall-clock time for the session, resumes included ---
elapsed=""
[[ "$duration_ms" =~ ^[0-9]+([.][0-9]+)?$ ]] && elapsed=$(( ${duration_ms%%.*} / 1000 ))
# Days, hours and minutes since the session began: 0d:03h:09m
dur_dhm() { printf '%dd:%02dh:%02dm' $(( $1 / 86400 )) $(( $1 % 86400 / 3600 )) $(( $1 % 3600 / 60 )); }

# --- Right alignment: Claude Code sets COLUMNS; tput is only a fallback for manual runs ---
vis_width() {
  printf '%s' "$1" | sed $'s/\033\\[[0-9;]*[A-Za-z]//g' |
    perl -CS -ne 'print length($_) + (() = /[\p{East_Asian_Width=Wide}\p{East_Asian_Width=Fullwidth}]/g)'
}
# right_align LEFT RIGHT FALLBACK_SEP
right_align() {
  local cols="${COLUMNS:-}" gap=-1
  if ! [[ "$cols" =~ ^[0-9]+$ ]]; then
    cols=$( { tput cols </dev/tty; } 2>/dev/null )
  fi
  if [[ "$cols" =~ ^[0-9]+$ ]]; then
    gap=$(( cols - 4 - $(vis_width "$1") - $(vis_width "$2") ))
  fi
  if [ "$gap" -ge 2 ]; then
    printf '%s%*s%s' "$1" "$gap" '' "$2"
  else
    printf '%s%s%s' "$1" "$3" "$2"
  fi
}

# Line 1: nametag, project, route (branch), EXP (tokens in and out), effort as a level on the right
RED=$(fg 227 53 13); BLUE=$(fg 61 125 202)
SEP=" ${D}│${R} "
upper() { printf '%s' "$1" | tr '[:lower:]' '[:upper:]'; }
case "$effort" in
  low) LV=$(fg 72 208 72) ;;
  medium) LV=$(fg 61 125 202) ;;
  high) LV=$(fg 248 184 0) ;;
  xhigh) LV=$(fg 240 128 48) ;;
  max) LV=$(fg 248 88 88) ;;
  *) LV="" ;;
esac

line1="${B}▶ $(upper "$model")${R}"
[ -n "$project_name" ] && line1="${line1}${SEP}${RED}◓${R} ${project_name}"
[ -n "$git_branch" ] && line1="${line1}${SEP}🚩 ${D}ROUTE${R} ${B}${git_branch}${R}"
line1="${line1}${SEP}${BLUE}${B}EXP${R} ↑${input_fmt} ↓${output_fmt}"
if [ -n "$effort" ]; then
  line1=$(right_align "$line1" "${LV}★${R} ${B}Lv.${R}${LV}${B}$(upper "$effort")${R}" "$SEP")
fi

# Line 2: HP = context remaining; the bar drains as the window fills
hp_pill="$(bg 248 184 0)$(fg 40 40 40)${B} HP ${R}"
rem=0
[ -n "$pct" ] && rem=$(( 20 - pct * 20 / 100 ))
bar="$(hp_fg)$(rep ▰ "$rem")${R}${D}$(rep ▱ $(( 20 - rem )))${R}"
if [ -n "$pct" ]; then
  left=$(( ctx_size - current_input ))
  [ "$left" -lt 0 ] && left=0
  line2="${hp_pill} ${bar} ${B}$(format_k "$left")${R}${D}/${total_k}${R}"
else
  line2="${hp_pill} ${bar} ${D}--/--${R}"
fi
[ -n "$elapsed" ] && line2="${line2}${SEP}⌛ ${B}$(dur_dhm "$elapsed")${R}"

printf '%s\n%s' "$line1" "$line2"
