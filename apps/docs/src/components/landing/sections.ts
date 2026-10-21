export interface LandingSection {
  readonly id: string;
  readonly label: string;
  readonly short: string;
}

export const LANDING_SECTIONS: readonly LandingSection[] = [
  { id: "routing", label: "File routing", short: "Routing" },
  { id: "streaming", label: "Streaming SSR", short: "Streaming" },
  { id: "actions", label: "Server actions", short: "Actions" },
  { id: "contract", label: "One contract", short: "Deploy" },
  { id: "security", label: "Secure by default", short: "Security" },
  { id: "runtime", label: "Rust/V8 runtime", short: "Runtime" },
  { id: "agents", label: "For agents", short: "Agents" },
];
