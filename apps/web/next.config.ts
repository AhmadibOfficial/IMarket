import type { NextConfig } from 'next';
// Keep full type checking through the compiler API: local CLI output capture can be unavailable.
const nextConfig: NextConfig = { reactStrictMode: true, experimental: { useTypeScriptCli: false } };
export default nextConfig;
