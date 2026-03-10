"use client";

import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { FormEvent, useState } from "react";

import { login, register } from "@/shared/api/auth-api";
import { useAuth } from "@/shared/lib/auth/auth-context";

export function LoginForm() {
  const { loginWithToken } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        await register({ email, full_name: fullName, password });
      }
      const result = await login({ email, password });
      await loginWithToken(result.access_token);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper component="form" onSubmit={onSubmit} variant="outlined" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h5">{mode === "login" ? "Login" : "Register"}</Typography>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
        />
        {mode === "register" && (
          <TextField
            label="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            fullWidth
          />
        )}
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Register and login"}
          </Button>
          <Button variant="outlined" type="button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Need account" : "Have account"}
          </Button>
        </Box>
      </Stack>
      <Stack spacing={1} sx={{ mt: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary"> admin Company: testadmin@test.ru </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary"> admin Project: pluhin@test.ru </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary"> member: pulkin@test.ru </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary"> member: blohin@test.ru </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" color="text.secondary"> member: petrov@test.ru </Typography>
        </Stack>
        <Typography variant="body2" color="error">Password для каждого: test</Typography>

      </Stack>
    </Paper>
  );
}
