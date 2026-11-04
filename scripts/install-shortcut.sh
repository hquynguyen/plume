#!/usr/bin/env bash
# Adds a GNOME custom shortcut that runs `plume --toggle`.
# Usage: install-shortcut.sh [binding]   e.g. install-shortcut.sh '<Super><Alt>t'
set -euo pipefail

binding="${1:-<Super><Alt>f}"
command="plume --toggle"
schema="org.gnome.settings-daemon.plugins.media-keys"
base="/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings"
path="$base/plume/"
item="$schema.custom-keybinding:$path"

current="$(gsettings get "$schema" custom-keybindings)"
if [[ "$current" != *"$path"* ]]; then
  if [[ "$current" == "@as []" || "$current" == "[]" ]]; then
    updated="['$path']"
  else
    updated="${current%]}, '$path']"
  fi
  gsettings set "$schema" custom-keybindings "$updated"
fi

gsettings set "$item" name "Plume"
gsettings set "$item" command "$command"
gsettings set "$item" binding "$binding"

echo "Shortcut set: $binding -> $command"
echo "Change it in Settings > Keyboard > View and Customize Shortcuts > Custom Shortcuts."
