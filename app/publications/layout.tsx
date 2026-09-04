import { ReactNode } from "react";
import { PulpAuthProvider } from "@/components/pulp/auth-context";
import { PulpPluginsProvider } from "@/components/pulp/plugins-context";

export default function PublicationsLayout({ children }: { children: ReactNode }) {
  return (
    <PulpAuthProvider>
      <PulpPluginsProvider>{children}</PulpPluginsProvider>
    </PulpAuthProvider>
  );
}
