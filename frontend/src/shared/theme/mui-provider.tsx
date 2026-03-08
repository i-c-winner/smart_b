"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { PropsWithChildren, useMemo } from "react";

export function MuiProvider({ children }: PropsWithChildren) {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "light",
          primary: { main: "#0f6fff" },
          secondary: { main: "#2f5f98" },
          background: { default: "#f3f6fb", paper: "#ffffff" }
        },
        shape: {
          borderRadius: 10
        },
        typography: {
          fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif"
        }
      }),
    []
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
