"use client";

type Embed = {
  title: string;
  src: string;
};

const embeds: Embed[] = [
  {
    title: "FastAPI Counter 1",
    src: "http://localhost:3100/d-solo/adc9f7n/fast-api-counter?orgId=1&from=1765970424625&to=1765981224625&timezone=browser&panelId=panel-2&__feature.dashboardSceneSolo=true",
  },
  {
    title: "FastAPI Counter 2",
    src: "http://localhost:3100/d-solo/adc9f7n/fast-api-counter?orgId=1&from=1765970424625&to=1765981224625&timezone=browser&panelId=panel-2&__feature.dashboardSceneSolo=true",
  },
  {
    title: "Cloud SQL panel 4",
    src: "http://localhost:3100/d-solo/06698db1-c460-4ef1-8b7e-3de5e019fd50/cloud-sql-monitoring?orgId=1&from=1765894812209&to=1765981212209&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-4&__feature.dashboardSceneSolo=true",
  },
  {
    title: "Cloud SQL panel 6",
    src: "http://localhost:3100/d-solo/06698db1-c460-4ef1-8b7e-3de5e019fd50/cloud-sql-monitoring?orgId=1&from=1765894812209&to=1765981212209&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-6&__feature.dashboardSceneSolo=true",
  },
  {
    title: "Cloud SQL panel 10",
    src: "http://localhost:3100/d-solo/06698db1-c460-4ef1-8b7e-3de5e019fd50/cloud-sql-monitoring?orgId=1&from=1765894812209&to=1765981212209&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-10&__feature.dashboardSceneSolo=true",
  },
  {
    title: "GCS panel 5",
    src: "http://localhost:3100/d-solo/05c3cd9b-1577-4bc8-9c64-2075d4c39c34/cloud-storage-monitoring?orgId=1&from=1765894818577&to=1765981218577&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-5&__feature.dashboardSceneSolo=true",
  },
  {
    title: "GCS panel 6",
    src: "http://localhost:3100/d-solo/05c3cd9b-1577-4bc8-9c64-2075d4c39c34/cloud-storage-monitoring?orgId=1&from=1765894818577&to=1765981218577&timezone=browser&var-datasource=P3BE906CE9E430760&var-project=ethereal-effort-475219-c2&var-alignmentPeriod=grafana-auto&panelId=panel-6&__feature.dashboardSceneSolo=true",
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-[1920px] mx-auto space-y-4">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="text-sm text-slate-600">
            Embedded Grafana panels (uses your local Grafana at localhost:3100). Ensure Grafana
            allows embedding and you are authenticated.
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {embeds.map((panel) => (
            <article
              key={panel.src + panel.title}
              className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-slate-100 text-sm font-semibold text-slate-700">
                {panel.title}
              </div>
              <div className="aspect-video min-h-[260px]">
                <iframe
                  title={panel.title}
                  src={panel.src}
                  className="w-full h-full"
                  frameBorder="0"
                  allowFullScreen
                />
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
