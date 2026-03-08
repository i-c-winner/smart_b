"use client";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import type { Shadows } from "@mui/material/styles";
import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from "react";

type AppThemeMode = "light" | "dark";

type ThemeModeContextValue = {
  mode: AppThemeMode;
  toggleMode: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function useAppThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error("useAppThemeMode must be used within MuiProvider");
  }
  return context;
}

export function MuiProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<AppThemeMode>("dark");

  useEffect(() => {
    const storedMode = localStorage.getItem("app-theme-mode");
    if (storedMode === "light" || storedMode === "dark") {
      setMode(storedMode);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme-mode", mode);
  }, [mode]);

  const toggleMode = () => {
    setMode((currentMode) => {
      const nextMode = currentMode === "light" ? "dark" : "light";
      localStorage.setItem("app-theme-mode", nextMode);
      return nextMode;
    });
  };

  const theme = useMemo(() => {
    const isDark = mode === "dark";
    return createTheme({
      palette: {
        mode,
        primary: { main: isDark ? "#79c0ff" : "#0f6fff" },
        secondary: { main: isDark ? "#ffd166" : "#2f5f98" },
        background: {
          default: isDark ? "#05070b" : "#f3f6fb",
          paper: isDark ? "#0f1520" : "#ffffff"
        },
        text: {
          primary: isDark ? "#ffffff" : "#102235",
          secondary: isDark ? "#d5dfef" : "#5b6c82"
        },
        divider: isDark ? "#4f607a" : "#d8e0ea"
      },
      shape: {
        borderRadius: 8
      },
      typography: {
        fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif"
      },
      shadows: Array(25).fill("none") as Shadows,
      components: {
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundImage: "none"
            }
          }
        },
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundImage: "none"
            }
          }
        }
      }
    });
  }, [mode]);

  return (
    <ThemeModeContext.Provider value={{ mode, toggleMode }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
