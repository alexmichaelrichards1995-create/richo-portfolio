export const metadata = {
  title: 'R.I.C.H.O. PayCore',
  description: 'R.I.C.H.O. secure PayCore checkout service.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-AU">
      <body style={{
        margin: 0,
        fontFamily: 'Inter, system-ui, sans-serif',
        background: '#f8fafc',
        color: '#101828',
      }}>
        {children}
      </body>
    </html>
  );
}
