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
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#f8fafc",
        color: "#0f172a",
        padding: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "1920px",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}>
            Admin Dashboard
          </h1>
          <p style={{ fontSize: "14px", color: "#475569", margin: 0 }}>
            Embedded Grafana panels (uses your local Grafana at localhost:3100). Ensure Grafana
            allows embedding and you are authenticated.
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "24px",
            width: "100%",
          }}
        >
          {embeds.map((panel, index) => (
            <article
              key={panel.src + panel.title}
              style={{
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                backgroundColor: "#ffffff",
                boxShadow: "0 1px 3px 0 rgba(0, 0, 0, 0.1)",
                overflow: "hidden",
                width: "100%",
                gridColumn: index === 6 ? "2 / 3" : "auto",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  borderBottom: "1px solid #f1f5f9",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#334155",
                }}
              >
                {panel.title}
              </div>
              <div
                style={{
                  aspectRatio: "16 / 9",
                  minHeight: "260px",
                  width: "100%",
                  position: "relative",
                }}
              >
                <iframe
                  title={panel.title}
                  src={panel.src}
                  style={{
                    width: "100%",
                    height: "100%",
                    border: "none",
                  }}
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
