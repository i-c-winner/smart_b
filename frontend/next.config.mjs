/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const internalApiBase = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${internalApiBase}/api/v1/:path*`
      }
    ];
  }
};

export default nextConfig;
