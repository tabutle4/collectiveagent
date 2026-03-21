'use client'

export default function FormSuccessPage() {
  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="card-section text-center py-12">
          <div className="mb-6">
            <svg
              className="w-16 h-16 mx-auto text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-light mb-4 tracking-luxury">Form Submitted Successfully!</h1>
          <p className="text-luxury-gray-2 mb-6">
            Thank you for submitting the form. The office will process your request shortly.
          </p>
          <p className="text-sm text-luxury-gray-2">You can close this window now.</p>
        </div>
      </div>
    </div>
  )
}
