export const metadata = {
  title: 'TSLA AI Agent · Young Oh',
  description: '한국투자증권 테슬라 AI 자동매매 분석',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, padding: 0, background: '#08080f' }}>{children}</body>
    </html>
  )
}
