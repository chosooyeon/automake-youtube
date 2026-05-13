/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "@napi-rs/canvas", "sharp"],
  },
  // 대시보드는 로컬 전용. 외부 호스팅 안 함.
  output: "standalone",
};

export default nextConfig;
