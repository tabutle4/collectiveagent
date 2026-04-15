#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Deploying calendar reminder cron..."

# New file
mkdir -p "$REPO_ROOT/app/api/cron/calendar-reminders"
cp "$SCRIPT_DIR/app/api/cron/calendar-reminders/route.ts" "$REPO_ROOT/app/api/cron/calendar-reminders/route.ts"

# Modified files
cp "$SCRIPT_DIR/lib/email.ts" "$REPO_ROOT/lib/email.ts"
cp "$SCRIPT_DIR/vercel.json" "$REPO_ROOT/vercel.json"

echo "Done. 3 files deployed:"
echo "  + app/api/cron/calendar-reminders/route.ts (new)"
echo "  ~ lib/email.ts (sendCalendarReminderEmail added)"
echo "  ~ vercel.json (cron schedule added)"
