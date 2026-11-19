import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GYEOL (결) — 취향·상황·분위기 큐레이션 아카이브",
  description:
    "지금의 기분과 인생작의 결로 책·영화·드라마·웹툰을 연결하고, 서점·OTT·웹툰 플랫폼으로 바로 이어주는 큐레이션 서비스.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=JetBrains+Mono:wght@400;500&family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@500;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap"
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('gyeol-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t;}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
