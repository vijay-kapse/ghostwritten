import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  // data/ and scanner/ live next to web/ in the repo; trace them into serverless bundles that read them.
  outputFileTracingRoot: path.join(__dirname, ".."),
  outputFileTracingIncludes: {
    "/r/[owner]/[repo]": ["../data/repos/**/*"],
  },
  poweredByHeader: false,
};

export default config;
