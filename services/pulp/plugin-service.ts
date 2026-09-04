import { readApiDetail } from "./http";
import type { PulpPluginDescriptor } from "@/lib/pulp-plugins";

const PLUGINS_PATH = "/api/pulp/plugins";

export const pulpPluginService = {
  async list(): Promise<PulpPluginDescriptor[]> {
    const response = await fetch(PLUGINS_PATH);
    if (!response.ok) {
      throw new Error(await readApiDetail(response));
    }

    return (await response.json()) as PulpPluginDescriptor[];
  },
};
