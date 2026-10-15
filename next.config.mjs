/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // pdfjs-dist et mammoth sont utilisés côté serveur (route /api/cv) :
  // on les garde externes pour éviter que webpack tente de les bundler.
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist", "mammoth"],
  },
};

export default nextConfig;
