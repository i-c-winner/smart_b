import { http } from "@/shared/api/http";
import type { LoginPayload, LoginResponse, RegisterPayload } from "@/shared/types/auth";
import type { User } from "@/shared/types/domain";

export function register(payload: RegisterPayload): Promise<User> {
  return http<User>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function login(payload: LoginPayload): Promise<LoginResponse> {
  return http<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function me(token: string): Promise<User> {
  return http<User>("/auth/me", undefined, token);
}
