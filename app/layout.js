import "./globals.css";

export const metadata = {
  title: "이름 빙고",
  description: "다 함께 즐기는 실시간 이름 빙고 게임",
};

// 다크모드 브라우저가 색을 임의로 뒤집지 않도록 밝은 테마로 고정한다
export const viewport = {
  colorScheme: "light",
  themeColor: "#cdebd2",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
