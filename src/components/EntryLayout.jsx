export default function EntryLayout({ children }) {
  return (
    <main className="entry-page">
      <div className="entry-content">
        <h1 className="entry-brand">寻常</h1>
        {children}
      </div>
    </main>
  )
}
