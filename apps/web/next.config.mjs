/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gigs/shared'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
