/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable the App Router client-side segment cache so stale RSC payloads
  // do not accumulate and cause navigation to silently do nothing after a
  // page has been open for a few minutes.
  // staleTimes is experimental but confirmed present in Next.js 16.2.x.
  // dynamic: 0 = never serve a cached segment without re-validating with
  // the server. static: 0 = same for statically-generated routes.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  // Exclude headshots from serverless function bundles
  // They're stored in Supabase Storage and do not need to be in the deployment
  outputFileTracingExcludes: {
    '*': ['public/headshots/**/*', '**/headshots/**/*'],
  },
}

nextConfig.redirects = async () => [
  {
    source: '/pay/retainer',
    destination: 'https://payload.com/pay/12iNY7p4qZuJenrf8bKrHONnvdSj4WTxngsSaI1IPIBQJN',
    permanent: false,
  },
  {
    source: '/pay/commission',
    destination: 'https://payload.com/pay/12iNY7qfPjXchPl8UUkuFEJ4k3ftqgmmlKY8TwrFz27KKH',
    permanent: false,
  },
  {
    source: '/onboarding-checklist',
    destination: '/agent/checklist',
    permanent: false,
  },
]

module.exports = nextConfig
