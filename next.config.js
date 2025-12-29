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

module.exports = nextConfig
