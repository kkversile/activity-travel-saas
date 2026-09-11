interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEMO_VENDOR_EMAIL?: string;
  readonly VITE_DEMO_VENDOR_PASSWORD?: string;
  readonly VITE_DEMO_ADMIN_EMAIL?: string;
  readonly VITE_DEMO_ADMIN_PASSWORD?: string;
  readonly VITE_DEMO_AGENT_EMAIL?: string;
  readonly VITE_DEMO_AGENT_PASSWORD?: string;
  readonly PROD: boolean;
}
interface ImportMeta { readonly env: ImportMetaEnv }
