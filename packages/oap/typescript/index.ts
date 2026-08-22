export const OAP_VERSION = "1.0.0";

export interface OapManifest {
  name: string;
  version: string;
  capabilities: Array<"fs.read" | "fs.write" | "term.exec" | "net.fetch" | "secret.request">;
  cannotCertify: true;
  languages?: string[];
}

export function assertCannotCertify(manifest: OapManifest): void {
  if (manifest.cannotCertify !== true) {
    throw new Error("OAP worker must set cannotCertify: true");
  }
}
