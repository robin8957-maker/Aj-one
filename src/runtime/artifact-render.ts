/**
 * Sandboxed Micro-UI. srcdoc + allow-scripts only.
 * Never allow-same-origin — the artifact cannot read the Commander session.
 */
export const ARTIFACT_SANDBOX = "allow-scripts";

export function isUiArtifact(kind: string, content?: string): boolean {
  if (["browser", "preview", "diff"].includes(kind) && content) {
    return /<\w+|function\s+\w+\(|export default|className=/.test(content);
  }
  return Boolean(content && /<(div|button|section|html|style)\b/i.test(content));
}

export function wrapArtifactHtml(content: string): string {
  const body = content.includes("<html") ? content : `<div id="root">${content}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:"/></head><body>${body}</body></html>`;
}

export function artifactFrame(content: string): {
  srcdoc: string;
  sandbox: typeof ARTIFACT_SANDBOX;
  allowSameOrigin: false;
  readOnly: true;
} {
  return {
    srcdoc: wrapArtifactHtml(content),
    sandbox: ARTIFACT_SANDBOX,
    allowSameOrigin: false,
    readOnly: true,
  };
}

export function sandboxLeaksOrigin(sandbox: string): boolean {
  return /\ballow-same-origin\b/.test(sandbox);
}
