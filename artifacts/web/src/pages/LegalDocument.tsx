import {
  useGetLegalDocument,
  getGetLegalDocumentQueryKey,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function LegalDocument({ type }: { type: "privacy_policy" | "terms_and_conditions" }) {
  const { data: document, isLoading } = useGetLegalDocument(type, {
    query: {
      enabled: !!type,
      queryKey: getGetLegalDocumentQueryKey(type),
    },
  });

  const title = type === "privacy_policy" ? "Privacy Policy" : "Terms & Conditions";

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
            <div className="space-y-6 text-muted-foreground leading-relaxed whitespace-pre-wrap">
              <p className="text-sm font-medium text-foreground">
                Effective Date: {new Date(document.effectiveDate).toLocaleDateString()} (Version: {document.version})
              </p>
              <div>{document.content}</div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              Document not found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
