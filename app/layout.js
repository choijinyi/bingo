import "./globals.css";

export const metadata = {
  title: "이름 빙고",
  description: "다 함께 즐기는 실시간 이름 빙고 게임",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
