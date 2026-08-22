export interface FilePatch {
  path: string;
  content: string;
  mode: "write" | "create";
}

export interface FeatureSpec {
  key: string;
  title: string;
  keywords: string[];
  requirements: { key: string; text: string; mandatory: boolean }[];
  crew: Array<
    | "architecture-lead"
    | "researcher"
    | "backend-engineer"
    | "frontend-engineer"
    | "test-engineer"
    | "browser-verifier"
    | "security-reviewer"
    | "final-verifier"
  >;
  files: FilePatch[];
  testsToRun: string[];
  decisions: { question: string; choice: string; options: string[] }[];
}
