import type { ToolName } from "./policy.ts";
import { AJ_ERR } from "./errors.ts";
import { capabilityForTool, type CapabilityName } from "./capability.ts";

export interface ToolRegistration {
  toolId: ToolName;
  version: string;
  requiredCapability: CapabilityName;
  network: boolean;
  filesystem: boolean;
}

const REGISTRY: Record<ToolName, ToolRegistration> = {
  "fs.read": { toolId: "fs.read", version: "1.0.0", requiredCapability: "FILE_READ", network: false, filesystem: true },
  "fs.write": { toolId: "fs.write", version: "1.0.0", requiredCapability: "FILE_WRITE", network: false, filesystem: true },
  "fs.list": { toolId: "fs.list", version: "1.0.0", requiredCapability: "FILE_READ", network: false, filesystem: true },
  "term.exec": { toolId: "term.exec", version: "1.0.0", requiredCapability: "TERMINAL_EXEC", network: false, filesystem: true },
  "git.worktree": { toolId: "git.worktree", version: "1.0.0", requiredCapability: "GIT", network: false, filesystem: true },
  "git.merge": { toolId: "git.merge", version: "1.0.0", requiredCapability: "GIT", network: false, filesystem: true },
  "test.run": { toolId: "test.run", version: "1.0.0", requiredCapability: "TERMINAL_EXEC", network: false, filesystem: true },
  "knowledge.scan": { toolId: "knowledge.scan", version: "1.0.0", requiredCapability: "FILE_READ", network: false, filesystem: true },
  "browser.navigate": { toolId: "browser.navigate", version: "1.0.0", requiredCapability: "BROWSER", network: true, filesystem: false },
  "browser.snapshot": { toolId: "browser.snapshot", version: "1.0.0", requiredCapability: "BROWSER", network: false, filesystem: false },
  "browser.click": { toolId: "browser.click", version: "1.0.0", requiredCapability: "BROWSER", network: false, filesystem: false },
  "browser.type": { toolId: "browser.type", version: "1.0.0", requiredCapability: "BROWSER", network: false, filesystem: false },
  "browser.scroll": { toolId: "browser.scroll", version: "1.0.0", requiredCapability: "BROWSER", network: false, filesystem: false },
  "browser.screenshot": { toolId: "browser.screenshot", version: "1.0.0", requiredCapability: "BROWSER", network: false, filesystem: false },
  "mcp.call": { toolId: "mcp.call", version: "1.0.0", requiredCapability: "NETWORK", network: true, filesystem: false },
  "mcp.invoke": { toolId: "mcp.invoke", version: "1.0.0", requiredCapability: "NETWORK", network: true, filesystem: false },
  "mcp.discover": { toolId: "mcp.discover", version: "1.0.0", requiredCapability: "NETWORK", network: true, filesystem: false },
  "secret.read": { toolId: "secret.read", version: "1.0.0", requiredCapability: "SECRET_READ", network: false, filesystem: false },
  "secret.request": { toolId: "secret.request", version: "1.0.0", requiredCapability: "SECRET_USE", network: false, filesystem: false },
  "secret.revoke": { toolId: "secret.revoke", version: "1.0.0", requiredCapability: "SECRET_READ", network: false, filesystem: false },
  "net.fetch": { toolId: "net.fetch", version: "1.0.0", requiredCapability: "NETWORK", network: true, filesystem: false },
  "rewind.self": { toolId: "rewind.self", version: "1.0.0", requiredCapability: "GIT", network: false, filesystem: true },
};

export function lookupTool(id: string): ToolRegistration | { unknown: true; code: string } {
  if (id in REGISTRY) return REGISTRY[id as ToolName];
  return { unknown: true, code: AJ_ERR.CAPABILITY_UNAVAILABLE };
}

export function toolCapability(id: ToolName): CapabilityName {
  return capabilityForTool(id);
}
