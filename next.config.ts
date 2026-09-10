import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next treats pnpm-workspace.yaml as a workspace marker and, combined with a
  // stray pnpm-lock.yaml in the home directory, was inferring C:\Users\<user>
  // as the tracing root. Pin it to this project so file tracing stays scoped.
  outputFileTracingRoot: path.resolve(import.meta.dirname),
};

export default nextConfig;
