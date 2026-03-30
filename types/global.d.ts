import { TokenPayload } from "@/lib/token-utils";

declare module "next-auth" {
  interface Session {
    idTokenPayload?: TokenPayload | null;
    idTokenPreview?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    idToken?: string;
    accessToken?: string;
  }
}
