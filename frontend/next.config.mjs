/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ADD THIS WEBPACK CONFIGURATION
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false, // Tells webpack to ignore 'fs' module
      encoding: false, // Often needed alongside fs
    };
    return config;
  },
};

export default nextConfig;