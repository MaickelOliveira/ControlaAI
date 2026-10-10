import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  output:"standalone",
  outputFileTracingRoot:path.join(__dirname,".."),
  poweredByHeader:false,
  images:{unoptimized:true},
  async headers() { return [{source:"/(.*)",headers:[
    {key:"Content-Security-Policy",value:"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests"},
    {key:"Strict-Transport-Security",value:"max-age=31536000"},
    {key:"X-Content-Type-Options",value:"nosniff"},
    {key:"Referrer-Policy",value:"no-referrer"},
    {key:"X-Frame-Options",value:"DENY"},
    {key:"X-Robots-Tag",value:"noindex, nofollow"},
  ]}]; },
};
export default config;
