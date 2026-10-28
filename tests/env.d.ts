declare module 'cloudflare:workers' {
  interface ProvidedEnv extends Env {
    ADMIN_PASSWORD: string;
  }
}
