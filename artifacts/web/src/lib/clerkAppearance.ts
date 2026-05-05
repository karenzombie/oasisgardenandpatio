import { shadcn } from "@clerk/themes";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl:
      typeof window !== "undefined"
        ? `${window.location.origin}${basePath}/logo.svg`
        : "/logo.svg",
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "hsl(153 20% 45%)",
    colorForeground: "hsl(20 20% 20%)",
    colorMutedForeground: "hsl(20 10% 45%)",
    colorDanger: "hsl(0 84% 60%)",
    colorBackground: "hsl(0 0% 100%)",
    colorInput: "hsl(0 0% 100%)",
    colorInputForeground: "hsl(20 20% 20%)",
    colorNeutral: "hsl(40 20% 85%)",
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    borderRadius: "0.25rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-card border border-border shadow-sm rounded-sm w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle:
      "font-serif text-3xl md:text-4xl font-medium tracking-tight text-foreground",
    headerSubtitle: "text-sm text-muted-foreground leading-relaxed mt-2",
    socialButtonsBlockButton:
      "border border-border hover:bg-muted/40 transition-colors text-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-sm font-medium text-foreground",
    formFieldInput:
      "border border-input bg-card text-foreground rounded-sm focus:ring-2 focus:ring-ring",
    formButtonPrimary:
      "bg-primary text-primary-foreground hover:bg-primary/90 rounded-none font-serif tracking-wide",
    footerActionLink: "text-primary hover:underline font-medium",
    footerActionText: "text-muted-foreground",
    dividerLine: "bg-border",
    dividerText: "text-muted-foreground text-xs uppercase tracking-wider",
    identityPreviewEditButton: "text-primary hover:underline",
    formFieldSuccessText: "text-primary",
    alertText: "text-foreground",
    alert: "border border-border bg-muted/40 text-foreground",
    otpCodeFieldInput: "border border-input bg-card text-foreground",
    formFieldRow: "space-y-2",
    main: "space-y-5",
    logoBox: "flex justify-center mb-2",
    logoImage: "h-10 w-auto",
  },
};
