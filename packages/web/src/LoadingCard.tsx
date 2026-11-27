/** The loading line and spinner, on its own: over the dimmed Scene of the scan shown before. */
export function LoadingStatus() {
  return (
    <div role="status" className="loading-card">
      <span className="loading-spinner" aria-hidden="true" />
      <p>Loading the scan</p>
    </div>
  );
}

export function LoadingCard() {
  return (
    <main className="panel-main">
      <LoadingStatus />
    </main>
  );
}
