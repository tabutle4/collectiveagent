/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exclude headshots from serverless function bundles
  // They're stored in Supabase Storage and don't need to be in the deployment
  outputFileTracingExcludes: {
    '*': [
      'public/headshots/**/*',
      '**/headshots/**/*',
    ],
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
]

module.exports = nextConfig
