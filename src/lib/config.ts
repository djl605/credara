function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  get databaseUrl() {
    return requireEnv("DATABASE_URL");
  },
  get sessionSecret() {
    return requireEnv("SESSION_SECRET");
  },
  get port() {
    return Number(process.env.PORT) || 8080;
  },
  get corsOrigin() {
    return requireEnv("CORS_ORIGIN");
  },
};
