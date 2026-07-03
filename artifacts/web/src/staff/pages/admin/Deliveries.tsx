import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageBody, PageHeader } from "../../StaffShell";

const TAB_STORAGE_KEY = "admin-deliveries-tab";

type DeliveriesTab = "local" | "direct-ship" | "completed";

function initialTab(): DeliveriesTab {
  if (typeof window === "undefined") return "local";
  const stored = window.sessionStorage.getItem(TAB_STORAGE_KEY);
  if (stored === "local" || stored === "direct-ship" || stored === "completed") {
    return stored;
  }
  return "local";
}

export default function Deliveries() {
  const [tab, setTab] = useState<DeliveriesTab>(initialTab);

  function handleTabChange(value: string) {
    const next = value as DeliveriesTab;
    setTab(next);
    window.sessionStorage.setItem(TAB_STORAGE_KEY, next);
  }

  return (
    <>
      <PageHeader title="Deliveries" />
      <PageBody>
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="local">Local Deliveries</TabsTrigger>
            <TabsTrigger value="direct-ship">Direct Ship</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
          <TabsContent value="local" className="mt-4">
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center">
              <div className="text-slate-500 text-sm">
                Local Deliveries table coming soon.
              </div>
            </div>
          </TabsContent>
          <TabsContent value="direct-ship" className="mt-4">
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center">
              <div className="text-slate-500 text-sm">
                Direct Ship table coming soon.
              </div>
            </div>
          </TabsContent>
          <TabsContent value="completed" className="mt-4">
            <div className="bg-white border border-slate-200 rounded-md p-12 text-center">
              <div className="text-slate-500 text-sm">
                Completed deliveries table coming soon.
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
