/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gigs/shared'],
  webpack(config) {
    // @gigs/shared uses .js extensions for internal TS imports (ESM style).
    // Teach webpack to resolve .js → .ts/.tsx/.js so the monorepo package
    // compiles correctly inside Next.js.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
