import type { Metadata } from 'next'
import { Montserrat, Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/context/AuthContext'

const montserrat = Montserrat({ 
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['100', '200', '300', '400', '500', '600', '700'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Collective Agent - Collective Realty Co.',
  description: 'Join Collective Realty Co. - The Coaching Brokerage',
  icons: {
    icon: [
      { url: '/favicon-16.png', type: 'image/png', sizes: '16x16' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-64.png', type: 'image/png', sizes: '64x64' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#ffffff" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Collective Agent" />
      </head>
      <body className={`${montserrat.className} ${inter.variable}`} suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}