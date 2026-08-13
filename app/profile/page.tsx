'use client'

import ProfileScreen from '@/components/profile/ProfileScreen'

/**
 * /profile  The signed-in agent's own profile.
 *
 * The screen itself lives in components/profile/ProfileScreen.tsx rather than
 * here because it takes props (userId, isAdmin) and is rendered by two other
 * pages -- /admin/users/[id] and /agent/profile. A Next.js App Router page's
 * default export may only accept PageProps, so a component with its own props
 * cannot double as a page file. `tsc --noEmit` does not catch that; only
 * `next build` does.
 */
export default function ProfilePage() {
  return <ProfileScreen />
}
