"use client";

import { AppBar, Box, Button, Chip, Toolbar, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";

import { LogoutButton } from "@/features/auth/logout/logout-button";
import { getCompanies, getCompanyUsersWithRoles, getProjectUsers, getProjects } from "@/shared/api/domain-api";
import { useAuth } from "@/shared/lib/auth/auth-context";

export function AppHeader() {
  const { currentUser, token, loading } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const [settingsLabel, setSettingsLabel] = useState("Settings");
  const [settingsHref, setSettingsHref] = useState("/settings");

  useEffect(() => {
    if (!token || !currentUser) {
      setShowSettings(false);
      setSettingsLabel("Settings");
      setSettingsHref("/settings");
      return;
    }

    let active = true;
    const detectManager = async () => {
      setShowSettings(false);
      setSettingsLabel("Settings");
      setSettingsHref("/settings");
      const companies = await getCompanies(token).catch(() => []);
      for (const company of companies) {
        const companyUsers = await getCompanyUsersWithRoles(token, company.id).catch(() => []);
        const isCompanyAdmin = companyUsers.some(
          (user) => user.id === currentUser.id && user.role === "company_admin"
        );
        if (isCompanyAdmin) {
          if (!active) return;
          setShowSettings(true);
          setSettingsLabel("Settings company");
          setSettingsHref("/settings");
          return;
        }
        const projects = await getProjects(token, company.id).catch(() => []);
        for (const project of projects) {
          const projectUsers = await getProjectUsers(token, project.id).catch(() => []);
          const isManager = projectUsers.some(
            (user) => user.id === currentUser.id && user.role === "project_manager"
          );
          if (isManager) {
            if (!active) return;
            setShowSettings(true);
            setSettingsLabel("Settings project");
            setSettingsHref("/settings/projects");
            return;
          }
        }
      }
    };

    detectManager();
    return () => {
      active = false;
    };
  }, [token, currentUser]);

  return (
    <AppBar position="sticky" color="default" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
      <Toolbar sx={{ maxWidth: 1280, width: "100%", mx: "auto", px: { xs: 1.5, md: 3 }, gap: 1.5 }}>
        <Typography
          component={Link}
          href="/"
          variant="h6"
          sx={{ textDecoration: "none", color: "text.primary", fontWeight: 700 }}
        >
          SmartB
        </Typography>
        <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
          <Button component={Link} href="/" variant="outlined" size="small" color="inherit">
            Home
          </Button>
          {showSettings && (
            <Button component={Link} href={settingsHref} variant="outlined" size="small" color="inherit">
              {settingsLabel}
            </Button>
          )}
          <Chip
            size="small"
            color="default"
            label={loading ? "Loading..." : currentUser ? currentUser.full_name : "Guest"}
            variant="outlined"
          />
          {token ? (
            <LogoutButton />
          ) : (
            <Button component={Link} href="/login" variant="outlined" size="small" color="inherit">
              Login
            </Button>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
