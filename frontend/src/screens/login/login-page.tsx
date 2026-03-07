"use client";

import { Box, CircularProgress, Container, Stack, Typography } from "@mui/material";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { LoginForm } from "@/features/auth/login/login-form";
import { useAuth } from "@/shared/lib/auth/auth-context";

export function LoginPage() {
  const router = useRouter();
  const { token, loading } = useAuth();

  useEffect(() => {
    if (!loading && token) {
      router.replace("/");
    }
  }, [loading, token, router]);

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CircularProgress size={20} />
          <Typography>Loading session...</Typography>
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h4">Login</Typography>
          <Typography color="text.secondary">Sign in to access dashboard.</Typography>
        </Box>
        <LoginForm />
      </Stack>
    </Container>
  );
}

export default LoginPage;
