export function LoadingCard() {
  return (
    <main className="panel-main">
      <div role="status" className="loading-card">
        <span className="loading-spinner" aria-hidden="true" />
        <p>Loading the scan</p>
      </div>
    </main>
  );
}
