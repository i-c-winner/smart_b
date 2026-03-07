"use client";

import { Button } from "@mui/material";
import { useRouter } from "next/navigation";
import { useAuth } from "@/shared/lib/auth/auth-context";

export function LogoutButton() {
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <Button
      color="inherit"
      variant="outlined"
      onClick={() => {
        logout();
        router.replace("/login");
      }}
      type="button"
      size="small"
    >
      Logout
    </Button>
  );
}
