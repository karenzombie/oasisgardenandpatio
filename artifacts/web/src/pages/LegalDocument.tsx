import { useEffect } from "react";
import {
  useGetLegalDocument,
  getGetLegalDocumentQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import ComingSoon from "@/pages/ComingSoon";

type LegalDocumentType =
  | "privacy_policy"
  | "terms_and_conditions"
  | "shipping_returns"
  | "warranty";

const TITLES: Record<LegalDocumentType, string> = {
  privacy_policy: "Privacy Policy",
  terms_and_conditions: "Terms & Conditions",
  shipping_returns: "Shipping & Returns",
  warranty: "Warranty",
};

export default function LegalDocument({ type }: { type: LegalDocumentType }) {
  const { data: document, isLoading, isError } = useGetLegalDocument(type, {
    query: {
      enabled: !!type,
      queryKey: getGetLegalDocumentQueryKey(type),
      retry: false,
    },
  });

  const title = TITLES[type];

  // When the active version has a PDF, redirect to it directly.
  // Falls through to the text renderer below for text-era rows (pdfStorageUrl absent).
  useEffect(() => {
    if (document?.pdfStorageUrl) {
      window.location.replace(document.pdfStorageUrl);
    }
  }, [document?.pdfStorageUrl]);

  if (!isLoading && (isError || !document)) {
    return <ComingSoon title={title} />;
  }

  // While redirecting to a PDF, show a neutral loading state so there is no
  // flash of the text content before the browser navigates away.
  if (document?.pdfStorageUrl) {
    return (
      <div className="w-full bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-background py-16 md:py-24">
      <div className="container mx-auto px-4 max-w-4xl">
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-medium mb-4">{title}</h1>
          <div className="h-px w-24 bg-primary/40" />
        </div>

        <div className="prose prose-stone max-w-none">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-[95%]" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-8 w-1/3 mt-8" />
              <Skeleton className="h-4 w-[90%]" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : document ? (
            <div className="space-y-6">
              <p className="text-sm font-medium text-foreground not-italic">
                Effective Date: {new Date(document.effectiveDate).toLocaleDateString()} (Version: {document.version})
              </p>
              <LegalDocumentBody content={document.content} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LegalDocumentBody({ content }: { content: string }) {
  const blocks = content.split(/\n\s*\n/).filter((block) => block.trim().length > 0);

  return (
    <div className="space-y-5 text-muted-foreground leading-relaxed">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        const isHeading = /^\d+(\.\d+)?\.\s+\S/.test(trimmed) && !trimmed.includes("\n");
        if (isHeading) {
          return (
            <h2 key={i} className="text-foreground font-serif text-xl md:text-2xl mt-10 first:mt-0 mb-2">
              {trimmed}
            </h2>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
