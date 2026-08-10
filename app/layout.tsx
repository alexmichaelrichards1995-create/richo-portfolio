import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'R.I.C.H.O. Systems',
  description: 'Research Intelligence & Continuous Heuristic Optimisation',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
