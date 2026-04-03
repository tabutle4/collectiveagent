#!/bin/bash
# Run this from INSIDE the crc_update folder:
#   cd crc_update && bash install.sh /workspaces/collectiveagent

REPO="$1"

if [ -z "$REPO" ]; then
  echo "Usage: bash install.sh /path/to/your/repo"
  echo "Example: bash install.sh /workspaces/collectiveagent"
  exit 1
fi

if [ ! -d "$REPO" ]; then
  echo "Error: $REPO does not exist"
  exit 1
fi

echo "Installing into: $REPO"
echo ""

copy() {
  local src="$1"
  local dest="$REPO/$1"
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
  echo "  OK: $1"
}

copy "middleware.ts"
copy "lib/email.ts"
copy "app/onboard/[token]/page.tsx"
copy "app/api/onboarding/route.ts"
copy "app/api/onboarding/sign-document/route.ts"
copy "app/api/onboarding/acknowledge-step/route.ts"
copy "app/api/admin/sign-document/route.ts"
copy "app/api/checklist/send-completion-notification/route.ts"
copy "app/api/contact/route.ts"
copy "app/api/payments/process-onboarding/route.ts"
copy "app/api/cron/send-onboarding-followup/route.ts"
copy "app/api/prospects/resend-link/route.ts"
copy "app/admin/onboarding/page.tsx"
copy "app/admin/prospects/page.tsx"
copy "app/agent/checklist/page.tsx"
copy "app/prospective-agent-form/success/page.tsx"

echo ""
echo "Done. 16 files installed."
