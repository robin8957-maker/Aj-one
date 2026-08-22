import type { IsoDate } from "./index.ts";

export type ConnectionFamily = "model" | "local" | "cloud" | "scm";

export type ConnectionVendor =
  | "aj-local"
  | "ollama"
  | "lmstudio"
  | "xai"
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "groq"
  | "azure-openai"
  | "aws-bedrock"
  | "deepseek"
  | "cohere"
  | "openrouter"
  | "together"
  | "fireworks"
  | "huggingface"
  | "github"
  | "gitlab"
  | "azure"
  | "aws"
  | "gcp"
  | "vercel"
  | "cloudflare"
  | "digitalocean";

export type ConnectionStatus = "ready" | "disconnected" | "error" | "denied" | "probing";

export interface ConnectionRecord {
  connectionId: string;
  family: ConnectionFamily;
  vendor: ConnectionVendor;
  title: string;
  blurb: string;
  status: ConnectionStatus;
  enabled: boolean;
  endpoint?: string;
  secretName?: string;
  lastProbeAt?: IsoDate;
  lastError?: string;
  capabilities: string[];
}

export interface ConnectorCatalogItem {
  vendor: ConnectionVendor;
  family: ConnectionFamily;
  title: string;
  blurb: string;
  defaultEndpoint?: string;
  secretName?: string;
  capabilities: string[];
  local: boolean;
}

export const CONNECTOR_CATALOG: ConnectorCatalogItem[] = [
  {
    vendor: "aj-local",
    family: "local",
    title: "AJ Local Governor",
    blurb: "Always on. The planner. Models never become the OS.",
    capabilities: ["plan", "code", "judge"],
    local: true,
  },
  {
    vendor: "ollama",
    family: "local",
    title: "Ollama",
    blurb: "Local models on this machine.",
    defaultEndpoint: "http://127.0.0.1:11434/api/tags",
    capabilities: ["local-llm"],
    local: true,
  },
  {
    vendor: "lmstudio",
    family: "local",
    title: "LM Studio",
    blurb: "Local OpenAI-compatible server.",
    defaultEndpoint: "http://127.0.0.1:1234/v1/models",
    capabilities: ["local-llm"],
    local: true,
  },
  {
    vendor: "xai",
    family: "model",
    title: "xAI Grok",
    blurb: "Optional engine. Never auto-selected. Requires AJ_USE_GROK=1.",
    secretName: "provider.xai",
    capabilities: ["reasoning", "vision"],
    local: false,
  },
  {
    vendor: "openai",
    family: "model",
    title: "OpenAI",
    blurb: "Optional GPT engine. Explicit grant only.",
    secretName: "provider.openai",
    capabilities: ["reasoning", "code"],
    local: false,
  },
  {
    vendor: "anthropic",
    family: "model",
    title: "Anthropic",
    blurb: "Optional Claude engine. Explicit grant only.",
    secretName: "provider.anthropic",
    capabilities: ["reasoning", "code"],
    local: false,
  },
  {
    vendor: "google",
    family: "model",
    title: "Google Gemini",
    blurb: "Optional Gemini engine.",
    secretName: "provider.google",
    capabilities: ["reasoning", "vision"],
    local: false,
  },
  {
    vendor: "mistral",
    family: "model",
    title: "Mistral",
    blurb: "Optional Mistral engine.",
    secretName: "provider.mistral",
    capabilities: ["reasoning"],
    local: false,
  },
  {
    vendor: "groq",
    family: "model",
    title: "Groq",
    blurb: "Optional fast inference.",
    secretName: "provider.groq",
    capabilities: ["reasoning"],
    local: false,
  },
  {
    vendor: "azure-openai",
    family: "model",
    title: "Azure OpenAI",
    blurb: "Enterprise model endpoint.",
    secretName: "provider.azure-openai",
    defaultEndpoint: "https://cognitiveservices.azure.com",
    capabilities: ["reasoning", "enterprise"],
    local: false,
  },
  {
    vendor: "aws-bedrock",
    family: "model",
    title: "AWS Bedrock",
    blurb: "Amazon Bedrock model runtime.",
    secretName: "provider.aws-bedrock",
    capabilities: ["reasoning", "enterprise"],
    local: false,
  },
  {
    vendor: "deepseek",
    family: "model",
    title: "DeepSeek",
    blurb: "Optional reasoning/code engine.",
    secretName: "provider.deepseek",
    capabilities: ["reasoning", "code"],
    local: false,
  },
  {
    vendor: "cohere",
    family: "model",
    title: "Cohere",
    blurb: "Optional enterprise LLM.",
    secretName: "provider.cohere",
    capabilities: ["reasoning"],
    local: false,
  },
  {
    vendor: "openrouter",
    family: "model",
    title: "OpenRouter",
    blurb: "Optional multi-model gateway.",
    secretName: "provider.openrouter",
    capabilities: ["reasoning", "code", "vision"],
    local: false,
  },
  {
    vendor: "together",
    family: "model",
    title: "Together AI",
    blurb: "Optional open-weight hosting.",
    secretName: "provider.together",
    capabilities: ["reasoning", "code"],
    local: false,
  },
  {
    vendor: "fireworks",
    family: "model",
    title: "Fireworks",
    blurb: "Optional fast open models.",
    secretName: "provider.fireworks",
    capabilities: ["reasoning"],
    local: false,
  },
  {
    vendor: "huggingface",
    family: "model",
    title: "Hugging Face",
    blurb: "Optional inference endpoints.",
    secretName: "provider.huggingface",
    capabilities: ["reasoning"],
    local: false,
  },
  {
    vendor: "github",
    family: "scm",
    title: "GitHub",
    blurb: "Issues, PRs, and signed ingress. Never a raw webhook to runtime.",
    secretName: "provider.github",
    capabilities: ["repo", "webhook"],
    local: false,
  },
  {
    vendor: "gitlab",
    family: "scm",
    title: "GitLab",
    blurb: "Repo and CI ingress through policy.",
    secretName: "provider.gitlab",
    capabilities: ["repo", "webhook"],
    local: false,
  },
  {
    vendor: "azure",
    family: "cloud",
    title: "Microsoft Azure",
    blurb: "Cloud subscription for future remote computers.",
    secretName: "cloud.azure",
    capabilities: ["vm", "storage"],
    local: false,
  },
  {
    vendor: "aws",
    family: "cloud",
    title: "Amazon Web Services",
    blurb: "Cloud subscription for future remote computers.",
    secretName: "cloud.aws",
    capabilities: ["vm", "storage"],
    local: false,
  },
  {
    vendor: "gcp",
    family: "cloud",
    title: "Google Cloud",
    blurb: "Cloud subscription for future remote computers.",
    secretName: "cloud.gcp",
    capabilities: ["vm", "storage"],
    local: false,
  },
  {
    vendor: "vercel",
    family: "cloud",
    title: "Vercel",
    blurb: "Deploy target when one exists. /deploy stays refused until granted.",
    secretName: "cloud.vercel",
    capabilities: ["deploy"],
    local: false,
  },
  {
    vendor: "cloudflare",
    family: "cloud",
    title: "Cloudflare",
    blurb: "Workers and edge runtime.",
    secretName: "cloud.cloudflare",
    capabilities: ["edge", "deploy"],
    local: false,
  },
  {
    vendor: "digitalocean",
    family: "cloud",
    title: "DigitalOcean",
    blurb: "Droplets for future remote computers.",
    secretName: "cloud.digitalocean",
    capabilities: ["vm"],
    local: false,
  },
];
