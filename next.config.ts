
import type {NextConfig} from 'next';
const withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development'
})


const nextConfig: NextConfig = {

  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:9002', '*.app.github.dev'],
      bodySizeLimit: '12mb', // Allow up to an 8MB image (~11MB as a base64 data URI) per upload
    },
  },

  
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
      },
      {
        protocol: 'https',
        hostname: 'i.postimg.cc',
      },
      {
        protocol: 'https',
        hostname: 'rzp.io',
      },
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default withPWA(nextConfig);
