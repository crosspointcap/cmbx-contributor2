import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CMBX Contributor',
  description: 'CMBX Contributor — Crosspoint Capital',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
