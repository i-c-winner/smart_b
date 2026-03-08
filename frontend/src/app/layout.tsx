import type { Metadata } from "next";

import { AuthProvider } from "@/shared/lib/auth/auth-context";
import { MuiProvider } from "@/shared/theme/mui-provider";
import { AppHeader } from "@/widgets/app-header/app-header";

export const metadata: Metadata = {
  title: "SmartB Frontend",
  description: "JWT auth + users and companies overview"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MuiProvider>
          <AuthProvider>
            <AppHeader />
            {children}
          </AuthProvider>
        </MuiProvider>
      </body>
    </html>
  );
}
