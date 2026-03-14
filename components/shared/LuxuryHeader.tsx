export default function LuxuryHeader() {
  return (
    <header className="fixed left-0 right-0 bg-black border-b border-gray-800 z-50 flex items-center justify-between px-3 md:px-4" style={{ height: '80px', top: 0 }}>
      <div className="flex items-center space-x-2 md:space-x-4">
        <img 
          src="/logo-white.png" 
          alt="Collective Realty Co." 
          className="md:hidden"
          style={{ width: '60px', height: '60px', objectFit: 'contain' }}
        />
        <img 
          src="/logo-white.png" 
          alt="Collective Realty Co." 
          className="hidden md:block"
          style={{ width: '120px', height: '120px', objectFit: 'contain' }}
        />
        <span className="text-white text-sm md:text-lg tracking-[0.2em] md:tracking-[0.25em]" style={{ fontFamily: 'Inter, Arial, sans-serif', fontWeight: '600' }}>
          COLLECTIVE AGENT
        </span>
      </div>
      <a 
        href="https://office.collectiverealtyco.com" 
        target="_blank"
        rel="noopener noreferrer"
        className="text-[11px] md:text-sm text-gray-300 hover:text-white transition-colors font-semibold"
        
      >
        Training Center
      </a>
    </header>
  )
}
