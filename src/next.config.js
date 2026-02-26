/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["@electric-sql/pglite"],
  },
};

module.exports = nextConfig;
