/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@tensorflow/tfjs-node', 'onnxruntime-node', 'sharp', 'canvas'],
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    } else {
      config.externals = [
        ...(config.externals || []),
        '@tensorflow/tfjs-node',
        'onnxruntime-node',
        'sharp',
        'canvas',
      ];
    }
    return config;
  },
};

module.exports = nextConfig;