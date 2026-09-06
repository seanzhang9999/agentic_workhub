#!/bin/sh
# Controls only the local viewer. Never changes the Tunnel or Feishu content.
set -eu
viewer_domain="gui/$(id -u)"
viewer_agent="$viewer_domain/com.awiki.local-viewer"
viewer_plist="${AWIKI_VIEWER_PLIST:-$HOME/Library/LaunchAgents/com.awiki.local-viewer.plist}"
case "${1:-status}" in
  start) launchctl bootstrap "$viewer_domain" "$viewer_plist" ;;
  stop) launchctl bootout "$viewer_agent" ;;
  restart|reload) launchctl kickstart -k "$viewer_agent" ;;
  status) launchctl print "$viewer_agent" | sed -n '/state = /p;/pid = /p;/last exit code = /p' ;;
  *) echo 'Usage: sh scripts/local-viewer.sh start|stop|restart|status' >&2; exit 2 ;;
esac
