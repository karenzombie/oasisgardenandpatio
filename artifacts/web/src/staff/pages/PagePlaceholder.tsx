import { PageBody, PageHeader } from "../StaffShell";

interface PagePlaceholderProps {
  title: string;
  subtitle?: string;
  comingIn?: string;
}

export function PagePlaceholder({ title, subtitle, comingIn }: PagePlaceholderProps) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageBody>
        <div className="bg-white border border-slate-200 rounded-md p-12 text-center">
          <div className="text-slate-500 text-sm">
            {comingIn
              ? `This module is being built — content lands in ${comingIn}.`
              : "This module will be implemented soon."}
          </div>
        </div>
      </PageBody>
    </>
  );
}
