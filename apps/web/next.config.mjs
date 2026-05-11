/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@gigs/shared'],
  webpack: (config) => {
    // The shared package uses .js extensions for TypeScript ESM imports (e.g. '../constants/index.js').
    // Webpack needs to know to also check .ts/.tsx when encountering .js imports from transpiled packages.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
