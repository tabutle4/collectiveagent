// Route-level Suspense boundary. Without one, a client-side navigation into
// this page has nothing to render while the segment loads, so the transition
// never commits and the link appears dead. Matches the inline loading state
// the page itself uses once it is mounted.
export default function Loading() {
  return (
    <div className="min-h-screen bg-luxury-cream flex items-center justify-center text-luxury-gray-3">
      Loading…
    </div>
  )
}
