import "./globals.css";
import type { Metadata } from "next";
import { ToastProvider } from "@/components/Toast";
import { BlogJobProvider } from "@/components/BlogJobContext";

export const metadata: Metadata = {
  title: "automake-youtube · 관리자",
  description: "유튜브 자동화 파이프라인 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <ToastProvider>
         <BlogJobProvider>
          <div className="min-h-screen">
            <header className="border-b border-line bg-panel/60 backdrop-blur">
              <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="text-xs text-subtext uppercase tracking-widest">automake-youtube</div>
                  <h1 className="text-xl font-bold">관리자 대시보드</h1>
                </div>
                <div className="text-xs text-subtext mono">localhost:3000 · 로컬 전용</div>
              </div>
            </header>
            <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
          </div>
         </BlogJobProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
