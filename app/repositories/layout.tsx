import { ReactNode, Suspense } from "react";
import { PulpAuthProvider } from "@/components/pulp/auth-context";
import { PulpPluginsProvider } from "@/components/pulp/plugins-context";

export default function RepositoriesLayout({ children }: { children: ReactNode }) {
  return (
    <PulpAuthProvider>
      <PulpPluginsProvider>
        <Suspense fallback={null}>{children}</Suspense>
      </PulpPluginsProvider>
    </PulpAuthProvider>
  );
}
